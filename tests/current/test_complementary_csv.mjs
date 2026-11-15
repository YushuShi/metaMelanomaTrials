import test from 'node:test';
import assert from 'node:assert/strict';
import {TABLES,cellValue,prepare,serializeCSV,csvSafe} from '../../scripts/export_complementary_csv.mjs';

test('empty findings still export the stable review headers without inventing rows',()=>{
  const prepared=prepare({review_findings:[]},TABLES[0]);
  assert.equal(prepared.matrix.length,1);assert.ok(prepared.columns.includes('GPT R2 value'));
  assert.ok(prepared.columns.includes('GPT R3 value'));assert.ok(prepared.columns.includes('Original source evidence'));
});
test('unknown costs, deliberate blanks and true zero remain different',()=>{
  assert.equal(cellValue({'Gateway cost estimate USD':null},'Gateway cost estimate USD'),'Unknown');
  assert.equal(cellValue({'Gateway cost estimate USD':''},'Gateway cost estimate USD'),'');
  assert.equal(cellValue({'Gateway cost estimate USD':'0'},'Gateway cost estimate USD'),0);
  assert.equal(cellValue({},'Gateway cost estimate USD'),'');
});
test('audit decimal precision and textual identifiers are retained',()=>{
  assert.equal(cellValue({'Gateway cost estimate USD':'0.1234567890123456789'},'Gateway cost estimate USD'),'0.1234567890123456789');
  assert.equal(cellValue({PMID:'00123'},'PMID'),'00123');
  assert.equal(cellValue({'Input tokens':0},'Input tokens'),0);
});
test('CSV quoting preserves commas, embedded quotes, newlines and Unicode',()=>{
  assert.equal(serializeCSV([['Field','Evidence'],['HR','quoted "CI", α\nnext line']]),'Field,Evidence\r\nHR,"quoted ""CI"", α\nnext line"\r\n');
});
test('formula-like source text is literal and escape locations remain auditable',()=>{
  assert.equal(csvSafe('=1+1'),"'=1+1");assert.equal(csvSafe('+ nivolumab'),"'+ nivolumab");
  assert.equal(csvSafe('-0.7'),'-0.7');
  const p=prepare({review_findings:[{'Claude finding':'=malicious()','Review status':'Proposed change; source review pending'}]},TABLES[0]);
  assert.equal(p.escapedCells.length,1);assert.equal(p.escapedCells[0].header,'Claude finding');
  assert.ok(p.matrix[1].includes('Proposed change; source review pending'));
});
test('future fields are retained deterministically rather than discarded',()=>{
  const rows=[{'Z extension':'z','A extension':'a'}],before=JSON.stringify(rows);
  const p=prepare({review_findings:rows},TABLES[0]);
  assert.deepEqual(p.columns.slice(-2),['A extension','Z extension']);assert.equal(JSON.stringify(rows),before);
});
