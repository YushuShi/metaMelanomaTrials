'use strict';
const sampleProof=require('./fixtures/pooling_sample_size.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const map = require('../dist/treatment_map.js');
const chooseSource = require('./fixtures/select_map_source.cjs');
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
function freshMap(source = graph) {
  const doc = { defaultView: { setTimeout }, createElement(tag) { return new Element(tag, this); }, createElementNS(namespace, tag) { return this.createElement(tag); } };
  return map.mount(new Element('div', doc), source);
}
function mount(source = graph) {
  const view = freshMap(source);
  view.setBranchLayout('branch');
  view.setBranch('all');
  return view;
}
function pair(view, tail, head) {
  const edge = view.tree.comparisonEdges.find(item => item.root_id === tail && item.opponent_id === head);
  assert.ok(edge, `${tail} → ${head}`); return { edge, element: view.parallelLinks.get(edge.id) };
}
const visibleLegendStates = view => withClass(view.legend, 'tm-effect-key').filter(element => !element.hidden).map(element => data(element, 'effectState')).sort();

const analysisMeta=(id,design='randomized_trial',pmid=id)=>({design,sample_size:sampleProof(pmid),independence_verified:true,independent_id:id,publication_year:2024,source_completeness:1,source_stages:['R3'],model_family:'cox',compatibility:{key:JSON.stringify([design,'advanced','general_melanoma','unspecified','unspecified','cox','unknown','OS','overall','unspecified']),design,setting:'advanced',subtype:'general_melanoma',model_family:'cox',eligible:true,label:'Advanced melanoma'},planning_assumptions:[{id:'rate',kind:'survival_probability',arm_role:'comparator',probability:0.6,time_months:12,outcome:'OS',label:'12-month OS',source_refs:[]} ]});
function pooledGraph(){
 const first=graph.comparisons.find(c=>c.id==='ab-a-os');
 const studies=[['one',.7,'randomized_trial'],['two',.8,'randomized_trial'],['three',.9,'nonrandomized_trial'],['four',1.1,'observational']].map(([id,estimate,design],i)=>({...first,id:'pool-'+id,pmid:String(200+i),estimate,ci_lower:estimate*.8,ci_upper:estimate*1.2,analysis:analysisMeta('nct:'+id,design,String(200+i))}));
 studies.push({...studies[0],id:'pool-one-r2',analysis:{...studies[0].analysis,source_completeness:0,source_stages:['R2']}});
 return {...graph,comparisons:studies};
}
test('prepared OS maps recalculate endpoint and inclusion changes and restore the same default estimate',()=>{
 const source={...pooledGraph(),content_sha256:'synthetic-precomputed-map'};
 const pfs={...source.comparisons[0],id:'pool-pfs',outcome:'PFS',estimate:.45,ci_lower:.3,ci_upper:.6,analysis:{...source.comparisons[0].analysis,compatibility:{...source.comparisons[0].analysis.compatibility,key:'PFS'}}};
 source.comparisons.push(pfs);
 const prepared=map.buildDefaultViews(map.prepare(source));
 prepared.analyses=require('../scripts/treatment_map_defaults.cjs').packAnalyses(prepared.analyses);
 const v=mount(JSON.parse(JSON.stringify({...source,default_views:prepared})));v.setBranch('agent:a');
 const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 const original=v.edgeEvidence(p.edge);assert.equal(original.group.pooled.k,4);assert.equal(original.group.pooled.model,'random');
 assert.equal(v.analysisFor(p.edge,original.comparison).result,map.savedAnalysis(v.model,p.edge,{endpoint:'OS:HR',studyScope:'all',tailId:'agent:a',headId:'ab'}));
 v.endpointSelector.value='PFS:HR';v.endpointSelector.dispatchEvent({type:'change'});
 assert.equal(v.selectedEndpoint,'PFS:HR');assert.equal(v.edgeEvidence(p.edge).effect.estimate,.45);assert.equal(v.edgeEvidence(p.edge).group.pooled,null);
 v.endpointSelector.value='OS:HR';v.endpointSelector.dispatchEvent({type:'change'});
 assert.equal(v.edgeEvidence(p.edge).group.pooled.estimate,original.group.pooled.estimate);
 const before=v.edgeEvidence(p.edge).group.pooled.estimate;
 v.setInclusion('pool-four',false);assert.equal(v.edgeEvidence(p.edge).group.pooled.k,3);assert.notEqual(v.edgeEvidence(p.edge).group.pooled.estimate,before);
 v.resetInclusions();assert.equal(v.edgeEvidence(p.edge).group.pooled.k,4);assert.equal(v.edgeEvidence(p.edge).group.pooled.estimate,before);
});
test('one source per paper and independent trial, selectable design scope and pooled arrows',()=>{
 const v=mount(pooledGraph());v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 assert.equal(v.model.comparisons.length,4,'R2/R3 same-paper effect contributes once');
 assert.equal(v.edgeEvidence(p.edge).group.pooled.k,4);
 assert.equal(data(p.element,'effectState'),'worse');
 assert.ok(withClass(v.comparisonBand,'tm-pooled-summary').length);
 v.setStudyScope('trials');assert.equal(v.edgeEvidence(p.edge).group.pooled.k,3);
 v.setStudyScope('randomized');assert.equal(v.edgeEvidence(p.edge).group.pooled.k,2);
});
test('one displayed ipilimumab add-on OS analysis follows inclusion checkboxes through three, two, one and no studies',()=>{
 const fs=require('node:fs'),path=require('node:path'),released=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/data/treatment_map.json'),'utf8'));
 const tail='agent:ipilimumab',head=released.nodes.find(node=>node.components.length===2&&node.components.includes('ipilimumab')&&node.components.includes('nivolumab')).id;
 const ids=new Set([tail,head]),g={...released,nodes:released.nodes.filter(node=>ids.has(node.id)),relationships:released.relationships.filter(edge=>ids.has(edge.parent_id)&&ids.has(edge.child_id)),comparisons:released.comparisons.filter(c=>[c.intervention.node_id,c.comparator.node_id].every(id=>ids.has(id)))};
 const before=JSON.stringify(g),v=mount(g);v.setBranch(tail);const p=pair(v,tail,head);v.selectParallel(p.edge.id);v.planningEnabled=true;
 const initial=v.edgeEvidence(p.edge).group;assert.equal(initial.pooled.k,3);assert.equal(initial.pooled.model,'random');
 const selected=initial.selected,order=['37592104','39282897','27622997'];
 for(let remaining=3;remaining>=0;remaining--){
  const evidence=v.edgeEvidence(p.edge);assert.equal(evidence.analysis.groups.length,1);assert.equal(evidence.group.selected.length,remaining);
  assert.equal(withClass(v.comparisonBand,'tm-analysis-group').length,0);assert.doesNotMatch(v.comparisonBand.textContent,/Analysis to display|Selected · other analysis/);
  const rows=cohortTableRows(v),checked=rows.filter(row=>withClass(row,'tm-inclusion-checkbox')[0].checked);
  assert.equal(checked.length,remaining);assert.ok(checked.every(row=>data(row,'displayedPool')==='true'),'every checked row contributes to the displayed analysis');
  const tabs=withClass(v.comparisonBand,'tm-comparison-tab').slice(1);assert.ok(tabs.every(tab=>tab.disabled===(remaining<2)));
  if(remaining){
   const expected=evidence.group.pooled||evidence.group.single;assert.equal(Number(withClass(v.comparisonBand,'tm-effect-link')[0].getAttribute('data-estimate')),expected.estimate);
   assert.equal(Number(data(p.element,'estimate')),expected.estimate);assert.ok(v.planningFor(p.edge).required.events>0);
   assert.equal(withClass(v.comparisonBand,'tm-reported-label')[0].textContent,remaining>1?'Pooled estimate':'Study estimate');
   if(remaining===2)assert.equal(expected.model,'fixed');
   const id=selected.find(row=>row.pmid===order[3-remaining]).id;checkRow(v,id,false);
  }else{
   assert.equal(evidence.effect,null);assert.equal(v.planningFor(p.edge).rows.length,0);assert.equal(hasArrow(v.parallelLinkTitles.get(p.edge.id).path),false);
  }
 }
 assert.equal(JSON.stringify(g),before);
});
test('direct-comparison primary estimate is pooled and agrees with the arrow across different source-selection states',()=>{
 const g=pooledGraph(),before=JSON.stringify(g),v=mount(g);v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 const check=()=>{const e=v.edgeEvidence(p.edge),link=withClass(v.comparisonBand,'tm-effect-link')[0];
  assert.equal(withClass(v.comparisonBand,'tm-reported-label')[0].textContent,'Pooled estimate');
  assert.equal(link.getAttribute('data-basis'),'pooled');
  assert.equal(Number(link.getAttribute('data-estimate')),e.group.pooled.estimate);
  assert.equal(Number(link.getAttribute('data-ci-lower')),e.group.pooled.ci_lower);
  assert.equal(Number(link.getAttribute('data-ci-upper')),e.group.pooled.ci_upper);
  assert.equal(e.effect.estimate,e.group.pooled.estimate);
  assert.notEqual(e.group.pooled.estimate,e.comparison.estimate,'the pooled estimate differs from its individual source');
  assert.equal(v.parallelLinkTitles.get(p.edge.id).title.textContent,'A + B vs A HR='+e.group.pooled.estimate.toFixed(3));
  const boxes=withClass(v.comparisonBand,'tm-comparison-arm');assert.match(boxes[0].textContent,/InterventionA \+ B/);assert.match(boxes[1].textContent,/ComparatorA/);
  assert.doesNotMatch(v.comparisonBand.textContent,/reciprocal/i);
 };
 check();chooseSource(v,'pool-two');check();
 v.setStudyScope('randomized');check();assert.equal(v.edgeEvidence(p.edge).group.pooled.k,2);
 v.setInclusion('pool-two',false);
 assert.equal(withClass(v.comparisonBand,'tm-reported-label')[0].textContent,'Study estimate');
 assert.equal(Number(withClass(v.comparisonBand,'tm-effect-link')[0].getAttribute('data-estimate')),.7);
 assert.equal(v.parallelLinkTitles.get(p.edge.id).title.textContent,'A + B vs A HR=0.700');
 assert.equal(v.edgeEvidence(p.edge).comparison.pmid,'200');
 for(const name of ['tm-source-choice','tm-comparison-source','tm-comparison-population','tm-estimate-context'])assert.equal(withClass(v.comparisonBand,name).length,0);
 assert.ok(withClass(v.comparisonBand,'tm-inclusion-table').length,'study sources remain in the cohort table');
 assert.equal(JSON.stringify(g),before);
});
test('pooled binary planning preserves target/reference ratios when switching the planned arm',()=>{
 const g=pooledGraph();g.comparisons=g.comparisons.slice(0,2).map((c,i)=>({...c,outcome:'ORR',measure:'RR',estimate:[1.4,1.8][i],ci_lower:[1.1,1.3][i],ci_upper:[1.8,2.4][i],analysis:{...c.analysis,
  model_family:'risk_ratio_unspecified',compatibility:{key:'binary',eligible:true,label:'ORR'},planning_assumptions:[{id:'p0',kind:'binary_probability',arm_role:'comparator',probability:.4,time_months:12,outcome:'ORR',source_refs:[]}]}}));
 const v=mount(g);v.setBranch('agent:a');v.setEndpoint('ORR:RR');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 const pooled=v.edgeEvidence(p.edge).group.pooled.estimate;
 v.planningSettings={...v.planningSettings,arms:1,plannedSide:'head'};let plan=v.planningFor(p.edge);
 for(const r of plan.rows){assert.ok(r.pooled.n>0);assert.ok(Math.abs(r.pooled.p1-r.pooled.p0*pooled)<1e-12);}
 v.planningSettings={...v.planningSettings,plannedSide:'tail'};plan=v.planningFor(p.edge);
 for(const r of plan.rows){assert.ok(r.pooled.n>0);assert.ok(Math.abs(r.pooled.p1-r.pooled.p0/pooled)<1e-12);assert.ok(Math.abs(r.own.p1-.4)<1e-12);}
});
test('automatic model labels update across three, two and one included cohorts without calling a single result meta-analysis',()=>{
 const v=mount(pooledGraph());v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);v.setStudyScope('trials');
 assert.equal(v.edgeEvidence(p.edge).group.pooled.k,3);assert.match(withClass(v.comparisonBand,'tm-pooled-summary')[0].textContent,/Random-effects \(REML\)/);assert.match(v.parallelLinks.get(p.edge.id).getAttribute('aria-label'),/Random-effects \(REML\) meta-analysis/);
 v.setStudyScope('randomized');assert.equal(v.edgeEvidence(p.edge).group.pooled.k,2);assert.match(withClass(v.comparisonBand,'tm-pooled-summary')[0].textContent,/Fixed-effect/);assert.match(v.parallelLinks.get(p.edge.id).getAttribute('aria-label'),/Fixed-effect meta-analysis/);
 v.setInclusion('pool-two',false);assert.equal(v.edgeEvidence(p.edge).group.pooled,null);assert.equal(withClass(v.comparisonBand,'tm-pooled-summary').length,0);assert.match(v.parallelLinks.get(p.edge.id).getAttribute('aria-label'),/Individual study/);assert.doesNotMatch(v.parallelLinkTitles.get(p.edge.id).title.textContent,/meta-analysis/);assert.ok(withClass(v.comparisonBand,'tm-comparison-tab').slice(1).every(button=>button.disabled));
 assert.equal(v.parallelLinkTitles.get(p.edge.id).title.textContent, 'A + B vs A HR='+v.edgeEvidence(p.edge).effect.estimate.toFixed(3));
 assert.equal(withClass(v.comparisonBand,'tm-meta-availability')[0].textContent,'1 independent cohort in this population; meta-analysis needs at least 2.');
});
test('diagnostics hide map guidance only while open and restore it for direct comparisons, overview and absent endpoints',()=>{
 const v=mount(pooledGraph());v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 const tabs=()=>withClass(v.comparisonBand,'tm-comparison-tab'),methods=withClass(v.root,'tm-methods')[0];
 assert.ok(methods);assert.equal(methods.hidden,false);assert.equal(tabs().length,4);assert.ok(tabs().every(t=>!t.disabled));
 tabs()[1].click();assert.equal(v.analysisTab,'forest');assert.ok(withClass(v.comparisonBand,'tm-analysis-panel').length);assert.match(v.comparisonBand.textContent,/Random.effects/);assert.equal(methods.hidden,true);
 tabs()[2].click();assert.match(v.comparisonBand.textContent,/10 independent/i);assert.equal(methods.hidden,true);
 tabs()[3].click();assert.match(v.comparisonBand.textContent,/Leave.one.out/i);assert.equal(methods.hidden,true);
 tabs()[0].click();assert.equal(methods.hidden,false);assert.ok(withClass(v.comparisonBand,'tm-inclusion-table').length);
 tabs()[1].click();assert.equal(methods.hidden,true);v.setBranch('all');assert.equal(methods.hidden,false);
 v.setBranch('agent:a');v.selectParallel(pair(v,'agent:a','ab').edge.id);tabs()[1].click();assert.equal(methods.hidden,true);
 v.setEndpoint('PFS:HR');assert.equal(v.comparisonBand.hidden,true,'no old OS charts for absent PFS');assert.equal(methods.hidden,false);
});
test('planning controls remain in the concise sidebar and produce both source and pooled N columns',()=>{
 const v=mount(pooledGraph());v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 assert.equal(withClass(v.details,'tm-planning-controls').length,1);assert.equal(withClass(v.details,'tm-detail-comparisons').length,0);
 withClass(v.details,'tm-planning-toggle')[0].click();assert.equal(v.planningEnabled,true);
 assert.equal(withClass(v.world,'tm-planning-label').length,1);assert.match(v.comparisonBand.textContent,/Required events \(E\)/);assert.match(v.comparisonBand.textContent,/Event rate for N/);assert.match(v.comparisonBand.textContent,/Pooled effect/);
 const plan=v.planningFor(p.edge);assert.equal(plan.rows.length,4);assert.ok(plan.rows.every(r=>r.own.n&&r.pooled.n&&r.own.p0===r.pooled.p0));
 v.planningSettings={...v.planningSettings,arms:1};v.renderDetails();v.renderComparison();v.updateSelection();assert.ok(v.planningFor(p.edge).rows.every(r=>r.own.n&&r.pooled.n));
 v.setBranch('all');assert.equal(withClass(v.world,'tm-planning-label').length,0,'planning labels belong to branch plots');
});
test('single trial without precision keeps diagnostic tabs disabled but calculates required events',()=>{
 const g=pooledGraph();g.comparisons=[{...g.comparisons[0],ci_lower:null,ci_upper:null}];
 const v=mount(g);v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 const tabs=withClass(v.comparisonBand,'tm-comparison-tab');assert.ok(tabs.slice(1).every(t=>t.disabled));
 withClass(v.details,'tm-planning-toggle')[0].click();const plan=v.planningFor(p.edge);assert.ok(plan.required.events>0);assert.ok(plan.rows[0].own.n);assert.equal(plan.rows[0].pooled,null);
});
test('arm percentages alone display a calculated point estimate and keep pooling disabled',()=>{
 const g=pooledGraph(),src=g.comparisons[0];
 g.comparisons=[{...src,outcome:'ORR',measure:'RR',estimate:1.8,ci_lower:null,ci_upper:null,ci_level:null,
   calculation:{method:'from_arm_binary_outcomes',outcome_context:{endpoint:'ORR'}},
   analysis:{...src.analysis,planning_assumptions:[{id:'p0',kind:'binary_probability',arm_role:'comparator',probability:.12,source_refs:[]}]}}];
 const v=mount(g);v.setBranch('agent:a');v.setEndpoint('ORR:RR');const {edge}=pair(v,'agent:a','ab');v.selectParallel(edge.id);
 assert.equal(v.edgeEvidence(edge).effect.estimate,1.8);assert.equal(v.edgeEvidence(edge).effect.ci_valid,false);
 assert.match(v.comparisonBand.textContent,/Study estimate · calculated from arm rates/);
 assert.ok(withClass(v.comparisonBand,'tm-comparison-tab').slice(1).every(tab=>tab.disabled));
});
test('insufficient study sample sizes use one latest result for arrows, Study estimate and planning',()=>{
 for(const availableN of [0,1]){
  const g=pooledGraph();g.nodes=g.nodes.map(node=>node.id==='ab'?{...node,overview_parent_id:'agent:a'}:node);
  g.comparisons=g.comparisons.slice(0,2).map((source,index)=>({...source,analysis:{...source.analysis,
    publication_year:index?2026:2023,sample_size:sampleProof(source.pmid,index||!availableN?null:100)}}));
  const other=g.comparisons[0];g.comparisons.push({...other,id:'zz-other-context',pmid:'299',default_rank:999,
    analysis:{...analysisMeta('nct:other','randomized_trial','299'),model_family:'accelerated_failure_time',compatibility:{key:'separate-model',model_family:'accelerated_failure_time',label:'Accelerated failure-time model',eligible:true}}});
  const before=JSON.stringify(g),v=mount(g),latest=g.comparisons[1];
  const radial=pair(v,'agent:a','ab');
  assert.equal(v.edgeEvidence(radial.edge).comparison.id,latest.id);
  assert.equal(v.edgeEvidence(radial.edge).effect.estimate,latest.estimate);
  assert.equal(data(radial.element,'comparisonId'),latest.id);
  v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
  const evidence=v.edgeEvidence(p.edge);assert.equal(evidence.group.pooled,null);
  assert.equal(evidence.group.latest_fallback.sample_size_studies,availableN);
  assert.equal(evidence.comparison.id,latest.id);assert.equal(v.activeComparisonId,latest.id);
  assert.equal(evidence.effect.estimate,latest.estimate);
  assert.equal(withClass(v.comparisonBand,'tm-meta-availability').length,0,'do not describe two source studies as one cohort');
  assert.ok(withClass(v.comparisonBand,'tm-comparison-tab').slice(1).every(button=>button.disabled));
  assert.match(withClass(v.comparisonBand,'tm-effect-link')[0].textContent,/HR 0\.8/);
  const note=withClass(v.comparisonBand,'tm-latest-fallback-note')[0];assert.ok(note);
  assert.ok(note.classList.contains('tm-count-note'),'reuse the small gray note style');
  assert.match(note.textContent,/latest/i);assert.match(note.textContent,/sample size/i);
  assert.equal(v.comparisonBand.children[v.comparisonBand.children.indexOf(note)+1].textContent,'Study estimate');
  assert.equal(withClass(v.comparisonBand,'tm-source-choice').length,0);
  assert.equal(withClass(v.comparisonBand,'tm-analysis-group').length,0);
  const latestRow=withClass(v.comparisonBand,'tm-inclusion-table').flatMap(descendants).find(row=>data(row,'comparisonId')===latest.id);
  assert.equal(withClass(latestRow,'tm-inclusion-status')[0].textContent,'Latest result · N unavailable');
  assert.equal(withClass(latestRow,'tm-inclusion-checkbox')[0].disabled,true);
  withClass(v.details,'tm-planning-toggle')[0].click();
  const plan=v.planningFor(p.edge);assert.equal(plan.rows.length,1);assert.equal(plan.rows[0].comparison.id,latest.id);
  assert.equal(plan.rows[0].effect,latest.estimate);assert.ok(plan.required.events>0);assert.equal(plan.required.events,plan.rows[0].own.events);
  assert.equal(plan.rows[0].pooled,null);assert.equal(JSON.stringify(g),before,'do not alter source Ns or effects');
  if(availableN===1){
    const known=structuredClone(g);known.comparisons[0].analysis.sample_size=sampleProof(known.comparisons[0].pmid,null);
    known.comparisons[1].analysis.sample_size=sampleProof(latest.pmid,100);
    const view=mount(known);view.setBranch('agent:a');view.selectParallel(pair(view,'agent:a','ab').edge.id);
    const selected=withClass(view.comparisonBand,'tm-inclusion-table').flatMap(descendants).find(row=>data(row,'comparisonId')===latest.id);
    assert.equal(withClass(selected,'tm-inclusion-status')[0].textContent,'Latest result');
    assert.equal(withClass(selected,'tm-inclusion-checkbox')[0].disabled,false);
  }
 }
});
test('latest missing-N fallback preserves reversed parallel-arm direction and source-bound planning',()=>{
 const base=graph.comparisons.find(source=>source.id==='ab-ac-os-parallel');
 const old={...base,id:'old-parallel',pmid:'700',analysis:{...analysisMeta('nct:old','randomized_trial','700'),publication_year:2023}};
 const latest={...base,id:'latest-parallel',pmid:'701',intervention:base.comparator,comparator:base.intervention,estimate:1.3,ci_lower:1.1,ci_upper:1.6,
  analysis:{...analysisMeta('nct:latest','randomized_trial','701'),publication_year:2026,sample_size:sampleProof('701',null)}};
 const v=mount({...graph,comparisons:[old,latest]});v.setBranch('agent:a');
 const edge=v.tree.comparisonEdges.find(item=>item.comparison_ids.includes(latest.id));assert.ok(edge);v.selectParallel(edge.id);
 const evidence=v.edgeEvidence(edge);assert.equal(evidence.comparison.id,latest.id);
 assert.equal(evidence.tailId,'ab');assert.equal(evidence.headId,'ac');assert.equal(evidence.effect.estimate,1.3);
 assert.match(withClass(v.comparisonBand,'tm-effect-link')[0].textContent,/HR 1\.3/);
 const plan=v.planningFor(edge);assert.equal(plan.plannedId,'ac');assert.equal(plan.referenceId,'ab');
 assert.equal(plan.rows.length,1);assert.equal(plan.rows[0].comparison.id,latest.id);assert.equal(plan.rows[0].effect,1.3);
});
test('map labels and cohort cells mark converted 95% CIs while source records retain the original interval',()=>{
 const g=pooledGraph();g.comparisons=[{...g.comparisons[0],ci_level:99}];const before=JSON.stringify(g);
 const v=mount(g);v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 assert.match(withClass(v.comparisonBand,'tm-effect-link')[0].textContent,/95% CI.*converted/);
 assert.match(withClass(v.comparisonBand,'tm-arrow-interpretation')[0].textContent,/95% CI.*converted/);
 assert.equal(withClass(v.comparisonBand,'tm-ci-converted')[0].textContent,'95% CI, converted');
 assert.match(withClass(v.comparisonBand,'tm-ci-converted')[0].title,/Approximate 95% CI converted from the reported 99%/);
 assert.equal(withClass(v.comparisonBand,'tm-estimate-context').length,0);
 assert.equal(v.model.comparisons[0].ci_level,99);
 assert.equal(JSON.stringify(g),before);
});
test('unsupported non95 map intervals show their estimate without public original bounds',()=>{
 const g=pooledGraph();g.comparisons=[{...g.comparisons[0],ci_level:99,ci_method:'profile likelihood'}];const before=JSON.stringify(g);
 const v=mount(g);v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 assert.match(withClass(v.comparisonBand,'tm-effect-link')[0].textContent,/HR 0.700 \(95% CI unavailable\)/);
 assert.match(withClass(v.comparisonBand,'tm-arrow-interpretation')[0].textContent,/95% CI unavailable/);
 assert.match(withClass(v.comparisonBand,'tm-inclusion-table')[0].textContent,/95% CI unavailable/);
 assert.doesNotMatch(withClass(v.comparisonBand,'tm-inclusion-table')[0].textContent,/99% CI/);
 assert.equal(withClass(v.comparisonBand,'tm-estimate-context').length,0);
 assert.equal(v.model.comparisons[0].ci_level,99);
 assert.equal(JSON.stringify(g),before);
});
test('the evidence tabs have labelled panels, with meta-analysis diagnostics only inside comparisons',()=>{
 const fs=require('node:fs'),path=require('node:path'),html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
 for (const tab of ['treatment-map','articles','underpowered-studies','new-findings']) {
   assert.ok(html.includes('data-analysis-tab="'+tab+'"'));
   assert.ok(html.includes('aria-controls="analysis-'+tab+'"'));
   assert.ok(html.includes('aria-labelledby="tab-'+tab+'"'));
 }
 for(const tab of ['forest','bias','sensitivity'])assert.ok(!html.includes('data-analysis-tab="'+tab+'"'));
});

