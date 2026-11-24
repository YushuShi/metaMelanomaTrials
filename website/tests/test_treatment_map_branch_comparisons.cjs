'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const map = require('../dist/treatment_map.js');
const chooseSource = require('./fixtures/select_map_source.cjs');

// Synthetic topology fixtures, not claims about any published clinical comparison.
const drug = (component) => ({ id: `agent:${component}`, label: `Agent ${component.toUpperCase()}`, type: 'drug', components: [component], class_id: 'ici', count_summary: { known_n: 30, identified_studies: 1, status: 'calculated' } });
const regimen = (id, components) => ({ id, label: components.map((component) => `Agent ${component.toUpperCase()}`).join(' + '), type: 'combination', components, count_summary: { known_n: 20, identified_studies: 1, status: 'calculated' } });
const nodes = ['a', 'b', 'c', 'd', 'e', 'isolated'].map(drug).concat([
  regimen('ab', ['a', 'b']), regimen('ac', ['a', 'c']), regimen('abd', ['a', 'b', 'd']), regimen('cd', ['c', 'd']), regimen('cde', ['c', 'd', 'e']),
]);
const byId = new Map(nodes.map((node) => [node.id, node]));
const comparison = (id, intervention, comparator, pmid, estimate = 0.7) => ({
  id, intervention: { node_id: intervention, label: byId.get(intervention).label }, comparator: { node_id: comparator, label: byId.get(comparator).label },
  pmid, estimate, ci_lower: estimate - 0.1, ci_upper: estimate + 0.1, ci_level: 95, measure: 'HR', outcome: 'Overall survival', direction: 'intervention versus comparator',
});
const graph = {
  nodes,
  relationships: [
    { parent_id: 'agent:a', child_id: 'ab' }, { parent_id: 'agent:b', child_id: 'ab' },
    { parent_id: 'agent:a', child_id: 'ac' }, { parent_id: 'agent:c', child_id: 'ac' },
    { parent_id: 'ab', child_id: 'abd' }, { parent_id: 'agent:d', child_id: 'abd' },
    { parent_id: 'agent:c', child_id: 'cd' }, { parent_id: 'agent:d', child_id: 'cd' },
    { parent_id: 'cd', child_id: 'cde' }, { parent_id: 'agent:e', child_id: 'cde' },
  ],
  comparisons: [
    comparison('ab-cd-os', 'ab', 'cd', '101', 0.7),
    comparison('cd-ab-reverse', 'cd', 'ab', '102', 1.4),
    comparison('ab-ac-os', 'ab', 'ac', '103', 0.8),
    comparison('ac-ab-followup', 'ac', 'ab', '103', 1.2),
    comparison('abd-ac-os', 'abd', 'ac', '104', 0.6),
    comparison('a-e-os', 'agent:a', 'agent:e', '105', 0.9),
    comparison('ab-a-addon', 'ab', 'agent:a', '106', 0.65),
    comparison('abd-ab-addon', 'abd', 'ab', '107', 0.66),
    comparison('cd-e-outside', 'cd', 'agent:e', '108', 0.55),
    comparison('abd-cd-os', 'abd', 'cd', '109', 0.5),
  ],
};
const pairKey = (edge) => [edge.root_id, edge.opponent_id].sort().join('|');
const edgeFor = (view, left, right) => view.edges.find((edge) => pairKey(edge) === [left, right].sort().join('|'));
const canonicalId = (node) => node.canonical_id || node.node_id || node.id;
const endpointPosition = (tree, edge, endpoint) => tree.positions.get(edge[`${endpoint}_display_id`] || edge[`${endpoint}_id`]);

test('A+B versus C+D attaches to the complete descendant regimen from either constituent root', () => {
  const model = map.prepare(graph);
  for (const branchId of ['agent:a', 'agent:b']) {
    const result = map.branchComparisons(model, branchId), edge = edgeFor(result, 'ab', 'cd');
    assert.ok(edge, branchId);
    assert.equal(edge.root_id, 'ab'); assert.equal(edge.opponent_id, 'cd');
    assert.deepEqual([...edge.comparison_ids].sort(), ['ab-cd-os', 'cd-ab-reverse']);
    assert.deepEqual(edge.publication_ids, ['101', '102']);
    assert.ok(result.nodes.some((node) => canonicalId(node) === 'cd'));
    assert.ok(!result.edges.some((item) => item.root_id === branchId && item.opponent_id === 'cd'));
  }
});

