'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Outcomes = require('../dist/trial_outcomes.js');

const row = (edits={}) => ({
  trialId:'t1', trialName:'Trial One', armId:'a', regimen:'Drug A', cohort:'', endpoint:'OS',
  value:24, ci:null, pmid:'123', date:'2024-01', year:2024, author:'Ng',
  filter_binding:{pmid:'123'}, classes:[{color:'ici',label:'Checkpoint inhibitor'}],
  source:{pmid:'123',stage:'R2',sha:'abc',section:'survival',id:'s1'}, ...edits
});
const href = source => '#study-result?'+new URLSearchParams(source);
const groups = (rows, endpoint='OS') => Outcomes.visibleGroups(rows,endpoint,{},{});
const html = (rows, endpoint='OS') => Outcomes.renderChart(groups(rows,endpoint),endpoint,href);
const count = (text,pattern) => [...text.matchAll(pattern)].length;
const visibleText = html => html.replace(/<[^>]*>/g,'').trim();
function elements(html, tag, className) {
  return [...html.matchAll(new RegExp('<'+tag+'\\b([^>]*)>(.*?)</'+tag+'>','gs'))]
    .filter(([,attrs])=>!className || (attrs.match(/class="([^"]*)"/)?.[1] || '').split(/\s+/).includes(className));
}
function links(html, className) {
  return elements(html,'a',className).map(([,attrs,inner])=>({
    url:attrs.match(/href="([^"]+)"/)?.[1].replaceAll('&amp;','&'), label:visibleText(inner)
  }));
}
function cells(html, className) {
  return elements(html,'td',className).map(([,attrs,inner])=>inner);
}

function axisTicks(page) {
  const axis = page.match(/<div class="to-ticks">(.*?)<\/div>/s)[1];
  return [...axis.matchAll(/<span[^>]*>([\d.,]+)<\/span>/g)].map(match=>Number(match[1].replaceAll(',','')));
}
const link = (phase, edits={}) => ({id:'pair',phase,phase2Name:'Trial One',phase3Name:'Trial Three',pending:false,...edits});

test('newest displayed publication dates order whole trials; follow-ups only replace the arm and endpoint they report', () => {
  const latest = row({pmid:'401',date:'2026-05-12',year:2026,value:36,source:{pmid:'401',id:'s4'}});
  const rows = [latest,row({armId:'b',regimen:'Drug B',cohort:'Stage III',date:'2023-07',value:18}),
    row({trialId:'t2',trialName:'Single-arm trial',date:'2025-01',regimen:'Drug C'}),
    row({date:'2022-01',notReached:true,value:null}),row({endpoint:'ORR',value:44,date:'2022-01'}),
    row({trialId:'t0',trialName:'Undated',date:null,year:null})];
  const result = groups(rows);
  assert.deepEqual(result.map(g=>g.name), ['Trial One','Single-arm trial','Undated']);
  assert.deepEqual([...result[0].arms.values()].map(a=>a.rates.get('').value),[36,18]);
  const page = html(rows);
  assert.equal(links(page,'to-trial-link').filter(l=>l.label==='Trial One').length,1);
  assert.equal(count(page,/<rect class="to-fill"/g),4);
  const treatmentCells=elements(page,'th','to-treatment').map(([,attrs,inner])=>visibleText(inner));
  assert.ok(treatmentCells.some(label=>label.includes('Drug B') && label.includes('Stage III')));
  assert.ok(page.indexOf('Drug B')<page.indexOf('Single-arm trial'));
  assert.match(page,/href="#study-result\?pmid=401&amp;id=s4"/);
  assert.doesNotMatch(page,/Median not reached/);
  assert.match(html(rows,'ORR'),/44%/);
});