test('unresolved competing trial results never supply an arbitrary planning effect',()=>{
 const g=pooledGraph();g.comparisons=[g.comparisons[0],{...g.comparisons[0],id:'conflict',pmid:'999',analysis:{...g.comparisons[0].analysis,sample_size:sampleProof('999')},estimate:0.4,ci_lower:0.3,ci_upper:0.5}];
 const v=mount(g);v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 const evidence=v.edgeEvidence(p.edge);assert.equal(evidence.group.pooled,null);
 assert.ok(evidence.group.excluded.every(row=>row.reason==='unresolved_same_trial_results'));
 const plan=v.planningFor(p.edge);assert.equal(plan.rows.length,0);assert.equal(plan.required,null);
});
test('default arrows and selected source advance to a supported newer trial result across missing metadata',()=>{
 const g=pooledGraph(),base=g.comparisons[0];
 const old={...base,id:'older',pmid:'100',default_rank:0,analysis:{...base.analysis,sample_size:sampleProof('100'),publication_year:2022,model_family:'hazard_ratio_unspecified',compatibility:{...base.analysis.compatibility,key:JSON.stringify(['randomized_trial','advanced','general_melanoma','unspecified','unspecified','hazard_ratio_unspecified','unknown','OS','overall','unspecified']),model_family:'hazard_ratio_unspecified'}}};
 const newer={...base,id:'newer',pmid:'101',default_rank:1,estimate:.4,ci_lower:.3,ci_upper:.5,analysis:{...base.analysis,sample_size:sampleProof('101'),publication_year:2024}};
 g.comparisons=[old,newer];const v=mount(g);v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 assert.equal(v.activeComparisonId,'newer');assert.equal(v.edgeEvidence(p.edge).comparison.id,'newer');assert.equal(v.edgeEvidence(p.edge).effect.estimate,.4);
 assert.equal(v.planningFor(p.edge).rows[0].comparison.id,'newer');
});
test('parallel one-arm planning defaults to the arrowhead and switches the effect and reference probability together',()=>{
 const source=graph.comparisons.find(c=>c.id==='a-b-os-parallel');
 const g={...graph,comparisons:[{...source,analysis:analysisMeta('nct:one','randomized_trial',source.pmid)}]};
 const v=mount(g);v.setBranch('agent:a');const p=pair(v,'agent:a','agent:b');v.selectParallel(p.edge.id);
 v.planningSettings={...v.planningSettings,arms:1};let plan=v.planningFor(p.edge);const arrow=v.edgeEvidence(p.edge).effect.estimate;
 assert.equal(plan.plannedId,'agent:b');assert.equal(plan.referenceId,'agent:a');assert.equal(plan.rows[0].effect,1.25);assert.ok(plan.rows[0].own.n);
 assert.ok(Math.abs(plan.rows[0].own.p1-.4)<1e-12);
 v.planningSettings={...v.planningSettings,plannedSide:'tail'};plan=v.planningFor(p.edge);
 assert.equal(plan.plannedId,'agent:a');assert.equal(plan.referenceId,'agent:b');assert.equal(plan.rows[0].effect,.8);assert.ok(plan.rows[0].own.n);
 assert.equal(v.edgeEvidence(p.edge).effect.estimate,arrow);assert.ok(Math.abs(plan.rows[0].own.p0-.4)<1e-12);
});

