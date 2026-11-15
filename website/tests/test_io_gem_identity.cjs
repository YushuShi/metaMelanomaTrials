'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const q=require('../dist/data/quantitative_extraction.json'),registry=require('../../config/treatment_registry.json'),normalizations=require('../dist/data/treatment_normalizations.json');
const {build}=require('../scripts/treatment_map_model.cjs'),{create}=require('../scripts/treatment_map_cohorts.cjs');
const make=pmids=>build({registry,normalizations,quantitative:{...q,articles:q.articles.filter(a=>pmids.includes(a.pmid)),clinical_evidence:{...q.clinical_evidence,articles:q.clinical_evidence.articles.filter(a=>pmids.includes(a.pmid))}}});
const baseline=make(['39282897']),graph=make(['39282897','40473950']);
const rows=graph.contributions.filter(c=>c.publication_ids.includes('40473950'));

test('actual IO-GEM validation records retain their own source-bound identity with an explicit count hold',()=>{
 const validation=rows.filter(c=>/^IO-GEM/.test(c.population));assert.ok(validation.length>=3);
 for(const c of validation){assert.equal(c.study_id,'cohort:report:40473950:io-gem');assert.deepEqual(c.nct_ids,[]);assert.equal(c.n,null);assert.equal(c.node_ids.length,0);assert.equal(c.participant_overlap_unresolved,true);assert.equal(c.reused_data_review_pending,true);assert.equal(c.independent_cohort_count_eligible,false);assert.deepEqual(c.participant_count_conflict.reported_totals,[675,749]);assert.match(c.note,/previously published datasets/);assert.match(c.note,/different validation-cohort totals/);assert.ok(c.identity_source_refs.some(s=>s.evidence_ids.length));}
 assert.ok(validation.some(c=>c.excluded_samples.some(s=>s.n===174)));assert.ok(validation.some(c=>c.excluded_samples.some(s=>s.n===379)));
});

test('actual pooled CheckMate067 plus IO-GEM populations do not become a trial or extra independent cohort',()=>{
 const pooled=rows.filter(c=>/^Pooled CheckMate-067 and IO-GEM/.test(c.population));assert.ok(pooled.length>=3);
 for(const c of pooled){assert.equal(c.study_id,'aggregate:report:40473950:checkmate067-io-gem');assert.equal(c.n,null);assert.equal(c.independent_cohort_count_eligible,false);assert.equal(c.node_ids.length,0);}
 for(const id of ['agent:nivolumab','agent:ipilimumab']){const before=baseline.nodes.find(n=>n.id===id).count_summary,after=graph.nodes.find(n=>n.id===id).count_summary;assert.equal(after.known_n,before.known_n);assert.equal(after.identified_studies,before.identified_studies);}
 assert.equal(graph.metadata.identified_studies,baseline.metadata.identified_studies);
 assert.equal(graph.comparisons.filter(c=>c.pmid==='40473950').length,0,'identity repair cannot invent between-drug HRs');
});

test('actual CheckMate067-only populations preserve the existing trial identity',()=>{
 const trial=rows.filter(c=>/^CheckMate-067/.test(c.population));assert.ok(trial.length);
 for(const c of trial){assert.equal(c.study_id,'nct:NCT01844505');assert.equal(c.participant_overlap_unresolved,undefined);}
});

test('reviewed IO-GEM rule requires the source distinction and registration, not just PMID or labels',()=>{
 const p={id:'p',label:'IO-GEM validation cohort',scope:'subgroup',evidence:['e']};
 const source={pmid:'40473950',names:[],ncts:['NCT01844505'],record:{stage:'R3',source_sha256:'test',study:{evidence:['e']},populations:[p]}};
 const resolver=create([source],{quote:()=> 'IO-GEM validation cohort',anchored:()=>true,refs:(_,ids)=>ids});assert.equal(resolver.reviewedIdentity(source,p),null);
 const proof='CM-067 clinical trial registration NCT01844505. IO-GEM is a SOC cohort and uses previously published datasets. SOC validation cohort consisted of n = 675. Total IO-GEM, n=749.';
 const other={...source,pmid:'other'};const otherResolver=create([other],{quote:()=>proof,anchored:()=>true,refs:(_,ids)=>ids});assert.equal(otherResolver.reviewedIdentity(other,p),null);
});
