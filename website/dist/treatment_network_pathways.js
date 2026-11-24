/* Explanations of an indirect estimate using only trials on each treatment route. */
(function(root,factory) {
  if(typeof module==='object' && module.exports)
    module.exports=factory(require('./treatment_network_model.js'),require('./confidence_intervals.js'));
  else root.TreatmentNetworkPathways=factory(root.TreatmentNetworkModel,root.ConfidenceIntervals);
})(globalThis,function(Model,Intervals) {
  'use strict';
  const key=(a,b)=>JSON.stringify([a,b].sort());
  const columns=['Study','First author','Year','Trial name','NCT number','Group','Comparator','Intervention','Sample size','Effect size (CI)'];
  const fmt=Intervals.formatEffectNumber;

  function routeGraph(pair) {
    const legs=new Map(),adjacency=new Map();
    for(const edge of pair.comparisons) {
      const {treatment:a,comparator:b,trialId}=edge,id=key(a,b);
      if(!legs.has(id)) {
        legs.set(id,new Map());
        for(const [from,to] of [[a,b],[b,a]]) {
          if(!adjacency.has(from))adjacency.set(from,[]);
          adjacency.get(from).push(to);
        }
      }
      legs.get(id).set(trialId,edge);
    }
    return {adjacency,legs};
  }

  // Group replications of a leg into one route. A detour through extra arms of
  // a single trial cannot create a further independent route. Look for a
  // distinct trial to support each leg, including when a choice of trials exists.
  function independentLegs(legs) {
    const owner=new Map();
    function assign(index,visited) {
      for(const trial of legs[index].keys()) {
        if(visited.has(trial))continue;
        visited.add(trial);
        if(!owner.has(trial) || assign(owner.get(trial),visited)) {
          owner.set(trial,index);
          return true;
        }
      }
      return false;
    }
    return legs.every((_,i)=>assign(i,new Set()));
  }

  function* routes(graph,first,second,label=id=>id) {
    const {adjacency,legs}=graph;
    if(first===second || !adjacency.has(first) || !adjacency.has(second))return;
    const distance=new Map([[second,0]]),queue=[second];
    for(let i=0;i<queue.length;i++) for(const next of adjacency.get(queue[i])) {
      if(distance.has(next))continue;
      distance.set(next,distance.get(queue[i])+1);
      queue.push(next);
    }
    if(!distance.has(first))return;
    const neighbors=new Map([...adjacency].map(([id,ids])=>[id,ids.slice().sort((a,b)=>label(a).localeCompare(label(b)) || a.localeCompare(b))]));
    const path=[first],visited=new Set(path),edges=[];
    function* walk(id,remaining) {
      if(id===second) {
        if(!remaining && independentLegs(edges))yield {regimens:path.slice(),legs:edges.slice()};
        return;
      }
      if(distance.get(id)>remaining)return;
      for(const next of neighbors.get(id)) {
        if(visited.has(next) || distance.get(next)>=remaining)continue;
        path.push(next);visited.add(next);edges.push(legs.get(key(id,next)));
        yield* walk(next,remaining-1);
        edges.pop();visited.delete(next);path.pop();
      }
    }
    for(let length=Math.max(2,distance.get(first));length<distance.size;length++)yield* walk(first,length);
  }

  // Keep a spanning forest of the selected contrasts within each trial. A-B,
  // B-C and A-C from one trial carry only two independent contrasts.
  function projectEvidence(comparisons,blocks) {
    const byTrial=new Map();
    for(const edge of comparisons) {
      if(!byTrial.has(edge.trialId))byTrial.set(edge.trialId,[]);
      byTrial.get(edge.trialId).push(edge);
    }
    const projected=[];
    for(const block of blocks) {
      const edges=byTrial.get(block.trialId);
      if(!edges)continue;
      const parents=new Map(),pairs=[];
      function root(id) {
        while(parents.has(id))id=parents.get(id);
        return id;
      }
      for(const {treatment,comparator} of edges) {
        const a=root(treatment),b=root(comparator);
        if(a===b)continue;
        parents.set(a,b);
        pairs.push([treatment,comparator]);
      }
      const projection=Model.projectTrial(block,pairs);
      if(!projection)return null;
      projected.push(projection);
    }
    return projected.length===byTrial.size?projected:null;
  }

  function routeInfluence(route,blocks,tau2) {
    const comparisons=route.legs.flatMap(leg=>[...leg.values()]);
    const projected=projectEvidence(comparisons,blocks);
    if(!projected)return {available:false,reason:'Incomplete covariance for the selected trial contrasts.'};
    const result=Model.pathwayContrast(projected,route.regimens[0],route.regimens.at(-1),tau2);
    if(!result.available)return result;
    // Return each route's GLS weights to the original trial basis, so shared
    // contrasts and distinct correlated arms can be recognized across routes.
    const original=new Map(blocks.map(block=>[block.trialId,block])),influence=new Map();
    for(const [i,block] of projected.entries()) {
      const source=original.get(block.trialId);
      const weights=source.contrasts.map(()=>0);
      for(const [j,{treatment,comparator}] of block.contrasts.entries()) {
        const basis=Model.coefficients(source.contrasts,treatment,comparator);
        basis.forEach((weight,k)=>{weights[k]+=weight*result.weights[i][j];});
      }
      influence.set(block.trialId,weights);
    }
    return {available:true,logEstimate:result.logEstimate,variance:result.variance,influence,comparisons};
  }

  function weightedFit(paths,blocks,model,tau2) {
    const base={method:'pathway-weighted',model,tau2,available:false};
    if(!paths.length)return {...base,reason:'Select at least one pathway.'};
    const invalid=paths.find(path=>!path.available || !(path.variance>0 && Number.isFinite(path.variance)));
    if(invalid)return {...base,reason:invalid.reason || 'A pathway lacks an estimable variance.'};
    // Scaling every precision by the same constant preserves normalized weights.
    const minVariance=paths.reduce((min,path)=>Math.min(min,path.variance),Infinity);
    const precision=paths.map(path=>minVariance/path.variance),sum=precision.reduce((a,b)=>a+b,0);
    const influence=new Map(),regimens=new Set();
    let logEstimate=0;
    for(const [i,path] of paths.entries()) {
      const weight=precision[i]/sum;
      logEstimate+=weight*path.logEstimate;
      for(const [id,coefficients] of path.influence) {
        if(!influence.has(id))influence.set(id,coefficients.map(()=>0));
        const total=influence.get(id);
        coefficients.forEach((c,j)=>{total[j]+=weight*c;});
      }
      for(const edge of path.comparisons){regimens.add(edge.treatment);regimens.add(edge.comparator);}
    }
    // Apply the combined coefficient to each original trial covariance once.
    let variance=0;
    for(const block of blocks) {
      const weights=influence.get(block.trialId);
      if(weights)variance+=Model.influenceVariance(block,weights,tau2);
    }
    const se=Math.sqrt(variance),interval=Model.ratioInterval(logEstimate,se);
    if(!(se>0) || !interval)return {...base,reason:'The pathway estimate or its interval is outside the numerical range.'};
    return {...base,available:true,...interval,logEstimate,se,trialCount:influence.size,treatmentCount:regimens.size};
  }

  function fullTau(blocks,first,second,model,fullFit) {
    if(model==='common')return 0;
    const fit=fullFit || Model.fit(blocks,first,second,model);
    return fit.available?fit.tau2:null;
  }

  function fitRoute(route,blocks,model='common',tau2=fullTau(blocks,route.regimens[0],route.regimens.at(-1),model)) {
    const path=routeInfluence(route,blocks,tau2);
    return weightedFit([path],blocks,model,tau2);
  }

  const routeKey=ids=>JSON.stringify(ids[0]<ids.at(-1)?ids:[...ids].reverse());

  function fitSelection({pair,first,second,model='common',excluded,fullFit},graph) {
    if(!excluded?.size)return {pair,fit:fullFit || Model.fit(pair.blocks,first,second,model),excluded};
    const tau2=fullTau(pair.blocks,first,second,model,fullFit);
    const retained=new Set(),omitted=new Set(),allRoutes=routes(graph || routeGraph(pair),first,second);
    const allPaths=[],selectedPaths=[];
    let totalCount=0,selectedCount=0;
    for(const route of allRoutes) {
      totalCount++;
      const include=!excluded.has(routeKey(route.regimens));
      if(include)selectedCount++;
      const edges=include?retained:omitted;
      for(const leg of route.legs)for(const edge of leg.values())edges.add(edge);
      const path=routeInfluence(route,pair.blocks,tau2);
      allPaths.push(path);
      if(include)selectedPaths.push(path);
    }
    const comparisons=pair.comparisons.filter(edge=>retained.has(edge));
    const blocks=projectEvidence(comparisons,pair.blocks);
    const ids=new Set(comparisons.map(edge=>edge.trialId));
    const trials=pair.trials.filter(trial=>ids.has(trial.id));
    const links=new Set(comparisons.map(e=>key(e.treatment,e.comparator)));
    const selected={...pair,comparisons,blocks:blocks || [],trials,
      regimens:[...new Set(comparisons.flatMap(e=>[e.treatment,e.comparator]))].sort(),
      settings:[...new Set(trials.flatMap(t=>t.settings || []))].sort(),
      sharedComparators:(pair.sharedComparators || []).filter(id=>links.has(key(first,id)) && links.has(key(second,id))),holds:[]};
    const fit=weightedFit(selectedPaths,pair.blocks,model,tau2);
    const referenceFit=weightedFit(allPaths,pair.blocks,model,tau2);
    const referenceComparisons=pair.comparisons.filter(edge=>retained.has(edge) || omitted.has(edge));
    const allComparisonsRetained=omitted.size>0 && [...omitted].every(edge=>retained.has(edge));
    return {pair:selected,fit,referenceFit,referenceComparisons,excluded,selectedCount,totalCount,allComparisonsRetained};
  }

  function weightingNote(fit) {
    if(fit?.method!=='pathway-weighted')return '';
    const note='Pathway log estimates are weighted by inverse variance. Confidence intervals account for shared trials and correlations between arms.';
    return fit.model==='random' && Number.isFinite(fit.tau2)?
      note+' The between-trial variance (τ² = '+fmt(fit.tau2)+') is held at its full-network REML estimate.':note;
  }

  function selectionLabel(selection) {
    if(!selection?.excluded?.size || !Number.isInteger(selection.totalCount))return '';
    const {selectedCount,totalCount}=selection;
    const label=selectedCount+' of '+totalCount+' pathway'+(totalCount===1?'':'s')+' included';
    return selection.allComparisonsRetained?label+' · All contributing trial comparisons are still included.':label;
  }

  function mount(host,{pair,network,first,second,measure,model='common',publications,loadPublications,
    fullFit,excluded=new Set(),onSelectionChange,comparatorFirst=false}) {
    host.replaceChildren();
    const doc=host.ownerDocument;
    const label=id=>network.labels.get(id) || id;
    const graph=routeGraph(pair),iterator=routes(graph,first,second,label);
    let pending=iterator.next(),stopped=false,publicationLoad=null;
    const authorCells=[];
    function element(parent,tag,value,className) {
      const el=doc.createElement(tag);
      if(className)el.className=className;
      if(value!=null)el.textContent=String(value);
      parent.appendChild(el);
      return el;
    }
    function refreshAuthors() {
      for(const item of authorCells) {
        const name=publications?.get(String(item.pmid))?.first_author_surname;
        if(name)item.cell.textContent=name;
      }
    }
    function hydrate() {
      if(!loadPublications || publications || publicationLoad || !authorCells.length)return;
      publicationLoad=Promise.resolve().then(loadPublications).then(rows=>{
        if(stopped || host.isConnected===false)return;
        publications=rows;refreshAuthors();
      }).catch(()=>{publicationLoad=null;});
    }
    function studyLine(body,edge) {
      const row=edge.studyRow || {},tr=element(body,'tr');
      const study=element(tr,'td'),author=element(tr,'td'),year=element(tr,'td');
      let citations=row.sourcePublications;
      if(!citations?.length) {
        citations=!row.pmid && row.sourcePmids?.length ? row.sourcePmids.map(pmid=>({pmid})) : [row];
      }
      for(const citation of citations) {
        const pmid=String(citation.pmid || '');
        const publication=publications?.get(pmid);
        const title=citation.title || publication?.title || (pmid?'PMID '+pmid:'NA');
        const line=element(study,'div');
        if(/^\d+$/.test(pmid)) {
          const link=element(line,'a',title);
          link.href='https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/';link.target='_blank';link.rel='noopener noreferrer';
        } else line.textContent=title;
        const cell=element(author,'div',citation.author || publication?.first_author_surname || 'NA');
        if(!citation.author && pmid)authorCells.push({cell,pmid});
        element(year,'div',citation.year || publication?.year || 'NA');
      }
      for(const value of [row.trialName,Array.isArray(row.nct)?row.nct.join(', '):row.nct,row.group,label(edge.comparator),label(edge.treatment)])
        element(tr,'td',value || 'NA');
      element(tr,'td',row.sampleSize>0?'N='+row.sampleSize:'NA');
      const {estimate:point,ciLower:lo,ciUpper:hi}=row;
      const valid=x=>Number.isFinite(x)&&x>0;
      const interval=valid(lo)&&valid(hi)?'95% CI '+fmt(lo)+'–'+fmt(hi):'95% CI unavailable';
      const effect=element(tr,'td',valid(point)?(row.measure || measure)+' '+fmt(point)+' ('+interval+')':'NA');
      if(row.ciNote)element(effect,'small',row.ciNote);
    }
    function renderRoute(parent,route) {
      const result=fitRoute(route,pair.blocks,model,fullTau(pair.blocks,first,second,model,fullFit));
      if(result.available) {
        const modelName=model==='common'?'Common-effect':'Random-effects (REML)';
        element(parent,'p','Pathway-specific '+measure+' '+fmt(result.estimate)+' (95% CI '+fmt(result.ci_lower)+'–'+fmt(result.ci_upper)+') · '+modelName+' · '+result.trialCount+' trials','network-route-estimate');
      } else {
        element(parent,'p','Pathway-specific estimate unavailable. '+result.reason,'network-route-estimate');
      }
      const wrap=element(parent,'div',null,'network-route-scroll');
      wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Pathway studies');
      const table=element(wrap,'table',null,'network-route-table');
      const header=element(element(table,'thead'),'tr');
      for(const name of columns)element(header,'th',name).scope='col';
      for(const leg of (comparatorFirst ? route.legs.slice().reverse() : route.legs)) {
        const body=element(table,'tbody');
        const sorted=[...leg.values()].sort((a,b)=>(b.studyRow?.year || 0)-(a.studyRow?.year || 0) || String(a.trialId).localeCompare(String(b.trialId)));
        for(const edge of sorted)studyLine(body,edge);
      }
      hydrate();
    }
    const list=element(host,'div',null,'network-routes');
    function appendRoute(route,open) {
      const row=element(list,'div',null,'network-route-row');
      const id=routeKey(route.regimens);
      const displayOrder=comparatorFirst ? route.regimens.slice().reverse() : route.regimens;
      if(onSelectionChange) {
        const checkbox=element(row,'input',null,'network-route-include'); checkbox.type='checkbox';
        checkbox.setAttribute('aria-label','Include pathway '+displayOrder.map(label).join(' via '));
        checkbox.checked=!excluded.has(id);
        checkbox.addEventListener('change',()=>{
          if(stopped)return;
          excluded=new Set(excluded);
          if(checkbox.checked)excluded.delete(id);else excluded.add(id);
          onSelectionChange(fitSelection({pair,first,second,model,excluded,fullFit},graph));
        });
      }
      const item=element(row,'details',null,'network-route'),summary=element(item,'summary');
      for(const [i,id] of displayOrder.entries()) {
        if(i)element(summary,'span',' › ','network-route-separator');
        element(summary,'span',label(id),'network-route-regimen');
      }
      let rendered=false;
      function show() {
        if(!item.open || rendered || stopped)return;
        rendered=true;renderRoute(item,route);
      }
      item.addEventListener('toggle',show);
      item.open=open;show();
    }
    let shown=0,more;
    function nextPage() {
      for(let i=0;i<10 && !pending.done;i++) {
        appendRoute(pending.value,shown++===0);pending=iterator.next();
      }
      if(!pending.done && !more) {
        more=element(host,'button','Show more pathways','tm-text-button');more.type='button';
        more.addEventListener('click',nextPage);
      }
      if(more)more.hidden=pending.done;
    }
    if(pending.done)element(list,'p','No pathway has a distinct randomized trial available for every step.');
    else nextPage();
    return {destroy(){stopped=true;iterator.return();}};
  }
  return Object.freeze({routeGraph,routes,routeKey,fitRoute,fitSelection,selectionLabel,weightingNote,mount});
});
