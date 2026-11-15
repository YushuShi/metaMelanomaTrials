/* Accessible stored-data controls. Clinical eligibility lives in AdvancedFilters. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AdvancedFilterPanel=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function create({toggle,panel,fields,reset,status,evidence,onToggle,onChange,onReset}){
    toggle.addEventListener('click',onToggle);
    fields.addEventListener('change',event=>{const key=event.target.dataset.advancedFilter;if(key)onChange(key,event.target.value);});
    reset.addEventListener('click',onReset);
    function update({facets=[],summary={},active=0,expanded=false,loading=false,unavailable=false}){
      toggle.setAttribute('aria-expanded',String(expanded));panel.hidden=!expanded;
      toggle.querySelector('.advanced-filter-text').textContent='Advanced filter'+(active?` (${active} active)`:'');
      toggle.disabled=loading;reset.disabled=loading||!active;
      const focus=fields.contains(document.activeElement)?document.activeElement.dataset.advancedFilter:null;
      const visible=facets.filter(facet=>facet.visible);
      fields.innerHTML=visible.map(facet=>`<div class="advanced-filter-field"><label for="advanced-${escape(facet.key)}">${escape(facet.label)}</label><select id="advanced-${escape(facet.key)}" data-advanced-filter="${escape(facet.key)}">${facet.options.map(option=>`<option value="${escape(option.value)}"${option.value===facet.value?' selected':''}>${escape(option.label)}${option.value==='all'?'':` (${option.count} ${option.count===1?'report':'reports'})`}</option>`).join('')}</select></div>`).join('');
      if(focus)fields.querySelector(`[data-advanced-filter="${focus}"]`)?.focus({preventScroll:true});
      status.textContent=loading?'Loading stored classifications…':unavailable?'Stored classifications are unavailable.':!visible.length?'No subgroup information is available for these selections.':'';
      status.hidden=!status.textContent;status.classList.toggle('advanced-filter-warning',unavailable);
      reset.hidden=!active;
      reset.parentElement.hidden=!active;
      if(loading){evidence.textContent='';evidence.hidden=true;return;}
      const n=summary.report_count||0;
      evidence.textContent=`${n.toLocaleString('en-US')} ${n===1?'report':'reports'}`;
      evidence.title='Distinct reports in the study table. Each PMID counts once, regardless of its number of groups or outcomes.';
      evidence.hidden=!active&&!expanded;evidence.classList.remove('advanced-filter-warning');
    }
    return {update};
  }
  return {create};
});
