'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {survivalEvents,binaryEvents,build}=require('../scripts/underpowered_studies.cjs');
const {matchingRows,mount}=require('../dist/underpowered_studies.js');
const effect={id:'h',population_id:'all',intervention_arm_id:'new',reference_arm_id:'ref',measure:'HR',endpoint:'OS',adjusted:'no',evidence:['hr'],estimate:0.8,origin:'own_report'};
function record(){return {pmid:'123',stage:'R3',study:{randomized:'yes',evidence:[]},arms:['new','ref'].map(id=>({id,evidence:[]})),populations:[{id:'all',scope:'overall'}],sample_sizes:[60,20].map((n,i)=>({arm_id:i?'ref':'new',population_id:'all',n,count_purpose:'randomized',method:'reported',complete:'yes',disjoint:'yes',evidence:['counts']}))};}
const sourceRow={review_binding_sha256:'f'.repeat(64)};
test('uses reciprocal log HR variance and the observed unequal arm fraction, rejects impossible counts and unsupported allocations',()=>{
  const r=record();const x=survivalEvents(effect,r,sourceRow,{}, {precision_se:0.4},80,null);
  assert.ok(Math.abs(x.events-1/(0.4**2*.75*.25))<1e-12);
  assert.equal(survivalEvents(effect,r,sourceRow,{}, {precision_se:0.1},80,null),null);
  assert.equal(survivalEvents(effect,r,sourceRow,{}, {precision_se:0.4},60,null),null);
  assert.equal(survivalEvents({...effect,adjusted:'yes'},r,sourceRow,{}, {precision_se:0.4},80,null),null);
  assert.equal(survivalEvents(effect,{...r,sample_sizes:[]},sourceRow,{}, {precision_se:0.4},80,null),null);
});
test('binary event counts require matching assessment and population',()=>{
  const r=record();r.binary=[{arm_id:'new',denominator:60,numerator:10},{arm_id:'ref',denominator:20,numerator:3}].map(row=>({...row,origin:'own_report',population_id:'all',endpoint:'ORR',evidence:['hr'],assessment_time:6,time_unit:'months'}));
  const e={...effect,measure:'OR',endpoint:'ORR'};
  assert.equal(binaryEvents(e,r,80).events,13);
  r.binary[1].assessment_time=12;assert.equal(binaryEvents(e,r,80),null);
  r.binary[1].assessment_time=6;r.binary[1].population_id='subgroup';assert.equal(binaryEvents(e,r,80),null);
});
test('strict event threshold uses the rounded-up count and an inclusive ratio null',()=>{
  const rows=[{events:98.1,lower:1,upper:1.5},{events:99.999,lower:1,upper:1.5},{events:100,lower:.6,upper:1},{events:98,lower:.5,upper:.99}];
  assert.deepEqual(matchingRows({rows},100),[rows[0]]);
  assert.deepEqual(matchingRows({rows},101),rows.slice(0,3));
  assert.deepEqual(matchingRows({rows},0),[]);
});
test('shows whole events and preserves the reported or estimated basis',()=>{
  const input={value:'100',addEventListener(){}}, output={addEventListener(){}};
  const panel={querySelector:selector=>selector==='[data-event-results]'?output:input};
  const row={pmid:'123',estimate:1,lower:.6,upper:1.2,basis:'arm counts'};
  mount(panel,{rows:[{...row,events:16.08,method:'Estimated from HR CI'},{...row,events:60,method:'Reported arm counts'}]});
  assert.match(output.innerHTML,/<td>17<small>Estimated from HR CI/);
  assert.match(output.innerHTML,/<td>60<small>Reported arm counts/);
  assert.doesNotMatch(output.innerHTML,/≈/);
});
test('year and event arrows sort numerically and keep the selection after a threshold change',()=>{
  const input={value:'100',addEventListener(type,listener){this[type]=listener;}};
  const output={addEventListener(type,listener){this[type]=listener;},querySelector(){return {focus(){}};}};
  const panel={querySelector:selector=>selector==='[data-event-results]'?output:input};
  const base={lower:.6,upper:1.3,estimate:1};
  const rows=[['1',2020,9.8],['2',null,9.2],['3','2025',42],['4',2013,8]];
  mount(panel,{rows:rows.map(([pmid,year,events])=>({...base,pmid,year,events}))});
  const order=()=>[...output.innerHTML.matchAll(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\//g)].map(m=>m[1]);
  const sort=(column,direction)=>output.click({target:{closest:()=>({dataset:{sortColumn:column,sortDirection:direction}})}});
  assert.match(output.innerHTML,/aria-sort="descending">Published year/);
  assert.deepEqual(order(),['3','1','4','2']);
  sort('year','ascending');
  assert.deepEqual(order(),['4','1','3','2']);
  sort('events','ascending');
  assert.deepEqual(order(),['4','1','2','3']);
  sort('events','descending');
  assert.deepEqual(order(),['3','1','2','4']);
  input.value='11';input.input();
  assert.deepEqual(order(),['1','2','4']);
  assert.match(output.innerHTML,/aria-sort="descending">Events/);
});
test('empty release is supported',()=>assert.deepEqual(build({articles:[]},null).rows,[]));
