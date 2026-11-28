'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {visibleGroups,renderChart} = require('../dist/trial_outcomes.js');

function row(trialId, armId, value, year, extra={}) {
  return {trialId,trialName:trialId,armId,regimen:armId,endpoint:'OS',year,
    date:year ? String(year) : '',value,notReached:value===null,author:'Lee',pmid:'123',
    source:{id:armId},filter_binding:{},...extra};
}
function armOrder(rows,column,direction) {
  const endpoint=rows[0].endpoint, groups=visibleGroups(rows,endpoint,{},{});
  const html=renderChart(groups,endpoint,s=>'#'+s.id,column?{column,direction}:null);
  return Array.from(html.matchAll(/class="to-arm-link" href="#([^"]+)"/g),m=>m[1]);
}

test('default groups stay together; ranking by year or estimate can separate arms of the same trial',()=>{
  const rows=[row('A','recent',32,2025),row('A','early',0,2010),row('B','middle',10,2015),row('C','unreached',null,null)];
  assert.deepEqual(armOrder(rows),['recent','early','middle','unreached']);
  assert.deepEqual(armOrder(rows,'year','ascending'),['early','middle','recent','unreached']);
  assert.deepEqual(armOrder(rows,'year','descending'),['recent','middle','early','unreached']);
  for(const endpoint of ['OS','PFS','RFS','DMFS','DOR']){
    const results=rows.map(r=>({...r,endpoint}));
    assert.deepEqual(armOrder(results,'estimate','ascending'),['early','middle','recent','unreached']);
    assert.deepEqual(armOrder(results,'estimate','descending'),['unreached','recent','middle','early']);
  }
});

test('an arm with two safety rates ranks by overall incidence and its latest published year',()=>{
  const safety=(trial,arm,value,year,attribution)=>row(trial,arm,value,year,{endpoint:'AE',attribution});
  const rows=[safety('A','both',3,2024,'related'),safety('A','both',40,2016,'overall'),safety('B','related',10,2020,'related')];
  assert.deepEqual(armOrder(rows,'estimate','ascending'),['related','both']);
  assert.deepEqual(armOrder(rows,'year','ascending'),['related','both']);
});
