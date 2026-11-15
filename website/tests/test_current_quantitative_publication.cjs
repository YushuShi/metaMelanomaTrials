'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const compact = require('../dist/quantitative_extraction.js');
const charts = require('../dist/app.js');
const regimens = require('../dist/regimen_definitions.js');
const about = require('../dist/about_article_progress.js');

// Unlike the fixed example regressions, these checks follow the active release.
const snapshotPath = process.env.METAMELANOMA_UI_TEST_SNAPSHOT || path.join(__dirname, '../dist/data/quantitative_extraction.json');
const payload = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const sorted = values => [...values].sort();
let merged, matches;
function main() {
  if (!merged) {
    merged = compact.merge([], {}, payload);
    matches = charts.filterStudies(regimens.prepareStudies(merged.studies), {evidence_registry: merged.evidence_registry});
  }
  return {merged, matches};
}

function parseCSV(csv) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && c === ',') { row.push(field); field = ''; }
    else if (!quoted && (c === '\r' || c === '\n')) {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  assert.equal(quoted, false, 'CSV has an unterminated quoted field');
  if (row.length || field) { row.push(field); rows.push(row); }
  return rows;
}

test('current publication has disjoint completed, pending and source-held R2 scope with matching About counts', () => {
  compact.checked(payload);
  assert.equal(payload.mode, 'pilot');
  assert.equal(payload.publication_ready, true);
  const decisions = {retain: 0, exclude: 0, unclear: 0};
  const clinical = new Map(payload.clinical_evidence.articles.map(article => [article.pmid, article]));
  const pending = payload.pending_reports || [];
  const pendingStates = new Set(['pending', 'retry_wait', 'running', 'not_sent', 'held_unknown_send', 'validation_hold', 'provider_hold', 'held_integrity']);
  const completed = new Set(payload.scope_pmids);
  assert.equal(completed.size, payload.scope_pmids.length);
  assert.deepEqual(sorted(clinical.keys()), sorted(completed));
  for (const report of pending) {
    assert(pendingStates.has(report.state), `Invalid pending technical state: ${report.state}`);
    assert.equal(typeof report.entered, 'boolean');
    assert.equal(typeof report.task_id, 'string');
    assert(report.task_id.length > 0);
    assert(Number.isInteger(report.attempt_count) && report.attempt_count >= 0);
    assert(!completed.has(report.pmid));
    assert(!clinical.has(report.pmid), 'Pending reports must not import an older clinical decision');
    assert(!Object.hasOwn(report, 'decision') && !Object.hasOwn(report, 'current_screening_status'));
  }
  const unclear = [];
  for (const article of payload.articles) {
    assert(article.records.length===1||payload.fulltext_assessment&&article.records.length===2);
    const saved = article.records[0], decision = saved.record.decision;
    assert.equal(saved.stage, 'R2');
    assert(Object.hasOwn(decisions, decision.status));
    decisions[decision.status]++;
    assert.equal(clinical.get(article.pmid).current_screening_status, article.records.at(-1).record.decision.status);
    if (decision.status === 'unclear') unclear.push(article.pmid);
  }
  const progress = about.stageView(payload.about_progress.stages.R2, 'R2');
  assert.equal(progress.entered, payload.scope_pmids.length + pending.filter(report => report.entered).length);
  assert.equal(progress.screening_finished, payload.scope_pmids.length);
  assert.deepEqual([progress.retained, progress.excluded, progress.unclear], [decisions.retain, decisions.exclude, decisions.unclear]);
  assert.deepEqual(sorted(progress.unclear_reports.map(row => row.pmid)), sorted(unclear));
  assert.deepEqual(payload.about_progress.stage_scope, payload.fulltext_assessment?['R2','R3']:['R2']);
  if(payload.fulltext_assessment){
    const r3=payload.articles.flatMap(a=>a.records.filter(r=>r.stage==='R3'));
    const progress3=about.stageView(payload.about_progress.stages.R3,'R3');
    assert.equal(progress3.screening_finished,r3.length);
    assert.equal(progress3.entered,payload.fulltext_assessment.reports.filter(r=>r.entered).length);
    assert.deepEqual([progress3.retained,progress3.excluded,progress3.unclear],['retain','exclude','unclear'].map(status=>r3.filter(r=>r.record.decision.status===status).length));
  }
  assert.doesNotThrow(() => about.render(payload.about_progress));
  if (payload.authorized_scope_pmids) {
    const authorized = new Set(payload.authorized_scope_pmids);
    const holds = (payload.source_availability_holds || []).map(row => row.pmid);
    const pendingPMIDs = pending.map(row => row.pmid);
    assert.equal(authorized.size, payload.authorized_scope_pmids.length);
    assert.equal(new Set(holds).size, holds.length);
    assert.equal(new Set(pendingPMIDs).size, pendingPMIDs.length);
    assert(holds.every(pmid => authorized.has(pmid) && !completed.has(pmid)));
    assert(pendingPMIDs.every(pmid => authorized.has(pmid) && !holds.includes(pmid)));
    assert.deepEqual(sorted([...completed, ...holds, ...pendingPMIDs]), sorted(authorized));
    assert.equal(payload.scope_kind, pending.length ? 'r2_cohort_in_progress' : holds.length ? 'r2_cohort_with_source_holds' : 'complete_r2_cohort');
  }
});

