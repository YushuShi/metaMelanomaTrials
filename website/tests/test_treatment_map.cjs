'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const map = require('../dist/treatment_map.js');
const chooseSource = require('./fixtures/select_map_source.cjs');
const drug = (id, label) => ({ id: 'agent:' + id, type: 'drug', label, components: [id], count_summary: { known_n: 180, identified_studies: 2, known_n_studies: 1, status: 'partial' } });
const regimen = (id, components) => ({ id, type: 'combination', label: components.join(' + '), components, count_summary: { known_n: 100, identified_studies: 1, status: 'partial' } });
const graph = {
  nodes: [drug('a', 'Agent A'), drug('b', 'Agent B'), drug('c', 'Agent C'), drug('isolated', 'Isolated agent'), regimen('ab', ['a', 'b']), regimen('abc', ['a', 'b', 'c'])],
  relationships: [
    { parent_id: 'agent:a', child_id: 'ab', documented_add_on: true },
    { parent_id: 'agent:b', child_id: 'ab', documented_add_on: false },
    { parent_id: 'ab', child_id: 'abc', documented_add_on: false },
    { parent_id: 'agent:c', child_id: 'abc', documented_add_on: false },
  ],
  comparisons: [{ id: 'direct', intervention: { node_id: 'ab', label: 'A + B' }, comparator: { node_id: 'agent:a', label: 'A' }, estimate: 0.63, measure: 'HR', ci_lower: 0.51, ci_upper: 0.78, ci_level: 95, outcome: 'Overall survival' }],
};
test('the complete radial catalogue includes isolated agents and all combinations', () => {
  const model = map.prepare(graph), all = map.layout(model, 'all');
  assert.equal(all.nodes.length, 6); assert.equal(all.positions.size, 6); assert.ok(all.positions.has('agent:isolated'));
  for (const position of all.positions.values()) { assert.ok(Number.isFinite(position.x)); assert.ok(Number.isFinite(position.y)); }
});
test('every constituent branch reaches the complete combination through deterministic closest subsets', () => {
  const model = map.prepare(graph);
  assert.deepEqual(map.branchNodes(model, 'agent:b').map((n) => n.id), ['agent:b', 'ab', 'abc']);
  assert.equal(map.layout(model, 'agent:b').parents.get('ab'), 'agent:b');
  assert.equal(map.layout(model, 'agent:b').parents.get('abc'), 'ab');
  assert.equal(map.layout(model, 'agent:c').parents.get('abc'), 'agent:c');
  assert.equal(map.layout(model, 'all').parents.get('ab'), 'agent:a');
  assert.equal(map.layout(model, 'all').parents.get('abc'), 'ab');
  const reversed = map.prepare({ ...graph, nodes: [...graph.nodes].reverse(), relationships: [...graph.relationships].reverse() });
  assert.deepEqual([...map.layout(model, 'all').positions].sort(), [...map.layout(reversed, 'all').positions].sort());
});
test('branch cards keep layout coordinates independent of dose, chronology and effect values', () => {
  const model = map.prepare(graph), before = map.layout(model, 'agent:a');
  const after = map.layout(map.prepare({ ...graph, comparisons: [{ ...graph.comparisons[0], estimate: 0.1 }] }), 'agent:a');
  assert.deepEqual([...before.positions], [...after.positions]);
  assert.equal(model.relationships.filter((edge) => edge.documented_add_on).length, 1);
});
test('effect labels standardize supported intervals to 95%, retain source details and complete-arm endpoints', () => {
  assert.equal(map.effectLabel(graph.comparisons[0]), 'HR 0.630 (95% CI 0.510–0.780)');
  assert.equal(map.effectLabel({ ...graph.comparisons[0], ci_level: 0.99 }), 'HR 0.630 (95% CI 0.536–0.741; converted)');
  assert.equal(map.effectLabel({ ...graph.comparisons[0], ci_level: 0.99 }, {original:true}), 'HR 0.630 (99% CI 0.510–0.780)');
  assert.equal(map.effectLabel({ ...graph.comparisons[0], ci_level:99,ci_method:'profile likelihood'}),'HR 0.630 (95% CI unavailable)');
  assert.equal(map.effectLabel({ ...graph.comparisons[0], ci_level:99,ci_method:'profile likelihood'},{original:true}),'HR 0.630 (99% CI 0.510–0.780)');
  assert.equal(map.effectLabel({ ...graph.comparisons[0], estimate: 0.0000567, ci_lower: 0.0000123, ci_upper: 0.0000901 }), 'HR 5.670e-5 (95% CI 1.230e-5–9.010e-5)');
  const model = map.prepare({ ...graph, comparisons: [...graph.comparisons, { ...graph.comparisons[0], id: 'same', comparator: { node_id: 'ab' } }, { ...graph.comparisons[0], id: 'review', estimate: 'Review needed' }] });
  assert.equal(model.comparisons.length, 1);
  assert.equal(model.comparisons[0].intervention.node_id, 'ab'); assert.equal(model.comparisons[0].comparator.node_id, 'agent:a');
});
test('count completeness is explicit and the browser retains the precomputed values', () => {
  assert.equal(map.countLabel({ count_summary: { known_n: 630, status: 'calculated' } }), 'N=630');
  assert.equal(map.countLabel({ count_summary: { known_n: 630, status: 'partial' } }), 'N=630*');
  assert.equal(map.countLabel({ count_summary: { known_n: 630, status: 'provisional' } }), 'N=630†');
  assert.equal(map.countLabel({ count_summary: { known_n: null, status: 'unresolved' } }), 'N unresolved');
  assert.equal(map.prepare(graph).byId.get('agent:a').count_summary.known_n, 180);
  assert.equal(map.prepare(graph).byId.get('ab').count_summary.known_n, 100);
});
test('counted arms exclude relevant but withheld source records and reconcile only allocated contributions', () => {
  const node = { ...drug('a', 'A'), contribution_ids: ['counted', 'withheld', 'other-node'] };
  const model = map.prepare({ nodes: [node], contributions: [
    { id: 'counted', node_ids: ['agent:a'], n: 80 },
    { id: 'withheld', node_ids: [], relevant_node_ids: ['agent:a'], n: null, available_n: 100 },
    { id: 'other-node', node_ids: ['agent:b'], relevant_node_ids: ['agent:a', 'agent:b'], n: 40 },
  ] });
  const counted = map.countedContributions(model, node); assert.equal(counted.length, 1); assert.equal(counted.reduce((total, item) => total + item.n, 0), 80);
});
test('radial groups follow canonical broad categories and keep each class contiguous', () => {
  const classified = { ...graph, nodes: graph.nodes.map((node) => ({ ...node, broad_category: node.id === 'agent:a' || node.id === 'agent:c' ? 'ici' : node.id === 'agent:b' ? 'cytokines' : 'other' })) };
  const model = map.prepare(classified), radial = map.layout(model, 'all');
  assert.deepEqual(radial.sectors.map((sector) => sector.id), ['ici', 'cytokines', 'other']);
  assert.deepEqual(radial.sectors[0].root_ids, ['agent:a', 'agent:c']);
  assert.equal(radial.sectors.reduce((sum, sector) => sum + sector.agent_count, 0), 4);
  const rootOrder = model.agents.map((node) => ({ node, point: radial.positions.get(node.id) })).sort((a, b) => a.point.angle - b.point.angle);
  assert.deepEqual(rootOrder.map(({ node }) => node.broad_category), ['ici', 'ici', 'cytokines', 'other']);
  assert.equal(radial.positions.get('ab').group_id, 'ici'); assert.equal(radial.positions.get('abc').group_id, 'ici');
  assert.deepEqual([...radial.parents], [...map.layout(map.prepare(graph), 'all').parents]);
  const reversed = map.layout(map.prepare({ ...classified, nodes: [...classified.nodes].reverse() }), 'all');
  assert.deepEqual(radial.sectors, reversed.sectors); assert.deepEqual([...radial.positions].sort(), [...reversed.positions].sort());
  assert.deepEqual([...map.layout(model, 'agent:b').positions], [...map.layout(map.prepare(graph), 'agent:b').positions]);
  for (const sector of radial.sectors) { assert.ok(sector.end > sector.start); assert.ok(sector.outer_radius > sector.inner_radius); assert.doesNotMatch(map.annularSectorPath(sector.inner_radius, sector.outer_radius, sector.start, sector.end), /NaN|Infinity/); }
});
test('class mapping keeps ICI, other immunotherapy, cytokines and unknown registry classes distinct', () => {
  assert.equal(map.categoryInfo({ broad_category: 'ici' }).class_id, 'ici');
  assert.equal(map.categoryInfo({ broad_category: 'immunotherapy' }).label, 'Other immunotherapy');
  assert.equal(map.categoryInfo({ broad_category: 'cytokines' }).class_id, 'cytokines');
  assert.equal(map.categoryInfo({ broad_category: 'new_registry_kind' }).id, 'new_registry_kind');
  assert.equal(map.categoryInfo({ broad_category: 'new_registry_kind' }).class_id, 'other');
  assert.equal(map.categoryInfo({}).label, 'Other / unclassified');
});
test('radial subgroups occupy separate clefts in one broad color in saved and live views', () => {
  const agent = (id, label, category, subgroup) => ({
    ...drug(id,label), broad_category:category, class_id:subgroup.id, radial_subgroup:subgroup,
  });
  const pd1={id:'pd1',label:'PD-1 inhibitors'}, ctla4={id:'ctla4',label:'CTLA-4 inhibitors'}, vegf={id:'vegf',label:'VEGF inhibitors'};
  const source={content_sha256:'subgroup-fixture', nodes:[
    agent('a','A PD-1','ici',pd1), agent('b','B CTLA-4','ici',ctla4),
    agent('c','C PD-1','ici',pd1), agent('d','D VEGF','targeted',vegf),
    regimen('ad',['a','d']),
  ]};
  const model=map.prepare(source), tree=map.layout(model,'all');
  const [checkpoint,targeted]=tree.sectors;
  const [ctla,pd]=checkpoint.segments;
  assert.deepEqual(checkpoint.root_ids,['agent:b','agent:a','agent:c']);
  assert.deepEqual([ctla.id,pd.id,targeted.segments[0].id],['ctla4','pd1','vegf']);
  assert.ok(pd.start>ctla.end);
  assert.ok(targeted.start-checkpoint.end>pd.start-ctla.end);
  assert.equal(tree.positions.get('ad').subgroup_id,'pd1');
  assert.ok(tree.positions.get('ad').angle>=pd.start && tree.positions.get('ad').angle<=pd.end);
  const saved=map.buildDefaultViews(model);
  const loaded=map.prepare({...source,default_views:JSON.parse(JSON.stringify(saved))});
  assert.deepEqual(map.preparedLayout(loaded,'all').sectors,tree.sectors);
  const {root,view}=mountedFixture(source);view.setBranch('all');
  const paths=withClass(root,'tm-category-sector');
  assert.deepEqual(paths.map(p=>p.getAttribute('data-subgroup-id')),['ctla4','pd1','vegf']);
  assert.match(paths[0].textContent,/CTLA-4 inhibitors/);
  assert.equal(view.nodeElements.get('agent:a').getAttribute('data-treatment-class'),'ici');
  assert.equal(view.nodeElements.get('agent:b').getAttribute('data-treatment-class'),'ici');
  assert.deepEqual(withClass(view.nodeElements.get('ad'),'tm-component-dot').map(dot=>dot.getAttribute('data-treatment-class')),['ici','targeted']);
  // An overview with only one broad category still has a cleft at the seam.
  const single=map.layout(map.prepare({nodes:source.nodes.slice(0,3)}),'all').sectors[0];
  assert.ok(single.start+Math.PI*2-single.end>0.03);
  view.destroy();
});
test('source-supported regimens awaiting study linkage show publications rather than zero studies', () => {
  const node = { count_summary: { identified_studies: 0, publication_count: 1, unlinked_publications: 1, known_n: 14, status: 'provisional' } };
  assert.equal(map.studyLabel(node), '1 supporting publication; study linkage pending');
  assert.equal(map.studyLabel(node, true), '1 publication');
  assert.equal(map.countLabel(node), 'N=14†');
  assert.equal(map.studyLabel({ count_summary: { identified_studies: 0, unlinked_publications: 3 } }), '3 supporting publications; study linkage pending');
  assert.equal(map.studyLabel({ count_summary: { identified_studies: 0, publication_count: 0 } }), 'No linked evidence');
  assert.equal(map.studyLabel({ count_summary: { identified_studies: 2, publication_count: 4 } }), '2 identified studies');
});