test('publication links open PubMed while trial, arm and bar links open the exact result in Studies',()=>{
  const paper=row({author:'García-Ruiz',year:2026,pmid:'54321',
    source:{pmid:'54321',stage:'R3',sha:'result-source',section:'survival',id:'s9'}});
  const page=html([paper]);
  assert.equal(links(page,'to-trial-link')[0].url,href(paper.source));
  assert.equal(links(page,'to-arm-link')[0].url,href(paper.source));
  assert.deepEqual(links(cells(page,'to-graphics')[0]).map(link=>link.url),[href(paper.source)]);
  const publication=cells(page,'to-citations')[0], pubmed='https://pubmed.ncbi.nlm.nih.gov/54321/';
  assert.deepEqual(links(publication,'to-pub-author'),[{url:pubmed,label:'García-Ruiz'}]);
  const [pmid]=links(publication,'to-pmid');
  assert.equal(pmid.url,pubmed);
  assert.match(pmid.label,/54321/);
  assert.ok(publication.indexOf('García-Ruiz')<publication.indexOf('to-pmid'));
  assert.doesNotMatch(visibleText(publication),/2026/);
  assert.deepEqual(cells(page,'to-year').map(visibleText),['2026']);
  const headers=elements(page,'th').filter(([,attributes])=>attributes.includes('scope="col"')).map(([,attrs,h])=>visibleText(h));
  for (const label of ['Publication','Published year','Estimate']) assert.ok(headers.some(h=>h.includes(label)));
});

test('all five medians keep their neutral unreached label and partial interval in the Estimate cell',()=>{
  for(const endpoint of ['DOR','RFS','DMFS','PFS','OS']){
    const nr=row({endpoint,notReached:true,value:null,ci:{low:18.4,high:null,highNotReached:true,method:'reported'}});
    for(const selected of [[nr],[nr,row({endpoint,armId:'b',regimen:'Drug B'})]]){
      const page=html(selected,endpoint), estimate=cells(page,'to-values')[0];
      assert.equal(cells(page,'to-status').length,0);
      assert.doesNotMatch(page,/<th[^>]*>Median (?:status|results)/i);
      assert.match(visibleText(estimate),/Median not reached/i);
      assert.match(visibleText(estimate),/95% CI 18\.4 months to not reached/);
      assert.doesNotMatch(estimate,/data-treatment-class/);
      assert.equal(links(page,'to-arm-link')[0].url,href(nr.source));
      assert.equal(count(page,/<rect class="to-fill"/g),selected.length-1);
    }
    const allNR=html([row({endpoint,value:null,notReached:true})],endpoint);
    assert.match(visibleText(cells(allNR,'to-values')[0]),/Median not reached/i);
    assert.match(allNR,/class="to-first">0<\/span>/);
  }
});

