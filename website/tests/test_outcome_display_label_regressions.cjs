'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js'),regimens=require('../dist/regimen_definitions.js');
const fixture=require('../../data/audits/outcome_conflicts_20261108/display_label_regressions_fixture.json');
const original=JSON.stringify(fixture);
const merged=clinical.merge([],{}, {...fixture.clinical_meta,articles:Object.values(fixture.clinical),evidence_registry:fixture.evidence_registry});
const studies=regimens.prepareStudies(merged.studies.map(study=>({...study,quantitative_only:true,details:{...study.details,quantitative_extraction:fixture.articles[study.pmid].records,outcome_display_reconciliation:fixture.saved_actions.filter(action=>String(action.pmid)===String(study.pmid))}})));
function views(pmid){const match=charts.filterStudies(studies,{evidence_registry:merged.evidence_registry}).find(row=>row.study.pmid===pmid);return charts.studyTablePresentationRows(match,{registry:merged.evidence_registry}).map(group=>charts.studyTablePresentation({...match,...group},{registry:merged.evidence_registry}));}
test('distinct AE grades receive distinct concise labels and retain the original figures',()=>{
 const cpk=views('36460017').flatMap(v=>v.effects).filter(e=>e.label.startsWith('Increased blood creatine phosphokinase'));
 assert.deepEqual(cpk.map(e=>[e.label,e.value]),[['Increased blood creatine phosphokinase · Any AE','53 %'],['Increased blood creatine phosphokinase · Grade 3–4 AE','22 %'],['Increased blood creatine phosphokinase · Any AE','48 %'],['Increased blood creatine phosphokinase · Grade 3–4 AE','18 %']]);
 const alt=views('38946469').flatMap(v=>v.effects).filter(e=>e.label.startsWith('Elevated alanine aminotransferase'));
 assert.deepEqual(alt.map(e=>[e.label,e.value]),[['Elevated alanine aminotransferase · Grade 3–4 AE','10.4 %'],['Elevated alanine aminotransferase · Any AE','18.8 %']]);
});
test('an absent dose label does not manufacture another ORR family in the same pediatric cohort',()=>{
 const view=views('29350463').find(v=>v.effects.some(e=>e.label==='ORR'));
 assert.equal(view.effects.filter(e=>e.label==='ORR').length,1);
 const orr=view.outcome_reconciliation.selections.find(s=>s.label==='ORR');assert(orr);
 assert(orr.alternatives.some(a=>a.value==='0'));assert(orr.alternatives.some(a=>a.value==='0 % (0 %–45.93 %)'));
});
test('identical displayed values remain visible without claiming scientific equivalence; differing tuples remain unresolved',()=>{
 const choices=views('22805292').flatMap(v=>v.outcome_reconciliation.selections);
 const identical=choices.filter(s=>s.proof?.kind==='identical_display_value');assert.equal(identical.length,6);
 for(const choice of identical){assert.equal(choice.status,'selected');assert.equal(choice.proof.scientific_equivalence,false);assert.equal(new Set(choice.alternatives.map(a=>a.value)).size,1);}
 const different=choices.find(s=>s.label==='Unconfirmed PR'&&s.alternatives.some(a=>a.value==='17 %'));
 assert(different);assert.equal(different.status,'review_needed');assert.equal(different.selected_source,null);
});
test('current AE and dose-label cases contain no exact repeated display label in any cohort and do not mutate sources',()=>{
 for(const pmid of Object.keys(fixture.articles))for(const view of views(pmid))assert.equal(new Set(view.effects.map(e=>e.label)).size,view.effects.length,pmid);
 assert.equal(JSON.stringify(fixture),original);
});
