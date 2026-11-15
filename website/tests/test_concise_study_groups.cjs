'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const concise=require('../dist/concise_study_groups.js');

const hashes={
  '41694351':['e07f0a5fe70cd8b68beaad3df6d31d9c47dc1ca4adb66ce4c1bd6002f95cd9b8','439d03e5637abc3c833af338575c7ae8be111b1202279be92d1239fb6da08ac2'],
  '42140948':['c20c523b022cba122b9d06197e8f8858885bae6a60c582ea4091aa7999d65b8d','3dabb4ceec3fa2f78c5ff20c0b47ffcf06143c148c548a7e138739893c44c0b4'],
  '42335437':['950ac03089ce74458ef9a9562d79df2d6cbe5db668bda0d9a68ae71be334aa5d','70931961c7a33b2117cb0fe4b0ba76f668fa79959d02f54343d671e99373b6f7']
};
function population(id,label='Surgical patients',scope='subgroup',parent_id='NA'){return {id,label,scope,parent_id,melanoma_only:'yes',cutoff:'NA',evidence:['proof']};}
function arm(id,population_id='pop2',name='pembrolizumab'){return {id,population_id,root_id:'drug',nodes:[{id:'drug',kind:'drug',name,dose:'NA',route:'NA',schedule:'NA',children:[]}],evidence:['proof']};}
function record(stage,source,pop='pop2'){return {stage,source_sha256:source,study:{comparison_structure:'single_group'},populations:[population(pop)],arms:[arm('arm1',pop)],sample_sizes:[],binary:[],survival:[],effects:[],r2_links:[]};}
function link(section,r2_id,r3_id,relation='same'){return {section,r2_id,r3_id,relation,evidence:['proof']};}
function sample(r,id,n,{pop=r.populations[0].id,arm_id='arm1',purpose='outcome_analysis',cutoff='NA'}={}){
  const q={id,n,population_id:pop,arm_id,count_purpose:purpose,cutoff,complete:'yes',method:'reported',result_id:'NA',evidence:['proof']};r.sample_sizes.push(q);
  return {source_input_sha256:r.source_sha256,review_stage:r.stage,review_binding_sha256:r.stage==='R3'?'b'.repeat(64):'a'.repeat(64),population_id:r.stage+'-'+pop,main_result_eligible:true,n:{value:n},quantitative_record:q};
}
function result(r,id,{pop=r.populations[0].id,arm_id='arm1',n=21,endpoint='pCR',percentage=9.5,ci_lower='NA',ci_upper='NA',cutoff='NA'}={}){
  const q={id,endpoint,population_id:pop,arm_id,percentage,numerator:2,denominator:n,ci_lower,ci_upper,ci_level:typeof ci_lower==='number'?95:'NA',cutoff,assessment_time:'NA',time_unit:'NA',origin:'own_report',evidence:['proof'],display_n:{n,count_purpose:'outcome_analysis',count_ids:[],status:'reported'}};r.binary.push(q);
  return {result_id:r.stage+'-'+id,review_stage:r.stage,source_input_sha256:r.source_sha256,review_binding_sha256:r.stage==='R3'?'b'.repeat(64):'a'.repeat(64),measure:endpoint,quantitative_record:q};
}
function study(pmid,old,next,samples=[]){return {pmid,quantitative_only:true,details:{quantitative_extraction:[{record:old},{record:next}],sample_size_records:samples}};}
function group(results=[],context_counts){return {comparator_label:'—',intervention_label:'Pembrolizumab',comparisons:[],results,...(context_counts?{context_counts}:{})};}
function setup(pmid='99999999'){
  const pair=hashes[pmid]||['old','next'],old=record('R2',pair[0]),next=record('R3',pair[1]);next.r2_links=[link('populations','pop2','pop2'),link('arms','arm1','arm1')];
  return {old,next};
}
const registry=quote=>({['CE-'+ 'b'.repeat(24)+'-proof']:{supporting_quote:quote}});

test('count-only comparative report displays each sourced arm without a comparator direction',()=>{
  const old=record('R2','old','p1'),next=record('R3','next','p1');next.study.comparison_structure='comparative';next.arms=[arm('combination','p1','ipilimumab + nivolumab'),arm('ipilimumab','p1','ipilimumab')];
  const samples=[sample(next,'total',86,{pop:'p1',arm_id:'NA'}),sample(next,'combo',65,{pop:'p1',arm_id:'combination'}),sample(next,'ipi',21,{pop:'p1',arm_id:'ipilimumab'})];
  const s=study('42013417',old,next,samples),match={study:s,comparisons:[],results:[]},before=JSON.stringify(s);
  const rows=concise.prepare(match,[{...group(),show_study_context:true}],{eligible_samples:samples});
  assert.deepEqual(rows.map(r=>r.context_counts[0].n.value),[86,65,21]);
  assert.deepEqual(rows.map(r=>r.intervention_label),['—','ipilimumab + nivolumab','ipilimumab']);
  assert(rows.every(r=>r.comparator_label==='—'&&!r.is_add_on&&!r.comparisons.length&&!r.results.length));
  assert.equal(JSON.stringify(s),before,'Underlying extraction must remain unchanged');
});

