'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js'),regimens=require('../dist/regimen_definitions.js');
const audit='../../data/audits/cohort_specificity_20261109/';
const fixture=require(audit+'target_fixture.json'),baseline=require(audit+'before_all_presentation_rows.json'),rules=require(audit+'same_source_alias_rules.json');
const original=JSON.stringify(fixture);
const merged=clinical.merge([],{}, {...fixture.clinical_meta,articles:Object.values(fixture.clinical),evidence_registry:fixture.evidence_registry});
const studies=regimens.prepareStudies(merged.studies.map(study=>({...study,quantitative_only:true,details:{...study.details,quantitative_extraction:fixture.articles[study.pmid].records}})));
function display(pmid,selection={}){
 const match=charts.filterStudies(studies,{...selection,evidence_registry:merged.evidence_registry}).find(row=>row.study.pmid===pmid);
 assert(match,`PMID ${pmid} remains eligible`);
 const groups=charts.studyTablePresentationRows(match,{registry:merged.evidence_registry});
 return {match,groups,views:groups.map(group=>charts.studyTablePresentation({...match,...group},{registry:merged.evidence_registry}))};
}
const ns=view=>[...new Set(view.samples.map(sample=>sample.sample_size))].sort();
const hasN=(view,n)=>ns(view).includes(String(n));

test('all eight source-confirmed same-source aliases consolidate their original comparison containers',()=>{
 assert.equal(rules.length,8);
 for(const rule of rules){
  const [pmid,a,b]=rule.pair_id.split(':'),old=baseline.filter(row=>row.pmid===pmid&&[+a,+b].includes(row.row));
  assert.equal(old.length,2);
  const ids=new Set(old.flatMap(row=>row.comparison_scopes.map(c=>c.id))),{groups}=display(pmid);
  const resultIDs=old.flatMap(row=>row.result_scopes.map(r=>JSON.stringify([r.stage,r.source,r.id])));
  assert(groups.some(group=>[...ids].every(id=>group.comparisons.some(c=>c.comparison_id===id))&&resultIDs.every(id=>group.results.some(r=>JSON.stringify([r.review_stage,r.source_input_sha256,r.quantitative_record?.id])===id))),`${rule.pair_id}: source-confirmed aliases were not consolidated`);
 }
});

test('equal N does not merge different pathology, randomized-arm, or drug populations',()=>{
 for(const [pmid,n,count] of [['39417680',15,2],['42640721',7,2],['42190314',23,2],['38801446',7,2]]){
  const {views}=display(pmid);assert.equal(views.filter(view=>hasN(view,n)).length,count,`${pmid}: distinct N${n} populations`);
 }
 const {views}=display('38167503');assert.equal(views.filter(view=>hasN(view,69)).length,3,'Only Arm A efficacy/safety is aliased; the other equal-N arms remain distinct');
});

test('a reviewed count-only R3 cohort joins its R2 outcome row while keeping the other treatment cohort separate',()=>{
 const {groups,views}=display('33939387');assert.equal(groups.length,2);
 assert.deepEqual(views.map(ns).flat().sort(),['18','29']);
 const group=groups[views.findIndex(view=>hasN(view,29))];
 assert(group.results.some(row=>row.review_stage==='R2'&&row.quantitative_record?.id==='os-median-ici'));
 assert((group.context_counts||[]).some(row=>row.review_stage==='R3'&&row.quantitative_record?.id==='r3-ss-ici'));
});

test('population and sequence preferences preserve the actual inclusive cohort and alternating treatment',()=>{
 const tadalafil=display('28932631'),whole=tadalafil.views.filter(view=>hasN(view,12));
 assert.equal(whole.length,1);assert.doesNotMatch(whole[0].group,/pretreated/i);assert.match(whole[0].group,/treated.*metastatic/i);
 const alternating=display('1997108');assert(alternating.groups.some(group=>/→/.test(group.intervention_label)),'Alternating IL-2/interferon is not replaced by a concurrent AND regimen');
});

test('same mucosal cohort keeps one main response family and preserves both assessor alternatives',()=>{
 const {views}=display('28283736'),mucosal=views.filter(view=>hasN(view,8));assert.equal(mucosal.length,1);
 const main=mucosal[0].effects.filter(e=>/\bORR\b/.test(e.label));assert.equal(main.length,1);assert.equal(main[0].value,'Review needed');
 const alternatives=mucosal[0].outcome_reconciliation.selections.flatMap(s=>s.alternatives);
 assert(alternatives.some(e=>/ORR/.test(e.label)&&e.assessment==='Central review'&&e.value.startsWith('25 %')));
 assert(alternatives.some(e=>/ORR/.test(e.label)&&e.assessment==='Investigator review'&&e.value.startsWith('37.5 %')));
 for(const assessor of ['Central review','Investigator review'])assert(alternatives.some(e=>/\bCR\b/.test(e.label)&&e.assessment===assessor&&e.value==='0'));
});

test('refined rows retain previous result identities and display values without mutating evidence',()=>{
 const wanted=new Set(['28283736','37286303','33955714','39207855','38167503','28019090','19901107','28932631']);
 for(const pmid of wanted){
  const {groups,views}=display(pmid),old=baseline.filter(row=>row.pmid===pmid);
  const actual=new Set(groups.flatMap(group=>group.results.map(row=>JSON.stringify([row.review_stage,row.source_input_sha256,row.quantitative_record?.id]))));
  for(const row of old)for(const result of row.result_scopes)assert(actual.has(JSON.stringify([result.stage,result.source,result.id])),`${pmid}: lost result ${result.id}`);
  const values=views.flatMap(view=>[...view.effects,...(view.outcome_reconciliation?.original_effects||[]),...(view.outcome_reconciliation?.selections||[]).flatMap(s=>s.alternatives)].map(effect=>effect.value));
  for(const value of new Set(old.flatMap(row=>row.effects.map(effect=>effect.value))))assert(values.some(current=>current===value||current.includes(value)),`${pmid}: lost value ${value}`);
 }
 assert.equal(JSON.stringify(fixture),original);
});

test('CSV preserves the consolidated mucosal row with one unresolved response family',()=>{
 const {match,groups}=display('28283736'),csv=charts.studyTableCSV([match],{registry:merged.evidence_registry});
 const lines=csv.trim().split('\r\n');assert.equal(lines.length,groups.length+1);
 const rows=lines.slice(1).map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match=>match[1].replace(/""/g,'"')));
 const mucosal=rows.filter(row=>row[10]==='8');assert.equal(mucosal.length,1);assert.match(mucosal[0][11],/ORR.*Review needed/);
});