test('A+B versus A+C connects existing complete branch nodes once, with no duplicate opponents', () => {
  const model = map.prepare(graph), result = map.branchComparisons(model, 'agent:a');
  const shared = result.edges.filter((edge) => pairKey(edge) === 'ab|ac');
  assert.equal(shared.length, 1);
  assert.deepEqual([...shared[0].comparison_ids].sort(), ['ab-ac-os', 'ac-ab-followup']);
  assert.deepEqual(shared[0].publication_ids, ['103']);
  assert.ok(!result.nodes.some((node) => ['ab', 'ac'].includes(canonicalId(node))));
  const tree = map.layout(model, 'agent:a');
  assert.equal(tree.nodes.filter((node) => node.id === 'ab').length, 1);
  assert.equal(tree.nodes.filter((node) => node.id === 'ac').length, 1);
  assert.ok(tree.parallelEdges.some((edge) => pairKey(edge) === 'ab|ac'));
});

test('A+B+D versus A+C connects D and C display positions while keeping full regimen endpoints', () => {
  const model = map.prepare(graph), tree = map.layout(model, 'agent:a');
  const edge = tree.parallelEdges.find((item) => pairKey(item) === 'abd|ac');
  assert.ok(edge); assert.deepEqual(edge.comparison_ids, ['abd-ac-os']);
  assert.equal(tree.parents.get('abd'), 'ab'); assert.equal(tree.parents.get('ac'), 'agent:a');
  assert.ok(endpointPosition(tree, edge, 'root')); assert.ok(endpointPosition(tree, edge, 'opponent'));
  assert.ok(!tree.parallelEdges.some((item) => item.root_id === 'agent:d' || item.opponent_id === 'agent:d'));
  assert.equal(model.comparisons.find((item) => item.id === 'abd-ac-os').intervention.label, 'Agent A + Agent B + Agent D');
});

test('root comparisons and nested add-ons retain their kinds without recursive opponent expansion', () => {
  const result = map.branchComparisons(map.prepare(graph), 'agent:a');
  assert.ok(edgeFor(result, 'agent:a', 'agent:e'));
  const ids = result.edges.flatMap((edge) => edge.comparison_ids);
  assert.ok(!ids.includes('cd-e-outside'));
  for (const id of ['ab-a-addon', 'abd-ab-addon']) assert.equal(result.edges.find((edge) => edge.comparison_ids.includes(id)).kind, 'addon');
  assert.equal(edgeFor(result, 'agent:a', 'agent:e').kind, 'parallel');
  assert.ok(!result.nodes.some((node) => canonicalId(node) === 'cde'));
  assert.ok(!result.nodes.some((node) => canonicalId(node) === 'agent:c' || canonicalId(node) === 'agent:d'));
  assert.deepEqual(map.branchComparisons(map.prepare(graph), 'all'), { nodes: [], edges: [] });
});

test('branch layout places external complete arms left of their corresponding complete regimens', () => {
  const model = map.prepare(graph), tree = map.layout(model, 'agent:a');
  for (const edge of tree.parallelEdges) {
    const root = endpointPosition(tree, edge, 'root'), opponent = endpointPosition(tree, edge, 'opponent');
    assert.ok(root && opponent, pairKey(edge));
    if (!tree.nodes.some((node) => node.id === edge.opponent_id)) assert.ok(opponent.x < root.x, pairKey(edge));
  }
  const abPair = tree.parallelEdges.find((edge) => pairKey(edge) === 'ab|cd');
  const abdPair = tree.parallelEdges.find((edge) => pairKey(edge) === 'abd|cd');
  assert.ok(abPair && abdPair, 'a shared opponent retains both exact source pairs');
  assert.deepEqual(abPair.publication_ids, ['101', '102']); assert.deepEqual(abdPair.publication_ids, ['109']);
  assert.deepEqual([...tree.parents], [...map.displayParents(model, tree.nodes, 'agent:a')]);
  for (const position of tree.positions.values()) { assert.ok(Number.isFinite(position.x)); assert.ok(Number.isFinite(position.y)); }
});

