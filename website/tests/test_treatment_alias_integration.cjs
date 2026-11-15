'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),groups=require('../dist/treatment_groups.js');
const labels=new Map(['nivolumab','pembrolizumab','ipilimumab','vemurafenib','encorafenib','binimetinib','imiquimod','sorafenib'].map(id=>[id,id]));
const classValue=groups.classValue;
const comparison=(control,active,extra={})=>({kind:'treatment_comparison',comparison_id:'test-comparison',
  comparator_label:control,additional_intervention_label:active,comparison_filter_eligible:true,
  comparator_filter_eligible:true,...extra});

test('obvious source aliases and routes have one display identity without changing the stored labels',()=>{
  const cases=[['Ipilimumab arm','Ipilimumab'],['VEM: vemurafenib','Vemurafenib'],
    ['Subcutaneous GM-CSF','GM-CSF'],['Topical imiquimod','Imiquimod'],
    ['Topical imiquimod cream','Imiquimod'],['Randomized blinded sorafenib','Sorafenib']];
  for(const[raw,canonical]of cases){
    const c=comparison(raw,raw),before=JSON.stringify(c);
    assert.equal(charts.comparatorDisplayLabel(c),canonical,raw);
    assert.equal(charts.comparatorKey(c),charts.comparatorKey(comparison(canonical,canonical)),raw);
    assert.equal(charts.interventionPresentation(c,labels).label,canonical,raw);
    assert.equal(charts.interventionPresentation(c,labels).is_add_on,false,raw);
    assert.equal(JSON.stringify(c),before);
  }
  const gm=charts.regimenDescription('Subcutaneous GM-CSF');
  assert.equal(gm.agent_ids.includes('sargramostim'),false);
  assert.equal(gm.agent_ids.includes('molgramostim'),false);
});

// Finite actual source labels/identities from the merged public dataset, checked
// 2026-11-03. Display aliases do not convert replacement therapy into add-on therapy.
test('actual arm, abbreviated regimen and route labels preserve replacement-treatment relationships',()=>{
  const cases=[
    {pmid:'36197494',id:'CMP-6ace6e7ed290c1dc8b2713c1',control:'Ipilimumab arm',active:'Nivolumab arm',
      display_control:'Ipilimumab',display_active:'Nivolumab'},
    {pmid:'31901705',id:'CE-1408afc90cb673b6d891ddc0-C-ddf4c397c6522c34',control:'VEM: vemurafenib',
      active:'COMBO450: encorafenib plus binimetinib',display_control:'Vemurafenib',display_active:'Encorafenib + Binimetinib'},
    {pmid:'26014293',id:'CE-b4944e2a4a297dc41cd8a43f-C-1418ce7dcad77362',control:'Subcutaneous GM-CSF',
      active:'Intralesional T-VEC',display_control:'GM-CSF',display_active:'Talimogene laherparepvec'},
    {pmid:'41362626',id:'CE-30a2b5dce2022c02fc0d8104-C-eaa9569322c68682',control:'Randomized blinded placebo',
      active:'Randomized blinded sorafenib',display_control:'Best supportive care / observation / placebo',display_active:'Sorafenib'}
  ];
  for(const row of cases){
    const c=comparison(row.control,row.active,{comparison_id:row.id,
      comparator_arms:[{source_arm:{label:{status:'reported',text:row.control,evidence_ids:['owned-control-evidence']}}}],
      intervention_arms:[{source_arm:{label:{status:'reported',text:row.active,evidence_ids:['owned-active-evidence']}}}],
      direction_basis:'Explicit own-version experimental/comparator arm roles'}),before=JSON.stringify(c);
    assert.equal(charts.comparatorDisplayLabel(c),row.display_control,row.pmid);
    const active=charts.interventionPresentation(c,labels);
    assert.equal(active.label,row.display_active,row.pmid);assert.equal(active.is_add_on,false,row.pmid);
    assert.equal(JSON.stringify(c),before,row.pmid);
  }
});

test('explicit named combination immunotherapy is itemized with plus while a single-arm regimen stays non-add-on',()=>{
  for(const raw of ['Nivolumab plus ipilimumab combination immunotherapy','Ipilimumab plus nivolumab combination immunotherapy']){
    const c=comparison(null,raw,{kind:'single_arm',comparator_key:'__single_arm__'}),before=JSON.stringify(c);
    const active=charts.interventionPresentation(c,labels),d=charts.regimenDescription(active.label);
    assert.equal(d.kind,'combination');assert.equal(d.known,true);
    assert.deepEqual([...d.agent_ids].sort(),['ipilimumab','nivolumab']);
    assert.match(active.label,/ \+ /);assert.doesNotMatch(active.label,/combination immunotherapy/i);
    assert.equal(active.is_add_on,false);assert.equal(JSON.stringify(c),before);
  }
  // PMID42358556: the own-arm label and typed drug components establish the
  // two drugs; route/concentration details remain in the original source object.
  const c=comparison(null,null,{kind:'single_arm',comparison_id:'CMP-94ae1000d7058436e0b5a6b0',
    intervention_arms:[{source_arm:{role:'experimental',label:{text:'Topical imiquimod plus intravenous pembrolizumab'},
      components:[{drug:{text:'imiquimod'},dose:{value:5,unit:'%',raw_text:'5'},route:{text:'topically'}},
        {drug:{text:'pembrolizumab'},route:{text:'intravenously'}}]}}]});
  const before=JSON.stringify(c),active=charts.interventionPresentation(c,labels);
  assert.equal(active.label,'Imiquimod + Pembrolizumab');assert.equal(active.is_add_on,false);
  assert.equal(JSON.stringify(c),before);
});

