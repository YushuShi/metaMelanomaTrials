'use strict';
// Project already source-checked quantitative rows onto one complete regimen.
// Keys describe estimands. Trial-level eligibility and publication chronology
// are handled by the phase comparison catalogue builder.
const {formatEffectNumber: rounded} = require('../dist/confidence_intervals.js');
const formatEffectNumber = value => rounded(value).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
const {date: cutoffDate,months} = require('./treatment_map_evidence.cjs');
const Reconciliation = require('../dist/outcome_reconciliation.js');
const outcomeReviews = require('../config/phase_comparison_outcome_reviews.json');
const reviewedReports = new Set(require('../dist/outcome_source_rules.js').filter(rule=>rule.semantic_endpoint_key).map(rule=>String(rule.pmid)));
const missing = value => value == null || /^\s*(?:|NA|N\/A|unknown|not reported)\s*$/i.test(String(value));
const clean = value => missing(value) ? '' : String(value).trim();
const textKey = value => clean(value).normalize('NFKC').toLowerCase().replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ').trim();
const flagged = (row, ...fields) => (row.field_flags || []).some(flag => fields.includes(flag.field));
const number = (row, field) => !flagged(row,field) && Number.isFinite(row[field]) ? row[field] : null;
const count = n => Number.isSafeInteger(n) && n > 0;
const response = new Set(['ORR','CR','PR','DCR','pCR']);
const survival = new Set(['OS','PFS','RFS','DFS','DMFS','EFS','DSS','DOR']);
const safety = {AE_any:'Any-grade adverse events',AE_grade_3_4:'Grade 3–4 adverse events',
  AE_grade_ge3:'Grade ≥3 adverse events',AE_immune_related:'Immune-related adverse events',
  AE_discontinuation:'Discontinuation due to adverse events',AE_serious:'Serious adverse events',
  treatment_related_death:'Treatment-related death'};

function horizon(n,unit) {
  if (!(n>0)) return null;
  let amount=n,period=clean(unit).replace(/s$/,'');
  if(period==='year') {amount*=12;period='month';}
  if(period==='week') {amount*=7;period='day';}
  if(!['month','day'].includes(period)) return null;
  const key=amount+(period==='month'?'mo':'d');
  if(period==='month' && Number.isInteger(amount/12)) return {key,label:`${amount/12}-year`};
  if(period==='day' && Number.isInteger(amount/7)) return {key,label:`${amount/7}-week`};
  return {key,label:`${formatEffectNumber(amount)}-${period}`};
}

// Use source-bound definitions already reviewed in the Studies tab when a raw
// endpoint family omits a compartment, cohort or assessment time.
function indexOutcomeSemantics(article,wrappers,registry) {
  if(!article || !reviewedReports.has(String(article.pmid))) return null;
  const rows=article.quantitative_results||[];
  const study={pmid:article.pmid,details:{quantitative_extraction:wrappers,quantitative_results:rows}};
  const options={study,rows,registry,_metadata:new Map()},index=new Map();
  for(const row of rows) {
    const result=Reconciliation.semanticOutcome(row,options);
    if(result.specific && ['reviewed_source_endpoint','linked_endpoint_semantics'].includes(result.proof?.kind))
      index.set(row.source_input_sha256+'|'+row.quantitative_record.id,result);
  }
  return index;
}

function rowHorizon(row,record,section,field) {
  const n=number(row,field);
  if(n===null || flagged(row,'time_unit')) return null;
  const original=(record.derivations||[]).find(d=>d.method==='time_to_months'&&d.section===section&&d.id===row.id&&d.field===field&&d.value===n);
  return original?horizon(original.original,original.original_unit):horizon(n,row.time_unit);
}

