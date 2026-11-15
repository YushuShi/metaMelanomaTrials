#!/usr/bin/env node
// Review-only exports. Never edits source snapshots or accepted clinical records.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export const TABLES = [
  {key:'review_findings', sheet:'Findings', file:'findings_for_review.csv', columns:[
    'PMID','Trial','Source coverage','Field','Target stage','Cohort','GPT R2 value','GPT R3 value',
    'Claude finding','Finding type','Key discrepancy or addition','Review status','Validation issue',
    'Original source evidence','PubMed','Finding ID','Attempt ID']},
  {key:'article_costs', sheet:'Article costs', file:'article_costs.csv', columns:[
    'PMID','Review state','Attempts','Findings needing source review','Known gateway cost estimate USD',
    'Attempts with unknown cost','Problem']},
  {key:'attempt_costs', sheet:'Attempt costs', file:'attempt_costs.csv', columns:[
    'PMID','Attempt','Attempt ID','State','Model','Effort requested','Input tokens','Output tokens',
    'Reasoning tokens (included in output)','Gateway cost estimate USD','Cost status']},
];
const numericColumns = new Set(['Attempts','Attempt','Findings needing source review','Attempts with unknown cost',
  'Input tokens','Output tokens','Reasoning tokens (included in output)','Known gateway cost estimate USD','Gateway cost estimate USD']);
const hash = data => createHash('sha256').update(data).digest('hex');

function decimalKey(value) {
  const match = String(value).match(/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match) return null;
  const coefficient = BigInt((match[1] === '-' ? '-' : '') + match[2] + (match[3] || ''));
  if (coefficient === 0n) return '0';
  let digits = coefficient.toString(), exponent = Number(match[4] || 0) - (match[3] || '').length;
  while (digits.endsWith('0')) { digits = digits.slice(0,-1); exponent++; }
  return `${digits}e${exponent}`;
}

