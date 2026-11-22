'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const studies=require('../dist/app.js'), indirect=require('../dist/study_indirect.js');
const evidence=require('../dist/treatment_network_evidence.js');
const groups=require('../dist/treatment_groups.js');

const nivo={node_id:'agent:nivolumab',label:'Nivolumab'};
const ipi={node_id:'agent:ipilimumab',label:'Ipilimumab'};
const pembro={node_id:'agent:pembrolizumab',label:'Pembrolizumab'};
const combined={node_id:'regimen:combo',label:'Nivolumab + Ipilimumab'};
const sequential={...combined,network_regimen_id:'sequence:maintenance',network_regimen_label:'Nivolumab + Ipilimumab → Nivolumab'};
function record(id,intervention,comparator,estimate,fields={}) {
  return {id,pmid:String(id),study_name:'Trial '+id,intervention,comparator,outcome:'OS',measure:'HR',estimate,
    ci_lower:estimate*.8,ci_upper:estimate*1.25,ci_level:95,
    analysis:{independent_id:'trial:'+id,independence_verified:true,design:'randomized_trial',
      compatibility:{eligible:true},cohort:{id:id+'|all',root_id:'trial:'+id,is_subgroup:false}},
    ...fields};
}
function graph(records) {
  return {nodes:[nivo,ipi,pembro,combined].map(arm=>({id:arm.node_id,label:arm.label})),comparisons:records,network_direct_evidence:[]};
}
const comparison=(comparator,intervention)=>({kind:'treatment_comparison',comparator_label:comparator,intervention_label:intervention});
test('complete-arm browsing aligns concurrent, ordered and background regimens while keeping class-wide or unresolved inputs out',()=>{
  const g=graph([record(1,nivo,ipi,.7),record(2,pembro,combined,.8),record(3,sequential,{label:'placebo + placebo'},.9)]);
  const catalog=indirect.catalogue(g,studies.regimenDescription);
  assert.equal(catalog.ids.get(studies.completeArmKey(comparison('Ipilimumab + Nivolumab','Pembrolizumab'),'comparator')),combined.node_id);
  assert.equal(catalog.ids.get(studies.completeArmKey(comparison('placebo + placebo','Pembrolizumab'),'comparator')),'control:background');
  assert.equal(catalog.ids.get(studies.completeArmKey(comparison('Nivolumab + Ipilimumab followed by Nivolumab','Pembrolizumab'),'comparator')),sequential.network_regimen_id);
  assert.equal(studies.completeArmKey({kind:'single_arm',comparator_label:'No comparator'},'comparator'),null);
  assert.equal(studies.completeArmKey(comparison('PD-1 inhibitors','Ipilimumab'),'comparator'),null);
  assert.equal(studies.completeArmKey({kind:'treatment_comparison',comparator_label:'Ipilimumab',additional_intervention_label:'Nivolumab'},'intervention'),null);
  const a=comparison('Ipilimumab','Nivolumab'), b=comparison('Ipilimumab','Nivolumab + Ipilimumab');
  const selected={comparator:'treatment-class:agent:ipilimumab',intervention:'treatment-class:agent:nivolumab'};
  assert.deepEqual(studies.exactBrowsePair([a],selected),[ipi.node_id,nivo.node_id]);
  assert.equal(studies.exactBrowsePair([a,b],selected),null);
  assert.equal(studies.exactBrowsePair([a],{...selected,intervention:'treatment-class:pd1'}),null);
  const make=(id,row)=>({report_id:'report'+id,pmid:String(id),title:'Melanoma treatment trial',default_visible:true,current_main_eligible:true,
    comparisons:[{...row,comparison_id:'C'+id,comparison_filter_eligible:true,comparator_filter_eligible:true}],details:{quantitative_results:[]}});
  const visible=studies.filterStudies([make(1,a),make(2,b)],{comparator:'exact-regimen:'+ipi.node_id,intervention:'exact-regimen:'+nivo.node_id});
  assert.deepEqual(visible.map(match=>match.study.pmid),['1']);
});

