'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {fit,projectTrial} = require('../dist/treatment_network_model.js');
const {routeGraph,routes,routeKey,fitRoute,fitSelection,selectionLabel,weightingNote} = require('../dist/treatment_network_pathways.js');
const close = (x,y) => assert.ok(Math.abs(x-y) < 1e-9, x+' differs from '+y);
const contrast = (treatment,comparator,estimate) => ({treatment,comparator,logEffect:Math.log(estimate)});
const trial = (trialId,treatment,comparator,estimate) =>
  ({trialId,contrasts:[contrast(treatment,comparator,estimate)],covariance:[[.04]]});
const edges = blocks => blocks.flatMap(block=>block.contrasts.map(row=>({...row,trialId:block.trialId})));
const enumerate = (comparisons,a,b) => [...routes(routeGraph({comparisons}),a,b)];

test('pathways group independent replications by regimen and exclude off-path evidence',()=>{
  const blocks=[trial('ab1','A','B',.8),trial('ab2','B','A',1.25),trial('cb','C','B',.5),
    trial('ad','A','D',1),trial('cd','C','D',1),trial('xe','X','E',2),trial('ex','E','A',1)];
  const found=enumerate(edges(blocks),'A','C');
  assert.deepEqual(found.map(r=>r.regimens),[['A','B','C'],['A','D','C']]);
  assert.deepEqual(enumerate(edges(blocks).reverse(),'A','C').map(r=>r.regimens),found.map(r=>r.regimens));
  const first=fitRoute(found[0],blocks),second=fitRoute(found[1],blocks);
  assert.equal(first.trialCount,3);
  close(first.estimate,1.6);
  close(first.se,Math.sqrt(.06));
  close(second.estimate,1);
  const network=fit(blocks,'A','C');
  assert.ok(network.estimate>second.estimate && network.estimate<first.estimate);
  assert.equal(fitRoute(found[0],blocks,'random').available,true);
  const randomNetwork=fit(blocks,'A','C','random');
  const randomRoute=fitRoute(found[1],blocks,'random');
  assert.equal(randomRoute.available,true,randomRoute.reason);
  close(randomRoute.tau2,randomNetwork.tau2);
  close(randomRoute.se**2,.08+2*randomNetwork.tau2);
  assert.match(fitRoute(found[1],blocks.slice(3,5),'random').reason,/heterogeneity estimate/);
  const reverse=fitRoute(enumerate(edges(blocks),'C','A')[0],blocks);
  close(reverse.estimate,1/first.estimate);
  close(reverse.ci_lower,1/first.ci_upper);
  close(reverse.ci_upper,1/first.ci_lower);
});

test('a detour around the arms of a single trial does not create an independent evidence pathway',()=>{
  const visits=[
    {trialId:'one',treatment:'A',comparator:'B'},
    {trialId:'one',treatment:'B',comparator:'C'},
    {trialId:'one',treatment:'A',comparator:'C'},
    {trialId:'two',treatment:'C',comparator:'D'}
  ];
  assert.deepEqual(enumerate(visits,'A','D').map(r=>r.regimens),[['A','C','D']]);
  assert.deepEqual(enumerate(visits,'A','Z'),[]);
  visits.push({trialId:'three',treatment:'B',comparator:'A'});
  assert.deepEqual(enumerate(visits,'A','D').map(r=>r.regimens),[['A','C','D'],['A','B','C','D']]);
});

test('multi-arm projections keep the signs, the covariance and a single trial identifier',()=>{
  const block={trialId:'multi',contrasts:[contrast('A','B',.8),contrast('B','C',.75)],covariance:[[.04,.01],[.01,.09]]};
  const p=projectTrial(block,[['A','C'],['B','A']]);
  close(Math.exp(p.contrasts[0].logEffect),.6);
  close(Math.exp(p.contrasts[1].logEffect),1.25);
  close(p.covariance[0][0],.15);
  close(p.covariance[1][1],.04);
  close(p.covariance[0][1],-.05);
  close(p.covariance[1][0],-.05);
  assert.equal(p.trialId,'multi');
  assert.equal(projectTrial(block,[['A','Z']]),null);
});

