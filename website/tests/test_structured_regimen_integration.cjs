'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),groups=require('../dist/treatment_groups.js'),definitions=require('../dist/regimen_definitions.js');
function study(id,control,intervention){
  const comparison_id='C'+id,result_id='R'+id;
  return {report_id:'report-'+String(id).padStart(24,'0'),title:'Cohort '+id,default_visible:true,current_main_eligible:true,
    comparisons:[{comparison_id,kind:'treatment_comparison',comparator_label:control,intervention_label:intervention,
      comparison_filter_eligible:true,comparator_filter_eligible:true,result_ids:[result_id],
      scope:{record_kind:'canonical_review_scope',report_id:'report-'+String(id).padStart(24,'0'),population_id:'cohort'+id,source_input_sha256:'source'+id,review_binding_sha256:'binding'+id}}],
    details:{quantitative_results:[{result_id,comparison_id,endpoint:{family:'overall_survival'},measure:'HR',estimate:{value:.5+id/10,status:'reported'},main_result_eligible:true,pooling_eligible:false}]}};
}
test('comparator drug finds doses, combinations, alternatives and sequences across distinct cohorts without mixing results',()=>{
  const input=[study(1,'Nivolumab 3 mg/kg IV every 2 weeks','Ipilimumab'),study(2,'Nivolumab 1 mg/kg + ipilimumab 3 mg/kg','Pembrolizumab'),
    study(3,'Anti-PD-1 monotherapy with nivolumab or pembrolizumab','Combination ipilimumab and nivolumab'),study(4,'Nivolumab followed by ipilimumab','Dacarbazine'),study(5,'Pembrolizumab','Nivolumab')];
  const before=JSON.stringify(input),prepared=definitions.prepareStudies(input);
  const matched=charts.filterStudies(prepared,{comparator:groups.classValue('agent:nivolumab'),endpoint:'overall_survival',measure:'HR'});
  assert.deepEqual(matched.map(m=>m.study.title),['Cohort 1','Cohort 2','Cohort 3','Cohort 4']);
  for(const match of matched){assert.equal(match.results.length,1);assert.equal(match.results[0].comparison_id,match.comparisons[0].comparison_id);assert.equal(match.results[0].pooling_eligible,false);}
  assert.equal(JSON.stringify(input),before);assert.equal(prepared[0].comparisons[0].comparator_regimen.root.dose,'3 mg/kg');
  assert.equal(charts.interventionPresentation(prepared[2].comparisons[0]).is_add_on,false);
  assert.equal(charts.comparatorPresentation(prepared[3].comparisons[0]).label,'Nivolumab → Ipilimumab');
});
test('only the added drug is an intervention when the complete concurrent backbone is shared',()=>{
  const s=definitions.prepareStudies([study(1,'Nivolumab 3 mg/kg','Nivolumab 3 mg/kg + ipilimumab 1 mg/kg')])[0];
  const p=charts.interventionPresentation(s.comparisons[0]);
  assert.equal(p.is_add_on,true);assert.equal(p.label,'Ipilimumab');assert.equal(p.definition.root.dose,'1 mg/kg');
  assert.equal(charts.filterStudies([s],{intervention:groups.classValue('agent:nivolumab')}).length,0);
  assert.equal(charts.filterStudies([s],{intervention:groups.classValue('agent:ipilimumab')}).length,1);
  const tree=groups.optionTree(charts.constrainStudyChoices([s],{}).comparator_options);
  assert(tree.some(row=>row.value===groups.classValue('agent:nivolumab')));
});
test('stored regimen bindings cannot move to another cohort, comparison, side or raw source label',()=>{
  const c=definitions.prepareStudies([study(1,'Nivolumab','Ipilimumab')])[0].comparisons[0];
  for(const mutate of [x=>x.scope.population_id='other',x=>x.comparison_id='other',x=>x.comparator_regimen=x.intervention_regimen,x=>x.comparator_label='Pembrolizumab']){
    const bad=structuredClone(c);mutate(bad);assert.throws(()=>definitions.resolve(bad,'comparator'),/differs/);
  }
});
test('per-arm descriptive values display their actual arm and never become comparative ratios',()=>{
  const row={contrast_type:'treatment_comparison',display_measure:'median',arm:{label:'Anti-PD-1 monotherapy with nivolumab or pembrolizumab'},estimate:{value:169}};
  assert.equal(charts.compactContrast(row),'Nivolumab or Pembrolizumab');
  assert.equal(charts.compactContrast({...row,display_measure:'HR'}),'');
});
test('dose-free drug search does not establish an add-on when the backbone dose changes',()=>{
  const s=definitions.prepareStudies([study(1,'Nivolumab 3 mg/kg','Nivolumab 1 mg/kg + ipilimumab 3 mg/kg')])[0];
  const p=charts.interventionPresentation(s.comparisons[0]);
  assert.equal(charts.filterStudies([s],{comparator:groups.classValue('agent:nivolumab')}).length,1);
  assert.equal(p.is_add_on,false);assert.equal(p.label,'Nivolumab + Ipilimumab');
  assert.equal(s.comparisons[0].comparator_regimen.root.dose,'3 mg/kg');
});

