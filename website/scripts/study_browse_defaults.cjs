'use strict';
const Charts = require('../dist/app.js');
const Quantitative = require('../dist/quantitative_extraction.js');
const Regimens = require('../dist/regimen_definitions.js');
const Source = require('../dist/study_source_projection.js');
const Treatments = require('../dist/treatment_groups.js');
const Resolver = require('../dist/treatment_resolver.js');
const Studies = require('../dist/study_indirect.js');
const Planning = require('../dist/treatment_map_planning.js');
const Cache = require('../dist/treatment_network_cache.js');
const {createHash} = require('node:crypto');
const Model = require('../dist/treatment_network_model.js');

// Keep the default table's finished display cells. Clinical extractions and
// source passages are loaded on demand for detailed/filtered browsing.
function build(snapshot,normalizations,graph) {
  const merged=Quantitative.merge([],{},snapshot);
  const prepared=Regimens.prepareStudies(merged.studies,{normalizations,clinical_content_sha256:snapshot.clinical_evidence.content_sha256});
  const {studies,evidence_registry:registry}=Source.apply(prepared,merged.evidence_registry,snapshot);
  const labels=new Map(Resolver.registry.products.map(p=>[p.id,p.label]));
  const reported=new Map();
  for(const study of studies)for(const comparison of Charts.studyComparisons(study,{registry})) {
    const ids=Charts.additionalInterestIds(comparison),label=Charts.quantitativeText(comparison.additional_intervention_label);
    if(ids.length===1 && ids[0].startsWith('reported-arm-') && label) {
      if(!reported.has(ids[0]))reported.set(ids[0],new Set());
      reported.get(ids[0]).add(label);
    }
  }
  for(const [id,names] of reported)if(!labels.has(id)&&names.size===1)labels.set(id,[...names][0]);
  const selection={evidence_registry:registry,treatment_labels:labels};
  const choices=Charts.constrainStudyChoices(studies,selection);
  const catalog=Studies.catalogue(graph,Charts.regimenDescription);
  const name=id=>labels.get(id)||id;
  const compareLabels=Charts.comparatorGroupLabels(choices.comparisons,name);
  const compareOptions=choices.comparator_options.map(row=>({...row,label:compareLabels.get(row.value)||row.label}));
  const result=Charts.visibleStudyMatches(Charts.filterStudies(studies,selection),{registry,labels});
  const rows=result.map(match=>{
    const s=match.study;
    const study={};
    for(const k of ['report_id','pmid','title','year','first_author_surname','author_display','quantitative_only'])study[k]=s[k];
    const trial=Charts.studyTrialIdentifiers(s,{registry});
    const presentation_rows=match.presentation_rows.map(c=>{
      const display=Charts.studyTablePresentation({...match,...c},{registry,phase_partition:c.phase_partition,presentation_cutoff:c.presentation_cutoff});
      const row={};
      for(const k of ['comparator_label','intervention_label','is_add_on','comparator_n','intervention_n'])row[k]=c[k];
      // Use the original structure for color/ordering, without embedding source records in the table.
      row.prepared_arms=[['comparator',false],['intervention',!!c.is_add_on]].map(([side,added])=>Charts.armTag(c[side+'_label'],added,c[side+'_definition']));
      row.prepared_view={group:display.group,samples:display.samples.map(({label,sample_size,breakdown,denominator_note})=>({label,sample_size,breakdown,denominator_note})),
        effects:display.effects.map(({label,value,review_needed})=>({label,value,review_needed}))};
      return row;
    });
    return {study,presentation_rows,prepared_trial:{trial_label:trial.trial_label,nct_label:trial.nct_label},
      prepared_status:Charts.articleStatusLabel(s),prepared_design:Charts.studyDesignInfo(s).is_non_trial,prepared_abstract:Charts.abstractOnly(s)};
  });
  const endpoints=new Map();
  for(const s of studies.filter(s=>s.default_visible))for(const row of Charts.studyResults(s).filter(Charts.mainResultEligible)){
    const endpoint=Charts.displayEndpointFamily(row);
    if(!endpoint || ['other','unclear'].includes(endpoint))continue;
    endpoints.set(endpoint,endpoints.get(endpoint)||Charts.resultMatches(row,{endpoint,measure:Charts.defaultEffectMeasure(endpoint),include_orr:endpoint==='response',orr_only:endpoint==='response'}));
  }
  return {rows,summary:require('../dist/advanced_filters.js').browseSummary(result),selectors:{
    comparator:Studies.pickerTree(compareOptions,catalog,Treatments,'comparator'),
    intervention:Studies.pickerTree(choices.intervention_options,catalog,Treatments,'intervention')},
    endpoints:[...endpoints].map(([id,enabled])=>({id,label:Charts.endpointOptionLabel(id),enabled})).sort((a,b)=>a.label.localeCompare(b.label)),
    catalog:{labels:[...catalog.labels],keys:[...catalog.keys],ids:[...catalog.ids],choices:catalog.choices}};
}

// The default table stores each ordered pair separately. Binary planning
// depends on the reference arm, even when the ratio can be inverted.
function networkDefaults(graph) {
  const scope=Studies.analysisScope(graph,{active:false}),out={};
  for(const option of Studies.endpointChoices(graph,'')) {
    const primary=scope.networkFor(option.key);
    for(const target of primary.targets) {
      const network=target.id===primary.target?primary:scope.networkFor(option.key,target.id);
      for(const component of network.components) {
        const blockDigest=createHash('sha256').update(Cache.signature(component.blocks)).digest('hex');
        for(const first of component.regimens)for(const second of component.regimens) {
          if(first===second || !network.status(second,first).eligible)continue;
          const pair=network.forPair(first,second);
          const fit=Model.fit(pair.blocks,first,second,'common');
          if(!fit.available)continue;
          const plan=Planning.indirect({estimate:fit.estimate,measure:option.measure,first,second,comparisons:pair.comparisons,settings:{}});
          out[JSON.stringify([option.key,target.id,first,second])]={blockDigest,fit,plan:{label:plan.label,detail:plan.detail}};
        }
      }
    }
  }
  return out;
}
module.exports={build,networkDefaults};

if(require.main===module) {
  const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
  const root=path.resolve(process.argv[2]),dir=path.join(root,'website/dist/data');
  function read(name) {
    const file=path.join(dir,name+'.json');
    return JSON.parse(fs.existsSync(file)?fs.readFileSync(file):zlib.gunzipSync(fs.readFileSync(file+'.gz')));
  }
  const graph=read('treatment_map'),bindings={schema:1,graph:graph.content_sha256,source:graph.metadata.source_file_sha256};
  const hashes={};
  function write(name,value) {
    const bytes=JSON.stringify({...bindings,...value})+'\n';
    const file=path.join(dir,name+'.json'),tmp=file+'.tmp-'+process.pid;
    fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,file);
    hashes[name+'_sha256']=createHash('sha256').update(bytes).digest('hex');
  }
  write('study_browse_default',build(read('quantitative_extraction'),read('treatment_normalizations'),graph));
  write('study_network_defaults',{results:networkDefaults(graph)});
  const producers=Object.keys(require.cache).filter(f=>f===__filename || f.startsWith(path.join(root,'website/dist')+path.sep)).map(f=>path.relative(root,f));
  process.stdout.write(JSON.stringify({hashes,producers}));
}
