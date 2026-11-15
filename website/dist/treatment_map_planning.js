/* Source-bound planning scenarios. All N values are prospective calculations, never observed counts. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./treatment_map_analysis.js'),require('./treatment_map_effects.js'));else root.TreatmentMapPlanning=factory(root.TreatmentMapAnalysis,root.TreatmentMapEffects);})(typeof globalThis==='undefined'?this:globalThis,function(Analysis,Effects){
  'use strict';
  const defaults=Object.freeze({alpha:0.05,power:0.8,sidedness:2,arms:2,allocation:1,mode:'benchmark',plannedSide:'reported',precision:0.05,dropout:0,manualProbability:null,manualExpectedProbability:null,manualHorizon:null});
  const probability=x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<1;
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const text=x=>String(x??'').trim().toLowerCase().replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ');
  const unique=items=>[...new Set(items.filter(item=>item!==null&&item!==undefined&&item!==''))];
  const distinctRefs=refs=>[...new Map(refs.map(ref=>[JSON.stringify(ref),ref])).values()];
  function settings(values={}){
    const s={...defaults,...values};
    if(!probability(s.alpha)||!probability(s.power)||s.power<=0.5)throw Error('Alpha must be between 0 and 1; power must exceed 50% and be below 100%.');
    if(![1,2].includes(s.sidedness)||![1,2].includes(s.arms))throw Error('Choose one or two sides and one or two arms.');
    if(!finite(s.allocation)||s.allocation<=0)throw Error('Allocation must be positive.');
    if(!finite(s.dropout)||s.dropout<0||s.dropout>=1)throw Error('Loss to follow-up must be at least 0% and less than 100%.');
    if(!probability(s.precision)||s.precision>=0.5)throw Error('Precision must be between 0 and 50 percentage points.');
    if(s.manualProbability!==null&&!probability(s.manualProbability))throw Error('The reference probability must be between 0% and 100%.');
    if(s.manualExpectedProbability!==null&&!probability(s.manualExpectedProbability))throw Error('The expected planned-arm probability must be between 0% and 100%.');
    if(s.manualHorizon!==null&&(!finite(s.manualHorizon)||s.manualHorizon<=0))throw Error('The time horizon must be positive.');
    if(!['reported','tail','head'].includes(s.plannedSide))throw Error('Choose the reported intervention, arrow tail or arrowhead for planning.');
    if(!['benchmark','precision'].includes(s.mode))throw Error('Unknown planning mode.');
    return s;
  }
  function events(hr,values={}){
    const s=settings(values);if(!finite(hr)||hr<=0)return {events:null,reason:'No valid HR'};
    if(Math.abs(Math.log(hr))<1e-12)return {events:null,reason:'No finite size for HR=1'};
    const z=Analysis.normalQuantile(1-s.alpha/s.sidedness)+Analysis.normalQuantile(s.power);
    const a=s.allocation/(1+s.allocation),d=z*z/(Math.log(hr)**2*(s.arms===2?a*(1-a):1));
    return {events:Number.isSafeInteger(Math.ceil(d))?Math.ceil(d):null,unrounded:d,method:s.arms===2?'Schoenfeld two-arm log-rank':'Wu one-arm modified log-rank approximation',event_basis:s.arms===1?'Expected events on the historical-null scale':'Total observed events across both arms'};
  }
  function targetProbability(effect,measure,p0){
    if(!probability(p0)||!finite(effect)||effect<=0)return null;
    const p=measure==='HR'?1-Math.pow(1-p0,effect):measure==='RR'?p0*effect:measure==='OR'?effect*p0/(1-p0+effect*p0):null;
    return probability(p)?p:null;
  }
  function referenceProbability(effect,measure,p1){
    return targetProbability(1/effect,measure,p1);
  }
  function precisionN(p,halfWidth,alpha){
    if(!probability(p))return null;
    const z=Analysis.normalQuantile(1-alpha/2),z2=z*z;
    const half=n=>z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/(1+z2/n);
    let lo=1,hi=2;while(half(hi)>halfWidth&&hi<1e9)hi*=2;
    if(hi>=1e9)return null;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(half(mid)<=halfWidth)hi=mid;else lo=mid+1;}
    return lo;
  }
  function calculate(effect,measure,assumption,values={}){
    const s=settings(values),out={n:null,events:null,event_rate:null,event_rate_basis:null,n_before_dropout:null,dropout:s.dropout,reason:null,method:null,p0:null,p1:null,derived_probability:false};
    if((!finite(effect)||effect<=0)&&!(s.arms===1&&s.mode==='precision'&&assumption?.kind==='expected_probability'))return {...out,reason:'No compatible effect estimate'};
    const a=assumption||{};let p0=null,p1=null,pbar=null;
    if(a.kind==='expected_probability')p1=a.probability;
    else if(a.kind==='overall_event_fraction')pbar=probability(a.probability)?a.probability:null;
    else if(a.kind==='paired_event_fractions'){p0=a.reference_probability;p1=a.target_probability;}
    else if(a.kind==='reference_probability'){
      p0=a.probability;p1=targetProbability(effect,measure,p0);out.derived_probability=true;
    }else if(a.kind==='target_probability'){
      // A reported target rate may determine a reference rate only for a fixed-time probability,
      // not an observed event fraction under unequal censoring.
      p1=a.probability;if(a.fixed_time===true||measure!=='HR'){p0=referenceProbability(effect,measure,p1);out.derived_probability=true;}
    }
    out.p0=p0;out.p1=p1;
    if(s.arms===1&&s.mode==='precision'){
      if(!probability(p1))return {...out,reason:'An expected rate for the planned arm is needed'};
      if(measure==='HR'&&!a.fixed_time)return {...out,reason:'Precision planning requires a fixed-time event probability and complete follow-up'};
      out.method='Wilson interval expected half-width (complete fixed-time follow-up)';out.n=precisionN(p1,s.precision,s.alpha);
    }else if(measure==='HR'){
      Object.assign(out,events(effect,s));
      if(!out.events)return out;
      if(['reference_probability','target_probability'].includes(a.kind)&&!a.fixed_time)return {...out,reason:'A specified time horizon is required for the event probability'};
      if(s.arms===1){
        if(a.kind==='paired_event_fractions'&&!(a.compatible_censoring===true||(a.fixed_time===true&&finite(a.time_months)&&a.time_months>0)))return {...out,reason:'One-arm N requires compatible censoring or complete follow-up at the same fixed time'};
        if(!probability(p0)||!probability(p1))return {...out,reason:'One-arm N needs historical and planned-arm event probabilities'};
        pbar=(p0+p1)/2;
      }else if(probability(p0)&&probability(p1))pbar=(p0+s.allocation*p1)/(1+s.allocation);
      if(!probability(pbar))return {...out,reason:'Event proportion unavailable; required events shown'};
      out.event_rate=pbar;
      out.event_rate_basis=a.kind==='overall_event_fraction'?'reported_overall_event_fraction':a.kind==='paired_event_fractions'
        ?s.arms===1?'mean_reported_arm_event_fractions':'allocation_weighted_reported_arm_event_fractions'
        :s.arms===1?'mean_null_and_model_alternative_event_probabilities':'allocation_weighted_model_event_probabilities';
      // Enroll enough participants for the displayed whole-number event target.
      // The continuous event formula remains available as `unrounded`.
      out.n=Math.ceil(out.events/pbar);
    }else if(['RR','OR'].includes(measure)){
      if(!probability(p0)||!probability(p1))return {...out,reason:'A compatible control-group response/event probability is needed'};
      const diff=Math.abs(p1-p0);if(diff<1e-12)return {...out,reason:'No finite size for equal rates'};
      const za=Analysis.normalQuantile(1-s.alpha/s.sidedness),zb=Analysis.normalQuantile(s.power);
      if(s.arms===1){out.method='One-sample proportion normal approximation; fixed historical benchmark';out.n=Math.ceil((za*Math.sqrt(p0*(1-p0))+zb*Math.sqrt(p1*(1-p1)))**2/diff**2);}
      else{const r=s.allocation,p=(p0+r*p1)/(1+r);const n0=Math.ceil((za*Math.sqrt(p*(1-p)*(1+1/r))+zb*Math.sqrt(p0*(1-p0)+p1*(1-p1)/r))**2/diff**2);out.method='Two independent proportions normal approximation';out.n=n0+Math.ceil(r*n0);}
    }else return {...out,reason:'Planning is unavailable for this effect measure'};
    if(out.n!==null){out.n_before_dropout=out.n;out.n=Math.ceil(out.n/(1-s.dropout));if(!Number.isSafeInteger(out.n)||out.n<=0){out.n=null;out.n_before_dropout=null;}}
    return out;
  }
  function sourceBindings(a){return (a.source_refs||[]).filter(r=>r.report_id&&r.stage&&r.source_sha256).map(r=>[r.report_id,r.stage,r.source_sha256].join('|'));}
  function sharedSource(a,b){const bindings=sourceBindings(a);return bindings.some(key=>sourceBindings(b).includes(key));}
  function cutoffKey(value){
    const raw=text(value);if(!raw)return '';
    const iso=raw.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[],named=raw.match(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+(?:19|20)\d{2}\b/g)||[];
    const dates=unique([...iso,...named].map(value=>{const parsed=Date.parse(value);if(!Number.isFinite(parsed))return null;const day=new Date(parsed).toISOString().slice(0,10);
      if(/^\d{4}-/.test(value))return day===value?day:null;
      return Number(day.slice(8))===Number(value.match(/\b\d{1,2}\b/)?.[0])?day:null;}));
    return dates.length===1?dates[0]:raw;
  }
  function assessmentKey(a){
    if(text(a.assessment))return text(a.assessment);
    const label=text(a.label),central=/central|independent (?:review|assessment)|\bbicr\b/.test(label),investigator=/investigator/.test(label);
    return central&&investigator?'mixed':central?'central':investigator?'investigator':'';
  }
  function criteriaKey(a){
    if(text(a.response_criteria))return text(a.response_criteria);
    const label=text(a.label);
    if(/immune.?related (?:response|recist)|\birrecist\b|\birecist\b|\birrc\b/.test(label))return 'immune_response_criteria';
    if(/recist\s*(?:v(?:ersion)?\s*)?1\.1/.test(label))return 'recist_1_1';
    if(/recist\s*(?:v(?:ersion)?\s*)?1\.0/.test(label))return 'recist_1_0';
    return '';
  }
  function sameRateScope(a,b){
    return a.reported_kind===b.reported_kind&&text(a.outcome)===text(b.outcome)&&(a.time_months??null)===(b.time_months??null)
      &&text(a.population_id)===text(b.population_id)&&cutoffKey(a.cutoff)===cutoffKey(b.cutoff)
      &&assessmentKey(a)===assessmentKey(b)&&criteriaKey(a)===criteriaKey(b)&&text(a.safety_attribution)===text(b.safety_attribution)&&text(a.estimand)===text(b.estimand);
  }
  function sameReportedRate(a,b){return finite(a.probability)&&finite(b.probability)&&Math.abs(a.probability-b.probability)<=1e-12
    &&!['n','events'].some(key=>finite(a[key])&&finite(b[key])&&a[key]!==b[key]);}
  function mergeRateDuplicates(rows){
    const merged=[];
    for(const row of rows){
      // Shared verified source scope or an already source-certified common
      // record ID can establish duplication; equal rates alone cannot.
      const ids=unique([row.id,...(row.source_record_ids||[]),...(row.merged_assumption_ids||[])]);
      const previous=merged.find(other=>other.kind===row.kind&&(text(row.population_id)||ids.some(id=>(other.merged_assumption_ids||[]).includes(id)))&&sameRateScope(other,row)&&sameReportedRate(other,row)
        &&(sharedSource(other,row)||ids.some(id=>(other.merged_assumption_ids||[]).includes(id))));
      if(previous){previous.source_refs=distinctRefs([...(previous.source_refs||[]),...(row.source_refs||[])]);previous.merged_assumption_ids=unique([...previous.merged_assumption_ids,...ids]);previous.source_stages=unique([...(previous.source_stages||[]),...(row.source_stages||[]),row.source_stage]);}
      else merged.push({...row,source_refs:(row.source_refs||[]).slice(),merged_assumption_ids:ids,source_stages:unique([...(row.source_stages||[]),row.source_stage])});
    }
    return merged;
  }
  function preferReportedReference(rows){
    const uniqueRows=mergeRateDuplicates(rows),references=uniqueRows.filter(a=>a.kind==='reference_probability'),targets=uniqueRows.filter(a=>a.kind==='target_probability'),matched=new Set(),pairs=new Map();
    const compatible=(a,b)=>!!text(a.population_id)&&sameRateScope(a,b)&&sharedSource(a,b);
    for(const ref of references){
      const candidates=targets.filter(target=>compatible(ref,target));
      if(candidates.length!==1)continue;
      const target=candidates[0];if(references.filter(candidate=>compatible(candidate,target)).length!==1)continue;
      pairs.set(ref,target);matched.add(target);
    }
    return uniqueRows.filter(row=>!matched.has(row)).map(ref=>{
      const target=pairs.get(ref);if(!target)return ref;
      return {...ref,matched_reported_pair:true,reported_reference_probability:ref.probability,reported_target_probability:target.probability,
        reported_reference_source:ref.source_assumption,reported_target_source:target.source_assumption,
        source_refs:distinctRefs([...(ref.source_refs||[]),...(target.source_refs||[])]),
        merged_assumption_ids:unique([...(ref.merged_assumption_ids||[]),...(target.merged_assumption_ids||[])]),
        source_stages:unique([...(ref.source_stages||[]),...(target.source_stages||[])])};
    });
  }
  function assumptions(comparison,tailId,headId){
    const sources=comparison.analysis?.planning_assumptions||[],rows=[];
    const roleId=role=>role==='intervention'?Effects.armId(comparison.intervention):role==='comparator'?Effects.armId(comparison.comparator):null;
    for(const a of sources){
      if(a.outcome&&a.outcome!==comparison.outcome)continue;
      if(!probability(a.probability))continue;
      const id=roleId(a.arm_role),base={...a,source_probability:a.probability,reported_kind:a.kind,source_assumption:a};
      if(a.kind==='event_fraction'){
        if(a.arm_role==='overall')rows.push({...base,kind:'overall_event_fraction'});
        // Paired arm fractions are combined below; do not apply a PH transform to observed event/N.
      }else if(a.kind==='survival_probability'&&finite(a.time_months)&&a.time_months>0&&id){
        const kind=id===tailId?'reference_probability':id===headId?'target_probability':'unmatched',eventProbability=1-a.probability;
        rows.push({...base,kind,probability:eventProbability,fixed_time:true,
          reported_reference_probability:kind==='reference_probability'?eventProbability:null,reported_target_probability:kind==='target_probability'?eventProbability:null,
          reported_reference_source:kind==='reference_probability'?a:null,reported_target_source:kind==='target_probability'?a:null});
      }else if(a.kind==='binary_probability'&&id){const kind=id===tailId?'reference_probability':id===headId?'target_probability':'unmatched';rows.push({...base,kind,fixed_time:true,
        reported_reference_probability:kind==='reference_probability'?a.probability:null,reported_target_probability:kind==='target_probability'?a.probability:null,
        reported_reference_source:kind==='reference_probability'?a:null,reported_target_source:kind==='target_probability'?a:null});}
    }
    const eventFractions=sources.filter(a=>a.kind==='event_fraction'&&probability(a.probability)&&(!a.outcome||a.outcome===comparison.outcome));
    for(const ref of eventFractions.filter(a=>roleId(a.arm_role)===tailId))for(const target of eventFractions.filter(a=>roleId(a.arm_role)===headId)){
      if(!sharedSource(ref,target))continue;
      if((ref.time_months??null)!==(target.time_months??null)||(ref.cutoff||'')!==(target.cutoff||''))continue;
      rows.push({id:ref.id+'|'+target.id,kind:'paired_event_fractions',reference_probability:ref.probability,target_probability:target.probability,reported_reference_probability:ref.probability,reported_target_probability:target.probability,reported_reference_source:ref,reported_target_source:target,time_months:ref.time_months,fixed_time:ref.fixed_time===true&&target.fixed_time===true&&finite(ref.time_months)&&ref.time_months>0,compatible_censoring:ref.compatible_censoring===true&&target.compatible_censoring===true,label:'Observed arm event proportions',source_refs:[...(ref.source_refs||[]),...(target.source_refs||[])]});
    }
    return rows.filter(a=>a.kind!=='unmatched');
  }
  function tableRows(comparisons,{tailId,headId,measure,pooledEffect=null,...values}){
    const s=settings(values),rows=[];
    for(const c of comparisons){
      if(Effects.measureKey(c.measure)!==measure)continue;
      const forward=Effects.armId(c.intervention)===headId&&Effects.armId(c.comparator)===tailId,reverse=Effects.armId(c.intervention)===tailId&&Effects.armId(c.comparator)===headId;
      if(!forward&&!reverse)continue;
      const effect=forward?c.estimate:1/c.estimate,reported=preferReportedReference(assumptions(c,tailId,headId));
      const contextRows=reported.filter(a=>(a.time_months??null)===(s.manualHorizon??null));
      const context=contextRows.length===1&&contextRows[0].kind==='reference_probability'&&contextRows[0].reported_reference_source?contextRows[0]:null;
      // Published rates remain context for a manual scenario, never evidence
      // supporting its entered probability. Different horizons or unresolved
      // competing source scenarios cannot supply that contextual annotation.
      const manualContext=context?{reported_context_only:true,reported_reference_probability:context.reported_reference_probability,
        reported_target_probability:context.reported_target_probability,reported_reference_source:context.reported_reference_source,reported_target_source:context.reported_target_source}:{};
      const manual={...manualContext,provenance:'user_specified',source_refs:[]};
      const scenarios=s.arms===1&&s.mode==='precision'&&s.manualExpectedProbability!==null?[{...manual,id:'manual-expected',kind:'expected_probability',probability:s.manualExpectedProbability,time_months:s.manualHorizon,fixed_time:measure!=='HR'||finite(s.manualHorizon)&&s.manualHorizon>0,label:'User-specified planned-arm probability'}]:s.manualProbability===null?reported:[{...manual,id:'manual',kind:'reference_probability',probability:s.manualProbability,time_months:s.manualHorizon,fixed_time:measure!=='HR'||finite(s.manualHorizon)&&s.manualHorizon>0,label:'User-specified reference probability'}];
      if(!scenarios.length)scenarios.push({id:'missing',kind:'missing',label:'Event probability not reported'});
      for(const original of scenarios){
        let a=original;
        if(a.kind==='target_probability'&&(a.fixed_time||measure!=='HR')){
          const reference=referenceProbability(effect,measure,a.probability);
          if(probability(reference))a={...a,kind:'reference_probability',probability:reference,source_probability:original.source_probability??original.probability,provenance:'derived_reference_probability',label:(a.label||'Reported planned-arm rate')+'; reference derived once: '+(reference*100).toFixed(2)+'%'};
        }
        rows.push({id:c.id+'|'+a.id,comparison:c,assumption:a,effect,own:calculate(effect,measure,a,s),pooled:pooledEffect===null?null:calculate(pooledEffect,measure,a,s)});
      }
    }
    return rows;
  }
  return Object.freeze({defaults,settings,events,targetProbability,precisionN,calculate,assumptions,tableRows});
});
