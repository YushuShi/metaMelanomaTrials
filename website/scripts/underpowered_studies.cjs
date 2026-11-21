/* Build a small publication-level screening table from the saved extraction. */
'use strict';
const fs = require('node:fs');
const {effectiveRecord} = require('../dist/quantitative_extraction.js');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const CI = require('../dist/confidence_intervals.js');
const Scope = require('../dist/melanoma_scope.js');
const charts = require('../dist/app.js');
const Planning = require('../dist/treatment_map_planning.js');
const Effects = require('../dist/treatment_map_effects.js');
const {date:calendarDate,months} = require('./treatment_map_evidence.cjs');
const {matchingRows} = require('../dist/underpowered_studies.js');

const survival = new Set(['OS', 'PFS', 'DFS', 'RFS', 'EFS', 'DMFS', 'DSS', 'DOR']);
const count = n => Number.isSafeInteger(n) && n >= 0;
const positive = n => count(n) && n > 0;
const clean = s => s == null || s === 'NA' ? '' : String(s).trim();
const flagged = (row, fields) => (row.field_flags || []).some(flag => fields.includes(flag.field));
const same = values => values.length && values.every(v => v === values[0]) ? values[0] : null;
const anchored = row => Boolean(row?.evidence?.length);
const sourceKey = (stage, id) => `${stage}:${id}`;

const probability = n => Number.isFinite(n) && n > 0 && n < 1;
const scopeText = str => clean(str).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const effectKey = (pmid,sha,id) => [pmid,sha,id].join('|');

// These are planning inputs for a new two-arm study. An old CI width does not
// establish what fraction of future participants will have an event.
function graphEffects(graph) {
  const out = new Map();
  for (const comparison of graph?.comparisons || []) {
    if (comparison.source_conflict) continue;
    for (const row of comparison.analysis?.filter_bindings || []) {
      const key = effectKey(comparison.pmid,row.source_input_sha256,row.quantitative_record?.id);
      if (!out.has(key)) out.set(key,[]);
      out.get(key).push(comparison);
    }
  }
  return out;
}

function matchingRate(effect, rate) {
  if (rate.outcome !== effect.endpoint || rate.population_id !== effect.population_id) return false;
  const e = scopeText(effect.endpoint_definition), r = scopeText(rate.label);
  // An endpoint family can contain different organs, adverse events,
  // response criteria and independent assessments. Preserve those distinctions.
  if (effect.endpoint.startsWith('AE') && e !== r) return false;
  const qualifiers = [/intracranial|central nervous system|brain metastases/i,/extracranial/i,/bicompartmental/i,
    /local progression/i,/second progression|second line|pfs2/i,/investigator assessed/i,/central review|bicr/i,
    /immune related response|irecist|irrecist/i,/censor(?:ed|ing) (?:at|for) subsequent/i];
  return qualifiers.every(rule => rule.test(e) === rule.test(r));
}

function compatibleCutoff(a,b) {
  if (!clean(a) || !clean(b) || scopeText(a)===scopeText(b)) return true;
  const left=Date.parse(a),right=Date.parse(b);
  return Number.isFinite(left)&&left===right;
}

function sameTuple(a,b) {
  return ['endpoint','measure','estimate','ci_lower','ci_upper','ci_level'].every(key=>a[key]===b[key]) &&
    linkedCutoffs(a,b);
}

function linkedCutoffs(a,b) {
  const da=calendarDate(a.cutoff),db=calendarDate(b.cutoff);
  if (da&&db&&da!==db) return false;
  const ca=scopeText(a.cutoff),cb=scopeText(b.cutoff);
  const horizons=text=>[...clean(text).toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*[- ]?\s*(months?|years?)\b/g)].map(m=>months(Number(m[1]),m[2]));
  const ha=horizons(a.cutoff),hb=horizons(b.cutoff);
  if (ha.length&&hb.length&&(ha.length===hb.length ? ha.some((v,i)=>v!==hb[i]) : !ha.some(v=>hb.includes(v))))return false;
  if ((/\binterim\b/.test(ca) && /\bfinal\b/.test(cb)) || (/\bfinal\b/.test(ca) && /\binterim\b/.test(cb))) return false;
  return true;
}

