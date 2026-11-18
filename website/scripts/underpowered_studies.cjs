/* Build a small publication-level screening table from the saved extraction. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const CI = require('../dist/confidence_intervals.js');
const Scope = require('../dist/melanoma_scope.js');
const {matchingRows} = require('../dist/underpowered_studies.js');

const survival = new Set(['OS', 'PFS', 'DFS', 'RFS', 'EFS', 'DMFS', 'DSS', 'DOR']);
const count = n => Number.isSafeInteger(n) && n >= 0;
const positive = n => count(n) && n > 0;
const clean = s => s == null || s === 'NA' ? '' : String(s).trim();
const flagged = (row, fields) => (row.field_flags || []).some(flag => fields.includes(flag.field));
const same = values => values.length && values.every(v => v === values[0]) ? values[0] : null;
const anchored = row => Boolean(row?.evidence?.length);
const sourceKey = (stage, id) => `${stage}:${id}`;

function armAllocation(effect, record, clinicalRow, registry, analysisN) {
  const arms = [effect.intervention_arm_id, effect.reference_arm_id];
  // Choose both Ns from the same population, purpose, cutoff and report.
  const counts = record.sample_sizes.filter(row => arms.includes(row.arm_id) && row.population_id === effect.population_id &&
    (!clean(row.result_id) || row.result_id === effect.id) && (!clean(row.cutoff) || !clean(effect.cutoff) || row.cutoff === effect.cutoff) &&
    row.method === 'reported' && row.complete !== 'no' && row.disjoint !== 'no' && positive(row.n) && anchored(row) &&
    !flagged(row, ['n','population_id','arm_id','cutoff','result_id']));
  for (const purpose of ['outcome_analysis', 'ITT', 'randomized', 'treated', 'eligible', 'enrolled']) {
    const pair = arms.map(id => same(counts.filter(row => row.arm_id === id && row.count_purpose === purpose &&
      (purpose !== 'outcome_analysis' || row.result_id === effect.id || (effect.display_n?.count_ids || []).includes(row.id))).map(row => row.n)));
    if (pair.every(positive) && (!analysisN || pair[0]+pair[1] === analysisN)) {
      return {fraction: pair[0]/(pair[0]+pair[1]), n: pair[0]+pair[1], basis: `${pair[0]} vs ${pair[1]} ${purpose.replace('_',' ')}`};
    }
  }
  // A randomization ratio in the source can support a whole-trial comparison.
  // A default 1:1 assumption for unknown allocation biases the estimate downward.
  const population = record.populations.find(p => p.id === effect.population_id);
  if (record.study.randomized !== 'yes' || record.arms.length !== 2 || population?.scope !== 'overall') return null;
  const prefix = `CE-${clinicalRow.review_binding_sha256.slice(0,24)}-`;
  const ids = new Set([...(record.study.evidence||[]),...record.arms.flatMap(a=>a.evidence||[]),...effect.evidence]);
  const ratios = [];
  for (const id of ids) {
    const quote = registry[prefix+id]?.supporting_quote || '';
    for (const match of quote.matchAll(/\b(?:randomi[sz](?:ed|ation)|allocated)\b[^.;:\n]{0,80}?\b([1-9]\d?)\s*:\s*([1-9]\d?)\b(?!\s*:)/gi)) {
      const a=Number(match[1]), b=Number(match[2]);
      // Swapping the two arms gives the same information denominator p(1-p).
      ratios.push(Math.min(a,b)/(a+b));
    }
  }
  const fraction = same(ratios);
  return fraction && analysisN ? {fraction,n:analysisN,basis:'reported randomization ratio'} : null;
}

function binaryEvents(effect, record, analysisN) {
  const arms = [effect.intervention_arm_id, effect.reference_arm_id];
  const eligible = record.binary.filter(row => row.origin === 'own_report' && anchored(row) && row.endpoint === effect.endpoint &&
    row.population_id === effect.population_id && arms.includes(row.arm_id) && clean(row.cutoff) === clean(effect.cutoff) &&
    !flagged(row,['numerator','denominator','endpoint','population_id','arm_id','cutoff']) &&
    count(row.numerator) && positive(row.denominator) && row.numerator <= row.denominator);
  const pairs = [];
  for (const a of eligible.filter(row=>row.arm_id===arms[0])) for (const b of eligible.filter(row=>row.arm_id===arms[1])) {
    if (['assessment_time','time_unit','response_criteria','safety_attribution'].some(key => clean(a[key]) !== clean(b[key]))) continue;
    const sharedPassage = [a,b].every(row => row.evidence.some(id=>effect.evidence.includes(id)));
    const n = a.denominator+b.denominator;
    if (analysisN && n !== analysisN) continue;
    const pa=a.numerator/a.denominator, pb=b.numerator/b.denominator;
    const ratio=effect.measure==='RR'?pa/pb:(pa/(1-pa))/(pb/(1-pb));
    // Without a common effect passage, require the same denominators and an
    // independently reproduced crude ratio to the reported rounding precision.
    const digits = String(effect.estimate).split('.')[1]?.length || 0;
    const reproduces = Number.isFinite(ratio) && Math.abs(ratio-effect.estimate) <= .500001*(10**-Math.max(digits,1));
    if (!sharedPassage && !(analysisN === n && effect.adjusted !== 'yes' && reproduces)) continue;
    const inferred=[a,b].some(row=>(record.derivations||[]).some(d=>d.section==='binary'&&d.id===row.id&&d.field==='numerator'));
    pairs.push({events:a.numerator+b.numerator, n, basis: `${a.numerator}/${a.denominator} + ${b.numerator}/${b.denominator}`, method: inferred?'Derived arm counts':'Reported arm counts'});
  }
  return pairs.length && pairs.every(p=>p.basis===pairs[0].basis && p.method===pairs[0].method) ? pairs[0] : null;
}

function survivalEvents(effect, record, row, registry, ci, analysisN, directCounts) {
  if (directCounts) return directCounts;
  if (record.study.randomized !== 'yes' || effect.adjusted === 'yes' || !ci.precision_se || effect.derived_ci ||
      /multivaria|adjusted for|propensity|weight(?:ed|ing)|frailty|cluster|time[- ]varying|subdistribution|fine.?gray|accelerated failure|restricted mean|bootstrap|credible|profile likelihood|penali[sz]|interaction/i.test(clean(effect.model))) return null;
  const allocation = armAllocation(effect,record,row,registry,analysisN);
  if (!allocation) return null;
  // Invert the approximate log-rank variance V ≈ D × p × (1−p), with V=1/SE².
  const p = allocation.fraction;
  const events = 1/(ci.precision_se**2*p*(1-p));
  if (!Number.isFinite(events) || events < 1 || events > allocation.n) return null;
  return {events,n:allocation.n,basis:allocation.basis,method:'Estimated from HR CI'};
}

function observedSurvivalCounts(graph) {
  const index = new Map();
  for (const comp of graph?.comparisons || []) {
    if (comp.measure !== 'HR' || comp.source_conflict) continue;
    for (const bind of comp.analysis?.filter_bindings || []) {
      const e=bind.quantitative_record;
      if (!e) continue;
      const rows=(comp.analysis.planning_assumptions||[]).filter(a=>a.kind==='event_fraction' && a.provenance==='reported' &&
        a.outcome===e.endpoint && a.population_id===e.population_id && clean(a.cutoff)===clean(e.cutoff) &&
        count(a.events) && positive(a.n) && a.events<=a.n && !a.time_months &&
        (a.source_refs||[]).some(ref=>ref.pmid===comp.pmid && ref.source_sha256===bind.source_input_sha256));
      const pairs=[];
      for(const a of rows.filter(v=>v.arm_id===e.intervention_arm_id))for(const b of rows.filter(v=>v.arm_id===e.reference_arm_id)){
        if(clean(a.assessment)!==clean(b.assessment)||clean(a.estimand)!==clean(b.estimand))continue;
        pairs.push({events:a.events+b.events,n:a.n+b.n,basis:`${a.events}/${a.n} + ${b.events}/${b.n}`,method:'Reported arm counts'});
      }
      if(pairs.length && pairs.every(p=>p.basis===pairs[0].basis))index.set(`${comp.pmid}|${bind.source_input_sha256}|${e.id}`,pairs[0]);
    }
  }
  return index;
}

function screenRow(result, record, comparison, context, registry, directCounts) {
  const e=result.quantitative_record;
  if (!e || !['HR','RR','OR'].includes(e.measure) || e.origin !== 'own_report' || !anchored(e) ||
      !result.main_result_eligible || result.result_relation !== 'between_arm' || result.contrast_type !== 'treatment_comparison' ||
      !comparison?.comparison_filter_eligible || !Scope.resultEligible(result,{study:context.study,comparison,context}) ||
      !clean(e.intervention_arm_id) || !clean(e.reference_arm_id) || e.intervention_arm_id===e.reference_arm_id ||
      !record.arms.some(a=>a.id===e.intervention_arm_id) || !record.arms.some(a=>a.id===e.reference_arm_id) ||
      flagged(e,['estimate','ci_lower','ci_upper','ci_level','intervention_arm_id','reference_arm_id','population_id','measure'])) return null;
  const ci=CI.forDisplay({...e, ci_level:clean(e.ci_level)||null});
  if (!(ci.estimate>0 && ci.ci_lower>0 && ci.ci_lower<=1 && ci.ci_upper>=1 && ci.ci_lower<ci.ci_upper && ci.ci_lower<=ci.estimate && ci.estimate<=ci.ci_upper)) return null;
  const analysisN=(!flagged(e,['analysis_n']) && positive(e.analysis_n)) ? e.analysis_n : null;
  const direct=directCounts.get(`${record.pmid}|${record.source_sha256}|${e.id}`);
  const events=e.measure==='HR' && survival.has(e.endpoint) ? survivalEvents(e,record,result,registry,ci,analysisN,direct) :
    e.measure!=='HR' && !survival.has(e.endpoint) ? binaryEvents(e,record,analysisN) : null;
  if (!events || analysisN && events.n!==analysisN) return null;
  let treatment=result.experimental_arm?.label, reference=result.comparator_arm?.label;
  if(!clean(treatment) || !clean(reference)) return null;
  if(treatment === reference){
    const describe = id => {
      const arm=record.arms.find(a=>a.id===id);
      const schedule=arm.nodes.filter(node=>['drug','class'].includes(node.kind)).map(node=>
        [clean(node.name),clean(node.dose),clean(node.schedule)].filter(Boolean).join(' ')).join(' + ');
      return {label:clean(arm.label),schedule};
    };
    const a=describe(e.intervention_arm_id), b=describe(e.reference_arm_id);
    if(a.label && b.label && a.label!==b.label){treatment=a.label;reference=b.label;}
    else if(a.schedule && b.schedule && a.schedule!==b.schedule){treatment=a.schedule;reference=b.schedule;}
    else return null;
  }
  return {...events, pmid:record.pmid, stage:record.stage, result_id:e.id, source_sha256:record.source_sha256,
    population:result.population?.label||'', endpoint:e.endpoint,measure:e.measure,estimate:ci.estimate,lower:ci.ci_lower,upper:ci.ci_upper,
    original_level:ci.ci_converted?ci.original_ci.ci_level:null, cutoff:clean(e.cutoff), model:clean(e.model),
    reference, treatment};
}

function build(extraction, graph) {
  const raw=new Map(extraction.articles.map(article=>[article.pmid,article.records]));
  const registry=extraction.clinical_evidence?.evidence_registry || {}, rows=[];
  const direct=observedSurvivalCounts(graph);
  for (const study of extraction.clinical_evidence?.articles || []) {
    const sources=raw.get(study.pmid);
    if (!study.current_main_eligible || sources?.at(-1)?.record.decision.status !== 'retain') continue;
    const context=Scope.contextFor(study), comparisons=new Map(study.comparisons.map(c=>[c.comparison_id,c]));
    const records=new Map(sources.map(s=>[s.record.source_sha256,s.record]));
    const links=sources.find(s=>s.stage==='R3')?.record.r2_links?.filter(l=>l.section==='effects')||[];
    const blocked=new Set(links.filter(l=>l.relation==='conflict').flatMap(l=>[sourceKey('R2',l.r2_id),sourceKey('R3',l.r3_id)]));
    const fullEffects=new Map((sources.find(s=>s.stage==='R3')?.record.effects||[]).map(e=>[e.id,e]));
    const evaluated=[];
    for (const result of study.quantitative_results) {
      const record=records.get(result.source_input_sha256),e=result.quantitative_record;
      if (!record || !e || blocked.has(sourceKey(record.stage,e.id))) continue;
      if(record.stage==='R2' && links.some(link=>{
        if(link.r2_id!==e.id || link.relation!=='same')return false;
        const later=fullEffects.get(link.r3_id);
        // A complete newer estimate supersedes a differing R2 tuple. With
        // identical tuples, let R2 supply usable precision/count information.
        return later && [later.estimate,later.ci_lower,later.ci_upper].every(Number.isFinite) &&
          ['measure','endpoint','estimate','ci_lower','ci_upper','ci_level'].some(key=>later[key]!==e[key]);
      }))continue;
      const item=screenRow(result,record,comparisons.get(result.comparison_id),context,registry,direct);
      if(item)evaluated.push(item);
    }
    // A PMID may contribute several different analyses. Repeated source stages
    // for one displayed analysis produce one row, with the R3 record preferred.
    const unique=new Map();
    for(const item of evaluated.sort((a,b)=>a.stage.localeCompare(b.stage))){
      if(item.stage==='R2' && links.some(link=>['same','supplement'].includes(link.relation) && link.r2_id===item.result_id &&
          evaluated.some(later=>later.stage==='R3' && later.result_id===link.r3_id &&
            ['endpoint','measure','estimate','lower','upper','cutoff','n'].every(key=>later[key]===item[key]))))continue;
      const key=[item.reference,item.treatment,item.population,item.cutoff,item.model,item.endpoint,item.measure,item.estimate,item.lower,item.upper,item.events].join('|');
      unique.set(key,{...item,title:study.title,year:study.year,author:study.first_author_surname||'',trial:clean(sources.at(-1).record.study.name)});
    }
    rows.push(...unique.values());
  }
  rows.sort((a,b)=>(b.year||0)-(a.year||0)||a.title.localeCompare(b.title)||a.endpoint.localeCompare(b.endpoint)||a.events-b.events);
  return {schema_version:1, source_as_of:extraction.as_of, rows};
}

function read(file){return fs.existsSync(file)?fs.readFileSync(file):zlib.gunzipSync(fs.readFileSync(file+'.gz'));}
function publish(root){
  const dir=path.join(root,'website/dist/data'),source=read(path.join(dir,'quantitative_extraction.json'));
  const graphPath=path.join(dir,'treatment_map.json');
  const graph=fs.existsSync(graphPath)||fs.existsSync(graphPath+'.gz')?JSON.parse(read(graphPath)):null;
  const hash=crypto.createHash('sha256').update(source).digest('hex');
  if(graph?.metadata?.source_file_sha256 && graph.metadata.source_file_sha256!==hash)throw Error('Treatment map belongs to a different quantitative release');
  const payload={...build(JSON.parse(source),graph),source_file_sha256:hash};
  const file=path.join(dir,'underpowered_studies.json'),temp=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp,JSON.stringify(payload)+'\n');fs.renameSync(temp,file);
  return {rows:payload.rows.length, default_rows:matchingRows(payload,100).length};
}
module.exports={build,publish,survivalEvents,binaryEvents,screenRow};
if(require.main===module)console.log(JSON.stringify(publish(path.resolve(process.argv[2]||path.join(__dirname,'../..')))));
