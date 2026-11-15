'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {apply}=require('../scripts/treatment_map_membership.cjs');
function fixture(){
  const node={id:'agent:nivolumab',label:'Nivolumab',components:['nivolumab'],count_summary:{known_n:100},contribution_ids:['c']};
  const source={pmid:'1',binding:'binding-a',task_id:'task-a',raw_record_sha256:'record-a',record:{stage:'R3',source_sha256:'source',report_id:'report'}};
  const c={id:'c',node_ids:[],n:null,note:'No eligible denominator',relevant_node_ids:[node.id],exact_node_ids:[node.id],study_id:'cohort:report:1',study_name:'Original unnamed cohort',nct_ids:[],cohort_id:'cohort1',cohort:{id:'cohort1',root_id:'cohort1'},available_n:null,_candidate_nodes:[],_source_keys:['s'],publication_ids:['1'],pmid:'1',status:'unresolved',source_refs:[{pmid:'1',arm_id:'a',evidence_ids:['proof']}],_observations:[{source,exact_node_id:node.id,arm:{id:'a',label:'Nivolumab'},population:{id:'p'},candidates:[]}]};
  const row=(id,binding='binding-a',report='report',arm='a')=>({result_id:id,review_stage:'R3',source_input_sha256:'source',review_binding_sha256:binding,report_id:report,quantitative_record:{arm_id:arm,id:'native-'+id,population_id:'p'}});
  const article={title:'An original cohort',year:2026,first_author_surname:'Smith',quantitative_results:[row('valid'),row('wrong-binding','binding-b'),row('wrong-report','binding-a','other'),row('other-arm','binding-a','report','b'),{...row('comparative'),quantitative_record:{intervention_arm_id:'b',reference_arm_id:'a',population_id:'p'}}],sample_size_records:[]};
  return {node,c,article,nodes:new Map([[node.id,node]]),contributions:[c],articles:new Map([['1',article]])};
}
test('missing-N exact cohorts remain visible with only the exact accepted result bindings',()=>{
  const f=fixture(),memberships=apply(f);assert.equal(memberships.length,1);
  const m=memberships[0];assert.equal(m.sample_n,null);assert.equal(m.counted_in_node,false);
  assert.equal(f.node.count_summary.identified_studies,1);assert.equal(f.node.count_summary.known_n,null);
  assert.deepEqual(m.source_bindings[0].result_ids,['comparative','valid']);
  assert.equal(m.source_bindings[0].task_id,'task-a');assert.equal(m.source_bindings[0].raw_record_sha256,'record-a');
  assert.equal(m.source_bindings[0].report_id,'report');assert.equal(m.canonical_regimen.label,'Nivolumab');
  assert.equal(m.title,'An original cohort');assert.equal(m.first_author_surname,'Smith');
});
test('source-held reused cohorts remain inspectable without becoming independent node studies',()=>{
  const f=fixture();f.c.independent_cohort_count_eligible=false;
  const m=apply(f)[0];assert.equal(m.independent_cohort_count_eligible,false);
  assert.equal(f.node.count_summary.identified_studies,0);assert.equal(f.node.count_summary.known_n,null);
});
test('same-source wrappers keep their exact task locators even when native arm IDs repeat',()=>{
  const f=fixture(),other=structuredClone(f.c._observations[0]);other.source.task_id='task-b';other.source.raw_record_sha256='record-b';
  f.c._observations.push(other);const m=apply(f)[0];assert.equal(m.source_bindings.length,2);
  assert.deepEqual(m.source_bindings.map(b=>b.task_id),['task-a','task-b']);
});

const map = require('../dist/treatment_map.js');
function visibilityFixture() {
  const drug = (component) => ({ id: 'agent:' + component, type: 'drug', label: component.toUpperCase(), components: [component] });
  const regimen = (id, components) => ({ id, type: 'combination', label: components.join(' + '), components });
  return {
    nodes: [
      ...['a', 'b', 'c', 'd', 'monotherapy', 'isolated', 'broader'].map(drug),
      regimen('phase-ab', ['a', 'b']),
      { ...regimen('whole-abc', ['a', 'b', 'c']), overview_parent_id: 'phase-ab' },
      regimen('whole-cd', ['c', 'd']),
    ],
    relationships: [
      { parent_id: 'agent:a', child_id: 'phase-ab' },
      { parent_id: 'phase-ab', child_id: 'whole-abc' },
      { parent_id: 'agent:c', child_id: 'whole-cd' },
    ],
    comparisons: [{
      id: 'whole-cd-versus-c', estimate: 0.7, ci_lower: 0.5, ci_upper: 0.9, ci_level: 95, measure: 'HR', outcome: 'OS',
      intervention: { node_id: 'whole-cd', label: 'C + D' }, comparator: { node_id: 'agent:c', label: 'C' },
    }],
    contributions: [
      { id: 'phase-count', node_ids: ['phase-ab'], relevant_node_ids: ['phase-ab'], n: 26 },
      { id: 'broader-count', node_ids: ['agent:broader'], relevant_node_ids: ['agent:broader'], n: 43 },
    ],
    study_memberships: [
      { node_id: 'whole-abc', pmid: '123', sample_n: null, counted_in_node: false, source_bindings: [] },
      { node_id: 'agent:monotherapy', pmid: '124', sample_n: null, counted_in_node: false, source_bindings: [] },
    ],
  };
}

