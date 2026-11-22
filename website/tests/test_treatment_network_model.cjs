'use strict';
const assert = require('node:assert/strict');
const {fit} = require('../dist/treatment_network_model.js');
const fixture = require('./fixtures/treatment_network_reference.json');
const close = (actual, expected, tol = 1e-10) => assert.ok(Math.abs(actual-expected) <= tol * Math.max(1, Math.abs(expected)), `${actual} should equal ${expected}`);
const pair = (trialId, treatment, comparator, estimate, se) => ({
  trialId, contrasts:[{treatment, comparator, logEffect:Math.log(estimate)}], covariance:[[se**2]]
});

// Independent two-trial Bucher comparison. The type of missing diagnostic matters.
const chain = [pair('one','A','B',.80,.1), pair('two','C','B',.50,.2)];
const simple = fit(chain, 'A', 'C');
assert.equal(simple.available, true);
close(simple.estimate, 1.6);
close(simple.se, Math.sqrt(.05));
assert.equal(simple.diagnostics.inconsistency.available, false);
assert.equal(simple.diagnostics.heterogeneity.available, false);
assert.match(fit(chain, 'A','C','random').reason, /zero residual/);

// Every path in a diamond contributes. A loop without independent design
// replication permits an inconsistency test, but no pure within-design test.
const diamond = [...chain, pair('three','A','D',1,.1), pair('four','C','D',1,.2)];
const alternate = fit(diamond, 'A','C');
close(alternate.estimate, Math.sqrt(1.6));
close(alternate.se, Math.sqrt(.025));
assert.equal(alternate.diagnostics.inconsistency.df, 1);
assert.equal(alternate.diagnostics.heterogeneity.available, false);
const replicated = fit([...chain,pair('other','A','B',.8,.11)], 'A','C','random');
assert.equal(replicated.model,'random');
assert.equal(replicated.tau2,0);
assert.equal(replicated.diagnostics.heterogeneity.df,1);
assert.equal(replicated.diagnostics.inconsistency.available,false);

// R benchmark: all eligible pathways in a published network including a three-arm
// study. No trial contains both selected regimens. The reference script fits
// metafor::rma.mv independently and calculates design diagnostics via saturated GLS.
assert.equal(fixture.blocks.length,22);
assert.ok(fixture.blocks.some(b => b.contrasts.length === 2));
assert.ok(fixture.blocks.every(b => {
  const a = new Set(b.contrasts.flatMap(row => [row.treatment,row.comparator]));
  return !(a.has(fixture.first) && a.has(fixture.second));
}));
for (const model of ['common','random']) {
  const expected = fixture[model], tol = model === 'random' ? 2e-7 : 1e-11;
  const result = fit(fixture.blocks, fixture.first, fixture.second, model);
  assert.ok(result.available,result.reason);
  close(result.estimate, expected.ratio,tol);
  close(result.logEstimate, expected.logEstimate,tol);
  close(result.ci_lower, expected.lower,tol);
  close(result.ci_upper, expected.upper,tol);
  close(result.tau2, expected.tau2,tol);
  close(result.se, expected.se,tol);
  const {heterogeneity:h,inconsistency:i} = result.diagnostics;
  close(h.Q, expected.withinQ,tol);
  close(i.Q, expected.betweenQ,tol);
  assert.equal(h.df,expected.withinDF);
  assert.equal(i.df,expected.betweenDF);
  assert.equal(result.trialCount,22);
  const inverse = fit(fixture.blocks, fixture.second, fixture.first, model);
  close(inverse.estimate,1/result.estimate);
  close(inverse.ci_lower,1/result.ci_upper);
  close(inverse.ci_upper,1/result.ci_lower);

  // Reverse one row of a three-arm trial. Both sampling covariance and
  // random-effects covariance must acquire a negative off-diagonal.
  const changed = structuredClone(fixture.blocks);
  const block = changed.find(b => b.contrasts.length === 2);
  const row = block.contrasts[1];
  [row.treatment,row.comparator] = [row.comparator,row.treatment];
  row.logEffect = -row.logEffect;
  block.covariance[1][0] *= -1;
  block.covariance[0][1] *= -1;
  const reoriented = fit(changed, fixture.first, fixture.second, model);
  close(reoriented.estimate,expected.ratio,tol);
  close(reoriented.tau2,expected.tau2,tol);
  close(reoriented.se,expected.se,tol);
}

// No independent evidence from invalid or repeated blocks.
assert.match(fit([chain[0],chain[0]], 'A','B').reason,/same trial/);
assert.match(fit([chain[0],pair('unconnected','X','Y',1,.1)],'A','X').reason,/connected/);
const many = {trialId:'three arm', contrasts:[...chain[0].contrasts, ...chain[1].contrasts], covariance:[[.01,.02],[.02,.04]]};
assert.match(fit([many], 'A','C').reason,/singular/);
assert.match(fit([{...many,covariance:[[.01,null],[null,.04]]}], 'A','C').reason,/missing/);
assert.match(fit([{...many,covariance:[[.01,.002],[.003,.04]]}], 'A','C').reason,/inconsistent/);
assert.match(fit([{...many,contrasts:[...many.contrasts,many.contrasts[0]],covariance:[[1,0,0],[0,1,0],[0,0,1]]}], 'A','C').reason,/independent basis/);
console.log('Network model: analytic checks and independent R metafor benchmark passed.');
