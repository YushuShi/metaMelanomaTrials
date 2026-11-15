'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const compact=require('../dist/quantitative_extraction.js'),charts=require('../dist/app.js'),regimens=require('../dist/regimen_definitions.js');
const sha='103f26200bec43220fd426583b8dbf55906833c409b6199f571f3ca0b3d60d3e';
const bytes=fs.readFileSync(path.join(__dirname,'../../data/current/reextraction/melanoma-quantitative-r3-20261108/publications',sha+'.json'));
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),sha);
const merged=compact.merge([],{},JSON.parse(bytes)),registry=merged.evidence_registry;
const original=regimens.prepareStudies(merged.studies).find(study=>study.pmid==='29327059');
function prepared(){const study=structuredClone(original),match=charts.filterStudies([study],{evidence_registry:registry})[0];return {study,match};}
function groups(d){return charts.studyTablePresentationRows(d.match,{registry});}
function contexts(d){return groups(d).filter(group=>group.context_counts);}
function view(d,group){return charts.studyTablePresentation({...d.match,...group},{registry,presentation_cutoff:group.presentation_cutoff});}

test('melanoma cohort counts appear once in separate context, without inventing exact Cox Ns',()=>{
 const d=prepared(),before=JSON.stringify(d),rows=groups(d),context=rows.find(row=>row.context_counts);
 assert.equal(rows.length,1);assert.equal(contexts(d).length,1);
 assert.deepEqual(view(d,context).samples.map(row=>row.sample_size),['145','72','73']);
 assert.equal(view(d,context).samples[0].label,'Total');
 assert.match(view(d,context).context,/Study participants.*brain metastases/);
 assert.doesNotMatch(view(d,context).context,/Melanoma|2001-2015|Cutoff/i);
 // The accepted Cox results retain missing exact Ns. Hiding their main-table
 // subrows must not assign the broader participant counts to those models.
 assert.equal(d.match.results.length,3);
 assert(d.match.results.every(row=>row.scoped_sample_size.n==='NA'&&row.quantitative_record.display_n.n==='NA'));
 assert.equal(rows.filter(row=>!row.context_counts).length,0);
 const csv=charts.studyTableCSV([d.match],{registry}),lines=csv.trim().split('\r\n');
 assert.equal(lines.length,2);assert(lines[1].includes(','+JSON.stringify(view(d,context).group)+','));assert.doesNotMatch(csv,/Study participants/);
 for(const n of ['145','72','73'])assert.equal((lines[1].match(new RegExp('\\b'+n+'\\b','g'))||[]).length,1);
 assert.match(lines[1],/"Total: 145; ipilimumab OR pembrolizumab OR nivolumab: 72; No immunotherapy: 73","Details"$/);
 assert.doesNotMatch(csv,/2001-2015|Cutoff/);
 assert(!lines.some(line=>/,(?:"480"|"115"|"365"),/.test(line)));
 assert.equal(JSON.stringify(d),before);
});

test('already displayed outcome N suppresses redundant participant context',()=>{
 const d=prepared();
 for(const row of d.match.results){row.scoped_sample_size={n:145,status:'reported'};row.quantitative_record.display_n={n:145,status:'reported',count_ids:['ss-mel-total'],count_purpose:'outcome_analysis'};}
 assert.equal(contexts(d).length,0);assert.equal(charts.studyTableCSV([d.match],{registry}).trim().split('\r\n').length,4);
});

test('held, incomplete, result-bound, and mismatched-cutoff counts cannot become cohort fallback',()=>{
 for(const change of [q=>q.field_flags=[{code:'CONFLICTING_n'}],q=>q.complete='no',q=>q.result_id='unproven-model',q=>q.cutoff='2025']){
  const d=prepared();for(const sample of d.study.details.sample_size_records)change(sample.quantitative_record);
  assert.equal(contexts(d).length,0);
 }
});

test('selected intervention cannot inherit the broader immunotherapy-arm count',()=>{
 const d=prepared(),result=d.match.results.find(row=>row.quantitative_record.intervention_arm_id==='arm-mel-ipi'),co=d.match.comparisons.find(co=>co.comparison_id===result?.comparison_id);
 assert(co);d.match.comparisons=[co];d.match.results=d.match.results.filter(row=>row.comparison_id===co.comparison_id);
 assert.deepEqual(contexts(d)[0].context_counts.map(sample=>sample.n.value),[145,73]);
 assert(groups(d).every(group=>group.context_counts),'The HR with missing exact N stays out of the main table');
 assert(d.match.results.every(row=>row.scoped_sample_size.n==='NA'&&row.quantitative_record.display_n.n==='NA'));
 assert.deepEqual(view(d,contexts(d)[0]).samples.map(sample=>sample.sample_size),['145','73']);
 assert.doesNotMatch(charts.studyTableCSV([d.match],{registry}),/\b72\b/);
});

test('analysis count takes priority over randomized count for the same population while preserving raw counts',()=>{
 const d=prepared(),copy=structuredClone(d.study.details.sample_size_records.find(sample=>sample.quantitative_record.id==='ss-mel-total'));
 copy.quantitative_record={...copy.quantitative_record,id:'randomized-context',count_purpose:'randomized',n:144};copy.n={...copy.n,value:144,raw_text:'144'};copy.quantity_label='randomized';copy.sample_context_role='randomized';
 d.study.details.sample_size_records.push(copy);
 const shown=view(d,contexts(d)[0]).samples;
 assert(shown.some(row=>row.sample_size==='145'&&row.label==='Total'));
 assert(!shown.some(row=>row.sample_size==='144'));assert(d.study.details.sample_size_records.some(row=>row.quantitative_record.id==='randomized-context'&&row.n.value===144));
});

test('known different cutoffs remain separate participant contexts',()=>{
 const d=prepared(),copy=structuredClone(d.study.details.sample_size_records.find(sample=>sample.quantitative_record.id==='ss-mel-total'));
 copy.quantitative_record={...copy.quantitative_record,id:'later-context',cutoff:'2020',n:130};copy.n={...copy.n,value:130,raw_text:'130'};d.study.details.sample_size_records.push(copy);
 const outcome=structuredClone(d.match.results[0]);outcome.result_id+='-later';outcome.quantitative_record.cutoff='2020';d.match.results.push(outcome);
 const rows=contexts(d);assert.equal(rows.length,2);
 assert.deepEqual(rows.map(row=>row.context_counts.map(sample=>sample.n.value)),[[145,72,73],[130]]);
 assert.deepEqual(rows.map(row=>row.context_counts[0].quantitative_record.cutoff),['2001-2015','2020']);
 assert(rows.every(row=>!/(?:2001-2015|2020|Cutoff)/.test(view(d,row).context)));
 assert.equal(charts.studyTableCSV([d.match],{registry}).trim().split('\r\n').length,3,'Distinct known-cutoff contexts retain separate CSV rows');
 assert.doesNotMatch(charts.studyTableCSV([d.match],{registry}),/2001-2015|2020|Cutoff/);
});
