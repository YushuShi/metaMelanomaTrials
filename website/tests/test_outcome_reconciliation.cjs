const test=require('node:test');
const assert=require('node:assert/strict');
const reconcile=require('../dist/outcome_reconciliation.js');

function fixture({a=[1.4,1,2],b=[1.38,1.02,1.97],qa='Median PFS 1.4 months (95% CI, 1.0–2.0).',qb='Median PFS 1.38 months (95% CI, 1.02–1.97).',relation='supplement',section='survival'}={}){
  const registry={},wrappers=[],rows=[];
  for(let i=0;i<2;i++){
    const stage=i?'R3':'R2',source=String(i+1).repeat(64),binding=String(i+3).repeat(64),prefix='CE-'+binding.slice(0,24)+'-',id=i?'b':'a',values=i?b:a;
    const q={id,population_id:'p',arm_id:'arm',endpoint:'PFS',endpoint_definition:'Progression-free survival',kind:'median',unit:'months',time:'NA',time_unit:'NA',cutoff:'NA',estimate:values[0],ci_lower:values[1],ci_upper:values[2],ci_level:95,field_flags:[],evidence:['span-'+id]};
    if(section==='binary'){delete q.kind;delete q.estimate;q.percentage=values[0];q.numerator='NA';q.denominator=100;q.endpoint='ORR';q.endpoint_definition='Objective response';q.unit='percent';}
    const record={stage,source_sha256:source,report_id:'report-test',survival:[],effects:[],binary:[],derivations:[],r2_links:[]};record[section]=[q];
    if(i)record.r2_links=[{section,r2_id:'a',r3_id:'b',relation,evidence:['span-b']},...['populations','arms'].map(s=>({section:s,r2_id:s==='arms'?'arm':'p',r3_id:s==='arms'?'arm':'p',relation:'same',evidence:['span-b']}))];
    wrappers.push({stage,record,...(i?{source_proof_ref:{sha256:'f'.repeat(64)}}:{})});
    registry[prefix+'span-'+id]={source_id:'report-test:main:source',block_id:'b00001',supporting_quote:i?qb:qa};
    rows.push({pmid:'1',report_id:'report-test',result_id:prefix+id,review_stage:stage,source_input_sha256:source,review_binding_sha256:binding,quantitative_record:q,estimate:{value:values[0],raw_text:String(values[0]),qualifier:'equal'},measure:section==='binary'?'ORR':'median'});
  }
  return {rows,study:{details:{quantitative_extraction:wrappers}},registry};
}
function generated(f,{sameSource=false,extra=[]}={}){
  if(sameSource){
    const [a,b]=f.rows,oldPrefix='CE-'+b.review_binding_sha256.slice(0,24)+'-',newPrefix='CE-'+a.review_binding_sha256.slice(0,24)+'-';
    f.registry[newPrefix+'span-b']=f.registry[oldPrefix+'span-b'];b.review_stage=a.review_stage;b.source_input_sha256=a.source_input_sha256;b.review_binding_sha256=a.review_binding_sha256;b.result_id=newPrefix+'b';
    f.study.details.quantitative_extraction[0].record.survival.push(b.quantitative_record);f.study.details.quantitative_extraction.splice(1,1);
  }
  for(const row of f.rows){row.extraction_conflict=true;row.source_reported_numbers=['estimate','ci_lower','ci_upper','ci_level'].filter(field=>typeof row.quantitative_record[field]==='number').map(field=>({role:field==='ci_level'?'confidence_level':field,value:row.quantitative_record[field],status:'reported',qualifier:'equal',unit:field==='ci_level'?'%':'months',raw_text:String(row.quantitative_record[field])}));}
  f.study.details.clinical_extraction_conflicts=[{result_ids:[...f.rows.map(r=>r.result_id),...extra],reason:'Different extracted values for the same source-linked clinical context; no averaging.'}];
  f.study.details.quantitative_results=f.rows;return f;
}
test('source precision retains trailing zeroes and scientific notation',()=>{
  assert.equal(reconcile.decimalLiteral('1.0').step,.1);assert.equal(reconcile.decimalLiteral('1.00').step,.01);assert.equal(reconcile.decimalLiteral('1.20e-2').step,.0001);
});
test('one more precise complete tuple replaces a rounded tuple without raw mutation',()=>{
  const f=fixture(),before=JSON.stringify(f),result=reconcile.reconcile(f.rows,f);
  assert.equal(result.rows.length,1);assert.equal(result.rows[0],f.rows[1]);assert.deepEqual(result.groups[0].members,f.rows);assert.equal(result.groups[0].proofs[0].kind,'source_rounding_equivalence');assert.equal(JSON.stringify(f),before);
  assert.equal(result.groups[0].proofs[0].comparisons[1].a.source_literal,'1.0');
});
test('synthesized numeric raw_text cannot establish source precision',()=>{
  const f=fixture({qa:'The estimate is reported elsewhere.'});assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('precision from another binding or another report cannot be used',()=>{
  const f=fixture();Object.values(f.registry)[0].source_id='other-report:main:x';assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('nonoverlapping source rounding intervals do not become equivalent through epsilon',()=>{
  const f=fixture({a:[1.4,1,2],b:[1.46,1.02,1.97],qb:'Median PFS 1.46 months (95% CI, 1.02–1.97).'});assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('values at the same precision remain different',()=>{
  const f=fixture({a:[1.38,1.02,1.97],b:[1.39,1.02,1.97],qa:'Median PFS 1.38 (1.02–1.97).',qb:'Median PFS 1.39 (1.02–1.97).'});assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('interval bounds are never mixed between competing tuples',()=>{
  const f=fixture({a:[1.38,1,1.97],b:[1.4,1.02,2],qa:'Median 1.38 (1.0–1.97).',qb:'Median 1.4 (1.02–2.0).'});assert.equal(reconcile.compare(...f.rows,f).reason,'no_single_dominant_tuple');
});
test('a result-linked full interval can complete a missing abstract interval',()=>{
  const f=fixture({a:[1.38,'NA','NA'],qa:'Median 1.38 months.'});assert.equal(reconcile.reconcile(f.rows,f).rows[0],f.rows[1]);
});
test('an unlinked incomplete tuple is not silently completed',()=>{
  const f=fixture({a:[1.38,'NA','NA']});f.study.details.quantitative_extraction[1].record.r2_links=[];assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
for(const [field,value] of [['endpoint','OS'],['kind','survival_probability'],['cutoff','2026-01-01'],['time',12],['model','Adjusted Cox'],['response_criteria','iRECIST'],['ci_level',90],['analysis_n',99]])test('distinct '+field+' remains separate',()=>{
  const f=fixture();if(field==='analysis_n'){f.rows[0].quantitative_record.analysis_n=100;}else if(['cutoff','time','model','response_criteria'].includes(field))f.rows[0].quantitative_record[field]=field==='time'?6:'different known value';
  f.rows[1].quantitative_record[field]=value;assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('intracranial and extracranial endpoints cannot be merged by a mistaken link',()=>{
  const f=fixture();f.rows[0].quantitative_record.endpoint_definition='Intracranial PFS';f.rows[1].quantitative_record.endpoint_definition='Extracranial PFS';assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('a unique source-bound result link is required to bridge unknown endpoint wording',()=>{
  const f=fixture();f.rows[0].quantitative_record.endpoint_definition='NA';assert.equal(reconcile.reconcile(f.rows,f).rows.length,1);f.study.details.quantitative_extraction[1].record.r2_links=[];assert.equal(reconcile.reconcile(f.rows,{...f,scopeFor:()=> 'canonical-cohort'}).rows.length,2);
});
test('one-to-many links fail closed',()=>{
  const f=fixture();f.study.details.quantitative_extraction[1].record.r2_links.push({section:'survival',r2_id:'a',r3_id:'c',relation:'supplement',evidence:['span-b']});assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('missing accepted R3 source proof prevents cross-source result-link resolution',()=>{
  const f=fixture();delete f.study.details.quantitative_extraction[1].source_proof_ref;assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('explicit equivalent numeric conflicts can be resolved but unrelated field holds remain',()=>{
  const f=fixture({relation:'conflict'});f.rows[1].quantitative_record.field_flags=[{field:'estimate',code:'numerical_conflict'}];let r=reconcile.reconcile(f.rows,f);assert.equal(r.groups[0].suppress_display_conflict,true);
  f.rows[1].quantitative_record.field_flags.push({field:'analysis_n',code:'source_number_not_supported'});r=reconcile.reconcile(f.rows,f);assert.equal(r.groups[0].suppress_display_conflict,true);assert.equal(r.groups[0].proofs[0].conflict_resolution.other_validation_flags.length,1);
  f.rows[1].quantitative_record.field_flags.push({field:'estimate',code:'unknown_field_hold'});r=reconcile.reconcile(f.rows,f);assert.equal(r.groups[0].suppress_display_conflict,false);
});
test('unknown row conflict is never declared resolved solely by identical values',()=>{
  const f=fixture({a:[1.38,1.02,1.97],qa:'1.38 (1.02–1.97).'});f.rows[1].extraction_conflict=true;assert.equal(reconcile.reconcile(f.rows,f).groups[0].suppress_display_conflict,false);
});
test('counts are exact, not continuous rounded estimates',()=>{
  const f=fixture({a:[10,'NA','NA'],b:[10.1,'NA','NA'],section:'binary',qa:'10 patients.',qb:'10.1 patients.'});for(const row of f.rows){row.quantitative_record.numerator=row.quantitative_record.percentage;row.quantitative_record.percentage='NA';}assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('explicit time conversion carries original source precision into canonical months',()=>{
  const f=fixture({a:[1.38,1.02,1.97],b:[1.4,1,2],qa:'Median 42 days (31–60 days).',qb:'Median 1.4 months (1.0–2.0).'}),record=f.study.details.quantitative_extraction[0].record;
  const factor=12/365.25;for(const [field,original] of [['estimate',42],['ci_lower',31],['ci_upper',60]]){f.rows[0].quantitative_record[field]=original*factor;record.derivations.push({section:'survival',id:'a',field,method:'time_to_months',original,original_unit:'days',value:original*factor});}
  const r=reconcile.reconcile(f.rows,f);assert.equal(r.rows.length,1);assert.equal(r.rows[0],f.rows[0]);assert.equal(r.groups[0].proofs[0].comparisons[0].a.derivation.method,'time_to_months');
});
test('unrecorded unit conversion does not infer precision from unrelated numbers',()=>{
  const f=fixture({qa:'Median 42 days (31–60 days).'});assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('complete-link grouping cannot bridge incompatible precise values',()=>{
  const f=fixture(),third=structuredClone(f.rows[1]);third.quantitative_record={...third.quantitative_record,id:'c',estimate:1.42};third.result_id+='c';third.review_stage='R2';third.source_input_sha256=f.rows[0].source_input_sha256;third.review_binding_sha256=f.rows[0].review_binding_sha256;
  f.study.details.quantitative_extraction[0].record.survival.push(third.quantitative_record);f.rows.push(third);assert.ok(reconcile.reconcile(f.rows,f).groups.every(g=>!(g.members.includes(f.rows[1])&&g.members.includes(third))));
});
test('qualified inequalities cannot become exact numerical duplicates',()=>{
  const f=fixture();f.rows[0].estimate.qualifier='less_than';assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('a result link cannot reverse independently linked treatment roles',()=>{
  const f=fixture();for(const row of f.rows){const q=row.quantitative_record;delete q.arm_id;q.intervention_arm_id='arm';q.reference_arm_id='control';}
  f.rows[1].quantitative_record.intervention_arm_id='control';f.rows[1].quantitative_record.reference_arm_id='arm';assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
});
test('latest selection uses source-confirmed cutoff chronology and retains earlier alternatives',()=>{
  const f=fixture({a:[12,10,14],b:[16,13,20],qa:'At the June 27, 2017 cutoff, median PFS was 12 (10–14).',qb:'At the January 27, 2020 cutoff, median PFS was 16 (13–20).'});
  f.rows[0].quantitative_record.cutoff='2017-06-27';f.rows[1].quantitative_record.cutoff='2020-01-27';const result=reconcile.selectOutcome(f.rows,f);assert.equal(result.status,'selected');assert.equal(result.representative,f.rows[1]);assert.deepEqual(result.alternatives,f.rows);assert.equal(result.selection_proof.kind,'latest_source_supported_analysis');
});
test('R3 stage alone cannot resolve a genuine numerical disagreement',()=>{
  const f=fixture({a:[12,10,14],b:[16,13,20],qa:'Median PFS 12 (10–14).',qb:'Median PFS 16 (13–20).'});const result=reconcile.selectOutcome(f.rows,f);assert.equal(result.status,'review_needed');assert.equal(result.representative,null);assert.deepEqual(result.alternatives,f.rows);
});
test('a missing earlier cutoff does not imply the other result is latest',()=>{
  const f=fixture({a:[12,10,14],b:[16,13,20],qb:'At the January 27, 2020 cutoff, median PFS was 16 (13–20).'});f.rows[1].quantitative_record.cutoff='2020-01-27';assert.equal(reconcile.selectOutcome(f.rows,f).status,'review_needed');
});
test('an extracted cutoff without source support cannot establish chronology',()=>{
  const f=fixture({a:[12,10,14],b:[16,13,20]});f.rows[0].quantitative_record.cutoff='2017-06-27';f.rows[1].quantitative_record.cutoff='2020-01-27';assert.equal(reconcile.selectOutcome(f.rows,f).status,'review_needed');
});
test('same-date incompatible full tuples remain unresolved',()=>{
  const f=fixture({a:[12,10,14],b:[16,13,20],qa:'2020-01-27: 12 (10–14).',qb:'2020-01-27: 16 (13–20).'});for(const row of f.rows)row.quantitative_record.cutoff='2020-01-27';assert.equal(reconcile.selectOutcome(f.rows,f).representative,null);
});
test('latest result cannot promote an unsupported quantitative field',()=>{
  const f=fixture({a:[12,10,14],b:[16,13,20],qa:'2017-06-27: 12 (10–14).',qb:'2020-01-27: 16 (13–20).'});f.rows[0].quantitative_record.cutoff='2017-06-27';f.rows[1].quantitative_record.cutoff='2020-01-27';f.rows[1].quantitative_record.field_flags=[{field:'estimate',code:'source_number_not_supported'}];assert.equal(reconcile.selectOutcome(f.rows,f).representative,null);
});
test('horizons remain different even when a later analysis has a later cutoff',()=>{
  const f=fixture();f.rows[0].quantitative_record.time=12;f.rows[1].quantitative_record.time=24;assert.equal(reconcile.selectOutcome(f.rows,f).status,'distinct_scopes');
});
test('explicit endpoint semantics give distinct useful keys',()=>{
  const f=fixture();f.rows[0].quantitative_record.endpoint_definition='First progression-free survival';f.rows[1].quantitative_record.endpoint_definition='Total progression-free survival';assert.equal(reconcile.semanticOutcome(f.rows[0],f).label,'First PFS');assert.equal(reconcile.semanticOutcome(f.rows[1],f).label,'Total PFS');assert.equal(reconcile.selectOutcome(f.rows,f).status,'distinct_scopes');
});
test('stable row keys include source, stage, binding and extraction ID',()=>{
  const f=fixture();assert.notEqual(reconcile.rowKey(f.rows[0]),reconcile.rowKey(f.rows[1]));assert.equal(reconcile.rowKey(f.rows[0]),reconcile.rowKey(structuredClone(f.rows[0])));
});
test('probability to percentage rounding requires an explicit derivation',()=>{
  const f=fixture({a:[13,'NA','NA'],b:[12.8,'NA','NA'],section:'binary',qa:'Response was 13%.',qb:'The response probability was .128.'});
  assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);
  f.study.details.quantitative_extraction[1].record.derivations.push({section:'binary',id:'b',field:'percentage',method:'proportion_to_percent',original:.128,value:12.8});
  const result=reconcile.reconcile(f.rows,f);assert.equal(result.rows.length,1);assert.equal(result.rows[0],f.rows[1]);assert.equal(result.groups[0].proofs[0].comparisons[0].b.source_literal,'.128');
});
test('source endpoint rules require exact source bindings and literal anchors',()=>{
  const rule=require('../dist/outcome_source_rules.js')[0];
  const q={id:rule.raw_result_id,population_id:rule.population_id,arm_id:rule.arm_id,endpoint:rule.endpoint,endpoint_definition:'NA',kind:'median'};
  const row={pmid:rule.pmid,result_id:rule.canonical_result_id,report_id:rule.evidence[0].source_id.split(':')[0],review_stage:'R3',source_input_sha256:rule.source_sha256,review_binding_sha256:rule.review_binding_sha256,quantitative_record:q};
  const registry=Object.fromEntries(rule.evidence.map(e=>[e.id,{source_id:e.source_id,block_id:e.block_id,supporting_quote:e.supporting_quote}]));
  const study={details:{quantitative_extraction:[{stage:'R3',source_proof_ref:{sha256:'f'.repeat(64)},record:{source_sha256:rule.source_sha256,survival:[q]}}]}};
  assert.equal(reconcile.semanticOutcome(row,{study,registry}).key,rule.semantic_endpoint_key);
  registry[rule.evidence[0].id].supporting_quote+=' Changed.';assert.equal(reconcile.semanticOutcome(row,{study,registry}).specific,false);
});
test('declared final analysis supersedes interim only with source support',()=>{
  const f=fixture({a:[12,10,14],b:[16,13,20],qa:'Interim analysis: median 12 (10–14).',qb:'Final analysis: median 16 (13–20).'});f.rows[0].quantitative_record.cutoff='interim analysis';f.rows[1].quantitative_record.cutoff='final analysis';assert.equal(reconcile.selectOutcome(f.rows,f).representative,f.rows[1]);
});
test('recognized generated rounding warnings resolve only with the complete source member set',()=>{
  const f=generated(fixture(),{sameSource:true}),result=reconcile.reconcile(f.rows,f);assert.equal(result.groups[0].suppress_display_conflict,true);assert.equal(reconcile.conflictStatus(f.rows[0],f).resolved,true);
  f.study.details.clinical_extraction_conflicts[0].result_ids.push('missing-source-result');assert.equal(reconcile.reconcile(f.rows,f).groups[0].suppress_display_conflict,false);assert.equal(reconcile.conflictStatus(f.rows[0],f).resolved,false);
});
test('same-source generated missing-CI warning can prefer the entire complete tuple',()=>{
  const f=fixture({a:[1.38,'NA','NA'],qa:'Median PFS1.38.'});f.rows[0].quantitative_record.ci_level='NA';f.rows[0].ci_lower={value:null,qualifier:'not_reported'};f.rows[0].ci_upper={value:null,qualifier:'not_reported'};generated(f,{sameSource:true});const result=reconcile.reconcile(f.rows,f);assert.equal(result.rows.length,1);assert.equal(result.rows[0],f.rows[1]);assert.equal(reconcile.conflictStatus(f.rows[1],f).resolved,true);
});
test('unaccounted p-value discrepancy prevents generated conflict suppression',()=>{
  const f=generated(fixture(),{sameSource:true});f.rows[0].source_reported_numbers.push({role:'p_value',value:.6,status:'reported',qualifier:'equal'});f.rows[1].source_reported_numbers.push({role:'p_value',value:.62,status:'reported',qualifier:'equal'});assert.equal(reconcile.conflictStatus(f.rows[0],f).resolved,false);assert.equal(reconcile.reconcile(f.rows,f).groups[0].suppress_display_conflict,false);
});
test('source-defined different outcomes clear only their generated false warning',()=>{
  const f=generated(fixture(),{sameSource:true});f.rows[0].quantitative_record.endpoint_definition='Intracranial PFS';f.rows[1].quantitative_record.endpoint_definition='Extracranial PFS';assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);assert.equal(reconcile.conflictStatus(f.rows[0],f).resolved,true);
  f.rows[1].quantitative_record.field_flags=[{field:'estimate',code:'unknown_validation_problem'}];assert.equal(reconcile.conflictStatus(f.rows[0],f).resolved,false);
});
test('dated latest analyses may preserve their own different confidence level',()=>{
  const f=fixture({a:[12,10,14],b:[16,13,20],qa:'2017-06-27: 12 (10–14).',qb:'2020-01-27: 16 (13–20).'});f.rows[0].quantitative_record.cutoff='2017-06-27';f.rows[1].quantitative_record.cutoff='2020-01-27';f.rows[1].quantitative_record.ci_level=90;assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);assert.equal(reconcile.selectOutcome(f.rows,f).representative,f.rows[1]);assert.equal(f.rows[1].quantitative_record.ci_level,90);
});
test('saved export actions resolve inherited flags only for all explicitly accounted fields',()=>{
  const f=fixture();for(const row of f.rows)row.extraction_conflict=true;
  const action={pmid:'1',section:'survival',r2_id:'a',r3_id:'b',relation:'supplement',display_action:'conflict_preserved',fields:['estimate','ci_lower','ci_upper'],evidence:['span-b']};
  f.study.details.outcome_display_reconciliation=[action];f.study.details.quantitative_results=f.rows;
  assert.equal(reconcile.reconcile(f.rows,f).groups[0].suppress_display_conflict,true);assert.equal(reconcile.conflictStatus(f.rows[0],f).resolved,true);
  action.fields.push('p_value');f.rows[0].quantitative_record.p_value=.6;f.rows[1].quantitative_record.p_value=.62;assert.equal(reconcile.reconcile(f.rows,f).groups[0].suppress_display_conflict,false);assert.equal(reconcile.conflictStatus(f.rows[0],f).resolved,false);
});
test('exported conflict provenance cannot use another action or unidentified fields',()=>{
  const f=fixture();for(const row of f.rows)row.extraction_conflict=true;
  const action={pmid:'other',section:'survival',r2_id:'a',r3_id:'b',relation:'supplement',display_action:'conflict_preserved',fields:['estimate'],evidence:['span-b']};f.displayReconciliation=[action];
  assert.equal(reconcile.reconcile(f.rows,f).groups[0].suppress_display_conflict,false);action.pmid='1';action.fields=[];assert.equal(reconcile.reconcile(f.rows,f).groups[0].suppress_display_conflict,false);
});
test('unqualified same-source endpoint codes cannot merge potentially different compartments',()=>{
  const f=generated(fixture(),{sameSource:true});for(const row of f.rows)row.quantitative_record.endpoint_definition='NA';assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);assert.equal(reconcile.conflictStatus(f.rows[0],f).resolved,false);
});
test('identical unqualified tuples may share a display without claiming scientific equivalence',()=>{
  const f=generated(fixture({a:[1.38,1.02,1.97],qa:'1.38 (1.02–1.97).'}),{sameSource:true});for(const row of f.rows)row.quantitative_record.endpoint_definition='NA';const result=reconcile.reconcile(f.rows,f);assert.equal(result.rows.length,1);assert.equal(result.groups[0].proofs[0].kind,'identical_display_tuple');assert.equal(result.groups[0].proofs[0].scientific_equivalence,false);
});
test('reported percentage completes a count display only with identical known count and denominator',()=>{
  const f=fixture({a:[1,'NA','NA'],b:[4.2,'NA','NA'],section:'binary',qa:'One response among 24 patients.',qb:'One of24 patients responded (4.2%).'});f.rows[0].measure='participant_count';f.rows[0].quantitative_record.percentage='NA';for(const row of f.rows){row.quantitative_record.numerator=1;row.quantitative_record.denominator=24;}
  let result=reconcile.reconcile(f.rows,f);assert.equal(result.rows.length,1);assert.equal(result.rows[0],f.rows[1]);assert.equal(result.groups[0].proofs[0].kind,'reported_percentage_completion');
  f.rows[0].quantitative_record.denominator='NA';result=reconcile.reconcile(f.rows,f);assert.equal(result.rows.length,2);
});
test('confirmed and unconfirmed or injected and non-injected responses are distinct endpoints',()=>{
  const f=fixture({section:'binary'});for(const [a,b]of [['Confirmed objective response','Unconfirmed objective response'],['Response in injected lesions','Response in non-injected lesions']]){f.rows[0].quantitative_record.endpoint_definition=a;f.rows[1].quantitative_record.endpoint_definition=b;assert.notEqual(reconcile.semanticOutcome(f.rows[0],f).key,reconcile.semanticOutcome(f.rows[1],f).key);assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);}
});
test('supported abstract tuple remains available when its duplicate full-text tuple has a held numeric field',()=>{
  const f=fixture({a:[1.38,1.02,1.97],qa:'1.38 (1.02–1.97).'});f.rows[1].quantitative_record.field_flags=[{field:'estimate',code:'source_number_not_supported'}];const result=reconcile.selectOutcome(f.rows,f);assert.equal(result.status,'selected');assert.equal(result.representative,f.rows[0]);assert.equal(result.groups[0].representative_selection.kind,'supported_member_fallback');assert.deepEqual(result.groups[0].members,f.rows);
});
test('different source precision intervals may overlap across a rounding boundary',()=>{
  const f=fixture({a:[14,'NA','NA'],b:[14.5,'NA','NA'],qa:'Median 14 months.',qb:'Median 14.5 months.'});assert.equal(reconcile.reconcile(f.rows,f).rows.length,1);
});
test('missing confirmation adjective does not create an unconfirmed response outcome',()=>{
  const f=fixture({section:'binary'});f.rows[0].quantitative_record.endpoint_definition='Confirmed overall response';f.rows[1].quantitative_record.endpoint_definition='Overall response';assert.equal(reconcile.semanticOutcome(f.rows[0],f).key,reconcile.semanticOutcome(f.rows[1],f).key);
});
test('explicit source month representation outranks extra digits from a conversion convention',()=>{
  const f=fixture({a:[6.4,'NA','NA'],b:[191*12/365.25,4,8],qa:'Median PFS was 6.4 months.',qb:'Median PFS was 191 days (6.4 months), with reported interval.'});
  f.study.details.quantitative_extraction[1].record.derivations.push({section:'survival',id:'b',field:'estimate',method:'time_to_months',original:191,original_unit:'days',value:191*12/365.25});
  const result=reconcile.reconcile(f.rows,f);assert.equal(result.rows.length,1);assert.equal(result.rows[0],f.rows[0]);assert.equal(result.groups[0].proofs[0].kind,'explicit_source_unit_equivalence');assert.equal(f.rows[1].quantitative_record.ci_lower,4);
});
test('ordinary first-progression and overall-response wording does not manufacture endpoint types',()=>{
  const f=fixture();f.rows[0].quantitative_record.endpoint_definition='Time from randomization to first progression or death';assert.equal(reconcile.semanticOutcome(f.rows[0],f).key,'pfs');f.rows[0].quantitative_record.endpoint='ORR';f.rows[0].quantitative_record.endpoint_definition='Best overall response';assert.equal(reconcile.semanticOutcome(f.rows[0],f).key,'orr');
});
test('prepared display clones and raw rows do not make unique source links appear ambiguous',()=>{
  const f=fixture();f.study.details.quantitative_results=f.rows;const clones=structuredClone(f.rows);for(const row of clones)row.quantitative_record.endpoint_definition='NA';f.rows[1].quantitative_record.endpoint_definition='NA';const result=reconcile.reconcile(clones,{...f,rows:clones});assert.equal(result.rows.length,1);
});
test('a source-dated later response may have a different response count in the same denominator',()=>{
  const f=fixture({a:[10,'NA','NA'],b:[20,'NA','NA'],section:'binary',qa:'2017-06-27: response10%.',qb:'2020-01-27: response20%.'});for(let i=0;i<2;i++){f.rows[i].quantitative_record.numerator=i?20:10;f.rows[i].quantitative_record.cutoff=i?'2020-01-27':'2017-06-27';}assert.equal(reconcile.reconcile(f.rows,f).rows.length,2);assert.equal(reconcile.selectOutcome(f.rows,f).representative,f.rows[1]);
});
test('explicit unit pair remains valid when its parenthesis also contains a confidence interval',()=>{
  const f=fixture({a:[6.4,'NA','NA'],b:[191*12/365.25,4,8],qa:'Median OS was 6.4 months.',qb:'Median OS was 191 days (6.4 months; 95% CI:168–314).'});f.study.details.quantitative_extraction[1].record.derivations.push({section:'survival',id:'b',field:'estimate',method:'time_to_months',original:191,original_unit:'days',value:191*12/365.25});const result=reconcile.reconcile(f.rows,f);assert.equal(result.rows.length,1);assert.equal(result.rows[0],f.rows[0]);
});
test('an absent held confidence bound stays NA separately from a resolved estimate conflict',()=>{
  const f=fixture({a:[14,'NA','NA'],b:[13.5,'NA','NA'],qa:'Estimate 14.',qb:'Estimate 13.5.',relation:'conflict'});f.rows[1].quantitative_record.field_flags=[{field:'ci_lower',code:'source_number_not_supported'}];const result=reconcile.reconcile(f.rows,f);assert.equal(result.rows.length,1);assert.equal(result.groups[0].suppress_display_conflict,true);assert.equal(result.groups[0].proofs[0].conflict_resolution.other_validation_flags[0].field,'ci_lower');assert.equal(f.rows[1].quantitative_record.ci_lower,'NA');
});
