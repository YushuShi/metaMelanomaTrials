'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {inPeriod,build,findingSignificance,appendReportedFindings,isTrialReport} = require('../scripts/build_new_findings.cjs');
const {render} = require('../dist/new_findings.js');

function panel() {
  const search={value:'',addEventListener(event,handle){this[event]=handle;}}, count={}, results={};
  return {search,count,results,querySelector(selector) {
    return {'[data-trial-search]':search,'[data-findings-count]':count,'[data-findings-results]':results}[selector];
  }};
}

function comparison(endpoint, measure, estimate, p = .01) {
  return {contrast_type:'treatment_comparison', quantitative_record:{origin:'own_report', endpoint, measure, estimate},
    p_value:{status:'reported', qualifier:'equal', value:p}};
}

test('benefit threshold uses the clinical direction, full precision and the selected result’s own test', () => {
  for (const row of [comparison('OS','HR',.74), comparison('AE_grade_ge3','RR',.73), comparison('ORR','RR',1.36)]) {
    assert.equal(findingSignificance(row).protective,true);
  }
  for (const row of [comparison('OS','HR',.8), comparison('PFS','HR',1.5), comparison('ORR','OR',.5),
    comparison('ORR','RR',Math.exp(.3)), comparison('OS','HR',Math.exp(-.3))]) {
    assert.equal(findingSignificance(row).protective,false);
  }
  assert.equal(findingSignificance(comparison('OS','HR',.4,.05)),null);
  assert.equal(findingSignificance(comparison('ORR','OR',1.9,.08)),null);
  assert.equal(findingSignificance({quantitative_record:{origin:'own_report', endpoint:'ORR', percentage:45, ci_lower:28, ci_upper:62}}),null);
});

test('applies an inequality only to the estimate and interval explicitly cited alongside it', () => {
  const row = comparison('OS','HR',.57);
  Object.assign(row.quantitative_record, {ci_level:95, ci_lower:.45, ci_upper:.72});
  delete row.p_value;
  row.evidence_ids = ['source'];
  const registry = {source:{supporting_quote:'MSS (HR 0.58; 95% CI 0.40 to 0.85; p=0.005), and OS (HR 0.57, 95% CI 0.45 to 0.72; p<0.0001).'}};
  assert.equal(findingSignificance(row,registry).basis,'p<0.0001');
  row.p_value = {qualifier:'greater_than',status:'reported',value:.01};
  assert.equal(findingSignificance(row,registry).basis,'95% CI excludes 1');
  row.p_value = {qualifier:'less_than',status:'reported',value:.05};
  assert.equal(findingSignificance(row,registry).basis,'p<0.05');
  row.p_value.qualifier = 'less_or_equal';
  assert.equal(findingSignificance(row,registry).basis,'95% CI excludes 1');
});

test('CI-only highlights use the published unrounded comparative interval, including descriptive updates', () => {
  const row = comparison('PFS','HR',.77);
  delete row.p_value;
  const q = row.quantitative_record;
  Object.assign(q,{ci_lower:.6,ci_upper:.9998,ci_level:95});
  assert.deepEqual(findingSignificance(row),{basis:'95% CI excludes 1',protective:false});
  q.ci_upper=1;
  assert.equal(findingSignificance(row),null);
  q.ci_upper=.9; q.ci_level=90;
  assert.equal(findingSignificance(row),null);
  q.ci_level=95; q.calculation={method:'from_arm_binary_outcomes'};
  assert.equal(findingSignificance(row),null);
});

test('an explicit statement can support an estimate without a p-value or CI', () => {
  const row = comparison('OS','HR',.60);
  delete row.p_value;
  row.evidence_ids = ['result'];
  const check = quote => findingSignificance(row,{result:{supporting_quote:quote}});
  const positive = 'The combination significantly prolonged overall survival (HR 0.60).';
  assert.deepEqual(check(positive),{basis:'Authors report statistical significance',source_quote:positive,protective:true});
  for (const quote of [
    'OS showed a clinically significant benefit (HR 0.60).',
    'OS did not significantly improve (HR 0.60).',
    'A previous study significantly improved OS (HR 0.60).',
    'PFS significantly improved, whereas the OS HR was 0.60.',
    'PFS significantly improved and OS was similar (HR 0.60).',
    'OS was significantly improved (HR 0.75).'
  ]) assert.equal(check(quote),null,quote);
  row.p_value = {qualifier:'equal',status:'reported',value:.08};
  assert.equal(check(positive),null);
});

