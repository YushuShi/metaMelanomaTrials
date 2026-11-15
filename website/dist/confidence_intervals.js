/* Display-only standardization. Original intervals remain the precision source. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./statistical_math.js'));
  else root.ConfidenceIntervals=factory(root.StatisticalMath);
})(typeof globalThis==='undefined'?this:globalThis,function(Stats){
  'use strict';
  const SOURCE='https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-06#section-6-3-2';
  const number=value=>{if(value&&typeof value==='object'){if(value.semantic_non_scalar_source_literal===true||value.qualifier&&!['equal','exact'].includes(value.qualifier)||['not_reported','not_estimable','not_applicable'].includes(value.status))return null;value=value.value;}if(!['number','string'].includes(typeof value)||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;};
  const text=value=>String(value??'').trim();
  const ratios=new Set(['hr','hazard ratio','rr','risk ratio','relative risk','or','odds ratio','tr','time ratio','irr','incidence rate ratio','rate ratio','shr','subdistribution hazard ratio']);
  function confidenceLevel(value){
    if(value&&typeof value==='object')value=value.value;
    if(value===null||value===undefined||value==='')return 95;
    const n=number(typeof value==='string'?value.replace(/\s*%\s*$/,''):value),level=n!==null&&n>0&&n<=1?n*100:n;
    return level!==null&&level>0&&level<100?level:null;
  }
  function tuple(record){
    const ci=record.ci||{};
    return {estimate:number(record.estimate??record.effect),ci_lower:number(record.ci_lower??ci.lower??ci.low),ci_upper:number(record.ci_upper??ci.upper??ci.high),ci_level:(record.ci_level??record.confidence_level??ci.level)?.value??record.ci_level??record.confidence_level??ci.level??null};
  }
  function intervalMethod(record){return [record.ci_method,record.confidence_interval_method,record.interval_method,record.ci?.method,record.quantitative_record?.ci_method].map(value=>value?.text??value).filter(Boolean).join(' ');}
  function forDisplay(record={},options={}){
    const source=(record.ci_converted||record.ci_95_unavailable)&&record.original_ci?tuple(record.original_ci):tuple(record),level=confidenceLevel(source.ci_level);
    const original_ci={...source};
    const ci_95_unavailable=level!==95&&(source.ci_lower!==null||source.ci_upper!==null);
    const base={...source,...(ci_95_unavailable?{ci_lower:null,ci_upper:null}:{}),ci_95_unavailable,ci_converted:false,ci_conversion_method:null,ci_conversion_status:'unavailable',original_ci,precision_se:null,conversion_note:null,ci_level_assumed:source.ci_level===null||source.ci_level===undefined||source.ci_level===''};
    if(options.original)return {...base,...source,ci_95_unavailable:false,ci_conversion_status:'original'};
    const {estimate,ci_lower:lo,ci_upper:hi}=source;
    if(estimate===null||lo===null||hi===null||!(lo<hi&&lo<=estimate&&estimate<=hi))return base;
    if(level===null)return {...base,ci_conversion_status:'invalid_level',conversion_note:'The reported confidence level is invalid; the original interval is retained.'};
    // A literal 5% or 9% has appeared in source text. Do not silently interpret
    // it as 95%, or turn that likely source error into an enormous 95% interval.
    const method=intervalMethod(record),explicitNormalWald=/\bWald\b/i.test(method)&&!/\b(?:Student|bootstrap|profile|exact|t[- ]distribution)\b/i.test(method);
    if(level<50&&!explicitNormalWald)return {...base,ci_conversion_status:'source_level_review',conversion_note:`Reported ${level}% CI requires source review before conversion; the original interval is retained.`};
    const measure=text(record.measure??record.effect_measure??record.quantitative_record?.measure).toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' '),ratio=ratios.has(measure)&&lo>0&&estimate>0;
    // Recovered precision always uses the original level and original limits,
    // including when a source interval is rounded or asymmetric on the log scale.
    const se=ratio?(Math.log(hi)-Math.log(lo))/(2*Stats.normalQuantile(.5+level/200)):null;
    const precision_se=se!==null&&Number.isFinite(se)&&se>0?se:null;
    if(level===95)return {...base,precision_se,ci_conversion_status:'native_95'};
    const unsupported=record.ci_conversion_status==='unsupported_method'||/\b(?:exact|profile|bootstrap|credible|bayesian|clopper|wilson|score|percentile|likelihood[- ]ratio)\b/i.test(method);
    if(!ratio||unsupported)return {...base,precision_se:null,ci_conversion_status:'unsupported_method',conversion_note:`Original ${level}% CI retained: a 95% interval cannot be recovered reliably without its interval method or underlying data.`};
    if(precision_se===null)return base;
    const width=Stats.normalQuantile(.975)*precision_se,lower=Math.exp(Math.log(estimate)-width),upper=Math.exp(Math.log(estimate)+width);
    if(!(Number.isFinite(lower)&&Number.isFinite(upper)&&lower>0&&upper>lower))return {...base,precision_se,ci_conversion_status:'nonfinite_conversion'};
    return {...base,ci_lower:lower,ci_upper:upper,ci_level:95,ci_95_unavailable:false,ci_converted:true,ci_conversion_method:'approximate_wald_log',ci_conversion_status:'converted',precision_se,
      conversion_note:`Approximate 95% CI converted from the reported ${level}% CI using its log-scale standard error; the original interval is retained in details.`,ci_conversion_source:SOURCE};
  }
  // Display precision only: never feed formatted strings back into analysis.
  function formatEffectNumber(value, fallback='—') {
    if (value === null || value === undefined || value === '' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim()) || !Number.isFinite(Number(value))) return fallback;
    const n=Number(value);
    if(n!==0&&Math.abs(n)<0.0005)return n.toExponential(3);
    return n.toFixed(3).replace(/^-0\.000$/, '0.000');
  }
  return Object.freeze({forDisplay,confidenceLevel,formatEffectNumber,SOURCE});
});
