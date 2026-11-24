'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Planning=require('../dist/treatment_map_planning.js'),Evidence=require('../dist/treatment_network_evidence.js');
const plan=(measure,estimate,comparisons=[],settings={})=>Planning.indirect({first:'A',second:'C',measure,estimate,comparisons,settings});

test('indirect HR planning uses the full precision estimate, rounds required events upward and applies saved design settings',()=>{
  const hr=.8733833639033913;
  const standard=plan('HR',hr);
  assert.equal(standard.label,'E=1,713');
  assert.equal(standard.unit,'events');
  assert.equal(plan('HR',1/hr).min,standard.min);
  const values={power:.9,allocation_ratio:2,sidedness:1,alpha:.01};
  assert.equal(plan('HR',hr,[],values).min,Planning.events(hr,{...values,allocation:2}).events);
  assert.ok(Planning.defaultIndirectSettings({arms:2,allocation_ratio:1,alpha:.05,power:.8}));
  assert.equal(Planning.defaultIndirectSettings(values),false);
  assert.equal(plan('HR',1).min,null);
  const historical=plan('HR',hr,[],{arms:1});
  assert.equal(historical.min,Planning.events(hr,{arms:1}).events);
  assert.match(historical.detail,/historical-null/);
});

test('binary N uses only reported risks for the second regimen on the selected network comparisons',()=>{
  const edges=[
    {planningRates:[{regimen:'A',probability:.6,pmid:'1'},{regimen:'B',probability:.52,pmid:'1'}]},
    {planningRates:[{regimen:'C',probability:.2,pmid:'2'}]},
    {planningRates:[{regimen:'C',probability:.2,pmid:'2'},{regimen:'C',probability:.3,pmid:'3'}]}
  ];
  for(const measure of ['RR','OR']) {
    const result=plan(measure,1.5,edges),compute=p=>Planning.calculate(1.5,measure,{kind:'reference_probability',probability:p}).n;
    assert.match(result.label,/^N=.+–/);assert.equal(result.scenarios.length,2);
    assert.deepEqual([result.min,result.max],[compute(.2),compute(.3)].sort((a,b)=>a-b));
    assert.equal(plan(measure,1.5,[edges[0]]).min,null);
    assert.equal(plan(measure,1.5,edges,{manualProbability:.35}).min,compute(.35));
    assert.equal(plan(measure,1.5,[edges[1]]).min,compute(.2));
  }
  assert.equal(plan('RR',4,[edges[2]],{manualProbability:.8}).min,null);
  assert.equal(plan('RR',1,edges).min,null);
});

test('legacy one-arm preferences use historical testing and keep the saved reference risk',()=>{
  const stored={arms:1,mode:'precision',manualExpectedProbability:.25,manualHorizon:12,plannedSide:'reported',manualProbability:.3};
  const settings=Planning.indirectSettings(stored);
  assert.equal(settings.mode,'benchmark');assert.equal(settings.plannedSide,'head');
  assert.equal(settings.manualExpectedProbability,null);assert.equal(settings.manualHorizon,null);
  assert.equal(settings.manualProbability,.3);
  const result=plan('HR',.7,[],stored);
  assert.equal(result.unit,'events');assert.equal(result.min,Planning.events(.7,{arms:1}).events);
  assert.equal(plan('RR',1.5,[],stored).min,Planning.calculate(1.5,'RR',{kind:'reference_probability',probability:.3},{arms:1}).n);
});

test('eligible network arms carry compatible binary risks including on reconstructed multi-arm contrasts',()=>{
  const records=[];
  function add(trial,a,b,p,q) {
    const arm=id=>({node_id:id,label:id,arm_id:id});
    records.push({id:'r'+records.length,pmid:String(100+records.length),study_name:trial,intervention:arm(a),comparator:arm(b),outcome:'ORR',measure:'RR',
      estimate:p/q,ci_level:95,ci_lower:(p/q)*.8,ci_upper:(p/q)*1.25,source_refs:[],
      calculation:{method:'from_arm_binary_outcomes',intervention:{numerator:p,denominator:100},reference:{numerator:q,denominator:100}},
      analysis:{design:'randomized_trial',independent_id:trial,independence_verified:true,compatibility:{eligible:true},
        analysis_cutoff:'2020-01-01',cohort:{id:trial+'|overall',root_id:trial,is_subgroup:false}}});
  }
  add('three','A','B',40,20);add('three','C','B',30,20);add('two','C','D',15,12);
  const graph={nodes:['A','B','C','D'].map(id=>({id,label:id,type:'drug'})),comparisons:records};
  const pair=Evidence.build(graph,{endpoint:'ORR:RR'}).forPair('A','D');
  const inferred=pair.comparisons.find(e=>e.studyRow.reconstructed);
  assert.deepEqual(inferred.planningRates.map(r=>[r.regimen,r.probability]),[['A',.4],['C',.3]]);
});
