'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const resolver=require('../dist/treatment_resolver.js'),groups=require('../dist/treatment_groups.js');
const registry=require('../../config/treatment_registry.json');
const resolved=(raw,id,category,options)=>{const value=resolver.resolve(raw,options);assert.equal(value.status,'resolved',raw);assert.equal(value.canonical_id,id,raw);assert.equal(value.broad_category,category,raw);assert.equal(value.raw_label,raw);assert.equal(value.registry_version,registry.version);return value;};
const generic=(raw,category)=>{const value=resolver.resolve(raw);assert.equal(value.status,'generic',raw);assert.equal(value.canonical_id,null,raw);assert.equal(value.broad_category,category,raw);assert.equal(value.raw_label,raw);assert.equal(groups.describe(raw).agent_ids.length,0,raw);return value;};

test('code aliases normalize Unicode dashes without confusing one-digit neighboring agents',()=>{
  for(const raw of ['BMS-936558','BMS–936558','MDX-1106'])assert.equal(resolved(raw,'nivolumab','ici').class_id,'pd1');
  assert.equal(resolved('BMS-936559','bms_936559','ici').class_id,'pdl1');
  for(const raw of ['BMS-936557','BMS-9365587','MDX-1107']){const value=resolver.resolve(raw);assert.equal(value.status,'unresolved');assert.equal(value.canonical_id,null);assert.equal(groups.describe(raw).agent_ids.length,0);}
});

test('verified brand, former-name and development aliases share the intended product identity',()=>{
  for(const raw of ['Kimmtrak','IMCgp100','tebentafusp-tebn'])assert.match(resolved(raw,'tebentafusp','immunotherapy').mechanism,/T-cell|T.cell/i);
  for(const raw of ['MDX-CTLA-4','MDX-CTLA4','MDX–CTLA–4'])resolved(raw,'ipilimumab','ici');
  resolved('Lambrolizumab','pembrolizumab','ici');assert.equal(resolved('AZD6244','selumetinib','targeted').class_id,'mek');
  resolved('Alkeran','melphalan','chemotherapy');resolved('Temodar','temozolomide','chemotherapy');resolved('SHR-1210','camrelizumab','ici');resolved('CC-5013','lenalidomide','immunotherapy');resolved('CSF-470','csf470','vaccines');
});

test('generic checkpoint slash labels remain one class with no invented dual therapy or molecule',()=>{
  for(const raw of ['anti-PD-1/PD-L1','Anti-PD-1/PD-L1 inhibitor','anti-PD-1/PD-L1 monotherapy','anti-PD-(L)1','PD-(L)1 inhibitor']){
    const value=generic(raw,'ici');assert.equal(value.class_id,'pd1-pdl1-unspecified');assert.notEqual(value.combination_status,'combination');
    const description=groups.describe(raw);assert.notEqual(description.kind,'combination');assert.notEqual(description.kind,'alternative');
  }
  assert.equal(generic('immune checkpoint blockade','ici').class_id,'ici-unspecified');
  for(const [raw,id]of [['anti-PD-1','pd1'],['PD-L1 inhibitor','pdl1'],['CTLA-4 inhibitor','ctla4']])assert.equal(generic(raw,'ici').class_id,id);
});

test('generic cytokine and cell labels never silently establish branded products',()=>{
  for(const raw of ['IL-2','recombinant interleukin-2','GM-CSF','recombinant human granulocyte-macrophage colony-stimulating factor','interferon alfa','interferon alfa-2','interferon beta','interferon gamma'])generic(raw,'cytokines');
  for(const raw of ['tumor-infiltrating lymphocytes','autologous tumor-infiltrating lymphocytes','expanded tumor-infiltrating lymphocytes','CD8-enriched tumor-infiltrating lymphocytes','LAK cells','autologous lymphokine-activated killer cells'])generic(raw,'cell-therapies');
  resolved('lifileucel','lifileucel','cell-therapies');
  assert.equal(registry.generic_classes.filter(entry=>entry.id==='gmcsf-unspecified').length,1);
});

