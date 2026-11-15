'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const concise=require('../dist/concise_study_groups.js');

function row(stage,n=30,extra={}){
  const result={review_stage:stage,source_input_sha256:stage+'-source',quantitative_record:{id:stage+'-result',cutoff:stage==='R2'?'NA':'2026',display_n:{n}}};
  return {pmid:'123',comparator_label:'Pembrolizumab',intervention_label:'Lenvatinib',is_add_on:true,comparisons:[{id:stage+'-comparison'}],results:[result],context_counts:[{id:stage+'-count',n}],view:{group:'Phase II',samples:[{label:stage==='R2'?'PFS':'Total',sample_size:String(n)}],effects:[{label:'PFS',value:stage==='R2'?'0.7':'0.7 (0.5–0.9)'}]},...extra};
}
const options={viewFor:row=>row.view,treatmentText:(label,definition,addOn)=>(addOn?'+ ':'')+label+(definition?.placebo?' (+placebo)':'')};
const combine=rows=>concise.consolidatePresentation(rows,options);
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}

test('identical visible groups and N merge R2/R3 views while preserving every child record',()=>{
  const rows=[row('R2'),row('R3')],before=JSON.stringify(rows);freeze(rows);
  const groups=combine(rows);assert.equal(groups.length,1);
  assert.deepEqual(groups[0].presentation_members,rows.map(row=>({row,view:row.view})));
  assert.deepEqual(groups[0].results,rows.flatMap(row=>row.results));
  assert.deepEqual(groups[0].comparisons,rows.flatMap(row=>row.comparisons));
  assert.deepEqual(groups[0].context_counts,rows.flatMap(row=>row.context_counts));
  assert.equal(JSON.stringify(rows),before);
  assert.equal(groups[0].presentation_members[1].view.effects[0].value,'0.7 (0.5–0.9)');
});

test('unequal displayed N sets remain separate',()=>{
  const rows=[row('R2',30),row('R3',28)];assert.deepEqual(combine(rows),rows);
  const two=row('R3',30);two.view.samples.push({label:'Biomarker analysis',sample_size:'15'});
  assert.equal(combine([rows[0],two]).length,2);
});

test('repeated equal N and sample-purpose labels do not repeat a presentation row',()=>{
  const a=row('R2',692),b=row('R3',692);
  a.view.samples.push({label:'OS',sample_size:'692'});
  b.view.samples[0].label='Outcome analysis';
  assert.equal(combine([a,b]).length,1);
});

test('displayed N order is irrelevant and all member-specific labels remain intact',()=>{
  const a=row('R2',20),b=row('R3',10);
  a.view.samples.push({label:'Responders',sample_size:'10'});
  b.view.samples.push({label:'All analyzed',sample_size:'20'});
  const groups=combine([a,b]);assert.equal(groups.length,1);
  assert.deepEqual(groups[0].presentation_members.map(member=>member.view.samples),[a.view.samples,b.view.samples]);
});

test('known comparator and intervention Ns cannot be swapped or conflated',()=>{
  const a=row('R2',30,{comparator_n:10,intervention_n:20}),b=row('R3',30,{comparator_n:20,intervention_n:10});
  assert.equal(combine([a,b]).length,2);
});

test('missing arm annotations can reuse a uniquely consistent existing pair',()=>{
  const a=row('R2',30),b=row('R3',30,{comparator_n:10,intervention_n:20,paired_arm_context:true});
  const groups=combine([a,b]);assert.equal(groups.length,1);
  assert.equal(groups[0].comparator_n,10);assert.equal(groups[0].intervention_n,20);assert.equal(groups[0].paired_arm_context,true);
  assert.equal(a.comparator_n,undefined);
});

