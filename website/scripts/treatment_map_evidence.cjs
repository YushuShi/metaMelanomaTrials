'use strict';
/* Source-bound analysis metadata only. This module does not pool estimates,
 * infer participant independence, or derive event rates from medians. */
const crypto=require('node:crypto');
const sampleLinkReviews=require('../../config/sample_size_link_reviews.json').reviews;
const comparisonResultReviews=require('../../config/comparison_result_reviews.json').reviews;
const list=x=>Array.isArray(x)?x:[];
const text=x=>typeof x==='string'&&x.trim()&&!/^(?:NA|N\/A|null|unknown)$/i.test(x.trim())?x.trim():'';
const number=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const norm=x=>text(x).normalize('NFKC').toLowerCase().replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ');
const unique=x=>[...new Set(x.filter(x=>x!==undefined&&x!==null&&x!==''))];
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,24);
function date(value){
  const raw=text(value);if(!raw)return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return !Number.isNaN(Date.parse(raw))&&new Date(raw).toISOString().slice(0,10)===raw?raw:null;
  // Extract only explicit, complete, unambiguous calendar dates. Descriptive
  // analysis/follow-up prose may surround a date but never supplies its day.
  const month='(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const candidates=raw.match(new RegExp('\\b(?:\\d{4}-\\d{2}-\\d{2}|'+month+'\\s+\\d{1,2},?\\s+(?:19|20)\\d{2}|\\d{1,2}\\s+'+month+'\\s+(?:19|20)\\d{2})\\b','gi'))||[];
  const dates=unique(candidates.map(s=>{
    const ms=Date.parse(s);if(Number.isNaN(ms))return null;const parsed=new Date(ms).toISOString().slice(0,10);
    if(/^\d{4}-/.test(s))return parsed===s?parsed:null;
    const day=Number(s.match(/\b\d{1,2}\b/)?.[0]);return Number(parsed.slice(8))===day?parsed:null;
  }));return dates.length===1?dates[0]:null;
}
function months(value,unit){
  const n=number(value);if(n===null||n<=0)return null;
  const u=norm(unit);return /^months?$/.test(u)?n:/^years?$/.test(u)?n*12:/^weeks?$/.test(u)?n*7/(365.25/12):/^days?$/.test(u)?n/(365.25/12):null;
}
const conflictingCutoff=(a,b)=>text(a)&&text(b)&&(date(a)||norm(a))!==(date(b)||norm(b));
function linkedAnalysisCompatible(a,b){
  if(number(a?.estimate)===null||a.estimate!==b?.estimate)return false;
  const da=date(a.cutoff),db=date(b.cutoff);if(da&&db&&da!==db)return false;
  const follow=value=>{
    const s=norm(value),m=s.match(/(minimum|median)\s+follow[- ]up(?:\s+(?:of|was))?\s+(\d+(?:\.\d+)?)\s*(months?|years?)/)||s.match(/(minimum|median)\s+(\d+(?:\.\d+)?)[- ](months?|years?)\s+follow[- ]up/);
    return m?{kind:m[1],months:Number(m[2])*(m[3].startsWith('year')?12:1)}:null;
  };
  const fa=follow(a.cutoff),fb=follow(b.cutoff);return !(fa&&fb&&fa.kind===fb.kind&&Math.abs(fa.months-fb.months)>1e-6);
}
function fieldProblem(row,fields){return list(row?.field_flags).some(f=>fields.test(String(f.field||''))||!f.field&&fields.test(JSON.stringify(f)));}
function sourceRef(source,section,row,refs){return {pmid:source.pmid,report_id:source.record.report_id,stage:source.record.stage,source_sha256:source.record.source_sha256,
  review_binding_sha256:source.binding||null,section,record_id:row?.id||'study',evidence_ids:refs(source,list(row?.evidence))};}
