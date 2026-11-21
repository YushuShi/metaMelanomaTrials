/* Presentation-only reconciliation of source-equivalent numerical outcomes.
 * Never edits a result, synthesizes an interval, or changes pooling inputs.
 * Exported raw_text is generated from numeric values, so source precision must
 * come from the result's own qualified evidence, not that exported raw_text.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./outcome_source_rules.js'));
  else root.OutcomeReconciliation=factory(root.OutcomeSourceRules||[]);
})(typeof globalThis!=='undefined'?globalThis:this,function(sourceRules){
  'use strict';
  const list=value=>Array.isArray(value)?value:[];
  const known=value=>value!==undefined&&value!==null&&value!==''&&value!=='NA';
  const numeric=value=>typeof value==='number'&&Number.isFinite(value);
  const norm=value=>known(value)?String(value).trim().replace(/\s+/g,' ').toLowerCase():'';
  const section=q=>'numerator'in q?'binary':'kind'in q?'survival':'effects';
  const primary=q=>section(q)==='binary'?(numeric(q.percentage)?'percentage':'numerator'):'estimate';
  const identity=row=>({result_id:row.result_id||null,extraction_id:row.quantitative_record?.id||null,stage:row.review_stage||null,source:row.source_input_sha256||null,binding:row.review_binding_sha256||null});
  const rowKey=row=>JSON.stringify([row.review_stage||null,row.source_input_sha256||null,row.review_binding_sha256||null,row.quantitative_record?.id||row.result_id||null]);
  const recordWrappers=study=>list(study?.details?.quantitative_extraction);
  function metadata(row,options){
    if(options._metadata?.has(row))return options._metadata.get(row);
    const q=row.quantitative_record||{},sec=section(q);
    const wrappers=recordWrappers(options.study).filter(w=>w.record?.source_sha256===row.source_input_sha256&&(!row.review_stage||w.stage===row.review_stage)&&list(w.record?.[sec]).some(r=>r.id===q.id));
    const wrapper=wrappers.length===1?wrappers[0]:null;
    const result={row,q,section:sec,wrapper,record:wrapper?.record||null};options._metadata?.set(row,result);return result;
  }
  function anchor(meta,id,registry){
    const prefix='CE-'+String(meta.row.review_binding_sha256||'').slice(0,24)+'-';
    if(prefix==='CE--')return null;
    const key=String(id).startsWith('CE-')?id:prefix+id;
    if(!key.startsWith(prefix))return null;
    const value=registry[key],report=meta.row.report_id||meta.record?.report_id;
    if(!value||!report||!String(value.source_id||'').startsWith(report+':')||!value.supporting_quote)return null;
    if(meta.row.review_stage==='R3'&&(!value.block_id||String(value.source_id).includes(':citation:')))return null;
    return {id:key,source_id:value.source_id,block_id:value.block_id||null,quote:value.supporting_quote};
  }
  function anchors(meta,ids,registry){
    const out=list(ids).map(id=>anchor(meta,id,registry));
    return out.length&&out.every(Boolean)?out:null;
  }
  function sourceReady(meta){return !!meta.record&&(meta.row.review_stage!=='R3'||/^[a-f0-9]{64}$/.test(meta.wrapper?.source_proof_ref?.sha256||''));}
  function matchedRules(meta,options){
    const row=meta.row,q=meta.q;
    const prior=meta.wrapper?.complementary_review_bindings;
    const pos=list(meta.record?.[meta.section]).findIndex(result=>result.id===q.id);
    const rowPath='/'+meta.section+'/'+pos;
    const unchanged=pos>=0&&prior?.comparison_scope_unchanged&&prior.effective===row.review_binding_sha256&&
      !list(meta.wrapper.complementary_edits).some(finding=>list(finding.field_paths).some(path=>path===rowPath||path.startsWith(rowPath+'/')));
    const rules=list(sourceRules).filter(rule=>String(rule.pmid)===String(row.pmid||options.study?.pmid)&&rule.source_sha256===row.source_input_sha256);
    const current=rules.map(rule=>{
      if(!unchanged||rule.review_binding_sha256!==prior.original)return rule;
      const prefix='CE-'+prior.original.slice(0,24)+'-',effective='CE-'+prior.effective.slice(0,24)+'-';
      // Curated result identity and quote IDs share the exact review namespace.
      // Existing source, arm, population and literal-quote checks still apply.
      return JSON.parse(JSON.stringify(rule,(key,value)=>value===prior.original?prior.effective:
        typeof value==='string'&&value.startsWith(prefix)?effective+value.slice(prefix.length):value));
    });
    return current.filter(rule=>rule.review_binding_sha256===row.review_binding_sha256&&rule.raw_result_id===q.id&&rule.canonical_result_id===row.result_id&&rule.population_id===q.population_id&&norm(rule.arm_id)===norm(q.arm_id)&&(!Object.hasOwn(rule,'intervention_arm_id')||norm(rule.intervention_arm_id)===norm(q.intervention_arm_id))&&(!Object.hasOwn(rule,'reference_arm_id')||norm(rule.reference_arm_id)===norm(q.reference_arm_id))&&rule.endpoint===q.endpoint);
  }
  function ruleEvidence(meta,evidence,options){
    if(!sourceReady(meta))return null;
    const proof=list(evidence).map(expected=>{
      const actual=anchor(meta,expected.id,options.registry||{});
      return actual&&actual.source_id===expected.source_id&&actual.block_id===expected.block_id&&actual.quote===expected.supporting_quote?actual:null;
    });
    return proof.length&&proof.every(Boolean)?proof:null;
  }
  function reviewedOrder(meta,options){
    const rules=matchedRules(meta,options).filter(rule=>rule.analysis_order);
    if(rules.length!==1)return null;
    const rule=rules[0],order=rule.analysis_order,evidence=ruleEvidence(meta,order.evidence,options);
    return evidence&&numeric(order.value)?{kind:order.kind,value:order.value,label:order.label,estimand_key:order.estimand_key||null,compatible_fields:list(order.compatible_fields),rule_id:rule.id,evidence_ids:evidence.map(a=>a.id)}:null;
  }
  function scopeAliases(meta,options){
    const rules=matchedRules(meta,options).filter(rule=>rule.scope_aliases&&ruleEvidence(meta,rule.evidence,options));
    return Object.assign({},...rules.map(rule=>rule.scope_aliases));
  }
  const contextRows=options=>{
    const rows=new Map();for(const row of [...list(options.rows),...list(options.conflictRows),...list(options.study?.details?.quantitative_results),...list(options.study?.results)])if(!rows.has(rowKey(row)))rows.set(rowKey(row),row);
    return [...rows.values()];
  };
  function linkedCounterpart(meta,options){
    const candidates=contextRows(options).filter(row=>row!==meta.row&&row.review_stage!==meta.row.review_stage&&row.quantitative_record?.endpoint===meta.q.endpoint).map(row=>({meta:metadata(row,options),link:resultLink(meta,metadata(row,options),options)})).filter(x=>x.link&&['same','supplement'].includes(x.link.relation));
    return candidates.length===1?candidates[0]:null;
  }
  function effectiveDefinition(meta,options){
    const text=known(meta.q.endpoint_definition)?norm(meta.q.endpoint_definition):norm(linkedCounterpart(meta,options)?.meta.q.endpoint_definition);
    if(meta.q.endpoint==='ORR'&&/^(?:(?:objective|overall) response(?: rate)?|orr)(?:\s*\(complete (?:or|and|plus) partial responses?\))?$/.test(text))return 'objective response rate';
    return text;
  }
  function effectiveField(meta,field,options){return known(meta.q[field])?meta.q[field]:linkedCounterpart(meta,options)?.meta.q[field];}
  function semanticOutcome(row,options={},inherit=true){
    const meta=metadata(row,options),q=meta.q;
    const rules=matchedRules(meta,options).filter(rule=>rule.semantic_endpoint_key&&rule.label);
    if(rules.length===1&&sourceReady(meta)){
      const rule=rules[0],proof=list(rule.evidence).map(expected=>{
        const actual=anchor(meta,expected.id,options.registry||{});
        return actual&&actual.source_id===expected.source_id&&actual.block_id===expected.block_id&&actual.quote===expected.supporting_quote?actual:null;
      });
      if(proof.length&&proof.every(Boolean))return {key:rule.semantic_endpoint_key,label:rule.label,specific:true,proof:{kind:'reviewed_source_endpoint',rule_id:rule.id,evidence_ids:proof.map(a=>a.id)}};
    }
    const endpoint=String(q.endpoint||row.variable||''),text=norm(q.endpoint_definition),qualifiers=[];
    if(/\bbicompartmental\b/.test(text))qualifiers.push('Bicompartmental');
    else if(/\bintracranial\b|\bintra-cranial\b/.test(text))qualifiers.push('Intracranial');
    else if(/\bextracranial\b|\bextra-cranial\b/.test(text))qualifiers.push('Extracranial');
    else if(/\bsystemic\s+(?:response|progression|pfs|orr)\b/.test(text))qualifiers.push('Systemic');
    if(/\bunconfirmed\b/.test(text))qualifiers.push('Unconfirmed');
    else if(/\bconfirmed\s+(?:(?:objective|overall|complete|partial|tumou?r)\s+)?response\b/.test(text)&&contextRows(options).some(other=>other!==row&&other.quantitative_record?.endpoint===q.endpoint&&/\bunconfirmed\b/i.test(other.quantitative_record?.endpoint_definition||'')&&['population_id','arm_id','intervention_arm_id','reference_arm_id'].every(role=>roleLink(meta,metadata(other,options),role,options))))qualifiers.push('Confirmed');
    if(/\b(?:non[ -]?injected|uninjected)\b/.test(text))qualifiers.push('Non-injected lesions');
    else if(/\binjected\b/.test(text))qualifiers.push('Injected lesions');
    if(/\btotal\s+(?:progression|pfs)\b|\bprogression.*both.*(?:treatment|therap)/.test(text))qualifiers.push('Total');
    else if(/\bfirst\s+(?:pfs|progression[- ]free\s+survival)\b/.test(text))qualifiers.push('First');
    if(/\bdistant\s+(?:recurrence|relapse)\b/.test(text))qualifiers.push('Distant');
    else if(/\blocal\s+(?:recurrence|relapse)\b/.test(text))qualifiers.push('Local');
    const label=[...qualifiers,endpoint].filter(Boolean).join(' '),key=[norm(endpoint),...qualifiers.map(norm)].filter(Boolean).join('_');
    const fallback={key,label,specific:qualifiers.length>0,proof:qualifiers.length?{kind:'explicit_endpoint_definition',definition:q.endpoint_definition}:null};
    if(inherit&&!fallback.specific&&row.review_stage==='R2'){
      const candidates=[];
      for(const wrapper of recordWrappers(options.study).filter(w=>w.stage==='R3')){
        const record=wrapper.record,links=list(record?.r2_links).filter(l=>l.section===meta.section&&l.r2_id===q.id&&['same','supplement'].includes(l.relation));
        if(links.length!==1||list(record.r2_links).filter(l=>l.section===meta.section&&l.r3_id===links[0].r3_id).length!==1)continue;
        const next=list(record[meta.section]).find(value=>value.id===links[0].r3_id);if(!next||next.endpoint!==q.endpoint)continue;
        // Use a real exported row when available; never construct its hashed
        // canonical result ID or invent an evidence binding.
        const sourceRows=contextRows(options);
        const target=sourceRows.find(r=>r.source_input_sha256===record.source_sha256&&r.quantitative_record?.id===next.id);
        if(!target)continue;
        const linked=resultLink(meta,metadata(target,options),options),semantic=semanticOutcome(target,options,false);
        if(linked&&semantic.specific)candidates.push({...semantic,proof:{kind:'linked_endpoint_semantics',link:linked,source:semantic.proof}});
      }
      if(candidates.length===1)return candidates[0];
    }
    if(inherit&&!fallback.specific&&!known(q.endpoint_definition)&&row.review_stage==='R3'){
      const linked=linkedCounterpart(meta,options),semantic=linked?semanticOutcome(linked.meta.row,options,false):null;
      if(semantic?.specific)return {...semantic,proof:{kind:'linked_endpoint_semantics',link:linked.link,source:semantic.proof}};
    }
    return fallback;
  }
  function resultLink(a,b,options){
    const older=a.row.review_stage==='R2'?a:b.row.review_stage==='R2'?b:null;
    const newer=a.row.review_stage==='R3'?a:b.row.review_stage==='R3'?b:null;
    if(!older||!newer||older.section!==newer.section||!sourceReady(older)||!sourceReady(newer))return null;
    const links=list(newer.record.r2_links).filter(link=>link.section===a.section);
    const from=links.filter(link=>link.r2_id===older.q.id),to=links.filter(link=>link.r3_id===newer.q.id);
    if(from.length!==1||to.length!==1||from[0]!==to[0]||!['same','supplement','conflict'].includes(from[0].relation))return null;
    const evidence=anchors(newer,from[0].evidence,options.registry||{});
    return evidence?{relation:from[0].relation,section:a.section,r2_id:older.q.id,r3_id:newer.q.id,evidence_ids:evidence.map(a=>a.id)}:null;
  }
  function roleLink(a,b,role,options){
    const x=a.q[role],y=b.q[role];
    if(!known(x)&&!known(y))return true;
    if(!known(x)||!known(y))return false;
    if(a.row.source_input_sha256===b.row.source_input_sha256&&a.row.review_binding_sha256===b.row.review_binding_sha256)return x===y;
    const older=a.row.review_stage==='R2'?a:b.row.review_stage==='R2'?b:null,newer=a.row.review_stage==='R3'?a:b.row.review_stage==='R3'?b:null;
    if(!older||!newer)return false;
    const sec=role==='population_id'?'populations':'arms',links=list(newer.record?.r2_links).filter(l=>l.section===sec);
    const from=links.filter(l=>l.r2_id===older.q[role]),to=links.filter(l=>l.r3_id===newer.q[role]);
    return from.length===1&&to.length===1&&from[0]===to[0]&&['same','supplement','conflict'].includes(from[0].relation)&&!!anchors(newer,from[0].evidence,options.registry||{});
  }
  function assessor(meta,options){
    if(options.assessorFor&&known(options.assessorFor(meta.row)))return norm(options.assessorFor(meta.row));
    const text=effectiveDefinition(meta,options),central=/\bcentral(?:ly)?[ -]+(?:review|assess)/.test(text),investigator=/\binvestigator[ -]+(?:review|assess)/.test(text);
    return central!==investigator?(central?'central':'investigator'):'';
  }
  // Definite semantic qualifiers are blockers even when a mistaken result link
  // exists. Missing words are not silently treated as a positive match.
  function semanticScope(meta,options){
    const text=effectiveDefinition(meta,options),custom=options.semanticFor?.(meta.row);
    const values=[];
    if(/\bbicompartmental\b/.test(text))values.push('site:bicompartmental');
    else if(/\bintracranial\b|\bintra-cranial\b/.test(text))values.push('site:intracranial');
    else if(/\bextracranial\b|\bextra-cranial\b/.test(text))values.push('site:extracranial');
    if(/\btotal\s+(?:progression|pfs)\b|\bprogression.*both.*(?:treatment|therap)/.test(text))values.push('sequence:total');
    else if(/\bfirst\s+(?:pfs|progression[- ]free\s+survival)\b/.test(text))values.push('sequence:first');
    if(known(custom))values.push('custom:'+norm(typeof custom==='object'?JSON.stringify(custom):custom));
    return values;
  }
  function countPercentagePair(a,b){
    if(a.section!=='binary'||b.section!=='binary'||primary(a.q)===primary(b.q))return null;
    const percentage=primary(a.q)==='percentage'?a:b,count=percentage===a?b:a;
    if(!['numerator','denominator'].every(field=>numeric(count.q[field])&&count.q[field]===percentage.q[field])||numeric(count.q.ci_lower)||numeric(count.q.ci_upper))return null;
    return {count,percentage};
  }
  function scopeCompatibility(a,b,options){
    const x=a.q,y=b.q;
    if(a.section!==b.section||norm(x.endpoint)!==norm(y.endpoint)||norm(x.kind)!==norm(y.kind)||a.section!=='binary'&&norm(x.measure||a.row.measure)!==norm(y.measure||b.row.measure))return {ok:false,reason:'different_outcome_type'};
    if((a.row.report_id||a.record?.report_id)!==(b.row.report_id||b.record?.report_id))return {ok:false,reason:'different_report'};
    if((a.row.review_stage==='R3'&&!sourceReady(a))||(b.row.review_stage==='R3'&&!sourceReady(b)))return {ok:false,reason:'unverified_fulltext_source'};
    const link=resultLink(a,b,options);
    const representation=countPercentagePair(a,b);
    const newer=a.row.review_stage==='R3'?a:b.row.review_stage==='R3'?b:null,older=a.row.review_stage==='R2'?a:b.row.review_stage==='R2'?b:null;
    if(newer&&older&&!link&&list(newer.record?.r2_links).some(l=>l.section===a.section&&l.r2_id===older.q.id&&l.r3_id===newer.q.id))return {ok:false,reason:'invalid_or_ambiguous_result_link'};
    const customA=options.scopeFor?.(a.row),customB=options.scopeFor?.(b.row),custom=known(customA)&&known(customB)&&JSON.stringify(customA)===JSON.stringify(customB);
    const roles=['population_id','arm_id','intervention_arm_id','reference_arm_id'];
    const sameRoles=roles.every(role=>roleLink(a,b,role,options));
    const sameSource=a.row.source_input_sha256===b.row.source_input_sha256&&a.row.review_binding_sha256===b.row.review_binding_sha256;
    if(sameSource&&!sameRoles)return {ok:false,reason:'different_cohort_roles'};
    if(newer&&older)for(const role of roles){
      if(role==='population_id'&&(link||custom))continue;
      const sec=role==='population_id'?'populations':'arms',links=list(newer.record?.r2_links).filter(l=>l.section===sec&&l.r2_id===older.q[role]);
      if(known(older.q[role])&&known(newer.q[role])&&links.length&&!roleLink(a,b,role,options))return {ok:false,reason:'contradictory_cohort_role_link'};
    }
    // A direct result link is an explicit same-scoped-finding assertion; a
    // caller's canonical cohort key may establish reviewed cohort aliases.
    if(!sameRoles&&!link&&!custom)return {ok:false,reason:'different_or_unproved_cohort_roles'};
    const endpointA=semanticOutcome(a.row,options),endpointB=semanticOutcome(b.row,options);
    if(endpointA.key!==endpointB.key&&(endpointA.specific&&endpointB.specific||!link))return {ok:false,reason:'different_semantic_endpoint'};
    const semanticA=semanticScope(a,options),semanticB=semanticScope(b,options);
    for(const category of ['site:','sequence:','custom:']){
      const av=semanticA.find(s=>s.startsWith(category)),bv=semanticB.find(s=>s.startsWith(category));
      if(av&&bv&&av!==bv)return {ok:false,reason:'different_endpoint_semantics'};
      if(!link&&av!==bv)return {ok:false,reason:'unproved_endpoint_semantics'};
    }
    if(assessor(a,options)!==assessor(b,options)&&(!link||assessor(a,options)&&assessor(b,options)))return {ok:false,reason:'different_assessment'};
    const orderA=options.selectionMode?reviewedOrder(a,options):null,orderB=options.selectionMode?reviewedOrder(b,options):null;
    const aliasesA=scopeAliases(a,options),aliasesB=scopeAliases(b,options);
    for(const field of ['time','time_unit','assessment_time','response_criteria','response_criteria_version','model','adjusted','cutoff','safety_attribution','median_status','origin','p_test','p_sidedness']){
      if(options.selectionMode&&field==='cutoff')continue;
      if(known(aliasesA[field])&&aliasesA[field]===aliasesB[field])continue;
      if(options.selectionMode&&orderA?.estimand_key&&orderA.estimand_key===orderB?.estimand_key&&orderA.compatible_fields.includes(field)&&orderB.compatible_fields.includes(field))continue;
      const av=effectiveField(a,field,options),bv=effectiveField(b,field,options);
      if(norm(av)===norm(bv))continue;
      if(!link||known(av)&&known(bv))return {ok:false,reason:'different_'+field};
    }
    for(const field of ['analysis_n','denominator','numerator'])if(!(options.selectionMode&&field==='numerator')&&numeric(x[field])&&numeric(y[field])&&x[field]!==y[field])return {ok:false,reason:'different_'+field};
    if(!options.selectionMode&&numeric(x.ci_level)&&numeric(y.ci_level)&&x.ci_level!==y.ci_level)return {ok:false,reason:'different_ci_level'};
    const sameGeneratedContext=sameSource&&list(options.study?.details?.clinical_extraction_conflicts).some(item=>item.reason===generatedConflictReason&&list(item.result_ids).includes(a.row.result_id)&&list(item.result_ids).includes(b.row.result_id));
    if(!options.selectionMode&&!link&&!sameGeneratedContext&&!representation&&norm(x.ci_level)!==norm(y.ci_level))return {ok:false,reason:'unproved_ci_level'};
    const definitionA=effectiveDefinition(a,options),definitionB=effectiveDefinition(b,options);
    if(!link&&definitionA!==definitionB&&!(options.selectionMode&&endpointA.specific&&endpointA.key===endpointB.key))return {ok:false,reason:'different_endpoint_definition'};
    let displayOnly=false;
    if(!link&&!definitionA&&(!sameSource||x.id!==y.id)&&!(endpointA.specific&&endpointA.key===endpointB.key)){
      const p=primary(x);displayOnly=!options.selectionMode&&p===primary(y)&&numeric(x[p])&&[p,'ci_lower','ci_upper','ci_level','unit'].every(field=>norm(x[field])===norm(y[field]));
      if(!displayOnly)return {ok:false,reason:'unproved_endpoint_definition'};
    }
    if(unit(a)!==unit(b)&&!representation)return {ok:false,reason:'different_unit'};
    return {ok:true,link,kind:link?'evidenced_result_link':sameSource?'same_source_scope':'canonical_cohort_scope',display_only:displayOnly};
  }
  function unit(meta){return norm(meta.section==='binary'&&numeric(meta.q.percentage)?'percent':meta.q.unit||meta.row.estimate?.unit).replace(/^%$/,'percent').replace(/^(day|week|month|year)$/,'$1s');}
  function decimalLiteral(text){
    if(typeof text!=='string')return null;
    const normalized=text.trim().replace(/−/g,'-').replace(/,/g,'');
    const match=normalized.match(/^([+-]?)(\d+(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/);
    if(!match||!Number.isFinite(Number(normalized)))return null;
    const decimals=(match[3]??match[4]??'').length,exponent=Number(match[5]||0),step=10**(exponent-decimals),value=Number(normalized);
    return {literal:text,value,step,lower:value-step/2,upper:value+step/2,decimal_places:decimals-exponent};
  }
  const numberPattern='[+−-]?(?:(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
  function numberTokens(text){
    const out=[];const regex=new RegExp(numberPattern,'g');let match;
    while((match=regex.exec(text))){
      const before=text[match.index-1]||'',after=text[match.index+match[0].length]||'';
      // A hyphen between digits is a range separator, not a negative number.
      let literal=match[0],index=match.index;
      if(literal[0]==='-'&&/\d/.test(before)){literal=literal.slice(1);index++;}
      if(/\w/.test(text[index-1]||'')&&!['-','−'].includes(match[0][0])||/\w/.test(after)||after==='.'&&/\d/.test(text[match.index+match[0].length+1]||''))continue;
      const parsed=decimalLiteral(literal);if(parsed)out.push({...parsed,index,end:index+literal.length});
    }
    return out;
  }
  function derivation(meta,field){
    const candidates=list(meta.record?.derivations).filter(d=>d.section===meta.section&&d.id===meta.q.id&&d.field===field&&d.value===meta.q[field]);
    if(!candidates.length)return null;
    const supported=candidates.filter(d=>['time_to_months','proportion_to_percent','probability_to_percent','percent_to_proportion'].includes(d.method));
    if(supported.length!==1)return {unsupported:true};
    const d=supported[0];let factor;
    if(d.method==='time_to_months')factor=({days:1/(365.25/12),weeks:7/(365.25/12),months:1,years:12})[norm(d.original_unit)];
    else factor=d.method==='percent_to_proportion'?0.01:100;
    if(!numeric(d.original)||!numeric(factor)||Math.abs(d.original*factor-d.value)>Number.EPSILON*Math.max(1,Math.abs(d.value))*8)return {unsupported:true};
    return {method:d.method,original:d.original,original_unit:d.original_unit||null,factor,value:d.value};
  }
  function sourcePrecision(meta,field,options){
    const cache=options._precision?.get(meta.row);if(cache?.has(field))return cache.get(field);
    const value=meta.q[field];if(!numeric(value))return null;
    const d=derivation(meta,field);if(d?.unsupported)return null;
    const target=d?d.original:value,own=anchors(meta,meta.q.evidence,options.registry||{});
    if(!own)return null;
    const matches=[];
    for(const a of own){
      const tokens=numberTokens(a.quote),candidates=tokens.filter(token=>token.value===target);
      for(const token of candidates){
        // Prefer a literal bound in the source's paired CI over unrelated same
        // valued counts or percentages in a long evidence passage.
        let tuple=false;
        if(field==='ci_lower'||field==='ci_upper'){
          const other=field==='ci_lower'?'ci_upper':'ci_lower',od=derivation(meta,other),otherTarget=od&&!od.unsupported?od.original:meta.q[other];
          tuple=tokens.some(t=>t!==token&&t.value===otherTarget&&((field==='ci_lower'&&t.index>token.index)||(field==='ci_upper'&&t.index<token.index))&&Math.abs(t.index-token.index)<32&&/^(?:\s|[-–—−,;:[\]()\/%]|to|and|CI)*$/i.test(a.quote.slice(Math.min(token.end,t.end),Math.max(token.index,t.index))));
        }else if(field===primary(meta.q)&&numeric(meta.q.ci_lower)&&numeric(meta.q.ci_upper)){
          tuple=tokens.some(t=>t.index>token.index&&t.index-token.end<90&&t.value===(derivation(meta,'ci_lower')?.original??meta.q.ci_lower));
        }
        matches.push({...token,evidence_id:a.id,source_id:a.source_id,block_id:a.block_id,tuple});
      }
    }
    const preferred=matches.some(m=>m.tuple)?matches.filter(m=>m.tuple):matches;
    // Ambiguous precision cannot be repaired by guessing from a synthetic
    // exported raw_text, or selecting a convenient unrelated source number.
    if(!preferred.length||new Set(preferred.map(m=>m.step)).size!==1)return null;
    const m=preferred[0],factor=d?.factor||1;
    const result={value,source_literal:m.literal,source_value:m.value,step:m.step*factor,lower:m.lower*factor,upper:m.upper*factor,evidence_ids:[...new Set(preferred.map(m=>m.evidence_id))],derivation:d||null};
    if(options._precision){if(!cache)options._precision.set(meta.row,new Map());options._precision.get(meta.row).set(field,result);}return result;
  }
  function fieldComparison(a,b,field,options){
    const x=a.q[field],y=b.q[field];
    if(!numeric(x)&&!numeric(y))return {field,kind:'missing',prefer:0};
    if(!numeric(x)||!numeric(y))return {field,kind:'completion',prefer:numeric(y)?1:-1};
    if(x===y){
      const ap=sourcePrecision(a,field,options),bp=sourcePrecision(b,field,options);
      return {field,kind:'exact',prefer:ap&&bp&&ap.step!==bp.step?(ap.step>bp.step?1:-1):0,...(ap&&bp?{a:ap,b:bp}:{})};
    }
    if(field==='numerator')return {field,kind:'different',reason:'counts_are_exact'};
    const ap=sourcePrecision(a,field,options),bp=sourcePrecision(b,field,options);
    if(!ap||!bp)return {field,kind:'different',reason:'source_precision_unproved'};
    const within=(fine,coarse)=>Math.max(fine.lower,coarse.lower)<Math.min(fine.upper,coarse.upper);
    if(ap.step>bp.step&&within(bp,ap))return {field,kind:'rounding',prefer:1,a:ap,b:bp};
    if(bp.step>ap.step&&within(ap,bp))return {field,kind:'rounding',prefer:-1,a:ap,b:bp};
    return {field,kind:'different',reason:'outside_source_rounding_interval',a:ap,b:bp};
  }
  function explicitUnitEquivalence(a,b,field,options){
    const ad=derivation(a,field),bd=derivation(b,field);
    const converted=ad?.method==='time_to_months'&&!bd?a:bd?.method==='time_to_months'&&!ad?b:null;
    if(!converted)return null;
    const direct=converted===a?b:a,d=converted===a?ad:bd;
    if(unit(direct)!=='months'||!sourcePrecision(direct,field,options)||!sourcePrecision(converted,field,options))return null;
    const own=anchors(converted,converted.q.evidence,options.registry||{});if(!own)return null;
    const sourceUnit=norm(d.original_unit).replace(/s$/,'');
    for(const evidence of own){
      const tokens=numberTokens(evidence.quote);
      for(const x of tokens.filter(token=>token.value===d.original))for(const y of tokens.filter(token=>token.value===direct.q[field])){
        if(y.index<=x.end||y.index-x.end>45)continue;
        const between=evidence.quote.slice(x.end,y.index),tail=evidence.quote.slice(y.end,y.end+18);
        if(!new RegExp('^\\s*'+sourceUnit+'s?\\s*\\(\\s*$','i').test(between)||!/^\s*months?\s*(?:\)|[;,])/i.test(tail))continue;
        return {field,kind:'source_unit_equivalence',prefer:direct===b?1:-1,preferred_reported_unit:'months',source_literal:{original:x.literal,original_unit:d.original_unit,reported_months:y.literal},evidence_ids:[evidence.id],derivation:d,reason:'Source explicitly gives both unit representations; retain its reported-month tuple instead of artificial conversion precision.'};
      }
    }
    return null;
  }
  function flags(meta){return list(meta.q.field_flags);}
  const unrelatedValidation=(flag,meta=null)=>(['analysis_n','numerator','denominator','display_n','sample_size'].includes(flag.field)||meta&&['estimate','percentage','ci_lower','ci_upper','ci_level'].includes(flag.field)&&!numeric(meta.q[flag.field]))&&/source_number_not_supported|source_literal|not_reported/i.test(String(flag.code||''))&&!/conflict|disagree|mismatch/i.test(String(flag.code||''));
  function numericallySupported(row,options){
    const meta=metadata(row,options),fields=new Set([primary(meta.q),'ci_lower','ci_upper','ci_level','row']);
    if(row.review_stage==='R3'&&!sourceReady(meta))return false;
    return !flags(meta).some(flag=>fields.has(flag.field)&&(flag.field==='row'||numeric(meta.q[flag.field]))&&!/conflict|disagree|mismatch/i.test(String(flag.code||'')));
  }
  const generatedConflictReason='Different extracted values for the same source-linked clinical context; no averaging.';
  function generatedConflict(a,b,options,comparisons){
    const declarations=list(options.study?.details?.clinical_extraction_conflicts).filter(item=>item.reason===generatedConflictReason&&list(item.result_ids).includes(a.row.result_id)&&list(item.result_ids).includes(b.row.result_id));
    if(declarations.length!==1)return null;
    const facts=meta=>list(meta.row.source_reported_numbers||meta.row.reported_numbers),af=facts(a),bf=facts(b);
    if(!af.length||!bf.length)return null;
    const roles=new Set([...af,...bf].map(f=>f.role)),allowed=new Map(comparisons.map(c=>[c.field==='percentage'?'estimate':c.field,c]));
    const accounted=[];
    for(const role of roles){
      const ax=af.filter(f=>f.role===role),bx=bf.filter(f=>f.role===role);
      if(ax.length>1||bx.length>1)return null;
      const x=ax[0],y=bx[0];
      if(x&&y&&x.value===y.value&&norm(x.unit)===norm(y.unit)&&norm(x.qualifier)===norm(y.qualifier)&&norm(x.status)===norm(y.status))continue;
      if(role==='confidence_level'&&(!x||!y||x.value===y.value)&&!(numeric(a.q.ci_level)&&numeric(b.q.ci_level)&&a.q.ci_level!==b.q.ci_level)){accounted.push(role);continue;}
      const comparison=allowed.get(role);
      if(!comparison||!['rounding','exact','completion','source_unit_equivalence'].includes(comparison.kind))return null;
      if(x&&y&&(norm(x.qualifier)!==norm(y.qualifier)||norm(x.status)!==norm(y.status)))return null;
      if(x&&y&&norm(x.unit)!==norm(y.unit)&&!comparison.a?.derivation&&!comparison.b?.derivation)return null;
      accounted.push(role);
    }
    return {kind:'generated_signature_conflict',required_result_ids:[...declarations[0].result_ids],accounted_roles:accounted};
  }
  const displayActions=options=>list(options.displayReconciliation||options.study?.details?.outcome_display_reconciliation);
  function exportedConflict(a,b,options,comparisons,scope){
    if(!scope.link)return null;
    const actions=displayActions(options).filter(action=>String(action.pmid)===String(a.row.pmid||options.study?.pmid)&&action.section===a.section&&action.r2_id===scope.link.r2_id&&action.r3_id===scope.link.r3_id&&action.relation===scope.link.relation&&action.display_action==='conflict_preserved');
    if(actions.length!==1||!list(actions[0].fields).length)return null;
    const action=actions[0],newer=a.row.review_stage==='R3'?a:b,evidence=anchors(newer,action.evidence,options.registry||{});
    if(!evidence||JSON.stringify(evidence.map(e=>e.id).sort())!==JSON.stringify([...scope.link.evidence_ids].sort()))return null;
    const accounted=[];
    for(const field of action.fields){
      const qfield=field==='estimate'?primary(a.q):field==='confidence_level'?'ci_level':field;
      const comparison=comparisons.find(c=>c.field===qfield);
      if(comparison&&['exact','rounding','source_unit_equivalence'].includes(comparison.kind)){accounted.push(field);continue;}
      if(['ci_level','analysis_n','numerator','denominator','p_value'].includes(qfield)&&numeric(a.q[qfield])&&a.q[qfield]===b.q[qfield]){accounted.push(field);continue;}
      return null;
    }
    return {kind:'exported_result_conflict',section:action.section,r2_id:action.r2_id,r3_id:action.r3_id,relation:action.relation,accounted_fields:accounted,evidence_ids:evidence.map(e=>e.id)};
  }
  function resolvedFlags(meta,comparisons){
    const compared=new Map(comparisons.map(c=>[c.field,c])),resolved=[],unresolved=[],other=[];
    for(const flag of flags(meta)){
      if(unrelatedValidation(flag,meta)){other.push(flag);continue;}
      const comparison=compared.get(flag.field);
      // Only an explicitly numeric conflict in a verified equivalent field is
      // resolved. Source failures, sample size, unknown codes and generic row
      // warnings remain visible and unchanged in the original record.
      if(comparison&&['exact','rounding','source_unit_equivalence'].includes(comparison.kind)&&/conflict|disagree|mismatch/i.test(String(flag.code||''))&&!/source|unsupported|missing|scope|unit|denominator/i.test(String(flag.code||'')))resolved.push(flag);
      else unresolved.push(flag);
    }
    return {resolved,unresolved,other};
  }
  function compare(aRow,bRow,options={}){
    const a=metadata(aRow,options),b=metadata(bRow,options);
    if(!aRow.quantitative_record||!bRow.quantitative_record)return {equivalent:false,reason:'non_quantitative_result'};
    const scope=scopeCompatibility(a,b,options);
    if(!scope.ok)return {equivalent:false,reason:scope.reason};
    const key=primary(a.q);
    if(key!==primary(b.q)){
      const pair=countPercentagePair(a,b),precision=pair?sourcePrecision(pair.percentage,'percentage',options):null;
      if(!pair||!precision)return {equivalent:false,reason:'different_numerical_type'};
      return {equivalent:true,representative:pair.percentage.row,proof:{kind:'reported_percentage_completion',scope,members:[identity(aRow),identity(bRow)],selected:identity(pair.percentage.row),comparisons:[{field:'percentage',kind:'reported_completion',numerator:pair.percentage.q.numerator,denominator:pair.percentage.q.denominator,source:precision}],conflict_resolution:{suppress_display_conflict:false,resolved:[],unresolved:[...flags(a),...flags(b)],other_validation_flags:[]}}};
    }
    const fields=[key,'ci_lower','ci_upper'],comparisons=fields.map(field=>fieldComparison(a,b,field,options));
    const sourceUnits=explicitUnitEquivalence(a,b,key,options);
    if(sourceUnits)comparisons[0]=sourceUnits;
    for(const row of [aRow,bRow])for(const field of fields){
      const fact=row[field==='percentage'?'estimate':field];
      if(numeric(row.quantitative_record[field])&&fact&&known(fact.qualifier)&&fact.qualifier!=='equal')return {equivalent:false,reason:'qualified_numerical_value'};
    }
    if(comparisons.some(c=>c.kind==='different'))return {equivalent:false,reason:'different_values',scope,comparisons};
    if(!numeric(a.q[key])&&!numeric(b.q[key]))return {equivalent:false,reason:'no_numerical_estimate'};
    const generated=generatedConflict(a,b,options,comparisons),exported=exportedConflict(a,b,options,comparisons,scope);
    if(comparisons.some(c=>c.kind==='completion')&&!scope.link&&!(scope.kind==='same_source_scope'&&generated))return {equivalent:false,reason:'unlinked_tuple_completion'};
    const preferences=new Set(comparisons.map(c=>c.prefer).filter(Boolean));
    // Pick one whole tuple; never manufacture bounds from different results.
    if(preferences.size>1&&!sourceUnits)return {equivalent:false,reason:'no_single_dominant_tuple',scope,comparisons};
    let prefer=sourceUnits?.prefer||(preferences.size?[...preferences][0]:0);
    if(!prefer)prefer=aRow.review_stage!==bRow.review_stage?(bRow.review_stage==='R3'?1:-1):0;
    const af=resolvedFlags(a,comparisons),bf=resolvedFlags(b,comparisons);
    for(const [meta,resolution] of [[a,af],[b,bf]])if(meta.row.extraction_conflict&&!flags(meta).length&&scope.link?.relation!=='conflict'&&!generated&&!exported)resolution.unresolved.push({field:'row',code:'unattributed_extraction_conflict'});
    const numericConflict=scope.link?.relation==='conflict'&&comparisons.some(c=>c.kind==='rounding');
    const knownConflict=flags(a).length+flags(b).length>0;
    const suppressConflict=(numericConflict||generated||exported||knownConflict&&af.resolved.length+bf.resolved.length>0)&&!af.unresolved.length&&!bf.unresolved.length;
    return {equivalent:true,representative:prefer===1?bRow:aRow,proof:{kind:scope.display_only?'identical_display_tuple':sourceUnits?'explicit_source_unit_equivalence':comparisons.some(c=>c.kind==='rounding')?'source_rounding_equivalence':comparisons.some(c=>c.kind==='completion')?'source_linked_completion':'exact_scoped_duplicate',scientific_equivalence:scope.display_only?false:undefined,scope,comparisons,members:[identity(aRow),identity(bRow)],selected:identity(prefer===1?bRow:aRow),conflict_resolution:{suppress_display_conflict:!!suppressConflict,generated_conflict:generated,exported_conflict:exported,resolved:[...af.resolved,...bf.resolved],unresolved:[...af.unresolved,...bf.unresolved],other_validation_flags:[...af.other,...bf.other]}}};
  }
  function reconcile(rows,options={}){
    options={...options,rows:options.rows||rows,_metadata:new Map(),_precision:new Map()};
    const unique=[...new Set(rows)],groups=[],unresolved=[];
    for(const row of unique){
      let found=null;
      for(const group of groups){
        // Complete-link grouping prevents an unknown-scope/rounded middle row
        // from bridging two genuinely different precise estimates.
        const comparisons=group.members.map(member=>compare(member,row,options));
        if(comparisons.every(result=>result.equivalent)){
          const preferred=compare(group.representative,row,options);
          found=group;group.members.push(row);group.proofs.push(...comparisons.map(result=>result.proof));group.representative=preferred.representative;break;
        }
        for(let i=0;i<comparisons.length;i++)if(comparisons[i].reason==='different_values'||comparisons[i].reason==='no_single_dominant_tuple')unresolved.push({members:[group.members[i],row],...comparisons[i]});
      }
      if(!found)groups.push({representative:row,members:[row],proofs:[]});
    }
    for(const group of groups){
      if(!numericallySupported(group.representative,options)){
        const candidates=group.members.filter(row=>numericallySupported(row,options));
        if(candidates.length){
          const initial=group.representative;let selected=candidates[0];
          for(const candidate of candidates.slice(1)){const comparison=compare(selected,candidate,options);if(comparison.equivalent)selected=comparison.representative;}
          group.representative=selected;group.representative_selection={kind:'supported_member_fallback',initial:identity(initial),selected:identity(selected)};
        }
      }
      group.suppressed=group.members.filter(row=>row!==group.representative);
      const ids=new Set(group.members.map(row=>row.result_id));
      group.suppress_display_conflict=group.proofs.length>0&&group.proofs.some(p=>p.conflict_resolution.suppress_display_conflict)&&group.proofs.every(p=>!p.conflict_resolution.unresolved.length&&list(p.conflict_resolution.generated_conflict?.required_result_ids).every(id=>ids.has(id)));
      group.provenance=group.members.map(identity);
    }
    return {rows:groups.map(group=>group.representative),groups,unresolved};
  }
  // Called for one intended clinical outcome/horizon. A dated analysis can
  // supersede an earlier analysis in the main display, but the alternatives
  // remain full source objects. Neither publication stage nor file order is a
  // chronology, and unknown dates must not be treated as earlier dates.
  function cutoffOrder(row,options){
    const meta=metadata(row,options),text=String(meta.q.cutoff||''),evidence=anchors(meta,meta.q.evidence,options.registry||{});
    const reviewed=reviewedOrder(meta,options);if(reviewed)return reviewed;
    if(!evidence)return null;
    const monthNames=['january','february','march','april','may','june','july','august','september','october','november','december'];
    const monthPattern=monthNames.map(name=>name+'|'+name.slice(0,3)+'\\.?').join('|');
    let date=text.match(/\b(19\d{2}|20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
    if(!date){
      const forward=text.match(new RegExp('\\b('+monthPattern+')\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,|\\s)+\\s*((?:19|20)\\d{2})','i'));
      const reverse=text.match(new RegExp('\\b(\\d{1,2})\\s+('+monthPattern+')(?:,|\\s)+\\s*((?:19|20)\\d{2})','i'));
      const found=forward||reverse;
      if(found){const year=found[3],month=monthNames.findIndex(name=>name.startsWith(norm(forward?found[1]:found[2]).replace('.','')))+1,day=Number(forward?found[2]:found[1]);date=[year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'),year,String(month).padStart(2,'0'),String(day).padStart(2,'0')];}
    }
    if(date){
      const iso=date[0],stamp=Date.parse(iso+'T00:00:00Z');
      if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==iso)return null;
      const year=date[1],month=Number(date[2]),day=Number(date[3]),monthName=monthNames[month-1],short=monthName.slice(0,3);
      const rendered=new RegExp('(?:'+monthName+'|'+short+'\\.?)\\s+'+day+'(?:st|nd|rd|th)?(?:,|\\s)+\\s*'+year+'|'+day+'\\s+(?:'+monthName+'|'+short+'\\.?)(?:,|\\s)+\\s*'+year,'i');
      const proof=evidence.filter(a=>a.quote.includes(iso)||rendered.test(a.quote));
      return proof.length?{kind:'date',value:stamp,label:iso,evidence_ids:proof.map(a=>a.id)}:null;
    }
    const phase=/\bfinal\b/i.test(text)?'final':/\binterim\b/i.test(text)?'interim':null;
    if(!phase)return null;
    const proof=evidence.filter(a=>new RegExp('\\b'+phase+'(?:\\s+\\w+){0,3}\\s+(?:analysis|cutoff)|\\b'+phase+'\\s+results','i').test(a.quote));
    return proof.length?{kind:'analysis_phase',value:phase==='final'?1:0,label:phase,evidence_ids:proof.map(a=>a.id)}:null;
  }
  function selectOutcome(rows,options={}){
    options={...options,rows:options.rows||rows};
    const result=reconcile(rows,options),alternatives=result.groups.flatMap(g=>g.members);
    const supported=row=>numericallySupported(row,options);
    if(result.groups.length===1)return supported(result.rows[0])?{...result,representative:result.rows[0],status:'selected',selection_proof:{kind:result.groups[0].proofs.length?'equivalent_source_results':'single_result'},alternatives}:{...result,representative:null,status:'review_needed',reason:'unsupported_numerical_field',alternatives};
    if(!result.groups.length)return {...result,representative:null,status:'empty',alternatives};
    for(let i=0;i<result.groups.length;i++)for(let j=0;j<i;j++){
      const scope=scopeCompatibility(metadata(result.rows[i],options),metadata(result.rows[j],options),{...options,selectionMode:true});
      if(!scope.ok)return {...result,representative:null,status:'distinct_scopes',reason:scope.reason,alternatives};
    }
    const ordered=result.rows.map(row=>({row,order:cutoffOrder(row,options)}));
    if(ordered.every(x=>x.order)&&new Set(ordered.map(x=>x.order.kind)).size===1&&(!ordered.some(x=>x.order.estimand_key)||ordered.every(x=>x.order.estimand_key===ordered[0].order.estimand_key))){
      const max=Math.max(...ordered.map(x=>x.order.value)),latest=ordered.filter(x=>x.order.value===max);
      if(latest.length===1&&supported(latest[0].row))return {...result,representative:latest[0].row,status:'selected',alternatives,selection_proof:{kind:'latest_source_supported_analysis',selected:identity(latest[0].row),ordered:ordered.map(x=>({source:identity(x.row),...x.order}))}};
    }
    return {...result,representative:null,status:'review_needed',reason:'no_unique_source_supported_latest_result',alternatives};
  }
  function conflictStatus(row,options={}){
    const meta=metadata(row,options),held=flags(meta);
    if(!row.extraction_conflict)return {has_conflict:held.length>0,resolved:false,suppress_display_conflict:false,proofs:[],unresolved:held};
    const declarations=list(options.study?.details?.clinical_extraction_conflicts).filter(item=>list(item.result_ids).includes(row.result_id));
    const allRows=contextRows(options),proofs=[];
    const actions=displayActions(options).filter(action=>String(action.pmid)===String(row.pmid||options.study?.pmid)&&action.section===meta.section&&action.display_action==='conflict_preserved'&&(row.review_stage==='R2'?action.r2_id:action.r3_id)===meta.q.id);
    if(!declarations.length&&!actions.length||declarations.some(item=>item.reason!==generatedConflictReason))return {has_conflict:true,resolved:false,suppress_display_conflict:false,proofs:[],unresolved:[...held,{field:'row',code:'unattributed_extraction_conflict'}]};
    for(const action of actions){
      const partner=allRows.filter(candidate=>candidate.review_stage!==row.review_stage&&candidate.quantitative_record?.id===(row.review_stage==='R2'?action.r3_id:action.r2_id));
      const comparison=partner.length===1?compare(row,partner[0],{...options,rows:allRows}):null;
      if(comparison?.reason==='no_single_dominant_tuple'){
        const a=metadata(row,options),b=metadata(partner[0],options),exported=exportedConflict(a,b,options,comparison.comparisons,comparison.scope),ar=resolvedFlags(a,comparison.comparisons),br=resolvedFlags(b,comparison.comparisons);
        if(exported&&!ar.unresolved.length&&!br.unresolved.length){proofs.push({kind:'compatible_rounding_with_complementary_precision',scope:comparison.scope,comparisons:comparison.comparisons,members:[identity(row),identity(partner[0])],exported_conflict:exported,representative:null,reason:'Numeric differences are explained; source tuples remain intact because precision and completeness favor different members.'});continue;}
      }
      if(!comparison?.equivalent||!comparison.proof.conflict_resolution.exported_conflict||comparison.proof.conflict_resolution.unresolved.length)return {has_conflict:true,resolved:false,suppress_display_conflict:false,proofs,unresolved:[...held,{field:'row',code:'unresolved_exported_conflict'}]};
      proofs.push(comparison.proof);
    }
    for(const declaration of declarations){
      const members=declaration.result_ids.map(id=>allRows.find(value=>value.result_id===id));
      if(members.some(value=>!value))return {has_conflict:true,resolved:false,suppress_display_conflict:false,proofs,unresolved:[...held,{field:'row',code:'incomplete_generated_conflict_members'}]};
      const scopeOptions={...options,rows:allRows},comparison=reconcile(members,scopeOptions);
      if(comparison.groups.length===1&&comparison.groups[0].suppress_display_conflict){proofs.push(...comparison.groups[0].proofs);continue;}
      const semantic=members.map(member=>semanticOutcome(member,scopeOptions));
      const pairs=[];let resolved=true;
      for(let i=0;i<members.length;i++)for(let j=0;j<i;j++){
        if(semantic[i].key!==semantic[j].key&&semantic[i].specific&&semantic[j].specific&&semantic[i].proof&&semantic[j].proof&&!flags(metadata(members[i],options)).some(flag=>!unrelatedValidation(flag,metadata(members[i],options)))&&!flags(metadata(members[j],options)).some(flag=>!unrelatedValidation(flag,metadata(members[j],options)))){pairs.push({kind:'distinct_source_supported_endpoints',members:[identity(members[j]),identity(members[i])],semantics:[semantic[j],semantic[i]]});continue;}
        const equivalent=compare(members[j],members[i],scopeOptions);
        if(equivalent.equivalent&&!equivalent.proof.conflict_resolution.unresolved.length)pairs.push(equivalent.proof);
        else resolved=false;
      }
      if(!resolved)return {has_conflict:true,resolved:false,suppress_display_conflict:false,proofs,unresolved:[...held,{field:'row',code:'unresolved_generated_conflict'}]};
      proofs.push({kind:'generated_conflict_split_by_supported_outcome',required_result_ids:declaration.result_ids,pairs});
    }
    return {has_conflict:true,resolved:true,suppress_display_conflict:true,proofs,unresolved:held.filter(flag=>unrelatedValidation(flag,meta)),other_validation_flags:held.filter(flag=>unrelatedValidation(flag,meta))};
  }
  return Object.freeze({reconcile,compare,selectOutcome,semanticOutcome,conflictStatus,rowKey,sourcePrecision:(row,field,options={})=>sourcePrecision(metadata(row,options),field,options),decimalLiteral});
});