test('branch rerooting changes containment paths without changing comparisons, estimates, counts or source graph', () => {
  const before = JSON.stringify(graph), model = map.prepare(graph);
  for (const branchId of ['agent:a', 'agent:b', 'agent:c', 'ab', 'all']) {
    const tree = map.layout(model, branchId);
    if (branchId !== 'all') {
      const visible = new Set(tree.nodes.map((node) => node.id));
      for (const edge of tree.parallelEdges) {
        assert.ok(visible.has(edge.root_id));
        for (const id of edge.comparison_ids) {
          const saved = model.comparisons.find((item) => item.id === id);
          assert.deepEqual([saved.intervention.node_id, saved.comparator.node_id].sort(), [edge.root_id, edge.opponent_id].sort());
        }
      }
    }
  }
  assert.equal(map.layout(model, 'agent:b').parents.get('ab'), 'agent:b');
  assert.equal(model.comparisons.find((item) => item.id === 'cd-ab-reverse').estimate, 1.4);
  assert.equal(model.byId.get('ab').count_summary.known_n, 20);
  assert.equal(JSON.stringify(graph), before);
});

test('radial emphasis uses exact complete comparison endpoints, never newly visible constituent labels', () => {
  const model = map.prepare({ ...graph, comparisons: [graph.comparisons[0]] });
  assert.deepEqual([...map.directParallelNodeIds(model)].sort(), ['ab', 'cd']);
  const radial = map.layout(model, 'all');
  assert.equal(radial.nodes.length, graph.nodes.length); assert.equal(radial.parallelNodes.length, 0); assert.equal(radial.parallelEdges.length, 0);
});

test('comparison membership and source IDs are stable under input order changes', () => {
  const reordered = { ...graph, nodes: [...graph.nodes].reverse(), relationships: [...graph.relationships].reverse(), comparisons: [...graph.comparisons].reverse() };
  const signature = (source) => map.branchComparisons(map.prepare(source), 'agent:a').edges.map((edge) => ({ pair: pairKey(edge), comparisons: [...edge.comparison_ids].sort(), publications: edge.publication_ids })).sort((a, b) => a.pair.localeCompare(b.pair));
  assert.deepEqual(signature(reordered), signature(graph));
});

test('addition labels adapt to the selected center and retain full canonical labels', () => {
  const model = map.prepare(graph), a = map.layout(model, 'agent:a'), b = map.layout(model, 'agent:b');
  assert.equal(map.branchNodeLabel(model, a, 'agent:a'), 'Agent A');
  assert.equal(map.branchNodeLabel(model, a, 'ab'), '+ Agent B');
  assert.equal(map.branchNodeLabel(model, a, 'ac'), '+ Agent C');
  assert.equal(map.branchNodeLabel(model, a, 'abd'), '+ Agent D');
  assert.equal(map.branchNodeLabel(model, a, 'cd'), 'Agent C + Agent D');
  assert.equal(map.branchNodeLabel(model, b, 'ab'), '+ Agent A');
  assert.equal(map.branchNodeLabel(model, b, 'abd'), '+ Agent D');
  assert.equal(model.byId.get('ab').label, 'Agent A + Agent B');
  assert.equal(model.byId.get('abd').label, 'Agent A + Agent B + Agent D');
});

// Minimal event-capable DOM, matching the fixture used by the existing map tests.
class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.attributes = {}; this.listeners = new Map(); this.dataset = {}; this.className = ''; this.hidden = false; this._text = ''; this._value = ''; this.clientWidth = 900; this.clientHeight = 600;
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.classList = { contains: (name) => this.className.split(/\s+/).includes(name), add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); }, remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => !names.includes(name)).join(' '); }, toggle: (name, force) => { const show = force ?? this.classList.contains(name) === false; this.classList[show ? 'add' : 'remove'](name); return show; } };
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; return child; }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; children.forEach((child) => this.appendChild(child)); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.className = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatchEvent(event) { event.target ||= this; for (const listener of this.listeners.get(event.type) || []) listener(event); }
  click() { this.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} }); }
  focus() { this.ownerDocument.activeElement = this; this.dispatchEvent({ type: 'focus' }); }
  get options() { return this.children.flatMap((child) => child.tagName === 'OPTION' ? [child] : child.options); }
  set value(value) { this._value = this.tagName === 'SELECT' && !this.options.some((option) => option.value === value) ? '' : value; }
  get value() { return this._value; }
  get selectedOptions() { return this.options.filter((option) => option.value === this.value); }
}
const descendants = (element) => element.children.flatMap((child) => [child, ...descendants(child)]);
const withClass = (element, name) => descendants(element).filter((child) => child.classList.contains(name));
function mount(source = graph) {
  const doc = { defaultView: { setTimeout }, createElement(tag) { return new Element(tag, this); }, createElementNS(namespace, tag) { return this.createElement(tag); } };
  return map.mount(new Element('div', doc), source).setBranchLayout('branch');
}

