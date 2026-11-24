/* The map owns the camera and node positions. Both views use the same selection
   controller and the same complete-regimen network, including off-screen trials. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(() => require('./treatment_network_evidence.js'), () => require('./treatment_network_model.js'), require('./confidence_intervals.js'), () => require('./treatment_network_pathways.js'), () => require('./treatment_map_planning.js'));
  } else root.TreatmentNetworkUI = factory(() => root.TreatmentNetworkEvidence, () => root.TreatmentNetworkModel, root.ConfidenceIntervals, () => root.TreatmentNetworkPathways, () => root.TreatmentMapPlanning);
})(globalThis, function (evidence, solver, intervals, pathways, planning) {
  'use strict';

  const fmt = n => intervals.formatEffectNumber(n,'NA');
  const modelName = model => model === 'random' ? 'Random-effects network meta-analysis (REML)' : 'Common-effect network meta-analysis';
  const edgeKey = (a, b) => JSON.stringify([a,b].sort());

  function arrowGeometry(tree, first, second, scale, enlarged) {
    const a = tree.positions.get(first), b = tree.positions.get(second);
    if (!a || !b) return null;
    const center = p => ({ x:p.x + (tree.overview ? 0 : p.width / 2), y:p.y });
    const from = center(a), to = center(b);
    const gap = 4 / scale;
    if (first === second) {
      const width = tree.overview ? (enlarged.has(first) ? 13 : 7) : a.width/2;
      const height = tree.overview ? width : a.height/2;
      const y = from.y - height - gap, span = Math.max(36/scale, width * .75);
      return {path:`M${from.x-width},${y} C${from.x-width-span},${y-span} ${from.x+width+span},${y-span} ${from.x+width},${y}`,
        x:from.x, y:y-.75*span};
    }
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx,dy) || 1;
    const bend = Math.min(length * .33, Math.max(36 / scale, length * .18));
    const q = {x:(from.x+to.x)/2 - dy/length*bend, y:(from.y+to.y)/2 + dx/length*bend};
    function boundary(p, box, id) {
      const vx=q.x-p.x, vy=q.y-p.y, d=Math.hypot(vx,vy)||1;
      const ux=vx/d, uy=vy/d;
      const radius=tree.overview ? (enlarged.has(id)?13:7)
        : Math.min(Math.abs(ux) ? box.width/2/Math.abs(ux) : Infinity, Math.abs(uy) ? box.height/2/Math.abs(uy) : Infinity);
      return {x:p.x+ux*(radius+gap), y:p.y+uy*(radius+gap)};
    }
    const start=boundary(from,a,first), end=boundary(to,b,second);
    return {path:`M${start.x},${start.y} Q${q.x},${q.y} ${end.x},${end.y}`,
      x:(start.x+2*q.x+end.x)/4, y:(start.y+2*q.y+end.y)/4};
  }

  class IndirectComparison {
    constructor(view, toolbar, controls, result, defs, branchRoute) {
      this.branchRoute=branchRoute;
      this.view=view; this.controls=controls; this.panel=result;
      this.active=false; this.model=view.options.networkModel === 'random' ? 'random' : 'common';
      this.revision=0; this.fitRevision=0; this.originalLabels=new WeakMap(); this.statusCache=new Map();
      this.toggle=view.button(toolbar, 'Compare two treatments indirectly', () => this.setActive(!this.active), 'tm-button tm-network-toggle');
      this.toggle.setAttribute('aria-pressed','false'); this.toggle.setAttribute('aria-controls',view.id+'-network-controls');
      controls.id=view.id+'-network-controls'; result.setAttribute('aria-label','Indirect comparison result');
      this.marker=view.svgElement('marker',{id:view.id+'-indirect-arrow',viewBox:'0 0 10 10',refX:9,refY:5,
        markerWidth:10,markerHeight:10,markerUnits:'userSpaceOnUse',orient:'auto'},defs);
      view.svgElement('path',{d:'M1 1 L9 5 L1 9 Z',fill:'#363441'},this.marker);
      this.clearPair();
    }
    clearPair() {
      this.pathwayView?.destroy(); this.pathwayView=null;
      this.first=null; this.second=null; this.pair=null; this.fit=null; this.fitPending=false;
      this.fullFit=null; this.selectedPair=null; this.pathSelection=null; this.excluded=new Set();
      this.fitRevision++; this.statusCache.clear(); this.prompt=null; this.feedback='';
    }
    clearTarget() { this.target=null; }
    label(id) { return this.network?.labels.get(id) || this.view.nodeFor(id)?.label || id; }
    comparisonLabel() {
      return this.label(this.second.regimen)+' versus '+this.label(this.first.regimen);
    }
    regimens(id) { return this.network?.regimensForNode(id) || []; }
    status(id) {
      if (!this.statusCache.has(id)) this.statusCache.set(id,this.network.status(id,this.first?.regimen));
      return this.statusCache.get(id);
    }
    nodeStatus(id) {
      if (!this.network) return {eligible:false, reason:this.error || (this.view.advanced.pending ? 'Loading selected filters…' : 'Loading randomized comparisons…')};
      const regimens=this.regimens(id);
      if (!regimens.length) return {eligible:false, reason:`No usable randomized ${this.view.endpointDefinition().shortLabel} comparison involving this regimen.`};
      const statuses=regimens.map(regimen=>this.status(regimen));
      return statuses.find(status=>status.eligible) || statuses[0];
    }
    setActive(active) {
      this.active=active; this.view.root.classList.toggle('tm-indirect-active',active);
      this.toggle.setAttribute('aria-pressed',String(active)); this.controls.hidden=!active;
      if (active) { this.target=null; this.reload(); }
      else {
        this.revision++; this.clearPair(); this.network=null; this.panel.hidden=true;
        this.controls.replaceChildren(); this.panel.replaceChildren(); this.decorate(); this.drawArrow();
      }
      this.view.renderDetails(); this.view.renderComparison(); this.view.renderNodeStudies(); this.view.updateSelection();
    }
    async reload() {
      if (!this.active) return;
      const revision=++this.revision;
      this.clearPair(); this.network=null; this.error=this.view.advanced.error || ''; this.refresh();
      if (this.view.advanced.pending || this.error) return;
      try {
        const graph=await (this.view.options.loadNetworkGraph ? this.view.options.loadNetworkGraph() : this.view.model.graph);
        if (!this.active || revision!==this.revision) return;
        this.graph=graph;
        this.network=evidence().build(graph,{endpoint:this.view.selectedEndpoint,advanced:this.view.advanced,target:this.target});
        this.target=this.network.target;
      } catch (err) {
        if (revision!==this.revision || !this.active) return;
        this.error=err.message || 'The randomized comparison network could not be loaded.';
      }
      this.view.renderDetails(); this.refresh();
    }
    setModel(value) {
      const next=value==='random'?'random':'common';
      if (next===this.model) return;
      this.model=next;
      if (this.active) this.view.renderDetails();
      if (this.active && this.second) this.calculate();
      else if (this.active) this.refresh();
    }
    setBranch() {
      if (!this.active) return;
      this.prompt=null;
      if ([this.first,this.second].some(item=>item&&!this.view.tree.positions.has(item.node))) this.clearPair();
      this.refresh();
    }
    choose(node, regimen) {
      const status=regimen ? this.status(regimen) : this.nodeStatus(node);
      this.prompt=null;
      if (!status.eligible) {
        this.fitRevision++; this.second=null; this.pair=null; this.selectedPair=null; this.fit=null; this.fitPending=false;
        this.feedback=status; this.refresh(); this.view.live.textContent=status.reason; return;
      }
      const choices=this.regimens(node).filter(id=>this.status(id).eligible);
      if (!regimen && choices.length>1) {
        this.prompt=node; this.feedback='';
        if (this.second) { this.fitRevision++; this.second=null; this.pair=null; this.selectedPair=null; this.fit=null; this.fitPending=false; }
        this.refresh(); this.choiceBox?.querySelector?.('button:not(:disabled)')?.focus(); return;
      }
      const selected={node,regimen:regimen||choices[0]};
      this.feedback='';
      if (!this.first) {
        this.first=selected; this.statusCache.clear(); this.refresh();
        this.view.live.textContent=this.label(selected.regimen)+' selected first. Select the second treatment.';
        return;
      }
      this.excluded=new Set(); this.second=selected; this.calculate();
    }
    async calculate() {
      const revision=++this.fitRevision;
      this.fit=null; this.fullFit=null; this.selectedPair=null; this.pathSelection=null; this.pair=null; this.fitPending=true; this.refresh();
      try {
        // Let the loading state paint. An endpoint, filter, or selection change
        // invalidates this work before it can replace the current result.
        await new Promise(resolve=>this.view.win.setTimeout(resolve,0));
        if (!this.active || revision!==this.fitRevision) return;
        const {pair,fit}=await solver().fitPair({graph:this.graph,network:this.network,intervention:this.second.regimen,
          comparator:this.first.regimen,model:this.model,advanced:this.view.advanced,lookup:this.view.options.lookupNetworkFit});
        if (!this.active || revision!==this.fitRevision) return;
        this.pair=pair;
        this.fullFit=fit || {available:false,reason:pair.reason};
        const selected=pair.eligible && this.excluded.size ? pathways().fitSelection({pair,first:this.second.regimen,
          second:this.first.regimen,model:this.model,fullFit:this.fullFit,excluded:this.excluded}) : {pair,fit:this.fullFit};
        this.fit=selected.fit; this.selectedPair=selected.pair; this.pathSelection=selected;
      } catch (err) {
        if (!this.active || revision!==this.fitRevision) return;
        this.fit={available:false,reason:err.message || 'The network model could not be fitted.'};
      }
      if (!this.active || revision!==this.fitRevision) return;
      this.fitPending=false; this.refresh();
      this.view.live.textContent=this.fit.available ? this.resultLabel() : 'Indirect estimate unavailable. '+this.fit.reason;
    }
    resultLabel(fit=this.fit) {
      return `${this.view.endpointDefinition().measure} ${fmt(fit.estimate)} (95% CI ${fmt(fit.ci_lower)}–${fmt(fit.ci_upper)})`;
    }
    plan(fit,comparisons) {
      const v=this.view;
      if(fit.defaultPlan && planning().defaultIndirectSettings(v.planningSettings))return fit.defaultPlan;
      return planning().indirect({estimate:fit.estimate,measure:v.endpointDefinition().measure,first:this.second.regimen,
        second:this.first.regimen,comparisons,settings:v.planningSettings});
    }
    clear() { this.clearPair(); this.refresh(); this.view.live.textContent='Indirect comparison selection cleared.'; }
    refresh() { this.renderControls(); this.renderPanel(); this.decorate(); this.drawArrow(); }
    renderTargetChoice(parent) {
      const targets=this.network?.targets || [];
      if (targets.length>1) {
        const field=this.view.make('section','tm-endpoint-field',parent);
        const label=this.view.make('label','',field,'Outcome definition / time point');
        const select=this.view.make('select','',field); label.htmlFor=select.id=this.view.id+'-network-target';
        for (const target of targets) { const opt=this.view.make('option','',select,target.label); opt.value=target.id; }
        select.value=this.target;
        select.addEventListener('change',()=>{this.target=select.value; this.reload();});
      }
      this.view.make('p','tm-count-note',parent,'Randomized trials · '+modelName(this.model));
    }
    renderControls() {
      if (!this.active) return;
      const v=this.view, parent=this.controls; parent.replaceChildren(); this.choiceBox=null;
      v.make('p','tm-network-instruction',parent,'Select the first treatment, then the second treatment.');
      if (this.first) v.make('span','tm-network-selection',parent,'First treatment · '+this.label(this.first.regimen));
      if (this.first && this.second) {
        const reverse=v.make('button','tm-text-button',parent,'Reverse comparison');
        reverse.type='button';
        reverse.addEventListener('click',()=>{
          [this.first,this.second]=[this.second,this.first];
          this.statusCache.clear(); this.prompt=null; this.feedback='';
          this.calculate();
        });
      }
      if (this.first || this.prompt) {
        const clear=v.make('button','tm-text-button',parent,'Clear selection'); clear.type='button'; clear.addEventListener('click',()=>this.clear());
      }
      if (this.prompt) {
        const box=this.choiceBox=v.make('div','tm-regimen-choices',parent);
        box.setAttribute('role','group'); box.setAttribute('aria-label','Choose complete regimen');
        v.make('strong','',box,'Choose complete regimen');
        for (const id of this.regimens(this.prompt).filter(id=>this.status(id).eligible)) {
          const button=v.make('button','tm-button',box,this.label(id));
          button.type='button'; button.title=this.label(id);
          button.addEventListener('click',()=>this.choose(this.prompt,id));
        }
        const node=this.prompt, close=()=>{this.prompt=null; this.renderControls(); v.nodeElements.get(node)?.focus();};
        const cancel=v.make('button','tm-text-button',box,'Cancel'); cancel.type='button'; cancel.addEventListener('click',close);
        box.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
      }
      if (this.feedback) {
        const message=v.make('div','tm-network-feedback',parent,this.feedback.reason);
        if (this.feedback.sourcePmids?.length) {
          const sources=v.make('div','',message);
          for (const pmid of this.feedback.sourcePmids) this.studyLink(sources,pmid);
        }
      }
      else if (this.network && !this.second && ![...v.nodeElements.keys()].some(id=>this.nodeStatus(id).eligible)) {
        v.make('p','tm-network-feedback',parent,this.first ? 'No eligible second treatment in this view. Choose another branch or open All treatments.' : 'No eligible indirect pair in this view for the selected target.');
      }
    }
    renderPanel() {
      this.pathwayView?.destroy(); this.pathwayView=null; this.estimateBox=null; this.diagnosticBox=null;
      const v=this.view, p=this.panel; p.replaceChildren();
      p.hidden=!this.active || (!!this.network && !this.second);
      if (p.hidden) return;
      p.setAttribute('aria-busy',String(!this.error && (!this.network || this.fitPending)));
      if (this.error) {
        v.make('strong','',p,'Indirect estimate unavailable'); v.make('p','',p,this.error);
        const retry=v.advanced.error ? v.options.retryNetworkFilters : ()=>this.reload();
        if (retry) { const btn=v.make('button','tm-button',p,'Retry'); btn.type='button'; btn.addEventListener('click',retry); }
        return;
      }
      if (!this.network) { v.make('p','',p,v.advanced.pending ? 'Loading selected filters…' : 'Loading randomized comparisons…'); return; }
      const endpoint=v.endpointDefinition();
      v.make('h3','',p,`Indirect comparison · ${this.comparisonLabel()}`);
      const scope=v.advanced.active && v.advanced.label ? v.advanced.label : 'All clinical settings';
      const target=this.network.targetLabel;
      v.make('p','tm-network-target',p,[endpoint.label,target && target!=='Overall endpoint'?target:'',scope].filter(Boolean).join(' · '));
      if (this.fitPending) { v.make('p','',p,'Calculating indirect estimate…'); return; }
      if (!this.fit) return;
      this.estimateBox=v.make('div','tm-network-fit',p);
      if (this.pair?.eligible) v.make('p','tm-network-note',p,'No eligible direct effect estimate available in the current analysis scope.');
      this.networkMethodNote=v.make('p','tm-network-note',p,modelName(this.model)+'. The comparison assumes comparable distributions of treatment-effect modifiers across the randomized comparisons.'+
        (this.model==='random'?' The model estimates a shared between-trial variance.':' The model assumes one underlying effect for each treatment contrast.'));
      if (this.pair?.eligible && (this.fullFit?.available || this.excluded.size)) this.renderPathways(p);
      if (this.pair?.trials?.length) {
        const details=v.make('details','tm-network-diagnostics',p);
        v.make('summary','',details,'Network diagnostics');
        this.diagnosticBox=v.make('div','',details);
      }
      this.updateEstimate();
      if (this.pair?.observational?.length) this.renderObservational(p);
    }
    updateEstimate() {
      if(!this.active || !this.fit || !this.estimateBox)return;
      const box=this.estimateBox,v=this.view;
      const methodDetailsOpen=box.querySelector?.('.tm-network-weighting')?.open;
      box.replaceChildren();
      const weighted=this.fit.available && this.fit.method==='pathway-weighted';
      this.networkMethodNote.hidden=weighted || !this.fit.available;
      if(weighted)v.make('strong','tm-network-fit-label',box,'Pathway-weighted sensitivity estimate');
      if(this.fit.available) {
        v.make('strong','tm-network-estimate tm-network-estimate-value',box,this.resultLabel());
        const plan=this.plan(this.fit,this.selectedPair.comparisons);
        const size=v.make('span','tm-network-plan',box,planning().describeIndirectPlan(plan,v.planningSettings)); size.title=plan.detail;
      } else {
        v.make('strong','tm-network-estimate',box,'Indirect estimate unavailable'); v.make('p','',box,this.fit.reason);
      }
      const selection=this.pathSelection && pathways().selectionLabel(this.pathSelection);
      if(selection)v.make('p','tm-count-note tm-network-selection-note',box,selection);
      if(weighted) {
        const details=v.make('details','tm-network-weighting',box);
        v.make('summary','',details,'Pathway weighting'); details.open=!!methodDetailsOpen;
        v.make('p','tm-network-note',details,pathways().weightingNote(this.fit));
        const reference=this.pathSelection.referenceFit;
        if(reference?.available) {
          const plan=this.plan(reference,this.pathSelection.referenceComparisons||this.pair.comparisons);
          const benchmark=v.make('p','tm-network-note tm-network-benchmark',details,'All pathways, same weighting · '+this.resultLabel(reference)+' · '+planning().describeIndirectPlan(plan,v.planningSettings));
          benchmark.title=plan.detail;
        }
      }
      this.renderDiagnostics(); this.drawArrow();
    }
    renderPathways(parent) {
      const v=this.view, details=v.make('details','tm-network-pathways',parent);
      v.make('summary','',details,'Evidence pathways');
      const host=v.make('div','',details);
      const context={pair:this.pair,network:this.network,first:this.second.regimen,second:this.first.regimen,comparatorFirst:true,
        measure:v.endpointDefinition().measure,model:this.model,loadPublications:v.options.loadNetworkPublications,
        fullFit:this.fullFit,excluded:this.excluded,onSelectionChange:selection=>{
          if (!this.active || context.pair!==this.pair)return;
          this.pathSelection=selection;
          this.selectedPair=selection.pair; this.fit=selection.fit; this.excluded=selection.excluded;
          this.updateEstimate(); this.decorate();
          v.live.textContent=[pathways().selectionLabel(selection),this.fit.available?this.resultLabel():this.fit.reason].filter(Boolean).join('. ');
        }};
      let mounted=false;
      details.addEventListener('toggle',()=>{
        if (!details.open || mounted || !this.active || !details.parentNode || this.pair!==context.pair) return;
        mounted=true;
        this.pathwayView=pathways().mount(host,context);
      });
    }
    studyLink(parent, pmid) {
      const v=this.view;
      if (!/^\d+$/.test(String(pmid))) return;
      if (!v.options.openNetworkStudy) { v.sourceLink(parent,{pmid}); return; }
      const button=v.make('button','tm-text-button',parent,'PMID '+pmid); button.type='button';
      button.addEventListener('click',async()=>{
        try { await v.options.openNetworkStudy(pmid); }
        catch (err) {
          button.disabled=true;
          v.make('span','tm-network-note',parent,err.message||'Local study details unavailable.');
          v.sourceLink(parent,{pmid});
        }
      });
    }
    renderObservational(parent) {
      const v=this.view, details=v.make('details','tm-network-support tm-network-observational',parent);
      v.make('summary','',details,'Observational head-to-head evidence');
      v.make('p','tm-network-note',details,this.comparisonLabel()+'. The network estimate above uses randomized trials.');
      const ul=v.make('ul','tm-network-trials',details);
      for (const row of this.pair.observational) {
        const li=v.make('li','',ul);
        v.make('strong','',li,[row.label,row.year].filter(Boolean).join(' · '));
        const interval=Number.isFinite(row.ci_lower)&&Number.isFinite(row.ci_upper)
          ? '95% CI '+fmt(row.ci_lower)+'–'+fmt(row.ci_upper) : '95% CI unavailable';
        v.make('span','',li,row.measure+' '+fmt(row.estimate)+' ('+interval+')');
        this.studyLink(li,row.pmid);
      }
    }
    renderDiagnostics() {
      const details=this.diagnosticBox;
      if (!details || !this.selectedPair)return;
      details.replaceChildren();
      const v=this.view, pair=this.selectedPair, diagnostics=this.fit.diagnostics;
      details.parentNode.hidden=!pair.trials.length || this.fit.method==='pathway-weighted';
      if(details.parentNode.hidden)return;
      if (pair.settings?.length) v.make('p','',details,'Clinical settings · '+pair.settings.join(', '));
      if (diagnostics) for (const d of [diagnostics.heterogeneity, diagnostics.inconsistency].filter(Boolean)) {
        v.make('p','tm-network-note',details,d.label+' · '+(d.available ? `Q = ${fmt(d.Q)}, df = ${d.df}, p ${d.p<.001?'< 0.001':'= '+fmt(d.p)}` : d.reason||'Not estimable.'));
      }
      if (this.model==='random' && Number.isFinite(this.fit.tau2)) v.make('p','tm-network-note',details,'Between-trial variance (τ²) · '+fmt(this.fit.tau2));
      if (pair.holds?.length) v.make('p','tm-network-note',details,pair.holds.join(' '));
    }
    decorate() {
      const v=this.view, bridges=new Set(this.selectedPair?.sharedComparators||[]);
      for (const [id,el] of v.nodeElements) {
        const title=el.children[0];
        if (!this.originalLabels.has(el)) this.originalLabels.set(el,{aria:el.getAttribute('aria-label'),title:title.textContent});
        const orig=this.originalLabels.get(el), first=this.active && this.first?.node===id, second=this.active && this.second?.node===id;
        const status=this.active ? this.nodeStatus(id) : null;
        const bridge=this.active && this.regimens(id).some(regimen=>bridges.has(regimen));
        el.classList.toggle('tm-network-disabled',!!status&&!status.eligible);
        el.classList.toggle('tm-network-first',first); el.classList.toggle('tm-network-second',second); el.classList.toggle('tm-network-bridge',bridge);
        if (!this.active) {
          el.removeAttribute('aria-disabled'); el.setAttribute('aria-label',orig.aria); title.textContent=orig.title; continue;
        }
        el.classList.remove('tm-selected','tm-comparison-endpoint');
        el.setAttribute('aria-disabled',String(!status.eligible));
        el.setAttribute('aria-pressed',String(first||second));
        const label=this.view.nodeFor(id)?.label || id;
        const hint=[first?'First treatment · '+this.label(this.first.regimen):'',second?'Second treatment · '+this.label(this.second.regimen):'',
          bridge?'Shared treatment':'',status.eligible?'Select '+(this.first?'as second treatment':'as first treatment'):status.reason].filter(Boolean).join('. ');
        title.textContent=label+'. '+hint; el.setAttribute('aria-label',title.textContent);
      }
      const support=new Set((this.selectedPair?.comparisons||[]).map(e=>edgeKey(e.treatment,e.comparator)));
      for (const edge of v.tree?.comparisonEdges||[]) {
        const element=v.parallelLinks.get(edge.id); if (!element) continue;
        const a=this.regimens(edge.root_id), b=this.regimens(edge.opponent_id);
        element.classList.toggle('tm-network-support-edge',this.active&&a.some(x=>b.some(y=>support.has(edgeKey(x,y)))));
        element.setAttribute('tabindex',this.active?'-1':'0');
      }
    }
    drawArrow() {
      if (this.overlay) { this.overlay.parentNode?.removeChild(this.overlay); this.overlay=null; }
      if (!this.active || !this.first || !this.second || !this.fit?.available) return;
      const v=this.view, scale=v.camera.scale;
      const first=this.first.node, second=this.second.node;
      let g;
      if (!v.tree.overview && first!==second && this.branchRoute) {
        if (!v.tree.positions.has(first) || !v.tree.positions.has(second)) return;
        // The card route stays in map coordinates when zooming or panning.
        const cached=this.lastBranchRoute;
        if (cached?.tree===v.tree && cached.first===first && cached.second===second) g=cached.geometry;
        else {
          const route=this.branchRoute(v.tree,{root_id:second,opponent_id:first},first,'indirect');
          g={path:route.path,x:route.midpoint.x,y:route.midpoint.y};
          this.lastBranchRoute={tree:v.tree,first,second,geometry:g};
        }
      } else g=arrowGeometry(v.tree,first,second,scale,v.directParallelIds);
      if (!g) return;
      const overlay=this.overlay=v.svgElement('g',{class:'tm-network-overlay','pointer-events':'none',role:'img'},v.world);
      const title='Indirect comparison · '+this.comparisonLabel();
      overlay.setAttribute('aria-label',title);
      v.svgElement('title',{},overlay,title+(this.fit?.available?' · '+this.resultLabel():''));
      this.marker.setAttribute('markerWidth',9/scale); this.marker.setAttribute('markerHeight',9/scale);
      v.svgElement('path',{d:g.path,class:'tm-network-arrow','marker-end':`url(#${v.id}-indirect-arrow)`},overlay);
      const compact=v.endpointDefinition().measure+' '+fmt(this.fit.estimate);
      v.svgElement('text',{x:g.x,y:g.y+9/scale,'text-anchor':'middle',class:'tm-network-arrow-direction'},overlay,this.comparisonLabel());
      v.svgElement('text',{x:g.x,y:g.y-6/scale,'text-anchor':'middle',class:'tm-network-arrow-label'},overlay,compact);
    }
    destroy() { this.active=false; this.revision++; this.clearPair(); this.view.root.classList.remove('tm-indirect-active'); }
  }

  return {mount:(...args)=>new IndirectComparison(...args),arrowGeometry};
});
