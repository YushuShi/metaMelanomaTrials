'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Planning = require('../dist/treatment_map_planning.js');
const close = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);
const refs = (stage = 'R3', hash = 'verified-source') => [{ report_id: 'report-' + stage, stage, source_sha256: hash }];
const rate = (role, extra = {}) => ({ id: 'rate-' + role, kind: 'survival_probability', outcome: 'PFS', population_id: 'overall',
  arm_role: role, probability: role === 'comparator' ? 0.32 : 0.39, time_months: 36, cutoff: '2017-05-24', label: 'Investigator-assessed PFS',
  source_refs: refs(), ...extra });
const comparison = (rates = [rate('intervention'), rate('comparator')]) => ({ id: 'c', pmid: '28889792', outcome: 'PFS', measure: 'HR', estimate: 0.78,
  intervention: { node_id: 'ab', label: 'Ipilimumab + Nivolumab' }, comparator: { node_id: 'a', label: 'Nivolumab' }, analysis: { planning_assumptions: rates } });
const table = (c, extra = {}) => Planning.tableRows([c], { tailId: 'a', headId: 'ab', measure: 'HR', ...extra });

test('the displayed integer event target and actual event denominator reproduce HR enrollment', () => {
  for (const arms of [1, 2]) for (const allocation of [1, 2]) {
    const [row] = table(comparison(), { arms, allocation, pooledEffect: 0.7, dropout: 0.1 });
    for (const result of [row.own, row.pooled]) {
      assert.ok(result.events > 0 && result.event_rate > 0);
      assert.equal(result.n_before_dropout, Math.ceil(result.events / result.event_rate));
      assert.equal(result.n, Math.ceil(result.n_before_dropout / 0.9));
      assert.equal(result.dropout, 0.1);
      const denominator = arms === 1 ? (result.p0 + result.p1) / 2 : (result.p0 + allocation * result.p1) / (1 + allocation);
      close(result.event_rate, denominator);
    }
    close(row.own.p0, 0.68); close(row.pooled.p0, 0.68);
    assert.notEqual(row.own.event_rate, row.pooled.event_rate, 'each HR implies its own planned-arm probability under the same reported baseline');
  }
  const result = Planning.calculate(0.7, 'HR', { kind: 'overall_event_fraction', probability: 0.4 });
  assert.equal(result.events, 247); assert.equal(result.n, 618); close(result.event_rate, 0.4);
  assert.equal(result.event_rate_basis, 'reported_overall_event_fraction');
});

test('matching observed arm survival rates produce one reference scenario and retain both original sources', () => {
  const c = comparison(), before = JSON.stringify(c), rows = table(c, { pooledEffect: 0.7 });
  assert.equal(rows.length, 1); const row = rows[0], a = row.assumption;
  assert.equal(a.kind, 'reference_probability'); assert.equal(a.matched_reported_pair, true);
  close(a.reported_reference_probability, 0.68); close(a.reported_target_probability, 0.61);
  assert.equal(a.reported_reference_source, c.analysis.planning_assumptions[1]);
  assert.equal(a.reported_target_source, c.analysis.planning_assumptions[0]);
  assert.equal(a.reported_reference_source.probability, 0.32); assert.equal(a.reported_target_source.probability, 0.39);
  assert.doesNotMatch(a.label, /derived once/); close(row.own.p0, 0.68);
  close(row.own.p1, 0.5888342005676557); close(row.own.event_rate, 0.6344171002838278);
  assert.equal(row.own.events, 509); assert.equal(row.own.n, 803);
  assert.equal(row.own.event_rate_basis, 'allocation_weighted_model_event_probabilities');
  assert.notEqual(row.own.p1, a.reported_target_probability, 'a model-implied planning probability is not rewritten as the reported arm rate');
  assert.equal(JSON.stringify(c), before);
});

test('changing the planned arm uses its actual opposite reference rather than retaining a derived baseline', () => {
  const c = comparison(), [row] = table(c, { tailId: 'ab', headId: 'a' });
  close(row.effect, 1 / 0.78); close(row.own.p0, 0.61);
  close(row.assumption.reported_reference_probability, 0.61); close(row.assumption.reported_target_probability, 0.68);
  assert.equal(row.assumption.reported_reference_source.arm_role, 'intervention');
  assert.equal(row.assumption.reported_target_source.arm_role, 'comparator');
  assert.equal(row.assumption.matched_reported_pair, true);
});

