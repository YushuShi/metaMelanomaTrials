'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const charts = require('../dist/treatment_map_charts.js');
const analysis = require('../dist/treatment_map_analysis.js');

// Rendering fixtures are synthetic; no saved clinical evidence is changed.
class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.attributes = {}; this.className = ''; this._text = '';
    this.classList = { contains: name => this.className.split(/\s+/).includes(name), add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); } };
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  replaceChildren(...children) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; this._text = ''; children.forEach(child => this.appendChild(child)); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'class') this.className = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
}
const doc = { createElement(tag) { return new Element(tag, this); }, createElementNS(namespace, tag) { return this.createElement(tag); } };
const root = () => new Element('div', doc);
const descendants = element => element.children.flatMap(child => [child, ...descendants(child)]);
const byClass = (element, name) => descendants(element).filter(child => child.classList.contains(name));
const tags = (element, name) => descendants(element).filter(child => child.tagName === name.toUpperCase());
const fixture = (values = [.5, 1, 2]) => {
  const selected = values.map((estimate, i) => ({ id: 'c' + i, study_id: 's' + i, comparison_id: 'c' + i, label: 'Synthetic study ' + (i + 1), study_name: 'Synthetic study ' + (i + 1), pmid: String(100000 + i), year: 2025, estimate, ci_lower: estimate * .8, ci_upper: estimate * 1.25, ci_level: 95, log_estimate: Math.log(estimate), se: .2, weight: 25, weight_percent: 100 / values.length, source: { measure: 'HR' } }));
  return { selected, pooled: { k: selected.length, estimate: 1, ci_lower: .7, ci_upper: 1.3, log_estimate: 0, se: .15, ...analysis.modelForK(selected.length), I2: 36, tau2: .1 }, diagnostics: {
    funnel: selected.map(item => ({ ...item })), egger: { available: false, k: selected.length, reason: 'At least ten studies are required' },
    baujat: selected.map((item, i) => ({ ...item, q_contribution: i, influence: i * .1 })),
    leave_one_out: selected.map((item, i) => ({ omitted_id: item.id, study_id: item.study_id, label: item.label, pmid: item.pmid, k_remaining: selected.length - 1, ...analysis.modelForK(selected.length - 1), estimate: .8 + i * .1, ci_lower: .6 + i * .1, ci_upper: 1.1 + i * .1, p_value: .3 + i * .1 }))
  } };
};
function assertFiniteGeometry(element) {
  for (const node of descendants(element)) for (const [name, value] of Object.entries(node.attributes)) {
    if (['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'width', 'height', 'points', 'd', 'viewBox', 'transform'].includes(name)) assert.doesNotMatch(value, /NaN|Infinity/, name + '=' + value);
  }
}

test('forest plots natural-log coordinates and both-scale confidence intervals with full names and source links', () => {
  const container = root(), group = fixture();
  group.selected[0].label = 'A complete, unusually long clinical trial name that should remain discoverable without ellipses or removal of its source citation';
  const before = JSON.stringify(group);
  const result = charts.render(container, group, { tab: 'forest', measure: 'HR', tailLabel: 'Treatment A', headLabel: 'Treatment B' });
  assert.deepEqual(result, { available: true, tab: 'forest', studies: 3 });
  const marks = byClass(container, 'tm-analysis-estimate'), positions = marks.map(item => Number(item.getAttribute('data-x')));
  assert.equal(marks.length, 3); assert.ok(Math.abs((positions[1] - positions[0]) - (positions[2] - positions[1])) < 1e-9);
  assert.equal(byClass(container, 'tm-analysis-pooled').length, 1);
  assert.match(container.textContent, /ln\(HR\)/); assert.match(container.textContent, /Treatment B versus Treatment A/);
  assert.ok(container.textContent.includes(group.selected[0].label));
  assert.ok(tags(container, 'a').some(item => item.getAttribute('href') === 'https://pubmed.ncbi.nlm.nih.gov/100000/'));
  assert.match(container.textContent, /I²=36%/); assert.match(container.textContent, /0.500 \(0.400–0.625\)/);
  assert.equal(byClass(container,'tm-analysis-ln-value')[0].textContent,'-0.693 (-0.916–-0.470)');
  assert.equal(byClass(container,'tm-analysis-ln-value').length,4,'every study and pooled estimate has a log-scale CI column');
  assert.equal(byClass(container,'tm-analysis-ratio-value').length,4,'every study and pooled estimate keeps its ratio-scale CI column');
  assert.equal(tags(container,'svg')[0].getAttribute('data-coordinate-scale'),'ln');
  assert.equal(Number(marks[0].getAttribute('data-log-estimate')),Math.log(.5));
  const reference=byClass(container,'tm-analysis-reference')[0],nullX=Number(reference.getAttribute('x1'));
  assert.equal(reference.getAttribute('data-log-value'),'0');assert.equal(nullX,positions[1]);
  const ticks=byClass(container,'tm-analysis-axis-label').map(n=>({value:Number(n.textContent),x:Number(n.getAttribute('x'))}));
  assert(ticks.some(t=>t.value===0&&t.x===nullX));assert(ticks.some(t=>t.value<0));assert(ticks.some(t=>t.value>0));
  for(const t of ticks.filter(t=>t.value!==0))assert.ok(Math.abs((t.x-nullX)/t.value-(positions[2]-nullX)/Math.log(2))<1e-9,'axis tick coordinates are linear in ln(HR)');
  assert.equal(JSON.stringify(group), before); assertFiniteGeometry(container);
});

test('forest axes use ln labels and logarithms of each reported bound for every ratio measure',()=>{
  for(const measure of ['HR','RR','OR']){
    const container=root(),group=fixture([.7,1.8]);charts.render(container,group,{tab:'forest',measure});
    assert.equal(byClass(container,'tm-analysis-axis-title')[0].textContent,'ln('+measure+')');
    const headings=byClass(container,'tm-analysis-column-heading').map(n=>n.textContent);
    assert(headings.includes(measure+' (95% CI)'));assert(headings.includes('ln('+measure+') (95% CI)'));
    for(const [i,row]of group.selected.entries()){
      const shown=byClass(container,'tm-analysis-ln-value')[i].textContent;
      assert.equal(shown,`${Math.log(row.estimate).toFixed(3)} (${Math.log(row.ci_lower).toFixed(3)}–${Math.log(row.ci_upper).toFixed(3)})`);
    }
  }
});

test('diagnostic charts stay accessible and rerender without a duplicate Study sources list', () => {
  const container = root(), group = fixture(); charts.render(container, group);
  const priorSVG = tags(container, 'svg')[0];
  assert.equal(priorSVG.getAttribute('role'), 'img'); assert.ok(priorSVG.getAttribute('aria-labelledby')); assert.ok(priorSVG.getAttribute('aria-describedby'));
  assert.equal(tags(priorSVG, 'title').length > 0, true); assert.equal(tags(priorSVG, 'desc').length, 1);
  assert.equal(byClass(container, 'tm-analysis-chart-scroll')[0].getAttribute('tabindex'), '0');
  charts.render(container, group, { tab: 'bias' });
  assert.equal(tags(container, 'svg').length, 1); assert.notEqual(tags(container, 'svg')[0], priorSVG); assert.equal(byClass(container, 'tm-analysis-forest').length, 0);
  assert.equal(byClass(container, 'tm-analysis-source-list').length, 0);
  for(const tab of ['forest','bias','sensitivity']){charts.render(container,group,{tab});assert.equal(byClass(container,'tm-analysis-source-list').length,0);assert.doesNotMatch(container.textContent,/Study sources/);}
  charts.render(container, fixture([.7]), { tab: 'forest' });
  assert.equal(tags(container, 'svg').length, 0); assert.match(container.textContent, /At least two independent/);
});

test('forest geometry and labels use converted 95% intervals while the source payload retains the original',()=>{
 const container=root(),group=fixture(),original={...group.selected[0],ci_level:99};group.selected[0]=original;
 const before=JSON.stringify(group),converted=require('../dist/confidence_intervals.js').forDisplay({...original,measure:'HR'});
 charts.render(container,group,{tab:'forest',measure:'HR'});
 const svg=tags(container,'svg')[0],row=byClass(svg,'tm-analysis-study-row')[0],note=byClass(row,'tm-analysis-ci-note')[0];
 assert.equal(note.textContent.includes('95% CI, converted'),true);assert.match(tags(row,'title')[0].textContent,/95% CI, converted/);
 assert.ok(byClass(row,'tm-analysis-value')[0].textContent.includes(charts.formatNumber(converted.ci_lower)+'–'+charts.formatNumber(converted.ci_upper)));
 assert.ok(byClass(row,'tm-analysis-ln-value')[0].textContent.includes(charts.formatNumber(Math.log(converted.ci_lower))+'–'+charts.formatNumber(Math.log(converted.ci_upper))));
 assert.equal(byClass(container,'tm-analysis-source-list').length,0);assert.equal(group.selected[0].ci_level,99);
 assert.equal(JSON.stringify(group),before);assertFiniteGeometry(container);
});
test('unsupported non95 forest intervals show the estimate and unavailable95 label without a repeated source list',()=>{
 const container=root(),group=fixture();group.selected[0]={...group.selected[0],ci_level:99,ci_method:'profile likelihood'};const before=JSON.stringify(group);
 const result=charts.render(container,group,{tab:'forest',measure:'HR'});assert.equal(result.available,true);
 const row=byClass(container,'tm-analysis-study-row')[0];assert.equal(byClass(row,'tm-analysis-ci').length,0);assert.equal(byClass(row,'tm-analysis-estimate').length,1);
 assert.equal(byClass(row,'tm-analysis-ci-note')[0].textContent.includes('95% CI unavailable'),true);assert.equal(byClass(row,'tm-analysis-value')[0].textContent,'0.5');
 assert.equal(byClass(row,'tm-analysis-ln-value')[0].textContent,'-0.693');
 assert.doesNotMatch(row.textContent,/0.4–0.625/);assert.equal(byClass(container,'tm-analysis-source-list').length,0);assert.equal(group.selected[0].ci_level,99);
 assert.equal(JSON.stringify(group),before);assertFiniteGeometry(container);
});

test('the model remains visible inside exported forest SVGs and follows the remaining cohorts in sensitivity rows',()=>{
 for(const [values,label,remaining]of [[[.7,.8],'Fixed-effect','Individual study'],[[.7,.8,.9],'Random-effects (REML)','Fixed-effect'],[[.7,.8,.9,1.1],'Random-effects (REML)','Random-effects (REML)']]){
  const container=root(),group=fixture(values);charts.render(container,group,{tab:'forest'});
  const svg=tags(container,'svg')[0];assert.ok(byClass(svg,'tm-analysis-pooled-label').some(node=>node.textContent===label));assert.ok(tags(svg,'desc')[0].textContent.includes(label));
  charts.render(container,group,{tab:'sensitivity'});assert.ok(byClass(container,'tm-analysis-model').every(node=>node.textContent===remaining));
 }
});

test('missing or invalid estimates clear charts instead of fabricating a pooled display', () => {
  for (const mutate of [group => { group.selected[0].ci_upper = null; }, group => { group.selected[0].se = 0; }, group => { group.pooled.estimate = -1; }, group => { group.pooled = null; }, group => { group.selected[0].log_estimate = NaN; }, group => { group.pooled.k = 4; }]) {
    const container = root(), group = fixture(); charts.render(container, group); mutate(group);
    assert.equal(charts.render(container, group).available, false); assert.equal(tags(container, 'svg').length, 0); assertFiniteGeometry(container);
  }
});

test('funnel handles two identical studies without zero-width domains or an unjustified Egger test', () => {
  const container = root(), group = fixture([1, 1]);
  group.diagnostics.egger = { available: true, p_value: .01 };
  charts.render(container, group, { tab: 'bias', measure: 'RR' });
  assert.equal(byClass(container, 'tm-analysis-point').length, 1); assert.equal(byClass(container, 'tm-analysis-point')[0].getAttribute('data-count'), '2');
  assert.match(container.textContent, /at least 10 independent studies/); assert.doesNotMatch(container.textContent, /p=0.010/);
  assert.match(container.textContent, /log\(RR\)/); assert.match(container.textContent, /Synthetic study 1.*Synthetic study 2/);
  assertFiniteGeometry(container);
});

test('Egger results require eligible study count and report unavailable precision or numerical states', () => {
  assert.match(charts.eggerText({ available: true, p_value: .0123 }, 10), /p=0.012/);
  assert.match(charts.eggerText({ available: true, p_value: 0 }, 10), /p<0.001/);
  assert.match(charts.eggerText({ available: false, reason: 'identical precision' }, 10), /insufficient variation/);
  assert.match(charts.eggerText({ available: true, p_value: NaN }, 10), /unavailable/);
  assert.match(charts.eggerText({ available: true, p_value: .05 }, 9), /at least 10/);
});

test('sensitivity handles k=2, zero influence and single-study remainder without claiming it is pooled', () => {
  const container = root(), group = fixture([.7, .8]);
  group.diagnostics.baujat.forEach(item => { item.q_contribution = 0; item.influence = 0; });
  group.diagnostics.leave_one_out[0].ci_level=90;
  const before = JSON.stringify(group); charts.render(container, group, { tab: 'sensitivity', measure: 'OR' });
  assert.equal(byClass(container, 'tm-analysis-point').length, 1); assert.equal(byClass(container, 'tm-analysis-cluster-count')[0].textContent, '2');
  assert.match(container.textContent, /Squared standardized influence/); assert.match(container.textContent, /divided by the omitted-fit variance/);
  assert.equal(byClass(container, 'tm-analysis-model').filter(row=>row.textContent==='Individual study').length, 2); assert.match(container.textContent, /OR after omission/);
  assert.match(container.textContent, /0.800 \([^)]*95% CI, converted\)/); assert.doesNotMatch(container.textContent,/90% CI\)/); assert.match(container.textContent, /0.300/);
  assert.equal(tags(container, 'tbody')[0].children.length, 2); assert.equal(JSON.stringify(group), before); assertFiniteGeometry(container);
});

