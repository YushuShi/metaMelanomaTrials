'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const compact=require('../dist/quantitative_extraction.js'),charts=require('../dist/app.js'),regimens=require('../dist/regimen_definitions.js');
const payload=require('./fixtures/quantitative_pilot.cjs').readPilotSnapshot();
function prepared(pmid){const m=compact.merge([],{},payload),study=regimens.prepareStudies(m.studies).find(s=>s.pmid===pmid),registry=m.evidence_registry;const match=charts.filterStudies([study],{evidence_registry:registry})[0];const counts=charts.reportedStudyCounts(study,null,registry).map(source=>({source,sample_size:charts.reportedNumber(source.n)}));return {study,registry,match,counts};}
function summary(d){return compact.countSummary(d.study,d.counts,{registry:d.registry});}
function main(d){return charts.studyTablePresentation({...d.match,show_study_context:true},{registry:d.registry});}
test('source-proven parent-arm and treated-child N80 is displayed once without inventing a comparator',()=>{
 const d=prepared('42149143'),before=JSON.stringify(d),s=summary(d);assert.equal(s.length,1);assert.equal(s[0].label,'TIL-treated');assert.equal(s[0].sample_size,'80');assert.equal(s[0].alias,'all_treated_parent_child');assert.deepEqual(s[0].count_ids,['n1','n2']);
 assert.deepEqual(main(d).samples,[{label:'TIL-treated',sample_size:'80'}]);assert.equal(main(d).context,'');assert.deepEqual(d.match.comparisons,[]);assert.deepEqual(main(d).effects,[]);assert.equal(JSON.stringify(d),before);
 const csv=charts.studyTableCSV([d.match],{registry:d.registry});assert.equal(csv.trim().split('\r\n').length,2);assert.equal((csv.match(/80/g)||[]).length,1);
});
test('response cohort Ns retain concise labels and never infer the held total20',()=>{
 const d=prepared('40199608'),result=main(d);assert.deepEqual(result.samples,[{label:'Responders',sample_size:'9'},{label:'Nonresponders',sample_size:'11'}]);assert.equal(result.context,'');assert(!result.samples.some(n=>n.sample_size==='20'));
 const csv=charts.studyTableCSV([d.match],{registry:d.registry});assert(csv.includes('Responders: 9'));assert(csv.includes('Nonresponders: 11'));assert.equal(csv.trim().split('\r\n').length,2);
});
test('same N does not establish a parent/subgroup alias without actual all-treated coverage',()=>{
 const changes=[
  d=>compact.records(d.study)[0].populations.find(p=>p.id==='p2').label='Male TIL-treated patients',
  d=>compact.records(d.study)[0].populations.find(p=>p.id==='p2').parent_id='another-population',
  d=>compact.records(d.study)[0].populations.find(p=>p.id==='p2').cutoff='2025',
  d=>d.counts[1].source.quantitative_record.arm_id='a2',
  d=>{const a=compact.records(d.study)[0].arms.find(a=>a.id==='a1');a.nodes.push({id:'other',kind:'drug',name:'ipilimumab',children:[],dose:'NA',route:'NA',schedule:'NA'},{id:'both',kind:'AND',name:'NA',children:[a.root_id,'other'],dose:'NA',route:'NA',schedule:'NA'});a.root_id='both';a.label='tumor-infiltrating lymphocytes + ipilimumab';},
  d=>d.counts[1].source.quantitative_record.cutoff='2025',
  d=>d.counts[1].source.source_input_sha256='other-source',
  d=>d.counts[1].source.quantitative_record.field_flags=[{code:'CONFLICTING_n'}],
  d=>d.counts[1].source.quantitative_record.complete='no',
  d=>{for(const e of Object.values(d.registry))if(e.supporting_quote?.includes('from all 80'))e.supporting_quote=e.supporting_quote.replace('from all 80','from 80');},
  d=>{for(const e of Object.values(d.registry))if(e.supporting_quote?.includes('from all 80'))e.supporting_quote=e.supporting_quote.replace('from all 80','from not all 80');},
  d=>{for(const e of Object.values(d.registry))if(e.supporting_quote?.includes('we profiled infusion'))e.supporting_quote=e.supporting_quote.replace('we profiled infusion','we planned to profile infusion');}
 ];
 for(const change of changes){const d=prepared('42149143');change(d);assert.equal(summary(d).length,2);}
});
test('unambiguous declared single-group total/arm aliases may consolidate, with other cohorts intact',()=>{
 for(const [pmid,n]of [['12574389','8'],['26500235','16'],['31080803','46'],['31409575','60'],['41694351','54']]){const d=prepared(pmid),rows=summary(d);assert.equal(rows.filter(r=>r.sample_size===n).length,1);assert(rows.find(r=>r.sample_size===n).alias);}
 assert(summary(prepared('31409575')).some(r=>r.sample_size==='19'&&r.label.includes('lesion')));
});
test('overlapping subgroups, dose arms, and phases keep separate Ns',()=>{
 const overlap=summary(prepared('16007689'));assert.equal(overlap.filter(r=>r.sample_size==='21').length,2);assert(overlap.some(r=>r.label==='Male'));assert(overlap.some(r=>r.label==='Previously systemically treated'));
 const dose=summary(prepared('12039921'));assert.equal(dose.filter(r=>r.sample_size==='3').length,4);assert.equal(new Set(dose.filter(r=>r.sample_size==='3').map(r=>r.label)).size,4);
 const phases=summary(prepared('29399853'));assert.equal(phases.filter(r=>r.sample_size==='6').length,2);assert(phases.some(r=>r.label==='Phase I'));assert(phases.some(r=>r.label==='Phase II'));assert.equal(phases.filter(r=>r.sample_size==='12').length,1);
});
test('repeated responder labels retain distinct treatment context; assay cohorts remain named',()=>{
 const groups=summary(prepared('32002281'));for(const n of ['18','9','22','12'])assert(groups.find(g=>g.sample_size===n).label.includes('anti-PD-1'));
 assert(groups.find(g=>g.sample_size==='22').label.includes('ipilimumab'));
 assert.deepEqual(summary(prepared('42158424')).map(r=>[r.label,r.sample_size]),[['CyTOF','29'],['NanoString','125']]);
});

test('an inherited sole regimen consolidates only the melanoma population total/arm N4',()=>{
 const d=prepared('8130026'),before=JSON.stringify(d),rows=summary(d);assert.equal(rows.filter(r=>r.sample_size==='4').length,1);assert(!rows.some(r=>r.sample_size==='22'));assert.equal(JSON.stringify(d),before);
});
