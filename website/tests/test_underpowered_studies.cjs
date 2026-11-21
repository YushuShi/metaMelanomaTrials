'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {build,binaryScenario,graphScenarios}=require('../scripts/underpowered_studies.cjs');
const {matchingRows,plan,mount}=require('../dist/underpowered_studies.js');

const rate={kind:'reference_probability',probability:1/8};
const row={pmid:'38588588',title:'MCGRAW',year:2024,estimate:4/3,lower:.103,upper:17.278,measure:'RR',
  n:14,filter_binding:{pmid:'38588588',result_id:'ae'},endpoint:'AE_serious',scenarios:[rate],comparator_label:'Pembrolizumab',intervention_label:'Nivolumab',add_on:true};
test('binary outcomes use a separate strict participant cutoff independent of observed events and study N',()=>{
  // R power.prop.test, two-sided alpha=.05, two equal arms, roundup per arm.
  assert.equal(plan(row,.8).plans[0].required_n,2252);
  assert.equal(plan(row,.9).plans[0].required_n,3012);
  assert.equal(plan(row,.8).plans[0].events,null);
  const rows=[{...row,n:null},{...row,n:10000},{...row,lower:1.1}];
  assert.equal(matchingRows({rows},.8,1,2253).length,2);
  assert.deepEqual(matchingRows({rows},.8,100000,2252),[]);
  assert.deepEqual(matchingRows({rows},.9,100,2253),[]);
  assert.deepEqual(matchingRows({rows},.8),[]);
  assert.deepEqual(matchingRows({rows},1),[]);
});
test('survival uses whole Schoenfeld events with no enrollment, rate or follow-up dependency',()=>{
  const hr={...row,measure:'HR',estimate:.5,n:null,lower:.1,upper:1,scenarios:[]};
  const events=Math.ceil((1.959963984540054+.8416212335729143)**2/(.25*Math.log(.5)**2));
  assert.equal(events,66);
  assert.deepEqual(plan(hr,.8).plans,[{events,required_n:null}]);
  assert.equal(matchingRows({rows:[hr]},.8,67,1).length,1);
  assert.deepEqual(matchingRows({rows:[hr]},.8,66,100000),[]);
  assert.equal(matchingRows({rows:[{...hr,n:10000,scenarios:[{kind:'overall_event_fraction',probability:.9}]}]},.8).length,1);
  assert.equal(matchingRows({rows:[{...hr,estimate:1}]},.8).length,0);
  for(const cutoff of [0,-1,2.5,Infinity])assert.equal(matchingRows({rows:[hr]},.8,cutoff,100).length,0);
});
test('rates for a calculated binary effect retain exact arm and population identities',()=>{
  const e={id:'effect',population_id:'p',reference_arm_id:'c',intervention_arm_id:'i',evidence:['s'],endpoint:'ORR',
    calculation:{intervention:{population_id:'p',arm_id:'i',rate:1/6,row_id:'x',denominator:6},
      reference:{population_id:'p',arm_id:'c',rate:1/8,row_id:'y',denominator:8}}};
  assert.deepEqual(binaryScenario(e,{}),{kind:'reference_probability',probability:1/8,source_ids:['x','y'],paired_n:14});
  e.calculation.reference.population_id='sub';assert.equal(binaryScenario(e,{}),null);
});
test('only the same supported endpoint, population, report and source can provide an HR event rate',()=>{
  const e={measure:'HR',endpoint:'PFS',endpoint_definition:'Intracranial progression-free survival',estimate:.72,population_id:'p'};
  const input={id:'s',arm_role:'comparator',outcome:'PFS',kind:'survival_probability',probability:.6,time_months:12,
    population_id:'p',label:'Intracranial PFS',source_refs:[{pmid:'111',source_sha256:'a',stage:'R3',report_id:'report',record_id:'matched'}]};
  const c={id:'c',measure:'HR',estimate:.72,outcome:'PFS',comparator:{label:'A'},intervention:{label:'B'},analysis:{planning_assumptions:[
    input,{...input,source_refs:[{pmid:'222',source_sha256:'b'}]}, {...input,population_id:'x'}, {...input,label:'Extracranial PFS'}]}};
  const a=graphScenarios(e,{pmid:'111',source_sha256:'a'},[c]);
  assert.equal(a.length,1);assert.equal(a[0].probability,.4);assert.deepEqual(a[0].source_ids,['matched']);
  assert.equal(a[0].time_months,12);
});
test('a matching full-text effect binds its own population and control rate to a verified abstract comparison',()=>{
  const article={pmid:'111',source_sha256:'abstract'};
  const early={endpoint:'OS',measure:'HR',estimate:.96,ci_lower:.76,ci_upper:1.22,ci_level:95,
    population_id:'all-a',intervention_arm_id:'a1',reference_arm_id:'a0'};
  const late={...early,population_id:'all-b',intervention_arm_id:'b1',reference_arm_id:'b0',cutoff:'2020-09-29'};
  const rate={id:'t',kind:'survival_probability',outcome:'OS',arm_role:'comparator',arm_id:'b0',
    probability:.66,time_months:24,population_id:'all-b',source_refs:[{pmid:'111',source_sha256:'body',stage:'R3',report_id:'report',record_id:'s5'}]};
  const comparison={id:'c',measure:'HR',estimate:.96,outcome:'OS',comparator:{label:'A'},intervention:{label:'B'},
    analysis:{filter_bindings:[{pmid:'111',source_input_sha256:'body',quantitative_record:late}],planning_assumptions:[rate]}};
  const full=graphScenarios(early,article,[comparison]);
  assert.equal(full.length,1);assert.ok(Math.abs(full[0].probability-.34)<1e-12);
  rate.arm_id='other';assert.deepEqual(graphScenarios(early,article,[comparison]),[]);
  rate.arm_id='b0';rate.cutoff='2022-01-01';assert.deepEqual(graphScenarios(early,article,[comparison]),[]);
  rate.cutoff=null;late.estimate=.97;assert.deepEqual(graphScenarios(early,article,[comparison]),[]);
});
test('empty release is supported',()=>assert.deepEqual(build({articles:[]},null).rows,[]));
test('both cutoffs and target power update the displayed rows and clinical filter choices',()=>{
  const makeInput=value=>({value,addEventListener(t,cb){this[t]=cb;}});
  const inputs={'[data-target-power]':makeInput('80'),'[data-event-threshold]':makeInput('100'),
    '[data-participant-threshold]':makeInput('100')};
  const output={addEventListener(){},querySelector(){return null;}};
  const panel={querySelector:s=>s==='[data-power-results]'?output:inputs[s]};
  const data={schema_version:2,rows:[row,{...row,pmid:'12345',filter_binding:{pmid:'12345',result_id:'hr'},measure:'HR',estimate:.5,n:null,scenarios:[]}]};
  let evidence, refreshCount=0;
  mount(panel,data,(_heading,_panel,getEvidence)=>{
    evidence=getEvidence;return {refresh(){refreshCount++;}};
  });
  assert.match(panel.innerHTML,/Target power/);assert.match(panel.innerHTML,/Survival event cutoff/);
  assert.match(panel.innerHTML,/Binary participant cutoff/);
  assert.match(output.innerHTML,/Required participants/);assert.match(output.innerHTML,/Required events/);
  assert.match(output.innerHTML,/<td>66<\/td><td>—<\/td>/);assert.doesNotMatch(output.innerHTML,/2,252/);
  assert.match(output.innerHTML,/data-treatment-class="[^"]+"[^>]*>[^<]*Pembrolizumab/);
  assert.match(output.innerHTML,/Nivolumab/);
  const change=(selector,value)=>{const input=inputs[selector];input.value=value;input.input();};
  change('[data-participant-threshold]','2253');assert.match(output.innerHTML,/<td>—<\/td><td>2,252<\/td>/);
  assert.equal(evidence({},false,{}).summary.report_count,2);
  change('[data-event-threshold]','66');assert.doesNotMatch(output.innerHTML,/data-pmid="12345"/);
  assert.equal(evidence({},false,{}).summary.report_count,1);
  change('[data-target-power]','90');assert.match(output.innerHTML,/0 results/);
  change('[data-participant-threshold]','3013');assert.match(output.innerHTML,/3,012/);
  change('[data-participant-threshold]','1.1');assert.match(output.innerHTML,/positive whole number/);
  change('[data-target-power]','50');assert.match(output.innerHTML,/above 50%/);
  assert.equal(refreshCount,6);
});
