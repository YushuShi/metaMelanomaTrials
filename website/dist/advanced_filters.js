/* Stored, result-population classifications and conservative evidence counts.
 * This module narrows the existing eligibility projection. It does not approve
 * a pooling model, infer clinical characteristics, or retrieve new evidence. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AdvancedFilters=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  // Interface policy, not a guarantee of statistical precision. It never
  // changes the existing unfiltered analysis minimum.
  const MIN_INDEPENDENT_STUDIES_PER_FILTER_CHOICE=5;
  const DEFINITIONS=Object.freeze([
    {key:'setting',label:'Treatment setting',choices:[['neoadjuvant_perioperative','Neoadjuvant/perioperative'],['adjuvant_resected','Adjuvant after complete resection'],['unresectable_metastatic','Unresectable or active metastatic disease']]},
    {key:'stage',label:'Stage',choices:[['i','Stage I'],['ii','Stage II'],['iii','Stage III'],['iv','Stage IV']]},
    {key:'subtype',label:'Melanoma type',choices:[['cutaneous','Cutaneous, including acral'],['mucosal','Mucosal'],['uveal','Uveal']]},
    {key:'braf',label:'BRAF mutation status',choices:[['mutated','Mutated'],['wild_type','Wild type']]},
    {key:'advanced_line',label:'Treatment line for advanced disease',choices:[['first_line','First line'],['second_or_later','Second or later line']]},
    {key:'baseline_ldh',label:'Baseline lactate dehydrogenase (LDH)',choices:[['normal','Normal'],['elevated','Elevated']]}
  ].map(definition=>Object.freeze({...definition,choices:Object.freeze(definition.choices.map(choice=>Object.freeze({value:choice[0],label:choice[1]})))})));
  const list=value=>Array.isArray(value)?value:[];
  const text=value=>value===null||value===undefined?'':String(value);
  const unique=values=>[...new Set(values.filter(value=>value!==null&&value!==undefined&&value!==''))];
  const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const meaningful=value=>!['','NA','N/A','unknown','not reported'].includes(text(value).trim());
  function normalizeSelections(value={}){
    const input=plain(value),out={};
    // Preserve an unrecognized restored value visibly. Silently changing it to
    // All would broaden the user's population after a vocabulary/data update.
    for(const {key}of DEFINITIONS)out[key]=!input[key]||String(input[key]).toLowerCase()==='all'?'all':String(input[key]);
    return out;
  }
  function resetSelections(){return normalizeSelections();}
  function activeCount(selections){return Object.values(normalizeSelections(selections)).filter(value=>value!=='all').length;}
  function resultKey(row){return JSON.stringify([text(row?.pmid),text(row?.result_id),text(row?.source_input_sha256),text(row?.review_binding_sha256),text(row?.population_id)]);}
  function evidencePresent(ids,options,entry){
    const registry=options.registry||options.classifications?.evidence_registry||{};
    return list(ids).length>0&&ids.every(id=>{
      const anchor=registry[id];
      const binding=entry?.review_binding_sha256;
      return anchor&&meaningful(anchor.source_id)&&meaningful(anchor.supporting_quote)&&
        (!/^[a-f0-9]{64}$/i.test(binding||'')||String(id).startsWith('CE-'+binding.slice(0,24)+'-'))&&
        (!entry?.report_id||String(anchor.source_id).startsWith(entry.report_id+':'));
    });
  }
  function artifactCurrent(options){
    const artifact=options.classifications;
    if(!artifact||artifact.schema_version!==1||!artifact.classification_version)return false;
    for(const key of ['source_file_sha256','clinical_content_sha256'])if(options[key]&&artifact[key]!==options[key])return false;
    return true;
  }
  function resultClassification(row,options={}){
    if(!artifactCurrent(options))return null;
    const entry=options.classifications.results?.[row?.result_id];
    if(!entry)return null;
    for(const key of ['result_id','pmid','source_input_sha256','review_binding_sha256','population_id']){
      if(!meaningful(entry[key])||text(entry[key])!==text(row?.[key]))return null;
    }
    if(entry.raw_population_id&&text(entry.raw_population_id)!==text(row.quantitative_record?.population_id))return null;
    if(entry.profile_id){
      const profile=options.classifications.profiles?.[entry.profile_id];
      if(!profile)return null;
      return {...profile,...entry};
    }
    return entry;
  }
  function sampleKey(row){return JSON.stringify([text(row?.pmid),text(row?.sample_record_id),text(row?.source_input_sha256),text(row?.review_binding_sha256),text(row?.population_id),text(row?.arm_id),text(row?.quantitative_record?.id),text(row?.quantitative_record?.arm_id)]);}
  function sampleClassification(sample,options={}){
    if(!artifactCurrent(options))return null;
    const entry=options.classifications.samples?.[sample?.sample_record_id];
    if(!entry)return null;
    for(const key of ['sample_record_id','pmid','source_input_sha256','review_binding_sha256','population_id'])if(!meaningful(entry[key])||text(entry[key])!==text(sample?.[key]))return null;
    if(text(entry.arm_id)!==text(sample.arm_id))return null;
    const q=sample.quantitative_record||{};
    if(entry.raw_sample_id&&entry.raw_sample_id!==q.id||entry.raw_population_id&&entry.raw_population_id!==q.population_id||text(entry.raw_arm_id)!==text(q.arm_id))return null;
    if(entry.profile_id){const profile=options.classifications.profiles?.[entry.profile_id];return profile?{...profile,...entry}:null;}
    return entry;
  }
  function supportedField(entry,key,options){
    const field=entry?.fields?.[key];
    if(field?.status!=='supported'||!evidencePresent(field.evidence_ids,options,entry))return null;
    const valid=new Set(DEFINITIONS.find(item=>item.key===key)?.choices.map(item=>item.value)||[]);
    const categories=unique(list(field.categories));
    if(!categories.length||categories.some(value=>!valid.has(value)))return null;
    // Only a complete, source-tagged cross-setting comparison can match either
    // of two settings. Mixed subtype/BRAF/LDH populations are never a subset.
    if(categories.length>1&&(key!=='setting'||entry.cross_setting_comparison!==true||!Object.keys(entry.arm_settings||{}).length))return null;
    return {...field,categories};
  }
  function tagsForResult(row,options={}){
    const entry=resultClassification(row,options);
    return {fields:entry?.fields||{},arm_settings:entry?.arm_settings||[],cross_setting_comparison:entry?.cross_setting_comparison===true,population_id:entry?.population_id||row?.population_id||null};
  }
  function resultMatches(row,selections,options={}){
    const selected=normalizeSelections(selections);
    if(!activeCount(selected))return true;
    // A source-checked follow-up contrast may be linked to the classifications
    // of its two original arms, as in the treatment network. Both must qualify.
    if(row.review_stage==='Full-text review' && Array.isArray(row.source_filter_bindings)){
      const q=row.quantitative_record,arms=[q?.intervention_arm_id,q?.reference_arm_id];
      if(!arms.every(Boolean)||arms[0]===arms[1]||row.source_filter_bindings.length!==2)return false;
      return row.source_filter_bindings.every((group,i)=>group.some(source=>source.review_stage==='R2'&&
        source.pmid===row.pmid&&source.report_id===row.report_id&&source.quantitative_record?.population_id===q.population_id&&
        source.quantitative_record.arm_id===arms[i]&&source.quantitative_record.endpoint===q.endpoint&&resultMatches(source,selected,options)));
    }
    const entry=resultClassification(row,options);
    return DEFINITIONS.every(({key})=>selected[key]==='all'||supportedField(entry,key,options)?.categories.includes(selected[key]));
  }
  function classifiedSampleMatches(sample,selections,options={}){
    const selected=normalizeSelections(selections);
    if(!activeCount(selected))return true;
    const entry=sampleClassification(sample,options);
    return DEFINITIONS.every(({key})=>selected[key]==='all'||supportedField(entry,key,options)?.categories.includes(selected[key]));
  }
  function filterMatches(matches,selections={},options={}){
    if(!activeCount(selections))return matches;
    const selected=normalizeSelections(selections),out=[];
    for(const match of list(matches)){
      const results=list(match.results).filter(row=>resultMatches(row,selected,options));
      if(!results.length)continue;
      const ids=new Set(results.flatMap(row=>[row.result_id,...list(row.source_extraction_ids)]));
      const comparisonIds=new Set(results.map(row=>row.comparison_id).filter(Boolean));
      // Retain the entire comparator/intervention definition, including a
      // cross-setting comparator arm, but only its selected result populations.
      const comparisons=list(match.comparisons).filter(comparison=>comparisonIds.has(comparison.comparison_id)||list(comparison.result_ids).some(id=>ids.has(id)));
      out.push({...match,comparisons,results,advanced_filter_scope:{selections:selected,result_ids:results.map(row=>row.result_id),setting_tags:results.map(row=>({result_id:row.result_id,...tagsForResult(row,options)}))}});
    }
    return out;
  }
  function sampleMatches(sample,match,selections={}){
    if(!activeCount(selections))return true;
    if(list(match?.advanced_filter_scope?.sample_keys).includes(sampleKey(sample)))return true;
    return list(match?.results).some(row=>{
      if(text(sample.source_input_sha256)!==text(row.source_input_sha256)||text(sample.review_binding_sha256)!==text(row.review_binding_sha256)||!meaningful(sample.population_id)||sample.population_id!==row.population_id)return false;
      const q=row.quantitative_record||{},sq=sample.quantitative_record||{},linked=meaningful(sq.result_id);
      if(linked&&sq.result_id!==q.id)return false;
      const arms=[q.arm_id,q.intervention_arm_id,q.reference_arm_id].filter(meaningful);
      if(meaningful(sq.arm_id)&&!arms.includes(sq.arm_id))return false;
      if(meaningful(q.arm_id)&&!meaningful(sq.arm_id)&&!linked)return false;
      return true;
    });
  }
  function comparisonMatchesSample(comparison,sample){
    const scope=comparison.scope||{};
    for(const key of ['report_id','source_input_sha256','review_binding_sha256','population_id'])if(!meaningful(scope[key])||scope[key]!==sample[key])return false;
    const arm=sample.arm?.entity_id||sample.quantitative_record?.arm_id;
    const arms=comparison.outcome_arm_id?[comparison.outcome_arm_id]:[comparison.intervention_arm_id,comparison.comparator_arm_id].filter(meaningful);
    return meaningful(arm)?arms.includes(arm):!comparison.outcome_arm_id;
  }
  function filterBrowseMatches(matches,selections={},options={}){
    if(!activeCount(selections))return matches;
    const analysis=options.analysis||{};
    const includeSamples=options.includeSampleOnly??!(analysis.endpoint||analysis.measure||analysis.effect_measure);
    if(!includeSamples)return filterMatches(matches,selections,options);
    const selected=normalizeSelections(selections),out=[];
    for(const match of list(matches)){
      const results=list(match.results).filter(row=>resultMatches(row,selected,options));
      const sourceSamples=Array.isArray(match.browse_samples)?match.browse_samples:typeof options.samplesFor==='function'?options.samplesFor(match):match.study?.details?.sample_size_records||[];
      const samples=list(sourceSamples).filter(sample=>sample.main_result_eligible!==false&&classifiedSampleMatches(sample,selected,options)&&
        (typeof options.browseSampleEligible!=='function'||options.browseSampleEligible(sample,match)));
      if(!results.length&&!samples.length)continue;
      const ids=new Set(results.flatMap(row=>[row.result_id,...list(row.source_extraction_ids)])),comparisonIds=new Set(results.map(row=>row.comparison_id).filter(Boolean));
      const comparisons=list(match.comparisons).filter(comparison=>comparisonIds.has(comparison.comparison_id)||list(comparison.result_ids).some(id=>ids.has(id))||samples.some(sample=>comparisonMatchesSample(comparison,sample)));
      out.push({...match,comparisons,results,browse_samples:samples,advanced_filter_scope:{selections:selected,result_ids:results.map(row=>row.result_id),sample_ids:samples.map(sample=>sample.sample_record_id),sample_keys:samples.map(sampleKey),
        setting_tags:results.map(row=>({result_id:row.result_id,...tagsForResult(row,options)}))}});
    }
    return out;
  }
  function normalized(value){
    if(value&&typeof value==='object')return JSON.stringify(value);
    return text(value).trim().toLowerCase().replace(/\s+/g,' ');
  }
  function settingCompatibility(entry){
    const setting=entry?.fields?.setting;
    if(setting?.status!=='supported')return setting?.status||'NA';
    return [entry.cross_setting_comparison?'cross-setting':'within-setting',...list(setting.categories).slice().sort()].join(':');
  }
  function compatibilityKey(row,match,entry,options){
    if(typeof options.compatibilityFor==='function')return options.compatibilityFor(row,match,entry);
    const q=row.quantitative_record||{},comparison=list(match.comparisons).find(item=>item.comparison_id===row.comparison_id)||{};
    const endpoint=q.endpoint||row.endpoint,measure=row.display_measure||row.measure||q.measure||q.kind;
    if(!meaningful(endpoint)||!meaningful(measure))return null;
    // Exact scope partitions are conservative: unknown definitions do not
    // become a known one, median survival does not become an HR, and distinct
    // assessor/model/response windows cannot jointly pass a facet threshold.
    return JSON.stringify([endpoint,measure,q.kind,q.endpoint_definition,q.unit||row.estimate?.unit,q.model,q.adjusted,q.assessor,q.response_criteria,q.time||q.timepoint||q.assessment_time,q.time_unit,q.grade,q.attribution,
      comparison.comparator_id||comparison.comparator_label,comparison.intervention_id||comparison.intervention_label,settingCompatibility(entry)].map(normalized));
  }
  function independenceFor(row,match,entry,options){
    const supplied=typeof options.independenceFor==='function'?options.independenceFor(row,match,entry):entry?.independence||row.independence;
    if(!supplied)return {verified:false,cohort_ids:[],overlap_ids:[]};
    const ids=unique(list(supplied.cohort_ids).map(text));
    return {...supplied,cohort_ids:ids,overlap_ids:unique(list(supplied.overlap_ids).map(text)),verified:supplied.verified===true&&ids.length>0&&evidencePresent(supplied.evidence_ids,options,entry)};
  }
  function countEligible(row,match,entry,options={}){
    if(row.main_result_eligible===false)return false;
    if(typeof options.countEligible==='function'&&!options.countEligible(row,match,entry))return false;
    const analysis=options.analysis||{},q=row.quantitative_record||{},measure=text(row.display_measure||row.measure||q.measure).toUpperCase();
    const requested=text(analysis.measure||analysis.effect_measure).toUpperCase();
    if(requested&&requested!=='ALL'&&requested!==measure)return false;
    if(['HR','RR','OR','RD','MD','SMD','TR'].includes(requested)){
      if(!meaningful(q.intervention_arm_id||row.experimental_arm?.entity_id)||!meaningful(q.reference_arm_id||row.comparator_arm?.entity_id))return false;
    }
    if(['participant_count','sample_size','count','n'].includes(measure.toLowerCase()))return false;
    return true;
  }
  class Union{
    constructor(){this.parents=new Map();}
    find(value){if(!this.parents.has(value))this.parents.set(value,value);const parent=this.parents.get(value);if(parent!==value)this.parents.set(value,this.find(parent));return this.parents.get(value);}
    join(values){const ids=unique(values);if(!ids.length)return;const root=this.find(ids[0]);for(const id of ids.slice(1))this.parents.set(this.find(id),root);}
  }
  const reportIdentityCache=new WeakMap();
  function reportIdentities(artifact){
    if(!artifact||typeof artifact!=='object')return new Map();
    const token=artifact.content_sha256||artifact.classification_content_sha256;
    const cached=token&&reportIdentityCache.get(artifact);if(cached&&cached.token===token)return cached.value;
    const value=new Map();
    for(const entry of Object.values(artifact.results||{})){
      const independence=(entry.profile_id?artifact.profiles?.[entry.profile_id]?.independence:entry.independence);
      const ids=value.get(text(entry.pmid))||new Set();
      for(const id of list(independence?.cohort_ids))ids.add(text(id));
      if(ids.size)value.set(text(entry.pmid),ids);
    }
    // The producing workflow content-addresses corrected backfills. Mutable
    // test/import objects without that token are intentionally not cached.
    if(token)reportIdentityCache.set(artifact,{token,value});
    return value;
  }
  function separateResultOwnership(record,options){
    const assignment=record.independence.result_cohort_assignment;
    if(assignment?.verified!==true||record.independence.cohort_ids.length!==1||assignment.cohort_id!==record.independence.cohort_ids[0])return false;
    for(const key of ['result_id','population_id','source_input_sha256','review_binding_sha256'])if(!meaningful(assignment[key])||assignment[key]!==record.row[key])return false;
    return evidencePresent(assignment.evidence_ids,options,record.entry);
  }
  function summaryRecords(matches,options){
    const seen=new Set(),records=[];
    for(const match of list(matches))for(const row of list(match.results)){
      const key=resultKey(row);if(seen.has(key))continue;seen.add(key);
      const entry=resultClassification(row,options);
      records.push({row,match,entry,key,count_eligible:countEligible(row,match,entry,options),partition:compatibilityKey(row,match,entry,options),independence:independenceFor(row,match,entry,options)});
    }
    return records;
  }
  function evidenceSummary(matches,options={}){
    const records=summaryRecords(matches,options),union=new Union();
    const allRecords=options.allMatches?summaryRecords(options.allMatches,options):records;
    // Identity links deduplicate trials, but an aggregate report must never
    // make its genuinely separate component trials one giant component.
    // Inspect the complete classification artifact as well as current matches:
    // an endpoint filter must not hide a conflicting R2/R3 own-trial identity.
    const identitiesByReport=new Map([...reportIdentities(options.classifications)].map(([pmid,ids])=>[pmid,new Set(ids)]));
    for(const {row,independence}of allRecords){
      const ids=identitiesByReport.get(text(row.pmid))||new Set();
      for(const id of independence.cohort_ids)ids.add(id);
      identitiesByReport.set(text(row.pmid),ids);
      if(independence.cohort_ids.length===1)union.join([...independence.cohort_ids,...independence.overlap_ids].map(id=>`cohort:${id}`));
    }
    for(const link of list(options.studyLinks||options.study_links)){
      if(link.component_pmids||link.component_cohort_ids||link.relation==='pooled_components')continue;
      const linked=list(link.pmids).map(pmid=>identitiesByReport.get(text(pmid))).filter(ids=>ids?.size===1).map(ids=>[...ids][0]);
      if(link.identifier){
        const id='trial:'+String(link.identifier).toUpperCase();
        // A shared registration links only the same known own-trial identity;
        // a PMID listing that registration among other trials is not a bridge.
        union.join(linked.filter(value=>value===id).map(value=>`cohort:${value}`));
      }else if(['same_cohort','followup','overlap'].includes(link.relation)&&link.source_verified===true)union.join(linked.map(id=>`cohort:${id}`));
    }
    const partitions=new Map(),unresolved=new Set();
    for(const record of records){
      if(!record.count_eligible)continue;
      if(!record.partition||!record.independence.verified){unresolved.add(text(record.row.pmid));continue;}
      const ids=record.independence.cohort_ids;
      if(ids.length===1&&(identitiesByReport.get(text(record.row.pmid))?.size||0)>1&&!separateResultOwnership(record,options)){
        // Different study-level registrations across records are ambiguous,
        // not proof of two independently usable result populations. Hold only
        // this report; do not union or suppress other component-trial reports.
        unresolved.add(text(record.row.pmid));continue;
      }
      if(ids.length>1){
        // An inseparable pooled estimate is at most one usable observation,
        // and is not counted alongside any represented component trial.
        const components=records.some(other=>other!==record&&other.count_eligible&&other.partition===record.partition&&other.independence.verified&&other.independence.cohort_ids.length===1&&ids.some(id=>union.find('cohort:'+id)===union.find('cohort:'+other.independence.cohort_ids[0])));
        if(components)continue;
      }
      const id=ids.length===1?union.find('cohort:'+ids[0]):'aggregate:'+ids.slice().sort().join('|'),partition=partitions.get(record.partition)||new Map();
      const component=partition.get(id)||[];component.push(record);partition.set(id,component);partitions.set(record.partition,partition);
    }
    // Repeated aggregate estimates sharing any component cannot be independent.
    for(const partition of partitions.values()){
      const aggregates=[...partition].filter(([key])=>key.startsWith('aggregate:'));
      const overlap=new Union();
      for(const [key,members]of aggregates)overlap.join([key,...members.flatMap(member=>member.independence.cohort_ids.map(id=>'aggregate-component:'+id))]);
      const merged=new Map();
      for(const [key,members]of aggregates){const root=overlap.find(key);merged.set(root,[...(merged.get(root)||[]),...members]);partition.delete(key);}
      for(const [key,members]of merged)partition.set(key,members);
    }
    const rows=[...partitions].map(([key,components])=>({key,count:components.size,components})).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
    const best=rows[0],count=best?.count||0;
    let participants=null,participantReason='Relevant nonoverlapping denominators are not verified.';
    if(best&&typeof options.participantFor==='function'){
      const numbers=[];
      for(const members of best.components.values()){
        const facts=members.map(({row,match,entry})=>options.participantFor(row,match,entry)).filter(Boolean);
        const valid=facts.filter(fact=>fact.verified===true&&fact.nonoverlapping===true&&Number.isInteger(fact.n)&&fact.n>0&&meaningful(fact.denominator_id));
        if(valid.length!==members.length||new Set(valid.map(fact=>fact.denominator_id)).size!==1||new Set(valid.map(fact=>fact.n)).size!==1){numbers.length=0;break;}
        numbers.push(valid[0].n);
      }
      if(numbers.length===count){participants=numbers.reduce((a,b)=>a+b,0);participantReason=null;}
    }
    return {independent_studies:count,verified_independent_studies:count,report_count:new Set(records.map(record=>text(record.row.pmid))).size,result_count:records.length,
      unresolved_report_count:unresolved.size,compatible_partition_count:rows.length,compatibility_key:best?.key||null,
      partitions:rows.map(row=>({key:row.key,independent_studies:row.count})),participant_total:participants,participant_total_reason:participantReason,
      policy_minimum:MIN_INDEPENDENT_STUDIES_PER_FILTER_CHOICE,sufficient:count>=MIN_INDEPENDENT_STUDIES_PER_FILTER_CHOICE,
      count_basis:'Largest compatible analysis partition; source-verified trial/cohort identity, with known overlaps collapsed.'};
  }
  function facets(matches,selections={},options={}){
    const selected=normalizeSelections(selections),countOptions={...options,allMatches:options.allMatches||matches};
    return DEFINITIONS.map(definition=>{
      const withoutOwn={...selected,[definition.key]:'all'};
      const base=filterMatches(matches,withoutOwn,options);
      const choices=definition.choices.map(choice=>{
        const summary=evidenceSummary(filterMatches(base,{[definition.key]:choice.value},options),countOptions);
        return {...choice,count:summary.independent_studies,eligible:summary.sufficient,selected:selected[definition.key]===choice.value,summary};
      });
      const active=selected[definition.key]!=='all';
      if(active&&!choices.some(choice=>choice.selected))choices.push({value:selected[definition.key],label:selected[definition.key],count:0,eligible:false,selected:true,unrecognized:true});
      const selectedChoice=choices.find(choice=>choice.selected),qualifying=choices.filter(choice=>choice.eligible);
      const allSummary=evidenceSummary(base,countOptions);
      return {key:definition.key,label:definition.label,active,visible:active||qualifying.length>=2,value:selected[definition.key],insufficient:active&&!selectedChoice?.eligible,
        options:[{value:'all',label:'All',selected:!active,count:allSummary.independent_studies,eligible:true},...choices.filter(choice=>choice.eligible||choice.selected)],choices,summary:allSummary,
        message:active&&!selectedChoice?.eligible?'Insufficient studies for this selection.':null};
    });
  }
  function browseSummary(matches,options={}){
    const reports=new Set(),results=new Set(),samples=new Set();
    const projected=typeof options.browseMatchesFor==='function'?options.browseMatchesFor(matches):matches;
    for(const match of list(projected)){
      if(typeof options.browseReportEligible==='function'&&!options.browseReportEligible(match))continue;
      const ownPMID=text(match.study?.pmid).trim();if(ownPMID)reports.add(ownPMID);
      for(const row of list(match.results)){
        const pmid=text(row.pmid||match.study?.pmid).trim();
        if(!pmid||ownPMID&&pmid!==ownPMID)continue;
        reports.add(pmid);results.add(resultKey(row));
      }
      for(const sample of list(match.browse_samples)){
        const pmid=text(sample.pmid).trim();if(!pmid||ownPMID&&pmid!==ownPMID)continue;
        reports.add(pmid);samples.add(sampleKey(sample));
      }
    }
    // These are publication counts for discovery. A report can be repeated
    // follow-up evidence, lack an estimable effect, or have unresolved cohort
    // linkage. None of those limitations creates a browsing prerequisite.
    return {report_count:reports.size,result_count:results.size,sample_count:samples.size,count_unit:'reports',count_basis:'Distinct matching PubMed reports; not independent or poolable studies.'};
  }
  function browseFacets(matches,selections={},options={}){
    const selected=normalizeSelections(selections);
    const summaries=new WeakMap();
    const summarize=rows=>{
      if(!Array.isArray(rows))return browseSummary(rows,options);
      if(!summaries.has(rows))summaries.set(rows,browseSummary(rows,options));
      return summaries.get(rows);
    };
    return DEFINITIONS.map(definition=>{
      const withoutOwn={...selected,[definition.key]:'all'};
      const base=filterBrowseMatches(matches,withoutOwn,options);
      const choices=definition.choices.map(choice=>{
        const summary=summarize(filterBrowseMatches(base,{[definition.key]:choice.value},options));
        const available=summary.report_count>0;
        return {...choice,count:summary.report_count,count_unit:'reports',available,eligible:available,selected:selected[definition.key]===choice.value,summary};
      });
      const active=selected[definition.key]!=='all';
      if(active&&!choices.some(choice=>choice.selected))choices.push({value:selected[definition.key],label:selected[definition.key],count:0,count_unit:'reports',available:false,eligible:false,selected:true,unrecognized:true});
      const selectedChoice=choices.find(choice=>choice.selected),summary=summarize(base);
      return {key:definition.key,label:definition.label,count_unit:'reports',active,visible:active||choices.some(choice=>choice.available),value:selected[definition.key],empty:active&&!selectedChoice?.available,insufficient:false,
        options:[{value:'all',label:'All',selected:!active,count:summary.report_count,count_unit:'reports',available:true,eligible:true},...choices.filter(choice=>choice.available||choice.selected)],choices,summary,
        message:active&&!selectedChoice?.available?'No matching reports.':null};
    });
  }
  function resultSignature(matches,options={}){
    const artifact=options.classifications||{};
    return JSON.stringify({schema_version:1,classification_version:artifact.classification_version||null,source_file_sha256:artifact.source_file_sha256||null,clinical_content_sha256:artifact.clinical_content_sha256||null,
      classification_content_sha256:artifact.content_sha256||artifact.classification_content_sha256||null,
      results:unique(list(matches).flatMap(match=>list(match.results).map(resultKey))).sort(),
      classifications:unique(list(matches).flatMap(match=>list(match.results).map(row=>{
        const entry=artifact.results?.[row.result_id];return JSON.stringify([row.result_id,entry?.profile_id||entry||null]);
      }))).sort()});
  }
  function savedAnalysisMatches(analysis,matches,selections={},options={}){
    if(!activeCount(selections))return true;
    if(analysis?.validated!==true||!evidenceSummary(matches,options).sufficient)return false;
    const scope=analysis.advanced_filter_scope;
    return !!scope&&scope.result_signature===resultSignature(matches,options)&&JSON.stringify(normalizeSelections(scope.selections))===JSON.stringify(normalizeSelections(selections));
  }
  function filterSavedAnalyses(analyses,matches,selections={},options={}){return list(analyses).filter(analysis=>savedAnalysisMatches(analysis,matches,selections,options));}
  return Object.freeze({MIN_INDEPENDENT_STUDIES_PER_FILTER_CHOICE,definitions:DEFINITIONS,normalizeSelections,resetSelections,activeCount,resultKey,resultClassification,resultMatches,tagsForResult,filterMatches,sampleKey,sampleClassification,classifiedSampleMatches,filterBrowseMatches,sampleMatches,countEligible,facets,evidenceSummary,browseSummary,browseFacets,resultSignature,savedAnalysisMatches,filterSavedAnalyses});
});
