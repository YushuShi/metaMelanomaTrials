'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const q=require('../dist/data/quantitative_extraction.json'),registry=require('../../config/treatment_registry.json'),normalizations=require('../dist/data/treatment_normalizations.json');
const {build}=require('../scripts/treatment_map_model.cjs'),Analysis=require('../dist/treatment_map_analysis.js');
const pmids=new Set(['41124198','39282897','37058595','32961119','31638282','31562797','30361170','28889792','28891423','26027431']);
const graph=build({registry,normalizations,quantitative:{...q,articles:q.articles.filter(a=>pmids.has(a.pmid)),clinical_evidence:{...q.clinical_evidence,articles:q.clinical_evidence.articles.filter(a=>pmids.has(a.pmid))}}});
const pair=graph.comparisons.filter(c=>[c.intervention.node_id,c.comparator.node_id].sort().join('|')===['agent:nivolumab','agent:ipilimumab'].sort().join('|'));

test('actual CheckMate067 randomized ITT is overall, not a subgroup of screening',()=>{
 const rows=pair.filter(c=>c.pmid==='39282897'&&c.source_refs.some(s=>s.stage==='R3'));assert.ok(rows.length);
 for(const row of rows){assert.equal(row.analysis.cohort.is_subgroup,false);assert.equal(row.analysis.cohort.scope,'overall');assert.equal(row.analysis.cohort.id,'nct:NCT01844505|overall');assert.equal(row.analysis.cohort.sample_n,945);}
});
test('actual CheckMate067 cohort ranking uses randomized945 instead of enrolled1296',()=>{
 for(const pmid of ['26027431','28889792']){const rows=pair.filter(c=>c.pmid===pmid&&c.source_refs.some(s=>s.stage==='R3'));assert.ok(rows.length);for(const row of rows){assert.equal(row.analysis.cohort.sample_n,945);assert.equal(row.analysis.cohort.sample_n_count_purpose,'randomized');assert.ok(row.analysis.cohort.sample_n_source_refs.length);}}
});
test('genuine stageIII and Japanese subgroups retain their subgroup status',()=>{
 const dmfs=pair.find(c=>c.pmid==='41124198'&&c.outcome==='DMFS');assert.equal(dmfs.analysis.cohort.is_subgroup,true);
 const japanese=pair.filter(c=>c.pmid==='31638282');assert.ok(japanese.length);assert.ok(japanese.every(c=>c.analysis.cohort.is_subgroup));
});
test('exact nivolumab versus ipilimumab pools two independent trials across settings by default',()=>{
 const analyze=endpoint=>Analysis.analyze(pair,{tailId:'agent:nivolumab',headId:'agent:ipilimumab',endpoint,studyScope:'all'});
 const os=analyze('OS:HR'),selected=os.groups.flatMap(g=>g.selected);assert.equal(selected.length,2);
 assert.deepEqual([...new Set(selected.map(r=>r.parent_study_id))].sort(),['nct:NCT01844505','nct:NCT02388906']);
 assert.deepEqual(selected.map(r=>r.pmid).sort(),['32961119','39282897']);
 const active=os.groups.filter(g=>g.selected.length);assert.equal(active.length,1);assert.equal(active[0].pooled.k,2);assert.equal(active[0].pooled.model,'fixed');
 const dmfs=analyze('DMFS:HR');assert.equal(dmfs.groups.flatMap(g=>g.selected).length,0);assert.ok(dmfs.groups.every(g=>!g.pooled));
 const sourceOnly=dmfs.tableRows.find(r=>r.pmid==='41124198');assert(sourceOnly);assert.equal(sourceOnly.selection_reason,'missing_supported_sample_size');assert.equal(sourceOnly.included,false);assert.equal(sourceOnly.selectable,false);
});
test('95.03 percent is the original source-reported interval level for41124198OS',()=>{
 const row=pair.find(c=>c.pmid==='41124198'&&c.outcome==='OS');assert.equal(row.ci_level,95.03);assert.deepEqual([row.estimate,row.ci_lower,row.ci_upper],[.88,.69,1.11]);
 const quotes=row.source_refs.flatMap(s=>s.evidence_ids).map(id=>q.clinical_evidence.evidence_registry[id]?.supporting_quote||'').join(' ');assert.match(quotes,/95\.03% CI, 0\.69 to 1\.11/);
});
