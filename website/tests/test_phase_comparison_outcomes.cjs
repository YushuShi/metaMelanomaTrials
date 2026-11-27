'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {extractOutcomes}=require('../scripts/phase_comparison_outcomes.cjs');
const arms=[{id:'a',label:'Drug A'},{id:'b',label:'Drug B'},{id:'c',label:'Drug C'}];
const populations=[{id:'all',scope:'overall',melanoma_only:'yes'}, {id:'non-mel',scope:'subgroup',melanoma_only:'no',label:'NSCLC'}];
const common={id:'s',origin:'own_report',population_id:'all',arm_id:'a',evidence:['ref']};
const ctx={armId:'a',pmid:'98765',armKeys:new Map(arms.map(a=>[a.id,{id:'agent:'+a.id,label:a.label}]))};
const median={...common,endpoint:'OS',kind:'median',estimate:13.2,unit:'months',analysis_n:55};
const survival={...common,endpoint:'OS',kind:'survival_probability',estimate:41,unit:'percent',time:2,time_unit:'years'};
const orr={...common,endpoint:'ORR',percentage:20,ci_lower:11,ci_upper:38,ci_level:90,denominator:40};
function rows(values,options={}) {
  return extractOutcomes({arms,populations,stage:'R3',...values},{...ctx,...options});
}
test('outcome rows distinguish matched measures, horizons and response confirmation',()=>{
  const [m,t,unknown,confirmed]=rows({survival:[median,survival],binary:[orr,{...orr,id:'c',endpoint_definition:'Confirmed objective response'}]});
  assert.deepEqual([m.key,t.key,unknown.key,confirmed.key],['OS|median','OS|survival_probability|24mo','ORR|percentage','ORR|percentage|confirmed']);
  assert.equal(t.label,'2-year OS');assert.equal(confirmed.label,'Confirmed ORR');assert.equal(unknown.denominator,40);
  assert.match(unknown.value,/90% CI 11–38/);assert.equal(m.denominator,55);
  assert.equal(rows({survival:[{...survival,time:24,time_unit:'months'}]})[0].key,t.key);
});
test('hazard ratios retain exact comparator; inversion uses reciprocal confidence bounds',()=>{
  const effect={...common,endpoint:'PFS',measure:'HR',reference_arm_id:'b',intervention_arm_id:'a',estimate:0.5,ci_lower:0.25,ci_upper:0.8,ci_level:95};
  const forward=rows({effects:[effect,{...effect,id:'second',reference_arm_id:'c'}]});
  assert.deepEqual(forward.map(a=>a.key),['PFS|HR|vs:agent:b','PFS|HR|vs:agent:c']);
  const reverse=rows({effects:[effect]},{armId:'b'})[0];
  assert.equal(reverse.key,'PFS|HR|vs:agent:a');
  assert.match(reverse.value,/^2 \(95% CI 1.25–4\) \(inverted\)$/);
  assert.deepEqual(rows({effects:[{...effect,reference_arm_id:'unknown'}]}),[]);
});
test('missing values cannot imply pending; an explicit unreached median differs from a non-estimable one',()=>{
  const absent={...median,estimate:'NA'};
  assert.deepEqual(rows({survival:[absent]}),[]);
  assert.equal(rows({survival:[{...absent,median_status:'not_reached'}]})[0].value,'Median OS not reached');
  assert.equal(rows({survival:[{...absent,median_status:'not_estimable'}]})[0].value,'Median OS not estimable');
  assert.deepEqual(rows({survival:[{...absent,median_status:'not_reached',origin:'planned'}]}),[]);
  assert.deepEqual(rows({survival:[{...median,origin:'cited_report'}]}),[]);
});
test('one selected arm and population cannot borrow outcomes or enrolment N from another arm or disease',()=>{
  const q={...orr,denominator:'NA',display_n:{n:100,count_purpose:'randomized'}};
  const bad={...q,id:'b',arm_id:'b'};
  const sample={result_id:q.id,arm_id:'a',population_id:'all',count_purpose:'outcome_analysis',evidence:['ref'],n:32};
  let got=rows({binary:[q,bad,{...q,arm_id:'NA'},{...q,population_id:'non-mel'}],sample_sizes:[{...sample,arm_id:'b'},{...sample,result_id:'unrelated'}]});
  assert.equal(got.length,1);assert.equal(got[0].denominator,undefined);
  got=rows({binary:[q],sample_sizes:[sample]});assert.equal(got[0].denominator,32);
  got=rows({survival:[{...median,id:'ii',population_id:'p2'},{...median,id:'both',estimate:18}],populations:[...populations,{id:'p2',label:'Phase II cohort',scope:'subgroup',melanoma_only:'yes'}]},{populationIds:new Set(['p2'])});
  assert.equal(got.length,1);assert.equal(got[0].sourceResultId,'ii');assert.equal(got[0].key,'OS|median');
});
test('keep source qualifications, flags and arithmetic identifiable',()=>{
  const raw=rows({binary:[
    {...orr,percentage:'NA',numerator:8}, {...orr,endpoint:'AE_any',endpoint_definition:'Hypotension'},
    {...orr,endpoint:'AE_any',endpoint_definition:'Thyroid dysfunction'},
    {...orr,field_flags:[{field:'denominator'},{field:'ci_lower'}],response_criteria:'iRECIST'},
    {...orr,response_criteria:'RECIST version 1.1 by blinded independent central review'}
  ]});
  assert.equal(raw.length,5);assert.match(raw[0].value,/8\/40/);
  assert.notEqual(raw[1].key,raw[2].key);assert.equal(raw[3].denominator,undefined);assert.match(raw[3].value,/90% CI unavailable–38/);
  assert.match(raw[4].label,/central review/);assert.match(raw[4].label,/RECIST 1.1/);
});
test('use primary reporting chronology externally and the most recent verified cutoff within a report',()=>{
  const rowsOut=rows({survival:[{...median,estimate:8,cutoff:'2021-04-02'},{...median,estimate:13,cutoff:'2023-04-01'}]});
  assert.equal(rowsOut.length,1);assert.equal(rowsOut[0].value,'13 months');
});

