'use strict';
// A read-only projection of released source records. Matching never changes the
// trial graph, the study table, the current extraction, or an analysis pool.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const Quant = require('../dist/quantitative_extraction.js');
const Groups = require('../dist/treatment_groups.js');
const TrialIds = require('../dist/trial_identifiers.js');
const {extractOutcomes,indexOutcomeSemantics} = require('./phase_comparison_outcomes.cjs');

const clean = value => typeof value === 'string' && !/^(NA|N\/A|unknown|null)$/i.test(value.trim()) ? value.trim() : '';
const uniq = items => [...new Set(items.filter(Boolean))];
const publication = (article,citation) => ({pmid:article.pmid,title:article.title,date:citation.date||null,
  date_basis:citation.date_basis,url:'https://pubmed.ncbi.nlm.nih.gov/'+article.pmid+'/'});
const newest = (a,b) => (b||'').localeCompare(a||'');
const trialOrder = (a,b) => newest(a.primary_date,b.primary_date)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
const stages = {advanced:'Advanced',adjuvant:'Adjuvant',neoadjuvant:'Neoadjuvant',perioperative:'Perioperative',mixed:'Mixed settings'};
const asKey = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
function read(root,name) {
  const p=path.join(root,name);
  const bytes=fs.existsSync(p)?fs.readFileSync(p):zlib.gunzipSync(fs.readFileSync(p+'.gz'));
  return JSON.parse(bytes);
}

function indexArms(normalizations) {
  const arms=new Map();
  for (const comparison of Object.values(normalizations.comparisons)) {
    for (const role of Object.values(comparison.roles)) {
      const def=normalizations.definition_profiles[role.definition_ref]||role.definition;
      const scope=role.source_binding?.scope;
      const arm=def?.native_graph?.arm_id||def?.arm_id;
      if(arm && scope) arms.set([comparison.pmid,scope.review_stage,scope.source_input_sha256,arm].join('|'),{...def,source_binding:role.source_binding});
    }
  }
  return arms;
}
// A source arm can contain an investigational product before it has a shared
// catalogue identifier. Keep a literal ID scoped to that formal product name;
// never trim an unknown member out of a complete combination.
function nativeCourse(arm) {
  const nodes=new Map(arm.nodes.map(n=>[n.id,n]));
  function walk(id) {
    const n=nodes.get(id);
    if(!n)return null;
    const children=n.children.map(walk);
    if(children.length){
      if(children.some(x=>!x))return null;
      if(n.kind==='OR'){
        const alternatives=uniq(children.map(x=>x.id));
        if(alternatives.length===1)return children[0];
        return {id:'alternatives:'+alternatives.sort().join('|'),label:children.map(x=>x.label).join(' or '),drugs:[],control:true};
      }
      if(!['AND','SEQUENTIAL'].includes(n.kind)||children.some(x=>x.control&&!x.inactive))return null;
      let active=children.filter(x=>!x.inactive);
      if(!active.length)return children[0];
      if(n.kind==='AND')active=active.slice().sort((a,b)=>a.id.localeCompare(b.id));
      active=active.filter((x,i)=>i===0||x.id!==active[i-1].id);
      if(active.length===1)return active[0];
      return {id:active.map(x=>x.id).join(n.kind==='AND'?'+':'->'),label:active.map(x=>x.label).join(n.kind==='AND'?' + ':' → '),
        drugs:uniq(active.flatMap(x=>x.drugs)).sort()};
    }
    const literal=clean(n.name);
    if(!literal)return null;
    if(/^(?:(?:radical|surgical|wide local) )?(?:surgery|excision|resection)$/i.test(literal))return {id:'surgery',label:'Surgery',drugs:['Surgery']};
    if(/^(?:radiotherapy|radiation therapy|stereotactic body radiotherapy|stereotactic body radiation therapy|stereotactic radiosurgery)$/i.test(literal))return {id:asKey(literal),label:literal[0].toUpperCase()+literal.slice(1),drugs:[literal[0].toUpperCase()+literal.slice(1)]};
    const shared=Groups.describe(literal);
    if(shared.key==='class:cytokines:gm-csf')return {id:'gm-csf',label:'GM-CSF',drugs:['GM-CSF']};
    if(shared.agent_ids?.length===1 && shared.known)return {id:shared.agent_ids[0],label:shared.label,drugs:[shared.label]};
    if(/^(?:matching |matched )?placebo$|^observation$|^best supportive care$/i.test(literal))return {id:'control:'+asKey(literal),label:literal,drugs:[],control:true,inactive:true};
    if(n.kind!=='drug'||literal.length>74||/unknown|unspecified|not reported|investigator.{0,4}choice|chemotherap(?:y|eutic)|antibod(?:y|ies)|inhibitors?$| or | with | plus | arm |salvage|either|regimen|prior |history of|\d\s*(?:mg|µg|mcg|kg)|combined/i.test(literal))return null;
    const label=/^[a-z]+-?\d+[a-z]?$/i.test(literal)?literal.toUpperCase():literal.slice(0,1).toUpperCase()+literal.slice(1);
    return {id:'reported:'+asKey(literal),label,drugs:[label]};
  }
  return walk(arm.root_id);
}
function regimenFor(arm,record,definitions,labels) {
  if (!arm.evidence?.length) return null;
  const key=[record.pmid,record.stage,record.source_sha256,arm.id].join('|');
  let def=definitions.has(key)?Groups.rematerializeDefinition(definitions.get(key)):null;
  if(!def) {
    if(!arm.nodes?.length)return null;
    const native={arm_id:arm.id,label:arm.label,root_node_id:arm.root_id,evidence_ids:arm.evidence,
      nodes:arm.nodes.map(n=>({node_id:n.id,kind:n.kind==='control'?'other':n.kind,name:clean(n.name)||null,
        children:n.children,drug_class:null,dose:clean(n.dose)||null,route:clean(n.route)||null,
        schedule:clean(n.schedule)||null,evidence_ids:arm.evidence}))};
    def=Groups.definitionFromNative(native);
  }
  if(def.role!=='actual_regimen')return null;
  const d=Groups.describeDefinition(def);
  const ids=uniq(d.agent_ids).sort();
  if(!ids.length) {
    const native=nativeCourse(arm);
    if(native&&!native.inactive)return native;
    // Placebo can identify the reference of a randomized effect, never the
    // phase-II regimen of interest. Preserve other named control distinctions.
    if(!d.inactive && def.root?.normalization?.role!=='control')return nativeCourse(arm);
    return {id:d.key,label:d.label,drugs:[],control:true};
  }
  if(d.simple_concurrent && d.known) return {id:ids.join('+'),label:ids.map(id=>labels.get(id)||id).join(' + '),drugs:ids.map(id=>labels.get(id)||id)};
  return nativeCourse(arm);
}
function indexTrialLinks(graph) {
  const links=new Map();
  for(const row of [...graph.study_memberships,...graph.comparisons]) {
    if(!links.has(row.pmid))links.set(row.pmid,{ncts:new Set(),names:new Set(),ids:new Set()});
    const link=links.get(row.pmid);
    for(const id of row.nct_ids||[])link.ncts.add(id);
    if(row.study_id)link.ids.add(row.study_id);
    if(clean(row.study_name))link.names.add(row.study_name);
  }
  return links;
}
function identity(article,records,link,citation) {
  const q=Quant.trialIdentifiers({pmid:article.pmid,details:{quantitative_extraction:records}});
  const reconciled=TrialIds.harmonize({pmid:article.pmid,names:uniq([...(q.names||[]),...(link?.names||[])]).filter(n=>!/^PMID |^Unnamed |^Cohort /i.test(n)),
    nct_ids:uniq([...q.nct_ids,...(link?.ncts||[]),...(citation.registration_ids||[]).filter(n=>typeof n==='string'&&/^NCT\d{8}$/.test(n))])});
  if(reconciled.nct_ids.length>1)return null;
  const nct=reconciled.nct_ids[0]||null;
  const name=reconciled.names.find(n=>!/^NCT\d{8}|^PMID |^Unnamed |^Cohort /i.test(n));
  const internal=link?.ids?.size===1?[...link.ids][0]:null;
  return {id:nct||internal||(name?'name:'+asKey(name):'pmid:'+article.pmid),nct,name:name||nct||
    [article.first_author_surname && article.first_author_surname+' et al.',article.year].filter(Boolean).join(' · ')||'PMID '+article.pmid};
}

