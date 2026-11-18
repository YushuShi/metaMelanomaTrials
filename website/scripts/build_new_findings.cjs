'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const clinical = require('../dist/clinical_evidence.js');
const charts = require('../dist/app.js');
const regimens = require('../dist/regimen_definitions.js');
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
      const findings = [];
      const seen = new Set();
      for (const contrast of charts.studyTablePresentationRows(match, options)) {
        const view = charts.studyTablePresentation({...match,...contrast},{...options,phase_partition:contrast.phase_partition});
        for (const effect of view.effects) {
          if (!effect.value || /^(NA|Details|Review needed|—)$/i.test(effect.value) || !/\d/.test(effect.value)) continue;
          const arms = [contrast.comparator_label,contrast.intervention_label].filter(x=>x && !/^(No comparator|NA|—)$/i.test(x));
          // Presentation rows describe intervention and comparator. Preserve the contrast
          // orientation and the distinction between an add-on and a parallel intervention.
          const regimen = arms.length === 2 ? (contrast.is_add_on ? `${arms[0]} + ${arms[1]} vs ${arms[0]}` : `${arms[1]} vs ${arms[0]}`) : arms[0] || '';
          const result = {group:view.group || '', regimen, endpoint:effect.label, value:effect.value};
          const key = JSON.stringify(result);
          if (!seen.has(key)) { seen.add(key); findings.push(result); }
        }
      }
      rows.push({pmid:study.pmid, title:study.title, date:citation.date, date_basis:citation.date_basis, findings,
        ...(!findings.length && citation.abstract_note ? {abstract_note:citation.abstract_note} : {})});
    }
  }
  rows.sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title));
  return {schema_version:1, cutoff, through, reports:rows};
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