test('word-only and subgroup findings keep their own group, source and color', () => {
  const groups = [{group:'Overall',effects:[{endpoint:'OS',value:'12 months'}]}];
  const entry = {endpoint:'Marker expression',value:'Decreased',source_quote:'Marker expression decreased significantly.'};
  const subgroup = {...entry,group:'Biomarker subgroup',source_id:'s1',basis:'Authors report statistical significance'};
  const span = {source_id:'report-7:main:verified',supporting_quote:entry.source_quote};
  appendReportedFindings(groups,{report_id:'report-7'},{qualitative_findings:[entry]},[
    subgroup,{...subgroup,source_id:'s2',endpoint:'Wrong report'},{...subgroup,source_quote:'Absent quote',endpoint:'Unsupported'}
  ],{s1:span,s2:{...span,source_id:'report-8:main:verified'}});
  assert.deepEqual(groups.map(group=>group.effects.length),[1,1,1]);
  assert.equal(groups[1].effects[0].significance.protective,false);
  const host = panel();
  render(host,{schema_version:2,reports:[{pmid:'7',title:'Study',date:'2026-11-01',is_trial_report:true,groups}]});
  assert.match(host.results.innerHTML,/finding-study-significant/);
  assert.match(host.results.innerHTML,/title="Marker expression decreased significantly."/);
  assert.doesNotMatch(host.results.innerHTML,/<b class="finding-protective"|Wrong report|Unsupported/);
});

test('marks the entire report and only its significant findings, including ones inside disclosures', () => {
  const host = panel();
  render(host,{schema_version:2,reports:[{pmid:'77',title:'Recent trial',date:'2026-10-20',is_trial_report:true,groups:[
    {effects:[{endpoint:'PFS · HR',value:'0.531 (0.280–1.008)'},
      {endpoint:'OS · HR',value:'0.440 (0.205–0.923)',significance:{basis:'p=0.03',protective:true}}]},
    {effects:[{endpoint:'AE · RR',value:'1.600',significance:{basis:'p=0.02',protective:false}}]}
  ]}]});
  const html = host.results.innerHTML;
  assert.equal((html.match(/data-pmid="77" class="finding-study-significant"/g)||[]).length,2);
  assert.match(html,/1 more result · 1 significant/);
  assert.match(html,/<b class="finding-protective"[^>]*>0.440<\/b> \(0.205–0.923\)/);
  assert.match(html,/<mark class="finding-significant"><strong>AE · RR<\/strong> 1.600/);
  assert.match(html,/<div class="finding-result"><strong>PFS · HR<\/strong> 0.531/);
});

test('date bounds are inclusive and preserve uncertain date precision', () => {
  for (const date of ['2026-09-30','2026','2026-11','2026-11-09',null]) assert.equal(inPeriod(date,'2026-11-08'),false);
  for (const date of ['2026-10','2026-10-01','2026-11-08']) assert.equal(inPeriod(date,'2026-11-08'),true);
});

test('highlight eligibility requires a trial report and respects the design of a secondary publication', () => {
  const study = {title:'Phase II clinical trial',doi:'10.1/example'};
  assert.equal(isTrialReport(study, {is_trial:true}),true);
  assert.equal(isTrialReport(study, {is_trial:false}),false);
  assert.equal(isTrialReport(study, {is_trial:true}, {doi:study.doi,report_design:'secondary_predictor_analysis'}),false);
  assert.equal(isTrialReport({...study,title:'Survival in a trial cohort: a retrospective analysis'}, {is_trial:true}),false);
  assert.equal(isTrialReport({...study,title:'Prospective trial with retrospective cohort controls'}, {is_trial:true}),true);
  assert.equal(isTrialReport({...study,title:'Five-year follow-up of a phase III trial'}, {is_trial:true}),true);
});

