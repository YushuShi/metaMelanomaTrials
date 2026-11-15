'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const groups=require('../dist/treatment_groups.js');
const binding={comparison_id:'C1',role:'comparator',scope:{report_id:'R1',source_input_sha256:'a'.repeat(64)}};
const compile=(label,options={})=>groups.definitionFromLabel(label,{source_binding:binding,...options});
const describe=(label)=>groups.describeDefinition(compile(label));
const nativeNode=(node_id,kind,name,children=[],extra={})=>({node_id,kind,name,drug_class:null,children,dose:null,route:null,schedule:null,evidence_ids:['own-E'],...extra});
const native=(nodes,root_node_id='r')=>({arm_id:'A1',label:'Exact reported arm label',root_node_id,nodes,evidence_ids:['own-E']});

test('315 source labels compile to distinct pooled OR and concurrent AND regimens',()=>{
  const control=compile('Anti-PD-1 monotherapy with nivolumab or pembrolizumab');
  const active=compile('Combination ipilimumab and nivolumab');
  assert.equal(control.root.type,'or');assert.deepEqual(control.root.children.map(n=>n.agent_id),['nivolumab','pembrolizumab']);
  assert.equal(active.root.type,'and');assert.deepEqual(active.root.children.map(n=>n.agent_id),['ipilimumab','nivolumab']);
  assert.equal(groups.describe(control).label,'Nivolumab or Pembrolizumab');
  assert.equal(groups.describe(active).label,'Ipilimumab + Nivolumab');
  assert.equal(groups.describe(control).simple_concurrent,false);assert.equal(groups.describe(active).simple_concurrent,true);
  for(const value of [control,active])assert(groups.matchesClass(value,'agent:nivolumab'));
});

test('exact class headings and brand synonyms normalize without substring drug guesses',()=>{
  for(const raw of ['Anti-PD1 agents: Opdivo or Keytruda','PD-1 inhibitors (nivolumab or pembrolizumab)'])assert.deepEqual(describe(raw).agent_ids,['nivolumab','pembrolizumab']);
  assert.equal(describe('Combination of Yervoy and Opdivo').kind,'combination');
  for(const raw of ['Nivolumab-like investigational agent','Unknown anti-PD1-associated molecule','CheckMate238 nivolumab arm label']){
    assert.equal(describe(raw).known,false);assert.deepEqual(describe(raw).agent_ids,[],raw);
  }
  const contradictory=describe('Anti-PD1 monotherapy with nivolumab and pembrolizumab');
  assert.equal(contradictory.known,false);assert.deepEqual(contradictory.agent_ids,[]);
});

test('sequential order is explicit, searchable and distinct from concurrent treatment',()=>{
  const first=describe('Nivolumab followed by ipilimumab'),second=describe('Ipilimumab then nivolumab');
  assert.equal(first.kind,'sequential');assert.equal(first.label,'Nivolumab → Ipilimumab');assert.notEqual(first.key,second.key);
  assert.equal(first.simple_concurrent,false);assert.deepEqual(first.concurrent_agent_ids,[]);
  const value=compile('Nivolumab followed by unknown rescue agent');
  assert.equal(value.root.children[1].type,'unknown');assert.equal(groups.describe(value).known,false);
  assert(groups.matchesClass(value,'agent:nivolumab'));assert.match(groups.describe(value).label,/unknown rescue agent/);
  const punctuation=describe('Vemurafenib followed by ipilimumab, with subsequent vemurafenib after progression');
  assert.equal(punctuation.kind,'sequential');assert.equal(punctuation.known,false);
  assert.deepEqual(punctuation.agent_ids,['vemurafenib','ipilimumab']);assert.match(punctuation.label,/vemurafenib after progression/);
});

test('nested AND-of-OR retains grouping and cannot supply an add-on backbone',()=>{
  const d=describe('(nivolumab or pembrolizumab) and ipilimumab');
  assert.equal(d.kind,'combination');assert.equal(d.label,'(Nivolumab or Pembrolizumab) + Ipilimumab');
  assert.deepEqual(d.agent_ids,['nivolumab','pembrolizumab','ipilimumab']);assert.equal(d.simple_concurrent,false);
  assert.throws(()=>groups.subsetDefinition(d.definition,['ipilimumab']),/known concurrent/);
  assert.notEqual(d.key,describe('nivolumab or (pembrolizumab and ipilimumab)').key);
});

