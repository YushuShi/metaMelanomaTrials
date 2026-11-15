"""Publish source-bound full-text complements without rewriting frozen R2 evidence."""
from collections import Counter
from copy import deepcopy
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess

from .io import atomic_bytes, canonical, digest, now, owned, reference, verified_json
from .quantitative_export import PUBLIC, PENDING_STATES, numeric, present, project_article
from .screening import catalog_for

COMPLETE = frozenset(('complete', 'complete_with_issues'))
COLLECTIONS = ('effects', 'survival', 'binary', 'sample_sizes')
NUMBER_FIELDS = ('estimate', 'analysis_n', 'numerator', 'denominator', 'p_value')
CI_FIELDS = ('ci_lower', 'ci_upper', 'confidence_level')


def _text(value):
    return ' '.join(str(value or 'NA').casefold().split())


def _population(record, ident, seen=()):
    if ident in seen:
        return None
    pop = next((p for p in record['populations'] if p['id'] == ident), None)
    if not pop or pop['melanoma_only'] != 'yes' or not present(pop['label']):
        return None
    parent = _population(record, pop['parent_id'], (*seen, ident)) if present(pop['parent_id']) else ()
    if parent is None:
        return None
    return (_text(pop['label']), pop['scope'], _text(pop['cutoff']), parent)


def _arm(record, ident):
    if not present(ident):
        return ()
    arm = next((a for a in record['arms'] if a['id'] == ident), None)
    if not arm:
        return None
    nodes = {n['id']: n for n in arm['nodes']}
    def visit(key, seen=()):
        if key in seen or key not in nodes:
            return None
        node = nodes[key]
        kind = node['kind']
        if kind in ('AND', 'OR', 'SEQUENTIAL'):
            children = [visit(c, (*seen, key)) for c in node['children']]
            if any(c is None for c in children):
                return None
            if kind != 'SEQUENTIAL':
                children.sort(key=repr)
            return (kind, tuple(children))
        if kind == 'UNKNOWN' or node['children'] or not present(node['name']):
            return None
        return (kind, *(_text(node[k]) for k in ('name', 'dose', 'route', 'schedule')))
    return visit(arm['root_id'])


def _context(record, section, row):
    """Deliberately conservative: labels alone never link different regimens/scopes."""
    pop = _population(record, row['population_id'])
    arms = tuple(_arm(record, row.get(k)) for k in
                 (('intervention_arm_id', 'reference_arm_id') if section == 'effects' else ('arm_id',)))
    if pop is None or any(a is None for a in arms):
        return None
    fields = ('origin', 'endpoint', 'endpoint_definition', 'cutoff', 'measure', 'kind',
              'time', 'time_unit', 'assessment_time', 'response_criteria',
              'safety_attribution', 'adjusted', 'model', 'p_test', 'p_sidedness')
    if section == 'sample_sizes':
        if present(row.get('result_id')):
            return None  # Outcome-scoped counts need an independently proven result link.
        fields = ('cutoff', 'count_purpose', 'method', 'disjoint', 'complete')
    return (section, record['study']['comparison_structure'], pop, arms,
            tuple((k, _text(row.get(k))) for k in fields))


def _extends(before, after):
    return not present(before) or present(after) and _text(before) == _text(after)


def _label_expands(before, after):
    if _extends(before, after):
        return True
    if not present(after):
        return False
    tokens = lambda value: re.findall(r'[\w]+|[<>≤≥=]', _text(value))
    a, b = Counter(tokens(before)), Counter(tokens(after))
    # A source link may add description, but not negate the earlier population
    # or erase/change a known descriptor or numerical constraint.
    negative = {'not', 'no', 'without', 'excluding', 'except', 'non'}
    return all(b[token] >= n for token, n in a.items()) and not ((set(b) - set(a)) & negative)


