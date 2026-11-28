'use strict';

// Materialize arm-level outcomes from the same retained, source-bound records as Studies.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const Quant = require('../dist/quantitative_extraction.js');
const Groups = require('../dist/treatment_groups.js');
const TrialIds = require('../dist/trial_identifiers.js');
const MapView = require('../dist/treatment_map.js');
const Scope = require('../dist/melanoma_scope.js');
const {date: calendarDate} = require('./treatment_map_evidence.cjs');
const {measure} = require('./trial_outcome_measures.cjs');
const {attachPhaseLinks} = require('./trial_outcome_links.cjs');

const clean = value => typeof value === 'string' && !/^(?:NA|N\/A|null|unknown|not reported)$/i.test(value.trim()) ? value.trim() : '';
const norm = value => clean(value).normalize('NFKC').toLowerCase().replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ').trim();
const unique = values => [...new Set(values.filter(Boolean))];
const byId = rows => new Map(rows.map(row => [row.id,row]));
const partKey = (...parts) => JSON.stringify(parts);
function add(index,key,value) {
  if (!index.has(key)) index.set(key,[]);
  index.get(key).push(value);
}
function single(rows) { const values = unique(rows); return values.length === 1 ? values[0] : null; }

function memberships(graph) {
  const bindings = new Map();
  for (const membership of graph.study_memberships || []) {
    for (const binding of membership.source_bindings || []) {
      for (const armId of binding.arm_ids || []) {
        add(bindings,partKey(membership.pmid,binding.stage,binding.source_input_sha256,armId),{membership,binding});
      }
    }
  }
  return bindings;
}

function alternateRegistration(records) {
  const ids = [];
  for (const {record} of records) {
    if (record?.decision?.status !== 'retain' || !record.study?.evidence?.length) continue;
    for (const entry of record.study.identifiers || []) {
      let id = clean(entry.id).replace(/\s+/g,'');
      const registry = clean(entry.registry);
      if (/^ISRCTN$/i.test(registry) && /^\d{8}$/.test(id)) id = 'ISRCTN'+id;
      if (/^(?:CTR\d{8}|ChiCTR[A-Z-]*\d{8,}|ISRCTN\d{8}|UMIN\d{9}|ACTRN\d{14}|DRKS\d{8}|jRCT[a-z]?\d+|JapicCTI-?\d+|NTR\d+)$/i.test(id)) ids.push(id.toUpperCase());
      else if (/eudract/i.test(registry) && /^\d{4}-\d{6}-\d{2}$/.test(id)) ids.push('EudraCT '+id);
      else if (/^(?:SWOG|EORTC|ECOG(?:-ACRIN)?)$/i.test(registry) && /^[A-Z]?\d{4,5}[A-Z]?$/i.test(id)) ids.push(registry.toUpperCase()+' '+id.toUpperCase());
    }
  }
  return single(ids);
}
function identity(article, reportId, bound) {
  // Never reassign a held aggregate or a genuinely mixed trial to the first NCT it mentions.
  if (bound.some(m => !m.study_id || m.study_id.startsWith('aggregate:') || m.independent_cohort_count_eligible === false)) return null;
  const studyId = single(bound.map(m => m.study_id));
  if (bound.length && !studyId) return null;
  const nct = single(bound.flatMap(m => m.nct_ids || [])) || single(reportId.nct_ids);
  const label = value => clean(value) && !/^(?:PMID\s|Cohort (?:reported|in PMID)|Unnamed |NCT\d{8}$)/i.test(value);
  const name = unique([...bound.map(m => m.study_name), ...reportId.names]).find(label);
  if (!bound.length && (reportId.nct_ids.length > 1 || reportId.status === 'conflicting' || reportId.independent_cohort_keys?.length > 1)) return null;
  const internal = !studyId || studyId === 'cohort:report:'+article.pmid;
  const registration = reportId.alternateRegistration;
  let id = studyId;
  if (internal && nct) id = 'nct:'+nct;
  else if (internal && registration) id = 'registration:'+norm(registration);
  if (!id) id = name && reportId.names.length === 1 ? 'trial:' + norm(name) : 'cohort:report:' + article.pmid;
  return {trialId:id,trialName:name || nct || registration || 'PMID ' + article.pmid,nct};
}

function agentClasses(ids) {
  return unique(ids).map(id => {
    if (id === 'controls') return {color:id,label:'Controls'};
    const info = MapView.categoryInfo({broad_category:id});
    return {color:info.class_id,label:info.label};
  });
}