test('resolved definitions are isolated deeply frozen snapshots and reject changed stored bindings after warming',()=>{
  const c=study(10,'Nivolumab','Ipilimumab').comparisons[0];
  c.comparator_regimen=groups.definitionFromLabel(c.comparator_label,{source_binding:definitions.binding(c,'comparator')});
  const resolved=definitions.resolve(c,'comparator');
  assert.notEqual(resolved,c.comparator_regimen);assert(Object.isFrozen(resolved));assert(Object.isFrozen(resolved.root));
  assert(Object.isFrozen(resolved.source_binding.scope));
  assert.throws(()=>{resolved.root.agent_id='pembrolizumab';},TypeError);
  c.comparator_regimen.source_binding.role='intervention';
  assert.throws(()=>definitions.resolve(c,'comparator'),/source binding differs/);
});

test('warm scope and raw-label changes fail and immutable normal cache hits remain stable',()=>{
  for(const mutate of [c=>c.scope.population_id='changed',c=>c.comparator_label='Pembrolizumab']){
    const c=study(11,'Nivolumab','Ipilimumab').comparisons[0];
    c.comparator_regimen=groups.definitionFromLabel(c.comparator_label,{source_binding:definitions.binding(c,'comparator')});
    const first=definitions.resolve(c,'comparator');assert.equal(definitions.resolve(c,'comparator'),first);
    mutate(c);assert.throws(()=>definitions.resolve(c,'comparator'),/differs/);
  }
});

test('description cache revalidates mutated caller input and cannot return a stale descriptor',()=>{
  const input=groups.definitionFromLabel('Nivolumab');
  const first=definitions.describe(input);assert.equal(first.agent_id,'nivolumab');
  assert(Object.isFrozen(first));assert(Object.isFrozen(first.definition.root));
  input.root.class_id='braf';
  assert.throws(()=>definitions.describe(input),/curated drug class/);
  assert.equal(first.definition.root.class_id,'pd1');
});

function nativeRegimen(kind='OR',arm_id='control'){
  const leaf=(node_id,name)=>({node_id,kind:'drug',name,drug_class:null,children:[],dose:null,route:null,schedule:null,evidence_ids:['own']});
  return {arm_id,label:'Anti-PD-1 treatment options',root_node_id:'root',evidence_ids:['own'],nodes:[
    {node_id:'root',kind,name:null,drug_class:null,children:['n','p'],dose:null,route:null,schedule:null,evidence_ids:['own']},
    leaf('n','nivolumab'),leaf('p','pembrolizumab')]};
}

test('stored native definitions must match the exact current graph and selected arm, not just its label',()=>{
  const c=study(12,'Anti-PD-1 treatment options','Ipilimumab').comparisons[0];
  c.comparator_arm_id='control';c.comparator_native_regimen=nativeRegimen();
  c.comparator_regimen=groups.definitionFromNative(c.comparator_native_regimen,{source_binding:definitions.binding(c,'comparator')});
  assert.equal(definitions.describe(definitions.resolve(c,'comparator')).kind,'alternative');
  c.comparator_native_regimen.nodes[0].kind='AND';
  assert.throws(()=>definitions.resolve(c,'comparator'),/differs from current native arm graph/);
  c.comparator_native_regimen=nativeRegimen('OR','foreign-arm');
  assert.throws(()=>definitions.resolve(c,'comparator'),/selected arm identity/);
  const legacy={...c,comparator_native_regimen:nativeRegimen(),comparator_regimen:groups.definitionFromLabel(c.comparator_label,{source_binding:definitions.binding(c,'comparator')})};
  assert.throws(()=>definitions.resolve(legacy,'comparator'),/differs from current native arm graph/);
});

test('outcome regimen stays separately bound to the actual observed arm without replacing the common pair',()=>{
  const c=study(13,'Anti-PD-1 monotherapy with nivolumab or pembrolizumab','Combination ipilimumab and nivolumab').comparisons[0];
  c.outcome_arm_id='observed-control';c.outcome_arm_label='Anti-PD-1 treatment options';
  c.outcome_native_regimen=nativeRegimen('OR','observed-control');c.result_relation='arm_specific';
  const prepared=definitions.prepareComparison(c);
  assert.equal(definitions.describe(prepared.comparator_regimen).kind,'alternative');
  assert.equal(definitions.describe(prepared.intervention_regimen).kind,'combination');
  assert.equal(definitions.describe(prepared.outcome_regimen).kind,'alternative');
  assert.equal(prepared.outcome_regimen.source_binding.role,'outcome');assert.equal(prepared.outcome_regimen.arm_id,'observed-control');
  const ordinary=definitions.prepareComparison(study(14,'Nivolumab','Ipilimumab').comparisons[0]);
  assert.equal(Object.hasOwn(ordinary,'outcome_regimen'),false);
  assert.throws(()=>definitions.resolve(ordinary,'outcome'),/explicit outcome arm/);
});


test('warm stored legacy definitions cannot change source OR into a concurrent add-on or promote prior treatment',()=>{
  const c=study(15,'Nivolumab or pembrolizumab','Ipilimumab').comparisons[0];
  c.comparator_regimen=groups.definitionFromLabel(c.comparator_label,{source_binding:definitions.binding(c,'comparator')});
  assert.equal(definitions.describe(definitions.resolve(c,'comparator')).kind,'alternative');
  c.comparator_regimen.root.type='and';
  assert.throws(()=>definitions.resolve(c,'comparator'),/differs from its source label/);
  const prior=groups.definitionFromLabel('Prior nivolumab');
  assert.equal(definitions.describe(prior).kind,'context');prior.role='actual_regimen';
  assert.throws(()=>definitions.describe(prior),/cannot be an actual regimen/);
});
