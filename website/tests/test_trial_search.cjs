'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {index, matches, matchedAlias, displayName, field} = require('../dist/trial_search.js');

test('search accepts a trial name, protocol alias, or registration with varied punctuation', () => {
  const keys = index({names:'KEYNOTE-942', nct:'NCT03897881', pmid:'42223134'});
  for (const q of ['keynote 942','KeYnOtE','mRNA-4157-P201','nct-03897881','03897881']) assert.ok(matches(keys,q),q);
  assert.ok(!matches(keys,'INTerpath-001'));
  assert.ok(matches(index({nct:'NCT01844505'}),'Checkmate 67'));
  assert.ok(matches(index({names:'KEYNOTE-054',nct:'NCT02362594'}),'EORTC 1325-MG'));
});

test('shared registration does not make separate trial names aliases', () => {
  const prado = index({names:'PRADO',nct:'NCT02977052'});
  assert.ok(matches(prado,'nct02977052'));
  assert.ok(!matches(prado,'opacin'));
  const shared = index({nct:'NCT02977052'});
  assert.ok(!matches(shared,'PRADO'));
  assert.ok(!matches(shared,'opacin'));
});

test('a hidden KEYNOTE identifier explains the match using its registered spelling', () => {
  for (const [name, nct, alias, pmid] of [
    ['SPOTLIGHT203','NCT04570332','KEYNOTE-B77','40577656'],
    ['NEON-2','NCT04920383','KEYNOTE-D05','39142718']
  ]) {
    const terms = index({names:name, nct, pmid});
    assert.equal(matchedAlias(terms, 'keynote', name), alias);
    assert.equal(displayName(terms, alias.toLowerCase().replace('-', ' '), name), name + ' (' + alias + ')');
    for (const query of ['', name, nct, nct.slice(3)]) assert.equal(displayName(terms, query, name), name);
    assert.equal(displayName(terms,'keynote','NA'), alias);
    assert.ok(!matches(terms,'keynote942'));
  }
  const terms = index({names:'NEON-1; NEON-2', nct:['NCT04186637','NCT04920383'], pmid:'39097413'});
  assert.equal(matchedAlias(terms, 'keynote', 'NEON-1; NEON-2'), 'KEYNOTE-D05');
  assert.equal(matchedAlias(index({names:'KEYNOTE-942'}), 'keynote', 'KEYNOTE-942'), '');
});

test('unidentified records remain visible when search is cleared', () => {
  const missing = index({names:'NA',nct:'—'});
  assert.ok(matches(missing,'  ')); assert.ok(!matches(missing,'NA'));
  assert.ok(!matches(index({names:'KEYNOTE-942'}),'---'));
  assert.match(field('Studies'),/href="#i-search"/);
  assert.match(field('Studies'),/type="search".*aria-label="Search Studies by trial name or NCT number"/);
});