// Normalize each leaf, preserving the graph operators rather than interpreting a
// slash or drug listing as an unordered combination. Include maintenance phases.
function course(arm, graphNodes, canonical) {
  if (!arm?.evidence?.length || !arm.nodes?.length) return null;
  const nodes = byId(arm.nodes);
  function walk(id) {
    const node = nodes.get(id);
    if (!node) return null;
    if (node.children?.length) {
      let children = node.children.map(walk);
      if (children.some(c => !c) || !['AND','SEQUENTIAL','OR'].includes(node.kind)) return null;
      if (node.kind === 'AND') {
        const active = children.filter(c => !(c.control && c.placebo));
        if (active.length) children = active;
      }
      if (node.kind !== 'SEQUENTIAL') children = [...new Map(children.map(c => [c.key,c])).values()].sort((a,b) => a.key.localeCompare(b.key));
      if (children.length === 1) return children[0];
      const separator = {AND:' + ',OR:' or ',SEQUENTIAL:' → '}[node.kind];
      return {key:node.kind + '(' + children.map(c => c.key).join('|') + ')',
        label:children.map(c => c.op && c.op !== node.kind && c.op !== 'AND' ? '('+c.label+')' : c.label).join(separator),
        op:node.kind, classes:children.flatMap(c => c.classes)};
    }
    const name = clean(node.name);
    if (!name || /^(?:not specified|unspecified|study arm|arm [ab12]|treatment arm)$/i.test(name)) return null;
    const desc = Groups.describe(name);
    const agent = graphNodes.get('agent:' + desc.agent_id);
    const classes = unique([desc.resolution?.broad_category,agent?.broad_category,...(desc.components||[]).map(c => c.resolution?.broad_category)]);
    if (!classes.length) {
      for (const id of Groups.memberships(desc)) {
        if (id === 'controls' || MapView.categoryInfo({broad_category:id}).class_id !== 'other') classes.push(id);
      }
    }
    const control = desc.resolution?.role === 'control';
    return {key:desc.key,label:desc.label||name,classes:classes.length ? classes : ['other'],control,placebo:control && /placebo/i.test(name)};
  }
  const result = walk(arm.root_id);
  if (!result) return null;
  if (canonical) {
    const exact = graphNodes.get(canonical.node_id);
    // Memberships of a concurrent induction regimen can include its own
    // maintenance phase. Preserve the full reported course in the arm label.
    if (!result.op || result.op === 'AND') {
      result.label = canonical.label;
      const palette = exact && canonical.components.map(component => graphNodes.get('agent:' + component)?.broad_category).filter(Boolean);
      if (palette?.length) result.classes = palette;
    }
    // A map identity for a combination or a drug must never absorb a different
    // direction of sequential treatment, or a choice of alternative drugs.
    if (!result.op || result.op === 'AND') result.key = canonical.node_id;
    else if (result.op === 'SEQUENTIAL' && canonical.components?.length > 1) {
      const phases = result.label.split(' → ').map(s => Groups.describe(s));
      const first = new Set(phases[0].agent_ids);
      if (canonical.components.every(id => first.has(id)) && phases.slice(1).every(p => p.agent_ids.length && p.agent_ids.every(id => first.has(id)))) {
        result.key = canonical.node_id;
      }
    }
  }
  if (!result.classes.length) result.classes = ['other'];
  return result;
}
function populationFor(pop, record, membership, trial={}) {
  const label = clean(pop?.label);
  if (!pop || pop.melanoma_only === 'no' || /(?:historical|external|synthetic) (?:control|comparator|cohort)|pooled across (?:trials|studies)/i.test(label)) return null;
  if (/^(?:(?:treated )?patients?|participants?|subjects?|cases?)?\s*(?:were |who were )?excluded (?:from|because)|^(?:screen(?:ing)? failures?|ineligible patients?)\b/i.test(label)) return null;
  const shared = membership?.cohort;
  const parent = byId(record.populations);
  const ancestry = [], seen = new Set();
  for (let p = pop; p && !seen.has(p.id); p = parent.get(p.parent_id)) {
    ancestry.push(p);
    seen.add(p.id);
  }
  function cohortToken(p) {
    const label = Quant.cohortLabel(p);
    const explicit = label.match(/\bcohort\s+([a-z0-9]\d*[a-z]?)\b|\bdose[- ](?:expansion|escalation) cohort/i);
    if (explicit) return norm(explicit[0]);
    // A phase label distinguishes arms/cohorts in a multiphase report. A
    // blanket reference to the phase of a single trial is not a new cohort.
    const phase = label.match(/\bphase\s+(?:I{1,3}[ab]?|IV|[1-4][ab]?)\b/i);
    return phase && /^(?:phase\b)|\bphase\s+(?:I{1,3}[ab]?|IV|[1-4][ab]?)\s+(?:cohort|expansion|escalation)/i.test(label) ? norm(phase[0]) : '';
  }
  const recruitment = ancestry.find(p => cohortToken(p));
  const clinicalCohort = recruitment ? Quant.cohortLabel(recruitment) : '';
  const roots = record.populations.filter(p => p.scope === 'overall' && p.melanoma_only !== 'no' && !parent.has(p.parent_id));
  const root = ancestry.at(-1);
  const reportsNamedTrial = [trial.trialName,trial.nct].some(id => clean(id) && norm(root?.label).includes(norm(id)));
  const multipleRoots = !reportsNamedTrial && !shared && roots.length > 1 && roots.includes(root);
  const separate = recruitment ? cohortToken(recruitment) : multipleRoots ? norm(root.label) : '';
  const parentKey = shared?.independently_recruited ? shared.root_id : separate ? 'cohort:'+separate : 'overall';
  const analysisSet = /^(?:(?:all|overall|total|the)\s+)?(?:safety(?: analysis| evaluable)?|response[- ]evaluable|efficacy[- ]evaluable|evaluable|intention[- ]to[- ]treat|intent[- ]to[- ]treat|ITT|treated|randomi[sz]ed)(?:\s+(?:population|cohort|set|patients?|participants?|subjects?))?$/i.test(label);
  const distinct = !analysisSet && recruitment !== pop && (pop.scope === 'subgroup' || shared?.is_subgroup);
  if (distinct) {
    const cohort = Quant.cohortLabel(pop) || label;
    return {key:parentKey+'|subset:'+norm(cohort),parentKey,label:cohort,subgroup:true};
  }
  const groupLabel = clinicalCohort || (shared?.independently_recruited ? Quant.cohortLabel(shared.label||label) : multipleRoots ? Quant.cohortLabel(root) : '');
  return {key:parentKey,parentKey,label:groupLabel,subgroup:false};
}
function trueTrial(record,citation,article) {
  if (record.study?.study_type === 'observational' || /\b(?:systematic review|meta.analysis|indirect comparison|historical control analysis|retrospective (?:study|cohort)|real.world (?:study|cohort))\b/i.test(article.title)) return false;
  if (citation.role === 'ineligible' && !citation.phases?.length) return false;
  return record.study?.study_type === 'interventional_trial' || record.study?.randomized === 'yes' ||
    (citation?.phases?.length > 0 && citation.role !== 'ineligible');
}
// Biomarker follow-ups sometimes abbreviate a trial arm by leaving out a
// maintenance monotherapy after induction. A unique, fully reported course
// can identify that subgroup's parent without equating different sequences.
function matchParentCourses(rows) {
  const courseCache = new Map();
  function phases(text) {
    if (!courseCache.has(text)) {
      const result = text.split(' → ').map(phase => {
        const d = Groups.describe(phase);
        return ['agent','combination'].includes(d.kind) && d.agent_ids.length ? unique(d.agent_ids).sort() : null;
      });
      courseCache.set(text,result.every(Boolean) ? result : null);
    }
    return courseCache.get(text);
  }
  function matches(short,full) {
    if (!(short?.length > 1 && full?.length > short.length)) return false;
    let j = 0;
    for (let i = 0; i < full.length; i++) {
      if (j < short.length && partKey(...short[j]) === partKey(...full[i])) { j++; continue; }
      const before = full[i-1];
      if (!before || before.length <= full[i].length || !full[i].every(id => before.includes(id))) return false;
    }
    return j === short.length;
  }
  const parents = new Map();
  for (const r of rows) if (!r.subgroup && r.regimen.includes(' → ')) {
    const root = JSON.parse(r.parentArmId)[1];
    const k = partKey(r.trialId,root);
    if (!parents.has(k)) parents.set(k,new Map());
    parents.get(k).set(r.parentArmId,r);
  }
  for (const r of rows) {
    if (!r.subgroup || !r.regimen.includes(' → ')) continue;
    const [ ,root] = JSON.parse(r.parentArmId);
    const candidates = parents.get(partKey(r.trialId,root));
    if (!candidates || candidates.has(r.parentArmId)) continue;
    const parent = [...candidates.values()].filter(p => matches(phases(r.regimen),phases(p.regimen)));
    if (parent.length === 1) {
      r.parentArmId = parent[0].parentArmId;
      r.armId = partKey(JSON.parse(r.parentArmId)[0],JSON.parse(r.armId)[1]);
    }
  }
}
function preferredRows(rows) {
  const groups = new Map();
  for (const row of rows) add(groups,partKey(row.trialId,row.armId,row.endpoint,row.attribution),row);
  const recent = (a,b) => (b.date||'').localeCompare(a.date||'') || b.stage.localeCompare(a.stage) ||
    Number(Boolean(b.ci))-Number(Boolean(a.ci)) || a.source.id.localeCompare(b.source.id);
  const ordered = [];
  for (const candidates of groups.values()) {
    // Known cutoffs order their own updates. A report without a cutoff
    // competes by publication date against the best remaining dated update.
    const dated = candidates.filter(r => r.cutoff).sort((a,b) => b.cutoff.localeCompare(a.cutoff) || recent(a,b));
    const undated = candidates.filter(r => !r.cutoff).sort(recent);
    let i = 0, j = 0;
    while (i < dated.length && j < undated.length) {
      if (recent(dated[i],undated[j]) <= 0) ordered.push(dated[i++]);
      else ordered.push(undated[j++]);
    }
    ordered.push(...dated.slice(i),...undated.slice(j));
  }
  return ordered;
}
function cutoffDate(...labels) {
  for (const raw of labels) {
    const text = clean(raw);
    const day = calendarDate(text);
    if (day) return day;
    if (/^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2]))?$/.test(text)) return text;
    const month = text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+((?:19|20)\d{2})$/i);
    if (month) {
      const date = calendarDate(month[1]+' 1, '+month[2]);
      if (date) return date.slice(0,7);
    }
  }
  return null;
}
function filterBinding(result) {
  return {pmid:result.pmid,result_id:result.result_id,population_id:result.population_id,
    source_input_sha256:result.source_input_sha256,review_binding_sha256:result.review_binding_sha256,
    quantitative_record:{population_id:result.quantitative_record.population_id}};
}
function build(snapshot, graph, citations, phaseComparison) {
  if (graph.metadata.clinical_content_sha256 !== snapshot.clinical_evidence.content_sha256) {
    throw new Error('Treatment map and quantitative records come from different releases.');
  }
  const articles = new Map(snapshot.clinical_evidence.articles.filter(a => a.current_main_eligible && !a.publication_hold && a.current_screening_status === 'retain').map(a => [a.pmid,a]));
  const registry = snapshot.clinical_evidence.evidence_registry;
  const index = memberships(graph);
  const nodes = byId(graph.nodes);
  const candidates = [];
  for (const publication of snapshot.articles) {
    const article = articles.get(publication.pmid);
    if (!article) continue;
    const pmid = article.pmid, citation = citations[pmid]||{};
    const scopeContext = Scope.contextFor(article,{evidenceRegistry:registry});
    const results = new Map();
    for (const result of article.quantitative_results || []) {
      if (!result.quantitative_record || result.result_relation !== 'arm_specific' || result.scope !== 'observed' || result.evidence_origin !== 'own_report_results' || result.source_preference?.status === 'superseded_abstract') continue;
      const local = result.quantitative_record;
      const section = 'percentage' in local ? 'binary' : 'median_status' in local ? 'survival' : null;
      if (section) results.set(partKey(result.review_stage,result.source_input_sha256,section,local.id),result);
    }
    let reportId = Quant.trialIdentifiers({pmid,details:{quantitative_extraction:publication.records}});
    const indexedNct = single((citation.registration_ids||[]).filter(id => /^NCT\d{8}$/.test(id)));
    if (!reportId.nct_ids.length && indexedNct) reportId = TrialIds.harmonize({...reportId,nct_ids:[indexedNct]});
    reportId.alternateRegistration = alternateRegistration(publication.records);
    const fullDesign = publication.records.find(w => w.record?.stage === 'R3' && w.record?.decision?.status === 'retain')?.record.study?.study_type;
    if (fullDesign === 'observational') continue;
    for (const wrapper of publication.records) {
      const record = Quant.effectiveRecord(wrapper);
      if (record.decision?.status !== 'retain' || record.validation?.decision_valid === false || !trueTrial(record,citation,article)) continue;
      const stage = record.stage, sha = record.source_sha256, populations = byId(record.populations);
      const arms = new Map();
      for (const arm of record.arms) {
        const bindings = index.get(partKey(pmid,stage,sha,arm.id))||[];
        const found = new Map(bindings.map(b => [b.membership.canonical_regimen?.node_id,b.membership.canonical_regimen]));
        const canonical = found.size === 1 ? [...found.values()][0] : null;
        const regimen = course(arm,nodes,canonical);
        if (regimen) arms.set(arm.id,{arm,bindings,regimen});
      }
      // Distinguish randomized dose or schedule arms for the same regimen.
      const sameRegimen = new Map();
      for (const a of arms.values()) add(sameRegimen,partKey(a.arm.population_id,a.regimen.key),a);
      for (const peers of sameRegimen.values()) {
        if (peers.length < 2) continue;
        const dose = (a,withSchedule) => {
          const components = a.arm.nodes.filter(n => !n.children?.length);
          const compounds = unique(components.map(n => clean(n.name))).length > 1;
          const parts = unique(components.map(n => [compounds ? clean(n.name) : '',clean(n.dose),withSchedule ? clean(n.schedule) : ''].filter(Boolean).join(' ')));
          return parts.length ? a.regimen.label + ' ('+parts.join('; ')+')' : a.regimen.label;
        };
        const withDoses = peers.map(a => dose(a,false));
        const withSchedule = peers.map(a => dose(a,true));
        const sourceLabels = peers.map(a => clean(a.arm.label));
        const distinguish = [withDoses,sourceLabels,withSchedule].find(labels => unique(labels.map(norm)).length === peers.length) || sourceLabels;
        if (unique(distinguish.map(norm)).length < 2) continue;
        for (const [i,a] of peers.entries()) {
          a.regimen.key += '|arm:'+norm(distinguish[i]);
          a.regimen.label = distinguish[i] || a.regimen.label;
        }
      }
      for (const section of ['binary','survival']) for (const row of record[section] || []) {
        const result = results.get(partKey(stage,sha,section,row.id));
        const a = arms.get(row.arm_id), pop = populations.get(row.population_id);
        if (!result || !a || !pop || !row.evidence?.length || row.origin !== 'own_report') continue;
        const estimate = measure(section,row,record,{result,population:pop,registry});
        if (!estimate) continue;
        // The Studies main-table numeric gate also suppresses explicitly
        // unreached medians and some count-only rows. Independently validate
        // those measures here and still apply all melanoma population vetoes.
        if (!Scope.resultEligible({...result,main_result_eligible:true},{study:article,context:scopeContext})) continue;
        const exact = a.bindings.filter(x => x.binding.population_ids?.includes(pop.id));
        const sourceMembers = (exact.length ? exact : a.bindings).map(x => x.membership);
        const trial = identity(article,reportId,sourceMembers);
        const sharedCohortId = single(exact.map(x => x.membership.cohort_id));
        if (!trial) continue;
        const cohort = populationFor(pop,record,sharedCohortId ? exact[0].membership : null,trial);
        if (!cohort) continue;
        const id = row.id;
        candidates.push({...trial,armId:partKey(a.regimen.key,cohort.key),regimen:a.regimen.label,
          parentArmId:partKey(a.regimen.key,cohort.parentKey),subgroup:cohort.subgroup,
          cohort:cohort.label,classes:agentClasses(a.regimen.classes), ...estimate, pmid,
          author:clean(citation.first_author) || clean(article.first_author_surname),year:article.year || null,date:citation.date || (article.year ? String(article.year) : null),
          cutoff:cutoffDate(row.cutoff,pop.cutoff),stage, sourceSha:sha,resultId:result.result_id,
          source:{pmid,stage,sha,section,id},filter_binding:filterBinding(result)});
      }
    }
  }
  matchParentCourses(candidates);
  const rows = preferredRows(candidates);
  if (phaseComparison?.source_file_sha256 && phaseComparison.source_file_sha256 === graph.metadata.source_file_sha256) {
    attachPhaseLinks(rows,phaseComparison);
  }
  return {schema_version:1,source_file_sha256:graph.metadata.source_file_sha256,rows};
}
function read(file) {
  return JSON.parse(fs.existsSync(file) ? fs.readFileSync(file) : zlib.gunzipSync(fs.readFileSync(file+'.gz')));
}
module.exports = {build,preferredRows,course,populationFor,identity};
if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname,'../..'));
  const directory = path.join(root,'website/dist/data');
  const data = name => read(path.join(directory,name+'.json'));
  const phaseFile = path.join(directory,'phase_comparison.json');
  const optional = file => fs.existsSync(file) || fs.existsSync(file+'.gz') ? read(file) : null;
  const phaseComparison = optional(phaseFile);
  const snapshot = build(data('quantitative_extraction'), data('treatment_map'),
    optional(path.join(root,'website/config/phase_comparison_citations.json')) || {}, phaseComparison);
  const file = path.join(directory,'trial_outcomes.json');
  const temporary = file + '.tmp.' + process.pid;
  fs.writeFileSync(temporary,JSON.stringify(snapshot)+'\n');
  fs.renameSync(temporary,file);
  console.log(snapshot.rows.length + ' source-bound arm outcomes.');
}
