'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),rules=require('../dist/regimen_source_rules.js');
const labels=new Map(['nivolumab','pembrolizumab','ipilimumab','dacarbazine','carboplatin','paclitaxel','bevacizumab'].map(id=>[id,id]));

// Exact public comparison identities audited against the three primary reports.
// The constants specify display relationships, not reconstructed treatment graphs.
const factorial={report:'report-020c0a6128b8320e3aeaae9b',sources:[
  ['a79d3b7664bf7919abe9213186edf6da784754a58ef5dabbb9fde8f3d665f45e','CE-c57c61a8ae62dec9915cb3b6-C-',[
    ['1e8549ee2f019c05','fm'],['a87692a323ac9511','fm'],['ddfab09e227b2092','fm'],
    ['34b11b7f42251ea5','ifn'],['2b8dde63a3fd4182','ifn'],['136fad156c7edd09','ifn']]],
  ['9b84eef27674fbbe4ab75a2508e14d4adc803b6873dc4da07a8b7a916ebeb09d','CE-5f915ff1bd02afd837a3ca1b-C-',[
    ['b6f22e78ce0517e1','fm'],['7277d79bedc8deb7','fm'],['ccd14b381edadb35','fm'],['8c65f323cc163b79','fm'],
    ['8a1a9cf32c12b594','ifn'],['b2166f08eaf6a588','ifn'],['217e18e41b5afe7c','ifn'],['9e4e6ea04ac933c3','ifn']]]
]};
const expected={
  fm:{comparator:'Dacarbazine ± Interferon alfa-2b',intervention:'Fotemustine',addon:true},
  ifn:{comparator:'Dacarbazine ± Fotemustine',intervention:'Interferon alfa-2b',addon:true},
  adoreg:{comparator:'Nivolumab or Pembrolizumab',intervention:'Dabrafenib + Trametinib',addon:false},
  beam:{comparator:'Carboplatin + Paclitaxel(+placebo)',intervention:'Bevacizumab',addon:true}
};
function bound(report,source,id,version){return {kind:'treatment_comparison',comparison_id:id,
  scope:{report_id:report,source_input_sha256:source,...(version?{source_version_sha256:version}:{})},
  comparator_label:'Uncorrected saved arm label',additional_intervention_label:'Uncorrected saved intervention',
  comparator_filter_eligible:true,comparison_filter_eligible:true,result_ids:[]};}
const finite=[];
for(const[source,prefix,ids]of factorial.sources)for(const[id,type]of ids)finite.push({type,comparison:bound(factorial.report,source,prefix+id)});
for(const[source,ids]of [
  ['d1c60324e2f953caae0192d8e6378ab149c0f031bdb3e78f7d98ff0e778b66b3',['CE-530aa66df1d30be83d3594d6-C-5f4e7668d5796e44']],
  ['a8e20d7fcca76f40af62be41c157c9543faccc93428ee9dc945012ada63a5505',['CE-a48d6a5186c2bc3f22c693cf-C-d0e701e0e97923e4','CE-a48d6a5186c2bc3f22c693cf-C-11461ea98a1629aa']]
])for(const id of ids)finite.push({type:'adoreg',comparison:bound('report-8f9c9565ea8feed6d81f0128',source,id)});
for(const[source,version,ids]of [
  ['950e1d7f9ed044b10bcb051a55a4adb1698c8317de70fdd85e97cf42f815db61','a74da8859aa981a66390d3063802a4453e885b37adf09ab8b1032295ff7b2c1f',[
    'CMP-d50228f5cc37dbb01b101d18','CMP-7342ac1d41f17772435f0829','CMP-f44c0a4a163858a6bc3bab13','CMP-e9de104deab2d072d5b64678','CMP-dd3048dfbbb87199f99e9a77','CMP-d2143558baf0f280f0a19a2a']],
  ['2cd2546ca19b1b2a4ce83d29cc3e62c30d6dbf269f8816193655e25712cf601d','f91fcc91e141d8a8d828a8d82bf763f41dcaabd42ec9301f38374f7a50c2a2bd',[
    'CMP-fae7935f9685e1561a1531e6','CMP-0988661533c6fbfaf5849034','CMP-22922d949a0d4fb54b7f1ec1',
    'CMP-723b846f05249758bae7dae9','CMP-5aa8765368f8dd4385e602cd']]
])for(const id of ids)finite.push({type:'beam',comparison:bound('report-89456f77b6839e3280989e69',source,id,version)});

