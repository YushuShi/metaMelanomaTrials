'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const map = require('../dist/treatment_map.js');
const Effects = require('../dist/treatment_map_effects.js');

// Synthetic sources exercise layout/interaction only, never clinical publication.
const node = (id, components, parent) => ({ id, components, label: components.map(x => x.toUpperCase()).join(' + '), type: components.length === 1 ? 'drug' : 'combination', class_id: 'other', broad_category: 'other', overview_parent_id: parent || null, contribution_ids: [], count_summary: { known_n: 80, identified_studies: 1, status: 'calculated' } });
const nodes = [node('agent:a', ['a']), node('agent:b', ['b']), node('agent:c', ['c']), node('ab', ['a', 'b'], 'agent:b'), node('ac', ['a', 'c'], 'agent:a'), node('bc', ['b', 'c'], 'agent:b'), node('abc', ['a', 'b', 'c'], 'ab')];
const byId = new Map(nodes.map(item => [item.id, item]));
const comparison = (id, intervention, comparator, outcome, measure, estimate, rank) => ({ id, intervention: { node_id: intervention, label: byId.get(intervention).label }, comparator: { node_id: comparator, label: byId.get(comparator).label }, outcome, measure, estimate, ci_lower: estimate * 0.8, ci_upper: estimate * 1.2, ci_level: 95, pmid: String(1000 + rank), default_rank: rank, study_name: 'Synthetic radial source', source_refs: [] });
const graph = {
  nodes,
  relationships: nodes.flatMap(child => nodes.filter(parent => parent.components.length < child.components.length && parent.components.every(id => child.components.includes(id))).map(parent => ({ parent_id: parent.id, child_id: child.id, documented_add_on: true }))),
  comparisons: [
    comparison('ab-a-os', 'ab', 'agent:a', 'OS', 'HR', 0.7, 1),
    comparison('ab-b-os', 'ab', 'agent:b', 'OS', 'HR', 1.25, 2),
    comparison('abc-ab-pfs', 'abc', 'ab', 'PFS', 'HR', 0.8, 3),
    comparison('abc-a-os', 'abc', 'agent:a', 'OS', 'HR', 0.6, 4),
    comparison('bc-b-orr', 'bc', 'agent:b', 'ORR', 'RR', 1.6, 5),
    comparison('a-b-os-parallel', 'agent:a', 'agent:b', 'OS', 'HR', 0.8, 6),
    comparison('ab-ac-os-parallel', 'ab', 'ac', 'OS', 'HR', 0.9, 7),
    comparison('a-b-dfs-parallel', 'agent:a', 'agent:b', 'DFS', 'HR', 0.7, 8),
    comparison('ac-a-os', 'ac', 'agent:a', 'OS', 'HR', 0.7, 9),
  ],
  contributions: [],
};