function graphScenarios(effect,record,comparisons) {
  const scenarios = [];
  for (const c of comparisons) {
    if (c.measure !== effect.measure || c.estimate !== effect.estimate || c.outcome !== effect.endpoint) continue;
    // The same comparison can have separately encoded R2 and R3 arm and
    // population IDs. Resolve the rate in its own bound extraction before
    // using it across stages. A PMID, a drug name or an outcome alone cannot link it.
    const bound=[{pmid:record.pmid,source_input_sha256:record.source_sha256,quantitative_record:effect},
      ...(c.analysis.filter_bindings||[]).filter(b=>b.pmid===record.pmid && sameTuple(b.quantitative_record||{},effect))];
    const selected = (c.analysis.planning_assumptions || []).filter(rate =>
      (rate.source_refs || []).some(ref => ref.pmid === record.pmid && bound.some(b=>{
        const e=b.quantitative_record, arm=rate.arm_role==='intervention'?e.intervention_arm_id:
          rate.arm_role==='comparator'?e.reference_arm_id:null;
        return ref.source_sha256===b.source_input_sha256 && (!rate.arm_id || rate.arm_id===arm) &&
          compatibleCutoff(e.cutoff,rate.cutoff) && matchingRate(e,rate);
      })));
    const comparison = {...c,analysis:{...c.analysis,planning_assumptions:selected}};
    const plans = Planning.tableRows([comparison],{tailId:Effects.armId(c.comparator),headId:Effects.armId(c.intervention),measure:effect.measure});
    for (const {assumption} of plans) {
      if (assumption.kind === 'missing') continue;
      const {kind,probability,reference_probability,target_probability,fixed_time,time_months,cutoff} = assumption;
      const source_ids = [...new Set(assumption.source_refs.map(ref=>ref.record_id))].sort();
      scenarios.push({kind,probability,reference_probability,target_probability,fixed_time,time_months,cutoff,source_ids});
    }
  }
  return [...new Map(scenarios.map(row=>[JSON.stringify(row),row])).values()];
}

function binaryScenario(effect,record) {
  const a=effect.calculation?.intervention,b=effect.calculation?.reference;
  if (a && b && a.arm_id===effect.intervention_arm_id && b.arm_id===effect.reference_arm_id &&
      a.population_id===effect.population_id && b.population_id===effect.population_id && probability(b.rate)) {
    return {kind:'reference_probability',probability:b.rate,source_ids:[a.row_id,b.row_id],
      paired_n:positive(a.denominator)&&positive(b.denominator)?a.denominator+b.denominator:null};
  }
  // A directly reported binary ratio may not be in the map. Require a unique
  // source-supported control rate for this endpoint, population and analysis.
  const rows=(record.binary||[]).filter(row=>row.arm_id===effect.reference_arm_id &&
    row.origin==='own_report' && clean(row.cutoff)===clean(effect.cutoff) && anchored(row) &&
    row.evidence.some(id=>effect.evidence.includes(id)) && matchingRate(effect,{outcome:row.endpoint,population_id:row.population_id,label:row.endpoint_definition}) &&
    !flagged(row,['numerator','denominator','percentage','endpoint','population_id','arm_id','cutoff']));
  const rates=rows.map(row=>count(row.numerator)&&positive(row.denominator)&&row.numerator<=row.denominator ?
     row.numerator/row.denominator : Number.isFinite(row.percentage)?row.percentage/100:null);
  const rate=same(rates);
  return probability(rate)?{kind:'reference_probability',probability:rate,source_ids:rows.map(row=>row.id)}:null;
}

