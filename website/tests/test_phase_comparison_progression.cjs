'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {gunzipSync} = require('node:zlib');
const {alignedRows} = require('../dist/phase_comparison.js');
const snapshot = path.join(__dirname, '../dist/data/phase_comparison.json');
const {groups} = JSON.parse(fs.existsSync(snapshot) ? fs.readFileSync(snapshot) : gunzipSync(fs.readFileSync(snapshot + '.gz')));

function pair(phase2, phase3) {
  const group = groups.find(group => group.phase2.some(trial =>
    trial.id === phase2 && trial.match_ids.includes(phase3)));
  assert.ok(group, phase2 + ' / ' + phase3);
  return [group.phase2.find(trial => trial.id === phase2), group.phase3.find(trial => trial.id === phase3)];
}

test('S1616 and ILLUMINATE use the matching investigator PFS estimates from their results, preserving both CI levels', () => {
  const [a,b] = pair('NCT03033576','NCT03445533');
  const rows = alignedRows(a.outcomes, b.outcomes);
  const median = rows.find(r => r.key === 'PFS|median|investigator|RECIST 1.1');
  assert.deepEqual(median.left.map(o=>[o.value,o.denominator]), [['2.7 months (90% CI 2.5–2.9)',23]]);
  assert.deepEqual(median.right.map(o=>[o.value,o.denominator]), [['2.7 months (95% CI 2.6–2.8)',243]]);
  assert.equal(rows.find(r => r.key === 'PFS|median|independent|RECIST 1.1').left.length, 0);
  assert.match(rows.find(r => r.key.startsWith('PFS|survival_probability|6mo')).left[0].value, /4–27/);
  assert.ok(rows.some(r => r.key === 'OS|median' && r.left.length && r.right.length));
});

test('T-VEC studies retain their distinct time-to-treatment-failure and time-to-progression endpoints', () => {
  const [oncovex,optim] = pair('NCT00289016','NCT00769704');
  const tvec325 = groups.flatMap(g => g.phase2).find(t => t.id === 'NCT02366195');
  assert.deepEqual(tvec325.match_ids, []);
  assert.equal(tvec325.outcomes.find(o => o.key === 'TTF|median').denominator, 111);
  assert.equal(optim.outcomes.find(o => o.key === 'TTF|median').denominator, 295);
  assert.match(oncovex.outcomes.find(o => o.key === 'TTP|median').value, /146 days \(range 15–607\)/);
});

test('E4697 GM-CSF monotherapy outcomes are assigned to their respective HLA strata', () => {
  const [,e4697] = pair('pmid:10764421','NCT01989572');
  for (const [hla,n] of [['positive',109],['negative',190]]) {
    for (const key of ['OS|median','RFS|median','OS|survival_probability|60mo','RFS|survival_probability|60mo']) {
      const o = e4697.outcomes.find(row => row.key === key + '|population:hla-a2-' + hla);
      assert.ok(o,key);
      assert.equal(o.denominator,n);
      assert.equal(o.pmid,'26351350');
    }
  }
  assert.equal(e4697.outcomes.some(o => ['OS|median','RFS|median'].includes(o.key)),false);
});