test('mounted descendant comparison selection keeps the full arms and reversed source effect', () => {
  const view = mount(); view.setBranch('agent:a');
  const edge = view.tree.parallelEdges.find((item) => pairKey(item) === 'ab|cd');
  view.parallelLinks.get(edge.id).click();
  assert.equal(view.selectedId, 'ab'); assert.equal(view.selectedComparisonPairId, edge.id);
  assert.deepEqual(view.comparisonChoices().map((item) => item.id).sort(), ['ab-cd-os', 'cd-ab-reverse']);
  assert.equal(withClass(view.nodeElements.get('ab'), 'tm-card-label').map((item) => item.textContent).join(' '), '+ ● Agent B');
  assert.match(view.details.textContent, /Agent A \+ Agent B/);
  chooseSource(view, 'cd-ab-reverse');
  const arms = withClass(view.comparisonBand, 'tm-comparison-arm');
  assert.equal(arms[0].textContent, 'InterventionAgent C + Agent D');
  assert.equal(arms[1].textContent, 'ComparatorAgent A + Agent B');
  assert.match(view.comparisonBand.textContent, /HR 1\.4/);
  assert.match(view.parallelLinks.get(edge.id).getAttribute('aria-label'), /Agent C \+ Agent D versus Agent A \+ Agent B/);
  assert.doesNotMatch(withClass(view.comparisonBand, 'tm-arrow-interpretation')[0].textContent, /reciprocal/i);
  view.setBranch('agent:b');
  assert.equal(withClass(view.nodeElements.get('ab'), 'tm-card-label').map((item) => item.textContent).join(' '), '+ ● Agent A');
  assert.ok(view.tree.parallelEdges.some((item) => pairKey(item) === 'ab|cd'));
});

test('branch descendants show the complete preceding regimen in active root order above their additions', () => {
  const view = mount();
  for (const [root,drug,next] of [['agent:a','Agent A','Agent B'],['agent:b','Agent B','Agent A']]) {
    view.setBranch(root);
    const context=id=>withClass(view.nodeElements.get(id),'tm-card-regimen');
    assert.equal(context('ab')[0].textContent, drug);
    assert.equal(context('abd')[0].textContent, drug+' + '+next);
    assert.equal(context(root).length, 0);
    const added=withClass(view.nodeElements.get('abd'),'tm-card-label')[0];
    assert.match(added.textContent,/^\+ .*Agent D$/);
    assert.ok(Number(context('abd')[0].getAttribute('y')) < Number(added.getAttribute('y')));
  }
});

