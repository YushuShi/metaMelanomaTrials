/* Contrast-based network meta-analysis for a connected set of independent trial blocks.
 * Browser implementation of the GLS and restricted likelihood used in metafor::rma.mv.
 * Reference fits and a published multi-arm dataset are in tests/test_treatment_network_model.cjs.
 * https://wviechtb.github.io/metadat/reference/dat.hasselblad1998.html
 * https://wviechtb.github.io/metafor/reference/rma.mv.html
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./statistical_math.js'));
  else root.TreatmentNetworkModel = factory(root.StatisticalMath);
})(typeof globalThis === 'undefined' ? this : globalThis, function (stats) {
  'use strict';
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const zeros = n => Array(n).fill(0);
  const matrix = n => Array.from({length: n}, () => zeros(n));
  const armsOf = rows => [...new Set(rows.flatMap(row => [row.treatment, row.comparator]))].sort();

  // Solve by Cholesky factors. A singular block is rejected rather than treated as independent contrasts.
  function cholesky(a, message) {
    const n = a.length, lower = matrix(n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let residual = a[i][j];
        for (let k = 0; k < j; k++) residual -= lower[i][k] * lower[j][k];
        if (i === j) {
          if (!(residual > 32 * Number.EPSILON * n * a[i][i])) throw new Error(message);
          lower[i][j] = Math.sqrt(residual);
        } else lower[i][j] = residual / lower[j][j];
      }
    }
    return lower;
  }
  function forward(lower, y) {
    const x = [];
    for (let i = 0; i < y.length; i++) {
      let value = y[i];
      for (let j = 0; j < i; j++) value -= lower[i][j] * x[j];
      x.push(value / lower[i][i]);
    }
    return x;
  }
  function backward(lower, y) {
    const x = y.slice();
    for (let i = y.length - 1; i >= 0; i--) {
      for (let j = i + 1; j < y.length; j++) x[i] -= lower[j][i] * x[j];
      x[i] /= lower[i][i];
    }
    return x;
  }
  const logDet = lower => 2 * lower.reduce((sum, row, i) => sum + Math.log(row[i]), 0);
  function design(contrasts, arms) {
    return contrasts.map(({treatment, comparator}) =>
      arms.map(arm => Number(arm === treatment) - Number(arm === comparator)));
  }

  function prepare(block, pathway) {
    const {trialId, contrasts, covariance} = block, n = contrasts?.length;
    if (!trialId || !n || !Array.isArray(covariance) || covariance.length !== n)
      throw new Error('A trial lacks its contrasts or a complete covariance matrix.');
    if (contrasts.some(row => !Number.isFinite(row.logEffect) || !row.treatment || !row.comparator || row.treatment === row.comparator))
      throw new Error('A trial contains an invalid treatment contrast.');
    if (covariance.some(row => !Array.isArray(row) || row.length !== n || !row.every(Number.isFinite)))
      throw new Error('A trial has missing or nonfinite sampling covariance.');
    for (let i = 0; i < n; i++) {
      if (!(covariance[i][i] > 0)) throw new Error('A trial has no positive sampling variance.');
      for (let j = 0; j < i; j++) {
        if (Math.abs(covariance[i][j] - covariance[j][i]) > 1e-10 * Math.sqrt(covariance[i][i] * covariance[j][j]))
          throw new Error('A trial has inconsistent sampling covariance.');
      }
    }
    cholesky(covariance, 'A trial sampling covariance matrix is singular or invalid.');
    const arms = armsOf(contrasts), incidence = design(contrasts, arms);
    // On a pathway, a multi-arm trial can support two nonadjacent steps.
    // Their joint sampling covariance still belongs to one trial block.
    if (!pathway && n !== arms.length - 1) throw new Error('The trial contrasts do not form an independent basis for its arms.');
    // Trial random effects have variance tau² for every treatment contrast. The signed
    // incidence product gives +/-tau²/2 when two contrasts share an arm.
    const shape = incidence.map(row => incidence.map(other => dot(row, other) / 2));
    const root = cholesky(shape, 'The trial contains dependent contrasts or disconnected arms.');
    const y = contrasts.map(row => row.logEffect);
    const whitened = forward(root, y);
    return {trialId, contrasts, covariance, arms, shape, y, upper: dot(whitened, whitened)};
  }

  // Whiten each complete sampling block, then pool all trial information simultaneously.
  function gls(blocks, arms, tau2) {
    const columns = arms.slice(1), p = columns.length, info = matrix(p), xy = zeros(p);
    const residualInputs = [];
    let logVariance = 0;
    for (const block of blocks) {
      const variance = block.covariance.map((row, i) => row.map((v, j) => v + tau2 * block.shape[i][j]));
      const lower = cholesky(variance, 'The model covariance matrix could not be factored.');
      const x = design(block.contrasts, columns);
      const wy = forward(lower, block.y);
      const wx = columns.map((_, j) => forward(lower, x.map(row => row[j])));
      for (let i = 0; i < p; i++) {
        xy[i] += dot(wx[i], wy);
        for (let j = 0; j <= i; j++) info[i][j] += dot(wx[i], wx[j]);
      }
      residualInputs.push({wy, wx});
      logVariance += logDet(lower);
    }
    const lowerInfo = cholesky(info, 'No connected, estimable network spans the selected regimens.');
    const coefficients = backward(lowerInfo, forward(lowerInfo, xy));
    let Q = 0;
    for (const {wy, wx} of residualInputs) {
      for (let i = 0; i < wy.length; i++) {
        let residual = wy[i];
        for (let j = 0; j < p; j++) residual -= wx[j][i] * coefficients[j];
        Q += residual * residual;
      }
    }
    return {coefficients, lowerInfo, Q, deviance: logVariance + logDet(lowerInfo) + Q};
  }

  function reml(blocks, arms, common) {
    // After whitening by the random-effect covariance shape, any orthonormal residual
    // contrast has squared norm bounded by sum(y'H^-1 y). Above this bound every term
    // in the derivative of sum(log(lambda+t) + z²/(lambda+t)) is positive.
    const upper = blocks.reduce((sum, block) => sum + block.upper, 0);
    if (upper === 0) return 0;
    const scale = Math.min(...blocks.flatMap(block => block.covariance.map((row, i) => row[i])));
    const maxX = Math.log1p(upper / scale);
    const toTau = x => scale * Math.expm1(x);
    const profile = x => gls(blocks, arms, toTau(x)).deviance;
    const grid = [{x: 0, value: common.deviance}];
    for (let i = 1; i <= 96; i++) {
      const x = maxX * i / 96;
      grid.push({x, value: profile(x)});
    }
    let best = grid.reduce((left, right) => left.value <= right.value ? left : right);
    // Separate candidate basins are refined on a logarithmic scale, including the boundary.
    for (let i = 0; i < grid.length - 1; i++) {
      if (i > 0 && (grid[i].value > grid[i-1].value || grid[i].value > grid[i+1].value)) continue;
      let lo = grid[Math.max(0, i - 1)].x, hi = grid[i + 1].x;
      const fraction = (Math.sqrt(5) - 1) / 2;
      let a = hi - fraction * (hi - lo), b = lo + fraction * (hi - lo), fa = profile(a), fb = profile(b);
      for (let iter = 0; iter < 64 && hi - lo > 1e-11 * (1 + Math.abs(hi)); iter++) {
        if (fa < fb) { hi = b; b = a; fb = fa; a = hi - fraction * (hi - lo); fa = profile(a); }
        else { lo = a; a = b; fa = fb; b = lo + fraction * (hi - lo); fb = profile(b); }
      }
      const candidate = fa < fb ? {x: a, value: fa} : {x: b, value: fb};
      if (candidate.value < best.value) best = candidate;
    }
    const tolerance = 64 * Number.EPSILON * (1 + Math.abs(common.deviance));
    return common.deviance - best.value <= tolerance ? 0 : toTau(best.x);
  }

  function diagnostic(label, Q, df, reason) {
    if (df <= 0) return {available:false, label, Q:null, df:0, p:null, reason};
    Q = Math.max(0, Q);
    return {available:true, label, Q, df, p:stats.gammaQ(df / 2, Q / 2), reason:null};
  }

  function fit(trials, first, second, model = 'common', {pathway=false} = {}) {
    try {
      if (!['common', 'random'].includes(model)) throw new Error('Unknown network model.');
      if (!first || !second || first === second) throw new Error('Select two different complete regimens.');
      const blocks = trials.map(block=>prepare(block,pathway));
      if (!blocks.length) throw new Error('No trials have usable contrasts for this network.');
      if (new Set(blocks.map(block => block.trialId)).size !== blocks.length)
        throw new Error('The same trial appears in multiple covariance blocks.');
      const arms = armsOf(blocks.flatMap(block => block.contrasts));
      if (!arms.includes(first) || !arms.includes(second)) throw new Error('No connecting evidence for the selected regimens.');
      const common = gls(blocks, arms, 0);
      const n = blocks.reduce((sum, b) => sum + b.contrasts.length, 0);
      const df = n - (arms.length - 1);
      if (model === 'random' && df <= 0)
        throw new Error('Network heterogeneity cannot be estimated by REML with zero residual degrees of freedom.');
      const tau2 = model === 'random' ? reml(blocks, arms, common) : 0;
      const selected = tau2 > 0 ? gls(blocks, arms, tau2) : common;
      const [contrast] = design([{treatment:first, comparator:second}], arms.slice(1));
      const logEstimate = dot(contrast, selected.coefficients);
      const v = forward(selected.lowerInfo, contrast), se = Math.sqrt(dot(v, v));
      const z = stats.normalQuantile(.975);
      const ratios = [logEstimate, logEstimate - z * se, logEstimate + z * se].map(Math.exp);
      if (ratios.some(value => !(value > 0 && Number.isFinite(value))))
        throw new Error('The estimated ratio or its confidence interval exceeds numerical range.');
      const result = {available:true, model, estimate:ratios[0], ci_lower:ratios[1], ci_upper:ratios[2],
        logEstimate, se, tau2, trialCount:blocks.length, treatmentCount:arms.length};
      if (pathway) return result;
      // Decompose the residual into variability within treatment designs and disagreement
      // between designs. One three-arm trial alone does not create an inconsistency test.
      const groups = new Map();
      for (const block of blocks) {
        const key = JSON.stringify(block.arms);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(block);
      }
      let designParameters = 0, withinQ = 0, withinSelected = 0;
      for (const group of groups.values()) {
        const designArms = group[0].arms;
        designParameters += designArms.length - 1;
        if (group.length === 1) continue;
        const commonQ = gls(group, designArms, 0).Q;
        withinQ += commonQ;
        withinSelected += tau2 > 0 ? gls(group, designArms, tau2).Q : commonQ;
      }
      const diagnostics = {
        heterogeneity:diagnostic('Within-design heterogeneity', withinQ, n-designParameters, 'No treatment design has independent replication.'),
        inconsistency:diagnostic('Between-design inconsistency', selected.Q-withinSelected, designParameters-arms.length+1, 'The trial designs do not provide an independent consistency check.')
      };
      return {...result, diagnostics};
    } catch (error) { return {available:false, model, reason:error.message}; }
  }
  // The maps and Studies use the same regimen order, evidence and publication cache.
  async function fitPair({graph, network, intervention, comparator, model, advanced={}, lookup}) {
    const pair=network.forPair(intervention,comparator);
    if (!pair.eligible) return {pair};
    const result=fit(pair.blocks,intervention,comparator,model);
    if (result.available && lookup && network.endpoint==='OS:HR' && network.target==='overall' && !advanced.active) {
      try {
        const prepared=await lookup(graph.content_sha256,pair.blocks,intervention,comparator,model);
        if (prepared) return {pair,fit:{...result,...prepared}};
      } catch (_) { /* A missing reference cache leaves the live fit available. */ }
    }
    return {pair,fit:result};
  }
  // Each trial block stores an independent basis of log contrasts. Express a
  // requested within-trial leg in that basis, retaining the signs of the edges.
  function coefficients(contrasts,first,second) {
    const found=new Map([[first,null]]),queue=[first];
    for(let i=0;i<queue.length && !found.has(second);i++) {
      const from=queue[i];
      contrasts.forEach((contrast,index)=>{
        const forward=contrast.treatment===from;
        if(!forward && contrast.comparator!==from)return;
        const to=forward?contrast.comparator:contrast.treatment;
        if(found.has(to))return;
        found.set(to,{from,index,sign:forward?1:-1});
        queue.push(to);
      });
    }
    if(!found.has(second))return null;
    const weights=contrasts.map(()=>0);
    for(let id=second;id!==first;) {
      const step=found.get(id);weights[step.index]=step.sign;id=step.from;
    }
    return weights;
  }

  function projectTrial(block,pairs) {
    const weights=pairs.map(([a,b])=>block && coefficients(block.contrasts,a,b));
    if(weights.some(w=>!w))return null;
    const contrasts=pairs.map(([treatment,comparator],i)=>({treatment,comparator,
      logEffect:weights[i].reduce((sum,w,j)=>sum+w*block.contrasts[j].logEffect,0)}));
    // V_path = W V_trial W'. A shared control can contribute to two legs
    // without being entered as two independent trials.
    const covariance=weights.map(left=>weights.map(right=>left.reduce((sum,w,i)=>
      sum+w*right.reduce((row,v,j)=>row+v*block.covariance[i][j],0),0)));
    return {trialId:block.trialId,contrasts,covariance};
  }

  return Object.freeze({fit,fitPair,coefficients,projectTrial});
});