def _linked_context_refinement(old, new, section, before, after, links, catalog, source_spans):
    """Allow source-linked added specificity; known scientific differences stay distinct."""
    mappings = {kind: {link['r2_id']: link['r3_id'] for link in links
        if link['section'] == kind and link['relation'] in ('same', 'supplement')}
        for kind in ('populations', 'arms')}
    populations = [{p['id']: p for p in record['populations']} for record in (old, new)]
    def population(a, b, seen=()):
        if (a, b) in seen or mappings['populations'].get(a) != b:
            return False
        left, right = populations[0].get(a), populations[1].get(b)
        if not left or not right or left['scope'] != right['scope'] or left['melanoma_only'] != 'yes' or right['melanoma_only'] != 'yes':
            return False
        if not _extends(left['cutoff'], right['cutoff']) or not _label_expands(left['label'], right['label']):
            return False
        p, q = left['parent_id'], right['parent_id']
        return not present(p) and not present(q) or present(p) and present(q) and population(p, q, (*seen, (a, b)))
    if not population(before['population_id'], after['population_id']):
        return False
    drugs = {}
    for drug in catalog.get('drugs', []):
        for name in [drug.get('drug_id'), drug.get('generic_name'), *drug.get('brands', []), *drug.get('development_codes', []), *drug.get('synonyms', [])]:
            if name:
                drugs[_text(name)] = drug
    canonical_name = lambda value: _text(drugs.get(_text(value), {}).get('generic_name', value))
    def administration(a, b):
        route = lambda value: {'iv': 'intravenous', 'i.v.': 'intravenous', 'sc': 'subcutaneous'}.get(_text(value), _text(value))
        dose = lambda value: re.sub(r'\s+', '', _text(value).replace('²', '2').replace('μ', 'µ'))
        if present(a['dose']) and (not present(b['dose']) or dose(a['dose']) != dose(b['dose'])):
            return False
        if present(a['route']) and (not present(b['route']) or route(a['route']) != route(b['route'])):
            return False
        if _extends(a['schedule'], b['schedule']):
            return True
        # Only a previously unspecified within-cycle day may be added to an
        # otherwise exact frequency. Do not normalize differing durations/caps.
        return bool(re.fullmatch(r'day \d+(?:[–-]\d+)?;\s*' + re.escape(_text(a['schedule'])), _text(b['schedule'])))
    def target(value):
        name = re.sub(r'[^a-z0-9]', '', _text(value))
        for key in ('pd1', 'pdl1', 'ctla4', 'lag3'):
            if name in {key, 'anti' + key, key + 'inhibitor', key + 'inhibitors', 'anti' + key + 'inhibitor', 'anti' + key + 'inhibitors'}:
                return key
        return None
    def arm(a, b):
        if not present(a) or not present(b):
            return not present(a) and not present(b)
        if mappings['arms'].get(a) != b:
            return False
        left = next((r for r in old['arms'] if r['id'] == a), None)
        right = next((r for r in new['arms'] if r['id'] == b), None)
        if not left or not right or not population(left['population_id'], right['population_id']):
            return False
        nodes = [{n['id']: n for n in r['nodes']} for r in (left, right)]
        current_arm_text = ' '.join(source_spans.get(e, '') for e in right['evidence'])
        def named_in_current_arm(node):
            drug = drugs.get(_text(node.get('name')), {})
            names = [node.get('name'), drug.get('generic_name'), *drug.get('brands', []),
                     *drug.get('development_codes', []), *drug.get('synonyms', [])]
            return any(name and re.search(r'(?<!\w)' + re.escape(name) + r'(?!\w)', current_arm_text, re.I) for name in names)
        def visit(x, y, seen=()):
            if (x, y) in seen:
                return False
            p, q = nodes[0].get(x), nodes[1].get(y)
            if not p or not q or not administration(p, q):
                return False
            if p['kind'] == 'class' and q['kind'] == 'OR' and not p['children'] and len(q['children']) >= 2:
                expected = target(p['name'])
                choices = [nodes[1].get(child, {}) for child in q['children']]
                return bool(expected and all(n.get('kind') == 'drug' and not n.get('children') and
                    administration(p, n) and named_in_current_arm(n) and drugs.get(_text(n.get('name')), {}).get('is_checkpoint_inhibitor') is True and
                    expected in {re.sub(r'[^a-z0-9]', '', _text(t)) for t in drugs[_text(n['name'])].get('targets', [])}
                    for n in choices))
            if p['kind'] != q['kind'] or p['kind'] == 'UNKNOWN':
                return False
            if p['kind'] not in ('AND', 'OR', 'SEQUENTIAL'):
                return not p['children'] and not q['children'] and canonical_name(p['name']) == canonical_name(q['name'])
            if len(p['children']) != len(q['children']):
                return False
            next_seen = (*seen, (x, y))
            if p['kind'] == 'SEQUENTIAL':
                return all(visit(i, j, next_seen) for i, j in zip(p['children'], q['children']))
            matches = [[j for j in q['children'] if visit(i, j, next_seen)] for i in p['children']]
            return all(len(m) == 1 for m in matches) and len({m[0] for m in matches}) == len(matches)
        return visit(left['root_id'], right['root_id'])
    sides = ('intervention_arm_id', 'reference_arm_id') if section == 'effects' else ('arm_id',)
    if not all(arm(before.get(side), after.get(side)) for side in sides):
        return False
    if old['study']['comparison_structure'] != new['study']['comparison_structure']:
        return False
    keys = ('origin', 'endpoint', 'cutoff', 'measure', 'kind', 'time', 'time_unit',
        'assessment_time', 'response_criteria', 'safety_attribution', 'adjusted', 'model', 'p_test', 'p_sidedness')
    if section == 'sample_sizes':
        if present(before.get('result_id')) or present(after.get('result_id')):
            return False
        keys = ('cutoff', 'count_purpose', 'method', 'disjoint', 'complete')
    return all(_extends(before.get(k), after.get(k)) for k in keys) and _label_expands(before.get('endpoint_definition'), after.get('endpoint_definition'))


