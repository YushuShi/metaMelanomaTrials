'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const groups=require('../dist/treatment_groups.js');
const present=(label,id)=>assert(groups.matchesClass(label,id),`${label} should browse under ${id}`);
const absent=(label,id)=>assert(!groups.matchesClass(label,id),`${label} should not browse under ${id}`);

test('ICI parent excludes non-checkpoint immunotherapy and every separate modality',()=>{
  for(const label of ['Ipilimumab','Nivolumab','Atezolizumab','Relatlimab','ICI'])present(label,'immune');
  for(const label of ['Interferon alfa-2b','CSF-470 cellular vaccine','Lifileucel','Talimogene laherparepvec','Imiquimod','Lenalidomide'])absent(label,'immune');
  present('Imiquimod','other-immunotherapy');
  for(const label of ['Interferon alfa-2b','CSF-470 cellular vaccine','Lifileucel','Talimogene laherparepvec'])absent(label,'other-immunotherapy');
});

test('each non-ICI modality has its own selectable top-level root',()=>{
  const entries=[['C','Interferon alfa-2b'],['V','CSF-470 cellular vaccine'],['L','Lifileucel'],['O','Talimogene laherparepvec'],['I','Imiquimod'],['P','Nivolumab']];
  const tree=groups.optionTree(entries),roots=tree.filter(row=>row.depth===0);
  for(const id of ['cytokines','vaccines','cell-therapies','oncolytic-viruses','other-immunotherapy','immune'])assert(roots.some(row=>row.class_id===id),id);
  assert.equal(roots.find(row=>row.class_id==='immune').label,'Immune checkpoint inhibitors (ICI)');
});

test('OR evidence browses under every explicit named and class constituent without becoming a combination',()=>{
  for(const [label,ids]of [
    ['Nivolumab or pembrolizumab',['pd1','agent:nivolumab','agent:pembrolizumab']],
    ['Dacarbazine or paclitaxel',['chemotherapy','agent:dacarbazine','agent:paclitaxel']],
    ['Interferon alfa-2b or ipilimumab',['cytokines','ctla4','agent:interferon_alfa_2b','agent:ipilimumab']]
  ]){
    const d=groups.describe(label);assert.equal(d.kind,'alternative');assert.match(d.label,/ or /);
    ids.forEach(id=>present(d,id));absent(d,'combinations');
  }
});

test('unknown alternatives retain unknown components and never acquire invented named agents',()=>{
  const d=groups.describe('Nivolumab or unknown investigational agent');
  assert.equal(d.kind,'alternative');assert.equal(d.known,false);assert.match(d.label,/unknown investigational agent/);
  assert.deepEqual(d.agent_ids,['nivolumab']);present(d,'agent:nivolumab');absent(d,'agent:pembrolizumab');
});

test('tree keeps exact option values and the broad alternatives root without redundant class branches',()=>{
  const entries=[['N','Nivolumab'],['P','anti-PD1'],['C','Nivolumab plus ipilimumab'],['A','Nivolumab or pembrolizumab'],['M','Interferon alfa-2b or ipilimumab'],['U','Unknown A or unknown B']];
  const before=JSON.stringify(entries),tree=groups.optionTree(entries);
  for(const[value]of entries)assert(tree.some(row=>row.value===value),value);
  const nodes=tree.filter(row=>row.value.startsWith('treatment-class:'));
  assert(!nodes.some(row=>/-(?:combinations|alternatives|unspecified)$/.test(row.class_id)));
  assert(!nodes.some(row=>row.class_id==='combinations'));
  assert(nodes.some(row=>row.class_id==='alternatives'&&row.depth===0));
  assert.equal(nodes.find(row=>row.class_id==='pd1').label,'PD-1 inhibitors');
  assert.equal(JSON.stringify(entries),before);
});

test('only redundant plain class and agent leaves are hidden, with exact values preserved',()=>{
  const entries=[['N','Nivolumab'],['P','anti-PD1'],['C','Nivolumab plus ipilimumab'],['A','Nivolumab or pembrolizumab'],['PL','Nivolumab(+placebo)'],['OP','Dacarbazine ± fotemustine'],['H','Prior nivolumab']];
  const tree=groups.optionTree(entries);
  for(const value of ['N','P'])assert(tree.filter(row=>row.value===value).every(row=>row.hidden===true),value);
  for(const value of ['C','A','PL','OP','H'])assert(tree.some(row=>row.value===value&&row.hidden!==true),value);
  assert(tree.some(row=>row.value==='treatment-class:agent:nivolumab'&&row.hidden!==true));
});

test('exact obvious arm and acronym aliases canonicalize without accepting an unknown or contradictory suffix',()=>{
  assert.equal(groups.describe('Ipilimumab arm').agent_id,'ipilimumab');
  assert.equal(groups.describe('Nivolumab arm').agent_id,'nivolumab');
  assert.equal(groups.describe('VEM: vemurafenib').agent_id,'vemurafenib');
  const combo=groups.describe('COMBO450: encorafenib plus binimetinib');assert.equal(combo.kind,'combination');assert.deepEqual([...combo.agent_ids].sort(),['binimetinib','encorafenib']);
  for(const label of ['VEM: unknown agent','VEM: nivolumab','COMBO450: nivolumab plus ipilimumab','Ipilimumab arm in Checkmate238','Nivolumab arm in combination with unknown agent'])assert.equal(groups.describe(label).known,false,label);
});