test('OR evidence is selectable through either named agent without becoming simultaneous or add-on treatment',()=>{
  const raw='Anti-PD-1 monotherapy: nivolumab or pembrolizumab',d=charts.regimenDescription(raw);
  assert.equal(d.kind,'alternative');assert.equal(d.known,true);assert.match(d.label,/ or /);
  assert.doesNotMatch(d.label,/ \+ /);
  for(const id of ['agent:nivolumab','agent:pembrolizumab','pd1'])
    assert.equal(charts.treatmentSelectionMatches('intervention:'+d.key,d.label,classValue(id)),true,id);
  assert.equal(charts.treatmentSelectionMatches('intervention:'+d.key,d.label,classValue('ctla4')),false);
  const mixed=charts.regimenDescription('Nivolumab or ipilimumab');
  assert.equal(mixed.kind,'alternative');assert.match(mixed.label,/ or /);
  for(const id of ['agent:nivolumab','agent:ipilimumab','pd1','ctla4','immune'])
    assert.equal(charts.treatmentSelectionMatches('intervention:'+mixed.key,mixed.label,classValue(id)),true,id);
  assert.equal(groups.matchesClass(mixed,'combinations'),false);
  const c=comparison(raw,'Dabrafenib + trametinib',{
    scope:{record_kind:'canonical_review_scope',review_binding_sha256:'a'.repeat(64),source_input_sha256:'b'.repeat(64)}});
  assert.equal(charts.interventionPresentation(c,labels).is_add_on,false);
  const activeAlternative=comparison('Nivolumab',raw,{
    scope:{record_kind:'canonical_review_scope',review_binding_sha256:'a'.repeat(64),source_input_sha256:'b'.repeat(64)}});
  assert.equal(charts.interventionPresentation(activeAlternative,labels).is_add_on,false);
});

test('generic other-treatment and single-arm menu labels never create a named co-treatment or add-on proof',()=>{
  const none=charts.regimenDescription('No comparator with other treatments');
  assert.equal(none.label,'No comparator');assert.equal(none.kind,'class');
  assert.deepEqual(none.agent_ids,[]);assert.equal(groups.matchesClass(none,'combinations'),false);
  const unspecified=charts.regimenDescription('Immune checkpoint inhibitors with other treatments');
  assert.deepEqual(unspecified.agent_ids,[]);assert.equal(unspecified.known,false);
  assert.equal(charts.treatmentSelectionMatches('test',unspecified.label,classValue('immune')),true);
  const c=comparison('Nivolumab','Immune checkpoint inhibitors with other treatments',{
    scope:{record_kind:'canonical_review_scope',review_binding_sha256:'a'.repeat(64),source_input_sha256:'b'.repeat(64)}});
  assert.equal(charts.interventionPresentation(c,labels).is_add_on,false);
});

test('ICI filters and standalone non-ICI immunotherapy categories follow their displayed meanings',()=>{
  for(const label of ['Nivolumab','Ipilimumab','PD-1 inhibitor'])
    assert.equal(charts.treatmentSelectionMatches('test',label,classValue('immune')),true,label);
  for(const label of ['Imiquimod','GM-CSF','CSF-470 cellular vaccine','Autologous TIL infusion'])
    assert.equal(charts.treatmentSelectionMatches('test',label,classValue('immune')),false,label);
  assert.equal(charts.treatmentSelectionMatches('test','Imiquimod',classValue('other-immunotherapy')),true);
  assert.equal(charts.treatmentSelectionMatches('test','Nivolumab',classValue('other-immunotherapy')),false);
  assert.equal(charts.treatmentSelectionMatches('test','GM-CSF',classValue('cytokines')),true);
  assert.equal(charts.treatmentSelectionMatches('test','CSF-470 cellular vaccine',classValue('vaccines')),true);
});

