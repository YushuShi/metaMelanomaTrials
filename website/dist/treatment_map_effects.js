/* Endpoint matching and display-only direction; saved source estimates are never rewritten. */
(function (root, factory) {
  const ci=typeof module==='object'&&module.exports?require('./confidence_intervals.js'):root.ConfidenceIntervals;
  const api=Object.freeze({...factory(ci),cacheSource:String(factory)+ci.cacheSource});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TreatmentMapEffects = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function (ConfidenceIntervals) {
  'use strict';
  const endpointDefinitions = [
    ['OS', 'Overall survival', 'HR', 'lower'],
    ['PFS', 'Progression-free survival', 'HR', 'lower'],
    ['DFS', 'Disease-free survival', 'HR', 'lower'],
    ['RFS', 'Recurrence-free survival', 'HR', 'lower'],
    ['DSS', 'Disease-specific survival', 'HR', 'lower'],
    ['DMFS', 'Distant metastasis-free survival', 'HR', 'lower'],
    ['DOR', 'Duration of response', 'HR', 'lower'],
    ['ORR', 'Objective response rate', 'RR', 'higher'],
    ['ORR', 'Objective response rate', 'OR', 'higher'],
    ['DCR', 'Disease control rate', 'RR', 'higher'],
    ['DCR', 'Disease control rate', 'OR', 'higher'],
    ['AE', 'Adverse events', 'RR', 'lower'],
    ['AE', 'Adverse events', 'OR', 'lower'],
  ];
  const endpoints = Object.freeze(endpointDefinitions.map(([abbreviation, name, measure, polarity]) => Object.freeze({
    key: abbreviation + ':' + measure, endpoint: abbreviation, abbreviation, name, measure, polarity,
    label: `${name} (${abbreviation})` + (measure === 'HR' ? '' : ' · ' + measure),
    shortLabel: abbreviation + (measure === 'HR' ? '' : ' · ' + measure),
  })));
  const byKey = new Map(endpoints.map((endpoint) => [endpoint.key, endpoint]));
  const normalized = (value) => String(value || '').trim().toLowerCase().replace(/[‐‑‒–—−]/g, '-').replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  const aliases = new Map();
  for (const endpoint of endpoints) {
    for (const label of [endpoint.abbreviation, endpoint.name, `${endpoint.name} (${endpoint.abbreviation})`]) aliases.set(normalized(label), endpoint.abbreviation);
  }
  for (const [name, abbreviation] of [
    ['Relapse-free survival', 'RFS'], ['Overall response rate', 'ORR'],
    ['Adverse event', 'AE'], ['Treatment-related adverse events', 'AE'], ['TRAE', 'AE'], ['TRAEs', 'AE'],
  ]) aliases.set(normalized(name), abbreviation);
  const measureAliases = new Map([['hr', 'HR'], ['hazard ratio', 'HR'], ['rr', 'RR'], ['risk ratio', 'RR'], ['relative risk', 'RR'], ['or', 'OR'], ['odds ratio', 'OR']]);
  function measureKey(value) { return measureAliases.get(normalized(value)) || null; }
  function endpointKey(comparison) {
    if (!comparison || typeof comparison !== 'object') return null;
    const abbreviation = aliases.get(normalized(comparison.outcome)), measure = measureKey(comparison.measure);
    const key = abbreviation && measure ? abbreviation + ':' + measure : null;
    return byKey.has(key) ? key : null;
  }
  function comparisonMatchesEndpoint(comparison, key) { return byKey.has(key) && endpointKey(comparison) === key; }
  function availableEndpointOptions(comparisons, options) {
    const counts = new Map();
    for (const comparison of Array.isArray(comparisons) ? comparisons : []) {
      const key = endpointKey(comparison); if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    const required = new Set(['ORR:RR', ...(options?.includeDefault === false ? [] : ['OS:HR'])]);
    return endpoints.filter((endpoint) => required.has(endpoint.key) || counts.has(endpoint.key)).map((endpoint) => ({
      ...endpoint, count: counts.get(endpoint.key) || 0,
      // OS remains selectable to show an honest no-OS-evidence state. Reported OR is never substituted for RR.
      disabled: endpoint.key !== 'OS:HR' && !counts.has(endpoint.key),
    }));
  }
  function armId(arm) {
    if (!arm || typeof arm !== 'object') return null;
    if (arm.node_id) return arm.node_id;
    const source = String(arm.label || '').trim(); if (!source) return null;
    const label = /^placebo(?:\s*\+\s*placebo)*$/i.test(source) ? 'placebo' : source.toLowerCase().replace(/\s+/g, ' ');
    return 'control:' + encodeURIComponent(label);
  }
  function positive(value) {
    if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
    const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null;
  }
  function directedEffect(comparison, tailId, headId) {
    const original = comparison || null, measure = measureKey(comparison?.measure), key = endpointKey(comparison), endpoint = byKey.get(key);
    const output = {
      valid: false, estimate: null, ci_lower: null, ci_upper: null, ci_level: comparison?.ci_level ?? null,
      measure, endpoint_key: key, polarity: endpoint?.polarity || null, direction: 'neutral',
      tail_id: tailId, head_id: headId, tail_label: null, head_label: null,
      reversed: false, derived: false, derivation: null, ci_valid: false, ciExcludesNull: null, reason: null, original,
    };
    const intervention = armId(comparison?.intervention), comparator = armId(comparison?.comparator);
    // The displayed estimate always compares the arrowhead intervention with
    // the arrow-tail comparator. Original source tuples remain untouched.
    const forward = headId === intervention && tailId === comparator, reverse = headId === comparator && tailId === intervention;
    if (!tailId || !headId || tailId === headId || intervention === comparator || (!forward && !reverse)) return { ...output, reason: 'unmatched_complete_arms' };
    if (!measure) return { ...output, reason: 'unsupported_measure' };
    const sourceInterval=ConfidenceIntervals.forDisplay(comparison,{original:true});
    const estimate = positive(sourceInterval.estimate);
    if (estimate === null) return { ...output, reason: 'invalid_estimate' };
    const displayed = reverse ? 1 / estimate : estimate;
    if (!Number.isFinite(displayed) || displayed <= 0) return { ...output, reason: 'nonfinite_reciprocal' };
    const lower = positive(sourceInterval.ci_lower), upper = positive(sourceInterval.ci_upper);
    const boundsPresent = lower !== null && upper !== null && lower < upper && lower <= estimate && estimate <= upper;
    const displayedLower = boundsPresent ? reverse ? 1 / upper : lower : null;
    const displayedUpper = boundsPresent ? reverse ? 1 / lower : upper : null;
    const ciValid = boundsPresent && Number.isFinite(displayedLower) && Number.isFinite(displayedUpper) && displayedLower > 0 && displayedUpper > 0;
    const interval=ConfidenceIntervals.forDisplay({...comparison,ci_converted:false,ci_95_unavailable:false,original_ci:null,ci_level:sourceInterval.ci_level,measure,estimate:displayed,ci_lower:ciValid?displayedLower:null,ci_upper:ciValid?displayedUpper:null});
    // Colors retain their established meaning: the outcome at the TAIL.
    const better = endpoint?.polarity === 'higher' ? displayed < 1 : endpoint?.polarity === 'lower' ? displayed > 1 : false;
    const worse = endpoint?.polarity === 'higher' ? displayed > 1 : endpoint?.polarity === 'lower' ? displayed < 1 : false;
    return {
      ...output, ...interval, valid: true, estimate: displayed,
      ci_valid: ciValid&&!interval.ci_95_unavailable, ciExcludesNull: ciValid&&!interval.ci_95_unavailable ? interval.ci_upper < 1 || interval.ci_lower > 1 : null, reversed: reverse, derived: reverse,
      derivation: reverse ? 'Reciprocal for displayed head versus tail: 1 / reported estimate; CI [1 / reported upper, 1 / reported lower].' : null,
      tail_label: (reverse ? comparison.intervention : comparison.comparator).label || null,
      head_label: (reverse ? comparison.comparator : comparison.intervention).label || null,
      direction: better ? 'better' : worse ? 'worse' : 'neutral',
      reason: !endpoint ? 'unknown_endpoint_polarity' : displayed === 1 ? 'equal_point_estimate' : null,
    };
  }
  const styles = Object.freeze({
    better: Object.freeze({ state: 'better', color: '#2563eb' }),
    worse: Object.freeze({ state: 'worse', color: '#dc2626' }),
    neutral: Object.freeze({ state: 'neutral', color: '#9ca3af' }),
  });
  function effectStyle(kind, direction) {
    if ((kind === 'parallel' || kind === 'addon') && (direction === 'better' || direction === 'worse')) return styles[direction];
    return styles.neutral;
  }
  return Object.freeze({ endpoints, endpointKey, comparisonMatchesEndpoint, availableEndpointOptions, measureKey, armId, directedEffect, styles, effectStyle });
});