def _projected(article, section, ident):
    rows = article['sample_size_records'] if section == 'sample_sizes' else article['quantitative_results']
    return next((r for r in rows if r.get('quantitative_record', {}).get('id') == ident and
                 (section == 'sample_sizes' or
                  (section == 'effects' and 'intervention_arm_id' in r['quantitative_record']) or
                  (section == 'survival' and 'kind' in r['quantitative_record']) or
                  (section == 'binary' and 'numerator' in r['quantitative_record']))), None)


def _number_value(row, field):
    value = row.get(field) or {}
    return (value.get('value'), value.get('unit'), value.get('qualifier'))


def _suppress(row, representative):
    row['main_result_eligible'] = False
    row['display_duplicate_of'] = representative.get('result_id') or representative.get('sample_record_id')


def _supplement(old, new, links, old_record, new_record, catalog, source_spans):
    """Keep original compact records; change only a reversible, proven display projection."""
    actions = []
    for link in links:
        section = link.get('section')
        if section not in COLLECTIONS:
            continue
        prior = next((r for r in old_record[section] if r['id'] == link['r2_id']), None)
        following = next((r for r in new_record[section] if r['id'] == link['r3_id']), None)
        left, right = _projected(old, section, link['r2_id']), _projected(new, section, link['r3_id'])
        if prior is None or following is None or left is None or right is None:
            continue
        if section != 'sample_sizes' and left['measure'] != right['measure']:
            actions.append({**deepcopy(link), 'display_action': 'different_reported_forms_kept_separate'})
            continue
        context = _context(old_record, section, prior)
        new_context = _context(new_record, section, following)
        refined = context is not None and new_context is not None and context != new_context and _linked_context_refinement(old_record, new_record, section, prior, following, links, catalog, source_spans)
        if context is None or (context != new_context and not refined):
            actions.append({**deepcopy(link), 'display_action': 'separate_contexts'})
            continue
        if any(sum(_context(record, section, row) == own for row in record[section]) != 1
               for record, own in ((old_record, context), (new_record, new_context))):
            actions.append({**deepcopy(link), 'display_action': 'ambiguous_context_kept_separate'})
            continue
        fields = ('n',) if section == 'sample_sizes' else (*NUMBER_FIELDS, *CI_FIELDS)
        differing = [key for key in fields if numeric(_number_value(left, key)[0]) and
                     numeric(_number_value(right, key)[0]) and _number_value(left, key) != _number_value(right, key)]
        if link['relation'] == 'conflict' or differing:
            left['extraction_conflict'] = right['extraction_conflict'] = True
            actions.append({**deepcopy(link), 'display_action': 'conflict_preserved', 'fields': differing})
            continue
        if refined:
            # The more complete full-text context owns the display. Any accepted
            # abstract-only number is copied with its original source wrapper.
            left, right = right, left
        if section == 'sample_sizes':
            if _number_value(left, 'n') == _number_value(right, 'n'):
                _suppress(right, left)
                actions.append({**deepcopy(link), 'display_action': 'refined_count_grouped' if refined else 'duplicate_count_grouped'})
            continue
        fill = [key for key in NUMBER_FIELDS if not numeric(_number_value(left, key)[0]) and numeric(_number_value(right, key)[0])]
        # Never splice bounds/levels from distinct intervals into a synthetic CI.
        if all(not numeric(_number_value(left, key)[0]) for key in ('ci_lower', 'ci_upper')) and all(numeric(_number_value(right, key)[0]) for key in CI_FIELDS) and not any(right[key].get('derived') for key in CI_FIELDS):
            fill.extend(key for key in CI_FIELDS if not numeric(_number_value(left, key)[0]))
        remaining = [key for key in CI_FIELDS if not numeric(_number_value(left, key)[0]) and numeric(_number_value(right, key)[0]) and key not in fill]
        if remaining:
            actions.append({**deepcopy(link), 'display_action': 'incomplete_interval_kept_separate'})
            continue
        if fill:
            left.setdefault('raw_source_record', deepcopy(left))
            left.setdefault('display_supplements', [])
            for key in fill:
                left[key] = deepcopy(right[key])
                left['display_supplements'].append({'field': key, 'source_result_id': right['result_id'],
                    'review_stage': right['review_stage'], 'source_input_sha256': right['source_input_sha256']})
            if 'analysis_n' in fill:
                left['scoped_sample_size'] = deepcopy(right['scoped_sample_size'])
                left['sample_size_basis'] = right['sample_size_basis']
            left['evidence_ids'] = list(dict.fromkeys([*left['evidence_ids'], *right['evidence_ids']]))
            left['reported_numbers'] = [deepcopy(left[k]) for k in ('estimate', *CI_FIELDS, 'p_value', 'numerator', 'denominator') if numeric(left[k]['value'])]
            left['source_reported_numbers'] = [deepcopy(n) for n in left['reported_numbers'] if not n.get('derived')]
        _suppress(right, left)
        actions.append({**deepcopy(link), 'display_action': 'refined_context_supplemented' if refined and fill else 'refined_context_grouped' if refined else 'supplemented' if fill else 'duplicate_result_grouped', 'fields': fill})
    return actions


