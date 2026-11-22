'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const cache = require('../dist/treatment_network_cache.js');
const builder = require('../scripts/treatment_network_reference_cache.cjs');

(async()=>{
  const data = path.join(__dirname,'../dist/data');
  const read = name => {
    const file = path.join(data,name);
    return JSON.parse(fs.existsSync(file) ? fs.readFileSync(file) : zlib.gunzipSync(fs.readFileSync(file+'.gz')));
  };
  const graph = read('treatment_map.json'), artifact = read('treatment_network_reference.json');
  assert.equal(artifact.graphHash,graph.content_sha256);
  const inputs = builder.buildInputs(graph), entries = Object.entries(inputs);
  builder.verifyFits(inputs,artifact);
  assert.ok(entries.length);
  for (const [key,input] of entries) {
    assert.equal(await cache.digest([...input.blocks].reverse()),key);
    const [a,b] = input.arms;
    for (const model of ['common','random']) {
      const result = await cache.lookup(artifact,graph.content_sha256,input.blocks,a,b,model);
      assert.ok(result?.engine.startsWith('R metafor '));
      const reverse = await cache.lookup(artifact,graph.content_sha256,input.blocks,b,a,model);
      if (result.available) {
        assert.ok(Math.abs(result.estimate*reverse.estimate - 1)<1e-10);
        assert.ok(Math.abs(result.ci_lower*reverse.ci_upper - 1)<1e-10);
      } else assert.ok(result.reason.includes('degrees of freedom'));
    }
    assert.equal(await cache.lookup(artifact,'outdated',input.blocks,a,b),null);
    assert.equal(await cache.lookup(artifact,graph.content_sha256,input.blocks.slice(1),a,b),null);
    const modified=structuredClone(input.blocks);
    modified[0].contrasts[0].logEffect+=.01;
    assert.equal(await cache.lookup(artifact,graph.content_sha256,modified,a,b),null);
    modified[0].contrasts[0].logEffect=input.blocks[0].contrasts[0].logEffect;
    modified[0].covariance[0][0]+=.001;
    assert.equal(await cache.lookup(artifact,graph.content_sha256,modified,a,b),null);
  }
  console.log('Published R network fits, inversion and stale graph/evidence guards passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
