/* Reversible table presentation only. Accepted extraction records remain intact. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./quantitative_extraction.js'),require('./treatment_groups.js'),require('./cohort_alias_rules.js'));
  else root.ConciseStudyGroups=factory(root.QuantitativeExtraction,root.TreatmentGroups,root.CohortAliasRules);
})(typeof globalThis==='undefined'?this:globalThis,function(compact,treatments,cohortRules){
  'use strict';
  const list=value=>Array.isArray(value)?value:[];
  const present=value=>value!==null&&value!==undefined&&value!==''&&value!=='NA';
  const numeric=value=>typeof value==='number'&&Number.isFinite(value);
  const text=value=>String(value||'').toLowerCase().replace(/\s+/g,' ').trim();
  const conflicted=row=>row?.extraction_conflict||row?.scoped_sample_size?.status==='CONFLICTING'||row?.quantitative_record?.display_n?.status==='CONFLICTING'||list(row?.quantitative_record?.field_flags).some(flag=>/conflict/i.test(flag.code||''));
  const identity=row=>JSON.stringify([row.source_input_sha256,row.quantitative_record?.id]);
  const nOf=row=>row?.scoped_sample_size?.n??row?.quantitative_record?.display_n?.n;
  const hasN=row=>Number.isInteger(nOf(row))&&nOf(row)>=0&&!conflicted(row);
  const sourceOf=(study,row)=>compact.sourceRecord(study,row);
  const sectionOf=q=>q&&('numerator'in q?'binary':'kind'in q?'survival':'intervention_arm_id'in q?'effects':'n'in q?'sample_sizes':null);

  // These exceptions were checked against the saved source passages, not inferred
  // from equal Ns. Immutable source bindings prevent them following later records.
  // 41694351: the source explicitly pools 18 standard and 36 flipped-dose patients.
  // 42140948: "Surgical patients" and "Surgical cohort" both identify the same 21.
  // 42335437: both stages describe the 628 with first-infusion time recorded;
  //           the 647 randomized participants are a different population.
  const reviewed=Object.freeze({
    '41694351':{old:'e07f0a5fe70cd8b68beaad3df6d31d9c47dc1ca4adb66ce4c1bd6002f95cd9b8',next:'439d03e5637abc3c833af338575c7ae8be111b1202279be92d1239fb6da08ac2',population:['pop1','pop1'],arm:['arm1','arm_pool'],counts:[['sample1','ss_total'],['sample2','ss_pool']],quote:/results were pooled for analysis/i},
    '42140948':{old:'c20c523b022cba122b9d06197e8f8858885bae6a60c582ea4091aa7999d65b8d',next:'3dabb4ceec3fa2f78c5ff20c0b47ffcf06143c148c548a7e138739893c44c0b4',population:['pop2','pop2'],arm:['arm1','arm1'],counts:[['sample1','ss_surgical_pcr']],results:[['binary1','pcr_surgical']],quote:/Among the 21 surgical patients, 2 achieved pCR/i},
    '42335437':{old:'950ac03089ce74458ef9a9562d79df2d6cbe5db668bda0d9a68ae71be334aa5d',next:'70931961c7a33b2117cb0fe4b0ba76f668fa79959d02f54343d671e99373b6f7',population:['pop1','pop2'],arm:['arm1','arm1'],counts:[['n_total','ss-analysis-total'],['n_arm1','ss-analysis-arm']],quote:/628 participants who received at least one dose of pembrolizumab and had time-of-day of first infusion recorded were included in analyses/i}
  });
  function uniqueLink(record,section,oldId,newId){
    const links=list(record?.r2_links).filter(link=>link.section===section);
    return links.some(link=>link.r2_id===oldId&&link.r3_id===newId&&['same','supplement'].includes(link.relation)&&list(link.evidence).length)&&links.filter(link=>link.r2_id===oldId).length===1&&links.filter(link=>link.r3_id===newId).length===1;
  }
  function evidenceText(row,record,registry){
    const prefix='CE-'+String(row.review_binding_sha256||'').slice(0,24)+'-';
    const q=row.quantitative_record||{},population=list(record?.populations).find(p=>p.id===q.population_id),arm=list(record?.arms).find(a=>a.id===q.arm_id);
    const ids=[...list(q.evidence),...list(population?.evidence),...list(arm?.evidence)];
    return [...new Set(ids)].map(id=>registry[prefix+id]?.supporting_quote||'').join('\n');
  }
  function reviewedAlias(study,oldRow,newRow,section,registry){
    const rule=reviewed[study.pmid],old=sourceOf(study,oldRow),next=sourceOf(study,newRow),a=oldRow.quantitative_record,b=newRow.quantitative_record;
    if(!rule||old?.source_sha256!==rule.old||next?.source_sha256!==rule.next||a.population_id!==rule.population[0]||b.population_id!==rule.population[1])return false;
    const pairs=section==='sample_sizes'?rule.counts:rule.results;
    if(!list(pairs).some(([x,y])=>x===a.id&&y===b.id)||!uniqueLink(next,'populations',a.population_id,b.population_id))return false;
    if(present(a.arm_id)||present(b.arm_id)){
      if(a.arm_id!==rule.arm[0]||b.arm_id!==rule.arm[1]||!uniqueLink(next,'arms',a.arm_id,b.arm_id))return false;
    }
    return rule.quote.test(evidenceText(newRow,next,registry));
  }
  function genericContext(study,oldRow,newRow){
    const old=sourceOf(study,oldRow),next=sourceOf(study,newRow),a=oldRow.quantitative_record,b=newRow.quantitative_record;
    if(!old||!next||old.stage!=='R2'||next.stage!=='R3'||old.study?.comparison_structure!==next.study?.comparison_structure)return false;
    function population(x,y,seen=new Set()){
      const key=x+'|'+y;if(seen.has(key)||!uniqueLink(next,'populations',x,y))return false;
      const p=list(old.populations).find(v=>v.id===x),q=list(next.populations).find(v=>v.id===y);
      if(!p||!q||p.melanoma_only!=='yes'||q.melanoma_only!=='yes'||p.scope!==q.scope||text(p.label)!==text(q.label)||present(p.cutoff)&&p.cutoff!==q.cutoff)return false;
      if(!present(p.parent_id)||!present(q.parent_id))return !present(p.parent_id)&&!present(q.parent_id);
      return population(p.parent_id,q.parent_id,new Set([...seen,key]));
    }
    if(!population(a.population_id,b.population_id))return false;
    function arm(x,y){
      if(!present(x)||!present(y))return !present(x)&&!present(y);
      if(!uniqueLink(next,'arms',x,y))return false;
      const p=list(old.arms).find(v=>v.id===x),q=list(next.arms).find(v=>v.id===y);
      if(!p||!q||!population(p.population_id,q.population_id))return false;
      const maps=[new Map(list(p.nodes).map(n=>[n.id,n])),new Map(list(q.nodes).map(n=>[n.id,n]))];
      function signature(id,index,seen=new Set()){
        const n=maps[index].get(id);if(!n||seen.has(id)||n.kind==='UNKNOWN')return null;
        const children=list(n.children).map(child=>signature(child,index,new Set([...seen,id])));if(children.includes(null))return null;
        if(['AND','OR','SEQUENTIAL'].includes(n.kind))return JSON.stringify([n.kind,n.kind==='SEQUENTIAL'?children:children.sort()]);
        return JSON.stringify([n.kind,text(n.name),text(n.dose),text(n.route),text(n.schedule)]);
      }
      const left=signature(p.root_id,0),right=signature(q.root_id,1);return left&&left===right;
    }
    return (sectionOf(a)==='effects'?['intervention_arm_id','reference_arm_id']:['arm_id']).every(side=>arm(a[side],b[side]));
  }
  function safeAlias(study,oldRow,newRow,registry){
    const a=oldRow?.quantitative_record,b=newRow?.quantitative_record,section=sectionOf(a),next=sourceOf(study,newRow);
    if(!a||!b||section!==sectionOf(b)||conflicted(oldRow)||conflicted(newRow)||!uniqueLink(next,section,a.id,b.id))return false;
    const reviewedContext=reviewedAlias(study,oldRow,newRow,section,registry);
    const cohortContext=!!reviewedCohort(study,registry)&&presentationScope(study,oldRow,{registry})===presentationScope(study,newRow,{registry});
    if(!genericContext(study,oldRow,newRow)&&!reviewedContext&&!cohortContext)return false;
    const metadata=section==='sample_sizes'?['result_id','complete','method',...(reviewedContext||cohortContext?[]:['count_purpose','disjoint'])]:['origin','endpoint',...(cohortContext?[]:['endpoint_definition']),'response_criteria','kind','measure','unit','time','time_unit','assessment_time','safety_attribution','adjusted','model','p_test','p_sidedness'];
    if(metadata.some(key=>present(a[key])&&a[key]!==b[key]))return false;
    if(present(a.cutoff)&&a.cutoff!==b.cutoff&&!cohortContext)return false;
    if(section==='sample_sizes')return Number.isInteger(a.n)&&a.n>=0&&a.n===b.n&&a.complete==='yes'&&b.complete==='yes';
    if(oldRow.measure!==newRow.measure||!hasN(oldRow)||!hasN(newRow)||nOf(oldRow)!==nOf(newRow))return false;
    // Never discard a known estimate, numerator, interval or p-value in favor of
    // a less complete row. A missing old CI may be filled by the complete new CI.
    if(cohortContext){
      // The linked full-text row can add a CI or explicit criteria. Count inputs
      // absent there remain available in the original extraction drawer; do not
      // repeat the same displayed percentage/estimate merely for that absence.
      const measureFields=numeric(a.estimate)?['estimate']:numeric(a.percentage)?['percentage']:['numerator','denominator'];
      if(!measureFields.every(key=>!numeric(a[key])||a[key]===b[key]))return false;
      if(!['ci_lower','ci_upper','ci_level','p_value'].every(key=>!numeric(a[key])||a[key]===b[key]))return false;
      return ['estimate','percentage','numerator','denominator','analysis_n'].every(key=>!numeric(a[key])||!numeric(b[key])||a[key]===b[key]);
    }
    return ['estimate','percentage','numerator','denominator','analysis_n','ci_lower','ci_upper','ci_level','p_value'].every(key=>!numeric(a[key])||a[key]===b[key]);
  }
  function sampleMatches(sample,comparison){
    const scope=comparison?.scope||{},q=sample.quantitative_record||{};
    if(scope.source_input_sha256!==sample.source_input_sha256||scope.population_id!==sample.population_id||scope.review_binding_sha256!==sample.review_binding_sha256)return false;
    const arms=comparison.outcome_arm_id?[comparison.outcome_arm_id]:[comparison.intervention_arm_id,comparison.comparator_arm_id].filter(Boolean);
    return present(q.arm_id)?arms.includes(q.arm_id):!comparison.outcome_arm_id;
  }
  function groupCounts(study,group,eligibleSamples){
    const allowed=new Set(eligibleSamples.map(identity));
    if(group.context_counts)return group.context_counts.filter(row=>allowed.has(identity(row)));
    // The caller supplies the existing source/population-guarded patient counts.
    // Raw extraction samples must never bypass that guard to create a UI row.
    const all=eligibleSamples;
    return list(group.comparisons).length?all.filter(sample=>group.comparisons.some(c=>sampleMatches(sample,c))):group.show_study_context?all:[];
  }
  function countRepresented(sample,groups,study,eligibleSamples){
    const q=sample.quantitative_record;
    return groups.some(group=>groupCounts(study,group,eligibleSamples).some(row=>identity(row)===identity(sample))||list(group.results).some(row=>{
      const r=row.quantitative_record||{};
      return row.source_input_sha256===sample.source_input_sha256&&r.population_id===q.population_id&&r.arm_id===q.arm_id&&hasN(row)&&nOf(row)===q.n&&(!present(q.cutoff)||!present(r.cutoff)||q.cutoff===r.cutoff)&&r.display_n?.count_purpose===q.count_purpose;
    }));
  }
  function sharedCohort(study,group,registry){
    const rows=list(group.results).filter(row=>row.quantitative_record&&hasN(row));if(rows.length<2)return false;
    const first=rows[0],q=first.quantitative_record;
    if(rows.some(row=>row.source_input_sha256!==first.source_input_sha256||row.quantitative_record.population_id!==q.population_id||row.quantitative_record.arm_id!==q.arm_id||nOf(row)!==nOf(first)||conflicted(row)))return false;
    const dates=new Set(rows.map(row=>row.quantitative_record.cutoff).filter(present));if(dates.size>1)return false;
    const ids=rows.map(row=>list(row.quantitative_record.display_n?.count_ids));
    if(ids.every(values=>values.length&&values.some(id=>ids.every(other=>other.includes(id)))))return true;
    const rule=reviewed[study.pmid];
    return study.pmid==='42140948'&&first.source_input_sha256===rule.next&&q.population_id==='pop2'&&q.arm_id==='arm1'&&nOf(first)===21&&rows.some(row=>rule.quote.test(evidenceText(row,sourceOf(study,row),registry)));
  }
  // Presentation pairs reuse a reported reference arm. They never synthesize a
  // comparative outcome, effect direction, or a total from the sum of arm Ns.
  const reviewedPairs=Object.freeze({
    '42013417':{source:'f6b428d39ceb923c297eda1c3a680418e030a08d2a031f5bdebe4fe0932e9b9f',intervention:'r3a1',comparator:'r3a2',populations:['r3p1'],arm_count_purpose:'treated',total_count_purpose:'enrolled',total_count_id:'r3n-total',agents:{r3a1:['ipilimumab','nivolumab'],r3a2:['ipilimumab']},quote:/combination[\s\S]*ipilimumab[\s\S]*nivolumab[\s\S]*compared to ipilimumab monotherapy/i},
    '41701163':{source:'e7b65de643eb4c94881d4ce19a53458a41679de3d96f774c0c80fbd3f1cf37b5',intervention:'arm-ipi',comparator:'arm-targeted',populations:['pop-ipi','pop-targeted'],agents:{'arm-ipi':['ipilimumab'],'arm-targeted':['dabrafenib','trametinib']},quote:/received targeted therapy with dabrafenib and trametinib, as a control group/i}
  });
  const prefixOf=binding=>'CE-'+String(binding||'').slice(0,24)+'-';
  function nativeArm(arm,prefix){
    return {arm_id:arm.id,label:compact.regimen(arm),root_node_id:arm.root_id,evidence_ids:list(arm.evidence).map(id=>prefix+id),nodes:list(arm.nodes).map(node=>({node_id:node.id,kind:node.kind==='control'?'other':node.kind,name:present(node.name)?node.name:null,drug_class:null,children:[...list(node.children)],dose:present(node.dose)?node.dose:null,route:present(node.route)?node.route:null,schedule:present(node.schedule)?node.schedule:null,evidence_ids:list(arm.evidence).map(id=>prefix+id)}))};
  }
  function pairedCounts(samples,record,intervention,comparator,populations,cutoff){
    const candidates=samples.filter(sample=>sample.source_input_sha256===record.source_sha256&&sample.review_stage===record.stage&&populations.includes(sample.quantitative_record?.population_id)&&sample.quantitative_record?.complete==='yes'&&!sample.quantitative_record?.field_flags?.length&&!conflicted(sample)&&!present(sample.quantitative_record?.result_id)&&Number.isInteger(sample.quantitative_record?.n)&&sample.quantitative_record.n>=0&&sample.quantitative_record.n===sample.n?.value&&(!present(cutoff)||!present(sample.quantitative_record.cutoff)||sample.quantitative_record.cutoff===cutoff));
    const priorities=['outcome_analysis','response_evaluable','ITT','safety','treated','randomized','enrolled','eligible'];
    for(const purpose of priorities){
      const own=arm=>candidates.filter(sample=>sample.quantitative_record.arm_id===arm.id&&sample.quantitative_record.population_id===arm.population_id&&sample.quantitative_record.count_purpose===purpose),a=own(intervention),b=own(comparator);
      if(!a.length||!b.length)continue;
      if(new Set(a.map(x=>x.n.value)).size!==1||new Set(b.map(x=>x.n.value)).size!==1)return null;
      const dates=new Set([...a,...b].map(x=>x.quantitative_record.cutoff).filter(present));if(dates.size>1)return null;
      const reviewedTotal=Object.values(reviewedPairs).find(rule=>rule.source===record.source_sha256&&rule.arm_count_purpose===purpose);
      const chosen=[a[0],b[0]],totalCandidates=candidates.filter(sample=>!present(sample.quantitative_record.arm_id)&&populations.length===1&&(sample.quantitative_record.count_purpose===purpose||reviewedTotal&&sample.quantitative_record.count_purpose===reviewedTotal.total_count_purpose&&sample.quantitative_record.id===reviewedTotal.total_count_id)&&(!present(sample.quantitative_record.cutoff)||!dates.size||dates.has(sample.quantitative_record.cutoff)));
      // An explicit source total is optional. Equal arithmetic is only a check,
      // never a license to create a missing total or substitute another purpose.
      const total=totalCandidates.filter(sample=>sample.n.value===a[0].n.value+b[0].n.value);
      return {intervention_n:a[0].n.value,comparator_n:b[0].n.value,count_purpose:purpose,counts:chosen,total:total.length&&new Set(total.map(x=>x.n.value)).size===1?total[0]:null};
    }
    return null;
  }
  function presentationComparisons(study,existing,{registry={},eligible_samples=[]}={}){
    if(!study?.quantitative_only||study.current_main_eligible===false)return existing;
    const original=list(existing),clinical=list(study.details?.quantitative_results),out=[...original],removed=new Set();
    for(const record of compact.records(study)){
      if(record.study?.comparison_structure!=='comparative')continue;
      const arms=list(record.arms),source=record.source_sha256,own=original.filter(co=>co.scope?.source_input_sha256===source),ownRows=clinical.filter(row=>row.source_input_sha256===source&&row.main_result_eligible!==false),ownSamples=eligible_samples.filter(row=>row.source_input_sha256===source);
      const bindings=[...new Set([...own.map(co=>co.scope?.review_binding_sha256),...ownRows.map(row=>row.review_binding_sha256),...ownSamples.map(row=>row.review_binding_sha256)].filter(Boolean))];
      if(bindings.length!==1)continue;
      const binding=bindings[0],prefix=prefixOf(binding),rule=reviewedPairs[study.pmid],pairs=[];
      if(rule&&rule.source===source){
        const selected=[rule.intervention,rule.comparator].map(id=>arms.find(a=>a.id===id));
        const valid=selected.every(arm=>arm&&list(arm.evidence).length&&list(arm.nodes).every(node=>node.kind!=='UNKNOWN')&&JSON.stringify(list(arm.nodes).filter(node=>node.kind==='drug').map(node=>text(node.name)).sort())===JSON.stringify(rule.agents[arm.id].slice().sort()));
        const evidenceIds=[...new Set([...list(record.study?.evidence),...selected.flatMap(a=>list(a?.evidence))])].map(id=>prefix+id),quote=evidenceIds.map(id=>registry[id]?.supporting_quote||'').join('\n');
        if(valid&&rule.quote.test(quote)&&selected.every(a=>rule.populations.includes(a.population_id)))pairs.push({intervention:selected[0],comparator:selected[1],populations:rule.populations,cutoff:'NA',proof:'source_reviewed_pair',evidence_ids:evidenceIds});
      }
      const byScope=new Map();
      for(const co of own){
        if(co.kind!=='treatment_comparison'||co.comparison_filter_eligible===false||!co.intervention_native_regimen||!co.comparator_native_regimen)continue;
        const a=arms.find(a=>a.id===co.intervention_arm_id),b=arms.find(a=>a.id===co.comparator_arm_id);
        if(!a||!b||a.id===b.id||a.population_id!==b.population_id||co.scope.population_id!==prefix+a.population_id)continue;
        const peers=arms.filter(arm=>arm.population_id===a.population_id);if(peers.length!==2)continue;
        const effects=ownRows.filter(row=>list(co.result_ids).includes(row.result_id)&&row.quantitative_record?.intervention_arm_id===a.id&&row.quantitative_record?.reference_arm_id===b.id&&row.quantitative_record.population_id===a.population_id&&!conflicted(row)&&!row.quantitative_record.field_flags?.length);
        if(!effects.length)continue;
        const key=a.population_id+'|'+(co.scope.cutoff||co.cutoff||'NA');if(!byScope.has(key))byScope.set(key,[]);byScope.get(key).push({co,intervention:a,comparator:b,populations:[a.population_id],cutoff:co.scope.cutoff||co.cutoff||'NA',proof:'reported_effect_reference',evidence_ids:[...new Set(effects.flatMap(row=>list(row.evidence_ids)))]});
      }
      for(const candidates of byScope.values())if(new Set(candidates.map(p=>p.intervention.id+'|'+p.comparator.id)).size===1)pairs.push(candidates[0]);
      for(const pair of pairs){
        const pop=list(record.populations).find(p=>p.id===pair.intervention.population_id);
        if(!pop||pair.populations.some(id=>!list(record.populations).some(p=>p.id===id&&p.melanoma_only==='yes')))continue;
        const scopedRows=ownRows.filter(row=>pair.populations.includes(row.quantitative_record?.population_id)&&(!present(pair.cutoff)||!present(row.quantitative_record.cutoff)||row.quantitative_record.cutoff===pair.cutoff));
        const siblings=own.filter(co=>co.kind==='arm_specific_result'||co.kind==='single_arm').filter(co=>{
          const arm=co.outcome_arm_id||co.intervention_arm_id,cutoff=co.scope.cutoff||co.cutoff||'NA';
          if(present(pair.cutoff)&&present(cutoff)&&pair.cutoff!==cutoff)return false;
          if(!list(co.result_ids).length&&(present(pair.cutoff)||present(cutoff))&&pair.cutoff!==cutoff)return false;
          return [pair.intervention.id,pair.comparator.id].includes(arm)&&pair.populations.some(id=>co.scope.population_id===prefix+id)&&list(co.result_ids).every(id=>scopedRows.some(row=>row.result_id===id||list(row.source_extraction_ids).includes(id)));
        });
        const count=pairedCounts(eligible_samples,record,pair.intervention,pair.comparator,pair.populations,pair.cutoff);
        if(!pair.co&&!count)continue;
        const resultIds=[...new Set([...list(pair.co?.result_ids),...siblings.flatMap(co=>list(co.result_ids))])];
        const comparison={...(pair.co||{}),comparison_id:pair.co?.comparison_id||prefix+'PAIR-'+pair.intervention.id+'-'+pair.comparator.id,kind:'treatment_comparison',scope:pair.co?.scope||{record_kind:'canonical_review_scope',report_id:study.report_id,population_id:prefix+pair.intervention.population_id,review_stage:record.stage,source_input_sha256:source,review_binding_sha256:binding},comparator_arm_id:pair.comparator.id,intervention_arm_id:pair.intervention.id,comparator_key:compact.regimen(pair.comparator),comparator_label:compact.regimen(pair.comparator),additional_intervention_label:compact.regimen(pair.intervention),comparator_native_regimen:nativeArm(pair.comparator,prefix),intervention_native_regimen:nativeArm(pair.intervention,prefix),comparison_filter_eligible:true,comparator_filter_eligible:true,result_ids:resultIds,population:{entity_id:pop.id,label:pop.label,population_scope:'melanoma',result_scope:pop.scope,evidence_ids:list(pop.evidence).map(id=>prefix+id)},presentation_pair:{proof:pair.proof,evidence_ids:pair.evidence_ids,population_ids:pair.populations,arm_ids:[pair.comparator.id,pair.intervention.id],source_input_sha256:source,review_binding_sha256:binding,...(count?{comparator_n:count.comparator_n,intervention_n:count.intervention_n,count_purpose:count.count_purpose,count_ids:count.counts.map(identity),total_n:count.total?.n.value??null,total_count_id:count.total?identity(count.total):null}:{})}};
        // A regenerated source binding needs its native definitions recomputed.
        delete comparison.comparator_regimen;delete comparison.intervention_regimen;
        if(pair.co)removed.add(pair.co);siblings.forEach(co=>removed.add(co));out.push(comparison);
      }
    }
    return out.filter(co=>!removed.has(co));
  }

  function applyPairPresentation(study,groups,eligibleSamples){
    const used=new Set(),paired=[];
    for(const group of groups){
      const pairs=list(group.comparisons).map(co=>co.presentation_pair).filter(Boolean);
      if(!pairs.length)continue;
      const signatures=new Set(pairs.map(pair=>JSON.stringify([pair.source_input_sha256,pair.review_binding_sha256,pair.arm_ids,pair.population_ids,pair.comparator_n,pair.intervention_n,pair.count_purpose])));
      if(signatures.size!==1)continue;
      const pair=pairs[0],ids=[...list(pair.count_ids),...(pair.total_count_id?[pair.total_count_id]:[])],counts=eligibleSamples.filter(sample=>ids.includes(identity(sample)));
      if(!Number.isInteger(pair.comparator_n)||!Number.isInteger(pair.intervention_n)||counts.filter(sample=>list(pair.count_ids).includes(identity(sample))).length!==2)continue;
      Object.assign(group,{paired_arm_context:true,paired_count_only:!group.results.length,comparator_n:pair.comparator_n,intervention_n:pair.intervention_n,comparator_arm_id:pair.arm_ids[0],intervention_arm_id:pair.arm_ids[1],total_n:pair.total_n,arm_count_purpose:pair.count_purpose});
      if(!group.results.length)group.context_counts=counts;
      ids.forEach(id=>used.add(id));paired.push(pair);
    }
    if(!paired.length)return groups;
    const out=groups.flatMap(group=>{
      if(group.paired_arm_context||group.results.length)return [group];
      const counts=groupCounts(study,group,eligibleSamples),remaining=counts.filter(sample=>!used.has(identity(sample)));
      return remaining.length===counts.length?[group]:remaining.length?[{...group,context_counts:remaining}]:[];
    });
    // For example, ovarian-reserve analysis N28 and safety N29 are different
    // quantities. Keep the unmatched safety cohort once, with its purpose.
    const represented=new Set(out.flatMap(group=>groupCounts(study,group,eligibleSamples)).map(identity));
    for(const pair of paired)for(const sample of eligibleSamples){
      const q=sample.quantitative_record;
      if(used.has(identity(sample))||represented.has(identity(sample))||sample.source_input_sha256!==pair.source_input_sha256||sample.review_binding_sha256!==pair.review_binding_sha256||!pair.population_ids.includes(q?.population_id)||!pair.arm_ids.includes(q?.arm_id)||q.complete!=='yes'||q.field_flags?.length||present(q.result_id)||conflicted(sample))continue;
      const record=sourceOf(study,sample),arm=list(record?.arms).find(a=>a.id===q.arm_id);if(!arm)continue;
      out.push({comparisons:[],results:[],comparator_label:'—',intervention_label:compact.regimen(arm),is_add_on:false,context_counts:[sample],show_study_context:true,count_only_arm_context:true,context_label:q.count_purpose==='safety'?'Safety':compact.clean(q.count_purpose)});represented.add(identity(sample));
    }
    return out;
  }

  // Display-only cohort identities reviewed against the immutable full text.
  // These map abstract/full-text descriptions of the SAME patients; the raw
  // regimen graphs, including planned-vs-received dose differences, remain intact.
  const reviewedCohorts=Object.freeze({
    '41732954':{old:'7786c5bd3a40d592e7965cc893797e296450a6a1c91337bff8ad8318c30ada56',next:'2b2d61ba8007330b2f636d421a230257ea0ffe9e5f9fe1894ae402f820ce5021',populations:{p1:'p-overall'},arms:{a1:'a-combo'},quote:/Thirty patients without prior immunotherapy[\s\S]*were treated with pembrolizumab and CP/i},
    '41701511':{old:'9ec2343de0b83c19c0bca379ff0d7547a1935c459db216c7dffd05517edcaa4f',next:'cb202beaf5f43ae4cdebe966861778a96e16c15c0d541ceedd2f73f89d9c0f69',populations:{pop_all:'pop_overall',pop_phase1b:'pop_phase1b',pop_phase2:'pop_phase2'},arms:{arm_all:'arm_overall',arm_phase1b:'arm_phase1b',arm_phase2:'arm_phase2'},quote:/A total of 28 participants started the study treatment[\s\S]*eight patients[\s\S]*20 patients were enrolled and treated[\s\S]*included in the efficacy analysis/i}
  });
  function reviewedCohort(study,registry={}){
    const rule=reviewedCohorts[study?.pmid];if(!rule)return null;
    const next=compact.records(study).find(r=>r.source_sha256===rule.next),old=compact.records(study).find(r=>r.source_sha256===rule.old);
    if(!next||!old||next.study?.comparison_structure!=='single_group'||old.study?.comparison_structure!=='single_group')return null;
    if(!Object.entries(rule.populations).every(([a,b])=>uniqueLink(next,'populations',a,b)))return null;
    const rows=list(study.details?.sample_size_records).concat(list(study.details?.quantitative_results)),bindings=[...new Set(rows.filter(r=>r.source_input_sha256===rule.next).map(r=>r.review_binding_sha256).filter(Boolean))];
    if(bindings.length!==1)return null;
    const prefix=prefixOf(bindings[0]),quotes=list(next.sample_sizes).flatMap(s=>list(s.evidence)).map(id=>registry[prefix+id]?.supporting_quote||'').join('\n');
    return rule.quote.test(quotes)?rule:null;
  }
  function scopeParts(study,row,{registry={}}={}){
    const q=row?.quantitative_record||{},rule=reviewedCohort(study,registry);let source=row?.source_input_sha256,population=q.population_id,arm=q.arm_id,cutoff=present(q.cutoff)?q.cutoff:'NA';
    if(rule&&source===rule.old&&rule.populations[population]){source=rule.next;population=rule.populations[population];arm=present(arm)?rule.arms[arm]||arm:arm;}
    const record=compact.records(study).find(r=>r.source_sha256===source),arms=list(record?.arms).filter(a=>a.population_id===population);
    if(record?.study?.comparison_structure==='single_group'&&arms.length===1&&!present(arm)&&!present(q.intervention_arm_id)&&!present(q.reference_arm_id))arm=arms[0].id;
    // In this bound record, "Grade ≥3" was filed in cutoff. It denotes the AE
    // grade, not a different analysis date; retain the original in details.
    if(rule&&study.pmid==='41732954'&&source===rule.next&&q.id==='b-ae-ge3'&&q.cutoff==='Grade ≥3')cutoff='NA';
    return {source,population,arm:present(arm)?arm:'NA',cutoff,intervention:q.intervention_arm_id,reference:q.reference_arm_id};
  }
  function presentationScope(study,row,options={}){const p=scopeParts(study,row,options);return JSON.stringify([p.source,p.population,p.arm,p.intervention,p.reference,options.ignore_cutoff?'shared_cohort':p.cutoff]);}
  function countRank(purpose){return ({outcome_analysis:0,response_evaluable:0,ITT:0,safety:1,treated:2,randomized:3,enrolled:4,eligible:5})[purpose]??6;}
  // This hierarchy applies to standalone participant-count context. It never
  // rewrites display_n on an outcome: an efficacy subset cannot replace a safety
  // denominator, and different outcome/model analysis Ns remain explicit.
  function selectCounts(study,counts,{registry={},results=[]}={}){
    const scopes=new Map();
    for(const count of list(counts)){
      const q=count?.quantitative_record;
      if(!q||conflicted(count)||q.field_flags?.length||!Number.isInteger(q.n)||q.n<0){const key=identity(count);scopes.set(key,[count]);continue;}
      const key=presentationScope(study,count,{registry});if(!scopes.has(key))scopes.set(key,[]);scopes.get(key).push(count);
    }
    const selected=[];
    for(const own of scopes.values()){
      if(own.some(c=>conflicted(c)||c.quantitative_record?.field_flags?.length)){selected.push(...own);continue;}
      const rank=Math.min(...own.map(c=>countRank(c.quantitative_record?.count_purpose))),best=own.filter(c=>countRank(c.quantitative_record?.count_purpose)===rank);
      // Equal counts of the same cohort/purpose are one display, including a
      // total and its sole treatment arm. Different analysis denominators remain.
      const byN=new Map();for(const count of best){const n=count.quantitative_record?.n,prior=byN.get(n);if(!prior||count.review_stage==='R3'&&prior.review_stage!=='R3'||present(count.quantitative_record?.arm_id)&&!present(prior.quantitative_record?.arm_id))byN.set(n,count);}
      selected.push(...byN.values());
    }
    return selected;
  }
  function groupLabel(study,group,{registry={},eligible_samples=[]}={}){
    const rows=[...list(group.results),...list(group.context_counts),...groupCounts(study,group,eligible_samples)],pops=new Map();
    for(const row of rows){const p=scopeParts(study,row,{registry});if(p.population&&p.source)pops.set(p.source+'|'+p.population,p);}
    for(const co of list(group.comparisons)){
      const record=compact.records(study).find(r=>r.source_sha256===co.scope?.source_input_sha256),prefix=prefixOf(co.scope?.review_binding_sha256),id=String(co.scope?.population_id||'').replace(prefix,'');
      if(record?.populations?.some(p=>p.id===id)){const p=scopeParts(study,{source_input_sha256:record.source_sha256,quantitative_record:{population_id:id,arm_id:co.outcome_arm_id}},{registry});pops.set(p.source+'|'+p.population,p);}
    }
    const labels=[...new Set([...pops.values()].map(p=>{
      const record=compact.records(study).find(r=>r.source_sha256===p.source),population=list(record?.populations).find(v=>v.id===p.population);
      return compact.cohortLabel(population||'').replace(/\bPhase\s+1b\b/ig,'Phase Ib').replace(/\bPhase\s+1a\b/ig,'Phase Ia').replace(/\bPhase\s+1\b/ig,'Phase I').replace(/\bPhase\s+2\b/ig,'Phase II').replace(/\bPhase\s+3\b/ig,'Phase III').replace(/\s+([;,])/g,'$1');
    }).filter(Boolean))];
    return labels.join(' / ')||compact.cleanContext(group.context_label||'').replace(/^(?:Study participants|treated|enrolled|outcome analysis)$/i,'');
  }
  function compactCohortGroups(study,groups,eligibleSamples,registry){
    const rule=reviewedCohort(study,registry);if(!rule)return groups;
    const merged=new Map(),out=[];
    for(const group of groups){
      const rows=[...list(group.results),...groupCounts(study,group,eligibleSamples)];
      const scope=[...new Set(rows.map(row=>presentationScope(study,row,{registry})))];
      if(scope.length!==1||rows.some(conflicted)){out.push(group);continue;}
      const key=scope[0];let prior=merged.get(key);
      if(!prior){prior={...group,comparisons:[...list(group.comparisons)],results:[...list(group.results)],context_counts:group.context_counts?[...group.context_counts]:undefined,keep_shared_cohort:true};merged.set(key,prior);out.push(prior);continue;}
      prior.comparisons.push(...list(group.comparisons));prior.results.push(...list(group.results));
      if(group.context_counts)prior.context_counts=[...list(prior.context_counts),...group.context_counts];
      if(rows.some(row=>row.source_input_sha256===rule.next))for(const key of ['comparator_label','intervention_label','comparator_definition','intervention_definition','is_add_on'])prior[key]=group[key];
      prior.presentation_cohort_proof='source_reviewed_same_patients';
    }
    return out;
  }

  function prepare(match,baseGroups,{registry={},eligible_samples=[],displayable_results=match.results}={}){
    const study=match.study;if(!study?.quantitative_only)return baseGroups;
    let groups=baseGroups.map(group=>({...group,comparisons:[...list(group.comparisons)],results:[...list(group.results)],...(group.context_counts?{context_counts:[...group.context_counts]}:{})}));
    const available=groups.flatMap(group=>group.results),removedResults=new Set();
    for(const old of available.filter(row=>row.review_stage==='R2'))for(const next of available.filter(row=>row.review_stage==='R3'))if(safeAlias(study,old,next,registry)){removedResults.add(identity(old));break;}
    groups=groups.flatMap(group=>{
      const results=group.results.filter(row=>!removedResults.has(identity(row)));
      return group.results.length&&!results.length&&!group.context_counts?[]:[{...group,results}];
    });
    const samples=eligible_samples,removedCounts=new Set();
    for(const old of samples.filter(row=>row.review_stage==='R2'))for(const next of samples.filter(row=>row.review_stage==='R3'&&row.main_result_eligible!==false)){
      if(safeAlias(study,old,next,registry)&&countRepresented(next,groups,study,eligible_samples)){removedCounts.add(identity(old));break;}
    }
    groups=groups.flatMap(group=>{
      if(group.results.length)return [group];
      const counts=groupCounts(study,group,eligible_samples),kept=counts.filter(row=>!removedCounts.has(identity(row)));
      if(kept.length===counts.length)return [group];
      return kept.length?[{...group,context_counts:kept}]:[];
    });
    // Without an extracted outcome contrast, arm order is not a comparator
    // direction. Show sourced treatment groups and N, leaving comparator blank.
    if(!match.results.length&&!match.comparisons.length){
      groups=groups.flatMap(group=>{
        const counts=groupCounts(study,group,eligible_samples),scopes=new Map();
        for(const sample of counts){const q=sample.quantitative_record;if(!q)continue;const key=JSON.stringify([sample.source_input_sha256,q.population_id]);if(!scopes.has(key))scopes.set(key,[]);scopes.get(key).push(sample);}
        // Single-group parent/child aliases and response-cohort labels already
        // have their own concise renderer; only a true multi-arm context expands.
        if(scopes.size!==1||sourceOf(study,counts[0])?.study?.comparison_structure!=='comparative'||new Set(counts.map(row=>row.quantitative_record?.arm_id).filter(present)).size<2)return [group];
        return counts.map(sample=>{
          const record=sourceOf(study,sample),arm=list(record?.arms).find(a=>a.id===sample.quantitative_record.arm_id);
          return {...group,comparator_label:'—',intervention_label:arm?compact.armLabels(record,{withinPopulation:true}).get(arm.id)||compact.regimen(arm):'—',is_add_on:false,comparisons:[],results:[],context_counts:[sample],show_study_context:true,count_only_arm_context:true,context_label:arm?'':'Total'};
        });
      });
    }
    groups=applyPairPresentation(study,groups,eligible_samples);
    groups=compactCohortGroups(study,groups,eligible_samples,registry);
    const displayable=new Set(list(displayable_results).map(identity));
    const resultRows=groups.flatMap(group=>group.results).filter(row=>displayable.has(identity(row))),allCounts=selectCounts(study,eligible_samples,{registry});
    groups=groups.flatMap(group=>{
      if(group.results.length||group.paired_arm_context)return [group];
      const counts=selectCounts(study,groupCounts(study,group,eligible_samples),{registry});
      const kept=[...new Set(counts.flatMap(count=>{
        const q=count.quantitative_record,scope=presentationScope(study,count,{registry});
        // A known outcome denominator already describes these patients. Do not
        // add a second enrolled/treated/safety-only row for the same cohort.
        if(resultRows.some(row=>{const r=row.quantitative_record||{};return hasN(row)&&!present(r.model)&&!present(r.adjusted)&&presentationScope(study,row,{registry})===scope&&countRank(r.display_n?.count_purpose)<=countRank(q?.count_purpose);}))return [];
        const preferred=allCounts.filter(other=>presentationScope(study,other,{registry})===scope&&countRank(other.quantitative_record?.count_purpose)<countRank(q?.count_purpose));
        if(!preferred.length)return [count];
        // An analysis-total count in a declared single-group study may be
        // unlinked from its sole treatment comparison. Replace the lower-priority
        // count with that already-eligible same-cohort count instead of dropping
        // the only visible row. Suppress only when another group actually owns it.
        return preferred.filter(other=>!groups.some(candidate=>candidate!==group&&groupCounts(study,candidate,eligible_samples).some(row=>identity(row)===identity(other))));
      }))];
      if(counts.length&&!kept.length)return [];
      const original=groupCounts(study,group,eligible_samples),unchanged=original.length===kept.length&&original.every(row=>kept.includes(row));
      return [unchanged?group:{...group,...(kept.length?{context_counts:kept}:{})}];
    });
    return groups.map(group=>{
      const counts=groupCounts(study,group,eligible_samples),rule=reviewed[study.pmid];
      const infusion=study.pmid==='42335437'&&counts.length&&counts.every(row=>row.source_input_sha256===rule.next&&row.quantitative_record?.population_id==='pop2'&&row.n.value===628)&&counts.some(row=>rule.quote.test(evidenceText(row,sourceOf(study,row),registry)));
      let countArm={};
      if(!group.results.length&&!group.comparisons.length&&group.context_counts?.length===1&&counts.length===1&&!group.context_label){
        const sample=counts[0],q=sample.quantitative_record,record=sourceOf(study,sample),arm=list(record?.arms).find(a=>a.id===q?.arm_id);
        // A single guarded arm-specific cohort count can name its treatment in
        // the treatment column. Mixed total/arm contexts retain their own labels.
        if(arm&&present(q.arm_id)&&Number.isInteger(q.n)&&q.n>=0&&q.n===sample.n?.value&&!conflicted(sample)&&list(record?.populations).some(p=>p.id===q.population_id&&p.melanoma_only==='yes')){
          countArm={comparator_label:'—',intervention_label:compact.regimen(arm),is_add_on:false,count_only_arm_context:true,context_label:compact.populationContext(record,q.population_id)};
        }
      }
      return {...group,...countArm,...(sharedCohort(study,group,registry)?{keep_shared_cohort:true}:{}),...(infusion?{context_label:'First-infusion analysis'}:{})};
    });
  }
  function refinementContext(study,group,{allow_missing_arm=false}={}){
    if(group.presentation_members){
      const contexts=group.presentation_members.map(member=>refinementContext(study,member.row,{allow_missing_arm}));
      const key=c=>JSON.stringify([c.source,c.binding,c.population,c.comparator,c.intervention]);
      return contexts.length&&contexts.every(Boolean)&&new Set(contexts.map(key)).size===1?contexts[0]:null;
    }
    const facts=[...list(group.results),...list(group.context_counts)],scopes=[];
    // Numerical warnings belong to their retained results. Only a disputed
    // population or treatment identity prevents display-level cohort matching.
    const identityFields=['population_id','arm_id','intervention_arm_id','reference_arm_id'];
    if(facts.some(row=>list(row.quantitative_record?.field_flags).some(flag=>identityFields.includes(flag.field))))return null;
    for(const row of facts){
      const q=row.quantitative_record;if(!q)continue;
      scopes.push({source:row.source_input_sha256,binding:row.review_binding_sha256,population:q.population_id,comparator:q.reference_arm_id,intervention:q.intervention_arm_id,arm:q.arm_id});
    }
    for(const co of list(group.comparisons)){
      const s=co.scope||{},prefix=prefixOf(s.review_binding_sha256);
      scopes.push({source:s.source_input_sha256,binding:s.review_binding_sha256,population:String(s.population_id||'').replace(prefix,''),comparator:co.comparator_arm_id,intervention:co.intervention_arm_id||co.outcome_arm_id});
    }
    const one=key=>{const values=[...new Set(scopes.map(s=>s[key]).filter(present))];return values.length===1?values[0]:null;};
    const source=one('source'),binding=one('binding'),population=one('population');
    if(!source||!binding||!population)return null;
    const record=compact.records(study).find(r=>r.source_sha256===source),pop=list(record?.populations).find(p=>p.id===population);
    if(!record||pop?.melanoma_only!=='yes'||!['R2','R3'].includes(record.stage))return null;
    const comparators=[...new Set(scopes.map(s=>s.comparator).filter(present))],interventions=[...new Set(scopes.map(s=>s.intervention).filter(present))],arms=[...new Set(scopes.map(s=>s.arm).filter(present))];
    if(comparators.length>1||interventions.length>1)return null;
    let comparator=comparators[0]||null,intervention=interventions[0]||null;
    if(!intervention&&!comparator&&arms.length===1)intervention=arms[0];
    if(!intervention&&!comparator&&record.study?.comparison_structure==='single_group'){
      const own=list(record.arms).filter(a=>a.population_id===population);if(own.length===1)intervention=own[0].id;
    }
    if(!intervention&&!allow_missing_arm||arms.some(id=>id!==intervention&&id!==comparator)||comparator&&comparator===intervention)return null;
    if(![intervention,comparator].filter(Boolean).every(id=>list(record.arms).some(a=>a.id===id)))return null;
    if(list(record.field_flags).some(flag=>flag.section==='populations'&&flag.id===population||flag.section==='arms'&&[intervention,comparator].includes(flag.id)&&!['dose','route','schedule'].includes(flag.field)||flag.section==='r2_links'&&[population,intervention,comparator].includes(flag.id)))return null;
    return {record,source,binding,population,pop,comparator,intervention};
  }
  function refinementAnchors(study,context,ids,registry){
    if(!ids.length)return null;
    const anchors=ids.map(id=>registry[prefixOf(context.binding)+id]);
    if(anchors.some(a=>!a?.supporting_quote||!a.block_id||!String(a.source_id||'').startsWith(study.report_id+':')||context.record.stage==='R3'&&/:citation$/.test(a.source_id)))return null;
    return anchors.map(a=>a.supporting_quote).join('\n');
  }
  function refinementLink(study,old,next,section,oldId,newId,registry,{allow_conflict=false}={}){
    const links=list(next.record.r2_links).filter(l=>l.section===section),link=links.find(l=>l.r2_id===oldId&&l.r3_id===newId);
    if(!link||!['same','supplement',...(allow_conflict?['conflict']:[])].includes(link.relation)||links.filter(l=>l.r2_id===oldId).length!==1||links.filter(l=>l.r3_id===newId).length!==1)return null;
    return refinementAnchors(study,next,list(link.evidence),registry)?link:null;
  }
  function linkedPopulation(study,old,next,oldId,newId,registry,seen=new Set()){
    const key=oldId+'|'+newId;if(seen.has(key))return false;
    const a=list(old.record.populations).find(p=>p.id===oldId),b=list(next.record.populations).find(p=>p.id===newId);
    if(!a||!b||a.melanoma_only!==b.melanoma_only||!refinementLink(study,old,next,'populations',oldId,newId,registry,{allow_conflict:true}))return false;
    if([[old.record,oldId],[next.record,newId]].some(([record,id])=>list(record.field_flags).some(flag=>flag.section==='populations'&&flag.id===id)))return false;
    // A direct, evidenced cohort link can acquire an explicit parent in the
    // full text. This never creates an alias merely from ancestry or equal N.
    if(!present(a.parent_id)||!present(b.parent_id))return true;
    return linkedPopulation(study,old,next,a.parent_id,b.parent_id,registry,new Set([...seen,key]));
  }
  // Reviewed treatment-field preferences, bound to both accepted extraction
  // bindings and the exact cohort. They do not alter the R3 records or outcomes.
  const treatmentPreferences=Object.freeze({
    '36215121':{n:'11',sources:['1a3f9eefd7649b6d7551b5190bb708744b1d38e8e3e5b32a02dc233c935190e2','a4d094ef6f347faf0c1539072f790e3a13243344533cff823af78bdd1add5550'],bindings:['da7e698b03641cecf1c09092da910c2272e9b6ebe15956670b6a1bcb2bfa0542','f1628fe6f120e2319cfb8e25214d9778cef7532b7ffac1379f45910c0e8f8ff0'],populations:['p0','pop-overall'],arms:{a0:'arm-overall'},reason:'Retain the supported patient-treatment sequence; R3 includes reagents used in ex-vivo cell culture.',proof:[['span-c767773e078e5720fe0de188',/Patients in cohort 1 received TIL infusion followed by nivolumab/i],['span-647532be866254b26d55f8d7',/All patients were included in the intent-to-treat analysis of response/i],['span-ee7d882cfef149ede94adae1',/plates with media containing[\s\S]*IL-2[\s\S]*anti-4/i]]},
    '21106722':{n:'75',sources:['9e5803b8f9f783b0b0884f686ca7669c477b7353ff0e25f0375cda08c82a207c','28afc015e656f244c0f9f08a4777b3bb80c3b6214afb5149e99252fa92562df6'],bindings:['997f7cc74937553363d8cb517f6cdc2bd56330133b9f2e1ddaf0eb899ed7f2c2','9c721eed4507ff0ef19f1d0c814d35b78bedea08cecc4698e6f3174bc2bbf1ce'],populations:['p_all','p_all'],arms:{a_all:'a_all'},reason:'Retain the peptide-vaccine alternative given to HLA-A*0201-positive participants; the R3 overall arm omits it.',proof:[['span-ef726b42bd4bdcf36e9f10ba',/HLA-A\*0201\+ patients received multipeptide immunizations in combination with ipilimumab/i],['span-f61be99cee60690894a28aae',/HLA-A\*0201 positive[\s\S]*three separate subcutaneous vaccine injections/i]]},
    '37730278':{n:'515',sources:['79de77b62a59bf1035e6b55b5b185fc3ac3849ad57257335ae7374ed2b5fb0d7','10593a80aa49430ca7182a305722c5717e141ea1daedcc706a100cbcc3b5630b'],bindings:['f22f85e95e1fe6255550803e3d22debb09fd04627e90df9e1fe1358155fc288b','3da56d53af22eaa976c8970eb92596f3fc9b21b553941f194825309a5bae96df'],populations:['p_all','p_all'],arms:{a_adj_pd1:'a_adj_pd1',a_adj_tt:'a_adj_tt'},reason:'Keep whole-cohort treatment classes; the drug-specific table covers the 237 relapsed patients, not all 515.',proof:[['span-0331c83d0ee323a1f959d085',/identified 515[\s\S]*PD-1 inhibitors[\s\S]*or TT/i],['span-067e22532b593ab38b5dda72',/515 eligible patients[\s\S]*237 patients who relapsed/i],['span-1701fed1b69751fd9e56ea8e',/Baseline characteristics of patients who relapsed[\s\S]*n=237/i]]}
  });
  function reviewedTreatmentPreference(study,old,next,role,samples,registry){
    const rule=treatmentPreferences[study.pmid];
    if(!rule||samples.length!==1||samples[0]!==rule.n||old.source!==rule.sources[0]||next.source!==rule.sources[1]||old.binding!==rule.bindings[0]||next.binding!==rule.bindings[1]||old.population!==rule.populations[0]||next.population!==rule.populations[1]||rule.arms[old[role]]!==next[role])return null;
    const evidence=[];
    for(const [index,[id,pattern]] of rule.proof.entries()){
      const context=index===0?old:next,quote=refinementAnchors(study,context,[id],registry);
      if(!quote||!pattern.test(quote))return {blocked:true};
      evidence.push(prefixOf(context.binding)+id);
    }
    return {preferred_stage:'R2',reason:rule.reason,evidence_ids:evidence};
  }
  function regimenRefines(oldArm,newArm,quotes){
    const maps=[oldArm,newArm].map(arm=>new Map(list(arm.nodes).map(n=>[n.id,n]))),operators=['AND','OR','SEQUENTIAL'];
    const normalized=value=>text(value).normalize('NFKC').replace(/[‐‑–—−]/g,'-').replace(/[^a-z0-9]+/g,' ').trim();
    // Unknown names can share a source-defined uppercase abbreviation, e.g.
    // "flavone acetic acid (FAA)" and "flavone-8-acetic acid (FAA)". Mere
    // co-occurrence of two names never establishes a synonym.
    const named=[...maps[0].values(),...maps[1].values()].filter(node=>node.kind==='drug'&&treatments?.describe(node.name)?.kind!=='agent'),aliases=new Map();
    for(const match of String(quotes).matchAll(/\(\s*([A-Z][A-Z0-9-]{1,14})(?=[\s;,)])/g)){
      const prefix=normalized(String(quotes).slice(Math.max(0,match.index-200),match.index));
      for(const node of named){const name=normalized(node.name);if(prefix===name||prefix.endsWith(' '+name)){if(!aliases.has(match[1]))aliases.set(match[1],new Set());aliases.get(match[1]).add(name);}}
    }
    const nameKey=node=>{const d=treatments?.describe(node.name),name=normalized(node.name),alias=[...aliases].find(([,names])=>names.size>1&&names.has(name));return d?.kind==='agent'?'agent:'+d.agent_id:alias?'source-alias:'+alias[0]:name;};
    const leafNames=(id,side,seen=new Set())=>{
      const n=maps[side].get(id);if(!n||seen.has(id)||n.kind==='UNKNOWN')return null;
      if(!operators.includes(n.kind))return n.kind==='drug'?[nameKey(n)]:[];
      const children=list(n.children).map(child=>leafNames(child,side,new Set([...seen,id])));return children.some(x=>x===null)?null:children.flat();
    };
    const oldNames=leafNames(oldArm.root_id,0),newNames=leafNames(newArm.root_id,1);
    if(!oldNames||!newNames||oldNames.some(name=>!newNames.includes(name)))return false;
    const oldLeafNames=[...maps[0].values()].filter(node=>!operators.includes(node.kind)).map(nameKey);
    for(const node of maps[1].values())if(node.kind==='drug'&&!oldLeafNames.includes(nameKey(node))&&!normalized(quotes).includes(normalized(node.name)))return false;
    // Dose/route/schedule remain source-specific details once cohort and arm
    // identity are established. They do not duplicate the same displayed N.
    const children=(id,side)=>{
      const node=maps[side].get(id);
      const flatten=(child,seen=new Set([id]))=>{const value=maps[side].get(child);return value?.kind===node?.kind&&!seen.has(child)?list(value.children).flatMap(next=>flatten(next,new Set([...seen,child]))):[child];};
      return list(node?.children).flatMap(child=>flatten(child));
    };
    const signature=(id,side,seen=new Set())=>{
      const node=maps[side].get(id);if(!node||seen.has(id))return null;
      if(!operators.includes(node.kind))return JSON.stringify([node.kind,nameKey(node)]);
      let parts=children(id,side).map(child=>signature(child,side,new Set([...seen,id])));if(parts.includes(null))return null;
      if(node.kind==='OR')parts=[...new Set(parts)];
      if(node.kind!=='SEQUENTIAL')parts.sort();
      return node.kind==='OR'&&parts.length===1?parts[0]:JSON.stringify([node.kind,parts]);
    };
    const unwrapped=(id,side)=>{
      const seen=new Set();
      while(!seen.has(id)){
        seen.add(id);const node=maps[side].get(id),parts=children(id,side);
        if(node?.kind!=='OR'||!parts.length||new Set(parts.map(child=>signature(child,side))).size!==1)break;
        id=parts[0];
      }
      return id;
    };
    const classMatch=(a,b)=>{
      const from=treatments?.describe(a.name),to=treatments?.describe(b.name);
      if(['class','drug'].includes(b.kind)&&normalized(a.name)===normalized(b.name))return true;
      if(b.kind==='class'&&from?.kind==='class'&&to?.kind==='class'&&from.key===to.key)return true;
      if(!(b.kind==='drug'&&to?.kind==='agent'||b.kind==='class'&&to?.kind==='class')||!to.known)return false;
      const memberships=treatments.memberships(to);
      if(/^(?:unspecified )?immunotherapy$/.test(normalized(a.name)))return memberships.some(id=>['immune','ici','immunotherapy','cytokines','vaccines','cell-therapies','oncolytic-viruses'].includes(id));
      return from?.kind==='class'&&from.class_ids.length>0&&from.class_ids.every(id=>memberships.includes(id==='ici-unspecified'?'ici':id));
    };
    const sourceStatesStages=/\b(?:maintenance|followed by|subsequent|then|lead[- ]in|priming|pretreatment|pre-treatment|before|after (?:combination|induction)(?: therapy| treatment)?)\b/i.test(quotes);
    const distinctChildren=(id,side)=>{
      const values=children(id,side);if(maps[side].get(id)?.kind!=='OR')return values;
      const seen=new Set();return values.filter(child=>{const key=signature(child,side);if(seen.has(key))return false;seen.add(key);return true;});
    };
    function matches(left,right,seen=new Set()){
      left=unwrapped(left,0);right=unwrapped(right,1);
      const key=left+'|'+right;if(seen.has(key))return false;
      const a=maps[0].get(left),b=maps[1].get(right);if(!a||!b||a.kind==='UNKNOWN'||b.kind==='UNKNOWN')return false;
      const visited=new Set([...seen,key]);
      if(a.kind==='class'&&operators.includes(b.kind)){
        const leaves=(id,seen=new Set())=>{const n=maps[1].get(id);if(!n||seen.has(id))return [];return operators.includes(n.kind)?list(n.children).flatMap(child=>leaves(child,new Set([...seen,id]))):[n];};
        const targets=leaves(right);return targets.length>0&&targets.every(node=>classMatch(a,node));
      }
      if(b.kind==='SEQUENTIAL'&&a.kind!=='SEQUENTIAL'){
        const stages=children(right,1);
        return sourceStatesStages&&stages.some((stage,index)=>{
          if(!matches(left,stage,visited))return false;
          const established=leafNames(stage,1)||[];
          return stages.every((other,j)=>j===index||((names)=>names?.length&&names.every(name=>established.includes(name)))(leafNames(other,1)));
        });
      }
      if(!operators.includes(a.kind))return !operators.includes(b.kind)&&(a.kind==='class'?classMatch(a,b):a.kind===b.kind&&nameKey(a)===nameKey(b));
      const leftChildren=distinctChildren(left,0),rightChildren=distinctChildren(right,1);
      if(a.kind!==b.kind||leftChildren.length>rightChildren.length)return false;
      if(a.kind==='SEQUENTIAL'){
        return rightChildren.some((_,start)=>{
          if(start+leftChildren.length>rightChildren.length||!leftChildren.every((id,i)=>matches(id,rightChildren[start+i],visited)))return false;
          if(leftChildren.length===rightChildren.length)return true;
          const established=rightChildren.slice(start,start+leftChildren.length).flatMap(id=>leafNames(id,1)||[]),extra=rightChildren.filter((_,i)=>i<start||i>=start+leftChildren.length).map(id=>leafNames(id,1));
          return sourceStatesStages&&extra.every(names=>names?.length&&names.every(name=>established.includes(name)));
        });
      }
      if(leftChildren.length!==rightChildren.length)return false;
      const assign=(index,used)=>index===leftChildren.length||rightChildren.some((id,j)=>!used.has(j)&&matches(leftChildren[index],id,visited)&&assign(index+1,new Set([...used,j])));
      return assign(0,new Set());
    }
    return matches(oldArm.root_id,newArm.root_id);
  }
  function presentationRefinements(entries,study,registry){
    const saved=list(study?.details?.quantitative_extraction),records=compact.records(study);
    if(records.filter(r=>r.stage==='R2').length!==1||records.filter(r=>r.stage==='R3').length!==1)return;
    const accepted=saved.find(s=>s.stage==='R3');
    if(!/^[a-f0-9]{64}$/.test(accepted?.source_proof_ref?.sha256||''))return;
    const contexts=new Map(entries.map(entry=>[entry,refinementContext(study,entry.row)]));
    const oldEntries=entries.filter(e=>contexts.get(e)?.record.stage==='R2'),nextEntries=entries.filter(e=>contexts.get(e)?.record.stage==='R3');
    for(const oldEntry of oldEntries){
      const old=contexts.get(oldEntry),candidates=[];
      for(const nextEntry of nextEntries){
        const next=contexts.get(nextEntry);
        if(oldEntry.key===nextEntry.key)continue;
        if(!oldEntry.known||JSON.stringify(oldEntry.samples)!==JSON.stringify(nextEntry.samples)||oldEntry.arms.some((n,i)=>n!==null&&nextEntry.arms[i]!==null&&n!==nextEntry.arms[i])||oldEntry.row.is_add_on!==nextEntry.row.is_add_on)continue;
        if(Boolean(old.comparator)!==Boolean(next.comparator))continue;
        const directPopulation=linkedPopulation(study,old,next,old.population,next.population,registry);
        // A uniquely linked complete arm can identify its own whole-arm cohort
        // after R3 separates a previously shared population label. This does not
        // extend to outcome subsets or descendants of that arm's population.
        const explicitPopulation=list(next.record.r2_links).some(link=>link.section==='populations'&&link.r2_id===old.population&&link.r3_id===next.population);
        const wholeArmPopulation=!directPopulation&&!explicitPopulation&&['comparator','intervention'].filter(role=>old[role]).every(role=>{
          const a=old.record.arms.find(arm=>arm.id===old[role]),b=next.record.arms.find(arm=>arm.id===next[role]);
          return a?.population_id===old.population&&b?.population_id===next.population&&refinementLink(study,old,next,'arms',a.id,b.id,registry,{allow_conflict:true});
        });
        if(!directPopulation&&!wholeArmPopulation)continue;
        const fieldEntries={},links=[];let valid=true;
        for(const role of ['comparator','intervention']){
          if(!old[role]){fieldEntries[role]=nextEntry;continue;}
          const a=old.record.arms.find(arm=>arm.id===old[role]),b=next.record.arms.find(arm=>arm.id===next[role]),link=refinementLink(study,old,next,'arms',a?.id,b?.id,registry,{allow_conflict:true});
          if(!a||!b||!link||!wholeArmPopulation&&!linkedPopulation(study,old,next,a.population_id,b.population_id,registry)){valid=false;break;}
          const reviewed=reviewedTreatmentPreference(study,old,next,role,oldEntry.samples,registry);
          if(reviewed?.blocked){valid=false;break;}
          const quotes=refinementAnchors(study,next,[...new Set([...list(link.evidence),...list(b.evidence)])],registry);
          const original=refinementAnchors(study,old,list(a.evidence),registry);
          const forward=quotes&&regimenRefines(a,b,quotes),reverse=original&&regimenRefines(b,a,original);
          if(!reviewed&&!forward&&!reverse){valid=false;break;}
          const preferNext=!reviewed&&forward;
          fieldEntries[role]=preferNext?nextEntry:oldEntry;
          links.push({role,r2_arm_id:a.id,r3_arm_id:b.id,relation:link.relation,preferred_stage:preferNext?'R3':'R2',evidence_ids:list(link.evidence).map(id=>prefixOf(next.binding)+id),...(reviewed?{reviewed_preference:reviewed}:{})});
        }
        if(!valid)continue;
        const genericGroup=value=>!text(value)||/^(?:—|overall|overall population|whole population|study participants|all patients|all participants|total)$/.test(text(value));
        const groupEntry=genericGroup(nextEntry.view.group)&&!genericGroup(oldEntry.view.group)?oldEntry:nextEntry;
        const parts=[...groupEntry.parts];parts[2]=fieldEntries.comparator.parts[2];parts[3]=fieldEntries.intervention.parts[3];
        candidates.push({entry:nextEntry,preferred:groupEntry,fieldEntries,key:JSON.stringify(parts),proof:{kind:'source_linked_presentation_refinement',cohort_identity:directPopulation?'direct_population_link':'whole_arm_link',r2_source:old.source,r3_source:next.source,r2_population_id:old.population,r3_population_id:next.population,population_relation:next.record.r2_links.find(l=>l.section==='populations'&&l.r2_id===old.population&&l.r3_id===next.population)?.relation,sample_sizes:oldEntry.samples,comparator_n:oldEntry.arms[0]??nextEntry.arms[0],intervention_n:oldEntry.arms[1]??nextEntry.arms[1],arms:links}});
      }
      // Repeated cutoffs may share one canonical display. Different candidate
      // descriptions are ambiguous and do not establish a preferred alias.
      if(!candidates.length||new Set(candidates.map(c=>c.key)).size!==1)continue;
      const chosen=candidates[0],key=chosen.key;
      oldEntry.key=key;oldEntry.preferred=chosen.preferred;oldEntry.refinement=chosen.proof;oldEntry.refinement_choice=chosen;
      for(const candidate of candidates){candidate.entry.key=key;candidate.entry.preferred=chosen.preferred;candidate.entry.refinement=candidate.proof;candidate.entry.refinement_choice=chosen;}
    }
  }
  function reviewedPresentationAliases(entries,study,registry){
    const bindings=list(study.details?.quantitative_extraction).map(w=>w.complementary_review_bindings)
      .filter(b=>b?.cohort_scope_unchanged);
    const rules=list(cohortRules).filter(rule=>rule.pmid===study.pmid).map(rule=>{
      if(!bindings.length)return rule;
      const contexts=rule.contexts.map(context=>{
        const match=bindings.find(b=>b.original===context.binding);
        return match?{...context,binding:match.effective}:context;
      });
      const evidence=rule.evidence.map(item=>{
        const match=bindings.find(b=>item.id.startsWith('CE-'+b.original.slice(0,24)+'-'));
        return match?{...item,id:'CE-'+match.effective.slice(0,24)+item.id.slice(27)}:item;
      });
      return {...rule,contexts,evidence};
    });
    if(!rules.length)return;
    const contexts=new Map(entries.map(entry=>[entry,refinementContext(study,entry.row,{allow_missing_arm:true})]));
    for(const rule of rules){
      if(!list(rule.evidence).length||rule.evidence.some(proof=>{
        const anchor=registry[proof.id];return !anchor||!String(anchor.source_id||'').startsWith(study.report_id+':')||anchor.source_id!==proof.source_id||anchor.block_id!==proof.block_id||anchor.supporting_quote!==proof.supporting_quote;
      }))continue;
      const matches=rule.contexts.map(expected=>entries.filter(entry=>{
        const actual=contexts.get(entry);
        if(actual?.record.stage==='R3'){
          const saved=list(study.details?.quantitative_extraction).find(item=>item.stage==='R3'&&compact.effectiveRecord(item)===actual.record);
          if(!/^[a-f0-9]{64}$/.test(saved?.source_proof_ref?.sha256||''))return false;
        }
        return actual&&actual.record.stage===expected.stage&&actual.source===expected.source&&actual.binding===expected.binding&&actual.population===expected.population&&JSON.stringify(entry.samples)===JSON.stringify(rule.samples)&&actual.comparator===expected.comparator&&(actual.intervention===expected.intervention||expected.allow_missing_arm===true&&!actual.intervention)&&list(actual.record.arms).some(arm=>arm.id===expected.intervention);
      }));
      if(matches.some(group=>!group.length))continue;
      const seed=[...new Set(matches.flat())],priorKeys=new Set(seed.map(entry=>entry.key)),members=entries.filter(entry=>seed.includes(entry)||entry.refinement&&priorKeys.has(entry.key)),roles=['comparator','intervention'];
      if(members.some(entry=>entry.row.is_add_on!==members[0].row.is_add_on)||members.some(a=>members.some(b=>a.arms.some((n,i)=>n!==null&&b.arms[i]!==null&&n!==b.arms[i]))))continue;
      const preferred=matches[rule.preferred_context??1][0],fieldEntries={},proofArms=[];let valid=true;
      const descriptor=entry=>{
        const index=matches.findIndex(group=>group.includes(entry));return {...contexts.get(entry),...(index>=0?rule.contexts[index]:{})};
      };
      for(const role of roles){
        const reviewed=rule.treatment_preferences?.[role];
        if(reviewed){
          const selected=matches[reviewed.context]?.[0];
          if(!selected||!list(reviewed.evidence).length||reviewed.evidence.some(proof=>{
            const anchor=registry[proof.id];return !anchor||!String(anchor.source_id||'').startsWith(study.report_id+':')||anchor.source_id!==proof.source_id||anchor.block_id!==proof.block_id||anchor.supporting_quote!==proof.supporting_quote;
          })){valid=false;break;}
          fieldEntries[role]=selected;
          const source=descriptor(selected);proofArms.push({role,preferred_stage:source.record.stage,source:source.source,binding:source.binding,arm_id:source[role],reviewed_preference:{reason:reviewed.reason,evidence_ids:reviewed.evidence.map(e=>e.id)}});
          continue;
        }
        const candidates=[...new Set(members.map(entry=>entry.refinement_choice?.fieldEntries[role]||entry))].filter(entry=>{
          const c=descriptor(entry);return c.record&&(!c[role]||present(entry.row[role+'_label'])&&entry.row[role+'_label']!=='—');
        });
        let selected=candidates.includes(preferred)?preferred:candidates[0];
        if(!selected){valid=false;break;}
        for(const candidate of candidates){
          if(candidate===selected)continue;
          const a=descriptor(selected),b=descriptor(candidate);
          if(Boolean(a[role])!==Boolean(b[role])){valid=false;break;}
          if(!a[role])continue;
          const left=a.record.arms.find(arm=>arm.id===a[role]),right=b.record.arms.find(arm=>arm.id===b[role]);
          if(!left||!right){valid=false;break;}
          const ownQuotes=refinementAnchors(study,b,list(right.evidence),registry)||'',priorQuotes=refinementAnchors(study,a,list(left.evidence),registry)||'',reviewedQuotes=rule.evidence.map(e=>e.supporting_quote).join('\n');
          const forward=regimenRefines(left,right,ownQuotes+'\n'+reviewedQuotes),reverse=regimenRefines(right,left,priorQuotes+'\n'+reviewedQuotes);
          if(!forward&&!reverse){valid=false;break;}
          if(forward&&!reverse)selected=candidate;
        }
        if(!valid)break;
        fieldEntries[role]=selected;
        const source=descriptor(selected);proofArms.push({role,preferred_stage:source.record.stage,source:source.source,binding:source.binding,arm_id:source[role]});
      }
      if(!valid)continue;
      const groupLabel=rule.group_label?compact.cleanContext(rule.group_label).replace(/^NA$/,''):null;
      const parts=[...preferred.parts];if(groupLabel!==null)parts[1]=groupLabel;parts[2]=fieldEntries.comparator.parts[2];parts[3]=fieldEntries.intervention.parts[3];
      const key=JSON.stringify(parts),inherited=[...new Set(members.map(entry=>entry.refinement).filter(Boolean))],proof={kind:'reviewed_cohort_alias',reviewed_rule_id:rule.id,cohort_identity:'reviewed_source_identity',sample_sizes:rule.samples,contexts:rule.contexts,evidence_ids:rule.evidence.map(e=>e.id),reason:rule.reason,arms:proofArms,...(groupLabel!==null?{display_group:groupLabel}:{}),...(inherited.length?{inherited_refinements:inherited}:{})};
      // Preserve aliases already established by the generic linked-cohort pass.
      const choice={preferred,fieldEntries,key,proof,group_label:groupLabel};
      for(const entry of members){entry.key=key;entry.preferred=preferred;entry.refinement=proof;entry.refinement_choice=choice;}
    }
  }
  // This final layer groups equal visible cells, not scientific records. It is
  // deliberately applied after eligibility, cohort and count selection. The
  // original rows and their already-scoped views remain available as members;
  // no new denominator, pooled estimate or cross-source identity is inferred.
  function consolidatePresentation(rows,{viewFor,treatmentText,study,registry={}}={}){
    if(typeof viewFor!=='function')throw new TypeError('consolidatePresentation requires viewFor');
    const visible=value=>String(value??'').normalize('NFC').replace(/\s+/g,' ').trim();
    const label=(value,definition,addOn)=>visible(typeof treatmentText==='function'?treatmentText(value,definition,addOn):(addOn?'+ ':'')+(value||'—'));
    const knownN=value=>Number.isInteger(value)&&value>=0?value:null;
    const sampleValue=value=>{
      const displayed=visible(value);
      if(!displayed||/^(?:NA|N\/A|—|-|unknown)$/i.test(displayed))return null;
      // Formatting a count with commas does not make it a different N. Keep
      // other displayed values literal rather than interpreting qualifiers.
      return /^\d+(?:,\d{3})*$/.test(displayed)?String(Number(displayed.replace(/,/g,''))):displayed;
    };
    const entries=list(rows).map((row,index)=>{
      const view=viewFor(row),samples=[...new Set(list(view?.samples).map(sample=>sampleValue(sample.sample_size)).filter(value=>value!==null))].sort();
      const arms=[knownN(row.comparator_n),knownN(row.intervention_n)];
      const parts=[
        row.study?.pmid??row.pmid??row.study?.report_id??row.report_id??'',
        visible(view?.group||'—'),
        label(row.comparator_label,row.comparator_definition,false),
        label(row.intervention_label,row.intervention_definition,row.is_add_on),
        samples
      ];
      return {row,view,index,arms,key:JSON.stringify(parts),parts,samples,known:samples.length||arms.some(n=>n!==null)};
    });
    if(study){presentationRefinements(entries,study,registry);reviewedPresentationAliases(entries,study,registry);}
    const buckets=new Map();
    for(const entry of entries){
      // An unknown N is not evidence for an equal-N presentation group.
      const key=entry.known?entry.key:entry.key+'|unknown|'+entry.index;
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(entry);
    }
    const compatible=(a,b)=>a.every((n,index)=>n===null||b[index]===null||n===b[index]);
    const partitions=[];
    for(const bucket of buckets.values()){
      const values=[0,1].map(side=>new Set(bucket.map(entry=>entry.arms[side]).filter(n=>n!==null)));
      const distinguishing=[0,1].filter(side=>values[side].size>1);
      if(!distinguishing.length){partitions.push(bucket);continue;}
      // Complete role assignments anchor a partition. An incomplete assignment
      // may join only one compatible partition, never bridge conflicting arm Ns.
      const clusters=[],pending=[];
      for(const entry of bucket){
        if(distinguishing.some(side=>entry.arms[side]===null)){pending.push(entry);continue;}
        let cluster=clusters.find(candidate=>distinguishing.every(side=>candidate[0].arms[side]===entry.arms[side]));
        if(!cluster){cluster=[];clusters.push(cluster);}
        cluster.push(entry);
      }
      const unresolved=[];
      for(const entry of pending){
        const candidates=clusters.filter(cluster=>cluster.every(other=>compatible(entry.arms,other.arms)));
        if(candidates.length===1)candidates[0].push(entry);
        else unresolved.push(entry);
      }
      // Two incomplete but conflicting assignments stay separate; identical
      // incomplete assignments can still consolidate their repeated display.
      const incomplete=new Map();
      for(const entry of unresolved){
        const key=JSON.stringify(entry.arms);
        if(!incomplete.has(key))incomplete.set(key,[]);
        incomplete.get(key).push(entry);
      }
      partitions.push(...clusters,...incomplete.values());
    }
    return partitions.map(partition=>{
      const members=partition.slice().sort((a,b)=>a.index-b.index),first=members[0];
      if(members.length===1)return {index:first.index,row:first.row};
      const representative=members.find(member=>member.preferred)?.preferred||first;
      const row={...first.row,presentation_members:members.map(({row,view})=>({row,view}))};
      if(members.some(member=>member.refinement)){
        const choice=members.find(member=>member.refinement_choice).refinement_choice;
        row.presentation_representative={row:representative.row,view:representative.view};
        row.presentation_group=choice.group_label??representative.view.group;
        row.presentation_refinements=[...new Map(members.filter(member=>member.refinement).map(member=>[JSON.stringify(member.refinement),member.refinement])).values()];
        row.presentation_field_representatives={};
        for(const role of ['comparator','intervention']){
          const chosen=choice.fieldEntries[role];
          row[role+'_label']=chosen.row[role+'_label'];row[role+'_definition']=chosen.row[role+'_definition'];
          row.presentation_field_representatives[role]={row:chosen.row,view:chosen.view};
        }
        row.is_add_on=representative.row.is_add_on;
      }
      for(const field of ['comparisons','results','context_counts']){
        if(members.some(member=>Array.isArray(member.row[field])))row[field]=[...new Set(members.flatMap(member=>list(member.row[field])))];
      }
      const arms=[0,1].map(side=>members.map(member=>member.arms[side]).find(n=>n!==null)??null);
      for(const [side,field,idField] of [[0,'comparator_n','comparator_arm_id'],[1,'intervention_n','intervention_arm_id']]){
        if(arms[side]===null)continue;
        const supplier=members.find(member=>member.arms[side]===arms[side]);
        row[field]=arms[side];
        // A promoted N and its source arm ID travel together. A pre-existing
        // known N/ID pair remains intact even when later stages use other IDs.
        if(first.arms[side]===null){
          if(present(supplier.row[idField]))row[idField]=supplier.row[idField];
          else delete row[idField];
        }else if(!present(row[idField])){
          const identified=members.find(member=>member.arms[side]===arms[side]&&present(member.row[idField]));
          if(identified)row[idField]=identified.row[idField];
        }
      }
      const paired=members.find(member=>member.row.paired_arm_context&&member.arms.every((n,side)=>n===arms[side]));
      if(paired){
        row.paired_arm_context=true;
        row.paired_count_only=members.every(member=>!list(member.row.results).length);
        if(!first.row.paired_arm_context&&present(paired.row.arm_count_purpose))row.arm_count_purpose=paired.row.arm_count_purpose;
      }
      const totals=[...new Set(members.map(member=>knownN(member.row.total_n)).filter(n=>n!==null))];
      if(knownN(first.row.total_n)===null&&totals.length===1){
        const supplier=members.find(member=>knownN(member.row.total_n)===totals[0]);
        row.total_n=totals[0];
        for(const field of ['total_count_id','total_count_purpose'])if(present(supplier.row[field]))row[field]=supplier.row[field];
      }
      row.presentation_key=JSON.stringify([first.key,arms]);
      return {index:first.index,row};
    }).sort((a,b)=>a.index-b.index).map(entry=>entry.row);
  }
  return Object.freeze({prepare,safeAlias,sharedCohort,presentationComparisons,selectCounts,groupLabel,presentationScope,consolidatePresentation});
});
