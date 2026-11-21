'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const review = require('../dist/complementary_review.js');
const [paper,models] = review.definitions;
const paperRow = {pmid:'123', group:'Enrollment',field:'Enrolled N',source_a:'Abstract: 119',source_b:'Results: 165',recommendation:'Check participant flow'};
const modelRow = {pmid:'456',group:'Survival',field:'mPFS',gpt:'7',opus:'>7',recommendation:'Check <Figure> & supplement'};
test('paper conflicts display independently labelled source statements and model disagreements show separate extractions',()=>{
  const payload={schema_version:1,paper_conflicts:[paperRow],model_disagreements:[modelRow]};
  const html=review.tableHTML(review.orderedRows(payload,paper),paper);
  assert.match(html,/>Abstract: 119<.*>Results: 165</);
  assert.match(html,/>Decision or review note</);
  assert.doesNotMatch(html,/GPT extraction/);
  const other=review.tableHTML(review.orderedRows(payload,models),models);
  assert.match(other,/>GPT extraction<.*>Opus review<.*>7<.*>&gt;7</);
  assert.match(other,/href="https:\/\/pubmed.ncbi.nlm.nih.gov\/456\/"/);
  assert.match(other,/Check &lt;Figure&gt; &amp; supplement/);
  assert.doesNotMatch(other,/Abstract: 119/);
  assert.throws(()=>review.orderedRows({...payload,model_disagreements:[{...modelRow,pmid:'45?redirect'}]},models));
  assert.throws(()=>review.orderedRows({...payload,paper_conflicts:[{...paperRow,source_b:''}]},paper));
});
test('group and PMID filtering precede pagination and preserve multiple findings per article',()=>{
  const rows=Array.from({length:24},(_,i)=>({...modelRow,pmid:String(1000+Math.floor(i/2)),group:i<22?'Events':'Other',field:`Outcome ${i}`}));
  const payload={schema_version:1,model_disagreements:rows};
  const ordered=review.orderedRows(payload,models);
  const selected=review.pageOf(ordered,'Events','',2);
  assert.equal(selected.pages,3);
  assert.equal(selected.rows.length,2);
  assert.equal(selected.total,22);
  const filtered=review.pageOf(ordered,'Events','1001',2);
  assert.equal(filtered.page,0);
  assert.deepEqual(filtered.rows.map(row=>row.pmid),['1001','1001']);
  assert.equal(review.pageOf(ordered,'Other','1001',0).total,0);
  assert.equal((review.tableHTML(filtered.rows,models).match(/scope="rowgroup"/g)||[]).length,1);
});
test('About provides the contact and retains an independent link to the earlier report',()=>{
  const html=fs.readFileSync(require.resolve('../dist/index.html'),'utf8');
  const about=html.slice(html.indexOf('id="view-about"'),html.indexOf('<footer'));
  assert.match(about,/Yushu Shi at <a href="mailto:shiyushu2006@gmail.com">/);
  assert.match(about,/id="complementary-review"/);
  assert.match(about,/href="\.\/reviews\/outcome_review\.html"/);
  assert.ok(html.indexOf('src="./complementary_review.js"')<html.indexOf('src="./about_article_progress.js"'));
});

test('only the selected main source is identified as current',()=>{
  const main={...paperRow,main_text_side:'source_b'};
  assert.match(review.tableHTML([main],paper),/<strong>Results: 165<\/strong>/);
  const amended={...main,main_text_value:'Table 1 gives 160.'};
  const html=review.tableHTML([amended],paper);
  assert.match(html,/Table 1 gives 160/);
  assert.doesNotMatch(html,/<strong>Results: 165/);
});
