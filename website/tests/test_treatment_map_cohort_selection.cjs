'use strict';
const sampleProof=require('./fixtures/pooling_sample_size.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const Analysis=require('../dist/treatment_map_analysis.js');
const dimensions=scope=>JSON.stringify(['randomized_trial','advanced','general_melanoma','unknown','unknown','cox','no','standard_os',scope,'unspecified']);
function result(id,{study='trial-a',cohort=study,root=study,subgroup=false,label=subgroup?'Stage III':'Overall population',n=100,year=2025,estimate=.7,ci=true,stratum,keys,...extra}={}){
  return {id,pmid:'pmid-'+id,study_name:study,intervention:{node_id:'ab',label:'A + B'},comparator:{node_id:'a',label:'A'},outcome:'OS',measure:'HR',estimate,ci_lower:ci?estimate*.8:null,ci_upper:ci?estimate*1.2:null,ci_level:95,population:label,source_refs:[],
    analysis:{independent_id:study,independence_verified:true,design:'randomized_trial',publication_year:year,source_completeness:2,source_stages:['R3'],sample_size:sampleProof('pmid-'+id,n),
      cohort:{id:cohort,root_id:root,parent_id:subgroup?root:null,independent_group_id:root,is_subgroup:subgroup,scope:subgroup?'subgroup':'overall',label,sample_n:n,stratum_key:stratum||label,filter_equivalence_keys:keys||[]},
      compatibility:{key:dimensions(subgroup?'subgroup':'overall'),eligible:true,label:'randomized_trial · advanced · general_melanoma'}},...extra};
}
const run=(rows,options={})=>Analysis.analyze(rows,{tailId:'a',headId:'ab',endpoint:'OS:HR',...options});
const selected=value=>value.tableRows.filter(row=>row.population_selected).map(row=>row.id).sort();
const row=(value,id)=>value.tableRows.find(row=>row.id===id);
const advanced=(matches,selections={stage:'iii'})=>({active:true,selections,matches});

test('overall evidence is included while its subgroup remains visible with N, effect and CI',()=>{
  const inputs=[result('overall'),result('stage-iii',{cohort:'trial-a-stage-iii',subgroup:true,n:40}),result('other',{study:'trial-b'})];
  const before=JSON.stringify(inputs),value=run(inputs);
  assert.deepEqual(selected(value),['other','overall']);
  assert.equal(row(value,'stage-iii').selection_reason,'represented_by_overall');
  assert.equal(row(value,'stage-iii').selectable,true);
  assert.equal(row(value,'stage-iii').sample_n,40);
  assert.equal(row(value,'stage-iii').estimate,.7);
  assert.ok(row(value,'stage-iii').ci_lower>0);
  assert.equal(value.groups.find(group=>group.pooled)?.pooled.k,2);
  assert.equal(JSON.stringify(inputs),before,'source records stay immutable');
});

test('subgroup-only evidence is initially included and overlapping alternatives can replace it',()=>{
  const inputs=[result('largest',{cohort:'large',subgroup:true,n:60}),result('smaller',{cohort:'small',subgroup:true,n:20})];
  const value=run(inputs);assert.deepEqual(selected(value),['largest']);
  assert.equal(row(value,'largest').selection_reason,'included_subgroup_only');
  assert.equal(row(value,'smaller').selection_reason,'alternative_subgroup');
  const changed=run(inputs,{inclusionOverrides:{smaller:true},inclusionOrder:['smaller']});
  assert.deepEqual(selected(changed),['smaller']);assert.equal(row(changed,'smaller').selection_source,'manual');
});

test('explicit parent or subgroup choices replace each other in last-click order',()=>{
  const inputs=[result('overall'),result('subgroup',{cohort:'child',subgroup:true,n:40})],overrides={overall:true,subgroup:true};
  assert.deepEqual(selected(run(inputs,{inclusionOverrides:overrides,inclusionOrder:['overall','subgroup']})),['subgroup']);
  assert.deepEqual(selected(run(inputs,{inclusionOverrides:overrides,inclusionOrder:['subgroup','overall']})),['overall']);
  assert.deepEqual(selected(run(inputs,{inclusionOverrides:{overall:false}})),[],'unchecking a study does not silently enable its subgroup');
});

test('separately recruited cohorts remain independent even when they share one NCT',()=>{
  const inputs=[result('cohort-a',{cohort:'nct:one:cohort-a',root:'nct:one:cohort-a',n:30}),result('cohort-b',{cohort:'nct:one:cohort-b',root:'nct:one:cohort-b',n:10})];
  inputs[0].analysis.cohort.scope='independent_cohort';inputs[0].analysis.cohort.label='Cohort A';
  inputs[1].analysis.cohort.scope='independent_cohort';inputs[1].analysis.cohort.label='Cohort B';
  const value=run(inputs);assert.deepEqual(selected(value),['cohort-a','cohort-b']);
  assert.equal(new Set(value.groups[0].selected.map(row=>row.label)).size,2);
  assert.equal(value.groups[0].pooled.k,2);
  assert.equal(new Set(value.groups[0].selected.map(row=>row.study_id)).size,2);
});

test('latest supported estimate wins within the same established cohort even when its analysis N changes',()=>{
  const inputs=[result('full-old',{n:100,year:2020}),result('full-latest',{n:100,year:2023,estimate:.65}),result('later-smaller',{n:80,year:2025,estimate:.6})];
  const value=run(inputs);assert.deepEqual(selected(value),['later-smaller']);
  assert.equal(row(value,'full-latest').selection_reason,'superseded_same_trial');
});

test('aggregate and component checkboxes change only the explicitly chosen evidence and never double count',()=>{
  const overall=result('aggregate',{cohort:'aggregate-root',root:'aggregate-root',n:56});
  const children=[20,20,16].map((n,i)=>result('cohort-'+i,{cohort:'cohort-'+i,root:'cohort-'+i,n}));
  for(const child of children){child.analysis.cohort.aggregate_parent_root_id='aggregate-root';child.analysis.cohort.scope='independent_cohort';}
  const rows=[overall,...children],baseline=run(rows);
  assert.deepEqual(selected(baseline),['aggregate']);
  assert.equal(row(baseline,'cohort-0').selection_reason,'represented_by_aggregate');
  const split=run(rows,{inclusionOverrides:{'cohort-0':true},inclusionOrder:['cohort-0']});
  assert.deepEqual(selected(split),['cohort-0'],'choosing one component does not silently select its siblings');
  assert.equal(row(split,'aggregate').selection_reason,'aggregate_replaced_by_cohorts');
  assert.equal(split.groups[0].pooled,null);assert.equal(split.groups[0].single.k,1);
  const two=run(rows,{inclusionOverrides:{'cohort-0':true,'cohort-1':true},inclusionOrder:['cohort-0','cohort-1']});
  assert.deepEqual(selected(two),['cohort-0','cohort-1']);assert.equal(two.groups[0].pooled.k,2);
  const childUnchecked=run(rows,{inclusionOverrides:{'cohort-0':false},inclusionOrder:['cohort-0','cohort-0']});
  assert.deepEqual(selected(childUnchecked),[],'unchecking the selected child does not reactivate the aggregate or siblings');
  const withoutParent=run(rows,{inclusionOverrides:{aggregate:false},inclusionOrder:['aggregate']});
  assert.deepEqual(selected(withoutParent),[],'unchecking the default aggregate does not activate its components');
  const back=run(rows,{inclusionOverrides:{'cohort-0':true,aggregate:true},inclusionOrder:['cohort-0','aggregate']});
  assert.deepEqual(selected(back),['aggregate']);
  assert.deepEqual(selected(run(children)),['cohort-0','cohort-1','cohort-2'],'without an aggregate the independent components are initially included');
  assert.deepEqual(selected(run(rows)),['aggregate'],'reset restores the aggregate default');
});

test('missing N stays reviewable but is excluded from pooling by the user inclusion policy',()=>{
  const value=run([result('unknown-n',{n:null}),result('known-n',{study:'trial-b',n:200})]);
  assert.deepEqual(selected(value),['known-n','unknown-n']);assert.equal(row(value,'unknown-n').sample_n,null);assert.equal(row(value,'unknown-n').included,false);assert.equal(row(value,'unknown-n').selection_reason,'missing_supported_sample_size');
  assert.equal(value.groups[0].pooled,null);assert.equal(value.groups[0].selected.length,1);
  const same=run([result('older',{n:100,year:2020}),result('latest-n-unreported',{n:null,year:2025,estimate:.6})]);
  assert.deepEqual(selected(same),['older']);assert.equal(row(same,'latest-n-unreported').selection_reason,'missing_supported_sample_size');
});

test('active filter selects its supported subgroup and removes the unmatched overall result across groups',()=>{
  const inputs=[result('overall'),result('stage-iii',{cohort:'child',subgroup:true,n:40,keys:['stage']})];
  const value=run(inputs,{advanced:advanced({overall:{matched:false},'stage-iii':{matched:true,specificity:1,matched_keys:['stage'],direct_keys:['stage']}})});
  assert.deepEqual(selected(value),['stage-iii']);
  assert.equal(row(value,'overall').selection_reason,'outside_advanced_filters');
  assert.equal(row(value,'overall').selectable,false);
  assert.equal(row(value,'stage-iii').selection_reason,'included_filter_subgroup');
});

test('a matching overall population is not unnecessarily narrowed to an LDH child',()=>{
  const inputs=[result('overall',{label:'Stage III'}),result('ldh-child',{cohort:'child',subgroup:true,label:'Stage III with normal LDH',n:40})];
  const value=run(inputs,{advanced:advanced({overall:{matched:true,specificity:1,matched_keys:['stage']},'ldh-child':{matched:true,specificity:1,matched_keys:['stage']}})});
  assert.deepEqual(selected(value),['overall']);assert.equal(row(value,'ldh-child').selection_reason,'represented_by_overall');
});

test('directly supported requested subgroup may replace only-inherited matching overall context',()=>{
  const inputs=[result('overall'),result('stage-iii',{cohort:'child',subgroup:true,n:40,keys:['stage']})];
  const value=run(inputs,{advanced:advanced({overall:{matched:true,specificity:0,matched_keys:['stage']},'stage-iii':{matched:true,specificity:1,matched_keys:['stage']}})});
  assert.deepEqual(selected(value),['stage-iii']);
});

test('stage III subgroup and whole stage III cohort share a compatible filtered pool',()=>{
  const inputs=[result('subgroup',{cohort:'child',subgroup:true,n:40,keys:['stage']}),result('whole-stage-iii',{study:'trial-b',label:'Stage III',n:80})];
  const value=run(inputs,{advanced:advanced({subgroup:{matched:true,specificity:1,matched_keys:['stage']},'whole-stage-iii':{matched:true,specificity:1,matched_keys:['stage']}})});
  assert.equal(value.groups.length,1);assert.equal(value.groups[0].pooled.k,2);
});

test('subgroup restrictions remain labelled when independently selected studies share one filtered pool',()=>{
  const inputs=[result('stage-pdl1',{cohort:'child',subgroup:true,label:'Stage III, PD-L1 positive',n:40}),result('whole-stage-iii',{study:'trial-b',label:'Stage III',n:80})];
  const value=run(inputs,{advanced:advanced({'stage-pdl1':{matched:true,specificity:1,matched_keys:['stage']},'whole-stage-iii':{matched:true,specificity:1,matched_keys:['stage']}})});
  assert.equal(value.groups.length,1);assert.equal(value.groups[0].pooled.k,2);
  assert.equal(row(value,'stage-pdl1').cohort.label,'Stage III, PD-L1 positive');assert.equal(row(value,'whole-stage-iii').cohort.label,'Stage III');
});

test('independent subgroup-only cohorts share one analysis while retaining their population labels',()=>{
  const value=run([result('braf',{cohort:'braf',subgroup:true,label:'BRAF mutated'}),result('ldh',{study:'trial-b',cohort:'ldh',subgroup:true,label:'Elevated LDH'})]);
  assert.equal(value.groups.length,1);assert.equal(selected(value).length,2);assert.equal(value.groups[0].pooled.k,2);
  assert.equal(row(value,'braf').cohort.label,'BRAF mutated');assert.equal(row(value,'ldh').cohort.label,'Elevated LDH');
});

test('manual choices cannot defeat filters or incompatible source-model gates',()=>{
  const bad=result('bad');bad.analysis.compatibility.eligible=false;
  const value=run([bad,result('unmatched')],{inclusionOverrides:{bad:true,unmatched:true},advanced:advanced({bad:{matched:true,specificity:1},unmatched:{matched:false}})});
  assert.deepEqual(selected(value),[]);assert.equal(row(value,'bad').selectable,false);assert.equal(row(value,'unmatched').selectable,false);
});

test('no-CI single-study planning survives, but user exclusion suppresses planning as well as pooling',()=>{
  const value=run([result('no-ci',{ci:false})]);
  assert.equal(row(value,'no-ci').included,false);assert.equal(row(value,'no-ci').population_selected,true);
  assert.equal(row(value,'no-ci').planning_included,true);assert.equal(row(value,'no-ci').selectable,true);
  assert.equal(row(value,'no-ci').selection_reason,'unavailable_valid_precision');
  const omitted=run([result('no-ci',{ci:false})],{inclusionOverrides:{'no-ci':false}});
  assert.equal(row(omitted,'no-ci').planning_included,false);assert.equal(row(omitted,'no-ci').selection_reason,'manually_excluded');
});

test('consolidation merges same-cohort R2/R3 while preserving equally valued different population rows',()=>{
  const overall=result('overall'),duplicate=result('r2');duplicate.pmid=overall.pmid;duplicate.analysis.source_stages=['R2'];duplicate.analysis.source_completeness=0;
  overall.analysis.filter_bindings=[{result_id:'R3-source'}];duplicate.analysis.filter_bindings=[{result_id:'R2-source'}];
  const subgroup=result('subgroup',{cohort:'child',subgroup:true,n:100});subgroup.pmid=overall.pmid;
  const value=run([overall,duplicate,subgroup]);assert.equal(value.tableRows.length,2);
  assert.equal(value.tableRows.find(row=>!row.cohort.is_subgroup).merged_record_ids.length,2);
  assert.equal(value.tableRows.find(row=>!row.cohort.is_subgroup).comparison.analysis.filter_bindings.length,2);
  assert.equal(value.tableRows.filter(row=>row.cohort.is_subgroup).length,1);
});
