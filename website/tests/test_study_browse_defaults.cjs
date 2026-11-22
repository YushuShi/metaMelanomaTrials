'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const crypto=require('node:crypto');
const Evidence=require('../dist/treatment_network_evidence.js'),Model=require('../dist/treatment_network_model.js'),Planning=require('../dist/treatment_map_planning.js');
const dir=path.resolve(__dirname,'../dist/data');
function bytes(name){
  const file=path.join(dir,name+'.json');
  return fs.existsSync(file)?fs.readFileSync(file):zlib.gunzipSync(fs.readFileSync(file+'.gz'));
}
test('release indexes tie default Studies rows and ordered network plans to one source',()=>{
  const v=JSON.parse(bytes('treatment_map_version'));
  const artifact=name=>{
    const b=bytes(name);
    assert.equal(crypto.createHash('sha256').update(b).digest('hex'),v[name+'_sha256']);
    const data=JSON.parse(b);
    assert.equal(data.graph,v.graph_content_sha256);
    assert.equal(data.source,v.source_file_sha256);
    return data;
  };
  const browse=artifact('study_browse_default'), saved=artifact('study_network_defaults').results;
  assert.ok(browse.rows.length>0);
  const ids=browse.rows.map(row=>row.study.report_id);
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(browse.rows.every(row=>row.presentation_rows.length && row.presentation_rows.every(c=>c.prepared_view && c.prepared_arms.length===2)));
  assert.ok(browse.selectors.comparator.some(row=>row.value==='agent:dacarbazine'));
  const graph=JSON.parse(bytes('treatment_map')),network=Evidence.build(graph,{endpoint:'OS:HR'});
  for (const [first,second] of [['agent:fotemustine','agent:dacarbazine'],['agent:dacarbazine','agent:fotemustine']]) {
    const entry=saved[JSON.stringify(['OS:HR','overall',first,second])];
    const pair=network.forPair(first,second),fit=Model.fit(pair.blocks,first,second);
    assert.ok(fit.available);
    assert.equal(entry.fit.estimate,fit.estimate);
    assert.equal(entry.fit.ci_lower,fit.ci_lower);
    const plan=settings=>Planning.indirect({estimate:fit.estimate,measure:'HR',first,second,comparisons:pair.comparisons,settings});
    assert.equal(entry.plan.label,plan({}).label);
    assert.notEqual(entry.plan.label,plan({power:.9}).label);
  }
});
