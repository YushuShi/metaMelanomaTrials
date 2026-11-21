/* One article-level About renderer and one saved-snapshot polling owner. */
(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./published_outcome_review.js') : root?.MetaPublishedOutcomeReview);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MetaArticleProgress = api;
  if (typeof document === 'undefined') return;
  const panel = document.getElementById('article-review-progress');
  const view = document.getElementById('view-about');
  if (!panel || !view) return;
  const complementaryPanel = document.getElementById('complementary-review');
  const review = complementaryPanel && root.MetaComplementaryReview?.create(complementaryPanel);
  let timer, pending;
  const visible=()=>!view.hidden&&document.visibilityState!=='hidden';
  async function refresh() {
    if(!visible()){schedule();return;}
    review?.load();
    if (pending) return pending;
    pending = (async () => {
      try {
        const versionResponse=await fetch('./data/treatment_map_version.json',{cache:'no-cache'}).catch(()=>null);
        const version=versionResponse?.ok?await versionResponse.json():null;
        if(!visible())return;
        let snapshot=version?.schema_version===1?version.about_progress:null;
        if(!snapshot){
          const compact=root.MetaQuantitativeSnapshot;
          if(compact?.mode==='pilot'&&compact.publication_ready===true){
            root.QuantitativeExtraction?.checked(compact);
            if(!compact.about_progress)throw new Error('Pilot progress unavailable');
            snapshot={...compact.about_progress,stage_scope:compact.about_progress.stage_scope||['R2']};
          }else{
            if(compact?.mode==='pilot')throw new Error('Pilot progress unavailable');
            const response = await fetch('./data/article_review_progress.json', {cache:'no-cache'});
            if (!response.ok) throw new Error('Saved article progress unavailable');
            snapshot = await response.json();
          }
        }
        panel.innerHTML = api.render(snapshot);
        const date = new Date(snapshot.as_of), stamp = document.getElementById('article-progress-date');
        if (stamp && Number.isFinite(date.getTime())) {
          stamp.textContent = new Intl.DateTimeFormat('en-US', {timeZone:snapshot.timezone || 'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date);
          stamp.title = 'Checked article snapshot: ' + snapshot.as_of;
        }
      } catch (_) {
        if (!panel.querySelector('.article-stage')) panel.innerHTML = '<p role="status">Saved article progress could not be loaded. Reload to try again.</p>';
      } finally {
        pending = null;schedule();
      }
    })();
    return pending;
  }
  function schedule() { clearTimeout(timer);timer=setTimeout(() => { if (visible()) refresh(); else schedule(); },60000); }
  document.getElementById('refresh')?.addEventListener('click',()=>{
    if(visible())review?.load(true);
    refresh();
  });
  // The navigation button changes the hash before the app reveals About. Watch
  // visibility itself so opening the page never depends on handler ordering.
  root.addEventListener?.('hashchange',refresh);
  document.addEventListener('visibilitychange',refresh);
  if(typeof MutationObserver==='function')new MutationObserver(()=>{if(visible())refresh();}).observe(view,{attributes:true,attributeFilter:['hidden']});
  if(visible())refresh();else schedule();
})(typeof window === 'undefined' ? null : window, function (publishedReview) {
  'use strict';
  const valid = value => typeof value === 'number' && Number.isInteger(value) && value >= 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g,x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const number = value => valid(value) ? new Intl.NumberFormat('en-US').format(value) : 'Pending';
  function stageView(stage,key) {
    if (!stage || stage.unit !== 'articles') throw new Error('Article-level stage required');
    const screening_finished = valid(stage.screening_finished) ? stage.screening_finished : key === 'R2' && valid(stage.entered) && valid(stage.pending) ? stage.entered-stage.pending : null;
    const out = {entered:stage.entered,screening_finished,retained:stage.retained,excluded:stage.excluded,unclear:stage.unclear};
    if (!Object.values(out).every(valid) || out.entered < screening_finished || screening_finished !== out.retained+out.excluded+out.unclear) throw new Error('Checked article decision counts required');
    let reports;
    if (Array.isArray(stage.unclear_reports)) reports=stage.unclear_reports;
    else reports=(stage.reasons || []).filter(group => /^Unclear(?:\b|$)/i.test(group.label || '')).flatMap(group => {
      if (!valid(group.count) || !Array.isArray(group.reports) || group.count !== group.reports.length) throw new Error('Unclear reason count mismatch');
      return group.reports;
    });
    const seen=new Set();
    out.unclear_reports=reports.map(report => {
      const pmid=String(report.pmid || ''),reason=report.reason;
      if (!/^\d+$/.test(pmid) || seen.has(pmid) || typeof reason !== 'string' || !reason.trim()) throw new Error('Unique PMID and recorded reason required');
      seen.add(pmid);return {pmid,reason};
    });
    if (out.unclear_reports.length !== out.unclear) throw new Error('Unclear articles must match their reasons');
    return out;
  }
  function reasons(reports) {
    if (!reports.length) return '';
    const rows=reports.map(report => `<tr><td><a href="https://pubmed.ncbi.nlm.nih.gov/${report.pmid}/" target="_blank" rel="noopener noreferrer">${report.pmid}</a></td><td>${escape(report.reason)}</td></tr>`).join('');
    return `<details class="article-reasons"><summary>Unclear articles</summary><div class="table-scroll"><table class="article-reason-table"><thead><tr><th>PMID</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }
  function stageCard(stage,key) {
    const view=stageView(stage,key);
    const metrics=[['Entered',view.entered],['Eligibility screening finished',view.screening_finished],['Retained',view.retained],['Excluded',view.excluded],['Remain unclear',view.unclear]];
    return `<article class="panel article-stage"><h2>${key === 'R2' ? 'R2 · Title and abstract' : 'R3 · Full text'}</h2><dl class="article-stage-counts">${metrics.map(([label,value]) => `<div><dt>${label}</dt><dd>${number(value)}</dd></div>`).join('')}</dl>${reasons(view.unclear_reports)}</article>`;
  }
  function publishedDifferences(review=publishedReview) {
    if (!review?.entries?.length) return '';
    const seen=new Set();
    const rows=review.entries.map(entry=>{
      const pmid=String(entry.pmid||'');
      if(!/^\d+$/.test(pmid)||seen.has(pmid)||['outcome','values','reason'].some(key=>typeof entry[key]!=='string'||!entry[key].trim()))throw new Error('Unique PMID and source-reviewed difference required');
      seen.add(pmid);
      return `<tr><td><a href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/" target="_blank" rel="noopener noreferrer">${pmid}</a></td><td>${escape(entry.outcome)}</td><td>${escape(entry.values)}</td><td>${escape(entry.reason)}</td></tr>`;
    }).join('');
    return `<section class="panel published-outcome-review" aria-labelledby="published-differences-title"><div class="published-review-heading"><h2 id="published-differences-title">Published differences for review</h2><a href="./reviews/outcome_review.html" target="_blank" rel="noopener noreferrer">Full review report</a></div><p>${review.entries.length} studies with differing published values or denominators.</p><div class="published-review-scroll" role="region" aria-label="Published differences" tabindex="0"><table class="published-review-table"><thead><tr><th scope="col">PMID</th><th scope="col">Outcome</th><th scope="col">Differing values</th><th scope="col">Reason for review</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  function render(snapshot) {
    if (snapshot?.schema_version !== 1 || snapshot.unit !== 'articles') throw new Error('Article snapshot required');
    const stages=snapshot.stage_scope||['R2','R3'];
    if(!Array.isArray(stages)||!stages.length||new Set(stages).size!==stages.length||stages.some(stage=>!['R2','R3'].includes(stage)))throw new Error('Checked stage scope required');
    return `<div class="article-stage-grid">${stages.map(stage=>stageCard(snapshot.stages?.[stage],stage)).join('')}</div>`;
  }
  return {render,stageCard,stageView,reasons,number,publishedDifferences};
});