function studyPopulation(record,article,armPopulation) {
  const overall=(record.populations||[]).filter(p=>p.scope==='overall'&&p.melanoma_only==='yes'&&
    !/historical control|meta.analysis|external control/i.test(p.label));
  const text=[article.title,armPopulation?.label,...overall.map(p=>p.label)].join(' ').toLowerCase();
  const study=record.study;
  const specific = armPopulation?.label || '';
  let setting=/\bneoadjuvant\b/i.test(specific)?'Neoadjuvant':/\badjuvant\b/i.test(specific)&&!/prior|previous/i.test(specific)?'Adjuvant':stages[study.setting]||'Setting not reported';
  const postPD=/\b(?:anti[- ]?)?pd[- ]?1.{0,25}(?:refractory|resistan|failure|progression)|(?:progress(?:ion|ed|ing)|refractory|resistan\w*) (?:during or after|on|after|to|during).{0,35}(?:anti[- ]?)?pd[- ]?1|(?:pd[- ]?1|checkpoint)[- ](?:experienced|refractory|resistant)/i.test(text);
  const first=study.previous_systemic==='untreated'||/\bfirst[- ]line|(?:previously|systemic treatment)[- ](?:untreated|na[iï]ve)|treatment[- ]na[iï]ve/i.test(text);
  const later=study.previous_systemic==='previously_treated'||/\bpreviously treated\b/i.test(text);
  const line=postPD?'post-PD-1 progression':first?'first-line':later?'previously treated':study.previous_systemic==='mixed'?'mixed treatment lines':'';
  const subtype=clean(study.melanoma_subtype)||(['uveal','mucosal','acral','desmoplastic','cutaneous'].find(x=>text.includes(x))||'');
  const braf=clean(study.braf)||(/braf.{0,15}(?:mutant|mutated)/.test(text)?'mutant':'');
  const features=Object.entries({
    brain:/\b(?:brain|cerebral|intracranial) meta/.test(text), liver:/\b(?:hepatic|liver)[- ](?:only|dominant)|isolated hepatic/.test(text),
    pediatric:/\b(?:pediatric|paediatric|childhood|children)\b/.test(text), elderly:/\b(?:elderly|older adult|aged [78]0)\b/.test(text),
    inTransit:/\bin.transit|isolated limb/.test(text), hla:/hla[- ]?a\*?02/.test(text),
    refractory:/refractory|resistant|rechallenge|progressing (?:on|during)/.test(text)&&!postPD,
    infection:/\b(?:hiv|hepatitis)\b/.test(text),acral:/\bacral\b/.test(text),desmoplastic:/desmoplastic/.test(text),
    unresectable3:/unresectable stage iii(?:\W|$)/.test(text)&&!/stage iv|metastatic/.test(text)
  }).filter(([,v])=>v).map(([k])=>k);
  const stageWords=[...text.matchAll(/\bstages?\s+((?:iii[a-d]?|ii[abc]?|iv)\b(?:(?:\s*[/–-]\s*|\s+(?:or|and|to)\s+)(?:stage\s+)?(?:iii[a-d]?|ii[abc]?|iv)\b)*)/gi)];
  const adjuvantStage=setting==='Adjuvant'?uniq(stageWords.flatMap(m=>m[1].match(/\b(?:iii[a-d]?|ii[abc]?|iv)\b/gi)||[])).sort().join('+'):'';
  return {setting,line,subtype,braf,features,adjuvantStage,label:(armPopulation && clean(armPopulation.label) && !/^(?:all|overall|intent.to.treat|ITT|treated|randomized|enrolled|analysis)(?: (?:population|cohort|patients|participants))?$/i.test(armPopulation.label)?armPopulation.label:null)||overall.find(p=>p.label && !/^(all|overall|treated|enrolled|analysis|intent.to.treat)(?: (?:patients?|population|participants?|cohort|group))?$/i.test(p.label))?.label||null};
}
function samePopulation(a,b) {
  if(!a||!b||!['Advanced','Adjuvant','Neoadjuvant','Perioperative'].includes(a.setting)||a.setting!==b.setting)return false;
  if(a.setting==='Advanced'&&(!a.line||!b.line||a.line!==b.line||a.line==='mixed treatment lines'))return false;
  if(a.setting==='Adjuvant'&&(!a.adjuvantStage||a.adjuvantStage!==b.adjuvantStage))return false;
  if(asKey(a.features.join('|'))!==asKey(b.features.join('|'))||a.features.includes('refractory'))return false;
  // Missing eligibility information cannot confirm compatibility between trials.
  // Require a defined clinical subgroup or identical documented population
  // wording for automatic links; reviewed matches may also be supplied below.
  return a.subtype===b.subtype && a.braf===b.braf &&
    ((a.subtype && a.subtype!=='mixed') || (a.braf && a.braf!=='mixed') ||
      (a.label&&b.label&&asKey(a.label)===asKey(b.label)));
}
function reportedPhases(citation,registry) {
  const own=citation.phases||[];
  const registered=registry?.phases||[];
  if(own.length&&registered.length&&!own.some(n=>registered.includes(n)))return [];
  return uniq([...own,...registered]).filter(p=>p===2||p===3);
}
function populationsForPhase(record,arm,phase,citation,registry) {
  const design=uniq([...(citation.phases||[]),...(registry?.phases||[])]);
  const all=record.populations||[];
  const melanoma=all.filter(p=>p.melanoma_only==='yes'&&!/historical controls?|external controls?|meta.analysis|pooled (?:study|trial|population)/i.test(p.label));
  if(design.length===1)return new Set(melanoma.map(p=>p.id));
  const word=phase===2?'(?:II|2)':'(?:III|3)';
  const mixed=/\bphases?\s*(?:[123]|I{1,3})[ab]?\s*(?:[/–-]|and|or|plus)\s*(?:phase\s*)?(?:[123]|I{1,3})[ab]?\b/i;
  const specific=new RegExp('\\bphase\\s*'+word+'[ab]?\\b','i');
  const named=melanoma.filter(p=>specific.test(p.label)&&!mixed.test(p.label)&&!/recommended phase (?:ii|2) dose|RP2D/i.test(p.label));
  if(named.length) {
    const allowed=new Set(named.map(p=>p.id));
    // Include descendants reading out this particular phase cohort only.
    for(let i=0;i<all.length;i++)for(const p of melanoma)if(allowed.has(p.parent_id))allowed.add(p.id);
    return allowed;
  }
  if(specific.test(arm.label)&&!mixed.test(arm.label)&&!/recommended phase (?:ii|2) dose|rp2d/i.test(arm.label))return new Set(melanoma.filter(p=>p.id===arm.population_id).map(p=>p.id));
  // A paper explicitly dedicated to a single phase can report the phase cohort
  // of a multi-phase registration. Never apply this for a paper indexed as
  // both phases or when the populations themselves expose a combined analysis.
  if(citation.title_phases?.length===1&&citation.title_phases[0]===phase&&citation.phases?.length===1&&
      !melanoma.some(p=>mixed.test(p.label)))return new Set(melanoma.map(p=>p.id));
  return new Set();
}
function inferStatus(registry,phase) {
  const labels={COMPLETED:'Completed',ACTIVE_NOT_RECRUITING:'Active, not recruiting',RECRUITING:'Recruiting',TERMINATED:'Terminated',SUSPENDED:'Suspended',NOT_YET_RECRUITING:'Not yet recruiting',ENROLLING_BY_INVITATION:'Enrolling by invitation',UNKNOWN:'Registry status unknown'};
  return labels[registry?.status]||('Phase '+(phase===2?'II':'III')+' results published');
}
function eligiblePhase2(citation,registry,separate) {
  if(citation.role!=='primary')return false;
  if(registry?.study_type && registry.study_type!=='INTERVENTIONAL')return false;
  // For unregistered historical studies, the completed primary cohort is
  // established by a published primary analysis with actual patient results.
  if(!registry?.status||registry.status==='COMPLETED'||(registry.status==='UNKNOWN'&&citation.primary_readout))return true;
  if(['WITHDRAWN','SUSPENDED'].includes(registry.status))return false;
  return (separate||registry.status==='ACTIVE_NOT_RECRUITING') && registry.primary_completion?.type==='ACTUAL';
}
function keyFor(regimen,setting) { return asKey(regimen)+'|'+asKey(setting); }

