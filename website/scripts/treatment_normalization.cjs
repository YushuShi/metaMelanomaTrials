'use strict';
/* One batch client of the browser resolver. No second alias dictionary. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const canonical=value=>JSON.stringify(stable(value));
const sha=value=>crypto.createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
const list=value=>Array.isArray(value)?value:[];
const meaningful=value=>typeof value==='string'&&value.trim()&&value!=='NA';
const unique=values=>[...new Set(values.filter(value=>value!==undefined&&value!==null&&value!==''))].sort();

function load(registry,dist){
  const registryPath=path.join(dist,'treatment_registry.js');
  // Candidate dictionaries can be audited without replacing the served file.
  // All Node consumers in this process see the very same candidate object.
  require.cache[require.resolve(registryPath)]={id:registryPath,filename:registryPath,loaded:true,exports:registry};
  for(const file of ['treatment_resolver.js','treatment_groups.js','regimen_definitions.js'])delete require.cache[require.resolve(path.join(dist,file))];
  const resolver=require(path.join(dist,'treatment_resolver.js'));
  const validation=resolver.validateRegistry(registry);
  if(!validation.valid)throw new Error('Treatment registry validation failed: '+canonical(validation));
  return {resolver:resolver.create(registry),groups:require(path.join(dist,'treatment_groups.js')),definitions:require(path.join(dist,'regimen_definitions.js')),validation};
}
function compactDescription(description){
  const fields=['label','key','kind','agent_ids','class_ids','principal_class_ids','memberships','combination','sequence','operator','additional_intervention_ids','roles'];
  return Object.fromEntries(fields.filter(key=>description[key]!==undefined).map(key=>[key,description[key]]));
}
function normalizedState(resolution){
  return {status:resolution.status,canonical_ids:unique(resolution.canonical_ids||[resolution.canonical_id]),
    class_ids:unique(resolution.class_ids||[resolution.class_id]),broad_categories:unique(resolution.broad_categories||[resolution.broad_category]),
    role:resolution.role||null,active_exposure:resolution.active_exposure??null,match_method:resolution.match_method||null};
}
function baselineState(row){
  const old=row?.old_resolution||row||{},definition=row?.old_definition||{};
  return {status:old.known===false?'unresolved':old.agent_ids?.length?'resolved':old.class_ids?.length?'generic':'unresolved',
    canonical_ids:unique(old.agent_ids||[]),class_ids:unique(old.class_ids||[]),
    broad_categories:row?.authoritative_review?.broad_type&&row.authoritative_review.broad_type!=='Unclassified'?[row.authoritative_review.broad_type]:[],
    role:definition.role||null,active_exposure:null,match_method:'previous_application_projection'};
}
function issueType(resolution,raw,kind){
  if(['resolved','generic'].includes(resolution.status)&&resolution.role==='unclear'&&resolution.review_reason)return 'source_dependent_role';
  if(resolution.status==='ambiguous')return 'ambiguous_label';
  if(list(resolution.candidates).length)return 'new_alias';
  if(/\b(?:blocker|bmsca\d)|[^\s] {3,}[^\s]/i.test(raw))return 'possible_extraction_error';
  if(/\+|\band\b|\bfollowed\b|\bcombination\b|\bversus\b/i.test(raw))return 'combination';
  if(kind==='class')return 'known_generic_class';
  if(/\b(?:surgery|radiation|procedure|biopsy|infusion device)\b/i.test(raw))return 'non_drug_entity';
  return 'new_drug';
}
function build(input,{dist=path.resolve(__dirname,'../dist')}={}){
  const {registry}=input,{resolver,groups,definitions,validation}=load(registry,dist);
  const clinical=input.clinical||{},evidence=clinical.evidence_registry||{},records=list(input.records);
  const articles=new Map(list(clinical.articles).map(article=>[String(article.pmid),article]));
  const usedEvidence=new Set(),occurrences=new Map(),armProjections=new Map(),comparisonProjections={};
  const resolve=(raw,options={})=>resolver.resolve(raw,options);
  function sourceRefs(ids,binding,reportId){
    const prefix=binding?'CE-'+binding.slice(0,24)+'-':'';
    return unique(ids.map(id=>evidence[id]?id:prefix+id)).filter(id=>{
      const anchor=evidence[id];
      if(!anchor||prefix&&!id.startsWith(prefix)||reportId&&!String(anchor.source_id||'').startsWith(reportId+':'))return false;
      usedEvidence.add(id);return true;
    });
  }
  function arm(record,rawArm){
    const article=articles.get(String(record.pmid)),binding=record.review_binding_sha256||'';
    const key=sha([String(record.pmid),binding,record.source_sha256,rawArm.id]);
    const refs=sourceRefs(list(rawArm.evidence),binding,record.report_id);
    const context={pmid:String(record.pmid),report_id:record.report_id,review_stage:record.stage,
      source_input_sha256:record.source_sha256,review_binding_sha256:binding,task_id:record.task_id||null,
      arm_id:rawArm.id,population_id:rawArm.population_id,raw_arm_label:rawArm.label,
      current_main_eligible:article?.current_main_eligible===true,evidence_ids:refs,source_url:'https://pubmed.ncbi.nlm.nih.gov/'+record.pmid+'/'};
    const native={arm_id:rawArm.id,label:rawArm.label,root_node_id:rawArm.root_id,evidence_ids:refs,nodes:list(rawArm.nodes).map(node=>({node_id:node.id,kind:node.kind==='control'?'other':node.kind,
      name:meaningful(node.name)?node.name:null,drug_class:null,children:list(node.children),dose:meaningful(node.dose)?node.dose:null,route:meaningful(node.route)?node.route:null,schedule:meaningful(node.schedule)?node.schedule:null,evidence_ids:refs}))};
    const sourceBinding={comparison_id:'normalization:'+key,role:'source_arm',scope:{report_id:record.report_id,population_id:rawArm.population_id,review_stage:record.stage,source_input_sha256:record.source_sha256,review_binding_sha256:binding}};
    let definition;
    try{definition=groups.definitionFromNative(native,{source_binding:sourceBinding});}
    catch(error){throw new Error('Source arm projection '+canonical({pmid:record.pmid,arm_id:rawArm.id,binding,label:rawArm.label,nodes:native.nodes.map(node=>({id:node.node_id,kind:node.kind,name:node.name}))})+': '+error.message);}
    armProjections.set(key,{...context,arm_key:key,whole_label_resolution:resolve(rawArm.label||''),description:compactDescription(groups.describeDefinition(definition))});
    const projectedNodes=new Map();
    const remember=node=>{if(node.native_node_id)projectedNodes.set(node.native_node_id,node);list(node.children).forEach(remember);};remember(definition.root);
    for(const node of list(rawArm.nodes)){
      if(['AND','OR','SEQUENTIAL'].includes(node.kind)||!meaningful(node.name))continue;
      const id=sha([key,node.id,node.name,node.kind,node.dose,node.route,node.schedule]);
      const explicitContext=typeof node.exposure_context==='string'?node.exposure_context:typeof node.context==='string'?node.context:'';
      let resolution=projectedNodes.get(node.id)?.normalization||resolve(node.name,{context:explicitContext,...(meaningful(node.role)?{role:node.role}:{})});
      // Coverage follows the actual shared native projection, never a more
      // optimistic second parsing of the same raw component label.
      const projected=projectedNodes.get(node.id);
      if(resolution.status==='unresolved'&&projected?.children){
        const leaves=[];const visit=part=>part.children?part.children.forEach(visit):leaves.push(part);visit(projected);
        if(leaves.length>1&&leaves.every(leaf=>leaf.normalization&&!['unresolved','ambiguous'].includes(leaf.normalization.status))){
          resolution={...resolution,status:'structured',canonical_ids:unique(leaves.map(leaf=>leaf.agent_id)),class_ids:unique(leaves.map(leaf=>leaf.class_id)),canonical_id:null,class_id:null,
            broad_categories:unique(leaves.map(leaf=>leaf.normalization.broad_category)),active_exposure:leaves.every(leaf=>leaf.normalization.active_exposure===true),
            match_method:'shared_native_regimen_graph',review_reason:null,operator:projected.type,source_ids:unique(leaves.flatMap(leaf=>leaf.normalization.source_ids||[]))};
        }
      }
      if(['negated','prior_history','preparation'].includes(definition.role))resolution={...resolution,role:definition.role,active_exposure:false,role_scope:'source_arm'};
      occurrences.set(id,{occurrence_id:id,arm_key:key,...context,node_id:node.id,node_kind:node.kind,raw_label:node.name,
        dose:node.dose??null,route:node.route??null,schedule:node.schedule??null,
        source_role:node.role??null,source_context:explicitContext||null,resolution});
    }
  }
  for(const record of records)for(const rawArm of list(record.arms))arm(record,rawArm);
  function legacyArm(comparison,role,definition){
    const nodes=[],scope=comparison.scope||{};
    const walk=(node,position)=>{
      const id='legacy-'+role+'-'+position;
      const operator=['and','or','sequential'].includes(node.type);
      const children=operator?list(node.children).map((child,index)=>walk(child,position+'.'+index)):[];
      nodes.push({id,kind:operator?node.type.toUpperCase():['drug','agent'].includes(node.type)?'drug':node.type==='class'?'class':node.type==='unknown'?'UNKNOWN':'control',
        name:operator?'NA':node.raw_label||node.name||'NA',children,dose:node.dose||'NA',route:node.route||'NA',schedule:node.schedule||'NA'});
      return id;
    };
    const root=walk(definition.root,'0');
    return {id:comparison[role+'_arm_id']||comparison.comparison_id+':'+role,label:definition.raw_label,population_id:scope.population_id,
      root_id:root,nodes,evidence:unique([...list(definition.evidence_ids),...list(comparison[role+'_arms']).flatMap(value=>[...list(value.evidence_ids),...list(value.source_arm?.evidence_ids)])])};
  }
  for(const article of articles.values())for(const comparison of list(article.comparisons)){
    const prepared=definitions.prepareComparison(comparison),roles={};
    for(const role of ['comparator','intervention',...(comparison.outcome_arm_id?['outcome']:[])]){
      const definition=prepared[role+'_regimen'];roles[role]={raw_label:definition.raw_label,source_binding:definition.source_binding,description:compactDescription(definitions.describe(definition)),definition};
      // Legacy clinical exports lack raw compact records. Their exact saved
      // native graph still provides the arm/node identity; never mine a title.
      const native=comparison[role+'_native_regimen'];
      if(!records.length&&native){const scope=comparison.scope||{};arm({pmid:article.pmid,report_id:article.report_id,stage:scope.review_stage,source_sha256:scope.source_input_sha256,review_binding_sha256:scope.review_binding_sha256},
        {id:native.arm_id,label:native.label,population_id:scope.population_id,root_id:native.root_node_id,evidence:native.evidence_ids||[],nodes:list(native.nodes).map(node=>({id:node.node_id,kind:node.kind==='other'?'control':node.kind,name:node.name||'NA',children:node.children,dose:node.dose||'NA',route:node.route||'NA',schedule:node.schedule||'NA'}))});}
      else if(!records.length){const scope=comparison.scope||{};arm({pmid:article.pmid,report_id:article.report_id,stage:scope.review_stage,source_sha256:scope.source_input_sha256,review_binding_sha256:scope.review_binding_sha256},legacyArm(comparison,role,definition));}
    }
    comparisonProjections[comparison.comparison_id]={pmid:String(article.pmid),report_id:article.report_id,scope:comparison.scope,roles};
  }
  const entries=[...occurrences.values()].sort((a,b)=>a.occurrence_id.localeCompare(b.occurrence_id));
  const previous=new Map(list(input.previous?.occurrences).map(entry=>[entry.occurrence_id,entry]));
  const baseline=new Map(list(input.baseline_labels).flatMap(row=>[row.raw_label,...list(row.raw_variants)].map(label=>[String(label).toLowerCase(),row])));
  const changes=[],regressions=[];
  for(const entry of entries){
    const old=previous.get(entry.occurrence_id),oldState=old?normalizedState(old.resolution):baseline.has(entry.raw_label.toLowerCase())?baselineState(baseline.get(entry.raw_label.toLowerCase())):null;
    const next=normalizedState(entry.resolution);
    if(oldState&&canonical(oldState)!==canonical(next)){
      changes.push({occurrence_id:entry.occurrence_id,pmid:entry.pmid,arm_key:entry.arm_key,arm_id:entry.arm_id,node_id:entry.node_id,raw_label:entry.raw_label,evidence_ids:entry.evidence_ids,old:oldState,proposed:next,
        disposition:['unresolved','ambiguous'].includes(next.status)?'source_review_required':'verified_deterministic_projection'});
      if(!['unresolved','ambiguous'].includes(oldState.status)&&['unresolved','ambiguous'].includes(next.status))regressions.push({occurrence_id:entry.occurrence_id,raw_label:entry.raw_label,pmid:entry.pmid,reason:'Previously classified occurrence is now unresolved; review the preserved source and registry change.'});
    }
  }
  const queueMap=new Map();
  for(const entry of entries){
    const resolution=entry.resolution;
    if(!['unresolved','ambiguous'].includes(resolution.status)&&!(resolution.role==='unclear'&&resolution.review_reason))continue;
    const key=sha([resolution.normalized_label,resolution.review_reason,issueType(resolution,entry.raw_label,entry.node_kind)]);
    let item=queueMap.get(key);
    if(!item){item={id:key,normalized_label:resolution.normalized_label,raw_labels:new Set(),status:resolution.status,
      issue_type:issueType(resolution,entry.raw_label,entry.node_kind),reason:resolution.review_reason||'No verified complete alias or generic class mapping.',
      candidates:resolution.candidates||[],pmids:new Set(),arm_keys:new Set(),occurrence_ids:[],evidence_ids:new Set(),source_urls:new Set(),eligible_pmids:new Set()};queueMap.set(key,item);}
    item.raw_labels.add(entry.raw_label);item.pmids.add(entry.pmid);item.arm_keys.add(entry.arm_key);item.occurrence_ids.push(entry.occurrence_id);
    entry.evidence_ids.forEach(id=>item.evidence_ids.add(id));item.source_urls.add(entry.source_url);if(entry.current_main_eligible)item.eligible_pmids.add(entry.pmid);
  }
  const queue=[...queueMap.values()].map(item=>({...item,raw_labels:[...item.raw_labels].sort(),pmids:[...item.pmids].sort(),report_count:item.pmids.size,
    arm_keys:[...item.arm_keys].sort(),arm_count:item.arm_keys.size,eligible_report_count:item.eligible_pmids.size,eligible_pmids:[...item.eligible_pmids].sort(),
    occurrence_ids:item.occurrence_ids.sort(),evidence_ids:[...item.evidence_ids].sort(),source_urls:[...item.source_urls].sort()})).sort((a,b)=>b.eligible_report_count-a.eligible_report_count||b.report_count-a.report_count||a.normalized_label.localeCompare(b.normalized_label));
  function coverage(rows){
    const states={};for(const row of rows)states[row.resolution.status]=(states[row.resolution.status]||0)+1;
    const labels=new Map();for(const row of rows){const key=row.raw_label.toLowerCase();if(!labels.has(key))labels.set(key,[]);labels.get(key).push(row);}
    return {source_node_occurrences:rows.length,distinct_raw_labels:new Set(rows.map(row=>row.raw_label)).size,casefold_label_groups:labels.size,
      casefold_label_groups_fully_classified:[...labels.values()].filter(group=>group.every(row=>!['unresolved','ambiguous'].includes(row.resolution.status))).length,
      normalized_labels:new Set(rows.map(row=>row.resolution.normalized_label)).size,
      reports:new Set(rows.map(row=>row.pmid)).size,source_arms:new Set(rows.map(row=>row.arm_key)).size,statuses:states,
      classified_occurrences:rows.filter(row=>!['unresolved','ambiguous'].includes(row.resolution.status)).length};
  }
  const metadata={schema_version:1,registry_version:registry.version,normalization_version:registry.normalization_version,
    registry_sha256:sha(registry),resolver_sha256:sha(fs.readFileSync(path.join(dist,'treatment_resolver.js'),'utf8')),
    treatment_groups_sha256:sha(fs.readFileSync(path.join(dist,'treatment_groups.js'),'utf8')),
    regimen_definitions_sha256:sha(fs.readFileSync(path.join(dist,'regimen_definitions.js'),'utf8')),
    source_path:input.source_path,source_file_sha256:input.source_file_sha256,clinical_content_sha256:clinical.content_sha256||null};
  const auditData={...metadata,record_kind:'source_bound_treatment_normalization_audit',occurrences:entries,arms:Object.fromEntries([...armProjections].sort(([a],[b])=>a.localeCompare(b))),
    evidence_registry:Object.fromEntries([...usedEvidence].sort().map(id=>[id,evidence[id]])),
    summary:{all:coverage(entries),current_main_eligible:coverage(entries.filter(row=>row.current_main_eligible)),comparisons:Object.keys(comparisonProjections).length,
      source_arms_unit:'Extraction-context arms (source/review/arm IDs); not independent clinical arms or cohorts.'}};
  auditData.content_sha256=sha(auditData);
  const profiles={};
  for(const comparison of Object.values(comparisonProjections))for(const role of Object.values(comparison.roles)){
    const {source_binding,...definition}=role.definition,ref=sha(definition);profiles[ref]=definition;
    role.definition_ref=ref;delete role.definition;
  }
  const auditPath='website/dist/data/'+(String(input.source_path).endsWith('/clinical_evidence.json')?'clinical_':'')+'treatment_normalization_audit.json';
  const normalizations={...metadata,record_kind:'source_bound_treatment_normalizations',scope:'Prepared source-bound comparison definitions; full occurrence audit is loaded separately when requested.',
    comparisons:comparisonProjections,definition_profiles:profiles,audit_ref:{path:auditPath,content_sha256:auditData.content_sha256},summary:auditData.summary,
    consumer_contract:{shared_registry:true,shared_resolver:true,raw_scientific_data_changed:false,eligibility_changed:false,stale_registry_classification_requires_rebuild:true}};
  normalizations.content_sha256=sha(normalizations);
  const reviewQueue={...metadata,record_kind:'treatment_normalization_review_queue',normalization_content_sha256:normalizations.content_sha256,
    count_note:'Per-label report/arm counts overlap and must not be summed as independent evidence.',
    summary:{review_labels:queue.length,unresolved_identity_labels:queue.filter(row=>['unresolved','ambiguous'].includes(row.status)).length,
      source_dependent_role_labels:queue.filter(row=>row.issue_type==='source_dependent_role').length},items:queue};
  reviewQueue.content_sha256=sha(reviewQueue);
  return {normalizations,normalization_audit:auditData,review_queue:reviewQueue,review_documents:require('./build_drug_type_review.cjs').render(registry,auditData,reviewQueue),audit:{...metadata,registry_validation:validation,compared_occurrences:entries.filter(entry=>previous.has(entry.occurrence_id)||baseline.has(entry.raw_label.toLowerCase())).length,
    changed_occurrences:changes.length,changed_reports:new Set(changes.map(row=>row.pmid)).size,changed_arms:new Set(changes.map(row=>row.arm_key)).size,
    new_occurrences:entries.filter(entry=>!previous.has(entry.occurrence_id)&&!baseline.has(entry.raw_label.toLowerCase())).length,changes,regressions,
    unresolved_labels:reviewQueue.summary.unresolved_identity_labels,review_labels:queue.length,
    source_dependent_role_labels:reviewQueue.summary.source_dependent_role_labels,source_retrieval_requests:0,model_requests:0,scientific_data_changed:false}};
}
module.exports={build,load};
if(require.main===module){try{const input=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(build(input)));}catch(error){process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;}}
