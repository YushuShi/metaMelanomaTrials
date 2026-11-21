'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../dist/treatment_picker.js');

// Minimal event-capable DOM: these tests exercise the component, not saved data.
class Event {
  constructor(type, options = {}) { Object.assign(this, { type, bubbles: false, defaultPrevented: false }, options); }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.stopped = true; }
}
class Element {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.attributes = {}; this.listeners = new Map(); this.style = {}; this._text = ''; this._value = ''; this.hidden = false; this.disabled = false; this.scrollTop = 0; this.scrollHeight = 400; }
  set textContent(value) { this._text = String(value); for (const child of this.children) child.parentNode = null; this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set id(value) { this.setAttribute('id', value); } get id() { return this.getAttribute('id') || ''; }
  set value(value) { this._value = this.tagName === 'SELECT' && !this.options.some((o) => o.value === value) ? '' : value; }
  get value() { return this._value; }
  get options() { return this.children.flatMap((child) => child.tagName === 'OPTION' ? [child] : child.options); }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, before) { if (child.parentNode) child.parentNode.removeChild(child); const at = before ? this.children.indexOf(before) : this.children.length; assert.ok(at >= 0); this.children.splice(at, 0, child); child.parentNode = this; return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) { if (!event.target) event.target = this; event.currentTarget = this; for (const fn of [...(this.listeners.get(event.type) || [])]) fn(event); if (event.bubbles && !event.stopped) this.parentNode?.dispatchEvent(event); return !event.defaultPrevented; }
  contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
  focus() { if (!this.disabled) { this.ownerDocument.activeElement = this; this.dispatchEvent(new Event('focusin', { bubbles: true })); } }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click', { bubbles: true })); }
  getBoundingClientRect() { return this.rect || { left: 30, top: 100, bottom: 144, width: 250 }; }
  scrollIntoView() {}
}
class Document extends Element {
  constructor() { super('#document', null); this.ownerDocument = this; this.defaultView = { Event, innerWidth: 900, innerHeight: 700, addEventListener() {}, removeEventListener() {} }; this.body = this.appendChild(new Element('body', this)); }
  createElement(tag) { return new Element(tag, this); }
  getElementById(id) { const find = (node) => node.id === id ? node : node.children.map(find).find(Boolean); return find(this); }
}
const tree = [
  { value: 'treatment-class:immune', label: 'Immunotherapy', depth: 0, class_id: 'immune' },
  { value: 'treatment-class:ici', label: 'Immune checkpoint inhibitors', depth: 1, class_id: 'ici' },
  { value: 'treatment-class:pd1', label: 'PD-1 inhibitors', depth: 2, class_id: 'pd1' },
  { value: 'treatment-class:agent:nivolumab', label: 'Nivolumab', depth: 3, class_id: 'agent:nivolumab' },
  { value: 'nivo', label: 'Nivolumab monotherapy', depth: 4, class_id: 'agent:nivolumab' },
  { value: 'plain-nivo', label: 'Nivolumab', depth: 4, class_id: 'agent:nivolumab', hidden: true },
  { value: 'treatment-class:cytokines', label: 'Cytokines', depth: 1, class_id: 'cytokines' },
  { value: 'il2', label: 'Interleukin-2', depth: 2, class_id: 'cytokines' },
  { value: 'treatment-class:targeted', label: 'Targeted therapy', depth: 0, class_id: 'targeted' },
  { value: 'treatment-class:braf', label: 'BRAF inhibitors', depth: 1, class_id: 'braf' },
  { value: 'vemu', label: 'Vemurafenib', depth: 2, class_id: 'braf' },
];
function fixture() {
  const doc = new Document(), field = doc.body.appendChild(doc.createElement('div'));
  const label = field.appendChild(doc.createElement('label')); label.id = 'analysis-comparator-label'; label.textContent = 'Comparator';
  const select = field.appendChild(doc.createElement('select')); select.id = 'analysis-comparator'; select.labels = [label];
  for (const entry of [{ value: '', label: 'All comparators' }, ...tree]) { const option = select.appendChild(doc.createElement('option')); option.value = entry.value; option.textContent = entry.label; }
  const nativeOptions = select.options.map((option) => [option.value, option.textContent]);
  const picker = api.enhance(select).refresh(tree, 'All comparators');
  return { doc, select, picker, label, nativeOptions };
}
const node = (picker, value) => picker.nodes.find((row) => row.entry.value === value);
const key = (target, value) => target.dispatchEvent(new Event('keydown', { key: value, bubbles: true }));

