'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const compact=require('../dist/quantitative_extraction.js'),charts=require('../dist/app.js'),about=require('../dist/about_article_progress.js');
const flags=Object.fromEntries(['clinical_validation','clinical_verified','pooling_eligible','report_R3_complete','final_R3_complete','numerical_extraction_complete','source_report_coverage_complete'].map(k=>[k,false]));
const rid=n=>'report-'+String(n).padStart(24,'0');
const record=(pmid)=>({pmid,stage:'R2',decision:{status:'retain'},study:{name:'Trial One',identifiers:[{registry:'ClinicalTrials.gov',id:'NCT01234567'}],study_type:'interventional_trial',randomized:'yes',comparison_structure:'comparative',setting:'advanced',melanoma_subtype:'NA',braf:'mixed',previous_systemic:'untreated'},populations:[{id:'P',scope:'overall',label:'ITT',melanoma_only:'yes',cutoff:'2025'}],arms:[{id:'A',population_id:'P',label:'A',root_id:'a',nodes:[{id:'a',kind:'drug',name:'nivolumab',children:[]}]},{id:'B',population_id:'P',label:'B',root_id:'b',nodes:[{id:'b',kind:'drug',name:'ipilimumab',children:[]}]}],sample_sizes:[{id:'N',population_id:'P',arm_id:'NA',result_id:'E',count_purpose:'ITT',n:157,method:'reported'}],effects:[{id:'E',population_id:'P',endpoint:'OS',intervention_arm_id:'A',reference_arm_id:'B',analysis_n:157,measure:'HR',estimate:.7,ci_lower:.5,ci_upper:.9,ci_level:95,adjusted:'no'}],survival:[{id:'S',population_id:'P',arm_id:'A',endpoint:'PFS',kind:'median',estimate:'NA',median_status:'not_reached',unit:'months',time:'NA',analysis_n:107}],binary:[{id:'R',population_id:'P',arm_id:'A',endpoint:'ORR',numerator:40,denominator:107,percentage:37.4,assessment_time:6,time_unit:'months',response_criteria:'RECIST 1.1',safety_attribution:'NA'}]});
function fixture(){
  const articles=['1','2'].map(pmid=>({pmid,report_id:rid(pmid),title:'Report '+pmid,current_screening_status:pmid==='1'?'retain':'exclude',current_main_eligible:pmid==='1',quantitative_results:[],sample_size_records:[],comparisons:[],reviews:[]}));
  return {schema_version:1,mode:'pilot',publication_ready:true,scope_pmids:['1','2'],articles:articles.map(a=>({pmid:a.pmid,records:[{stage:'R2',task_id:'T'+a.pmid,record:{...record(a.pmid),decision:{status:a.current_screening_status}},issues:[]}]})),clinical_evidence:{schema_version:1,status:'ready',record_kind:'canonical_clinical_evidence',...flags,evidence_registry:{},articles},about_progress:{schema_version:1,unit:'articles',stage_scope:['R2'],stages:{R2:{unit:'articles',entered:2,screening_finished:2,retained:1,excluded:1,unclear:0,unclear_reports:[]}}}};
}
test('published pilot discards all prior results and out-of-scope articles without mutating history',()=>{
  const old=[{pmid:'1',report_id:rid(1),title:'Report 1',default_visible:true,comparisons:[{comparison_id:'OLD'}],single_arm_regimens:[{comparison_id:'OLDARM'}],numeric_completion_v6_treated_context:{value:999},details:{quantitative_results:[{result_id:'OLD',estimate:999}],sample_size_records:[{n:999}],clinical_reviews:[{stage:'R3'}],canonical_result_groups:[]}},{pmid:'3',report_id:rid(3),title:'Outside',default_visible:true,comparisons:[],details:{}}];
  const snapshot=fixture(),before=JSON.stringify([old,snapshot]);const merged=compact.merge(old,{OLD:{supporting_quote:'Historical'}},snapshot);
  assert.deepEqual(merged.studies.map(s=>s.pmid),['1','2']);assert.equal(merged.studies[0].default_visible,true);assert.equal(merged.studies[1].default_visible,false);
  for(const study of merged.studies){assert.deepEqual(study.details.quantitative_results,[]);assert.deepEqual(study.details.sample_size_records,[]);assert.deepEqual(study.comparisons,[]);assert.deepEqual(study.single_arm_regimens,[]);assert.equal(study.numeric_completion_v6_treated_context,undefined);assert.equal(study.quantitative_only,true);}
  assert.deepEqual(merged.evidence_registry,{});assert.equal(JSON.stringify([old,snapshot]),before);
});
test('incomplete publication, foreign scope, old R3 and missing decisions fail closed',()=>{
  for(const modify of [p=>p.publication_ready=false,p=>p.scope_pmids.push('3'),p=>p.articles[0].pmid='3',p=>p.articles[0].records[0].stage='R3',p=>p.articles[0].records[0].record.decision.status='NA',p=>p.articles[0].records.push(p.articles[0].records[0]),p=>p.clinical_evidence.articles.pop()]){const p=fixture();modify(p);assert.throws(()=>compact.checked(p));}
});
test('compact study names and registrations are used directly, without prior hardcoded or title inference',()=>{
  const study=compact.merge([],{},fixture()).studies[0];assert.equal(charts.studyTrialIdentifiers(study).trial_label,'Trial One');assert.equal(charts.studyTrialIdentifiers(study).nct_label,'NCT01234567');
  study.title='CheckMate 064';study.pmid='27269740';study.details.quantitative_extraction[0].record.study={name:'NA',identifiers:[]};
  assert.equal(charts.studyTrialIdentifiers(study).trial_label,'NA');assert.equal(charts.studyTrialIdentifiers(study).nct_label,'NA');
});
test('structured details render outcome-specific N, per-arm response counts, median status and no raw JSON',()=>{
  const study=compact.merge([],{},fixture()).studies[0],before=JSON.stringify(study),html=compact.render(study);
  for(const text of ['Sample sizes','157','ORR','40','107','37.4','RECIST 1.1','not reached','nivolumab','ipilimumab','0.700 (0.500–0.900)'])assert(html.includes(text),text);
  assert.doesNotMatch(html,/<pre|source_sha256|task_id|"schema_id"|node_id/);assert.equal(JSON.stringify(study),before);
  study.details.quantitative_extraction[0].record.study.name='<script>bad</script>';
  study.details.quantitative_extraction[0].record.arms[0].nodes[0].name='<script>bad</script>';
  assert.doesNotMatch(compact.render(study),/<script>/);assert.match(compact.render(study),/&lt;script&gt;/);
});
test('AND, OR and sequential maintenance remain distinct in treatment detail labels',()=>{
  const arm={root_id:'s',nodes:[{id:'s',kind:'SEQUENTIAL',children:['ab','a2']},{id:'ab',kind:'AND',children:['a','b']},{id:'a',kind:'drug',name:'nivolumab'},{id:'b',kind:'drug',name:'ipilimumab'},{id:'a2',kind:'drug',name:'nivolumab'}]};
  assert.equal(compact.regimen(arm),'(nivolumab + ipilimumab) → nivolumab');
  arm.nodes[1].kind='OR';assert.equal(compact.regimen(arm),'(nivolumab OR ipilimumab) → nivolumab');
});
test('all time-to-event definitions have distinct abbreviations and HR-only endpoint filtering',()=>{
  for(const [family,code]of [['overall_survival','OS'],['progression_free_survival','PFS'],['recurrence','RFS'],['disease_free_survival','DFS'],['event_free_survival','EFS'],['distant_metastasis_free_survival','DMFS'],['disease_specific_survival','DSS'],['duration_of_response','DOR']]){
    assert.equal(charts.endpointLabel(family),code);assert.equal(charts.defaultEffectMeasure(family),'HR');
    const row={endpoint:{family,definition:{text:code}},measure:'HR',estimate:{status:'reported',value:.7,unit:'ratio'},main_result_eligible:true};
    assert.equal(charts.resultMatches(row,{endpoint:family}),true);assert.equal(charts.resultMatches({...row,measure:'median',estimate:{status:'reported',value:14,unit:'months'}},{endpoint:family}),false);
  }
});
test('pilot About displays only its R2 counts and never historic R3 claims',()=>{
  const payload=fixture().about_progress,html=about.render(payload);assert.match(html,/R2 · Title and abstract/);assert.doesNotMatch(html,/R3|Full text/);assert.equal((html.match(/<dt>/g)||[]).length,5);
});
test('new pilot publication clears summary and analysis rather than borrowing old pooled evidence',()=>{
  const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),start=source.indexOf('  function applyQuantitativeSnapshot('),end=source.indexOf('\n  function ',start+5);
  const context={state:{baselineScopedStudies:[],baseScopedPayload:{evidence_registry:{}},analysis:{validated:true,analyses:[{id:'old'}]},summary:{counts:{retained:9999}}},defaults:{counts:{}},refreshTreatmentLabels(){},invalidateAdvancedEvidence(){},invalidateTreatmentMap(){},refreshEvidenceFreshness(){},QuantitativeExtraction:compact,RegimenDefinitions:{prepareStudies:x=>x}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);context.applyQuantitativeSnapshot(fixture());assert.equal(context.state.analysis.validated,false);assert.equal(context.state.analysis.analyses.length,0);assert.equal(context.state.summary.counts.candidates,2);assert.equal(context.state.scopedStudies.length,2);
});
test('backend projection displays summed N157 and native generic drugs in the main table and CSV',()=>{
  const p=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../../data/pilots/r2_quantitative_20261107/TEST_FIXTURE_NOT_PUBLIC.json'),'utf8'));
  const co=p.clinical_evidence.articles[0].comparisons[0];
  co.comparator_native_regimen.nodes[0].name='nivolumab';
  co.intervention_native_regimen.nodes[0].name='ipilimumab';
  const m=compact.merge([],{},p),studies=require('../dist/regimen_definitions.js').prepareStudies(m.studies),match=charts.filterStudies(studies,{endpoint:'overall_survival',measure:'HR',evidence_registry:m.evidence_registry})[0];
  const table=charts.studyTableData(match,{registry:m.evidence_registry}),regimens=charts.studyTreatmentRows(match);
  assert.equal(table.entries[0].sample_size,'157');assert.equal(table.entries[0].effect,'0.700 (0.500–0.900)');assert.equal(table.entries[0].label,'OS · HR');
  assert.equal(regimens[0].comparator_label,'Nivolumab');assert.equal(regimens[0].intervention_label,'Ipilimumab');assert.equal(regimens[0].is_add_on,false);
  assert.match(charts.studyTableCSV([match],{registry:m.evidence_registry}),/"Nivolumab","Ipilimumab","OS · HR","157","OS · HR: 0.700 \(0.500–0.900\)"/);
});
test('separate non-melanoma population numbers stay out of compact clinical tables',()=>{
  const study=compact.merge([],{},fixture()).studies[0],r=study.details.quantitative_extraction[0].record;
  r.populations.push({id:'X',scope:'subgroup',label:'NSCLC',melanoma_only:'no'});r.binary.push({...r.binary[0],id:'NSCLC',population_id:'X',percentage:99.123});
  const html=compact.render(study);assert.doesNotMatch(html,/NSCLC|99\.123/);assert.match(html,/37\.4/);
});
test('pilot boot loads its compact snapshot and classifications without older evidence datasets',async()=>{
  const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),extract=name=>{const start=source.indexOf('  '+(name==='loadData'?'async ':'')+'function '+name+'('),end=source.indexOf('\n  function ',start+5);return source.slice(start,end);};
  const p=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../../data/pilots/r2_quantitative_20261107/TEST_FIXTURE_NOT_PUBLIC.json'),'utf8')),requests=[],elements=new Map();
  const context={state:{},defaults:{counts:{}},FIXED_DISEASE:'cutaneous_melanoma',refreshTreatmentLabels(){},invalidateAdvancedEvidence(){},invalidateTreatmentMap(){},refreshEvidenceFreshness(){},fetchTreatments:async()=>({fixture:true}),renderStudies(){},setupAnalysisControls(){},scheduleClinicalRefresh(){},normalizeReports:x=>x,studyResultsFamilies:()=>['overall_survival'],charts,QuantitativeExtraction:compact,RegimenDefinitions:{prepareStudies:studies=>require('../dist/regimen_definitions.js').prepareStudies(studies)},$:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);},fetchJson:async url=>{requests.push(url);if(url==='./data/clinical_classifications.json')return{schema_version:1,classification_version:'fixture'};if(url!=='./data/quantitative_extraction.json')throw new Error('Historical dataset requested');return p;}};
  context.updateClinicalClassifications=async()=>{context.state.clinicalClassifications=await context.fetchJson('./data/clinical_classifications.json');};
  vm.createContext(context);vm.runInContext(extract('applyQuantitativeSnapshot')+extract('loadData'),context);await context.loadData();
  assert.deepEqual(requests,['./data/quantitative_extraction.json','./data/clinical_classifications.json']);assert.equal(context.state.datasetError,false);assert.equal(context.state.loading,false);assert.equal(context.state.records.length,1);assert.equal(context.state.quantitativeResults.length,1);assert.equal(context.state.analysis.validated,false);
});
test('validated display N appears consistently in details and derived Wald intervals are labelled in table and CSV',()=>{
  const p=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../../data/pilots/r2_quantitative_20261107/TEST_FIXTURE_NOT_PUBLIC.json'),'utf8'));
  const r=p.articles[0].records[0].record.effects[0],row=p.clinical_evidence.articles[0].quantitative_results[0],derived={method:'derived_two_sided_Wald',ci_lower:.5,ci_upper:.9,ci_level:95,test_assumed:true};
  r.analysis_n='NA';r.display_n={n:157,status:'derived_arm_sum',count_purpose:'randomized',count_ids:['n1','n2']};r.derived_ci=derived;row.quantitative_record={...r};
  const m=compact.merge([],{},p),studies=require('../dist/regimen_definitions.js').prepareStudies(m.studies),match=charts.filterStudies(studies,{endpoint:'overall_survival',measure:'HR',evidence_registry:m.evidence_registry})[0];
  const html=compact.render(match.study),effects=html.slice(html.indexOf('Comparative results'));
  assert.match(effects,/<td>157<\/td>/);assert.match(effects,/derived 95% Wald CI/);
  assert.match(charts.studyTableData(match,{registry:m.evidence_registry}).entries[0].effect,/derived 95% Wald CI/);assert.match(charts.studyTableCSV([match],{registry:m.evidence_registry}),/derived 95% Wald CI/);
  r.display_n={n:'NA',status:'CONFLICTING'};assert.match(compact.render(compact.merge([],{},p).studies[0]),/NA · CONFLICTING/);
});