test('Studies uses intervention versus comparator, retains intermediate trials, inverts the limits and links a randomized direct blocker',async()=>{
  const g=graph([record(101,nivo,ipi,.8),record(102,pembro,ipi,.5)]);
  const network=evidence.build(g,{endpoint:'OS:HR'});
  const fit=(n,i,c)=>indirect.calculate(g,n,i.node_id,c.node_id,'common',{});
  const forward=await fit(network,nivo,pembro),reverse=await fit(network,pembro,nivo);
  assert.equal(forward.pair.trials.length,2);
  assert.deepEqual(forward.pair.sharedComparators,[ipi.node_id]);
  assert.ok(Math.abs(forward.fit.estimate-1.6)<1e-10);
  assert.ok(Math.abs(reverse.fit.ci_upper*forward.fit.ci_lower-1)<1e-10);
  const filtered=evidence.build(g,{endpoint:'OS:HR',advanced:{active:true,matches:{101:{matched:true}}}});
  assert.equal((await fit(filtered,nivo,pembro)).pair.eligible,false);
  g.comparisons.push(record(103,nivo,pembro,.9,{ci_lower:null,ci_upper:null}));
  const blocked=await fit(evidence.build(g),pembro,nivo);
  assert.equal(blocked.pair.code,'direct_incomplete');assert.deepEqual(blocked.pair.sourcePmids,['103']);
});
test('automatic comparison offers complete regimens independently of head-to-head study filters',()=>{
  const g=graph([record(1,nivo,ipi,.8),record(2,pembro,ipi,.5)]);
  const catalog=indirect.catalogue(g,studies.regimenDescription);
  const tree=indirect.pickerTree([{value:'comparer:regimen:agent:nivolumab',label:'Nivolumab'}],catalog,groups,'comparator');
  const option=value=>tree.find(row=>row.value===value&&!row.hidden);
  assert.equal(option(nivo.node_id).label,'Nivolumab');
  assert.equal(option(pembro.node_id).label,'Pembrolizumab');
  assert.equal(option('treatment-class:agent:nivolumab').label,'Nivolumab (all regimens)');
  assert.equal(option('treatment-class:agent:nivolumab').disabled,false);
  const selection={comparator:'exact-regimen:'+nivo.node_id,intervention:'exact-regimen:'+pembro.node_id};
  for(const changed of ['comparator','intervention','']){
    const choices=studies.constrainStudyChoices([],selection,changed);
    assert.deepEqual(choices.selection,selection);
  }
});
test('network endpoint choices preserve the risk ratio default, alternative measures, targets and timepoint keys',()=>{
  const g=graph([record(101,nivo,ipi,.6,{outcome:'PFS'}),record(102,pembro,ipi,.8,{outcome:'ORR',measure:'OR'}),
    record(103,pembro,ipi,.7,{outcome:'ORR',measure:'RR',calculation:{outcome_context:{assessment_time:1.3798767967,time_unit:'months'}}})]);
  const all=indirect.endpointChoices(g,'','');assert.equal(all[0].key,'OS:HR');assert.ok(all.some(o=>o.key==='PFS:HR'));
  const response=indirect.endpointChoices(g,'response','ORR');assert.equal(response[0].measure,'RR');assert.ok(response.some(o=>o.measure==='OR'));
  assert.match(response[0].key,/1\.3798767967/);assert.match(response[0].label,/1\.38 months/);
  assert.deepEqual(indirect.endpointChoices(g,'disease_free_survival','DFS'),[]);
  const colliding=[{label:'1.231 months',id:'a'},{label:'1.232 months',id:'b'}];
  assert.deepEqual(evidence.readableTimeOptions(colliding),colliding);
});

test('the all-outcome table fits each eligible endpoint and definition for the chosen pair, with the same blockers and model as the single view',async()=>{
  const trials=(start,fields={})=>[record(start,nivo,ipi,.8,fields),record(start+1,pembro,ipi,.5,fields)];
  const g=graph([...trials(100),...trials(200,{outcome_definition:'overall survival landmark at 6 months'}),
    ...trials(300,{outcome:'PFS'}),...trials(400,{outcome:'ORR',measure:'RR'}),...trials(500,{outcome:'ORR',measure:'OR'})]);
  g.network_direct_evidence=[record(600,nivo,pembro,.9,{outcome:'PFS',ci_lower:null,ci_upper:null})];
  const opts=indirect.endpointChoices(g,'','');
  async function collect(advanced,model='common',current=()=>true){
    const values=[];
    for await(const item of indirect.estimableOutcomes(indirect.analysisScope(g,advanced),opts,nivo.node_id,pembro.node_id,model,null,current))values.push(item);
    return values;
  }
  const all=await collect({});
  assert.deepEqual(all.map(x=>[x.endpoint.key,x.network.target]).sort(),[
    ['OS:HR','overall'],['OS:HR','landmark at 6 months'],['ORR:RR','overall'],['ORR:OR','overall']].sort());
  for(const item of all) {
    const network=evidence.build(g,{endpoint:item.endpoint.key,target:item.network.target});
    const reference=await indirect.calculate(g,network,nivo.node_id,pembro.node_id,'common',{});
    assert.deepEqual(item.pair.trials,reference.pair.trials);
    assert.equal(item.fit.estimate,reference.fit.estimate);
  }
  const matches=Object.fromEntries([100,101].map(id=>[id,{matched:true}]));
  assert.deepEqual((await collect({active:true,matches})).map(x=>[x.endpoint.key,x.network.target]),[['OS:HR','overall']]);
  assert.deepEqual(await collect({},'random'),[]); // No replication to estimate the heterogeneity variance.
  assert.deepEqual(await collect({},'common',()=>false),[]);
});