test('genuinely different source populations, follow-up, assessment, criteria or cutoffs remain separate scenarios', () => {
  for (const difference of [{ population_id: 'subgroup' }, { time_months: 24 }, { cutoff: '2018-05-24' }, { cutoff: null },
    { label: 'Blinded central-review PFS' }, { response_criteria: 'iRECIST' }, { source_refs: refs('R2', 'abstract-source') }]) {
    const c = comparison([rate('intervention', difference), rate('comparator')]);
    assert.equal(table(c).length, 2, JSON.stringify(difference));
  }
  const missingPopulation = comparison([rate('intervention', { population_id: null }), rate('comparator', { population_id: null })]);
  assert.equal(table(missingPopulation).length, 2, 'matching document and equal rates do not establish an absent population identity');
  const equalDate = comparison([rate('intervention', { cutoff: 'May 24, 2017; minimum follow-up 36 months' }), rate('comparator')]);
  assert.equal(table(equalDate).length, 1, 'two explicit equal calendar dates can normalize without inventing a date');
});

test('duplicate source-backed rates merge references while equal rates from independent source contexts do not', () => {
  const reference = rate('comparator'), duplicate = rate('comparator', { id: 'another-extraction', source_refs: [...refs(), { ...refs()[0], record_id: 'second-rate' }] });
  let rows = table(comparison([rate('intervention'), reference, duplicate]));
  assert.equal(rows.length, 1); assert.ok(rows[0].assumption.merged_assumption_ids.includes('another-extraction')); assert.equal(rows[0].assumption.source_refs.length, 2);
  const abstract = rate('comparator', { id: 'r2-rate', source_refs: refs('R2', 'abstract-source'), source_record_ids: ['certified-same-rate'] });
  const full = rate('comparator', { id: 'r3-rate', source_record_ids: ['certified-same-rate'] });
  rows = table(comparison([rate('intervention'), abstract, full])); assert.equal(rows.length, 1); assert.ok(rows[0].assumption.source_refs.some(ref => ref.stage === 'R2')); assert.ok(rows[0].assumption.source_refs.some(ref => ref.stage === 'R3'));
  delete abstract.source_record_ids; delete full.source_record_ids;
  assert.equal(table(comparison([abstract, full])).length, 2, 'same numerical rate is not a source link');
  assert.equal(table(comparison([rate('comparator', { id: 'large-analysis', n: 100 }), rate('comparator', { id: 'small-analysis', n: 50 })])).length, 2,
    'equal probabilities with genuinely different known analysis denominators retain both source contexts');
});

test('competing reported rates are retained instead of arbitrarily deciding which one matches', () => {
  const rows = table(comparison([rate('comparator'), rate('intervention'), rate('intervention', { id: 'different-target', probability: 0.42 })]));
  assert.equal(rows.length, 3); assert.ok(rows.every(row => row.assumption.matched_reported_pair !== true));
});

test('target-only fallback remains explicit, with original survival rate distinct from its inferred reference probability', () => {
  const c = comparison([rate('intervention')]), [row] = table(c, { pooledEffect: 0.7 });
  assert.equal(row.assumption.provenance, 'derived_reference_probability');
  assert.equal(row.assumption.reported_reference_probability, null); close(row.assumption.reported_target_probability, 0.61);
  assert.equal(row.assumption.reported_target_source.probability, 0.39); close(row.own.p0, 1 - Math.pow(0.39, 1 / 0.78));
  close(row.own.p0, row.pooled.p0); assert.match(row.assumption.label, /reference derived once/);
});

test('binary and one-arm precision enrollment never display a fictitious E/event-rate denominator', () => {
  const binary = Planning.calculate(2, 'RR', { kind: 'reference_probability', probability: 0.2 });
  assert.ok(binary.n > 0); assert.equal(binary.events, null); assert.equal(binary.event_rate, null); assert.equal(binary.event_rate_basis, null);
  const precision = Planning.calculate(null, 'HR', { kind: 'expected_probability', probability: 0.3, fixed_time: true, time_months: 12 }, { arms: 1, mode: 'precision' });
  assert.ok(precision.n > 0); assert.equal(precision.events, null); assert.equal(precision.event_rate, null);
});

