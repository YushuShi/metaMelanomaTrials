"""Publish a complete compact R2 scope without altering historical datasets."""
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path
import json
import math
import re
import subprocess

from .io import atomic_bytes, atomic_json, canonical, digest, now, owned, read_json, reference, verified_json
from .screening import catalog_for

PUBLIC = 'website/dist/data/quantitative_extraction.json'
FLAGS = ('clinical_validation', 'clinical_verified', 'pooling_eligible',
         'report_R3_complete', 'final_R3_complete', 'numerical_extraction_complete',
         'source_report_coverage_complete')
FAMILIES = {'OS': 'overall_survival', 'PFS': 'progression_free_survival',
    'RFS': 'recurrence', 'DFS': 'disease_free_survival', 'EFS': 'event_free_survival',
    'DMFS': 'distant_metastasis_free_survival', 'DSS': 'disease_specific_survival',
    'DOR': 'duration_of_response', 'ORR': 'response', 'CR': 'complete_response',
    'PR': 'partial_response', 'DCR': 'disease_control', 'pCR': 'pathological_complete_response'}
PENDING_STATES = frozenset(('pending', 'retry_wait', 'running', 'not_sent',
    'held_unknown_send', 'validation_hold', 'provider_hold', 'held_integrity'))


def numeric(value):
    return type(value) in (int, float) and math.isfinite(value)


def present(value):
    return value not in (None, '', 'NA')


def wrap(value, role, evidence, unit=None):
    return {'role': role, 'status': 'reported' if numeric(value) else 'not_reported',
        'value': value if numeric(value) else None,
        'raw_text': str(value) if numeric(value) else None, 'unit': unit,
        'qualifier': 'equal' if numeric(value) else 'not_reported',
        'evidence_ids': list(evidence)}


def regimen_label(arm):
    if not arm:
        return None
    nodes = {n['id']: n for n in arm.get('nodes', [])}
    def visit(ident, parents=()):
        if ident in parents or ident not in nodes:
            raise ValueError('Invalid validated regimen graph')
        n = nodes[ident]
        if n['kind'] not in ('AND', 'OR', 'SEQUENTIAL'):
            return n['name'] if present(n['name']) else 'Unspecified treatment'
        children = [visit(c, (*parents, ident)) for c in n['children']]
        joined = {'AND': ' + ', 'OR': ' OR ', 'SEQUENTIAL': ' → '}[n['kind']].join(children)
        return '(' + joined + ')' if parents and n['kind'] != 'SEQUENTIAL' else joined
    return visit(arm['root_id'])


def selected_n(row, record, *, collection):
    """Use the same scoped patient-count resolver as extraction validation."""
    from .quantitative import select_sample_size
    selected = select_sample_size(row, record['sample_sizes'], section=collection, arms=record['arms'])
    by_id = {s['id']: s for s in record['sample_sizes']}
    evidence = list(dict.fromkeys(e for ident in selected['count_ids']
        for e in by_id.get(ident, {}).get('evidence', [])))
    if not selected['count_ids'] and numeric(selected['n']):
        evidence = row.get('evidence', [])
    basis = ('sum_' if selected['status'] == 'derived_arm_sum' else '') + selected['count_purpose']
    if selected['status'] == 'CONFLICTING': basis = 'conflicting'
    return selected['n'], basis, evidence