function assertDash(view, edge, expected) {
  const element = view.parallelLinks.get(edge.id), path = view.parallelLinkTitles.get(edge.id).path;
  assert.equal(data(element, 'ciExcludesNull'), expected === null ? 'unknown' : String(expected));
  const dash = path.getAttribute('stroke-dasharray');
  if (expected === false) assert.ok(dash && dash !== 'none' && /[1-9]/.test(dash), 'the visible comparison path is dashed when its valid interval includes the null');
  else assert.ok(!dash || dash === 'none' || /^0(?:[ ,]+0)*$/.test(dash), 'the visible comparison path is solid');
}
function intervalGraph(estimates) {
  const base = graph.comparisons.find(c => c.id === 'ab-a-os');
  return { ...graph, nodes: graph.nodes.map(item => item.id === 'ab' ? { ...item, overview_parent_id: 'agent:a' } : item),
    comparisons: estimates.map(([estimate, lower, upper], i) => ({ ...base, id: 'interval-' + i, pmid: String(3000 + i), default_rank: i,
      estimate, ci_lower: lower, ci_upper: upper, analysis: analysisMeta('trial:interval-' + i,'randomized_trial',String(3000+i)) })) };
}

test('HR plot labels prioritize required events even when source and pooled total N are available', () => {
  const v = mount(pooledGraph()); v.setBranch('agent:a'); const p = pair(v, 'agent:a', 'ab'); v.selectParallel(p.edge.id);
  withClass(v.details, 'tm-planning-toggle')[0].click();
  let plan = v.planningFor(p.edge); assert.ok(plan.rows.every(row => row.own.n > 0 && row.pooled.n > 0));
  assert.match(plan.label, /^E=[\d,]+$/); assert.doesNotMatch(plan.label, /N=|D=/);
  assert.ok(withClass(v.world, 'tm-planning-label').every(element => /E=/.test(element.textContent) && !/N=|D=/.test(element.textContent)));
  v.planningSettings = { ...v.planningSettings, arms: 1 }; v.renderDetails(); v.renderComparison(); v.updateSelection();
  plan = v.planningFor(p.edge); assert.ok(plan.required.events > 0); assert.match(plan.label, /^E=/);
  v.setPlanningSettings({arms:1,mode:'precision',manualExpectedProbability:.3,manualHorizon:12,manualProbability:.4});
  plan = v.planningFor(p.edge); assert.ok(plan.required.events>0); assert.match(plan.label,/^E=/);
  assert.doesNotMatch(v.details.textContent,/Planning aim|Time horizon|Reported intervention|Estimate rate precisely|CI half-width/);
  assert.ok(plan.rows.every(row => row.own.n > 0 && row.pooled.n > 0)); assert.match(v.comparisonBand.textContent, /Total N/);
});

