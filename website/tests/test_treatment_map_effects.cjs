'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const effects = require('../dist/treatment_map_effects.js');
const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const source = (overrides = {}) => ({
  id: 'source-effect', outcome: 'OS', measure: 'HR', estimate: 0.7, ci_lower: 0.6, ci_upper: 0.9, ci_level: 95,
  intervention: { node_id: 'ab', label: 'Agent A + Agent B' }, comparator: { node_id: 'a', label: 'Agent A' },
  direction: 'intervention versus comparator', ...overrides,
});

test('endpoint choices retain full names and separate reported OR from requested RR', () => {
  const options = effects.availableEndpointOptions([source(), source({ outcome: 'ORR', measure: 'OR', estimate: 1.8 }), source({ outcome: 'DCR', measure: 'OR', estimate: 2 })]);
  assert.deepEqual(options.map((option) => option.key), ['OS:HR', 'ORR:RR', 'ORR:OR', 'DCR:OR']);
  assert.equal(options.find((option) => option.key === 'OS:HR').label, 'Overall survival (OS)');
  assert.equal(options.find((option) => option.key === 'ORR:RR').disabled, true);
  assert.equal(options.find((option) => option.key === 'ORR:RR').count, 0);
  assert.match(options.find((option) => option.key === 'ORR:OR').label, /Objective response rate \(ORR\).*OR$/);
  const empty = effects.availableEndpointOptions([]);
  assert.deepEqual(empty.map((option) => [option.key, option.count, option.disabled]), [['OS:HR', 0, false], ['ORR:RR', 0, true]]);
});

test('endpoint matching accepts explicit aliases without broad outcome inference or measure substitution', () => {
  for (const outcome of ['OS', 'Overall survival', 'Overall survival (OS)']) assert.equal(effects.endpointKey(source({ outcome })), 'OS:HR');
  assert.equal(effects.endpointKey(source({ outcome: 'Progression–free survival', measure: 'hazard ratio' })), 'PFS:HR');
  assert.equal(effects.endpointKey(source({ outcome: 'ORR', measure: 'RR' })), 'ORR:RR');
  assert.equal(effects.endpointKey(source({ outcome: 'ORR', measure: 'OR' })), 'ORR:OR');
  assert.equal(effects.comparisonMatchesEndpoint(source({ outcome: 'ORR', measure: 'OR' }), 'ORR:RR'), false);
  for (const bad of [{ outcome: 'Survival' }, { outcome: 'Median OS' }, { outcome: 'Intracranial ORR', measure: 'RR' }, { outcome: 'PFS', measure: 'OR' }, { outcome: 'OS', measure: 'RR' }, { measure: 'log HR' }]) assert.equal(effects.endpointKey(source(bad)), null);
  assert.equal(effects.comparisonMatchesEndpoint(source(), null), false);
  assert.equal(effects.endpointKey(null), null);
});

test('calculated binary endpoints preserve the clinical event, grade, time and ratio measure',()=>{
  const safety=(definition,measure,time)=>source({measure,outcome:'AE_grade_ge3',calculation:{outcome_context:{definition,assessment_time:time,time_unit:'weeks',safety_attribution:'treatment_related'}}});
  const different=[safety('Neutropenia','RR',6),safety('Thrombocytopenia','RR',6),safety('Neutropenia','OR',6),safety('Neutropenia','RR',12)];
  const keys=different.map(effects.endpointKey);assert.equal(new Set(keys).size,4);
  for(const comparison of different){
    assert.equal(effects.directedEffect(comparison,'a','ab').direction,'worse');
    assert.ok(effects.availableEndpointOptions(different).find(o=>o.key===effects.endpointKey(comparison)&&o.label.includes('weeks')));
  }
  assert.equal(effects.endpointKey(source({outcome:'ORR',measure:'RR',calculation:{outcome_context:{definition:'Objective response rate'}}})),'ORR:RR');
  assert.notEqual(effects.endpointKey(source({outcome:'ORR',measure:'RR',outcome_definition:'Intracranial objective response rate'})),'ORR:RR');
});

