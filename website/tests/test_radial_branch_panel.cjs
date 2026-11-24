'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { comparisonSign, orientComparison } = require('../dist/radial_branch_panel.js');

const hr = (estimate, lower, upper) => ({ estimate, lower, upper, nullValue: 1, higherFavorsLeft: false });

test('mortality HR compares the left regimen to the right and evaluates the unrounded interval separately', () => {
  assert.deepEqual(comparisonSign(hr(.80, .68, .94)), { symbol: '>', filled: true, caption: 'Statistically significant' });
  assert.deepEqual(comparisonSign(hr(.80, .60, 1.07)), { symbol: '>', filled: false, caption: 'Point estimate' });
  assert.equal(comparisonSign(hr(.80, .60, 1)).filled, false);
  assert.equal(comparisonSign(hr(.80, .60, .99999)).filled, true);
  assert.deepEqual(comparisonSign(hr(1.25, 1.1, 1.5)), { symbol: '<', filled: true, caption: 'Statistically significant' });
  assert.deepEqual(comparisonSign(hr(1.25, .92, 1.5)), { symbol: '<', filled: false, caption: 'Point estimate' });
});

test('response, risk difference, an exact null and missing precision have distinct signs', () => {
  const rr = { ...hr(1.1, 1.01, 1.3), higherFavorsLeft: true };
  assert.equal(comparisonSign(rr).symbol, '>');
  assert.deepEqual(comparisonSign({ ...rr, estimate: -.08, lower: -.15, upper: -.0002, nullValue: 0 }),
    { symbol: '<', filled: true, caption: 'Statistically significant' });
  assert.equal(comparisonSign({ ...rr, estimate: -.08, lower: -.15, upper: .01, nullValue: 0 }).filled, false);
  assert.deepEqual(comparisonSign(hr(1, .7, 1.2)), { symbol: '–', filled: false, caption: 'At the null' });
  assert.deepEqual(comparisonSign(hr(.8, null, null)), { symbol: '>', filled: false, caption: 'CI unavailable' });
  assert.equal(comparisonSign(null), null);
  assert.equal(comparisonSign(hr(null, .7, 1.2)), null);
});

test('reversing a difference negates its estimate and swaps and negates its interval', () => {
  const fit = { estimate: 2, ci_lower: .5, ci_upper: 3.4 };
  for (const measure of ['RD', 'MD', 'SMD', 'RMST difference']) {
    const left = orientComparison(fit, { measure, polarity: 'higher' }, false);
    assert.deepEqual(left, { estimate: -2, lower: -3.4, upper: -.5, nullValue: 0, higherFavorsLeft: true });
    assert.deepEqual(comparisonSign(left), { symbol: '<', filled: true, caption: 'Statistically significant' });
  }
  assert.deepEqual(orientComparison(fit, { measure: 'Custom contrast', polarity: 'higher', nullValue: 0 }, false),
    orientComparison(fit, { measure: 'MD', polarity: 'higher' }, false));
  assert.equal(orientComparison(fit, { measure: 'Custom contrast', polarity: 'higher' }, false), null);
  assert.equal(orientComparison(fit, { measure: 'RR', polarity: 'unknown' }, false), null);
});

test('reversing a ratio preserves missing CIs and bases significance on unrounded transformed bounds', () => {
  const endpoint = { measure: 'HR', polarity: 'lower' };
  const fit = { estimate: .8, ci_lower: .6001, ci_upper: .99999 };
  const reversed = orientComparison(fit, endpoint, false);
  assert.deepEqual(reversed, hr(1.25, 1 / .99999, 1 / .6001));
  assert.equal(comparisonSign(reversed).filled, true);
  assert.equal(comparisonSign(orientComparison({...fit,ci_upper:1}, endpoint, false)).filled, false);
  const noCI = orientComparison({estimate:.8}, endpoint, false);
  assert.deepEqual(noCI,hr(1.25,null,null));
  assert.equal(comparisonSign(noCI).caption,'CI unavailable');
  assert.equal(comparisonSign(orientComparison({ ...fit, ci_95_unavailable:true },endpoint,true)).caption,'CI unavailable');
});

