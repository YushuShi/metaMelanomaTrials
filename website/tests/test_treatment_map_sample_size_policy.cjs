'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Analysis=require('../dist/treatment_map_analysis.js'),sampleProof=require('./fixtures/pooling_sample_size.cjs');
function row(id,{study=id,cohort=study,root=study,parent=null,subgroup=false,n=100,year=2025,estimate=.7,ci=true}={}){
  return {id,pmid:id,study_name:study,outcome:'OS',measure:'HR',estimate,ci_lower:ci?estimate*.8:null,ci_upper:ci?estimate*1.2:null,ci_level:95,intervention:{node_id:'a'},comparator:{node_id:'b'},
    analysis:{independent_id:study,independence_verified:true,publication_year:year,design:'randomized_trial',source_completeness:2,sample_size:sampleProof(id,n),
      cohort:{id:cohort,root_id:root,parent_id:parent,is_subgroup:subgroup,scope:subgroup?'subgroup':'overall',label:subgroup?'Stage III':'Overall population',stratum_key:'stage-iii',filter_equivalence_keys:subgroup?['stage']:[],independent_group_id:root},
      compatibility:{key:'same',label:'Comparable',eligible:true}}};
}
const run=(rows,extra={})=>Analysis.analyze(rows,{tailId:'b',headId:'a',endpoint:'OS:HR',...extra});
const ids=result=>result.tableRows.filter(row=>row.included).map(row=>row.id).sort();

test('two missing-N studies remain reviewable but never create a pooled result or inflate independent k',()=>{
  const result=run([row('one',{n:null}),row('two',{n:null})]);assert.deepEqual(ids(result),[]);assert.equal(result.counts.independent_studies,0);
  assert.equal(result.groups[0].pooled,null);assert.equal(result.groups[0].single,null);
  for(const r of result.tableRows){assert.equal(r.population_selected,true);assert.equal(r.planning_included,true);assert.equal(r.selectable,false);assert.equal(r.selection_reason,'missing_supported_sample_size');}
});

test('positive N requires same-paper source-field anchors; bare numbers, zero and cross-paper counts do not qualify',()=>{
  const cases=[{n:100,basis:'reported_analysis_n'},sampleProof('another-paper',100),sampleProof('one',0),sampleProof('one',-1),{...sampleProof('one',100),source_refs:[{pmid:'one',evidence_ids:['opaque']}]},sampleProof('one',null)];
  for(const sample of cases){const r=row('one');r.analysis.sample_size=sample;assert.equal(Analysis.supportedSampleSize(r).n,null);assert.equal(run([r]).counts.independent_studies,0);}
  const supported=row('one');assert.equal(Analysis.supportedSampleSize(supported).n,100);
});

test('a source-bound cohort total can qualify without pretending it is the exact comparison N',()=>{
  const r=row('one',{n:null}),proof=sampleProof('one',945,'reported_population_n_not_comparison_n');
  Object.assign(r.analysis.cohort,{sample_n:proof.n,sample_n_basis:proof.basis,sample_n_source_refs:proof.source_refs});
  const result=run([r]),selected=result.groups[0].selected[0];assert.equal(selected.sample_n,null);assert.equal(selected.pooling_n,945);assert.equal(selected.pooling_n_basis,'cohort');assert.equal(result.groups[0].single.model,'individual');
  assert.equal(r.analysis.sample_size.n,null);
});

test('R2 and R3 from the same paper complement supported N without importing a different paper count',()=>{
  const abstract=row('one'),full=structuredClone(abstract);full.id='full';full.analysis.source_completeness=3;full.analysis.sample_size={n:null,basis:null,source_refs:[]};
  const combined=run([abstract,full]);assert.equal(combined.groups[0].selected.length,1);assert.equal(combined.groups[0].selected[0].pooling_n,100);
  const cohort=sampleProof('one',200,'reported_population_n_not_comparison_n');abstract.analysis.sample_size={n:null,basis:null,source_refs:[]};Object.assign(abstract.analysis.cohort,{sample_n:200,sample_n_basis:cohort.basis,sample_n_source_refs:cohort.source_refs});
  assert.equal(run([abstract,full]).groups[0].selected[0].pooling_n,200);
  full.pmid='another-paper';full.analysis.publication_year=2026;const separate=run([abstract,full]);assert.deepEqual(ids(separate),['one']);assert.equal(separate.tableRows.find(r=>r.id==='full').pooling_n,null);
});

test('broadest population outranks a larger subgroup and a parent subgroup outranks its nested child',()=>{
  const parent=row('overall',{study:'same',n:40}),child=row('child',{study:'same',cohort:'sub',root:'same',parent:'same',subgroup:true,n:200});
  assert.deepEqual(ids(run([parent,child])),['overall']);
  const wider=row('wider',{study:'same',cohort:'wide',parent:'same',subgroup:true,n:30}),narrower=row('narrower',{study:'same',cohort:'narrow',parent:'wide',subgroup:true,n:60});
  assert.deepEqual(ids(run([wider,narrower])),['wider']);
  parent.analysis.sample_size.n=null;assert.deepEqual(ids(run([parent,child])),['child']);
});

