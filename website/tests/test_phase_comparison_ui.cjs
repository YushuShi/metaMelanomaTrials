'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {matchingGroups, alignedRows, groupHTML, render} = require('../dist/phase_comparison.js');

const result = (key, label, value) => ({key,label,value,pmid:'11111111'});
const pfs = result('PFS|median','Median PFS','8 months (95% CI 6–11)');
const os = result('OS|median','Median OS','Median OS not reached');
const landmark = result('OS|survival_probability|24mo','2-year OS','61%');
const phase2 = {id:'ii',name:'Phase II cohort',primary_date:'2019-01-07',primary_pmid:'11111111',publications:[
  {pmid:'11111111',date:'2019-01-07',title:'Primary paper'},{pmid:'33333333',date:'2024-09',title:'Follow-up paper'}
],regimen:'Nivolumab',comparator:'Ipilimumab',outcomes:[pfs,os,landmark],match_ids:['iii','iii']};
const phase3 = {id:'iii',name:'Confirmatory trial',regimen:'Nivolumab',nct:'NCT00000001',status:'PFS published; OS analysis pending',
  outcomes:[{...pfs,value:'9 months (95% CI 7–12)',denominator:91}, {...os,value:'Awaiting OS results',status:'pending'}]};
const group = {id:'a', regimen:'Nivolumab', drugs:['Nivolumab'], setting:'Advanced',sort_date:phase2.primary_date, phase2:[phase2],phase3:[phase3]};
const b = {...group,id:'b',phase2:[{...phase2,id:'ii-b',name:'Second cohort',primary_date:'2020'}],regimen:'Nivolumab + Ipilimumab',drugs:['Nivolumab','Ipilimumab'],setting:'Adjuvant',sort_date:'2020'};
const c = {...group,id:'c',phase2:[{...phase2,id:'ii-c',name:'Undated cohort',primary_date:null}],regimen:'Ipilimumab',drugs:['Ipilimumab'],setting:'Advanced',sort_date:null};
const groups = [group,c,b];

test('independent drug and setting filters retain all options and preserve chronological order', () => {
  const ids = (drug,setting) => matchingGroups(groups,drug,setting).map(g=>g.id);
  assert.deepEqual(ids('',''),['b','a','c']);
  assert.deepEqual(ids('Nivolumab',''),['b','a']);
  assert.deepEqual(ids('','Advanced'),['a','c']);
  assert.deepEqual(ids('Nivolumab','Advanced'),['a']);
  assert.deepEqual(ids('Ipilimumab','Adjuvant'),['b']);
  assert.deepEqual(ids('Other drug','Advanced'),[]);
  assert.deepEqual(groups.map(g=>g.id),['a','c','b']);
});

test('reported and pending outcomes share native table rows with the exact endpoint and measure', () => {
  const rows = alignedRows(phase2.outcomes, phase3.outcomes);
  assert.equal(rows.length,3);
  assert.equal(rows.find(r=>r.key===landmark.key).right.length,0);
  const html = groupHTML(group);
  const tr = html.split('<tr data-phase-outcome=');
  assert.equal(tr.length,4);
  for (const row of tr.slice(1)) assert.equal(row.split('</tr>')[0].match(/<td>/g).length,2);
  const matched = tr.find(row=>row.startsWith('"OS|median"'));
  assert.match(matched,/Median OS not reached.*<\/td><td>.*Awaiting OS results/);
  assert.match(tr.find(row=>row.startsWith('"PFS|median"')), /8 months.*9 months.*Outcome N=91/);
  assert.match(tr.find(row=>row.startsWith('"OS|survival_probability|24mo"')), /61%.*Not reported/);
  assert.match(html,/https:\/\/clinicaltrials.gov\/study\/NCT00000001/);
  assert.equal(html.split('<strong class="phase-trial-name">Confirmatory trial</strong>').length-1,1);
  assert.match(html,/Regimen.*Nivolumab.*vs.*Ipilimumab/);
});

