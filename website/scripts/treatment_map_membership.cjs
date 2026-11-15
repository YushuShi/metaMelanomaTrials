'use strict';
// Active node coverage is exact-regimen coverage. Inclusive component coverage
// remains available as historical metadata, but never supplies the displayed N.
const crypto=require('node:crypto');
const list=x=>Array.isArray(x)?x:[],uniq=x=>[...new Set(x.filter(x=>x!==null&&x!==undefined&&x!==''))].sort();
const id=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,24);
const independentKey=row=>row.cohort?.independent_group_id||row.cohort?.root_id||row.study_id;
function apply({nodes,contributions,articles}){
  const memberships=[];
  for(const c of contributions){
    c.inclusive_node_ids=[...c.node_ids];c.inclusive_n=c.node_ids.length?c.n:null;c.inclusive_note=c.note;
    c.inclusive_relevant_node_ids=c.relevant_node_ids;c.node_ids=[];c.relevant_node_ids=c.exact_node_ids||[];
    c.note=c._base_note||'';c.n=null;
  }
  for(const node of nodes.values()){
    node.inclusive_count_summary=node.count_summary;node.inclusive_contribution_ids=node.contribution_ids;
    const relevant=contributions.filter(c=>c.relevant_node_ids.includes(node.id));
    const known=relevant.filter(c=>c.study_id),unknown=relevant.filter(c=>!c.study_id),byStudy=new Map();
    const eligible=known.filter(c=>c.available_n!==null&&c._candidate_nodes.length&&c.independent_cohort_count_eligible!==false);
    for(const c of eligible){if(!byStudy.has(c.study_id))byStudy.set(c.study_id,[]);byStudy.get(c.study_id).push(c);}
    let overlap=0;
    for(const cs of byStudy.values()){
      const selected=[],sorted=cs.slice().sort((a,b)=>(a.cohort?.aggregate_parent_root_id===b.cohort?.root_id?1:b.cohort?.aggregate_parent_root_id===a.cohort?.root_id?-1:0)||Number(a.cohort?.is_subgroup)-Number(b.cohort?.is_subgroup)||Number(b.disjoint)-Number(a.disjoint)||b.available_n-a.available_n||a.id.localeCompare(b.id));
      for(const c of sorted){
        const independent=selected.every(other=>c.cohort?.aggregate_parent_root_id!==other.cohort?.root_id&&other.cohort?.aggregate_parent_root_id!==c.cohort?.root_id&&((c.cohort_disjoint||other.cohort_disjoint)&&c.cohort?.root_id!==other.cohort?.root_id||!c.cohort?.is_subgroup&&!other.cohort?.is_subgroup&&c.disjoint&&other.disjoint&&c._source_keys.some(k=>other._source_keys.includes(k))));
        if(independent){c.node_ids.push(node.id);c.n=c.available_n;selected.push(c);}else{overlap++;c.note+=' Overlapping exact-regimen cohort; this node does not add its N again.';}
      }
    }
    if(!eligible.length){
      const byPublication=new Map();for(const c of unknown.filter(c=>c.available_n!==null&&c._candidate_nodes.length)){if(!byPublication.has(c.pmid))byPublication.set(c.pmid,[]);byPublication.get(c.pmid).push(c);}
      const options=[...byPublication.values()].map(cs=>{const selected=[];for(const c of cs.sort((a,b)=>b.available_n-a.available_n||a.id.localeCompare(b.id)))if(!selected.length||c.disjoint&&selected.every(x=>x.disjoint&&x._source_keys.some(k=>c._source_keys.includes(k))))selected.push(c);return selected;}).sort((a,b)=>b.reduce((n,c)=>n+c.available_n,0)-a.reduce((n,c)=>n+c.available_n,0)||a[0].pmid.localeCompare(b[0].pmid));
      for(const c of options[0]||[]){c.node_ids.push(node.id);c.n=c.available_n;}
    }
    const counted=relevant.filter(c=>c.node_ids.includes(node.id)),identified=uniq(known.filter(c=>c.independent_cohort_count_eligible!==false).map(independentKey)),knownStudies=uniq(counted.map(independentKey));
    const uncertain=relevant.filter(c=>c.n===null||c.status==='partial'),unlinked=uniq(unknown.flatMap(c=>c.publication_ids));
    const status=!counted.length?'unresolved':counted.some(c=>!c.study_id)?'provisional':uncertain.length||unlinked.length||overlap||knownStudies.length<identified.length?'partial':'calculated';
    node.contribution_ids=relevant.map(c=>c.id);node.count_summary={identified_studies:identified.length,known_n:counted.length?counted.reduce((sum,c)=>sum+c.n,0):null,known_n_studies:knownStudies.length,unlinked_publications:unlinked.length,status,unresolved_arms:uncertain.length+overlap,publication_count:uniq(relevant.flatMap(c=>c.publication_ids)).length,counted_arms:counted.length,coverage_note:'Exact complete regimen only; combinations, other sequences and unresolved alternatives do not count as monotherapy.'};
    const nodeMemberships=[];
    for(const c of relevant){
      for(const pmid of uniq(c._observations.map(o=>o.source.pmid))){
        const os=c._observations.filter(o=>o.source.pmid===pmid&&o.exact_node_id===node.id),article=articles.get(pmid)||{};if(!os.length)continue;
        const local=os.flatMap(o=>o.candidates).sort((a,b)=>a.rank-b.rank||b.n-a.n),bindings=[];
        for(const o of os){
          const source=o.source,key=[source.record.stage,source.record.source_sha256,source.binding,source.task_id,source.raw_record_sha256].join('|');let b=bindings.find(b=>b._key===key);
          if(!b){b={_key:key,pmid,report_id:source.record.report_id,task_id:source.task_id,raw_record_sha256:source.raw_record_sha256,stage:source.record.stage,source_input_sha256:source.record.source_sha256,review_binding_sha256:source.binding,arm_ids:[],population_ids:[],result_ids:[],sample_ids:[]};bindings.push(b);}
          b.arm_ids.push(o.arm.id);b.population_ids.push(o.population?.id);
          const same=row=>row.review_stage===source.record.stage&&row.source_input_sha256===source.record.source_sha256&&row.review_binding_sha256===source.binding&&row.report_id===source.record.report_id;
          for(const row of list(article.quantitative_results)){const r=row.quantitative_record||{};if(same(row)&&[r.arm_id,r.intervention_arm_id,r.reference_arm_id].includes(o.arm.id))b.result_ids.push(row.result_id);}
          for(const row of list(article.sample_size_records)){const r=row.quantitative_record||{};if(same(row)&&(r.arm_id===o.arm.id||o.candidates.some(x=>x.sample.id===r.id)))b.sample_ids.push(row.sample_record_id);}
        }
        for(const b of bindings){delete b._key;for(const k of ['arm_ids','population_ids','result_ids','sample_ids'])b[k]=uniq(b[k]);}
        const m={id:'membership:'+id([node.id,c.id,pmid]),node_id:node.id,canonical_regimen:{node_id:node.id,label:node.label,components:node.components},study_id:c.study_id,study_name:c.study_name,nct_ids:c.nct_ids,cohort_id:c.cohort_id,root_id:c.cohort?.root_id||null,cohort:c.cohort,independent_cohort_count_eligible:c.independent_cohort_count_eligible!==false,participant_hold_reason:c.independent_cohort_count_eligible===false?c.note:null,pmid,title:article.title||null,first_author_surname:article.first_author_surname||null,year:article.year||null,source_url:'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/',population:c.population,arm_label:os[0].arm.label,sample_n:local[0]?.n??null,count_status:c.status,counted_in_node:c.node_ids.includes(node.id)&&c.selected_source_ref?.pmid===pmid,counted_n:c.node_ids.includes(node.id)&&c.selected_source_ref?.pmid===pmid?c.n:null,contribution_ids:[c.id],source_bindings:bindings,source_refs:c.source_refs.filter(s=>s.pmid===pmid)};
        memberships.push(m);nodeMemberships.push(m.id);
      }
    }
    node.study_membership_ids=nodeMemberships;
  }
  for(const c of contributions){delete c._observations;delete c._base_note;}
  return memberships.sort((a,b)=>a.id.localeCompare(b.id));
}
module.exports={apply};
