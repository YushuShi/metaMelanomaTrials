/* Randomized within-trial evidence for exact treatment-regimen networks. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./treatment_map_analysis.js') : root.TreatmentMapAnalysis,
    node ? require('./treatment_map_effects.js') : root.TreatmentMapEffects,
    node ? require('./treatment_network_model.js') : root.TreatmentNetworkModel,
    node ? require('./treatment_network_authors.js') : root.TreatmentNetworkAuthors);
  if (node) module.exports = api;
  else root.TreatmentNetworkEvidence = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function (Analysis, Effects, Model, Authors) {
  'use strict';
  const distinct = values => [...new Set(values)];
  const pair = (a, b) => JSON.stringify([a, b].sort());
  const detail = value => value != null && !/^(?:na|n\/a|unknown|unspecified|not reported)$/i.test(String(value).trim()) ? String(value).trim() : '';
  const numeric = value => (typeof value === 'number' || typeof value === 'string' && value.trim()) && Number.isFinite(Number(value)) ? Number(value) : null;
  function append(map, key, item) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }

  const control = 'control:background';
  const neutral = /^(?:soc|bsc|active standard care|background care|double[ -]placebo|(?:matching |matched )?placebo(?:s)?|observation(?: only)?|watchful waiting|(?:best )?supportive care|(?:background |standard )?(?:standard of care|standard care)|standard of care|usual care|no (?:active )?treatment|no adjuvant (?:therapy|treatment))$/i;
  const isNeutral = label => !!label && label.split(/\s*(?:\+|\/|\band\b|\bor\b)\s*/i).every(part => neutral.test(part.trim().replace(/[-‐‑]/g, ' ')));
  function registry(nodes) {
    const labels = new Map([[control, 'Placebo / observation / supportive or standard care']]);
    const aliases = new Map(), nodeRegimens = new Map();
    for (const n of nodes || []) {
      const id = isNeutral(n.label) ? control : n.id;
      labels.set(id, id === control ? labels.get(control) : n.label);
      aliases.set(n.id, id);
    }
    function regimenId(id) {
      if (!id) return null;
      if (aliases.has(id)) return aliases.get(id);
      if (id.startsWith('control:')) {
        let label;
        try { label = decodeURIComponent(id.slice(8)); } catch (_) { return null; }
        if (isNeutral(label) || id === control) return control;
      }
      return labels.has(id) ? id : null;
    }
    function resolve(arm) {
      if (!arm || arm.network_regimen_unresolved) return null;
      const mapId = Effects.armId(arm);
      let id = arm.network_regimen_id;
      if (!id) {
        if (arm.node_id) id = regimenId(arm.node_id) || arm.node_id;
        else if (isNeutral(arm.label)) id = control;
        else return null; // A regimen with unidentified active components cannot be a shared control.
      }
      if (!arm.network_regimen_id && !arm.node_id && isNeutral(arm.label)) id = control;
      if (!labels.has(id)) labels.set(id, arm.network_regimen_label || arm.label || id);
      if (mapId) {
        if (!nodeRegimens.has(mapId)) nodeRegimens.set(mapId, new Set());
        nodeRegimens.get(mapId).add(id);
      }
      return id;
    }
    return { labels, resolve, regimenId, regimensForNode(id) {
      return [...(nodeRegimens.get(id) || (regimenId(id) ? [regimenId(id)] : []))];
    } };
  }

  // The map endpoint key already includes binary assessment time, response criteria and most
  // safety definitions. Retain additional clinically relevant distinctions for reported contrasts.
  function displayTimeLabel(label) {
    return String(label).replace(/\b(\d+\.\d{3,})(?=\s+(?:days?|weeks?|months?|years?)\b)/gi,number=>{
      const value=Number(number);
      return String(value<.01?Number(value.toPrecision(2)):Number(value.toFixed(2)));
    });
  }
  function readableTimeOptions(options) {
    const seen=new Map();
    for(const option of options){
      const label=displayTimeLabel(option.label);
      if(!seen.has(label))seen.set(label,new Set());
      seen.get(label).add(option.label);
    }
    return options.map(option=>{
      const label=displayTimeLabel(option.label);
      return seen.get(label).size===1?{...option,label}:option;
    });
  }

  function targetVariant(record) {
    const ctx = record.calculation?.outcome_context || {};
    const definition = [record.outcome_definition, ctx.definition].map(detail).join(' ').toLowerCase();
    const pieces = [];
    if (record.measure !== 'HR') {
      const at = detail(record.timepoint || record.assessment_time || ctx.assessment_time);
      const unit = detail(record.time_unit || ctx.time_unit);
      const timed = definition.match(/\b(?:at|by|within|through)\s+(?:the\s+)?(\d+(?:\.\d+)?)\s*[- ]?(days?|weeks?|months?|years?)\b/) ||
        definition.match(/\b(\d+(?:\.\d+)?)[ -](day|week|month|year)\s+(?:response|risk|rate)/);
      if (at) pieces.push((at + ' ' + unit).trim().toLowerCase());
      else if (timed) pieces.push(timed[1] + ' ' + timed[2].replace(/s$/, '') + (Number(timed[1]) === 1 ? '' : 's'));
      if (/^(?:AE|treatment_related_death)/.test(record.outcome)) {
        const attribution = detail(ctx.safety_attribution).replace(/_/g, ' ') ||
          (/(?:treatment|drug)[ -]related/.test(definition) ? 'treatment related' : /treatment[ -]emergent/.test(definition) ? 'treatment emergent' : /all[ -]cause/.test(definition) ? 'all causes' : '');
        if (attribution) pieces.push(attribution);
      }
    }
    // Overall survival HRs may be conditional on a landmark or a restricted interval;
    // normal trial cutoffs and length of follow-up are not landmark endpoints.
    const landmark = definition.match(/\b(?:landmark(?:ed)?\s+(?:at\s+)?|from (?:the )?(?:start of )?(?:month|week|year)\s+)(\d+(?:\.\d+)?)(?:[ -]*(days?|weeks?|months?|years?))?/);
    if (landmark) pieces.push(landmark[0]);
    return pieces.length ? distinct(pieces).join(' · ') : 'overall';
  }

  function reportedLogSE(record) {
    const p = record.analysis?.precision || {};
    const direct = numeric(p.log_standard_error ?? record.log_standard_error);
    if (direct > 0) return direct;
    const se = numeric(p.reported_standard_error);
    return se > 0 && /^(?:log|log[_ -](?:ratio|hr|rr|or)|ln)$/i.test(detail(p.scale || p.standard_error_scale)) ? se : null;
  }
  function usablePrecision(record) {
    if(record.network_precision_unavailable)return null;
    const effect = Effects.directedEffect(record, Effects.armId(record.comparator), Effects.armId(record.intervention));
    return effect.precision_se || reportedLogSE(record);
  }
  function withPrecision(record) {
    const se = reportedLogSE(record);
    if (!se || !Number.isFinite(Math.log(Number(record.estimate)))) {
      // A profile-likelihood or exact interval alone is not a model-coefficient SE.
      const method=[record.ci_method,record.interval_method,record.confidence_interval_method,record.ci?.method].filter(Boolean).join(' ');
      return /exact|profile|bootstrap|credible|wilson|clopper|percentile|likelihood[- ]ratio/i.test(method)?
        {...record,ci_lower:null,ci_upper:null,network_precision_unavailable:true}:record;
    }
    // Supply a Wald interval only on a private working record so the common cohort selector
    // can rank a reported log standard error. Keep the original report in the evidence.
    const width = 1.959963984540054 * se;
    return {...record, ci_lower: Number(record.estimate) * Math.exp(-width), ci_upper: Number(record.estimate) * Math.exp(width), ci_level: 95};
  }
  function eligibility(record, endpoint, advanced, setting, observational=false) {
    const a = record.analysis || {};
    return (observational ? a.design==='observational' : Analysis.matchesScope(record, 'randomized')) && Effects.comparisonMatchesEndpoint(record, endpoint) &&
      (!setting || setting === 'all' || a.setting === setting) && Analysis.filterMatch(record, advanced).matched &&
      !record.source_conflict && !a.metadata_conflicts?.length && a.compatibility?.eligible === true &&
      !Analysis.incompatibleEffectQuantity(record) && (numeric(record.estimate) > 0 ||
        numeric(record.estimate) === 0 && ['RR','OR'].includes(record.measure));
  }
  function withinObservationalCohort(record) {
    const a=record.analysis || {};
    if(!a.independence_verified || !a.independent_id || record.nct_ids?.length>1 ||
        a.within_observational_cohort===false || a.cross_trial===true) return false;
    const description=[record.title, record.population, record.model, a.design_description, a.linkage,record.linkage].map(detail).join(' ').toLowerCase().replace(/[_–‐]/g,' ');
    if(/cross[ -]trial|externally controlled|external control|external cohort|matching[ -]adjusted|indirect comparison|network meta|pooled analysis|hybrid (?:cohort|trial)|(?:separate|different|across|pooled from) (?:clinical )?trials/.test(description))return false;
    // A propensity score, registration or synthetic single-report identity does not itself
    // establish that both groups came from one patient cohort. Require affirmative design
    // evidence where the source has not already certified this exact comparison.
    return a.within_observational_cohort===true ||
      /retrospective (?:cohort|study|analysis|review)|prospective (?:cohort|registry)|observational (?:study|cohort)|registry[ -]based|registry of|real[ -]world (?:cohort|study|use)|single[ -]cent(?:er|re) (?:series|experience|study)|multicent(?:er|re) retrospective/.test(description);
  }
  function armData(record, side) {
    const input = record.calculation?.[side];
    if (!input || record.calculation.method !== 'from_arm_binary_outcomes') return null;
    const count = numeric(input.numerator), n = numeric(input.denominator), rate = numeric(input.rate);
    const validCounts = Number.isSafeInteger(n) && n > 0 && Number.isSafeInteger(count) && count >= 0 && count <= n;
    const value = validCounts ? count / n : rate;
    if (value === null || value < 0 || value > 1) return null;
    return {p:value, n:validCounts ? n : null, variance: !validCounts || count === 0 || (record.measure === 'OR' && count === n) ? null :
      record.measure === 'RR' ? 1 / count - 1 / n : 1 / count + 1 / (n - count)};
  }
  function rowData(row, meta) {
    const record = row.comparison;
    return {record, original:meta.original, trialId: row.parent_study_id || row.study_id, treatment:meta.a, comparator:meta.b,
      cohortId:row.cohort.id, variance:row.variance, logEffect:Math.log(Number(record.estimate)),
      sourceCohort:row.cohort, armData:[armData(record, 'intervention'), armData(record, 'reference')]};
  }
  const asLog = (row, treatment) => row.treatment === treatment ? row.logEffect : -row.logEffect;
  function publicationIndex(graph) {
    const publications = new Map();
    for (const member of graph.study_memberships || []) {
      if (member.pmid && !publications.has(String(member.pmid))) publications.set(String(member.pmid), member);
    }
    return publications;
  }
  function planningRates(row) {
    const {record,armData,treatment,comparator} = row, rates=[];
    const binary=['RR','OR'].includes(record.measure);
    for(const [i,role] of ['intervention','comparator'].entries()) {
      const regimen=i===0?treatment:comparator;
      if(binary && armData[i]) {
        rates.push({regimen,probability:armData[i].p,pmid:record.pmid});
        continue;
      }
      for(const a of record.analysis?.planning_assumptions || []) {
        if(a.arm_role!==role || a.outcome!==record.outcome || !Number.isFinite(a.probability))continue;
        if(binary) {
          if(a.kind!=='binary_probability')continue;
          // A published contrast can share a broad endpoint code with unrelated
          // toxicity types, response criteria or assessment times in the same report.
          const rateRecord={measure:record.measure,outcome:record.outcome,outcome_definition:a.label,
            assessment_time:a.time,time_unit:a.time_unit,calculation:{outcome_context:{
              response_criteria:a.response_criteria,safety_attribution:a.safety_attribution}}};
          if(targetVariant(rateRecord)!==targetVariant(record))continue;
          if(/^AE/.test(record.outcome) && detail(a.label).toLowerCase()!==detail(record.outcome_definition).toLowerCase())continue;
        } else if(a.kind!=='survival_probability' || !(a.time_months>0))continue;
        rates.push({regimen,probability:binary?a.probability:1-a.probability,
          timeMonths:a.time_months ?? null,pmid:a.source_refs?.[0]?.pmid || record.pmid});
      }
    }
    return rates;
  }
  function sourceStudy(row, publications) {
    const {record,original,treatment,comparator,sourceCohort} = row;
    const pmid = detail(record.pmid), pub = publications.get(pmid) || {};
    const name = detail(record.study_name), registeredId = String(row.trialId).match(/^nct:(NCT\d+)$/i)?.[1];
    const armLabel = arm => detail(arm.network_regimen_label) || detail(arm.label);
    // The selector can sort regimens in either direction. The table describes exactly
    // this record's intervention versus comparator, preserving asymmetric source limits.
    let interval = Effects.directedEffect(record,comparator,treatment);
    let ciNote = interval.conversion_note || null;
    if (reportedLogSE(record)) {
      const source = Effects.directedEffect(original,Effects.armId(original.comparator),Effects.armId(original.intervention));
      if (source.ci_valid) { interval=source; ciNote=source.conversion_note || null; }
      else ciNote='95% CI calculated from the reported log-scale standard error.';
    }
    const counts=row.armData;
    const armTotal=counts.every(arm=>arm?.n>0) ? counts[0].n+counts[1].n : null;
    const cohortGroup=detail(sourceCohort.short_label || sourceCohort.label);
    const group=sourceCohort.is_subgroup ? cohortGroup || detail(record.population) : detail(record.population) || cohortGroup;
    return {recordId:record.id, title:detail(record.title) || detail(pub.title) || null, pmid:pmid || null,
      author:detail(Authors?.[pmid]) || detail(record.first_author_surname) || detail(pub.first_author_surname) || null,
      year:record.year || record.analysis?.publication_year || pub.year || null,
      trialName:name && !/^(?:NCT\d+|(?:cohort reported in )?PMID\s+\d+|(?:nct|cohort|report):.*)$/i.test(name) ? name : null,
      nct:registeredId || (record.nct_ids?.length===1 ? record.nct_ids[0] : null), group:group || null,
      intervention:armLabel(record.intervention),comparator:armLabel(record.comparator),
      sampleSize:Analysis.supportedSampleSize(record).n ?? armTotal, measure:record.measure,
      estimate:interval.estimate,ciLower:interval.ci_lower,ciUpper:interval.ci_upper,ciNote,
      sourcePmids:pmid?[pmid]:[],sourceRecordIds:distinct([record.id,...(record.merged_record_ids || [])])};
  }
  // A verified common model or complete binary arm counts can also support a
  // marginal contrast not printed in the publication. Project a signed path from
  // the accepted trial block, retaining the shared-arm sampling covariance.
  function withinTrialContrast(block,a,b) {
    const marginal=Model.projectTrial(block,[[a,b]]);
    if(!marginal)return null;
    const log=marginal.contrasts[0].logEffect,halfWidth=1.959963984540054*Math.sqrt(marginal.covariance[0][0]);
    return {estimate:Math.exp(log),ciLower:Math.exp(log-halfWidth),ciUpper:Math.exp(log+halfWidth)};
  }
  function supportingRows(rows,block,a,b,binary) {
    const hasArm=(row,id)=>row.treatment===id || row.comparator===id;
    if(binary) {
      const first=rows.filter(row=>hasArm(row,a)),second=rows.filter(row=>hasArm(row,b));
      for(const left of first){
        const right=second.find(row=>left.record.pmid && left.record.pmid===row.record.pmid);
        if(right)return [left,right];
      }
      return [first[0],second[0]];
    }
    // The published covariance identifies the contrasts in the fitted basis.
    // Cite only rows on the path forming this linear combination.
    const weights=Model.coefficients(block.contrasts,a,b);
    const available=new Map(rows.map(row=>[pair(row.treatment,row.comparator),row]));
    return block.contrasts.flatMap(({treatment,comparator},i)=>weights?.[i] ? [available.get(pair(treatment,comparator))] : []).filter(Boolean);
  }
  function withinTrialEvidence(block,rows,publications,catalog) {
    const edges=rows.map(row=>({treatment:row.treatment,comparator:row.comparator,trialId:block.trialId,
      planningRates:planningRates(row),studyRow:sourceStudy(row,publications)}));
    if(rows.length<2)return edges;
    const ids=distinct(rows.flatMap(row=>[row.treatment,row.comparator])).sort();
    const present=new Set(edges.map(e=>pair(e.treatment,e.comparator)));
    if(present.size===ids.length*(ids.length-1)/2)return edges;
    const binary=['RR','OR'].includes(rows[0].record.measure) && consistentArms(rows);
    const joint=jointModel(rows[0]);
    if(!(binary || joint && rows.every(row=>jointModel(row)===joint)))return edges;
    const originalEdges=new Map(edges.map(edge=>[edge.studyRow.recordId,edge]));
    for(const [i,a] of ids.entries())for(const b of ids.slice(i+1)){
      if(present.has(pair(a,b)))continue;
      const effect=withinTrialContrast(block,a,b);
      if(!effect)continue;
      const support=supportingRows(rows,block,a,b,binary).map(row=>originalEdges.get(row.record.id));
      const sources=support.map(edge=>edge.studyRow);
      if(!sources.length)continue;
      const sourcePmids=distinct(sources.flatMap(s=>s.sourcePmids)).sort();
      const sourceRecordIds=distinct(sources.flatMap(s=>s.sourceRecordIds)).sort();
      const sampleSize=binary && binary.get(a)?.n && binary.get(b)?.n ? binary.get(a).n+binary.get(b).n : null;
      const source=sources[0];
      const publication=sourcePmids.length===1?{}:{pmid:null,title:null,year:null,author:null,
        sourcePublications:sourcePmids.map(pmid=>{
          const {title,author,year}=sources.find(s=>s.pmid===pmid);
          return {pmid,title,author,year};
        })};
      const rates=support.flatMap(edge=>edge.planningRates).filter(rate=>rate.regimen===a || rate.regimen===b);
      edges.push({treatment:a,comparator:b,trialId:block.trialId,planningRates:rates,studyRow:{...source,...publication,...effect,
        recordId:null,sourcePmids,sourceRecordIds,intervention:catalog.labels.get(a),comparator:catalog.labels.get(b),
        sampleSize,reconstructed:true,ciNote:binary?'Calculated from randomized arm risks and their sampling covariance.':'Calculated from the trial’s joint model and sampling covariance.'}});
    }
    return edges;
  }
  function sourceWave(row) {
    const r = row.record, a = r.analysis;
    // Trial populations and analysis cutoffs must agree before deriving cross-arm uncertainty.
    // A common publication is also required when an actual analysis cutoff is unspecified.
    return JSON.stringify([row.cohortId, detail(a.analysis_cutoff || r.cutoff) || 'pmid:' + r.pmid,
      a.model_family || '', a.adjusted || r.adjusted || '', a.assessment || '']);
  }
  function consistentArms(rows) {
    const arms = new Map();
    for (const row of rows) {
      for (const [i,id] of [row.treatment,row.comparator].entries()) {
        const v = row.armData[i];
        if (!v) return null;
        const prev = arms.get(id);
        if (prev && (Math.abs(prev.p - v.p) > 1e-10 || prev.variance !== null && v.variance !== null && Math.abs(prev.variance - v.variance) > 1e-10)) return null;
        if (!prev || v.variance !== null) arms.set(id,v);
      }
    }
    return arms;
  }
  function binaryRatio(a, b, measure) {
    return measure === 'RR' ? a / b : (a / (1-a)) / (b / (1-b));
  }
  function markDirect(ledger, a, b, precise, pmids) {
    const key = pair(a,b);
    if (!ledger.has(key)) ledger.set(key, {precise:false, pmids:new Set()});
    const entry = ledger.get(key);
    if (precise) entry.precise = true;
    for (const pmid of pmids) if (pmid) entry.pmids.add(String(pmid));
  }
  function recoverBinary(rows, ledger) {
    const measure = rows[0]?.record.measure;
    if (!['RR','OR'].includes(measure)) return;
    const arms = consistentArms(rows);
    if (!arms) return;
    for (const [a, v] of arms) for (const [b,w] of arms) {
      if (a >= b) continue;
      const effect = binaryRatio(v.p,w.p,measure), reverse=binaryRatio(w.p,v.p,measure);
      if (Number.isFinite(effect) && effect>=0 || Number.isFinite(reverse) && reverse>=0)
        markDirect(ledger, a,b, Number.isFinite(effect) && effect>0 && v.variance !== null && w.variance !== null && v.variance+w.variance>0,
          rows.map(row=>row.record.pmid));
    }
  }
  function jointModel(row) { return detail(row.record.analysis?.joint_model_id || row.record.joint_model_id); }
  function recoverJoint(rows, ledger) {
    // No subtraction between separately fitted Cox regressions. Contrasts explicitly from one
    // joint fitted model in one analysis wave recover a third point even without covariance.
    const groups = new Map();
    for (const row of rows) if (jointModel(row)) append(groups, jointModel(row), row);
    for (const group of groups.values()) {
      const graph = new Map();
      for (const r of group) { append(graph,r.treatment,r.comparator); append(graph,r.comparator,r.treatment); }
      for (const [a] of graph) for (const b of reach(graph,a)) if (a < b) markDirect(ledger,a,b,false,group.map(row=>row.record.pmid));
    }
  }

  function explicitCovariance(trialId, rows, ids) {
    // The source matrix is keyed to the original intervention/comparator orientation;
    // merge duplicate report-stage identifiers through the existing cohort selector.
    for (const item of rows) {
      const source=item.record.analysis?.multiarm_covariance;
      if (!source || !Array.isArray(source.contrast_ids) || !Array.isArray(source.matrix) ||
          !source.source_refs?.length || source.scale !== 'log' || source.matrix.length !== source.contrast_ids.length) continue;
      const usable=rows.map(r=>({r,i:source.contrast_ids.findIndex(id=>id===r.record.id || r.record.merged_record_ids?.includes(id))})).filter(x=>x.i>=0);
      const parent=new Map(ids.map(id=>[id,id]));
      const root=id=>{while(parent.get(id)!==id)id=parent.get(id);return id;};
      const selected=[];
      for(const x of usable){
        const a=root(x.r.treatment),b=root(x.r.comparator);
        if(a!==b){parent.set(a,b);selected.push(x);}
      }
      if(selected.length!==ids.length-1)continue;
      const covariance=selected.map(x=>selected.map(y=>numeric(source.matrix[x.i]?.[y.i])));
      if(covariance.some((line,i)=>line.some((v,j)=>v===null||Math.abs(v-covariance[j][i])>1e-10)||
          !(line[i]>0) || Math.abs(line[i]-selected[i].r.variance)>Math.max(1e-8,0.03*line[i])))continue;
      if(!positiveDefinite(covariance))continue;
      return {trialId, contrasts:selected.map(({r})=>({treatment:r.treatment,comparator:r.comparator,logEffect:r.logEffect})),covariance};
    }
    return null;
  }
  function positiveDefinite(covariance) {
    const L=covariance.map(row=>row.map(()=>0));
    for(let i=0;i<L.length;i++)for(let j=0;j<=i;j++){
      let v=covariance[i][j];for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];
      if(i===j){if(!(v>0))return false;L[i][j]=Math.sqrt(v);}else L[i][j]=v/L[j][j];
    }
    return true;
  }
  function trialBlock(trialId, rows) {
    const ids = distinct(rows.flatMap(row => [row.treatment,row.comparator])).sort();
    if (!rows.length) return null;
    const r = rows[0];
    if (rows.length === 1) return {trialId, contrasts:[{treatment:r.treatment,comparator:r.comparator,logEffect:r.logEffect}], covariance:[[r.variance]]};
    if (new Set(rows.map(sourceWave)).size !== 1) return null;
    const observed = new Map(rows.map(x => [pair(x.treatment,x.comparator),x]));
    if (observed.size !== rows.length) return null;
    const documented=explicitCovariance(trialId,rows,ids);
    if(documented)return documented;
    const arms = consistentArms(rows), measure = r.record.measure;
    if (arms && ['RR','OR'].includes(measure) && [...arms.values()].every(v=>v.variance!==null)) {
      if (!rows.every(x => Math.abs(x.logEffect-Math.log(binaryRatio(arms.get(x.treatment).p,arms.get(x.comparator).p,measure)))<1e-7)) return null;
      const ref=ids[0],v=arms.get(ref), rest=ids.slice(1);
      return {trialId, contrasts:rest.map(id=>({treatment:id,comparator:ref,logEffect:Math.log(binaryRatio(arms.get(id).p,v.p,measure))})),
        covariance:rest.map((id,i)=>rest.map((other,j)=>v.variance+(i===j?arms.get(id).variance:0)))};
    }
    // Full within-trial triangle distances give covariance without treating
    // repeated shared controls as independent observations: 2cov(X,Y)=var(X)+var(Y)-var(X-Y).
    // Numerical consistency alone does not establish a covariance relationship between
    // pairwise Cox fits. Use this identity only for contrasts from the same documented
    // joint fit, or a verified common set of multi-arm contrasts.
    const joint=jointModel(r), verified=r.record.analysis?.multiarm_contrast_set_id;
    if (!(joint && rows.every(x=>jointModel(x)===joint) ||
        verified && rows.every(x=>x.record.analysis?.multiarm_contrast_set_id===verified && x.record.analysis.multiarm_contrasts_verified===true))) return null;
    if (observed.size !== ids.length*(ids.length-1)/2) return null;
    const ref=ids[0],rest=ids.slice(1), against=id=>observed.get(pair(id,ref));
    for (let i=0;i<rest.length;i++) for (let j=0;j<i;j++) {
      const a=rest[i],b=rest[j],ab=observed.get(pair(a,b));
      const difference=asLog(against(a),a)-asLog(against(b),b)-asLog(ab,a);
      // Allow at most the rounding error implied by the reported ratios, capped at 2.5%.
      const tolerance=[against(a),against(b),ab].reduce((n,x)=>{
        const value=Number(x.record.estimate),digits=(String(value).split('.')[1]||'').length;
        return n+0.5*Math.pow(10,-digits)/value;
      },0);
      if (Math.abs(difference)>Math.min(.025,tolerance)+1e-9) return null;
    }
    const covariance=rest.map((a,i)=>rest.map((b,j)=>i===j?against(a).variance:
      (against(a).variance+against(b).variance-observed.get(pair(a,b)).variance)/2));
    // Positive-definiteness also rules out inconsistent or over-rounded variance triangles.
    if (!positiveDefinite(covariance)) return null;
    return {trialId,contrasts:rest.map(id=>({treatment:id,comparator:ref,logEffect:asLog(against(id),id)})),covariance};
  }
  function reach(graph,start) {
    const visited=new Set(),queue=[start];
    while(queue.length){const id=queue.pop();if(visited.has(id))continue;visited.add(id);for(const next of graph.get(id)||[])if(!visited.has(next))queue.push(next);}
    return visited;
  }

  // When joint uncertainty is missing, a single reported contrast has its own
  // valid marginal variance. Choose it from the network design, blind to the HR,
  // its precision and the user's choice of treatments or comparison direction.
  function singleContrast(rows,components,pairCounts) {
    if (new Set(rows.map(r=>r.cohortId)).size!==1 ||
        new Set(rows.map(r=>pair(r.treatment,r.comparator))).size!==rows.length) return null;
    // A supplied but rejected covariance matrix or conflicting binary inputs
    // require source review before the trial can supply a fallback estimate.
    if (rows.some(r=>r.record.analysis?.multiarm_covariance)) return null;
    const derived=rows.filter(r=>r.record.calculation?.method==='from_arm_binary_outcomes');
    if (derived.length) {
      const arms=consistentArms(derived);
      if (!arms || derived.some(r=>Math.abs(r.logEffect-Math.log(binaryRatio(arms.get(r.treatment).p,arms.get(r.comparator).p,r.record.measure)))>1e-7)) return null;
    }
    const candidates=[];
    for (const row of rows) {
      const a=components.get(row.treatment), b=components.get(row.comparator);
      if (!a && !b) continue;
      const gain=a===b ? 0 : (a?.size || 1)*(b?.size || 1);
      const replication=pairCounts.get(pair(row.treatment,row.comparator))?.size || 0;
      candidates.push({row,gain,replication});
    }
    candidates.sort((a,b)=>b.gain-a.gain || a.replication-b.replication);
    const [best,runnerUp]=candidates;
    if (!best || (runnerUp && best.gain===runnerUp.gain && best.replication===runnerUp.replication)) return null;
    return best.row;
  }

  function networkComponents(adjacency) {
    const components=new Map();
    for (const id of adjacency.keys()) if (!components.has(id)) {
      const members=reach(adjacency,id);
      for (const member of members) components.set(member,members);
    }
    return components;
  }

  function build(model, options={}) {
    const graph=model.graph || model, endpoint=options.endpoint || 'OS:HR', advanced=options.advanced || {};
    const catalog=registry(graph.nodes || model.nodes), points=new Map(), byPair=new Map(), meta=new Map(), variantPool=new Map();
    const observationalPairs=new Map();
    const sources=[...(graph.comparisons || model.comparisons || []),...(graph.network_direct_evidence || [])];
    for (const original of sources) {
      const observational=original.analysis?.design==='observational';
      if (!eligibility(original,endpoint,advanced,options.setting,observational) ||
          observational && !withinObservationalCohort(original)) continue;
      const a=catalog.resolve(original.intervention),b=catalog.resolve(original.comparator);
      if (!a || !b || a===b) continue;
      if(observational) {
        append(observationalPairs,pair(a,b),{...original,intervention:{...original.intervention,node_id:a},comparator:{...original.comparator,node_id:b}});
      } else append(variantPool,targetVariant(original),{original,a,b});
    }
    const targets=readableTimeOptions([...variantPool.keys()].sort((a,b)=>Number(b==='overall')-Number(a==='overall')||a.localeCompare(b))
      .map(id=>({id,label:id==='overall'?'Overall endpoint':id})));
    const target=variantPool.has(options.target)?options.target:targets[0]?.id || 'overall';
    const wavePoints=new Map();
    for(const {original,a,b} of variantPool.get(target)||[]) {
      const record={...withPrecision(original),intervention:{...original.intervention,node_id:a},comparator:{...original.comparator,node_id:b}};
      const precision=Number(record.estimate)>0 && usablePrecision(record);
      markDirect(points,a,b,!!precision,[original.pmid]);
      const trial=original.analysis.independent_id, cohort=Analysis.cohortInfo(original);
      if (trial && original.analysis.independence_verified) {
        const item={record,treatment:a,comparator:b,cohortId:cohort.id,armData:[armData(original,'intervention'),armData(original,'reference')]};
        append(wavePoints,JSON.stringify([trial,sourceWave(item)]),item);
      }
      meta.set(record.id,{a,b,original});
      append(byPair,pair(a,b),record);
    }
    for(const rows of wavePoints.values()) { recoverBinary(rows.filter(r=>r.record.calculation),points); recoverJoint(rows,points); }
    const studies=new Map(), waveAlternatives=new Map(), holdList=[], studyRefs=new Map(), adjacency=new Map(), blocks=[], connections=[];
    const pending=new Map(), pairCounts=new Map(), publications=publicationIndex(graph);
    function include(id,label,rows,block,selectionNote) {
      blocks.push(block);
      connections.push(...withinTrialEvidence(block,rows,publications,catalog));
      for (const row of rows) {
        const a=row.treatment,b=row.comparator,key=pair(a,b);
        append(adjacency,a,b);append(adjacency,b,a);
        if (!pairCounts.has(key)) pairCounts.set(key,new Set());
        pairCounts.get(key).add(id);
      }
      const pmids=distinct(rows.map(r=>String(r.record.pmid || '')).filter(Boolean)).sort();
      const settings=distinct(rows.map(r=>detail(r.record.analysis.setting)).filter(Boolean));
      studyRefs.set(id,{id,label,pmids,settings,...(selectionNote?{selectionNote}:{})});
    }
    for(const [k,records] of byPair) {
      const [numerator,reference]=JSON.parse(k);
      const analysis=Analysis.selectNetworkEvidence(records,{tailId:reference,headId:numerator,endpoint,studyScope:'randomized',advanced});
      for(const row of analysis.tableRows) {
        if (!(row.variance>0) || !row.parent_study_id || !row.comparison.analysis.independence_verified) continue;
        append(waveAlternatives,row.parent_study_id,rowData(row,meta.get(row.id)));
      }
      for(const row of analysis.groups.flatMap(g=>g.selected)) {
        const item=rowData(row,meta.get(row.id));
        if (!item.trialId || !(item.variance>0)) continue;
        append(studies,item.trialId,item);
      }
    }
    for(const [id,selected] of studies) {
      let rows=selected, block=trialBlock(id,rows);
      const label=rows.find(x=>x.record.study_name)?.record.study_name || id;
      const ids=distinct(rows.flatMap(r=>[r.treatment,r.comparator]));
      if (!block && rows.length>1) {
        // Pairwise latest reports can have different cutoffs. Prefer a coherent wave of the
        // same target population and the same full set of trial arms to dropping the trial.
        const cohorts=new Set(rows.map(r=>r.cohortId)), byWave=new Map();
        for(const r of waveAlternatives.get(id)||[]){
          if(cohorts.has(r.cohortId)&&ids.includes(r.treatment)&&ids.includes(r.comparator)) append(byWave,sourceWave(r),r);
        }
        const date=r=>Date.parse(r.record.analysis?.analysis_date || (r.record.analysis?.publication_year || 0)+'-01-01') || 0;
        const waves=[...byWave.values()].sort((a,b)=>Math.max(...b.map(date))-Math.max(...a.map(date)));
        for(const wave of waves) {
          if(new Set(wave.flatMap(x=>[x.treatment,x.comparator])).size!==ids.length)continue;
          const pairs=new Map(), compatible=[];
          for(const x of wave) append(pairs,pair(x.treatment,x.comparator),x.record);
          for(const [key,choices] of pairs) {
            const [a,b]=JSON.parse(key);
            const selection=Analysis.selectNetworkEvidence(choices,{tailId:b,headId:a,endpoint,studyScope:'randomized',advanced});
            for(const chosen of selection.groups.flatMap(g=>g.selected))compatible.push(rowData(chosen,meta.get(chosen.id)));
          }
          if(new Set(compatible.flatMap(x=>[x.treatment,x.comparator])).size!==ids.length)continue;
          const alternative=trialBlock(id,compatible);
          if(alternative){block=alternative;rows=compatible;break;}
        }
      }
      if (!block) {
        pending.set(id,{label,rows,ids});
        continue;
      }
      // A documented common fitted model and full sampling covariance also recover
      // within-trial contrasts between two treatment arms omitted from the report.
      const joint=jointModel(rows[0]);
      if(joint && rows.every(row=>jointModel(row)===joint)) {
        for(const a of ids)for(const b of ids)if(a<b)markDirect(points,a,b,true,rows.map(row=>row.record.pmid));
      }
      include(id,label,rows,block);
    }
    let components=networkComponents(adjacency);
    while (pending.size) {
      // All decisions in a round see the same independent external evidence.
      // A regimen shared by two pending independent trials can anchor a chain
      // even when its network contains no two-arm trial. This singleton is
      // used only to choose contrasts; it contributes no effect or connection.
      const anchors=new Map(components), seen=new Set();
      for (const {ids} of pending.values()) for (const id of ids) {
        if (seen.has(id) && !anchors.has(id)) anchors.set(id,new Set([id]));
        seen.add(id);
      }
      const selected=[];
      for (const [id,{label,rows}] of pending) {
        const row=singleContrast(rows,anchors,pairCounts);
        if (row) selected.push({id,label,row});
      }
      if (!selected.length) break;
      for (const {id,label,row} of selected) {
        const contrast=catalog.labels.get(row.treatment)+' versus '+catalog.labels.get(row.comparator);
        const selectionNote='This trial contributes one randomized contrast ('+contrast+'). Joint uncertainty for its other contrasts was unavailable.';
        include(id,label,[row],trialBlock(id,[row]),selectionNote);
        const trial=pending.get(id);
        const omitted=trial.ids.filter(regimen=>regimen!==row.treatment && regimen!==row.comparator);
        if (omitted.length) holdList.push({ids:omitted,pmids:distinct(trial.rows.map(r=>String(r.record.pmid || '')).filter(Boolean)).sort(),
          reason:label+' used one contrast ('+contrast+'). Its other contrasts share participants and lack a verified joint covariance.'});
        pending.delete(id);
      }
      components=networkComponents(adjacency);
    }
    for (const {label,rows,ids} of pending.values()) {
      holdList.push({ids,pmids:distinct(rows.map(r=>String(r.record.pmid || '')).filter(Boolean)).sort(),
        reason:label+' is a multi-arm trial. No unique eligible contrast was selected, and the covariance required to use its contrasts together was unavailable.'});
    }
    const definition=Effects.endpoints.find(e=>e.key===endpoint.split('|')[0]);
    const endpointLabel=definition ? definition.abbreviation+' '+definition.measure : endpoint;
    function status(raw,firstRaw=null) {
      const id=catalog.regimenId(raw),first=catalog.regimenId(firstRaw);
      const result=(eligible,code,reason)=>({eligible,code,reason});
      if (first && id===first) return result(false,'same','Choose a different comparator.');
      const direct=first && id && points.get(pair(id,first));
      if (direct) {
        const state=direct.precise ? result(false,'direct','Direct comparison available for this outcome.') :
          result(false,'direct_incomplete','Direct estimate available; uncertainty incomplete.');
        return {...state,sourcePmids:[...direct.pmids].sort()};
      }
      if (!id) return result(false,'no_evidence','No usable randomized '+endpointLabel+' comparison involving this regimen.');
      const missing=distinct([id,first].filter(regimen=>regimen && !components.has(regimen))).sort();
      if (missing.length) {
        const names=missing.map(regimen=>catalog.labels.get(regimen) || regimen).join(' or ');
        const holds=holdList.filter(h=>missing.some(regimen=>h.ids.includes(regimen)));
        const reason=['No usable randomized '+endpointLabel+' comparison for '+names+'.', ...distinct(holds.map(h=>h.reason))].join(' ');
        return {...result(false,'no_evidence',reason),sourcePmids:distinct(holds.flatMap(h=>h.pmids)).sort()};
      }
      if (first && !components.get(id).has(first)) return result(false,'disconnected','No connecting evidence for this outcome.');
      if (!first && ![...components.get(id)].some(other=>other!==id&&!points.has(pair(id,other)))) return result(false,'no_partner','Usable randomized evidence exists, but every connected partner has a direct comparison.');
      return result(true,'eligible','');
    }
    function observationalFor(first,second) {
      const records=(observationalPairs.get(pair(first,second))||[]).filter(r=>targetVariant(r)===target);
      if(!records.length)return [];
      const result=Analysis.selectNetworkEvidence(records,{tailId:second,headId:first,endpoint,studyScope:'all',advanced});
      return result.tableRows.filter(r=>r.population_selected).map(r=>({
        id:r.study_id||r.id, label:r.study_name||'PMID '+r.pmid, study_name:r.study_name, pmid:r.pmid,year:r.year,
        measure:r.measure,estimate:r.estimate,ci_level:95,ci_lower:r.ci_lower,ci_upper:r.ci_upper,ci_95_unavailable:!r.ci_lower||!r.ci_upper
      }));
    }
    function forPair(firstRaw,secondRaw) {
      const first=catalog.regimenId(firstRaw),second=catalog.regimenId(secondRaw);
      const outcome=!first||!second?{eligible:false,code:'unknown_regimen',reason:'Select two identified treatment regimens.'}:status(second,first), base={...outcome,blocks:[],trials:[],comparisons:[],sharedComparators:[],regimens:[],settings:[],holds:[],observational:[]};
      if(!first||!second||!outcome.eligible) return {...base,eligible:false};
      const component=components.get(first), included=blocks.filter(b=>component.has(b.contrasts[0].treatment));
      const trials=included.map(b=>studyRefs.get(b.trialId));
      return {...base,blocks:included,trials,observational:observationalFor(first,second),comparisons:connections.filter(c=>component.has(c.treatment)),
        sharedComparators:distinct((adjacency.get(first)||[]).filter(x=>adjacency.get(second)?.includes(x))).sort(),
        regimens:[...component].sort(), settings:distinct(trials.flatMap(t=>t.settings)).sort(),
        holds:holdList.filter(h=>h.ids.some(id=>component.has(id))).map(h=>h.reason)};
    }
    const componentList=distinct([...components.values()]).map(ids=>({regimens:[...ids].sort(),blocks:blocks.filter(b=>ids.has(b.contrasts[0].treatment))}));
    return {endpoint,target,targets,components:componentList,targetLabel:targets.find(o=>o.id===target)?.label || 'Overall endpoint',
      labels:catalog.labels,regimenId:catalog.regimenId,regimensForNode:catalog.regimensForNode,status,forPair};
  }
  function regimenLabels(graph) {
    const nodes=graph.nodes || [],catalog=registry(nodes);
    const used=new Set(nodes.filter(node=>node.count_summary?.publication_count>0).map(node=>catalog.regimenId(node.id)));
    for(const record of [...(graph.comparisons || []),...(graph.network_direct_evidence || [])]) {
      used.add(catalog.resolve(record.intervention));
      used.add(catalog.resolve(record.comparator));
    }
    return new Map([...catalog.labels].filter(([id])=>used.has(id)));
  }
  return Object.freeze({build,regimenLabels,isBackgroundControl:isNeutral,displayTimeLabel,readableTimeOptions});
});