test('current eligibility layer contains exactly retained articles without publication holds', () => {
  const {matches} = main();
  const eligible = payload.clinical_evidence.articles.filter(article => article.current_screening_status === 'retain' && !article.publication_hold);
  assert.deepEqual(sorted(matches.map(match => match.study.pmid)), sorted(eligible.map(article => article.pmid)));
  assert.equal(new Set(matches.map(match => match.study.pmid)).size, matches.length);
});

test('main table and CSV contain exactly visible known-N cohorts while missing-N articles remain in evidence', () => {
  const {merged, matches} = main(), registry = merged.evidence_registry;
  const visible = charts.visibleStudyMatches(matches, {registry});
  const visiblePMIDs = new Set(visible.map(match => match.study.pmid));
  const hidden = matches.filter(match => !visiblePMIDs.has(match.study.pmid));
  for (const match of hidden) {
    assert.deepEqual(charts.studyTablePresentationRows(match, {registry}), []);
    assert(merged.studies.some(study => study.pmid === match.study.pmid));
    assert(compact.records(match.study).length > 0, 'Hidden display rows must retain the source extraction');
  }
  for (const match of visible) {
    const groups = match.presentation_rows;
    assert(groups.length > 0, match.study.pmid);
    for (const group of groups) {
      const view = charts.studyTablePresentation({...match, ...group}, {registry, phase_partition: group.phase_partition, presentation_cutoff: group.presentation_cutoff});
      assert(view.samples.length > 0 || charts.hasPairedArmCounts(group), match.study.pmid);
      if(charts.hasPairedArmCounts(group)){
        const sources=new Set(group.comparisons.map(comparison=>comparison.scope?.source_input_sha256));
        for(const side of ['comparator','intervention']){
          const n=group[side+'_n'],arm=group[side+'_arm_id'];assert(Number.isInteger(n)&&n>=0);
          assert(match.study.details.sample_size_records.some(sample=>sources.has(sample.source_input_sha256)&&sample.quantitative_record?.arm_id===arm&&sample.n?.value===n),match.study.pmid+' '+side+' N must have its own source-bound count');
        }
        if(Number.isInteger(group.total_n))assert(match.study.details.sample_size_records.some(sample=>sources.has(sample.source_input_sha256)&&sample.n?.value===group.total_n&&['NA',null,undefined].includes(sample.quantitative_record?.arm_id)),match.study.pmid+' total must be stored, never invented for display');
      }
      for (const sample of view.samples) {
        assert.equal(typeof sample.sample_size, 'string');
        assert.doesNotMatch(sample.sample_size, /undefined|NaN|Infinity|\bNA\b/);
      }
      for (const effect of view.effects) {
        assert.equal(typeof effect.value, 'string');
        assert.doesNotMatch(effect.value, /undefined|NaN|Infinity/);
      }
    }
  }
  const rows = parseCSV(charts.studyTableCSV(matches, {registry}));
  assert.equal(rows[0][3], 'PMID');
  assert.equal(rows[0][6], 'Group');
  assert.equal(rows[0][10], 'Sample size');
  assert.equal(rows[0][11], 'Effect size (CI)');
  assert(rows.slice(1).every(row => row.length === rows[0].length));
  // A regimen can legitimately contain an unresolved component labelled NA;
  // the sample values themselves were checked above independently of labels.
  assert(rows.slice(1).every(row => row[10] && !/undefined|NaN|Infinity/.test(row[10]) && row[10] !== 'NA'));
  assert.equal(rows.length - 1, visible.reduce((sum, match) => sum + match.presentation_rows.length, 0));
  assert.deepEqual(sorted(new Set(rows.slice(1).map(row => row[3]))), sorted(visiblePMIDs));
  assert(rows.slice(1).every(row => matches.some(match => match.study.pmid === row[3])), 'CSV cannot introduce a foreign or ineligible PMID');
});