test('arrow head versus tail shows reported AB/A and reverses only when the arrow reverses', () => {
  const original = freeze(source()), before = JSON.stringify(original);
  const reverse = effects.directedEffect(original, 'ab', 'a');
  assert.equal(reverse.valid, true); assert.equal(reverse.estimate, 1 / 0.7);
  assert.equal(reverse.ci_lower, 1 / 0.9); assert.equal(reverse.ci_upper, 1 / 0.6);
  assert.equal(reverse.ci_level, 95); assert.equal(reverse.ci_valid, true);
  assert.equal(reverse.reversed, true); assert.equal(reverse.derived, true); assert.match(reverse.derivation, /Reciprocal/);
  assert.equal(reverse.direction, 'better'); assert.equal(reverse.tail_label, 'Agent A + Agent B'); assert.equal(reverse.head_label, 'Agent A');
  assert.equal(effects.effectStyle('addon', reverse.direction).state, 'better');
  assert.equal(reverse.original, original); assert.equal(JSON.stringify(original), before);
  const forward = effects.directedEffect(original, 'a', 'ab');
  assert.equal(forward.estimate, 0.7); assert.equal(forward.ci_lower, 0.6); assert.equal(forward.ci_upper, 0.9);
  assert.equal(forward.derived, false); assert.equal(forward.reversed, false); assert.equal(forward.derivation, null); assert.equal(forward.direction, 'worse');
});

test('all three ratio measures standardize non-95 intervals and reciprocate source and display bounds together', () => {
  for (const [outcome, measure] of [['OS', 'HR'], ['ORR', 'RR'], ['ORR', 'OR']]) {
    const original = source({ outcome, measure, estimate: 0.712345678901, ci_lower: 0.612345678901, ci_upper: 0.912345678901, ci_level: 99.5 });
    const forward = effects.directedEffect(original, 'a', 'ab'), reverse = effects.directedEffect(original, 'ab', 'a');
    assert.equal(forward.estimate, original.estimate); assert.equal(forward.measure, measure);
    assert.equal(reverse.estimate, 1 / original.estimate); assert.ok(Math.abs(reverse.ci_lower-1/forward.ci_upper)<1e-12); assert.ok(Math.abs(reverse.ci_upper-1/forward.ci_lower)<1e-12);
    assert.equal(reverse.original_ci.ci_lower,1/original.ci_upper); assert.equal(reverse.original_ci.ci_upper,1/original.ci_lower);
    assert.equal(reverse.ci_level, 95); assert.equal(reverse.original_ci.ci_level,99.5); assert.equal(reverse.ci_converted,true); assert.equal(reverse.measure, measure);
  }
});

test('benefit polarity follows the actual endpoint rather than always treating a lower ratio as better', () => {
  for (const endpoint of ['OS', 'PFS', 'DFS', 'RFS', 'DSS', 'DMFS', 'DOR']) assert.equal(effects.directedEffect(source({ outcome: endpoint }), 'ab', 'a').direction, 'better', endpoint);
  for (const outcome of ['ORR', 'DCR']) {
    for (const measure of ['RR', 'OR']) {
      assert.equal(effects.directedEffect(source({ outcome, measure }), 'ab', 'a').direction, 'worse');
      assert.equal(effects.directedEffect(source({ outcome, measure }), 'a', 'ab').direction, 'better');
    }
  }
  for (const measure of ['RR', 'OR']) {
    assert.equal(effects.directedEffect(source({ outcome: 'AE', measure }), 'ab', 'a').direction, 'better');
    assert.equal(effects.directedEffect(source({ outcome: 'Treatment-related adverse events', measure }), 'a', 'ab').direction, 'worse');
  }
});

