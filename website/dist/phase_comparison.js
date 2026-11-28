(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(() => require('./app.js'), require('./trial_search.js'));
  else root.PhaseComparison = factory(() => root.MetaSampleSizeCharts, root.TrialSearch);
})(globalThis, function(studies, trialSearch) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const byName = (a, b) => a.localeCompare(b, 'en', {numeric:true});
  const newest = (a, b) => (b || '').localeCompare(a || '');
  const noMatch = 'No corresponding phase III trial identified';
  const statusOptions = [
    ['published', 'Results published in both phases'],
    ['completed', 'Phase III completed in registry'],
    ['recruiting', 'Phase III recruiting'],
    ['missing', noMatch],
    ['other', 'Other linked phase III status']
  ];
  const registryLabels = {
    COMPLETED:'completed', RECRUITING:'recruiting', ACTIVE_NOT_RECRUITING:'active, closed to recruitment',
    ENROLLING_BY_INVITATION:'enrolling by invitation', NOT_YET_RECRUITING:'not yet recruiting',
    SUSPENDED:'suspended', TERMINATED:'terminated', WITHDRAWN:'withdrawn'
  };

  function registryCategory(trial) {
    if (trial.registry_status === 'COMPLETED') return 'completed';
    if (trial.registry_status === 'RECRUITING') return 'recruiting';
    return 'other';
  }

  const searchIndexes = new WeakMap();
  function searchIndex(trial) {
    if (!searchIndexes.has(trial)) {
      searchIndexes.set(trial, trialSearch.index({names:[trial.name, ...(trial.aliases || [])], nct:trial.nct, pmid:trial.primary_pmid}));
    }
    return searchIndexes.get(trial);
  }

  function matchesSearch(trial, query) {
    return !query || trialSearch.matches(searchIndex(trial), query);
  }

  function matchingGroups(groups, drug, setting, status = '', search = '') {
    const query = search.trim();
    let visible = groups.filter(group => (!drug || group.drugs.includes(drug)) && (!setting || group.setting === setting));
    if (status || query) visible = visible.flatMap(group => {
      const eligible = group.phase3.filter(trial => status === 'published' ? trial.primary_results_pmid : !status || registryCategory(trial) === status);
      const eligibleIds = new Set(eligible.map(trial => trial.id));
      const searchedIds = query ? new Set(eligible.filter(trial => matchesSearch(trial, query)).map(trial => trial.id)) : eligibleIds;
      const phase2 = group.phase2.flatMap(trial => {
        const ownMatch = matchesSearch(trial, query);
        if (!trial.match_ids.length) return (!status || status === 'missing') && ownMatch ? [trial] : [];
        const ids = ownMatch ? eligibleIds : searchedIds;
        const match_ids = trial.match_ids.filter(id => ids.has(id));
        return match_ids.length ? [{...trial, match_ids}] : [];
      });
      if (!phase2.length) return [];
      const shownIds = new Set(phase2.flatMap(trial => trial.match_ids));
      const phase3 = eligible.filter(trial => shownIds.has(trial.id));
      const sort_date = phase2.map(trial => trial.primary_date || '').sort(newest)[0];
      return [{...group, phase2, phase3, sort_date}];
    });
    return visible.sort((a, b) => newest(a.sort_date, b.sort_date) || byName(a.regimen, b.regimen) || byName(a.setting, b.setting));
  }

  function dateHTML(value) {
    if (!value) return 'Date unknown';
    const [year, month, day] = value.split('-');
    if (!month) return escape(year);
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day || 1)));
    const label = date.toLocaleDateString('en-US', {year:'numeric', month:'short', ...(day ? {day:'numeric'} : {}), timeZone:'UTC'});
    return '<time datetime="' + escape(value) + '">' + escape(label) + '</time>';
  }

  function completionHTML(trial) {
    if (trial.registry_status !== 'RECRUITING') return '';
    const milestones = [[trial.registry_primary_completion, 'primary completion'], [trial.registry_completion, 'study completion']];
    return milestones.flatMap(([milestone, label]) => {
      if (!milestone?.date || !['ESTIMATED','ACTUAL'].includes(milestone.type)) return [];
      const caption = milestone.type === 'ESTIMATED' ? 'Estimated ' + label : label[0].toUpperCase() + label.slice(1);
      return '<small>' + caption + ' · ' + dateHTML(milestone.date) + '</small>';
    }).join('');
  }

  function link(url, label, title) {
    if (!url || !/^https?:\/\//i.test(url)) return escape(label);
    return '<a href="' + escape(url) + '" target="_blank" rel="noopener noreferrer"' +
      (title ? ' title="' + escape(title) + '"' : '') + '>' + escape(label) + '</a>';
  }

  function citation(publication) {
    const {pmid, title, url} = publication;
    return link(url || (pmid && 'https://pubmed.ncbi.nlm.nih.gov/' + encodeURIComponent(pmid) + '/'),
      pmid ? 'PMID ' + pmid : title || 'Source', title);
  }

  function trialHTML(trial, phase, group, matchBasis) {
    if (!trial) return '<span class="phase-missing">' + noMatch + '</span>';
    const publications = trial.publications || [];
    const primary = publications.find(p => (p.pmid && String(p.pmid) === String(trial.primary_pmid)) ||
      (trial.primary_url && p.url === trial.primary_url)) ||
      (!trial.primary_pmid && trial.primary_date && publications.find(p => p.date === trial.primary_date));
    const registryURL = trial.registry_url || (trial.nct && 'https://clinicaltrials.gov/study/' + encodeURIComponent(trial.nct));
    let html = '<strong class="phase-trial-name">' +
      (trial.name === trial.nct ? link(registryURL, trial.name) : escape(trial.name)) + '</strong>';
    if (trial.status) {
      const waiting = /awaiting|pending|ongoing|recruiting/i.test(trial.status);
      html += '<span class="phase-status' + (waiting ? ' phase-status-pending' : '') + '">' + escape(trial.status) + '</span>';
      const statusDate = trial.status_as_of || publications.map(p => p.date).filter(Boolean).sort().pop();
      if (statusDate) html += '<small>Status as of ' + dateHTML(statusDate) + '</small>';
    }
    const registryStatus = registryLabels[trial.registry_status];
    if (phase === 3 && registryStatus && trial.status?.toLowerCase() !== registryStatus) {
      html += '<small>Registry · ' + link(registryURL, registryStatus) +
        (trial.registry_status_as_of ? ' · ' + dateHTML(trial.registry_status_as_of) : '') + '</small>';
    }
    if (phase === 3) html += completionHTML(trial);
    const regimen = trial.regimen || group.regimen;
    html += '<small class="phase-regimen"><b>Regimen</b> ' + studies().savedTreatmentTag(regimen) +
      (trial.comparator ? ' <b>vs</b> ' + studies().savedTreatmentTag(trial.comparator) : '') + '</small>';
    if (phase === 2 && group.setting) html += '<small><b>Setting</b> ' + escape(group.setting) + '</small>';
    if (trial.population) html += '<small>' + escape(trial.population) + '</small>';
    if (matchBasis) html += '<small><b>Why linked</b> · ' + escape(matchBasis.label) +
      (matchBasis.source_url ? ' ' + link(matchBasis.source_url, 'Source') : '') + '</small>';
    if (phase === 2 || trial.primary_date) {
      html += '<small>First results · ' + dateHTML(trial.primary_date) +
        (primary ? ' · ' + citation(primary) : '') + '</small>';
    }
    if (registryURL && trial.name !== trial.nct) {
      html += '<small>' + link(registryURL, trial.nct || 'Registry record') + '</small>';
    }
    const more = publications.filter(p => p !== primary);
    if (more.length) {
      html += '<details><summary>Additional sources (' + more.length + ')</summary><ul>' +
        more.map(p => '<li>' + citation(p) + (p.date ? ' · ' + dateHTML(p.date) : '') + (p.pmid && p.title ? ' · ' + escape(p.title) : '') + '</li>').join('') + '</ul></details>';
    }
    return html;
  }

  function alignedRows(left, right) {
    const rows = new Map();
    function add(outcomes, side) {
      for (const result of outcomes || []) {
        if (!rows.has(result.key)) rows.set(result.key, {key:result.key, label:result.label, left:[], right:[]});
        rows.get(result.key)[side].push(result);
      }
    }
    add(left, 'left');
    add(right, 'right');
    return [...rows.values()].sort((a, b) => byName(a.label, b.label) || byName(a.key, b.key));
  }

  function resultHTML(result) {
    const arms = result.comparison;
    const regimen = name => escape(name.replace(/\s*(?:→|->)\s*/g, ' followed by '));
    const direction = arms?.treatment && arms.reference ?
      '<small class="phase-effect-direction">' + regimen(arms.treatment) + ' <b>versus</b> ' +
      regimen(arms.reference) + ' (reference)</small>' : '';
    const denominator = result.denominator ? '<small>' + (typeof result.denominator === 'number' ? 'Outcome N=' : '') + escape(result.denominator) + '</small>' : '';
    const registry = /^https?:\/\/(?:www\.)?clinicaltrials\.gov\//i.test(result.sourceUrl || '');
    const sourceLabel = result.sourceLabel ? link(result.sourceUrl, result.sourceLabel) :
      registry ? link(result.sourceUrl, /[?&#](?:tab=)?results/i.test(result.sourceUrl) ? 'Registry results' : 'Trial registry') :
      citation({pmid:result.pmid, url:result.sourceUrl});
    const source = result.pmid || result.sourceUrl ? '<small>' + sourceLabel +
      (result.date ? ' · ' + dateHTML(result.date) : '') + '</small>' : '';
    const note = result.note ? '<small>' + escape(result.note) +
      (result.noteSourceUrl ? ' ' + link(result.noteSourceUrl, 'Publication') : '') + '</small>' : '';
    const pending = result.status === 'pending' || /^Awaiting\b/i.test(result.value);
    return '<div class="phase-result' + (pending ? ' phase-pending' : '') + '"><strong>' + escape(result.value) +
      '</strong>' + direction + denominator + source + note + '</div>';
  }

  function cell(results, hasTrial) {
    if (results.length) return results.map(resultHTML).join('');
    return hasTrial ? '<span class="phase-missing" title="No matching estimate for this measure in the saved trial data.">Not reported here</span>' : '<span class="phase-missing" aria-label="' + noMatch + '">—</span>';
  }

  function comparisonTable(group, trial, match) {
    const rows = alignedRows(trial.outcomes, match?.outcomes);
    // A source can defer the entire endpoint without specifying a median or
    // landmark. Show that status beside the phase II measurements only while
    // phase III has no reported measurement of that endpoint.
    const pendingByRow = new Map();
    const usedStatuses = new Set();
    for (const status of rows.filter(row => row.key.endsWith('|status') && !row.left.length && row.right.some(r => r.status === 'pending'))) {
      const prefix = status.key.slice(0, -'status'.length);
      const measures = rows.filter(row => row !== status && row.key.startsWith(prefix));
      if (!measures.length || measures.some(row => row.right.length)) continue;
      for (const row of measures) pendingByRow.set(row, status.right);
      usedStatuses.add(status);
    }
    const header = '<colgroup><col class="phase-measure-col"><col><col></colgroup>' +
      '<thead><tr><th scope="col">Outcome</th><th scope="col">Phase II</th><th scope="col">Phase III</th></tr></thead>';
    const matchBasis = match && trial.match_basis?.[match.id];
    const trialRow = '<tr class="phase-trial"><th scope="row">Trial</th><td>' + trialHTML(trial, 2, group) +
      '</td><td>' + trialHTML(match, 3, group, matchBasis) + '</td></tr>';
    let resultRows = rows.filter(row => !usedStatuses.has(row)).map(row => '<tr data-phase-outcome="' + escape(row.key) + '"><th scope="row">' +
      escape((row.left[0] || row.right[0]).outcomeLabel || row.label) + '</th><td>' + cell(row.left, true) + '</td><td>' +
      cell(pendingByRow.get(row) || row.right, !!match) + '</td></tr>').join('');
    if (!rows.length) {
      const details = t => {
        const url = t?.primary_url || (t?.primary_pmid && 'https://pubmed.ncbi.nlm.nih.gov/' + t.primary_pmid + '/');
        return url ? link(url, 'See published results') : cell([], !!t);
      };
      resultRows = '<tr><th scope="row">Results</th><td>' + details(trial) + '</td><td>' + details(match) + '</td></tr>';
    }
    return '<div class="table-scroll phase-table-wrap"><table class="evidence-tab-table phase-table"><caption class="sr-only">' +
      escape([group.regimen, group.setting, trial.name, match?.name].filter(Boolean).join(' · ')) +
      '</caption>' + header + '<tbody>' + trialRow + resultRows + '</tbody></table></div>';
  }

  function summaryLabel(trial, phase, query) {
    const name = escape(query ? trialSearch.displayName(searchIndex(trial), query, trial.name) : trial.name);
    const info = phase === 'II' || trial.primary_date ? dateHTML(trial.primary_date) :
      escape(registryLabels[trial.registry_status] || trial.status || 'Status unknown');
    return '<span class="phase-summary-label"><strong>Phase ' + phase + ' · ' + name + '</strong><small>' + info + '</small>' +
      (phase === 'III' ? completionHTML(trial) : '') + '</span>';
  }

  function trialListHTML(groups, {expanded, deferred, query = ''} = {}) {
    const entries = new Map();
    for (const group of groups) {
      const phase3 = new Map(group.phase3.map(trial => [trial.id, trial]));
      for (const trial of group.phase2) {
        const key = JSON.stringify([trial.nct || trial.id, trial.name, trial.primary_date || '', trial.primary_pmid || trial.primary_url || '']);
        if (!entries.has(key)) entries.set(key, {key, trial, arms:[], phase3:new Map()});
        const entry = entries.get(key);
        const matches = [...new Set(trial.match_ids)].map(id => phase3.get(id)).filter(Boolean);
        entry.arms.push({group, trial, matches});
        for (const match of matches) entry.phase3.set(match.id, match);
      }
    }
    return [...entries.values()].sort((a, b) => newest(a.trial.primary_date, b.trial.primary_date) ||
      byName(a.trial.name, b.trial.name) || byName(a.key, b.key)).map(entry => {
      const {key, trial, arms, phase3} = entry;
      const tables = () => arms.map(arm => arm.matches.length ?
        arm.matches.map(match => comparisonTable(arm.group, arm.trial, match)).join('') :
        comparisonTable(arm.group, arm.trial, null)).join('');
      const open = expanded?.has(key);
      const lazy = deferred && !open;
      if (lazy) deferred.set(key, tables);
      const matches = [...phase3.values()].map(match => summaryLabel(match, 'III', query)).join('');
      return '<details class="phase-cohort" data-phase-key="' + escape(key) + '"' + (open ? ' open' : '') + '><summary>' +
        '<span class="phase-cohort-heading">' + summaryLabel(trial, 'II', query) + '<span class="phase-summary-matches">' +
        (matches || '<small>' + noMatch + '</small>') + '</span></span></summary>' +
        '<div class="phase-comparison-body">' + (lazy ? '' : tables()) + '</div></details>';
    }).join('');
  }

  function groupHTML(group) {
    return trialListHTML([group]);
  }

  function filterHTML(field, label, choices) {
    const options = choices.map(([value, text]) => '<option value="' + escape(value) + '">' + escape(text) + '</option>');
    return '<label><span>' + label + '</span><select data-phase-filter="' + field + '"><option value="">All</option>' +
      options.join('') + '</select></label>';
  }

  function render(host, payload) {
    if (payload?.schema_version !== 1 || !Array.isArray(payload.groups)) throw new Error('Invalid phase comparison data');
    const groups = payload.groups;
    const choices = values => [...new Set(values)].sort(byName).map(value => [value, value]);
    host.innerHTML = '<div class="panel-heading"><h2>Phase II vs Phase III</h2><div class="phase-filters">' + trialSearch.field('Phase II vs Phase III') +
      filterHTML('drug', 'Drug', choices(groups.flatMap(group => group.drugs))) +
      filterHTML('setting', 'Treatment setting', choices(groups.map(group => group.setting))) +
      filterHTML('status', 'Phase III status', statusOptions) + '</div></div><div data-phase-groups></div>';
    const drug = host.querySelector('[data-phase-filter="drug"]');
    const setting = host.querySelector('[data-phase-filter="setting"]');
    const status = host.querySelector('[data-phase-filter="status"]');
    const search = host.querySelector('[data-trial-search]');
    const list = host.querySelector('[data-phase-groups]');
    const expanded = new Set();
    const deferred = new Map();
    list.addEventListener('toggle', event => {
      const details = event.target;
      if (!details.matches('details.phase-cohort')) return;
      const key = details.dataset.phaseKey;
      if (!details.open) { expanded.delete(key); return; }
      expanded.add(key);
      if (deferred.has(key)) {
        details.querySelector('.phase-comparison-body').innerHTML = deferred.get(key)();
        deferred.delete(key);
      }
    }, true);
    function update() {
      const visible = matchingGroups(groups, drug.value, setting.value, status.value, search.value);
      deferred.clear();
      list.innerHTML = trialListHTML(visible, {expanded, deferred, query:search.value.trim()}) ||
        '<p class="evidence-tab-note" role="status">No trials match these filters.</p>';
    }
    drug.addEventListener('change', update);
    setting.addEventListener('change', update);
    status.addEventListener('change', update);
    search.addEventListener('input', update);
    update();
  }
  return Object.freeze({render, matchingGroups, alignedRows, groupHTML});
});
