'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const clinical = require('../dist/clinical_evidence.js');
const charts = require('../dist/app.js');
const regimens = require('../dist/regimen_definitions.js');
const quantitative = require('../dist/quantitative_extraction.js');
const {rowKey} = require('../dist/outcome_reconciliation.js');
const {endpoints, endpointKey} = require('../dist/treatment_map_effects.js');
const {confidenceLevel} = require('../dist/confidence_intervals.js');
const cutoff = '2026-10-01';
const endpointPolarity = new Map(endpoints.map(e => [e.key, e.polarity]));
const authorBasis = 'Authors report statistical significance';
const endpointNames = new Map(endpoints.map(e => [e.endpoint, [e.endpoint, e.name]]));
endpointNames.set('EFS',['EFS','event-free survival']);
endpointNames.get('DSS').push('MSS','melanoma-specific survival');
endpointNames.get('ORR').push('overall response rate');
const endpointPatterns = new Map([...endpointNames].map(([code, names]) => [
  code, new RegExp('\\b(?:' + names.map(name => name.replace(/[^a-z0-9]+/gi, '[\\s-]+')).join('|') + ')\\b', 'i')
]));

function protectiveRatio(endpoint, measure, ratio) {
  const polarity = endpointPolarity.get(endpointKey({outcome:endpoint, measure})) ||
    (endpoint === 'EFS' && measure === 'HR' ? 'lower' : endpoint === 'CBR' && ['RR','OR'].includes(measure) ? 'higher' : null);
  return Number.isFinite(ratio) && ratio > 0 &&
    (polarity === 'lower' && ratio < Math.exp(-.3) || polarity === 'higher' && ratio > Math.exp(.3));
}

function reportedClaim(row, registry) {
  const q = row.quantitative_record;
  if (q.calculation || !Number.isFinite(q.estimate)) return null;
  const endpoint = endpointPatterns.get(q.endpoint);
  const measure = {HR:'HR|hazard ratio', RR:'RR|risk ratio|relative risk', OR:'OR|odds ratio'}[q.measure];
  if (!measure || !endpoint) return null;
  // A result-owned passage may discuss several effects. Require an affirmative
  // statement next to the same endpoint and a single matching measure and point.
  const point = new RegExp('\\b(?:' + measure + ')\\s*[:=]?\\s*(\\d*\\.?\\d+(?:e[+-]?\\d+)?)', 'gi');
  for (const id of row.evidence_ids || []) {
    const text = registry[id]?.supporting_quote || '';
    const clauses = text.split(/(?<=[.!?])\s+|;\s*|\b(?:whereas|while|but|and)\b/i);
    for (const clause of clauses) {
      if (!endpoint.test(clause) || [...endpointPatterns].some(([code, pattern]) => code !== q.endpoint && pattern.test(clause))) continue;
      if (!/\b(?:statistically significant\b|(?:was|were|remained) significant\b|significantly\s+(?:improv|increas|decreas|reduc|prolong|shorten|lower|higher|worse|better)|significant (?:improvement|increase|decrease|reduction|difference|association)\b)/i.test(clause)) continue;
      if (/\b(?:not|no|never|without|neither|failed|didn.t|non[- ]?significant|clinically|would|might|could|hypothes\w*|prespecified threshold|powered|defined as|considered|previous(?:ly)?|prior stud\w*|historically|interaction|trend)\b/i.test(clause)) continue;
      const points = [...clause.matchAll(point)];
      if (points.length === 1 && Number(points[0][1]) === q.estimate) return {basis:authorBasis, source_quote:clause.trim()};
    }
  }
  return null;
}

