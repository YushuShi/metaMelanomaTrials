'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const browse=require('../dist/treatment_node_studies.js'),charts=require('../dist/app.js');
const binding={pmid:'10',report_id:'report10',task_id:'review-1',stage:'R3',source_input_sha256:'source',review_binding_sha256:'accepted',arm_ids:['a'],population_ids:['p'],result_ids:['comparison','a-only'],sample_ids:['n-a']};
const result=(id,q,review='accepted')=>({scope:'observed',report_id:'report10',result_id:id,source_input_sha256:'source',review_binding_sha256:review,quantitative_record:{id,...q}});
const raw=(task,id,estimate)=>({task_id:task,record:{stage:'R3',report_id:'report10',source_sha256:'source',arms:[{id:'a'},{id:'ab'},{id:'other'}],populations:[{id:'p'},{id:'unrelated'}],sample_sizes:[{id:'n-a',arm_id:'a',n:10},{id:'n-ab',arm_id:'ab',n:99}],effects:[{id,estimate}],survival:[{id:'a-only'},{id:'ab-only'}],binary:[]}});
const study={pmid:'10',report_id:'report10',title:'Same paper, different arms',comparisons:[{comparison_id:'ca',result_ids:['comparison'],scope:{...binding},intervention_arm_id:'a',comparator_arm_id:'ab'},{comparison_id:'cab',result_ids:['ab-only'],scope:{...binding},outcome_arm_id:'ab'}],details:{quantitative_results:[result('comparison',{intervention_arm_id:'a',reference_arm_id:'ab',population_id:'p',estimate:.7}),result('a-only',{arm_id:'a',population_id:'p'}),result('ab-only',{arm_id:'ab',population_id:'p'}),result('comparison',{intervention_arm_id:'a',reference_arm_id:'ab',estimate:9},'other-review')],sample_size_records:[{...result('na',{id:'n-a'}),sample_record_id:'n-a'},{...result('nab',{id:'n-ab'}),sample_record_id:'n-ab'}],canonical_result_groups:[{member_result_ids:['comparison','ab-only'],representative_result_id:'ab-only'}],quantitative_extraction:[raw('review-1','comparison',.7),raw('review-2','comparison',9)]}};
test('exact membership keeps matching arm and comparative results but excludes same-paper other-arm outcomes and other reviews',()=>{
 const before=JSON.stringify(study),shown=browse.subsetStudy(study,[binding]);
 assert.deepEqual(shown.details.quantitative_results.map(r=>r.result_id),['comparison','a-only']);assert.deepEqual(shown.comparisons.map(c=>c.comparison_id),['ca']);
 assert.deepEqual(shown.details.sample_size_records.map(s=>s.sample_record_id),['n-a']);
 assert.equal(shown.details.quantitative_extraction.length,1);assert.equal(shown.details.quantitative_extraction[0].task_id,'review-1');
 assert.deepEqual(shown.details.quantitative_extraction[0].record.arms.map(a=>a.id),['a','ab'],'opponent arm context is kept for the comparative result');
 assert.deepEqual(shown.details.quantitative_extraction[0].record.sample_sizes.map(a=>a.id),['n-a']);assert.equal(shown.details.quantitative_extraction[0].record.effects[0].estimate,.7);
 assert.equal(shown.details.canonical_result_groups[0].representative_result_id,'comparison');assert.equal(JSON.stringify(study),before);
});
test('a raw wrapper cannot bind by source hash alone or reuse another report or task locator',()=>{
 for(const change of [{task_id:null},{task_id:'missing'},{report_id:'other'},{stage:'R2'}])assert.equal(browse.subsetStudy(study,[{...binding,...change}]).details.quantitative_extraction.length,0);
 assert.equal(browse.sourceMatches(study.details.quantitative_results[0],{...binding,review_binding_sha256:null}),false);
});
const node={id:'agent:a',label:'Agent A'};
const member=(id,pmid,n,eligible=true)=>({id,node_id:node.id,pmid,study_id:'trial-a',cohort_id:'cohort-a',sample_n:n,population:'Overall cohort',title:'Report '+pmid,year:2024,independent_cohort_count_eligible:eligible,source_bindings:[]});
const fallbackApi={...charts,studyTablePresentationRows:()=>[],studyResults:()=>[]};
test('all exact reports remain visible, including missing N and unresolved independent identity; follow-ups count once',()=>{
 const rows=browse.matches([], [member('m1','10',10),member('m2','11',null),{...member('m3','12',20,false),study_id:'held'}, {...member('other','13',90),node_id:'regimen:ab'}],node,fallbackApi);
 assert.equal(rows.length,3);assert.deepEqual([...browse.independentStudyIds(rows)],['trial-a']);assert.equal(rows[0].related_report_count,2);assert.equal(rows[1].presentation_rows[0].exact_membership.sample_n,null);
 const csv=charts.studyTableCSV(rows,{include_missing_n:true});assert.match(csv,/Unavailable/);assert.match(csv,/Report 10/);assert.match(csv,/Report 11/);assert.match(csv,/Report 12/);assert.doesNotMatch(csv,/Report 13/);
});
test('a map-validated exact modality regimen supplies unresolved labels without mutating source definitions',()=>{
 const selected={...node,id:'srs-a',label:'Agent A + Radiosurgery'},b={...binding},co={scope:{...binding},intervention_arm_id:'a',comparator_arm_id:'ab'},original={...study,comparisons:[co]},row={comparisons:[co],results:[],intervention_label:'Unresolved SRS',comparator_label:'Unresolved SRS',intervention_definition:{old:true},comparator_definition:{old:true}};
 const ms=[{...member('srs','10',10),node_id:selected.id,canonical_regimen:{label:selected.label},source_bindings:[b]},{...member('opp','10',20),node_id:'srs-b',canonical_regimen:{label:'Agent B + Radiosurgery'},source_bindings:[{...b,arm_ids:['ab']}]}];
 const api={studyResults:()=>[],studyTablePresentationRows:()=>[row],regimenDescription:()=>({known:false})};
 const shown=browse.matches([original],ms,selected,api,{regimenMemberships:ms})[0].presentation_rows[0];
 assert.equal(shown.intervention_label,'Agent A + Radiosurgery');assert.equal(shown.comparator_label,'Agent B + Radiosurgery');assert.equal(shown.is_add_on,false);assert.equal(row.intervention_label,'Unresolved SRS');
});