test('binary response plot labels continue to show N rather than an event target', () => {
  const base = graph.comparisons.find(c => c.id === 'bc-b-orr');
  const meta = analysisMeta('trial:binary','randomized_trial',base.pmid); meta.planning_assumptions = [{ id: 'orr-rate', kind: 'binary_probability', outcome: 'ORR', arm_role: 'comparator', probability: 0.2, source_refs: [] }];
  const v = mount({ ...graph, comparisons: [{ ...base, analysis: meta }] }); v.setBranch('agent:b'); v.setEndpoint('ORR:RR');
  const p = pair(v, 'agent:b', 'bc'); v.selectParallel(p.edge.id); withClass(v.details, 'tm-planning-toggle')[0].click();
  const plan = v.planningFor(p.edge); assert.match(plan.label, /^N=[\d,]+$/); assert.doesNotMatch(plan.label, /E=|D=/);
  assert.ok(plan.rows[0].own.n > 0);
});

test('single-source branch comparisons are dashed for null-including intervals and reset when endpoints change', () => {
  const base = intervalGraph([[0.7, 0.5, 0.9]]);
  const first = base.comparisons[0];
  base.comparisons.push({ ...first, id: 'pfs-touching', outcome: 'PFS', estimate: 0.8, ci_lower: 0.6, ci_upper: 1 },
    { ...first, id: 'rfs-missing', outcome: 'RFS', ci_lower: null, ci_upper: null });
  const v = mount(base); v.setBranch('agent:a'); const p = pair(v, 'agent:a', 'ab');
  assertDash(v, p.edge, true);
  v.setEndpoint('PFS:HR'); assertDash(v, p.edge, false);
  v.setEndpoint('RFS:HR'); assertDash(v, p.edge, null);
  v.setEndpoint('DFS:HR'); assertDash(v, p.edge, null);
  v.setEndpoint('OS:HR'); assertDash(v, p.edge, true);
});

