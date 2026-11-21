'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {build,nodeId}=require('../scripts/treatment_map_model.cjs');
const registry=require('../../config/treatment_registry.json');
const A='nivolumab',B='ipilimumab',C='relatlimab';
const leaf=(id,name,extra={})=>({id,kind:'drug',name,children:[],dose:'NA',schedule:'NA',route:'NA',...extra});
function arm(id,names,{operator='AND',population='overall',dose='NA',schedule='NA'}={}){
  return {id,label:names.join(operator==='SEQUENTIAL'?' → ':operator==='OR'?' OR ':' + '),population_id:population,root_id:id+'-root',evidence:['e'],
    nodes:names.length===1?[leaf(id+'-root',names[0],{dose,schedule})]:[
      {id:id+'-root',kind:operator,name:'NA',children:names.map((_,i)=>id+'-'+i),dose:'NA',route:'NA',schedule:'NA'},...names.map((name,i)=>leaf(id+'-'+i,name))]};
}
const count=(id,armId,n,extra={})=>({id,arm_id:armId,n,population_id:'overall',count_purpose:'randomized',complete:'yes',disjoint:'yes',evidence:['e'],...extra});
function record(arms,counts,extra={}){
  return {pmid:'1',stage:'R2',source_sha256:'source1',report_id:'report1',decision:{status:'retain'},
    study:{identifiers:[{id:'NCT00000001'}],name:'NA',randomized:'yes',study_type:'interventional_trial'},
    arms,sample_sizes:counts,populations:[{id:'overall',label:'Melanoma',scope:'overall',parent_id:'NA',melanoma_only:'yes',evidence:['e']}],effects:[],...extra};
}
function graph(records, years={}, evidence={}, calculations={}){
  const byPmid=new Map();for(const r of records){if(!byPmid.has(r.pmid))byPmid.set(r.pmid,[]);byPmid.get(r.pmid).push({record:r,stage:r.stage,calculated_effects:calculations[r.source_sha256]});}
  return build({registry,quantitative:{articles:[...byPmid].map(([pmid,records])=>({pmid,records})),
    clinical_evidence:{articles:[...byPmid].map(([pmid])=>({pmid,current_main_eligible:true,title:'Therapeutic trial',year:years[pmid]||2025})),evidence_registry:evidence}}});
}
const node=(g,id)=>g.nodes.find(n=>n.id==='agent:'+id);
const total=(g,id)=>node(g,id).count_summary.known_n;
const comparison=(extra={})=>({id:'hr',intervention_arm_id:'combo',reference_arm_id:'mono',population_id:'overall',origin:'own_report',
  endpoint:'OS',measure:'HR',estimate:0.75,ci_lower:0.60,ci_upper:0.92,ci_level:95,evidence:['e'],...extra});

test('a calculated binary contrast uses its two original arm rows for direction, planning and the shared population',()=>{
  const lhs={row_id:'x',arm_id:'combo',population_id:'left',numerator:20,denominator:108,percentage:18.5,basis:'reconstructed_counts'};
  const rhs={row_id:'y',arm_id:'mono',population_id:'right',numerator:12,denominator:118,percentage:10.2,basis:'reconstructed_counts'};
  const r=record([arm('mono',[A],{population:'right'}),arm('combo',[A,B],{population:'left'})],[]);
  for(const side of [lhs,rhs])r.populations.push({id:side.population_id,label:side.arm_id,scope:'treatment_arm',parent_id:'overall',melanoma_only:'yes',evidence:['e']});
  r.binary=[lhs,rhs,{...lhs,row_id:'timepoint',percentage:7.5}].map(side=>({id:side.row_id,arm_id:side.arm_id,population_id:side.population_id,
    percentage:side.percentage,origin:'own_report',evidence:['e'],endpoint:'ORR'}));
  const calculation={method:'from_arm_binary_outcomes',intervention:lhs,reference:rhs,outcome_context:{endpoint:'ORR'},interval_method:'log_wald_reconstructed_counts'};
  const effect=comparison({id:'calculated',endpoint:'ORR',measure:'RR',analysis_n:226,estimate:1.821,ci_lower:.935,ci_upper:3.546,calculation});
  const g=graph([r],{},{},{source1:[effect]});
  assert.equal(g.comparisons.length,1);
  const c=g.comparisons[0];assert.equal(c.analysis.sample_size.n,226);assert.equal(c.calculation,calculation);
  assert.deepEqual(c.analysis.planning_assumptions.map(rate=>[rate.arm_role,rate.events,rate.n,rate.provenance]),[
    ['intervention',20,108,'reconstructed_counts'],['comparator',12,118,'reconstructed_counts']]);
  assert.deepEqual(r.effects,[]);
  const wrong={...effect,calculation:{...calculation,intervention:{...lhs,row_id:'nonexistent'}}};
  assert.equal(graph([r],{},{},{source1:[wrong]}).comparisons.length,0);
});