test('counterpart arm Ns are copied only from the identical source comparison presentation, without its standalone outcomes',()=>{
 const row={results:[{result_id:'effect-A-B'}],comparisons:[{comparison_id:'source-A-B'}]},source={...row,results:[...row.results,{result_id:'B-only'}],paired_arm_context:true,comparator_n:45,intervention_n:35,comparator_arm_id:'B',intervention_arm_id:'A',total_n:80};
 const shown=browse.counterpartCounts(row,[source]);assert.equal(shown.comparator_n,45);assert.equal(shown.intervention_n,35);assert.deepEqual(shown.results,row.results);
 assert.deepEqual(browse.counterpartCounts(row,[{...source,comparisons:[{comparison_id:'other-review'}]}]),row);
 assert.deepEqual(browse.counterpartCounts(row,[source,{...source,comparator_n:90}]),row);
});


test('an exact arm-only outcome cannot inherit the opposite treatment label from the study comparison',()=>{
 const co={comparison_id:'scope-a',scope:{...binding},intervention_arm_id:'ab',comparator_arm_id:'a',outcome_arm_id:'a'},r=result('a-only',{arm_id:'a',population_id:'p'}),s={...study,comparisons:[co]},sourceRow={comparisons:[co],results:[r],comparator_label:'Agent A',intervention_label:'Agent A + B'};
 const membership={...member('ma','10',10),canonical_regimen:{node_id:node.id,label:node.label},source_bindings:[binding]};
 const api={studyResults:()=>[r],studyTablePresentationRows:()=>[sourceRow],regimenDescription:()=>({known:true,simple_concurrent:true})};
 const shown=browse.matches([s],[membership],node,api)[0].presentation_rows[0];assert.equal(shown.comparator_label,'—');assert.equal(shown.intervention_label,'Agent A');assert.equal(shown.is_add_on,false);assert.equal(shown.results[0].result_id,'a-only');assert.equal(sourceRow.intervention_label,'Agent A + B');
});

