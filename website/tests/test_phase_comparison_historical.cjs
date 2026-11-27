'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {groupHTML} = require('../dist/phase_comparison.js');
const {groups} = require('../../config/phase_comparison_sources.json');

test('CheckMate 067 shows published PFS while OS is pending in 2015, then displays the final OS analysis', () => {
  const group = groups.find(entry => entry.phase2.some(trial => trial.nct === 'NCT01927419'));
  const current = group.phase3.find(trial => trial.nct === 'NCT01844505');
  const firstReport = current.publications.find(report => report.pmid === '26027431');
  // This frozen May 2015 view tests a historically correct pending OS.
  // Larkin et al. reported PFS and explicitly deferred analysis of the co-primary OS endpoint.
  const historical = {
    ...current,
    status: 'PFS published · primary OS analysis pending',
    publications: [firstReport],
    outcomes: [
      {key: 'PFS|median', label: 'Median PFS', value: '11.5 months (95% CI 8.9–16.7)', pmid: firstReport.pmid, denominator: 314},
      {key: 'OS|status', label: 'OS', value: 'Awaiting OS results', status: 'pending', pmid: firstReport.pmid}
    ]
  };
  const renderPhase3 = trial => groupHTML({
    ...group,
    phase2: group.phase2.map(t => ({
      ...t, match_ids: [trial.id],
      publications: t.publications.filter(p => p.date <= firstReport.date),
      outcomes: t.outcomes.filter(o => o.date <= firstReport.date)
    })),
    phase3: [trial]
  });
  assert.match(renderPhase3(historical), /11.5 months.*8.9–16.7/);
  assert.match(renderPhase3(historical), /Awaiting OS results/);
  assert.match(renderPhase3(current), /71.9 months.*38.2–114.4/);
  assert.doesNotMatch(renderPhase3(current), /Awaiting OS results/);
});

test('only the completed NRAS-mutant binimetinib cohort links to NEMO', () => {
  const phase = groups.find(entry => entry.phase3.some(trial => trial.name === 'NEMO'));
  const phase2 = phase.phase2.find(trial => trial.id.endsWith(':NRAS'));
  assert.equal(phase2.primary_date, '2014-09');
  assert.deepEqual(phase2.match_ids, ['NCT01763164']);
  assert.equal(phase2.outcomes.find(row => row.key === 'ORR|percentage|confirmed').denominator, 117);
  assert.ok(phase.phase2.filter(trial => trial.id !== phase2.id).every(trial => trial.match_ids.length === 0));
  const nemo = phase.phase3.find(trial => trial.nct === phase2.match_ids[0]);
  assert.equal(nemo.outcomes.find(row => row.key === 'ORR|percentage|confirmed').denominator, 269);
  assert.equal(nemo.outcomes.find(row => row.key === 'PFS|HR|vs:dacarbazine').denominator, 402);
});

test('lifileucel plus pembrolizumab uses the completed phase II cohort date and links to registered phase III endpoints', () => {
  const group = groups.find(entry => entry.phase3.some(trial => trial.nct === 'NCT05727904'));
  const trial = group.phase2[0];
  assert.equal(trial.primary_date, '2026-10-23');
  assert.ok(trial.publications.some(p => p.date === '2021-05-20'));
  assert.equal(trial.outcomes.find(row => row.key.startsWith('ORR|')).denominator, 24);
  assert.ok(group.phase3[0].outcomes.find(row => row.key === 'OS|status' && row.status === 'pending'));
});