test('unknown polarity and a null point effect remain neutral, while CI crossing one does not reverse point direction', () => {
  const unknown = effects.directedEffect(source({ outcome: 'Unclassified endpoint' }), 'ab', 'a');
  assert.equal(unknown.valid, true); assert.equal(unknown.estimate, 1 / 0.7); assert.equal(unknown.direction, 'neutral'); assert.equal(unknown.reason, 'unknown_endpoint_polarity');
  assert.equal(effects.directedEffect(source({ estimate: 1, ci_lower: 0.8, ci_upper: 1.2 }), 'ab', 'a').direction, 'neutral');
  const crossing = effects.directedEffect(source({ ci_upper: 1.5 }), 'ab', 'a');
  assert.equal(crossing.ci_lower, 1 / 1.5); assert.equal(crossing.direction, 'better');
});

test('invalid estimates, unsupported measures and unmatched complete regimens cannot generate colored effects', () => {
  for (const estimate of [null, undefined, '', ' ', 0, -0.7, NaN, Infinity, -Infinity, true, false, 'not estimable']) {
    const result = effects.directedEffect(source({ estimate }), 'a', 'ab');
    assert.equal(result.valid, false, String(estimate)); assert.equal(result.estimate, null); assert.equal(result.direction, 'neutral');
  }
  for (const measure of ['Median', 'Rate', 'Percentage', 'log HR', 'constructor', undefined]) assert.equal(effects.directedEffect(source({ measure }), 'ab', 'a').valid, false);
  for (const [tail, head] of [['b', 'a'], ['a', 'b'], ['a', 'a'], ['ab', 'c'], [null, 'ab']]) assert.equal(effects.directedEffect(source(), tail, head).reason, 'unmatched_complete_arms');
  assert.equal(effects.directedEffect(source({ estimate: Number.MIN_VALUE }), 'ab', 'a').reason, 'nonfinite_reciprocal');
  assert.equal(effects.directedEffect(null, 'a', 'b').valid, false);
});

test('partial, nonpositive, unordered or incompatible confidence bounds are withheld together, with source intact', () => {
  for (const bounds of [{ ci_lower: null }, { ci_upper: null }, { ci_lower: 0 }, { ci_lower: 0.9, ci_upper: 0.6 }, { ci_lower: 0.8, ci_upper: 0.9 }, { ci_lower: 'unknown' }, { ci_lower: Number.MIN_VALUE }]) {
    const original = freeze(source(bounds)), before = JSON.stringify(original), result = effects.directedEffect(original, 'ab', 'a');
    assert.equal(result.valid, true); assert.equal(result.ci_valid, false); assert.equal(result.ci_lower, null); assert.equal(result.ci_upper, null);
    assert.equal(result.original, original); assert.equal(JSON.stringify(original), before);
  }
  const noLevel = effects.directedEffect(source({ ci_level: undefined }), 'a', 'ab'); assert.equal(noLevel.ci_level, null);
});

test('neutral controls use the same stable display identity and retain original repeated-placebo source labels', () => {
  const original = source({ comparator: { node_id: null, label: 'PLACEBO + placebo' } });
  assert.equal(effects.armId(original.comparator), 'control:placebo');
  const inverse = effects.directedEffect(original, 'control:placebo', 'ab');
  assert.equal(inverse.valid, true); assert.equal(inverse.estimate, 0.7); assert.equal(inverse.original.comparator.label, 'PLACEBO + placebo');
  for (const label of ['placebo or placebo', 'placebo → placebo', 'drug + placebo']) assert.notEqual(effects.armId({ label }), 'control:placebo');
  assert.equal(effects.armId({ node_id: 'agent:a', label: 'Any source label' }), 'agent:a');
});