test('counts without denominators remain counts and original time units remain identifiable',()=>{
  const row={...orr,percentage:'NA',numerator:4,denominator:'NA'};
  const out=rows({binary:[row],survival:[{...median,estimate:1,unit:'years',ci_lower:0.5,ci_upper:'NA',ci_level:95}, {...survival,time:'NA'}]});
  assert.equal(out[0].value,'12 months (95% CI 6–unavailable)');
  assert.equal(out[1].key,'OS|survival_probability|time-unspecified:98765');
  assert.equal(out[2].key,'ORR|patient_count');assert.equal(out[2].value,'4 patients');
  const {label}=rows({survival:[{...survival,time:1.840, time_unit:'months'}],derivations:[{method:'time_to_months',section:'survival',id:survival.id,field:'time',value:1.840,original:8,original_unit:'weeks'}]})[0];
  assert.equal(label,'8-week OS');
});

test('semantically reviewed compartments retain distinct keys and do not align with an unspecified PFS',()=>{
  const record={...median,id:'intracranial',endpoint:'PFS'};
  const s=rows({source_sha256:'sha',survival:[record,{...record,id:'extracranial'}]},
    {semantics:new Map([['sha|intracranial',{key:'pfs_intracranial',label:'Intracranial PFS'}],['sha|extracranial',{key:'pfs_extracranial',label:'Extracranial PFS'}]])});
  assert.deepEqual(s.map(r=>r.key),['PFS|median|intracranial','PFS|median|extracranial']);
});
test('separate doses or schedules of one regimen retain their arm-specific outcomes and randomized contrasts',()=>{
  const doseArms=[{id:'a',label:'Drug 3 mg',nodes:[{kind:'drug',name:'Drug',dose:'3 mg'}]},
    {id:'b',label:'Drug 10 mg',nodes:[{kind:'drug',name:'Drug',dose:'10 mg'}]}];
  const sameDrug=new Map(doseArms.map(a=>[a.id,{id:'agent:drug',label:'Drug'}]));
  const rec={arms:doseArms,survival:[median,{...median,arm_id:'b',estimate:8}],
    effects:[{...common,endpoint:'PFS',measure:'HR',reference_arm_id:'b',intervention_arm_id:'a',estimate:0.72}]};
  const a=rows(rec,{armKeys:sameDrug}),b=rows(rec,{armId:'b',armKeys:sameDrug});
  assert.notEqual(a[0].key,b[0].key);
  assert.match(a[0].label,/drug 3 mg/);assert.match(a[1].label,/HR vs Drug \(drug 10 mg\)/);
  assert.equal(a[0].value,'13.2 months');assert.equal(b[0].value,'8 months');
});
test('overall ORR and ORR in injected or non-injected tumors remain distinct even when the percentages match',()=>{
  const list=rows({binary:[orr,{...orr,id:'injected',endpoint_definition:'Objective response rate in injected tumors',percentage:67},
      {...orr,id:'noninjected',endpoint_definition:'Objective response rate in non-injected tumors'}]});
  assert.deepEqual(list.map(r=>r.key),['ORR|percentage','ORR|percentage|injected','ORR|percentage|non-injected']);
});
test('the published INTERIM full-text grade and safety denominator are bound to the exact source arm',()=>{
  const source_sha256=Object.keys(require('../config/phase_comparison_outcome_reviews.json'))[0];
  const row={...orr,id:'B_SEVERE_AE_INT',arm_id:'A_INT',population_id:'P1',endpoint:'AE_grade_ge3',endpoint_definition:'Grade >3 adverse events',percentage:53,denominator:'NA',ci_lower:'NA',ci_upper:'NA'};
  const r={pmid:'38029480',source_sha256,populations:[{id:'P1',scope:'overall',melanoma_only:'yes'}],arms:[{id:'A_INT'}],binary:[row]};
  const [bound]=rows(r,{armId:'A_INT',pmid:r.pmid});
  assert.equal(bound.label,'Grade ≥3 adverse events');assert.equal(bound.denominator,38);assert.match(bound.sourceUrl,/white.?rose/);
  const [other]=rows({...r,source_sha256:'different'},{armId:'A_INT',pmid:r.pmid});assert.equal(other.label,'Grade >3 adverse events');assert.equal(other.denominator,undefined);
});