test('dose, route, schedule and original cohort wording survive dose-free drug matching',()=>{
  const raw='Nivolumab 3 mg/kg IV every 2 weeks (cohort A)',value=compile(raw),d=groups.describe(value);
  assert.equal(value.raw_label,raw);assert.equal(value.root.raw_label,raw);assert.equal(value.root.dose,'3 mg/kg');
  assert.equal(value.root.route,'IV');assert.equal(value.root.schedule,'every 2 weeks');assert.equal(d.agent_id,'nivolumab');
  const other=compile('Cohort B: Nivolumab 1 mg/kg IV every 3 weeks');
  assert(groups.matchesClass(other,'agent:nivolumab'));assert.notDeepEqual(other.root.metadata_literals,value.root.metadata_literals);
  assert.equal(other.raw_label,'Cohort B: Nivolumab 1 mg/kg IV every 3 weeks');
});

test('historical or negated mentions never become actual-regimen drug matches',()=>{
  for(const raw of ['Prior nivolumab','Previously treated with pembrolizumab','Not treated with nivolumab','Never received nivolumab or ipilimumab','Nivolumab without ipilimumab']){
    const value=compile(raw),d=groups.describe(value);assert.equal(d.kind,'context');assert.deepEqual(d.agent_ids,[]);
    assert.equal(groups.matchesClass(value,'agent:nivolumab'),false,raw);
  }
  assert.equal(groups.describe(compile('Nivolumab',{role:'prior_history'})).kind,'context');
});

test('legacy optional and placebo qualifiers retain their different exposure meaning',()=>{
  const optional=describe('Dacarbazine ± interferon alfa-2b');
  assert.equal(optional.kind,'optional');assert.deepEqual(optional.agent_ids,['dacarbazine']);
  assert.deepEqual(optional.optional_agent_ids,['interferon_alfa_2b']);assert.equal(optional.simple_concurrent,false);
  const placebo=describe('Carboplatin + paclitaxel (+ placebo)');
  assert.equal(placebo.placebo,true);assert.deepEqual(placebo.agent_ids,['carboplatin','paclitaxel']);
  assert.equal(placebo.simple_concurrent,true);assert.equal(describe('Nivolumab-matched placebo').agent_ids.length,0);
});

test('placebo components never consume an entire active regimen or active backbone',()=>{
  for(const raw of ['Carboplatin plus placebo','Matching placebo plus carboplatin']){
    const d=describe(raw);assert.equal(d.label,'Carboplatin(+placebo)');assert.deepEqual(d.agent_ids,['carboplatin']);
  }
  const d=describe('Ipilimumab plus nivolumab-matched placebo');assert.deepEqual(d.agent_ids,['ipilimumab']);assert.equal(d.placebo,true);
  const unspecifiedIL2=describe('Placebo during high-dose intravenous IL-2');
  assert.equal(unspecifiedIL2.label,'Interleukin-2 therapy, product unspecified(+placebo)');
  assert.deepEqual(unspecifiedIL2.agent_ids,[]);assert(unspecifiedIL2.class_ids.includes('cytokines'));
  assert.equal(describe('Dabrafenib monotherapy (dabrafenib plus placebo)').agent_id,'dabrafenib');
});

test('bounded legacy administrative aliases and unknown numeric names retain dose-free identity',()=>{
  assert.equal(describe('Dacarbazine 1000 mg&#47;m2').agent_id,'dacarbazine');
  assert.equal(describe('Ipilimumab 3 mg/kg every 3 weeks for four doses').agent_id,'ipilimumab');
  assert.equal(describe('VEM: vemurafenib').agent_id,'vemurafenib');
  assert.deepEqual(describe('COMBO450: encorafenib plus binimetinib').agent_ids,['encorafenib','binimetinib']);
  assert.equal(describe('No comparator with other treatments').label,'No comparator');
  assert.equal(describe('Immune checkpoint inhibitors with other treatments').unspecified_other_treatments,true);
  assert.equal(describe('gp100 3 mg/kg monotherapy').key,describe('gp100').key);
  assert.deepEqual(describe('gp100 3 mg/kg monotherapy').agent_ids,[]);
  for(const raw of ['VEM: nivolumab','COMBO450: nivolumab plus ipilimumab'])assert.equal(describe(raw).known,false);
});

