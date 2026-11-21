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

test('study metadata spans the distinct treatment and population rows', () => {
  const host = {};
  render(host, {schema_version:2, reports:[{pmid:'7',title:'Melanoma',author:'Test et al.',date:'2026-10-18',
    date_basis:'Print publication',trial:'Named trial',nct:'NCT00000001',abstract_only:true,nontrial:true,groups:[
      {group:'All participants',comparator:'Nivolumab',intervention:'Temozolomide',add_on:true,samples:[{sample_size:'157'}],effects:[{endpoint:'OS · HR',value:'0.800'}]},
      {group:'Subgroup',comparator:'Ipilimumab 3 mg/kg',intervention:'Ipilimumab 10 mg/kg',comparator_n:10,intervention_n:11,samples:[],effects:[]}
    ]}]});
  for (const label of ['Trial name','Comparator','Intervention','Sample size','Effect size (CI)']) assert.ok(host.innerHTML.includes('>'+label+'</th>'));
  assert.equal((host.innerHTML.match(/Named trial/g) || []).length,1);
  assert.match(host.innerHTML,/<td rowspan="2">Named trial/);
  assert.match(host.innerHTML,/data-treatment-class="ici">Nivolumab<\/span>/);
  assert.match(host.innerHTML,/treatment-add-on"[^>]*>\+<\/span> <span class="treatment-tag" data-treatment-class="chemotherapy">Temozolomide<\/span>/);
  assert.match(host.innerHTML,/Ipilimumab<\/span> 3 mg\/kg<\/span> <span class="treatment-arm-n">\(N=10\)/);
  assert.match(host.innerHTML,/Ipilimumab<\/span> 10 mg\/kg<\/span> <span class="treatment-arm-n">\(N=11\)/);
  assert.match(host.innerHTML,/N=157/);
  assert.match(host.innerHTML,/Abstract only/);
});
