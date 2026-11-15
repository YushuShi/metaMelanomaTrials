(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SemanticNumericDisplay = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 'source-bound-public-Arabic-NA-number-views-v1';
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  const scopeKeys = ['report_id', 'reviewer', 'review_stage', 'source_input_sha256', 'source_packet_sha256', 'draft_artifact_sha256', 'review_artifact_sha256'];
  function need(ok, message) { if (!ok) throw new Error(message); }
  function same(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const x = Object.keys(a).sort(), y = Object.keys(b).sort();
    return x.length === y.length && x.every((key, i) => key === y[i] && same(a[key], b[key]));
  }
  function resolve(study, path) {
    need(Array.isArray(path) && path.length > 0, 'A numeric view needs its exact original field path.');
    let value = study, parent = null, key = null, ownerId = null, scope = {};
    for (let i = 0; i <= path.length; i++) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const name of scopeKeys) if (Object.hasOwn(value, name)) scope[name] = value[name];
        ownerId = value.result_id || value.sample_record_id || value.fact_id || ownerId;
      }
      if (i === path.length) break;
      key = path[i]; parent = value;
      need((typeof key === 'string' || Number.isInteger(key)) && !forbidden.has(String(key)) && parent && typeof parent === 'object' && Object.hasOwn(parent, key), 'Numeric view escaped its original field.');
      value = parent[key];
    }
    return { value, parent, key, ownerId, scope };
  }
  function applyStudy(study, descriptor) {
    need(descriptor && descriptor.study_id === study.report_id && descriptor.scientific_or_eligibility_flags_changed === false && Array.isArray(descriptor.number_views), 'Numeric view has a foreign article or scientific scope.');
    const clone = JSON.parse(JSON.stringify(study)), seen = new Set();
    for (const view of descriptor.number_views) {
      const id = JSON.stringify(view.path);
      need(!seen.has(id), 'Duplicate numeric view field.'); seen.add(id);
      const original = resolve(study, view.path), target = resolve(clone, view.path);
      need(same(original.value, view.original_wrapper) && original.ownerId === view.owner_id && same(original.scope, view.source_scope), 'Numeric view does not match its original wrapper/source.');
      if (view.status === 'held') continue;
      need(view.status === 'normalized' && typeof view.display_value === 'string' && view.canonical_number && typeof view.canonical_number === 'object', 'Unchecked numeric view refused.');
      const raw = original.value, number = view.canonical_number;
      need(raw && Object.hasOwn(raw, 'value') && Object.hasOwn(raw, 'status'), 'Numeric views may only target numeric wrappers.');
      const allowed = new Set(['value', 'status', 'raw_text', 'value_text', 'role']);
      need(Object.keys(number).every((key) => allowed.has(key) || same(number[key], raw[key])), 'Numeric view attempted a unit, source or graph change.');
      need(Object.keys(raw).every((key) => allowed.has(key) || same(number[key], raw[key])), 'Numeric view omitted source or qualifier metadata.');
      const numericText = view.display_value.replace(/^[<>≤≥]/, '');
      const annotation = view.non_scalar_source_literal === true;
      need(annotation ? (number.value === null && raw.value === null && view.arabic_value === null && view.display_value === view.source_literal && Object.keys(raw).every((key) => same(raw[key], number[key]))) : view.display_value === 'NA' ? number.value === null : (typeof number.value === 'number' && Number.isFinite(number.value) && number.value === view.arabic_value && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(numericText) && Number(numericText) === number.value), 'Numeric display/value disagreement.');
      const overlaid = { ...raw };
      for (const key of ['value', 'status', 'raw_text']) if (Object.hasOwn(number, key)) overlaid[key] = number[key];
      overlaid.semantic_display_value = view.display_value;
      overlaid.semantic_missing_reason = view.missing_reason || null;
      overlaid.semantic_display_checked = true;
      overlaid.semantic_non_scalar_source_literal = annotation;
      overlaid.semantic_numeric_role = number.role || null;
      if (view.registered_percent_probability === true) {
        const percent = view.source_percent_arabic_value;
        need(view.registered_encoding_rule === 'exact_registered_percent_probability_v1' && raw.normalization === 'percent_to_probability' && ['probability', 'proportion'].includes(raw.unit) && typeof percent === 'number' && Number.isFinite(percent) && typeof raw.value === 'number' && number.value === raw.value && number.unit === raw.unit && Math.abs(raw.value * 100 - percent) <= Number.EPSILON * Math.max(100, Math.abs(percent)) && /%|\bpercent\b/i.test(view.source_literal || ''), 'Registered probability display has no exact source-percent binding.');
        overlaid.semantic_source_percent_value = percent;
      }
      target.parent[target.key] = overlaid;
    }
    return clone;
  }
  function applyDataset(dataset) {
    const views = dataset.semantic_numeric_views;
    if (!views) return dataset.studies;
    need(views.version === VERSION && views.missing_display === 'NA' && views.raw_evidence_rewritten === false && views.clinical_validation === false && views.pooling_eligible === false, 'Unsupported semantic number view.');
    need(dataset.studies.length === Object.keys(views.by_report || {}).length, 'Numeric view article coverage differs.');
    return dataset.studies.map((study) => applyStudy(study, views.by_report[study.report_id]));
  }
  function checkedText(number) {
    return number?.semantic_display_checked === true && typeof number.semantic_display_value === 'string' ? number.semantic_display_value : null;
  }
  return Object.freeze({ VERSION, applyStudy, applyDataset, checkedText, same });
}));
