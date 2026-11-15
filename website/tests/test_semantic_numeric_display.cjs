const test = require('node:test');
const assert = require('node:assert/strict');
const display = require('../dist/semantic_numeric_display.js');
function fixture() {
 const n = {value:50,status:'reported',raw_text:'fifty',unit:'participants',qualifier:'equal',evidence_ids:['e']};
 const study={report_id:'r',details:{quantitative_results:[{result_id:'a',report_id:'r',reviewer:'Sol',source_input_sha256:'s',estimate:n,analysis:{model_id:'m1'},main_result_eligible:false}]}};
 const view={study_id:'r',scientific_or_eligibility_flags_changed:false,number_views:[{path:['details','quantitative_results',0,'estimate'],owner_id:'a',source_scope:{report_id:'r',reviewer:'Sol',source_input_sha256:'s'},original_wrapper:structuredClone(n),status:'normalized',canonical_number:structuredClone(n),display_value:'50',arabic_value:50,missing_reason:null}]};
 return {study,view};
}
test('Arabic views use a display copy while source, graph and eligibility stay exact',()=>{
 const {study,view}=fixture(),before=structuredClone(study),out=display.applyStudy(study,view);
 assert.equal(display.checkedText(out.details.quantitative_results[0].estimate),'50');
 assert.deepEqual(study,before);assert.equal(out.details.quantitative_results[0].estimate.raw_text,'fifty');
 assert.deepEqual(out.details.quantitative_results[0].analysis,study.details.quantitative_results[0].analysis);assert.equal(out.details.quantitative_results[0].main_result_eligible,false);
});
test('zero and inequality remain numeric; NA requires null and retains its missing reason',()=>{
 for(const [value,text,qualifier]of [[0,'0','equal'],[2,'≤2','less_or_equal'],[null,'NA','not_reached']]){
  const {study,view}=fixture(),n=study.details.quantitative_results[0].estimate;
  Object.assign(n,{value,status:value===null?'not_reported':'reported',qualifier,raw_text:value===null?'NR':String(value)});
  Object.assign(view.number_views[0],{original_wrapper:structuredClone(n),canonical_number:{...n,raw_text:value===null?null:n.raw_text},arabic_value:value,display_value:text,missing_reason:value===null?'not_reached':null});
  const shown=display.applyStudy(study,view).details.quantitative_results[0].estimate;
  assert.equal(display.checkedText(shown),text);assert.equal(shown.value,value);assert.equal(shown.qualifier,qualifier);assert.equal(shown.semantic_missing_reason,value===null?'not_reached':null);
 }
});
test('foreign source, duplicate path, unsafe path and unit/model substitution fail closed',()=>{
 for(const mutate of [v=>v.number_views[0].source_scope.reviewer='Luna',v=>v.number_views.push(structuredClone(v.number_views[0])),v=>v.number_views[0].path=['__proto__','polluted'],v=>v.number_views[0].canonical_number.unit='events']){
  const {study,view}=fixture();mutate(view);assert.throws(()=>display.applyStudy(study,view));
 }
});
test('held number is preserved rather than erased to NA; inconsistent NA is rejected',()=>{
 const {study,view}=fixture();view.number_views[0].status='held';assert.deepEqual(display.applyStudy(study,view),study);
 const other=fixture();other.view.number_views[0].display_value='NA';assert.throws(()=>display.applyStudy(other.study,other.view),/disagreement/);
});
test('source-only date or range stays an annotation with null point value',()=>{
 const {study,view}=fixture(),n=study.details.quantitative_results[0].estimate;
 Object.assign(n,{value:null,raw_text:'January 1, 2008',role:'other',unit:'date'});
 Object.assign(view.number_views[0],{original_wrapper:structuredClone(n),canonical_number:structuredClone(n),display_value:'January 1, 2008',source_literal:'January 1, 2008',arabic_value:null,non_scalar_source_literal:true});
 const shown=display.applyStudy(study,view).details.quantitative_results[0].estimate;
 assert.equal(shown.value,null);assert.equal(shown.semantic_non_scalar_source_literal,true);assert.equal(shown.raw_text,n.raw_text);
 view.number_views[0].canonical_number.value=2008;assert.throws(()=>display.applyStudy(study,view),/disagreement/);
});
test('registered source-percent display preserves the scientific probability value/unit',()=>{
 const {study,view}=fixture(),n=study.details.quantitative_results[0].estimate;
 Object.assign(n,{value:.984,raw_text:'98.4%',unit:'probability',role:'confidence_level',normalization:'percent_to_probability'});
 Object.assign(view.number_views[0],{original_wrapper:structuredClone(n),canonical_number:structuredClone(n),display_value:'0.984',arabic_value:.984,source_literal:'98.4%',registered_percent_probability:true,source_percent_arabic_value:98.4,registered_encoding_rule:'exact_registered_percent_probability_v1'});
 const shown=display.applyStudy(study,view).details.quantitative_results[0].estimate;
 assert.equal(shown.value,.984);assert.equal(shown.unit,'probability');assert.equal(shown.semantic_source_percent_value,98.4);
 view.number_views[0].source_percent_arabic_value=95;assert.throws(()=>display.applyStudy(study,view),/binding/);
});