test('two-shade safety bars end at the overall rate with matched, offset CIs and a distinct result link per segment',()=>{
  const related=row({endpoint:'AE',pmid:'432',value:20,attribution:'related',safetyContext:'matched',ci:{low:12,high:29,method:'reported'},source:{pmid:'432',id:'related'}});
  const overall=row({endpoint:'AE',pmid:'432',value:35,attribution:'overall',safetyContext:'matched',ci:{low:25,high:46,method:'wilson'},source:{pmid:'432',id:'overall'}});
  const page=html([overall,related],'AE');
  assert.equal(count(page,/<svg class="to-plot"/g),1);
  assert.match(page,/class="to-shade-ink"><rect class="to-fill" x="0%" y="13" width="20%"[^>]+\/><g class="to-whisker"><line x1="12%" x2="29%" y1="7"/);
  assert.match(page,/class="to-shade-light"><rect class="to-fill" x="20%" y="13" width="15%"[^>]+\/><g class="to-whisker"><line x1="25%" x2="46%" y1="31"/);
  assert.match(page,/20%<\/b> treatment-related/);
  assert.match(page,/35%<\/b> overall/);
  assert.match(page,/Calculated 95% CI \(Wilson\)/);
  assert.match(page,/Reported 95% CI/);
  const publications=cells(page,'to-citations')[0];
  assert.equal(links(publications,'to-pub-author').length,1);
  assert.equal(links(publications,'to-pmid').length,1);
  assert.deepEqual(links(cells(page,'to-graphics')[0]).map(link=>link.url),[href(related.source),href(overall.source)]);
  const later={...overall,author:'Cheng',pmid:'678',year:2025,date:'2025-06',
    source:{pmid:'678',id:'overall-update'},safetyContext:'another period'};
  const twoReports=html([related,later],'AE'), citations=cells(twoReports,'to-citations')[0];
  const authors=links(citations,'to-pub-author'), ids=links(citations,'to-pmid');
  assert.deepEqual(new Set(authors.map(link=>link.label)),new Set(['Ng','Cheng']));
  for(const url of ['https://pubmed.ncbi.nlm.nih.gov/432/','https://pubmed.ncbi.nlm.nih.gov/678/']){
    assert.ok(authors.some(link=>link.url===url));
    assert.ok(ids.some(link=>link.url===url));
  }
  for(const y of [2024,2025])assert.ok(visibleText(cells(twoReports,'to-year')[0]).includes(String(y)));
  assert.deepEqual(new Set(links(cells(twoReports,'to-graphics')[0]).map(link=>link.url)),
    new Set([href(related.source),href(later.source)]));
  for(const [r,label] of [[related,'Treatment-related only reported'],[overall,'Overall only reported']]){
    const single=html([r],'AE');
    assert.match(single,new RegExp(label));
    assert.match(single,new RegExp('x="0%" y="13" width="'+r.value+'%"'));
  }
  for(const incompatible of [{safetyContext:''},{safetyContext:'another period'},{value:15}]){
    const separate=html([related,{...overall,...incompatible}],'AE');
    assert.equal(count(separate,/<svg class="to-plot"/g),2);
    assert.match(separate,/Separate safety estimates/);
  }
});

test('a reported non-estimable confidence bound remains distinct from an unreached median and a missing bound',()=>{
  const example=row({value:16.58,ci:{low:5.16,high:null,highNotEstimable:true,method:'reported'}});
  const page=html([example]);
  assert.match(page,/Reported 95% CI 5\.16 months to not estimable/);
  assert.match(page,/<small>95% CI 5\.16 months to not estimable<\/small>/);
  assert.doesNotMatch(page,/Median not reached/);
  assert.match(html([{...example,ci:{low:null,lowNotEstimable:true,high:20}}]),/95% CI not estimable to 20 months/);
  assert.match(html([{...example,ci:{low:5.16,high:null}}]),/95% CI 5\.16 months to unavailable/);
});

test('an observed zero response still has a visible label and both regimen classes',()=>{
  const page=html([row({endpoint:'CR',value:0,regimen:'Pembrolizumab + Carboplatin',classes:[{color:'ici',label:'Checkpoint inhibitor'},{color:'chemotherapy',label:'Chemotherapy'}]})],'CR');
  assert.match(page,/<b>0%<\/b>/);
  assert.match(page,/class="to-zero" x1="0%" x2="0%"/);
  assert.deepEqual(axisTicks(page),[0]);
  const regimen=elements(page,'a','to-arm-link')[0][2];
  assert.equal(visibleText(regimen),'Pembrolizumab + Carboplatin');
  assert.match(regimen,/data-treatment-class="ici">Pembrolizumab/);
  assert.match(regimen,/data-treatment-class="chemotherapy">Carboplatin/);
  for(const c of ['ici','chemotherapy']){
    assert.match(page,new RegExp('<li data-treatment-class="'+c+'"'));
    assert.match(page,new RegExp('<g data-treatment-class="'+c+'"'));
  }
});

