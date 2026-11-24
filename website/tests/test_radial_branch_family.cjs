'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const zlib = require('node:zlib');
const file = require('node:path').join(__dirname,'../dist/data/treatment_map_default.json');
const source = JSON.parse(fs.existsSync(file) ? fs.readFileSync(file) : zlib.gunzipSync(fs.readFileSync(file+'.gz')));
const MapUI = require('../dist/treatment_map.js');
const Family = require('../dist/radial_branch_family.js');
const model = MapUI.prepare(source);
function tree(branchId) {
  const {nodes,parents} = source.default_views.layouts[branchId];
  return {nodes:nodes.map(id=>model.byId.get(id)),parents:new Map(parents)};
}

test('every saved branch regimen has exactly one visible agent per additional component and its own canonical terminal ID',()=>{
  for (const branchId of Object.keys(source.default_views.layouts).filter(id=>id!=='all')) {
    const branch = tree(branchId), family = Family.buildFamily(model,branch,branchId);
    assert.deepEqual(new Set(family.paths.keys()),new Set(branch.nodes.map(n=>n.id)),branchId);
    for (const node of branch.nodes) {
      const path = family.paths.get(node.id);
      assert.equal(path.at(-1).regimenId,node.id);
      assert.deepEqual([...family.base.components,...path.slice(1).map(v=>v.agentId)].sort(),[...node.components].sort(),node.label);
      assert.equal(path.length-1,node.components.length-family.base.components.length);
    }
  }
});

test('nivolumab triplet follows the observed ipilimumab doublet while the endocrine triplet has a nonselectable intermediate',()=>{
  const base='agent:nivolumab', branch=tree(base), family=Family.buildFamily(model,branch,base);
  const pathFor=name=>family.paths.get(branch.nodes.find(n=>n.label===name).id);
  const triplet=pathFor('Ipilimumab + Melphalan + Nivolumab');
  assert.deepEqual(triplet.slice(1).map(v=>v.agentId),['ipilimumab','melphalan']);
  assert.equal(model.byId.get(triplet[1].regimenId).label,'Ipilimumab + Nivolumab');
  assert.equal(model.byId.get(triplet[2].regimenId).label,'Ipilimumab + Melphalan + Nivolumab');
  assert.ok(!family.paths.has('agent:ipilimumab'));
  assert.equal(pathFor('Bicalutamide + Nivolumab + Triptorelin')[1].regimenId,null);
  const product=pathFor('IO102/IO103 + Nivolumab');
  assert.equal(product.length,2);
  assert.equal(model.byAgent.get(product[1].agentId).label,'IO102/IO103');
});

test('a non-nivolumab family with doublets alone gets one ring and a combination-root family retains its whole core',()=>{
  const root='agent:axitinib';
  assert.equal(Family.buildFamily(model,tree(root),root).rings,1);
  const pair=model.nodes.find(n=>n.label==='Ipilimumab + Nivolumab');
  const family=Family.buildFamily(model,tree(pair.id),pair.id);
  assert.deepEqual(new Set(family.base.components),new Set(['ipilimumab','nivolumab']));
  assert.equal(family.rings,1);
  assert.deepEqual(family.vertices.map(v=>v.agentId),['melphalan']);
});

