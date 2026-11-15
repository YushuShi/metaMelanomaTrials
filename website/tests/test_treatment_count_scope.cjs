'use strict';

// Small source-scoped fixtures only. Do not parse the released studies dataset.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const charts = require('../dist/app.js');
const evidenceDisplay = require('../dist/evidence_display.js');
const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');

test('canonical total and arm counts stay distinct and cannot substitute for another arm',()=>{
  const binding={report_id:'report-count',review_stage:'R2',source_input_sha256:'source',review_binding_sha256:'binding',population_id:'population'};
  const sample=(value,arm)=>({...binding,record_kind:'canonical_patient_context',quantity_label:'pneumonitis_incidence_by_malignancy',sample_context_role:'treated',
    population:{label:'Melanoma patients',population_scope:'melanoma'},arm_id:arm?'local-'+arm:null,arm:arm?{entity_id:arm,label:arm==='mono'?'PD-1 inhibitor monotherapy':'PD-1 inhibitor + CTLA-4 inhibitor'}:null,
    original_fact:{arm_id:arm},n:{status:'reported',value,raw_text:String(value),unit:'patients',qualifier:'equal',evidence_ids:['E']}});
  const study={report_id:binding.report_id,details:{sample_size_records:[sample(532,null),sample(417,'mono'),sample(115,'combo')]}};
  const comparison=arm=>({scope:{...binding,record_kind:'canonical_review_scope'},outcome_arm_id:arm,intervention_arm_id:arm});
  assert.deepEqual(charts.reportedStudyCounts(study).map(r=>r.n.value),[532,417,115]);
  assert.deepEqual(charts.reportedStudyCounts(study,[comparison('mono')]).map(r=>r.n.value),[417]);
  assert.deepEqual(charts.reportedStudyCounts(study,[comparison('combo')]).map(r=>r.n.value),[115]);
  assert.deepEqual(charts.reportedStudyCounts(study,[comparison('unrelated')]),[]);
});

function functionSource(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `${name} must remain available for the browser regression`);
  const end = source.indexOf('\n  function ', start + 10);
  return source.slice(start, end === -1 ? undefined : end);
}

function browserFunctions(studies = [], selection = {}) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { setAttribute(key, value) { this[key] = value; } });
    return elements.get(id);
  };
  const context = vm.createContext({
    charts, evidenceDisplay, MelanomaScope: require('../dist/melanoma_scope.js'), state: { scopedStudies: studies, drugLabels: new Map(), loading: false },
    $: element, mainSelection: () => selection,renderAdvancedFilters(){},advancedEvidence:()=>({matches:charts.filterStudies(studies,selection)}),
    text: (id, value) => { element(id).textContent = value; },
    number: new Intl.NumberFormat('en-US'),
    escape: (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    human: (value) => String(value ?? '').replace(/_/g, ' '),
  });
  for (const name of ['scopedResult', 'resultEndpoint', 'resultValue', 'studyTableCells', 'treatmentTag', 'armTreatmentTag', 'renderStudies']) {
    vm.runInContext(functionSource(name), context);
  }
  return { compact: (match)=>{const cells=context.studyTableCells(match);return cells.sample_size+cells.effect;}, render: context.renderStudies, element };
}

const scope = (id) => ({ record_kind: 'canonical_review_scope', report_id: 'r1', review_stage: 'R3',
  source_input_sha256: `source-${id}`, review_binding_sha256: `binding-${id}`, population_id: `population-${id}` });
const comparison = (id, comparator, intervention) => ({ comparison_id: id, kind: 'treatment_comparison',
  comparator_label: comparator, additional_intervention_label: intervention,
  comparison_filter_eligible: true, comparator_filter_eligible: true, result_ids: [`R${id}`], scope: scope(id) });
const sample = (id, n) => ({ record_kind: 'canonical_patient_context', report_id: 'r1', review_stage: 'R3',
  source_input_sha256: `source-${id}`, review_binding_sha256: `binding-${id}`, population_id: `population-${id}`,
  sample_context_role: 'treated', quantity_label: `Treated patients ${id}`, evidence_ids: [`e${id}`],
  n: { status: 'reported', value: n, raw_text: String(n), role: 'sample_size', unit: 'patients', evidence_ids: [`e${id}`] } });
function study(extra = {}) {
  return { report_id: 'r1', title: 'Source-owned two-comparison study', author_display: 'Author', year: 2026,
    default_visible: true, current_main_eligible: true,
    comparisons: [comparison('C1', 'Nivolumab', 'Ipilimumab'), comparison('C2', 'Pembrolizumab', 'Radiotherapy')],
    details: { quantitative_results: [], sample_size_records: [sample('C1', 17), sample('C2', 42)] }, ...extra };
}

test('an empty treatment subrow never borrows another comparison population count', () => {
  const s = study(), before = JSON.stringify(s), { compact } = browserFunctions();
  const first = compact({ study: s, comparisons: [s.comparisons[0]], results: [] });
  const second = compact({ study: s, comparisons: [s.comparisons[1]], results: [] });
  assert.match(first, /N 17/);
  assert.doesNotMatch(first, /N 42/);
  assert.match(second, /N 42/);
  assert.doesNotMatch(second, /N 17/);
  assert.equal(JSON.stringify(s), before);
});

test('report-wide counts require an explicit unassigned study-context row', () => {
  const s = study(), { compact } = browserFunctions();
  const absent = compact({ study: s, comparisons: [], results: [] });
  assert.doesNotMatch(absent, /N (?:17|42)/);
  const report = compact({ study: s, comparisons: [], results: [], show_study_context: true });
  assert.match(report, /N 17/);
  assert.match(report, /N 42/);
});

test('actual renderer shows treated N16 once outside regimen rows and keeps rowspans aligned', () => {
  const s = study({ numeric_completion_v6_treated_context: { label: 'Treated study population', value: 16 } });
  const before = JSON.stringify(s), { render, element } = browserFunctions([s]);
  render();
  const html = element('scoped-studies-rows').innerHTML;
  const rows = html.match(/<tr\b[^>]*>.*?<\/tr>/g);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => (row.match(/<td\b/g) || []).length), [10, 5, 5]);
  assert(rows.every(row=>row.includes('class="study-group-cell"')), 'Each cohort row needs a Group cell');
  assert.equal((rows[0].match(/rowspan="3"/g) || []).length, 5);
  assert.match(rows[0], /N 17/);
  assert.doesNotMatch(rows[0], /N (?:42|16)/);
  assert.match(rows[1], /N 42/);
  assert.doesNotMatch(rows[1], /N (?:17|16)/);
  assert.equal((html.match(/N 16/g) || []).length, 1);
  assert.match(rows[2], /Treated study population/);
  assert.doesNotMatch(rows[2], /endpoint N not reported/);
  assert.equal(element('scoped-studies-range').textContent, '1–1 of 1');
  assert.equal(JSON.stringify(s), before);
});

test('merged source result IDs preserve comparison-scoped count fallback', () => {
  const s = study();
  s.comparisons[0].result_ids = ['original-C1-result'];
  const result = { result_id: 'merged-result', source_extraction_ids: ['original-C1-result'],
    endpoint: { family: 'overall_survival' }, measure: 'HR', estimate: { status: 'reported', value: .8 },
    main_result_eligible: true };
  const { compact } = browserFunctions();
  const html = compact({ study: s, comparisons: [s.comparisons[0]], results: [result] });
  assert.match(html, /N 17/);
  assert.doesNotMatch(html, /N 42/);
});