// Small event-capable DOM fixture exercises the mounted view, including mode transitions.
class ViewElement {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.attributes = {}; this.listeners = new Map(); this.dataset = {}; this.className = ''; this.hidden = false; this._text = ''; this._value = ''; this.clientWidth = 900; this.clientHeight = 600;
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.classList = { contains: (name) => this.className.split(/\s+/).includes(name), add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); }, remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => !names.includes(name)).join(' '); }, toggle: (name, force) => { const show = force ?? !this.classList.contains(name); this.classList[show ? 'add' : 'remove'](name); return show; } };
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
  get options() { return this.children.flatMap((child) => child.tagName === 'OPTION' ? [child] : child.options); }
  set value(value) { this._value = this.tagName === 'SELECT' && !this.options.some((option) => option.value === value) ? '' : value; }
  get value() { return this._value; }
  get selectedOptions() { return this.options.filter((option) => option.value === this.value); }
}
function mountedFixture(source = graph, options) {
  const document = { defaultView: { setTimeout }, createElement(tag) { return new ViewElement(tag, this); }, createElementNS(namespace, tag) { return this.createElement(tag); } };
  const root = new ViewElement('div', document);
  const fixture = { ...source, nodes: source.nodes.map((node) => ({ ...node, contribution_ids: ['included'] })), contributions: [
    { id: 'included', node_ids: ['agent:a', 'ab'], n: 100, pmid: '123', arm_label: 'A + B' },
    { id: 'withheld', relevant_node_ids: ['agent:a', 'ab'], node_ids: [], n: null, available_n: 30, pmid: '456' },
  ] };
  const view = map.mount(root, fixture, options).setBranchLayout('branch');
  return { root, view, fixture };
}
const descendants = (element) => element.children.flatMap((child) => [child, ...descendants(child)]);
const withClass = (element, name) => descendants(element).filter((child) => child.classList.contains(name));

