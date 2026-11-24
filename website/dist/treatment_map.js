/* Prepared evidence only: layout and interaction never parse or aggregate trial reports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./treatment_map_effects.js'), require('./treatment_map_analysis.js'), require('./treatment_map_planning.js'), require('./treatment_map_charts.js'), require('./confidence_intervals.js'), require('./treatment_network_ui.js'), require('./radial_branch_panel.js'), String(factory));
  else root.TreatmentMap = factory(root.TreatmentMapEffects, root.TreatmentMapAnalysis, root.TreatmentMapPlanning, root.TreatmentMapCharts, root.ConfidenceIntervals, root.TreatmentNetworkUI, root.RadialBranchPanel, String(factory));
})(typeof globalThis === 'undefined' ? this : globalThis, function (Effects, Analysis, Planning, Charts, ConfidenceIntervals, NetworkUI, RadialPanel, sourceCode) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const number = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
  const effectNumber = ConfidenceIntervals.formatEffectNumber;
  const list = (value) => Array.isArray(value) ? value : [];
  const byLabel = (a, b) => String(a.label).localeCompare(String(b.label), 'en') || String(a.id).localeCompare(String(b.id), 'en');
  const components = (node) => new Set(list(node.components));
  const contains = (child, parent) => parent.components.length < child.components.length && parent.components.every((id) => child.components.includes(id));
  const byComparison = (a, b) => String(a.default_rank ?? '').localeCompare(String(b.default_rank ?? ''), 'en', { numeric: true }) || String(a.study_name || a.study_id).localeCompare(String(b.study_name || b.study_id), 'en') || String(a.outcome).localeCompare(String(b.outcome), 'en') || String(a.pmid).localeCompare(String(b.pmid), 'en') || String(a.id).localeCompare(String(b.id), 'en');
  const count = (node) => node.count_summary || {};
  // A cache identity, not a security digest. Include complete numerical and
  // selection implementations so a code edit invalidates prepared results.
  const engineSignature = (() => {
    const source=sourceCode+Analysis.cacheSource+Effects.cacheSource+ConfidenceIntervals.cacheSource;
    let a=2166136261,b=5381;
    for(let i=0;i<source.length;i++){a=Math.imul(a^source.charCodeAt(i),16777619);b=Math.imul(b,33)^source.charCodeAt(i);}
    return source.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
  })();
  function preparedDefaults(graph) {
    const saved=graph.default_views;
    return saved?.schema_version===1&&saved.graph_content_sha256===graph.content_sha256&&saved.engine_signature===engineSignature?saved:null;
  }
  const analysisKey=(edge,endpoint,scope,direction)=>[edge.id,endpoint,scope,direction.tailId,direction.headId].join('|');
  const decodedDefaults=new WeakMap();
  function unpackAnalysis(saved,key) {
    const packed=saved.analyses;
    if(packed?.format!=='interned-v1')return packed?.[key]||null;
    if(!Object.hasOwn(packed.entries,key))return null;
    if(!decodedDefaults.has(saved))decodedDefaults.set(saved,new Map());
    const memo=decodedDefaults.get(saved);
    const expand=value=>{
      if(!value||typeof value!=='object')return value;
      if(!Object.hasOwn(value,'$cache_ref'))return value;
      const id=value.$cache_ref;if(memo.has(id))return memo.get(id);
      const source=packed.values[id];
      if(!source||typeof source!=='object')throw new Error('Invalid saved treatment-map analysis');
      const result=Array.isArray(source)?source.map(expand):Object.fromEntries(Object.entries(source).map(([k,v])=>[k,expand(v)]));
      memo.set(id,result);return result;
    };
    return expand(packed.entries[key]);
  }
  function savedAnalysis(model,edge,options) {
    if(options.endpoint!=='OS:HR'||options.studyScope!=='all'||options.advanced?.active||Object.keys(options.inclusionOverrides||{}).length||options.inclusionOrder?.length)return null;
    const saved=preparedDefaults(model.graph);
    return saved?unpackAnalysis(saved,analysisKey(edge,options.endpoint,options.studyScope,options)):null;
  }
  function serializeLayout(tree) {
    return {...tree,nodes:tree.nodes.map(node=>node.id),parents:[...tree.parents],children:[...tree.children].map(([id,nodes])=>[id,nodes.map(node=>node.id)]),positions:[...tree.positions]};
  }
  function preparedLayout(model,branchId) {
    const saved=preparedDefaults(model.graph)?.layouts?.[branchId];
    if(!saved)return layout(model,branchId);
    return {...saved,nodes:saved.nodes.map(id=>model.byId.get(id)),parents:new Map(saved.parents),children:new Map(saved.children.map(([id,nodes])=>[id,nodes.map(id=>model.byId.get(id))])),positions:new Map(saved.positions)};
  }
  function buildDefaultViews(model) {
    const layouts={},analyses={};
    for(const branchId of ['all',...model.nodes.map(node=>node.id)]){
      const tree=layout(model,branchId);layouts[branchId]=serializeLayout(tree);
      for(const edge of tree.comparisonEdges){
        const comparisons=model.comparisons.filter(item=>edge.comparison_ids.includes(item.id));
        // Both source directions can be visited while choosing the latest
        // supported result; store each exact directional analysis once.
        for(const source of [null,...comparisons.filter(item=>Effects.comparisonMatchesEndpoint(item,'OS:HR'))]){
          const direction=comparisonDirection(tree,edge,source),key=analysisKey(edge,'OS:HR','all',direction);
          if(!analyses[key])analyses[key]=Analysis.analyze(comparisons,{...direction,endpoint:'OS:HR',studyScope:'all',advanced:{active:false,matches:{}},inclusionOverrides:{},inclusionOrder:[]});
        }
      }
    }
    return {schema_version:1,engine_signature:engineSignature,graph_content_sha256:model.graph.content_sha256,layouts,analyses,direct_parallel_ids:[...directParallelNodeIds(model)]};
  }
  const categoryDefinitions = [
    ['ici', 'Immune checkpoint inhibitors', 'Checkpoint inhibitors', 'ici'],
    ['targeted', 'Targeted therapy', 'Targeted therapy', 'targeted'],
    ['chemotherapy', 'Chemotherapy', 'Chemotherapy', 'chemotherapy'],
    ['cytokines', 'Cytokines', 'Cytokines', 'cytokines'],
    ['immunotherapy', 'Other immunotherapy', 'Other immunotherapy', 'immunotherapy'],
    ['cell-therapies', 'Cell therapies', 'Cell therapies', 'cell-therapies'],
    ['vaccines', 'Therapeutic vaccines', 'Vaccines', 'vaccines'],
    ['oncolytic-viruses', 'Oncolytic viruses', 'Oncolytic viruses', 'oncolytic-viruses'],
    ['microbiome-therapies', 'Microbiome therapies', 'Microbiome therapies', 'microbiome-therapies'],
    ['endocrine', 'Endocrine therapy', 'Endocrine therapy', 'endocrine'],
    ['radiotherapy', 'Radiotherapy', 'Radiotherapy', 'radiotherapy'],
    ['surgery', 'Surgery', 'Surgery', 'surgery'],
    ['other', 'Other / unclassified', 'Other / unclassified', 'other'],
  ];
  function categoryInfo(node) {
    const id = node.broad_category || 'other', index = categoryDefinitions.findIndex((item) => item[0] === id);
    if (index >= 0) { const [, label, short_label, class_id] = categoryDefinitions[index]; return { id, label, short_label, class_id, order: index }; }
    return { id, label: id.replace(/[-_]/g, ' ').replace(/^./, (letter) => letter.toUpperCase()), short_label: id.replace(/[-_]/g, ' '), class_id: 'other', order: categoryDefinitions.length };
  }
  function mapColor(node, overview) {
    return overview && node?.broad_category ? categoryInfo(node).class_id : node?.class_id || 'other';
  }
  function annularSectorPath(inner, outer, start, end) {
    const finish = Math.min(end, start + Math.PI * 2 - 0.00001), large = finish - start > Math.PI ? 1 : 0;
    const point = (radius, angle) => `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`;
    return `M${point(outer, start)} A${outer},${outer} 0 ${large} 1 ${point(outer, finish)} L${point(inner, finish)} A${inner},${inner} 0 ${large} 0 ${point(inner, start)} Z`;
  }
  function countLabel(node) {
    const summary = count(node), status = summary.status || 'unresolved';
    if (summary.known_n === null || summary.known_n === undefined || status === 'unresolved') return 'N unresolved';
    return 'N=' + number(summary.known_n) + (status === 'partial' ? '*' : status === 'provisional' ? '†' : '');
  }
  function publicationCount(node) { const summary = count(node); return Number(summary.publication_count || summary.unlinked_publications || 0); }
  function recordCoverage(model,node) {
    const exact=Array.isArray(model.graph.study_memberships),ids=new Set(list(model.graph.study_memberships).filter(row=>row.node_id===node.id).flatMap(row=>list(row.contribution_ids)));
    const relevant=[...model.contributions.values()].filter(item=>exact?ids.has(item.id):list(item.relevant_node_ids).includes(node.id));
    const pmids=item=>[...list(item.publication_ids),item.pmid].filter(Boolean).map(String);
    const linked=new Set(relevant.filter(item=>item.study_id).flatMap(pmids));
    const unlinked=new Set(relevant.filter(item=>!item.study_id).flatMap(pmids));
    return {withheld:relevant.filter(item=>!list(item.node_ids).includes(node.id)),unlinkedPublications:unlinked.size,partlyLinkedPublications:[...unlinked].filter(pmid=>linked.has(pmid)).length};
  }
  function studyLabel(node, compact) {
    const studies = Number(count(node).identified_studies || 0), publications = publicationCount(node);
    if (studies) return `${number(studies)} ${compact ? '' : 'identified '}stud${studies === 1 ? 'y' : 'ies'}`;
    if (publications) return compact ? `${number(publications)} publication${publications === 1 ? '' : 's'}` : `${number(publications)} supporting publication${publications === 1 ? '' : 's'}; study linkage pending`;
    return node.type === 'drug' ? 'No monotherapy studies' : 'No linked evidence';
  }
  function effectLabel(comparison, options) {
    if (!comparison) return '';
    comparison = {...comparison,...ConfidenceIntervals.forDisplay(comparison, options)};
    const format = effectNumber;
    let text = `${comparison.measure || 'Estimate'} ${format(comparison.estimate)}`;
    if(!options?.original&&comparison.ci_95_unavailable)return text+' (95% CI unavailable)';
    if (comparison.ci_lower !== null && comparison.ci_lower !== undefined && comparison.ci_upper !== null && comparison.ci_upper !== undefined) {
      const level = comparison.ci_level == null ? '' : `${number(Number(comparison.ci_level) <= 1 ? Number(comparison.ci_level) * 100 : comparison.ci_level)}% `;
      text += ` (${level}CI ${format(comparison.ci_lower)}–${format(comparison.ci_upper)}${comparison.ci_converted ? '; converted' : ''})`;
    }
    return text;
  }
  function prepare(graph) {
    const rawComparisons = list(graph.comparisons).filter((item) => item && item.id && Number.isFinite(Number(item.estimate)) && item.estimate !== null && item.estimate !== '' && item.intervention && item.comparator && !(item.intervention.node_id && item.intervention.node_id === item.comparator.node_id));
    const comparisons = rawComparisons.some(item => item.analysis) ? Analysis.consolidate(rawComparisons) : rawComparisons;
    // Complete-arm memberships supersede historical component/phase coverage.
    // Comparison endpoints can also establish a complete regimen without N.
    const exactRegimens = Array.isArray(graph.study_memberships) ? new Set([
      ...graph.study_memberships.map(membership => membership.node_id),
      ...comparisons.flatMap(comparison => [comparison.intervention.node_id, comparison.comparator.node_id]),
    ]) : null;
    const regimenNodes = list(graph.nodes)
      .filter(node => node && node.id && ['drug', 'combination'].includes(node.type))
      .filter(node => node.type === 'drug' || !exactRegimens || exactRegimens.has(node.id))
      .map(node => ({ ...node, components: list(node.components) }));
    const supportedComponents = new Set(regimenNodes.filter(node => node.type === 'combination').flatMap(node => node.components));
    const nodes = regimenNodes.filter(node => !exactRegimens || node.type === 'combination' || exactRegimens.has(node.id) || node.components.some(component => supportedComponents.has(component)));
    const byId = new Map(nodes.map(node => [node.id, node]));
    const agents = nodes.filter(node => node.type === 'drug').sort(byLabel);
    const byAgent = new Map(agents.flatMap(node => node.components.map(id => [id, node])));
    const relationships = list(graph.relationships).filter(edge => byId.has(edge.parent_id) && byId.has(edge.child_id));
    return { graph, nodes, byId, agents, byAgent, comparisons, relationships, contributions: new Map(list(graph.contributions).map(item => [item.id, item])) };
  }
  function branchNodes(model, branchId) {
    if (!branchId || branchId === 'all') return model.nodes;
    const root = model.byId.get(branchId);
    if (!root) return [];
    const ids = components(root);
    return model.nodes.filter((node) => node.id === branchId || (node.type === 'combination' && [...ids].every((id) => node.components.includes(id))));
  }
  function countedContributions(model, node) {
    return list(node.contribution_ids).map((id) => model.contributions.get(id)).filter((item) => item && list(item.node_ids).includes(node.id) && item.n !== null && item.n !== undefined && Number.isFinite(Number(item.n)));
  }
  function neutralControl(label) {
    const sourceLabel = String(label || '').trim(); if (!sourceLabel) return null;
    const displayLabel = /^placebo(?:\s*\+\s*placebo)*$/i.test(sourceLabel) ? 'Placebo' : sourceLabel.replace(/^./, (letter) => letter.toUpperCase());
    return { id: 'control:' + encodeURIComponent(displayLabel.toLowerCase().replace(/\s+/g, ' ')), type: 'control', label: displayLabel, components: [], class_id: 'controls' };
  }
  /* Parallel arms require an exact comparison endpoint; a constituent match is insufficient. */
  function parallelArms(model, branchId) {
    const root = model.byId.get(branchId), pairs = new Map();
    if (!root || branchId === 'all') return { nodes: [], edges: [] };
    for (const comparison of model.comparisons) {
      const opposite = comparison.intervention.node_id === branchId ? comparison.comparator : comparison.comparator.node_id === branchId ? comparison.intervention : null;
      if (!opposite) continue;
      let node = model.byId.get(opposite.node_id);
      if (opposite.node_id && !node) continue;
      if (node && (node.id === root.id || contains(node, root) || contains(root, node) || (node.components.length === root.components.length && node.components.every((id) => root.components.includes(id))))) continue;
      if (!node) node = neutralControl(opposite.label);
      if (!node) continue;
      if (!pairs.has(node.id)) pairs.set(node.id, { id: 'parallel:' + branchId + ':' + node.id, root_id: branchId, opponent_id: node.id, node, comparisons: [] });
      pairs.get(node.id).comparisons.push(comparison);
    }
    const ordered = [...pairs.values()].sort((a, b) => byLabel(a.node, b.node));
    return { nodes: ordered.map((pair) => pair.node), edges: ordered.map((pair) => ({ id: pair.id, root_id: pair.root_id, opponent_id: pair.opponent_id, comparison_ids: [...new Set(pair.comparisons.sort(byComparison).map((comparison) => comparison.id))], publication_ids: [...new Set(pair.comparisons.map((comparison) => String(comparison.pmid || '')).filter(Boolean))].sort() })) };
  }
  function directParallelNodeIds(model) { return new Set(model.nodes.filter((node) => parallelArms(model, node.id).edges.length > 0).map((node) => node.id)); }
  /* A short branch label never changes a complete-regimen comparison endpoint. */
  function branchComparisons(model, branchId) {
    if (!branchId || branchId === 'all') return { nodes: [], edges: [] };
    const core = branchNodes(model, branchId).sort((a, b) => a.components.length - b.components.length || String(a.id).localeCompare(String(b.id), 'en'));
    const coreRank = new Map(core.map((node, index) => [node.id, index]));
    const pairs = new Map(), external = new Map();
    const endpoint = arm => arm.node_id ? model.byId.get(arm.node_id) : neutralControl(arm.label);
    for (const comparison of model.comparisons) {
      const intervention = endpoint(comparison.intervention), comparator = endpoint(comparison.comparator);
      if (!intervention || !comparator || intervention.id === comparator.id) continue;
      const interventionInBranch = coreRank.has(intervention.id), comparatorInBranch = coreRank.has(comparator.id);
      if (!interventionInBranch && !comparatorInBranch) continue;
      const nested = intervention.components.length && comparator.components.length && (contains(intervention, comparator) || contains(comparator, intervention));
      let anchor, opposite;
      if (nested) {
        anchor = contains(intervention, comparator) ? comparator : intervention;
        opposite = anchor === intervention ? comparator : intervention;
      } else {
        anchor = interventionInBranch && (!comparatorInBranch || coreRank.get(intervention.id) < coreRank.get(comparator.id)) ? intervention : comparator;
        opposite = anchor === intervention ? comparator : intervention;
      }
      const kind = nested ? 'addon' : 'parallel';
      const id = kind + ':' + anchor.id + ':' + opposite.id;
      if (!pairs.has(id)) pairs.set(id, { id, kind, root_id: anchor.id, opponent_id: opposite.id, comparisons: [] });
      pairs.get(id).comparisons.push(comparison);
      for (const node of [intervention, comparator]) if (!coreRank.has(node.id)) external.set(node.id, node);
    }
    const edges = [...pairs.values()].map(({ comparisons, ...edge }) => ({
      ...edge,
      comparison_ids: [...new Set(comparisons.sort(byComparison).map(comparison => comparison.id))],
      publication_ids: [...new Set(comparisons.map(comparison => String(comparison.pmid || '')).filter(Boolean))].sort(),
    }));
    return { nodes: [...external.values()].sort(byLabel), edges };
  }
  function addOnComparisons(model, positions, coreIds) {
    const pairs = new Map();
    for (const comparison of model.comparisons) {
      const a = model.byId.get(comparison.intervention.node_id), b = model.byId.get(comparison.comparator.node_id);
      if (!a || !b || (!coreIds.has(a.id) && !coreIds.has(b.id)) || !positions.has(a.id) || !positions.has(b.id) || !(contains(a, b) || contains(b, a))) continue;
      const parent = contains(a, b) ? b : a, child = parent === a ? b : a, id = 'addon:' + parent.id + ':' + child.id;
      if (!pairs.has(id)) pairs.set(id, { id, kind: 'addon', root_id: parent.id, opponent_id: child.id, comparison_ids: [], publication_ids: [] });
      const pair = pairs.get(id); pair.comparison_ids.push(comparison.id); if (comparison.pmid) pair.publication_ids.push(String(comparison.pmid));
    }
    return [...pairs.values()].map((pair) => ({ ...pair, comparison_ids: [...new Set(pair.comparison_ids)], publication_ids: [...new Set(pair.publication_ids)].sort() }));
  }
  function comparisonDirection(tree, edge, comparison) {
    if (edge.kind === 'addon') return { tailId: edge.root_id, headId: edge.opponent_id };
    const internal = tree.nodes.some((node) => node.id === edge.opponent_id);
    if (internal && comparison) return { tailId: Effects.armId(comparison.comparator), headId: Effects.armId(comparison.intervention) };
    return { tailId: edge.root_id, headId: edge.opponent_id };
  }
  function directedLabel(effect) {
    return effectLabel(effect);
  }
  function branchNodeLabel(model, tree, nodeId) {
    const node = model.byId.get(nodeId) || tree.parallelNodes.find((peer) => peer.id === nodeId);
    if (!node) return '';
    const parent = model.byId.get(tree.parents.get(nodeId));
    const added = parent ? node.components.filter((id) => !parent.components.includes(id)) : [];
    return added.length ? '+ ' + added.map((id) => model.byAgent.get(id)?.label || id).join(' + ') : node.label;
  }
  function curveGeometry(segments) {
    const sampledPoints = [segments[0].start], path = [`M${segments[0].start.x},${segments[0].start.y}`];
    for (const segment of segments) {
      const { start: a, end: b, control: q, control1: c, control2: d, type } = segment;
      path.push(type === 'C' ? `C${c.x},${c.y} ${d.x},${d.y} ${b.x},${b.y}` : type === 'Q' ? `Q${q.x},${q.y} ${b.x},${b.y}` : `L${b.x},${b.y}`);
      const steps = type === 'L' ? 1 : 64;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        sampledPoints.push(type === 'C' ? { x: u ** 3 * a.x + 3 * u * u * t * c.x + 3 * u * t * t * d.x + t ** 3 * b.x, y: u ** 3 * a.y + 3 * u * u * t * c.y + 3 * u * t * t * d.y + t ** 3 * b.y } : type === 'Q' ? { x: u * u * a.x + 2 * u * t * q.x + t * t * b.x, y: u * u * a.y + 2 * u * t * q.y + t * t * b.y } : b);
      }
    }
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const lengths = sampledPoints.slice(1).map((point, i) => distance(point, sampledPoints[i]));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    let remaining = total / 2, midpoint = sampledPoints[0];
    for (let i = 1; i < sampledPoints.length; i++) {
      const a = sampledPoints[i - 1], b = sampledPoints[i], length = lengths[i - 1];
      if (remaining <= length) {
        const t = length ? remaining / length : 0;
        midpoint = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        break;
      }
      remaining -= length;
    }
    return { path: path.join(' '), segments, sampledPoints, midpoint };
  }
  function radialComparisonGeometry(model, tree, edge, scale = 1) {
    // Radial coordinates are glyph centres, not the top-left of branch cards.
    const head = tree.positions.get(edge.opponent_id), tail = tree.positions.get(edge.root_id);
    const radius = (id) => { const node = model.byId.get(id), enlarged = parallelArms(model, id).edges.length > 0; return (node.type === 'drug' ? 5.5 : 6.5) * (enlarged ? 2 : 1); };
    const outside = (point, control, id) => {
      const length = Math.hypot(control.x - point.x, control.y - point.y) || 1, gap = radius(id) + 2 / Math.max(0.12, scale);
      return { x: point.x + (control.x - point.x) * gap / length, y: point.y + (control.y - point.y) * gap / length };
    };
    const start = outside(head, tail, edge.opponent_id), end = outside(tail, head, edge.root_id);
    return { ...curveGeometry([{ type: 'L', start, end }]), points: [start, end] };
  }
  function curveClearsCards(geometry, tree) {
    // Test short curve chords against open card interiors; touching a port is valid.
    const intersects = (a, b, box) => {
      let lo = 0, hi = 1;
      for (const [start, delta, min, max] of [[a.x, b.x - a.x, box.x + 0.001, box.x + box.width - 0.001], [a.y, b.y - a.y, box.y - box.height / 2 + 0.001, box.y + box.height / 2 - 0.001]]) {
        if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return false; }
        else { const p = (min - start) / delta, q = (max - start) / delta; lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q)); if (lo > hi) return false; }
      }
      return true;
    };
    return ![...tree.positions.values()].some((box) => geometry.sampledPoints.slice(1).some((point, i) => intersects(geometry.sampledPoints[i], point, box)));
  }
  function parallelLinkGeometry(tree, edge, tailId = edge.root_id, state = 'neutral', dashed = false) {
    const a = tree.positions.get(edge.opponent_id), b = tree.positions.get(edge.root_id), margin = 16;
    const cards = [...tree.positions.values()];
    const stacked = a.x === b.x;
    // Stacked siblings share one gutter. Prefer the side inside the plot
    // so the curve remains visible even when the column is at the edge.
    const roomLeft = a.x - Math.min(...cards.map(p => p.x));
    const roomRight = Math.max(...cards.map(p => p.x + p.width)) - (a.x + a.width);
    const aSide = (stacked ? roomRight > roomLeft : a.x < b.x) ? 'right' : 'left';
    const bSide = stacked ? aSide : aSide === 'left' ? 'right' : 'left';
    // Both card faces have the same color bands. Within a band, incoming
    // and outgoing arrows of each stroke style share an attachment point.
    function port(card, side, isTail) {
      const band = { better: -0.29, worse: 0.29, neutral: 0, indirect: 0 }[state];
      const role = isTail ? -0.068 : 0.068;
      const stroke = state === 'indirect' ? 0 : dashed ? 0.032 : -0.032;
      const level = state === 'indirect' ? 0 : band + role + stroke;
      return { x: card.x + (side === 'right' ? card.width : 0), y: card.y + card.height * level };
    }
    const startPort = port(a, aSide, edge.opponent_id === tailId), endPort = port(b, bSide, edge.root_id === tailId);
    const outside = (p, side, gap) => ({x: p.x + (side === 'left' ? -gap : gap), y: p.y});
    const start = outside(startPort, aSide, margin), end = outside(endPort, bSide, margin);
    const obstacles = [...tree.positions.values()].map((p) => ({ left: p.x - margin, right: p.x + p.width + margin, top: p.y - p.height / 2 - margin, bottom: p.y + p.height / 2 + margin }));
    const xs = [...new Set([start.x, end.x, ...obstacles.flatMap((r) => [r.left, r.right])])].sort((a, b) => a - b);
    const ys = [...new Set([start.y, end.y, ...obstacles.flatMap((r) => [r.top, r.bottom])])].sort((a, b) => a - b);
    const width = xs.length, key = (x, y) => y * width + x, point = (id) => ({ x: xs[id % width], y: ys[Math.floor(id / width)] });
    const first = key(xs.indexOf(start.x), ys.indexOf(start.y)), last = key(xs.indexOf(end.x), ys.indexOf(end.y));
    const clear = (p, q) => !obstacles.some((r) => p.x === q.x ? p.x > r.left && p.x < r.right && Math.max(p.y, q.y) > r.top && Math.min(p.y, q.y) < r.bottom : p.y > r.top && p.y < r.bottom && Math.max(p.x, q.x) > r.left && Math.min(p.x, q.x) < r.right);
    const distance = (p, q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
    // A short detour is preferable to a staircase. Include the incoming axis
    // in the search so equal-length routes with fewer bends win consistently.
    const initial = first * 2, bendCost = 24;
    const costs = new Map([[initial, 0]]), previous = new Map(), pending = new Set([initial]), closed = new Set();
    let finish;
    while (pending.size) {
      let current, best = Infinity;
      for (const id of pending) {
        const score = costs.get(id) + distance(point(Math.floor(id / 2)), end);
        if (score < best) { best = score; current = id; }
      }
      const cell = Math.floor(current / 2);
      if (cell === last) { finish = current; break; }
      pending.delete(current); closed.add(current);
      const x = cell % width, y = Math.floor(cell / width), p = point(cell);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= ys.length) continue;
        const next = key(nx, ny), axis = Number(ny !== y), id = next * 2 + axis, q = point(next);
        if (closed.has(id) || !clear(p, q)) continue;
        let cost = costs.get(current) + distance(p, q);
        if (axis !== current % 2) cost += bendCost;
        if (next === last && axis === 1) cost += bendCost;
        if (cost >= (costs.get(id) ?? Infinity)) continue;
        costs.set(id, cost); previous.set(id, current); pending.add(id);
      }
    }
    if (finish === undefined) throw new Error('No unobstructed comparison route for ' + edge.id);
    const route = [];
    for (let id = finish; id !== undefined; id = previous.get(id)) route.unshift(point(Math.floor(id / 2)));
    const points = [startPort, ...route, endPort].filter((p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
    const compact = points.filter((p, i) => !i || i === points.length - 1 || !((points[i - 1].x === p.x && p.x === points[i + 1].x) || (points[i - 1].y === p.y && p.y === points[i + 1].y)));
    const span = Math.abs(endPort.x - startPort.x);
    const reach = stacked ? Math.min(roomLeft || roomRight ? 60 : 26, Math.abs(a.y - b.y) * 0.4) : Math.min(180, span * 0.48);
    const bow = Math.min(18, span * 0.15);
    // A shallow arc is enough for aligned cards. Other direct curves have
    // horizontal terminal tangents and progress toward the facing edge.
    for (const sign of [1, -1]) {
      const c = outside(startPort, aSide, reach), d = outside(endPort, bSide, reach);
      if (!stacked && Math.abs(startPort.y - endPort.y) < 24) { c.y += sign * bow; d.y += sign * bow; }
      const geometry = curveGeometry([{ type: 'C', start: startPort, control1: c, control2: d, end: endPort }]);
      if (curveClearsCards(geometry, tree)) return { ...geometry, points: compact };
    }
    // Dense branches keep the obstacle-safe route, with smooth rounded bends.
    const segments = []; let cursor = compact[0];
    for (let i = 1; i < compact.length - 1; i++) {
      const previous = compact[i - 1], corner = compact[i], next = compact[i + 1];
      const radius = Math.min(28, distance(previous, corner) * 0.45, distance(corner, next) * 0.45);
      const approach = { x: corner.x + (previous.x - corner.x) * radius / distance(previous, corner), y: corner.y + (previous.y - corner.y) * radius / distance(previous, corner) };
      const departure = { x: corner.x + (next.x - corner.x) * radius / distance(corner, next), y: corner.y + (next.y - corner.y) * radius / distance(corner, next) };
      segments.push({ type: 'L', start: cursor, end: approach }, { type: 'Q', start: approach, control: corner, end: departure }); cursor = departure;
    }
    segments.push({ type: 'L', start: cursor, end: compact[compact.length - 1] });
    return { ...curveGeometry(segments), points: compact };
  }
  /* One display parent per regimen; all proper-subset relationships stay in the artifact. */
  function displayParents(model, visible, branchId) {
    const available = new Set(visible.map((node) => node.id)), parents = new Map();
    for (const child of visible) {
      if (child.type !== 'combination' || child.id === branchId) continue;
      let candidates = model.relationships.filter((edge) => edge.child_id === child.id && available.has(edge.parent_id)).map((edge) => model.byId.get(edge.parent_id));
      if (!candidates.length) candidates = visible.filter((parent) => contains(child, parent));
      candidates.sort((a, b) => b.components.length - a.components.length || String(a.id).localeCompare(String(b.id), 'en'));
      const preferred = !branchId || branchId === 'all' ? candidates.find((node) => node.id === child.overview_parent_id) : null;
      if (preferred || candidates[0]) parents.set(child.id, (preferred || candidates[0]).id);
    }
    return parents;
  }
  function radialSectors(roots, children, positions) {
    const categories = new Map(), weights = new Map();
    function weigh(node) {
      const descendants = children.get(node.id) || [];
      const weight = Math.max(1, descendants.reduce((sum, child) => sum + weigh(child), 0));
      weights.set(node.id, weight);
      return weight;
    }
    // Roots arrive in label order. A multi-target agent has one primary display
    // subgroup, so it occupies exactly one place on the circle.
    const rootPadding = 0.65;
    let totalWeight = 0;
    for (const root of roots) {
      const info = categoryInfo(root);
      if (!categories.has(info.id)) categories.set(info.id, { ...info, subgroups: new Map() });
      const category = categories.get(info.id);
      const subgroup = root.radial_subgroup || { id: 'unclassified', label: 'Other or unspecified' };
      if (!category.subgroups.has(subgroup.id)) category.subgroups.set(subgroup.id, { ...subgroup, roots: [] });
      category.subgroups.get(subgroup.id).roots.push(root);
      totalWeight += weigh(root) + rootPadding;
    }
    if (!categories.size) return [];
    const ordered = [...categories.values()].sort((a, b) => a.order - b.order || byLabel(a, b));
    const segmentCount = ordered.reduce((n, group) => n + group.subgroups.size, 0);
    // Keep clefts visible without letting many small subgroups consume the ring.
    const broadBoundaries = ordered.length > 1 ? ordered.length : 0;
    const subgroupBoundaries = segmentCount > 1 ? segmentCount - broadBoundaries : 0;
    const broadGap = broadBoundaries ? Math.min(0.064, 0.8 / broadBoundaries) : 0;
    const subgroupGap = subgroupBoundaries ? Math.min(0.034, 0.9 / subgroupBoundaries) : 0;
    const unit = (2 * Math.PI - broadGap * broadBoundaries - subgroupGap * subgroupBoundaries) / totalWeight;
    let cursor = -Math.PI / 2 + (broadGap || subgroupGap) / 2;
    function place(node, start, span, depth, categoryId, subgroupId) {
      const angle = start + span / 2, radius = 335 + depth * 155;
      positions.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius,
        angle, depth, group_id: categoryId, subgroup_id: subgroupId, width: 14, height: 14 });
      let next = start;
      for (const child of children.get(node.id) || []) {
        const childSpan = span * weights.get(child.id) / weights.get(node.id);
        place(child, next, childSpan, depth + 1, categoryId, subgroupId);
        next += childSpan;
      }
    }
    return ordered.map(({ subgroups, ...category }) => {
      const groups = [...subgroups.values()].sort((a, b) =>
        Number(a.id === 'unclassified') - Number(b.id === 'unclassified') || byLabel(a, b));
      const segments = groups.map(({ id, label, roots }, index) => {
        const start = cursor;
        for (const root of roots) {
          const span = unit * weights.get(root.id);
          place(root, cursor + unit * rootPadding / 2, span, 0, category.id, id);
          cursor += span + unit * rootPadding;
        }
        const end = cursor;
        cursor += index === groups.length - 1 && broadGap ? broadGap : subgroupGap;
        return { id, label, root_ids: roots.map(root => root.id), agent_count: roots.filter(root => root.type === 'drug').length, start, end };
      });
      return { ...category, root_ids: segments.flatMap(s => s.root_ids), agent_count: segments.reduce((n, s) => n + s.agent_count, 0),
        start: segments[0].start, end: segments[segments.length - 1].end, inner_radius: 273, outer_radius: 365, segments };
    });
  }
  function layout(model, branchId) {
    const nodes = branchNodes(model, branchId), parents = displayParents(model, nodes, branchId);
    const children = new Map(nodes.map((node) => [node.id, []]));
    for (const [id, parentId] of parents) children.get(parentId)?.push(model.byId.get(id));
    children.forEach((value) => value.sort(byLabel));
    const roots = nodes.filter((node) => !parents.has(node.id)).sort(byLabel), positions = new Map();
    const overview = !branchId || branchId === 'all';
    const comparisons = overview ? { nodes: [], edges: [] } : branchComparisons(model, branchId);
    const sectors = overview ? radialSectors(roots, children, positions) : [];
    if (!overview) {
      let row = 0;
      const visit = (node, depth) => {
        const descendants = children.get(node.id) || [];
        descendants.forEach((child) => visit(child, depth + 1));
        const y = descendants.length ? descendants.reduce((sum, child) => sum + positions.get(child.id).y, 0) / descendants.length : row++ * 114;
        positions.set(node.id, { x: depth * 330, y, depth, width: 258, height: 82 });
      };
      roots.forEach((node) => visit(node, 0));
      // Reserve a comparison column before any descendant with an external arm.
      // Shared opponents (including Placebo) remain one node, left of every anchor.
      const anchors = new Map(comparisons.nodes.map(node => {
        const incident = comparisons.edges.filter(edge => edge.opponent_id === node.id || edge.root_id === node.id);
        // A baseline outside this branch sits left of the root, even when its
        // compared combination is several levels deeper. Links retain both arms.
        const ids = incident.some(edge => edge.kind === 'addon') ? [branchId] : incident.map(edge => edge.root_id === node.id ? edge.opponent_id : edge.root_id);
        return [node.id, ids];
      }));
      const anchorFor = (id) => anchors.get(id).slice().sort((a, b) => positions.get(a).depth - positions.get(b).depth || String(a).localeCompare(String(b), 'en'))[0];
      const lanes = new Set(comparisons.nodes.map((node) => positions.get(anchorFor(node.id)).depth).filter((depth) => depth > 0));
      for (const point of positions.values()) { point.x += [...lanes].filter((depth) => depth <= point.depth).length * 330; if (lanes.size) point.y *= 2; }
      const corePositions = [...positions.values()];
      const rootPeers = comparisons.nodes.filter((node) => anchorFor(node.id) === branchId);
      for (const node of comparisons.nodes) {
        const anchorId = anchorFor(node.id), anchor = positions.get(anchorId), atRoot = anchorId === branchId;
        const x = atRoot ? -390 : anchor.x - 330;
        let y = atRoot ? anchor.y + (rootPeers.indexOf(node) - (rootPeers.length - 1) / 2) * 114 : anchor.y - 114;
        const occupied = [...positions.values()].filter((point) => x < point.x + point.width + 24 && x + 258 + 24 > point.x);
        const crossesInclusion = (value) => !atRoot && corePositions.some((point) => point.x === anchor.x && Math.abs(point.y - value) < 58);
        for (let step = 0; occupied.some((point) => Math.abs(point.y - y) < 114) || crossesInclusion(y); step++) {
          y = anchor.y + (step % 2 ? 1 : -1) * (Math.floor(step / 2) + 1) * 114;
        }
        positions.set(node.id, { x, y, depth: anchor.depth - 0.5, width: 258, height: 82, parallel: true, anchor_id: anchorId });
      }
    }
    const parallelEdges = comparisons.edges.filter(edge => edge.kind === 'parallel');
    const addOnEdges = overview
      ? addOnComparisons(model, positions, new Set(nodes.map(node => node.id))).filter(edge => parents.get(edge.opponent_id) === edge.root_id)
      : comparisons.edges.filter(edge => edge.kind === 'addon');
    return { nodes, parents, children, positions, overview, sectors, parallelNodes: comparisons.nodes, parallelEdges, addOnEdges, comparisonEdges: [...parallelEdges, ...addOnEdges] };
  }
  let serial = 0;
  class MapView {
    constructor(root, graph, options) {
      this.root = root; this.doc = root.ownerDocument; this.win = this.doc.defaultView; this.options = options || {}; this.model = prepare(graph);
      this.exactNodeBrowse=Array.isArray(graph.study_memberships)&&typeof this.options.renderNodeStudies==='function'; this.selectionMode='node';
      this.directParallelIds = new Set(preparedDefaults(graph)?.direct_parallel_ids||directParallelNodeIds(this.model));
      this.selectedEndpoint = 'OS:HR'; this.selectedComparisonByPair = new Map();
      this.branchLayout = 'radial';
      this.studyScope = 'all'; this.analysisCache = new Map();
      this.inclusionOverrides = {}; this.inclusionOrder = []; this.advanced = this.options.advanced || {active:false,matches:{}};
      this.planningEnabled = false; this.planningSettings = Planning.indirectSettings(this.options.planningSettings); this.analysisTab = 'comparison';
      this.id = 'treatment-map-' + (++serial); this.cleanups = []; this.nodeElements = new Map(); this.camera = { x: 0, y: 0, scale: 1 }; this.pointers = new Map();
      this.branchId = this.model.agents.find((node) => node.components.includes('nivolumab') || /^nivolumab$/i.test(node.label))?.id || this.model.agents[0]?.id || 'all';
      this.selectedId = this.branchId === 'all' ? null : this.branchId;
      this.root.classList.add('treatment-map'); this.root.replaceChildren(); this.build(); this.setBranch(this.branchId);
      if (this.win.ResizeObserver) { this.resizeObserver = new this.win.ResizeObserver(() => { if (this.stage.clientWidth && !this.drag) this.fit(false); }); this.resizeObserver.observe(this.stage); }
    }
    make(tag, className, parent, text) { const element = this.doc.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; if (parent) parent.appendChild(element); return element; }
    svgElement(tag, attrs, parent, text) { const element = this.doc.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs || {})) element.setAttribute(key, String(value)); if (text !== undefined) element.textContent = text; if (parent) parent.appendChild(element); return element; }
    listen(target, type, callback, options) { target.addEventListener(type, callback, options); this.cleanups.push(() => target.removeEventListener(type, callback, options)); }
    button(parent, label, handler, className) { const button = this.make('button', className || 'tm-button', parent, label); button.type = 'button'; this.listen(button, 'click', handler); return button; }
    nodeFor(id) { return this.model.byId.get(id) || this.tree?.parallelNodes.find((node) => node.id === id); }
    drugNameParts(node,relative=false) {
      const parent=relative&&this.model.byId.get(this.tree.parents.get(node.id)),added=parent?node.components.filter(id=>!parent.components.includes(id)):[];
      const ids=added.length?added:list(node.components);
      return {prefix:added.length?'+ ':'',parts:ids.map(id=>({id,label:this.model.byAgent.get(id)?.label||id,class_id:mapColor(this.model.byAgent.get(id),this.tree?.overview)}))};
    }
    svgDrugNames(parent,node,attrs,{relative=false,maxChars=29,maxLines=1}={}) {
      const names=this.drugNameParts(node,relative),lines=[{prefix:names.prefix,parts:[],length:names.prefix.length}];
      for(let index=0;index<names.parts.length;index++){
        const part=names.parts[index];let line=lines[lines.length-1];const size=part.label.length+2+(line.parts.length?3:0);
        if(line.parts.length&&line.length+size>maxChars&&lines.length<maxLines){line={prefix:'',parts:[],length:0};lines.push(line);}
        if(line.parts.length&&line.length+size>maxChars){line.ellipsis=true;break;}
        const room=Math.max(8,maxChars-line.length-2);line.parts.push({...part,label:part.label.length>room?part.label.slice(0,room-1)+'…':part.label});line.length+=size;
      }
      if(!names.parts.length)lines[0].fallback=node.label;
      return lines.map((line,index)=>{
        const text=this.svgElement('text',{...attrs,y:Number(attrs.y||0)+index*17},parent);
        if(line.fallback){text.textContent=line.fallback;return text;}
        if(line.prefix)this.svgElement('tspan',{},text,line.prefix);
        line.parts.forEach((part,position)=>{if(position)this.svgElement('tspan',{},text,' + ');const span=this.svgElement('tspan',{'class':'tm-drug-name-segment','data-agent-id':part.id},text);this.svgElement('tspan',{'class':'tm-name-dot','data-treatment-class':part.class_id,'aria-hidden':'true'},span,'● ');this.svgElement('tspan',{'class':'tm-drug-name'},span,part.label);});
        if(line.ellipsis)this.svgElement('tspan',{},text,' + …');
        return text;
      });
    }
    htmlDrugNames(parent,node) {
      const container=this.make('strong','tm-inline-drug-names',parent),parts=this.drugNameParts(node).parts;
      if(!parts.length)container.textContent=node.label;
      parts.forEach((part,index)=>{if(index)this.make('span','tm-drug-separator',container,' + ');const name=this.make('span','tm-inline-drug-name',container);name.dataset.agentId=part.id;const dot=this.make('i','tm-inline-name-dot',name);dot.dataset.treatmentClass=part.class_id;dot.setAttribute('aria-hidden','true');this.make('span','',name,part.label);});
      return container;
    }
    build() {
      const heading = this.make('div', 'tm-heading', this.root), title = this.make('div', 'tm-title-controls', heading);
      this.make('h2', '', title, 'Treatment map');
      if(this.options.mountAdvanced)this.filterPanel=this.options.mountAdvanced(title,this.root);
      const layouts = this.make('div', 'tm-layout-switch', title);
      layouts.setAttribute('role', 'group'); layouts.setAttribute('aria-label', 'Treatment branch layout');
      this.layoutButtons = new Map();
      for (const [key, label] of [['radial', 'Radial branch'], ['branch', 'Treatment map']]) {
        const button = this.button(layouts, label, () => this.setBranchLayout(key), 'tm-layout-button');
        this.layoutButtons.set(key, button);
      }
      const toolbar = this.make('div', 'tm-toolbar', this.root), branchField = this.make('div', 'tm-branch-field', toolbar);
      const label = this.make('label', '', branchField, 'Explore a treatment branch'); label.htmlFor = this.id + '-branch'; label.id = label.htmlFor + '-label';
      this.selector = this.make('select', '', branchField); this.selector.id = label.htmlFor;
      let option = this.make('option', '', this.selector, 'All treatments · radial overview'); option.value = '';
      for (const node of this.model.agents) { option = this.make('option', '', this.selector, node.label); option.value = node.id; }
      this.selector.value = this.branchId === 'all' ? '' : this.branchId;
      this.listen(this.selector, 'change', () => this.setBranch(this.selector.value || 'all'));
      this.picker = this.win.TreatmentPicker?.enhance(this.selector);
      this.advancedNote = this.make('div','tm-applied-filters',this.root); this.renderAdvancedNote();
      const body = this.make('div', 'tm-body', this.root), visual = this.make('div', 'tm-visual', body), mapHeader = this.make('div', 'tm-map-header', visual);
      const mapHeading = this.make('div', '', mapHeader); this.branchTitle = this.make('h3', '', mapHeading); this.branchCount = this.make('p', '', mapHeading);
      const headerTools = this.make('div', 'tm-map-tools', mapHeader);
      this.endpointBadge = this.make('span', 'tm-endpoint-badge', headerTools);
      const controls = this.make('div', 'tm-camera-controls', headerTools); controls.setAttribute('aria-label', 'Map controls');
      this.button(controls, '−', () => this.zoom(1 / 1.3)).setAttribute('aria-label', 'Zoom out');
      this.zoomLabel = this.make('output', '', controls, '100%'); this.zoomLabel.setAttribute('aria-label', 'Zoom level');
      this.button(controls, '+', () => this.zoom(1.3)).setAttribute('aria-label', 'Zoom in');
      this.button(controls, 'Fit', () => this.fit(true)).setAttribute('aria-label', 'Fit all nodes in the current view');
      const indirectControls = this.make('div', 'tm-network-controls', visual); indirectControls.hidden = true;
      this.stage = this.make('div', 'tm-stage', visual); this.stage.tabIndex = 0; this.stage.setAttribute('aria-label', 'Interactive treatment map. Arrow keys pan. Plus and minus zoom. Home fits the map. Tab to select treatment nodes.');
      this.svg = this.svgElement('svg', { class: 'tm-svg', role: 'group', 'aria-label': 'Treatment branches' }, this.stage);
      const defs = this.svgElement('defs', {}, this.svg); this.comparisonMarkers = [];
      for (const style of Object.values(Effects.styles)) {
        const marker = this.svgElement('marker', { id: this.id + '-arrow-' + style.state, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 10, markerHeight: 10, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
        this.svgElement('path', { d: 'M1 1 L9 5 L1 9 Z', fill: style.color }, marker); this.comparisonMarkers.push(marker);
      }
      this.world = this.svgElement('g', { class: 'tm-world' }, this.svg);
      this.stageHint = this.make('p', 'tm-stage-hint', this.stage, 'Drag to pan · scroll or pinch to zoom');
      this.radialHost = this.make('section', 'tm-radial-host', visual); this.radialHost.hidden = true;
      const indirectResult = this.make('section', 'tm-network-result', visual); indirectResult.hidden = true;
      if (NetworkUI) this.indirect = NetworkUI.mount(this, toolbar, indirectControls, indirectResult, defs, parallelLinkGeometry);
      this.radialTools = this.make('div', 'tm-radial-tools', toolbar);
      this.radialTools.hidden = true;
      this.categoryLegend = this.make('section', 'tm-category-legend', visual); this.categoryLegend.setAttribute('aria-label', 'Treatment category colors');
      this.legend = this.make('div', 'tm-legend', visual);
      const inclusionKey = this.make('span', '', this.legend); this.make('i', 'tm-solid', inclusionKey); this.make('span', '', inclusionKey, 'Component inclusion · no comparison arrow');
      this.comparisonLegendItem = this.make('div', 'tm-effect-legend', this.legend);
      const indirectKey = this.make('div', 'tm-network-legend', this.legend);
      this.make('i', 'tm-network-swatch', indirectKey); this.make('span', '', indirectKey, 'Dotted indirect arrow · second treatment versus first treatment');
      for (const direction of ['better', 'worse']) {
        const item = this.make('span', 'tm-effect-key', this.comparisonLegendItem);
        item.style.setProperty('--tm-effect-color', Effects.styles[direction].color);
        item.dataset.effectState = direction;
        this.make('i', 'tm-arrow', item);
        this.make('span', '', item, 'Arrow tail fares ' + direction);
      }
      for (const [className, text] of [['tm-ci-dashed','Dashed · CI includes 0 on the log scale'],['tm-ci-solid','Solid · CI excludes 0 or is unavailable']]) {
        const item = this.make('span','tm-ci-key',this.comparisonLegendItem); this.make('i','tm-arrow '+className,item); this.make('span','',item,text);
      }
      this.make('p','tm-ci-explanation',this.comparisonLegendItem,'Line style uses the study CI, or the pooled CI when multiple independent studies are combined.');
      this.make('p', 'tm-direction-explanation', this.comparisonLegendItem, 'Arrow: comparator → intervention. Effect estimate: intervention versus comparator.');
      this.comparisonBand = this.make('section', 'tm-comparison-band', visual); this.comparisonBand.setAttribute('aria-label', 'Selected direct comparison');
      this.details = this.make('aside', 'tm-details', body); this.details.setAttribute('aria-label', 'Selected treatment evidence');
      this.live = this.make('p', 'sr-only', this.root); this.live.setAttribute('role', 'status'); this.live.setAttribute('aria-live', 'polite');
      this.nodeStudies = this.make('section','tm-node-studies-container',this.root);this.nodeStudies.hidden=true;this.nodeStudies.setAttribute('aria-label','Studies of the selected exact treatment');
      this.buildMethods(); this.bindCamera();
    }
    buildMethods() {
      const methods = this.methods = this.make('details', 'tm-methods', this.root); this.make('summary', '', methods, 'Reading the map & understanding the counts');
      const content = this.make('div', 'tm-methods-content', methods);
      this.make('p', '', content, 'For an add-on agent, the arrow runs from the original regimen to the expanded regimen.');
      const statuses = this.make('dl', 'tm-status-key', content);
      for (const [term, explanation] of [['N', 'Calculated from linked, eligible exact treatment arms.'], ['N*', 'Partial known N; some arms or overlaps remain unresolved.'], ['N†', 'Provisional N; study identity or linkage remains uncertain.'], ['N unresolved', 'No defensible arm total is available.']]) { this.make('dt', '', statuses, term); this.make('dd', '', statuses, explanation); }
      this.make('p', '', content, 'The analysis model follows the number of eligible independent cohorts: one shows its individual estimate, two use fixed-effect pooling, and three or more use random-effects pooling with REML. This rule also applies after filtering, inclusion changes and leave-one-out analysis.');
    }
    syncBranchSelector() {
      if (this.combinationOption) { this.combinationOption.parentNode.removeChild(this.combinationOption); this.combinationOption = null; }
      const selected = this.model.byId.get(this.branchId), choices = [...this.model.agents];
      if (selected?.type === 'combination') { this.combinationOption = this.make('option', '', this.selector, selected.label); this.combinationOption.value = selected.id; choices.push(selected); }
      this.selector.value = this.branchId === 'all' ? '' : this.branchId;
      this.picker?.refresh(choices.map((node) => ({ value: node.id, label: node.label, depth: 0, class_id: node.class_id || 'combination', search_text: list(node.aliases).join(' ') })), 'All treatments · radial overview');
    }
    setBranch(id) {
      this.branchId = id === 'all' || this.model.byId.has(id) ? id : 'all'; this.syncBranchSelector();
      this.tree = preparedLayout(this.model, this.branchId);
      this.radialLeftId = this.branchId === 'all' ? null : this.branchId;
      this.syncBranchLayout();
      this.root.classList.toggle('tm-overview', this.tree.overview);
      this.branchCount.hidden = this.tree.overview; this.comparisonLegendItem.hidden = false;
      this.endpointBadge.hidden = false; this.endpointBadge.textContent = this.endpointDefinition().label;
      if (this.branchId !== 'all') this.selectedId = this.branchId;
      this.branchTitle.hidden = this.tree.overview;
      this.branchTitle.textContent = this.tree.overview ? '' : this.model.byId.get(this.branchId).label + ' branch';
      this.branchCount.textContent = this.tree.overview ? '' : `${number(this.tree.nodes.length)} branch ${this.tree.nodes.length === 1 ? 'node' : 'nodes'}`;
      this.stageHint.textContent = this.tree.overview ? 'Drag to pan · scroll or pinch to zoom' : 'Drag to pan · scroll or pinch to zoom · Fit shows the whole branch';
      this.renderCategoryLegend(); this.renderGraph(); this.indirect?.setBranch(); this.select(this.selectedId, { announce: false }); this.fit(false);
      return this;
    }
    isRadialBranch() { return this.branchLayout === 'radial' && !!this.tree && !this.tree.overview; }
    syncBranchLayout() {
      const radial = this.isRadialBranch();
      this.root.classList.toggle('tm-radial-branch', radial);
      this.radialHost.hidden = !radial;
      this.radialTools.hidden = !radial;
      for (const [key, button] of this.layoutButtons) {
        button.disabled = this.tree.overview;
        button.setAttribute('aria-pressed', String(!this.tree.overview && this.branchLayout === key));
      }
    }
    setBranchLayout(layout) {
      if (this.tree.overview || !this.layoutButtons.has(layout) || this.branchLayout === layout) return this;
      const pair = this.tree.comparisonEdges.find(edge =>
        (edge.id === this.selectedComparisonPairId && (this.selectionMode === 'comparison' || !this.exactNodeBrowse)) ||
        (!this.comparisonBand.hidden && edge.comparison_ids.includes(this.activeComparisonId)));
      this.branchLayout = layout;
      this.syncBranchLayout();
      if (this.isRadialBranch()) {
        const familyIds = new Set(this.tree.nodes.map(node => node.id));
        const candidateIds = [this.indirect?.active && this.indirect.first?.node, this.indirect?.active && this.indirect.second?.node,
          this.selectedId, pair?.root_id, pair?.opponent_id];
        this.radialLeftId = candidateIds.find(id => familyIds.has(id)) || this.branchId;
        this.indirect?.syncRadialLeft(this.radialLeftId, {preservePair: true});
        this.select(this.radialLeftId, {comparisonPairId: pair?.id, announce: false, preserveMode: true});
      } else {
        this.indirect?.refresh();
        this.renderDetails(); this.renderComparison(); this.renderNodeStudies(); this.updateSelection();
        this.fit(false);
      }
      return this;
    }
    radialDirectComparators(leftId) {
      if (this.advanced.pending || this.advanced.error) return [];
      const options = [];
      for (const edge of this.tree.comparisonEdges) {
        if (edge.root_id !== leftId && edge.opponent_id !== leftId) continue;
        if (!this.edgeChoices(edge).some(c => !this.advanced.active || this.advanced.matches?.[c.id]?.matched)) continue;
        const evidence = this.edgeEvidence(edge);
        // Keep the inclusion table accessible if the user unchecks its final cohort.
        if (!evidence.effect?.valid && !evidence.group?.tableRows?.some(row => this.inclusionOverrides[row.comparison?.id] === false)) continue;
        const id = edge.root_id === leftId ? edge.opponent_id : edge.root_id;
        options.push({id, label: this.nodeFor(id).label, kind: 'Direct', edge, evidence});
      }
      return options.sort(byLabel);
    }
    refreshRadialComparators() {
      if (!this.isRadialBranch()) return;
      const selected = this.model.byId.get(this.radialLeftId);
      if (!selected) return;
      const direct = this.radialDirectComparators(selected.id);
      const indirect = this.indirect?.active ? this.indirect : null;
      const availableRegimens = indirect?.radialAvailableRegimens() ?? null;
      const comparators = direct.concat((indirect?.radialComparators() || []).map(row => ({...row, kind: 'Indirect'})));
      const active = direct.find(row => row.edge.id === this.selectedComparisonPairId);
      const networkSelection = indirect?.radialSelection();
      const activeId = indirect ? networkSelection.activeId : active?.id;
      const fit = indirect ? networkSelection.fit?.available && networkSelection.fit : active?.evidence.effect;
      const leftIsNumerator = indirect ? networkSelection.leftIsNumerator : active?.evidence.headId === selected.id;
      const comparison = RadialPanel.orientComparison(fit, this.endpointDefinition(), leftIsNumerator);
      RadialPanel.render(this, this.radialHost, {selected, comparators, activeId, availableRegimens,
        mode: indirect ? 'indirect' : 'direct', comparison,
        loading: !!this.advanced.pending || (!!indirect && ((!indirect.network && !indirect.error) || indirect.fitPending)),
        studyLabel: studyLabel(selected,true), countLabel: countLabel(selected),
        onRegimen: id => {
          if (availableRegimens && !availableRegimens.has(id)) return;
          const next = active && this.radialDirectComparators(id).find(row => row.id === active.id);
          this.radialLeftId = id;
          this.indirect?.syncRadialLeft(id);
          this.select(id, {comparisonPairId: next?.edge.id});
        },
        onComparator: (id, kind) => {
          if (kind === 'Indirect') { indirect?.chooseRadialComparator(id); return; }
          const row = direct.find(item => item.id === id);
          if (row) {
            if (indirect) indirect.setActive(false);
            this.analysisTab = 'comparison';
            this.select(selected.id, {comparisonPairId: row.edge.id});
          }
        }});
    }
    endpointDefinition(key=this.selectedEndpoint) {
      return Effects.endpoints.find(endpoint=>endpoint.key===key)||this.availableEndpoints?.find(endpoint=>endpoint.key===key);
    }
    setEndpoint(key) {
      this.analysisTab = 'comparison';
      if (!this.endpointDefinition(key)) return this;
      if (key !== this.selectedEndpoint) this.indirect?.clearTarget();
      this.selectedEndpoint = key; this.endpointBadge.textContent = this.endpointDefinition().label;
      this.activeComparisonId = null; this.activeComparisonExplicit = false;
      this.select(this.selectedId, { comparisonPairId: this.selectedComparisonPairId, announce: false, preserveMode:true });
      if (this.indirect?.active) this.indirect.reload();
      this.live.textContent = 'Comparison endpoint: ' + this.endpointDefinition().label;
      return this;
    }
    edgeChoices(edge) { return this.model.comparisons.filter((item) => edge.comparison_ids.includes(item.id) && Effects.comparisonMatchesEndpoint(item, this.selectedEndpoint) && Analysis.matchesScope(item,this.studyScope)).sort(byComparison); }
    edgeEvidence(edge, advanced=this.advanced) {
      const choices = this.edgeChoices(edge), remembered = this.selectedComparisonByPair.get(edge.id + '|' + this.selectedEndpoint);
      const candidate = choices.find((item) => item.id === this.activeComparisonId) || choices.find((item) => item.id === remembered) || choices[0] || null;
      let comparison = remembered ? candidate : this.latestSupportedComparison(edge, candidate, advanced);
      let direction = comparisonDirection(this.tree, edge, comparison), { result, group } = this.analysisFor(edge,comparison,advanced);
      const latest=group?.latest_fallback?.row?.comparison;
      if(latest&&latest.id!==comparison?.id){
        comparison=latest;direction=comparisonDirection(this.tree,edge,comparison);
        ({result,group}=this.analysisFor(edge,comparison,advanced));
      }
      const planningRows=group?.tableRows?.filter(row=>row.planning_included===true),selectedRows=group?.selected||[];
      const legacySource=!comparison?.analysis&&!advanced?.active&&this.inclusionOverrides[comparison?.id]!==false;
      const chosenRows=legacySource||planningRows===undefined?null:selectedRows.length?selectedRows:planningRows;
      const effectSource=group?.latest_fallback?.row?.comparison||(chosenRows===null?comparison:(chosenRows.find(row=>row.comparison?.id===comparison?.id)||chosenRows[0])?.comparison||null);
      let effect = effectSource ? Effects.directedEffect(effectSource, direction.tailId, direction.headId) : null;
      if(group?.pooled){const p=group.pooled;effect=Effects.directedEffect({measure:this.endpointDefinition().measure,outcome:this.endpointDefinition().endpoint,estimate:p.estimate,ci_lower:p.ci_lower,ci_upper:p.ci_upper,ci_level:95,intervention:{node_id:direction.headId,label:this.nodeFor(direction.headId).label},comparator:{node_id:direction.tailId,label:this.nodeFor(direction.tailId).label}},direction.tailId,direction.headId);}
      return { comparison:effectSource||comparison,displayComparison:comparison, ...direction, effect, analysis:result,group,style: Effects.effectStyle(edge.kind, effect?.direction || 'neutral') };
    }
    latestSupportedComparison(edge, source, advanced=this.advanced) {
      if (!source?.analysis) return source;
      const { result, group } = this.analysisFor(edge, source, advanced);
      if(group?.latest_fallback?.row?.comparison)return group.latest_fallback.row.comparison;
      const heldGroup = result.groups.find(group => group.excluded.some(row => row.comparison?.id === source.id && (row.reason === 'superseded_same_trial' || /newer_trial|superseded_less_specific/.test(row.reason))));
      const held = heldGroup?.excluded.find(row => row.comparison?.id === source.id);
      if (!held) return source;
      const permitted = held.newer_comparison_ids ? new Set(held.newer_comparison_ids) : new Set(heldGroup.selected.map(row => row.id));
      const newer = result.groups.flatMap(group => group.selected).map(row => row.comparison).filter(item => permitted.has(item.id) && item.analysis?.independent_id === source.analysis.independent_id).sort(byComparison);
      return newer[0] || source;
    }
    analysisFor(edge, source, advanced=this.advanced) {
      const direction = comparisonDirection(this.tree, edge, source);
      const key = analysisKey(edge,this.selectedEndpoint,this.studyScope,direction)+(advanced!==this.advanced?'|unfiltered':'');
      const options={...direction,endpoint:this.selectedEndpoint,studyScope:this.studyScope,inclusionOverrides:this.inclusionOverrides,inclusionOrder:this.inclusionOrder,advanced};
      if (!this.analysisCache.has(key)) this.analysisCache.set(key, savedAnalysis(this.model,edge,options)||Analysis.analyze(this.model.comparisons.filter(item => edge.comparison_ids.includes(item.id)), options));
      const result = this.analysisCache.get(key);
      return { result, group: result.groups[0] || null };
    }
    setAdvancedFilters(context) {
      const next=context||{active:false,matches:{}},signature=JSON.stringify([next.signature,next.active,next.pending,next.error,next.matches]);
      if(signature===this.advancedSignature)return this;
      this.advancedSignature=signature;this.advanced=next;this.analysisCache.clear();this.analysisTab='comparison';
      this.renderAdvancedNote();
      if (this.indirect?.active) this.indirect.reload();
      return this.select(this.selectedId,{comparisonPairId:this.selectedComparisonPairId,announce:false,preserveMode:true});
    }
    renderAdvancedNote() {
      if(!this.advancedNote)return;
      this.advancedNote.replaceChildren();this.advancedNote.hidden=!this.advanced?.active;
      if(!this.advanced?.active)return;
      this.make('span','',this.advancedNote,(this.advanced.label||'Advanced filters')+' · Gray indicates no matching evidence.');
      if(!this.filterPanel&&this.options.onOpenStudies)this.button(this.advancedNote,'Edit in Studies',()=>this.options.onOpenStudies(),'tm-text-button');
    }
    setInclusion(id,included) {
      this.inclusionOverrides[id]=!!included;this.inclusionOrder=this.inclusionOrder.filter(value=>value!==id);this.inclusionOrder.push(id);
      this.analysisCache.clear();this.analysisTab='comparison';
      return this.select(this.selectedId,{comparisonPairId:this.selectedComparisonPairId,announce:false,preserveMode:true});
    }
    resetInclusions(ids) {
      const reset=new Set(ids||Object.keys(this.inclusionOverrides));for(const id of reset)delete this.inclusionOverrides[id];
      this.inclusionOrder=this.inclusionOrder.filter(id=>!reset.has(id));this.analysisCache.clear();this.analysisTab='comparison';
      return this.select(this.selectedId,{comparisonPairId:this.selectedComparisonPairId,announce:false,preserveMode:true});
    }
    setNetworkModel(model) { this.indirect?.setModel(model); return this; }
    setPlanningSettings(values) {
      this.planningSettings=Planning.indirectSettings(values);
      this.renderDetails();this.renderComparison();this.updateSelection();
      if(this.indirect?.active)this.indirect.updateEstimate();
      return this;
    }
    setStudyScope(scope) {
      this.studyScope = ['all', 'trials', 'randomized'].includes(scope) ? scope : 'all';
      this.activeComparisonId = null; this.activeComparisonExplicit = false; this.analysisTab = 'comparison';
      return this.select(this.selectedId, { comparisonPairId: this.selectedComparisonPairId, announce: false, preserveMode:true });
    }
    renderStudyScope(parent = this.details) {
      const field = this.make('section', 'tm-study-scope', parent), label = this.make('label', '', field, 'Evidence to include');
      label.htmlFor = this.id + '-scope'; const select = this.make('select', '', field); select.id = label.htmlFor;
      for (const [value, text] of [['all', 'All studies, including observational'], ['trials', 'Randomized and nonrandomized trials'], ['randomized', 'Randomized trials only']]) { const option = this.make('option', '', select, text); option.value = value; }
      select.value = this.studyScope; select.addEventListener('change', () => this.setStudyScope(select.value)); this.scopeSelector = select;
    }
    renderPlanningControls(parent = this.details) {
      const controls = this.make('section', 'tm-planning-controls', parent);
      const toggle = this.make('button', 'tm-button tm-planning-toggle', controls, 'Sample size calculation');
      this.planningToggle = toggle;
      toggle.type = 'button';
      toggle.addEventListener('click', () => {
        this.planningEnabled = !this.planningEnabled;
        this.renderDetails(); this.renderComparison(); this.updateSelection();
        if (this.indirect?.active) this.indirect.updateEstimate();
        this.planningToggle.focus();
      });
      toggle.setAttribute('aria-pressed', String(this.planningEnabled));
      if (!this.planningEnabled) return;
      const panel = parent === this.details ? controls : this.make('section', 'tm-planning-controls', this.details);
      const form = this.make('form', 'tm-planning-fields', panel); form.addEventListener('submit', event => event.preventDefault());
      const input = (key, labelText, choices, options = {}) => {
        const label = this.make('label', '', form, labelText), field = this.make(choices ? 'select' : 'input', '', label); field.name = key;
        if (choices) for (const [value, text] of choices) { const option = this.make('option', '', field, text); option.value = String(value); }
        else { field.type = 'number'; for (const [attribute, value] of Object.entries(options)) field.setAttribute(attribute, value); }
        const percent = key==='power' || key==='manualProbability';
        field.value = this.planningSettings[key] === null ? '' : String(percent ? this.planningSettings[key] * 100 : this.planningSettings[key]);
        field.addEventListener('change', () => {
          const raw = field.value.trim(), value = key==='plannedSide' ? raw : raw === '' && key==='manualProbability' ? null : Number(raw) / (percent ? 100 : 1);
          try { this.planningSettings = Planning.settings({ ...this.planningSettings, [key]: value }); this.planningError = null; } catch (error) { this.planningError = error.message; }
          this.renderDetails(); this.renderComparison(); this.updateSelection();
          if (this.indirect?.active) this.indirect.updateEstimate();
        });
        return field;
      };
      input('arms', 'Trial arms', [[2,'Two arms'],[1,'One arm against a historical benchmark']]);
      input('plannedSide','Planned treatment',[['head','Arrowhead treatment'],['tail','Arrow-tail treatment']]);
      input('alpha', 'Type I error (α)', null, { min:0.001,max:0.49,step:0.005 });
      input('power', 'Power (%)', null, { min:51,max:99.9,step:1 });
      input('sidedness','Sidedness',[[2,'Two-sided'],[1,'One-sided']]);
      input('manualProbability',this.endpointDefinition().measure==='HR' ? 'Reference event probability by planned analysis (%) · optional' : 'Reference response/event probability (%) · optional',null,{min:0.1,max:99.9,step:0.1});
      if(this.planningSettings.arms===2)input('allocation','Allocation ratio (planned / reference)',null,{min:0.1,max:20,step:0.1});
      if (this.planningError) this.make('p','tm-planning-error',panel,this.planningError);
      const selectedEdge=this.tree.comparisonEdges.find(edge=>edge.comparison_ids.includes(this.activeComparisonId));
      if(selectedEdge && !this.indirect?.active){const d=this.planningDirection(selectedEdge);this.make('p','tm-count-note tm-planning-direction',panel,'Planned: '+this.nodeFor(d.plannedId).label+'. Reference: '+this.nodeFor(d.referenceId).label+'.');}
      this.make('p','tm-count-note',panel,'Reported study rates are used unless you enter a probability.');
      if (this.planningSettings.arms === 1) this.make('p','tm-count-note',panel,'The calculation treats the historical benchmark as fixed.');
    }
    planningDirection(edge, evidence) {
      const {tailId,headId}=evidence || this.edgeEvidence(edge);
      return this.planningSettings.plannedSide==='tail' ? {plannedId:tailId,referenceId:headId} : {plannedId:headId,referenceId:tailId};
    }
    planningFor(edge, evidence) {
      const { tailId, headId, group, comparison } = evidence || this.edgeEvidence(edge);
      const selected = group?.selected || [], selectedIds = new Set(selected.map(row => row.comparison?.analysis?.independent_id).filter(Boolean));
      const conflictIds = new Set(list(group?.excluded).filter(row => (['unresolved_source_conflict', 'unresolved_same_trial_results'].includes(row.reason) || /newer_trial|superseded_less_specific/.test(row.reason))).map(row => row.comparison?.id));
      const safeSource = item => item && !conflictIds.has(item.id) && !item.source_conflict && !item.analysis?.metadata_conflicts?.length;
      const populationRows=group?.tableRows?.filter(row=>row.planning_included===true);
      const sources = (populationRows===undefined?[...selected, ...list(group?.display).filter(row => !selectedIds.has(row.comparison?.analysis?.independent_id))]:populationRows).map(row => row.comparison).filter(safeSource);
      const latest=group?.latest_fallback?.row?.comparison;
      const chosen = latest?[latest].filter(safeSource):sources.length ? sources : populationRows===undefined&&safeSource(comparison) ? [comparison] : [];
      const byStudy = new Map();
      for (const item of chosen) { const id = item.analysis?.cohort?.independent_group_id || item.analysis?.independent_id || item.pmid || item.id; if (!byStudy.has(id)) byStudy.set(id, item); }
      const unique = [...byStudy.values()];
      const {plannedId,referenceId}=this.planningDirection(edge,evidence);
      const pooledEffect = group?.pooled ? plannedId===headId?group.pooled.estimate:1/group.pooled.estimate : null;
      const rows = Planning.tableRows(unique, { ...this.planningSettings, tailId:referenceId, headId:plannedId, measure: this.endpointDefinition().measure, pooledEffect });
      const ns = rows.map(row => (group?.pooled ? row.pooled : row.own)?.n).filter(value => Number.isFinite(value));
      const effect = chosen.length ? group?.pooled?.estimate || (evidence || this.edgeEvidence(edge)).effect?.estimate : null;
      const required = this.endpointDefinition().measure === 'HR' && effect ? Planning.events(plannedId===headId?effect:1/effect, this.planningSettings) : null;
      const label = this.endpointDefinition().measure === 'HR' ? required?.events ? 'E=' + number(required.events) : 'E unavailable' : ns.length ? 'N=' + number(Math.min(...ns)) + (Math.max(...ns) !== Math.min(...ns) ? '–' + number(Math.max(...ns)) : '') : 'N unavailable';
      return { rows, required, label, group, tailId, headId, plannedId, referenceId };
    }
    updatePlanningLabels() {
      this.planningLabels?.remove?.(); this.planningLabels = null;
      // The existing DOM shim does not implement remove; removeChild is equivalent.
      for (const child of [...this.world.children]) if (child.classList?.contains('tm-planning-labels')) this.world.removeChild(child);
      if (!this.planningEnabled || this.tree.overview) return;
      this.planningLabels = this.svgElement('g', { class:'tm-planning-labels' }, this.world);
      for (const edge of this.tree.comparisonEdges) {
        const evidence = this.edgeEvidence(edge); if (!evidence.effect?.valid) continue;
        const plan = this.planningFor(edge, evidence), geometry = this.parallelGeometry.get(edge.id); if (!geometry) continue;
        const scale=this.camera.scale, {x,y}=geometry.midpoint, width=(plan.label.length*7+16)/scale;
        const group=this.svgElement('g', {class:'tm-planning-label','data-comparison-pair':edge.id,role:'button',tabindex:0}, this.planningLabels);
        this.svgElement('rect',{x:x-width/2,y:y+7/scale,width,height:22/scale,rx:3/scale},group);
        this.svgElement('text',{x,y:y+22/scale,'text-anchor':'middle','font-size':12/scale},group,plan.label);
        const eventNote=this.endpointDefinition().measure==='HR'?' · '+(plan.required?.event_basis||plan.required?.reason||'Required events unavailable.'):'';
        this.svgElement('title',{},group,plan.label+eventNote+' · '+(plan.group?.pooled?Charts.modelLabel(plan.group.pooled)+' pooled effect':'Individual-study effect')+' · Select comparison for study-specific planning assumptions.');
        group.addEventListener('click',()=>this.selectParallel(edge.id)); group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();this.selectParallel(edge.id);}});
      }
    }
    renderPlanningTable(edge, evidence) {
      if (!this.planningEnabled) return;
      const plan=this.planningFor(edge,evidence),section=this.make('section','tm-planning-results',this.comparisonBand);
      const survival=this.endpointDefinition().measure==='HR';
      const percentage=value=>Number.isFinite(value)?number(value*100)+'%':'—';
      this.make('h4','',section,'Sample size planning');
      this.make('p','tm-count-note',section,'Planned: '+this.nodeFor(plan.plannedId).label+' · Reference: '+this.nodeFor(plan.referenceId).label);
      const scroll=this.make('div','tm-analysis-table-scroll',section);scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Sample size planning table; scroll horizontally');
      const table=this.make('table','tm-planning-table'+(survival?' tm-planning-survival':''),scroll),head=this.make('thead','',table),header=this.make('tr','',head);
      if(survival){
        for(const label of ['Study','Follow-up / reference assumption','Study HR']){const th=this.make('th','',header,label);th.scope='col';th.rowSpan=2;}
        for(const label of ['Study effect','Pooled effect'+(plan.group?.pooled?' · '+Charts.modelLabel(plan.group.pooled)+' · HR '+effectNumber(plan.plannedId===plan.headId?plan.group.pooled.estimate:1/plan.group.pooled.estimate):'')]){const th=this.make('th','tm-plan-group',header,label);th.scope='colgroup';th.colSpan=3;}
        const quantities=this.make('tr','',head);
        for(let i=0;i<2;i++)for(const label of ['Required events (E)','Event rate for N','Total N']){const th=this.make('th','',quantities,label);th.scope='col';}
      }else for(const label of ['Study','Follow-up / reference assumption','Study effect','N · study effect + study rate','N · pooled effect + study rate'+(plan.group?.pooled?' · '+Charts.modelLabel(plan.group.pooled):'')])this.make('th','',header,label).scope='col';
      const body=this.make('tbody','',table);
      const cellN=(cell,result)=>{this.make('strong','',cell,result?.n?'N='+number(result.n):'—');if(result?.reason)this.make('small','',cell,result.reason);cell.setAttribute('data-value',result?.n??'');};
      const cellPlan=(row,result,basis,assumption)=>{
        const events=this.make('td','tm-plan-events',row);events.setAttribute('data-basis',basis);events.setAttribute('data-value',result?.events??'');
        this.make('strong','',events,result?.events?'E='+number(result.events):'—');if(result?.event_basis)events.title=result.event_basis;
        const rate=this.make('td','tm-plan-rate',row);rate.setAttribute('data-basis',basis);rate.setAttribute('data-value',result?.event_rate??'');
        if(basis==='study'){
          const arms=[['reference',assumption.reported_reference_probability,assumption.reported_reference_source,plan.referenceId],['planned',assumption.reported_target_probability,assumption.reported_target_source,plan.plannedId]].filter(([,probability])=>Number.isFinite(probability));
          if(arms.length){
            const reported=this.make('div','tm-reported-event-rows',rate);this.make('small','tm-reported-event-heading',reported,'Reported events');
            for(const [role,probability,source,id] of arms){
              const arm=this.make('div','tm-reported-event-row',reported);arm.setAttribute('data-arm-role',role);arm.setAttribute('data-event-probability',probability);arm.setAttribute('data-arm-id',id);
              this.make('span','tm-event-arm-name',arm,this.nodeFor(id).label);this.make('strong','tm-event-arm-probability',arm,percentage(probability));
              if(source?.kind==='survival_probability')arm.title=this.endpointDefinition().abbreviation+' '+percentage(source.probability)+(source.time_months?' at '+number(source.time_months)+' months':'')+' → events '+percentage(probability);
            }
          }
        }
        const denominator=this.make('div','tm-rate-for-n',rate);this.make('strong','',denominator,percentage(result?.event_rate));
        if(Number.isFinite(result?.event_rate)){
          this.make('small','',denominator,'Used for N · '+(this.planningSettings.arms===2?'expected across both arms':'historical-null / alternative mean'));
          const details=this.make('details','tm-rate-details',rate);this.make('summary','',details,'Rate calculation');
          if(Number.isFinite(result.p0))this.make('p','',details,this.nodeFor(plan.referenceId).label+' (reference): '+percentage(result.p0));
          if(Number.isFinite(result.p1))this.make('p','',details,this.nodeFor(plan.plannedId).label+' (planned): '+percentage(result.p1)+(result.derived_probability?' · HR-implied':''));
          this.make('p','',details,'Probability used for N: '+(result.event_rate*100).toPrecision(10)+'%.');
          if(result.event_rate_basis)this.make('p','',details,String(result.event_rate_basis).replace(/_/g,' '));
        }
        const n=this.make('td','tm-plan-n',row);n.setAttribute('data-basis',basis);cellN(n,result);
      };
      for(const row of plan.rows){
        const tr=this.make('tr','',body);tr.setAttribute('data-comparison-id',row.comparison.id);tr.setAttribute('data-assumption-id',row.assumption.id);
        const study=this.make('td','',tr,row.comparison.study_name||'Publication');this.make('br','',study);this.sourceLink(study,row.comparison);
        const a=row.assumption,context=this.make('td','tm-plan-assumption',tr);
        this.make('strong','',context,a.time_months?number(a.time_months)+' months':a.cutoff||(a.id==='manual'?'Planned analysis':'Time not reported'));
        const reference=row.own.p0??row.pooled?.p0;
        if(Number.isFinite(reference))this.make('small','',context,(a.provenance==='derived_reference_probability'?'Derived reference ':a.id==='manual'?'Entered reference ':'Reference ')+(survival?'event probability: ':'response/event probability: ')+percentage(reference));
        else if(a.kind==='overall_event_fraction')this.make('small','',context,'Reported overall event proportion: '+percentage(a.probability));
        else this.make('small','',context,survival?'Event probability unavailable':'Reference probability unavailable');
        const reported=[['reference',a.reported_reference_probability,a.reported_reference_source,plan.referenceId],['planned',a.reported_target_probability,a.reported_target_source,plan.plannedId]].filter(([,rate])=>Number.isFinite(rate));
        if(reported.length){const details=this.make('details','tm-reported-rates',context);this.make('summary','',details,'Reported arm rates');
          for(const [role,rate,source,id] of reported){const survivalRate=source?.kind==='survival_probability';this.make('p','',details,this.nodeFor(id).label+' ('+role+'): '+(survivalRate?this.endpointDefinition().abbreviation+' '+percentage(source.probability)+'; events '+percentage(rate):'response/events '+percentage(rate)));}}
        this.make('td','tm-plan-effect',tr,this.endpointDefinition().measure+' '+effectNumber(row.effect));
        if(survival){cellPlan(tr,row.own,'study',a);cellPlan(tr,row.pooled,'pooled',a);}
        else{cellN(this.make('td','',tr),row.own);cellN(this.make('td','',tr),row.pooled);}
      }
      if(!plan.rows.length)this.make('p','tm-muted',section,'No source estimate is available for planning.');
      if(survival){
        this.make('p','tm-count-note',section,'N = ceiling(E ÷ event probability), using unrounded probabilities. The event rate for N is the expected proportion with the endpoint event, not the event-free survival rate.');
        this.make('p','tm-count-note',section,this.planningSettings.arms===2?'Both effect columns use the same reference probability. Each HR can imply a different planned-arm rate; the event rate for N is weighted by the selected allocation.':'One-arm E is on the historical-null scale. Its conversion to N uses the mean of the historical and alternative event probabilities.');
      }
      this.make('p','tm-count-note',section,'Effects compare the planned treatment with the reference. N is planned enrollment, not the observed study sample size.');
      const methods=[...new Set(plan.rows.flatMap(row=>[row.own?.method,row.pooled?.method]).filter(Boolean))];if(methods.length)this.make('p','tm-count-note',section,methods.join(' · ')+(survival?'. Fixed-time survival scenarios assume proportional hazards and complete follow-up to that time.':'.'));
    }
    renderCategoryLegend() {
      this.categoryLegend.replaceChildren(); this.categoryLegend.hidden = false;
      this.make('p', 'tm-category-legend-title', this.categoryLegend, this.tree.overview?'Treatment classes · named agents':'Treatment classes');
      const legend = this.make('ul', '', this.categoryLegend);
      const categories=new Map(),add=info=>{if(!categories.has(info.id))categories.set(info.id,{...info,count:0});categories.get(info.id).count++;};
      if(this.tree.overview)for(const agent of this.model.agents)add(categoryInfo(agent));
      else for(const node of [...this.tree.nodes,...this.tree.parallelNodes]){
        if(node.type==='control'){add({id:'controls',label:'Controls',class_id:'controls',order:categoryDefinitions.length});continue;}
        // A descendant card labels only its additions; an opposing/root regimen
        // labels all components. Count a card once per displayed class.
        const parts=this.drugNameParts(node,true).parts,classes=new Map();
        for(const part of parts){const info=categoryInfo(this.model.byAgent.get(part.id)||{});classes.set(info.id,info);}
        if(!classes.size){const info=categoryInfo(node);classes.set(info.id,info);}
        for(const info of classes.values())add(info);
      }
      for (const sector of [...categories.values()].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id))) { const item = this.make('li', '', legend); item.dataset.treatmentClass = sector.class_id;if(!this.tree.overview)item.dataset.nodeCount=String(sector.count); this.make('i', '', item).setAttribute('aria-hidden', 'true'); this.make('span', '', item, sector.label); this.make('strong', '', item, number(sector.count)); }
    }
    renderGraph() {
      this.world.replaceChildren(); this.nodeElements.clear(); this.overviewLabels = new Map(); this.parallelLinks = new Map(); this.parallelLinkTitles = new Map();
      if (this.tree.overview) {
        const sectors = this.svgElement('g', { class: 'tm-category-sectors', 'aria-label': 'Treatment class sectors' }, this.world);
        for (const sector of this.tree.sectors) {
          const group = this.svgElement('g', { 'data-category-id': sector.id, 'data-treatment-class': sector.class_id }, sectors);
          for (const segment of sector.segments) {
            const path = this.svgElement('path', { class: 'tm-category-sector', 'data-subgroup-id': segment.id,
              d: annularSectorPath(sector.inner_radius, sector.outer_radius, segment.start, segment.end) }, group);
            const label = segment.id === 'unclassified' && sector.segments.length === 1 ? sector.label : sector.label + ' · ' + segment.label;
            this.svgElement('title', {}, path, `${label} · ${number(segment.agent_count)} named agent${segment.agent_count === 1 ? '' : 's'}`);
          }
        }
      }
      const edgeGroup = this.svgElement('g', { class: 'tm-edges', 'aria-hidden': 'true' }, this.world);
      for (const [childId, parentId] of this.tree.parents) {
        if (this.tree.addOnEdges.some((edge) => edge.root_id === parentId && edge.opponent_id === childId)) continue;
        const parent = this.tree.positions.get(parentId), child = this.tree.positions.get(childId);
        let path;
        if (this.tree.overview) path = `M${parent.x},${parent.y} L${child.x},${child.y}`;
        else { const start = parent.x + parent.width, spine = start + 24; path = `M${start},${parent.y} H${spine} V${child.y} H${child.x - 4}`; }
        const evidence = this.model.relationships.find((edge) => edge.parent_id === parentId && edge.child_id === childId);
        const element = this.svgElement('path', { d: path, class: 'tm-branch-edge' }, edgeGroup);
        const childNode = this.model.byId.get(childId), publications = publicationCount(childNode);
        this.svgElement('title', {}, element, `Component inclusion: ${childNode.label} contains ${this.model.byId.get(parentId).label} plus added agents. Child regimen: ${number(publications)} supporting publication${publications === 1 ? '' : 's'}. This plain line has no comparison direction.`);
      }
      if (this.tree.overview) {
        this.svgElement('circle', { cx: 0, cy: 0, r: 250, class: 'tm-inner-ring' }, this.world);
      }
      this.renderParallelLinks();
      const nodesGroup = this.svgElement('g', { class: 'tm-nodes' }, this.world);
      for (const node of [...this.tree.nodes, ...this.tree.parallelNodes]) {
        const point = this.tree.positions.get(node.id), evidence = node.type === 'control' ? 'Neutral comparison arm' : `${studyLabel(node)}. ${countLabel(node)}`;
        const direct = this.tree.overview && this.directParallelIds.has(node.id);
        const center = !this.tree.overview && node.id === this.branchId;
        const comparisonHint = direct ? ' Direct parallel-arm comparison available.' : '';
        const group = this.svgElement('g', { class: 'tm-node ' + (this.tree.overview ? 'tm-radial-node' : 'tm-tree-node') + (center ? ' tm-branch-center' : '') + (point.parallel ? ' tm-parallel-node' : '') + (node.type === 'control' ? ' tm-control-node' : '') + (direct ? ' tm-direct-comparison-node' : ''), transform: `translate(${point.x},${point.y})`, tabindex: 0, role: 'button', 'aria-label': `${node.label}.${center ? ' Branch center.' : ''} ${evidence}.${comparisonHint} Select for evidence.`, 'data-node-id': node.id, 'data-category-id': point.group_id || categoryInfo(node).id, 'data-treatment-class': node.type === 'drug' || node.type === 'control' ? mapColor(node,this.tree.overview) : 'combination', ...(this.tree.overview ? { 'data-direct-comparison': direct, 'data-subgroup-id': point.subgroup_id } : {}) }, nodesGroup);
        this.svgElement('title', {}, group, node.label + ' · ' + evidence + comparisonHint);
        if (this.tree.overview) {
          const size = direct ? 2 : 1;
          this.svgElement('circle', { r: direct ? 18 : 13, class: 'tm-hit-target' }, group);
          if (node.type === 'drug') this.svgElement('circle', { r: 5.5 * size, class: 'tm-agent-dot' }, group);
          else { this.svgElement('circle', { r: 6 * size, class: 'tm-combination-dot' }, group); node.components.slice(0, 5).forEach((id, index) => { const angle = index * Math.PI * 2 / Math.min(5, node.components.length), agent = this.model.byAgent.get(id); this.svgElement('circle', { cx: Math.cos(angle) * 4 * size, cy: Math.sin(angle) * 4 * size, r: 2.4 * size, class: 'tm-component-dot', 'data-treatment-class': mapColor(agent,true) }, group); }); }
          const right = Math.cos(point.angle) >= 0;
          this.overviewLabels.set(node.id, this.svgDrugNames(group,node,{ x: right ? 14 : -14, y: 4, 'text-anchor': right ? 'start' : 'end', class: 'tm-overview-label' },{maxChars:28})[0]);
        } else this.drawCard(group, node, point);
        group.addEventListener('click', (event) => { if (this.suppressClick) { event.preventDefault(); return; } this.activateNode(node.id); });
        group.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); this.activateNode(node.id); }
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { const nextId = event.key === 'ArrowRight' ? point.parallel ? point.anchor_id : this.tree.children.get(node.id)?.[0]?.id : this.tree.parents.get(node.id) || (node.id === this.branchId ? this.tree.parallelNodes.find((peer) => this.tree.positions.get(peer.id).anchor_id === this.branchId)?.id : null); if (nextId) { event.preventDefault(); event.stopPropagation(); this.nodeElements.get(nextId)?.focus(); this.reveal(nextId); } }
        });
        group.addEventListener('focus', () => this.reveal(node.id));
        this.nodeElements.set(node.id, group);
      }
    }
    renderParallelLinks() {
      const group = this.svgElement('g', { class: 'tm-parallel-links' }, this.world);
      this.parallelGeometry = new Map();
      for (const edge of this.tree.comparisonEdges) {
        const geometry = this.tree.overview ? radialComparisonGeometry(this.model, this.tree, edge, this.camera.scale) : null;
        if (geometry) this.parallelGeometry.set(edge.id, geometry);
        const path = geometry?.path || '';
        const label = `${this.nodeFor(edge.root_id).label} versus ${this.nodeFor(edge.opponent_id).label}: ${number(edge.publication_ids.length)} supporting publications; ${number(edge.comparison_ids.length)} source estimates. Select a study and outcome.`;
        const link = this.svgElement('g', { class: 'tm-parallel-link tm-comparison-' + edge.kind + (this.tree.overview ? ' tm-radial-comparison-link' : ''), tabindex: 0, role: 'button', 'aria-label': label, 'data-root-id': edge.root_id, 'data-opponent-id': edge.opponent_id, 'data-comparison-pair': edge.id, 'data-comparison-kind': edge.kind }, group);
        const title = this.svgElement('title', {}, link);
        const hit = this.svgElement('path', { d: path, class: 'tm-parallel-hit' }, link);
        const line = this.svgElement('path', { d: path, class: 'tm-parallel-edge' }, link);
        this.parallelLinkTitles.set(edge.id, { title, path: line, hit });
        link.addEventListener('click', () => { if (!this.suppressClick) this.selectParallel(edge.id); });
        link.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); this.selectParallel(edge.id); } });
        link.addEventListener('focus', () => this.reveal(edge.opponent_id));
        this.parallelLinks.set(edge.id, link);
      }
    }
    activateNode(id) { return this.indirect?.active ? this.indirect.choose(id) : this.select(id); }
    selectParallel(id) {
      if (this.indirect?.active) return this;
      const edge = this.tree.comparisonEdges.find((item) => item.id === id); if (!edge) return this;
      this.analysisTab = 'comparison';
      this.select(edge.root_id, { comparisonPairId: edge.id });
      this.live.textContent = this.parallelLinkTitles.get(id)?.title.textContent || this.live.textContent;
      return this;
    }
    drawCard(group, node, point) {
      this.svgElement('rect', { x: 0, y: -point.height / 2, width: point.width, height: point.height, rx: 10, class: 'tm-card' }, group);
      this.svgElement('rect', { x: 0, y: -point.height / 2 + 10, width: 3, height: point.height - 20, rx: 1.5, class: 'tm-card-accent' }, group);
      const parentId = this.tree.parents.get(node.id);
      if (parentId) {
        // Follow this branch's order even when the registry sorts the same
        // combination differently or the user re-roots it at another agent.
        const steps = [];
        for (let id=parentId; id; id=this.tree.parents.get(id))
          steps.unshift(branchNodeLabel(this.model, this.tree, id));
        const context = this.svgElement('text', {x:15, y:-27, class:'tm-card-regimen'}, group, steps.join(' '));
        const available = point.width - 30;
        if (context.getComputedTextLength?.() > available) {
          context.setAttribute('textLength', available);
          context.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        }
      }
      this.svgDrugNames(group,node,{x:15,y:parentId?-9:-16,class:'tm-card-label'},{relative:true,maxChars:29,maxLines:2});
      this.svgDrugNames(group,node,{x:12,y:parentId?0:-7,class:'tm-card-compact'},{relative:true,maxChars:20});
      if (node.type === 'control') {
        this.svgElement('text', { x: 15, y: 24, class: 'tm-card-count' }, group, 'Neutral comparison arm');
        this.svgElement('text', { x: 12, y: 25, class: 'tm-card-compact-count' }, group, 'Control arm');
        return;
      }
      this.svgElement('text', { x: 12, y: 25, class: 'tm-card-compact-count' }, group, count(node).identified_studies ? countLabel(node) : publicationCount(node) ? `${studyLabel(node, true)} · ${countLabel(node)}` : 'No linked evidence');
      const linkagePending = !count(node).identified_studies && publicationCount(node), evidenceText = linkagePending ? studyLabel(node).split(';')[0] : studyLabel(node, true);
      this.svgElement('text', { x: 15, y: 24, class: 'tm-card-count' + (linkagePending ? ' tm-linkage-pending' : '') }, group, `${evidenceText} · ${countLabel(node)}`);
    }
    select(id, options) {
      this.selectedId = this.nodeFor(id) ? id : null;
      if(this.exactNodeBrowse&&!options?.preserveMode)this.selectionMode=options?.comparisonPairId||this.nodeFor(this.selectedId)?.type==='control'?'comparison':'node';
      const external = this.tree.parallelNodes.some((node) => node.id === this.selectedId);
      const incident = external ? this.tree.comparisonEdges.filter((edge) => edge.opponent_id === this.selectedId || edge.root_id === this.selectedId) : [];
      this.selectedComparisonPairId = options?.comparisonPairId || (incident.length === 1 ? incident[0].id : null);
      const choices = this.comparisonChoices();
      const validActive = choices.some((item) => item.id === this.activeComparisonId);
      if (!validActive) this.activeComparisonExplicit = false;
      if (!validActive || (!this.activeComparisonExplicit && this.selectedId === this.branchId && !this.selectedComparisonPairId)) {
        const parallelIds = new Set(this.tree.parallelEdges.flatMap((edge) => edge.comparison_ids));
        const preferred = this.selectedId === this.branchId && !this.selectedComparisonPairId ? choices.find((item) => parallelIds.has(item.id)) : null;
        this.activeComparisonId = (preferred || choices[0])?.id || null;
      }
      const remembered = this.selectedComparisonByPair.get(this.selectedComparisonPairId + '|' + this.selectedEndpoint);
      if (remembered && choices.some((item) => item.id === remembered)) this.activeComparisonId = remembered;
      const defaultPair = this.tree.comparisonEdges.find(edge => edge.comparison_ids.includes(this.activeComparisonId));
      if (defaultPair && !this.selectedComparisonByPair.has(defaultPair.id + '|' + this.selectedEndpoint)) {
        const source = this.model.comparisons.find(item => item.id === this.activeComparisonId);
        this.activeComparisonId = this.latestSupportedComparison(defaultPair, source)?.id || this.activeComparisonId;
      }
      if (options?.comparisonPairId && this.activeComparisonId) this.activeComparisonExplicit = true;
      if (this.isRadialBranch() && !this.advanced.pending && this.selectedComparisonPairId &&
          !this.radialDirectComparators(this.radialLeftId).some(row => row.edge.id === this.selectedComparisonPairId)) {
        this.selectedComparisonPairId = null; this.activeComparisonId = null; this.activeComparisonExplicit = false;
        this.selectionMode = 'node';
      }
      this.renderDetails(); this.renderComparison(); this.renderNodeStudies(); this.updateSelection();
      if (options?.announce !== false && this.selectedId) { const node = this.nodeFor(this.selectedId); this.live.textContent = `${node.label} selected. ${node.type === 'control' ? 'Neutral comparison arm.' : `${studyLabel(node)}. ${countLabel(node)}.`} Evidence is below the map on narrow screens.`; }
      return this;
    }
    renderNodeStudies() {
      if(this.indirect?.active||!this.exactNodeBrowse){this.nodeStudies.hidden=true;return;}
      const selected=this.nodeFor(this.selectedId),node=this.model.byId.get(selected?.id);
      this.nodeStudies.hidden=this.selectionMode!=='node'||!node;
      if(this.nodeStudies.hidden)return;
      if(this.nodeStudiesId===node.id)return;
      this.nodeStudiesController?.destroy();
      const ids=new Set(list(node.study_membership_ids)),memberships=list(this.model.graph.study_memberships).filter(row=>row.node_id===node.id&&ids.has(row.id));
      this.nodeStudiesController=this.options.renderNodeStudies(this.nodeStudies,node,memberships);
      this.nodeStudiesId=node.id;
    }
    comparisonChoices() {
      if (!this.selectedId) return [];
      const matching = this.model.comparisons.filter((item) => Effects.comparisonMatchesEndpoint(item, this.selectedEndpoint) && Analysis.matchesScope(item,this.studyScope));
      const pair = this.tree.comparisonEdges.find((edge) => edge.id === this.selectedComparisonPairId);
      if (pair) return matching.filter((item) => pair.comparison_ids.includes(item.id)).sort(byComparison);
      if (this.tree.overview) return [];
      if (this.tree.parallelNodes.some((node) => node.id === this.selectedId)) {
        const ids = new Set(this.tree.comparisonEdges.filter((edge) => edge.opponent_id === this.selectedId || edge.root_id === this.selectedId).flatMap((edge) => edge.comparison_ids));
        return matching.filter((item) => ids.has(item.id)).sort(byComparison);
      }
      const selected = this.nodeFor(this.selectedId), memberIds = new Set(list(selected.comparison_ids));
      return matching.filter((item) => memberIds.has(item.id) || item.intervention.node_id === this.selectedId || item.comparator.node_id === this.selectedId).sort(byComparison);
    }
    updateSelection() {
      if (this.isRadialBranch()) { this.refreshRadialComparators(); return; }
      const comparison = this.model.comparisons.find((item) => item.id === this.activeComparisonId);
      const activePair = this.tree.comparisonEdges.find((edge) => edge.comparison_ids.includes(this.activeComparisonId));
      for (const [id, element] of this.nodeElements) {
        element.setAttribute('aria-pressed', String(id === this.selectedId));
        element.classList.toggle('tm-selected', id === this.selectedId);
        element.classList.toggle('tm-comparison-endpoint', id === comparison?.intervention.node_id || id === comparison?.comparator.node_id || id === activePair?.opponent_id);
        const muted=this.advanced.active&&this.advanced.nodeIds&&!this.advanced.nodeIds.has(id);
        element.classList.toggle('tm-filter-muted',!!muted);
        element.setAttribute('aria-description',muted?'No matching evidence for the selected clinical filters.':'');
      }
      for (const [id, element] of this.parallelLinks) {
        const active = id === activePair?.id, metadata = this.parallelLinkTitles.get(id), edge = this.tree.comparisonEdges.find((item) => item.id === id);
        const evidence=this.edgeEvidence(edge),{comparison:source,effect,style,group}=evidence;
        const filteredOut=this.advanced.active&&!this.edgeChoices(edge).some(item=>this.advanced.matches?.[item.id]?.matched);
        // Preserve an existing arrow's geometry when its clinical cohort is
        // filtered out. Its original estimate never enters the filtered analysis.
        const original=filteredOut?this.edgeEvidence(edge,{active:false,matches:{}}):evidence;
        const {headId,tailId}=original.effect?.valid?original:evidence;
        if (!this.tree.overview) {
          const portColor = filteredOut ? 'neutral' : style.state;
          const dashed = effect?.ciExcludesNull === false;
          const portKey = tailId + '|' + portColor + '|' + dashed;
          if (metadata.portKey !== portKey) {
            const geometry = parallelLinkGeometry(this.tree,edge,tailId,portColor,dashed);
            this.parallelGeometry.set(edge.id,geometry);
            metadata.path.setAttribute('d',geometry.path);
            metadata.hit.setAttribute('d',geometry.path);
            metadata.portKey = portKey;
          }
        }
        element.classList.toggle('tm-filter-muted',!!filteredOut);
        element.classList.toggle('tm-active-comparison', active); element.setAttribute('aria-pressed', String(active));
        element.style.setProperty('--tm-effect-color', style.color);
        for (const [key, value] of Object.entries({ 'data-tail-id': tailId, 'data-head-id': headId, 'data-effect-state': style.state, 'data-endpoint-key': this.selectedEndpoint, 'data-comparison-id': source?.id || '', 'data-estimate': effect?.valid ? effect.estimate : '', 'data-reversed': !!effect?.reversed })) element.setAttribute(key, value);
        const ciState=effect?.ciExcludesNull;
        element.setAttribute('data-ci-excludes-null',ciState===true?'true':ciState===false?'false':'unknown');
        metadata.path.setAttribute('stroke-dasharray',ciState===false?'6 4':'none');
        const arrow = original.effect?.valid ? `url(#${this.id}-arrow-${style.state})` : 'none';
        metadata.path.setAttribute('marker-start', headId === edge.opponent_id ? arrow : 'none');
        metadata.path.setAttribute('marker-end', headId === edge.root_id ? arrow : 'none');
        const label = filteredOut ? `${this.nodeFor(headId).label} versus ${this.nodeFor(tailId).label}. No matching ${this.endpointDefinition().label} evidence for the selected filters.` : source && effect?.valid ? `${this.nodeFor(headId).label} versus ${this.nodeFor(tailId).label}. ${this.endpointDefinition().label}. ${directedLabel(effect)}. Tail fares ${effect.direction === 'neutral' ? 'neither better nor worse by the point estimate' : effect.direction}. ${group?.pooled ? Charts.modelLabel(group.pooled)+' meta-analysis of '+group.pooled.k+' independent cohorts. '+group.label : 'Individual study, PMID '+source.pmid}. ${ciState===true?'Solid: confidence interval excludes 0 on the log scale.':ciState===false?'Dashed: confidence interval includes 0 on the log scale.':'Solid: a valid confidence interval is unavailable.'} Select a study and outcome.` : `${this.nodeFor(edge.opponent_id).label} versus ${this.nodeFor(edge.root_id).label}. No matching ${this.endpointDefinition().label} estimate; no comparison arrow. Select another endpoint. Custom regimen counts remain unchanged.`;
        metadata.title.textContent = effect?.valid && !filteredOut
          ? `${this.nodeFor(headId).label} vs ${this.nodeFor(tailId).label} ${effect.measure}=${effectNumber(effect.estimate)}`
          : 'Effect estimate unavailable';
        element.setAttribute('aria-label', label);
      }
      this.updatePlanningLabels();
      if (this.tree.overview) this.updateOverviewLabels();
      if (this.indirect?.active) this.indirect.decorate();
    }
    renderDetails() {
      this.details.replaceChildren();
      this.radialTools.replaceChildren();
      if (this.isRadialBranch()) {
        this.renderEndpointChoice(this.radialTools);
        this.renderPlanningControls(this.radialTools);
        this.renderStudyScope(this.radialTools);
        if (this.indirect?.active) this.indirect.renderTargetChoice(this.details);
        return;
      }
      if (this.indirect?.active) {
        this.renderEndpointChoice();
        this.indirect.renderTargetChoice(this.details);
        return;
      }
      const node = this.nodeFor(this.selectedId);
      if (!node) { this.make('h3', '', this.details, 'Select a treatment'); return; }
      this.make('p', 'tm-eyebrow', this.details, node.type === 'control' ? 'CONTROL ARM' : node.type === 'drug' ? 'SELECTED AGENT' : 'COMPLETE COMBINATION');
      this.make('h3', 'tm-detail-title', this.details, node.label);
      if (node.type === 'control') { this.make('p', 'tm-count-note', this.details, 'Neutral comparison arm. Study and participant totals are not aggregated for this control.'); this.renderBranchControls(); return; }
      const badges = this.make('div', 'tm-components', this.details);
      for (const id of node.components) { const agent = this.model.byAgent.get(id), badge = this.make('span', 'tm-component-badge', badges, agent?.label || id); badge.dataset.treatmentClass = agent?.class_id || 'other'; }
      const summary = count(node), stats = this.make('div', 'tm-detail-stats', this.details);
      const studies = Number(summary.identified_studies || 0), publications = publicationCount(node), studyStat = this.make('div', '', stats);
      this.make('strong', '', studyStat, studies ? number(studies) : publications ? number(publications) : '—'); this.make('span', '', studyStat, studies ? (studies === 1 ? 'identified study' : 'identified studies') : publications ? (publications === 1 ? 'supporting publication' : 'supporting publications') : node.type === 'drug' ? 'No monotherapy studies' : 'No linked evidence');
      const nStat = this.make('div', '', stats);
      this.make('strong', '', nStat, countLabel(node));
      const knownStudies = summary.known_n_studies;
      let countSource = 'Participants';
      if (summary.status === 'unresolved') countSource = 'Participant count unavailable';
      else if (summary.status === 'provisional') countSource = 'N from one publication';
      else if (Number.isInteger(knownStudies) && knownStudies > 0 && knownStudies <= studies) {
        countSource = `N from ${number(knownStudies)} ${knownStudies === 1 ? 'study' : 'studies'}`;
      }
      this.make('span', '', nStat, countSource);
      if (!studies && publications) this.make('p', 'tm-count-note', this.details, 'Study linkage pending.');
      if (this.tree.overview) {
        this.button(this.details, 'Open this branch →', () => { const pair = this.selectedComparisonPairId; this.setBranch(node.id); if (pair) this.selectParallel(pair); }, 'tm-button tm-open-branch');
        this.renderEndpointChoice();
        this.renderStudyScope();
        return;
      }
      if(!Array.isArray(this.model.graph.study_memberships)&&[...this.model.contributions.values()].some(item=>list(item.node_ids).includes(node.id)&&item.inclusive_or_count))this.make('p','tm-count-note tm-or-count-note',this.details,'Includes the full cohort N for alternative treatment assignments (OR). These participants are also credited to the alternative agents; exact drug allocation is unknown.');
      this.make('p', 'tm-count-note', this.details, node.type === 'drug' ? 'Agent counts and studies refer to exact monotherapy arms.' : 'Counts and studies refer to this complete concurrent combination.');
      if (node.first_publication) this.make('p', 'tm-count-note', this.details, 'First publication in this database: ' + node.first_publication);
      this.renderBranchControls();
    }
    outcomeLabel(value) {
      const charts = this.win.MetaSampleSizeCharts;
      if (charts?.endpointOptionLabel) { const families = { ...charts.survivalEndpointLabels, ...charts.responseEndpointLabels }, family = Object.keys(families).find((key) => families[key] === value); if (family) return charts.endpointOptionLabel(family); }
      return value || 'Reported outcome';
    }
    renderEndpointChoice(parent = this.details) {
      const endpointField = this.make('section', 'tm-endpoint-field', parent), endpointLabel = this.make('label', '', endpointField, 'Endpoint');
      endpointLabel.htmlFor = this.id + '-endpoint'; this.endpointSelector = this.make('select', '', endpointField); this.endpointSelector.id = endpointLabel.htmlFor;
      const coreIds = new Set(this.tree.nodes.map((item) => item.id)), pairIds = new Set(this.tree.comparisonEdges.flatMap((edge) => edge.comparison_ids));
      const sources = this.model.comparisons.filter((item) => this.tree.overview ? pairIds.has(item.id) : coreIds.has(item.intervention.node_id) || coreIds.has(item.comparator.node_id) || pairIds.has(item.id));
      const networkGraph=this.indirect?.graph || this.model.graph;
      const endpoints = Effects.availableEndpointOptions(this.indirect?.active
        ? [...list(networkGraph.comparisons), ...list(networkGraph.network_direct_evidence)] : sources);
      if (!endpoints.some((item) => item.key === this.selectedEndpoint)) endpoints.push({ ...this.endpointDefinition(), count: 0, disabled: false });
      this.availableEndpoints=endpoints;
      for (const endpoint of endpoints) { const option = this.make('option', '', this.endpointSelector, endpoint.label + (endpoint.count ? '' : ' — no estimates')); option.value = endpoint.key; option.disabled = endpoint.disabled && endpoint.key !== this.selectedEndpoint; }
      this.endpointSelector.value = this.selectedEndpoint;
      this.endpointSelector.addEventListener('change', () => this.setEndpoint(this.endpointSelector.value));
    }
    renderBranchControls() {
      this.renderEndpointChoice();
      this.renderStudyScope();
      this.renderPlanningControls();
    }
    safeLink(parent, text, url) { if (!/^https?:\/\//i.test(String(url))) return this.make('span', '', parent, text); const anchor = this.make('a', '', parent, text); anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; return anchor; }
    sourceLink(parent, record) { if (/^\d+$/.test(String(record.pmid || ''))) return this.safeLink(parent, 'PMID ' + record.pmid, `https://pubmed.ncbi.nlm.nih.gov/${record.pmid}/`); if (record.source_url) return this.safeLink(parent, 'Source publication', record.source_url); return this.make('span', '', parent, 'Source record retained'); }
    renderInclusionTable(pair,evidence) {
      const rows=evidence?.analysis?.tableRows;
      if(!rows?.length)return;
      const section=this.make('section','tm-inclusion-results',this.comparisonBand),heading=this.make('div','tm-inclusion-heading',section);
      this.make('h4','',heading,'Studies and cohorts');
      const ids=rows.map(row=>row.id),changed=ids.some(id=>Object.hasOwn(this.inclusionOverrides,id));
      const reset=this.button(heading,'Reset inclusion',()=>this.resetInclusions(ids),'tm-text-button');reset.disabled=!changed;
      this.make('p','tm-count-note',section,'Overall results are selected first. Subgroups remain listed; matching advanced filters can replace the overall result.');
      this.make('p','tm-count-note',section,'Effect direction: '+this.nodeFor(evidence.headId).label+' versus '+this.nodeFor(evidence.tailId).label+'. Included studies determine the estimate above.');
      const scroll=this.make('div','tm-analysis-table-scroll',section);scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Studies and cohorts eligible for this comparison; scroll horizontally');
      const table=this.make('table','tm-analysis-table tm-inclusion-table',scroll),thead=this.make('thead','',table),header=this.make('tr','',thead);
      for(const label of ['Include','Study','PMID','Published year','Cohort / population','Sample size','Effect size (CI)'])this.make('th','',header,label).scope='col';
      const body=this.make('tbody','',table),studyKey=row=>String((row.comparison||row.source)?.pmid||'record:'+row.id),studyOrder=new Map();
      for(const row of rows)if(!studyOrder.has(studyKey(row)))studyOrder.set(studyKey(row),studyOrder.size);
      const ordered=[...rows].sort((a,b)=>studyOrder.get(studyKey(a))-studyOrder.get(studyKey(b))||Number((a.cohort||a.comparison?.analysis?.cohort)?.is_subgroup)-Number((b.cohort||b.comparison?.analysis?.cohort)?.is_subgroup));
      const studyRows=new Map();for(const row of ordered)studyRows.set(studyKey(row),(studyRows.get(studyKey(row))||0)+1);
      const shownStudies=new Set();
      for(const row of ordered){
        const source=row.comparison||row.source,cohort=row.cohort||source?.analysis?.cohort||{},selected=row.population_selected??row.included;
        const namedStudy=source.study_name||row.study_name,author=source.first_author||source.author,studyLabel=namedStudy&&!/^Cohort reported in PMID\b/i.test(namedStudy)?namedStudy:source.title||(author?String(author).replace(/\s+et al\.?$/i,'')+' et al.':'Study');
        const tr=this.make('tr',selected?'tm-cohort-included':'tm-cohort-excluded',body);
        for(const [key,value]of Object.entries({'comparison-id':row.id,'pmid':source.pmid||'','cohort-id':cohort.id||'','included':!!row.included,'displayed-pool':!!row.included,'population-selected':!!selected,'selection-reason':row.selection_reason||''}))tr.setAttribute('data-'+key,value);
        const control=this.make('td','tm-inclusion-control',tr),input=this.make('input','tm-inclusion-checkbox',control);input.type='checkbox';input.checked=!!selected&&row.selection_reason!=='missing_supported_sample_size';input.disabled=row.selectable===false;
        input.setAttribute('aria-label','Include '+(studyLabel==='Study'?'PMID '+source.pmid:studyLabel)+' · '+(cohort.label||source.population||'Reported population'));
        input.addEventListener('change',()=>this.setInclusion(row.id,input.checked));
        const detail=row.selection_detail||row.detail||String(row.selection_reason||'').replace(/_/g,' ');
        const labels={missing_supported_sample_size:'N unavailable',represented_by_overall:'Overall used',represented_by_aggregate:'Combined cohort used',aggregate_replaced_by_cohorts:'Separate cohorts used',alternative_subgroup:'Another cohort selected',outside_advanced_filters:'Filtered out',outside_study_scope:'Outside design scope',superseded_same_trial:'Another result selected',manually_excluded:'Not included',unavailable_valid_precision:'CI unavailable',unresolved_source_conflict:'Review needed',unresolved_same_trial_results:'Review needed',incompatible_or_unclassified_context:'Context needs review',incompatible_effect_quantity:'Incompatible effect',unverified_study_independence:'Linkage needs review',newer_trial_report_requires_scope_review:'Review needed',superseded_less_specific_trial_result:'Later result used'};
        const latestFallback=evidence.group?.latest_fallback?.row?.id===row.id;
        const status=this.make('small','tm-inclusion-status',control,latestFallback?'Latest result'+(row.pooling_n===null?' · N unavailable':''):row.selection_reason==='missing_supported_sample_size'?'N unavailable':row.included?'Included':selected?'Selected · '+(labels[row.selection_reason]||'not pooled'):labels[row.selection_reason]||'Not included');
        status.title=detail;input.title=detail;
        if(row.selection_reason==='incompatible_effect_quantity')this.make('small','tm-inclusion-status',control,detail);
        if(!shownStudies.has(studyKey(row))){
          shownStudies.add(studyKey(row));const span=studyRows.get(studyKey(row)),study=this.make('td','tm-cohort-study',tr);study.rowSpan=span;this.make('strong','',study,studyLabel);
          const pmid=this.make('td','tm-cohort-pmid',tr);pmid.rowSpan=span;if(/^\d+$/.test(String(source.pmid||'')))this.safeLink(pmid,String(source.pmid),'https://pubmed.ncbi.nlm.nih.gov/'+source.pmid+'/');else this.make('span','',pmid,'—');
          const year=this.make('td','tm-cohort-year',tr,row.year||source.analysis?.publication_year||source.year||'—');year.rowSpan=span;
        }
        const population=this.make('td','tm-cohort-population',tr);this.make('span','',population,cohort.label||source.population||'Population not specified');
        if(cohort.is_subgroup)this.make('small','tm-cohort-tag',population,'Subgroup');
        const sample=source.analysis?.sample_size||{},sampleCell=this.make('td','tm-analysis-number',tr,Number.isFinite(sample.n)?'N='+number(sample.n):Number.isFinite(cohort.sample_n)?'Cohort N='+number(cohort.sample_n):'—');
        if(!Number.isFinite(sample.n)&&Number.isFinite(cohort.sample_n))sampleCell.title='Reported cohort total; a sample size bound to this exact comparison is unavailable.';
        const display={...row,measure:row.measure||source.measure,...ConfidenceIntervals.forDisplay({...row,measure:row.measure||source.measure})},effect=this.make('td','tm-analysis-number',tr,`${display.measure} ${effectNumber(display.estimate??source.estimate)}`);
        if(Number.isFinite(display.ci_lower)&&Number.isFinite(display.ci_upper)){
          this.make('span','tm-cohort-ci',effect,` (${effectNumber(display.ci_lower)}–${effectNumber(display.ci_upper)}${display.ci_level&&display.ci_level!==95?'; '+number(display.ci_level)+'% CI':''})`);
          if(display.ci_converted){const note=this.make('small','tm-ci-converted',effect,'95% CI, converted');note.title=display.conversion_note||'Approximate Wald conversion from the reported confidence level.';}
        }
        else this.make('small','tm-inclusion-status',effect,display.ci_95_unavailable?'95% CI unavailable':'CI unavailable');
        if(source.calculation)this.make('small','tm-inclusion-status',effect,'Calculated from arm rates');
      }
    }
    renderComparison() {
      this.comparisonBand.replaceChildren();
      if(this.methods)this.methods.hidden=false;
      if (this.indirect?.active || (this.isRadialBranch() && (!this.selectedComparisonPairId || this.advanced.pending)) || (this.exactNodeBrowse?this.selectionMode!=='comparison':this.tree.overview)) { this.comparisonBand.hidden = true; return; }
      let comparison = this.model.comparisons.find((item) => item.id === this.activeComparisonId);
      if (!comparison) { this.comparisonBand.hidden = true; return; }
      this.comparisonBand.hidden = false;
      const pair = this.tree.comparisonEdges.find((edge) => edge.comparison_ids.includes(comparison.id));
      const evidence = pair ? this.edgeEvidence(pair) : null, group=evidence?.group;
      if(!group?.pooled&&evidence?.effect?.valid&&evidence.comparison)comparison=evidence.comparison;
      if(!group?.pooled)this.analysisTab='comparison';
      if(this.methods)this.methods.hidden=this.analysisTab!=='comparison';
      const heading = this.make('div', 'tm-comparison-heading tm-analysis-heading', this.comparisonBand);
      const navigation=this.make('div','tm-comparison-tabs',heading);navigation.setAttribute('role','tablist');navigation.setAttribute('aria-label','Direct comparison analysis');
      for(const [key,label] of [['comparison','DIRECT ARM COMPARISON'],['forest','Forest plot'],['bias','Publication bias'],['sensitivity','Sensitivity analysis']]){
        const button=this.button(navigation,label,()=>{this.analysisTab=key;this.renderComparison();},'tm-comparison-tab');button.setAttribute('role','tab');button.setAttribute('aria-selected',String(this.analysisTab===key));button.disabled=key!=='comparison'&&!group?.pooled;if(button.disabled)button.title='Requires at least two independent compatible studies with effect uncertainty';
      }
      this.make('strong', '', heading, this.isRadialBranch() ? this.endpointDefinition().label : this.outcomeLabel(comparison.outcome));
      if(!group?.pooled&&group&&!group.latest_fallback){
        const selected=list(group.tableRows).filter(row=>row.population_selected??row.included),k=group.single?.k||group.selected?.length||0;
        if(k===1||selected.length===1)this.make('p','tm-meta-availability',this.comparisonBand,'1 independent cohort in this population; meta-analysis needs at least 2.');
        else if(!selected.length)this.make('p','tm-meta-availability',this.comparisonBand,'No cohorts selected.');
      }
      if(group?.pooled){const p=group.pooled;this.make('p','tm-pooled-summary',this.comparisonBand,`${Charts.modelLabel(p)} · ${number(p.k)} independent cohorts · ${this.endpointDefinition().measure} ${effectNumber(p.estimate)} (${effectNumber(p.ci_lower)}–${effectNumber(p.ci_upper)}) · I² ${number(p.I2)}%`);}
      if (pair) {
        const { tailId, headId, effect, style } = this.edgeEvidence(pair);
        if (effect?.valid) {
          const interpretation = this.make('div', 'tm-arrow-interpretation', this.comparisonBand); interpretation.style.setProperty('--tm-effect-color', style.color);
          this.make('strong', '', interpretation, this.isRadialBranch()
            ? this.nodeFor(headId).label + ' vs ' + this.nodeFor(tailId).label
            : `Arrow: ${this.nodeFor(tailId).label} → ${this.nodeFor(headId).label}`);
          this.make('span', '', interpretation, directedLabel(effect) + (group?.pooled ? ' · '+Charts.modelLabel(group.pooled)+' pooled estimate' : ' · Individual study'));
        }
      }
      if(this.analysisTab!=='comparison'&&group?.pooled){const panel=this.make('section','tm-analysis-panel',this.comparisonBand);panel.setAttribute('role','tabpanel');Charts.render(panel,group,{tab:this.analysisTab,tailLabel:this.nodeFor(evidence.tailId).label,headLabel:this.nodeFor(evidence.headId).label,measure:this.endpointDefinition().measure});return;}
      if(group?.latest_fallback){const f=group.latest_fallback;this.make('p','tm-count-note tm-latest-fallback-note',this.comparisonBand,f.note||`Pooling unavailable: sample size is available for ${number(f.sample_size_studies)} of ${number(f.independent_studies)} independent studies with an effect estimate and CI. The latest result is shown and used for planning.`);}
      if (evidence?.effect?.valid) {
        const pooled=group?.pooled;
        const display={...evidence.effect,
          intervention:{node_id:evidence.headId,label:this.nodeFor(evidence.headId).label},
          comparator:{node_id:evidence.tailId,label:this.nodeFor(evidence.tailId).label}};
        this.make('p', 'tm-reported-label', this.comparisonBand, pooled?'Pooled estimate':comparison.calculation?'Study estimate · calculated from arm rates':'Study estimate');
        const diagram = this.make('div', 'tm-comparison-diagram', this.comparisonBand);
        const endpoint = (record, role) => { const box = this.make('div', 'tm-comparison-arm', diagram); this.make('small', '', box, role); const label = !record.node_id && neutralControl(record.label)?.id === 'control:placebo' ? 'Placebo' : record.label || this.model.byId.get(record.node_id)?.label || 'Complete arm';const node = this.model.byId.get(record.node_id);if(node)this.htmlDrugNames(box,node);else{this.make('strong','',box,label);box.classList.add('tm-neutral-arm');}return box; };
        endpoint(display.intervention, 'Intervention');
        const link = this.make('div', 'tm-effect-link', diagram),estimateLabel=this.make('span', '', link, effectLabel(display));estimateLabel.title=ConfidenceIntervals.forDisplay(display).conversion_note||''; this.make('i', '', link).setAttribute('aria-hidden', 'true'); this.make('small', '', link, 'Intervention vs comparator');
        for(const [key,value]of Object.entries({estimate:display.estimate,'ci-lower':display.ci_lower,'ci-upper':display.ci_upper,basis:pooled?'pooled':'individual'}))link.setAttribute('data-'+key,value??'');
        endpoint(display.comparator, 'Comparator');
      }
      if(pair)this.renderInclusionTable(pair,evidence);
      if(pair)this.renderPlanningTable(pair,evidence);
    }
    bounds() { const points = [...this.tree.positions.values()]; if (!points.length) return { x: -100, y: -100, width: 200, height: 200 }; const pad = this.tree.overview ? 70 : 26, minX = Math.min(...points.map((p) => p.x)) - pad, minY = Math.min(...points.map((p) => p.y - p.height / 2)) - pad; return { x: minX, y: minY, width: Math.max(...points.map((p) => p.x + p.width)) + pad - minX, height: Math.max(...points.map((p) => p.y + p.height / 2)) + pad - minY }; }
    fit(all) {
      if (this.isRadialBranch()) return this;
      if (!this.tree) return this;
      const width = this.stage.clientWidth || 800, height = this.stage.clientHeight || 600, bounds = this.bounds();
      let scale = Math.min((width - 60) / bounds.width, (height - 70) / bounds.height, this.tree.overview ? 1.1 : 1);
      if (!all && !this.tree.overview) scale = Math.max(Math.min(width < 600 ? 0.62 : 0.88, (width - 40) / (width < 600 ? 588 : 300)), scale);
      const focusIds = new Set([this.branchId, ...(width >= 600 ? list(this.tree.children.get(this.branchId)).map((node) => node.id) : [])]);
      const focusPoints = [...focusIds].map((id) => this.tree.positions.get(id)).filter(Boolean);
      for (const node of this.tree.parallelNodes) { const point = this.tree.positions.get(node.id); if (focusIds.has(point.anchor_id)) focusPoints.push(point); }
      const focusLeft = focusPoints.length ? Math.min(...focusPoints.map((point) => point.x)) : 0;
      if (!all && this.tree.parallelNodes.length) {
        const focusWidth = Math.max(...focusPoints.map((point) => point.x + point.width)) - focusLeft;
        const desired = Math.min(width < 600 ? 0.62 : 0.88, (width - 40) / focusWidth), peerHeight = Math.max(82, (this.tree.parallelNodes.filter((node) => this.tree.positions.get(node.id).anchor_id === this.branchId).length - 1) * 114 + 82);
        scale = Math.max(Math.min(desired, width < 600 ? 0.45 : 0.6), Math.min(desired, (height - 100) / peerHeight));
      }
      this.camera = { scale: Math.max(0.12, scale), x: (width - bounds.width * scale) / 2 - bounds.x * scale, y: (height - bounds.height * scale) / 2 - bounds.y * scale };
      if (!all && !this.tree.overview) { const root = this.tree.positions.get(this.branchId); this.camera.x = (width < 600 ? 20 : 30) - focusLeft * scale; this.camera.y = height / 2 - (root?.y || 0) * scale; }
      this.applyCamera(); return this;
    }
    applyCamera() {
      const { x, y, scale } = this.camera; this.world.setAttribute('transform', `translate(${x},${y}) scale(${scale})`); this.zoomLabel.textContent = Math.round(scale * 100) + '%'; this.svg.style.setProperty('--tm-inverse-scale', String(1 / scale)); this.svg.classList.toggle('tm-wide-overview', this.tree.overview && scale < 1.1); this.svg.classList.toggle('tm-tiny-tree', !this.tree.overview && scale < 0.65); this.svg.classList.toggle('tm-micro-tree', !this.tree.overview && scale < 0.3);
      for (const marker of this.comparisonMarkers) { marker.setAttribute('markerWidth', (this.tree.overview ? 7 : 10) / scale); marker.setAttribute('markerHeight', (this.tree.overview ? 7 : 10) / scale); }
      if (this.tree.overview) {
        for (const edge of this.tree.comparisonEdges) { const geometry = radialComparisonGeometry(this.model, this.tree, edge, scale), metadata = this.parallelLinkTitles.get(edge.id); this.parallelGeometry.set(edge.id, geometry); metadata.path.setAttribute('d', geometry.path); metadata.hit.setAttribute('d', geometry.path); }
        this.updateOverviewLabels();
      }
      else this.updatePlanningLabels();
      if (this.indirect?.active) this.indirect.drawArrow();
    }
    updateOverviewLabels() {
      const width = this.stage.clientWidth || 800, height = this.stage.clientHeight || 600, scale = this.camera.scale;
      const priority = [...this.tree.nodes].sort((a, b) => Number(b.id === this.selectedId) - Number(a.id === this.selectedId) || Number(b.type === 'drug') - Number(a.type === 'drug') || (this.tree.children.get(b.id)?.length || 0) - (this.tree.children.get(a.id)?.length || 0) || byLabel(a, b));
      const occupied = [], limit = scale > 1 ? 40 : width < 600 ? 7 : 12;
      for (const node of priority) {
        const label = this.overviewLabels.get(node.id), point = this.tree.positions.get(node.id); if (!label) continue;
        label.classList.remove('tm-highlight-label');
        const px = point.x * scale + this.camera.x, py = point.y * scale + this.camera.y, textWidth = label.textContent.length * 6;
        const gap = Math.max(10, (node.type === 'drug' ? 5.5 : 6) * (this.directParallelIds.has(node.id) ? 2 : 1) * scale + 5);
        let right = Math.cos(point.angle) >= 0;
        if (right && px + gap + textWidth > width - 8) right = false;
        else if (!right && px - gap - textWidth < 8) right = true;
        label.setAttribute('x', (right ? gap : -gap) / scale); label.setAttribute('y', 4 / scale); label.setAttribute('text-anchor', right ? 'start' : 'end');
        const rect = { x: right ? px + gap : px - gap - textWidth, y: py - 9, width: textWidth, height: 17 };
        if (occupied.length >= limit || rect.x < 6 || rect.x + rect.width > width - 6 || rect.y < 6 || rect.y + rect.height > height - 25) continue;
        if (occupied.some((other) => rect.x < other.x + other.width + 8 && rect.x + rect.width + 8 > other.x && rect.y < other.y + other.height + 5 && rect.y + rect.height + 5 > other.y)) continue;
        label.classList.add('tm-highlight-label'); occupied.push(rect);
      }
    }
    zoom(factor, at) { const center = at || { x: this.stage.clientWidth / 2, y: this.stage.clientHeight / 2 }, before = this.camera.scale, scale = Math.min(4, Math.max(0.12, before * factor)), ratio = scale / before; this.camera = { scale, x: center.x - (center.x - this.camera.x) * ratio, y: center.y - (center.y - this.camera.y) * ratio }; this.applyCamera(); }
    reveal(id) { const point = this.tree.positions.get(id); if (!point) return; const width = this.stage.clientWidth, height = this.stage.clientHeight, left = point.x * this.camera.scale + this.camera.x, top = point.y * this.camera.scale + this.camera.y, right = left + point.width * this.camera.scale; if (left < 15) this.camera.x += 15 - left; else if (right > width - 15) this.camera.x -= right - width + 15; if (top < 55) this.camera.y += 55 - top; else if (top > height - 55) this.camera.y -= top - height + 55; this.applyCamera(); }
    bindCamera() {
      this.listen(this.stage, 'wheel', (event) => { event.preventDefault(); const rect = this.stage.getBoundingClientRect(); this.zoom(Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * 0.0025), { x: event.clientX - rect.left, y: event.clientY - rect.top }); }, { passive: false });
      this.listen(this.stage, 'pointerdown', (event) => { if (event.button !== 0) return; this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); (event.target.closest?.('.tm-node,.tm-parallel-link') || this.stage).setPointerCapture?.(event.pointerId); this.drag = { x: event.clientX, y: event.clientY, distance: 0 }; this.suppressClick = false; if (this.pointers.size === 2) { const points = [...this.pointers.values()]; this.pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); } });
      this.listen(this.stage, 'pointermove', (event) => {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size === 2) { const points = [...this.pointers.values()], distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), rect = this.stage.getBoundingClientRect(); if (this.pinchDistance) this.zoom(distance / this.pinchDistance, { x: (points[0].x + points[1].x) / 2 - rect.left, y: (points[0].y + points[1].y) / 2 - rect.top }); this.pinchDistance = distance; this.suppressClick = true; return; }
        if (!this.drag) return; const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y; this.drag.distance += Math.abs(dx) + Math.abs(dy); this.drag.x = event.clientX; this.drag.y = event.clientY;
        if (this.drag.distance > 5) { this.suppressClick = true; this.camera.x += dx; this.camera.y += dy; this.stage.classList.add('tm-panning'); this.applyCamera(); }
      });
      const stop = (event) => { this.pointers.delete(event.pointerId); this.pinchDistance = null; this.drag = this.pointers.size ? { ...[...this.pointers.values()][0], distance: 0 } : null; this.stage.classList.remove('tm-panning'); this.win.setTimeout(() => { if (!this.drag) this.suppressClick = false; }, 0); };
      this.listen(this.stage, 'pointerup', stop); this.listen(this.stage, 'pointercancel', stop);
      this.listen(this.stage, 'keydown', (event) => { if (event.key === '+' || event.key === '=') { event.preventDefault(); this.zoom(1.3); } else if (event.key === '-') { event.preventDefault(); this.zoom(1 / 1.3); } else if (event.key === 'Home') { event.preventDefault(); this.fit(true); } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); this.camera.x += event.key === 'ArrowLeft' ? 55 : event.key === 'ArrowRight' ? -55 : 0; this.camera.y += event.key === 'ArrowUp' ? 55 : event.key === 'ArrowDown' ? -55 : 0; this.applyCamera(); } });
    }
    destroy() { this.indirect?.destroy(); this.filterPanel?.destroy(); this.nodeStudiesController?.destroy(); this.cleanups.forEach((cleanup) => cleanup()); this.resizeObserver?.disconnect(); this.picker?.destroy(); this.root.replaceChildren(); this.root.classList.remove('treatment-map'); }
  }
  return Object.freeze({ mount: (root, graph, options) => new MapView(root, graph, options), prepare, branchNodes, displayParents, layout, parallelArms, branchComparisons, branchNodeLabel, parallelLinkGeometry, radialComparisonGeometry, directParallelNodeIds, neutralControl, effectLabel, countLabel, countedContributions, categoryInfo, annularSectorPath, studyLabel, recordCoverage, engineSignature, preparedDefaults, buildDefaultViews, preparedLayout, serializeLayout, savedAnalysis, analysisKey, comparisonDirection });
});
