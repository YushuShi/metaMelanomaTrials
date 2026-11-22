/* Apply audited full-text additions to the Studies view after validating its saved inputs. */
(function(root,factory){
  const common=typeof module==='object'&&module.exports;
  const api=common?factory(require('./treatment_source_reviews.js'),require('./regimen_definitions.js'),require('./quantitative_extraction.js')):
    factory(root.TreatmentSourceReviews,root.RegimenDefinitions,root.QuantitativeExtraction);
  if(common)module.exports=api;else root.StudySourceProjection=api;
})(globalThis,function(reviews,regimens,compact){
  'use strict';
  function numeric(role,value,evidence,unit=null){
    return {role,value,status:'reported',qualifier:'equal',unit,evidence_ids:evidence,raw_text:String(value)};
  }
  function courseComparison(original,study,ncts){
    let comparison=original;
    for(const side of ['comparator','intervention','outcome']){
      const armId=original[side+'_arm_id'];
      if(!armId)continue;
      const desc=regimens.describe(regimens.resolve(original,side));
      const course=reviews.course({pmid:study.pmid,doi:study.doi,ncts,armId,
        agentIds:desc.agent_ids,sourceSha256:original.scope?.source_input_sha256});
      if(!course)continue;
      const label=course.phases.map(phase=>phase.join(' + ')).join(' → ');
      if(comparison===original)comparison={...original};
      comparison[side+'_label']=label;
      if(side==='intervention')comparison.additional_intervention_label=label;
      if(side==='outcome')comparison.outcome_arm_label=label;
      delete comparison[side+'_regimen'];
      delete comparison[side+'_native_regimen'];
      comparison.reviewed_courses={...comparison.reviewed_courses,[side]:{label,source:course.source}};
    }
    return comparison===original?original:regimens.prepareComparison(comparison);
  }
  function enrich(study,wrapper,sourceArticle){
    const record=wrapper.record,sha=record.source_sha256,prefix='CE-'+sha.slice(0,24)+'-';
    if(study.details.quantitative_extraction.some(w=>w.reviewed_full_text?.source_sha256===sha))return study;
    const comparisons=[],results=[],groups=[];
    for(const effect of record.effects){
      if(effect.origin!=='own_report'||effect.endpoint!=='OS'||effect.measure!=='HR')continue;
      const population=record.populations.find(p=>p.id===effect.population_id&&p.melanoma_only==='yes');
      const arms=[effect.reference_arm_id,effect.intervention_arm_id].map(id=>record.arms.find(a=>a.id===id));
      const counts=arms.map(arm=>record.sample_sizes.filter(s=>s.arm_id===arm?.id&&s.population_id===effect.population_id&&s.cutoff===effect.cutoff&&s.complete==='yes'&&s.disjoint==='yes'&&s.count_purpose==='treated'&&s.method==='reported'));
      if(!population||arms.some(a=>!a)||arms[0].id===arms[1].id||counts.some(rows=>rows.length!==1||!Number.isSafeInteger(rows[0].n)))continue;
      const pair=counts.map(rows=>rows[0]),n=pair[0].n+pair[1].n,effectIds=effect.evidence,countIds=pair.flatMap(c=>c.evidence);
      const resultId=prefix+'F-'+effect.id,comparisonId=prefix+'C-'+effect.id,populationId=prefix+population.id;
      const common={pmid:study.pmid,report_id:study.report_id,review_stage:record.stage,review_binding_sha256:sha,source_input_sha256:sha,population_id:populationId};
      const pop={entity_id:population.id,label:population.label,population_scope:'melanoma',result_scope:population.scope,evidence_ids:population.evidence};
      const [reference,intervention]=arms.map(a=>({entity_id:a.id,label:a.label,kind:'arm',evidence_ids:a.evidence}));
      const scope={...common,record_kind:'canonical_review_scope'};
      comparisons.push({comparison_id:comparisonId,kind:'treatment_comparison',scope,population:pop,comparator_label:reference.label,
        comparator_key:reference.label,comparator_arm_id:reference.entity_id,intervention_label:intervention.label,intervention_arm_id:intervention.entity_id,
        additional_intervention_label:intervention.label,comparison_filter_eligible:true,comparator_filter_eligible:true,result_ids:[resultId]});
      const size={n,status:'derived_arm_sum',basis:'sum_treated',count_purpose:'treated',count_ids:pair.map(c=>c.id),evidence_ids:countIds};
      const row={...common,result_id:resultId,comparison_id:comparisonId,record_kind:'canonical_clinical_fact',scope:'observed',population:pop,
        quantitative_record:{...effect,display_n:size},main_result_eligible:true,evidence_origin:'own_report_results',evidence_ids:effectIds,
        endpoint:{family:'overall_survival',definition:{text:effect.endpoint_definition,evidence_ids:effectIds}},measure:effect.measure,
        display_measure:effect.measure,measure_verbatim:effect.measure,variable:effect.endpoint,cutoff:{label:effect.cutoff},
        contrast_type:'treatment_comparison',result_relation:'between_arm',experimental_arm:intervention,comparator_arm:reference,
        estimate:numeric('estimate',effect.estimate,effectIds),ci_lower:numeric('ci_lower',effect.ci_lower,effectIds),
        ci_upper:numeric('ci_upper',effect.ci_upper,effectIds),confidence_level:numeric('confidence_level',effect.ci_level,effectIds,'%'),
        p_value:numeric('p_value',effect.p_value,effectIds),analysis_n:numeric('sample_size',n,countIds,'patients'),
        sample_size_basis:size.basis,scoped_sample_size:size,source_url:wrapper.reviewed_full_text.source_url,
        source_filter_bindings:reviews.filterBindings({record,article:sourceArticle,reviewedFullText:true},effect)};
      row.reported_numbers=[row.estimate,row.ci_lower,row.ci_upper,row.confidence_level,row.p_value];
      row.source_reported_numbers=row.reported_numbers;
      results.push(row);
      groups.push({canonical_result_id:'clinical-'+resultId,member_result_ids:[resultId],representative_result_id:resultId});
    }
    if(!results.length)return study;
    const details=study.details;
    return {...study,comparisons:[...study.comparisons,...comparisons],details:{...details,
      quantitative_extraction:[...details.quantitative_extraction,wrapper],
      quantitative_results:[...details.quantitative_results,...results],
      canonical_result_groups:[...details.canonical_result_groups,...groups]}};
  }
  function apply(studies,registry,quantitative){
    const checked=reviews.supplement(quantitative);
    const studyRows=studies.map(original=>{
      if(!original.current_main_eligible||!reviews.hasReview(original.pmid))return original;
      const publication=checked.articles.find(a=>a.pmid===original.pmid);
      const wrapper=publication?.records.find(w=>w.reviewed_full_text);
      const sourceArticle=quantitative.clinical_evidence.articles.find(a=>a.pmid===original.pmid);
      const study=wrapper?enrich(original,wrapper,sourceArticle):original;
      const ncts=compact.trialIdentifiers(study).nct_ids;
      const comparisons=study.comparisons.map(c=>courseComparison(c,study,ncts));
      return {...study,comparisons};
    });
    return {studies:studyRows,evidence_registry:checked===quantitative?registry:{...registry,...checked.clinical_evidence.evidence_registry}};
  }
  return Object.freeze({apply});
});
