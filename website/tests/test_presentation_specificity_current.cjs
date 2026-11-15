'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js'),regimens=require('../dist/regimen_definitions.js');
const fixture=require('../../data/audits/cohort_specificity_20261109/target_fixture.json');
const wanted=new Set(['37730278','36215121','21106722','28283736','42467079']);
const articles=new Map(Object.values(fixture.articles).filter(article=>wanted.has(article.pmid)).map(article=>[article.pmid,article]));
const merged=clinical.merge([],{}, {...fixture.clinical_meta,articles:Object.entries(fixture.clinical).filter(([pmid])=>wanted.has(pmid)).map(([,article])=>article),evidence_registry:fixture.evidence_registry});
const studies=regimens.prepareStudies(merged.studies.map(study=>({...study,quantitative_only:true,details:{...study.details,quantitative_extraction:articles.get(study.pmid).records}})));
function display(pmid,selection={}){
  const match=charts.filterStudies(studies,{...selection,evidence_registry:merged.evidence_registry}).find(row=>row.study.pmid===pmid);
  if(!match)return [];
  return charts.studyTablePresentationRows(match,{registry:merged.evidence_registry}).map(row=>({row,view:charts.studyTablePresentation({...match,...row},{registry:merged.evidence_registry})}));
}
const atN=(rows,n)=>rows.filter(({view})=>view.samples.some(sample=>sample.sample_size===String(n)));

test('drug browsing uses the supported field, not withheld subset-only drug names',()=>{
  const whole=atN(display('37730278'),515);assert.equal(whole.length,1);
  assert.doesNotMatch(whole[0].row.comparator_label,/nivolumab|pembrolizumab/i);
  assert.doesNotMatch(whole[0].row.intervention_label,/dabrafenib|trametinib/i);
  assert.equal(atN(display('37730278',{comparator:'treatment-class:agent:nivolumab'}),515).length,0);
  assert.equal(atN(display('37730278',{intervention:'treatment-class:agent:dabrafenib'}),515).length,0);
});

test('supported drug selection carries the complementary generic cohort results',()=>{
  const whole=atN(display('42467079',{intervention:'treatment-class:agent:pembrolizumab'}),96);
  assert.equal(whole.length,1);assert.equal(whole[0].row.intervention_label,'Pembrolizumab');
  assert.deepEqual([...new Set(whole[0].row.results.map(row=>row.review_stage))].sort(),['R2','R3']);
});

test('the more complete supported treatment description may come from R2',()=>{
  const til=atN(display('36215121',{intervention:'treatment-class:agent:nivolumab'}),11);
  assert.equal(til.length,1);assert.doesNotMatch(til[0].row.intervention_label,/4-1BB|aldesleukin/i);
  const vaccine=atN(display('21106722'),75);assert.equal(vaccine.length,1);
  assert.match(vaccine[0].row.intervention_label,/vaccine/i);
  assert.deepEqual([...new Set(vaccine[0].row.results.map(row=>row.review_stage))].sort(),['R2','R3']);
});

test('one mucosal N8 cohort retains central and investigator response assessments',()=>{
  const rows=atN(display('28283736'),8);assert.equal(rows.length,1);
  const view=rows[0].view,main=view.effects.filter(effect=>/\bORR\b/.test(effect.label));assert.equal(main.length,1);assert.equal(main[0].value,'Review needed');
  const effects=view.outcome_reconciliation.selections.flatMap(s=>s.alternatives);
  assert(effects.some(effect=>/ORR/.test(effect.label)&&effect.assessment==='Central review'&&effect.value.startsWith('25 %')));
  assert(effects.some(effect=>/ORR/.test(effect.label)&&effect.assessment==='Investigator review'&&effect.value.startsWith('37.5 %')));
  for(const assessor of ['Central review','Investigator review'])assert(effects.some(effect=>/\bCR\b/.test(effect.label)&&effect.assessment===assessor&&effect.value==='0'));
});