function renderedFamily(options = {}) {
  const branchId='agent:nivolumab', branch=tree(branchId), doc={};
  const elements=[];
  function element(tag,parent,attrs={},text) {
    const node={tag,attrs,text,children:[],listeners:{},style:{setProperty(){}},clientWidth:400,clientHeight:320,
      querySelector(selector){return this.children.find(child=>'.'+child.attrs.class===selector);},
      getBoundingClientRect(){
        if(attrs.class!=='rb-family-diagram')return {left:10,top:20,width:400,height:320};
        const scale=+parent.attrs['data-zoom'];
        return {left:10-parent.scrollLeft,top:20-parent.scrollTop,width:400*scale,height:320*scale};
      },
      replaceChildren(){this.children=[];},setAttribute(key,value){this.attrs[key]=value;},
      getAttribute(key){return this.attrs[key];},addEventListener(key,listener){this.listeners[key]=listener;},focus(){doc.activeElement=this;}};
    elements.push(node);
    parent?.children.push(node);
    return node;
  }
  const view={doc,model,tree:branch,branchId,
    svgElement:(tag,attrs,parent,text)=>element(tag,parent,attrs,text),
    make:(tag,cl,parent,text)=>element(tag,parent,{class:cl},text)};
  const host=element('div');
  const show=id=>{elements.length=0; Family.render(view,host,id,show,options.availableRegimens);};
  const glyph=id=>elements.find(n=>n.attrs['data-agent-id']===id);
  const active=cl=>elements.filter(n=>n.attrs.class===cl&&n.attrs['data-selected']===true);
  show(branchId);
  return {branchId,elements,view,show,glyph,active};
}

test('activating a triplet agent selects the complete regimen and marks each glyph and spoke, including shared class icons',()=>{
  const {branchId,elements,view,show,glyph,active}=renderedFamily();
  const vaccine=glyph('io102_io103');
  assert.equal(vaccine.attrs['data-treatment-class'],'vaccines');
  assert.equal(glyph('bicalutamide').attrs.role,'img');
  assert.equal(glyph('bicalutamide').listeners.click,undefined);
  assert.ok(glyph('ipilimumab').attrs['aria-label'].includes('CTLA-4 inhibitors'));
  assert.ok(glyph('nivolumab').attrs['aria-label'].includes('PD-1 inhibitors'));
  assert.equal(glyph('ipilimumab').attrs['data-treatment-class'],glyph('nivolumab').attrs['data-treatment-class']);
  assert.equal(glyph('ipilimumab').attrs['data-treatment-class'],glyph('relatlimab').attrs['data-treatment-class']);
  glyph('melphalan').listeners.keydown({key:'Enter',preventDefault(){}});
  assert.deepEqual(active('rb-family-agent').map(n=>n.attrs['data-agent-id']).sort(),['ipilimumab','melphalan','nivolumab']);
  assert.equal(active('rb-family-spoke').length,2);
  assert.equal(model.byId.get(glyph('melphalan').attrs['data-regimen-id']).label,'Ipilimumab + Melphalan + Nivolumab');
  assert.equal(elements.filter(n=>n.attrs.class==='rb-family-ring').length,2);
  glyph('regorafenib').listeners.click();
  assert.deepEqual(active('rb-family-agent').map(n=>n.attrs['data-agent-id']).sort(),['nivolumab','regorafenib']);
  view.advanced={active:true,nodeIds:new Set([branchId])};
  show(branchId);
  assert.equal(glyph('nivolumab').attrs['data-muted'],false);
  assert.equal(glyph('regorafenib').attrs['data-muted'],true);
});

test('each node in the nivolumab family keeps its label beside its disc', () => {
  const {elements} = renderedFamily();
  const nodes = elements.filter(el => el.attrs.class === 'rb-family-agent');
  for (const node of nodes) {
    const disc = node.querySelector('.rb-family-disc');
    const lines = node.querySelector('.rb-family-label').children;
    const halfWidth = Math.ceil(Math.max(...lines.map(line => line.text.trimEnd().length * 7.7))) / 2;
    const dx = Math.max(0, Math.abs(lines[0].attrs.x) - halfWidth);
    const top = lines[0].attrs.y - 11;
    const bottom = lines.at(-1).attrs.y + 3;
    const dy = Math.max(0, top, -bottom);
    const gap = Math.hypot(dx, dy) - disc.attrs.r;
    assert.ok(gap >= 3 && gap <= 7, node.attrs['data-agent-id'] + ' label gap ' + gap);
  }
});

