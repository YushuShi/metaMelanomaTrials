'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const concise=require('../dist/concise_study_groups.js'),charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js'),regimens=require('../dist/regimen_definitions.js');
const payload=require('../../data/audits/group_count_priority_ui_20261108/target_fixture.json');
const m=clinical.merge([],{}, {...payload.clinical_meta,articles:Object.values(payload.clinical),evidence_registry:payload.evidence_registry});
const studies=regimens.prepareStudies(m.studies.map(s=>({...s,quantitative_only:true,details:{...s.details,quantitative_extraction:payload.articles[s.pmid].records}})));
const matches=charts.filterStudies(studies,{evidence_registry:m.evidence_registry});
function display(pmid){const match=matches.find(m=>m.study.pmid===pmid);return {match,groups:charts.studyTablePresentationRows(match,{registry:m.evidence_registry})};}
function sample(id,n,purpose,extra={}){return {source_input_sha256:'source',review_binding_sha256:'binding',review_stage:'R3',n:{value:n},quantitative_record:{id,n,count_purpose:purpose,population_id:'p1',arm_id:'a1',cutoff:'NA',complete:'yes',...extra}};}
test('analysis N wins over treated and enrolled for the same scoped cohort',()=>{
 const rows=[sample('enrolled',40,'enrolled'),sample('treated',36,'treated'),sample('analysis',31,'outcome_analysis')],before=JSON.stringify(rows);
 assert.deepEqual(concise.selectCounts({},rows),[rows[2]]);assert.deepEqual(concise.selectCounts({},rows.slice(0,2)),[rows[1]]);assert.deepEqual(concise.selectCounts({},rows.slice(0,1)),[rows[0]]);assert.equal(JSON.stringify(rows),before);
});
test('different phases, arms, dates, analysis denominators and conflicts remain distinct',()=>{
 const rows=[sample('a',31,'outcome_analysis'),sample('b',40,'enrolled',{population_id:'phase2'}),sample('c',36,'treated',{arm_id:'a2'}),sample('d',32,'outcome_analysis',{cutoff:'2025'}),sample('e',25,'outcome_analysis',{result_id:'response'})];
 assert.equal(concise.selectCounts({},rows).length,5);
 const bad={...sample('bad',45,'enrolled'),extraction_conflict:true};assert(concise.selectCounts({},[rows[0],bad]).includes(bad));
});
test('equal N alone cannot establish cross-stage cohort duplication',()=>{
 const a=sample('a',30,'treated'),b={...sample('b',30,'treated'),source_input_sha256:'another-source',review_stage:'R2'};
 assert.equal(concise.selectCounts({},[a,b]).length,2);
});
test('41732954 consolidates one source-proven cohort without changing raw records',()=>{
 const before=JSON.stringify(studies),{match,groups}=display('41732954');assert.equal(groups.length,1);
 const views=groups.map(g=>charts.studyTablePresentation({...match,...g},{registry:m.evidence_registry}));
 assert.equal(views[0].samples.length,1);assert.equal(views[0].samples[0].sample_size,'30');
 assert.equal(views[0].effects.filter(e=>e.label==='Median OS'&&e.value.includes('23.8')).length,1);assert(views[0].effects.some(e=>e.value.includes('50')));
 assert.equal(views[0].effects.filter(e=>/\bORR\b/.test(e.label)).length,1);
 const alternatives=views[0].outcome_reconciliation.selections.flatMap(s=>s.alternatives);
 assert(alternatives.some(e=>/irRC/.test(e.criteria)&&e.value==='43 %'));assert(alternatives.some(e=>/RECIST\s*1\.1/.test(e.criteria)&&e.value==='40 %'));
 assert.equal(JSON.stringify(studies),before);
});
test('41701511 displays overall28 and phaseII20 once; distinct phaseIb dose cohorts remain',()=>{
 const {match,groups}=display('41701511'),views=groups.map(g=>charts.studyTablePresentation({...match,...g},{registry:m.evidence_registry}));
 assert.equal(views.filter(v=>v.samples.some(s=>s.sample_size==='28')).length,1);assert.equal(views.filter(v=>v.samples.some(s=>s.sample_size==='20')).length,1);
 assert(views.some(v=>v.group==='Phase II'&&v.samples[0].sample_size==='20'));
 for(const n of ['8','6','2'])assert(views.some(v=>v.samples.some(s=>s.sample_size===n)));
 assert(views.some(v=>v.group==='Phase Ib'));assert(views.some(v=>/40 mg/.test(v.group)));assert(views.some(v=>/60 mg/.test(v.group)));
});
test('reviewed cross-stage display mappings fail closed without source quotes',()=>{
 const {match}=display('41732954'),old=match.results.find(r=>r.review_stage==='R2'),next=match.results.find(r=>r.review_stage==='R3'&&r.quantitative_record.id==='sv-os-median');
 assert.notEqual(concise.presentationScope(match.study,old),concise.presentationScope(match.study,next));
 assert.equal(concise.presentationScope(match.study,old,{registry:m.evidence_registry}),concise.presentationScope(match.study,next,{registry:m.evidence_registry}));
});

