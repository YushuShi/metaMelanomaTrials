const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sampleSizeDisplay } = require('../dist/evidence_display.js');
const identity = { report_id: 'report-' + 'a'.repeat(24), reviewer: 'Sol', source_input_sha256: 'b'.repeat(64), source_packet_sha256: 'c'.repeat(64) };
const anchor = { source_id: 'source', block_id: 'b1', locator: 'Results', supporting_quote: '100 participants were randomly assigned,50 in each group.' };
const number = (v, extra = {}) => ({ status: 'reported', value: v, raw_text: String(v), unit: 'participants', qualifier: 'equal', evidence_ids: ['E1'], ...extra });
const missing = () => ({ status: 'not_reported', value: null, raw_text: null, unit: null, qualifier: 'not_reported', evidence_ids: [] });
const row = (extra = {}) => ({ ...identity, analysis_id: 'model1', population_id: 'p', measure: 'HR', analysis_n: missing(), denominator: missing(),
  population: { population_id: 'p', parent_population_id: null, description: { text: 'All randomized trial participants' }, arm_ids: ['A', 'B'] },
  analysis: { analysis_id: 'model1', population_id: 'p', experimental_arm_ids: ['A'], comparator_arm_ids: ['B'] }, evidence: [anchor], ...extra });
const sample = (n, extra = {}) => ({ ...identity, sample_record_id: 'N' + n, population_id: 'p', arm_id: null, denominator_type: 'randomized',
  quantity_label: 'randomized participants', counting_unit: 'participants', n: number(n), evidence: [anchor], ...extra });
test('UMD exports the same pure API to a browser global', () => {
  const vm = require('node:vm'), context = {};
  vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/evidence_display.js'), 'utf8'), context);
  assert.equal(typeof context.EvidenceDisplay.sampleSizeDisplay, 'function');
  assert.equal(context.EvidenceDisplay.sampleSizeDisplay({}).text, '—');
});

