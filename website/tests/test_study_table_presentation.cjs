'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const compact=require('../dist/quantitative_extraction.js'),charts=require('../dist/app.js'),regimens=require('../dist/regimen_definitions.js');
const payload=require('./fixtures/quantitative_pilot.cjs').readPilotSnapshot();
function study(pmid,p=payload){const merged=compact.merge([],{},p),studies=regimens.prepareStudies(merged.studies);return {study:studies.find(s=>s.pmid===pmid),registry:merged.evidence_registry};}
function display(pmid,p=payload,selection={}){const s=study(pmid,p),match=charts.filterStudies([s.study],{evidence_registry:s.registry,...selection})[0];return {...s,match,rows:charts.studyTablePresentationRows(match,{registry:s.registry}).map(group=>({...charts.studyTablePresentation({...match,...group},{registry:s.registry,phase_partition:group.phase_partition,presentation_cutoff:group.presentation_cutoff}),group}))};}
function parseCSV(csv){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&c===','){row.push(field);field='';}else if(!quoted&&(c==='\r'||c==='\n')){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}else field+=c;}assert.equal(quoted,false);if(row.length||field){row.push(field);rows.push(row);}return rows;}
test('overall N and proven phase partition appear once; missing-N ctDNA outcomes remain only in details',()=>{
 const before=JSON.stringify(payload),d=display('38844408');assert.equal(d.rows.length,1);
 const overall=d.rows[0];assert.deepEqual(overall.samples,[{label:'',sample_size:'146',breakdown:'Phase I 19; Phase II 127'}]);
 assert.deepEqual(overall.effects.map(({label,value})=>({label,value})),[{label:'Median OS',value:'17.400 (13.100–22.800) months'},{label:'OS',value:'12 mo: 62.000 %; 24 mo: 40.000 %; 36 mo: 23.000 %; 48 mo: 14.000 %'}]);
 const subgroup=charts.studyTableData(d.match,{registry:d.registry}).entries.filter(row=>row.label.includes('ctDNA clearance'));assert.equal(subgroup.length,3);assert(subgroup.every(row=>row.sample_size==='NA'));assert.deepEqual(subgroup.map(row=>row.effect),['100.000 %','73.000 %','45.000 %']);
 assert.doesNotMatch(JSON.stringify(d.rows.map(({effects,samples})=>({effects,samples}))),/20 µg|dose 1|dose 3/);
 assert.match(compact.render(d.study),/20 µg dose 1/);assert.match(compact.render(d.study),/ctDNA clearance/);assert.equal(JSON.stringify(payload),before);
});
test('CSV follows the concise known-N table and preserves all eligible timepoints and phase counts',()=>{
 const d=display('38844408'),csv=charts.studyTableCSV([d.match],{registry:d.registry});
 assert.equal(parseCSV(csv).length,2);
 for(const value of ['12 mo','24 mo','36 mo','48 mo','Phase I 19','Phase II 127'])assert(csv.includes(value),value);
 assert.doesNotMatch(csv,/ctDNA clearance/);assert.equal(parseCSV(csv)[1][10],'146 (Phase I 19; Phase II 127)');
 assert(charts.studyTableData(d.match,{registry:d.registry}).entries.some(row=>row.label.includes('ctDNA clearance')&&row.sample_size==='NA'));
});
test('phase aggregation refuses overlap, incomplete counts, mismatched purpose/cutoff, sum-only and arbitrary subgroups',()=>{
 const s=study('38844408').study;
 const alter=[r=>r.sample_sizes[1].disjoint='NA',r=>r.sample_sizes[1].complete='no',r=>r.sample_sizes[1].count_purpose='randomized',r=>r.sample_sizes[1].cutoff='2024-01-01',r=>r.sample_sizes[1].n=20,r=>r.populations[1].parent_id='unrelated',r=>r.populations[1].label='Responders',r=>r.sample_sizes.push({...r.sample_sizes[1],id:'conflicting-copy'})];
 for(const change of alter){const copy=structuredClone(s),r=compact.records(copy)[0];change(r);assert.deepEqual(compact.phasePartitions(copy),[]);}
 assert.deepEqual(compact.phasePartitions(study('29872552').study),[]);
});
test('phase child rows with outcomes remain visible and cannot be absorbed into a parent count',()=>{
 const d=display('38844408'),match=structuredClone(d.match),phase=match.comparisons.find(c=>c.scope.population_id.endsWith('-p_phase1'));
 const row=structuredClone(match.results[0]);row.result_id+='child';row.comparison_id=phase.comparison_id;row.quantitative_record.population_id='p_phase1';row.quantitative_record.arm_id='a_phase1';phase.result_ids.push(row.result_id);match.results.push(row);
 const groups=charts.studyTablePresentationRows(match,{registry:d.registry});assert(groups.some(group=>group.results.some(result=>result.result_id===row.result_id)));assert(groups.every(group=>!group.phase_partition));
 assert(groups.some(group=>group.comparisons.some(co=>co.scope.population_id.endsWith('-p_phase2'))));
});
test('true same-population dose groups retain distinct N and effect labels',()=>{
 const d=display('26115796',payload,{endpoint:'progression_free_survival',measure:'HR'}),row=d.rows[0];assert.deepEqual(row.samples.map(s=>s.sample_size),['359','360']);
 assert(row.samples.some(s=>s.label.includes('2 mg/kg')));assert(row.samples.some(s=>s.label.includes('10 mg/kg')));
 assert.deepEqual(row.effects.map(e=>e.value),['0.570 (0.450–0.730)','0.500 (0.390–0.640)']);
 const dose=display('20004617',payload,{endpoint:'response',measure:'RR',include_orr:true,orr_only:true}).rows[0];assert.deepEqual(dose.samples.map(s=>s.sample_size),['73','72','72']);
 for(const text of ['10 mg/kg','3 mg/kg','0.3 mg/kg'])assert(dose.samples.some(s=>s.label.includes(text)));
});
test('same cohort uses the latest supported cutoff while retaining both source scopes and estimates',()=>{
 const d=display('35367007',payload,{endpoint:'recurrence',measure:'HR'});assert.equal(d.rows.length,1);
 const members=d.rows[0].group.presentation_members;assert.equal(members.length,2);
 assert(members.some(member=>member.row.presentation_cutoff.includes('2020-12-04')));assert(members.some(member=>member.row.presentation_cutoff.includes('2021-06-21')));assert(d.rows.every(r=>!r.context.includes('Cutoff')));
 assert(d.rows.every(r=>r.samples.length===1&&r.samples[0].sample_size==='976'));
 const csv=charts.studyTableCSV([d.match],{registry:d.registry});assert.doesNotMatch(csv,/2020-12-04|2021-06-21|Cutoff/);assert.equal(parseCSV(csv).length,2);assert(!csv.includes('0.650 (0.460–0.920)'));assert(csv.includes('0.610 (0.450–0.820)'));
 const selection=d.rows[0].outcome_reconciliation.selections[0];assert.equal(selection.proof.kind,'latest_source_supported_analysis');assert.deepEqual(selection.alternatives.map(a=>a.value),['0.650 (0.460–0.920)','0.610 (0.450–0.820)']);
 const cutoffs=compact.records(d.study).flatMap(record=>record.effects.map(row=>row.cutoff));assert(cutoffs.includes('2020-12-04'));assert(cutoffs.includes('2021-06-21'));
});
test('analysis-specific and melanoma-specific N do not borrow randomized or mixed-cancer totals',()=>{
 const sequence=display('27269740',payload,{endpoint:'overall_survival',measure:'HR'});assert.equal(sequence.rows[0].samples[0].sample_size,'138');assert(!JSON.stringify(sequence.rows[0].samples).includes('140'));
 const melanoma=display('41768125');assert(melanoma.rows.every(r=>r.samples.every(s=>s.sample_size==='23')));
 const e1609=display('31880964',payload,{endpoint:'overall_survival',measure:'HR'});assert.equal(e1609.rows[0].samples[0].sample_size,'1051');assert(e1609.rows[0].effects[0].value.includes('approximate 95% CI, converted'));
});
test('equal compatible N shares one display line while missing conflicting Ns stay in raw details',()=>{
 const d=display('38844408'),match=structuredClone(d.match),rows=match.results.filter(r=>r.quantitative_record.population_id==='p_all');match.results=rows.slice(0,3);
 rows[1].quantitative_record.display_n.count_purpose='safety';rows[1].quantitative_record.display_n.count_ids=['safety-count'];
 rows[2].scoped_sample_size={n:'NA',status:'CONFLICTING'};rows[2].quantitative_record.display_n={n:'NA',status:'CONFLICTING',count_purpose:'treated',count_ids:[]};
 const shown=charts.studyTablePresentation(match,{registry:d.registry});assert.equal(shown.samples.length,1);assert.equal(shown.samples[0].sample_size,'146');assert(shown.samples.every(s=>s.sample_size!=='NA'));
 assert(charts.studyTableData(match,{registry:d.registry}).entries.some(entry=>entry.sample_size==='NA'&&entry.result.scoped_sample_size.status==='CONFLICTING'));
 rows[1].scoped_sample_size={n:145,status:'reported'};rows[1].quantitative_record.display_n.n=145;const different=charts.studyTablePresentation(match,{registry:d.registry});assert.equal(different.samples.length,2);assert(different.samples.some(s=>s.label.includes('safety')&&s.sample_size==='145'));
});