test('a trial supporting disjoint steps keeps their covariance without adding an off-path contrast',()=>{
  const multi={trialId:'four-arm',contrasts:[contrast('A','B',.8),contrast('B','C',.6),contrast('C','D',.7)],
    covariance:[[.04,0,.01],[0,.04,0],[.01,0,.04]]};
  const blocks=[multi,trial('bx','B','X',1),trial('xc','X','C',1),trial('cd','C','D',.7)];
  const path=enumerate(edges(blocks),'A','D').find(route=>route.regimens.includes('X'));
  const result=fitRoute(path,blocks);
  assert.equal(result.available,true,result.reason);
  assert.equal(result.trialCount,4);
  close(result.estimate,.8*.7);
  // The C/D replicate has variance .04. Conditioning on the difference
  // between the C/D estimates removes (.04+.01)^2/(.04+.04) from Var(log(A/D)).
  close(result.se**2,.04+.04+.04+.04+2*.01-.05**2/.08);
});

test('selection preserves the full network by default and retains each shared contrast once',()=>{
  const multi={trialId:'multi',contrasts:[contrast('A','B',.8),contrast('C','B',.75)],covariance:[[.04,.01],[.01,.09]]};
  const blocks=[multi,trial('ac','A','C',.9),trial('bd','B','D',.7),trial('cd','C','D',.8),trial('de','D','E',.8),
    trial('ax','A','X',1.2),trial('xe','X','E',1.2),trial('extra','X','Y',1.6)];
  const comparisons=[...edges(blocks),{trialId:'multi',treatment:'A',comparator:'C'}];
  const pair={blocks,comparisons,trials:blocks.map(b=>({id:b.trialId}))};
  const first='A',second='E',graph=routeGraph(pair),possible=[...routes(graph,first,second)];
  const fullFit=fit(blocks,first,second),selected=excluded=>fitSelection({pair,first,second,fullFit,excluded},graph);
  assert.equal(selected(new Set()).fit,fullFit);
  assert.equal(selectionLabel(selected(new Set())),'');
  const excluded=new Set([routeKey(['A','X','E'])]);
  const filtered=selected(excluded);
  assert.equal(filtered.selectedCount,possible.length-1);
  assert.equal(filtered.totalCount,possible.length);
  assert.equal(filtered.allComparisonsRetained,false);
  assert.equal(selectionLabel(filtered),(possible.length-1)+' of '+possible.length+' pathways included');
  assert.equal(filtered.fit.available,true,filtered.fit.reason);
  assert.deepEqual(filtered.pair.trials.map(t=>t.id),['multi','ac','bd','cd','de']);
  assert.equal(filtered.pair.blocks.find(b=>b.trialId==='multi').contrasts.length,2);
  // Independently calculated using GLS pathway coefficient matrices H in
  // NumPy and the original trial-block covariance, Var = (wH) V (wH)'.
  assert.equal(filtered.fit.method,'pathway-weighted');
  assert.equal(filtered.referenceComparisons.length,comparisons.length-1);
  close(filtered.fit.estimate,.4911673120946762);close(filtered.fit.se,.2899506731255676);
  close(filtered.fit.ci_lower,.2782421982034094);close(filtered.fit.ci_upper,.8670335773222516);
  close(filtered.referenceFit.estimate,.6948823689588975);close(filtered.referenceFit.se,.21657701251555014);
  assert.equal(filtered.fit.diagnostics,undefined);
  assert.match(weightingNote(filtered.fit),/shared trials/);
  const randomNetwork=fit(blocks,first,second,'random');
  const random=fitSelection({pair,first,second,model:'random',excluded,fullFit:randomNetwork},graph);
  close(random.fit.tau2,randomNetwork.tau2);
  assert.ok(Math.abs(random.fit.estimate-.49561235450)<1e-8);
  assert.ok(Math.abs(random.fit.se-.48667612006)<1e-7);
  assert.match(weightingNote(random.fit),/full-network REML/);
  const only=possible.find(route=>route.regimens.join(',')==='A,B,D,E');
  const single=selected(new Set(possible.filter(r=>r!==only).map(r=>routeKey(r.regimens))));
  close(single.fit.estimate,fitRoute(only,blocks).estimate);
  const none=selected(new Set(possible.map(r=>routeKey(r.regimens))));
  assert.equal(none.fit.available,false);assert.deepEqual(none.pair.trials,[]);
  assert.equal(selectionLabel(none),'0 of '+possible.length+' pathways included');
  const reverse=fitSelection({pair,first:second,second:first,excluded},graph);
  close(reverse.fit.estimate,1/filtered.fit.estimate);
  close(reverse.fit.ci_lower,1/filtered.fit.ci_upper);
  close(reverse.fit.ci_upper,1/filtered.fit.ci_lower);
});

