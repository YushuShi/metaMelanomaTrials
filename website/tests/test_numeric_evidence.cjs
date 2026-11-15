const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'website/dist');
const overlay=require(base+'/numeric_evidence_display.js'),release=require(base+'/numeric_evidence_release.js');
const charts=require(base+'/app.js'),counts=require(base+'/evidence_display.js');
const raw=JSON.parse(fs.readFileSync(base+'/data/studies.json','utf8'));
const before=JSON.stringify(raw.studies.filter(s=>release.target_reports.includes(s.report_id)));
const studies=charts.scopedStudies(raw),study=studies.find(s=>s.pmid==='29723355');
const clinical=charts.studyResults(study).filter(charts.mainResultEligible).filter(r=>/^R3V6/.test(r.result_id));
function changed(pmid,change){return {...raw,studies:raw.studies.map(s=>s.pmid===pmid?change(s):s)};}
test('finite15 raw additions yield only six clinical facts and nine wrappers',()=>{
 assert.equal(studies.length,821);assert.equal(clinical.length,6);assert.equal(clinical.reduce((n,r)=>n+r.reported_numbers.length,0),9);
 assert.equal(JSON.stringify(raw.studies.filter(s=>release.target_reports.includes(s.report_id))),before);
});
test('CR PR and no response remain categories, not ORR; Five renders Arabic5',()=>{
 assert.deepEqual(clinical.slice(0,3).map(r=>overlay.label(r)),['Complete response (CR)','Partial response (PR)','No response']);
 assert(clinical.every(r=>charts.displayMeasure(r)!=='ORR'));
 const row=clinical.find(r=>r.main_display_label==='No response');assert.equal(charts.reportedNumber(row.reported_numbers[0]),'5');
 assert.equal(row.raw_source_record.reported_numbers[0].raw_text,'Five');
});
test('the dose descriptor stays raw/details and never becomes a risk or N',()=>{
 const row=clinical.find(r=>r.main_display_label.includes('concentration reduction'));
 assert.deepEqual(row.reported_numbers.map(n=>[n.role,n.value]),[['numerator',3]]);
 assert(row.raw_source_record.reported_numbers.some(n=>n.role==='dose'&&n.value===.0025));
 assert.equal(row.analysis_n.value,null);assert.equal(row.denominator.value,null);
});
test('existing N16 stays separately treated; no endpoint denominator or safety count sum',()=>{
 assert.equal(study.numeric_completion_v6_treated_context.value,16);assert.equal(study.numeric_completion_v6_treated_context.role,'treated');
 assert.equal(study.numeric_completion_v6_treated_context.may_fill_denominator,false);
 for(const row of clinical){assert.equal(counts.sampleSizeDisplay(row,{samples:study.details.sample_size_records,evidenceRegistry:raw.evidence_registry}).text,'—');assert.equal(row.analysis_n.value,null);}
});
test('source-linked earlier percentages are retained raw but appear once clinically',()=>{
 for(const link of study.details.v6_confirmed_source_finding_links){
  const old=study.details.quantitative_results.find(r=>r.result_id===link.member_result_ids[0]);
  assert.equal(old.main_result_eligible,false);assert.equal(old.raw_source_record.main_result_eligible,true);
 }
 assert.equal(study.details.v6_confirmed_source_finding_links.length,3);
});
test('old drafts stay held even after article eligibility; statistical Ns remain context only',()=>{
 for(const s of studies.filter(s=>release.target_reports.includes(s.report_id))){
  assert(s.details.quantitative_results.filter(r=>r.raw_source_record?.API_verification_pending===true).every(r=>r.main_result_eligible===false));
  assert(s.details.sample_size_records.filter(r=>release.new_sample_ids.includes(r.sample_record_id)).every(r=>r.main_result_eligible===false));
 }
});
test('unlisted row promotion, altered source wrappers and foreign continuation fail closed',()=>{
 const pmid='10732751',original=raw.studies.find(s=>s.pmid===pmid),id=original.details.quantitative_results[0].result_id;
 const bad={...raw,numeric_completion_v6_display_overlay:{...raw.numeric_completion_v6_display_overlay,by_PMID:{...raw.numeric_completion_v6_display_overlay.by_PMID,[pmid]:{...raw.numeric_completion_v6_display_overlay.by_PMID[pmid],allowed_result_ids:[id]}}}};
 assert.throws(()=>overlay.applyDataset(bad));
 const tampered=changed('29723355',s=>({...s,details:{...s.details,quantitative_results:s.details.quantitative_results.map(r=>r.result_id===clinical[0].result_id?{...r,reported_numbers:[{...r.reported_numbers[0],value:99},...r.reported_numbers.slice(1)]}:r)}}));
 assert.throws(()=>overlay.applyDataset(tampered));
 const foreign=changed('29723355',s=>({...s,details:{...s.details,quantitative_results:[...s.details.quantitative_results,{...s.details.quantitative_results.at(-1),result_id:'R3V6-R-foreign-continuation'}]}}));
 assert.throws(()=>overlay.applyDataset(foreign));
});
test('altered N16 and a fabricated clinical certificate fail closed',()=>{
 const wrong=changed('29723355',s=>({...s,details:{...s.details,sample_size_records:s.details.sample_size_records.map(r=>r.sample_record_id===release.existing_treated_context.sample_record_id?{...r,n:{...r.n,value:15}}:r)}}));
 assert.throws(()=>overlay.applyDataset(wrong));
 const pooled=changed('29723355',s=>({...s,details:{...s.details,quantitative_results:s.details.quantitative_results.map(r=>r.result_id===clinical[0].result_id?{...r,pooling_eligible:true}:r)}}));
 assert.throws(()=>overlay.applyDataset(pooled));
});
