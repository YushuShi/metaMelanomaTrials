'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {fit,projectTrial} = require('../dist/treatment_network_model.js');
const {routeGraph,routes,fitRoute} = require('../dist/treatment_network_pathways.js');
const close = (x,y) => assert.ok(Math.abs(x-y) < 1e-9, x+' differs from '+y);
const contrast = (treatment,comparator,estimate) => ({treatment,comparator,logEffect:Math.log(estimate)});
const trial = (trialId,treatment,comparator,estimate) =>
  ({trialId,contrasts:[contrast(treatment,comparator,estimate)],covariance:[[.04]]});
const edges = blocks => blocks.flatMap(block=>block.contrasts.map(row=>({...row,trialId:block.trialId})));
const enumerate = (comparisons,a,b) => [...routes(routeGraph({comparisons}),a,b)];

test('pathways group independent replications by regimen and exclude off-path evidence',()=>{
  const blocks=[trial('ab1','A','B',.8),trial('ab2','B','A',1.25),trial('cb','C','B',.5),
    trial('ad','A','D',1),trial('cd','C','D',1),trial('xe','X','E',2),trial('ex','E','A',1)];
  const found=enumerate(edges(blocks),'A','C');
  assert.deepEqual(found.map(r=>r.regimens),[['A','B','C'],['A','D','C']]);
  assert.deepEqual(enumerate(edges(blocks).reverse(),'A','C').map(r=>r.regimens),found.map(r=>r.regimens));
  const first=fitRoute(found[0],blocks),second=fitRoute(found[1],blocks);
  assert.equal(first.trialCount,3);
  close(first.estimate,1.6);
  close(first.se,Math.sqrt(.06));
  close(second.estimate,1);
  const network=fit(blocks,'A','C');
  assert.ok(network.estimate>second.estimate && network.estimate<first.estimate);
  assert.equal(fitRoute(found[0],blocks,'random').available,true);
  assert.match(fitRoute(found[1],blocks,'random').reason,/zero residual degrees/);
  const reverse=fitRoute(enumerate(edges(blocks),'C','A')[0],blocks);
  close(reverse.estimate,1/first.estimate);
  close(reverse.ci_lower,1/first.ci_upper);
  close(reverse.ci_upper,1/first.ci_lower);
});

test('a detour around the arms of a single trial does not create an independent evidence pathway',()=>{
  const visits=[
    {trialId:'one',treatment:'A',comparator:'B'},
    {trialId:'one',treatment:'B',comparator:'C'},
    {trialId:'one',treatment:'A',comparator:'C'},
    {trialId:'two',treatment:'C',comparator:'D'}
  ];
  assert.deepEqual(enumerate(visits,'A','D').map(r=>r.regimens),[['A','C','D']]);
  assert.deepEqual(enumerate(visits,'A','Z'),[]);
  visits.push({trialId:'three',treatment:'B',comparator:'A'});
  assert.deepEqual(enumerate(visits,'A','D').map(r=>r.regimens),[['A','C','D'],['A','B','C','D']]);
});

test('multi-arm projections keep the signs, the covariance and a single trial identifier',()=>{
  const block={trialId:'multi',contrasts:[contrast('A','B',.8),contrast('B','C',.75)],covariance:[[.04,.01],[.01,.09]]};
  const p=projectTrial(block,[['A','C'],['B','A']]);
  close(Math.exp(p.contrasts[0].logEffect),.6);
  close(Math.exp(p.contrasts[1].logEffect),1.25);
  close(p.covariance[0][0],.15);
  close(p.covariance[1][1],.04);
  close(p.covariance[0][1],-.05);
  close(p.covariance[1][0],-.05);
  assert.equal(p.trialId,'multi');
  assert.equal(projectTrial(block,[['A','Z']]),null);
});

test('a trial supporting disjoint steps keeps their covariance without adding an off-path contrast',()=>{
  const multi={trialId:'four-arm',contrasts:[contrast('A','B',.8),contrast('B','C',.6),contrast('C','D',.7)],
    covariance:[[.04,0,.01],[0,.04,0],[.01,0,.04]]};
  const blocks=[multi,trial('bx','B','X',1),trial('xc','X','C',1),trial('cd','C','D',.7)];
  const path=enumerate(edges(blocks),'A','D').find(route=>route.regimens.includes('X'));
  const result=fitRoute(path,blocks);
  assert.equal(result.available,true,result.reason);
  assert.equal(result.trialCount,4);
  close(result.estimate,.8*.7);
  // The C/D replicate has variance .04. Conditioning on the difference
  // between the C/D estimates removes (.04+.01)^2/(.04+.04) from Var(log(A/D)).
  close(result.se**2,.04+.04+.04+.04+2*.01-.05**2/.08);
});