test('salts retain raw specificity and meaningful formulations remain distinct products',()=>{
  resolved('Vinblastine sulfate','vinblastine','chemotherapy');
  for(const raw of ['Nab-paclitaxel','albumin-bound paclitaxel','nanoparticle albumin-bound paclitaxel'])assert.match(resolved(raw,'nab_paclitaxel','chemotherapy').formulation,/albumin/i);
  const conventional=resolved('paclitaxel','paclitaxel','chemotherapy');assert.notEqual(conventional.canonical_id,resolver.resolve('Abraxane').canonical_id);
  assert.notEqual(resolver.resolve('peginterferon alfa-2b').canonical_id,resolver.resolve('interferon alfa-2b').canonical_id);
  for(const raw of ['liposomal paclitaxel','pegylated paclitaxel'])assert.notEqual(resolver.resolve(raw).canonical_id,'paclitaxel');
});

test('parent antibodies and antibody-drug conjugates retain separate identities',()=>{
  const ids=['trastuzumab','ado-trastuzumab emtansine','trastuzumab deruxtecan'].map(raw=>{const value=resolver.resolve(raw);assert.equal(value.broad_category,'targeted');assert.equal(value.status,'resolved');return value.canonical_id;});
  assert.equal(new Set(ids).size,3);
});

test('newer checkpoint products remain correctly separated by mechanism',()=>{
  for(const [raw,mechanism]of [['spartalizumab','PD-1'],['camrelizumab','PD-1'],['cobolimab','TIM-3'],['sabatolimab','TIM-3'],['tiragolumab','TIGIT'],['vibostolimab','TIGIT']]){
    const value=resolver.resolve(raw);assert.equal(value.status,'resolved');assert.equal(value.broad_category,'ici');assert(value.mechanism.toLowerCase().includes(mechanism.toLowerCase()));
  }
  const a=resolved('Lomvastomig','lomvastomig','ici'),b=resolved('Tobemstomig','tobemstomig','ici');
  assert.notEqual(a.canonical_id,b.canonical_id);assert.match(a.mechanism,/TIM.?3/i);assert.match(b.mechanism,/LAG.?3/i);
});

test('placebo and negated/history wording cannot become active treatment or observation',()=>{
  for(const raw of ['Ipilimumab-matched placebo','placebo (cellular ingredients)']){const value=resolver.resolve(raw);assert.equal(value.status,'control');assert.equal(value.active_exposure,false);assert.equal(value.canonical_id,null);assert.equal(groups.describe(raw).agent_ids.length,0);}
  for(const raw of ['No ipilimumab','No immunotherapy','No targeted therapy','Immunotherapy-naïve cohort','PD-1-refractory cohort']){const value=resolver.resolve(raw);assert.equal(value.status,'context',raw);assert.equal(value.active_exposure,false);assert.notEqual(value.class_id,'supportive');assert.equal(groups.describe(raw).agent_ids.length,0);}
  assert(resolver.resolve('No ipilimumab').mentioned_canonical_ids.includes('ipilimumab'));
});

test('BRAF/MEK class ambiguity differs from an explicit combination without inventing agents',()=>{
  const ambiguous=generic('BRAF/MEK inhibitors','targeted'),combination=generic('BRAF/MEK inhibitor combination','targeted');
  assert.equal(ambiguous.combination_status,'unspecified');assert.equal(combination.combination_status,'combination');
  assert.deepEqual([...combination.class_ids].sort(),['braf','mek']);
  assert(groups.memberships('BRAF/MEK inhibitor combination').includes('braf'));assert(groups.memberships('BRAF/MEK inhibitor combination').includes('mek'));
  assert.equal(groups.describe('BRAF/MEK inhibitors').agent_ids.length,0);
});