function qualifiers(row,semantic) {
  const details=[clean(row.endpoint_definition), clean(row.response_criteria)].filter(Boolean).join(' ');
  const result=[];
  const add=(key,label)=>result.push({key,label});
  if(response.has(row.endpoint)) {
    if(/\bunconfirmed|\bnot confirmed|\bwithout confirmation/i.test(details)) add('unconfirmed','unconfirmed');
    else if(/\bnot centrally confirmed/i.test(details)) add('central-confirmation-unspecified','without central confirmation');
    else if(/\bconfirmed (?:objective |overall |complete |partial |tumou?r |best )*(?:response|remission)|\b(?:response|ORR)s? (?:was |were )?(?:subsequently )?confirmed|\bconfirmed ORR\b/i.test(details)) add('confirmed','confirmed');
  }
  const location=semantic?.label||details;
  if(/bicompartmental|intracranial (?:or|and) extracranial|extracranial (?:or|and) intracranial/i.test(location)) add('bicompartmental','bicompartmental');
  else if(/intracranial|intracerebral|central nervous system[- ]specific/i.test(location)) add('intracranial','intracranial');
  else if(/extracranial/i.test(location)) add('extracranial','extracranial');
  else if(semantic && ![textKey(row.endpoint),textKey(row.endpoint)+'_1year',textKey(row.endpoint)+'_2year'].includes(semantic.key)) add(semantic.key,semantic.label);
  if(/\b(?:non[ -]?injected|uninjected)\b/i.test(details)) add('non-injected','non-injected lesions');
  else if(/\binjected\s+(?:lesions?|tumou?rs?|sites?|metastases)\b/i.test(details)) add('injected','injected lesions');
  if(/\bpfs[- ]?2\b|second (?:disease )?progression/i.test(details)) add('pfs2','second progression');
  if(/\b(?:investigator|site)[- ](?:assess|review)|by (?:the )?investigator/i.test(details)) add('investigator','investigator review');
  if(/\bBICR\b|\bIRC\b|independent (?:blinded )?(?:central )?(?:review|assessment)|central(?:ly)? (?:independent )?(?:review|assess)/i.test(details)) add('central','central review');
  if(response.has(row.endpoint) || row.endpoint==='PFS') {
    let immune=/\b(?:irRECIST|iRECIST|irRC)\b|immune[- ]related (?:response criteria|RECIST)/i.exec(details);
    if(immune) {
      const k=/^iRECIST$/i.test(immune[0])?'iRECIST':/irRECIST|immune[- ]related RECIST/i.test(immune[0])?'irRECIST':'irRC';
      add(k,k);
    }
    const recist=details.match(/\b(modified\s+)?RECIST(?:\s*(?:v(?:ersion)?\.?\s*)?(1\.[01]))?/i);
    if(recist) {const k=(recist[1]?'modified ':'')+'RECIST'+(recist[2]?' '+recist[2]:''); add(k,k);}
    if(/\bWHO\b|World Health Organization/i.test(details)) {const k=/modified (?:WHO|World Health Organization)/i.test(details)?'modified WHO':'WHO';add(k,k);}
    if(/\bRANO\b/i.test(details)) add('RANO','RANO');
    if(/(?:minor|mixed) (?:response|regression)|clinical benefit|excluding unconfirmed/i.test(details)) add('definition:'+textKey(row.endpoint_definition),clean(row.endpoint_definition));
  }
  if(Object.hasOwn(safety,row.endpoint)) {
    if(clean(row.endpoint_definition)) add('definition:'+textKey(row.endpoint_definition),clean(row.endpoint_definition));
    if(clean(row.safety_attribution)) add(row.safety_attribution,row.safety_attribution.replace(/_/g,'-'));
  }
  return result;
}

function subgroup(population,arm) {
  if(population?.scope!=='subgroup') return '';
  const label=clean(population.label);
  if (label && (textKey(label)===textKey(arm.label) || /^(?:all )?(?:phase (?:II|III|2|3)[ab]?|melanoma)(?: (?:expansion |efficacy )?(?:cohort|patients|population|participants))?$/i.test(label))) return '';
  return label;
}