test('catalogue includes every canonical named product; isolated agents have no invented participant total',()=>{
  const g=graph([]);assert.equal(g.nodes.length,registry.products.length+2);assert.equal(node(g,'fecal-microbiota-transplantation').entity_type,'modality');assert.equal(node(g,'radiosurgery').entity_type,'modality');
  for(const p of registry.products){const n=node(g,p.id);assert.ok(n);assert.equal(n.count_summary.known_n,null);assert.equal(n.count_summary.status,'unresolved');assert.equal(n.count_summary.identified_studies,0);assert.equal(n.class_id,p.class_id);}
});

test('exact drug totals exclude combination arms and retain independent study identity',()=>{
  const r=record([arm('mono',[A]),arm('combo',[A,B])],[count('a','mono',80),count('ab','combo',100)]),g=graph([r]);
  assert.equal(total(g,A),80);assert.equal(total(g,B),null);assert.equal(node(g,A).inclusive_count_summary.known_n,180);
  assert.equal(g.nodes.find(n=>n.type==='combination').count_summary.known_n,100);
  assert.equal(node(g,A).count_summary.identified_studies,1);
  const repeated=structuredClone(r);repeated.pmid='2';repeated.source_sha256='followup';repeated.report_id='report2';
  assert.equal(total(graph([r,repeated]),A),80);
});

test('original unnamed cohorts receive internal identities without requiring a trial registry',()=>{
  const a=record([arm('mono',[A])],[count('n','mono',80)],{study:{identifiers:[],name:'CheckMate',randomized:'yes'}});
  const b=structuredClone(a);b.pmid='2';b.source_sha256='source2';b.sample_sizes[0].n=100;
  const g=graph([a,b]);assert.equal(total(g,A),180);assert.equal(node(g,A).count_summary.identified_studies,2);assert.equal(node(g,A).count_summary.unlinked_publications,0);assert.equal(node(g,A).count_summary.status,'calculated');assert.ok(g.contributions.every(c=>c.study_id.startsWith('cohort:report:')));
});

test('randomized denominator wins over ITT, treated, safety and outcome-analysis duplicates',()=>{
  const g=graph([record([arm('mono',[A])],[count('assigned','mono',100),count('itt','mono',100,{count_purpose:'ITT'}),count('treated','mono',97,{count_purpose:'treated'}),count('safe','mono',95,{count_purpose:'safety'}),count('analysis','mono',90,{count_purpose:'outcome_analysis'})])]);
  assert.equal(total(g,A),100);assert.equal(g.contributions.find(c=>c.n===100).selected_source_ref.sample_id,'assigned');
});

test('same-regimen disjoint dose and schedule arms remain separate internally',()=>{
  for(const options of [[{dose:'1 mg/kg'},{dose:'3 mg/kg'}],[{dose:'3 mg/kg',schedule:'every 2 weeks'},{dose:'3 mg/kg',schedule:'every 3 weeks'}]]){
    const g=graph([record([arm('one',[A],options[0]),arm('two',[A],options[1])],[count('n1','one',40),count('n2','two',60)])]);
    assert.equal(total(g,A),100);assert.equal(g.contributions.filter(c=>c.n!==null).length,2);
  }
});