test('conditioning chemotherapy remains identifiable without replacing the principal cell therapy',()=>{
  for(const name of ['cyclophosphamide','fludarabine']){const value=resolver.resolve(name,{context:'Lymphodepleting conditioning before tumor-infiltrating lymphocyte infusion'});assert.equal(value.broad_category,'chemotherapy');assert.equal(value.role,'conditioning');assert.equal(value.active_exposure,true);}
  const main=generic('tumor-infiltrating lymphocytes','cell-therapies');assert.equal(main.role,'principal');
  const described=resolver.resolve('autologous tumor-infiltrating lymphocytes',{context:'The cells were expanded ex vivo and then infused into the patient.'});assert.equal(described.broad_category,'cell-therapies');assert.notEqual(described.role,'preparation');assert.equal(described.active_exposure,true);
  const native={arm_id:'A-conditioning',label:'Cyclophosphamide and fludarabine lymphodepleting conditioning with TIL infusion',root_node_id:'r',evidence_ids:['E'],nodes:[
    {node_id:'r',kind:'AND',name:null,drug_class:null,dose:null,route:null,schedule:null,children:['cy','flu','til'],evidence_ids:['E']},
    ...[['cy','cyclophosphamide'],['flu','fludarabine'],['til','tumor-infiltrating lymphocytes']].map(([node_id,name])=>({node_id,kind:'drug',name,drug_class:null,dose:null,route:null,schedule:null,children:[],evidence_ids:['E']}))]};
  const definition=groups.definitionFromNative(native),regimen=groups.describeDefinition(definition);
  assert.deepEqual(regimen.principal_class_ids,['cell-therapies']);assert(regimen.class_ids.includes('chemotherapy'));
  assert(groups.memberships(regimen).includes('agent:cyclophosphamide'));assert(groups.memberships(regimen).includes('chemotherapy'));
  assert.equal(regimen.simple_concurrent,false);assert.deepEqual(definition.native_graph,native);
});

test('adjuvants, immune activators and vaccines are not mistaken for checkpoint blockers',()=>{
  assert.equal(resolved('Montanide ISA-51','montanide_isa51','immunotherapy').role,'adjuvant');
  assert.notEqual(resolver.resolve('Montanide').canonical_id,'montanide_isa51');
  const poly=resolved('Poly-ICLC','poly_iclc','immunotherapy');assert.equal(poly.role,'unclear');assert.equal(resolver.resolve('Poly-ICLC',{role:'adjuvant'}).role,'adjuvant');
  const polyDescription=groups.describeDefinition(groups.definitionFromLabel('Poly-ICLC'));assert.equal(polyDescription.simple_concurrent,false);assert.deepEqual(polyDescription.principal_class_ids,[]);assert(groups.memberships(polyDescription).includes('agent:poly_iclc'));
  const apc=resolved('IMP321','eftilagimod_alpha','immunotherapy');assert.match(apc.mechanism,/activat/i);assert.notEqual(apc.class_id,'lag3');
  resolved('IO102/IO103','io102_io103','vaccines');assert.match(resolved('sotigalimab','sotigalimab','immunotherapy').mechanism,/CD40/i);
});

test('complete administered cell products win over constituent preparation words',()=>{
  for(const [raw,category]of [['Mitomycin C-treated allogeneic melanoma cell vaccine','vaccines'],['IL-12-transduced tumor-infiltrating lymphocytes','cell-therapies'],['tumor lysate, particle-loaded, dendritic cell vaccine','vaccines']]){
    const value=resolver.resolve(raw);assert.equal(value.broad_category,category);assert.equal(value.active_exposure,true);assert.equal(groups.describe(raw).components.length,0);assert(!groups.describe(raw).class_ids.includes('chemotherapy'));
  }
  const reagent=resolver.resolve('Anti-CD3 reagent used only to expand cells ex vivo');assert.equal(reagent.status,'context');assert.equal(reagent.role,'preparation');assert.equal(reagent.active_exposure,false);
});

test('non-drug modalities stay distinct and vague regimen names stay unresolved',()=>{
  for(const [raw,broad]of [['Surgery','surgery'],['Radiotherapy','radiotherapy'],['fecal microbiota transplantation','other']]){const value=resolver.resolve(raw);assert.equal(value.status,'non_drug');assert.equal(value.broad_category,broad);assert.equal(value.canonical_id,null);}
  for(const raw of ['standard care',"investigator's choice",'MAGE-A3 blocker','bmsca2098fc','bispecifics','systemic therapy']){const value=resolver.resolve(raw);assert.equal(value.status,'unresolved',raw);assert.equal(value.canonical_id,null);}
});

test('previous defensible broad categories remain stable independent of indication',()=>{
  for(const [raw,id,broad]of [['lifileucel','lifileucel','cell-therapies'],['afamitresgene autoleucel','afamitresgene_autoleucel','cell-therapies'],['sipuleucel-T','sipuleucel_T','vaccines'],['bempegaldesleukin','bempegaldesleukin','cytokines'],['nogapendekin alfa inbakicept','nogapendekin_alfa_inbakicept','cytokines'],['talimogene laherparepvec','talimogene_laherparepvec','oncolytic-viruses'],['vusolimogene oderparepvec','vusolimogene_oderparepvec','oncolytic-viruses'],['bortezomib','bortezomib','targeted'],['amivantamab','amivantamab','targeted'],['zanidatamab','zanidatamab','targeted']])resolved(raw,id,broad);
  for(const raw of ['tovorafenib','sorafenib']){const value=resolver.resolve(raw);assert.equal(value.class_id,'other-targeted');assert(!groups.memberships(raw).includes('braf'));}
});

