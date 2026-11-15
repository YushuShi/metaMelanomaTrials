'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const charts=require('../dist/app.js');
const number=(value,unit='ratio')=>({status:'reported',value,raw_text:String(value),unit});
const result=(id,family='overall_survival',definition='Overall survival',measure='HR')=>({result_id:id,endpoint:{family,definition:{text:definition}},measure,estimate:number(.7),main_result_eligible:true});
const study=(rows)=>({report_id:'study',title:'Melanoma trial',default_visible:true,comparisons:[],details:{quantitative_results:rows}});

test('survival selection requires a reported HR estimate, rather than a statistic label or confidence interval alone',()=>{
  const hr=result('HR'),before=JSON.stringify(hr);assert(charts.resultMatches(hr,{endpoint:'overall_survival'}));
  for(const changed of [{measure:'median',estimate:number(20,'months')},{measure:'survival_probability',estimate:number(80,'%')},{measure:'OR'},{measure:'TR'},
    {estimate:number(.8,'%')},{estimate:{status:'not_reported',value:null},ci_lower:number(.4),ci_upper:number(.9)},
    {estimate:number(0)},{estimate:number(-.7)},{estimate:{status:'unclear',value:.7}},{display_measure:'HR',measure:'log HR'}])assert(!charts.resultMatches({...hr,...changed},{endpoint:'overall_survival'}));
  assert(charts.resultMatches({...hr,measure:'hazard ratio'},{endpoint:'overall_survival',measure:'HR'}));
  assert.equal(JSON.stringify(hr),before);
});

test('OS and DFS exclude median-only and percentage-only reports and keep only their HR rows in the CSV',()=>{
  for(const endpoint of ['overall_survival','disease_free_survival']){
    const median={...result('median',endpoint),measure:'median',estimate:number(10,'months')},hr=result('HR',endpoint),rows=[study([median]),{...study([hr,median]),report_id:'mixed'}];
    hr.analysis_n={...number(120,'patients'),evidence:[{source_id:'synthetic-trial-results',block_id:'survival-model',supporting_quote:'The survival analysis included 120 patients.'}]};
    const matches=charts.filterStudies(rows,{endpoint});assert.equal(matches.length,1);assert.deepEqual(matches[0].results.map(r=>r.result_id),['HR']);
    const csv=charts.studyTableCSV(matches);assert.match(csv,/0\.7/);assert.match(csv,/"120"/);assert.doesNotMatch(csv,/10 months/);
    assert.equal(charts.filterStudies(rows).length,2);
    delete hr.analysis_n;
    const withoutN=charts.filterStudies(rows,{endpoint});assert.equal(withoutN[0].results.length,1,'The accepted HR remains available in the underlying study');
    assert.equal(charts.studyTablePresentationRows(withoutN[0]).length,0,'The main table hides a result without a usable sample size');
    assert.equal(charts.studyTableCSV(withoutN).trim().split('\r\n').length,1,'The CSV follows the same missing-N rule');
  }
});

test('Recurrence is RFS only; DFS, DMFS, recurrence proportions and unspecified recurrence hazards stay separate',()=>{
  const rfs=result('RFS','recurrence','Recurrence-free survival'),dfs=result('DFS','recurrence','Disease-free survival'),dmfs=result('DMFS','recurrence','Distant metastasis-free survival');
  const unknown=result('unknown','recurrence','Recurrence'),binary={...rfs,measure:'RR'},before=JSON.stringify([rfs,dfs,dmfs,unknown,binary]);
  assert.deepEqual([rfs,dfs,dmfs,unknown,binary].map(row=>charts.resultMatches(row,{endpoint:'recurrence'})),[true,false,false,false,false]);
  assert.equal(charts.displayEndpointFamily(dfs),'disease_free_survival');assert.equal(charts.displayEndpointFamily(dmfs),'distant_metastasis_free_survival');
  assert(charts.resultMatches(dfs,{endpoint:'disease_free_survival'}));assert(charts.resultMatches({...dmfs,endpoint:{...dmfs.endpoint,family:null}},{endpoint:'distant_metastasis_free_survival'}));
  assert(charts.resultMatches({...rfs,variable:'RFS and DMFS outcomes'}, {endpoint:'recurrence'}));
  assert(charts.resultMatches({...rfs,endpoint:{family:'recurrence_free_survival'}},{endpoint:'recurrence_free_survival'}));
  assert.equal(JSON.stringify([rfs,dfs,dmfs,unknown,binary]),before);
});

