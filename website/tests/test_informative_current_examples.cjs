'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js'),regimens=require('../dist/regimen_definitions.js');
const fixture=require('../../data/audits/repeated_sample_sizes_20261109/target_fixture.json');
const baseline=require('../../data/audits/informative_rows_20261109/before_all_presentation_rows.json');
const original=JSON.stringify(fixture);
const articles=new Map(fixture.articles.map(article=>[article.pmid,article]));
const merged=clinical.merge([],{}, {...fixture.clinical_meta,articles:fixture.clinical,evidence_registry:fixture.evidence_registry});
const studies=regimens.prepareStudies(merged.studies.map(study=>({...study,quantitative_only:true,details:{...study.details,quantitative_extraction:articles.get(study.pmid).records}})));
function display(pmid,selection={}){
 const match=charts.filterStudies(studies,{...selection,evidence_registry:merged.evidence_registry}).find(row=>row.study.pmid===pmid);
 assert(match,`PMID ${pmid} should remain eligible for the selected display`);
 const groups=charts.studyTablePresentationRows(match,{registry:merged.evidence_registry});
 return {match,groups,views:groups.map(group=>charts.studyTablePresentation({...match,...group},{registry:merged.evidence_registry}))};
}
const ns=view=>[...new Set(view.samples.map(sample=>sample.sample_size))].sort();
const sourceID=(pmid,row)=>JSON.stringify([pmid,row.review_stage,row.source_input_sha256,row.quantitative_record?.id]);

test('41606121 shows one melanoma N20 cohort with the specific sequential regimen',()=>{
 const {groups,views}=display('41606121');assert.equal(groups.length,1);assert.deepEqual(ns(views[0]),['20']);
 assert.match(groups[0].intervention_label,/ipilimumab/i);assert.match(groups[0].intervention_label,/nivolumab/i);
 assert.match(groups[0].intervention_label,/→|followed/i);assert.doesNotMatch(groups[0].intervention_label,/PD-1 inhibitor|CTLA-4 inhibitor/);
 assert.match(views[0].group,/Advanced/i);assert(views[0].effects.some(effect=>effect.value.includes('53.1 %–88.8 %')));
 assert.deepEqual([...new Set(groups[0].results.map(row=>row.review_stage))].sort(),['R2','R3']);
});

test('42320980 shows one N38 cohort with the more informative population label',()=>{
 const {groups,views}=display('42320980');assert.equal(groups.length,1);assert.deepEqual(ns(views[0]),['38']);
 assert.match(views[0].group,/CPI-experienced/i);assert.match(views[0].group,/advanced\/metastatic/i);assert.match(groups[0].intervention_label,/lomvastomig/i);
 assert(views[0].effects.some(effect=>effect.value.includes('2.2 %–19.2 %')));assert(views[0].effects.some(effect=>effect.value.includes('1.8 (1.7–2; 90% CI) months')));
});

test('42467079 refines generic immunotherapy to Pembrolizumab and retains both genuine age subgroups',()=>{
 const {groups,views}=display('42467079');assert.equal(groups.length,3);
 assert.deepEqual(views.map(ns).flat().sort(),['19','77','96']);
 assert.equal(views.filter(view=>ns(view).includes('96')).length,1);
 assert(groups.every(group=>group.intervention_label==='Pembrolizumab'));
 assert.equal(views.find(view=>ns(view).includes('19')).group,'Age >75 years');
 assert.equal(views.find(view=>ns(view).includes('77')).group,'Age <75 years');
});

test('current-source cohort refinements retain all source result identities and distinct values',()=>{
 for(const pmid of articles.keys()){
  const {groups,views}=display(pmid),old=baseline.filter(row=>row.pmid===pmid);
  const actual=new Set(groups.flatMap(group=>group.results.map(row=>sourceID(pmid,row))));
  for(const row of old)for(const result of row.result_scopes)assert(actual.has(JSON.stringify([pmid,result.stage,result.source,result.id])),`${pmid}: lost source result ${result.id}`);
  const values=views.flatMap(view=>[...view.effects,...(view.outcome_reconciliation?.original_effects||[]),...(view.outcome_reconciliation?.selections||[]).flatMap(s=>s.alternatives)].map(effect=>effect.value));
  for(const value of new Set(old.flatMap(row=>row.effects.map(effect=>effect.value))))assert(values.some(current=>current===value||current.includes(value)),`${pmid}: lost distinct displayed value ${value}`);
 }
 assert.equal(JSON.stringify(fixture),original,'Presentation must not mutate saved evidence');
});

function csvRows(csv){return csv.replace(/^\uFEFF/,'').trim().split('\r\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match=>match[1].replace(/""/g,'"')));}

test('CSV uses the same consolidated rows and specific treatment labels as the table',()=>{
 const matches=[...articles.keys()].map(pmid=>display(pmid).match),rows=csvRows(charts.studyTableCSV(matches,{registry:merged.evidence_registry}));
 assert.equal(rows.length,6);
 for(const pmid of articles.keys()){
  const data=rows.slice(1).filter(row=>row[3]===pmid),{groups,views}=display(pmid);
  assert.equal(data.length,groups.length);
  data.forEach((row,index)=>{assert.equal(row[6],views[index].group);assert.equal(row[8],groups[index].intervention_label);assert.equal(row[10],ns(views[index]).join('; '));});
 }
});

test('Pembrolizumab filter retains the refined N96 cohort and its real N19/N77 subgroups',()=>{
 const {groups,views}=display('42467079',{intervention:'treatment-class:agent:pembrolizumab'});
 assert.equal(groups.length,3);assert.deepEqual(views.map(ns).flat().sort(),['19','77','96']);
 assert(groups.every(group=>group.intervention_label==='Pembrolizumab'));
 const whole=groups[views.findIndex(view=>ns(view).includes('96'))];
 assert.deepEqual([...new Set(whole.results.map(row=>row.review_stage))].sort(),['R2','R3'],'A drug filter should not discard results from its linked generic R2 description');
});
