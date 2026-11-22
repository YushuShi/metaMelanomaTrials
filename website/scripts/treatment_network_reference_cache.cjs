'use strict';
// Optional publication artifact. Usage: node website/scripts/treatment_network_reference_cache.cjs [repo-root]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const cache = require('../dist/treatment_network_cache.js');
const model = require('../dist/treatment_network_model.js');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');

function verifyFits(inputs, output) {
  const keys = Object.keys(inputs).sort();
  if (!output.engine?.startsWith('R metafor ') || JSON.stringify(Object.keys(output.components || {}).sort()) !== JSON.stringify(keys))
    throw new Error('The R cache does not contain every requested connected component.');
  for (const key of keys) {
    const source = inputs[key], result = output.components[key];
    if (JSON.stringify(result.arms) !== JSON.stringify(source.arms)) throw new Error('Incomplete R treatment contrast basis.');
    for (const type of ['common','random']) {
      const [first,second] = source.arms;
      const fitted = model.fit(source.blocks,first,second,type);
      const saved = cache.contrast(result,first,second,type,output.engine);
      if (!saved || saved.available !== fitted.available || (!saved.available && type === 'common'))
        throw new Error('The R and browser engines disagree on estimability.');
      if (!saved.available) continue;
      for (const name of ['logEstimate','se','tau2']) {
        if (Math.abs(saved[name]-fitted[name]) > 2e-5 * Math.max(.01,Math.abs(saved[name]),Math.abs(fitted[name])))
          throw new Error('The R and browser results differ for '+key+' '+type+' '+name+'.');
      }
      for (let i = 0; i < source.arms.length; i++) for (let j = 0; j < i; j++)
        if (!cache.contrast(result,source.arms[i],source.arms[j],type,output.engine)?.available)
          throw new Error('An R coefficient or contrast covariance is incomplete.');
    }
  }
}

function runR(inputs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'melanoma-nma-'));
  try {
    const input = path.join(dir,'input.json'), output = path.join(dir,'output.json');
    fs.writeFileSync(input,JSON.stringify(inputs));
    const command = spawnSync('Rscript',[path.join(__dirname,'treatment_network_reference_cache.R'),input,output],
      {encoding:'utf8', timeout:120000});
    if (command.error?.code === 'ENOENT' || command.status === 42) return null;
    if (command.error) throw command.error;
    if (command.status !== 0) throw new Error((command.stderr || 'R metafor fitting failed.').trim());
    const result = JSON.parse(fs.readFileSync(output,'utf8'));
    verifyFits(inputs,result);
    return result;
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}

function buildInputs(graph) {
  const evidence = require('../dist/treatment_network_evidence.js');
  const network = evidence.build(graph,{endpoint:'OS:HR',setting:'all',advanced:{active:false}});
  if (!Array.isArray(network.components)) throw new Error('Network eligibility components are unavailable.');
  const inputs = {};
  for (const component of network.components) {
    if (component.regimens.length < 3 || component.blocks.length < 2) continue;
    const arms = [...component.regimens].sort();
    const signature = cache.signature(component.blocks);
    // Transmit only the fields actually used by the R model.
    const blocks = JSON.parse(signature).map(([trialId,rows,covariance]) => ({
      trialId,covariance,contrasts:rows.map(([treatment,comparator,logEffect]) => ({treatment,comparator,logEffect}))
    }));
    inputs[hash(signature)] = {arms,blocks};
  }
  return inputs;
}

function publish(root) {
  const dir = path.join(root,'website/dist/data'), graphPath = path.join(dir,'treatment_map.json');
  const graph = JSON.parse(fs.existsSync(graphPath) ? fs.readFileSync(graphPath) : zlib.gunzipSync(fs.readFileSync(graphPath+'.gz')));
  if (!graph.content_sha256) throw new Error('The source graph has no content hash.');
  const target = path.join(dir,'treatment_network_reference.json');
  const previous = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target)) : null;
  const input = buildInputs(graph);
  if (!Object.keys(input).length) return {status:'unavailable',reason:'No default overall-survival component supports indirect comparisons.'};
  const producerHash = hash([__filename,path.join(__dirname,'treatment_network_reference_cache.R'),
    require.resolve('../dist/treatment_network_cache.js')].map(f => hash(fs.readFileSync(f))).join(':'));
  const sameInputs = previous && previous.schema === cache.schema && previous.graphHash === graph.content_sha256 &&
    previous.producerHash === producerHash && JSON.stringify(Object.keys(previous.components || {}).sort()) === JSON.stringify(Object.keys(input).sort());
  if (sameInputs) {
    verifyFits(input,previous);
    return {status:'current',components:Object.keys(input).length,engine:previous.engine};
  }
  const fits = runR(input);
  if (!fits) return {status:'unavailable',reason:'Install R with metafor, jsonlite and Matrix to regenerate the reference fits. The browser can fit the selected model.'};
  const artifact = {schema:cache.schema,graphHash:graph.content_sha256,producerHash, ...fits};
  const temp = target+'.tmp-'+process.pid;
  try {
    fs.writeFileSync(temp,JSON.stringify(artifact)+'\n',{flag:'wx'});
    fs.renameSync(temp,target);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return {status:'published',components:Object.keys(input).length,engine:fits.engine};
}
module.exports = {publish,buildInputs,runR,verifyFits};
if (require.main === module) {
  try {
    const result = publish(path.resolve(process.argv[2] || path.join(__dirname,'../..')));
    console.log(JSON.stringify(result));
  } catch (error) { console.error('Network reference cache was not replaced: '+error.message); process.exitCode=1; }
}