test('documented separately recruited cohorts add and same-regimen unknown overlaps do not',()=>{
  const r=record([arm('one',[A],{population:'cohort-a'}),arm('two',[A],{population:'cohort-b'})],[count('n1','one',40,{population_id:'cohort-a'}),count('n2','two',60,{population_id:'cohort-b'})],{
    populations:[{id:'cohort-a',label:'Independent cohort A',scope:'overall',parent_id:'NA',disjoint:'yes',melanoma_only:'yes'},{id:'cohort-b',label:'Independent cohort B',scope:'overall',parent_id:'NA',disjoint:'yes',melanoma_only:'yes'}]});
  assert.equal(total(graph([r]),A),100);
  r.populations[0].disjoint='NA';r.populations[0].id='overall';r.arms[0].population_id='overall';r.sample_sizes[0].population_id='overall';
  assert.equal(total(graph([r]),A),100,'a documented new nonoverlapping cohort adds to the original overall cohort');
  const unknown=record([arm('one',[A]),arm('two',[A])],[count('n1','one',40,{disjoint:'NA',count_purpose:'enrolled'}),count('n2','two',60,{disjoint:'NA',count_purpose:'enrolled'})],{study:{identifiers:[{id:'NCT00000001'}],randomized:'no'}});
  assert.equal(total(graph([unknown]),A),60);assert.equal(node(graph([unknown]),A).count_summary.status,'partial');
});

test('OR credits inclusive N to each named alternative without creating a concurrent combination',()=>{
  const g=graph([record([arm('alternatives',[A,B],{operator:'OR'})],[count('n','alternatives',100)])]);
  assert.equal(g.nodes.filter(n=>n.type==='combination').length,0);
  for(const id of [A,B]){assert.equal(total(g,id),null);assert.equal(node(g,id).count_summary.identified_studies,0);assert.equal(node(g,id).inclusive_count_summary.known_n,100);}assert.ok(g.contributions[0].inclusive_or);assert.match(g.contributions[0].note,/Inclusive OR allocation/);
});

test('A + (B OR C) keeps certainty separate from inclusive named-alternative coverage',()=>{
  const a=arm('mixed',[A,B,C]);a.nodes[0].children=['mixed-0','alternatives'];a.nodes.push({id:'alternatives',kind:'OR',name:'NA',children:['mixed-1','mixed-2']});
  const g=graph([record([a],[count('n','mixed',100)])]);assert.equal(total(g,A),null);assert.equal(total(g,B),null);assert.equal(total(g,C),null);assert.equal(node(g,A).inclusive_count_summary.known_n,100);assert.equal(g.nodes.filter(n=>n.type==='combination').length,0);assert.deepEqual(g.contributions[0].certain_node_ids,['agent:'+A]);
});

test('dose-only alternatives of the same product preserve the complete concurrent composition',()=>{
  const a=arm('dose-options',[A,B,B]);a.nodes[0].children=['dose-options-0','alternatives'];
  a.nodes[2].dose='1 mg/kg';a.nodes[3].dose='3 mg/kg';a.nodes.push({id:'alternatives',kind:'OR',name:'NA',children:['dose-options-1','dose-options-2']});
  const g=graph([record([a],[count('n','dose-options',100)])]),combo=g.nodes.find(n=>n.type==='combination');
  assert.ok(combo);assert.deepEqual(combo.components,[B,A].sort());assert.equal(combo.count_summary.known_n,100);
  assert.equal(total(g,A),null);assert.equal(total(g,B),null);assert.equal(g.contributions.filter(c=>c.n!==null).length,1,'dose alternatives do not become two participant groups');
});

test('sequences preserve ordered distinct arms without becoming concurrent combinations',()=>{
  const g=graph([record([arm('forward',[A,B],{operator:'SEQUENTIAL'}),arm('reverse',[B,A],{operator:'SEQUENTIAL'})],[count('n1','forward',70),count('n2','reverse',70)])]);
  assert.equal(total(g,A),null);assert.equal(total(g,B),null);assert.equal(node(g,A).inclusive_count_summary.known_n,140);assert.equal(g.nodes.filter(n=>n.type==='combination').length,0);
});

test('meaningful unspecified or procedure components block incomplete combination nodes',()=>{
  for(const name of ['anti-PD-1 therapy','surgery','unknown experimental treatment']){
    const g=graph([record([arm('incomplete',[A,B,name])],[count('n','incomplete',100)])]);assert.equal(g.nodes.filter(n=>n.type==='combination').length,0,name);
  }
});

test('order-independent observed subsets retain all valid parents and only direct evidence adds arrows',()=>{
  const g=graph([record([arm('ab',[B,A]),arm('abc',[C,A,B]),arm('mono',[A])],[count('abn','ab',50),count('abcn','abc',60),count('an','mono',40)])]);
  const ab=g.nodes.find(n=>n.id===nodeId([A,B].sort())),abc=g.nodes.find(n=>n.components.length===3);
  assert.ok(ab);assert.equal(abc.overview_parent_id,ab.id);assert.ok(abc.parent_ids.includes('agent:'+C));assert.ok(abc.parent_ids.includes(ab.id));
  assert.equal(ab.count_summary.known_n,50);assert.equal(abc.count_summary.known_n,60);assert.equal(total(g,A),40);assert.equal(total(g,B),null);
  assert.deepEqual(g.study_memberships.filter(m=>m.node_id===ab.id).flatMap(m=>m.source_bindings.flatMap(b=>b.arm_ids)),['ab']);
  assert.ok(g.relationships.every(e=>!e.documented_add_on));
});

