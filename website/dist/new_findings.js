(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(() => require('./app.js'), require('./trial_search.js'));
  else root.NewFindings = factory(() => root.MetaSampleSizeCharts, root.TrialSearch);
})(globalThis, function(studies, TrialSearch) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function formatDate(value) {
    const parts = value.split('-');
    if (parts.length === 1) return parts[0];
    const date = new Date(`${parts[0]}-${parts[1]}-${parts[2] || '01'}T00:00:00Z`);
    return date.toLocaleDateString('en-US',{timeZone:'UTC',year:'numeric',month:'short',...(parts[2] ? {day:'numeric'} : {})});
  }
  const value = text => text && text !== 'NA' ? escape(text) : '—';

  function resultHTML(finding) {
    const legacyContext = [finding.regimen, finding.group].filter(Boolean).join(' · ');
    return `<div class="finding-result"><strong>${escape(finding.endpoint)}</strong> ${escape(finding.value)}${legacyContext ? `<small>${escape(legacyContext)}</small>` : ''}</div>`;
  }

  function resultsHTML(effects, note) {
    if (!effects.length) return value(note);
    const [first, ...rest] = effects;
    const more = rest.length ? `<details><summary>${rest.length} more ${rest.length === 1 ? 'result' : 'results'}</summary>${rest.map(resultHTML).join('')}</details>` : '';
    return resultHTML(first) + more;
  }

  function sampleCells(samples) {
    return (samples || []).map(sample => `<div>${sample.label ? `<small>${escape(sample.label)}</small>` : ''}N=${escape(sample.sample_size)}${sample.breakdown ? ` (${escape(sample.breakdown)})` : ''}</div>`).join('') || '—';
  }

  function reportHTML(report, trialName) {
    if (!/^\d+$/.test(report.pmid)) throw new Error('Recent report has an invalid PMID');
    const groups = report.groups?.length ? report.groups : [{effects:report.findings || []}];
    const source = ['Online publication','Print publication'].includes(report.date_basis) ? '' : `<small>${escape(report.date_basis)}</small>`;
    const mark = report.abstract_only ? '<sup class="abstract-only-mark" title="Results based on abstract only" aria-label="Abstract only">*</sup>' : '';
    const study = `<a href="https://pubmed.ncbi.nlm.nih.gov/${report.pmid}/" target="_blank" rel="noopener noreferrer">${escape(report.title)}</a>${mark}<small>PMID ${report.pmid}</small>`;
    const cells = [study,value(report.author),`<time datetime="${escape(report.date)}">${escape(formatDate(report.date))}</time>${source}`,value(trialName),value(report.nct)];
    const citation = cells.map(cell => `<td rowspan="${groups.length}">${cell}</td>`).join('');
    return groups.map((group, index) => `<tr data-pmid="${report.pmid}"${report.nontrial ? ' class="study-nontrial"' : ''}>
      ${index ? '' : citation}<td>${value(group.group)}</td><td>${studies().savedTreatmentTag(group.comparator,false,group.comparator_n)}</td>
      <td>${studies().savedTreatmentTag(group.intervention,group.add_on,group.intervention_n)}</td><td>${sampleCells(group.samples)}</td>
      <td>${resultsHTML(group.effects, index === 0 && report.abstract_note)}</td></tr>`).join('');
  }

  function render(host,payload) {
    if (![1,2].includes(payload?.schema_version) || !Array.isArray(payload.reports)) throw new Error('New findings could not be read.');
    const previousQuery = host.querySelector('[data-trial-search]')?.value || '';
    host.innerHTML = '<div class="panel-heading"><div class="evidence-tab-heading"><h2>New findings</h2>' +
      TrialSearch.field('New findings') + '</div></div><p class="evidence-tab-note" role="status" data-findings-count></p><div data-findings-results></div>';
    const input = host.querySelector('[data-trial-search]');
    const status = host.querySelector('[data-findings-count]');
    const results = host.querySelector('[data-findings-results]');
    const reports = payload.reports.map(report => ({report, index:TrialSearch.index({names:report.trial, nct:report.nct, pmid:report.pmid})}));
    const headings = ['Study','First author','Published','Trial name','NCT number','Group','Comparator','Intervention','Sample size','Effect size (CI)'];
    function update() {
      const visible = reports.filter(entry => TrialSearch.matches(entry.index, input.value));
      const count = visible.length;
      status.textContent = count ? `${count} retained ${count===1?'report':'reports'} published from October 1, 2026.` :
        input.value.trim() ? 'No recent reports match this trial search.' : 'No retained reports have a qualifying publication date from October 1, 2026.';
      const rows = visible.map(({report, index}) =>
        reportHTML(report, TrialSearch.displayName(index, input.value, report.trial))).join('');
      results.innerHTML = count ? `<div class="table-scroll"><table class="evidence-tab-table study-evidence-grid"><thead><tr>${headings.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : '';
    }
    input.value = previousQuery;
    input.addEventListener('input', update);
    update();
  }
  return {render};
});
