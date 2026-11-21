'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js'),regimens=require('../dist/regimen_definitions.js');
const fixture=require('../../data/audits/outcome_conflicts_20261108/current_examples_fixture.json');
const before=JSON.stringify(fixture);
const merged=clinical.merge([],{}, {...fixture.clinical_meta,articles:Object.values(fixture.clinical),evidence_registry:fixture.evidence_registry});
const studies=regimens.prepareStudies(merged.studies.map(study=>({...study,quantitative_only:true,details:{...study.details,quantitative_extraction:fixture.articles[study.pmid].records}})));
function display(pmid){
 const match=charts.filterStudies(studies,{evidence_registry:merged.evidence_registry}).find(row=>row.study.pmid===pmid);
 assert(match);
 const groups=charts.studyTablePresentationRows(match,{registry:merged.evidence_registry});
 return {match,groups,views:groups.map(group=>charts.studyTablePresentation({...match,...group},{registry:merged.evidence_registry}))};
}
const effects=pmid=>display(pmid).views.flatMap(view=>view.effects);
const hasN=(view,n)=>view.samples.some(sample=>sample.sample_size===String(n));

test('41768125 chooses the more precise source tuples once and preserves all three PFS compartments',()=>{
 const shown=effects('41768125');
 for(const [site,value] of [['Intracranial','1.380 (1.020–1.970) months'],['Bicompartmental','1.220 (1.020–1.550) months'],['Extracranial','1.410 (1.150–4.080) months']]){
  const rows=shown.filter(effect=>effect.label.includes(site)&&/PFS/.test(effect.label));
  assert.equal(rows.length,1,site);assert.equal(rows[0].value,value);
 }
 const os=shown.filter(effect=>/\bOS\b/.test(effect.label)&&/median/i.test(effect.label));assert.equal(os.length,1);assert.equal(os[0].value,'2.930 (1.220–4.310) months');
 assert(shown.every(effect=>!effect.label.includes('Conflicting extractions')));
 assert(shown.every(effect=>!['1.400 (1.000–2.000) months','2.900 (1.200–4.300) months'].includes(effect.value)));
});

test('42550831 keeps first and total PFS distinct in each TKa population',()=>{
 const {views}=display('42550831');
 for(const [n,first,total] of [[41,'43.300 %','60.800 %'],[40,'27.500 %','35.000 %']]){
  const shown=views.filter(view=>hasN(view,n)).flatMap(view=>view.effects);
  assert(shown.some(effect=>/First.*PFS|PFS.*First/i.test(effect.label)&&effect.value.includes(first)),`N${n}: first PFS`);
  assert(shown.some(effect=>/Total.*PFS|PFS.*Total/i.test(effect.label)&&effect.value.includes(total)),`N${n}: total PFS`);
 }
});

test('42852354 shows one overall ORR and one separate intracranial ORR',()=>{
 const shown=effects('42852354'),overall=shown.filter(effect=>/Overall.*ORR|ORR.*Overall/i.test(effect.label)),intracranial=shown.filter(effect=>/Intracranial.*ORR|ORR.*Intracranial/i.test(effect.label));
 assert.equal(overall.length,1);assert.match(overall[0].value,/58\.300 %.*44\.900 %–70\.900 %/);
 assert.equal(intracranial.length,1);assert.match(intracranial[0].value,/46\.700 %.*33\.700 %–60\.000 %/);
});

test('unranked assessor and criterion alternatives stay in details behind one main outcome entry',()=>{
 const mucosal=display('28283736').views.find(view=>hasN(view,8));assert(mucosal);
 const mainORR=mucosal.effects.filter(effect=>/\bORR\b/.test(effect.label));assert.equal(mainORR.length,1);assert.equal(mainORR[0].value,'Review needed');
 const alternatives=mucosal.outcome_reconciliation.selections.flatMap(selection=>selection.alternatives);
 assert(alternatives.some(item=>item.assessment==='Central review'&&item.value.startsWith('25.000 %')));
 assert(alternatives.some(item=>item.assessment==='Investigator review'&&item.value.startsWith('37.500 %')));
 const thresholds=display('39752606').views.find(view=>hasN(view,119));assert(thresholds);
 const original=thresholds.outcome_reconciliation.original_effects;
 assert(original.some(effect=>effect.label.includes('5 mm')));assert(original.some(effect=>effect.label.includes('10 mm')));
 assert(original.some(effect=>effect.label.includes('mRECIST')));
 assert.equal(new Set(thresholds.outcome_reconciliation.selections.map(selection=>selection.key)).size,thresholds.outcome_reconciliation.selections.length);
});

test('presentation reconciliation never changes saved quantitative records',()=>{
 for(const pmid of Object.keys(fixture.articles))display(pmid);
 assert.equal(JSON.stringify(fixture),before);
});
