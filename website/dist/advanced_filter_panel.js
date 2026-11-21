/* Accessible stored-data controls. Clinical eligibility lives in AdvancedFilters. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AdvancedFilterPanel=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function create({toggle,panel,fields,reset,status,evidence,onToggle,onChange,onReset,prefix='advanced',lazy=false}){
    toggle.addEventListener('click',onToggle);
    fields.addEventListener('change',event=>{const key=event.target.dataset.advancedFilter;if(key)onChange(key,event.target.value);});
    reset.addEventListener('click',onReset);
    function update({facets=[],summary={},active=0,expanded=false,loading=false,unavailable=false}){
      toggle.setAttribute('aria-expanded',String(expanded));panel.hidden=!expanded;
      toggle.querySelector('.advanced-filter-text').textContent='Advanced filter'+(active?` (${active} active)`:'');
      toggle.disabled=loading&&!lazy;reset.disabled=loading||!active;
      const focused=(fields.ownerDocument||document).activeElement;
      const focus=fields.contains(focused)?focused.dataset.advancedFilter:null;
      const visible=facets.filter(facet=>facet.visible);
      fields.innerHTML=visible.map(facet=>`<div class="advanced-filter-field"><label for="${escape(prefix)}-${escape(facet.key)}">${escape(facet.label)}</label><select id="${escape(prefix)}-${escape(facet.key)}" data-advanced-filter="${escape(facet.key)}">${facet.options.map(option=>`<option value="${escape(option.value)}"${option.value===facet.value?' selected':''}>${escape(option.label)}${option.value==='all'?'':` (${option.count} ${option.count===1?'report':'reports'})`}</option>`).join('')}</select></div>`).join('');
      if(focus)fields.querySelector(`[data-advanced-filter="${focus}"]`)?.focus({preventScroll:true});
      status.textContent=loading?'Loading stored classifications…':unavailable?'Stored classifications are unavailable.':!visible.length?'No subgroup information is available for these selections.':'';
      status.hidden=!status.textContent;status.classList.toggle('advanced-filter-warning',unavailable);
      reset.hidden=!active;
      reset.parentElement.hidden=!active;
      if(loading){evidence.textContent='';evidence.hidden=true;return;}
      const n=summary.report_count||0;
      evidence.textContent=`${n.toLocaleString('en-US')} ${n===1?'report':'reports'}`;
      evidence.title='Distinct reports in this view. Each PMID counts once, regardless of its number of groups or outcomes.';
      evidence.hidden=!active&&!expanded;evidence.classList.remove('advanced-filter-warning');
    }
    return {update};
  }
  function mount({heading,body,id,onToggle,onChange,onReset}){
    const doc=heading.ownerDocument;
    const toggle=doc.createElement('button');toggle.type='button';toggle.className='advanced-filter-toggle';
    toggle.setAttribute('aria-controls',id+'-panel');toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML='<svg class="icon" aria-hidden="true"><use href="#i-chevron"/></svg><span class="advanced-filter-text">Advanced filter</span>';
    heading.appendChild(toggle);
    const panel=doc.createElement('section');panel.className='advanced-filters';panel.id=id+'-panel';panel.hidden=true;
    panel.setAttribute('aria-label','Advanced filter');body.appendChild(panel);
    panel.innerHTML='<div class="advanced-filter-fields"></div><p class="advanced-filter-status" role="status" aria-live="polite"></p><p class="advanced-evidence-count"></p><div class="advanced-filter-footer"><button type="button" class="secondary-button">Reset advanced filters</button></div>';
    const controls=create({toggle,panel,fields:panel.querySelector('.advanced-filter-fields'),reset:panel.querySelector('button'),status:panel.querySelector('[role=status]'),evidence:panel.querySelector('.advanced-evidence-count'),prefix:id,lazy:true,onToggle,onChange,onReset});
    return {update:controls.update,destroy(){toggle.remove();panel.remove();}};
  }
  return {create,mount};
});
