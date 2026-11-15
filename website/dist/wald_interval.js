(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WaldInterval=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const list=v=>Array.isArray(v)?v:[],clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const finite=v=>typeof v==='number'&&Number.isFinite(v),string=v=>typeof v==='string'&&v.trim()?v.trim():null;
  const SOURCES=['https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-06#section-6-3','https://www.stata.com/support/faqs/statistics/delta-rule/'];
  const Z95=1.959963984540054;
  const ratios=new Set(['hr','hazard ratio','rr','risk ratio','relative risk','or','odds ratio','irr','incidence rate ratio','rate ratio','shr','subdistribution hazard ratio','tr','time ratio']);
  const differences=new Set(['rd','risk difference','rate difference','md','mean difference','smd','standardized mean difference','standardised mean difference']);
  const normalized=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[‐‑‒–—_]/g,'-').replace(/\s+/g,' ').trim();
  function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
  const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  function identity(r){return {report_id:r&&r.report_id||null,reviewer:r&&r.reviewer||null,source_input_sha256:r&&r.source_input_sha256||null,
    artifact_sha256:r&&(r.review_binding_sha256||r.draft_artifact_sha256||r.source_packet_sha256||r.derivative_artifact_sha256)||null};}
  function local(row,id){const h=row&&row.review_binding_sha256,prefix=h?'CE-'+h.slice(0,24)+'-':'';return typeof id==='string'&&prefix&&id.startsWith(prefix)?id.slice(prefix.length):id;}
  function binding(row){const f=row.original_fact||{},m=row.model||{},a=row.analysis||{};return {...identity(row),result_id:row.result_id||null,
    model_id:local(row,row.model_id||row.analysis_id||m.model_id||a.analysis_id||f.model_id)||null,
    population_id:local(row,row.population_id||(row.population||{}).entity_id||(row.population||{}).population_id||f.result_population_id||f.population_id)||null,
    contrast_id:local(row,f.contrast_id||row.contrast_id)||null,comparison_id:row.comparison_id||null,
    endpoint_id:local(row,row.endpoint_id||(row.endpoint||{}).endpoint_id||f.endpoint_id)||null,cutoff_id:local(row,row.cutoff_id||(row.cutoff||{}).entity_id||f.cutoff_id)||null,
    arm_id:local(row,row.arm_id||f.arm_id)||null,experimental_arm_id:local(row,(row.experimental_arm||{}).entity_id||f.experimental_arm_id)||null,
    reference_arm_id:local(row,(row.comparator_arm||{}).entity_id||f.comparator_arm_id)||null,
    measure:row.measure||f.measure||null,estimate:clone(row.estimate||null),p_value:clone(row.p_value||null)};}
  function scaleFor(row){const m=normalized(row.measure||(row.original_fact||{}).measure).replace(/-/g,' ');return ratios.has(m)?'log':differences.has(m)?'identity':null;}
  function scopeValid(row){const b=binding(row),m=row.model||{},a=row.analysis||{};if(!b.population_id||!(b.model_id||b.contrast_id||b.comparison_id))return false;
    for(const [value,expected]of [[m.analysis_population_id,b.population_id],[a.population_id,b.population_id],[m.endpoint_id,b.endpoint_id],[m.cutoff_id,b.cutoff_id]])if(value&&local(row,value)!==expected)return false;
    for(const w of [row.estimate||{},row.p_value||{}]){for(const k of ['report_id','reviewer','source_input_sha256'])if(w[k]!=null&&w[k]!==b[k])return false;
      for(const k of ['population_id','model_id','cutoff_id','endpoint_id'])if(w[k]!=null&&local(row,w[k])!==b[k])return false;}
    return true;
  }
  function wrappers(row,role){return [row[role],...list(row.source_reported_numbers).filter(n=>n.role===role),...list(row.reported_numbers).filter(n=>n.role===role),...list((row.original_fact||{}).numbers).filter(n=>n.role===role)].filter(Boolean);}
  function mentioned(w){return !!w&&(w.value!=null||!!string(w.raw_text))&&!['not_reported','not_applicable'].includes(w.status);}
  function existingInterval(row){const lo=wrappers(row,'ci_lower'),hi=wrappers(row,'ci_upper'),lower=lo.some(mentioned),upper=hi.some(mentioned);
    if(lower||upper)return {status:lower&&upper?'reported_interval':'held',reason:lower&&upper?'reported_interval_preserved':'partial_reported_interval_preserved',interval:null};
    if([...lo,...hi].some(w=>!['not_reported','not_applicable'].includes(w.status)||w.value!=null||string(w.raw_text)))return {status:'held',reason:'non_estimable_or_unclear_original_interval',interval:null};
    const levels=wrappers(row,'confidence_level').filter(mentioned);if(levels.some(n=>finite(n.value)&&n.value!==95))return {status:'held',reason:'reported_non95_interval_level_preserved',interval:null};
    return null;}
  function exactNumber(w){return !!w&&w.status==='reported'&&finite(w.value)&&(w.qualifier==null||w.qualifier==='equal')&&!/[<>≤≥]|\b(?:less|greater|below|above|rounded)\b/i.test(w.raw_text||'')&&w.semantic_non_scalar_source_literal!==true;}
  function refs(row,object){const prefix=row.review_binding_sha256?'CE-'+row.review_binding_sha256.slice(0,24)+'-':'';return list(object&&object.evidence_ids).flatMap(id=>prefix?[id,prefix+id]:[id]);}
  function resolve(row,ids,registry){const prefix=row.review_binding_sha256?'CE-'+row.review_binding_sha256.slice(0,24)+'-':'';const get=id=>registry instanceof Map?registry.get(id):registry[id];const found=[];
    for(const id of new Set(ids)){const item=get(id)||get(prefix+id);if(item&&string(item.supporting_quote||item.quote)&&string(item.source_id)&&string(item.block_id))found.push({evidence_id:id,source_id:item.source_id,block_id:item.block_id,locator:item.locator||null,quote:item.supporting_quote||item.quote});}return found;}
  function descriptor(row){const f=row.original_fact||{},p=row.p_value||{},m=row.model||{},a=row.analysis||{};return [p.test_kind,p.test_type,p.method,p.sidedness,p.p_adjustment,p.adjustment,p.multiplicity_adjustment,row.test_kind,row.test_type,row.sidedness,row.p_adjustment,f.test_kind,f.test_type,f.text,f.field,m.family,m.estimand,a.test_kind,a.sidedness,a.model&&a.model.text].filter(string).join(' ').replace(/_/g,' ');}
  function incompatible(text){text=String(text).normalize('NFKC');
    if(/\b(?:[2-9]\d*|1\d+)(?:\.0+)?\s*(?:degrees?\s+of\s+freedom|df)\b|\bdf\s*[=:]?\s*(?:[2-9]\d*|1\d+)\b/i.test(text))return true;
    if(/\bchi[ -]?square\b|χ/i.test(text)&&!/\b1\s*(?:degree\s+of\s+freedom|df)\b|\bdf\s*[=:]?\s*1\b/i.test(text))return true;
    return /\blog[ -]?rank\b|\bscore (?:tests?|statistics?)\b|\blikelihood[ -]?ratio\b|\bLR tests?\b|\bexact tests?\b|\bFisher\b|\bpermutation\b|\brandomization tests?\b|\bbootstrap\b|\bprofile likelihood\b|\bMantel[ -]?Haenszel\b|\bt[ -]?tests?\b|\b(?:one|1)[ -]?(?:sided|tailed)\b|\binteractions?\b|\bheterogeneity\b|\bomnibus\b|\bjoint\b.{0,30}\btests?\b|\b(?:Bonferroni|Holm|Hochberg|FDR|false discovery|multiplicity[ -]?adjusted|adjusted p[ -]?values?)\b/i.test(text);}
  function waldTest(text){return String(text).split(/[;\n]|(?<=[.!?])\s+(?=[A-Z])/).some(part=>
    /\bWald\b[^.;\n]{0,30}\b(?:tests?|statistics?)\b|\btests?\b[^.;\n]{0,45}\bWald\b/i.test(part)||
    !/\bconfidence\s+intervals?\b/i.test(part)&&/\bWald\b[^.;\n]{0,45}\bp[ -]?values?\b|\bp[ -]?values?\b[^.;\n]{0,45}\bWald\b/i.test(part));}
  function nBinding(n){return {basis:n&&n.basis||null,values:list(n&&n.values).map(v=>({fact:clone(v.fact),arm_id:v.arm_id||null,population_id:v.population_id||null})),records:list(n&&n.provenance).map(v=>({identity:identity(v.source_record),sample_record_id:v.source_record&&v.source_record.sample_record_id||null,fact:clone(v.fact)}))};}
  function validN(row,n){if(!n||!['explicit_analysis_n','explicit_outcome_denominator','scoped_reported_randomized_total','scoped_randomized_arm_counts'].includes(n.basis)||!list(n.values).length||!list(n.provenance).length)return false;
    if(!n.values.every(v=>exactNumber(v.fact)&&v.fact.value>0&&Number.isInteger(v.fact.value)))return false;
    const own=identity(row);if(Object.values(own).some(v=>!string(v)))return false;
    return n.provenance.every(v=>{const r=v.source_record,f=r&&r.original_fact||{},b=binding(row);if(!r||r.main_result_eligible===false||!equal(identity(r),own)||!n.values.some(x=>equal(x.fact,v.fact)))return false;
      for(const k of ['model_id','cutoff_id']){const known=r[k]||f[k];if(known&&local(row,known)!==b[k])return false;}
      if(n.basis==='explicit_analysis_n'){const p=r.population_id||(r.population||{}).entity_id||(r.population||{}).population_id||f.result_population_id||f.population_id;if(p&&local(row,p)!==b.population_id)return false;}
      return true;});
  }
  function proofFor(row,{nDisplay,evidenceRegistry={},mode='strict'}={}){
    const p=row.p_value||{},estimate=row.estimate||{},model=row.model||{},f=row.original_fact||{},a=row.analysis||{};
    const pids=new Set(refs(row,p).map(id=>local(row,id))),effectIds=new Set(refs(row,estimate).map(id=>local(row,id)));
    const shared=[...pids].some(id=>effectIds.has(id));
    if(!shared)return {status:'held',reason:'p_and_effect_not_bound_to_same_source_coefficient'};
    const localText=descriptor(row);if(incompatible(localText))return {status:'held',reason:'incompatible_reported_test'};
    const ids=[...refs(row,p),...refs(row,estimate),...refs(row,model),...refs(row,f),...refs(row,a.model),...refs(row,a.contrast_description)];
    const sources=resolve(row,ids,evidenceRegistry),sourceText=sources.map(s=>s.quote).join(' ');
    if(incompatible(sourceText))return {status:'held',reason:'ambiguous_or_incompatible_source_test'};
    const wald=waldTest(sourceText);
    const two=/\b(?:two|2)[ -]?(?:sided|tailed)\b/i.test(sourceText);
    if((!wald||!two)&&mode!=='assume_wald')return {status:'held',reason:'two_sided_normal_wald_not_established'};
    if(!sources.length)return {status:'held',reason:'test_source_evidence_required'};
    return {status:wald&&two?'source_supported':'assumed',kind:wald&&two?'normal_wald':'unknown',sidedness:wald&&two?'two_sided':'unknown',p_adjustment:wald&&two?'none':'unknown',scale:scaleFor(row),null_value:scaleFor(row)==='log'?1:0,
      binding:binding(row),n_binding:nBinding(nDisplay),same_effect:true,evidence:sources,assumptions:[]};
  }
  // Rational normal quantile approximation, evaluated in the lower tail to
  // avoid cancellation from computing 1-p/2 for very small reported p values.
  function normalQuantile(p){if(!(p>0&&p<1))return NaN;const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239],b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572],c=[-.007784894002430293,-.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],d=[.007784695709041462,.3224671290700398,2.445134137142996,3.754408661907416];
    if(p<.02425){const q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
    if(p>1-.02425)return -normalQuantile(1-p);const q=p-.5,r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);}
  function derive(row,options={}){
    row=row||{};const printed=existingInterval(row);if(printed)return printed;
    const held=reason=>({status:'held',reason,interval:null});
    if(row.main_result_eligible===false||row.API_verification_pending===true)return held('result_not_source_qualified_for_display');
    const effect=row.estimate,p=row.p_value,scale=scaleFor(row);if(!scale)return held('unsupported_effect_measure');
    if(!exactNumber(effect)||scale==='log'&&effect.value<=0)return held('invalid_or_nonexact_effect');
    if(!exactNumber(p)||!(p.value>0&&p.value<1))return held('p_value_not_exact_in_open_unit_interval');
    if(!scopeValid(row))return held('effect_model_population_or_contrast_scope_unresolved');
    for(const [role,value]of [['estimate',effect],['p_value',p]]){const originals=list((row.original_fact||{}).numbers).filter(n=>n.role===role);if(originals.length&&!originals.some(n=>n.value===value.value&&n.status===value.status&&(n.qualifier||'equal')===(value.qualifier||'equal')))return held('display_wrapper_does_not_match_original_effect_fact');}
    if(!validN(row,options.nDisplay))return held('source_supported_complete_N_required');
    const automatic=proofFor(row,options),proof=options.testProof||automatic,assumed=options.mode==='assume_wald';
    if(incompatible(descriptor(row)))return held('incompatible_reported_test');
    const ownBinding=binding(row);if(Object.values(identity(row)).some(v=>!string(v))||!ownBinding.result_id)return held('missing_effect_source_identity');
    if(!proof||!equal(proof.binding,ownBinding)||!equal(proof.n_binding,nBinding(options.nDisplay))||proof.same_effect!==true)return held(proof&&proof.reason||'matching_effect_test_scope_required');
    if(proof.kind!=='normal_wald'&&!(assumed&&proof.kind==='unknown'))return held('two_sided_normal_wald_not_established');
    if(proof.kind==='normal_wald'&&(proof.sidedness!=='two_sided'||proof.p_adjustment!=='none'))return held('one_sided_adjusted_or_unknown_p_test');
    if(proof.kind==='unknown'&&!assumed)return held('two_sided_normal_wald_not_established');
    if(proof.scale!==scale||proof.null_value!==(scale==='log'?1:0))return held('test_scale_or_null_mismatch');
    const evidence=list(proof.evidence);if(!evidence.length||evidence.some(e=>!string(e.quote)||!string(e.source_id)||!string(e.block_id)))return held('test_source_evidence_required');
    if(evidence.some(e=>!e.evidence_id||!resolve(row,[e.evidence_id],options.evidenceRegistry||{}).some(raw=>raw.quote===e.quote&&raw.source_id===e.source_id&&raw.block_id===e.block_id)))return held('test_evidence_not_resolved_to_owned_source');
    if(incompatible(evidence.map(e=>e.quote).join(' ')))return held('incompatible_reported_test');
    if(proof.kind==='normal_wald'&&(!waldTest(evidence.map(e=>e.quote).join(' '))||!/\b(?:two|2)[ -]?(?:sided|tailed)\b/i.test(evidence.map(e=>e.quote).join(' '))))return held('test_source_evidence_required');
    const beta=scale==='log'?Math.log(effect.value):effect.value;if(beta===0)return held('rounded_null_effect_cannot_identify_standard_error');
    const tail=p.value/2,z=-normalQuantile(tail),se=Math.abs(beta)/z;if(!finite(z)||z<=0||!finite(se)||se<=0)return held('numerical_resolution_insufficient');
    const lower=scale==='log'?Math.exp(beta-Z95*se):beta-Z95*se,upper=scale==='log'?Math.exp(beta+Z95*se):beta+Z95*se;
    if(!finite(lower)||!finite(upper)||lower>=upper||scale==='log'&&lower<=0)return held('interval_outside_numeric_range');
    const assumptions=['The p value tests this same effect against its stated null on the stated scale.','Reported equality p/effect may be rounded; the reconstructed interval is approximate.','N is a required source-supported context check; it is not used to recover SE from a Wald p value.'];
    if(proof.kind==='unknown')assumptions.push('Two-sided unadjusted normal-Wald inference is assumed, not established by the source.');
    return {status:'derived',reason:proof.kind==='unknown'?'explicit_wald_assumption':'source_supported_normal_wald',interval:{lower,upper,confidence_level:95,scale,approximate:true,derived:true},
      label:proof.kind==='unknown'?'Approximate 95% CI (Wald assumption)':'Approximate 95% CI (Wald reconstruction)',method:'two_sided_normal_wald_from_effect_and_p',standard_error:se,z_value:z,
      assumptions,provenance:{binding:ownBinding,estimate:clone(effect),p_value:clone(p),N:clone(nBinding(options.nDisplay)),test_evidence:clone(evidence),method_sources:SOURCES.slice()},
      clinical_verified:false,pooling_eligible:false,original_data_unchanged:true};
  }
  function format(result,{decimalPlaces=3}={}){if(!result||result.status!=='derived')return '';const digits=Number.isInteger(decimalPlaces)&&decimalPlaces>=0&&decimalPlaces<=8?decimalPlaces:3;
    const n=v=>v.toFixed(digits);return '('+n(result.interval.lower)+'–'+n(result.interval.upper)+'; derived 95% Wald CI'+(result.reason==='explicit_wald_assumption'?', test assumed':'')+')';}
  return Object.freeze({derive,format,proofFor,binding,nBinding,normalQuantile});
});
