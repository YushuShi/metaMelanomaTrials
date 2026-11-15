'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),api=require('../dist/clinical_evidence.js');
const report='report-'+'1'.repeat(24),ns='a'.repeat(24),FLAGS=['clinical_validation','clinical_verified','pooling_eligible','report_R3_complete','final_R3_complete','numerical_extraction_complete','source_report_coverage_complete'];
function row(id='1',value=.8){return {result_id:`CE-${ns}-F-${id.repeat(16)}`,report_id:report,pmid:'123',measure:'HR',variable:'Overall survival association',contrast_type:'prognostic',model_id:'M1',model:{family:'Cox',estimand:'OS',contrast_type:'prognostic',adjusted_status:'unadjusted',variables:[]},population:{label:'Melanoma patients'},endpoint:{definition:{text:'Overall survival'}},cutoff:null,evidence_ids:['E'],reported_numbers:[{role:'estimate',status:'reported',value,raw_text:String(value),unit:'ratio',qualifier:'equal',evidence_ids:['E']}],main_result_eligible:true,validated:false,...Object.fromEntries(FLAGS.map(k=>[k,false]))};}
function payload(){return {schema_version:1,status:'ready',record_kind:'canonical_clinical_evidence',...Object.fromEntries(FLAGS.map(k=>[k,false])),evidence_registry:{E:{supporting_quote:'Melanoma overall survival HR 0.8.'}},articles:[{pmid:'123',report_id:report,title:'Melanoma study',year:2026,current_screening_status:'retain',current_main_eligible:true,publication_hold:false,decision_reason:'Eligible',quantitative_results:[row()],sample_size_records:[],comparisons:[],reviews:[]}]};}
function baseline(extra={}){const r={...row('9'),result_id:'saved-outcome'};return {pmid:'123',report_id:report,title:'Preserved title',default_visible:true,current_main_eligible:true,comparisons:[],details:{quantitative_results:[r],sample_size_records:[],canonical_result_groups:[{canonical_result_id:'G',representative_result_id:r.result_id,member_result_ids:[r.result_id]}]},...extra};}
test('PMID join preserves every existing object and coalesces proven identical source findings',()=>{
 const old=baseline(),before=JSON.stringify(old),incoming=payload();const out=api.merge([old],{E:incoming.evidence_registry.E},incoming);
 assert.equal(out.studies.length,1);assert.equal(JSON.stringify(old),before);assert.equal(out.studies[0].title,'Preserved title');
 assert.equal(out.studies[0].details.quantitative_results.length,2);assert.equal(out.studies[0].details.canonical_result_groups.length,1);assert.equal(out.studies[0].details.canonical_result_groups[0].member_result_ids.length,2);
});
test('retention of an article never promotes prior held/draft rows or patient context',()=>{
 const old=baseline({default_visible:false,current_main_eligible:false});old.details.sample_size_records=[{sample_record_id:'old-N',main_result_eligible:true,n:{value:16}}];const before=JSON.stringify(old),p=payload();
 const out=api.merge([old],{E:p.evidence_registry.E},p).studies[0];assert.equal(JSON.stringify(old),before);assert.equal(out.details.quantitative_results[0].main_result_eligible,false);assert.equal(out.details.quantitative_results[1].main_result_eligible,true);assert.equal(out.details.sample_size_records[0].main_result_eligible,false);
 assert.equal(out.details.canonical_result_groups.length,2);
});
test('effective exclude or unclear keeps history while suppressing main results',()=>{
 for(const status of ['exclude','unclear']){const p=payload();p.articles[0].current_screening_status=status;p.articles[0].current_main_eligible=false;
  const out=api.merge([baseline()],{E:p.evidence_registry.E},p).studies[0];assert.equal(out.default_visible,false);assert(out.details.quantitative_results.every(r=>r.main_result_eligible===false));assert.equal(out.details.quantitative_results.length,2);}
});
test('different model population cutoff and contrasts remain separate with no averaging',()=>{
 for(const change of [r=>r.model.adjusted_status='adjusted',r=>r.population.label='Melanoma subgroup',r=>r.cutoff={label:'Month24'},r=>r.contrast_type='biomarker_association',r=>r.reported_numbers[0].value=.9]){
  const p=payload();change(p.articles[0].quantitative_results[0]);const out=api.merge([baseline()],{E:p.evidence_registry.E},p).studies[0];assert.equal(out.details.canonical_result_groups.length,2);assert.equal(out.details.quantitative_results.length,2);
 }
});
test('a new PMID joins the same study collection without provider or expansion strata',()=>{
 const p=payload(),old=baseline({pmid:'456',report_id:'report-'+'2'.repeat(24),details:{quantitative_results:[],sample_size_records:[]}});const out=api.merge([old],{},p);assert.equal(out.studies.length,2);assert.deepEqual(out.studies.map(s=>s.pmid),['456','123']);
});
test('foreign report source IDs duplicate PMIDs and clinical certificates are refused',()=>{
 let p=payload();p.articles[0].quantitative_results[0].report_id='report-'+'2'.repeat(24);assert.throws(()=>api.merge([],{},p),/identity/);
 p=payload();p.articles[0].quantitative_results[0].pooling_eligible=true;assert.throws(()=>api.checked(p),/certification/);
 p=payload();p.articles.push(structuredClone(p.articles[0]));assert.throws(()=>api.checked(p),/Unique PMID/);
 p=payload();delete p.evidence_registry.E;assert.throws(()=>api.checked(p),/passage/);
});
