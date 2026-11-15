/* Presentation only: all estimates and diagnostics come from TreatmentMapAnalysis. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./confidence_intervals.js'));
  else root.TreatmentMapCharts = factory(root.ConfidenceIntervals);
})(typeof globalThis === 'undefined' ? this : globalThis, function (ConfidenceIntervals) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const list = value => Array.isArray(value) ? value : [];
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const positive = value => finite(value) && Number(value) > 0;
  let serial = 0;

  function formatNumber(value) {
    if (!finite(value)) return '—';
    const n = Number(value), absolute = Math.abs(n);
    if (absolute && (absolute < 0.001 || absolute >= 10000)) return n.toExponential(2).replace(/\.0+(?=e)/, '').replace('e+', 'e');
    return Number(n.toFixed(3)).toLocaleString('en-US', { maximumFractionDigits: 3 });
  }
  function formatP(value) {
    if (!finite(value) || Number(value) < 0 || Number(value) > 1) return '—';
    return Number(value) < 0.001 ? '<0.001' : Number(value).toFixed(3);
  }
  function intervalValid(row) {
    return row && positive(row.estimate) && positive(row.ci_lower) && positive(row.ci_upper) && Number(row.ci_lower) <= Number(row.estimate) && Number(row.estimate) <= Number(row.ci_upper);
  }
  function modelLabel(result) {
    if(result?.model==='individual'||result?.method==='single')return 'Individual study';
    if(result?.model==='fixed'||['FE','fixed'].includes(result?.method))return 'Fixed-effect';
    if(result?.model==='random'||result?.method==='REML')return result?.tau2_method==='REML'||result?.method==='REML'?'Random-effects (REML)':'Random-effects';
    return 'Pooled analysis';
  }
  function measureName(group, options) {
    const value = String(options?.measure || group?.measure || group?.selected?.[0]?.source?.measure || 'Ratio').toUpperCase();
    return ['HR', 'RR', 'OR'].includes(value) ? value : 'Ratio';
  }
  function estimateText(row, measure, includeLevel) {
    row = displayRow(row, measure);
    if(row.ci_95_unavailable&&positive(row.estimate))return `${measure} ${ConfidenceIntervals.formatEffectNumber(row.estimate)} (95% CI unavailable)`;
    if (!intervalValid(row)) return 'Unavailable';
    let level = Number(row.ci_level); if (level > 0 && level <= 1) level *= 100;
    const qualifier = includeLevel && row.ci_converted ? '; 95% CI, converted' : includeLevel && finite(level) && level > 0 && Math.abs(level - 95) > 0.001 ? '; ' + formatNumber(level) + '% CI' : '';
    return `${measure} ${ConfidenceIntervals.formatEffectNumber(row.estimate)} (${ConfidenceIntervals.formatEffectNumber(row.ci_lower)}–${ConfidenceIntervals.formatEffectNumber(row.ci_upper)}${qualifier})`;
  }
  function logEstimateText(row, measure) {
    row = displayRow(row, measure);
    if (!positive(row.estimate)) return 'Unavailable';
    const estimate = ConfidenceIntervals.formatEffectNumber(Math.log(Number(row.estimate)));
    if (row.ci_95_unavailable) return estimate;
    if (!intervalValid(row)) return 'Unavailable';
    return `${estimate} (${ConfidenceIntervals.formatEffectNumber(Math.log(Number(row.ci_lower)))}–${ConfidenceIntervals.formatEffectNumber(Math.log(Number(row.ci_upper)))})`;
  }
  function displayRow(row, measure) {
    const metric=measure||row.measure||row.source?.measure;
    return {...row,measure:metric,...ConfidenceIntervals.forDisplay({...row,measure:metric})};
  }
  function rowLabel(row) { return String(row?.label || row?.study_name || row?.study_id || 'Study'); }
  function rowPMID(row) { return String(row?.pmid || row?.source?.pmid || ''); }
  function sourceURL(row) {
    const pmid = rowPMID(row); if (/^\d+$/.test(pmid)) return 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/';
    const value = String(row?.source_url || row?.source?.source_url || '');
    return /^https?:\/\//i.test(value) ? value : null;
  }
  function make(doc, parent, tag, className, text) {
    const element = doc.createElement(tag); if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    if (parent) parent.appendChild(element); return element;
  }
  function svgElement(doc, parent, tag, attrs, text) {
    const element = doc.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) element.setAttribute(key, String(value));
    if (text !== undefined) element.textContent = String(text);
    if (parent) parent.appendChild(element); return element;
  }
  function linkLabel(doc, parent, row, label) {
    const url = sourceURL(row), element = make(doc, parent, url ? 'a' : 'span', '', label === undefined ? rowLabel(row) : label);
    if (url) { element.setAttribute('href', url); element.setAttribute('target', '_blank'); element.setAttribute('rel', 'noopener noreferrer'); }
    return element;
  }
  function directionText(options) {
    return options?.tailLabel && options?.headLabel ? String(options.headLabel) + ' versus ' + String(options.tailLabel) : '';
  }
  function wrapText(value, width) {
    const words = String(value).split(/\s+/).flatMap(word => word.length > width ? word.match(new RegExp('.{1,' + width + '}', 'g')) : [word]);
    const lines = []; let line = '';
    for (const word of words) {
      if (line && line.length + word.length + 1 > width) { lines.push(line); line = ''; }
      line += (line ? ' ' : '') + word;
    }
    if (line || !lines.length) lines.push(line); return lines;
  }
  function ratioTicks(low, high) {
    const ticks = [];
    const start = Math.max(-308, Math.floor(Math.log10(low)) - 1), finish = Math.min(308, Math.ceil(Math.log10(high)) + 1);
    for (let exponent = start; exponent <= finish; exponent++) for (const multiplier of [1, 2, 5]) {
      const value = multiplier * Math.pow(10, exponent);
      if (Number.isFinite(value) && value >= low && value <= high) ticks.push(value);
    }
    const selected = ticks.length > 9 ? ticks.filter((_, index) => index % Math.ceil(ticks.length / 8) === 0) : ticks;
    if (low <= 1 && high >= 1 && !selected.includes(1)) selected.push(1);
    return [...new Set(selected)].sort((a, b) => a - b);
  }
  function linearTicks(low, high, target = 5) {
    const span = high - low; if (!(span > 0) || !Number.isFinite(span)) return [low];
    const base = Math.pow(10, Math.floor(Math.log10(span / target)));
    const step = [1, 2, 5, 10].map(value => value * base).find(value => value >= span / target) || base * 10;
    const result = [];
    for (let i = Math.ceil(low / step); i * step <= high + step * 1e-9 && result.length < 20; i++) result.push(Number((i * step).toPrecision(12)));
    return result;
  }
  function figure(doc, root, title, description, width, height, kind) {
    const container = make(doc, root, 'figure', 'tm-analysis-figure tm-analysis-' + kind);
    const caption = make(doc, container, 'figcaption', 'tm-analysis-caption');
    make(doc, caption, 'h4', '', title);
    const scroll = make(doc, container, 'div', 'tm-analysis-chart-scroll'); scroll.setAttribute('tabindex', '0'); scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', title + '; scroll horizontally if needed');
    const id = 'tm-analysis-chart-' + (++serial);
    const svg = svgElement(doc, scroll, 'svg', { class: 'tm-analysis-svg', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': id + '-title', 'aria-describedby': id + '-description' });
    svgElement(doc, svg, 'title', { id: id + '-title' }, title);
    svgElement(doc, svg, 'desc', { id: id + '-description' }, description);
    return { container, caption, svg };
  }
  function axes(doc, svg, box, xTicks, yTicks, xScale, yScale, xLabel, yLabel) {
    svgElement(doc, svg, 'path', { class: 'tm-analysis-axis', d: `M${box.left},${box.top} V${box.bottom} H${box.right}` });
    for (const tick of xTicks) {
      const x = xScale(tick); svgElement(doc, svg, 'line', { class: 'tm-analysis-tick', x1: x, x2: x, y1: box.bottom, y2: box.bottom + 5 });
      svgElement(doc, svg, 'text', { class: 'tm-analysis-axis-label', x, y: box.bottom + 22, 'text-anchor': 'middle' }, formatNumber(tick));
    }
    for (const tick of yTicks) {
      const y = yScale(tick); svgElement(doc, svg, 'line', { class: 'tm-analysis-grid', x1: box.left, x2: box.right, y1: y, y2: y });
      svgElement(doc, svg, 'text', { class: 'tm-analysis-axis-label', x: box.left - 10, y: y + 4, 'text-anchor': 'end' }, formatNumber(tick));
    }
    svgElement(doc, svg, 'text', { class: 'tm-analysis-axis-title', x: (box.left + box.right) / 2, y: box.bottom + 48, 'text-anchor': 'middle' }, xLabel);
    if (yLabel) svgElement(doc, svg, 'text', { class: 'tm-analysis-axis-title', transform: `translate(21 ${(box.top + box.bottom) / 2}) rotate(-90)`, 'text-anchor': 'middle' }, yLabel);
  }
  function renderForest(doc, root, group, rows, options, measure) {
    const pooled = group.pooled, width = 1280, plotLeft = 360, plotRight = 765, ratioColumn = 795, logColumn = 1035;
    const labels = rows.map(row => wrapText(rowLabel(row), 45));
    const positions = []; let cursor = 52;
    labels.forEach(lines => { const height = Math.max(44, lines.length * 15 + 19); positions.push({ y: cursor + height / 2, height }); cursor += height; });
    const pooledY = cursor + 31, axisY = pooledY + 30, height = axisY + 70;
    const bounds = rows.flatMap(row => intervalValid(row)?[Number(row.ci_lower), Number(row.ci_upper)]:[Number(row.estimate)]).concat([Number(pooled.ci_lower), Number(pooled.ci_upper), 1]);
    let minLog = Math.log(Math.min(...bounds)), maxLog = Math.log(Math.max(...bounds));
    const pad = Math.max(.12, (maxLog - minLog) * .1); minLog -= pad; maxLog += pad;
    // Coordinates and tick values are natural logarithms, with the null at 0.
    // Keep the original ratios alongside the log values rather than labelling
    // logarithmically spaced ratio ticks as if they were ln values.
    const x = logValue => plotLeft + (Number(logValue) - minLog) / (maxLog - minLog) * (plotRight - plotLeft);
    const ratioX = value => x(Math.log(Number(value)));
    const method=modelLabel(pooled);
    const dualDescription = row => estimateText(row, measure, true) + '; ln(' + measure + ') ' + logEstimateText(row, measure);
    const { container, caption, svg } = figure(doc, root, 'Forest plot', directionText(options) + '. The x axis is ln(' + measure + '), with the null effect at 0. Estimates and 95% confidence intervals are shown on the original ratio and natural-log scales. ' + rows.map(row => rowLabel(row) + ': ' + dualDescription(row)).join('; ') + '. '+method+': ' + dualDescription(pooled), width, height, 'forest');
    svg.setAttribute('data-coordinate-scale', 'ln');
    if (directionText(options)) make(doc, caption, 'p', 'tm-analysis-direction', directionText(options));
    svgElement(doc, svg, 'text', { class: 'tm-analysis-column-heading', x: 14, y: 26 }, 'Study');
    svgElement(doc, svg, 'text', { class: 'tm-analysis-column-heading', x: ratioColumn, y: 26 }, measure + ' (95% CI)');
    svgElement(doc, svg, 'text', { class: 'tm-analysis-column-heading', x: logColumn, y: 26 }, 'ln(' + measure + ') (95% CI)');
    svgElement(doc, svg, 'line', { class: 'tm-analysis-reference', x1: x(0), x2: x(0), y1: 39, y2: axisY, 'data-log-value': 0 });
    const weights = rows.map(row => positive(row.weight) ? Number(row.weight) : positive(row.weight_percent) ? Number(row.weight_percent) : 1), maxWeight = Math.max(...weights);
    rows.forEach((row, index) => {
      const { y } = positions[index], rowGroup = svgElement(doc, svg, 'g', { class: 'tm-analysis-study-row', 'data-study-id': row.study_id || row.id || index });
      let labelParent = rowGroup; const url = sourceURL(row);
      if (url) labelParent = svgElement(doc, rowGroup, 'a', { href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': rowLabel(row) + (rowPMID(row) ? ', PMID ' + rowPMID(row) : '') });
      const labelY = y - (labels[index].length - 1) * 7.5;
      labels[index].forEach((line, lineIndex) => svgElement(doc, labelParent, 'text', { class: 'tm-analysis-study-label', x: 14, y: labelY + lineIndex * 15 + 4 }, line));
      if(intervalValid(row)){
        svgElement(doc, rowGroup, 'line', { class: 'tm-analysis-ci', x1: ratioX(row.ci_lower), x2: ratioX(row.ci_upper), y1: y, y2: y });
        for (const bound of [row.ci_lower, row.ci_upper]) svgElement(doc, rowGroup, 'line', { class: 'tm-analysis-ci', x1: ratioX(bound), x2: ratioX(bound), y1: y - 4, y2: y + 4 });
      }
      const size = Math.max(5, 17 * Math.sqrt(weights[index] / maxWeight));
      const mark = svgElement(doc, rowGroup, 'rect', { class: 'tm-analysis-estimate', x: ratioX(row.estimate) - size / 2, y: y - size / 2, width: size, height: size, tabindex: 0, role: 'img', 'data-estimate': row.estimate, 'data-log-estimate': Math.log(Number(row.estimate)), 'data-x': ratioX(row.estimate), 'aria-label': rowLabel(row) + ': ' + dualDescription(row) });
      svgElement(doc, mark, 'title', {}, rowLabel(row) + ' · ' + dualDescription(row));
      svgElement(doc, rowGroup, 'text', { class: 'tm-analysis-value tm-analysis-ratio-value', x: ratioColumn, y: y + 4 }, row.ci_95_unavailable?formatNumber(row.estimate):estimateText(row, '', !row.ci_converted).trim());
      svgElement(doc, rowGroup, 'text', { class: 'tm-analysis-value tm-analysis-ln-value', x: logColumn, y: y + 4 }, logEstimateText(row, measure));
      if(row.ci_converted){const note=svgElement(doc,rowGroup,'text',{class:'tm-analysis-ci-note',x:ratioColumn,y:y+19},'95% CI, converted (both scales)');svgElement(doc,note,'title',{},row.conversion_note);}
      else if(row.ci_95_unavailable){const note=svgElement(doc,rowGroup,'text',{class:'tm-analysis-ci-note',x:ratioColumn,y:y+19},'95% CI unavailable (both scales)');svgElement(doc,note,'title',{},row.conversion_note);}
    });
    svgElement(doc, svg, 'line', { class: 'tm-analysis-separator', x1: 14, x2: width - 18, y1: cursor + 8, y2: cursor + 8 });
    svgElement(doc, svg, 'text', { class: 'tm-analysis-pooled-label', x: 14, y: pooledY + 4 }, method);
    const diamond = svgElement(doc, svg, 'polygon', { class: 'tm-analysis-pooled', points: `${ratioX(pooled.ci_lower)},${pooledY} ${ratioX(pooled.estimate)},${pooledY - 9} ${ratioX(pooled.ci_upper)},${pooledY} ${ratioX(pooled.estimate)},${pooledY + 9}`, 'aria-label': method+' ' + dualDescription(pooled) });
    svgElement(doc, diamond, 'title', {}, method+' '+dualDescription(pooled));
    svgElement(doc, svg, 'text', { class: 'tm-analysis-value tm-analysis-ratio-value tm-analysis-pooled-label', x: ratioColumn, y: pooledY + 4 }, estimateText(pooled, '', false).trim());
    svgElement(doc, svg, 'text', { class: 'tm-analysis-value tm-analysis-ln-value tm-analysis-pooled-label', x: logColumn, y: pooledY + 4 }, logEstimateText(pooled, measure));
    const logTicks = [...new Set([...linearTicks(minLog, maxLog, 6), 0])].sort((a,b)=>a-b);
    axes(doc, svg, { left: plotLeft, right: plotRight, top: axisY, bottom: axisY }, logTicks, [], x, () => 0, 'ln(' + measure + ')');
    const summary = [`${method} · ${pooled.k} independent cohorts`];
    if (finite(pooled.I2)) summary.push('I²=' + formatNumber(pooled.I2) + '%');
    if (finite(pooled.tau2)) summary.push('τ²=' + formatNumber(pooled.tau2));
    make(doc, container, 'p', 'tm-analysis-note', summary.join(' · '));
  }
  function scatterPoints(doc, svg, rows, xValue, yValue, xScale, yScale, label) {
    const groups = new Map();
    for (const row of rows) {
      const key = Number(xValue(row)) + '|' + Number(yValue(row));
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row);
    }
    let overlaps = 0;
    for (const items of groups.values()) {
      if (items.length > 1) overlaps += items.length;
      const x = xScale(xValue(items[0])), y = yScale(yValue(items[0]));
      const text = items.map(label).join('; '), cluster = svgElement(doc, svg, 'g', { class: 'tm-analysis-point', tabindex: 0, role: 'img', 'aria-label': text, 'data-count': items.length });
      svgElement(doc, cluster, 'title', {}, text);
      svgElement(doc, cluster, 'circle', { cx: x, cy: y, r: items.length > 1 ? 8 : 4.5, class: 'tm-analysis-scatter-dot' });
      if (items.length > 1) svgElement(doc, cluster, 'text', { class: 'tm-analysis-cluster-count', x, y: y + 3, 'text-anchor': 'middle' }, items.length);
    }
    return overlaps;
  }
  function eggerText(result, k) {
    if (result?.available === true && k >= 10 && finite(result.p_value) && Number(result.p_value) >= 0 && Number(result.p_value) <= 1) return 'Egger’s test: p' + (Number(result.p_value) < .001 ? '' : '=') + formatP(result.p_value) + ' · ' + k + ' studies';
    if (k < 10) return 'Egger’s test requires at least 10 independent studies.';
    const reason = String(result?.reason || '').toLowerCase();
    if (/identical|constant|precision|singular|variation/.test(reason)) return 'Egger’s test is unavailable because study precision has insufficient variation.';
    return 'Egger’s test is unavailable for this selection.';
  }
  function renderBias(doc, root, group, rows, options, measure) {
    const points = list(group.diagnostics?.funnel).filter(row => finite(row.log_estimate) && positive(row.se));
    if (points.length !== rows.length) { make(doc, root, 'p', 'tm-analysis-empty', 'Funnel-plot estimates are unavailable for this selection.'); return; }
    const width = 760, height = 495, box = { left: 82, right: 726, top: 30, bottom: 425 };
    const maxSE = Math.max(...points.map(row => Number(row.se))) * 1.12, center = Number(group.pooled.log_estimate);
    let minX = Math.min(...points.map(row => Number(row.log_estimate)), center - 1.96 * maxSE), maxX = Math.max(...points.map(row => Number(row.log_estimate)), center + 1.96 * maxSE);
    const padding = Math.max((maxX - minX) * .08, .05); minX -= padding; maxX += padding;
    const x = value => box.left + (Number(value) - minX) / (maxX - minX) * (box.right - box.left), y = value => box.top + Number(value) / maxSE * (box.bottom - box.top);
    const { container, caption, svg } = figure(doc, root, 'Publication bias', 'Funnel plot of log ' + measure + ' versus standard error, centered on the '+modelLabel(group.pooled)+' estimate. Each point represents an independent cohort; matching points show their count.', width, height, 'funnel');
    if (directionText(options)) make(doc, caption, 'p', 'tm-analysis-direction', directionText(options));
    axes(doc, svg, box, linearTicks(minX, maxX), linearTicks(0, maxSE), x, y, 'log(' + measure + ')', 'Standard error');
    svgElement(doc, svg, 'line', { class: 'tm-analysis-reference', x1: x(center), x2: x(center), y1: box.top, y2: box.bottom });
    svgElement(doc, svg, 'path', { class: 'tm-analysis-funnel-guide', d: `M${x(center - 1.96 * maxSE)},${box.bottom} L${x(center)},${box.top} L${x(center + 1.96 * maxSE)},${box.bottom}` });
    const overlap = scatterPoints(doc, svg, points, row => Number(row.log_estimate), row => Number(row.se), x, y, row => `${rowLabel(row)}${rowPMID(row) ? ', PMID ' + rowPMID(row) : ''}: log(${measure})=${formatNumber(row.log_estimate)}, SE=${formatNumber(row.se)}`);
    make(doc, container, 'p', 'tm-analysis-note', modelLabel(group.pooled)+'. Reference limits: pooled log effect ±1.96 × standard error.' + (overlap ? ' Numbers inside dots identify overlapping studies.' : ''));
    make(doc, root, 'p', 'tm-analysis-test-result', eggerText(group.diagnostics?.egger, Number(group.pooled.k)));
  }
  function renderSensitivity(doc, root, group, rows, options, measure) {
    const diagnostics = group.diagnostics || {}, points = list(diagnostics.baujat).filter(row => finite(row.q_contribution) && Number(row.q_contribution) >= 0 && finite(row.influence) && Number(row.influence) >= 0);
    if (points.length === rows.length) {
      const box = { left: 88, right: 726, top: 30, bottom: 405 }, maxX = Math.max(...points.map(row => Number(row.q_contribution))) || 1, maxY = Math.max(...points.map(row => Number(row.influence))) || 1;
      const x = value => box.left + Number(value) / (maxX * 1.12) * (box.right - box.left), y = value => box.bottom - Number(value) / (maxY * 1.12) * (box.bottom - box.top);
      const { container, svg } = figure(doc, root, 'Baujat plot', 'Study contribution to heterogeneity Q versus squared change in the fixed-effect estimate after omission, standardized by the omitted-fit variance.', 760, 480, 'baujat');
      axes(doc, svg, box, linearTicks(0, maxX * 1.12), linearTicks(0, maxY * 1.12), x, y, 'Contribution to heterogeneity Q', 'Squared standardized influence');
      const overlap = scatterPoints(doc, svg, points, row => row.q_contribution, row => row.influence, x, y, row => `${rowLabel(row)}${rowPMID(row) ? ', PMID ' + rowPMID(row) : ''}: Q contribution=${formatNumber(row.q_contribution)}, influence=${formatNumber(row.influence)}`);
      make(doc, container, 'p', 'tm-analysis-note', 'Influence: squared change in the fixed-effect estimate after omission, divided by the omitted-fit variance.' + (overlap ? ' Numbers inside dots identify overlapping studies.' : ''));
    } else make(doc, root, 'p', 'tm-analysis-empty', diagnostics.reasons?.baujat || 'Baujat results are unavailable for this selection.');
    const section = make(doc, root, 'section', 'tm-analysis-sensitivity');
    make(doc, section, 'h4', '', 'Leave-one-out analysis');
    const omitted = list(diagnostics.leave_one_out);
    if (!omitted.length) { make(doc, section, 'p', 'tm-analysis-empty', 'Leave-one-out results are unavailable for this selection.'); return; }
    const scroll = make(doc, section, 'div', 'tm-analysis-table-scroll'); scroll.setAttribute('tabindex', '0'); scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Leave-one-out results; scroll horizontally if needed');
    const table = make(doc, scroll, 'table', 'tm-analysis-table');
    make(doc, table, 'caption', 'tm-analysis-table-caption', directionText(options) || 'Estimate after omitting each independent study');
    const header = make(doc, make(doc, table, 'thead'), 'tr');
    for (const label of ['Study omitted', 'Cohorts remaining', 'Model', measure + ' after omission (CI)', 'p-value']) { const cell = make(doc, header, 'th', '', label); cell.setAttribute('scope', 'col'); }
    const body = make(doc, table, 'tbody');
    for (const item of omitted) {
      const row = make(doc, body, 'tr'), name = make(doc, row, 'th'); name.setAttribute('scope', 'row'); linkLabel(doc, name, item);
      make(doc, row, 'td', 'tm-analysis-number', finite(item.k_remaining) ? Number(item.k_remaining) : '—');
      make(doc,row,'td','tm-analysis-model',modelLabel(item.pooled||item));
      const display=displayRow(item,measure),cell=make(doc, row, 'td', 'tm-analysis-number', estimateText(display, '', true).trim());cell.title=display.conversion_note||'';
      make(doc, row, 'td', 'tm-analysis-number', formatP(item.p_value));
    }
  }
  function clear(root, message) {
    if (!root?.ownerDocument) throw new TypeError('A DOM root is required');
    root.replaceChildren(); root.classList?.add('tm-analysis-output');
    if (message) make(root.ownerDocument, root, 'p', 'tm-analysis-empty', message);
    return { available: false };
  }
  function render(root, group, options) {
    clear(root); const doc = root.ownerDocument, measure = measureName(group, options), selected = list(group?.selected).map(row=>displayRow(row,measure)), pooled = group?.pooled;
    if (!(Number(pooled?.k) >= 2) || selected.length < 2) return clear(root, 'At least two independent compatible studies are required.');
    if (Number(pooled.k) !== selected.length || !intervalValid(pooled) || !finite(pooled.log_estimate) || selected.some(row => (!intervalValid(row)&&!row.ci_95_unavailable) || !positive(row.estimate) || !finite(row.log_estimate) || !positive(row.se))) return clear(root, 'Study estimates are unavailable for this selection.');
    const tab = options?.tab || 'forest';
    if (tab === 'forest') renderForest(doc, root, group, selected, options, measure);
    else if (tab === 'bias') renderBias(doc, root, group, selected, options, measure);
    else if (tab === 'sensitivity') renderSensitivity(doc, root, group, selected, options, measure);
    else return clear(root, 'Select a diagnostic view.');
    return { available: true, tab, studies: Number(pooled.k) };
  }
  return Object.freeze({ render, clear, formatNumber, formatP, ratioTicks, linearTicks, eggerText, modelLabel });
});