// A year or month is an interval. Two overlapping intervals cannot establish
// that one study or publication was later than the other.
function dateBounds(value) {
  const parts=/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value||'');
  if(!parts)return null;
  const year=Number(parts[1]),month=Number(parts[2]||1),day=Number(parts[3]||1);
  const first=Date.UTC(year,month-1,day);
  if(month<1||month>12||day<1||new Date(first).getUTCDate()!==day)return null;
  const last=parts[3]?first:Date.UTC(year,parts[2]?month:12,0);
  return {first,last};
}
function registeredStart(registration) {
  const start=registration?.start;
  if(start?.type==='ACTUAL')return dateBounds(start.date);
  // Older registrations can omit the date type even after enrolment.
  if(start?.date&&!start.type&&['RECRUITING','ACTIVE_NOT_RECRUITING','COMPLETED','TERMINATED','SUSPENDED','ENROLLING_BY_INVITATION'].includes(registration.status))
    return dateBounds(start.date);
  return null;
}
function chronologicallyLater(two,three,registry) {
  const pub2=dateBounds(two.primary_date),pub3=dateBounds(three.primary_date);
  if(pub3)return !!pub2&&pub3.first>pub2.last;
  if(three.primary_date||three.primary_pmid||three.primary_results_pmid||three.primary_url)return false;
  const start3=registeredStart(registry[three.nct]);
  const phase2Boundary=registeredStart(registry[two.nct])||pub2;
  return !!start3&&!!phase2Boundary&&start3.first>phase2Boundary.last;
}
// Independent cohorts explicitly named in a trial carry distinct results and sort dates.
function cohortToken(title,label) {
  const marker=/\bcohort[ -]+([a-e](?:[1-9])?|[1-9])\b/i;
  return (String(title||'').match(marker)||String(label||'').match(marker)||[])[1]?.toLowerCase()||'';
}
function cohortBuckets(rows) {
  const byTrial=new Map();
  const add=(map,key,row)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(row);};
  for(const r of rows)add(byTrial,JSON.stringify([r.phase,r.identity.id]),r);
  const result=new Map();
  for(const trial of byTrial.values()){
    const paperRows=new Map();
    for(const r of trial)add(paperRows,r.pub.pmid,r);
    for(const rows of paperRows.values()){
      const known=uniq(rows.map(r=>r.profile.setting).filter(s=>s!=='Setting not reported'));
      if(known.length===1)for(const r of rows)if(r.profile.setting==='Setting not reported')r.profile={...r.profile,setting:known[0]};
      for(const abstract of rows.filter(r=>r.stage==='R2')){
        const matches=rows.filter(r=>r.stage==='R3'&&r.regimen.id===abstract.regimen.id&&r.cohort===abstract.cohort);
        const settings=uniq(matches.map(r=>r.profile.setting).filter(s=>s!=='Setting not reported'));
        if(settings.length===1)abstract.profile={...abstract.profile,setting:settings[0]};
      }
      // A single source-arm trial has exactly one assigned regimen: use the
      // more complete full-text arm definition for abstract-only abbreviations.
      const full=rows.filter(r=>r.stage==='R3'),abstract=rows.filter(r=>r.stage==='R2');
      if(full.length&&abstract.length&&rows.every(r=>r.single)&&uniq(full.map(r=>r.regimen.id)).length===1)
        for(const r of abstract)r.regimen=full[0].regimen;
    }
    const byPaper=new Map();
    for(const r of trial)add(byPaper,JSON.stringify([r.pub.pmid,r.regimen.drugs.join('|'),r.profile.setting,r.cohort]),r);
    const retained=[];
    for(const paper of byPaper.values()){
      // When abstract and full text give different schedules for the same set
      // of active drugs, use the single identifiable full-text course. Preserve
      // trials that really randomised to different sequences of the same agents.
      const full=uniq(paper.filter(r=>r.stage==='R3').map(r=>r.regimen.id));
      const abstracts=uniq(paper.filter(r=>r.stage==='R2').map(r=>r.regimen.id));
      const canonical=full.length===1&&abstracts.length===1?paper.find(r=>r.stage==='R3').regimen:null;
      for(const r of paper)retained.push(canonical?{...r,regimen:canonical}:r);
    }
    const seeds=retained.filter(r=>r.role==='primary');
    for(const r of retained) {
      let current=r;
      if(r.role!=='primary'){
        const candidates=seeds.filter(s=>s.regimen.drugs.join('|')===r.regimen.drugs.join('|')&&
          (s.profile.setting===r.profile.setting||r.profile.setting==='Setting not reported')&&(!r.cohort||s.cohort===r.cohort));
        const identities=uniq(candidates.map(s=>JSON.stringify([s.regimen.id,s.profile.setting,s.cohort])));
        if(identities.length===1){const seed=candidates[0];current={...r,regimen:seed.regimen,cohort:seed.cohort,profile:{...r.profile,setting:seed.profile.setting}};}
        else if(!candidates.some(s=>s.regimen.id===r.regimen.id&&s.cohort===r.cohort&&s.profile.setting===r.profile.setting))continue;
      }
      const key=JSON.stringify([current.phase,current.identity.id,current.regimen.id,current.profile.setting,current.cohort]);
      add(result,key,current);
    }
  }
  return result;
}
function bundle(rows,phase) {
  const primary=rows.filter(r=>phase===2?r.phase2Eligible:r.role==='primary');
  if(!primary.length)return null;
  // Prefer the earliest dated primary report. Follow-up never supplies an
  // invented first-publication date.
  primary.sort((a,b)=>(a.pub.date||'9999').localeCompare(b.pub.date||'9999')||a.pub.pmid.localeCompare(b.pub.pmid));
  const first=primary[0];
  const outcomes=new Map(),pubs=new Map();
  for(const row of rows.slice().sort((a,b)=>(a.pub.date||'').localeCompare(b.pub.date||'')||a.stage.localeCompare(b.stage))){
    pubs.set(row.pub.pmid,row.pub);
    for(const o of row.outcomes)outcomes.set(o.key,o);
  }
  const samePaper=primary.filter(r=>r.pub.pmid===first.pub.pmid);
  const best=samePaper.filter(r=>r.stage==='R3').sort((a,b)=>Number(b.overall)-Number(a.overall)||b.outcomes.length-a.outcomes.length)[0]||first;
  return {...first.identity,id:first.identity.id+(first.cohort?':'+first.cohort.toUpperCase():''),primary_date:first.pub.date,primary_pmid:first.pub.pmid,regimen:best.regimen.label,setting:best.profile.setting,
    population:best.profile.label||[best.profile.line,best.profile.subtype].filter(Boolean).join(' · ')||null,
    comparator:uniq(rows.flatMap(r=>r.comparators)).join(' / ')||null,status:inferStatus(first.registry,phase),
    status_as_of:first.registry?.status_date||first.pub.date,registry_url:first.identity.nct?'https://clinicaltrials.gov/study/'+first.identity.nct:null,
    publications:[...pubs.values()].sort((a,b)=>newest(a.date,b.date)),outcomes:[...outcomes.values()],
    _profile:best.profile,_drugs:best.regimen.drugs,match_ids:[]};
}
function build(snapshot,graph,normalizations,citations,registry,verified,audit,reviewedLinks=[]) {
  const retained=new Map(snapshot.clinical_evidence.articles.filter(a=>a.current_screening_status==='retain'&&a.current_main_eligible&&!a.publication_hold).map(a=>[a.pmid,a]));
  const definitions=indexArms(normalizations),links=indexTrialLinks(graph),labels=new Map(graph.nodes.filter(n=>n.type==='drug').map(n=>[n.components[0],n.label]));
  const allRows=[];
  const seen=(id,flag)=>{if(!audit)return;if(!audit.reports.has(id))audit.reports.set(id,new Set());audit.reports.get(id).add(flag);};
  for(const wrappers of snapshot.articles){
    const article=retained.get(wrappers.pmid),citation=citations[wrappers.pmid];
    if(!article||!citation||citation.role==='ineligible')continue;
    if(citation.role==='primary'&&citation.phases.includes(2))seen(article.pmid,'indexed-primary');
    const id=identity(article,wrappers.records,links.get(article.pmid),citation);
    if(!id){seen(article.pmid,'multiple-registrations');continue;}
    const reg=registry[id.nct], phases=reportedPhases(citation,reg);
    if(!phases.length)continue;
    if(citation.role==='primary'&&phases.includes(2))seen(article.pmid,'phase-II-primary');
    const semantics=indexOutcomeSemantics(article,wrappers.records,snapshot.clinical_evidence.evidence_registry);
    for(const wrapper of wrappers.records) {
      if(!wrapper.record||wrapper.record.decision?.status!=='retain')continue;
      const record=Quant.effectiveRecord(wrapper);
      if(record.study?.study_type==='observational')continue;
      const armKeys=new Map();
      for(const arm of record.arms) {
        const d=regimenFor(arm,record,definitions,labels);
        if(d)armKeys.set(arm.id,d);
      }
      if(![...armKeys.values()].some(d=>!d.control))seen(article.pmid,'incomplete-regimen');
      for(const [armId,regimen] of armKeys){
        if(regimen.control)continue;
        for(const phase of phases) {
          if(phase===2&&citation.role==='interim')continue;
          const arm=record.arms.find(a=>a.id===armId);
          const populations=populationsForPhase(record,arm,phase,citation,reg);
          if(!populations.size){seen(article.pmid,'no-separate-melanoma-cohort');continue;}
          const scoped=record.populations.filter(p=>populations.has(p.id));
          const attached=scoped.find(p=>p.id===arm.population_id);
          let baseline=attached||scoped[0];
          if(attached?.scope==='subgroup' && !/part (?:i+|[123])|phase (?:i+|[123])|(?:^| )cohort [a-z0-9]\b/i.test(attached.label)){
            baseline=scoped.find(p=>p.id===attached.parent_id)||attached;
          }
          const multistage=uniq([...(citation.phases||[]),...(reg?.phases||[])]).length>1;
          if(multistage&&!scoped.includes(baseline))baseline=attached||scoped[0];
          const profile=studyPopulation(record,article,baseline);
          const cohort=cohortToken(article.title,baseline?.label);
          const outcomes=extractOutcomes(record,{armId,armKeys,pmid:article.pmid,populationIds:populations,semantics});
          const ownArm=populations.has(arm.population_id)||
            record.sample_sizes.some(n=>n.arm_id===armId&&populations.has(n.population_id));
          if(!outcomes.length && !ownArm)continue;
          if(multistage && !outcomes.length && !(citation.phases?.length===1&&citation.title_phases?.length===1&&citation.title_phases[0]===phase))continue;
          const comparators=uniq(outcomes.map(o=>o.comparator?.label||o.comparator).filter(o=>typeof o==='string'));
          if(record.study.randomized==='yes'&&!comparators.length)for(const [other,desc] of armKeys)if(other!==armId&&desc.id!==regimen.id)comparators.push(desc.label);
          const separate=uniq([...(citation.phases||[]),...(reg?.phases||[])]).length>1;
          const row={phase,cohort,overall:baseline?.scope==='overall',single:record.study.comparison_structure==='single_group'&&record.arms.length===1,role:citation.role,phase2Eligible:eligiblePhase2(citation,reg,separate),identity:id,
            registry:reg,regimen,profile,pub:publication(article,citation),stage:record.stage,outcomes,comparators};
          if(phase===2 && citation.role==='primary')seen(article.pmid,row.phase2Eligible?'eligible-cohort':'completion-unconfirmed');
          allRows.push(row);
        }
      }
    }
  }
  const datasets=cohortBuckets(allRows);
  const groups=new Map(),third=new Map();
  for(const rows of datasets.values()){
    const phase=rows[0].phase,trial=bundle(rows,phase);
    if(!trial)continue;
    const key=keyFor(trial.regimen,trial.setting);
    if(phase===3){if(!third.has(key))third.set(key,[]);third.get(key).push(trial);continue;}
    if(!groups.has(key))groups.set(key,{id:key,regimen:trial.regimen,drugs:trial._drugs,setting:trial.setting,phase2:[],phase3:[]});
    groups.get(key).phase2.push(trial);
  }
  for(const [key,group] of groups){
    for(const two of group.phase2)for(const three of third.get(key)||[]){
      const supporting=reviewedLinks.find(l=>l.phase2_pmid&&l.phase3_pmid&&l.regimen===group.regimen&&two.publications.some(p=>p.pmid===l.phase2_pmid)&&three.publications.some(p=>p.pmid===l.phase3_pmid));
      if(two.id===three.id||(!supporting&&!samePopulation(two._profile,three._profile)))continue;
      if(supporting)three.population=supporting.population;
      two.match_ids.push(three.id);
      if(!group.phase3.includes(three))group.phase3.push(three);
    }
  }
  if(audit)audit.candidates={groups:[...groups],third:[...third]};
  applyVerified(groups,verified);
  for(const group of groups.values()){
    // Source reviews and automatic matching both propose candidates. Apply
    // chronology to each phase II cohort before publishing any link or status.
    const candidates=new Map(group.phase3.map(t=>[t.id,t]));
    for(const trial of candidates.values()){
      // A source review can identify the first primary paper even when its
      // automatic citation classification missed a co-primary endpoint.
      const reviewed=verified.phase3_primary_result_pmids?.[trial.id];
      const primary=trial.publications.find(pub=>reviewed ? pub.pmid===reviewed :
        pub.pmid===trial.primary_pmid && citations[pub.pmid]?.role==='primary' && citations[pub.pmid].primary_readout);
      if(reviewed&&!primary)throw new Error('Missing reviewed primary results publication for '+trial.id);
      if(primary){
        if(primary.pmid!==trial.primary_pmid || primary.date)trial.primary_date=primary.date||null;
        trial.primary_pmid=trial.primary_results_pmid=primary.pmid;
      }
    }
    const linked=new Set();
    for(const two of group.phase2){
      two.match_ids=two.match_ids.filter(id=>{
        const three=candidates.get(id);
        if(!three)throw new Error('Missing phase III match '+id+' for '+two.id);
        return chronologicallyLater(two,three,registry);
      });
      for(const id of two.match_ids)linked.add(id);
    }
    group.phase3=group.phase3.filter(t=>linked.has(t.id));
    annotateMatches(group,reviewedLinks);
    for(const trial of group.phase3){
      const registration=registry[trial.nct];
      if(registration?.status){
        trial.registry_status=registration.status;
        if(registration.status_date)trial.registry_status_as_of=registration.status_date;
      }
    }
    group.phase2.sort(trialOrder);group.phase3.sort(trialOrder);group.sort_date=group.phase2[0]?.primary_date||null;
    for(const t of [...group.phase2,...group.phase3]){
      delete t._profile;delete t._drugs;
      for(const o of t.outcomes) if(/^[^|]+\|(?:HR|RR|OR)\|/.test(o.key) &&
        (!o.comparison?.treatment || !o.comparison?.reference || !o.outcomeLabel)) {
        throw new Error('Missing treatment or reference for '+t.name+' '+o.key);
      }
    }
  }
  return {schema_version:1,source_file_sha256:graph.metadata.source_file_sha256,as_of:verified.reviewed_on||verified.as_of||snapshot.as_of?.slice(0,10),
    groups:[...groups.values()].sort((a,b)=>newest(a.sort_date,b.sort_date)||a.regimen.localeCompare(b.regimen)||a.setting.localeCompare(b.setting))};
}
// Apply source reviews only to verified pairs, after final arm/cohort matching.
// Display comparator labels are separate from the estimands of each outcome.
function annotateMatches(group,reviewedLinks) {
  const phase3=new Map(group.phase3.map(t=>[t.id,t]));
  for(const two of group.phase2){
    if(!two.match_ids.length)continue;
    two.match_basis={};
    for(const id of two.match_ids){
      const three=phase3.get(id);
      if(!three)throw new Error('Missing phase III match '+id+' for '+two.id);
      const review=reviewedLinks.find(l=>l.regimen===group.regimen&&l.phase2_id===two.id&&l.phase3_id===id);
      two.match_basis[id]={
        label:review?.label||'Same regimen in a clinically comparable melanoma population.',
        source_url:review?.source_url||three.primary_url||three.publications?.find(p=>three.primary_pmid&&p.pmid===three.primary_pmid)?.url||three.registry_url||null
      };
      if(review?.phase2_comparator)two.comparator=review.phase2_comparator;
      if(review?.phase3_comparator)three.comparator=review.phase3_comparator;
      for(const [trial,reviewed] of [[two,review?.phase2_outcomes],[three,review?.phase3_outcomes]]){
        if(!reviewed?.length)continue;
        const outcomes=new Map(trial.outcomes.map(o=>[o.key,o]));
        for(const outcome of reviewed)outcomes.set(outcome.key,outcome);
        trial.outcomes=[...outcomes.values()];
      }
    }
  }
}
function applyVerified(groups,verified) {
  // Published arm/cohort reviews disambiguate registry aliases, maintenance
  // courses, and shared reports containing two phase-II cohorts. A shared NCT
  // alone never moves different arms or assigns an aggregate to both cohorts.
  const overrides=(verified.groups||[]).flatMap(group=>(group.phase2||[]).map(trial=>({group,trial})));
  const signature=drugs=>uniq(drugs.filter(d=>asKey(d)!=='surgery').map(d=>asKey(d).replace(/\s*\([^)]*\)\s*/g,''))).sort().join('|');
  for(const [key,oldGroup] of groups){
    oldGroup.phase2=oldGroup.phase2.filter(old=>{
      const oldPublications=new Set(old.publications.map(p=>p.pmid).filter(Boolean));
      const covered=overrides.filter(({group,trial})=>
        signature(oldGroup.drugs)===signature(group.drugs)&&group.setting===oldGroup.setting&&
        trial.publications.some(p=>p.pmid&&oldPublications.has(p.pmid))&&
        (!old.nct || !trial.nct || old.nct===trial.nct));
      if(!covered.length)return true;
      // Allow the ordinary merge only when the complete regimen and the exact
      // cohort ID agree. Targeted reviews otherwise replace the ambiguous row.
      return covered.length===1&&covered[0].trial.id===old.id&&keyFor(oldGroup.regimen,oldGroup.setting)===keyFor(covered[0].group.regimen,covered[0].group.setting);
    });
    if(!oldGroup.phase2.length)groups.delete(key);
  }
  for(const source of verified.groups||[]){
    const normalized=asKey(source.regimen).split(/\s*\+\s*/).sort().join('+');
    const match=[...groups.values()].find(g=>asKey(g.regimen).split(/\s*\+\s*/).sort().join('+')===normalized&&asKey(g.setting)===asKey(source.setting));
    const group=match||{id:source.id||keyFor(source.regimen,source.setting),regimen:source.regimen,drugs:source.drugs,setting:source.setting,phase2:[],phase3:[]};
    if(!match)groups.set(group.id,group);
    for(const stage of ['phase2','phase3'])for(const entry of source[stage]||[]){
      const reviewed={...entry,status_as_of:entry.status_as_of||verified.reviewed_on||null};
      const prior=group[stage].find(t=>t.id===reviewed.id);
      if(!prior){group[stage].push({...reviewed});continue;}
      // Reviewed arm/population-specific values take precedence. Complement
      // with distinct accepted observations; keep every supporting publication.
      const scoped=reviewed.id!==reviewed.nct&&!!reviewed.nct;
      const merged=new Map((scoped?[]:prior.outcomes).map(o=>[o.key,o]));
      for(const o of reviewed.outcomes||[])merged.set(o.key,o);
      const pubs=new Map(prior.publications.map(p=>[p.pmid||p.url,p]));
      for(const p of reviewed.publications||[])pubs.set(p.pmid||p.url,p);
      Object.assign(prior,reviewed,{outcomes:[...merged.values()],publications:[...pubs.values()]});
    }
    // Explicitly reviewed phase-II link lists take precedence over auto-links.
    const eligible=new Set(group.phase2.flatMap(t=>t.match_ids||[]));
    group.phase3=group.phase3.filter(t=>eligible.has(t.id));
  }
}
function registrationList(snapshot,graph,citations,verified) {
  const ids=new Set();
  const add=id=>typeof id==='string'&&/^NCT\d{8}$/.test(id)&&ids.add(id);
  const retained=new Set(snapshot.clinical_evidence.articles.filter(a=>a.current_main_eligible&&!a.publication_hold&&a.current_screening_status==='retain').map(a=>a.pmid));
  for(const row of [...graph.study_memberships,...graph.comparisons])for(const id of row.nct_ids||[])add(id);
  for(const a of snapshot.articles.filter(a=>retained.has(a.pmid)))Quant.trialIdentifiers({pmid:a.pmid,details:{quantitative_extraction:a.records}}).nct_ids.forEach(add);
  for(const c of Object.values(citations))if(c.phases.some(p=>p===2||p===3)&&c.role!=='ineligible')c.registration_ids.forEach(add);
  for(const group of verified.groups||[])for(const trial of [...(group.phase2||[]),...(group.phase3||[])])add(trial.nct);
  return [...ids].sort();
}
module.exports={build,bundle,samePopulation,populationsForPhase,eligiblePhase2,trialOrder,applyVerified,annotateMatches,chronologicallyLater};
if(require.main===module) {
  const root=path.resolve(process.argv[2]||path.join(__dirname,'../..'));
  const data=n=>read(root,'website/dist/data/'+n+'.json');
  const config=n=>read(root,'website/config/phase_comparison_'+n+'.json');
  const verified=read(root,'config/phase_comparison_sources.json');
  const snapshot=data('quantitative_extraction'),graph=data('treatment_map');
  if(process.argv.includes('--registrations')){console.log(JSON.stringify(registrationList(snapshot,graph,config('citations'),verified)));process.exit(0);}
  const version=data('treatment_map_version');
  if(graph.metadata.source_file_sha256!==version.source_file_sha256||graph.metadata.clinical_content_sha256!==snapshot.clinical_evidence.content_sha256)throw new Error('Mismatched evidence releases');
  const out=build(snapshot,graph,data('treatment_normalizations'),config('citations'),config('registry'),verified,null,config('links'));
  const file=path.join(root,'website/dist/data/phase_comparison.json'),tmp=file+'.tmp-'+process.pid;
  fs.writeFileSync(tmp,JSON.stringify(out)+'\n');fs.renameSync(tmp,file);
  console.log(out.groups.length+' groups; '+out.groups.reduce((n,g)=>n+g.phase2.length,0)+' phase II trial arms');
}
