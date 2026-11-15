'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),groups=require('../dist/treatment_groups.js');
const labels=new Map(['ipilimumab','tremelimumab','nivolumab','pembrolizumab','dacarbazine'].map(x=>[x,x]));
const classValue=groups.classValue;
const comparison=(id,comparator,interest,extra={})=>({comparison_id:'C'+id,kind:'treatment_comparison',comparator_label:comparator,
  comparator_filter_eligible:true,comparison_filter_eligible:true,additional_intervention_ids:[interest],result_ids:['R'+id],...extra});
const study=(id,comparator,interest,extra={})=>({report_id:'report-'+id,default_visible:true,current_main_eligible:true,
  comparisons:[comparison(id,comparator,interest)],details:{quantitative_results:[{result_id:'R'+id,comparison_id:'C'+id,
    endpoint:{family:'overall_survival'},measure:'HR',estimate:{status:'reported',value:.8},main_result_eligible:true}]},...extra});

test('named agents and literal class labels use the verified oncology hierarchy',()=>{
  for(const x of ['Ipilimumab','Tremelimumab','Ipilimumab 3 mg/kg monotherapy','Ipilimumab(+placebo)','CTLA-4 inhibitor'])assert.equal(charts.treatmentClass(x).id,'ctla4');
  for(const x of ['Nivolumab','Pembrolizumab','Anti-PD1 agents','Anti-programmed cell death protein 1 immunotherapy'])assert.equal(charts.treatmentClass(x).id,'pd1');
  for(const [name,id] of [['Atezolizumab','pdl1'],['Relatlimab','lag3'],['Dabrafenib','braf'],['Trametinib','mek'],['Dacarbazine','chemotherapy'],['Autologous TIL infusion','cell-therapies'],['Preparative chemotherapy','chemotherapy'],['Adjuvant immunotherapy','immunotherapy'],['BRAF/MEK-targeted therapy','braf-mek-unspecified']])assert.equal(charts.treatmentClass(name).id,id,name);
  assert.equal(groups.groups.find(g=>g.id==='ctla4').label,'CTLA-4 inhibitors');
  for(const [name,id] of [['Interferon-alpha2a','cytokines'],['rhGM-CSF','cytokines'],['CSF-470 cellular vaccine','vaccines'],['Autologous melanoma vaccine','vaccines'],['Excision','surgery'],['ICB agents','ici-unspecified'],['Ceralasertib (AZD6738)','other-targeted']])assert.equal(charts.treatmentClass(name).id,id,name);
});
test('combinations alternatives unknown agents and procedures keep distinct classes',()=>{
  for(const x of ['Nivolumab + ipilimumab','Dabrafenib + trametinib'])assert.equal(charts.treatmentClass(x).id,'combinations');
  assert.equal(charts.treatmentClass('Nivolumab or pembrolizumab').id,'alternatives');
  assert.equal(charts.treatmentClass('Surgery alone / without immunotherapy').id,'surgery');
  assert.equal(charts.treatmentClass('SRS').id,'radiotherapy');
  assert.equal(charts.treatmentClass('No comparator').id,'no-comparator');
  for(const x of ['Unknown agent','Bispecifics','No nivolumab','gp100'])assert.equal(charts.treatmentClass(x).id,'other');
});
test('class filters match only source-linked comparer and additional-intervention leaves',()=>{
  const rows=[study(1,'Nivolumab','ipilimumab'),study(2,'Pembrolizumab','tremelimumab'),study(3,'Nivolumab','dacarbazine'),study(4,'Nivolumab + ipilimumab','tremelimumab')],before=JSON.stringify(rows);
  const selection={comparator:classValue('pd1'),intervention:classValue('ctla4'),treatment_labels:labels};
  assert.deepEqual(charts.filterStudies(rows,selection).flatMap(m=>m.results.map(r=>r.result_id)),['R1','R2','R4']);
  const choices=charts.constrainStudyChoices(rows,selection,'comparator');
  assert.equal(choices.selection.intervention,classValue('ctla4'));
  assert.deepEqual(choices.intervention_ids.sort(),['dacarbazine','ipilimumab','tremelimumab']);
  assert.equal(charts.filterStudies(rows,{...selection,comparator:classValue('combinations')})[0].study.report_id,'report-4');
  assert.equal(JSON.stringify(rows),before);
});
test('equivalent additional leaves merge source IDs without changing facts or shared background drugs',()=>{
  const ids=['ipilimumab','reported-arm-1','reported-arm-2'],names=new Map([...labels,['reported-arm-1','Ipilimumab 3 mg/kg monotherapy'],['reported-arm-2','Ipilimumab plus placebo']]);
  const rows=ids.map((id,i)=>study(i+1,'Nivolumab',id)),before=JSON.stringify(rows),entries=charts.additionalGroupLabels(ids,names);
  assert.equal(entries.size,1);assert.equal([...entries.values()][0],'Ipilimumab(+placebo)');
  assert.equal(charts.filterStudies(rows,{intervention:[...entries.keys()][0],treatment_labels:names}).length,3);
  assert.equal(charts.filterStudies(rows,{intervention:classValue('pd1'),treatment_labels:names}).length,0);
  assert.equal(JSON.stringify(rows),before);
});
test('unresolved comparers cannot acquire a comparer class from an empty label',()=>{
  const row=study(1,'','ipilimumab');row.comparisons[0].comparator_filter_eligible=false;
  assert.equal(charts.filterStudies([row],{comparator:classValue('other'),treatment_labels:labels}).length,0);
  assert.equal(charts.filterStudies([row],{intervention:classValue('ctla4'),treatment_labels:labels}).length,1);
});
test('endpoint defaults use HR for survival and recurrence and RR for ORR and adverse events',()=>{
  for(const endpoint of ['overall_survival','progression_free_survival','recurrence','recurrence_free_survival'])assert.equal(charts.defaultEffectMeasure(endpoint,{endpoint_type:'unknown'}),'HR');
  for(const endpoint of ['response','orr','adverse_events'])assert.equal(charts.defaultEffectMeasure(endpoint),'RR');
});
test('ORR shows reported percentages and comparative RRs without converting other responses or ratios',()=>{
  const base={endpoint:{family:'response',definition:{text:'Objective response rate'}},main_result_eligible:true};
  const rows=[{...base,measure:'response_probability',estimate:{status:'reported',value:40,raw_text:'40%',unit:'percent'}},
    {...base,measure:'RR',estimate:{status:'reported',value:1.2,unit:'ratio'}},
    {...base,measure:'OR'}, {...base,measure:'response_probability',endpoint:{family:'response',definition:{text:'Complete response rate'}}}];
  const before=JSON.stringify(rows),selection={endpoint:'response',measure:'RR',include_orr:true,orr_only:true};
  assert.deepEqual(rows.map(row=>charts.resultMatches(row,selection)),[true,true,false,false]);
  assert.equal(charts.displayMeasure(rows[0]),'ORR');assert.equal(charts.displayMeasure(rows[1]),'RR');
  assert.equal(charts.displayEndpointFamily({...rows[1],endpoint:{family:null,definition:{text:'ORR'}}}),'response');
  assert.equal(charts.resultMatches({endpoint:{family:'recurrence'},measure:'event_probability'},{endpoint:'recurrence',measure:'HR'}),false);
  assert.equal(JSON.stringify(rows),before);
});
