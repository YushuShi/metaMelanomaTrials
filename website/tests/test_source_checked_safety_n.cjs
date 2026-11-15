'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const compact=require('../dist/quantitative_extraction.js');
const fixturePath=path.join(__dirname,'../../data/audits/combined_identical_rows_20261108/checkmate915_safety_fixture.json');
const original=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const fresh=()=>structuredClone(original);
const result=(fixture,id='b1')=>fixture.study.details.quantitative_results.find(row=>row.review_stage==='R3'&&row.quantitative_record.id===id);
const shown=(fixture,id='b1')=>compact.presentationSampleSize(fixture.study,result(fixture,id),{registry:fixture.registry});
test('CheckMate 915 safety display uses the documented treated arm counts without changing source facts',()=>{
  const fixture=fresh(),before=JSON.stringify(fixture);
  for(const [id,n,count]of [['b1',916,'n7'],['b2',917,'n8'],['b3',916,'n7'],['b4',917,'n8']]){
    const value=shown(fixture,id);assert.equal(value.n,n);assert.equal(value.count_purpose,'safety');assert.equal(value.source_count_purpose,'treated');
    assert.deepEqual(value.count_ids,[count]);assert.equal(value.basis,'source_checked_safety_population');assert.equal(value.label,'Safety');assert.equal(value.evidence_ids.length,2);
  }
  assert.equal(result(fixture,'b1').quantitative_record.display_n.n,920);
  assert.equal(result(fixture,'b2').quantitative_record.display_n.n,924);
  assert.equal(JSON.stringify(fixture),before);
});
test('correction never replaces explicit analysis N, explicit denominator or a conflicting value',()=>{
  for(const mutate of [
    row=>{row.quantitative_record.analysis_n=920;},row=>{row.quantitative_record.denominator=916;},
    row=>{row.denominator.value=916;row.denominator.status='reported';},row=>{row.analysis_n.value=915;},
    row=>{row.quantitative_record.display_n.status='reported';},row=>{row.quantitative_record.display_n.status='CONFLICTING';},
    row=>{row.denominator.status='CONFLICTING';},row=>{row.quantitative_record.field_flags.push({code:'CONFLICTING:denominator'});}
  ]){const fixture=fresh();mutate(result(fixture));assert.equal(shown(fixture),null);}
});
test('source, review, arm and population identity must exactly match the reviewed safety case',()=>{
  for(const mutate of [
    row=>{row.source_input_sha256='a'.repeat(64);},row=>{row.review_binding_sha256='b'.repeat(64);},
    row=>{row.review_stage='R2';},row=>{row.pmid='123';},row=>{row.arm.entity_id='a2';},
    row=>{row.quantitative_record.arm_id='a2';},row=>{row.population.entity_id='subgroup';},
    row=>{row.quantitative_record.population_id='subgroup';},row=>{row.quantitative_record.endpoint='ORR';}
  ]){const fixture=fresh(),row=result(fixture);mutate(row);assert.equal(compact.presentationSampleSize(fixture.study,row,{registry:fixture.registry}),null);}
});
test('correction requires both source passages and unambiguous accepted count records',()=>{
  for(const mutate of [
    fixture=>{const key=Object.keys(fixture.registry).find(k=>k.endsWith('span-689530c2455ec775178ab9c2'));delete fixture.registry[key];},
    fixture=>{const key=Object.keys(fixture.registry).find(k=>k.endsWith('span-689530c2455ec775178ab9c2'));fixture.registry[key].supporting_quote='Safety population not defined.';},
    fixture=>{const key=Object.keys(fixture.registry).find(k=>k.endsWith('span-f62cd846570bcf0e2bc0f14d'));fixture.registry[key].source_id='another-source';},
    fixture=>{fixture.study.details.sample_size_records=fixture.study.details.sample_size_records.filter(s=>s.quantitative_record.id!=='n7');},
    fixture=>{fixture.study.details.sample_size_records.find(s=>s.quantitative_record.id==='n7').n.status='CONFLICTING';},
    fixture=>{fixture.study.details.sample_size_records.find(s=>s.quantitative_record.id==='n7').review_binding_sha256='c'.repeat(64);},
    fixture=>{fixture.study.details.sample_size_records.find(s=>s.quantitative_record.id==='n7').main_result_eligible=false;},
    fixture=>{fixture.study.details.sample_size_records.push(structuredClone(fixture.study.details.sample_size_records.find(s=>s.quantitative_record.id==='n7')));},
    fixture=>{fixture.study.details.quantitative_extraction.find(r=>r.stage==='R3').record.sample_sizes.find(s=>s.id==='n7').n=915;}
  ]){const fixture=fresh();mutate(fixture);assert.equal(shown(fixture),null);}
});
test('DMFS whole-trial fallback is withheld for the explicitly stage III analysis, without deriving a substitute',()=>{
  const fixture=fresh(),before=JSON.stringify(fixture),held=shown(fixture,'e5');
  assert.equal(held.n,null);assert.equal(held.status,'unverified');assert.equal(held.basis,'source_population_mismatch');assert.equal(held.original_fallback_n,1844);
  assert.deepEqual(held.count_ids,['n5']);assert.equal(held.evidence_ids.length,1);assert.equal(JSON.stringify(fixture),before);
  assert.equal(shown(fixture,'b5'),null);
  const row=result(fixture);fixture.study.pmid='35998300';assert.equal(compact.presentationSampleSize(fixture.study,row,{registry:fixture.registry}),null);
});
test('DMFS hold requires exact source proof and never replaces explicit N, conflicts or another scope',()=>{
  for(const mutate of [
    fixture=>{const key=Object.keys(fixture.registry).find(k=>k.endsWith('span-70c53d5567253dd3970b58ff'));delete fixture.registry[key];},
    fixture=>{const key=Object.keys(fixture.registry).find(k=>k.endsWith('span-70c53d5567253dd3970b58ff'));fixture.registry[key].supporting_quote='DMFS population not specified.';},
    fixture=>{result(fixture,'e5').quantitative_record.analysis_n=1595;},
    fixture=>{result(fixture,'e5').quantitative_record.analysis_n=1844;},
    fixture=>{result(fixture,'e5').denominator.value=1595;},
    fixture=>{result(fixture,'e5').quantitative_record.field_flags.push({code:'CONFLICTING:analysis_n'});},
    fixture=>{result(fixture,'e5').quantitative_record.population_id='p4';},
    fixture=>{result(fixture,'e5').source_input_sha256='d'.repeat(64);},
    fixture=>{result(fixture,'e5').quantitative_record.display_n.status='reported';},
    fixture=>{result(fixture,'e5').quantitative_record.display_n.n=1595;}
  ]){const fixture=fresh();mutate(fixture);assert.equal(shown(fixture,'e5'),null);}
});
test('the same DMFS scope hold covers both 24-month arm probabilities and drawer population labels',()=>{
  const fixture=fresh(),before=JSON.stringify(fixture);
  for(const [id,n,count]of [['s19',920,'n2'],['s20',924,'n3']]){
    const held=shown(fixture,id);assert.equal(held.n,null);assert.equal(held.status,'unverified');assert.equal(held.basis,'source_population_mismatch');assert.equal(held.original_fallback_n,n);assert.deepEqual(held.count_ids,[count]);
  }
  const html=compact.render(fixture.study,{registry:fixture.registry});
  const dmfsRows=[...html.matchAll(/<tr>.*?<\/tr>/g)].map(match=>match[0]).filter(row=>row.includes('<td>DMFS</td>')&&/75\.4|77\.4/.test(row));
  assert.equal(dmfsRows.length,2);assert(dmfsRows.every(row=>row.includes('<td>Baseline stage III</td>')&&row.includes('<td>NA · stage III only</td>')));
  assert.equal(JSON.stringify(fixture),before);
});
test('DMFS arm holds leave explicit Ns, conflicts, different arms and unavailable proof untouched',()=>{
  for(const id of ['s17','s18','s19','s20'])for(const mutate of [
    (fixture,row)=>{row.quantitative_record.analysis_n=797;},
    (fixture,row)=>{row.quantitative_record.denominator=797;},
    (fixture,row)=>{row.quantitative_record.display_n.status='CONFLICTING';},
    (fixture,row)=>{row.quantitative_record.arm_id='foreign';},
    (fixture,row)=>{row.quantitative_record.time=36;},
    (fixture,row)=>{row.review_binding_sha256='e'.repeat(64);},
    fixture=>{const key=Object.keys(fixture.registry).find(k=>k.endsWith('span-70c53d5567253dd3970b58ff'));delete fixture.registry[key];}
  ]){const fixture=fresh();mutate(fixture,result(fixture,id));assert.equal(shown(fixture,id),null);}
});
test('all ten R3 DMFS rows are audited: five whole-trial fallbacks held and five missing subgroup Ns unchanged',()=>{
  const fixture=fresh(),before=JSON.stringify(fixture),rows=fixture.study.details.quantitative_results.filter(row=>row.review_stage==='R3'&&row.quantitative_record.endpoint==='DMFS');
  assert.deepEqual(rows.map(row=>row.quantitative_record.id).sort(),['e5','e6','s17','s18','s19','s20','s21','s22','s23','s24']);
  const expected={e5:1844,s17:920,s18:924,s19:920,s20:924};
  for(const row of rows){
    const id=row.quantitative_record.id,held=compact.presentationSampleSize(fixture.study,row,{registry:fixture.registry});
    if(id in expected){assert.equal(held.n,null);assert.equal(held.status,'unverified');assert.equal(held.original_fallback_n,expected[id]);assert.equal(held.population_label,'Baseline stage III');}
    else{assert.equal(held,null);assert.equal(row.quantitative_record.display_n.status,'missing');}
  }
  const html=compact.render(fixture.study,{registry:fixture.registry});
  assert.equal((html.match(/<td>Baseline stage III<\/td><td>NA · stage III only<\/td>/g)||[]).length,5);
  const medianRows=[...html.matchAll(/<tr>.*?<\/tr>/g)].map(match=>match[0]).filter(row=>row.includes('<td>DMFS</td>')&&row.includes('<td>Baseline stage III</td>')&&row.includes('<td>median</td>'));
  assert.equal(medianRows.length,2);assert(medianRows.every(row=>row.includes('<td>not reached</td>')&&row.includes('<td>NA · stage III only</td>')));
  assert.equal(JSON.stringify(fixture),before);
});
test('R2 RFS treated fallback is withheld while the R3 randomized N remains unchanged',()=>{
  const fixture=fresh(),before=JSON.stringify(fixture),row=fixture.study.details.quantitative_results.find(row=>row.review_stage==='R2'&&row.quantitative_record.id==='e1');
  const held=compact.presentationSampleSize(fixture.study,row,{registry:fixture.registry});
  assert.equal(held.n,null);assert.equal(held.status,'unverified');assert.equal(held.original_fallback_n,1833);assert.equal(held.population_label,'All randomized');assert.equal(held.unverified_label,'NA · randomized population');
  const r3=fixture.study.details.quantitative_extraction.find(saved=>saved.stage==='R3').record.effects.find(effect=>effect.id==='e1');assert.equal(r3.display_n.n,1844);
  const html=compact.render(fixture.study,{registry:fixture.registry});
  assert.match(html,/<td>RFS<\/td>.*?<td>All randomized<\/td><td>NA · randomized population<\/td>/);
  assert.match(html,/<td>RFS<\/td>.*?<td>1844<\/td>/);
  assert.equal(JSON.stringify(fixture),before);
});
test('R2 RFS hold requires its exact abstract evidence and leaves explicit N and conflicts intact',()=>{
  for(const mutate of [
    (fixture,row)=>{row.quantitative_record.analysis_n=1833;},
    (fixture,row)=>{row.quantitative_record.denominator=1844;},
    (fixture,row)=>{row.analysis_n.value=1844;},
    (fixture,row)=>{row.quantitative_record.display_n.status='CONFLICTING';},
    (fixture,row)=>{row.extraction_conflict=true;},
    (fixture,row)=>{row.quantitative_record.field_flags.push({code:'CONFLICTING:analysis_n'});},
    (fixture,row)=>{row.source_input_sha256='f'.repeat(64);},
    (fixture,row)=>{row.review_binding_sha256='f'.repeat(64);},
    (fixture,row)=>{row.quantitative_record.population_id='p2';},
    fixture=>{const key=Object.keys(fixture.registry).find(k=>k.startsWith('CE-44064cc7')&&k.endsWith('span-481ad282be080ce416338f4c'));delete fixture.registry[key];}
  ]){const fixture=fresh(),row=fixture.study.details.quantitative_results.find(row=>row.review_stage==='R2'&&row.quantitative_record.id==='e1');mutate(fixture,row);assert.equal(compact.presentationSampleSize(fixture.study,row,{registry:fixture.registry}),null);}
});
test('all R2 RFS results are covered: total and two arm fallbacks held; missing subgroup and safety preserved',()=>{
  const fixture=fresh(),before=JSON.stringify(fixture),rows=fixture.study.details.quantitative_results;
  const rfs=rows.filter(row=>row.review_stage==='R2'&&row.quantitative_record.endpoint==='RFS');
  assert.deepEqual(rfs.map(row=>row.quantitative_record.id).sort(),['e1','e2','s1','s2']);
  for(const [id,n,count]of [['e1',1833,'n1'],['s1',916,'n2'],['s2',917,'n3']]){
    const row=rfs.find(row=>row.quantitative_record.id===id),held=compact.presentationSampleSize(fixture.study,row,{registry:fixture.registry});
    assert.equal(held.n,null);assert.equal(held.status,'unverified');assert.equal(held.original_fallback_n,n);assert.deepEqual(held.count_ids,[count]);assert.equal(held.population_label,'All randomized');
  }
  const unchanged=rows.filter(row=>row.review_stage==='R3'&&row.quantitative_record.endpoint==='RFS'||row.review_stage==='R2'&&(row.quantitative_record.id==='e2'||row.quantitative_record.endpoint.startsWith('AE_')||row.quantitative_record.endpoint==='treatment_related_death'));
  assert(unchanged.length>5);assert(unchanged.every(row=>compact.presentationSampleSize(fixture.study,row,{registry:fixture.registry})===null));
  const html=compact.render(fixture.study,{registry:fixture.registry});
  assert.equal((html.match(/<td>All randomized<\/td><td>NA · randomized population<\/td>/g)||[]).length,3);
  assert.equal(JSON.stringify(fixture),before);
});
test('R2 arm RFS holds preserve explicit Ns, conflicts and different study scopes',()=>{
  for(const id of ['s1','s2'])for(const mutate of [
    (fixture,row)=>{row.quantitative_record.analysis_n=row.quantitative_record.display_n.n;},
    (fixture,row)=>{row.quantitative_record.denominator=920;},
    (fixture,row)=>{row.quantitative_record.display_n.status='CONFLICTING';},
    (fixture,row)=>{row.extraction_conflict=true;},
    (fixture,row)=>{row.quantitative_record.arm_id='foreign';},
    (fixture,row)=>{row.quantitative_record.population_id='p2';},
    (fixture,row)=>{row.quantitative_record.time=36;},
    (fixture,row)=>{row.review_binding_sha256='e'.repeat(64);},
    fixture=>{const key=Object.keys(fixture.registry).find(k=>k.startsWith('CE-44064cc7')&&k.endsWith('span-481ad282be080ce416338f4c'));delete fixture.registry[key];}
  ]){const fixture=fresh(),row=fixture.study.details.quantitative_results.find(row=>row.review_stage==='R2'&&row.quantitative_record.id===id);mutate(fixture,row);assert.equal(compact.presentationSampleSize(fixture.study,row,{registry:fixture.registry}),null);}
});