test('retrospective and unclassified reports keep their estimates and p-values without trial highlighting', () => {
  const findings = [{endpoint:'OS · HR',value:'0.440 (0.205–0.923)',significance:{basis:'p=0.03',protective:true}},
    {endpoint:'Secondary outcome',value:'Decreased',significance:{basis:'Authors report statistical significance'}}];
  for (const design of [{nontrial:true,is_trial_report:false},{is_trial_report:false},{}]) {
    const host = panel();
    render(host,{schema_version:2,reports:[{pmid:'7',title:'Report',date:'2026-10-20',groups:[{effects:findings}],...design}]});
    const [,body] = host.results.innerHTML.split('<tbody>');
    assert.match(body,/0.440 \(0.205–0.923\).*p=0.03/);
    assert.match(body,/1 more result<\/summary>/);
    assert.doesNotMatch(body,/finding-study-significant|finding-significant|finding-protective/);
  }
});
test('public rebuild permits missing publication metadata', () => {
  const payload = build({as_of:'2026-11-08T05:10:00Z', clinical_evidence:{articles:[{pmid:'7',current_screening_status:'retain',current_main_eligible:true}]}},{},null);
  assert.deepEqual(payload.reports,[]);
  const host = panel();
  render(host,payload);
  assert.match(host.count.textContent,/No retained reports/);
});
test('present the publication month with correct precision and link findings by PMID', () => {
  const host = panel();
  render(host,{schema_version:1,reports:[{pmid:'7',title:'Study <7>',date:'2026-10',date_basis:'Journal issue',
    findings:[{endpoint:'OS · HR',value:'0.770 (0.620–0.980)',regimen:'A vs B'},{endpoint:'PFS · HR',value:'0.8'}]},
  {pmid:'8',title:'Case',date:'2026-10-05',date_basis:'Online publication',findings:[],abstract_note:'Grade 3 toxicity after treatment.'}]});
  assert.match(host.results.innerHTML,/Oct 2026/);
  assert.match(host.results.innerHTML,/Oct 5, 2026/);
  assert.match(host.results.innerHTML,/pubmed.ncbi.nlm.nih.gov\/7\//);
  assert.match(host.results.innerHTML,/Study &lt;7&gt;/);
  assert.match(host.results.innerHTML,/1 more result/);
  assert.match(host.results.innerHTML,/Grade 3 toxicity/);
});

test('study metadata spans the distinct treatment and population rows', () => {
  const host = panel();
  render(host, {schema_version:2, reports:[{pmid:'7',title:'Melanoma',author:'Test et al.',date:'2026-10-18',
    date_basis:'Print publication',trial:'Named trial',nct:'NCT00000001',abstract_only:true,nontrial:true,groups:[
      {group:'All participants',comparator:'Nivolumab',intervention:'Temozolomide',add_on:true,samples:[{sample_size:'157'}],effects:[{endpoint:'OS · HR',value:'0.800'}]},
      {group:'Subgroup',comparator:'Ipilimumab 3 mg/kg',intervention:'Ipilimumab 10 mg/kg',comparator_n:10,intervention_n:11,samples:[],effects:[]}
    ]}]});
  const html=host.results.innerHTML;
  for (const label of ['Trial name','Comparator','Intervention','Sample size','Effect size (CI)']) assert.ok(html.includes('>'+label+'</th>'));
  assert.equal((html.match(/Named trial/g) || []).length,1);
  assert.match(html,/<td rowspan="2">Named trial/);
  assert.match(html,/data-treatment-class="ici">Nivolumab<\/span>/);
  assert.match(html,/treatment-add-on"[^>]*>\+<\/span> <span class="treatment-tag" data-treatment-class="chemotherapy">Temozolomide<\/span>/);
  assert.match(html,/Ipilimumab<\/span> 3 mg\/kg<\/span> <span class="treatment-arm-n">\(N=10\)/);
  assert.match(html,/Ipilimumab<\/span> 10 mg\/kg<\/span> <span class="treatment-arm-n">\(N=11\)/);
  assert.match(html,/N=157/);
  assert.match(html,/Abstract only/);
});

test('trial searches retain every row from matching recent reports, clear and survive remount', () => {
  const host=panel();
  const first={pmid:'17',trial:'SPOTLIGHT203',nct:'NCT04570332',title:'Report one',date:'2026-10-18',
    date_basis:'Online publication',groups:[{group:'A',effects:[]},{group:'B',effects:[]}]};
  const other={...first,pmid:'18',trial:'CheckMate 067',nct:'NCT01844505',title:'Comparison citing KEYNOTE-B77'};
  const payload={schema_version:2,reports:[first,other]};
  const query=value=>{host.search.value=value;host.search.input();};
  render(host,payload);
  for(const term of ['keynote','nct04570332']){
    query(term);
    assert.match(host.count.textContent,/^1 retained report /);
    assert.equal(host.results.innerHTML.includes('SPOTLIGHT203 (KEYNOTE-B77)'), term === 'keynote');
    assert.equal(host.results.innerHTML.match(/data-pmid="17"/g).length,2);
    assert.doesNotMatch(host.results.innerHTML,/data-pmid="18"/);
  }
  render(host,payload);
  assert.equal(host.search.value,'nct04570332');
  assert.doesNotMatch(host.results.innerHTML,/data-pmid="18"/);
  query('unmatched trial');
  assert.equal(host.results.innerHTML,'');
  assert.match(host.count.textContent,/No recent reports match/);
  query('');
  assert.match(host.count.textContent,/^2 retained reports /);
  assert.match(host.results.innerHTML,/data-pmid="18"/);
});
