'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {enrich,date,months,estimand,trialAliasResolver}=require('../scripts/treatment_map_evidence.cjs');
function fixture(){
  const population={id:'p',label:'Overall melanoma population',scope:'overall',evidence:['p-proof']};
  const left={id:'active',population_id:'p'},right={id:'control',population_id:'p'};
  const effect={id:'e',endpoint:'OS',endpoint_definition:'Overall survival',measure:'HR',estimate:.7,ci_lower:.5,ci_upper:.9,ci_level:95,
    intervention_arm_id:'active',reference_arm_id:'control',population_id:'p',model:'Cox proportional hazards',adjusted:'no',cutoff:'2025-03-01',evidence:['effect-proof']};
  const record={stage:'R2',report_id:'r',source_sha256:'sha',study:{study_type:'interventional_trial',randomized:'yes',setting:'advanced',melanoma_subtype:'cutaneous',evidence:['study-proof']},
    arms:[left,right],populations:[population],effects:[effect],sample_sizes:[],survival:[],binary:[]};
  const source={pmid:'1',key:'1|R2|sha',record,article:{year:2026},binding:'binding'};
  return {source,effect,population,left,right,identity:{study_id:'nct:NCT00000001',linkage:'source_registration'},sources:[source],refs:(_s,ids)=>ids,
    anchored:(_s,ids)=>Array.isArray(ids)&&ids.length>0&&!ids.includes('bad'),accepted:(_s,row)=>row.accepted!==false};
}
const survival=(extra={})=>({id:'s',population_id:'p',arm_id:'control',endpoint:'OS',origin:'own_report',kind:'survival_probability',estimate:60,unit:'percent',time:24,time_unit:'months',analysis_n:100,cutoff:'2025-03-01',evidence:['s-proof'],...extra});
const binary=(extra={})=>({id:'b',population_id:'p',arm_id:'control',endpoint:'ORR',origin:'own_report',numerator:20,denominator:100,percentage:20,assessment_time:12,time_unit:'months',cutoff:'2025-03-01',evidence:['b-proof'],...extra});
function linkedFulltext(a){
  const other=structuredClone(a.source);other.key='1|R3|full';other.record.stage='R3';other.record.source_sha256='full';other.record.populations[0].id='p3';
  other.record.arms=[{id:'active3',population_id:'p3'},{id:'control3',population_id:'p3'}];other.record.effects=[{...a.effect,id:'e3',population_id:'p3',intervention_arm_id:'active3',reference_arm_id:'control3'}];
  other.record.r2_links=[['populations','p','p3'],['arms','active','active3'],['arms','control','control3'],['effects','e','e3']].map(([section,r2_id,r3_id])=>({section,r2_id,r3_id,relation:'supplement',evidence:['link-proof']}));
  a.sources.push(other);return other;
}
test('analysis enrichment preserves source tuples and uses semantic compatibility across trial labels',()=>{
  const a=fixture(),before=JSON.stringify(a.source),one=enrich(a);assert.equal(JSON.stringify(a.source),before);
  assert.equal(one.design,'randomized_trial');assert.equal(one.independent_id,'nct:NCT00000001');assert.equal(one.independence_verified,true);assert.equal(one.compatibility.eligible,true);
  assert.equal(one.publication_date,null);assert.equal(one.publication_year,2026);assert.equal(one.analysis_date,'2025-03-01');assert.equal(one.precision.reported_ci_level,95);
  const b=fixture();b.population.label='Different wording for an overall melanoma population';b.identity.study_id='nct:NCT00000002';b.source.pmid='2';
  assert.equal(enrich(b).compatibility.key,one.compatibility.key,'raw prose and trial identity do not split compatible strata');
  b.source.record.study.setting='adjuvant';assert.notEqual(enrich(b).compatibility.key,one.compatibility.key);
  b.source.record.study.setting='advanced';b.source.record.study.study_type='observational';assert.notEqual(enrich(b).compatibility.key,one.compatibility.key);
});
test('primary-analysis reviews apply only to the exact source, effect tuple, direction and anchored quotation',()=>{
  const crypto=require('node:crypto'),reviews=require('../../config/comparison_result_reviews.json').reviews;
  const a=fixture(),before=JSON.stringify(a.source),quotation='The primary efficacy analysis reported an overall survival hazard ratio of 0.70 (95% CI 0.50–0.90).';
  const review={id:'synthetic-primary-result',reason:'Source identifies this as the primary efficacy analysis.',pmid:a.source.pmid,source_sha256:a.source.record.source_sha256,
    review_binding_sha256:a.source.binding,effect_id:a.effect.id,population_id:a.population.id,
    ...Object.fromEntries(['endpoint','measure','estimate','ci_lower','ci_upper','ci_level','cutoff','intervention_arm_id','reference_arm_id'].map(key=>[key,a.effect[key]])),
    evidence:[{id:'effect-proof',quote_sha256:crypto.createHash('sha256').update(quotation).digest('hex')}]};
  const input={...a,quote:()=>quotation},index=reviews.length;
  assert.notEqual(enrich(input).primary_analysis,true);
  reviews.push(review);
  try{
    const verified=enrich(input);assert.equal(verified.primary_analysis,true);assert.equal(verified.primary_analysis_review.id,review.id);
    assert.equal(verified.primary_analysis_review.reason,review.reason);assert.equal(verified.primary_analysis_review.source_ref.record_id,a.effect.id);
    for(const [field,value]of Object.entries({pmid:'different',source_sha256:'stale',review_binding_sha256:'stale',effect_id:'other',population_id:'other',endpoint:'PFS',measure:'RR',estimate:.71,ci_lower:.51,ci_upper:.91,ci_level:99,cutoff:'2024-03-01',intervention_arm_id:'control',reference_arm_id:'active'})){
      reviews[index]={...review,[field]:value};assert.notEqual(enrich(input).primary_analysis,true,'reject stale '+field);
    }
    for(const evidence of [[],[{id:'missing-proof',quote_sha256:review.evidence[0].quote_sha256}],[{id:'effect-proof',quote_sha256:'stale'}]]){
      reviews[index]={...review,evidence};assert.notEqual(enrich(input).primary_analysis,true,'reject missing or stale quotation proof');
    }
    reviews[index]=review;
    assert.notEqual(enrich({...input,quote:()=>quotation+' Changed source text.'}).primary_analysis,true);
    assert.notEqual(enrich({...input,anchored:()=>false}).primary_analysis,true);
    assert.equal(JSON.stringify(a.source),before,'review preference never rewrites the extracted source');
  }finally{reviews.splice(index,1);}
});
test('unspecified melanoma follows user scope while special subtypes, adjusted models and estimands stay separate',()=>{
  const a=fixture(),base=enrich(a);a.source.record.study.melanoma_subtype='NA';assert.equal(enrich(a).compatibility.key,base.compatibility.key);
  for(const subtype of ['uveal','mucosal','acral']){
    a.source.record.study.melanoma_subtype=subtype;
    assert.notEqual(enrich(a).compatibility.key,base.compatibility.key);
    assert.equal(enrich(a).reported_subtype,subtype);
  }
  a.source.record.study.melanoma_subtype='mixed';
  const mixed=enrich(a);
  assert.equal(mixed.compatibility.eligible,true);
  assert.equal(mixed.compatibility.key,base.compatibility.key);
  assert.equal(mixed.reported_subtype,'mixed');
  a.source.record.study.melanoma_subtype='cutaneous';a.effect.model='Fine-Gray subdistribution hazard';assert.equal(enrich(a).model_family,'subdistribution_hazard');
  a.effect.model='accelerated failure time model';assert.equal(enrich(a).compatibility.eligible,false);
  a.effect.model='Cox';a.effect.adjusted='yes';assert.notEqual(enrich(a).compatibility.key,base.compatibility.key);
  a.source.record.study.setting='NA';assert.equal(enrich(a).compatibility.eligible,true);
});
test('broad default scope retains unknown or mixed settings without erasing their source metadata',()=>{
  for(const setting of ['NA','mixed']){
    const a=fixture();a.source.record.study.setting=setting;
    const before=JSON.stringify(a.source),result=enrich(a);
    assert.equal(result.compatibility.eligible,true);
    assert.equal(result.setting,setting==='NA'?'unknown':'mixed');
    assert.equal(JSON.stringify(a.source),before);
  }
});
test('survival planning only admits exact arm/population/endpoint/time-bound accepted reported probabilities',()=>{
  const a=fixture();a.source.record.survival=[survival(),survival({id:'median',kind:'median',estimate:15,unit:'months'}),survival({id:'no-time',time:'NA'}),
    survival({id:'subgroup',population_id:'subset'}),survival({id:'other-arm',arm_id:'third'}),survival({id:'other-outcome',endpoint:'PFS'}),survival({id:'bad-source',evidence:['bad']}),
    survival({id:'old-date',cutoff:'2020-01-01'}),survival({id:'uncanonical',accepted:false}),survival({id:'borrowed',origin:'other_report'}),survival({id:'bad-number',field_flags:[{field:'estimate'}]})];
  const p=enrich(a).planning_assumptions;assert.equal(p.length,1);assert.equal(p[0].kind,'survival_probability');assert.equal(p[0].arm_role,'comparator');assert.equal(p[0].probability,.6);assert.equal(p[0].time_months,24);
  assert.deepEqual(p[0].source_refs[0].evidence_ids,['s-proof']);assert.equal(p[0].events,null,'S(t) is retained; no event count is manufactured');
});
test('binary rates preserve counts, denominators and source roles without converting odds ratios to risk ratios',()=>{
  const a=fixture();a.effect.endpoint='ORR';a.effect.measure='OR';a.source.record.binary=[binary(),binary({id:'active-rate',arm_id:'active',numerator:40,percentage:40}),binary({id:'bad-n',numerator:101,percentage:20})];
  const p=enrich(a).planning_assumptions;assert.equal(p.length,2);assert.deepEqual(p.map(x=>[x.arm_role,x.probability,x.events,x.n]),[['comparator',.2,20,100],['intervention',.4,40,100]]);assert.equal(a.effect.measure,'OR');
  a.effect.endpoint='OS';a.source.record.binary=[binary({endpoint:'OS',endpoint_definition:'Deaths at analysis cutoff',numerator:45,percentage:45})];
  assert.equal(enrich(a).planning_assumptions[0].kind,'event_fraction');
  a.source.record.binary[0].endpoint_definition='Overall survival';assert.equal(enrich(a).planning_assumptions.length,0,'ambiguous survival numbers are not assumed to count events');
});
test('R3 fills R2 metadata and planning gaps only through accepted population and complete-arm links',()=>{
  const a=fixture();a.effect.model='NA';a.source.record.study.setting='NA';
  const other=structuredClone(a.source);other.key='1|R3|full';other.record.stage='R3';other.record.source_sha256='full';other.record.study.setting='advanced';other.record.populations[0].id='p3';
  other.record.arms=[{id:'active3',population_id:'p3'},{id:'control3',population_id:'p3'}];other.record.effects=[{...a.effect,id:'e3',population_id:'p3',intervention_arm_id:'active3',reference_arm_id:'control3',model:'Cox proportional hazards'}];
  other.record.survival=[survival({id:'s3',population_id:'p3',arm_id:'control3'})];
  other.record.r2_links=[['populations','p','p3'],['arms','active','active3'],['arms','control','control3'],['effects','e','e3']].map(([section,r2_id,r3_id])=>({section,r2_id,r3_id,relation:'same',evidence:['link-proof']}));
  a.sources.push(other);let result=enrich(a);assert.equal(result.model_family,'cox');assert.equal(result.setting,'advanced');assert.equal(result.planning_assumptions.length,1);assert.deepEqual(result.source_stages,['R2','R3']);
  assert.equal(result.planning_assumptions[0].source_refs[0].stage,'R3');
  a.source.record.survival=[survival()];result=enrich(a);assert.equal(result.planning_assumptions.length,1,'identical explicitly linked R2/R3 probabilities share one choice');assert.equal(result.planning_assumptions[0].source_refs.length,2);
  a.source.record.survival=[];
  other.record.r2_links=other.record.r2_links.filter(l=>l.r2_id!=='control');result=enrich(a);assert.equal(result.planning_assumptions.length,0);assert.equal(result.model_family,'hazard_ratio_unspecified');
  assert.equal(result.setting,'advanced','publication-level design metadata may complement independently of arm links');
});
test('conflicting accepted study metadata is held and cannot silently choose the richer source',()=>{
  const a=fixture(),other=structuredClone(a.source);other.record.stage='R3';other.record.study.setting='adjuvant';a.sources.push(other);
  const result=enrich(a);assert.equal(result.compatibility.eligible,false);assert.equal(result.setting,'conflict');assert.ok(result.metadata_conflicts.some(c=>c.field==='setting'));
});
test('intentional mixed melanoma enrollment remains distinguishable from a source subtype conflict',()=>{
  const a=fixture();a.source.record.study.melanoma_subtype='mixed';
  const before=JSON.stringify(a.source),mixed=enrich(a);
  assert.equal(mixed.subtype,'general_melanoma');
  assert.equal(mixed.reported_subtype,'mixed');
  assert.equal(mixed.compatibility.eligible,true);
  assert.deepEqual(mixed.metadata_conflicts,[]);
  assert.equal(JSON.stringify(a.source),before);
  const other=structuredClone(a.source);other.record.stage='R3';other.record.study.melanoma_subtype='cutaneous';a.sources.push(other);
  const conflict=enrich(a);
  assert.equal(conflict.subtype,'conflict');
  assert.equal(conflict.compatibility.eligible,false);
  assert.match(conflict.compatibility.reason,/disagree on melanoma subtype/);
  assert.ok(conflict.metadata_conflicts.some(item=>item.field==='melanoma_subtype'));
});
test('comparison sample N uses outcome-linked counts and never allocates a multi-arm total',()=>{
  const a=fixture();a.effect.display_n={count_ids:['total']};a.source.record.sample_sizes=[{id:'total',n:200,population_id:'p',arm_id:'NA',count_purpose:'randomized',evidence:['n-proof']}];
  assert.equal(enrich(a).sample_size.n,200);a.source.record.arms.push({id:'third',population_id:'p'});assert.equal(enrich(a).sample_size.n,null);
  a.effect.analysis_n=180;assert.equal(enrich(a).sample_size.n,180);a.effect.field_flags=[{field:'analysis_n',code:'not_supported'}];assert.equal(enrich(a).sample_size.n,null);
  a.source.record.sample_sizes[0].result_id='e';assert.equal(enrich(a).sample_size.n,200,'an explicitly source-linked outcome N may describe the pair even in a larger trial');
});
test('a complete shared-passage total supports the exact overall two-arm analysis without a single result ID',()=>{
  const a=fixture();a.source.record.sample_sizes=[{id:'total',n:200,population_id:'p',arm_id:'NA',result_id:'NA',count_purpose:'outcome_analysis',complete:'yes',method:'reported',evidence:['effect-proof']}];
  const before=JSON.stringify(a.source),result=enrich(a);
  assert.equal(result.sample_size.n,200);
  assert.equal(result.sample_size.basis,'source_population_analysis_count');
  assert.equal(result.sample_size.source_refs[0].record_id,'total');
  assert.equal(JSON.stringify(a.source),before);
  for(const changes of [{result_id:'another-outcome'},{arm_id:'active'},{population_id:'other'},
    {evidence:['different-passage']},{complete:'no'},{method:'derived'},{cutoff:'2020-01-01'},
    {field_flags:[{field:'n',code:'unsupported'}]}]){
    const b=fixture();b.source.record.sample_sizes=[{...a.source.record.sample_sizes[0],...changes}];
    assert.equal(enrich(b).sample_size.n,null,JSON.stringify(changes));
  }
  a.source.record.sample_sizes.push({...a.source.record.sample_sizes[0],id:'conflict',n:199});
  assert.equal(enrich(a).sample_size.n,null,'conflicting counts cannot be chosen by size');
  a.source.record.sample_sizes.pop();a.source.record.arms.push({id:'third',population_id:'p'});
  assert.equal(enrich(a).sample_size.n,null,'a three-arm total cannot be allocated to the pair');
});
test('dates and survival horizons retain precision without guessing a date or time unit',()=>{
  assert.equal(date('2025'),null);assert.equal(date('2025-03'),null);assert.equal(date('2025-02-30'),null);assert.equal(date('Nov 13, 2015'),'2015-11-13');
  assert.equal(months(2,'years'),24);assert.equal(months(12,'NA'),null);assert.equal(months('12','months'),null);
});
test('arm N does not borrow another outcome denominator or select an arbitrary conflicting count',()=>{
  const a=fixture();a.source.record.sample_sizes=['active','control'].flatMap(id=>[
    {id:id+'n',arm_id:id,population_id:'p',n:100,count_purpose:'randomized',evidence:['n-proof']},
    {id:id+'other',arm_id:id,population_id:'p',n:40,count_purpose:'outcome_analysis',result_id:'different-endpoint',evidence:['n-proof']}]);
  assert.equal(enrich(a).sample_size.n,200);
  a.source.record.sample_sizes.push({id:'conflict',arm_id:'active',population_id:'p',n:99,count_purpose:'randomized',evidence:['n-proof']});
  assert.equal(enrich(a).sample_size.n,null);
});
test('explicit embedded calendar dates are parsed without collapsing different dates or inventing days',()=>{
  assert.equal(date('Final database lock, May 16, 2024; minimum 120-month follow-up'),'2024-05-16');
  assert.equal(date('2019-09-30; median follow-up 3.05 years'),'2019-09-30');
  assert.equal(date('May 24, 2017; minimum follow-up 36 months'),'2017-05-24');
  assert.equal(date('5-year final analysis'),null);assert.equal(date('March 2021'),null);
  assert.equal(date('March 1, 2021 through June 1, 2021'),null,'two different dates cannot be arbitrarily selected');
});
test('same-effect links can refine descriptive cutoffs and verified trial identity without rewriting raw sources',()=>{
  const a=fixture();a.identity={study_id:null,linkage:'unlinked_publication'};a.effect.cutoff='10-year final analysis';a.effect.model='NA';
  const full=linkedFulltext(a);full.record.effects[0].cutoff='Final database lock, May 16, 2024; minimum 120-month follow-up';full.record.effects[0].model='Cox proportional hazards';
  a.identify=s=>s.record.stage==='R3'?{study_id:'nct:NCT00000001'}:{study_id:null};
  const before=JSON.stringify(a.source),result=enrich(a);assert.equal(JSON.stringify(a.source),before);assert.equal(result.analysis_date,'2024-05-16');assert.equal(result.model_family,'cox');
  assert.equal(result.independent_id,'nct:NCT00000001');assert.equal(result.independence_verified,true);assert.equal(result.linkage,'linked_same_report_source_identity');
  a.effect.cutoff='2020-01-01';const different=enrich(a);assert.equal(different.analysis_date,'2020-01-01');assert.equal(different.model_family,'hazard_ratio_unspecified');assert.equal(different.independence_verified,false);
});
test('effect-linked missing arm correspondence needs independently equal complete normalized regimens',()=>{
  const a=fixture();a.effect.model='NA';const full=linkedFulltext(a);full.record.effects[0].model='Cox';full.record.r2_links=full.record.r2_links.filter(l=>l.r2_id!=='active');
  assert.equal(enrich(a).model_family,'hazard_ratio_unspecified');
  a.armEquivalent=(_s,arm,_other,candidate)=>arm.id+'3'===candidate.id;assert.equal(enrich(a).model_family,'cox');
  a.armEquivalent=(_s,arm)=>arm.id==='control';assert.equal(enrich(a).model_family,'hazard_ratio_unspecified');
});
test('fuller linked endpoint metadata complements abbreviated descriptions while genuine criteria remain incompatible',()=>{
  const a=fixture();a.effect.endpoint='PFS';a.effect.endpoint_definition='Progression or death; blinded independent central review';const full=linkedFulltext(a);
  full.record.effects[0].endpoint_definition='Time from randomization to progression or death, blinded independent central review per RECIST version 1.1';
  const r2=enrich(a),r3=enrich({...a,source:full,effect:full.record.effects[0],population:full.record.populations[0],left:full.record.arms[0],right:full.record.arms[1]});
  assert.equal(r2.estimand,'recist_1_1');assert.equal(r2.assessment,'central');assert.equal(r2.compatibility.key,r3.compatibility.key);
  a.effect.endpoint_definition='Investigator review per RECIST 1.0';assert.equal(enrich(a).compatibility.eligible,false);
});
test('local regional or distant recurrence remains RFS and is not misclassified as distant-only recurrence',()=>{
  assert.equal(estimand({endpoint:'RFS',endpoint_definition:'Time to first local, regional, or distant recurrence or death from any cause'}),'standard_rfs');
  assert.equal(estimand({endpoint:'RFS',endpoint_definition:'Time to distant recurrence or death'}),'distant_recurrence');
  assert.equal(estimand({endpoint:'RFS',endpoint_definition:'Sensitivity analysis excluding new primary invasive melanomas and melanoma in situ as RFS events'}),'excludes_new_primary_melanoma');
});
test('overall event proportions must describe exactly the compared two-arm population',()=>{
  const a=fixture();a.source.record.binary=[binary({endpoint:'OS',endpoint_definition:'Deaths at analysis cutoff',arm_id:'NA',numerator:60,denominator:200,percentage:30})];
  const pair=enrich(a).planning_assumptions;assert.equal(pair.length,1);assert.equal(pair[0].kind,'event_fraction');assert.equal(pair[0].arm_role,'overall');assert.equal(pair[0].probability,.3);
  a.source.record.arms.push({id:'third',population_id:'p'});const before=JSON.stringify(a.source);
  assert.equal(enrich(a).planning_assumptions.length,0,'whole-trial events are not allocated to a pair within a three-arm population');assert.equal(JSON.stringify(a.source),before);
  a.source.record.arms[2].population_id='separate-source-population';assert.equal(enrich(a).planning_assumptions.length,1,'an unrelated source population does not invalidate the exact pair');
});
test('exact co-occurring trial names refine only an unresolved or generated report identity',()=>{
  const target=fixture().source;target.record.study.name='EORTC 1325 / KEYNOTE-054';target.record.study.identifiers=[];target.ncts=[];
  target.proof='The EORTC1325/KEYNOTE-054 randomized trial compared pembrolizumab and placebo.';
  const donor=structuredClone(target);donor.pmid='2';donor.record.stage='R3';donor.record.study.identifiers=[{id:'NCT02362594'}];donor.ncts=['NCT02362594'];donor.proof='EORTC1325/KEYNOTE-054 trial (ClinicalTrials.gov identifier: NCT02362594).';
  const api={names:s=>s.split('/').map(x=>x.trim()),anchored:(_s,ids)=>ids?.length>0,quote:s=>s.proof,refs:(_s,ids)=>ids};
  const identity={study_id:null,linkage:'ambiguous_trial_name',study_name:'EORTC 1325; KEYNOTE-054'},before=JSON.stringify(target);
  let resolve=trialAliasResolver([target,donor],api),result=resolve(target,identity);
  assert.equal(result.study_id,'nct:NCT02362594');assert.equal(result.linkage,'exact_cooccurring_trial_names');assert.equal(result.identity_source_refs.length,2);assert.equal(result.identity_source_refs[1].pmid,'2');
  assert.equal(identity.study_id,null);assert.equal(JSON.stringify(target),before,'source identity and source record remain unchanged');
  const internal={...identity,study_id:'cohort:report:'+target.pmid,linkage:'internal_original_cohort',nct_ids:[],identity_source_refs:[{pmid:target.pmid,section:'populations',record_id:'p'}]};
  const certified=resolve(target,internal);
  assert.equal(certified.study_id,'nct:NCT02362594');assert.deepEqual(certified.nct_ids,['NCT02362594']);
  assert.equal(certified.identity_source_refs.length,3,'retain the original cohort anchors with the alias donor proofs');
  assert.equal(internal.study_id,'cohort:report:'+target.pmid,'do not mutate the prior derived identity');
  for(const protectedIdentity of [
    {...internal,study_id:'nct:NCT00000002',nct_ids:['NCT00000002']},
    {...internal,linkage:'internal_cohort_multiple_registrations',registration_allocation_pending:true},
    {...internal,study_id:'cohort:report:another-report'},
    {...identity,nct_ids:['NCT00000002']},
  ])assert.equal(resolve(target,protectedIdentity),protectedIdentity,'explicit or unresolved multiple-registration identities are not overwritten');
  const conflict=structuredClone(donor);conflict.record.study.identifiers=[{id:'NCT00000002'}];conflict.proof=donor.proof.replace('NCT02362594','NCT00000002');resolve=trialAliasResolver([target,donor,conflict],api);assert.equal(resolve(target,identity).study_id,null);
  donor.proof='EORTC1325/KEYNOTE-054 trial, registration not shown';resolve=trialAliasResolver([target,donor],api);assert.equal(resolve(target,identity).study_id,null,'an unquoted registration is not certification');
  donor.proof='EORTC1325/KEYNOTE-054 trial NCT02362594';target.record.study.name='KEYNOTE-054';assert.equal(trialAliasResolver([target,donor],api)(target,identity).study_id,null,'a single overlapping name is not an exact name-set match');
});
test('same-paper certified R3 analysis counts fill a selected R2 effect without changing source values',()=>{
  const a=fixture(),full=linkedFulltext(a);
  full.record.sample_sizes=[{id:'n3',population_id:'p3',arm_id:'NA',result_id:'e3',count_purpose:'outcome_analysis',n:216,evidence:['full-count']}];
  const before=JSON.stringify(a.sources),result=enrich(a);
  assert.equal(result.sample_size.n,216);
  assert.equal(result.sample_size.basis,'linked_same_analysis_source_result_count');
  assert.equal(result.sample_size.source_refs[0].stage,'R3');
  assert.equal(result.sample_size.source_refs[0].source_sha256,'full');
  assert.equal(result.sample_size.source_refs[0].record_id,'n3');
  assert.equal(JSON.stringify(a.sources),before);
});
test('complementary N requires a certified same analysis and never crosses publication or population boundaries',()=>{
  for(const change of ['different_cutoff','different_estimate','missing_effect_link','missing_population_link','other_pmid','other_population_count','unaccepted_count']){
    const a=fixture(),full=linkedFulltext(a);
    full.record.sample_sizes=[{id:'n3',population_id:'p3',arm_id:'NA',result_id:'e3',count_purpose:'outcome_analysis',n:216,evidence:['full-count']}];
    if(change==='different_cutoff')full.record.effects[0].cutoff='2020-03-01';
    if(change==='different_estimate')full.record.effects[0].estimate=.8;
    if(change==='missing_effect_link')full.record.r2_links=full.record.r2_links.filter(x=>x.section!=='effects');
    if(change==='missing_population_link')full.record.r2_links=full.record.r2_links.filter(x=>x.section!=='populations');
    if(change==='other_pmid')full.pmid='2';
    if(change==='other_population_count')full.record.sample_sizes[0].population_id='other';
    if(change==='unaccepted_count')full.record.sample_sizes[0].accepted=false;
    assert.equal(enrich(a).sample_size.n,null,change);
  }
});
test('exact two arm counts supply comparison N within a three-arm trial without using the trial total',()=>{
  const a=fixture();a.source.record.arms.push({id:'third',population_id:'p'});
  a.source.record.sample_sizes=[['active',314],['control',315],['third',316]].map(([arm_id,n])=>({id:'n-'+arm_id,arm_id,population_id:'p',n,count_purpose:'randomized',disjoint:'yes',evidence:['n-proof']}));
  a.source.record.sample_sizes.push({id:'total',arm_id:'NA',population_id:'p',n:945,count_purpose:'randomized',evidence:['n-proof']});
  const result=enrich(a);assert.equal(result.sample_size.n,629);assert.equal(result.sample_size.basis,'sum_of_disjoint_randomized_arms');
  assert.deepEqual(result.sample_size.source_refs.map(r=>r.record_id),['n-active','n-control']);
});
test('subgroup pair counts remain usable with parent-defined arms and cannot borrow the parent denominators',()=>{
  const a=fixture();a.population.parent_id='parent';a.population.scope='subgroup';
  a.source.record.populations.push({id:'parent',scope:'overall'});a.left.population_id='parent';a.right.population_id='parent';
  a.source.record.sample_sizes=[['active',309],['control',316]].map(([arm_id,n])=>({id:'n-'+arm_id,arm_id,population_id:'p',n,count_purpose:'ITT',disjoint:'yes',evidence:['n-proof']}));
  assert.equal(enrich(a).sample_size.n,625);
  a.source.record.sample_sizes[1].population_id='parent';
  assert.equal(enrich(a).sample_size.n,null,'one parent arm count cannot fill a missing subgroup arm count');
});
test('a complementary reported analysis N works in either R2/R3 direction but an explicit non-disjoint pair is held',()=>{
  const a=fixture(),full=linkedFulltext(a);full.record.effects[0].analysis_n=200;
  assert.equal(enrich(a).sample_size.n,200);
  a.effect.analysis_n=180;full.record.effects[0].analysis_n='NA';
  const reverse={...a,source:full,effect:full.record.effects[0],population:full.record.populations[0],left:full.record.arms[0],right:full.record.arms[1]};
  assert.equal(enrich(reverse).sample_size.n,180);
  const b=fixture();b.source.record.sample_sizes=['active','control'].map(arm_id=>({id:'n-'+arm_id,arm_id,population_id:'p',n:100,count_purpose:'randomized',disjoint:'no',evidence:['n-proof']}));
  assert.equal(enrich(b).sample_size.n,null);
});
test('complete reported shared-passage arm analysis Ns support that endpoint without borrowing a different outcome count',()=>{
  const a=fixture();a.source.record.sample_sizes=[['active',66],['control',73]].map(([arm_id,n])=>({id:'n-'+arm_id,arm_id,population_id:'p',n,count_purpose:'outcome_analysis',disjoint:'yes',complete:'yes',method:'reported',result_id:'NA',evidence:['effect-proof']}));
  assert.equal(enrich(a).sample_size.n,139);
  a.source.record.sample_sizes[0].evidence=['other-outcome'];assert.equal(enrich(a).sample_size.n,null);
  a.source.record.sample_sizes[0].evidence=['effect-proof'];a.source.record.sample_sizes[0].result_id='other-outcome';assert.equal(enrich(a).sample_size.n,null);
});
test('matching effect numbers cannot bridge different follow-up analyses or reversed treatment directions',()=>{
  for(const change of ['minimum_followup','median_followup','reverse_arms','unanchored_link']){
    const a=fixture(),full=linkedFulltext(a);
    full.record.effects[0].analysis_n=216;
    if(change==='minimum_followup'){a.effect.cutoff='minimum follow-up 36 months';full.record.effects[0].cutoff='minimum follow-up 60 months';}
    if(change==='median_followup'){a.effect.cutoff='median follow-up 3 years';full.record.effects[0].cutoff='median follow-up 5 years';}
    if(change==='reverse_arms'){full.record.effects[0].intervention_arm_id='control3';full.record.effects[0].reference_arm_id='active3';}
    if(change==='unanchored_link')full.record.r2_links.find(x=>x.section==='effects').evidence=['bad'];
    assert.equal(enrich(a).sample_size.n,null,change);
  }
});
test('reviewed COMBI-i N association is bound to exact sources, table quote, tuple and accepted arm counts',()=>{
  const proof=require('../../data/audits/study_harmonization_20261114/42585631_source_checked_sample_link.json'),review=proof.review;
  const setup=()=>{
    const a=fixture();a.source.pmid=review.pmid;a.source.record.source_sha256=review.effect_source_sha256;a.population.id='pop1';
    Object.assign(a.left,{id:'arm1',population_id:'pop1'});Object.assign(a.right,{id:'arm2',population_id:'pop1'});
    Object.assign(a.effect,Object.fromEntries(['endpoint','measure','estimate','ci_lower','ci_upper','ci_level','cutoff','intervention_arm_id','reference_arm_id'].map(k=>[k,review[k]])),{id:'hr_os',population_id:'pop1'});
    const full=structuredClone(a.source);full.record.stage='R3';full.record.source_sha256=review.count_source_sha256;full.record.effects[0].estimate='NA';full.record.effects[0].field_flags=[{field:'estimate'}];
    full.record.r2_links=[['populations','pop1'],['arms','arm1'],['arms','arm2'],['effects','hr_os']].map(([section,id])=>({section,r2_id:id,r3_id:id,relation:'supplement',evidence:['link-proof']}));
    full.record.sample_sizes=review.counts.map(c=>({...c,population_id:'pop1',result_id:'NA',count_purpose:'outcome_analysis',complete:'yes',disjoint:'yes',method:'reported',cutoff:review.cutoff,evidence:[review.evidence_id]}));
    a.sources.push(full);a.quote=()=>proof.evidence.supporting_quote;return {a,full};
  };
  const {a,full}=setup(),before=JSON.stringify(a.sources),result=enrich(a);
  assert.equal(result.sample_size.n,532);assert.equal(result.sample_size.review_id,review.id);
  assert.deepEqual(result.sample_size.source_refs.map(x=>x.record_id),['n_fas_1','n_fas_2']);
  assert.equal(full.record.effects[0].estimate,'NA');assert.equal(JSON.stringify(a.sources),before);
  for(const change of ['source_hash','count_hash','quote','tuple','count','unaccepted','arm_link','population_link']){
    const {a,full}=setup();
    if(change==='source_hash')a.source.record.source_sha256='changed';if(change==='count_hash')full.record.source_sha256='changed';
    if(change==='quote')a.quote=()=>proof.evidence.supporting_quote+' changed';if(change==='tuple')a.effect.estimate=.77;
    if(change==='count')full.record.sample_sizes[0].n=266;if(change==='unaccepted')full.record.sample_sizes[0].accepted=false;
    if(change==='arm_link')full.record.r2_links=full.record.r2_links.filter(x=>x.r2_id!=='arm2');
    if(change==='population_link')full.record.r2_links=full.record.r2_links.filter(x=>x.section!=='populations');
    assert.equal(enrich(a).sample_size.n,null,change);
  }
});
test('effect-linked randomized pair N is preferred to an unlinked treated denominator',()=>{
  const a=fixture();a.source.record.arms.push({id:'third',population_id:'p'});
  a.source.record.sample_sizes=[['active',314,313],['control',315,311]].flatMap(([arm_id,randomized,treated])=>[
    {id:'rand-'+arm_id,arm_id,population_id:'p',n:randomized,count_purpose:'randomized',disjoint:'yes',evidence:['n-proof']},
    {id:'treated-'+arm_id,arm_id,population_id:'p',n:treated,count_purpose:'treated',disjoint:'yes',evidence:['n-proof']}]);
  a.effect.display_n={count_ids:['rand-active','rand-control'],count_purpose:'randomized',n:629,status:'derived_arm_sum'};
  const r=enrich(a);assert.equal(r.sample_size.n,629);assert.equal(r.sample_size.basis,'sum_of_disjoint_randomized_arms');
  assert.deepEqual(r.sample_size.source_refs.map(x=>x.record_id),['rand-active','rand-control']);
  a.source.record.sample_sizes.find(x=>x.id==='rand-active').accepted=false;
  assert.equal(enrich(a).sample_size.n,null,'an invalid linked count does not get a different unlinked-purpose mate');
});