def project_fulltext(baseline, *, baseline_ref, phase_id, reports, records, snapshot=None, drug_catalog=None, catalog_ref=None):
    """Pure publication projection; completed source-bound report reviews only."""
    if baseline.get('mode') != 'pilot' or baseline.get('publication_ready') is not True or baseline.get('fulltext_assessment') or baseline.get('pending_reports'):
        raise ValueError('Frozen completed R2 cohort publication required')
    payload = deepcopy(baseline)
    compact = {a['pmid']: a for a in payload['articles']}
    clinical = {a['pmid']: a for a in payload['clinical_evidence']['articles']}
    by_report = {r['pmid']: r for r in reports}
    completed = {r['validation']['record']['pmid']: r for r in records}
    if len(by_report) != len(reports) or len(completed) != len(records):
        raise ValueError('One R3 source task and accepted record per report required')
    for pmid, report in by_report.items():
        if pmid not in compact or len(compact[pmid]['records']) != 1:
            raise ValueError('R3 report is outside frozen R2 scope')
        r2 = compact[pmid]['records'][0]['record']
        if r2['stage'] != 'R2' or r2['decision']['status'] not in ('retain', 'unclear') or clinical[pmid].get('publication_hold'):
            raise ValueError('R2 exclusion/publication hold cannot enter R3')
        if type(report.get('entered')) is not bool or type(report.get('report_complete')) is not bool:
            raise ValueError('Explicit R3 entry and coverage status required')
        if report.get('technical_state') not in COMPLETE | PENDING_STATES | {'source_or_request_hold'}:
            raise ValueError('Unknown R3 technical state cannot be published')
        if (pmid in completed) != (report['technical_state'] in COMPLETE) or (report['report_complete'] and pmid not in completed):
            raise ValueError('Only accepted full-source report responses establish completion')
        if report.get('eligibility_finished', pmid in completed) != (pmid in completed):
            raise ValueError('R3 eligibility completion differs from accepted result')
    if set(completed) - set(by_report):
        raise ValueError('Unplanned R3 record cannot be published')
    decisions = Counter()
    unclear = []
    actions = []
    for pmid, result in completed.items():
        report = by_report[pmid]
        saved_r2 = compact[pmid]['records'][0]
        if result.get('R2_record') != saved_r2['record'] or not report['entered'] or result['task_id'] != report['task_id']:
            raise ValueError('R3 must bind the exact frozen R2 record and actual task')
        validation = result['validation']; record = validation['record']
        if not validation.get('valid') or validation.get('global_errors') or record['stage'] != 'R3':
            raise ValueError('Accepted R3 validation required')
        citation = {k: clinical[pmid].get(k) for k in ('pmid', 'report_id', 'title', 'year', 'doi', 'first_author_surname', 'publication_hold')}
        incoming, evidence = project_article(citation, result, allow_fulltext=True)
        existing = clinical[pmid]
        links = record.get('r2_links', [])
        uses = {key: Counter((link['section'], link[key]) for link in links) for key in ('r2_id', 'r3_id')}
        safe_links = []
        for link in links:
            if any(uses[key][(link['section'], link[key])] != 1 for key in uses):
                actions.append({'pmid': pmid, **deepcopy(link), 'display_action': 'ambiguous_links_kept_separate'})
            else:
                safe_links.append(link)
        actions.extend({'pmid': pmid, **action} for action in _supplement(existing, incoming,
            safe_links, saved_r2['record'], record, drug_catalog or {},
            {s['span_id']: s['text'] for s in catalog_for(result['source'])['spans']}))
        for key, value in evidence.items():
            prior = payload['clinical_evidence']['evidence_registry'].get(key)
            if prior is not None and prior != value:
                raise ValueError('Full-text source ID collision')
            payload['clinical_evidence']['evidence_registry'][key] = value
        for key in ('quantitative_results', 'sample_size_records', 'comparisons', 'reviews'):
            existing[key].extend(incoming[key])
        for key in ('current_screening_status', 'current_main_eligible', 'decision_reason'):
            existing[key] = incoming[key]
        existing['current_review_stage'] = 'R3'
        existing['R3_report_complete'] = report['report_complete']
        for row in existing['quantitative_results']:
            row['main_result_eligible'] = bool(existing['current_main_eligible'] and not row.get('display_duplicate_of') and
                row.get('population', {}).get('population_scope') == 'melanoma' and numeric(row['estimate']['value']))
        for row in existing['sample_size_records']:
            row['main_result_eligible'] = bool(existing['current_main_eligible'] and not row.get('display_duplicate_of'))
        visible_ids = {row['result_id'] for row in existing['quantitative_results'] if row['main_result_eligible']}
        for comparison in existing['comparisons']:
            allowed = existing['current_main_eligible'] and (any(i in visible_ids for i in comparison['result_ids']) or
                comparison.get('result_relation') == 'patient_context')
            comparison['comparison_filter_eligible'] = bool(allowed)
            comparison['comparator_filter_eligible'] = bool(allowed and comparison.get('comparator_arm_id'))
        compact[pmid]['records'].append({'stage': 'R3', 'task_id': result['task_id'], 'review_origin': 'model_extraction',
            'artifact_ref': deepcopy(result['artifact_ref']), 'R2_artifact_ref': deepcopy(result['R2_artifact_ref']),
            'source_proof_ref': deepcopy(result['source_proof_ref']),
            'record': deepcopy(record), 'issues': deepcopy(validation.get('issues', []))})
        decision = record['decision']; decisions[decision['status']] += 1
        if decision['status'] == 'unclear':
            unclear.append({'pmid': pmid, 'reason': decision['reason']})
    timestamp = now()
    assessment = {'schema_version': 1, 'phase_id': phase_id, 'R2_publication_ref': deepcopy(baseline_ref),
        'reports': deepcopy(reports), 'publication_snapshot': deepcopy(snapshot),
        'planned_reports': len(reports), 'main_article_extraction_finished': len(completed),
        'full_report_extraction_finished': sum(r['report_complete'] for r in reports),
        'fragment_completions_are_report_completions': False, 'display_reconciliation': actions}
    if catalog_ref:
        assessment['reconciliation_drug_catalog_ref'] = deepcopy(catalog_ref)
    payload.update(phase_id=phase_id, as_of=timestamp, fulltext_assessment=assessment)
    payload['about_progress']['as_of'] = timestamp
    payload['about_progress']['stage_scope'] = ['R2', 'R3']
    payload['about_progress']['stages']['R3'] = {'unit': 'articles', 'entered': sum(r['entered'] for r in reports),
        'screening_finished': len(completed), 'retained': decisions['retain'], 'excluded': decisions['exclude'],
        'unclear': decisions['unclear'], 'unclear_reports': unclear}
    payload['clinical_evidence']['as_of'] = timestamp
    payload['clinical_evidence']['content_sha256'] = digest(canonical({k: payload['clinical_evidence'][k] for k in ('articles', 'evidence_registry')}))
    return payload