test('explicit own analysis N takes precedence, including zero, with original source wrappers retained', () => {
  const r = row({ analysis_n: number(0), report_samples: [sample(100)] });
  const before = JSON.stringify(r), result = sampleSizeDisplay(r);
  assert.equal(result.text, '0'); assert.equal(result.basis, 'explicit_analysis_n');
  assert.deepEqual(result.values[0].fact, r.analysis_n); assert.deepEqual(result.sources, [anchor]);
  assert.equal(JSON.stringify(r), before);
});
test('missing, booleans, negative/fractional and unsupported statuses do not become an N', () => {
  for (const bad of [number(true), number(-1), number(1.5), number(100, { unit: 'months' }), number(100, { status: 'not_applicable' }), missing()])
    assert.equal(sampleSizeDisplay(row({ analysis_n: bad })).text, '—');
});
test('explicit participants denominator is the N for the reported safety/count outcome', () => {
  const r = row({ measure: 'participant_count', denominator: number(247), denominator_type: 'safety', report_samples: [sample(132)] });
  assert.equal(sampleSizeDisplay(r).text, '247');
  assert.equal(sampleSizeDisplay(r).basis, 'explicit_outcome_denominator');
});
test('episodes denominator and a comparative HR denominator are not silently treated as participant N', () => {
  assert.equal(sampleSizeDisplay(row({ measure: 'event_episode_count', denominator: number(6, { unit: 'event episodes' }), denominator_type: 'safety' })).text, '—');
  assert.equal(sampleSizeDisplay(row({ denominator: number(247), denominator_type: 'safety' })).text, '—');
});
test('own population randomized total is used without a category label', () => {
  const result = sampleSizeDisplay(row({ report_samples: [sample(100)] }));
  assert.equal(result.text, '100'); assert.doesNotMatch(result.text, /Analysis|Randomized/i);
});
test('exact report reviewer source and artifact version are mandatory for fallback', () => {
  for (const change of [{ report_id: 'other' }, { reviewer: 'Opus' }, { source_input_sha256: 'd'.repeat(64) }, { source_packet_sha256: 'e'.repeat(64) }])
    assert.equal(sampleSizeDisplay(row({ report_samples: [sample(100, change)] })).text, '—');
});
test('foreign inline analysis provenance is not accepted as own analysis N', () => {
  assert.equal(sampleSizeDisplay(row({ analysis_n: number(100, { source_input_sha256: 'foreign' }) })).text, '—');
  assert.equal(sampleSizeDisplay(row({ analysis_n: number(100, { analysis_id: 'another-model' }) })).text, '—');
});
test('other population, unknown scope and reused arm IDs across cohorts are rejected', () => {
  const r = row({ population: { population_id: 'p', parent_population_id: 'all', description: { text: 'cohort 2' }, arm_ids: ['A', 'B'] } });
  assert.equal(sampleSizeDisplay({ ...r, report_samples: [sample(498, { population_id: 'all' })] }).text, '—');
  assert.equal(sampleSizeDisplay({ ...r, report_samples: [sample(249, { population_id: null, arm_id: 'A' })] }).text, '—');
});
test('global randomized arm counts may be used for an explicit nonsubgroup full-trial population', () => {
  const samples = [sample(50, { population_id: null, arm_id: 'A' }), sample(50, { population_id: null, arm_id: 'B' })];
  assert.equal(sampleSizeDisplay(row(), samples).text, '50 / 50');
});
test('all patients wording does not establish whole-trial scope for an unlinked subgroup', () => {
  const r = row({ population: { population_id: 'p', parent_population_id: null, description: { text: 'All PD-L1-positive patients' }, arm_ids: ['A', 'B'] } });
  assert.equal(sampleSizeDisplay(r, [sample(498, { population_id: null })]).text, '—');
});
test('two arms are not summed when no explicit total is reported; missing arm remains explicit', () => {
  const r = row({ population: { population_id: 'p', parent_population_id: 'all', description: { text: 'cohort 2' }, arm_ids: ['A', 'B'] } });
  const a = sample(93, { arm_id: 'A' }), b = sample(91, { arm_id: 'B' });
  assert.equal(sampleSizeDisplay(r, [a, b]).text, '93 / 91');
  assert.equal(sampleSizeDisplay(r, [a]).text, '93 / —');
});
test('explicit scoped cohort total can accompany assignment proof without arithmetic', () => {
  const r = row({ population: { population_id: 'p', parent_population_id: 'all', description: { text: 'cohort 2' }, arm_ids: ['A', 'B'] } });
  const total = sample(184, { denominator_type: 'recruited', quantity_label: 'cohort 2 enrolled' });
  const a = sample(93, { arm_id: 'A' }), b = sample(91, { arm_id: 'B' });
  assert.equal(sampleSizeDisplay(r, [total, a, b]).text, '184');
  assert.equal(sampleSizeDisplay(r, [total]).text, '—');
});
test('safety/treated/evaluable and planned sample sizes are not randomized fallbacks', () => {
  for (const role of ['safety', 'treated', 'evaluable']) assert.equal(sampleSizeDisplay(row(), [sample(247, { denominator_type: role })]).text, '—');
  assert.equal(sampleSizeDisplay(row(), [sample(100, { scope: 'planned' })]).text, '—');
  assert.equal(sampleSizeDisplay(row(), [sample(100, { scope: 'unclear' })]).text, '—');
  assert.equal(sampleSizeDisplay(row(), [sample(100, { quantity_label: 'planned randomized sample size' })]).text, '—');
  assert.equal(sampleSizeDisplay(row(), [sample(100, { denominator_type: 'other', quantity_label: 'non-randomized participants' })]).text, '—');
});
test('unknown API role may use explicitly assigned label and own population link with source evidence', () => {
  const s = sample(93, { population_id: null, arm_id: null, denominator_type: 'other', quantity_label: 'participants assigned to arm A',
    original_fact: { scope: 'observed', links: [{ role: 'population', entity_id: 'p' }, { role: 'experimental_arm', entity_id: 'A' }] } });
  assert.equal(sampleSizeDisplay(row(), [s]).text, '93 / —');
  assert.equal(sampleSizeDisplay(row(), [{ ...s, n: { ...s.n, evidence_ids: [] }, evidence: [] }]).text, '—');
});
test('conflicting explicit same-scope totals or same-arm values remain unresolved', () => {
  assert.equal(sampleSizeDisplay(row(), [sample(100), sample(101)]).text, '—');
  assert.equal(sampleSizeDisplay(row(), [sample(50, { arm_id: 'A' }), sample(51, { arm_id: 'A' })]).text, '—');
});
test('exact population and single-arm scope prevent a cohort total being assigned to one arm', () => {
  const r = row({ arm_id: 'A', population: { population_id: 'p', parent_population_id: 'all', description: { text: 'cohort 2' }, arm_ids: ['A', 'B'] } });
  assert.equal(sampleSizeDisplay(r, [sample(184), sample(93, { arm_id: 'A' })]).text, '93');
});
test('inequalities and unclear source status remain in the compact N string', () => {
  assert.equal(sampleSizeDisplay(row({ analysis_n: number(100, { qualifier: 'greater_or_equal' }) })).text, '≥100');
  assert.equal(sampleSizeDisplay(row({ analysis_n: number(100, { status: 'unclear' }) })).text, '100 (unclear)');
});
test('source IDs may be resolved into original anchors; no invented source passage', () => {
  const s = sample(100, { evidence: [] }), r = row({ evidence: [] });
  assert.deepEqual(sampleSizeDisplay(r, { samples: [s], evidenceRegistry: { E1: anchor } }).sources, [anchor]);
  assert.deepEqual(sampleSizeDisplay(r, [s]).sources, []);
});
test('joined original source anchors are retained when inline population count duplicates it', () => {
  const bare = sample(100, { evidence: [] });
  assert.deepEqual(sampleSizeDisplay(row({ population_counts: [bare], report_samples: [sample(100)] })).sources, [anchor]);
});
test('actual BRIM8 cohort2 displays explicit184, never global498 or safety247', () => {
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/data/studies.json'), 'utf8'));
  const study=payload.studies.find((s)=>s.report_id==='report-0359a45d3f5bf79a8f3e9331');
  const r = study.details.quantitative_results.find((v) => v.report_id === 'report-0359a45d3f5bf79a8f3e9331' && v.observation_id === 'c2-hr');
  const samples = study.details.sample_size_records;
  const before = JSON.stringify([r, samples]);
  const result = sampleSizeDisplay(r, { samples, evidenceRegistry: payload.evidence_registry });
  assert.equal(result.text, '184'); assert.ok(result.sources.length);
  assert.equal(JSON.stringify([r, samples]), before);
  const noTotal = samples.filter((s) => !(s.population_id === 'c2' && s.arm_id === null));
  assert.equal(sampleSizeDisplay({ ...r, population_counts: [] }, noTotal).text, '93 / 91');
});
