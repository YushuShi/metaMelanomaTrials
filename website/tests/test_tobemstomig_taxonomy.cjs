'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const groups=require('../dist/treatment_groups.js'),regimens=require('../dist/regimen_definitions.js');
const fixture=require('./fixtures/tobemstomig_current_records.json');
const clone=x=>JSON.parse(JSON.stringify(x));

test('Tobemstomig aliases identify one PD-1/LAG-3 bispecific checkpoint inhibitor',()=>{
  const row=groups.catalog().agents.find(x=>x.id==='tobemstomig');
  assert.equal(row.verification,'primary_sources_checked_2026-11-08');
  for(const alias of [...row.aliases,'Tobemstomig (RO7247669)','RO-7247669 (RG6139)']){
    const d=groups.describe(alias);
    assert.equal(d.kind,'agent',alias);assert.equal(d.label,'Tobemstomig',alias);
    assert.deepEqual(d.agent_ids,['tobemstomig']);assert.deepEqual(d.class_ids,['pd1-lag3']);
    assert.equal(groups.classify(alias).id,'pd1-lag3');
    for(const id of ['immune','ici','pd1','lag3','pd1-lag3','agent:tobemstomig'])assert(groups.matchesClass(d,id),id);
    for(const id of ['combinations','pdl1','ctla4','other-immunotherapy'])assert(!groups.matchesClass(d,id),id);
  }
});

test('target browsing uses one canonical drug leaf and searchable source aliases',()=>{
  const tree=groups.optionTree([['T','RO7247669']]);
  assert.equal(tree.filter(x=>x.value==='treatment-class:agent:tobemstomig').length,1);
  assert.equal(tree.find(x=>x.class_id==='pd1-lag3').label,'PD-1 / LAG-3 bispecific inhibitors');
  const drug=tree.find(x=>x.value==='treatment-class:agent:tobemstomig');
  assert.match(drug.search_text,/RG6139/);assert.match(drug.search_text,/RO7247669/);
  for(const id of ['immune','pd1','lag3','pd1-lag3'])assert(tree.some(x=>x.value==='treatment-class:'+id));
});

test('compound aliases preserve actual regimen operators and metadata',()=>{
  for(const [label,kind] of [['RO7247669 + nivolumab','combination'],['RG6139 or nivolumab','alternative'],['RO-7247669 followed by nivolumab','sequential']]){
    const d=groups.describeDefinition(groups.definitionFromLabel(label));
    assert.equal(d.kind,kind);assert.deepEqual(new Set(d.agent_ids),new Set(['tobemstomig','nivolumab']));
    assert.equal(d.components.length,2);
  }
  const d=groups.describeDefinition(groups.definitionFromLabel('Tobemstomig 2100 mg every 2 weeks'));
  assert.equal(d.agent_id,'tobemstomig');assert.equal(d.dose,'2100 mg');assert.equal(d.schedule,'every 2 weeks');
  assert.equal(groups.describe('TobemstomigX').known,false);
  assert.deepEqual(groups.describe('Previously treated with tobemstomig').agent_ids,[]);
});

test('current saved native roots gain reviewed identity in memory without altering evidence',()=>{
  const before=JSON.stringify(fixture);let n=0;
  for(const a of fixture.articles)for(const c of a.comparisons)for(const role of ['comparator','intervention','outcome']){
    if(role==='outcome'&&!c.outcome_arm_id)continue;
    const raw=c[role+'_regimen'];const d=regimens.describe(regimens.resolve(c,role));
    if(!d.agent_ids.includes('tobemstomig'))continue;n++;
    assert(groups.matchesClass(d,'immune'));assert(groups.matchesClass(d,'pd1'));assert(groups.matchesClass(d,'lag3'));
    assert.equal(d.definition.raw_label,raw.raw_label);assert.deepEqual(d.definition.native_graph,raw.native_graph);
    assert.deepEqual(d.definition.source_binding,raw.source_binding);
  }
  assert.equal(n,16);assert.equal(JSON.stringify(fixture),before);
});

test('identity promotion cannot conceal modified dose, source, native kind or graph structure',()=>{
  const original=fixture.articles.find(a=>a.pmid==='41945490').comparisons[0].intervention_regimen;
  const changed=clone(original);changed.root.dose='invented';assert.throws(()=>groups.validateDefinition(changed));
  const named=clone(original);named.root.name='nivolumab';assert.throws(()=>groups.validateDefinition(named));
  const source=clone(original);source.root.evidence_ids=['other-evidence'];assert.throws(()=>groups.validateDefinition(source));
  const kind=clone(original);kind.native_graph.nodes[0].kind='UNKNOWN';
  assert.equal(groups.describeDefinition(groups.validateDefinition(kind)).known,false);
  assert.throws(()=>groups.validateDefinition(original,{source_binding:{wrong:true}}));
});

test('legacy unknown identity is reviewed without allowing unrelated unknown promotion',()=>{
  const old=groups.definitionFromLabel('Tobemstomig');
  Object.assign(old.root,{type:'unknown',agent_id:null,class_id:null,class_source:null,name:'Tobemstomig'});
  assert.equal(groups.describeDefinition(groups.validateDefinition(old)).agent_id,'tobemstomig');
  const wrong=clone(old);wrong.root.raw_label='nivolumab';assert.throws(()=>groups.validateDefinition(wrong));
});