def publication_inputs(root, plan_ref):
    """Read one journal snapshot and verify every immutable source/result binding."""
    from . import fulltext_reextraction
    root = Path(root).resolve()
    snapshot = fulltext_reextraction.snapshot(root, plan_ref)
    baseline_ref = snapshot['R2_publication_ref']
    baseline = verified_json(root, baseline_ref)
    originals = {a['pmid']: a['records'][0]['record'] for a in baseline['articles']}
    records = []
    for result in snapshot['records']:
        saved = verified_json(root, result['artifact_ref'])
        prior = verified_json(root, result['R2_artifact_ref'])
        proof = verified_json(root, result['source_proof_ref'])
        record = prior['validated']['record']
        pmid = result['validation']['record']['pmid']
        if (saved['validated'] != result['validation'] or saved['task_id'] != result['task_id'] or
                saved.get('pmid') != pmid or saved.get('stage') != 'R3' or
                record != originals.get(pmid) or result['source'].get('upstream_R2') != record or
                verified_json(root, saved['source_ref']) != result['source'] or
                result.get('whole_source_packet') is not True or
                proof.get('main_article_complete') is not True or
                proof.get('source_ref') != saved['source_ref'] or
                proof.get('R2_artifact_ref') != result['R2_artifact_ref'] or
                proof.get('pmid') != pmid or
                result['report_complete'] != (proof.get('source_report_coverage_complete') is True)):
            raise ValueError('R3 publication binding differs from immutable source/result proof')
        records.append({**result, 'R2_record': record})
    metadata = {'read_only': True, 'captured_at': snapshot['status']['as_of'],
        'plan_ref': deepcopy(snapshot['plan_ref']), 'event_head': deepcopy(snapshot['event_head']),
        'completed_artifact_refs': [deepcopy(r['artifact_ref']) for r in records]}
    catalog_path = root / 'config/drug_catalog.json'
    catalog_ref = reference(root, catalog_path) if catalog_path.is_file() else None
    catalog = verified_json(root, catalog_ref) if catalog_ref else {}
    return project_fulltext(baseline, baseline_ref=baseline_ref,
        phase_id=snapshot['plan']['phase_id'], reports=snapshot['reports'], records=records,
        snapshot=metadata, drug_catalog=catalog, catalog_ref=catalog_ref)