test('previously classified generic labels retain broad classes without product assumptions',()=>{
  for(const [labels,broad]of [
    [['targeted therapy','targeted therapies','tyrosine kinase inhibitor','tyrosine kinase inhibitors','antibody-drug conjugates'],'targeted'],
    [['interferon','rhGM-CSF','granulocyte-macrophage colony-stimulating factor (GM-CSF)'],'cytokines'],
    [['gp100 vaccine','gp100 peptide vaccine','gp100:209–217(210m) peptide vaccine','vaccines'],'vaccines'],
    [['anti-PD-1 monoclonal antibody'],'ici'],[['adoptive T-cell therapy'],'cell-therapies'],
    [['Conventional chemotherapy'],'chemotherapy'],[['oncolytic virus'],'oncolytic-viruses']]){
    for(const raw of labels)generic(raw,broad);
  }
  for(const raw of ['stereotactic radiotherapy','radiosurgery','palliative stereotactic radiotherapy']){const value=resolver.resolve(raw);assert.equal(value.broad_category,'radiotherapy',raw);assert.equal(value.canonical_id,null);}
  for(const raw of ['Observation','placebo antibiotic','placebo microbiome modulation','placebo microbiome intervention']){const value=resolver.resolve(raw);assert.equal(value.status,'control',raw);assert.equal(value.active_exposure,false);assert.equal(value.canonical_id,null);}
});

test('normalization retains codes, antigen positions, formulations, slash, plus and negation',()=>{
  for(const raw of ['BMS–936559','gp100(209–217)','albumin-bound paclitaxel','PD-1/PD-L1','nivolumab + ipilimumab','No ipilimumab']){const normalized=resolver.normalize(raw);assert.equal(resolver.normalize(normalized),normalized);assert.equal(resolver.resolve(raw).raw_label,raw);}
  assert.notEqual(resolver.normalize('BMS-936558'),resolver.normalize('BMS-936559'));
  assert.notEqual(resolver.normalize('gp100(209-217)'),resolver.normalize('gp100(280-288)'));
  assert(resolver.normalize('PD-1 / PD-L1').includes('/'));assert(resolver.normalize('nivolumab + ipilimumab').includes('+'));
});

test('normalized alias collisions fail validation and remain explicit ambiguity without overwrite',()=>{
  const copy=structuredClone(registry),rival={...copy.products.find(entry=>entry.id==='bms_936559'),id:'test_collision_product',label:'Collision test product',aliases:['BMS–936558']};copy.products.push(rival);
  const checked=resolver.validateRegistry(copy);assert.equal(checked.valid,false);assert(checked.collisions.some(row=>row.normalized_alias===resolver.normalize('BMS-936558')));
  const value=resolver.create(copy).resolve('BMS-936558');assert.equal(value.status,'ambiguous');assert.equal(value.canonical_id,null);assert(value.candidates.some(row=>row.id==='nivolumab'));assert(value.candidates.some(row=>row.id==='test_collision_product'));
  assert.equal(resolver.resolve('BMS-936558').canonical_id,'nivolumab','A candidate registry must not mutate the current resolver');
});

test('registry promotion rejects inconsistent classes and missing supporting sources',()=>{
  const mismatch=structuredClone(registry);mismatch.products.find(entry=>entry.id==='nivolumab').broad_category='chemotherapy';
  assert.equal(resolver.validateRegistry(mismatch).valid,false);
  const unsupported=structuredClone(registry);unsupported.products.find(entry=>entry.id==='nivolumab').source_ids=['nonexistent-primary-source'];
  assert.equal(resolver.validateRegistry(unsupported).valid,false);
});

