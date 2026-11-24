'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const map = require('../dist/treatment_map.js');
const chooseSource = require('./fixtures/select_map_source.cjs');

// Synthetic evidence only: these fixtures never enter the saved clinical graph.
const node = (id, components) => ({ id, components, type: components.length > 1 ? 'combination' : 'drug', label: components.map(x => 'Agent ' + x.toUpperCase()).join(' + '), class_id: 'other', broad_category: 'other', count_summary: { known_n: 100, identified_studies: 1, status: 'calculated' }, contribution_ids: [] });
const nodes = [node('agent:a', ['a']), node('agent:b', ['b']), node('agent:c', ['c']), node('agent:d', ['d']), node('ab', ['a', 'b']), node('ac', ['a', 'c']), node('abd', ['a', 'b', 'd'])];
const byId = new Map(nodes.map(item => [item.id, item]));
const comparison = (id, intervention, comparator, outcome, measure, estimate, default_rank = 1) => ({ id, intervention: { node_id: intervention, label: byId.get(intervention).label, source_arm_label: byId.get(intervention).label }, comparator: { node_id: comparator, label: byId.get(comparator).label, source_arm_label: byId.get(comparator).label }, outcome, measure, estimate, ci_lower: estimate * 0.8, ci_upper: estimate * 1.2, ci_level: 95, pmid: String(100 + default_rank), study_name: 'Synthetic endpoint fixture', default_rank, source_refs: [], direction: 'intervention versus comparator' });
const graph = {
  nodes,
  relationships: nodes.flatMap(child => nodes.filter(parent => parent.components.length < child.components.length && parent.components.every(x => child.components.includes(x))).map(parent => ({ parent_id: parent.id, child_id: child.id, documented_add_on: parent.id === 'agent:a' && child.id === 'ab' }))),
  comparisons: [
    comparison('b-a-os-primary', 'agent:b', 'agent:a', 'OS', 'HR', 0.7, 1),
    comparison('b-a-os-alternative', 'agent:b', 'agent:a', 'OS', 'HR', 1.2, 2),
    comparison('b-a-pfs', 'agent:b', 'agent:a', 'PFS', 'HR', 1.4, 3),
    comparison('a-b-orr-rr', 'agent:a', 'agent:b', 'ORR', 'RR', 1.4, 4),
    comparison('a-b-orr-or', 'agent:a', 'agent:b', 'ORR', 'OR', 2.2, 5),
    comparison('ab-a-os', 'ab', 'agent:a', 'OS', 'HR', 0.7, 6),
    comparison('ab-a-pfs', 'ab', 'agent:a', 'PFS', 'HR', 0.9, 7),
    comparison('ac-ab-os', 'ac', 'ab', 'OS', 'HR', 0.8, 8),
    comparison('abd-ac-os', 'abd', 'ac', 'OS', 'HR', 1.3, 9),
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
function mount(source = graph, options) {
  const doc = { defaultView: { setTimeout }, createElement(tag) { return new Element(tag, this); }, createElementNS(namespace, tag) { return this.createElement(tag); } };
  const root = new Element('div', doc), view = map.mount(root, source, options);
  view.setBranchLayout('branch');
  view.setBranch('agent:a');
  return { root, view };
}
function pair(view, first, second) {
  const key = [first, second].sort().join('|');
  const edge = view.tree.comparisonEdges.find(item => [item.root_id, item.opponent_id].sort().join('|') === key);
  assert.ok(edge, 'Missing complete pair ' + key);
  return { edge, element: view.parallelLinks.get(edge.id) };
}
function state(view, first, second) { return data(pair(view, first, second).element, 'effectState'); }
function arrowPath(element) { return withClass(element, 'tm-parallel-edge')[0]; }
function comparisonTooltip(element) {
  assert.ok(!descendants(element).some(child => child.tagName === 'TEXT'), 'direct comparison has no persistent SVG text');
  return element.children.find(child => child.tagName === 'TITLE').textContent;
}
function hasArrow(path) { return ['marker-start', 'marker-end'].some(attribute => /^url\(/.test(path.getAttribute(attribute) || '')); }

test('endpoint control defaults to OS in the concise sidebar and the plot names the same endpoint', () => {
  const { view } = mount();
  assert.equal(view.selectedEndpoint, 'OS:HR'); assert.equal(view.endpointSelector.value, 'OS:HR');
  assert.match(view.endpointBadge.textContent, /Overall survival/);
  assert.equal(view.endpointBadge.hidden, false);
  assert.equal(withClass(view.details, 'tm-endpoint-field').length, 1);
  assert.equal(withClass(view.details, 'tm-detail-comparisons').length, 0);
  assert.ok(view.comparisonChoices().length > 0);
  assert.ok(view.comparisonChoices().every(item => item.outcome === 'OS' && item.measure === 'HR'));
  assert.ok(view.endpointSelector.options.some(option => option.value === 'ORR:RR'));
  assert.ok(view.endpointSelector.options.some(option => option.value === 'ORR:OR'));
});

test('parallel arrows expose the directed estimate only on hover and reverse it when the branch is rerooted', () => {
  const { view } = mount(), a = pair(view, 'agent:a', 'agent:b');
  assert.equal(data(a.element, 'tailId'), 'agent:a'); assert.equal(data(a.element, 'headId'), 'agent:b');
  assert.equal(data(a.element, 'comparisonKind'), 'parallel'); assert.equal(data(a.element, 'effectState'), 'worse');
  assert.ok(hasArrow(arrowPath(a.element)));
  assert.equal(comparisonTooltip(a.element), 'Agent B vs Agent A HR=0.700');
  assert.equal(Number(data(a.element,'estimate')),0.7);
  view.setBranch('agent:b'); const b = pair(view, 'agent:a', 'agent:b');
  assert.equal(data(b.element, 'tailId'), 'agent:b'); assert.equal(data(b.element, 'headId'), 'agent:a');
  assert.equal(data(b.element, 'effectState'), 'better');
  assert.equal(comparisonTooltip(b.element), 'Agent A vs Agent B HR=1.429');
  assert.equal(Number(data(b.element,'estimate')),1/0.7);
  assert.equal(view.model.comparisons.find(item => item.id === 'b-a-os-primary').estimate, 0.7);
});

test('A to A+B shows AB/A without reciprocal clutter while retaining the reported source tuple', () => {
  const before = JSON.stringify(graph), { view } = mount(), item = pair(view, 'agent:a', 'ab');
  assert.equal(data(item.element, 'comparisonKind'), 'addon');
  assert.equal(data(item.element, 'tailId'), 'agent:a'); assert.equal(data(item.element, 'headId'), 'ab');
  assert.equal(data(item.element, 'effectState'), 'worse');
  item.element.click();
  assert.equal(view.activeComparisonId, 'ab-a-os');
  assert.match(view.comparisonBand.textContent, /HR 0\.7/);
  const interpretation = withClass(view.comparisonBand, 'tm-arrow-interpretation')[0];
  assert.ok(interpretation); assert.doesNotMatch(interpretation.textContent, /reciprocal/i);
  assert.match(interpretation.textContent, /Agent A.*Agent A \+ Agent B/);
  assert.match(interpretation.textContent, /HR 0\.7/);
  assert.equal(Number(data(item.element, 'estimate')),0.7);
  assert.equal(JSON.stringify(graph), before);
});

test('endpoint changes filter both direct choices and arrow colors without mixing ORR odds and risk ratios', () => {
  const { view } = mount(); pair(view, 'agent:a', 'agent:b').element.click();
  view.endpointSelector.value = 'PFS:HR'; view.endpointSelector.dispatchEvent({ type: 'change' });
  assert.equal(view.selectedEndpoint, 'PFS:HR'); assert.match(view.endpointBadge.textContent, /Progression-free survival|Progression free survival/i);
  assert.deepEqual(view.comparisonChoices().map(item => item.id), ['b-a-pfs']);
  assert.equal(state(view, 'agent:a', 'agent:b'), 'better');
  assert.equal(comparisonTooltip(pair(view,'agent:a','agent:b').element), 'Agent B vs Agent A HR=1.400');
  view.setEndpoint('ORR:RR');
  assert.deepEqual(view.comparisonChoices().map(item => item.id), ['a-b-orr-rr']);
  assert.equal(state(view, 'agent:a', 'agent:b'), 'better', 'RR above 1 favors the numerator for ORR');
  assert.equal(Number(data(pair(view,'agent:a','agent:b').element,'estimate')),1/1.4);
  assert.equal(comparisonTooltip(pair(view,'agent:a','agent:b').element), 'Agent B vs Agent A RR=0.714');
  assert.match(withClass(view.comparisonBand,'tm-effect-link')[0].textContent,/RR 0\.71/); assert.doesNotMatch(view.comparisonBand.textContent, /OR 2\.2/);
  view.setEndpoint('ORR:OR'); assert.deepEqual(view.comparisonChoices().map(item => item.id), ['a-b-orr-or']);
  assert.equal(Number(data(pair(view,'agent:a','agent:b').element,'estimate')),1/2.2);
  assert.equal(comparisonTooltip(pair(view,'agent:a','agent:b').element), 'Agent B vs Agent A OR=0.455');
  assert.match(withClass(view.comparisonBand,'tm-effect-link')[0].textContent,/OR 0\.45/);
});

test('absent selected endpoint stays explicit and leaves neutral links without borrowed outcomes or arrows', () => {
  const { view } = mount(); view.setEndpoint('DFS:HR');
  assert.equal(view.selectedEndpoint, 'DFS:HR'); assert.equal(view.activeComparisonId, null);
  assert.deepEqual(view.comparisonChoices(), []); assert.equal(view.comparisonBand.hidden, true);
  assert.match(view.endpointBadge.textContent, /Disease-free survival|Disease free survival/i);
  for (const element of view.parallelLinks.values()) {
    assert.equal(data(element, 'effectState'), 'neutral');
    const path = arrowPath(element); assert.ok(!hasArrow(path));
    assert.equal(comparisonTooltip(element), 'Effect estimate unavailable');
  }
});

test('endpoint selection persists across branch and overview navigation while overview contains only add-on comparisons', () => {
  const { view } = mount(); view.setEndpoint('PFS:HR'); view.setBranch('agent:b');
  assert.equal(view.selectedEndpoint, 'PFS:HR'); assert.equal(view.endpointSelector.value, 'PFS:HR');
  view.setBranch('all'); assert.equal(view.endpointBadge.hidden, false); assert.equal(view.comparisonBand.hidden, true);
  assert.ok(withClass(view.world, 'tm-parallel-link').every(element => data(element, 'comparisonKind') === 'addon'));
  const radial = pair(view, 'agent:a', 'ab').element;
  assert.equal(comparisonTooltip(radial), 'Agent A + Agent B vs Agent A HR=0.900');
  assert.equal(data(radial, 'ciExcludesNull'), 'false');
  view.zoom(1.3);
  assert.equal(comparisonTooltip(radial), 'Agent A + Agent B vs Agent A HR=0.900');
  for (const path of withClass(view.world, 'tm-branch-edge')) { assert.equal(path.getAttribute('marker-start'), null); assert.equal(path.getAttribute('marker-end'), null); }
  view.setBranch('agent:a'); assert.equal(view.selectedEndpoint, 'PFS:HR'); assert.equal(view.endpointSelector.value, 'PFS:HR');
});

test('shared-background comparisons use complete source intervention direction, not the common central agent', () => {
  const { view } = mount(), shared = pair(view, 'ab', 'ac'), deeper = pair(view, 'abd', 'ac');
  assert.equal(data(shared.element, 'tailId'), 'ab'); assert.equal(data(shared.element, 'headId'), 'ac');
  assert.equal(data(shared.element, 'effectState'), 'worse');
  assert.equal(data(deeper.element, 'tailId'), 'ac'); assert.equal(data(deeper.element, 'headId'), 'abd');
  assert.equal(data(deeper.element, 'effectState'), 'better');
  assert.equal(comparisonTooltip(deeper.element), 'Agent A + Agent B + Agent D vs Agent A + Agent C HR=1.300');
  deeper.element.click(); assert.equal(view.activeComparisonId, 'abd-ac-os');
  assert.match(view.comparisonBand.textContent, /Agent A \+ Agent B \+ Agent D/);
  assert.match(view.comparisonBand.textContent, /Agent A \+ Agent C/);
});

test('ranked defaults do not favor effect magnitude and selecting a source recolors only its exact pair', () => {
  const { view } = mount();
  const addonBefore = state(view, 'agent:a', 'ab'), siblingBefore = state(view, 'ab', 'ac');
  const item = pair(view, 'agent:a', 'agent:b'); item.element.click();
  assert.equal(view.activeComparisonId, 'b-a-os-primary'); assert.equal(state(view, 'agent:a', 'agent:b'), 'worse');
  chooseSource(view, 'b-a-os-alternative');
  assert.equal(state(view, 'agent:a', 'agent:b'), 'better');
  assert.equal(state(view, 'agent:a', 'ab'), addonBefore); assert.equal(state(view, 'ab', 'ac'), siblingBefore);
  assert.match(view.comparisonBand.textContent, /HR 1\.2/);
});

test('selecting an oppositely reported shared-background contrast updates the arrow, tooltip and comparison panel together', () => {
  const source = { ...graph, comparisons: [...graph.comparisons, comparison('ab-ac-reverse', 'ab', 'ac', 'OS', 'HR', 1.25, 10)] };
  const { view } = mount(source), item = pair(view, 'ab', 'ac'); item.element.click();
  assert.match(withClass(view.comparisonBand, 'tm-arrow-interpretation')[0].textContent, /Agent A \+ Agent B → Agent A \+ Agent C/);
  chooseSource(view, 'ab-ac-reverse');
  assert.equal(data(item.element, 'tailId'), 'ac'); assert.equal(data(item.element, 'headId'), 'ab');
  assert.equal(comparisonTooltip(item.element), 'Agent A + Agent B vs Agent A + Agent C HR=1.250');
  assert.equal(data(item.element, 'effectState'), 'better');
  assert.match(withClass(view.comparisonBand, 'tm-arrow-interpretation')[0].textContent, /Agent A \+ Agent C → Agent A \+ Agent B/);
  assert.doesNotMatch(withClass(view.comparisonBand, 'tm-arrow-interpretation')[0].textContent, /reciprocal/i);
  assert.equal(Number(data(item.element,'estimate')),1.25);
  assert.match(view.comparisonBand.textContent, /HR 1\.25/);
});

test('branch legend has two direction keys for all comparison kinds', () => {
  const { root, view } = mount();
  assert.doesNotMatch(view.legend.textContent, /does not mean that the treatment at the arrowhead is harmful|Colors describe the point estimate, not statistical significance/i);
  assert.match(view.legend.textContent, /tail fares worse/i);
  assert.match(view.legend.textContent,/comparator → intervention.*intervention versus comparator/i);
  assert.deepEqual(withClass(view.legend, 'tm-effect-key').map(element => data(element, 'effectState')), ['better', 'worse']);
  assert.doesNotMatch(view.legend.textContent, /Gray: no result for this endpoint or no directional difference/);
  assert.match(view.legend.textContent,/CI includes 0 on the log scale/);
  assert.equal(view.categoryLegend.hidden,false);
});

test('every pure inclusion connection remains arrow-free even when a separate source comparison is available', () => {
  const { view } = mount();
  assert.ok(withClass(view.world, 'tm-branch-edge').length > 0);
  for (const path of withClass(view.world, 'tm-branch-edge')) { assert.equal(path.getAttribute('marker-start'), null); assert.equal(path.getAttribute('marker-end'), null); }
  const addon = pair(view, 'agent:a', 'ab');
  assert.ok(hasArrow(arrowPath(addon.element)));
});

test('two external opponents cannot introduce a nested comparison unrelated to the selected branch', () => {
  const bc = node('bc', ['b', 'c']);
  const source = {
    nodes: [byId.get('agent:a'), byId.get('agent:b'), byId.get('agent:c'), bc],
    relationships: [{ parent_id: 'agent:b', child_id: 'bc' }, { parent_id: 'agent:c', child_id: 'bc' }],
    comparisons: [
      comparison('a-b-branch', 'agent:a', 'agent:b', 'OS', 'HR', 0.8, 1),
      { ...comparison('a-bc-branch', 'agent:a', 'agent:b', 'OS', 'HR', 0.9, 2), comparator: { node_id: bc.id, label: bc.label } },
      { ...comparison('bc-b-outside', 'agent:a', 'agent:b', 'OS', 'HR', 0.6, 3), intervention: { node_id: bc.id, label: bc.label } },
    ],
    contributions: [],
  };
  const before = JSON.stringify(source), { view } = mount(source);
  assert.deepEqual(view.tree.nodes.map(item => item.id), ['agent:a']);
  assert.deepEqual(view.tree.parallelNodes.map(item => item.id).sort(), ['agent:b', 'bc']);
  assert.equal(view.tree.addOnEdges.length, 0);
  assert.deepEqual(view.tree.comparisonEdges.flatMap(edge => edge.comparison_ids).sort(), ['a-b-branch', 'a-bc-branch']);
  for (const [id, sourceId] of [['agent:b', 'a-b-branch'], ['bc', 'a-bc-branch']]) {
    view.nodeElements.get(id).click();
    assert.deepEqual(view.comparisonChoices().map(item => item.id), [sourceId]);
    assert.equal(view.activeComparisonId, sourceId);
  }
  assert.ok(view.model.comparisons.some(item => item.id === 'bc-b-outside'), 'source evidence remains retained for its own branch');
  assert.equal(JSON.stringify(source), before);
});

function networkTrial(id, treatment, reference, estimate, outcome='OS') {
  const row=comparison(id,treatment,reference,outcome,'HR',estimate);
  row.study_name='Trial '+id; row.pmid=id; row.direction='intervention versus comparator';
  row.analysis={design:'randomized_trial',setting:'advanced',independence_verified:true,independent_id:'trial:'+id,
    publication_year:2025,source_completeness:2,cohort:{id:'cohort:'+id,root_id:'cohort:'+id,independent_group_id:'trial:'+id,scope:'overall',label:'Overall population'},
    compatibility:{eligible:true,design:'randomized_trial',model_family:'cox',label:'advanced',key:'advanced'}};
  return row;
}
const netGraph=()=>({...graph,comparisons:[
  networkTrial('111','agent:a','agent:b',.70), networkTrial('222','agent:c','agent:b',.90),
  networkTrial('333','agent:a','agent:c',.88,'PFS'),
]});
const nextFrame=()=>new Promise(resolve=>setTimeout(resolve,10));
function activate(element) { element.dispatchEvent({type:'keydown',key:'Enter',preventDefault(){},stopPropagation(){}}); }

test('radial branch binds the left regimen and offers only eligible network comparators, even outside the branch',async()=>{
  const g=netGraph(), {view}=mount(g), indirect=view.indirect;
  // D is off the A branch; its randomized comparison against B connects it to A.
  g.comparisons.push(networkTrial('444','agent:d','agent:b',.5));
  const course=networkTrial('555','agent:c','agent:b',.65);
  course.intervention={...course.intervention,network_regimen_id:'sequence:c_then_c',network_regimen_label:'C then maintenance C'};
  g.comparisons.push(course);
  view.radialLeftId='agent:a'; view.isRadialBranch=()=>true;
  const snapshots=[]; view.refreshRadialComparators=()=>snapshots.push(indirect.fit?.estimate||null);
  indirect.toggle.click(); await nextFrame();
  assert.equal(indirect.first.regimen,'agent:a'); assert.equal(indirect.controls.hidden,true);
  assert.deepEqual(indirect.radialComparators().map(op=>op.id),['agent:c','agent:d','sequence:c_then_c']);
  assert.ok(!view.tree.positions.has('agent:d'));
  indirect.chooseRadialComparator('agent:d'); await nextFrame();
  assert.ok(Math.abs(indirect.fit.estimate-.5/.7)<1e-10);
  assert.equal(snapshots.at(-1),indirect.fit.estimate);
  assert.match(indirect.panel.textContent,/Agent D versus Agent A/);
  assert.equal(withClass(view.world,'tm-network-overlay').length,0);
  // Clearing for a new scope must immediately retire the previous sign and result.
  view.setAdvancedFilters({active:true,pending:true,signature:'loading',matches:{}});
  assert.equal(indirect.fit,null); assert.deepEqual(indirect.radialComparators(),[]);
  const matches=Object.fromEntries(g.comparisons.map(row=>[row.id,{matched:true}]));
  view.setAdvancedFilters({active:true,signature:'available',matches}); await nextFrame();
  assert.equal(indirect.second.regimen,'agent:d'); assert.ok(indirect.fit.available);
  view.setEndpoint('PFS:HR'); await nextFrame();
  assert.deepEqual(indirect.radialComparators(),[]); assert.equal(indirect.second,null); assert.equal(indirect.fit,null);
});

test('entering radial branch preserves an eligible pair but a sequential first treatment cannot stand in for the selected node',async()=>{
  const g=netGraph(),course=networkTrial('444','agent:a','agent:b',.85);
  course.intervention={...course.intervention,network_regimen_id:'sequence:a_then_a',network_regimen_label:'A then maintenance A'};
  g.comparisons.push(course);
  const {view}=mount(g),indirect=view.indirect;
  indirect.toggle.click(); await nextFrame();
  indirect.choose('agent:a','sequence:a_then_a'); indirect.choose('agent:c','agent:c'); await nextFrame();
  assert.ok(Math.abs(indirect.fit.estimate-.9/.85)<1e-10);
  view.radialLeftId='agent:a'; view.isRadialBranch=()=>true;
  indirect.syncRadialLeft(view.radialLeftId); await nextFrame();
  assert.equal(indirect.first.regimen,'agent:a'); assert.equal(indirect.second.regimen,'agent:c');
  assert.ok(Math.abs(indirect.fit.estimate-.9/.7)<1e-10);
  const currentFit=indirect.fit;
  view.isRadialBranch=()=>false; indirect.refresh();
  assert.equal(indirect.controls.hidden,false); assert.equal(indirect.fit,currentFit);
  view.isRadialBranch=()=>true; indirect.syncRadialLeft(view.radialLeftId); indirect.refresh();
  assert.equal(indirect.controls.hidden,true); assert.equal(indirect.fit,currentFit);
  view.radialLeftId='agent:b'; indirect.syncRadialLeft(view.radialLeftId);
  assert.equal(indirect.network.status('agent:b').code,'no_partner');
  assert.equal(indirect.first,null); assert.equal(indirect.fit,null); assert.equal(indirect.second,null);
});

test('an external first treatment retains the original contrast, interval and trials when the second treatment is the radial center',async()=>{
  const g=netGraph();
  g.comparisons.push(networkTrial('444','agent:d','agent:b',.6));
  const {view}=mount(g),indirect=view.indirect;
  indirect.toggle.click(); await nextFrame();
  indirect.choose('agent:c','agent:c'); indirect.choose('agent:a','agent:a'); await nextFrame();
  const original=indirect.fit, pair=indirect.pair;
  assert.ok(Math.abs(original.estimate-.7/.9)<1e-10);
  view.radialLeftId='agent:a'; view.isRadialBranch=()=>true;
  indirect.syncRadialLeft('agent:a',{preservePair:true});
  assert.equal(indirect.fit,original); assert.equal(indirect.pair,pair);
  assert.deepEqual(indirect.radialSelection(),{activeId:'agent:c',leftIsNumerator:true,fit:original});
  assert.match(indirect.panel.textContent,/Agent A versus Agent C/);
  const matches=Object.fromEntries(g.comparisons.map(row=>[row.id,{matched:true}]));
  view.setAdvancedFilters({active:true,signature:'eligible',matches}); await nextFrame();
  assert.equal(indirect.radialSelection().leftIsNumerator,true);
  assert.equal(indirect.radialSelection().activeId,'agent:c');
  assert.equal(indirect.fit.estimate,original.estimate);
  assert.equal(indirect.fit.ci_lower,original.ci_lower);
  assert.equal(indirect.fit.ci_upper,original.ci_upper);
  indirect.chooseRadialComparator('agent:d'); await nextFrame();
  assert.equal(indirect.radialSelection().leftIsNumerator,false);
  assert.equal(indirect.first.regimen,'agent:a'); assert.equal(indirect.second.regimen,'agent:d');
  assert.ok(Math.abs(indirect.fit.estimate-.6/.7)<1e-10);
});

test('indirect node selection preserves a disabled bridge; the dotted comparison, source trials and direction match both views',async()=>{
  let publicationsLoaded=0;
  const {view}=mount(netGraph(), {loadNetworkPublications:()=>{publicationsLoaded++; return Promise.resolve(new Map());}});
  view.setBranch('all'); view.indirect.toggle.click(); await nextFrame();
  const indirect=view.indirect;
  assert.equal(indirect.toggle.textContent,'Compare two treatments indirectly');
  activate(view.nodeElements.get('agent:a'));
  assert.equal(indirect.first.regimen,'agent:a');
  assert.equal(view.nodeElements.get('agent:b').getAttribute('aria-disabled'),'true');
  assert.match(view.nodeElements.get('agent:b').getAttribute('aria-label'),/Direct comparison available/);
  view.nodeElements.get('agent:b').click(); assert.equal(indirect.second,null);
  view.nodeElements.get('agent:c').click(); await nextFrame();
  assert.equal(indirect.fit.available,true);
  assert.ok(Math.abs(indirect.fit.estimate-.9/.7)<1e-9);
  assert.equal(withClass(view.world,'tm-network-overlay').length,1);
  assert.match(indirect.panel.textContent,/HR 1.286 \(95% CI/);
  assert.equal(withClass(indirect.panel,'tm-network-estimate-value').length,1);
  const radialPaths=withClass(indirect.panel,'tm-network-pathways')[0];
  assert.equal(radialPaths.children[0].textContent,'Evidence pathways');
  assert.equal(radialPaths.children[1].children.length,0);
  assert.match(indirect.panel.textContent,/Indirect comparison · Agent C versus Agent A/);
  assert.doesNotMatch(indirect.panel.textContent,/Hazard ratio for|Each pathway compares/);
  assert.equal(withClass(view.world,'tm-network-arrow-direction')[0].textContent,'Agent C versus Agent A');
  assert.match(withClass(indirect.panel,'tm-network-plan')[0].textContent,/Events needed.+80% power.+E=/);
  assert.doesNotMatch(indirect.panel.textContent,/Supporting evidence/);
  assert.equal(withClass(view.world,'tm-network-arrow-label')[0].textContent,'HR 1.286');
  assert.equal(view.nodeElements.get('agent:b').classList.contains('tm-network-bridge'),true);
  view.setBranch('agent:b');
  assert.equal(indirect.first.regimen,'agent:a'); assert.equal(indirect.second.regimen,'agent:c');
  const branchPaths=withClass(indirect.panel,'tm-network-pathways')[0];
  branchPaths.open=true; branchPaths.dispatchEvent({type:'toggle'});
  assert.equal(withClass(branchPaths,'network-route-table').length,1);
  assert.match(withClass(branchPaths,'network-route-estimate')[0].textContent,/Pathway-specific HR 1.286/);
  assert.match(branchPaths.textContent,/Trial 111/); assert.match(branchPaths.textContent,/Trial 222/);
  const include=withClass(branchPaths,'network-route-include')[0];assert.equal(include.checked,true);
  include.checked=false;include.dispatchEvent({type:'change'});
  assert.match(indirect.panel.textContent,/Select at least one pathway/);
  assert.match(withClass(indirect.panel,'tm-network-selection-note')[0].textContent,/0 of 1 pathway included/);
  assert.equal(withClass(indirect.panel,'tm-network-weighting').length,0);
  assert.equal(withClass(view.world,'tm-network-overlay').length,0);
  include.checked=true;include.dispatchEvent({type:'change'});
  assert.equal(indirect.fit.available,true);
  assert.equal(withClass(indirect.panel,'tm-network-selection-note').length,0);
  await nextFrame();
  const loadsAfterOpening=publicationsLoaded;
  assert.equal(withClass(view.world,'tm-network-overlay').length,1);
  assert.equal(withClass(view.world,'tm-network-support-edge').length,2);
  const original=withClass(view.world,'tm-network-arrow')[0].getAttribute('d');
  const markerWidth=indirect.marker.getAttribute('markerWidth');
  view.zoom(1.7);
  assert.equal(withClass(view.world,'tm-network-arrow')[0].getAttribute('d'),original,'the same card ports stay connected through zoom');
  assert.notEqual(indirect.marker.getAttribute('markerWidth'),markerWidth);
  withClass(indirect.controls,'tm-text-button').find(b=>b.textContent==='Reverse comparison').click(); await nextFrame();
  assert.ok(Math.abs(indirect.fit.estimate-.7/.9)<1e-9);
  assert.equal(withClass(view.world,'tm-network-arrow-direction')[0].textContent,'Agent A versus Agent C');
  view.nodeElements.get('agent:b').click();
  assert.equal(indirect.second,null);
  assert.equal(indirect.panel.hidden,true);
  radialPaths.open=true; radialPaths.dispatchEvent({type:'toggle'});
  assert.equal(radialPaths.children[1].children.length,0);
  assert.equal(publicationsLoaded,loadsAfterOpening);
  assert.match(indirect.controls.textContent,/Direct comparison available/);
  assert.match(indirect.controls.textContent,/PMID 222/);
  assert.equal(withClass(view.world,'tm-network-overlay').length,0);
  view.setEndpoint('PFS:HR'); await nextFrame();
  assert.equal(indirect.first,null); assert.equal(indirect.panel.hidden,true);
  assert.equal(withClass(view.world,'tm-network-overlay').length,0);
  indirect.toggle.click();
  assert.equal(view.nodeElements.get('agent:a').getAttribute('aria-disabled'),null);
  view.nodeElements.get('agent:a').click(); assert.equal(view.selectedId,'agent:a');
});

test('unchecking one of two pathways updates the map estimate, required events, and arrow together',async()=>{
  const graph=netGraph();
  graph.comparisons.push(networkTrial('444','agent:a','agent:d',.4),networkTrial('555','agent:c','agent:d',.9));
  const {view}=mount(graph), indirect=view.indirect;
  view.setBranch('all'); indirect.toggle.click(); await nextFrame();
  view.nodeElements.get('agent:a').click(); view.nodeElements.get('agent:c').click(); await nextFrame();
  const number=()=>withClass(indirect.panel,'tm-network-plan')[0].textContent;
  const arrow=()=>withClass(view.world,'tm-network-arrow-label')[0].textContent;
  const initial={number:number(),arrow:arrow()};
  const details=withClass(indirect.panel,'tm-network-pathways')[0];
  details.open=true; details.dispatchEvent({type:'toggle'});
  const choices=withClass(details,'network-route-include');
  assert.equal(choices.length,2);
  choices[0].checked=false; choices[0].dispatchEvent({type:'change'});
  assert.match(withClass(indirect.panel,'tm-network-selection-note')[0].textContent,/1 of 2 pathways included/);
  assert.equal(withClass(indirect.panel,'tm-network-fit-label')[0].textContent,'Pathway-weighted sensitivity estimate');
  assert.match(withClass(indirect.panel,'tm-network-weighting')[0].textContent,/Pathway weighting/);
  assert.match(withClass(indirect.panel,'tm-network-benchmark')[0].textContent,/All pathways, same weighting · HR .+95% CI.+E=/);
  assert.equal(withClass(indirect.panel,'tm-network-diagnostics')[0].hidden,true);
  assert.match(withClass(indirect.panel,'tm-network-estimate-value')[0].textContent,/HR 2\.250/);
  assert.equal(arrow(),'HR 2.250'); assert.notEqual(number(),initial.number);
  choices[0].checked=true; choices[0].dispatchEvent({type:'change'});
  assert.deepEqual({number:number(),arrow:arrow()},initial);
  assert.equal(withClass(indirect.panel,'tm-network-selection-note').length,0);
  assert.equal(withClass(indirect.panel,'tm-network-weighting').length,0);
  assert.equal(withClass(indirect.panel,'tm-network-diagnostics')[0].hidden,false);
});

test('indirect mode clears stale work on clinical changes, rejects old network responses, and surfaces loading failure',async()=>{
  let resolveOld, loads=0; const graph=netGraph(), {view}=mount(graph,{loadNetworkGraph:()=>{
    loads++;
    if (loads===1) return new Promise(resolve=>{resolveOld=resolve;});
    if (loads===2) throw new Error('Map version changed.');
    return graph;
  }});
  view.setBranch('all'); const indirect=view.indirect; indirect.toggle.click();
  assert.match(indirect.panel.textContent,/Loading randomized/);
  view.setEndpoint('PFS:HR'); await nextFrame(); resolveOld(graph); await nextFrame();
  assert.match(indirect.panel.textContent,/Map version changed/);
  withClass(indirect.panel,'tm-button')[0].click(); await nextFrame();
  assert.equal(indirect.network.endpoint,'PFS:HR');
  view.setEndpoint('OS:HR'); await nextFrame();
  view.nodeElements.get('agent:a').click();view.nodeElements.get('agent:c').click();
  view.setAdvancedFilters({active:true,matches:{},signature:'no matches',label:'Stage III'}); await nextFrame();
  assert.equal(indirect.first,null); assert.equal(indirect.fit,null);
  assert.equal(withClass(view.world,'tm-network-overlay').length,0);
  assert.equal(view.nodeElements.get('agent:a').getAttribute('aria-disabled'),'true');
  view.destroy();
});

test('ambiguous visual nodes select a complete regimen before computing a comparison',async()=>{
  const graph=netGraph();
  const extra=networkTrial('444','agent:a','agent:b',.85);
  extra.intervention={...extra.intervention,network_regimen_id:'sequence:a_then_a',network_regimen_label:'A then maintenance A'};
  graph.comparisons.push(extra);
  const {view}=mount(graph); view.setBranch('all'); const indirect=view.indirect; indirect.toggle.click(); await nextFrame();
  view.nodeElements.get('agent:a').click();
  assert.equal(indirect.first,null);
  assert.match(indirect.choiceBox.textContent,/A then maintenance A/);
  withClass(indirect.choiceBox,'tm-button').find(b=>b.textContent==='A then maintenance A').click();
  assert.equal(indirect.first.regimen,'sequence:a_then_a');
  view.nodeElements.get('agent:c').click(); await nextFrame();
  assert.ok(Math.abs(indirect.fit.estimate-.9/.85)<1e-9);
  assert.match(indirect.panel.textContent,/Agent C versus A then maintenance A/);
  view.setNetworkModel('random'); await nextFrame();
  assert.match(view.details.textContent,/Random-effects network meta-analysis/);
  assert.match(indirect.panel.textContent,/Indirect estimate unavailable/);
  assert.equal(withClass(indirect.panel,'tm-network-estimate-value').length,0);
  assert.equal(withClass(indirect.panel,'tm-network-pathways').length,0);
  assert.doesNotMatch(indirect.panel.textContent,/HR 0.944/);
  view.setBranch('agent:d'); assert.equal(indirect.first,null);
  assert.equal(indirect.panel.hidden,true);
});

test('the sole eligible second course is selected directly for a multi-course node',async()=>{
  const g=netGraph(),extra=networkTrial('445','agent:c','agent:d',.9);
  extra.intervention={...extra.intervention,network_regimen_id:'sequence:c_then_control',network_regimen_label:'Agent C → Control'};
  g.comparisons.push(extra);
  const {view}=mount(g);view.setBranch('all');const indirect=view.indirect;
  indirect.toggle.click();await nextFrame();view.nodeElements.get('agent:a').click();
  view.nodeElements.get('agent:c').click();await nextFrame();
  assert.equal(indirect.choiceBox,null);assert.equal(indirect.second.regimen,'agent:c');
  assert.equal(indirect.fit.available,true);
});

test('saved estimates cannot replace a subsequent filtered target while its classifications are loading',async()=>{
  const graph=netGraph(); graph.content_sha256='network-fixture';
  let resolveFit,retries=0,lookups=[];
  const {view}=mount(graph,{
    lookupNetworkFit:(hash,blocks,a,c,model)=>{
      lookups.push([hash,blocks.length,a,c,model]);
      return new Promise(resolve=>{resolveFit=resolve;});
    },
    retryNetworkFilters:()=>retries++,
  });
  view.setBranch('all'); const indirect=view.indirect; indirect.toggle.click(); await nextFrame();
  view.nodeElements.get('agent:a').click(); view.nodeElements.get('agent:c').click(); await nextFrame();
  assert.deepEqual(lookups,[['network-fixture',2,'agent:c','agent:a','common']]);
  view.setAdvancedFilters({active:true,pending:true,label:'Loading selected filters…',matches:{}});
  assert.match(indirect.panel.textContent,/Loading selected filters/);
  resolveFit({estimate:10,ci_lower:9,ci_upper:11}); await nextFrame();
  assert.equal(indirect.fit,null); assert.equal(indirect.first,null);
  view.setAdvancedFilters({active:true,error:'Study classifications unavailable.',matches:{}});
  assert.match(indirect.panel.textContent,/Study classifications unavailable/);
  withClass(indirect.panel,'tm-button')[0].click(); assert.equal(retries,1);
  view.setAdvancedFilters({active:false,matches:{}}); await nextFrame();
  view.nodeElements.get('agent:a').click(); view.nodeElements.get('agent:c').click(); await nextFrame();
  resolveFit({estimate:.7775,ci_lower:.56,ci_upper:1.02}); await nextFrame();
  assert.match(indirect.panel.textContent,/HR 0.777 \(95% CI 0.560–1.020\)/);
});

test('an observational head-to-head estimate is displayed as arrowhead versus tail alongside the randomized indirect result',async()=>{
  const graph=netGraph(), observational=networkTrial('555','agent:c','agent:a',.8);
  observational.title='A retrospective cohort study'; observational.analysis.design='observational';
  graph.comparisons.push(observational);
  let opened=null;
  const {view}=mount(graph,{openNetworkStudy:async pmid=>{opened=pmid;}});
  view.setBranch('all'); const indirect=view.indirect; indirect.toggle.click(); await nextFrame();
  view.nodeElements.get('agent:a').click(); view.nodeElements.get('agent:c').click(); await nextFrame();
  const details=withClass(indirect.panel,'tm-network-observational')[0];
  assert.ok(details); assert.match(details.textContent,/Observational head-to-head evidence/);
  assert.match(details.textContent,/Agent C versus Agent A/); assert.match(details.textContent,/HR 0.800 \(95% CI 0.640–0.960\)/);
  assert.equal(indirect.selectedPair.trials.length,2);
  assert.doesNotMatch(indirect.panel.textContent,/Supporting evidence/);
  assert.ok(Math.abs(indirect.fit.estimate-.9/.7)<1e-9);
  withClass(details,'tm-text-button')[0].click(); assert.equal(opened,'555');
});