test('the broad group does not imply a match; multiple matched trials stay separate', () => {
  const second = {...phase3,id:'other',name:'Other phase III trial'};
  const without = {...phase2,id:'unlinked',name:'Second phase II cohort',match_ids:[],primary_date:'2023-02'};
  const html = groupHTML({...group,phase2:[{...phase2,match_ids:['iii','other']},without],phase3:[phase3,second]});
  const tables = html.split('<table ').slice(1);
  assert.equal(tables.length,3);
  assert.match(tables[0],/Second phase II cohort.*No corresponding phase III trial identified/);
  assert.doesNotMatch(tables[0],/Awaiting/);
  assert.match(tables[1],/Confirmatory trial/);
  assert.match(tables[2],/Other phase III trial/);
});

test('both phase columns name their selected regimen even when no comparator is available', () => {
  const selected = {...phase2, regimen:'Nivolumab 3 mg/kg', comparator:null,
    match_basis:{iii:{label:'Same regimen in first-line advanced melanoma',source_url:'https://example.org/pair'}}};
  const matched = {...phase3, regimen:null, comparator:null};
  const html = groupHTML({...group,phase2:[selected],phase3:[matched]});
  const cells = html.match(/<tr class="phase-trial">.*?<\/tr>/)[0].split('<td>').slice(1);
  assert.match(cells[0].replace(/<[^>]+>/g,''),/Regimen Nivolumab 3 mg\/kg/);
  assert.match(cells[1],/class="phase-regimen"><b>Regimen<\/b>.*Nivolumab/);
  assert.doesNotMatch(cells.join(''),/<b>vs<\/b>/);
  assert.match(cells[1],/Why linked.*Same regimen in first-line advanced melanoma.*href="https:\/\/example.org\/pair"/);
});

test('a registry estimate identifies its source and preserves the publication qualification', () => {
  const registryPfs = {...pfs,pmid:undefined,sourceUrl:'https://clinicaltrials.gov/study/NCT02599402?tab=results',
    note:'The journal article omitted PFS because assessment intervals varied.'};
  const html = groupHTML({...group,phase3:[{...phase3, outcomes:[registryPfs]}]});
  const row = html.split('data-phase-outcome="PFS|median"')[1].split('</tr>')[0];
  assert.match(row, /clinicaltrials.gov\/study\/NCT02599402\?tab=results.*Registry results/);
  assert.match(row, /journal article omitted PFS/);
  assert.match(html, /No matching estimate for this measure in the saved trial data/);
});

test('opening the tab displays every eligible group with all three controls set to All', () => {
  const element = () => ({value:'',addEventListener(t,fn){this[t]=fn;}});
  const drug = element(), setting = element(), status = element(), list = element(), search = element();
  const panel = {querySelector:s=>({'[data-phase-filter="drug"]':drug,'[data-phase-filter="setting"]':setting,'[data-phase-filter="status"]':status,'[data-phase-groups]':list,'[data-trial-search]':search})[s]};
  render(panel,{schema_version:1,groups});
  assert.equal((panel.innerHTML.match(/<option value="">All<\/option>/g)||[]).length,3);
  const shown = () => list.innerHTML.match(/<details class="phase-cohort"/g)?.length || 0;
  assert.equal(shown(),3);
  assert.doesNotMatch(panel.innerHTML,/regimen–setting groups|Newest first|Matches reflect/);
  assert.doesNotMatch(list.innerHTML,/Nivolumab|Ipilimumab|Adjuvant|Advanced/);
  drug.value='Nivolumab'; drug.change();
  assert.equal(shown(),2);
  setting.value='Adjuvant'; setting.change();
  assert.equal(shown(),1);
  assert.match(list.innerHTML,/Second cohort/);
  drug.value='Nonexistent'; drug.change();
  assert.match(list.innerHTML,/No trials match these filters/);
});