def project_article(citation, result, *, allow_fulltext=False):
    validation = result['validation']
    if not validation.get('valid') or validation.get('global_errors'):
        raise ValueError('A completed source-validated pilot response is required')
    record, source = validation['record'], result['source']
    pmid, report_id = str(citation['pmid']), citation['report_id']
    stage = record['stage']
    if record['pmid'] != pmid or record['report_id'] != report_id or stage not in ('R2', 'R3') or (stage == 'R3' and not allow_fulltext):
        raise ValueError('Pilot record identity mismatch')
    if stage == 'R3' and (source.get('stage') != 'R3' or source.get('main_full_text_verified') is not True):
        raise ValueError('R3 projection requires verified full-text source')
    binding = digest(canonical({'task_id': result['task_id'], 'record': record}))
    prefix = 'CE-' + binding[:24] + '-'
    catalog = catalog_for(source)
    evidence = {prefix + s['span_id']: {'source_id': s['source_id'], 'block_id': s['block_id'],
        'supporting_quote': s['text']} for s in catalog['spans']}
    def ids(values):
        out = [prefix + value for value in values]
        if not all(i in evidence for i in out):
            raise ValueError('Foreign pilot source span')
        return out
    populations = {p['id']: p for p in record['populations']}
    arms = {a['id']: a for a in record['arms']}
    def population(ident):
        p = populations.get(ident)
        return None if p is None else {'entity_id': ident, 'kind': 'population',
            'label': p['label'], 'population_scope': 'melanoma' if p['melanoma_only'] == 'yes' else 'mixed_cancers' if p['melanoma_only'] == 'no' else 'unclear',
            'parent_id': p['parent_id'] if present(p['parent_id']) else None,
            'evidence_ids': ids(p['evidence']), 'result_scope': p['scope']}
    def arm(ident):
        a = arms.get(ident)
        return None if a is None else {'entity_id': ident, 'kind': 'arm',
            'label': regimen_label(a), 'evidence_ids': ids(a['evidence'])}
    def native(a):
        if not a:
            return None
        return {'arm_id': a['id'], 'label': regimen_label(a), 'root_node_id': a['root_id'],
            'evidence_ids': ids(a['evidence']), 'nodes': [
                {'node_id': n['id'], 'kind': 'other' if n['kind'] == 'control' else n['kind'],
                 'name': n['name'] if present(n['name']) else None, 'drug_class': None,
                 'children': n['children'], 'dose': n['dose'] if present(n['dose']) else None,
                 'route': n['route'] if present(n['route']) else None,
                 'schedule': n['schedule'] if present(n['schedule']) else None,
                 'evidence_ids': ids(a['evidence'])} for n in a['nodes']]}
    publication_hold = citation.get('publication_hold') or False
    eligible = record['decision']['status'] == 'retain' and not publication_hold
    rows, samples, comparisons = [], [], []
    common = {'report_id': report_id, 'pmid': pmid, 'review_stage': stage, 'reviewer': 'Luna' if stage == 'R3' else 'Sol',
        'review_binding_sha256': binding, 'source_input_sha256': record['source_sha256'],
        'scope': 'observed', 'evidence_origin': 'own_report_results', 'validated': False,
        'API_verification_pending': False, **{f: False for f in FLAGS}}
    for collection in ('effects', 'survival', 'binary'):
        for r in record[collection]:
            p = population(r['population_id'])
            if r.get('origin') != 'own_report':
                continue
            effect = collection == 'effects'
            a = arm(r.get('arm_id')) if not effect else None
            experimental = arm(r.get('intervention_arm_id')) if effect else a
            comparator = arm(r.get('reference_arm_id')) if effect else None
            if not effect and a:
                pairs = {(e['intervention_arm_id'], e['reference_arm_id']) for e in record['effects']
                    if e['origin'] == 'own_report' and e['population_id'] == r['population_id']
                    and a['entity_id'] in (e['intervention_arm_id'], e['reference_arm_id'])
                    and e['intervention_arm_id'] in arms and e['reference_arm_id'] in arms}
                if len(pairs) == 1:
                    intervention_id, reference_id = pairs.pop()
                    experimental, comparator = arm(intervention_id), arm(reference_id)
            paired = bool(experimental and comparator)
            contrast = 'treatment_comparison' if paired else 'single_arm' if record['study']['comparison_structure'] == 'single_group' else 'other'
            measure = r['measure'] if effect else ('median' if r['kind'] == 'median' else 'survival_probability') if collection == 'survival' else ('participant_count' if not numeric(r['percentage']) else r['endpoint'] if r['endpoint'] in ('ORR', 'CR', 'PR', 'DCR', 'pCR') else 'event_probability')
            estimate = r['estimate'] if collection != 'binary' else r['percentage'] if numeric(r['percentage']) else r['numerator']
            unit = None if effect else 'months' if collection == 'survival' and r['kind'] == 'median' else '%' if collection == 'survival' or numeric(r.get('percentage')) else 'patients'
            anchors = ids(r['evidence']); rid = prefix + 'F-' + digest(canonical([collection, r['id']]))[:16]
            cid = prefix + 'C-' + digest(canonical([r['population_id'], (experimental or {}).get('entity_id'), (comparator or {}).get('entity_id'), r.get('arm_id')]))[:16]
            n, n_basis, n_sources = selected_n(r, record, collection=collection)
            scoped_n = {'n': n, 'basis': n_basis, 'status': 'CONFLICTING' if n_basis == 'conflicting' else 'available' if numeric(n) else 'missing', 'evidence_ids': ids(n_sources)}
            main = bool(eligible and p and p['population_scope'] == 'melanoma' and numeric(estimate))
            row = {**common, 'result_id': rid, 'record_kind': 'canonical_clinical_fact',
                'comparison_id': cid, 'variable': r['endpoint'], 'measure': measure,
                'display_measure': measure, 'measure_verbatim': measure,
                'endpoint': {'family': FAMILIES.get(r['endpoint'], 'adverse_events'),
                    'definition': {'text': r['endpoint_definition'] if present(r['endpoint_definition']) else r['endpoint'], 'evidence_ids': anchors}},
                'population_id': prefix + r['population_id'], 'population': p,
                'arm_id': prefix + a['entity_id'] if a else None, 'arm': a,
                'experimental_arm': experimental, 'comparator_arm': comparator,
                'model_id': None, 'model': None, 'cutoff': {'label': r['cutoff']} if present(r['cutoff']) else None,
                'contrast_type': contrast,
                'result_relation': 'between_arm' if effect else 'arm_specific',
                'evidence_ids': anchors, 'main_result_eligible': main,
                'original_fact': {'field': r['endpoint'], 'result_population_id': r['population_id'],
                    'arm_id': r.get('arm_id') if present(r.get('arm_id')) else None,
                    'contrast_type': contrast, 'scope': 'observed'},
                'quantitative_record': deepcopy(r), 'sample_size_basis': n_basis,
                'scoped_sample_size': scoped_n,
                'estimate': wrap(estimate, 'estimate', anchors, unit),
                'ci_lower': wrap(r['ci_lower'], 'ci_lower', anchors, unit),
                'ci_upper': wrap(r['ci_upper'], 'ci_upper', anchors, unit),
                'confidence_level': wrap(r['ci_level'], 'confidence_level', anchors, '%'),
                'p_value': wrap(r.get('p_value'), 'p_value', anchors),
                'analysis_n': wrap(n, 'sample_size', ids(n_sources), 'patients'),
                'denominator': wrap(r.get('denominator'), 'denominator', anchors, 'patients'),
                'numerator': wrap(r.get('numerator'), 'numerator', anchors, 'patients'),
                'denominator_type': 'endpoint_specific'}
            row['reported_numbers'] = [row[k] for k in ('estimate', 'ci_lower', 'ci_upper', 'confidence_level', 'p_value', 'numerator', 'denominator') if row[k]['value'] is not None]
            derived_fields = {d['field'] for d in record.get('derivations', []) if d['section'] == collection and d['id'] == r['id']}
            if 'ci' in derived_fields:
                derived_fields.update(('ci_lower', 'ci_upper', 'confidence_level'))
            if 'ci_level' in derived_fields:
                derived_fields.add('confidence_level')
            row['source_reported_numbers'] = [deepcopy(x) for x in row['reported_numbers'] if x['role'] not in derived_fields]
            for role in derived_fields:
                if isinstance(row.get(role), dict):
                    row[role]['derived'] = True
            rows.append(row)
            comparison = next((c for c in comparisons if c['comparison_id'] == cid), None)
            if comparison is None:
                comparison = {'comparison_id': cid, 'kind': 'treatment_comparison' if effect else 'single_arm' if contrast == 'single_arm' else 'arm_specific_result',
                    'scope': {'record_kind': 'canonical_review_scope', 'report_id': report_id,
                        'population_id': prefix + r['population_id'], 'review_stage': stage,
                        'source_input_sha256': record['source_sha256'], 'review_binding_sha256': binding},
                    'comparator_key': comparator['label'] if comparator else '__single_arm__' if contrast == 'single_arm' else None,
                    'comparator_label': comparator['label'] if comparator else 'No comparator' if contrast == 'single_arm' else None,
                    'comparator_arm_id': comparator['entity_id'] if comparator else None,
                    'intervention_arm_id': experimental['entity_id'] if experimental else None,
                    'additional_intervention_label': experimental['label'] if experimental else None,
                    'comparator_drug_ids': [], 'intervention_drug_ids': [], 'additional_intervention_drug_ids': [],
                    'additional_intervention_ids': [], 'comparison_filter_eligible': main,
                    'comparator_filter_eligible': bool(main and comparator), 'result_ids': [], 'population': p}
                if a:
                    comparison.update(outcome_arm_id=a['entity_id'], outcome_arm_label=a['label'],
                        outcome_native_regimen=native(arms[a['entity_id']]), result_relation='arm_specific')
                for side, own in (('comparator', comparator), ('intervention', experimental)):
                    if own:
                        comparison[side + '_native_regimen'] = native(arms[own['entity_id']])
                comparisons.append(comparison)
            comparison['result_ids'].append(rid)
            comparison['comparison_filter_eligible'] |= main
            comparison['comparator_filter_eligible'] |= bool(main and comparator)
    for s in record['sample_sizes']:
        p = population(s['population_id'])
        if not numeric(s['n']) or not p or p['population_scope'] != 'melanoma':
            continue
        purpose = {'ITT': 'eligible', 'outcome_analysis': 'eligible'}.get(s['count_purpose'], s['count_purpose'])
        if purpose not in ('enrolled', 'eligible', 'randomized', 'treated', 'response_evaluable', 'safety'):
            continue
        samples.append({**common, 'sample_record_id': prefix + 'N-' + s['id'],
            'record_kind': 'canonical_patient_context', 'n': wrap(s['n'], 'sample_size', ids(s['evidence']), 'patients'),
            'population_id': prefix + s['population_id'], 'population': p,
            'arm_id': prefix + s['arm_id'] if present(s['arm_id']) else None, 'arm': arm(s['arm_id']),
            'sample_context_role': purpose, 'quantity_label': s['count_purpose'],
            'evidence_ids': ids(s['evidence']), 'main_result_eligible': eligible,
            'original_fact': {'count_context': s['count_purpose'], 'result_population_id': s['population_id'], 'arm_id': s['arm_id'] if present(s['arm_id']) else None},
            'quantitative_record': deepcopy(s)})
    # An explicitly single-group report still has a searchable treatment when
    # its abstract supplies patient counts but no accepted numerical outcome.
    # Never infer a reference direction for a comparative report from arm order.
    if record['study']['comparison_structure'] == 'single_group':
        for a in record['arms']:
            p = population(a['population_id'])
            if not p or p['population_scope'] != 'melanoma':
                continue
            if any(c.get('intervention_arm_id') == a['id'] or c.get('comparator_arm_id') == a['id'] for c in comparisons):
                continue
            source_samples = [s for s in samples if s['population_id'] == prefix + a['population_id']]
            own_samples = [s for s in source_samples if (s.get('arm') or {}).get('entity_id') == a['id']]
            peers = [x for x in record['arms'] if x['population_id'] == a['population_id']]
            if not own_samples and not (len(peers) == 1 and any(s['arm_id'] is None for s in source_samples)):
                continue
            comparison = {'comparison_id': prefix + 'C-' + digest(canonical(['patient_context', a['population_id'], a['id']]))[:16],
                'kind': 'single_arm', 'scope': {'record_kind': 'canonical_review_scope', 'report_id': report_id,
                    'population_id': prefix + a['population_id'], 'review_stage': stage,
                    'source_input_sha256': record['source_sha256'], 'review_binding_sha256': binding},
                'comparator_key': '__single_arm__', 'comparator_label': 'No comparator',
                'comparator_arm_id': None, 'intervention_arm_id': a['id'],
                'additional_intervention_label': regimen_label(a), 'intervention_native_regimen': native(a),
                'comparator_drug_ids': [], 'intervention_drug_ids': [], 'additional_intervention_drug_ids': [],
                'additional_intervention_ids': [], 'comparison_filter_eligible': eligible,
                'comparator_filter_eligible': False, 'result_ids': [], 'population': p,
                'result_relation': 'patient_context'}
            if own_samples:
                comparison['outcome_arm_id'] = a['id']
            comparisons.append(comparison)
    authors = citation.get('authors') or []
    first = authors[0] if isinstance(authors, list) and authors else authors if isinstance(authors, str) else ''
    surname = citation.get('first_author_surname') or (first.get('family') or first.get('last_name') or first.get('surname') if isinstance(first, dict) else str(first).replace(',', ' ').split()[0] if str(first).strip() else '')
    article = {'pmid': pmid, 'report_id': report_id, 'title': citation['title'], 'year': citation.get('year'),
        'doi': citation.get('doi'), 'first_author_surname': surname,
        'current_screening_status': record['decision']['status'], 'current_main_eligible': eligible,
        'publication_hold': publication_hold, 'decision_reason': record['decision']['reason'],
        'quantitative_results': rows, 'sample_size_records': samples, 'comparisons': comparisons, 'reviews': []}
    return article, evidence


