'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js'),regimens=require('../dist/regimen_definitions.js'),advanced=require('../dist/advanced_filters.js');
const fixture=require('../../data/audits/subgroup_browsing_20261109/current_fixture.json');
const classifications=require('../dist/data/clinical_classifications.json');
const raw=new Map(fixture.articles.map(article=>[article.pmid,article.records]));
const merged=clinical.merge([],{}, {...fixture.clinical_meta,articles:fixture.clinical,evidence_registry:fixture.evidence_registry});
const studies=regimens.prepareStudies(merged.studies.map(study=>({...study,quantitative_only:true,details:{...study.details,quantitative_extraction:raw.get(study.pmid)}})));
const registry=merged.evidence_registry,selection={evidence_registry:registry,clinical_classifications:classifications,clinical_content_sha256:fixture.clinical_meta.content_sha256};
const base=charts.filterStudies(studies,selection);
const project=matches=>charts.visibleStudyMatches(matches.map(charts.advancedPopulationMatch),{registry});
const options=charts.advancedBrowseOptions(selection);
const browse=(selections={},matches=base)=>project(advanced.filterBrowseMatches(matches,selections,options));
const find=(matches,pmid)=>matches.find(match=>match.study.pmid===pmid);
const key=row=>JSON.stringify([row.source_input_sha256,row.review_binding_sha256,row.result_id]);
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
const csvPMIDs=matches=>new Set(parseCSV(charts.studyTableCSV(matches,{registry})).slice(1).map(row=>row[3]));

test('All subgroup selections preserve the existing presentation, counts and CSV',()=>{
  const before=JSON.stringify(studies),all=advanced.filterBrowseMatches(base,advanced.resetSelections(),options);
  assert.equal(all,base,'All must retain the existing matching contract');
  assert.deepEqual(browse(),charts.visibleStudyMatches(base,{registry}));
  assert.equal(charts.studyTableCSV(browse(),{registry}),charts.studyTableCSV(base,{registry}));
  assert.equal(JSON.stringify(studies),before);
});

test('Stage III works with no endpoint and retains source-defined count-only N30 report',()=>{
  const selected=browse({stage:'iii'}),match=find(selected,'42218345');assert(match);
  assert.deepEqual(project(charts.filterStudies(studies,{...selection,advanced:{stage:'iii'}})),selected,'App filtering must use the same browsing projection');
  assert.equal(match.results.length,0,'A count must not become a synthetic clinical outcome');
  assert(match.study.details.sample_size_records.some(row=>row.quantitative_record.id==='s2'&&row.n.value===30));
  assert(match.presentation_rows.length>0);
  const rows=parseCSV(charts.studyTableCSV([match],{registry}));
  assert(rows.some(row=>row[3]==='42218345'&&row[10]==='30'&&row[11]==='Details'));
  assert(rows.some(row=>row[6].includes('stage III')));
  assert(!find(browse({stage:'iv'}),'42218345'));
  assert.equal(match.source_study,find(base,'42218345').study);
});

test('Stage III does not relabel a mixed III/IV result as a pure-stage result',()=>{
  const ordinary=find(base,'36162037');assert(ordinary);
  const mixed=ordinary.results.filter(row=>advanced.resultClassification(row,options)?.fields.stage?.status==='mixed');
  assert(mixed.length>0,'This source fixture must exercise genuinely mixed stage III/IV evidence');
  const selected=find(browse({stage:'iii'}),'36162037');
  for(const row of mixed)assert(!selected?.results.some(candidate=>key(candidate)===key(row)));
  for(const match of browse({stage:'iii'}))for(const row of match.results){
    const field=advanced.resultClassification(row,options).fields.stage;
    assert.equal(field.status,'supported');assert.deepEqual(field.categories,['iii']);
  }
});

test('Stage III retains pure-stage NADINA evidence without requiring a poolable endpoint',()=>{
  const match=find(browse({stage:'iii'}),'38828984');assert(match&&match.results.length);
  assert(match.results.some(row=>charts.displayMeasure(row)!=='HR'),'Browsing must include supported non-HR outcomes');
  for(const row of match.results)assert(advanced.resultMatches(row,{stage:'iii'},options));
});

test('browse report counts equal visible table and CSV reports, without PMID inflation',()=>{
  for(const selected of [{},{stage:'iii'},{stage:'iv'},{stage:'iii',setting:'neoadjuvant_perioperative'},{subtype:'uveal'}]){
    const matches=advanced.filterBrowseMatches(base,selected,options),visible=project(matches),summary=advanced.browseSummary(matches,options);
    const pmids=new Set(visible.map(match=>match.study.pmid));
    assert.equal(summary.report_count,pmids.size);
    assert.deepEqual(csvPMIDs(visible),pmids);
    assert.equal(advanced.browseSummary([...matches,...matches],options).report_count,pmids.size,'Repeated extraction matches must not increase report counts');
  }
});

test('no-endpoint browse facets apply other selections and omit their own restriction',()=>{
  const state={stage:'iii',setting:'neoadjuvant_perioperative'},facets=advanced.browseFacets(base,state,options);
  const stage=facets.find(facet=>facet.key==='stage');assert(stage&&stage.visible);
  for(const choice of stage.choices){
    const expected=advanced.browseSummary(advanced.filterBrowseMatches(base,{...state,stage:choice.value},options),options).report_count;
    assert.equal(choice.count,expected,choice.value);
  }
  assert(stage.options.some(option=>option.value==='iii'),'Active choice must remain selectable with fewer than five reports');
});

test('unknown or stale classifications fail closed without changing source data',()=>{
  const before=JSON.stringify(studies);
  assert.equal(advanced.filterBrowseMatches(base,{stage:'iii'},{...options,classifications:null}).length,0);
  assert.equal(advanced.filterBrowseMatches(base,{stage:'iii'},{...options,clinical_content_sha256:'changed'}).length,0);
  assert.equal(advanced.filterBrowseMatches(base,{stage:'obsolete'},options).length,0);
  assert.equal(JSON.stringify(studies),before);
});