def publish_plan(root, plan_ref):
    return publish(root, publication_inputs(root, plan_ref))


def _check_publication_predecessor(previous, payload):
    """A delayed periodic publication cannot replace a later current R3 snapshot."""
    baseline_ref = payload['fulltext_assessment']['R2_publication_ref']
    if digest(previous) == baseline_ref['sha256']:
        return
    old = json.loads(previous)
    from .user_dispositions import check_preserved
    check_preserved(old, payload)
    before = old.get('fulltext_assessment') or {}
    after = payload['fulltext_assessment']
    if before.get('R2_publication_ref') != baseline_ref or before.get('phase_id') != after['phase_id']:
        raise ValueError('Current publication belongs to a different frozen cohort or phase')
    old_tasks = {r['task_id'] for r in before['reports'] if r['technical_state'] in COMPLETE}
    new_tasks = {r['task_id'] for r in after['reports'] if r['technical_state'] in COMPLETE}
    old_head = ((before.get('publication_snapshot') or {}).get('event_head') or {}).get('seq')
    new_head = ((after.get('publication_snapshot') or {}).get('event_head') or {}).get('seq')
    if not old_tasks <= new_tasks or (old_head is not None and (new_head is None or new_head < old_head)):
        raise ValueError('A stale R3 snapshot cannot regress published progress')


