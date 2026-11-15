'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const clinical=require('../../dist/clinical_evidence.js'),regimens=require('../../dist/regimen_definitions.js'),charts=require('../../dist/app.js');
const filename=path.join(__dirname,'../../../data/audits/concise_monochrome_ui_20261108/target_fixture.json');
function prepared(){
 const bytes=fs.readFileSync(filename);if(crypto.createHash('sha256').update(bytes).digest('hex')!=='65a95af6910499cef130d43166b9c2dfa85d186a2f2f0307e32b21d5b05011b0')throw new Error('Concise display regression source changed');
 const payload=JSON.parse(bytes),m=clinical.merge([],{}, {...payload.clinical_meta,articles:Object.values(payload.clinical),evidence_registry:payload.evidence_registry});
 const studies=regimens.prepareStudies(m.studies.map(s=>({...s,quantitative_only:true,details:{...s.details,quantitative_extraction:payload.articles[s.pmid].records}})));
 const matches=charts.filterStudies(studies,{evidence_registry:m.evidence_registry});
 const display=pmid=>{const match=matches.find(m=>m.study.pmid===pmid),groups=charts.studyTablePresentationRows(match,{registry:m.evidence_registry});return {match,groups,shown:groups.map(g=>charts.studyTablePresentation({...match,...g},{registry:m.evidence_registry,phase_partition:g.phase_partition}))};};
 return {payload,studies,matches,registry:m.evidence_registry,display};
}
module.exports={prepared};
