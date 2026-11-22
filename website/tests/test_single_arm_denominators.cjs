'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const index = require('../dist/single_arm_denominators.js');
const {presentationSampleSize} = require('../dist/quantitative_extraction.js');

function publishedRow(pmid, pct) {
  const [id, entry] = Object.entries(index).find(([,e])=>e.scope[0]===pmid && e.input[0]===pct);
  const [,source,endpoint,population,arm] = entry.scope;
  const [percentage,ci_lower,ci_upper,ci_level,numerator] = entry.input;
  const result = {pmid,result_id:id,source_input_sha256:source,scoped_sample_size:{status:'missing'},
    quantitative_record:{endpoint,population_id:population,arm_id:arm,percentage,ci_lower,ci_upper,ci_level,numerator}};
  return {result, read:()=>presentationSampleSize({pmid},result)};
}

test('source-verified population prevails over inversion of rounded bounds',()=>{
  const {read} = publishedRow('33979178',41);
  const result = read();
  assert.equal(result.n,42);
  assert.equal(result.status,'reported');
  assert.match(result.note,/primary-refractory subset/);
});

test('unique event-count denominator is labelled as derived',()=>{
  const {read} = publishedRow('2710482',14.3);
  assert.equal(read().display,'21 (derived)');
});

test('an assumed or nonunique denominator has no numerical contribution to pooling',()=>{
  const {read} = publishedRow('25287827',0);
  const result = read();
  assert.equal(result.n,null);
  assert.equal(result.display,'22 (approx.)');
  assert.match(result.note,/21–23/);
  assert.match(result.note,/Wilson/);
});

test('scope, tuple, conflicting review and observed denominator veto stale estimates',()=>{
  for(const change of [r=>r.source_input_sha256='other',r=>r.quantitative_record.percentage=1,
    r=>r.quantitative_record.population_id='other',r=>r.scoped_sample_size={status:'available',n:20},
    r=>r.extraction_conflict=true]) {
    const {result,read}=publishedRow('2710482',14.3);
    change(result);
    assert.equal(read(),null);
  }
});

test('a source-reported percentage CI stays on the percentage scale when the extraction only held an event count',()=>{
  const charts=require('../dist/app.js');
  const [id,entry]=Object.entries(index).find(([,e])=>e.scope[0]==='36304457'&&e.reported_percentage===13.3);
  const [,source,endpoint,population,arm]=entry.scope;
  const [percentage,ci_lower,ci_upper,ci_level,numerator]=entry.input;
  const row={pmid:'36304457',result_id:id,source_input_sha256:source,scoped_sample_size:{status:'missing'},
    quantitative_record:{endpoint,population_id:population,arm_id:arm,percentage,ci_lower,ci_upper,ci_level,numerator}};
  assert.equal(charts.tableValue(row),'2/15 · 13.3% (95% CI 1.7–40.5%)');
});