def publish(root, payload):
    """Publish a prepared projection; this function has no model transport."""
    root = Path(root).resolve()
    if not payload.get('fulltext_assessment'):
        raise ValueError('Explicit R3 publication contract required')
    from .user_dispositions import apply
    payload = apply(root, payload)
    result = subprocess.run(['node', str(owned(root, 'website/scripts/regimen_projection.cjs'))],
        input=json.dumps(payload['clinical_evidence'], ensure_ascii=False, separators=(',', ':'), allow_nan=False),
        text=True, capture_output=True, timeout=180)
    if result.returncode:
        raise ValueError('R3 regimen projection failed: ' + result.stderr[-2000:])
    payload = deepcopy(payload); payload['clinical_evidence'] = json.loads(result.stdout)
    payload['clinical_evidence']['content_sha256'] = digest(canonical({key: payload['clinical_evidence'][key]
        for key in ('articles', 'evidence_registry')}))
    checker = "const fs=require('fs');const p=JSON.parse(fs.readFileSync(0,'utf8'));require('./website/dist/quantitative_extraction.js').checked(p);require('./website/dist/clinical_evidence.js').checked(p.clinical_evidence);"
    checked = subprocess.run(['node', '-e', checker],
        input=json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False), cwd=root,
        text=True, capture_output=True, timeout=90)
    if checked.returncode:
        raise ValueError('R3 browser contract failed: ' + checked.stderr[-2000:])
    public = owned(root, PUBLIC)
    history = owned(root, 'data/current/reextraction/' + payload['phase_id'] + '/publications')
    # This independent presentation lock never acquires the model writer lease.
    lock = owned(root, 'data/current/fulltext_publication.lock')
    handle = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        previous_ref = None
        if public.exists():
            previous = public.read_bytes()
            _check_publication_predecessor(previous, payload)
            old = history / (digest(previous) + '.json')
            if old.exists() and old.read_bytes() != previous:
                raise ValueError('Existing publication archive differs')
            if not old.exists():
                atomic_bytes(old, previous)
            previous_ref = reference(root, old)
        # The full source/provenance objects are retained. Compact transport avoids
        # inflating the browser's JSON string as full-text reviews accumulate.
        from .clinical_classification import write as write_classifications
        from .treatment_normalization import publication as treatment_publication
        public_bytes = canonical(payload)
        with treatment_publication(root, payload, source_bytes=public_bytes) as treatment_ref:
            classification_ref = write_classifications(root, payload, source_bytes=public_bytes)
            atomic_bytes(public, public_bytes)
        from .evidence_freshness import write as write_freshness
        freshness_ref = write_freshness(root)
    finally:
        fcntl.flock(handle, fcntl.LOCK_UN)
        os.close(handle)
    return {'evidence_freshness': freshness_ref, 'treatment_normalizations': treatment_ref, 'clinical_classifications': classification_ref, 'status': 'R3_cohort_published', 'public_ref': reference(root, public),
        'previous_publication_ref': previous_ref, 'counts': payload['about_progress']['stages'],
        'full_report_extraction_finished': payload['fulltext_assessment']['full_report_extraction_finished'],
        'new_model_requests': 0}