test('endpoint selection keeps only matching hazard ratios and counts their source-bound cohorts',()=>{
  const number=(value,unit='ratio')=>({status:'reported',value,raw_text:String(value),unit});
  const numericalResult=(id,endpoint,measure='HR')=>({
    result_id:id,report_id:'report10',comparison_id:'clinical-comparison',
    source_input_sha256:'source',review_binding_sha256:'accepted',
    endpoint:{family:endpoint},measure,main_result_eligible:true,
    estimate:number(measure==='HR'?.8:12,measure==='HR'?'ratio':'months'),
    ci_lower:number(.6),ci_upper:number(1.1),confidence_level:number(95,'%')
  });
  const first={
    pmid:'10',report_id:'report10',title:'Multiple endpoints and cohorts',default_visible:true,
    comparisons:[{comparison_id:'clinical-comparison',kind:'treatment_comparison',
      comparator_label:'Ipilimumab',intervention_label:'Nivolumab',
      result_ids:['os','pfs','median-os','opposing-combination-os']}],
    details:{quantitative_results:[numericalResult('os','overall_survival'),
      numericalResult('pfs','progression_free_survival'),numericalResult('median-os','overall_survival','median'),
      numericalResult('opposing-combination-os','overall_survival')]}
  };
  const second={...first,pmid:'11',report_id:'report11',title:'PFS-only report',
    details:{quantitative_results:[{...numericalResult('pfs-only','progression_free_survival'),report_id:'report11'}]},
    comparisons:[{...first.comparisons[0],result_ids:['pfs-only']}]};
  const memberships=[
    {...member('os-member','10',null),study_id:'os-cohort',source_bindings:[{...binding,result_ids:['os','median-os']}]},
    {...member('pfs-member','10',null),study_id:'pfs-cohort',source_bindings:[{...binding,result_ids:['pfs']}]},
    {...member('other-report','11',null),study_id:'other-cohort',source_bindings:[{...binding,report_id:'report11',result_ids:['pfs-only']}]}
  ];
  const before=JSON.stringify([first,second,memberships]);
  const all=browse.matches([first,second],memberships,node,charts);
  assert.equal(all.length,2);
  assert.deepEqual(all[0].results.map(row=>row.result_id),['os','pfs','median-os']);
  const selected=browse.matches([first,second],memberships,node,charts,{endpoint:'overall_survival'});
  assert.equal(selected.length,1);
  assert.deepEqual(selected[0].results.map(row=>row.result_id),['os']);
  assert.deepEqual([...browse.independentStudyIds(selected)],['os-cohort']);
  assert(selected[0].presentation_rows.every(row=>row.results.length&&row.results.every(result=>result.result_id==='os')));
  const csv=charts.studyTableCSV(selected,{include_missing_n:true});
  assert.match(csv,/OS · HR/);
  assert.match(csv,/Unavailable/);
  assert.doesNotMatch(csv,/PFS|Median OS|PFS-only report/);
  assert.equal(JSON.stringify([first,second,memberships]),before);
});

test('endpoint selection rebuilds consolidated views so table and CSV cannot retain cached other outcomes',()=>{
  const compact=require('../dist/quantitative_extraction.js');
  const regimens=require('../dist/regimen_definitions.js');
  const payload=require('./fixtures/quantitative_pilot.cjs').readPilotSnapshot();
  const merged=compact.merge([],{},payload);
  const source=regimens.prepareStudies(merged.studies).find(study=>study.pmid==='35367007');
  const study=structuredClone(source);
  const results=study.details.quantitative_results.filter(row=>row.measure==='HR');
  assert.equal(results.length,2);
  for(const [index,row] of results.entries()){
    const family=index?'progression_free_survival':'overall_survival';
    const abbreviation=index?'PFS':'OS';
    const definition=index?'Progression-free survival':'Overall survival';
    row.endpoint={family,definition};
    row.quantitative_record.endpoint=abbreviation;
    row.quantitative_record.endpoint_definition=definition;
    for(const wrapper of study.details.quantitative_extraction){
      const effect=wrapper.record.effects.find(effect=>effect.id===row.quantitative_record.id);
      if(effect){effect.endpoint=abbreviation;effect.endpoint_definition=definition;}
    }
  }
  const first=results[0],wrapper=study.details.quantitative_extraction[0];
  const selectedNode={id:'agent:pembrolizumab',label:'Pembrolizumab'};
  const membership={...member('followups',study.pmid,976),node_id:selectedNode.id,
    canonical_regimen:{node_id:selectedNode.id,label:selectedNode.label},source_bindings:[{
      pmid:study.pmid,report_id:study.report_id,task_id:wrapper.task_id,stage:wrapper.record.stage,
      source_input_sha256:first.source_input_sha256,review_binding_sha256:first.review_binding_sha256,
      arm_ids:['arm-pembrolizumab'],population_ids:['pop-overall'],
      result_ids:results.map(row=>row.result_id),sample_ids:study.details.sample_size_records.map(row=>row.sample_record_id)
    }]};
  const options={registry:merged.evidence_registry};
  const all=browse.matches([study],[membership],selectedNode,charts,options);
  assert(all[0].presentation_rows.some(row=>row.presentation_members?.length===2),
    'the unfiltered fixture must exercise cached consolidated views');
  const allCSV=charts.studyTableCSV(all,{...options,include_missing_n:true});
  assert.match(allCSV,/OS · HR/);assert.match(allCSV,/PFS · HR/);
  const selected=browse.matches([study],[membership],selectedNode,charts,{...options,endpoint:'overall_survival'});
  const views=selected[0].presentation_rows.map(row=>charts.studyTablePresentation({...selected[0],...row},options));
  assert(views.every(view=>view.effects.every(effect=>effect.label==='OS · HR')));
  const csv=charts.studyTableCSV(selected,{...options,include_missing_n:true});
  assert.match(csv,/OS · HR: 0\.65/);
  assert.doesNotMatch(csv,/PFS|0\.61/);
});