test('opens broad first; category selection and disclosure are separate native-value actions', () => {
  const { select, picker, nativeOptions } = fixture(); let changes = 0; select.addEventListener('change', () => changes++);
  assert.equal(select.hidden, true); assert.equal(api.enhance(select), picker);
  picker.trigger.click();
  assert.deepEqual(picker.nodes.filter((n) => n.displayed).map((n) => n.entry.label), ['Immunotherapy', 'Targeted therapy']);
  const immune = node(picker, 'treatment-class:immune'); immune.toggle.click();
  assert.equal(changes, 0); assert.equal(select.value, ''); assert.equal(immune.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(picker.doc.getElementById(immune.toggle.getAttribute('aria-controls')).hidden, false);
  immune.choice.click();
  assert.equal(select.value, 'treatment-class:immune'); assert.equal(changes, 1); assert.equal(picker.popup.hidden, true);
  assert.equal(picker.doc.activeElement, picker.trigger); assert.equal(picker.caption.textContent, 'Immunotherapy');
  assert.deepEqual(select.options.map((o) => [o.value, o.textContent]), nativeOptions);
});

test('picker shares table/map class keys and preserves a nested category color instead of inheriting an unrelated parent',()=>{
  const {picker}=fixture();
  for(const [value,kind]of [['treatment-class:immune','immune'],['treatment-class:cytokines','cytokines'],['il2','cytokines'],['treatment-class:agent:nivolumab','pd1'],['vemu','braf']]){
    const entry=node(picker,value);assert.equal(entry.family,kind);
    assert.equal(entry.choice.parentNode.parentNode.getAttribute('data-treatment-class'),kind);
  }
});

test('keyboard reaches nested selectable parents, collapses, selects and restores focus', () => {
  const { picker, select, doc } = fixture(); let changes = 0; select.addEventListener('change', () => changes++);
  picker.open(); assert.equal(doc.activeElement, picker.search);
  key(picker.search, 'ArrowDown'); assert.equal(doc.activeElement, picker.allChoice);
  key(picker.allChoice, 'ArrowDown'); const immune = node(picker, 'treatment-class:immune'); assert.equal(doc.activeElement, immune.choice);
  key(immune.choice, 'ArrowRight'); key(immune.choice, 'ArrowRight'); const ici = node(picker, 'treatment-class:ici'); assert.equal(doc.activeElement, ici.choice);
  key(ici.choice, 'ArrowRight'); key(ici.choice, 'ArrowRight'); const pd1 = node(picker, 'treatment-class:pd1'); assert.equal(doc.activeElement, pd1.choice);
  key(pd1.choice, 'ArrowLeft'); assert.equal(doc.activeElement, ici.choice);
  key(ici.choice, 'ArrowRight'); key(pd1.choice, 'Enter');
  assert.equal(select.value, 'treatment-class:pd1'); assert.equal(changes, 1); assert.equal(doc.activeElement, picker.trigger);
  picker.open(); key(picker.search, 'Escape'); assert.equal(picker.trigger.getAttribute('aria-expanded'), 'false'); assert.equal(doc.activeElement, picker.trigger);
});

test('search reveals matching paths, leaves native hidden entries intact and closes on selection', () => {
  const { picker, select } = fixture(); assert.equal(picker.nodes.some((n) => n.entry.value === 'plain-nivo'), false);
  select.value = 'plain-nivo'; picker.sync(); assert.equal(picker.caption.textContent, 'Nivolumab');
  picker.open(); picker.search.value = 'nivolumab monotherapy'; picker.search.dispatchEvent(new Event('input'));
  assert.equal(node(picker, 'nivo').displayed, true); assert.equal(node(picker, 'treatment-class:targeted').displayed, false);
  key(picker.search, 'Enter'); assert.equal(select.value, 'nivo'); assert.equal(picker.opened, false);
  picker.open(); assert.equal(node(picker, 'nivo').displayed, false);
  picker.search.value = 'no such treatment'; picker.search.dispatchEvent(new Event('input'));
  assert.equal(picker.status.textContent, 'No matching treatments.');
  assert.equal(select.value, 'nivo');
});

test('native changes and disabling synchronize; outside focus closes without stealing focus', () => {
  const { picker, select, doc } = fixture(); select.value = 'vemu'; select.dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(picker.caption.textContent, 'Vemurafenib');
  picker.open(); const outside = doc.body.appendChild(doc.createElement('button')); outside.focus();
  assert.equal(picker.opened, false); assert.equal(doc.activeElement, outside);
  picker.open(); doc.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); assert.equal(picker.popup.hidden, true);
  picker.open(); select.disabled = true; picker.sync(); picker.trigger.click();
  assert.equal(picker.trigger.disabled, true); assert.equal(picker.opened, false);
  const before = select.value; picker.choose('nivo'); assert.equal(select.value, before);
  select.disabled = false; select.options.find((option) => option.value === 'nivo').disabled = true; picker.sync();
  assert.equal(node(picker, 'nivo').choice.disabled, true); picker.choose('nivo'); assert.equal(select.value, before);
});