test('the CI legend states the requested null-including dashed convention exactly', () => {
  const v = mount(intervalGraph([[0.8, 0.6, 1.1]]));
  for (const [className, label] of [['tm-ci-dashed', 'Dashed · CI includes 0 on the log scale'], ['tm-ci-solid', 'Solid · CI excludes 0 or is unavailable']]) {
    const marker = withClass(v.legend, className)[0]; assert.ok(marker, className);
    assert.ok(marker.classList.contains('tm-arrow'));
    assert.equal(marker.parentNode.textContent, label);
  }
});

test('parallel-arm comparisons use the same CI dash rule in either centered branch', () => {
  const base = graph.comparisons.find(c => c.id === 'a-b-os-parallel');
  const source = { ...graph, comparisons: [base, { ...base, id: 'parallel-pfs-touching', outcome: 'PFS', ci_lower: 0.6, ci_upper: 1 }] };
  for (const branch of ['agent:a', 'agent:b']) {
    const v = mount(source); v.setBranch(branch);
    const edge = v.tree.comparisonEdges.find(item => item.kind === 'parallel'); assert.ok(edge);
    assertDash(v, edge, true); v.setEndpoint('PFS:HR'); assertDash(v, edge, false);
  }
});

test('pooled confidence intervals control branch dashes independently of the selected source confidence interval', () => {
  const excluding = mount(intervalGraph([[0.8, 0.6, 1.06], [0.8, 0.6, 1.06]])); excluding.setBranch('agent:a');
  let p = pair(excluding, 'agent:a', 'ab'); excluding.selectParallel(p.edge.id);
  let evidence = excluding.edgeEvidence(p.edge);
  assert.equal(evidence.group.pooled.k, 2); assert.equal(Effects.directedEffect(evidence.comparison, 'agent:a', 'ab').ciExcludesNull, false);
  assert.equal(evidence.effect.ciExcludesNull, true); assertDash(excluding, p.edge, true);
  const crossing = mount(intervalGraph([[0.5, 0.4, 0.6], [2, 1.6, 2.4]])); crossing.setBranch('agent:a');
  p = pair(crossing, 'agent:a', 'ab'); crossing.selectParallel(p.edge.id); evidence = crossing.edgeEvidence(p.edge);
  assert.equal(evidence.group.pooled.k, 2); assert.equal(Effects.directedEffect(evidence.comparison, 'agent:a', 'ab').ciExcludesNull, true);
  assert.equal(evidence.effect.ciExcludesNull, false); assertDash(crossing, p.edge, false);
});

test('radial comparison paths stay straight while source or pooled CI state controls their dashes', () => {
  const v = mount(intervalGraph([[0.8, 0.6, 1.06], [0.8, 0.6, 1.06]]));
  const p = pair(v, 'agent:a', 'ab'), before = v.parallelLinkTitles.get(p.edge.id).path.getAttribute('d');
  assert.match(before, /^M.*L/); assert.doesNotMatch(before, /[CQ]/); assertDash(v, p.edge, true);
  v.setEndpoint('PFS:HR'); assertDash(v, p.edge, null); assert.equal(v.parallelLinkTitles.get(p.edge.id).path.getAttribute('d'), before);
  v.setEndpoint('OS:HR'); assertDash(v, p.edge, true); assert.equal(v.parallelLinkTitles.get(p.edge.id).path.getAttribute('d'), before);
  const crossing = mount(intervalGraph([[0.5, 0.4, 0.6], [2, 1.6, 2.4]])); const other = pair(crossing, 'agent:a', 'ab');
  assertDash(crossing, other.edge, false); assert.doesNotMatch(crossing.parallelLinkTitles.get(other.edge.id).path.getAttribute('d'), /[CQ]/);
  for (const [bounds, expected] of [[[0.7, 0.5, 0.9], true], [[0.8, 0.6, 1], false], [[0.8, null, null], null]]) {
    const single = mount(intervalGraph([bounds])), sourcePair = pair(single, 'agent:a', 'ab');
    assert.equal(single.edgeEvidence(sourcePair.edge).group.pooled, null); assertDash(single, sourcePair.edge, expected);
    assert.doesNotMatch(single.parallelLinkTitles.get(sourcePair.edge.id).path.getAttribute('d'), /[CQ]/);
  }
});

test('survival planning table pairs each study and pooled E, actual event denominator and total N',()=>{
 const v=mount(pooledGraph());v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);withClass(v.details,'tm-planning-toggle')[0].click();
 const plan=v.planningFor(p.edge),table=withClass(v.comparisonBand,'tm-planning-survival')[0];assert.ok(table);
 const headers=withClass(table,'tm-plan-group');assert.equal(headers.length,2);assert.ok(headers.every(h=>h.colSpan===3));
 const rates=withClass(table,'tm-plan-rate'),events=withClass(table,'tm-plan-events'),ns=withClass(table,'tm-plan-n');
 assert.equal(rates.length,plan.rows.length*2);assert.equal(events.length,rates.length);assert.equal(ns.length,rates.length);
 plan.rows.forEach((row,i)=>[row.own,row.pooled].forEach((r,j)=>{const at=i*2+j;assert.equal(Number(data(events[at],'value')),r.events);assert.equal(Number(data(rates[at],'value')),r.event_rate);assert.equal(Number(data(ns[at],'value')),r.n);assert.equal(r.n,Math.ceil(r.events/r.event_rate));}));
 assert.match(v.comparisonBand.textContent,/Each HR can imply a different planned-arm rate/);
 v.setPlanningSettings({arms:1,manualProbability:.3});
 assert.ok(withClass(v.comparisonBand,'tm-plan-events').every(c=>Number(data(c,'value'))>0));
 assert.ok(withClass(v.comparisonBand,'tm-plan-rate').every(c=>Number(data(c,'value'))>0));
 assert.ok(withClass(v.comparisonBand,'tm-plan-n').every(c=>Number(data(c,'value'))>0));
});

