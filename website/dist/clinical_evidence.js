/* Source-qualified canonical graphs join the existing guarded PMID view. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.ClinicalEvidence=factory();
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const FLAGS=['clinical_validation','clinical_verified','pooling_eligible','report_R3_complete','final_R3_complete','numerical_extraction_complete','source_report_coverage_complete'];
  const need=(ok,message)=>{if(!ok)throw new Error(message);};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function checked(payload){
    need(payload?.schema_version===1&&payload.status==='ready'&&payload.record_kind==='canonical_clinical_evidence'&&Array.isArray(payload.articles)&&FLAGS.every(k=>payload[k]===false),'Checked clinical evidence required');
    need(payload.evidence_registry&&typeof payload.evidence_registry==='object'&&!Array.isArray(payload.evidence_registry),'Clinical source registry required');
    const pmids=new Set(),results=new Set();
    for(const article of payload.articles){
      need(/^\d+$/.test(article.pmid)&&/^report-[a-f0-9]{24}$/.test(article.report_id)&&!pmids.has(article.pmid)&&['retain','exclude','unclear'].includes(article.current_screening_status),'Unique PMID/stage decision required');pmids.add(article.pmid);
      need(typeof article.current_main_eligible==='boolean'&&article.current_main_eligible===(article.current_screening_status==='retain'&&!article.publication_hold),'Clinical article eligibility differs');
      for(const key of ['quantitative_results','sample_size_records','comparisons','reviews'])need(Array.isArray(article[key]),'Clinical graph arrays required');
      for(const row of article.quantitative_results){
        need(/^CE-[a-f0-9]{24}-F-[a-f0-9]{16}$/.test(row.result_id)&&!results.has(row.result_id)&&row.report_id===article.report_id&&row.pmid===article.pmid&&FLAGS.every(k=>row[k]===false)&&row.validated===false,'Clinical result identity or certification changed');results.add(row.result_id);
        need(Array.isArray(row.reported_numbers)&&Array.isArray(row.evidence_ids)&&row.evidence_ids.every(id=>Object.hasOwn(payload.evidence_registry,id)),'Clinical source passage missing');
        for(const number of row.reported_numbers){
          need(number.value===null||(typeof number.value==='number'&&Number.isFinite(number.value)),'Invalid clinical value');
          need(Array.isArray(number.evidence_ids)&&number.evidence_ids.every(id=>Object.hasOwn(payload.evidence_registry,id)),'Clinical numeric source missing');
        }
      }
      const ids=new Set(article.quantitative_results.map(r=>r.result_id));
      for(const comparison of article.comparisons)need(Array.isArray(comparison.result_ids)&&comparison.result_ids.every(id=>ids.has(id)),'Clinical comparison has a foreign fact');
      for(const sample of article.sample_size_records)need(sample.record_kind==='canonical_patient_context'&&sample.report_id===article.report_id&&sample.pmid===article.pmid&&FLAGS.every(k=>sample[k]===false)&&sample.evidence_origin==='own_report_results'&&sample.scope==='observed'&&['enrolled','eligible','randomized','treated','response_evaluable','safety','subgroup'].includes(sample.sample_context_role)&&typeof sample.n?.value==='number'&&Number.isInteger(sample.n.value)&&sample.n.value>=0&&/^(?:patients?|participants?|subjects?|people|persons?)$/i.test(sample.n.unit||'')&&(sample.n.evidence_ids||[]).every(id=>Object.hasOwn(payload.evidence_registry,id)),'Unchecked participant-count purpose refused');
    }
    return payload;
  }
  function sourceSignature(row,registry,comparisons=[]){
    const quotes=(row.evidence_ids||[]).map(id=>registry[id]?.supporting_quote).filter(Boolean).sort();
    if(!quotes.length||!row.population||!row.endpoint)return null;
    const text=value=>typeof value==='string'?value:value?.text||value?.label||'';
    const population=text(row.population.label||row.population.description);
    if(!population)return null;
    const model=row.model?{family:text(row.model.family),estimand:text(row.model.estimand),contrast:row.model.contrast_type,adjusted:row.model.adjusted_status,variables:(row.model.variables||[]).map(v=>({name:v.name,role:v.role,scope:v.scope}))}:null;
    if(row.model_id&&!model)return null;
    const comparison=comparisons.find(c=>c.comparison_id===row.comparison_id);
    const arms={intervention:text(row.experimental_arm?.label||row.arm?.label||comparison?.additional_intervention_label),comparator:text(row.comparator_arm?.label||comparison?.comparator_label)};
    if(row.contrast_type==='treatment_comparison'&&(!arms.intervention||!arms.comparator))return null;
    if(row.contrast_type==='single_arm'&&!arms.intervention)return null;
    // Compact records carry exact source-owned population and arm IDs. Drug-only
    // browsing labels deliberately omit doses, so they cannot identify a result
    // context or decide that two dose arms conflict.
    const q=row.quantitative_record;
    const compactScope=q?{
      source:row.source_input_sha256,population_id:q.population_id,arm_id:q.arm_id||null,
      intervention_arm_id:q.intervention_arm_id||null,reference_arm_id:q.reference_arm_id||null,
      definition:q.endpoint_definition,cutoff:q.cutoff,adjusted:q.adjusted||null,model:q.model||null,
      time:q.time??q.assessment_time??null,time_unit:q.time_unit||null,
      response_criteria:q.response_criteria||null,safety_attribution:q.safety_attribution||null,
      regimens:['intervention','comparator','outcome'].map(side=>{
        const graph=comparison?.[side+'_native_regimen'];
        return graph?{side,arm_id:graph.arm_id,root:graph.root_node_id,nodes:(graph.nodes||[]).map(node=>({id:node.node_id,kind:node.kind,name:node.name,children:node.children,dose:node.dose,route:node.route,schedule:node.schedule}))}:null;
      })
    }:undefined;
    return JSON.stringify({...(compactScope?{compact_scope:compactScope}:{}),population,observed_arm:text(row.arm?.label),endpoint:text(row.endpoint.definition),measure:row.display_measure||row.measure||row.effect_measure,
      variable:text(row.variable),contrast:row.contrast_type,arms,model,cutoff:text(row.cutoff?.label||row.cutoff),
      countPurpose:row.original_fact?.count_context||row.denominator_type||null,
      numbers:(row.source_reported_numbers||row.reported_numbers||[]).map(n=>({role:n.role,status:n.status,value:n.value,unit:n.unit,qualifier:n.qualifier,raw_text:n.raw_text})).sort((a,b)=>a.role.localeCompare(b.role)),quotes});
  }
  function findingContext(row,registry,comparisons){
    const signature=sourceSignature(row,registry,comparisons);if(!signature)return null;
    const value=JSON.parse(signature);value.numbers=value.numbers.filter(n=>['timepoint','follow_up','other','sample_size','denominator'].includes(n.role));return JSON.stringify(value);
  }
  function merge(studies,registry,payload){
    checked(payload);
    const evidence={...registry};
    for(const[id,entry]of Object.entries(payload.evidence_registry)){
      need(!Object.hasOwn(evidence,id)||same(evidence[id],entry),'Clinical source ID collision');evidence[id]=entry;
    }
    const records=new Map(),reportIds=new Map();
    for(const study of studies){const id=String(study.pmid||'');need(id&&!records.has(id),'One baseline article per PMID required');records.set(id,study);reportIds.set(study.report_id,id);}
    for(const incoming of payload.articles){
      const old=records.get(incoming.pmid);
      need(!reportIds.has(incoming.report_id)||reportIds.get(incoming.report_id)===incoming.pmid,'Clinical report ID crosses PMID');
      if(old)need(old.report_id===incoming.report_id,'PMID has conflicting canonical report identity');
      const eligible=incoming.current_main_eligible,previouslyEligible=!!old&&old.default_visible===true&&old.current_main_eligible!==false;
      const details=old?.details||{},oldRows=details.quantitative_results||[];
      const oldIds=new Set(oldRows.map(r=>r.result_id));
      need(incoming.quantitative_results.every(r=>!oldIds.has(r.result_id)),'Clinical result duplicates a saved result ID');
      // An article-level retention decision cannot promote an old draft/hold.
      const baselineRows=oldRows.map(row=>eligible&&previouslyEligible?{...row}:{...row,main_result_eligible:false,raw_source_record:row});
      const newRows=incoming.quantitative_results.map(row=>({...row,main_result_eligible:eligible&&row.main_result_eligible===true}));
      const rows=[...baselineRows,...newRows];
      const oldGroups=details.canonical_result_groups||oldRows.map(row=>({canonical_result_id:'saved-'+row.result_id,member_result_ids:[row.result_id],representative_result_id:row.result_id}));
      const groups=oldGroups.map(group=>({...group,member_result_ids:[...group.member_result_ids]}));
      const signatures=new Map();
      for(const row of baselineRows){if(row.main_result_eligible===false)continue;const signature=sourceSignature(row,evidence,old?.comparisons);if(signature)signatures.set(signature,row.result_id);}
      for(const row of newRows){
        const signature=row.main_result_eligible?sourceSignature(row,evidence,incoming.comparisons):null;
        const duplicate=signature&&signatures.get(signature);
        const group=duplicate&&groups.find(g=>g.member_result_ids.includes(duplicate));
        if(group)group.member_result_ids.push(row.result_id);
        else groups.push({canonical_result_id:'clinical-'+row.result_id,member_result_ids:[row.result_id],representative_result_id:row.result_id});
        if(signature&&!duplicate)signatures.set(signature,row.result_id);
      }
      const contexts=new Map(),conflicts=[];
      for(const row of rows){
        if(row.main_result_eligible===false)continue;
        const comparisons=[...(old?.comparisons||[]),...incoming.comparisons];
        const context=findingContext(row,evidence,comparisons);if(!context)continue;
        if(!contexts.has(context))contexts.set(context,[]);contexts.get(context).push(row);
      }
      for(const matches of contexts.values()){
        const signatures=new Set(matches.map(r=>sourceSignature(r,evidence,[...(old?.comparisons||[]),...incoming.comparisons])));
        if(signatures.size>1){matches.forEach(r=>{r.extraction_conflict=true;});conflicts.push({result_ids:matches.map(r=>r.result_id),reason:'Different extracted values for the same source-linked clinical context; no averaging.'});}
      }
      const safeSamples=eligible&&previouslyEligible?(details.sample_size_records||[]):(details.sample_size_records||[]).map(s=>({...s,main_result_eligible:false,raw_source_record:s}));
      const samples=incoming.sample_size_records.map(s=>({...s,main_result_eligible:eligible&&s.main_result_eligible===true}));
      const safeComparisons=eligible&&previouslyEligible?(old?.comparisons||[]):(old?.comparisons||[]).map(c=>({...c,comparison_filter_eligible:false,comparator_filter_eligible:false}));
      const comparisons=incoming.comparisons.map(c=>({...c,comparison_filter_eligible:eligible&&c.comparison_filter_eligible===true,comparator_filter_eligible:eligible&&c.comparator_filter_eligible===true}));
      records.set(incoming.pmid,{...(old||{report_id:incoming.report_id,pmid:incoming.pmid,title:incoming.title,year:incoming.year,first_author_surname:incoming.first_author_surname,doi:incoming.doi,single_arm_regimens:[]}),
        default_visible:eligible,current_main_eligible:eligible,current_screening_status:incoming.current_screening_status,
        comparisons:[...safeComparisons,...comparisons],
        details:{...details,quantitative_results:rows,sample_size_records:[...safeSamples,...samples],
          canonical_result_groups:groups,clinical_reviews:incoming.reviews,clinical_extraction_conflicts:conflicts,current_decision_reason:incoming.decision_reason}});
      reportIds.set(incoming.report_id,incoming.pmid);
    }
    return {studies:[...records.values()],evidence_registry:evidence};
  }
  return Object.freeze({checked,merge,sourceSignature});
});