def project_pilot(plan, records):
    citations = {str(a['citation']['pmid']): a['citation'] for a in plan['articles']}
    by_pmid = {str(r['validation']['record']['pmid']): r for r in records}
    if len(citations) != len(plan['articles']) or len(records) != len(by_pmid) or set(citations) != set(by_pmid):
        raise ValueError('Every selected article must finish before pilot publication')
    articles, registry, compact = [], {}, []
    for pmid, citation in citations.items():
        result = by_pmid[pmid]
        article, evidence = project_article(citation, result)
        articles.append(article); registry.update(evidence)
        compact.append({'pmid': pmid, 'records': [{'stage': 'R2', 'task_id': result['task_id'],
            'review_origin': result.get('review_origin', 'model_extraction'),
            'source_availability_ref': deepcopy(result.get('source_availability_ref')),
            'record': deepcopy(result['validation']['record']), 'issues': deepcopy(result['validation'].get('issues', []))}]})
    counts = Counter(a['current_screening_status'] for a in articles)
    timestamp = now()
    clinical = {'schema_version': 1, 'status': 'ready', 'record_kind': 'canonical_clinical_evidence',
        'content_sha256': digest(canonical({'articles': articles, 'evidence_registry': registry})),
        'as_of': timestamp, 'articles': articles, 'evidence_registry': registry, **{f: False for f in FLAGS}}
    registry_groups = defaultdict(list)
    for a in compact:
        study = a['records'][0]['record']['study']
        for identifier in study['identifiers']:
            if re.fullmatch(r'NCT\d{8}', identifier['id'], re.I):
                registry_groups[identifier['id'].upper()].append(a['pmid'])
    linked = [{'identifier': k, 'pmids': v, 'independence_verified': False} for k, v in registry_groups.items() if len(v) > 1]
    return {'schema_version': 1, 'mode': 'pilot', 'publication_ready': True, 'phase_id': plan['phase_id'],
        'scope_kind': plan.get('scope_kind', 'pilot'),
        'source_plan_refs': deepcopy(plan.get('source_plan_refs', [])),
        'authorized_scope_pmids': deepcopy(plan.get('authorized_scope_pmids', list(citations))),
        'source_availability_holds': deepcopy(plan.get('source_availability_holds', [])),
        'pending_reports': deepcopy(plan.get('pending_reports', [])),
        'publication_snapshot': deepcopy(plan.get('publication_snapshot')),
        'scope_pmids': list(citations), 'as_of': timestamp, 'articles': compact,
        'clinical_evidence': clinical, 'study_links': linked, 'sampling': deepcopy(plan.get('sampling', {'method': 'explicit_scope', 'total': len(citations)})),
        'about_progress': {'schema_version': 1, 'unit': 'articles', 'as_of': timestamp,
            'timezone': 'America/New_York', 'stage_scope': ['R2'], 'stages': {'R2': {
                'unit': 'articles', 'entered': len(articles) + sum(p['entered'] for p in plan.get('pending_reports', [])), 'screening_finished': len(articles),
                'retained': counts['retain'], 'excluded': counts['exclude'], 'unclear': counts['unclear'],
                'unclear_reports': [{'pmid': a['pmid'], 'reason': a['decision_reason']} for a in articles if a['current_screening_status'] == 'unclear']}}}}


