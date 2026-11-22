'use strict';
const {effectiveRecord}=require('../dist/quantitative_extraction.js');
/* Prepared treatment graph. Counts use source arms, never table rows or PMIDs as studies.
 * All name and regimen parsing is delegated to the shared treatment implementation.
 * This module is deliberately conservative about unproven participant independence.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const analysisEvidence=require('./treatment_map_evidence.cjs');
const cohortPolicy=require('./treatment_map_cohorts.cjs');
const exactMembership=require('./treatment_map_membership.cjs');
const sourceReviews=require('../dist/treatment_source_reviews.js');
const list=x=>Array.isArray(x)?x:[], uniq=x=>[...new Set(x.filter(x=>x!==null&&x!==undefined&&x!==''))].sort();
const text=x=>typeof x==='string'&&x.trim()&&!/^(?:NA|N\/A|null|unknown)$/i.test(x.trim())?x.trim():'';
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(stable(x))).digest('hex');
const numeric=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const independentStudy=c=>c.study_id&&(c.cohort?.independent_group_id||c.cohort?.root_id||c.study_id);
const subset=(a,b)=>a.every(x=>b.includes(x));
const normalized=x=>text(x).normalize('NFKC').toLowerCase().replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ');
const nodeId=components=>components.length===1?'agent:'+components[0]:'regimen:'+hash(uniq(components)).slice(0,24);
function nonDirectDesign(value){
  const context=normalized(value).replace(/[_-]/g,' ');
  if(/\bindirect(?:\s+(?:treatment|clinical|efficacy))?\s+comparisons?\b|\bmaic\b|\bnetwork(?:\s+treatment)?\s+comparisons?\b/.test(context))return 'indirect_comparison';
  if(/\bpool(?:ed|ing)\b|\bmeta\s*analys(?:is|es)\b|\bsystematic(?:\s+literature)?\s+review\b/.test(context))return 'pooled_or_review_design';
  if(/\bhybrid\b/.test(context)&&/\b(?:trial|randomized|randomised)\b/.test(context)&&/\breal\s*world\b|\brwd\b|\bexternal\s+cohort/.test(context))return 'hybrid_trial_external_cohort';
  return null;
}
function conditionalEffect(effect){
  const definition=normalized(effect.endpoint_definition);
  // Some source extractions attach conditional TRAE coefficients to the trial's
  // overall population ID. The explicitly restricted estimand takes precedence.
  // Merely adjusting an overall model for covariates is not this restriction.
  return /\btraes?\b|\badverse events?\b|\btoxicit/.test(definition)&&
    /\bamong patients (?:without|before)\b|\b(?:after|before) (?:onset|occurrence|development|select|traes?|adverse events?)\b|\b(?:presence|absence) of\b/.test(definition);
}

/** Exact sets contain every meaningful concurrent component. Placebos are inert;
 * generic agents and procedures prevent an incomplete set being called a regimen.
 * OR uses intersection for certain exposure; SEQUENTIAL never forms a new AND.
 */
function analyzeDefinition(definition){
  function visit(node){
    if(!node)return {certain:[],possible:[],exact:null,combinations:[],signature:'unknown',uncertain:true};
    const children=list(node.children).map(visit),type=node.type;
    if(children.length){
      if(type==='or'||type==='alternative'||type==='optional'){
        const certain=children[0].certain.filter(id=>children.every(c=>c.certain.includes(id)));
        const combos=children[0].combinations.filter(ids=>children.every(c=>c.combinations.some(other=>JSON.stringify(ids)===JSON.stringify(other))));
        // Dose/schedule alternatives of the same canonical complete component
        // set change internal arm detail, not the displayed regimen composition.
        // Distinct products and unresolved alternatives remain nonconcurrent.
        const sameExact=type!=='optional'&&children[0].exact!==null&&children.every(c=>c.exact!==null&&JSON.stringify(c.exact)===JSON.stringify(children[0].exact));
        return {certain,possible:uniq(children.flatMap(c=>c.possible)),alternative:type==='optional'?[]:uniq(children.flatMap(c=>[...c.certain,...list(c.alternative)])),exact:sameExact?children[0].exact:null,combinations:combos,
          signature:'or('+children.map(c=>c.signature).sort().join('|')+')',uncertain:!sameExact};
      }
      const certain=uniq(children.flatMap(c=>c.certain)),possible=uniq(children.flatMap(c=>c.possible));
      if(type==='and'||type==='combination'){
        const exact=children.every(c=>c.exact!==null)?uniq(children.flatMap(c=>c.exact)):null;
        // Only an entirely resolved AND can introduce a combination. Never trim
        // an unspecified third component from A+B+unspecified therapy.
        return {certain,possible,alternative:uniq(children.flatMap(c=>list(c.alternative))),exact,combinations:exact&&exact.length>1?[exact]:[],
          signature:'and('+children.map(c=>c.signature).sort().join('|')+')',uncertain:exact===null};
      }
      if(type==='sequential')return {certain,possible,alternative:uniq(children.flatMap(c=>list(c.alternative))),exact:null,
        combinations:uniq(children.flatMap(c=>c.combinations).map(JSON.stringify)).map(JSON.parse),
        signature:'sequential('+children.map(c=>c.signature).join('>')+')',uncertain:children.some(c=>c.uncertain),sequential:true};
      return {certain:[],possible,exact:null,combinations:[],signature:type+'('+children.map(c=>c.signature).join('|')+')',uncertain:true};
    }
    const r=node.normalization||{},inactive=r.active_exposure===false||['negated','prior_history','preparation'].includes(r.role);
    const placebo=r.status==='control'||node.class_id==='supportive'&&/placebo|observation|supportive|no treatment/i.test(node.name||node.raw_label||'');
    if(placebo)return {certain:[],possible:[],exact:[],combinations:[],signature:'control',uncertain:false,control:true};
    if(node.agent_id&&(r.role==='unclear'||r.active_exposure===null))return {certain:[],possible:[node.agent_id],exact:null,combinations:[],signature:'role_unresolved:'+node.agent_id,uncertain:true};
    if(node.agent_id&&!inactive)return {certain:[node.agent_id],possible:[node.agent_id],exact:[node.agent_id],combinations:[],signature:'agent:'+node.agent_id,uncertain:false};
    return {certain:[],possible:[],exact:null,combinations:[],signature:(inactive?'context:':'unresolved:')+(node.class_id||normalized(node.name||node.raw_label)),uncertain:true};
  }
  const result=visit(definition?.root);
  if(['negated','prior_history','preparation','context'].includes(definition?.role))return {...result,certain:[],possible:[],combinations:[],exact:null,endpoint:null,uncertain:true};
  // A reported combination followed by maintenance with a subset still has the
  // same displayed combination, with the full ordered arm retained in evidence.
  const containing=result.combinations.filter(ids=>subset(result.certain,ids)&&subset(result.possible,ids));
  result.endpoint=result.exact?.length?result.exact:!result.uncertain&&containing.length===1?containing[0]:
    !result.uncertain&&result.certain.length===1&&JSON.stringify(result.certain)===JSON.stringify(result.possible)?result.certain:null;
  result.identity=result.endpoint?'set:'+result.endpoint.join('+'):result.signature;
  result.control=!result.possible.length&&result.exact?.length===0;
  return result;
}

