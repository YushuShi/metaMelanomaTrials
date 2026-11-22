'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js');
const regimens=require('../dist/regimen_definitions.js'),compact=require('../dist/quantitative_extraction.js');
const projection=require('../dist/study_source_projection.js');

test('NIBIT-M2 primary and follow-up OS results agree with the exact maintenance course in Studies and CSV',()=>{
  const snapshot=require('../dist/data/quantitative_extraction.json'),clinicalSource=snapshot.clinical_evidence;
  const ids=['34112708','38271746'],articles=snapshot.articles.filter(a=>ids.includes(a.pmid));
  const clinicalArticles=clinicalSource.articles.filter(a=>ids.includes(a.pmid));
  const before=JSON.stringify([articles,clinicalArticles]);
  const {studies,evidence_registry}=clinical.merge([],{}, {...clinicalSource,articles:clinicalArticles});
  const prepared=regimens.prepareStudies(studies.map(study=>({...study,quantitative_only:true,
    details:{...study.details,quantitative_extraction:articles.find(a=>a.pmid===study.pmid).records}})));
  const projected=projection.apply(prepared,evidence_registry,snapshot),registry=projected.evidence_registry;
  const match=label=>charts.filterStudies(projected.studies,{evidence_registry:registry,endpoint:'overall_survival',measure:'HR',
    comparator:'exact-regimen:agent:fotemustine',intervention:'exact-regimen:'+charts.completeArmKey(
      {kind:'treatment_comparison',comparator_label:'Fotemustine',intervention_label:label},'intervention')});
  const sequence=match('Ipilimumab + Nivolumab followed by Nivolumab');
  assert.deepEqual(sequence.map(m=>[m.study.pmid,m.results.map(r=>r.estimate.value)]).sort(),[
    ['34112708',[.44]],['38271746',[.43]]]);
  assert.equal(match('Ipilimumab + Nivolumab').length,0);
  const csv=charts.studyTableCSV(sequence,{registry});
  for(const expected of ['34112708','38271746','0.440 (0.220–0.870)','0.430 (0.220–0.860)','(Ipilimumab + Nivolumab) → Nivolumab'])
    assert.ok(csv.includes(expected),expected);
  const regimen=charts.completeArmKey({kind:'treatment_comparison',intervention_label:'Ipilimumab + Nivolumab followed by Nivolumab'},'intervention');
  const reversed=charts.filterStudies(projected.studies,{evidence_registry:registry,endpoint:'overall_survival',measure:'HR',
    comparator:'exact-regimen:'+regimen,intervention:'exact-regimen:agent:fotemustine'});
  assert.equal(reversed.length,2);
  const inverseCsv=charts.studyTableCSV(reversed,{registry});
  for(const value of ['2.326 (1.163–4.545) · inverted','2.273 (1.149–4.545) · inverted'])
    assert.ok(inverseCsv.includes(value),inverseCsv);
  for(const study of reversed) {
    const row=charts.studyTablePresentationRows(study,{registry})[0];
    assert.match(row.comparator_label,/Ipilimumab.*Nivolumab.*→ Nivolumab/);
    assert.equal(row.intervention_label,'Fotemustine');
  }
  const followup=sequence.find(m=>m.study.pmid==='38271746'),result=followup.results[0];
  assert.equal(result.analysis_n.value,50);
  assert.equal(charts.abstractOnly(followup.study),false);
  const drawer=compact.render(followup.study,{registry});
  assert.match(drawer,/PIIS0959804924000078\.pdf/);assert.match(drawer,/ipilimumab \+ nivolumab → nivolumab/i);
  assert.ok(drawer.includes('0.430')&&drawer.includes('1.070'));
  const repeat=projection.apply(projected.studies,registry,snapshot);
  assert.equal(repeat.studies.find(s=>s.pmid==='38271746').details.quantitative_results.length,followup.study.details.quantitative_results.length);
  assert.equal(JSON.stringify([articles,clinicalArticles]),before);
});

test('CheckMate 066 shows its comparative HR in either direction without assigning the arm Ns as the outcome denominator',()=>{
  const snapshot=require('../dist/data/quantitative_extraction.json'), pmid='32997575';
  const source=snapshot.articles.find(article=>article.pmid===pmid);
  const evidence=snapshot.clinical_evidence;
  const {studies,evidence_registry}=clinical.merge([],{}, {...evidence,articles:evidence.articles.filter(a=>a.pmid===pmid)});
  const prepared=regimens.prepareStudies(studies.map(study=>({...study,quantitative_only:true,
    details:{...study.details,quantitative_extraction:source.records}})));
  const projected=projection.apply(prepared,evidence_registry,snapshot),registry=projected.evidence_registry;
  for(const [comparator,intervention,expected] of [
    ['dacarbazine','nivolumab','0.500 (0.400–0.630)'],
    ['nivolumab','dacarbazine','2.000 (1.587–2.500) · inverted'],
  ]){
    const [match]=charts.filterStudies(projected.studies,{evidence_registry:registry,endpoint:'overall_survival',measure:'HR',
      comparator:'exact-regimen:agent:'+comparator,intervention:'exact-regimen:agent:'+intervention});
    assert.equal(match.results[0].analysis_n.value,null);
    const csv=charts.studyTableCSV([match],{registry});
    for(const text of ['Nivolumab (N=206)','Dacarbazine (N=205)',expected])assert.ok(csv.includes(text),csv);
    const [row]=charts.studyTablePresentationRows(match,{registry});
    const withoutArmCounts={...row,paired_arm_context:false,intervention_n:null,comparator_n:null};
    const noCounts=charts.studyTablePresentation({...match,...withoutArmCounts},{registry});
    assert.equal(noCounts.samples.length,0);
    assert.ok(noCounts.effects.some(effect=>effect.value===expected));
    const withoutN=charts.studyTableCSV([{...match,presentation_rows:[withoutArmCounts]}],{registry});
    assert.ok(withoutN.includes('"NA","OS · HR: '+expected+'"'),withoutN);
  }
});
