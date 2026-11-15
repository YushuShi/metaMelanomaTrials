"""Finite Cornell Luna R3 reviews of complete, current-R2-eligible source packets.

The shared journal preserves R2/legacy decisions and costs. Each new task covers
one whole supplied main article and its verified available supplements; source
or wire failures remain visible holds and never trigger silent truncation.
"""
from __future__ import annotations

from collections import Counter
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import re
import time

from . import quantitative, reextraction as base
from .execution import retry_delay
from .gateway import GatewayTransport
from .io import atomic_json, canonical, digest, now, owned, producer_reference, reference, verified_json

MODEL = 'gpt-6-luna'
EFFORT = 'xhigh'
STAGE = 'R3'
PROVIDER = base.PROVIDER
MAX_ATTEMPTS = 3
WIRE_CEILING = 6000000
BYTE_SAFE_CEILING = 750000
INPUT_TOKEN_CEILING = 850000
CONTEXT_TOKEN_CEILING = 1050000
OUTPUT_INITIAL = 32768
OUTPUT_CEILING = 65536
PRODUCERS = ('fulltext_reextraction.py', 'reextraction.py', 'quantitative_sources.py',
    'quantitative.py', 'transport.py', 'gateway.py', 'accounting.py', 'screening.py',
    'schema.py', 'normalization.py', 'io.py', 'sources.py', 'pmc_html.py', 'linked_sources.py',
    'quantitative_tables.py')


def _plan(root, plan_ref):
    plan = verified_json(root, plan_ref)
    if not re.fullmatch(r'melanoma-quantitative-r3-[a-zA-Z0-9_-]+', str(plan.get('phase_id', ''))):
        raise ValueError('An explicit finite quantitative R3 phase is required')
    if (plan.get('stage') != STAGE or plan.get('model') != MODEL or plan.get('reasoning_effort') != EFFORT
            or plan.get('provider') != PROVIDER or plan.get('R3_dispatch_enabled') is not True
            or plan.get('direct_OpenAI_dispatch_enabled') is not False
            or plan.get('max_attempts') != MAX_ATTEMPTS or plan.get('max_wire_bytes') != WIRE_CEILING
            or type(plan.get('max_workers')) is not int or not 1 <= plan['max_workers'] <= 128):
        raise ValueError('Exact Cornell Luna xhigh R3 authorization with bounded concurrency and retries required')
    catalog = verified_json(root, plan['catalog_ref'])
    if catalog.get('http_status') != 200 or MODEL not in catalog.get('models_present', []):
        raise ValueError('A successful saved Cornell Luna catalog check is required')
    routing = verified_json(root, plan['R2_routing_ref'])
    publication = verified_json(root, plan['R2_publication_ref'])
    corpus = verified_json(root, plan['source_corpus_ref'])
    if routing.get('allowed_R2_decisions') != ['retain', 'unclear'] or routing.get('full_text_verification_required') is not True:
        raise ValueError('Current retained/unclear-only R2 routing is required')
    candidates = {str(row['pmid']): row for row in routing.get('candidates', [])}
    if len(candidates) != len(routing.get('candidates', [])):
        raise ValueError('Duplicate R2 route candidate')
    published = {str(row['pmid']): row for row in publication.get('articles', [])}
    rows = corpus.get('articles', corpus.get('entries'))
    selected = plan.get('article_pmids')
    if (not isinstance(rows, list) or not isinstance(selected, list) or not selected
            or any(not isinstance(p, str) or not p.isdigit() for p in selected)
            or len(set(selected)) != len(selected) or len(selected) > len(candidates)):
        raise ValueError('Explicit unique finite R3 article PMIDs and source corpus required')
    entries = {str(entry['pmid']): entry for entry in rows}
    if len(entries) != len(rows) or set(selected) != set(entries):
        raise ValueError('The selected R3 scope must exactly match its complete-source corpus')
    token_refs = plan.get('input_token_count_refs', {})
    if not isinstance(token_refs, dict) or not set(token_refs) <= set(selected):
        raise ValueError('Input-token proofs must belong to selected R3 articles')
    for pmid, entry in entries.items():
        route = candidates.get(pmid)
        if not route or route.get('R2_decision') not in ('retain', 'unclear') or route.get('R2_artifact_ref') != entry.get('R2_artifact_ref'):
            raise ValueError('R2-excluded, unresolved, or superseded evidence cannot enter R3: ' + pmid)
        versions = [item['record'] for item in published.get(pmid, {}).get('records', [])
            if item.get('stage') == 'R2' and item.get('record', {}).get('stage') == 'R2']
        if len(versions) != 1 or versions[0]['decision']['status'] != route['R2_decision'] or versions[0]['source_sha256'] != route['R2_source_sha256']:
            raise ValueError('R3 routing differs from its frozen current R2 publication: ' + pmid)
        accepted = verified_json(root, entry['R2_artifact_ref']).get('validated', {})
        if not accepted.get('valid') or accepted.get('global_errors') or accepted.get('record') != versions[0]:
            raise ValueError('The exact published accepted R2 record must seed R3: ' + pmid)
        if entry.get('citation', {}).get('report_id') != route.get('report_id'):
            raise ValueError('R3 citation identity differs from current R2')
    return plan, [entries[pmid] for pmid in selected]