test('indirect availability applies to exact regimens while a selected combination highlights its entire path', () => {
  const triple = model.nodes.find(n => n.label === 'Bicalutamide + Nivolumab + Triptorelin');
  const options = {availableRegimens: new Set([triple.id])};
  const {show, glyph, elements} = renderedFamily(options);
  assert.equal(glyph('triptorelin').attrs['aria-disabled'], false);
  assert.equal(glyph('nivolumab').attrs['aria-disabled'], true);
  assert.equal(glyph('nivolumab').attrs['data-muted'], true);
  assert.equal(glyph('nivolumab').attrs['data-highlight'], false);
  assert.equal(glyph('ipilimumab').attrs.tabindex, -1);
  assert.equal(glyph('ipilimumab').listeners.keydown, undefined);
  assert.equal(glyph('ipilimumab').listeners.click, undefined);
  assert.equal(glyph('bicalutamide').attrs.role, 'img');
  assert.equal(glyph('bicalutamide').attrs['data-muted'], false);
  glyph('triptorelin').listeners.click();
  const highlighted = () => elements.filter(n => n.attrs['data-highlight']).map(n=>n.attrs['data-agent-id']).sort();
  assert.deepEqual(highlighted(), ['bicalutamide', 'nivolumab', 'triptorelin']);
  assert.equal(glyph('nivolumab').attrs['aria-disabled'], true);
  options.availableRegimens = new Set();
  show(triple.id);
  assert.deepEqual(highlighted(), []);
  assert.ok(elements.filter(n => n.attrs.class === 'rb-family-agent').every(n => n.attrs['data-muted']));
  options.availableRegimens = null;
  show(triple.id);
  assert.equal(glyph('ipilimumab').attrs['aria-disabled'], false);
  assert.equal(typeof glyph('ipilimumab').listeners.click, 'function');
  assert.deepEqual(highlighted(), ['bicalutamide', 'nivolumab', 'triptorelin']);
});

test('radial family zoom anchors the center or pointer, preserves a regimen selection and fits a newly explored branch',()=>{
  const {elements,view,show,glyph}=renderedFamily();
  const viewport=()=>elements.find(el=>el.attrs.class==='rb-family-scroll');
  const control=action=>elements.find(el=>el.attrs['data-zoom-action']===action);
  assert.equal(control('out').disabled,true);
  control('in').listeners.click();
  assert.deepEqual([viewport().attrs['data-zoom'],viewport().scrollLeft,viewport().scrollTop],[1.25,50,40]);
  viewport().scrollLeft=73;
  viewport().scrollTop=22;
  glyph('melphalan').listeners.click();
  assert.deepEqual([viewport().attrs['data-zoom'],viewport().scrollLeft,viewport().scrollTop],[1.25,73,22]);
  control('fit').listeners.click();
  assert.deepEqual([viewport().attrs['data-zoom'],viewport().scrollLeft,viewport().scrollTop],[1,0,0]);
  const wheel={ctrlKey:true,deltaY:-Math.log(2)*100,clientX:110,clientY:80,preventDefault(){}};
  viewport().listeners.wheel(wheel);
  assert.deepEqual([viewport().attrs['data-zoom'],viewport().scrollLeft,viewport().scrollTop],[2,100,60]);
  for(let i=0;i<8;i++)viewport().listeners.keydown({key:'+',preventDefault(){}});
  assert.equal(control('in').disabled,true);
  assert.equal(viewport().attrs['data-zoom'],4);
  viewport().listeners.keydown({key:'0',preventDefault(){}});
  assert.equal(viewport().attrs['data-zoom'],1);
  const touch=distance=>({touches:[{clientX:80,clientY:90},{clientX:80+distance,clientY:90}],preventDefault(){}});
  viewport().listeners.touchstart(touch(50));
  viewport().listeners.touchmove(touch(80));
  assert.equal(viewport().attrs['data-zoom'],1.6);
  view.branchId='agent:ipilimumab';
  view.tree=tree(view.branchId);
  show(view.branchId);
  assert.deepEqual([viewport().attrs['data-zoom'],viewport().scrollLeft,viewport().scrollTop],[1,0,0]);
});
