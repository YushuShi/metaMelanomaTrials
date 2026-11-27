'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {groupHTML, matchingGroups, render} = require('../dist/phase_comparison.js');

function phase2(id, date, match_ids) {
  return {id, name: id + ' cohort', primary_date: date, match_ids, publications: [], outcomes: []};
}

function phase3(id, registry_status, status) {
  return {id, name: id + ' trial', registry_status, status, publications: [], outcomes: []};
}

const mixed = {
  id: 'mixed', drugs: ['Nivolumab'], regimen: 'Nivolumab', setting: 'Advanced', sort_date: '2025',
  phase2: [
    phase2('Unmatched', '2025', []),
    phase2('Two matches', '2018', ['Finished', 'Enrolling']),
    phase2('Unconfirmed', '2017', ['Published', 'Follow up', 'Stopped'])
  ],
  phase3: [
    phase3('Finished', 'COMPLETED', 'Completed'),
    phase3('Enrolling', 'RECRUITING', 'Primary outcome pending'),
    phase3('Published', undefined, 'Final outcomes published'),
    phase3('Follow up', 'ACTIVE_NOT_RECRUITING', 'Active, not recruiting'),
    phase3('Stopped', 'TERMINATED', 'Terminated')
  ]
};
const newerCompletion = {
  id: 'single', drugs: ['Pembrolizumab'], regimen: 'Pembrolizumab', setting: 'Adjuvant', sort_date: '2021',
  phase2: [phase2('Single', '2021', ['Second finished'])],
  phase3: [phase3('Second finished', 'COMPLETED', 'Results published')]
};

test('each phase II cohort has one closed disclosure covering its own comparison tables', () => {
  // These fixtures have no secondary sources, so there are no nested citation disclosures.
  const html = groupHTML(mixed);
  const entries = [...html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
  assert.equal(entries.length, 3);
  for (const [index, [, attributes, body]] of entries.entries()) {
    const trial = mixed.phase2[index];
    assert.doesNotMatch(attributes, /\bopen(?:\s|=|$)/i);
    assert.ok(body.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1].includes(trial.name), trial.id);
    const tables = body.match(/<table\b[\s\S]*?<\/table>/g) || [];
    assert.equal(tables.length, Math.max(1, trial.match_ids.length));
    for (const target of trial.match_ids) {
      assert.equal(tables.filter(table => table.includes(target + ' trial')).length, 1, target);
    }
    if (!trial.match_ids.length) assert.match(tables[0], /No corresponding phase III trial identified/);
  }
});

const groups = [mixed, newerCompletion];
const select = (status, drug = '', setting = '') =>
  matchingGroups(groups, drug, setting, status).flatMap(g =>
    g.phase2.map(t => [g.id, t.id, t.match_ids]));

test('a phase II cohort with mixed matches appears once under each applicable phase III status', () => {
  const before = structuredClone(groups);
  assert.deepEqual(select('completed'), [
    ['single', 'Single', ['Second finished']],
    ['mixed', 'Two matches', ['Finished']]
  ]);
  assert.deepEqual(select('recruiting'), [['mixed', 'Two matches', ['Enrolling']]]);
  assert.deepEqual(select('missing'), [['mixed', 'Unmatched', []]]);
  assert.deepEqual(select('other'), [['mixed', 'Unconfirmed', ['Published', 'Follow up', 'Stopped']]]);
  assert.equal(select('').length, 4);
  assert.deepEqual(groups, before);
});

test('drug, setting, and phase III status can each be applied alone or combined', () => {
  assert.deepEqual(select('', '', 'Adjuvant'), [['single', 'Single', ['Second finished']]]);
  assert.equal(select('', 'Nivolumab').length, 3);
  assert.deepEqual(select('completed', 'Nivolumab'), [['mixed', 'Two matches', ['Finished']]]);
  assert.deepEqual(select('completed', '', 'Advanced'), [['mixed', 'Two matches', ['Finished']]]);
  assert.deepEqual(select('completed', 'Pembrolizumab', 'Adjuvant'), [['single', 'Single', ['Second finished']]]);
  assert.deepEqual(select('recruiting', 'Pembrolizumab', 'Adjuvant'), []);
});

test('opening a cohort loads its own tables and keeps the disclosure open when a status is selected', () => {
  const control = () => ({value: '', addEventListener(type, handler) { this[type] = handler; }});
  const status = control(), list = control(), body = {};
  const elements = {
    '[data-trial-search]': control(),
    '[data-phase-filter="drug"]': control(),
    '[data-phase-filter="setting"]': control(),
    '[data-phase-filter="status"]': status,
    '[data-phase-groups]': list
  };
  render({querySelector: selector => elements[selector]}, {schema_version: 1, groups});
  assert.doesNotMatch(list.innerHTML, /<table\b/);
  const target = {
    dataset: {phaseKey: [...list.innerHTML.matchAll(/data-phase-key="([^"]+)"><summary>(.*?)<\/summary>/g)]
      .find(([, , summary]) => summary.includes('Two matches cohort'))[1].replaceAll('&quot;', '"')},
    matches: selector => selector === 'details.phase-cohort',
    querySelector: () => body,
    open: true
  };
  list.toggle({target});
  assert.equal(body.innerHTML.match(/<table\b/g).length, 2);
  status.value = 'recruiting';
  status.change();
  assert.match(list.innerHTML, /<details\b[^>]*\bopen\b/);
  assert.equal(list.innerHTML.match(/<table\b/g).length, 1);
  assert.match(list.innerHTML, /Enrolling trial/);
  assert.doesNotMatch(list.innerHTML, /Finished trial/);
  target.open = false;
  list.toggle({target});
  status.value = '';
  status.change();
  assert.doesNotMatch(list.innerHTML, /<details\b[^>]*\bopen\b|<table\b/);
});

test('folded trials sort across regimens and retain each arm and setting when expanded', () => {
  const firstArm = phase2('Shared', '2019-04', ['Finished']);
  const secondArm = {...firstArm, match_ids:['Enrolling']};
  const groupA = {...mixed, phase2:[phase2('Newest','2025',[]), firstArm]};
  const groupB = {...newerCompletion, phase2:[secondArm,phase2('Between','2021',[]), phase2('Undated',null,[])],
    phase3:[mixed.phase3[1]]};
  const control = () => ({value:'', addEventListener(type, handler){ this[type] = handler; }});
  const list = control();
  render({querySelector: selector => selector === '[data-phase-groups]' ? list : control()},
    {schema_version:1, groups:[groupA, groupB]});
  const entries = [...list.innerHTML.matchAll(/data-phase-key="([^"]+)"><summary>(.*?)<\/summary>/g)];
  assert.deepEqual(entries.map(([, , summary]) => summary.match(/Phase II · ([^<]+)/)[1]),
    ['Newest cohort','Between cohort','Shared cohort','Undated cohort']);
  const [,key,summary] = entries[2];
  assert.match(summary,/Phase III · Finished trial.*completed.*Phase III · Enrolling trial.*recruiting/);
  assert.doesNotMatch(list.innerHTML,/Nivolumab|Pembrolizumab|Advanced|Adjuvant/);
  const body = {};
  list.toggle({target:{dataset:{phaseKey:key.replaceAll('&quot;', '"')},matches:()=>true,open:true,querySelector:()=>body}});
  const tables = body.innerHTML.split('<table ').slice(1);
  assert.equal(tables.length,2);
  assert.match(tables[0],/Nivolumab.*Advanced.*Finished trial/);
  assert.match(tables[1],/Pembrolizumab.*Adjuvant.*Enrolling trial/);
});
