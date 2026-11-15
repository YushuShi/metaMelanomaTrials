'use strict';
const sampleProof=require('./fixtures/pooling_sample_size.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Analysis=require('../dist/treatment_map_analysis.js'),Advanced=require('../dist/advanced_filters.js');
const run=(rows,extra={})=>Analysis.analyze(rows,{tailId:'b',headId:'a',endpoint:'OS:HR',...extra});
function record(id,fields={}){
  const {study=id,year=2025,estimate=.7,cohort=study,root=cohort,scope='overall',...overrides}=fields;
  const dimensions={design:'randomized_trial',setting:'advanced',subtype:'general_melanoma',previous_systemic:'unknown',braf:'unknown',model_family:'cox',adjusted:'no',estimand:'standard_os',population_scope:scope,assessment:'unspecified',...overrides};
  return {id,pmid:id,outcome:'OS',measure:'HR',estimate,ci_lower:estimate*.8,ci_upper:estimate*1.2,ci_level:95,intervention:{node_id:'a'},comparator:{node_id:'b'},study_name:study,
    analysis:{independent_id:study,independence_verified:true,design:'randomized_trial',publication_year:year,source_completeness:2,sample_size:sampleProof(id),
      cohort:{id:cohort,root_id:root,independent_group_id:root,scope,is_subgroup:scope==='subgroup',label:scope==='subgroup'?'Stage III':'Overall population',filter_equivalence_keys:scope==='subgroup'?['stage']:[],sample_n:100},
      compatibility:{...dimensions,key:JSON.stringify(Object.values(dimensions)),label:['randomized_trial',dimensions.setting,dimensions.subtype].join(' · '),eligible:true}}};
}
const included=result=>result.tableRows.filter(row=>row.included).map(row=>row.id).sort();
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);

test('setting and baseline BRAF/prior-treatment scope no longer create automatic separate pools',()=>{
  const rows=[record('adjuvant',{setting:'adjuvant'}),record('advanced',{setting:'advanced',braf:'mixed',previous_systemic:'untreated'})],before=JSON.stringify(rows);
  assert.notEqual(Analysis.semanticKey(rows[0]),Analysis.semanticKey(rows[1]),'source reconciliation remains separate');
  const result=run(rows),group=result.groups[0];assert.equal(result.groups.length,1);assert.equal(group.pooled.k,2);assert.equal(group.pooled.model,'fixed');
  assert.equal(new Set(group.display.map(row=>Analysis.semanticKey(row.comparison))).size,2);assert.equal(JSON.stringify(rows),before);
  assert.equal(run([record('known'),record('unknown-study',{setting:'unknown'})]).groups[0].pooled.k,2);
});

test('adjustment and missing model metadata do not split one endpoint pool',()=>{
  const rows=[record('adjusted',{adjusted:'yes'}),record('unadjusted',{adjusted:'no'}),record('unspecified-model',{model_family:'hazard_ratio_unspecified',adjusted:'unknown'})],before=JSON.stringify(rows);
  assert.equal(new Set(rows.map(Analysis.semanticKey)).size,3,'source metadata remains distinguishable');
  const result=run(rows);assert.equal(result.groups.length,1);assert.equal(result.groups[0].pooled.k,3);assert.equal(result.groups[0].pooled.model,'random');
  assert.deepEqual(included(result),['adjusted','unadjusted','unspecified-model']);assert.equal(JSON.stringify(rows),before);
});

test('incompatible effect quantities remain visible and cannot be forced into the endpoint pool',()=>{
  for(const model_family of ['accelerated_failure_time','subdistribution_hazard']){
    const rows=[record('first'),record('incompatible',{model_family})],before=JSON.stringify(rows);
    const result=run(rows,{inclusionOverrides:{incompatible:true}}),bad=result.tableRows.find(row=>row.id==='incompatible');
    assert.equal(result.groups.length,1);assert.deepEqual(included(result),['first']);assert.equal(result.groups[0].pooled,null);
    assert.equal(bad.selection_reason,'incompatible_effect_quantity');assert.equal(bad.selectable,false);assert.equal(bad.included,false);
    assert.equal(JSON.stringify(rows),before);
  }
});