test('distinct overall cohorts retain their actual population labels for outcome and count-only rows',()=>{
 const trials=display('2254463');assert(trials.rows.some(r=>r.context.includes('First phase I trial')));assert(trials.rows.some(r=>r.context.includes('Second trial')));
 for(const n of ['16','21'])assert(trials.rows.some(r=>r.samples[0].sample_size===n));
 const cohorts=display('34221982');assert(cohorts.rows.some(r=>r.context.includes('CA209-038')));assert(cohorts.rows.some(r=>r.context.includes('MEL-IPI')));
 assert.deepEqual(cohorts.rows.map(r=>r.samples[0].sample_size),['73','110']);
 for(const d of [trials,cohorts]){const csv=charts.studyTableCSV([d.match],{registry:d.registry});for(const row of d.rows)if(row.context)assert(csv.includes(row.context));}
});

test('main cells cap grouped results while keeping every timepoint inside a group',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),start=source.indexOf('  function studyTableCells('),end=source.indexOf('\n  function ',start+5);
 const cells=display('26115796'),context={charts,state:{scopedPayload:{evidence_registry:cells.registry}},escape:x=>String(x),number:new Intl.NumberFormat('en-US')};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const group=cells.rows.find(row=>row.effects.length>3).group,html=context.studyTableCells({...cells.match,comparisons:group.comparisons,results:group.results});
 assert.equal((html.effect.match(/class="scoped-result compact-result"/g)||[]).length,3);assert(html.effect.includes('results · details'));assert(!html.sample_size.includes('diarrhoea'));
 const d=display('38844408'),g=d.rows[0].group;context.state.scopedPayload.evidence_registry=d.registry;const compact=context.studyTableCells({...d.match,comparisons:g.comparisons,results:g.results,phase_partition:g.phase_partition});
 for(const time of ['12 mo','24 mo','36 mo','48 mo'])assert(compact.effect.includes(time));assert(!compact.effect.includes('details'));assert.equal((compact.sample_size.match(/N=146/g)||[]).length,1);
});
test('pilot CSV contains exactly the concise visible cohorts and preserves known participant-count contexts',()=>{
 const merged=compact.merge([],{},payload),studies=regimens.prepareStudies(merged.studies),matches=charts.filterStudies(studies,{evidence_registry:merged.evidence_registry}),csv=charts.studyTableCSV(matches,{registry:merged.evidence_registry});
 const rows=parseCSV(csv).slice(1),visible=charts.visibleStudyMatches(matches,{registry:merged.evidence_registry});
 assert.equal(rows.length,visible.reduce((sum,match)=>sum+match.presentation_rows.length,0));assert(rows.every(row=>row[10]&&!/\bNA\b/.test(row[10])));
 assert.deepEqual([...new Set(rows.map(row=>row[3]))].sort(),visible.map(match=>match.study.pmid).sort());
 for(const match of visible)for(const group of match.presentation_rows){const view=charts.studyTablePresentation({...match,...group},{registry:merged.evidence_registry,phase_partition:group.phase_partition}),samples=view.samples.map(sample=>`${sample.label?sample.label+': ':''}${sample.sample_size}${sample.breakdown?' ('+sample.breakdown+')':''}`).join('; ');assert(rows.some(row=>row[3]===match.study.pmid&&row[10]===samples),match.study.pmid);}
 assert(matches.some(match=>!visible.some(row=>row.study.pmid===match.study.pmid)),'Reports with only missing Ns are hidden, not removed from evidence');
});