function chooseOverview(view) {
  const option = view.selector.options.find(item => item.textContent === 'All treatments · radial overview');
  assert.ok(option, 'the catalogue overview must be reachable from the treatment picker');
  view.selector.value = option.value;
  view.selector.dispatchEvent({ type: 'change' });
}

test('mounted branch → overview → branch clears detailed evidence and restores it on opening a node', () => {
  const { root, view } = mountedFixture();
  assert.equal(view.branchId, 'agent:a'); assert.equal(view.comparisonBand.hidden, false);
  assert.equal(view.categoryLegend.hidden,false);assert.equal(withClass(view.categoryLegend,'tm-category-legend-title')[0].textContent,'Treatment classes');
  assert.ok(view.categoryLegend.parentNode.children.indexOf(view.categoryLegend)<view.legend.parentNode.children.indexOf(view.legend));
  assert.equal(map.recordCoverage(view.model,view.model.byId.get('agent:a')).unlinkedPublications,1);
  assert.equal(withClass(view.details,'tm-coverage').length,0);
  assert.equal(withClass(view.details,'tm-detail-stats')[0].textContent,'2identified studiesN=180*N from 1 study');
  assert.equal(view.branchCount.textContent,'3 branch nodes');
  assert.equal(withClass(view.details, 'tm-detail-comparisons').length, 0); assert.equal(withClass(view.details, 'tm-arms').length, 0);
  assert.doesNotMatch(view.details.textContent, /Direct comparisons|Study & outcome|Counted treatment arms|Uncounted arms & source review/);
  chooseOverview(view);
  assert.equal(view.tree.overview, true); assert.equal(view.comparisonBand.hidden, true); assert.equal(view.comparisonBand.children.length, 0);
  assert.equal(withClass(view.details, 'tm-detail-comparisons').length, 0); assert.equal(withClass(view.details, 'tm-arms').length, 0); assert.equal(withClass(view.details, 'tm-coverage').length, 0);
  assert.equal(view.branchCount.hidden, true); assert.equal(view.comparisonLegendItem.hidden, false);
  assert.equal(withClass(view.details, 'tm-endpoint-field').length, 1);
  assert.equal(withClass(root, 'tm-category-sector').length, 1); assert.equal(view.categoryLegend.hidden, false);
  assert.match(view.categoryLegend.textContent,/named agents/);
  assert.equal(withClass(view.details, 'tm-open-branch').length, 1); assert.match(view.details.textContent, /Agent A.*N=180/);
  withClass(view.details, 'tm-open-branch')[0].click();
  assert.equal(view.branchId, 'agent:a'); assert.equal(view.comparisonBand.hidden, false); assert.equal(view.branchCount.hidden, false); assert.equal(view.comparisonLegendItem.hidden, false);
  assert.equal(withClass(view.details, 'tm-detail-comparisons').length, 0); assert.equal(withClass(view.details, 'tm-arms').length, 0);
  assert.doesNotMatch(view.details.textContent, /Direct comparisons|Study & outcome|Counted treatment arms|Uncounted arms & source review/);
  view.destroy(); assert.equal(root.children.length, 0);
});