function build(input,{dist=path.resolve(__dirname,'../dist')}={}){
  const {registry}=input,quantitative=sourceReviews.supplement(input.quantitative||{}),clinical=quantitative.clinical_evidence||{},normalizations=input.normalizations||null;
  const {groups}=require('./treatment_normalization.cjs').load(registry,dist);
  const identifiers=require(path.join(dist,'trial_identifiers.js'));
  if(normalizations&&normalizations.registry_version!==registry.version)throw new Error('Treatment-map registry and normalization versions differ');
  if(normalizations?.clinical_content_sha256&&clinical.content_sha256&&normalizations.clinical_content_sha256!==clinical.content_sha256)throw new Error('Treatment-map normalization snapshot is stale');
  const registryHash=hash(registry);
  if(normalizations?.registry_sha256&&normalizations.registry_sha256!==registryHash)throw new Error('Treatment-map normalization registry hash is stale');
  const evidence=clinical.evidence_registry||{},articles=new Map(list(clinical.articles).map(a=>[String(a.pmid),a]));
  const sources=[],review=[],nodes=new Map(),observations=[],comparisons=[],networkDirectEvidence=[],sourceBindings=new Map(),preparedArms=new Map(),canonicalSamples=new Set(),canonicalResults=new Set(),canonicalArmScopes=new Map();
  const requireEvidence=!!normalizations&&Object.keys(evidence).length>0;
  const sourceKey=(pmid,stage,sha)=>[String(pmid),stage,sha].join('|');
  const rememberArmScope=(key,armId,populationId)=>{
    if(!text(armId)||!text(populationId))return;
    const armKey=key+'|'+armId;if(!canonicalArmScopes.has(armKey))canonicalArmScopes.set(armKey,new Set());canonicalArmScopes.get(armKey).add(populationId);
  };
  for(const a of articles.values()){
    for(const s of list(a.sample_size_records))if(s.quantitative_record?.id)canonicalSamples.add(sourceKey(a.pmid,s.review_stage,s.source_input_sha256)+'|'+s.quantitative_record.id);
    for(const row of [...list(a.sample_size_records),...list(a.quantitative_results)]){
      const raw=row.quantitative_record||{},key=sourceKey(a.pmid,row.review_stage,row.source_input_sha256);
      if(raw.id)canonicalResults.add(key+'|'+raw.id);
      for(const armId of [raw.arm_id,raw.intervention_arm_id,raw.reference_arm_id])rememberArmScope(key,armId,raw.population_id);
    }
    for(const row of list(a.comparisons)){
      const scope=row.scope||{},key=sourceKey(a.pmid,scope.review_stage,scope.source_input_sha256);
      const prefix=scope.review_binding_sha256?'CE-'+scope.review_binding_sha256.slice(0,24)+'-':'';
      const populationId=prefix&&String(scope.population_id).startsWith(prefix)?scope.population_id.slice(prefix.length):scope.population_id;
      for(const armId of [row.intervention_arm_id,row.comparator_arm_id,row.outcome_arm_id])rememberArmScope(key,armId,populationId);
    }
    for(const s of [...list(a.sample_size_records),...list(a.quantitative_results),...list(a.comparisons)]){
      const scope=s.scope&&typeof s.scope==='object'?s.scope:s;
      if(scope.review_binding_sha256)sourceBindings.set(sourceKey(a.pmid,scope.review_stage,scope.source_input_sha256),scope.review_binding_sha256);
    }
  }
  for(const item of Object.values(normalizations?.comparisons||{}))for(const role of Object.values(item.roles||{})){
    const def=role.definition||normalizations.definition_profiles?.[role.definition_ref],scope=role.source_binding?.scope||item.scope||{};
    const arm=def?.native_graph?.arm_id||def?.arm_id;
    if(def&&arm){
      const key=sourceKey(item.pmid,scope.review_stage,scope.source_input_sha256)+'|'+arm;
      if(!preparedArms.has(key))preparedArms.set(key,{...def,source_binding:role.source_binding});
    }
  }
  const mapTreatments=groups.resolver.catalogueTreatments(registry);
  for(const p of mapTreatments)nodes.set('agent:'+p.id,{id:'agent:'+p.id,type:'drug',entity_type:p.entity_status==='non_drug'?'modality':'drug',label:p.label,components:[p.id],class_id:p.class_id,
    broad_category:p.broad_category,radial_subgroup:groups.subgroupsForAgent(p.id)[0]||null,
    aliases:uniq([p.label,...list(p.aliases)]),contribution_ids:[],comparison_ids:[],parent_ids:[],overview_parent_id:null});
  const addCombo=ids=>{
    if(ids.length<2||ids.some(id=>!nodes.has('agent:'+id)))return null;
    const id=nodeId(ids);
    if(!nodes.has(id))nodes.set(id,{id,type:'combination',label:ids.map(id=>nodes.get('agent:'+id).label).join(' + '),components:ids,
      class_id:'combinations',broad_category:null,aliases:[],contribution_ids:[],comparison_ids:[],parent_ids:[],overview_parent_id:null});
    return id;
  };
  // The ordinary map can display induction with maintenance under its induction
  // node. Network contrasts need the full ordered regimen, including maintenance.
  function sequenceIdentity(definition,arm,source,semantics) {
    const root=definition.root;
    const reviewed=sourceReviews.course({pmid:source.pmid,doi:source.article.doi,ncts:source.ncts,
      armId:arm.id,agentIds:semantics.exact,sourceSha256:source.record.source_sha256});
    if(reviewed)return {...phaseIdentity(reviewed.phases),network_regimen_source:reviewed.source};
    const hasSequence=node=>node?.type==='sequential'||list(node?.children).some(hasSequence);
    if(!hasSequence(root))return {};
    if(root.type!=='sequential')return {network_regimen_unresolved:true};
    let phases=root.children.map(child=>analyzeDefinition({root:child}).exact);
    if(phases.some(ids=>!ids||ids.some(id=>!nodes.has('agent:'+id))))return {network_regimen_unresolved:true};
    // Some records encode infusion order or different days in each repeating
    // cycle as SEQUENTIAL. Both components belong to the same treatment course.
    const schedules=list(arm.nodes).filter(node=>!list(node.children).length).map(node=>normalized(node.schedule));
    const cycleLength=s=>{
      const m=s.match(/\bevery (\d+) (days?|weeks?)\b/)||s.match(/\b(\d+)[- ](day|week) cycle\b/);
      return m?Number(m[1])*(m[2].startsWith('week')?7:1):null;
    };
    const periods=schedules.map(cycleLength),samePeriod=periods.length>1&&periods[0]>0&&periods.every(n=>n===periods[0]);
    const phased=schedules.some(s=>/\b(?:induction|maintenance|until|through|during|thereafter|first|last|only|up to|for (?:\d+|one|two|three|four))\b/.test(s));
    const explicitCombination=/\+|\b(?:plus|combination|combined)\b/i.test(arm.label)&&!/→|->|\b(?:then|followed by)\b/i.test(arm.label);
    if(samePeriod&&!phased&&(explicitCombination||schedules.every(s=>/\bdays? \d+/.test(s))))phases=[uniq(phases.flat())];
    // Repeated dosing of the same set does not introduce a second regimen.
    phases=phases.filter((ids,i)=>!i||JSON.stringify(ids)!==JSON.stringify(phases[i-1]));
    return phaseIdentity(phases);
  }
  function phaseIdentity(phases){
    const labels=phases.map(ids=>ids.length?ids.map(id=>nodes.get('agent:'+id).label).join(' + '):'Control');
    if(phases.length===1&&phases[0].length)return {network_regimen_id:nodeId(phases[0]),network_regimen_label:labels[0]};
    return {network_regimen_id:'sequence:'+hash(phases).slice(0,24),network_regimen_label:labels.join(' → ')};
  }
  const refs=(source,ids)=>uniq(ids).map(id=>{
    const prefixed=source.binding?'CE-'+source.binding.slice(0,24)+'-'+id:id;
    return evidence[prefixed]?prefixed:id;
  });
  const quote=(source,ids)=>refs(source,ids).map(id=>evidence[id]?.supporting_quote||evidence[id]?.quote||'').join(' ');
  const anchored=(source,ids)=>!requireEvidence||list(ids).length>0&&refs(source,ids).every(id=>{
    const anchor=evidence[id];return anchor&&String(anchor.source_id||'').startsWith(source.record.report_id+':');
  });
  const issue=(source,reason,extra={})=>review.push({pmid:source.pmid,stage:source.record.stage,source_sha256:source.record.source_sha256,reason,...extra});
  const drugNames=new Set(list(registry.products).flatMap(p=>[p.label,...list(p.aliases)]).map(normalized));
  const formalNames=(value)=>{
    if(drugNames.has(normalized(value))||/^(?:phase|cohort|group|arm|part)[ -]?\d/i.test(text(value)))return [];
    const names=identifiers.get({title:text(value)}).own_trial_names;
    if(names.length)return names;
    const s=text(value);
    // Unknown names need a compact trial-code form. Publication titles and broad
    // sponsor/program labels never acquire study identity from capitalization.
    return /^(?:[A-Za-z]{1,12}[- ]?\d{1,6}|[A-Z][A-Za-z0-9]{1,12}-[A-Za-z0-9]{1,12})$/.test(s)&&!/^(?:phase|cohort|group|arm|part)\b/i.test(s)?[s]:[];
  };
  const nameKey=name=>normalized(name).replace(/[^a-z0-9]/g,'').replace(/\d+/g,n=>String(Number(n)));
  const aliasIndex=new Map();
  for(const raw of list(quantitative.articles)){
    const article=articles.get(String(raw.pmid));
    if(!article?.current_main_eligible)continue;
    for(const wrapper of list(raw.records)){
      const rawRecord=wrapper.record||{};
      const record=effectiveRecord(wrapper);
      if(record.decision?.status==='exclude'||record.validation?.decision_valid===false)continue;
      const study=record.study||{},pmid=String(raw.pmid),binding=sourceBindings.get(sourceKey(pmid,record.stage,record.source_sha256))||null;
      const fromShared=identifiers.get(article,{registry:evidence});
      const ownNcts=uniq(list(study.identifiers).flatMap(x=>text(x.id).match(/\bNCT\d{8}\b/gi)||[]).map(x=>x.toUpperCase()));
      const reportedNcts=ownNcts.length?ownNcts:uniq(fromShared.nct_ids.map(x=>x.toUpperCase()));
      const namedCatalogue=identifiers.harmonize({names:[study.name],pmid});
      const cataloguedNames=namedCatalogue.provenance.some(p=>p.source_kind==='verified_trial_catalogue')?namedCatalogue.names:[];
      const reportedNames=uniq([...cataloguedNames,...formalNames(study.name),...fromShared.own_trial_names]);
      const trialIdentity=identifiers.harmonize({names:reportedNames,nct_ids:reportedNcts,pmid});
      const ncts=trialIdentity.nct_ids,names=trialIdentity.names;
      const source={pmid,article,record,binding,calculated_effects:list(wrapper.calculated_effects),source_preferences:wrapper.source_preferences,review_bindings:wrapper.complementary_review_bindings,ncts,names,trial_identity:trialIdentity,task_id:wrapper.task_id||null,raw_record_sha256:hash(rawRecord),source_url:'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/',key:sourceKey(pmid,record.stage,record.source_sha256)};
      if(wrapper.reviewed_full_text)source.reviewedFullText=wrapper.reviewed_full_text;
      const design=record.study_details&&anchored(source,record.study_details.evidence)?text(record.study_details.design_description):'';
      source.non_direct_design=nonDirectDesign([study.study_type,article.title,study.name,design].join(' '));
      // The quoted methods can identify secondary pooling even when the compact
      // study-type field merely says observational.
      const studyProof=quote(source,list(study.evidence));
      if(/\bpooled[, -]*(?:retrospective\s+)?analysis of (?:data|results) from\b|\bpooled\b[^.!?]{0,180}\b(?:two|three|multiple|[2-9]) (?:\w+ ){0,3}(?:trials|studies)\b/i.test(studyProof))source.non_direct_design='pooled_or_review_design';
      if(ncts.length>1&&(/\b(?:retrospective|secondary|post.hoc) (?:\w+ ){0,4}(?:analysis|analyses|study)\b[^.!?]{0,120}\b(?:three|multiple|[2-9]) (?:clinical |melanoma |trial )*(?:trials|studies|datasets)/i.test(studyProof+' '+design)||/retrospective analysis.*across.*trials|secondary analysis of .*trial datasets|post.hoc analysis of KEYNOTE/i.test(design+' '+article.title)))source.non_direct_design='pooled_or_review_design';
      source.pooled=!!source.non_direct_design;
      source.reused_trial_report=ncts.length>1&&study.study_type!=='interventional_trial'&&/biomarker|pyrexia|pharmacokinetic|secondary analysis|retrospective.*analys|discovery cohort|clinical validation study/i.test(studyProof+' '+design+' '+article.title);
      source.single_trial_pooled_cohorts=source.non_direct_design==='pooled_or_review_design'&&ncts.length===1&&study.study_type==='interventional_trial'&&/\bcohorts?\b/i.test(design)&&/\b(?:trial|study)\b/i.test(design);
      sources.push(source);
    }
  }
  // Accepted full-text design metadata applies to the same publication's
  // abstract extraction too. It does not relabel another report or trial.
  const reportDesigns=new Map(sources.filter(s=>s.pooled).map(s=>[s.pmid,s.non_direct_design])),reusedReports=new Set(sources.filter(s=>s.reused_trial_report).map(s=>s.pmid));
  for(const source of sources){
    if(reusedReports.has(source.pmid))source.reused_trial_report=true;
    if(!source.names.length){const names=uniq(sources.filter(s=>s.pmid===source.pmid&&!s.pooled).flatMap(s=>s.names));if(names.length===1)source.names=names;}
    if(reportDesigns.has(source.pmid)){source.pooled=true;source.non_direct_design=reportDesigns.get(source.pmid);}
    const {ncts,names}=source;
    if(ncts.length===1&&names.length===1&&!source.pooled&&source.trial_identity.status!=='conflicting'){const k=nameKey(names[0]);if(!aliasIndex.has(k))aliasIndex.set(k,new Set());aliasIndex.get(k).add(ncts[0]);}
  }
  // Explicit name/registration pairs in accepted source text also identify
  // populations in multi-trial follow-ups; list order never provides a mapping.
  for(const source of sources){
    if(source.trial_identity.status==='conflicting')continue;
    const proof=quote(source,[...list(source.record.study?.evidence),...list(source.record.populations).flatMap(p=>list(p.evidence))]);
    for(const m of proof.matchAll(/\b([A-Z][A-Za-z0-9-]{2,24}(?: [0-9]{2,6})?)\s*(?:\(\s*|,\s*)(NCT\d{8})\s*\)?/g)){
      if(!source.ncts.includes(m[2])||/^(?:trial|study|protocol|number|registration)$/i.test(m[1]))continue;
      const names=formalNames(m[1]);if(names.length!==1)continue;
      const k=nameKey(names[0]);if(!aliasIndex.has(k))aliasIndex.set(k,new Set());aliasIndex.get(k).add(m[2]);
    }
  }
  const cohortResolver=cohortPolicy.create(sources,{quote,anchored,refs});
  const resolveTrialAlias=analysisEvidence.trialAliasResolver(sources,{names:formalNames,anchored,quote,refs});
  function namedPopulationIdentity(source,population,ids){
    const nodes=cohortResolver.ancestry(source,population),proof=normalized(quote(source,[...list(source.record.study?.evidence),...nodes.flatMap(p=>list(p.evidence))]));
    const named=label=>{const names=formalNames(label),compact=nameKey(label);for(const [key,mapping] of aliasIndex)if(mapping.size===1&&ids.includes([...mapping][0])&&new RegExp(key+'(?![0-9])').test(compact)&&!names.some(name=>nameKey(name)===key))names.push(key);return names.flatMap(name=>{const mapping=aliasIndex.get(nameKey(name));return mapping?.size===1&&ids.includes([...mapping][0])?[{name,nct:[...mapping][0]}]:[];});};
    for(const p of nodes){
      const matches=named(p.label),mapped=uniq(matches.map(x=>x.nct));
      if(mapped.length===1)return {study_id:'nct:'+mapped[0],study_name:matches[0].name,nct_ids:mapped,linkage:'source_population_trial_name',identity_source_refs:cohortResolver.proofRefs(source,p)};
      if(mapped.length>1)return {study_id:null,study_name:matches.map(x=>x.name).join('; '),nct_ids:mapped,linkage:'multiple_trial_aggregate_population',identity_source_refs:cohortResolver.proofRefs(source,p)};
    }
    // A single name at report level does not allocate this population when
    // several registrations are present. Require the population ancestry above
    // or an explicit source-reviewed recruitment mapping.
    return null;
  }

  function rawIdentity(source,population){
    // Pooling cohorts within one explicitly identified original trial does not
    // erase that trial's identity; its overlapping denominators remain withheld.
    if(source.pooled&&!source.single_trial_pooled_cohorts)return {study_id:null,study_name:source.names.join('; ')||'Pooled or indirect publication',nct_ids:source.ncts.slice(),linkage:source.non_direct_design||'pooled_or_indirect_report'};
    const reviewed=cohortResolver.reviewedIdentity(source,population);if(reviewed)return reviewed;
    if(source.trial_identity.status==='conflicting')return {study_id:'cohort:report:'+source.pmid,study_name:source.names.join('; '),nct_ids:source.ncts.slice(),
      linkage:'conflicting_trial_identifiers',registration_allocation_pending:true,participant_overlap_unresolved:true,independent_cohort_count_eligible:false,
      participant_hold_reason:'Trial name and registration disagree; preserve this report separately until its identity is resolved.'};
    let ids=source.ncts.slice(),basis='source_registration';
    // A same-paper full-text identity fills an abstract gap without merging
    // separate publications merely because their sample sizes agree.
    if(!ids.length){const same=uniq(sources.filter(s=>s.pmid===source.pmid&&!s.pooled).flatMap(s=>s.ncts));if(same.length===1){ids=same;basis='same_report_registration';}}
    if(ids.length>1){
      const named=namedPopulationIdentity(source,population,ids);if(named)return named;
      // A multi-registration publication is never one merged trial. Only an
      // explicit, unique registration on this population assigns its arms.
      const local=uniq((text(population?.label).match(/\bNCT\d{8}\b/gi)||[]).map(x=>x.toUpperCase())).filter(x=>ids.includes(x));
      if(local.length===1){ids=local;basis='population_registration';}
      else if(source.reused_trial_report)return {study_id:null,study_name:source.names.join('; ')||'Previously recruited trial cohorts',nct_ids:ids,linkage:'known_multi_trial_reanalysis_unallocated',identity_source_refs:cohortResolver.proofRefs(source,population)};
      else return {study_id:'cohort:report:'+source.pmid,study_name:source.names.join('; ')||'Cohort reported in PMID '+source.pmid,nct_ids:ids,linkage:'internal_cohort_multiple_registrations',registration_allocation_pending:true,identity_source_refs:cohortResolver.proofRefs(source,population)};
    }
    if(!ids.length&&source.names.length===1){const aliases=aliasIndex.get(nameKey(source.names[0]));if(aliases?.size===1){ids=[...aliases];basis='unambiguous_trial_name_alias';}}
    if(ids.length===1)return {study_id:'nct:'+ids[0],study_name:source.names.join('; ')||ids[0],nct_ids:ids,linkage:basis};
    // A specific formal name is an identified study even when registration is
    // absent, except a known conflicting alias, which requires human review.
    if(source.names.length===1&&!aliasIndex.has(nameKey(source.names[0])))return {study_id:'trial:'+nameKey(source.names[0]),study_name:source.names[0],nct_ids:[],linkage:'specific_trial_name'};
    return resolveTrialAlias(source,{study_id:'cohort:report:'+source.pmid,study_name:source.names.join('; ')||'Cohort reported in PMID '+source.pmid,nct_ids:[],linkage:'internal_original_cohort',identity_source_refs:cohortResolver.proofRefs(source,population)});
  }
  function identity(source,population){
    const result=rawIdentity(source,population);
    const canonical=identifiers.harmonize({names:result.study_name?[result.study_name]:[],nct_ids:result.nct_ids,pmid:source.pmid,infer_registrations:false});
    return {...result,study_name:canonical.trial_label==='NA'?result.study_name:canonical.trial_label,
      named_cohort_key:canonical.independent_cohort_keys.length===1?canonical.independent_cohort_keys[0]:null,
      trial_identity_provenance:source.trial_identity.provenance,
      trial_identity_issues:uniq([...source.trial_identity.issues,...canonical.issues])};
  }
  const analysisIdentity=(source,population)=>resolveTrialAlias(source,identity(source,population));
  function nativeDefinition(source,arm){
    const prepared=preparedArms.get(source.key+'|'+arm.id);
    const definition=prepared?groups.rematerializeDefinition(prepared):groups.definitionFromNative({arm_id:arm.id,label:arm.label,root_node_id:arm.root_id,evidence_ids:refs(source,list(arm.evidence)),
      nodes:list(arm.nodes).map(n=>({node_id:n.id,kind:n.kind==='control'?'other':n.kind,name:text(n.name)||null,drug_class:null,
        children:list(n.children),dose:text(n.dose)||null,route:text(n.route)||null,schedule:text(n.schedule)||null,evidence_ids:refs(source,list(arm.evidence))}))},
    {source_binding:{comparison_id:'map:'+hash([source.key,arm.id]),role:'source_arm',scope:{report_id:source.record.report_id,review_stage:source.record.stage,source_input_sha256:source.record.source_sha256}}});
    // Modality identity comes from the shared registry. Abbreviated SRS and
    // fraction variants are accepted only in this reviewed, source-bound paper.
    const sourceSRS=source.pmid==='30975225'&&['48fe50832b2377980ce5cebd760f8c5cebabc02dee2db0e3369afc589beaed6a','7e53cf5a0bb265d7add538990db02b16d87890896ea8f2dd9d53dc093508f4f8'].includes(source.record.source_sha256)&&anchored(source,arm.evidence)&&/stereotactic radiosurgery|\bSRS\b/.test(quote(source,arm.evidence));
    const project=node=>{
      if(!node)return node;if(list(node.children).length)return {...node,children:node.children.map(project)};
      const modality=node.normalization?.generic_id==='radiosurgery'||sourceSRS&&/^(?:(?:single|multi)[ -]fraction\s+)?(?:srs|stereotactic radiosurgery)$/i.test(text(node.raw_label||node.name));
      if(!modality||node.normalization?.active_exposure===false||['negated','prior_history','preparation'].includes(node.normalization?.role))return node;
      return {...node,agent_id:'radiosurgery',class_id:'radiotherapy',name:'Radiosurgery',type:'agent',normalization:{...node.normalization,canonical_id:'radiosurgery',generic_id:'radiosurgery',status:'non_drug',role:'principal',active_exposure:true,match_method:node.normalization?.generic_id==='radiosurgery'?node.normalization.match_method:'source_reviewed_SRS_alias'},map_entity_type:'modality'};
    };
    return {...definition,root:project(definition.root)};
  }
  function populationState(source,population,sample){
    if(!population)return {eligible:false,key:'unknown',reason:'Population identity unavailable'};
    const wording=[population.label,population.id,sample?.id].join(' ');
    if(/cross.?over|re.?challenge|retreatment|re-treatment/i.test(wording))return {eligible:false,key:'crossover',reason:'Crossover or retreatment participants are not added to original assignment'};
    if(population.melanoma_only==='no')return {eligible:false,key:'mixed_cancers',reason:'Mixed-cancer total cannot be allocated to melanoma participants'};
    const parent=list(source.record.populations).find(p=>p.id===population.parent_id);
    const melanomaSubset=population.melanoma_only==='yes'&&parent?.melanoma_only==='no'&&/melanoma/i.test(population.label||'')&&
      !/biomarker|PD.?L1|BRAF|respond|evaluable|assessable|safety|quality.of.life|HRQoL/i.test(population.label||'');
    if(melanomaSubset)return {eligible:true,key:'melanoma_overall',disjoint:false,melanoma_subset:true,reason:null};
    const explicitDisjoint=population.disjoint==='yes'||population.independence_verified===true||/\b(?:independently|separately) (?:recruited|enrolled)|\bnon[- ]overlapping cohorts?\b/i.test(quote(source,list(population.evidence)));
    if(explicitDisjoint)return {eligible:true,key:'cohort:'+normalized(population.cohort_id||population.label||population.id),disjoint:true,reason:null};
    // An overall randomized population can be a child of everyone screened or
    // enrolled. That hierarchy is different from HRQoL/safety/biomarker subsets.
    const ownCounts=list(source.record.sample_sizes).filter(s=>s.population_id===population.id);
    const parentCounts=list(source.record.sample_sizes).filter(s=>s.population_id===population.parent_id);
    const randomizedChild=population.scope==='overall'&&source.record.study?.randomized==='yes'&&
      ownCounts.some(s=>s.count_purpose==='randomized')&&parentCounts.some(s=>s.count_purpose==='enrolled')&&
      !/quality.of.life|HRQoL|safety|biomarker|PD.?L1|BRAF|evaluable|assessable/i.test(population.label||'');
    if(randomizedChild)return {eligible:true,key:'overall',disjoint:false,reason:null};
    if(population.scope!=='overall'||text(population.parent_id))return {eligible:true,key:'subgroup:'+normalized(population.label||population.id),subgroup:true,disjoint:false,reason:null};
    return {eligible:true,key:'overall',disjoint:false,reason:null};
  }
  function countRank(source,sample){
    const purpose=sample.count_purpose,randomized=source.record.study?.randomized==='yes';
    if(purpose==='randomized')return 0;
    if(purpose==='ITT')return 1;
    if(purpose==='enrolled')return randomized?2:0;
    if(purpose==='treated')return 3;
    if(['outcome_analysis','response_evaluable','safety'].includes(purpose))return 4;
    return null;
  }
  const doseSignature=definition=>{
    const out=[];function walk(n){if(n?.agent_id&&(text(n.dose)||text(n.schedule)))out.push([n.agent_id,normalized(n.dose),normalized(n.schedule)]);list(n?.children).forEach(walk);}walk(definition.root);return uniq(out.map(JSON.stringify)).join('|');
  };
  for(const source of sources){
    const record=source.record,populations=new Map(list(record.populations).map(p=>[p.id,p])),arms=new Map();
    const descendantOf=(id,parentId)=>{
      const seen=new Set();while(text(id)&&!seen.has(id)){if(id===parentId)return true;seen.add(id);id=populations.get(id)?.parent_id;}return false;
    };
    const supportedMelanomaPopulation=arm=>{
      // A melanoma cohort elsewhere in the article does not make an NSCLC arm
      // eligible. Require an accepted clinical record for this very source arm
      // and an explicit melanoma population. A directly source-bound arm/result
      // link is sufficient even when an extraction omits the parent hierarchy.
      const canonicalLinked=[...(canonicalArmScopes.get(source.key+'|'+arm.id)||[])];
      if(canonicalLinked.some(id=>populations.get(id)?.melanoma_only==='yes'))return true;
      let linked=[];
      if(!requireEvidence)linked.push(...[...list(record.sample_sizes),...list(record.binary),...list(record.survival),...list(record.effects)]
        .filter(r=>[r.arm_id,r.intervention_arm_id,r.reference_arm_id].includes(arm.id)).map(r=>r.population_id));
      return uniq(linked).some(id=>populations.get(id)?.melanoma_only==='yes'&&descendantOf(id,arm.population_id));
    };
    for(const arm of list(record.arms)){
      const pop=populations.get(arm.population_id);
      if(pop?.melanoma_only==='no'&&!supportedMelanomaPopulation(arm)){
        issue(source,'arm_without_source_bound_melanoma_population',{arm_id:arm.id,arm_label:arm.label,population_id:arm.population_id,population_label:pop.label});continue;
      }
      let definition,semantics;
      try{definition=nativeDefinition(source,arm);semantics=analyzeDefinition(definition);}
      catch(error){issue(source,'regimen_definition_unresolved',{arm_id:arm.id,arm_label:arm.label,detail:error.message});continue;}
      const combinationIds=semantics.combinations.map(addCombo).filter(Boolean);
      const certainNodes=uniq([...semantics.certain.map(id=>'agent:'+id),...combinationIds]).filter(id=>nodes.has(id));
      const possibleNodes=uniq([...semantics.possible.map(id=>'agent:'+id),...combinationIds]).filter(id=>nodes.has(id));
      if(semantics.uncertain)issue(source,'unresolved_regimen_expression',{arm_id:arm.id,arm_label:arm.label,node_ids:possibleNodes});
      const id=identity(source,pop);
      const state=populationState(source,pop),cohort=cohortResolver.describe(source,pop,id);
      if(cohort.independently_recruited&&!cohort.is_subgroup){state.key='cohort:'+cohort.root_id;state.disjoint=true;state.subgroup=false;}
      const exact_node_id=semantics.endpoint?.length?nodeId(semantics.endpoint):null;
      const observation={source,arm,definition,semantics,networkIdentity:sequenceIdentity(definition,arm,source,semantics),exact_node_id,...id,population:pop,population_state:state,cohort,
        certain_nodes:certainNodes,possible_nodes:possibleNodes,dose_signature:doseSignature(definition),candidates:[],excluded_samples:[]};
      observation.partition_signature=observation.dose_signature||semantics.sequential?JSON.stringify([observation.dose_signature,semantics.signature]):'';
      arms.set(arm.id,observation);
      if(possibleNodes.length)observations.push(observation);
    }
    for(const sample of list(record.sample_sizes)){
      const rawN=numeric(sample.n),pop=populations.get(sample.population_id),state=populationState(source,pop,sample);
      let arm=arms.get(sample.arm_id),allocation='explicit_arm';
      if(!arm&&!text(sample.arm_id)){
        const compatible=[...arms.values()].filter(a=>a.arm.population_id===sample.population_id);
        if(compatible.length===1){arm=compatible[0];allocation='single_source_arm';}
      }
      if(!arm){if(rawN!==null)issue(source,'whole_population_count_not_allocated',{sample_id:sample.id,n:rawN,population_id:sample.population_id});continue;}
      const rank=countRank(source,sample);
      const reason=!state.eligible?state.reason:source.pooled?'Pooled or indirect report is not an independent recruited study':arm.participant_overlap_unresolved?(arm.participant_hold_reason||'Previously reported participants have unresolved trial allocation; no independent N is added'):source.ncts.length>1&&!arm.study_id?'Multiple registered trials without arm-level allocation':
        requireEvidence&&!canonicalSamples.has(source.key+'|'+sample.id)?'Count is outside the accepted canonical clinical sample records':
        !anchored(source,sample.evidence)?'Count evidence anchor is unavailable or does not match this source':
        rank===null?'Count purpose is not assigned, enrolled, ITT or treated':rawN===null||!Number.isInteger(rawN)||rawN<0?'Arm denominator unavailable':null;
      if(reason){arm.excluded_samples.push({sample_id:sample.id,n:rawN,reason,count_purpose:sample.count_purpose});continue;}
      // An arm-linked count must also be in that arm's overall population; a
      // result fallback or same-valued count in another group is not a link.
      if(sample.population_id!==arm.arm.population_id&&!descendantOf(sample.population_id,arm.arm.population_id)){
        arm.excluded_samples.push({sample_id:sample.id,n:rawN,reason:'Sample and arm populations differ'});continue;
      }
      if(sample.population_id!==arm.arm.population_id){
        let scoped=observations.find(o=>o.source===source&&o.arm.id===arm.arm.id&&o.population?.id===pop.id);
        if(!scoped){const ident=identity(source,pop),cohort=cohortResolver.describe(source,pop,ident);scoped={...arm,...ident,population:pop,population_state:{...state},cohort,candidates:[],excluded_samples:[]};observations.push(scoped);}
        arm=scoped;
      }
      if(arm.cohort.independently_recruited&&!arm.cohort.is_subgroup){state.key='cohort:'+arm.cohort.root_id;state.disjoint=true;state.subgroup=false;}
      arm.candidates.push({sample,n:rawN,rank,allocation,population:pop,population_state:state,
        partial:state.subgroup||rank>=3||sample.complete==='no',disjoint:sample.disjoint==='yes'||sample.count_purpose==='randomized'||state.disjoint});
    }
    const boundaryExtras=list(input.network_boundary_effects?.[source.key]);
    for(const effect of [...list(record.effects), ...source.calculated_effects, ...boundaryExtras]){
      const networkBoundary=boundaryExtras.includes(effect);
      const left=arms.get(effect.intervention_arm_id),right=arms.get(effect.reference_arm_id),pop=populations.get(effect.population_id);
      const state=populationState(source,pop),estimate=numeric(effect.estimate),lo=numeric(effect.ci_lower),hi=numeric(effect.ci_upper);
      // Rates in separate treatment-only child populations may support a
      // comparison at their shared parent. Verify both original rows and arms.
      const coversArm=(arm,side)=>{
        if(descendantOf(effect.population_id,arm.population_id))return true;
        const input=effect.calculation?.[side];
        return input?.arm_id===arm.id&&input.population_id===arm.population_id&&populations.get(arm.population_id)?.parent_id===effect.population_id&&
          list(record.binary).some(row=>row.id===input.row_id&&row.arm_id===arm.id&&row.population_id===arm.population_id&&
            row.endpoint===effect.endpoint&&row.origin==='own_report'&&anchored(source,row.evidence)&&(!requireEvidence||canonicalResults.has(source.key+'|'+row.id)));
      };
      let reason=null;
      const partialInterval=(lo===null)!==(hi===null);
      const binaryZero=estimate===0 && ['RR','OR'].includes(effect.measure);
      // A projection-only boundary ratio qualifies exclusively through both original,
      // accepted arm-specific binary results. It cannot supply an invented log interval.
      const boundaryBindings=networkBoundary && binaryZero && effect.calculation?.method==='from_arm_binary_outcomes'
        ? [effect.calculation.intervention,effect.calculation.reference].map(arm=>list(source.article.quantitative_results)
          .filter(row=>row.quantitative_record?.id===arm?.row_id && row.quantitative_record.arm_id===arm?.arm_id &&
            row.quantitative_record.population_id===arm?.population_id && row.quantitative_record.endpoint===effect.endpoint &&
            !row.extraction_conflict && row.source_input_sha256===record.source_sha256 && row.review_stage===record.stage)
          .map(row=>Object.fromEntries(['pmid','result_id','source_input_sha256','review_binding_sha256','population_id','report_id','review_stage','quantitative_record'].map(key=>[key,row[key]]))))
        : null;
      const validBoundary=boundaryBindings?.every(group=>group.length>0) &&
        effect.calculation.intervention.arm_id===effect.intervention_arm_id && effect.calculation.reference.arm_id===effect.reference_arm_id;
      if(networkBoundary&&!validBoundary)continue;
      const networkArm=arm=>arm&&(arm.semantics.endpoint||arm.semantics.control||arm.networkIdentity.network_regimen_id);
      if(source.pooled)reason='pooled_or_indirect_report';
      else if(!state.eligible)reason='subgroup_or_unresolved_effect_population';
      else if(conditionalEffect(effect))reason='conditional_subgroup_effect';
      else if(effect.origin!=='own_report')reason='not_own_report_effect';
      else if(requireEvidence&&!validBoundary&&!canonicalResults.has(source.key+'|'+effect.id))reason='effect_outside_accepted_clinical_records';
      else if(!anchored(source,effect.evidence))reason='effect_source_evidence_unavailable';
      else if(!left||!right)reason='unresolved_comparison_direction';
      else if(!networkArm(left)||!networkArm(right))reason='incomplete_comparison_endpoints';
      else if(!coversArm(left.arm,'intervention')||!coversArm(right.arm,'reference'))reason='comparison_population_mismatch';
      else if(estimate===null||!text(effect.endpoint)||!text(effect.measure))reason='nonnumeric_or_unspecified_effect';
      else if(lo!==null&&lo>estimate||hi!==null&&hi<estimate)reason='invalid_confidence_interval';
      else if(['HR','OR','RR'].includes(effect.measure)&&(estimate<0||estimate===0&&!binaryZero||lo!==null&&(lo<0||lo===0&&!binaryZero)||hi!==null&&hi<=0))reason='invalid_ratio_effect';
      else if(list(effect.field_flags).some(f=>/direction|compar|arm|estimate|confidence|ci_/i.test(JSON.stringify(f))))reason='effect_validation_requires_review';
      if(reason){issue(source,reason,{effect_id:effect.id,intervention_arm_id:effect.intervention_arm_id,reference_arm_id:effect.reference_arm_id,...(source.non_direct_design?{design_flag:source.non_direct_design}:{})});continue;}
      const interventionId=left.exact_node_id,comparatorId=right.exact_node_id;
      const networkIntervention=left.networkIdentity.network_regimen_id||interventionId;
      const networkComparator=right.networkIdentity.network_regimen_id||comparatorId;
      if(networkIntervention===networkComparator){issue(source,'comparison_collapses_to_self_loop',{effect_id:effect.id,arm_labels:[left.arm.label,right.arm.label]});continue;}
      if(interventionId&&!nodes.has(interventionId)||comparatorId&&!nodes.has(comparatorId)){issue(source,'comparison_endpoint_unavailable',{effect_id:effect.id});continue;}
      const ident=identity(source,pop);
      if(source.ncts.length>1&&!ident.study_id){issue(source,'multiple_trial_effect_unallocated',{effect_id:effect.id});continue;}
      const sourceRef={pmid:source.pmid,report_id:record.report_id,stage:record.stage,source_sha256:record.source_sha256,
        review_binding_sha256:source.binding,effect_id:effect.id,evidence_ids:refs(source,list(effect.evidence))};
      if(source.reviewedFullText)Object.assign(sourceRef,source.reviewedFullText);
      const networkBindings=validBoundary?boundaryBindings:sourceReviews.filterBindings(source,effect);
      if(source.reviewedFullText)sourceRef.supporting_evidence=sourceRef.evidence_ids.map(id=>evidence[id]);
      const effectId='effect:'+hash([source.key,effect.id]).slice(0,24);
      const networkOnly=binaryZero||partialInterval||!interventionId||!comparatorId&&!right.semantics.control||interventionId===comparatorId;
      const destination=networkOnly?networkDirectEvidence:comparisons;
      if(destination.some(c=>c.id===effectId))continue;
      if(partialInterval)issue(source,'invalid_confidence_interval',{effect_id:effect.id});
      const mapArm=(arm,node_id)=>({node_id,label:nodes.get(node_id)?.label||arm.definition.raw_label||arm.arm.label,
        arm_id:arm.arm.id,source_arm_label:arm.arm.label,...arm.networkIdentity});
      destination.push({id:effectId,
        ...(effect.calculation ? {calculation:effect.calculation} : {}),
        intervention:mapArm(left,interventionId),comparator:mapArm(right,comparatorId),
        outcome:effect.endpoint,outcome_definition:text(effect.endpoint_definition)||null,measure:effect.measure,estimate,ci_lower:lo,ci_upper:hi,ci_level:numeric(effect.ci_level),
        ...ident,pmid:source.pmid,source_url:source.source_url,title:source.article.title||null,year:source.article.year||null,population:pop.label,
        direction:'intervention versus comparator',cutoff:text(effect.cutoff)||null,model:text(effect.model)||null,adjusted:text(effect.adjusted)||null,source_refs:[sourceRef],
        source_conflict:source.source_preferences?.effects?.[effect.id]?.status!=='main_text'&&list(record.r2_links).some(l=>l.section==='effects'&&l.r3_id===effect.id&&l.relation==='conflict'),
        analysis:{...analysisEvidence.enrich({source,effect,population:pop,left,right,identity:analysisIdentity(source,pop),cohort:cohortResolver.describe(source,pop,analysisIdentity(source,pop)),sources,refs,anchored,quote,
          accepted:(s,row)=>!requireEvidence||canonicalResults.has(s.key+'|'+row.id),identify:analysisIdentity,
          armEquivalent:(sa,a,sb,b)=>{
            try{const x=analyzeDefinition(nativeDefinition(sa,a)),y=analyzeDefinition(nativeDefinition(sb,b));
              return x.control&&y.control||!!x.endpoint&&!!y.endpoint&&JSON.stringify(x.endpoint)===JSON.stringify(y.endpoint);
            }catch(_){return false;}
          }}), ...(networkBindings?{network_arm_filter_bindings:networkBindings}:{})},
        // Prefer an overall randomized-trial estimate, then the newer report
        // and full-text source. Effect magnitude never influences the default.
        default_rank:(source.record.study?.randomized==='yes'?0:20000)+(9999-(Number(source.article.year)||0))+(record.stage==='R3'?0:0.1)});
    }
  }

  // Source-linked R2/R3 refinements may describe extra maintenance phases. Their
  // explicit arm relationship, not equal N, proves the within-publication link.
  const armAliases=new Map();
  for(const source of sources)for(const link of list(source.record.r2_links))if(link.section==='arms'&&['same','supplement'].includes(link.relation)){
    const r3=observations.find(o=>o.source===source&&o.arm.id===link.r3_id);
    const r2=observations.find(o=>o.source.pmid===source.pmid&&o.source.record.stage==='R2'&&o.arm.id===link.r2_id);
    if(r3&&r2&&JSON.stringify(r3.semantics.possible)===JSON.stringify(r2.semantics.possible))armAliases.set(r2,r3.semantics.identity);
  }
  const buckets=new Map();
  for(const o of observations){
    if(!o.population_state.eligible&&o.candidates.length&&new Set(o.candidates.map(c=>c.population_state.key)).size===1)o.population_state=o.candidates[0].population_state;
    const treatment=armAliases.get(o)||o.semantics.identity||o.semantics.signature;
    // A separately recruited cohort must be explicit; arbitrary population IDs
    // and publication titles never create independent cohorts.
    const base=[o.study_id||'publication:'+o.source.pmid,o.cohort.id,treatment].join('|');
    o.bucket=base;if(!buckets.has(base))buckets.set(base,[]);buckets.get(base).push(o);
  }
  const contributions=[];
  for(const [base,entries]of buckets){
    const perSource=new Map();for(const o of entries){if(!perSource.has(o.source.key))perSource.set(o.source.key,[]);perSource.get(o.source.key).push(o);}
    // Different dose arms split only with a same-source witness of their
    // disjointness. Missing dosage in a follow-up never creates a new arm.
    const witnesses=[...perSource.values()].filter(os=>os.length>1&&os.every(o=>o.candidates.some(c=>c.disjoint)&&o.partition_signature)&&new Set(os.map(o=>o.partition_signature)).size===os.length)
      .sort((a,b)=>b.length-a.length||a[0].source.key.localeCompare(b[0].source.key));
    // One internally consistent witness defines partitions. Wording differences
    // in later dose/schedule descriptions cannot create additional participants.
    const dosePartitions=new Set((witnesses[0]||[]).map(o=>o.partition_signature));
    const partitions=dosePartitions.size>1?[...dosePartitions].sort():[''];
    const ambiguousDose=partitions.length>1&&entries.some(o=>!o.partition_signature||!dosePartitions.has(o.partition_signature));
    if(ambiguousDose)partitions.push('__unallocated_followup__');
    for(const partition of partitions){
      const os=partitions.length>1?entries.filter(o=>partition==='__unallocated_followup__'?!dosePartitions.has(o.partition_signature):o.partition_signature===partition):entries;
      const candidates=os.flatMap(o=>o.candidates.map(c=>({...c,observation:o}))).sort((a,b)=>a.rank-b.rank||b.n-a.n||(Number(b.observation.source.article.year)||0)-(Number(a.observation.source.article.year)||0)||(b.observation.source.record.stage==='R3')-(a.observation.source.record.stage==='R3')||a.observation.source.pmid.localeCompare(b.observation.source.pmid)||String(a.sample.id).localeCompare(String(b.sample.id)));
      const selected=candidates[0],representative=selected?.observation||os[0],best=candidates.filter(c=>c.rank===selected?.rank);
      const conflict=new Set(best.map(c=>c.n)).size>1;
      const multipleLocalArms=[...perSource.values()].some(xs=>xs.length>1&&new Set(xs.map(o=>o.arm.id)).size>1)&&partitions.length===1;
      const supported=uniq(os.flatMap(o=>o.certain_nodes)),possible=uniq(os.flatMap(o=>o.possible_nodes));
      const sourceRefs=uniq(os.flatMap(o=>o.candidates.length?o.candidates.map(c=>JSON.stringify({pmid:o.source.pmid,report_id:o.source.record.report_id,stage:o.source.record.stage,
        source_sha256:o.source.record.source_sha256,review_binding_sha256:o.source.binding,arm_id:o.arm.id,population_id:c.sample.population_id,sample_id:c.sample.id,n:c.n,
        count_purpose:c.sample.count_purpose,evidence_ids:refs(o.source,list(c.sample.evidence))})): [JSON.stringify({pmid:o.source.pmid,report_id:o.source.record.report_id,stage:o.source.record.stage,
        source_sha256:o.source.record.source_sha256,review_binding_sha256:o.source.binding,arm_id:o.arm.id,population_id:o.arm.population_id,sample_id:null,n:null,evidence_ids:refs(o.source,list(o.arm.evidence))})])).map(JSON.parse);
      const notes=[];
      if(conflict)notes.push('Different same-purpose arm denominators; the largest supported cohort is retained, with the latest source at that size.');
      if(ambiguousDose)notes.push('Follow-up dose-arm allocation is unresolved; no extra participants added.');
      if(multipleLocalArms)notes.push('More than one source arm has this regimen; independence is unresolved and one denominator is retained.');
      if(selected?.partial)notes.push('Treated/partial arm count used because a complete assigned or enrolled arm denominator is unavailable.');
      if(selected?.population_state.melanoma_subset)notes.push('Only the explicitly reported melanoma arm allocation is counted; the mixed-cancer parent total is excluded.');
      if(!selected)notes.push('No eligible source-bound arm or subgroup denominator is available.');
      if(representative.participant_hold_reason)notes.push(representative.participant_hold_reason);
      const alternativeNodes=selected?list(selected.observation.semantics.alternative).map(id=>'agent:'+id).filter(id=>nodes.has(id)&&!selected.observation.certain_nodes.includes(id)):[];
      if(alternativeNodes.length)notes.push('Inclusive OR allocation: the full cohort N is credited to each named alternative; node totals overlap and do not establish which agent each participant received.');
      if(selected?.population_state.subgroup)notes.push('Partial participant count from a labelled subgroup; not added again when its overall cohort is counted.');
      const c={id:'arm:'+hash([base,partition]).slice(0,24),node_ids:[],relevant_node_ids:possible,certain_node_ids:supported,
        exact_node_ids:uniq(os.map(o=>o.exact_node_id)).filter(id=>nodes.has(id)),_observations:os,_base_note:notes.join(' '),
        study_id:representative.study_id,study_name:representative.study_name,nct_ids:representative.nct_ids,linkage:representative.linkage,
        ...(representative.participant_hold_reason?{participant_overlap_unresolved:!!representative.participant_overlap_unresolved,
          reused_data_review_pending:!!representative.reused_data_review_pending,participant_count_conflict:representative.participant_count_conflict||null,
          independent_cohort_count_eligible:representative.independent_cohort_count_eligible!==false,identity_source_refs:representative.identity_source_refs||[]}:{}),
        pmid:representative.source.pmid,source_url:representative.source.source_url,publication_ids:uniq(os.map(o=>o.source.pmid)),
        arm_label:representative.arm.label,arm_id:representative.arm.id,cohort_id:representative.cohort.id,cohort:representative.cohort,alternative_node_ids:alternativeNodes,inclusive_or_count:alternativeNodes.length>0,inclusive_or:alternativeNodes.length>0,allocation:alternativeNodes.length?'inclusive_or':'source_bound',population:(selected?.population||representative.population)?.label||null,
        population_melanoma_only:(selected?.population||representative.population)?.melanoma_only||'NA',
        n:selected?.n??null,available_n:selected?.n??null,count_purpose:selected?.sample.count_purpose||null,
        status:!selected?'unresolved':!representative.study_id?'provisional':conflict||ambiguousDose||multipleLocalArms||selected.partial?'partial':'calculated',
        note:notes.join(' '),source_refs:sourceRefs,selected_source_ref:selected?{pmid:representative.source.pmid,stage:representative.source.record.stage,
          source_sha256:representative.source.record.source_sha256,arm_id:representative.arm.id,sample_id:selected.sample.id,evidence_ids:refs(representative.source,list(selected.sample.evidence))}:null,
        disjoint:!!selected?.disjoint,cohort_disjoint:!!representative.population_state.disjoint,
        excluded_samples:os.flatMap(o=>o.excluded_samples.map(s=>({...s,pmid:o.source.pmid,stage:o.source.record.stage}))),
        _source_keys:uniq(os.map(o=>o.source.key)),_candidate_nodes:selected?uniq([...selected.observation.certain_nodes,...alternativeNodes]):[]};
      contributions.push(c);
    }
  }
  // Per-node independence accounting. Unlinked publications may overlap known
  // studies; they are shown as unlinked coverage and never added to known totals.
  for(const node of nodes.values()){
    const relevant=contributions.filter(c=>c.relevant_node_ids.includes(node.id)),known=relevant.filter(c=>c.study_id),unknown=relevant.filter(c=>!c.study_id);
    const eligible=known.filter(c=>c.n!==null&&c._candidate_nodes.includes(node.id)),byStudy=new Map();
    for(const c of eligible){if(!byStudy.has(c.study_id))byStudy.set(c.study_id,[]);byStudy.get(c.study_id).push(c);}
    let overlap=0;
    for(const cs of byStudy.values()){
      const sorted=cs.slice().sort((a,b)=>(a.cohort?.aggregate_parent_root_id===b.cohort?.root_id?1:b.cohort?.aggregate_parent_root_id===a.cohort?.root_id?-1:0)||Number(a.cohort?.is_subgroup)-Number(b.cohort?.is_subgroup)||Number(b.disjoint)-Number(a.disjoint)||b.n-a.n||a.id.localeCompare(b.id)),selected=[];
      for(const c of sorted){
        const independent=selected.every(other=>c.cohort?.aggregate_parent_root_id!==other.cohort?.root_id&&other.cohort?.aggregate_parent_root_id!==c.cohort?.root_id&&((c.cohort_disjoint||other.cohort_disjoint)&&c.cohort?.root_id!==other.cohort?.root_id||
          !c.cohort?.is_subgroup&&!other.cohort?.is_subgroup&&
          c.disjoint&&other.disjoint&&c._source_keys.some(k=>other._source_keys.includes(k))));
        if(independent){c.node_ids.push(node.id);selected.push(c);}
        else {overlap++;c.note+=' Participant overlap with another arm for '+node.label+' is unresolved; this node does not add its N.';}
      }
    }
    if(!eligible.length){
      // One unlinked report supplies a defensible provisional count; no assertion
      // that additional publications represent independently recruited patients.
      const byPublication=new Map();for(const c of unknown.filter(c=>c.n!==null&&c._candidate_nodes.includes(node.id))){if(!byPublication.has(c.pmid))byPublication.set(c.pmid,[]);byPublication.get(c.pmid).push(c);}
      const options=[...byPublication.values()].map(cs=>{
        const sorted=cs.slice().sort((a,b)=>b.n-a.n||a.id.localeCompare(b.id)),selected=[];
        for(const c of sorted)if(!selected.length||c.disjoint&&selected.every(x=>x.disjoint&&x._source_keys.some(k=>c._source_keys.includes(k))))selected.push(c);
        return selected;
      }).sort((a,b)=>b.reduce((n,c)=>n+c.n,0)-a.reduce((n,c)=>n+c.n,0)||a[0].pmid.localeCompare(b[0].pmid));
      for(const c of options[0]||[])c.node_ids.push(node.id);
    }
    const counted=relevant.filter(c=>c.node_ids.includes(node.id)),identified=uniq(known.filter(c=>c.independent_cohort_count_eligible!==false&&(c.certain_node_ids.includes(node.id)||list(c.alternative_node_ids).includes(node.id))).map(independentStudy)),knownStudies=uniq(counted.map(independentStudy));
    const uncertain=relevant.filter(c=>c.n===null||c.status==='partial'||!c.certain_node_ids.includes(node.id)),unlinked=uniq(unknown.flatMap(c=>c.publication_ids));
    const n=counted.length?counted.reduce((sum,c)=>sum+c.n,0):null;
    const status=!counted.length?'unresolved':counted.some(c=>!c.study_id)?'provisional':uncertain.length||unlinked.length||overlap||knownStudies.length<identified.length?'partial':'calculated';
    node.contribution_ids=relevant.map(c=>c.id);node.count_summary={identified_studies:identified.length,known_n:n,known_n_studies:knownStudies.length,
      unlinked_publications:unlinked.length,status,unresolved_arms:uncertain.length+overlap,publication_count:uniq(relevant.flatMap(c=>c.publication_ids)).length,
      counted_arms:counted.length,coverage_note:status==='provisional'?'One unlinked publication supplies a provisional count; additional publications are not summed.':unlinked.length?'Unlinked publications are not added to the identified-study participant total.':null};
  }
  const studyMemberships=exactMembership.apply({nodes,contributions,articles});
  for(const c of contributions){
    c.node_ids=uniq(c.node_ids);if(!c.node_ids.length)c.n=null;
    delete c._source_keys;delete c._candidate_nodes;
  }
  const relationships=[];
  for(const child of nodes.values())if(child.type==='combination'){
    const parents=[...nodes.values()].filter(p=>p.components.length<child.components.length&&subset(p.components,child.components));
    parents.sort((a,b)=>b.components.length-a.components.length||a.label.localeCompare(b.label)||a.id.localeCompare(b.id));
    child.parent_ids=parents.map(p=>p.id);child.overview_parent_id=parents[0]?.id||null;
    for(const parent of parents){
      const comparisonsForEdge=comparisons.filter(c=>c.intervention.node_id===child.id&&c.comparator.node_id===parent.id||c.comparator.node_id===child.id&&c.intervention.node_id===parent.id).map(c=>c.id);
      relationships.push({id:'contains:'+hash([parent.id,child.id]).slice(0,24),type:'contains',parent_id:parent.id,child_id:child.id,
        added_components:child.components.filter(id=>!parent.components.includes(id)),comparison_ids:comparisonsForEdge,documented_add_on:comparisonsForEdge.length>0});
    }
  }
  for(const c of comparisons)for(const id of [c.intervention.node_id,c.comparator.node_id])if(nodes.has(id))nodes.get(id).comparison_ids.push(c.id);
  const aliasRows=[...aliasIndex].sort(([a],[b])=>a.localeCompare(b)).map(([alias,ids])=>({alias,nct_ids:[...ids].sort(),unambiguous:ids.size===1}));
  const output={schema_version:1,record_kind:'prepared_treatment_map',metadata:{
    scope_label:'Prepared retained evidence; node counts cover the catalogue; comparison analyses apply the current study filters.',
    catalogue_agents:mapTreatments.length,catalogue_drug_agents:registry.products.length,catalogue_modalities:mapTreatments.length-registry.products.length,observed_combinations:[...nodes.values()].filter(n=>n.type==='combination').length,
    eligible_publications:new Set(sources.map(s=>s.pmid)).size,identified_studies:uniq(contributions.filter(c=>c.independent_cohort_count_eligible!==false).map(independentStudy)).length,
    source_path:input.source_path||null,source_file_sha256:input.source_file_sha256||null,clinical_content_sha256:clinical.content_sha256||null,
    registry_version:registry.version,registry_sha256:registryHash,normalization_content_sha256:normalizations?.content_sha256||null,
    as_of:quantitative.as_of||clinical.as_of||null,model_requests:0,source_retrieval_requests:0,
    count_note:'Node totals overlap. Do not add totals across treatments. PMID counts are publications, not independent studies.',
    study_linkage_note:'Source registrations and verified trial aliases are preferred; eligible original unnamed or unallocated multi-registration cohorts receive internal identities, with source relationships retained.',
    denominator_note:'Exact complete regimen only. Overall assigned/randomized or enrolled arms first; labelled subgroup/analysis counts are partial fallbacks. Unresolved alternatives and supersets do not supply node counts. Historical inclusive component coverage is retained separately.',
    overlap_note:'Repeated reports share a study/arm bucket. Additional same-treatment dose arms require a source disjointness witness. Unresolved overlap is withheld.'},
    nodes:[...nodes.values()].sort((a,b)=>a.label.localeCompare(b.label)||a.id.localeCompare(b.id)),relationships:relationships.sort((a,b)=>a.id.localeCompare(b.id)),
    comparisons:comparisons.sort((a,b)=>a.default_rank-b.default_rank||a.pmid.localeCompare(b.pmid)||a.id.localeCompare(b.id)),network_direct_evidence:networkDirectEvidence,contributions:contributions.sort((a,b)=>a.id.localeCompare(b.id)),study_memberships:studyMemberships,
    linkage:{trial_aliases:aliasRows},review:{summary:{items:review.length,unlinked_publications:uniq(contributions.filter(c=>!c.study_id).flatMap(c=>c.publication_ids)).length,
      unresolved_contributions:contributions.filter(c=>c.n===null).length},items:review}};
  output.content_sha256=hash(output);return output;
}
module.exports={build,analyzeDefinition,nodeId,hash};
if(require.main===module){try{process.stdout.write(JSON.stringify(build(JSON.parse(fs.readFileSync(0,'utf8')))));}catch(error){process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;}}
