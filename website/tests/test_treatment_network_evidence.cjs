'use strict';
const assert = require('node:assert/strict');
const {build} = require('../dist/treatment_network_evidence.js');
const arm = id => ({node_id:id,label:id,arm_id:id});
let serial=0;
function evidence(a,b,study,values={}) {
  const id='effect-'+(++serial),pmid=String(30000000+serial);
  return {id, pmid, intervention:arm(a),comparator:arm(b),outcome:'OS',measure:'HR',study_name:study,
    estimate:.8,ci_lower:.64,ci_upper:1,ci_level:95,source_refs:[],
    ...values, analysis:{independent_id:study,independence_verified:true,design:'randomized_trial',
      compatibility:{eligible:true}, cohort:{id:study+'|overall',root_id:study,is_subgroup:false},
      setting:'advanced',publication_year:2025, ...values.analysis}};
}
function graph(records,extra=[]) {
  const ids=[...new Set(records.flatMap(r=>[r.intervention.node_id,r.comparator.node_id]).filter(Boolean))];
  return {nodes:ids.map(id=>({id,label:id,type:'drug'})),comparisons:records,network_direct_evidence:extra};
}
const ab=evidence('A','B','trial 1'),bc=evidence('B','C','trial 2');
const cd=evidence('C','D','trial 3'), xy=evidence('X','Y','other');
let n=build(graph([ab,bc,cd,xy]));
assert.equal(n.status('B','A').code,'direct');
assert.equal(n.status('C','A').eligible,true);
assert.equal(n.status('Y','A').code,'disconnected');
assert.equal(n.status('Y').code,'no_partner');
assert.equal(n.status('A','A').code,'same');
assert.deepEqual(n.forPair('A','C').sharedComparators,['B']);
assert.equal(n.forPair('A','C').blocks.length,3,'include all connected evidence, also beyond the shortest path');
assert.equal(n.forPair('C','A').blocks.length,3);
const ac=evidence('C','A','direct study',{ci_lower:null});
n=build(graph([ab,bc],[ac]));
assert.equal(n.status('C','A').code,'direct_incomplete');
assert.equal(n.status('A','C').code,'direct_incomplete');
assert.deepEqual(n.forPair('A','C').sourcePmids,[ac.pmid]);
assert.deepEqual(n.forPair('C','A').sourcePmids,[ac.pmid]);
assert.equal(build(graph([ab,bc,{...ac,outcome:'PFS'}])).status('A','C').eligible,true);
assert.equal(build(graph([ab,bc,{...ac,analysis:{...ac.analysis,design:'observational'}}])).status('A','C').eligible,true);
const filtered=build(graph([ab,bc,cd,ac]),{advanced:{active:true,matches:{[ab.id]:{matched:true},[bc.id]:{matched:true}}}});
assert.equal(filtered.forPair('A','C').blocks.length,2);
const adj=evidence('B','C','adjuvant trial',{analysis:{setting:'adjuvant'}});
assert.equal(build(graph([ab,adj])).status('C','A').eligible,true);
assert.equal(build(graph([ab,adj]),{setting:'advanced'}).status('C','A').eligible,false);

const earlier=evidence('A','B','trial 1',{analysis:{publication_year:2020},estimate:1,ci_lower:.8,ci_upper:1.2});
const repeat=build(graph([ab,earlier,bc]));
assert.equal(repeat.forPair('A','C').blocks.length,2);
assert.equal(repeat.forPair('A','C').blocks[0].contrasts[0].logEffect,Math.log(.8));
const retainedEdges=repeat.forPair('A','C').comparisons;
assert.deepEqual(retainedEdges.map(edge=>edge.studyRow.pmid).sort(),[ab.pmid,bc.pmid].sort());
assert.equal(retainedEdges.find(e=>e.trialId==='trial 1').studyRow.sampleSize,null);
const reversedSource=evidence('B','A','nct:NCT01234567',{
  pmid:'12345678',title:'Randomized B versus A',year:2025,study_name:'EXAMPLE',population:'Advanced melanoma',
  nct_ids:['NCT01234567'],estimate:.7,ci_lower:.41,ci_upper:.92,
  analysis:{sample_size:{n:157,basis:'outcome_analysis',source_refs:[{
    pmid:'12345678',section:'sample_sizes',record_id:'s1',source_sha256:'a'.repeat(64),evidence_ids:['src1']}]}}});
