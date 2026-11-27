'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {inPeriod,build} = require('../scripts/build_new_findings.cjs');
const {render} = require('../dist/new_findings.js');

function panel() {
  const search={value:'',addEventListener(event,handle){this[event]=handle;}}, count={}, results={};
  return {search,count,results,querySelector(selector) {
    return {'[data-trial-search]':search,'[data-findings-count]':count,'[data-findings-results]':results}[selector];
  }};
}

test('date bounds are inclusive and preserve uncertain date precision', () => {
  for (const date of ['2026-09-30','2026','2026-11','2026-11-09',null]) assert.equal(inPeriod(date,'2026-11-08'),false);
  for (const date of ['2026-10','2026-10-01','2026-11-08']) assert.equal(inPeriod(date,'2026-11-08'),true);
});
test('public rebuild permits missing publication metadata', () => {
  const payload = build({as_of:'2026-11-08T05:10:00Z', clinical_evidence:{articles:[{pmid:'7',current_screening_status:'retain',current_main_eligible:true}]}},{},null);
  assert.deepEqual(payload.reports,[]);
  const host = panel();
  render(host,payload);
  assert.match(host.count.textContent,/No retained reports/);
});
test('present the publication month with correct precision and link findings by PMID', () => {
  const host = panel();
  render(host,{schema_version:1,reports:[{pmid:'7',title:'Study <7>',date:'2026-10',date_basis:'Journal issue',
    findings:[{endpoint:'OS · HR',value:'0.770 (0.620–0.980)',regimen:'A vs B'},{endpoint:'PFS · HR',value:'0.8'}]},
  {pmid:'8',title:'Case',date:'2026-10-05',date_basis:'Online publication',findings:[],abstract_note:'Grade 3 toxicity after treatment.'}]});
  assert.match(host.results.innerHTML,/Oct 2026/);
  assert.match(host.results.innerHTML,/Oct 5, 2026/);
  assert.match(host.results.innerHTML,/pubmed.ncbi.nlm.nih.gov\/7\//);
  assert.match(host.results.innerHTML,/Study &lt;7&gt;/);
  assert.match(host.results.innerHTML,/1 more result/);
  assert.match(host.results.innerHTML,/Grade 3 toxicity/);
});

test('study metadata spans the distinct treatment and population rows', () => {
  const host = panel();
  render(host, {schema_version:2, reports:[{pmid:'7',title:'Melanoma',author:'Test et al.',date:'2026-10-18',
    date_basis:'Print publication',trial:'Named trial',nct:'NCT00000001',abstract_only:true,nontrial:true,groups:[
      {group:'All participants',comparator:'Nivolumab',intervention:'Temozolomide',add_on:true,samples:[{sample_size:'157'}],effects:[{endpoint:'OS · HR',value:'0.800'}]},
      {group:'Subgroup',comparator:'Ipilimumab 3 mg/kg',intervention:'Ipilimumab 10 mg/kg',comparator_n:10,intervention_n:11,samples:[],effects:[]}
    ]}]});
  const html=host.results.innerHTML;
  for (const label of ['Trial name','Comparator','Intervention','Sample size','Effect size (CI)']) assert.ok(html.includes('>'+label+'</th>'));
  assert.equal((html.match(/Named trial/g) || []).length,1);
  assert.match(html,/<td rowspan="2">Named trial/);
  assert.match(html,/data-treatment-class="ici">Nivolumab<\/span>/);
  assert.match(html,/treatment-add-on"[^>]*>\+<\/span> <span class="treatment-tag" data-treatment-class="chemotherapy">Temozolomide<\/span>/);
  assert.match(html,/Ipilimumab<\/span> 3 mg\/kg<\/span> <span class="treatment-arm-n">\(N=10\)/);
  assert.match(html,/Ipilimumab<\/span> 10 mg\/kg<\/span> <span class="treatment-arm-n">\(N=11\)/);
  assert.match(html,/N=157/);
  assert.match(html,/Abstract only/);
});

test('trial searches retain every row from matching recent reports, clear and survive remount', () => {
  const host=panel();
  const first={pmid:'17',trial:'SPOTLIGHT203',nct:'NCT04570332',title:'Report one',date:'2026-10-18',
    date_basis:'Online publication',groups:[{group:'A',effects:[]},{group:'B',effects:[]}]};
  const other={...first,pmid:'18',trial:'CheckMate 067',nct:'NCT01844505',title:'Comparison citing KEYNOTE-B77'};
  const payload={schema_version:2,reports:[first,other]};
  const query=value=>{host.search.value=value;host.search.input();};
  render(host,payload);
  for(const term of ['keynote','nct04570332']){
    query(term);
    assert.match(host.count.textContent,/^1 retained report /);
    assert.equal(host.results.innerHTML.includes('SPOTLIGHT203 (KEYNOTE-B77)'), term === 'keynote');
    assert.equal(host.results.innerHTML.match(/data-pmid="17"/g).length,2);
    assert.doesNotMatch(host.results.innerHTML,/data-pmid="18"/);
  }
  render(host,payload);
  assert.equal(host.search.value,'nct04570332');
  assert.doesNotMatch(host.results.innerHTML,/data-pmid="18"/);
  query('unmatched trial');
  assert.equal(host.results.innerHTML,'');
  assert.match(host.count.textContent,/No recent reports match/);
  query('');
  assert.match(host.count.textContent,/^2 retained reports /);
  assert.match(host.results.innerHTML,/data-pmid="18"/);
});