def combine_complete_cohort(parent_plan, continuation_plan, cohort, parent_records, continuation_records, *, source_holds=(), pending_reports=(), allow_pending=False):
    """Combine two disjoint completed scopes; never import superseded decisions."""
    expected = list(map(str, cohort['article_pmids']))
    parent_pmids = [str(a['citation']['pmid']) for a in parent_plan['articles']]
    next_pmids = [str(a['citation']['pmid']) for a in continuation_plan['articles']]
    if (not expected or len(expected) != len(set(expected))
            or len(parent_pmids) != len(set(parent_pmids)) or len(next_pmids) != len(set(next_pmids))
            or set(parent_pmids) & set(next_pmids) or set(parent_pmids + next_pmids) != set(expected)):
        raise ValueError('Publication requires the exact disjoint authorized R2 cohort')
    # Each prepared request must be complete. Only explicitly recorded source
    # holds may stay outside the clinical decision counts; they are not unclear
    # screening decisions and must never be filled with old results.
    project_pilot(parent_plan, parent_records)
    finished = {str(r['validation']['record']['pmid']) for r in continuation_records}
    missing = set(next_pmids) - finished
    holds = {str(h['pmid']): h for h in source_holds}
    pending = {str(p['pmid']): p for p in pending_reports}
    if pending and not allow_pending:
        raise ValueError('Unfinished R2 requests require explicit allow_pending publication')
    if (len(pending) != len(pending_reports) or set(pending) & set(holds) or not set(pending) <= missing
            or any(p.get('state') not in PENDING_STATES or type(p.get('entered')) is not bool
                or not p.get('task_id') or type(p.get('attempt_count')) is not int or p['attempt_count'] < 0
                for p in pending.values())):
        raise ValueError('Pending metadata must bind distinct prepared technical R2 states')
    if len(holds) != len(source_holds) or not set(holds) <= set(next_pmids) or not missing <= set(holds) | set(pending):
        raise ValueError('Unfinished R2 requests cannot be published as source holds')
    if any(str(a['citation'].get('abstract') or '').strip() for a in continuation_plan['articles'] if str(a['citation']['pmid']) in missing & set(holds)):
        raise ValueError('A request failure with available abstract is not an abstract-availability hold')
    next_plan = {**continuation_plan, 'articles': [a for a in continuation_plan['articles'] if str(a['citation']['pmid']) not in missing]}
    project_pilot(next_plan, continuation_records)
    articles = {str(a['citation']['pmid']): a for a in parent_plan['articles'] + continuation_plan['articles']}
    combined = {**deepcopy(continuation_plan), 'articles': [deepcopy(articles[p]) for p in expected if p not in missing],
        'scope_kind': 'r2_cohort_in_progress' if pending else 'r2_cohort_with_source_holds' if missing else 'complete_r2_cohort',
        'authorized_scope_pmids': expected,
        'source_availability_holds': [deepcopy(holds[p]) for p in expected if p in missing and p in holds],
        'pending_reports': [deepcopy(pending[p]) for p in expected if p in pending],
        'sampling': {'method': 'complete_authorized_cohort', 'total': len(expected)}}
    return combined, [*parent_records, *continuation_records]


