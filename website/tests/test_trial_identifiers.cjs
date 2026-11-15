'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Trials=require('../dist/trial_identifiers.js');
const Clinical=require('../dist/clinical_evidence.js');
const root=path.resolve(__dirname,'../..');
const load=(dir,prefix)=>JSON.parse(fs.readFileSync(path.join(root,dir,fs.readdirSync(path.join(root,dir)).find(f=>f.startsWith(prefix)))));
const bundles=[
  load('data/proposed_changes/labels_trials_wald_20261106','PUBLIC_ARTICLES_FOUR_CASES_'),
  load('data/proposed_changes/labels_trials_wald_20261106','PUBLIC_STUDIES_FOUR_CASES_'),
  load('data/proposed_changes/sample_sizes_survival_20261105','PUBLIC_ARTICLES_TWO_CASES_'),
  load('data/proposed_changes/sample_sizes_survival_20261105','PUBLIC_STUDIES_TWO_CASES_')
];
const cases=new Map(bundles.flatMap(b=>(b.articles||b.studies).map(a=>[String(a.pmid),{a,registry:b.evidence_registry}])));
function actual(pmid){const x=cases.get(pmid);return Trials.get(x.a,{registry:x.registry});}
test('six exact stored articles retain trial numbers, own registrations and qualified constituent relationships',()=>{
  for(const [pmid,name,nct] of [['16170182','EORTC 18951','NCT00002669'],['23402397','SICOG 0109','NCT01359956'],['31880964','ECOG-E1609','NCT01274338'],['27269740','CheckMate 064','NCT01783938'],['42223134','KEYNOTE-942','NCT03897881']]){
    const v=actual(pmid);assert.equal(v.trial_label,name);assert.equal(v.nct_label,nct);
  }
  const maic=actual('41971757');assert.deepEqual(maic.source_trial_names,['RELATIVITY-047','COMBI-d','COMBI-v','COLUMBUS','coBRIM','IMspire150']);
  assert.equal(maic.own_trial_names.length,0);assert.equal(maic.nct_label,'NA');assert.match(maic.trial_label,/^Source trials:/);assert.doesNotMatch(maic.trial_label,/DREAMseq/);
});
test('the actual deployed clinical merger preserves trial metadata in its clinical_reviews location',()=>{
  const baseline=bundles.flatMap(b=>b.studies||[]), incoming=bundles[0];
  const payload={schema_version:1,status:'ready',record_kind:'canonical_clinical_evidence',articles:incoming.articles,evidence_registry:incoming.evidence_registry};
  for(const k of ['clinical_validation','clinical_verified','pooling_eligible','report_R3_complete','final_R3_complete','numerical_extraction_complete','source_report_coverage_complete'])payload[k]=false;
  const merged=Clinical.merge(baseline,{},payload);
  const maic=merged.studies.find(s=>s.pmid==='41971757');assert.ok(maic.details.clinical_reviews.length);
  assert.deepEqual(Trials.get(maic,{registry:merged.evidence_registry}).source_trial_names,actual('41971757').source_trial_names);
});
test('known BEAM title and arbitrary explicitly source-backed own trial-name fields are supported',()=>{
  assert.equal(Trials.get({title:'Carboplatin, paclitaxel and bevacizumab for metastatic melanoma (BEAM).'}).trial_label,'BEAM');
  const fact={fact_id:'F',domain:'study_identification',field:'trial_name',reported_trial:'BIONIC-7',text:'Trial name: BIONIC-7',scope:'observed',evidence_origin:'own_report_results',evidence_ids:['E']};
  const a={title:'Melanoma treatment study',details:{clinical_reviews:[{review_namespace:'R',facts:[{fact}]}]}};
  assert.equal(Trials.get(a,{registry:{'CE-R-E':{supporting_quote:'Patients in the BIONIC-7 trial were randomized.'}}}).trial_label,'BIONIC-7');
  assert.equal(Trials.get(a,{registry:{'CE-R-E':{supporting_quote:'A different trial was cited.'}}}).trial_label,'NA');
});
test('reviewed registry additions bind exact PMID, report, DOI and named publication',()=>{
  const a=structuredClone(cases.get('31880964').a);a.details.citation.trial_identifiers=[];
  for(const change of [{pmid:'1'},{report_id:'report-other'},{doi:'10.invalid/other'},{title:'Unrelated E1609 commentary'}]){
    const candidate={...a,...change};if(change.title)candidate.details={...a.details,citation:{...a.details.citation,title:change.title}};
    // The title change still contains E1609, so also remove the exact trial-publication framing.
    if(change.title)candidate.title='Unrelated trial commentary';
    assert.equal(Trials.get(candidate).nct_label,'NA');
  }
});
test('an arbitrary full-text or discussion identifier never becomes the own study registration',()=>{
  const a={title:'A melanoma treatment study',pmid:'1',blocks:[{text:'Another trial is NCT01400451.'}],details:{citation:{abstract:'Other investigators reported NCT01400451.'}}};
  const before=JSON.stringify(a);assert.equal(Trials.get(a).nct_label,'NA');assert.equal(JSON.stringify(a),before);
  assert.equal(actual('23402397').nct_ids.includes('NCT01400451'),false);
});
test('previous-study registration language cannot impersonate own abstract or metadata registration',()=>{
  for(const abstract of ['A previous study was registered at ClinicalTrials.gov as NCT12345678.','An earlier randomized trial was registered at NCT12345678.','A study was registered at NCT12345678.']){
    assert.equal(Trials.get({details:{citation:{abstract}}}).nct_label,'NA');
  }
  const fact={fact_id:'F',domain:'study_identification',field:'trial_registration',reported_trial:'NCT12345678',text:'Registration NCT12345678',scope:'observed',evidence_origin:'own_report_results',evidence_ids:['E']};
  const a={reviews:[{review_namespace:'R',facts:[{fact}]}]};
  assert.equal(Trials.get(a,{registry:{'CE-R-E':{supporting_quote:'A previous trial was registered as NCT12345678.'}}}).nct_label,'NA');
  assert.equal(Trials.get({details:{citation:{abstract:'This study was registered at ClinicalTrials.gov as NCT12345678.'}}}).nct_label,'NCT12345678');
});
test('own supported registration metadata requires its owned evidence while cited findings remain excluded',()=>{
  const fact={fact_id:'F',domain:'study_identification',field:'trial_registration',reported_trial:'NCT12345678',text:'Registration NCT12345678',scope:'observed',evidence_origin:'own_report_results',evidence_ids:['E']};
  const a={title:'Treatment report',reviews:[{review_namespace:'R',facts:[{fact}]}]},registry={'CE-R-E':{supporting_quote:'This trial is registered as NCT12345678.'}};
  assert.equal(Trials.get(a,{registry}).nct_label,'NCT12345678');assert.equal(Trials.get(a).nct_label,'NA');
  a.reviews[0].facts[0].fact={...fact,evidence_origin:'cited_other_report'};assert.equal(Trials.get(a,{registry}).nct_label,'NA');
});
test('a broad supporting span cannot import a discussion-only trial into an adopted data list',()=>{
  const a={title:'A matching-adjusted indirect comparison',reviews:[{review_namespace:'R',facts:[{fact:{fact_id:'F',domain:'study_identification',scope:'observed',evidence_origin:'own_report_results',text:'Individual patient data from RELATIVITY-047 were adopted.',evidence_ids:['E']}}]}]};
  const registry={'CE-R-E':{supporting_quote:'Individual patient data from RELATIVITY-047 were used. DREAMseq is another trial in the discussion.'}};
  const v=Trials.get(a,{registry});assert.deepEqual(v.source_trial_names,['RELATIVITY-047']);assert.equal(v.own_trial_names.length,0);
});
test('conflicting reviewed registrations are visible and no comparison-specific trial attribution is invented',()=>{
  const a=structuredClone(cases.get('31880964').a);a.details.citation.trial_identifiers=['NCT11111111'];
  const v=Trials.get(a);assert.equal(v.status,'conflicting');assert.match(v.nct_label,/^Conflicting:/);assert.equal(v.nct_ids.length,2);
  const x=cases.get('41971757'),maic=Trials.get(x.a,{registry:x.registry,comparison:{comparison_id:'arbitrary'}});
  assert.equal(maic.source_trial_names.length,6);assert.ok(maic.issues.some(x=>x.includes('no per-comparison')));
});
test('exact source arrays and clinical objects are never modified, including nonarray legacy review shape',()=>{
  for(const b of bundles){const before=JSON.stringify(b);for(const a of b.articles||b.studies)Trials.get(a,{registry:b.evidence_registry});assert.equal(JSON.stringify(b),before);}
  assert.equal(Trials.get({details:{new_reviews:{Sol:{}}}}).trial_label,'NA');
});
test('browser UMD and empty metadata work without dependency or disease inference',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(path.join(root,'website/dist/trial_identifiers.js'),'utf8'),context);
  assert.equal(context.TrialIdentifiers.get({title:'Melanoma clinical study'}).trial_label,'NA');assert.equal(context.TrialIdentifiers.get(null).nct_label,'NA');
});
