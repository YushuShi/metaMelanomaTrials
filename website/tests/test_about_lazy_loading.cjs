'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../dist/about_article_progress.js'),'utf8');
const stage={unit:'articles',entered:254,screening_finished:254,retained:202,excluded:52,unclear:0,unclear_reports:[]};
const snapshot={schema_version:1,unit:'articles',as_of:'2026-11-15T12:00:00Z',stage_scope:['R2'],stages:{R2:stage}};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function browser(hidden=true){
  const requests=[],handlers={},elements={};
  for(const id of ['article-review-progress','view-about','refresh','article-progress-date'])elements[id]={hidden:id==='view-about'?hidden:false,innerHTML:'',addEventListener:(name,fn)=>{handlers[id+':'+name]=fn;},querySelector(){return this.innerHTML.includes('article-stage')?{}:null;}};
  let observer,timer;
  const window={addEventListener:(name,fn)=>{handlers['window:'+name]=fn;}};
  const document={visibilityState:'visible',getElementById:id=>elements[id],addEventListener:(name,fn)=>{handlers['document:'+name]=fn;}};
  const ctx=vm.createContext({window,document,fetch:async path=>{requests.push(path);if(path==='./data/treatment_map_version.json')return{ok:true,json:async()=>({schema_version:1,about_progress:snapshot})};throw new Error('Unexpected large evidence fetch');},
    MutationObserver:class{constructor(callback){observer=callback;}observe(){}},setTimeout:fn=>{timer=fn;return 1;},clearTimeout(){}});
  vm.runInContext(source,ctx);
  return{requests,elements,handlers,window,get observer(){return observer;},get timer(){return timer;}};
}
test('hidden About makes no cold-start, Refresh, hash, or periodic evidence requests',async()=>{
  const b=browser();await settle();assert.deepEqual(b.requests,[]);
  b.handlers['refresh:click']();b.handlers['window:hashchange']();b.timer();await settle();assert.deepEqual(b.requests,[]);
});
test('opening About renders current article counts from only the small release manifest',async()=>{
  const b=browser();b.elements['view-about'].hidden=false;b.observer();await settle();
  assert.deepEqual(b.requests,['./data/treatment_map_version.json']);assert.match(b.elements['article-review-progress'].innerHTML,/<dd>254<\/dd>/);assert.match(b.elements['article-review-progress'].innerHTML,/<dd>202<\/dd>/);assert.doesNotMatch(b.elements['article-review-progress'].innerHTML,/R3 ·/);
  b.elements['view-about'].hidden=true;b.timer();await settle();assert.equal(b.requests.length,1);
});
test('direct About links render immediately without downloading extraction records',async()=>{
  const b=browser(false);await settle();assert.deepEqual(b.requests,['./data/treatment_map_version.json']);assert.match(b.elements['article-review-progress'].innerHTML,/Eligibility screening finished/);
});
