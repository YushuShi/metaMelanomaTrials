'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js'),regimens=require('../dist/regimen_definitions.js');
const fixture=require('../../data/audits/outcome_conflicts_20261108/known_rounding_regressions_fixture.json');
const original=JSON.stringify(fixture);
const merged=clinical.merge([],{}, {...fixture.clinical_meta,articles:Object.values(fixture.clinical),evidence_registry:fixture.evidence_registry});
const studies=regimens.prepareStudies(merged.studies.map(study=>({...study,quantitative_only:true,details:{...study.details,quantitative_extraction:fixture.articles[study.pmid].records,outcome_display_reconciliation:fixture.saved_actions.filter(action=>String(action.pmid)===String(study.pmid))}})));
function views(pmid){
 const match=charts.filterStudies(studies,{evidence_registry:merged.evidence_registry}).find(row=>row.study.pmid===pmid);
 return charts.studyTablePresentationRows(match,{registry:merged.evidence_registry}).map(group=>charts.studyTablePresentation({...match,...group},{registry:merged.evidence_registry}));
}
const selections=pmid=>views(pmid).flatMap(view=>view.outcome_reconciliation.selections);
const selectedID=selection=>selection.selected_source&&JSON.parse(selection.selected_source)[3];
test('18765555 resolves all four 13/12.8 percent records to one original 12.8 percent tuple without a false warning',()=>{
 const choice=selections('18765555').find(s=>selectedID(s)==='r3_bin_orr_il2_12_8');
 assert(choice);assert.equal(choice.member_sources.length,4);assert.equal(choice.status,'selected');assert.equal(choice.unresolved_display_flag,false);
 assert.equal(choice.alternatives.find(a=>a.source===choice.selected_source).value,'12.8 %');
});
test('31558480 retains both original month-based median OS tuples instead of round-trip week-conversion artifacts',()=>{
 const choices=selections('31558480').filter(s=>s.label.startsWith('Median OS'));
 assert.equal(choices.length,2);
 assert(choices.every(s=>s.status==='selected'&&JSON.parse(s.selected_source)[0]==='R2'&&!s.unresolved_display_flag));
 assert.deepEqual(choices.map(s=>s.alternatives.find(a=>a.source===s.selected_source).value).sort(),['6.4 months','7.3 months']);
});
test('33785610 chooses all ten explicitly dated 2020 CR/PR analyses while preserving the earlier source alternatives',()=>{
 const choices=selections('33785610').filter(s=>/^(?:CR|PR)$/.test(s.label));
 assert.equal(choices.length,10);
 assert(choices.every(s=>s.status==='selected'&&selectedID(s).endsWith('_2020')&&!s.unresolved_display_flag));
 assert(choices.every(s=>s.member_sources.length>=2));
});
test('35074903 clears only the source-proven DCR rounding warning and preserves its complete original CI tuple',()=>{
 const choice=selections('35074903').find(s=>selectedID(s)==='bin-dcr-ipi');
 assert(choice);assert.equal(choice.status,'selected');assert.equal(choice.unresolved_display_flag,false);
 assert.equal(choice.alternatives.find(a=>a.source===choice.selected_source).value,'67 % (30 %–93 %)');
 assert(selections('35074903').some(s=>s.label.startsWith('ORR')&&s.status==='review_needed'));
});
test('known source-rounding and chronology resolutions do not mutate scientific fixture records',()=>assert.equal(JSON.stringify(fixture),original));