test('actual CheckMate067 shows both reported arm event probabilities visibly in one study row without changing E or N', () => {
  const fs = require('node:fs'), path = require('node:path');
  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/data/treatment_map.json'), 'utf8'));
  const source = saved.comparisons.find(item => item.id === 'effect:4813f641f5c4dd7783b285ad'); assert.ok(source);
  const before = JSON.stringify(source), included = new Set([source.intervention.node_id, source.comparator.node_id, 'agent:ipilimumab']);
  const fixture = { nodes: saved.nodes.filter(item => included.has(item.id)), comparisons: [source], contributions: [],
    relationships: saved.relationships.filter(item => included.has(item.parent_id) && included.has(item.child_id)) };
  const v = mount(fixture); v.setBranch(source.comparator.node_id); v.setEndpoint('PFS:HR');
  const p = pair(v, source.comparator.node_id, source.intervention.node_id); v.selectParallel(p.edge.id);
  withClass(v.details, 'tm-planning-toggle')[0].click();
  const plan = v.planningFor(p.edge), table = withClass(v.comparisonBand, 'tm-planning-survival')[0];
  assert.equal(plan.rows.length, 1); assert.ok(table);
  const body = table.children.find(item => item.tagName === 'TBODY'); assert.ok(body);
  assert.equal(body.children.filter(item => item.tagName === 'TR').length, 1);
  const reported = withClass(table, 'tm-reported-event-row'); assert.equal(reported.length, 2);
  assert.match(reported.find(item => !/Ipilimumab/i.test(item.textContent)).textContent, /Nivolumab.*68%/i);
  assert.match(reported.find(item => /Ipilimumab/i.test(item.textContent)).textContent, /Ipilimumab\s*\+\s*Nivolumab.*61%/i);
  for (const row of reported) {
    assert.ok(row.parentNode.classList.contains('tm-reported-event-rows'));
    for (let ancestor = row.parentNode; ancestor && ancestor !== table; ancestor = ancestor.parentNode) assert.notEqual(ancestor.tagName, 'DETAILS', 'reported event probabilities are visible without expanding details');
  }
  const rateCell = withClass(table, 'tm-plan-rate')[0]; assert.match(rateCell.textContent, /Used for N/); assert.match(rateCell.textContent, /63\.44%/);
  assert.equal(Number(data(rateCell, 'value')), 0.6344171002838278);
  assert.equal(Number(data(withClass(table, 'tm-plan-events')[0], 'value')), 509);
  assert.equal(Number(data(withClass(table, 'tm-plan-n')[0], 'value')), 803);
  assert.equal(plan.rows[0].own.events, 509); assert.equal(plan.rows[0].own.n, 803);
  assert.equal(JSON.stringify(source), before);
});

function cohortFixture(){
 const base=pooledGraph().comparisons[0];
 const row=(id,trial,label,n,estimate,subgroup=false)=>({...base,id,pmid:trial==='trial:one'?'8001':'8002',population:label,estimate,ci_lower:estimate*.8,ci_upper:estimate*1.2,
   analysis:{...analysisMeta(trial),sample_size:sampleProof(trial==='trial:one'?'8001':'8002',n),cohort:{id:trial+':'+(subgroup?'stage-iii':'overall'),root_id:trial+':overall',parent_id:subgroup?trial+':overall':null,independent_group_id:trial,label,scope:subgroup?'subgroup':'overall',is_subgroup:subgroup,sample_n:n,filter_equivalence_keys:subgroup?['stage']:[],stratum_key:subgroup?'stage-iii':'overall'}}});
 return {...graph,nodes:graph.nodes.map(node=>node.id==='ab'?{...node,overview_parent_id:'agent:a'}:node),comparisons:[row('overall-one','trial:one','Overall population',100,.7),row('subgroup-one','trial:one','Stage III subgroup',40,.5,true),row('overall-two','trial:two','Stage III study population',90,.9)]};
}
const cohortTableRows=view=>withClass(view.comparisonBand,'tm-inclusion-table')[0].children.find(child=>child.tagName==='TBODY').children;
const cohortRow=(view,id)=>cohortTableRows(view).find(row=>data(row,'comparisonId')===id);
const checkRow=(view,id,value)=>{const input=withClass(cohortRow(view,id),'tm-inclusion-checkbox')[0];assert.equal(input.disabled,false);input.checked=value;input.dispatchEvent({type:'change'});};
test('inclusion table lists subgroup N and CI without default double counting and supports explicit replacement',()=>{
 const v=mount(cohortFixture());v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 assert.equal(cohortTableRows(v).length,3);assert.equal(data(cohortRow(v,'overall-one'),'included'),'true');assert.equal(data(cohortRow(v,'subgroup-one'),'included'),'false');
 assert.equal(data(cohortRow(v,'subgroup-one'),'pmid'),'8001');assert.equal(withClass(cohortRow(v,'overall-one'),'tm-cohort-study')[0].rowSpan,2);assert.equal(withClass(cohortRow(v,'subgroup-one'),'tm-cohort-study').length,0,'one publication label spans its overall and subgroup rows');
 const table=withClass(v.comparisonBand,'tm-inclusion-table')[0],headers=table.children.find(node=>node.tagName==='THEAD').children[0].children.map(node=>node.textContent);
 assert.deepEqual(headers,['Include','Study','PMID','Published year','Cohort / population','Sample size','Effect size (CI)']);
 assert.doesNotMatch(withClass(cohortRow(v,'overall-one'),'tm-cohort-study')[0].textContent,/8001|2024/);
 for(const [name,text]of [['tm-cohort-pmid','8001'],['tm-cohort-year','2024']]){const cell=withClass(cohortRow(v,'overall-one'),name)[0];assert.equal(cell.textContent,text);assert.equal(cell.rowSpan,2);assert.equal(withClass(cohortRow(v,'subgroup-one'),name).length,0);}
 assert.match(cohortRow(v,'subgroup-one').textContent,/Stage III subgroup.*N=40.*HR/);assert.equal(v.edgeEvidence(p.edge).group.pooled.k,2);
 assert.equal(withClass(v.comparisonBand,'tm-pooling-review').length,0);assert.doesNotMatch(v.comparisonBand.textContent,/Pooling selection details/);
 assert.equal(withClass(cohortRow(v,'subgroup-one'),'tm-inclusion-status')[0].textContent,'Overall used','exclusion status remains on its cohort row');
 checkRow(v,'subgroup-one',true);assert.equal(data(cohortRow(v,'overall-one'),'populationSelected'),'false');assert.equal(data(cohortRow(v,'subgroup-one'),'populationSelected'),'true');
 assert.equal(v.edgeEvidence(p.edge).group.selected.length,2);assert.equal(v.edgeEvidence(p.edge).group.pooled.k,2,'chosen subgroup combines with the other independent study');
 checkRow(v,'overall-one',true);assert.equal(data(cohortRow(v,'subgroup-one'),'populationSelected'),'false');assert.equal(v.edgeEvidence(p.edge).group.pooled.k,2,'last explicit parent selection replaces the child');
});
test('advanced filter selects relevant subgroup and updates every calculation; selecting none clears arrows and planning',()=>{
 const v=mount(cohortFixture());v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);v.planningEnabled=true;
 v.setAdvancedFilters({active:true,label:'Stage III',selections:{stage:'iii'},matches:{'overall-one':{matched:false,specificity:0},'subgroup-one':{matched:true,specificity:1,matched_keys:['stage']},'overall-two':{matched:true,specificity:1,matched_keys:['stage']}}});
 assert.equal(data(cohortRow(v,'overall-one'),'populationSelected'),'false');assert.equal(withClass(cohortRow(v,'overall-one'),'tm-inclusion-checkbox')[0].disabled,true);
 assert.equal(data(cohortRow(v,'subgroup-one'),'included'),'true');assert.equal(v.edgeEvidence(p.edge).group.pooled.k,2);assert.equal(v.planningFor(p.edge).rows.length,2);
 assert.match(v.advancedNote.textContent,/Stage III/);
 checkRow(v,'subgroup-one',false);assert.equal(v.edgeEvidence(p.edge).group.selected.length,1);checkRow(v,'overall-two',false);
 assert.equal(v.edgeEvidence(p.edge).effect,null);assert.equal(v.planningFor(p.edge).rows.length,0);assert.equal(withClass(v.world,'tm-planning-label').length,0);
 assert.equal(hasArrow(v.parallelLinkTitles.get(p.edge.id).path),false);assert.ok(withClass(v.comparisonBand,'tm-comparison-tab').slice(1).every(tab=>tab.disabled));
 assert.equal(withClass(v.comparisonBand,'tm-meta-availability')[0].textContent,'No cohorts selected.');
 v.resetInclusions();assert.equal(v.edgeEvidence(p.edge).group.pooled.k,2);v.setBranch('all');assert.equal(v.edgeEvidence(v.tree.comparisonEdges[0]).group.pooled.k,2);
});
test('every checked eligible row contributes to the one displayed pool after subgroup replacement',()=>{
 const v=mount(cohortFixture());v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 checkRow(v,'subgroup-one',true);
 for(const id of ['subgroup-one','overall-two']){
  const row=cohortRow(v,id);assert.equal(withClass(row,'tm-inclusion-checkbox')[0].checked,true);
  assert.equal(data(row,'included'),'true');assert.equal(data(row,'displayedPool'),'true');assert.equal(withClass(row,'tm-inclusion-status')[0].textContent,'Included');
 }
 assert.equal(withClass(cohortRow(v,'overall-one'),'tm-inclusion-checkbox')[0].checked,false);
 assert.deepEqual(v.edgeEvidence(p.edge).group.selected.map(row=>row.id).sort(),['overall-two','subgroup-one']);
 assert.equal(v.edgeEvidence(p.edge).group.pooled.k,2);assert.equal(withClass(v.comparisonBand,'tm-analysis-group').length,0);
});
test('unchecking a chosen subgroup leaves its cohort excluded until an explicit inclusion or reset',()=>{
 const g=cohortFixture(),before=JSON.stringify(g),v=mount(g);v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 checkRow(v,'subgroup-one',true);assert.deepEqual(v.edgeEvidence(p.edge).group.selected.map(row=>row.id).sort(),['overall-two','subgroup-one']);
 checkRow(v,'subgroup-one',false);
 assert.deepEqual(v.edgeEvidence(p.edge).group.selected.map(row=>row.id),['overall-two']);
 for(const id of ['overall-one','subgroup-one'])assert.equal(withClass(cohortRow(v,id),'tm-inclusion-checkbox')[0].checked,false,'no replacement row is silently checked');
 assert.equal(withClass(v.comparisonBand,'tm-reported-label')[0].textContent,'Study estimate');assert.equal(v.planningFor(p.edge).rows.length,1);
 checkRow(v,'overall-one',true);assert.equal(v.edgeEvidence(p.edge).group.pooled.k,2);
 checkRow(v,'subgroup-one',true);checkRow(v,'subgroup-one',false);v.resetInclusions();
 assert.deepEqual(v.edgeEvidence(p.edge).group.selected.map(row=>row.id).sort(),['overall-one','overall-two']);
 assert.equal(JSON.stringify(g),before);
});
test('aggregate replacement follows only checked component cohorts and never silently checks another row',()=>{
 const g=cohortFixture(),base=g.comparisons[0];
 const make=(id,n,estimate,parent)=>({...base,id,estimate,ci_lower:estimate*.8,ci_upper:estimate*1.2,
  analysis:{...base.analysis,sample_size:sampleProof(base.pmid,n),cohort:{id,root_id:id,independent_group_id:id,scope:parent?'independent_cohort':'overall',is_subgroup:false,label:id,sample_n:n,...(parent?{aggregate_parent_root_id:parent}:{})}}});
 g.comparisons=[make('aggregate',100,.7),make('component-a',40,.6,'aggregate'),make('component-b',60,.8,'aggregate'),g.comparisons[2]];
 const before=JSON.stringify(g),v=mount(g);v.setBranch('agent:a');const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);
 const expect=ids=>{
  assert.deepEqual(v.edgeEvidence(p.edge).group.selected.map(row=>row.id).sort(),ids.slice().sort());
  assert.deepEqual(cohortTableRows(v).filter(row=>withClass(row,'tm-inclusion-checkbox')[0].checked).map(row=>data(row,'comparisonId')).sort(),ids.slice().sort());
 };
 expect(['aggregate','overall-two']);
 checkRow(v,'component-a',true);expect(['component-a','overall-two']);
 checkRow(v,'component-b',true);expect(['component-a','component-b','overall-two']);assert.equal(v.edgeEvidence(p.edge).group.pooled.k,3);
 checkRow(v,'component-a',false);expect(['component-b','overall-two']);
 checkRow(v,'aggregate',true);expect(['aggregate','overall-two']);
 checkRow(v,'aggregate',false);expect(['overall-two']);
 v.resetInclusions();expect(['aggregate','overall-two']);
 checkRow(v,'component-a',true);checkRow(v,'component-a',false);expect(['overall-two']);
 assert.equal(JSON.stringify(g),before);
});
test('treatment category dots are adjacent to the named agent rather than detached from card labels',()=>{
 const v=mount(cohortFixture());v.setBranch('agent:a');
 const segments=withClass(v.nodeElements.get('ab'),'tm-drug-name-segment');assert.ok(segments.length);
 for(const segment of segments){assert.equal(segment.children[0].className,'tm-name-dot');assert.equal(segment.children[1].className,'tm-drug-name');assert.match(segment.children[1].textContent,/B/);}
 assert.equal(withClass(v.nodeElements.get('ab'),'tm-component-dot').length,0,'no detached category-dot row in branch cards');
 const p=pair(v,'agent:a','ab');v.selectParallel(p.edge.id);const names=withClass(v.comparisonBand,'tm-inline-drug-name');assert.ok(names.length>=3);assert.ok(names.every(name=>name.children[0].classList.contains('tm-inline-name-dot')));
 const neutral=v.htmlDrugNames(v.comparisonBand,{id:'control:placebo',label:'Placebo',components:[]});assert.equal(neutral.textContent,'Placebo','a neutral comparator without named drugs still displays its label');
});