test('missing diagnostic arrays and leave-one-out estimates remain explicitly unavailable', () => {
  const container = root(), group = fixture();
  group.diagnostics.funnel.pop(); charts.render(container, group, { tab: 'bias' });
  assert.match(container.textContent, /Funnel-plot estimates are unavailable/); assert.equal(tags(container, 'svg').length, 0);
  group.diagnostics.baujat = []; group.diagnostics.leave_one_out[0].estimate = null;
  charts.render(container, group, { tab: 'sensitivity' });
  assert.match(container.textContent, /Baujat results are unavailable/); assert.match(tags(container, 'tbody')[0].children[0].textContent, /Unavailable/);
  assertFiniteGeometry(container);
});

test('source text is rendered as text and unsafe non-PubMed URLs are not linked', () => {
  const container = root(), group = fixture();
  group.selected[0].label = '<img src=x onerror=alert(1)> Drug & trial'; group.selected[0].pmid = ''; group.selected[0].source_url = 'javascript:alert(1)';
  charts.render(container, group);
  assert.ok(container.textContent.includes(group.selected[0].label)); assert.equal(tags(container, 'img').length, 0);
  assert.ok(tags(container, 'a').every(item => !String(item.getAttribute('href')).startsWith('javascript:')));
});

test('ratio ticks retain unity and formatting preserves useful small values', () => {
  assert.ok(charts.ratioTicks(.01, 100).includes(1)); assert.deepEqual(charts.linearTicks(0, 0), [0]);
  assert.equal(charts.formatNumber(null), '—'); assert.equal(charts.formatNumber(.0001), '1e-4');
  assert.equal(charts.formatP(null), '—'); assert.equal(charts.formatP(.2), '0.200');
});
