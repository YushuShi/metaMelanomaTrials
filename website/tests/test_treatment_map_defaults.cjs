'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const MapView=require('../dist/treatment_map.js'),Analysis=require('../dist/treatment_map_analysis.js'),Effects=require('../dist/treatment_map_effects.js');
const Builder=require('../scripts/treatment_map_defaults.cjs');
const json=value=>JSON.parse(JSON.stringify(value));
const read=name=>{const file=path.join(__dirname,'../dist/data',name);return fs.existsSync(file)?fs.readFileSync(file):zlib.gunzipSync(fs.readFileSync(file+'.gz'));};
const sourceBytes=read('treatment_map.json'),source=JSON.parse(sourceBytes),before=crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
const started=performance.now(),snapshot=Builder.build(source),buildMs=performance.now()-started;
// Test exactly the JSON transport the browser receives, rather than shared
// in-memory objects from the builder.
const snapshotBytes=JSON.stringify(snapshot),decoded=JSON.parse(snapshotBytes),model=MapView.prepare(decoded),full=MapView.prepare(source);
const defaults={endpoint:'OS:HR',studyScope:'all',advanced:{active:false,matches:{}},inclusionOverrides:{},inclusionOrder:[]};
const cases=new Map();
for(const branchId of ['all',...full.nodes.map(node=>node.id)]){
  const tree=MapView.layout(full,branchId);
  for(const edge of tree.comparisonEdges){
    const comparisons=full.comparisons.filter(item=>edge.comparison_ids.includes(item.id));
    for(const comparison of [null,...comparisons.filter(item=>Effects.comparisonMatchesEndpoint(item,'OS:HR'))]){
      const direction=MapView.comparisonDirection(tree,edge,comparison),options={...defaults,...direction},key=MapView.analysisKey(edge,'OS:HR','all',direction);
      cases.set(key,{edge,options,comparisons});
    }
  }
}

test('every prepared radial/branch layout preserves nodes, positions, exact links and displayed counts',()=>{
  assert.equal(Object.keys(decoded.default_views.layouts).length,full.nodes.length+1);
  for(const branchId of ['all',...full.nodes.map(node=>node.id)]){
    assert.deepEqual(json(MapView.serializeLayout(MapView.preparedLayout(model,branchId))),json(MapView.serializeLayout(MapView.layout(full,branchId))),branchId);
  }
  for(const node of model.nodes)assert.deepEqual(node.count_summary,full.byId.get(node.id).count_summary,node.id);
  assert.deepEqual(decoded.comparisons,source.comparisons,'the exact estimates, CIs, N bindings and provenance are retained');
  assert.deepEqual(decoded.study_memberships.map(({id,node_id})=>({id,node_id})),source.study_memberships.map(({id,node_id})=>({id,node_id})));
});

test('all prepared OS directional results match current live selection, pooling, diagnostics and exclusions exactly',()=>{
  assert.deepEqual(Object.keys(decoded.default_views.analyses.entries).sort(),[...cases.keys()].sort());
  for(const [key,{edge,options,comparisons}]of cases){
    const saved=MapView.savedAnalysis(model,edge,options),live=Analysis.analyze(comparisons,options);
    assert.ok(saved,key);assert.deepEqual(saved,json(live),key);
  }
});

test('changed evidence or calculation implementation rejects saved views and layouts',()=>{
  for(const graph of [{...decoded,content_sha256:'new-evidence'}, {...decoded,default_views:{...decoded.default_views,engine_signature:'old-calculation-code'}}]){
    const changed=MapView.prepare(graph),example=cases.values().next().value;
    assert.equal(MapView.preparedDefaults(graph),null);
    assert.equal(MapView.savedAnalysis(changed,example.edge,example.options),null);
    assert.deepEqual(json(MapView.serializeLayout(MapView.preparedLayout(changed,'all'))),json(MapView.serializeLayout(MapView.layout(changed,'all'))));
  }
});

test('nondefault endpoints, evidence scope, filters and cohort overrides never reuse the OS result',()=>{
  const example=[...cases.values()].find(({edge,options})=>MapView.savedAnalysis(model,edge,options)?.groups.some(group=>group.pooled));
  assert.ok(example,'at least one genuine multi-cohort analysis is exercised');
  const {edge,options}=example,original=MapView.savedAnalysis(model,edge,options);
  for(const modified of [
    {...options,endpoint:'PFS:HR'}, {...options,studyScope:'randomized'}, {...options,studyScope:'trials'},
    {...options,advanced:{active:true,matches:{}}},
    {...options,inclusionOverrides:{[original.groups[0].selected[0].id]:false}},
    {...options,inclusionOrder:[original.groups[0].selected[0].id]},
  ])assert.equal(MapView.savedAnalysis(model,edge,modified),null);
  assert.equal(MapView.savedAnalysis(model,edge,options),original,'returning to the unchanged default reuses its saved result');
});

test('prepared snapshot reduces initial payload without changing the authoritative scientific graph',t=>{
  const after=crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');assert.equal(after,before);
  assert.ok(Buffer.byteLength(snapshotBytes)<sourceBytes.length/2,'default transport is less than half the full map payload');
  t.diagnostic(JSON.stringify({source_bytes:sourceBytes.length,default_bytes:Buffer.byteLength(snapshotBytes),gzip_default_bytes:zlib.gzipSync(snapshotBytes).length,layouts:Object.keys(decoded.default_views.layouts).length,directional_OS_analyses:cases.size,build_ms:Math.round(buildMs)}));
});
