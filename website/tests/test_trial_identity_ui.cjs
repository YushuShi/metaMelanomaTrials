'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const compact=require('../dist/quantitative_extraction.js'),charts=require('../dist/app.js');
const identifiers=require('../dist/trial_identifiers.js'),browse=require('../dist/treatment_node_studies.js');
const fixture=require('../../data/pilots/r2_quantitative_20261107/TEST_FIXTURE_NOT_PUBLIC.json');

function prepared(names,ids=[]){
  const payload=structuredClone(fixture),clinical=payload.clinical_evidence.articles[0];
  clinical.comparisons[0].comparator_native_regimen.nodes[0].name='ipilimumab';
  clinical.comparisons[0].intervention_native_regimen.nodes[0].name='nivolumab';
  const merged=compact.merge([],{},payload),study=merged.studies[0],base=study.details.quantitative_extraction[0];
  study.details.quantitative_extraction=names.map((name,index)=>({...structuredClone(base),stage:index?'R3':'R2',record:{...structuredClone(base.record),stage:index?'R3':'R2',study:{...base.record.study,name,evidence:['study-metadata'],identifiers:ids.map(id=>({registry:'ClinicalTrials.gov',id}))}}}));
  return {study,registry:merged.evidence_registry};
}

function tableHTML(rows){
  const context={charts,state:{scopedPayload:{evidence_registry:{}},drugLabels:new Map()},escape:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    studyTableCells:()=>({group:'Overall',sample_size:'N=157',effect:'0.7 (0.5–0.9)'}),armTreatmentTag:label=>label,external:(url,label)=>label,pubmedLink:id=>'https://pubmed.ncbi.nlm.nih.gov/'+id+'/'};
  const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),start=source.indexOf('  function studyRowsHTML('),end=source.indexOf('\n  function ',start+5);
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  return context.studyRowsHTML(rows,{include_missing_n:true,show_pmid:true,node_table:true});
}

test('R2 and R3 metadata harmonize identically in studies, CSV and exact-node study tables',()=>{
  const {study,registry}=prepared(['EORTC1325 / KEYNOTE-054','KEYNOTE 054'],['NCT02362594']),before=JSON.stringify(study);
  const trial=charts.studyTrialIdentifiers(study,{registry});
  assert.equal(trial.trial_label,'KEYNOTE-054');assert.deepEqual(trial.nct_ids,['NCT02362594']);
  assert.deepEqual(trial.reported_names,['EORTC1325 / KEYNOTE-054','KEYNOTE 054']);
  assert(trial.provenance.some(source=>source.stage==='R2'&&source.value==='EORTC1325 / KEYNOTE-054'));
  assert(trial.provenance.some(source=>source.stage==='R3'&&source.value==='KEYNOTE 054'));
  const matches=charts.filterStudies([study],{evidence_registry:registry});assert.equal(matches.length,1);
  assert.match(charts.studyTableCSV(matches,{registry,include_missing_n:true}),/"KEYNOTE-054","NCT02362594"/);
  assert.match(tableHTML(matches),/>KEYNOTE-054<\/td><td[^>]*>NCT02362594<\/td>/);
  const saved=study.details.quantitative_extraction[0],result=study.details.quantitative_results[0],node={id:'agent:nivolumab',label:'Nivolumab'};
  const membership={id:'test-node-member',pmid:study.pmid,node_id:node.id,study_id:'NCT02362594',independent_cohort_count_eligible:true,sample_n:157,
    canonical_regimen:{node_id:node.id,label:node.label},source_bindings:[{pmid:study.pmid,report_id:study.report_id,task_id:saved.task_id,stage:saved.record.stage,
      source_input_sha256:result.source_input_sha256,review_binding_sha256:result.review_binding_sha256,arm_ids:['A'],population_ids:['p'],result_ids:[result.result_id],sample_ids:study.details.sample_size_records.map(row=>row.sample_record_id)}]};
  const nodeRows=browse.matches([study],[membership],node,charts,{registry});assert.equal(nodeRows.length,1);
  assert.equal(charts.studyTrialIdentifiers(nodeRows[0].study).trial_label,'KEYNOTE-054');
  assert.match(tableHTML(nodeRows),/>KEYNOTE-054<\/td><td[^>]*>NCT02362594<\/td>/);
  assert.match(charts.studyTableCSV(nodeRows,{registry,include_missing_n:true}),/"KEYNOTE-054","NCT02362594"/);
  assert.equal(JSON.stringify(study),before);
});

test('legacy citation and compact extraction paths share canonical numeric trial spelling',()=>{
  const {study}=prepared(['CheckMate 67','CheckMate-067'],['NCT01844505']);
  const compactTrial=charts.studyTrialIdentifiers(study);
  const legacyTrial=charts.studyTrialIdentifiers({title:'CheckMate-067',citation:{trial_identifiers:['NCT01844505']}});
  assert.equal(compactTrial.trial_label,'CheckMate 067');assert.equal(legacyTrial.trial_label,compactTrial.trial_label);
  assert.deepEqual(compactTrial.nct_ids,['NCT01844505']);
  assert.deepEqual(compactTrial.reported_names,['CheckMate 67','CheckMate-067']);
});

test('distinct studies and explicit registration conflicts are retained rather than merged',()=>{
  const multiple=charts.studyTrialIdentifiers(prepared(['KEYNOTE-054','KEYNOTE-716'],['NCT02362594','NCT03553836']).study);
  assert.deepEqual(new Set(multiple.names),new Set(['KEYNOTE-054','KEYNOTE-716']));
  assert.deepEqual(new Set(multiple.nct_ids),new Set(['NCT02362594','NCT03553836']));
  const conflicting=charts.studyTrialIdentifiers(prepared(['KEYNOTE-054'],['NCT03553836']).study);
  assert(conflicting.nct_ids.includes('NCT03553836'));assert.equal(conflicting.status,'conflicting');
});

test('browser compact module receives the same trial harmonizer without title inference',()=>{
  const context={ClinicalEvidence:require('../dist/clinical_evidence.js'),ConfidenceIntervals:require('../dist/confidence_intervals.js'),TrialIdentifiers:identifiers};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../dist/quantitative_extraction.js'),'utf8'),context);
  const {study}=prepared(['EORTC1325 / KEYNOTE-054']);
  assert.equal(context.QuantitativeExtraction.trialIdentifiers(study).trial_label,'KEYNOTE-054');
  study.title='CheckMate 067';study.details.quantitative_extraction[0].record.study={name:'NA',identifiers:[]};
  assert.equal(context.QuantitativeExtraction.trialIdentifiers(study).trial_label,'NA');
  assert.equal(context.QuantitativeExtraction.trialIdentifiers(study).nct_label,'NA');
});