test('new extraction NA or conflicting N cannot be rescued by old inline or sample-count heuristics',()=>{
  const p=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../../data/pilots/r2_quantitative_20261107/TEST_FIXTURE_NOT_PUBLIC.json'),'utf8'));
  for(const status of ['missing','CONFLICTING']){
    const copy=structuredClone(p),row=copy.clinical_evidence.articles[0].quantitative_results[0];row.scoped_sample_size={n:'NA',status,basis:'NA'};row.analysis_n={...row.analysis_n,status:'reported',value:999};
    const m=compact.merge([],{},copy),studies=require('../dist/regimen_definitions.js').prepareStudies(m.studies),match=charts.filterStudies(studies,{endpoint:'overall_survival',evidence_registry:m.evidence_registry})[0],data=charts.studyTableData(match,{registry:m.evidence_registry});
    assert.equal(data.entries[0].sample_size,'NA');assert.equal(data.counts.length,0);assert.doesNotMatch(charts.studyTableCSV([match],{registry:m.evidence_registry}),/999/);
  }
});
test('pilot overall and subgroup findings remain separate even with identical regimens',()=>{
  const p=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../../data/pilots/r2_quantitative_20261107/TEST_FIXTURE_NOT_PUBLIC.json'),'utf8'));
  const m=compact.merge([],{},p),study=require('../dist/regimen_definitions.js').prepareStudies(m.studies)[0],base=study.comparisons[0],one=study.details.quantitative_results[0];
  const two={...one,result_id:one.result_id+'subgroup',comparison_id:base.comparison_id+'subgroup',population:{...one.population,label:'BRAF-mutant melanoma',result_scope:'subgroup'}},co={...base,comparison_id:two.comparison_id,scope:{...base.scope,population_id:'BRAF'},result_ids:[two.result_id]};delete co.comparator_regimen;delete co.intervention_regimen;
  const match={study,comparisons:[base,co],results:[one,two]},groups=charts.studyTreatmentRows(match);
  assert.equal(groups.length,2);assert.deepEqual(groups.map(g=>g.results.length),[1,1]);assert.match(charts.studyTableData(match,{registry:m.evidence_registry}).entries[1].label,/Subgroup: BRAF-mutant melanoma/);
});
test('dose distinguishes otherwise identical arms in details but does not change generic regimen names',()=>{
  const s=compact.merge([],{},fixture()).studies[0],r=s.details.quantitative_extraction[0].record;
  for(const [index,arm]of r.arms.entries()){arm.nodes[0].name='ipilimumab';arm.nodes[0].dose=index?'10 mg/kg':'3 mg/kg';}
  assert.equal(compact.regimen(r.arms[0]),'ipilimumab');assert.equal(compact.regimen(r.arms[1]),'ipilimumab');
  assert.match(compact.render(s),/3 mg\/kg/);assert.match(compact.render(s),/10 mg\/kg/);
});
test('actual dose arms are distinct scientific contexts while true same-arm discrepancies still flag conflicts',()=>{
  const path=require('node:path'),p=JSON.parse(fs.readFileSync(path.join(__dirname,'../../data/pilots/r2_quantitative_20261107/FIRST_SIX_TEST_NOT_PUBLIC.json'),'utf8'));
  let merged=compact.merge([],{},p);
  for(const pmid of ['20004617','26115796','31880964'])assert.equal(merged.studies.find(s=>s.pmid===pmid).details.quantitative_results.filter(r=>r.extraction_conflict).length,0);
  const article=p.clinical_evidence.articles.find(a=>a.pmid==='26115796'),original=article.quantitative_results.find(r=>r.measure==='HR'),changed=structuredClone(original);
  changed.result_id=changed.result_id.slice(0,-16)+'abcdefabcdefabcd';changed.estimate.value=.61;changed.estimate.raw_text='.61';changed.quantitative_record.estimate=.61;
  for(const collection of ['reported_numbers','source_reported_numbers'])for(const n of changed[collection])if(n.role==='estimate'){n.value=.61;n.raw_text='.61';}
  article.quantitative_results.push(changed);article.comparisons.find(c=>c.comparison_id===changed.comparison_id).result_ids.push(changed.result_id);
  merged=compact.merge([],{},p);const rows=merged.studies.find(s=>s.pmid==='26115796').details.quantitative_results;
  assert.equal(rows.find(r=>r.result_id===original.result_id).extraction_conflict,true);assert.equal(rows.find(r=>r.result_id===changed.result_id).extraction_conflict,true);
});
test('specific safety definitions and grade thresholds survive main, CSV and compact detail rendering',()=>{
  const path=require('node:path'),p=JSON.parse(fs.readFileSync(path.join(__dirname,'../../data/pilots/r2_quantitative_20261107/FIRST_SIX_TEST_NOT_PUBLIC.json'),'utf8'));
  const m=compact.merge([],{},p),studies=require('../dist/regimen_definitions.js').prepareStudies(m.studies),study=studies.find(s=>s.pmid==='20004617');
  const matches=charts.filterStudies([study],{endpoint:'adverse_events',measure:'RR',evidence_registry:m.evidence_registry}),csv=charts.studyTableCSV(matches,{registry:m.evidence_registry}),html=compact.render(study);
  for(const value of ['gastrointestinal','diarrhoea','Grade 3–4']){assert(csv.includes(value));assert(html.includes(value));}
  assert.equal(compact.definition({endpoint:'AE_grade_ge3',endpoint_definition:'NA'}),'Grade ≥3 AE');assert.equal(compact.definition({endpoint:'AE_grade_3_4',endpoint_definition:'NA'}),'Grade 3–4 AE');
});
test('otherwise identical dose arms are distinguished in result labels and CSV while menus stay generic',()=>{
 const path=require('node:path'),p=JSON.parse(fs.readFileSync(path.join(__dirname,'../../data/pilots/r2_quantitative_20261107/FIRST_SIX_TEST_NOT_PUBLIC.json'),'utf8'));
 const m=compact.merge([],{},p),studies=require('../dist/regimen_definitions.js').prepareStudies(m.studies),match=charts.filterStudies(studies.filter(s=>s.pmid==='20004617'),{endpoint:'response',measure:'RR',include_orr:true,orr_only:true,evidence_registry:m.evidence_registry})[0];
 const entries=charts.studyTableData(match,{registry:m.evidence_registry}).entries;assert.deepEqual(entries.map(e=>e.label),['ORR · ipilimumab (10 mg/kg)','ORR · ipilimumab (3 mg/kg)','ORR · ipilimumab (0.3 mg/kg)']);assert.deepEqual(entries.map(e=>e.sample_size),['73','72','72']);
 for(const dose of ['10 mg/kg','3 mg/kg','0.3 mg/kg'])assert(charts.studyTableCSV([match],{registry:m.evidence_registry}).includes(dose));
 assert(charts.studyTreatmentRows(match).every(group=>group.intervention_label==='Ipilimumab'));
 const pfs=charts.filterStudies(studies.filter(s=>s.pmid==='26115796'),{endpoint:'progression_free_survival',measure:'HR',evidence_registry:m.evidence_registry})[0];
 assert.deepEqual(charts.studyTableData(pfs,{registry:m.evidence_registry}).entries.map(e=>e.label),['PFS · HR · pembrolizumab (2 mg/kg)','PFS · HR · pembrolizumab (10 mg/kg)']);
 const csv=charts.studyTableCSV([pfs],{registry:m.evidence_registry});for(const dose of ['2 mg/kg','10 mg/kg'])assert(csv.includes(dose));assert.doesNotMatch(csv,/Cutoff: Second interim analysis/);assert(compact.records(pfs.study).some(record=>record.effects.some(row=>row.cutoff==='Second interim analysis')));
});
