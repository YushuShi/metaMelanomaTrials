'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {fit} = require('../dist/treatment_network_model.js');
const {routeKey, fitSelection} = require('../dist/treatment_network_pathways.js');
const Planning = require('../dist/treatment_map_planning.js');

const contrast = (treatment, comparator, ratio) => ({treatment, comparator, logEffect:Math.log(ratio)});
function trial(trialId, treatment, comparator, ratio) {
  return {trialId, contrasts:[contrast(treatment,comparator,ratio)], covariance:[[.04]]};
}
const blocks = [
  {trialId:'multi', contrasts:[contrast('A','B',.8),contrast('C','B',.75)], covariance:[[.04,.01],[.01,.09]]},
  trial('ac','A','C',.9), trial('bd','B','D',.7), trial('cd','C','D',.8),
  trial('de','D','E',.8), trial('ax','A','X',1.2), trial('xe','X','E',1.2), trial('off','X','Y',1.6)
];
const comparisons = blocks.flatMap(block => block.contrasts.map(row => ({...row,trialId:block.trialId})));
comparisons.push({trialId:'multi',treatment:'A',comparator:'C'});
const pair = {blocks,comparisons,trials:blocks.map(block => ({id:block.trialId}))};
const paths = [['A','X','E'],['A','B','D','E'],['A','C','D','E'],['A','C','B','D','E']];

function selected(path, model, reverse) {
  const [first,second] = reverse ? ['E','A'] : ['A','E'];
  return fitSelection({pair,first,second,model,fullFit:fit(blocks,first,second,model),
    excluded:new Set([routeKey(path)])}).fit;
}
function close(actual, expected, tolerance=2e-8) {
  assert.ok(Math.abs(actual-expected)<tolerance, actual+' differs from '+expected);
}

// Independent NumPy reference. For each route T projects original trial contrasts onto its
// leg contrasts, X is the signed treatment design and S is the trial-block covariance.
// GLS on T*X and T*S*T' gives an influence row on the original contrasts. Stack these
// as H, combine routes with weights proportional to 1/diag(H*S*H'), and compute the
// interval from the complete covariance. In particular the route covariance for ABDE
// and ACBDE is .114 because both use the same participants and final leg.
const reference = [
  [.4911673120946762,.2782421982034094,.8670335773222516,.2899506731255676,63,384],
  [.7836765164697781,.5264576291848257,1.1665684917837795,.20297591172374466,529,2456],
  [.7261190533740943,.4628377834612489,1.1391655964859981,.2297681780357324,307,1494],
  [.7980088658080705,.535316907695982,1.1896096326364232,.20370822536203423,617,2836],
];
test('each omitted pathway reproduces independent GLS projection, shared covariance and event targets', () => {
  paths.forEach((path,index) => {
    const [estimate,lower,upper,se,events,participants] = reference[index];
    const forward = selected(path,'common',false);
    assert.ok(forward.available,forward.reason);
    close(forward.estimate,estimate); close(forward.ci_lower,lower); close(forward.ci_upper,upper); close(forward.se,se);
    assert.equal(Planning.events(forward.estimate,{}).events,events);
    // Treat the same synthetic contrast data as ORR risk ratios with a 20% reference
    // rate. The independent two-proportion calculation rounds up each arm's size.
    const binary = Planning.indirect({estimate:forward.estimate,measure:'RR',first:'A',second:'E',
      comparisons:[],settings:{manualProbability:.2}});
    assert.equal(binary.min,participants);
    const reverse = selected(path,'common',true);
    close(reverse.estimate,1/estimate); close(reverse.ci_lower,1/upper); close(reverse.ci_upper,1/lower);
    assert.equal(Planning.events(reverse.estimate,{}).events,events);
  });
});

test('random-effects pathway weights and covariance share the full-network REML estimate', () => {
  const result = selected(paths[0],'random',false);
  assert.ok(result.available,result.reason);
  // SciPy independently profiled log|S(tau)| + log|X'S(tau)^(-1)X| + residual Q.
  close(result.tau2,.0731977503679363,2e-7);
  close(result.estimate,.49561235450268004,2e-7);
  close(result.ci_lower,.19093373112118284,2e-7);
  close(result.ci_upper,1.2864757028174947,2e-7);
  close(result.se,.4866761200619445,2e-7);
  assert.equal(Planning.events(result.estimate,{}).events,64);
});