function modelFamily(value,measure){
  const s=norm(value);
  if(/accelerated failure|\baft\b|time ratio/.test(s))return 'accelerated_failure_time';
  if(/fine.?gray|subdistribution/.test(s))return 'subdistribution_hazard';
  if(/cause.?specific/.test(s))return 'cause_specific_hazard';
  if(/\bcox\b|proportional hazards/.test(s))return 'cox';
  if(/\blogistic\b/.test(s))return 'logistic';
  if(/\bpoisson\b/.test(s))return 'poisson';
  if(/log.?binomial/.test(s))return 'log_binomial';
  if(!s)return measure==='HR'?'hazard_ratio_unspecified':measure==='RR'?'risk_ratio_unspecified':measure==='OR'?'odds_ratio_unspecified':'unknown';
  return 'other:'+s;
}
function assessment(value){
  const s=norm(value),central=/central|independent (?:review|assessment)|\bbicr\b/.test(s),investigator=/investigator/.test(s);
  return central&&investigator?'mixed':central?'central':investigator?'investigator':'unspecified';
}
function estimand(effect){
  const s=norm(effect.endpoint_definition),measure=text(effect.measure);
  if(/restricted mean/.test(s))return 'restricted_mean';
  if(/(?:exclud(?:e[sd]?|ing)|without)\b.*\bnew primary\b/.test(s))return 'excludes_new_primary_melanoma';
  if(/new primary(?:\s+\w+){0,2}\s+melanoma/.test(s))return 'includes_new_primary_melanoma';
  if(/distant/.test(s)&&effect.endpoint==='RFS'&&!/local|regional/.test(s))return 'distant_recurrence';
  if(/immune.?related (?:response|recist)|\birrecist\b|\birecist\b|\birrc\b/.test(s))return 'immune_response_criteria';
  if(/recist\s*(?:v(?:ersion)?\s*)?1\.1/.test(s))return 'recist_1_1';
  if(/recist\s*(?:v(?:ersion)?\s*)?1\.0/.test(s))return 'recist_1_0';
  if(effect.endpoint==='RFS'&&/recurrence|relapse/.test(s)&&/death/.test(s)&&!/melanoma[- ](?:related|specific)|death due to melanoma/.test(s))return 'standard_rfs';
  if(effect.endpoint==='PFS'&&/progression/.test(s)&&/death/.test(s))return 'standard_pfs';
  if(!s)return 'unspecified';
  if(['OS','DSS','DMFS'].includes(effect.endpoint))return 'standard_'+effect.endpoint.toLowerCase();
  // A short endpoint label is equivalent to an unspecified definition, while
  // an unclassified explicit definition remains separate for source review.
  if(/^(?:overall survival|progression[- ]free survival|recurrence[- ]free survival|disease[- ]free survival|objective response(?: rate)?|overall response(?: rate)?)$/.test(s))return 'unspecified';
  return 'reported:'+s;
}
function design(study){
  if(study.study_type==='observational')return 'observational';
  if(study.study_type==='interventional_trial')return study.randomized==='yes'?'randomized_trial':study.randomized==='no'?'nonrandomized_trial':'unknown';
  return study.randomized==='yes'?'randomized_trial':'unknown';
}

/** Resolve only an exact co-occurring set of formal trial names. A donor must
 * explicitly name one NCT and the same complete name set in accepted study
 * evidence. A generated report identity may be refined; explicit trial or
 * multi-registration identities and original source records stay unchanged. */
function trialAliasResolver(sources,{names,anchored,quote,refs}){
  const keyName=s=>norm(s).replace(/[^a-z0-9]/g,'').replace(/\d+/g,n=>String(Number(n)));
  const named=s=>unique(names(text(s.record.study?.name)).map(keyName)).sort();
  const eligible=s=>!s.pooled&&!s.non_direct_design&&s.record.study?.study_type==='interventional_trial'&&anchored(s,s.record.study?.evidence);
  const index=new Map();
  for(const s of sources){
    if(!eligible(s))continue;
    const aliases=named(s),ncts=unique(list(s.record.study.identifiers).flatMap(x=>text(x.id).match(/\bNCT\d{8}\b/gi)||[]).map(x=>x.toUpperCase()));
    if(aliases.length<2||ncts.length!==1)continue;
    const proof=keyName(quote(s,list(s.record.study.evidence)));
    if(!aliases.every(name=>proof.includes(name))||!proof.includes(keyName(ncts[0])))continue;
    const key=JSON.stringify(aliases);if(!index.has(key))index.set(key,new Map());
    const matches=index.get(key);if(!matches.has(ncts[0]))matches.set(ncts[0],[]);
    matches.get(ncts[0]).push(sourceRef(s,'study',s.record.study,refs));
  }
  return (source,identity)=>{
    const internal=identity.study_id==='cohort:report:'+source.pmid&&identity.linkage==='internal_original_cohort';
    if((identity.study_id&&!internal)||list(identity.nct_ids).length||identity.registration_allocation_pending||!eligible(source)||list(source.ncts).length)return identity;
    const aliases=named(source);if(aliases.length<2)return identity;
    const proof=keyName(quote(source,list(source.record.study.evidence)));
    if(!aliases.every(name=>proof.includes(name)))return identity;
    const matches=index.get(JSON.stringify(aliases));if(matches?.size!==1)return identity;
    const [nct,donors]=[...matches][0];
    return {...identity,study_id:'nct:'+nct,nct_ids:[nct],linkage:'exact_cooccurring_trial_names',identity_source_refs:[...list(identity.identity_source_refs),sourceRef(source,'study',source.record.study,refs),...donors]};
  };
}

