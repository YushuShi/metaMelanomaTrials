/* Compact, source-checked extraction display. Raw requests and audit code stay off the UI. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./clinical_evidence.js'),require('./confidence_intervals.js'),require('./trial_identifiers.js'),require('./single_arm_denominators.js'));
  else root.QuantitativeExtraction=factory(root.ClinicalEvidence,root.ConfidenceIntervals,root.TrialIdentifiers,root.SingleArmDenominators);
})(typeof globalThis==='undefined'?this:globalThis,function(clinical,confidenceIntervals,trialIdentity,denominators){
  'use strict';
  const list=value=>Array.isArray(value)?value:[];
  const need=(value,message)=>{if(!value)throw new Error(message);};
  const text=value=>value===null||value===undefined||value===''?'NA':typeof value==='object'?text(value.label??value.text??value.value):String(value);
  const clean=value=>text(value).replace(/_/g,' ');
  const numberFormat=new Intl.NumberFormat('en-US',{useGrouping:false,maximumFractionDigits:2});
  // Only numerical display fields use this formatter. Source quotations, doses,
  // qualifiers and p-values retain their original text and precision.
  function formatNumber(value){
    const numeric=typeof value==='number'?value:typeof value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())?Number(value):NaN;
    return Number.isFinite(numeric)?numberFormat.format(Object.is(numeric,-0)?0:numeric).replace(/^-0$/,'0'):text(value);
  }
  const formatEffectNumber=value=>confidenceIntervals.formatEffectNumber(value,text(value));
  function cleanContext(value){
    let label=typeof value==='object'?value?.label:value;
    if(label===null||label===undefined||label==='')return 'NA';
    label=String(label).replace(/\s*\((?:data\s+)?cut[- ]?off(?:\s+(?:date|time))?\s*:?\s*[^)]*\)/gi,'');
    label=label.split(/\s*·\s*/).map(part=>part.replace(/\b(?:data\s+)?cut[- ]?off(?:\s+(?:date|time))?(?:\s*:|\s+not reported\b).*$/i,'').trim()).filter(Boolean).join(' · ');
    const hasSubtype=/\b(?:mucosal|uveal|ocular|acral|desmoplastic|conjunctival|choroidal|iris|spitzoid|amelanotic|nodular|ciliary body|lentigo maligna|superficial spreading|non[- ]cutaneous)\b/i.test(label);
    label=label.replace(/\b(?:cutaneous\s+)?melanomas?\b/gi,(match,index,source)=>{
      // Keep mixed subtype alternatives intact, including "mucosal or
      // cutaneous melanoma", rather than leaving a dangling conjunction.
      const prefix=source.slice(0,index);
      return hasSubtype||/\bnon[- ]$/i.test(prefix)?match:'';
    });
    label=label.replace(/\s+cohort$/i,'').replace(/\(\s*\)/g,'').replace(/\s+/g,' ').replace(/^[\s·,;:|–—]+|[\s·,;:|–—]+$/g,'').trim();
    if(/^\([^()]*\)$/.test(label))label=label.slice(1,-1).trim();
    return label.replace(/^(?:patients?|participants?)\s+in\s+/i,'');
  }
  const escape=value=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ENDPOINTS=Object.freeze({overall_survival:'OS',progression_free_survival:'PFS',recurrence:'RFS',recurrence_free_survival:'RFS',relapse_free_survival:'RFS',disease_free_survival:'DFS',event_free_survival:'EFS',distant_metastasis_free_survival:'DMFS',disease_specific_survival:'DSS',duration_of_response:'DOR',response:'ORR',objective_response_rate:'ORR',overall_response_rate:'ORR',complete_response:'CR',partial_response:'PR',disease_control_rate:'DCR',pathological_complete_response:'pCR',AE_any:'Any AE',AE_grade_ge3:'Grade ≥3 AE',AE_grade_3_4:'Grade 3–4 AE',AE_serious:'Serious AE',AE_immune_related:'Immune-related AE',AE_discontinuation:'AE discontinuation',treatment_related_death:'Treatment-related death'});
  const endpoint=value=>ENDPOINTS[value]||clean(value);
  function definition(row){
    let label=typeof row?.endpoint_definition==='string'?row.endpoint_definition.trim():'';
    if(!label||label==='NA')return endpoint(row?.endpoint);
    for(const [pattern,code]of [
      [/\bcomplete or partial responses?\b/gi,'CR or PR'],[/\b(?:objective|overall) response(?: rate)?\b/gi,'ORR'],[/\bpatholog(?:ical|ic) complete response\b/gi,'pCR'],[/\bcomplete response(?: rate)?\b/gi,'CR'],[/\bpartial response(?: rate)?\b/gi,'PR'],[/\bdisease control(?: rate)?\b/gi,'DCR'],
      [/\boverall survival\b/gi,'OS'],[/\bprogression[ -]free survival\b/gi,'PFS'],[/\b(?:recurrence|relapse)[ -]free survival\b/gi,'RFS'],[/\bdisease[ -]free survival\b/gi,'DFS'],[/\bevent[ -]free survival\b/gi,'EFS'],[/\bdistant metastasis[ -]free survival\b/gi,'DMFS'],[/\bdisease[ -]specific survival\b/gi,'DSS'],[/\bduration of response\b/gi,'DOR'],[/\badverse events?\b/gi,'AE']
    ])label=label.replace(pattern,code);
    return label.replace(/\s+/g,' ');
  }
  function checked(payload){
    need(payload?.schema_version===1&&Array.isArray(payload.articles),'Compact extraction snapshot required');
    const fulltext=payload.fulltext_assessment;
    const reviews=new Map();
    if(fulltext){
      need(payload.mode==='pilot'&&fulltext.schema_version===1&&fulltext.phase_id===payload.phase_id&&/^[a-f0-9]{64}$/.test(fulltext.R2_publication_ref?.sha256||'')&&Array.isArray(fulltext.reports),'Frozen R2-bound full-text assessment required');
      for(const report of fulltext.reports){
        need(/^\d+$/.test(report.pmid)&&!reviews.has(report.pmid)&&typeof report.entered==='boolean'&&typeof report.report_complete==='boolean','Unique full-text report status required');
        reviews.set(report.pmid,report);
      }
    }
    if(payload.mode==='pilot'){
      need(payload.publication_ready===true,'Pilot publication is not ready');
      need(Array.isArray(payload.scope_pmids)&&payload.scope_pmids.length>0&&new Set(payload.scope_pmids).size===payload.scope_pmids.length&&payload.scope_pmids.every(id=>/^\d+$/.test(id)),'Exact pilot PMID scope required');
    }
    const seen=new Set(),scope=new Set(payload.scope_pmids||[]);
    for(const article of payload.articles){
      need(/^\d+$/.test(article.pmid)&&!seen.has(article.pmid)&&Array.isArray(article.records),'Unique compact PMID record required');seen.add(article.pmid);
      if(payload.mode==='pilot'){
        need(scope.has(article.pmid),'Compact article outside pilot scope');
        need(article.records.length===(fulltext&&['complete','complete_with_issues'].includes(reviews.get(article.pmid)?.technical_state)?2:1),'Current R2 and accepted R3 record count differs');
        need(article.records[0]?.stage==='R2','Frozen R2 record must remain first');
      }
      for(const saved of article.records){
        need(saved.record&&String(saved.record.pmid)===article.pmid&&['R2','R3'].includes(saved.stage),'Compact source identity differs');
        if(payload.mode==='pilot'){
          need(saved.stage==='R2'||fulltext&&saved===article.records[1]&&saved.stage==='R3','Pilot cannot display unbound full-text extraction');
          need(saved.record.stage===saved.stage&&['retain','exclude','unclear'].includes(saved.record.decision?.status),'Current screening decision missing');
          if(saved.stage==='R3')need(reviews.get(article.pmid)?.entered===true&&/^[a-f0-9]{64}$/.test(saved.source_proof_ref?.sha256||'')&&['retain','unclear'].includes(article.records[0].record.decision.status),'Full-text review requires eligible frozen R2 and source proof');
        }
      }
    }
    if(payload.mode==='pilot'){
      need(seen.size===scope.size,'Pilot publication is incomplete');
      need(payload.clinical_evidence&&Array.isArray(payload.clinical_evidence.articles),'Pilot clinical projection required');
      const clinicalIds=payload.clinical_evidence.articles.map(article=>article.pmid);
      need(clinicalIds.length===scope.size&&new Set(clinicalIds).size===scope.size&&clinicalIds.every(id=>scope.has(id)),'Pilot clinical projection differs from PMID scope');
      if(fulltext){
        need([...reviews.keys()].every(pmid=>scope.has(pmid)),'Full-text report outside frozen R2 scope');
        const completed=payload.articles.filter(article=>article.records.length===2);
        need(fulltext.main_article_extraction_finished===completed.length&&fulltext.full_report_extraction_finished===[...reviews.values()].filter(r=>r.report_complete).length,'Full-text coverage counts differ');
        const counts=payload.about_progress?.stages?.R3;
        need(counts?.screening_finished===completed.length&&counts.entered===[...reviews.values()].filter(r=>r.entered).length,'Full-text screening counts differ');
        for(const [decision,key]of [['retain','retained'],['exclude','excluded'],['unclear','unclear']])need(counts[key]===completed.filter(a=>a.records[1].record.decision.status===decision).length,'Full-text decision totals differ');
        for(const article of payload.clinical_evidence.articles){
          const saved=payload.articles.find(a=>a.pmid===article.pmid);
          need(article.current_screening_status===saved.records.at(-1).record.decision.status,'Current full-text decision differs');
        }
      }
    }
    return payload;
  }
  function citationOnly(study){
    return {report_id:study.report_id,pmid:study.pmid,title:study.title,year:study.year,doi:study.doi,
      first_author_surname:study.first_author_surname,author_display:study.author_display,
      default_visible:false,current_main_eligible:false,comparisons:[],single_arm_regimens:[],details:{}};
  }
  function merge(studies,registry,payload){
    checked(payload);
    const pilot=payload.mode==='pilot',scope=new Set(payload.scope_pmids||[]);
    const base=pilot?studies.filter(study=>scope.has(String(study.pmid))).map(citationOnly):studies;
    const merged=payload.clinical_evidence?clinical.merge(base,pilot?{}:registry,payload.clinical_evidence):{studies:base,evidence_registry:registry};
    const articles=new Map(payload.articles.map(article=>[article.pmid,article]));
    const result=merged.studies.filter(study=>!pilot||scope.has(String(study.pmid))).map(study=>{
      const article=articles.get(String(study.pmid));if(!article)return study;
      return {...study,quantitative_only:pilot,details:{...study.details,quantitative_extraction:article.records,
        outcome_display_reconciliation:(payload.fulltext_assessment?.display_reconciliation||[]).filter(action=>String(action.pmid)===String(article.pmid)),
        fulltext_assessment:payload.fulltext_assessment?.reports?.find(r=>r.pmid===article.pmid)||null}};
    });
    if(pilot)need(result.length===scope.size,'Pilot metadata missing');
    return {studies:result,evidence_registry:merged.evidence_registry};
  }
  const effectiveCache=new WeakMap();
  function effectiveRecord(wrapper){
    const source=wrapper.record||{}, preferences=wrapper.source_preferences;
    if(!preferences)return source;
    const cached=effectiveCache.get(wrapper);
    if(cached?.preferences===preferences&&cached.source===source)return cached.record;
    const record={...source};
    for(const [section,decisions] of Object.entries(preferences)){
      record[section]=list(source[section]).filter(row=>decisions[row.id]?.status!=='superseded_abstract')
        .map(row=>decisions[row.id]?.values?{...row,...decisions[row.id].values}:row);
      for(const [id,choice] of Object.entries(decisions)) if(choice.derived_fields?.length){
        record.derivations=[...list(record.derivations),...choice.derived_fields.map(field=>({section,id,field,method:choice.derivation}))];
      }
    }
    effectiveCache.set(wrapper,{preferences,source,record});
    return record;
  }
  function records(study){return list(study?.details?.quantitative_extraction).filter(saved=>saved.record).map(effectiveRecord);}
  function trialIdentifiers(study){
    const names=[],ids=[],provenance=[];
    for(const saved of list(study?.details?.quantitative_extraction)){
      const record=saved.record;if(!record)continue;
      const s=record.study||{};
      const basis={source_kind:'accepted_quantitative_study_metadata',pmid:String(record.pmid||study.pmid||''),stage:saved.stage||record.stage,task_id:saved.task_id,source_sha256:record.source_sha256,evidence_ids:[...list(s.evidence)]};
      for(const value of [s.study_name,s.trial_name,s.name])if(typeof value==='string'&&value!=='NA'&&value.trim()){
        names.push(value.trim());provenance.push({...basis,field:'name',value:value.trim(),relation:'own_study'});
      }
      for(const value of [...list(s.identifiers),...list(s.study_identifiers),s.identifier,s.nct_id,s.nct_number]){
        const label=typeof value==='object'?value?.value||value?.identifier||value?.id:value;
        if(typeof label==='string')for(const id of (label.match(/\bNCT\d{8}\b/gi)||[]).map(x=>x.toUpperCase())){
          ids.push(id);provenance.push({...basis,field:'nct',value:id,relation:'own_study'});
        }
      }
    }
    const uniqueNames=[...new Set(names)],uniqueIds=[...new Set(ids)];
    // R2 and R3 retain their original metadata above. The same source-qualified
    // alias registry used by the map supplies the display name and registration.
    return trialIdentity.harmonize({names:uniqueNames,nct_ids:uniqueIds,provenance,pmid:String(study.pmid||'')});
  }
  function table(title,headers,rows){
    if(!rows.length)return '';
    return `<section class="drawer-section"><h3>${escape(title)}</h3><div class="table-scroll"><table class="compact-extraction-table"><thead><tr>${headers.map(label=>`<th scope="col">${escape(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(value=>`<td>${escape(typeof value==='number'?formatNumber(value):value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  }
  function fields(title,rows){
    return `<section class="drawer-section"><h3>${escape(title)}</h3><dl class="compact-extraction-fields">${rows.map(([label,value])=>`<dt>${escape(label)}</dt><dd>${escape(clean(value))}</dd>`).join('')}</dl></section>`;
  }
  function interval(row,estimate=row.estimate,options={}){
    const display=confidenceIntervals.forDisplay({...row,estimate},options);
    if(display.ci_95_unavailable&&!options.original)return formatEffectNumber(estimate)+' (95% CI unavailable)';
    if(display.ci_converted)return formatEffectNumber(estimate)+` (${formatEffectNumber(display.ci_lower)}–${formatEffectNumber(display.ci_upper)}; approximate 95% CI, converted)`;
    const ci=row.ci||{},lo=row.ci_lower??ci.lower??ci.low??'NA',hi=row.ci_upper??ci.upper??ci.high??'NA',level=row.ci_level??row.confidence_level??ci.level??95;
    const derived=row.derived_ci,marked=derived?.method==='derived_two_sided_Wald'&&derived.ci_lower===lo&&derived.ci_upper===hi;
    const suffix=lo!=='NA'||hi!=='NA'?` (${formatEffectNumber(lo)}–${formatEffectNumber(hi)}${marked?'; derived 95% Wald CI':Number(level)!==95?`; ${formatNumber(level)}% CI`:''})`:'';
    return formatEffectNumber(estimate)+suffix;
  }
  function regimen(arm,{deduplicateAlternatives=true}={}){
    if(typeof arm?.regimen_label==='string')return arm.regimen_label;
    const nodes=list(arm?.nodes||arm?.regimen?.nodes),by=new Map(nodes.map(node=>[node.node_id||node.id,node]));
    const root=arm?.root_id||arm?.root_node_id||arm?.regimen?.root_node_id;
    function visit(id,seen=new Set()){
      const node=by.get(id);if(!node||seen.has(id))return 'NA';
      const next=new Set(seen);next.add(id);const kind=node.kind||node.operator;
      if(['AND','OR','SEQUENTIAL'].includes(kind)){
        let children=list(node.children).map(id=>({label:visit(id,next),kind:by.get(id)?.kind||by.get(id)?.operator}));
        if(kind==='OR'&&deduplicateAlternatives){const seenLabels=new Set();children=children.filter(child=>{const key=child.label.normalize('NFKC').replace(/\s+/g,' ').toLowerCase();if(seenLabels.has(key))return false;seenLabels.add(key);return true;});}
        if(children.length===1)return children[0].label;
        return children.map(child=>['AND','OR','SEQUENTIAL'].includes(child.kind)&&child.kind!==kind?`(${child.label})`:child.label).join(kind==='AND'?' + ':kind==='OR'?' OR ':' → ');
      }
      return text(node.name||node.generic_name);
    }
    return root&&nodes.length?visit(root):text(arm?.label||arm?.name);
  }
  function armLabels(record,{withinPopulation=false}={}){
    const groups=new Map(),doses=new Map();
    for(const arm of list(record.arms)){
      const label=regimen(arm),group=withinPopulation?JSON.stringify([arm.population_id,label]):label,parts=list(arm.nodes).filter(n=>n.dose&&n.dose!=='NA');
      const dose=[...new Set(parts.map(n=>`${parts.length>1&&n.name&&n.name!=='NA'?n.name+' ':''}${n.dose}`))].join('; ');
      if(!groups.has(group))groups.set(group,new Set());groups.get(group).add(dose);doses.set(arm.id||arm.arm_id,dose);
    }
    return new Map(list(record.arms).map(arm=>{const label=regimen(arm),group=withinPopulation?JSON.stringify([arm.population_id,label]):label,dose=doses.get(arm.id||arm.arm_id);return [arm.id||arm.arm_id,groups.get(group).size>1&&dose?label+' ('+dose+')':label];}));
  }
  function resultDoseLabel(study,row){
    const q=row.quantitative_record;if(!q)return '';
    const record=records(study).find(r=>r.source_sha256===row.source_input_sha256&&['effects','survival','binary'].some(section=>list(r[section]).some(result=>result.id===q.id)));
    if(!record)return '';
    const labels=armLabels(record,{withinPopulation:true}),arms=new Map(list(record.arms).map(a=>[a.id,a]));
    const changed=id=>arms.has(id)&&labels.get(id)!==regimen(arms.get(id));
    if(q.arm_id)return changed(q.arm_id)?labels.get(q.arm_id):'';
    if(changed(q.intervention_arm_id)&&changed(q.reference_arm_id))return `${labels.get(q.intervention_arm_id)||'NA'} vs ${labels.get(q.reference_arm_id)||'NA'}`;
    if(changed(q.intervention_arm_id))return labels.get(q.intervention_arm_id);
    if(changed(q.reference_arm_id))return labels.get(q.reference_arm_id)+' (reference)';
    return '';
  }
  function sourceRecord(study,row){
    const source=row?.source_input_sha256||row?.scope?.source_input_sha256;
    return records(study).find(record=>record.source_sha256===source)||null;
  }
  function recoveredDenominator(row){
    const saved=denominators?.[row?.result_id],q=row?.quantitative_record;
    if(!saved||!q||row.scoped_sample_size?.status!=='missing'||row.extraction_conflict||q.display_n?.status==='CONFLICTING'||q.complementary_count_scope==='source_reviewed_unavailable')return null;
    const scope=[String(row.pmid),row.source_input_sha256,q.endpoint,q.population_id,q.arm_id];
    if(!scope.every((value,i)=>value===saved.scope[i]))return null;
    if(!['percentage','ci_lower','ci_upper','ci_level','numerator'].every((k,i)=>q[k]===saved.input[i]))return null;
    const approximate=saved.status==='approximate',methods=saved.methods.join(', ');
    const range=saved.range[0]===saved.range[1]?String(saved.n):saved.range.join('–');
    const note=approximate?'Compatible N '+range+'. '+(saved.method_source?'Reported interval method: ':'Compatible interval methods: ')+methods+'.':saved.method_source||('Unique denominator from '+methods+'.');
    const display=approximate?saved.n+' (approx.)':saved.status==='derived'?saved.n+' (derived)':String(saved.n);
    return {n:approximate?null:saved.n,status:saved.status,basis:'single_arm_endpoint_denominator',display, note,
      count_purpose:'outcome_analysis',count_ids:[],range:saved.range,reported_percentage:saved.reported_percentage};
  }
  // A reviewed presentation correction, not a new extracted denominator. In
  // CheckMate 915 the source explicitly defines safety as the treated population.
  // Four missing safety denominators inherited the randomized fallback because
  // their observation window was stored in cutoff. Keep all saved facts intact.
  function presentationSampleSize(study,row,{registry={},samples=study?.details?.sample_size_records}={}){
    if(row?.quantitative_record?.complementary_count_scope==='source_reviewed_unavailable')
      return {n:null,status:'unverified',basis:'source_population_mismatch',count_purpose:'outcome_analysis',count_ids:[],unverified_label:'NA'};
    const recovered=recoveredDenominator(row);
    if(recovered)return recovered;
    const r2Identity={pmid:'36162037',report_id:'report-8ab2816667ca355de5fec208',review_stage:'R2',source_input_sha256:'d9edaf893efe7b740487d841b8f670049c452bf8c9d74789fa570c5b4dddfa9d',review_binding_sha256:'44064cc7c2d045a6c3eaa48b98cfb4536eb882227c6a17af560346527dad11e5'};
    if(String(study?.pmid)===r2Identity.pmid&&Object.entries(r2Identity).every(([key,value])=>String(row?.[key])===value)){
      const q=row.quantitative_record,record=sourceRecord(study,row),prefix='CE-'+r2Identity.review_binding_sha256.slice(0,24)+'-';
      const missing=value=>value===null||value===undefined||value===''||value==='NA';
      const conflicting=value=>value?.extraction_conflict||/conflict/i.test(String(value?.status||''))||list(value?.field_flags).some(flag=>/conflict/i.test(String(flag.code||'')));
      const rfs={e1:{section:'effects',n:1833,count:'n1'},s1:{section:'survival',n:916,count:'n2',arm:'a1'},s2:{section:'survival',n:917,count:'n3',arm:'a2'}}[q?.id];
      if(!rfs||q.endpoint!=='RFS'||q.origin!=='own_report'||q.population_id!=='p1'||q.cutoff!=='NA'||!record||record.stage!=='R2'||record.report_id!==r2Identity.report_id)return null;
      if(!missing(q.analysis_n)||!missing(q.denominator)||q.display_n?.status!=='fallback'||q.display_n?.count_purpose!=='treated'||q.display_n?.n!==rfs.n||JSON.stringify(q.display_n.count_ids)!==JSON.stringify([rfs.count]))return null;
      const saved=list(record[rfs.section]).find(result=>result.id===q.id),count=list(record.sample_sizes).find(count=>count.id===rfs.count);
      if([row,q,row.analysis_n,row.denominator,row.scoped_sample_size,q.display_n,saved,count].some(conflicting)||!missing(row.denominator?.value)||!missing(row.analysis_n?.value)&&row.analysis_n.value!==rfs.n)return null;
      if(row.population_id!==prefix+'p1'||row.population?.entity_id!=='p1'||!saved||saved.endpoint!=='RFS'||saved.population_id!=='p1'||!missing(saved.analysis_n)||!missing(saved.denominator)||saved.display_n?.n!==rfs.n)return null;
      if(rfs.arm){
        if(q.arm_id!==rfs.arm||row.arm_id!==prefix+rfs.arm||row.arm?.entity_id!==rfs.arm||saved.arm_id!==rfs.arm||q.kind!=='survival_probability'||saved.kind!==q.kind||q.time!==24||q.time_unit!=='months')return null;
      }else if(q.measure!=='HR'||q.intervention_arm_id!=='a1'||q.reference_arm_id!=='a2'||row.experimental_arm?.entity_id!=='a1'||row.comparator_arm?.entity_id!=='a2'||saved.intervention_arm_id!=='a1'||saved.reference_arm_id!=='a2')return null;
      if(!count||count.n!==rfs.n||count.count_purpose!=='treated'||count.method!=='reported'||count.complete!=='yes'||count.population_id!=='p1'||count.arm_id!==(rfs.arm||'NA')||list(count.field_flags).length)return null;
      const resultsId=prefix+'span-481ad282be080ce416338f4c',methodsId=prefix+'span-63974e82530134af2d5f00c0',results=registry[resultsId],methods=registry[methodsId],sourceId=r2Identity.report_id+':citation';
      if(results?.source_id!==sourceId||methods?.source_id!==sourceId||!String(results.supporting_quote).includes('RFS in the all-randomly assigned patient population')||!String(methods.supporting_quote).includes('1,833 patients received nivolumab'))return null;
      // The abstract supplies a treated count for a randomized RFS result. Do
      // not import R3's N across the saved conflicting extraction relationship.
      return {n:null,status:'unverified',count_purpose:'outcome_analysis',count_ids:[rfs.count],basis:'source_population_mismatch',label:'RFS · all randomized',population_label:'All randomized',unverified_label:'NA · randomized population',evidence_ids:[resultsId,methodsId],source_input_sha256:r2Identity.source_input_sha256,review_binding_sha256:r2Identity.review_binding_sha256,original_fallback_n:rfs.n};
    }
    const identity={pmid:'36162037',report_id:'report-8ab2816667ca355de5fec208',review_stage:'R3',source_input_sha256:'e5aa82ef88d927e7532ad29cf82c6c23b49999a3b42ff475be071edd8436c9e4',review_binding_sha256:'2c281f79e223b205065e489bbcece1653cf681883b388d32e8752e97e3fefddc'};
    if(String(study?.pmid)!==identity.pmid||Object.entries(identity).some(([key,value])=>String(row?.[key])!==value))return null;
    const q=row?.quantitative_record,record=sourceRecord(study,row),prefix='CE-'+identity.review_binding_sha256.slice(0,24)+'-';
    const expected={b1:{arm:'a1',endpoint:'AE_any',randomized:920,treated:916,old:'n2',count:'n7'},b2:{arm:'a2',endpoint:'AE_any',randomized:924,treated:917,old:'n3',count:'n8'},b3:{arm:'a1',endpoint:'AE_grade_3_4',randomized:920,treated:916,old:'n2',count:'n7'},b4:{arm:'a2',endpoint:'AE_grade_3_4',randomized:924,treated:917,old:'n3',count:'n8'}}[q?.id];
    const missing=value=>value===null||value===undefined||value===''||value==='NA';
    const conflicting=value=>/conflict/i.test(String(value?.status||''))||list(value?.field_flags).some(flag=>/conflict/i.test(String(flag.code||'')));
    // DMFS is explicitly restricted to baseline stage III. The whole-trial
    // randomized fallback is therefore not a verified analysis N. Withhold it;
    // baseline-table arithmetic is not substituted for an extracted denominator.
    const dmfs={e5:{section:'effects',n:1844,count:'n5'},s17:{section:'survival',n:920,count:'n2',arm:'a1',kind:'median'},s18:{section:'survival',n:924,count:'n3',arm:'a2',kind:'median'},s19:{section:'survival',n:920,count:'n2',arm:'a1',kind:'survival_probability'},s20:{section:'survival',n:924,count:'n3',arm:'a2',kind:'survival_probability'}}[q?.id];
    if(dmfs&&q.endpoint==='DMFS'){
      const scopeId=prefix+'span-70c53d5567253dd3970b58ff',proof=registry[scopeId];
      const saved=list(record?.[dmfs.section]).find(result=>result.id===q.id);
      if(!record||record.stage!=='R3'||record.report_id!==identity.report_id||q.population_id!=='p2'||q.cutoff!=='NA'||q.origin!=='own_report')return null;
      if(!missing(q.analysis_n)||!missing(q.denominator)||q.display_n?.status!=='fallback'||q.display_n?.count_purpose!=='randomized'||q.display_n?.n!==dmfs.n||JSON.stringify(q.display_n.count_ids)!==JSON.stringify([dmfs.count]))return null;
      if([row,q,row.analysis_n,row.denominator,row.scoped_sample_size,q.display_n,saved].some(conflicting)||!missing(row.denominator?.value)||!missing(row.analysis_n?.value)&&row.analysis_n.value!==dmfs.n)return null;
      if(row.population_id!==prefix+'p2'||row.population?.entity_id!=='p2'||!saved||saved.endpoint!=='DMFS'||saved.population_id!=='p2'||!missing(saved.analysis_n)||!missing(saved.denominator)||saved.display_n?.n!==dmfs.n)return null;
      if(dmfs.arm){
        if(q.arm_id!==dmfs.arm||row.arm_id!==prefix+dmfs.arm||row.arm?.entity_id!==dmfs.arm||saved.arm_id!==dmfs.arm||q.kind!==dmfs.kind||saved.kind!==q.kind)return null;
        if(dmfs.kind==='survival_probability'&&(q.time!==24||q.time_unit!=='months')||dmfs.kind==='median'&&(!missing(q.time)||!missing(q.estimate)||q.median_status!=='not_reached'))return null;
      }else if(q.intervention_arm_id!=='a1'||q.reference_arm_id!=='a2'||q.measure!=='HR'||row.experimental_arm?.entity_id!=='a1'||row.comparator_arm?.entity_id!=='a2'||saved.intervention_arm_id!=='a1'||saved.reference_arm_id!=='a2')return null;
      if(proof?.source_id!==identity.report_id+':main:24db4129dc26acd9'||!String(proof.supporting_quote).includes('DMFS was assessed in all patients with baseline stage III disease'))return null;
      return {n:null,status:'unverified',count_purpose:'outcome_analysis',count_ids:[dmfs.count],basis:'source_population_mismatch',label:'DMFS · baseline stage III',population_label:'Baseline stage III',unverified_label:'NA · stage III only',evidence_ids:[scopeId],source_input_sha256:identity.source_input_sha256,review_binding_sha256:identity.review_binding_sha256,original_fallback_n:dmfs.n};
    }
    if(!q||!expected||!record||record.stage!=='R3'||record.report_id!==identity.report_id||q.endpoint!==expected.endpoint||q.arm_id!==expected.arm||q.population_id!=='p2'||q.cutoff!=='First study dose through 30 days after last dose'||q.safety_attribution!=='treatment_related')return null;
    if(!missing(q.analysis_n)||!missing(q.denominator)||q.display_n?.status!=='fallback'||q.display_n?.count_purpose!=='randomized'||q.display_n?.n!==expected.randomized||JSON.stringify(q.display_n.count_ids)!==JSON.stringify([expected.old]))return null;
    if([row,q,row.analysis_n,row.denominator,row.scoped_sample_size,q.display_n].some(conflicting))return null;
    // The canonical analysis_n can itself be the saved fallback. Never replace
    // a separately supplied reported analysis N or denominator.
    if(!missing(row.denominator?.value)||!missing(row.analysis_n?.value)&&row.analysis_n.value!==expected.randomized)return null;
    if(row.population_id!==prefix+'p2'||row.population?.entity_id!=='p2'||row.arm_id!==prefix+expected.arm||row.arm?.entity_id!==expected.arm)return null;
    const saved=list(record.binary).find(result=>result.id===q.id);
    if(!saved||saved.arm_id!==q.arm_id||saved.population_id!==q.population_id||!missing(saved.analysis_n)||!missing(saved.denominator)||conflicting(saved))return null;
    const safetyId=prefix+'span-689530c2455ec775178ab9c2',countsId=prefix+'span-f62cd846570bcf0e2bc0f14d';
    const sourceId=identity.report_id+':main:24db4129dc26acd9',safety=registry[safetyId],counts=registry[countsId];
    if(safety?.source_id!==sourceId||counts?.source_id!==sourceId||!String(safety.supporting_quote).includes('The safety population included patients who received at least one study treatment dose.')||!String(counts.supporting_quote).includes('920 patients were randomly assigned to the combination group and 924 to the nivolumab group; 916 and 917 patients, respectively, received treatment'))return null;
    const checkedCount=(id,n,purpose)=>{
      const matches=list(samples).filter(sample=>sample.quantitative_record?.id===id&&Object.entries(identity).every(([key,value])=>String(sample[key])===value));
      if(matches.length!==1)return null;
      const sample=matches[0],count=sample.quantitative_record;
      const raw=list(record.sample_sizes).find(value=>value.id===id);
      if(!raw||raw.n!==n||raw.arm_id!==expected.arm||raw.population_id!=='p2'||raw.count_purpose!==purpose||conflicting(raw))return null;
      if(sample.main_result_eligible!==true||sample.scope!=='observed'||sample.arm_id!==prefix+expected.arm||sample.arm?.entity_id!==expected.arm||sample.population_id!==prefix+'p2'||sample.population?.entity_id!=='p2'||sample.n?.status!=='reported'||sample.n?.value!==n||sample.n?.qualifier!=='equal'||!list(sample.n?.evidence_ids).includes(countsId)||conflicting(sample))return null;
      if(count.n!==n||count.count_purpose!==purpose||count.method!=='reported'||count.complete!=='yes'||count.cutoff!=='NA'||count.arm_id!==expected.arm||count.population_id!=='p2'||!missing(count.result_id)||list(count.field_flags).length||!list(count.evidence).includes('span-f62cd846570bcf0e2bc0f14d'))return null;
      return sample;
    };
    if(!checkedCount(expected.old,expected.randomized,'randomized')||!checkedCount(expected.count,expected.treated,'treated'))return null;
    return {n:expected.treated,status:'fallback',count_purpose:'safety',source_count_purpose:'treated',count_ids:[expected.count],basis:'source_checked_safety_population',label:'Safety',evidence_ids:[safetyId,countsId],source_input_sha256:identity.source_input_sha256,review_binding_sha256:identity.review_binding_sha256,original_fallback_n:expected.randomized};
  }
  // The OH2 source uses one Phase Ia population ID for an overall cohort and
  // two different schedules. Expose the schedule in Group, keeping treatment
  // names drug-only and allowing identical R2/R3 displays to consolidate.
  function presentationGroupLabel(study,group,{registry={}}={}){
    const report='report-525b9411f70248ac9a8e9290';
    if(String(study?.pmid)!=='39915002'||study.report_id!==report)return null;
    const reviewed={
      R2:{source:'e4ecd04b065f36a3c9c0381d80861469fc0517cd94ceeffe3b57aeabbb97a6e6',binding:'d9ec8e9654df55823ace15406bbf2228a852f3b1e498b33f98d5e5daa463fcee',span:'span-7e34b6b75f844ca108143331',source_id:report+':citation'},
      R3:{source:'0db89835b6080f74662381391ab2bb143655c57d2a9b8ca85b8392d78210d7e0',binding:'8ae6b312b3b253f1082d6defd00b8a2dcf3d521d81fd913fd925fc11e99cbc97',span:'span-38ba8108e9e9e978e6308e30',source_id:report+':main:a04fc87a122ccc49'}
    };
    const scopes=[];
    for(const co of list(group?.comparisons)){
      if(co.comparator_arm_id&&co.comparator_arm_id!=='NA'||co.outcome_arm_id&&co.intervention_arm_id&&co.outcome_arm_id!==co.intervention_arm_id)return null;
      const scope=co.scope||{},prefix='CE-'+String(scope.review_binding_sha256||'').slice(0,24)+'-';
      scopes.push({...scope,population:String(scope.population_id||'').replace(prefix,''),arm:co.outcome_arm_id||co.intervention_arm_id});
    }
    for(const row of [...list(group?.results),...list(group?.context_counts)]){
      const q=row.quantitative_record;if(!q||row.extraction_conflict||list(q.field_flags).some(flag=>/conflict/i.test(String(flag.code))))return null;
      scopes.push({...row,population:q.population_id,arm:q.arm_id});
    }
    if(!scopes.length)return null;
    const labels=[];
    for(const scope of scopes){
      const rule=reviewed[scope.review_stage],label={a_ia:'Phase Ia · all',a_ia_single:'Phase Ia · single dose',a_ia_multiple:'Phase Ia · multiple doses'}[scope.arm];
      if(!rule||!label||scope.report_id!==report||scope.source_input_sha256!==rule.source||scope.review_binding_sha256!==rule.binding||scope.population!=='p_ia')return null;
      const prefix='CE-'+rule.binding.slice(0,24)+'-',proof=registry[prefix+rule.span];
      if(proof?.source_id!==rule.source_id||!String(proof.supporting_quote).includes('In phase Ia, nine patients received OH2 single-dose treatment')||!String(proof.supporting_quote).includes('while six patients underwent multidose therapy.'))return null;
      const record=records(study).find(record=>record.source_sha256===rule.source&&record.stage===scope.review_stage&&record.report_id===report),arm=list(record?.arms).find(arm=>arm.id===scope.arm);
      const population=list(record?.populations).find(population=>population.id==='p_ia'),leaves=list(arm?.nodes).filter(node=>node.kind==='drug');
      if(population?.label!=='Phase Ia'||arm?.population_id!=='p_ia'||!leaves.length||leaves.some(node=>String(node.name).toLowerCase()!=='oh2'))return null;
      const single=leaves.some(node=>node.schedule==='Single dose'),multiple=leaves.some(node=>/^(?:Multiple doses|3 doses 2 weeks apart)/.test(node.schedule||''));
      if(scope.arm==='a_ia_single'&&(!single||multiple)||scope.arm==='a_ia_multiple'&&(!multiple||single)||scope.arm==='a_ia'&&(!single||!multiple))return null;
      const counts=list(record.sample_sizes),one=counts.find(n=>n.id==='n_ia_single'),many=counts.find(n=>n.id==='n_ia_multiple');
      if(one?.n!==9||many?.n!==6||one.arm_id!=='a_ia_single'||many.arm_id!=='a_ia_multiple'||[one,many].some(n=>n.population_id!=='p_ia'||n.count_purpose!=='treated'||n.method!=='reported'||list(n.field_flags).length))return null;
      labels.push(label);
    }
    return new Set(labels).size===1?labels[0]:null;
  }
  function timeLabel(row){
    const q=row?.quantitative_record||row,time=q?.time??q?.assessment_time;
    if(typeof time!=='number'||!Number.isFinite(time))return '';
    const unit=({months:'mo',month:'mo',years:'y',year:'y',weeks:'wk',week:'wk',days:'d',day:'d'})[q.time_unit];
    return unit?`${formatNumber(time)} ${unit}`:'';
  }
  function cohortLabel(value){
    const label=typeof value==='object'?value?.label:value;
    return cleanContext(label).replace(/\bphase\s+([1-4])\b/gi,(_,n)=>'Phase '+['','I','II','III','IV'][Number(n)]).replace(/\s+cohort$/i,'');
  }
  function populationContext(record,id){
    const populations=list(record?.populations).filter(p=>p.melanoma_only!=='no'),population=populations.find(p=>p.id===id);
    return population&&(population.scope==='subgroup'||populations.filter(p=>p.scope==='overall').length>1)?cohortLabel(population):'';
  }
  function resultContext(study,row){
    const q=row?.quantitative_record,record=sourceRecord(study,row);if(!q||!record)return null;
    const population=list(record.populations).find(p=>p.id===q.population_id);
    return {record,population,label:populationContext(record,q.population_id),dose:resultDoseLabel(study,row)};
  }
  function phasePartitions(study){
    const out=[];
    for(const record of records(study)){
      const populations=list(record.populations),arms=new Map(list(record.arms).map(a=>[a.id,a])),counts=list(record.sample_sizes);
      const usable=n=>Number.isInteger(n.n)&&n.n>=0&&n.complete==='yes'&&(n.result_id==='NA'||!n.result_id)&&!list(n.field_flags).length;
      for(const parent of counts.filter(usable)){
        const childPops=populations.filter(p=>p.parent_id===parent.population_id&&/^phase\s+(?:[1-4]|IV|III|II|I)(?:\s+cohort)?$/i.test(p.label||''));
        if(childPops.length<2)continue;
        const children=childPops.map(pop=>counts.filter(n=>n.population_id===pop.id&&n.count_purpose===parent.count_purpose&&n.cutoff===parent.cutoff));
        if(children.some(matches=>matches.length!==1))continue;
        const parts=children.map(matches=>matches[0]);
        if(parts.some(n=>!usable(n)||n.disjoint!=='yes')||parts.reduce((sum,n)=>sum+n.n,0)!==parent.n)continue;
        const parentArm=arms.get(parent.arm_id);
        if(!parentArm||parts.some(n=>!arms.has(n.arm_id)||regimen(arms.get(n.arm_id),{deduplicateAlternatives:false}).toLowerCase()!==regimen(parentArm,{deduplicateAlternatives:false}).toLowerCase()))continue;
        out.push({source_input_sha256:record.source_sha256,parent,children:parts.map(n=>({...n,label:cohortLabel(childPops.find(p=>p.id===n.population_id))}))});
      }
    }
    return out;
  }
  const regexLiteral=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function treatmentAliases(record,arm,sample,registry={}){
    if(!arm)return [];
    const leaves=list(arm.nodes).filter(n=>['drug','class'].includes(n.kind));
    const names=[regimen(arm),...(leaves.length===1?[arm.label,leaves[0].name]:[])].filter(name=>name&&name!=='NA');
    const prefix='CE-'+String(sample.review_binding_sha256||'').slice(0,24)+'-';
    const quotes=list(arm.evidence).map(id=>registry[prefix+id]?.supporting_quote||'').join(' ');
    const aliases=[...names];
    for(const name of names){
      const pattern=new RegExp(regexLiteral(name)+'\\s*\\(([A-Z][A-Z0-9-]{1,12})\\)','g');let match;
      while((match=pattern.exec(quotes)))aliases.push(match[1]);
    }
    return [...new Set(aliases)].sort((a,b)=>a.length-b.length);
  }
  function countLabel(study,sample,{registry={}}={}){
    const q=sample.quantitative_record||{},record=sourceRecord(study,sample),population=list(record?.populations).find(p=>p.id===q.population_id),arm=list(record?.arms).find(a=>a.id===q.arm_id);
    const aliases=treatmentAliases(record,arm,sample,registry),label=cohortLabel(population?.label||sample.population?.label);
    for(const alias of aliases){
      const response=label.match(new RegExp('^'+regexLiteral(alias)+'[ -]+(non[- ]?responders|responders)$','i'));
      if(response)return /^non/i.test(response[1])?'Nonresponders':'Responders';
      const treated=label.match(new RegExp('^('+regexLiteral(alias)+')[ -]treated(?: (?:correlative|analysis|study))?$','i'));
      if(treated)return treated[1]+'-treated';
    }
    if(population?.scope==='subgroup'||list(record?.populations).filter(p=>p.scope==='overall'&&p.melanoma_only!=='no').length>1)return label;
    if(arm)return armLabels(record,{withinPopulation:true}).get(arm.id)||aliases[0]||regimen(arm);
    return label!=='NA'?label:clean(q.count_purpose||sample.quantity_label||'Participants');
  }
  function countAlias(study,left,right,registry={}){
    const a=left.source,b=right.source,x=a.quantitative_record,y=b.quantitative_record;
    if(!x||!y||['report_id','review_stage','review_binding_sha256','source_input_sha256'].some(key=>a[key]!==b[key]))return null;
    const usable=(q,s)=>q.method==='reported'&&q.complete==='yes'&&Number.isInteger(q.n)&&q.n>=0&&q.count_purpose!=='NA'&&!list(q.field_flags).length&&s.n?.status==='reported'&&(!s.n.qualifier||s.n.qualifier==='equal')&&(!q.result_id||q.result_id==='NA');
    if(!usable(x,a)||!usable(y,b)||['n','cutoff','result_id'].some(key=>x[key]!==y[key]))return null;
    const shared=list(a.n?.evidence_ids).filter(id=>list(b.n?.evidence_ids).includes(id)&&registry[id]?.supporting_quote);if(!shared.length)return null;
    if(x.population_id===y.population_id&&x.arm_id===y.arm_id)return {label:countLabel(study,a,{registry}),kind:'same_population_arm'};
    if(x.count_purpose!==y.count_purpose)return null;
    const absent=id=>!id||id==='NA';if(absent(x.arm_id)===absent(y.arm_id))return null;
    const total=absent(x.arm_id)?x:y,owned=absent(x.arm_id)?y:x,owner=absent(x.arm_id)?b:a,record=sourceRecord(study,owner);
    if(!record)return null;
    const arms=list(record.arms),arm=arms.find(arm=>arm.id===owned.arm_id),population=list(record.populations).find(p=>p.id===total.population_id);
    if(!arm)return null;
    // A declared single group with exactly one source arm proves a same-population
    // total/arm alias. Equal Ns across different arms never satisfy this branch.
    if(total.population_id===owned.population_id&&record.study?.comparison_structure==='single_group'&&arms.length===1){
      let cursor=list(record.populations).find(p=>p.id===owned.population_id);const seen=new Set();
      while(cursor&&!seen.has(cursor.id)){if(cursor.id===arm.population_id)return {label:countLabel(study,owner,{registry}),kind:'single_group_total_arm'};seen.add(cursor.id);cursor=list(record.populations).find(p=>p.id===cursor.parent_id);}
    }
    if(arm.population_id!==owned.population_id||list(arm.nodes).filter(n=>['drug','class'].includes(n.kind)).length!==1)return null;
    if(population?.scope!=='subgroup'||population.parent_id!==owned.population_id||population.cutoff!==list(record.populations).find(p=>p.id===owned.population_id)?.cutoff)return null;
    const aliases=treatmentAliases(record,arm,owner,registry);
    for(const alias of aliases){
      const cohort=cohortLabel(population.label).match(new RegExp('^('+regexLiteral(alias)+')[ -]treated(?: (?:correlative|analysis|study))?$','i'));
      if(!cohort)continue;
      const allPatients=new RegExp('\\ball\\s+'+regexLiteral(String(owned.n))+'\\s+(?:patients|participants|subjects|people)\\s+(?:were\\s+)?(?:treated\\s+with|received|receiving)\\s+(?:the\\s+)?'+regexLiteral(alias)+'s?\\b','i');
      const prefix='CE-'+String(owner.review_binding_sha256).slice(0,24)+'-';
      if(shared.some(id=>{
        if(!list(population.evidence).some(e=>prefix+e===id))return false;
        return registry[id].supporting_quote.split(/[.;\n]/).some(sentence=>allPatients.test(sentence)&&!(/\b(?:not|no|never|planned|planning|proposed|expected|anticipated|targeted|will|would|could|may|might|intended|approximately|about|nearly|almost|roughly|around|at most|at least|up to)\b/i.test(sentence)));
      }))return {label:cohort[1]+'-treated',kind:'all_treated_parent_child'};
    }
    return null;
  }
  function countSummary(study,counts,{registry={}}={}){
    const groups=[];
    for(const count of counts){
      let existing=null,proof=null;
      for(const group of groups){for(const prior of group.members){const match=countAlias(study,prior,count,registry);if(match){existing=group;proof=match;break;}}if(existing)break;}
      if(existing){existing.members.push(count);existing.label=proof.label;existing.alias=proof.kind;}
      else groups.push({label:countLabel(study,count.source,{registry}),sample_size:count.sample_size,members:[count]});
    }
    for(const group of groups)group.base_label=group.label;
    for(const group of groups){
      const collision=groups.filter(other=>other!==group&&other.base_label===group.base_label);if(!collision.length)continue;
      const source=group.members[0].source,q=source.quantitative_record||{},record=sourceRecord(study,source),arm=list(record?.arms).find(a=>a.id===q.arm_id),population=list(record?.populations).find(p=>p.id===q.population_id);
      const parts=[],armNames=armLabels(record),peerArms=[arm,...collision.map(other=>list(record?.arms).find(a=>a.id===other.members[0].source.quantitative_record?.arm_id))].filter(Boolean);
      let armDistinguishes=false;
      if(collision.some(other=>other.members[0].source.quantitative_record?.arm_id!==q.arm_id)){
        const name=arm&&armNames.get(arm.id);
        if(new Set(peerArms.map(a=>armNames.get(a.id))).size>1){if(name!==group.base_label)parts.push(name);armDistinguishes=true;}
        else {
          const administration=a=>list(a.nodes).filter(n=>n.name&&n.name!=='NA').map(n=>[n.name,n.route,n.schedule].filter(v=>v&&v!=='NA').join(': ')).join('; ');
          if(arm&&new Set(peerArms.map(administration)).size>1){parts.push(administration(arm));armDistinguishes=true;}
        }
      }
      if(!armDistinguishes&&collision.some(other=>other.members[0].source.quantitative_record?.population_id!==q.population_id))parts.push(cohortLabel(list(record?.populations).find(p=>p.id===population?.parent_id)?.label));
      if(collision.some(other=>other.members[0].source.quantitative_record?.count_purpose!==q.count_purpose))parts.push(clean(q.count_purpose));
      group.label=[...new Set(parts.filter(part=>part&&part!=='NA')),group.base_label].join(' · ');
    }
    return groups.map(({label,sample_size,members,alias})=>({label,sample_size,count_ids:members.map(count=>count.source.quantitative_record?.id),alias}));
  }
  function reviewedFieldLabel(fieldPath){
    const parts=String(fieldPath||'').split('/').filter(Boolean);
    if(!parts.length)return clean(fieldPath||'Study detail');
    const sections={binary:'Response or safety',survival:'Time-to-event outcome',effects:'Comparative effect',study:'Study',study_details:'Study characteristics',sample_sizes:'Sample size',populations:'Population',arms:'Treatment'};
    if(!sections[parts[0]])return clean(fieldPath);
    const field=parts.at(-1);
    const labels={p_value:'P value',estimate:'Estimate',analysis_n:'Analysis N',ci_level:'CI level',ci_lower:'Lower CI',ci_upper:'Upper CI',adjustments:'Adjusted model',identifiers:'Study identifier'};
    return [sections[parts[0]],parts.length>1&&!/^(-|\d+)$/.test(field)?labels[field]||clean(field):''].filter(Boolean).join(' · ');
  }
  function render(study,{registry={}}={}){
    const all=records(study);if(!all.length)return '';
    return all.map(record=>{
      const s=record.study||{},arms=armLabels(record);
      const reviewed=list(study.details?.quantitative_extraction).find(saved=>effectiveRecord(saved)===record);
      const sources=new Map(),publication=reviewed?.reviewed_full_text;
      if(publication?.pmid===study.pmid&&publication.source_sha256===record.source_sha256&&/^https:\/\//.test(publication.source_url))
        sources.set(publication.source_url,publication.locator);
      for(const comparison of list(study.comparisons)){
        if(comparison.scope?.source_input_sha256!==record.source_sha256)continue;
        for(const [side,course] of Object.entries(comparison.reviewed_courses||{})){
          if(!course?.label||!/^https:\/\//.test(course.source?.url))continue;
          arms.set(comparison[side+'_arm_id'],course.label);
          sources.set(course.source.url,course.source.location);
        }
      }
      const treatment=arm=>arms.get(arm.id||arm.arm_id)||regimen(arm);
      const arm=id=>id==='NA'||id===null||id===undefined?'NA':arms.get(id)||'NA';
      const pops=new Map(list(record.populations).map(p=>[p.population_id||p.id,p]));
      const visible=row=>pops.get(row.population_id)?.melanoma_only!=='no';
      const population=id=>{const p=pops.get(id);return p?text(p.label||p.scope||p.analysis_set):'NA';};
      const resolutions=new Map();
      const resolution=row=>{
        if(!resolutions.has(row.id)){
          const canonical=list(study.details?.quantitative_results).find(result=>result.source_input_sha256===record.source_sha256&&result.quantitative_record?.id===row.id);
          resolutions.set(row.id,canonical?presentationSampleSize(study,canonical,{registry}):null);
        }
        return resolutions.get(row.id);
      };
      const displayedN=row=>{
        const n=resolution(row);
        if(n?.basis==='single_arm_endpoint_denominator')return n.display+' · '+n.note;
        if(n)return n.status==='unverified'?n.unverified_label||'NA':n.n;
        return row.display_n?.status==='CONFLICTING'?'NA · CONFLICTING':row.display_n?.n??row.analysis_n??row.denominator??'NA';
      };
      const resultPopulation=row=>resolution(row)?.population_label||population(row.population_id);
      const outcomes=new Map([...list(record.effects),...list(record.survival),...list(record.binary)].map(r=>[r.id,r]));
      let out=fields('Study',[['Study type',s.study_type],['Randomized',s.randomized],['Comparison',s.comparison_structure],['Setting',s.setting],['Subtype',s.melanoma_subtype],['BRAF',s.braf],['Previous systemic treatment',s.previous_systemic],...list(s.identifiers).filter(id=>!/^NCT\d{8}$/i.test(id.id||'')).map(id=>[id.registry||'Study identifier',id.id])]);
      if(record.study_details){
        out+=fields('Study characteristics',[['Population',record.study_details.population_description],['Design',record.study_details.design_description]]);
        out+=table('Adjusted models',['Result','Model','Covariates'],list(record.study_details.adjustments).map(a=>[a.effect_id,a.model,list(a.covariates).join('; ')||'NA']));
      }
      out+=table('Results selected from the main text',['Field','Published result'],list(reviewed?.main_text_choices).map(choice=>[choice.field,choice.value]));
      out+=table('Source-checked additions',['Field','Finding'],list(reviewed?.complementary_notes).map(note=>[[...new Set((note.fields||[note.field]).map(reviewedFieldLabel))].join('; '),note.text]));
      out+=table('Population',['Population','Scope','Melanoma only','Data cutoff'],list(record.populations).filter(p=>p.melanoma_only!=='no').map(p=>[p.label,p.scope,p.melanoma_only,p.cutoff]));
      out+=table('Treatment groups',['Group','Treatment'],list(record.arms).filter(visible).map(a=>[a.arm_id||a.id,treatment(a)]));
      out+=table('Sample sizes',['Population','Treatment','Endpoint','Analysis','N','Status'],list(record.sample_sizes).filter(visible).map(n=>[population(n.population_id),n.arm_id&&n.arm_id!=='NA'?arm(n.arm_id):'Total',n.result_id&&n.result_id!=='NA'?endpoint(outcomes.get(n.result_id)?.endpoint):'All',n.count_purpose,n.n,list(n.field_flags).some(flag=>String(flag.code).startsWith('CONFLICTING'))?'CONFLICTING':clean(n.validation_status||n.status||n.method)]));
      const calculated=list(reviewed?.calculated_effects);
      const effects=[...list(record.effects),...calculated].filter(visible);
      const hasCalculation=effects.some(row=>row.calculation);
      const armInput=side=>{
        const percent=typeof side?.percentage==='number'?`${formatNumber(side.percentage)}%`:'';
        return Number.isInteger(side?.numerator)&&Number.isInteger(side?.denominator)
          ? `${side.numerator}/${side.denominator}${percent?' ('+percent+')':''}` : percent;
      };
      const calculationDetail=row=>{
        const method=row.calculation;
        if(!method)return 'Reported';
        const arms=[armInput(method.intervention),armInput(method.reference)];
        const inputs=arms.every(Boolean)?' · '+arms.join(' vs '):'';
        const test=method.reported_comparison_test;
        const basis=method.interval_method==='log_wald_reconstructed_counts'?' · 95% CI from reconstructed counts':
          method.interval_method==='log_wald_reported_counts'?' · 95% CI from reported counts':method.count_recovery?' · reconstructed counts':'';
        const printed=method.from_reported_percentages?.[row.measure];
        const printedBasis=method.count_recovery&&Number.isFinite(printed)&&formatEffectNumber(printed)!==formatEffectNumber(row.estimate)
          ? ' · '+row.measure+' from printed rates '+formatEffectNumber(printed) : '';
        return 'Calculated from arm rates'+inputs+basis+printedBasis+(test?' · reported comparison p'+test.operator+test.value:'');
      };
      out+=table('Comparative results',['Endpoint','Intervention','Reference','Population','N','Effect (CI)','Adjusted',...(hasCalculation?['Basis']:[])],
        effects.map(r=>[endpoint(r.endpoint),arm(r.intervention_arm_id||r.experimental_arm_id),arm(r.reference_arm_id||r.comparator_arm_id),resultPopulation(r),displayedN(r),`${text(r.measure)} ${interval(r,r.estimate,{original:true})}`,r.adjusted,...(hasCalculation?[calculationDetail(r)]:[])]));
      out+=table('Time-to-event results',['Endpoint','Treatment','Population','N','Result','Time (months)','Value (CI)','Status'],list(record.survival).filter(visible).map(r=>[endpoint(r.endpoint),arm(r.arm_id),resultPopulation(r),displayedN(r),clean(r.kind||r.result_type),r.time,interval(r,r.estimate,{original:true})+(typeof r.estimate==='number'?(r.unit==='months'?' months':r.unit==='percent'?'%':''):''),clean(r.median_status)]));
      const numerator=row=>list(record.derivations).some(d=>d.section==='binary'&&d.id===row.id&&
        d.field==='numerator')?`${row.numerator} (derived)`:row.numerator;
      out+=table('Response and safety',['Endpoint','Treatment','Population','Patients','N','Percentage (CI)','Time (months)','Definition'],list(record.binary).filter(visible).map(r=>[endpoint(r.endpoint),arm(r.arm_id),population(r.population_id),numerator(r),displayedN(r),interval(r,resolution(r)?.reported_percentage??r.percentage,{original:true}),r.assessment_time,[definition(r),r.response_criteria,r.response_criteria_version,r.safety_attribution].filter(x=>x&&x!=='NA').join(' · ')||'NA']));
      const superseded=[];
      for(const [section,decisions] of Object.entries(reviewed?.source_preferences||{})){
        for(const old of list(reviewed.record[section])){
          const decision=decisions[old.id];
          if(!decision || !visible(old) || !(decision.status==='superseded_abstract' || decision.status==='main_text'&&decision.values))continue;
          const original=['n','estimate','percentage','numerator','denominator','ci_lower','ci_upper','p_value'].filter(key=>Number.isFinite(old[key]))
            .map(key=>({ci_lower:'lower CI',ci_upper:'upper CI',p_value:'p',n:'N'}[key]||key)+' '+formatNumber(old[key])).join(' · ');
          if(original)superseded.push([endpoint(old.endpoint)||old.count_purpose,population(old.population_id),original]);
        }
      }
      if(superseded.length)out+='<details class="drawer-section"><summary>Earlier extraction values</summary>'+table('Original values',['Field','Population','Value'],superseded)+'</details>';
      for(const [url,locator] of sources)out+=`<p class="drawer-section"><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Full-text source</a> · ${escape(locator)}</p>`;
      const fullText=record.stage==='R3'||sources.has(publication?.source_url);
      return all.length>1?`<details class="drawer-section"${fullText?' open':''}><summary>${fullText?'Full text':'Title and abstract'}</summary>${out}</details>`:out;
    }).join('')+(study.details?.fulltext_assessment&&!['complete','complete_with_issues'].includes(study.details.fulltext_assessment.technical_state)?'<p class="drawer-section">Full-text review pending. The title-and-abstract results remain available.</p>':'');
  }
  return Object.freeze({effectiveRecord,checked,merge,records,trialIdentifiers,render,regimen,armLabels,resultDoseLabel,sourceRecord,recoveredDenominator,presentationSampleSize,presentationGroupLabel,timeLabel,cohortLabel,populationContext,resultContext,phasePartitions,treatmentAliases,countLabel,countAlias,countSummary,endpoint,definition,table,fields,text,clean,formatNumber,formatEffectNumber,cleanContext,interval});
});
