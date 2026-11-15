'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const concise=require('../dist/concise_study_groups.js'),clinical=require('../dist/clinical_evidence.js'),regimens=require('../dist/regimen_definitions.js'),charts=require('../dist/app.js');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../../data/audits/trial_groups_ui_20261108/target_fixture.json'),'utf8'));
function actual(pmid){
 const merged=clinical.merge([],{}, {...fixture.clinical_meta,articles:[fixture.clinical[pmid]],evidence_registry:fixture.evidence_registry}),s=merged.studies[0];
 const study=regimens.prepareStudies([{...s,quantitative_only:true,details:{...s.details,quantitative_extraction:fixture.articles[pmid].records}}])[0],registry=merged.evidence_registry,samples=charts.reportedStudyCounts(study,null,registry);
 return {study,registry,samples,comparisons:concise.presentationComparisons(study,study.comparisons,{registry,eligible_samples:samples})};
}
function rows(d){const match={study:d.study,comparisons:d.comparisons,results:charts.studyResults(d.study)},base=charts.studyTreatmentRows(match,undefined,{registry:d.registry});return concise.prepare(match,base,{registry:d.registry,eligible_samples:d.samples});}
test('S1616 is one verified add-on pair with N65/N21 and its explicit total86',()=>{
 const d=actual('42013417'),before=JSON.stringify(d.study);assert.equal(d.comparisons.length,1);const co=d.comparisons[0];
 assert.equal(co.comparator_arm_id,'r3a2');assert.equal(co.intervention_arm_id,'r3a1');assert.equal(charts.comparatorPresentation(co).label,'Ipilimumab');
 assert.deepEqual([charts.interventionPresentation(co).label,charts.interventionPresentation(co).is_add_on],['Nivolumab',true]);
 const display=rows(d);assert.equal(display.length,1);assert.equal(display[0].paired_arm_context,true);assert.equal(display[0].paired_count_only,true);assert.deepEqual([display[0].comparator_n,display[0].intervention_n,display[0].total_n],[21,65,86]);
 assert.equal(co.result_ids.length,0,'No invented comparative effect');assert.equal(JSON.stringify(d.study),before);
});
test('ovarian-reserve display prioritizes targeted therapyN8 and ipilimumab analysisN28, preserving safetyN29 in details',()=>{
 const d=actual('41701163'),co=d.comparisons[0];assert.equal(d.comparisons.length,1);assert.equal(co.comparator_arm_id,'arm-targeted');assert.equal(co.intervention_arm_id,'arm-ipi');
 assert.equal(charts.comparatorPresentation(co).label,'Dabrafenib + Trametinib');assert.equal(charts.interventionPresentation(co).label,'Ipilimumab');assert.equal(charts.interventionPresentation(co).is_add_on,false);
 const before=JSON.stringify(d.study),display=rows(d),pair=display.find(g=>g.paired_arm_context);
 assert.deepEqual([pair.comparator_n,pair.intervention_n,pair.total_n],[8,28,null]);assert.equal(display.length,1);
 assert(d.study.details.sample_size_records.some(s=>s.quantitative_record?.count_purpose==='safety'&&s.n?.value===29));assert.equal(JSON.stringify(d.study),before);
});
test('reviewed pairs require their source, drug composition, evidence and both eligible counts',()=>{
 for(const change of [d=>d.registry={},d=>d.samples=d.samples.filter(s=>s.quantitative_record.arm_id!=='r3a2'),d=>{d.study.details.quantitative_extraction[1].record.source_sha256='changed';},d=>{d.study.details.quantitative_extraction[1].record.arms[1].nodes[0].name='pembrolizumab';},d=>{const s=d.samples.find(s=>s.quantitative_record.arm_id==='r3a2');s.quantitative_record.field_flags=[{code:'CONFLICTING_n'}];}]){
  const d=actual('42013417');change(d);assert.equal(concise.presentationComparisons(d.study,d.study.comparisons,{registry:d.registry,eligible_samples:d.samples}).length,0);
 }
});
function synthetic(){
 const source='a'.repeat(64),binding='b'.repeat(64),prefix='CE-'+binding.slice(0,24)+'-',pop='p',arm=id=>({id,population_id:pop,label:id,root_id:id,nodes:[{id,kind:'drug',name:id,children:[],dose:'NA',route:'NA',schedule:'NA'}],evidence:['proof']}),arms=[arm('ipilimumab'),arm('nivolumab')];
 const record={stage:'R3',source_sha256:source,study:{comparison_structure:'comparative'},populations:[{id:pop,label:'Trial cohort',melanoma_only:'yes',scope:'overall',evidence:['proof']}],arms,effects:[],sample_sizes:[]};
 const scope={record_kind:'canonical_review_scope',report_id:'report-test',source_input_sha256:source,review_stage:'R3',review_binding_sha256:binding,population_id:prefix+pop};
 const native=arm=>({arm_id:arm.id,label:arm.label,root_node_id:arm.id,nodes:arm.nodes.map(n=>({node_id:n.id,kind:n.kind,name:n.name,children:[],dose:null,route:null,schedule:null,evidence_ids:[prefix+'proof']})),evidence_ids:[prefix+'proof']});
 const results=[{result_id:'effect',main_result_eligible:true,source_input_sha256:source,review_stage:'R3',review_binding_sha256:binding,quantitative_record:{id:'effect',population_id:pop,intervention_arm_id:'nivolumab',reference_arm_id:'ipilimumab',field_flags:[],estimate:0.5}},...arms.map(a=>({result_id:a.id,main_result_eligible:true,source_input_sha256:source,review_stage:'R3',review_binding_sha256:binding,quantitative_record:{id:a.id,arm_id:a.id,population_id:pop,cutoff:'NA',kind:'median'}}))];
 const comparison={comparison_id:'C',kind:'treatment_comparison',scope,intervention_arm_id:'nivolumab',comparator_arm_id:'ipilimumab',intervention_native_regimen:native(arms[1]),comparator_native_regimen:native(arms[0]),result_ids:['effect'],comparison_filter_eligible:true};
 const singles=arms.map(a=>({comparison_id:'C-'+a.id,kind:'arm_specific_result',scope,outcome_arm_id:a.id,result_ids:[a.id]}));
 const study={report_id:'report-test',pmid:'99999999',quantitative_only:true,details:{quantitative_extraction:[{record}],quantitative_results:results}};
 return {study,comparison,singles,record,results,source,binding,prefix};
}
test('per-arm results reuse the reported reference pair rather than becoming no-comparator groups',()=>{
 const d=synthetic(),existing=[d.comparison,...d.singles],before=JSON.stringify([d.study,existing]);
 const co=concise.presentationComparisons(d.study,existing)[0];assert.deepEqual(co.result_ids,['effect','ipilimumab','nivolumab']);assert.equal(co.comparator_arm_id,'ipilimumab');assert.equal(co.intervention_arm_id,'nivolumab');assert.equal(co.presentation_pair.proof,'reported_effect_reference');
 assert.equal(concise.presentationComparisons(d.study,existing).length,1);assert.equal(JSON.stringify([d.study,existing]),before);
});
test('true single-arm, ambiguous directions, multiarm and foreign-cohort rows are never paired by arm order',()=>{
 let d=synthetic();d.record.study.comparison_structure='single_group';assert.deepEqual(concise.presentationComparisons(d.study,[...d.singles]),d.singles);
 d=synthetic();assert.deepEqual(concise.presentationComparisons(d.study,d.singles),d.singles,'Two arms alone are not reference evidence');
 d=synthetic();d.record.arms.push({...d.record.arms[0],id:'third'});assert.equal(concise.presentationComparisons(d.study,[d.comparison,...d.singles]).length,3);
 d=synthetic();d.singles[0].scope={...d.singles[0].scope,population_id:d.prefix+'other'};const out=concise.presentationComparisons(d.study,[d.comparison,...d.singles]);assert.equal(out.length,2);assert(out.includes(d.singles[0]));
 d=synthetic();const reverse={...d.comparison,comparison_id:'reverse',intervention_arm_id:'ipilimumab',comparator_arm_id:'nivolumab',result_ids:['reverse']};d.results.push({...d.results[0],result_id:'reverse',quantitative_record:{...d.results[0].quantitative_record,intervention_arm_id:'ipilimumab',reference_arm_id:'nivolumab'}});assert.equal(concise.presentationComparisons(d.study,[d.comparison,reverse,...d.singles]).length,4);
});
test('pair Ns cannot cross arm populations or borrow a total with another count purpose',()=>{
 const d=synthetic();
 const count=(id,arm,n,purpose='outcome_analysis')=>({source_input_sha256:d.source,review_stage:'R3',review_binding_sha256:d.binding,n:{value:n},quantitative_record:{id,arm_id:arm,population_id:'p',n,count_purpose:purpose,cutoff:'NA',complete:'yes',result_id:'NA',field_flags:[]}});
 const a=count('control','ipilimumab',40),b=count('active','nivolumab',60),total=count('enrolled','NA',100,'enrolled');
 let co=concise.presentationComparisons(d.study,[d.comparison,...d.singles],{eligible_samples:[a,b,total]})[0];
 assert.equal(co.presentation_pair.total_n,null,'Arithmetic agreement cannot turn enrolled total into an analysis total');
 total.quantitative_record.count_purpose='outcome_analysis';co=concise.presentationComparisons(d.study,[d.comparison,...d.singles],{eligible_samples:[a,b,total]})[0];assert.equal(co.presentation_pair.total_n,100);
 const ovarian=actual('41701163');ovarian.samples.find(s=>s.quantitative_record.arm_id==='arm-targeted').quantitative_record.population_id='pop-ipi';assert.equal(concise.presentationComparisons(ovarian.study,ovarian.study.comparisons,{registry:ovarian.registry,eligible_samples:ovarian.samples}).length,0,'A same-report population cannot lend its count to a different arm population');
 const conflicting={...b,n:{value:59},quantitative_record:{...b.quantitative_record,id:'conflict',n:59}};co=concise.presentationComparisons(d.study,[d.comparison,...d.singles],{eligible_samples:[a,b,conflicting,total]})[0];assert.equal(co.presentation_pair.intervention_n,undefined,'Conflicting same-purpose arm counts remain unresolved');
});
test('a different known cutoff cannot consume a count-only arm context',()=>{
 const d=synthetic();d.comparison.scope={...d.comparison.scope,cutoff:'2020'};
 d.singles[0]={...d.singles[0],scope:{...d.singles[0].scope,cutoff:'2021'},result_ids:[]};
 const out=concise.presentationComparisons(d.study,[d.comparison,...d.singles]);assert(out.includes(d.singles[0]));
});