function screenRow(result, record, comparison, context, graphIndex) {
  const e=result.quantitative_record;
  if (!e || !['HR','RR','OR'].includes(e.measure) || e.origin !== 'own_report' || !anchored(e) ||
      !result.main_result_eligible || result.result_relation !== 'between_arm' || result.contrast_type !== 'treatment_comparison' ||
      !comparison?.comparison_filter_eligible || !Scope.resultEligible(result,{study:context.study,comparison,context}) ||
      !clean(e.intervention_arm_id) || !clean(e.reference_arm_id) || e.intervention_arm_id===e.reference_arm_id ||
      !record.arms.some(a=>a.id===e.intervention_arm_id) || !record.arms.some(a=>a.id===e.reference_arm_id) ||
      flagged(e,['estimate','ci_lower','ci_upper','ci_level','intervention_arm_id','reference_arm_id','population_id','measure'])) return null;
  const ci=CI.forDisplay({...e, ci_level:clean(e.ci_level)||null});
  if (!(ci.estimate>0 && ci.ci_lower>0 && ci.ci_lower<=1 && ci.ci_upper>=1 && ci.ci_lower<ci.ci_upper && ci.ci_lower<=ci.estimate && ci.estimate<=ci.ci_upper)) return null;
  if ((e.measure === 'HR') !== survival.has(e.endpoint) ||
      /accelerated failure|time ratio|fine.?gray|subdistribution|time[- ]varying hazard|restricted mean/i.test(clean(e.model))) return null;
  const comps=graphIndex.get(effectKey(record.pmid,record.source_sha256,e.id))||[];
  // An RR and OR calculated from exactly the same two binary records give the
  // identical two-proportion design. Deduplicate only this proven pair.
  const calc=e.calculation;
  const pair=calc?.method==='from_arm_binary_outcomes' ? JSON.stringify([record.source_sha256,calc.intervention.row_id,calc.reference.row_id,
    e.population_id,e.endpoint,calc.outcome_context]) : null;
  const binary=e.measure==='HR'?null:binaryScenario(e,record);
  // A survival HR determines the event target directly. Previous follow-up
  // and event probabilities supply no inputs to that calculation.
  const scenarios=e.measure==='HR' ? [] : binary ? [binary] : graphScenarios(e,record,comps);
  let n=positive(e.analysis_n)&&!flagged(e,['analysis_n'])?e.analysis_n:null;
  if (!n && result.scoped_sample_size?.status==='available' && positive(result.scoped_sample_size.n)) n=result.scoped_sample_size.n;
  if (!n && positive(binary?.paired_n)) n=binary.paired_n;
  if (!n) n=same(comps.map(c=>c.analysis?.sample_size?.n).filter(positive)) || null;
  const filter_binding={pmid:result.pmid,result_id:result.result_id,population_id:result.population_id,
    source_input_sha256:result.source_input_sha256,review_binding_sha256:result.review_binding_sha256,
    quantitative_record:{population_id:e.population_id}};
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
  return {n,scenarios,filter_binding,binary_pair:pair,pmid:record.pmid, stage:record.stage, result_id:e.id, source_sha256:record.source_sha256,
    population:result.population?.label||'', endpoint:e.endpoint,endpoint_detail:/^AE/.test(e.endpoint)?clean(e.endpoint_definition):'',
    measure:e.measure,estimate:ci.estimate,lower:ci.ci_lower,upper:ci.ci_upper,
    original_level:ci.ci_converted?ci.original_ci.ci_level:null, cutoff:clean(e.cutoff), model:clean(e.model),
    reference, treatment};
}

// A paper may describe several trials. Prefer the trial bound to this particular
// comparison; an internal cohort tracking label is not a published trial name.
function effectTrialIdentities(graph) {
  const identities = new Map();
  for (const comparison of graph?.comparisons || []) {
    if (!comparison.linkage || comparison.linkage === 'internal_original_cohort') continue;
    const name = clean(comparison.study_name);
    const identity = {
      trial:/^NCT\d{8}$/i.test(name) ? '' : name,
      nct:(comparison.nct_ids || []).join('; ')
    };
    if (!identity.trial && !identity.nct) continue;
    for (const binding of comparison.analysis?.filter_bindings || []) {
      if (!binding.quantitative_record) continue;
      const key = [comparison.pmid,binding.source_input_sha256,binding.quantitative_record.id].join('|');
      if (!identities.has(key)) identities.set(key, identity);
      else if (JSON.stringify(identities.get(key)) !== JSON.stringify(identity)) identities.set(key, null);
    }
  }
  return identities;
}

function studyArmLabels(comparison) {
  const comparator = charts.comparatorPresentation(comparison);
  const intervention = charts.interventionPresentation(comparison);
  const reference = charts.conciseTreatmentLabel(comparator.label,comparator.definition);
  const treatment = charts.conciseTreatmentLabel(intervention.label,intervention.definition);
  // Keep the distinguishing dose or schedule when both normalized names coincide.
  if (!reference || !treatment || reference === treatment) return {};
  return {comparator_label:reference, intervention_label:treatment, add_on:intervention.is_add_on === true};
}