// Inequality p-values can be absent from the scalar extraction. Recover one
// only from the selected result's cited passage and its exact HR/RR/OR and CI.
function citedTest(row, registry) {
  const q = row.quantitative_record;
  const tuples = /\b(HR|OR|RR)\s*[:=]?\s*(\d*\.?\d+)\s*[,;(]\s*(\d+(?:\.\d+)?)\s*%\s*CI\s*[:,=]?\s*(\d*\.?\d+)\s*(?:to|[-–—])\s*(\d*\.?\d+)\s*[;,]\s*p\s*(<=|>=|[<=>≤≥])\s*(\d*\.?\d+(?:e[+-]?\d+)?)(?![\d.e])/gi;
  const tests = new Map();
  for (const id of row.evidence_ids || []) {
    const quote = registry[id]?.supporting_quote || '';
    for (const [, measure, point, level, low, high, op, p] of quote.matchAll(tuples)) {
      if (measure.toUpperCase() !== q.measure || +point !== q.estimate || +level !== confidenceLevel(q.ci_level) ||
          +low !== q.ci_lower || +high !== q.ci_upper) continue;
      tests.set(op + p, {operator:op, value:Number(p)});
    }
  }
  return tests.size === 1 ? [...tests.values()][0] : null;
}

function findingSignificance(row, registry = {}) {
  const q = row?.quantitative_record;
  if (!q || q.origin !== 'own_report') return null;
  const isRatio = ['HR','RR','OR'].includes(q.measure);
  const flagged = field => q.field_flags?.some(flag => flag.field === field || flag.field === 'row');
  if (flagged('estimate')) return null;
  const fact = row.p_value;
  const operators = {equal:'=', exact:'=', less_than:'<', less_or_equal:'≤', greater_than:'>', greater_or_equal:'≥'};
  let test;
  if (!flagged('p_value')) {
    if (fact?.status === 'reported' && Number.isFinite(fact.value)) {
      test = {operator:operators[fact.qualifier], value:fact.value};
    } else {
      test = q.calculation?.reported_comparison_test || (isRatio && citedTest(row, registry));
    }
  }
  let evidence;
  if (test) {
    const {value:p, operator:op} = test;
    if (!Number.isFinite(p) || p < 0 || p > 1) return null;
    if (op === '<' && p <= .05 || ['=', '≤', '<='].includes(op) && p < .05) {
      evidence = {basis:'p' + ({'<=':'≤','>=':'≥'}[op] || op) + p};
    } else if (['=', '>', '≥', '>='].includes(op) && p >= .05) return null;
  }
  const {estimate, ci_lower:low, ci_upper:high} = q;
  const reportedCI = isRatio && !q.calculation && !q.derived_ci && !['ci_level','ci_lower','ci_upper'].some(flagged) &&
    confidenceLevel(q.ci_level) === 95 && [low, high, estimate].every(Number.isFinite) &&
    0 <= low && low < high && low <= estimate && estimate <= high;
  if (!evidence && reportedCI && (high < 1 || low > 1)) evidence = {basis:'95% CI excludes 1'};
  if (!evidence && !reportedCI) evidence = reportedClaim(row, registry);
  if (!evidence) return null;
  const ratio = row.display_reversed ? 1 / q.estimate : q.estimate;
  return {...evidence, protective:row.contrast_type === 'treatment_comparison' && protectiveRatio(q.endpoint, q.measure, ratio)};
}

function inPeriod(date, through) {
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date || '')) return false;
  const lower = date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date;
  let upper = date;
  if (date.length === 4) upper = `${date}-12-31`;
  if (date.length === 7) {
    const [year,month] = date.split('-').map(Number);
    upper = new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  }
  return lower >= cutoff && upper <= through;
}
function readBytes(file) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  return zlib.gunzipSync(fs.readFileSync(file + '.gz'));
}
// A report can have a source-checked narrative finding without a numeric effect
// row. A sole treatment arm, or the arm explicitly bound to its displayed N,
// still identifies the treatment. Counts from other diseases cannot supply it.
function narrativeArm(study, group, registry) {
  if (group.intervention || (group.comparator && group.comparator !== '—')) return;
  const record = quantitative.records(study).at(-1);
  if (!record?.arms?.length) return;
  const single = record.study?.comparison_structure === 'single_group' && record.arms.length === 1;
  let arm = single ? record.arms[0] : null;
  if (!arm && group.samples.length === 1) {
    const n = Number(group.samples[0].sample_size);
    const counts = charts.reportedStudyCounts(study,null,registry).filter(sample =>
      sample.source_input_sha256 === record.source_sha256 && sample.n?.value === n);
    const ids = new Set(counts.map(sample => sample.quantitative_record?.arm_id));
    if (ids.size === 1) arm = record.arms.find(a => ids.has(a.id));
  }
  if (!arm || !arm.evidence?.length || arm.nodes.some(node => node.kind === 'UNKNOWN')) return;
  group.intervention = charts.conciseTreatmentLabel(quantitative.regimen(arm));
  if (single) group.comparator = 'No comparator';
}
function appendReportedFindings(groups, study, citation, reviewedResults, registry) {
  const findings = (citation.qualitative_findings || []).map(finding => ({...finding, basis:authorBasis}));
  for (const entry of reviewedResults) {
    const span = registry[entry.source_id];
    if (span?.source_id?.split(':')[0] === study.report_id && entry.source_quote &&
        span.supporting_quote?.includes(entry.source_quote)) findings.push(entry);
  }
  for (const entry of findings) {
    const group = entry.group || 'Reported outcome';
    const comparator = entry.comparator || '', intervention = entry.intervention || '', add_on = entry.add_on === true;
    let target = groups.find(g => g.group === group && (g.comparator || '') === comparator &&
      (g.intervention || '') === intervention && Boolean(g.add_on) === add_on);
    if (!target) {
      target = {group, comparator, intervention, add_on, samples:[], effects:[]};
      groups.push(target);
    }
    const existing = target.effects.find(e => e.endpoint === entry.endpoint && e.value === entry.value);
    if (existing?.significance) continue;
    const protective = entry.protective === true && protectiveRatio(entry.outcome, entry.measure, entry.ratio);
    const significance = {basis:entry.basis, protective, source_quote:entry.source_quote};
    if (existing) existing.significance = significance;
    else target.effects.push({endpoint:entry.endpoint, value:entry.value, significance});
  }
}