test('all finite source-bound pooled, upfront-cohort and BEAM relationships have the primary-source baseline and direction',()=>{
  assert.equal(finite.length,28);
  for(const{type,comparison}of finite){
    const before=JSON.stringify(comparison),want=expected[type],rule=rules.lookup(comparison);
    assert(rule,comparison.comparison_id);
    assert.equal(charts.comparatorDisplayLabel(comparison, id=>labels.get(id)||id),want.comparator);
    const intervention=charts.interventionPresentation(comparison,labels);
    assert.equal(intervention.label,want.intervention);
    assert.equal(intervention.is_add_on,want.addon);
    assert.match(intervention.source_url,/^https:\/\/pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC\d+\/$/);
    assert.equal(JSON.stringify(comparison),before);
  }
});

test('source rules cannot match a different source, comparison, report, BEAM version or single-arm record',()=>{
  for(const{comparison:c}of finite){
    for(const changed of [{...c,scope:{...c.scope,report_id:'report-other'}},{...c,scope:{...c.scope,source_input_sha256:'0'.repeat(64)}},
      {...c,comparison_id:c.comparison_id+'other'},{...c,kind:'single_arm'},
      {...c,scope:{pmid:'23402397'}}])assert.equal(rules.lookup(changed),null);
    if(c.scope.source_version_sha256){
      assert.equal(rules.lookup({...c,scope:{...c.scope,source_version_sha256:'0'.repeat(64)}}),null);
      const scope={...c.scope};delete scope.source_version_sha256;assert.equal(rules.lookup({...c,scope}),null);
    }
  }
  assert.equal(rules.lookup(null),null);assert.equal(rules.lookup({pmid:'23402397'}),null);
});

function owned(control,active,extra={}){return {kind:'treatment_comparison',comparison_id:'owned-comparison',
  comparator_label:'Truncated reported label',additional_intervention_label:'Truncated intervention label',
  comparator_arms:[{arm_id:'control',source_arm:{entity_id:'own:control',label:control}}],
  intervention_arms:[{arm_id:'active',source_arm:{entity_id:'own:active',label:active}}],
  direction_basis:'Source-reported experimental arm relative to comparator',
  comparator_filter_eligible:true,comparison_filter_eligible:true,...extra};}

test('a source-owned complete shared backbone establishes only the added active agent',()=>{
  const c=owned('Nivolumab','Nivolumab + ipilimumab'),before=JSON.stringify(c);
  assert.equal(charts.comparatorDisplayLabel(c),'Nivolumab');
  assert.equal(charts.interventionPresentation(c,labels).label,'Ipilimumab');
  assert.equal(charts.interventionPresentation(c,labels).is_add_on,true);
  assert.equal(JSON.stringify(c),before);
  const beam=owned('Carboplatin + paclitaxel (+ placebo)','Carboplatin + paclitaxel + bevacizumab');
  assert.equal(charts.comparatorDisplayLabel(beam),'Carboplatin + Paclitaxel(+placebo)');
  assert.equal(charts.interventionPresentation(beam,labels).label,'Bevacizumab');
  assert.equal(charts.interventionPresentation(beam,labels).is_add_on,true);
});

