'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js');
const audit=path.join(__dirname,'../../data/proposed_changes/labels_trials_wald_20261106');
function bundle(prefix){const names=fs.readdirSync(audit).filter(name=>name.startsWith(prefix)&&name.endsWith('.json'));assert.equal(names.length,1);return JSON.parse(fs.readFileSync(path.join(audit,names[0]),'utf8'));}
function actual(){const b=bundle('PUBLIC_STUDIES_FOUR_CASES_'),c=bundle('PUBLIC_ARTICLES_FOUR_CASES_');const payload={...c,schema_version:1,status:'ready',record_kind:'canonical_clinical_evidence'};for(const key of ['clinical_validation','clinical_verified','pooling_eligible','report_R3_complete','final_R3_complete','numerical_extraction_complete','source_report_coverage_complete'])payload[key]=false;return clinical.merge(b.studies,b.evidence_registry,payload);}
test('actual merged E1609 identifiers appear in table CSV while its repeated 95.6% CI stays reported',()=>{
 const merged=actual(),study=merged.studies.find(s=>s.pmid==='31880964'),before=JSON.stringify(study),registry=merged.evidence_registry;
 const trial=charts.studyTrialIdentifiers(study,{registry});assert.equal(trial.trial_label,'E1609');assert.equal(trial.nct_label,'NCT01274338');
 const match=charts.filterStudies([study],{endpoint:'overall_survival',measure:'HR',evidence_registry:registry});assert.equal(match.length,1);
 const csv=charts.studyTableCSV(match,{registry});assert.match(csv,/"Trial name","NCT number"/);assert.match(csv,/"E1609","NCT01274338"/);assert.match(csv,/0\.78 \(0\.61–0\.99; 95\.6 % CI\)/);assert.doesNotMatch(csv,/derived 95%/);assert.equal(JSON.stringify(study),before);
});
test('indirect-comparison source trials remain explicit after the actual clinical merge',()=>{
 const merged=actual(),study=merged.studies.find(s=>s.pmid==='41971757'),before=JSON.stringify(study),registry=merged.evidence_registry;
 const trial=charts.studyTrialIdentifiers(study,{registry});assert.match(trial.trial_label,/^Source trials: /);
 for(const name of ['RELATIVITY-047','COMBI-d','COMBI-v','COLUMBUS','coBRIM','IMspire150'])assert(trial.names.includes(name));
 assert.equal(trial.nct_label,'NA');assert.equal(JSON.stringify(study),before);
});
test('unreported trial identifiers stay NA and are not guessed from drugs or malignancy',()=>{
 const study={title:'Nivolumab and ipilimumab for melanoma',pmid:'111',details:{citation:{abstract:'A treatment trial with encouraging results.'}}};
 assert.equal(charts.studyTrialIdentifiers(study).trial_label,'NA');assert.equal(charts.studyTrialIdentifiers(study).nct_label,'NA');
});
