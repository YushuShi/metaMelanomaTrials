'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const compact=require('../dist/quantitative_extraction.js');

test('estimates and intervals display three decimals without changing stored values',()=>{
  const row={estimate:19.876796714579058,ci_lower:12.386036960985626,ci_upper:'NA',ci_level:95};
  const before=JSON.stringify(row);
  assert.equal(compact.interval(row),'19.877 (12.386–NA)');
  assert.equal(compact.interval({estimate:16.788501026694046,ci_lower:6.4722792607802875,ci_upper:'NA'}),'16.789 (6.472–NA)');
  assert.equal(compact.interval({estimate:.78,ci_lower:.61111,ci_upper:.99444,ci_level:95.6},.78,{original:true}),'0.780 (0.611–0.994; 95.6% CI)');
  assert.equal(compact.formatNumber(1.005),'1.01');
  assert.equal(compact.formatNumber(-1.005),'-1.01');
  assert.equal(compact.formatNumber(-.001),'0');
  assert.equal(compact.formatNumber(157),'157');
  assert.equal(compact.formatNumber('NA'),'NA');
  assert.equal(compact.formatNumber('<0.001'),'<0.001');
  assert.equal(compact.formatNumber('P = 0.00001'),'P = 0.00001');
  assert.equal(JSON.stringify(row),before);
});

test('generic melanoma and cutoff context are concise while subtype and outcome-time distinctions remain',()=>{
  assert.equal(compact.cleanContext('Melanoma · immune checkpoint inhibitor'),'immune checkpoint inhibitor');
  assert.equal(compact.cohortLabel('Melanoma (Part 1)'),'Part 1');
  assert.equal(compact.cohortLabel('Melanoma patient in Part 1'),'Part 1');
  assert.equal(compact.cohortLabel('BRAF-mutant melanoma'),'BRAF-mutant');
  assert.equal(compact.cohortLabel('Mucosal melanoma'),'Mucosal melanoma');
  assert.equal(compact.cohortLabel('Uveal melanoma'),'Uveal melanoma');
  assert.equal(compact.cohortLabel('Mucosal or cutaneous melanoma'),'Mucosal or cutaneous melanoma');
  assert.equal(compact.cohortLabel('Cutaneous melanoma versus uveal melanoma'),'Cutaneous melanoma versus uveal melanoma');
  assert.equal(compact.cohortLabel('Melanoma (acral or cutaneous)'),'Melanoma (acral or cutaneous)');
  assert.equal(compact.cohortLabel('Non-melanoma solid tumors'),'Non-melanoma solid tumors');
  assert.equal(compact.cohortLabel('Phase 1 cohort'),'Phase I');
  assert.equal(compact.cleanContext('Surgical · Cutoff: April 1, 2025'),'Surgical');
  assert.equal(compact.cleanContext('Surgical (data cutoff: April 1, 2025)'),'Surgical');
  assert.equal(compact.timeLabel({time:12,time_unit:'months'}),'12 mo');
  assert.equal(compact.timeLabel({time:12.386036960985626,time_unit:'months'}),'12.39 mo');
});

test('only duplicate OR labels collapse; doses, AND, sequential order and source nodes stay intact',()=>{
  const arm={root_id:'o',nodes:[{id:'o',kind:'OR',children:['a','b']},{id:'a',kind:'drug',name:'trk-950',dose:'3 mg/kg'},{id:'b',kind:'drug',name:'trk-950',dose:'10 mg/kg'}]},before=JSON.stringify(arm);
  assert.equal(compact.regimen(arm),'trk-950');
  assert.equal(compact.regimen(arm,{deduplicateAlternatives:false}),'trk-950 OR trk-950');
  assert.equal(JSON.stringify(arm),before);
  const and=structuredClone(arm);and.nodes[0].kind='AND';assert.equal(compact.regimen(and),'trk-950 + trk-950');
  const sequential=structuredClone(arm);sequential.nodes[0].kind='SEQUENTIAL';assert.equal(compact.regimen(sequential),'trk-950 → trk-950');
  const alternatives=structuredClone(arm);alternatives.nodes[2].name='nivolumab';assert.equal(compact.regimen(alternatives),'trk-950 OR nivolumab');
  alternatives.nodes[0].kind='SEQUENTIAL';assert.equal(compact.regimen(alternatives),'trk-950 → nivolumab');
  alternatives.nodes[0].children.reverse();assert.equal(compact.regimen(alternatives),'nivolumab → trk-950');
});

test('cutoff-specific counts stay separate internally, and cutoff provenance remains in the drawer',()=>{
  const record={stage:'R3',source_sha256:'source',study:{},populations:[{id:'p',scope:'overall',label:'Melanoma',melanoma_only:'yes',cutoff:'April 1, 2025'}],arms:[{id:'a',population_id:'p',root_id:'d',nodes:[{id:'d',kind:'drug',name:'nivolumab'}]}],sample_sizes:[],effects:[],survival:[{id:'s',population_id:'p',arm_id:'a',endpoint:'OS',kind:'median',estimate:19.876796714579058,ci_lower:12.386036960985626,ci_upper:'NA',unit:'months',analysis_n:10}],binary:[]};
  const study={details:{quantitative_extraction:[{record}]}},counts=['April 1, 2025','July 1, 2025'].map((cutoff,i)=>({sample_size:'10',source:{source_input_sha256:'source',quantitative_record:{id:'n'+i,population_id:'p',arm_id:'a',count_purpose:'treated',cutoff,n:10},n:{status:'reported',value:10}}}));
  const before=JSON.stringify([study,counts]);
  const groups=compact.countSummary(study,counts);
  assert.equal(groups.length,2);
  assert.deepEqual(groups.map(group=>group.label),['nivolumab','nivolumab']);
  const html=compact.render(study);
  assert.match(html,/April 1, 2025/);
  assert.match(html,/19\.877 \(12\.386–NA\) months/);
  assert.equal(JSON.stringify([study,counts]),before);
});

test('display-only OR deduplication does not establish phase-cohort equivalence',()=>{
  const arm={id:'parent-arm',population_id:'p',root_id:'o',nodes:[{id:'o',kind:'OR',children:['a','b']},{id:'a',kind:'drug',name:'trk-950'},{id:'b',kind:'drug',name:'trk-950'}]};
  const record={source_sha256:'source',populations:[{id:'p',label:'Overall'},{id:'p1',parent_id:'p',label:'Phase 1'},{id:'p2',parent_id:'p',label:'Phase 2'}],arms:[arm,{id:'child-arm',population_id:'p1',root_id:'c',nodes:[{id:'c',kind:'drug',name:'trk-950'}]}],sample_sizes:[{id:'n',population_id:'p',arm_id:'parent-arm',n:10,complete:'yes',count_purpose:'treated',cutoff:'NA'},{id:'n1',population_id:'p1',arm_id:'child-arm',n:4,complete:'yes',count_purpose:'treated',cutoff:'NA',disjoint:'yes'},{id:'n2',population_id:'p2',arm_id:'child-arm',n:6,complete:'yes',count_purpose:'treated',cutoff:'NA',disjoint:'yes'}]};
  assert.equal(compact.regimen(arm),'trk-950');
  assert.deepEqual(compact.phasePartitions({details:{quantitative_extraction:[{record}]}}),[]);
});
