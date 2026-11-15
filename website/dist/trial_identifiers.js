/* Source-qualified study identifiers shared by tables and the treatment graph.
 * Reviewed primary registrations (not inferred from a drug, disease, or trial name):
 * EORTC 18951: https://www.eortc.org/research_field/clinical-detail/18951/
 * E1609: https://cdn.clinicaltrials.gov/large-docs/38/NCT01274338/Prot_SAP_000.pdf
 * CheckMate 064: https://pmc.ncbi.nlm.nih.gov/articles/PMC5474305/ (own trial registration).
 * Other identifiers require own citation metadata or a supported own metadata fact.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./trial_registry.js'));
  else root.TrialIdentifiers = factory(root.TrialRegistry);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (registryCatalogue) {
  'use strict';
  const text = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const uniq = values => [...new Set(values.filter(Boolean))];
  const ncts = value => uniq((text(value).match(/\bNCT\d{8}\b/gi) || []).map(x => x.toUpperCase()));
  const list = value => Array.isArray(value) ? value : [];
  const key = value => text(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\d+/g, n => String(Number(n)));
  const records = list(registryCatalogue?.records);
  const byName = new Map(), byNct = new Map(), retiredNcts = new Map();
  for (const record of records) {
    for (const name of uniq([record.canonical_name, ...list(record.aliases)])) {
      const k = key(name); if (!k) continue;
      if (!byName.has(k)) byName.set(k, []); byName.get(k).push(record);
    }
    for (const id of list(record.nct_ids)) {
      if (!byNct.has(id)) byNct.set(id, []); byNct.get(id).push(record);
    }
    if (list(record.nct_ids).length === 1) for (const id of list(record.nct_aliases)) {
      if (!retiredNcts.has(id)) retiredNcts.set(id, []); retiredNcts.get(id).push(record);
    }
  }
  function spelling(value) {
    return text(value).replace(/\bCheckMate[ -]?(\d{1,4})\b/gi, (_, n) => 'CheckMate ' + n.padStart(3, '0'))
      .replace(/\bKEYNOTE[ -]?(\d{1,4})\b/gi, (_, n) => 'KEYNOTE-' + n.padStart(3, '0'))
      .replace(/\bRELATIVITY[ -]?(\d{1,4})\b/gi, (_, n) => 'RELATIVITY-' + n.padStart(3, '0'));
  }
  function harmonize(input) {
    input = input || {};
    const reportedNames = uniq(list(input.names).map(text).filter(n => n && !/^(?:NA|N\/A|unknown|null)$/i.test(n)));
    const named = reportedNames.filter(n => !/^NCT\d{8}$/i.test(n));
    const reportedIds = uniq(list(input.nct_ids).flatMap(ncts));
    const names = [], provenance = list(input.provenance).slice(), issues = list(input.issues).slice();
    const ids = uniq(reportedIds.map(id => {
      const matches = retiredNcts.get(id) || [], primary = uniq(matches.flatMap(r => r.nct_ids));
      if (primary.length !== 1) return id;
      provenance.push({source_kind:'registry_confirmed_retired_registration', reported_nct:id, canonical_nct:primary[0],source_urls:uniq(matches.flatMap(r => list(r.source_urls)))});
      return primary[0];
    }));
    const eligible = record => !list(record.pmids_restricted_resolution).length || record.pmids_restricted_resolution.map(String).includes(String(input.pmid || ''));
    const resolved = [];
    const remember = record => {
      names.push(record.canonical_name); resolved.push(record);
      provenance.push({source_kind:'verified_trial_catalogue', canonical_name:record.canonical_name,
        nct_ids:list(record.nct_ids), source_urls:list(record.source_urls), other_ids:list(record.other_ids)});
    };
    for (const raw of named) {
      // Split only explicitly named trials/aliases, never sponsor words or arbitrary prose.
      const exact = (byName.get(key(raw)) || []).filter(eligible);
      const explicitList = raw.split(/\s+(?:and|&)\s+|\s*[;/]\s*/i).filter(Boolean);
      const completeList = explicitList.length > 1 && explicitList.every(n => (byName.get(key(n)) || []).some(eligible));
      const parts = exact.length ? [raw] : completeList ? explicitList : trialNames(raw);
      for (const name of (parts.length ? parts : [raw])) {
        let matches = (byName.get(key(name)) || []).filter(eligible);
        if (ids.length && matches.length) {
          const compatible = matches.filter(r => !list(r.nct_ids).length || r.nct_ids.some(id => ids.includes(id)));
          if (!compatible.length) {
            names.push(spelling(name));
            issues.push('Conflicting trial name and registration: ' + name + ' / ' + ids.join('; '));
            continue;
          }
          matches = compatible;
        }
        const unique = uniq(matches.map(r => r.canonical_name));
        const registrations = uniq(matches.flatMap(r => list(r.nct_ids)));
        if (unique.length === 1 && (ids.length || registrations.length <= 1)) matches.forEach(remember);
        else { names.push(spelling(name)); if (matches.length) issues.push('Ambiguous trial alias: ' + name); }
      }
    }
    if (input.infer_registrations !== false && !reportedIds.length) {
      for (const record of resolved) ids.push(...list(record.nct_ids));
    }
    // Registration-only reports acquire a name only when the catalogue identifies
    // one trial/cohort. Shared registrations (e.g. PRADO / OpACIN-neo) stay distinct.
    for (const id of ids) {
      const matches = (byNct.get(id) || []).filter(eligible);
      if (!named.length && uniq(matches.map(r => r.canonical_name)).length === 1) matches.forEach(remember);
    }
    // A unique source-reported registration also standardizes a descriptive
    // study label. Its original wording remains in reported_names. Never do
    // this for shared registrations, multiple trials or an explicit conflict.
    if (ids.length === 1 && named.length === 1 && !resolved.length && !issues.some(i => /^Conflicting|^Ambiguous/.test(i))) {
      const matches = (byNct.get(ids[0]) || []).filter(eligible);
      if (uniq(matches.map(r => r.canonical_name)).length === 1) { names.length = 0; matches.forEach(remember); }
    }
    const canonicalNames = uniq(names), canonicalIds = uniq(ids), distinctIssues = uniq(issues);
    const conflicting = input.status === 'conflicting' || distinctIssues.some(i => /^Conflicting/.test(i));
    return {...input, names:canonicalNames, nct_ids:canonicalIds, own_trial_names:canonicalNames, source_trial_names:[],
      trial_label:canonicalNames.join('; ') || 'NA', nct_label:(conflicting && canonicalIds.length ? 'Conflicting: ' : '') + (canonicalIds.join('; ') || 'NA'),
      reported_names:reportedNames, reported_nct_ids:reportedIds,
      independent_cohort_keys:uniq(resolved.map(r => r.independent_cohort_key)),
      provenance, issues:distinctIssues, status:conflicting ? 'conflicting' : canonicalNames.length || canonicalIds.length ? 'source_qualified' : 'not_available'};
  }
  function registrationIds(value, requireCue) {
    const ids=[];
    for (const sentence of text(value).split(/(?<=[.!?])\s+/)) {
      if (/\b(?:previous|prior|earlier|another|other|referenced|cited|background)\s+(?:(?:clinical|randomi[sz]ed|phase\s+[ivx\d]+)\s+)*(?:study|trial)\b|\b(?:study|trial)\s+(?:cited|previously reported)\b/i.test(sentence)) continue;
      if (requireCue && !/\btrial registration\b|\b(?:this|the) (?:trial|study) (?:is|was) registered\b/i.test(sentence)) continue;
      ids.push(...ncts(sentence));
    }
    return uniq(ids);
  }
  function trialNames(value) {
    const s = text(value).replace(/\bCOMBI-d\s*\/\s*v\b/gi, 'COMBI-d COMBI-v'), out = [], hits = [];
    for (const [re, format] of [
      [/\bCheckMate[ -]?(\d{1,4})\b/gi, m => 'CheckMate ' + m[1].padStart(3, '0')],
      [/\bKEYNOTE[ -]?(\d{1,4})\b/gi, m => 'KEYNOTE-' + m[1].padStart(3, '0')],
      [/\bRELATIVITY[ -]?(\d{1,4})\b/gi, m => 'RELATIVITY-' + m[1].padStart(3, '0')],
      [/\bEORTC[ -]?(\d{4,6})(-MG)?\b/gi, m => 'EORTC ' + m[1] + (m[2] || '')],
      [/\b(?:Intergroup\s+)?(E\d{4})\b/gi, m => m[1].toUpperCase()],
      [/\b(COMBI-[dv])\b/gi, m => 'COMBI-' + m[1].slice(-1).toLowerCase()],
      [/\b(COLUMBUS|coBRIM|IMspire150|DREAMseq|BEAM)\b(?!-[A-Za-z])/gi, m => ({columbus:'COLUMBUS',cobrim:'coBRIM',imspire150:'IMspire150',dreamseq:'DREAMseq',beam:'BEAM'})[m[1].toLowerCase()]]
    ]) { let m; while ((m = re.exec(s))) hits.push({name:format(m),start:m.index,end:m.index+m[0].length}); }
    // Published abbreviation explicitly names both adopted studies, not a new COMBI-d/v trial.
    if (/European Organisation for Research and Treatment of Cancer/i.test(s) && /\btrial\s*\(18951\)/i.test(s)) out.push('EORTC 18951');
    // Only reviewed formal catalogue names are scanned; generic protocol codes
    // are exact-match aliases, not words to find anywhere in a paper title.
    for (const record of records) for (const name of uniq([record.canonical_name, ...list(record.searchable_aliases)])) {
      if (!name || name.length < 4 || /\s.{35}/.test(name)) continue;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[- ]/g, '[- ]?');
      for (const match of s.matchAll(new RegExp('\\b' + escaped + '\\b', 'g'))) {
        const start=match.index,end=start+match[0].length,before=s.slice(0,start),after=s.slice(end);
        const entire=!text(before)&&!text(after);
        const bracketed=/[(;/:]\s*$/.test(before)&&/^\s*[);/:,]/.test(after);
        const namedTrial=/(?:\btrial|\bstudy)\s*(?:named\s+|called\s+)?\(?\s*$/.test(before)||/^\s+(?:trial|study)\b/.test(after);
        // IMPACT/PREDICT can be ordinary title words and OX40 is a biological
        // target. Exact aliases remain supported, but prose needs named-trial
        // framing and the registered case, never a substring of MSK-IMPACT.
        if((entire||bracketed||namedTrial)&&!/[A-Za-z0-9-]$/.test(before))hits.push({name,start,end});
      }
    }
    // COLUMBUS-AD is not also COLUMBUS; an acronym inside a longer named trial
    // must not introduce an unrelated registration. Separate mentions survive.
    out.push(...hits.filter(hit => !hits.some(other => other.start <= hit.start && other.end >= hit.end && other.end-other.start > hit.end-hit.start)).map(hit => hit.name));
    return uniq(out);
  }
  const reviewed = Object.freeze([
    {pmid:'16170182', report:'report-810650fbf4cc06b9e404ee73', doi:'10.1200/jco.2005.03.202', name:'EORTC 18951', nct:'NCT00002669', url:'https://www.eortc.org/research_field/clinical-detail/18951/', title:/\btrial\s*\(18951\)/i},
    {pmid:'31880964', report:'report-bff903cad8b9e2a35cced0ab', doi:'10.1200/jco.19.01381', name:'E1609', nct:'NCT01274338', url:'https://cdn.clinicaltrials.gov/large-docs/38/NCT01274338/Prot_SAP_000.pdf', title:/\bE1609\b/},
    {pmid:'27269740', report:'report-eb4e1504cd454b6a073ef0af', doi:'10.1016/s1470-2045(16)30126-7', name:'CheckMate 064', nct:'NCT01783938', url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC5474305/', title:/\bCheckMate\s+064\b/i},
    {pmid:'23402397', report:'report-020c0a6128b8320e3aeaae9b', doi:'10.1186/1479-5876-11-38', name:null, nct:'NCT01359956', url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC3598549/', title:/^Phase III randomized study of fotemustine and dacarbazine versus dacarbazine/i}
  ]);
  function quote(registry, review, id) {
    const key = 'CE-' + review.review_namespace + '-' + id;
    const e = registry[key] || registry[id];
    return e && typeof e === 'object' ? text(e.supporting_quote || e.quote || e.text) : text(e);
  }
  function explicitName(value, supporting) {
    const label = text(value).replace(/^trial (?:name|identifier)\s*:\s*/i, '').replace(/\s+(?:trial|study)$/i, '');
    if (!label || label.length > 80 || /[.!?;\n]/.test(label) || ncts(label).length || /\b(?:phase|randomi[sz]ed|open.label|double.blind|patients|melanoma group|factorial|clinical trial)\b/i.test(label)) return [];
    const quoted = text(supporting).toLowerCase();
    // Unknown formal names are admitted from explicit own trial-name metadata,
    // not guessed from capital letters elsewhere in the paper.
    return quoted.includes(label.toLowerCase()) ? [label] : [];
  }
  function get(study, options) {
    study = study || {}; options = options || {};
    const details = study.details || {}, citation = details.citation || study.citation || {};
    const registry = options.registry || {};
    const title = text(study.title || citation.title);
    const abstract = text(citation.abstract || study.abstract);
    const pmid = text(String(study.pmid || citation.pmid || ''));
    const doi = text(study.doi || citation.doi).toLowerCase();
    const names = [], ids = [], sources = [], provenance = [], issues = [];
    const indirect = /matching[ -]adjusted indirect comparison|\bMAIC\b|network meta[ -]analysis|systematic review|meta[ -]analysis/i.test(title);
    function add(field, values, basis, relation) {
      for (const value of values) {
        (field === 'name' ? (relation === 'data_source_trial' ? sources : names) : ids).push(value);
        provenance.push(Object.assign({field, value, relation:relation || 'own_study'}, basis));
      }
    }
    if (!indirect) {
      add('name', trialNames(title), {source_kind:'own_publication_title', source_path:'title'}, 'own_study');
      // PubMed/citation structured registrations, not identifiers found in arbitrary body text.
      add('nct', ncts((Array.isArray(citation.trial_identifiers) ? citation.trial_identifiers : []).join(' ')), {source_kind:'structured_citation', source_path:'details.citation.trial_identifiers'}, 'own_study');
    }
    const reviews = Array.isArray(study.reviews) ? study.reviews : (Array.isArray(details.clinical_reviews) ? details.clinical_reviews : []);
    for (const r of reviews) {
      for (const wrapper of (r.facts || [])) {
        const f = wrapper.fact || wrapper;
        if (f.evidence_origin !== 'own_report_results' || f.scope !== 'observed' || !['study_identification','study_design'].includes(f.domain)) continue;
        const evidence = (f.evidence_ids || []).map(id => quote(registry, r, id));
        const supported = evidence.filter(Boolean).join(' ');
        if (!supported) continue;
        const basis = {source_kind:'source_supported_metadata_fact', review_namespace:r.review_namespace || null,
          fact_id:f.fact_id, evidence_ids:(f.evidence_ids || []).slice()};
        if (!indirect && /registration|trial[_ -]?(?:name|identifier|number)/i.test(f.field || '')) {
          const candidates = ncts(text(f.reported_trial) + ' ' + text(f.text));
          add('nct', candidates.filter(id => registrationIds(supported, false).includes(id)), basis, 'own_study');
          add('name', trialNames(text(f.reported_trial) + ' ' + text(f.text)).filter(n => trialNames(supported).includes(n)), basis, 'own_study');
          if (/^trial[_ -]?(?:name|identifier|number)$/i.test(f.field || '')) {
            add('name', explicitName(f.reported_trial || f.text, supported), basis, 'own_study');
          }
        }
        // MAIC source-trial lists require an own Methods/identity statement of actual data use.
        if (indirect && /(?:patient.level|individual patient|aggregate) data/i.test(supported) && /\b(?:used|adopted|from)\b/i.test(supported)) {
          // A broad span can also discuss trials not adopted. Require the own metadata
          // statement to name the same trial; do not sweep its entire supporting paragraph.
          add('name', trialNames(f.text).filter(n => trialNames(supported).includes(n)), basis, 'data_source_trial');
        }
      }
    }
    // A registration is supplemented only for this exact reviewed publication identity.
    for (const r of reviewed) {
      if (pmid !== r.pmid || doi !== r.doi || !r.title.test(title)) continue;
      if (study.report_id && study.report_id !== r.report) { issues.push('Reviewed registration binding differs from report identity'); continue; }
      if (r.name && !trialNames(title).includes(r.name)) continue;
      add('nct', [r.nct], {source_kind:'reviewed_primary_registry', source_url:r.url, pmid:r.pmid, doi:r.doi}, 'own_study');
    }
    // Abstract registrations have an explicit local own-registration cue; background NCTs are ignored.
    if (!indirect && abstract) {
      add('nct', registrationIds(abstract, true), {source_kind:'own_abstract_registration', source_path:'details.citation.abstract'}, 'own_study');
    }
    const ownNames = uniq(names), sourceNames = uniq(sources), nctIds = uniq(ids);
    if (reviewed.some(r => r.pmid === pmid && doi === r.doi && r.title.test(title)) && nctIds.length > 1) issues.push('Conflicting registration identifiers for the reviewed publication');
    if (indirect && !sourceNames.length) issues.push('No source-qualified constituent-trial list available');
    if (options.comparison && sourceNames.length) issues.push('Study-level source-trial list; no per-comparison trial attribution asserted');
    const allNames = ownNames.length ? ownNames : sourceNames;
    const result = harmonize({names:allNames, nct_ids:nctIds, provenance, issues, pmid, infer_registrations:false});
    if (!ownNames.length && sourceNames.length) return {...result, trial_label:'Source trials: ' + result.names.join('; '), own_trial_names:[], source_trial_names:result.names};
    return result;
  }
  return Object.freeze({get, harmonize});
}));
