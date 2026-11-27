'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {annotateMatches}=require('../scripts/phase_comparison.cjs');
const reviews=require('../config/phase_comparison_links.json');
const snapshot=require('../dist/data/phase_comparison.json');

test('linked cohorts distinguish common control arms, confirmatory trials and independent regimen matches',()=>{
  const pairs=new Map();
  for(const group of structuredClone(snapshot.groups)){
    annotateMatches(group,reviews);
    for(const trial of group.phase2){
      assert.deepEqual(Object.keys(trial.match_basis||{}).sort(),[...trial.match_ids].sort());
      for(const [id,basis] of Object.entries(trial.match_basis||{})){
        assert.ok(basis.label);
        if(basis.source_url)assert.match(basis.source_url,/^https:\/\//);
        pairs.set(trial.id+' '+id,basis);
      }
    }
  }
  assert.match(pairs.get('NCT00434252 NCT00110019').label,/Shared control arm.*bevacizumab.*sorafenib/);
  assert.match(pairs.get('NCT03033576 NCT03445533').label,/control/i);
  assert.match(pairs.get('NCT03897881 NCT05933577').label,/Confirmatory/);
  assert.ok(!pairs.has('NCT02366195 NCT00769704'));
  assert.match(pairs.get('NCT00289016 NCT00769704').label,/after the initial phase II/);
  assert.match(pairs.get('NCT01927419 NCT02714218').label,/dosing schedules/);
  assert.match(pairs.get('NCT01927419 NCT01844505').label,/Independent trials/);
});

test('display annotations preserve treatment contrasts, outcomes and eligibility',()=>{
  const two={id:'II',match_ids:['III'],comparator:'original',outcomes:[{key:'OS|HR|vs:drug-b',value:'0.79'}]};
  const three={id:'III',comparator:'original',outcomes:[{key:'OS|HR|vs:drug-c',value:'0.67'}]};
  const unrelated={id:'other',match_ids:[]};
  const group={regimen:'Drug A',phase2:[two,unrelated],phase3:[three]};
  annotateMatches(group,[{regimen:'Drug A',phase2_id:'other',phase3_id:'III',label:'Wrong population',source_url:'https://example.com'},
    {regimen:'Drug A',phase2_id:'II',phase3_id:'III',label:'Common control arm.',phase2_comparator:'Drug B',phase3_comparator:'Drug C',source_url:'https://example.org'}]);
  assert.deepEqual(two.match_basis.III,{label:'Common control arm.',source_url:'https://example.org'});
  assert.equal(two.comparator,'Drug B');
  assert.equal(three.comparator,'Drug C');
  assert.deepEqual(two.outcomes,[{key:'OS|HR|vs:drug-b',value:'0.79'}]);
  assert.deepEqual(three.outcomes,[{key:'OS|HR|vs:drug-c',value:'0.67'}]);
  assert.deepEqual(unrelated,{id:'other',match_ids:[]});
  annotateMatches(group,[]);
  assert.match(two.match_basis.III.label,/clinically comparable/);
});

test('a verified result enriches only its exact phase III cohort and outcome measure',()=>{
  const selected={id:'III',outcomes:[{key:'OS|median|positive',value:'old'},{key:'OS|median|negative',value:'17 months'}]};
  const other={id:'different',outcomes:[]};
  const phase2={id:'II',match_ids:['III'],outcomes:[]};
  annotateMatches({regimen:'A',phase2:[phase2],phase3:[selected,other]},[{
    regimen:'A',phase2_id:'II',phase3_id:'III',phase3_outcomes:[
      {key:'OS|median|positive',value:'18 months',pmid:'1234'},
      {key:'RFS|median|positive',value:'11 months',pmid:'1234'}
    ]
  }]);
  assert.deepEqual(selected.outcomes.map(o=>o.value),['18 months','17 months','11 months']);
  assert.deepEqual(other.outcomes,[]);
  assert.deepEqual(phase2.outcomes,[]);
});