def _verified_entry(root, entry):
    from .quantitative_sources import verify_entry
    checked = verify_entry(root, entry)
    source = checked['source']; previous = verified_json(root, entry['R2_artifact_ref'])
    validation = previous.get('validated', previous.get('validation', {}))
    record = validation.get('record', {})
    if (not validation.get('valid') or validation.get('global_errors') or record.get('stage') != 'R2'
            or record.get('decision', {}).get('status') not in ('retain', 'unclear')
            or record.get('pmid') != str(entry['pmid']) or record.get('report_id') != entry['citation']['report_id']
            or source.get('stage') != STAGE or source.get('pmid') != str(entry['pmid'])
            or source.get('report_id') != entry['citation']['report_id']
            or source.get('main_full_text_verified') is not True or source.get('upstream_R2') != record
            or not any(b.get('document_role') == 'main_article' for b in source.get('blocks', []))):
        raise ValueError('Whole verified main text and exact current eligible R2 record required')
    return checked


def verify_input_bound(root, pmid, body, proof_ref=None):
    """Bind large inputs to an actual Cornell count of the exact base request."""
    base_body = deepcopy(body); base_body['max_output_tokens'] = OUTPUT_INITIAL
    size = len(canonical(body))
    if size > WIRE_CEILING:
        raise ValueError('Whole R3 request exceeds the finite wire ceiling')
    if size <= BYTE_SAFE_CEILING and proof_ref is None:
        return {'basis': 'conservative_utf8_byte_upper_bound', 'wire_bytes': size}
    if proof_ref is None:
        raise ValueError('Whole R3 input above 750000 bytes needs an exact Cornell token-count proof')
    proof = verified_json(root, proof_ref)
    request = verified_json(root, proof['count_request_ref'])
    response = verified_json(root, proof['count_response_ref'])
    tokens = response.get('input_tokens')
    if (proof.get('record_kind') != 'Cornell_R3_input_token_count' or str(proof.get('pmid')) != str(pmid)
            or proof.get('model') != MODEL or proof.get('endpoint') != base._endpoint(root) + '/input_tokens'
            or proof.get('http_status') != 200 or proof.get('object') != 'response.input_tokens'
            or response.get('object') != 'response.input_tokens' or proof.get('completion_requests') != 0
            or type(tokens) is not int or not 0 < tokens <= INPUT_TOKEN_CEILING
            or tokens + OUTPUT_CEILING > CONTEXT_TOKEN_CEILING or proof.get('input_tokens') != tokens
            or proof.get('request_body_sha256') != digest(canonical(base_body)) or request != base_body):
        raise ValueError('Exact matching Cornell input count within Luna limits required')
    return {'basis': 'Cornell_exact_request_input_tokens', 'wire_bytes': size,
        'input_tokens': tokens, 'proof_ref': proof_ref}


def build_task(root, phase, entry, input_token_count_ref=None):
    checked = _verified_entry(root, entry); source = checked['source']
    body = quantitative.request_body(source, max_output_tokens=OUTPUT_INITIAL,
        reasoning_effort=EFFORT, service_tier='default', wire_ceiling=WIRE_CEILING)
    input_bound = verify_input_bound(root, entry['pmid'], body, input_token_count_ref)
    ident = 'qr3-' + digest(canonical({'phase': phase, 'entry': entry, 'body': body,
        'input_token_count_ref': input_token_count_ref}))[:32]
    directory = f'data/current/reextraction/{phase}/tasks/{ident}'
    entry_ref = base.immutable_json(root, directory + '/source_entry.json', entry)
    task = {'task_id': ident, 'stage': STAGE, 'model': MODEL, 'body': body,
        'metadata': {'phase_id': phase, 'provider': PROVIDER, 'pmid': str(entry['pmid']),
            'report_id': entry['citation']['report_id'], 'source_ref': entry['source_ref'],
            'source_entry_ref': entry_ref, 'source_proof_ref': entry['source_proof_ref'],
            'R2_artifact_ref': entry['R2_artifact_ref'], 'max_output_tokens_ceiling': OUTPUT_CEILING,
            'wire_ceiling_bytes': WIRE_CEILING, 'whole_source_packet': True,
            'input_token_count_ref': input_token_count_ref, 'input_bound': input_bound}}
    return task, base.immutable_json(root, directory + '/task.json', task)


