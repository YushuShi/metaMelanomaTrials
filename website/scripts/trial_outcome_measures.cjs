'use strict';

const {normalQuantile} = require('../dist/statistical_math.js');
const {months} = require('./treatment_map_evidence.cjs');
const safetyReviews = require('../config/phase_comparison_outcome_reviews.json');
const medians = new Set(['DOR', 'RFS', 'DMFS', 'PFS', 'OS']);
const z95 = normalQuantile(.975);
const clean = value => value == null || /^(?:NA|N\/A|unknown|not reported)$/i.test(String(value).trim()) ? '' : String(value).trim();
const flag = (row, ...fields) => (row.field_flags || []).some(f => fields.includes(f.field));
const num = (row, field) => !flag(row, field) && Number.isFinite(row[field]) ? row[field] : null;
const normalize = text => String(text || '').replace(/[‐‑‒–—−]/g,'-').replace(/·(?=\d)/g,'.').replace(/\s+/g,' ').trim();
const textOf = (result, registry) => (result?.evidence_ids || []).map(id => registry?.[id]?.supporting_quote || '').filter(Boolean).join('\n');

function wilson(successes, n) {
  if (!Number.isSafeInteger(successes) || !Number.isSafeInteger(n) || n < 1 || successes < 0 || successes > n) return null;
  const p = successes / n, z2 = z95 * z95, divisor = 1 + z2 / n;
  const center = (p + z2 / (2*n)) / divisor;
  const half = z95 * Math.sqrt((p*(1-p) + z2/(4*n)) / n) / divisor;
  return {low:successes === 0 ? 0 : 100*(center-half), high:successes === n ? 100 : 100*(center+half), method:'wilson'};
}

function derivations(record, section, row) {
  return (record.derivations || []).filter(d => d.id === row.id && d.section === section);
}

