'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const clinical=require('../dist/clinical_evidence.js'),regimens=require('../dist/regimen_definitions.js'),charts=require('../dist/app.js');
const payload=require('../../data/audits/trial_groups_ui_20261108/target_fixture.json');
const merged=clinical.merge([],{}, {...payload.clinical_meta,articles:Object.values(payload.clinical),evidence_registry:payload.evidence_registry});
const studies=regimens.prepareStudies(merged.studies.map(s=>({...s,quantitative_only:true,details:{...s.details,quantitative_extraction:payload.articles[s.pmid].records}}))),registry=merged.evidence_registry;
const find=id=>studies.find(s=>s.pmid===id),match=id=>charts.filterStudies([find(id)],{evidence_registry:registry})[0];
function renderer(){
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',disabled:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;}});return elements.get(id);};
 const context={charts,state:{scopedStudies:studies,scopedPayload:{evidence_registry:registry},scopedSort:'year',scopedOrder:'desc',drugLabels:new Map(),trialsOnly:false},$:get,text:(id,value)=>get(id).textContent=value,escape:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),number:new Intl.NumberFormat('en-US')};
 context.mainSelection=()=>({trials_only:context.state.trialsOnly,evidence_registry:registry});context.renderAdvancedFilters=()=>{};context.advancedEvidence=()=>({matches:charts.filterStudies(studies,context.mainSelection())});vm.createContext(context);
 const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8');for(const name of ['studyTableCells','treatmentTag','armTreatmentTag','studyRowsHTML','renderStudies']){const start=source.indexOf('  function '+name+'('),end=source.indexOf('\n  function ',start+5);vm.runInContext(source.slice(start,end),context);}
 return {context,get,render:()=>context.renderStudies()};
}
test('Trial Only uses report design and CSV follows the same retained visible subset',()=>{
 const before=JSON.stringify(studies),all=charts.visibleStudyMatches(charts.filterStudies(studies,{evidence_registry:registry}),{registry});
 const trials=charts.visibleStudyMatches(charts.filterStudies(studies,{evidence_registry:registry,trials_only:true}),{registry});
 assert(trials.length>0&&trials.length<all.length);assert(trials.some(m=>m.study.pmid==='42013417'));assert(!trials.some(m=>m.study.pmid==='41701163'));assert(!trials.some(m=>m.study.pmid==='41694351'));
 const csv=charts.studyTableCSV(trials,{registry});assert(csv.includes('42013417'));assert(!csv.includes('41701163'));assert(!csv.includes('41694351'));assert.equal(JSON.stringify(studies),before);
});
test('paired known arm counts make one row even without a reported aggregate N',()=>{
 const trial=charts.studyTablePresentationRows(match('42013417'),{registry});assert.equal(trial.length,1);assert.deepEqual([trial[0].comparator_n,trial[0].intervention_n,trial[0].total_n],[21,65,86]);
 const ovarian=charts.studyTablePresentationRows(match('41701163'),{registry});assert.equal(ovarian.length,1);const pair=ovarian.find(g=>g.paired_arm_context);assert.deepEqual([pair.comparator_n,pair.intervention_n,pair.total_n],[8,28,null]);assert.equal(charts.studyTablePresentation({...match('41701163'),...pair},{registry}).samples.length,0);
 const csv=charts.studyTableCSV([match('41701163')],{registry});assert(csv.includes('Dabrafenib + Trametinib (N=8)'));assert(csv.includes('Ipilimumab (N=28)'));assert(!csv.includes('N=36'));assert(csv.includes('Details'));assert(!csv.includes('Safety'));assert(find('41701163').details.sample_size_records.some(s=>s.quantitative_record?.count_purpose==='safety'&&s.n?.value===29));
});
test('rendered studies show gray nontrials, abstract-only markers, arm Ns and Details actions',()=>{
 const ui=renderer();ui.render();const html=ui.get('scoped-studies-rows').innerHTML;
 assert.match(html,/class="study-group-cell"/);assert.match(html,/class="study-start study-nontrial"/);assert.match(html,/class="abstract-only-mark"[^>]*title="Results based on abstract only"/);assert.match(html,/class="treatment-arm-n">\(N=21\)/);assert.match(html,/class="treatment-arm-n">\(N=65\)/);assert.match(html,/outcome-details-link[^>]*data-detail-section="other-outcomes">Details/);
 const article=id=>html.split('data-open="'+find(id).report_id+'">')[1]?.split('</button>')[0];assert(article('281221').includes('abstract-only-mark'));assert(!article('42013417').includes('abstract-only-mark'));assert(!article('41701163').includes('abstract-only-mark'));
 ui.context.state.trialsOnly=true;ui.render();const trialHTML=ui.get('scoped-studies-rows').innerHTML;assert(!trialHTML.includes('study-nontrial'));assert(!trialHTML.includes(find('41701163').report_id));assert.equal(ui.get('trial-only-toggle').attrs['aria-pressed'],'true');
});
test('source-backed ovarian details retain the original measurements and no comparative HR is invented',()=>{
 const study=find('41701163'),before=JSON.stringify(study),snippets=charts.specialOutcomeDetails(study,{registry});assert(snippets.length);assert(snippets.some(s=>s.quote.includes('4.24')&&s.quote.includes('3.51')));assert(snippets.every(s=>s.source_id.startsWith(study.report_id+':')));assert.equal(charts.studyResults(study).length,0);assert.equal(JSON.stringify(study),before);
});
test('both sides of each source-supported pair are reachable through treatment filters',()=>{
 for(const id of ['42013417','41701163']){const study=find(id),co=charts.studyComparisons(study,{registry})[0],selection={evidence_registry:registry,comparator:charts.comparatorKey(co),intervention:charts.interventionPresentation(co).key};assert.equal(charts.filterStudies([study],selection).length,1);const choices=charts.constrainStudyChoices([study],selection);assert(choices.comparator_options.some(o=>o.value===selection.comparator));assert(choices.intervention_options.some(o=>o.value===selection.intervention));}
});
