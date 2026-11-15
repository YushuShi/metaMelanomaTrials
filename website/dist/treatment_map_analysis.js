/* Exact-regimen evidence selection and ratio meta-analysis. No source records are modified. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./treatment_map_effects.js'),require('./statistical_math.js'),require('./confidence_intervals.js'));
  else root.TreatmentMapAnalysis = factory(root.TreatmentMapEffects,root.StatisticalMath,root.ConfidenceIntervals);
})(typeof globalThis === 'undefined' ? this : globalThis, function (Effects,Stats,ConfidenceIntervals) {
  'use strict';
  const EPS = 2.220446049250313e-16;
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const positive = (value) => ['number', 'string'].includes(typeof value) && text(value) && finite(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const sum = (values) => values.reduce((a, b) => a + b, 0);
  const unique = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
  const stable = (value) => value && typeof value === 'object' ? Array.isArray(value) ? '[' + value.map(stable).join(',') + ']' : '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}' : JSON.stringify(value);
  const distinctObjects = (values) => [...new Map(values.map((value) => [stable(value), value])).values()];
  const text = (value) => String(value ?? '').trim();
  const missing = (value) => !text(value) || /^(?:unknown|unspecified|not reported|na|n\/a)$/i.test(text(value));

  const {logGamma,gammaQ,normalSF,normalCDF,normalQuantile}=Stats;
  function betaFraction(a, b, x) {
    const tiny = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < tiny) d = tiny; d = 1 / d; let h = d;
    for (let m = 1; m <= 10000; m += 1) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; const delta = d * c; h *= delta;
      if (Math.abs(delta - 1) < 2e-15) break;
    }
    return h;
  }
  function betaRegularized(x, a, b) {
    if (!(a > 0 && b > 0 && x >= 0 && x <= 1)) return NaN;
    if (x === 0 || x === 1) return x;
    const scale = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
    const result = x < (a + 1) / (a + b + 2) ? scale * betaFraction(a, b, x) / a : 1 - scale * betaFraction(b, a, 1 - x) / b;
    return Math.max(0, Math.min(1, result));
  }
  function studentTPvalue(t, df) { return df > 0 ? betaRegularized(df / (df + t * t), df / 2, 0.5) : null; }
  const confidenceLevel=ConfidenceIntervals.confidenceLevel;
  function matchesScope(comparison, scope) {
    const design = comparison?.analysis?.design;
    if (!scope || scope === 'all') return true;
    if (scope === 'randomized') return design === 'randomized_trial';
    if (scope === 'trials') return ['randomized_trial', 'nonrandomized_trial'].includes(design);
    return false;
  }
  function semanticKey(record) {
    const compatibility = record.analysis?.compatibility, key = compatibility?.key;
    if (!key) return null;
    // Design is a user-controlled inclusion scope, not a clinical compatibility dimension.
    // The metadata producer's versioned array puts design first; unknown key formats stay intact.
    try { const dimensions = JSON.parse(key); if (Array.isArray(dimensions) && dimensions.length === 10 && ['randomized_trial', 'nonrandomized_trial', 'observational', 'unknown'].includes(dimensions[0])) return JSON.stringify(dimensions.slice(1)); } catch (_) { /* Non-array application/test keys are already semantic. */ }
    return key;
  }
  function decimalPlaces(value) {
    const parts = String(value).toLowerCase().split('e'), fraction = (parts[0].split('.')[1] || '').length;
    return Math.max(0, fraction - Number(parts[1] || 0));
  }
  function roundedEqual(a, b) {
    a = positive(a); b = positive(b); if (a === null || b === null) return a === b;
    if (Math.abs(a - b) <= 16 * EPS * Math.max(a, b)) return true;
    const places = Math.min(decimalPlaces(a), decimalPlaces(b)), unit = Math.pow(10, -places);
    return Math.abs(a - b) <= unit / 2 + 16 * EPS * Math.max(a, b);
  }
  function sameTuple(a, b) {
    if (!roundedEqual(a.estimate, b.estimate)) return false;
    const ca = confidenceLevel(a.ci_level), cb = confidenceLevel(b.ci_level);
    if (ca !== cb) return false;
    // A missing interval may be filled by the same reported estimate; partial intervals do not supply precision.
    const aa = [a.ci_lower, a.ci_upper], bb = [b.ci_lower, b.ci_upper];
    return aa.every((v, i) => positive(v) === null || positive(bb[i]) === null || roundedEqual(v, bb[i]));
  }
  function sameReportedTuple(a, b) {
    if (Effects.armId(a.intervention) === Effects.armId(b.intervention)) return sameTuple(a, b);
    const invert = (record) => ({ estimate: positive(record.estimate) === null ? null : 1 / Number(record.estimate),
      ci_lower: positive(record.ci_upper) === null ? null : 1 / Number(record.ci_upper), ci_upper: positive(record.ci_lower) === null ? null : 1 / Number(record.ci_lower), ci_level: record.ci_level });
    return sameTuple(a, invert(b)) && sameTuple(b, invert(a));
  }
  function fullInterval(record) {
    const n = positive(record.estimate), l = positive(record.ci_lower), u = positive(record.ci_upper);
    return n !== null && l !== null && u !== null && l < u && l <= n && n <= u && confidenceLevel(record.ci_level) !== null;
  }
  const numericalPrecision = (record) => sum([record.estimate, record.ci_lower, record.ci_upper].filter((v) => positive(v) !== null).map(decimalPlaces));
  const completeness = (record) => Number(record?.analysis?.source_completeness || 0);
  function representativeOrder(a, b) {
    return Number(fullInterval(b)) - Number(fullInterval(a)) || numericalPrecision(b) - numericalPrecision(a) || completeness(b) - completeness(a) || text(a.id).localeCompare(text(b.id));
  }
  function cutoff(record) {
    const value = record.analysis?.analysis_date || record.cutoff;
    return missing(value) ? '' : text(value).toLowerCase();
  }
  function consolidationScope(record) {
    const a = record.analysis || {}, c = a.compatibility;
    return [record.pmid || 'unidentified:' + record.id, [Effects.armId(record.intervention), Effects.armId(record.comparator)].sort(), Effects.endpointKey(record) || record.outcome + ':' + record.measure,
      semanticKey(record) ?? stable([record.population, record.model, record.adjusted, record.outcome_definition]), a.independence_verified ? a.independent_id : null, a.cohort?.id || null];
  }
  function mergePlanning(cluster, representative) {
    const groups = new Map();
    for (const record of cluster) for (const original of record.analysis?.planning_assumptions || []) {
      const roleNode = original.arm_role === 'intervention' ? Effects.armId(record.intervention) : original.arm_role === 'comparator' ? Effects.armId(record.comparator) : null;
      const role = roleNode ? roleNode === Effects.armId(representative.intervention) ? 'intervention' : 'comparator' : original.arm_role;
      const item = { ...original, arm_role: role, ...(role !== original.arm_role ? { reported_arm_role: original.arm_role } : {}) };
      const key = stable([item.kind, role, item.outcome, item.time_months ?? null, item.cutoff || '', item.probability, item.events ?? null, item.n ?? null, item.response_criteria ?? null, item.safety_attribution ?? null]);
      const previous = groups.get(key);
      if (!previous) groups.set(key, { ...item, source_refs: (item.source_refs || []).slice(), source_record_ids: unique([item.id, ...(item.source_record_ids || [])]), source_stages: unique([item.source_stage, ...(item.source_stages || [])]) });
      else { previous.source_refs = distinctObjects([...previous.source_refs, ...(item.source_refs || [])]); previous.source_record_ids = unique([...previous.source_record_ids, item.id, ...(item.source_record_ids || [])]); previous.source_stages = unique([...previous.source_stages, item.source_stage, ...(item.source_stages || [])]); }
    }
    return [...groups.values()];
  }
  function samplePriority(sample) {
    const basis = text(sample?.basis);
    if (/analysis|outcome_analysis|source_result_count|ITT/.test(basis)) return 4;
    if (/treated/.test(basis)) return 3;
    if (/randomized/.test(basis)) return 2;
    if (/enrolled/.test(basis)) return 1;
    return 0;
  }
  function supportedSample(sample,record) {
    const n=positive(sample?.n),refs=sample?.source_refs;
    if(n===null||missing(record.pmid)||missing(sample?.basis)||!Array.isArray(refs)||!refs.length)return false;
    return refs.every(ref=>text(ref.pmid)===text(record.pmid)&&!missing(ref.section)&&!missing(ref.record_id)&&
      /^[a-f0-9]{64}$/i.test(text(ref.source_sha256))&&Array.isArray(ref.evidence_ids)&&ref.evidence_ids.length>0&&ref.evidence_ids.every(id=>!missing(id)));
  }
  function supportedSampleSize(record) {
    const a=record.analysis||{},direct=a.sample_size,c=a.cohort||{};
    if(supportedSample(direct,record))return {n:positive(direct.n),basis:'comparison',source_basis:direct.basis,source_refs:direct.source_refs};
    const cohort={n:c.sample_n,basis:c.sample_n_basis,source_refs:c.sample_n_source_refs};
    if(supportedSample(cohort,record))return {n:positive(cohort.n),basis:'cohort',source_basis:cohort.basis,source_refs:cohort.source_refs};
    return {n:null,basis:null,source_basis:null,source_refs:[]};
  }
  function mergeCluster(cluster) {
    const members = cluster.flatMap((record) => record.merged_records || [record]);
    const representative = cluster.slice().sort(representativeOrder)[0];
    const richest = cluster.slice().sort((a, b) => completeness(b) - completeness(a) || representativeOrder(a, b))[0];
    const analysis = { ...(representative.analysis || {}), ...(richest.analysis || {}) };
    analysis.source_stages = unique(cluster.flatMap((record) => record.analysis?.source_stages || (record.source_refs || []).map((ref) => ref.stage)));
    analysis.source_refs = distinctObjects(cluster.flatMap((record) => record.analysis?.source_refs || []));
    analysis.filter_bindings = distinctObjects(cluster.flatMap((record) => record.analysis?.filter_bindings || []));
    analysis.planning_assumptions = mergePlanning(cluster, representative);
    const samples = cluster.filter((record) => supportedSample(record.analysis?.sample_size,record)).sort((a, b) => samplePriority(b.analysis.sample_size) - samplePriority(a.analysis.sample_size) || completeness(b) - completeness(a));
    analysis.sample_sizes = distinctObjects(cluster.flatMap((record) => [...(record.analysis?.sample_sizes || []), ...(positive(record.analysis?.sample_size?.n) !== null ? [record.analysis.sample_size] : [])]));
    if (samples.length) {
      const sample = samples[0].analysis.sample_size;
      analysis.sample_size = { ...sample, source_refs: distinctObjects(samples.filter((record) => record.analysis.sample_size.n === sample.n && record.analysis.sample_size.basis === sample.basis).flatMap((record) => record.analysis.sample_size.source_refs || [])) };
    }
    const cohortSamples=cluster.filter(record=>{const c=record.analysis?.cohort||{};return supportedSample({n:c.sample_n,basis:c.sample_n_basis,source_refs:c.sample_n_source_refs},record);})
      .sort((a,b)=>samplePriority({basis:b.analysis.cohort.sample_n_basis})-samplePriority({basis:a.analysis.cohort.sample_n_basis})||completeness(b)-completeness(a));
    if(cohortSamples.length){const c=cohortSamples[0].analysis.cohort;analysis.cohort={...analysis.cohort,sample_n:c.sample_n,sample_n_basis:c.sample_n_basis,sample_n_count_purpose:c.sample_n_count_purpose,sample_n_source_refs:c.sample_n_source_refs};}
    if (cluster.some((record) => record.analysis?.metadata_conflicts?.length)) analysis.metadata_conflicts = distinctObjects(cluster.flatMap((record) => record.analysis?.metadata_conflicts || []));
    return { ...representative, analysis, source_conflict: cluster.some((record) => record.source_conflict === true), merged_record_ids: unique(cluster.flatMap((record) => [record.id, ...(record.merged_record_ids || [])])),
      merged_records: unique(members), source_refs: distinctObjects(cluster.flatMap((record) => record.source_refs || [])) };
  }
  function consolidate(comparisons) {
    const scopes = new Map();
    for (const record of comparisons || []) { const key = stable(consolidationScope(record)); if (!scopes.has(key)) scopes.set(key, []); scopes.get(key).push(record); }
    const result = [];
    for (const records of scopes.values()) {
      const explicitCutoffs = unique(records.map(cutoff)), clusters = [];
      for (const record of records.slice().sort(representativeOrder)) {
        const candidate = clusters.find((cluster) => cluster.every((other) => {
          const a = cutoff(record), b = cutoff(other);
          return (a === b || ((!a || !b) && explicitCutoffs.length <= 1)) && sameReportedTuple(record, other);
        }));
        if (candidate) candidate.push(record); else clusters.push([record]);
      }
      result.push(...clusters.map(mergeCluster));
    }
    return result;
  }
  function normalizeRow(comparison, tailId, headId) {
    const effect = Effects.directedEffect(comparison, tailId, headId);
    if (!effect.valid) return null;
    const analysis = comparison.analysis || {}, level = confidenceLevel(effect.ci_level);
    // Display standardization must never alter a study's source-derived weight.
    const se=finite(effect.precision_se)&&effect.precision_se>0?effect.precision_se:null;
    const pmid = comparison.pmid || null, year = analysis.publication_year || comparison.year || null;
    const study = comparison.study_name || analysis.independent_id || comparison.study_id || (pmid ? 'PMID ' + pmid : 'Unlinked report');
    const cohort=cohortInfo(comparison),sample=supportedSampleSize(comparison),cohortLabel=cohort.is_subgroup||cohort.scope==='independent_cohort'||cohort.independently_recruited?text(cohort.short_label||cohort.label):'';
    return { id: comparison.id, comparison_id: comparison.id, comparison, source: comparison, study_id: analysis.cohort?.independent_group_id || analysis.independent_id || null, parent_study_id: analysis.independent_id || null,
      cohort, sample_n: positive(analysis.sample_size?.n),pooling_n:sample.n,pooling_n_basis:sample.basis,pooling_n_source_basis:sample.source_basis,pooling_n_source_refs:sample.source_refs,
      label: study + (cohortLabel?' · '+cohortLabel:'') + (year ? ' (' + year + ')' : ''), study_name: comparison.study_name || null, pmid, year,
      estimate: effect.estimate, ci_lower: effect.ci_lower, ci_upper: effect.ci_upper, ci_level: level,
      ci_level_assumed: effect.ci_level_assumed,
      ci_95_unavailable:effect.ci_95_unavailable,ci_converted:effect.ci_converted,ci_conversion_method:effect.ci_conversion_method,ci_conversion_status:effect.ci_conversion_status,original_ci:effect.original_ci,conversion_note:effect.conversion_note,
      log_estimate: Math.log(effect.estimate), se, variance: se === null ? null : se * se, measure: effect.measure,
      endpoint_key: effect.endpoint_key, reversed: effect.reversed, direction: effect.direction, effect,
      merged_record_ids: comparison.merged_record_ids || [comparison.id], weight: null, weight_percent: null };
  }
  function modelForK(k) {
    if(!Number.isInteger(k)||k<1)return null;
    return k===1?{model:'individual',model_label:'Individual study',tau2_method:'none',method:'single',single_study:true}:
      k===2?{model:'fixed',model_label:'Fixed-effect',tau2_method:'none',method:'FE',single_study:false}:
      {model:'random',model_label:'Random-effects',tau2_method:'REML',method:'REML',single_study:false};
  }
  function remlTau2(rows) {
    if(rows.length<2)return 0;
    // Intercept-only restricted likelihood, up to constants independent of tau²:
    // sum(log(v_i+tau²)) + log(sum(w_i)) + sum(w_i*(y_i-mu_w)^2).
    // This is the ll.REML expression in metafor::rma.uni with X a column of 1s:
    // https://github.com/wviechtb/metafor/blob/master/R/rma.uni.r
    // Scaling by the smallest sampling variance improves boundary/root accuracy.
    const scale=Math.min(...rows.map(row=>row.variance)),origin=rows[0].log_estimate;
    const y=rows.map(row=>(row.log_estimate-origin)/Math.sqrt(scale)),v=rows.map(row=>row.variance/scale),k=rows.length;
    const mean=sum(y)/k,sse=sum(y.map(value=>(value-mean)**2));
    const profile=t=>{
      const weights=v.map(value=>1/(value+t)),total=sum(weights),mu=sum(y.map((value,i)=>value*weights[i]))/total;
      const residual=y.map(value=>(value-mu)**2),squared=weights.map(value=>value*value);
      return {value:sum(v.map(value=>Math.log(value+t)))+Math.log(total)+sum(residual.map((value,i)=>value*weights[i])),
        score:total-sum(squared)/total-sum(residual.map((value,i)=>value*squared[i]))};
    };
    // Beyond max(v)+SSE/(k-1), the profile derivative is nonnegative:
    // tr(P)>= (k-1)/(max(v)+t), y'P²y <= SSE/t². Thus no tail maximum is missed.
    const upper=Math.max(...v)+sse/(k-1),logUpper=Math.log1p(upper),boundary=profile(0);
    let best={t:0,value:boundary.value},left=0,leftProfile=boundary;
    // A logarithmic grid brackets positive score crossings. Compare all resulting
    // stationary minima with zero, rather than assuming that the score at zero
    // alone establishes a global boundary optimum with unequal variances.
    for(let i=1;i<=128;i++){
      const right=i===128?upper:Math.expm1(logUpper*i/128),rightProfile=profile(right);
      if(leftProfile.score<0&&rightProfile.score>=0){
        let lo=left,hi=right;
        for(let iteration=0;iteration<100;iteration++){
          const mid=(lo+hi)/2;if(mid===lo||mid===hi)break;
          if(profile(mid).score<0)lo=mid;else hi=mid;
          if(hi-lo<=1e-13*Math.max(1,mid))break;
        }
        const t=(lo+hi)/2,value=profile(t).value;
        if(value<best.value)best={t,value};
      }
      left=right;leftProfile=rightProfile;
    }
    // Numerical ties favor the exact nonnegative boundary, not a spurious tiny variance.
    return boundary.value-best.value<=32*EPS*Math.max(1,Math.abs(boundary.value))?0:best.t*scale;
  }
  function poolRows(rows) {
    if (!rows.length || rows.some((row) => !finite(row.log_estimate) || !(finite(row.variance) && row.variance > 0))) return null;
    const k = rows.length, weights = rows.map((row) => 1 / row.variance), total = sum(weights);
    const fixed = sum(rows.map((row, i) => row.log_estimate * weights[i])) / total;
    const Q = sum(rows.map((row, i) => weights[i] * Math.pow(row.log_estimate - fixed, 2))), df = k - 1;
    const model=modelForK(k),tau2=k>=3?remlTau2(rows):0;
    const modelWeights = rows.map((row) => 1 / (row.variance + tau2)), totalModel = sum(modelWeights);
    const logEstimate = sum(rows.map((row, i) => row.log_estimate * modelWeights[i])) / totalModel, se = Math.sqrt(1 / totalModel), z = normalQuantile(0.975);
    const single={...rows[0],...ConfidenceIntervals.forDisplay({...rows[0],measure:rows[0].measure||'HR'})},singleCI=k===1&&positive(single.ci_lower)!==null&&positive(single.ci_upper)!==null;
    return { k, ...model, estimate:k===1&&positive(single.estimate)!==null?single.estimate:Math.exp(logEstimate),
      ci_lower:k===1?(singleCI?single.ci_lower:null):Math.exp(logEstimate-z*se),ci_upper:k===1?(singleCI?single.ci_upper:null):Math.exp(logEstimate+z*se),
      p_value: Math.min(1, 2 * normalSF(Math.abs(logEstimate / se))), log_estimate: logEstimate, se, variance: se * se,
      tau2, Q, I2: Q > 0 ? Math.max(0, (Q - df) / Q) * 100 : 0, df,
      heterogeneity_p: df > 0 ? gammaQ(df / 2, Q / 2) : null,ci_level:k===1?(singleCI?confidenceLevel(single.ci_level):null):95,
      ci_95_unavailable:k===1&&single.ci_95_unavailable===true,ci_conversion_status:k===1?single.ci_conversion_status:null,ci_converted:k===1&&single.ci_converted===true,ci_conversion_method:k===1?single.ci_conversion_method:null,original_ci:k===1?single.original_ci:null,conversion_note:k===1?single.conversion_note:null,
      fixed_log_estimate: fixed, fixed_weight_sum: total, weights: modelWeights, weight_percent: modelWeights.map((w) => 100 * w / totalModel) };
  }
  function egger(rows) {
    const k = rows.length;
    const empty = { available: false, k, intercept: null, se: null, t: null, p_value: null, df: k - 2 };
    if (k < 10) return { ...empty, reason: 'Egger’s test requires at least 10 independent compatible studies.' };
    const x = rows.map((row) => 1 / row.se), y = rows.map((row) => row.log_estimate / row.se), mx = sum(x) / k, my = sum(y) / k;
    const sxx = sum(x.map((v) => (v - mx) ** 2));
    if (!(sxx > EPS * sum(x.map((v) => v * v)))) return { ...empty, reason: 'Egger’s test requires variation in study precision.' };
    const slope = sum(x.map((v, i) => (v - mx) * (y[i] - my))) / sxx, intercept = my - slope * mx;
    const residual = sum(y.map((v, i) => (v - intercept - slope * x[i]) ** 2));
    const se = Math.sqrt(residual / (k - 2) * (1 / k + mx * mx / sxx));
    if (!(finite(se) && se > 1e-14)) return { ...empty, reason: 'Egger’s test is undefined with zero residual variation.' };
    const t = intercept / se;
    return { available: true, k, intercept, slope, se, t, p_value: studentTPvalue(t, k - 2), df: k - 2, reason: null };
  }
  function diagnostics(rows, pooled) {
    const funnel = rows.map(({ id, study_id, label, pmid, log_estimate, se, estimate }) => ({ id, study_id, label, pmid, log_estimate, se, estimate }));
    const reasons = {}, baujat = [], leaveOneOut = [];
    if (rows.length < 2) reasons.baujat = 'Baujat diagnostics require at least 2 independent compatible studies.';
    else rows.forEach((row, i) => {
      const remaining = rows.filter((_, j) => i !== j), omitted = poolRows(remaining);
      baujat.push({ id: row.id, study_id: row.study_id, label: row.label, pmid: row.pmid,
        q_contribution: (row.log_estimate - pooled.fixed_log_estimate) ** 2 / row.variance,
        // Classic equal-effects Baujat influence: squared change standardized
        // by the variance of the fit with this study omitted (metafor baujat).
        influence: (omitted.fixed_log_estimate - pooled.fixed_log_estimate) ** 2 * omitted.fixed_weight_sum });
    });
    if (rows.length < 2) reasons.leave_one_out = 'Leave-one-out analysis requires at least 2 independent compatible studies.';
    else rows.forEach((row, i) => {
      const omitted = poolRows(rows.filter((_, j) => i !== j));
      leaveOneOut.push({ omitted_id: row.id, study_id: row.study_id, label: row.label, pmid: row.pmid, k_remaining: omitted.k,
        single_study: omitted.k === 1,model:omitted.model,model_label:omitted.model_label,tau2_method:omitted.tau2_method,
        estimate: omitted.estimate, ci_lower: omitted.ci_lower, ci_upper: omitted.ci_upper,ci_level:omitted.ci_level,ci_95_unavailable:omitted.ci_95_unavailable,ci_conversion_status:omitted.ci_conversion_status,ci_converted:omitted.ci_converted,ci_conversion_method:omitted.ci_conversion_method,original_ci:omitted.original_ci,conversion_note:omitted.conversion_note,p_value: omitted.p_value, pooled: omitted });
    });
    if (rows.length < 2) reasons.funnel = 'A funnel plot requires at least 2 independent compatible studies.';
    return { funnel, egger: egger(rows), baujat, leave_one_out: leaveOneOut, reasons };
  }
  function selectionRank(row) {
    const record = row.comparison, a = record.analysis || {}, date = a.analysis_date && Date.parse(a.analysis_date);
    const year = Number(a.publication_year || record.year);
    return [finite(date) ? date : year > 1800 && year < 3000 ? Date.UTC(year, 0, 1) : -Infinity,
      a.primary_analysis === true ? 1 : 0, completeness(record)];
  }
  function reportedMaturity(record) {
    const description = text(record.analysis?.analysis_cutoff || record.cutoff).toLowerCase();
    const final = /\bfinal\b/.test(description), interim = /\binterim\b/.test(description);
    const order = final && !interim ? 1000 : interim && !final ? /\b(?:second|2nd)\b/.test(description) ? 2 : /\b(?:third|3rd)\b/.test(description) ? 3 : /\b(?:first|1st)\b/.test(description) ? 1 : 0 : null;
    const followup = description.match(/\b(minimum|median)\s+follow[ -]?up\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(months?|years?)/);
    return { order, kind: followup?.[1] || null, months: followup ? Number(followup[2]) * (/^year/.test(followup[3]) ? 12 : 1) : null };
  }
  function rankCompare(a, b) {
    const x = selectionRank(a), y = selectionRank(b);
    if (x[0] !== y[0]) return y[0] > x[0] ? 1 : -1;
    // Explicit final/interim labels and like-for-like reported follow-up durations
    // can order analyses within the same calendar rank; they never invent a date.
    const ma = reportedMaturity(a.comparison), mb = reportedMaturity(b.comparison);
    if (ma.order !== null && mb.order !== null && ma.order !== mb.order) return mb.order > ma.order ? 1 : -1;
    if (ma.kind && ma.kind === mb.kind && ma.months !== mb.months) return mb.months > ma.months ? 1 : -1;
    // Prefer the adjusted result within one observational cohort's current
    // analysis. A more recent report or follow-up still takes precedence.
    const design = row => row.comparison.analysis?.design ?? row.comparison.analysis?.compatibility?.design;
    if (a.cohort.id === b.cohort.id && design(a) === 'observational' && design(b) === 'observational') {
      const adjusted = row => [row.comparison.analysis?.adjusted, row.comparison.adjusted, row.comparison.analysis?.compatibility?.adjusted].find(value => !missing(value)) === 'yes';
      if (adjusted(a) !== adjusted(b)) return adjusted(a) ? -1 : 1;
    }
    if (x[1] !== y[1]) return y[1] > x[1] ? 1 : -1;
    for (let i = 2; i < x.length; i += 1) if (x[i] !== y[i]) return y[i] > x[i] ? 1 : -1;
    return 0;
  }
  function exclusion(row, reason, detail) { return { id: row.id, comparison_id: row.id, comparison: row.comparison, source: row.comparison, row, reason, detail: detail || null }; }
  function cohortInfo(record) {
    const a=record.analysis||{},c=a.cohort||{},identity=text(a.independent_id)||'unlinked:'+record.id;
    const subgroup=c.is_subgroup===true||c.scope==='subgroup';
    const id=text(c.id)||identity,root=text(c.root_id)||text(c.independent_group_id)||identity;
    return {...c,id,root_id:root,parent_id:text(c.parent_id)||null,is_subgroup:subgroup,
      scope:subgroup?'subgroup':c.scope||'overall',label:text(c.label)||text(record.population)||'Overall population',
      sample_n:positive(c.sample_n),independent_group_id:text(c.independent_group_id)||identity};
  }
  function filterMatch(record,advanced) {
    if(!advanced?.active)return {matched:true,specificity:0,matched_keys:[],direct_keys:[]};
    const matches=advanced.matches||{},get=id=>matches instanceof Map?matches.get(id):matches[id];
    const supplied=unique([record.id,...(record.merged_record_ids||[])]).map(get).filter(Boolean);
    const accepted=supplied.filter(item=>item.matched===true).sort((a,b)=>Number(b.specificity||0)-Number(a.specificity||0));
    return accepted[0]||{matched:false,specificity:0,matched_keys:[],direct_keys:[]};
  }
  function populationKey(record,advanced,match) {
    const base=semanticKey(record)||'unclassified:'+record.id,c=cohortInfo(record);
    if(!record.analysis?.cohort)return base;
    let dimensions;
    try{const parsed=JSON.parse(base);if(Array.isArray(parsed)&&parsed.length===9)dimensions=parsed.slice();}catch(_){/* Opaque compatibility keys stay explicit. */}
    const requested=Object.entries(advanced?.selections||{}).filter(([,value])=>value&&value!=='all').map(([key])=>key);
    const matchedKeys=new Set(match.matched_keys||requested);
    const covered=Array.isArray(c.filter_equivalence_keys)&&c.filter_equivalence_keys.length>0&&c.filter_equivalence_keys.every(key=>matchedKeys.has(key));
    const certified=advanced?.active&&match.matched&&(!c.is_subgroup||covered||match.population_key==='');
    if(dimensions){
      if(certified){
        dimensions[7]='filtered_population';
        const indexes={setting:0,subtype:1,braf:3};
        for(const [key,index] of Object.entries(indexes))if(matchedKeys.has(key)&&advanced.selections?.[key]&&advanced.selections[key]!=='all')dimensions[index]='filter:'+advanced.selections[key];
      }else if(!c.is_subgroup)dimensions[7]='overall';
    }
    const key=dimensions?JSON.stringify(dimensions):base;
    if(c.is_subgroup&&!certified)return key+'|subgroup:'+text(c.stratum_key||c.label||c.id).toLowerCase();
    const residual=advanced?.active&&match.matched&&typeof match.population_key==='string'?match.population_key:'';
    return key+(residual?'|population:'+residual:'');
  }
  function poolingKey(record) {
    return Effects.endpointKey(record) || 'unclassified:' + record.id;
  }
  function incompatibleEffectQuantity(record) {
    const analysis = record.analysis || {}, compatibility = analysis.compatibility || {};
    const model = [record.model, analysis.model, analysis.model_family, compatibility.model_family, analysis.estimand, compatibility.estimand].map(text).join(' ').toLowerCase();
    if (/accelerated[ _-]*failure|\baft\b|time[ _-]*ratio|acceleration[ _-]*factor/.test(model)) {
      return 'An accelerated failure-time or time-ratio result cannot be combined with hazard ratios.';
    }
    if (/restricted[ _-]*mean|\brmst\b/.test(model)) {
      return 'A restricted mean survival result cannot be combined with hazard ratios.';
    }
    if (/subdistribution|fine[ _-]*(?:and[ _-]*)?gray/.test(model)) {
      return 'A subdistribution hazard ratio estimates a different quantity from the selected ordinary hazard ratio.';
    }
    const endpoint = Effects.endpointKey(record), definition = [record.outcome_definition, analysis.estimand, compatibility.estimand].map(text).join(' ').toLowerCase();
    if (endpoint === 'ORR:RR' || endpoint === 'ORR:OR') {
      if (/disease[ _-]*control|\bdcr\b/.test(definition)) return 'Disease control and objective response estimate different outcomes.';
    }
    if (endpoint === 'PFS:HR') {
      if (/intracranial|\b(?:pfs2|prfs2)\b|progression[ -]free survival 2|time from first response/.test(definition)) {
        return 'This result concerns a distinct progression or response-duration endpoint.';
      }
    }
    return null;
  }
  function cohortSize(row){const c=row.cohort||{},sample={n:c.sample_n,basis:c.sample_n_basis,source_refs:c.sample_n_source_refs};return supportedSample(sample,row.comparison)?positive(c.sample_n):row.pooling_n;}
  function cohortRankCompare(a,b){
    const na=cohortSize(a),nb=cohortSize(b);
    // Size breaks ties between distinct populations; report chronology is
    // handled separately within one established recruitment cohort.
    if(na!==null&&nb!==null&&na!==nb)return nb-na;
    return rankCompare(a,b);
  }
  function populationBreadth(row,rows){
    if(!row.cohort.is_subgroup)return 0;
    const byId=new Map(rows.map(item=>[item.cohort.id,item.cohort])),seen=new Set([row.cohort.id]);let depth=1,parent=row.cohort.parent_id;
    while(parent&&byId.has(parent)&&!seen.has(parent)){seen.add(parent);const c=byId.get(parent);if(c.is_subgroup)depth++;parent=c.parent_id;}
    return depth;
  }
  function overrideFor(row,options){
    const overrides=options.inclusionOverrides||{},get=id=>overrides instanceof Map?overrides.get(id):overrides[id];
    for(const id of [row.id,...row.merged_record_ids]){const value=get(id);if(typeof value==='boolean')return value;}
    return null;
  }
  function manualOrder(row,options){
    const order=options.inclusionOrder||[];return Math.max(-1,...[row.id,...row.merged_record_ids].map(id=>order.lastIndexOf(id)));
  }
  function latestInclusionAction(rows, options) {
    return rows.filter(row => row.manual_override !== null)
      .sort((a, b) => manualOrder(b, options) - manualOrder(a, options) || Number(b.manual_override) - Number(a.manual_override))[0];
  }
  const selectionDetails={
    included_overall:'Overall population selected; overlapping subgroup estimates remain visible.',
    included_subgroup_only:'Subgroup-only evidence selected; alternatives from the same recruitment cohort remain available.',
    included_filter_subgroup:'This subgroup more closely matches the active advanced filters and replaces the overall estimate.',
    included_filter:'Selected population matches the active advanced filters.',
    included_manual:'Included by your selection.',
    manually_excluded:'Excluded by your selection.',
    represented_by_overall:'Not pooled because the overall result represents this recruitment cohort.',
    represented_by_aggregate:'Not pooled because the selected aggregate overall result already includes this separately recruited cohort.',
    aggregate_replaced_by_cohorts:'The aggregate overall result is replaced by its separately recruited cohorts.',
    alternative_subgroup:'Another population from the same recruitment cohort is selected; select this row to replace it.',
    outside_advanced_filters:'This result population does not satisfy all active advanced filters.',
    superseded_same_trial:'Another result from this cohort is selected. Select this row to replace it.',
    unavailable_valid_precision:'A compatible confidence interval is unavailable for inverse-variance pooling; the selected estimate can still support planning.',
    missing_supported_sample_size:'Not pooled because a supported positive sample size is unavailable. The estimate remains available for individual-study review and planning.',
  };
  function selectEvidence(comparisons, options, requireSampleSize) {
    options=options||{};
    const hasRequiredN=row=>!requireSampleSize||row.pooling_n!==null;
    const endpoint=options.endpoint||'OS:HR',tailId=options.tailId,headId=options.headId,studyScope=options.studyScope||'all',advanced=options.advanced||{};
    const prepared=consolidate(comparisons||[]),groups=new Map(),tableRows=[],held=[],scopeExcluded=[];
    const exclusions=new Map(),populationCandidates=[];
    const exclude=(row,reason,detail)=>exclusions.set(row.id,exclusion(row,reason,detail||selectionDetails[reason]));
    for(const comparison of prepared){
      if(!Effects.comparisonMatchesEndpoint(comparison,endpoint))continue;
      const row=normalizeRow(comparison,tailId,headId);if(!row)continue;
      const a=comparison.analysis||{},compatibility=a.compatibility||{},match=filterMatch(comparison,advanced),key=poolingKey(comparison);
      Object.assign(row,{group_key:key,filter_match:match,manual_override:overrideFor(row,options),included:false,population_selected:false,planning_included:false,default_included:false,eligible:false,selectable:false,selection_source:'default'});
      tableRows.push(row);
      if(!matchesScope(comparison,studyScope)){const item=exclusion(row,'outside_study_scope','Outside the selected study-design scope.');scopeExcluded.push(item);exclude(row,item.reason,item.detail);continue;}
      if(!groups.has(key))groups.set(key,{key,label:'Included studies',compatibility,display:[],selected:[],excluded:[],pooled:null,single:null,diagnostics:null});
      const group=groups.get(key);group.display.push(row);
      let reason=null,detail=incompatibleEffectQuantity(comparison);
      if(detail)reason='incompatible_effect_quantity';
      else if(compatibility.eligible!==true){reason='incompatible_or_unclassified_context';detail=compatibility.reason||'Compatibility has not been verified.';}
      else if(comparison.source_conflict||a.metadata_conflicts?.length)reason='unresolved_source_conflict';
      else if(a.independence_verified!==true||!text(a.independent_id))reason='unverified_study_independence';
      if(reason){exclude(row,reason,detail);continue;}
      // This is the user's inclusion policy, not a mathematical requirement
      // of inverse-variance HR estimation. N never enters the study weights.
      row.eligible=row.variance>0&&hasRequiredN(row);
      if(advanced.active&&!match.matched){exclude(row,'outside_advanced_filters');row.selection_source='filter';continue;}
      populationCandidates.push(row);
    }
    // Select one result per cohort across source stages, models and adjustment
    // metadata. Explicit row choices can replace the default representative.
    const byCohort = new Map();
    for (const row of populationCandidates) {
      if (!byCohort.has(row.cohort.id)) byCohort.set(row.cohort.id, []);
      byCohort.get(row.cohort.id).push(row);
      row.selectable = hasRequiredN(row);
    }
    function cohortResult(rows, useOverrides) {
      const manual = useOverrides ? rows.filter(row => row.manual_override === true && hasRequiredN(row)) : [];
      if (manual.length) return manual.sort((a, b) => manualOrder(b, options) - manualOrder(a, options) || rankCompare(a, b))[0];
      const poolable = rows.filter(row => row.eligible);
      const candidates = (poolable.length ? poolable : rows).slice().sort(rankCompare);
      const best = candidates.filter(row => rankCompare(row, candidates[0]) === 0);
      if (!best.every(a => best.every(b => sameTuple(a, b)))) return null;
      return best.slice().sort((a, b) => representativeOrder(a.comparison, b.comparison))[0];
    }
    const cohortChoices = new Map([...byCohort].map(([id, rows]) => [id, {
      defaults: cohortResult(rows, false), actual: cohortResult(rows, true),
    }]));
    const representatives = populationCandidates;
    const byRoot = new Map();
    for (const row of representatives) {
      if (!byRoot.has(row.cohort.root_id)) byRoot.set(row.cohort.root_id, []);
      byRoot.get(row.cohort.root_id).push(row);
    }
    function choose(rows, useOverrides) {
      if (useOverrides) {
        const lastAction = latestInclusionAction(rows, options);
        if (lastAction?.manual_override === false && manualOrder(lastAction, options) >= 0) {
          return {chosenId: lastAction.cohort.id, reason: 'manually_excluded', block_reason: 'manually_excluded', source: 'manual', selected: new Set()};
        }
      }
      const mode = useOverrides ? 'actual' : 'defaults';
      const candidatesByCohort = unique(rows.map(row => row.cohort.id)).map(id => cohortChoices.get(id)[mode]).filter(Boolean);
      const manual = useOverrides ? candidatesByCohort.filter(row => row.manual_override === true && hasRequiredN(row)) : [];
      let chosen, reason, source = 'default';
      if (manual.length) {
        chosen = manual.slice().sort((a, b) => manualOrder(b, options) - manualOrder(a, options) || Number(b.cohort.is_subgroup) - Number(a.cohort.is_subgroup) || cohortRankCompare(a, b))[0];
        reason = 'included_manual';
        source = 'manual';
      } else {
        const poolable = candidatesByCohort.filter(row => row.eligible);
        const relevant = poolable.length ? poolable : candidatesByCohort;
        const overall = relevant.filter(row => !row.cohort.is_subgroup);
        const subgroups = relevant.filter(row => row.cohort.is_subgroup);
        let candidates = overall.length ? overall : subgroups;
        reason = overall.length ? 'included_overall' : 'included_subgroup_only';
        if (advanced.active) {
          const top = Math.max(...relevant.map(row => Number(row.filter_match.specificity) || 0));
          const moreSpecific = subgroups.filter(row => (Number(row.filter_match.specificity) || 0) === top);
          const overallSpecificity = overall.length ? Math.max(...overall.map(row => Number(row.filter_match.specificity) || 0)) : -Infinity;
          if (moreSpecific.length && top > overallSpecificity) {
            candidates = moreSpecific;
            reason = 'included_filter_subgroup';
          } else reason = overall.length ? 'included_filter' : 'included_filter_subgroup';
          source = 'filter';
        }
        chosen = candidates.slice().sort((a, b) => populationBreadth(a, rows) - populationBreadth(b, rows) || cohortRankCompare(a, b) || text(a.cohort.id).localeCompare(text(b.cohort.id)) || text(a.id).localeCompare(text(b.id)))[0];
      }
      const selected = new Set(chosen && (!useOverrides || chosen.manual_override !== false) ? [chosen.id] : []);
      return {chosenId: chosen?.cohort.id, reason, source, selected};
    }
    const rootChoices=new Map([...byRoot].map(([id,rows])=>[id,{rows,defaults:choose(rows,false),actual:choose(rows,true)}]));
    const aggregateChildren=new Map();
    for(const row of representatives){const parent=text(row.cohort.aggregate_parent_root_id);if(parent&&parent!==row.cohort.root_id&&rootChoices.has(parent)){if(!aggregateChildren.has(parent))aggregateChildren.set(parent,new Set());aggregateChildren.get(parent).add(row.cohort.root_id);}}
    function descendants(parent){const result=new Set(),todo=[...(aggregateChildren.get(parent)||[])];while(todo.length){const id=todo.shift();if(id===parent||result.has(id))continue;result.add(id);todo.push(...(aggregateChildren.get(id)||[]));}return [...result];}
    function resolveAggregates(mode){
      for(const [parent] of aggregateChildren){
        const parentPlan=rootChoices.get(parent),choice=parentPlan[mode],childPlans=descendants(parent).map(id=>rootChoices.get(id)).filter(Boolean);
        if (mode === 'actual') {
          const parentAction = latestInclusionAction(parentPlan.rows, options);
          const childAction = latestInclusionAction(childPlans.flatMap(plan => plan.rows), options);
          if (childAction && (!parentAction || manualOrder(childAction, options) >= manualOrder(parentAction, options))) {
            choice.selected.clear();
            choice.block_reason = 'aggregate_replaced_by_cohorts';
            choice.source = 'manual';
            for (const plan of childPlans) {
              const action = latestInclusionAction(plan.rows, options);
              const explicitlyChosen = action?.manual_override === true && (!parentAction || manualOrder(action, options) >= manualOrder(parentAction, options));
              const initiallyIncluded = !parentAction && plan.defaults.selected.size > 0;
              if (!explicitlyChosen && !initiallyIncluded) {
                plan.actual.selected.clear();
                plan.actual.block_reason = 'manually_excluded';
                plan.actual.source = 'manual';
              }
            }
            continue;
          }
          if (parentAction?.manual_override === false) {
            for (const plan of childPlans) {
              plan.actual.selected.clear();
              plan.actual.block_reason = 'manually_excluded';
              plan.actual.source = 'manual';
            }
            continue;
          }
        }
        if(!choice.selected.size)continue;
        const parentHasPoolable=parentPlan.rows.some(row=>choice.selected.has(row.id)&&row.eligible),childHasPoolable=childPlans.some(plan=>plan.rows.some(row=>plan[mode].selected.has(row.id)&&row.eligible));
        if(!parentHasPoolable&&childHasPoolable){choice.selected.clear();choice.block_reason='aggregate_replaced_by_cohorts';continue;}
        const parentManual=mode==='actual'?parentPlan.rows.filter(row=>row.manual_override===true&&hasRequiredN(row)):[];
        const childManual=mode==='actual'?childPlans.flatMap(plan=>plan.rows.filter(row=>row.manual_override===true&&hasRequiredN(row))):[];
        const parentOrder=Math.max(-1,...parentManual.map(row=>manualOrder(row,options))),childOrder=Math.max(-1,...childManual.map(row=>manualOrder(row,options)));
        const requestedChild=childManual.length&&(!parentManual.length||childOrder>=parentOrder);
        const parentSpecificity=Math.max(...parentPlan.rows.filter(row=>choice.selected.has(row.id)).map(row=>Number(row.filter_match.specificity)||0));
        const childSpecificity=Math.max(-Infinity,...childPlans.flatMap(plan=>plan.rows.filter(row=>plan[mode].selected.has(row.id))).map(row=>Number(row.filter_match.specificity)||0));
        const filteredChild=advanced.active&&!parentManual.length&&childSpecificity>parentSpecificity;
        if(requestedChild||filteredChild){choice.selected.clear();choice.block_reason='aggregate_replaced_by_cohorts';choice.source=requestedChild?'manual':'filter';}
        else for(const plan of childPlans){plan[mode].selected.clear();plan[mode].block_reason='represented_by_aggregate';if(parentManual.length)plan[mode].source='manual';}
      }
    }
    resolveAggregates('defaults');resolveAggregates('actual');
    for(const {rows,defaults,actual} of rootChoices.values()){
      for(const row of rows){
        row.default_included=defaults.selected.has(row.id);row.selection_source=row.manual_override===false?'manual':actual.source;
        if(actual.selected.has(row.id)){
          row.population_selected=true;row.planning_included=true;row.selection_reason=actual.reason;row.selection_detail=selectionDetails[actual.reason];
          if(row.eligible){row.included=true;groups.get(row.group_key).selected.push(row);}
          else exclude(row,row.pooling_n===null?'missing_supported_sample_size':'unavailable_valid_precision');
        } else {
          const chosen = rows.find(other => actual.selected.has(other.id));
          const unresolved = !cohortChoices.get(row.cohort.id).actual;
          const reason = row.manual_override === false ? 'manually_excluded'
            : row.pooling_n === null ? 'missing_supported_sample_size'
            : actual.block_reason || (unresolved ? 'unresolved_same_trial_results'
              : chosen?.cohort.id === row.cohort.id ? 'superseded_same_trial'
              : chosen && !chosen.cohort.is_subgroup ? 'represented_by_overall' : 'alternative_subgroup');
          exclude(row, reason, unresolved ? 'Equally current results from this cohort differ. Choose one result to include.' : null);
        }
      }
    }
    const intentional=new Set(['outside_study_scope','outside_advanced_filters','manually_excluded','represented_by_overall','represented_by_aggregate','aggregate_replaced_by_cohorts','alternative_subgroup','superseded_same_trial']);
    for(const row of tableRows){
      const excluded=exclusions.get(row.id);
      if(excluded){row.selection_reason=excluded.reason;row.selection_detail=excluded.detail;if(groups.has(row.group_key))groups.get(row.group_key).excluded.push(excluded);if(!intentional.has(excluded.reason))held.push(excluded);}
    }
    for(const group of groups.values()){
      group.selected.sort((a,b)=>text(a.label).localeCompare(text(b.label))||text(a.id).localeCompare(text(b.id)));
      // The second, selection-only pass locates an individual fallback. It
      // never fits a meta-analysis using missing-N evidence.
      const summary=requireSampleSize?poolRows(group.selected):null;
      if(summary){group.selected=group.selected.map((row,i)=>({...row,weight:summary.weights[i],weight_percent:summary.weight_percent[i]}));if(summary.k>=2)group.pooled=summary;else group.single=summary;}
      group.tableRows=group.display;
      group.diagnostics=requireSampleSize?diagnostics(group.selected,summary):null;
      group.counts={reports:group.display.length,independent_studies:group.selected.length,held:group.excluded.filter(item=>!intentional.has(item.reason)).length,selection_excluded:group.excluded.filter(item=>intentional.has(item.reason)).length};
    }
    return {endpoint,tailId,headId,studyScope,groups:[...groups.values()],tableRows,held,excluded:scopeExcluded,
      counts:{input_records:(comparisons||[]).length,consolidated_records:prepared.length,matched_records:tableRows.length,displayed_records:sum([...groups.values()].map(group=>group.display.length)),independent_studies:sum([...groups.values()].map(group=>group.selected.length)),held:held.length,outside_scope:scopeExcluded.length}};
  }
  function analyze(comparisons, options) {
    const result=selectEvidence(comparisons,options,true);
    // Preserve all scientific, population and user-selection safeguards while
    // asking which latest individual results exist independently of N. This
    // keeps the fallback separate from pooling eligibility and participant N.
    if(result.groups.some(group=>group.selected.length<2&&group.display.some(row=>row.pooling_n===null&&row.variance>0))){
      const evidence=selectEvidence(comparisons,options,false);
      for(const group of result.groups){
        if(group.selected.length>=2)continue;
        const candidates=evidence.groups.find(item=>item.key===group.key)?.selected||[];
        if(candidates.length<2)continue;
        const latest=candidates.slice().sort((a,b)=>rankCompare(a,b)||representativeOrder(a.comparison,b.comparison))[0];
        const k=candidates.length,n=group.selected.length;
        group.latest_fallback={reason:'insufficient_sample_sizes',
          row:{...latest,included:false,eligible:latest.variance>0&&latest.pooling_n!==null,selection_reason:'latest_unpooled_result'},
          independent_studies:k,sample_size_studies:n,
          note:'Not pooled: '+(n===0?'none':'only '+n)+' of '+k+' independent studies '+(n===1?'has':'have')+' a supported sample size. The latest result is shown and used for planning.'};
      }
    }
    return result;
  }
  return Object.freeze({ analyze, consolidate, matchesScope, semanticKey, cohortInfo, populationKey, poolingKey, supportedSampleSize, normalizeRow, modelForK, remlTau2, poolRows, diagnostics, normalCDF, normalQuantile, studentTPvalue, confidenceLevel });
});