test('a deferred whole endpoint supplies availability next to each phase II measure; reported phase III results take precedence', () => {
  const waiting = {key:'OS|status',label:'OS',status:'pending',value:'Awaiting OS results',pmid:'11111111'};
  const compared = {...phase3,outcomes:[pfs,waiting]};
  const html = groupHTML({...group,phase3:[compared]});
  assert.doesNotMatch(html,/data-phase-outcome="OS\|status"/);
  for (const row of html.split('<tr data-phase-outcome=').filter(s=>s.startsWith('"OS|'))) {
    assert.match(row.split('</tr>')[0],/<td><div class="phase-result phase-pending">.*Awaiting OS results/);
  }
  const updated = groupHTML({...group,phase3:[{...compared,outcomes:[pfs,landmark]}]});
  assert.doesNotMatch(updated,/Awaiting OS results/);
  assert.match(updated.split('data-phase-outcome="OS|median"')[1].split('</tr>')[0],/Not reported/);
});

function outcomeCells(html, key) {
  const marker = '<tr data-phase-outcome="' + key.replace(/>/g,'&gt;') + '">';
  assert.ok(html.includes(marker), 'Missing outcome row ' + key);
  const row = html.split(marker)[1].split('</tr>')[0];
  return [...row.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map(match => match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

test('S1616 and ILLUMINATE-301 name both arms with the OS HR in the corresponding phase', () => {
  const {groups} = require('../dist/data/phase_comparison.json');
  const selected = groups.find(g => g.regimen === 'Ipilimumab' && g.phase2.some(t => t.name === 'SWOG S1616'));
  const trial = selected.phase2.find(t => t.name === 'SWOG S1616');
  const html = groupHTML({...selected,phase2:[trial]});
  const [outcome, ii, missingIII] = outcomeCells(html,'OS|HR|vs:ipilimumab+nivolumab->nivolumab');
  assert.match(outcome,/OS.*HR/);
  assert.doesNotMatch(outcome,/Ipilimumab|Nivolumab/i);
  assert.match(ii,/1\.205.*90% CI 0\.719–2/);
  assert.match(ii,/Ipilimumab versus Ipilimumab \+ Nivolumab followed by Nivolumab \(reference\)/i);
  assert.doesNotMatch(ii,/→/);
  assert.match(missingIII,/Not reported/);
  assert.doesNotMatch(missingIII,/Ipilimumab|Nivolumab/i);
  const [, missingII, iii] = outcomeCells(html,'OS|HR|vs:ipilimumab+reported:tilsotolimod');
  assert.match(missingII,/Not reported/);
  assert.match(iii,/1\.042.*95% CI 0\.84–1\.299/);
  assert.match(iii,/Ipilimumab versus Ipilimumab \+ Tilsotolimod \(reference\)/i);
});

test('aligned HR cells use the arm labels for their own phase and preserve the time qualifier', () => {
  const key = 'OS|HR|vs:nivolumab|after6mo';
  const shared = {key,label:'OS · HR vs Nivolumab · after 6 months',outcomeLabel:'OS · HR · after 6 months'};
  const left = {...shared,value:'0.75',comparison:{treatment:'Ipilimumab + Nivolumab',reference:'Nivolumab'}};
  const right = {...shared,value:'0.80',comparison:{treatment:'Ipilimumab + Nivolumab',reference:'Nivolumab + placebo'}};
  const html = groupHTML({...group,phase2:[{...phase2,outcomes:[left]}],phase3:[{...phase3,outcomes:[right]}]});
  const [outcome, ii, iii] = outcomeCells(html,key);
  assert.match(outcome,/OS.*HR.*after 6 months/);
  assert.match(ii,/0\.75.*Ipilimumab \+ Nivolumab versus Nivolumab/i);
  assert.doesNotMatch(ii,/placebo/i);
  assert.match(iii,/0\.80.*Ipilimumab \+ Nivolumab versus Nivolumab \+ placebo/i);
});
