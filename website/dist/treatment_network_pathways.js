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

  function fitRoute(route,blocks,model='common') {
    const byTrial=new Map(),basis=new Map(blocks.map(b=>[b.trialId,b]));
    if(basis.size!==blocks.length)return {available:false,reason:'A trial is assigned to more than one covariance block.'};
    route.legs.forEach((leg,i)=>{
      for(const trialId of leg.keys()) {
        if(!byTrial.has(trialId))byTrial.set(trialId,[]);
        byTrial.get(trialId).push([route.regimens[i],route.regimens[i+1]]);
      }
    });
    const projected=[];
    for(const [trialId,pairs] of byTrial) {
      const block=basis.get(trialId);
      const projection=Model.projectTrial(block,pairs);
      if(!projection)return {available:false,reason:'The trial covariance does not cover every contrast on this pathway.'};
      projected.push(projection);
    }
    return Model.fit(projected,route.regimens[0],route.regimens.at(-1),model,{pathway:true});
  }

  function mount(host,{pair,network,first,second,measure,model='common',publications,loadPublications}) {
    host.replaceChildren();
    const doc=host.ownerDocument;
    const label=id=>network.labels.get(id) || id;
    const iterator=routes(routeGraph(pair),first,second,label);
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
      const result=fitRoute(route,pair.blocks,model);
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
      for(const leg of route.legs) {
        const body=element(table,'tbody');
        const sorted=[...leg.values()].sort((a,b)=>(b.studyRow?.year || 0)-(a.studyRow?.year || 0) || String(a.trialId).localeCompare(String(b.trialId)));
        for(const edge of sorted)studyLine(body,edge);
      }
      hydrate();
    }
    const list=element(host,'div',null,'network-routes');
    function appendRoute(route,open) {
      const item=element(list,'details',null,'network-route'),summary=element(item,'summary');
      for(const [i,id] of route.regimens.entries()) {
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
    else {
      element(list,'p','Each pathway compares its first regimen with its last. Study effects compare the intervention with the comparator listed in that row. Pathways can share trials.','muted');
      nextPage();
    }
    return {destroy(){stopped=true;iterator.return();}};
  }
  return Object.freeze({routeGraph,routes,fitRoute,mount});
});