test('all public treatment class headings and control menus remain renderable',()=>{
  for(const entry of groups.groups)assert.doesNotThrow(()=>groups.describe(entry.label),entry.label);
  for(const raw of ['Supportive care / observation / placebo','No comparator','Single arm','Other targeted therapies','Cell therapies']){
    const options=groups.optionTree(new Map([['observed-label',raw]]));assert(options.length>0,raw);assert(options.some(entry=>entry.value==='observed-label'),raw);
  }
  const nodes=groups.optionTree(new Map([['cytokine','IL-2'],['checkpoint','PD-1/PD-L1 inhibitor']]));
  assert.equal(nodes.find(entry=>entry.class_id==='cytokines').label,'Cytokines');
  assert.equal(nodes.find(entry=>entry.class_id==='pd1-pdl1-unspecified').label,'PD-1/PD-L1 inhibitors, target/agent unspecified');
});

test('registry resolution is deterministic and does not mutate raw inputs or registry',()=>{
  const before=JSON.stringify(registry),inputs=['Kimmtrak','IL-2','BMS-936557','Ipilimumab-matched placebo','No ipilimumab','IO102/IO103','albumin-bound paclitaxel'];
  const first=inputs.map(raw=>resolver.resolve(raw)),second=inputs.map(raw=>resolver.create(registry).resolve(raw));assert.deepEqual(second,first);assert.equal(JSON.stringify(registry),before);assert(resolver.validateRegistry(registry).valid);
});

test('same-regimen alias duplicates collapse only in presentation and preserve source nodes and phases',()=>{
  const graph=(kind='AND',dose2='3 mg/kg')=>({arm_id:'A-duplicate',label:'Nivolumab and BMS-936558',root_node_id:'root',evidence_ids:['E'],nodes:[
    {node_id:'root',kind,name:null,drug_class:null,dose:null,route:null,schedule:null,children:['n1','n2'],evidence_ids:['E']},
    ...[['n1','nivolumab','3 mg/kg'],['n2','BMS-936558',dose2]].map(([node_id,name,dose])=>({node_id,kind:'drug',name,drug_class:null,dose,route:'IV',schedule:'Every 2 weeks',children:[],evidence_ids:['E']}))]});
  const raw=graph(),before=JSON.stringify(raw),definition=groups.definitionFromNative(raw),description=groups.describeDefinition(definition);
  assert.equal(description.label,'Nivolumab');assert.deepEqual(description.agent_ids,['nivolumab']);
  assert.deepEqual(definition.native_graph,raw);assert.equal(definition.root.children.length,2);assert.equal(JSON.stringify(raw),before);
  const sequential=groups.describeDefinition(groups.definitionFromNative(graph('SEQUENTIAL')));
  assert.equal(sequential.kind,'sequential');assert.equal(sequential.components.length,2);
  const doses=groups.describeDefinition(groups.definitionFromNative(graph('AND','1 mg/kg')));
  assert.equal(doses.components.length,2);assert.deepEqual(doses.components.map(part=>part.dose),['3 mg/kg','1 mg/kg']);
});

test('a whole native leaf expands only a fully recognized regimen and preserves literal provenance',()=>{
  const graph=name=>({arm_id:'A-native-leaf',label:name,root_node_id:'n',evidence_ids:['E'],nodes:[{node_id:'n',kind:'UNKNOWN',name,drug_class:null,dose:'reported dose',route:'IV',schedule:'source schedule',children:[],evidence_ids:['E']}]});
  const raw=graph('carboplatin/paclitaxel (CP)'),before=JSON.stringify(raw),definition=groups.definitionFromNative(raw),description=groups.describeDefinition(definition);
  assert.equal(description.kind,'combination');assert.deepEqual(description.agent_ids,['carboplatin','paclitaxel']);assert.equal(description.label,'Carboplatin + Paclitaxel');
  assert.deepEqual(definition.native_graph,raw);assert.equal(JSON.stringify(raw),before);
  const ambiguous=groups.describeDefinition(groups.definitionFromNative(graph('BRAF/MEK inhibitors')));
  assert.equal(ambiguous.kind,'class');assert.deepEqual(ambiguous.agent_ids,[]);assert.deepEqual(ambiguous.class_ids,['braf-mek-unspecified']);
  const malformed=groups.describeDefinition(groups.definitionFromNative(graph('BMS-936557/paclitaxel')));
  assert.equal(malformed.known,false);assert.equal(malformed.components.length,0);assert.deepEqual(malformed.agent_ids,[]);
  const forged=structuredClone(definition);forged.native_graph.nodes[0].name='nivolumab';assert.throws(()=>groups.validateDefinition(forged));
});
