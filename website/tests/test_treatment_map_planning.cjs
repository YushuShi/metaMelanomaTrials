'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Planning=require('../dist/treatment_map_planning.js');
const Z95=1.959963984540054,Z80=.8416212335729143;
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
const provenance=(sha='source')=>[{pmid:'1',report_id:'report',stage:'R3',source_sha256:sha}];
function comparison(extra={}){return {id:'c',pmid:'1',outcome:'OS',measure:'HR',estimate:.7,ci_lower:.5,ci_upper:.9,intervention:{node_id:'B'},comparator:{node_id:'A'},analysis:{planning_assumptions:[]},...extra};}
function assumption(extra={}){return {id:'rate',kind:'survival_probability',outcome:'OS',population_id:'p0',arm_role:'comparator',probability:.6,time_months:24,cutoff:'2025-01-01',source_refs:provenance(),...extra};}

test('two-arm HR planning uses Schoenfeld events, the stated allocation and no multiplicity adjustment',()=>{
  const hr=.7,result=Planning.events(hr),expected=(Z95+Z80)**2/(Math.log(hr)**2*.25);
  close(result.unrounded,expected,1e-4);assert.equal(result.events,Math.ceil(expected));
  const unequal=Planning.events(hr,{allocation:2});close(unequal.unrounded,expected*(.25/(2/9)),1e-4);
  const oneSided=Planning.events(hr,{sidedness:1});assert.ok(oneSided.events<result.events);
  const unadjusted=Planning.events(hr,{comparisonCount:10,alpha:.05});assert.equal(unadjusted.events,result.events,'adding comparisons does not silently apply Bonferroni');
  const n=Planning.calculate(hr,'HR',{kind:'overall_event_fraction',probability:.4});assert.equal(n.n,Math.ceil(Math.ceil(expected)/.4));
});
test('one-arm HR benchmark uses historical-null event scale and explicit event probabilities',()=>{
  const p0=.4,hr=.7,p1=1-(1-p0)**hr,expected=(Z95+Z80)**2/Math.log(hr)**2;
  const result=Planning.calculate(hr,'HR',{kind:'reference_probability',probability:p0,fixed_time:true,time_months:24},{arms:1});
  close(result.unrounded,expected,1e-4);assert.equal(result.n,Math.ceil(Math.ceil(expected)/((p0+p1)/2)));assert.match(result.event_basis,/historical-null/);
  close(result.p0,p0);close(result.p1,p1);assert.ok(result.derived_probability);
  const missing=Planning.calculate(hr,'HR',{kind:'overall_event_fraction',probability:.4},{arms:1});assert.equal(missing.n,null);assert.ok(missing.events>0);assert.match(missing.reason,/historical.*planned-arm/);
});
test('time-bound survival probabilities become event probabilities with source polarity preserved on reversal',()=>{
  const c=comparison();c.analysis.planning_assumptions=[assumption(),assumption({id:'target',arm_role:'intervention',probability:.75})];
  const original=JSON.stringify(c),forward=Planning.assumptions(c,'A','B'),reverse=Planning.assumptions(c,'B','A');
  assert.equal(JSON.stringify(c),original);assert.equal(forward[0].kind,'reference_probability');close(forward[0].probability,.4);
  assert.equal(forward[1].kind,'target_probability');close(forward[1].probability,.25);
  assert.equal(reverse[0].kind,'target_probability');assert.equal(reverse[1].kind,'reference_probability');
  const rows=Planning.tableRows([c],{tailId:'B',headId:'A',measure:'HR'});assert.ok(rows.length);close(rows[0].effect,1/.7);
  assert.deepEqual(forward[0].source_refs,c.analysis.planning_assumptions[0].source_refs);
});
test('neutral controls keep their source probabilities and exact rendered endpoint identity',()=>{
  const c=comparison({comparator:{node_id:null,label:'placebo + placebo'}});c.analysis.planning_assumptions=[assumption()];
  const rows=Planning.tableRows([c],{tailId:'control:placebo',headId:'B',measure:'HR'});
  assert.equal(rows.length,1);assert.equal(rows[0].assumption.kind,'reference_probability');close(rows[0].own.p0,.4);assert.ok(rows[0].own.n>0);
});
test('source rates cannot cross endpoints, measures or unshared source bindings',()=>{
  const c=comparison();c.analysis.planning_assumptions=[assumption({id:'wrong-endpoint',outcome:'PFS'}),assumption({id:'wrong-arm',arm_role:'other'})];
  assert.equal(Planning.assumptions(c,'A','B').length,0);
  assert.equal(Planning.tableRows([c],{tailId:'A',headId:'B',measure:'RR'}).length,0);
  c.analysis.planning_assumptions=[assumption({kind:'event_fraction',probability:.4,time_months:null}),assumption({id:'target',kind:'event_fraction',arm_role:'intervention',probability:.3,time_months:null,source_refs:provenance('different')})];
  assert.equal(Planning.assumptions(c,'A','B').length,0,'blank source_binding fields do not prove shared provenance');
  c.analysis.planning_assumptions[1].source_refs=provenance();const paired=Planning.assumptions(c,'A','B');assert.equal(paired.length,1);assert.equal(paired[0].kind,'paired_event_fractions');
  close(paired[0].reference_probability,.4);close(paired[0].target_probability,.3);
});
test('own and pooled planning reuse exactly the same reference probability, including a source target-only rate',()=>{
  const c=comparison({outcome:'ORR',measure:'RR',estimate:2});c.analysis.planning_assumptions=[assumption({kind:'binary_probability',outcome:'ORR',arm_role:'comparator',probability:.2})];
  let [row]=Planning.tableRows([c],{tailId:'A',headId:'B',measure:'RR',pooledEffect:1.5});
  close(row.own.p0,.2);close(row.pooled.p0,.2);close(row.own.p1,.4);close(row.pooled.p1,.3);assert.ok(row.pooled.n>row.own.n);
  c.analysis.planning_assumptions=[assumption({kind:'binary_probability',outcome:'ORR',arm_role:'intervention',probability:.4})];
  [row]=Planning.tableRows([c],{tailId:'A',headId:'B',measure:'RR',pooledEffect:1.5});
  close(row.own.p0,.2);close(row.pooled.p0,.2);close(row.pooled.p1,.3);assert.ok(row.pooled.n>row.own.n);
});
test('HR planning cannot manufacture N from a median, missing rate or unanchored time horizon',()=>{
  const c=comparison();c.analysis.planning_assumptions=[assumption({kind:'median',probability:12,time_months:null})];
  const [row]=Planning.tableRows([c],{tailId:'A',headId:'B',measure:'HR'});assert.equal(row.own.n,null);assert.ok(row.own.events>0);assert.match(row.own.reason,/proportion unavailable/i);
  const noHorizon=Planning.calculate(.7,'HR',{kind:'reference_probability',probability:.4,fixed_time:false});assert.equal(noHorizon.n,null);assert.ok(noHorizon.events>0);
  const explicit=Planning.calculate(.7,'HR',{kind:'reference_probability',probability:.4,fixed_time:true,time_months:24});assert.ok(explicit.n>0);
  const manual=Planning.tableRows([c],{tailId:'A',headId:'B',measure:'HR',manualProbability:.4})[0];assert.equal(manual.own.n,null);
});
test('null effects and impossible probabilities do not become finite sample sizes',()=>{
  const one=Planning.calculate(1,'HR',{kind:'overall_event_fraction',probability:.4});assert.equal(one.n,null);assert.equal(one.events,null);assert.match(one.reason,/HR=1/);
  for(const p of [0,1,-.1,1.1,NaN]){const result=Planning.calculate(.7,'HR',{kind:'overall_event_fraction',probability:p});assert.equal(result.n,null);}
  for(const effect of [0,-1,NaN,Infinity,null])assert.equal(Planning.calculate(effect,'HR',{kind:'overall_event_fraction',probability:.4}).n,null);
  assert.equal(Planning.calculate(3,'RR',{kind:'reference_probability',probability:.4}).n,null);
  assert.equal(Planning.calculate(1,'RR',{kind:'reference_probability',probability:.4}).n,null);
  assert.throws(()=>Planning.settings({manualProbability:1}),/probability/);assert.throws(()=>Planning.settings({dropout:1}),/follow-up/);
});
test('a valid source effect can support single-study planning without a reported effect confidence interval',()=>{
  const c=comparison({ci_lower:null,ci_upper:null,ci_level:null});c.analysis.planning_assumptions=[assumption()];
  const [row]=Planning.tableRows([c],{tailId:'A',headId:'B',measure:'HR'});
  assert.ok(row.own.events>0);assert.ok(row.own.n>0);assert.equal(row.pooled,null);assert.equal(c.ci_lower,null,'planning does not construct a source confidence interval');
});
test('binary one-arm and two-arm calculations retain their distinct designs and planned allocation',()=>{
  const a={kind:'reference_probability',probability:.2,fixed_time:true},two=Planning.calculate(2,'RR',a),one=Planning.calculate(2,'RR',a,{arms:1});
  const expectedOne=Math.ceil((Z95*Math.sqrt(.2*.8)+Z80*Math.sqrt(.4*.6))**2/.2**2);assert.equal(one.n,expectedOne);assert.match(one.method,/historical benchmark/);assert.match(two.method,/Two independent/);assert.ok(two.n>one.n);
  const odds=Planning.calculate(2,'OR',a);close(odds.p1,1/3);assert.notEqual(odds.n,two.n,'OR and RR use distinct response transformations');
  const inflation=Planning.calculate(2,'RR',a,{dropout:.1});assert.equal(inflation.n,Math.ceil(two.n/.9));
});
test('one-arm precision planning finds Wilson half-width with complete fixed-time follow-up',()=>{
  const p=.3,halfWidth=.05,result=Planning.calculate(1,'HR',{kind:'target_probability',probability:p,fixed_time:true,time_months:24},{arms:1,mode:'precision',precision:halfWidth});
  assert.ok(result.n>0);assert.match(result.method,/Wilson/);const half=n=>Z95*Math.sqrt(p*(1-p)/n+Z95**2/(4*n*n))/(1+Z95**2/n);
  assert.ok(half(result.n)<=halfWidth);assert.ok(half(result.n-1)>halfWidth);
  const unobserved=Planning.calculate(.7,'HR',{kind:'target_probability',probability:p,fixed_time:false},{arms:1,mode:'precision'});assert.equal(unobserved.n,null);assert.match(unobserved.reason,/complete follow-up/);
});
test('manual one-arm precision uses the planned-arm probability directly and needs no comparative effect',()=>{
  const a={kind:'expected_probability',probability:.3,fixed_time:true,time_months:24};
  const standalone=Planning.calculate(null,'HR',a,{arms:1,mode:'precision'});assert.ok(standalone.n>0);close(standalone.p1,.3);assert.equal(standalone.p0,null);
  const [row]=Planning.tableRows([comparison()],{tailId:'A',headId:'B',measure:'HR',arms:1,mode:'precision',manualExpectedProbability:.3,manualHorizon:24,pooledEffect:.8});
  assert.equal(row.assumption.kind,'expected_probability');assert.equal(row.own.n,standalone.n);assert.equal(row.pooled.n,standalone.n,'fixed precision of one stated probability does not depend on the pooled HR');
  assert.throws(()=>Planning.settings({manualExpectedProbability:1}),/expected planned-arm probability/);
});

test('target-only survival scenarios preserve the reported survival rate beside the derived reference event probability',()=>{
 const c=comparison();c.analysis.planning_assumptions=[assumption({arm_role:'intervention',probability:.75})];
 const [row]=Planning.tableRows([c],{tailId:'A',headId:'B',measure:'HR',pooledEffect:.8});
 close(row.assumption.source_probability,.75);close(row.own.p1,.25);
 close(row.own.p0,row.pooled.p0);assert.match(row.assumption.label,/reference derived once/);
});