const provenanceGraph=graph([reversedSource,bc]);
provenanceGraph.study_memberships=[{pmid:'12345678',first_author_surname:'Doe'}];
const shown=build(provenanceGraph).forPair('C','A').comparisons.find(edge=>edge.trialId==='nct:NCT01234567');
assert.deepEqual([shown.treatment,shown.comparator],['B','A']);
assert.deepEqual(shown.studyRow,{recordId:reversedSource.id,pmid:'12345678',title:'Randomized B versus A',author:'Doe',
  year:2025,trialName:'EXAMPLE',nct:'NCT01234567',group:'Advanced melanoma',intervention:'B',comparator:'A',sampleSize:157,
  measure:'HR',estimate:.7,ciLower:.41,ciUpper:.92,ciNote:null,sourcePmids:['12345678'],sourceRecordIds:[reversedSource.id]});
const publishedAuthor=require('../dist/treatment_network_authors.js');
assert.equal(publishedAuthor['38271746'],'Di Giacomo Anna Maria');
assert.match(publishedAuthor['27269740'],/^Weber\b/);
const se=evidence('A','B','se',{ci_lower:null,ci_upper:null,analysis:{precision:{reported_standard_error:.2,scale:'log'}}});
assert.equal(build(graph([se,bc])).forPair('A','C').blocks[0].covariance[0][0].toFixed(2),'0.04');
const seSource=build(graph([se,bc])).forPair('A','C').comparisons.find(e=>e.trialId==='se').studyRow;
assert.match(seSource.ciNote,/reported log-scale standard error/);
assert.ok(Math.abs(seSource.ciUpper-.8*Math.exp(1.959963984540054*.2))<1e-12);
const otherLevel={...ab,ci_level:90};
const adjustedCi=build(graph([otherLevel,bc])).forPair('C','A').comparisons.find(e=>e.trialId==='trial 1').studyRow;
assert.ok(adjustedCi.ciLower<ab.ci_lower && adjustedCi.ciUpper>ab.ci_upper);
assert.match(adjustedCi.ciNote,/90%/);
assert.equal(build(graph([{...se,analysis:{...se.analysis,precision:{reported_standard_error:.2}}},bc])).status('A').eligible,false);
const placebo=evidence('A','unused','trial 1',{comparator:{node_id:null,label:'placebo + placebo'}});
const obs=evidence('C','unused','trial 2',{comparator:{node_id:null,label:'Observation'}});
n=build(graph([placebo,obs]));
assert.equal(n.forPair('A','C').sharedComparators[0],n.regimenId('control:placebo'));
assert.equal(n.regimenId('control:standard%20of%20care'),n.regimenId('control:observation'));
const active=evidence('D','B','active',{comparator:{node_id:'B',label:'B (+placebo)'}});
assert.equal(build(graph([placebo,active])).status('D','A').code,'disconnected');
const seq=evidence('A','B','sequence',{intervention:{node_id:'A',network_regimen_id:'sequence:AB',network_regimen_label:'A → B',label:'A'}});
n=build(graph([ab,bc,seq]));
assert.deepEqual(n.regimensForNode('A').sort(),['A','sequence:AB']);
assert.equal(n.status('sequence:AB','B').code,'direct');
const unres={...seq, intervention:{...seq.intervention,network_regimen_unresolved:true}};
assert.equal(build(graph([unres,bc])).status('A').eligible,false);

function rr(x,y,xn,yn) {
  const intervention={numerator:x,denominator:100,rate:x/100},reference={numerator:y,denominator:100,rate:y/100};
  const ratio=x/y, v=(1/x-1/100)+(1/y-1/100), w=1.959963984540054*Math.sqrt(v);
  return evidence(xn,yn,'three-arm',{pmid:'12345',outcome:'ORR',measure:'RR',estimate:ratio,ci_lower:ratio*Math.exp(-w),ci_upper:ratio*Math.exp(w),
    calculation:{method:'from_arm_binary_outcomes',intervention,reference}});
}
const xb=rr(40,20,'A','B'),yb=rr(30,20,'C','B'), bridge=evidence('D','C','external',{outcome:'ORR',measure:'RR'});
const tri=build(graph([xb,yb,bridge]),{endpoint:'ORR:RR'});
assert.equal(tri.status('A','C').code,'direct','the two randomized arm risks recover this direct comparison');
const block=tri.forPair('A','D').blocks.find(b=>b.trialId==='three-arm');
const thirdArm=tri.forPair('A','D').comparisons.find(e=>e.treatment==='A' && e.comparator==='C').studyRow;
assert.equal(thirdArm.reconstructed,true);
assert.equal(thirdArm.sampleSize,200);
assert.deepEqual(thirdArm.sourcePmids,['12345']);
assert.deepEqual(thirdArm.sourceRecordIds,[xb.id,yb.id].sort());
assert.ok(Math.abs(thirdArm.estimate-4/3)<1e-12);
assert.ok(Math.abs(thirdArm.ciLower-(4/3)*Math.exp(-1.959963984540054*Math.sqrt(1/40+1/30-2/100)))<1e-12);
const eb=rr(12,20,'E','B');
const fourArm=build(graph([xb,yb,eb,bridge]),{endpoint:'ORR:RR'}).forPair('A','D');
assert.deepEqual(fourArm.comparisons.find(e=>e.treatment==='A' && e.comparator==='C').studyRow.sourceRecordIds,
  [xb.id,yb.id].sort(),'a reconstructed contrast cites only the reports supplying its own two arms');