test('disease control and distinct progression endpoints cannot enter the selected ORR or PFS pool',()=>{
  for(const [outcome,measure,definition]of [['ORR','RR','Disease control rate'],['PFS','HR','PFS2'],['PFS','HR','Intracranial progression-free survival']]){
    const good={...record('first'),outcome,measure},bad={...record('different-outcome'),outcome,measure,outcome_definition:definition};
    const result=run([good,bad],{endpoint:outcome+':'+measure,inclusionOverrides:{'different-outcome':true}});
    assert.deepEqual(included(result),['first']);assert.equal(result.groups.length,1);
    const held=result.tableRows.find(row=>row.id==='different-outcome');assert.equal(held.selection_reason,'incompatible_effect_quantity');assert.equal(held.selectable,false);
  }
});

test('same observational cohort prefers its adjusted estimate even when the unadjusted result is marked primary',()=>{
  const rows=[record('unadjusted',{study:'observational',design:'observational',adjusted:'no'}),record('adjusted',{study:'observational',design:'observational',adjusted:'yes',estimate:.6}),record('other')];
  for(const row of rows.slice(0,2))row.analysis.design='observational';
  rows[0].analysis.primary_analysis=true;
  const before=JSON.stringify(rows),result=run(rows);
  assert.deepEqual(included(result),['adjusted','other']);assert.equal(result.groups.length,1);assert.equal(result.groups[0].pooled.k,2);
  assert.equal(result.tableRows.find(row=>row.id==='unadjusted').included,false);
  const explicit=run(rows,{inclusionOverrides:{unadjusted:true},inclusionOrder:['unadjusted']});
  assert.deepEqual(included(explicit),['other','unadjusted']);assert.equal(explicit.groups[0].pooled.k,2,'manual representative replacement does not add another cohort');
  assert.equal(JSON.stringify(rows),before);
});

test('published ipilimumab add-on OS pools all three independent trials and checkboxes determine k',()=>{
  const graph=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/data/treatment_map.json'),'utf8')),before=JSON.stringify(graph.comparisons);
  const head=graph.nodes.find(node=>node.components.length===2&&node.components.includes('ipilimumab')&&node.components.includes('nivolumab')).id;
  const options={tailId:'agent:ipilimumab',headId:head,endpoint:'OS:HR'},result=Analysis.analyze(graph.comparisons,options);
  assert.equal(result.groups.length,1);const group=result.groups[0];assert.equal(group.pooled.k,3);assert.equal(group.pooled.model,'random');
  assert.deepEqual(group.selected.map(row=>row.pmid).sort(),['27622997','37592104','39282897']);
  const excluded={},order=['37592104','39282897','27622997'];
  for(let i=0;i<order.length;i++){
    excluded[group.selected.find(row=>row.pmid===order[i]).id]=false;
    const changed=Analysis.analyze(graph.comparisons,{...options,inclusionOverrides:excluded}),selected=changed.groups[0];assert.equal(changed.groups.length,1);assert.equal(selected.selected.length,2-i);
    if(i===0){assert.equal(selected.pooled.model,'fixed');close(selected.pooled.estimate,.5509958810730318);}
    if(i===1){assert.equal(selected.pooled,null);close(selected.single.estimate,.74);}
    if(i===2){assert.equal(selected.pooled,null);assert.equal(selected.single,null);assert.equal(included(changed).length,0);}
  }
  assert.equal(JSON.stringify(graph.comparisons),before);
});

test('same-cohort reports cannot inflate k or reactivate after the latest report is unchecked',()=>{
  const old=record('old',{study:'same',year:2020,setting:'adjuvant',previous_systemic:'treated'}),latest=record('latest',{study:'same',year:2025,setting:'advanced',previous_systemic:'untreated',estimate:.6}),other=record('other');
  const baseline=run([old,latest,other]);assert.deepEqual(included(baseline),['latest','other']);assert.equal(baseline.groups[0].pooled.k,2);
  const disabled=run([old,latest,other],{inclusionOverrides:{latest:false}});assert.deepEqual(included(disabled),['other']);assert.equal(disabled.groups[0].pooled,null);
  assert.equal(disabled.tableRows.find(row=>row.id==='old').included,false);
});

