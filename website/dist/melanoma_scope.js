(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MelanomaScope=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // A veto over existing source/display qualifications. A true result does
  // not establish source validity, clinical validity, pooling or independence.
  const other=/\b(?:NSCLC|SCLC|RCC|non[\s-]*small[\s-]*cell lung|small[\s-]*cell lung|lung (?:cancer|carcinoma)|renal(?: cell)? (?:cancer|carcinoma)|breast cancer|prostate cancer|colorectal (?:cancer|carcinoma)|colon (?:cancer|carcinoma)|urothelial(?: cancer| carcinoma)?|bladder cancer|ovarian (?:cancer|carcinoma)|pancreatic (?:cancer|carcinoma)|gastric (?:cancer|carcinoma)|hepatocellular carcinoma|hepatocarcinoma|head.and.neck (?:cancer|carcinoma)|glioma|glioblastoma|mesothelioma|sarcoma|lymphoma|leukemia|leukaemia|thyroid (?:cancer|carcinoma)|endometrial (?:cancer|carcinoma)|esophageal (?:cancer|carcinoma)|squamous cell carcinoma)\b/i;
  const nonMel=/\b(?:non[\s\-‐‑‒–—]*|not\s+|without\s+)melanomas?\b/i;
  const melanoma=/\b(?:melanomas?|SKCM)\b/i;
  const nonhuman=/\b(?:cell lines?|cell cultures?|in vitro|murine|xenografts?|mice|mouse|organoids?)\b/i;
  const mixed=/\b(?:mixed[\s-]*(?:cancers?|tumou?rs?|histolog(?:y|ies))|pan[\s-]*cancer|solid tumou?rs?|multiple cancers?|across cancers?|all cancer patients)\b/i;
  const separated=/\bmelanoma\s+(?:subset|subgroup|cohort|patients?|population)\b/i;
  function melanomaPopulation(label){return melanoma.test(label)&&(!mixed.test(label)||separated.test(label)||/\bmelanoma\s+trial\s+cohort\b|\b(?:with|having)\s+(?:(?:malignant|metastatic|advanced|unresectable|cutaneous|mucosal|acral|ocular|choroidal|uveal)[\s/]+){0,3}melanoma\b/i.test(label));}
  function foreignCancer(value){const text=String(value||'').replace(new RegExp('\\b(?:no|without|excluding)\\s+(?:patients?\\s+with\\s+)?(?:'+other.source+')','gi'),'').replace(new RegExp('(?:'+other.source+')\\s+(?:patients?\\s+)?(?:were|was|are|is)?\\s*excluded\\b','gi'),'');return other.test(text);}
  function text(x){if(typeof x==='string')return x;if(!x||typeof x!=='object')return '';return [x.label,x.description,x.text].map(v=>typeof v==='string'?v:v&&typeof v.text==='string'?v.text:'').filter(Boolean).join(' ');}
  function scopeState(x){if(!x||typeof x!=='object')return '';return String(x.population_scope||'').toLowerCase();}
  function ownTexts(row){
    const fact=row.original_fact||{},descriptive=!!row.arm&&!/^(?:HR|OR|RR|SHR|TR|RD|MD|SMD|hazard ratio|odds ratio|risk ratio|relative risk)$/i.test(String(row.measure||fact.measure||'').trim());
    return [text(row.population),text(row.source_population),text(row.endpoint&&row.endpoint.definition),
      text(row.arm),...(!descriptive?[text(row.experimental_arm),text(row.comparator_arm)]:[]),
      String(row.variable||''),String(fact.text||''),String(fact.field||''),String((row.model||row.analysis||{}).estimand||'')].filter(Boolean);
  }
  function mixedStudy(study){
    if(!study)return false;
    const title=String(study.title||'');
    if(melanoma.test(title)&&foreignCancer(title))return true;
    const rows=[...(study.details&&study.details.quantitative_results||[]),...(study.details&&study.details.sample_size_records||[]),...(study.quantitative_results||[]),...(study.sample_size_records||[])];
    return rows.some(r=>foreignCancer(text(r.population))||['mixed_cancers','other_cancer'].includes(scopeState(r.population)));
  }
  // Acquire anew for each filter/render operation. This is a caller-owned
  // snapshot, never a cache across operations or mutations of study fixtures.
  const contextFor=(study,{evidenceRegistry=null}={})=>Object.freeze({study,mixed:mixedStudy(study),evidenceRegistry:evidenceRegistry||(study&&study.details&&study.details.evidence_registry)||null});
  const contextMatches=(study,context)=>!!context&&context.study===study&&typeof context.mixed==='boolean';
  const isMixed=(study,context)=>contextMatches(study,context)?context.mixed:mixedStudy(study);
  function assess(row,{comparison=null,study=null,context=null}={}){
    if(!row||typeof row!=='object')return {allowed:false,reason:'missing_result'};
    if(row.main_result_eligible===false)return {allowed:false,reason:'existing_scope_hold'};
    const state=scopeState(row.population);
    if(['other_cancer','mixed_cancers','nonhuman'].includes(state))return {allowed:false,reason:state};
    const model=row.model||row.analysis||{},population=row.population||{},fact=row.original_fact||{};
    const modelPopulation=model.analysis_population_id||model.population_id,actualPopulation=fact.result_population_id||fact.population_id||population.entity_id||population.population_id;
    if(modelPopulation&&actualPopulation&&modelPopulation!==actualPopulation){
      const reviewed=(study&&study.reviews||[]).filter(v=>!row.review_binding_sha256||v.review_namespace===row.review_binding_sha256.slice(0,24));
      const entities=new Map(reviewed.flatMap(v=>v.entities||[]).map(e=>[e.entity_id,e]));
      let current=population,seen=new Set(),supported=false;
      while(current&&current.parent_id&&entities.has(current.parent_id)&&!seen.has(current.parent_id)){
        seen.add(current.parent_id);current=entities.get(current.parent_id);
        if(current.entity_id===modelPopulation&&(population.evidence_ids||[]).some(id=>(current.evidence_ids||[]).includes(id)))supported=true;
      }
      if(!supported)return {allowed:false,reason:'model_population_mismatch'};
    }
    const texts=ownTexts(row),local=texts.join(' ');
    if(nonMel.test(local))return {allowed:false,reason:'explicit_non_melanoma'};
    if(nonhuman.test(local))return {allowed:false,reason:'nonhuman_population'};
    if(foreignCancer(local))return {allowed:false,reason:'explicit_other_cancer'};
    if(mixed.test(text(row.population))&&!melanomaPopulation(text(row.population)))return {allowed:false,reason:'unseparated_mixed_population'};
    const ownPopulation=[text(row.population),text(row.source_population),text(row.arm)].join(' ');
    if(isMixed(study,context)&&!melanoma.test(ownPopulation))return {allowed:false,reason:'mixed_study_without_melanoma_result_binding'};
    if(comparison){
      const comparisonPopulation=comparison.population;
      if(comparisonPopulation&&(foreignCancer(text(comparisonPopulation))||['other_cancer','mixed_cancers','nonhuman'].includes(scopeState(comparisonPopulation))))return {allowed:false,reason:'foreign_comparison_population'};
    }
    return {allowed:true,reason:'no_result_scope_veto'};
  }
  const resultEligible=(row,options)=>assess(row,options).allowed;
  function sampleEligible(row,{comparison=null,study=null,context=null}={}){
    if(!row||row.main_result_eligible===false)return false;
    if(['other_cancer','mixed_cancers','nonhuman'].includes(scopeState(row.population)))return false;
    const population=text(row.population),arm=text(row.arm),identity=[population,text(row.source_population),arm].join(' ');
    if(foreignCancer(identity)||nonMel.test(identity)||nonhuman.test(identity))return false;
    if(mixed.test(population)&&!melanomaPopulation(population))return false;
    if(comparison&&comparison.population&&(foreignCancer(text(comparison.population))||['other_cancer','mixed_cancers','nonhuman'].includes(scopeState(comparison.population))))return false;
    // A specific melanoma population assertion is independent of extraction
    // format. A broad unspecified tag still cannot identify a mixed cohort.
    if(scopeState(row.population)==='melanoma'||row.population?.melanoma_population==='cutaneous'||melanomaPopulation(identity))return true;
    const registry=contextMatches(study,context)&&context.evidenceRegistry;
    const ids=[...((row.population||{}).evidence_ids||[]),...(((row.population||{}).description||{}).evidence_ids||[])];
    const quotes=registry?ids.map(id=>{const key=(row.review_binding_sha256?'CE-'+row.review_binding_sha256.slice(0,24)+'-':'')+id;const e=registry instanceof Map?(registry.get(id)||registry.get(key)):(registry[id]||registry[key]);return e&&(e.supporting_quote||e.quote)||'';}).filter(Boolean):[];
    if(quotes.length)return !quotes.some(foreignCancer)&&(quotes.some(q=>melanoma.test(q))||!isMixed(study,context));
    return !isMixed(study,context);
  }
  function comparisonEligible(comparison,{results=[],samples=[],study=null,context=null}={}){
    if(!comparison||comparison.comparison_filter_eligible===false)return false;
    const arms=[comparison.comparator_arm,comparison.intervention_arm,...(comparison.comparator_arms||[]),...(comparison.intervention_arms||[])];
    const labels=[comparison.comparator_label,comparison.intervention_label,...arms.map(text)].filter(Boolean).join(' ');
    if(foreignCancer(labels)||nonMel.test(labels)||nonhuman.test(labels)||(mixed.test(text(comparison.population))&&!melanomaPopulation(text(comparison.population))))return false;
    const operationContext=contextMatches(study,context)?context:contextFor(study);
    const resultIds=new Set(comparison.result_ids||[]),linked=results.filter(r=>r.comparison_id===comparison.comparison_id||[r.result_id,...(r.source_extraction_ids||[])].some(id=>resultIds.has(id)));
    if(linked.length)return linked.some(r=>resultEligible(r,{comparison,study,context:operationContext}));
    if(!operationContext.mixed)return true; // Preserve previously qualified count-only branches.
    const scope=comparison.scope||{};
    return samples.some(s=>{
      if(!sampleEligible(s,{comparison,study,context:operationContext}))return false;
      if(scope.report_id&&s.report_id&&scope.report_id!==s.report_id)return false;
      if(scope.source_input_sha256&&s.source_input_sha256&&scope.source_input_sha256!==s.source_input_sha256)return false;
      const population=s.population_id||(s.population||{}).population_id||(s.population||{}).entity_id;
      return !!scope.population_id&&scope.population_id===population;
    });
  }
  return {contextFor,assess,resultEligible,sampleEligible,comparisonEligible};
});