test('FMT is searchable as a microbiome modality and only concurrent regimens become combination nodes',()=>{
  const fmt='fecal-microbiota-transplantation';
  const evidence=graph([record([
    arm('combo',['faecal microbiome transplant','pembrolizumab']),
    arm('seq',['FMT','nivolumab'],{operator:'SEQUENTIAL'}),
    arm('not-treatment',['stool microbiome sequencing'])
  ],[count('n-combo','combo',15),count('n-seq','seq',20),count('samples','not-treatment',40)])]);
  assert.equal(node(evidence,fmt).broad_category,'microbiome-therapies');
  assert.ok(node(evidence,fmt).aliases.includes('FMT'));
  assert.equal(evidence.nodes.find(n=>n.id===nodeId([fmt,'pembrolizumab'])).count_summary.known_n,15);
  assert.equal(evidence.nodes.some(n=>n.id===nodeId([fmt,'nivolumab'])),false);
  assert.equal(total(evidence,fmt),null);
});

test('radiosurgery is an exact radiotherapy modality; unexplained SRS abbreviations are not expanded',()=>{
  const canonical=graph([record([arm('srs',['stereotactic radiosurgery']),arm('combination',[A,'stereotactic radiosurgery'])],[count('srs-n','srs',30),count('combo-n','combination',40)])]);
  assert.equal(total(canonical,'radiosurgery'),30);assert.equal(total(canonical,A),null);
  assert.equal(node(canonical,'radiosurgery').class_id,'radiotherapy');
  assert.equal(canonical.nodes.find(n=>n.type==='combination').count_summary.known_n,40);
  const ambiguous=graph([record([arm('srs',[A,'SRS'])],[count('n','srs',40)])]);
  assert.equal(total(ambiguous,A),null);assert.equal(total(ambiguous,'radiosurgery'),null);assert.equal(ambiguous.nodes.filter(n=>n.type==='combination').length,0);
});

test('direct effect endpoints remain complete arms with original outcome/CI and an add-on arrow',()=>{
  const r=record([arm('mono',[A]),arm('combo',[A,B])],[count('a','mono',80),count('ab','combo',100)],{effects:[comparison()]}),g=graph([r]);
  assert.equal(g.comparisons.length,1);const c=g.comparisons[0];assert.equal(c.intervention.node_id,nodeId([A,B].sort()));assert.equal(c.comparator.node_id,'agent:'+A);
  assert.equal(c.outcome,'OS');assert.equal(c.ci_level,95);assert.equal(c.estimate,0.75);assert.equal(c.source_refs[0].effect_id,'hr');assert.ok(g.relationships.some(e=>e.documented_add_on));
});

test('indirect wording variants exclude borrowed denominators and effects while preserving source review',()=>{
  for(const name of ['Indirect comparison','Indirect treatment comparison','Propensity weighted indirect treatment comparison','Matching-adjusted indirect comparison','Matching-adjusted indirect-treatment-comparison','MAIC','Pooled analysis','Systematic literature review','Network meta-analysis']){
    const r=record([arm('mono',[A]),arm('combo',[A,B])],[count('a','mono',80),count('ab','combo',100)],{study:{identifiers:[],name,randomized:'no',study_type:'observational'},effects:[comparison()]});
    const g=graph([r]);assert.equal(g.comparisons.length,0,name);assert.equal(total(g,A),null,name);assert.equal(total(g,B),null,name);
    assert.ok(g.review.items.some(i=>i.effect_id==='hr'&&i.reason==='pooled_or_indirect_report'),name);
    assert.ok(g.contributions.some(c=>c.excluded_samples.some(s=>s.reason.includes('Pooled or indirect report'))),name);
  }
});

