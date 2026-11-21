'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const clinical = require('../dist/clinical_evidence.js');
const charts = require('../dist/app.js');
const regimens = require('../dist/regimen_definitions.js');
const quantitative = require('../dist/quantitative_extraction.js');
const cutoff = '2026-10-01';

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
function build(snapshot, catalogue, normalizations) {
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
      const groups = [];
      for (const contrast of charts.studyTablePresentationRows(match, options)) {
        const view = charts.studyTablePresentation({...match, ...contrast}, {
          ...options, phase_partition:contrast.phase_partition, presentation_cutoff:contrast.presentation_cutoff
        });
        const effects = view.effects.filter(effect => effect.value && /\d/.test(effect.value))
          .map(effect => ({endpoint:effect.label, value:effect.value}));
        groups.push({
          group:view.group, comparator:contrast.comparator_label, intervention:contrast.intervention_label,
          add_on:contrast.is_add_on === true, comparator_n:contrast.comparator_n, intervention_n:contrast.intervention_n,
          samples:view.samples, effects
        });
      }
      if (citation.abstract_note && groups.length === 1 && !groups[0].effects.length) {
        narrativeArm(study, groups[0], merged.evidence_registry);
      }
      rows.push({
        pmid:study.pmid, title:study.title, date:citation.date, date_basis:citation.date_basis,
        author:study.author_display || (study.first_author_surname ? study.first_author_surname + ' et al.' : ''),
        trial:trial.trial_label, nct:trial.nct_label, abstract_only:charts.abstractOnly(study),
        nontrial:charts.studyDesignInfo(study).is_non_trial, groups,
        ...(!groups.some(group => group.effects.length) && citation.abstract_note ? {abstract_note:citation.abstract_note} : {})
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
  const payload = build(snapshot,catalogue,normalizations);
  payload.source_file_sha256 = crypto.createHash('sha256').update(input).digest('hex');
  const out = path.join(directory,'new_findings.json');
  const tmp = `${out}.${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(payload)+'\n'); fs.renameSync(tmp,out);
  return {reports:payload.reports.length, source_file_sha256:payload.source_file_sha256};
}
module.exports={inPeriod,build,publish};
if (require.main===module) console.log(publish(path.resolve(process.argv[2] || path.join(__dirname,'../..'))));
