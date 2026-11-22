/* Publication-level screen of comparative results, backed by the saved release. */
(function(root,factory){
  const commonJS=typeof module==='object'&&module.exports;
  const api=factory(commonJS ? require('./confidence_intervals.js') : root.ConfidenceIntervals,
    commonJS ? () => require('./app.js') : () => root.MetaSampleSizeCharts,
    commonJS ? require('./treatment_map_planning.js') : root.TreatmentMapPlanning,
    commonJS ? require('./advanced_filters.js') : root.AdvancedFilters);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.UnderpoweredStudies=api;
})(typeof globalThis==='undefined'?this:globalThis,function(CI,studies,Planning,Advanced){
  'use strict';
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validPower=power=>Number.isFinite(power)&&power>.5&&power<1;
  const defaultEventThreshold=100;
  const defaultParticipantThreshold=100;
  const validThreshold=value=>Number.isSafeInteger(value)&&value>0;
  const coversNull=row=>Number.isFinite(row.lower)&&Number.isFinite(row.upper)&&row.lower>0&&row.lower<=1&&row.upper>=1;
  function plan(row,power){
    const plans=[];
    if(row.measure==='HR'){
      const {events}=Planning.events(row.estimate,{power});
      if(events!==null)plans.push({events,required_n:null});
    }else{
      for(const assumption of row.scenarios||[]){
        const result=Planning.calculate(row.estimate,row.measure,assumption,{power});
        if(result.n===null)continue;
        plans.push({...assumption,events:null,required_n:result.n});
      }
    }
    return {...row,plans};
  }
  function belowThresholds(assessed,eventThreshold,participantThreshold){
    return assessed.filter(row=>row.plans.length>0 && row.plans.every(
      p=>row.measure==='HR'?p.events<eventThreshold:p.required_n<participantThreshold));
  }
  function matchingRows(data,power,eventThreshold=defaultEventThreshold,participantThreshold=defaultParticipantThreshold){
    if(!validPower(power)||!validThreshold(eventThreshold)||!validThreshold(participantThreshold))return [];
    return belowThresholds(data.rows.filter(coversNull).map(row=>plan(row,power)),eventThreshold,participantThreshold);
  }
  function range(plans,key){
    const values=plans.map(p=>p[key]).filter(Number.isSafeInteger);
    return values.length?[Math.min(...values),Math.max(...values)]:[null,null];
  }
  function displayRange(plans,key){
    const [min,max]=range(plans,key);
    if(min===null)return '—';
    return min===max?min.toLocaleString('en-US'):min.toLocaleString('en-US')+'–'+max.toLocaleString('en-US');
  }
  function publicationYear(row){
    return /^\d{4}$/.test(row.year) ? Number(row.year) : null;
  }
  function sortRows(rows,column,direction){
    const value=column==='year'?publicationYear:row=>range(row.plans,column==='events'?'events':'required_n')[0];
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
    return `<th scope="col" class="planning-sort-header"${active?' aria-sort="'+sort.direction+'"':''}><span class="planning-sort-heading"><span>${label}</span><span class="evidence-sort-buttons">${buttons}</span></span></th>`;
  }
  function rowHtml(row){
    const pmid=String(row.pmid);
    const publication=/^\d+$/.test(pmid)?`<a href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/" target="_blank" rel="noopener noreferrer">${escape(row.title)}</a>`:escape(row.title);
    const events=displayRange(row.plans,'events');
    const sampleSize=displayRange(row.plans,'required_n');
    const details=row.plans.length>1?`<details><summary>By follow-up</summary>${row.plans.map(p=>{
      const when=Number.isFinite(p.time_months)?p.time_months+' mo':p.cutoff||'Study follow-up';
      return '<small>'+escape(when)+' · N='+p.required_n.toLocaleString('en-US')+'</small>';
    }).join('')}</details>`:'';
    const note=row.cutoff ? `<small>${escape(row.cutoff)}</small>` : '';
    const provenance=[row.original_level ? `From ${row.original_level}% CI` : '',row.calculated ? 'Calculated from arm rates' : ''].filter(Boolean);
    const mark=row.abstract_only ? '<sup class="abstract-only-mark" title="Results based on abstract only" aria-label="Abstract only">*</sup>' : '';
    const cell=value=>escape(value && value!=='NA' ? value : '—');
    const endpoint=row.endpoint_detail ? `${cell(row.endpoint).replace(/_/g,' ')}<small>${escape(row.endpoint_detail)}</small>` : cell(row.endpoint);
    return `<tr data-pmid="${escape(pmid)}"${row.nontrial ? ' class="study-nontrial"' : ''}>
      <td>${publication}${mark}${/^\d+$/.test(pmid) ? `<small>PMID ${pmid}</small>` : ''}</td><td>${cell(row.author ? row.author+' et al.' : '')}</td>
      <td>${publicationYear(row)??'—'}</td><td>${cell(row.trial)}</td><td>${cell(row.nct)}</td><td>${cell(row.population)}${note}</td>
      <td>${studies().savedTreatmentTag(row.comparator_label || row.reference)}</td><td>${studies().savedTreatmentTag(row.intervention_label || row.treatment,row.add_on)}</td>
      <td>${endpoint}</td><td>${escape(row.measure)} ${CI.formatEffectNumber(row.estimate)} (${CI.formatEffectNumber(row.lower)}–${CI.formatEffectNumber(row.upper)})${provenance.length ? `<small>${escape(provenance.join(' · '))}</small>` : ''}</td>
      <td>${events}</td><td>${sampleSize}${details}</td></tr>`;
  }
  const mounted=new WeakMap();
  function mount(panel,data,attachAdvanced,targetPower=.8){
    if(!panel||data?.schema_version!==2||!Array.isArray(data.rows))throw Error('Required sample size data unavailable.');
    const previous=mounted.get(panel);
    if(previous)previous.destroy();
    const previousThreshold=(attribute,fallback)=>{
      const value=Number(panel.querySelector('input['+attribute+']')?.value);
      return validThreshold(value)?value:fallback;
    };
    const initialEvents=previousThreshold('data-event-threshold',defaultEventThreshold);
    const initialParticipants=previousThreshold('data-participant-threshold',defaultParticipantThreshold);
    panel.innerHTML=`<div class="panel-heading"><div class="evidence-tab-heading" data-power-heading><h2>Underpowered studies</h2></div><label class="evidence-threshold">Survival event cutoff <input type="number" min="1" step="1" required data-event-threshold value="${initialEvents}"></label><label class="evidence-threshold">Binary participant cutoff <input type="number" min="1" step="1" required data-participant-threshold value="${initialParticipants}"></label></div><div data-power-filter></div>
      <p class="evidence-tab-note">The 95% CI includes 1 and the required events (survival) or participants (binary outcomes) fall below the corresponding cutoff. Two-sided α = 0.05, with equal allocation.</p>
      <div data-power-results></div><details class="evidence-tab-note"><summary>How the targets are calculated</summary>
      <p>For survival outcomes, the reported HR determines the required events using the Schoenfeld formula. For binary outcomes, the two anticipated arm rates determine the required total sample size. Targets are rounded up before applying each cutoff. When several binary assessment times are available, each required sample size must meet the cutoff. <a href="https://pubmed.ncbi.nlm.nih.gov/6354290/" target="_blank" rel="noopener noreferrer">Survival method</a> · <a href="https://www.statsmodels.org/stable/generated/statsmodels.stats.proportion.power_proportions_2indep.html" target="_blank" rel="noopener noreferrer">Binary method</a></p></details>`;
    const eventInput=panel.querySelector('[data-event-threshold]'),participantInput=panel.querySelector('[data-participant-threshold]'),output=panel.querySelector('[data-power-results]');
    let sort={column:'year',direction:'descending'}, selections=Advanced.resetSelections(), options={};
    let assessed=[],qualified=[],power=null,eventThreshold=null,participantThreshold=null,filterUI;
    function compute(){
      const nextEvents=Number(eventInput.value),nextParticipants=Number(participantInput.value);
      if(targetPower===power&&nextEvents===eventThreshold&&nextParticipants===participantThreshold)return;
      if(targetPower!==power){
        power=targetPower;
        assessed=data.rows.filter(coversNull).map(row=>plan(row,power));
      }
      eventThreshold=nextEvents;participantThreshold=nextParticipants;
      qualified=validThreshold(eventThreshold)&&validThreshold(participantThreshold)
        ?belowThresholds(assessed,eventThreshold,participantThreshold):[];
    }
    function getEvidence(chosen,expanded,opts){
      compute();
      const candidates=qualified.map(row=>({study:{pmid:row.pmid},results:[row.filter_binding],comparisons:[]}));
      const filtered=Advanced.filterBrowseMatches(candidates,chosen,opts);
      return {facets:expanded?Advanced.browseFacets(candidates,chosen,opts):[],summary:Advanced.browseSummary(filtered,opts)};
    }
    function table(rows){
      return `<div class="table-scroll"><table class="evidence-tab-table study-evidence-grid"><thead><tr><th scope="col">Study</th><th scope="col">First author</th>${sortHeading('Published year','year',sort)}<th scope="col">Trial name</th><th scope="col">NCT number</th><th scope="col">Group</th><th scope="col">Comparator</th><th scope="col">Intervention</th><th scope="col">Endpoint</th><th scope="col">Effect (95% CI)</th>${sortHeading('Required events','events',sort)}${sortHeading('Required participants','n',sort)}</tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`;
    }
    function render(){
      compute();
      if(!validThreshold(eventThreshold)||!validThreshold(participantThreshold)){output.innerHTML='<p role="status" class="evidence-tab-note">Enter a positive whole number for each cutoff.</p>';return;}
      const matches=row=>Advanced.resultMatches(row.filter_binding,selections,options);
      const rows=sortRows(qualified.filter(matches),sort.column,sort.direction);
      const n=new Set(rows.map(r=>r.pmid)).size;
      const status=`${n} ${n===1?'publication':'publications'} · ${rows.length} ${rows.length===1?'result':'results'}`;
      const unavailable=assessed.filter(row=>!row.plans.length&&matches(row)).length;
      const unavailableNote=unavailable?`<p class="evidence-tab-note">Planning target unavailable for ${unavailable} ${unavailable===1?'result':'results'}.</p>`:'';
      output.innerHTML=`<p role="status" class="evidence-tab-note">${status}</p>`+(rows.length?table(rows):'')+unavailableNote;
    }
    output.addEventListener('click',event=>{
      const button=event.target.closest('button[data-sort-column]');
      if(!button)return;
      const {sortColumn:column,sortDirection:direction}=button.dataset;
      if(sort.column===column&&sort.direction===direction)return;
      const scroll=button.closest('.table-scroll')?.scrollLeft||0;
      sort={column,direction};render();
      requestAnimationFrame(()=>{const scroller=output.querySelector('.table-scroll');if(scroller)scroller.scrollLeft=scroll;
        output.querySelector(`button[data-sort-column="${column}"][aria-pressed="true"]`)?.focus({preventScroll:true});});
    });
    function refresh(){render();filterUI?.refresh();}
    for(const control of [eventInput,participantInput])control.addEventListener('input',refresh);
    if(attachAdvanced)filterUI=attachAdvanced(panel.querySelector('[data-power-heading]'),panel.querySelector('[data-power-filter]'),getEvidence,
      (chosen,opts)=>{selections=chosen;options=opts;render();});
    render();
    const controller={destroy:()=>filterUI?.destroy(),setPower(value){
      if(validPower(value)&&value!==targetPower){targetPower=value;refresh();}
    }};
    mounted.set(panel,controller);
    return controller;
  }
  return {mount,matchingRows,plan};
});
