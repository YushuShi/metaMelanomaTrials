'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'../dist'),charts=require('../dist/app.js');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8'),source=fs.readFileSync(path.join(base,'app.js'),'utf8');
const payload=JSON.parse(fs.readFileSync(path.join(base,'data/studies.json'),'utf8'));
const studies=charts.scopedStudies(payload);
const comparer=(label)=>charts.comparatorKey({comparator_label:label});
const id=(n)=>'report-'+String(n).padStart(24,'0');
const result=(n,extra={})=>({result_id:'R'+n,endpoint:{family:'response'},measure:'response_probability',display_measure:'ORR',estimate:{status:'reported',value:50,raw_text:'50%',unit:'percent'},...extra});
const study=(n,extra={})=>({report_id:id(n),title:'Report '+n,year:2020,first_author_surname:'Author'+n,default_visible:true,comparisons:[],details:{quantitative_results:[]},...extra});
const comparison=(n,extra={})=>({comparison_id:'C'+n,kind:'treatment_comparison',comparator_key:'nivo',comparator_label:'Nivolumab',intervention_drug_ids:['nivolumab','ipilimumab'],comparator_drug_ids:['nivolumab'],additional_intervention_drug_ids:['ipilimumab'],result_ids:['R'+n],...extra});

test('all821 released PMID records retained; exact finite display gates preserve498 current articles',()=>{
 assert.equal(studies.length,821);assert.equal(charts.filterStudies(studies).length,498);assert.equal(studies.filter(s=>!s.default_visible).length,821-498);assert.equal(new Set(studies.map(s=>s.report_id)).size,821);
 assert.equal(payload.studies.reduce((n,s)=>n+s.details.quantitative_results.length,0),payload.quantitative_result_count);
 assert.equal(charts.filterStudies(studies).filter(m=>m.study.default_visible===false).length,0);
});
test('dataset identity, duplicate IDs and display scope fail closed',()=>{
 for(const value of [{...payload,project:'metaOncoTrial'},{...payload,cohort_count:1},{schema_version:1,studies:[study(1),study(1)]},{schema_version:1,studies:[study(1,{default_visible:undefined})]}])assert.throws(()=>charts.scopedStudies(value));
});
test('foreign result/comparison identities are rejected before main rendering',()=>{
 const payload=(value)=>({schema_version:1,project:'metaCutaneousMelanomaTrial',studies:[value]});
 assert.throws(()=>charts.scopedStudies(payload(study(1,{details:{quantitative_results:[result(1,{report_id:id(2)})]}}))));
 assert.throws(()=>charts.scopedStudies(payload(study(1,{comparisons:[comparison(1,{scope:{report_id:id(2)}})]}))));
});
test('shared comparator drug is subtracted, never inferred from browsing union',()=>{
 assert.deepEqual(charts.additionalDrugIds(comparison(1,{additional_intervention_drug_ids:undefined})),['ipilimumab']);
 assert.deepEqual(charts.additionalDrugIds({associated_intervention_ids:['nivolumab','ipilimumab']}),[]);
 const rows=[study(1,{comparisons:[comparison(1)],details:{quantitative_results:[result(1)]}})];
 assert.equal(charts.filterStudies(rows,{comparator:comparer('Nivolumab'),intervention:'ipilimumab'}).length,1);
 assert.equal(charts.filterStudies(rows,{comparator:comparer('Nivolumab'),intervention:'nivolumab'}).length,0);
});
test('mutual choices preserve changed side and clear an incompatible other choice',()=>{
 const rows=[study(1,{comparisons:[comparison(1)]}),study(2,{comparisons:[comparison(2,{comparator_key:'placebo',comparator_label:'Placebo',comparator_drug_ids:[],additional_intervention_drug_ids:['vemurafenib']})]})];
 let choice=charts.constrainStudyChoices(rows,{comparator:comparer('Nivolumab'),intervention:'vemurafenib'},'intervention');assert.equal(choice.selection.comparator,'');assert.equal(choice.selection.intervention,'vemurafenib');assert.deepEqual(choice.comparator_keys,[comparer('Placebo')]);
 choice=charts.constrainStudyChoices(rows,{comparator:comparer('Nivolumab'),intervention:'vemurafenib'},'comparator');assert.equal(choice.selection.comparator,comparer('Nivolumab'));assert.equal(choice.selection.intervention,'');assert.deepEqual(choice.intervention_ids,['ipilimumab']);
});
test('reported class/unknown-agent interests cascade without guessing named drugs or restoring shared classes',()=>{
 const classId='reported-class-aaaaaaaaaaaaaaaaaaaa',agentId='reported-agent-bbbbbbbbbbbbbbbbbbbb';
 const a=comparison(1,{additional_intervention_drug_ids:[],intervention_drug_ids:[],comparator_drug_ids:[],additional_intervention_ids:[classId],additional_intervention_label:'adjuvant immunotherapy'});
 const b=comparison(2,{comparator_key:'other',comparator_label:'Pembrolizumab',comparator_drug_ids:['pembrolizumab'],additional_intervention_ids:[agentId],additional_intervention_drug_ids:[]});
 const shared=comparison(3,{comparator_key:'same-class',additional_intervention_ids:[],additional_intervention_drug_ids:['nivolumab'],additional_intervention_label:'adjuvant immunotherapy'});
 const rows=[study(1,{comparisons:[a]}),study(2,{comparisons:[b]}),study(3,{comparisons:[shared]})],before=JSON.stringify(rows);
 assert.deepEqual(charts.additionalInterestIds(a),[classId]);assert.deepEqual(charts.additionalInterestIds(shared),[]);assert.deepEqual(charts.additionalDrugIds(shared),['nivolumab']);
 assert.equal(charts.filterStudies(rows,{intervention:classId}).length,1);assert.equal(charts.filterStudies(rows,{intervention:'nivolumab'}).length,0);assert.equal(charts.filterStudies(rows,{intervention:'pembrolizumab'}).length,0);
 const choices=charts.constrainStudyChoices(rows,{comparator:comparer('Nivolumab'),intervention:agentId},'intervention');assert.equal(choices.selection.comparator,'');assert.deepEqual(choices.comparator_keys,[comparer('Pembrolizumab')]);assert.equal(JSON.stringify(rows),before);
});
test('non-drug comparators and single arms remain selectable',()=>{
 const rows=[study(1,{comparisons:[comparison(1,{comparator_key:'observation',comparator_drug_ids:[],comparator_label:'Observation'})]}),study(2,{comparisons:[comparison(2,{kind:'single_arm',comparator_key:null,comparator_label:null,comparator_drug_ids:[]})]})];
 assert.equal(charts.filterStudies(rows,{comparator:comparer('Observation')}).length,1);assert.equal(charts.filterStudies(rows,{comparator:'__single_arm__'}).length,1);
 assert.ok(charts.filterStudies(studies,{comparator:'__single_arm__'}).length>0);
});
test('comparison filters select exact original result IDs, not shared report drug mentions',()=>{
 const rows=[study(1,{comparisons:[comparison(1),comparison(2,{comparator_key:'other',comparator_label:'Pembrolizumab',comparator_drug_ids:['pembrolizumab'],additional_intervention_drug_ids:['pembrolizumab']})],details:{quantitative_results:[result(1,{comparison_id:'C1'}),result(2,{comparison_id:'C2'}),result(3,{comparison_id:null})]}})];
 assert.deepEqual(charts.filterStudies(rows,{comparator:comparer('Nivolumab')})[0].results.map(r=>r.result_id),['R1']);assert.equal(charts.filterStudies(rows)[0].results.length,3);
});
test('endpoint/measure choices constrain only their source-linked comparison records',()=>{
 const rows=[study(1,{comparisons:[comparison(1),comparison(2,{comparator_key:'placebo',comparator_label:'Placebo',comparator_drug_ids:[],additional_intervention_drug_ids:['vemurafenib']})],details:{quantitative_results:[result(1),result(2,{endpoint:{family:'overall_survival'},measure:'HR',display_measure:'HR'})]}})];
 const choices=charts.constrainStudyChoices(rows,{endpoint:'response',measure:'ORR'});assert.deepEqual(choices.comparator_keys,[comparer('Nivolumab')]);assert.deepEqual(choices.intervention_ids,['ipilimumab']);
 assert.equal(charts.filterStudies(rows,{endpoint:'response',measure:'ORR',comparator:comparer('Placebo')}).length,0);
});
test('actual nivolumab+ipilimumab fixture subtracts nivolumab and preserves every numeric wrapper',()=>{
 const before=JSON.stringify(payload);const matches=charts.filterStudies(studies,{intervention:'ipilimumab'});
 const shared=matches.flatMap(m=>m.comparisons).filter(c=>c.comparator_drug_ids.includes('nivolumab')&&c.intervention_drug_ids.includes('nivolumab'));
 assert.ok(shared.length);for(const c of shared)assert.ok(!charts.additionalDrugIds(c).includes('nivolumab'));
 assert.equal(JSON.stringify(payload),before);
});
test('ORR includes explicit overall/objective response, including role-only values; never CR/PR',()=>{
 for(const text of ['objective response rate','overall response rate','ORR'])assert.equal(charts.displayMeasure({measure:'response_probability',endpoint:{definition:{text}}}),'ORR');
 for(const text of ['complete response rate','partial response rate'])assert.equal(charts.displayMeasure({measure:'response_probability',endpoint:{definition:{text}}}),'response_probability');
 const matches=charts.filterStudies(studies,{endpoint:'response',measure:'ORR'});assert.ok(matches.length);assert.ok(matches.flatMap(m=>m.results).every(r=>charts.displayMeasure(r)==='ORR'));
 const roleOnly=study(999,{details:{quantitative_results:[result(999,{estimate:{status:'not_reported',value:null},reported_numbers:[{role:'percentage',status:'reported',value:50,raw_text:'50%',unit:'percent'}]})]}});assert.equal(charts.filterStudies([roleOnly],{endpoint:'response',measure:'ORR'})[0].results.length,1);
});
test('explicit ORR supplies response displayfamily without rewriting raw metadata; source exclusions stay in details',()=>{
 const raw=result(1,{endpoint:{family:null,definition:{text:'Objective response rate'}}});const before=JSON.stringify(raw);assert.equal(charts.displayEndpointFamily(raw),'response');assert.equal(JSON.stringify(raw),before);
 const s=study(1,{details:{quantitative_results:[raw,result(2,{main_result_eligible:false})]}});assert.equal(charts.filterStudies([s],{endpoint:'response',measure:'ORR'})[0].results.length,1);assert.equal(charts.studyResults(s).length,2);
});
test('author and year sort independently, missing values last, stable and nonmutating',()=>{
 const rows=[study(1,{first_author_surname:'Zed',year:2024}),study(2,{first_author_surname:'Able',year:2020}),study(3,{first_author_surname:null,year:null})].map(study=>({study}));
 assert.deepEqual(charts.sortStudyRows(rows,'author','asc').map(r=>r.study.report_id),[id(2),id(1),id(3)]);assert.deepEqual(charts.sortStudyRows(rows,'year','desc').map(r=>r.study.report_id),[id(1),id(2),id(3)]);assert.equal(rows[0].study.report_id,id(1));
});
test('comparative CI rows sort ahead of descriptive values, with raw record identity retained',()=>{
 const a=result(1),b=result(2,{measure:'HR',display_measure:'HR',analysis:{contrast_type:'treatment_comparison'},ci_lower:{status:'reported'},ci_upper:{status:'reported'}});assert.deepEqual(charts.orderedStudyResults([a,b]),[b,a]);
});
test('compact main values focus clinical outcomes, keep costs/planning in details, preserve association contrasts',()=>{
 assert.equal(charts.compactClinicalResult(result(1)),true);assert.equal(charts.compactClinicalResult(result(2,{endpoint:{family:'other'},measure:'other',display_measure:'other'})),false);
 assert.equal(charts.compactClinicalResult(result(3,{measure:'sample_size',display_measure:'sample_size'})),false);
 const r={analysis:{contrast_type:'other',contrast_description:{text:'30 minutes before optimal; After 13:48 (reference = 13:48 or earlier)'}}};assert.equal(charts.compactContrast(r),'30 minutes before optimal');
 assert.equal(charts.compactContrast({analysis:{contrast_type:'treatment_comparison'}}),'');
});
test('N-only fallback preserves explicit participant groups and rejects planned/nonparticipant/ambiguous counts',()=>{
 const count=(n,extra={})=>({report_id:id(1),population_id:'c1',arm_id:null,quantity_label:'cohort 1 enrolled',sample_context_role:'enrolled',n:{value:n,status:'reported',unit:'participants',raw_text:String(n),qualifier:'equal',evidence_ids:['E']},...extra});
 const s=study(1,{details:{sample_size_records:[count(184),count(93,{population_id:'c2',quantity_label:'cohort 2 assigned'})]}});assert.deepEqual(charts.reportedStudyCounts(s).map(r=>r.n.value),[184,93]);
 for(const bad of [count(1,{report_id:id(2)}),count(6,{n:{value:6,status:'reported',unit:'episodes',evidence_ids:['E']}}),count(100,{scope:'planned'}),count(100,{quantity_label:'planned target enrolled'}),count(50,{sample_context_role:null,denominator_type:null,domain:'patient_demographics',quantity_label:'male participants'})])assert.equal(charts.reportedStudyCounts(study(1,{details:{sample_size_records:[bad]}})).length,0);
 assert.equal(charts.reportedStudyCounts(study(1,{details:{sample_size_records:[count(184),count(185)]}})).length,0);
 assert.equal(charts.reportedStudyCounts(s,[comparison(1,{scope:{report_id:id(1),reviewer:'Other'}})]).length,0);
});
test('N-only group labels retain reported arm names without competing N-category headings',()=>{
 assert.equal(charts.reportedCountLabel({label:{text:'dabrafenib plus trametinib'},quantity_label:'randomized arm sample size'}),'dabrafenib plus trametinib');
 assert.equal(charts.reportedCountLabel({quantity_label:'randomized total'}),'Participants');
 assert.equal(charts.reportedCountLabel({quantity_label:'cohort 2 enrolled'}),'cohort 2 enrolled');
});
test('one report table, no disease selector/pooling cards, comparator before intervention, details behind title',()=>{
 assert.match(html,/metaMelanomaTrials/);assert.equal((html.match(/id="scoped-studies-rows"/g)||[]).length,1);
 assert.doesNotMatch(html,/id="(?:analysis|summary|matrix|planning)-disease"|class="pooled-grid"|id="quantitative-results-rows"|id="provisional-studies-rows"|id="main-articles-rows"/);
 assert.ok(html.indexOf('id="analysis-comparator"')<html.indexOf('id="analysis-intervention"'));
 assert.match(html,/<th scope="col">Trial name<\/th><th scope="col">NCT number<\/th><th scope="col">Group<\/th>/);
 assert(html.indexOf('trial_identifiers.js')<html.indexOf('./app.js'));assert(html.indexOf('wald_interval.js')<html.indexOf('./app.js'));
 const rendering=source.slice(source.indexOf('  function renderStudies('),source.indexOf('  function renderMainArticles('));
 assert.match(rendering,/data-open/);assert.doesNotMatch(rendering,/PMID|PubMed|Provisional|Source passages|Record provenance|Treatment comparison/);
 assert.match(source,/function renderDrawer/);assert.doesNotMatch(source,/Complete reported record|quant-json/);
});
test('local launcher5021 serves scoped assets without an automatic general exporter',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../../app.py'),'utf8');assert.match(app,/default=5021/);assert.match(app,/refresh_article_progress\.py/);assert.doesNotMatch(app,/export_dashboard\.py/);assert.match(app,/if args.refresh and not args.no_refresh/);assert.match(app,/"studies.json"/);
});
test('unverified numbers never become pooled/forest/matrix results',()=>{
 const analysis=JSON.parse(fs.readFileSync(path.join(base,'data/analysis.json'),'utf8'));assert.equal(analysis.validated,false);assert.equal(charts.matrixEligible({validated:false,effect:0.8,ci_low:0.7,ci_high:0.9,n_studies:5}),false);
 for(const s of studies)for(const r of charts.studyResults(s))assert.equal(r.pooling_eligible,false);
});