test('mounted sibling and deeper links reuse their existing nodes and show comparison-direction arrows', () => {
  const view = mount(); view.setBranch('agent:a');
  assert.equal(withClass(view.world, 'tm-node').filter((element) => element.getAttribute('data-node-id') === 'ac').length, 1);
  for (const pair of ['ab|ac', 'abd|ac'].map((key) => key.split('|').sort().join('|'))) {
    const edge = view.tree.parallelEdges.find((item) => pairKey(item) === pair), link = view.parallelLinks.get(edge.id);
    link.click(); assert.equal(view.selectedComparisonPairId, edge.id);
    assert.deepEqual(view.comparisonChoices().map((item) => item.id).sort(), [...edge.comparison_ids].sort());
    assert.ok(view.nodeElements.get(edge.root_id).classList.contains('tm-comparison-endpoint'));
    assert.ok(view.nodeElements.get(edge.opponent_id).classList.contains('tm-comparison-endpoint'));
    const path = withClass(link, 'tm-parallel-edge')[0];
    assert.ok(['marker-start', 'marker-end'].some(attribute => /^url\(/.test(path.getAttribute(attribute) || '')));
    assert.doesNotMatch(path.getAttribute('d'), /NaN|Infinity/);
  }
  view.nodeElements.get('ac').click();
  assert.equal(view.selectedComparisonPairId, null, 'a core node must not silently inherit one of several pair restrictions');
  assert.ok(view.comparisonChoices().some((item) => item.id === 'ab-ac-os'));
  assert.ok(view.comparisonChoices().some((item) => item.id === 'abd-ac-os'));
});

test('a shared external opponent exposes both incident branch pairs without opponent-only evidence', () => {
  const view = mount(); view.setBranch('agent:a'); view.nodeElements.get('cd').click();
  assert.equal(view.selectedComparisonPairId, null);
  assert.deepEqual(view.comparisonChoices().map((item) => item.id).sort(), ['ab-cd-os', 'abd-cd-os', 'cd-ab-reverse']);
  assert.equal(withClass(view.world, 'tm-node').filter((element) => element.getAttribute('data-node-id') === 'cd').length, 1);
  assert.ok(!view.nodeElements.has('cde'));
});

test('descendant placebo comparisons share the neutral node but retain their exact regimen pairs', () => {
  const source = { ...graph, comparisons: [
    { ...graph.comparisons[0], id: 'ab-placebo', comparator: { node_id: null, label: 'placebo' } },
    { ...graph.comparisons[3], id: 'ac-double-placebo', comparator: { node_id: null, label: 'placebo + placebo' } },
  ] };
  const result = map.branchComparisons(map.prepare(source), 'agent:a');
  assert.equal(result.nodes.filter((node) => node.id === 'control:placebo').length, 1);
  assert.equal(result.nodes.find((node) => node.id === 'control:placebo').count_summary, undefined);
  assert.deepEqual(edgeFor(result, 'ab', 'control:placebo').comparison_ids, ['ab-placebo']);
  assert.deepEqual(edgeFor(result, 'ac', 'control:placebo').comparison_ids, ['ac-double-placebo']);
  assert.ok(!result.edges.some((edge) => edge.root_id === 'agent:a'));
});

test('the published pembrolizumab/lenvatinib comparison follows both constituent branches', () => {
  const fs = require('node:fs'), path = require('node:path');
  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/data/treatment_map.json'), 'utf8'));
  const model = map.prepare(saved), reports = model.comparisons.filter((item) => String(item.pmid) === '39435288');
  assert.ok(reports.length > 0);
  const treated = model.nodes.find((node) => node.components.length === 2 && ['pembrolizumab', 'lenvatinib'].every((component) => node.components.includes(component)));
  const comparator = model.nodes.find((node) => node.components.length === 2 && ['carboplatin', 'dacarbazine'].every((component) => node.components.includes(component)));
  assert.ok(treated && comparator);
  for (const root of ['pembrolizumab', 'lenvatinib']) {
    const tree = map.layout(model, `agent:${root}`), edge = tree.parallelEdges.find((item) => pairKey(item) === [treated.id, comparator.id].sort().join('|'));
    assert.ok(edge); assert.equal(edge.root_id, treated.id); assert.equal(edge.opponent_id, comparator.id);
    assert.deepEqual([...edge.comparison_ids].sort(), reports.map((item) => item.id).sort());
    assert.deepEqual(edge.publication_ids, ['39435288']);
    assert.equal(map.branchNodeLabel(model, tree, treated.id), root === 'pembrolizumab' ? '+ Lenvatinib' : '+ Pembrolizumab');
    assert.equal(map.branchNodeLabel(model, tree, comparator.id), comparator.label);
    assert.ok(tree.positions.get(comparator.id).x < tree.positions.get(treated.id).x);
  }
});

test('comparison routes clear every treatment card for disjoint, sibling, deeper and shared-opponent links', () => {
  const tree = map.layout(map.prepare(graph), 'agent:a');
  const intersectsInterior = (p, q, card) => {
    const left = card.x, right = left + card.width, top = card.y - card.height / 2, bottom = card.y + card.height / 2;
    if (p.x === q.x) return p.x > left && p.x < right && Math.max(p.y, q.y) > top && Math.min(p.y, q.y) < bottom;
    assert.equal(p.y, q.y, 'comparison routing uses orthogonal segments');
    return p.y > top && p.y < bottom && Math.max(p.x, q.x) > left && Math.min(p.x, q.x) < right;
  };
  for (const edge of tree.parallelEdges) {
    const geometry = map.parallelLinkGeometry(tree, edge);
    assert.ok(geometry.points.length >= 2, edge.id);
    assert.doesNotMatch(geometry.path, /NaN|Infinity|undefined/);
    assert.ok(Number.isFinite(geometry.midpoint.x) && Number.isFinite(geometry.midpoint.y));
    for (let i = 1; i < geometry.points.length; i++) {
      for (const [id, card] of tree.positions) assert.ok(!intersectsInterior(geometry.points[i - 1], geometry.points[i], card), `${edge.id} crosses ${id}`);
    }
  }
});

test('keyboard comparison navigation follows the actual anchor instead of jumping from the root to a right-hand descendant peer', () => {
  const press = (element, key) => element.dispatchEvent({ type: 'keydown', key, preventDefault() {}, stopPropagation() {} });
  const descendantOnly = mount({ ...graph, comparisons: [graph.comparisons[0]] });
  descendantOnly.setBranch('agent:a');
  const root = descendantOnly.nodeElements.get('agent:a'); root.focus();
  assert.ok(descendantOnly.tree.positions.get('cd').x > descendantOnly.tree.positions.get('agent:a').x);
  press(root, 'ArrowLeft'); assert.equal(root.ownerDocument.activeElement, root);
  const peer = descendantOnly.nodeElements.get('cd'); peer.focus(); press(peer, 'ArrowRight');
  assert.equal(root.ownerDocument.activeElement, descendantOnly.nodeElements.get('ab'));
  const both = mount(); both.setBranch('agent:a');
  const bothRoot = both.nodeElements.get('agent:a'); bothRoot.focus(); press(bothRoot, 'ArrowLeft');
  assert.equal(bothRoot.ownerDocument.activeElement, both.nodeElements.get('agent:e'));
});

function externalSubsetGraph() {
  const externalCombination = regimen('bd', ['b', 'd']);
  const sourceNodes = [...nodes, externalCombination];
  const sourceById = new Map(sourceNodes.map((node) => [node.id, node]));
  const sourceComparison = (id, intervention, comparator, pmid) => ({
    id, intervention: { node_id: intervention, label: sourceById.get(intervention).label },
    comparator: { node_id: comparator, label: sourceById.get(comparator).label },
    pmid, estimate: 0.7, ci_lower: 0.5, ci_upper: 0.9, ci_level: 95,
    measure: 'HR', outcome: 'Overall survival', direction: 'intervention versus comparator',
  });
  return {
    ...graph,
    nodes: sourceNodes,
    relationships: [...graph.relationships, { parent_id: 'agent:b', child_id: 'bd' }, { parent_id: 'agent:d', child_id: 'bd' }],
    comparisons: [
      sourceComparison('ab-b', 'ab', 'agent:b', '201'),
      sourceComparison('abd-d', 'abd', 'agent:d', '202'),
      sourceComparison('abd-bd', 'abd', 'bd', '203'),
      sourceComparison('b-e-opponents-only', 'agent:b', 'agent:e', '204'),
    ],
  };
}

test('external subset comparators appear left of the center at every descendant depth', () => {
  const source = externalSubsetGraph(), before = JSON.stringify(source), model = map.prepare(source);
  const tree = map.layout(model, 'agent:a'), center = tree.positions.get('agent:a');
  for (const [sourceId, smaller, expanded] of [['ab-b', 'agent:b', 'ab'], ['abd-d', 'agent:d', 'abd'], ['abd-bd', 'bd', 'abd']]) {
    const edge = tree.comparisonEdges.find((item) => item.comparison_ids.includes(sourceId));
    assert.ok(edge, sourceId);
    assert.equal(edge.kind, 'addon');
    assert.equal(edge.root_id, smaller);
    assert.equal(edge.opponent_id, expanded);
    assert.ok(tree.positions.get(smaller).x < center.x, `${smaller} is left of the centered agent`);
    assert.equal(tree.comparisonEdges.filter((item) => item.comparison_ids.includes(sourceId)).length, 1);
    assert.equal(tree.parallelNodes.filter((node) => canonicalId(node) === smaller).length, 1);
    const geometry = map.parallelLinkGeometry(tree, edge);
    assert.match(geometry.path, /[CQ]/);
    assert.doesNotMatch(geometry.path, /NaN|Infinity|undefined/);
  }
  assert.ok(!tree.comparisonEdges.some((item) => item.comparison_ids.includes('b-e-opponents-only')));
  assert.ok(!tree.positions.has('agent:e'));
  assert.equal(JSON.stringify(source), before);
});

test('external subset arrows retain their complete comparison and smaller-to-expanded direction', () => {
  const view = mount(externalSubsetGraph());
  view.setBranch('agent:a');
  for (const sourceId of ['ab-b', 'abd-d', 'abd-bd']) {
    const edge = view.tree.comparisonEdges.find((item) => item.comparison_ids.includes(sourceId));
    assert.ok(edge, sourceId);
    view.selectParallel(edge.id);
    const evidence = view.edgeEvidence(edge);
    assert.equal(evidence.tailId, edge.root_id);
    assert.equal(evidence.headId, edge.opponent_id);
    assert.equal(evidence.effect.estimate, 0.7);
    assert.equal(evidence.style.color, '#dc2626');
    assert.deepEqual(view.comparisonChoices().map((item) => item.id), [sourceId]);
    assert.equal(withClass(view.comparisonBand, 'tm-comparison-arm')[0].textContent, 'Intervention' + view.nodeFor(edge.opponent_id).label);
    assert.equal(withClass(view.comparisonBand, 'tm-comparison-arm')[1].textContent, 'Comparator' + view.nodeFor(edge.root_id).label);
  }
});

test('the melphalan comparison appears in every constituent branch of its full combination', () => {
  const saved = require('../dist/data/treatment_map.json'), model = map.prepare(saved);
  const source = model.comparisons.find((item) => item.pmid === '41785896' && item.outcome === 'PFS');
  assert.ok(source, 'the source-supported melphalan PFS comparison exists');
  const combined = model.byId.get(source.intervention.node_id);
  for (const component of combined.components) {
    const branchId = 'agent:' + component, tree = map.layout(model, branchId);
    const edge = tree.comparisonEdges.find((item) => item.comparison_ids.includes(source.id));
    assert.ok(edge, branchId);
    assert.equal(edge.kind, 'addon');
    assert.equal(edge.root_id, source.comparator.node_id);
    assert.equal(edge.opponent_id, source.intervention.node_id);
    if (component !== 'melphalan') assert.ok(tree.positions.get('agent:melphalan').x < tree.positions.get(branchId).x);
  }
  const radial = map.layout(model, 'all');
  for (const edge of radial.comparisonEdges) assert.equal(radial.parents.get(edge.opponent_id), edge.root_id);
  assert.equal(radial.parallelNodes.length, 0);
});

test('each named source comparison incident to a branch regimen has exactly one complete-arm link', (t) => {
  const saved = require('../dist/data/treatment_map.json'), before = JSON.stringify(saved), model = map.prepare(saved);
  let checked = 0;
  for (const center of model.nodes) {
    const tree = map.layout(model, center.id), coreIds = new Set(tree.nodes.map((node) => node.id));
    for (const source of model.comparisons) {
      const endpoints = [source.intervention.node_id, source.comparator.node_id];
      if (!endpoints.every((id) => model.byId.has(id)) || !endpoints.some((id) => coreIds.has(id))) continue;
      const links = tree.comparisonEdges.filter((edge) => edge.comparison_ids.includes(source.id));
      assert.equal(links.length, 1, `${center.id} contains the complete comparison ${source.id}`);
      assert.deepEqual([links[0].root_id, links[0].opponent_id].sort(), [...endpoints].sort());
      for (const id of endpoints) assert.ok(tree.positions.has(id), `${id} has a visible card`);
      checked++;
    }
  }
  assert.ok(checked > 0);
  t.diagnostic(`Checked ${checked} source comparisons across all named treatment branches.`);
  assert.equal(JSON.stringify(saved), before);
});
