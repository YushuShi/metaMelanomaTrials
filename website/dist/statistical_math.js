/* Shared normal and gamma functions. No source data or statistical model policy. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.StatisticalMath=factory();})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  // Lanczos log-gamma and convergent gamma/beta fractions supply tail-safe p-values.
  function logGamma(z) {
    const coefficients = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (!(z > 0)) return NaN;
    if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    z -= 1;
    let x = 0.99999999999980993;
    coefficients.forEach((c, i) => { x += c / (z + i + 1); });
    const t = z + coefficients.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  function gammaQ(a, x) {
    if (!(a > 0) || x < 0 || Number.isNaN(x)) return NaN;
    if (x === 0) return 1;
    if (x === Infinity) return 0;
    const scale = Math.exp(a * Math.log(x) - x - logGamma(a));
    if (x < a + 1) {
      let term = 1 / a, series = term;
      for (let n = 1; n < 10000; n += 1) { term *= x / (a + n); series += term; if (Math.abs(term) <= Math.abs(series) * 2e-15) break; }
      return Math.max(0, Math.min(1, 1 - scale * series));
    }
    const tiny = 1e-300;
    let b = x + 1 - a, c = 1 / tiny, d = 1 / (Math.abs(b) < tiny ? tiny : b), h = d;
    for (let i = 1; i < 10000; i += 1) {
      const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
      c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d; const delta = d * c; h *= delta; if (Math.abs(delta - 1) < 2e-15) break;
    }
    return Math.max(0, Math.min(1, scale * h));
  }
  function normalSF(z) {
    if (Number.isNaN(z)) return NaN;
    if (z === Infinity) return 0; if (z === -Infinity) return 1;
    const tail = 0.5 * gammaQ(0.5, z * z / 2);
    return z < 0 ? 1 - tail : tail;
  }
  function normalCDF(z) { return normalSF(-z); }
  function normalQuantile(p) {
    if (!(p >= 0 && p <= 1)) return NaN;
    if (p === 0) return -Infinity; if (p === 1) return Infinity;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    let x, q, r;
    if (p < 0.02425 || p > 0.97575) {
      q = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
      x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
      if (p > 0.5) x = -x;
    } else {
      q = p - 0.5; r = q * q;
      x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    for (let i = 0; i < 2; i += 1) {
      const density = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
      if (!density) break;
      const error = p < 0.5 ? normalCDF(x) - p : (1 - p) - normalSF(x);
      x -= error / density;
    }
    return x;
  }
  return Object.freeze({logGamma,gammaQ,normalSF,normalCDF,normalQuantile});
});
