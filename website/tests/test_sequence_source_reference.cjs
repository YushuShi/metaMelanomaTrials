'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const groups=require('../dist/treatment_groups.js'),definitions=require('../dist/regimen_definitions.js'),rules=require('../dist/regimen_source_rules.js');
const fixture=require('./fixtures/checkmate064_source_direction.json');
const copy=()=>structuredClone(fixture);

test('CheckMate064 primary-source direction binds the exact unadjusted HR without changing native data',()=>{
 const {comparison,result}=copy(),before=JSON.stringify({comparison,result});
 const proof=rules.directionFor(comparison,result);assert(proof);assert.equal(proof.direction_verified,true);
 assert.equal(proof.comparator_label,'Ipilimumab → Nivolumab');assert.equal(proof.intervention_label,'Nivolumab → Ipilimumab');
 assert.equal(proof.is_add_on,false);assert.equal(result.estimate.value,.48);
 assert.equal(result.ci_lower.value,.29);assert.equal(result.ci_upper.value,.8);
 assert.equal(comparison.comparator_filter_eligible,false);assert.equal(comparison.kind,'unresolved_comparator');
 assert.deepEqual(result.original_fact.link_gaps,['cutoff','treatment_direction']);
 assert.equal(JSON.stringify({comparison,result}),before);assert(Object.isFrozen(proof));
});

test('reference proof rejects different values, roles, endpoints, models, populations and row identities',()=>{
 const changes=[
  x=>x.result.estimate.value=1/.48,
  x=>x.result.estimate.raw_text='0.57',
  x=>x.result.ci_lower.value=.33,
  x=>x.result.original_fact.numbers[3].value=90,
  x=>x.result.original_fact.numbers[0].role='other',
  x=>x.result.model.adjusted_status='adjusted',
  x=>x.result.model.model_id='other-model',
  x=>x.result.model.arm_ids.reverse(),
  x=>x.result.model.endpoint_id='pfs',
  x=>x.result.original_fact.clinical_endpoint_family='progression_free_survival',
  x=>x.result.population.entity_id='other-population',
  x=>x.result.result_id='other-result',
  x=>x.result.review_binding_sha256='other-review',
  x=>x.result.source_input_sha256='other-source',
  x=>x.result.report_id='other-report',
  x=>x.result.pmid='other-PMID',
  x=>x.result.review_stage='R3',
  x=>x.result.model_id='other-public-model',
  x=>x.result.population_id='other-public-population',
  x=>x.result.arm_id='other-arm',
  x=>x.result.arm={label:'other-arm'},
  x=>x.result.experimental_arm={label:'other-arm'},
  x=>x.result.comparator_arm={label:'other-arm'},
  x=>x.result.confidence_level.value=90,
  x=>x.result.reported_numbers[0].value=.57,
  x=>x.result.source_reported_numbers[0].raw_text='0.57',
  x=>x.result.original_fact.link_gaps=[],
 ];
 for(const mutate of changes){const value=copy();mutate(value);assert.equal(rules.directionFor(value.comparison,value.result),null);}
});

test('the finite direction rule cannot transfer to another report, source, stage, comparison or arm assignment',()=>{
 for(const mutate of [x=>x.scope.report_id='other-report',x=>x.scope.source_input_sha256='other-source',
  x=>x.scope.review_stage='R3',x=>x.scope.population_id='other-population',x=>x.scope.review_binding_sha256='other-review',
  x=>x.comparison_id='other-comparison',x=>x.result_ids.push('other-result'),x=>x.comparator_arm_id='invented-arm',
  x=>x.comparator_label='Nivolumab']){
  const {comparison,result}=copy();mutate(comparison);assert.equal(rules.lookup(comparison),null);assert.equal(rules.directionFor(comparison,result),null);
 }
});

test('old empty regimen definitions validate before the exact reviewed sequence presentation is materialized',()=>{
 const {comparison,result}=copy(),before=JSON.stringify(comparison);
 const c=definitions.resolve(comparison,'comparator'),i=definitions.resolve(comparison,'intervention');
 assert.equal(definitions.describe(c).label,'Ipilimumab → Nivolumab');assert.equal(definitions.describe(i).label,'Nivolumab → Ipilimumab');
 for(const value of [c,i]){assert.equal(value.root.type,'sequential');assert.equal(groups.describeDefinition(value).simple_concurrent,false);assert(value.presentation_source_review.direction_verified);}
 assert.equal(c.source_binding.role,'comparator');assert.equal(i.source_binding.role,'intervention');assert.equal(JSON.stringify(comparison),before);
 const prepared=definitions.prepareComparison(comparison);assert(rules.directionFor(prepared,result));
 assert.equal(definitions.describe(definitions.resolve(prepared,'comparator')).label,'Ipilimumab → Nivolumab');
 assert.equal(prepared.comparator_filter_eligible,false);assert.equal(prepared.kind,'unresolved_comparator');
});

test('finite rematerialization does not hide forged predecessors, foreign native graphs or changed scopes',()=>{
 for(const mutate of [x=>x.comparator_regimen.root.name='invented',x=>x.comparator_regimen.source_binding.role='intervention',
  x=>x.comparator_regimen.role='prior_history',x=>x.comparator_label='Pembrolizumab']){
  const {comparison}=copy();mutate(comparison);assert.throws(()=>definitions.resolve(comparison,'comparator'));
 }
 const {comparison}=copy();comparison.comparator_native_regimen={arm_id:'foreign',label:'',root_node_id:'n',evidence_ids:[],nodes:[{node_id:'n',kind:'UNKNOWN',name:null,drug_class:null,children:[],dose:null,route:null,schedule:null,evidence_ids:[]}]};
 assert.throws(()=>definitions.resolve(comparison,'comparator'),/native arm graph/);
});

test('existing source-owned R3 sequence labels already use arrows without changing their validation state',()=>{
 for(const comparison of copy().existing_R3_pairs){
  const before=JSON.stringify(comparison);assert.equal(rules.lookup(comparison),null);
  assert.equal(definitions.describe(definitions.resolve(comparison,'comparator')).label,'Ipilimumab → Nivolumab');
  assert.equal(definitions.describe(definitions.resolve(comparison,'intervention')).label,'Nivolumab → Ipilimumab');
  assert.equal(comparison.comparison_filter_eligible,false);assert.equal(JSON.stringify(comparison),before);
 }
});
