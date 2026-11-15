'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js'),regimens=require('../dist/regimen_definitions.js'),advanced=require('../dist/advanced_filters.js');
const fixture=require('../../data/audits/advanced_filters_20261108/current_integration_fixture.json');
const classifications=require('../dist/data/clinical_classifications.json');
const raw=new Map(fixture.articles.map(article=>[article.pmid,article.records]));
const merged=clinical.merge([],{}, {...fixture.clinical_meta,articles:fixture.clinical,evidence_registry:fixture.evidence_registry});
const studies=regimens.prepareStudies(merged.studies.map(study=>({...study,quantitative_only:true,details:{...study.details,quantitative_extraction:raw.get(study.pmid)}})));
const base={evidence_registry:merged.evidence_registry,clinical_classifications:classifications,clinical_content_sha256:fixture.clinical_meta.content_sha256};
const options={registry:merged.evidence_registry,classifications,clinical_content_sha256:fixture.clinical_meta.content_sha256};
const matches=(state={},extra={})=>charts.filterStudies(studies,{...base,...extra,advanced:state});
const study=(rows,pmid)=>rows.find(match=>match.study.pmid===pmid);
const key=row=>JSON.stringify([row.source_input_sha256,row.review_binding_sha256,row.result_id]);
const profile=row=>advanced.resultClassification(row,options);

test('All advanced selections preserve the exact current source projection and CSV',()=>{
  const old=charts.filterStudies(studies,base),next=matches(advanced.resetSelections());
  assert.deepEqual(next,old);
  assert.equal(charts.studyTableCSV(next,{registry:merged.evidence_registry}),charts.studyTableCSV(old,{registry:merged.evidence_registry}));
});

test('actual NADINA comparative HR retains both treatment settings and both arms',()=>{
  const ordinary=study(matches(),'38828984');
  const cross=ordinary.results.filter(row=>profile(row)?.cross_setting_comparison===true);
  assert(cross.some(row=>charts.displayMeasure(row)==='HR'));
  for(const setting of ['neoadjuvant_perioperative','adjuvant_resected']){
    const selected=study(matches({setting}),'38828984');assert(selected);
    for(const row of cross){
      assert(selected.results.some(value=>key(value)===key(row)));
      const comparison=selected.comparisons.find(value=>value.comparison_id===row.comparison_id);
      assert(comparison,'A cross-setting comparison must keep its complete treatment contrast');
      assert(Object.keys(profile(row).arm_settings).length===2);
    }
    const group=charts.studyTablePresentationRows(selected,{registry:merged.evidence_registry}).find(group=>group.results.some(row=>cross.some(value=>key(value)===key(row))));assert(group);
    const tags=charts.advancedArmSettings(selected,group);
    assert.equal(tags.comparator,'Adjuvant after complete resection');assert.equal(tags.intervention,'Neoadjuvant/perioperative');
    const csv=charts.studyTableCSV([selected],{registry:merged.evidence_registry});
    assert.match(csv,/Adjuvant after complete resection/);assert.match(csv,/Neoadjuvant\/perioperative/);
  }
});

test('an arm-specific S1801 setting cannot bring back another arm sample count',()=>{
  for(const setting of ['neoadjuvant_perioperative','adjuvant_resected']){
    const selected=study(matches({setting}),'36856617');assert(selected);
    assert(selected.results.length>0);
    for(const row of selected.results)assert(profile(row).fields.setting.categories.includes(setting));
    for(const sample of selected.study.details.sample_size_records||[])assert(advanced.sampleMatches(sample,selected,{setting}));
    assert.equal(selected.source_study,study(matches(),'36856617').study);
  }
});

test('resected stage IV CheckMate 915 is adjuvant and advanced-line is inapplicable',()=>{
  assert(study(matches({setting:'adjuvant_resected'}),'36162037'));
  assert.equal(study(matches({setting:'unresectable_metastatic'}),'36162037'),undefined);
  assert.equal(study(matches({setting:'adjuvant_resected',advanced_line:'first_line'}),'36162037'),undefined);
  assert.equal(study(matches({setting:'adjuvant_resected',advanced_line:'second_or_later'}),'36162037'),undefined);
});

test('actual selected results satisfy every advanced field on the same population',()=>{
  for(const state of [{braf:'mutated',baseline_ldh:'elevated'},{subtype:'uveal',advanced_line:'second_or_later'},{setting:'adjuvant_resected',braf:'wild_type'}]){
    for(const match of matches(state))for(const row of match.results){
      assert(advanced.resultMatches(row,state,options));
      assert.equal(row.population_id,profile(row).population_id);
      for(const [field,value]of Object.entries(state))assert(profile(row).fields[field].categories.includes(value));
    }
  }
});

test('source-defined uveal cohort is selectable without homogenizing mixed treatment history',()=>{
  const selected=study(matches({subtype:'uveal'}),'38844408');assert(selected&&selected.results.length);
  for(const row of selected.results)assert.deepEqual(profile(row).fields.subtype.categories,['uveal']);
  assert.equal(study(matches({subtype:'cutaneous'}),'38844408'),undefined);
  assert.equal(study(matches({subtype:'uveal',advanced_line:'first_line'}),'38844408'),undefined);
  assert.equal(study(matches({subtype:'uveal',advanced_line:'second_or_later'}),'38844408'),undefined);
});

test('SECOMBIT LDH subgroup inherits only source-proven whole-trial BRAF and first-line facts',()=>{
  for(const baseline_ldh of ['normal','elevated']){
    const selected=study(matches({braf:'mutated',advanced_line:'first_line',baseline_ldh}),'38167503');
    assert(selected&&selected.results.length);
    for(const row of selected.results){
      const fields=profile(row).fields;
      assert.deepEqual(fields.braf.categories,['mutated']);assert.deepEqual(fields.advanced_line.categories,['first_line']);
      assert.deepEqual(fields.baseline_ldh.categories,[baseline_ldh]);
      assert.match(row.quantitative_record.population_id,/ldh/);
    }
  }
  assert.equal(study(matches({braf:'wild_type'}),'38167503'),undefined);
});

test('missing classifications and retired active choices fail closed without changing source studies',()=>{
  const before=JSON.stringify(studies);
  assert.equal(matches({braf:'retired-braf-value'}).length,0);
  assert.equal(charts.filterStudies(studies,{...base,clinical_classifications:null,advanced:{subtype:'uveal'}}).length,0);
  assert.equal(charts.filterStudies(studies,{...base,clinical_content_sha256:'changed',advanced:{subtype:'uveal'}}).length,0);
  assert.equal(JSON.stringify(studies),before);
});

test('current count contract does not count ORR percentages as comparative RR',()=>{
  const selection={...base,endpoint:'response',measure:'RR'},rows=charts.filterStudies(studies,selection);
  const opts=charts.advancedAnalysisOptions(selection,{classifications,registry:merged.evidence_registry});
  for(const match of rows)for(const row of match.results)if(charts.displayMeasure(row)!=='RR')assert.equal(opts.countEligible(row,match,profile(row)),false);
});

test('a valid ordinary RFS HR is usable even when no special N correction is necessary',()=>{
  const selection={...base,endpoint:'recurrence',measure:'HR'},rows=charts.filterStudies(studies,selection);
  const match=study(rows,'36162037'),row=match.results.find(row=>row.review_stage==='R3'&&row.quantitative_record?.id==='e1');assert(row);
  const opts=charts.advancedAnalysisOptions(selection,{classifications,registry:merged.evidence_registry});
  assert.equal(opts.countEligible(row,match,profile(row)),true);
});