test('missing-N comparative outcomes remain source-bound and known-N presentation retains arm identity',()=>{
 const d=display('42162665');assert.equal(d.rows.length,0);
 const raw=charts.studyTableData(d.match,{registry:d.registry}).entries;assert(raw.every(row=>row.sample_size==='NA'));assert(raw.some(row=>row.label.includes('Tebentafusp')&&row.effect==='21.600 months'));assert(raw.some(row=>row.label.includes('Pembrolizumab or Ipilimumab or Dacarbazine')&&row.effect==='16.900 months'));
 assert.match(compact.render(d.study),/21\.6/);assert.match(compact.render(d.study),/16\.9/);
 const match=structuredClone(d.match);match.results=match.results.filter(result=>result.quantitative_record.kind==='median');
 match.results.forEach((result,index)=>{result.scoped_sample_size={n:100+index,status:'reported'};result.quantitative_record.display_n={n:100+index,status:'reported'};});
 const row=charts.studyTablePresentation(match,{registry:d.registry});assert(row.effects.some(e=>e.label==='Median OS · Comparator'));assert(row.effects.some(e=>e.label==='Median OS · Intervention'&&e.value==='21.600 months'));assert(row.effects.some(e=>e.label==='Median OS · Comparator'&&e.value==='16.900 months'));
});

