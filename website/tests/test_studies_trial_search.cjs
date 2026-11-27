'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const charts = require('../dist/app.js');

function prepared(name, nct, pmid, year) {
  return {study:{pmid, year}, prepared_trial:{trial_label:name, nct_label:nct}};
}
function hydrated(name, nct, pmid) {
  const record = {pmid, study:{study_name:name, nct_id:nct}};
  return {study:{pmid, report_id:pmid, title:'Report '+pmid, quantitative_only:true, details:{quantitative_extraction:[{record}]}}};
}

test('Studies searches saved and hydrated reports by their own trial names, aliases and registrations', () => {
  const primary = prepared('KEYNOTE-054','NCT02362594','29658430',2018);
  const full = hydrated('KEYNOTE-054','NCT02362594','29658430');
  const unrelated = prepared('NA','NA','9000000',2024);
  unrelated.study.title = 'Comparison with the KEYNOTE-054 results in NCT02362594';
  for (const row of [primary, full]) {
    const rows = [row, unrelated];
    for (const query of ['keynote 054','eortc 1325','NCT02362594']) {
      assert.deepEqual(charts.filterStudyTrials(rows, query), [row], query);
    }
    assert.equal(charts.filterStudyTrials(rows, '  '), rows);
  }
});

test('searching the prepared Studies table includes all pages and resets its page and result count', () => {
  const rows = Array.from({length:15}, (_, i) => prepared('Other', 'NA', String(i+1), 2025));
  rows.push(prepared('KEYNOTE-942', 'NCT03897881', '38246194', 2024));
  const elements = new Map();
  function get(id) {
    if (!elements.has(id)) elements.set(id, {setAttribute(){}});
    return elements.get(id);
  }
  const state = {scopedPage:2, scopedSort:'year', scopedOrder:'desc', studyPreview:{active:true,data:{rows}}, studyTrialQuery:'keynote942'};
  const context = {state, charts, $:get, number:new Intl.NumberFormat(), text:(id,v)=>{get(id).textContent=v;}, studyRowsHTML:(matches,options)=>{assert.equal(options.trialQuery,state.studyTrialQuery);return matches.map(m=>m.study.pmid).join(',');}};
  const src = fs.readFileSync(require.resolve('../dist/app.js'), 'utf8');
  const start = src.indexOf('  function renderStudies(');
  vm.runInNewContext(src.slice(start,src.indexOf('\n  function ',start+5))+'\nrenderStudies();',context);
  assert.equal(get('scoped-studies-rows').innerHTML,'38246194');
  assert.equal(get('scoped-studies-count').textContent,'1 report');
  assert.equal(state.scopedPage,1);
});

test('Studies explains a registry alias in the trial-name cell only during the matching search', () => {
  const row = prepared('SPOTLIGHT203', 'NCT04570332', '40577656', 2025);
  Object.assign(row.study, {report_id:row.study.pmid, title:'Trial result'});
  Object.assign(row, {prepared_design:false, prepared_abstract:false, prepared_status:'',
    presentation_rows:[{}]});
  const source = fs.readFileSync(require.resolve('../dist/app.js'), 'utf8');
  const start = source.indexOf('  function studyRowsHTML(');
  const context = {
    row, charts:{...charts, advancedArmSettings:()=>({})}, TrialSearch:require('../dist/trial_search.js'),
    state:{}, escape:String, studyTableCells:()=>({}), armTreatmentTag:()=>''
  };
  const render = vm.runInNewContext(source.slice(start, source.indexOf('\n  function ', start+5))+
    '\n(query => studyRowsHTML([row],{trialQuery:query}))', context);
  assert.match(render('keynote'), /<td rowspan="1">SPOTLIGHT203 \(KEYNOTE-B77\)<\/td>/);
  for (const query of ['', 'NCT04570332', 'spotlight']) {
    const html = render(query);
    assert.match(html, /<td rowspan="1">SPOTLIGHT203<\/td>/);
    assert.doesNotMatch(html, /KEYNOTE/);
  }
  assert.equal(row.prepared_trial.trial_label, 'SPOTLIGHT203');
});

test('CSV uses the active trial query across all filtered reports', () => {
  const matches = [
    hydrated('KEYNOTE-942','NCT03897881','38246194'),
    hydrated('KEYNOTE-054','NCT02362594','29658430'),
    hydrated('KEYNOTE-942','NCT03897881','42223134')
  ];
  let exported;
  const context = {
    charts:{...charts, studyTableCSV:rows=>{exported=rows; return '';}},
    state:{studyTrialQuery:'NCT03897881', scopedPage:7},
    advancedEvidence:()=>({matches}), URL:{createObjectURL:()=>''}, Blob, setTimeout(){},
    document:{createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}}
  };
  const src = fs.readFileSync(require.resolve('../dist/app.js'), 'utf8');
  const start = src.indexOf('  function downloadStudyTable(');
  vm.runInNewContext(src.slice(start,src.indexOf('\n  function ',start+5))+'\ndownloadStudyTable();',context);
  assert.deepEqual(exported.map(row=>row.study.pmid).sort(), ['38246194','42223134']);
});