class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.attributes = {}; this.listeners = new Map(); this.dataset = {}; this.className = ''; this.hidden = false; this._text = ''; this._value = ''; this.clientWidth = 1100; this.clientHeight = 650;
    this.style = { setProperty(key, value) { this[key] = value; }, getPropertyValue(key) { return this[key] || ''; } };
    this.classList = { contains: name => this.className.split(/\s+/).includes(name), add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); }, remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); }, toggle: (name, force) => { const show = force ?? !this.classList.contains(name); this.classList[show ? 'add' : 'remove'](name); return show; } };
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; return child; }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; children.forEach(child => this.appendChild(child)); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.className = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatchEvent(event) { event.target ||= this; for (const listener of this.listeners.get(event.type) || []) listener(event); }
  click() { this.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} }); }
  focus() { this.ownerDocument.activeElement = this; this.dispatchEvent({ type: 'focus' }); }
  get options() { return this.children.flatMap(child => child.tagName === 'OPTION' ? [child] : child.options); }
  set value(value) { this._value = this.tagName === 'SELECT' && !this.options.some(option => option.value === value) ? '' : value; }
  get value() { return this._value; }
  get selectedOptions() { return this.options.filter(option => option.value === this.value); }
}
const descendants = element => element.children.flatMap(child => [child, ...descendants(child)]);
const withClass = (element, name) => descendants(element).filter(child => child.classList.contains(name));
const data = (element, name) => element.getAttribute('data-' + name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())) ?? element.dataset[name];
const hasArrow = path => ['marker-start', 'marker-end'].some(attribute => /^url\(/.test(path.getAttribute(attribute) || ''));
function mount(source = graph) {
  const doc = { defaultView: { setTimeout }, createElement(tag) { return new Element(tag, this); }, createElementNS(namespace, tag) { return this.createElement(tag); } };
  const view = map.mount(new Element('div', doc), source); view.setBranch('all'); return view;
}
function pair(view, tail, head) {
  const edge = view.tree.comparisonEdges.find(item => item.root_id === tail && item.opponent_id === head);
  assert.ok(edge, `${tail} → ${head}`); return { edge, element: view.parallelLinks.get(edge.id) };
}
const visibleLegendStates = view => withClass(view.legend, 'tm-effect-key').filter(element => !element.hidden).map(element => data(element, 'effectState')).sort();

test('radial overview limits comparisons to exact displayed parent-child pairs and retains off-tree sources in branches', () => {
  const before = JSON.stringify(graph), model = map.prepare(graph), tree = map.layout(model, 'all');
  assert.equal(tree.overview, true); assert.equal(tree.nodes.length, graph.nodes.length);
  assert.equal(tree.parallelNodes.length, 0); assert.equal(tree.parallelEdges.length, 0);
  assert.equal(tree.parents.get('ab'), 'agent:b');
  assert.ok(!tree.addOnEdges.some(edge => edge.root_id === 'agent:a' && edge.opponent_id === 'ab'), 'noncanonical parent comparison is hidden only in overview');
  assert.ok(!tree.addOnEdges.some(edge => edge.root_id === 'agent:a' && edge.opponent_id === 'abc'), 'non-immediate subset comparison is hidden in overview');
  assert.deepEqual(tree.comparisonEdges.flatMap(edge => edge.comparison_ids).sort(), ['ab-b-os', 'abc-ab-pfs', 'ac-a-os', 'bc-b-orr']);
  for (const edge of tree.comparisonEdges) assert.equal(tree.parents.get(edge.opponent_id), edge.root_id);
  const branch = map.layout(model, 'agent:a');
  for (const sourceId of ['ab-a-os', 'abc-a-os']) assert.ok(branch.comparisonEdges.some(edge => edge.comparison_ids.includes(sourceId)), `branch retains ${sourceId}`);
  assert.ok(!tree.comparisonEdges.some(edge => edge.root_id === 'agent:c' && edge.opponent_id === 'abc'), 'no constituent contrast is inferred');
  assert.deepEqual([...tree.positions], [...map.layout(map.prepare({ ...graph, comparisons: [] }), 'all').positions]);
  assert.equal(JSON.stringify(graph), before);
});

test('overview endpoint selector sits below Open this branch and defaults to OS without detailed comparison panels', () => {
  const view = mount();
  assert.equal(view.selectedEndpoint, 'OS:HR'); assert.equal(view.endpointSelector.value, 'OS:HR');
  const field = withClass(view.details, 'tm-endpoint-field')[0], button = withClass(view.details, 'tm-open-branch')[0], ordered = descendants(view.details);
  assert.ok(button && field); assert.ok(ordered.indexOf(button) < ordered.indexOf(field));
  assert.match(view.endpointBadge.textContent, /Overall survival/); assert.equal(view.endpointBadge.hidden, false);
  assert.equal(withClass(view.details, 'tm-detail-comparisons').length, 0);
  assert.equal(withClass(view.details, 'tm-arms').length, 0); assert.equal(view.comparisonBand.hidden, true);
  assert.equal(view.nodeElements.size, graph.nodes.length);
  assert.doesNotMatch(view.root.textContent, /The complete catalogue/);
});

test('radial add-on arrows show expanded-versus-original ratios while colors describe the tail', () => {
  const view = mount(), worse = pair(view, 'agent:a', 'ac'), better = pair(view, 'agent:b', 'ab');
  for (const item of [worse, better]) {
    assert.equal(data(item.element, 'comparisonKind'), 'addon'); assert.ok(item.element.classList.contains('tm-radial-comparison-link'));
    assert.equal(data(item.element, 'tailId'), item.edge.root_id); assert.equal(data(item.element, 'headId'), item.edge.opponent_id);
    assert.ok(hasArrow(withClass(item.element, 'tm-parallel-edge')[0]));
  }
  assert.equal(data(worse.element, 'effectState'), 'addon-worse'); assert.ok(Math.abs(Number(data(worse.element, 'estimate')) - 0.7) < 1e-12);
  assert.equal(data(better.element, 'effectState'), 'addon-better'); assert.equal(Number(data(better.element, 'estimate')), 1.25);
  assert.equal(Effects.styles['addon-better'].color, '#0891b2'); assert.equal(Effects.styles['addon-worse'].color, '#c026d3');
  assert.deepEqual(visibleLegendStates(view), ['addon-better', 'addon-worse']);
  for (const element of view.parallelLinks.values()) assert.equal(data(element, 'comparisonKind'), 'addon');
});

test('radial endpoint change recolors only matching add-on evidence and keeps unmatched links neutral', () => {
  const view = mount();
  const pfs = pair(view, 'ab', 'abc');
  assert.equal(data(pfs.element, 'effectState'), 'neutral'); assert.ok(!hasArrow(withClass(pfs.element, 'tm-parallel-edge')[0]));
  view.endpointSelector.value = 'PFS:HR'; view.endpointSelector.dispatchEvent({ type: 'change' });
  assert.equal(view.selectedEndpoint, 'PFS:HR'); assert.match(view.endpointBadge.textContent, /Progression-free survival/);
  assert.equal(data(pfs.element, 'effectState'), 'addon-worse'); assert.ok(hasArrow(withClass(pfs.element, 'tm-parallel-edge')[0]));
  const os = pair(view, 'agent:a', 'ac'); assert.equal(data(os.element, 'effectState'), 'neutral'); assert.ok(!hasArrow(withClass(os.element, 'tm-parallel-edge')[0]));
  view.setEndpoint('ORR:RR'); const response = pair(view, 'agent:b', 'bc');
  assert.equal(data(response.element, 'effectState'), 'addon-worse', 'the baseline tail has lower response probability than the expanded regimen');
  assert.equal(Number(data(response.element, 'estimate')), 1.6);
  view.setEndpoint('DFS:HR');
  for (const element of view.parallelLinks.values()) { assert.equal(data(element, 'effectState'), 'neutral'); assert.ok(!hasArrow(withClass(element, 'tm-parallel-edge')[0])); }
  assert.equal(view.comparisonBand.hidden, true);
});

test('radial comparison clicks select exact pair and endpoint nodes without opening detailed panels', () => {
  const view = mount(), item = pair(view, 'agent:a', 'ac'); item.element.click();
  assert.equal(view.selectedId, 'agent:a'); assert.equal(view.selectedComparisonPairId, item.edge.id);
  assert.deepEqual(view.comparisonChoices().map(value => value.id), ['ac-a-os']);
  assert.equal(view.activeComparisonId, 'ac-a-os');
  assert.ok(view.nodeElements.get('agent:a').classList.contains('tm-comparison-endpoint'));
  assert.ok(view.nodeElements.get('ac').classList.contains('tm-comparison-endpoint'));
  assert.equal(withClass(view.details, 'tm-detail-comparisons').length, 0); assert.equal(view.comparisonBand.hidden, true);
  assert.match(item.element.getAttribute('aria-label'), /A \+ C versus A/); assert.doesNotMatch(item.element.getAttribute('aria-label'), /reciprocal/i);
  assert.equal(view.model.comparisons.find(value => value.id === 'ac-a-os').estimate, 0.7);
});

test('Open this branch carries the selected radial pair to the full comparison details', () => {
  const view = mount(); view.setEndpoint('PFS:HR'); const item = pair(view, 'ab', 'abc'); item.element.click();
  withClass(view.details, 'tm-open-branch')[0].click();
  assert.equal(view.branchId, 'ab'); assert.equal(view.selectedEndpoint, 'PFS:HR');
  assert.equal(view.selectedComparisonPairId, item.edge.id); assert.equal(view.activeComparisonId, 'abc-ab-pfs');
  assert.equal(view.comparisonBand.hidden, false); assert.match(view.comparisonBand.textContent, /Study estimate/);
  assert.match(view.comparisonBand.textContent, /HR 0\.8/);
  assert.match(view.branchTitle.textContent, /A \+ B branch/);
  for (const link of view.parallelLinks.values()) assert.match(withClass(link, 'tm-parallel-edge')[0].getAttribute('d'), /C|Q/, 'branch comparison lines stay curved');
  assert.deepEqual(visibleLegendStates(view), ['addon-better', 'addon-worse', 'parallel-better', 'parallel-worse']);
  view.setBranch('all'); assert.equal(view.selectedEndpoint, 'PFS:HR'); assert.equal(view.endpointSelector.value, 'PFS:HR');
});

test('radial inclusion lines are straight without direction arrows and overview avoids external peer expansion', () => {
  const view = mount({ ...graph, comparisons: graph.comparisons.filter(item => item.id !== 'ac-a-os') });
  assert.equal(withClass(view.world, 'tm-parallel-node').length, 0); assert.equal(withClass(view.world, 'tm-control-node').length, 0);
  assert.ok(withClass(view.world, 'tm-branch-edge').length > 0);
  for (const path of withClass(view.world, 'tm-branch-edge')) { assert.ok(!hasArrow(path)); assert.match(path.getAttribute('d'), /L/); assert.doesNotMatch(path.getAttribute('d'), /[CQAST]/i); }
  assert.equal(view.parallelLinks.size, 3);
  for (const element of view.parallelLinks.values()) assert.notEqual(data(element, 'comparisonKind'), 'parallel');
});

test('straight radial comparison lines meet glyph boundaries and their hit paths stay aligned when zoomed', () => {
  const view = mount(), enlarged = map.directParallelNodeIds(view.model);
  const radius = id => (view.model.byId.get(id).type === 'drug' ? 5.5 : 6.4) * (enlarged.has(id) ? 2 : 1);
  for (const scale of [0.12, 0.5, 1, 3]) {
    view.camera.scale = scale; view.applyCamera();
    for (const edge of view.tree.addOnEdges) {
      const geometry = map.radialComparisonGeometry(view.model, view.tree, edge, scale), link = view.parallelLinks.get(edge.id);
      assert.match(geometry.path, /L/); assert.doesNotMatch(geometry.path, /[CQAST]/i); assert.doesNotMatch(geometry.path, /NaN|Infinity|undefined/);
      for (const [point, id] of [[geometry.sampledPoints[0], edge.opponent_id], [geometry.sampledPoints.at(-1), edge.root_id]]) {
        const center = view.tree.positions.get(id), clearance = (Math.hypot(point.x - center.x, point.y - center.y) - radius(id)) * scale;
        assert.ok(clearance >= 1.9, `${id} port is hidden by its glyph at scale ${scale}`);
      }
      assert.equal(withClass(link, 'tm-parallel-edge')[0].getAttribute('d'), geometry.path);
      assert.equal(withClass(link, 'tm-parallel-hit')[0].getAttribute('d'), geometry.path);
    }
  }
});

test('published radial graph contains all and only source-supported immediate displayed parent-child comparisons', () => {
  const fs = require('node:fs'), path = require('node:path');
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/data/treatment_map.json'), 'utf8')), before = JSON.stringify(source);
  const model = map.prepare(source), tree = map.layout(model, 'all'), expected = new Map();
  for (const item of model.comparisons) {
    const a = model.byId.get(item.intervention.node_id), b = model.byId.get(item.comparator.node_id); if (!a || !b) continue;
    const subset = (x, y) => x.components.length < y.components.length && x.components.every(id => y.components.includes(id));
    const ordered = subset(a, b) ? [a, b] : subset(b, a) ? [b, a] : null; if (!ordered || tree.parents.get(ordered[1].id) !== ordered[0].id) continue;
    const key = ordered.map(value => value.id).join('|'); if (!expected.has(key)) expected.set(key, []); expected.get(key).push(item.id);
  }
  const actual = new Map(tree.addOnEdges.map(edge => [edge.root_id + '|' + edge.opponent_id, [...edge.comparison_ids].sort()]));
  assert.deepEqual([...actual].sort(), [...expected].map(([key, ids]) => [key, ids.sort()]).sort());
  assert.equal(tree.nodes.length, model.nodes.length); assert.equal(tree.parallelEdges.length, 0); assert.equal(tree.parallelNodes.length, 0);
  assert.equal(tree.comparisonEdges.length, expected.size);
  assert.equal(JSON.stringify(source), before);
});
