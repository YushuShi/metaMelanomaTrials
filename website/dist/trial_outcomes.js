/* Arm-level results for the selected endpoint. The saved projection orders
 * reports by preference within each arm. Select after applying clinical filters. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./advanced_filters.js'), () => require('./app.js'));
  else root.TrialOutcomes = factory(root.AdvancedFilters, () => root.MetaSampleSizeCharts);
})(globalThis, function (Advanced, studies) {
  'use strict';
  const endpoints = [
    ['ORR','ORR — Objective response rate (%)'], ['DOR','Median DOR — Duration of response (months)'],
    ['CR','CR — Complete response rate (%)'], ['RFS','Median RFS — Recurrence-free survival (months)'],
    ['DMFS','Median DMFS — Distant metastasis-free survival (months)'], ['PFS','Median PFS — Progression-free survival (months)'],
    ['OS','Median OS — Overall survival (months)'], ['AE','Grade ≥3 adverse events (% of patients)']
  ];
  const percentage = endpoint => ['ORR','CR','AE'].includes(endpoint);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const formatter = new Intl.NumberFormat('en-US', {maximumSignificantDigits:5, maximumFractionDigits:3});
  const number = value => formatter.format(value);
  const unitValue = (value, endpoint) => number(value) + (percentage(endpoint) ? '%' : ' months');
  const publishedYear = row => row.year || row.date?.slice(0,4) || null;
  const citation = row => [row.author || 'PMID ' + row.pmid, row.year || row.date?.slice(0,4)].filter(Boolean).join(' · ');
  const attribution = row => row.attribution === 'related' ? 'treatment-related' : 'overall';
  const classes = row => row.classes?.length ? row.classes : [{color:'other',label:'Other / unclassified'}];

  function visibleGroups(rows, endpoint, selections, options) {
    const groups = new Map(), firstArm = new Map(), multiArm = new Set(), eligible = [], overall = new Map();
    for (const row of rows) {
      const parent = row.parentArmId || row.armId;
      if (!firstArm.has(row.trialId)) firstArm.set(row.trialId,parent);
      else if (firstArm.get(row.trialId)!==parent) multiArm.add(row.trialId);
      if (row.endpoint !== endpoint || !Advanced.resultMatches(row.filter_binding, selections, options)) continue;
      eligible.push(row);
      if (!row.subgroup) {
        if (!overall.has(row.trialId)) overall.set(row.trialId,new Set());
        overall.get(row.trialId).add(parent);
      }
    }
    for (const row of eligible) {
      // Separately enrolled cohorts have distinct parent IDs. A nested subgroup
      // supplies its own labeled bar when its overall arm cannot supply this endpoint or filter.
      if (row.subgroup && overall.get(row.trialId)?.has(row.parentArmId)) continue;
      let group = groups.get(row.trialId);
      if (!group) {
        group = {id:row.trialId, name:row.trialName || row.nct || row.trialId, date:'', arms:new Map()};
        groups.set(group.id, group);
      }
      let arm = group.arms.get(row.armId);
      if (!arm) {
        arm = {id:row.armId, regimen:row.regimen, cohort:row.cohort, rates:new Map()};
        group.arms.set(arm.id, arm);
      }
      const kind = row.attribution || '';
      if (arm.rates.has(kind)) continue;
      arm.rates.set(kind,row);
      const date = /^\d{4}/.test(row.date) ? row.date : /^\d{4}$/.test(row.year) ? String(row.year) : '';
      if (date > group.date) group.date = date;
    }
    for (const group of groups.values()) group.multiArm = multiArm.has(group.id);
    return [...groups.values()].sort((a,b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id)));
  }

  // A numbered footnote needs two visible sides of the same verified link.
  // A pending marker needs only its visible phase II arm.
  function phaseNotes(groups) {
    const links = new Map(), marks = new Map();
    let pending = false;
    for (const group of groups) for (const arm of group.arms.values()) {
      marks.set(arm,{numbers:[],pending:false});
      for (const row of arm.rates.values()) for (const link of row.phaseLinks || []) {
        if (link.phase !== 2 && link.phase !== 3) continue;
        if (link.phase === 2 && link.pending === true) { marks.get(arm).pending = true; pending = true; }
        if (!links.has(link.id)) links.set(link.id,{name2:link.phase2Name,name3:link.phase3Name,2:new Set(),3:new Set()});
        links.get(link.id)[link.phase].add(arm);
      }
    }
    const notes = [];
    for (const link of links.values()) {
      if (!link[2].size || !link[3].size) continue;
      const n = notes.push(link);
      for (const arm of new Set([...link[2],...link[3]])) marks.get(arm).numbers.push(n);
    }
    return {marks,notes,pending};
  }

  function upperBound(ci) {
    return Number.isFinite(ci?.high) && !ci.highNotReached && !ci.highNotEstimable ? ci.high : null;
  }

  function scale(groups, endpoint) {
    if (endpoint === 'AE') return {max:100, ticks:[0,25,50,75,100]};
    let largestUpper = null, largestPoint = 0;
    for (const g of groups) for (const arm of g.arms.values()) for (const row of arm.rates.values()) {
      if (row.notReached || !Number.isFinite(row.value)) continue;
      largestPoint = Math.max(largestPoint,row.value);
      const high = upperBound(row.ci);
      if (high !== null) largestUpper = Math.max(largestUpper ?? 0,high);
    }
    const max = largestUpper ?? largestPoint;
    if (!max) return {max:0,ticks:[0]};
    const target = max / 4;
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const step = [1,2,2.5,5,10].find(v => v * magnitude >= target) * magnitude;
    const ticks = [0];
    // Leave room for the actual upper limit when it falls close to a regular tick.
    for (let tick = step; tick < max - step / 2; tick += step) ticks.push(tick);
    return {max,ticks:[...ticks,max]};
  }

  function intervalText(row) {
    if (!row.ci) return '';
    const bound = (value,notReached,notEstimable) => Number.isFinite(value) ? unitValue(value,row.endpoint) :
      notReached ? 'not reached' : notEstimable ? 'not estimable' : 'unavailable';
    const {low,high,lowNotReached,highNotReached,lowNotEstimable,highNotEstimable} = row.ci;
    return '95% CI ' + bound(low,lowNotReached,lowNotEstimable) + ' to ' + bound(high,highNotReached,highNotEstimable);
  }
  function tooltip(row) {
    const effect = row.notReached ? 'Median not reached' : unitValue(row.value,row.endpoint);
    const kind = row.ci?.method === 'wilson' ? 'Calculated 95% CI (Wilson)' : 'Reported 95% CI';
    return [row.regimen, effect + (row.attribution ? ' ' + attribution(row) : ''), row.ci &&
      intervalText(row).replace(/^95% CI/,kind), citation(row)].filter(Boolean).join(' · ');
  }
  function marksHTML(marks) {
    const content = [...marks.numbers, ...(marks.pending ? ['*'] : [])].join(', ');
    return content ? '<sup class="to-mark">' + escape(content) + '</sup>' : '';
  }

  function chartSVG(rows, domain, resultHref) {
    const combined = rows.length === 2;
    const height = 37, barY = 13, barHeight = 12;
    const x = v => (domain.max ? 100 * Math.min(domain.max,Math.max(0,v)) / domain.max : 0) + '%';
    const grid = domain.ticks.map(v => '<line class="to-guide" x1="'+x(v)+'" x2="'+x(v)+'" y1="0" y2="'+height+'"/>').join('');
    const segments = rows.map((row,i) => {
      const beyondAxis = !row.notReached && Number.isFinite(row.value) && row.value > domain.max;
      const href = escape(resultHref(row.source)), title = escape(tooltip(row) + (beyondAxis ? ' · Estimate exceeds the plotted range' : ''));
      const painted = classes(row);
      const start = combined && i === 1 ? rows[0].value : 0;
      const width = x(Number.isFinite(row.value) ? row.value - start : 0);
      const low = row.ci?.low, high = upperBound(row.ci);
      const inRange = v => Number.isFinite(v) && v >= 0 && v <= domain.max;
      const lo = inRange(low) ? x(low) : null;
      const hi = inRange(high) ? x(high) : null;
      if (row.notReached && !lo && !hi) return '';
      const center = row.attribution === 'overall' ? barY + barHeight + 6 : barY - 6;
      const bands = painted.map((cat,band) => {
        const dy = barHeight / painted.length, top = barY + band * dy;
        let bar = '';
        if (!row.notReached) bar = Number.isFinite(row.value) && row.value > start ?
          '<rect class="to-fill" x="'+x(start)+'" y="'+top+'" width="'+width+'" height="'+dy+'"/>' :
          '<line class="to-zero" x1="'+x(start)+'" x2="'+x(start)+'" y1="'+top+'" y2="'+(top+dy)+'"/>';
        const lineY = center + (band - (painted.length - 1)/2) * Math.min(2,4/painted.length);
        // A continuation at the right edge keeps an off-scale estimate distinct from one at the limit.
        if (beyondAxis) bar += '<svg x="'+x(domain.max)+'" y="'+top+'" width="6" height="'+dy+'" viewBox="0 0 6 12" preserveAspectRatio="none"><path class="to-overflow" d="M0 0 L6 6 L0 12 Z"/></svg>';
        let ci = lo && high !== null ? '<line x1="'+lo+'" x2="'+x(high)+'" y1="'+lineY+'" y2="'+lineY+'"/>' : '';
        for (const stop of [lo,hi]) if (stop) ci += '<line x1="'+stop+'" x2="'+stop+'" y1="'+(lineY-2.7)+'" y2="'+(lineY+2.7)+'"/>';
        return '<g data-treatment-class="'+escape(cat.color)+'" class="to-shade-'+(row.attribution === 'overall' ? 'light' : 'ink')+'">'+bar+
          (ci ? '<g class="to-whisker">'+ci+'</g>' : '')+'</g>';
      }).join('');
      return '<a href="'+href+'" aria-label="'+title+'"><title>'+title+'</title>'+bands+'</a>';
    }).join('');
    return '<svg class="to-plot" width="100%" height="'+height+'" role="group" aria-label="'+escape(rows[0].regimen)+'">'+grid+segments+'</svg>';
  }

  function armResult(arm) {
    return arm.rates.get('overall') || arm.rates.values().next().value;
  }

  function armHTML(arm, marks, endpoint, domain, resultHref) {
    const rows = [...arm.rates.values()].sort((a,b) => Number(b.attribution === 'related') - Number(a.attribution === 'related'));
    const joined = rows.length === 2 && rows[0].safetyContext && rows[0].safetyContext === rows[1].safetyContext && rows[0].value <= rows[1].value;
    const lanes = joined ? [rows] : rows.map(r=>[r]);
    const papers = [...new Map(rows.map(r => [r.pmid,r])).values()];
    const citations = papers.map(r => {
      const url = 'https://pubmed.ncbi.nlm.nih.gov/'+encodeURIComponent(r.pmid)+'/';
      const target = ' href="'+url+'" target="_blank" rel="noopener noreferrer"';
      return '<div class="to-publication">'+(r.author ? '<a class="to-pub-author"'+target+'>'+escape(r.author)+'</a>' : '<span>Author unavailable</span>')+
        '<a class="to-pmid"'+target+'>PMID '+escape(r.pmid)+'</a>'+
        (papers.length>1 ? '<small>'+attribution(r)+'</small>' : '')+'</div>';
    }).join('');
    const years = papers.map(r => '<div>'+escape(publishedYear(r) ?? '—')+'</div>').join('');
    const values = rows.map(r=>{
      const numeric = r.notReached ? '<a class="to-unreached" href="'+escape(resultHref(r.source))+'">Median not reached</a>' : '<b>'+escape(unitValue(r.value,endpoint))+'</b>';
      let suffix = r.attribution ? ' '+attribution(r) : '';
      if (r.attribution && rows.length===1) suffix = '<small>'+(r.attribution==='related' ? 'Treatment-related' : 'Overall')+' only reported</small>';
      const ci = intervalText(r);
      return '<div title="'+escape(tooltip(r))+'">'+numeric+suffix+(ci?'<small>'+escape(ci)+'</small>':'')+'</div>';
    }).join('');
    const armLink = '<a class="to-arm-link" href="'+escape(resultHref(armResult(arm).source))+'">'+studies().savedTreatmentTag(arm.regimen)+'</a>';
    return '<tr class="to-arm"><th class="to-treatment" scope="row">'+armLink+marksHTML(marks)+
      (arm.cohort?'<small>'+escape(arm.cohort)+'</small>':'')+'</th><td class="to-citations">'+citations+'</td><td class="to-year">'+years+'</td><td class="to-graphics">'+
      lanes.map(l=>chartSVG(l,domain,resultHref)).join('')+'</td><td class="to-values">'+values+
      (rows.length>1&&!joined?'<small>Separate safety estimates</small>':'')+'</td></tr>';
  }

  function displayOrder(groups, sort) {
    const entries = groups.flatMap(group => [...group.arms.values()].map(arm => ({group,arm})));
    if (!sort) return entries;
    for (const entry of entries) {
      if (sort.column === 'year') {
        const years = [...entry.arm.rates.values()].map(publishedYear).filter(y => /^\d{4}$/.test(y));
        entry.value = years.length ? Math.max(...years) : null;
      } else {
        const result = armResult(entry.arm);
        if (result.notReached && !percentage(result.endpoint)) entry.value = Infinity;
        else entry.value = Number.isFinite(result.value) ? result.value : null;
      }
    }
    const direction = sort.direction === 'ascending' ? 1 : -1;
    return entries.sort((a,b) => {
      if (a.value === b.value) return 0;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return direction * (a.value-b.value);
    });
  }

  function sortHeading(column, label, sort, endpoint) {
    const active = sort?.column === column;
    const sortNote = column === 'estimate' && endpoint === 'AE' ? '. Uses the overall rate when available.' :
      column === 'year' && endpoint === 'AE' ? '. Uses the latest year when two publications supply an arm.' : '';
    const buttons = ['ascending','descending'].map(direction => {
      const pressed = active && sort.direction === direction;
      const up = direction === 'ascending';
      const action = pressed ? 'Restore default trial order' : 'Sort treatment arms by '+label.toLowerCase()+', '+direction+sortNote;
      return '<button type="button" class="to-sort '+(up?'to-up':'to-down')+'" data-sort-column="'+column+'" data-sort-direction="'+direction+
        '" aria-label="'+action+'" title="'+action+'" aria-pressed="'+pressed+'">'+(up?'▲':'▼')+'</button>';
    }).join('');
    return '<th class="'+(column==='year'?'to-year':'to-values')+'" scope="col"'+(active?' aria-sort="'+sort.direction+'"':'')+
      '><span class="to-sort-heading">'+label+' <span class="to-sort-arrows">'+buttons+'</span></span></th>';
  }

  function renderChart(groups, endpoint, resultHref, sort = null) {
    if (!groups.length) return '<p class="evidence-tab-note" role="status">No eligible arm-level results for this endpoint and filter selection.</p>';
    const domain = scale(groups,endpoint), phase = phaseNotes(groups);
    const categories = new Map();
    for (const g of groups) for (const arm of g.arms.values()) for (const row of arm.rates.values()) {
      for (const cat of classes(row)) categories.set(cat.color,cat.label);
    }
    const swatches = [...categories].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,label])=>
      '<li data-treatment-class="'+escape(id)+'"><i></i>'+escape(label)+'</li>').join('');
    const legend = '<ul class="to-legend" aria-label="Treatment classes">'+swatches+'</ul>';
    const axisName = endpoint==='AE' ? 'Grade ≥3 adverse events (%)' : percentage(endpoint) ? endpoint+' (%)' : 'Median '+endpoint+' (months)';
    const axis = domain.ticks.map((v,i)=>'<span style="left:'+(domain.max ? v/domain.max*100 : 0)+'%" class="'+
      (i===0?'to-first':i===domain.ticks.length-1?'to-last':'')+'">'+number(v)+'</span>').join('');
    const headings = '<th class="to-treatment" scope="col">Treatment arm</th><th class="to-citations" scope="col">Publication</th>'+
      sortHeading('year','Published year',sort,endpoint)+
      '<th class="to-axis" scope="col">'+axisName+'<div class="to-ticks">'+axis+'</div></th>'+
      sortHeading('estimate','Estimate',sort,endpoint);
    const entries = displayOrder(groups,sort);
    const bodies = entries.map(({group,arm},i) => {
      const marks = phase.marks.get(arm);
      let html = '';
      if (entries[i-1]?.group !== group) {
        const source = armResult(arm).source;
        html = '<tbody><tr class="to-group"><th scope="rowgroup" colspan="5"><a class="to-trial-link" href="'+escape(resultHref(source))+
          '" title="'+escape('Open '+arm.regimen+' in Studies')+'">'+escape(group.name)+'</a>'+(group.multiArm?'':marksHTML(marks))+'</th></tr>';
      }
      html += armHTML(arm,group.multiArm?marks:{numbers:[]},endpoint,domain,resultHref);
      return html + (entries[i+1]?.group !== group ? '</tbody>' : '');
    }).join('');
    const footnotes = phase.notes.map((link,i)=>'<p><sup>'+(i+1)+'</sup> Phase II '+escape(link.name2)+' → Phase III '+escape(link.name3)+'</p>').join('');
    const pending = phase.pending ? '<p>* Linked Phase III primary results pending.</p>' : '';
    return legend+'<table class="to-table" aria-label="'+axisName+' by trial and treatment arm"><thead><tr>'+headings+
      '</tr></thead>'+bodies+'</table>'+(footnotes||pending ? '<footer class="to-footnotes">'+footnotes+pending+'</footer>' : '');
  }

  const mounted = new WeakMap();
  function mount(panel,data,{attachAdvanced,resultHref}) {
    if (data?.schema_version!==1 || !Array.isArray(data.rows)) throw Error('Trial Outcomes data unavailable.');
    const previousEndpoint = panel.querySelector('[data-outcomes-endpoint]')?.value || '';
    mounted.get(panel)?.destroy();
    panel.innerHTML='<div class="panel-heading"><div class="evidence-tab-heading" data-outcomes-heading><h2>Trial Outcomes</h2></div>'+
      '<label class="to-endpoint">Endpoint<select required data-outcomes-endpoint><option value="">Select an endpoint</option>'+
      endpoints.map(([id,label])=>'<option value="'+id+'">'+label+'</option>').join('')+'</select></label></div>'+
      '<div data-outcomes-advanced></div><div class="to-chart" data-outcomes-chart></div>';
    const endpoint=panel.querySelector('[data-outcomes-endpoint]'), chart=panel.querySelector('[data-outcomes-chart]');
    endpoint.value = previousEndpoint;
    let selected=Advanced.resetSelections(), options={}, sort=null, controls, lastKey, lastClassifications, lastRegistry;
    const candidates=()=>data.rows.filter(row=>!endpoint.value || row.endpoint===endpoint.value);
    function render(){
      const key = JSON.stringify([endpoint.value,selected,sort]);
      if (lastKey === key && (!Advanced.activeCount(selected) ||
          (options.classifications === lastClassifications && options.registry === lastRegistry))) return;
      lastKey=key; lastClassifications=options.classifications; lastRegistry=options.registry;
      chart.innerHTML=endpoint.value ? renderChart(visibleGroups(data.rows,endpoint.value,selected,options),endpoint.value,resultHref,sort) : '';
    }
    function evidence(chosen,expanded,opts){
      const matches=candidates().map(row=>({study:{pmid:row.pmid},results:[row.filter_binding],comparisons:[],outcome:row}));
      // The existing filter panel counts publications. Count the publications
      // that would actually be displayed after selecting each facet's value.
      const countOptions={...opts,browseMatchesFor(filtered){
        const rows=filtered.map(match=>match.outcome), visible=new Set();
        for(const id of new Set(rows.map(row=>row.endpoint))) for(const group of visibleGroups(rows,id,{},{})){
          for(const arm of group.arms.values()) for(const row of arm.rates.values()) visible.add(row);
        }
        return filtered.filter(match=>visible.has(match.outcome));
      }};
      return {summary:Advanced.browseSummary(Advanced.filterBrowseMatches(matches,chosen,opts),countOptions),
        facets:expanded?Advanced.browseFacets(matches,chosen,countOptions):[]};
    }
    controls=attachAdvanced?.(panel.querySelector('[data-outcomes-heading]'),panel.querySelector('[data-outcomes-advanced]'),evidence,
      (chosen,opts)=>{selected=chosen;options=opts;render();});
    endpoint.addEventListener('change',()=>{render();controls?.refresh();});
    chart.addEventListener('click',event => {
      const button = event.target.closest('button[data-sort-column]');
      if (!button) return;
      const {sortColumn:column, sortDirection:direction} = button.dataset;
      sort = sort?.column === column && sort.direction === direction ? null : {column,direction};
      render();
      chart.querySelector('button[data-sort-column="'+column+'"][data-sort-direction="'+direction+'"]').focus({preventScroll:true});
    });
    render();
    const controller = {destroy:()=>controls?.destroy()};
    mounted.set(panel,controller);
    return controller;
  }
  return Object.freeze({mount,visibleGroups,renderChart});
});