test('an endpoint without available HR evidence is not silently reset to All endpoints',()=>{
  const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),start=source.indexOf('  function updateAvailability('),end=source.indexOf('\n  function ',start+10);
  const endpoint={value:'overall_survival',options:[{value:'overall_survival',setAttribute(){}}]},context={charts,state:{analysisBrowseEvidence:charts.evidenceIndex()},FIXED_DISEASE:'cutaneous_melanoma',$:()=>endpoint};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);context.updateAvailability('analysis');
  assert.equal(endpoint.value,'overall_survival');assert.equal(endpoint.options[0].disabled,true);
});

test('verified sequence reference is shown only for the exact source-owned HR and its unchanged direction',()=>{
  const {comparison,result:hr}=structuredClone(require('./fixtures/checkmate064_source_direction.json'));
  const s={report_id:hr.report_id,title:'CheckMate064',default_visible:true,comparisons:[comparison],details:{quantitative_results:[hr]}},before=JSON.stringify(s);
  const match=charts.filterStudies([s],{endpoint:'overall_survival'})[0];assert.equal(match.comparisons.length,1);
  const co=match.comparisons[0];assert.equal(charts.comparatorDisplayLabel(co),'Ipilimumab → Nivolumab');assert.equal(charts.interventionPresentation(co).label,'Nivolumab → Ipilimumab');assert.equal(charts.interventionPresentation(co).is_add_on,false);
  assert.equal(match.results[0].estimate.value,.48);assert.equal(JSON.stringify(s),before);
  hr.estimate.value=.49;const held=charts.filterStudies([s],{endpoint:'overall_survival'})[0];assert.equal(held.comparisons.length,0);
});

test('actual named studies show157and140 in the filtered table and CSV with the source HR reference',()=>{
  const path=require('node:path'),base=path.join(__dirname,'../../data/proposed_changes/sample_sizes_survival_20261105');
  const load=kind=>JSON.parse(fs.readFileSync(path.join(base,fs.readdirSync(base).find(n=>n.startsWith('PUBLIC_'+kind+'_TWO_CASES_')&&n.endsWith('.json'))),'utf8'));
  const legacy=load('STUDIES'),incoming=load('ARTICLES'),before=JSON.stringify([legacy,incoming]);
  const flags=Object.fromEntries(['clinical_validation','clinical_verified','pooling_eligible','report_R3_complete','final_R3_complete','numerical_extraction_complete','source_report_coverage_complete'].map(k=>[k,false]));
  const merged=require('../dist/clinical_evidence.js').merge(legacy.studies,legacy.evidence_registry,{...incoming,schema_version:1,status:'ready',record_kind:'canonical_clinical_evidence',...flags});
  const studies=require('../dist/regimen_definitions.js').prepareStudies(merged.studies),selection={endpoint:'overall_survival',evidence_registry:merged.evidence_registry};
  const matches=charts.filterStudies(studies,selection);assert.equal(matches.length,2);
  for(const [pmid,n]of [['42223134','157'],['27269740','140']]){
    const match=matches.find(m=>m.study.pmid===pmid);assert.equal(match.results.length,1);
    const data=charts.studyTableData(match,{registry:merged.evidence_registry});assert.equal(data.entries.length,1);assert.equal(data.entries[0].sample_size,n);
    const csv=charts.studyTableCSV([match],{registry:merged.evidence_registry});assert.match(csv,new RegExp('"'+n+'"'));
  }
  const sequence=matches.find(m=>m.study.pmid==='27269740');assert.equal(charts.comparatorDisplayLabel(sequence.comparisons[0]),'Ipilimumab → Nivolumab');
  const rfs=charts.filterStudies(studies,{endpoint:'recurrence'}).filter(m=>m.study.pmid==='42223134');assert.equal(rfs.length,1);assert.equal(rfs[0].results.length,1);assert.equal(rfs[0].results[0].estimate.value,.510);
  assert.equal(JSON.stringify([legacy,incoming]),before);
});