class FulltextTransport(GatewayTransport):
    def wire_for_task(self, task):
        meta = task.get('metadata', {}); body = task.get('body', {}); cap = body.get('max_output_tokens')
        if (task.get('stage') != STAGE or task.get('model') != MODEL or meta.get('provider') != PROVIDER
                or not re.fullmatch(r'qr3-[a-f0-9]{32}', str(task.get('task_id', '')))
                or type(cap) is not int or not OUTPUT_INITIAL <= cap <= OUTPUT_CEILING
                or meta.get('max_output_tokens_ceiling') != OUTPUT_CEILING or meta.get('wire_ceiling_bytes') != WIRE_CEILING
                or meta.get('whole_source_packet') is not True):
            raise ValueError('Exact bounded whole-source Luna R3 task required')
        entry = verified_json(self.root, meta['source_entry_ref'])
        checked = _verified_entry(self.root, entry)
        if (entry['source_ref'] != meta['source_ref'] or entry['source_proof_ref'] != meta['source_proof_ref']
                or entry['R2_artifact_ref'] != meta['R2_artifact_ref'] or str(entry['pmid']) != meta['pmid']
                or entry['citation']['report_id'] != meta['report_id']):
            raise ValueError('R3 task source binding differs')
        expected = quantitative.request_body(checked['source'], max_output_tokens=cap,
            reasoning_effort=EFFORT, service_tier='default', wire_ceiling=WIRE_CEILING,
            recorded_instructions=body.get('instructions'))
        if body != expected:
            raise ValueError('Exact source-bound Luna xhigh request required')
        verify_input_bound(self.root, meta['pmid'], expected, meta.get('input_token_count_ref'))
        return canonical(body)


class FulltextJournal(base.PilotJournal):
    model = MODEL
    effort = EFFORT
    stage = STAGE
    provider = PROVIDER
    max_attempts = MAX_ATTEMPTS