test('promoted arm Ns retain the contributing arm IDs and reported total metadata',()=>{
  const a=row('R2',30,{comparator_arm_id:'old-control',intervention_arm_id:'old-treatment'});
  const b=row('R3',30,{comparator_n:10,intervention_n:20,comparator_arm_id:'r3-control',intervention_arm_id:'r3-treatment',paired_arm_context:true,paired_count_only:true,arm_count_purpose:'outcome_analysis',total_n:30,total_count_id:'reported-total',total_count_purpose:'outcome_analysis'});
  const group=combine([a,b])[0];
  assert.equal(group.comparator_arm_id,'r3-control');assert.equal(group.intervention_arm_id,'r3-treatment');
  assert.equal(group.arm_count_purpose,'outcome_analysis');assert.equal(group.total_n,30);assert.equal(group.total_count_id,'reported-total');
  assert.equal(group.paired_count_only,false,'a merged row with results is not count-only');
  assert.equal(a.comparator_arm_id,'old-control');
  const allCounts=combine([{...a,results:[]},{...b,results:[]}])[0];assert.equal(allCounts.paired_count_only,true);
});

test('existing known N/arm ID annotations are not replaced by later source IDs',()=>{
  const a=row('R2',30,{comparator_n:10,intervention_n:20,comparator_arm_id:'r2-control',intervention_arm_id:'r2-treatment',total_n:30});
  const b=row('R3',30,{comparator_n:10,intervention_n:20,comparator_arm_id:'r3-control',intervention_arm_id:'r3-treatment',total_n:31});
  const group=combine([a,b])[0];
  assert.equal(group.comparator_arm_id,'r2-control');assert.equal(group.intervention_arm_id,'r2-treatment');assert.equal(group.total_n,30);
  assert.equal(group.presentation_members[1].row.total_n,31);
});

test('missing arm annotations cannot bridge conflicting pair assignments',()=>{
  const a=row('a',30,{comparator_n:10,intervention_n:20}),b=row('b',30,{comparator_n:20,intervention_n:10}),missing=row('missing',30),a2=row('a2',30,{comparator_n:10,intervention_n:20});
  const groups=combine([a,missing,b,a2]);assert.equal(groups.length,3);
  assert.deepEqual(groups[0].presentation_members.map(member=>member.row),[a,a2]);
  assert.equal(groups[1],missing);assert.equal(groups[2],b);
});

test('partially known arm counts join only a uniquely compatible role partition',()=>{
  const a=row('a',30,{comparator_n:10,intervention_n:20}),b=row('b',30,{comparator_n:20,intervention_n:10}),partial=row('partial',30,{comparator_n:10});
  const groups=combine([a,b,partial]);assert.equal(groups.length,2);
  assert.deepEqual(groups[0].presentation_members.map(member=>member.row),[a,partial]);
});

test('different treatment directions, add-on markers, placebo annotations and populations remain separate',()=>{
  const a=row('a');
  for(const b of [row('b',30,{comparator_label:'Lenvatinib',intervention_label:'Pembrolizumab'}),row('b',30,{is_add_on:false}),row('b',30,{comparator_definition:{placebo:true}}),row('b',30,{view:{...a.view,group:'Phase Ib'}})])assert.equal(combine([a,b]).length,2);
});

test('different article identifiers never merge',()=>{
  assert.equal(combine([row('a'),row('b',30,{pmid:'456'})]).length,2);
});

test('whitespace and comma count formatting do not create duplicate rows',()=>{
  const a=row('a',1200),b=row('b',1200,{comparator_label:' Pembrolizumab  '});
  b.view.group='Phase   II';b.view.samples[0].sample_size='1,200';
  assert.equal(combine([a,b]).length,1);
});

test('unknown N is not an equal-N match while zero remains a known value',()=>{
  const a=row('a'),b=row('b');a.view.samples=[{sample_size:'NA'}];b.view.samples=[{sample_size:'NA'}];
  assert.equal(combine([a,b]).length,2);assert.equal(combine([row('a',0),row('b',0)]).length,1);
});

test('unmerged row references, original order and shared result references are preserved',()=>{
  const a=row('a'),b=row('b',40),c=row('c');c.results=a.results;
  const groups=combine([a,b,c]);assert.equal(groups.length,2);assert.equal(groups[1],b);
  assert.deepEqual(groups[0].results,a.results);assert.equal(groups[0].results[0],a.results[0]);
});

test('views are evaluated exactly once per original row',()=>{
  const rows=[row('a'),row('b')],calls=[];
  concise.consolidatePresentation(rows,{...options,viewFor:row=>{calls.push(row);return row.view;}});
  assert.deepEqual(calls,rows);
});