test('source-bound hybrid trial and external-cohort design applies across that publication without excluding ordinary observational comparisons',()=>{
  const r2=record([arm('mono',[A]),arm('combo',[A,B])],[count('a','mono',80),count('ab','combo',100)],{study:{identifiers:[],name:'NA',randomized:'no',study_type:'observational'},effects:[comparison()]});
  const r3={...structuredClone(r2),stage:'R3',source_sha256:'fulltext',study_details:{design_description:'Hybrid comparative effectiveness study using a randomized trial arm and real-world treatment cohorts',evidence:['e']}};
  const g=graph([r2,r3]);assert.equal(g.comparisons.length,0);assert.equal(total(g,A),null);assert.equal(node(g,A).count_summary.identified_studies,0);
  assert.ok(g.review.items.some(i=>i.stage==='R2'&&i.design_flag==='hybrid_trial_external_cohort'));
  const direct=graph([r2]);assert.equal(direct.comparisons.length,1);assert.equal(total(direct,A),80,'ordinary source-resolved comparative cohorts are not excluded merely for observational design');
});

test('pooled cohorts within one source-identified original trial retain that trial identity without adding pooled N',()=>{
  const r=record([arm('mono',[A])],[count('n','mono',100)],{
    study_details:{design_description:'Prospective interventional study; pooled analysis of sequential cohorts 2 and 4',evidence:['e']}});
  const g=graph([r]);assert.equal(node(g,A).count_summary.identified_studies,1);assert.equal(total(g,A),null);
  assert.equal(g.contributions[0].study_id,'nct:NCT00000001');assert.equal(g.contributions[0].excluded_samples[0].n,100);
});

test('conditional adverse-event estimates do not become overall effects while trial Ns and adjusted overall effects remain',()=>{
  const model='Cox model with treatment, time-varying TRAE indicator and interaction; adjusted for age and sex';
  const effects=[comparison({id:'before',endpoint_definition:'RFS HR among patients without or before a select TRAE',model}),
    comparison({id:'after',endpoint_definition:'RFS HR after onset of select TRAEs',model}),
    comparison({id:'adjusted-overall',endpoint_definition:'Overall recurrence-free survival',model})];
  const g=graph([record([arm('mono',[A]),arm('combo',[A,B])],[count('a','mono',80),count('ab','combo',100)],{effects})]);
  assert.deepEqual(g.comparisons.map(c=>c.source_refs[0].effect_id),['adjusted-overall']);assert.equal(total(g,A),80);
  assert.equal(g.review.items.filter(i=>i.reason==='conditional_subgroup_effect').length,2);
});

test('default comparison prefers randomized and newer supported reports, never the most favorable effect',()=>{
  const original=record([arm('mono',[A]),arm('combo',[A,B])],[],{effects:[comparison()]});
  const newer=structuredClone(original);newer.pmid='2';newer.stage='R3';newer.source_sha256='newer';newer.effects=[comparison({estimate:1.2,ci_lower:1,ci_upper:1.4})];
  const observational=structuredClone(original);observational.pmid='3';observational.source_sha256='observational';observational.study.randomized='no';observational.effects=[comparison({estimate:0.2,ci_lower:0.1,ci_upper:0.3})];
  const g=graph([observational,original,newer],{'1':2020,'2':2024,'3':2026});
  assert.equal(g.comparisons[0].pmid,'2');assert.equal(g.comparisons[0].estimate,1.2);
});

test('invalid, subgroup, unresolved-direction and dose-collapsed self comparisons are retained only for review',()=>{
  const r=record([arm('mono',[A]),arm('combo',[A,B])],[count('a','mono',80),count('ab','combo',100)],{effects:[comparison({estimate:'Review needed'}),comparison({id:'missing',reference_arm_id:'missing'}),comparison({id:'badci',ci_lower:0.90})]});
  assert.equal(graph([r]).comparisons.length,0);
  r.arms[1]=arm('combo',[A],{dose:'3 mg/kg'});r.effects=[comparison()];assert.equal(graph([r]).comparisons.length,0);
});

test('mixed-cancer whole-arm N is withheld; explicitly arm-bound melanoma allocation can be counted',()=>{
  const r=record([arm('mono',[A])],[count('all','mono',200,{count_purpose:'enrolled'}),count('mel','mono',30,{population_id:'melanoma',count_purpose:'enrolled'})],{
    study:{identifiers:[{id:'NCT00000001'}],randomized:'no'},populations:[{id:'overall',label:'Solid tumors',scope:'overall',parent_id:'NA',melanoma_only:'no'},{id:'melanoma',label:'Melanoma',scope:'subgroup',parent_id:'overall',melanoma_only:'yes'}]});
  assert.equal(total(graph([r]),A),30);r.sample_sizes.pop();assert.equal(total(graph([r]),A),null);
});