class FulltextObservedLimits(base.ObservedLimits):
    """Honor an explicit immediate reset without changing shared R2 behavior."""
    def observe(self, result):
        headers = result.get('headers') or {}; reset = None
        for name, prop in (('requests', 'requests'), ('tokens', 'tokens')):
            try:
                remaining = int(headers['x-ratelimit-remaining-' + name])
                if remaining >= 0:
                    old = getattr(self, prop)
                    setattr(self, prop, min(old, remaining) if old is not None else remaining)
                    parsed = base.duration(headers.get('x-ratelimit-reset-' + name, ''))
                    delay = 60 if parsed is None else parsed
                    reset = delay if reset is None else max(reset, delay)
            except (KeyError, ValueError, TypeError):
                pass
        if reset is not None:
            self.reset = max(self.reset, time.time() + reset)
        if result.get('http_status') in (429, 503):
            self.limit = max(1, self.limit // 2)
            self.blocked = max(self.blocked, time.time() + retry_delay(headers, 1))


def prepare(root, plan_ref):
    root = Path(root).resolve(); plan, entries = _plan(root, plan_ref)
    journal = FulltextJournal(root, plan['phase_id'])
    try:
        prior = journal.phase_authority()
        if prior:
            if prior['plan_ref'] != plan_ref:
                raise ValueError('An R3 phase cannot change its frozen cohort or authority')
            return _snapshot(journal, plan, include_records=False)['status']
        selected = {entry['pmid'] for entry in entries}
        for row in journal.db.execute('SELECT phase_id,pmid FROM reextraction_tasks'):
            if row['phase_id'].startswith('melanoma-quantitative-r3-') and row['pmid'] in selected:
                raise ValueError('R3 article already belongs to a compact full-text dispatch phase')
        legacy = base._legacy_heads(root); tasks = []; holds = []
        for entry in entries:
            try:
                tasks.append(build_task(root, plan['phase_id'], entry, plan.get('input_token_count_refs', {}).get(entry['pmid'])))
            except (ValueError, TypeError, KeyError) as exc:
                holds.append({'pmid': entry['pmid'], 'status': 'source_or_request_hold', 'reason': str(exc)})
        authority = {'phase_id': plan['phase_id'], 'plan_ref': plan_ref, 'prepared_at': now(),
            'endpoint': base._endpoint(root), 'stage': STAGE, 'model': MODEL, 'reasoning_effort': EFFORT,
            'selected_articles': len(entries), 'max_workers': plan['max_workers'], 'max_attempts': MAX_ATTEMPTS,
            'max_output_tokens': OUTPUT_INITIAL, 'output_ceiling': OUTPUT_CEILING, 'wire_ceiling_bytes': WIRE_CEILING,
            'source_or_request_holds': holds, 'producer_files': [producer_reference(root, 'src/metamelanoma/' + p) for p in PRODUCERS],
            'legacy_heads': legacy, 'R2_publication_ref': plan['R2_publication_ref'], 'R2_routing_ref': plan['R2_routing_ref'],
            'source_corpus_ref': plan['source_corpus_ref'], 'whole_source_packet': True,
            'input_token_count_refs': deepcopy(plan.get('input_token_count_refs', {})),
            'direct_OpenAI_dispatch': False, 'eligibility_registry_writes': False,
            'cost_mode': 'gateway_proxy_estimates_and_reference_upper_bounds_not_invoices'}
        ref = base.immutable_json(root, f'data/current/reextraction/{plan["phase_id"]}/authority.json', authority)
        with journal.db:
            journal.db.execute('INSERT INTO reextraction_phases VALUES(?,?)', (journal.phase, canonical(authority).decode()))
            journal.event('phase_opened', authority_ref=ref, authority=authority)
            for task, task_ref in tasks:
                journal.db.execute('INSERT INTO reextraction_tasks VALUES(?,?,?,?,?,?,?)',
                    (task['task_id'], journal.phase, task['metadata']['pmid'], canonical(task_ref).decode(), 'pending', None, None))
                journal.event('task_prepared', task_ref=task_ref, pmid=task['metadata']['pmid'])
        if base._legacy_heads(root) != legacy:
            raise ValueError('Historical accounting changed during R3 preparation')
        value = _snapshot(journal, plan, include_records=False)['status']; _publish(journal, value); return value
    finally:
        journal.close()


def _snapshot(journal, plan, *, include_records=True):
    authority = journal.phase_authority()
    if (not authority or authority['plan_ref'] != reference(journal.root, authority['plan_ref']['path'])
            or plan != verified_json(journal.root, authority['plan_ref'])):
        raise ValueError('Exact prepared R3 authority required')
    states = Counter(); decisions = Counter(); reports = []; records = []; costs = []
    proxy = Decimal(0); estimated = Decimal(0); unknown = 0; attempts_total = 0
    cache = getattr(journal, '_r3_result_cache', None)
    if cache is None:
        cache = journal._r3_result_cache = {}
    for row in journal.task_rows():
        states[row['state']] += 1; attempts = journal.attempts(row['task_id']); attempts_total += len(attempts)
        entered = any(a['record'].get('result', {}).get('sent') is True
            or owned(journal.root, f'data/current/reextraction/{journal.phase}/calls/{a["attempt_id"]}/sent.json').is_file()
            for a in attempts)
        item_cost = Decimal(0); item_estimate = Decimal(0); missing = 0
        for attempt in attempts:
            value = attempt['record']; cost = value.get('gateway_reported_proxy_estimate_usd')
            upper = value.get('reference_OpenAI_standard_usage_upper_bound_usd')
            if cost is None: missing += 1
            else: item_cost += Decimal(cost)
            if upper is not None: item_estimate += Decimal(upper)
        proxy += item_cost; estimated += item_estimate; unknown += missing
        result_ref = json.loads(row['result_ref_json']) if row['result_ref_json'] else None
        finished = row['state'] in ('complete', 'complete_with_issues') and result_ref is not None
        report = {'pmid': row['pmid'], 'task_id': row['task_id'], 'entered': entered,
            'technical_state': row['state'], 'attempt_count': len(attempts), 'validated_result_ref': result_ref,
            'eligibility_finished': finished, 'review_finished': finished, 'report_complete': False}
        if finished:
            stat = owned(journal.root, result_ref['path']).stat()
            key = (canonical(result_ref), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
            if key not in cache:
                value = verified_json(journal.root, result_ref); task = verified_json(journal.root, json.loads(row['task_ref_json']))
                proof = verified_json(journal.root, task['metadata']['source_proof_ref'])
                cache[key] = (value, task['metadata'], proof)
            value, meta, proof = cache[key]; validation = value['validated']
            decision = validation['record']['decision']['status']; decisions[decision] += 1
            report.update(R3_decision=decision, reason=validation['record']['decision']['reason'],
                main_article_review_complete=proof.get('main_article_complete') is True,
                source_coverage=proof.get('coverage', {}), coverage_gaps=proof.get('coverage_gaps', []),
                report_complete=proof.get('source_report_coverage_complete') is True)
            if include_records:
                records.append({'task_id': row['task_id'], 'source': verified_json(journal.root, value['source_ref']),
                    'validation': validation, 'artifact_ref': result_ref,
                    'R2_artifact_ref': meta['R2_artifact_ref'], 'source_proof_ref': meta['source_proof_ref'],
                    'whole_source_packet': True, 'report_complete': report['report_complete']})
        reports.append(report)
        costs.append({'pmid': row['pmid'], 'task_id': row['task_id'], 'state': row['state'], 'attempt_count': len(attempts),
            'gateway_known_cost_subtotal_usd': str(item_cost), 'gateway_cost_unknown_attempts': missing,
            'reference_OpenAI_standard_usage_upper_bound_subtotal_usd': str(item_estimate),
            'attempts': [{key: attempt['record'].get(key) for key in ('attempt_id', 'ordinal', 'reserved_at', 'finished_at',
                'gateway_reported_proxy_estimate_usd', 'usage')} for attempt in attempts]})
    for hold in authority['source_or_request_holds']:
        reports.append({'pmid': hold['pmid'], 'task_id': None, 'entered': False, 'technical_state': hold['status'],
            'reason': hold['reason'], 'attempt_count': 0, 'validated_result_ref': None,
            'eligibility_finished': False, 'review_finished': False, 'report_complete': False})
    head = journal.db.execute('SELECT seq,event_hash FROM reextraction_events ORDER BY seq DESC LIMIT 1').fetchone()
    value = {'phase_id': journal.phase, 'as_of': now(), 'stage': STAGE, 'model': MODEL, 'reasoning_effort': EFFORT,
        'selected_articles': authority['selected_articles'], 'ready_tasks': sum(states.values()), 'task_states': dict(states),
        'entered_articles': sum(r['entered'] for r in reports), 'finished_articles': sum(r['eligibility_finished'] for r in reports),
        'new_R3_decisions': dict(decisions), 'attempts': attempts_total, 'gateway_known_cost_subtotal_usd': str(proxy),
        'gateway_cost_unknown_attempts': unknown, 'reference_OpenAI_standard_usage_upper_bound_subtotal_usd': str(estimated),
        'cost_is_invoice': False, 'direct_OpenAI_completion_requests': 0, 'eligibility_registry_writes': 0,
        'source_or_request_holds': authority['source_or_request_holds'], 'articles': costs,
        'legacy_accounting_preserved': base._legacy_heads(journal.root) == authority['legacy_heads']}
    return {'plan': plan, 'plan_ref': authority['plan_ref'], 'authority': authority,
        'R2_publication_ref': authority['R2_publication_ref'], 'event_head': dict(head) if head else None,
        'status': value, 'reports': reports, 'records': records}


def _publish(journal, value, **runtime):
    base._publish_status(journal, value, **runtime)


def snapshot(root, plan_ref, *, include_records=True):
    root = Path(root).resolve(); plan, _ = _plan(root, plan_ref)
    journal = FulltextJournal.__new__(FulltextJournal)
    journal.root = root; journal.phase = plan['phase_id']; journal.db = base._readonly(root, base.DB_PATH)
    journal.db.execute('BEGIN')
    try:
        authority = journal.phase_authority()
        if not authority or authority['plan_ref'] != plan_ref:
            raise ValueError('Snapshot requires the exact prepared R3 plan reference')
        return _snapshot(journal, plan, include_records=include_records)
    finally:
        journal.db.close()


def status(root, plan_ref):
    return snapshot(root, plan_ref, include_records=False)['status']


def completed_records(root, plan_ref):
    return snapshot(root, plan_ref)['records']


def amend_producers(root, plan_ref, reason, *, revalidate=True):
    """Record a wire-identical validator/runtime repair and replay saved responses.

    This cannot alter model prompts, source inputs, task identities, eligibility
    history, selected articles, retry limits, or any request/cost record. The
    initial authority and every preceding validation artifact remain immutable.
    """
    if not isinstance(reason, str) or not reason.strip():
        raise ValueError('An explicit producer-amendment reason is required')
    root = Path(root).resolve(); plan, _ = _plan(root, plan_ref)
    journal = FulltextJournal(root, plan['phase_id'])
    try:
        authority = journal.phase_authority()
        if not authority or authority['plan_ref'] != plan_ref:
            raise ValueError('Exact prepared R3 authority required')
        if base._legacy_heads(root) != authority['legacy_heads']:
            raise ValueError('Historical accounting changed before producer amendment')
        members = journal.task_rows()
        if any(row['state'] in ('running', 'held_unknown_send') for row in members):
            raise ValueError('Drain or reconcile active R3 requests before producer amendment')
        for row in members:
            task = verified_json(root, json.loads(row['task_ref_json']))
            source = verified_json(root, task['metadata']['source_ref'])
            expected = quantitative.request_body(source, max_output_tokens=task['body']['max_output_tokens'],
                reasoning_effort=EFFORT, service_tier='default', wire_ceiling=WIRE_CEILING,
                recorded_instructions=task['body'].get('instructions'))
            verify_input_bound(root, row['pmid'], expected, task['metadata'].get('input_token_count_ref'))
            if expected != task['body']:
                raise ValueError('Producer amendment would change a recorded request body: ' + row['pmid'])
        old_refs = authority['producer_files']
        new_refs = [producer_reference(root, 'src/metamelanoma/' + name) for name in PRODUCERS]
        old_by_path = {ref['path']: ref for ref in old_refs}
        new_by_path = {ref['path']: ref for ref in new_refs}
        if (set(old_by_path) - set(new_by_path)
                or set(new_by_path) - set(old_by_path) - {'src/metamelanoma/quantitative_tables.py'}):
            raise ValueError('Only the reviewed R3 table validator may be added; no producers may be removed')
        changes = [ref['path'] for ref in new_refs if old_by_path.get(ref['path']) != ref]
        if set(changes) - {'src/metamelanoma/fulltext_reextraction.py', 'src/metamelanoma/quantitative.py',
                'src/metamelanoma/quantitative_tables.py'}:
            raise ValueError('Only the reviewed compact validator and R3 runtime may be amended')
        before_attempts = [tuple(row) for row in journal.db.execute(
            'SELECT a.* FROM reextraction_attempts a JOIN reextraction_tasks t USING(task_id) WHERE t.phase_id=? ORDER BY a.attempt_id', (journal.phase,))]
        native_bindings = []
        for row in members:
            if row['state'] not in ('complete', 'complete_with_issues', 'validation_hold'):
                continue
            attempts = journal.attempts(row['task_id'])
            if not attempts:
                continue
            record = attempts[-1]['record']; native = record.get('result')
            if not native or native.get('status') != 'completed':
                continue
            for ref in native['artifacts'].values():
                if reference(root, ref['path']) != ref:
                    raise ValueError('Original native response changed before producer amendment')
            native_bindings.append({'task_id': row['task_id'], 'pmid': row['pmid'],
                'native_attempt_id': record['attempt_id'], 'native_artifacts': native['artifacts'],
                'preceding_result_ref': json.loads(row['result_ref_json']) if row['result_ref_json'] else None})
        amendment_ref = None
        if changes:
            amendment = {'record_kind': 'wire_identical_quantitative_producer_amendment', 'phase_id': journal.phase,
                'plan_ref': plan_ref, 'created_at': now(), 'reason': reason.strip(),
                'old_producer_files': old_refs, 'new_producer_files': new_refs, 'changed_files': changes,
                'task_body_proof': base._body_proof(root, members), 'request_bodies_unchanged': True,
                'native_response_bindings': native_bindings,
                'attempt_records_sha256': digest(canonical(before_attempts)),
                'historical_accounting_preserved': True, 'new_model_requests': 0,
                'journal_mode': journal.db.execute('PRAGMA journal_mode').fetchone()[0]}
            amendment_ref = base.immutable_json(root, f'data/current/reextraction/{journal.phase}/producer_amendments/{digest(canonical(amendment))}.json', amendment)
            with journal.db:
                journal.event('producer_amendment', amendment_ref=amendment_ref)
            journal._authority_cache = None
        revisions = []
        if revalidate:
            for row in journal.task_rows():
                if row['state'] not in ('complete', 'complete_with_issues', 'validation_hold'):
                    continue
                task = verified_json(root, json.loads(row['task_ref_json']))
                attempts = journal.attempts(row['task_id'])
                if not attempts:
                    continue
                record = attempts[-1]['record']; native = record.get('result')
                if not native or native.get('status') != 'completed':
                    continue
                for ref in native['artifacts'].values():
                    if reference(root, ref['path']) != ref:
                        raise ValueError('Original native response changed before revalidation')
                source = verified_json(root, task['metadata']['source_ref'])
                validated = quantitative.validate(native['payload'], source)
                output = base._save_validation(journal, task, record['attempt_id'], native, validated)
                old_output = json.loads(row['result_ref_json']) if row['result_ref_json'] else None
                state = ('complete_with_issues' if validated.get('issues') else 'complete') if validated.get('valid') else 'validation_hold'
                if old_output == output and state == row['state']:
                    continue
                revision = {'task_id': task['task_id'], 'old_state': row['state'], 'new_state': state,
                    'old_result_ref': old_output, 'new_result_ref': output,
                    'producer_files': journal.phase_authority()['producer_files'], 'native_attempt_id': record['attempt_id']}
                with journal.db:
                    journal.db.execute('UPDATE reextraction_tasks SET state=?,result_ref_json=?,next_retry=NULL WHERE task_id=?',
                        (state, canonical(output).decode(), row['task_id']))
                    journal.event('validation_revision', **revision)
                revisions.append({'pmid': row['pmid'], **revision})
        after_attempts = [tuple(row) for row in journal.db.execute(
            'SELECT a.* FROM reextraction_attempts a JOIN reextraction_tasks t USING(task_id) WHERE t.phase_id=? ORDER BY a.attempt_id', (journal.phase,))]
        if before_attempts != after_attempts or base._legacy_heads(root) != authority['legacy_heads']:
            raise ValueError('Producer amendment altered request/cost history')
        journal.verify_events()
        value = _snapshot(journal, plan, include_records=False)['status']; _publish(journal, value)
        return {'status': 'producer_amended' if changes else 'producer_unchanged', 'amendment_ref': amendment_ref,
            'changed_files': changes, 'revalidated_articles': len(revisions), 'revisions': revisions,
            'request_bodies_unchanged': True, 'attempt_records_unchanged': True,
            'new_model_requests': 0, 'phase_status': value}
    finally:
        journal.close()


def run(root, plan_ref, *, workers=128, limit=None, pmids=None, transport=None, on_progress=None):
    if type(workers) is not int or not 1 <= workers <= 128:
        raise ValueError('Explicit R3 concurrency from 1 to 128 required')
    if limit is not None and (type(limit) is not int or limit < 1):
        raise ValueError('Positive finite request limit required')
    root = Path(root).resolve(); plan, entries = _plan(root, plan_ref)
    selected = {entry['pmid'] for entry in entries}
    if pmids is not None:
        pmids = list(map(str, pmids))
        if not pmids or len(set(pmids)) != len(pmids) or not set(pmids) <= selected:
            raise ValueError('R3 quality subset must belong to the frozen selected cohort')
    journal = FulltextJournal(root, plan['phase_id']); futures = {}; sent = 0; stop = None; last_progress = 0
    try:
        authority = journal.phase_authority()
        if not authority or authority['plan_ref'] != plan_ref or workers > authority['max_workers']:
            raise ValueError('Exact prepared R3 authority and worker ceiling required')
        for ref in authority['producer_files']:
            if reference(root, ref['path']) != ref:
                raise ValueError('R3 producing code changed after preparation: ' + ref['path'])
        if base._legacy_heads(root) != authority['legacy_heads'] or base._endpoint(root) != authority['endpoint']:
            raise ValueError('Historical accounting or fixed Cornell route changed')
        transport = transport or FulltextTransport(root=root, expected_endpoint=authority['endpoint'], timeout_seconds=3600)
        journal.recover(); journal.requeue_not_sent(); limiter = FulltextObservedLimits(workers); queue = []
        for row in journal.task_rows():
            if row['state'] in ('pending', 'retry_wait') and (pmids is None or row['pmid'] in pmids):
                task = verified_json(root, json.loads(row['task_ref_json'])); history = journal.attempts(row['task_id'])
                cap = history[-1]['record'].get('next_output_limit', OUTPUT_INITIAL) if history else OUTPUT_INITIAL
                queue.append((task, row['next_retry'] or 0, cap))
        if pmids is not None:
            queue.sort(key=lambda item: pmids.index(item[0]['metadata']['pmid']))
        def gate(task):
            if (root / 'data/current/HOLD').exists() or (root / 'data/current/HOLD').is_symlink(): return False
            if reference(root, plan_ref['path']) != plan_ref or base._endpoint(root) != authority['endpoint']:
                raise ValueError('R3 plan or Cornell route changed before dispatch')
            return True
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix='cornell-quantitative-r3') as executor:
            while queue or futures:
                if (root / 'data/current/HOLD').exists() or (root / 'data/current/HOLD').is_symlink(): stop = 'administrative_hold'
                index = 0
                while stop is None and index < len(queue) and len(futures) < workers and (limit is None or sent < limit):
                    task, due, cap = queue[index]; actual = deepcopy(task); actual['body']['max_output_tokens'] = cap
                    if time.time() < due or not limiter.can_send(actual, len(futures)):
                        index += 1; continue
                    queue.pop(index); record = journal.reserve(task, cap); sent += 1; limiter.sent(actual)
                    directory = f'data/current/reextraction/{journal.phase}/calls/{record["attempt_id"]}'
                    futures[executor.submit(transport.send, actual, record['attempt_id'], directory, gate=gate)] = (task, record)
                if not futures and (stop or limit is not None and sent >= limit): break
                done, _ = wait(futures, timeout=1, return_when=FIRST_COMPLETED) if futures else (set(), set())
                if not futures: time.sleep(.2)
                for future in done:
                    task, record = futures.pop(future)
                    try: result = future.result()
                    except Exception as exc:
                        result = {'status': 'worker_error', 'sent': True, 'http_status': None,
                            'error': {'type': 'worker_exception', 'exception_type': type(exc).__name__},
                            'usage': None, 'headers': {}, 'payload': None, 'artifacts': {}}
                    limiter.observe(result); validated = None
                    if result.get('status') == 'completed':
                        try: validated = quantitative.validate(result['payload'], verified_json(root, task['metadata']['source_ref']))
                        except Exception as exc: validated = {'valid': False, 'issues': [], 'global_errors': [type(exc).__name__]}
                    retry_at = None; next_cap = record['output_limit']; known = result.get('http_status') is not None
                    error = (result.get('error') or {}).get('type'); incomplete = error == 'incomplete_output'
                    malformed = error == 'invalid_structured_output'
                    invalid = result.get('status') == 'completed' and validated is not None and not validated.get('valid')
                    # A network failure after dispatch can still have been billed;
                    # do not automatically duplicate an incomplete HTTP exchange.
                    ambiguous = error in ('network_error', 'incomplete_http_body')
                    if known and not ambiguous and record['ordinal'] < MAX_ATTEMPTS and (result.get('retryable') or malformed or invalid or incomplete and next_cap < OUTPUT_CEILING):
                        retry_at = time.time() + retry_delay(result.get('headers') or {}, record['ordinal'])
                        if incomplete: next_cap = min(OUTPUT_CEILING, next_cap * 2)
                        record['next_output_limit'] = next_cap
                    state = journal.finish(task, record, result, validated, retry_at)
                    if state == 'retry_wait': queue.append((task, retry_at, next_cap))
                    if state == 'held_integrity': stop = 'response_integrity_hold'
                    provider_error = (result.get('response') or {}).get('error') or {}
                    code = str(provider_error.get('code') or provider_error.get('type') or '') if isinstance(provider_error, dict) else ''
                    if result.get('http_status') in (401, 403) or any(word in code.lower() for word in ('quota', 'billing', 'payment', 'invalid_api_key', 'account_deactivated')):
                        stop = 'gateway_account_or_authorization_hold'
                if done or time.time() - last_progress >= 20:
                    value = _snapshot(journal, plan, include_records=False)['status']
                    _publish(journal, value, active=len(futures), queued=len(queue), configured_concurrency=workers,
                        effective_concurrency=limiter.limit, stop_reason=stop)
                    if on_progress: on_progress(value)
                    last_progress = time.time()
        value = _snapshot(journal, plan, include_records=False)['status']
        _publish(journal, value, active=0, queued=len(queue), configured_concurrency=workers,
            effective_concurrency=limiter.limit, stop_reason=stop or ('request_limit' if limit is not None and sent >= limit else None))
        return value
    finally:
        journal.close()
