'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js');
const fs=require('node:fs'),vm=require('node:vm');
const number=(value,unit='ratio')=>({status:'reported',value,raw_text:String(value),unit,qualifier:'equal',evidence_ids:['E1']});
function study(id=1){
  const comparison_id='C'+id,result_id='R'+id;
  return {report_id:'report-'+String(id).padStart(24,'0'),pmid:String(id),title:'Melanoma study '+id,author_display:'Author et al.',year:2000+id,default_visible:true,current_main_eligible:true,
    comparisons:[{comparison_id,kind:'treatment_comparison',comparator_label:'Nivolumab',intervention_label:'Ipilimumab',comparison_filter_eligible:true,comparator_filter_eligible:true,result_ids:[result_id]}],
    details:{quantitative_results:[{result_id,comparison_id,main_result_eligible:true,pooling_eligible:false,endpoint:{family:'overall_survival'},measure:'HR',estimate:number(.8),ci_lower:number(.6),ci_upper:number(1.1),confidence_level:number(95,'%'),analysis_n:number(17,'patients')}],sample_size_records:[]}};
}
function parseCSV(csv){
  const rows=[],row=[];let value='',quoted=false;
  for(let i=csv.startsWith('\uFEFF')?1:0;i<csv.length;i++){
    const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(value);value='';}
    else if(c==='\r'&&!quoted&&csv[i+1]==='\n'){row.push(value);rows.push([...row]);row.length=0;value='';i++;}
    else value+=c;
  }
  assert.equal(quoted,false);return rows;
}
test('separate sample-size and effect/CI fields preserve the reported values without default CI invention',()=>{
  const s=study(),before=JSON.stringify(s),match=charts.filterStudies([s])[0],data=charts.studyTableData(match);
  assert.equal(data.entries[0].sample_size,'17');assert.equal(data.entries[0].effect,'0.8 (0.6–1.1)');
  assert.doesNotMatch(data.entries[0].effect,/N |95/);assert.equal(JSON.stringify(s),before);
  const row=s.details.quantitative_results[0];row.ci_lower=null;row.ci_upper=null;
  assert.equal(charts.studyTableData(charts.filterStudies([s])[0]).entries[0].effect,'0.8');
  row.ci_lower=number(.5);row.ci_upper=number(1.2);row.confidence_level=number(90,'%');
  assert.match(charts.tableValue(row),/^0.8 \(.+; approximate 95% CI, converted\)$/);
  assert.match(charts.studyTableCSV(charts.filterStudies([s])),/approximate 95% CI, converted/);
  assert.equal(row.ci_lower.value,.5);assert.equal(row.ci_upper.value,1.2);assert.equal(row.confidence_level.value,90);
});
test('randomized participants remain the scoped fallback and zero remains a real sample size',()=>{
  const s=study(),r=s.details.quantitative_results[0];
  const identity={report_id:s.report_id,reviewer:'Sol',source_input_sha256:'a',draft_artifact_sha256:'b'};
  Object.assign(r,identity,{analysis_n:null,population_id:'P',population:{description:'All randomized trial participants'}});
  s.details.sample_size_records=[{...identity,population_id:'P',quantity_label:'Randomized total',denominator_type:'randomized',n:number(30,'patients')}];
  assert.equal(charts.studyTableData(charts.filterStudies([s])[0]).entries[0].sample_size,'30');
  r.analysis_n=number(0,'patients');assert.equal(charts.studyTableData(charts.filterStudies([s])[0]).entries[0].sample_size,'0');
});
test('unsupported non95 intervals show the estimate and unavailable 95% CI in the main table and CSV while source bounds remain intact',()=>{
  const s=study(),row=s.details.quantitative_results[0];row.confidence_level=number(90,'%');row.ci_method='exact conditional';
  const before=JSON.stringify(row),matches=charts.filterStudies([s]);
  assert.equal(charts.tableValue(row),'0.8 (95% CI unavailable)');
  const exported=parseCSV(charts.studyTableCSV(matches));assert.equal(exported[1][11],'OS · HR: 0.8 (95% CI unavailable)');
  assert.doesNotMatch(exported[1][11],/0.6–1.1|90/);assert.equal(JSON.stringify(row),before);
  assert.equal(charts.tableValue({...row,measure:'median',ci_method:null}),'0.8 (95% CI unavailable)');
});
test('a population-bound melanoma count survives unrelated mixed-cancer context through filtering and CSV',()=>{
  const s=study(),registry={POP:{supporting_quote:'The study enrolled 30 patients with melanoma.'}};
  s.title='Melanoma or NSCLC treatment study';s.details.quantitative_results=[];
  s.comparisons[0].result_ids=[];s.comparisons[0].scope={report_id:s.report_id,population_id:'P'};
  s.details.sample_size_records=[{report_id:s.report_id,population_id:'P',quantity_label:'Randomized total',sample_context_role:'randomized',
    population:{population_id:'P',description:{text:'All randomized participants',evidence_ids:['POP']}},n:{...number(30,'patients'),evidence_ids:['POP']}}];
  const before=JSON.stringify(s),selection={evidence_registry:registry};
  const matches=charts.filterStudies([s],selection);assert.equal(matches.length,1);
  assert.equal(charts.constrainStudyChoices([s],selection).comparisons.length,1);
  const rows=parseCSV(charts.studyTableCSV(matches,{registry}));assert.equal(rows[1][10],'30');assert.equal(rows[1][11],'Details');
  assert.equal(JSON.stringify(s),before);
  const pooled={POP:{supporting_quote:'The study enrolled patients with melanoma or NSCLC.'}};
  const held=charts.filterStudies([s],{evidence_registry:pooled});assert.equal(held[0].comparisons.length,0);
  assert.equal(charts.studyTableData(held[0],{registry:pooled}).counts.length,0);
});
test('CSV contains every visible study and all its known-N outcomes beyond page or cell previews',()=>{
  const studies=Array.from({length:13},(_,i)=>study(i+1)),s=studies[0];
  for(let i=2;i<=5;i++){const row=structuredClone(s.details.quantitative_results[0]);row.result_id='extra'+i;row.estimate=number((70+i)/100);s.details.quantitative_results.push(row);s.comparisons[0].result_ids.push(row.result_id);}
  const unknownStudy=study(14);unknownStudy.details.quantitative_results[0].analysis_n=null;studies.push(unknownStudy);
  const unknownOutcome=structuredClone(s.details.quantitative_results[0]);unknownOutcome.result_id='unknownN';unknownOutcome.analysis_n=null;unknownOutcome.estimate=number(.99);s.details.quantitative_results.push(unknownOutcome);s.comparisons[0].result_ids.push(unknownOutcome.result_id);
  const matches=charts.sortStudyRows(charts.filterStudies(studies,{endpoint:'overall_survival',measure:'HR'}),'year','desc');
  const rows=parseCSV(charts.studyTableCSV(matches));assert.equal(rows.length,14);assert.equal(rows[1][3],'13');assert.equal(rows.at(-1)[3],'1');
  assert.deepEqual(rows[0],['Study','First author','Year','PMID','Trial name','NCT number','Group','Comparator','Intervention','Result','Sample size','Effect size (CI)']);
  assert.equal(rows[1][10],'17');assert.equal(rows[1][11],'OS · HR: 0.8 (0.6–1.1)');
  assert.equal((rows.at(-1)[11].match(/OS · HR:/g)||[]).length,5);for(const estimate of ['0.8','0.72','0.73','0.74','0.75'])assert(rows.at(-1)[11].includes(`OS · HR: ${estimate} (0.6–1.1)`));
  assert(!rows.some(row=>row[3]==='14'));assert.doesNotMatch(rows.at(-1)[11],/0\.99/);assert(matches.some(match=>match.study.pmid==='14'));assert(charts.studyTableData(matches.at(-1)).entries.some(entry=>entry.result.result_id==='unknownN'&&entry.sample_size==='NA'));
  assert.equal(charts.studyTableData(matches.at(-1),{limit:3}).entries.length,3);
  assert.equal(parseCSV(charts.studyTableCSV(charts.filterStudies(studies,{endpoint:'response'}))).length,1);
});
test('CSV quotes literal commas/newlines/quotes and neutralizes formula-like source text',()=>{
  const s=study();s.title='=HYPERLINK("x"),\nquoted study';s.author_display='O\'Brien et al.';
  const rows=parseCSV(charts.studyTableCSV(charts.filterStudies([s])));
  assert.equal(rows[1][0],"'"+s.title);assert.equal(rows[1][1],s.author_display);
  assert.equal(rows[1].length,rows[0].length);
});
test('CSV never exchanges sample sizes or numerical records between comparison rows',()=>{
  const s=study(),r=structuredClone(s.details.quantitative_results[0]);r.result_id='R2';r.comparison_id='C2';r.analysis_n=number(42,'patients');r.estimate=number(.4);
  s.comparisons.push({...s.comparisons[0],comparison_id:'C2',comparator_label:'Pembrolizumab',intervention_label:'Dacarbazine',result_ids:['R2']});s.details.quantitative_results.push(r);
  const before=JSON.stringify(s),rows=parseCSV(charts.studyTableCSV(charts.filterStudies([s])));
  assert.deepEqual(rows.slice(1).map(row=>[row[7],row[10],row[11]]),[['Nivolumab','17','OS · HR: 0.8 (0.6–1.1)'],['Pembrolizumab','42','OS · HR: 0.4 (0.6–1.1)']]);
  assert.equal(JSON.stringify(s),before);
});
test('download button creates a CSV file from every filtered page in the current sort order',async()=>{
  const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),start=source.indexOf('  function downloadStudyTable('),end=source.indexOf('\n  function ',start+10);
  let blob,downloaded,removed=false,revoked=false;
  const link={click(){downloaded=this.download;},remove(){removed=true;}};
  const context=vm.createContext({charts,Blob,state:{scopedStudies:Array.from({length:12},(_,i)=>study(i+1)),scopedPage:2,scopedSort:'year',scopedOrder:'desc',drugLabels:new Map()},
    mainSelection:()=>({endpoint:'overall_survival',measure:'HR'}),URL:{createObjectURL(value){blob=value;return 'blob:local-table';},revokeObjectURL(value){assert.equal(value,'blob:local-table');revoked=true;}},
    document:{createElement(tag){assert.equal(tag,'a');return link;},body:{appendChild(value){assert.equal(value,link);}}},setTimeout:fn=>fn()});
  context.advancedEvidence=()=>({matches:charts.filterStudies(context.state.scopedStudies,context.mainSelection())});
  vm.runInContext(source.slice(start,end),context);context.downloadStudyTable();
  assert.equal(downloaded,'metaMelanomaTrials-studies.csv');assert(removed&&revoked);assert.equal(blob.type,'text/csv;charset=utf-8;');
  const rows=parseCSV(await blob.text());assert.equal(rows.length,13);assert.equal(rows[1][3],'12');assert.equal(rows.at(-1)[3],'1');
});
test('melanoma-only CSV hides missing-N outcomes and retains descriptive labels when outcome N is explicit',()=>{
  const path=require('node:path');
  const study=JSON.parse(fs.readFileSync(path.join(__dirname,'../../data/proposed_changes/study_table_regimens_20261105/PMID41768125_baseline.json'),'utf8'));
  const before=JSON.stringify(study),matches=charts.filterStudies([study]),csv=charts.studyTableCSV(matches),rows=parseCSV(csv);
  assert.equal(matches[0].results.length,4);assert(rows.slice(1).every(row=>row[11]==='Details'));assert(rows.some(row=>row[10]==='23'&&row[11]==='Details'));
  assert(charts.studyTableData(matches[0]).entries.every(row=>row.sample_size==='NA'));assert.equal(JSON.stringify(study),before);
  // The clone supplies explicit synthetic outcome Ns solely to test CSV scope
  // and labels. The original report's missing denominators remain unchanged.
  const synthetic=structuredClone(study),melanomaIds=new Set(matches[0].results.map(row=>row.result_id));
  for(const row of synthetic.details.quantitative_results)if(melanomaIds.has(row.result_id))row.analysis_n=number(23,'patients');
  const knownCSV=charts.studyTableCSV(charts.filterStudies([synthetic])),effects=parseCSV(knownCSV).slice(1).filter(row=>row[11]!=='Details');
  assert.equal(effects.length,1);
  assert(effects.some(row=>/2\.9/.test(row[11])&&/1\.2.*4\.3/.test(row[11])));
  assert(effects.some(row=>/1\.4/.test(row[11])&&/1.*2/.test(row[11])));
  assert(effects.some(row=>/clinical benefit rate/i.test(row[9])&&/9\.1.*0.*21\.1/.test(row[11])));
  assert(effects.some(row=>/Volumetric decrease/i.test(row[9])&&/18\.8/.test(row[11])));
  assert(effects.every(row=>row[10]==='23'));
  for(const output of [csv,knownCSV])assert.doesNotMatch(output,/NSCLC|22\.7|26\.1|7\.1|"51"|"28"|ORR/);
  assert.equal(JSON.stringify(study),before);
});

test('paired arm Ns export beside drug names without inventing a missing total',()=>{
 const d=require('./fixtures/concise_ui.cjs').prepared(),{match,groups}=d.display('42013417'),original=groups[0],before=JSON.stringify(match.study);
 const group={...original,total_n:undefined,context_counts:original.context_counts.filter(sample=>sample.quantitative_record.arm_id!=='NA')};
 const view=charts.studyTablePresentation({...match,...group},{registry:d.registry});assert.deepEqual(view.samples,[]);assert(charts.hasPairedArmCounts(group));
 const rows=parseCSV(charts.studyTableCSV([{...match,presentation_rows:[group]}],{registry:d.registry}));assert.equal(rows.length,2);
 assert.equal(rows[1][7],'Ipilimumab (N=21)');assert.equal(rows[1][8],"'+ Nivolumab (N=65)");assert.equal(rows[1][10],'Comparator: 21; Intervention: 65');assert.equal(rows[1][11],'Details');assert.doesNotMatch(rows[1][10],/86|Total/);assert.equal(JSON.stringify(match.study),before);
});
