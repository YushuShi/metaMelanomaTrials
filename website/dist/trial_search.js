(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./trial_identifiers.js'), require('./trial_registry.js'));
  else root.TrialSearch = factory(root.TrialIdentifiers, root.TrialRegistry);
})(globalThis, function(identifiers, catalogue) {
  'use strict';
  const compact = text => String(text).normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]/gu,'');
  const unpad = key => key.replace(/\d+/g, digits => digits.replace(/^0+(?=\d)/,''));
  const alternateKey = key => !key.startsWith('nct') && /\p{L}/u.test(key) ? unpad(key) : key;
  const parts = value => (Array.isArray(value) ? value : [value]).filter(v =>
    typeof v === 'string' && v.trim() && !/^(?:NA|N\/A|unknown|not reported|null|—)$/i.test(v.trim()));
  const catalogueKey = row => JSON.stringify([row.canonical_name, row.nct_ids]);
  const records = new Map();
  for (const row of catalogue.records) {
    const key = catalogueKey(row);
    if (!records.has(key)) records.set(key, []);
    records.get(key).push(row);
  }

  function index({names, nct, pmid} = {}) {
    const reported = parts(names).flatMap(name => name.split(/\s*;\s*/));
    const registrations = new Set();
    for (const field of [...parts(nct), ...reported]) {
      for (const match of field.matchAll(/\bNCT[\s-]*(\d{8})\b/gi)) registrations.add('NCT' + match[1]);
    }
    if (!reported.length && !registrations.size) return [];
    const resolved = identifiers.harmonize({names:reported, nct_ids:[...registrations], pmid});
    const aliases = [];
    for (const identity of resolved.provenance) {
      if (resolved.status === 'conflicting' || identity.source_kind !== 'verified_trial_catalogue') continue;
      for (const row of records.get(catalogueKey(identity)) || []) {
        if (row.pmids_restricted_resolution?.length && !row.pmids_restricted_resolution.includes(String(pmid))) continue;
        aliases.push(...parts(row.aliases), ...parts(row.nct_aliases), ...parts(row.other_ids));
      }
    }
    const visibleNct = new Set([...registrations, ...resolved.nct_ids].map(compact));
    const labels = new Set([...reported, ...registrations, ...resolved.names, ...resolved.nct_ids, ...aliases]);
    // Registries sometimes publish two protocol identifiers in one field.
    for (const alias of aliases) if (alias.includes('/')) {
      for (const label of alias.split('/').map(part => part.trim()).filter(Boolean)) labels.add(label);
    }
    return [...labels].map(label => {
      const key = compact(label);
      return {label, key, alternate:alternateKey(key), registration:visibleNct.has(key)};
    });
  }

  function matchingTerm(query) {
    const key = compact(query);
    const alternate = alternateKey(key);
    return term => Boolean(key) && (term.key.includes(key) || term.alternate.includes(alternate));
  }

  function matches(terms, query) {
    return !query?.trim() || terms.some(matchingTerm(query));
  }

  function matchedAlias(terms, query, displayedName) {
    if (!query?.trim()) return '';
    const hit = matchingTerm(query);
    const visible = parts(displayedName).some(label => {
      const key = compact(label);
      return hit({key, alternate:alternateKey(key)});
    });
    if (visible) return '';
    const found = terms.filter(hit);
    if (found.some(term => term.registration)) return '';
    return found.reduce((best, term) => !best || term.label.length < best.length ? term.label : best, '');
  }

  function displayName(terms, query, name) {
    const alias = matchedAlias(terms, query, name);
    if (!alias) return name;
    return parts(name).length ? name + ' (' + alias + ')' : alias;
  }

  function field(tab) {
    const label = ('Search ' + tab + ' by trial name or NCT number').replace(/[&<>"']/g,
      c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
    return '<label class="trial-search"><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg>' +
      '<input type="search" data-trial-search autocomplete="off" spellcheck="false" placeholder="Trial name or NCT number" aria-label="' +
      label + '"></label>';
  }
  return Object.freeze({field, index, matches, matchedAlias, displayName});
});
