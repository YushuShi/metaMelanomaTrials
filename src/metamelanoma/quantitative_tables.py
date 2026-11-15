"""Conservative, source-bound patient counts from explicit HTML table cells.

This is deliberately narrower than a table extractor. It proves a melanoma
subgroup count only when row, column, units, population, and regimen all bind.
It neither assigns outcome denominators nor infers pharmacological synonyms.
"""
from __future__ import annotations

import re
import unicodedata

from .io import digest
from .pmc_html import CompletePage
from .sources import abstract_text


def _normal(text):
    return ' '.join(unicodedata.normalize('NFKC', str(text)).casefold().split()).strip(' .')


def _plain(markup):
    return ' '.join(abstract_text(markup).split())


def _ancestor(node, tag):
    node = node.parent
    while node:
        if node.tag == tag:
            return node
        node = node.parent
    return None


def _span_ok(span):
    return (isinstance(span, dict) and span.get('is_target') is True
            and span.get('planned_only') is False
            and span.get('document_role') in {'main_article', 'main_article_table'}
            and all(isinstance(span.get(k), str) and span[k] for k in ('span_id', 'source_id', 'block_id'))
            and isinstance(span.get('text'), str)
            and span.get('text_sha256') == digest(span['text'].encode('utf-8')))


def _selected(ids, spans):
    if not isinstance(ids, list) or not ids or len(ids) != len(set(ids)):
        return []
    selected = [spans.get(i) for i in ids]
    return selected if all(_span_ok(s) for s in selected) else []


def _population(row, populations, spans):
    pop = populations.get(row.get('population_id'), {})
    parent = populations.get(pop.get('parent_id'), {})
    if (pop.get('melanoma_only') != 'yes' or pop.get('scope') != 'subgroup'
            or parent.get('melanoma_only') != 'no'
            or not _selected(pop.get('evidence'), spans)):
        return None
    # The cancer row cannot prove an extra BRAF/sex/stage/treatment subgroup.
    # Permit only restrictions inherited from the stated mixed-cancer parent.
    words = set(re.findall(r'[\w-]+', _normal(pop.get('label', ''))))
    inherited = set(re.findall(r'[\w-]+', _normal(parent.get('label', ''))))
    if 'melanoma' not in words or words - inherited - {'melanoma', 'patient', 'patients', 'with', 'and', 'the', 'of'}:
        return None
    if row.get('cutoff') != pop.get('cutoff'):
        return None
    return pop


def _arm_binding(arm, header, total, spans):
    """Exact label/graph or source-defined parenthetical OR list, never class inference."""
    evidence = _selected(arm.get('evidence'), spans)
    if not evidence:
        return None
    nodes = arm.get('nodes', [])
    if not isinstance(nodes, list) or any(not isinstance(n, dict) for n in nodes):
        return None
    graph = {n.get('id'): n for n in nodes}
    if len(graph) != len(nodes):
        return None
    root = graph.get(arm.get('root_id'), {})
    label = _normal(arm.get('label', ''))
    heading = _normal(header)
    if label == heading and root.get('kind') in {'drug', 'class', 'control'}:
        if root.get('children') == [] and len(nodes) == 1 and _normal(root.get('name')) == heading:
            return {'method': 'exact_header_label_and_graph', 'evidence_ids': [s['span_id'] for s in evidence]}
        return None
    # For a source-defined class label (e.g. Immunotherapy (X, Y, or Z)),
    # require every OR leaf, literal parentheses, and the header's group N in
    # the same original treatment-definition clause. A single drug cannot
    # inherit a whole immunotherapy column merely from its class membership.
    match = re.fullmatch(r'(.+?)\s*\(([^()]*)\)', label)
    if not match or match[1].strip() != heading or root.get('kind') != 'OR':
        return None
    children = root.get('children', [])
    if len(children) < 2 or len(set(children)) != len(children) or set(graph) != {root.get('id'), *children}:
        return None
    leaves = [graph.get(i, {}) for i in children]
    if any(n.get('kind') != 'drug' or n.get('children') != [] for n in leaves):
        return None
    names = [_normal(n.get('name')) for n in leaves]
    if len(set(names)) != len(names) or any(not n or n == 'na' for n in names):
        return None
    literal = match[2].strip()
    parts = [re.sub(r'^or\s+', '', part) for part in re.split(r'\s*,\s*|\s+or\s+', literal)]
    if ' or ' not in literal or set(filter(None, parts)) != set(names):
        return None
    candidates = []
    for span in evidence:
        text = _normal(span['text'])
        if not re.search(r'(?<!\w)' + re.escape(heading) + r'(?!\w)', text):
            continue
        # Do not cross a sentence or semicolon into an unrelated count.
        pattern = (r'(?<![\w.])' + str(total) + r'\s+patients\s+(?:received|were treated with)'
                   r'\s+[^.;()]{0,120}\(' + re.escape(literal) + r'\)')
        found = list(re.finditer(pattern, text))
        if len(found) == 1:
            candidates.append({'method': 'source_defined_or_regimen_and_header_total',
                'evidence_id': span['span_id'], 'header_total': total,
                'literal_definition': found[0].group(0), 'drug_names': names})
    return candidates[0] if len(candidates) == 1 else None


