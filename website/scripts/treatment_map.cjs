'use strict';
// Batch-only entry point. The browser reads the prepared graph, never raw arms.
const fs=require('node:fs');
const input=JSON.parse(fs.readFileSync(process.argv[2]||0,'utf8'));
const {build}=require('./treatment_map_model.cjs');
process.stdout.write(JSON.stringify(build(input)));
