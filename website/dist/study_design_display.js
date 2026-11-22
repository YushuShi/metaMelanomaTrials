/* Presentation metadata only: never revises screening, evidence or treatment effects. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.StudyDesignDisplay=factory();
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const list=value=>Array.isArray(value)?value:[];
  const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  const key=value=>String(value||'').trim().toLowerCase().replace(/[ -]+/g,'_');
  function acceptedRecords(study){
    return list(study?.details?.quantitative_extraction).filter(saved=>{
      const record=saved?.record;
      return ['R2','R3'].includes(saved?.stage)&&record?.stage===saved.stage&&String(record.pmid)===String(study.pmid)&&hash(record.source_sha256)&&record.validation?.decision_valid===true&&record.validation.source_sha256===record.source_sha256&&(saved.stage!=='R3'||hash(saved.source_proof_ref?.sha256));
    });
  }
  function designInfo(study){
    const choices=acceptedRecords(study).map((saved,index)=>({saved,index})).sort((a,b)=>(a.saved.stage==='R3'?1:0)-(b.saved.stage==='R3'?1:0)||a.index-b.index).reverse();
    for(const {saved} of choices){
      const type=key(saved.record.study?.study_type);
      const trial=['interventional_trial','randomized_trial','randomised_trial','clinical_trial','nonrandomized_trial','non_randomized_trial','single_arm_trial'].includes(type);
      const nontrial=['observational','observational_study','cohort','cohort_study','case_control','case_control_study','case_series','case_report','cross_sectional','cross_sectional_study'].includes(type);
      if(!trial&&!nontrial)continue;
      return {is_trial:trial,is_non_trial:nontrial,kind:trial?'trial':'observational',label:trial?'Trial':'Observational study',reason:`${saved.stage} study design: ${type.replace(/_/g,' ')}`,source_stage:saved.stage,source_sha256:saved.record.source_sha256};
    }
    // A registration number, a trial name or a title mention does not establish
    // the design of this particular report (for example, an ancillary cohort).
    return {is_trial:false,is_non_trial:false,kind:'unknown',label:'Study design not established',reason:'No accepted explicit study-design classification',source_stage:null,source_sha256:null};
  }
  function sourceInfo(study){
    const records=acceptedRecords(study), reviewedFullText=list(study?.details?.quantitative_extraction).some(wrapper=>
      wrapper.reviewed_full_text?.pmid===study.pmid && wrapper.record?.pmid===study.pmid &&
      hash(wrapper.record.source_sha256) && wrapper.reviewed_full_text.source_sha256===wrapper.record.source_sha256 &&
      wrapper.record.stage==='Full-text review' && wrapper.record.effects?.length);
    const hasFulltext=reviewedFullText||records.some(saved=>saved.stage==='R3'),hasAbstract=records.some(saved=>saved.stage==='R2');
    return {abstract_only:hasAbstract&&!hasFulltext,has_fulltext:hasFulltext,label:hasFulltext?'Includes source-checked full text':hasAbstract?'Results based on abstract only':'Evidence source not established'};
  }
  function abstractOnly(study){return sourceInfo(study).abstract_only;}
  function sourcePrefixes(study,record){
    const rows=[...list(study.details?.sample_size_records),...list(study.details?.quantitative_results),...list(study.comparisons).map(row=>row.scope||{})];
    return [...new Set(rows.filter(row=>row.report_id===study.report_id&&row.source_input_sha256===record.source_sha256&&row.review_stage===record.stage&&hash(row.review_binding_sha256)).map(row=>'CE-'+row.review_binding_sha256.slice(0,24)+'-'))];
  }
  function resultBearing(quote){
    // These are source passages, not newly extracted numerical estimates. Select
    // explicit reported findings rather than introductions, study plans or N-only
    // descriptions. Do not reinterpret a dose or a study size as an outcome.
    const finding=/\b(?:decreas\w*|increas\w*|chang\w*|improv\w*|reduc\w*|correlat\w*|associat\w*|significant\w*|median|mean)\b/i.test(quote);
    const pvalue=/\b[pP]\s*(?:[<=>≤≥]|&lt;|&gt;)\s*(?:0?\.\d+|\d+(?:\.\d+)?)/.test(quote);
    const measurement=/\b\d+(?:\.\d+)?\s*(?:ng\/m[lL]|pg\/m[lL]|[μu]g\/m[lL]|nmol\/L|pmol\/L|mmol\/L|IU\/L|mIU\/m[lL]|points?|scores?)\b/i.test(quote);
    return finding&&(pvalue||measurement)&&!/^\s*(?:we\s+(?:will|plan to)|planned|proposed|expected|anticipated)\b/i.test(quote);
  }
  function specialOutcomeDetails(study,{registry={}}={}){
    const snippets=[],seen=new Set();
    for(const saved of acceptedRecords(study).slice().reverse()){
      const record=saved.record;
      // Standard extracted outcomes already have their own numerical sections.
      // For omitted outcome domains, expose the original anchored result text.
      if(['effects','survival','binary'].some(section=>list(record[section]).length))continue;
      const references=new Set([...list(record.study_details?.evidence),...list(record.study?.evidence),...list(record.populations).flatMap(row=>list(row.evidence)),...list(record.sample_sizes).flatMap(row=>list(row.evidence))]);
      for(const prefix of sourcePrefixes(study,record))for(const id of references){
        const evidenceId=prefix+id,anchor=registry[evidenceId],quote=anchor?.supporting_quote;
        if(!anchor||typeof quote!=='string'||!anchor.source_id?.startsWith(study.report_id+':')||!anchor.block_id||!resultBearing(quote)||seen.has(quote))continue;
        seen.add(quote);snippets.push({stage:saved.stage,quote,evidence_id:evidenceId,source_id:anchor.source_id,block_id:anchor.block_id,locator:anchor.locator||anchor.block_id});
      }
    }
    return snippets;
  }
  function hasSpecialOutcomes(study,options){return specialOutcomeDetails(study,options).length>0;}
  return Object.freeze({acceptedRecords,designInfo,sourceInfo,abstractOnly,specialOutcomeDetails,hasSpecialOutcomes});
});
