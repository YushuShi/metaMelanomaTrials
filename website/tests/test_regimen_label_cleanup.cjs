'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const groups=require('../dist/treatment_groups.js'),definitions=require('../dist/regimen_definitions.js');
const historical=require('./fixtures/legacy_regimen_compiler_v1.json');
const binding={comparison_id:'C-clean',role:'intervention',scope:{report_id:'R-clean',source_input_sha256:'exact-source'}};
const describe=raw=>groups.describeDefinition(groups.definitionFromLabel(raw,{source_binding:binding}));

test('verified coBRIM and COMBI-v annotations are metadata rather than drug components',()=>{
  for(const [raw,want,agents] of [
    ['Vemurafenib plus cobimetinib (coBRIM)','Vemurafenib + Cobimetinib',['vemurafenib','cobimetinib']],
    ['Dabrafenib+Trametinib(COMBI-v)','Dabrafenib + Trametinib',['dabrafenib','trametinib']]]){
    const d=describe(raw);assert.equal(d.label,want);assert.equal(d.kind,'combination');
    assert.deepEqual(d.agent_ids,agents);assert.equal(d.definition.raw_label,raw);
  }
  for(const raw of ['coBRIM','COMBI-v','Nivolumab (coBRIM)','Pembrolizumab (COMBI-v)']){
    const d=describe(raw);assert.equal(d.simple_concurrent,false);assert.equal(d.label,raw);
  }
});

