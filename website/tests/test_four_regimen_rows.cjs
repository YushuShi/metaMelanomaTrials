'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const charts=require('../dist/app.js'),clinical=require('../dist/clinical_evidence.js');
const folder=path.join(__dirname,'../../data/proposed_changes/labels_trials_wald_20261106');
function read(name,sha){const raw=fs.readFileSync(path.join(folder,name));assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),sha);return JSON.parse(raw);}
const a=read('PUBLIC_ARTICLES_FOUR_CASES_5d527d2d322d5b6afb2ea33631983e8a1f3b6f94be62f2ca6e5a5e0a165fd874.json','5d527d2d322d5b6afb2ea33631983e8a1f3b6f94be62f2ca6e5a5e0a165fd874');
const b=read('PUBLIC_STUDIES_FOUR_CASES_e81477312cc13c7132d1942df647552035b8ffccd26a38b36b52806c808e8146.json','e81477312cc13c7132d1942df647552035b8ffccd26a38b36b52806c808e8146');
const sourceBefore=JSON.stringify({a,b}),flags=['clinical_validation','clinical_verified','pooling_eligible','report_R3_complete','final_R3_complete','numerical_extraction_complete','source_report_coverage_complete'];
const payload={schema_version:1,status:'ready',record_kind:'canonical_clinical_evidence',articles:a.articles,evidence_registry:a.evidence_registry,...Object.fromEntries(flags.map(k=>[k,false]))};
const merged=clinical.merge(charts.scopedStudies({schema_version:1,studies:b.studies}),b.evidence_registry,payload).studies;
const selection={endpoint:'overall_survival',measure:'HR'},matches=()=>charts.filterStudies(merged,selection),rows=pmid=>charts.studyTreatmentRows(matches().find(m=>m.study.pmid===pmid));

test('actual four-case merge shows clean source-qualified OS HR regimen rows',()=>{
 assert.equal(matches().length,4);
 assert.deepEqual(rows('23402397').map(r=>[r.comparator_label,r.intervention_label,r.is_add_on]),[
  ['Dacarbazine ± Interferon alfa-2b','Fotemustine',true],['Dacarbazine ± Fotemustine','Interferon alfa-2b',true]]);
 assert.deepEqual(rows('16170182').map(r=>[r.comparator_label,r.intervention_label,r.is_add_on]),[['Dacarbazine + Cisplatin + Interferon alfa-2b','Interleukin-2 therapy, product unspecified',true]]);
 assert.deepEqual(rows('31880964').map(r=>[r.comparator_label,r.intervention_label,r.is_add_on]),[['Interferon alfa-2b','Ipilimumab',false]]);
 assert.deepEqual(rows('41971757').map(r=>r.comparator_label),['Dabrafenib + Trametinib','Encorafenib + Binimetinib','Vemurafenib + Cobimetinib','Atezolizumab + Vemurafenib + Cobimetinib']);
 assert(rows('41971757').every(r=>r.intervention_label==='Nivolumab + Relatlimab'&&!r.is_add_on));
});

test('actual comparator/intervention filters retain only their own factorial model/result identities',()=>{
 for(const label of ['Fotemustine','Interferon alfa-2b']){
  const row=rows('23402397').find(r=>r.intervention_label===label),comparison=row.comparisons[0];
  const selected=charts.filterStudies(merged,{...selection,comparator:charts.comparatorKey(comparison),intervention:charts.interventionPresentation(comparison).key});
  assert.equal(selected.length,1);assert.equal(selected[0].study.pmid,'23402397');assert.equal(selected[0].comparisons.length,1);
  assert.deepEqual(selected[0].results.map(r=>r.result_id),row.results.map(r=>r.result_id));
 }
 const c=rows('16170182')[0].comparisons[0],selected=charts.filterStudies(merged,{...selection,comparator:charts.comparatorKey(c),intervention:charts.interventionPresentation(c).key});
 assert.equal(selected.length,1);assert.equal(selected[0].study.pmid,'16170182');assert.equal(selected[0].comparisons[0].comparison_id,c.comparison_id);
 assert.equal(charts.filterStudies(merged,{...selection,intervention:'treatment-class:agent:cisplatin'}).length,0);
 assert.equal(charts.filterStudies(merged,{...selection,intervention:'treatment-class:agent:aldesleukin'}).length,0,'Generic IL-2 does not establish a named product');
});

test('actual abbreviated comparator filters and ipilimumab dose metadata stay source-bound',()=>{
 const selected=charts.filterStudies(merged,{...selection,comparator:'treatment-class:agent:dabrafenib',intervention:'treatment-class:agent:relatlimab'});
 assert.equal(selected.length,1);assert.equal(selected[0].study.pmid,'41971757');assert.equal(selected[0].comparisons.length,1);
 assert.equal(rows('31880964')[0].intervention_definition.root.dose,'3 mg/kg');
});

test('actual treatmentTag renders optional factorial definition and a separate genuine add-on plus',()=>{
 const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),start=source.indexOf('  function treatmentTag('),end=source.indexOf('\n  function ',start+10);
 const context=vm.createContext({charts,escape:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});vm.runInContext(source.slice(start,end),context);
 const row=rows('23402397')[0],control=context.treatmentTag('Ignored raw A+B/C+D caption',false,row.comparator_definition),active=context.treatmentTag('Ignored raw pool caption',row.is_add_on,row.intervention_definition);
 assert.match(control,/>Dacarbazine<\/span>/);assert.match(control,/treatment-join">±<\/span>/);assert.match(control,/>Interferon alfa-2b<\/span>/);
 assert.doesNotMatch(control,/treatment-add-on|Fotemustine|A\+B|C\+D/);
 assert.match(active,/class="treatment-add-on"[^>]*>\+<\/span>/);assert.match(active,/>Fotemustine<\/span>/);assert.doesNotMatch(active,/Dacarbazine|Interferon|A\+B/);
});

test('the complete source data, numerical wrappers, validation flags and models remain byte-equivalent',()=>{
 matches().forEach(m=>charts.studyTreatmentRows(m));assert.equal(JSON.stringify({a,b}),sourceBefore);
 for(const m of matches())for(const r of m.results){assert.equal(charts.displayMeasure(r),'HR');assert.equal(r.pooling_eligible,false);}
});
