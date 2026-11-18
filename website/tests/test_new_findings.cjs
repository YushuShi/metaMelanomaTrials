'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {inPeriod,build} = require('../scripts/build_new_findings.cjs');
const {render} = require('../dist/new_findings.js');

test('date bounds are inclusive and preserve uncertain date precision', () => {
  for (const date of ['2026-09-30','2026','2026-11','2026-11-09',null]) assert.equal(inPeriod(date,'2026-11-08'),false);
  for (const date of ['2026-10','2026-10-01','2026-11-08']) assert.equal(inPeriod(date,'2026-11-08'),true);
});
test('public rebuild permits missing publication metadata', () => {
  const payload = build({as_of:'2026-11-08T05:10:00Z', clinical_evidence:{articles:[{pmid:'7',current_screening_status:'retain',current_main_eligible:true}]}},{},null);
  assert.deepEqual(payload.reports,[]);
  const host = {};
  render(host,payload);
  assert.match(host.innerHTML,/No retained reports/);
});
test('present the publication month with correct precision and link findings by PMID', () => {
  const host = {};
  render(host,{schema_version:1,reports:[{pmid:'7',title:'Study <7>',date:'2026-10',date_basis:'Journal issue',
    findings:[{endpoint:'OS · HR',value:'0.770 (0.620–0.980)',regimen:'A vs B'},{endpoint:'PFS · HR',value:'0.8'}]},
  {pmid:'8',title:'Case',date:'2026-10-05',date_basis:'Online publication',findings:[],abstract_note:'Grade 3 toxicity after treatment.'}]});
  assert.match(host.innerHTML,/Oct 2026/);
  assert.match(host.innerHTML,/Oct 5, 2026/);
  assert.match(host.innerHTML,/pubmed.ncbi.nlm.nih.gov\/7\//);
  assert.match(host.innerHTML,/Study &lt;7&gt;/);
  assert.match(host.innerHTML,/1 more result/);
  assert.match(host.innerHTML,/Grade 3 toxicity/);
});