test('paired arm N is shown beside treatments while distinct analysis contexts remain source-scoped',()=>{
 const d=display('34551229'),samples=d.rows[0].samples;assert.deepEqual(samples.map(s=>s.sample_size),['378']);
 assert.equal(d.rows[0].group.intervention_n,252);assert.equal(d.rows[0].group.comparator_n,126);
 const e=display('38844408'),match=structuredClone(e.match);match.results=match.results.filter(r=>r.quantitative_record.population_id==='p_all').slice(0,2);
 match.results[1].quantitative_record.model='adjusted Cox';match.results[1].quantitative_record.adjusted='yes';
 assert.equal(charts.studyTablePresentation(match,{registry:e.registry}).samples.length,2);
});

test('converted medians use concise numerical precision and one unit without changing source values',()=>{
 const before=JSON.stringify(payload),known=display('16565971');assert(known.rows.some(r=>r.effects.some(e=>e.label.startsWith('Median ')&&e.value==='6.571 months')));
 const missing=display('27124486');assert.equal(missing.rows.length,0);assert(charts.studyTableData(missing.match,{registry:missing.registry}).entries.some(row=>row.effect==='2.990 months'&&row.sample_size==='NA'));assert.equal(JSON.stringify(payload),before);
 const d=display('38844408');assert.equal(d.rows[0].effects[0].value,'17.400 (13.100–22.800) months');
 const unrelated=display('16565971');compact.records(unrelated.study)[0].derivations[0].id='other-result';const shown=charts.studyTablePresentation(unrelated.match,{registry:unrelated.registry});assert(shown.effects.some(e=>e.value==='6.571 months'));assert(unrelated.match.results.some(row=>row.quantitative_record.estimate===6.570841889117044));
});
