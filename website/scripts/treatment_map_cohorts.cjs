'use strict';
// Source-bound study/cohort identities. Internal IDs permit original unnamed
// studies without pretending that a PMID is a registry or independent patient.
const crypto=require('node:crypto');
const list=x=>Array.isArray(x)?x:[],text=x=>typeof x==='string'&&!/^(?:NA|unknown|null)$/i.test(x.trim())?x.trim():'',norm=x=>text(x).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,24);
function create(sources,{quote,anchored,refs}){
  const populations=s=>new Map(list(s.record.populations).map(p=>[p.id,p]));
  const ancestry=(s,p)=>{const out=[],seen=new Set(),map=populations(s);while(p&&!seen.has(p.id)){out.push(p);seen.add(p.id);p=map.get(p.parent_id);}return out;};
  const evidence=(s,p)=>[...list(s.record.study?.evidence),...ancestry(s,p).flatMap(x=>list(x.evidence))];
  const sourceProof=(s,p)=>quote(s,evidence(s,p));
  const paperProofCache=new Map();
  const paperProofFor=s=>{if(!paperProofCache.has(s.pmid))paperProofCache.set(s.pmid,sources.filter(x=>x.pmid===s.pmid).map(x=>norm(quote(x,[...list(x.record.study?.evidence),...list(x.record.populations).flatMap(p=>list(p.evidence))]))).join(' '));return paperProofCache.get(s.pmid);};
  const proofRefs=(s,p)=>[{pmid:s.pmid,stage:s.record.stage,source_sha256:s.record.source_sha256,population_id:p?.id||null,evidence_ids:refs(s,evidence(s,p))}];
  function reviewedIdentity(s,p){
    const wording=norm(ancestry(s,p).map(x=>x.label).join(' ')),proof=norm(sourceProof(s,p));
    // Reviewed source mappings repair extracted metadata, never source tuples.
    // The article and corresponding quoted trial/cohort wording must agree.
    const samePaper=sources.filter(x=>x.pmid===s.pmid),paperProof=paperProofFor(s);
    // This biomarker report explicitly distinguishes CheckMate-067 from its
    // IO-GEM validation data. The latter also reuse published datasets, and its
    // Methods and figure report different cohort totals. An article-level trial
    // alias must not allocate either IO-GEM or the pooled analysis to CM-067.
    if(s.pmid==='40473950'&&/cm-?067 clinical trial.*nct01844505/.test(paperProof)&&
      /io-gem.{0,160}soc cohort/.test(paperProof)&&/previously published datasets|publicly available sequencing/.test(paperProof)){
      const chain=ancestry(s,p),local=chain.map(x=>norm(x.label)).find(label=>/io-gem|checkmate-?067|cm-?067/.test(label))||'';
      const namedTrial=/checkmate-?067|cm-?067/.test(local),namedValidation=/io-gem/.test(local);
      if(namedTrial&&!namedValidation)return {study_id:'nct:NCT01844505',study_name:'CheckMate 067',nct_ids:['NCT01844505'],
        linkage:'source_reviewed_population_trial',identity_source_refs:proofRefs(s,p)};
      const aggregate=namedTrial&&namedValidation||!namedValidation;
      const reportedTotals=[...new Set([...paperProof.matchAll(/(?:soc validation cohort consisted of|total io-gem,?)\s*n\s*=\s*([\d,]+)/g)].map(m=>Number(m[1].replace(/,/g,''))))].sort((a,b)=>a-b);
      const reason='IO-GEM includes previously published datasets with unresolved patient overlap; '+
        (reportedTotals.length>1?'source Methods and figure report different validation-cohort totals. ':'validation-cohort denominator allocation remains unresolved. ')+
        'No independent participant total is added pending source review.';
      return {study_id:(aggregate?'aggregate:report:':'cohort:report:')+s.pmid+(aggregate?':checkmate067-io-gem':':io-gem'),
        study_name:aggregate?'CheckMate 067 + IO-GEM aggregate':'IO-GEM validation cohort',nct_ids:aggregate?['NCT01844505']:[],
        linkage:aggregate?'source_reviewed_trial_validation_aggregate':'source_reviewed_named_validation_cohort',
        participant_overlap_unresolved:true,reused_data_review_pending:true,independent_cohort_count_eligible:false,
        participant_count_conflict:reportedTotals.length>1?{status:'source_discrepancy',reported_totals:reportedTotals}:null,
        participant_hold_reason:reason,identity_source_refs:samePaper.flatMap(x=>list(x.record.populations).flatMap(pop=>proofRefs(x,pop)))};
    }
    if(s.pmid==='37377890'&&/nct03060356/.test(paperProof)&&/nct01837602/.test(paperProof))return {study_id:'cohort:report:'+s.pmid,study_name:'cMET CAR-T pilot cohort',nct_ids:['NCT01837602','NCT03060356'],linkage:'internal_original_cohort_registration_conflict',registration_allocation_pending:true,identity_source_refs:samePaper.flatMap(x=>list(x.record.populations).flatMap(p=>proofRefs(x,p)))};
    const primaryRegistrations=[
      ['34464163','NCT01227551',/injections?[^.]*nct01227551/,/extension study[^.]*nct01636882/],
      ['19139884','NCT00289627',/we enrolled.{0,550}nct00289627/,/three of these patients/]
    ];
    for(const [pmid,nct,primary,context] of primaryRegistrations)if(s.pmid===pmid&&primary.test(paperProof)&&context.test(paperProof))return {study_id:'nct:'+nct,study_name:nct,nct_ids:[nct],linkage:'source_reviewed_primary_recruitment',identity_source_refs:samePaper.flatMap(x=>list(x.record.populations).flatMap(p=>proofRefs(x,p)))};
    if(s.pmid==='39306585'&&/keynote.?006.*nct01866319/.test(paperProof)&&/transition to keynote.?587|transitioned to keynote.?587/.test(paperProof))return {study_id:'nct:NCT01866319',study_name:'KEYNOTE-006',nct_ids:['NCT01866319'],linkage:'source_reviewed_same_patient_followup',identity_source_refs:samePaper.flatMap(x=>list(x.record.populations).flatMap(p=>proofRefs(x,p)))};
    if(s.pmid==='18809613'&&/previously reported|previously published|updated/.test(paperProof)&&/nonmyeloablative|non.myeloablative|previously reported/.test(wording))return {study_id:'cohort:report:'+s.pmid,study_name:'Previously reported ACT cohort',nct_ids:s.ncts,linkage:'internal_cohort_unresolved_prior_trial_overlap',participant_overlap_unresolved:true,identity_source_refs:samePaper.flatMap(x=>list(x.record.populations).flatMap(p=>proofRefs(x,p)))};
    if(s.pmid==='33990415'){
      const regimen=/120cy\/125flu/.test(wording)?'120cy/125flu':/60cy\/125flu/.test(wording)?'60cy/125flu':/tbi\/75flu/.test(wording)?'tbi/75flu':null;
      const nct=regimen==='120cy/125flu'?'NCT00287131':'NCT03166397';
      if(regimen&&paperProof.includes(regimen)&&paperProof.includes(nct.toLowerCase())&&/cohort|preconditioning/.test(proof))return {study_id:'nct:'+nct,study_name:nct,nct_ids:[nct],linkage:'source_reviewed_regimen_cohort',identity_source_refs:samePaper.flatMap(x=>list(x.record.populations).flatMap(p=>proofRefs(x,p)))};
    }
    if(s.pmid==='20856802'&&/peripheral blood samples.*within two protocols/.test(paperProof)){
      if(/\bga\b/.test(wording)&&/nct00471887/.test(paperProof))return {study_id:'nct:NCT00471887',study_name:'NCT00471887',nct_ids:['NCT00471887'],linkage:'source_reviewed_population_trial',identity_source_refs:samePaper.flatMap(x=>list(x.record.populations).flatMap(p=>proofRefs(x,p)))};
      return {study_id:null,study_name:'Previously recruited tremelimumab trial cohorts',nct_ids:s.ncts,linkage:'known_multi_trial_reanalysis_unallocated',identity_source_refs:samePaper.flatMap(x=>list(x.record.populations).flatMap(p=>proofRefs(x,p)))};
    }
    if((s.pmid==='31406564'&&/nct00436930/.test(paperProof)&&/nct00948480/.test(paperProof)&&/single.arm|open.label/.test(paperProof))||(s.pmid==='25424856'&&/previously reported|described in a previous report/.test(paperProof))){
      return {study_id:'cohort:report:'+s.pmid,study_name:s.names.join('; ')||'Source cohort',nct_ids:s.ncts,linkage:'internal_cohort_unresolved_prior_trial_overlap',participant_overlap_unresolved:true,identity_source_refs:samePaper.flatMap(x=>list(x.record.populations).flatMap(p=>proofRefs(x,p)))};
    }
    if(s.pmid==='32303612'&&/checkmate.?064/.test(paperProof)&&/nct01783938/.test(paperProof)&&/checkmate.?064|baseline.*crp/.test(proof+' '+wording+' '+norm(s.record.study?.name)))return {study_id:'nct:NCT01783938',study_name:'CheckMate 064',nct_ids:['NCT01783938'],linkage:'source_reviewed_clinical_cohort',identity_source_refs:samePaper.flatMap(x=>list(x.record.populations).flatMap(p=>proofRefs(x,p)))};
    if(s.pmid==='33558721'&&/opacin/.test(proof)){
      if(/opacin.?neo/.test(wording)&&s.ncts.includes('NCT02977052')&&/nct02977052/.test(proof))return {study_id:'nct:NCT02977052',study_name:'OpACIN-neo',nct_ids:['NCT02977052'],linkage:'source_reviewed_population_trial',identity_source_refs:proofRefs(s,p)};
      if(/opacin/.test(wording)&&s.ncts.includes('NCT02437279')&&/nct02437279/.test(proof))return {study_id:'nct:NCT02437279',study_name:'OpACIN',nct_ids:['NCT02437279'],linkage:'source_reviewed_population_trial',identity_source_refs:proofRefs(s,p)};
    }
    if(s.pmid==='38458639'&&s.ncts.includes('NCT02253992')&&/ca186.?107/.test(wording)&&/ca186.?107/.test(proof)&&/nct02253992/.test(paperProof))return {study_id:'nct:NCT02253992',study_name:'CA186-107',nct_ids:['NCT02253992'],linkage:'source_reviewed_population_trial',identity_source_refs:samePaper.flatMap(x=>list(x.record.populations).flatMap(p=>proofRefs(x,p)))};
    return null;
  }
  function independentToken(s,p,identity){
    const chain=ancestry(s,p),root=chain[chain.length-1]||p,wording=norm(root?.label),proof=norm(sourceProof(s,p))||paperProofFor(s);
    // Source-qualified formal cohort names can carry an externally verified
    // recruitment distinction even when this report omits the extension wording.
    if(identity.named_cohort_key)return 'cohort:'+identity.named_cohort_key;
    if(s.pmid==='33990415'&&identity.study_id==='nct:NCT03166397'&&/follow.up study was initiated|cohort/.test(proof)){
      if(/60cy\/125flu/.test(chain.map(p=>norm(p.label)).join(' ')))return 'cohort:60cy-125flu';
      if(/tbi\/75flu/.test(chain.map(p=>norm(p.label)).join(' ')))return 'cohort:tbi-75flu';
    }
    if(identity.study_id==='nct:NCT02977052'){
      // PRADO is an explicitly independent extension cohort, not a new
      // follow-up denominator for the original randomized OpACIN-neo cohort.
      const pradoProof=sources.some(x=>/prado extension cohort of the opacin.neo trial|opacin.neo.*prado.*two independent cohorts/.test(norm(sourceProof(x,list(x.record.populations)[0]))));
      if(pradoProof){
        const own=norm(root?.label+' '+s.record.study?.name+' '+identity.study_name+' '+s.article?.title);
        if(/prado/.test(own)&&/prado/.test(paperProofFor(s)))return 'cohort:prado';
        if(/opacin.neo/.test(own)&&/opacin.neo/.test(paperProofFor(s)))return 'cohort:opacin-neo';
      }
    }
    if(identity.study_id==='nct:NCT03047928'){
      const external=chain.find(x=>x.scope==='overall'&&/dammed|mm1632|reference cohort|historical/.test(norm(x.label)));
      if(external)return 'external-reference:'+hash(norm(external.label));
      const own=chain.map(x=>norm(x.label)).find(x=>/cohort [ab]|naive|first.line|mm1636.*treatment cohort|progression during anti-pd.?1/.test(x))||wording;
      if(/cohort b|progression during anti-pd.?1/.test(own)&&/cohort b|progression during anti-pd.?1/.test(proof))return 'cohort:b';
      if(/cohort a|naive|first.line|mm1636.*treatment cohort/.test(own)&&/cohort a|naive|first.line|mm1636/.test(proof))return 'cohort:a';
    }
    if(s.pmid==='36450385'){
      const cohort=chain.map(x=>norm(x.label).match(/^cohort ([456])\b/)).find(Boolean);
      if(cohort&&/cohort[s]? (?:4|four)|cohort[s]? (?:5|five)|cohort[s]? (?:6|six)/.test(proof))return 'cohort:'+cohort[1];
    }
    const explicit=chain.find(x=>x.disjoint==='yes'||x.independence_verified===true||/\b(?:independently|separately) (?:recruited|enrolled)|\bnon[- ]overlapping cohorts?\b/i.test(quote(s,list(x.evidence))));
    if(explicit)return 'cohort:'+norm(explicit.cohort_id||explicit.label||explicit.id);
    return null;
  }
  function canonicalPopulation(s,p){
    if(!p)return '';
    // An explicit R3 relation supplies stable same-paper population membership.
    if(s.record.stage==='R3'){
      const matches=list(s.record.r2_links).filter(l=>l.section==='populations'&&l.r3_id===p.id&&['same','supplement'].includes(l.relation)&&anchored(s,l.evidence));
      const ids=[...new Set(matches.map(l=>l.r2_id))];if(ids.length===1)return 'r2:'+ids[0];
    }
    if(s.record.stage==='R2')return 'r2:'+p.id;
    return 'source:'+s.record.stage+':'+p.id;
  }
  function describe(s,p,identity){
    const chain=ancestry(s,p),token=independentToken(s,p,identity),rootPopulation=chain[chain.length-1]||p;
    const melanomaRoot=chain.find(x=>x.melanoma_only==='yes'&&populations(s).get(x.parent_id)?.melanoma_only==='no');
    const rootId=identity.study_id+'|'+(token||'overall');
    const independent=!!token;
    const explicitCohort=x=>x.disjoint==='yes'||x.independence_verified===true||s.pmid==='36450385'&&/^cohort [456]$/.test(norm(x.label));
    const recruitmentRoots=chain.filter(x=>independentToken(s,x,identity)===token&&(x.scope==='overall'||explicitCohort(x)));
    // A trial's all-randomized/ITT population is the recruitment cohort even
    // when the extraction represents screened/enrolled patients as its parent.
    // Require a whole-population randomized count, multiple arms and a parent
    // with enrollment (but no randomized/ITT population), not a clinical subset.
    const randomizedRoot=chain.find(x=>{
      const parent=populations(s).get(x.parent_id),label=norm(x.label),counts=list(s.record.sample_sizes);
      const supported=row=>Number.isFinite(row.n)&&row.n>0&&anchored(s,row.evidence)&&!list(row.field_flags).some(f=>/\bn\b|population|arm|count_purpose/.test(String(f.field||'')));
      return s.record.study?.randomized==='yes'&&x.scope==='overall'&&parent&&parent.melanoma_only!=='no'&&
        /\brandomi[sz]ed\b|\bitt\b|intention[- ]to[- ]treat/.test(label)&&
        !/\bonly\b|subgroup|subset|biomarker|pd.?l1|braf|evaluable|assessable|responders?|\btreated\b|quality.of.life|safety/.test(label)&&
        list(s.record.arms).filter(a=>a.population_id===x.id).length>=2&&
        counts.some(n=>n.population_id===x.id&&!text(n.arm_id)&&['randomized','ITT'].includes(n.count_purpose)&&supported(n))&&
        counts.some(n=>n.population_id===parent.id&&!text(n.arm_id)&&n.count_purpose==='enrolled'&&supported(n))&&
        !counts.some(n=>n.population_id===parent.id&&['randomized','ITT'].includes(n.count_purpose)&&supported(n));
    });
    const relevantRoot=independent?(recruitmentRoots[recruitmentRoots.length-1]||rootPopulation):randomizedRoot||melanomaRoot||rootPopulation;
    const isSubgroup=p!==relevantRoot&&(p?.scope!=='overall'||text(p?.parent_id))||(!independent&&!text(p?.parent_id)&&p?.scope==='subgroup'&&!melanomaRoot);
    const idFor=x=>x===relevantRoot?rootId:rootId+'|population:'+hash([s.pmid,canonicalPopulation(s,x)]);
    const parent=populations(s).get(p?.parent_id);
    const restriction=norm(p?.label).replace(/\b(?:patients?|participants?|with|having|subgroup|population|cohort|of|the|melanoma|disease|clinical|ajcc)\b/g,' ').replace(/[^a-z0-9 -]/g,' ').replace(/\s+/g,' ').trim();
    const filterKeys=/^stage (?:i|ii|iii|iv|1|2|3|4)$/.test(restriction)?['stage']:
      /^(?:baseline )?ldh (?:normal|elevated|high)$|^(?:normal|elevated|high) (?:baseline )?ldh$/.test(restriction)?['baseline_ldh']:
      /^braf (?:mutant|mutated|wild type|wild-type)$|^(?:mutant|mutated|wild type|wild-type) braf$/.test(restriction)?['braf']:
      /^(?:cutaneous|mucosal|uveal)$/.test(restriction)?['subtype']:[];
    return {id:isSubgroup?idFor(p):rootId,parent_id:isSubgroup?(parent?idFor(parent):rootId):null,root_id:rootId,
      label:text(p?.label)||'Population not reported',scope:isSubgroup?'subgroup':independent?'independent_cohort':'overall',is_subgroup:!!isSubgroup,
      independent_group_id:rootId,independently_recruited:independent,aggregate_parent_root_id:independent&&text(relevantRoot.parent_id)?identity.study_id+'|overall':null,
      stratum_key:isSubgroup?norm(p?.label):'overall',filter_equivalence_keys:filterKeys,
      source_population_ids:chain.map(x=>x.id),source_refs:proofRefs(s,p)};
  }
  return {reviewedIdentity,describe,ancestry,proofRefs};
}
module.exports={create};
