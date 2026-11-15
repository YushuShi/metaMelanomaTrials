'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const map = require('../dist/treatment_map.js');

// Parse the SVG actually rendered, independently of production sampling helpers.
function sampledPath(svgPath) {
  const tokens = svgPath.match(/[MLQC]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || [];
  assert.equal(tokens.join(''), svgPath.replace(/[\s,]/g, ''), 'only supported finite SVG path syntax');
  const points = [], segments = []; let cursor = 0, current, command;
  const readPoint = () => ({ x: Number(tokens[cursor++]), y: Number(tokens[cursor++]) });
  while (cursor < tokens.length) {
    if (/^[MLQC]$/i.test(tokens[cursor])) command = tokens[cursor++];
    assert.ok(['M', 'L', 'Q', 'C'].includes(command), 'absolute move/line/quadratic/cubic commands');
    if (command === 'M') { current = readPoint(); points.push(current); command = 'L'; continue; }
    const start = current, controls = command === 'C' ? [readPoint(), readPoint()] : command === 'Q' ? [readPoint()] : [];
    const end = readPoint();
    const count = command === 'L' ? 1 : 250;
    for (let i = 1; i <= count; i++) {
      const t = i / count, u = 1 - t;
      const at = (axis) => command === 'C' ? u ** 3 * start[axis] + 3 * u ** 2 * t * controls[0][axis] + 3 * u * t ** 2 * controls[1][axis] + t ** 3 * end[axis] : command === 'Q' ? u ** 2 * start[axis] + 2 * u * t * controls[0][axis] + t ** 2 * end[axis] : start[axis] + t * (end[axis] - start[axis]);
      points.push({ x: at('x'), y: at('y') });
    }
    segments.push({ command, start, controls, end }); current = end;
  }
  assert.ok(points.length >= 2);
  for (const point of points) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  return { points, segments };
}
const near = (left, right, tolerance = 1e-6) => Math.abs(left - right) <= tolerance;
function onBoundary(point, card) {
  const right = card.x + card.width, top = card.y - card.height / 2, bottom = card.y + card.height / 2;
  return ((near(point.x, card.x) || near(point.x, right)) && point.y >= top && point.y <= bottom) || ((near(point.y, top) || near(point.y, bottom)) && point.x >= card.x && point.x <= right);
}
function entersCard(p, q, card) {
  // Clip against a slightly inset rectangle so touching the card edge is allowed.
  let lower = 0, upper = 1;
  for (const [axis, low, high] of [['x', card.x + 1e-7, card.x + card.width - 1e-7], ['y', card.y - card.height / 2 + 1e-7, card.y + card.height / 2 - 1e-7]]) {
    const delta = q[axis] - p[axis];
    if (Math.abs(delta) < 1e-12) { if (p[axis] < low || p[axis] > high) return false; continue; }
    const a = (low - p[axis]) / delta, b = (high - p[axis]) / delta;
    lower = Math.max(lower, Math.min(a, b)); upper = Math.min(upper, Math.max(a, b));
    if (upper < lower) return false;
  }
  return upper >= lower;
}
function distanceToSegment(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function verifyCurve(tree, edge) {
  const geometry = map.parallelLinkGeometry(tree, edge), parsed = sampledPath(geometry.path);
  assert.match(geometry.path, /[CQ]/, `${edge.id} uses a curved connector`);
  assert.ok(onBoundary(parsed.points[0], tree.positions.get(edge.opponent_id)), 'starts on the exact opponent card');
  assert.ok(onBoundary(parsed.points.at(-1), tree.positions.get(edge.root_id)), 'ends on the exact in-branch regimen card');
  for (let i = 1; i < parsed.segments.length; i++) {
    const left = parsed.segments[i - 1], right = parsed.segments[i];
    assert.deepEqual(left.end, right.start, 'curve segments meet without gaps');
    const prior = left.controls.at(-1) || left.start, next = right.controls[0] || right.end;
    const incoming = { x: left.end.x - prior.x, y: left.end.y - prior.y }, outgoing = { x: next.x - right.start.x, y: next.y - right.start.y };
    const magnitude = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y);
    if (magnitude > 1e-12) {
      const cosine = (incoming.x * outgoing.x + incoming.y * outgoing.y) / magnitude;
      assert.ok(cosine > 0.999999, `${edge.id} has a tangent-continuous join, not a sharp corner`);
    }
  }
  for (let i = 1; i < parsed.points.length; i++) {
    for (const [id, card] of tree.positions) assert.ok(!entersCard(parsed.points[i - 1], parsed.points[i], card), `${edge.id} crosses card ${id}`);
  }
  assert.ok(Number.isFinite(geometry.midpoint.x) && Number.isFinite(geometry.midpoint.y));
  const distance = Math.min(...parsed.points.slice(1).map((point, index) => distanceToSegment(geometry.midpoint, parsed.points[index], point)));
  assert.ok(distance < 1, `${edge.id} midpoint lies on the drawn curve (distance ${distance})`);
  assert.ok(Array.isArray(geometry.sampledPoints) && geometry.sampledPoints.length >= 2);
  assert.deepEqual(geometry.sampledPoints[0], parsed.points[0]);
  assert.deepEqual(geometry.sampledPoints.at(-1), parsed.points.at(-1));
  return { geometry, parsed };
}
const edge = { id: 'synthetic-pair', root_id: 'target', opponent_id: 'opponent', comparison_ids: ['source'], publication_ids: ['123'] };
function positioned(cards) {
  return { positions: new Map(Object.entries(cards).map(([id, value]) => [id, { x: value[0], y: value[1], width: 258, height: 82 }])) };
}

test('same-row parallel cards use a visibly curved connector rather than a straight dashed line', () => {
  const tree = positioned({ opponent: [0, 0], target: [650, 0] }), { parsed } = verifyCurve(tree, edge);
  assert.ok(Math.max(...parsed.points.map((point) => distanceToSegment(point, parsed.points[0], parsed.points.at(-1)))) > 6);
});

test('sibling regimen cards use a bowed connector while retaining their exact endpoints', () => {
  const tree = positioned({ opponent: [330, 0], target: [330, 228] }), { parsed } = verifyCurve(tree, edge);
  assert.ok(Math.max(...parsed.points.map((point) => distanceToSegment(point, parsed.points[0], parsed.points.at(-1)))) > 6);
});

test('curves route around an intervening treatment card without clipping through it', () => {
  const tree = positioned({ opponent: [0, 0], obstacle: [350, 100], target: [700, 180] });
  verifyCurve(tree, edge);
});

test('a narrow multi-obstacle route retains smooth corners and a valid label position', () => {
  const tree = positioned({ opponent: [0, 0], upper: [330, 0], lower: [330, 114], target: [660, 114] });
  verifyCurve(tree, edge);
});

test('every current branch comparison curve clears cards and preserves the prepared source evidence', (t) => {
  const raw = fs.readFileSync(path.join(__dirname, '../dist/data/treatment_map.json'), 'utf8'), graph = JSON.parse(raw), before = JSON.stringify(graph), model = map.prepare(graph);
  let checked = 0;
  for (const node of model.nodes) {
    const tree = map.layout(model, node.id), pairsBefore = JSON.stringify(tree.comparisonEdges), positionsBefore = JSON.stringify([...tree.positions]);
    for (const pair of tree.comparisonEdges) {
      verifyCurve(tree, pair); checked++;
      for (const id of pair.comparison_ids) {
        const source = model.comparisons.find((item) => item.id === id);
        assert.ok(source, `source ${id} remains available`);
        const endpoints = [source.intervention.node_id || map.neutralControl(source.intervention.label).id, source.comparator.node_id || map.neutralControl(source.comparator.label).id].sort();
        assert.deepEqual(endpoints, [pair.root_id, pair.opponent_id].sort());
      }
    }
    assert.equal(JSON.stringify(tree.comparisonEdges), pairsBefore, 'drawing does not change exact-pair study/outcome scope');
    assert.equal(JSON.stringify([...tree.positions]), positionsBefore, 'drawing does not change node positions');
  }
  assert.ok(checked > 0);
  t.diagnostic(`Independently checked ${checked} current branch comparison curves.`);
  assert.equal(JSON.stringify(graph), before, 'counts, estimates and original intervention/comparator directions remain untouched');
});
