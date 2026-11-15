'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const compact=require('../dist/quantitative_extraction.js');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../../data/audits/combined_identical_rows_20261108/unequal_n_fixture.json'),'utf8'));
function fresh(){
  const article=fixture.articles.find(article=>article.pmid==='39915002'),audit=fixture.matching_name_groups.find(group=>group.pmid==='39915002'&&group.group==='Phase Ia');
  return structuredClone({study:{pmid:article.pmid,report_id:article.records[0].record.report_id,details:{quantitative_extraction:article.records}},registry:fixture.evidence_registry,groups:audit.rows.map(row=>({comparisons:row.comparison_scopes,results:[],context_counts:[]}))});
}
test('OH2 Phase Ia shows source-checked single dose, multiple doses and all labels consistently across R2/R3',()=>{
  const data=fresh(),before=JSON.stringify(data);
  assert.deepEqual(data.groups.map(group=>compact.presentationGroupLabel(data.study,group,{registry:data.registry})),['Phase Ia · single dose','Phase Ia · multiple doses','Phase Ia · all','Phase Ia · single dose','Phase Ia · multiple doses']);
  const combined={comparisons:[...data.groups[0].comparisons,...data.groups[3].comparisons]};
  assert.equal(compact.presentationGroupLabel(data.study,combined,{registry:data.registry}),'Phase Ia · single dose');
  assert.equal(JSON.stringify(data),before);
});
test('different schedules never receive one schedule label, and unknown groups are unchanged',()=>{
  const data=fresh();
  assert.equal(compact.presentationGroupLabel(data.study,{comparisons:[...data.groups[0].comparisons,...data.groups[1].comparisons]},{registry:data.registry}),null);
  for(const mutate of [
    group=>{group.comparisons[0].outcome_arm_id='a_ia_106';group.comparisons[0].intervention_arm_id='a_ia_106';},
    group=>{group.comparisons[0].scope.population_id=group.comparisons[0].scope.population_id.replace('p_ia','p_ib');},
    group=>{group.comparisons[0].scope.source_input_sha256='a'.repeat(64);},
    group=>{group.comparisons[0].scope.review_binding_sha256='b'.repeat(64);},
    group=>{group.comparisons[0].comparator_arm_id='other';}
  ]){const changed=fresh();mutate(changed.groups[0]);assert.equal(compact.presentationGroupLabel(changed.study,changed.groups[0],{registry:changed.registry}),null);}
});
test('OH2 schedule labels require retained source evidence, arm schedules and documented component counts',()=>{
  for(const mutate of [
    data=>{data.registry={};},
    data=>{data.study.pmid='123';},
    data=>{data.study.details.quantitative_extraction[0].record.arms.find(arm=>arm.id==='a_ia_single').nodes.forEach(node=>{node.schedule='NA';});},
    data=>{data.study.details.quantitative_extraction[0].record.sample_sizes.find(count=>count.id==='n_ia_single').n=8;},
    data=>{const key=Object.keys(data.registry).find(key=>key.startsWith('CE-d9ec8e9654df55823ace1540-')&&key.endsWith('span-7e34b6b75f844ca108143331'));data.registry[key].source_id='foreign-source';}
  ]){const data=fresh();mutate(data);assert.equal(compact.presentationGroupLabel(data.study,data.groups[0],{registry:data.registry}),null);}
});