test('combination cards require a complete-arm study or direct comparison when exact memberships exist', () => {
  const source = visibilityFixture(), before = JSON.stringify(source), model = map.prepare(source);
  assert.ok(!model.byId.has('phase-ab'), 'a treatment phase with a participant count alone cannot open an empty exact-treatment study list');
  assert.ok(model.byId.has('whole-abc'), 'a complete-arm membership remains visible with missing N and no comparative effect');
  assert.ok(model.byId.has('whole-cd'), 'a prepared direct comparison retains both complete treatment endpoints');
  assert.equal(model.agents.length, 5);
  assert.ok(!model.byId.has('agent:isolated'), 'catalogue-only agents cannot open an empty branch');
  assert.ok(!model.byId.has('agent:broader'), 'broader coverage alone cannot establish an exact treatment arm');
  assert.ok(model.byId.has('agent:monotherapy'), 'a supported monotherapy arm remains visible with unknown N');
  for (const component of ['a', 'b', 'd']) assert.ok(model.byId.has('agent:' + component), 'agents with supported combinations retain their navigation roots');
  assert.equal(JSON.stringify(source), before);
});

test('supported descendants reparent after their phase-only intermediate node is hidden', () => {
  const model = map.prepare(visibilityFixture());
  for (const branch of ['all', 'agent:a']) {
    const tree = map.layout(model, branch);
    assert.ok(!tree.positions.has('phase-ab'));
    assert.ok(tree.positions.has('whole-abc'));
    assert.equal(tree.parents.get('whole-abc'), 'agent:a');
    for (const [child, parent] of tree.parents) {
      assert.ok(tree.positions.has(child));
      assert.ok(tree.positions.has(parent));
    }
  }
});

test('legacy maps without an exact-membership index retain their existing combination catalogue', () => {
  const source = visibilityFixture(); delete source.study_memberships;
  const before = JSON.stringify(source), model = map.prepare(source);
  assert.ok(model.byId.has('phase-ab'));
  assert.ok(model.byId.has('agent:isolated'));
  assert.ok(model.byId.has('agent:broader'));
  assert.equal(map.layout(model, 'all').parents.get('whole-abc'), 'phase-ab');
  assert.equal(model.nodes.length, source.nodes.length);
  assert.equal(JSON.stringify(source), before);
});

test('phase-only published regimens are hidden while all exact complete-arm memberships stay visible', () => {
  const graph = require('../dist/data/treatment_map.json'), before = JSON.stringify(graph), model = map.prepare(graph);
  const phases = [
    'regimen:657fbce3c4cf62ce6032924b',
    'regimen:80cdb1c75faacba43b0c65a3',
    'regimen:44b51753a64716a56251163a',
    'regimen:b582d0000eb3580fafb6f283',
    'regimen:e249a878f0217f8e5a581f30',
  ];
  for (const id of phases) {
    assert.ok(graph.nodes.some((node) => node.id === id), 'historical phase evidence is retained');
    assert.ok(!model.byId.has(id), id);
  }
  const combinationIds = new Set(graph.nodes.filter((node) => node.type === 'combination').map((node) => node.id));
  const completeArmRows = graph.study_memberships.filter((row) => combinationIds.has(row.node_id));
  assert.ok(completeArmRows.some((row) => row.sample_n === null), 'the released evidence includes complete arms with unknown N');
  for (const row of completeArmRows) assert.ok(model.byId.has(row.node_id), `complete-arm PMID ${row.pmid} stays reachable`);
  for (const source of model.comparisons) {
    for (const arm of [source.intervention, source.comparator]) {
      if (combinationIds.has(arm.node_id)) assert.ok(model.byId.has(arm.node_id), `${source.id} retains its complete arm`);
    }
  }
  assert.equal(JSON.stringify(graph), before);
});


test('every retained published root without monotherapy studies leads to a supported complete combination', () => {
  const graph = require('../dist/data/treatment_map.json'), before = JSON.stringify(graph), model = map.prepare(graph);
  const exactIds = new Set(graph.study_memberships.map((row) => row.node_id));
  const comparisonIds = new Set(model.comparisons.flatMap((source) => [source.intervention.node_id, source.comparator.node_id]));
  const zeroStudyRoots = model.agents.filter((node) => !node.count_summary?.identified_studies);
  assert.ok(zeroStudyRoots.length > 0, 'combination-only agents retain navigation roots');
  for (const root of zeroStudyRoots) {
    const combinations = map.branchNodes(model, root.id).filter((node) => node.type === 'combination');
    assert.ok(combinations.length > 0, root.label + ' has reachable combination evidence');
    for (const combination of combinations) assert.ok(exactIds.has(combination.id) || comparisonIds.has(combination.id));
    assert.equal(map.studyLabel(root), 'No monotherapy studies');
  }
  const unsupportedRoots = graph.nodes.filter((node) => node.type === 'drug' && !model.byId.has(node.id));
  assert.ok(unsupportedRoots.length > 0, 'empty catalogue or broader-coverage roots are hidden');
  for (const root of unsupportedRoots) {
    assert.ok(!exactIds.has(root.id));
    assert.ok(!comparisonIds.has(root.id));
    assert.ok(!model.nodes.some((node) => node.type === 'combination' && root.components.every((component) => node.components.includes(component))));
  }
  assert.equal(JSON.stringify(graph), before);
});