test('equal N without explicit source links never suppresses a result',()=>{
  const {old,next}=setup(),a=result(old,'abstract'),b=result(next,'fulltext'),s=study('99999999',old,next);
  const groups=[group([a]),group([b])];
  assert.equal(concise.prepare({study:s,comparisons:[],results:[a,b]},groups).length,2);
  next.r2_links.push(link('binary','abstract','fulltext'));
  assert.equal(concise.prepare({study:s,comparisons:[],results:[a,b]},groups).length,1);
  b.quantitative_record.percentage=10;
  assert.equal(concise.prepare({study:s,comparisons:[],results:[a,b]},groups).length,2,'A numerical disagreement remains visible');
});

test('different known doses and duplicate/ambiguous links remain distinct',()=>{
  const {old,next}=setup(),a=result(old,'a'),b=result(next,'b'),s=study('99999999',old,next);next.r2_links.push(link('binary','a','b'));
  old.arms[0].nodes[0].dose='3 mg/kg';next.arms[0].nodes[0].dose='10 mg/kg';
  assert.equal(concise.safeAlias(s,a,b,{}),false);
  next.arms[0].nodes[0].dose='3 mg/kg';next.r2_links.push(link('binary','a','another'));
  assert.equal(concise.safeAlias(s,a,b,{}),false);
});

test('source-audited surgical pCR uses the complete CI once and keeps ITT separate',()=>{
  const {old,next}=setup('42140948');next.populations[0].label='Surgical cohort';next.r2_links.push(link('binary','binary1','pcr_surgical','supplement'));
  const a=result(old,'binary1'),b=result(next,'pcr_surgical',{ci_lower:1.2,ci_upper:30.3}),itt=result(next,'pcr_itt',{pop:'pop1',n:26,percentage:7.7});
  const s=study('42140948',old,next),match={study:s,comparisons:[],results:[a,b,itt]},groups=[group([a]),group([b]),group([itt])];
  const evidence=registry('Among the 21 surgical patients, 2 achieved pCR, yielding a pCR rate of 9.5%.');
  const rows=concise.prepare(match,groups,{registry:evidence});
  assert.deepEqual(rows.flatMap(g=>g.results.map(r=>r.quantitative_record.id)),['pcr_surgical','pcr_itt']);
  assert.equal(concise.prepare(match,groups,{registry:{}}).length,3,'Missing reviewed source proof refuses the alias');
  next.source_sha256='changed';b.source_input_sha256='changed';
  assert.equal(concise.prepare(match,groups,{registry:evidence}).length,3,'Source updates require a new review');
});

test('628 treated first-infusion analysis counts are grouped across stages, not confused with randomized N',()=>{
  const {old,next}=setup('42335437');old.populations=[population('pop1','High-risk resectable melanoma; pembrolizumab; first-infusion time recorded','overall')];old.arms=[arm('arm1','pop1')];next.populations=[population('pop2','Pembrolizumab-treated participants with recorded first-infusion time included in analyses')];
  next.r2_links=[link('populations','pop1','pop2'),link('arms','arm1','arm1'),link('sample_sizes','n_arm1','ss-analysis-arm')];
  const a=sample(old,'n_arm1',628,{pop:'pop1',purpose:'treated'}),b=sample(next,'ss-analysis-arm',628),s=study('42335437',old,next,[a,b]);
  const groups=[group([], [a]),group([], [b])],match={study:s,comparisons:[{}],results:[]};
  const evidence=registry('628 participants who received at least one dose of pembrolizumab and had time-of-day of first infusion recorded were included in analyses.');
  const rows=concise.prepare(match,groups,{registry:evidence,eligible_samples:[a,b]});
  assert.equal(rows.length,1);assert.equal(rows[0].context_counts[0].quantitative_record.count_purpose,'outcome_analysis');assert.equal(rows[0].context_label,'First-infusion analysis');
  a.quantitative_record.n=647;a.n.value=647;
  assert.equal(concise.prepare(match,groups,{registry:evidence,eligible_samples:[a,b]}).length,2);
});

test('linked count-only 54 is omitted only while the source-matched full-text outcome represents it',()=>{
  const {old,next}=setup('41694351');old.populations=[population('pop1','Metastatic cutaneous or subungual melanoma','overall')];next.populations=[population('pop1','Advanced or metastatic cutaneous melanoma, including acral or subungual disease','overall')];old.arms=[arm('arm1','pop1','ipilimumab + nivolumab')];next.arms=[arm('arm_pool','pop1','ipilimumab + nivolumab')];
  next.r2_links=[link('populations','pop1','pop1'),link('arms','arm1','arm_pool'),link('sample_sizes','sample2','ss_pool')];
  const a=sample(old,'sample2',54,{pop:'pop1'}),b=sample(next,'ss_pool',54,{pop:'pop1',arm_id:'arm_pool'}),outcome=result(next,'pfs',{pop:'pop1',arm_id:'arm_pool',n:54,endpoint:'PFS',percentage:51.8});
  const s=study('41694351',old,next,[a,b]),evidence=registry('The results were pooled for analysis.'),match={study:s,comparisons:[{}],results:[outcome]};
  assert.equal(concise.prepare(match,[group([], [a]),group([outcome])],{registry:evidence,eligible_samples:[a,b]}).length,1);
  assert.equal(concise.prepare({...match,results:[]},[group([], [a])],{registry:evidence,eligible_samples:[a,b]}).length,1,'A filtered-out counterpart cannot erase the count');
});