test('the branch center stays pink when other nodes are selected and follows each new root', () => {
  const { view } = mountedFixture();
  const centers = () => [...view.nodeElements].filter(([, element]) => element.classList.contains('tm-branch-center')).map(([id]) => id);
  view.setBranch('agent:a');
  assert.deepEqual(centers(), ['agent:a']);
  assert.match(view.nodeElements.get('agent:a').getAttribute('aria-label'), /Branch center/);
  assert.ok(withClass(view.nodeElements.get('agent:a'), 'tm-name-dot').length);
  view.select('ab');
  assert.deepEqual(centers(), ['agent:a']);
  view.setBranch('ab');
  assert.deepEqual(centers(), ['ab']);
  view.setBranch('all');
  assert.deepEqual(centers(), []);
});

test('branch category counts follow visible add-on labels, opposing regimens and controls rather than the catalogue',()=>{
  const classified=(id,label,category)=>({...drug(id,label),broad_category:category,class_id:category});
  const source={nodes:[classified('a','Alpha','ici'),classified('b','Beta','targeted'),classified('c','Gamma','cytokines'),classified('d','Delta','chemotherapy'),classified('e','Epsilon','chemotherapy'),classified('hidden','Off-branch agent','radiotherapy'),regimen('ab',['a','b']),regimen('cde',['c','d','e'])],relationships:[{parent_id:'agent:a',child_id:'ab'},{parent_id:'agent:b',child_id:'ab'},{parent_id:'agent:c',child_id:'cde'},{parent_id:'agent:d',child_id:'cde'},{parent_id:'agent:e',child_id:'cde'}],comparisons:[{...graph.comparisons[0],id:'ab-cde',intervention:{node_id:'ab',label:'Alpha + Beta'},comparator:{node_id:'cde',label:'Gamma + Delta + Epsilon'}},{...graph.comparisons[0],id:'a-control',intervention:{node_id:'agent:a',label:'Alpha'},comparator:{label:'Placebo'}}]};
  const before=JSON.stringify(source),{view}=mountedFixture(source),legend=()=>Object.fromEntries(descendants(view.categoryLegend).filter(x=>x.tagName==='LI').map(x=>[x.dataset.treatmentClass,Number(x.children.find(c=>c.tagName==='STRONG').textContent)]));
  view.setBranch('agent:a');assert.equal(view.drugNameParts(view.model.byId.get('ab'),true).prefix,'+ ');
  assert.deepEqual(legend(),{ici:1,targeted:1,chemotherapy:1,cytokines:1,controls:1});
  assert.equal(view.tree.parallelNodes.some(node=>node.id==='cde'),true,'the complete opposing regimen is shown');
  assert.equal(descendants(view.categoryLegend).filter(x=>x.tagName==='LI').every(x=>x.dataset.nodeCount==='1'),true,'two chemotherapy components on one card count as one node');
  view.setBranch('all');assert.deepEqual(legend(),{ici:1,targeted:1,chemotherapy:2,cytokines:1,radiotherapy:1});
  assert.match(view.categoryLegend.textContent,/named agents/);
  view.setBranch('agent:hidden');assert.deepEqual(legend(),{radiotherapy:1});assert.equal(withClass(view.categoryLegend,'tm-category-legend-title')[0].textContent,'Treatment classes');
  assert.equal(JSON.stringify(source),before);
});

