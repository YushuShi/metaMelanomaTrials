'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {gunzipSync} = require('node:zlib');
const {alignedRows, groupHTML, matchingGroups, render} = require('../dist/phase_comparison.js');

function saved(file) {
  const name = path.join(__dirname,'../dist/data',file + '.json');
  return JSON.parse(fs.existsSync(name) ? fs.readFileSync(name) : gunzipSync(fs.readFileSync(name + '.gz')));
}
const snapshot = saved('phase_comparison');
const key = outcome => outcome.sourceResultId && [outcome.pmid,outcome.sourceResultId].join('|');

test('saved phase tables belong to the current evidence release and sort by primary reports', () => {
  assert.equal(snapshot.source_file_sha256,saved('treatment_map_version').source_file_sha256);
  assert.ok(snapshot.groups.length);
  assert.equal(new Set(snapshot.groups.map(g => g.id)).size,snapshot.groups.length);
  for (const [i,g] of snapshot.groups.entries()) {
    assert.ok(g.drugs.length && g.setting && g.phase2.length,g.id);
    const dates = g.phase2.map(t => t.primary_date || '');
    assert.deepEqual(dates,[...dates].sort().reverse());
    assert.equal(g.sort_date || '',dates[0]);
    if (i) assert.ok((snapshot.groups[i-1].sort_date || '') >= (g.sort_date || ''),g.id);
  }
});

test('each verified counterpart resolves once and linked estimates never reuse the same source result across phases', () => {
  for (const g of snapshot.groups) {
    const third = new Map(g.phase3.map(t => [t.id,t]));
    assert.equal(third.size,g.phase3.length);
    assert.deepEqual(new Set(g.phase2.flatMap(t => t.match_ids)), new Set(third.keys()),g.id);
    assert.equal(new Set(g.phase2.map(t=>t.id)).size,g.phase2.length,g.id);
    for (const trial of g.phase2) {
      const matches = trial.match_ids;
      assert.equal(new Set(matches).size,matches.length);
      assert.ok(trial.publications.some(p=>p.pmid||p.url),trial.id);
      for (const id of matches) {
        const other = third.get(id);
        assert.ok(other,g.id+' / '+id);
        const left = new Set(trial.outcomes.map(key).filter(Boolean));
        assert.ok(!other.outcomes.some(o=>left.has(key(o))),g.id);
        for (const row of alignedRows(trial.outcomes,other.outcomes)) {
          assert.ok([...row.left,...row.right].every(o=>o.key===row.key));
        }
      }
    }
  }
});

test('a phase III trial whose primary results were published first cannot be linked as a later result', () => {
  for (const name of ['AC-052-281', 'T-VEC-325']) {
    const missing = matchingGroups(snapshot.groups,'','','missing',name);
    assert.ok(missing.length, name);
    assert.ok(missing.every(g => !g.phase3.length && g.phase2.every(t => t.name === name && !t.match_ids.length)));
    assert.deepEqual(matchingGroups(snapshot.groups,'','','published',name), [], name);
  }
  const optim = matchingGroups(snapshot.groups,'','','published','OPTiM');
  assert.deepEqual(optim.flatMap(g => g.phase2.map(t => t.name)), ['OncoVEX phase II']);
});

test('published results and registry completion distinguish the Moderna adjuvant study from recruiting trials', () => {
  const visible = (status,query) => matchingGroups(snapshot.groups,'','',status,query);
  const [moderna] = visible('published','NCT05933577');
  assert.equal(moderna.phase2[0].name,'KEYNOTE-942');
  assert.equal(moderna.phase3[0].name,'INTerpath-001');
  assert.equal(moderna.phase3[0].primary_results_pmid,'43013837');
  assert.match(groupHTML(moderna).split('</summary>')[0],/Phase II · KEYNOTE-942.*Phase III · INTerpath-001/);
  assert.deepEqual(visible('completed','INTerpath-001'),[]);
  assert.equal(visible('published','V940-001')[0].phase3[0].name,'INTerpath-001');
  for (const trial of ['TILVANCE-301','IGNYTE-3']) {
    assert.deepEqual(visible('published',trial),[]);
    assert.ok(visible('recruiting',trial).length);
  }
  for (const group of visible('published','')) {
    for (const trial of group.phase3) assert.ok(trial.publications.some(p => p.pmid === trial.primary_results_pmid));
  }
});

test('searching a phase III trial narrows the pair while searching phase II shows all eligible counterparts', () => {
  const visible = query => matchingGroups(snapshot.groups,'','Advanced','published',query);
  const two = visible('Checkmate-069').find(g => g.phase2.some(t => t.name === 'CheckMate 069'));
  assert.deepEqual(two.phase3.map(t=>t.name).sort(),['CheckMate 067','CheckMate 401','CheckMate 511']);
  const [three] = visible('NCT 01844505');
  assert.deepEqual(three.phase3.map(t=>t.name),['CheckMate 067']);
  assert.equal(three.phase2[0].name,'CheckMate 069');
  assert.deepEqual(three.phase2[0].match_ids,['NCT01844505']);
  assert.deepEqual(matchingGroups(snapshot.groups,'','Adjuvant','published','CheckMate-069'),[]);
});

test('search explains a verified alias beside the matching phase II or phase III name', () => {
  const control = () => ({value:'', addEventListener(type, handler){ this[type] = handler; }});
  const list = control(), search = control();
  const selectors = {'[data-phase-groups]':list, '[data-trial-search]':search};
  render({querySelector: selector => selectors[selector] || control()},snapshot);
  assert.match(list.innerHTML, /Phase II · SPOTLIGHT203<\/strong>/);
  search.value = 'keynote'; search.input();
  assert.match(list.innerHTML, /Phase II · SPOTLIGHT203 \(KEYNOTE-B77\)<\/strong>/);
  assert.match(list.innerHTML, /Phase II · KEYNOTE-942<\/strong>/);
  search.value = 'V940-001'; search.input();
  assert.match(list.innerHTML, /Phase III · INTerpath-001 \(V940-001\)<\/strong>/);
  assert.doesNotMatch(list.innerHTML,/SPOTLIGHT203/);
  search.value = ''; search.input();
  assert.doesNotMatch(list.innerHTML,/\(KEYNOTE-B77\)|\(V940-001\)/);
});
