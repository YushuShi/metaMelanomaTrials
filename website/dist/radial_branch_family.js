/* Agent paths are a presentation of the observed complete regimens in the active branch. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadialBranchFamily = factory();
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  // Keys are the registry's broad_category. The same glyphs are used in the map and legend.
  const classes = {
    ici: ['Immune checkpoint inhibitors', 'M-8-9 -2-2v10m10-17L2-2v10M-10-7l6 7m14-7L4 0'],
    targeted: ['Targeted therapy', 'M9 0a9 9 0 1 1-18 0 9 9 0 1 1 18 0Zm-4 0a5 5 0 1 1-10 0 5 5 0 1 1 10 0Zm-4 0a1 1 0 1 1-2 0 1 1 0 1 1 2 0Z'],
    chemotherapy: ['Cytotoxic chemotherapy', 'CTx'],
    cytokines: ['Cytokines', 'M-3-7a3 3 0 1 0 6 0 3 3 0 1 0-6 0ZM-9-2q0 7 7 7v4m11-11q0 7-7 7v4'],
    immunotherapy: ['Other immunotherapy', 'M0-10q4 3 8 3v6q0 6-8 11-8-5-8-11v-6q4 0 8-3Z'],
    'cell-therapies': ['Cell therapy', 'M9-2c1 5-3 11-9 11s-10-4-9-9 4-9 10-9c4 0 7 3 8 7ZM-1-2a3 3 0 1 1-6 0 3 3 0 1 1 6 0Z'],
    vaccines: ['Therapeutic vaccines', 'M-6 2l8-8 5 5-8 8Zm10-6 3-3m-2-2 4 4M-4 5l-5 5m10-9 2 2M-1 1l2 2'],
    'oncolytic-viruses': ['Oncolytic viruses', 'M6 0a6 6 0 1 1-12 0 6 6 0 1 1 12 0ZM0-10v4m0 12v4M-10 0h4m12 0h4M-7-7l3 3m8 8 3 3M7-7 4-4m-8 8-3 3M-2-1h.2M2 2h.2'],
    'microbiome-therapies': ['Microbiome therapy', 'M-6-1l5-5a5 5 0 0 1 7 7L1 6a5 5 0 0 1-7-7Zm1-1-3-1m7-4-1-3M5-5l3-2M6 1l4 1M1 6l1 4M-5 5l-3 2M-2 1h.2M2-2h.2'],
    endocrine: ['Endocrine therapy', 'ET'],
    radiotherapy: ['Radiotherapy', 'M-9-8 5 3m-14-3 14 4m-13 4L5 5m1-3a3 3 0 1 0 .1 0Z'],
    surgery: ['Surgery', 'M-8 7l8-8 3 3-8 8Zm9-9 8-8q1 5-5 10Z'],
    other: ['Other / unclassified', 'M0-9 9 0 0 9-9 0Z'],
  };
  const compare = (a,b) => a.localeCompare(b, 'en');
  function buildFamily(model, tree, branchId) {
    const base = model.byId.get(branchId);
    if (!base?.components.length) return null;
    const core = { depth: 0, children: [], regimenId: base.id, uses: new Set([base.id]) };
    const paths = new Map([[base.id, [core]]]), vertices = [];
    // The source tree already excludes alternative courses, external comparators and
    // unsupported combinations and prefers the closest observed subset as parent.
    const regimens = tree.nodes.filter(n => n.id !== base.id && n.type === 'combination' && base.components.every(id => n.components.includes(id)))
      .sort((a,b) => a.components.length - b.components.length || compare(a.label,b.label));
    for (const regimen of regimens) {
      const parentId = tree.parents.get(regimen.id);
      const parent = paths.has(parentId) ? model.byId.get(parentId) : base;
      const path = [...paths.get(parent.id)];
      const added = regimen.components.filter(id => !parent.components.includes(id))
        .sort((a,b) => compare(model.byAgent.get(a)?.label || a, model.byAgent.get(b)?.label || b));
      for (const agentId of added) {
        const prefix = path[path.length - 1];
        let vertex = prefix.children.find(child => child.agentId === agentId);
        if (!vertex) {
          vertex = {agentId, depth: prefix.depth + 1, parent: prefix, children: [], regimenId: null, uses: new Set()};
          prefix.children.push(vertex);
          vertices.push(vertex);
        }
        path.push(vertex);
      }
      path[path.length - 1].regimenId = regimen.id;
      for (const v of path) v.uses.add(regimen.id);
      paths.set(regimen.id, path);
    }
    return {base, core, vertices, paths, rings: Math.max(0, ...vertices.map(v => v.depth))};
  }

  function layout(family) {
    const {core, base, vertices, rings} = family;
    // Give each subtree a contiguous sector. Keep a wide first ring in large
    // families; additional rings need only enough room for the next agent.
    function weigh(vertex) {
      vertex.weight = vertex.children.length ? Math.sqrt(vertex.children.reduce((sum, v) => sum + weigh(v) ** 2, 0)) : 1;
      return vertex.weight;
    }
    weigh(core);
    const firstRadius = Math.max(136, core.children.length * 10.5, base.components.length * 32 + 56);
    const radius = depth => firstRadius + (depth - 1) * 98;
    function place(parent, start, span) {
      const sum = parent.children.reduce((s, child) => s + child.weight, 0);
      for (const child of parent.children) {
        const sector = span * child.weight / sum, angle = start + sector / 2;
        child.x = radius(child.depth) * Math.cos(angle);
        child.y = radius(child.depth) * Math.sin(angle);
        place(child, start, sector);
        start += sector;
      }
    }
    place(core, -Math.PI * .5, 2 * Math.PI);
    const centerIds = base.components;
    const spread = centerIds.length > 1 ? Math.max(38, centerIds.length * 14) : 0;
    const centers = centerIds.map((id,i) => {
      const angle = 2 * Math.PI * i / centerIds.length - Math.PI;
      return {agentId:id, depth:0, regimenId:base.id, uses:core.uses, x:spread * Math.cos(angle), y:spread * Math.sin(angle)};
    });
    const nodeRadius = v => v.depth === 0 && centers.length === 1 ? 39 : 21;
    const outer = rings ? radius(rings) : Math.max(84,spread + 30);
    return {centers, nodes:[...centers,...vertices], nodeRadius, outer, radius};
  }

  function icon(view, parent, cls, size) {
    const glyph = classes[cls][1];
    const group = view.svgElement('g', {class:'rb-family-icon', transform:'scale(' + size / 24 + ')', 'aria-hidden':'true'}, parent);
    if (glyph === 'CTx' || glyph === 'ET') {
      view.svgElement('text', {class:'rb-family-lettermark', x:0, y:4.5, 'text-anchor':'middle'}, group, glyph);
    } else {
      view.svgElement('path', {d:glyph, fill:'none', stroke:'currentColor','stroke-width':1.8,'stroke-linecap':'round','stroke-linejoin':'round'},group);
    }
  }

  function labelLines(text, width = 17) {
    const lines = [''];
    for (const word of text.split(' ')) {
      const i = lines.length - 1;
      if (lines[i] && lines[i].length + 1 + word.length > width) lines.push(word);
      else lines[i] += (lines[i] ? ' ' : '') + word;
    }
    return lines;
  }
  const rect = (x,y,w,h) => ({left:x-w/2, top:y-h/2, right:x+w/2, bottom:y+h/2});
  const overlap = (a,b) => Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)) * Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  function labelBoxes(nodes, model, nodeRadius, doc) {
    const context = doc.createElement?.('canvas').getContext?.('2d');
    if (context) context.font = '700 12px system-ui, sans-serif';
    const glyphs = nodes.map(v => rect(v.x,v.y,2*nodeRadius(v)+18,2*nodeRadius(v)+18));
    const boxes = new Map();
    for (const [index,v] of nodes.entries()) {
      const lines = labelLines(model.byAgent.get(v.agentId)?.label || v.agentId);
      const width = Math.ceil(Math.max(...lines.map(line => context ? context.measureText(line).width : line.length*7.7)));
      const height = 14 * lines.length, radius = nodeRadius(v) + 5;
      const dy = radius + height / 2, dx = radius + width / 2;
      let least = Infinity, best;
      // Slide the label along its own disc before trying a diagonal placement.
      // Every candidate keeps an edge or a corner touching the same clearance.
      const offsets = [[0,dy],[0,-dy],[dx,0],[-dx,0]];
      for (const fraction of [.25,.5]) {
        for (const horizontal of [-1,1]) {
          for (const vertical of [-1,1]) {
            offsets.push([horizontal*width*fraction,vertical*dy],[horizontal*dx,vertical*height*fraction]);
          }
        }
      }
      for (const horizontal of [-1,1]) {
        for (const vertical of [-1,1]) {
          offsets.push([horizontal*(width/2+radius*Math.SQRT1_2),vertical*(height/2+radius*Math.SQRT1_2)]);
        }
      }
      const occupied = glyphs.filter((_,i)=>i!==index).concat([...boxes.values()].map(label=>label.box));
      for (const [x,y] of offsets) {
        const box = rect(v.x+x,v.y+y,width+3,height+3), cost = occupied.reduce((sum,o) => sum + overlap(box,o),0);
        if (cost < least) { least = cost; best = {box,lines,x,y}; }
        if (!cost) break;
      }
      boxes.set(v,best);
    }
    return boxes;
  }

  function setupZoom(view, tools, scroll, svg, initialScale) {
    const maxScale = 4, step = 1.25;
    let scale = initialScale || 1;
    tools.setAttribute('role','group');
    tools.setAttribute('aria-label','Radial branch zoom');
    function button(action, label, symbol, handler) {
      const control = view.make('button','',tools,symbol);
      control.type = 'button';
      control.setAttribute('data-zoom-action',action);
      control.setAttribute('aria-label',label);
      control.title = label;
      control.addEventListener('click',handler);
      return control;
    }
    const smaller = button('out','Zoom out','−',()=>zoom(scale / step));
    const larger = button('in','Zoom in','+',()=>zoom(scale * step));
    const fit = button('fit','Fit the entire radial branch','Fit',()=>zoom(1));
    const value = view.make('output','rb-family-zoom-value',tools);
    value.setAttribute('aria-label','Zoom level');
    function display() {
      scroll.style.setProperty('--rb-zoom',scale);
      scroll.setAttribute('data-zoom',scale);
      smaller.disabled = scale <= 1;
      larger.disabled = scale >= maxScale;
      value.textContent = Math.round(scale * 100) + '%';
    }
    function zoom(next,x,y) {
      next = Math.max(1,Math.min(maxScale,next));
      if (next === scale) return;
      const before = svg.getBoundingClientRect();
      const viewport = scroll.getBoundingClientRect();
      const anchorX = x ?? viewport.left + scroll.clientWidth / 2;
      const anchorY = y ?? viewport.top + scroll.clientHeight / 2;
      scale = next;
      display();
      if (next === 1) {
        scroll.scrollLeft = scroll.scrollTop = 0;
      } else if (before.width && before.height) {
        const after = svg.getBoundingClientRect();
        scroll.scrollLeft += after.left + (anchorX-before.left) * after.width / before.width - (x ?? viewport.left + scroll.clientWidth / 2);
        scroll.scrollTop += after.top + (anchorY-before.top) * after.height / before.height - (y ?? viewport.top + scroll.clientHeight / 2);
      }
    }
    display();
    scroll.tabIndex = 0;
    scroll.setAttribute('role','region');
    scroll.setAttribute('aria-label','Radial branch diagram');
    scroll.setAttribute('aria-keyshortcuts','+ - 0');
    scroll.addEventListener('keydown',event=>{
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '+' || event.key === '=') zoom(scale * step);
      else if (event.key === '-') zoom(scale / step);
      else if (event.key === '0') zoom(1);
      else return;
      event.preventDefault();
    });
    scroll.addEventListener('wheel',event=>{
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1);
      zoom(scale * Math.exp(-delta * .01), event.clientX, event.clientY);
    },{passive:false});
    let lastDistance = 0;
    function pinch(event) {
      if (event.touches.length !== 2) {lastDistance = 0; return;}
      const [a,b] = event.touches;
      const distance = Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
      if (lastDistance && distance) {
        event.preventDefault();
        zoom(scale * distance / lastDistance,(a.clientX+b.clientX)/2,(a.clientY+b.clientY)/2);
      }
      lastDistance = distance;
    }
    scroll.addEventListener('touchstart',pinch,{passive:false});
    scroll.addEventListener('touchmove',pinch,{passive:false});
    scroll.addEventListener('touchend',pinch);
    scroll.addEventListener('touchcancel',()=>{lastDistance=0;});
    return [smaller,larger,fit];
  }

  function render(view, host, selectedId, onSelect, availableRegimens = null, legendHost = null) {
    const family = buildFamily(view.model,view.tree,view.branchId);
    const previous = host.querySelector?.('.rb-family-scroll');
    const scrollPosition = previous?.getAttribute('data-branch-id') === view.branchId
      ? {x:previous.scrollLeft,y:previous.scrollTop,scale:Number(previous.getAttribute('data-zoom'))} : null;
    const previousFocus = view.doc.activeElement;
    const focusId = host.contains?.(previousFocus) ? previousFocus.getAttribute?.('data-agent-id') : null;
    const focusRegimen = focusId && previousFocus.getAttribute('data-regimen-id');
    const focusZoom = host.contains?.(previousFocus) && previousFocus.getAttribute?.('data-zoom-action');
    host.replaceChildren();
    legendHost?.replaceChildren();
    if (!family) return;
    const diagram = layout(family), labels = labelBoxes(diagram.nodes,view.model,diagram.nodeRadius,view.doc);
    const chosen = new Set(family.paths.get(selectedId) || family.paths.get(family.base.id));
    const tools = view.make('div','rb-family-zoom',host);
    const scroll = view.make('div','rb-family-scroll',host);
    const labelBounds = [...labels.values()].map(label => label.box), pad = 12;
    for (const node of diagram.nodes) {
      const size = 2 * (diagram.nodeRadius(node) + 4);
      labelBounds.push(rect(node.x,node.y,size,size));
    }
    const left = Math.min(-diagram.outer,...labelBounds.map(b=>b.left))-pad;
    const top = Math.min(-diagram.outer,...labelBounds.map(b=>b.top))-pad;
    const right = Math.max(diagram.outer,...labelBounds.map(b=>b.right))+pad;
    const bottom = Math.max(diagram.outer,...labelBounds.map(b=>b.bottom))+pad;
    const width = Math.max(300,right-left), height = Math.max(232,bottom-top);
    const svg = view.svgElement('svg', {class:'rb-family-diagram',role:'group','aria-label':family.base.label+' treatment family',
      viewBox:[(right+left-width)/2,(bottom+top-height)/2,width,height].join(' ')},scroll);
    scroll.style.setProperty('--rb-aspect',width / height);
    const zoomControls = setupZoom(view,tools,scroll,svg,scrollPosition?.scale);
    for (let ring = 1; ring <= family.rings; ring++) {
      view.svgElement('circle',{class:'rb-family-ring',cx:0,cy:0,r:diagram.radius(ring),'aria-hidden':'true'},svg);
    }
    const filtered = view.advanced?.active ? view.advanced.nodeIds : null;
    const matches = (v, ids) => !ids || (v.regimenId ? ids.has(v.regimenId) : [...v.uses].some(id => ids.has(id)));
    const muted = v => !matches(v, filtered) || !matches(v, availableRegimens);
    const highlightSelection = (!filtered || filtered.has(selectedId)) && (!availableRegimens || availableRegimens.has(selectedId));
    const unavailableHint = view.indirect?.active && !view.indirect.network && !view.indirect.error
      ? 'Checking indirect comparisons' : 'No available indirect comparison';
    const nearestCenter = v => diagram.centers.reduce((a,b) => Math.hypot(v.x-a.x,v.y-a.y) <= Math.hypot(v.x-b.x,v.y-b.y) ? a : b);
    for (const v of family.vertices) {
      const p = v.parent === family.core ? nearestCenter(v) : v.parent;
      view.svgElement('line',{class:'rb-family-spoke',x1:p.x,y1:p.y,x2:v.x,y2:v.y,'data-selected':chosen.has(v),'data-muted':muted(v),'aria-hidden':'true'},svg);
    }
    const types = new Set(), buttons = [];
    let restore = null;
    for (const v of diagram.nodes) {
      const agent = view.model.byAgent.get(v.agentId), name = agent?.label || v.agentId;
      const cls = Object.hasOwn(classes,agent?.broad_category) ? agent.broad_category : 'other';
      const subgroup = agent?.radial_subgroup?.label;
      const regimen = view.model.byId.get(v.regimenId);
      const selected = v.depth === 0 || chosen.has(v);
      const description = regimen?.label || [...v.uses].map(id=>view.model.byId.get(id).label).join('; ');
      const disabled = !!regimen && !!availableRegimens && !availableRegimens.has(regimen.id);
      const hint = disabled ? description + ' · ' + unavailableHint : (regimen ? 'Select ' : 'Component of ') + description;
      const tip = [name,subgroup || classes[cls][0],hint].join(' · ');
      const attrs = {class:'rb-family-agent',transform:`translate(${v.x},${v.y})`,role:regimen?'button':'img',
        'data-agent-id':v.agentId,'data-depth':v.depth,'data-treatment-class':cls,'data-selected':selected,
        'data-highlight':selected && highlightSelection,'data-muted':muted(v),'aria-label':tip};
      if (regimen) Object.assign(attrs,{'data-regimen-id':regimen.id,tabindex:disabled ? -1 : 0,'aria-pressed':selected,'aria-disabled':disabled});
      const node = view.svgElement('g',attrs,svg);
      view.svgElement('title',{},node,tip);
      const r = diagram.nodeRadius(v);
      view.svgElement('circle',{class:'rb-family-halo',r:r+4},node);
      view.svgElement('circle',{class:'rb-family-disc',r},node);
      icon(view,node,cls,v.depth===0 && diagram.centers.length===1?34:24);
      const label = labels.get(v);
      const text = view.svgElement('text',{class:'rb-family-label','text-anchor':'middle'},node);
      label.lines.forEach((line,i)=>view.svgElement('tspan',{x:label.x,y:label.y+4+(i-(label.lines.length-1)/2)*14},text,line + (i < label.lines.length - 1 ? ' ' : '')));
      types.add(cls);
      if (!regimen || disabled) continue;
      if (focusId===v.agentId && focusRegimen===regimen.id) restore=node;
      buttons.push(node);
      node.addEventListener('click',()=>onSelect(regimen.id));
      node.addEventListener('keydown',event=>{
        if (event.key==='Enter'||event.key===' ') {event.preventDefault(); onSelect(regimen.id); return;}
        const ix = buttons.indexOf(node);
        const next = {ArrowRight:(ix+1)%buttons.length,ArrowDown:(ix+1)%buttons.length,ArrowLeft:(ix+buttons.length-1)%buttons.length,ArrowUp:(ix+buttons.length-1)%buttons.length,Home:0,End:buttons.length-1}[event.key];
        if (next!==undefined) {event.preventDefault(); buttons[next].focus();}
      });
    }
    const legend = legendHost || view.make('ul','rb-family-legend',host);
    legend.tabIndex = 0;
    legend.setAttribute('aria-label','Treatment classes in this branch');
    for (const cls of Object.keys(classes).filter(cls=>types.has(cls))) {
      const item = view.make('li','',legend);
      item.setAttribute('data-treatment-class',cls);
      const symbol = view.svgElement('svg',{viewBox:'-12 -12 24 24','aria-hidden':'true'},item);
      icon(view,symbol,cls,21);
      view.make('span','',item,classes[cls][0]);
    }
    scroll.setAttribute('data-branch-id',view.branchId);
    scroll.scrollLeft = scrollPosition?.x ?? 0;
    scroll.scrollTop = scrollPosition?.y ?? 0;
    (restore || zoomControls.find(button=>button.getAttribute('data-zoom-action')===focusZoom))?.focus({preventScroll:true});
  }
  return Object.freeze({render,buildFamily});
});