test('native graph is authoritative for logic and preserves literal source/evidence metadata',()=>{
  const graph=native([nativeNode('r','OR',null,['n','p']),nativeNode('n','drug','Opdivo',[],{drug_class:'Reported anti-PD1',dose:'1 mg/kg',route:'IV',schedule:'q2w'}),nativeNode('p','drug','pembrolizumab')]);
  const before=JSON.stringify(graph),value=groups.definitionFromNative(graph,{source_binding:binding});
  assert.equal(value.root.type,'or');assert.deepEqual(value.native_graph,graph);assert.equal(value.arm_id,'A1');
  assert.equal(value.root.children[0].agent_id,'nivolumab');assert.equal(value.root.children[0].class_id,'pd1');
  assert.equal(value.root.children[0].class_source,'curated_vocabulary');assert.equal(value.root.children[0].reported_class,'Reported anti-PD1');
  assert.equal(value.root.children[0].dose,'1 mg/kg');assert.deepEqual(value.root.children[0].evidence_ids,['own-E']);
  assert.equal(JSON.stringify(graph),before);assert.equal(groups.describe(value).simple_concurrent,false);
});

test('verified registry identities may repair native UNKNOWN while malformed labels stay intact',()=>{
  const reported=native([nativeNode('r','UNKNOWN','Nivolumab')]),before=JSON.stringify(reported);
  const repaired=groups.definitionFromNative(reported);
  assert.equal(repaired.root.type,'agent');assert.equal(repaired.root.agent_id,'nivolumab');
  assert.equal(repaired.native_graph.nodes[0].kind,'UNKNOWN');assert.equal(JSON.stringify(reported),before);
  const combined=groups.definitionFromNative(native([nativeNode('r','drug','Ipilimumab and nivolumab')]));
  assert.equal(combined.root.type,'and');assert.deepEqual(groups.describe(combined).agent_ids,['ipilimumab','nivolumab']);assert.equal(combined.native_graph.nodes.length,1);
  for(const node of [nativeNode('r','UNKNOWN','BMS-936557'),nativeNode('r','other','Novel agent')]){
    const value=groups.definitionFromNative(native([node]));assert.equal(value.root.type,'unknown');assert.deepEqual(groups.describe(value).agent_ids,[]);
  }
  for(const label of ['Prior nivolumab','Not treated with nivolumab']){
    const value=groups.definitionFromNative({...native([nativeNode('r','drug','nivolumab')]),label});
    assert.equal(groups.describe(value).kind,'context');assert.equal(groups.matchesClass(value,'agent:nivolumab'),false);
  }
});

test('canonical targeted class displays validate without inventing named BRAF or MEK agents',()=>{
  for(const label of ['Targeted therapy','BRAF/MEK-targeted therapy','Neoadjuvant BRAF/MEK-targeted therapy','Tyrosine kinase inhibitor plus anti-PD-1 inhibitor']){
    const value=compile(label),d=groups.describe(value);assert.equal(d.known,true,label);assert.deepEqual(d.agent_ids,[]);
    assert(groups.validateDefinition(value));assert(groups.matchesClass(value,'targeted'));
  }
  const wrong=compile('Targeted therapy');wrong.root.name='Nivolumab';assert.throws(()=>groups.validateDefinition(wrong),/curated class/);
});

test('native cycles, dangling nodes, duplicate IDs, orphans and operator leaf metadata reject',()=>{
  const graphs=[
    native([nativeNode('r','AND',null,['r','a']),nativeNode('a','drug','nivolumab')]),
    native([nativeNode('r','OR',null,['n','missing']),nativeNode('n','drug','nivolumab')]),
    native([nativeNode('r','drug','nivolumab'),nativeNode('r','drug','ipilimumab')]),
    native([nativeNode('r','drug','nivolumab'),nativeNode('orphan','drug','ipilimumab')]),
    native([nativeNode('r','AND','not null',['n','p']),nativeNode('n','drug','nivolumab'),nativeNode('p','drug','pembrolizumab')]),
  ];
  for(const graph of graphs)assert.throws(()=>groups.definitionFromNative(graph));
});

test('public definitions fail on wrong canonical class, forged unknown IDs, changed native logic or wrong source scope',()=>{
  const value=compile('Nivolumab');let bad=structuredClone(value);bad.root.class_id='braf';assert.throws(()=>groups.validateDefinition(bad),/curated drug class/);
  bad=compile('Unknown investigational agent');bad.root.agent_id='nivolumab';assert.throws(()=>groups.validateDefinition(bad),/Unknown treatment/);
  assert.throws(()=>groups.validateDefinition(value,{source_binding:{...binding,role:'intervention'}}),/source binding differs/);
  assert.throws(()=>groups.validateDefinition(value,{raw_label:'Pembrolizumab'}),/raw label differs/);
  const fromNative=groups.definitionFromNative(native([nativeNode('r','OR',null,['n','p']),nativeNode('n','drug','nivolumab'),nativeNode('p','drug','pembrolizumab')]));
  fromNative.root.type='and';assert.throws(()=>groups.validateDefinition(fromNative),/differs from native graph/);
});

