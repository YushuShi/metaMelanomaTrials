'use strict';
const sampleProof=require('./fixtures/pooling_sample_size.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const Analysis = require('../dist/treatment_map_analysis.js');
const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const close = (actual, expected, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
function record(id, extra = {}) {
  return {
    id, pmid: 'PMID-' + id, study_id: 'NCT-' + id, study_name: 'Trial ' + id, year: 2024,
    intervention: { node_id: 'ab', label: 'A + B' }, comparator: { node_id: 'a', label: 'A' },
    outcome: 'OS', measure: 'HR', estimate: 0.7, ci_lower: 0.5, ci_upper: 0.9, ci_level: 95,
    source_refs: [{ pmid: 'PMID-' + id, stage: 'R2', effect_id: id }],
    analysis: { design: 'randomized_trial', independent_id: 'NCT-' + id, independence_verified: true, publication_year: 2024,
      source_completeness: 0, source_stages: ['R2'], sample_size:sampleProof(extra.pmid||'PMID-'+id), compatibility: { key: 'advanced-general-primary', label: 'Advanced melanoma · primary analysis', eligible: true } },
    ...extra,
  };
}
function updateAnalysis(source, changes) { return { ...source, analysis: { ...source.analysis, ...changes } }; }
const run = (records, extra = {}) => Analysis.analyze(records, { tailId: 'a', headId: 'ab', endpoint: 'OS:HR', ...extra });
function numericRow(id, y, variance) { return { id, study_id: id, label: id, pmid: id, log_estimate: y, variance, se: Math.sqrt(variance), estimate: Math.exp(y) }; }

test('multiple independent effects with fewer than two supported Ns use the latest individual fallback without pooling',()=>{
  for(const nCount of [0,1]){
    const older=updateAnalysis(record('older'),{publication_year:2023,...(nCount?{}:{sample_size:null})});
    const latest=updateAnalysis(record('latest',{estimate:.6,ci_lower:.4,ci_upper:.8}),{publication_year:2025,sample_size:null});
    const input=freeze([older,latest]),before=JSON.stringify(input),group=run(input).groups[0];
    assert.equal(group.pooled,null);
    assert.equal(group.selected.length,nCount,'missing N still excludes a study from pooled k');
    assert.equal(group.latest_fallback.row.id,'latest');
    assert.equal(group.latest_fallback.row.pooling_n,null);
    assert.equal(group.latest_fallback.row.included,false);
    assert.equal(group.latest_fallback.independent_studies,2);
    assert.equal(group.latest_fallback.sample_size_studies,nCount);
    assert.match(group.latest_fallback.note,/Not pooled/);
    assert.equal(group.latest_fallback.row.estimate,.6);
    assert.equal(JSON.stringify(input),before);
  }
});

test('fallback uses the latest same-cohort report without borrowing N from its older publication',()=>{
  const old=updateAnalysis(record('old'),{publication_year:2020});
  const followup=updateAnalysis(record('followup',{estimate:.6,ci_lower:.4,ci_upper:.8}),{publication_year:2026,independent_id:old.analysis.independent_id,sample_size:null});
  const other=updateAnalysis(record('other'),{publication_year:2024,sample_size:null});
  const group=run([old,followup,other]).groups[0];
  assert.equal(group.selected.length,1);
  assert.equal(group.selected[0].id,'old','pooling representative retains its supported N');
  assert.equal(group.latest_fallback.row.id,'followup');
  assert.equal(group.latest_fallback.independent_studies,2,'two publications of one cohort count once');
  assert.equal(group.latest_fallback.row.pooling_n,null,'no N is transferred between reports');
  assert.equal(run([old,followup]).groups[0].latest_fallback,undefined,'one independent study is not multiple studies');
});

test('fallback does not bypass pooling success, exclusions, incompatible contexts, filters or missing precision',()=>{
  const old=updateAnalysis(record('old'),{publication_year:2023});
  const latest=updateAnalysis(record('latest'),{publication_year:2025,sample_size:null});
  const variants=[
    [old,updateAnalysis(latest,{sample_size:sampleProof(latest.pmid)})],
    [old,{...latest,source_conflict:true}],
    [old,updateAnalysis(latest,{independence_verified:false})],
    [old,updateAnalysis(latest,{model_family:'accelerated_failure_time',compatibility:{key:'different',model_family:'accelerated_failure_time',eligible:true}})],
    [old,{...latest,ci_lower:null,ci_upper:null}],
    [old,{...latest,outcome:'PFS'}],
  ];
  for(const input of variants)assert.ok(run(input).groups.every(group=>!group.latest_fallback));
  assert.ok(run([old,latest],{inclusionOverrides:{latest:false}}).groups.every(group=>!group.latest_fallback));
  assert.ok(run([old,latest],{studyScope:'randomized',advanced:{active:true,matches:{old:{matched:true},latest:{matched:false}}}}).groups.every(group=>!group.latest_fallback));
});

test('normal and t functions match tabulated reference values, including small tails', () => {
  close(Analysis.normalQuantile(0.975), 1.959963984540054, 1e-13);
  close(Analysis.normalQuantile(0.995), 2.5758293035489004, 1e-13);
  close(Analysis.normalQuantile(1e-10), -6.361340902404056, 1e-13);
  close(Analysis.normalCDF(-8), 6.22096057427174e-16, 1e-28);
  close(Analysis.normalCDF(0), 0.5, 0);
  close(Analysis.studentTPvalue(2.2281388519649385, 10), 0.05, 3e-12);
  assert.equal(Analysis.normalQuantile(0), -Infinity); assert.equal(Analysis.normalQuantile(1), Infinity);
  assert.ok(Number.isNaN(Analysis.normalQuantile(-0.01)));
});

test('REML random-effects estimate, normal confidence interval and heterogeneity match independent error-contrast SciPy reference', () => {
  // Reference independently maximizes the Gaussian likelihood of orthonormal error contrasts.
  const rows = [-0.4, -0.2, 0.1, 0.35].map((y, i) => numericRow(String(i), y, [0.04, 0.0625, 0.0225, 0.09][i]));
  const result = Analysis.poolRows(rows);
  for (const [key, expected] of Object.entries({ log_estimate: -0.057419328204214644, se: 0.15400889368235696,
    Q: 6.200262114819077, tau2: 0.04732420771715102, I2: 51.61494878047523,
    estimate: 0.9441980574669862, ci_lower: 0.698184968747156, ci_upper: 1.2768965412191304,
    p_value: 0.7092740435856266, heterogeneity_p: 0.10226329755403833 })) close(result[key], expected);
  assert.equal(result.method, 'REML'); assert.equal(result.k, 4); assert.equal(result.ci_level, 95);
  close(result.weight_percent.reduce((a, b) => a + b), 100);
});

test('two independent studies use fixed-effect weights without estimating tau squared', () => {
  const rows = [numericRow('one', -0.2, 0.04), numericRow('two', -0.21, 0.09)];
  const result = Analysis.poolRows(rows);
  assert.equal(result.tau2, 0); assert.equal(result.I2, 0); assert.equal(result.method, 'FE');
  close(result.log_estimate, (-0.2 / 0.04 - 0.21 / 0.09) / (1 / 0.04 + 1 / 0.09));
  assert.equal(Analysis.poolRows([]), null);
  assert.equal(Analysis.poolRows([numericRow('bad', 0.2, 0)]), null);
});

test('source CI levels determine SE; no sample size, p-value, OR-to-RR or fixed 3.92 substitution occurs', () => {
  const source = record('99', { estimate: Math.exp(-0.3), ci_lower: Math.exp(-0.3 - 2.5758293035489004 * 0.2), ci_upper: Math.exp(-0.3 + 2.5758293035489004 * 0.2), ci_level: 99, n: 10000, p_value: 0.00001 });
  const row = Analysis.normalizeRow(source, 'a', 'ab'); close(row.se, 0.2); assert.equal(row.ci_level, 95); assert.equal(row.original_ci.ci_level,99); assert.equal(row.ci_converted,true);
  close(Analysis.normalizeRow({ ...source, ci_level: 0.99 }, 'a', 'ab').se, 0.2);
  assert.equal(Analysis.normalizeRow({ ...source, ci_level: undefined }, 'a', 'ab').ci_level_assumed, true);
  const noCI = Analysis.normalizeRow({ ...source, ci_lower: null, ci_upper: null }, 'a', 'ab');
  assert.equal(noCI.se, null); assert.equal(noCI.estimate, source.estimate);
  assert.equal(run([record('or', { outcome: 'ORR', measure: 'OR' })], { endpoint: 'ORR:RR' }).groups.length, 0);
});

test('same-paper abstract and full-text duplicates merge source references and retain most precise original whole tuple', () => {
  const abstract = record('abstract', { pmid: '123', estimate: 0.713, ci_lower: 0.521, ci_upper: 0.919 });
  const full = updateAnalysis(record('full', { pmid: '123', estimate: 0.71, ci_lower: 0.52, ci_upper: 0.92, source_refs: [{ pmid: '123', stage: 'R3' }] }), {
    independent_id: abstract.analysis.independent_id, source_completeness: 2, source_stages: ['R3'] });
  const [combined] = Analysis.consolidate([abstract, full]);
  assert.equal(Analysis.consolidate([abstract, full]).length, 1);
  assert.equal(combined.id, abstract.id); assert.equal(combined.estimate, 0.713); assert.equal(combined.ci_lower, 0.521); assert.equal(combined.ci_upper, 0.919);
  assert.equal(combined.analysis.source_completeness, 2); assert.deepEqual(new Set(combined.analysis.source_stages), new Set(['R2', 'R3']));
  assert.equal(combined.source_refs.length, 2); assert.deepEqual(new Set(combined.merged_record_ids), new Set(['abstract', 'full']));
  assert.equal(Analysis.consolidate([combined]).length, 1); assert.equal(Analysis.consolidate([combined])[0].merged_records.length, 2);
});

test('consolidation preserves different cutoffs, models, populations and intervals while recognizing reciprocal duplicate sources', () => {
  const base = record('one', { pmid: '123', cutoff: '2020-01-01' });
  const sameTrial = (id, extra) => updateAnalysis(record(id, { pmid: '123', ...extra }), { independent_id: base.analysis.independent_id });
  const records = [base, sameTrial('later', { cutoff: '2022-01-01' }), sameTrial('different-value', { cutoff: '2020-01-01', estimate: 0.3, ci_lower: 0.2, ci_upper: 0.4 }),
    updateAnalysis(sameTrial('different-model', { cutoff: '2020-01-01' }), { compatibility: { key: 'aft', eligible: true } }),
    updateAnalysis(sameTrial('different-population', { cutoff: '2020-01-01' }), { compatibility: { key: 'ocular', eligible: true } }),
    sameTrial('opposite-direction', { cutoff: '2020-01-01', intervention: base.comparator, comparator: base.intervention, estimate: 1 / 0.7, ci_lower: 1 / 0.9, ci_upper: 1 / 0.5 })];
  const merged = Analysis.consolidate(records);
  assert.equal(merged.length, records.length - 1);
  assert.ok(merged.some((item) => item.merged_record_ids.includes('one') && item.merged_record_ids.includes('opposite-direction')));
  assert.equal(Analysis.consolidate([base, sameTrial('unknown-cutoff', {})]).length, 1);
  assert.equal(Analysis.consolidate([base, records[1], sameTrial('unknown-cutoff', {})]).length, 3);
});

test('design scope filters records but does not prevent pooling otherwise compatible randomized and nonrandomized trials', () => {
  const metadata = (design) => ({ design, compatibility: { key: JSON.stringify([design, 'advanced', 'general_melanoma', 'none', 'any', 'cox', 'yes', 'all-cause-death', 'trial', 'investigator']), label: design + ' · advanced · general_melanoma', eligible: true } });
  const randomized = updateAnalysis(record('randomized'), metadata('randomized_trial'));
  const nonrandom = updateAnalysis(record('nonrandom'), metadata('nonrandomized_trial'));
  const observational = updateAnalysis(record('observational'), metadata('observational'));
  const all = run([randomized, nonrandom, observational]); assert.equal(all.groups.length, 1); assert.equal(all.groups[0].pooled.k, 3);
  assert.equal(run([randomized, nonrandom, observational], { studyScope: 'trials' }).groups[0].pooled.k, 2);
  assert.equal(run([randomized, nonrandom, observational], { studyScope: 'randomized' }).groups[0].single.k, 1);
  assert.equal(all.groups[0].label, 'Included studies');
});

test('same-paper complement preserves planning rates, source metadata and supported analysis N with source directions intact', () => {
  const common = { pmid: 'same', estimate: 0.7, ci_lower: 0.5, ci_upper: 0.9 };
  const a = record('a', common), b = record('b', { ...common, estimate: 1 / 0.7, ci_lower: 1 / 0.9, ci_upper: 1 / 0.5, intervention: a.comparator, comparator: a.intervention });
  const rate = { id: 'rate-a', kind: 'binary_probability', arm_role: 'intervention', outcome: 'ORR', probability: 0.6, n: 20, time_months: null, source_stage: 'R2', source_refs: [{ stage: 'R2', evidence: 'a' }] };
  a.analysis = { ...a.analysis, source_refs: [{ field: 'design', evidence: 'a' }], planning_assumptions: [rate], sample_size: sampleProof(a.pmid,40) };
  b.analysis = { ...b.analysis, independent_id: a.analysis.independent_id, source_completeness: 2, source_stages: ['R3'], source_refs: [{ field: 'setting', evidence: 'b' }],
    planning_assumptions: [{ ...rate, id: 'rate-b', arm_role: 'comparator', source_stage: 'R3', source_refs: [{ stage: 'R3', evidence: 'b' }] }, { ...rate, id: 'control', arm_role: 'intervention', probability: 0.4, source_stage: 'R3' }],
    sample_size: sampleProof(b.pmid,45,'randomized') };
  const [merged] = Analysis.consolidate([a, b]);
  assert.equal(merged.analysis.source_refs.length, 2); assert.equal(merged.analysis.planning_assumptions.length, 2);
  const mergedRate = merged.analysis.planning_assumptions.find((p) => p.probability === 0.6);
  assert.equal(mergedRate.arm_role, merged.intervention.node_id === 'ab' ? 'intervention' : 'comparator'); assert.equal(mergedRate.source_refs.length, 2);
  assert.equal(merged.analysis.sample_size.n, 40); assert.equal(merged.analysis.sample_size.basis, 'reported_analysis_n'); assert.equal(merged.analysis.sample_sizes.length, 2);
  assert.equal(a.analysis.planning_assumptions[0].arm_role, 'intervention'); assert.equal(b.analysis.planning_assumptions[0].arm_role, 'comparator');
});

test('partial source intervals are never spliced into a manufactured complete interval', () => {
  const a = record('a', { pmid: 'same', ci_lower: 0.5, ci_upper: null });
  const b = updateAnalysis(record('b', { pmid: 'same', ci_lower: null, ci_upper: 0.9 }), { independent_id: a.analysis.independent_id });
  const merged = Analysis.consolidate([a, b]); assert.equal(merged.length, 1);
  assert.ok(merged[0].ci_lower === null || merged[0].ci_upper === null);
  assert.equal(run(merged).groups[0].selected.length, 0);
});

test('each verified independent trial contributes its latest poolable then fullest result once', () => {
  const old = record('old', { year: 2020 }), latest = updateAnalysis(record('latest'), { independent_id: old.analysis.independent_id });
  old.analysis.publication_year = 2020;
  const fuller = updateAnalysis(record('fuller', { estimate: 0.65 }), { independent_id: old.analysis.independent_id, source_completeness: 2 });
  const unpoolable = updateAnalysis(record('new-no-ci', { year: 2025, ci_lower: null, ci_upper: null }), { independent_id: old.analysis.independent_id, publication_year: 2025 });
  const result = run([old, latest, fuller, unpoolable, record('independent')]); const group = result.groups[0];
  assert.equal(group.display.length, 5); assert.equal(group.selected.length, 2); assert.equal(group.pooled.k, 2);
  assert.ok(group.selected.some((row) => row.id === 'fuller'));
  assert.equal(group.excluded.filter((entry) => entry.reason === 'superseded_same_trial').length, 3);
  assert.equal(group.display.find(row=>row.id==='new-no-ci').variance,null);
  assert.equal(group.display.find(row=>row.id==='new-no-ci').included,false);
});

test('a source-reviewed primary result resolves same-cohort alternatives while later evidence and explicit choices remain effective',()=>{
  const primary=updateAnalysis(record('primary',{estimate:.65}),{primary_analysis:true});
  const alternative=updateAnalysis(record('alternative',{estimate:.75}),{independent_id:primary.analysis.independent_id});
  const sources=[primary,alternative,record('independent')],before=JSON.stringify(sources);
  const initial=run(sources);assert.deepEqual(initial.groups[0].selected.map(row=>row.id).sort(),['independent','primary']);assert.equal(initial.groups[0].pooled.k,2);
  const manual=run(sources,{inclusionOverrides:{alternative:true},inclusionOrder:['alternative']});
  assert.deepEqual(manual.groups[0].selected.map(row=>row.id).sort(),['alternative','independent']);assert.equal(manual.groups[0].pooled.k,2);
  const unchecked=run(sources,{inclusionOverrides:{alternative:false},inclusionOrder:['alternative','alternative']});
  assert.deepEqual(unchecked.groups[0].selected.map(row=>row.id),['independent'],'unchecking the chosen alternative excludes its cohort instead of restoring the primary');
  assert.ok(unchecked.tableRows.filter(row=>row.study_id===primary.analysis.independent_id).every(row=>!row.population_selected));
  assert.deepEqual(run(sources).groups[0].selected.map(row=>row.id).sort(),['independent','primary'],'resetting manual choices restores defaults');
  const latest=updateAnalysis(record('latest'),{independent_id:primary.analysis.independent_id,publication_year:2026});
  assert.deepEqual(run([...sources,latest]).groups[0].selected.map(row=>row.id).sort(),['independent','latest'],'primary preference cannot freeze an older publication');
  assert.equal(JSON.stringify(sources),before);
});

test('known analysis cutoff outranks request stage and reported publication year is not an API run date', () => {
  const a = updateAnalysis(record('mature', { year: 2020 }), { analysis_date: '2025-03-31', publication_year: 2020 });
  const b = updateAnalysis(record('older-analysis', { year: 2026 }), { independent_id: a.analysis.independent_id, analysis_date: '2024-01-01', publication_year: 2026, source_completeness: 2 });
  assert.equal(run([a, b]).groups[0].selected[0].id, 'mature');
});

test('explicit final analyses and comparable follow-up durations resolve source chronology without invented dates', () => {
  const interim = record('interim', { cutoff: 'first interim analysis' });
  const final = updateAnalysis(record('final', { estimate: 0.9, ci_lower: 0.7, ci_upper: 1.2, cutoff: 'final analysis' }), { independent_id: interim.analysis.independent_id });
  assert.equal(run([interim, final]).groups[0].selected[0].id, 'final');
  const early = record('early', { cutoff: 'Minimum follow-up 28 months; primary OS analysis' });
  const later = updateAnalysis(record('later', { estimate: 0.65, cutoff: 'minimum follow-up 36 months' }), { independent_id: early.analysis.independent_id });
  assert.equal(run([early, later]).groups[0].selected[0].id, 'later');
  assert.equal(later.analysis.analysis_date, undefined);
  const differentBasis = { ...later, cutoff: 'median follow-up 36 months' };
  // Median and minimum follow-up describe different quantities, so neither establishes chronological ordering over the other.
  differentBasis.estimate = 1.4; differentBasis.ci_lower = 1.1; differentBasis.ci_upper = 1.8;
  assert.equal(run([early, differentBasis]).groups[0].selected.length, 0);
});

test('consolidation cannot erase a source hold by choosing an otherwise equivalent unflagged duplicate', () => {
  const first = record('first', { pmid: 'same', source_conflict: true });
  const complete = updateAnalysis(record('complete', { pmid: 'same' }), { independent_id: first.analysis.independent_id, source_completeness: 2 });
  const result = run([first, complete]); assert.equal(result.groups[0].display.length, 1); assert.equal(result.groups[0].selected.length, 0);
  assert.equal(result.groups[0].excluded[0].reason, 'unresolved_source_conflict');
});

test('equally current contradictory results from one trial are held rather than cherry-picked or double-counted', () => {
  const a = record('a'), b = updateAnalysis(record('b', { estimate: 1.4, ci_lower: 1.2, ci_upper: 1.8 }), { independent_id: a.analysis.independent_id });
  const group = run([a, b, record('c')]).groups[0];
  assert.equal(group.selected.length, 1); assert.equal(group.pooled, null); assert.equal(group.single.k, 1);
  assert.equal(group.excluded.filter((entry) => entry.reason === 'unresolved_same_trial_results').length, 2);
});

test('equal reported effects in different publications of one verified trial count once and keep every source in display', () => {
  const a = record('a'), b = updateAnalysis(record('b'), { independent_id: a.analysis.independent_id });
  const group = run([a, b]).groups[0]; assert.equal(group.display.length, 2); assert.equal(group.selected.length, 1); assert.equal(group.single.k, 1); assert.equal(group.pooled, null);
});

test('unlinked and nonpoolable records remain displayable for source planning but do not manufacture independent trials', () => {
  const unlinked = updateAnalysis(record('unlinked'), { independence_verified: false, independent_id: null });
  const noCI = record('noci', { ci_lower: null, ci_upper: null });
  const result = run([unlinked, noCI]); const group = result.groups[0];
  assert.equal(group.display.length, 2); assert.equal(group.selected.length, 0); assert.equal(group.pooled, null); assert.equal(group.single, null);
  assert.deepEqual(new Set(result.held.map((item) => item.reason)), new Set(['unverified_study_independence', 'unavailable_valid_precision']));
  assert.equal(group.display[0].comparison.id, 'unlinked'); assert.equal(group.display[0].source.id, 'unlinked');
  const legacy = record('legacy'); delete legacy.analysis;
  assert.equal(run([legacy]).groups[0].selected.length, 0);
});

test('study scopes and explicit compatibility holds remain effective within one displayed analysis', () => {
  const randomized = record('randomized'), trial = updateAnalysis(record('nonrandom'), { design: 'nonrandomized_trial' }), cohort = updateAnalysis(record('cohort'), { design: 'observational' });
  const ocular = updateAnalysis(record('ocular'), { compatibility: { key: 'ocular', label: 'Ocular melanoma', eligible: true } });
  const conflicting = updateAnalysis(record('conflicting'), { compatibility: { key: 'conflicting', label: 'Conflicting source metadata', eligible: false, reason: 'Accepted sources disagree on melanoma subtype' } });
  const result = run([randomized, trial, cohort, ocular, conflicting]);
  assert.equal(result.groups.length,1);assert.equal(result.groups[0].pooled.k,4);
  assert.equal(result.tableRows.find(row=>row.id==='conflicting').included,false);assert.equal(result.tableRows.find(row=>row.id==='conflicting').selection_reason,'incompatible_or_unclassified_context');
  assert.equal(run([randomized, trial, cohort], { studyScope: 'randomized' }).counts.independent_studies, 1);
  assert.equal(run([randomized, trial, cohort], { studyScope: 'trials' }).counts.independent_studies, 2);
  assert.equal(run([randomized, trial, cohort]).counts.independent_studies, 3);
  assert.equal(Analysis.matchesScope(cohort, 'randomized'), false); assert.equal(Analysis.matchesScope(trial, 'trials'), true);
});

test('complete regimen endpoints and HR/RR/OR are matched exactly and source conflicts stay out of pooling', () => {
  const wrongPair = record('ac', { intervention: { node_id: 'ac', label: 'A + C' } });
  const wrongEndpoint = record('pfs', { outcome: 'PFS' });
  const conflict = record('conflict', { source_conflict: true });
  const result = run([record('good'), wrongPair, wrongEndpoint, conflict]);
  assert.equal(result.counts.matched_records, 2); assert.equal(result.groups[0].selected.length, 1);
  assert.equal(result.groups[0].excluded[0].reason, 'unresolved_source_conflict');
});

test('re-rooting reciprocates every estimate and CI, preserves heterogeneity and weights, reverses pooled log effect', () => {
  const records = [record('a'), record('b', { estimate: 1.3, ci_lower: 0.9, ci_upper: 1.8 }), record('c', { estimate: 0.5, ci_lower: 0.3, ci_upper: 0.8 })];
  const forward = run(records).groups[0], reverse = run(records, { tailId: 'ab', headId: 'a' }).groups[0];
  close(reverse.pooled.estimate, 1 / forward.pooled.estimate); close(reverse.pooled.ci_lower, 1 / forward.pooled.ci_upper); close(reverse.pooled.ci_upper, 1 / forward.pooled.ci_lower);
  close(reverse.pooled.log_estimate, -forward.pooled.log_estimate); close(reverse.pooled.tau2, forward.pooled.tau2); close(reverse.pooled.Q, forward.pooled.Q); close(reverse.pooled.p_value, forward.pooled.p_value);
  reverse.selected.forEach((row, i) => { assert.equal(row.comparison.estimate, records[i].estimate); close(row.weight, forward.selected[i].weight); assert.equal(row.reversed, true); });
});

test('Egger intercept, intercept SE and Student-t p-value match independent SciPy reference and require ten studies', () => {
  const se = [.09, .12, .14, .18, .21, .25, .28, .31, .35, .41, .45, .5], y = [-.2, -.28, -.13, -.39, -.14, -.5, -.3, -.1, -.6, -.22, -.5, -.35];
  const rows = y.map((value, i) => numericRow(String(i), value, se[i] ** 2));
  const result = Analysis.diagnostics(rows, Analysis.poolRows(rows)).egger;
  assert.equal(result.available, true); assert.equal(result.df, 10);
  close(result.intercept, -0.5615419284512979); close(result.se, 0.35685570921809473); close(result.t, -1.5735825823879641); close(result.p_value, 0.14666015049049838); close(result.slope, -0.1578973710721686);
  assert.equal(Analysis.diagnostics(rows.slice(0, 9), Analysis.poolRows(rows.slice(0, 9))).egger.available, false);
  const samePrecision = rows.map((row) => ({ ...row, se: 0.2, variance: 0.04 }));
  assert.match(Analysis.diagnostics(samePrecision, Analysis.poolRows(samePrecision)).egger.reason, /variation in study precision/);
});

test('classic Baujat uses fixed-effect Q contributions and squared influence standardized by the omitted-fit variance', () => {
  const rows = [-0.4, -0.2, 0.1, 0.35].map((y, i) => numericRow(String(i), y, [0.04, 0.0625, 0.0225, 0.09][i]));
  const pooled = Analysis.poolRows(rows), diagnostic = Analysis.diagnostics(rows, pooled);
  close(diagnostic.baujat.reduce((total, row) => total + row.q_contribution, 0), pooled.Q);
  const weights = rows.map((row) => 1 / row.variance), total = weights.reduce((a, b) => a + b), fixed = rows.reduce((a, row, i) => a + row.log_estimate * weights[i], 0) / total;
  const fixedWithoutFirst = rows.slice(1).reduce((a, row) => a + row.log_estimate / row.variance, 0) / weights.slice(1).reduce((a, b) => a + b);
  close(diagnostic.baujat[0].influence, (fixedWithoutFirst - fixed) ** 2 * (total - weights[0]));
  assert.equal(diagnostic.leave_one_out.length, 4); diagnostic.leave_one_out.forEach((row) => { assert.equal(row.k_remaining, 3); assert.equal(row.single_study, false); assert.ok(row.p_value >= 0 && row.p_value <= 1); });
});

test('two-study leave-one-out shows the remaining single study explicitly and classic Baujat remains defined', () => {
  const group = run([record('one'), record('two')]).groups[0];
  assert.equal(group.diagnostics.leave_one_out.length, 2); assert.equal(group.diagnostics.baujat.length, 2);
  group.diagnostics.leave_one_out.forEach((row) => { assert.equal(row.k_remaining, 1); assert.equal(row.single_study, true); assert.equal(row.pooled.method, 'single'); });
  assert.equal(group.diagnostics.reasons.baujat, undefined);
  const rows = [numericRow('a', -0.2, 0.04), numericRow('b', 0.4, 0.09)], result = Analysis.diagnostics(rows, Analysis.poolRows(rows));
  // FE mean = -0.2/13. Dropping a leaves 0.4 with variance .09; dropping b leaves -.2 with variance .04.
  const mu = (-0.2 / 0.04 + 0.4 / 0.09) / (1 / 0.04 + 1 / 0.09);
  close(result.baujat[0].influence, (0.4 - mu) ** 2 / 0.09); close(result.baujat[1].influence, (-0.2 - mu) ** 2 / 0.04);
});

test('analysis and repeated consolidation preserve every frozen source value and record identity', () => {
  const sources = freeze([record('one'), record('two')]), before = JSON.stringify(sources);
  const result = run(sources); assert.equal(JSON.stringify(sources), before);
  assert.equal(result.groups[0].selected[0].comparison.id, 'one');
  assert.notEqual(result.groups[0].selected[0].comparison, sources[0]);
  assert.equal(result.groups[0].selected[0].comparison.merged_records[0], sources[0]);
  const again = run(Analysis.consolidate(sources)); close(again.groups[0].pooled.estimate, result.groups[0].pooled.estimate);
});

function clinicalRecord(id, changes = {}, extra = {}) {
  const source = record(id, extra), scope = { design: 'randomized_trial', setting: 'adjuvant', subtype: 'general_melanoma', previous_systemic: 'unknown', braf: 'unknown', model_family: 'hazard_ratio_unspecified', adjusted: 'unknown', estimand: 'unspecified', population_scope: 'overall', assessment: 'unspecified', ...changes };
  return updateAnalysis(source, { ...scope, compatibility: { ...scope, key: JSON.stringify(Object.values(scope)), label: 'Adjuvant melanoma', eligible: true } });
}

test('newer same-cohort metadata refinements select one latest supported result without splitting the endpoint',()=>{
  const old=clinicalRecord('old',{}, {year:2020});old.analysis.publication_year=2020;
  const another=clinicalRecord('another'),newer=updateAnalysis(clinicalRecord('newer',{model_family:'cox',adjusted:'yes',estimand:'standard_os'}),{independent_id:old.analysis.independent_id});
  const sources=[old,another,newer],before=JSON.stringify(sources),result=run(sources);
  assert.equal(result.groups.length,1);assert.deepEqual(result.groups[0].selected.map(row=>row.id).sort(),['another','newer']);assert.equal(result.groups[0].pooled.k,2);
  assert.equal(result.tableRows.find(row=>row.id==='old').included,false);assert.equal(JSON.stringify(sources),before);
});

test('cohort representatives are deduplicated across differing source contexts while hard quantities remain excluded',()=>{
  const known={setting:'advanced',subtype:'general_melanoma',previous_systemic:'untreated',braf:'wild_type',model_family:'cox',adjusted:'yes',estimand:'standard_os',population_scope:'overall',assessment:'central'};
  for(const [field,value]of Object.entries({setting:'adjuvant',subtype:'uveal',previous_systemic:'treated',braf:'mutant',model_family:'subdistribution_hazard',adjusted:'no',population_scope:'subgroup',assessment:'investigator'})){
    const old=clinicalRecord('old',known,{year:2020});old.analysis.publication_year=2020;
    const newer=updateAnalysis(clinicalRecord('newer',{...known,[field]:value}),{independent_id:old.analysis.independent_id});
    const sources=[old,newer],before=JSON.stringify(sources),result=run(sources);
    assert.notEqual(Analysis.semanticKey(old),Analysis.semanticKey(newer),field+' source context remains intact');
    assert.equal(result.groups.length,1);assert.equal(result.counts.independent_studies,1,field);assert.equal(result.groups[0].pooled,null);
    if(field==='model_family')assert.equal(result.tableRows.find(row=>row.id==='newer').selection_reason,'incompatible_effect_quantity');
    else assert.equal(result.groups[0].selected[0].id,'newer',field+' latest supported estimate');
    assert.equal(JSON.stringify(sources),before);
  }
});

test('fuller extraction and publication chronology select only one report without manufacturing precise publication dates',()=>{
  const old=clinicalRecord('old'),full=updateAnalysis(clinicalRecord('full',{model_family:'cox'}),{independent_id:old.analysis.independent_id,source_completeness:2,analysis_date:'2024-06-01'});
  const sources=[old,full],before=JSON.stringify(sources),result=run(sources);
  assert.equal(result.counts.independent_studies,1);assert.equal(result.groups[0].selected[0].id,'full');assert.equal(JSON.stringify(sources),before);
  const earlierAnalysis=updateAnalysis(full,{publication_year:2025,analysis_date:'2020-06-01'});
  assert.equal(run([old,earlierAnalysis]).counts.independent_studies,1);
  const datedOld=updateAnalysis(old,{publication_year:2024,analysis_date:'2024-07-01'});
  assert.equal(run([datedOld,full]).counts.independent_studies,1,'analysis dates are not an extra independently recruited population');
});

test('equivalent adjusted and unadjusted newer reports never count a trial twice',()=>{
  const old=clinicalRecord('old',{}, {year:2020});old.analysis.publication_year=2020;
  const adjusted=updateAnalysis(clinicalRecord('adjusted',{model_family:'cox',adjusted:'yes'}),{independent_id:old.analysis.independent_id});
  const unadjusted=updateAnalysis(clinicalRecord('unadjusted',{model_family:'cox',adjusted:'no'}),{independent_id:old.analysis.independent_id});
  const sources=[old,adjusted,unadjusted],before=JSON.stringify(sources),result=run(sources);
  assert.equal(result.groups.length,1);assert.equal(result.counts.independent_studies,1);assert.equal(result.groups[0].pooled,null);
  assert.notEqual(result.groups[0].selected[0].id,'old');assert.equal(result.tableRows.length,3);assert.equal(JSON.stringify(sources),before);
});

test('a newer same-endpoint report replaces its older defined report without borrowing its metadata',()=>{
  const old=clinicalRecord('old-rfs',{estimand:'standard_rfs'},{year:2020});old.analysis.publication_year=2020;
  const other=clinicalRecord('another-trial',{estimand:'standard_rfs'});
  const newer=updateAnalysis(clinicalRecord('newer-rfs',{model_family:'cox'}),{independent_id:old.analysis.independent_id});
  const sources=[old,other,newer].map(source=>({...source,outcome:'RFS'})),before=JSON.stringify(sources),result=run(sources,{endpoint:'RFS:HR'});
  assert.equal(result.groups.length,1);assert.equal(result.groups[0].pooled.k,2);assert.deepEqual(result.groups[0].selected.map(row=>row.id).sort(),['another-trial','newer-rfs']);
  assert.equal(result.tableRows.find(row=>row.id==='old-rfs').included,false);assert.equal(JSON.stringify(sources),before);
});
