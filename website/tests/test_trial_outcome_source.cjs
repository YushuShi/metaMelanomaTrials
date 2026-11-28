'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {render} = require('../dist/quantitative_extraction.js');
const source = {pmid:'123456',stage:'R2',sha:'abstract-sha',section:'binary',id:'r1'};
const records = ['R2','R3'].map((stage,i) => ({record:{
  stage,source_sha256:i ? 'full-sha' : 'abstract-sha',
  study:{}, populations:[{id:'p',melanoma_only:'yes'},{id:'q',melanoma_only:'no'}],
  survival:[{id:'r1',population_id:'p',endpoint:'OS',estimate:12+i,unit:'months'}],
  binary:[{id:'hidden',population_id:'q',percentage:2}, {id:'r1',population_id:'p',endpoint:'ORR',percentage:32+i}]
}}));
const study = {pmid:'123456',details:{quantitative_extraction:records}};

test('the source link targets one original row across reports, stages and outcome tables', () => {
  const html = render(study,{focusResult:source});
  assert.equal(html.split('id="trial-outcome-source-row"').length,2);
  assert.match(html, /<details class="drawer-section" open><summary>Title and abstract/);
  assert.match(html.match(/<tr id="trial-outcome-source-row".*?<\/tr>/)[0], /ORR.*32/);
  for (const changes of [{pmid:'99999'}, {sha:'full-sha'}, {section:'effects'}, {id:'hidden'}])
    assert.doesNotMatch(render(study,{focusResult:{...source,...changes}}), /trial-outcome-source-row/);
  assert.doesNotMatch(render(study), /trial-outcome-source-row/);
});
