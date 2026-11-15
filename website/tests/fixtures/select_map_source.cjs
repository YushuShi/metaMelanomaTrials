'use strict';
const assert = require('node:assert/strict');

// Seed an existing source-selection state for direction tests, without a public source selector.
module.exports = function selectMapSource(view, id) {
  const source = view.comparisonChoices().find(item => item.id === id);
  assert.ok(source, 'Source is unavailable: ' + id);
  const pair = view.tree.comparisonEdges.find(edge => edge.comparison_ids.includes(id));
  assert.ok(pair, 'Comparison pair is unavailable: ' + id);
  const key = pair.id + '|' + view.selectedEndpoint;
  view.selectedComparisonByPair.set(key, id);
  view.selectParallel(pair.id);
};