test('a shared surgical N can group different endpoints, but never two known cutoffs',()=>{
  const {old,next}=setup('42140948'),s=study('42140948',old,next),pcr=result(next,'pcr_surgical'),rfs=result(next,'rfs',{endpoint:'RFS',cutoff:'2025-04-01'});
  const evidence=registry('Among the 21 surgical patients, 2 achieved pCR.');
  assert.equal(concise.sharedCohort(s,group([pcr,rfs]),evidence),true);
  pcr.quantitative_record.cutoff='2024-04-01';assert.equal(concise.sharedCohort(s,group([pcr,rfs]),evidence),false);
  pcr.quantitative_record.cutoff='NA';rfs.quantitative_record.display_n.n=20;assert.equal(concise.sharedCohort(s,group([pcr,rfs]),evidence),false);
});

test('missing new N and conflicting intervals never suppress an existing result',()=>{
  const {old,next}=setup(),a=result(old,'a',{ci_lower:1.2,ci_upper:30.3}),b=result(next,'b'),s=study('99999999',old,next);next.r2_links.push(link('binary','a','b'));
  assert.equal(concise.safeAlias(s,a,b,{}),false,'Known old CI may not be discarded');
  Object.assign(b.quantitative_record,{ci_lower:1.2,ci_upper:30.3,ci_level:95});assert.equal(concise.safeAlias(s,a,b,{}),true);
  b.quantitative_record.display_n.n='NA';assert.equal(concise.safeAlias(s,a,b,{}),false);
});

test('new count-only contexts fail closed without the existing eligibility guard',()=>{
  const {old,next}=setup();next.study.comparison_structure='comparative';next.arms=[arm('a'),arm('b')];
  const samples=[sample(next,'a-count',20,{arm_id:'a'}),sample(next,'b-count',20,{arm_id:'b'})],s=study('99999999',old,next,samples),match={study:s,comparisons:[],results:[]},base=[{...group(),show_study_context:true}];
  assert.equal(concise.prepare(match,base).length,1);
  assert.equal(concise.prepare(match,base)[0].context_counts,undefined);
  assert.equal(concise.prepare(match,base,{eligible_samples:[samples[0]]}).length,1,'One eligible arm cannot promote another raw arm');
  assert.equal(concise.prepare(match,base,{eligible_samples:samples}).length,2);
});

test('single-group responder or parent-child count labels are not split into treatment arms',()=>{
  const {old,next}=setup(),a=sample(next,'a',9),b=sample(next,'b',11),s=study('99999999',old,next,[a,b]),match={study:s,comparisons:[],results:[]};
  const rows=concise.prepare(match,[{...group(),show_study_context:true}],{eligible_samples:[a,b]});
  assert.equal(rows.length,1);assert.equal(rows[0].count_only_arm_context,undefined);
});

test('a guarded single-arm subgroup count names treatment once and preserves the cohort label',()=>{
  const {old,next}=setup();next.populations[0].label='Tumor PD-L1 TPS <1%';next.arms[0].nodes[0].dose='3 mg/kg';
  const count=sample(next,'pdl1-count',13),s=study('99999999',old,next,[count]),match={study:s,comparisons:[],results:[]},base=[{...group([], [count]),intervention_label:''}],before=JSON.stringify(s);
  const row=concise.prepare(match,base,{eligible_samples:[count]})[0];
  assert.equal(row.intervention_label,'pembrolizumab');assert.equal(row.comparator_label,'—');assert.equal(row.count_only_arm_context,true);assert.equal(row.context_label,'Tumor PD-L1 TPS <1%');
  assert.equal(row.context_counts[0].n.value,13);assert.equal(JSON.stringify(s),before);
  assert.equal(concise.prepare(match,base)[0].count_only_arm_context,undefined,'An unguarded raw count cannot create a treatment context');
  const total=sample(next,'total',13,{arm_id:'NA'}),withTotalBefore=JSON.stringify(s);
  assert.equal(concise.prepare(match,[group([], [total])],{eligible_samples:[total]})[0].count_only_arm_context,undefined,'An unknown arm stays unassigned');
  const pairedTotal=concise.prepare(match,[group([], [count,total])],{eligible_samples:[count,total]})[0];
  assert.equal(pairedTotal.count_only_arm_context,true,'Declared single-group study with one source arm permits its same-cohort total/arm alias');
  assert.equal(pairedTotal.context_counts.length,1);assert.equal(pairedTotal.context_counts[0].n.value,13);assert.equal(JSON.stringify(s),withTotalBefore);
});
