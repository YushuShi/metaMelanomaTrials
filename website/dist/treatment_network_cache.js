/* Verified publication-time R fits. The full input block digest guards all filtered lookups. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('node:crypto').webcrypto);
  else root.TreatmentNetworkCache = factory(root.crypto);
})(typeof globalThis === 'undefined' ? this : globalThis, function (crypto) {
  'use strict';
  const schema = 1;
  function signature(blocks) {
    // Keep each trial basis and covariance in the same order; omit display-only provenance.
    return JSON.stringify(blocks.map(block => [String(block.trialId), block.contrasts.map(row =>
      [row.treatment, row.comparator, row.logEffect]), block.covariance])
      .sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  async function digest(blocks) {
    if (!crypto?.subtle) return null;
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature(blocks)));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
  }
  function contrast(component, first, second, model, engine) {
    const arms = component?.arms, info = component?.models?.[model];
    if (!Array.isArray(arms) || !info || !arms.includes(first) || !arms.includes(second) || first === second) return null;
    if (!info.available) return info.reason ? {available:false, model, engine, reason:info.reason} : null;
    const {beta, covariance, tau2} = info, n = arms.length - 1;
    if (!Array.isArray(beta) || beta.length !== n || !beta.every(Number.isFinite) ||
        !Array.isArray(covariance) || covariance.length !== n || !covariance.every(row => Array.isArray(row) && row.length === n && row.every(Number.isFinite)) ||
        !Number.isFinite(tau2) || tau2 < 0) return null;
    const a = arms.indexOf(first)-1, b = arms.indexOf(second)-1;
    const logEstimate = (a >= 0 ? beta[a] : 0) - (b >= 0 ? beta[b] : 0);
    const variance = (a >= 0 ? covariance[a][a] : 0) + (b >= 0 ? covariance[b][b] : 0) -
      (a >= 0 && b >= 0 ? 2 * covariance[a][b] : 0);
    if (!(variance > 0)) return null;
    const se = Math.sqrt(variance), half = 1.959963984540054 * se;
    const [estimate, ci_lower, ci_upper] = [logEstimate,logEstimate-half,logEstimate+half].map(Math.exp);
    if (![estimate,ci_lower,ci_upper].every(x => Number.isFinite(x) && x > 0)) return null;
    return {available:true, model, engine, logEstimate, estimate, ci_lower, ci_upper, se, tau2};
  }
  async function lookup(cache, graphHash, blocks, first, second, model = 'common') {
    if (!graphHash || cache?.schema !== schema || cache.graphHash !== graphHash || !cache.engine) return null;
    const key = await digest(blocks);
    return key ? contrast(cache.components?.[key], first, second, model, cache.engine) : null;
  }
  return Object.freeze({schema, signature, digest, contrast, lookup});
});
