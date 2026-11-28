'use strict';

const assert = require('node:assert/strict');
const {measure,wilson} = require('../scripts/trial_outcome_measures.cjs');

const record = {pmid:'test',source_sha256:'report-hash',stage:'R3',arms:[{id:'a'}],derivations:[]};
const source = {id:'outcome',origin:'own_report',evidence:['s1'],arm_id:'a',population_id:'p'};
const context = quote => ({result:{evidence_ids:['s1']},registry:{s1:{supporting_quote:quote}}});
const binary = (extra = {}, rec = record, quote = '') => measure('binary',{...source,endpoint:'ORR',...extra},rec,context(quote));
const survival = (extra = {}, quote = '') => measure('survival',{...source,kind:'median',endpoint:'OS',unit:'months',...extra},record,context(quote));

const precise = binary({numerator:2,denominator:10,percentage:20,ci_level:95,ci_lower:3.7,ci_upper:45.5});
assert.deepEqual(precise.ci,{low:3.7,high:45.5,method:'reported'});
const calculated = binary({numerator:2,denominator:10,ci_level:90,ci_lower:0,ci_upper:48});
assert.equal(calculated.value,20);
assert.equal(calculated.ci.method,'wilson');
assert(Math.abs(calculated.ci.low - 5.668215) < 1e-5 && Math.abs(calculated.ci.high - 50.983753) < 1e-5);
assert.equal(wilson(0,10).low,0);
assert.equal(wilson(10,10).high,100);
assert.equal(wilson(12,10),null);
assert.equal(binary({numerator:0,denominator:10}).value,0);
assert.equal(binary({percentage:20,denominator:50}).ci,null);
assert.equal(binary({percentage:90,numerator:20,denominator:100}).ci,null);
const derived = {section:'binary',id:'outcome',field:'numerator',method:'unique_integer_from_rounded_percent'};
assert.equal(binary({percentage:20,numerator:2,denominator:10},{...record,derivations:[derived]}).ci,null);
assert.equal(binary({percentage:20,ci_level:95,ci_lower:5,ci_upper:40},{...record,derivations:[{...derived,field:'ci_level',method:'user_default_unspecified_CI'}]}).ci,null);
const denominator = {...source,result_id:'outcome',count_purpose:'outcome_analysis',n:10};
assert.equal(binary({numerator:2},{...record,sample_sizes:[denominator]}).value,20);
assert.equal(binary({numerator:2},{...record,sample_sizes:[{...denominator,result_id:'different'}]}),null);
assert.equal(binary({numerator:2,display_n:{n:10,status:'fallback'}}),null);
assert.equal(binary({percentage:25,origin:'external_report'}),null);
assert.equal(binary({endpoint:'DCR',percentage:25}),null);
for (const def of ['Partial response + minor response','Durable objective response rate','Intracranial objective response','Response to nonirradiated target lesions','Pathologic response']) {
  assert.equal(binary({percentage:25,endpoint_definition:def}),null,def);
}
assert.equal(binary({percentage:25,endpoint:'CR',endpoint_definition:'Complete response',response_criteria:'RECIST 1.1'}).endpoint,'CR');
assert.equal(binary({percentage:25,endpoint:'CR',endpoint_definition:'Pathological complete response',response_criteria:'RECIST 1.1'}),null);
assert.equal(binary({percentage:25,endpoint:'CR',endpoint_definition:'Complete clinical response'}),null);