function build(extraction, graph) {
  const raw=new Map(extraction.articles.map(article=>[article.pmid,article.records]));
  const rows=[], graphIndex=graphEffects(graph);
  const trialByEffect=effectTrialIdentities(graph);
  for (const study of extraction.clinical_evidence?.articles || []) {
    const sources=raw.get(study.pmid);
    if (!study.current_main_eligible || sources?.at(-1)?.record.decision.status !== 'retain') continue;
    const context=Scope.contextFor(study), comparisons=new Map(study.comparisons.map(c=>[c.comparison_id,c]));
    const records=new Map(sources.map(s=>[s.record.source_sha256,effectiveRecord(s)]));
    const links=sources.find(s=>s.stage==='R3')?.record.r2_links?.filter(l=>l.section==='effects')||[];
    const binaryLinks=sources.find(s=>s.stage==='R3')?.record.r2_links?.filter(l=>l.section==='binary' && ['same','supplement'].includes(l.relation))||[];
    function linked(early,later){
      if(links.some(l=>['same','supplement'].includes(l.relation)&&l.r2_id===early.result_id&&l.r3_id===later.result_id))return true;
      // A calculated ratio has no original effect ID in the R2–R3 ledger.
      // Require independent, ordered links for BOTH original binary arm rows.
      if(!early.binary_pair||!later.binary_pair)return false;
      const a=early.scenarios[0]?.source_ids,b=later.scenarios[0]?.source_ids;
      return a?.length===2&&b?.length===2&&a.every((id,i)=>binaryLinks.some(l=>l.r2_id===id&&l.r3_id===b[i]));
    }
    const blocked=new Set(links.filter(l=>l.relation==='conflict').flatMap(l=>[sourceKey('R2',l.r2_id),sourceKey('R3',l.r3_id)]));
    const fullEffects=new Map((sources.find(s=>s.stage==='R3')?.record.effects||[]).map(e=>[e.id,e]));
    const evaluated=[];
    for (const result of study.quantitative_results) {
      const record=records.get(result.source_input_sha256),e=result.quantitative_record;
      const preference=result.source_preference?.status;
      if (!record || !e || preference==='superseded_abstract' ||
          (preference!=='main_text' && blocked.has(sourceKey(record.stage,e.id)))) continue;
      if(record.stage==='R2' && links.some(link=>{
        if(link.r2_id!==e.id || link.relation!=='same')return false;
        const later=fullEffects.get(link.r3_id);
        // A complete newer estimate supersedes a differing R2 tuple. With
        // identical tuples, let R2 supply usable precision/count information.
        return later && [later.estimate,later.ci_lower,later.ci_upper].every(Number.isFinite) &&
          ['measure','endpoint','estimate','ci_lower','ci_upper','ci_level'].some(key=>later[key]!==e[key]);
      }))continue;
      const item=screenRow(result,record,comparisons.get(result.comparison_id),context,graphIndex);
      if(item)evaluated.push({...item, ...studyArmLabels(comparisons.get(result.comparison_id)),
        ...(e.calculation ? {calculated:true} : {})});
    }
    // A PMID may contribute several different analyses. Repeated source stages
    // for one displayed analysis produce one row, with the R3 record preferred.
    if (!evaluated.length) continue;
    const studyView={...study, quantitative_only:true, details:{...study.details, quantitative_extraction:sources}};
    const ids=charts.studyTrialIdentifiers(studyView);
    const nontrial=charts.studyDesignInfo(studyView).is_non_trial, abstractOnly=charts.abstractOnly(studyView);
    // A verified R2–R3 link takes precedence over free-text differences in
    // labels, model descriptions and missing abstract cutoffs. Separately
    // estimated effects in the same study retain their own rows.
    const superseded=new Set();
    for (const early of evaluated.filter(item=>item.stage==='R2')) {
      const matched=evaluated.filter(later=>later.stage==='R3' &&
        linked(early,later) &&
        ['endpoint','measure','estimate','lower','upper'].every(k=>early[k]===later[k]) &&
        linkedCutoffs(early,later) && (!early.n||!later.n||early.n===later.n));
      if (matched.length!==1) continue;
      const later=matched[0];
      if (!later.n) later.n=early.n;
      if (!later.scenarios.length) later.scenarios=early.scenarios;
      superseded.add(early);
    }
    const unique=new Map();
    const rrPairs=new Set(evaluated.filter(row=>row.binary_pair&&row.measure==='RR').map(row=>row.binary_pair));
    for(const item of evaluated.sort((a,b)=>a.stage.localeCompare(b.stage))){
      if(superseded.has(item)||item.measure==='OR'&&rrPairs.has(item.binary_pair))continue;
      const key=[item.reference,item.treatment,item.population,item.cutoff,item.model,item.endpoint,item.endpoint_detail,item.measure,item.estimate,item.lower,item.upper,JSON.stringify(item.scenarios.map(s=>[s.kind,s.probability,s.reference_probability,s.target_probability,s.time_months]))].join('|');
      const trial=trialByEffect.get([item.pmid,item.source_sha256,item.result_id].join('|'));
      const {binary_pair,...published}=item;
      unique.set(key,{...published,title:study.title,year:study.year,author:study.first_author_surname||'',
        trial:trial ? trial.trial : clean(ids.trial_label), nct:trial ? trial.nct : clean(ids.nct_label),
        nontrial, abstract_only:abstractOnly});
    }
    rows.push(...unique.values());
  }
  rows.sort((a,b)=>(b.year||0)-(a.year||0)||a.title.localeCompare(b.title)||a.endpoint.localeCompare(b.endpoint));
  return {schema_version:2, source_as_of:extraction.as_of, rows};
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
  return {rows:payload.rows.length, default_rows:matchingRows(payload,0.8).length};
}
module.exports={build,publish,graphScenarios,binaryScenario,screenRow};
if(require.main===module)console.log(JSON.stringify(publish(path.resolve(process.argv[2]||path.join(__dirname,'../..')))));
