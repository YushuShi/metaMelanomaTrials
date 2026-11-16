'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8');
function fn(name){const start=source.search(new RegExp('^  (?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);const end=source.slice(start+3).search(/^  (?:async )?function |^  (?:let|const) /m);return end<0?source.slice(start):source.slice(start,start+3+end);}
function context(names,values){const ctx=vm.createContext(values);vm.runInContext(names.map(fn).join('\n'),ctx);return ctx;}
const metadata={registry_sha256:'registry',source_file_sha256:'source',normalization_content_sha256:'normalization',clinical_content_sha256:'clinical'};
const graph={schema_version:1,content_sha256:'graph',view_snapshot:true,metadata,nodes:[],comparisons:[],study_memberships:[]};
const version={schema_version:1,graph_content_sha256:'graph',default_snapshot_sha256:'snapshot',engine_signature:'engine',...metadata};
test('cold map mounts prepared data without loading study evidence; revisiting reuses controller',async()=>{
  const requests=[],mounts=[],elements=new Map();
  const ctx=context(['savedMapVersion','mapVersionChanged','mapMatchesTreatments','loadTreatmentMap'],{
    state:{advanced:{}},treatmentMapEpoch:0,treatmentMapPending:null,treatmentMapController:null,treatmentMapContent:null,treatmentMapVersion:null,
    treatmentMapGraph:null,treatmentMapFullGraph:null,$:id=>{if(!elements.has(id))elements.set(id,{addEventListener(){}});return elements.get(id);},
    fetchJson:async path=>{requests.push(path);if(path.endsWith('version.json'))return version;if(path.endsWith('default.json'))return graph;throw new Error('Full study download during cold map startup');},
    currentTreatmentRegistryDigest:async()=> 'registry',AdvancedFilters:{activeCount:()=>0},TreatmentMap:{mount:(root,g,options)=>{mounts.push({g,options});return{destroy(){}};}},
    syncTreatmentMapAdvanced(){},scheduleClinicalRefresh(){},mapIsOpen:()=>true,escape:String,ensureStudyData(){throw new Error('Study hydration was eager');}
  });
  await ctx.loadTreatmentMap();await ctx.loadTreatmentMap();
  assert.deepEqual(requests,['./data/treatment_map_version.json','./data/treatment_map_default.json']);assert.equal(mounts.length,1);assert.equal(mounts[0].g,graph);
});
test('changed graph bindings fail closed before a stale prepared map is mounted',async()=>{
  let mounted=false;const target={addEventListener(){}};
  const ctx=context(['savedMapVersion','mapVersionChanged','mapMatchesTreatments','loadTreatmentMap'],{
    state:{advanced:{}},treatmentMapEpoch:0,treatmentMapPending:null,treatmentMapController:null,treatmentMapContent:null,treatmentMapVersion:null,
    treatmentMapGraph:null,treatmentMapFullGraph:null,$:()=>target,fetchJson:async path=>path.endsWith('version.json')?version:{...graph,content_sha256:'old'},
    currentTreatmentRegistryDigest:async()=> 'registry',AdvancedFilters:{activeCount:()=>0},TreatmentMap:{mount(){mounted=true;}},syncTreatmentMapAdvanced(){},scheduleClinicalRefresh(){},mapIsOpen:()=>true,escape:String
  });
  await ctx.loadTreatmentMap();assert.equal(mounted,false);assert.match(target.innerHTML,/saved map update is incomplete/);
});
test('study hydration is shared across concurrent table and Studies requests',async()=>{
  let calls=0,done;const ctx=context(['ensureStudyData'],{state:{loading:true},studyDataPending:null,loadData:()=>{calls++;return new Promise(resolve=>{done=()=>{ctx.state.loading=false;ctx.state.baselineScopedStudies=[];resolve();};});}});
  const first=ctx.ensureStudyData(),second=ctx.ensureStudyData();assert.equal(first,second);assert.equal(calls,1);done();await first;await ctx.ensureStudyData();assert.equal(calls,1);
});
test('offscreen node tables wait for visibility; cancelled tables never mount after a fetch',async()=>{
  let observer,loads=0,mounted=0,resolveData;
  class Element{constructor(){this.children=[];}replaceChildren(){this.children=[];}appendChild(child){this.children.push(child);}setAttribute(){}addEventListener(name,fn){this[name]=fn;}}
  const ctx=context(['mountNodeStudies'],{state:{scopedStudies:[],treatmentNormalizations:{}},treatmentMapFullGraph:null,document:{createElement:()=>new Element()},
    IntersectionObserver:class{constructor(callback){observer=this;this.callback=callback;}observe(){}disconnect(){}},
    fullTreatmentMap:async()=>{loads++;return{content_sha256:'graph',study_memberships:[]};},ensureStudyData:()=>new Promise(resolve=>{resolveData=resolve;}),mapMatchesTreatments:()=>true,list:value=>value||[],charts:{},studyRowsHTML(){},TreatmentNodeStudies:{mount(){mounted++;return{destroy(){}};}}
  });
  const root=new Element(),controller=ctx.mountNodeStudies(root,{id:'agent:a'},graph);assert.equal(loads,0);assert.equal(root.children[0].textContent,'Load study details');
  observer.callback([{isIntersecting:false}]);assert.equal(loads,0);observer.callback([{isIntersecting:true}]);assert.equal(loads,1);controller.destroy();resolveData();await new Promise(resolve=>setImmediate(resolve));assert.equal(mounted,0);
});
test('unchanged release polling reads only the small version manifest',async()=>{
  const requests=[];const ctx=context(['sameEvidenceVersion','mapVersionChanged','refreshClinicalEvidence'],{
    state:{baselineScopedStudies:[],quantitativeContent:'quant',treatmentNormalizations:{content_sha256:'normalization',source_file_sha256:'source'},clinicalClassifications:{content_sha256:'classes'}},
    clinicalPending:null,treatmentMapContent:'graph',treatmentMapVersion:version,refreshEvidenceFreshness(){},savedMapVersion:async()=>{requests.push('version');return{...version,quantitative_content_sha256:'quant',clinical_classification_content_sha256:'classes'};},
    mapIsOpen:()=>true,loadTreatmentMap:()=>{throw new Error('Unchanged map reloaded');},fetchJson:()=>{requests.push('large');throw new Error('Large evidence downloaded');},$:()=>({})
  });
  await ctx.refreshClinicalEvidence();assert.deepEqual(requests,['version']);
});

test('source-file binding detects unchanged snapshots even when quantitative content_sha256 is absent',()=>{
  const ctx=context(['sameEvidenceVersion'],{state:{quantitativeContent:'source',treatmentNormalizations:{content_sha256:'normalization',source_file_sha256:'source'},clinicalClassifications:{content_sha256:'classes'}}});
  assert.equal(ctx.sameEvidenceVersion({...version,quantitative_content_sha256:'source',clinical_classification_content_sha256:'classes'}),true);
  assert.equal(ctx.sameEvidenceVersion({...version,source_file_sha256:'changed',quantitative_content_sha256:'source',clinical_classification_content_sha256:'classes'}),false);
});
test('prepared artifact bytes must match their release SHA before JSON is accepted',async()=>{
  const bytes=new TextEncoder().encode(JSON.stringify(graph)),hash=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  const ctx=context(['fetchJson'],{TextDecoder,crypto:require('node:crypto').webcrypto,fetch:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer,json:async()=>graph})});
  assert.equal((await ctx.fetchJson('map',hash)).content_sha256,'graph');
  await assert.rejects(ctx.fetchJson('map','0'.repeat(64)),/saved map update is incomplete/);
});
