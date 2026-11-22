'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const display=require('../dist/app.js');
const saved=(k,model,method)=>({n_studies:k,independence_verified:true,independent_cohort_ids:Array.from({length:k},(_,i)=>'cohort-'+i),pooling_model:model,tau2_method:method});
test('saved analyses must match automatic cohort-count model; DL is never relabelled REML',()=>{
 assert.equal(display.savedPoolingMetadata(saved(2,'fixed','none')).label,'Fixed-effect');
 assert.equal(display.savedPoolingMetadata(saved(3,'random','REML')).label,'Random-effects (REML)');
 assert.equal(display.savedPoolingMetadata(saved(1,'individual','none')).label,'Individual study');
 for(const row of [saved(2,'random','REML'),saved(3,'fixed','none'),saved(3,'random','DL'),saved(3,'random',undefined),{...saved(3,'random','REML'),independence_verified:false},{...saved(3,'random','REML'),independent_cohort_ids:['a','a','b']}])assert.equal(display.savedPoolingMetadata(row),null);
 assert.equal(display.savedPoolingMetadata({analysis_id:'one'},saved(3,'random','REML')).model,'random');
 assert.equal(display.savedPoolingMetadata({analysis_id:'one',method:'Schoenfeld'},{...saved(3,'random'),method:'REML'}).model,'random','a planning formula must not shadow the linked pooling method');
 assert.equal(display.savedPoolingMetadata({...saved(2,'fixed','none'),pooled:{model:'fixed',tau2_method:'none'}}).model,'fixed');
 for(const row of [{...saved(2,'fixed','none'),independent_studies:3},{...saved(2,'fixed','none'),pooled:{model:'random',tau2_method:'DL'}},{...saved(3,'random','REML'),pooled:{method:'DL'}},saved(1,'fixed','none'),{...saved(3,'random','REML'),pooled:{k:2}},{...saved(3,'random','REML'),pooled:{independence_verified:false}}])assert.equal(display.savedPoolingMetadata(row),null,'contradictory saved metadata must not be relabelled');
 const fixed=saved(2,'fixed','none');
 assert.equal(display.savedPoolingMetadata({...fixed,independent_cohort_ids:['cohort-1','cohort-0']},fixed).model,'fixed','cohort order does not change membership');
 for(const ids of [['cohort-0','different-cohort'],['cohort-0','cohort-0'],'cohort-0,cohort-1',{},['cohort-0',''],[0,1]]){
  assert.equal(display.savedPoolingMetadata({...fixed,independent_cohort_ids:ids},fixed),null,'row and linked cohort membership must agree');
  assert.equal(display.savedPoolingMetadata({...fixed,pooled:{independent_cohort_ids:ids}}),null,'nested pooled membership must be valid and consistent');
 }
 assert.equal(display.savedPoolingMetadata({...fixed,independent_cohort_ids:undefined}).model,'fixed','verified independent count can be used when cohort IDs are absent');
});
test('Settings removes the manual model and ignores older stored model choices while retaining other preferences',()=>{
 const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),html=fs.readFileSync(require.resolve('../dist/index.html'),'utf8');
 assert.doesNotMatch(html,/id="analysis-model"/);assert.doesNotMatch(source,/state\.settings\.model|value\.model|\$\('analysis-model'\)/);
 const code=source.slice(source.indexOf('  function readSettings()'),source.indexOf('  function displaySettings()'));
 for(const model of ['random','fixed','DL']){
  const result=vm.runInNewContext(code+'\nreadSettings()', {localStorage:{getItem:()=>JSON.stringify({model,record_policy:'all',power:.9,alpha:.01,sidedness:1,allocation_ratio:2})}});
  assert.equal(Object.hasOwn(result,'model'),false);assert.equal(result.record_policy,'all');assert.equal(result.power,.9);assert.equal(result.alpha,.01);assert.equal(result.allocation_ratio,2);
 }
 for(const [stored,expected] of [[{},'common'],[{model:'random'},'common'],[{network_model:'random'},'random'],[{network_model:'DL'},'common']]){
  const settings=vm.runInNewContext(code+'\nreadSettings()', {localStorage:{getItem:()=>JSON.stringify(stored)}});
  assert.equal(settings.network_model,expected);
 }
});