test('both comparison kinds use blue for better and red for worse at the tail, with neutral gray', () => {
  assert.deepEqual(effects.effectStyle('parallel', 'better'), { state: 'better', color: '#2563eb' });
  assert.deepEqual(effects.effectStyle('parallel', 'worse'), { state: 'worse', color: '#dc2626' });
  assert.deepEqual(effects.effectStyle('addon', 'better'), { state: 'better', color: '#2563eb' });
  assert.deepEqual(effects.effectStyle('addon', 'worse'), { state: 'worse', color: '#dc2626' });
  for (const [kind, direction] of [['parallel', 'neutral'], ['addon', 'neutral'], ['contains', 'better'], ['parallel', undefined]]) assert.deepEqual(effects.effectStyle(kind, direction), { state: 'neutral', color: '#9ca3af' });
});

test('all prepared comparisons keep their original measures and precise source tuples through direction changes', (t) => {
  const graph = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/data/treatment_map.json'), 'utf8')), before = JSON.stringify(graph.comparisons);
  const seen = new Map();
  for (const comparison of graph.comparisons) {
    const key = effects.endpointKey(comparison); assert.ok(key, `explicit endpoint/measure for ${comparison.id}`);
    seen.set(key, (seen.get(key) || 0) + 1);
    const intervention = effects.armId(comparison.intervention), comparator = effects.armId(comparison.comparator);
    const forward = effects.directedEffect(comparison, comparator, intervention), reverse = effects.directedEffect(comparison, intervention, comparator);
    assert.equal(forward.valid, true); assert.equal(reverse.valid, true);
    assert.equal(forward.estimate, comparison.estimate); assert.equal(reverse.estimate, 1 / comparison.estimate);
    assert.equal(forward.measure, comparison.measure); assert.equal(reverse.measure, comparison.measure);
    assert.equal(forward.original, comparison); assert.equal(reverse.original, comparison);
  }
  assert.equal(JSON.stringify(graph.comparisons), before);
  const options = effects.availableEndpointOptions(graph.comparisons);
  assert.equal(options.find((option) => option.key === 'ORR:RR').count, seen.get('ORR:RR') || 0);
  assert.equal(options.find((option) => option.key === 'ORR:OR').count, seen.get('ORR:OR'));
  t.diagnostic(`Checked ${graph.comparisons.length} original comparison tuples in both directions.`);
});

test('confidence-interval null exclusion is strict, independent of benefit polarity, and invariant under reciprocation', () => {
  for (const [outcome, measure] of [['OS', 'HR'], ['ORR', 'RR'], ['ORR', 'OR']]) {
    for (const [estimate, lower, upper, expected] of [[0.7, 0.5, 0.9, true], [1.4, 1.1, 1.8, true], [0.9, 0.7, 1.2, false], [0.8, 0.6, 1, false], [1.2, 1, 1.5, false]]) {
      const original = freeze(source({ outcome, measure, estimate, ci_lower: lower, ci_upper: upper })), before = JSON.stringify(original);
      const forward = effects.directedEffect(original, 'a', 'ab'), reverse = effects.directedEffect(original, 'ab', 'a');
      assert.equal(forward.ciExcludesNull, expected, `${outcome} ${measure} ${lower}–${upper}`);
      assert.equal(reverse.ciExcludesNull, expected, 'reciprocation cannot change whether a ratio interval excludes one');
      assert.equal(JSON.stringify(original), before);
    }
  }
});

test('missing, malformed and degenerate confidence intervals have unknown null exclusion rather than a significance flag', () => {
  for (const bounds of [{ ci_lower: null }, { ci_upper: null }, { ci_lower: 0 }, { ci_lower: 0.9, ci_upper: 0.5 }, { ci_lower: 0.8, ci_upper: 0.9 }, { ci_lower: 0.7, ci_upper: 0.7 }, { ci_lower: NaN }]) {
    const result = effects.directedEffect(source(bounds), 'ab', 'a');
    assert.equal(result.ciExcludesNull, null); assert.equal(result.ci_valid, false);
  }
  assert.equal(effects.directedEffect(source({ estimate: null }), 'ab', 'a').ciExcludesNull, null);
  assert.equal(effects.directedEffect(source(), 'unknown', 'a').ciExcludesNull, null);
});
