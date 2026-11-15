'use strict';
// Batch export uses the exact browser regimen implementation, not a second parser.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const registry=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../config/treatment_registry.json'),'utf8'));
const {definitions}=require('./treatment_normalization.cjs').load(registry,path.resolve(__dirname,'../dist'));
const payload=JSON.parse(fs.readFileSync(0,'utf8'));
if(payload.record_kind!=='canonical_clinical_evidence'||!Array.isArray(payload.articles))throw new Error('Expected the clinical evidence export');
payload.articles=definitions.prepareStudies(payload.articles);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
payload.treatment_normalization={registry_version:registry.version,normalization_version:registry.normalization_version,
  registry_sha256:crypto.createHash('sha256').update(JSON.stringify(stable(registry))).digest('hex')};
process.stdout.write(JSON.stringify(payload));
