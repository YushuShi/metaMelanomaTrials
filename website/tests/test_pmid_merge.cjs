'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),charts=require('../dist/app.js');
const rid='report-000000000000000000000001';
const result=(id)=>({report_id:rid,result_id:id,estimate:{status:'reported',value:0,raw_text:'0',unit:'ratio'},measure:'HR',endpoint:{family:'overall_survival'}});
const study=(extra={})=>({report_id:rid,default_visible:true,comparisons:[],details:{quantitative_results:[result('Cornell'),result('native')]},...extra});
test('exact source duplicate aliases render once and preserve both originals without transport preference',()=>{
 const raw=study();raw.details.canonical_result_groups=[{representative_result_id:'Cornell',canonical_result_id:'X',member_result_ids:['Cornell','native']}];const before=JSON.stringify(raw);
 const rows=charts.studyResults(raw);assert.equal(rows.length,1);assert.equal(rows[0].estimate.value,0);assert.deepEqual(rows[0].source_extraction_ids,['Cornell','native']);assert.equal(JSON.stringify(raw),before);
 raw.comparisons=[{comparison_id:'C',comparator_key:'placebo',comparator_drug_ids:[],additional_intervention_drug_ids:['drug'],result_ids:['native']}];
 assert.equal(charts.filterStudies([raw],{comparator:charts.comparatorKey({comparator_label:'Placebo'})})[0].results.length,1);
});
test('unproven distinct scopes remain separate; invalid alias coverage fails closed',()=>{
 assert.equal(charts.studyResults(study()).length,2);
 for(const groups of [[{representative_result_id:'Cornell',member_result_ids:['Cornell']}],[{representative_result_id:'bad',member_result_ids:['Cornell','native']}],[{representative_result_id:'Cornell',member_result_ids:['Cornell','native','native']}]]){
  const s=study();s.details.canonical_result_groups=groups;assert.throws(()=>charts.studyResults(s));
 }
});
test('excluded or retracted article keeps source history but no current numbers/count fallback/filter choices',()=>{
 const s=study({current_main_eligible:false});s.details.sample_size_records=[{n:{status:'reported',value:99},role:'randomized'}];s.comparisons=[{comparison_id:'C',comparator_key:'placebo',additional_intervention_drug_ids:['drug'],result_ids:['Cornell']}];
 assert.equal(charts.studyResults(s).length,2);assert.equal(charts.filterStudies([s]).length,0);const m=charts.filterStudies([s],{include_history:true});assert.equal(m.length,1);assert.equal(m[0].results.length,0);assert.equal(m[0].comparisons.length,0);assert.equal(charts.reportedStudyCounts(s).length,0);assert.equal(charts.filterStudies([s],{intervention:'drug'}).length,0);
});

test('publication versions and historical screening status are visible without provider-based labels',()=>{assert.equal(charts.articleStatusLabel({current_main_eligible:false,current_screening_status:'exclude'}),'Historical · currently excluded');assert.equal(charts.articleStatusLabel({current_main_eligible:true}),'');assert.equal(charts.articleStatusLabel({publication_integrity:{retracted_or_notice:true,label:'Retracted publication version · historical evidence only'}}),'Retracted publication version · historical evidence only');});

test('screening history is an explicit off-by-default article setting, never an eligibility upgrade',()=>{const active=study({current_main_eligible:true}),historical=study({report_id:'report-000000000000000000000002',current_main_eligible:false});assert.equal(charts.filterStudies([active,historical]).length,1);const all=charts.filterStudies([active,historical],{include_history:true});assert.equal(all.length,2);assert.equal(all.find(m=>m.study===historical).results.length,0);});