test('reading guidance keeps concise count and model definitions without exposing review summaries',()=>{
  const source={...graph,review:{summary:{unlinked_publications:20,review_items:90}}},before=JSON.stringify(source),{root}=mountedFixture(source),content=withClass(root,'tm-methods-content')[0],paragraphs=content.children.filter(node=>node.tagName==='P').map(node=>node.textContent);
  assert.equal(paragraphs.length,2);
  assert.equal(paragraphs[0],'For an add-on agent, the arrow runs from the original regimen to the expanded regimen.');
  assert.match(paragraphs[1],/^The analysis model follows.*two use fixed-effect pooling.*three or more use random-effects pooling with REML.*leave-one-out analysis\.$/);
  const statuses=withClass(root,'tm-status-key')[0].children.map(node=>node.textContent);
  assert.deepEqual(statuses,['N','Calculated from linked, eligible exact treatment arms.','N*','Partial known N; some arms or overlaps remain unresolved.','N†','Provisional N; study identity or linkage remains uncertain.','N unresolved','No defensible arm total is available.']);
  assert.doesNotMatch(content.textContent,/Source review:|source-supported trial identifiers|historical ancestry|Unspecified classes|Reversed arrows|source-supported estimate/);
  assert.equal(JSON.stringify(source),before,'underlying review evidence stays intact');
});

test('every overview node can open a branch, including a combination with its proper supersets', () => {
  const { view } = mountedFixture(); view.setBranch('all'); view.nodeElements.get('ab').click();
  assert.equal(view.selectedId, 'ab'); assert.equal(view.comparisonBand.hidden, true);
  withClass(view.details, 'tm-open-branch')[0].click();
  assert.equal(view.branchId, 'ab'); assert.equal(view.selector.value, 'ab'); assert.deepEqual(view.tree.nodes.map((node) => node.id), ['ab', 'abc']);
  assert.equal(view.tree.parents.get('abc'), 'ab'); assert.equal(view.comparisonBand.hidden, false);
  assert.equal(view.selector.options.filter((option) => option.value === 'ab').length, 1);
  chooseOverview(view); assert.equal(view.selector.value, ''); assert.equal(view.selector.options.length, 5);
  view.selector.value = 'agent:b'; view.selector.dispatchEvent({ type: 'change' });
  assert.equal(view.branchId, 'agent:b'); assert.equal(view.selector.options.length, 5); assert.equal(view.combinationOption, null);
});

test('mounted overview removes introductory, scope, annular and central wording while keeping compact counts', () => {
  const { root, view } = mountedFixture(); view.setBranch('all');
  assert.equal(withClass(root,'tm-catalog-count').length,0);
  assert.equal(view.branchCount.textContent,'');
  for (const name of ['tm-intro', 'tm-scope', 'tm-category-note', 'tm-sector-label', 'tm-radial-heading', 'tm-radial-subheading', 'tm-radial-note']) assert.equal(withClass(root, name).length, 0, name);
  assert.doesNotMatch(root.textContent, /Explore named agents, complete regimens|Agents share a sector|NAMED AGENTS|Select any node to explore|Study-table filters do not change this map/);
  assert.equal(withClass(root, 'tm-component-badge').length, 1);
});

const parallelFixture = {
  ...graph,
  nodes: [...graph.nodes, drug('d', 'Agent D'), { ...regimen('bc', ['b', 'c']), label: 'Agent B + Agent C' }],
  comparisons: [
    ...graph.comparisons,
    { id: 'a-b-os', intervention: { node_id: 'agent:a', label: 'Agent A' }, comparator: { node_id: 'agent:b', label: 'Agent B' }, measure: 'HR', estimate: 0.75, ci_lower: 0.6, ci_upper: 0.9, ci_level: 95, outcome: 'Overall survival', pmid: '111', default_rank: 2019 },
    { id: 'b-a-pfs', intervention: { node_id: 'agent:b', label: 'Agent B' }, comparator: { node_id: 'agent:a', label: 'Agent A' }, measure: 'HR', estimate: 1.5, ci_lower: 1.1, ci_upper: 2.1, ci_level: 95, outcome: 'Progression-free survival', pmid: '112', default_rank: 2020 },
    { id: 'a-b-followup', intervention: { node_id: 'agent:a', label: 'Agent A' }, comparator: { node_id: 'agent:b', label: 'Agent B' }, measure: 'HR', estimate: 0.8, outcome: 'Overall survival', pmid: '111', default_rank: 2021 },
    { id: 'a-bc', intervention: { node_id: 'agent:a', label: 'Agent A' }, comparator: { node_id: 'bc', label: 'Agent B + Agent C' }, measure: 'HR', estimate: 0.7, outcome: 'Overall survival', pmid: '113' },
    { id: 'ab-d', intervention: { node_id: 'ab', label: 'Agent A + Agent B' }, comparator: { node_id: 'agent:d', label: 'Agent D' }, measure: 'HR', estimate: 0.6, outcome: 'Overall survival', pmid: '114' },
    { id: 'a-placebo', intervention: { node_id: 'agent:a', label: 'Agent A' }, comparator: { node_id: null, label: 'placebo' }, measure: 'HR', estimate: 0.9, outcome: 'Overall survival', pmid: '115' },
    { id: 'a-double-placebo', intervention: { node_id: 'agent:a', label: 'Agent A' }, comparator: { node_id: null, label: 'placebo + placebo' }, measure: 'HR', estimate: 0.91, outcome: 'Overall survival', pmid: '116' },
  ],
};