def _publication_snapshot(root, plan_ref):
    """Capture refs in one read-only transaction; never acquire the writer lease."""
    from . import reextraction
    plan, _ = reextraction._plan(root, plan_ref)
    journal = reextraction.PilotJournal.__new__(reextraction.PilotJournal)
    journal.root, journal.phase = root, plan['phase_id']
    journal.db = reextraction._readonly(root, reextraction.DB_PATH)
    journal.db.execute('BEGIN')
    try:
        original = journal.db.execute('SELECT authority_json FROM reextraction_phases WHERE phase_id=?', (journal.phase,)).fetchone()
        if original is None or json.loads(original[0]) != read_json(owned(root, f'data/current/reextraction/{journal.phase}/authority.json')):
            raise ValueError('Original prepared publication authority differs')
        authority = journal.phase_authority()
        if authority['plan_ref'] != plan_ref:
            raise ValueError('Exact prepared publication plan required')
        rows = [dict(row) for row in journal.task_rows()]
        attempts = {row['task_id']: dict(row) for row in journal.db.execute(
            "SELECT a.task_id,COUNT(*) attempt_count,MAX(CASE WHEN json_extract(a.record_json,'$.result.sent')=0 THEN 0 ELSE 1 END) entered "
            "FROM reextraction_attempts a JOIN reextraction_tasks t USING(task_id) WHERE t.phase_id=? GROUP BY a.task_id", (journal.phase,))}
        head = journal.db.execute('SELECT seq,event_hash FROM reextraction_events ORDER BY seq DESC LIMIT 1').fetchone()
        snapshot = {'captured_at': now(), 'phase_id': journal.phase, 'plan_ref': deepcopy(plan_ref),
            'event_head': dict(head) if head else None, 'read_only': True}
    finally:
        journal.db.close()
    # Release SQLite's read lock before reading the immutable source payloads.
    records, pending = [], []
    for row in rows:
        if row['state'] in ('complete', 'complete_with_issues'):
            ref = json.loads(row['result_ref_json']); value = verified_json(root, ref)
            if value['task_id'] != row['task_id'] or value['pmid'] != row['pmid'] or value['stage'] != 'R2':
                raise ValueError('Completed snapshot result identity differs')
            records.append({'task_id': row['task_id'], 'source': verified_json(root, value['source_ref']),
                'validation': value['validated'], 'artifact_ref': ref})
        else:
            if row['state'] not in PENDING_STATES:
                raise ValueError('Unknown prepared R2 state cannot be published')
            history = attempts.get(row['task_id'], {})
            pending.append({'pmid': row['pmid'], 'task_id': row['task_id'], 'state': row['state'],
                'entered': bool(history.get('entered', False)), 'attempt_count': history.get('attempt_count', 0)})
    for local in authority.get('local_dispositions', []):
        value = verified_json(root, local['artifact_ref'])
        if value['task_id'] != local['task_id'] or value['pmid'] != local['pmid']:
            raise ValueError('Local snapshot disposition identity differs')
        records.append({'task_id': local['task_id'], 'source': verified_json(root, value['source_ref']),
            'validation': value['validated'], 'artifact_ref': local['artifact_ref'],
            'review_origin': value['review_origin'], 'source_availability_ref': value['source_availability_ref']})
    snapshot['completed_artifact_refs'] = [deepcopy(r['artifact_ref']) for r in records]
    return plan, authority, records, pending, snapshot


