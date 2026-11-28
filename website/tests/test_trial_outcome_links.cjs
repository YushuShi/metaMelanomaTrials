'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {attachPhaseLinks,primaryPending} = require('../scripts/trial_outcome_links.cjs');
const catalogue = require('../dist/data/phase_comparison.json');

test('pending primary results apply only to the verified trial and regimen', () => {
  const row = {pmid:'40627813', nct:'NCT03767348', regimen:'RP1 + Nivolumab'};
  const result = attachPhaseLinks([row,{...row, regimen:'Nivolumab'}, {...row, nct:'NCT12345678'}], catalogue);
  assert.equal(result[0].phaseLinks[0].phase3Name, 'IGNYTE-3');
  assert.equal(result[0].phaseLinks[0].pending, true);
  assert.deepEqual(result.slice(1).map(r => r.phaseLinks), [[], []]);
  assert.equal(primaryPending({status:'Recruiting'}), false);
});

test('a reported primary endpoint precludes the pending marker even when OS is immature', () => {
  const rows = attachPhaseLinks(['NCT03897881','NCT05933577'].map(nct => ({nct,regimen:'mRNA-4157 + Pembrolizumab'})), catalogue);
  assert.equal(rows[0].phaseLinks[0].id, rows[1].phaseLinks[0].id);
  assert.deepEqual(rows.map(r => [r.phaseLinks[0].phase, r.phaseLinks[0].pending]), [[2,false],[3,false]]);
  assert.equal(primaryPending({status:'Primary OS pending', primary_results_pmid:'12345'}),false);
});

test('a registration with several cohorts does not link an unrelated cohort', () => {
  const rows = attachPhaseLinks(['NRAS-mutated','BRAF-mutated'].map(cohort => ({cohort,nct:'NCT01320085',regimen:'Binimetinib'})), catalogue);
  assert.equal(rows[0].phaseLinks[0].phase3Name,'NEMO');
  assert.deepEqual(rows[1].phaseLinks,[]);
});