test('parallel arms use exact complete root endpoints, deduplicate opponents, and preserve source directions', () => {
  const before = JSON.stringify(parallelFixture), model = map.prepare(parallelFixture), parallel = map.parallelArms(model, 'agent:a');
  assert.deepEqual(parallel.nodes.map((node) => node.id), ['agent:b', 'bc', 'control:placebo']);
  assert.ok(!parallel.nodes.some((node) => node.id === 'ab' || node.id === 'abc' || node.id === 'agent:d'));
  const pair = parallel.edges.find((edge) => edge.opponent_id === 'agent:b');
  assert.deepEqual(pair.comparison_ids, ['a-b-os', 'b-a-pfs', 'a-b-followup']); assert.deepEqual(pair.publication_ids, ['111', '112']);
  assert.equal(parallel.nodes.find((node) => node.id === 'bc').label, 'Agent B + Agent C');
  const reverse = map.parallelArms(model, 'agent:b').edges.find((edge) => edge.opponent_id === 'agent:a'); assert.deepEqual(reverse.comparison_ids, pair.comparison_ids);
  assert.equal(model.comparisons.find((comparison) => comparison.id === 'b-a-pfs').estimate, 1.5);
  assert.equal(JSON.stringify(parallelFixture), before);
});

test('left-arm layout never changes containment parents or recursively adds the opponent branch', () => {
  const model = map.prepare(parallelFixture), core = map.branchNodes(model, 'agent:a'), laid = map.layout(model, 'agent:a');
  assert.deepEqual(laid.nodes.map((node) => node.id), core.map((node) => node.id));
  assert.deepEqual([...laid.parents], [...map.displayParents(model, core, 'agent:a')]);
  for (const peer of laid.parallelNodes) {
    for (const edge of laid.parallelEdges.filter((item) => item.opponent_id === peer.id)) assert.ok(laid.positions.get(peer.id).x < laid.positions.get(edge.root_id).x);
    assert.ok(!laid.parents.has(peer.id)); assert.ok(!laid.children.has(peer.id));
  }
  assert.equal(laid.parents.get('ab'), 'agent:a'); assert.equal(laid.parents.get('abc'), 'ab');
  assert.deepEqual(map.layout(model, 'ab').parallelNodes.map((node) => node.id), ['agent:a', 'agent:d']);
  const overview = map.layout(model, 'all'); assert.equal(overview.nodes.length, parallelFixture.nodes.length); assert.equal(overview.parallelNodes.length, 0); assert.equal(overview.parallelEdges.length, 0);
});