test('the selection explains when the remaining routes retain every contributing trial comparison',()=>{
  // Each choice of first bridge can continue through either last bridge.
  // Removing one whole route leaves all eight contributing trials on the checked routes.
  const blocks=[trial('ab','A','B',.7),trial('ac','A','C',.9),
    trial('bm','B','M',.8),trial('cm','C','M',.6),
    trial('mx','M','X',.9),trial('my','M','Y',.85),
    trial('xd','X','D',.9),trial('yd','Y','D',.95),trial('off','B','Z',.4)];
  const pair={blocks,comparisons:edges(blocks),trials:blocks.map(b=>({id:b.trialId}))};
  const first='A',second='D',graph=routeGraph(pair);
  const excluded=new Set([routeKey(['A','B','M','X','D'])]);
  const selection=fitSelection({pair,first,second,excluded},graph);
  assert.equal(selection.totalCount,4);
  assert.equal(selection.pair.trials.length,8);
  assert.equal(selection.allComparisonsRetained,true);
  assert.equal(selectionLabel(selection),'3 of 4 pathways included · All contributing trial comparisons are still included.');
  assert.notEqual(selection.fit.estimate,selection.referenceFit.estimate);
});

test('Fotemustine versus Dacarbazine updates on the first checkbox with the R-verified shared covariance',()=>{
  const {readFileSync,existsSync}=require('node:fs');
  const file=require('node:path').resolve(__dirname,'../dist/data/treatment_map.json');
  const graph=JSON.parse(existsSync(file)?readFileSync(file):require('node:zlib').gunzipSync(readFileSync(file+'.gz')));
  const network=require('../dist/treatment_network_evidence.js').build(graph,{endpoint:'OS:HR'});
  const first='agent:fotemustine',second='agent:dacarbazine',pair=network.forPair(first,second);
  const routeMap=routeGraph(pair),possible=[...routes(routeMap,first,second)];
  assert.equal(possible.length,6);
  const excluded=new Set([routeKey(possible[0].regimens)]);
  const chosen=fitSelection({pair,first,second,excluded},routeMap);
  assert.equal(chosen.allComparisonsRetained,true);
  // Independent R calculation: H contains signed study coefficients per
  // route, V contains study variances, w is normalized 1 / diag(H V H').
  // Interval = exp(w' H y ± qnorm(.975) sqrt(w' H V H' w)).
  close(chosen.referenceFit.estimate,.5457250540192804);
  close(chosen.referenceFit.ci_lower,.24231148589702528);
  close(chosen.referenceFit.ci_upper,1.2290619797978077);
  close(chosen.fit.estimate,.4354653766428406);
  close(chosen.fit.ci_lower,.17824843451113204);
  close(chosen.fit.ci_upper,1.0638527893654413);
  const planning=require('../dist/treatment_map_planning.js');
  const required=(estimate,comparisons)=>planning.indirect({estimate,measure:'HR',first,second,comparisons}).label;
  assert.equal(required(chosen.fit.estimate,chosen.pair.comparisons),'E=46');
  assert.equal(required(chosen.referenceFit.estimate,chosen.referenceComparisons),'E=86');
  const restored=fitSelection({pair,first,second,excluded:new Set()},routeMap);
  close(restored.fit.estimate,.8733833639033913);
  assert.equal(required(restored.fit.estimate,pair.comparisons),'E=1,713');
});