test('each median scale uses the highest finite upper CI among displayed reached results',()=>{
  for (const endpoint of ['OS','PFS','DOR','RFS','DMFS']) {
    const measured = row({endpoint,value:20,ci:{low:10,high:40,method:'reported'}});
    const earlier = {...measured,date:'2022',ci:{low:10,high:150,method:'reported'}};
    const unreached = row({endpoint,armId:'unreached',notReached:true,value:null,ci:{low:120,high:null,highNotReached:true,method:'reported'}});
    const offScale = row({endpoint,armId:'off-scale',value:85,ci:{low:70,high:null,highNotEstimable:true,method:'reported'}});
    const page = html([measured,earlier,unreached,offScale],endpoint);
    assert.equal(axisTicks(page).at(-1),40);
    assert.match(page,/width="50%"/);
    assert.match(page,/<b>85 months<\/b>/);
    assert.match(page,/class="to-overflow"/);
    const unreachedRow = elements(page,'tr','to-arm').find(([,attrs,inner])=>links(inner,'to-unreached').length)[2];
    assert.match(unreachedRow,/120 months to not reached/);
    assert.doesNotMatch(unreachedRow,/class="to-whisker"/);
    assert.equal(axisTicks(html([unreached,offScale],endpoint)).at(-1),85);
    assert.deepEqual(axisTicks(html([unreached],endpoint)),[0]);
  }
});

test('response axes follow reported or Wilson upper bounds and fall back to the observed rate',()=>{
  for (const endpoint of ['ORR','CR']) {
    const reported = row({endpoint,value:12,ci:{low:4,high:26,method:'reported'}});
    const wilson = row({endpoint,armId:'wilson',value:20,ci:{low:9.7,high:37.3,method:'wilson'}});
    const pointOnly = row({endpoint,armId:'unbounded',value:67});
    assert.equal(axisTicks(html([reported],endpoint)).at(-1),26);
    assert.equal(axisTicks(html([reported,wilson,pointOnly],endpoint)).at(-1),37.3);
    assert.equal(axisTicks(html([pointOnly],endpoint)).at(-1),67);
    const entirelyZero = row({endpoint,value:0,ci:{low:0,high:0,method:'reported'}});
    assert.deepEqual(axisTicks(html([entirelyZero,pointOnly],endpoint)),[0]);
  }
});

test('phase numbers, arm-scoped marks and pending-primary footnotes reflect only the visible evidence',()=>{
  const phase2=row({phaseLinks:[link(2)]}),otherArm=row({armId:'b',regimen:'Control'});
  const phase3=row({trialId:'t3',trialName:'Trial Three',phaseLinks:[link(3)]});
  const pending=row({trialId:'t4',trialName:'Awaiting Phase III',phaseLinks:[link(2,{id:'pending',pending:true})]});
  const page=html([phase2,otherArm,phase3,pending]);
  const hasMarker = (page,label,linkClass) => elements(page,'th').some(([,attrs,inner])=>
    links(inner,linkClass).some(link=>link.label.replace(/1$/,'')===label) && inner.includes('class="to-mark">1</sup>'));
  assert.ok(hasMarker(page,'Drug A','to-arm-link'));
  assert.ok(!hasMarker(page,'Control','to-arm-link'));
  assert.ok(hasMarker(page,'Trial Three','to-trial-link'));
  assert.match(page,/Phase II Trial One → Phase III Trial Three/);
  assert.ok(elements(page,'th').some(([,attrs,inner])=>visibleText(inner)==='Awaiting Phase III*'));
  assert.equal(count(page,/Linked Phase III primary results pending\./g),1);
  assert.doesNotMatch(html([phase2,phase3], 'OS'),/primary results pending/);
  assert.doesNotMatch(html([phase2,otherArm]),/to-mark|to-footnotes/);
  const singleVisibleArm=html([phase2,{...otherArm,endpoint:'PFS'},phase3]);
  assert.ok(hasMarker(singleVisibleArm,'Drug A','to-arm-link'));
  assert.ok(!hasMarker(singleVisibleArm,'Trial One','to-trial-link'));
});