for (const endpoint of ['DOR','RFS','DMFS','PFS','OS']) {
  assert.equal(survival({endpoint,estimate:1,unit:'years'}).value,12);
  assert.equal(survival({endpoint,estimate:0}).value,0);
  const nr = survival({endpoint,median_status:'not_reached',ci_level:95,ci_lower:18.4},'Median not reached (95% CI, 18.4 months to not reached).');
  assert.deepEqual(nr,{endpoint,value:null,notReached:true,ci:{low:18.4,high:null,highNotReached:true,method:'reported'}});
  assert.equal(survival({endpoint,median_status:'not_estimable'}),null);
  assert.equal(survival({endpoint,median_status:'NR'},'NR = not reported.'),null);
  assert.equal(survival({endpoint,median_status:'NR'},'Median NR.'),null);
  assert(survival({endpoint,median_status:'NR'},'NR = not reached.').notReached);
  assert.equal(survival({endpoint,kind:'survival_probability',estimate:20}),null);
}
const partial = {estimate:16.58,ci_level:95,ci_lower:5.16};
const quote42925158 = 'Median progression-free survival was 4.52 months (95% CI, 2.07 to 14.31), and median overall survival was 16.58 months (95% CI, 5.16 to not estimable).';
assert.deepEqual(survival(partial,quote42925158).ci,{low:5.16,high:null,highNotEstimable:true,method:'reported'});
assert.equal(survival({...partial,endpoint:'PFS'},quote42925158).ci.highNotEstimable,undefined);
assert.equal(survival({...partial,estimate:10},quote42925158).ci.highNotEstimable,undefined);
assert.equal(survival(partial,quote42925158.replace('not estimable','not reported')).ci.highNotEstimable,undefined);
assert.equal(survival({...partial,ci_lower:null,ci_upper:22.7},'Median OS was 16.58 months (95% CI: not estimable to 22.7 months).').ci.lowNotEstimable,true);
assert.equal(survival({...partial,ci_upper:'not_estimable'}).ci.highNotEstimable,true);
assert.equal(survival({estimate:2,unit:'weeks',ci_lower:1,ci_upper:5,ci_level:95}).ci.low,7/(365.25/12));
assert.equal(survival({estimate:2,numerator:2,denominator:10}).ci,null);
assert.equal(survival({estimate:2,unit:'minutes'}),null);
assert.equal(survival({endpoint:'DOR',estimate:9,endpoint_definition:'Time from first response to progression among responding patients.'}).value,9);
assert.equal(survival({endpoint:'DOR',estimate:9,endpoint_definition:'Response duration measured from date of random assignment'}),null);
assert.equal(survival({endpoint:'PFS',estimate:9,endpoint_definition:'Time to progression'}),null);
assert.equal(survival({endpoint:'PFS',estimate:9,endpoint_definition:'Time to progression or death'}).value,9);

const ae = {endpoint:'AE_grade_ge3',percentage:20,numerator:20,denominator:100,safety_attribution:'treatment_related',cutoff:'2026-01-22',endpoint_definition:'Patients with at least one grade ≥3 treatment-related adverse event'};
const all = {...ae,safety_attribution:'all_cause',percentage:35,numerator:35,endpoint_definition:'Patients with at least one all-cause grade ≥3 adverse event'};
const dark = binary(ae), light = binary(all);
assert.equal(dark.value,20);
assert.equal(light.value,35);
assert.equal(dark.attribution,'related');
assert.equal(light.attribution,'overall');
assert(dark.safetyContext && dark.safetyContext===light.safetyContext);
assert.equal(dark.ci.method,'wilson');
for (const change of [{arm_id:'b'},{population_id:'other'},{denominator:200},{cutoff:'2026-03-23'}, {endpoint_definition:all.endpoint_definition+' during cycle 1'}]) {
  assert.notEqual(dark.safetyContext,binary({...all,...change}).safetyContext);
}
const grades34 = {...ae,endpoint:'AE_grade_3_4',endpoint_definition:'Patients with at least one grade 3–4 treatment-related adverse event'};
assert.equal(binary(grades34),null);
assert.equal(binary({...grades34,endpoint_definition:grades34.endpoint_definition+'; no grade 5 AEs in the placebo arm'}),null);
assert.equal(binary({...grades34,endpoint_definition:grades34.endpoint_definition+'; no grade 5 AEs during induction'}),null);
const fatal = {...source,endpoint:'treatment_related_death',safety_attribution:'treatment_related',numerator:0,denominator:100,cutoff:ae.cutoff};
assert.equal(binary(grades34,{...record,binary:[fatal]}).value,20);
for (const change of [{arm_id:'b'},{population_id:'other'},{denominator:200},{cutoff:'2026-03-23'},{numerator:1}]) {
  assert.equal(binary(grades34,{...record,binary:[{...fatal,...change}]}),null);
}
assert.equal(binary({...grades34,endpoint_definition:'Grade 3–4 adverse events, all causes',safety_attribution:'all_cause'}, {...record,binary:[fatal]}),null);
for (const def of ['Grade ≥3 febrile neutropenia','Grade ≥3 immune-related adverse events','Grade ≥3 select skin treatment-related adverse events','Weight gain ≥15%; clinical toxicity graded ≥3.','Grade ≥3 treatment-related serious adverse events','Grade ≥3 adverse events: 20 events among 100 patients']) {
  assert.equal(binary({...ae,endpoint_definition:def}),null,def);
}
assert.equal(binary({...ae,endpoint_definition:'Grade 3 treatment-related adverse events'}),null);
assert.equal(binary({...ae,percentage:null,numerator:20,endpoint_definition:'Grade ≥3 treatment-related adverse events'}),null);
assert.equal(binary({...ae,percentage:null,numerator:20}).value,20);
const dual = {...record,arms:[{id:'a',nodes:[{kind:'drug',name:'nivolumab'},{kind:'drug',name:'ipilimumab'}]}]};
assert.equal(binary({...ae,endpoint_definition:'Grade ≥3 adverse events attributed to nivolumab'},dual),null);
assert.equal(binary({...ae,field_flags:[{field:'endpoint_definition'}]}),null);
console.log('Trial Outcomes numeric measures verified');