def _table_grid(markup):
    page = CompletePage(markup)
    page.feed(markup)
    page.close()
    if page.errors or any(not n.closed for n in page.nodes if n.tag in page.CRITICAL):
        return None
    tables = [n for n in page.nodes if n.tag == 'table']
    if len(tables) != 1:
        return None
    table = tables[0]
    rows = [n for n in page.nodes if n.tag == 'tr' and _ancestor(n, 'table') is table]
    if not 2 <= len(rows) <= 500:
        return None
    grid = {}; origins = {}
    for ri, row in enumerate(rows):
        if row.parent.tag not in {'thead', 'tbody'}:
            return None
        column = 0
        for cell in row.children:
            if cell.tag not in {'th', 'td'}:
                return None
            while (ri, column) in grid:
                column += 1
            try:
                rs = int(cell.attrs.get('rowspan', '1'))
                cs = int(cell.attrs.get('colspan', '1'))
            except ValueError:
                return None
            if not (1 <= rs <= len(rows) - ri and 1 <= cs <= 64 and column + cs <= 64):
                return None
            # A span cannot cross header/body sections or overlap another cell.
            if any(rows[j].parent is not row.parent for j in range(ri, ri + rs)):
                return None
            info = {'node': cell, 'text': _plain(markup[cell.content_start:cell.content_end]),
                    'row': ri, 'column': column, 'rowspan': rs, 'colspan': cs}
            origins[(ri, column)] = info
            for rr in range(ri, ri + rs):
                for cc in range(column, column + cs):
                    if (rr, cc) in grid:
                        return None
                    grid[(rr, cc)] = info
            column += cs
    width = max((col for _, col in grid), default=-1) + 1
    if width < 2 or any((ri, ci) not in grid for ri in range(len(rows)) for ci in range(width)):
        return None
    headers = [i for i, r in enumerate(rows) if r.parent.tag == 'thead']
    if not headers or headers != list(range(len(headers))):
        return None
    # Binding patient counts in a baseline table is narrower than allowing an
    # arbitrary event/lesion table to reuse a Melanoma row and No.(%) heading.
    captions = [n for n in page.nodes if n.tag in {'caption', 'h3', 'h4', 'title'}]
    titles = [_plain(markup[n.content_start:n.content_end]) for n in captions]
    if not any(re.search(r'\bpatients?\b', t, re.I) and
               re.search(r'\b(?:baseline|characteristics)\b', t, re.I) for t in titles):
        return None
    return grid, rows, width, headers, titles