test('initial endpoint is empty; switching endpoint, applying and clearing a filter and remounting keep the controls synchronized',()=>{
  const nodes=new Map(), rows=[row({endpoint:'ORR',value:20}),row({endpoint:'ORR',date:'2021-03',pmid:'210',filter_binding:{pmid:'210'},value:19})];
  const panel={html:'',get innerHTML(){return this.html;},set innerHTML(content){
    this.html=content;
    for(const id of ['heading','advanced','endpoint','chart']){
      const selector='[data-outcomes-'+id+']';
      nodes.set(selector,{value:'',innerHTML:'',addEventListener(name,fn){this[name]=fn;}});
    }
  },querySelector(selector){return nodes.get(selector);}};
  let onChange, getEvidence, destroyed=0;
  const attachAdvanced=(heading,body,evidence,change)=>{
    onChange=change; getEvidence=evidence;
    assert.ok(heading && body);
    return {refresh(){onChange({},{});},destroy(){destroyed++;}};
  };
  const mount=()=>Outcomes.mount(panel,{schema_version:1,rows},{attachAdvanced,resultHref:href});
  mount();
  assert.deepEqual([...panel.innerHTML.matchAll(/<option value="([^"]*)">/g)].map(m=>m[1]),['','ORR','DOR','CR','RFS','DMFS','PFS','OS','AE']);
  const endpoint=panel.querySelector('[data-outcomes-endpoint]'),chart=panel.querySelector('[data-outcomes-chart]');
  assert.equal(endpoint.value,''); assert.equal(chart.innerHTML,'');
  endpoint.value='ORR';endpoint.change();
  assert.match(chart.innerHTML,/20%/);
  assert.equal(getEvidence({},false,{}).summary.report_count,1);
  onChange({stage:'iv'},{});assert.match(chart.innerHTML,/No eligible arm-level results/);
  onChange({},{});assert.match(chart.innerHTML,/20%/);assert.equal(endpoint.value,'ORR');
  const controller=mount();
  assert.equal(destroyed,1);assert.equal(panel.querySelector('[data-outcomes-endpoint]').value,'ORR');
  controller.destroy();assert.equal(destroyed,2);
});

test('a qualifying overall arm replaces overlapping subgroups, while separately enrolled and filtered cohorts retain their labels',()=>{
  const parent = row({parentArmId:'regimen/advanced',armId:'overall',ci:{low:15,high:70,method:'reported'}});
  const binding={result_id:'sub-result',pmid:'123',source_input_sha256:'source',review_binding_sha256:'binding',population_id:'sub-pop'};
  const subset = row({parentArmId:'regimen/advanced',armId:'mutation',regimen:'Drug A',cohort:'BRAF-mutant',subgroup:true,filter_binding:binding,ci:{low:11,high:37,method:'reported'}});
  const independent = row({parentArmId:'regimen/adjuvant',armId:'adjuvant',regimen:'Drug A',cohort:'Adjuvant cohort'});
  const options={classifications:{schema_version:1,classification_version:'1',results:{'sub-result':{
    ...binding,fields:{braf:{status:'supported',categories:['mutated'],evidence_ids:['e']}}
  }},evidence_registry:{e:{source_id:'report:main',supporting_quote:'BRAF-mutant'}}}};
  const rows=[subset,parent,independent];
  assert.deepEqual([...groups(rows)[0].arms.keys()],['overall','adjuvant']);
  const filtered=Outcomes.visibleGroups(rows,'OS',{braf:'mutated'},options);
  assert.deepEqual([...filtered[0].arms.keys()],['mutation']);
  const filteredChart=Outcomes.renderChart(filtered,'OS',href);
  assert.match(filteredChart,/BRAF-mutant/);
  assert.equal(axisTicks(filteredChart).at(-1),37);
  assert.equal(axisTicks(html(rows)).at(-1),70);
  assert.match(html([subset]),/BRAF-mutant/);
});
