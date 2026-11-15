'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const groups=require('../dist/treatment_groups.js'),defs=require('../dist/regimen_definitions.js'),rules=require('../dist/regimen_source_rules.js');
const old=require('./fixtures/legacy_regimen_compiler_v2.json');
const base=path.join(__dirname,'../../data/proposed_changes/labels_trials_wald_20261106');
const data=JSON.parse(fs.readFileSync(path.join(base,'PUBLIC_ARTICLES_FOUR_CASES_5d527d2d322d5b6afb2ea33631983e8a1f3b6f94be62f2ca6e5a5e0a165fd874.json'),'utf8'));
const describe=raw=>groups.describeDefinition(groups.definitionFromLabel(raw));
const sourceFields=value=>Array.isArray(value)?value.map(sourceFields):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['registry_version','normalization'].includes(key)).map(([key,item])=>[key,sourceFields(item)])):value;

test('compiler3 expands exact adopted regimen abbreviations without treating arbitrary slashes as concurrent',()=>{
 for(const [raw,label] of [['DAB/TRAM','Dabrafenib + Trametinib'],['ENCO+BINI','Encorafenib + Binimetinib'],
  ['VEM/COBI','Vemurafenib + Cobimetinib'],['ATEZO+VEM+COBI cohort','Atezolizumab + Vemurafenib + Cobimetinib'],
  ['DAB+TRAM first-line comparator','Dabrafenib + Trametinib'],['NIVO+RELA','Nivolumab + Relatlimab']]){
  const d=describe(raw);assert.equal(d.label,label);assert.equal(d.definition.raw_label,raw);assert.equal(d.known,true);
 }
 for(const raw of ['NIVO/PEMBRO','DAB-like investigational compound','TRAM novel partner','HDI'])assert.equal(describe(raw).simple_concurrent,false,raw);
 const seq=describe('DAB/TRAM followed by NIVO+IPI');assert.equal(seq.kind,'sequential');assert.equal(seq.simple_concurrent,false);
 assert.equal(describe('DAB/TRAM or ENCO/BINI').kind,'alternative');
});

test('only redundant source-supported HDI and matching ipilimumab dose annotations disappear',()=>{
 const hdi=describe('High-dose interferon alfa-2b (HDI)');assert.equal(hdi.label,'Interferon alfa-2b');assert.equal(hdi.definition.raw_label,'High-dose interferon alfa-2b (HDI)');
 for(const n of [3,10]){const d=describe(`Ipilimumab ${n} mg/kg (ipi${n})`);assert.equal(d.label,'Ipilimumab');assert.equal(d.definition.root.dose,`${n} mg/kg`);}
 assert.equal(describe('Ipilimumab 10 mg/kg (ipi3)').known,false);
 assert.equal(describe('Pembrolizumab (HDI)').known,false);
});

test('published compiler2 source fields replay exactly before registry rematerialization',()=>{
 for(const previous of old.definitions){const before=JSON.stringify(previous);assert.equal(previous.compiler_version,2);
  const validated=groups.validateDefinition(previous);assert.deepEqual(sourceFields(validated),previous);
  const next=groups.rematerializeDefinition(previous);assert.equal(next.compiler_version,4);assert.equal(next.raw_label,previous.raw_label);
  assert.equal(next.role,previous.role);assert.deepEqual(next.source_binding,previous.source_binding);assert.equal(JSON.stringify(previous),before);
 }
 const changed=structuredClone(old.definitions[3]);changed.root.type='or';assert.throws(()=>groups.validateDefinition(changed));
 const current=groups.definitionFromLabel('NIVO+RELA');current.compiler_version=2;assert.throws(()=>groups.validateDefinition(current),/source label/);
});

test('generic without/prior/negation stays protected outside exact source-bound control proofs',()=>{
 for(const raw of ['Nivolumab without ipilimumab','Prior DAB/TRAM','Not treated with NIVO',
  'Dacarbazine, cisplatin and interferon-alfa-2b without IL-2']){
  const d=describe(raw);assert.equal(d.kind,'context');assert.equal(d.simple_concurrent,false);assert.deepEqual(d.agent_ids,[]);
 }
});

test('actual factorial arm-specific rows match only their exact source pools and keep the added-agent convention',()=>{
 const article=data.articles.find(a=>a.pmid==='23402397'),pool=article.comparisons.filter(c=>c.kind==='arm_specific_result');assert.equal(pool.length,14);
 for(const c of pool){const before=JSON.stringify(c),review=rules.lookup(c);assert(review);assert.equal(review.is_add_on,true);
  const prepared=defs.prepareComparison(c),d=defs.describe(prepared.intervention_regimen);
  assert(['Fotemustine','Interferon alfa-2b'].includes(d.label));assert.equal(prepared.comparator_regimen.root.type,'optional');
  assert.equal(prepared.outcome_regimen.root.type,'or');assert.equal(defs.describe(prepared.outcome_regimen).simple_concurrent,false);
  assert.equal(review.source_regimen_pools.intervention.length,2);assert(Object.isFrozen(review.source_regimen_pools.intervention[0]));
  assert.equal(JSON.stringify(c),before);
  for(const mutate of [x=>x.scope.source_input_sha256='foreign',x=>x.outcome_arm_id=x.comparator_arm_id,x=>x.additional_intervention_label='different-pool']){
   const bad=structuredClone(c);mutate(bad);assert.equal(rules.lookup(bad),null);
  }
 }
});

test('EORTC control proof preserves the actual three-drug backbone and source-specific IL2 addition',()=>{
 const article=data.articles.find(a=>a.pmid==='16170182'),c=article.comparisons.find(c=>c.kind==='treatment_comparison'),before=JSON.stringify(c);
 assert.equal(c.comparator_regimen.role,'negated');const prepared=defs.prepareComparison(c),control=defs.describe(prepared.comparator_regimen),active=defs.describe(prepared.intervention_regimen);
 assert.deepEqual(control.agent_ids,['dacarbazine','cisplatin','interferon_alfa_2b']);assert.deepEqual(active.agent_ids,[]);assert.deepEqual(active.class_ids,['cytokines']);assert.equal(active.label,'Interleukin-2 therapy, product unspecified');
 assert.equal(control.definition.role,'actual_regimen');assert.equal(rules.lookup(c).is_add_on,true);assert.equal(JSON.stringify(c),before);
 const noProof=structuredClone(c);noProof.scope.source_input_sha256='foreign';assert.equal(rules.lookup(noProof),null);
 assert.equal(groups.describeDefinition(groups.definitionFromLabel(c.comparator_label)).kind,'context');
 const altered=structuredClone(c);altered.comparator_regimen.role='actual_regimen';assert.throws(()=>defs.prepareComparison(altered));
});
