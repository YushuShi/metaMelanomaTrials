/* Publication-level screen of comparative results, backed by the saved release. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports ? require('./confidence_intervals.js') : root.ConfidenceIntervals);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.UnderpoweredStudies=api;
})(typeof globalThis==='undefined'?this:globalThis,function(CI){
  'use strict';
  const methodURL='https://pmc.ncbi.nlm.nih.gov/articles/PMC11984287/';
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function matchingRows(data,threshold){
    if(!Number.isSafeInteger(threshold)||threshold<1)return [];
    return data.rows.filter(row=>Number.isFinite(row.events)&&row.events>=0&&Math.ceil(row.events)<threshold&&row.lower>0&&row.lower<=1&&row.upper>=1);
  }
  function publicationYear(row){
    return /^\d{4}$/.test(row.year) ? Number(row.year) : null;
  }
  function sortRows(rows,column,direction){
    const value=column==='year' ? publicationYear : row=>Math.ceil(row.events);
    const sign=direction==='ascending' ? 1 : -1;
    return rows.sort((a,b)=>{
      const left=value(a),right=value(b);
      if(left===right)return 0;
      if(left===null)return 1;
      if(right===null)return -1;
      return sign*(left-right);
    });
  }
  function sortHeading(label,column,sort){
    const active=sort.column===column;
    const buttons=['ascending','descending'].map(direction=>{
      const action=`Sort ${label.toLowerCase()} ${direction}`;
      return `<button type="button" data-sort-column="${column}" data-sort-direction="${direction}" aria-label="${action}" title="${action}" aria-pressed="${active && sort.direction===direction}">${direction==='ascending'?'▲':'▼'}</button>`;
    }).join('');
    return `<th scope="col"${active?' aria-sort="'+sort.direction+'"':''}>${label} <span class="evidence-sort-buttons">${buttons}</span></th>`;
  }
  function rowHtml(row){
    const pmid=String(row.pmid);
    const publication=/^\d+$/.test(pmid)?`<a href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/" target="_blank" rel="noopener noreferrer">${escape(row.title)}</a>`:escape(row.title);
    const count=Math.ceil(row.events).toLocaleString('en-US');
    const note=row.cutoff?` · ${escape(row.cutoff)}`:'';
    const level=row.original_level?`<small>From ${escape(row.original_level)}% CI</small>`:'';
    return `<tr><td>${publication}<small>${escape([row.author?row.author+' et al.':'',row.trial].filter(Boolean).join(' · '))}</small></td><td>${publicationYear(row)??'—'}</td><td>${escape(row.treatment)} vs ${escape(row.reference)}<small>${escape(row.population)}${note}</small></td><td>${escape(row.endpoint)}</td><td>${escape(row.measure)} ${CI.formatEffectNumber(row.estimate)} (${CI.formatEffectNumber(row.lower)}–${CI.formatEffectNumber(row.upper)})${level}</td><td>${count}<small>${escape(row.method)} · ${escape(row.basis)}</small></td></tr>`;
  }
  function mount(panel,data){
    if(!panel||!data||!Array.isArray(data.rows))throw Error('Underpowered studies data unavailable.');
    for(const row of data.rows)if(!Number.isFinite(row.events)||row.events<0||!Number.isFinite(row.estimate)||!Number.isFinite(row.lower)||!Number.isFinite(row.upper))throw Error('Invalid event-screen result.');
    const previous=panel.querySelector('input[data-event-threshold]')?.value;
    panel.innerHTML=`<div class="panel-heading"><h2>Underpowered studies</h2><label class="evidence-threshold">Event threshold <input type="number" min="1" step="1" required data-event-threshold value="100"></label></div><p class="evidence-tab-note">Comparisons with fewer events than the threshold and a 95% CI that includes 1 (zero on the log scale).</p><div data-event-results></div><details class="evidence-tab-note"><summary>How events are counted</summary><p>Binary results use the sum of the two arms’ endpoint counts. For survival comparisons, a reported event total takes precedence. For eligible randomized comparisons, the estimated event count is 1 / [SE(ln HR)² × p × (1 − p)], rounded up to a whole event before applying the threshold. The confidence interval supplies the standard error. Arm sizes or a published randomization ratio supply the allocation fraction p. This screen describes statistical precision and does not measure a study’s planned power. <a href="${methodURL}" target="_blank" rel="noopener noreferrer">Method</a></p></details>`;
    const input=panel.querySelector('[data-event-threshold]'),output=panel.querySelector('[data-event-results]');
    let sort={column:'year',direction:'descending'};
    if(previous && Number.isSafeInteger(Number(previous)) && Number(previous)>0)input.value=previous;
    function render(){
      const threshold=Number(input.value);
      if(!Number.isSafeInteger(threshold)||threshold<1){output.innerHTML='<p role="status" class="evidence-tab-note">Enter a positive whole number.</p>';return;}
      const rows=sortRows(matchingRows(data,threshold),sort.column,sort.direction);
      const publications=new Set(rows.map(r=>r.pmid)).size;
      const status=`${publications} ${publications===1?'publication':'publications'} · ${rows.length} ${rows.length===1?'result':'results'}`;
      output.innerHTML=rows.length ? `<p role="status" class="evidence-tab-note">${status}</p><div class="table-scroll"><table class="evidence-tab-table"><thead><tr><th scope="col">Study</th>${sortHeading('Published year','year',sort)}<th scope="col">Comparison and population</th><th scope="col">Endpoint</th><th scope="col">Effect (95% CI)</th>${sortHeading('Events','events',sort)}</tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>` : '<p role="status" class="evidence-tab-note">No study results meet this threshold.</p>';
    }
    output.addEventListener('click',event=>{
      const button=event.target.closest('button[data-sort-column]');
      if(!button)return;
      const {sortColumn:column,sortDirection:direction}=button.dataset;
      if(sort.column===column && sort.direction===direction)return;
      sort={column,direction};
      const scrollLeft=output.querySelector('.table-scroll').scrollLeft;
      render();
      if(scrollLeft)output.querySelector('.table-scroll').scrollLeft=scrollLeft;
      output.querySelector('button[aria-pressed="true"]').focus({preventScroll:true});
    });
    input.addEventListener('input',render);render();
  }
  return {mount,matchingRows};
});