def publication_inputs(root, plan_ref, *, allow_pending=False):
    """Read immutable plan/result references without dispatching model work."""
    from . import reextraction
    root = Path(root).resolve()
    plan, authority, records, pending, snapshot = _publication_snapshot(root, plan_ref)
    continuation = plan.get('continuation')
    if not continuation:
        if pending:
            raise ValueError('Partial publication is only available for an explicit continuation')
        return plan, records
    parent_ref = continuation['pilot_plan_ref']
    parent_plan, _ = reextraction._plan(root, parent_ref)
    frozen = authority.get('continuation') if authority else None
    if not frozen or authority['plan_ref'] != plan_ref or any(frozen[k] != continuation[k] for k in ('pilot_plan_ref', 'cohort_ref')):
        raise ValueError('Prepared continuation authority required for publication')
    # Reuse precisely the pilot validations accepted when this continuation was
    # prepared, even if a later independent review revises the pilot's pointer.
    parent_records = []
    for reused in frozen['reused_articles']:
        value = verified_json(root, reused['artifact_ref'])
        if value['task_id'] != reused['task_id'] or value['pmid'] != reused['pmid']:
            raise ValueError('Frozen pilot reuse identity differs')
        parent_records.append({'task_id': reused['task_id'],
            'source': verified_json(root, value['source_ref']),
            'validation': value['validated'], 'artifact_ref': reused['artifact_ref']})
    cohort = verified_json(root, continuation['cohort_ref'])
    combined, records = combine_complete_cohort(parent_plan, plan, cohort, parent_records, records,
        source_holds=authority.get('source_or_request_holds', []), pending_reports=pending, allow_pending=allow_pending)
    combined['source_plan_refs'] = [deepcopy(parent_ref), deepcopy(plan_ref)]
    snapshot['reused_pilot_artifact_refs'] = [deepcopy(r['artifact_ref']) for r in parent_records]
    combined['publication_snapshot'] = snapshot
    return combined, records


