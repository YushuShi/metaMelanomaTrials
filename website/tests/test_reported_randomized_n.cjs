const test=require('node:test'),assert=require('node:assert/strict');
const display=require('../dist/evidence_display.js');
const fs=require('node:fs'),path=require('node:path');
const identity={report_id:'report-'+'a'.repeat(24),reviewer:'Luna',source_input_sha256:'b'.repeat(64),review_binding_sha256:'c'.repeat(64)};
const prefix='CE-'+identity.review_binding_sha256.slice(0,24)+'-';
const number=n=>({status:'reported',value:n,raw_text:String(n),unit:'patients',qualifier:'equal',evidence_ids:['E']});
const missing={status:'not_reported',value:null,raw_text:null,unit:null,qualifier:'not_reported',evidence_ids:[]};
const row=(extra={})=>({...identity,measure:'HR',population_id:prefix+'P',population:{entity_id:'P',label:'Trial intention-to-treat population',parent_id:null},experimental_arm:{entity_id:'A'},comparator_arm:{entity_id:'B'},analysis_n:missing,denominator:missing,...extra});
const sample=(n,extra={})=>({...identity,sample_record_id:'N'+n,population_id:prefix+'P',population:{entity_id:'P'},arm_id:null,arm:null,sample_context_role:'randomized',quantity_label:'randomized patients',n:number(n),scope:'observed',evidence_ids:['E'],...extra});
test('canonical source-bound randomized total joins exact population without literal all-randomized wording',()=>{
 const r=row(),samples=[sample(157),sample(107,{arm_id:prefix+'A',arm:{entity_id:'A'}}),sample(50,{arm_id:prefix+'B',arm:{entity_id:'B'}})];
 const before=JSON.stringify([r,samples]),result=display.sampleSizeDisplay(r,{samples});
 assert.equal(result.text,'157');assert.equal(result.basis,'scoped_reported_randomized_total');assert.equal(JSON.stringify([r,samples]),before);
});
test('canonical namespace aliases preserve own-arm count and reject a foreign arm alias',()=>{
 const r=row({arm_id:prefix+'A',arm:{entity_id:'A'}}),own=sample(107,{arm_id:prefix+'A',arm:{entity_id:'A'}}),other=sample(50,{arm_id:prefix+'B',arm:{entity_id:'B'}});
 assert.equal(display.sampleSizeDisplay(r,{samples:[sample(157),own,other]}).text,'107');
 assert.equal(display.sampleSizeDisplay(r,{samples:[{...own,arm:{entity_id:'foreign'}}]}).text,'—');
});
test('canonical N fallback cannot cross reviewer, source, review artifact or population',()=>{
 for(const bad of [{reviewer:'Sol'},{source_input_sha256:'d'.repeat(64)},{review_binding_sha256:'e'.repeat(64)},{population_id:prefix+'other',population:{entity_id:'other'}}])assert.equal(display.sampleSizeDisplay(row(),{samples:[sample(157,bad)]}).text,'—');
 assert.equal(display.sampleSizeDisplay(row({analysis_n:number(138)}),{samples:[sample(140)]}).text,'138');
 assert.equal(display.sampleSizeDisplay(row(),{samples:[sample(107,{arm_id:prefix+'A',arm:{entity_id:'A'}}),sample(50,{arm_id:prefix+'B',arm:{entity_id:'B'}})]}).text,'107 / 50');
});
test('reported randomized study total stays separate from explicit analysis N and is never summed',()=>{
 const r=row({analysis_n:number(138)}),samples=[sample(140),sample(70,{arm_id:prefix+'A',arm:{entity_id:'A'}}),sample(70,{arm_id:prefix+'B',arm:{entity_id:'B'}})];
 assert.equal(display.sampleSizeDisplay(r,{samples}).text,'138');
 const total=display.reportedRandomizedTotal(r,{samples});assert.equal(total.text,'140');assert.equal(total.basis,'scoped_reported_randomized_total');
 assert.equal(display.reportedRandomizedTotal(r,{samples:samples.slice(1)}).text,'—');
 assert.equal(display.reportedRandomizedTotal(row({arm_id:prefix+'A',arm:{entity_id:'A'}}),{samples}).text,'—');
 assert.equal(display.reportedRandomizedTotal(r,{samples:[sample(140,{sample_context_role:'treated'})]}).text,'—');
});
test('canonical source quote without a section locator stays explicit and is not discarded',()=>{
 const quote={source_id:'source',block_id:'results',supporting_quote:'157 patients were randomized.'};
 const result=display.sampleSizeDisplay(row(),{samples:[sample(157)],evidenceRegistry:{E:quote}});
 assert.deepEqual(result.sources,[{...quote,locator:null}]);
 assert.deepEqual(result.values[0].fact,number(157));
});
test('exact population does not let a three-arm trial total replace a two-arm contrast',()=>{
 const r=row({contrast_type:'treatment_comparison',comparison_arms:[{entity_id:'A'},{entity_id:'B'},{entity_id:'C'}]});
 const samples=[sample(855),sample(285,{arm_id:prefix+'A',arm:{entity_id:'A'}}),sample(286,{arm_id:prefix+'B',arm:{entity_id:'B'}}),sample(284,{arm_id:prefix+'C',arm:{entity_id:'C'}})];
 assert.equal(display.sampleSizeDisplay(r,{samples}).text,'285 / 286');
 assert.equal(display.reportedRandomizedTotal(r,{samples}).text,'—');
});
test('actual21256809 two-arm OS/RFS contrasts retain only their reported arm counts, never global855',()=>{
 const base=path.join(__dirname,'../../data/proposed_changes/sample_sizes_survival_20261105'),name=fs.readdirSync(base).find(n=>n.startsWith('PMID21256809_THREE_ARM_SOURCE_CASE_')&&n.endsWith('.json'));
 const bundle=JSON.parse(fs.readFileSync(path.join(base,name),'utf8')),study=bundle.studies[0],before=JSON.stringify(study),samples=study.details.sample_size_records;
 const expected={'NEW-R-c7588f7a19dc932903193382':'285 / 284','NEW-R-07efb08078e222794397dec0':'286 / 284','NEW-R-e22190c07618d30e696ef203':'285 / 284','NEW-R-9cae7b9f7844da193e2edaa7':'286 / 284'};
 for(const [id,N]of Object.entries(expected)){const r=study.details.quantitative_results.find(r=>r.result_id===id),options={samples,evidenceRegistry:bundle.evidence_registry};assert.equal(display.sampleSizeDisplay(r,options).text,N);assert.equal(display.reportedRandomizedTotal(r,options).text,'—');}
 assert.equal(JSON.stringify(study),before);
});
function actual(kind){const base=path.join(__dirname,'../../data/proposed_changes/sample_sizes_survival_20261105'),name=fs.readdirSync(base).find(n=>n.startsWith('PUBLIC_'+kind+'_TWO_CASES_')&&n.endsWith('.json'));return JSON.parse(fs.readFileSync(path.join(base,name),'utf8'));}
test('actual42223134 three comparative HRs use explicit157 without changing any original value or missing CI',()=>{
 const bundle=actual('STUDIES'),study=bundle.studies[0],rows=study.details.quantitative_results,samples=study.details.sample_size_records,before=JSON.stringify(study);
 const effects=rows.filter(r=>/^(HR|hazard ratio)$/i.test(r.measure));assert.equal(effects.length,3);
 for(const r of effects){const result=display.sampleSizeDisplay(r,{samples,evidenceRegistry:bundle.evidence_registry});assert.equal(result.text,'157');assert.equal(result.basis,'scoped_reported_randomized_total');assert.equal(result.sources.length,1);}
 assert.equal(JSON.stringify(study),before);
});
test('actual27269740 uses explicit140randomized fallback, never computes138 from68+70',()=>{
 const bundle=actual('ARTICLES'),study=bundle.articles[0],samples=study.sample_size_records,r=study.quantitative_results.find(r=>/^(HR|hazard ratio)$/i.test(r.measure)),before=JSON.stringify(study);
 const result=display.sampleSizeDisplay(r,{samples,evidenceRegistry:bundle.evidence_registry});assert.equal(result.text,'140');assert.equal(result.basis,'scoped_reported_randomized_total');
 assert(!samples.some(s=>s.n.value===138));
 assert.equal(display.sampleSizeDisplay({...r,analysis_n:number(137)},{samples}).text,'137');
 const arm=samples.find(s=>s.sample_context_role==='randomized'&&s.arm_id),third={...arm,sample_record_id:'third',arm_id:'third',arm:{entity_id:'third',label:'Third treatment'},original_fact:{...arm.original_fact,arm_id:'third'},n:number(20)};
 assert.equal(display.sampleSizeDisplay(r,{samples:[...samples,third],evidenceRegistry:bundle.evidence_registry}).text,'—');
 assert.equal(JSON.stringify(study),before);
});
test('different population bridge needs a full comparative scope and the exact assigned group evidence',()=>{
 const bundle=actual('STUDIES'),study=bundle.studies[0],r=study.details.quantitative_results.find(r=>r.measure==='HR'),samples=study.details.sample_size_records;
 const options={samples,evidenceRegistry:bundle.evidence_registry};assert.equal(display.sampleSizeDisplay(r,options).text,'157');
 const subgroup={...r,population:{...r.population,parent_population_id:'parent',description:{text:'Cohort2 PD-L1-positive subgroup'}}};
 assert.equal(display.sampleSizeDisplay(subgroup,options).text,'—');
 for(const description of ['BRAF V600-positive patients','Women with resected melanoma','Patients aged65years or older']){
   const restricted={...r,population:{...r.population,description:{...r.population.description,text:description}}};
   assert.equal(display.sampleSizeDisplay(restricted,{samples,evidenceRegistry:bundle.evidence_registry}).text,'—');
 }
 assert.equal(display.sampleSizeDisplay(r,{...options,samples:samples.filter(s=>s.n.value!==107)}).text,'—');
 const third={...samples.find(s=>s.arm_id),sample_record_id:'third',arm_id:'third',arm:{arm_id:'third'},n:number(20),original_fact:{scope:'observed',arm_id:'third',population_id:'P2'}};
 assert.equal(display.sampleSizeDisplay(r,{...options,samples:[...samples,third]}).text,'—');
 const wrongEvidence=samples.map(s=>({...s,evidence_ids:['other'],n:{...s.n,evidence_ids:['other']},population:{...s.population,description:{text:'Randomized patients',evidence_ids:['other']}},arm:s.arm?{arm_id:s.arm_id}:null,original_fact:{...s.original_fact,evidence_ids:['other']}}));
 assert.equal(display.sampleSizeDisplay(r,{...options,samples:wrongEvidence}).text,'—');
 const wrongModel=samples.map(s=>({...s,model_id:'foreign-model'}));assert.equal(display.sampleSizeDisplay(r,{...options,samples:wrongModel}).text,'—');
 const wrongCutoff=samples.map(s=>({...s,cutoff_id:'foreign-cutoff'}));assert.equal(display.sampleSizeDisplay(r,{...options,samples:wrongCutoff}).text,'—');
 assert.equal(display.sampleSizeDisplay(r,{...options,samples:samples.map(s=>({...s,main_result_eligible:false}))}).text,'—');
 const canonical=actual('ARTICLES'),trial=canonical.articles[0],effect=trial.quantitative_results.find(r=>r.measure==='HR');
 for(const suffix of ['women only','BRAF V600-positive patients','patients aged65years or older','LDH-high']){
   const restricted={...effect,population:{...effect.population,label:'As-treated analysis population: '+suffix}};
   assert.equal(display.sampleSizeDisplay(restricted,{samples:trial.sample_size_records,evidenceRegistry:canonical.evidence_registry}).text,'—');
 }
});