test('clinical filters mute exact nodes independently of their arrows and preserve the branch and radial geometry',()=>{
 const v=mount(cohortFixture());v.setBranch('agent:a');
 const original=[...v.nodeElements.keys()],p=pair(v,'agent:a','ab');
 assert.ok(hasArrow(v.parallelLinkTitles.get(p.edge.id).path));
 v.setAdvancedFilters({active:true,selections:{stage:'iii'},matches:{},nodeIds:new Set(['agent:a'])});
 const check=()=>{
   const edge=pair(v,'agent:a','ab').edge,link=v.parallelLinks.get(edge.id);
   assert.equal(v.nodeElements.get('agent:a').classList.contains('tm-filter-muted'),false);
   assert.equal(v.nodeElements.get('ab').classList.contains('tm-filter-muted'),true);
   assert.ok(link.classList.contains('tm-filter-muted'));
   assert.equal(data(link,'effectState'),'neutral');assert.equal(data(link,'estimate'),'');
   assert.equal(v.parallelLinkTitles.get(edge.id).title.textContent,'Effect estimate unavailable','a muted comparison cannot display an unfiltered estimate');
   assert.ok(hasArrow(v.parallelLinkTitles.get(edge.id).path));
   assert.equal(v.edgeEvidence(edge).effect,null);
   assert.equal(v.nodeElements.get('ab').getAttribute('tabindex'),'0');
 };
 check();assert.deepEqual([...v.nodeElements.keys()],original);
 v.setBranch('all');check();
 v.setAdvancedFilters({active:false,matches:{}});
 assert.equal(withClass(v.world,'tm-filter-muted').length,0);
 assert.ok(v.edgeEvidence(pair(v,'agent:a','ab').edge).effect?.valid);
});

test('Radial branch opens first and switching to Treatment map preserves the selected treatment and endpoint', () => {
  const view = freshMap();
  const radial = view.layoutButtons.get('radial');
  const treatment = view.layoutButtons.get('branch');
  assert.equal(radial.textContent, 'Radial branch');
  assert.equal(treatment.textContent, 'Treatment map');
  assert.equal(radial.getAttribute('aria-pressed'), 'true');
  assert.equal(treatment.getAttribute('aria-pressed'), 'false');
  assert.equal(view.radialHost.hidden, false);
  assert.ok(withClass(view.radialHost, 'rb-family-agent').length);

  view.setBranch('agent:b');
  view.setEndpoint('DFS:HR');
  treatment.click();
  assert.equal(treatment.getAttribute('aria-pressed'), 'true');
  assert.equal(radial.getAttribute('aria-pressed'), 'false');
  assert.equal(view.radialHost.hidden, true);
  assert.equal(view.branchId, 'agent:b');
  assert.equal(view.selectedEndpoint, 'DFS:HR');
  radial.click();
  assert.equal(radial.getAttribute('aria-pressed'), 'true');
  assert.equal(view.radialHost.hidden, false);
  assert.equal(view.branchId, 'agent:b');
  assert.equal(view.selectedEndpoint, 'DFS:HR');
});

