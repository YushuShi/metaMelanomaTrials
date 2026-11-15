'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Planning = require('../dist/treatment_map_planning.js');
const sourceRef = (sha = 'verified-source') => [{ report_id: 'report-1', stage: 'R3', source_sha256: sha }];
function fraction(role, extra = {}) {
  return { id: role, kind: 'event_fraction', outcome: 'OS', arm_role: role, probability: role === 'comparator' ? 0.4 : 0.3,
    time_months: 24, cutoff: '2025-01-01', source_refs: sourceRef(), ...extra };
}
function record(assumptions) {
  return { id: 'c', outcome: 'OS', measure: 'HR', estimate: 0.7,
    intervention: { node_id: 'B' }, comparator: { node_id: 'A' }, analysis: { planning_assumptions: assumptions } };
}

test('one-arm Wu event targets do not turn unmatched censoring into a defensible participant target', () => {
  const a = { kind: 'paired_event_fractions', reference_probability: 0.4, target_probability: 0.3 };
  for (const extra of [{}, { fixed_time: true }, { fixed_time: true, time_months: 0 }, { fixed_time: true, time_months: -1 }, { compatible_censoring: false }]) {
    const result = Planning.calculate(0.7, 'HR', { ...a, ...extra }, { arms: 1 });
    assert.ok(result.events > 0); assert.equal(result.n, null); assert.match(result.reason, /compatible censoring|complete follow-up/);
  }
  for (const extra of [{ compatible_censoring: true }, { fixed_time: true, time_months: 24 }]) {
    const result = Planning.calculate(0.7, 'HR', { ...a, ...extra }, { arms: 1 });
    assert.ok(result.n > 0); assert.equal(result.reason, null);
  }
});

test('same report and cutoff alone do not certify matching censoring or complete fixed-time follow-up', () => {
  const base = [fraction('comparator'), fraction('intervention')];
  let [a] = Planning.assumptions(record(base), 'A', 'B');
  assert.equal(a.compatible_censoring, false); assert.equal(a.fixed_time, false);
  assert.equal(Planning.calculate(0.7, 'HR', a, { arms: 1 }).n, null);
  [a] = Planning.assumptions(record([fraction('comparator', { compatible_censoring: true }), fraction('intervention')]), 'A', 'B');
  assert.equal(a.compatible_censoring, false);
  [a] = Planning.assumptions(record(base.map((value) => ({ ...value, compatible_censoring: true }))), 'A', 'B');
  assert.equal(a.compatible_censoring, true); assert.ok(Planning.calculate(0.7, 'HR', a, { arms: 1 }).n > 0);
  [a] = Planning.assumptions(record(base.map((value) => ({ ...value, fixed_time: true }))), 'A', 'B');
  assert.equal(a.fixed_time, true); assert.equal(a.time_months, 24);
});

test('censoring flags cannot bridge different event horizons, cutoffs or unshared source documents', () => {
  const first = fraction('comparator', { fixed_time: true, compatible_censoring: true });
  for (const changes of [{ time_months: 36 }, { cutoff: '2026-01-01' }, { source_refs: sourceRef('different-document') }]) {
    const second = fraction('intervention', { fixed_time: true, compatible_censoring: true, ...changes });
    assert.equal(Planning.assumptions(record([first, second]), 'A', 'B').length, 0);
  }
});

test('two-arm event-fraction scenarios preserve observed probabilities under own and pooled effects and endpoint reversal', () => {
  const c = record([fraction('comparator'), fraction('intervention')]), original = JSON.stringify(c);
  const [forward] = Planning.tableRows([c], { tailId: 'A', headId: 'B', measure: 'HR', pooledEffect: 0.8 });
  assert.ok(forward.own.n > 0); assert.ok(forward.pooled.n > forward.own.n);
  assert.equal(forward.own.p0, 0.4); assert.equal(forward.pooled.p0, 0.4);
  assert.equal(forward.own.p1, 0.3); assert.equal(forward.pooled.p1, 0.3);
  const [reverse] = Planning.tableRows([c], { tailId: 'B', headId: 'A', measure: 'HR', pooledEffect: 1 / 0.8 });
  assert.equal(reverse.own.p0, 0.3); assert.equal(reverse.own.p1, 0.4); assert.equal(reverse.own.n, forward.own.n);
  assert.equal(reverse.pooled.n, forward.pooled.n); assert.equal(JSON.stringify(c), original);
});