test('source-bound filters narrow the broad pool and relevant subgroup replaces its overlapping overall cohort',()=>{
  const overall=record('overall'),subgroup=record('stageiii',{study:'overall',cohort:'stageiii',root:'overall',scope:'subgroup'}),other=record('other',{setting:'adjuvant'});
  const noFilter=run([overall,subgroup,other]);assert.deepEqual(included(noFilter),['other','overall']);assert.equal(noFilter.groups.find(g=>g.pooled).pooled.k,2);
  const advanced={active:true,selections:{stage:'iii'},matches:{overall:{matched:false},stageiii:{matched:true,specificity:1,matched_keys:['stage']},other:{matched:true,specificity:1,matched_keys:['stage']}}};
  const filtered=run([overall,subgroup,other],{advanced});assert.deepEqual(included(filtered),['other','stageiii']);assert.equal(filtered.groups.find(g=>g.pooled).pooled.k,2);
  assert.equal(filtered.tableRows.find(row=>row.id==='overall').selection_reason,'outside_advanced_filters');
});

test('released nivolumab versus ipilimumab OS uses latest N-qualified CheckMate238 and067 results with invariant precision',()=>{
  const graph=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/data/treatment_map.json'),'utf8')),before=JSON.stringify(graph.comparisons);
  const options={tailId:'agent:ipilimumab',headId:'agent:nivolumab',endpoint:'OS:HR'},result=Analysis.analyze(graph.comparisons,options),group=result.groups.find(g=>g.pooled);
  assert(group);assert.equal(group.pooled.k,2);assert.equal(group.pooled.model,'fixed');assert.deepEqual(group.selected.map(row=>row.pmid).sort(),['37058595','39282897']);
  close(group.pooled.estimate,.7002948454577509);close(group.pooled.ci_lower,.6002465842413343);close(group.pooled.ci_upper,.8170190109362131);
  assert(group.diagnostics.leave_one_out.every(row=>row.model==='individual'));assert.equal(group.diagnostics.egger.available,false);assert.equal(group.diagnostics.funnel.length,2);
  const reverse=Analysis.analyze(graph.comparisons,{...options,tailId:options.headId,headId:options.tailId}).groups.find(g=>g.pooled);close(reverse.pooled.estimate,1/group.pooled.estimate);close(reverse.pooled.ci_lower,1/group.pooled.ci_upper);
  const classifications=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/data/clinical_classifications.json'),'utf8'));
  for(const [setting,pmid]of [['adjuvant_resected','32961119'],['unresectable_metastatic','39282897']]){
    const selections={setting},matches={};
    for(const comparison of graph.comparisons){const bound=(comparison.analysis?.filter_bindings||[]).filter(row=>Advanced.resultMatches(row,selections,{classifications}));matches[comparison.id]={matched:bound.length>0,specificity:bound.length?1:0,matched_keys:bound.length?['setting']:[]};}
    const narrowed=Analysis.analyze(graph.comparisons,{...options,advanced:{active:true,selections,matches}}),includedRows=narrowed.tableRows.filter(row=>row.included);
    assert.deepEqual(includedRows.map(row=>row.pmid),[pmid]);assert(narrowed.groups.every(g=>!g.pooled));
    assert.equal(narrowed.groups.length,1);
  }
  const ids=group.selected.map(row=>row.id),unchecked=Analysis.analyze(graph.comparisons,{...options,inclusionOverrides:{[ids[0]]:false,[ids[1]]:false}});
  assert.equal(unchecked.groups.find(g=>g.key===group.key).selected.length,0,'unchecking latest reports never reactivates old reports in that analysis');
  assert.ok(unchecked.tableRows.filter(row=>row.included).every(row=>row.group_key!==group.key),'unchecked cohorts do not survive in another analysis');
  assert.equal(JSON.stringify(graph.comparisons),before);
});
