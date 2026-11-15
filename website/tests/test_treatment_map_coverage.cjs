'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const map=require('../dist/treatment_map.js');

test('coverage counts records actually withheld and recognizes linked publications in merged records',()=>{
  const node={id:'agent:a'};
  const records=[
    {id:'counted',pmid:'1',publication_ids:['1','2'],study_id:'trial-a',relevant_node_ids:[node.id],node_ids:[node.id],status:'partial'},
    {id:'r2',pmid:'2',study_id:null,relevant_node_ids:[node.id],node_ids:[],status:'provisional'},
    {id:'overlap',pmid:'3',study_id:'trial-a',relevant_node_ids:[node.id],node_ids:[],status:'partial'},
    {id:'elsewhere',pmid:'4',study_id:null,relevant_node_ids:['agent:b'],node_ids:[]}
  ];
  const result=map.recordCoverage({graph:{},contributions:new Map(records.map(x=>[x.id,x]))},node);
  assert.equal(result.unlinkedPublications,1);
  assert.equal(result.partlyLinkedPublications,1,'merged source publication IDs count, not just the representative PMID');
  assert.deepEqual(result.withheld.map(x=>x.id),['r2','overlap'],'partial counted records are not presented as withheld; overlapping flags do not double count');
});

test('current nivolumab coverage reconciles with source memberships under the cohort inclusion policy',()=>{
  const graph=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/data/treatment_map.json'),'utf8'));
  const model=map.prepare(graph),node=model.byId.get('agent:nivolumab'),result=map.recordCoverage(model,node);
  const relevant=graph.contributions.filter(c=>c.relevant_node_ids.includes(node.id));
  const counted=relevant.filter(c=>c.node_ids.includes(node.id));
  const pmids=c=>c.publication_ids?.length?c.publication_ids:[c.pmid];
  const linked=new Set(relevant.filter(c=>c.study_id).flatMap(pmids));
  const unlinked=new Set(relevant.filter(c=>!c.study_id).flatMap(pmids));
  assert.equal(result.unlinkedPublications,unlinked.size);
  assert.equal(result.partlyLinkedPublications,[...unlinked].filter(p=>linked.has(p)).length);
  assert.deepEqual(result.withheld.map(c=>c.id).sort(),relevant.filter(c=>!c.node_ids.includes(node.id)).map(c=>c.id).sort());
  assert.equal(node.count_summary.known_n,counted.reduce((n,c)=>n+c.n,0));
  const identified=relevant.filter(c=>c.independent_cohort_count_eligible!==false&&(c.certain_node_ids.includes(node.id)||c.alternative_node_ids?.includes(node.id)));
  assert.equal(node.count_summary.identified_studies,new Set(identified.map(c=>c.study_id).filter(Boolean)).size,'unresolved exposure and explicit reused-data/aggregate holds do not add independent studies');
  assert.equal(node.count_summary.counted_arms,counted.length);
  const original=counted.find(c=>c.pmid==='32160899');
  assert.equal(original?.n,100,'the unnamed original cohort contributes its accepted N');
  assert.equal(original.linkage,'internal_original_cohort');
  assert.ok(!counted.some(c=>c.pmid==='41228313'&&c.inclusive_or_count),'unresolved OR allocation cannot add exact monotherapy participants');
  const alternatives=graph.contributions.find(c=>c.pmid==='41228313'&&c.inclusive_or_count&&c.inclusive_node_ids?.includes(node.id));
  assert.equal(alternatives?.inclusive_n,22,'the earlier inclusive OR count remains available as historical evidence');
  assert.ok(alternatives.alternative_node_ids.includes(node.id));
});
