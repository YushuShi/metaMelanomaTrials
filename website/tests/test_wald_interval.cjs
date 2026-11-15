const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const wald=require('../dist/wald_interval.js');
const clone=v=>JSON.parse(JSON.stringify(v));
const missing=()=>({status:'not_reported',value:null,raw_text:null,unit:null,qualifier:'not_reported',evidence_ids:[]});
const number=(value,role='estimate',unit='ratio',evidence='effect')=>({role,status:'reported',value,raw_text:String(value),unit,qualifier:'equal',missing_reason:null,evidence_ids:[evidence]});
function fixture({effect=.5,p=.04,measure='HR',N=100,method='All coefficient p values were based on two-sided normal Wald tests.'}={}){
 const identity={report_id:'report-'+'a'.repeat(24),reviewer:'Luna',source_input_sha256:'b'.repeat(64),review_binding_sha256:'c'.repeat(64)};
 const row={...identity,result_id:'R',comparison_id:'C',population_id:'P',model_id:'M',endpoint_id:'OS',measure,main_result_eligible:true,
  clinical_verified:false,pooling_eligible:false,estimate:number(effect),p_value:number(p,'p_value',null),ci_lower:missing(),ci_upper:missing(),confidence_level:missing(),
  population:{entity_id:'P',label:'Melanoma patients',population_scope:'melanoma'},endpoint:{family:'overall_survival',definition:{text:'Overall survival',evidence_ids:['effect']}},
  model:{model_id:'M',family:'Cox regression',analysis_population_id:'P',endpoint_id:'OS',cutoff_id:null,contrast_type:'treatment_comparison',evidence_ids:['methods']},
  original_fact:{fact_id:'F',result_population_id:'P',model_id:'M',endpoint_id:'OS',cutoff_id:null,contrast_type:'treatment_comparison',text:'Reported effect',evidence_ids:['effect'],numbers:[number(effect),number(p,'p_value',null)]}};
 const sample={...identity,sample_record_id:'N',population_id:'P',main_result_eligible:true,n:number(N,'sample_size','patients','patients'),evidence_ids:['patients']};
 const nDisplay={basis:'explicit_analysis_n',values:[{fact:clone(sample.n),arm_id:null,population_id:'P'}],provenance:[{basis:'explicit_analysis_n',fact:clone(sample.n),source_record:sample}]};
 const evidenceRegistry={effect:{source_id:'source',block_id:'results',supporting_quote:`${measure} ${effect}; P = ${p}.`},methods:{source_id:'source',block_id:'methods',supporting_quote:method},patients:{source_id:'source',block_id:'population',supporting_quote:`${N} melanoma patients were analyzed.`}};
 return {row,nDisplay,evidenceRegistry};
}
const derive=f=>wald.derive(f.row,f);
const close=(a,b,tolerance=1e-8)=>assert(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)),`${a} != ${b}`);
test('source-backed automatic ratio reconstruction uses log scale and independent normal-quantile values',()=>{
 const f=fixture(),before=JSON.stringify(f),out=derive(f);assert.equal(out.status,'derived');close(out.standard_error,.33750337101661715);close(out.interval.lower,.25803975096693466);close(out.interval.upper,.9688429750191286);
 assert.equal(out.interval.scale,'log');assert.equal(out.interval.confidence_level,95);assert.equal(out.interval.approximate,true);assert.equal(out.clinical_verified,false);assert.equal(out.pooling_eligible,false);assert.match(wald.format(out),/derived 95% Wald CI/);assert.equal(JSON.stringify(f),before);
});
test('difference reconstruction and changing N do not insert N into the Wald p-to-SE formula',()=>{
 const f=fixture({effect:.03,p:.008,measure:'MD'}),out=derive(f);assert.equal(out.status,'derived');close(out.interval.lower,.007829045313587756);close(out.interval.upper,.05217095468641224);
 const other=derive(fixture({effect:.03,p:.008,measure:'MD',N:200}));assert.deepEqual(other.interval,out.interval);
});
test('printed95.6 intervals and partial/non-estimable originals are preserved',()=>{
 const f=fixture();f.row.ci_lower=number(.2,'ci_lower');f.row.ci_upper=number(.9,'ci_upper');f.row.confidence_level=number(95.6,'confidence_level','%');const before=JSON.stringify(f.row);
 assert.equal(derive(f).status,'reported_interval');assert.equal(JSON.stringify(f.row),before);assert.equal(wald.format(derive(f)),'');
 f.row.ci_upper=missing();assert.equal(derive(f).reason,'partial_reported_interval_preserved');
 f.row.ci_lower=missing();f.row.original_fact.numbers.push(number(.2,'ci_lower'),number(.9,'ci_upper'));assert.equal(derive(f).status,'reported_interval');
 f.row.original_fact.numbers=f.row.original_fact.numbers.slice(0,2);f.row.ci_lower={...missing(),status:'unclear',raw_text:'not estimable'};assert.equal(derive(f).status,'held');
});
test('inequality, zero/one, missing or nonnumeric p and null effects cannot yield an interval',()=>{
 for(const p of [0,1,-.1,NaN,Infinity,true]){const f=fixture();f.row.p_value.value=p;assert.equal(derive(f).status,'held');}
 for(const raw of ['<0.04','≤0.04','P > 0.04','rounded to 0.04']){const f=fixture();f.row.p_value.raw_text=raw;assert.equal(derive(f).status,'held');}
 for(const [effect,measure]of [[1,'HR'],[0,'MD'],[-1,'HR'],[.3,'p_value']])assert.equal(derive(fixture({effect,measure})).status,'held');
});
test('unknown methods hold by default; explicit assumption mode is separate and cannot override known tests',()=>{
 const unknown=fixture({method:'The HR and p value were reported without identifying the test.'});assert.equal(derive(unknown).status,'held');
 const assumed=wald.derive(unknown.row,{...unknown,mode:'assume_wald'});assert.equal(assumed.status,'derived');assert.equal(assumed.reason,'explicit_wald_assumption');assert.match(wald.format(assumed),/test assumed/);
 for(const method of ['Two-sided log-rank tests were used.','Two-sided score tests were used.','Two-sided likelihood-ratio tests were used.','One-sided normal Wald tests were used.','Two-sided Fisher exact tests were used.','Two-sided normal Wald p-values were Bonferroni adjusted.']){const f=fixture({method});assert.equal(wald.derive(f.row,{...f,mode:'assume_wald'}).status,'held');}
});
test('a Wald CI statement does not establish a matching coefficient Wald p test',()=>{
 const f=fixture({method:'Confidence intervals used the Wald method; survival p values used log-rank tests.'});assert.equal(derive(f).status,'held');
 const g=fixture({method:'Two-sided p values were reported. Wald confidence intervals were computed.'});assert.equal(derive(g).status,'held');
});
test('interaction, heterogeneity and multi-df Wald tests do not identify a scalar-effect SE',()=>{
 for(const method of ['All interaction p values were based on two-sided normal Wald tests.','Two-sided Wald chi-square tests with 2 degrees of freedom were used.','Two-sided Wald chi-square tests were used.','Heterogeneity was assessed using two-sided normal Wald tests.']){
  const f=fixture({method});assert.equal(derive(f).status,'held');assert.equal(wald.derive(f.row,{...f,mode:'assume_wald'}).status,'held');
 }
 assert.equal(derive(fixture({method:'All coefficient p values used two-sided normal Wald chi-square tests with 1 degree of freedom.'})).status,'derived');
});
test('foreign model/population/contrast, transplanted p, and fabricated test source are rejected',()=>{
 const f=fixture(),proof=wald.proofFor(f.row,f);
 for(const change of [{population_id:'foreign'},{model_id:'foreign'},{comparison_id:'foreign'}])assert.equal(wald.derive({...f.row,...change},{...f,testProof:proof}).status,'held');
 const p=fixture();p.row.model.analysis_population_id='other';assert.equal(derive(p).status,'held');
 const q=fixture();q.row.p_value.value=.02;assert.equal(derive(q).reason,'display_wrapper_does_not_match_original_effect_fact');
 const fake=clone(proof);fake.evidence[0].quote='Two-sided normal Wald tests were used.';assert.equal(wald.derive(f.row,{...f,testProof:fake}).reason,'test_evidence_not_resolved_to_owned_source');
});
test('source-supported N is mandatory, exact and complete, with known source/model scope',()=>{
 const f=fixture();for(const N of [0,-1,1.5,Infinity]){const g=clone(f);g.nDisplay.values[0].fact.value=N;assert.equal(derive(g).status,'held');}
 const foreign=clone(f);foreign.nDisplay.provenance[0].source_record.review_binding_sha256='d'.repeat(64);assert.equal(derive(foreign).status,'held');
 const wrongModel=clone(f);wrongModel.nDisplay.provenance[0].source_record.model_id='other';assert.equal(derive(wrongModel).status,'held');
 const incomplete=clone(f);incomplete.nDisplay.values.push({fact:null});assert.equal(derive(incomplete).status,'held');
});
test('normal quantile is stable in the lower tail, and impossible floating intervals hold',()=>{
 close(wald.normalQuantile(.025),-1.959963984540054);close(wald.normalQuantile(.975),1.959963984540054);close(wald.normalQuantile(.5),0);close(wald.normalQuantile(1e-12),-7.034483825301132);
 assert.equal(derive(fixture({p:1e-300})).status,'derived');assert.equal(derive(fixture({p:Number.MIN_VALUE})).status,'held');
});
test('current four article fixtures do not turn p-only/interaction/cited results into missing CIs',()=>{
 const base=path.join(__dirname,'../../data/proposed_changes/labels_trials_wald_20261106');let checked=0;
 for(const name of fs.readdirSync(base).filter(n=>/^PUBLIC_(STUDIES|ARTICLES)_FOUR_CASES_.*json$/.test(n))){const x=JSON.parse(fs.readFileSync(path.join(base,name),'utf8'));for(const a of x.studies||x.articles||[]){const rows=a.quantitative_results||a.details.quantitative_results;for(const row of rows){const before=JSON.stringify(row),out=wald.derive(row,{evidenceRegistry:x.evidence_registry});assert.notEqual(out.status,'derived');assert.equal(JSON.stringify(row),before);checked++;}}}
 assert.equal(checked,128);
});
test('source-backed automatic derivation reaches the table and CSV without mutating scientific input',()=>{
 const charts=require('../dist/app.js'),f=fixture();const s={report_id:f.row.report_id,pmid:'123',title:'Melanoma trial',year:2026,default_visible:true,current_main_eligible:true,
  comparisons:[{comparison_id:'C',kind:'treatment_comparison',comparator_label:'Nivolumab',intervention_label:'Ipilimumab',comparison_filter_eligible:true,comparator_filter_eligible:true,result_ids:['R']}],
  details:{quantitative_results:[{...f.row,analysis_n:clone(f.nDisplay.values[0].fact)}],sample_size_records:[]}};
 const before=JSON.stringify(s),matches=charts.filterStudies([s],{evidence_registry:f.evidenceRegistry}),data=charts.studyTableData(matches[0],{registry:f.evidenceRegistry});
 assert.equal(data.entries[0].derived_interval.status,'derived');assert.match(data.entries[0].effect,/derived 95% Wald CI/);assert.match(charts.studyTableCSV(matches,{registry:f.evidenceRegistry}),/derived 95% Wald CI/);assert.equal(JSON.stringify(s),before);
});
