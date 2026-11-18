(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NewFindings = factory();
})(globalThis, function() {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function formatDate(value) {
    const parts = value.split('-');
    if (parts.length === 1) return parts[0];
    const date = new Date(`${parts[0]}-${parts[1]}-${parts[2] || '01'}T00:00:00Z`);
    return date.toLocaleDateString('en-US',{timeZone:'UTC',year:'numeric',month:'short',...(parts[2] ? {day:'numeric'} : {})});
  }
  function resultHTML(finding) {
    const context = [finding.regimen, finding.group].filter(Boolean).map(escape).join(' · ');
    return `<div class="finding-result"><strong>${escape(finding.endpoint)}</strong> ${escape(finding.value)}${context ? `<div><small class="finding-context">${context}</small></div>` : ''}</div>`;
  }
  function reportHTML(report) {
    if (!/^\d+$/.test(report.pmid)) throw new Error('Recent report has an invalid PMID');
    const [first,...rest] = report.findings;
    const results = first ? resultHTML(first) : escape(report.abstract_note || 'No quantitative outcome available in the study table.');
    const more = rest.length ? `<details><summary>${rest.length} more ${rest.length===1?'result':'results'}</summary>${rest.map(resultHTML).join('')}</details>` : '';
    const source = ['Online publication','Print publication'].includes(report.date_basis) ? '' : `<div><small>${escape(report.date_basis)}</small></div>`;
    return `<tr><td><time datetime="${escape(report.date)}">${escape(formatDate(report.date))}</time>${source}</td><td><a href="https://pubmed.ncbi.nlm.nih.gov/${report.pmid}/" target="_blank" rel="noopener noreferrer">${escape(report.title)}</a><div><small>PMID ${report.pmid}</small></div></td><td>${results}${more}</td></tr>`;
  }
  function render(host,payload) {
    if (payload?.schema_version!==1 || !Array.isArray(payload.reports)) throw new Error('New findings could not be read.');
    const heading = '<div class="panel-heading"><h2>New findings</h2></div>';
    const count = payload.reports.length;
    const intro = count ? `${count} retained ${count===1?'report':'reports'} published from October 1, 2026.` : 'No retained reports have a qualifying publication date from October 1, 2026.';
    host.innerHTML = heading + `<p class="evidence-tab-note">${intro}</p>` + (count ? `<div class="table-scroll"><table class="evidence-tab-table"><thead><tr><th scope="col">Published</th><th scope="col">Study</th><th scope="col">Reported findings</th></tr></thead><tbody>${payload.reports.map(reportHTML).join('')}</tbody></table></div>` : '');
  }
  return {render};
});
