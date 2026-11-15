'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {build}=require('../scripts/treatment_map_model.cjs');
const registry=require('../../config/treatment_registry.json');
const identifiers=require('../dist/trial_identifiers.js');
const browse=require('../dist/treatment_node_studies.js');

function record(pmid,name,ncts,n,proof){
  return {pmid,stage:'R2',source_sha256:'source-'+pmid,report_id:'report-'+pmid,decision:{status:'retain'},
    study:{name,identifiers:ncts.map(id=>({id})),randomized:'yes',study_type:'interventional_trial',evidence:['e'+pmid]},
    populations:[{id:'overall',label:'All melanoma patients',scope:'overall',melanoma_only:'yes',parent_id:'NA',evidence:['e'+pmid]}],
    arms:[{id:'arm',label:'Nivolumab',population_id:'overall',root_id:'drug',nodes:[{id:'drug',kind:'drug',name:'nivolumab',children:[]}],evidence:['e'+pmid]}],
    sample_sizes:[{id:'n',arm_id:'arm',population_id:'overall',n,count_purpose:'randomized',complete:'yes',evidence:['e'+pmid]}],effects:[],
    test_proof:proof||name+' trial enrolled '+n+' patients.'};
}
function graph(records){
  return build({registry,quantitative:{articles:records.map(record=>({pmid:record.pmid,records:[{record,stage:record.stage}]})),
    clinical_evidence:{articles:records.map(record=>({pmid:record.pmid,current_main_eligible:true,title:record.study.name+' trial',year:2025})),
      evidence_registry:Object.fromEntries(records.map(record=>['e'+record.pmid,{supporting_quote:record.test_proof,source_id:record.report_id+':abstract'}]))}}});
}
const summary=graph=>graph.nodes.find(node=>node.id==='agent:nivolumab').count_summary;

test('verified retired registrations deduplicate while preserving their original source IDs',()=>{
  const catalogue=require('../dist/trial_registry.js');
  const entry=catalogue.records.find(r=>r.nct_aliases?.includes('NCT00003722'));
  assert.equal(entry.nct_ids[0],'NCT00052156');
  const rows=[record('1','NA',entry.nct_ids,100),record('2','NA',['NCT00003722'],80)],before=JSON.stringify(rows);
  const result=graph(rows);assert.equal(summary(result).identified_studies,1);assert.equal(summary(result).known_n,100);
  assert.equal(JSON.stringify(rows),before);
  assert.deepEqual(identifiers.harmonize({nct_ids:['NCT00003722']}).reported_nct_ids,['NCT00003722']);
});

test('only complete exact trial-name lists split and restricted numeric aliases need their publication',()=>{
  const pair=identifiers.harmonize({names:['OpACIN-neo and PRADO']});
  assert.deepEqual(pair.names,['OpACIN-neo','PRADO']);assert.deepEqual(pair.nct_ids,['NCT02977052']);
  assert.equal(pair.independent_cohort_keys.length,2);
  assert.equal(identifiers.harmonize({names:['11715'],pmid:'18445842'}).nct_label,'NCT00110994');
  assert.equal(identifiers.harmonize({names:['11715'],pmid:'another'}).nct_label,'NA');
  assert.deepEqual(identifiers.get({title:'COLUMBUS-AD trial results'}).names,['COLUMBUS-AD']);
});

test('catalogued independent PRADO and OpACIN-neo cohorts do not collapse when an abstract omits their extension history',()=>{
  const records=[record('1','PRADO',[],99),record('2','OpACIN-neo',[],86),record('3','PRADO',[],99)];
  const before=JSON.stringify(records),result=graph(records);
  assert.equal(summary(result).identified_studies,2);
  assert.equal(summary(result).known_n,185);
  assert.equal(new Set(result.contributions.map(row=>row.cohort_id)).size,2);
  const rows=browse.matches([],result.study_memberships,{id:'agent:nivolumab',label:'Nivolumab'},{studyResults:()=>[],studyTablePresentationRows:()=>[]});
  assert.equal(browse.independentStudyIds(rows).size,2);
  assert.equal(rows.find(row=>row.study.pmid==='1').related_report_count,2);
  assert.equal(rows.find(row=>row.study.pmid==='2').related_report_count,1);
  assert.equal(JSON.stringify(records),before);
});

test('a conflicting trial name and registration cannot replace an unrelated correctly identified trial',()=>{
  const records=[record('1','KEYNOTE-054',['NCT03553836'],99),record('2','KEYNOTE-716',['NCT03553836'],86)];
  const before=JSON.stringify(records),result=graph(records);
  const registered=result.contributions.filter(row=>row.study_id==='nct:NCT03553836');
  assert(registered.some(row=>row.pmid==='2'));
  assert(registered.every(row=>row.pmid==='2'));
  assert.equal(JSON.stringify(records),before);
});

test('the reviewed KEYNOTE-006 extension follows its original cohort without globally merging KEYNOTE-587',()=>{
  const original=record('100','KEYNOTE-006',['NCT01866319'],99);
  const followup=record('39306585','KEYNOTE-006 and KEYNOTE-587',['NCT01866319','NCT03486873'],99,
    'Patients in KEYNOTE-006 (NCT01866319) transitioned to KEYNOTE-587 (NCT03486873) for long-term follow-up.');
  const separate=record('200','KEYNOTE-587',['NCT03486873'],86);
  const result=graph([original,followup,separate]);
  assert.equal(summary(result).identified_studies,2);
  assert.equal(summary(result).known_n,185);
  assert(result.contributions.filter(row=>row.pmid==='39306585').every(row=>row.study_id==='nct:NCT01866319'));
  assert(result.contributions.some(row=>row.pmid==='200'&&row.study_id==='nct:NCT03486873'));
});

test('live article titles and biological targets do not acquire unrelated acronym trial registrations',()=>{
  const ox40=identifiers.harmonize({pmid:'35699599',names:['First-In-Human Phase I Study of the OX40 Agonist MOXR0916 in Patients with Advanced Solid Tumors'],nct_ids:['NCT02219724']});
  assert.deepEqual(ox40.nct_ids,['NCT02219724']);
  assert.notEqual(ox40.status,'conflicting');
  assert(!ox40.names.includes('OX40'));
  for(const [pmid,name]of [
    ['32395490','MSK-IMPACT cohort'],
    ['39169411','Circulating tumour DNA dynamics predict recurrence in stage III melanoma patients receiving neoadjuvant immunotherapy'],
    ['39507408','Impact on Survival with Immunotherapy and Evaluation of Biomarkers in Peruvian Patients with Advanced Melanoma'],
    ['41701163','Impact of immune checkpoint inhibition on ovarian reserve']
  ])assert.deepEqual(identifiers.harmonize({pmid,names:[name]}).nct_ids,[],pmid+' must not become an unrelated IMPACT/PREDICT trial');
});
