/* Complete-arm selections and randomized network estimates for the Studies tab. */
(function(root, factory) {
  const common=typeof module==='object' && module.exports;
  const api=factory(common?require('./treatment_network_evidence.js'):root.TreatmentNetworkEvidence,
    common?require('./treatment_map_effects.js'):root.TreatmentMapEffects,
    common?require('./treatment_network_model.js'):root.TreatmentNetworkModel);
  if(common)module.exports=api;else root.StudyIndirect=api;
})(globalThis,function(Evidence,Effects,Model) {
  'use strict';
  function studyKey(description) {
    if(!description || description.unspecified_other_treatments)return null;
    if(Evidence.isBackgroundControl(description.definition?.raw_label || description.label))return 'control:background';
    if(!description.known)return null;
    if(['agent','combination','sequential'].includes(description.kind) || description.key==='class:surgery')return description.key;
    return null;
  }
  function catalogue(graph,describe) {
    const labels=Evidence.regimenLabels(graph),keys=new Map(),ids=new Map();
    const nodes=new Map(graph.nodes.map(node=>[node.id,node]));
    const choices=[];
    for(const [id,label] of labels) {
      const key=id==='control:background'?id:studyKey(describe(label));
      if(key) {
        keys.set(id,key);
        ids.set(key,ids.has(key)?null:id);
      }
      const node=nodes.get(id);
      choices.push({value:id,label,depth:0,color_class:node?.broad_category || 'other',search_text:(node?.aliases || []).join(' ')});
    }
    choices.sort((a,b)=>a.label.localeCompare(b.label));
    return {labels,keys,ids,choices};
  }
  function pickerTree(browseEntries,catalog,groups,role) {
    if(!catalog)return groups.optionTree(browseEntries);
    // A named agent can be selected as a complete regimen or as a component
    // of an arm. Keep both meanings available, including add-on study filters.
    const tree=groups.optionTree([...browseEntries,...catalog.choices]);
    const browseValues=new Set(groups.optionTree(browseEntries).map(row=>row.value));
    const exactLabels=new Set(catalog.choices.map(row=>row.label.toLowerCase()));
    const aliases=new Map(catalog.choices.map(row=>[row.value,row.search_text]));
    return tree.map(row=>{
      if(catalog.labels.has(row.value))return {...row,label:catalog.labels.get(row.value),hidden:false,
        search_text:[row.search_text,aliases.get(row.value)].filter(Boolean).join(' ')};
      if(row.value.startsWith('treatment-class:'))return {...row,disabled:!browseValues.has(row.value),
        label:row.value.startsWith('treatment-class:agent:') ? row.label+' (all regimens)' : row.label};
      if(!row.hidden && !row.value.startsWith('treatment-class:') && exactLabels.has(row.label.toLowerCase()))
        return {...row,label:row.label+(role==='intervention'?' (as study intervention)':' (as study comparator)')};
      return row;
    });
  }
  const releaseIndexes=new WeakMap();
  function releaseIndex(graph) {
    if(releaseIndexes.has(graph))return releaseIndexes.get(graph);
    const rows=[...(graph.comparisons || []),...(graph.network_direct_evidence || [])];
    const options=Evidence.readableTimeOptions(Effects.availableEndpointOptions(rows));
    const byEndpoint=new Map();
    for(const row of rows) {
      const key=Effects.endpointKey(row);
      if(!key)continue;
      if(!byEndpoint.has(key))byEndpoint.set(key,{records:[],armIds:new Set()});
      const group=byEndpoint.get(key);
      group.records.push(row);
      for(const arm of [row.intervention,row.comparator]) {
        if(arm?.network_regimen_id)group.armIds.add(arm.network_regimen_id);
        if(arm?.node_id)group.armIds.add(arm.node_id);
      }
    }
    const index={options,byEndpoint};
    releaseIndexes.set(graph,index);
    return index;
  }
  function endpointChoices(graph,family,abbreviation) {
    const {options}=releaseIndex(graph);
    if(!family)return options.filter(option=>option.count || option.key==='OS:HR');
    const selected=options.filter(option=>!option.disabled && (family==='adverse_events'
      ? option.endpoint.startsWith('AE') || option.endpoint==='treatment_related_death'
      : option.endpoint===abbreviation));
    // RR is the Studies default for binary outcomes. OR remains a separate target.
    return selected.sort((a,b)=>Number(a.measure==='OR')-Number(b.measure==='OR'));
  }
  function calculate(graph,network,intervention,comparator,model,advanced,lookup) {
    return Model.fitPair({graph,network,intervention,comparator,model,advanced,lookup});
  }
  function analysisScope(graph,advanced) {
    const {byEndpoint}=releaseIndex(graph),cache=new Map();
    function networkFor(endpoint,target='') {
      const key=JSON.stringify([endpoint,target]);
      if(cache.has(key))return cache.get(key);
      // Evidence.build already selects these exact endpoint keys before choosing a target.
      const network=Evidence.build({nodes:graph.nodes,comparisons:byEndpoint.get(endpoint)?.records || []},{endpoint,target,advanced});
      cache.set(key,network);
      if(cache.size>30)cache.delete(cache.keys().next().value);
      return network;
    }
    function candidate(key,first,second) {
      const group=byEndpoint.get(key);
      // Background controls can also be resolved from text inside the evidence builder.
      return group?.records.length>=2 && [first,second].every(id=>id==='control:background' || group.armIds.has(id));
    }
    return {graph,advanced,networkFor,candidate};
  }
  async function* estimableOutcomes(scope,endpoints,intervention,comparator,model,lookup,current=()=>true) {
    let lastPaint=Date.now();
    for(const endpoint of endpoints) {
      if(!current())return;
      if(!scope.candidate(endpoint.key,intervention,comparator))continue;
      const primary=scope.networkFor(endpoint.key);
      for(const {id} of primary.targets) {
        if(Date.now()-lastPaint>=16) {
          await new Promise(resolve=>setTimeout(resolve,0));
          lastPaint=Date.now();
        }
        if(!current())return;
        const network=id===primary.target?primary:scope.networkFor(endpoint.key,id);
        const {pair,fit}=await calculate(scope.graph,network,intervention,comparator,model,scope.advanced,lookup);
        if(!current())return;
        if(fit?.available)yield {endpoint,network,pair,fit};
      }
    }
  }
  return Object.freeze({studyKey,catalogue,pickerTree,endpointChoices,analysisScope,estimableOutcomes,calculate});
});
