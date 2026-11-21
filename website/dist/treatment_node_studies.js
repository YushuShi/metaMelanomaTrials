/* Exact, source-bound node membership. This view never infers treatments from titles. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.TreatmentNodeStudies=factory();
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const list=value=>Array.isArray(value)?value:[];
  const valid=value=>value!==null&&value!==undefined&&value!==''&&value!=='NA';
  const native=value=>typeof value==='object'?value?.entity_id:value;
  const independentKey=member=>member.cohort?.independent_group_id||member.cohort?.root_id||member.root_id||member.study_id;
  function sourceMatches(row,binding){
    const scope=row?.scope&&typeof row.scope==='object'?row.scope:row;
    return !!binding.source_input_sha256&&!!binding.review_binding_sha256&&scope.source_input_sha256===binding.source_input_sha256&&scope.review_binding_sha256===binding.review_binding_sha256&&(!binding.report_id||!scope.report_id||scope.report_id===binding.report_id);
  }
  // One PMID can supply several arms and clinical populations. Bind the actual
  // result or count to its exact regimen before testing a clinical selection.
  function filterIndex(graph,clinical,comparisons,controlFor){
    const reports=new Map(),records=new Map(),nodesByRecord=new Map(),used=new Map();
    for(const report of list(clinical?.articles)){
      if(!report.current_main_eligible||report.publication_hold)continue;
      const pmid=String(report.pmid);
      reports.set(pmid,{study:{pmid},results:[],browse_samples:[]});
      for(const row of [...list(report.quantitative_results),...list(report.sample_size_records)]){
        if(!row.main_result_eligible)continue;
        const id=row.result_id||row.sample_record_id;
        if(id&&String(row.pmid)===pmid)records.set(id,row);
      }
    }
    function add(binding,id,nodeId){
      const row=records.get(id);
      if(!nodeId||!row||String(binding.pmid)!==String(row.pmid)||!sourceMatches(row,binding))return;
      if(!nodesByRecord.has(id)){
        const report=reports.get(String(row.pmid));
        (row.result_id?report.results:report.browse_samples).push(row);
        used.set(String(row.pmid),report);
        nodesByRecord.set(id,new Set());
      }
      nodesByRecord.get(id).add(nodeId);
    }
    for(const member of list(graph.study_memberships)){
      for(const binding of list(member.source_bindings)){
        if(String(binding.pmid)!==String(member.pmid))continue;
        for(const id of [...list(binding.result_ids),...list(binding.sample_ids)])add(binding,id,member.node_id);
      }
    }
    for(const comparison of list(comparisons)){
      for(const arm of [comparison.intervention,comparison.comparator]){
        const nodeId=arm?.node_id||controlFor?.(arm?.label)?.id;
        for(const binding of list(comparison.analysis?.filter_bindings))add(binding,binding.result_id,nodeId);
      }
    }
    return {base:[...used.values()],nodesByRecord};
  }
  function matchingNodes(index,matches){
    const ids=new Set();
    for(const match of matches){
      for(const row of [...list(match.results),...list(match.browse_samples)])
        for(const id of index.nodesByRecord.get(row.result_id||row.sample_record_id)||[])ids.add(id);
    }
    return ids;
  }
  function subsetStudy(study,bindings){
    const details=study.details||{},raw=list(details.quantitative_results||study.quantitative_results);
    const results=raw.filter(row=>bindings.some(b=>sourceMatches(row,b)&&list(b.result_ids).includes(row.result_id)));
    const ids=new Set(results.map(row=>row.result_id));
    const samples=list(details.sample_size_records).filter(row=>bindings.some(b=>sourceMatches(row,b)&&list(b.sample_ids).includes(row.sample_record_id)));
    const comparisons=list(study.comparisons).filter(row=>list(row.result_ids).some(id=>ids.has(id))||bindings.some(b=>sourceMatches(row,b)&&list(b.arm_ids).includes(native(row.outcome_arm_id))));
    const groups=Array.isArray(details.canonical_result_groups)?details.canonical_result_groups.map(group=>{
      const kept=list(group.member_result_ids).filter(id=>ids.has(id));
      return kept.length?{...group,member_result_ids:kept,representative_result_id:kept.includes(group.representative_result_id)?group.representative_result_id:kept[0]}:null;
    }).filter(Boolean):undefined;
    const extraction=list(details.quantitative_extraction).flatMap(saved=>{
      const record=saved.record;if(!record)return [];
      const bound=bindings.filter(b=>b.task_id&&b.task_id===saved.task_id&&b.report_id===record.report_id&&b.source_input_sha256===record.source_sha256&&b.stage===record.stage);if(!bound.length)return [];
      const rows=results.filter(row=>bound.some(b=>sourceMatches(row,b))),keptIds=new Set(rows.map(row=>row.quantitative_record?.id));
      const counts=new Set(samples.filter(row=>bound.some(b=>sourceMatches(row,b))).map(row=>row.quantitative_record?.id));
      const arms=new Set(bound.flatMap(b=>list(b.arm_ids))),populations=new Set(bound.flatMap(b=>list(b.population_ids)));
      for(const row of rows){const q=row.quantitative_record||{};for(const id of [q.arm_id,q.intervention_arm_id,q.reference_arm_id,q.experimental_arm_id,q.comparator_arm_id])if(valid(id))arms.add(id);if(valid(q.population_id))populations.add(q.population_id);}
      return [{...saved,record:{...record,arms:list(record.arms).filter(arm=>arms.has(arm.id||arm.arm_id)),populations:list(record.populations).filter(p=>populations.has(p.id||p.population_id)),sample_sizes:list(record.sample_sizes).filter(row=>counts.has(row.id)),effects:list(record.effects).filter(row=>keptIds.has(row.id)),survival:list(record.survival).filter(row=>keptIds.has(row.id)),binary:list(record.binary).filter(row=>keptIds.has(row.id))}}];
    });
    return {...study,comparisons,details:{...details,quantitative_results:results,sample_size_records:samples,quantitative_extraction:extraction,...(groups?{canonical_result_groups:groups}:{})}};
  }
  function fallbackStudy(member){return {pmid:String(member.pmid),report_id:member.report_id||'',title:member.title||'PMID '+member.pmid,first_author_surname:member.first_author_surname||'',author_display:member.first_author_surname?member.first_author_surname+' et al.':'',year:member.year,default_visible:true,current_main_eligible:true,comparisons:[],details:{quantitative_results:[],sample_size_records:[]}};}
  function matches(studies,memberships,node,api,options={}){
    const byPMID=new Map(list(studies).map(study=>[String(study.pmid),study])),byReport=new Map();
    for(const member of list(memberships)){
      if(member.node_id!==node.id||!member.pmid)continue;
      const pmid=String(member.pmid);if(!byReport.has(pmid))byReport.set(pmid,[]);byReport.get(pmid).push(member);
    }
    const output=[];
    for(const [pmid,members]of byReport){
      const original=byPMID.get(pmid),bindings=members.flatMap(m=>list(m.source_bindings));
      const study=original?subsetStudy(original,bindings):fallbackStudy(members[0]);
      let results=api.studyResults(study),selectedMembers=members;
      if(options.endpoint){
        results=results.filter(result=>api.resultMatches(result,{endpoint:options.endpoint}));
        if(!results.length)continue;
        selectedMembers=members.filter(member=>list(member.source_bindings).some(binding=>
          results.some(result=>sourceMatches(result,binding)&&
            [result.result_id,...list(result.source_extraction_ids)].some(id=>list(binding.result_ids).includes(id)))));
      }
      const match={study,comparisons:study.comparisons,results,node_memberships:selectedMembers,node_id:node.id,exact_node_membership:true};
      let rows=api.studyTablePresentationRows(match,{...options,include_missing_n:true});
      if(options.endpoint)rows=rows.filter(row=>list(row.results).length);
      if(original&&rows.some(row=>row.results?.length&&row.comparisons?.some(co=>co.intervention_arm_id&&co.comparator_arm_id))){
        const context=api.studyTablePresentationRows({study:original,comparisons:original.comparisons,results:api.studyResults(original)},{...options,include_missing_n:true});
        rows=rows.map(row=>counterpartCounts(row,context));
      }
      const armRegimens=list(options.regimenMemberships||memberships).filter(m=>String(m.pmid)===pmid).flatMap(m=>list(m.source_bindings).map(binding=>({binding,regimen:m.canonical_regimen||{node_id:m.node_id,label:m.arm_label}})));
      if(!rows.length||!study.comparisons.length&&!match.results.length&&!list(study.details.sample_size_records).length){
        const cohorts=new Map();for(const member of members){const key=member.cohort_id||member.population||member.id;if(!cohorts.has(key))cohorts.set(key,member);}
        match.presentation_rows=[...cohorts.values()].map(member=>({comparisons:[],results:[],comparator_label:'—',intervention_label:node.label,is_add_on:false,exact_membership_fallback:true,exact_membership:member}));
      }else match.presentation_rows=rows.map(row=>canonicalLabels(row,armRegimens,node,api));
      output.push(match);
    }
    const studiesToReports=new Map();for(const match of output)for(const member of match.node_memberships){const id=independentKey(member);if(!id)continue;if(!studiesToReports.has(id))studiesToReports.set(id,new Set());studiesToReports.get(id).add(String(member.pmid));}
    for(const match of output){const related=new Set(match.node_memberships.flatMap(member=>[...studiesToReports.get(independentKey(member))||[]]));match.related_report_count=related.size;}
    return output;
  }
  function counterpartCounts(row,context){
    if(row.paired_arm_context||!row.results?.length)return row;
    const ids=new Set(row.results.map(r=>r.result_id)),comparisonIds=new Set(list(row.comparisons).map(c=>c.comparison_id));
    const candidates=list(context).filter(other=>other.paired_arm_context&&Number.isInteger(other.comparator_n)&&Number.isInteger(other.intervention_n)&&list(other.results).some(r=>ids.has(r.result_id))&&list(other.comparisons).some(c=>comparisonIds.has(c.comparison_id)));
    const values=new Set(candidates.map(c=>JSON.stringify([c.comparator_n,c.intervention_n,c.total_n,c.comparator_arm_id,c.intervention_arm_id])));
    if(values.size!==1)return row;
    const selected=candidates[0],output={...row};
    for(const key of ['paired_arm_context','comparator_n','intervention_n','comparator_arm_id','intervention_arm_id','total_n','arm_count_purpose'])output[key]=selected[key];
    return output;
  }
  function canonicalLabels(row,armRegimens,node,api){
    const output={...row};
    const ownBindings=armRegimens.filter(({regimen})=>regimen.node_id===node.id).map(x=>x.binding);
    const armOnly=list(row.results).length>0&&list(row.results).every(result=>{const q=result.quantitative_record||{};return valid(q.arm_id)&&!valid(q.intervention_arm_id)&&!valid(q.reference_arm_id)&&ownBindings.some(b=>sourceMatches(result,b)&&list(b.arm_ids).includes(q.arm_id));});
    const countOnly=!list(row.results).length&&list(row.comparisons).length>0&&list(row.comparisons).every(co=>ownBindings.some(b=>sourceMatches(co,b)&&list(b.arm_ids).includes(native(co.outcome_arm_id))));
    if(armOnly||countOnly){
      Object.assign(output,{comparator_label:'—',comparator_definition:null,intervention_label:node.label,intervention_definition:null,is_add_on:false});
      delete output.comparator_n;delete output.intervention_n;output.paired_arm_context=false;
      return output;
    }
    // The producer has validated the exact source arm. A display-only projection
    // supplies its canonical regimen when the older prepared label is unresolved.
    for(const side of ['comparator','intervention']){
      const choices=armRegimens.filter(({binding:b})=>list(row.comparisons).some(co=>sourceMatches(co,b)&&list(b.arm_ids).includes(native(co[side+'_arm_id']||side==='intervention'&&co.outcome_arm_id))));
      const labels=[...new Set(choices.map(c=>c.regimen.label).filter(Boolean))];if(labels.length!==1)continue;
      const description=api.regimenDescription(output[side+'_definition']||output[side+'_label']);
      if(!description.known||!description.simple_concurrent||output[side+'_label']==='—'){
        output[side+'_label']=labels[0];output[side+'_definition']=null;
        if(side==='intervention')output.is_add_on=false;
      }
    }
    if(!row.comparisons?.length&&!output.intervention_label){output.intervention_label=node.label;output.intervention_definition=null;output.is_add_on=false;}
    return output;
  }
  function independentStudyIds(rows){return new Set(rows.flatMap(match=>match.node_memberships.filter(m=>m.independent_cohort_count_eligible===true).map(independentKey).filter(Boolean)));}
  function mount(root,options){
    const {node,api,renderRows,download}=options,doc=root.ownerDocument;
    const all=matches(options.studies,options.memberships,node,api,options),state={sort:'year',order:'desc',trialsOnly:false,page:1,endpoint:''},pageSize=10;
    const endpointMatches=new Map([['',all]]);
    const make=(tag,parent,text,className)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;parent.appendChild(el);return el;};
    root.replaceChildren();root.classList.add('tm-node-studies');root.dataset.nodeId=node.id;
    const heading=make('div',root,undefined,'panel-heading study-table-heading'),titles=make('div',heading),title=make('h2',titles,'Studies · '+node.label),summary=make('p',titles,'','tm-node-studies-summary');
    const actions=make('div',heading,undefined,'study-table-actions');
    const endpointField=make('label',actions,undefined,'tm-node-endpoint');
    make('span',endpointField,'Endpoint');
    const endpointSelect=make('select',endpointField);
    endpointSelect.setAttribute('aria-label','Study list endpoint');
    const allEndpoints=make('option',endpointSelect,'All endpoints');allEndpoints.value='';
    const endpointKeys=new Set();
    for(const match of all){
      for(const result of match.results){
        const endpoint=api.displayEndpointFamily(result);
        if(endpoint&&api.resultMatches(result,{endpoint}))endpointKeys.add(endpoint);
      }
    }
    for(const endpoint of endpointKeys){
      const option=make('option',endpointSelect,api.endpointOptionLabel(endpoint));
      option.value=endpoint;
    }
    const trials=make('button',actions,'Trial Only','secondary-button'),csv=make('button',actions,'Download CSV','secondary-button');trials.type=csv.type='button';trials.setAttribute('aria-pressed','false');csv.title='Download all matching reports across all pages';
    const scroll=make('div',root,undefined,'table-scroll'),table=make('table',scroll,undefined,'scoped-studies-table tm-exact-studies-table'),head=make('tr',make('thead',table)),sorts={};
    for(const [label,key]of [['Study'],['First author','author'],['Year','year'],['PMID'],['Trial name'],['NCT number'],['Group'],['Comparator'],['Intervention'],['Sample size'],['Effect size (CI)']]){
      const th=make('th',head);th.scope='col';if(key){const b=make('button',th,label+' ↕');b.type='button';sorts[key]={th,b,label};b.addEventListener('click',()=>{state.order=state.sort===key&&state.order==='asc'?'desc':'asc';state.sort=key;state.page=1;render();});}else th.textContent=label;
    }
    const body=make('tbody',table),footer=make('div',root,undefined,'main-articles-footer'),range=make('span',footer),nav=make('nav',footer,undefined,'main-articles-pagination'),previous=make('button',nav,'Previous','secondary-button'),page=make('span',nav),next=make('button',nav,'Next','secondary-button');previous.type=next.type='button';
    function selected(){
      if(!endpointMatches.has(state.endpoint)){
        endpointMatches.set(state.endpoint,matches(options.studies,options.memberships,node,api,{...options,endpoint:state.endpoint}));
      }
      const rows=endpointMatches.get(state.endpoint);
      return api.sortStudyRows(state.trialsOnly?rows.filter(match=>api.studyDesignInfo(match.study).is_trial):rows,state.sort,state.order);
    }
    function render(){
      const rows=selected(),pages=Math.max(1,Math.ceil(rows.length/pageSize));state.page=Math.min(state.page,pages);const first=(state.page-1)*pageSize;
      const ids=independentStudyIds(rows);
      summary.textContent=`${ids.size.toLocaleString()} identified ${ids.size===1?'study':'studies'} · ${rows.length.toLocaleString()} ${rows.length===1?'report':'reports'}${state.trialsOnly?' · trials only':''}`;
      body.innerHTML=renderRows(rows.slice(first,first+pageSize),{include_missing_n:true,show_pmid:true,node_table:true})||'<tr><td colspan="11">No retained reports match these selections.</td></tr>';
      range.textContent=rows.length?`${first+1}–${Math.min(first+pageSize,rows.length)} of ${rows.length} reports`:'0 reports';page.textContent=`Page ${state.page} of ${pages}`;previous.disabled=state.page<=1;next.disabled=state.page>=pages;csv.disabled=!rows.length;
      for(const [key,entry]of Object.entries(sorts)){const active=state.sort===key;entry.th.setAttribute('aria-sort',active?(state.order==='asc'?'ascending':'descending'):'none');entry.b.textContent=entry.label+' '+(active?(state.order==='asc'?'↑':'↓'):'↕');}
      trials.setAttribute('aria-pressed',String(state.trialsOnly));
    }
    endpointSelect.addEventListener('change',()=>{state.endpoint=endpointSelect.value;state.page=1;render();});
    trials.addEventListener('click',()=>{state.trialsOnly=!state.trialsOnly;state.page=1;render();});previous.addEventListener('click',()=>{state.page--;render();});next.addEventListener('click',()=>{state.page++;render();});csv.addEventListener('click',()=>download(api.studyTableCSV(selected(),{...options,include_missing_n:true}),node));
    render();return {matches:all,render,destroy(){root.replaceChildren();}};
  }
  return Object.freeze({sourceMatches,filterIndex,matchingNodes,subsetStudy,matches,counterpartCounts,independentStudyIds,mount});
});