test('replacement, alternative, single-arm, unowned and incomplete regimens never acquire add-on status',()=>{
  const cases=[
    owned('Nivolumab','Dabrafenib + trametinib'),
    owned('Nivolumab + ipilimumab','Nivolumab'),
    owned('Nivolumab','Nivolumab or pembrolizumab'),
    owned('Nivolumab','Nivolumab + ipilimumab',{kind:'single_arm',comparator_key:'__single_arm__'}),
    owned('Nivolumab','Nivolumab + unknown investigational agent'),
    owned('Anti-PD1 agents','Anti-PD1 agents + ipilimumab'),
    {kind:'treatment_comparison',comparator_label:'Nivolumab',additional_intervention_label:'Nivolumab + ipilimumab'},
    owned('Nivolumab','Nivolumab + ipilimumab',{comparison_filter_eligible:false})
  ];
  for(const c of cases)assert.equal(charts.interventionPresentation(c,labels).is_add_on,false,JSON.stringify(c));
  const unknown=cases[4];unknown.intervention_arms[0].compact_label='Nivolumab';
  assert.match(charts.interventionPresentation(unknown,labels).label,/unknown investigational agent/);
});

test('partial catalog IDs cannot erase source-owned sequential or unidentified comparator components',()=>{
  for(const text of ['Nivolumab followed by unknown rescue agent','Nivolumab (unidentified co-treatment)']){
    const c=owned(text,'Nivolumab + ipilimumab',{
      comparator_drug_ids:['nivolumab'],compact_display_comparator_label:'nivolumab'
    }),before=JSON.stringify(c);
    assert.match(charts.comparatorDisplayLabel(c),/unknown rescue agent|unidentified co-treatment/);
    assert.notEqual(charts.comparatorDisplayLabel(c),'Nivolumab');
    assert.equal(charts.interventionPresentation(c,labels).is_add_on,false);
    assert.equal(charts.interventionPresentation(c,labels).label,'Nivolumab + Ipilimumab');
    assert.equal(JSON.stringify(c),before);
  }
});

test('distinct source-owned pooled arms remain alternatives rather than an invented concurrent regimen',()=>{
  const c=owned('Nivolumab','Ipilimumab');
  c.comparator_arms.push({source_arm:{label:'Pembrolizumab'}});
  assert.equal(charts.comparatorDisplayLabel(c),'Nivolumab or Pembrolizumab');
  assert.equal(charts.interventionPresentation(c,labels).is_add_on,false);
});

test('table groups link exact result IDs and comparison IDs without exchanging the two factorial contrasts',()=>{
  const fm=structuredClone(finite.find(x=>x.type==='fm').comparison),ifn=structuredClone(finite.find(x=>x.type==='ifn').comparison);
  const fmId='CE-c57c61a8ae62dec9915cb3b6-F-365e8b9c95805178',ifnId='CE-c57c61a8ae62dec9915cb3b6-F-1a55f18cd450f9e6';
  fm.result_ids=[fmId];ifn.result_ids=[ifnId];
  const result=(id,comparison_id,value,lo,hi)=>({result_id:id,comparison_id,endpoint:{family:'overall_survival'},measure:'HR',
    estimate:{status:'reported',value},ci_lower:{status:'reported',value:lo},ci_upper:{status:'reported',value:hi},
    source_reported_numbers:[{role:'estimate',value},{role:'ci_lower',value:lo},{role:'ci_upper',value:hi}],
    analysis_n:null,main_result_eligible:true,pooling_eligible:false});
  const results=[result(fmId,fm.comparison_id,.93,.71,1.21),result(ifnId,ifn.comparison_id,.92,.70,1.20),
    {...result('canonical-fm',null,.93,.71,1.21),source_extraction_ids:[fmId]},
    result('unassigned-result','another-comparison',.8,.6,1.1)];
  const study={report_id:factorial.report,default_visible:true,current_main_eligible:true,comparisons:[fm,ifn],details:{quantitative_results:results}};
  const before=JSON.stringify(study),match=charts.filterStudies([study],{endpoint:'overall_survival',measure:'HR'})[0];
  assert(match);const rows=charts.studyTreatmentRows(match,labels);
  const fmRow=rows.find(row=>row.intervention_label==='Fotemustine'),ifnRow=rows.find(row=>row.intervention_label==='Interferon alfa-2b');
  assert.deepEqual(fmRow.comparisons.map(c=>c.comparison_id),[fm.comparison_id]);
  assert.deepEqual(fmRow.results.map(r=>r.result_id).sort(),[fmId,'canonical-fm'].sort());
  assert.deepEqual(ifnRow.results.map(r=>r.result_id),[ifnId]);
  assert.equal(fmRow.comparator_label,'Dacarbazine ± Interferon alfa-2b');
  assert.equal(ifnRow.comparator_label,'Dacarbazine ± Fotemustine');
  assert.deepEqual(rows.find(row=>row.comparator_label==='—').results.map(r=>r.result_id),['unassigned-result']);
  assert.deepEqual(fmRow.results.find(r=>r.result_id===fmId).estimate,{status:'reported',value:.93});
  assert.equal(ifnRow.results[0].analysis_n,null);assert.equal(ifnRow.results[0].pooling_eligible,false);
  assert.equal(JSON.stringify(study),before);
});