test('latest poolable N-qualified report wins within a cohort; a missing-N latest report falls back without borrowing N',()=>{
  const old=row('old',{study:'same',n:100,year:2020}),current=row('current',{study:'same',n:80,year:2025,estimate:.6});
  assert.deepEqual(ids(run([old,current])),['current']);
  current.analysis.sample_size.n=null;const fallback=run([old,current]);assert.deepEqual(ids(fallback),['old']);assert.equal(fallback.tableRows.find(r=>r.id==='current').selection_reason,'missing_supported_sample_size');assert.equal(current.analysis.sample_size.n,null);
  current.analysis.sample_size=sampleProof('current',80);current.ci_lower=null;assert.deepEqual(ids(run([old,current])),['old']);
});

test('a missing-N aggregate cannot suppress disjoint child cohorts with supported counts',()=>{
  const aggregate=row('aggregate',{study:'same',cohort:'aggregate',root:'aggregate',n:null});
  const children=['one','two'].map(id=>{const value=row(id,{study:'same',cohort:id,root:id,n:40});value.analysis.cohort.aggregate_parent_root_id='aggregate';return value;});
  const result=run([aggregate,...children]);assert.deepEqual(ids(result),['one','two']);assert.equal(result.groups[0].pooled.k,2);
  assert.equal(result.tableRows.find(r=>r.id==='aggregate').selection_reason,'missing_supported_sample_size');
  const requested=run([aggregate,...children],{inclusionOverrides:{aggregate:true}});assert.deepEqual(ids(requested),['one','two']);
});

test('specific filters may replace overall with a supported-N subgroup but cannot promote a missing-N subgroup',()=>{
  const parent=row('overall',{study:'same'}),child=row('child',{study:'same',cohort:'sub',parent:'same',subgroup:true,n:40});
  const advanced={active:true,selections:{stage:'iii'},matches:{overall:{matched:false},child:{matched:true,specificity:1,matched_keys:['stage']}}};
  assert.deepEqual(ids(run([parent,child],{advanced})),['child']);
  child.analysis.sample_size.n=null;const missing=run([parent,child],{advanced});assert.deepEqual(ids(missing),[]);assert.equal(missing.tableRows.find(r=>r.id==='child').selection_reason,'missing_supported_sample_size');
});

test('N controls eligibility and automatic k/model, never inverse-variance weights',()=>{
  const rows=[row('one',{estimate:.6,n:20}),row('two',{estimate:.8,n:200}),row('three',{estimate:1.1,n:10})];
  assert.equal(run(rows).groups[0].pooled.model,'random');rows[2].analysis.sample_size.n=null;const two=run(rows).groups[0];assert.equal(two.pooled.model,'fixed');
  const initial=two.pooled;rows[0].analysis.sample_size.n=10000;rows[1].analysis.sample_size.n=1;const rescaled=run(rows).groups[0].pooled;assert.equal(initial.estimate,rescaled.estimate);assert.deepEqual(initial.weights,rescaled.weights);
  rows[1].analysis.sample_size.n=null;assert.equal(run(rows).groups[0].single.model,'individual');
});

test('actual nivolumab/ipilimumab OS selects latest supported906 and631 pair Ns with the no-N paper visible',()=>{
  const graph=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/data/treatment_map.json'),'utf8')),before=JSON.stringify(graph.comparisons);
  const result=Analysis.analyze(graph.comparisons,{tailId:'agent:ipilimumab',headId:'agent:nivolumab',endpoint:'OS:HR'}),group=result.groups.find(g=>g.pooled);
  assert.deepEqual(group.selected.map(r=>[r.pmid,r.pooling_n,r.pooling_n_basis]).sort(),[['37058595',906,'comparison'],['39282897',631,'comparison']]);
  // Independent inverse-variance calculation from the two published tuples;
  // the denominator repairs change eligibility/selection, never N-based weights.
  const tuples=[[.86,.66,1.12],[.63,.52,.76]],z=1.959963984540054;
  const weights=tuples.map(([,lo,hi])=>1/((Math.log(hi)-Math.log(lo))/(2*z))**2),sum=weights.reduce((a,b)=>a+b,0);
  const mean=tuples.reduce((s,[estimate],i)=>s+weights[i]*Math.log(estimate),0)/sum,se=Math.sqrt(1/sum);
  assert.equal(group.pooled.model,'fixed');assert.ok(Math.abs(group.pooled.estimate-Math.exp(mean))<1e-8);assert.ok(Math.abs(group.pooled.ci_lower-Math.exp(mean-z*se))<1e-8);assert.ok(Math.abs(group.pooled.ci_upper-Math.exp(mean+z*se))<1e-8);
  const latest=result.tableRows.find(r=>r.pmid==='41124198');assert.equal(latest.pooling_n,null);assert.equal(latest.included,false);assert.equal(latest.selection_reason,'missing_supported_sample_size');assert.equal(JSON.stringify(graph.comparisons),before);
});
