'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {preferredRows, populationFor, course, build} = require('../scripts/trial_outcomes.cjs');
const snapshot = require('../dist/data/trial_outcomes.json');

test('publication labels preserve multiword PubMed family names and an uncredited byline',() => {
  for (const [pmid, author] of [['42855460','Di Giacomo'],['34112708','Di Giacomo'],['25754329','Twyman-Saint Victor'],['7428135','']]) {
    const rows = snapshot.rows.filter(r => r.pmid === pmid);
    assert.ok(rows.length && rows.every(r => r.author === author));
  }
});

test('source preference is endpoint-, cohort- and arm-specific',() => {
  const result = (id,arm,endpoint,date,cutoff,extra={}) => ({
    trialId:'trial', armId:arm, endpoint, date, cutoff, stage:'R3', source:{id},...extra
  });
  const candidates = [
    result('original-a','A','OS','2023-04','2022-03'),
    result('original-b','B','OS','2023-04','2022-03'),
    result('late-older-cutoff','A','OS','2026-03','2020-05'),
    result('updated-a','A','OS','2025-04','2024-05'),
    result('only-orr','A','ORR','2022-01',null),
    result('earlier-unknown','B','OS','2021-02',null),
    result('new-independently-enrolled','A-cohort-2','OS','2026-05',null)
  ];
  const rows = preferredRows(candidates);
  assert.equal(rows.find(r=>r.armId==='A' && r.endpoint==='OS').source.id,'updated-a');
  assert.equal(rows.find(r=>r.armId==='B').source.id,'original-b');
  assert.equal(rows.find(r=>r.endpoint==='ORR').source.id,'only-orr');
  assert.equal(rows.find(r=>r.armId==='A-cohort-2').source.id,'new-independently-enrolled');
});

test('clinical cohorts survive, nested populations retain parent-arm identity, and excluded patients are never displayed as recipients of an estimate',() => {
  const p1={id:'a',label:'Cohort A',scope:'overall',melanoma_only:'yes'};
  const p2={id:'b',label:'Cohort B',scope:'overall',melanoma_only:'yes'};
  const p3={id:'c',parent_id:'a',label:'PD-L1 positive',scope:'subgroup',melanoma_only:'yes'};
  const excluded={id:'d',label:'Patients excluded from post hoc analysis',scope:'subgroup',melanoma_only:'yes'};
  const record={populations:[p1,p2,p3,excluded]};
  const a=populationFor(p1,record), b=populationFor(p2,record), subset=populationFor(p3,record);
  assert.notEqual(a.parentKey,b.parentKey);
  assert.equal(a.parentKey,subset.parentKey);
  assert.equal(subset.subgroup,true);
  assert.equal(a.subgroup,false);
  assert.equal(populationFor(excluded,record),null);
});

test('a reported multi-class combination keeps all its class colors, while concurrent and sequential arms are distinct',() => {
  const arm={evidence:['own'],root_id:'r',nodes:[
    {id:'r',kind:'AND',children:['a','b']},
    {id:'a',kind:'drug',name:'nivolumab',children:[]},
    {id:'b',kind:'drug',name:'dacarbazine',children:[]}
  ]};
  const concurrent=course(arm,new Map()), seq=course({...arm,nodes:[{...arm.nodes[0],kind:'SEQUENTIAL'},...arm.nodes.slice(1)]},new Map());
  assert.deepEqual(new Set(concurrent.classes),new Set(['ici','chemotherapy']));
  assert.notEqual(concurrent.key,seq.key);
  assert.equal(seq.label,'Nivolumab → Dacarbazine');
});

test('an empty monthly release is supported and mismatched quantitative inputs are rejected',() => {
  const clinical={content_sha256:'a',articles:[],evidence_registry:{}};
  const graph={metadata:{clinical_content_sha256:'a',source_file_sha256:'b'},nodes:[]};
  assert.deepEqual(build({clinical_evidence:clinical,articles:[]},graph,{},null).rows,[]);
  assert.throws(()=>build({clinical_evidence:{...clinical,content_sha256:'other'},articles:[]},graph,{},null),/different releases/);
});

test('published CheckMate follow-ups use the correct report for each endpoint without duplicating a trial arm',() => {
  const overall=snapshot.rows.filter(r=>r.nct==='NCT01844505' && !r.subgroup);
  function current(endpoint) {
    const selected=new Map();
    for(const r of overall.filter(r=>r.endpoint===endpoint))if(!selected.has(r.armId))selected.set(r.armId,r);
    return [...selected.values()];
  }
  const os=current('OS'),orr=current('ORR');
  assert.equal(os.length,3);
  assert.deepEqual(os.map(r=>r.value).sort((a,b)=>a-b),[19.9,36.9,71.9]);
  assert.ok(os.every(r=>r.pmid==='39282897'));
  assert.equal(orr.length,3);
  assert.ok(orr.every(r=>r.pmid==='39282897'));
  assert.deepEqual(orr.map(r=>r.value).sort((a,b)=>a-b),[14.6,41.8,50]);
  assert.ok(os.every(r=>r.filter_binding.result_id===r.resultId && r.filter_binding.pmid===r.source.pmid));
});

test('saved examples include single-arm evidence, an unreached/observed median pair and compatible AE rates',() => {
  const source=snapshot.rows;
  const single=source.filter(r=>r.pmid==='1419615'&&r.endpoint==='ORR');
  assert.equal(new Set(single.map(r=>r.armId)).size,1);
  const medians=source.filter(r=>r.pmid==='27269740'&&!r.subgroup&&r.endpoint==='OS');
  assert.ok(medians.some(r=>r.notReached && r.ci?.low===23.7 && r.ci.highNotReached));
  assert.ok(medians.some(r=>r.value===16.9));
  const safety=source.filter(r=>r.pmid==='28342215'&&r.endpoint==='AE');
  const overall=safety.find(r=>r.attribution==='overall'),related=safety.find(r=>r.attribution==='related');
  assert.deepEqual([related.value,overall.value],[12.5,20.8]);
  assert.ok(overall.safetyContext && overall.safetyContext===related.safetyContext);
  assert.equal(related.ci.method,'wilson');
  assert.ok(!source.some(r=>r.pmid==='22356324'&&r.stage==='R3'&&r.source.id==='s8'));
  assert.ok(source.every(r=>r.source.sha && r.source.id && r.filter_binding?.review_binding_sha256 && ['survival','binary'].includes(r.source.section)));
});

test('a verifiable registration replaces the PMID fallback; a uniquely matching maintenance course identifies an analysis subgroup’s parent arm',() => {
  const rows = snapshot.rows;
  assert.equal(rows.find(r=>r.pmid==='42925158').trialName,'CTR20233999');
  const parents = new Set(rows.filter(r=>r.trialName==='SECOMBIT'&&!r.subgroup).map(r=>r.parentArmId));
  const followUp = rows.filter(r=>r.pmid==='42550831'&&r.subgroup&&r.regimen.includes(' → '));
  assert.equal(parents.size,3);
  assert.ok(followUp.length && followUp.every(row=>parents.has(row.parentArmId)));
});
