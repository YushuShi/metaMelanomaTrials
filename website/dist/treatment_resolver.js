/* Deterministic product/class resolution. Raw text is never overwritten.
 * The registry is curated; unfamiliar names are review items, never fuzzy identities. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./treatment_registry.js'));
  else root.TreatmentResolver=factory(root.TreatmentRegistry);
})(typeof globalThis==='object'?globalThis:this,function(registry){
  'use strict';
  const list=value=>Array.isArray(value)?value:[];
  const normalize=value=>String(value??'').normalize('NFKC')
    .replace(/[‐‑‒–—−]/g,'-').replace(/[‘’]/g,"'").replace(/_/g,' ')
    .replace(/α/gi,' alfa ').replace(/β/gi,' beta ').replace(/γ/gi,' gamma ')
    .replace(/\s*([/+])\s*/g,'$1').replace(/\s*-\s*/g,'-')
    .replace(/\s+/g,' ').trim().toLowerCase();
  const entriesOf=data=>[...list(data?.products).map(entry=>({...entry,entity_type:'product'})),...list(data?.generic_classes).map(entry=>({...entry,entity_type:'generic'}))];
  function catalogueTreatments(data) {
    return [...list(data.products), ...list(data.generic_classes).filter(entry => entry.selectable_modality && entry.entity_status === 'non_drug')];
  }
  function indexFor(data){
    const index=new Map();
    for(const entry of entriesOf(data))for(const alias of [entry.label,...list(entry.aliases)]){
      const key=normalize(alias);if(!key)continue;
      const values=index.get(key)||[];
      if(!values.some(value=>value.entity_type===entry.entity_type&&value.id===entry.id))values.push(entry);
      index.set(key,values);
    }
    return index;
  }
  function validateRegistry(data){
    const errors=[],ids=new Set(),index=indexFor(data),collisions=[];
    if(!data?.version)errors.push('Registry version is required.');
    const categories=data?.class_categories;
    if(!categories||typeof categories!=='object'||Array.isArray(categories))errors.push('Registry class/category definitions are required.');
    const sources=new Set(list(data?.sources).map(source=>source.id));
    for(const entry of entriesOf(data)){
      if(!entry.id||!entry.label||!entry.class_id||!entry.broad_category)errors.push('Registry entry needs identity, label and class: '+(entry.id||'(missing)'));
      if(ids.has(entry.id))errors.push('Duplicate registry identity: '+entry.id);ids.add(entry.id);
      if(categories&&categories[entry.class_id]!==entry.broad_category)errors.push('Inconsistent class/broad category: '+entry.id);
      if(!list(entry.source_ids).length||entry.source_ids.some(id=>!sources.has(id)))errors.push('Registry entry needs valid supporting sources: '+entry.id);
    }
    const broadById = new Map(entriesOf(data).map(entry => [entry.id, entry.broad_category]));
    const subgroupIds = new Set();
    for (const group of list(data?.display_subgroups)) {
      if (!group.id || !group.label || subgroupIds.has(group.id)) errors.push('Invalid display subgroup: ' + group.id);
      subgroupIds.add(group.id);
      if (!list(group.class_ids).length && !list(group.member_ids).length) errors.push('Empty display subgroup: ' + group.id);
      for (const id of list(group.member_ids)) {
        if (broadById.get(id) !== group.broad_category) errors.push('Invalid display subgroup member: ' + id);
      }
      for (const id of list(group.class_ids)) {
        if (categories?.[id] !== group.broad_category) errors.push('Invalid display subgroup class: ' + id);
      }
      if (list(group.source_ids).some(id => !sources.has(id))) errors.push('Unknown display subgroup source: ' + group.id);
    }
    for(const [alias,values]of index)if(values.length>1)collisions.push({normalized_alias:alias,identities:values.map(entry=>entry.id)});
    return {valid:!errors.length&&!collisions.length,errors,collisions};
  }
  function create(data){
    if(!data?.version)throw new Error('Treatment registry is unavailable.');
    const index=indexFor(data),validation=validateRegistry(data);
    const exact=raw=>index.get(normalize(raw))||[];
    function result(raw,extra={}){
      return {raw_label:String(raw??''),normalized_label:normalize(raw),registry_version:data.version,
        status:'unresolved',canonical_id:null,label:String(raw??'').trim(),class_id:null,broad_category:null,mechanism:null,
        role:'unclear',active_exposure:null,match_method:'unresolved',source_ids:[],candidates:[],review_reason:'Unregistered or underspecified complete treatment label.',...extra};
    }
    function resolved(raw,entry,options,method='exact_alias'){
      const context=normalize(options.context||''),explicit=options.role;
      let role=explicit||entry.role||'principal';
      role=({vaccine_adjuvant:'adjuvant',report_dependent:'unclear'})[role]||role;
      if(['cyclophosphamide','fludarabine','fludarabine_phosphate'].includes(entry.id)&&/\blymphodeplet(?:ing|ion|ive)?\b|\bconditioning\b/.test(context))role='conditioning';
      if(!['cell-therapies','vaccines'].includes(entry.broad_category)&&/\b(?:ex vivo|in vitro)\b/.test(context)&&/\b(?:expand|expansion|culture|prepar|manufactur)/.test(context))role='preparation';
      const inactive=entry.active_exposure===false||['negated','prior_history','preparation','control','structural'].includes(role);
      return result(raw,{status:role==='control'?'control':['control','non_drug'].includes(entry.entity_status)?entry.entity_status:entry.entity_type==='product'?'resolved':'generic',canonical_id:entry.entity_type==='product'?entry.id:null,
        generic_id:entry.entity_type==='generic'?entry.id:null,label:entry.label,class_id:entry.class_id,broad_category:entry.broad_category,
        mechanism:entry.mechanism||null,role,active_exposure:!inactive,match_method:method,source_ids:list(entry.source_ids),
        formulation:entry.formulation||null,reported_specificity:entry.reported_specificity||null,
        ...(entry.combination_status?{combination_status:entry.combination_status}:{}),...(entry.targets?{targets:entry.targets}:{}),review_reason:role==='unclear'?'The report must establish whether this product is the principal intervention or an adjunct.':null});
    }
    function generic(raw,id,label,broad,mechanism,extra={}){
      const sourceEntry=list(data.generic_classes).find(entry=>entry.id===id)||list(data.generic_classes).find(entry=>entry.class_id===id&&entry.broad_category===broad);
      return result(raw,{status:'generic',generic_id:id,label,class_id:extra.class_id||id,broad_category:broad,mechanism,
        role:extra.role||'principal',active_exposure:true,source_ids:list(sourceEntry?.source_ids),match_method:'complete_class_phrase',review_reason:null,...extra});
    }
    function resolve(raw,options={}){
      const text=normalize(raw);
      if(!text)return result(raw,{review_reason:'Empty treatment label.'});
      // A complete surgery-without-adjuvant-IO phrase establishes surgery;
      // the absent drug class is context, not negation of the operation.
      if(/^(?:excision|resection|surgery(?: (?:alone|only))?(?:\s*[/,]?\s*(?:without|with no) (?:adjuvant )?(?:immunotherapy|ici|io|immune checkpoint (?:inhibition|inhibitors?)))?)$/.test(text))
        return result(raw,{status:'non_drug',label:'Surgery',class_id:'surgery',broad_category:'surgery',role:'principal',active_exposure:true,match_method:'complete_modality_phrase',review_reason:null});
      // Control/context qualifiers take precedence over a named constituent.
      if(/^(?:(?:matched|matching) )?placebo(?: group| arm)?(?:\s*\([^)]*\))?(?: every \d+ (?:days?|weeks?|hours?)| (?:daily|weekly|q\d+[wdh]))?$/.test(text)||
        !/\b(?:plus|and|with|or|followed by)\b/.test(text)&&/^[^+;,]+(?:-matched| matched| matching)? placebo(?:\s*\([^)]*\))?$/.test(text))
        return result(raw,{status:'control',label:'Placebo',class_id:'supportive',broad_category:'controls',role:'control',active_exposure:false,match_method:'explicit_placebo',review_reason:null});
      const negated=/^(?:no|not|never|neither|without)\s+(?!comparator\b|comparison\b)/.test(text)||/\b(?:not treated|never received|with no|without)\b/.test(text);
      const history=/\b(?:na[iï]ve|refractory|resistant|resistance|pretreated|previously treated|previously received|prior therapy|prior treatment|treatment history)\b/.test(text)||/^(?:prior|previous|history of)\s/.test(text);
      const preparation=/\b(?:ex vivo|in vitro)\b/.test(text)&&/\b(?:expand|expansion|culture|prepar|reagent|manufactur)/.test(text);
      if(!negated&&!history&&preparation&&/\b(?:infused|infusion|administered)\b/.test(text)&&/\b(?:tils?|tumou?r[- ]infiltrating lymphocytes?)\b/.test(text)&&!/\breagent\b/.test(text))
        return generic(raw,'cell-therapies',String(raw).trim(),'cell-therapies','Administered tumor-infiltrating lymphocyte product',{generic_id:'til-unspecified',reported_specificity:String(raw)});
      if(negated||history||preparation){
        const candidate=text.replace(/^(?:no|not|never|neither|without|prior|previous|history of)\s+/,'').replace(/[- ](?:na[iï]ve|refractory|resistant)(?: cohort| patients)?$/,'');
        const mentioned=exact(candidate).filter(entry=>entry.entity_type==='product').map(entry=>entry.id);
        return result(raw,{status:'context',role:negated?'negated':preparation?'preparation':'prior_history',active_exposure:false,
          match_method:'explicit_exposure_context',mentioned_canonical_ids:mentioned,review_reason:null});
      }
      const values=exact(raw);
      if(values.length>1)return result(raw,{status:'ambiguous',match_method:'alias_collision',candidates:values.map(entry=>({id:entry.id,label:entry.label})),review_reason:'The normalized alias refers to more than one registry identity.'});
      if(values.length===1)return resolved(raw,values[0],options);
      // Whole administered products/classes precede any interpretation of component words.
      if(/^(?:(?:autologous|allogeneic|expanded|cd8[- ]enriched|recombinant|engineered|genetically modified|il-?12[- ]transduced)\s+)*(?:tumou?r[- ]infiltrating lymphocytes?|tils?)(?:\s+(?:cells?|therapy|infusion))?$/.test(text))
        return generic(raw,'cell-therapies','Tumor-infiltrating lymphocyte therapy','cell-therapies','Tumor-infiltrating lymphocyte therapy',{generic_id:'til-unspecified',reported_specificity:String(raw)});
      if(/^(?:autologous\s+)?(?:lymphokine[- ]activated killer(?: cells?)?|lak cells?)(?: therapy| infusion)?$/.test(text))
        return generic(raw,'cell-therapies','Lymphokine-activated killer cell therapy','cell-therapies','Lymphokine-activated killer cells',{generic_id:'lak-unspecified'});
      if(/^(?:autologous\s+)?(?:car[- ]t(?:[- ]cells?)?|chimeric antigen receptor[- ](?:engineered )?t[- ]cells?|t[- ]cell[- ]receptor[- ]engineered (?:t[- ])?cells?|tcr[- ](?:engineered )?t[- ]cells?)(?: therapy| product| infusion)?$/.test(text))
        return generic(raw,'cell-therapies',String(raw).trim(),'cell-therapies','Engineered T-cell therapy',{generic_id:'engineered-t-cells-unspecified'});
      if(/^(?:(?:mitomycin c[- ]treated|autologous|allogeneic|melanoma|tumou?r[- ]cell|cellular|peptide|neoantigen|antigen[- ]loaded|dendritic[- ]cell|therapeutic|cancer|personalized)\s+)+(?:cells?\s+)?vaccines?$/.test(text))
        return generic(raw,'vaccines',String(raw).trim(),'vaccines','Therapeutic vaccine; product unspecified',{generic_id:'vaccine-unspecified'});
      if(/^(?:anti[- ]?)?pd-?(?:1\/(?:anti[- ]?)?pd-?l1|\(l\)1)(?: (?:inhibitors?|blockade|antibod(?:y|ies)|monotherapy|immunotherapy))?$/.test(text))
        return generic(raw,'pd1-pdl1-unspecified','PD-1/PD-L1 inhibitors, target/agent unspecified','ici','PD-1/PD-L1 checkpoint inhibition; target unspecified',{combination_status:'unspecified'});
      if(/^(?:(?:immune )?checkpoint (?:blockade|inhibition|inhibitors?|therapy)(?:, unspecified agent)?|(?:ici|icb)(?: therapy| monotherapy)?)$/.test(text))
        return generic(raw,'ici-unspecified','Immune checkpoint inhibitor','ici','Checkpoint inhibition; target unspecified');
      for(const [id,target,pattern]of [
        ['pd1','PD-1',/^(?:(?:anti[- ]?)?pd-?1|anti-programmed cell death (?:protein )?1)(?: inhibitors?| agents?| blockade| monotherapy| (?:monoclonal )?antibod(?:y|ies)| therapy| immunotherapy)?$/],
        ['pdl1','PD-L1',/^(?:anti[- ]?)?pd-?l1(?: inhibitors?| agents?| blockade| monotherapy| antibod(?:y|ies)| therapy| immunotherapy)?$/],
        ['ctla4','CTLA-4',/^(?:anti[- ]?)?ctla-?4(?: inhibitors?| agents?| blockade| monotherapy| antibod(?:y|ies)| therapy)?$/]])
        if(pattern.test(text))return generic(raw,id,target+' inhibitor','ici',target+' checkpoint inhibition');
      if(/^(?:braf\/mek|braf and mek)[- ](?:directed therapy|targeted therapy|inhibitors?)(?:, combination unspecified)?$/.test(text))
        return generic(raw,'braf-mek-unspecified','BRAF/MEK-directed therapy, combination unspecified','targeted','BRAF/MEK-directed therapy',{combination_status:'unspecified',targets:['BRAF','MEK']});
      if(/^(?:combined |combination (?:of )?)?(?:braf\/mek|braf and mek|braf\+mek)(?: inhibitor)?(?: combination| inhibitor combination| inhibitors combined| combination therapy)$/.test(text))
        return generic(raw,'other-targeted','BRAF and MEK inhibitor combination','targeted','Combined BRAF and MEK inhibition',{combination_status:'combination',targets:['BRAF','MEK'],class_ids:['braf','mek']});
      if(/^(?:surgery|surgery alone|excision|resection)$/.test(text))return result(raw,{status:'non_drug',label:'Surgery',class_id:'surgery',broad_category:'surgery',role:'principal',active_exposure:true,match_method:'complete_modality_phrase',review_reason:null});
      if(/^(?:radiotherapy|radiation(?: therapy)?|srs|sbrt|stereotactic radiosurgery)$/.test(text))return result(raw,{status:'non_drug',label:'Radiotherapy',class_id:'radiotherapy',broad_category:'radiotherapy',role:'principal',active_exposure:true,match_method:'complete_modality_phrase',review_reason:null});
      if(/^(?:standard[- ](?:of[- ])?care|investigator'?s choice|usual care|systemic therapy|bispecifics|mage-a3 blocker|bmsca2098fc)$/.test(text))
        return result(raw,{review_reason:'The reported wording does not establish the administered product or regimen.'});
      return result(raw);
    }
    return Object.freeze({registry:data,validation,normalize,resolve,exact:raw=>exact(raw).map(entry=>({...entry}))});
  }
  const api=create(registry);
  return Object.freeze({...api,create,validateRegistry,catalogueTreatments});
});