def patient_count(row, value, spans, populations, arms):
    """Return an auditable patient-count proof, or None when any binding is unclear.

    Caller must limit invocation to R3 sample_sizes.n. ``spans`` is the complete
    current source catalog so arm definitions can be checked against their own
    source, while table candidates are restricted to this count row's citations.
    No inputs are changed. Does not validate any result denominator.
    """
    if type(value) is not int or value < 0 or not isinstance(row, dict):
        return None
    if row.get('method') != 'reported' or row.get('count_purpose') != 'outcome_analysis':
        return None
    if not isinstance(spans, dict):
        spans = {s['span_id']: s for s in spans if isinstance(s, dict) and 'span_id' in s}
    populations = populations if isinstance(populations, dict) else {p['id']: p for p in populations}
    arms = arms if isinstance(arms, dict) else {a['id']: a for a in arms}
    pop = _population(row, populations, spans)
    arm = arms.get(row.get('arm_id'), {})
    if pop is None or arm.get('population_id') != pop.get('id'):
        return None
    selected = _selected(row.get('evidence'), spans)
    if not selected:
        return None
    proofs = []
    for span in selected:
        if span['document_role'] != 'main_article_table' or len(span['text']) > 2_000_000:
            continue
        parsed = _table_grid(span['text'])
        if parsed is None:
            continue
        grid, rows, width, headers, titles = parsed
        count_cols = {}
        for col in range(1, width):
            chain = []
            for ri in headers:
                cell = grid[(ri, col)]
                if not chain or chain[-1]['node'] is not cell['node']:
                    chain.append(cell)
            if len(chain) != 2 or not re.fullmatch(r'(?:no\.?|n|number)\s*\(\s*%\s*\)', chain[0]['text'], re.I):
                continue
            m = re.fullmatch(r'(.+?)\s*\(\s*n\s*=\s*([0-9]+)\s*\)', chain[1]['text'], re.I)
            if m and chain[1]['colspan'] == 1:
                count_cols[col] = (chain, m[1].strip(), int(m[2]))
        if len(count_cols) < 2:
            continue
        melanoma_rows = [ri for ri in range(len(headers), len(rows))
                         if _normal(grid[(ri, 0)]['text']) == 'melanoma']
        if len(melanoma_rows) != 1:
            continue
        ri = melanoma_rows[0]
        group = None
        for prior in range(len(headers), ri):
            if all(not grid[(prior, c)]['text'].strip() for c in count_cols):
                group = grid[(prior, 0)]
        if group is None or not re.fullmatch(r'(?:primary (?:cancer|tumou?r|malignancy)|cancer type|tumou?r type|histology)', _normal(group['text'])):
            continue
        bound = [(col, chain, header, total, _arm_binding(arm, header, total, spans))
                 for col, (chain, header, total) in count_cols.items()]
        bound = [item for item in bound if item[-1] is not None]
        if len(bound) != 1:
            continue
        for col, chain, header, total, binding in bound:
            cell = grid[(ri, col)]
            if cell['rowspan'] != 1 or cell['colspan'] != 1 or cell['row'] != ri:
                continue
            m = re.fullmatch(r'([0-9]+)\s*\(\s*([0-9]+(?:\.[0-9]+)?)\s*%?\s*\)', cell['text'])
            if not m or int(m[1]) != value or value > total or total <= 0:
                continue
            percentage = float(m[2]); digits = len(m[2].split('.')[1]) if '.' in m[2] else 0
            if not 0 <= percentage <= 100 or abs(value / total * 100 - percentage) > 0.5 * 10 ** (-digits) + 1e-9:
                continue
            node = cell['node']
            raw = span['text'][node.start:node.end]
            proofs.append({'method': 'explicit_table_patient_count', 'value': value,
                'evidence_ids': [span['span_id']], 'source_id': span['source_id'],
                'block_id': span['block_id'], 'source_span_sha256': span['text_sha256'],
                'population_id': pop['id'], 'arm_id': arm['id'],
                'table_title': titles, 'row_group': group['text'], 'row_label': 'Melanoma',
                'column_heading': header, 'column_total': total,
                'group_heading': chain[0]['text'], 'cell_literal': cell['text'],
                'cell_raw_html': raw, 'cell_raw_sha256': digest(raw.encode('utf-8')),
                'cell_char_start_in_span': node.start, 'cell_char_end_in_span': node.end,
                'row_index': ri, 'column_index': col, 'count_component': m[1],
                'percentage_component': m[2], 'arm_binding': binding})
    return proofs[0] if len(proofs) == 1 else None