function browserFixture(){
 const nodes=new Map(),all=[];
 const decode=value=>value.replace(/&quot;|&#39;|&lt;|&gt;|&amp;/g,m=>({'&quot;':'"','&#39;':"'",'&lt;':'<','&gt;':'>','&amp;':'&'}[m]));
 function make(id='',attrs={}){
  const listeners={},el={id,value:attrs.value||'',checked:false,hidden:'hidden'in attrs,disabled:false,options:[],dataset:{},style:{},attrs:{...attrs},children:[],textContent:'',classList:{toggle(){}},addEventListener(k,v){listeners[k]=v;},setAttribute(k,v){this.attrs[k]=String(v);},removeAttribute(k){delete this.attrs[k];},focus(){},contains(){return false;},showModal(){this.open=true;},close(){this.open=false;},querySelector(){return make();},querySelectorAll(){return[];},getBoundingClientRect(){return{left:0,right:900};},_listeners:listeners};
  for(const[k,v]of Object.entries(attrs))if(k.startsWith('data-'))el.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;
  Object.defineProperty(el,'innerHTML',{get(){return this._html||'';},set(v){this._html=v;for(const m of v.matchAll(/id="([^"]+)"/g))if(!nodes.has(m[1]))make(m[1]);this.options=[...v.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(m=>({value:decode(m[1]),textContent:decode(m[2]),disabled:false,setAttribute(){}}));if(this.options.length&&!this.options.some(o=>o.value===this.value))this.value=this.options[0].value;}});
  all.push(el);if(id)nodes.set(id,el);return el;
 }
 for(const m of html.matchAll(/<(?:[a-z][a-z0-9-]*)\b([^>]*)>/gi)){const attrs={};for(const a of m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';if(attrs.id||Object.keys(attrs).some(k=>k.startsWith('data-')))make(attrs.id||'',attrs);}
 const get=id=>nodes.get(id)||null;
 const select=selector=>selector==='[data-view]'?all.filter(e=>e.dataset.view):selector==='[data-tracking-tab]'?all.filter(e=>e.dataset.trackingTab):selector==='[data-analysis-tab]'?all.filter(e=>e.dataset.analysisTab):selector==='.view'?all.filter(e=>(e.attrs.class||'').split(' ').includes('view')):selector==='.tracking-panel'?all.filter(e=>(e.attrs.class||'').split(' ').includes('tracking-panel')):[];
 const requests=[];const context={console,Intl,Map,Set,URL,Blob,setTimeout,clearTimeout,document:{getElementById:get,querySelectorAll:select,querySelector:()=>make(),addEventListener(){},activeElement:{tagName:'BODY'}},location:{hash:''},history:{replaceState(){}},localStorage:{getItem:()=>null,setItem(){}},fetch:async(url)=>{requests.push(url);if(url==='./data/quantitative_extraction.json')return{ok:false,status:404};return{ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(base,url.replace(/^\.\//,'')),'utf8'))};},requestAnimationFrame:fn=>fn()};context.window=context;context.addEventListener=()=>{};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(base,'semantic_numeric_display.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(base,'evidence_display.js'),'utf8'),context);for(const name of ['numeric_evidence_release.js','numeric_evidence_display.js','clinical_evidence.js','treatment_groups.js','regimen_source_rules.js','regimen_definitions.js','melanoma_scope.js','trial_registry.js','trial_identifiers.js','wald_interval.js','quantitative_extraction.js','cohort_alias_rules.js','concise_study_groups.js','outcome_source_rules.js','outcome_reconciliation.js','study_design_display.js','advanced_filters.js','advanced_filter_panel.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),context);
 const injected=source.replace(/\}\)\(\);\s*$/,'globalThis.__ui={state,renderStudies,renderDrawer,mainSelection,refreshStudyChoices,selectedMeasure,renderAnalysis,renderSummary,renderMatrix,renderPlanning,showView};})();');vm.runInContext(injected,context);return{context,get,requests};
}
test('full DOM initialization merges current clinical evidence by PMID without legacy About IDs',async()=>{
 const extension=JSON.parse(fs.readFileSync(path.join(base,'data/clinical_evidence.json'),'utf8'));
 const merged=require('../dist/clinical_evidence.js').merge(studies,payload.evidence_registry||{},extension).studies;
 const expectedPmids=new Set([...studies,...extension.articles].map(s=>String(s.pmid)));
 const f=browserFixture();await new Promise(r=>setTimeout(r,70));const ui=f.context.__ui;assert.equal(ui.state.loading,false);assert.equal(ui.state.datasetError,false);assert.equal(ui.state.records.length,expectedPmids.size);assert.equal(new Set(ui.state.records.map(s=>String(s.pmid))).size,expectedPmids.size);assert.equal(f.get('scoped-studies-count').textContent,`${charts.visibleStudyMatches(charts.filterStudies(ui.state.scopedStudies,ui.mainSelection()),{registry:ui.state.scopedPayload?.evidence_registry||{}}).length.toLocaleString('en-US')} reports`);
 assert.equal((f.get('scoped-studies-rows').innerHTML.match(/class="study-start"/g)||[]).length,10);assert.deepEqual(f.requests,['./data/quantitative_extraction.json','./data/clinical_classifications.json','./data/summary.json','./data/analysis.json','./data/studies.json','./data/clinical_evidence.json']);
 f.get('analysis-endpoint').value='response';assert.equal(ui.selectedMeasure('analysis'),'RR');assert.equal(f.get('analysis-measure'),null);ui.renderAnalysis();assert.match(f.get('scoped-studies-rows').innerHTML,/ORR/);
 f.get('analysis-endpoint').value='';
 // Exercise the current source-qualified add-on pair; historical Nivo+IPI fixtures remain tested above.
 const pair=charts.filterStudies(merged).flatMap(m=>m.comparisons).find(c=>charts.comparatorDisplayLabel(c)==='Nivolumab'&&charts.interventionPresentation(c).is_add_on===true&&charts.regimenDescription(charts.interventionPresentation(c).definition).agent_ids.includes('relatlimab'));assert(pair);
 f.get('analysis-comparator').value=charts.comparatorKey(pair);f.get('analysis-intervention').value='';ui.refreshStudyChoices('comparator');assert.ok(f.get('analysis-intervention').options.some(o=>o.value===charts.interventionPresentation(pair,ui.state.drugLabels).key));assert.match(charts.interventionPresentation(pair,ui.state.drugLabels).label,/Relatlimab/);assert.equal(charts.interventionPresentation(pair,ui.state.drugLabels).is_add_on,true);
 f.get('analysis-intervention').value=charts.interventionPresentation(pair,ui.state.drugLabels).key;ui.refreshStudyChoices('intervention');ui.renderStudies();const count=charts.visibleStudyMatches(charts.filterStudies(ui.state.scopedStudies,ui.mainSelection()),{registry:ui.state.scopedPayload?.evidence_registry||{}}).length;assert.equal(f.get('scoped-studies-count').textContent,`${count.toLocaleString('en-US')} ${count===1?'report':'reports'}`);
 ui.renderDrawer(studies.find(s=>charts.studyResults(s).length).report_id);assert.doesNotMatch(f.get('drawer-content').innerHTML,/<pre|Complete reported record|source_sha256/);assert.match(f.get('drawer-content').innerHTML,/Source passages/);assert.equal(f.get('disposition-total'),null);
 assert.doesNotMatch(f.get('scoped-studies-rows').innerHTML,/PMID|Provisional|Source passages|Treatment comparison/);
 ui.showView('tracking');assert.equal(ui.state.currentView,'about');
});

test('literal source-only interest label is visible and selectable without a named-agent inference',async()=>{
 const f=browserFixture();await new Promise(r=>setTimeout(r,50));const ui=f.context.__ui,classId='reported-class-aaaaaaaaaaaaaaaaaaaa';
 const r=result(999,{report_id:id(999),comparison_id:'C999',analysis_n:{status:'reported',value:17,raw_text:'17',unit:'patients',evidence_ids:['E1']}}),c=comparison(999,{comparator_key:'observation',comparator_label:'Observation',comparator_drug_ids:[],additional_intervention_ids:[classId],additional_intervention_drug_ids:[],intervention_drug_ids:[],additional_intervention_label:'adjuvant immunotherapy'}),s=study(999,{comparisons:[c],details:{quantitative_results:[r]}}),before=JSON.stringify(s);
 ui.state.scopedStudies=[s];ui.state.drugLabels.set(classId,'adjuvant immunotherapy');for(const field of ['comparator','intervention','endpoint'])f.get('analysis-'+field).value='';ui.refreshStudyChoices();assert.ok(f.get('analysis-intervention').options.some(o=>o.value===charts.interventionPresentation(c,ui.state.drugLabels).key&&/Immunotherapy/i.test(o.textContent)));
 f.get('analysis-intervention').value=classId;ui.renderStudies();assert.match(f.get('scoped-studies-rows').innerHTML,/Immunotherapy/i);assert.doesNotMatch(f.get('scoped-studies-rows').innerHTML,/nivolumab|pembrolizumab/);assert.equal(JSON.stringify(s),before);
});
test('source-supported class remains selectable with an unresolved comparator and no invented control',()=>{
 const classId='reported-class-6cfe584c28334adf1fc1',c=comparison(1,{kind:'unresolved_comparator',comparator_key:null,comparator_label:null,comparator_drug_ids:[],comparator_filter_eligible:false,comparison_filter_eligible:true,additional_intervention_ids:[classId],additional_intervention_drug_ids:[]}),s=study(1,{comparisons:[c],details:{quantitative_results:[result(1)]}}),before=JSON.stringify(s);
 const choices=charts.constrainStudyChoices([s],{intervention:classId});assert.deepEqual(choices.comparator_keys,[]);assert.deepEqual(choices.intervention_ids,[classId]);assert.equal(charts.filterStudies([s],{intervention:classId}).length,1);assert.equal(charts.comparatorKey(c),'');assert.equal(charts.filterStudies([s],{comparator:'untreated'}).length,0);assert.equal(JSON.stringify(s),before);
});
test('generic recurrence stays outside RFS while its source-scoped cohort counts remain available',()=>{
 const classId='reported-class-6cfe584c28334adf1fc1',s=studies.find(s=>s.report_id==='report-113986f3eafefda41ab71db6'),before=JSON.stringify(s);assert.ok(s);
 assert.equal(charts.filterStudies([s],{endpoint:'recurrence'}).length,0);
 const hr=charts.filterStudies([s],{intervention:classId,measure:'HR'})[0],counts=charts.reportedStudyCounts(s,hr.comparisons,payload.evidence_registry);
 assert.equal(counts.filter(r=>r.n.value===544).length,1);assert.ok(counts.some(r=>r.n.value===235));assert(!counts.some(r=>r.n.value===309||r.n.value===779));
 const e=require('../dist/evidence_display.js');for(const r of charts.studyResults(s).filter(r=>r.display_measure==='HR'))assert.equal(e.sampleSizeDisplay(r,{samples:s.details.sample_size_records,evidenceRegistry:payload.evidence_registry}).text,'—');
 const wrong=hr.comparisons.map(c=>({...c,scope:{...c.scope,population_id:'unrelated-subgroup'}}));assert.equal(charts.reportedStudyCounts(s,wrong,payload.evidence_registry).length,0);
 assert.equal(JSON.stringify(s),before);
});

test('grouped DOM selectors preserve class choices and use automatic endpoint defaults in every view',async()=>{
 const f=browserFixture();await new Promise(r=>setTimeout(r,60));const ui=f.context.__ui;
 for(const prefix of ['analysis','summary','matrix','planning'])assert.equal(f.get(prefix+'-measure'),null);
 assert.ok(f.get('analysis-comparator').options.some(o=>o.value==='treatment-class:ctla4'&&!o.disabled));assert.doesNotMatch(f.get('analysis-comparator').innerHTML,/<optgroup/);
 assert.ok(f.get('analysis-intervention').options.some(o=>o.value==='treatment-class:immune'&&!o.disabled));
 assert.doesNotMatch(f.get('analysis-intervention').innerHTML,/Reported arm [a-f0-9]{20}/);
 const rawId='reported-arm-test',names=new Map([['ipilimumab','Ipilimumab'],['nivolumab','Nivolumab'],['pembrolizumab','Pembrolizumab'],['tremelimumab','Tremelimumab'],[rawId,'Ipilimumab 3 mg/kg monotherapy']]);
 const synthetic=[['Nivolumab','ipilimumab'],['Pembrolizumab',rawId],['Nivolumab','tremelimumab']].map(([control,interest],i)=>study(i+800,{comparisons:[comparison(i+800,{comparator_label:control,comparator_drug_ids:[control.toLowerCase()],intervention_label:names.get(interest),intervention_drug_ids:[interest],additional_intervention_ids:[interest]})],details:{quantitative_results:[result(i+800,{analysis_n:{status:'reported',value:17,raw_text:'17',unit:'patients',evidence_ids:['E1']},endpoint:{family:'overall_survival'},measure:'HR',display_measure:'HR',estimate:{status:'reported',value:.8,raw_text:'0.8',unit:'ratio'}})]}}));
 ui.state.scopedStudies=synthetic;ui.state.drugLabels=names;f.get('analysis-endpoint').value='overall_survival';f.get('analysis-comparator').value='treatment-class:pd1';f.get('analysis-intervention').value='treatment-class:ctla4';ui.refreshStudyChoices('comparator');ui.renderStudies();
 assert.equal(f.get('analysis-comparator').value,'treatment-class:pd1');assert.equal(f.get('analysis-intervention').value,'treatment-class:ctla4');assert.equal(f.get('scoped-studies-count').textContent,'3 reports');
 const ipi=charts.interventionPresentation(synthetic[0].comparisons[0],names).key;assert.ok(f.get('analysis-intervention').options.some(o=>o.value===ipi));f.get('analysis-intervention').value=ipi;ui.refreshStudyChoices('intervention');ui.renderStudies();assert.equal(f.get('scoped-studies-count').textContent,'2 reports');
 for(const endpoint of ['overall_survival','progression_free_survival','recurrence','response','adverse_events'])for(const prefix of ['analysis','summary','matrix','planning']){f.get(prefix+'-endpoint').value=endpoint;assert.equal(ui.selectedMeasure(prefix),['response','adverse_events'].includes(endpoint)?'RR':'HR');}
 f.get('planning-endpoint').value='recurrence';ui.renderPlanning();assert.equal(f.get('planning-followup-field').hidden,false);assert.match(f.get('sample-axis-note').textContent,/log HR/);
 f.get('analysis-endpoint').value='response';f.get('analysis-comparator').value='';f.get('analysis-intervention').value='';
 const orr=result(901,{endpoint:{family:'response',definition:{text:'Objective response rate'}}}),rr=result(902,{endpoint:{family:'response',definition:{text:'Objective response rate'}},measure:'RR',display_measure:'RR',estimate:{status:'reported',value:1.25,raw_text:'1.25',unit:'ratio'}}),cr=result(903,{endpoint:{family:'response',definition:{text:'Complete response rate'}},display_measure:'response_probability'});
 // Known-N fixture isolates automatic endpoint selection from the missing-N display rule.
 for(const row of [orr,rr,cr])row.analysis_n={status:'reported',value:17,raw_text:'17',unit:'patients',evidence_ids:['E1']};
 ui.state.scopedStudies=[study(901,{comparisons:[comparison(901,{result_ids:['R901','R902','R903']})],details:{quantitative_results:[orr,rr,cr]}})];ui.refreshStudyChoices();ui.renderStudies();const out=f.get('scoped-studies-rows').innerHTML;assert.match(out,/ORR/);assert.match(out,/RR<\/span><div>1\.25/);assert.doesNotMatch(out,/Complete response/);
});
