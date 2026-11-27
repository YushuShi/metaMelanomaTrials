'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {groups} = require('../../config/phase_comparison_sources.json');
const {alignedRows} = require('../dist/phase_comparison.js');
const group = groups.find(g => g.phase3.some(t => t.nct === 'NCT01844505'));
const phase2 = group.phase2.find(t => t.nct === 'NCT01927419');

test('CheckMate 069 and 067 align PFS HRs only for the same control and align the 24-month PFS landmarks', () => {
  const phase3 = group.phase3.find(t => t.nct === 'NCT01844505');
  const rows = new Map(alignedRows(phase2.outcomes, phase3.outcomes).map(r => [r.key, r]));
  const hr = rows.get('PFS|HR|vs:ipilimumab');
  assert.equal(hr.left[0].value, '0.36 (95% CI 0.22–0.56)');
  assert.equal(hr.right[0].value, '0.42 (95% CI 0.35–0.51)');
  assert.equal(hr.right[0].denominator, 629);
  assert.equal(rows.get('PFS|HR|vs:nivolumab').left.length, 0);
  const pfs24 = rows.get('PFS|survival_probability|24mo');
  assert.equal(pfs24.left[0].denominator, 95);
  assert.equal(pfs24.right[0].value, '43% (95% CI 37–48)');
  assert.equal(pfs24.right[0].denominator, 314);
});

test('CheckMate 401 distinguishes registry-defined PFS from the phase II median and gives its source and limitations', () => {
  const phase3 = group.phase3.find(t => t.nct === 'NCT02599402');
  const rows = alignedRows(phase2.outcomes, phase3.outcomes);
  const ordinary = rows.find(r => r.key === 'PFS|median');
  assert.equal(ordinary.right.length, 0);
  const registry = rows.find(r => r.key.startsWith('PFS|median|') && r.right.length);
  assert.equal(registry.left.length, 0);
  assert.equal(registry.right[0].value, '4.96 months (95% CI 3.45–6.77)');
  assert.equal(registry.right[0].denominator, 533);
  assert.match(registry.right[0].sourceUrl, /NCT02599402\?tab=results$/);
  assert.match(registry.right[0].note, /assessment intervals varied/);
});