def r3_routing(plan, records):
    """Eligibility handoff only. Verified full text and an R3 run remain required."""
    candidates = []
    citations = {str(a['citation']['pmid']): a['citation'] for a in plan['articles']}
    for result in records:
        validation = result['validation']; record = validation['record']
        decision = record['decision']['status']
        if not validation.get('valid') or validation.get('global_errors') or record['stage'] != 'R2' or decision not in ('retain', 'exclude', 'unclear'):
            raise ValueError('R3 routing requires a validated current R2 decision')
        if decision == 'exclude' or citations[str(record['pmid'])].get('publication_hold'):
            continue
        candidates.append({'pmid': record['pmid'], 'report_id': record['report_id'],
            'R2_decision': decision, 'R2_task_id': result['task_id'],
            'R2_source_sha256': record['source_sha256'],
            'R2_artifact_ref': deepcopy(result.get('artifact_ref'))})
    return {'schema_version': 1, 'phase_id': plan['phase_id'],
        'source_plan_refs': deepcopy(plan.get('source_plan_refs', [])),
        'allowed_R2_decisions': ['retain', 'unclear'], 'full_text_verification_required': True,
        'R3_dispatch_enabled': False, 'candidates': sorted(candidates, key=lambda a: int(a['pmid']))}


def publish_plan(root, plan_ref, *, allow_pending=False):
    plan, records = publication_inputs(root, plan_ref, allow_pending=allow_pending)
    return publish(root, plan, records)