test('unknown OR source labels and hidden aliases retain their original selectable values',()=>{
  const raw=[
    ["Physician's choice of dacarbazine or temozolomide chemotherapy",'23295794'],
    ['Melanoma single-agent anti-PD-1 treatment (nivolumab or pembrolizumab)','28595336'],
    ['MAPK inhibitor-treated cohort; BRAF inhibitors alone or combined with MEK inhibitors','30399176'],
    ['Therapy discontinued for reasons other than progression or toxicity','34065877'],
    ['FAP-IL2v plus pembrolizumab; pooled or unspecified schedule','39895413']
  ];
  const comparisons=raw.map(([label,pmid],i)=>comparison(null,label,{kind:'single_arm',comparison_id:'availability-'+pmid+'-'+i}));
  comparisons.push(comparison(null,'Nivolumab',{kind:'single_arm',comparison_id:'availability-known-alias'}));
  const before=JSON.stringify(comparisons),entries=charts.interventionGroupLabels(comparisons,labels),tree=groups.optionTree(entries);
  for(const[value,label]of entries)assert(tree.some(row=>row.value===value),label);
  assert(tree.some(row=>row.value===classValue('alternatives')));
  for(const row of tree.filter(row=>row.hidden===true)){
    assert(tree.some(parent=>parent.value===classValue(row.class_id)),row.label);
    assert(groups.matchesClass(entries.get(row.value),row.class_id),row.label);
  }
  assert.equal(JSON.stringify(comparisons),before);
});

test('alias browsing preserves result ownership, numerical wrappers and historical or unsupported components',()=>{
  const c=comparison('Ipilimumab arm','Nivolumab arm',{comparison_id:'display-C',result_ids:['display-R'],
    comparator_arms:[{source_arm:{label:'Ipilimumab arm'}}],intervention_arms:[{source_arm:{label:'Nivolumab arm'}}],
    direction_basis:'Explicit owned experimental/comparator roles'});
  // Numerical sentinels test display conservation only; they are not study facts.
  const row={result_id:'display-R',comparison_id:'display-C',source_extraction_ids:['source-F'],
    endpoint:{family:'overall_survival'},measure:'HR',main_result_eligible:true,pooling_eligible:false,
    estimate:{status:'reported',value:.75,raw_text:'0.75'},ci_lower:{status:'reported',value:.5},ci_upper:{status:'reported',value:1.1},
    reported_numbers:[{role:'estimate',value:.75,qualifier:'equal',evidence_ids:['source-E']}],analysis_n:null};
  const study={report_id:'test-report',default_visible:true,current_main_eligible:true,comparisons:[c],details:{quantitative_results:[row]}},before=JSON.stringify(study);
  for(const selected of ['agent:ipilimumab','ctla4']){
    const match=charts.filterStudies([study],{comparator:classValue(selected),endpoint:'overall_survival',measure:'HR'})[0];
    assert(match);const rows=charts.studyTreatmentRows(match,labels);
    assert.equal(rows.length,1);assert.deepEqual(rows[0].results,[row]);
    assert.deepEqual(rows[0].comparisons,[c]);assert.equal(rows[0].is_add_on,false);
  }
  assert.equal(JSON.stringify(study),before);
  const genericSequence=charts.regimenDescription('Oral temozolomide followed by subcutaneous GM-CSF, interferon-alfa and recombinant interleukin-2');
  assert.equal(genericSequence.known,true);assert.equal(genericSequence.kind,'sequential');assert.equal(genericSequence.simple_concurrent,false);
  assert.deepEqual(genericSequence.agent_ids,['temozolomide']);assert(genericSequence.class_ids.includes('cytokines'));
  for(const raw of ['Vemurafenib followed by ipilimumab, with subsequent vemurafenib after progression']){
    const d=charts.regimenDescription(raw);assert.equal(d.known,false,raw);assert.equal(d.kind,'sequential',raw);
    assert.equal(d.simple_concurrent,false);assert(d.agent_ids.length);
  }
  const sequence=charts.regimenDescription('Topical imiquimod followed by pembrolizumab');
  assert.equal(sequence.kind,'sequential');assert.deepEqual(sequence.agent_ids,['imiquimod','pembrolizumab']);
  const negated=charts.regimenDescription('Not treated with nivolumab');
  assert.equal(negated.kind,'context');assert.deepEqual(negated.agent_ids,[]);
  const unknown=comparison('Nivolumab (unidentified co-treatment)','Nivolumab + ipilimumab',{
    comparator_drug_ids:['nivolumab'],compact_display_comparator_label:'nivolumab',
    comparator_arms:[{source_arm:{label:'Nivolumab (unidentified co-treatment)'}}],
    intervention_arms:[{source_arm:{label:'Nivolumab + ipilimumab'}}],direction_basis:'Source-reported roles'});
  assert.equal(charts.interventionPresentation(unknown,labels).is_add_on,false);
  assert.match(charts.comparatorDisplayLabel(unknown),/unidentified co-treatment/);
  for(const raw of ['VEM: unknown investigational agent','Nivolumab arm in combination with unknown rescue agent'])
    assert.equal(charts.regimenDescription(raw).known,false,raw);
});