function isTrialReport(study, design, note) {
  if (!design.is_trial) return false;
  if (note?.report_design === 'secondary_predictor_analysis' && note.doi === study.doi) return false;
  // A secondary report can use an interventional trial's records retrospectively.
  // Restrict the title check to wording that describes this publication's design.
  const retrospective = /(?:^|[:.—–]\s*)(?:an?\s+)?(?:(?:multicent(?:er|re)|single[- ]cent(?:er|re)|international|matched|observational)\s+)*retrospective[\s,]+(?:(?:multicent(?:er|re)|international|observational|comparative|chart|medical record)\s+)*(?:analysis|study|review|cohort)\b/i;
  const record = quantitative.records(study).find(r => r.source_sha256 === design.source_sha256 && r.stage === design.source_stage);
  return !retrospective.test(study.title || '') && !retrospective.test(record?.study_details?.design_description || '');
}

function build(snapshot, catalogue, normalizations, reviewedResults = {}, sourceNotes = {}) {
  const through = String(snapshot.as_of || '').slice(0,10);
  const recent = (snapshot.clinical_evidence?.articles || []).filter(a =>
    a.current_screening_status === 'retain' && a.current_main_eligible && !a.publication_hold && inPeriod(catalogue[a.pmid]?.date, through));
  const rows = [];
  if (recent.length) {
    const merged = clinical.merge([], {}, {...snapshot.clinical_evidence, articles: recent});
    const records = new Map(snapshot.articles.map(a => [a.pmid, a.records]));
    const studies = merged.studies.map(study => ({...study, quantitative_only:true, details:{...study.details,
      quantitative_extraction:records.get(study.pmid), outcome_display_reconciliation:(snapshot.fulltext_assessment?.display_reconciliation||[]).filter(a=>String(a.pmid)===study.pmid)}}));
    const options = {registry:merged.evidence_registry, include_missing_n:true};
    const prepared = regimens.prepareStudies(studies,{normalizations, clinical_content_sha256:snapshot.clinical_evidence.content_sha256});
    for (const match of charts.filterStudies(prepared,{evidence_registry:merged.evidence_registry})) {
      const study = match.study, citation = catalogue[study.pmid];
      if (citation.report_id && citation.report_id !== study.report_id) throw new Error('Date catalogue disagrees with the current report identity');
      const trial = charts.studyTrialIdentifiers(study, options);
      const design = charts.studyDesignInfo(study);
      const sourceRows = new Map(match.results.map(row => [rowKey(row), row]));
      const groups = [];
      for (const contrast of charts.studyTablePresentationRows(match, options)) {
        const view = charts.studyTablePresentation({...match, ...contrast}, {
          ...options, phase_partition:contrast.phase_partition, presentation_cutoff:contrast.presentation_cutoff
        });
        const selections = new Map((view.outcome_reconciliation?.selections || []).map(s => [s.key, s.selected_source]));
        const effects = view.effects.filter(effect => effect.value && /\d/.test(effect.value)).map(effect => {
          const row = sourceRows.get(selections.get(effect.outcome_key));
          const significance = !effect.review_needed && findingSignificance(row, merged.evidence_registry);
          return {endpoint:effect.label, value:effect.value, ...(significance ? {significance} : {})};
        });
        groups.push({
          group:view.group, comparator:contrast.comparator_label, intervention:contrast.intervention_label,
          add_on:contrast.is_add_on === true, comparator_n:contrast.comparator_n, intervention_n:contrast.intervention_n,
          samples:view.samples, effects
        });
      }
      if (citation.abstract_note && groups.length === 1 && !groups[0].effects.length) {
        narrativeArm(study, groups[0], merged.evidence_registry);
      }
      const hasEffect = groups.some(group => group.effects.length);
      appendReportedFindings(groups, study, citation, reviewedResults[study.pmid] || [], merged.evidence_registry);
      rows.push({
        pmid:study.pmid, title:study.title, date:citation.date, date_basis:citation.date_basis,
        author:study.author_display || (study.first_author_surname ? study.first_author_surname + ' et al.' : ''),
        trial:trial.trial_label, nct:trial.nct_label, abstract_only:charts.abstractOnly(study),
        nontrial:design.is_non_trial, is_trial_report:isTrialReport(study, design, sourceNotes[study.pmid]), groups,
        ...(!hasEffect && citation.abstract_note ? {abstract_note:citation.abstract_note} : {})
      });
    }
  }
  rows.sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title));
  return {schema_version:2, cutoff, through, reports:rows};
}
function publish(root) {
  const directory = path.join(root, 'website/dist/data');
  const input = readBytes(path.join(directory, 'quantitative_extraction.json'));
  const snapshot = JSON.parse(input);
  const dates = path.join(root, 'website/config/new_findings_publication_dates.json');
  const catalogue = fs.existsSync(dates) ? JSON.parse(fs.readFileSync(dates)).citations : {};
  const normalizedFile = path.join(directory,'treatment_normalizations.json');
  const normalizations = fs.existsSync(normalizedFile) || fs.existsSync(normalizedFile+'.gz') ? JSON.parse(readBytes(normalizedFile)) : null;
  const reviews = path.join(root, 'website/config/new_findings_reviewed_results.json');
  const notes = path.join(root, 'website/config/new_findings_source_notes.json');
  const payload = build(snapshot,catalogue,normalizations,fs.existsSync(reviews) ? JSON.parse(fs.readFileSync(reviews)) : {},
    fs.existsSync(notes) ? JSON.parse(fs.readFileSync(notes)) : {});
  payload.source_file_sha256 = crypto.createHash('sha256').update(input).digest('hex');
  const out = path.join(directory,'new_findings.json');
  const tmp = `${out}.${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(payload)+'\n'); fs.renameSync(tmp,out);
  return {reports:payload.reports.length, source_file_sha256:payload.source_file_sha256};
}
module.exports={inPeriod,build,publish,findingSignificance,appendReportedFindings,isTrialReport};
if (require.main===module) console.log(publish(path.resolve(process.argv[2] || path.join(__dirname,'../..'))));