test('the verified carboplatin/paclitaxel pair is concurrent and CP is only removed beside explicit drugs',()=>{
  for(const raw of ['carboplatin/paclitaxel (CP)','Single-arm pembrolizumab plus carboplatin/paclitaxel (CP)',
    'Single arm: pembrolizumab with carboplatin and paclitaxel (CP)']){
    const d=describe(raw);assert.equal(d.kind,'combination');assert.equal(d.simple_concurrent,true);
    assert.deepEqual(d.agent_ids,raw.toLowerCase().includes('pembrolizumab')?['pembrolizumab','carboplatin','paclitaxel']:['carboplatin','paclitaxel']);
    assert.doesNotMatch(d.label,/single.arm|\(CP\)|\//i);assert.equal(d.definition.raw_label,raw);
  }
  for(const raw of ['CP','Pembrolizumab (CP)','Carboplatin (CP)'])assert.equal(describe(raw).known,false,raw);
  assert.equal(describe('Nivolumab/pembrolizumab').simple_concurrent,false);
});

test('administrative wording is omitted without collapsing alternatives, sequence or optional exposure',()=>{
  assert.equal(describe('First-line combined nivolumab and ipilimumab arm').label,'Nivolumab + Ipilimumab');
  assert.equal(describe('Adjuvant nivolumab or pembrolizumab').kind,'alternative');
  assert.equal(describe('Combination nivolumab followed by ipilimumab').kind,'sequential');
  assert.equal(describe('Single-arm dacarbazine ± interferon alfa-2b').kind,'optional');
  assert.equal(describe('Single-arm trial').label,'No comparator');assert.equal(describe('Single-arm trial').known,true);
  assert.equal(describe('Nivolumab first-line').label,'Nivolumab');
  const unspecified=describe('Combined nivolumab');assert.equal(unspecified.label,'Nivolumab');assert.equal(unspecified.unspecified_other_treatments,true);
  assert.equal(unspecified.simple_concurrent,false);assert.equal(unspecified.known,false);
  const raw='Adjuvant nivolumab 3 mg/kg IV every 2 weeks (first line)',d=describe(raw);
  assert.equal(d.label,'Nivolumab');assert.equal(d.definition.raw_label,raw);
  assert.equal(d.definition.root.dose,'3 mg/kg');assert.equal(d.definition.root.route,'IV');
  assert.equal(d.definition.root.schedule,'every 2 weeks');
});

test('meaningful parentheses and unavailable composition remain explicit',()=>{
  const alternative=describe('Anti-PD-1 monotherapy (nivolumab or pembrolizumab)');
  assert.equal(alternative.kind,'alternative');assert.deepEqual(alternative.agent_ids,['nivolumab','pembrolizumab']);
  for(const raw of ['Nivolumab (unidentified co-treatment)','Pembrolizumab (dose uncertain)','Nivolumab (possibly ipilimumab)']){
    const d=describe(raw);assert.equal(d.known,false,raw);assert.equal(d.simple_concurrent,false,raw);assert(d.label.includes('('),raw);
  }
  const cohort=groups.definitionFromLabel('Nivolumab 1 mg/kg (cohort A)');
  assert.equal(cohort.raw_label,'Nivolumab 1 mg/kg (cohort A)');assert.equal(cohort.root.dose,'1 mg/kg');
});

test('old serialized trees validate before deterministic rematerialization without changing caller data',()=>{
  for(const old of historical.definitions){
    const before=JSON.stringify(old);assert.equal(Object.hasOwn(old,'compiler_version'),false);
    assert(groups.validateDefinition(old));
    const current=groups.rematerializeDefinition(old,{source_binding:old.source_binding,raw_label:old.raw_label});
    assert.equal(current.compiler_version,4);assert.equal(current.raw_label,old.raw_label);
    assert.deepEqual(current.source_binding,old.source_binding);assert.equal(current.role,old.role);
    assert.equal(JSON.stringify(old),before);
    if(old.derivation){assert.equal(current.root.dose,'3 mg/kg');assert.deepEqual(current.derivation.selected_agent_ids,['ipilimumab']);}
  }
  const oldNoComparator=historical.definitions.find(d=>d.raw_label==='Single-arm trial');
  assert.equal(groups.describeDefinition(oldNoComparator).label,'Single-arm trial');
  assert.equal(groups.describeDefinition(groups.rematerializeDefinition(oldNoComparator)).label,'No comparator');
  const changed=structuredClone(historical.definitions[3]);changed.root.type='and';
  assert.throws(()=>groups.rematerializeDefinition(changed),/differs from its source label/);
  assert.throws(()=>groups.rematerializeDefinition(historical.definitions[0],{source_binding:binding}),/source binding differs/);
  const unknown=groups.definitionFromLabel('Nivolumab');unknown.compiler_version=99;
  assert.throws(()=>groups.validateDefinition(unknown),/compiler version/);
});

test('the resolver rematerializes only validated legacy trees and never uses migration to bypass native binding',()=>{
  const old=historical.definitions[0],c={comparison_id:old.source_binding.comparison_id,scope:old.source_binding.scope,
    comparator_label:old.raw_label,comparator_regimen:structuredClone(old)};
  const value=definitions.resolve(c,'comparator');assert.equal(value.compiler_version,4);
  assert.equal(definitions.describe(value).label,'Vemurafenib + Cobimetinib');assert(Object.isFrozen(value));
  assert.equal(definitions.describe(old).label,'Vemurafenib + Cobimetinib');
  c.comparator_regimen.root.type='or';assert.throws(()=>definitions.resolve(c,'comparator'),/source label/);
  const node={node_id:'n',kind:'drug',name:'nivolumab',drug_class:null,children:[],dose:'3 mg/kg',route:'IV',schedule:null,evidence_ids:['E']};
  const graph={arm_id:'A',label:'Adjuvant nivolumab',root_node_id:'n',nodes:[node],evidence_ids:['E']};
  const native=groups.definitionFromNative(graph,{source_binding:binding}),before=JSON.stringify(native);
  assert.deepEqual(groups.rematerializeDefinition(native),native);assert.equal(JSON.stringify(native),before);
  const foreign={comparison_id:binding.comparison_id,scope:binding.scope,intervention_label:graph.label,
    intervention_arm_id:'A',intervention_native_regimen:{...graph,nodes:[{...node,name:'pembrolizumab'}]},intervention_regimen:native};
  assert.throws(()=>definitions.resolve(foreign,'intervention'),/current native arm graph/);
});


test('recognized cohort and treatment wrappers clean names while exact raw population context stays bound',()=>{
  for(const [raw,label] of [
    ['Melanoma cohort abemaciclib monotherapy','Abemaciclib'],
    ['Nivolumab treatment','Nivolumab'],['Ipilimumab-treated cohort','Ipilimumab'],
    ['Pembrolizumab-treated melanoma cohort','Pembrolizumab'],
    ['Treatment with nivolumab','Nivolumab'],
    ['Immune checkpoint inhibitor treatment','Immune checkpoint inhibitor, unspecified']]){
    const d=describe(raw);assert.equal(d.label,label);assert.equal(d.definition.raw_label,raw);
    assert.deepEqual(d.definition.source_binding,binding);
  }
  const alternatives=describe('Nivolumab or pembrolizumab treatment');
  assert.equal(alternatives.kind,'alternative');assert.equal(alternatives.simple_concurrent,false);
  const sequence=describe('Nivolumab followed by ipilimumab treatment');
  assert.equal(sequence.label,'Nivolumab → Ipilimumab');assert.equal(sequence.simple_concurrent,false);
});

test('pooled source context is not a concurrent drug and never supplies an add-on backbone',()=>{
  for(const [raw,label,agents] of [
    ['NSCLC cohort abemaciclib treatment, pooled regimens','Abemaciclib',['abemaciclib']],
    ['Single-agent nivolumab or pembrolizumab, pooled','Nivolumab or Pembrolizumab',['nivolumab','pembrolizumab']],
    ['Toripalimab plus axitinib, pooled dose levels','Toripalimab + Axitinib',['toripalimab','axitinib']],
    ['Carboplatin plus placebo, pooled regimens','Carboplatin(+placebo)',['carboplatin']]]){
    const d=describe(raw);assert.equal(d.label,label);assert.deepEqual(d.agent_ids,agents);
    assert.equal(d.pooled_regimens,true);assert.equal(d.known,false);assert.equal(d.simple_concurrent,false);
    assert.deepEqual(d.concurrent_agent_ids,[]);assert.equal(d.definition.raw_label,raw);
    assert.throws(()=>groups.subsetDefinition(d.definition,[agents[0]]),/known concurrent/);
  }
  // An unidentified partner is not administrative text, and prior/negated exposure stays context.
  for(const raw of ['Unknown agent treatment','Nivolumab with unidentified partner treatment']){
    const d=describe(raw);assert.equal(d.known,false);assert.equal(d.simple_concurrent,false);assert.match(d.label,/unknown|unidentified/i);
  }
  for(const raw of ['Prior nivolumab treatment','Not treated with nivolumab treatment']){
    const d=describe(raw);assert.equal(d.kind,'context');assert.deepEqual(d.agent_ids,[]);
  }
});
