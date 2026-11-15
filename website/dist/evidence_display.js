(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EvidenceDisplay = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const list = (v) => Array.isArray(v) ? v : [];
  const string = (v) => typeof v === 'string' && v.trim() ? v.trim() : null;
  const clone = (v) => v == null ? v : JSON.parse(JSON.stringify(v));
  const text = (v) => typeof v === 'string' ? v : v && typeof v.text === 'string' ? v.text : v && v.description ? text(v.description) : '';
  const unique = (v) => [...new Set(v.filter(Boolean))];
  const participant = (v) => /^(participants?|patients?|people|persons?|subjects?)$/i.test(v || '');
  function identity(r) {
    return [r && r.report_id, r && r.reviewer, r && r.source_input_sha256,
      r && (r.draft_artifact_sha256 || r.source_packet_sha256 || r.derivative_artifact_sha256 || r.review_binding_sha256)];
  }
  function sameIdentity(a, b) { const x = identity(a), y = identity(b); return x.every((v, i) => string(v) && v === y[i]); }
  function foreignInlineIdentity(row, fact) {
    return fact && ['report_id', 'reviewer', 'source_input_sha256', 'draft_artifact_sha256', 'source_packet_sha256', 'derivative_artifact_sha256', 'review_binding_sha256']
      .some((k) => fact[k] !== undefined) && !sameIdentity(row, fact);
  }
  function anchor(a) { return a && ['source_id', 'block_id', 'supporting_quote'].every((k) => typeof a[k] === 'string') && (a.locator==null||typeof a.locator==='string'); }
  function hasEvidence(f, r) {
    return list(f && f.evidence_ids).some(string) || list(f && f.evidence).some(anchor) || list(r && r.evidence).some(anchor);
  }
  function numberText(f) {
    if (!f || f.semantic_non_scalar_source_literal === true || !['reported', 'unclear'].includes(f.status) || typeof f.value === 'boolean') return null;
    if (f.value != null && (typeof f.value !== 'number' || !Number.isFinite(f.value) || f.value < 0 || !Number.isInteger(f.value))) return null;
    const checked = f.semantic_display_checked === true && typeof f.semantic_display_value === 'string' ? f.semantic_display_value : null;
    const raw = checked && checked !== 'NA' ? checked : null, value = raw || (f.value != null ? String(f.value) : null);
    if (!value) return null;
    const symbols = { less_than: '<', less_or_equal: '≤', less_than_or_equal: '≤', greater_than: '>', greater_or_equal: '≥', greater_than_or_equal: '≥' };
    const prefix = symbols[f.qualifier] && !/^[<>≤≥]/.test(value) ? symbols[f.qualifier] : '';
    return prefix + value + (f.status === 'unclear' ? ' (unclear)' : '');
  }
  function scopeIds(record, role) {
    const fact=record&&record.original_fact||{};
    const direct = role === 'population' ? [record && record.population_id, record && record.population && (record.population.population_id || record.population.entity_id),fact.result_population_id||fact.population_id] :
      [record && record.arm_id, record && record.arm && (record.arm.arm_id || record.arm.entity_id),fact.arm_id];
    return unique(direct.concat(list(record && record.original_fact && record.original_fact.links)
      .filter((l) => role === 'arm' ? ['arm', 'experimental_arm', 'comparator_arm'].includes(l.role) : l.role === role).map((l) => l.entity_id)).map(id=>localId(record,id)));
  }
  function localId(record,id){const binding=string(record&&record.review_binding_sha256),prefix=binding&&/^[a-f0-9]{64}$/.test(binding)?'CE-'+binding.slice(0,24)+'-':null;return typeof id==='string'&&prefix&&id.startsWith(prefix)?id.slice(prefix.length):id;}
  function rowScope(row) {
    const pops = unique(scopeIds(row,'population').concat(row.analysis&&row.analysis.population_id?[localId(row,row.analysis.population_id)]:[]));
    const pair=unique(list(row.analysis && row.analysis.experimental_arm_ids).concat(list(row.analysis && row.analysis.comparator_arm_ids),
      [row.experimental_arm&&row.experimental_arm.entity_id,row.comparator_arm&&row.comparator_arm.entity_id],
      row.model&&row.model.contrast_type==='treatment_comparison'?list(row.model.arm_ids):[]).map(id=>localId(row,id)));
    const comparative=/^(?:HR|RR|OR|SHR|TR|RD|MD|SMD|hazard ratio|risk ratio|odds ratio|relative risk)$/i.test(row.measure||'')&&
      [row.contrast_type,row.analysis&&row.analysis.contrast_type,row.model&&row.model.contrast_type,row.original_fact&&row.original_fact.contrast_type].includes('treatment_comparison')&&pair.length>1&&row.result_relation!=='arm_specific';
    const armSpecific=!!row.arm_id&&!comparative;
    const arms = armSpecific ? [localId(row,row.arm_id)] : comparative ? pair : unique(pair.concat(list(row.comparison_arms).map((a) => localId(row,a.arm_id||a.entity_id))));
    const p = row.population || {}, description = text(p.description || p.label);
    const child = !!(p.parent_population_id || p.parent_id);
    const full = pops.length === 1 && !child && !/\b(subgroup|cohort\s*\d|subset|part\s*\d)\b/i.test(description) &&
      /\b(all\s+randomi[sz]ed\s+(?:(?:trial|study)\s+)?(?:participants?|patients?|subjects?)|(?:entire|full|whole)\s+(?:trial|study)\s+(?:population|participants?|patients?)|full\s+intention.to.treat\s+population)\b/i.test(description);
    const armPopulation = pops.length === 1 && arms.length === 1 && list(p.arm_ids).length === 1 && localId(row,p.arm_ids[0]) === arms[0] &&
      /\b(randomi[sz]ed|assigned|allocated)\b.{0,45}\b(arm|group)\b|\b(arm|group)\b.{0,45}\b(randomi[sz]ed|assigned|allocated)\b/i.test(description);
    const restricted=/\b(subgroup|subset|cohort\s*\d|part\s*\d|biomarker|PD[- ]?L1|BRAF|V600\w*|mutant|mutation|wild.type|positive|negative|women|men|male|female|elderly|older|younger|responders?|nonresponders?|complete.case|safety\s+population|evaluable\s+population)\b|\bage(?:d)?\s*\d/i.test(description);
    const fullAnalysis=/\b(as.treated\s+(?:analysis\s+)?population|(?:full\s+)?intention.to.treat\s+population|ITT\s+population|all\s+randomi[sz]ed)\b/i.test(description);
    return { population: pops.length === 1 ? pops[0] : null, conflictingPopulation: pops.length > 1, arms, full, armPopulation,armSpecific,comparative,
      trialBridge:comparative&&!restricted&&(!child||fullAnalysis),fullAnalysis,parentPopulation:localId(row,p.parent_population_id||p.parent_id) };
  }
  function label(record) { return [record.quantity_label, record.source_field, record.original_fact && record.original_fact.variable,
    text(record.original_fact && record.original_fact.measure_verbatim)].filter(Boolean).join(' ').replace(/[_-]+/g,' '); }
  function randomized(record) {
    const description = label(record) + ' ' + text(record.value_text) + ' ' + text(record.original_fact && record.original_fact.text);
    if (/\b(?:non[-\s]?randomi[sz]ed|not\s+(?:randomly\s+)?(?:assigned|allocated|randomi[sz]ed)|without\s+randomi[sz]ation)\b/i.test(description)) return false;
    const role = record.denominator_type || record.sample_context_role;
    if (['safety', 'treated', 'evaluable', 'screened', 'eligible'].includes(role)) return false;
    if (['randomized', 'assigned', 'allocated'].includes(role)) return true;
    return /\b(randomi[sz](?:ed|ation)|assigned|allocated)\b/i.test(description.replace(/[_-]+/g,' '));
  }
  function observed(record) {
    return (!record.scope || record.scope === 'observed') && (!record.original_fact || !record.original_fact.scope || record.original_fact.scope === 'observed') &&
      record.domain !== 'trial_planning_quality' && !/\b(planned|required|target|assumed|hypothetical|power\s+calculation)\b/i.test(label(record));
  }
  function matchingScope(record, scope) {
    const pops = scopeIds(record, 'population'), arms = scopeIds(record, 'arm');
    if (pops.length) return pops.length === 1 && scope.population === pops[0];
    return scope.full || (scope.armPopulation && arms.length === 1 && arms[0] === scope.arms[0]);
  }
  function semanticNumber(record) {
    const n = record.n;
    return JSON.stringify([n.value == null ? n.raw_text : n.value, n.qualifier || 'equal', n.status, n.unit || record.counting_unit]);
  }
  function scopeEvidence(record){
    const objects=[record,record.n,record.original_fact,record.population,record.population&&record.population.description,record.model,
      record.analysis&&record.analysis.contrast_description,record.arm,record.experimental_arm,record.comparator_arm,
      ...list(record.comparison_arms)];
    return new Set(objects.flatMap(x=>list(x&&x.evidence_ids).concat(list(x&&x.label&&x.label.evidence_ids))).map(id=>localId(record,id)));
  }
  function sameKnownModelScope(row,record){
    for(const key of ['model_id','cutoff_id']){
      const value=record[key]||(record.original_fact||{})[key],own=row[key]||(row.model||{})[key]||(row.original_fact||{})[key]||(key==='model_id'&&row.analysis_id);
      if(value&&(!own||localId(record,value)!==localId(row,own)))return false;
    }
    return true;
  }
  function populationAssignmentEvidence(row,registry){
    const p=row.population||{},description=text(p.description||p.label),ids=unique(list(p.evidence_ids).concat(list(p.description&&p.description.evidence_ids)));
    if(!description)return false;
    const normalized=value=>String(value).normalize('NFKC').toLowerCase().replace(/[‐‑‒–—]/g,'-').replace(/\s+/g,' ').trim();
    const owned=normalized(description),binding=string(row.review_binding_sha256),prefix=binding?'CE-'+binding.slice(0,24)+'-':'';
    const quotes=ids.map(id=>registry[id]||registry[prefix+id]).filter(Boolean).map(e=>e.supporting_quote||e.quote||'');
    return quotes.some(quote=>normalized(quote).includes(owned)&&/\b(randomi[sz](?:ed|ation)|randomly\s+assigned|allocated)\b/i.test(quote));
  }
  function fullAnalysisDescription(row,candidates,scope,group){
    const tokens=value=>String(value||'').normalize('NFKC').toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?/g)||[];
    const allowed=new Set('as treated analysis population full entire all trial study intention to treat itt randomized randomised patients participants subjects cohort group arm and or first second then followed by maintenance no total computed received at least one dose of'.split(' '));
    for(const records of group?group.values():[])for(const record of records)for(const word of tokens(text(record.arm&&record.arm.label)))allowed.add(word);
    for(const record of candidates)if(scopeIds(record,'population').length===1&&scopeIds(record,'population')[0]===scope.population)for(const value of tokens(record.n&&record.n.value))allowed.add(value);
    // A full-analysis descriptor can name its source arms/counts, but not add
    // an unproved biomarker/demographic restriction to the parent trial.
    return tokens(text(row.population&&(row.population.description||row.population.label))).every(word=>allowed.has(word));
  }
  function sampleSizeDisplay(row, options) {
    row = row || {};
    options = Array.isArray(options) ? { samples: options } : (options || {});
    const registry = options.evidenceRegistry || options.evidence_registry || {};
    function finish(records, basis, slots) {
      const values = slots || records.map((r) => ({ text: numberText(r.n), fact: clone(r.n), arm_id: scopeIds(r, 'arm')[0] || null,
        population_id: scopeIds(r, 'population')[0] || null }));
      const sources = [], seen = new Set();
      for (const r of records) {
        const anchors = list(r.n && r.n.evidence).concat(list(r.evidence));
        for (const id of list(r.n && r.n.evidence_ids).concat(list(r.evidence_ids))) if (registry[id]) anchors.push(registry[id]);
        for (const a of anchors) if (anchor(a)) {
          const item = Object.fromEntries(['source_id', 'block_id', 'locator', 'supporting_quote'].map((k) => [k, a[k]===undefined?null:a[k]]));
          const key = JSON.stringify(item); if (!seen.has(key)) { seen.add(key); sources.push(item); }
        }
      }
      return { text: values.length ? values.map((v) => v.text).join(' / ') : '—', values, sources,
        basis, provenance: records.map((r) => ({ basis, fact: clone(r.n), source_record: r })) };
    }
    function none(reason) { return { text: '—', values: [], sources: [], basis: 'not_reported', provenance: [], reason }; }
    const scope = rowScope(row);
    const explicit = row.analysis_n;
    const analysisCountUnit = !string(explicit && explicit.unit) || /^(participants?|patients?|people|persons?|subjects?|count|n|samples?|observations?|lesions?|not_reported)$/i.test(explicit.unit);
    if (numberText(explicit) && analysisCountUnit && hasEvidence(explicit, row)) {
      if ((explicit.analysis_id && explicit.analysis_id !== row.analysis_id) ||
          (explicit.population_id && localId(row,explicit.population_id) !== scope.population) ||
          foreignInlineIdentity(row, explicit)) return none('inconsistent_explicit_analysis_scope');
      return finish([{ ...row, n: explicit }], 'explicit_analysis_n');
    }
    const denominator = row.denominator;
    const countOutcome = !['HR', 'RR', 'OR', 'TR', 'SHR', 'RD', 'MD', 'SMD', 'interaction'].includes(row.measure);
    const denominatorUnits = [denominator && denominator.unit, row.denominator_unit, row.original_fact && row.original_fact.denominator_unit]
      .filter((u) => string(u) && !['not_reported', 'not_applicable'].includes(u));
    if (countOutcome && numberText(denominator) && !foreignInlineIdentity(row, denominator) && denominatorUnits.some(participant) && denominatorUnits.every(participant) &&
        ['analysis_set', 'endpoint_specific', 'safety', 'evaluable', 'treated', 'subgroup', 'randomized'].includes(row.denominator_type) &&
        hasEvidence(denominator, row)) return finish([{ ...row, n: denominator }], 'explicit_outcome_denominator');
    if (scope.conflictingPopulation) return none('conflicting_population_scope');
    // Joined report samples already carry resolved original anchors. Prefer
    // those over a duplicate inline population-count object with IDs only.
    let candidates = list(row.report_samples).concat(list(row.population_counts), list(row.arm_samples), list(options.samples));
    for (const arm of list(row.comparison_arms).concat(row.arm ? [row.arm] : [])) if (arm.n_randomized) {
      candidates.push({ ...Object.fromEntries(['report_id', 'reviewer', 'source_input_sha256', 'draft_artifact_sha256', 'source_packet_sha256', 'derivative_artifact_sha256'].map((k) => [k, row[k]])),
        arm_id: arm.arm_id || arm.entity_id, population_id: arm.population_id || null, denominator_type: 'randomized',
        quantity_label: 'randomized arm sample size', counting_unit: 'participants', n: arm.n_randomized, evidence: arm.evidence });
    }
    const seen = new Set();
    candidates = candidates.filter((r) => {
      const unit = !r.counting_unit || ['not_reported', 'not_applicable'].includes(r.counting_unit) ? r.n && r.n.unit : r.counting_unit;
      if (r.main_result_eligible===false || !sameIdentity(row, r) || !observed(r) || !numberText(r.n) || !participant(unit) ||
          !hasEvidence(r.n, r) || !sameKnownModelScope(row,r)) return false;
      const a = scopeIds(r, 'arm'); if (a.length > 1) return false;
      const key = JSON.stringify([r.sample_record_id || null, scopeIds(r, 'population'), a, r.n]);
      if (seen.has(key)) return false; seen.add(key); return true;
    });
    const randomizedGroups=new Map();
    for(const record of candidates.filter(randomized)){
      const populations=scopeIds(record,'population'),arms=scopeIds(record,'arm');
      if(populations.length!==1||arms.length!==1)continue;
      if(!randomizedGroups.has(populations[0]))randomizedGroups.set(populations[0],new Map());
      const group=randomizedGroups.get(populations[0]);if(!group.has(arms[0]))group.set(arms[0],[]);group.get(arms[0]).push(record);
    }
    const ownedEvidence=scopeEvidence(row);
    function trialPopulationBridge(record){
      if(!scope.trialBridge||!randomized(record))return false;
      const populations=scopeIds(record,'population'),p=record.population||{},description=text(p.description||p.label);
      if(populations.length!==1||p.parent_id||p.parent_population_id||/\b(subgroup|subset|cohort\s*\d|part\s*\d)\b/i.test(description))return false;
      const group=randomizedGroups.get(populations[0]);
      const completePair=group&&group.size===scope.arms.length&&scope.arms.every(arm=>group.has(arm)&&unique(group.get(arm).map(semanticNumber)).length===1);
      const fullParent=scope.fullAnalysis&&scope.parentPopulation===populations[0]&&scopeIds(record,'arm').length===0&&/\b(total|overall|all|population)\b/i.test(label(record))&&(!group||[...group.keys()].every(arm=>scope.arms.includes(arm)))&&fullAnalysisDescription(row,candidates,scope,group);
      if(!fullParent&&(!completePair||!populationAssignmentEvidence(row,registry)))return false;
      return [...scopeEvidence(record)].some(id=>ownedEvidence.has(id));
    }
    candidates=candidates.filter(r=>(matchingScope(r,scope)||trialPopulationBridge(r))&&scopeIds(r,'arm').every(id=>scope.arms.includes(id)));
    const assigned = candidates.filter(randomized);
    const assignedArms = new Set(assigned.flatMap((r) => scopeIds(r, 'arm')));
    const populationOnly = (r) => {
      const populations=scopeIds(r,'population'),group=populations.length===1?randomizedGroups.get(populations[0]):null;
      // Even an exactly linked trial population can contain a third assigned
      // arm outside this contrast. Its global total is not this pair's N.
      const outsidePair=scope.arms.length&&group&&[...group.keys()].some(arm=>!scope.arms.includes(arm));
      return !outsidePair&&scopeIds(r,'arm').length===0&&(!scope.armSpecific||scope.armPopulation);
    };
    const explicitTotal = candidates.filter((r) => populationOnly(r) && (randomized(r) ||
      (scopeIds(r, 'population').length === 1 && scope.arms.length > 1 && scope.arms.every((a) => assignedArms.has(a)) &&
       /\b(total|enrolled|recruited|participants?|patients?)\b/i.test(label(r)))));
    if (explicitTotal.length) {
      const strong = explicitTotal.filter(randomized), totals = strong.length ? strong : explicitTotal;
      if(options.randomizedTotalOnly&& !strong.length)return none('no_explicit_scoped_randomized_total');
      if (unique(totals.map(semanticNumber)).length !== 1) return none('conflicting_reported_totals');
      return finish([totals[0]], 'scoped_reported_randomized_total');
    }
    if(options.randomizedTotalOnly)return none('no_explicit_scoped_randomized_total');
    const armRecords = [], slots = [];
    for (const arm of scope.arms) {
      const records = assigned.filter((r) => scopeIds(r, 'arm').length === 1 && scopeIds(r, 'arm')[0] === arm);
      if (records.length && unique(records.map(semanticNumber)).length !== 1) return none('conflicting_reported_arm_counts');
      if (records.length) { armRecords.push(records[0]); slots.push({ text: numberText(records[0].n), fact: clone(records[0].n), arm_id: arm, population_id: scope.population }); }
      else slots.push({ text: '—', fact: null, arm_id: arm, population_id: scope.population });
    }
    return armRecords.length ? finish(armRecords, 'scoped_randomized_arm_counts', slots) : none('no_explicit_scoped_sample_size');
  }
  function reportedRandomizedTotal(row,options){
    const sourceOptions=Array.isArray(options)?{samples:options}:(options||{});
    // Detached study context, never a replacement for an explicitly reported
    // analysis N. The ordinary exact source/population/arm checks still apply.
    return sampleSizeDisplay({...row,analysis_n:null,denominator:null},{...sourceOptions,randomizedTotalOnly:true});
  }
  return Object.freeze({ sampleSizeDisplay,reportedRandomizedTotal });
}));