test('accessible labels and controls are linked; popup fits a narrow viewport', () => {
  const { picker, doc, label } = fixture();
  assert.equal(picker.trigger.getAttribute('aria-labelledby'), label.id + ' ' + picker.caption.id);
  assert.equal(picker.trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(doc.getElementById(picker.trigger.getAttribute('aria-controls')), picker.popup);
  doc.defaultView.innerWidth = 320; doc.defaultView.innerHeight = 280; picker.trigger.rect = { left: 230, top: 200, bottom: 244, width: 90 };
  picker.open(); const left = parseFloat(picker.popup.style.left), width = parseFloat(picker.popup.style.width);
  assert.ok(left >= 12 && left + width <= 308); assert.ok(parseFloat(picker.popup.style.top) >= 12);
});

test('safe enhancement fallback and destroy preserve the native selector', () => {
  assert.equal(api.enhance({ tagName: 'SELECT', ownerDocument: {} }), null);
  const { picker, select, doc } = fixture(); picker.destroy();
  assert.equal(select.hidden, false); assert.equal(select.getAttribute('aria-hidden'), null); assert.equal(select.getAttribute('tabindex'), null);
  assert.equal(doc.getElementById(picker.popup.id), undefined);
  assert.notEqual(api.enhance(select), picker);
});

test('shared canonical alias search finds Tobemstomig without exposing duplicate drug leaves',()=>{
  const groups=require('../dist/treatment_groups.js');
  const {select,picker}=fixture();const options=groups.optionTree([['T','Tobemstomig']]);
  select.textContent='';
  for(const entry of [{value:'',label:'All treatments'},...options]){const option=select.appendChild(select.ownerDocument.createElement('option'));option.value=entry.value;option.textContent=entry.label;}
  picker.refresh(options,'All treatments');picker.open();
  for(const alias of ['RO7247669','RG-6139']){
    picker.search.value=alias;picker.search.dispatchEvent(new Event('input'));
    const matches=picker.nodes.filter(x=>x.directMatch&&x.displayed);
    assert.equal(matches.length,1);assert.equal(matches[0].entry.value,'treatment-class:agent:tobemstomig');
  }
  key(picker.search,'Enter');assert.equal(select.value,'treatment-class:agent:tobemstomig');
});

test('Studies opens with only main treatment types and unfolds a single selected branch', () => {
  const groups=require('../dist/treatment_groups.js');
  const {select,picker}=fixture();
  const entries=groups.optionTree([['N','Nivolumab'],['I','Ipilimumab'],['V','Bevacizumab'],['T','Paclitaxel']]);
  select.textContent='';
  for(const entry of [{value:'',label:'All comparators'},...entries]){
    const option=select.appendChild(select.ownerDocument.createElement('option'));
    option.value=entry.value;option.textContent=entry.label;
  }
  picker.refresh(entries,'All comparators');picker.open();
  assert.deepEqual(picker.nodes.filter(n=>n.displayed),picker.roots);
  for(const id of ['pd1','ctla4','vegf','taxane']) assert.equal(node(picker,'treatment-class:'+id).displayed,false,id);
  const vegf=node(picker,'treatment-class:vegf');
  vegf.parent.toggle.click();
  assert.equal(vegf.displayed,true);
  assert.equal(node(picker,'treatment-class:pd1').displayed,false);
  assert.equal(node(picker,'treatment-class:agent:nivolumab').displayed,false);
  vegf.choice.click();
  assert.equal(select.value,'treatment-class:vegf');
  picker.open();
  assert.deepEqual(picker.nodes.filter(n=>n.displayed),picker.roots);
});