test('BEAM LDH subgroup treatment effects retain separate endpoint rows and source-reported HR direction',()=>{
  const cases=[
    ['CMP-723b846f05249758bae7dae9','NEW-R-e91a022bda2b36275cf9312e','pfs','progression_free_survival',.62],
    ['CMP-5aa8765368f8dd4385e602cd','NEW-R-a567164b47bc7a0a141f6d36','os','overall_survival',.52]
  ];
  const comparisons=[],results=[];
  for(const[id,result_id,endpoint_id,family,value]of cases){
    const c=structuredClone(finite.find(x=>x.comparison.comparison_id===id).comparison);
    Object.assign(c.scope,{population_id:'ldh',endpoint_id});c.result_ids=[result_id];
    Object.assign(c,{comparator_arms:[{source_arm:{arm_id:'cp',role:'comparator',label:{text:'Carboplatin, paclitaxel and placebo (CP)'}}}],
      intervention_arms:[{source_arm:{arm_id:'cpb',role:'experimental',label:{text:'Carboplatin, paclitaxel and bevacizumab (CPB)'}}}]});
    comparisons.push(c);results.push({result_id,comparison_id:id,endpoint:{endpoint_id,family},measure:'HR',
      population:{population_id:'ldh',description:{text:'Elevated serum lactate dehydrogenase subgroup'}},
      estimate:{status:'reported',role:'estimate',value,raw_text:String(value)},
      analysis:{contrast_type:'treatment_comparison',experimental_arm_ids:['cpb'],comparator_arm_ids:['cp'],
        data_cutoff:{status:'not_reported',text:null}},main_result_eligible:true,pooling_eligible:false});
  }
  const study={report_id:'report-89456f77b6839e3280989e69',pmid:'22124101',default_visible:true,current_main_eligible:true,
    comparisons,details:{quantitative_results:results}},before=JSON.stringify(study);
  for(const[,result_id,,endpoint,value]of cases){
    const match=charts.filterStudies([study],{endpoint,measure:'HR'})[0],rows=charts.studyTreatmentRows(match,labels);
    assert.equal(rows.length,1);assert.equal(rows[0].comparator_label,expected.beam.comparator);
    assert.equal(rows[0].intervention_label,'Bevacizumab');assert.equal(rows[0].is_add_on,true);
    assert.deepEqual(rows[0].results.map(r=>r.result_id),[result_id]);
    assert.equal(rows[0].results[0].estimate.value,value);
    assert.equal(rows[0].results[0].population.population_id,'ldh');
    assert.deepEqual(rows[0].results[0].analysis.experimental_arm_ids,['cpb']);
    assert.deepEqual(rows[0].results[0].analysis.comparator_arm_ids,['cp']);
    assert.deepEqual(rows[0].results[0].analysis.data_cutoff,{status:'not_reported',text:null});
  }
  assert.equal(JSON.stringify(study),before);
});