// Dose and schedule are genuine treatment contrasts in some randomized
// trials. The main drug catalogue intentionally maps both arms to the same
// drug. Restore only the administration details that distinguish these arms.
function armVariants(record,{armKeys,populationIds}) {
  const armsByRegimen=new Map(),variants=new Map();
  for(const arm of record.arms||[]) {
    const def=armKeys instanceof Map?armKeys.get(arm.id):armKeys?.[arm.id];
    if(!def?.id || (populationIds && !populationIds.has(arm.population_id) && !missing(arm.population_id))) continue;
    if(!armsByRegimen.has(def.id)) armsByRegimen.set(def.id,[]);
    armsByRegimen.get(def.id).push(arm);
  }
  for(const peers of armsByRegimen.values()) {
    if(peers.length<2) continue;
    const terms=arm=>(arm.nodes||[]).filter(n=>['drug','class','control'].includes(n.kind));
    const agents=new Set(peers.flatMap(arm=>terms(arm).map(n=>textKey(n.name))).filter(Boolean));
    const pieces=new Map(peers.map(arm=>[arm.id,[]]));
    for(const agent of agents) for(const field of ['dose','schedule','route']) {
      const value=arm=>[...new Set(terms(arm).filter(n=>textKey(n.name)===agent).map(n=>clean(n[field])).filter(Boolean))].sort().join(' / ');
      const values=new Set(peers.map(value));
      if(values.size<2) continue;
      for(const arm of peers) {
        const v=value(arm);
        if(v) pieces.get(arm.id).push(agent+' '+v);
      }
    }
    for(const arm of peers) {
      let detail=pieces.get(arm.id).join(' · ');
      if(!detail && new Set(peers.map(a=>textKey(a.label))).size>1) detail=clean(arm.label);
      if(detail) variants.set(arm.id,detail);
    }
  }
  return variants;
}

function analysisN(row,record,isBinary) {
  const exact=number(row,isBinary?'denominator':'analysis_n');
  if(count(exact)) return exact;
  // Only a result-bound analysis count is a valid alternative; enrolment,
  // treated population, and an arm total are different denominators.
  const field=isBinary?'denominator':'analysis_n';
  if(flagged(row,field)) return null;
  const candidates=(record.sample_sizes||[]).filter(sample=>sample.result_id===row.id &&
    sample.population_id===row.population_id && (missing(sample.arm_id)||sample.arm_id===row.arm_id) &&
    sample.count_purpose==='outcome_analysis' && sample.evidence?.length && count(number(sample,'n')));
  const values=new Set(candidates.map(s=>s.n));
  return values.size===1?[...values][0]:null;
}

function interval(row, reverse, estimate,scale=1) {
  let lo=number(row,'ci_lower'),hi=number(row,'ci_upper'),level=number(row,'ci_level');
  let derived=false;
  if(lo===null && hi===null && !flagged(row,'ci','ci_lower','ci_upper','ci_level') && row.derived_ci?.method==='derived_two_sided_Wald') {
    ({ci_lower:lo,ci_upper:hi,ci_level:level}=row.derived_ci);derived=true;
  }
  const hasLo=Number.isFinite(lo),hasHi=Number.isFinite(hi);
  if((!hasLo&&!hasHi)||flagged(row,'ci')||(hasLo&&hasHi&&lo>hi)) return '';
  if(estimate!==null&&((hasLo&&lo>estimate)||(hasHi&&hi<estimate))) return '';
  if(reverse) {
    if((hasLo&&lo<=0)||(hasHi&&hi<=0)) return '';
    [lo,hi]=[hasHi?1/hi:null,hasLo?1/lo:null];
  }
  const confidence=level>0&&level<=100 ? `${formatEffectNumber(level<=1?level*100:level)}% CI` : 'CI';
  const method=derived||row.derived_ci?.method==='derived_two_sided_Wald'?'derived ':'';
  const bound=v=>Number.isFinite(v)?formatEffectNumber(v*scale):'unavailable';
  return ` (${method}${confidence} ${bound(lo)}–${bound(hi)})`;
}

function reviewedSafety(row,record) {
  const review=outcomeReviews[record.source_sha256],entry=review?.rows[row.id];
  if(!entry||review.pmid!==String(record.pmid)||row.endpoint!=='AE_grade_ge3'||row.endpoint_definition!=='Grade >3 adverse events'||
    row.arm_id!==entry.arm_id||row.population_id!==entry.population_id||row.percentage!==entry.percentage) return row;
  return {...row,endpoint_definition:'Grade ≥3 adverse events',numerator:entry.numerator,denominator:entry.denominator,sourceUrl:review.source_url};
}

function comparisonArm(label,variant) {
  if(!variant || textKey(variant)===textKey(label)) return label;
  if(variant.toLowerCase().startsWith(label.toLowerCase()+' ')) return label+variant.slice(label.length);
  return label+' ('+variant+')';
}