/** Enrich one accepted exact-arm source comparison. Across R2/R3, patient and
 * arm scopes are joined only through accepted explicit links, never by equal N
 * or a similar free-text population label. */
function enrich({source,effect,population,left,right,identity,cohort=null,sources,refs,anchored,quote=()=>'',accepted=()=>true,identify=()=>null,armEquivalent=()=>false}){
  const contexts=[{source,effect,population,left:left.arm||left,right:right.arm||right}],conflicts=[];
  const linked=(other,section,id)=>{
    if(other.record.stage===source.record.stage)return null;
    const full=source.record.stage==='R3'?source:other,fromR3=source.record.stage==='R3';
    const links=list(full.record.r2_links).filter(l=>l.section===section&&['same','supplement'].includes(l.relation)&&anchored(full,l.evidence)&&l[fromR3?'r3_id':'r2_id']===id);
    const ids=unique(links.map(l=>l[fromR3?'r2_id':'r3_id']));return ids.length===1?ids[0]:null;
  };
  for(const other of sources.filter(s=>s!==source&&s.pmid===source.pmid)){
    const p=linked(other,'populations',population.id),eid=linked(other,'effects',effect.id);
    const candidate=eid&&list(other.record.effects).find(e=>e.id===eid&&e.population_id===p&&e.endpoint===effect.endpoint&&e.measure===effect.measure&&anchored(other,e.evidence)&&accepted(other,e));
    let a=linked(other,'arms',contexts[0].left.id),b=linked(other,'arms',contexts[0].right.id);
    // An accepted same-effect link establishes directional arm correspondence
    // only when both complete normalized source regimens independently agree.
    if(candidate&&(!a||!b)){
      const ca=list(other.record.arms).find(x=>x.id===candidate.intervention_arm_id),cb=list(other.record.arms).find(x=>x.id===candidate.reference_arm_id);
      if(ca&&cb&&armEquivalent(source,contexts[0].left,other,ca)&&armEquivalent(source,contexts[0].right,other,cb)){
        a=a||ca.id;b=b||cb.id;
      }
    }
    if(!p||!a||!b)continue;
    const otherPop=list(other.record.populations).find(x=>x.id===p),otherLeft=list(other.record.arms).find(x=>x.id===a),otherRight=list(other.record.arms).find(x=>x.id===b);
    const covers=(arm,pop)=>{const byId=new Map(list(other.record.populations).map(x=>[x.id,x])),seen=new Set();while(pop&&!seen.has(pop.id)){if(pop.id===arm.population_id)return true;seen.add(pop.id);pop=byId.get(pop.parent_id);}return false;};
    if(!otherPop||!otherLeft||!otherRight||!covers(otherLeft,otherPop)||!covers(otherRight,otherPop))continue;
    const otherEffect=candidate&&candidate.intervention_arm_id===a&&candidate.reference_arm_id===b?candidate:null;
    contexts.push({source:other,effect:otherEffect||null,population:otherPop,left:otherLeft,right:otherRight,certified_same_analysis:!!otherEffect&&linkedAnalysisCompatible(effect,otherEffect)});
  }
  const studySources=sources.filter(s=>s.pmid===source.pmid&&anchored(s,s.record.study?.evidence)).sort((a,b)=>(b.record.stage==='R3')-(a.record.stage==='R3'));
  const choose=(key)=>{
    const vals=unique(studySources.map(s=>text(s.record.study?.[key])));
    if(vals.length>1){conflicts.push({field:key,values:vals});return 'conflict';}
    return vals[0]||'unknown';
  };
  const study={study_type:choose('study_type'),randomized:choose('randomized')};
  const setting=choose('setting'),reportedSubtype=choose('melanoma_subtype'),previous=choose('previous_systemic'),braf=choose('braf');
  // An intentionally mixed melanoma cohort belongs to the broad population.
  // Keep its reported subtype for source review and subtype-specific filters.
  const subtype=['unknown','cutaneous','mixed'].includes(reportedSubtype)?'general_melanoma':reportedSubtype;
  const matched=contexts.filter(c=>c.effect&&(!conflictingCutoff(c.effect.cutoff,effect.cutoff)||c.certified_same_analysis)).sort((a,b)=>(b.source.record.stage==='R3')-(a.source.record.stage==='R3'));
  const preferred=matched[0]||contexts[0],specifiedModels=unique(matched.map(c=>text(c.effect?.model)));
  const model=text(effect.model)||specifiedModels[0]||null,adjustments=unique(matched.map(c=>text(c.effect?.adjusted)));
  const adjusted=text(effect.adjusted)||adjustments[0]||'unknown',family=modelFamily(model,effect.measure);
  if(new Set(specifiedModels.map(x=>modelFamily(x,effect.measure))).size>1)conflicts.push({field:'model_family',values:specifiedModels});
  if(adjustments.length>1)conflicts.push({field:'adjusted',values:adjustments});
  const definitions=matched.map(c=>c.effect).filter(Boolean),knownDefinitions=definitions.filter(e=>text(e.endpoint_definition));
  const specific=x=>x!=='unspecified'&&!x.startsWith('standard_')&&!x.startsWith('reported:');
  const ownEstimand=estimand(effect),richer=knownDefinitions[0],richerEstimand=richer&&estimand(richer),ownReview=assessment(effect.endpoint_definition),richerReview=assessment(richer?.endpoint_definition);
  const definitionConflict=richer&&specific(ownEstimand)&&specific(richerEstimand)&&ownEstimand!==richerEstimand;
  const reviewConflict=ownReview!=='unspecified'&&richerReview!=='unspecified'&&ownReview!==richerReview;
  const definitionEffect=richer&&!definitionConflict&&!reviewConflict?richer:effect;
  const specificDefinitions=unique(knownDefinitions.map(estimand).filter(specific)),assessments=unique(knownDefinitions.map(e=>assessment(e.endpoint_definition)).filter(x=>x!=='unspecified'));
  if(specificDefinitions.length>1)conflicts.push({field:'estimand',values:specificDefinitions});
  if(assessments.length>1)conflicts.push({field:'assessment',values:assessments});
  const endpointEstimand=specificDefinitions.length===1?specificDefinitions[0]:estimand(definitionEffect),review=assessments.length===1?assessments[0]:ownReview;
  const ownCutoff=text(effect.cutoff),richerCutoff=text(preferred.effect?.cutoff);
  const analysisCutoff=(date(richerCutoff)&&!date(ownCutoff)?richerCutoff:ownCutoff)||richerCutoff||text(population.cutoff)||null;
  const d=design(study),reasons=[];
  if(d==='unknown')reasons.push('Study design is unresolved');
  // The default pool spans settings. Missing or intentionally mixed setting
  // metadata remains available to filters; contradictory sources still need review.
  if(setting==='conflict')reasons.push('Accepted sources disagree on clinical setting');
  if(subtype==='conflict')reasons.push('Accepted sources disagree on melanoma subtype');
  if(conflicts.length)reasons.push('Accepted sources disagree on analysis metadata');
  if(review==='mixed')reasons.push('Assessment mixes central and investigator review');
  if(family==='accelerated_failure_time'&&effect.measure==='HR')reasons.push('AFT model and reported HR require source review');
  const compatibility={design:d,setting,subtype,previous_systemic:previous,braf,model_family:family,adjusted,estimand:endpointEstimand,population_scope:population.scope||'unknown',assessment:review};
  const key=JSON.stringify(Object.values(compatibility));
  const metadataRefs=studySources.map(s=>sourceRef(s,'study',s.record.study,refs));
  for(const c of contexts){metadataRefs.push(sourceRef(c.source,'populations',c.population,refs));if(c.effect)metadataRefs.push(sourceRef(c.source,'effects',c.effect,refs));}
  const planning=[];
  for(const context of contexts){
    const s=context.source,cutoff=text(context.effect?.cutoff)||analysisCutoff;
    // A linked report with a materially different analysis date cannot fill
    // the current estimate's rate assumptions, even within the same trial.
    if(conflictingCutoff(cutoff,analysisCutoff)&&!context.certified_same_analysis&&context!==contexts[0])continue;
    for(const [section,rows] of [['survival',s.record.survival],['binary',s.record.binary]])for(const row of list(rows)){
      if(row.population_id!==context.population.id||row.endpoint!==effect.endpoint||row.origin!=='own_report'||!anchored(s,row.evidence)||!accepted(s,row)||conflictingCutoff(row.cutoff,cutoff))continue;
      const role=row.arm_id===context.left.id?'intervention':row.arm_id===context.right.id?'comparator':!text(row.arm_id)?'overall':null;
      if(!role||fieldProblem(row,/estimate|percentage|numerator|denominator|time|population|arm|cutoff/))continue;
      const common={id:'assumption:'+digest([s.key,section,row.id]),arm_role:role,arm_id:text(row.arm_id)||null,population_id:row.population_id,outcome:row.endpoint,
        cutoff:text(row.cutoff)||null,time_months:months(section==='survival'?row.time:row.assessment_time,row.time_unit),
        source_refs:[sourceRef(s,section,row,refs)],label:text(row.endpoint_definition)||row.endpoint,provenance:'reported',source_stage:s.record.stage};
      if(section==='survival'){
        if(row.kind!=='survival_probability'||common.time_months===null)continue;
        const value=number(row.estimate),unit=norm(row.unit),probability=value===null?null:/^(?:percent|percentage|%)$/.test(unit)?value/100:/^(?:proportion|probability|fraction)$/.test(unit)?value:null;
        if(probability===null||probability<0||probability>1)continue;
        planning.push({...common,kind:'survival_probability',probability,events:null,n:!fieldProblem(row,/analysis_n/)?number(row.analysis_n):null,
          reported_value:value,reported_unit:row.unit,time:row.time,time_unit:row.time_unit});
      }else{
        const events=number(row.numerator),n=number(row.denominator),percent=number(row.percentage);
        const validCounts=events!==null&&n!==null&&Number.isInteger(events)&&Number.isInteger(n)&&n>0&&events>=0&&events<=n;
        if(events!==null&&n!==null&&!validCounts)continue;
        const probability=validCounts?events/n:percent!==null&&percent>=0&&percent<=100?percent/100:null;
        if(probability===null)continue;
        const survivalEndpoint=['OS','PFS','RFS','DFS','DMFS','DSS','DOR'].includes(row.endpoint);
        if(survivalEndpoint&&(!validCounts||!/death|died|deaths|progression|recurrence|relapse|events?\b/i.test(text(row.endpoint_definition))))continue;
        if(survivalEndpoint&&role==='overall'){
          const populationArms=list(s.record.arms).filter(arm=>arm.population_id===context.population.id);
          if(populationArms.length!==2||!populationArms.every(arm=>[context.left.id,context.right.id].includes(arm.id)))continue;
        }
        planning.push({...common,kind:survivalEndpoint?'event_fraction':'binary_probability',probability,events:validCounts?events:null,n:validCounts?n:null,
          reported_percentage:percent,provenance:validCounts?'reported_counts':'reported_percentage',time:row.assessment_time,time_unit:row.time_unit,
          response_criteria:text(row.response_criteria)||null,safety_attribution:text(row.safety_attribution)||null});
      }
    }
  }
  const distinctPlanning=new Map();
  for(const p of planning){
    const key=JSON.stringify([p.kind,p.arm_role,p.outcome,p.time_months,date(p.cutoff)||norm(p.cutoff),p.probability,p.events,p.n,p.response_criteria||null,p.safety_attribution||null]);
    const previous=distinctPlanning.get(key);
    if(previous){previous.source_refs.push(...p.source_refs);previous.source_record_ids.push(p.id);previous.source_stages=unique([...previous.source_stages,p.source_stage]).sort();}
    else distinctPlanning.set(key,{...p,source_record_ids:[p.id],source_stages:[p.source_stage]});
  }
  // Resolve N inside each exact source population first. R2/R3 complements
  // below require the already certified same-effect/population/directional-arm
  // links; no count is transferred across publications or subgroup boundaries.
  const resolveSample=context=>{
    const {source,effect,population}=context,own=context,rawN=number(effect.analysis_n),counts=list(source.record.sample_sizes).filter(s=>s.population_id===population.id&&anchored(source,s.evidence)&&accepted(source,s)&&!fieldProblem(s,/\bn\b|population|arm|count_purpose/)&&!conflictingCutoff(s.cutoff,text(effect.cutoff)||analysisCutoff));
    const countRefs=[];let sampleN=rawN!==null&&!fieldProblem(effect,/analysis_n/)?rawN:null,sampleBasis=sampleN!==null?'reported_analysis_n':null;
    if(sampleN===null){
      const direct=counts.filter(s=>s.result_id===effect.id&&number(s.n)!==null&&(!text(s.arm_id)));
      const displayIds=list(effect.display_n?.count_ids),displayCounts=counts.filter(s=>displayIds.includes(s.id));
      const sourceArms=list(source.record.arms).filter(a=>a.population_id===population.id),twoArms=sourceArms.length===2&&sourceArms.every(a=>[own.left.id,own.right.id].includes(a.id));
      const usable=direct.length?direct:twoArms?displayCounts.filter(s=>!text(s.arm_id)):[];
      if(usable.length&&unique(usable.map(s=>number(s.n))).length===1){sampleN=number(usable[0].n);sampleBasis=direct.length?'source_result_count':usable[0].count_purpose;countRefs.push(...usable.map(s=>sourceRef(source,'sample_sizes',s,refs)));}
      if(sampleN===null&&twoArms&&population.scope==='overall'){
        // A complete total can cover several endpoints in the same reported
        // analysis, so an absent single result_id is not evidence of missing N.
        // Require the accepted count and effect to share their source passage
        // and exact two-arm population; never borrow a subgroup, another outcome's
        // explicit count, a different cutoff or another report's denominator.
        const shared=counts.filter(s=>!text(s.arm_id)&&!text(s.result_id)&&s.count_purpose==='outcome_analysis'&&
          s.complete==='yes'&&s.method==='reported'&&Number.isInteger(s.n)&&s.n>0&&
          list(s.evidence).some(id=>list(effect.evidence).includes(id)));
        if(shared.length&&unique(shared.map(s=>s.n)).length===1){
          sampleN=shared[0].n;sampleBasis='source_population_analysis_count';
          countRefs.push(...shared.map(s=>sourceRef(source,'sample_sizes',s,refs)));
        }
      }
      // Exact arm-bound counts can describe a pair in a multi-arm study, or a
      // subgroup whose treatment arms are defined at its parent population.
      // The count population still must equal the effect population above.
      if(sampleN===null){
        const rank={outcome_analysis:0,ITT:1,treated:2,randomized:3,enrolled:4};
        // An accepted effect-to-count link identifies its analysis population.
        // Do not replace linked randomized/ITT denominators with a generic
        // treated count simply because the latter has higher fallback priority.
        const priority=s=>s.result_id===effect.id?-2:displayIds.includes(s.id)?-1:rank[s.count_purpose];
        const selected=[own.left.id,own.right.id].map(id=>{
          const options=counts.filter(s=>s.arm_id===id&&Number.isInteger(s.n)&&s.n>=0&&rank[s.count_purpose]!==undefined&&
            (s.count_purpose!=='outcome_analysis'||s.result_id===effect.id||displayIds.includes(s.id)||
              !text(s.result_id)&&s.complete==='yes'&&s.method==='reported'&&list(s.evidence).some(id=>list(effect.evidence).includes(id)))).sort((a,b)=>priority(a)-priority(b));
          const best=options.filter(s=>priority(s)===priority(options[0]||{}));
          return unique(best.map(s=>s.n)).length===1?best[0]:null;
        });
        if(selected.every(Boolean)&&selected[0].count_purpose===selected[1].count_purpose&&selected.every(s=>s.disjoint==='yes'||s.disjoint!=='no'&&study.randomized==='yes')){
          sampleN=selected.reduce((n,s)=>n+s.n,0);sampleBasis='sum_of_disjoint_'+selected[0].count_purpose+'_arms';countRefs.push(...selected.map(s=>sourceRef(source,'sample_sizes',s,refs)));
        }
      }
    }
    const populationCounts=counts.filter(s=>!text(s.arm_id)&&!text(s.result_id)&&['randomized','enrolled','ITT','treated'].includes(s.count_purpose)&&number(s.n)!==null);
    // Screened/enrolled N is not a larger analysis cohort than randomized N.
    const populationRank={randomized:0,ITT:1,treated:2,enrolled:3};
    const bestRank=populationCounts.length?Math.min(...populationCounts.map(s=>populationRank[s.count_purpose])):null;
    const bestCounts=populationCounts.filter(s=>populationRank[s.count_purpose]===bestRank);
    const populationN=bestCounts.length?Math.max(...bestCounts.map(s=>number(s.n))):null;
    return {n:sampleN,basis:sampleBasis,source_refs:sampleN===rawN&&rawN!==null?[sourceRef(source,'effects',effect,refs)]:countRefs,
      population_n:populationN,population_purpose:bestCounts[0]?.count_purpose||null,
      population_refs:bestCounts.filter(s=>s.n===populationN).map(s=>sourceRef(source,'sample_sizes',s,refs))};
  };
  const ownSample=resolveSample(contexts[0]);
  const complementary=matched.filter(c=>c!==contexts[0]&&c.certified_same_analysis).map(resolveSample).filter(s=>s.n!==null);
  let sample=ownSample;
  if(sample.n===null&&complementary.length&&unique(complementary.map(s=>s.n)).length===1){
    sample={...complementary[0],basis:'linked_same_analysis_'+complementary[0].basis,
      source_refs:complementary.flatMap(s=>s.source_refs)};
  }
  // A manually source-checked association can repair an isolated masked R3
  // number without declaring that extraction valid. It is bound to both
  // immutable source hashes, exact directional links, counts and table quote.
  for(const review of sample.n===null?sampleLinkReviews:[]){
    if(source.pmid!==review.pmid||source.record.stage!=='R2'||source.record.source_sha256!==review.effect_source_sha256||
      effect.id!==review.effect_id||population.id!==review.population_id||
      ['endpoint','measure','estimate','ci_lower','ci_upper','ci_level','cutoff','intervention_arm_id','reference_arm_id'].some(key=>effect[key]!==review[key]))continue;
    const full=contexts.find(c=>c.source.record.stage==='R3'&&c.source.record.source_sha256===review.count_source_sha256&&c.population.id===review.population_id&&
      c.left.id===review.intervention_arm_id&&c.right.id===review.reference_arm_id&&c.effect?.id===review.effect_id&&
      ['endpoint','measure','ci_lower','ci_upper','ci_level','cutoff'].every(key=>c.effect[key]===review[key]));
    if(!full||!anchored(full.source,[review.evidence_id])||crypto.createHash('sha256').update(quote(full.source,[review.evidence_id])).digest('hex')!==review.quote_sha256)continue;
    const reviewedCounts=review.counts.map(expected=>list(full.source.record.sample_sizes).find(row=>row.id===expected.id&&row.n===expected.n&&row.arm_id===expected.arm_id&&
      row.population_id===review.population_id&&row.count_purpose==='outcome_analysis'&&row.method==='reported'&&row.complete==='yes'&&row.disjoint==='yes'&&
      row.cutoff===review.cutoff&&!text(row.result_id)&&list(row.evidence).includes(review.evidence_id)&&anchored(full.source,row.evidence)&&accepted(full.source,row)&&
      !fieldProblem(row,/\bn\b|population|arm|count_purpose/)));
    if(reviewedCounts.length===2&&reviewedCounts.every(Boolean))sample={...sample,n:reviewedCounts.reduce((n,row)=>n+row.n,0),basis:'source_reviewed_same_analysis_arm_sum',review_id:review.id,
      source_refs:reviewedCounts.map(row=>sourceRef(full.source,'sample_sizes',row,refs))};
  }
  const sampleN=sample.n,sampleBasis=sample.basis;
  const linkedIdentities=matched.map(c=>c===contexts[0]?identity:identify(c.source,c.population)).filter(Boolean),ids=unique(linkedIdentities.map(i=>i.study_id));
  const verifiedId=ids.length===1?ids[0]:identity.study_id||null;
  const filterBindings=[];
  for(const c of matched)for(const row of list(c.source.article.quantitative_results)){
    if(row.quantitative_record?.id!==c.effect?.id||row.source_input_sha256!==c.source.record.source_sha256||row.review_stage!==c.source.record.stage)continue;
    filterBindings.push(Object.fromEntries(['pmid','result_id','source_input_sha256','review_binding_sha256','population_id','report_id','review_stage','quantitative_record'].map(key=>[key,row[key]])));
  }
  const populationN=ownSample.population_n;
  const cohortMetadata=cohort?{...cohort,sample_n:sampleN??populationN,sample_n_basis:sampleN!==null?sampleBasis:populationN!==null?'reported_population_n_not_comparison_n':null,
    sample_n_count_purpose:sampleN===null&&populationN!==null?ownSample.population_purpose:null,
    sample_n_source_refs:sampleN!==null?sample.source_refs:ownSample.population_refs}:null;
  const primaryReview=comparisonResultReviews.find(review=>
    source.pmid===review.pmid&&source.record.source_sha256===review.source_sha256&&source.binding===review.review_binding_sha256&&
    effect.id===review.effect_id&&population.id===review.population_id&&
    ['endpoint','measure','estimate','ci_lower','ci_upper','ci_level','cutoff','intervention_arm_id','reference_arm_id'].every(key=>effect[key]===review[key])&&
    review.evidence.length>0&&review.evidence.every(proof=>list(effect.evidence).includes(proof.id)&&anchored(source,[proof.id])&&
      crypto.createHash('sha256').update(quote(source,[proof.id])).digest('hex')===proof.quote_sha256));
  return {schema_version:1,design:d,independent_id:verifiedId,independence_verified:!!verifiedId&&ids.length<=1&&!identity.participant_overlap_unresolved,linkage:verifiedId&&!identity.study_id?'linked_same_report_source_identity':identity.linkage,
    ...(primaryReview?{primary_analysis:true,primary_analysis_review:{id:primaryReview.id,reason:primaryReview.reason,source_ref:sourceRef(source,'effects',effect,refs)}}:{}),
    cohort:cohortMetadata,filter_bindings:filterBindings,
    setting,subtype,reported_subtype:reportedSubtype,previous_systemic:previous,braf,model_family:family,model,adjusted,estimand:endpointEstimand,population_scope:population.scope||'unknown',assessment:review,
    publication_date:null,publication_year:Number(source.article.year)||null,analysis_date:date(analysisCutoff),analysis_cutoff:analysisCutoff,
    source_completeness:source.record.stage==='R3'?(source.article.R3_report_complete?2:1):0,source_stages:unique(contexts.map(c=>c.source.record.stage)).sort(),
    compatibility:{...compatibility,key,label:[d,setting,subtype,review==='unspecified'?null:review].filter(Boolean).join(' · '),eligible:!reasons.length,reason:reasons.join('; ')||null},
    metadata_conflicts:conflicts,source_refs:metadataRefs,independence_source_refs:linkedIdentities.flatMap(i=>list(i.identity_source_refs)),planning_assumptions:[...distinctPlanning.values()],
    sample_size:{n:sampleN,basis:sampleBasis,source_refs:sample.source_refs,...(sample.review_id?{review_id:sample.review_id}:{})},
    precision:{reported_ci_level:number(effect.ci_level),reported_standard_error:null,derived_ci:effect.derived_ci||null},
    missing_inputs:planning.length?[]:['No accepted same-population, same-arm, same-endpoint event proportion or time-bound survival probability']};
}
module.exports={enrich,date,months,modelFamily,estimand,trialAliasResolver};
