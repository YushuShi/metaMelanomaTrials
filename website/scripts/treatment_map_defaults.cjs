'use strict';
// Lossless, source-bound default views. No new extraction or model requests.
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const zlib=require('node:zlib');
const {execFileSync}=require('node:child_process');
const MapView=require('../dist/treatment_map.js');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.existsSync(file)?fs.readFileSync(file):zlib.gunzipSync(fs.readFileSync(file+'.gz'));
// Intern equal subtrees, without rounding numbers or replacing source records
// by identifiers. Repeated result/quote/cohort objects otherwise cost 60 MB.
function packAnalyses(analyses){
  const values=[],known=new Map();
  const encode=value=>{
    if(!value||typeof value!=='object')return value;
    const encoded=Array.isArray(value)?value.map(encode):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));
    const signature=JSON.stringify(encoded);
    if(!known.has(signature)){known.set(signature,values.length);values.push(encoded);}
    return {$cache_ref:known.get(signature)};
  };
  return {format:'interned-v1',entries:Object.fromEntries(Object.entries(analyses).map(([k,v])=>[k,encode(v)])),values};
}
function build(graph){
  const defaults=MapView.buildDefaultViews(MapView.prepare(graph));
  defaults.analyses=packAnalyses(defaults.analyses);
  return {
    schema_version:graph.schema_version,record_kind:graph.record_kind,content_sha256:graph.content_sha256,
    metadata:graph.metadata,view_snapshot:true,
    nodes:graph.nodes.map(({inclusive_count_summary,inclusive_contribution_ids,contribution_ids,...node})=>node),
    relationships:graph.relationships,comparisons:graph.comparisons,network_direct_evidence:graph.network_direct_evidence||[],
    // Full source-bound membership and audit records stay in treatment_map.json
    // and are fetched only for the study table. Counts here are already final.
    study_memberships:graph.study_memberships.map(({id,node_id})=>({id,node_id})),
    default_views:defaults,
  };
}
function publish(root){
  const dir=path.join(root,'website/dist/data'),graphBytes=read(path.join(dir,'treatment_map.json'));
  // Public checkouts already contain the bylines. Refresh them when the local
  // citation database is present so newly admitted reports are included.
  if(fs.existsSync(path.join(root,'data/current/articles.sqlite3')))
    execFileSync('python3',[path.join(root,'website/scripts/treatment_network_authors.py'),root]);
  const graph=JSON.parse(graphBytes),snapshot=build(graph),bytes=JSON.stringify(snapshot)+'\n';
  const classes=JSON.parse(read(path.join(dir,'clinical_classifications.json')));
  const source=read(path.join(root,graph.metadata.source_path));
  if(hash(source)!==graph.metadata.source_file_sha256)throw new Error('Default map source has changed; rebuild the treatment map first.');
  const quantitative=JSON.parse(source);
  const networkReference=require('./treatment_network_reference_cache.cjs').publish(root);
  const networkFile='treatment_network_reference.json';
  const networkPresent=['current','published'].includes(networkReference.status);
  const producers=['website/scripts/treatment_map_defaults.cjs','website/dist/treatment_map.js','website/dist/treatment_map_analysis.js','website/dist/treatment_map_effects.js','website/dist/statistical_math.js','website/dist/confidence_intervals.js'];
  producers.push('website/dist/radial_branch_panel.js','website/dist/radial_branch_family.js','website/dist/treatment_network_ui.js');
  producers.push('website/scripts/treatment_network_reference_cache.cjs','website/scripts/treatment_network_reference_cache.R',
    'website/scripts/treatment_network_authors.py','website/dist/treatment_network_authors.js',
    'website/dist/treatment_network_model.js','website/dist/treatment_network_cache.js','website/dist/treatment_network_evidence.js');
  const atomic=(name,data)=>{const file=path.join(dir,name),temp=file+'.tmp-'+process.pid;fs.writeFileSync(temp,data);fs.renameSync(temp,file);};
  const studyHashes={};
  if(quantitative.mode==='pilot' && quantitative.publication_ready && quantitative.clinical_evidence?.articles) {
    execFileSync('python3',[path.join(root,'website/scripts/single_arm_denominators.py'),root]);
    const receipt=JSON.parse(execFileSync(process.execPath,[path.join(root,'website/scripts/study_browse_defaults.cjs'),root],{encoding:'utf8'}));
    Object.assign(studyHashes,receipt.hashes);
    for(const producer of receipt.producers)if(!producers.includes(producer))producers.push(producer);
    producers.push('website/scripts/single_arm_denominators.py','config/single_arm_denominator_reviews.json');
  }
  const version={schema_version:1,...studyHashes,graph_content_sha256:graph.content_sha256,
    network_reference_sha256:networkPresent?hash(read(path.join(dir,networkFile))):null,
    ...(networkPresent?{}:{network_reference_note:networkReference.reason}),
    graph_file_sha256:hash(graphBytes),default_snapshot_sha256:hash(bytes),
    clinical_content_sha256:graph.metadata.clinical_content_sha256,
    quantitative_content_sha256:quantitative.content_sha256||graph.metadata.source_file_sha256,
    normalization_content_sha256:graph.metadata.normalization_content_sha256,
    registry_sha256:graph.metadata.registry_sha256,source_file_sha256:graph.metadata.source_file_sha256,
    clinical_classification_content_sha256:classes.content_sha256,engine_signature:MapView.engineSignature,
    ...(quantitative.mode==='pilot'&&quantitative.publication_ready===true&&quantitative.about_progress
      ?{about_progress:{...quantitative.about_progress,stage_scope:quantitative.about_progress.stage_scope||['R2']}}:{}),
    producer_sha256:Object.fromEntries(producers.map(name=>[name,hash(fs.readFileSync(path.join(root,name)))])),
    layout_count:Object.keys(snapshot.default_views.layouts).length,
    analysis_count:Object.keys(snapshot.default_views.analyses.entries).length,
    scientific_source_changed:false,new_model_requests:0};

  atomic('treatment_map_default.json',bytes);
  // Publish the small version receipt last, so interrupted builds remain stale.
  atomic('treatment_map_version.json',JSON.stringify(version,null,2)+'\n');
  return {...version,default_bytes:Buffer.byteLength(bytes),compressed_bytes:zlib.gzipSync(bytes).length};
}
module.exports={build,packAnalyses,publish};
if(require.main===module)process.stdout.write(JSON.stringify(publish(path.resolve(process.argv[2]||path.join(__dirname,'../..'))))+'\n');