def publish(root, plan, records):
    root = Path(root).resolve()
    payload = project_pilot(plan, records)
    from .user_dispositions import apply, check_preserved
    payload = apply(root, payload)
    script = owned(root, 'website/scripts/regimen_projection.cjs')
    result = subprocess.run(['node', str(script)], input=json.dumps(payload['clinical_evidence']),
        text=True, capture_output=True, timeout=180, check=False)
    if result.returncode:
        raise ValueError('Pilot regimen projection failed: ' + result.stderr[-2000:])
    payload['clinical_evidence'] = json.loads(result.stdout)
    payload['clinical_evidence']['content_sha256'] = digest(canonical({key: payload['clinical_evidence'][key]
        for key in ('articles', 'evidence_registry')}))
    # Validate the exact wire shape with the same consumer used by the browser.
    checker = "const fs=require('fs');require('./website/dist/clinical_evidence.js').checked(JSON.parse(fs.readFileSync(0,'utf8')));"
    checked = subprocess.run(['node', '-e', checker], input=json.dumps(payload['clinical_evidence']),
        cwd=root, text=True, capture_output=True, timeout=60)
    if checked.returncode:
        raise ValueError('Pilot browser contract failed: ' + checked.stderr[-2000:])
    # Preserve the exact previously served snapshot before replacing the public
    # file. Content addressing makes repeated publication safe and auditable.
    public = owned(root, PUBLIC)
    history = owned(root, 'data/current/reextraction/' + plan['phase_id'] + '/publications')
    previous_ref = None
    if public.exists():
        previous = public.read_bytes()
        old_payload = json.loads(previous)
        if old_payload.get('fulltext_assessment'):
            raise ValueError('Use fulltext-publish to preserve current R3 reviews')
        check_preserved(old_payload, payload)
        destination = history / (digest(previous) + '.json')
        if destination.exists() and destination.read_bytes() != previous:
            raise ValueError('Existing publication history differs')
        if not destination.exists():
            atomic_bytes(destination, previous)
        previous_ref = reference(root, destination)
    route_ref = None
    cohort_publication = plan.get('scope_kind') in ('complete_r2_cohort', 'r2_cohort_with_source_holds', 'r2_cohort_in_progress')
    if cohort_publication:
        route = owned(root, 'data/current/reextraction/' + plan['phase_id'] + '/r3_routing.json')
        atomic_json(route, r3_routing(plan, records)); route_ref = reference(root, route)
    from .clinical_classification import write as write_classifications
    from .treatment_normalization import publication as treatment_publication
    public_bytes = json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False).encode() + b'\n'
    with treatment_publication(root, payload, source_bytes=public_bytes) as treatment_ref:
        classification_ref = write_classifications(root, payload, source_bytes=public_bytes)
        atomic_bytes(owned(root, PUBLIC), public_bytes)
    from .evidence_freshness import write as write_freshness
    freshness_ref = write_freshness(root)
    return {'evidence_freshness': freshness_ref, 'treatment_normalizations': treatment_ref, 'clinical_classifications': classification_ref, 'status': 'cohort_published_in_progress' if plan.get('pending_reports') else 'cohort_published_with_source_holds' if plan.get('source_availability_holds') else 'cohort_published' if cohort_publication else 'pilot_published',
        'articles': len(payload['articles']), 'public': PUBLIC,
        'authorized_articles': len(payload['authorized_scope_pmids']),
        'source_availability_holds': payload['source_availability_holds'],
        'pending_reports': payload['pending_reports'],
        'previous_publication_ref': previous_ref, 'R3_routing_ref': route_ref,
        'counts': payload['about_progress']['stages']['R2']}
