'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {populationsForPhase,eligiblePhase2,bundle,samePopulation,chronologicallyLater}=require('../scripts/phase_comparison.cjs');
const file=path.join(__dirname,'../dist/data/phase_comparison.json');
const data=JSON.parse(fs.existsSync(file)?fs.readFileSync(file):zlib.gunzipSync(fs.readFileSync(file+'.gz')));
const collect=(pmid)=>data.groups.flatMap(g=>g.phase2.filter(t=>t.primary_pmid===pmid).map(t=>({g,t})));

test('separate phases require population scope, with combined or recommended-dose cohorts withheld',()=>{
  const record={populations:['phases 1 and 2','recommended phase II dose','Phase 1b','Phase II expansion cohort','Phase II at RP2D'].map((label,i)=>({id:'p'+i,label,melanoma_only:'yes'}))};
  const scope=populationsForPhase(record,{label:'drug at recommended phase II dose'},2,{phases:[1,2]},{phases:[1,2]});
  assert.deepEqual([...scope],['p3']);
  assert.equal(populationsForPhase({populations:record.populations.slice(0,3)},{label:'at recommended phase II dose',population_id:'p1'},2,{phases:[1,2]},{}).size,0);
});
test('clinical phase, reporting role, and registry completion have distinct eligibility rules',()=>{
  const primary={role:'primary',primary_readout:true};
  assert.equal(eligiblePhase2(primary,{status:'COMPLETED'},false),true);
  assert.equal(eligiblePhase2({role:'interim'},{status:'COMPLETED'},true),false);
  assert.equal(eligiblePhase2(primary,{status:'ACTIVE_NOT_RECRUITING',primary_completion:{type:'ACTUAL'}},false),true);
  assert.equal(eligiblePhase2(primary,{status:'RECRUITING',primary_completion:{type:'ESTIMATED'}},false),false);
});
test('follow-up updates outcome values without changing first primary results publication or creating a trial',()=>{
  const row={identity:{id:'X',name:'Example'},regimen:{label:'A',drugs:['A']},phase2Eligible:true,role:'primary',phase:2,comparators:[],profile:{setting:'Advanced'},pub:{pmid:'1',date:'2011-05-02'},stage:'R2',outcomes:[{key:'OS|median',value:'10',pmid:'1'}]};
  const updated={...row,role:'secondary',phase2Eligible:false,pub:{pmid:'2',date:'2015-06-12'},outcomes:[{key:'OS|median',value:'12',pmid:'2'}]};
  const result=bundle([updated,row],2);
  assert.equal(result.primary_date,'2011-05-02');assert.equal(result.outcomes[0].value,'12');assert.equal(result.publications.length,2);
  assert.equal(bundle([updated],2),null);
});

test('a phase III interim report and a late follow-up cannot substitute for its first primary results',()=>{
  const trial={identity:{id:'III',name:'Phase III trial'},regimen:{label:'A',drugs:['A']},
    profile:{setting:'Advanced'},phase:3,comparators:[],stage:'R2'};
  const report=(pmid,date,role,value)=>({...trial,pub:{pmid,date},role,
    outcomes:[{key:'OS|median',value,pmid}]});
  const interim=report('10','2009-01-05','interim','5');
  const primary=report('20','2012-01-05','primary','6');
  const followup=report('30','2020-01-05','secondary','7');
  const phase3=bundle([followup,interim,primary],3);
  assert.equal(phase3.primary_pmid,'20');
  assert.equal(phase3.primary_date,'2012-01-05');
  assert.equal(phase3.outcomes[0].pmid,'30');
  assert.equal(chronologicallyLater({primary_date:'2011'},phase3,{}),true);
  assert.equal(chronologicallyLater({primary_date:'2013'},phase3,{}),false);
});

test('phase III results must be demonstrably later at the reported date precision',()=>{
  const two={primary_date:'2010-03',nct:'NCT00000001'};
  const three=date=>({primary_date:date,nct:'NCT00000002',publications:[{date:'2020-01-10'}]});
  assert.equal(chronologicallyLater(two,three('2004-03-15'),{}),false);
  assert.equal(chronologicallyLater(two,three('2010-03-25'),{}),false);
  assert.equal(chronologicallyLater(two,three('2010-04'),{}),true);
  assert.equal(chronologicallyLater(two,three(null),{}),false);
});