test('an explicit nonmelanoma arm cannot create a combination or study membership from another arm melanoma cohort',()=>{
  const r=record([arm('melanoma',[A],{population:'melanoma'}),arm('other',[B,C],{population:'nsclc'})],
    [count('mel','melanoma',30,{population_id:'melanoma'}),count('lung','other',100,{population_id:'nsclc'})],{
      populations:[{id:'melanoma',label:'Melanoma',scope:'overall',parent_id:'NA',melanoma_only:'yes'},
        {id:'nsclc',label:'Non-small cell lung cancer',scope:'overall',parent_id:'NA',melanoma_only:'no'}]});
  const g=graph([r]);assert.equal(total(g,A),30);assert.equal(g.nodes.filter(n=>n.type==='combination').length,0);
  for(const id of [B,C]){assert.equal(total(g,id),null);assert.equal(node(g,id).count_summary.identified_studies,0);}
  assert.ok(g.review.items.some(r=>r.reason==='arm_without_source_bound_melanoma_population'&&r.arm_id==='other'));
});

test('original multi-registration report retains its cohort without inventing an NCT allocation',()=>{
  const g=graph([record([arm('mono',[A])],[count('n','mono',100)],{study:{identifiers:[{id:'NCT00000001'},{id:'NCT00000002'}],randomized:'yes'}})]);
  assert.equal(total(g,A),100);assert.equal(node(g,A).count_summary.identified_studies,1);assert.equal(g.contributions[0].linkage,'internal_cohort_multiple_registrations');assert.equal(g.contributions[0].study_id,'cohort:report:1');
});

test('each displayed N reconciles exactly with the source-bound counted arms',()=>{
  const g=graph([record([arm('mono',[A]),arm('combo',[A,B])],[count('a','mono',80),count('ab','combo',100)])]);
  for(const n of g.nodes){const sum=g.contributions.filter(c=>c.node_ids.includes(n.id)).reduce((sum,c)=>sum+c.n,0);assert.equal(n.count_summary.known_n??0,sum);}
});

test('source-bound subgroup effects share a recruitment root with overall effects even when arms belong to the parent',()=>{
  const r=record([arm('mono',[A]),arm('combo',[A,B])],[],{effects:[comparison(),comparison({id:'stage3hr',population_id:'stage3',analysis_n:60})]});
  r.populations.push({id:'stage3',label:'Stage III melanoma',scope:'subgroup',parent_id:'overall',melanoma_only:'yes',evidence:['e']});
  const g=graph([r]),all=g.comparisons.find(x=>x.source_refs[0].effect_id==='hr'),sub=g.comparisons.find(x=>x.source_refs[0].effect_id==='stage3hr');
  assert.equal(g.comparisons.length,2);assert.equal(sub.analysis.cohort.is_subgroup,true);
  assert.equal(sub.analysis.cohort.root_id,all.analysis.cohort.root_id);assert.equal(sub.analysis.cohort.parent_id,all.analysis.cohort.id);
  assert.deepEqual(sub.analysis.cohort.filter_equivalence_keys,['stage']);assert.equal(sub.analysis.sample_size.n,60);
  assert.equal(all.analysis.sample_size.n,null,'missing N alone does not remove an otherwise supported HR');
  assert.equal(all.analysis.independence_verified,true);
  r.populations[1].label='Stage III and PD-L1-positive melanoma';
  assert.deepEqual(graph([r]).comparisons.find(x=>x.source_refs[0].effect_id==='stage3hr').analysis.cohort.filter_equivalence_keys,[],'a six-field filter cannot erase an additional subgroup restriction');
});

test('subgroup-only counts are partial fallbacks and overlapping subgroups are never added to their parent',()=>{
  const r=record([arm('mono',[A])],[count('parent','mono',100),count('sub1','mono',30,{population_id:'sub1',count_purpose:'outcome_analysis'}),count('sub2','mono',20,{population_id:'sub2',count_purpose:'outcome_analysis'})]);
  for(const id of ['sub1','sub2'])r.populations.push({id,label:id,scope:'subgroup',parent_id:'overall',melanoma_only:'yes',evidence:['e']});
  let g=graph([r]);assert.equal(total(g,A),100);assert.equal(g.contributions.filter(c=>c.node_ids.includes('agent:'+A)).length,1);
  r.sample_sizes.shift();g=graph([r]);assert.equal(total(g,A),30);assert.equal(node(g,A).count_summary.status,'partial');
  assert.ok(g.contributions.find(c=>c.n===30).cohort.is_subgroup);
});