test('generic subcutaneous GM-CSF is a cytokine and never a named product assumption',()=>{
  for(const label of ['Subcutaneous GM-CSF','Subcutaneous granulocyte-macrophage colony-stimulating factor (GM-CSF)']){
    const d=groups.describe(label);assert.equal(d.label,'GM-CSF');assert.equal(d.known,true);assert.deepEqual(d.agent_ids,[]);
    present(d,'cytokines');absent(d,'immune');absent(d,'agent:sargramostim');absent(d,'agent:molgramostim');
  }
});

test('routes, doses and safe administrative labels are removed from named treatment displays',()=>{
  for(const[label,expected]of [
    ['Topical imiquimod','Imiquimod'],['Topical imiquimod cream','Imiquimod'],['Topical imiquimod 5% cream','Imiquimod'],
    ['Randomized blinded sorafenib','Sorafenib'],['Intralesional T-VEC','Talimogene laherparepvec'],
    ['Nivolumab 3 mg/kg every 2 weeks','Nivolumab']
  ])assert.equal(groups.describe(label).label,expected,label);
  assert.equal(groups.describe('gp100').known,false);
  assert.equal(groups.describe('IL-2').kind,'class');assert.equal(groups.describe('IL-2').known,true);
  assert.deepEqual(groups.describe('IL-2').agent_ids,[]);present(groups.describe('IL-2'),'cytokines');
  for(const label of ['Unknown compound 5% cream','Imiquimod 5% cream plus unknown agent']){
    const d=groups.describe(label);assert.equal(d.known,false);assert.equal(d.label,label);
  }
  assert.equal(groups.describe('Previously treated with imiquimod 5% cream').kind,'context');
});

test('the source combination-immunotherapy suffix does not become another drug component',()=>{
  const d=groups.describe('Ipilimumab and nivolumab combination immunotherapy');
  assert.equal(d.known,true);assert.equal(d.kind,'combination');assert.equal(d.label,'Ipilimumab + Nivolumab');
  assert.equal(d.components.length,2);assert.deepEqual(d.agent_ids,['ipilimumab','nivolumab']);
});

test('generic with-other labels keep only the stated class or agent and fail complete-regimen knowledge',()=>{
  for(const[label,id]of [['PD-L1 inhibitors with other treatments','pdl1'],['PD-L1 inhibitor + other treatments','pdl1'],['ici-unspecified with other treatments','immune']]){
    const d=groups.describe(label);present(d,id);assert.equal(d.known,false);assert.equal(d.unspecified_other_treatments,true);
    assert.deepEqual(d.agent_ids,[]);assert.deepEqual(d.components,[]);assert.match(d.label,/\(with other treatments\)$/);
  }
  const named=groups.describe('Nivolumab with other treatments');assert.deepEqual(named.agent_ids,['nivolumab']);assert.equal(named.known,false);assert.equal(named.components.length,0);
});

test('the exact no-comparator placeholder is single-arm browsing, never an added therapy',()=>{
  const d=groups.describe('No comparator with other treatments');
  assert.equal(d.label,'Single-arm trial');assert.equal(d.kind,'class');assert.deepEqual(d.agent_ids,[]);
  present(d,'no-comparator');present(d,'controls');absent(d,'combinations');
  assert(groups.optionTree([['S','No comparator with other treatments']]).some(row=>row.value==='S'&&row.label==='Single-arm trial'&&row.hidden!==true));
});

test('history, negation, sequence and optional treatments retain their restricted memberships',()=>{
  for(const label of ['Not treated with nivolumab','Never received nivolumab or ipilimumab','Prior nivolumab','Vemurafenib followed by ipilimumab','Temozolomide followed by subcutaneous GM-CSF']){
    const d=groups.describe(label);assert.equal(d.kind,'context');assert.equal(d.label,label);assert.equal(d.known,false);assert.deepEqual(d.agent_ids,[]);
  }
  const optional=groups.describe('Dacarbazine ± interferon alfa-2b');assert.equal(optional.kind,'optional');present(optional,'agent:dacarbazine');absent(optional,'agent:interferon_alfa_2b');absent(optional,'cytokines');
});

test('source label objects, numerical metadata and entry references remain untouched',()=>{
  const source={text:'Topical imiquimod',evidence_ids:['E1'],raw_numbers:[{value:5,unit:'percent'}]},entries=[{value:'raw-1',label:'Nivolumab or pembrolizumab',source}];
  const before=JSON.stringify({source,entries});groups.describe(source);groups.memberships(source);groups.optionTree(entries);
  assert.equal(JSON.stringify({source,entries}),before);
});