test('the radial branch toolbar provides branch, comparison, endpoint, planning and evidence controls in order', () => {
  const view = mount();
  view.setBranch('agent:a');
  view.layoutButtons.get('radial').click();
  const toolbar = withClass(view.root, 'tm-toolbar')[0];
  const controlClasses = ['tm-branch-field', 'tm-network-toggle', 'tm-endpoint-field', 'tm-planning-toggle', 'tm-study-scope'];
  const controlOrder = () => descendants(toolbar).map(element => controlClasses.find(name => element.classList.contains(name))).filter(Boolean);
  assert.deepEqual(controlOrder(), controlClasses);
  assert.equal(withClass(toolbar, 'tm-network-toggle')[0].textContent, 'Compare two treatments indirectly');
  assert.ok(!descendants(view.root).some(element => element.tagName === 'BUTTON' && element.textContent === 'All treatments'));

  view.endpointSelector.value = 'DFS:HR';
  view.endpointSelector.dispatchEvent({type: 'change'});
  assert.equal(view.selectedEndpoint, 'DFS:HR');
  view.scopeSelector.value = 'randomized';
  view.scopeSelector.dispatchEvent({type: 'change'});
  assert.equal(view.studyScope, 'randomized');
  withClass(toolbar, 'tm-planning-toggle')[0].click();
  assert.equal(view.planningEnabled, true);
  assert.deepEqual(controlOrder(), controlClasses);
  assert.equal(withClass(view.root, 'tm-planning-fields').length, 1);

  view.selector.value = '';
  view.selector.dispatchEvent({type: 'change'});
  assert.equal(view.tree.overview, true);
  view.selector.value = 'agent:b';
  view.selector.dispatchEvent({type: 'change'});
  assert.equal(view.isRadialBranch(), true);
  assert.deepEqual(controlOrder(), controlClasses);
  assert.equal(view.studyScope, 'randomized');
});

test('radial indirect availability follows exact regimens, endpoint, filters and selected network model', async () => {
  const comparisons = [
    ['agent:a','agent:b','OS'], ['agent:b','ab','OS'],
    ['ac','agent:c','OS'], ['agent:c','bc','OS'],
    ['agent:a','ac','PFS'], ['ac','abc','PFS']
  ].map(([first, second, endpoint], i) => {
    const record = comparison('radial-network-' + i, first, second, endpoint, 'HR', .8, i + 1);
    if (i === 2) Object.assign(record.intervention, {network_regimen_id:'course:a-then-c', network_regimen_label:'A then C'});
    return {...record, analysis:analysisMeta('radial-trial-' + i,'randomized_trial',record.pmid)};
  });
  const view = mount({...graph, comparisons});
  view.setBranch('agent:a');
  view.setBranchLayout('radial');
  const available = () => view.indirect.radialAvailableRegimens();
  const options = () => view.indirect.radialComparators().map(option => option.id);
  const glyph = id => withClass(view.radialHost, 'rb-family-agent').find(el => data(el, 'regimenId') === id);
  assert.equal(available(), null);
  view.indirect.setActive(true);
  assert.equal(available().size, 0, 'pending evidence cannot make an indirect comparison available');
  await Promise.resolve();
  assert.deepEqual([...available()].sort(), ['ab','agent:a']);
  assert.equal(view.indirect.network.status('course:a-then-c').eligible, true);
  assert.ok(!available().has('ac'), 'a sequential course cannot qualify the concurrent doublet');
  assert.equal(glyph('ac').getAttribute('aria-disabled'),'true');
  glyph('ac').click();
  assert.equal(view.radialLeftId,'agent:a');
  assert.deepEqual(options(), ['ab']);
  const same = available();
  glyph('ab').click();
  assert.equal(available(), same, 'choosing a first regimen keeps the other eligible first regimens available');
  assert.deepEqual(options(), ['agent:a']);
  view.indirect.chooseRadialComparator('agent:a');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(view.indirect.fit?.available,true);
  view.setNetworkModel('random');
  assert.equal(available().size, 0);
  assert.deepEqual(options(), []);
  assert.equal(view.indirect.second,null);
  assert.equal(view.indirect.panel.hidden,true);
  view.setNetworkModel('common');
  assert.deepEqual([...available()].sort(), ['ab','agent:a']);
  assert.deepEqual(options(), ['agent:a']);

  view.setEndpoint('PFS:HR');
  await Promise.resolve();
  assert.deepEqual([...available()].sort(), ['abc','agent:a']);
  view.setAdvancedFilters({active:true,pending:true,matches:{}});
  assert.equal(available().size, 0);
  view.setAdvancedFilters({active:true,matches:{}});
  await Promise.resolve();
  assert.equal(available().size, 0);
  view.options.loadNetworkGraph = () => Promise.reject(new Error('Network snapshot unavailable'));
  const failure = view.indirect.reload();
  assert.match(glyph('ac').getAttribute('aria-label'), /Checking indirect comparisons/);
  await failure;
  assert.match(glyph('ac').getAttribute('aria-label'), /No available indirect comparison/);
  assert.match(view.indirect.panel.textContent,/Network snapshot unavailable/);
  view.indirect.setActive(false);
  assert.equal(available(), null);
});

test('radial planning toggles the event requirement alongside a fitted indirect comparison', async () => {
  const comparisons = [['agent:a','agent:b'], ['agent:b','agent:c']].map(([first, second], index) => {
    const record = comparison('network-' + index, first, second, 'OS', 'HR', 0.8, index + 1);
    return {...record, analysis: analysisMeta('trial-' + index, 'randomized_trial', record.pmid)};
  });
  const view = mount({...graph, comparisons});
  view.setBranch('agent:a');
  view.layoutButtons.get('radial').click();
  withClass(view.root, 'tm-network-toggle')[0].click();
  await Promise.resolve();
  const opponent = withClass(view.radialHost, 'rb-comparator').find(button => button.getAttribute('data-comparator-id') === 'agent:c');
  assert.ok(opponent, 'C is connected to A through the two randomized comparisons');
  opponent.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const panel = view.indirect.panel;
  const estimate = () => withClass(panel, 'tm-network-estimate-value')[0]?.textContent;
  const planningToggle = () => withClass(view.root, 'tm-planning-toggle')[0];
  const indirectHR = estimate();
  assert.match(indirectHR, /^HR /);
  assert.equal(withClass(panel, 'tm-network-plan').length, 0);
  planningToggle().click();
  assert.match(withClass(panel, 'tm-network-plan')[0].textContent, /E=[\d,]+/);
  assert.equal(estimate(), indirectHR);
  planningToggle().click();
  assert.equal(withClass(panel, 'tm-network-plan').length, 0);
  assert.equal(estimate(), indirectHR);
});

test('switching branch layouts carries the filtered direct estimate, interval and cohort table with the selected pair', () => {
  const view = mount(pooledGraph());
  view.setBranch('agent:a');
  const edge = pair(view, 'agent:a', 'ab').edge;
  const filter = {active:true, selections:{stage:'iv'}, nodeIds:new Set(['agent:a','ab']),
    matches:Object.fromEntries(edge.comparison_ids.map(id => [id,{matched:true,specificity:1}]))};
  view.setAdvancedFilters(filter);
  view.selectParallel(edge.id);
  const currentResult = () => {
    const link = withClass(view.comparisonBand, 'tm-effect-link')[0];
    return ['estimate','ci-lower','ci-upper','basis'].map(k => link.getAttribute('data-'+k));
  };
  const result = currentResult(), cohorts = withClass(view.comparisonBand, 'tm-inclusion-table')[0].textContent;
  assert.equal(result[3], 'pooled');
  for (const layout of ['radial','branch','radial']) {
    view.layoutButtons.get(layout).click();
    assert.equal(view.branchId,'agent:a');
    assert.equal(view.selectedComparisonPairId,edge.id);
    assert.equal(view.selectedEndpoint,'OS:HR');
    assert.deepEqual(view.advanced.selections,{stage:'iv'});
    assert.deepEqual(currentResult(),result);
    assert.equal(withClass(view.comparisonBand,'tm-inclusion-table')[0].textContent,cohorts);
  }
  const sign = withClass(view.radialHost, 'rb-comparison-sign')[0];
  assert.equal(sign.getAttribute('data-symbol'),'<','the HR below 1 favors the doublet on the right');
  assert.equal(withClass(view.radialHost,'rb-comparator')[0].getAttribute('aria-selected'),'true');
  view.setAdvancedFilters({...filter, pending:true, matches:{}, signature:'loading'});
  assert.equal(sign.hidden,true); assert.equal(view.comparisonBand.hidden,true);
  view.setAdvancedFilters(filter);
  assert.equal(view.selectedComparisonPairId,edge.id); assert.deepEqual(currentResult(),result);
  view.setEndpoint('DFS:HR');
  assert.equal(view.selectedComparisonPairId,null); assert.equal(sign.hidden,true);
  assert.equal(view.comparisonBand.hidden,true,'the old endpoint estimate cannot survive an ineligible comparison');
  view.setBranch('all');
  assert.equal(view.isRadialBranch(),false); assert.equal(view.radialHost.hidden,true);
});
