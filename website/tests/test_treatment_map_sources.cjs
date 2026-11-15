'use strict';
// Regression expectations below are read against actual immutable source records.
// Production aggregation must derive these values; none is a production override.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build}=require('../scripts/treatment_map_model.cjs');
const Analysis=require('../dist/treatment_map_analysis.js');
const root=path.resolve(__dirname,'../..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const quantitative=read('website/dist/data/quantitative_extraction.json');
const registry=read('config/treatment_registry.json');
const normalizations=read('website/dist/data/treatment_normalizations.json');
const rows=graph=>graph.contributions||[];
const sum=(graph,node,study)=>rows(graph).filter(r=>r.node_ids?.includes(node)&&(!study||r.study_id===study)).reduce((n,r)=>n+(typeof r.n==='number'?r.n:0),0);
function subset(pmids){
  const selected=new Set(pmids);
  return {...quantitative,articles:quantitative.articles.filter(a=>selected.has(a.pmid)),
    clinical_evidence:{...quantitative.clinical_evidence,articles:quantitative.clinical_evidence.articles.filter(a=>selected.has(a.pmid))},
    study_links:quantitative.study_links.map(l=>({...l,pmids:l.pmids.filter(p=>selected.has(p))})).filter(l=>l.pmids.length)};
}
const graphFor=pmids=>build({registry,normalizations,quantitative:subset(pmids)});
const checkmateReports=['26027431','28651159','28889792','30361170','31562797','34799400','34818112','39282897'];
const keynoteReports=['35367007','36202690','36265502','38452313','38485189','39893343','40198940','41701495'];
const memo=new Map();
function actualGraph(key,pmids){if(!memo.has(key))memo.set(key,graphFor(pmids));return memo.get(key);}

test('actual latest KEYNOTE-054 report shares the source-certified EORTC registration across map records',()=>{
  const graph=graphFor(['33857412','38319852','39288737']);
  const latest=graph.comparisons.filter(comparison=>comparison.pmid==='39288737');
  assert.ok(latest.length);
  for(const comparison of latest){
    assert.equal(comparison.study_id,'nct:NCT02362594');
    assert.equal(comparison.analysis.independent_id,'nct:NCT02362594');
    assert.equal(comparison.analysis.cohort.root_id,'nct:NCT02362594|overall');
    assert.deepEqual(comparison.nct_ids,['NCT02362594']);
    assert.ok(comparison.trial_identity_provenance.some(ref=>ref.canonical_name==='KEYNOTE-054'&&ref.nct_ids.includes('NCT02362594')&&ref.source_urls.includes('https://clinicaltrials.gov/study/NCT02362594')));
    assert.ok(comparison.source_refs.some(ref=>ref.pmid==='39288737'));
  }
  const memberships=graph.study_memberships.filter(member=>member.pmid==='39288737');
  assert.ok(memberships.length);
  assert.ok(memberships.every(member=>member.study_id==='nct:NCT02362594'));
  assert.ok(!graph.contributions.some(row=>row.study_id==='cohort:report:39288737'));
});

test('all current intentional mixed-melanoma comparisons retain broad eligibility and source subtype',()=>{
  const pmids=quantitative.articles.filter(article=>article.records.some(wrapper=>
    wrapper.record?.study?.melanoma_subtype==='mixed')).map(article=>article.pmid);
  const graph=graphFor(pmids),mixed=graph.comparisons.filter(comparison=>comparison.analysis.reported_subtype==='mixed');
  assert.ok(mixed.length>0,'exercise actual mixed-melanoma sources beyond a single trial');
  assert.ok(new Set(mixed.map(comparison=>comparison.pmid)).size>1);
  for(const comparison of mixed){
    const analysis=comparison.analysis;
    assert.equal(analysis.subtype,'general_melanoma',comparison.pmid);
    assert.equal(analysis.compatibility.subtype,'general_melanoma',comparison.pmid);
    assert.ok(!analysis.metadata_conflicts.some(conflict=>conflict.field==='melanoma_subtype'),comparison.pmid);
    assert.doesNotMatch(analysis.compatibility.reason||'',/subtype/i,comparison.pmid);
    assert.ok(analysis.filter_bindings.length,'retain source-bound subtype filtering');
  }
});

test('KEYNOTE-054 and KEYNOTE-716 pool their latest supported DMFS results once per registered trial',()=>{
  const graph=graphFor(['40198940','39288737','33857412','38319852','38452313','36265502']);
  const pair=graph.comparisons.filter(c=>c.outcome==='DMFS');
  const result=Analysis.analyze(pair,{tailId:'control:placebo',headId:'agent:pembrolizumab',endpoint:'DMFS:HR'});
  const group=result.groups.find(g=>g.selected.some(row=>row.pmid==='40198940'));
  assert.ok(group?.pooled);
  assert.equal(group.pooled.k,2);assert.equal(group.pooled.model,'fixed');
  assert.equal(group.latest_fallback,undefined);
  assert.deepEqual(group.selected.map(row=>row.pmid).sort(),['39288737','40198940']);
  assert.deepEqual(group.selected.map(row=>row.parent_study_id).sort(),['nct:NCT02362594','nct:NCT03553836']);
  assert.deepEqual(group.selected.map(row=>row.pooling_n).sort((a,b)=>a-b),[976,1019]);
  const latest=group.selected.find(row=>row.pmid==='40198940');
  assert.equal(latest.comparison.analysis.sample_size.basis,'source_population_analysis_count');
  assert.ok(latest.pooling_n_source_refs.every(ref=>ref.pmid==='40198940'));
  assert.ok(Math.abs(group.pooled.estimate-.625172882482115)<1e-10);
  assert.ok(Math.abs(group.pooled.ci_lower-.5412382038108908)<1e-10);
  assert.ok(Math.abs(group.pooled.ci_upper-.7221240669757746)<1e-10);
});

test('RELATIVITY-047 and RELATIVITY-098 contribute two independent overall-survival cohorts',()=>{
  const graph=graphFor(['34986285','38320023','39671533','41109920','42926136']);
  const combination=graph.nodes.find(node=>node.components.join('|')==='nivolumab|relatlimab');
  const pair=graph.comparisons.filter(comparison=>
    [comparison.intervention.node_id,comparison.comparator.node_id].sort().join('|')===
    [combination.id,'agent:nivolumab'].sort().join('|'));
  const relativity098=pair.filter(comparison=>comparison.pmid==='41109920');
  assert.ok(relativity098.length);
  for(const comparison of relativity098){
    assert.equal(comparison.analysis.reported_subtype,'mixed');
    assert.equal(comparison.analysis.compatibility.subtype,'general_melanoma');
    assert.equal(comparison.analysis.compatibility.eligible,true);
    assert.deepEqual(comparison.analysis.metadata_conflicts,[]);
    assert.ok(comparison.analysis.filter_bindings.length);
  }
  const analysis=Analysis.analyze(pair,{tailId:'agent:nivolumab',headId:combination.id,endpoint:'OS:HR',studyScope:'all'});
  const groups=analysis.groups.filter(group=>group.selected.length);
  assert.equal(groups.length,1);
  assert.deepEqual(groups[0].selected.map(row=>row.pmid).sort(),['41109920','42926136']);
  assert.deepEqual(groups[0].selected.map(row=>row.parent_study_id).sort(),['nct:NCT03470922','nct:NCT05002569']);
  assert.deepEqual(groups[0].selected.map(row=>row.pooling_n).sort((a,b)=>a-b),[714,1093]);
  assert.equal(groups[0].pooled.k,2);
  assert.equal(groups[0].pooled.model,'fixed');
  assert.ok(Math.abs(groups[0].pooled.estimate-.8844506477145088)<1e-12);
  assert.ok(Math.abs(groups[0].pooled.ci_lower-.747214300594703)<1e-12);
  assert.ok(Math.abs(groups[0].pooled.ci_upper-1.0468923675845394)<1e-12);
  assert.ok(analysis.tableRows.filter(row=>['38320023','39671533'].includes(row.pmid)).every(row=>!row.included));
});

test('actual SRS source retains complete concurrent regimens and original OS/PFS effects',()=>{
  const graph=graphFor(['30975225']),combos=graph.nodes.filter(n=>n.type==='combination');
  const nivo=combos.find(n=>n.components.includes('nivolumab')),ipi=combos.find(n=>n.components.includes('ipilimumab'));
  assert.deepEqual(nivo.components,['nivolumab','radiosurgery']);assert.deepEqual(ipi.components,['ipilimumab','radiosurgery']);
  assert.equal(nivo.count_summary.known_n,35);assert.equal(ipi.count_summary.known_n,45);
  assert.equal(sum(graph,'agent:nivolumab'),0);assert.equal(sum(graph,'agent:ipilimumab'),0);assert.equal(sum(graph,'agent:radiosurgery'),0);
  assert.deepEqual(graph.comparisons.map(c=>[c.outcome,c.estimate,c.ci_lower,c.ci_upper]).sort(),[['OS',0.51,0.28,0.81],['PFS',0.54,0.32,0.92]]);
  const m=graph.study_memberships.find(m=>m.node_id===ipi.id);
  assert.deepEqual(m.source_bindings.map(b=>b.stage).sort(),['R2','R3']);assert.ok(m.source_bindings.every(b=>b.task_id&&b.raw_record_sha256&&b.review_binding_sha256));
  assert.ok(m.source_bindings.some(b=>b.result_ids.length>0));assert.equal(m.canonical_regimen.label,ipi.label);
});

test('actual explicit drug subgroups count only their resolved allocations',()=>{
  const graph=graphFor(['35173725']);assert.equal(sum(graph,'agent:nivolumab'),24);assert.equal(sum(graph,'agent:ipilimumab'),8);
  assert.ok(graph.study_memberships.some(m=>m.node_id==='agent:ipilimumab'&&m.source_bindings.some(b=>b.arm_ids.includes('a_ipi'))));
});

test('actual CheckMate 067 assigned arms contribute 316 nivolumab and 315 ipilimumab monotherapy across follow-ups',()=>{
  const graph=actualGraph('067',checkmateReports),study='nct:NCT01844505';
  assert.equal(sum(graph,'agent:nivolumab',study),316);
  assert.equal(sum(graph,'agent:ipilimumab',study),315);
  const counted=rows(graph).filter(r=>r.study_id===study&&typeof r.n==='number'&&r.node_ids?.length);
  assert.deepEqual(counted.map(r=>r.n).sort((a,b)=>a-b),[314,315,316]);
  assert.ok(counted.every(r=>r.count_purpose==='randomized'));
  assert.ok(counted.every(r=>r.source_refs?.some(s=>s.sample_id&&s.evidence_ids?.length)));
});

test('actual KEYNOTE-716 adds pembrolizumab 487 once, excluding placebo, safety and crossover',()=>{
  const graph=actualGraph('716',keynoteReports),study='nct:NCT03553836';
  assert.equal(sum(graph,'agent:pembrolizumab',study),487);
  const counted=rows(graph).filter(r=>r.node_ids?.includes('agent:pembrolizumab')&&typeof r.n==='number');
  assert.equal(counted.length,1);
  assert.equal(counted[0].count_purpose,'randomized');
  assert.ok(!counted.some(r=>r.pmid==='40198940'));
});

test('a real trial-name-only CheckMate 067 report links to its unambiguous registration',()=>{
  const graph=graphFor(['26027431','34818112']);
  assert.equal(sum(graph,'agent:nivolumab','nct:NCT01844505'),316);
  assert.equal(sum(graph,'agent:ipilimumab','nct:NCT01844505'),315);
  const other=rows(graph).filter(r=>r.source_refs?.some(s=>s.pmid==='34818112')&&typeof r.n==='number');
  assert.ok(other.length,'the source report remains traceable in the linked contributions');
  assert.ok(other.every(r=>r.study_id==='nct:NCT01844505'));
});

test('adding repeated source rows and an existing report does not increase N',()=>{
  const q=subset(['26027431','35367007']),before=build({registry,normalizations,quantitative:q});
  const repeated=structuredClone(q);
  for(const article of repeated.articles){
    const wrapper=article.records.at(-1);
    wrapper.record.sample_sizes.push(...structuredClone(wrapper.record.sample_sizes));
    wrapper.record.effects.push(...structuredClone(wrapper.record.effects));
    article.records.push(structuredClone(wrapper));
  }
  const after=build({registry,normalizations,quantitative:repeated});
  for(const node of ['agent:nivolumab','agent:ipilimumab','agent:pembrolizumab'])assert.equal(sum(after,node),sum(before,node),node);
});

test('actual CheckMate 064 keeps two disjoint 70-person sequences and creates no concurrent combination',()=>{
  const graph=graphFor(['27269740']),study='nct:NCT01783938';
  assert.equal(sum(graph,'agent:nivolumab',study),0);
  assert.equal(sum(graph,'agent:ipilimumab',study),0);
  assert.equal(graph.nodes.filter(n=>n.type==='combination').length,0);
  assert.equal(graph.comparisons.length,0,'a pure sequence cannot become a complete concurrent comparison endpoint');
});

test('actual nested OR source credits inclusive coverage without manufacturing an AND regimen',()=>{
  const graph=graphFor(['1099501']);
  const manufactured=graph.nodes.filter(n=>n.type==='combination'&&['doxorubicin','lomustine','hydroxyurea'].every(id=>n.components.includes(id)));
  assert.equal(manufactured.length,0);
  for(const node of ['agent:doxorubicin','agent:lomustine','agent:hydroxyurea']){
    assert.equal(sum(graph,node),0,node);
    assert.equal(graph.nodes.find(n=>n.id===node).inclusive_count_summary.known_n,88,node);
    assert.ok(rows(graph).some(c=>c.inclusive_node_ids.includes(node)&&c.inclusive_or_count&&c.alternative_node_ids.includes(node)),node+' remains an explicitly overlapping OR allocation');
  }
});

test('unnamed original cohorts and OR alternatives retain source-bound counts without inventing treatment effects',()=>{
  const graph=graphFor(['32160899','41228313']);
  assert.equal(sum(graph,'agent:nivolumab','cohort:report:32160899'),100);
  const alternatives=rows(graph).filter(c=>c.pmid==='41228313'&&c.inclusive_or_count);
  assert.equal(alternatives.length,1);
  assert.equal(alternatives[0].n,null);assert.equal(alternatives[0].inclusive_n,22);
  assert.deepEqual(alternatives[0].alternative_node_ids,['agent:nivolumab','agent:pembrolizumab']);
  for(const node of alternatives[0].alternative_node_ids)assert.ok(alternatives[0].inclusive_node_ids.includes(node));
  assert.ok(!graph.nodes.some(n=>n.type==='combination'&&n.components.includes('nivolumab')&&n.components.includes('pembrolizumab')));
  assert.ok(!graph.comparisons.some(c=>c.pmid==='41228313'),'mixed alternative treatment arms do not yield invented agent-specific HRs');
});

test('actual multi-registration aggregate counts once and retained child cohorts remain identifiable',()=>{
  const graph=graphFor(['36450385']);
  assert.equal(sum(graph,'agent:nivolumab'),0);
  assert.equal(sum(graph,'agent:ipilimumab'),0);
  assert.equal(graph.nodes.find(n=>n.type==='combination').count_summary.known_n,56);
  const children=rows(graph).filter(c=>c.cohort?.aggregate_parent_root_id);
  assert.deepEqual(children.map(c=>c.available_n).sort((a,b)=>a-b),[16,20,20]);
  assert.equal(children.reduce((n,c)=>n+c.n,0),56,'the exact resolved children add once; incomplete aggregate adds nothing');
  assert.ok(children.every(c=>c.cohort.independently_recruited));
});

test('a source-quoted secondary pooled reanalysis does not create new independent participants',()=>{
  const graph=graphFor(['28662232']);
  assert.equal(sum(graph,'agent:nivolumab'),0);
  assert.equal(graph.comparisons.length,0);
});

test('actual pooled CheckMate program and pooled cross-cancer KEYNOTE report are not new independent trials',()=>{
  const graph=graphFor(['39504507','38838446']);
  assert.equal(sum(graph,'agent:nivolumab'),0);
  assert.equal(sum(graph,'agent:ipilimumab'),0);
  assert.equal(sum(graph,'agent:pembrolizumab'),0);
  assert.ok(rows(graph).every(r=>!/^trial:checkmate$/i.test(r.study_id||'')));
});

test('actual indirect and hybrid external-cohort comparisons cannot become direct arm comparisons or new participant totals',()=>{
  // 39137386 uses RELATIVITY-047 versus CheckMate 067 with IPTW;
  // 36197494 combines CheckMate 238 and EORTC 18071;
  // 41646100 borrows 192 COLUMBUS participants into a 275-person pooled
  // ENCO+BINI reference. Its four extracted HRs use that pooled reference.
  for(const pmid of ['39137386','36197494','41646100']){
    const graph=graphFor([pmid]);
    assert.equal(graph.comparisons.length,0,pmid+' has no direct within-cohort estimate');
    assert.ok(rows(graph).every(c=>c.n===null),pmid+' cannot contribute independent recruited N');
    assert.ok(quantitative.articles.find(a=>a.pmid===pmid).records.some(w=>w.record.effects.length),pmid+' raw effects remain available');
  }
});

test('actual TRAE-conditional treatment effects are held even when the source population is labeled overall',()=>{
  const graph=graphFor(['34452930']);
  assert.equal(graph.comparisons.length,0,'all ten between-arm HRs condition on TRAE presence or absence');
  assert.equal(sum(graph,'agent:nivolumab','nct:NCT02388906'),453);
  assert.equal(sum(graph,'agent:ipilimumab','nct:NCT02388906'),453,'the underlying randomized cohort remains eligible');
});

test('pooling consecutive cohorts inside the same actual trial preserves its identified study without adding overlapping N',()=>{
  const graph=graphFor(['36600653']);
  const combination=graph.nodes.find(n=>n.type==='combination'&&n.components.join(',')==='cyclophosphamide,fludarabine');
  assert.ok(combination,'C-144-01 reports both conditioning agents');
  assert.equal(combination.count_summary.identified_studies,0,'conditioning followed by lifileucel and IL2 is not the exact conditioning-only regimen');
  assert.equal(combination.inclusive_count_summary.identified_studies,1);
  assert.ok(rows(graph).some(c=>c.inclusive_relevant_node_ids.includes(combination.id)&&c.study_id==='nct:NCT02360579'));
  assert.ok(rows(graph).every(c=>c.n===null),'a known trial identity does not establish disjoint pooled denominators');
});

test('actual overall adjusted treatment coefficients and direct observational cohorts remain available',()=>{
  const pmids=['25319807','35220182','31200321','38485189','39435288','42947736'];
  const graph=graphFor(pmids);
  for(const pmid of pmids)assert.ok(graph.comparisons.some(c=>c.pmid===pmid),pmid+' contains a source-supported overall treatment effect');
  const lenvatinib=graph.comparisons.filter(c=>c.pmid==='39435288');
  assert.ok(lenvatinib.some(c=>c.outcome==='PFS'&&c.estimate===0.57&&c.ci_lower===0.36&&c.ci_upper===0.92));
  for(const effect of lenvatinib){
    assert.equal(effect.intervention.label,'Lenvatinib + Pembrolizumab');
    assert.equal(effect.comparator.label,'Carboplatin + Dacarbazine');
  }
});

test('actual nonnested comparisons retain complete opposing regimens, including monotherapy versus combination',()=>{
  const graph=graphFor(['34112708','25399551','30219628','26027431','25891173']);
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  const componentSet=(effect,side)=>nodes.get(effect[side].node_id).components;
  const brain=graph.comparisons.find(c=>c.pmid==='34112708'&&c.estimate===0.44);
  assert.deepEqual(componentSet(brain,'intervention'),['ipilimumab','nivolumab']);
  assert.deepEqual(componentSet(brain,'comparator'),['fotemustine']);
  assert.equal(brain.ci_lower,0.22);assert.equal(brain.ci_upper,0.87);
  for(const effect of graph.comparisons.filter(c=>c.pmid==='25399551')){
    assert.deepEqual(componentSet(effect,'intervention'),['dabrafenib','trametinib']);
    assert.deepEqual(componentSet(effect,'comparator'),['vemurafenib']);
  }
  const columbus=graph.comparisons.find(c=>c.pmid==='30219628');
  assert.deepEqual(componentSet(columbus,'intervention'),['binimetinib','encorafenib']);
  assert.deepEqual(componentSet(columbus,'comparator'),['vemurafenib']);
  assert.ok(graph.comparisons.some(c=>c.pmid==='26027431'&&c.intervention.node_id==='agent:nivolumab'&&c.comparator.node_id==='agent:ipilimumab'&&c.estimate===0.57));
  const keynote006=graph.comparisons.filter(c=>c.pmid==='25891173');
  assert.ok(keynote006.length>1,'distinct dose schedules and endpoints remain source alternatives');
  assert.ok(keynote006.every(c=>c.intervention.node_id==='agent:pembrolizumab'&&c.comparator.node_id==='agent:ipilimumab'));
  assert.equal(new Set(keynote006.map(c=>c.pmid)).size,1,'multiple estimates from one PMID support one publication count');
});

test('actual multi-NCT biomarker publication never merges CheckMate 066 and 067 into one trial',()=>{
  const graph=graphFor(['26027431','34389558']);
  assert.equal(sum(graph,'agent:nivolumab','nct:NCT01844505'),316);
  assert.equal(sum(graph,'agent:ipilimumab','nct:NCT01844505'),315);
  assert.ok(rows(graph).filter(r=>r.n!==null).every(r=>(r.nct_ids||[]).length<=1));
  assert.ok(graph.comparisons.every(c=>c.pmid!=='34389558'),'biomarker contrasts are not treatment comparisons');
});

test('actual HR stays bound to the complete combination versus ipilimumab with its outcome and source tuple',()=>{
  const graph=graphFor(['26027431']);
  const effects=graph.comparisons.filter(c=>c.pmid==='26027431'&&c.outcome==='PFS'&&c.estimate===0.42);
  assert.ok(effects.length);
  for(const effect of effects){
    assert.match(effect.intervention.label,/nivolumab/i);
    assert.match(effect.intervention.label,/ipilimumab/i);
    assert.equal(effect.comparator.node_id,'agent:ipilimumab');
    assert.notEqual(effect.intervention.node_id,'agent:nivolumab');
    assert.equal(effect.ci_lower,0.31);assert.equal(effect.ci_upper,0.57);
    assert.ok([95,99.5].includes(effect.ci_level),'each original source confidence level is retained');
    assert.equal(effect.measure,'HR');
    assert.match(effect.source_url,/26027431/);
    assert.ok(effect.source_refs?.some(s=>s.evidence_ids?.length));
  }
});

test('mixed-tumor publications contribute only their explicit melanoma arm populations',()=>{
  const dabrafenib=graphFor(['22608338']);
  assert.equal(sum(dabrafenib,'agent:dabrafenib'),156,'the mixed-tumor enrollment of 184 is not the melanoma denominator');
  const combination=graphFor(['31961766']);
  assert.equal(sum(combination,'agent:lenvatinib'),0);
  assert.equal(sum(combination,'agent:pembrolizumab'),0);
  assert.equal(combination.nodes.find(n=>n.type==='combination').count_summary.known_n,21,'only the exact combination receives the melanoma denominator');
  assert.equal(sum(graphFor(['27217383']),'agent:abemaciclib'),0,'225 all-solid-tumor participants have no melanoma-specific allocation');
});

test('explicit NSCLC arms cannot create melanoma combination branches or identified-study memberships',()=>{
  const graph=graphFor(['41768125']);
  assert.equal(sum(graph,'agent:abemaciclib','nct:NCT02308020'),23);
  assert.ok(!graph.nodes.some(n=>n.type==='combination'&&n.components.includes('abemaciclib')&&n.components.includes('pemetrexed')));
  for(const id of ['agent:pemetrexed','agent:gemcitabine']){
    const node=graph.nodes.find(n=>n.id===id);
    assert.equal(node.count_summary.identified_studies,0,id);
    assert.equal(node.contribution_ids.length,0,id);
  }
  assert.ok(rows(graph).every(c=>c.source_refs.every(ref=>!ref.arm_id.includes('nsclc'))));
  const fecal=graphFor(['41606121']);
  assert.equal(fecal.nodes.find(n=>n.id==='agent:pembrolizumab').count_summary.identified_studies,0,'the pembrolizumab arm treated NSCLC only');
  assert.equal(fecal.nodes.find(n=>n.id==='agent:nivolumab').count_summary.identified_studies,0,'FMT plus nivolumab and ipilimumab is not nivolumab monotherapy');
});

test('an exact melanoma outcome-arm binding preserves a mixed-parent regimen even when population ancestry is missing',()=>{
  const graph=graphFor(['29358500']);
  const combination=graph.nodes.find(n=>n.type==='combination'&&n.components.includes('pembrolizumab')&&n.components.includes('peginterferon_alfa_2b'));
  assert.ok(combination,'KEYNOTE-029 explicitly reports melanoma response 1/5 in the pembrolizumab plus PEG-IFN arm');
  assert.equal(combination.count_summary.identified_studies,1);
  assert.equal(combination.count_summary.known_n,5,'the source-supported melanoma subgroup can supply partial N when no whole melanoma arm count is available');
  const counted=rows(graph).filter(c=>c.node_ids.includes(combination.id));
  assert.ok(counted.every(c=>c.status==='partial'&&c.count_purpose==='outcome_analysis'),'the partial outcome count is not relabelled as randomized or assigned N');
  assert.ok(rows(graph).some(c=>c.relevant_node_ids.includes(combination.id)&&c.source_refs.some(s=>s.arm_id==='arm_peg')));
});

test('every full-catalogue N reconciles and is bound to an accepted original source count',()=>{
  const graph=actualGraph('all',quantitative.articles.map(a=>a.pmid));
  const records=new Map(quantitative.articles.flatMap(a=>a.records.map(w=>[[a.pmid,w.record.stage,w.record.source_sha256].join('|'),w.record])));
  const clinical=new Map(quantitative.clinical_evidence.articles.map(a=>[a.pmid,a]));
  const evidence=quantitative.clinical_evidence.evidence_registry;
  for(const node of graph.nodes){
    const counted=rows(graph).filter(c=>c.node_ids.includes(node.id));
    if(node.count_summary.known_n!==null)assert.equal(node.count_summary.known_n,counted.reduce((n,c)=>n+c.n,0),node.label);
    assert.equal(node.count_summary.known_n_studies,new Set(counted.map(c=>c.cohort?.independent_group_id||c.cohort?.root_id||c.study_id).filter(Boolean)).size,node.label);
    assert.ok(node.count_summary.known_n_studies<=node.count_summary.identified_studies,node.label);
  }
  for(const contribution of rows(graph).filter(c=>c.n!==null)){
    const ref=contribution.selected_source_ref;
    assert.ok(ref,contribution.id);
    const record=records.get([ref.pmid,ref.stage,ref.source_sha256].join('|'));
    const count=record.sample_sizes.find(s=>s.id===ref.sample_id);
    assert.equal(contribution.n,count.n,contribution.id);
    assert.ok(clinical.get(ref.pmid).sample_size_records.some(s=>s.source_input_sha256===ref.source_sha256&&s.quantitative_record?.id===ref.sample_id),contribution.id+' must remain inside current accepted source scope');
    const population=record.populations.find(p=>p.id===count.population_id);
    assert.notEqual(population.melanoma_only,'no',contribution.id+' cannot allocate a mixed-cancer total');
    assert.ok(ref.evidence_ids.length&&ref.evidence_ids.every(id=>evidence[id]),contribution.id+' has resolvable source anchors');
    assert.ok(!contribution.study_id||/^(?:nct:|trial:|cohort:report:)/.test(contribution.study_id),'each count needs a recognized study/cohort identity');
    if(contribution.study_id?.startsWith('cohort:report:')){
      assert.ok(['internal_original_cohort','internal_cohort_multiple_registrations'].includes(contribution.linkage));
      assert.ok(contribution.cohort?.source_refs?.some(s=>s.evidence_ids?.length),'an internal original-cohort identity retains its source support');
    }
  }
});

test('every displayed full-catalogue effect preserves its original tuple and resolvable evidence',()=>{
  const graph=actualGraph('all',quantitative.articles.map(a=>a.pmid));
  const records=new Map(quantitative.articles.flatMap(a=>a.records.map(w=>[[a.pmid,w.record.stage,w.record.source_sha256].join('|'),w.record])));
  const evidence=quantitative.clinical_evidence.evidence_registry;
  for(const effect of graph.comparisons){
    assert.ok(effect.source_refs.length,effect.id);
    assert.notEqual(effect.intervention.node_id,effect.comparator.node_id,effect.id);
    assert.match(effect.source_url,new RegExp(effect.pmid));
    for(const ref of effect.source_refs){
      const source=records.get([ref.pmid,ref.stage,ref.source_sha256].join('|')).effects.find(e=>e.id===ref.effect_id);
      for(const field of ['estimate','ci_lower','ci_upper','ci_level'])assert.equal(effect[field],typeof source[field]==='number'?source[field]:null,effect.id+' '+field);
      assert.equal(effect.measure,source.measure);assert.equal(effect.outcome,source.endpoint);
      assert.equal(effect.intervention.arm_id,source.intervention_arm_id);assert.equal(effect.comparator.arm_id,source.reference_arm_id);
      assert.ok(ref.evidence_ids.length&&ref.evidence_ids.every(id=>evidence[id]),effect.id+' has resolvable source anchors');
    }
  }
});
