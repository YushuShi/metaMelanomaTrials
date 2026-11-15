'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),compact=require('../dist/quantitative_extraction.js');
const {prepared}=require('./fixtures/concise_ui.cjs');
const d=prepared();
test('source-verified two-arm report shows one comparator/add-on row with its own arm Ns',()=>{
 const before=JSON.stringify(d.studies),{groups,shown}=d.display('42013417');
 assert.equal(groups.length,1);const group=groups[0];assert.equal(group.comparator_label,'Ipilimumab');assert.equal(group.intervention_label,'Nivolumab');assert.equal(group.is_add_on,true);
 assert.equal(group.comparator_n,21);assert.equal(group.intervention_n,65);assert.equal(group.comparator_arm_id,'r3a2');assert.equal(group.intervention_arm_id,'r3a1');assert(charts.hasPairedArmCounts(group));
 assert.equal(group.comparisons.length,1);assert(group.comparisons[0].presentation_pair);assert.equal(group.comparisons[0].scope.review_stage,'R3');assert.equal(group.comparisons[0].comparator_arm_id,'r3a2');assert.equal(group.comparisons[0].intervention_arm_id,'r3a1');
 assert.deepEqual(shown[0].samples,[{label:'Total',sample_size:'86'}]);assert.deepEqual(shown[0].effects,[]);assert.equal(JSON.stringify(d.studies),before);
 const csv=charts.studyTableCSV([d.display('42013417').match],{registry:d.registry});assert.equal(csv.trim().split('\r\n').length,2);assert(csv.includes('Ipilimumab (N=21)'));assert(csv.includes('+ Nivolumab (N=65)'));assert(csv.includes('Total: 86'));assert(csv.includes('Details'));
});
test('linked duplicate counts and pCR consolidate only into the source-supported cohort',()=>{
 const pooled=d.display('41694351');assert.equal(pooled.shown.filter(s=>s.samples.some(n=>n.sample_size==='54')).length,1);
 const infusion=d.display('42335437');assert.equal(infusion.shown.length,1);assert.equal(infusion.shown[0].samples[0].sample_size,'628');assert.match(infusion.shown[0].context,/first.infusion/i);
 const surgical=d.display('42140948').shown.filter(s=>s.samples.some(n=>n.sample_size==='21'));assert.equal(surgical.length,1);assert.equal(surgical[0].samples.length,1);
 assert.deepEqual(surgical[0].effects.filter(e=>e.label==='pCR').map(({label,value})=>({label,value})),[{label:'pCR',value:'9.5 % (1.2 %–30.3 %)'}]);
 for(const endpoint of ['RFS','Median RFS','Median EFS','Median DMFS'])assert(surgical[0].effects.some(e=>e.label===endpoint));
 assert(d.display('42140948').shown.some(s=>s.samples.some(n=>n.sample_size==='26')&&s.effects.some(e=>e.value.startsWith('7.7 %'))));
});
test('single shared responder has one concise PR/ORR value; the distinct second cohort remains',()=>{
 const {groups,shown}=d.display('41979863');assert.equal(groups.length,2);assert(!groups.some(g=>/trk-950.*or.*trk-950/i.test(g.intervention_label)));
 assert.deepEqual(shown[0].effects,[{label:'PR / ORR',value:'1'}]);assert.equal(shown[0].samples[0].sample_size,'1');
 assert(shown[1].effects.some(e=>/\bDCR\b/.test(e.label)&&e.value==='1'));assert(shown[1].effects.some(e=>/\bORR\b/.test(e.label)&&e.value==='0'));
});
test('rounded known-N displays retain source precision, source cutoffs and original article titles',()=>{
 const before=JSON.stringify(d.studies),row=d.display('42168180');
 const effects=row.shown.flatMap(s=>s.effects).map(e=>e.value).join(';');assert.match(effects,/19\.88 \(12\.39–NA\) months/);assert.doesNotMatch(effects,/\d+\.\d{3,}/);
 const all=d.matches.flatMap(m=>charts.studyTablePresentationRows(m,{registry:d.registry}).map(group=>({group,view:charts.studyTablePresentation({...m,...group},{registry:d.registry})})));
 assert(all.every(({group,view})=>(view.samples.length||charts.hasPairedArmCounts(group))&&view.samples.every(n=>n.sample_size!=='NA')));assert(all.every(({view})=>!view.context.toLowerCase().includes('cutoff')));
 assert(d.display('42094820').shown.every(s=>!JSON.stringify(s).match(/melanoma/i)));
 assert(d.studies.some(s=>/melanoma/i.test(s.title)));assert(compact.records(row.match.study).some(r=>JSON.stringify(r).includes('19.876796714579058')));
 assert.equal(JSON.stringify(d.studies),before);
});
test('CSV follows concise known-N cohort rows and preserves all their endpoint values',()=>{
 const visible=charts.visibleStudyMatches(d.matches,{registry:d.registry}),csv=charts.studyTableCSV(visible,{registry:d.registry});
 assert.equal(csv.trim().split('\r\n').length,1+visible.reduce((n,m)=>n+m.presentation_rows.length,0));
 assert(csv.includes('Median DMFS: 26.8'));assert(csv.includes('PR / ORR: 1'));assert(!csv.includes('Cutoff:'));assert(!csv.includes('19.876796714579058'));
 const noN=d.display('29327059');assert(noN.shown.every(s=>s.samples.every(n=>n.sample_size!=='NA')));
 assert(charts.studyTableData(noN.match,{registry:d.registry}).entries.some(e=>e.sample_size==='NA'),'underlying missing-N results still exist');
});
test('rounding keeps small p-values and inequality bounds exact',()=>{
 const fact={status:'reported',value:0.0001,raw_text:'0.0001',unit:'ratio'};
 assert.equal(charts.reportedNumber({...fact,role:'p_value'}),'0.0001');
 assert.equal(charts.reportedNumber({...fact,qualifier:'less_than'}),'<0.0001');
 assert.equal(charts.reportedNumber({...fact,value:0.1266,raw_text:'0.1266'}),'0.13');
});
