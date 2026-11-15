'use strict';
const sampleProof=require('./fixtures/pooling_sample_size.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const Analysis=require('../dist/treatment_map_analysis.js');
const close=(actual,expected,tolerance=1e-11)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
const row=(id,y,v)=>({id,study_id:id,label:id,pmid:id,log_estimate:y,variance:v,se:Math.sqrt(v),estimate:Math.exp(y)});
const numeric=(ys,vs)=>ys.map((y,i)=>row(String(i),y,vs[i]));

test('automatic model depends only on selected independent k, not heterogeneity',()=>{
 assert.equal(Analysis.modelForK(0),null);assert.equal(Analysis.modelForK(2.5),null);
 assert.deepEqual([1,2,3,20].map(k=>Analysis.modelForK(k).model),['individual','fixed','random','random']);
 const result=Analysis.poolRows(numeric([-1,1],[.01,.09]));
 assert.equal(result.model,'fixed');assert.equal(result.model_label,'Fixed-effect');assert.equal(result.method,'FE');assert.equal(result.tau2_method,'none');
 assert.equal(result.tau2,0);close(result.Q,40);close(result.I2,97.5);close(result.log_estimate,-.8);close(result.se,Math.sqrt(.009));
 close(result.weight_percent[0],90);close(result.weight_percent[1],10);
});

test('one study preserves its point estimate and original interval while displaying an explicitly converted 95% CI',()=>{
 const source={...row('one',Math.log(.7),.04),estimate:.7,ci_lower:.39,ci_upper:1.26,ci_level:99.5};
 const result=Analysis.poolRows([source]);
 assert.equal(result.model,'individual');assert.equal(result.model_label,'Individual study');assert.equal(result.method,'single');assert.equal(result.tau2_method,'none');
 assert.equal(result.estimate,.7);assert.equal(result.ci_level,95);assert.equal(result.ci_converted,true);assert.equal(result.original_ci.ci_lower,.39);assert.equal(result.original_ci.ci_upper,1.26);assert.equal(result.original_ci.ci_level,99.5);assert.ok(result.ci_lower>.39&&result.ci_upper<1.26);close(result.variance,source.variance);
 const noReportedCI=Analysis.poolRows([{...source,ci_lower:null,ci_upper:null}]);
 assert.equal(noReportedCI.ci_lower,null);assert.equal(noReportedCI.ci_upper,null);assert.equal(noReportedCI.ci_level,null);
});

test('REML boundary at zero retains random-effects identity for three studies',()=>{
 const result=Analysis.poolRows(numeric([-.2,-.21,-.19],[.01,.04,.09]));
 assert.equal(result.tau2,0);assert.equal(result.model,'random');assert.equal(result.model_label,'Random-effects');assert.equal(result.tau2_method,'REML');
 close(result.log_estimate,-.2010204081632653);close(result.se,.08571428571428572);
});

test('equal-variance REML agrees with its independent closed-form solution',()=>{
 const ys=[-.6,-.1,.3,.8],v=.04,mean=.1,sampleVariance=1.06/3;
 const result=Analysis.poolRows(numeric(ys,ys.map(()=>v)));
 close(result.tau2,sampleVariance-v);close(result.log_estimate,mean);close(result.variance,sampleVariance/ys.length);
 result.weight_percent.forEach(w=>close(w,25));
 const boundary=Analysis.poolRows(numeric([.1,.11,.09],[v,v,v]));assert.equal(boundary.tau2,0);
});

test('REML compares an interior optimum with zero even when the boundary derivative is positive',()=>{
 // Independently verified with orthonormal error-contrast Gaussian likelihood;
 // unequal variances can produce more than one stationary point.
 const result=Analysis.poolRows(numeric([.1474924264021645,.15567266650819953,.4875022106977655],
  [.002100827530999301,.000002789504867737348,.016385117342024153]));
 close(result.tau2,.018536239658285675);
 assert.equal(result.model,'random');assert.equal(result.tau2_method,'REML');
});

test('three-study leave-one-out changes to fixed-effect fits and two-study omission retains the remaining original interval behind its converted display',()=>{
 const rows=numeric([-.8,-.15,.2],[.015,.07,.2]),fit=Analysis.poolRows(rows),diagnostics=Analysis.diagnostics(rows,fit);
 assert.equal(fit.model,'random');close(fit.tau2,.19330955125375934);
 const means=[-.05925925925925926,-.7302325581395349,-.6852941176470588];
 diagnostics.leave_one_out.forEach((item,i)=>{assert.equal(item.k_remaining,2);assert.equal(item.model,'fixed');assert.equal(item.model_label,'Fixed-effect');assert.equal(item.tau2_method,'none');assert.equal(item.pooled.tau2,0);close(item.pooled.log_estimate,means[i]);});
 const two=rows.slice(0,2).map((value,i)=>({...value,ci_lower:.2+i*.1,ci_upper:1.2+i*.1,ci_level:99.5}));
 Analysis.diagnostics(two,Analysis.poolRows(two)).leave_one_out.forEach((item,i)=>{assert.equal(item.model,'individual');assert.equal(item.ci_level,95);assert.equal(item.ci_converted,true);assert.equal(item.original_ci.ci_level,99.5);assert.equal(item.original_ci.ci_lower,two[1-i].ci_lower);assert.equal(item.original_ci.ci_upper,two[1-i].ci_upper);assert.match(item.conversion_note,/Approximate 95%/);});
});

function report(id,trial,year=2025){return {id,pmid:id,study_name:trial,year,intervention:{node_id:'ab'},comparator:{node_id:'a'},outcome:'OS',measure:'HR',estimate:.7,ci_lower:.5,ci_upper:.9,ci_level:95,analysis:{design:'randomized_trial',independent_id:trial,independence_verified:true,publication_year:year,source_completeness:2,sample_size:sampleProof(id),compatibility:{key:'compatible',eligible:true,label:'Compatible'}}};}
test('duplicate and follow-up publications never inflate independent k or select the wrong model',()=>{
 const inputs=[report('old','trial-a',2020),report('latest','trial-a'),report('b','trial-b')];
 const options={tailId:'ab',headId:'a',endpoint:'OS:HR'};
 const two=Analysis.analyze(inputs,options).groups[0];assert.equal(two.selected.length,2);assert.equal(two.pooled.model,'fixed');assert.equal(two.pooled.k,2);
 const three=Analysis.analyze([...inputs,report('c','trial-c')],options).groups[0];assert.equal(three.pooled.k,3);assert.equal(three.pooled.model,'random');assert.equal(three.pooled.tau2_method,'REML');
 const individual=Analysis.analyze(inputs.slice(0,2),options).groups[0];assert.equal(individual.pooled,null);assert.equal(individual.single.model,'individual');assert.equal(individual.single.k,1);
});