test('reviewed displayed aliases reject changed numerical results and different response criteria',()=>{
 const {match}=display('41732954'),old=match.results.find(r=>r.review_stage==='R2'&&r.quantitative_record.id==='b1'),next=match.results.find(r=>r.review_stage==='R3'&&r.quantitative_record.id==='b-orr-irrc');
 assert(concise.safeAlias(match.study,old,next,m.evidence_registry));
 assert(!concise.safeAlias(match.study,old,{...next,quantitative_record:{...next.quantitative_record,percentage:44}},m.evidence_registry));
 assert(!concise.safeAlias(match.study,old,{...next,quantitative_record:{...next.quantitative_record,response_criteria:'RECIST 1.1'}},m.evidence_registry));
});

test('a preferred analysis total replaces the sole-arm fallback instead of hiding the report',()=>{
 const p=require('../../data/audits/group_count_priority_ui_20261108/count_priority_visibility_fixture.json');
 const merged=clinical.merge([],{}, {...p.clinical_meta,articles:Object.values(p.clinical),evidence_registry:p.evidence_registry});
 const prepared=regimens.prepareStudies(merged.studies.map(s=>({...s,quantitative_only:true,details:{...s.details,quantitative_extraction:p.articles[s.pmid].records}}))),before=JSON.stringify(prepared);
 const matches=charts.filterStudies(prepared,{evidence_registry:merged.evidence_registry});
 for(const [pmid,n,drug] of [['31479702','23','Pembrolizumab'],['26085931','12','Ipilimumab']]){
  const match=matches.find(m=>m.study.pmid===pmid),groups=charts.studyTablePresentationRows(match,{registry:merged.evidence_registry});
  assert.equal(groups.length,1,pmid+' must retain its known-N study row');assert.equal(groups[0].intervention_label,drug);
  assert(groups[0].context_counts.every(row=>row.quantitative_record.count_purpose==='outcome_analysis'));
  assert.deepEqual(charts.studyTablePresentation({...match,...groups[0]},{registry:merged.evidence_registry}).samples,[{label:'',sample_size:n}]);
 }
 assert.equal(JSON.stringify(prepared),before);
});

test('randomized N is preferred to enrolled N when neither analysis nor treated N is available',()=>{
 const rows=[sample('enrolled',44,'enrolled'),sample('randomized',40,'randomized'),sample('eligible',50,'eligible')];
 assert.deepEqual(concise.selectCounts({},rows),[rows[1]]);
});
test('an undisplayed special outcome cannot remove the available participant-count row',()=>{
 const count=sample('treated',20,'treated'),result={source_input_sha256:'source',review_binding_sha256:'binding',review_stage:'R3',quantitative_record:{id:'special',endpoint:'OTHER',population_id:'p1',arm_id:'a1',cutoff:'NA',model:'NA',adjusted:'NA',display_n:{n:19,count_purpose:'outcome_analysis',status:'reported'}}};
 const study={quantitative_only:true,pmid:'synthetic',details:{}},match={study,results:[result],comparisons:[]};
 const base=[{comparisons:[],results:[result]},{comparisons:[],results:[],context_counts:[count],show_study_context:true}];
 const rows=concise.prepare(match,base,{eligible_samples:[count],displayable_results:[]});
 assert(rows.some(row=>row.context_counts?.includes(count)));
});