test('same-paper R2 and R3 missing-registration cohorts use one internal identity and largest supported N',()=>{
  const r2=record([arm('mono',[A])],[count('n','mono',80)],{study:{identifiers:[],name:'NA',study_type:'observational',randomized:'no'}});
  const r3=structuredClone(r2);r3.stage='R3';r3.source_sha256='full';r3.sample_sizes[0].n=100;
  const g=graph([r2,r3]);assert.equal(total(g,A),100);assert.equal(node(g,A).count_summary.identified_studies,1);
  assert.equal(g.contributions.filter(c=>c.n!==null).length,1);assert.equal(g.contributions.find(c=>c.n!==null).selected_source_ref.stage,'R3');
});

test('subgroup comparison population cannot bind to an unrelated arm population',()=>{
  const r=record([arm('mono',[A]),arm('combo',[A,B])],[],{effects:[comparison({population_id:'other'})]});
  r.populations.push({id:'other',label:'Different recruited population',scope:'subgroup',parent_id:'NA',melanoma_only:'yes',evidence:['e']});
  const g=graph([r]);assert.equal(g.comparisons.length,0);assert.ok(g.review.items.some(x=>x.reason==='comparison_population_mismatch'));
});


test('aggregate populations and independently recruited child cohorts are not added twice',()=>{
  const r=record([arm('all',[A]),arm('a',[A],{population:'a'}),arm('b',[A],{population:'b'})],[count('all-n','all',56),count('a-n','a',40,{population_id:'a'}),count('b-n','b',16,{population_id:'b'})]);
  for(const [id,n] of [['a',40],['b',16]])r.populations.push({id,label:'Independent cohort '+id,scope:'subgroup',parent_id:'overall',disjoint:'yes',melanoma_only:'yes',evidence:['e']});
  let g=graph([r]);assert.equal(total(g,A),56);assert.equal(g.contributions.filter(c=>c.node_ids.includes('agent:'+A)).length,1);
  const parent=g.contributions.find(c=>c.n===56);assert.ok(g.contributions.filter(c=>c.cohort.independently_recruited).every(c=>c.cohort.aggregate_parent_root_id===parent.cohort.root_id));
  r.sample_sizes.shift();g=graph([r]);assert.equal(total(g,A),56);assert.equal(g.contributions.filter(c=>c.node_ids.includes('agent:'+A)).length,2);
});

test('quoted secondary pooled methods do not become a new original cohort',()=>{
  const r=record([arm('mono',[A])],[count('n','mono',526)],{study:{study_type:'observational',identifiers:[{id:'NCT00000001'},{id:'NCT00000002'}],evidence:['e']}});
  const g=graph([r],{},{e:{supporting_quote:'Pooled, retrospective analysis of data from phase 3 trials.'}});
  assert.equal(total(g,A),null);assert.ok(g.contributions.every(c=>!c.study_id));assert.equal(g.comparisons.length,0);
});

test('unallocated follow-up dose records retain provenance without adding their N twice',()=>{
  const a=record([arm('one',[A],{dose:'1 mg/kg'}),arm('two',[A],{dose:'3 mg/kg'})],[count('n1','one',40),count('n2','two',60)]);
  const b=record([arm('all',[A])],[count('n-all','all',100,{count_purpose:'outcome_analysis',disjoint:'NA'})],{pmid:'2',source_sha256:'followup'});
  const g=graph([a,b]);assert.equal(total(g,A),100);const follow=g.contributions.find(c=>c.source_refs.some(x=>x.pmid==='2'));assert.ok(follow);assert.equal(follow.available_n,100);assert.equal(follow.node_ids.length,0);
});