test('a pending phase III can begin after the phase II trial and before its first results paper',()=>{
  const two={nct:'NCT00000001',primary_date:'2025-07-08'};
  const three={nct:'NCT00000002',primary_date:null};
  const registry={
    [two.nct]:{start:{date:'2017-09-20',type:'ACTUAL'}},
    [three.nct]:{start:{date:'2024-07-11',type:'ACTUAL'}}
  };
  assert.equal(chronologicallyLater(two,three,registry),true);
  registry[three.nct].start.type='ESTIMATED';
  assert.equal(chronologicallyLater(two,three,registry),false);
});

test('published trials are ordered by their first primary results even when study starts are reversed',()=>{
  const two={nct:'NCT00000001',primary_date:'2011-11-28'};
  const three={nct:'NCT00000002',primary_date:'2012-12-17'};
  const registry={
    [two.nct]:{status:'COMPLETED',start:{date:'2007-02'}},
    [three.nct]:{status:'COMPLETED',start:{date:'2005-06'}}
  };
  assert.equal(chronologicallyLater(two,three,registry),true);
  assert.equal(chronologicallyLater(three,two,registry),false);
  assert.equal(chronologicallyLater(three,{...two,primary_date:null,primary_pmid:'1'},registry),false);
});
test('same drug with different treatment lines or unresolved populations cannot create an automatic link',()=>{
  const p={setting:'Advanced',line:'first-line',subtype:'cutaneous',braf:'',features:[],label:'Metastatic cutaneous melanoma'};
  assert.equal(samePopulation(p,{...p}),true);
  assert.equal(samePopulation(p,{...p,line:'post-PD-1 progression'}),false);
  assert.equal(samePopulation(p,{...p,features:['brain']}),false);
  assert.equal(samePopulation({...p,line:''},{...p,line:''}),false);
});
test('released projection separates cohorts, links checked trials, and orders groups by original phase II publication',()=>{
  for(const group of data.groups){
    assert.ok(group.phase2.length);
    assert.equal(group.sort_date,group.phase2[0].primary_date||null);
    assert.deepEqual(group.phase2.map(t=>t.primary_date||''),group.phase2.map(t=>t.primary_date||'').sort().reverse());
    assert.equal(new Set(group.phase2.map(t=>t.id)).size,group.phase2.length);
    const available=new Set(group.phase3.map(t=>t.id));
    for(const t of group.phase2)assert.ok(t.match_ids.every(id=>available.has(id)));
  }
  assert.deepEqual(data.groups.map(g=>g.sort_date||''),data.groups.map(g=>g.sort_date||'').sort().reverse());
  const s1512=['40813711','41611998'].flatMap(collect);
  assert.equal(s1512.length,2);
  assert.deepEqual(new Set(s1512.map(x=>x.g.setting)),new Set(['Neoadjuvant','Advanced']));
  assert.equal(new Set(s1512.map(x=>x.t.id)).size,2);
  const relapse=collect('36780608');assert.equal(relapse.length,2);assert.ok(relapse.every(x=>x.t.match_ids.length===0));
  const matched=collect('25891304').filter(x=>x.g.drugs.length===2);
  assert.equal(matched.length,1);assert.ok(matched[0].t.match_ids.includes('NCT02714218'));
  const unnamed=collect('10764421');assert.equal(unnamed.length,1);assert.ok(unnamed[0].t.match_ids.length);assert.equal(unnamed[0].t.nct,null);
  assert.ok(unnamed[0].g.phase3.every(t=>t.outcomes.every(o=>!['a_gm_all','a_control_all'].includes(o.armId)&&!['e_os','e_rfs'].includes(o.sourceResultId))));
});
test('source-labeled investigational agents, phase-specific outcomes, and published phase II results without subsequent trials are retained',()=>{
  assert.ok(collect('40577656').some(x=>x.g.regimen.includes('BO-112')&&x.g.drugs.includes('Pembrolizumab')));
  assert.ok(collect('41606121').some(x=>x.g.drugs.includes('Nivolumab')));
  assert.ok(collect('42012456').some(x=>x.g.drugs.includes('Ceralasertib')));
  assert.equal(collect('42013310').length,0);
  const phase2=collect('41701511');
  assert.equal(phase2.length,1);assert.match(phase2[0].t.population,/phase 2/i);assert.doesNotMatch(phase2[0].t.population,/phase 1/i);
  assert.equal(phase2[0].t.primary_date,'2026-02-17');
  const leap=collect('35867951').find(x=>x.t.nct==='NCT03776136');assert.deepEqual(leap.t.match_ids,[]);
});