test('mounted parallel nodes and dashed links scope source choices and retain a reversed reported estimate', () => {
  const { view } = mountedFixture(parallelFixture), pair = view.tree.parallelEdges.find((edge) => edge.opponent_id === 'agent:b');
  assert.equal(withClass(view.world, 'tm-parallel-node').length, 4);
  for (const path of withClass(view.world, 'tm-parallel-edge')) assert.ok(['marker-start', 'marker-end'].some(attribute => /^url\(/.test(path.getAttribute(attribute) || '')));
  view.parallelLinks.get(pair.id).click();
  assert.equal(view.selectedId, 'agent:a'); assert.equal(view.selectedComparisonPairId, pair.id); assert.equal(view.activeComparisonId, 'a-b-os');
  assert.deepEqual(view.comparisonChoices().map((comparison) => comparison.id), ['a-b-os', 'a-b-followup']);
  view.setEndpoint('PFS:HR');
  assert.equal(view.activeComparisonId, 'b-a-pfs');
  const arms = withClass(view.comparisonBand, 'tm-comparison-arm');
  assert.match(arms[0].textContent, /InterventionAgent B/); assert.match(arms[1].textContent, /ComparatorAgent A/); assert.match(view.comparisonBand.textContent, /HR 1\.5/);
  assert.match(view.parallelLinks.get(pair.id).getAttribute('aria-label'), /Agent B versus Agent A/);
  assert.doesNotMatch(withClass(view.comparisonBand, 'tm-arrow-interpretation')[0].textContent, /reciprocal/i);
  view.nodeElements.get('agent:b').click(); assert.equal(view.selectedId, 'agent:b'); assert.equal(view.branchId, 'agent:a'); assert.equal(view.selectedComparisonPairId, pair.id);
  assert.deepEqual(view.comparisonChoices().map((comparison) => comparison.id), ['b-a-pfs']);
});

test('initial root selection prefers a ranked parallel estimate and preserves an explicit add-on choice', () => {
  const source = { ...parallelFixture, comparisons: [
    { ...graph.comparisons[0], default_rank: 2000 },
    { ...parallelFixture.comparisons[1], estimate: 1.3, default_rank: 2019 },
    { ...parallelFixture.comparisons[2], estimate: 0.01, default_rank: 2020 },
  ] };
  const { view } = mountedFixture(source), pair = view.tree.parallelEdges[0];
  assert.equal(view.activeComparisonId, 'a-b-os');
  assert.equal(Number(withClass(view.comparisonBand, 'tm-effect-link')[0].getAttribute('data-estimate')), 1 / 1.3);
  assert.equal(view.model.comparisons.find(item => item.id === 'a-b-os').estimate, 1.3);
  assert.ok(view.parallelLinks.get(pair.id).classList.contains('tm-active-comparison'));
  assert.deepEqual(view.comparisonChoices().map((item) => item.id), ['direct', 'a-b-os']);
  const addOn = view.tree.comparisonEdges.find(edge => edge.comparison_ids.includes('direct'));
  view.parallelLinks.get(addOn.id).click();
  view.nodeElements.get('agent:a').click();
  assert.equal(view.activeComparisonId, 'direct'); assert.match(view.comparisonBand.textContent, /HR 0\.63/);
  assert.equal(view.parallelLinks.get(pair.id).classList.contains('tm-active-comparison'), false);
  view.setBranch('agent:a'); assert.equal(view.activeComparisonId, 'direct');
});

test('neutral parallel cards have no invented study or participant totals and disappear in the overview', () => {
  const { view } = mountedFixture(parallelFixture), control = view.nodeElements.get('control:placebo');
  assert.ok(control.classList.contains('tm-control-node')); assert.match(control.textContent, /Neutral comparison arm/); assert.doesNotMatch(control.textContent, /N=|N unresolved|0 studies|identified studies/);
  control.click(); assert.equal(view.selectedId, 'control:placebo'); assert.equal(withClass(view.details, 'tm-detail-stats').length, 0); assert.equal(withClass(view.details, 'tm-arms').length, 0); assert.equal(view.activeComparisonId, 'a-placebo');
  assert.equal(view.comparisonBand.hidden, false);
  chooseOverview(view); assert.equal(withClass(view.world, 'tm-parallel-node').length, 0);
  assert.ok(withClass(view.world, 'tm-parallel-link').every(element => element.getAttribute('data-comparison-kind') === 'addon'));
  assert.equal(withClass(view.world, 'tm-parallel-estimate').length, 0); assert.equal(view.comparisonBand.hidden, true);
});

test('only repeated concurrent placebo controls merge, retaining every source and reported direction', () => {
  for (const label of ['placebo', ' PLACEBO ', 'placebo+PLACEBO', 'placebo + placebo + placebo', ' placebo\t+\nPLACEBO ']) {
    assert.deepEqual(map.neutralControl(label), { id: 'control:placebo', type: 'control', label: 'Placebo', components: [], class_id: 'controls' });
  }
  for (const label of ['drug + placebo', 'placebo OR placebo', 'placebo followed by placebo', 'placebo → placebo', 'observation', 'placebo++placebo']) assert.notEqual(map.neutralControl(label).id, 'control:placebo');
  const source = { ...parallelFixture, comparisons: [...parallelFixture.comparisons,
    { id: 'reverse-placebo', intervention: { node_id: null, label: 'PLACEBO+placebo', source_arm_label: 'PLACEBO+placebo' }, comparator: { node_id: 'agent:a', label: 'Agent A', source_arm_label: 'Agent A + placebo' }, measure: 'HR', outcome: 'Overall survival', estimate: 1.7, pmid: '116' },
  ] };
  const before = JSON.stringify(source), { view } = mountedFixture(source), pair = view.tree.parallelEdges.find((edge) => edge.opponent_id === 'control:placebo');
  assert.equal(view.tree.parallelNodes.filter((node) => node.type === 'control').length, 1);
  assert.deepEqual([...pair.comparison_ids].sort(), ['a-double-placebo', 'a-placebo', 'reverse-placebo']);
  assert.deepEqual(pair.publication_ids, ['115', '116']);
  view.parallelLinks.get(pair.id).click();
  chooseSource(view, 'reverse-placebo');
  assert.equal(withClass(view.comparisonBand, 'tm-comparison-arm')[0].textContent, 'InterventionPlacebo');
  assert.match(withClass(view.comparisonBand, 'tm-comparison-arm')[1].textContent, /ComparatorAgent A/);
  assert.match(view.comparisonBand.textContent, /HR 1\.7/);
  const original = view.model.comparisons.find(item => item.id === 'reverse-placebo');
  assert.equal(original.intervention.source_arm_label, 'PLACEBO+placebo');
  assert.equal(original.comparator.source_arm_label, 'Agent A + placebo');
  assert.equal(view.nodeFor('control:placebo').label, 'Placebo'); assert.equal(JSON.stringify(source), before);
});

test('radial emphasis uses complete non-nested parallel endpoints, including neutral comparisons', () => {
  assert.deepEqual([...map.directParallelNodeIds(map.prepare(graph))], []);
  const model = map.prepare(parallelFixture), qualified = map.directParallelNodeIds(model);
  assert.deepEqual([...qualified].sort(), ['ab', 'agent:a', 'agent:b', 'agent:d', 'bc']);
  assert.ok(!qualified.has('agent:c')); assert.ok(!qualified.has('abc'));
  const controlOnly = { nodes: [drug('c', 'Agent C')], comparisons: [{ id: 'control', intervention: { node_id: 'agent:c', label: 'Agent C' }, comparator: { node_id: null, label: 'Observation' }, estimate: 0.7 }] };
  assert.deepEqual([...map.directParallelNodeIds(map.prepare(controlOnly))], ['agent:c']);
});

test('mounted radial qualifying nodes double in size with constituent colors and unchanged catalogue', () => {
  const source = { ...parallelFixture, nodes: parallelFixture.nodes.map((node) => ({ ...node, class_id: node.id === 'agent:a' ? 'ici' : 'targeted' })) }, { view } = mountedFixture(source);
  view.setBranch('all');
  assert.equal(view.nodeElements.size, source.nodes.length); assert.equal(withClass(view.world, 'tm-control-node').length, 0);
  assert.equal(withClass(view.world, 'tm-direct-comparison-node').length, 5);
  const agent = view.nodeElements.get('agent:a'), combination = view.nodeElements.get('ab'), ordinary = view.nodeElements.get('agent:c');
  assert.equal(agent.getAttribute('data-direct-comparison'), 'true'); assert.equal(ordinary.getAttribute('data-direct-comparison'), 'false');
  assert.equal(Number(withClass(agent, 'tm-agent-dot')[0].getAttribute('r')), 11);
  assert.equal(Number(withClass(ordinary, 'tm-agent-dot')[0].getAttribute('r')), 5.5);
  assert.equal(Number(withClass(combination, 'tm-combination-dot')[0].getAttribute('r')), 12);
  assert.equal(Number(withClass(agent, 'tm-hit-target')[0].getAttribute('r')), 18);
  assert.deepEqual(withClass(combination, 'tm-component-dot').map((dot) => dot.getAttribute('data-treatment-class')), ['ici', 'targeted']);
  assert.ok(withClass(combination, 'tm-component-dot').every((dot) => Number(dot.getAttribute('r')) === 4.8));
  combination.click(); assert.equal(view.selectedId, 'ab'); assert.equal(view.comparisonBand.hidden, true);
  view.camera.scale = 2; view.applyCamera();
  assert.ok(Math.abs(Number(view.overviewLabels.get('ab').getAttribute('x'))) > 12);
  assert.equal(view.model.graph.nodes.length, source.nodes.length);
});

test('initial camera includes left arms, root and first right column on desktop; mobile keeps the pair visible', () => {
  const { view } = mountedFixture(parallelFixture);
  const visible = (id) => { const point = view.tree.positions.get(id), left = point.x * view.camera.scale + view.camera.x; return left >= 0 && left + point.width * view.camera.scale <= view.stage.clientWidth; };
  assert.ok(visible('agent:b')); assert.ok(visible('agent:a')); assert.ok(visible('ab'));
  view.stage.clientWidth = 390; view.stage.clientHeight = 500; view.fit(false);
  assert.ok(visible('agent:b')); assert.ok(visible('agent:a')); assert.ok(view.camera.scale >= 0.45);
  view.fit(true); for (const id of view.tree.positions.keys()) assert.ok(visible(id), id);
});


test('exact node selection shows its own table; arrow selection switches to comparative analysis in branch and radial views',()=>{
  const calls=[],source={...graph,study_memberships:[{id:'ma',node_id:'agent:a',pmid:'1'},{id:'mab',node_id:'ab',pmid:'2'}],nodes:graph.nodes.map(node=>({...node,study_membership_ids:node.id==='agent:a'?['ma']:node.id==='ab'?['mab']:[]}))};
  const {view}=mountedFixture(source,{renderNodeStudies:(root,node,memberships)=>{calls.push({id:node.id,pmids:memberships.map(m=>m.pmid)});root.textContent='Exact '+node.label;return {destroy(){root.replaceChildren();}};}});
  view.setBranch('agent:a');assert.equal(view.nodeStudies.hidden,false);assert.equal(view.comparisonBand.hidden,true);assert.deepEqual(calls.at(-1),{id:'agent:a',pmids:['1']});
  view.select('ab');assert.deepEqual(calls.at(-1),{id:'ab',pmids:['2']});assert.equal(view.nodeStudies.hidden,false);assert.equal(view.comparisonBand.hidden,true);
  const edge=view.tree.comparisonEdges.find(e=>e.root_id==='agent:a'&&e.opponent_id==='ab');assert(edge);view.selectParallel(edge.id);assert.equal(view.nodeStudies.hidden,true);assert.equal(view.comparisonBand.hidden,false);
  view.setBranch('all');view.select('ab');assert.equal(view.nodeStudies.hidden,false);assert.equal(view.comparisonBand.hidden,true);
  const radial=view.tree.comparisonEdges.find(e=>e.opponent_id==='ab');assert(radial);view.selectParallel(radial.id);assert.equal(view.nodeStudies.hidden,true);assert.equal(view.comparisonBand.hidden,false);
  view.select('ab');view.setEndpoint('PFS:HR');assert.equal(view.nodeStudies.hidden,false,'endpoint selection cannot replace or filter the node table');
});