function nrMeansReached(text) {
  return /\bNR\s*[,;:=(-]*\s*(?:median\s+)?not\s+(?:yet\s+)?reached\b|\bnot\s+(?:yet\s+)?reached\s*\(NR\)/i.test(text);
}
function nrMeansMissing(text) {
  return /\bNR\s*[,;:=(-]*\s*not\s+(?:reported|recorded|relevant)\b|\bnot\s+(?:reported|recorded|relevant)\s*\(NR\)/i.test(text);
}
function unreached(raw, text) {
  if (/^not[ _](?:yet[ _])?reached$/i.test(raw || '')) return true;
  return /^NR$/i.test(raw || '') && nrMeansReached(text) && !nrMeansMissing(text);
}

function boundLabel(raw, text) {
  if (unreached(raw,text) && !nrMeansMissing(text)) return 'NotReached';
  const label = String(raw ?? '').replace(/_/g,' ').trim();
  if (/^(?:not (?:yet )?estimable|(?:could not|cannot) be estimated)$/i.test(label)) return 'NotEstimable';
  if (/^NE$/i.test(label) && /\bNE\s*[,;:=(-]*\s*not estimable\b|\bnot estimable\s*\(NE\)/i.test(text) &&
      !/\bNE\s*[,;:=(-]*\s*not (?:evaluated|evaluable|examined)\b/i.test(text)) return 'NotEstimable';
  return null;
}

const endpointNames = {OS:'overall survival',DOR:'duration of (?:objective )?response',RFS:'(?:relapse|recurrence)[ -]free survival',
  DMFS:'distant metastas(?:is|es)[ -]free survival',PFS:'progression[ -]free survival'};
const namedEndpoints = new RegExp(Object.entries(endpointNames).map(([code,name]) => '\\b(?:'+code+'|'+name+')\\b').join('|'),'gi');

function sameMedianInterval(row, prefix, derived) {
  if (!/\b(?:95\s*%\s*(?:confidence interval(?:\s*\[CI\])?|CI)|(?:confidence interval|CI)\s*(?:of\s*)?95\s*%)\s*[,;:=([\s]*$/i.test(prefix)) return false;
  const names = [...prefix.matchAll(namedEndpoints)];
  const nearest = names.at(-1);
  if (!nearest || !new RegExp('^(?:'+row.endpoint+'|'+endpointNames[row.endpoint]+')$','i').test(nearest[0])) return false;
  const context = prefix.slice(nearest.index + nearest[0].length);
  // The quote can contain another endpoint or an intervening result for another
  // arm. Bind both the CI and its point before interpreting its missing bound.
  if (/[.;](?!\d)|\b(?:HR|ORR|DCR)\b/i.test(context)) return false;
  if (!Number.isFinite(row.estimate)) return /not (?:yet )?reached|\bNR\b/i.test(context);
  const point = derived.find(d => d.field === 'estimate' && d.method === 'time_to_months')?.original ?? row.estimate;
  const beforeCI = context.replace(/\b(?:95\s*%\s*(?:confidence interval|CI)|(?:confidence interval|CI)\s*(?:of\s*)?95\s*%).*$/i,'');
  const cited = [...beforeCI.matchAll(/\b\d+(?:\.\d+)?\b/g)].at(-1);
  return cited && Number(cited[0]) === point;
}

function intervalBound(row, side, text, derived, result) {
  const upper = side === 'high', field = upper ? 'ci_upper' : 'ci_lower';
  if (flag(row,field)) return null;
  for (const raw of [row[field],result?.[field]?.raw_text]) {
    const direct = boundLabel(raw,text);
    if (direct) return direct;
  }
  const other = upper ? 'ci_lower' : 'ci_upper';
  if (!Number.isFinite(row[other])) return null;
  const numericBound = derived.find(d => d.field === other && d.method === 'time_to_months')?.original ?? row[other];
  const numeric = '(\\d+(?:\\.\\d+)?)', marker = '(not (?:yet )?(?:reached|estimable)|(?:could not|cannot) be estimated|NR|NE)';
  const separator = '\\s*(?:months?|weeks?|years?|days?)?\\s*(?:-|\\bto\\b|,)\\s*';
  const pair = new RegExp('(?<![\\w.])'+(upper ? numeric+separator+marker : marker+separator+numeric)+'\\b','gi');
  const passage = normalize(text);
  const states = new Set();
  for (const m of passage.matchAll(pair)) {
    if (Number(m[upper ? 1 : 2]) !== numericBound) continue;
    const label = boundLabel(m[upper ? 2 : 1],text);
    if (label && (label === 'NotReached' || sameMedianInterval(row,passage.slice(0,m.index),derived))) states.add(label);
  }
  return states.size === 1 ? [...states][0] : null;
}

function interval(row, binary, value, scale, derived, text, result) {
  if (flag(row,'ci','ci_level') || ![95,.95].includes(row.ci_level) || row.derived_ci ||
      derived.some(d => ['derived_two_sided_Wald','user_default_unspecified_CI'].includes(d.method))) return null;
  let low = num(row,'ci_lower'), high = num(row,'ci_upper');
  if (binary && value > 1 && low !== null && high !== null && high <= 1 && 100*low <= value && value <= 100*high) {
    // A few tables give the point in percent and the CI in proportions. Only
    // rescale when the actual interval is quoted without percent units.
    const pair = /(?:95\s*%\s*)?(?:CI|confidence interval)\s*[=:(,\s]*(0(?:\.\d+)?|1(?:\.0+)?)\s*(?:-|to|,)\s*(0(?:\.\d+)?|1(?:\.0+)?)\b(?!\s*%)/gi;
    if ([...normalize(text).matchAll(pair)].some(m => Number(m[1]) === low && Number(m[2]) === high)) { low *= 100; high *= 100; }
  }
  if (low !== null) low *= scale;
  if (high !== null) high *= scale;
  if ((low !== null && (low < 0 || binary && low > 100 || value !== null && low > value)) ||
      (high !== null && (high < 0 || binary && high > 100 || value !== null && high < value)) ||
      (low !== null && high !== null && high < low)) return null;
  const statuses = {};
  if (!binary) for (const [side,bound] of [['low',low],['high',high]]) {
    const label = bound === null && intervalBound(row,side,text,derived,result);
    if (label) statuses[side+label] = true;
  }
  return low === null && high === null && !Object.keys(statuses).length ? null : {low,high,...statuses,method:'reported'};
}

function exactCounts(record, row, derived) {
  // The older pipeline can recover an integer compatible with a rounded
  // percentage. Such an integer is not a reported binomial numerator.
  const derivedCount = field => derived.some(d => d.field === field && /rounded|approx|imput|confidence|wilson/i.test(d.method));
  const numerator = derivedCount('numerator') ? null : num(row,'numerator');
  let denominator = derivedCount('denominator') ? null : num(row,'denominator');
  if (denominator === null && !derivedCount('denominator') && !flag(row,'denominator')) {
    const candidates = (record.sample_sizes || []).filter(s => s.result_id === row.id && s.population_id === row.population_id &&
      (s.arm_id === row.arm_id || record.arms?.length === 1 && !clean(s.arm_id)) && s.count_purpose === 'outcome_analysis' && s.evidence?.length &&
      Number.isSafeInteger(num(s,'n')) && s.n > 0 && !derivations(record,'sample_sizes',s).some(d => /round|approx|imput|confidence/i.test(d.method)));
    const values = new Set(candidates.map(s => s.n));
    if (values.size === 1) denominator = [...values][0];
  }
  const n = Number.isSafeInteger(denominator) && denominator > 0 ? denominator : null;
  return {denominator:n, numerator:Number.isSafeInteger(numerator) && numerator >= 0 && (n === null || numerator <= n) ? numerator : null};
}

const radiographic = /\b(?:i?RECIST|irRECIST|irRC|RANO|WHO (?:criteria|response)|(?:modified )?WHO$|radiogra(?:ph|m)|radiolog|imaging|computed tomography|magnetic resonance|CT scans?\b|MRI\b)/i;
const pathology = /\b(?:patholog(?:ic(?:al)?|y)|histolog(?:ic(?:al)?|y)|metabolic|pCR)\b/i;
const nonObjectiveResponse = /\b(?:durable (?:objective |confirmed )?response|minor (?:response|regression)|mixed (?:response|regression)|distant clinical response|clinical benefit rate|disease control rate|post[- ]progression decrease|TBP response)\b/i;
const regionalResponse = /\b(?:intra|extra)cranial (?:objective |complete |tumou?r |partial )?(?:response|ORR|CR|PR)|\b(?:lesion[- ](?:type|level)|(?:injected|uninjected|irradiated|non[- ]?(?:irradiated|injected|ablated)|visceral|cutaneous) (?:RECIST )?(?:target )?(?:lesions?|metastases))\b|burden (?:at|relative to|after) RECIST[- ]defined progression/i;
const restrictedResponse = /(?:response|regression) (?:of|in|among) (?:injected|uninjected|non-?injected|target) (?:lesions|tumou?rs)|\b(?:lesion[- ]level|intracranial|extracranial|injected lesion|uninjected lesion) (?:response|ORR|CR)|(?:percentage|proportion) of (?:all )?(?:lesions|tumou?rs)/i;
function eligibleResponse(endpoint, definition, criteria, text) {
  const explicit = [definition,criteria].join(' ');
  if (restrictedResponse.test(explicit) || regionalResponse.test(explicit) || pathology.test(explicit) || nonObjectiveResponse.test(definition) || /including stable disease/i.test(definition)) return false;
  if (endpoint !== 'CR') return true;
  if (radiographic.test(explicit.trim())) return true;
  // "Complete response" alone can be clinical, pathological or metabolic.
  return radiographic.test(text) && !pathology.test(text) && !/clinical (?:complete response|remission)/i.test(definition);
}

function eligibleMedian(endpoint, definition) {
  if (endpoint === 'DOR') {
    // DOR uses first CR/PR as time origin; PFS within responders is different.
    return !/\b(?:PFS|progression[- ]free survival|time to response|stable disease|clinical benefit|durable response (?:rate|defined)|intracranial|extracranial)\b|(?:from|since) (?:the )?(?:date of )?(?:random|first (?:dose|treatment|vaccine|[\w-]+ (?:dose|course))|start of treatment|treatment (?:start|initiation)|enrol|infusion)/i.test(definition);
  }
  if (endpoint === 'PFS' && (/\bPFS[- ]?2\b|second progression|after starting second-line|second next-line/i.test(definition) ||
      /(?:intra|extra)cranial (?:PFS|progression[- ]free survival)/i.test(definition) ||
      /time to (?:disease )?progression/i.test(definition) && !/death|progression[- ]free survival|\bPFS\b/i.test(definition))) return false;
  if (endpoint === 'RFS' && /\bRFS[- ]?2\b/i.test(definition)) return false;
  if (endpoint === 'OS' && /(?:cancer|disease|melanoma)[- ]specific survival/i.test(definition)) return false;
  return !/median follow[- ]up|time to treatment (?:failure|discontinuation)/i.test(definition);
}

const aggregate = /\b(?:adverse (?:events?|drug reactions?|effects?)|toxicities|toxicity|(?:TR|TE)?AEs?)\b/i;
const gradeAtLeast3 = /(?:≥|>=|at least)\s*(?:grade\s*)?3\b|\bgrades?\s*(?:≥|>=)\s*3\b|\bgrades?\s*3\s*(?:\+|(?:or|and)(?: of)? (?:higher|greater|worse|above)|(?:-|to|through)\s*5|\/\s*4\s*\/\s*5)|\b(?:greater than|>)\s*(?:grade\s*)?2\b/i;
const grades34 = /\bgrades?\s*3\s*(?:-|\/|and|or|to)\s*(?:grade\s*)?4\b/i;
const unrelatedSubset = /immune[- ](?:related|mediated)|\birAE|serious adverse|treatment[- ]related serious|of (?:special )?interest|selected? (?:AE|TRAEs?|adverse|toxic)|\b(?:DLT|SAE|AESI)s?\b|dose[- ]limiting|leading to|requiring (?:discontinuation|hospitali[sz]ation|interruption)|laboratory abnormal|infusion[- ]related|hematologic|haematologic|nonhematologic|hepatic|gastrointestinal|cardiac|neurologic|cutaneous toxic|infectious|at the injection site|model[- ]predicted|cumulative (?:probability|incidence)|exposure[- ]adjusted|per (?:cycle|infusion|patient[- ]year)|(?:number|proportion|percentage) of (?:all )?(?:adverse )?events\b/i;
const safetySubset = /\b(?:select(?:ed)?|listed among|organ toxicity|clinical toxicity graded|laboratory toxicity|investigations category|h(?:a)?emorrhagic|skin ulceration)\b|\bserious\)? adverse events|(?:number|percentage|proportion|count|distribution) of (?:(?:grade|treatment|all|adverse)\b.{0,20})?events\b|\d+ (?:adverse )?events (?:among|in) \d+ patients/i;
const specificToxicity = /\b(?:rash|diarrh(?:oe|e)a|colitis|hepatitis|pneumonitis|neutropeni\w*|thrombocytopeni\w*|an(?:a)?emi\w*|leu[ck]openi\w*|lymphopeni\w*|hypertension|hypotension|febrile|fatigue|nausea|vomiting|pyrexia|fever|mucositis|proteinuria|transaminase|lipase|dermatitis|transaminitis|hyperglyc(?:a)?emia)\b/i;
function grades(text) {
  return normalize(text).replace(/\bIII\b/gi,'3').replace(/\bIV\b/gi,'4').replace(/\bV\b/g,'5');
}
function attribution(row, definition) {
  if (flag(row,'safety_attribution')) return null;
  const raw = clean(row.safety_attribution);
  const related = /(?:treatment|therapy|vaccine|drug|immunotherapy)[- ](?:related|attributed)|(?:related|attributable) to (?:study )?(?:drug|treatment)|adverse drug reactions?|\bTRAEs?\b/i.test(definition);
  const overall = /all[- ]cause|(?:any|regardless of) (?:cause|causality|attribution|relation)|whether or not related/i.test(definition);
  if (raw === 'all_cause') return related && !overall ? null : 'overall';
  if (raw === 'treatment_related') return overall ? null : 'related';
  return overall ? 'overall' : related ? 'related' : null;
}
function safetyWindow(row, population, definition) {
  const scheduling = normalize(definition).toLowerCase().match(/\b(?:during|between|within|through|starting from|evaluated from|in (?:the )?first cycle)\b[^;.]*/g) || [];
  return [clean(row.cutoff)||clean(population?.cutoff), clean(row.assessment_time) && [row.assessment_time,clean(row.time_unit)].join(' '),
    ...scheduling].filter(Boolean).join(' · ');
}
function safetyContext(record,row,n,window,definition) {
  if (!n || !clean(row.arm_id) || !clean(row.population_id)) return null;
  const gradeSystem = definition.match(/\b(?:CTCAE|common (?:terminology|toxicity) criteria)[^.;]{0,38}?(?:version\s*|v\s*)(\d+(?:\.\d+)?)/i)?.[1] || '';
  // Without a specified period, only two results drawn from the very same
  // reported table/passage can establish a common assessment.
  const sharedSpan = [...new Set(row.evidence || [])].sort().join('+');
  if (!window && !sharedSpan) return null;
  return JSON.stringify([record.pmid,record.source_sha256 || record.stage,row.arm_id,row.population_id,n,window||sharedSpan,gradeSystem]);
}
function zeroFatalEvents(record,row,which,n,window,definition,context) {
  const noGrade5 = /(?:\b(?:no|zero|0)\s+(?:(?:patients? (?:had|experienced)|treatment[- ]related|all[- ]cause)\s+)*grade\s*5\b|\bgrade\s*5\s+(?:adverse\s+)?events?\s*[:=]?\s*(?:0|none)\b)/i;
  function sameZeroStatement(statement, fromDefinition) {
    if (!noGrade5.test(statement) || which === 'overall' && /treatment[- ]related|related to (?:drug|treatment)/i.test(statement)) return false;
    // A subset-, arm- or time-qualified absence does not establish zero in
    // the whole arm at this cutoff. Explicit study-wide absences do.
    if (/\b(?:in|across) (?:either|both|all) (?:groups?|arms?)\b/i.test(statement)) {
      return !/\b(?:during|cycle|between|within|subgroup|except)\b/i.test(statement);
    }
    if (/\b(?:among|in (?:the |arm|group|cohort)|during|cycle|between|within|subgroup)\b/i.test(statement)) return false;
    return fromDefinition || record.arms?.length === 1 && !/\b(?:during|cycle|between|within)\b/i.test(window);
  }
  const pieces = text => grades(text).split(/[.;\n]/);
  if (pieces(definition).some(s => sameZeroStatement(s,true)) ||
      pieces(textOf(context.result,context.registry)).some(s => sameZeroStatement(s,false))) return true;
  return (record.binary || []).some(other => {
    if (other === row || other.origin !== 'own_report' || !other.evidence?.length ||
        flag(other,'endpoint','arm_id','population_id','safety_attribution') || other.arm_id !== row.arm_id || other.population_id !== row.population_id) return false;
    const def = normalize(clean(other.endpoint_definition));
    if (!(other.endpoint === 'treatment_related_death' || /\bgrade\s*5\s+(?:treatment[- ]related )?(?:adverse events?|AEs?|toxicities)\b/i.test(grades(def))) || unrelatedSubset.test(def) || specificToxicity.test(def)) return false;
    const otherType = attribution(other,def) || (other.endpoint === 'treatment_related_death' ? 'related' : null);
    if (otherType !== which && otherType !== 'overall') return false;
    const counts = exactCounts(record,other,derivations(record,'binary',other));
    if (counts.numerator !== 0 || counts.denominator !== n || !n) return false;
    const otherWindow = safetyWindow(other,context.population,def);
    return window || otherWindow ? window === otherWindow : other.evidence.some(id => row.evidence.includes(id));
  });
}

function relatedToPartialRegimen(record,row,definition) {
  const arm = (record.arms || []).find(a => a.id === row.arm_id);
  const components = new Set((arm?.nodes || []).filter(n => n.kind === 'drug' && clean(n.name)).map(n => normalize(n.name).toLowerCase()));
  if (components.size < 2) return false;
  const named = [...components].filter(name => normalize(definition).toLowerCase().includes(name));
  return named.length > 0 && named.length < components.size;
}

function safety(record,row,counts,context,text) {
  let definition = clean(row.endpoint_definition);
  if (!definition) {
    // An unlabelled adverse-event bin can actually describe a single toxicity.
    // Require a source clause that explicitly gives this same aggregate rate.
    if (!Number.isFinite(row.percentage)) return null;
    const qualify = text.split(/(?:[.;]\s+|\n)/).map(grades).filter(sentence =>
      aggregate.test(sentence) && gradeAtLeast3.test(sentence) && !unrelatedSubset.test(sentence) && !specificToxicity.test(sentence) &&
      [...sentence.matchAll(/\b(\d+(?:\.\d+)?)\s*%/g)].some(match => Number(match[1]) === row.percentage));
    if (qualify.length !== 1) return null;
    definition = qualify[0];
  }
  const detail = grades(definition);
  const principal = detail.split(/[;.]/)[0];
  if (!aggregate.test(detail) || unrelatedSubset.test(principal) || safetySubset.test(principal) || specificToxicity.test(principal) ||
      /clinical toxicity graded|listed among/i.test(detail)) return null;
  const which = attribution(row,definition);
  if (!which || which === 'related' && relatedToPartialRegimen(record,row,principal)) return null;
  const window = safetyWindow(row,context.population,definition);
  if (!gradeAtLeast3.test(detail) && !(grades34.test(detail) && zeroFatalEvents(record,row,which,counts.denominator,window,definition,context))) return null;
  // "11 events (17%)" is a distribution of events, not patient incidence.
  if (/\b\d+ (?:grade[^,;]{1,22} )?(?:adverse )?events?\s*\(\d+(?:\.\d+)?\s*%\)/i.test(detail) && !/\bpatients?|participants?\b/i.test(detail)) return null;
  if (num(row,'percentage') === null && !/\b(?:patients?|participants?|subjects?) (?:with|had|who|report|experienc|develop|suffer)|\b(?:in|among) \d+ (?:patients?|participants?|subjects?)|\b\d+ (?:patients?|participants?|subjects?) (?:had|experienc|report|develop|suffer)/i.test(definition+' '+text)) return null;
  return {attribution:which,safetyContext:safetyContext(record,row,counts.denominator,window,definition), ...(window?{window}:{})};
}

function measure(section,source,record,context={}) {
  if (!source || source.origin !== 'own_report' || !source.evidence?.length ||
      flag(source,'row','endpoint','kind','arm_id','population_id','endpoint_definition')) return null;
  const text = textOf(context.result,context.registry);
  if (section === 'survival') {
    if (source.kind !== 'median' || !medians.has(source.endpoint) || !eligibleMedian(source.endpoint,clean(source.endpoint_definition)) ||
        /(?:median|estimate) (?:was |is )?(?:greater than|less than|at least|at most|[<>])/i.test(clean(source.endpoint_definition))) return null;
    const value = num(source,'estimate'), scale = flag(source,'unit') ? null : months(1,source.unit);
    const notReached = !flag(source,'median_status','estimate') && !nrMeansMissing(text) &&
      (unreached(source.median_status,text) || unreached(source.estimate,text)) &&
      !(text && /\bNR\b/.test(text) && !/not (?:yet )?reached/i.test(text));
    if (value !== null && (value < 0 || !scale || notReached || source.median_status==='not_estimable')) return null;
    if (value === null && !notReached) return null;
    const point = value === null ? null : value*scale;
    return {endpoint:source.endpoint,value:point,notReached,ci:scale ? interval(source,false,point,scale,derivations(record,section,source),text,context.result) : null};
  }
  if (section !== 'binary' || !['ORR','CR','AE_grade_ge3','AE_grade_3_4'].includes(source.endpoint)) return null;
  const review = safetyReviews[record.source_sha256];
  const reviewed = review?.rows[source.id];
  // The reviewed full-text table separates overall and treatment-related severe
  // AEs and gives the safety denominator (see review.source_url, Table 2).
  const row = reviewed && review.pmid === String(record.pmid) && source.endpoint==='AE_grade_ge3' && source.endpoint_definition==='Grade >3 adverse events' &&
    source.arm_id===reviewed.arm_id && source.population_id===reviewed.population_id && source.percentage===reviewed.percentage ?
    {...source,...reviewed,endpoint_definition:'All-cause grade ≥3 adverse events',safety_attribution:'all_cause'} : source;
  const derived = derivations(record,section,row);
  const counts = exactCounts(record,row,derived);
  const reported = num(row,'percentage');
  const endpoint = row.endpoint.startsWith('AE_') ? 'AE' : row.endpoint;
  if (endpoint!=='AE' && (flag(row,'response_criteria') || !eligibleResponse(endpoint,clean(row.endpoint_definition),clean(row.response_criteria),text))) return null;
  const ae = endpoint==='AE' ? safety(record,row,counts,context,text) : {};
  if (!ae) return null;
  const {numerator,denominator} = counts;
  const observed = denominator && numerator !== null ? numerator/denominator*100 : null;
  const value = reported ?? observed;
  if (value === null || value < 0 || value > 100) return null;
  let ci = interval(row,true,value,1,derived,text,context.result);
  // Counts inconsistent with the reported point cannot supply its precision.
  const decimals = String(reported ?? '').split('.')[1]?.length || 0;
  if (!ci && observed !== null && (reported === null || Math.abs(reported-observed) <= .5*Math.pow(10,-decimals)+1e-8)) ci = wilson(numerator,denominator);
  return {endpoint,value,notReached:false,ci,...counts,...ae};
}
module.exports={measure,wilson};
