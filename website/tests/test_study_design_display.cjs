'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const display=require('../dist/study_design_display.js');
const auditDir=path.join(__dirname,'../../data/audits/trial_groups_ui_20261108');
function actual(pmid){
 const data=JSON.parse(fs.readFileSync(path.join(auditDir,pmid+'_source_audit.json'),'utf8'));
 return {data,registry:data.evidence_registry,study:{report_id:data.clinical.report_id,pmid,comparisons:data.clinical.comparisons,details:{quantitative_extraction:data.article.records,quantitative_results:data.clinical.quantitative_results,sample_size_records:data.clinical.sample_size_records,fulltext_assessment:data.fulltext_assessment}}};
}
test('current explicit trial design includes the source-described S1616 correlative trial report',()=>{
 const {study}=actual('42013417'),before=JSON.stringify(study),info=display.designInfo(study);
 assert.equal(info.is_trial,true);assert.equal(info.is_non_trial,false);assert.equal(info.source_stage,'R3');assert.equal(display.abstractOnly(study),false);assert.equal(JSON.stringify(study),before);
});
test('ovarian-reserve ancillary cohort remains observational despite its E1609 trial identifier',()=>{
 const {study}=actual('41701163'),info=display.designInfo(study);
 assert.equal(info.is_trial,false);assert.equal(info.is_non_trial,true);assert.equal(info.source_stage,'R3');assert.equal(display.abstractOnly(study),false);
});
test('unknown study design cannot be inferred from a trial name, registration or randomized-looking title',()=>{
 const {study}=actual('41701163');for(const saved of study.details.quantitative_extraction)saved.record.study.study_type='NA';
 study.title='A randomized phase III trial';study.nct_id='NCT00000001';
 const info=display.designInfo(study);assert.equal(info.kind,'unknown');assert.equal(info.is_trial,false);assert.equal(info.is_non_trial,false);
});
test('current accepted design takes precedence, and an empty R3 field complements an explicit R2 field',()=>{
 const {study}=actual('42013417');study.details.quantitative_extraction[1].record.study.study_type='observational';assert.equal(display.designInfo(study).is_non_trial,true);
 study.details.quantitative_extraction[1].record.study.study_type='NA';assert.equal(display.designInfo(study).is_trial,true);assert.equal(display.designInfo(study).source_stage,'R2');
});
test('abstract-only marker follows accepted evidence use, not PMCID or source availability',()=>{
 const {study}=actual('42013417');study.details.quantitative_extraction=study.details.quantitative_extraction.filter(s=>s.stage==='R2');study.pmcid='PMC12345';
 assert.equal(display.abstractOnly(study),true);assert.equal(display.sourceInfo(study).has_fulltext,false);
 study.details.quantitative_extraction=[];assert.equal(display.abstractOnly(study),false);
});
test('unbound or unvalidated R3 does not remove an abstract-only marker or establish a trial design',()=>{
 for(const change of [s=>s.source_proof_ref=null,s=>s.record.validation.decision_valid=false,s=>s.record.validation.source_sha256='0'.repeat(64),s=>s.record.pmid='999']){
  const {study}=actual('41701163');change(study.details.quantitative_extraction[1]);assert.equal(display.abstractOnly(study),true);assert.equal(display.designInfo(study).source_stage,'R2');
 }
});
test('other outcomes expose exact source-bound result passages rather than invented structured effects',()=>{
 const {study,registry}=actual('41701163'),before=JSON.stringify({study,registry}),snippets=display.specialOutcomeDetails(study,{registry});
 assert(snippets.length);assert.equal(display.hasSpecialOutcomes(study,{registry}),true);
 const amh=snippets.find(row=>row.quote.includes('4.24 ng/mL'));assert(amh);assert(amh.quote.includes('3.51'));assert.equal(amh.stage,'R3');assert.equal(amh.block_id,'b00007');assert.equal(amh.quote,registry[amh.evidence_id].supporting_quote);
 assert(snippets.every(row=>row.source_id.startsWith(study.report_id+':')));assert.equal(JSON.stringify({study,registry}),before);
});
test('source passages cannot cross report, binding or compact outcome scope',()=>{
 const original=actual('41701163');
 for(const change of [d=>{for(const value of Object.values(d.registry))value.source_id='report-foreign:main:other';},d=>{for(const sample of d.study.details.sample_size_records)sample.review_binding_sha256='0'.repeat(64);},d=>{for(const saved of d.study.details.quantitative_extraction)saved.record.effects=[{endpoint:'overall_survival'}];}]){
  const data=structuredClone(original);change(data);assert.deepEqual(display.specialOutcomeDetails(data.study,{registry:data.registry}),[]);
 }
});
test('N-only descriptions, doses, plans and unsupported quotes do not become other outcome results',()=>{
 for(const quote of ['A total of 28 patients received ipilimumab 3 mg/kg.','We will investigate a mean AMH change of 3.5 ng/mL.','We obtained pre- and post-treatment serum samples from 8 patients.']){
  const {study,registry}=actual('41701163');for(const anchor of Object.values(registry))anchor.supporting_quote=quote;
  assert.deepEqual(display.specialOutcomeDetails(study,{registry}),[]);
 }
});
test('browser helper exposes the same pure presentation API without DOM access',()=>{
 const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../dist/study_design_display.js'),'utf8'),context);
 assert.equal(typeof context.StudyDesignDisplay.designInfo,'function');assert.equal(context.StudyDesignDisplay.abstractOnly({}),false);
});
