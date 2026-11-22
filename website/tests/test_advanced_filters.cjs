const test=require('node:test');
const assert=require('node:assert/strict');
const filters=require('../dist/advanced_filters.js');

function fixture(specs){
  const matches=[],artifact={schema_version:1,classification_version:'1.0.0',source_file_sha256:'source',clinical_content_sha256:'clinical',results:{},evidence_registry:{}};
  for(let i=0;i<specs.length;i++){
    const spec=specs[i],pmid=String(spec.pmid||i+1),id='result-'+i,source='source-'+pmid,binding='binding-'+pmid,pop=spec.population||'population-'+i,anchor='anchor-'+i;
    const row={pmid,report_id:'report-'+pmid,result_id:id,source_input_sha256:source,review_binding_sha256:binding,population_id:pop,comparison_id:'comparison-'+i,measure:spec.measure||'HR',estimate:{value:.7},quantitative_record:{id:'q'+i,population_id:pop,endpoint:'OS',endpoint_definition:'Overall survival',measure:spec.measure||'HR',intervention_arm_id:'a',reference_arm_id:'b',model:'Cox',...spec.q}};
    const fields={};for(const {key}of filters.definitions)fields[key]={status:spec[key]?.status||(!spec[key]?'NA':'supported'),categories:typeof spec[key]==='string'?[spec[key]]:spec[key]?.categories||[],evidence_ids:[anchor],reason:null};
    const entry={pmid,result_id:id,source_input_sha256:source,review_binding_sha256:binding,population_id:pop,raw_population_id:pop,fields,arm_settings:spec.arm_settings||[],cross_setting_comparison:spec.cross_setting===true,
      independence:{verified:spec.verified!==false,cohort_ids:spec.cohorts||['trial:'+pmid],overlap_ids:spec.overlap||[],evidence_ids:[anchor]}};
    artifact.results[id]=entry;artifact.evidence_registry[anchor]={source_id:'report-'+pmid+':main',block_id:'b1',supporting_quote:'Source-supported population and own trial.'};
    matches.push({study:{pmid,report_id:'report-'+pmid},results:[row],comparisons:[{comparison_id:row.comparison_id,result_ids:[id],comparator_id:'control',intervention_id:'drug',arms:['control','drug']}]});
  }
  return {matches,options:{classifications:artifact,analysis:{measure:'HR'}},artifact};
}
const repeat=(n,spec)=>Array.from({length:n},()=>({...spec}));
const facet=(f,state,key)=>filters.facets(f.matches,state,f.options).find(item=>item.key===key);
function withSample(f,index,{only=false,arm='a'}={}){
  const match=f.matches[index],row=match.results[0],sampleId='sample-'+index,localId='s'+index;
  const sample={pmid:row.pmid,report_id:row.report_id,sample_record_id:sampleId,source_input_sha256:row.source_input_sha256,review_binding_sha256:row.review_binding_sha256,population_id:row.population_id,arm_id:arm,arm:{entity_id:arm},n:{value:30},quantitative_record:{id:localId,population_id:row.quantitative_record.population_id,arm_id:arm,result_id:'NA'}};
  f.artifact.samples||={};
  f.artifact.samples[sampleId]={...f.artifact.results[row.result_id],sample_record_id:sampleId,raw_sample_id:localId,arm_id:arm,raw_arm_id:arm};delete f.artifact.samples[sampleId].result_id;
  match.study.details={sample_size_records:[sample]};
  match.comparisons[0]={...match.comparisons[0],intervention_arm_id:arm,scope:{report_id:row.report_id,source_input_sha256:row.source_input_sha256,review_binding_sha256:row.review_binding_sha256,population_id:row.population_id}};
  if(only)match.results=[];
  return sample;
}