function outcome(section,row,record,context) {
  if(row.origin!=='own_report'||!row.evidence?.length||flagged(row,'endpoint','population_id','arm_id','intervention_arm_id','reference_arm_id','kind','measure','unit')) return null;
  const {armId,armKeys,pmid,populationIds}=context;
  if(populationIds&&!populationIds.has(row.population_id)) return null;
  const arm=(record.arms||[]).find(a=>a.id===armId);
  const pop=(record.populations||[]).find(p=>p.id===row.population_id);
  if(!arm || !pop || pop.melanoma_only!=='yes') return null;
  // Charts with a missing arm in a multi-arm trial cannot identify an
  // arm-specific estimate, even when there is exactly one primary endpoint.
  if(section!=='effects' && row.arm_id!==armId &&
    !(missing(row.arm_id) && record.arms.length===1)) return null;
  const endpoint=clean(row.endpoint);
  // Some extractions used a broad grade category for a narrower toxicity.
  // Display the reported grade where the category and definition differ.
  const narrowGrade=Object.hasOwn(safety,endpoint)&&/grade\s*(?:>\s*3|4(?:–5|[- ](?:to|and) 5)?)\b/i.test(clean(row.endpoint_definition));
  const label=narrowGrade?clean(row.endpoint_definition):safety[endpoint]||endpoint;
  const pmidText=String(pmid||record.pmid);
  const bits=[endpoint],notes=[];
  let measure,caption,value,reverse=false,comparator=null,comparison=null,estimate=null;
  if(section==='effects') {
    if(!['HR','RR','OR'].includes(row.measure) || number(row,'estimate')===null || row.estimate<=0) return null;
    if(row.intervention_arm_id!==armId && row.reference_arm_id!==armId) return null;
    const get=id=>armKeys instanceof Map?armKeys.get(id):armKeys?.[id];
    reverse=row.reference_arm_id===armId;
    const otherId=reverse?row.intervention_arm_id:row.reference_arm_id;
    const armDef=get(armId),other=get(otherId);
    const otherVariant=context.variants.get(otherId),selectedVariant=context.variants.get(armId);
    if(!other?.id||!other.label||!armDef?.id||!armDef.label) return null;
    if(other.id===armDef.id && (!otherVariant||!selectedVariant||otherVariant===selectedVariant)) return null;
    comparator=other.label+(otherVariant?' ('+otherVariant+')':'');measure=row.measure;
    comparison={treatment:comparisonArm(armDef.label,selectedVariant),reference:comparisonArm(other.label,otherVariant)};
    bits.push(measure,'vs:'+other.id+(otherVariant?'@'+textKey(otherVariant):''));caption=label+' · '+measure+' vs '+comparator;
    estimate=row.estimate;value=formatEffectNumber(reverse?1/estimate:estimate)+interval(row,reverse,estimate);
    if(reverse) value+=' (inverted)';
  } else if(section==='survival') {
    if(!survival.has(endpoint)) return null;
    measure=row.kind;bits.push(measure);
    estimate=number(row,'estimate');
    if(measure==='median') {
      caption='Median '+label;
      const scale=months(1,row.unit);
      if(estimate!==null && estimate>=0 && scale) value=formatEffectNumber(estimate*scale)+' months'+interval(row,false,estimate,scale);
      else if(estimate===null && !flagged(row,'estimate','median_status') && ['not_reached','not_estimable'].includes(row.median_status))
        value='Median '+label+(row.median_status==='not_reached'?' not reached':' not estimable')+(scale?interval(row,false,null,scale):'');
      else return null;
    } else if(measure==='survival_probability') {
      if(estimate===null||estimate<0||estimate>100||row.unit!=='percent'||flagged(row,'time_unit')) return null;
      const time=rowHorizon(row,record,section,'time');
      caption=time?time.label+' '+label:label+' probability · time not reported';
      bits.push(time?.key||'time-unspecified:'+pmidText);value=formatEffectNumber(estimate)+'%'+interval(row,false,estimate);
    } else return null;
  } else {
    if(!response.has(endpoint)&&!Object.hasOwn(safety,endpoint)) return null;
    measure='percentage';bits.push(measure);caption=label;
    estimate=number(row,'percentage');
    const n=number(row,'denominator'),events=number(row,'numerator');
    const counts=count(n)&&Number.isSafeInteger(events)&&events>=0&&events<=n;
    if(estimate!==null && (estimate<0 || estimate>100)) return null;
    if(estimate===null && !counts) {
      if(!Number.isSafeInteger(events)||events<0) return null;
      measure='patient_count';bits[1]=measure;caption=label+' · patient count';
      value=events+(events===1?' patient':' patients');
    } else {
      value=estimate===null ? formatEffectNumber(100*events/n)+'% ('+events+'/'+n+')' : formatEffectNumber(estimate)+'%';
      value+=interval(row,false,estimate??100*events/n);
    }
    if(!missing(row.assessment_time)) {
      const time=rowHorizon(row,record,section,'assessment_time');
      if(!time||flagged(row,'time_unit')) return null;
      bits.push(time.key);caption=time.label+' '+caption;
    }
  }
  const semantic=context.semantics?.get(record.source_sha256+'|'+row.id);
  for(const q of qualifiers(row,semantic)) {
    bits.push(q.key);
    if(q.key==='confirmed' && measure==='percentage') caption='Confirmed '+caption;
    else if(textKey(label)!==textKey(q.label)) notes.push(q.label);
  }
  const variant=context.variants.get(armId);
  if(variant) {bits.push('arm:'+textKey(variant));notes.push(variant);}
  const population=subgroup(pop,arm);
  if(population) {bits.push('population:'+textKey(population));notes.push(population);}
  if(Object.hasOwn(safety,endpoint) && !clean(row.endpoint_definition)) {
    // The legacy AE bins can contain specific toxicities. An unspecified
    // term must not align with a toxicity in a different publication.
    bits.push('unspecified:'+pmidText); notes.push('event unspecified');
  }
  if(notes.length) caption+=' · '+notes.join(' · ');
  const n=analysisN(row,record,section==='binary');
  return {key:bits.join('|'),label:caption,value,endpoint,measure,pmid:pmidText,
    sourceUrl:row.sourceUrl||'https://pubmed.ncbi.nlm.nih.gov/'+pmidText+'/',...(n?{denominator:n}:{}),
    ...(comparison?{comparator,comparison,outcomeLabel:[label,measure,...notes.filter(note=>note!==variant)].join(' · ')}:{}),
    sourceResultId:row.id,cutoff:clean(row.cutoff)};
}

