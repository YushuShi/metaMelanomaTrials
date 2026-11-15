(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./numeric_evidence_release.js'));
  else root.NumericEvidenceDisplay=factory(root.NumericEvidenceRelease);
}(typeof globalThis!=='undefined'?globalThis:this,function(release){
  'use strict';
  const VERSION='finite-original-nine-PMID-append-private-preview-v6';
  const FLAGS=['clinical_validation','clinical_verified','pooling_eligible','report_R3_complete','final_R3_complete','numerical_extraction_complete','source_report_coverage_complete'];
  const need=(ok,message)=>{if(!ok)throw new Error(message);};
  const clone=(value)=>JSON.parse(JSON.stringify(value));
  function same(a,b){
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
    const x=Object.keys(a).sort(),y=Object.keys(b).sort();
    return x.length===y.length&&x.every((k,i)=>k===y[i]&&same(a[k],b[k]));
  }
  function signature(row){return {
    result_id:row.result_id,record_kind:row.record_kind,review_artifact_sha256:row.review_artifact_sha256,
    source_input_sha256:row.source_input_sha256,source_task_id:row.source_task_id,
    main_result_eligible:row.main_result_eligible,reported_numbers:row.reported_numbers,
    fact_display_qualification:row.fact_display_qualification};}
  function numberView(number,item){
    need(same(number,item.number),'Number view differs from its source-bound canonical wrapper.');
    const scalar=item.display_value==='NA'?number.value===null:
      item.non_scalar_source_literal===true?number.value===null&&item.arabic_value===null:
      typeof number.value==='number'&&Number.isFinite(number.value)&&number.value===item.arabic_value&&
      Number(item.display_value.replace(/^[<>≤≥]/,''))===number.value;
    need(typeof item.display_value==='string'&&scalar,'Unverified Arabic/NA display value.');
    return {...number,semantic_display_checked:true,semantic_display_value:item.display_value,
      semantic_missing_reason:item.missing_reason||null,semantic_non_scalar_source_literal:item.non_scalar_source_literal===true,
      semantic_numeric_role:number.role||null};
  }
  function numericRow(row){
    const out={...row,reported_numbers:row.reported_numbers.map((n)=>({...n}))};
    for(const item of row.number_normalization_provenance||[]){
      const i=item.number_index;need(Number.isInteger(i)&&i>=0&&i<row.reported_numbers.length,'Number view escaped its fact.');
      out.reported_numbers[i]=numberView(row.reported_numbers[i],item);
      const role=item.number.role;
      if(same(row[role],item.number))out[role]=numberView(row[role],item);
    }
    if(row.main_result_eligible){
      const q=row.fact_display_qualification,ids=q.main_numeric_wrapper_allowlist.map((x)=>x.number_index);
      need(ids.length&&new Set(ids).size===ids.length,'A qualified result needs its exact numerical allowlist.');
      out.reported_numbers=ids.map((i)=>out.reported_numbers[i]);
      const roles=new Set(q.main_numeric_wrapper_allowlist.map((x)=>x.role));
      for(const role of release.scalar_fields)if(!roles.has(role))out[role]=clone(release.missing_number);
      need(!out.reported_numbers.some((n)=>['dose','sample_size','denominator'].includes(n.role)),
        'Descriptors, population N and inferred denominators cannot enter these six results.');
      need(out.analysis_n.value===null&&out.denominator.value===null,'Endpoint N is not established for the finite six facts.');
      out.display_measure=q.main_display_measure;out.main_display_label=q.main_display_label;
      out.variable=q.main_display_label;
      const categories=q.main_numeric_wrapper_allowlist.map((x)=>x.endpoint_category);
      if(categories.some((x)=>['complete_response','partial_response','no_response'].includes(x)))
        need(out.display_measure==='response_probability'&&q.aggregate_ORR===false,'Response categories cannot become aggregate ORR.');
      out.numeric_completion_v6_no_endpoint_N_inference=true;
    }
    out.numeric_completion_v6_display_checked=true;
    return out;
  }
  function treatedContext(rawStudy,registry){
    if(String(rawStudy.pmid)!=='29723355')return null;
    const expected=release.existing_treated_context;
    const sample=(rawStudy.details.sample_size_records||[]).find((r)=>r.sample_record_id===expected.sample_record_id);
    need(sample&&same(sample,expected.source_sample),'Existing treated-population context changed.');
    need(sample.n.value===16&&sample.n.role==='sample_size'&&sample.n.unit==='patients'&&sample.n.status==='reported'
      &&sample.original_fact.fact_id==='F4'&&sample.original_fact.model_id===null&&sample.original_fact.endpoint_id===null,
      'The existing N16 is treated context only.');
    for(const anchor of expected.anchors){const actual=registry[anchor.evidence_id];need(actual&&same(actual,anchor.source),'Treated N16 source anchor changed.');}
    return {label:'Reported treated participants',value:16,role:'treated',source_sample_id:sample.sample_record_id,
      endpoint_or_analysis_N:false,may_fill_denominator:false,may_compute_rate:false};
  }
  function applyDataset(payload,displayedStudies){
    if(!payload.numeric_completion_v6_display_overlay)return displayedStudies||payload.studies;
    need(release&&release.status==='finite_pilot_display_release'&&release.raw_rows===10854&&release.article_count===821,'Finite pilot display release is missing.');
    const overlay=payload.numeric_completion_v6_display_overlay;
    need(overlay.version===VERSION&&overlay.original_scientific_objects_unchanged===true&&overlay.raw_R2_labels_unchanged===true
      &&overlay.clinical_verified===false&&overlay.pooling_eligible===false&&overlay.final_R3_complete===false,'Display overlay certification boundary changed.');
    const rawBy=new Map(payload.studies.map((s)=>[s.report_id,s]));
    need(rawBy.size===821&&(displayedStudies||payload.studies).length===821,'PMID article count changed.');
    const newIds=new Set(),known=new Map(release.new_rows.map((r)=>[r.result_id,r]));let total=0;
    for(const study of payload.studies)for(const row of study.details.quantitative_results){
      total++;
      if(/^R3V6P?-R-/.test(row.result_id)){
        need(!newIds.has(row.result_id)&&known.has(row.result_id)&&same(signature(row),known.get(row.result_id)),
          'Foreign or changed numerical-pilot result.');
        need(FLAGS.every((k)=>row[k]===false),'Source checks cannot certify full review, clinical validity or pooling.');
        newIds.add(row.result_id);
      }
    }
    need(total===10854&&newIds.size===15&&newIds.size===known.size,'Finite pilot row coverage changed.');
    return (displayedStudies||payload.studies).map((study)=>{
      if(!release.target_reports.includes(study.report_id))return study;
      const raw=rawBy.get(study.report_id),view=overlay.by_PMID[String(study.pmid)];
      need(raw&&view&&view.report_id===study.report_id&&view.old_effective_holds_preserved===true,'Foreign article display overlay.');
      const rawRows=new Map(raw.details.quantitative_results.map((r)=>[r.result_id,r]));
      const allow=new Set(view.allowed_result_ids),samples=new Set(view.allowed_sample_record_ids),comparisons=new Set(view.allowed_comparison_ids);
      const links=raw.details.v6_confirmed_source_finding_links||[],hidden=new Set(links.map((l)=>l.member_result_ids[0]));
      need(links.every((l)=>l.kind==='same_report_response_category_with_additional_count_evidence'&&l.numbers_combined===false
        &&l.population_or_model_joins_inferred===false&&l.independent_trial_inferred===false&&l.member_result_ids.length===2
        &&rawRows.has(l.member_result_ids[0])&&release.main_result_ids.includes(l.representative_result_id)),
        'Source finding link changed.');
      for(const row of rawRows.values()){
        const expected=known.has(row.result_id)?release.main_result_ids.includes(row.result_id):
          raw.default_visible===true&&raw.current_main_eligible!==false&&row.main_result_eligible!==false&&!hidden.has(row.result_id);
        need(allow.has(row.result_id)===expected,'An earlier draft/hold or unqualified fact was promoted.');
      }
      need([...allow].every((id)=>rawRows.has(id)),'Display allowlist has a foreign result.');
      const rows=study.details.quantitative_results.map((row)=>{
        const original=rawRows.get(row.result_id);let out=known.has(row.result_id)?numericRow(original):{...row};
        out.main_result_eligible=allow.has(row.result_id);
        out.raw_source_record=original;
        if(hidden.has(row.result_id))out.same_source_finding_history_only=true;
        return out;
      });
      const counts=(study.details.sample_size_records||[]).map((s)=>({...s,main_result_eligible:samples.has(s.sample_record_id),raw_source_record:raw.details.sample_size_records.find((r)=>r.sample_record_id===s.sample_record_id)}));
      need(counts.filter((s)=>release.new_sample_ids.includes(s.sample_record_id)).every((s)=>s.main_result_eligible===false),'Statistical counts cannot become population N.');
      const groups=(study.details.canonical_result_groups||[]).map((g)=>{
        const next={...g},override=view.representative_result_overrides[g.canonical_result_id];
        if(override){need(g.member_result_ids.includes(override)&&allow.has(override),'Foreign canonical representative override.');next.representative_result_id=override;}
        return next;
      });
      return {...study,current_main_eligible:view.article_current_after,default_visible:view.article_current_after,
        numeric_completion_v6_treated_context:treatedContext(raw,payload.evidence_registry),
        comparisons:study.comparisons.map((c)=>({...c,comparison_filter_eligible:comparisons.has(c.comparison_id)})),
        single_arm_regimens:(study.single_arm_regimens||[]).map((c)=>({...c,comparison_filter_eligible:comparisons.has(c.comparison_id)})),
        details:{...study.details,quantitative_results:rows,sample_size_records:counts,canonical_result_groups:groups}};
    });
  }
  function label(row){return row?.numeric_completion_v6_display_checked===true&&typeof row.main_display_label==='string'?row.main_display_label:null;}
  return Object.freeze({applyDataset,label,signature,same});
}));