// Exercise the browser entry point with its independent family renderer stubbed.
function panelFixture() {
  const doc = { activeElement: null };
  function element(tagName, className, parentNode, textContent) {
    const el = {
      tagName, className, parentNode, textContent: textContent || '', children: [], attributes: {}, listeners: {},
      setAttribute(k,v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k] ?? null; },
      removeAttribute(k) { delete this.attributes[k]; }, replaceChildren() { this.children = []; },
      addEventListener(k, fn) { this.listeners[k] = fn; }, focus() { doc.activeElement = this; },
    };
    parentNode?.children.push(el);
    return el;
  }
  const context = { RadialBranchFamily: { render() {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/radial_branch_panel.js'), 'utf8'), context);
  const view = { doc, make: element, svgElement(tag, attrs, parent) {
    const child = element(tag, attrs.class, parent);
    Object.entries(attrs).forEach(([key, value]) => child.setAttribute(key, value));
    return child;
  } };
  const host = element('div');
  const all = el => [el, ...el.children.flatMap(all)];
  const get = cls => all(host).find(el => el.className === cls);
  const chosen = [];
  const model = {
    selected: { id: 'a', label: 'A' }, comparators: [
      { id: 'b', kind: 'Direct', label: 'B' }, { id: 'c', kind: 'Indirect', label: 'C' },
    ], activeId: 'b', mode: 'direct', comparison: hr(.8, .68, .94),
    onComparator(id,kind) { chosen.push([id,kind]); },
  };
  const render = () => context.RadialBranchPanel.render(view, host, model);
  return { doc, model, render, get, chosen };
}

test('rendered filled and hollow chevrons use different SVG fills and a closed outline', () => {
  const { model, render, get } = panelFixture();
  render();
  assert.equal(get('rb-sign-caption').textContent, 'Statistically significant');
  assert.equal(get('rb-comparison-symbol').children[0].getAttribute('fill'), 'currentColor');
  model.comparison = hr(.8, .60, 1.07); render();
  const path = get('rb-comparison-symbol').children[0];
  assert.equal(get('rb-sign-caption').textContent, 'Point estimate');
  assert.equal(path.getAttribute('fill'), 'none');
  assert.equal(path.getAttribute('stroke'), 'currentColor');
  assert.match(path.getAttribute('d'), /Z$/);
  model.comparison = hr(1.2, 1.1, 1.35); render();
  assert.match(get('rb-comparison-symbol').children[0].getAttribute('transform'), /scale\(-1 1\)/);
  model.comparators = model.comparators.slice(1); render();
  assert.equal(get('rb-comparison-sign').hidden, true);
  assert.equal(get('rb-sign-caption'), undefined);
});

test('keyboard and pointer selections identify the full comparator and preserve focus and list position after rerenders', () => {
  const { doc, model, render, get, chosen } = panelFixture(); render();
  const list = get('rb-comparator-list'), [b, c] = list.children;
  assert.equal(b.getAttribute('aria-selected'), 'true');
  assert.equal(b.tabIndex, 0);
  b.listeners.keydown({ key: 'ArrowDown', preventDefault() {} });
  assert.deepEqual(chosen.at(-1), ['c','Indirect']); assert.equal(doc.activeElement, c);
  model.activeId = 'c'; render();
  assert.equal(c.tabIndex, 0); assert.equal(b.tabIndex, -1);
  c.listeners.keydown({ key: 'Home', preventDefault() {} });
  assert.deepEqual(chosen.at(-1), ['b','Direct']);
  list.scrollTop = 32; model.comparators = [...model.comparators, { id:'d',label:'D',kind:'Direct' }]; render();
  assert.equal(list.scrollTop, 32);
  assert.equal(doc.activeElement, list.children[0]);
  list.children[2].listeners.click(); assert.deepEqual(chosen.at(-1), ['d','Direct']);
});
