'use strict';

/* Source-linked browsing and labelled derived intervals. No pooling or eligibility promotion. */
(() => {
  const semanticNumbers = typeof module === 'object' && module.exports ? require('./semantic_numeric_display.js') : globalThis.SemanticNumericDisplay;
  const numericCompletion = typeof module === 'object' && module.exports ? require('./numeric_evidence_display.js') : globalThis.NumericEvidenceDisplay;
  const treatmentGroups = typeof module === 'object' && module.exports ? require('./treatment_groups.js') : globalThis.TreatmentGroups;
  const regimenSourceRules = typeof module === 'object' && module.exports ? require('./regimen_source_rules.js') : globalThis.RegimenSourceRules;
  const regimenDefinitions = typeof module === 'object' && module.exports ? require('./regimen_definitions.js') : globalThis.RegimenDefinitions;
  const sampleDisplay = typeof module === 'object' && module.exports ? require('./evidence_display.js') : globalThis.EvidenceDisplay;
  const melanomaScope = typeof module === 'object' && module.exports ? require('./melanoma_scope.js') : globalThis.MelanomaScope;
  const trialIdentifiers = typeof module === 'object' && module.exports ? require('./trial_identifiers.js') : globalThis.TrialIdentifiers;
  const trialSearch = typeof module === 'object' && module.exports ? require('./trial_search.js') : globalThis.TrialSearch;
  const confidenceIntervals = typeof module === 'object' && module.exports ? require('./confidence_intervals.js') : globalThis.ConfidenceIntervals;
  const waldInterval = typeof module === 'object' && module.exports ? require('./wald_interval.js') : globalThis.WaldInterval;
  const compactExtraction = typeof module === 'object' && module.exports ? require('./quantitative_extraction.js') : globalThis.QuantitativeExtraction;
  const conciseGroups = typeof module === 'object' && module.exports ? require('./concise_study_groups.js') : globalThis.ConciseStudyGroups;
  const outcomeReconciliation = typeof module === 'object' && module.exports ? require('./outcome_reconciliation.js') : globalThis.OutcomeReconciliation;
  const studyDesign = typeof module === 'object' && module.exports ? require('./study_design_display.js') : globalThis.StudyDesignDisplay;
  const advancedFilters = typeof module === 'object' && module.exports ? require('./advanced_filters.js') : globalThis.AdvancedFilters;
  const studyIndirect = typeof module === 'object' && module.exports ? require('./study_indirect.js') : globalThis.StudyIndirect;
  const treatmentMapAnalysis = typeof module === 'object' && module.exports ? require('./treatment_map_analysis.js') : globalThis.TreatmentMapAnalysis;
  // Ephemeral provenance for displayed effects. The public view stays concise;
  // original source rows remain attached to their visual container members.
  const presentationEffectSources = new WeakMap();
  const colors = Object.freeze({ beneficial: '#8DC9E8', significant_beneficial: '#2475C0', harmful: '#EEA4BC', significant_harmful: '#C9354C', neutral: '#94a3b8' });
  const xml = (value) => String(value ?? '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const ratio = (measure) => ['HR', 'RR', 'OR', 'TR'].includes(String(measure).toUpperCase());
  const estimate = (row) => ({ effect: row.effect ?? row.estimate, low: row.ci_low, high: row.ci_high ?? row.ci_upp });
  function validEstimate(row, measure) { const v = estimate(row); return [v.effect, v.low, v.high].every(finite) && v.low <= v.effect && v.effect <= v.high && v.low < v.high && (!ratio(measure) || v.low > 0); }
  function dotRadius(n) { if (!Number.isInteger(n) || n < 1) return 0; const t = Math.max(0, Math.min(1, Math.log(n / 3) / Math.log(100 / 3))); return Math.sqrt(16 + 128 * t); }
  function independentCount(row) { const n = row.n_studies ?? row.independent_studies; const ids = row.independent_cohort_ids; const verified = row.independence_verified === true && (!Array.isArray(ids) || (new Set(ids).size === ids.length && ids.length === n)); return verified && Number.isInteger(n) && n >= 2 ? n : 0; }
  function savedPoolingMetadata(row,linked) {
    const sources=[row,row?.pooled,linked,linked?.pooled].filter(Boolean);
    const counts=sources.flatMap(source=>['n_studies','independent_studies','k'].filter(key=>source[key]!==undefined&&source[key]!==null).map(key=>source[key]));
    if(!counts.length||counts.some(k=>!Number.isInteger(k)||k<1)||new Set(counts).size!==1)return null;
    const k=counts[0],expected=treatmentMapAnalysis.modelForK(k);
    const verification=sources.map(source=>source.independence_verified).filter(value=>value!==undefined);
    if(!verification.includes(true)||verification.some(value=>value!==true))return null;
    const cohortSets=sources.filter(source=>source.independent_cohort_ids!==undefined&&source.independent_cohort_ids!==null).map(source=>source.independent_cohort_ids);
    if(cohortSets.some(ids=>!Array.isArray(ids)||ids.length!==k||ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==k))return null;
    if(new Set(cohortSets.map(ids=>JSON.stringify([...ids].sort()))).size>1)return null;
    const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z]/g,'');
    const model=value=>['individual','individualstudy','single','singlestudy'].includes(value)?'individual':['fixed','fixedeffect','fixedeffects','fe'].includes(value)?'fixed':['random','randomeffect','randomeffects','reml'].includes(value)?'random':null;
    const declarations=sources.flatMap(source=>[source.pooling_model,source.model].map(normalize)).map(model).filter(Boolean);
    if(!declarations.length||declarations.some(value=>value!==expected.model))return null;
    if(sources.some(source=>source.pooling_model!=null&&!model(normalize(source.pooling_model))))return null;
    const methods=sources.flatMap(source=>[source.tau2_method,...(/^(REML|DL|FE|fixed|none|single)$/i.test(String(source.method))?[source.method]:[]),...(normalize(source.pooling_model)==='reml'||normalize(source.model)==='reml'?['REML']:[])]).filter(value=>value!==undefined&&value!==null).map(value=>String(value).toUpperCase());
    const allowed=expected.model==='random'?['REML']:expected.model==='fixed'?['NONE','FE','FIXED']:['NONE','SINGLE'];
    if(methods.some(value=>!allowed.includes(value))||expected.model==='random'&&!methods.includes('REML'))return null;
    return {...expected,k,label:expected.model_label+(expected.tau2_method==='REML'?' (REML)':'')};
  }
  function direction(row) {
    const value = row.association || row.benefit_direction;
    if (Object.hasOwn(colors, value)) return value;
    if (value === 'favors_intervention') return row.ci_excludes_null === true ? 'significant_beneficial' : 'beneficial';
    if (value === 'favors_control') return row.ci_excludes_null === true ? 'significant_harmful' : 'harmful';
    return null;
  }
  function matrixEligible(row) { return row?.validated === true && independentCount(row) >= 2 && validEstimate(row, row.effect_measure) && !!direction(row); }
  function endpointKind(endpoint, metadata = {}) {
    const declared = String(metadata.endpoint_type || metadata.outcome_type || '').toLowerCase().replace(/[ -]+/g, '_');
    if (['survival', 'time_to_event', 'time_to_event_endpoint'].includes(declared)) return 'survival';
    if (['binary', 'dichotomous', 'proportion'].includes(declared)) return 'binary';
    if (['continuous', 'quantitative'].includes(declared)) return 'continuous';
    if (['unknown', 'unclear'].includes(declared)) return 'unknown';
    const key = String(endpoint || '').toLowerCase().replace(/[ -]+/g, '_');
    if (['overall_survival', 'progression_free_survival', 'disease_free_survival', 'event_free_survival', 'recurrence', 'recurrence_free_survival', 'distant_metastasis_free_survival', 'disease_specific_survival', 'duration_of_response', 'survival'].includes(key)) return 'survival';
    if (['response', 'objective_response', 'complete_response', 'partial_response', 'disease_control', 'pathological_complete_response', 'adverse_events', 'binary'].includes(key)) return 'binary';
    if (['continuous', 'quality_of_life_score', 'mean_change'].includes(key)) return 'continuous';
    return 'unknown';
  }
  function relevantMeasures(endpoint, metadata = {}, planning = false) {
    if (metadata.ambiguous === true) return [];
    const kind = endpointKind(endpoint, metadata);
    if (kind === 'unknown') return [];
    const compatible = kind === 'survival' ? ['HR', 'TR'] : kind === 'binary' ? ['RR', 'OR', 'RD'] : kind === 'continuous' ? ['MD', 'SMD'] : [];
    const supplied = Array.isArray(metadata.effect_measures) ? metadata.effect_measures : [];
    const requested = supplied.length ? supplied.filter((measure) => compatible.length ? compatible.includes(measure) : ['HR', 'TR', 'RR', 'OR', 'RD', 'MD', 'SMD'].includes(measure)) : (kind === 'survival' ? ['HR'] : compatible);
    return [...new Set(requested)].filter((measure) => !planning || ['HR', 'RR', 'OR'].includes(measure));
  }
  function defaultEffectMeasure(endpoint, metadata = {}) {
    const key = String(endpoint || '').toLowerCase().replace(/[ -]+/g, '_');
    if (['overall_survival', 'progression_free_survival', 'recurrence', 'recurrence_free_survival', 'disease_free_survival', 'distant_metastasis_free_survival', 'event_free_survival', 'disease_specific_survival', 'duration_of_response', 'survival'].includes(key)) return 'HR';
    if (['response', 'objective_response', 'orr', 'complete_response', 'partial_response', 'disease_control', 'pathological_complete_response', 'adverse_events', 'adverse_event'].includes(key)) return 'RR';
    return relevantMeasures(endpoint, metadata)[0] || '';
  }
  function ancestorClosure(diseaseIds, catalog = []) {
    const parents = new Map((Array.isArray(catalog) ? catalog : []).map((row) => [row.id || row.disease_id, row.parent_id || null]));
    const result = new Set();
    for (const id of Array.isArray(diseaseIds) ? diseaseIds : []) {
      let current = id; const visited = new Set();
      while (typeof current === 'string' && current && !visited.has(current)) {
        visited.add(current); result.add(current); current = parents.get(current);
      }
    }
    return result;
  }
  function diseaseMatches(selected, diseaseIds, catalog = []) {
    return !selected || ancestorClosure(diseaseIds, catalog).has(selected);
  }
  function joinR2Articles(baseRecords, payload) {
    if (payload?.status !== 'ready' || payload.selection !== 'both_models_retain' || !Array.isArray(payload.reports)) throw new Error('The R2 article index is not ready.');
    if (!Number.isInteger(payload.report_count) || payload.report_count !== payload.reports.length) throw new Error('The R2 article index count does not match its reports.');
    const base = new Map((Array.isArray(baseRecords) ? baseRecords : []).map((row) => [String(row.report_id), row]));
    const seen = new Set();
    return payload.reports.map((row) => {
      const id = String(row.report_id || '');
      if (!id || seen.has(id) || row.screening_status !== 'both_retain' || !row.Sol_origin_call_id || !row.Opus_origin_call_id) throw new Error('The R2 article index has an invalid screening record.');
      seen.add(id);
      if (!base.has(id)) throw new Error('An R2 article is missing its base citation.');
      const index = { ...row };
      for (const key of ['disease_scope_ids', 'shared_disease_ids', 'Sol_disease_ids', 'Opus_disease_ids', 'endpoint_families', 'Sol_endpoint_families', 'Opus_endpoint_families', 'experimental_drug_ids', 'Sol_experimental_drug_ids', 'Opus_experimental_drug_ids']) index[key] = Array.isArray(row[key]) ? [...row[key]] : [];
      return { ...base.get(id), r2: index };
    });
  }
  function filterR2Articles(articles, selection = {}) {
    return (Array.isArray(articles) ? articles : []).filter((row) => row.r2?.screening_status === 'both_retain' &&
      (!selection.disease || row.r2.disease_scope_ids.includes(selection.disease)) &&
      (!selection.endpoint || row.r2.endpoint_families.includes(selection.endpoint)) &&
      (!selection.intervention || row.r2.experimental_drug_ids.includes(selection.intervention)));
  }
  function joinProvisionalStudies(payload, articles = []) {
    const flags = ['clinical_validation', 'report_R3_complete', 'pooling_eligible', 'numerical_results_validated'];
    if (payload?.status !== 'ready' || payload.record_kind !== 'provisional_study_information' || payload.snapshot !== 'v6' || payload.disease_id !== 'cutaneous_melanoma' || payload.report_count !== 285 || payload.populated_report_count !== 163 || !Array.isArray(payload.reports) || payload.reports.length !== 285 || flags.some((key) => payload[key] !== false)) throw new Error('The provisional study overview is not ready.');
    const index = new Map(articles.map((row) => [row.report_id, row.r2])), seen = new Set();
    const textFields = ['report_id', 'pmid', 'title', 'population', 'design', 'models', 'adjustment_covariates', 'reporting_status', 'source', 'R3_status'];
    const statuses = new Set(['Not reviewed', 'Provisional source draft; primary API pending', 'Source-checked CORE; full extraction pending', 'Provisional source draft; primary API pending; older CORE separate']);
    const rows = payload.reports.map((row) => {
      if (!/^report-[a-f0-9]{24}$/.test(row.report_id) || seen.has(row.report_id) || textFields.some((key) => typeof row[key] !== 'string') || !statuses.has(row.reporting_status) || flags.some((key) => row[key] !== false) || (row.pmid && !/^\d+$/.test(row.pmid)) || (row.year !== null && !Number.isInteger(row.year))) throw new Error('The provisional overview has an invalid candidate row.');
      seen.add(row.report_id);
      const screening = index.get(row.report_id), tags = screening?.screening_status === 'both_retain' ? screening : {};
      return { ...Object.fromEntries([...textFields, 'year', ...flags].map((key) => [key, row[key]])), target_disease_id: payload.disease_id,
        screening_tags: { endpoint_families: Array.isArray(tags.endpoint_families) ? [...tags.endpoint_families] : [], experimental_drug_ids: Array.isArray(tags.experimental_drug_ids) ? [...tags.experimental_drug_ids] : [] } };
    });
    if (rows.filter((row) => row.reporting_status !== 'Not reviewed').length !== 163) throw new Error('The populated candidate count does not match.');
    return rows;
  }
  function filterProvisionalStudies(rows, selection = {}, catalog = []) {
    return (Array.isArray(rows) ? rows : []).filter((row) => row.clinical_validation === false && row.report_R3_complete === false && row.pooling_eligible === false && row.numerical_results_validated === false &&
      diseaseMatches(selection.disease, [row.target_disease_id], catalog) &&
      (!selection.endpoint || row.screening_tags?.endpoint_families.includes(selection.endpoint)) &&
      (!selection.intervention || row.screening_tags?.experimental_drug_ids.includes(selection.intervention)));
  }
  const quantitativeFlags = ['clinical_validation', 'report_R3_complete', 'pooling_eligible', 'validated'];
  function joinQuantitativeResults(payload, origin = 'codex_source_draft') {
    if (payload?.schema_version !== 1 || payload.status !== 'ready' || payload.record_kind !== 'provisional_reported_quantitative_results' || payload.target_disease_id !== 'cutaneous_melanoma' || !Array.isArray(payload.results) || ['clinical_validation', 'report_R3_complete', 'pooling_eligible', 'numerical_results_validated'].some((key) => payload[key] !== false)) throw new Error('The reported quantitative results are not ready.');
    if (payload.result_count !== undefined && payload.result_count !== payload.results.length) throw new Error('Reported result totals do not match.');
    const registry = payload.evidence_registry;
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) throw new Error('The reported source registry is missing.');
    const samples = Array.isArray(payload.sample_size_records) ? payload.sample_size_records : [];
    const seen = new Set();
    const sourceIds = (value, ids = new Set()) => {
      if (Array.isArray(value)) for (const item of value) sourceIds(item, ids);
      else if (value && typeof value === 'object') {
        if (Array.isArray(value.evidence_ids)) for (const id of value.evidence_ids) { if (!Object.hasOwn(registry, id)) throw new Error('A reported source passage is missing.'); ids.add(id); }
        for (const [key, item] of Object.entries(value)) if (key !== 'evidence_ids') sourceIds(item, ids);
      }
      return ids;
    };
    return payload.results.map((row) => {
      if (typeof row.result_id !== 'string' || !row.result_id || seen.has(row.result_id) || !/^report-[a-f0-9]{24}$/.test(row.report_id) || quantitativeFlags.some((key) => row[key] !== false) || (row.target_disease_id && row.target_disease_id !== payload.target_disease_id) || row.numerical_results_validated === true) throw new Error('The reported result has an invalid identity or approval flag.');
      seen.add(row.result_id);
      const reportSamples = samples.filter((sample) => sample.report_id === row.report_id && sample.reviewer === row.reviewer && sample.source_input_sha256 === row.source_input_sha256 && (sample.draft_artifact_sha256 || sample.source_packet_sha256) === (row.draft_artifact_sha256 || row.source_packet_sha256));
      for (const sample of reportSamples) if (quantitativeFlags.some((key) => sample[key] !== false)) throw new Error('A sample record has inconsistent provisional status.');
      return { ...row, quantitative_source: origin, target_disease_id: payload.target_disease_id, evidence_registry: registry, evidence: [...sourceIds(row)].map((id) => registry[id]), report_samples: reportSamples.map((sample) => ({ ...sample, evidence: [...sourceIds(sample)].map((id) => registry[id]) })) };
    });
  }
  function joinQuantitativeSamples(payload, origin = 'codex_source_draft') {
    if (payload?.schema_version !== 1 || payload.status !== 'ready' || payload.record_kind !== 'provisional_reported_quantitative_results' || payload.target_disease_id !== 'cutaneous_melanoma' || !Array.isArray(payload.sample_size_records) || ['clinical_validation', 'report_R3_complete', 'pooling_eligible', 'numerical_results_validated'].some((key) => payload[key] !== false)) throw new Error('The reported count catalog is not ready.');
    const registry = payload.evidence_registry, seen = new Set();
    return payload.sample_size_records.map((sample) => {
      if (!sample.sample_record_id || seen.has(sample.sample_record_id) || !/^report-[a-f0-9]{24}$/.test(sample.report_id) || quantitativeFlags.some((key) => sample[key] !== false)) throw new Error('A reported count has invalid provenance.');
      seen.add(sample.sample_record_id);
      const ids = new Set();
      const visit = (value) => {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') {
          for (const id of value.evidence_ids || []) { if (!registry || !Object.hasOwn(registry, id)) throw new Error('Count source passage missing.'); ids.add(id); }
          for (const [key, item] of Object.entries(value)) if (key !== 'evidence_ids') visit(item);
        }
      };
      visit(sample);
      return { ...sample, target_disease_id: payload.target_disease_id, quantitative_source: origin, evidence_registry: registry, evidence: [...ids].map((id) => registry[id]) };
    });
  }
  function quantitativeText(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(quantitativeText).filter(Boolean).join('; ');
    return value && typeof value === 'object' ? (typeof value.text === 'string' ? value.text : typeof value.label === 'string' ? value.label : value.description ? quantitativeText(value.description) : '') : '';
  }
  function reportedNumber(fact, effect=false) {
    if (!fact || typeof fact !== 'object') return 'NA';
    const checked = semanticNumbers?.checkedText(fact);
    if (checked === 'NA' || (fact.semantic_non_scalar_source_literal === true && ['estimate','ci_lower','ci_upper','sample_size'].includes(fact.semantic_numeric_role))) return 'NA';
    if (fact.status === 'not_applicable' && !finite(fact.value)) return 'NA';
    const fmt=effect?compactExtraction.formatEffectNumber:compactExtraction.formatNumber;
    const percent = fact.semantic_display_checked === true && finite(fact.semantic_source_percent_value) ? fmt(fact.semantic_source_percent_value) + '%' : null;
    const raw = percent ?? checked ?? (finite(fact.value) ? String(fact.value) : '');
    const unrounded = raw || (typeof fact.value === 'number' && Number.isFinite(fact.value) ? String(fact.value) : '');
    const present = /p[_ -]?value/i.test(fact.semantic_numeric_role||fact.role||'')||/^[<>≤≥]/.test(unrounded)||/less|greater|[<>≤≥]/.test(fact.qualifier||'') ? unrounded : String(unrounded).replace(/^([<>≤≥]?\s*)([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(\s*%?)$/i,(_,prefix,value,suffix)=>prefix+fmt(value)+suffix);
    if (fact.status === 'not_reported' && !finite(fact.value)) return 'NA';
    if (!present) return 'NA';
    const qualifier = typeof fact.qualifier === 'string' ? fact.qualifier : '';
    const symbols = { less_than: '<', less_than_or_equal: '≤', less_or_equal: '≤', greater_than: '>', greater_than_or_equal: '≥', greater_or_equal: '≥', '<': '<', '>': '>', '≤': '≤', '≥': '≥' };
    const prefix = symbols[qualifier] && !/^[<>≤≥]/.test(present) ? symbols[qualifier] : '';
    const unit = typeof fact.unit === 'string' ? fact.unit : '';
    const unitAlreadyPrinted = /%/.test(present) && ['percent', 'percentage', '%'].includes(unit.toLowerCase());
    const ratioUnit = ['ratio', 'hazardratio', 'oddsratio', 'riskratio', 'relativerisk', 'timeratio', 'hr', 'or', 'rr', 'tr'].includes(unit.toLowerCase().replace(/[\s_-]+/g, ''));
    const suffix = unit && !ratioUnit && !unitAlreadyPrinted && !['ratio', 'probability', 'count', 'people', 'participants', 'patients', 'events', 'not_reported'].includes(unit) && !present.toLowerCase().includes(unit.toLowerCase()) ? ` ${unit}` : '';
    return `${prefix}${present}${suffix}${fact.status === 'unclear' ? ' (unclear)' : ''}`;
  }
  function confidence95(fact) {
    return fact?.status === 'reported' && ((fact.value === 0.95 && fact.unit === 'probability') || (fact.value === 95 && ['%', 'percent', 'percentage'].includes(fact.unit)) || /^95(?:[.·]0+)?\s*%$/.test(String(fact.raw_text || '').trim()));
  }
  function quantitativeMeasure(row) { return quantitativeText(row.measure || row.effect_measure); }
  function populationCountIsContext(sample) {
    if (['enrolled', 'recruited', 'randomized', 'assigned', 'treated', 'evaluable', 'safety'].includes(sample?.sample_context_role)) return true;
    return sample?.domain === 'study_design' && sample.counting_unit === 'participants' && /\b(enrolled|recruited|assigned|randomi[sz]ed|allocated)\b/i.test(sample.quantity_label || '');
  }
  function quantitativePriority(row) {
    const measure = quantitativeMeasure(row).toUpperCase();
    const comparative = ['HR', 'RR', 'OR', 'RD', 'MD', 'SMD', 'TR'].includes(measure);
    const type = row.analysis?.contrast_type || row.contrast_type;
    const group = comparative ? (type === 'treatment_comparison' ? 0 : 1) : 2;
    const complete = [row.estimate, row.ci_lower, row.ci_upper].every((fact) => fact?.status === 'reported' && typeof fact.value === 'number' && Number.isFinite(fact.value));
    const cohort = (Array.isArray(row.population_counts) ? row.population_counts : []).some(populationCountIsContext);
    return group * 4 + (complete ? 0 : 2) + (cohort ? 0 : 1);
  }
  function filterQuantitativeResults(rows, selection = {}, catalog = []) {
    return (Array.isArray(rows) ? rows : []).filter((row) => quantitativeFlags.every((key) => row[key] === false) &&
      diseaseMatches(selection.disease, [row.target_disease_id], catalog) &&
      (!selection.endpoint || row.endpoint?.family === selection.endpoint) &&
      (!selection.measure || quantitativeMeasure(row) === selection.measure) &&
      (!selection.source || row.quantitative_source === selection.source) &&
      (!selection.intervention || (Array.isArray(row.associated_intervention_ids || row.intervention_ids) && (row.associated_intervention_ids || row.intervention_ids).includes(selection.intervention))))
      .map((row, index) => ({ row, index })).sort((a, b) => quantitativePriority(a.row) - quantitativePriority(b.row) || a.index - b.index).map(({ row }) => row);
  }
  function studyArticles(articles, quantitativeRows = [], selection = {}, catalog = []) {
    const screening = new Set(filterR2Articles(articles, selection).map((row) => row.report_id));
    const reported = new Set(filterQuantitativeResults(quantitativeRows, selection, catalog).map((row) => row.report_id));
    return (Array.isArray(articles) ? articles : []).filter((row) => row.r2?.screening_status === 'both_retain' && (screening.has(row.report_id) || reported.has(row.report_id)));
  }
  function quantitativeBrowseEvidence(index, rows, catalog = []) {
    const pairs = [...(index?.pairs || [])].map((key) => { const [disease_id, endpoint] = JSON.parse(key); return { disease_id, endpoint, report_count: 1 }; });
    for (const row of Array.isArray(rows) ? rows : []) {
      const endpoint = row.endpoint?.family;
      if (typeof endpoint !== 'string' || !endpoint || ['other', 'unclear'].includes(endpoint)) continue;
      for (const disease_id of ancestorClosure([row.target_disease_id], catalog)) pairs.push({ disease_id, endpoint, report_count: 1 });
    }
    return evidenceIndex([], [], pairs, catalog);
  }
  function evidenceIndex(records = [], validatedRows = [], approvedCombinations, catalog = []) {
    const index = { pairs: new Set(), byDisease: new Map(), byEndpoint: new Map(), reportsByPair: new Map(), reportIds: new Set() };
    const add = (disease, endpoint, reportId = null) => {
      if (typeof disease !== 'string' || !disease || typeof endpoint !== 'string' || !endpoint) return;
      const key = JSON.stringify([disease, endpoint]);
      index.pairs.add(key);
      if (!index.byDisease.has(disease)) index.byDisease.set(disease, new Set());
      if (!index.byEndpoint.has(endpoint)) index.byEndpoint.set(endpoint, new Set());
      index.byDisease.get(disease).add(endpoint); index.byEndpoint.get(endpoint).add(disease);
      if (reportId !== null) {
        if (!index.reportsByPair.has(key)) index.reportsByPair.set(key, new Set());
        index.reportsByPair.get(key).add(String(reportId)); index.reportIds.add(String(reportId));
      }
    };
    if (Array.isArray(approvedCombinations)) {
      for (const row of approvedCombinations) if (row && Number.isInteger(row.report_count) && row.report_count > 0) add(row.disease_id, row.endpoint);
    } else {
      for (const record of Array.isArray(records) ? records : []) {
        const diseases = Array.isArray(record?.cancer_ids) ? record.cancer_ids : [];
        const endpoints = Array.isArray(record?.endpoint_families) ? record.endpoint_families : [];
        for (const disease of ancestorClosure(diseases, catalog)) for (const endpoint of endpoints) add(disease, endpoint, record.report_id ?? null);
      }
    }
    for (const row of Array.isArray(validatedRows) ? validatedRows : []) if (row?.validated === true) for (const disease of ancestorClosure([row.disease_id], catalog)) add(disease, row.endpoint);
    return index;
  }
  function availableCombination(index, disease = '', endpoint = '') {
    if (!index) return false;
    if (disease && endpoint) return index.pairs.has(JSON.stringify([disease, endpoint]));
    if (disease) return !!index.byDisease.get(disease)?.size;
    if (endpoint) return !!index.byEndpoint.get(endpoint)?.size;
    return index.pairs.size > 0;
  }
  function reconcileEvidenceSelection(index, disease = '', endpoint = '') {
    return { disease, endpoint: endpoint && !availableCombination(index, disease, endpoint) ? '' : endpoint };
  }
  const format = (value) => finite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—';
  function extent(values, include = null) { const list = values.filter(finite); if (finite(include)) list.push(include); let low = Math.min(...list), high = Math.max(...list); if (!list.length) return null; if (low === high) { low -= .25; high += .25; } const pad = (high - low) * .12; return [low - pad, high + pad]; }
  function frame(width, height, label, body) { return `<svg class="chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(label)}"><title>${xml(label)}</title>${body}</svg>`; }
  function forestSvg(rows, pooled, measure = 'HR', label = 'Forest plot', rowHeading = 'Study / cohort') {
    const clean = rows.filter((row) => row.validated === true && validEstimate(row, measure));
    if (!clean.length) return '';
    const logarithmic = ratio(measure), transform = logarithmic ? Math.log : (n) => n, inverse = logarithmic ? Math.exp : (n) => n;
    const hasPooled = pooled?.validated === true && validEstimate(pooled, measure);
    const values = [...clean, ...(hasPooled ? [pooled] : [])].flatMap((row) => { const v = estimate(row); return [transform(v.low), transform(v.high)]; });
    const domain = extent(values, 0), width = 940, top = 49, left = 335, right = 690, bottom = top + (clean.length + (hasPooled ? 1 : 0)) * 32, height = bottom + 68;
    const x = (v) => left + (transform(v) - domain[0]) / (domain[1] - domain[0]) * (right - left);
    let body = `<text class="chart-label" x="20" y="23">${xml(rowHeading)}</text><text class="chart-label" x="744" y="23">${xml(measure)} (CI)</text><line class="null-line" x1="${x(logarithmic ? 1 : 0)}" x2="${x(logarithmic ? 1 : 0)}" y1="34" y2="${bottom}"/>`;
    const rowSvg = (row, index, isPooled) => {
      const v = estimate(row), y = top + index * 32, name = String(row.label || row.study || row.omitted || row.report_id || 'Validated study');
      const marker = isPooled ? `<polygon class="pooled-marker" points="${x(v.low)},${y} ${x(v.effect)},${y - 7} ${x(v.high)},${y} ${x(v.effect)},${y + 7}"/>` : `<line class="ci-line" x1="${x(v.low)}" x2="${x(v.high)}" y1="${y}" y2="${y}"/><line class="ci-line" x1="${x(v.low)}" x2="${x(v.low)}" y1="${y - 4}" y2="${y + 4}"/><line class="ci-line" x1="${x(v.high)}" x2="${x(v.high)}" y1="${y - 4}" y2="${y + 4}"/><rect class="effect-marker" x="${x(v.effect) - 4}" y="${y - 4}" width="8" height="8"/>`;
      return `<g><title>${xml(name)}: ${format(v.effect)} (${format(v.low)}–${format(v.high)})</title><text x="20" y="${y + 4}">${xml(name.length > 47 ? name.slice(0, 44) + '…' : name)}</text>${marker}<text x="744" y="${y + 4}">${format(v.effect)} (${format(v.low)}–${format(v.high)})</text></g>`;
    };
    clean.forEach((row, index) => { body += rowSvg(row, index, false); });
    if (hasPooled) body += rowSvg({ ...pooled, label: pooled.pooling_model_label || 'Pooled effect' }, clean.length, true);
    body += `<line class="axis-line" x1="${left}" x2="${right}" y1="${bottom + 8}" y2="${bottom + 8}"/>`;
    for (let i = 0; i < 5; i++) { const value = inverse(domain[0] + i / 4 * (domain[1] - domain[0])), at = x(value); body += `<line class="axis-line" x1="${at}" x2="${at}" y1="${bottom + 8}" y2="${bottom + 13}"/><text text-anchor="middle" x="${at}" y="${bottom + 29}">${format(value)}</text>`; }
    body += `<text text-anchor="middle" x="${(left + right) / 2}" y="${bottom + 51}">${xml(measure)}${logarithmic ? ' · logarithmic axis' : ''}</text>`;
    return frame(width, height, label, body);
  }
  function funnelSvg(rows, measure = 'HR') {
    const logarithmic = ratio(measure), transform = logarithmic ? Math.log : (n) => n;
    const clean = rows.filter((row) => row.validated === true && finite(row.effect) && (!logarithmic || row.effect > 0) && finite(row.se) && row.se > 0);
    if (clean.length < 2) return '';
    const domain = extent(clean.map((row) => transform(row.effect)), 0), maxSe = Math.max(...clean.map((row) => row.se)) * 1.12, left = 80, right = 730, top = 30, bottom = 350;
    const x = (v) => left + (transform(v) - domain[0]) / (domain[1] - domain[0]) * (right - left), y = (v) => top + v / maxSe * (bottom - top);
    let body = `<line class="axis-line" x1="${left}" x2="${left}" y1="${top}" y2="${bottom}"/><line class="axis-line" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/><line class="null-line" x1="${x(logarithmic ? 1 : 0)}" x2="${x(logarithmic ? 1 : 0)}" y1="${top}" y2="${bottom}"/>`;
    for (let i = 0; i <= 4; i++) { const se = i / 4 * maxSe; body += `<line class="grid-line" x1="${left}" x2="${right}" y1="${y(se)}" y2="${y(se)}"/><text x="68" y="${y(se) + 4}" text-anchor="end">${format(se)}</text><text x="${left + i / 4 * (right - left)}" y="376" text-anchor="middle">${format(domain[0] + i / 4 * (domain[1] - domain[0]))}</text>`; }
    for (const row of clean) body += `<circle class="effect-marker" cx="${x(row.effect)}" cy="${y(row.se)}" r="4"><title>${xml(row.label || row.report_id || 'Study')}: ${format(row.effect)}, SE ${format(row.se)}</title></circle>`;
    body += `<text text-anchor="middle" x="405" y="405">${logarithmic ? 'log ' : ''}${xml(measure)}</text><text text-anchor="middle" transform="translate(22 190) rotate(-90)">Standard error</text>`;
    return frame(800, 425, 'Funnel plot of supplied effect estimates and standard errors', body);
  }
  function sampleSizeSvg(rows, measure = 'HR') {
    const clean = rows.filter((row) => row.validated === true && independentCount(row) >= 2 && finite(row.effect) && row.effect > 0 && Number.isInteger(row.required_total) && row.required_total > 0 && row.effect_measure === measure && !!direction(row));
    if (!clean.length) return '';
    const domainX = extent(clean.map((row) => Math.log(row.effect))), domainY = extent(clean.map((row) => Math.log10(row.required_total))), left = 70, right = 650, top = 32, bottom = 335;
    const x = (value) => left + (Math.log(value) - domainX[0]) / (domainX[1] - domainX[0]) * (right - left), y = (value) => bottom - (Math.log10(value) - domainY[0]) / (domainY[1] - domainY[0]) * (bottom - top);
    let body = `<line class="axis-line" x1="${left}" x2="${left}" y1="${top}" y2="${bottom}"/><line class="axis-line" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>`;
    for (let i = 0; i <= 4; i++) { const xv = domainX[0] + i / 4 * (domainX[1] - domainX[0]), yv = domainY[0] + i / 4 * (domainY[1] - domainY[0]), xp = left + i / 4 * (right - left), yp = bottom - i / 4 * (bottom - top); body += `<line class="grid-line" x1="${left}" x2="${right}" y1="${yp}" y2="${yp}"/><text text-anchor="end" x="60" y="${yp + 4}">${format(yv)}</text><text text-anchor="middle" x="${xp}" y="359">${format(xv)}</text>`; }
    for (const row of clean) { const color = colors[direction(row)], label = String(row.label || row.intervention_label || row.intervention_id || 'Regimen'), atX = x(row.effect), atY = y(row.required_total), flip = atX > 510; body += `<g><title>${xml(label)}: ${xml(row.pooling_model_label||'Pooled effect')}, ${measure} ${format(row.effect)}, total N ${row.required_total.toLocaleString('en-US')}</title><circle cx="${atX}" cy="${atY}" r="4" fill="${color}"/><text class="sample-label" x="${atX + (flip ? -7 : 7)}" y="${atY - 6}" text-anchor="${flip ? 'end' : 'start'}" style="fill:${color}">${xml(label)} · N=${xml(row.required_total.toLocaleString('en-US'))}</text></g>`; }
    body += `<text text-anchor="middle" x="360" y="394">log ${xml(measure)}</text><text text-anchor="middle" transform="translate(19 188) rotate(-90)">log₁₀ required total N</text>`;
    return frame(760, 415, 'Validated sample-size planning results', body);
  }
  function studyResults(study) {
    const values = study?.details?.quantitative_results || study?.quantitative_results || [];
    const rows=Array.isArray(values)?values:Array.isArray(values.results)?values.results:[];
    const groups=study?.details?.canonical_result_groups;
    if(!Array.isArray(groups))return rows;
    const by=new Map(rows.map((row)=>[row.result_id,row])),seen=new Set();
    const merged=groups.map((group)=>{
      const ids=group.member_result_ids||[],representative=by.get(group.representative_result_id);
      if(new Set(ids).size!==ids.length||!representative||!ids.includes(representative.result_id)||ids.some((id)=>!by.has(id)||seen.has(id)))throw new Error('Invalid merged source-result group.');
      ids.forEach((id)=>seen.add(id));
      return {...representative,canonical_group_id:group.canonical_result_id,source_extraction_ids:[...ids]};
    });
    if(seen.size!==rows.length)throw new Error('Merged evidence omitted an original extraction.');
    return merged;
  }
  function scopedStudies(payload) {
    if(payload?.source_report_count!==undefined&&payload?.cohort_count!==undefined&&payload.source_report_count!==payload.cohort_count)throw new Error('Source report cohort count differs from PMID article projection.');
    if (payload?.schema_version !== 1 || !Array.isArray(payload.studies) || !['metaCutaneousMelanomaTrial', undefined].includes(payload.project) || ((payload.article_count??payload.cohort_count)!==undefined && (payload.article_count??payload.cohort_count)!==payload.studies.length)) throw new Error('The scoped study dataset is invalid.');
    const seen = new Set();
    const numbered = semanticNumbers ? semanticNumbers.applyDataset(payload) : payload.studies;
    if(payload.numeric_completion_v6_display_overlay&&!numericCompletion)throw new Error('The finite numerical display module is unavailable.');
    const displayed = numericCompletion ? numericCompletion.applyDataset(payload,numbered) : numbered;
    if (payload.semantic_numeric_views && !semanticNumbers) throw new Error('The semantic numeric display module is unavailable.');
    return displayed.map((study) => {
      if (!/^report-[a-f0-9]{24}$/.test(study.report_id) || seen.has(study.report_id) || typeof study.title !== 'string' || !Array.isArray(study.comparisons) || typeof study.default_visible !== 'boolean') throw new Error('A scoped study has an invalid identity or display scope.');
      const results=studyResults(study),ids=new Set(results.flatMap((row)=>row.source_extraction_ids||[row.result_id])),sourceReports=new Set(study.details?.PMID_evidence_merge?.source_report_ids||[study.report_id]);
      if (results.some((row)=>!sourceReports.has(row.report_id)) || study.comparisons.some((comparison)=>(comparison.scope?.report_id && !sourceReports.has(comparison.scope.report_id)) || (comparison.result_ids||[]).some((id)=>!ids.has(id)))) throw new Error('A study result or comparison is linked to a different report.');
      seen.add(study.report_id);
      return study;
    });
  }
  function displayMeasure(row) {
    const statistic=quantitativeText(row?.display_measure||row?.measure||row?.effect_measure).trim();
    if(/^(?:(?:adjusted|unadjusted)\s+)?(?:HR|aHR|hazard[ _-]ratio)$/i.test(statistic))return 'HR';
    if (row?.display_measure) return /^median (?:OS|PFS|overall survival|progression[- ]free survival)$/i.test(row.display_measure)?'median':row.display_measure;
    const measure = quantitativeMeasure(row);
    if (measure === 'ORR' || measure === 'objective_response_rate' || measure === 'overall_response_rate') return 'ORR';
    if (measure === 'response_probability') {
      const label = [quantitativeText(row.endpoint?.definition), quantitativeText(row.variable), quantitativeText(row.measure_verbatim)].join(' ');
      if (/\b(?:objective|overall)\s+response(?:\s+rate)?\b|\bORR\b/i.test(label) && !/\b(?:complete|partial)\s+response\b/i.test(label)) return 'ORR';
      return 'response_probability';
    }
    return measure;
  }
  const SUPPORTIVE_COMPARATOR = 'Best supportive care / observation / placebo';
  const SURGERY_COMPARATOR = 'Surgery alone / without immunotherapy';
  function comparerText(value) {
    return quantitativeText(value).normalize('NFKC')
      .replace(/&#(?:x2f|47);|&sol;|\\\//gi, '/')
      .replace(/&nbsp;|&#160;/gi, ' ').replace(/&micro;|&#181;/gi, 'μ')
      .replace(/&sup2;|&#178;|<sup>\s*2\s*<\/sup>/gi, '2')
      .replace(/[‐‑–—−]/g, '-').replace(/\s+/g, ' ').trim();
  }
  function withoutComparerDose(value) {
    return comparerText(value)
      .replace(/(?:\d[\d,.]*(?:\s*-\s*\d[\d,.]*)?)\s*(?:(?:million|thousand)\s+)?(?:mg|mcg|μg|ug|ng|g|miu|mu|iu|units?|gy|cgy)\b(?:\s*(?:\/|per\s+)\s*(?:kg|m\^?[23]|days?|weeks?|hours?|h|d))*/gi, ' ')
      .replace(/\b(?:once|twice|three times)\s+(?:a\s+)?(?:daily|weekly|day|week)\b|\b(?:daily|weekly|q\s*\d+\s*(?:w(?:ks?)?|d|h)|every\s+\d+\s*(?:days?|weeks?|hours?))\b/gi, ' ')
      .replace(/\bfor\s+(?:a\s+total\s+of\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:doses?|cycles?|courses?)\b/gi, ' ')
      .replace(/\b(?:high|low|standard)[ -]dose\b|\b(?:monotherapy|single[ -]agent|alone|only)\b/gi, ' ')
      .replace(/^\s*(?:(?:arm|group)\s+[a-z\d]+|monotherapy)\s*:\s*/i, '')
      .replace(/\(\s*(?:arm|group|control|reference)?\s*\)/gi, ' ')
      .replace(/\s*\(\s*\)\s*/g, ' ').replace(/\s+/g, ' ')
      .replace(/^[\s,;:]+|[\s,;:]+$/g, '').trim();
  }
  function comparerIdentity(value) { return comparerText(value).toLowerCase().replace(/\s*([+/:])\s*/g, '$1').replace(/\s+/g, ' ').trim(); }
  function comparerName(value) {
    const name = comparerText(value).replace(/_/g, ' ');
    return name ? name[0].toUpperCase() + name.slice(1) : '';
  }
  const legacyRegimens=new Map();
  function regimenDescription(value) {
    if(value?.record_kind==='regimen_definition')return regimenDefinitions.describe(value);
    const label=comparerText(value);
    if(!legacyRegimens.has(label))legacyRegimens.set(label,treatmentGroups.definitionFromLabel(label));
    return regimenDefinitions.describe(legacyRegimens.get(label));
  }
  function treatmentBadge(label, classIds) {
    const allIn = options => classIds.length && classIds.every(id => options.includes(id));
    const family = allIn(['ctla4','pd1','pdl1','lag3','pd1-lag3','pd1-tim3','pd1-pdl1-unspecified','ici-other','ici-unspecified']) ? 'ici'
      : allIn(['braf','mek','other-targeted','braf-mek-unspecified']) ? 'targeted'
      : classIds.length === 1 ? classIds[0] : 'other';
    return `<span class="treatment-tag" data-treatment-class="${xml(family)}">${xml(label)}</span>`;
  }
  function treatmentRegimen(content, addOn) {
    const prefix = addOn ? '<span class="treatment-add-on" title="Added to the comparator regimen" aria-label="Added to the comparator regimen">+</span> ' : '';
    return `<span class="treatment-regimen">${prefix}${content}</span>`;
  }

  // These tabs already store the displayed arm wording. Decorate named agents
  // in place so dose, schedule, order, and counts in these labels survive.
  let savedTreatmentNames;
  function savedTreatmentTag(label, addOn=false, n=null) {
    if (!label || label === 'NA' || label === '—') return '—';
    const resolver = treatmentGroups.resolver;
    if (!savedTreatmentNames) {
      const names = new Set();
      for (const entry of [...resolver.registry.products, ...resolver.registry.generic_classes]) {
        for (const name of [entry.label, ...entry.aliases]) {
          if (name.length >= 2 && resolver.exact(name).length === 1) names.add(name.toLowerCase());
        }
      }
      const alternatives = [...names].sort((a,b)=>b.length-a.length).map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
      savedTreatmentNames = new RegExp('(?<![\\p{L}\\p{N}])(?:'+alternatives.join('|')+')(?![\\p{L}\\p{N}])','giu');
    }
    let content='', from=0;
    for (const match of label.matchAll(savedTreatmentNames)) {
      const [entry] = resolver.exact(match[0]);
      if (!entry) continue;
      content += xml(label.slice(from,match.index)) + treatmentBadge(match[0],[entry.class_id]);
      from = match.index + match[0].length;
    }
    content = from ? content + xml(label.slice(from)) : treatmentBadge(label,regimenDescription(label).class_ids || []);
    const count = Number.isSafeInteger(n) && n >= 0 ? ` <span class="treatment-arm-n">(N=${n.toLocaleString('en-US')})</span>` : '';
    return treatmentRegimen(content,addOn) + count;
  }
  function comparatorPresentation(comparison, labelForDrug = comparerName) {
    const definition=regimenDefinitions.resolve(comparison,'comparator'),description=regimenDescription(definition);
    const single=comparison.kind==='single_arm'||comparison.comparator_key==='__single_arm__';
    const reviewedReference=comparison.presentation_direction_verified===true&&regimenSourceRules.lookup(comparison)?.direction_verified===true;
    if(comparison.comparator_filter_eligible===false&&!single&&!reviewedReference)return {key:'',label:'—',placebo:false,definition};
    if(single)return {key:'__single_arm__',label:'No comparator',placebo:false,definition};
    if(description.known&&!description.agent_ids.length&&description.class_ids.length===1){
      const group=description.class_ids[0];
      if(group==='supportive')return {key:'comparer:supportive',label:SUPPORTIVE_COMPARATOR,placebo:false,definition};
      if(group==='surgery')return {key:'comparer:surgery',label:SURGERY_COMPARATOR,placebo:false,definition};
      if(group==='no-comparator')return {key:'__single_arm__',label:description.label,placebo:false,definition};
    }
    return {key:definition.raw_label?'comparer:regimen:'+description.key:'',label:definition.raw_label?description.label:'—',placebo:description.placebo===true,definition};
  }
  function comparatorKey(comparison) { return comparatorPresentation(comparison).key; }
  function comparatorDisplayLabel(comparison, labelForDrug) { return comparatorPresentation(comparison, labelForDrug).label; }
  function comparatorGroupLabels(comparisons, labelForDrug) {
    const labels = new Map();
    for (const comparison of comparisons) {
      const row = comparatorPresentation(comparison, labelForDrug);
      if (!row.key) continue;
      const old = labels.get(row.key);
      if (!old || (row.placebo && !old.placebo) || (row.placebo === old.placebo && row.label.localeCompare(old.label) < 0)) labels.set(row.key, row);
    }
    return new Map([...labels].map(([key,row]) => [key,row.label]));
  }
  function additionalDrugIds(comparison) {
    if (Array.isArray(comparison.additional_intervention_drug_ids)) return comparison.additional_intervention_drug_ids;
    const comparator = new Set(comparison.comparator_drug_ids || []);
    return (comparison.intervention_drug_ids || []).filter((id) => !comparator.has(id));
  }
  function additionalInterestIds(comparison) {
    return Array.isArray(comparison.additional_intervention_ids) ? comparison.additional_intervention_ids : additionalDrugIds(comparison);
  }
  function studyComparisons(study,{registry={}}={}) {
    const rows = [...(study.comparisons || [])];
    for (const arm of study.single_arm_regimens || []) {
      if (rows.some((row) => row.comparison_id && row.comparison_id === arm.comparison_id)) continue;
      rows.push({ ...arm, kind: 'single_arm', comparator_key: '__single_arm__', comparator_label: 'No comparator', additional_intervention_drug_ids: arm.additional_intervention_drug_ids || arm.drug_ids || arm.intervention_drug_ids || [] });
    }
    return study.quantitative_only?conciseGroups.presentationComparisons(study,rows,{registry,eligible_samples:reportedStudyCounts(study,null,registry)}):rows;
  }
  function mainResultEligible(row) { return row.main_result_eligible !== false && melanomaScope.resultEligible(row); }
  const survivalEndpointLabels=Object.freeze({overall_survival:'OS',progression_free_survival:'PFS',disease_free_survival:'DFS',recurrence:'RFS',recurrence_free_survival:'RFS',distant_metastasis_free_survival:'DMFS',event_free_survival:'EFS',disease_specific_survival:'DSS',duration_of_response:'DOR',survival:'Survival'});
  const responseEndpointLabels=Object.freeze({response:'ORR',objective_response:'ORR',complete_response:'CR',partial_response:'PR',disease_control:'DCR',pathological_complete_response:'pCR'});
  function endpointLabel(endpoint){return survivalEndpointLabels[endpoint]||responseEndpointLabels[endpoint]||({adverse_events:'Safety'})[endpoint]||String(endpoint||'').replace(/_/g,' ');}
  const endpointOptionLabels=Object.freeze({
    overall_survival:'Overall survival (OS)',progression_free_survival:'Progression-free survival (PFS)',
    disease_free_survival:'Disease-free survival (DFS)',recurrence:'Recurrence-free survival (RFS)',recurrence_free_survival:'Recurrence-free survival (RFS)',
    distant_metastasis_free_survival:'Distant metastasis-free survival (DMFS)',event_free_survival:'Event-free survival (EFS)',
    disease_specific_survival:'Disease-specific survival (DSS)',duration_of_response:'Duration of response (DOR)',
    response:'Objective response rate (ORR)',objective_response:'Objective response rate (ORR)',
    complete_response:'Complete response (CR)',partial_response:'Partial response (PR)',disease_control:'Disease control rate (DCR)',
    pathological_complete_response:'Pathological complete response (pCR)',adverse_events:'Adverse events (AEs)',survival:'Survival'
  });
  function endpointOptionLabel(endpoint){return endpointOptionLabels[endpoint]||String(endpoint||'').replace(/_/g,' ').replace(/^./,letter=>letter.toUpperCase());}
  function reportedSurvivalEndpoint(row){
    // Use the endpoint's own definition before the finding's text. An abstract
    // mentioning several endpoints must not relabel a particular result.
    const texts=[quantitativeText(row.endpoint?.definition),quantitativeText(row.original_fact?.field),quantitativeText(row.variable)].filter(Boolean);
    for(const raw of texts){
      const text=raw.replace(/[_‐‑–—]/g,' '),found=[];
      for(const [family,pattern]of [['recurrence',/\b(?:recurrence|relapse)[ -]*free survival\b|\bRFS\b/i],['disease_free_survival',/\bdisease[ -]*free survival\b|\bDFS\b/i],['distant_metastasis_free_survival',/\bdistant[ -]*metastasis[ -]*free survival\b|\bDMFS\b/i],['overall_survival',/\boverall survival\b|\bOS\b/i],['progression_free_survival',/\bprogression[ -]*free survival\b|\bPFS\b/i],['event_free_survival',/\bevent[ -]*free survival\b|\bEFS\b/i],['disease_specific_survival',/\bdisease[ -]*specific survival\b|\bDSS\b/i],['duration_of_response',/\bduration of response\b|\bDOR\b/i]])if(pattern.test(text))found.push(family);
      if(found.length)return found.length===1?found[0]:null;
    }
    return null;
  }
  function displayEndpointFamily(row) {
    if(isORRResult(row))return 'response';
    const family=row.endpoint?.family||row.endpoint_family||'';
    if(family==='recurrence_free_survival')return 'recurrence';
    return ['recurrence','other','unclear',''].includes(family)?(reportedSurvivalEndpoint(row)||family):family;
  }
  function reportedHazardRatio(row){
    if(displayMeasure(row)!=='HR')return false;
    const sourceMeasure=quantitativeMeasure(row).replace(/_/g,' ');
    if(/\b(?:median|probability|percentage|percent|risk ratio|odds ratio|time ratio|log(?:arithm)?[ -]*(?:HR|hazard))\b/i.test(sourceMeasure))return false;
    const number=row.estimate?.value!=null?row.estimate:(row.reported_numbers||[]).find(n=>n.role==='estimate');
    return number?.status==='reported'&&typeof number.value==='number'&&Number.isFinite(number.value)&&number.value>0&&!/%|percent|patients?|participants?|months?|years?|weeks?|days?|probability|proportion/i.test(number.unit||'');
  }
  function isORRResult(row) {
    if (displayMeasure(row) === 'ORR') return true;
    const label = [quantitativeText(row.endpoint?.definition), quantitativeText(row.variable), quantitativeText(row.measure_verbatim)].join(' ');
    return /\b(?:objective|overall)\s+response(?:\s+rate)?\b|\bORR\b/i.test(label) && !/\b(?:complete|partial)\s+response\b/i.test(label);
  }
  function resultMatches(row, selection = {}) {
    if(selection.endpoint&&Object.hasOwn(survivalEndpointLabels,selection.endpoint)){
      if(!reportedHazardRatio(row))return false;
      if(['recurrence','recurrence_free_survival'].includes(selection.endpoint)&&row.endpoint?.family!=='recurrence_free_survival'&&reportedSurvivalEndpoint(row)!=='recurrence')return false;
    }
    const selectedEndpoint=selection.endpoint==='recurrence_free_survival'?'recurrence':selection.endpoint;
    return mainResultEligible(row) && (!selectedEndpoint || displayEndpointFamily(row) === selectedEndpoint) &&
      (!selection.orr_only || isORRResult(row)) && (!selection.measure || displayMeasure(row) === selection.measure || (selection.include_orr === true && displayMeasure(row) === 'ORR') || (selection.measure==='RR'&&endpointKind(selectedEndpoint)==='binary'&&['ORR','CR','PR','DCR','pCR','response_probability','event_probability','participant_count'].includes(displayMeasure(row))));
  }
  function treatmentLabel(id, labels) { return labels?.get?.(id) || labels?.[id] || String(id || '').replace(/_/g, ' '); }
  function treatmentClass(label) { return treatmentGroups.classify(withoutComparerDose(comparerText(label))); }
  function additionalPresentation(id, labels) {
    const label = treatmentLabel(id, labels), presentation = comparatorPresentation({ comparator_label:label });
    return { key:'additional:' + presentation.key, label:presentation.label || label };
  }
  function additionalGroupLabels(ids, labels) {
    const result = new Map();
    for (const id of ids) {
      const row = additionalPresentation(id, labels), previous = result.get(row.key);
      if (!previous || (/\(\+placebo\)/.test(row.label) && !/\(\+placebo\)/.test(previous)) || (/\(\+placebo\)/.test(row.label) === /\(\+placebo\)/.test(previous) && row.label.localeCompare(previous) < 0)) result.set(row.key, row.label);
    }
    return result;
  }
  function treatmentSelectionMatches(value, label, selected) {
    return !selected || (selected.startsWith('treatment-class:') ? treatmentGroups.matchesClass(label?.record_kind==='regimen_definition'?label:regimenDescription(label).definition,selected.slice('treatment-class:'.length)) : value === selected);
  }
  function completeArmKey(comparison,side) {
    if(side==='comparator' && (comparison.kind==='single_arm' || comparison.comparator_key==='__single_arm__'))return null;
    const rule=regimenSourceRules.lookup(comparison);
    if(rule?.is_add_on) {
      const pools=rule.source_regimen_pools?.[side==='comparator'?'reference':'intervention'];
      if(pools?.length!==1 || !pools[0].length)return null;
      const keys=pools[0].map(id=>'agent:'+id).sort();
      return keys.length===1?keys[0]:'combination:'+keys.map(key=>JSON.stringify(key)).join('|');
    }
    // An additional-drug label alone does not identify the full experimental arm.
    if(side==='intervention' && comparison.kind==='treatment_comparison' && !rule &&
       !comparison.intervention_native_regimen && !comparison.intervention_arms?.length &&
       !comparison.intervention_label && !comparison.intervention_drug_ids?.length && !comparison.compact_display_intervention_label)return null;
    return studyIndirect.studyKey(regimenDescription(regimenDefinitions.resolve(comparison,side)));
  }
  function exactBrowsePair(rows,selection) {
    const values=[selection.comparator,selection.intervention];
    if(values.some(value=>!value || value.startsWith('treatment-class:')&&!value.startsWith('treatment-class:agent:')))return null;
    let pair=null;
    for(const row of rows) {
      if(!comparatorSelectionMatches(row,selection.comparator,selection.treatment_labels) ||
         !interventionSelectionMatches(row,selection.intervention,selection.treatment_labels))continue;
      const keys=['comparator','intervention'].map(side=>completeArmKey(row,side));
      if(keys.some(key=>!key) || (pair && keys.some((key,i)=>key!==pair[i])))return null;
      pair=keys;
    }
    return pair;
  }
  function comparatorSelectionMatches(comparison, selected, labels) {
    if(selected?.startsWith('exact-regimen:'))return completeArmKey(comparison,'comparator')===selected.slice('exact-regimen:'.length);
    const row=comparatorPresentation(comparison,(id)=>treatmentLabel(id,labels));
    return (!selected || !!row.key) && treatmentSelectionMatches(row.key,row.definition,selected);
  }
  function interventionSelectionMatches(comparison, selected, labels) {
    if (!selected) return true;
    if(selected.startsWith('exact-regimen:'))return completeArmKey(comparison,'intervention')===selected.slice('exact-regimen:'.length);
    const presentation = interventionPresentation(comparison,labels);
    if (treatmentSelectionMatches(presentation.key,presentation.definition,selected)) return true;
    if (selected.startsWith('treatment-class:') || selected.startsWith('intervention:')) return false;
    return additionalInterestIds(comparison).some((id) => {
      const row = additionalPresentation(id, labels);
      return id === selected || treatmentSelectionMatches(row.key, row.label, selected);
    });
  }
  function interventionPresentation(comparison, labels) {
    let definition=regimenDefinitions.resolve(comparison,'intervention');
    if(!definition.raw_label){
      const fallback=additionalInterestIds(comparison).map(id=>treatmentLabel(id,labels)).join(' + ');
      if(fallback)definition=regimenDescription(fallback).definition;
    }
    const active=regimenDescription(definition);
    const correction = regimenSourceRules.lookup(comparison);
    if (correction) {
      return {key:'intervention:'+active.key,label:active.label || correction.intervention_label,is_add_on:correction.is_add_on===true,source_url:correction.source_url,definition};
    }
    const label=definition.raw_label;
    const control = regimenDescription(regimenDefinitions.resolve(comparison,'comparator'));
    const canonicalSource = comparison.scope?.record_kind==='canonical_review_scope' && comparison.scope?.review_binding_sha256 && comparison.scope?.source_input_sha256;
    const ownedSource = (comparison.intervention_arms || []).length===1 && (comparison.comparator_arms || []).length===1 && comparison.direction_basis &&
      comparison.intervention_arms[0].source_arm && comparison.comparator_arms[0].source_arm;
    const names = active.concurrent_agent_ids || [], background = control.concurrent_agent_ids || [];
    const leaves=(node)=>node.type==='agent'?[node]:(node.children||[]).flatMap(leaves);
    const activeParts=new Map(leaves(definition.root).map(part=>[part.agent_id,part]));
    const compatibleAdministration=leaves(control.definition.root).every(part=>{
      const other=activeParts.get(part.agent_id);
      return other&&['dose','route','schedule'].every(key=>!part[key]&&!other[key]||part[key]&&other[key]&&comparerIdentity(part[key])===comparerIdentity(other[key]));
    });
    // Only an explicit, source-owned pair of complete named regimens establishes add-on therapy.
    const simple = (description)=>description.simple_concurrent===true;
    if (comparison.kind==='treatment_comparison' && comparison.comparison_filter_eligible!==false && (canonicalSource || ownedSource) &&
        simple(active) && simple(control) && compatibleAdministration && background.length && background.every((id)=>names.includes(id))) {
      const extra = names.filter((id)=>!background.includes(id));
      if (extra.length && extra.length<names.length) {
        const addedDefinition=treatmentGroups.subsetDefinition(definition,extra),added=regimenDescription(addedDefinition);
        return {key:'intervention:'+added.key,label:added.label,is_add_on:true,definition:addedDefinition};
      }
    }
    return {key:'intervention:'+active.key,label:active.label || comparerName(label),is_add_on:false,definition};
  }
  function interventionGroupLabels(comparisons, labels) {
    const result=new Map();
    for(const comparison of comparisons){const row=interventionPresentation(comparison,labels);if(row.label&&!result.has(row.key))result.set(row.key,row.label);}
    return result;
  }
  function studyTreatmentRows(match, labels, {registry={}}={}) {
    const labelForDrug=(id)=>treatmentLabel(id,labels), comparatorLabels=comparatorGroupLabels(match.comparisons,labelForDrug), groups=new Map();
    for(const comparison of match.comparisons){
      const comparator=comparatorPresentation(comparison,labelForDrug),intervention=interventionPresentation(comparison,labels);
      const key=JSON.stringify([comparator.key,intervention.key,intervention.is_add_on,...(match.study.quantitative_only?[comparison.scope?.source_input_sha256||'',comparison.scope?.population_id||'',comparison.scope?.cutoff||comparison.cutoff||'']:[])]);
      if(!groups.has(key))groups.set(key,{comparator_label:comparatorLabels.get(comparator.key)||comparator.label,intervention_label:intervention.label,comparator_definition:comparator.definition,intervention_definition:intervention.definition,is_add_on:intervention.is_add_on,comparisons:[],results:[]});
      groups.get(key).comparisons.push(comparison);
    }
    const linked=new Set();
    for(const group of groups.values()){
      const ids=new Set(group.comparisons.flatMap((row)=>row.result_ids||[])), comparisons=new Set(group.comparisons.map((row)=>row.comparison_id));
      group.results=match.results.filter((row)=>(row.source_extraction_ids||[row.result_id]).some((id)=>ids.has(id)) || comparisons.has(row.comparison_id));
      group.results.forEach((row)=>linked.add(row));
    }
    const unassigned=match.results.filter((row)=>!linked.has(row));
    if(unassigned.length||!groups.size||match.study.numeric_completion_v6_treated_context)groups.set('unassigned',{comparator_label:'—',intervention_label:'',is_add_on:false,comparisons:[],results:unassigned,show_study_context:true});
    const rows=[...groups.values()];
    // Unlinked cohort counts are useful context, but are not model denominators.
    // Keep them once, outside treatment comparisons and exact outcome N cells.
    if(match.study.quantitative_only&&match.results.some(compactClinicalResult)){
      const key=(sample,id=sample.quantitative_record?.id)=>JSON.stringify([sample.source_input_sha256,sample.review_binding_sha256,id]);
      const used=new Set(),represented=[];
      for(const group of rows){
        const data=studyTableData({...match,...group},{registry});
        for(const entry of data.entries)if(entry.sample_size!=='NA')for(const id of entry.result.quantitative_record?.display_n?.count_ids||[])used.add(key(entry.result,id));
        for(const entry of data.counts){used.add(key(entry.source));represented.push(entry);}
      }
      const results=match.results.filter(compactClinicalResult),ids=new Set(results.map(row=>row.comparison_id));
      const scopes=match.comparisons.filter(co=>ids.has(co.comparison_id)||(co.result_ids||[]).some(id=>results.some(row=>(row.source_extraction_ids||[row.result_id]).includes(id))));
      const candidates=reportedStudyCounts(match.study,scopes,registry).filter(sample=>{
        const q=sample.quantitative_record;
        if(!q||used.has(key(sample))||q.complete!=='yes'||q.field_flags?.length||q.result_id&&q.result_id!=='NA')return false;
        const ownResults=results.filter(row=>row.source_input_sha256===sample.source_input_sha256&&row.review_binding_sha256===sample.review_binding_sha256&&row.quantitative_record?.population_id===q.population_id);
        // Existing outcome-specific N already supplies this population's context.
        // This separate fallback is only for populations with no displayed N.
        if(ownResults.some(row=>Number.isInteger((row.scoped_sample_size||row.quantitative_record.display_n)?.n)))return false;
        if(!ownResults.some(row=>!q.cutoff||q.cutoff==='NA'||!row.quantitative_record.cutoff||row.quantitative_record.cutoff==='NA'||q.cutoff===row.quantitative_record.cutoff))return false;
        const count={source:sample,sample_size:reportedNumber(sample.n)};
        return !represented.some(prior=>compactExtraction.countAlias(match.study,prior,count,registry));
      });
      for(const sample of candidates){
        const q=sample.quantitative_record,id=JSON.stringify([sample.source_input_sha256,sample.review_binding_sha256,q.population_id,q.cutoff]);
        let group=rows.find(row=>row.participant_context_key===id);
        if(!group){group={comparator_label:'—',intervention_label:'',is_add_on:false,comparisons:[],results:[],participant_context_key:id,context_counts:[],show_study_context:true,presentation_cutoff:q.cutoff&&q.cutoff!=='NA'?'Cutoff: '+q.cutoff:''};rows.push(group);}
        group.context_counts.push(sample);
      }
    }
    return rows;
  }
  function studyTablePresentationRows(match,options={}) {
    const rows=sourcePresentationRows(match,options);
    if(!match.inverted_comparisons?.size)return rows;
    return rows.map(group=>{
      const comparison=group.comparisons?.[0];
      if(!comparison || !group.comparisons.every(c=>match.inverted_comparisons.has(c.comparison_id)))return group;
      function complete(side) {
        const rule=regimenSourceRules.lookup(comparison),pool=rule?.source_regimen_pools?.[side==='intervention'?'intervention':'reference'];
        return rule?.is_add_on && pool?.length===1
          ?regimenDescription(pool[0].map(id=>treatmentLabel(id,options.labels)).join(' + ')).definition
          :regimenDefinitions.resolve(comparison,side);
      }
      const reference=complete('intervention'),active=complete('comparator');
      return {...group,display_reversed:true,is_add_on:false,
        comparator_definition:reference,intervention_definition:active,
        comparator_label:conciseTreatmentLabel(regimenDescription(reference).label,reference),
        intervention_label:conciseTreatmentLabel(regimenDescription(active).label,active),
        comparator_n:group.intervention_n,intervention_n:group.comparator_n,
        comparator_arm_id:group.intervention_arm_id,intervention_arm_id:group.comparator_arm_id};
    });
  }
  function sourcePresentationRows(match,{registry={},labels,include_missing_n=false}={}) {
    const base=conciseGroups.prepare(match,studyTreatmentRows(match,labels,{registry}),{registry,eligible_samples:match.study.quantitative_only?reportedStudyCounts(match.study,null,registry):[],displayable_results:match.results.filter(compactClinicalResult)});
    const exactRatio=group=>match.exact_comparison_pair && group.results.some(row=>boundComparativeRatio(group.comparisons,row));
    if(!match.study.quantitative_only)return include_missing_n?base:base.filter(group=>{const d=studyTableData({...match,...group},{registry});return exactRatio(group)||[...d.entries,...d.counts,d.treated].some(row=>row&&row.sample_size!=='NA');});
    const groups=base.flatMap(group=>{
      const cutoffs=[...new Set(group.results.map(row=>row.quantitative_record?.cutoff||'NA'))];
      return !group.keep_shared_cohort&&cutoffs.length>1?cutoffs.map(cutoff=>({...group,results:group.results.filter(row=>(row.quantitative_record?.cutoff||'NA')===cutoff),presentation_cutoff:cutoff==='NA'?'Cutoff not reported':'Cutoff: '+cutoff})): [{...group,presentation_cutoff:group.presentation_cutoff||(cutoffs[0]&&cutoffs[0]!=='NA'?'Cutoff: '+cutoffs[0]:'')}];
    });
    const removed=new Set();
    const populationMatches=(group,partition,count)=>group.comparisons.length&&group.comparisons.every(co=>{
      const scope=co.scope||{},qualified='CE-'+String(scope.review_binding_sha256||'').slice(0,24)+'-'+count.population_id;
      return scope.source_input_sha256===partition.source_input_sha256&&scope.population_id===qualified&&co.outcome_arm_id===count.arm_id;
    });
    for(const partition of compactExtraction.phasePartitions(match.study)){
      const parents=groups.filter(group=>populationMatches(group,partition,partition.parent));
      const children=partition.children.map(count=>groups.filter(group=>!group.results.length&&populationMatches(group,partition,count)));
      if(parents.length!==1||children.some(matches=>matches.length!==1))continue;
      const parent=parents[0],parts=children.map(matches=>matches[0]);
      if(parts.some(group=>group.comparator_label!==parent.comparator_label||group.intervention_label!==parent.intervention_label))continue;
      const data=studyTableData({...match,comparisons:parent.comparisons,results:parent.results},{registry});
      const ownsParent=data.entries.some(entry=>entry.result.quantitative_record?.display_n?.count_ids?.includes(partition.parent.id)&&entry.result.quantitative_record.display_n.count_purpose===partition.parent.count_purpose&&entry.sample_size===String(partition.parent.n))||data.counts.some(entry=>entry.source.quantitative_record?.id===partition.parent.id);
      if(!ownsParent)continue;
      parent.phase_partition=partition;parts.forEach(group=>removed.add(group));
    }
    const visible=groups.filter(group=>!removed.has(group)).map(group=>({...group,comparator_label:conciseTreatmentLabel(group.comparator_label,group.comparator_definition),intervention_label:conciseTreatmentLabel(group.intervention_label,group.intervention_definition)}));
    const views=new Map(visible.map(group=>[group,studyTablePresentation({...match,...group},{registry,phase_partition:group.phase_partition,reconcile_outcomes:false})]));
    return conciseGroups.consolidatePresentation(visible.filter(group=>include_missing_n||views.get(group).samples.length||hasPairedArmCounts(group)||exactRatio(group)),{viewFor:group=>views.get(group),treatmentText:presentationTreatmentText,study:match.study,registry});
  }
  function boundComparativeRatio(comparisons,row) {
    if(!['HR','RR','OR'].includes(displayMeasure(row)))return false;
    const point=confidenceIntervals.forDisplay(row).estimate;
    if(!Number.isFinite(point) || point<0)return false;
    const ids=row.source_extraction_ids || [row.result_id];
    return comparisons.some(c=>c.kind==='treatment_comparison' &&
      (c.comparison_id && c.comparison_id===row.comparison_id || ids.some(id=>c.result_ids?.includes(id))));
  }
  function hasPairedArmCounts(group){return group.paired_arm_context===true&&Number.isInteger(group.comparator_n)&&group.comparator_n>=0&&Number.isInteger(group.intervention_n)&&group.intervention_n>=0;}
  // Display labels alone can collapse identical OR branches. The structured
  // regimen graph (including dose and sequence) is never changed.
  function conciseTreatmentLabel(label,definition){
    if(!label||label==='—')return label;
    const render=part=>{
      if(!part.components?.length)return {label:part.label,compound:false};
      let children=part.components.map(child=>{const shown=render(child);return shown.compound?'('+shown.label+')':shown.label;});
      if(part.kind==='alternative')children=[...new Set(children)];
      return {label:children.join(' '+({alternative:'or',sequential:'→',optional:'±',combination:'+'}[part.kind]||'+')+' '),compound:children.length>1};
    };
    return render(regimenDescription(definition||label)).label||label;
  }
  function presentationTreatmentText(label,definition,addOn=false){
    if(!label||label==='—')return '—';
    const description=regimenDescription(definition||label);
    return (addOn?'+ ':'')+conciseTreatmentLabel(label,definition)+(description.components?.length>1&&description.placebo?' (+placebo)':'');
  }
  function reportedOutcomeAssessor(row){
    const definition=String(row.quantitative_record?.endpoint_definition||'');
    const labels=[];
    if(/\bcentral(?:ly)?[\s-]+(?:review(?:ed)?|assess(?:ment|ed)?)\b/i.test(definition))labels.push('Central review');
    if(/\binvestigators?[\s-]+(?:review(?:ed)?|assess(?:ment|ed)?)\b/i.test(definition))labels.push('Investigator review');
    // A definition mentioning both assessors does not assign either to a value.
    return labels.length===1?labels[0]:'';
  }
  function combinedStudyPresentation(match){
    const members=match.presentation_members,known=value=>value!==null&&value!==undefined&&value!==''&&value!=='NA';
    const sources=effect=>presentationEffectSources.get(effect)||[];
    const entries=members.flatMap(member=>member.view.effects.map(effect=>({effect,rows:sources(effect),member:member.row})));
    // A linked R3 value may complete an abstract interval, but never overwrite a
    // different estimate, known interval, response criterion, model or time.
    const supplements=(old,next)=>{
      if(old.rows.length!==1||next.rows.length!==1)return false;
      const a=old.rows[0],b=next.rows[0],x=a.quantitative_record||{},y=b.quantitative_record||{};
      if(a.review_stage!=='R2'||b.review_stage!=='R3'||a.extraction_conflict||b.extraction_conflict||a.measure!==b.measure)return false;
      if(reportedOutcomeAssessor(a)&&reportedOutcomeAssessor(b)&&reportedOutcomeAssessor(a)!==reportedOutcomeAssessor(b))return false;
      const record=compactExtraction.sourceRecord(match.study,b),section='numerator'in x?'binary':'kind'in x?'survival':'effects';
      const links=(record?.r2_links||[]).filter(link=>link.section===section);
      if(!links.some(link=>link.r2_id===x.id&&link.r3_id===y.id&&['same','supplement'].includes(link.relation)&&link.evidence?.length)||links.filter(link=>link.r2_id===x.id).length!==1||links.filter(link=>link.r3_id===y.id).length!==1)return false;
      for(const field of ['endpoint','kind','measure','unit','time','time_unit','assessment_time','response_criteria','model','adjusted','cutoff','safety_attribution','p_test','p_sidedness'])if(known(x[field])&&known(y[field])&&x[field]!==y[field])return false;
      const primary=typeof x.estimate==='number'?['estimate']:typeof x.percentage==='number'?['percentage']:['numerator','denominator'];
      if(!primary.some(key=>typeof x[key]==='number')||!primary.every(key=>typeof x[key]!=='number'||x[key]===y[key]))return false;
      return ['ci_lower','ci_upper','ci_level','p_value'].every(key=>typeof x[key]!=='number'||x[key]===y[key])&&['estimate','percentage','numerator','denominator','analysis_n'].every(key=>typeof x[key]!=='number'||typeof y[key]!=='number'||x[key]===y[key]);
    };
    const retained=entries.filter(entry=>!entries.some(other=>other!==entry&&supplements(entry,other)));
    const fieldValues=(entry,field)=>[...new Set(entry.rows.map(row=>row.quantitative_record?.[field]).filter(known).map(String))];
    const effectKey=entry=>entry.rows.length?[...new Set(entry.rows.map(row=>[tableEndpoint(row),displayMeasure(row),row.quantitative_record?.kind||''].join('|')))].sort().join(';'):entry.effect.label;
    const effects=new Map();
    for(const entry of retained){
      const peers=retained.filter(other=>effectKey(other)===effectKey(entry)),qualifiers=[];
      for(const field of ['response_criteria','model','adjusted']){
        const values=new Set(peers.flatMap(other=>fieldValues(other,field))),own=fieldValues(entry,field);
        if(values.size>1&&own.length===1){const value=field==='adjusted'?({yes:'Adjusted',no:'Unadjusted'}[own[0]]||own[0]):own[0];if(!entry.effect.label.includes(value))qualifiers.push(value);}
      }
      const assessors=other=>[...new Set(other.rows.map(reportedOutcomeAssessor).filter(Boolean))];
      const ownAssessors=assessors(entry);
      if(new Set(peers.flatMap(assessors)).size>1&&ownAssessors.length===1&&!entry.effect.label.includes(ownAssessors[0]))qualifiers.push(ownAssessors[0]);
      // Some accepted records put a lesion-size criterion in the cutoff field.
      // Retain that distinction beside its outcome when cohort rows consolidate.
      const threshold=other=>[...new Set(other.rows.map(row=>{const cutoff=String(row.quantitative_record?.cutoff||'');return /target[- ]lesion/i.test(cutoff)?cutoff.match(/\b(\d+(?:\.\d+)?)\s*[-–]?\s*mm\b/i)?.[1]:null;}).filter(Boolean))];
      const thresholds=new Set(peers.flatMap(threshold)),ownThreshold=threshold(entry);
      if(thresholds.size>1&&ownThreshold.length===1)qualifiers.push(ownThreshold[0]+' mm');
      const analysis=other=>[...new Set(other.rows.map(row=>{const cutoff=String(row.quantitative_record?.cutoff||'');return /\bfinal\b/i.test(cutoff)?'Final':/\binterim\b/i.test(cutoff)?'Interim':null;}).filter(Boolean))];
      if(new Set(peers.flatMap(analysis)).size>1&&analysis(entry).length===1)qualifiers.push(analysis(entry)[0]);
      const doses=[...new Set(peers.flatMap(other=>other.rows.map(row=>compactExtraction.resultDoseLabel(match.study,row))).filter(Boolean))];
      const ownDose=[...new Set(entry.rows.map(row=>compactExtraction.resultDoseLabel(match.study,row)).filter(Boolean))];
      if(doses.length>1&&ownDose.length===1&&!entry.effect.label.includes(ownDose[0]))qualifiers.push(ownDose[0]);
      const label=[entry.effect.label,...qualifiers].filter(Boolean).join(' · '),key=JSON.stringify([label,entry.effect.value]);
      if(!effects.has(key))effects.set(key,{label,value:entry.effect.value});
      const displayed=effects.get(key);presentationEffectSources.set(displayed,[...new Set([...(presentationEffectSources.get(displayed)||[]),...entry.rows])]);
    }
    const samples=new Map();
    for(const member of members)for(const sample of member.view.samples){
      const key=String(sample.sample_size),existing=samples.get(key);
      if(!existing)samples.set(key,{...sample});
      else {
        if(!existing.breakdown&&sample.breakdown)existing.breakdown=sample.breakdown;
        if(sample.denominator_note && !existing.denominator_note?.includes(sample.denominator_note))
          existing.denominator_note=[existing.denominator_note,sample.denominator_note].filter(Boolean).join(' ');
      }
    }
    // Equal N is printed once in the combined row. Distinct endpoints and source
    // records are still separately available above and in the study details.
    if(samples.size===1){const sample=[...samples.values()][0];sample.label=hasPairedArmCounts(match)&&Number(match.total_n)===Number(sample.sample_size)?'Total':'';}
    return {group:match.presentation_group??members[0].view.group,context:'',samples:[...samples.values()],effects:[...effects.values()]};
  }
  function visibleStudyMatches(matches,options={}){
    return matches.map(match=>({...match,presentation_rows:studyTablePresentationRows(match,options)})).filter(match=>match.presentation_rows.length);
  }
  function reconcilePresentationOutcomes(match,view,{registry={}}={}){
    if(!outcomeReconciliation?.selectOutcome||!view.effects.length)return view;
    const rowKey=outcomeReconciliation.rowKey;
    const fixedEffects=view.effects.filter(effect=>{
      const sources=presentationEffectSources.get(effect)||[];
      return /\s\/\s/.test(effect.label)&&sources.length>1&&sources.every(row=>{const q=row.quantitative_record||{};return q.numerator===1&&q.denominator===1&&['ORR','CR','PR','DCR'].includes(q.endpoint)&&!q.field_flags?.length;});
    });
    const fixedRows=new Set(fixedEffects.flatMap(effect=>(presentationEffectSources.get(effect)||[]).map(rowKey)));
    const rows=[...new Map(view.effects.flatMap(effect=>presentationEffectSources.get(effect)||[]).filter(row=>row.quantitative_record&&!fixedRows.has(rowKey(row))).map(row=>[rowKey(row),row])).values()];
    if(!rows.length)return view;
    const options={study:match.study,registry,rows,assessorFor:reportedOutcomeAssessor};
    const semantics=new Map(rows.map(row=>[rowKey(row),outcomeReconciliation.semanticOutcome(row,options)]));
    const known=value=>value!==null&&value!==undefined&&value!==''&&value!=='NA';
    const roleFor=row=>{
      const q=row.quantitative_record;
      if(q.intervention_arm_id||q.reference_arm_id)return 'contrast';
      if(!known(q.arm_id))return 'population';
      const own=match.comparisons.filter(c=>c.scope?.source_input_sha256===row.source_input_sha256&&c.scope?.review_binding_sha256===row.review_binding_sha256);
      const pair=own.find(c=>c.comparator_arm_id&&c.intervention_arm_id&&[c.comparator_arm_id,c.intervention_arm_id].includes(q.arm_id));
      if(pair)return pair.comparator_arm_id===q.arm_id?'comparator':'intervention';
      return 'intervention';
    };
    options.semanticFor=row=>semantics.get(rowKey(row))?.key;
    if(match.presentation_refinements?.length)options.scopeFor=row=>JSON.stringify([match.study.report_id,view.group,roleFor(row),presentationSampleSize(match.study,row,{registry,samples:match.study.details?.sample_size_records||[]})?.n??row.quantitative_record?.display_n?.n]);
    const kindFor=row=>{
      const q=row.quantitative_record;
      if(q.kind)return q.kind;
      if(q.measure)return q.measure;
      if('numerator'in q)return displayMeasure(row)==='event_episode_count'?'event_count':'response_proportion';
      return displayMeasure(row);
    };
    const horizonFor=row=>{
      const q=row.quantitative_record;
      // A follow-up cutoff is not an outcome horizon. Keep one- and five-year
      // probabilities distinct while allowing later analyses of the same horizon.
      return q.kind==='survival_probability'?JSON.stringify([q.time,q.time_unit]):'numerator'in q&&known(q.assessment_time)?JSON.stringify([q.assessment_time,q.time_unit]):'';
    };
    const descriptionFor=row=>{
      const q=row.quantitative_record,semantic=semantics.get(rowKey(row));
      const endpoint=semantic.specific?semantic.label:tableEndpoint(row);
      const kind=kindFor(row),time=compactExtraction.timeLabel(q);
      const basic=q.kind==='median'?`Median ${endpoint}`:q.kind==='survival_probability'?[endpoint,time].filter(Boolean).join(' · '):[endpoint,['response_proportion'].includes(kind)||displayMeasure(row)===endpoint?'':displayMeasure(row).replace(/_/g,' '),time].filter(Boolean).join(' · ');
      return {semantic,endpoint,kind,time,basic,role:roleFor(row),dose:compactExtraction.resultDoseLabel(match.study,row)||''};
    };
    const descriptions=new Map(rows.map(row=>[rowKey(row),descriptionFor(row)]));
    const doseFamilies=new Map();
    for(const row of rows){const d=descriptions.get(rowKey(row)),key=JSON.stringify([d.semantic.key,d.kind,d.role]);if(!doseFamilies.has(key))doseFamilies.set(key,new Set());if(d.dose)doseFamilies.get(key).add(d.dose);}
    // Missing dose wording is not a second dose cohort. Actual source/cohort
    // compatibility is still checked by the outcome selector.
    const familyDose=d=>doseFamilies.get(JSON.stringify([d.semantic.key,d.kind,d.role])).size>1?d.dose:'';
    const families=new Map();
    for(const row of rows){
      const d=descriptions.get(rowKey(row)),q=row.quantitative_record;
      // Adverse-event definitions identify distinct events and grades; they
      // must never collapse into one generic adverse-event value.
      const event=/^AE_|^treatment_related_death$/.test(q.endpoint||'')?compactExtraction.definition(q):'';
      const key=JSON.stringify([d.semantic.key,d.kind,horizonFor(row),d.role,familyDose(d),event]);
      if(!families.has(key))families.set(key,[]);
      families.get(key).push(row);
    }
    const values=new Map(studyTableData({...match,results:rows},{registry}).entries.map(entry=>[rowKey(entry.result),presentationOutcomeValue(match.study,entry)]));
    const effects=[],selections=[],series=new Map();
    for(const [key,members]of families){
      const descriptor=descriptions.get(rowKey(members[0]));
      let selection=outcomeReconciliation.selectOutcome(members,options);
      // Different methods can report exactly the same visible tuple. Show
      // that supported value once without declaring the methods equivalent.
      if(!selection.representative&&members.every(row=>typeof values.get(rowKey(row))==='string'&&values.get(rowKey(row))!=='NA')&&new Set(members.map(row=>values.get(rowKey(row)))).size===1){
        const supported=members.find(row=>outcomeReconciliation.selectOutcome([row],options).representative);
        if(supported)selection={...selection,representative:supported,status:'selected',selection_proof:{kind:'identical_display_value',scientific_equivalence:false}};
      }
      // Existing singleton facts are outside duplicate resolution. Preserve
      // their original warnings and numerical display without promoting them.
      if(members.length===1)selection={...selection,representative:members[0],status:'selected',selection_proof:{kind:'unchanged_single_result'}};
      const selected=selection.representative,selectedGroup=selected&&selection.groups.find(group=>group.members.includes(selected));
      const candidates=members.map(row=>({source:rowKey(row),label:descriptions.get(rowKey(row)).basic,value:values.get(rowKey(row))||'NA',stage:row.review_stage,cutoff:row.quantitative_record.cutoff,assessment:reportedOutcomeAssessor(row),assessment_time:compactExtraction.timeLabel(row),definition:row.quantitative_record.endpoint_definition,criteria:row.quantitative_record.response_criteria,model:row.quantitative_record.model,adjusted:row.quantitative_record.adjusted,numbers:Object.fromEntries(['estimate','percentage','numerator','denominator','ci_lower','ci_upper','ci_level','analysis_n','p_value'].map(key=>[key,row.quantitative_record[key]])),evidence_ids:[...new Set([...(row.evidence_ids||[]),...(row.quantitative_record.evidence||[]).map(id=>id.startsWith('CE-')?id:'CE-'+String(row.review_binding_sha256).slice(0,24)+'-'+id)])].filter(id=>registry[id]),source_flags:row.quantitative_record.field_flags||[]}));
      const roles=new Set(rows.filter(row=>descriptions.get(rowKey(row)).semantic.key===descriptor.semantic.key&&kindFor(row)===descriptor.kind).map(roleFor));
      const doses=new Set(rows.filter(row=>descriptions.get(rowKey(row)).semantic.key===descriptor.semantic.key&&kindFor(row)===descriptor.kind).map(row=>descriptions.get(rowKey(row)).dose).filter(Boolean));
      const chosenDescription=selected?descriptions.get(rowKey(selected)):descriptor;
      const label=[chosenDescription.basic,roles.size>1?({comparator:'Comparator',intervention:'Intervention',population:'Overall',contrast:'Treatment comparison'}[descriptor.role]):'',doses.size>1?descriptor.dose:''].filter(Boolean).join(' · ');
      const conflictResolution=selected&&outcomeReconciliation.conflictStatus?.(selected,options);
      const flagged=selected?.extraction_conflict===true&&!selectedGroup?.suppress_display_conflict&&!conflictResolution?.suppress_display_conflict||selection.selection_proof?.kind==='identical_display_value'&&members.some(row=>row.extraction_conflict===true&&!outcomeReconciliation.conflictStatus(row,options)?.suppress_display_conflict);
      const effect={label:label+(flagged?' · Review needed':''),value:selected?(values.get(rowKey(selected))||'NA'):'Review needed',outcome_key:key,review_needed:!selected||flagged,alternatives_count:members.length-1};
      presentationEffectSources.set(effect,members);
      if(descriptor.kind==='survival_probability'){
        const seriesKey=JSON.stringify([descriptor.semantic.key,descriptor.role,familyDose(descriptor)]);
        if(!series.has(seriesKey)){const combined={label:[descriptor.endpoint,roles.size>1?({comparator:'Comparator',intervention:'Intervention',population:'Overall'}[descriptor.role]):'',doses.size>1?descriptor.dose:''].filter(Boolean).join(' · '),value:'',outcome_key:seriesKey,review_needed:false,points:[]};series.set(seriesKey,combined);effects.push(combined);}
        const combined=series.get(seriesKey);combined.points.push({time:members[0].quantitative_record.time,label:descriptor.time,value:effect.value,review_needed:effect.review_needed});combined.review_needed ||= effect.review_needed;
        presentationEffectSources.set(combined,[...(presentationEffectSources.get(combined)||[]),...members]);
      }else effects.push(effect);
      selections.push({key,label,status:selected?'selected':'review_needed',reason:selection.reason||null,selected_source:selected?rowKey(selected):null,member_sources:members.map(rowKey),alternatives:candidates,proof:selection.selection_proof||null,conflict_resolution:conflictResolution||null,rounding_groups:selection.groups.map(group=>({selected_source:rowKey(group.representative),members:group.members.map(rowKey),suppress_display_conflict:group.suppress_display_conflict,proofs:group.proofs})),semantic_proofs:members.map(row=>({source:rowKey(row),...semantics.get(rowKey(row))})),unresolved_display_flag:flagged});
    }
    for(const effect of series.values())effect.value=effect.points.sort((a,b)=>Number(a.time)-Number(b.time)).map(point=>`${point.label?point.label+': ':''}${point.value}`).join('; ');
    // Legacy/non-quantitative effects have no compact result object. Preserve
    // those entries unchanged instead of inferring a numerical identity.
    effects.push(...fixedEffects,...view.effects.filter(effect=>!(presentationEffectSources.get(effect)||[]).some(row=>row.quantitative_record)));
    const byLabel=new Map(),finalEffects=[];
    for(const effect of effects){if(!byLabel.has(effect.label))byLabel.set(effect.label,[]);byLabel.get(effect.label).push(effect);}
    for(const sameLabel of byLabel.values()){
      if(sameLabel.length===1){finalEffects.push(sameLabel[0]);continue;}
      if(new Set(sameLabel.map(effect=>effect.value)).size===1){
        // One visible value can represent identical displays of an event
        // classified in several AE categories. This is not scientific pooling.
        const combined={...sameLabel[0],outcome_key:JSON.stringify(['shared_display',...sameLabel.map(effect=>effect.outcome_key)]),source_outcome_keys:sameLabel.map(effect=>effect.outcome_key),review_needed:sameLabel.some(effect=>effect.review_needed),scientific_equivalence:false};
        presentationEffectSources.set(combined,[...new Map(sameLabel.flatMap(effect=>presentationEffectSources.get(effect)||[]).map(row=>[rowKey(row),row])).values()]);
        finalEffects.push(combined);continue;
      }
      // A shared event name can have different all-grade, severe, serious or
      // immune-related rates. Make that recorded distinction visible.
      for(const effect of sameLabel){
        const categories=[...new Set((presentationEffectSources.get(effect)||[]).map(row=>compactExtraction.endpoint(row.quantitative_record?.endpoint)).filter(Boolean))];
        if(categories.length===1){effect.label+=' · '+categories[0];const selection=selections.find(item=>item.key===effect.outcome_key);if(selection)selection.label=effect.label;}
        finalEffects.push(effect);
      }
    }
    return {...view,effects:finalEffects,outcome_reconciliation:{selections,original_effects:view.effects.map(effect=>({label:effect.label,value:effect.value,sources:(presentationEffectSources.get(effect)||[]).map(rowKey)}))}};
  }
  function studyOutcomeChoices(study,{registry={}}={}){
    if(!study.quantitative_only)return [];
    const match=matchingStudy(study,{evidence_registry:registry});
    if(!match)return [];
    return studyTablePresentationRows(match,{registry}).flatMap(group=>{
      const view=studyTablePresentation({...match,...group},{registry});
      return (view.outcome_reconciliation?.selections||[]).filter(selection=>selection.member_sources.length>1||selection.unresolved_display_flag).map(selection=>({...selection,group:view.group,samples:view.samples,comparator:group.comparator_label,intervention:group.intervention_label}));
    });
  }
  function presentationOutcomeValue(study,entry){
    const row=entry.result,q=row.quantitative_record||{};
    if(q.kind!=='median')return entry.effect;
    const scalar=key=>{
      const fact=row[key],value=q[key];
      if(typeof value!=='number')return compactExtraction.text(value);
      const converted=compactExtraction.sourceRecord(study,row)?.derivations?.some(d=>d.method==='time_to_months'&&d.section==='survival'&&d.id===q.id&&d.field===key&&d.value===value);
      const shown=converted?Number(value.toFixed(3)):value;
      return reportedNumber({...fact,value:shown,raw_text:converted?String(shown):fact?.raw_text,unit:''},true);
    };
    return compactExtraction.interval({...q,estimate:scalar('estimate'),ci_lower:scalar('ci_lower'),ci_upper:scalar('ci_upper')})+(q.unit==='months'?' months':q.unit&&q.unit!=='NA'?' '+q.unit:'');
  }
  function studyTablePresentation(match,options={}) {
    const view=rawStudyTablePresentation(match,options);
    return options.reconcile_outcomes===false?view:reconcilePresentationOutcomes(match,view,options);
  }
  function rawStudyTablePresentation(match,{registry={},phase_partition=null,presentation_cutoff=''}={}) {
    if(match.exact_membership_fallback){const member=match.exact_membership||{};return {group:member.population||'',context:'',samples:Number.isFinite(member.sample_n)?[{label:'Exact treatment arm',sample_size:String(member.sample_n)}]:[],effects:[]};}
    if(match.presentation_members?.length)return combinedStudyPresentation(match);
    const raw=studyTableData(match,{registry});
    const selectedCounts=new Set(conciseGroups.selectCounts(match.study,raw.counts.map(entry=>entry.source),{registry,results:match.results}));
    const correctedEntries=raw.entries.map(entry=>{const n=presentationSampleSize(match.study,entry.result,{registry,samples:match.study.details?.sample_size_records||[]});return n?{...entry,sample_size:n.display||(Number.isInteger(n.n)&&n.n>=0?String(n.n):'NA'),presentation_n:n}:entry;});
    const sourceRatioInPairedArms=entry=>(hasPairedArmCounts(match) || match.exact_comparison_pair) && boundComparativeRatio(match.comparisons,entry.result);
    const data={...raw,entries:correctedEntries.filter(entry=>match.exact_node_membership||entry.sample_size!=='NA'||sourceRatioInPairedArms(entry)),counts:raw.counts.filter(entry=>entry.sample_size!=='NA'&&selectedCounts.has(entry.source))},sampleGroups=new Map(),effectGroups=new Map();
    const contextLabel=()=>{
      const labels=[...new Set(data.entries.map(entry=>compactExtraction.resultContext(match.study,entry.result)?.label).filter(Boolean))];
      if(labels.length===1)return labels[0];
      if(!data.entries.length&&new Set(data.counts.map(entry=>entry.source.population_id)).size===1){const labels=[...new Set(data.counts.map(entry=>compactExtraction.populationContext(compactExtraction.sourceRecord(match.study,entry.source),entry.source.quantitative_record?.population_id)).filter(Boolean))];if(labels.length===1)return labels[0];}
      return '';
    };
    const context=compactExtraction.cleanContext(match.context_label??[match.context_counts&&!match.count_only_arm_context?'Study participants':'',contextLabel()].filter(Boolean).join(' · ')).replace(/^NA$/,'');
    const analysisLabel=q=>q.model&&q.model!=='NA'?q.model:q.adjusted==='yes'?'Adjusted':q.adjusted==='no'?'Unadjusted':'';
    const analyses=new Set(data.entries.map(entry=>analysisLabel(entry.result.quantitative_record||{})));
    const multipleAnalyses=analyses.size>1;
    const responseCriteria=new Map(),outcomeAssessors=new Map();
    for(const entry of data.entries){
      const q=entry.result.quantitative_record||{},criterion=q.response_criteria;
      const endpoint=tableEndpoint(entry.result);
      const assessor=reportedOutcomeAssessor(entry.result);
      if(assessor){if(!outcomeAssessors.has(endpoint))outcomeAssessors.set(endpoint,new Set());outcomeAssessors.get(endpoint).add(assessor);}
      if(!criterion||criterion==='NA')continue;
      if(!responseCriteria.has(endpoint))responseCriteria.set(endpoint,new Set());
      responseCriteria.get(endpoint).add(criterion);
    }
    const displayArmIdentity=(row,includeIntervention=false)=>{
      const scope=JSON.parse(conciseGroups.presentationScope(match.study,row,{registry}));
      const arm=scope[2]&&scope[2]!=='NA'?scope[2]:includeIntervention?scope[3]:null;
      return arm&&arm!=='NA'?JSON.stringify([scope[0],arm]):null;
    };
    const outcomeArms=new Set(data.entries.map(entry=>displayArmIdentity(entry.result)).filter(Boolean));
    const doseArms=new Set(data.entries.map(entry=>displayArmIdentity(entry.result,true)).filter(Boolean));
    const armName=row=>{
      const id=row.quantitative_record?.arm_id,comparison=match.comparisons.find(co=>co.comparison_id===row.comparison_id||(co.result_ids||[]).some(id=>(row.source_extraction_ids||[row.result_id]).includes(id)));
      if(id&&comparison?.comparator_arm_id===id)return 'Comparator';
      if(id&&comparison?.intervention_arm_id===id&&comparison.comparator_arm_id)return 'Intervention';
      return compactContrast(row);
    };
    for(const entry of data.entries){
      const row=entry.result,q=row.quantitative_record||{},n=entry.presentation_n||q.display_n||{},source=row.source_input_sha256,arms=q.arm_id?[q.arm_id]:[q.intervention_arm_id,q.reference_arm_id];
      const scope=JSON.stringify([conciseGroups.presentationScope(match.study,row,{registry,ignore_cutoff:match.keep_shared_cohort===true}),q.model,q.adjusted,n.status==='CONFLICTING'||row.scoped_sample_size?.status==='CONFLICTING',entry.sample_size]);
      if(entry.sample_size!=='NA'){
        if(!sampleGroups.has(scope))sampleGroups.set(scope,{label:'',sample_size:entry.sample_size,entries:[],source_n:n});
        sampleGroups.get(scope).entries.push(entry);
      }
      const endpoint=tableEndpoint(row),time=compactExtraction.timeLabel(q),dose=doseArms.size>1?compactExtraction.resultDoseLabel(match.study,row):'';
      const basic=q.kind==='median'?`Median ${endpoint}`:time?endpoint:[endpoint,displayMeasure(row)===endpoint?'':displayMeasure(row).replace(/_/g,' ')].filter(Boolean).join(' · ');
      const criterion=responseCriteria.get(endpoint)?.size>1&&q.response_criteria&&q.response_criteria!=='NA'?q.response_criteria:'';
      const assessor=outcomeAssessors.get(endpoint)?.size>1?reportedOutcomeAssessor(row):'';
      const label=[basic,criterion,assessor,dose||(outcomeArms.size>1&&q.arm_id?armName(row):''),multipleAnalyses?analysisLabel(q):'',row.extraction_conflict?'Conflicting extractions':''].filter(Boolean).join(' · ');
      const canCombine=q.kind==='survival_probability'&&time;
      const sharedResponder=entry.sample_size==='1'&&displayMeasure(row)==='participant_count'&&['PR','CR','ORR','DCR'].includes(q.endpoint)&&q.denominator===1&&q.numerator===1&&!q.field_flags?.length&&q.evidence?.length;
      const key=sharedResponder?JSON.stringify([source,q.population_id,arms,q.cutoff,q.assessment_time,q.time_unit,q.response_criteria,reportedOutcomeAssessor(row),[...q.evidence].sort(),entry.effect,'one_responder']):canCombine?JSON.stringify([source,q.population_id,arms,q.cutoff,q.endpoint,q.endpoint_definition,q.unit,q.model,q.adjusted,'survival_probability']):row.result_id;
      if(!effectGroups.has(key))effectGroups.set(key,{label,values:[],order:effectGroups.size,endpoints:[],source_rows:[]});
      const effectGroup=effectGroups.get(key);
      effectGroup.source_rows.push(row);
      if(sharedResponder){effectGroup.endpoints.push(endpoint);effectGroup.label=[[...new Set(effectGroup.endpoints)].join(' / '),assessor,dose].filter(Boolean).join(' · ');}
      const medianScalar=(key)=>{
        const fact=row[key],value=q[key];
        if(typeof value!=='number')return compactExtraction.text(value);
        const converted=compactExtraction.sourceRecord(match.study,row)?.derivations?.some(d=>d.method==='time_to_months'&&d.section==='survival'&&d.id===q.id&&d.field===key&&d.value===value);
        const shown=converted?Number(value.toFixed(3)):value;
        return reportedNumber({...fact,value:shown,raw_text:converted?String(shown):fact?.raw_text,unit:''},true);
      };
      const conciseEffect=q.kind==='median'?compactExtraction.interval({...q,estimate:medianScalar('estimate'),ci_lower:medianScalar('ci_lower'),ci_upper:medianScalar('ci_upper')})+(q.unit==='months'?' months':q.unit&&q.unit!=='NA'?' '+q.unit:''):entry.effect;
      if(!sharedResponder||!effectGroup.values.length)effectGroup.values.push({time:canCombine?q.time:null,value:canCombine?`${time}: ${conciseEffect}`:conciseEffect});
    }
    const groups=[...sampleGroups.values()];
    for(const group of groups){
      const first=group.entries[0],row=first.result,q=row.quantitative_record||{},ctx=compactExtraction.resultContext(match.study,row);
      const sameArm=other=>{const n=other.entries[0].result.quantitative_record||{};return JSON.stringify([n.population_id,n.arm_id,n.intervention_arm_id,n.reference_arm_id,n.cutoff])===JSON.stringify([q.population_id,q.arm_id,q.intervention_arm_id,q.reference_arm_id,q.cutoff]);};
      const timeNeeded=groups.some(other=>other!==group&&sameArm(other)&&other.source_n.count_purpose===group.source_n.count_purpose&&other.sample_size!==group.sample_size);
      const shortEndpoint=row=>/^AE_|^treatment_related_death$/.test(row.quantitative_record?.endpoint||'')?'Safety':tableEndpoint(row);
      const endpointLabels=[...new Set(group.entries.map(entry=>{
        const result=entry.result,record=result.quantitative_record||{},criterion=record.response_criteria;
        const differentSet=criterion&&criterion!=='NA'&&groups.some(other=>other!==group&&other.sample_size!==group.sample_size&&other.entries.some(item=>shortEndpoint(item.result)===shortEndpoint(result)&&item.result.quantitative_record?.response_criteria&&item.result.quantitative_record.response_criteria!=='NA'&&item.result.quantitative_record.response_criteria!==criterion));
        return [shortEndpoint(result),differentSet?criterion:'',timeNeeded?compactExtraction.timeLabel(result):''].filter(Boolean).join(' · ');
      }))];
      const purposeNeeded=groups.some(other=>other!==group&&sameArm(other)&&other.source_n.count_purpose!==group.source_n.count_purpose&&other.entries.some(entry=>endpointLabels.includes(shortEndpoint(entry.result))));
      const dose=ctx?.dose||'',armText=armName(row);
      if(groups.length>1){
        const alternatives=groups.filter(other=>other!==group&&other.entries.some(entry=>displayArmIdentity(entry.result)!==displayArmIdentity(row)));
        group.label=[dose||alternatives.length&&armText||'',endpointLabels.join(' / '),purposeNeeded&&group.source_n?.count_purpose&&group.source_n.count_purpose!=='NA'?group.source_n.count_purpose.replace(/_/g,' '):'',multipleAnalyses?analysisLabel(q):''].filter(Boolean).join(' · ');
      }
      if(row.scoped_sample_size?.status==='CONFLICTING'||q.display_n?.status==='CONFLICTING')group.label=[group.label,'Conflicting sample size'].filter(Boolean).join(' · ');
      if(phase_partition&&group.entries.some(entry=>entry.result.quantitative_record?.display_n?.count_ids?.includes(phase_partition.parent.id)&&entry.result.quantitative_record.display_n.count_purpose===phase_partition.parent.count_purpose)&&group.sample_size===String(phase_partition.parent.n))group.breakdown=phase_partition.children.map(n=>`${n.label} ${n.n}`).join('; ');
    }
    if(!groups.length){
      const purposes=match.context_counts?[...new Set(data.counts.map(row=>row.source.quantitative_record.count_purpose))]:null;
      const summaries=purposes?purposes.flatMap(purpose=>compactExtraction.countSummary(match.study,data.counts.filter(row=>row.source.quantitative_record.count_purpose===purpose),{registry})):compactExtraction.countSummary(match.study,data.counts,{registry});
      const countPopulations=new Set(data.counts.map(entry=>JSON.stringify([entry.source.source_input_sha256,entry.source.quantitative_record?.population_id])));
      if(match.context_counts&&countPopulations.size<=1)for(const summary of summaries){
        const count=data.counts.find(row=>summary.count_ids.includes(row.source.quantitative_record?.id))?.source,q=count?.quantitative_record||{},record=compactExtraction.sourceRecord(match.study,count),arm=(record?.arms||[]).find(arm=>arm.id===q.arm_id);
        const others=data.counts.filter(row=>row.source.quantitative_record?.arm_id===q.arm_id),purpose=new Set(others.map(row=>row.source.quantitative_record?.count_purpose)).size>1?q.count_purpose.replace(/_/g,' '):'';
        summary.label=match.count_only_arm_context?(arm?'':'Total'):[arm?compactExtraction.armLabels(record).get(arm.id)||compactExtraction.regimen(arm):'Total',purpose].filter(Boolean).join(' · ');
      }
      for(const summary of summaries)groups.push({label:summary.label===context||match.comparisons.length&&summaries.length===1?'':summary.label,sample_size:summary.sample_size,...(phase_partition&&summary.count_ids.includes(phase_partition.parent.id)?{breakdown:phase_partition.children.map(n=>`${n.label} ${n.n}`).join('; ')}:{})});
    }
    // Arm Ns sit beside the drug names; retain only distinct analysis Ns here.
    let displayedGroups=groups;
    if(hasPairedArmCounts(match)){
      displayedGroups=match.paired_count_only?[]:groups.filter(group=>!group.entries?.length||!group.entries.every(entry=>{const q=entry.result.quantitative_record||{};return q.arm_id===match.comparator_arm_id&&entry.sample_size===String(match.comparator_n)||q.arm_id===match.intervention_arm_id&&entry.sample_size===String(match.intervention_n);}));
      if(Number.isInteger(match.total_n)&&match.total_n>=0&&!displayedGroups.some(group=>group.sample_size===String(match.total_n)))displayedGroups.unshift({label:'Total',sample_size:String(match.total_n)});
    }
    // Missing-N outcomes remain in details; explicit arm counts still qualify a row.
    return {group:(compactExtraction.presentationGroupLabel(match.study,match,{registry})??conciseGroups.groupLabel(match.study,match,{registry,eligible_samples:raw.counts.map(entry=>entry.source)})).replace(/^NA$/,'').replace(/\s+([,;:])/g,'$1'),context:match.paired_count_only?'':context,samples:displayedGroups.map(({label,sample_size,breakdown,source_n})=>({label:compactExtraction.cleanContext(label).replace(/^NA$/,''),sample_size,...(breakdown?{breakdown}:{}),...(source_n?.note?{denominator_note:source_n.note}:{})})),effects:[...effectGroups.values()].map(group=>{const effect={label:group.label,value:group.values.sort((a,b)=>a.time===null||b.time===null?0:a.time-b.time).map(x=>x.value).join('; ')};presentationEffectSources.set(effect,group.source_rows);return effect;})};
  }
  function reportedStudyCounts(study, comparisons = null, registry = {}) {
    if(study.current_main_eligible===false)return [];
    const context=melanomaScope.contextFor(study,{evidenceRegistry:registry});
    const rows = study.details?.sample_size_records || [];
    const eligible = rows.filter((sample) => {
      if(!melanomaScope.sampleEligible(sample,{study,context}))return false;
      const fact = sample.n, label = String(sample.quantity_label || '');
      const role = sample.sample_context_role || sample.denominator_type;
      const original=sample.original_fact||{},text=[label,original.field||'',original.measure||''].join(' ');
      const total=/^(?:total[ _]+(?:study[ _]+)?(?:population|cohort(?:[ _]+size)?|patients|participants)|overall[ _]+study[ _]+population)$/i.test(label)&&!sample.arm_id;
      const uptake=!!sample.arm_id&&original.domain==='treatment_regimens'&&/receip|receiv|treated|given|administer/i.test(text);
      const sourceCohort=(total||uptake)&&!original.model_id&&!original.endpoint_id&&!/model|fitted|analysis|regression|complete.case/i.test(text)&&['sample_size','numerator'].includes(fact?.role)&&['equal',undefined].includes(fact?.qualifier);
      if (comparisons && !comparisons.some((comparison) => {
        const scope=comparison.scope||{},version=sample.draft_artifact_sha256||sample.source_packet_sha256;
        if(sample.record_kind==='canonical_patient_context'){
          const sameSource=scope.record_kind==='canonical_review_scope'&&scope.report_id===sample.report_id&&scope.review_stage===sample.review_stage&&scope.source_input_sha256===sample.source_input_sha256&&scope.review_binding_sha256===sample.review_binding_sha256&&sample.population_id&&scope.population_id===sample.population_id;
          if(!sameSource)return false;
          const ownArm=sample.arm?.entity_id||sample.original_fact?.arm_id;
          const comparisonArms=comparison.outcome_arm_id?[comparison.outcome_arm_id]:[comparison.intervention_arm_id,comparison.comparator_arm_id].filter(Boolean);
          if(ownArm)return comparisonArms.includes(ownArm);
          // A whole-population count cannot stand in for one arm's count.
          return !comparison.outcome_arm_id;
        }
        const arms=[...(comparison.intervention_arms||[]),...(comparison.comparator_arms||[])].map((arm)=>arm.arm_id);
        return scope.report_id===sample.report_id && scope.reviewer===sample.reviewer && scope.source_input_sha256===sample.source_input_sha256 && scope.source_version_sha256===version && ((sample.population_id && sample.population_id===scope.population_id) || (sample.arm_id && arms.includes(sample.arm_id) && !sample.population_id && !scope.population_id));
      })) return false;
      const explicitRole = (sample.record_kind==='canonical_patient_context'?['enrolled','eligible','randomized','treated','response_evaluable','safety','subgroup']:['enrolled','recruited','randomized','assigned','treated','evaluable','safety']).includes(role) || populationCountIsContext(sample) || sourceCohort;
      const evidence = (fact?.evidence_ids || []).length || (sample.evidence_ids || []).length || (sample.evidence || []).length;
      return sample.report_id === study.report_id && sample.main_result_eligible!==false && !['cited_other_report','planned'].includes(sample.evidence_origin||original.evidence_origin) && explicitRole && evidence && fact && ['reported','unclear'].includes(fact.status) && typeof fact.value === 'number' && Number.isInteger(fact.value) && fact.value >= 0 && /^(?:participants?|patients?|people|subjects?|persons?)$/i.test(fact.unit || sample.counting_unit || '') && !/%|percent/i.test(fact.raw_text || '') && !/planned|target|projected|anticipated/i.test(label) && !['planned','unclear'].includes(sample.scope || sample.original_fact?.scope);
    });
    const key = (row) => JSON.stringify([row.population_id || null,row.arm_id || null,row.quantity_label || '',...(row.quantitative_record?[row.quantitative_record.cutoff]:[])]);
    const groups = new Map();
    for (const row of eligible) { const id = key(row);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row); }
    const checked=[...groups.values()].filter((group)=>new Set(group.map((row)=>JSON.stringify([row.n.value,row.n.qualifier,row.n.unit]))).size===1).map((group)=>group[0]),seen=new Set();
    return checked.filter((sample)=>{
      const ids=sample.n.evidence_ids||[],anchors=ids.map((id)=>registry[id]);
      if(!ids.length||anchors.some((anchor)=>!anchor))return true;
      const category=!sample.arm_id&&/^(?:total[ _]+(?:study[ _]+)?(?:population|cohort(?:[ _]+size)?|patients|participants)|overall[ _]+study[ _]+population)$/i.test(sample.quantity_label||'')?'reported_total_cohort':null;
      const scope=category?[category]:[sample.reviewer,sample.source_packet_sha256||sample.draft_artifact_sha256,sample.population_id,sample.arm_id,sample.quantity_label];
      const key=JSON.stringify([sample.report_id,sample.source_input_sha256,scope,sample.n.value,sample.n.raw_text,sample.n.unit,sample.n.qualifier,anchors.map((anchor)=>[anchor.source_id,anchor.block_id,anchor.locator,anchor.supporting_quote||anchor.quote]).sort()]);
      if(seen.has(key))return false;seen.add(key);return true;
    });
  }
  function reportedCountLabel(sample,study=null) {
    const populationLabel=sample.quantitative_record?(compactExtraction.populationContext(compactExtraction.sourceRecord(study,sample),sample.quantitative_record.population_id)||(sample.population?.result_scope==='subgroup'?compactExtraction.cohortLabel(sample.population.label):'')):'';
    const arm = quantitativeText(sample.label || sample.arm_label || sample.arm?.label);
    if (arm) { const label=populationLabel?`${populationLabel} · ${arm}`:arm;return !sample.quantitative_record&&label.length > 95 ? label.slice(0,92) + '…' : label; }
    const label = String(sample.quantity_label || 'Participants');
    if (sample.arm_id && /^(?:randomized|treated|evaluable|safety) arm sample size$/i.test(label)) return 'Arm ' + sample.arm_id;
    const base=/^(?:randomized N|randomized total|sample_size|total[ _]+(?:study[ _]+)?(?:population|cohort(?:[ _]+size)?|patients|participants)|overall[ _]+study[ _]+population)$/i.test(label) ? 'Participants' : label;
    return [populationLabel,base].filter(Boolean).join(' · ');
  }
  function compactClinicalResult(row) {
    const family = displayEndpointFamily(row);
    const measure = displayMeasure(row);
    // Explicit source-labelled descriptive outcomes remain distinct from ORR.
    if(!family&&/^(?:Intracranial clinical benefit rate|Volumetric decrease in target intracranial lesions)$/i.test(measure))return true;
    return (Object.hasOwn(survivalEndpointLabels,family)||Object.hasOwn(responseEndpointLabels,family)||family==='adverse_events') && ['HR','RR','OR','RD','MD','SMD','TR','ORR','CR','PR','DCR','pCR','response_probability','event_probability','survival_probability','participant_count','event_episode_count','median','duration'].includes(measure);
  }
  function compactContrast(row) {
    if(row.arm?.label&&!['HR','RR','OR','RD','MD','SMD','TR'].includes(displayMeasure(row)))return regimenDescription(quantitativeText(row.arm.label)).label;
    const type = row.analysis?.contrast_type || row.contrast_type;
    if (['treatment_comparison','single_arm'].includes(type)) return '';
    const text = quantitativeText(row.analysis?.contrast_description || row.contrast_description);
    if (text) { const short = text.split(';')[0]; return short.length > 85 ? short.slice(0,82) + '…' : short; }
    return type === 'biomarker_association' ? 'Biomarker association' : type === 'interaction' ? 'Interaction' : type === 'other' ? 'Reported association' : '';
  }
  function tableEndpoint(row) {
    if(row.quantitative_record&&compactExtraction){
      const q=row.quantitative_record;
      if(/^AE_|^treatment_related_death$/.test(q.endpoint||''))return compactExtraction.definition(q);
      if(['ORR','PR','CR','DCR','pCR'].includes(q.endpoint))return q.endpoint;
      if(['objective_response_rate','overall_response_rate','partial_response','complete_response','pathological_complete_response','disease_control_rate'].includes(q.endpoint))return compactExtraction.endpoint(q.endpoint);
    }
    const qualified=numericCompletion?.label(row);
    if(qualified)return qualified;
    const family=displayEndpointFamily(row);
    if(family==='response'){
      if(displayMeasure(row)==='ORR')return 'ORR';
      const label=[quantitativeText(row.endpoint?.definition),quantitativeText(row.variable)].join(' ');
      if(/\bpatholog(?:ical|ic) complete response\b|\bpCR\b/i.test(label))return 'pCR';
      if(/\bdisease control\b|\bDCR\b/i.test(label))return 'DCR';
      if(/\b(?:objective|overall) response\b|\bORR\b/i.test(label))return 'ORR';
      if(/\bcomplete response\b|\bCR\b/i.test(label))return 'CR';
      if(/\bpartial response\b|\bPR\b/i.test(label))return 'PR';
      if(/\bdisease control\b|\bDCR\b/i.test(label))return 'DCR';
      return 'Response';
    }
    return (family==='recurrence'&&reportedSurvivalEndpoint(row)!=='recurrence'?'Recurrence':survivalEndpointLabels[family])||responseEndpointLabels[family]||({adverse_events:'Safety'})[family]||family?.replace(/_/g,' ')||'Reported result';
  }
  function derivedInterval(row,{nDisplay,evidenceRegistry=row.evidence_registry||{}}={}) {
    // New extraction arithmetic is resolved once by the source-bound validator.
    if(row.quantitative_record)return {status:'held',interval:null,reason:'Use the saved quantitative interval decision'};
    if(!waldInterval)return {status:'held',interval:null,reason:'Wald calculation unavailable'};
    const n=nDisplay||sampleDisplay?.sampleSizeDisplay(row,{samples:row.report_samples||[],evidenceRegistry});
    return waldInterval.derive(row,{nDisplay:n,evidenceRegistry});
  }
  function tableValue(row,{interval}={}) {
    const recovered=compactExtraction.recoveredDenominator(row);
    if(Number.isFinite(recovered?.reported_percentage)){
      const q=row.quantitative_record;
      return q.numerator+'/'+recovered.n+' · '+recovered.reported_percentage+'% ('+q.ci_level+'% CI '+q.ci_lower+'–'+q.ci_upper+'%)';
    }
    if(row.display_reversed) {
      const reported=confidenceIntervals.forDisplay(row),estimate=reported.estimate,fmt=confidenceIntervals.formatEffectNumber;
      const derived=interval?.status==='derived'?interval.interval:null;
      const lo=reported.ci_lower??derived?.lower,hi=reported.ci_upper??derived?.upper;
      const flags=['inverted',reported.ci_converted?'converted to 95% CI':null,
        derived || row.quantitative_record?.derived_ci?.method==='derived_two_sided_Wald'?'derived 95% Wald CI':null,
        row.quantitative_record?.calculation?'calculated from arm rates':null].filter(Boolean);
      const ci=lo>0 && hi>lo && lo<=estimate && estimate<=hi && Number.isFinite(1/lo) ? fmt(1/hi)+'–'+fmt(1/lo) : '95% CI unavailable';
      return fmt(1/estimate)+' ('+ci+') · '+flags.join(' · ');
    }
    const estimate=reportedNumber(row.estimate,true),numbers=(row.reported_numbers||[]).filter(n=>['reported','unclear'].includes(n.status));
    let value=estimate!=='NA'?estimate:numbers.filter(n=>!['confidence_level','ci_lower','ci_upper'].includes(n.role)).map(n=>`${String(n.role||'Value').replace(/_/g,' ')}: ${reportedNumber(n)}`).join('; ')||'NA';
    const display=confidenceIntervals.forDisplay(row);
    if(display.ci_95_unavailable)return `${value} (95% CI unavailable)`;
    if(display.ci_converted&&estimate!=='NA'&&reportedNumber(row.ci_lower,true)!=='NA'&&reportedNumber(row.ci_upper,true)!=='NA')return `${value} (${compactExtraction.formatEffectNumber(display.ci_lower)}–${compactExtraction.formatEffectNumber(display.ci_upper)}; approximate 95% CI, converted)`;
    const lower=reportedNumber(row.ci_lower,true),upper=reportedNumber(row.ci_upper,true);
    if(lower!=='NA'||upper!=='NA'){
      const derived=row.quantitative_record?.derived_ci,marked=derived?.method==='derived_two_sided_Wald'&&derived.ci_lower===row.ci_lower?.value&&derived.ci_upper===row.ci_upper?.value;
      value+=` (${lower}–${upper}${marked?'; derived 95% Wald CI':row.confidence_level?.status==='reported'&&!confidence95(row.confidence_level)?`; ${reportedNumber(row.confidence_level)} CI`:''})`;
    }
    else {
      const derived=interval||derivedInterval(row),formatted=waldInterval?.format(derived);
      if(formatted)value+=` ${formatted}`;
    }
    return row.quantitative_record?.calculation ? value+' · calculated from arm rates' : value;
  }
  function studyTableData(match,{registry={},limit=Infinity}={}) {
    const context=melanomaScope.contextFor(match.study,{evidenceRegistry:registry});
    const clinical=match.results.filter(row=>melanomaScope.resultEligible(row,{study:match.study,context})&&compactClinicalResult(row)),visible=clinical.slice(0,limit);
    const samples=(match.study.details?.sample_size_records||match.study.details?.reported_counts||[]).filter(sample=>melanomaScope.sampleEligible(sample,{study:match.study,context}));
    const entries=visible.map(original=>{
      const ownSamples=original.numeric_completion_v6_no_endpoint_N_inference===true?[]:samples;
      const row={...original,report_samples:ownSamples,evidence_registry:registry};
      const scoped=row.scoped_sample_size||row.quantitative_record?.display_n;
      const n=row.quantitative_record?{text:scoped?.status!=='CONFLICTING'&&Number.isInteger(scoped?.n)&&scoped.n>=0?String(scoped.n):'NA',basis:scoped?.basis||scoped?.count_purpose,status:scoped?.status}:sampleDisplay?.sampleSizeDisplay(row,{samples:ownSamples,evidenceRegistry:registry});
      const interval=derivedInterval(row,{nDisplay:n,evidenceRegistry:registry});
      const measure=displayMeasure(row),name=measure==='response_probability'?'Response proportion':measure?.replace(/_/g,' ')||'';
      const compactContext=row.quantitative_record&&compactExtraction.resultContext(match.study,row);
      const populationLabel=compactContext?.label?(compactContext.population?.scope==='subgroup'?'Subgroup: ':'Cohort: ')+compactContext.label:row.quantitative_record&&row.population?.result_scope==='subgroup'?'Subgroup: '+quantitativeText(row.population.label):'';
      const endpointName=tableEndpoint(row);
      const doseLabel=compactExtraction?.resultDoseLabel(match.study,row)||'';
      const label=[endpointName,name===endpointName?'':name,compactExtraction?.timeLabel(row)||'',doseLabel||compactContrast(row),populationLabel,row.extraction_conflict?'Conflicting extractions':'',scoped?.status==='CONFLICTING'?'Conflicting sample size':''].filter(Boolean).join(' · ');
      return {result:original,label,sample_size:n?.text?.replace(/—/g,'NA')||'NA',effect:tableValue(row,{interval}),derived_interval:interval.status==='derived'?interval:null};
    });
    const ids=new Set(visible.flatMap(row=>row.source_extraction_ids||[row.result_id])),comparisonIds=new Set(visible.map(row=>row.comparison_id).filter(Boolean));
    const scopes=clinical.length?match.comparisons.filter(co=>(co.result_ids||[]).some(id=>ids.has(id))||comparisonIds.has(co.comparison_id)):match.show_study_context===true?null:match.comparisons;
    const counts=match.context_counts?match.context_counts.map(sample=>{
      const q=sample.quantitative_record,record=compactExtraction.sourceRecord(match.study,sample),arm=(record?.arms||[]).find(arm=>arm.id===q.arm_id),population=compactExtraction.populationContext(record,q.population_id)||compactExtraction.cohortLabel(sample.population?.label);
      return {label:['Study participants',population,arm?compactExtraction.armLabels(record).get(arm.id)||compactExtraction.regimen(arm):'Total',q.count_purpose?.replace(/_/g,' ')].filter(Boolean).join(' · '),sample_size:reportedNumber(sample.n),source:sample};
    }):entries.some(row=>row.sample_size!=='NA'||row.result.quantitative_record)?[]:reportedStudyCounts(match.study,scopes,registry).map(sample=>({label:reportedCountLabel(sample,match.study),sample_size:reportedNumber(sample.n),source:sample}));
    const treated=match.show_study_context===true?match.study.numeric_completion_v6_treated_context:null;
    return {entries,counts:counts.slice(0,limit),more_counts:Math.max(0,counts.length-limit),hidden_results:match.results.length-visible.length,
      treated:treated?{label:treated.label,sample_size:String(treated.value)}:null};
  }
  function studyTableCSV(matches,{registry={},labels,include_missing_n=false}={}) {
    const rows=[['Study','First author','Year','PMID','Trial name','NCT number','Group','Comparator','Intervention','Result','Sample size','Effect size (CI)']];
    for(const match of matches){
      const study=match.study,trial=studyTrialIdentifiers(study,{registry});
      for(const contrast of match.presentation_rows||studyTablePresentationRows(match,{registry,labels,include_missing_n})){
        const data=studyTablePresentation({...match,...contrast},{registry,phase_partition:contrast.phase_partition});
        const setting=advancedArmSettings(match,contrast);
        const prefix=[study.title,study.author_display||(study.first_author_surname?`${study.first_author_surname} et al.`:''),study.year??'',study.pmid??'',trial.trial_label,trial.nct_label,data.group||'',contrast.comparator_label+(Number.isInteger(contrast.comparator_n)?` (N=${contrast.comparator_n})`:'')+(setting.comparator?` [${setting.comparator}]`:''),`${contrast.is_add_on?'+ ':''}${contrast.intervention_label}${Number.isInteger(contrast.intervention_n)?` (N=${contrast.intervention_n})`:''}${setting.intervention?` [${setting.intervention}]`:''}`];
        const exactRatio=match.exact_comparison_pair && contrast.results.some(row=>boundComparativeRatio(contrast.comparisons,row));
        if(!data.samples.length&&!hasPairedArmCounts(contrast)&&!include_missing_n&&!exactRatio)continue;
        const samples=data.samples.map(row=>`${row.label?row.label+': ':''}${row.sample_size}${row.breakdown?' ('+row.breakdown+')':''}${row.denominator_note?' ['+row.denominator_note+']':''}`).join('; ')||(hasPairedArmCounts(contrast)?`Comparator: ${contrast.comparator_n}; Intervention: ${contrast.intervention_n}`:include_missing_n?'Unavailable':'');
        const result=data.effects.map(row=>row.label).filter(Boolean).join(' · ');
        const effects=data.effects.map(row=>`${row.label?row.label+': ':''}${row.value}`).join('; ')||'Details';
        rows.push([...prefix,result,samples || (exactRatio?'NA':''),effects]);
      }
    }
    const cell=value=>{
      let text=String(value??'');
      // Quoting alone does not prevent spreadsheet formulas in source text.
      if(/^[\s\u0000-\u001f]*[=+@-]/.test(text)&&!/^\s*[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s*$/.test(text))text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
  }
  function studyTrialIdentifiers(study,{registry={}}={}) {
    if(study.quantitative_only===true&&compactExtraction)return compactExtraction.trialIdentifiers(study);
    return trialIdentifiers?.get(study,{registry})||{trial_label:'NA',nct_label:'NA',names:[],nct_ids:[],provenance:[]};
  }
  const studySearchCache = new WeakMap();
  function studyTrialSearchIndex(match, registry) {
    const study = match.study;
    const source = match.prepared_trial || registry;
    let cached = studySearchCache.get(study);
    if (!cached || cached.source !== source) {
      const trial = match.prepared_trial || studyTrialIdentifiers(study, {registry});
      const names = trial.names?.length ? trial.names : (trial.trial_label || '').split(';');
      const nct = trial.nct_ids?.length ? trial.nct_ids : (trial.nct_label || '').split(';');
      cached = {source, index:trialSearch.index({names, nct, pmid:study.pmid})};
      studySearchCache.set(study, cached);
    }
    return cached.index;
  }
  function filterStudyTrials(matches, query, registry) {
    if (!query?.trim()) return matches;
    return matches.filter(match => trialSearch.matches(studyTrialSearchIndex(match, registry), query));
  }
  function orderedStudyResults(rows) {
    const score = (row) => (row.analysis?.contrast_type === 'treatment_comparison' ? 100 : 0) + (['HR','RR','OR','RD','MD','SMD'].includes(displayMeasure(row)) ? 30 : displayMeasure(row) === 'ORR' ? 20 : 0) + (row.estimate?.status === 'reported' ? 2 : 0) + (row.ci_lower?.status === 'reported' && row.ci_upper?.status === 'reported' ? 5 : 0);
    return rows.map((row,index)=>({row,index})).sort((a,b)=>score(b.row)-score(a.row)||a.index-b.index).map(({row})=>row);
  }
  function comparisonBrowseEligible(comparison) { return comparison.comparison_filter_eligible===true||(comparison.comparison_filter_eligible!==false&&(comparison.kind==='single_arm'||comparison.comparator_filter_eligible!==false)); }
  function matchingStudy(study, selection = {}) {
    const current=study.current_main_eligible!==false;
    const context=melanomaScope.contextFor(study,{evidenceRegistry:selection.evidence_registry});
    const allResults=current?studyResults(study):[],samples=study.details?.sample_size_records||study.details?.reported_counts||[];
    const results = allResults.filter(row=>melanomaScope.resultEligible(row,{study,context})&&resultMatches(row, selection));
    const resultIds = new Set(results.flatMap((row) => row.source_extraction_ids||[row.result_id]));
    const resultComparisonIds = new Set(results.map((row) => row.comparison_id).filter(Boolean));
    const candidates = (current?studyComparisons(study,{registry:selection.evidence_registry||{}}):[]).filter(comparisonBrowseEligible).filter(comparison=>melanomaScope.comparisonEligible(comparison,{results:allResults,samples,study,context})).flatMap(comparison=>{
      if(regimenSourceRules.lookup(comparison)?.direction_verified!==true)return [comparison];
      return allResults.some(row=>regimenSourceRules.directionFor(comparison,row))?[{...comparison,presentation_direction_verified:true}]:[];
    });
    let comparisons=candidates.filter((comparison) => comparatorSelectionMatches(comparison, selection.comparator, selection.treatment_labels) && interventionSelectionMatches(comparison, selection.intervention, selection.treatment_labels));
    // Use the supported treatment description of a consolidated cohort for
    // browsing, and carry its complementary source results into that view.
    // A more detailed label withheld by source review must not create a match.
    const restricted = selection.comparator || selection.intervention;
    if(restricted&&study.quantitative_only&&comparisons.length){
      const eligibleResults=allResults.filter(row=>melanomaScope.resultEligible(row,{study,context})&&resultMatches(row));
      const cohortRows=studyTablePresentationRows({study,comparisons:candidates,results:orderedStudyResults(eligibleResults)},{registry:selection.evidence_registry||{},labels:selection.treatment_labels});
      const selected=new Set(comparisons.map(comparison=>comparison.comparison_id));
      const refined=new Map();
      for(const group of cohortRows){
        if(!group.presentation_refinements?.length)continue;
        const roleMatches=(role,matcher)=>{
          if(!selection[role])return true;
          const preferred=group.presentation_field_representatives?.[role]?.row?.comparisons;
          return (preferred?.length?preferred:group.comparisons).some(comparison=>matcher(comparison,selection[role],selection.treatment_labels));
        };
        const matches=roleMatches('comparator',comparatorSelectionMatches)&&roleMatches('intervention',interventionSelectionMatches);
        for(const comparison of group.comparisons)refined.set(comparison.comparison_id,matches||refined.get(comparison.comparison_id)===true);
      }
      for(const [id,matches]of refined){if(matches)selected.add(id);else selected.delete(id);}
      comparisons=candidates.filter(comparison=>selected.has(comparison.comparison_id));
    }
    // Only exact complete regimens define a reversible treatment contrast.
    // Broad categories and add-on-agent browsing keep their usual source roles.
    const reverse=new Map(),invertedResults=new Set();
    const exactPair=selection.comparator?.startsWith('exact-regimen:') && selection.intervention?.startsWith('exact-regimen:') && selection.comparator!==selection.intervention;
    if(exactPair) {
      for(const c of candidates) {
        if(c.kind!=='treatment_comparison'||!comparatorSelectionMatches(c,selection.intervention,selection.treatment_labels)||
           !interventionSelectionMatches(c,selection.comparator,selection.treatment_labels))continue;
        const own=new Set(c.result_ids || []);
        for(const row of results) {
          if(row.comparison_id!==c.comparison_id && !(row.source_extraction_ids || [row.result_id]).some(id=>own.has(id)))continue;
          if(!['HR','RR','OR'].includes(displayMeasure(row)))continue;
          const q=row.quantitative_record;
          const armId=id=>String(id || '').replace(/^CE-[a-f\d]+-/i,'');
          const bound=q?.intervention_arm_id && q?.reference_arm_id && q.intervention_arm_id!==q.reference_arm_id &&
            [q.intervention_arm_id,q.reference_arm_id].every(id=>id!=='NA') &&
            (!c.intervention_arm_id || armId(c.intervention_arm_id)===armId(q.intervention_arm_id)) &&
            (!c.comparator_arm_id || armId(c.comparator_arm_id)===armId(q.reference_arm_id));
          if(!bound && !regimenSourceRules.directionFor(c,row) && !(row.analysis?.contrast_type==='treatment_comparison' &&
            row.direction==='intervention versus comparator'))continue;
          const point=confidenceIntervals.forDisplay(row).estimate;
          if(!(point>0 && Number.isFinite(1/point)))continue;
          reverse.set(c.comparison_id,c);invertedResults.add(row);
        }
      }
      comparisons.push(...reverse.values());
    }
    if (selection.endpoint || selection.measure) comparisons = comparisons.filter((comparison) => (comparison.result_ids || []).some((id) => resultIds.has(id)) || resultComparisonIds.has(comparison.comparison_id));
    if ((selection.comparator || selection.intervention) && !comparisons.length) return null;
    const forward=comparisons.filter(c=>!reverse.has(c.comparison_id));
    const matchedIds = new Set(forward.flatMap((comparison) => comparison.result_ids || []));
    const comparisonIds = new Set(forward.map((comparison) => comparison.comparison_id));
    const selectedResults = restricted ? results.flatMap((row) => (row.source_extraction_ids||[row.result_id]).some((id)=>matchedIds.has(id)) || (row.comparison_id && comparisonIds.has(row.comparison_id))?[row]:invertedResults.has(row)?[{...row,display_reversed:true}]:[]) : results;
    if ((selection.endpoint || selection.measure) && !selectedResults.length) return null;
    return { study, comparisons, results: orderedStudyResults(selectedResults),...(exactPair?{exact_comparison_pair:true}:{}),...(reverse.size?{inverted_comparisons:new Set(reverse.keys())}:{}) };
  }
  function filterStudies(studies, selection = {}) {
    const matches=(Array.isArray(studies) ? studies : []).filter(study=>!selection.trials_only||studyDesign.designInfo(study).is_trial).filter((study) => selection.include_history===true||(study.default_visible===true&&study.current_main_eligible!==false)).map((study) => matchingStudy(study, selection)).filter(Boolean);
    if(!advancedFilters?.activeCount(selection.advanced))return matches;
    return advancedFilters.filterBrowseMatches(matches,selection.advanced,advancedBrowseOptions(selection)).map(advancedPopulationMatch);
  }
  function advancedPopulationMatch(match){
    if(!match.advanced_filter_scope)return match;
    if(match.study.advanced_filter_scope===match.advanced_filter_scope)return match;
    const source=match.source_study||match.study,details=source.details||{},selected=match.advanced_filter_scope.selections;
    const keep=sample=>advancedFilters.sampleMatches(sample,match,selected);
    const study={...source,advanced_filter_scope:match.advanced_filter_scope,details:{...details,quantitative_results:match.results,sample_size_records:(details.sample_size_records||[]).filter(keep),...(details.reported_counts?{reported_counts:details.reported_counts.filter(keep)}:{})}};
    return {...match,source_study:source,study};
  }
  const advancedBrowseProjections=new WeakMap();
  function advancedBrowseProjection(matches,{registry={},labels,classifications}={}){
    const token=classifications?.content_sha256||'';
    return matches.map(match=>{
      const source=match.source_study||match.study,scoped=advancedPopulationMatch(match);
      let cache=advancedBrowseProjections.get(source);
      if(!cache||cache.registry!==registry||cache.labels!==labels||cache.token!==token){
        cache={registry,labels,token,rows:new Map()};advancedBrowseProjections.set(source,cache);
      }
      const key=JSON.stringify([!!match.advanced_filter_scope,!!match.exact_comparison_pair,match.results.map(row=>row.result_id),match.comparisons.map(row=>row.comparison_id),[...(match.inverted_comparisons || [])],match.advanced_filter_scope?.sample_keys||[]]);
      let rows=cache.rows.get(key);
      if(!rows){
        rows=studyTablePresentationRows(scoped,{registry,labels});cache.rows.set(key,rows);
        if(cache.rows.size>24)cache.rows.delete(cache.rows.keys().next().value);
      }
      return rows.length?{...scoped,presentation_rows:rows}:null;
    }).filter(Boolean);
  }
  function advancedBrowseOptions(selection={},options={}){
    const registry=options.registry||selection.evidence_registry||{},labels=options.labels||selection.treatment_labels;
    const classifications=options.classifications||selection.clinical_classifications;
    return {...options,classifications,registry,clinical_content_sha256:options.clinical_content_sha256||selection.clinical_content_sha256,
      includeSampleOnly:!selection.endpoint&&!selection.measure,
      samplesFor:match=>reportedStudyCounts(match.study,selection.comparator||selection.intervention?match.comparisons:null,registry),
      browseMatchesFor:matches=>advancedBrowseProjection(matches,{registry,labels,classifications})};
  }
  function advancedArmSettings(match,contrast){
    const labels=new Map(advancedFilters.definitions[0].choices.map(choice=>[choice.value,choice.label])),out={comparator:new Set(),intervention:new Set()};
    for(const tag of match.advanced_filter_scope?.setting_tags||[]){
      if(!tag.cross_setting_comparison)continue;
      const row=(contrast.results||match.results).find(result=>result.result_id===tag.result_id);if(!row)continue;
      const q=row.quantitative_record||{},co=(contrast.comparisons||match.comparisons).find(comparison=>comparison.comparison_id===row.comparison_id)||(contrast.comparisons||match.comparisons).find(comparison=>(comparison.result_ids||[]).includes(row.result_id));
      const prefix='CE-'+String(row.review_binding_sha256).slice(0,24)+'-';
      for(const [role,id]of [['comparator',co?.comparator_arm_id||q.reference_arm_id],['intervention',co?.intervention_arm_id||q.intervention_arm_id]]){
        if(!id||id==='NA')continue;
        const arm=tag.arm_settings[id]||tag.arm_settings[prefix+id];
        if(arm?.status==='supported')for(const category of arm.categories)if(labels.has(category))out[role].add(labels.get(category));
      }
    }
    const tags=Object.fromEntries(Object.entries(out).map(([role,values])=>[role,[...values].join(' / ')]));
    return contrast.display_reversed?{comparator:tags.intervention,intervention:tags.comparator}:tags;
  }
  function presentationSampleSize(study,row,options={}){
    return study.advanced_filter_scope?advancedScopedSampleSize(study,row,options):compactExtraction.presentationSampleSize(study,row,options);
  }
  function advancedScopedSampleSize(study,row,options={}){
    const corrected=compactExtraction.presentationSampleSize(study,row,options),q=row.quantitative_record||{};
    const value=corrected??row.scoped_sample_size??q.display_n;
    const held=()=>({...value,n:null,status:'unverified'});
    if(!value||value.status==='CONFLICTING')return held();
    if(corrected?.basis==='single_arm_endpoint_denominator')return corrected;
    const flags=q.field_flags||[];
    if(flags.some(flag=>flag.field==='display_n'||flag.field==='analysis_n'&&typeof q.analysis_n==='number'||flag.field==='denominator'&&typeof q.denominator==='number'))return held();
    if(typeof q.analysis_n==='number'&&q.analysis_n===value.n)return value;
    if(typeof q.denominator==='number'&&q.denominator===value.n&&value.status==='reported')return value;
    const ids=value.count_ids||q.display_n?.count_ids||[],samples=options.samples||study.details?.sample_size_records||[];
    const arms=[q.arm_id,q.intervention_arm_id,q.reference_arm_id].filter(id=>id&&id!=='NA');
    return ids.length&&ids.every(id=>samples.some(sample=>sample.source_input_sha256===row.source_input_sha256&&sample.review_binding_sha256===row.review_binding_sha256&&sample.population_id===row.population_id&&sample.quantitative_record?.id===id&&(!sample.quantitative_record?.arm_id||sample.quantitative_record.arm_id==='NA'||arms.includes(sample.quantitative_record.arm_id))))?value:held();
  }
  const advancedContrastCache=new WeakMap();
  function advancedCompatibilityKey(row,match,entry,registry={}){
    const q=row.quantitative_record||{},scope=row.scope||{},co=match.comparisons.find(c=>c.comparison_id===row.comparison_id)||match.comparisons.find(c=>(c.result_ids||[]).includes(row.result_id));
    if(!co)return null;
    let contrast=advancedContrastCache.get(co);
    if(!contrast){contrast=[comparatorPresentation(co).key,interventionPresentation(co).key];advancedContrastCache.set(co,contrast);}
    const semantic=outcomeReconciliation.semanticOutcome(row,{study:match.source_study||match.study,rows:studyResults(match.source_study||match.study),registry});
    const model=String(q.model||row.analysis?.model||'NA').toLowerCase();
    const modelType=/accelerated failure|\baft\b/.test(model)?'AFT':/cox|proportional hazards/.test(model)?'Cox':model;
    const fields=entry?.fields||{},clinical=['setting','stage','subtype','braf','advanced_line','baseline_ldh'].map(key=>[fields[key]?.status||'NA',fields[key]?.categories||[]]);
    const ldh=fields.baseline_ldh,thresholds=ldh?.status==='supported'?ldh.details?.reported_thresholds||[]:[];
    return JSON.stringify([displayEndpointFamily(row),semantic.key,displayMeasure(row),q.kind||'',modelType,q.adjusted||row.analysis?.adjusted||'NA',q.response_criteria||'',q.assessment_time??q.time??'',q.time_unit||'',q.safety_attribution||'',...contrast,clinical,entry?.cross_setting_comparison===true,thresholds,scope.estimand||row.analysis?.estimand||'']);
  }
  function advancedAnalysisCountEligible(row,match,entry,{endpoint,measure,registry={}}={}){
    if(!endpoint||displayMeasure(row)!==measure||!mainResultEligible(row))return false;
    const q=row.quantitative_record||{},e=row.estimate?.value??q.estimate,low=row.ci_lower?.value??q.ci_lower,high=row.ci_upper?.value??q.ci_upper;
    if(![e,low,high].every(finite)||low<=0||e<=0||low>e||high<e||low===high)return false;
    if((q.field_flags||[]).some(flag=>['estimate','percentage','ci_lower','ci_upper','ci_level'].includes(flag.field)))return false;
    if(q.derived_ci?.test_assumed===true)return false;
    if(row.extraction_conflict&&!outcomeReconciliation.conflictStatus(row,{study:match.source_study||match.study,rows:studyResults(match.source_study||match.study),registry}).suppress_display_conflict)return false;
    const n=advancedScopedSampleSize(match.study,row,{registry,samples:match.study.details?.sample_size_records||[]});
    return !!n&&Number.isInteger(n.n)&&n.n>0;
  }
  function advancedParticipantFor(row,match,entry,{registry={}}={}){
    const q=row.quantitative_record||{},n=advancedScopedSampleSize(match.study,row,{registry,samples:match.study.details?.sample_size_records||[]});
    if(!n||!Number.isInteger(n.n)||n.n<=0||(q.field_flags||[]).some(flag=>['analysis_n','denominator','display_n'].includes(flag.field)))return null;
    // Only an explicitly scoped result denominator is summed. Enrolled or
    // randomized fallbacks remain useful in the table but do not establish a
    // nonoverlapping subgroup total.
    if(n.status!=='reported'||n.count_purpose!=='outcome_analysis')return null;
    return {n:n.n,verified:true,nonoverlapping:true,denominator_id:[entry?.independence?.cohort_ids?.join('|'),row.population_id,q.arm_id||q.intervention_arm_id||'',n.count_purpose].join(':')};
  }
  function advancedAnalysisOptions(selection={},options={}){
    const registry=options.registry||selection.evidence_registry||{};
    return {...options,classifications:options.classifications||selection.clinical_classifications,registry,clinical_content_sha256:options.clinical_content_sha256||selection.clinical_content_sha256,analysis:{endpoint:selection.endpoint,measure:selection.measure},compatibilityFor:(row,match,entry)=>advancedCompatibilityKey(row,match,entry,registry),
      countEligible:(row,match,entry)=>advancedAnalysisCountEligible(row,match,entry,{endpoint:selection.endpoint,measure:selection.measure,registry}),
      participantFor:(row,match,entry)=>advancedParticipantFor(row,match,entry,{registry})};
  }
  function constrainStudyChoices(studies, selection = {}, changed = '') {
    const next = { ...selection };
    const base = filterStudies(studies, { trials_only:next.trials_only, endpoint: next.endpoint, measure: next.measure, include_history: next.include_history, include_orr: next.include_orr, orr_only: next.orr_only, evidence_registry:next.evidence_registry });
    const groups = base.flatMap((row) => row.comparisons);
    const interestsFor = (comparator) => [...new Set(groups.filter((row) => comparatorSelectionMatches(row, comparator, next.treatment_labels)).flatMap(additionalInterestIds))];
    const comparatorsFor = (intervention) => [...new Set(groups.filter((row) => interventionSelectionMatches(row, intervention, next.treatment_labels)).map(comparatorKey).filter(Boolean))];
    const hasPair = () => groups.some((row) => comparatorSelectionMatches(row, next.comparator, next.treatment_labels) && interventionSelectionMatches(row, next.intervention, next.treatment_labels));
    const clearUnsupported=role=>{
      if(next[role] && !next[role].startsWith('exact-regimen:') && !hasPair())next[role]='';
    };
    clearUnsupported(changed==='intervention'?'comparator':'intervention');
    clearUnsupported('comparator');
    clearUnsupported('intervention');
    const interventionComparisons=groups.filter((row)=>comparatorSelectionMatches(row,next.comparator,next.treatment_labels));
    const optionRows=(rows,present)=>[...new Map(rows.map(row=>{const p=present(row);return [p.key,{value:p.key,label:p.label,definition:p.definition}];})).values()].filter(row=>row.value);
    return { selection: next, comparator_keys: comparatorsFor(next.intervention), intervention_ids: interestsFor(next.comparator), intervention_entries:[...interventionGroupLabels(interventionComparisons,next.treatment_labels)],
      comparator_options:optionRows(groups.filter(row=>interventionSelectionMatches(row,next.intervention,next.treatment_labels)),row=>comparatorPresentation(row)),
      intervention_options:optionRows(interventionComparisons,row=>interventionPresentation(row,next.treatment_labels)),comparisons: groups };
  }
  function sortStudyRows(rows, key = 'year', order = 'desc') {
    const sign = order === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = key === 'author' ? a.study.first_author_surname : a.study.year, y = key === 'author' ? b.study.first_author_surname : b.study.year;
      const missingX = x === null || x === undefined || x === '', missingY = y === null || y === undefined || y === '';
      if (missingX !== missingY) return missingX ? 1 : -1;
      const comparison = key === 'author' ? String(x || '').localeCompare(String(y || ''), 'en', { sensitivity: 'base' }) : Number(x || 0) - Number(y || 0);
      return sign * comparison || a.study.title.localeCompare(b.study.title) || a.study.report_id.localeCompare(b.study.report_id);
    });
  }
  function semanticExtractionStatus(info, stage) {
    if (!info || info.current_prior_qualification_unchanged !== true) return '';
    const n = (v) => Number.isInteger(v) && v >= 0 ? v.toLocaleString('en-US') : 'NA';
    const unit = stage === 'R2' ? 'reports' : 'fragments';
    return `${n(info.effective_current_source_qualified)} / ${n(info.current_total)} current ${unit} have source-qualified extraction; ${n(info.effective_current_unresolved)} unresolved. ${n(info.newly_source_qualified_beyond_prior)} newly qualified through normalization. ${stage === 'R3' ? 'Fragment validation is not whole-report completion.' : 'Earlier source qualification is preserved; normalization coverage holds do not create new scientific failures.'}`;
  }
  function articleStatusLabel(study) {
    if(study.publication_integrity?.retracted_or_notice)return study.publication_integrity.label;
    if(study.current_main_eligible===false)return study.current_screening_status==='exclude'?'Historical · currently excluded':study.current_screening_status==='uncertain'?'Historical · current triage uncertain':'Historical · current admission held';
    return '';
  }
  function armTag(label, addOn = false, definition = null) {
    if(!label||label==='—')return '—';
    const description=regimenDescription(definition||label);
    const render=(part)=>{
      if(!part.components?.length)return {html:treatmentBadge(part.label,part.class_ids||[]),compound:false};
      const separator={alternative:'or',sequential:'→',optional:'±',combination:'+'}[part.kind]||'+';
      let children=part.components.map(child=>{const shown=render(child);return shown.compound?`(${shown.html})`:shown.html;});
      if(part.kind==='alternative')children=[...new Set(children)];
      return {html:children.join(` <span class="treatment-join">${separator}</span> `),compound:children.length>1};
    };
    const content=render({...description,label:description.label||label}).html;
    const placebo=description.components?.length>1&&description.placebo?' <span class="treatment-placebo">(+placebo)</span>':'';
    return treatmentRegimen(content+placebo,addOn);
  }
  const api = Object.freeze({ armTag, exactBrowsePair, completeArmKey, treatmentBadge, treatmentRegimen, savedTreatmentTag, studyDesignInfo:study=>studyDesign.designInfo(study), abstractOnly:study=>studyDesign.abstractOnly(study), specialOutcomeDetails:(study,options)=>studyDesign.specialOutcomeDetails(study,options), survivalEndpointLabels, responseEndpointLabels, endpointLabel, endpointOptionLabel, reportedHazardRatio, reportedSurvivalEndpoint, derivedInterval, studyTrialIdentifiers, studyTrialSearchIndex, filterStudyTrials, studyTableData, studyTablePresentation, studyTablePresentationRows, studyOutcomeChoices, hasPairedArmCounts, visibleStudyMatches, conciseTreatmentLabel, studyTableCSV, tableEndpoint, tableValue, studyTreatmentRows, interventionPresentation, interventionGroupLabels, regimenDescription, advancedPopulationMatch, advancedArmSettings, advancedBrowseOptions, advancedAnalysisOptions, treatmentClass, additionalPresentation, additionalGroupLabels, defaultEffectMeasure, isORRResult, treatmentSelectionMatches, resultMatches, semanticExtractionStatus, articleStatusLabel, scopedStudies, studyResults, mainResultEligible, displayEndpointFamily, orderedStudyResults, compactClinicalResult, compactContrast, reportedStudyCounts, reportedCountLabel, displayMeasure, comparatorKey, comparatorPresentation, comparatorDisplayLabel, comparatorGroupLabels, additionalDrugIds, additionalInterestIds, comparisonBrowseEligible, studyComparisons, filterStudies, constrainStudyChoices, sortStudyRows, colors, dotRadius, independentCount, savedPoolingMetadata, direction, matrixEligible, validEstimate, endpointKind, relevantMeasures, ancestorClosure, diseaseMatches, joinR2Articles, filterR2Articles, joinProvisionalStudies, filterProvisionalStudies, joinQuantitativeResults, joinQuantitativeSamples, quantitativeText, reportedNumber, confidence95, quantitativeMeasure, populationCountIsContext, filterQuantitativeResults, quantitativeBrowseEvidence, studyArticles, evidenceIndex, availableCombination, reconcileEvidenceSelection, forestSvg, funnelSvg, sampleSizeSvg });
  if (typeof window !== 'undefined') window.MetaSampleSizeCharts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

if (typeof document !== 'undefined') (() => {
  const $ = (id) => document.getElementById(id);
  const FIXED_DISEASE = 'cutaneous_melanoma';
  const number = new Intl.NumberFormat('en-US');
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const defaults = {
    counts: { processed: 0, retained: 285, uncertain: 536, excluded: 0, candidates: 821, registry_trials: 0 },
    r2: { scope: 821, status: 'pending', pipelines: [] },
    usage: { known_estimated_usd: null, actual_attempts: 0, cache_reuses: 0, unknown_cost_attempts: 0, r1_unknown_cost_attempts: 0, stages: [] },
    diseases: [], sources: [], limitations: []
  };
  const state = { summary: defaults, records: [], filtered: [], page: 1, pageSize: 25, loading: true, datasetError: false, currentView: 'analysis', activeReport: null, saved: readDeviceData(), diseases: new Map(), analysis: { status: 'awaiting_extraction', validated: false, analyses: [], matrix: [], sample_size: [] }, selectedAnalysis: null, matrixPoints: [], settings: readSettings(), trackingTab: 'overview', evidence: null, r2Articles: [], r2ArticleError: false, r2ArticlePage: 1, r2ArticlePageSize: 10, provisionalStudies: [], provisionalStudyError: false, provisionalPage: 1, provisionalPageSize: 10, provisionalFiltered: [], quantitativeResults: [], quantitativeError: false, quantitativePage: 1, quantitativePageSize: 10, quantitativeFiltered: [], scopedStudies: [], scopedPayload: null, scopedPage: 1, scopedSort: 'year', scopedOrder: 'desc', trialsOnly:false, advanced:readAdvancedSelections(), advancedExpanded:false, clinicalClassifications:null, advancedEpoch:0, advancedCache:new Map(), drugLabels: new Map() };
  const titles = { analysis: 'Analysis', studies: 'Study selection', summary: 'Summary', dotplot: 'Summary across interventions', 'sample-size': 'Sample size summary', settings: 'Settings', about: 'About' };
  const storageKey = 'metaCutaneousMelanomaTrial.device-review.v1';
  const coreLabels = { core: 'Core', deferred: 'Deferred', separate: 'Separate', review: 'Review' };
  const reportLabels = { trial_primary: 'Primary trial report', trial_followup: 'Trial follow-up', trial_follow_up: 'Trial follow-up', trial_subgroup: 'Trial subgroup', trial_biomarker: 'Trial biomarker analysis', trial_safety: 'Trial safety analysis', trial_pooled: 'Original pooled trial analysis', original_pooled_trial_analysis: 'Original pooled trial analysis', conference_abstract: 'Conference abstract' };
  const regimenLabels = { immunotherapy: 'Immunotherapy', targeted_therapy: 'Targeted therapy', immunotherapy_targeted: 'Immunotherapy + targeted therapy', immunotherapy_plus_targeted: 'Immunotherapy + targeted therapy', endocrine_targeted_immunotherapy: 'Endocrine + targeted / immunotherapy', endocrine_combination: 'Endocrine combination', endocrine_only: 'Endocrine only', endocrine_plus_endocrine: 'Endocrine combination', chemotherapy_containing: 'Concurrent cytotoxic regimen', unresolved: 'Unresolved' };

  function escape(value) { return String(value ?? '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x])); }
  function human(value) { const text = String(value || 'Not specified').replace(/[_-]+/g, ' '); return text.charAt(0).toUpperCase() + text.slice(1); }
  function list(value) { return Array.isArray(value) ? value : value ? [value] : []; }
  function icon(name, extra = '') { return `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
  function text(id, value) { const target = $(id); if (target) target.textContent = value; }
  function count(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; }
  function statusInfo(value) {
    const status = String(value || 'pending').toLowerCase();
    if (/defer/.test(status)) return { label: 'Deferred', style: 'neutral' };
    if (/incomplete|blocked|failed|unavailable|limited/.test(status)) return { label: 'Incomplete', style: 'incomplete' };
    if (/complete|finished|succeeded/.test(status)) return { label: 'Complete', style: 'complete' };
    if (/prepar/.test(status)) return { label: 'Preparing', style: 'ready' };
    if (/running|in.progress|active/.test(status)) return { label: 'In progress', style: 'running' };
    if (/pause|stopped|review.required/.test(status)) return { label: 'Awaiting review', style: 'neutral' };
    if (/ready|authorized/.test(status)) return { label: 'Ready', style: 'ready' };
    return { label: 'Pending', style: 'pending' };
  }
  function badge(value) { const status = statusInfo(value); return `<span class="badge badge-${status.style}">${escape(status.label)}</span>`; }
  function priority(value) { const key = Object.hasOwn(coreLabels, value) ? value : 'review'; return `<span class="badge badge-${key}">${coreLabels[key]}</span>`; }
  function pubmedLink(pmid) { const id = String(pmid || '').trim(); return /^\d+$/.test(id) ? `https://pubmed.ncbi.nlm.nih.gov/${id}/` : null; }
  function doiLink(doi) { const id = String(doi || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ''); return /^10\.\d{4,9}\//.test(id) ? `https://doi.org/${id.split('/').map(encodeURIComponent).join('/')}` : null; }
  function external(url, label) { return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ${icon('external')}</a>`; }

  function readDeviceData() {
    try {
      const saved = JSON.parse(localStorage.getItem('metaCutaneousMelanomaTrial.device-review.v1') || '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch { return {}; }
  }
  function persistDeviceData() {
    try { localStorage.setItem(storageKey, JSON.stringify(state.saved)); return true; }
    catch { toast('This browser could not save this review item. No information was sent anywhere.'); return false; }
  }
  let toastTimer;
  function toast(message) { text('toast', message); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200); }

  let underpoweredController;
  const evidenceTabs = {
    'underpowered-studies': { path: './data/underpowered_studies.json', render: (panel, data) => {
      underpoweredController=globalThis.UnderpoweredStudies.mount(panel, data,
        (heading,body,evidence,change)=>mountTabAdvanced(heading,body,'underpowered-advanced',evidence,change),state.settings.power);
    } },
    'new-findings': { path: './data/new_findings.json', render: (panel, data) => globalThis.NewFindings.render(panel, data) },
    'phase-comparison': { path: './data/phase_comparison.json', render: (panel, data) => globalThis.PhaseComparison.render(panel, data) },
    'trial-outcomes': { path: './data/trial_outcomes.json', render: (panel, data) => globalThis.TrialOutcomes.mount(panel, data, {
      attachAdvanced: (heading, body, evidence, change) => mountTabAdvanced(heading, body, 'trial-outcomes-advanced', evidence, change),
      resultHref: source => '#study-result?' + new URLSearchParams({pmid: source.pmid, stage: source.stage, sha: source.sha, section: source.section, id: source.id})
    }) }
  };
  const tabLoads = new Map();

  function loadEvidenceTab(name) {
    if (tabLoads.has(name)) return tabLoads.get(name);
    const panel = $('analysis-' + name);
    const message = document.createElement('p');
    message.className = 'evidence-tab-note';
    message.setAttribute('role', 'status');
    message.textContent = 'Loading studies…';
    if (!panel.dataset.sourceVersion) panel.replaceChildren(message);
    const tab = evidenceTabs[name];
    const request = (async () => {
      const version = await savedMapVersion();
      if (panel.dataset.sourceVersion && panel.dataset.sourceVersion === version.source_file_sha256) return;
      const data = await fetchJson(tab.path);
      if (!data.source_file_sha256 || data.source_file_sha256 !== version.source_file_sha256)
        throw new Error('The saved table and study publication differ.');
      tab.render(panel, data);
      panel.dataset.sourceVersion = data.source_file_sha256;
    })().catch(() => {
      delete panel.dataset.sourceVersion;
      message.textContent = 'The saved study table could not be loaded. ';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'secondary-button';
      retry.textContent = 'Try again';
      retry.addEventListener('click', () => loadEvidenceTab(name));
      message.appendChild(retry);
      panel.replaceChildren(message);
    }).finally(() => tabLoads.delete(name));
    tabLoads.set(name, request);
    return request;
  }

  function showView(name, focus = false) {
    const sourceRoute = name.startsWith('study-result?') ? name : null;
    if (sourceRoute) name = 'analysis';
    const dialog = $('study-dialog');
    if (dialog.open && dialog.dataset.sourceRoute && dialog.dataset.sourceRoute !== sourceRoute) dialog.close();
    const requestedTab = Object.hasOwn(evidenceTabs, name) ? name : name === 'analysis' ? 'articles' : 'treatment-map';
    if (name === 'tracking') { name = 'about'; if (typeof history !== 'undefined' && location.hash === '#tracking') history.replaceState(null, '', '#about'); }
    if (['overview', 'usage', 'sources', 'reports'].includes(name)) name = 'about';
    if (!Object.hasOwn(titles, name)) name = 'analysis';
    state.currentView = name;
    if(name!=='about'&&state.baselineScopedStudies)refreshClinicalEvidence();
    document.querySelectorAll('.view').forEach((section) => { section.hidden = section.id !== `view-${name}`; });
    document.querySelectorAll('[data-view]').forEach((button) => {
      const selected = button.dataset.view === name;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    document.title = `${titles[name]} · metaMelanomaTrials`;
    if(name==='analysis')selectAnalysisTab(requestedTab, false, sourceRoute);
    if (focus) $('main').focus({ preventScroll: true });
    if (sourceRoute) openOutcomeSource(sourceRoute);
  }
  function go(name) { if (location.hash !== `#${name}`) location.hash = name; else showView(name, true); }

  async function refreshEvidenceFreshness() {
    const target=$('source-fetch-status');
    try {
      const metadata=await fetchJson('./data/evidence_freshness.json'),value=metadata.last_information_fetch_at,date=new Date(value);
      if(!value||!Number.isFinite(date.getTime()))throw new Error('Source retrieval date unavailable');
      if(target.dataset.fetchedAt===value)return;
      const time=document.createElement('time');time.dateTime=date.toISOString();
      time.textContent=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',timeZone:'America/New_York'}).format(date);
      target.replaceChildren(document.createTextNode('Last fetched: '),time);target.dataset.fetchedAt=value;
      target.title='Latest successful evidence retrieval; screening and website updates do not change this date.';
    }catch{if(!target.dataset.fetchedAt)target.textContent='Last fetched: unavailable';}
  }

  function mergeSummary(value) {
    const summary = value && typeof value === 'object' ? value : {};
    return { ...defaults, ...summary, counts: { ...defaults.counts, ...summary.counts }, r2: { ...defaults.r2, ...summary.r2 }, usage: { ...defaults.usage, ...summary.usage } };
  }
  const charts = window.MetaSampleSizeCharts;
  const evidenceDisplay = window.EvidenceDisplay;
  const settingsDefaults = defaultSettings();
  function readSettings() {
    const fallback = defaultSettings();
    try {
      const value = JSON.parse(localStorage.getItem('metaCutaneousMelanomaTrial.settings.v1') || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
      // Screening history stays in saved evidence; the public study list always
      // uses current retained reports, including on devices with older settings.
      if (['latest', 'all'].includes(value.record_policy)) fallback.record_policy = value.record_policy;
      if (value.network_model === 'random') fallback.network_model = 'random';
      if (value.arms===1) fallback.arms=1;
      if(Number.isFinite(value.manualProbability) && value.manualProbability>0 && value.manualProbability<1)
        fallback.manualProbability=value.manualProbability;
      if (typeof value.allocation_ratio === 'number' && Number.isFinite(value.allocation_ratio) && value.allocation_ratio > 0) fallback.allocation_ratio = value.allocation_ratio;
      if ([1, 2].includes(value.sidedness)) fallback.sidedness = value.sidedness;
      if(Number.isFinite(value.power) && value.power>.5 && value.power<1)fallback.power=value.power;
      if(Number.isFinite(value.alpha) && value.alpha>0 && value.alpha<1)fallback.alpha=value.alpha;
    } catch { /* Use the documented defaults when browser storage is unavailable. */ }
    return fallback;
  }
  function defaultSettings() {
    return { include_history:false,record_policy:'latest',network_model:'common',arms:2,allocation_ratio:1,sidedness:2,power:.8,alpha:.05,
      manualProbability:null };
  }
  function displaySettings() {
    const bindings = { 'analysis-record-policy': 'record_policy', 'network-model': 'network_model','planning-arms':'arms', 'planning-allocation': 'allocation_ratio', 'planning-sidedness': 'sidedness', 'planning-power': 'power', 'planning-alpha': 'alpha' };
    for (const [id, key] of Object.entries(bindings)) $(id).value = String(state.settings[key]);
    const rate=state.settings.manualProbability;
    $('planning-reference-rate').value=rate===null?'':String(Number((100*rate).toFixed(9)));
    displayPlanningFields();
  }
  function displayPlanningFields() {
    const allocation=$('planning-allocation');
    allocation.disabled=$('planning-arms').value==='1';
    allocation.closest('label').hidden=allocation.disabled;
  }
  function saveSettings(reset = false) {
    if (!reset && !$('settings-form').reportValidity()) return;
    const numberSetting=(id,key,divisor=1)=>{
      const input=$('planning-'+id);
      if(input.disabled)return state.settings[key];
      return input.value===''?null:Number(input.value)/divisor;
    };
    state.settings = reset ? { ...settingsDefaults } : {
      include_history:false, record_policy: $('analysis-record-policy').value,
      network_model: $('network-model').value === 'random' ? 'random' : 'common',
      arms:Number($('planning-arms').value),
      manualProbability:numberSetting('reference-rate','manualProbability',100),
      allocation_ratio:numberSetting('allocation','allocation_ratio'),sidedness:numberSetting('sidedness','sidedness'),
      power:numberSetting('power','power'),alpha:numberSetting('alpha','alpha')
    };
    try { localStorage.setItem('metaCutaneousMelanomaTrial.settings.v1', JSON.stringify(state.settings)); text('settings-status', 'Saved on this device.'); }
    catch { text('settings-status', 'Applied for this session. Browser storage is unavailable.'); }
    treatmentMapController?.setNetworkModel(state.settings.network_model);
    treatmentMapController?.setPlanningSettings(state.settings);
    underpoweredController?.setPower(state.settings.power);
    displaySettings(); $('analysis-comparison').value = '';
    if(!state.studyPreview?.active)refreshStudyChoices();
    renderAnalysis();renderSummary();renderMatrix();renderPlanning();
  }
  function emptyChart(title = 'Results pending review.', message = '') {
    return `<div class="chart-empty">${icon('chart')}<h3>${escape(title)}</h3>${message ? `<p>${escape(message)}</p>` : ''}</div>`;
  }
  function options(id, entries, placeholder, chooseSingle = false) {
    const element = $(id), old = element.value;
    element.innerHTML = `<option value="">${escape(placeholder)}</option>` + entries.map(([value, label]) => `<option value="${escape(value)}">${escape(label)}</option>`).join('');
    if (entries.some(([value]) => String(value) === old)) element.value = old;
    else if (chooseSingle && entries.length === 1) element.value = String(entries[0][0]);
  }
  function groupedOptions(id, entries, placeholder, role) {
    const element = $(id);
    const tree=role&&studyNetwork.catalog ? globalThis.StudyIndirect.pickerTree(entries,studyNetwork.catalog,globalThis.TreatmentGroups,role) : globalThis.TreatmentGroups.optionTree(entries);
    setTreatmentOptions(element,tree,placeholder);
  }
  function setTreatmentOptions(element,tree,placeholder) {
    const old=element.value;
    element.innerHTML = `<option value="">${escape(placeholder)}</option>` + tree.map((row)=>
      `<option value="${escape(row.value)}" data-treatment-class="${escape(row.class_id||'')}" data-depth="${row.depth}"${row.disabled?' disabled':''}>${'\u00a0\u00a0'.repeat(row.depth)}${row.depth?'↳ ':''}${escape(row.label)}${row.value.startsWith('treatment-class:')&&!row.value.startsWith('treatment-class:agent:')?' — all':''}</option>`).join('');
    if(tree.some((row)=>row.value===old))element.value=old;
    globalThis.TreatmentPicker?.enhance(element)?.refresh(tree,placeholder);
  }
  function endpointMetadata(endpoint) {
    const definitions = [...list(state.analysis.endpoint_definitions), ...list(state.summary.endpoint_definitions)];
    const explicit = definitions.find((row) => (row.id || row.endpoint || row.endpoint_id) === endpoint) || {};
    const matching = ['analyses', 'matrix', 'sample_size'].flatMap((key) => list(state.analysis[key])).filter((row) => row.validated === true && row.endpoint === endpoint);
    const types = [...new Set(matching.map((row) => row.endpoint_type).filter(Boolean))];
    const measures = [...new Set(matching.map((row) => row.effect_measure).filter(Boolean))];
    if (types.length > 1) return { ...explicit, endpoint_type: 'unknown', effect_measures: [], ambiguous: true };
    return { ...explicit, ...(types.length === 1 ? { endpoint_type: types[0] } : {}), ...(measures.length ? { effect_measures: measures } : {}) };
  }
  function selectedMeasure(prefix) {
    const endpoint = $(`${prefix}-endpoint`).value;
    return endpoint ? charts.defaultEffectMeasure(endpoint, endpointMetadata(endpoint)) : '';
  }
  function numericalRows() {
    return state.analysis.validated === true ? ['analyses', 'matrix', 'sample_size'].flatMap((key) => list(state.analysis[key])).filter((row) => row.validated === true) : [];
  }
  function updateAvailability(prefix) {
    const endpoint=$(`${prefix}-endpoint`),evidence=prefix==='analysis'?state.analysisBrowseEvidence:state.evidence;
    // Keep an explicit endpoint selection even when it currently has no eligible
    // estimates. Clearing it would silently show unrelated outcomes instead.
    for(const option of endpoint.options){option.disabled=!!option.value&&!charts.availableCombination(evidence,FIXED_DISEASE,option.value);option.setAttribute('aria-disabled',String(option.disabled));}
  }

  function setupAnalysisControls() {
    const numerical=numericalRows();
    const available=state.summary.evidence_availability?.combinations||[];
    state.evidence=charts.evidenceIndex([],numerical,available,[{id:FIXED_DISEASE,label:'Cutaneous melanoma'}]);
    const rows=state.quantitativeResults.filter((row)=>{
      const endpoint=charts.displayEndpointFamily(row);
      return charts.resultMatches(row,{endpoint,measure:charts.defaultEffectMeasure(endpoint,endpointMetadata(endpoint)),include_orr:endpoint==='response',orr_only:endpoint==='response'});
    }).map((row)=>({...row,endpoint:{...row.endpoint,family:charts.displayEndpointFamily(row)},target_disease_id:FIXED_DISEASE}));
    state.analysisBrowseEvidence=charts.quantitativeBrowseEvidence(state.evidence,rows,[{id:FIXED_DISEASE}]);
    const endpoints=new Map();
    for(const study of state.scopedStudies.filter((row)=>row.default_visible))for(const endpoint of studyResultsFamilies(study))if(!['other','unclear'].includes(endpoint))endpoints.set(endpoint,human(endpoint));
    for(const row of numerical)if(row.endpoint)endpoints.set(row.endpoint,human(row.endpoint));
    if(!endpoints.size)for(const endpoint of ['overall_survival','progression_free_survival','response','adverse_events','recurrence'])endpoints.set(endpoint,human(endpoint));
    for(const prefix of ['analysis','summary','matrix','planning']){options(`${prefix}-endpoint`,[...endpoints].map(([id,label])=>[id,charts.endpointOptionLabel(id)||label]).sort((a,b)=>a[1].localeCompare(b[1])),'All endpoints');updateAvailability(prefix);}
    refreshStudyChoices();renderAnalysis();renderSummary();renderMatrix();renderPlanning();renderPrisma();
  }

  function currentTreatmentAnalysis(row){
    return !!state.treatmentNormalizations&&row.treatment_registry_version===state.treatmentNormalizations.registry_version&&
      row.treatment_registry_sha256===state.treatmentNormalizations.registry_sha256&&
      row.treatment_resolver_sha256===state.treatmentNormalizations.resolver_sha256&&
      row.treatment_groups_sha256===state.treatmentNormalizations.treatment_groups_sha256&&
      row.regimen_definitions_sha256===state.treatmentNormalizations.regimen_definitions_sha256;
  }
  function savedAnalyses() { return state.analysis.validated === true ? list(state.analysis.analyses).filter((analysis) => analysis.validated === true && analysis.disease_id === FIXED_DISEASE && currentTreatmentAnalysis(analysis)) : []; }
  function currentPoolingMetadata(row) {
    const linked=row.analysis_id?savedAnalyses().find(analysis=>String(analysis.id||analysis.analysis_id)===String(row.analysis_id)):null;
    return charts.savedPoolingMetadata(row,linked);
  }
  function matchesSettings(row) {
    const linked = row.analysis_id ? savedAnalyses().find((analysis) => String(analysis.id || analysis.analysis_id) === String(row.analysis_id)) : null;
    const policy = row.record_policy || row.publication_policy || linked?.record_policy || linked?.publication_policy;
    return !!charts.savedPoolingMetadata(row,linked) && policy === state.settings.record_policy;
  }
  function selectedMatch(row, prefix) {
    const endpoint = $(`${prefix}-endpoint`).value, measure = selectedMeasure(prefix), disease = FIXED_DISEASE;
    return !!endpoint && !!measure && row.endpoint === endpoint && row.effect_measure === measure && charts.diseaseMatches(disease, [row.disease_id], list(state.summary.disease_catalog));
  }
  function analysisMatch(analysis) {
    const id=analysis.intervention_id,label=analysis.intervention_label || drugLabel(id),selected=$('analysis-intervention').value;
    const intervention=charts.regimenDescription(label),comparator=charts.comparatorPresentation({comparator_label:analysis.comparator_label,comparator_key:analysis.comparator_id});
    return selectedMatch(analysis, 'analysis') && (id===selected || charts.treatmentSelectionMatches('intervention:'+intervention.key,intervention.label,selected)) && charts.treatmentSelectionMatches(comparator.key,comparator.label,$('analysis-comparator').value) && matchesSettings(analysis);
  }
  function comparisonLabel(analysis, includeDisease = true) {
    return [includeDisease ? state.diseases.get(analysis.disease_id) || analysis.disease_label || human(analysis.disease_id) : null, analysis.comparator_label || analysis.comparator_id, analysis.population_label || analysis.population_id, analysis.estimand, analysis.effect_model, analysis.data_cutoff || analysis.cutoff].filter(Boolean).join(' · ') || 'Saved comparison';
  }
  function articleDiseaseIds(record) {
    const ids = record.r2?.disease_scope_ids || [];
    const specific = ids.filter((id) => !ids.some((other) => other !== id && charts.ancestorClosure([other], list(state.summary.disease_catalog)).has(id)));
    return specific.length ? specific : ids;
  }
  function mainSelection() {
    const endpoint = $('analysis-endpoint').value;
    const treatment=role=>{
      const value=$('analysis-'+role).value;
      return studyNetwork.catalog?.labels.has(value) ? 'exact-regimen:'+(studyNetwork.catalog.keys.get(value) || 'unresolved:'+value) : value;
    };
    return { trials_only:state.trialsOnly===true, include_history:state.settings.include_history===true, comparator:treatment('comparator'), intervention:treatment('intervention'), endpoint, measure: selectedMeasure('analysis'), include_orr:endpoint==='response', orr_only:endpoint==='response', treatment_labels:state.drugLabels, evidence_registry:state.scopedPayload?.evidence_registry,advanced:state.advanced,clinical_classifications:state.clinicalClassifications,clinical_content_sha256:state.quantitativeSnapshot?.clinical_evidence?.content_sha256 };
  }
  function readAdvancedSelections(){
    try{const saved=JSON.parse(localStorage.getItem('metaMelanomaTrials.advanced-filters.v1')||'{}');return globalThis.AdvancedFilters.normalizeSelections(saved.selections||{});}catch{return globalThis.AdvancedFilters.resetSelections();}
  }
  function invalidateAdvancedEvidence(){state.advancedEpoch++;state.advancedCache.clear();}
  function advancedEvidence(prefix='analysis'){
    const engine=globalThis.AdvancedFilters,selection={...mainSelection()};
    if(prefix==='network'){selection.comparator='';selection.intervention='';}
    else if(prefix!=='analysis'){selection.endpoint=$(`${prefix}-endpoint`).value;selection.measure=selectedMeasure(prefix);selection.include_orr=selection.endpoint==='response';selection.orr_only=selection.endpoint==='response';selection.comparator='';selection.intervention='';}
    const key=JSON.stringify([prefix,state.advancedEpoch,selection.endpoint,selection.measure,selection.comparator,selection.intervention,selection.trials_only,selection.include_history,state.advanced]);
    if(state.advancedCache.has(key))return state.advancedCache.get(key);
    const base=charts.filterStudies(state.scopedStudies,{...selection,advanced:undefined});
    const options=charts.advancedAnalysisOptions(selection,{studyLinks:state.quantitativeSnapshot?.study_links||[]});
    const browseOptions=charts.advancedBrowseOptions(selection);
    const matches=engine.activeCount(state.advanced)?engine.filterBrowseMatches(base,state.advanced,browseOptions).map(charts.advancedPopulationMatch):base;
    const summary=selection.endpoint?engine.evidenceSummary(matches,{...options,allMatches:base}):{independent_studies:0,sufficient:false,participant_total:null};
    const visibleMatches=['analysis','network'].includes(prefix)?browseOptions.browseMatchesFor(matches):null;
    const result={base,matches,visibleMatches,summary,options,browseOptions,selection,browseSummary:visibleMatches?engine.browseSummary(visibleMatches):null,facets:null};
    state.advancedCache.set(key,result);return result;
  }
  let advancedPanel;
  const tabAdvancedPanels=new Set();
  function clinicalFilterOptions(){
    return {classifications:state.clinicalClassifications,registry:state.scopedPayload?.evidence_registry||{},
      clinical_content_sha256:state.quantitativeSnapshot?.clinical_evidence?.content_sha256};
  }
  function refreshTabAdvancedPanels(){for(const view of tabAdvancedPanels)view.refresh();}
  function mountTabAdvanced(heading,body,id,getEvidence,onSelectionChanged){
    let expanded=false,revision=0,destroyed=false;
    const panel=globalThis.AdvancedFilterPanel.mount({heading,body,id,
      onToggle(){expanded=!expanded;refresh();},onChange:advancedChanged,onReset:()=>advancedChanged()});
    async function refresh(){
      if(destroyed)return;
      const current=++revision,selections=state.advanced,active=globalThis.AdvancedFilters.activeCount(selections);
      const update=(info={})=>{if(current===revision&&!destroyed)panel.update({...info,active,expanded});};
      if(!expanded&&!active){update();onSelectionChanged?.(selections,clinicalFilterOptions());return;}
      try{
        if(!state.quantitativeSnapshot||state.loading){update({loading:true});await ensureStudyData();}
        if(current!==revision||destroyed)return;
        const options=clinicalFilterOptions();
        if(!options.classifications){update({unavailable:true});onSelectionChanged?.(selections,options);return;}
        const result=getEvidence(selections,expanded,options);
        if(result?.then)update({loading:true});
        const evidence=await result;
        if(current!==revision||destroyed)return;
        update(evidence);onSelectionChanged?.(selections,options);
      }catch{if(current===revision&&!destroyed){update({unavailable:true});onSelectionChanged?.(selections,clinicalFilterOptions());}}
    }
    const view={refresh,destroy(){destroyed=true;revision++;tabAdvancedPanels.delete(view);panel.destroy();}};
    tabAdvancedPanels.add(view);refresh();return view;
  }
  function renderAdvancedFilters(){
    if(!advancedPanel)return;
    const active=globalThis.AdvancedFilters.activeCount(state.advanced);
    // An indirect comparison can have zero head-to-head reports. Intermediate
    // treatments remain available when choosing clinical filters for its network.
    const acrossTreatments=!!studyNetwork.pair && (active || state.advancedExpanded);
    const current=advancedEvidence(acrossTreatments?'network':'analysis');
    if(state.advancedExpanded&&!current.facets)current.facets=globalThis.AdvancedFilters.browseFacets(current.base,state.advanced,current.browseOptions);
    advancedPanel.update({facets:current.facets||[],summary:current.browseSummary,active,expanded:state.advancedExpanded,loading:state.loading,unavailable:!state.clinicalClassifications&&!state.loading});
    if(acrossTreatments && !state.loading)$('advanced-evidence-count').append(' across treatments');
  }
  function advancedChanged(key,value){
    state.advanced=key?globalThis.AdvancedFilters.normalizeSelections({...state.advanced,[key]:value}):globalThis.AdvancedFilters.resetSelections();
    try{localStorage.setItem('metaMelanomaTrials.advanced-filters.v1',JSON.stringify({schema_version:1,selections:state.advanced}));}catch{/* Session selections stay active. */}
    invalidateAdvancedEvidence();refreshTabAdvancedPanels();renderAnalysis();renderSummary();renderMatrix();renderPlanning();syncTreatmentMapAdvanced();
  }
  async function updateClinicalClassifications(){
    let artifact=null;try{artifact=await fetchJson('./data/clinical_classifications.json');if(artifact.schema_version!==1||!artifact.classification_version)artifact=null;}catch{/* Missing data must not widen an active filter. */}
    const changed=(state.clinicalClassifications?.content_sha256||'')!==(artifact?.content_sha256||'');
    state.clinicalClassifications=artifact;if(changed){invalidateAdvancedEvidence();refreshTabAdvancedPanels();syncTreatmentMapAdvanced();}return changed;
  }
  function advancedSavedMatches(row,prefix='analysis'){
    const linked=row.analysis_id?savedAnalyses().find(analysis=>String(analysis.id||analysis.analysis_id)===String(row.analysis_id)):null;
    if(!currentTreatmentAnalysis(row)&&!linked)return false;
    if(!globalThis.AdvancedFilters.activeCount(state.advanced))return true;
    const current=advancedEvidence(prefix);
    const scope=row.advanced_filter_scope||linked?.advanced_filter_scope;
    const ids=new Set(scope?.result_ids||list(row.studies||linked?.studies).flatMap(study=>study.result_ids||[study.result_id]).filter(Boolean));
    if(!ids.size)return false;
    const matches=current.matches.map(match=>({...match,results:match.results.filter(result=>ids.has(result.result_id))})).filter(match=>match.results.length);
    return globalThis.AdvancedFilters.savedAnalysisMatches({...row,advanced_filter_scope:scope},matches,state.advanced,current.options);
  }
  function advancedChartMessage(prefix='analysis'){
    if(!globalThis.AdvancedFilters.activeCount(state.advanced))return null;
    const current=advancedEvidence(prefix);
    return !current.summary.sufficient?'Insufficient studies for this selection.':'No validated analysis is saved for this filtered population.';
  }
  function drugLabel(id) { return state.drugLabels?.get(id) || human(id); }
  function refreshTreatmentLabels() {
    const payload = state.baseScopedPayload || {}, labels = new Map();
    for (const catalog of [payload.drugs || payload.drug_catalog || [], payload.intervention_catalog || []]) {
      if (Array.isArray(catalog)) for (const row of catalog) labels.set(row.id || row.drug_id, row.label || row.generic_name || human(row.id || row.drug_id));
      else for (const [id,row] of Object.entries(catalog)) labels.set(id, typeof row === 'string' ? row : row.label || row.generic_name || human(id));
    }
    for(const product of globalThis.TreatmentResolver.registry.products)labels.set(product.id,product.label);
    const reported = new Map();
    for (const study of state.scopedStudies) for (const comparison of charts.studyComparisons(study,{registry:state.scopedPayload?.evidence_registry||{}})) {
      const ids = charts.additionalInterestIds(comparison), label = charts.quantitativeText(comparison.additional_intervention_label);
      // The clinical export binds one complete reported regimen to one opaque ID.
      // Multi-ID records retain each component's own catalog label.
      if (ids.length !== 1 || !ids[0].startsWith('reported-arm-') || !label) continue;
      if (!reported.has(ids[0])) reported.set(ids[0], new Set());
      reported.get(ids[0]).add(label);
    }
    for (const [id,names] of reported) if (!labels.has(id) && names.size === 1) labels.set(id, [...names][0]);
    state.drugLabels = labels;
  }
  function comparatorLabel(comparison) {
    return charts.comparatorDisplayLabel(comparison, drugLabel);
  }
  const studyNetwork={catalog:null,graph:null,signature:null,revision:0,pair:null,endpoint:'',target:''};
  function studyNetworkPublications() {
    if(studyNetwork.publicationSource!==state.scopedStudies){
      studyNetwork.publications=new Map(state.scopedStudies.map(study=>[String(study.pmid),study]));
      studyNetwork.publicationSource=state.scopedStudies;
    }
    return studyNetwork.publications;
  }
  function refreshStudyChoices(changed = '') {
    const raw=['comparator','intervention'].map(role=>$('analysis-'+role).value);
    const selection=mainSelection(),catalog=studyNetwork.catalog;
    const choices = charts.constrainStudyChoices(state.scopedStudies, selection, changed);
    const exact=raw.map(value=>catalog?.labels.has(value));
    const keys=choices.selection.comparator && choices.selection.intervention && !exact.every(Boolean)
      ? charts.exactBrowsePair(choices.comparisons,choices.selection) : null;
    const pair=exact.every(Boolean)?raw:keys?.map(key=>catalog?.ids.get(key));
    studyNetwork.pair=pair?.every(Boolean)?pair:null;
    const labels = charts.comparatorGroupLabels(choices.comparisons, drugLabel);
    groupedOptions('analysis-comparator', choices.comparator_options.map(row=>({...row,label:labels.get(row.value)||row.label})), 'All comparators','comparator');
    groupedOptions('analysis-intervention', choices.intervention_options, 'All interventions','intervention');
    $('analysis-comparator').value = exact[0]?raw[0]:choices.selection.comparator || '';
    const intervention = choices.selection.intervention || '';
    const legacy=!exact[1]&&intervention&&!intervention.startsWith('treatment-class:')&&!intervention.startsWith('intervention:')?choices.comparisons.find((row)=>charts.additionalInterestIds(row).includes(intervention)):null;
    $('analysis-intervention').value = exact[1]?raw[1]:legacy?charts.interventionPresentation(legacy,state.drugLabels).key:intervention;
    $('analysis-comparator').disabled = !catalog?.choices.length && !choices.comparator_keys.length;
    $('analysis-intervention').disabled = !catalog?.choices.length && !choices.intervention_entries.length;
    for(const id of ['analysis-comparator','analysis-intervention'])globalThis.TreatmentPicker?.enhance($(id))?.sync();
  }
  function studyNetworkChoice(id,caption,options,selected) {
    if(options.length<2)return '';
    return `<label for="${id}">${escape(caption)}</label> <select id="${id}">${options.map(o=>
      `<option value="${escape(o.id)}"${o.id===selected?' selected':''}>${escape(o.label)}</option>`).join('')}</select>`;
  }
  function studyNetworkSources(pmids) {
    return [...new Set(pmids || [])].filter(pmid=>pubmedLink(pmid)).map(pmid=>external(pubmedLink(pmid),'PMID '+pmid)).join(' · ');
  }
  function studyNetworkControls(network,endpoints,endpoint) {
    return studyNetworkChoice('study-network-outcome','Network outcome',endpoints.map(o=>({id:o.key,label:o.label})),endpoint.key)+
      studyNetworkChoice('study-network-target','Outcome definition / time point',network.targets,network.target);
  }
  function bindStudyNetworkControls() {
    for(const [id,key] of [['study-network-outcome','endpoint'],['study-network-target','target']]){
      $(id)?.addEventListener('change',event=>{
        studyNetwork[key]=event.target.value;
        if(key==='endpoint')studyNetwork.target='';
        renderStudyIndirect();
      });
    }
  }
  function studyNetworkInterval(fit) {
    const format=value=>globalThis.ConfidenceIntervals.formatEffectNumber(value);
    return `${format(fit.estimate)} (95% CI ${format(fit.ci_lower)}–${format(fit.ci_upper)})`;
  }
  function studyNetworkDiagnostics(pair,fit) {
    const format=value=>globalThis.ConfidenceIntervals.formatEffectNumber(value);
    const diagnostics=[fit?.diagnostics?.heterogeneity,fit?.diagnostics?.inconsistency].filter(Boolean).map(d=>
      '<p>'+escape(d.label)+' · '+(d.available?'Q = '+format(d.Q)+', df = '+d.df+', p '+(d.p<.001?'&lt; 0.001':'= '+format(d.p)):escape(d.reason))+'</p>').join('');
    const settings=pair.settings.length?'<p>Clinical settings · '+escape(pair.settings.join(', '))+'</p>':'';
    const observational=(state.trialsOnly?[]:pair.observational).map(row=>{
      const ci=row.ci_lower>0&&row.ci_upper>0?` (95% CI ${format(row.ci_lower)}–${format(row.ci_upper)})`:' (95% CI unavailable)';
      return `<li>${escape(row.label)} · ${escape(row.measure)} ${format(row.estimate)}${ci} ${studyNetworkSources([row.pmid])}</li>`;
    });
    const observationalDetails=observational.length?`<details><summary>Direct observational evidence</summary><ul>${observational.join('')}</ul></details>`:'';
    if(fit?.method==='pathway-weighted')return observationalDetails;
    return `<details><summary>Network diagnostics</summary>${settings}
      <p>The analysis assumes comparable distributions of treatment-effect modifiers across trials.</p>
      ${diagnostics}${fit?.model==='random'&&Number.isFinite(fit.tau2)?'<p>Between-trial variance (τ²) · '+format(fit.tau2)+'</p>':''}
      ${pair.holds.map(reason=>'<p>'+escape(reason)+'</p>').join('')}</details>
      ${observationalDetails}`;
  }
  function studyNetworkOutcomeLabel(endpoint,network) {
    const parts=endpoint.label.split(' · ').filter(label=>label!==endpoint.measure);
    if(network.target!=='overall')parts.push(...network.targetLabel.split(' · '));
    return [...new Set(parts)].join(' · ');
  }
  const pathwayChoices=new Map();
  function studyPathwaySelection(result,first,second,model) {
    const key=JSON.stringify([treatmentMapContent,[first,second].sort(),result.endpoint.key,result.network.target,state.advanced]);
    const options={network:result.network,pair:result.pair,first,second,measure:result.endpoint.measure,model,
      fullFit:result.fit,excluded:pathwayChoices.get(key)||new Set()};
    return {
      current:globalThis.TreatmentNetworkPathways.fitSelection(options),
      mount(host,update){
        globalThis.TreatmentNetworkPathways.mount(host,{...options,publications:studyNetworkPublications(),onSelectionChange(chosen){
          if(chosen.excluded.size)pathwayChoices.set(key,chosen.excluded);else pathwayChoices.delete(key);
          update(chosen);
        }});
      }
    };
  }
  function studyPlanText(fit,pair,first,second,measure,describe=false) {
    if(!fit?.available)return '—';
    const api=globalThis.TreatmentMapPlanning;
    const plan=fit.defaultPlan && api.defaultIndirectSettings(state.settings)?fit.defaultPlan:
      api.indirect({estimate:fit.estimate,measure,first,second,comparisons:pair.comparisons,settings:state.settings});
    return '<span class="indirect-plan" title="'+escape(plan.detail)+'">'+escape(describe?api.describeIndirectPlan(plan,state.settings):plan.label)+'</span>';
  }
  function studyEstimateText(fit) {
    return fit?.available?studyNetworkInterval(fit):escape(fit?.reason||'Estimate unavailable');
  }
  function showStudyPathwayMethod(host,selection,first,second,measure) {
    const {fit,referenceFit}=selection;
    if(fit?.method!=='pathway-weighted' || !fit.available){host.replaceChildren();return;}
    const open=host.querySelector('details')?.open;
    const reference=referenceFit?.available
      ? '<p>All pathways, same weighting · '+escape(measure)+' '+studyNetworkInterval(referenceFit)+' · '+
        studyPlanText(referenceFit,{comparisons:selection.referenceComparisons},first,second,measure,true)+'</p>' : '';
    host.innerHTML='<details'+(open?' open':'')+'><summary>Pathway weighting</summary><p>'+escape(globalThis.TreatmentNetworkPathways.weightingNote(fit))+'</p>'+reference+'</details>';
  }
  function studyPathwayCaption(selection) {
    const label=globalThis.TreatmentNetworkPathways.selectionLabel(selection);
    return label?'<small class="study-pathway-caption">'+escape(label)+'</small>':'';
  }
  function studyOutcomeEstimate(selection) {
    const name=selection.fit?.method==='pathway-weighted' && selection.fit.available
      ? '<small class="study-pathway-caption">Pathway-weighted sensitivity estimate</small>' : '';
    return name+studyEstimateText(selection.fit)+studyPathwayCaption(selection);
  }
  async function studyNetworkOverview(panel,heading,scope,endpoints,first,second,model,current) {
    const modelLabel=model==='random'?'Random-effects (REML)':'Common-effect';
    const {power,alpha}=globalThis.TreatmentMapPlanning.indirectSettings(state.settings);
    panel.innerHTML=heading+`<p>Full network model · ${modelLabel}</p><p data-study-progress>Checking available outcomes…</p>
      <div class="table-scroll" hidden><table class="study-indirect-outcomes compact-extraction-table"><thead><tr>
      <th scope="col">Outcome</th><th scope="col">Measure</th><th scope="col">Indirect estimate (95% CI)</th>
      <th scope="col" class="study-planning-heading">Events or participants needed to detect the estimated effect
      <small>${Math.round(power*100)}% power · α=${alpha}</small></th><th scope="col">Randomized trials in network</th><th scope="col">Evidence</th></tr></thead><tbody></tbody></table></div>`;
    const body=panel.querySelector('tbody'),progress=panel.querySelector('[data-study-progress]');
    let count=0;
    for await(const result of globalThis.StudyIndirect.estimableOutcomes(scope,endpoints,first,second,model,lookupNetworkFit,current)) {
      if(!current())return;
      const label=studyNetworkOutcomeLabel(result.endpoint,result.network);
      const id='study-indirect-evidence-'+(++count);
      const choice=studyPathwaySelection(result,first,second,model),selected=choice.current;
      body.insertAdjacentHTML('beforeend',`<tr class="study-indirect-outcome"><th scope="row">${escape(label)}</th>
        <td>${escape(result.endpoint.measure)}</td><td aria-live="polite">${studyOutcomeEstimate(selected)}</td><td>${studyPlanText(selected.fit,selected.pair,first,second,result.endpoint.measure)}</td><td>${selected.pair.trials.length}</td>
        <td><button type="button" class="text-button" aria-expanded="false" aria-controls="${id}">Pathways</button></td></tr>
        <tr class="study-indirect-evidence" id="${id}" hidden><td colspan="6"></td></tr>`);
      const detail=body.lastElementChild,button=detail.previousElementSibling.querySelector('button');
      button.setAttribute('aria-label','Pathways for '+label+' ('+result.endpoint.measure+')');
      button.addEventListener('click',()=>{
        detail.hidden=!detail.hidden;
        button.setAttribute('aria-expanded',String(!detail.hidden));
        if(!detail.hidden && !detail.cells[0].firstChild){
          detail.cells[0].innerHTML='<div data-weighting></div><div data-study-pathways></div><div data-diagnostics></div>';
          const update=selection=>{
            const {fit,pair}=selection;
            const cells=detail.previousElementSibling.cells;
            cells[2].innerHTML=studyOutcomeEstimate(selection);
            cells[3].innerHTML=studyPlanText(fit,pair,first,second,result.endpoint.measure);
            cells[4].textContent=pair.trials.length;
            showStudyPathwayMethod(detail.querySelector('[data-weighting]'),selection,first,second,result.endpoint.measure);
            detail.querySelector('[data-diagnostics]').innerHTML=studyNetworkDiagnostics(pair,fit);
          };
          update(selected);
          choice.mount(detail.querySelector('[data-study-pathways]'),update);
        }
      });
      body.closest('.table-scroll').hidden=false;
      panel.dataset.estimate='indirect';
    }
    if(!current())return;
    if(count)progress.remove();
    else progress.textContent='No indirect estimate is available for these treatments and filters.';
  }
  async function renderStudyIndirect() {
    const panel=$('study-indirect-result'),api=globalThis.StudyIndirect;
    if(!panel || !api)return;
    const family=$('analysis-endpoint').value;
    const open=!$('analysis-form').hidden && state.currentView==='analysis';
    const preview=state.studyPreview?.hydrating && state.studyPreview.exactPair && !globalThis.AdvancedFilters.activeCount(state.advanced)
      ? state.studyPreview.data : null;
    const signature=JSON.stringify([open,family,studyNetwork.pair,studyNetwork.endpoint,studyNetwork.target,
      state.advancedEpoch,state.trialsOnly,state.settings,treatmentMapEpoch,treatmentMapContent,state.loading]);
    if(signature===studyNetwork.signature)return;
    studyNetwork.signature=signature;
    const revision=++studyNetwork.revision;
    panel.hidden=!open || !studyNetwork.pair;
    panel.replaceChildren();
    delete panel.dataset.estimate;
    if(!open || state.loading && !preview)return;
    if(!panel.hidden)panel.textContent='Loading randomized comparisons…';
    try {
      if(!treatmentMapGraph)await loadTreatmentMap();
      if(revision!==studyNetwork.revision)return;
      const samePreview=preview && treatmentMapGraph?.content_sha256===preview.graph && treatmentMapGraph?.metadata?.source_file_sha256===preview.source;
      if(!treatmentMapGraph || !(samePreview || mapMatchesTreatments(treatmentMapGraph,state.treatmentNormalizations)))
        throw new Error('The network and study data could not be loaded from the same saved update.');
      const graph=Array.isArray(treatmentMapGraph.network_direct_evidence)?treatmentMapGraph:await fullTreatmentMap(treatmentMapGraph.content_sha256);
      if(revision!==studyNetwork.revision)return;
      if(studyNetwork.graph!==graph) {
        studyNetwork.catalog=api.catalogue(graph,charts.regimenDescription);
        studyNetwork.graph=graph;
        if(!samePreview){refreshStudyChoices();studyNetwork.signature=null;renderStudies(false);return;}
      }
      if(!studyNetwork.pair)return;
      const catalog=studyNetwork.catalog,[comparator,intervention]=studyNetwork.pair;
      const endpoints=api.endpointChoices(graph,family,charts.endpointLabel(family));
      const title=`<h3 class="study-indirect-heading">${escape(catalog.labels.get(intervention))} versus ${escape(catalog.labels.get(comparator))}</h3>`;
      if(!endpoints.length) {
        panel.innerHTML=title+'<p>No compatible network outcome is available for this endpoint.</p>';return;
      }
      const model=state.settings.network_model==='random'?'random':'common', selections=state.advanced;
      const filterActive=globalThis.AdvancedFilters.activeCount(selections)>0;
      if(studyNetwork.scope?.graph!==graph || studyNetwork.scopeEpoch!==state.advancedEpoch){
        let advanced={active:false};
        if(filterActive){
          const options=clinicalFilterOptions(), keys=Object.keys(selections).filter(key=>selections[key]!=='all');
          if(!options.classifications || options.classifications.clinical_content_sha256!==graph.metadata.clinical_content_sha256)
            throw new Error('Clinical classifications are unavailable for the selected filters.');
          advanced={active:true,selections,matches:networkFilterMatches([...graph.comparisons,...list(graph.network_direct_evidence)],selections,options,keys)};
        }
        studyNetwork.scope=api.analysisScope(graph,advanced);
        studyNetwork.scopeEpoch=state.advancedEpoch;
      }
      const filterLabels=globalThis.AdvancedFilters.definitions.filter(field=>selections[field.key] && selections[field.key]!=='all').map(field=>field.choices.find(choice=>choice.value===selections[field.key])?.label || selections[field.key]);
      if(!family){
        const filters=filterLabels.length?'<p class="muted">'+filterLabels.map(escape).join(' · ')+'</p>':'';
        await studyNetworkOverview(panel,title+filters,studyNetwork.scope,endpoints,intervention,comparator,model,()=>revision===studyNetwork.revision);
        return;
      }
      const endpoint=endpoints.find(o=>o.key===studyNetwork.endpoint)||endpoints[0];
      const network=studyNetwork.scope.networkFor(endpoint.key,studyNetwork.target);
      const heading=title+`<p class="muted">${[studyNetworkOutcomeLabel(endpoint,network),...filterLabels].map(escape).join(' · ')}</p>`+
        studyNetworkControls(network,endpoints,endpoint);
      panel.innerHTML=heading+'<p>Calculating indirect estimate…</p>';bindStudyNetworkControls();
      const {pair,fit}=await api.calculate(graph,network,intervention,comparator,model,{active:filterActive},lookupNetworkFit);
      if(revision!==studyNetwork.revision)return;
      if(!pair.eligible) {
        const source=studyNetworkSources(pair.sourcePmids);
        panel.innerHTML=heading+`<p>${escape(pair.reason)}${source?' '+source:''}</p>`;
      } else if(!fit?.available) {
        panel.innerHTML=heading+'<strong>Indirect estimate unavailable</strong><p>'+escape(fit?.reason)+'</p>'+studyNetworkDiagnostics(pair,fit);
      } else {
        const modelLabel=model==='random'?'Random-effects (REML)':'Common-effect';
        panel.dataset.estimate='indirect';
        const choice=studyPathwaySelection({network,pair,fit,endpoint},intervention,comparator,model);
        panel.innerHTML=heading+'<strong class="study-indirect-effect" aria-live="polite"></strong><p data-model></p><div data-weighting></div><div data-study-pathways></div><div data-diagnostics></div>';
        const update=selection=>{
          const {fit,pair}=selection;
          const weighted=fit.method==='pathway-weighted';
          const label=weighted?'Pathway-weighted sensitivity estimate':'Indirect estimate';
          panel.querySelector('.study-indirect-effect').innerHTML=(fit.available?label+' · '+escape(endpoint.measure)+' ':'')+studyEstimateText(fit)+
            (fit.available?' · '+studyPlanText(fit,pair,intervention,comparator,endpoint.measure,true):'')+studyPathwayCaption(selection);
          panel.querySelector('[data-model]').textContent=(fit.available && !weighted?modelLabel+' network meta-analysis · ':'')+pair.trials.length+' randomized trials';
          showStudyPathwayMethod(panel.querySelector('[data-weighting]'),selection,intervention,comparator,endpoint.measure);
          panel.querySelector('[data-diagnostics]').innerHTML=studyNetworkDiagnostics(pair,fit);
        };
        update(choice.current);
        choice.mount(panel.querySelector('[data-study-pathways]'),update);
      }
      bindStudyNetworkControls();
    } catch(error) {
      if(revision!==studyNetwork.revision)return;
      panel.hidden=false;
      panel.innerHTML=`<p>${escape(error.message || 'Network evidence could not be loaded.')} <button type="button" id="retry-study-network" class="text-button">Retry</button></p>`;
      $('retry-study-network').addEventListener('click',()=>{studyNetwork.signature=null;renderStudyIndirect();});
    }
  }
  function scopedResult(row, study) {
    const registry = state.scopedPayload?.evidence_registry || study.details?.evidence_registry || {};
    const context=globalThis.MelanomaScope.contextFor(study,{evidenceRegistry:registry});
    const samples = row.numeric_completion_v6_no_endpoint_N_inference === true ? [] : (study.details?.sample_size_records || study.details?.reported_counts || []).filter(sample=>globalThis.MelanomaScope.sampleEligible(sample,{study,context}));
    return { ...row, report_samples: samples, evidence_registry: registry };
  }
  function resultEndpoint(row) { return charts.tableEndpoint(row); }
  function resultValue(row) { return escape(charts.tableValue(row)); }
  function studyTableCells(match) {
    if(match.study.quantitative_only||match.exact_membership_fallback){
      const data=match.prepared_view||charts.studyTablePresentation(match,{registry:state.scopedPayload?.evidence_registry||{},phase_partition:match.phase_partition,presentation_cutoff:match.presentation_cutoff});
      const line=(label,value,note)=>`<div class="scoped-result compact-result">${label?`<span title="${escape(label)}">${escape(label)}</span>`:''}<div${note?` tabindex="0" title="${escape(note)}" aria-label="${escape(value+'. '+note)}"`:''}>${escape(value)}</div></div>`;
      const details=match.study.report_id?`<button class="text-button outcome-details-link" data-open="${escape(match.study.report_id)}" data-detail-section="other-outcomes">Details</button>`:external(pubmedLink(match.study.pmid),'Source');
      const effect=data.effects.slice(0,3).map(row=>row.value==='NA'?details:row.review_needed?line(row.label,row.value)+`<button class="text-button outcome-details-link" data-open="${escape(match.study.report_id)}" data-detail-section="outcome-choices">Review alternatives</button>`:line(row.label,row.value)).join('')||details,remaining=data.effects.length-3;
      return {sample_size:data.samples.map(row=>line(row.label,`N=${row.sample_size}${row.breakdown?' ('+row.breakdown+')':''}`,row.denominator_note)).join('')||'—',effect:effect+(remaining>0?`<button class="text-button scoped-more" data-open="${escape(match.study.report_id)}">+${number.format(remaining)} results · details</button>`:''),context:data.context,group:data.group};
    }
    const data=charts.studyTableData(match,{registry:state.scopedPayload?.evidence_registry||{},limit:3});
    const line=(label,value)=>`<div class="scoped-result"><span title="${escape(label)}">${escape(label)}</span><div>${escape(value)}</div></div>`;
    const details=match.study.report_id?`<button class="text-button outcome-details-link" data-open="${escape(match.study.report_id)}" data-detail-section="other-outcomes">Details</button>`:external(pubmedLink(match.study.pmid),'Source');
    const effect=data.entries.map(row=>row.effect==='NA'?details:line(row.label,row.effect)).join('');
    const known=data.entries.some(row=>row.sample_size!=='NA');
    const samples=(known?data.entries.map(row=>line(row.label,`N=${row.sample_size}`)).join(''):data.counts.map(row=>line(row.label,`N=${row.sample_size}`)).join(''))+
      (data.treated?line(data.treated.label,`N=${data.treated.sample_size}`):'');
    const more=(n,label)=>n>0?`<button class="text-button scoped-more" data-open="${escape(match.study.report_id)}">+${number.format(n)} ${label}</button>`:'';
    return {sample_size:(samples||'NA')+more(data.more_counts,'count records'),effect:(effect||details)+more(data.hidden_results,'results · details')};
  }
  function treatmentTag(label,addOn=false,definition=null){return charts.armTag(label,addOn,definition);}
  function armTreatmentTag(label,addOn,definition,n,prepared){return (prepared??treatmentTag(label,addOn,definition))+(Number.isInteger(n)&&n>=0?` <span class="treatment-arm-n">(N=${number.format(n)})</span>`:'');}
  function studyRowsHTML(rows,{include_missing_n=false,show_pmid=false,node_table=false,trialQuery=''}={}){
    return rows.map(match=>{
      const study=match.study,nonTrial=match.prepared_design??charts.studyDesignInfo(study).is_non_trial,abstractOnly=match.prepared_abstract??charts.abstractOnly(study),contrasts=match.presentation_rows||charts.studyTablePresentationRows(match,{registry:state.scopedPayload?.evidence_registry||{},labels:state.drugLabels,include_missing_n}),trial=match.prepared_trial||charts.studyTrialIdentifiers(study,{registry:state.scopedPayload?.evidence_registry||{}});
      const trialName = trialQuery.trim()
        ? globalThis.TrialSearch.displayName(charts.studyTrialSearchIndex(match, state.scopedPayload?.evidence_registry), trialQuery, trial.trial_label)
        : trial.trial_label;
      return contrasts.map((contrast,index)=>{
        const cells=studyTableCells({...match,...contrast}),settings=charts.advancedArmSettings(match,contrast),settingNote=label=>label?`<span class="treatment-setting-note">${escape(label)}</span>`:'';
        const title=study.report_id?`<button class="study-title" data-open="${escape(study.report_id)}">${escape(study.title)}${abstractOnly?'<sup class="abstract-only-mark" title="Results based on abstract only" aria-label="Abstract only">*</sup>':''}</button>`:external(pubmedLink(study.pmid),study.title);
        const related=node_table&&match.related_report_count>1?`<small class="tm-related-report">${match.related_report_count} reports for this study</small>`:'';
        const n=include_missing_n&&['NA','—',''].includes(cells.sample_size)?'Unavailable':cells.sample_size;
        return `<tr class="${index?'study-treatment-row':'study-start'}${nonTrial?' study-nontrial':''}" data-pmid="${escape(study.pmid||'')}">${index?'':`<td rowspan="${contrasts.length}">${title}${related}${(match.prepared_status??charts.articleStatusLabel(study))?`<small> ${escape(match.prepared_status??charts.articleStatusLabel(study))}</small>`:''}</td><td rowspan="${contrasts.length}">${escape(study.author_display||(study.first_author_surname?`${study.first_author_surname} et al.`:'—'))}</td><td rowspan="${contrasts.length}">${escape(study.year??'—')}</td>${show_pmid?`<td rowspan="${contrasts.length}">${study.pmid?external(pubmedLink(study.pmid),study.pmid):'—'}</td>`:''}<td rowspan="${contrasts.length}">${escape(trialName)}</td><td rowspan="${contrasts.length}" class="study-nct-cell">${escape(trial.nct_label)}</td>`}<td class="study-group-cell">${escape(cells.group||'—')}</td><td>${armTreatmentTag(contrast.comparator_label,false,contrast.comparator_definition,contrast.comparator_n,contrast.prepared_arms?.[0])}${settingNote(settings.comparator)}</td><td>${armTreatmentTag(contrast.intervention_label,contrast.is_add_on,contrast.intervention_definition,contrast.intervention_n,contrast.prepared_arms?.[1])}${settingNote(settings.intervention)}</td><td>${n}</td><td class="study-effect-cell">${cells.effect}</td></tr>`;
      }).join('');
    }).join('');
  }
  function renderStudies(resetPage = true, tableOnly = false) {
    if (!$('scoped-studies-rows')) return;
    const prepared=state.studyPreview?.active && !state.studyPreview.hydrating ? state.studyPreview.data : null;
    if(!prepared && !tableOnly){renderStudyIndirect();renderAdvancedFilters();}
    const current=prepared?null:advancedEvidence(),loading=state.loading&&!prepared;
    const registry = state.scopedPayload?.evidence_registry;
    const visible = prepared ? prepared.rows : current.visibleMatches || charts.visibleStudyMatches(current.matches,{registry,labels:state.drugLabels});
    const rows = charts.sortStudyRows(charts.filterStudyTrials(visible, state.studyTrialQuery, registry), state.scopedSort || 'year', state.scopedOrder || 'desc');
    const size = 10, pages = Math.max(1, Math.ceil(rows.length / size));
    state.scopedPage = resetPage ? 1 : Math.max(1, Math.min(state.scopedPage || 1, pages));
    const start = (state.scopedPage - 1) * size;
    $('download-study-table').disabled=loading||!rows.length;
    if($('trial-only-toggle')){$('trial-only-toggle').disabled=loading;$('trial-only-toggle').setAttribute('aria-pressed',String(state.trialsOnly===true));}
    text('scoped-studies-count', loading ? '' : `${number.format(rows.length)} ${rows.length===1?'report':'reports'}`);
    $('scoped-studies-rows').innerHTML = loading ? '<tr><td colspan="10">Loading studies…</td></tr>' : studyRowsHTML(rows.slice(start,start+size),{trialQuery:state.studyTrialQuery}) || '<tr><td colspan="10">No studies match these selections.</td></tr>';
    text('scoped-studies-range', rows.length ? `${number.format(start+1)}–${number.format(Math.min(start+size,rows.length))} of ${number.format(rows.length)}` : '0 reports');
    text('scoped-studies-page', `Page ${state.scopedPage} of ${number.format(pages)}`);
    $('scoped-studies-previous').disabled = loading || state.scopedPage <= 1;
    $('scoped-studies-next').disabled = loading || state.scopedPage >= pages;
    for (const key of ['author','year']) {
      const selected = state.scopedSort === key, order = state.scopedOrder || 'desc';
      $(`scoped-${key}-heading`).setAttribute('aria-sort', selected ? (order === 'asc' ? 'ascending' : 'descending') : 'none');
      text(`scoped-sort-${key}`, `${key === 'author' ? 'First author' : 'Year'} ${selected ? (order === 'asc' ? '↑' : '↓') : '↕'}`);
    }
  }
  function downloadStudyTable() {
    const matches=charts.filterStudyTrials(advancedEvidence().matches,state.studyTrialQuery,state.scopedPayload?.evidence_registry);
    const rows=charts.sortStudyRows(matches,state.scopedSort||'year',state.scopedOrder||'desc');
    const csv=charts.studyTableCSV(rows,{registry:state.scopedPayload?.evidence_registry||{},labels:state.drugLabels});
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const link=document.createElement('a');link.href=url;link.download='metaMelanomaTrials-studies.csv';document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function renderMainArticles(resetPage = false) { renderStudies(resetPage); }
  function renderAnalysis(autoTab = false) {
    const matches = savedAnalyses().filter(row=>analysisMatch(row)&&advancedSavedMatches(row)), selector = $('analysis-comparison'), previous = selector.value;
    selector.innerHTML = '<option value="">Select a comparison</option>' + matches.map((row,index) => `<option value="${index}">${escape(comparisonLabel(row))}</option>`).join('');
    if (matches.length === 1) selector.value='0'; else if(previous!=='' && Number(previous)<matches.length) selector.value=previous;
    selector.disabled=!matches.length;$('analysis-comparison-field').hidden=matches.length<=1;
    const analysis=selector.value===''?null:matches[Number(selector.value)];state.selectedAnalysis=analysis;
    if(autoTab==='always'||(autoTab==='if-empty'&&!analysis))selectAnalysisTab(analysis?'forest':'articles');
    const measure=analysis?.effect_measure||selectedMeasure('analysis');
    const studies=analysis?list(analysis.studies).filter((row)=>row.validated===true&&charts.validEstimate(row,measure)):[];
    const pooled=analysis?.pooled?.validated===true&&charts.independentCount({...analysis,...analysis.pooled})>=2?{...analysis.pooled,pooling_model_label:charts.savedPoolingMetadata(analysis)?.label}:null;
    const empty=()=>emptyChart(advancedChartMessage()||undefined);
    $('forest-canvas').innerHTML=analysis?charts.forestSvg(studies,pooled,measure)||empty():empty();
    $('funnel-canvas').innerHTML=analysis?charts.funnelSvg(studies,measure)||empty():empty();
    text('egger-p',analysis?.bias?.egger_p??'—');
    $('sensitivity-canvas').innerHTML=analysis?charts.forestSvg(list(analysis.sensitivity).filter(row=>row.validated===true&&charts.savedPoolingMetadata(row)).map(row=>({...row,label:charts.savedPoolingMetadata(row).label+' · '+(row.label||row.omitted||'Leave-one-out estimate')})),null,measure)||empty():empty();
    renderStudies();
  }

  function renderSummary() {
    const analyses = savedAnalyses().filter((analysis) => selectedMatch(analysis, 'summary') && matchesSettings(analysis) && advancedSavedMatches(analysis,'summary') && analysis.pooled?.validated === true && charts.independentCount({ ...analysis, ...analysis.pooled }) >= 2 && charts.validEstimate(analysis.pooled, analysis.effect_measure));
    if (!analyses.length) { $('summary-canvas').innerHTML = emptyChart(advancedChartMessage('summary')||undefined); return; }
    const groups = new Map();
    for (const analysis of analyses) {
      const comparability = [analysis.disease_id, analysis.comparator_id || analysis.comparator_label, analysis.population_id || analysis.population_label, analysis.estimand, analysis.effect_model, analysis.data_cutoff || analysis.cutoff];
      const key = comparability.every((value) => value !== undefined && value !== null && value !== '') ? JSON.stringify(comparability) : JSON.stringify(['distinct-analysis', analysis.analysis_id || analysis.id || analyses.indexOf(analysis)]);
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(analysis);
    }
    $('summary-canvas').innerHTML = [...groups.values()].map((group) => {
      const first = group[0], rows = group.map((analysis) => ({ ...analysis.pooled, validated: true, label: `${charts.savedPoolingMetadata(analysis)?.label} · ${analysis.intervention_label || human(analysis.intervention_id)} · ${charts.independentCount({ ...analysis, ...analysis.pooled })} cohorts` }));
      const label = [state.diseases.get(first.disease_id) || human(first.disease_id), comparisonLabel(first, false)].filter(Boolean).join(' · ');
      return `<article class="panel summary-card"><div class="panel-heading"><h2>${escape(label)}</h2></div><div class="chart-stage">${charts.forestSvg(rows, null, first.effect_measure, 'Pooled effects across interventions', 'Intervention')}</div></article>`;
    }).join('');
  }
  function renderMatrix() {
    const endpoint = $('matrix-endpoint').value, measure = selectedMeasure('matrix');
    const points = state.analysis.validated === true ? list(state.analysis.matrix).filter((point) => charts.matrixEligible(point) && selectedMatch(point, 'matrix') && matchesSettings(point) && advancedSavedMatches(point,'matrix')) : [];
    state.matrixPoints = points;
    if (!points.length) { $('matrix-canvas').innerHTML = emptyChart(advancedChartMessage('matrix')||undefined); text('matrix-count', ''); return; }
    const interventions = new Map(), diseases = new Map(), lookup = new Map();
    points.forEach((point, index) => {
      interventions.set(point.intervention_id, point.intervention_label || human(point.intervention_id));
      diseases.set(point.disease_id, state.diseases.get(point.disease_id) || point.disease_label || human(point.disease_id));
      const key = JSON.stringify([point.intervention_id, point.disease_id]); if (!lookup.has(key)) lookup.set(key, []); lookup.get(key).push(index);
    });
    const columns = [...diseases].sort((a, b) => a[1].localeCompare(b[1]));
    const rows = [...interventions].sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => `<tr><th scope="row">${escape(label)}</th>${columns.map(([diseaseId]) => {
      const indexes = lookup.get(JSON.stringify([id, diseaseId])) || [];
      if (!indexes.length) return '<td class="matrix-no-result" aria-label="No result">—</td>';
      if (indexes.length > 1) return `<td><button class="text-button" data-matrix-group="${indexes.join(',')}">${indexes.length} comparisons</button></td>`;
      const index = indexes[0], point = points[index], n = charts.independentCount(point), color = charts.colors[charts.direction(point)], effect = point.effect ?? point.estimate;
      const description = `${label}; ${diseases.get(diseaseId)}; ${currentPoolingMetadata(point)?.label}; ${measure} ${effect} (CI ${point.ci_low}–${point.ci_high}); ${n} independent cohorts.`;
      return `<td><button class="result-dot" data-matrix-group="${index}" style="--dot:${color};--diameter:${2 * charts.dotRadius(n)}px" title="${escape(description)}" aria-label="${escape(description)}"></button></td>`;
    }).join('')}</tr>`);
    $('matrix-canvas').innerHTML = `<table class="matrix-table"><caption class="sr-only">${escape(charts.endpointLabel(endpoint))}: interventions by disease</caption><thead><tr><th class="matrix-corner" scope="col">Intervention</th>${columns.map(([, label]) => `<th scope="col">${escape(label)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
    text('matrix-count', `${interventions.size} interventions · ${diseases.size} diseases`);
  }
  function showMatrixDetails(indices) {
    const points = indices.map((index) => state.matrixPoints[index]).filter(Boolean); if (!points.length) return;
    state.activeReport = null;
    $('drawer-content').innerHTML = `<div class="drawer-heading"><h2 id="drawer-title">${escape(points[0].intervention_label || human(points[0].intervention_id))}</h2><p>${escape(state.diseases.get(points[0].disease_id) || human(points[0].disease_id))}</p></div>` + points.map((point) => `<div class="drawer-section"><h3>${escape(charts.endpointLabel(point.endpoint))} · ${escape(point.effect_measure)}</h3><p><strong>${escape(point.effect ?? point.estimate)} (CI ${escape(point.ci_low)}–${escape(point.ci_high)})</strong></p><p>${escape(currentPoolingMetadata(point)?.label)} · ${charts.independentCount(point)} independent cohorts</p><ul class="reason-list"><li>Comparator: ${escape(point.comparator_label || point.comparator_id || 'Not specified')}</li><li>Population: ${escape(point.population_id || 'Not specified')}</li><li>Estimand / model: ${escape(point.estimand || 'Not specified')} / ${escape(point.effect_model || point.model || 'Not specified')}</li><li>Data cutoff: ${escape(point.data_cutoff || point.cutoff || 'Not specified')}</li></ul></div>`).join('');
    $('study-dialog').showModal();
  }
  function renderPlanning() {
    const endpoint = $('planning-endpoint').value, measure = selectedMeasure('planning');
    const type = measure === 'HR' ? 'survival' : charts.endpointKind(endpoint, endpointMetadata(endpoint));
    $('planning-followup-field').hidden = type !== 'survival';
    $('planning-baseline').disabled = !['survival', 'binary'].includes(type);
    const assumptions = { allocation_ratio: state.settings.allocation_ratio, sidedness: state.settings.sidedness, power: state.settings.power, alpha: state.settings.alpha };
    if ($('planning-baseline').value) assumptions.baseline_probability = Number($('planning-baseline').value);
    if (type === 'survival' && $('planning-followup').value) assumptions.followup_months = Number($('planning-followup').value);
    const points = state.analysis.validated === true && $('planning-baseline').value ? list(state.analysis.sample_size).filter((point) => point.validated === true && point.method && point.parameters && selectedMatch(point, 'planning') && matchesSettings(point) && advancedSavedMatches(point,'planning') && point.endpoint_type === type && (type !== 'survival' || $('planning-followup').value) && Object.entries(assumptions).every(([key, value]) => typeof point.parameters[key] === 'number' && Math.abs(point.parameters[key] - value) < 1e-10)) : [];
    text('sample-axis-note', measure ? `x: log ${measure} · y: log₁₀ total sample size` : '');
    $('sample-canvas').innerHTML = charts.sampleSizeSvg(points.map(point=>({...point,pooling_model_label:currentPoolingMetadata(point)?.label})), measure) || emptyChart(advancedChartMessage('planning')||undefined);
  }
  function renderPrisma() {
    if(state.quantitativeSnapshot?.mode==='pilot'){
      const progress=state.quantitativeSnapshot.about_progress?.stages?.R2,scope=state.quantitativeSnapshot.scope_pmids.length;
      if(!progress){$('prisma-canvas').innerHTML=emptyChart('Study selection is being prepared.');return;}
      const box=(label,value)=>`<div class="prisma-box"><span>${escape(label)}</span><strong>${escape(number.format(value))}</strong></div>`;
      const r3=state.quantitativeSnapshot.about_progress?.stages?.R3;
      const fulltext=r3?`<div class="prisma-arrow" aria-hidden="true">↓</div>${box('Entered R3',r3.entered)}${box('R3 eligibility screening finished',r3.screening_finished)}<div class="prisma-inputs">${box('Retained',r3.retained)}${box('Excluded',r3.excluded)}${box('Remain unclear',r3.unclear)}</div>`:'';
      $('prisma-canvas').innerHTML=`<div class="dedicated-prisma" role="group" aria-label="Article selection">${box('Articles in scope',scope)}<div class="prisma-arrow" aria-hidden="true">↓</div>${box('R2 screening finished',progress.screening_finished)}<div class="prisma-inputs">${box('Retained',progress.retained)}${box('Excluded',progress.excluded)}${box('Remain unclear',progress.unclear)}</div>${fulltext}</div>`;return;
    }
    const p=state.summary.prisma;
    if(!p||!Number.isInteger(p.authorized_cohort)||p.authorized_cohort<0){$('prisma-canvas').innerHTML=emptyChart('Dedicated report flow is being prepared.');return;}
    const current=p.current_R2||{},additional=p.additional_new_R2||{};
    const valid=(n)=>typeof n==='number'&&Number.isInteger(n)&&n>=0;
    const value=(n)=>valid(n)?number.format(n):'Pending';
    const box=(label,n,extra='')=>`<div class="prisma-box${valid(n)?'':' pending'}"><span>${escape(label)}</span><strong>${escape(value(n))}</strong>${extra?`<small>${escape(extra)}</small>`:''}</div>`;
    const arrow='<div class="prisma-arrow" aria-hidden="true">↓</div>';
    const incoming=p.additional_R1_uncertain;
    const fullTextScope=p.full_article_scope==='legacy285'?'Availability in the historical 285-report source index; not the whole 821-report cohort.':p.full_article_scope||'Source-index scope not reported.';
    const availabilityNote=fullTextScope+(p.full_article_availability_review_complete===false?' Coverage of the full cohort is not yet complete.':'');
    const final=p.final_inclusion_complete===true?p.final_included_reports:null;
    const partial=valid(p.R3_source_checked_reports_any_fragment)&&p.R3_source_checked_reports_any_fragment>0?(p.pipeline==='sequential_Sol_R2_then_Luna_R3'?`Source-checked material in ${value(p.R3_source_checked_reports_any_fragment)} reports; full-report completion is counted separately.`:`Partial source-checked evidence in this project: ${value(p.R3_source_checked_reports_any_fragment)} reports. This is not full-report assessment.`):'';
    if(p.pipeline==='sequential_Sol_R2_then_Luna_R3'){
      const extraction=p.R2_extraction||{};
      $('prisma-canvas').innerHTML=`<div class="dedicated-prisma" role="group" aria-label="Sol R2 to Luna R3 report selection flow"><div class="prisma-inputs">${box('Historical R2-retained candidates',p.legacy_R2_retained_candidates)}<span class="prisma-plus" aria-hidden="true">+</span>${box('Additional R1-uncertain keyword matches',incoming)}</div><div class="prisma-input-merge" aria-hidden="true">↓</div>${box('Sol R2 · title and abstract screening',p.authorized_cohort)}<p class="prisma-cohort-note">Additional ${escape(value(additional.total))} records: Sol screened ${escape(value(additional.processed))}; retained ${escape(value(additional.retained))}; pending ${escape(value(additional.pending))}. Numerical extraction is separate: ${escape(value(extraction.source_checked))} source-checked; ${escape(value(extraction.quarantined))} quarantined.</p><div class="prisma-r2-routes"><div class="prisma-retained-route">${arrow}${box('Retained by Sol R2',current.retained)}${arrow}${box('Verified full text after Sol retention',p.full_article_available_after_Sol_retention,availabilityNote)}${arrow}${box('Luna R3 full-text reviews completed',p.R3_full_report_assessments_complete)}${partial?`<p>${escape(partial)}</p>`:''}${arrow}${box('Final eligible reports',final)}<p class="prisma-note">Clinical validation and pooling remain pending.</p></div><aside class="prisma-other-routes" aria-label="Sol R2 dispositions and source gaps">${box('Excluded by Sol R2',current.excluded)}${box('Uncertain after Sol R2',current.uncertain)}${box('Pending verified Sol screening',current.pending)}${box('Sol-retained reports awaiting full text',p.Sol_retained_waiting_fulltext)}</aside></div><p class="prisma-note">Counts refer to reports, not independent studies. Historical Luna R2 outputs and costs remain preserved separately. A screening decision does not validate a quarantined numerical extraction; partial Luna chunks do not complete R3.</p></div>`;
      return;
    }
    $('prisma-canvas').innerHTML=`<div class="dedicated-prisma" role="group" aria-label="Dedicated cutaneous melanoma report selection flow"><div class="prisma-inputs">${box('Historical R2-retained candidates',p.legacy_R2_retained_candidates)}<span class="prisma-plus" aria-hidden="true">+</span>${box('Additional R1-uncertain keyword matches',incoming)}</div><div class="prisma-input-merge" aria-hidden="true">↓</div>${box('Current R2 · title and abstract screening + extraction',p.authorized_cohort)}<p class="prisma-cohort-note">Additional ${escape(value(additional.total))} records: both reviewers source-checked ${escape(value(additional.both_reviewers_processed))}; retained by both ${escape(value(additional.both_retained))}; pending ${escape(value(additional.pending))}.</p><div class="prisma-r2-routes"><div class="prisma-retained-route">${arrow}${box('Retained by both · current review cycle',current.both_retained)}${arrow}${box('R3 full-report assessments completed',p.R3_full_report_assessments_complete)}<div class="prisma-source-context">${box('Full articles available in the source index',p.full_article_available_in_index,availabilityNote)}${partial?`<p>${escape(partial)}</p>`:''}</div>${arrow}${box('Final eligible reports',final)}<p class="prisma-note">R3-verified reports: ${escape(value(p.final_R3_verified_reports))}. ${p.final_inclusion_complete===true?'Final inclusion is explicitly completed.':'Final inclusion remains pending.'}</p></div><aside class="prisma-other-routes" aria-label="Other current R2 outcomes">${box('Excluded by both',current.both_excluded)}${box('Reviewer disagreement',current.disagreement)}${box('Uncertain after both reviews',current.both_uncertain)}${box('Pending source-checked review',current.pending)}</aside></div><p class="prisma-note">Counts refer to reports, not independent studies. Historical retention is preserved above. Quarantined or partial responses do not establish current R2 retention or completed R3 assessment.</p></div>`;
  }
  function selectAnalysisTab(name, focus = false, sourceRoute = null) {
    if (name === 'extracted' || name === 'studies') name = 'articles';
    if (!Object.hasOwn(evidenceTabs, name) && !['articles', 'treatment-map'].includes(name)) name = 'articles';
    $('analysis-form').hidden = name !== 'articles';
    if (state.currentView === 'analysis') document.title = $('tab-' + name).textContent.trim() + ' · metaMelanomaTrials';
    for (const button of document.querySelectorAll('[data-analysis-tab]')) {
      const selected = button.dataset.analysisTab === name;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      $(`analysis-${button.dataset.analysisTab}`).hidden = !selected;
      if (selected && focus) button.focus();
    }
    if(name==='treatment-map')loadTreatmentMap();
    else if (Object.hasOwn(evidenceTabs, name)) loadEvidenceTab(name);
    else openStudiesTab();
    const hash = sourceRoute ? '#' + sourceRoute : name === 'articles' ? '#analysis' : '#' + name;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function normalizeReports(payload) {
    const rows = Array.isArray(payload) ? payload : payload?.studies || payload?.reports || payload?.records;
    if (!Array.isArray(rows)) throw new Error('The retained-report export has an unsupported format.');
    const seen = new Set();
    return rows.filter((record) => {
      if (!record || typeof record !== 'object' || !record.report_id || seen.has(String(record.report_id))) return false;
      seen.add(String(record.report_id)); return true;
    }).map((record) => {
      const item = { ...record, report_id: String(record.report_id), title: String(record.title || 'Title not available'), cancer_ids: list(record.cancer_ids || record.disease_ids), priority_class: record.priority_class || 'review', report_type: record.report_type || 'not_specified' };
      item._labels = list(item.disease_labels).length ? item.disease_labels : item.cancer_ids.map((id) => state.diseases.get(id) || human(id));
      item._search = `${item.title} ${item.pmid || ''} ${item.doi || ''}`.normalize('NFKD').toLowerCase();
      return item;
    });
  }
  function toggleSave(id) {
    const previous = state.saved[id] || {};
    state.saved[id] = { ...previous, bookmarked: !previous.bookmarked };
    const stored = persistDeviceData();
    if (!stored) state.saved[id] = previous;
    renderStudies(false);
    if (state.activeReport === id) {
      for (const button of $('drawer-content').querySelectorAll('[data-save]')) {
        const saved = !!state.saved[id]?.bookmarked;
        button.setAttribute('aria-pressed', String(saved));
        button.innerHTML = icon('bookmark') + (saved ? 'Saved on this device' : 'Save on this device');
      }
    }
    if (stored) toast(state.saved[id].bookmarked ? 'Saved on this device. Screening decisions are unchanged.' : 'Removed from saved reports on this device.');
  }

  function scopedEvidence(row, study) {
    const registry=state.scopedPayload?.evidence_registry||study.details?.evidence_registry||{},ids=new Set();
    const visit=(value)=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object'){for(const id of value.evidence_ids||[])ids.add(id);for(const [key,item]of Object.entries(value))if(key!=='evidence_ids'&&key!=='evidence_registry')visit(item);}};
    visit(row);return [...ids].map((id)=>registry[id]).filter(Boolean);
  }
  function renderDetailValue(value) {
    if(value===null||value===undefined||value==='')return 'NA';
    if(Array.isArray(value))return value.map(renderDetailValue).join('; ')||'NA';
    if(typeof value==='object')return renderDetailValue(value.label??value.text??value.name??value.family??value.value??null);
    return escape(String(value));
  }
  function outcomeChoiceDetails(study){
    const registry=state.scopedPayload?.evidence_registry||{};
    const choices=charts.studyOutcomeChoices(study,{registry});
    if(!choices.length)return '';
    const meaningful=value=>value&&value!=='NA'?value:'';
    return `<section class="drawer-section" id="outcome-choices" tabindex="-1"><h3>Outcome choices</h3>${choices.map(choice=>{
      const rounded=choice.rounding_groups.some(group=>group.proofs.some(proof=>JSON.stringify(proof).includes('rounding')));
      const reason=choice.status==='review_needed'?'Review needed: the sources do not establish one preferred value.':choice.unresolved_display_flag?'The original extraction warning remains for review.':choice.proof?.kind==='latest_source_supported_analysis'?'Latest supported analysis shown.':choice.proof?.kind==='identical_display_value'?'The same displayed value is reported by these analyses; their original definitions remain distinct.':rounded?'Rounding differences consolidated; one original estimate and CI tuple is shown, retaining precision and available interval information.':choice.member_sources.length>1?'Equivalent source results consolidated.':'The original extraction warning remains for review.';
      const rows=choice.alternatives.map(item=>`<tr><td>${item.source===choice.selected_source?'Shown':'Alternative'}</td><td>${escape(item.value)}</td><td>${escape([meaningful(item.assessment),meaningful(item.criteria),meaningful(item.assessment_time),meaningful(item.model),meaningful(item.definition)].filter(Boolean).join(' · ')||'—')}</td><td>${escape([typeof item.numbers.numerator==='number'?'Events '+item.numbers.numerator:'',typeof item.numbers.denominator==='number'?'N '+item.numbers.denominator:typeof item.numbers.analysis_n==='number'?'N '+item.numbers.analysis_n:''].filter(Boolean).join(' · ')||'—')}</td><td>${escape([item.stage,meaningful(item.cutoff)].filter(Boolean).join(' · '))}</td></tr>`).join('');
      const anchors=[...new Set(choice.alternatives.flatMap(item=>item.evidence_ids))].map(id=>registry[id]).filter(anchor=>anchor?.supporting_quote);
      const passages=anchors.length?`<details><summary>Source passages</summary>${anchors.map(anchor=>`<blockquote><p>${escape(anchor.supporting_quote)}</p></blockquote>`).join('')}</details>`:'';
      return `<details class="scoped-detail-result" ${choice.status==='review_needed'?'open':''}><summary>${escape([choice.group,choice.label].filter(Boolean).join(' · '))}${choice.status==='review_needed'?' · Review needed':''}</summary><p>${escape(reason)}</p><div class="table-wrap"><table><thead><tr><th>Display</th><th>Result</th><th>Assessment / analysis</th><th>Participants</th><th>Source / cutoff</th></tr></thead><tbody>${rows}</tbody></table></div>${passages}</details>`;
    }).join('')}</section>`;
  }
  function renderDrawer(id, focusResult) {
    const study=state.scopedStudies.find((row)=>row.report_id===id);if(!study)return;state.activeReport=id;
    const pmid=pubmedLink(study.pmid),doi=doiLink(study.doi),details=study.details||{};
    const results=charts.studyResults(study).filter(row=>globalThis.MelanomaScope.resultEligible({...row,main_result_eligible:true},{study}));
    const compact=globalThis.QuantitativeExtraction?.render(study,{registry:state.scopedPayload?.evidence_registry||{},focusResult})||'';
    const resultCards=compact?'':results.map((original)=>{
      const row=scopedResult(original,study),nDisplay=evidenceDisplay?.sampleSizeDisplay(row,{samples:row.report_samples,evidenceRegistry:row.evidence_registry}),n=nDisplay?.text?.replace(/—/g,'NA')||'NA';
      const interval=charts.derivedInterval(row,{nDisplay,evidenceRegistry:row.evidence_registry});
      const fields=[['Endpoint',resultEndpoint(row)],['Population',row.population],['Model',row.analysis?.model||row.model],['Adjusted for',row.analysis?.adjustment_covariates||row.adjustment_covariates],['Data cutoff',row.analysis?.data_cutoff||row.cutoff]];
      if(interval.status==='derived')fields.push(['CI calculation','Approximate two-sided Wald 95% CI']);
      const anchors=scopedEvidence(original,study);
      return `<details class="scoped-detail-result"><summary>${escape(resultEndpoint(row))} · ${escape(charts.displayMeasure(row))}: ${resultValue(row)} · N ${escape(n)}</summary><dl>${fields.map(([label,value])=>`<dt>${escape(label)}</dt><dd>${renderDetailValue(value)}</dd>`).join('')}</dl>${anchors.length?`<h4>Source passages</h4>${anchors.map((anchor)=>`<blockquote><p>${escape(anchor.supporting_quote||'')}</p></blockquote>`).join('')}`:''}</details>`;
    }).join('');
    const otherOutcomes=charts.specialOutcomeDetails(study,{registry:state.scopedPayload?.evidence_registry||{}});
    const otherOutcomeSection=otherOutcomes.length?`<section class="drawer-section" id="other-outcomes" tabindex="-1"><h3>Other outcomes</h3>${otherOutcomes.map(item=>`<blockquote><p>${escape(item.quote)}</p><footer>${escape(typeof item.locator==='string'?item.locator:JSON.stringify(item.locator))}</footer></blockquote>`).join('')}</section>`:'';
    const trial=charts.studyTrialIdentifiers(study,{registry:state.scopedPayload?.evidence_registry||{}});
    const trialDetails=`<section class="drawer-section"><dl class="compact-extraction-fields"><dt>Trial name</dt><dd>${escape(trial.trial_label)}</dd><dt>NCT number</dt><dd>${escape(trial.nct_label)}</dd></dl></section>${outcomeChoiceDetails(study)}`;
    const status=study.current_screening_status||details.current_screening?.triage_status||'NA';
    const screening=`<section class="drawer-section"><h3>Screening</h3><p>${escape(human(status))}${['unclear','uncertain','exclude'].includes(status)&&details.current_decision_reason?` · ${escape(details.current_decision_reason)}`:''}</p></section>`;
    const comparisons=charts.studyComparisons(study).map(c=>{const intervention=charts.interventionPresentation(c,state.drugLabels);return [charts.comparatorDisplayLabel(c,drugLabel),`${intervention.is_add_on?'+ ':''}${intervention.label}`];});
    const comparisonTable=compact?'':globalThis.QuantitativeExtraction?.table('Comparisons',['Comparator','Intervention'],comparisons)||'';
    const historical=study.current_main_eligible===false?`<p class="drawer-section">This article is not included in the current retained study list.</p>`:'';
    $('drawer-content').innerHTML=`<div class="drawer-heading"><h2 id="drawer-title">${escape(study.title)}</h2><div class="drawer-meta">${escape(study.author_display||study.first_author_surname||'')}${study.year?` · ${escape(study.year)}`:''}${pmid?external(pmid,`PMID ${study.pmid}`):''}${doi?external(doi,'DOI'):''}</div><div class="drawer-actions"><button class="secondary-button" data-save="${escape(id)}">${icon('bookmark')}${state.saved[id]?.bookmarked?'Saved on this device':'Save on this device'}</button></div></div>${historical}${trialDetails}${screening}${comparisonTable}${otherOutcomeSection}${compact||`<section class="drawer-section"><h3>Reported results (${number.format(results.length)})</h3>${resultCards||'<p>No numerical results were reported in the available extraction.</p>'}</section>`}<div class="drawer-section"><h3>Your review note</h3><textarea id="review-note" maxlength="4000" aria-label="Device-only review note"></textarea><button class="secondary-button" id="save-note">Save note</button></div>`;
    $('review-note').value=state.saved[id]?.note||'';$('save-note').addEventListener('click',()=>{state.saved[id]={...(state.saved[id]||{}),note:$('review-note').value.trim()};if(persistDeviceData())toast('Review note saved on this device.');});
  }

  function openDrawer(id,section='') { renderDrawer(id); if (state.activeReport === id) {$('study-dialog').showModal();if(section)requestAnimationFrame(()=>{$(section)?.scrollIntoView?.({block:'start'});$(section)?.focus?.({preventScroll:true});});} }
  async function openOutcomeSource(route) {
    const source = Object.fromEntries(new URLSearchParams(route.slice('study-result?'.length)));
    try {
      await ensureStudyData();
      if (location.hash !== '#' + route) return;
      const study = state.scopedStudies.find(row => String(row.pmid) === source.pmid);
      if (study) renderDrawer(study.report_id, source);
      const row = study && $('trial-outcome-source-row');
      if (!row) { state.activeReport = null; toast('This source result is unavailable in the current Studies data.'); return; }
      const dialog = $('study-dialog');
      dialog.dataset.sourceRoute = route;
      if (!dialog.open) dialog.showModal();
      row.focus({preventScroll:true});
      row.scrollIntoView({block:'center'});
    } catch {
      if (location.hash === '#' + route) toast('The study details could not be loaded. Reload to try again.');
    }
  }
  async function fetchJson(path,expectedSha256) {
    const response=await fetch(path,{cache:'no-cache'});if(!response.ok)throw new Error(`Saved data returned HTTP ${response.status}.`);
    if(!expectedSha256)return response.json();
    const bytes=await response.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(digest!==expectedSha256)throw new Error('The saved map update is incomplete. Reload to try again.');
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  let treatmentRegistryDigest;
  function currentTreatmentRegistryDigest(){
    const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
    treatmentRegistryDigest??=crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(stable(globalThis.TreatmentResolver.registry))))
      .then(bytes=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join(''));
    return treatmentRegistryDigest;
  }
  async function fetchTreatments(path='./data/treatment_normalizations.json'){
    const [prepared,digest]=await Promise.all([fetchJson(path),currentTreatmentRegistryDigest()]);
    if(prepared.record_kind!=='source_bound_treatment_normalizations'||prepared.registry_version!==globalThis.TreatmentResolver.registry.version||prepared.registry_sha256!==digest)throw new Error('Prepared treatments require a registry rebuild.');
    return prepared;
  }
  let treatmentMapController,treatmentMapPending,treatmentMapContent,treatmentMapEpoch=0;
  let treatmentMapGraph,treatmentMapFullGraph,treatmentMapFullPending,treatmentMapVersion,studyDataPending;
  function ensureStudyData(){
    if(studyDataPending)return studyDataPending;
    if(state.baselineScopedStudies&&!state.loading&&!state.datasetError)return Promise.resolve();
    if(!studyDataPending)studyDataPending=loadData().then(()=>{if(state.datasetError)throw new Error('Study details could not be loaded.');}).finally(()=>{studyDataPending=null;});
    return studyDataPending;
  }
  async function openStudiesTab() {
    if(state.baselineScopedStudies || studyDataPending || globalThis.AdvancedFilters.activeCount(state.advanced) || state.trialsOnly) {
      await ensureStudyData().then(renderStudyIndirect).catch(()=>{});return;
    }
    try {
      const version=await savedMapVersion(),hash=version.study_browse_default_sha256;
      if(!hash)throw new Error('Prepared Studies table unavailable.');
      let preview=state.studyPreview;
      if(preview?.hash!==hash) {
        preview={hash,pending:fetchJson('./data/study_browse_default.json',hash)};
        state.studyPreview=preview;
      }
      const data=await preview.pending;
      if(state.studyPreview!==preview || state.baselineScopedStudies || studyDataPending || $('analysis-form').hidden || state.currentView!=='analysis')return;
      if(data.source!==version.source_file_sha256 || data.graph!==version.graph_content_sha256)throw new Error('The prepared Studies table is stale.');
      if(preview.active && preview.data===data)return;
      preview.data=data;preview.active=true;
      studyNetwork.catalog={labels:new Map(data.catalog.labels),keys:new Map(data.catalog.keys),ids:new Map(data.catalog.ids),choices:data.catalog.choices};
      for(const role of ['comparator','intervention'])setTreatmentOptions($('analysis-'+role),data.selectors[role],'All '+(role==='comparator'?'comparators':'interventions'));
      for(const role of ['comparator','intervention'])$('analysis-'+role).disabled=false;
      options('analysis-endpoint',data.endpoints.map(row=>[row.id,row.label]),'All endpoints');
      const disabled=new Set(data.endpoints.filter(row=>!row.enabled).map(row=>row.id));
      for(const option of $('analysis-endpoint').options)option.disabled=disabled.has(option.value);
      advancedPanel?.update({active:0,expanded:false,facets:[],summary:data.summary,loading:false,unavailable:false});
      $('data-notice').hidden=true;
      renderStudies(false);
    } catch(_) {
      state.studyPreview=null;
      await ensureStudyData().then(renderStudyIndirect).catch(()=>{});
    }
  }
  // Filters and original report details hydrate the evidence once. Preserve
  // selections made while the detailed source and its controls are loading.
  async function withStudyDetails(action,changed='') {
    const preview=state.studyPreview;
    if(!preview?.active && !preview?.hydrating){action();return;}
    const values=['endpoint','comparator','intervention'].map(role=>$('analysis-'+role).value);
    const ticket=preview.ticket=(preview.ticket||0)+1;
    preview.active=false;preview.hydrating=true;
    if(changed) {
      // The prepared selector IDs and graph are bound to the same release.
      // Network analysis can start while the separate clinical rows download.
      const pair=values.slice(1);
      preview.exactPair=pair.every(id=>studyNetwork.catalog?.labels.has(id));
      studyNetwork.pair=preview.exactPair?pair:null;
      if(changed==='endpoint'){studyNetwork.endpoint='';studyNetwork.target='';}
      renderStudyIndirect();
    }
    try {
      await ensureStudyData();
      if(preview.ticket!==ticket)return;
      const [endpoint,comparator,intervention]=values;
      $('analysis-endpoint').value=endpoint;
      refreshStudyChoices();
      $('analysis-comparator').value=comparator;$('analysis-intervention').value=intervention;
      action();
    } catch (_) {
      if(preview.ticket===ticket){
        preview.active=true;
        $('data-notice').hidden=false;$('data-notice').textContent='Study details could not be loaded. Select the filter or study again to retry.';
      }
    } finally {if(preview.ticket===ticket){preview.hydrating=false;preview.exactPair=false;}}
  }
  function mapMatchesTreatments(graph,treatments){
    const meta=graph?.metadata||{};return !!treatments&&meta.registry_sha256===treatments.registry_sha256&&meta.normalization_content_sha256===treatments.content_sha256&&meta.source_file_sha256===treatments.source_file_sha256&&meta.clinical_content_sha256===treatments.clinical_content_sha256;
  }
  async function savedMapVersion(){
    const version=await fetchJson('./data/treatment_map_version.json');
    if(version.schema_version!==1||!version.graph_content_sha256)throw new Error('Saved map version is unavailable.');
    return version;
  }
  function mapVersionChanged(version){
    return !!version&&(version.graph_content_sha256!==treatmentMapContent||version.default_snapshot_sha256!==treatmentMapVersion?.default_snapshot_sha256||version.engine_signature!==treatmentMapVersion?.engine_signature||version.network_reference_sha256!==treatmentMapVersion?.network_reference_sha256);
  }
  function sameEvidenceVersion(version){
    return !!version&&version.source_file_sha256===state.treatmentNormalizations?.source_file_sha256&&version.quantitative_content_sha256===state.quantitativeContent&&version.normalization_content_sha256===state.treatmentNormalizations?.content_sha256&&version.clinical_classification_content_sha256===state.clinicalClassifications?.content_sha256;
  }
  async function fullTreatmentMap(expectedHash){
    if(treatmentMapFullGraph?.content_sha256===expectedHash)return treatmentMapFullGraph;
    if(!treatmentMapFullPending)treatmentMapFullPending=fetchJson('./data/treatment_map.json').then(graph=>{
      if(graph.content_sha256!==expectedHash)throw new Error('The saved evidence changed. Reload the map to load its current studies.');
      treatmentMapFullGraph=graph;return graph;
    }).finally(()=>{treatmentMapFullPending=null;});
    const graph=await treatmentMapFullPending;
    if(graph.content_sha256!==expectedHash)throw new Error('The saved evidence changed. Reload the map to load its current studies.');
    return graph;
  }
  async function openNetworkStudy(pmid) {
    await ensureStudyData();
    const study = state.scopedStudies.find(row => String(row.pmid) === String(pmid));
    if (!study?.report_id) throw new Error('The saved study details are unavailable for this report.');
    openDrawer(study.report_id);
  }
  let networkFitCache;
  let defaultIndirectCache;
  async function lookupNetworkFit(graphHash, blocks, first, second, model,endpoint='OS:HR',target='overall') {
    const version=treatmentMapVersion;
    if(model==='common' && version?.graph_content_sha256===graphHash && version.study_network_defaults_sha256) {
      const hash=version.study_network_defaults_sha256;
      if(defaultIndirectCache?.hash!==hash) {
        defaultIndirectCache={hash,data:fetchJson('./data/study_network_defaults.json',hash).catch(()=>{
          if(defaultIndirectCache?.hash===hash)defaultIndirectCache=null;
          return null;
        })};
      }
      const table=await defaultIndirectCache.data;
      const saved=table?.results?.[JSON.stringify([endpoint,target,first,second])];
      if(table?.graph===graphHash && saved && await globalThis.TreatmentNetworkCache.digest(blocks)===saved.blockDigest)
        return {...saved.fit,defaultPlan:saved.plan};
    }
    if(endpoint!=='OS:HR'||target!=='overall')return null;
    const digest = treatmentMapVersion?.network_reference_sha256;
    if (!globalThis.TreatmentNetworkCache || !digest || treatmentMapVersion.graph_content_sha256 !== graphHash) return null;
    if (networkFitCache?.hash !== digest) {
      networkFitCache = {hash:digest, data:fetchJson('./data/treatment_network_reference.json',digest).catch(()=>{
        if (networkFitCache?.hash === digest) networkFitCache = null;
        return null;
      })};
    }
    const cache = await networkFitCache.data;
    return cache ? globalThis.TreatmentNetworkCache.lookup(cache,graphHash,blocks,first,second,model) : null;
  }
  function mountNodeStudies(root,node,graph){
    let cancelled=false,inner,observer,pending=false;
    const load=async()=>{
      if(cancelled||pending)return;pending=true;observer?.disconnect();
      root.innerHTML='<p role="status">Loading studies…</p>';
      try{
        const [full]=await Promise.all([fullTreatmentMap(graph.content_sha256),ensureStudyData()]);
        if(cancelled)return;
        if(!mapMatchesTreatments(full,state.treatmentNormalizations))throw new Error('The map and study data are from different saved updates. Reload to use the latest evidence.');
        const memberships=list(full.study_memberships).filter(member=>member.node_id===node.id);
        inner=globalThis.TreatmentNodeStudies.mount(root,{node,memberships,regimenMemberships:full.study_memberships,studies:state.scopedStudies,api:charts,registry:state.scopedPayload?.evidence_registry||{},labels:state.drugLabels,renderRows:studyRowsHTML,download:(csv,selected)=>{
          const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),link=document.createElement('a');link.href=url;link.download='metaMelanomaTrials-'+selected.label.replace(/[^a-z0-9]+/gi,'-')+'-studies.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }});
      }catch(error){
        if(cancelled)return;pending=false;root.replaceChildren();const notice=document.createElement('p');notice.setAttribute('role','status');notice.textContent=error.message;root.appendChild(notice);addLoadButton('Retry studies');
      }
    };
    const addLoadButton=label=>{const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent=label;button.addEventListener('click',load);root.appendChild(button);};
    root.replaceChildren();
    if(state.baselineScopedStudies&&treatmentMapFullGraph?.content_sha256===graph.content_sha256)load();
    else{
      addLoadButton('Load study details');
      if(typeof IntersectionObserver==='function'){observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))load();});observer.observe(root);}
    }
    return {destroy(){cancelled=true;observer?.disconnect();inner?.destroy();}};
  }
  let mapAdvancedCache;
  async function mapFilterEvidence(selections,expanded,options){
    const graph=treatmentMapGraph,clinical=state.quantitativeSnapshot?.clinical_evidence;
    if(!graph||!clinical)throw new Error('Map classifications unavailable.');
    const full=await fullTreatmentMap(graph.content_sha256);
    if(!mapMatchesTreatments(full,state.treatmentNormalizations)||clinical.content_sha256!==graph.metadata.clinical_content_sha256)
      throw new Error('Map and clinical evidence versions differ.');
    const engine=globalThis.AdvancedFilters;
    if(mapAdvancedCache?.graph!==graph||mapAdvancedCache.clinical!==clinical){
      const index=globalThis.TreatmentNodeStudies.filterIndex(full,clinical,graph.comparisons,globalThis.TreatmentMap.neutralControl);
      mapAdvancedCache={graph,clinical,index};
    }
    const cache=mapAdvancedCache,key=JSON.stringify([selections,options.classifications?.content_sha256]);
    if(cache.key!==key){
      const matched=engine.filterBrowseMatches(cache.index.base,selections,options);
      cache.key=key;cache.nodeIds=globalThis.TreatmentNodeStudies.matchingNodes(cache.index,matched);
      cache.facets=null;
    }
    if(expanded&&!cache.facets)cache.facets=engine.browseFacets(cache.index.base,selections,options);
    return {facets:cache.facets||[],nodeIds:cache.nodeIds};
  }
  function networkFilterMatches(comparisons,selections,options,keys){
    const engine=globalThis.AdvancedFilters;
    const matches={};
    for(const comparison of comparisons){
      const groups=comparison.analysis?.network_arm_filter_bindings || [list(comparison.analysis?.filter_bindings)];
      // A derived contrast needs a qualifying result in each randomized arm.
      const bestByArm=groups.map(bindings=>{
        let best=null;
        for(const row of bindings){
          if(!engine.resultMatches(row,selections,options))continue;
          const fields=engine.resultClassification(row,options)?.fields || {};
          const direct=keys.filter(key=>fields[key]?.status==='supported'&&!fields[key].inherited_from);
          if(!best || direct.length>best.length)best=direct;
        }
        return best;
      });
      const matched=bestByArm.length>0&&bestByArm.every(Boolean);
      const direct=matched?keys.filter(key=>bestByArm.every(arm=>arm.includes(key))):[];
      matches[comparison.id]={matched,specificity:direct.length,matched_keys:matched?keys:[],direct_keys:direct,values:selections};
    }
    return matches;
  }
  let mapFilterRevision=0;
  async function syncTreatmentMapAdvanced(){
    const controller=treatmentMapController;
    if(!controller)return;
    const revision=++mapFilterRevision,selections=state.advanced,engine=globalThis.AdvancedFilters,active=engine.activeCount(selections)>0;
    if(!active){controller.setAdvancedFilters({active:false,matches:{}});return;}
    const options=clinicalFilterOptions(),keys=Object.keys(selections).filter(key=>selections[key]!=='all');
    const label=engine.definitions.filter(def=>keys.includes(def.key)).map(def=>def.choices.find(choice=>choice.value===selections[def.key])?.label||selections[def.key]).join(' · ');
    const signature=JSON.stringify([selections,options.classifications?.content_sha256,options.clinical_content_sha256,treatmentMapContent]);
    if(controller.advanced?.signature===signature)return;
    controller.setAdvancedFilters({active,selections,pending:true,label:'Loading selected filters…',signature:signature+'-loading',matches:{},nodeIds:new Set()});
    if(!state.baselineScopedStudies)return;
    const matches=networkFilterMatches([...controller.model.comparisons,...list(treatmentMapGraph?.network_direct_evidence)],selections,options,keys);
    try{
      const {nodeIds}=await mapFilterEvidence(selections,false,options);
      if(revision===mapFilterRevision&&controller===treatmentMapController)
        controller.setAdvancedFilters({active,selections,matches,label,signature,nodeIds});
    }catch{
      if(revision===mapFilterRevision&&controller===treatmentMapController)
        controller.setAdvancedFilters({active,selections,matches:{},error:'Filtered map evidence is unavailable.',label:'Filtered map evidence is unavailable.',signature:signature+'-unavailable',nodeIds:new Set()});
    }
  }
  function mapIsOpen(){return !$('analysis-treatment-map').hidden;}
  function invalidateTreatmentMap(){
    if(treatmentMapController&&mapMatchesTreatments(treatmentMapGraph,state.treatmentNormalizations)){
      syncTreatmentMapAdvanced();return;
    }
    treatmentMapEpoch++;treatmentMapController?.destroy();treatmentMapController=null;treatmentMapContent=null;
    treatmentMapGraph=null;treatmentMapFullGraph=null;
    $('treatment-map-root').innerHTML='<p role="status">Loading the saved treatment map…</p>';
    if(mapIsOpen())loadTreatmentMap();
  }
  async function loadTreatmentMap(force=false){
    const target=$('treatment-map-root'),epoch=treatmentMapEpoch;
    if(treatmentMapPending)return treatmentMapPending;
    if(treatmentMapController&&!force)return treatmentMapController;
    if(!treatmentMapController)target.innerHTML='<p role="status">Loading the saved treatment map…</p>';
    treatmentMapPending=(async()=>{
      try{
        const [version,digest]=await Promise.all([savedMapVersion().catch(()=>null),currentTreatmentRegistryDigest()]);
        let graph;
        if(version){
          graph=await fetchJson('./data/treatment_map_default.json',version.default_snapshot_sha256);
          if(graph.content_sha256!==version.graph_content_sha256||graph.metadata?.registry_sha256!==version.registry_sha256||graph.metadata?.source_file_sha256!==version.source_file_sha256||graph.metadata?.normalization_content_sha256!==version.normalization_content_sha256||graph.metadata?.clinical_content_sha256!==version.clinical_content_sha256)throw new Error('The saved map update is incomplete. Reload to try again.');
        }else graph=await fetchJson('./data/treatment_map.json');
        if(epoch!==treatmentMapEpoch)return;
        if(graph.schema_version!==1||graph.metadata?.registry_sha256!==digest||(state.treatmentNormalizations&&!mapMatchesTreatments(graph,state.treatmentNormalizations)))throw new Error('The map is awaiting a rebuild for the current evidence.');
        if(!globalThis.TreatmentMap)throw new Error('The treatment map viewer could not be loaded.');
        const changed=graph.content_sha256!==treatmentMapContent||mapVersionChanged(version);
        treatmentMapVersion=version;treatmentMapGraph=graph;
        if(!graph.view_snapshot)treatmentMapFullGraph=graph;
        if(changed){
          treatmentMapController?.destroy();
          const advanced=globalThis.AdvancedFilters.activeCount(state.advanced)>0?{active:true,matches:{},label:'Loading selected filters…'}:{active:false,matches:{}};
          treatmentMapController=globalThis.TreatmentMap.mount(target,graph,{
            advanced, networkModel:state.settings?.network_model || 'common',planningSettings:state.settings,
            loadNetworkGraph:()=>Array.isArray(graph.network_direct_evidence) ? graph : fullTreatmentMap(graph.content_sha256),
            loadNetworkPublications:async()=>{
              await ensureStudyData();
              if (!mapMatchesTreatments(graph,state.treatmentNormalizations)) throw new Error('Reload the map to use studies from the same saved update.');
              return studyNetworkPublications();
            },
            lookupNetworkFit:(...args)=>lookupNetworkFit(...args),
            retryNetworkFilters:()=>syncTreatmentMapAdvanced(),
            openNetworkStudy:pmid=>openNetworkStudy(pmid),
            mountAdvanced:(heading,body)=>mountTabAdvanced(heading,body,'map-advanced',mapFilterEvidence),
            renderNodeStudies:(root,node)=>mountNodeStudies(root,node,graph)
          });
          treatmentMapContent=graph.content_sha256;
          syncTreatmentMapAdvanced();
          if(advanced.active)ensureStudyData().catch(()=>{});
        }
        scheduleClinicalRefresh();
      }catch(error){
        if(epoch!==treatmentMapEpoch)return;
        treatmentMapController?.destroy();treatmentMapController=null;treatmentMapContent=null;
        target.innerHTML=`<p role="status">${escape(error.message)} <button type="button" class="secondary-button" id="retry-treatment-map">Retry map</button></p>`;
        $('retry-treatment-map').addEventListener('click',()=>loadTreatmentMap(true));
      }finally{
        treatmentMapPending=null;
        if(epoch!==treatmentMapEpoch&&mapIsOpen())loadTreatmentMap();
      }
    })();return treatmentMapPending;
  }
  let clinicalPending,clinicalTimer;
  function applyQuantitativeSnapshot(snapshot,treatments){
    globalThis.QuantitativeExtraction.checked(snapshot);
    const merged=globalThis.QuantitativeExtraction.merge(state.baselineScopedStudies,state.baseScopedPayload.evidence_registry||{},snapshot);
    const prepared=globalThis.RegimenDefinitions.prepareStudies(merged.studies,{normalizations:treatments,clinical_content_sha256:snapshot.clinical_evidence?.content_sha256});
    const display=globalThis.StudySourceProjection.apply(prepared,merged.evidence_registry,snapshot);
    state.scopedStudies=display.studies;
    state.treatmentNormalizations=treatments;
    state.scopedPayload={schema_version:1,studies:state.scopedStudies,evidence_registry:display.evidence_registry};
    state.quantitativeSnapshot=snapshot;state.quantitativeContent=snapshot.content_sha256||treatments?.source_file_sha256||JSON.stringify(snapshot);
    if(snapshot.mode==='pilot'){
      const progress=snapshot.about_progress?.stages?.R2||{};
      state.summary={...defaults,counts:{candidates:snapshot.scope_pmids.length,processed:progress.screening_finished,retained:progress.retained,excluded:progress.excluded,uncertain:progress.unclear},diseases:[],disease_catalog:[],evidence_combinations:[],endpoint_definitions:[]};
      state.analysis={status:'awaiting_analysis',validated:false,analyses:[],matrix:[],sample_size:[]};
    }
    globalThis.MetaQuantitativeSnapshot=snapshot;invalidateAdvancedEvidence();refreshTreatmentLabels();invalidateTreatmentMap();
  }
  function applyClinicalSnapshot(snapshot,treatments) {
    if(!globalThis.ClinicalEvidence)throw new Error('Clinical evidence reader unavailable');
    const merged=globalThis.ClinicalEvidence.merge(state.baselineScopedStudies,state.baseScopedPayload.evidence_registry||{},snapshot);
    state.scopedStudies=globalThis.RegimenDefinitions.prepareStudies(merged.studies,{normalizations:treatments,clinical_content_sha256:snapshot.content_sha256});state.treatmentNormalizations=treatments;state.scopedPayload={...state.baseScopedPayload,evidence_registry:merged.evidence_registry};state.clinicalContent=snapshot.content_sha256||JSON.stringify(snapshot.articles);invalidateAdvancedEvidence();refreshTreatmentLabels();invalidateTreatmentMap();
  }
  async function refreshClinicalEvidence() {
    if(clinicalPending||!state.baselineScopedStudies)return clinicalPending;
    refreshEvidenceFreshness();
    clinicalPending=(async()=>{
      try{
        const version=await savedMapVersion().catch(()=>null);
        if(!version||sameEvidenceVersion(version)){if(version&&mapVersionChanged(version)&&mapIsOpen())await loadTreatmentMap(true);return;}
        const [compact,classificationsChanged,treatments]=await Promise.all([fetchJson('./data/quantitative_extraction.json').catch(()=>null),updateClinicalClassifications(),fetchTreatments().catch(()=>null)]);
        if(compact?.publication_ready===true){
          if(!treatments)throw new Error('Prepared treatment data is unavailable.');
          const content=compact.content_sha256||treatments.source_file_sha256||JSON.stringify(compact);if(content===state.quantitativeContent&&treatments.content_sha256===state.treatmentNormalizations?.content_sha256){if(classificationsChanged)setupAnalysisControls();if(mapIsOpen()&&mapVersionChanged(version))loadTreatmentMap(true);return;}
          applyQuantitativeSnapshot(compact,treatments);
        }else if(state.quantitativeSnapshot?.mode==='pilot'){return;}else{
          const [snapshot,legacyTreatments]=await Promise.all([fetchJson('./data/clinical_evidence.json').then(globalThis.ClinicalEvidence.checked),fetchTreatments('./data/clinical_treatment_normalizations.json')]),content=snapshot.content_sha256||JSON.stringify(snapshot.articles);
          if(content===state.clinicalContent&&legacyTreatments.content_sha256===state.treatmentNormalizations?.content_sha256){if(classificationsChanged)setupAnalysisControls();return;}
          applyClinicalSnapshot(snapshot,legacyTreatments);
        }
        state.quantitativeResults=state.scopedStudies.filter(study=>study.default_visible).flatMap(charts.studyResults).filter(charts.mainResultEligible);
        setupAnalysisControls();
      }catch(_){$('data-notice').hidden=false;$('data-notice').className='data-notice error';$('data-notice').textContent='Some saved clinical evidence could not be loaded. The last checked study data remains shown.';}
      finally{clinicalPending=null;}
    })();return clinicalPending;
  }
  function scheduleClinicalRefresh() {
    if(typeof document.visibilityState!=='string')return;
    clearTimeout(clinicalTimer);clinicalTimer=setTimeout(async()=>{
      if(document.visibilityState==='visible'&&state.currentView!=='about'){
        if(state.baselineScopedStudies)await refreshClinicalEvidence();
        else if(mapIsOpen()){refreshEvidenceFreshness();const version=await savedMapVersion().catch(()=>null);if(version&&mapVersionChanged(version))await loadTreatmentMap(true);}
      }
      scheduleClinicalRefresh();
    },60000);
  }
  async function loadData() {
    refreshEvidenceFreshness();
    state.loading=true;state.datasetError=false;$('refresh').disabled=true;
    $('data-notice').hidden=false;$('data-notice').className='data-notice';$('data-notice').textContent='Loading the saved study snapshot…';
    renderStudies();
    // A published pilot is self-contained. Do not download or parse the older
    // full-cohort datasets while reviewing only these newly screened articles.
    const [compact,,treatments]=await Promise.all([fetchJson('./data/quantitative_extraction.json').catch(()=>null),updateClinicalClassifications(),fetchTreatments().catch(()=>null)]);
    const pilot=compact?.publication_ready===true?compact:state.quantitativeSnapshot?.mode==='pilot'?state.quantitativeSnapshot:null;
    if(pilot){
      try{
        state.baseScopedPayload={schema_version:1,studies:[],evidence_registry:{}};state.baselineScopedStudies=[];
        if(!treatments)throw new Error('Prepared treatment data is unavailable.');
        applyQuantitativeSnapshot(pilot,treatments);
        state.quantitativeResults=state.scopedStudies.filter(study=>study.default_visible).flatMap(charts.studyResults).filter(charts.mainResultEligible);
        state.records=normalizeReports(state.scopedStudies.map(study=>({...study,cancer_ids:[FIXED_DISEASE],endpoint_families:studyResultsFamilies(study),drugs:[]})));
        $('data-notice').hidden=true;
      }catch(_){
        state.datasetError=true;state.scopedStudies=[];state.records=[];state.quantitativeResults=[];
        state.summary={...defaults,counts:{}};state.analysis={validated:false,analyses:[],matrix:[],sample_size:[]};
        $('data-notice').hidden=false;$('data-notice').className='data-notice error';$('data-notice').textContent='The published study snapshot could not be read. Reload to try again.';
      }
      state.loading=false;if(state.studyPreview&&!state.datasetError)state.studyPreview.active=false;$('refresh').disabled=false;setupAnalysisControls();scheduleClinicalRefresh();return;
    }
    const [summaryResult,analysisResult,studiesResult,clinicalResult]=await Promise.allSettled([fetchJson('./data/summary.json'),fetchJson('./data/analysis.json'),fetchJson('./data/studies.json'),fetchJson('./data/clinical_evidence.json')]);
    const errors=[];
    if(summaryResult.status==='fulfilled')state.summary=mergeSummary(summaryResult.value);else errors.push('Summary could not be loaded.');
    state.diseases=new Map([['cutaneous_melanoma','Cutaneous melanoma']]);
    state.analysis=analysisResult.status==='fulfilled'?analysisResult.value:{validated:false,analyses:[],matrix:[],sample_size:[]};
    if(studiesResult.status==='fulfilled'){
      try{
        state.baseScopedPayload=studiesResult.value;state.baselineScopedStudies=globalThis.RegimenDefinitions.prepareStudies(charts.scopedStudies(studiesResult.value));
        state.scopedPayload=studiesResult.value;state.scopedStudies=state.baselineScopedStudies;
        if(clinicalResult.status==='fulfilled'){try{applyClinicalSnapshot(clinicalResult.value,await fetchTreatments('./data/clinical_treatment_normalizations.json'));}catch(_){errors.push('Some saved clinical evidence could not be read; the checked study snapshot remains available.');}}
        state.quantitativeResults=state.scopedStudies.filter((study)=>study.default_visible).flatMap(charts.studyResults).filter(charts.mainResultEligible);
        refreshTreatmentLabels();
        state.records=normalizeReports(state.scopedStudies.map((study)=>({...study,abstract:study.details?.citation?.abstract||study.details?.citations?.abstract||'',cancer_ids:['cutaneous_melanoma'],priority_class:study.screening?.priority_class||'review',report_type:study.screening?.report_type||'not_reported',endpoint_families:studyResultsFamilies(study),drugs:[]})));
      }catch(error){state.datasetError=true;state.scopedStudies=[];state.records=[];state.quantitativeResults=[];errors.push('The scoped study snapshot could not be read.');}
    }else{state.datasetError=true;state.scopedStudies=[];state.records=[];state.quantitativeResults=[];errors.push('The scoped study snapshot could not be loaded.');}
    state.loading=false;$('refresh').disabled=false;
    setupAnalysisControls();scheduleClinicalRefresh();
    if(errors.length){$('data-notice').hidden=false;$('data-notice').className='data-notice error';$('data-notice').innerHTML=`${escape(errors.join(' '))} <button id="retry-data">Retry loading</button>`;$('retry-data').addEventListener('click',loadData);}else $('data-notice').hidden=true;
  }
  function studyResultsFamilies(study){return [...new Set(charts.studyResults(study).filter(charts.mainResultEligible).map(charts.displayEndpointFamily).filter(Boolean))];}


  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-view]'), target = event.target.closest('[data-go]'), open = event.target.closest('[data-open]'), save = event.target.closest('[data-save]'), tab = event.target.closest('[data-analysis-tab]'), matrix = event.target.closest('[data-matrix-group]');
    if (nav) go(nav.dataset.view);
    if (target) go(target.dataset.go);
    if (open) withStudyDetails(()=>openDrawer(open.dataset.open,open.dataset.detailSection||''));
    if (save) toggleSave(save.dataset.save);
    if (tab) selectAnalysisTab(tab.dataset.analysisTab);
    if (matrix) showMatrixDetails(matrix.dataset.matrixGroup.split(',').map(Number));
  });
  window.addEventListener('hashchange', () => showView(location.hash.slice(1), true));
  const studySearchHost=$('studies-trial-search');
  studySearchHost.innerHTML=globalThis.TrialSearch.field('Studies');
  const studySearchInput=studySearchHost.querySelector('[data-trial-search]');
  studySearchInput.addEventListener('input',()=>{
    state.studyTrialQuery=studySearchInput.value;
    renderStudies(true,true);
  });
  $('download-study-table').addEventListener('click',()=>withStudyDetails(downloadStudyTable));
  $('trial-only-toggle')?.addEventListener('click',()=>withStudyDetails(()=>{state.trialsOnly=!state.trialsOnly;refreshStudyChoices();renderAnalysis();renderSummary();renderMatrix();renderPlanning();}));
  $('scoped-studies-previous').addEventListener('click',()=>{state.scopedPage--;renderStudies(false);});
  $('scoped-studies-next').addEventListener('click',()=>{state.scopedPage++;renderStudies(false);});
  for(const key of ['author','year'])$(`scoped-sort-${key}`).addEventListener('click',()=>{state.scopedOrder=state.scopedSort===key&&state.scopedOrder==='asc'?'desc':'asc';state.scopedSort=key;renderStudies();});
  $('close-drawer').addEventListener('click', () => $('study-dialog').close());
  $('study-dialog').addEventListener('click', (event) => { if (event.target === $('study-dialog')) { const rect = $('study-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right) $('study-dialog').close(); } });
  $('study-dialog').addEventListener('close', () => {
    const dialog = $('study-dialog');
    if (dialog.open) return;
    if (dialog.dataset.sourceRoute && location.hash === '#' + dialog.dataset.sourceRoute) history.replaceState(null, '', '#analysis');
    delete dialog.dataset.sourceRoute;
    state.activeReport = null;
  });
  $('analysis-form').addEventListener('submit', (event) => { event.preventDefault(); updateAvailability('analysis'); renderAnalysis('always'); renderMainArticles(true); });
  for(const role of ['comparator','intervention'])$('analysis-'+role).addEventListener('change',()=>withStudyDetails(()=>{refreshStudyChoices(role);renderAnalysis('if-empty');},role));
  $('analysis-endpoint').addEventListener('change',()=>withStudyDetails(()=>{studyNetwork.endpoint='';studyNetwork.target='';refreshStudyChoices();renderAnalysis('if-empty');},'endpoint'));
  $('analysis-comparison').addEventListener('change', renderAnalysis);
  document.querySelector('.analysis-tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('[data-analysis-tab]')], index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectAnalysisTab(tabs[next].dataset.analysisTab, true);
  });
  for (const [prefix, render] of [['summary', renderSummary], ['matrix', renderMatrix], ['planning', renderPlanning]]) {
    for (const field of ['endpoint']) $(`${prefix}-${field}`).addEventListener('change', () => { updateAvailability(prefix); render(); });
  }
  $('planning-form').addEventListener('submit', (event) => { event.preventDefault(); updateAvailability('planning'); renderPlanning(); });
  $('settings-form').addEventListener('submit', (event) => { event.preventDefault(); saveSettings(); });
  $('planning-arms').addEventListener('change',displayPlanningFields);
  $('reset-settings').addEventListener('click', () => saveSettings(true));
  state.advancedExpanded=globalThis.AdvancedFilters.activeCount(state.advanced)>0;
  advancedPanel=globalThis.AdvancedFilterPanel.create({toggle:$('advanced-filter-toggle'),panel:$('advanced-filter-panel'),fields:$('advanced-filter-fields'),reset:$('reset-advanced-filters'),status:$('advanced-filter-status'),evidence:$('advanced-evidence-count'),onToggle:()=>withStudyDetails(()=>{state.advancedExpanded=!state.advancedExpanded;renderAdvancedFilters();}),onChange:advancedChanged,onReset:()=>advancedChanged()});
  displaySettings(); showView(location.hash.slice(1));
  renderAnalysis(); renderMainArticles(); renderSummary(); renderMatrix(); renderPlanning(); renderPrisma(); refreshEvidenceFreshness();
  if (state.currentView !== 'analysis' && state.currentView !== 'about' && state.currentView !== 'settings') ensureStudyData().catch(()=>{});
})();
