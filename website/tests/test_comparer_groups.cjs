'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js');
const comparison=(label,extra={})=>({kind:'treatment_comparison',comparator_label:label,
  comparator_key:'reported-arm-'+label,comparator_drug_ids:[],comparison_filter_eligible:true,
  comparator_filter_eligible:true,...extra});
const key=(label)=>charts.comparatorKey(comparison(label));

test('explicit passive comparers share one category while unspecified standard care stays unresolved',()=>{
  const labels=['Best supportive care','Observation','Placebo',
    'Placebo group','Placebo every 3 weeks','Best supportive care (BSC)'];
  assert.equal(new Set(labels.map(key)).size,1);
  for(const label of labels)assert.equal(charts.comparatorDisplayLabel(comparison(label)),
    'Best supportive care / observation / placebo');
  for(const label of ['Standard care','Standard-of-care','Observation / standard care'])assert.notEqual(key(label),key('Placebo'));
});
test('drug plus placebo has the same browse identity but an explicit optional-placebo label',()=>{
  for(const label of ['Carboplatin + placebo','carboplatin plus placebo','Matching placebo plus carboplatin']){
    assert.equal(key(label),key('Carboplatin'));
    assert.equal(charts.comparatorDisplayLabel(comparison(label)),'Carboplatin(+placebo)');
  }
  assert.equal(key('Dabrafenib'),charts.comparatorKey(comparison('Dabrafenib monotherapy (dabrafenib plus placebo)',{comparator_drug_ids:['dabrafenib']})));
});
test('alone monotherapy and dose variants agree across opaque source keys and drug-ID metadata',()=>{
  const labels=['Ipilimumab','ipilimumab alone','ipilimumab monotherapy','ipilimumab 3mg/kg monotherapy',
    'ipilimumab 10 mg/kg every 3 weeks','ipilimumab 3 mg/kg (q3w)','Ipilimumab 10 mg/kg alone',
    'Ipilimumab 3 mg/kg every 3 weeks for four doses'];
  assert.equal(new Set(labels.map(key)).size,1);
  assert.equal(key('ipilimumab'),charts.comparatorKey(comparison('Ipilimumab 3mg/kg monotherapy',{comparator_drug_ids:['ipilimumab']})));
});
test('dose units are removed without erasing numeric drug names',()=>{
  for(const label of ['Dacarbazine 1000 mg/m²','Dacarbazine 1000 mg/m2','Dacarbazine 1000 mg&#47;m2'])
    assert.equal(key(label),key('Dacarbazine'));
  for(const drug of ['IL-2','IFNα-2b','gp100','MELITAC12.1','CNI-1493'])
    assert.equal(key(drug+' 3 mg/kg monotherapy'),key(drug));
  for(const label of ['IFNα-2b 20 million IU/m² three times weekly','IFNα-2b 20 MU/m²'])
    assert.equal(key(label),key('IFNα-2b'));
});
test('named matching placebo is inactive, and all real active components remain',()=>{
  assert.equal(key('Ipilimumab plus nivolumab-matched placebo'),key('Ipilimumab'));
  assert.equal(key('Gp100 peptide vaccine plus ipilimumab placebo'),key('Gp100 peptide vaccine'));
  assert.notEqual(key('Gp100 peptide vaccine plus ipilimumab placebo'),key('Ipilimumab'));
  assert.equal(key('nivolumab 3mg/kg + ipilimumab 1mg/kg'),key('ipilimumab + nivolumab'));
  assert.notEqual(key('ipilimumab + nivolumab'),key('ipilimumab'));
  assert.notEqual(key('nivolumab or pembrolizumab'),key('nivolumab + pembrolizumab'));
  for(const label of ['Nivolumab + ipilimumab','Nivolumab + peptide vaccine'])
    assert.equal(charts.comparatorKey(comparison(label,{comparator_drug_ids:['nivolumab']})),key(label));
  assert.equal(charts.comparatorKey(comparison('Nivolumab, ipilimumab',{comparator_drug_ids:['nivolumab']})),key('Nivolumab + ipilimumab'));
  assert.equal(charts.comparatorKey(comparison('Cisplatin, vinblastine and dacarbazine alone',
    {comparator_drug_ids:['cisplatin','dacarbazine']})),key('cisplatin + vinblastine + dacarbazine'));
});
test('active standard care and mixed-regimen descriptions are not passive control',()=>{
  for(const label of ['Standard-of-care comparator: high-dose IFNα-2b or ipilimumab',
    'Standard care alone during checkpoint inhibitor treatment',
    'Group A: high-dose IL-2 with standard supportive measures'])assert.notEqual(key(label),key('Placebo'));
  assert.notEqual(key('surgery + nivolumab'),key('nivolumab'));
  const background=comparison('Placebo during high-dose intravenous IL-2');
  assert.notEqual(charts.comparatorKey(background),key('Placebo'));
  assert.match(charts.comparatorDisplayLabel(background),/Interleukin-2 therapy, product unspecified\(\+placebo\)/);
});
test('surgery alone and surgery without IO form their own category',()=>{
  const labels=['Surgery','Surgery alone','Surgery only, without immunotherapy',
    'Surgery without immune checkpoint inhibition','Surgery without ICI'];
  assert.equal(new Set(labels.map(key)).size,1);
  for(const label of ['Surgery plus nivolumab','Surgery with immunotherapy','SRS without immunotherapy',
    'Radiosurgery','Cryosurgery'])assert.notEqual(key(label),key('Surgery alone'));
  assert.notEqual(key('Surgery alone'),key('Observation'));
});
test('unknown and single-arm records keep their existing eligibility boundaries',()=>{
  assert.equal(charts.comparatorKey(comparison('Placebo',{comparator_filter_eligible:false})), '');
  assert.equal(charts.comparatorKey(comparison('Placebo',{kind:'single_arm'})), '__single_arm__');
  assert.notEqual(charts.comparatorKey(comparison('No comparator',{kind:'single_arm'})),key('Placebo'));
  assert.equal(charts.comparatorKey({comparator_key:'placebo',comparator_drug_ids:[]}),key('Placebo'));
});
test('merged labels are deterministic in either order and do not mutate the saved rows',()=>{
  const rows=[comparison('Carboplatin'),comparison('Carboplatin plus placebo')],before=JSON.stringify(rows);
  assert.equal(charts.comparatorGroupLabels(rows).get(key('Carboplatin')),'Carboplatin(+placebo)');
  assert.deepEqual([...charts.comparatorGroupLabels(rows)],[...charts.comparatorGroupLabels([...rows].reverse())]);
  assert.equal(JSON.stringify(rows),before);
});
test('harmonized controls retain exact linked results and mutually constrained interventions',()=>{
  const labels=['Placebo','Observation','Standard care','Ipilimumab 3mg/kg monotherapy','Ipilimumab alone'];
  const studies=labels.map((label,i)=>({report_id:'report-'+String(i+1).padStart(24,'0'),title:'Study '+i,
    default_visible:true,current_main_eligible:true,comparisons:[comparison(label,{comparison_id:'C'+i,
      additional_intervention_ids:['interest-'+i],result_ids:['R'+i]})],details:{quantitative_results:[{
        result_id:'R'+i,comparison_id:'C'+i,endpoint:{family:'response'},display_measure:'ORR',
        estimate:{status:'reported',value:50},main_result_eligible:true,pooling_eligible:false}]}}));
  const before=JSON.stringify(studies),matched=charts.filterStudies(studies,{comparator:key('Placebo')});
  assert.deepEqual(matched.flatMap(m=>m.results.map(r=>r.result_id)),['R0','R1']);
  assert.deepEqual(charts.filterStudies(studies,{comparator:key('Standard care')}).flatMap(m=>m.results.map(r=>r.result_id)),['R2']);
  const choices=charts.constrainStudyChoices(studies,{comparator:key('ipilimumab')});
  assert.deepEqual(choices.intervention_ids,['interest-3','interest-4']);
  assert.equal(charts.filterStudies(studies,{comparator:key('ipilimumab'),intervention:'interest-0'}).length,0);
  assert.equal(JSON.stringify(studies),before);
});
