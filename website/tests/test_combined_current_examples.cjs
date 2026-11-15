'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js'),compact=require('../dist/quantitative_extraction.js'),regimens=require('../dist/regimen_definitions.js');
const fixture=require('../../data/audits/combined_identical_rows_20261108/target_fixture.json');
const before=JSON.stringify(fixture);
const merged=clinical.merge([],{}, {...fixture.clinical_meta,articles:Object.values(fixture.clinical),evidence_registry:fixture.evidence_registry});
const studies=regimens.prepareStudies(merged.studies.map(study=>({...study,quantitative_only:true,details:{...study.details,quantitative_extraction:fixture.articles[study.pmid].records}})));
const matches=charts.filterStudies(studies,{evidence_registry:merged.evidence_registry});
function display(pmid){const match=matches.find(row=>row.study.pmid===pmid),groups=charts.studyTablePresentationRows(match,{registry:merged.evidence_registry});return {match,groups,views:groups.map(group=>charts.studyTablePresentation({...match,...group},{registry:merged.evidence_registry}))};}

test('39752606 combines the source-linked N119 cohort while retaining lesion thresholds and other cohorts',()=>{
 const {groups,views}=display('39752606'),at=views.findIndex(view=>view.group==='Overall population with metastatic and brain metastases');
 assert.equal(views.filter(view=>view.group==='Overall population with metastatic and brain metastases').length,1);
 assert.equal(groups[at].presentation_members.length,8);assert.deepEqual(views[at].samples.map(sample=>sample.sample_size),['119']);
 const original=views[at].outcome_reconciliation.original_effects;
 assert(original.some(effect=>/5 mm/.test(effect.label)));assert(original.some(effect=>/10 mm/.test(effect.label)));
 assert.equal(views.length,3,'The source-linked whole-cohort count joins the outcome row; two genuine responder populations remain separate');
});

test('40885529 combines equal Ns while preserving interim and final source alternatives',()=>{
 const {groups,views}=display('40885529');assert.equal(groups.length,1);assert.equal(groups[0].presentation_members.length,3);
 assert.deepEqual(views[0].samples.map(sample=>sample.sample_size),['674']);assert.equal(groups[0].comparator_n,340);assert.equal(groups[0].intervention_n,334);
 const original=views[0].outcome_reconciliation.original_effects;
 assert(original.some(effect=>/Interim/.test(effect.label)));assert(original.some(effect=>/Final/.test(effect.label)));
 assert.equal(new Set(views[0].outcome_reconciliation.selections.map(s=>s.key)).size,views[0].outcome_reconciliation.selections.length);
});

test('39531423 merges the R2 and R3 row without losing either source record',()=>{
 const {groups,views}=display('39531423');assert.equal(groups.length,1);assert.equal(groups[0].presentation_members.length,2);
 assert.deepEqual(views[0].samples.map(sample=>sample.sample_size),['101']);assert.deepEqual([...new Set(groups[0].results.map(row=>row.review_stage))].sort(),['R2','R3']);
 for(const member of groups[0].presentation_members)for(const result of member.row.results)assert(groups[0].results.includes(result));
});

test('39915002 distinguishes Phase Ia single dose9, multiple doses6 and overall15',()=>{
 const {views}=display('39915002');
 for(const [label,n] of [['Phase Ia · single dose','9'],['Phase Ia · multiple doses','6'],['Phase Ia · all','15']]){
  const rows=views.filter(view=>view.group===label);assert.equal(rows.length,1,label);assert.deepEqual(rows[0].samples.map(sample=>sample.sample_size),[n]);
 }
 assert(views.some(view=>!view.group.startsWith('Phase Ia')),'Phase Ib and other groups are retained');
});

test('36162037 uses source-defined safety Ns and fails closed if proof or supplied N changes',()=>{
 const {match}=display('36162037'),rows=match.results.filter(row=>row.review_stage==='R3'&&['b1','b2','b3','b4'].includes(row.quantitative_record.id));assert.equal(rows.length,4);
 for(const row of rows){
  const expected=['b1','b3'].includes(row.quantitative_record.id)?916:917,shown=compact.presentationSampleSize(match.study,row,{registry:merged.evidence_registry});
  assert.equal(shown.n,expected);assert.equal(shown.label,'Safety');assert.equal(shown.basis,'source_checked_safety_population');
  assert.equal(compact.presentationSampleSize(match.study,row,{registry:{}}),null);
  const changed={...row,quantitative_record:{...row.quantitative_record,analysis_n:900}};assert.equal(compact.presentationSampleSize(match.study,changed,{registry:merged.evidence_registry}),null);
 }
});

test('36162037 DMFS retains the stage III result in details without a whole-trial denominator',()=>{
 const {match,groups,views}=display('36162037'),row=match.results.find(row=>row.review_stage==='R3'&&row.quantitative_record.id==='e5');assert(row);
 const hold=compact.presentationSampleSize(match.study,row,{registry:merged.evidence_registry});assert.equal(hold.n,null);assert.equal(hold.basis,'source_population_mismatch');
 for(const id of ['s17','s18','s19','s20']){const source=match.study.details.quantitative_results.find(row=>row.review_stage==='R3'&&row.quantitative_record.id===id);assert.equal(compact.presentationSampleSize(match.study,source,{registry:merged.evidence_registry}).n,null);}
 assert(groups.some(group=>group.results.includes(row)),'The raw result remains in the study container');assert(views.every(view=>view.effects.every(effect=>!effect.label.includes('DMFS'))));
 const html=compact.render(match.study,{registry:merged.evidence_registry});assert.match(html,/Baseline stage III/);assert.equal((html.match(/NA · stage III only/g)||[]).length,5);assert.match(html,/1\.01 \(0\.83–1\.23\)/);
 const changed={...row,quantitative_record:{...row.quantitative_record,analysis_n:1595}};assert.equal(compact.presentationSampleSize(match.study,changed,{registry:merged.evidence_registry}),null);
 assert.equal(row.quantitative_record.display_n.n,1844,'The original fallback is retained for audit, not rewritten');
});

test('36162037 RFS does not display the R2 treated fallback as a randomized analysis N',()=>{
 const {match,views}=display('36162037'),row=match.results.find(row=>row.review_stage==='R2'&&row.quantitative_record.id==='e1');assert(row);
 const hold=compact.presentationSampleSize(match.study,row,{registry:merged.evidence_registry});assert.equal(hold.n,null);assert.equal(hold.status,'unverified');
 assert(views.filter(view=>view.samples.some(sample=>sample.sample_size==='1833')).every(view=>view.effects.every(effect=>!effect.label.includes('RFS'))));assert(views.some(view=>view.samples.some(sample=>sample.sample_size==='1844')));
 for(const id of ['s1','s2']){const source=match.results.find(row=>row.review_stage==='R2'&&row.quantitative_record.id===id);assert.equal(compact.presentationSampleSize(match.study,source,{registry:merged.evidence_registry}).n,null);}
 const html=compact.render(match.study,{registry:merged.evidence_registry});assert.match(html,/All randomized/);assert.match(html,/NA · randomized population/);
 assert.equal(row.quantitative_record.display_n.n,1833,'The original R2 fallback remains auditable');
});

test('current-source consolidation and reviewed presentation mappings do not mutate saved evidence',()=>{
 for(const pmid of Object.keys(fixture.articles))display(pmid);
 assert.equal(JSON.stringify(fixture),before);
});