const crossPublication=[xb,yb].map((r,i)=>({...r,pmid:'7100000'+i,title:'Publication '+i,
  analysis:{...r.analysis,analysis_cutoff:'2024-09-01',publication_year:2024+i}}));
const reconstructed=build(graph([...crossPublication,bridge]),{endpoint:'ORR:RR'}).forPair('A','D')
  .comparisons.find(e=>e.treatment==='A' && e.comparator==='C').studyRow;
assert.equal(reconstructed.pmid,null);
assert.deepEqual(reconstructed.sourcePublications,[
  {pmid:'71000000',title:'Publication 0',author:null,year:2024},
  {pmid:'71000001',title:'Publication 1',author:null,year:2025}]);
assert.equal(block.contrasts.length,2);
assert.ok(Math.abs(block.covariance[0][1]-(1/40-1/100))<1e-12,'common reference A contributes its arm variance');
const inconsistent={...yb,calculation:{...yb.calculation,reference:{numerator:18,denominator:100,rate:.18}}};
assert.equal(build(graph([xb,inconsistent,bridge]),{endpoint:'ORR:RR'}).status('A','D').eligible,false);
const zero=evidence('A','C','zero',{measure:'RR',outcome:'ORR',estimate:0,ci_lower:null,ci_upper:null});
assert.equal(build(graph([xb,yb,bridge],[zero]),{endpoint:'ORR:RR'}).status('A','C').code,'direct');
assert.equal(build(graph([bridge],[zero]),{endpoint:'ORR:RR'}).status('A','C').code,'direct_incomplete');
const time=evidence('A','B','time',{measure:'RR',outcome:'ORR',outcome_definition:'response at 12 weeks'});
n=build(graph([time,bridge]),{endpoint:'ORR:RR'});
assert.ok(n.targets.some(t=>t.id==='12 weeks'));
assert.equal(n.status('A').eligible,false);
const base=evidence('A','B','base',{outcome:'PFS',outcome_definition:'intracranial progression-free survival'});
assert.equal(build(graph([base]),{endpoint:'PFS:HR'}).status('A').eligible,false);
const gen=evidence('Z','Y','AFT',{model:'Accelerated failure time'});
assert.equal(build(graph([gen])).status('Z','Y').code,'no_evidence');

// Three separately fitted Cox models can have numerically consistent HRs yet
// supply no covariance between them. A documented joint model changes eligibility.
const acHR=evidence('A','C','multi',{pmid:'900',estimate:.64,ci_lower:.49,ci_upper:.83});
const abHR=evidence('A','B','multi',{pmid:'900'});
const bcHR=evidence('B','C','multi',{pmid:'900'});
const noJoint=build(graph([acHR,abHR,bcHR,cd]));
assert.equal(noJoint.status('A','D').eligible,false);
assert.match(noJoint.status('A','D').reason,/covariance/);
assert.deepEqual(noJoint.status('D','A'),noJoint.status('A','D'),'a held trial explains the unavailable pair in either order');
assert.deepEqual(noJoint.forPair('D','A').sourcePmids,['900']);
assert.match(noJoint.status('A').reason,/multi-arm trial/);
// Two HRs in the same trial share B. Only its B-C contrast connects to the
// independent C-D trial. The marginal CI is sufficient and the other HR is unused.
const marginalAB=evidence('A','B','shared control',{pmid:'901'});
const marginalCB=evidence('C','B','shared control',{pmid:'901'});
const marginal=build(graph([marginalAB,marginalCB,cd]));
const linked=marginal.forPair('B','D');
assert.ok(linked.eligible);
assert.equal(linked.trials.length,2);
const marginalBlock=linked.blocks.find(row=>row.trialId==='shared control');
assert.deepEqual(linked.comparisons.filter(c=>c.trialId==='shared control').map(c=>c.studyRow.recordId),[marginalCB.id]);
assert.deepEqual(marginalBlock.contrasts,[{treatment:'C',comparator:'B',logEffect:Math.log(.8)}]);
assert.match(linked.trials.find(t=>t.id==='shared control').selectionNote,/one randomized contrast/i);
assert.equal(marginal.status('A','D').eligible,false,'two marginal HRs from one trial cannot create an independent path');
assert.deepEqual(marginal.status('A','D').sourcePmids,['901']);
assert.match(marginal.status('A','D').reason,/C versus B/);
assert.equal(marginal.status('A','B').code,'direct','omitted contrast still counts as direct evidence');
const shuffled=build(graph([cd,{...marginalCB,estimate:1.2,ci_lower:1,ci_upper:1.4},marginalAB]));
assert.deepEqual(shuffled.forPair('D','B').trials,linked.trials,'selection is independent of input order, comparison order and effect direction');
const alongside=build(graph([marginalAB,marginalCB,cd,bc]));
assert.deepEqual(alongside.forPair('A','D').blocks.find(row=>row.trialId==='shared control').contrasts.map(c=>[c.treatment,c.comparator]),[['A','B']]);
const solelyMulti=build(graph([evidence('A','B','trial one'),evidence('A','X','trial one'),
  evidence('B','C','trial two'),evidence('C','Y','trial two')]));