// Within one report the same estimand can be repeated at multiple cutoffs or
// separately assessed. Prefer a demonstrably later dated cutoff; otherwise
// preserve distinct results under explicitly identified analysis rows.
function distinct(rows,record) {
  const groups=new Map(),result=[];
  for(const row of rows) {
    if(!groups.has(row.key)) groups.set(row.key,[]);
    groups.get(row.key).push(row);
  }
  for(let group of groups.values()) {
    if(group.length>1 && group.every(row=>cutoffDate(row.cutoff))) {
      const latest=group.map(row=>cutoffDate(row.cutoff)).sort().at(-1);
      group=group.filter(row=>cutoffDate(row.cutoff)===latest);
    }
    const values=new Map();
    for(const row of group) {
      const id=JSON.stringify([row.value,row.denominator??null]);if(!values.has(id)) values.set(id,row);
    }
    if(values.size===1) {result.push([...values.values()][0]);continue;}
    for(const [i,row] of [...values.values()].entries()) {
      const note=row.cutoff||'reported analysis '+(i+1);
      result.push({...row,key:row.key+'|analysis:'+row.pmid+':'+record.stage+':'+row.sourceResultId,label:row.label+' · '+note,
        ...(row.outcomeLabel?{outcomeLabel:row.outcomeLabel+' · '+note}:{})});
    }
  }
  return result;
}

function extractOutcomes(record,context) {
  const rows=[];
  context={...context,variants:armVariants(record,context)};
  for(const section of ['survival','binary','effects']) for(const row of record[section]||[]) {
    const projected=outcome(section,section==='binary'?reviewedSafety(row,record):row,record,context);
    if(projected) rows.push(projected);
  }
  return distinct(rows,record);
}

module.exports={extractOutcomes,indexOutcomeSemantics};
