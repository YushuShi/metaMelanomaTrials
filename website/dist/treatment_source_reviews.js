(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TreatmentSourceReviews=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

// Source-reviewed trial facts shared by Studies and the map. Each supplement is scoped to
// the accepted report and arm IDs. The published R2/R3 inputs stay immutable.
const trial='NIBIT-M2', nct='NCT02460068';
const primary={
  pmid:'34112708',doi:'10.1158/1078-0432.ccr-21-1046',
  abstractSha:'da2071c5fe0c4ab0cac9ed47f6271c7f512de3bb88e09fc1dc9150157bf895b1',
  pdf:'https://iris.unife.it/retrieve/671ab7e6-8098-4f67-8828-67dd869b9e0e/4737.pdf',
  sha256:'617161026253424fc811405afa0a2dfdb82733187bf33b8ccbfb11fc2a4a7a04',
  location:'Patients and Methods, p. 4738. Arm C induction and nivolumab maintenance from week 12.'
};
const followup={
  pmid:'38271746',doi:'10.1016/j.ejca.2024.113531',report:'report-27f182843fafb20f9d999fa1',
  abstractSha:'a13a4f1d8ca52cac28d677dc73bf806672e665d166eb4f2567a352bfcc3a92ab',
  pdf:'https://usiena-air.unisi.it/bitstream/11365/1262314/1/PIIS0959804924000078.pdf',
  sha256:'244eb73476c34e8b5f791a1fc1fe0f30378531cf24c12f6f7baa4087a5035d6c',
  location:'Sections 2.1–2.2 and 3, Table 1 and Figure 1. Data cutoff May 1, 2023.'
};
const phases=[['ipilimumab','nivolumab'],['nivolumab']];
const evidenceId='reviewed-38271746-';

function hasReview(pmid){return [primary.pmid,followup.pmid].includes(String(pmid));}
function course({pmid,doi,ncts,armId,agentIds,sourceSha256}){
  const paper=String(pmid)===primary.pmid?primary:String(pmid)===followup.pmid?followup:null;
  if(!paper || doi?.toLowerCase()!==paper.doi || !ncts?.includes(nct) ||
    ![paper.abstractSha,paper.sha256].includes(sourceSha256) ||
    armId!==(paper===primary?'a3':'arm_c') || !Array.isArray(agentIds) ||
    [...agentIds].sort().join('+')!=='ipilimumab+nivolumab')return null;
  return {phases,source:{pmid:primary.pmid,url:primary.pdf,sha256:primary.sha256,location:primary.location}};
}

function supplement(quantitative){
  const publication=quantitative.articles?.find(a=>String(a.pmid)===followup.pmid);
  const article=quantitative.clinical_evidence?.articles?.find(a=>String(a.pmid)===followup.pmid);
  if(publication?.records?.some(w=>w.reviewed_full_text?.source_sha256===followup.sha256))return quantitative;
  const abstract=publication?.records?.find(w=>w.record?.source_sha256===followup.abstractSha)?.record;
  if(!article?.current_main_eligible || !abstract || abstract.decision?.status==='exclude' ||
    article.report_id!==followup.report || article.doi?.toLowerCase()!==followup.doi ||
    !['arm_a','arm_b','arm_c'].every(id=>abstract.arms.some(a=>a.id===id&&a.population_id==='pop_overall')))return quantitative;
  // When the ordinary full-text extraction publishes comparative OS data
  // for this report it owns the endpoint again, including any discrepancies.
  if(article.quantitative_results?.some(row=>row.review_stage==='R3'&&
    row.quantitative_record?.origin==='own_report'&&row.quantitative_record.endpoint==='OS'&&
    row.quantitative_record.measure==='HR'&&row.quantitative_record.estimate>0))return quantitative;

  const stage='Full-text review',evidence=[evidenceId+'methods'],population_id='pop_overall',cutoff='2023-05-01';
  const armNames={arm_a:'fotemustine',arm_b:'ipilimumab + fotemustine',arm_c:'ipilimumab + nivolumab'};
  if(!abstract.arms.every(a=>armNames[a.id]===a.label.toLowerCase()))return quantitative;
  const provenance={source_id:followup.report+':main:'+followup.sha256.slice(0,16),source_url:followup.pdf,
    source_sha256:followup.sha256,locator:followup.location,pmid:followup.pmid};
  const anchors={};
  function anchor(key,locator,quote){
    const id=evidenceId+key;
    anchors[id]={...provenance,locator,supporting_quote:quote};
    return [id];
  }
  anchor('methods','Section 2.2, population for efficacy analyses','subjects who received at least one dose');
  const armN={arm_a:23,arm_b:26,arm_c:27};
  const sample_sizes=Object.entries(armN).map(([arm_id,n])=>({id:'reviewed-treated-'+arm_id,
    population_id,arm_id,n,count_purpose:'treated',complete:'yes',disjoint:'yes',method:'reported',cutoff,
    evidence:anchor('count-'+arm_id,'Table 1, '+armNames[arm_id]+' column header and footnote a','(n='+n+')')}));
  const effects=[['arm_c',.43,.22,.86,.016],['arm_b',1.07,.59,1.96,.82]].map(([arm,estimate,lo,hi,p])=>({
    id:'reviewed-overall-survival-'+arm,population_id,intervention_arm_id:arm,reference_arm_id:'arm_a',
    endpoint:'OS',endpoint_definition:'Overall survival among all randomized patients who received treatment',
    origin:'own_report',measure:'HR',estimate,ci_lower:lo,ci_upper:hi,ci_level:95,p_value:p,cutoff,
    evidence:anchor('os-'+arm,'Section 3 Results, paragraph referencing Figure 1, '+armNames[arm]+' versus fotemustine',
      arm==='arm_c'?'HR 0.43, 95% CI: 0.22–0.86':'HR 1.07, 95% CI 0.59–1.96')}));
  const record={pmid:followup.pmid,report_id:followup.report,source_sha256:followup.sha256,stage,decision:{status:'retain'},
    study:{name:trial,identifiers:[{registry:'ClinicalTrials.gov',id:nct}],randomized:'yes',setting:'advanced',study_type:'interventional_trial',evidence},
    populations:[{id:population_id,label:'Treated patients with active, untreated, asymptomatic melanoma brain metastases',scope:'overall',melanoma_only:'yes',evidence}],
    arms:abstract.arms.map(arm=>({...arm,evidence})),sample_sizes,effects};
  const sourceFields={pmid:followup.pmid,report_id:followup.report,review_stage:stage,source_input_sha256:followup.sha256};
  const bindings=rows=>rows.map(row=>({...sourceFields,quantitative_record:row,result_id:row.id,population_id}));
  const reviewedArticle={...article,sample_size_records:[...(article.sample_size_records||[]),...bindings(sample_sizes)],
    quantitative_results:[...(article.quantitative_results||[]),...bindings(effects)]};
  const clinical=quantitative.clinical_evidence;
  return {...quantitative,articles:quantitative.articles.map(a=>a===publication?
    {...a,records:[...a.records,{record,reviewed_full_text:provenance}]}:a),
    clinical_evidence:{...clinical,articles:clinical.articles.map(a=>a===article?reviewedArticle:a),
      evidence_registry:{...clinical.evidence_registry,...anchors}}};
}
// Figure 1 and the abstract's arm-specific OS medians refer to the same
// treated population. A clinical filter must match that population in both arms.
function filterBindings(source,effect){
  if(source.record.source_sha256!==followup.sha256 || !source.reviewedFullText)return null;
  return [effect.intervention_arm_id,effect.reference_arm_id].map(arm=>{
    const key='os_median_'+arm.slice(-1);
    return source.article.quantitative_results.filter(row=>row.source_input_sha256===followup.abstractSha&&
      row.review_stage==='R2' && !row.extraction_conflict && row.quantitative_record?.id===key &&
      row.quantitative_record.arm_id===arm && row.quantitative_record.population_id===effect.population_id &&
      row.quantitative_record.endpoint==='OS').map(row=>Object.fromEntries(
      ['pmid','result_id','source_input_sha256','review_binding_sha256','population_id','report_id','review_stage','quantitative_record'].map(k=>[k,row[k]])));
  });
}
return {supplement,course,hasReview,filterBindings};
});