export function cellValue(row, column) {
  if (!Object.hasOwn(row,column) || row[column] === '') return '';
  const value = row[column];
  if (value === null) return 'Unknown';
  if (numericColumns.has(column) && typeof value === 'string' && decimalKey(value) !== null) {
    const number = Number(value);
    // Preserve a high-precision source decimal if an IEEE double would change it.
    if (Number.isFinite(number) && decimalKey(value) === decimalKey(number)) return number;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Nonfinite value in ${column}`);
    return value;
  }
  return typeof value === 'string' || typeof value === 'boolean' ? value : JSON.stringify(value);
}

export function csvSafe(value) {
  // Keep source text literal when CSVs are opened in a spreadsheet application.
  return typeof value === 'string' && (/^[=+@\t\r]/.test(value) || /^-(?!\d|\.\d)/.test(value)) ? "'" + value : value;
}

export function prepare(snapshot, table) {
  const rows = snapshot[table.key];
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row)))
    throw new Error(`Expected rows in ${table.key}`);
  const columns = [...table.columns, ...new Set(rows.flatMap(Object.keys).filter(key => !table.columns.includes(key)).sort())];
  const escapedCells = [];
  const matrix = [columns, ...rows.map((row,r) => columns.map((column,c) => {
    const value=cellValue(row,column), safe=csvSafe(value);
    if (safe !== value) escapedCells.push({row:r+2,column:c+1,header:column,method:'leading_apostrophe_for_literal_text'});
    return safe;
  }))];
  return {columns,matrix,escapedCells};
}

export function serializeCSV(matrix) {
  return matrix.map(row=>row.map(value=>{
    const text=value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"','""') + '"' : text;
  }).join(',')).join('\r\n')+'\r\n';
}

async function atomicWrite(file, data) {
  const temporary = file + '.tmp-' + process.pid;
  await fs.writeFile(temporary,data);
  await fs.rename(temporary,file);
}

export async function exportCSV(input, outputDir, {artifactWorkspace, previewDir}={}) {
  if (!artifactWorkspace) throw new Error('--artifact-workspace must contain the bundled runtime node_modules symlink');
  const loader = createRequire(path.join(path.resolve(artifactWorkspace),'package.json'));
  const {Workbook} = await import(pathToFileURL(loader.resolve('@oai/artifact-tool')).href);
  const raw = await fs.readFile(input), snapshot = JSON.parse(raw);
  if (!snapshot.run_id || !snapshot.as_of) throw new Error('A named, dated review snapshot is required');
  const workbook = Workbook.create(), sheets = [];
  for (const table of TABLES) {
    const data=prepare(snapshot,table), sheet=workbook.worksheets.add(table.sheet);
    const range=sheet.getRangeByIndexes(0,0,data.matrix.length,data.columns.length);
    range.values=data.matrix;
    sheet.showGridLines=false;
    range.format.font={name:'Arial',size:10};
    range.format.wrapText=true;
    range.format.rowHeight=80;
    sheet.getRangeByIndexes(0,0,1,data.columns.length).format={fill:'#303030',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},wrapText:true,rowHeight:48};
    sheet.getRangeByIndexes(0,0,data.matrix.length,Math.min(6,data.columns.length)).format.columnWidth=22;
    sheet.freezePanes.freezeRows(1);
    sheets.push({table,data,sheet,range});
  }
  workbook.recalculate();
  const formulaScan=await workbook.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Review export formula error scan'});
  if (!formulaScan.ndjson) throw new Error('Could not inspect the workbook for formula errors');
  await fs.mkdir(outputDir,{recursive:true});
  if (previewDir) await fs.mkdir(previewDir,{recursive:true});
  const manifest={schema:'complementary-review-csv-export',run_id:snapshot.run_id,as_of:snapshot.as_of,
    source_sha256:hash(raw),source_snapshot:'review_tables.snapshot.json',builder_sha256:hash(await fs.readFile(new URL(import.meta.url))),
    proposals_are_not_applied_corrections:true,original_evidence_unchanged:true,
    missing_policy:'Null source values are Unknown; absent/empty strings stay blank; zero remains zero.',
    outputs:[]};
  for (const {table,data,sheet,range} of sheets) {
    const values=range.values;
    assert.equal(values.length,data.matrix.length,'Spreadsheet row count changed');
    const restored=values.map((row,r)=>row.map((value,c)=>{
      const expected=data.matrix[r][c];
      if (expected === '' && value === null) return '';
      // Some spreadsheet engines consume the leading text-entry apostrophe.
      if (typeof expected === 'string' && expected[0] === "'" && value === expected.slice(1)) return expected;
      return value;
    }));
    assert.deepEqual(restored,data.matrix,'Spreadsheet values must round trip unchanged');
    const inspected=await workbook.inspect({kind:'table',range:`'${table.sheet}'!A1:F${Math.min(data.matrix.length,4)}`,include:'values,formulas',tableMaxRows:4,tableMaxCols:6,maxChars:1200});
    if (!inspected.ndjson) throw new Error(`Could not inspect ${table.sheet}`);
    if (previewDir) {
      const preview=await workbook.render({sheetName:table.sheet,range:`A1:F${Math.min(data.matrix.length,5)}`,scale:1,format:'png'});
      await fs.writeFile(path.join(previewDir,table.key+'.png'),new Uint8Array(await preview.arrayBuffer()));
    }
    const csv=serializeCSV(restored), output=path.join(outputDir,table.file);
    await atomicWrite(output,csv);
    manifest.outputs.push({file:table.file,rows:data.matrix.length-1,columns:data.columns.length,
      sha256:hash(csv),escaped_cells:data.escapedCells});
  }
  await atomicWrite(path.join(outputDir,manifest.source_snapshot),raw);
  await atomicWrite(path.join(outputDir,'csv_manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  assert.equal(hash(await fs.readFile(input)),manifest.source_sha256,'Source snapshot changed during export');
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2), option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  if (args.length<2) throw new Error('Usage: export_complementary_csv.mjs review_tables.json output_dir --artifact-workspace workspace [--preview-dir scratch_dir]');
  const result=await exportCSV(path.resolve(args[0]),path.resolve(args[1]),{artifactWorkspace:option('--artifact-workspace'),previewDir:option('--preview-dir')});
  console.log(JSON.stringify({run_id:result.run_id,as_of:result.as_of,outputs:result.outputs.map(({file,rows})=>({file,rows}))}));
}