test('MM1636 matched subsets retain cohort A lineage rather than becoming external controls',()=>{
  const {create}=require('../scripts/treatment_map_cohorts.cjs');
  const a={id:'a',label:'MM1636 cohort A',scope:'overall',parent_id:'NA',evidence:['a']};
  const sub={id:'matched',label:'MM1636 patients with exact matches to DAMMED controls',scope:'subgroup',parent_id:'a',evidence:['matched']};
  const b={id:'b',label:'Cohort B: progression during anti-PD-1',scope:'overall',parent_id:'NA',evidence:['b']};
  const source={pmid:'x',record:{stage:'R3',source_sha256:'full',study:{},populations:[a,sub,b]}};
  const resolver=create([source],{quote:()=> 'MM1636 cohort A; cohort B progression during anti-PD-1; matched DAMMED controls',anchored:()=>true,refs:(_,ids)=>ids}),identity={study_id:'nct:NCT03047928'};
  const ca=resolver.describe(source,a,identity),cs=resolver.describe(source,sub,identity),cb=resolver.describe(source,b,identity);
  assert.equal(cs.root_id,ca.root_id);assert.equal(cs.is_subgroup,true);assert.notEqual(cb.root_id,ca.root_id);assert.equal(cb.aggregate_parent_root_id,null);
});

test('named populations in a multi-trial follow-up resolve to their existing registrations',()=>{
  const one=record([arm('one',[A])],[count('a','one',100)],{pmid:'1',study:{identifiers:[{id:'NCT01721772'}],name:'CheckMate 066',randomized:'yes'}});
  const two=record([arm('two',[B])],[count('b','two',90)],{pmid:'2',source_sha256:'two',study:{identifiers:[{id:'NCT01844505'}],name:'CheckMate 067',randomized:'yes'}});
  const follow=record([arm('one',[A],{population:'p66'}),arm('two',[B],{population:'p67'})],[count('a','one',80,{population_id:'p66'}),count('b','two',70,{population_id:'p67'})],{pmid:'3',source_sha256:'follow',study:{identifiers:[{id:'NCT01721772'},{id:'NCT01844505'}],name:'NA',study_type:'observational'},populations:[{id:'p66',label:'CheckMate 066 treated cohort',scope:'overall',melanoma_only:'yes'},{id:'p67',label:'CheckMate 067 treated cohort',scope:'overall',melanoma_only:'yes'}]});
  const g=graph([one,two,follow]);assert.equal(total(g,A),100);assert.equal(total(g,B),90);assert.ok(g.contributions.filter(c=>c.publication_ids.includes('3')).every(c=>c.study_id.startsWith('nct:')));
});

test('comma-separated explicit name/registration pairs bind multi-trial source populations',()=>{
  const r=record([arm('one',[A],{population:'one'}),arm('two',[B],{population:'two'})],[count('a','one',20,{population_id:'one'}),count('b','two',30,{population_id:'two'})],{study:{identifiers:[{id:'NCT00000001'},{id:'NCT00000002'}],evidence:['e']},populations:[{id:'one',label:'BREAK-2 population',scope:'overall',melanoma_only:'yes'},{id:'two',label:'BREAK-3 population',scope:'overall',melanoma_only:'yes'}]});
  const g=graph([r],{},{e:{supporting_quote:'Trial registration: (BREAK-2, NCT00000001; BREAK-3, NCT00000002).'}});assert.deepEqual([...new Set(g.contributions.map(c=>c.study_id))].sort(),['nct:NCT00000001','nct:NCT00000002']);
});

test('PRADO and original OpACIN-neo remain distinct, while a named PRADO follow-up stays in PRADO',()=>{
  const {create}=require('../scripts/treatment_map_cohorts.cjs');
  const make=(pmid,title,name,label)=>({pmid,article:{title},record:{stage:'R2',source_sha256:pmid,study:{name,evidence:['e']},populations:[{id:'p',label,scope:'overall',parent_id:'NA',evidence:['e']}]}});
  const a=make('a','PRADO trial','PRADO','Stage III melanoma'),b=make('b','OpACIN-neo trial','OpACIN-neo','Stage III melanoma'),c=make('c','Five-year results from the PRADO-trial','NA','Stage III macroscopic melanoma');
  const resolver=create([a,b,c],{quote:()=> 'The PRADO extension cohort of the OpACIN-neo trial; two independent cohorts.',anchored:()=>true,refs:(_,ids)=>ids}),identity={study_id:'nct:NCT02977052'};
  const ca=resolver.describe(a,a.record.populations[0],identity),cb=resolver.describe(b,b.record.populations[0],identity),cc=resolver.describe(c,c.record.populations[0],identity);
  assert.notEqual(ca.root_id,cb.root_id);assert.equal(ca.root_id,cc.root_id);assert.ok(ca.independently_recruited&&cb.independently_recruited);
});