test('subset helper preserves exact selected drug metadata and records full native provenance',()=>{
  const graph=native([nativeNode('r','AND',null,['i','n']),nativeNode('i','drug','ipilimumab',[],{dose:'3 mg/kg',route:'IV'}),nativeNode('n','drug','nivolumab',[],{dose:'1 mg/kg'})]);
  const full=groups.definitionFromNative(graph,{source_binding:binding}),before=JSON.stringify(full);
  const subset=groups.subsetDefinition(full,['ipilimumab']);
  assert.equal(groups.describe(subset).label,'Ipilimumab');assert.deepEqual(subset.root,full.root.children[0]);
  assert.deepEqual(subset.native_graph,graph);assert.equal(subset.raw_label,full.raw_label);assert.deepEqual(subset.source_binding,binding);
  assert.equal(subset.derivation.kind,'concurrent_agent_subset');assert.equal(subset.root.dose,'3 mg/kg');
  assert.equal(JSON.stringify(full),before);assert.throws(()=>groups.subsetDefinition(full,['pembrolizumab']));
  const bad=structuredClone(subset);bad.root.dose='10 mg/kg';assert.throws(()=>groups.validateDefinition(bad),/exact concurrent subset/);
});

test('optionTree and memberships consume cached definitions without parsing the display label',()=>{
  const value=compile('Anti-PD-1 monotherapy with nivolumab or pembrolizumab');
  const entries=[{value:'cohort-1',label:'Unrelated opaque UI caption',definition:value}],before=JSON.stringify(entries);
  const tree=groups.optionTree(entries);
  assert(tree.some(row=>row.value==='treatment-class:agent:nivolumab'));
  assert(tree.some(row=>row.value==='treatment-class:agent:pembrolizumab'));
  assert(tree.some(row=>row.value==='cohort-1'&&row.label==='Nivolumab or Pembrolizumab'));
  assert(groups.memberships(value).includes('pd1'));assert.equal(groups.classify(value).id,'alternatives');
  assert.equal(JSON.stringify(entries),before);
});


test('legacy source semantics reject OR-to-AND, reordered sequences and forged subset roots after serialization',()=>{
  const original=compile('Nivolumab or pembrolizumab');
  const changed=JSON.parse(JSON.stringify(original));changed.root.type='and';
  assert.throws(()=>groups.validateDefinition(changed,{source_binding:binding,raw_label:original.raw_label}),/differs from its source label/);
  assert.throws(()=>groups.describeDefinition(changed),/differs from its source label/);
  const sequence=compile('Nivolumab followed by ipilimumab');sequence.root.children.reverse();
  assert.throws(()=>groups.validateDefinition(sequence),/differs from its source label/);
  const full=compile('Ipilimumab 3 mg/kg + nivolumab 1 mg/kg');
  const subset=groups.subsetDefinition(full,['ipilimumab']);assert.equal(groups.describe(subset).agent_id,'ipilimumab');
  subset.derivation.source_root.children[1].dose='999 mg/kg';
  assert.throws(()=>groups.validateDefinition(subset),/differs from its source label/);
  // Neither compiling nor mutating a returned definition can poison the private parse.
  original.root.type='and';assert.equal(compile(original.raw_label).root.type,'or');
});

test('serialized legacy and native history/negation roles cannot be promoted to actual treatment',()=>{
  for(const raw of ['Prior nivolumab','Not treated with nivolumab']){
    for(const value of [compile(raw),groups.definitionFromNative({...native([nativeNode('r','drug','nivolumab')]),label:raw})]){
      const changed=JSON.parse(JSON.stringify(value));changed.role='actual_regimen';
      assert.throws(()=>groups.validateDefinition(changed),/cannot be an actual regimen/);
      assert.throws(()=>groups.describeDefinition(changed),/cannot be an actual regimen/);
    }
  }
  // Reported native sequence logic may resolve vague ordering text, without reparsing it.
  const value=groups.definitionFromNative({...native([nativeNode('r','SEQUENTIAL',null,['n','i']),nativeNode('n','drug','nivolumab'),nativeNode('i','drug','ipilimumab')]),label:'Ipilimumab following nivolumab'});
  assert.equal(value.role,'actual_regimen');assert.equal(groups.describe(value).kind,'sequential');
});