assert.deepEqual(solelyMulti.forPair('A','C').blocks.map(b=>b.contrasts.length),[1,1]);
const joint=[acHR,abHR,bcHR].map(x=>({...x,analysis:{...x.analysis,joint_model_id:'cox-all-arms'}}));
const complete=build(graph([...joint,cd]));
assert.equal(complete.forPair('A','D').blocks.find(x=>x.trialId==='multi').contrasts.length,2);
const twoJoint=build(graph([joint[1],joint[2],cd]));
assert.equal(twoJoint.status('A','C').code,'direct_incomplete');
const seVar=((Math.log(abHR.ci_upper)-Math.log(abHR.ci_lower))/(2*1.959963984540054))**2;
const source={source_refs:[{pmid:'900'}],scale:'log',contrast_ids:[abHR.id,bcHR.id],matrix:[[seVar,-seVar*.3],[-seVar*.3,seVar]]};
const explicit=[abHR,bcHR].map(x=>({...x,analysis:{...x.analysis,joint_model_id:'fit',multiarm_covariance:source}}));
const explained=build(graph([...explicit,cd]));
assert.equal(explained.status('C','A').code,'direct');
assert.equal(explained.forPair('A','D').blocks.find(x=>x.trialId==='multi').covariance[0][1],-seVar*.3);
const derivedHR=explained.forPair('A','D').comparisons.find(e=>e.treatment==='A'&&e.comparator==='C').studyRow;
assert.ok(Math.abs(derivedHR.estimate-.64)<1e-12);
assert.ok(Math.abs(derivedHR.ciUpper-.64*Math.exp(1.959963984540054*Math.sqrt(1.4*seVar)))<1e-12);
assert.equal(derivedHR.sampleSize,null);
assert.match(derivedHR.ciNote,/joint model/);
assert.deepEqual(derivedHR.sourceRecordIds,[abHR.id,bcHR.id].sort());
const later=evidence('A','B','multi',{pmid:'901',analysis:{publication_year:2026}});
const earlierJoint=build(graph([...joint,later,cd]));
assert.deepEqual(earlierJoint.forPair('A','D').trials.find(x=>x.id==='multi').pmids,['900']);
for (const label of ['active standard care','standard-of-care','BSC','SOC']) {
  const c=evidence('C','unused','care',{comparator:{node_id:null,label}});
  assert.equal(build(graph([placebo,c])).status('A','C').eligible,true);
}
const obsAC=evidence('C','A','observed',{title:'A retrospective cohort study',analysis:{design:'observational'}});
const earlierObs=evidence('C','A','observed',{title:'A retrospective cohort study',analysis:{design:'observational',publication_year:2020}});
const indirectSource=evidence('A','C','cross trial',{title:'A retrospective cohort using an external control',analysis:{design:'observational'}});
const propensityOnly=evidence('A','C','weighted',{title:'A propensity score-weighted analysis',analysis:{design:'observational'}});
const bothEvidence=build(graph([ab,bc,obsAC,earlierObs,indirectSource,propensityOnly]));
const scoped=bothEvidence.forPair('A','C');
assert.equal(scoped.eligible,true);
assert.equal(scoped.blocks.length,2);
assert.equal(scoped.observational.length,1);
assert.equal(scoped.observational[0].estimate,1.25);
assert.equal(scoped.observational[0].pmid,obsAC.pmid);
assert.equal(scoped.observational[0].ci_lower,1);
assert.equal(scoped.observational[0].ci_upper,1/.64);
assert.equal(bothEvidence.forPair('C','A').observational[0].estimate,.8);
console.log('Randomized network selection, exact controls, direct vetoes, scope, targets, distinct trials and multi-arm covariance verified.');