test('actual CheckMate067 PFS source keeps 39% and 32%, with one supported reference-based event denominator', () => {
  const graph = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/data/treatment_map.json'), 'utf8'));
  const c = graph.comparisons.find(row => row.id === 'effect:4813f641f5c4dd7783b285ad'); assert.ok(c);
  const before = JSON.stringify(c), rows = table(c, { tailId: c.comparator.node_id, headId: c.intervention.node_id });
  assert.equal(rows.length, 1); assert.equal(rows[0].assumption.reported_reference_source.probability, 0.32); assert.equal(rows[0].assumption.reported_target_source.probability, 0.39);
  close(rows[0].own.event_rate, 0.6344171002838278); assert.equal(rows[0].own.events, 509); assert.equal(rows[0].own.n, 803);
  assert.equal(JSON.stringify(c), before);
});

test('a manual baseline keeps uniquely matched reported rates as context without treating them as evidence for the entered rate', () => {
  const c = comparison(), before = JSON.stringify(c);
  const [row] = table(c, { manualProbability: 0.5, manualHorizon: 36 });
  assert.equal(row.assumption.provenance, 'user_specified'); assert.equal(row.assumption.reported_context_only, true);
  assert.deepEqual(row.assumption.source_refs, []); assert.equal(row.assumption.reported_reference_source.probability, 0.32); assert.equal(row.assumption.reported_target_source.probability, 0.39);
  close(row.assumption.reported_reference_probability, 0.68); close(row.assumption.reported_target_probability, 0.61);
  close(row.own.p0, 0.5); assert.equal(row.own.n, 1110); assert.equal(JSON.stringify(c), before);
  for (const horizon of [12, null]) {
    const [other] = table(c, { manualProbability: 0.5, manualHorizon: horizon });
    assert.equal(other.assumption.reported_context_only, undefined); assert.equal(other.assumption.reported_reference_source, undefined); assert.equal(other.assumption.reported_target_source, undefined);
    close(other.own.p0, 0.5);
  }
});

test('manual expected-rate precision preserves matching source context while calculation depends only on the entered target', () => {
  const c = comparison(), [row] = table(c, { arms: 1, mode: 'precision', manualExpectedProbability: 0.3, manualHorizon: 36, pooledEffect: 0.6 });
  assert.equal(row.assumption.kind, 'expected_probability'); assert.equal(row.assumption.reported_context_only, true);
  assert.equal(row.assumption.reported_reference_source.probability, 0.32); assert.equal(row.assumption.reported_target_source.probability, 0.39);
  assert.deepEqual(row.assumption.source_refs, []); assert.equal(row.own.p0, null); close(row.own.p1, 0.3); close(row.pooled.p1, 0.3); assert.equal(row.own.n, row.pooled.n);
  const [other] = table(c, { arms: 1, mode: 'precision', manualExpectedProbability: 0.3, manualHorizon: 12 });
  assert.equal(other.assumption.reported_context_only, undefined); assert.equal(other.assumption.reported_reference_source, undefined);
});

test('manual scenarios cannot inherit rates from ambiguous same-horizon source contexts', () => {
  const c = comparison([rate('comparator'), rate('intervention'), rate('comparator', { id: 'other-population', population_id: 'subgroup', probability: 0.5 })]);
  const [row] = table(c, { manualProbability: 0.5, manualHorizon: 36 });
  assert.equal(row.assumption.provenance, 'user_specified'); assert.equal(row.assumption.reported_context_only, undefined); assert.equal(row.assumption.reported_reference_source, undefined);
  const conflicting = comparison([rate('comparator'), rate('intervention'), rate('intervention', { id: 'conflicting-target', probability: 0.42 })]);
  assert.equal(table(conflicting, { manualProbability: 0.5, manualHorizon: 36 })[0].assumption.reported_context_only, undefined);
});