test('six ordered filters retain the separate analysis minimum policy',()=>{
  assert.equal(filters.MIN_INDEPENDENT_STUDIES_PER_FILTER_CHOICE,5);
  assert.deepEqual(filters.definitions.map(item=>item.key),['setting','stage','subtype','braf','advanced_line','baseline_ldh']);
});
test('All returns exact existing matches including unknown classifications and no new analysis gate',()=>{
  const f=fixture([{braf:'mutated'},{braf:{status:'mixed',categories:['mutated','wild_type']}},{verified:false}]);
  assert.equal(filters.filterMatches(f.matches,filters.resetSelections(),{}),f.matches);
  assert.equal(filters.savedAnalysisMatches({validated:false},f.matches,{},{}),true);
});
test('a verified follow-up comparison requires both original arms to satisfy the same advanced filters',()=>{
  const f=fixture(['a','b'].map(arm_id=>({pmid:'1234',population:'trial population',stage:'iv',q:{arm_id}})));
  const sources=f.matches.map(m=>({...m.results[0],review_stage:'R2'}));
  const row={...sources[0],review_stage:'Full-text review',source_filter_bindings:sources.map(source=>[source])};
  const matches=record=>filters.resultMatches(record,{stage:'iv'},f.options);
  assert.equal(matches(row),true);
  for(const overrides of [{pmid:'1235'},{report_id:'wrong report'},{quantitative_record:{...sources[1].quantitative_record,arm_id:'a'}}])
    assert.equal(matches({...row,source_filter_bindings:[[sources[0]],[{...sources[1],...overrides}]]}),false);
  f.artifact.results[sources[1].result_id].fields.stage.categories=['iii'];
  assert.equal(matches(row),false);
});
test('mixed melanoma subtype stays visible by default and under unrelated supported filters',()=>{
  const f=fixture([{stage:'iii',subtype:{status:'mixed',categories:['cutaneous','mucosal']}},
    {stage:'iii',subtype:'cutaneous'},{stage:'iii',subtype:'mucosal'}]);
  const sample=withSample(f,0);
  assert.equal(filters.filterMatches(f.matches,{},f.options),f.matches);
  assert.equal(filters.filterMatches(f.matches,{stage:'iii'},f.options).length,3);
  assert.equal(filters.classifiedSampleMatches(sample,{stage:'iii'},f.options),true);
  assert.equal(filters.filterMatches(f.matches,{subtype:'cutaneous'},f.options).length,1);
  assert.equal(filters.filterMatches(f.matches,{subtype:'mucosal'},f.options).length,1);
  assert.equal(filters.classifiedSampleMatches(sample,{subtype:'cutaneous'},f.options),false);
});
test('binary threshold shows five/five, omits five/four',()=>{
  let f=fixture([...repeat(5,{braf:'mutated'}),...repeat(5,{braf:'wild_type'})]);
  assert.equal(facet(f,{},'braf').visible,true);
  f=fixture([...repeat(5,{braf:'mutated'}),...repeat(4,{braf:'wild_type'})]);
  assert.equal(facet(f,{},'braf').visible,false);
});
test('own active choice does not hide qualifying alternatives; other filters condition counts',()=>{
  const f=fixture([...repeat(5,{braf:'mutated',baseline_ldh:'normal'}),...repeat(5,{braf:'wild_type',baseline_ldh:'normal'}),...repeat(8,{braf:'mutated',baseline_ldh:'elevated'})]);
  const result=facet(f,{braf:'mutated',baseline_ldh:'normal'},'braf');
  assert.deepEqual(result.choices.map(choice=>choice.count),[5,5]);
});
test('active sparse or retired selection remains visible and cannot broaden',()=>{
  const f=fixture([{braf:'mutated'}]);
  for(const value of ['mutated','retired-value']){
    const result=facet(f,{braf:value},'braf');assert.equal(result.visible,true);assert.equal(result.insufficient,true);
    assert.equal(result.options.find(choice=>choice.value===value).selected,true);
  }
  assert.deepEqual(filters.filterMatches(f.matches,{braf:'retired-value'},f.options),[]);
});
test('separate marginal subgroup facts never create a joint result population',()=>{
  const f=fixture([{pmid:'1',braf:'mutated'},{pmid:'1',baseline_ldh:'elevated'}]);
  assert.equal(filters.filterMatches(f.matches,{braf:'mutated',baseline_ldh:'elevated'},f.options).length,0);
});
test('mixed, missing, unknown testing scope and absent source anchors fail specific choices',()=>{
  const f=fixture([{braf:{status:'mixed',categories:['mutated','wild_type']}},{braf:{status:'NA',categories:['wild_type']}},{braf:'wild_type'}]);
  delete f.artifact.evidence_registry['anchor-2'];
  assert.equal(filters.filterMatches(f.matches,{braf:'wild_type'},f.options).length,0);
});
test('exact source, population and artifact freshness prevent stale classifications',()=>{
  const f=fixture([{braf:'mutated'}]);
  for(const key of ['result_id','pmid','source_input_sha256','review_binding_sha256','population_id']){
    const entry=f.artifact.results['result-0'],old=entry[key];entry[key]='different';assert.equal(filters.filterMatches(f.matches,{braf:'mutated'},f.options).length,0);entry[key]=old;
  }
  assert.equal(filters.filterMatches(f.matches,{braf:'mutated'},{...f.options,clinical_content_sha256:'new'}).length,0);
});
test('profile compression retains identical classifications',()=>{
  const f=fixture([{braf:'mutated'}]),entry=f.artifact.results['result-0'];
  const fields=entry.fields;delete entry.fields;entry.profile_id='profile';f.artifact.profiles={profile:{fields}};
  assert.equal(filters.filterMatches(f.matches,{braf:'mutated'},f.options).length,1);
});
test('cross-setting comparison preserves both arms; ordinary mixed setting fails',()=>{
  const setting={categories:['neoadjuvant_perioperative','adjuvant_resected']},arm_settings=[{arm_id:'a',category:'neoadjuvant_perioperative'},{arm_id:'b',category:'adjuvant_resected'}];
  const f=fixture([{setting,cross_setting:true,arm_settings},{setting}]);
  const selected=filters.filterMatches(f.matches,{setting:'adjuvant_resected'},f.options);
  assert.equal(selected.length,1);assert.equal(selected[0].comparisons[0],f.matches[0].comparisons[0]);
  assert.deepEqual(filters.tagsForResult(selected[0].results[0],f.options).arm_settings,arm_settings);
});
test('R2/R3, followups, arms and overlapping LDH subgroups count once per source-supported trial',()=>{
  const f=fixture(repeat(7,{cohorts:['trial:NCT1'],baseline_ldh:'elevated'}));
  assert.equal(filters.evidenceSummary(f.matches,f.options).independent_studies,1);
  assert.equal(facet(f,{baseline_ldh:'elevated'},'baseline_ldh').insufficient,true);
});
test('different PMIDs with unknown identities never inflate availability',()=>{
  const f=fixture(repeat(20,{verified:false,braf:'mutated'}));
  const summary=filters.evidenceSummary(f.matches,f.options);assert.equal(summary.independent_studies,0);assert.equal(summary.unresolved_report_count,20);
});
test('conflicting R2/R3 own-trial IDs in one PMID cannot become two independent studies or vanish under endpoint filtering',()=>{
  const f=fixture([{pmid:'1',cohorts:['trial:A']},{pmid:'1',cohorts:['trial:B']},{pmid:'2',cohorts:['trial:A']},{pmid:'3',cohorts:['trial:B']}]);
  const summary=filters.evidenceSummary(f.matches,f.options);
  assert.equal(summary.independent_studies,2);assert.equal(summary.unresolved_report_count,1);
  const restricted=filters.evidenceSummary([f.matches[0]],f.options);
  assert.equal(restricted.independent_studies,0);assert.equal(restricted.unresolved_report_count,1);
});
test('separate trial ownership in one PMID requires exact source-backed result-population assignment',()=>{
  const f=fixture([{pmid:'1',cohorts:['trial:A']},{pmid:'1',cohorts:['trial:B']}]);
  for(const match of f.matches){const row=match.results[0],entry=f.artifact.results[row.result_id];
    entry.independence.result_cohort_assignment={verified:true,cohort_id:entry.independence.cohort_ids[0],...Object.fromEntries(['result_id','population_id','source_input_sha256','review_binding_sha256'].map(key=>[key,row[key]])),evidence_ids:entry.independence.evidence_ids};}
  assert.equal(filters.evidenceSummary(f.matches,f.options).independent_studies,2);
  f.artifact.results['result-1'].independence.result_cohort_assignment.population_id='other-population';
  assert.equal(filters.evidenceSummary(f.matches,f.options).independent_studies,1);
});
test('pooled report cannot add to or collapse its independent component trials',()=>{
  const f=fixture([{cohorts:['trial:NCT1']},{cohorts:['trial:NCT2']},{cohorts:['trial:NCT1','trial:NCT2']}]);
  f.options.studyLinks=[{identifier:'NCT1',pmids:['1','3'],independence_verified:false},{identifier:'NCT2',pmids:['2','3'],independence_verified:false}];
  assert.equal(filters.evidenceSummary(f.matches,f.options).independent_studies,2);
  assert.equal(filters.evidenceSummary([f.matches[2]],f.options).independent_studies,1);
});
test('overlapping pooled estimates are at most one independent observation',()=>{
  const f=fixture([{cohorts:['trial:A','trial:B']},{cohorts:['trial:B','trial:C']}]);
  assert.equal(filters.evidenceSummary(f.matches,f.options).independent_studies,1);
});
test('counts use maximum compatible partition, never sum different endpoints or models',()=>{
  const f=fixture([...repeat(3,{q:{endpoint:'OS'}}),...repeat(3,{q:{endpoint:'PFS'}}),...repeat(3,{q:{endpoint:'OS',model:'AFT'}})]);
  const summary=filters.evidenceSummary(f.matches,f.options);assert.equal(summary.independent_studies,3);assert.equal(summary.compatible_partition_count,3);
});
test('RR analysis excludes browsable ORR percentages, counts, and median survival',()=>{
  const f=fixture([{measure:'RR'},{measure:'ORR'},{measure:'participant_count'},{measure:'median'}]);f.options.analysis={measure:'RR'};
  assert.equal(filters.evidenceSummary(f.matches,f.options).independent_studies,1);
  assert.equal(filters.filterMatches(f.matches,{},f.options),f.matches);
});
test('arm-only ratio without a supported comparison is not comparative evidence',()=>{
  const f=fixture([{measure:'RR',q:{reference_arm_id:'NA'}}]);f.options.analysis={measure:'RR'};
  assert.equal(filters.evidenceSummary(f.matches,f.options).independent_studies,0);
});
test('count display only retains exact selected source-population records',()=>{
  const f=fixture([{braf:'mutated'}]),row=f.matches[0].results[0],sample={...row,quantitative_record:{result_id:row.quantitative_record.id}};
  assert.equal(filters.sampleMatches(sample,f.matches[0],{braf:'mutated'}),true);
  assert.equal(filters.sampleMatches({...sample,population_id:'parent-trial'},f.matches[0],{braf:'mutated'}),false);
  assert.equal(filters.sampleMatches({...sample,review_binding_sha256:'other'},f.matches[0],{braf:'mutated'}),false);
});
test('same-population counts from an unselected arm cannot leak into an active arm-specific view',()=>{
  const f=fixture([{braf:'mutated',q:{arm_id:'a',intervention_arm_id:'NA',reference_arm_id:'NA'}}]),row=f.matches[0].results[0];
  const sample={...row,quantitative_record:{arm_id:'b',result_id:'NA'}};
  assert.equal(filters.sampleMatches(sample,f.matches[0],{braf:'mutated'}),false);
  assert.equal(filters.sampleMatches({...sample,quantitative_record:{arm_id:'a',result_id:'NA'}},f.matches[0],{braf:'mutated'}),true);
  assert.equal(filters.sampleMatches({...sample,quantitative_record:{arm_id:'NA',result_id:'NA'}},f.matches[0],{braf:'mutated'}),false);
});
test('participant totals need verified nonoverlapping relevant denominator identities',()=>{
  const f=fixture([{cohorts:['trial:A']},{cohorts:['trial:A']},{cohorts:['trial:B']}]);
  assert.equal(filters.evidenceSummary(f.matches,f.options).participant_total,null);
  const options={...f.options,participantFor:(row,match,entry)=>({verified:true,nonoverlapping:true,n:10,denominator_id:entry.independence.cohort_ids[0]})};
  assert.equal(filters.evidenceSummary(f.matches,options).participant_total,20);
  options.participantFor=row=>({verified:true,nonoverlapping:true,n:10,denominator_id:row.population_id});
  assert.equal(filters.evidenceSummary(f.matches,options).participant_total,null);
});
test('active analysis cache requires exact selected result identities and current classification version',()=>{
  const f=fixture(repeat(5,{braf:'mutated'})),state={braf:'mutated'},analysis={validated:true,advanced_filter_scope:{selections:state,result_signature:filters.resultSignature(f.matches,f.options)}};
  assert.equal(filters.savedAnalysisMatches(analysis,f.matches,state,f.options),true);
  assert.equal(filters.savedAnalysisMatches(analysis,f.matches.slice(1),state,f.options),false);
  f.artifact.classification_version='1.0.1';assert.equal(filters.savedAnalysisMatches(analysis,f.matches,state,f.options),false);
});
test('classification corrections invalidate cached signature even when version and source hashes stay unchanged',()=>{
  const f=fixture(repeat(5,{braf:'mutated'})),before=filters.resultSignature(f.matches,f.options);
  f.artifact.results['result-0'].fields.braf.reason='Corrected supported scope';
  assert.notEqual(filters.resultSignature(f.matches,f.options),before);
});
test('unchanged backfill/count processing is stable; new independent evidence crosses threshold',()=>{
  const f=fixture([...repeat(5,{braf:'mutated'}),...repeat(4,{braf:'wild_type'})]),before=JSON.stringify(f);
  assert.deepEqual(filters.facets(f.matches,{},f.options),filters.facets(f.matches,{},f.options));assert.equal(JSON.stringify(f),before);
  const updated=fixture([...repeat(5,{braf:'mutated'}),...repeat(5,{braf:'wild_type'})]);assert.equal(facet(updated,{},'braf').visible,true);
});
test('reset is confined to the six advanced selections',()=>{
  const upstream={comparator:'pembrolizumab',intervention:'nivolumab',endpoint:'OS',braf:'mutated'};
  const next={...upstream,...filters.resetSelections()};assert.equal(next.comparator,upstream.comparator);assert.equal(next.endpoint,upstream.endpoint);assert.equal(next.braf,'all');
});
test('browsing exposes one supported stage report without endpoint, effect, CI, N or independent-cohort requirements',()=>{
  const f=fixture([{stage:'iii',verified:false,q:{endpoint:'NA',estimate:'NA',ci_lower:'NA',ci_upper:'NA',analysis_n:'NA'}}]);
  f.matches[0].results[0].estimate={value:null};f.options.analysis={};
  f.options.countEligible=()=>{throw new Error('Analysis eligibility must not gate report discovery');};
  f.options.compatibilityFor=()=>{throw new Error('Compatibility partitions must not gate report discovery');};
  const stage=filters.browseFacets(f.matches,{},f.options).find(item=>item.key==='stage');
  assert.equal(stage.visible,true);assert.equal(stage.options.find(item=>item.value==='iii').count,1);assert.equal(stage.count_unit,'reports');
  assert.equal(filters.browseSummary(f.matches,f.options).report_count,1);
});
test('browse report counts deduplicate results, arms, repeated records and separately listed populations within one PMID',()=>{
  const f=fixture([{pmid:'1',stage:'iii'},{pmid:'1',stage:'iii'},{pmid:'1',stage:'iv'},{pmid:'2',stage:'iii'}]);
  const stages=filters.browseFacets(f.matches,{},f.options).find(item=>item.key==='stage');
  assert.equal(stages.options.find(item=>item.value==='all').count,2);
  assert.equal(stages.options.find(item=>item.value==='iii').count,2);
  assert.equal(stages.options.find(item=>item.value==='iv').count,1);
});
test('stage browsing accepts normalized substages but not mixed major-stage populations',()=>{
  const f=fixture([{stage:'iii'},{stage:{status:'mixed',categories:['iii','iv']}},{stage:{status:'NA',categories:[]}}]);
  f.artifact.results['result-0'].fields.stage.details={original_wording:'Stage IIIC',substage:'IIIC'};
  const selected=filters.filterMatches(f.matches,{stage:'iii'},f.options);
  assert.equal(selected.length,1);assert.equal(filters.browseSummary(selected,f.options).report_count,1);
  assert.equal(filters.filterMatches(f.matches,{},f.options),f.matches);
});
test('browse facets condition on other selections while excluding their own condition',()=>{
  const f=fixture([{stage:'iii',braf:'mutated'},{stage:'iv',braf:'mutated'},{stage:'iv',braf:'wild_type'}]);
  const stage=filters.browseFacets(f.matches,{stage:'iii',braf:'mutated'},f.options).find(item=>item.key==='stage');
  assert.deepEqual(stage.choices.map(item=>item.count),[0,0,1,1]);
  assert.equal(filters.browseSummary(filters.filterMatches(f.matches,{stage:'iii',braf:'mutated'},f.options)).report_count,1);
});
test('stage and BRAF marginal populations cannot create a combined browse match',()=>{
  const f=fixture([{pmid:'1',stage:'iii'},{pmid:'1',braf:'mutated'}]);
  assert.equal(filters.browseSummary(filters.filterMatches(f.matches,{stage:'iii',braf:'mutated'},f.options)).report_count,0);
});
test('browse active empty and retired values stay visible and clearable without analysis-threshold warnings',()=>{
  const f=fixture([{stage:'iii'}]);
  for(const value of ['iv','retired-stage']){
    const stage=filters.browseFacets(f.matches,{stage:value},f.options).find(item=>item.key==='stage');
    assert.equal(stage.visible,true);assert.equal(stage.empty,true);assert.equal(stage.insufficient,false);assert.equal(stage.message,'No matching reports.');
    assert.equal(stage.options.find(item=>item.value===value).selected,true);
  }
});
test('browse report eligibility callback keeps counts aligned with the caller actual table scope',()=>{
  const f=fixture([{stage:'iii'},{stage:'iii'},{stage:'iv'}]);
  f.options.browseReportEligible=match=>match.study.pmid!=='2';
  const stage=filters.browseFacets(f.matches,{},f.options).find(item=>item.key==='stage');
  assert.equal(stage.options.find(item=>item.value==='iii').count,1);assert.equal(stage.options.find(item=>item.value==='all').count,2);
});
test('browse availability does not weaken analysis thresholds or saved analysis gates',()=>{
  const f=fixture([{stage:'iii',verified:false}]),selected={stage:'iii'};
  assert.equal(filters.browseFacets(f.matches,{},f.options).find(item=>item.key==='stage').visible,true);
  assert.equal(filters.facets(f.matches,{},f.options).find(item=>item.key==='stage').visible,false);
  assert.equal(filters.evidenceSummary(f.matches,f.options).independent_studies,0);
  assert.equal(filters.savedAnalysisMatches({validated:true,advanced_filter_scope:{selections:selected,result_signature:filters.resultSignature(f.matches,f.options)}},f.matches,selected,f.options),false);
});
test('count-only source-classified populations remain browseable without invented outcomes',()=>{
  const f=fixture([{stage:'iii',verified:false}]),sample=withSample(f,0,{only:true}),before=JSON.stringify(f);
  const options={...f.options,analysis:{},includeSampleOnly:true},selected=filters.filterBrowseMatches(f.matches,{stage:'iii'},options);
  assert.equal(selected.length,1);assert.deepEqual(selected[0].results,[]);assert.equal(selected[0].comparisons[0],f.matches[0].comparisons[0]);
  assert.deepEqual(selected[0].advanced_filter_scope.sample_ids,[sample.sample_record_id]);assert.equal(filters.sampleMatches(sample,selected[0],{stage:'iii'}),true);
  assert.equal(filters.browseSummary(selected,options).report_count,1);assert.equal(filters.evidenceSummary(selected,options).independent_studies,0);
  assert.equal(JSON.stringify(f),before);assert.equal(filters.filterBrowseMatches(f.matches,{},options),f.matches);
});
test('sample-only Stage III cannot supply an OS match when the only OS result is Stage IV',()=>{
  const f=fixture([{stage:'iv'}]),sample=withSample(f,0),entry=f.artifact.samples[sample.sample_record_id];
  entry.fields={...entry.fields,stage:{status:'supported',categories:['iii'],evidence_ids:['anchor-0']}};
  const state={stage:'iii'};
  assert.equal(filters.filterBrowseMatches(f.matches,state,{...f.options,analysis:{},includeSampleOnly:true}).length,1);
  assert.equal(filters.filterBrowseMatches(f.matches,state,{...f.options,analysis:{endpoint:'OS',measure:'HR'}}).length,0);
  assert.equal(filters.filterBrowseMatches(f.matches,state,{...f.options,includeSampleOnly:false}).length,0);
});
test('separate sample marginal populations cannot create a joint subgroup or reappear in conditional facets',()=>{
  const f=fixture([{pmid:'1',stage:'iii'},{pmid:'1',braf:'mutated'}]);withSample(f,0,{only:true});withSample(f,1,{only:true});
  const options={...f.options,analysis:{},includeSampleOnly:true},state={stage:'iii',braf:'mutated'};
  assert.equal(filters.filterBrowseMatches(f.matches,state,options).length,0);
  const stage=filters.browseFacets(f.matches,{braf:'mutated'},options).find(item=>item.key==='stage');
  assert.equal(stage.choices.find(item=>item.value==='iii').count,0);
});
test('sample classifications and selected sample scopes retain exact arm and source binding',()=>{
  const f=fixture([{stage:'iii'}]),sample=withSample(f,0,{only:true}),options={...f.options,analysis:{},includeSampleOnly:true};
  const selected=filters.filterBrowseMatches(f.matches,{stage:'iii'},options)[0];
  assert.equal(filters.sampleClassification({...sample,arm_id:'other'},options),null);
  assert.equal(filters.sampleClassification({...sample,quantitative_record:{...sample.quantitative_record,arm_id:'other'}},options),null);
  assert.equal(filters.sampleMatches({...sample,review_binding_sha256:'other'},selected,{stage:'iii'}),false);
  assert.equal(filters.sampleMatches({...sample,arm_id:'other'},selected,{stage:'iii'}),false);
});
test('final browse projection aligns count-only facet counts with visible reports',()=>{
  const f=fixture([{stage:'iii'},{stage:'iii'}]);withSample(f,0,{only:true});withSample(f,1,{only:true});
  const options={...f.options,analysis:{},includeSampleOnly:true,browseMatchesFor:matches=>matches.filter(match=>match.study.pmid==='1')};
  const stage=filters.browseFacets(f.matches,{},options).find(item=>item.key==='stage');
  assert.equal(stage.options.find(item=>item.value==='iii').count,1);assert.equal(stage.options.find(item=>item.value==='all').count,1);
});
test('browse facets project an identical All baseline only once per call',()=>{
  const f=fixture([{stage:'iii',braf:'mutated'}]);let calls=0;
  const options={...f.options,browseMatchesFor:matches=>{if(matches===f.matches)calls++;return matches;}};
  filters.browseFacets(f.matches,{},options);assert.equal(calls,1);
  filters.browseFacets(f.matches,{},options);assert.equal(calls,2);
});
test('foreign source PMIDs attached to one report cannot inflate the browsing count',()=>{
  const f=fixture([{pmid:'1',stage:'iii'},{pmid:'2',stage:'iii'}]),foreignSample=withSample(f,1);
  const match={...f.matches[0],results:[...f.matches[0].results,...f.matches[1].results],browse_samples:[foreignSample]};
  const summary=filters.browseSummary([match]);
  assert.equal(summary.report_count,1);assert.equal(summary.result_count,1);assert.equal(summary.sample_count,0);
});
