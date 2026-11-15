"""Finite Cornell quantitative R2 cohorts, with separate immutable audit phases.

The legacy gateway tables and all screening decisions remain untouched. The new
phase lives in namespaced tables in the SAME fixed gateway accounting database.
An explicit continuation can finish the reviewed pilot's fixed original cohort.
No caller can accidentally start R3 or expand a pilot to the entire registry.
"""
from __future__ import annotations

from collections import Counter
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from copy import deepcopy
from decimal import Decimal, InvalidOperation
import csv
import fcntl
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import time
from urllib.parse import quote, urlsplit

from . import accounting, quantitative, screening
from .execution import duration, retry_delay
from .gateway import GatewayTransport
from .io import atomic_bytes, atomic_json, canonical, digest, now, owned, producer_reference, read_json, reference, verified_json
from .transport import extract_payload

DB_PATH = 'data/current/gateway_accounting.sqlite3'
PROVIDER = 'cornell_openai_gateway'
MODEL = 'gpt-6.1-sol'
EFFORT = 'xhigh'
MAX_ATTEMPTS = 3
WIRE_CEILING = 400000
OUTPUT_INITIAL = 32768
OUTPUT_CEILING = 65536
PILOT_SIZE = 254
REVIEWED_COHORT_SIZE = 2538
PRODUCERS = ('reextraction.py', 'quantitative.py', 'transport.py', 'gateway.py',
             'accounting.py', 'screening.py', 'schema.py', 'normalization.py', 'io.py')


def immutable_json(root, path, value):
    target = owned(root, path)
    if target.exists():
        if read_json(target) != value:
            raise ValueError('Existing extraction artifact differs: ' + str(path))
    else:
        atomic_json(target, value)
    return reference(root, target)


def _readonly(root, relative):
    path = owned(root, relative)
    if not path.is_file() or path.stat().st_nlink != 1:
        raise ValueError('Existing owned database required')
    db = sqlite3.connect('file:' + quote(str(path), safe='/') + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    return db


def _legacy_heads(root):
    out = {}
    for relative in ('data/current/accounting.sqlite3', DB_PATH):
        with _readonly(root, relative) as db:
            row = db.execute('SELECT seq,event_hash FROM events ORDER BY seq DESC LIMIT 1').fetchone()
            out[relative] = {'event_head': dict(row) if row else None,
                'tasks': db.execute('SELECT COUNT(*) FROM tasks').fetchone()[0],
                'attempts': db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0],
                'policy': db.execute("SELECT value FROM metadata WHERE key='policy'").fetchone()[0]}
    return out


def _endpoint(root):
    config = read_json(owned(root, 'config/pipeline.json'))
    endpoint = config.get('endpoint', '')
    u = urlsplit(endpoint)
    if (config.get('direct_OpenAI_dispatch_enabled') is not False or u.scheme != 'https'
            or not u.hostname or not (u.hostname == 'cornell.edu' or u.hostname.endswith('.cornell.edu'))
            or u.path != '/v1/responses' or u.username or u.password or u.query or u.fragment
            or u.port not in (None, 443)):
        raise ValueError('Fixed Cornell Responses route and stopped direct OpenAI dispatch required')
    return endpoint


def _plan(root, plan_ref):
    plan = verified_json(root, plan_ref)
    phase = plan.get('phase_id')
    continuation = plan.get('continuation')
    kind = 'continuation' if continuation is not None else 'pilot'
    if not isinstance(phase, str) or not re.fullmatch(r'melanoma-quantitative-r2-' + kind + r'[-a-zA-Z0-9_]*', phase):
        raise ValueError('An explicitly named quantitative R2 pilot or continuation phase is required')
    if plan.get('stage', 'R2') != 'R2' or plan.get('model', MODEL) != MODEL or plan.get('reasoning_effort', EFFORT) != EFFORT:
        raise ValueError('This finite pilot permits only R2 Sol xhigh')
    if (plan.get('models', {'R2': MODEL}) != {'R2': MODEL} or plan.get('provider', PROVIDER) != PROVIDER
            or plan.get('R3_dispatch_enabled', False) is not False
            or plan.get('direct_OpenAI_dispatch_enabled', False) is not False
            or plan.get('max_attempts', MAX_ATTEMPTS) != MAX_ATTEMPTS):
        raise ValueError('Pilot cannot authorize R3, another provider, or expanded retries')
    catalog = verified_json(root, plan['catalog_ref'])
    if catalog.get('http_status') != 200 or MODEL not in catalog.get('models_present', []):
        raise ValueError('A saved Cornell model catalog check is required')
    entries = plan.get('articles')
    if entries is None:
        entries = plan.get('article_pmids')
    ceiling = REVIEWED_COHORT_SIZE - PILOT_SIZE if continuation is not None else PILOT_SIZE
    if not isinstance(entries, list) or not 1 <= len(entries) <= ceiling:
        raise ValueError('An explicitly selected finite R2 cohort within its authorized size is required')
    citations = []
    with _readonly(root, 'data/current/articles.sqlite3') as db:
        for entry in entries:
            if isinstance(entry, dict) and 'citation' in entry:
                citation = deepcopy(entry['citation'])
            elif isinstance(entry, dict) and {'pmid', 'report_id', 'title'} <= entry.keys():
                citation = deepcopy(entry)
            else:
                pmid = str(entry.get('pmid') if isinstance(entry, dict) else entry)
                row = db.execute('SELECT citation_json FROM articles WHERE pmid=?', (pmid,)).fetchone()
                if row is None:
                    raise ValueError('Pilot article absent from existing registry: ' + pmid)
                citation = json.loads(row[0])
            if not str(citation.get('pmid', '')).isdigit() or not citation.get('report_id') or not citation.get('title'):
                raise ValueError('Complete persistent citation identity required')
            citation['pmid'] = str(citation['pmid'])
            citations.append(citation)
    if len({x['pmid'] for x in citations}) != len(citations):
        raise ValueError('Duplicate PMID in finite pilot')
    if continuation is not None:
        if not isinstance(continuation, dict) or set(continuation) != {'pilot_plan_ref', 'cohort_ref'}:
            raise ValueError('Continuation requires exact pilot and original cohort references')
        parent = verified_json(root, continuation['pilot_plan_ref'])
        if parent.get('continuation') is not None:
            raise ValueError('A continuation cannot recursively extend another continuation')
        _, parent_citations = _plan(root, continuation['pilot_plan_ref'])
        cohort = verified_json(root, continuation['cohort_ref'])
        cohort_pmids = cohort.get('article_pmids')
        if (not isinstance(cohort_pmids, list) or len(cohort_pmids) != REVIEWED_COHORT_SIZE
                or any(not isinstance(p, str) or not p.isdigit() for p in cohort_pmids)
                or len(set(cohort_pmids)) != REVIEWED_COHORT_SIZE):
            raise ValueError('The frozen original 2538-article cohort is required')
        old = {c['pmid'] for c in parent_citations}; new = {c['pmid'] for c in citations}
        if (len(old) != PILOT_SIZE or len(new) != REVIEWED_COHORT_SIZE - PILOT_SIZE
                or old & new or old | new != set(cohort_pmids)):
            raise ValueError('Continuation must be exactly the original cohort minus the reviewed pilot')
        if type(plan.get('max_workers')) is not int or not 1 <= plan['max_workers'] <= 32:
            raise ValueError('Reviewed continuation concurrency must be between 1 and 32')
    _local_dispositions(root, plan, citations)
    return plan, citations


def _local_dispositions(root, plan, citations):
    """Only successful primary-source absence checks support no-abstract exclusions."""
    dispositions = plan.get('local_dispositions', [])
    if not isinstance(dispositions, list) or dispositions and plan.get('continuation') is None:
        raise ValueError('Local source dispositions belong only to the explicit continuation')
    by_pmid = {c['pmid']: c for c in citations}; out = {}
    for disposition in dispositions:
        pmid = disposition.get('pmid')
        if (pmid not in by_pmid or pmid in out or str(by_pmid[pmid].get('abstract') or '').strip()
                or not isinstance(disposition.get('reason'), str) or not disposition['reason'].strip()):
            raise ValueError('A unique blank-abstract cohort article and explicit reason are required')
        proof = verified_json(root, disposition['availability_ref'])
        checks = proof.get('checks')
        if proof.get('pmid') != pmid or proof.get('status') != 'confirmed_unavailable' or not isinstance(checks, list):
            raise ValueError('Identity-bound confirmed source availability review required')
        primary = False
        for check in checks:
            if (check.get('http_status') != 200 or check.get('abstract_present') is not False
                    or check.get('identity_verified') is not True or check.get('complete_record') is not True):
                raise ValueError('Failed or partial retrieval cannot establish an unavailable abstract')
            ref = check['artifact_ref']
            if reference(root, ref['path']) != ref:
                raise ValueError('Primary source availability artifact changed')
            primary |= check.get('provider') in ('primary_publisher', 'pmc')
            if check.get('provider') == 'published_article_copy':
                _verify_published_copy(root, proof, check, by_pmid[pmid])
                primary = True
        if not primary:
            raise ValueError('PubMed absence alone cannot establish a confirmed no-abstract exclusion')
        out[pmid] = deepcopy(disposition)
    return out


def _verify_published_copy(root, proof, check, citation):
    """Accept a verified published copy while preserving its actual mirror origin."""
    normalize = lambda value: ' '.join(re.findall(r'\w+', str(value).casefold()))
    u = urlsplit(check.get('url', ''))
    pages = re.fullmatch(r'(\d+)\s*[–-]\s*(\d+)', check.get('journal_pages', ''))
    fields = set(check.get('identity_fields_matched', []))
    if (proof.get('body_used_for_R2') is not False or check.get('publisher_original_copy') is not True
            or check.get('host_role') != 'third_party_mirror'
            or check.get('direct_primary_publisher_retrieval') is not False
            or u.scheme != 'https' or not u.hostname or u.hostname != check.get('host')
            or u.username or u.password or u.fragment
            or not {'doi', 'title', 'authors', 'year', 'page_range'} <= fields
            or not citation.get('doi') or str(check.get('doi')).casefold() != str(citation['doi']).casefold()
            or normalize(check.get('title')) != normalize(citation.get('title'))
            or type(check.get('year')) is not int or check.get('year') != citation.get('year')
            or not isinstance(check.get('authors'), list) or not check['authors']
            or check.get('first_page_verified') is not True or check.get('last_page_verified') is not True
            or type(check.get('pdf_page_count')) is not int or check['pdf_page_count'] < 1
            or not pages or int(pages[2]) - int(pages[1]) + 1 != check.get('pdf_page_count')
            or not isinstance(check.get('abstract_absence_inspection'), str) or not check['abstract_absence_inspection'].strip()
            or len(check.get('visual_refs', [])) < 2):
        raise ValueError('A complete identity-verified published copy with explicit mirror provenance is required')
    for ref in [check['fulltext_ref'], check['independent_publisher_metadata_ref'], *check['visual_refs']]:
        if reference(root, ref['path']) != ref:
            raise ValueError('Published copy inspection evidence changed')
    if not owned(root, check['artifact_ref']['path']).read_bytes().startswith(b'%PDF'):
        raise ValueError('The verified original published copy must be a PDF')


def _store_local_disposition(root, phase, citation, disposition):
    source = screening.build_source(citation, 'R2')
    source['source_availability_ref'] = deepcopy(disposition['availability_ref'])
    record = quantitative.empty_record(source)
    record['decision'] = {'status': 'exclude', 'reason_code': 'scientific_abstract_unavailable',
        'reason': disposition['reason'], 'evidence': []}
    ident = 'local-r2-' + digest(canonical({'phase': phase, 'source': source, 'disposition': disposition}))[:32]
    directory = f'data/current/reextraction/{phase}/local_dispositions/{citation["pmid"]}'
    source_ref = immutable_json(root, directory + '/source.json', source)
    validation = {'valid': True, 'global_errors': [], 'issues': [], 'record': record,
        'validation_kind': 'local_primary_source_availability',
        'source_availability_ref': deepcopy(disposition['availability_ref'])}
    value = {'task_id': ident, 'pmid': citation['pmid'], 'source_ref': source_ref, 'validated': validation,
        'review_origin': 'local_primary_source_availability', 'model': None, 'model_requests': 0,
        'source_availability_ref': deepcopy(disposition['availability_ref'])}
    return {'pmid': citation['pmid'], 'task_id': ident,
        'artifact_ref': immutable_json(root, directory + '/disposition.json', value)}


def _verify_source_resolution(root, resolution, authority, producer_files):
    if (resolution.get('phase_id') != authority['phase_id'] or resolution.get('plan_ref') != authority['plan_ref']
            or resolution.get('producer_files') != producer_files or resolution.get('new_model_requests') != 0
            or resolution.get('attempt_records_unchanged') is not True
            or resolution.get('original_hold') not in authority['source_or_request_holds']):
        raise ValueError('Source resolution must bind the original prepared hold and producing code')
    plan, citations = _plan(root, resolution['plan_ref'])
    pmid = resolution.get('pmid'); disposition = resolution['disposition']
    citation = next((citation for citation in citations if citation['pmid'] == pmid), None)
    if (not plan.get('continuation') or not citation or resolution['original_hold']['pmid'] != pmid
            or disposition.get('pmid') != pmid):
        raise ValueError('Only an originally selected continuation source hold may be resolved')
    _local_dispositions(root, {**plan, 'local_dispositions': [disposition]}, [citation])
    local = resolution['local_disposition']; value = verified_json(root, local['artifact_ref'])
    source = screening.build_source(citation, 'R2')
    source['source_availability_ref'] = deepcopy(disposition['availability_ref'])
    expected = quantitative.empty_record(source)
    expected['decision'] = {'status': 'exclude', 'reason_code': 'scientific_abstract_unavailable',
        'reason': disposition['reason'], 'evidence': []}
    ident = 'local-r2-' + digest(canonical({'phase': authority['phase_id'], 'source': source, 'disposition': disposition}))[:32]
    if (local['pmid'] != pmid or local['task_id'] != ident or value.get('task_id') != ident
            or value.get('pmid') != pmid or verified_json(root, value['source_ref']) != source
            or value.get('model') is not None or value.get('model_requests') != 0
            or value.get('review_origin') != 'local_primary_source_availability'
            or value.get('source_availability_ref') != disposition['availability_ref']
            or value['validated'].get('valid') is not True or value['validated'].get('global_errors') != []
            or value['validated'].get('record') != expected):
        raise ValueError('Source resolution cannot introduce model evidence or clinical extraction')


def resolve_source_hold(root, plan_ref, disposition):
    """Append a verified local no-abstract disposition; preserve the frozen plan."""
    root = Path(root).resolve(); plan, citations = _plan(root, plan_ref)
    if not plan.get('continuation'):
        raise ValueError('Source resolution requires an explicitly prepared continuation')
    validated = _local_dispositions(root, {**plan, 'local_dispositions': [disposition]}, citations)
    pmid = disposition['pmid']; citation = next(c for c in citations if c['pmid'] == pmid)
    journal = PilotJournal(root, plan['phase_id'])
    try:
        authority = journal.phase_authority()
        if not authority or authority['plan_ref'] != plan_ref:
            raise ValueError('Exact prepared continuation authority required')
        if any(reference(root, ref['path']) != ref for ref in authority['producer_files']):
            raise ValueError('Amend reviewed producing code before resolving a source hold')
        if _legacy_heads(root) != authority['legacy_heads']:
            raise ValueError('Historical accounting changed before source resolution')
        for ref in authority.get('source_hold_resolution_refs', []):
            prior = verified_json(root, ref)
            if prior['pmid'] == pmid:
                if prior['disposition'] != validated[pmid]:
                    raise ValueError('A different source resolution already exists')
                return {'status': 'already_resolved', 'resolution_ref': ref, 'new_model_requests': 0,
                    'phase_status': _status(journal)}
        rows = journal.task_rows()
        if any(row['state'] in ('running', 'held_unknown_send') for row in rows):
            raise ValueError('Drain or reconcile active model work before resolving a source hold')
        if any(row['pmid'] == pmid for row in rows):
            raise ValueError('A model-dispatched article cannot become a local source disposition')
        hold = next((h for h in authority['source_or_request_holds'] if h['pmid'] == pmid), None)
        if not hold:
            raise ValueError('Article has no unresolved original source hold')
        before = [tuple(row) for row in journal.db.execute('SELECT * FROM reextraction_attempts ORDER BY attempt_id')]
        before_tasks = [tuple(row) for row in journal.db.execute('SELECT * FROM reextraction_tasks ORDER BY task_id')]
        local = _store_local_disposition(root, journal.phase, citation, validated[pmid])
        resolution = {'record_kind': 'local_source_hold_resolution', 'phase_id': journal.phase,
            'plan_ref': plan_ref, 'pmid': pmid, 'created_at': now(), 'original_hold': hold,
            'disposition': validated[pmid], 'local_disposition': local, 'producer_files': authority['producer_files'],
            'new_model_requests': 0, 'attempt_records_unchanged': True}
        _verify_source_resolution(root, resolution, authority, authority['producer_files'])
        ref = immutable_json(root, f'data/current/reextraction/{journal.phase}/source_hold_resolutions/{digest(canonical(resolution))}.json', resolution)
        with journal.db:
            journal.event('source_hold_resolution', resolution_ref=ref)
        journal._authority_cache = None
        after = [tuple(row) for row in journal.db.execute('SELECT * FROM reextraction_attempts ORDER BY attempt_id')]
        after_tasks = [tuple(row) for row in journal.db.execute('SELECT * FROM reextraction_tasks ORDER BY task_id')]
        if before != after or before_tasks != after_tasks or _legacy_heads(root) != authority['legacy_heads']:
            raise ValueError('Source resolution changed model request or cost history')
        journal.verify_events(); value = _status(journal); _publish_status(journal, value)
        return {'status': 'source_hold_resolved', 'resolution_ref': ref, 'new_model_requests': 0,
            'phase_status': value}
    finally:
        journal.close()


def _verify_worker_authorization(root, amendment, authority, producer_files, current_ceiling):
    authorization = verified_json(root, amendment['authorization_ref'])
    workers = authorization.get('workers')
    if (amendment.get('phase_id') != authority['phase_id'] or amendment.get('plan_ref') != authority['plan_ref']
            or amendment.get('producer_files') != producer_files
            or amendment.get('previous_ceiling') != current_ceiling or amendment.get('worker_ceiling') != workers
            or amendment.get('new_model_requests') != 0 or amendment.get('attempt_records_unchanged') is not True
            or authorization.get('phase_id') != authority['phase_id'] or authorization.get('plan_ref') != authority['plan_ref']
            or type(workers) is not int or not current_ceiling < workers <= 128
            or not isinstance(authorization.get('user_authorization_basis'), str) or not authorization['user_authorization_basis'].strip()
            or not isinstance(authorization.get('reason'), str) or not authorization['reason'].strip()
            or not isinstance(authorization.get('observed_rate_limit_refs'), list) or not authorization['observed_rate_limit_refs']):
        raise ValueError('Explicit source-bound concurrency authorization within the global 128 ceiling required')
    for ref in authorization['observed_rate_limit_refs']:
        if reference(root, ref['path']) != ref:
            raise ValueError('Observed rate-limit evidence changed')


def authorize_workers(root, plan_ref, authorization_ref):
    """Append a bounded worker-ceiling change after draining the sole coordinator."""
    root = Path(root).resolve(); plan, _ = _plan(root, plan_ref)
    if not plan.get('continuation'):
        raise ValueError('Worker authorization requires the explicit continuation')
    authorization = verified_json(root, authorization_ref)
    journal = PilotJournal(root, plan['phase_id'])
    try:
        authority = journal.phase_authority()
        if not authority or authority['plan_ref'] != plan_ref:
            raise ValueError('Exact prepared continuation authority required')
        if any(reference(root, ref['path']) != ref for ref in authority['producer_files']):
            raise ValueError('Amend reviewed producing code before changing the worker ceiling')
        if _legacy_heads(root) != authority['legacy_heads']:
            raise ValueError('Historical accounting changed before worker authorization')
        for ref in authority.get('worker_authorization_refs', []):
            prior = verified_json(root, ref)
            if prior['authorization_ref'] == authorization_ref:
                return {'status': 'already_authorized', 'amendment_ref': ref,
                    'worker_ceiling': authority['worker_ceiling'], 'new_model_requests': 0}
        if any(row['state'] in ('running', 'held_unknown_send') for row in journal.task_rows()):
            raise ValueError('Drain or reconcile active model work before changing the worker ceiling')
        ceiling = authority.get('worker_ceiling', plan.get('max_workers', 32))
        before = [tuple(row) for row in journal.db.execute('SELECT * FROM reextraction_attempts ORDER BY attempt_id')]
        before_tasks = [tuple(row) for row in journal.db.execute('SELECT * FROM reextraction_tasks ORDER BY task_id')]
        amendment = {'record_kind': 'explicit_execution_workers_authorization', 'phase_id': journal.phase,
            'plan_ref': plan_ref, 'created_at': now(), 'authorization_ref': authorization_ref,
            'previous_ceiling': ceiling, 'worker_ceiling': authorization.get('workers'),
            'producer_files': authority['producer_files'], 'new_model_requests': 0, 'attempt_records_unchanged': True}
        _verify_worker_authorization(root, amendment, authority, authority['producer_files'], ceiling)
        ref = immutable_json(root, f'data/current/reextraction/{journal.phase}/worker_authorizations/{digest(canonical(amendment))}.json', amendment)
        with journal.db:
            journal.event('execution_workers_authorized', amendment_ref=ref)
        journal._authority_cache = None
        after = [tuple(row) for row in journal.db.execute('SELECT * FROM reextraction_attempts ORDER BY attempt_id')]
        after_tasks = [tuple(row) for row in journal.db.execute('SELECT * FROM reextraction_tasks ORDER BY task_id')]
        if before != after or before_tasks != after_tasks or _legacy_heads(root) != authority['legacy_heads']:
            raise ValueError('Worker authorization changed request or cost history')
        journal.verify_events()
        return {'status': 'workers_authorized', 'amendment_ref': ref,
            'worker_ceiling': authorization['workers'], 'new_model_requests': 0}
    finally:
        journal.close()


def _verify_unsent_gate(root, phase, record):
    expected = {'status': 'not_sent', 'sent': False, 'error': {'type': 'dispatch_gate'},
        'usage': None, 'retryable': False}
    directory = owned(root, f'data/current/reextraction/{phase}/calls/{record["attempt_id"]}')
    if (record.get('state') != 'not_sent' or record.get('result') != expected
            or record.get('gateway_reported_proxy_estimate_usd') != '0'
            or Decimal(record.get('reference_OpenAI_standard_usage_upper_bound_usd') or '-1') != 0
            or record.get('usage') is not None or directory.exists()
            or type(record.get('ordinal')) is not int or not 1 <= record['ordinal'] < MAX_ATTEMPTS):
        raise ValueError('Only an audited native gate stop before HTTP dispatch can be requeued')


def _continuation_authority(journal, plan, citations):
    """Freeze completed pilot refs and forbid a second dispatch phase for an article."""
    continuation = plan.get('continuation')
    if continuation is None:
        return None
    parent_plan = verified_json(journal.root, continuation['pilot_plan_ref'])
    parent = PilotJournal.__new__(PilotJournal)
    parent.root, parent.phase, parent.db = journal.root, parent_plan['phase_id'], journal.db
    authority = parent.phase_authority()
    rows = parent.task_rows()
    if (not authority or authority['plan_ref'] != continuation['pilot_plan_ref']
            or authority['selected_articles'] != PILOT_SIZE
            or authority['source_or_request_holds'] or len(rows) != PILOT_SIZE
            or any(row['state'] not in ('complete', 'complete_with_issues') or not row['result_ref_json'] for row in rows)):
        raise ValueError('The reviewed pilot must be fully completed before continuation')
    reused = []
    for row in rows:
        ref = json.loads(row['result_ref_json']); value = verified_json(journal.root, ref)
        if not value['validated'].get('valid'):
            raise ValueError('A completed source-validated pilot record is required')
        reused.append({'pmid': row['pmid'], 'task_id': row['task_id'], 'artifact_ref': ref})
    pmids = {c['pmid'] for c in citations}
    existing = {row['pmid'] for row in journal.db.execute('SELECT pmid FROM reextraction_tasks')}
    for row in journal.db.execute('SELECT authority_json FROM reextraction_phases'):
        existing.update(item['pmid'] for item in json.loads(row['authority_json']).get('local_dispositions', []))
    if pmids & existing:
        raise ValueError('A continuation article already belongs to an existing compact R2 dispatch phase')
    return {**continuation, 'pilot_phase_id': parent.phase, 'reused_articles': reused,
        'new_articles': len(citations), 'total_articles': REVIEWED_COHORT_SIZE,
        'R3_eligible_decisions': ['retain', 'unclear'], 'R3_dispatch_enabled': False}


def build_task(root, phase, citation):
    if not isinstance(citation.get('abstract'), str) or not citation['abstract'].strip():
        raise ValueError('A scientific abstract is required for this R2 pilot')
    source = screening.build_source(citation, 'R2')
    source['publication_metadata'] = {key: deepcopy(citation[key]) for key in
        ('pmid', 'doi', 'pmcid', 'title', 'year', 'authors') if key in citation}
    body = quantitative.request_body(source, max_output_tokens=OUTPUT_INITIAL,
        reasoning_effort=EFFORT, service_tier='default', wire_ceiling=WIRE_CEILING)
    task_id = 'qr2-' + digest(canonical({'phase': phase, 'source': source, 'body': body}))[:32]
    directory = f'data/current/reextraction/{phase}/tasks/{task_id}'
    source_ref = immutable_json(root, directory + '/source.json', source)
    task = {'task_id': task_id, 'stage': 'R2', 'model': MODEL, 'body': body,
        'metadata': {'phase_id': phase, 'provider': PROVIDER, 'pmid': citation['pmid'],
            'report_id': citation['report_id'], 'source_ref': source_ref,
            'max_output_tokens_ceiling': OUTPUT_CEILING, 'wire_ceiling_bytes': WIRE_CEILING}}
    task_ref = immutable_json(root, directory + '/task.json', task)
    return task, task_ref


class CompactGatewayTransport(GatewayTransport):
    """Reuse fixed-origin, credential-safe HTTP staging for the new contract."""
    def wire_for_task(self, task):
        meta = task.get('metadata') or {}
        if (task.get('stage') != 'R2' or task.get('model') != MODEL or meta.get('provider') != PROVIDER
                or not isinstance(task.get('task_id'), str) or not re.fullmatch(r'qr2-[a-f0-9]{32}', task['task_id'])
                or meta.get('max_output_tokens_ceiling') != OUTPUT_CEILING or meta.get('wire_ceiling_bytes') != WIRE_CEILING):
            raise ValueError('Exact compact Cornell R2 task required')
        body = task.get('body') or {}
        cap = body.get('max_output_tokens')
        if type(cap) is not int or not OUTPUT_INITIAL <= cap <= OUTPUT_CEILING:
            raise ValueError('Explicit bounded extraction output required')
        source = verified_json(self.root, meta['source_ref'])
        expected = quantitative.request_body(source, max_output_tokens=cap,
            reasoning_effort=EFFORT, service_tier='default', wire_ceiling=WIRE_CEILING,
            recorded_instructions=body.get('instructions'))
        if body != expected or source['stage'] != 'R2' or source['pmid'] != meta['pmid'] or source['report_id'] != meta['report_id']:
            raise ValueError('Exact source-bound Sol xhigh request required')
        return canonical(body)


class PilotJournal:
    """One coordinator; append-only audit events alongside, never over, legacy tables."""
    model = MODEL
    effort = EFFORT
    stage = 'R2'
    provider = PROVIDER
    max_attempts = MAX_ATTEMPTS

    def __init__(self, root, phase):
        self.root = Path(root).resolve(); self.phase = phase
        path = owned(self.root, DB_PATH)
        if not path.is_file():
            raise ValueError('Existing fixed Cornell gateway journal required; no new account reset')
        for suffix in ('', '-wal', '-shm', '-journal'):
            p = owned(self.root, str(path) + suffix)
            if p.exists() and (not p.is_file() or p.stat().st_nlink != 1):
                raise ValueError('Owned gateway journal and sidecars required')
        lease = owned(self.root, 'data/current/accounting.sqlite3.lock')
        self.lease = os.open(lease, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(self.lease)
            raise RuntimeError('Another model coordinator owns the project lease') from None
        self.db = sqlite3.connect(path, timeout=30); self.db.row_factory = sqlite3.Row
        # A committed-response WAL I/O failure occurred in this OneDrive folder.
        # The reviewed recovery made a SQLite backup before selecting DELETE.
        # Keep that mode across restarts instead of recreating WAL/SHM files.
        mode = self.db.execute('PRAGMA journal_mode=DELETE').fetchone()[0]
        if mode.lower() != 'delete':
            self.db.close(); fcntl.flock(self.lease, fcntl.LOCK_UN); os.close(self.lease)
            raise RuntimeError('Stable DELETE journal mode could not be selected')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS reextraction_phases(phase_id TEXT PRIMARY KEY,authority_json TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS reextraction_tasks(task_id TEXT PRIMARY KEY,phase_id TEXT NOT NULL,pmid TEXT NOT NULL,
            task_ref_json TEXT NOT NULL,state TEXT NOT NULL,result_ref_json TEXT,next_retry REAL,UNIQUE(phase_id,pmid));
          CREATE TABLE IF NOT EXISTS reextraction_attempts(attempt_id TEXT PRIMARY KEY,task_id TEXT NOT NULL,ordinal INTEGER NOT NULL,
            state TEXT NOT NULL,record_json TEXT NOT NULL,UNIQUE(task_id,ordinal));
          CREATE TABLE IF NOT EXISTS reextraction_events(seq INTEGER PRIMARY KEY,previous_hash TEXT NOT NULL,event_hash TEXT NOT NULL,payload TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS reextraction_provider_identifiers(kind TEXT NOT NULL,value TEXT NOT NULL,attempt_id TEXT NOT NULL,PRIMARY KEY(kind,value));
        ''')
        try:
            self.verify_events()
        except BaseException:
            self.db.close(); fcntl.flock(self.lease, fcntl.LOCK_UN); os.close(self.lease)
            raise

    def close(self):
        self.db.close(); fcntl.flock(self.lease, fcntl.LOCK_UN); os.close(self.lease)

    def event(self, kind, **value):
        old = self.db.execute('SELECT seq,event_hash FROM reextraction_events ORDER BY seq DESC LIMIT 1').fetchone()
        seq, previous = (old['seq'] + 1, old['event_hash']) if old else (1, '0' * 64)
        payload = canonical({'seq': seq, 'previous_hash': previous, 'phase_id': self.phase,
            'at': now(), 'kind': kind, **value}).decode()
        self.db.execute('INSERT INTO reextraction_events VALUES(?,?,?,?)', (seq, previous, digest(payload.encode()), payload))

    def verify_events(self):
        previous = '0' * 64; phases = {}; tasks = {}; attempts = {}; producer_sets = {}; resolved_holds = set(); worker_limits = {}
        for seq, row in enumerate(self.db.execute('SELECT * FROM reextraction_events ORDER BY seq'), 1):
            item = json.loads(row['payload'])
            if (seq != row['seq'] or row['previous_hash'] != previous or item['seq'] != seq
                    or item['previous_hash'] != previous or digest(row['payload'].encode()) != row['event_hash']):
                raise ValueError('Extraction audit event chain changed')
            previous = row['event_hash']
            kind = item['kind']
            if kind == 'phase_opened':
                if item['phase_id'] in phases or verified_json(self.root, item['authority_ref']) != item['authority']:
                    raise ValueError('Extraction phase authority changed')
                phases[item['phase_id']] = item['authority']
                producer_sets[item['phase_id']] = item['authority']['producer_files']
                worker_limits[item['phase_id']] = verified_json(self.root, item['authority']['plan_ref']).get('max_workers', 32)
            elif kind == 'task_prepared':
                task = verified_json(self.root, item['task_ref']); task_id = task['task_id']
                if task_id in tasks or task['metadata']['phase_id'] != item['phase_id'] or task['metadata']['pmid'] != item['pmid']:
                    raise ValueError('Extraction task identity changed')
                tasks[task_id] = (task_id, item['phase_id'], item['pmid'], canonical(item['task_ref']).decode(), 'pending', None, None)
            elif kind in ('reserved', 'finished', 'interrupted_hold'):
                record = item['record']; task_id = record['task_id']; attempt_id = record['attempt_id']
                if task_id not in tasks:
                    raise ValueError('Extraction attempt predates task')
                if kind == 'reserved':
                    if attempt_id in attempts or tasks[task_id][4] not in ('pending', 'retry_wait'):
                        raise ValueError('Duplicate or unscheduled extraction reservation')
                    state = 'reserved'; task_state = 'running'; result_ref = None; due = None
                else:
                    if attempt_id not in attempts or attempts[attempt_id][3] != 'reserved':
                        raise ValueError('Extraction response lacks one open reservation')
                    state = record['state']; task_state = state; due = record.get('next_retry')
                    result_ref = canonical(item['result_ref']).decode() if item.get('result_ref') else None
                attempts[attempt_id] = (attempt_id, task_id, record['ordinal'], state, canonical(record).decode())
                tasks[task_id] = (*tasks[task_id][:4], task_state, result_ref, due)
            elif kind == 'producer_amendment':
                amendment = verified_json(self.root, item['amendment_ref'])
                if (amendment['phase_id'] != item['phase_id']
                        or amendment['old_producer_files'] != producer_sets[item['phase_id']]
                        or amendment['plan_ref'] != phases[item['phase_id']]['plan_ref']
                        or amendment.get('request_bodies_unchanged') is not True
                        or amendment.get('new_model_requests') != 0):
                    raise ValueError('Producer amendment authority differs')
                members = [value for value in tasks.values() if value[1] == item['phase_id']]
                if _body_proof(self.root, members) != amendment['task_body_proof']:
                    raise ValueError('Producer amendment changed finite request bodies')
                producer_sets[item['phase_id']] = amendment['new_producer_files']
            elif kind == 'validation_revision':
                task_id = item['task_id']; old = tasks.get(task_id)
                if (old is None or old[4] != item['old_state']
                        or (json.loads(old[5]) if old[5] else None) != item['old_result_ref']
                        or item['producer_files'] != producer_sets[item['phase_id']]):
                    raise ValueError('Validation revision does not bind preceding accepted view')
                value = verified_json(self.root, item['new_result_ref'])
                if (value['task_id'] != task_id or value['validation_producer_files'] != item['producer_files']
                        or value['attempt_id'] not in attempts):
                    raise ValueError('Validation revision lacks original response identity')
                tasks[task_id] = (*old[:4], item['new_state'], canonical(item['new_result_ref']).decode(), None)
            elif kind == 'source_hold_resolution':
                resolution = verified_json(self.root, item['resolution_ref'])
                key = (item['phase_id'], resolution.get('pmid'))
                if key in resolved_holds:
                    raise ValueError('A source hold was resolved more than once')
                _verify_source_resolution(self.root, resolution, phases[item['phase_id']], producer_sets[item['phase_id']])
                if any(value[1] == item['phase_id'] and value[2] == resolution['pmid'] for value in tasks.values()):
                    raise ValueError('A model-dispatched article cannot become a local source disposition')
                resolved_holds.add(key)
            elif kind == 'execution_workers_authorized':
                amendment = verified_json(self.root, item['amendment_ref'])
                _verify_worker_authorization(self.root, amendment, phases[item['phase_id']], producer_sets[item['phase_id']], worker_limits[item['phase_id']])
                worker_limits[item['phase_id']] = amendment['worker_ceiling']
            elif kind == 'unsent_requeued':
                old = tasks.get(item['task_id']); attempt = attempts.get(item['attempt_id'])
                record = json.loads(attempt[4]) if attempt else {}
                if (old is None or old[1] != item['phase_id'] or old[4] != 'not_sent'
                        or not attempt or attempt[1] != item['task_id']
                        or item.get('previous_record_sha256') != digest(canonical(record))
                        or record['ordinal'] != max(a[2] for a in attempts.values() if a[1] == item['task_id'])):
                    raise ValueError('Unsent requeue must bind the last native unsent attempt')
                _verify_unsent_gate(self.root, item['phase_id'], record)
                tasks[item['task_id']] = (*old[:4], 'pending', None, None)
            else:
                raise ValueError('Unknown extraction audit event')
        actual_phases = {row['phase_id']: json.loads(row['authority_json']) for row in self.db.execute('SELECT * FROM reextraction_phases')}
        actual_tasks = {row['task_id']: tuple(row) for row in self.db.execute('SELECT * FROM reextraction_tasks')}
        actual_attempts = {row['attempt_id']: tuple(row) for row in self.db.execute('SELECT * FROM reextraction_attempts')}
        if actual_phases != phases or actual_tasks != tasks or actual_attempts != attempts:
            raise ValueError('Extraction accounting projection differs from immutable audit events')

    def phase_authority(self):
        cached = getattr(self, '_authority_cache', None)
        if cached is not None:
            return deepcopy(cached)
        row = self.db.execute('SELECT authority_json FROM reextraction_phases WHERE phase_id=?', (self.phase,)).fetchone()
        if row is None:
            return None
        authority = json.loads(row[0]); revisions = []; resolutions = []; worker_refs = []
        ceiling = verified_json(self.root, authority['plan_ref']).get('max_workers', 32)
        for event in self.db.execute("SELECT payload FROM reextraction_events WHERE json_extract(payload,'$.kind') IN ('producer_amendment','source_hold_resolution','execution_workers_authorized') AND json_extract(payload,'$.phase_id')=? ORDER BY seq", (self.phase,)):
            item = json.loads(event[0])
            if item['kind'] == 'producer_amendment':
                amendment = verified_json(self.root, item['amendment_ref'])
                if amendment['old_producer_files'] != authority['producer_files']:
                    raise ValueError('Producer amendment chain differs')
                authority['producer_files'] = amendment['new_producer_files']; revisions.append(item['amendment_ref'])
            elif item['kind'] == 'source_hold_resolution':
                resolution = verified_json(self.root, item['resolution_ref'])
                _verify_source_resolution(self.root, resolution, authority, authority['producer_files'])
                authority.setdefault('local_dispositions', []).append(resolution['local_disposition'])
                authority['source_or_request_holds'] = [hold for hold in authority['source_or_request_holds'] if hold['pmid'] != resolution['pmid']]
                resolutions.append(item['resolution_ref'])
            else:
                amendment = verified_json(self.root, item['amendment_ref'])
                _verify_worker_authorization(self.root, amendment, authority, authority['producer_files'], ceiling)
                ceiling = amendment['worker_ceiling']; worker_refs.append(item['amendment_ref'])
        if revisions:
            authority['producer_revision_refs'] = revisions
        if resolutions:
            authority['source_hold_resolution_refs'] = resolutions
        if worker_refs:
            authority['worker_authorization_refs'] = worker_refs
            authority['worker_ceiling'] = ceiling
        self._authority_cache = authority
        return deepcopy(authority)

    def task_rows(self):
        return list(self.db.execute('SELECT * FROM reextraction_tasks WHERE phase_id=? ORDER BY rowid', (self.phase,)))

    def attempts(self, task_id):
        return [dict(x) | {'record': json.loads(x['record_json'])} for x in self.db.execute(
            'SELECT * FROM reextraction_attempts WHERE task_id=? ORDER BY ordinal', (task_id,))]

    def reserve(self, task, cap):
        previous = self.attempts(task['task_id']); row = self.db.execute(
            'SELECT state FROM reextraction_tasks WHERE task_id=?', (task['task_id'],)).fetchone()
        if row is None or row[0] not in ('pending', 'retry_wait') or len(previous) >= self.max_attempts:
            raise ValueError('Task is complete, held, active, or exhausted')
        ordinal = len(previous) + 1; attempt_id = task['task_id'] + '-a' + str(ordinal)
        record = {'attempt_id': attempt_id, 'task_id': task['task_id'], 'pmid': task['metadata']['pmid'],
            'model': self.model, 'reasoning_effort': self.effort, 'ordinal': ordinal, 'reserved_at': now(),
            'output_limit': cap, 'provider': self.provider, 'direct_OpenAI_charge': False}
        with self.db:
            self.db.execute('INSERT INTO reextraction_attempts VALUES(?,?,?,?,?)',
                (attempt_id, task['task_id'], ordinal, 'reserved', canonical(record).decode()))
            self.db.execute('UPDATE reextraction_tasks SET state=?,next_retry=NULL WHERE task_id=?', ('running', task['task_id']))
            self.event('reserved', record=record)
        return record

    def finish(self, task, record, result, validated=None, retry_at=None):
        attempt_id = record['attempt_id']; integrity = False
        if result.get('artifacts'):
            try:
                if set(result['artifacts']) != {'request', 'sent', 'raw_response', 'result', 'receipt'}:
                    raise ValueError('Incomplete attempt proofs')
                for ref in result['artifacts'].values():
                    if reference(self.root, ref['path']) != ref:
                        raise ValueError('Attempt artifact changed')
                request = verified_json(self.root, result['artifacts']['request'])
                saved = verified_json(self.root, result['artifacts']['result'])
                receipt = verified_json(self.root, result['artifacts']['receipt'])
                sent = verified_json(self.root, result['artifacts']['sent'])
                try:
                    raw = json.loads(owned(self.root, result['artifacts']['raw_response']['path']).read_bytes())
                    if not isinstance(raw, dict): raw = {}
                except (ValueError, UnicodeError):
                    raw = {}
                expected_body = deepcopy(task['body']); expected_body['max_output_tokens'] = record['output_limit']
                if (request.get('provider') != self.provider or request.get('endpoint') != _endpoint(self.root)
                        or request.get('task_id') != task['task_id'] or request.get('attempt_id') != attempt_id
                        or request.get('body') != expected_body
                        or digest(canonical(request['body'])) != result.get('request_body_sha256')
                        or raw != result.get('response')
                        or (raw.get('usage') if isinstance(raw.get('usage'), dict) else None) != result.get('usage')):
                    raise ValueError('Attempt request identity changed')
                for key in ('attempt_id', 'task_id', 'provider', 'account', 'status', 'payload', 'usage', 'response',
                            'headers', 'error', 'provider_request_id', 'request_body_sha256'):
                    if saved.get(key) != result.get(key):
                        raise ValueError('Saved native response differs from result')
                if (receipt.get('attempt_id') != attempt_id or receipt.get('task_id') != task['task_id']
                        or receipt.get('provider') != self.provider or receipt.get('model') != self.model
                        or receipt.get('endpoint') != request['endpoint'] or receipt.get('usage') != result.get('usage')
                        or sent.get('attempt_id') != attempt_id or sent.get('task_id') != task['task_id']
                        or sent.get('endpoint') != request['endpoint']
                        or sent.get('request_body_sha256') != result.get('request_body_sha256')):
                    raise ValueError('Receipt or sent proof differs')
                if result.get('status') == 'completed' and (raw.get('status') != 'completed'
                        or raw.get('model') != self.model or extract_payload(raw) != result.get('payload')
                        or (raw.get('reasoning') or {}).get('effort') not in (None, self.effort)):
                    raise ValueError('Completed native response proof differs')
            except (ValueError, KeyError, TypeError):
                integrity = True
        elif result.get('status') == 'completed':
            integrity = True
        ids = [('request', result.get('provider_request_id')), ('response', (result.get('response') or {}).get('id'))]
        for kind, value in ids:
            if not isinstance(value, str) or not value:
                continue
            for table in ('provider_identifiers', 'reextraction_provider_identifiers'):
                old = self.db.execute('SELECT attempt_id FROM ' + table + ' WHERE kind=? AND value=?', (kind, value)).fetchone()
                if old and old[0] != attempt_id:
                    integrity = True
        unknown = result.get('sent') is not False and result.get('http_status') is None
        proxy = None
        try:
            raw = (result.get('headers') or {}).get('x-litellm-response-cost')
            p = Decimal(raw) if raw is not None else None
            if p is not None and p.is_finite() and p >= 0 and not integrity:
                proxy = str(p)
        except (InvalidOperation, TypeError):
            pass
        usage_units = None if integrity else accounting.usage_cost(self.model, result.get('usage'))
        if result.get('sent') is False:
            proxy = '0'; usage_units = 0
        output = None
        if integrity or (result.get('error') or {}).get('type') in {'returned_route_mismatch', 'returned_reasoning_mismatch', 'route_integrity_error', 'credential_echo_redacted'}:
            state = 'held_integrity'; retry_at = None
        elif unknown:
            state = 'held_unknown_send'; retry_at = None
        elif result.get('sent') is False:
            state = 'not_sent'; retry_at = None
        elif result.get('status') == 'completed' and validated and validated.get('valid'):
            state = 'complete_with_issues' if validated.get('issues') else 'complete'
            output = _save_validation(self, task, attempt_id, result, validated)
        elif retry_at is not None:
            state = 'retry_wait'
        else:
            state = 'validation_hold' if result.get('status') == 'completed' else 'provider_hold'
        completed = {**record, 'finished_at': now(), 'state': state, 'result': result,
            'validated_issues': (validated or {}).get('issues', []), 'global_errors': (validated or {}).get('global_errors', []),
            'gateway_reported_proxy_estimate_usd': proxy,
            'reference_OpenAI_standard_usage_upper_bound_usd': accounting.usd(usage_units) if usage_units is not None else None,
            'usage': result.get('usage'), 'cost_is_invoice': False, 'next_retry': retry_at}
        with self.db:
            for kind, value in ids:
                if isinstance(value, str) and value:
                    self.db.execute('INSERT OR IGNORE INTO reextraction_provider_identifiers VALUES(?,?,?)', (kind, value, attempt_id))
            self.db.execute('UPDATE reextraction_attempts SET state=?,record_json=? WHERE attempt_id=?',
                (state, canonical(completed).decode(), attempt_id))
            self.db.execute('UPDATE reextraction_tasks SET state=?,result_ref_json=?,next_retry=? WHERE task_id=?',
                (state, canonical(output).decode() if output else None, retry_at, task['task_id']))
            self.event('finished', record=completed, result_ref=output)
        return state

    def recover(self):
        """Replay saved completed responses; never resend an interrupted reservation."""
        for row in self.task_rows():
            if row['state'] != 'running':
                continue
            task = verified_json(self.root, json.loads(row['task_ref_json']))
            record = self.attempts(row['task_id'])[-1]['record']
            directory = owned(self.root, f'data/current/reextraction/{self.phase}/calls/{record["attempt_id"]}')
            saved = directory / 'result.json'; receipt = directory / 'receipt.json'
            if saved.exists() and receipt.exists():
                result = read_json(saved)
                result['artifacts']['result'] = reference(self.root, saved)
                result['artifacts']['receipt'] = reference(self.root, receipt)
                source = verified_json(self.root, task['metadata']['source_ref'])
                validated = quantitative.validate(result['payload'], source) if result.get('status') == 'completed' else None
                self.finish(task, record, result, validated)
            else:
                # A reservation may have passed the send boundary before process loss.
                with self.db:
                    record.update(state='held_unknown_send', interrupted_at=now(), cost_is_invoice=False)
                    self.db.execute('UPDATE reextraction_attempts SET state=?,record_json=? WHERE attempt_id=?',
                        ('held_unknown_send', canonical(record).decode(), record['attempt_id']))
                    self.db.execute('UPDATE reextraction_tasks SET state=? WHERE task_id=?', ('held_unknown_send', row['task_id']))
                    self.event('interrupted_hold', record=record)

    def requeue_not_sent(self):
        """Resume only proven pre-HTTP gate stops, retaining every attempt ordinal."""
        for row in self.task_rows():
            if row['state'] != 'not_sent':
                continue
            history = self.attempts(row['task_id'])
            if not history:
                continue
            record = history[-1]['record']
            try:
                _verify_unsent_gate(self.root, self.phase, record)
            except (ValueError, InvalidOperation):
                continue
            with self.db:
                self.db.execute('UPDATE reextraction_tasks SET state=?,result_ref_json=NULL,next_retry=NULL WHERE task_id=?',
                    ('pending', row['task_id']))
                self.event('unsent_requeued', task_id=row['task_id'], attempt_id=record['attempt_id'],
                    previous_record_sha256=digest(canonical(record)))


def _body_proof(root, members):
    rows = []
    for row in sorted(members, key=lambda r: r[0]):
        ref = json.loads(row[3]); task = verified_json(root, ref)
        verified_json(root, task['metadata']['source_ref'])
        rows.append({'task_id': task['task_id'], 'task_ref': ref,
            'body_sha256': digest(canonical(task['body'])), 'source_ref': task['metadata']['source_ref']})
    return {'tasks': len(rows), 'all_task_sources_and_bodies_sha256': digest(canonical(rows))}


def _save_validation(journal, task, attempt_id, native, validated):
    value = {'pmid': task['metadata']['pmid'], 'stage': journal.stage, 'task_id': task['task_id'], 'attempt_id': attempt_id,
        'model': journal.model, 'reasoning_effort': journal.effort, 'source_ref': task['metadata']['source_ref'],
        'provider': journal.provider, 'validated': validated, 'native_result_ref': native['artifacts']['result'],
        'validation_producer_files': journal.phase_authority()['producer_files']}
    path = (f'data/current/reextraction/{journal.phase}/records/{task["metadata"]["pmid"]}/'
        f'{attempt_id}-{digest(canonical(value))[:20]}.json')
    return immutable_json(journal.root, path, value)


def amend_producers(root, plan_ref, reason, *, revalidate=True):
    """Record a wire-identical validator/runtime repair and replay saved responses.

    This cannot alter model prompts, source inputs, task identities, eligibility
    history, selected articles, retry limits, or any request/cost record. The
    initial authority and every preceding validation artifact remain immutable.
    """
    if not isinstance(reason, str) or not reason.strip():
        raise ValueError('An explicit producer-amendment reason is required')
    root = Path(root).resolve(); plan, _ = _plan(root, plan_ref)
    journal = PilotJournal(root, plan['phase_id'])
    try:
        authority = journal.phase_authority()
        if not authority or authority['plan_ref'] != plan_ref:
            raise ValueError('Exact prepared pilot authority required')
        if _legacy_heads(root) != authority['legacy_heads']:
            raise ValueError('Historical accounting changed before producer amendment')
        members = journal.task_rows()
        for row in members:
            task = verified_json(root, json.loads(row['task_ref_json']))
            source = verified_json(root, task['metadata']['source_ref'])
            expected = quantitative.request_body(source, max_output_tokens=task['body']['max_output_tokens'],
                reasoning_effort=EFFORT, service_tier='default', wire_ceiling=WIRE_CEILING,
                recorded_instructions=task['body'].get('instructions'))
            if expected != task['body']:
                raise ValueError('Producer amendment would change a recorded request body: ' + row['pmid'])
            if row['state'] == 'running':
                attempts = journal.attempts(row['task_id'])
                record = attempts[-1]['record']
                directory = owned(root, f'data/current/reextraction/{journal.phase}/calls/{record["attempt_id"]}')
                if not (directory / 'result.json').is_file() or not (directory / 'receipt.json').is_file():
                    raise ValueError('Unresolved active/unknown send prevents producer amendment')
                native = read_json(directory / 'result.json'); receipt = read_json(directory / 'receipt.json')
                if (native.get('status') != 'completed' or native.get('http_status') != 200
                        or receipt.get('attempt_id') != record['attempt_id'] or receipt.get('status') != 'completed'):
                    raise ValueError('Only definitively completed saved responses may await recovery')
        old_refs = authority['producer_files']
        new_refs = [producer_reference(root, ref['path']) for ref in old_refs]
        changes = [old['path'] for old, new in zip(old_refs, new_refs) if old != new]
        if set(changes) - {'src/metamelanoma/reextraction.py', 'src/metamelanoma/quantitative.py'}:
            raise ValueError('Only the reviewed compact validator and pilot runtime may be amended')
        before_attempts = [tuple(row) for row in journal.db.execute(
            'SELECT a.* FROM reextraction_attempts a JOIN reextraction_tasks t USING(task_id) WHERE t.phase_id=? ORDER BY a.attempt_id', (journal.phase,))]
        amendment_ref = None
        if changes:
            amendment = {'record_kind': 'wire_identical_quantitative_producer_amendment', 'phase_id': journal.phase,
                'plan_ref': plan_ref, 'created_at': now(), 'reason': reason.strip(),
                'old_producer_files': old_refs, 'new_producer_files': new_refs, 'changed_files': changes,
                'task_body_proof': _body_proof(root, members), 'request_bodies_unchanged': True,
                'historical_accounting_preserved': True, 'new_model_requests': 0,
                'journal_mode': journal.db.execute('PRAGMA journal_mode').fetchone()[0]}
            amendment_ref = immutable_json(root, f'data/current/reextraction/{journal.phase}/producer_amendments/{digest(canonical(amendment))}.json', amendment)
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
                output = _save_validation(journal, task, record['attempt_id'], native, validated)
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
        if before_attempts != after_attempts or _legacy_heads(root) != authority['legacy_heads']:
            raise ValueError('Producer amendment altered request/cost history')
        journal.verify_events()
        value = _status(journal); _publish_status(journal, value)
        return {'status': 'producer_amended' if changes else 'producer_unchanged', 'amendment_ref': amendment_ref,
            'changed_files': changes, 'revalidated_articles': len(revisions), 'revisions': revisions,
            'request_bodies_unchanged': True, 'attempt_records_unchanged': True,
            'new_model_requests': 0, 'phase_status': value}
    finally:
        journal.close()


def prepare(root, plan_ref):
    """Create source-bound immutable tasks without loading credentials or sending requests."""
    root = Path(root).resolve(); plan, citations = _plan(root, plan_ref); phase = plan['phase_id']
    endpoint = _endpoint(root); journal = PilotJournal(root, phase)
    try:
        prior = journal.phase_authority()
        if prior:
            if prior['plan_ref'] != plan_ref:
                raise ValueError('An existing extraction phase cannot change its cohort or authority')
            return _status(journal)
        continuation = _continuation_authority(journal, plan, citations)
        dispositions = _local_dispositions(root, plan, citations)
        legacy = _legacy_heads(root)
        producers = [producer_reference(root, 'src/metamelanoma/' + name) for name in PRODUCERS]
        tasks, problems, local = [], [], []
        for citation in citations:
            if citation['pmid'] in dispositions:
                local.append(_store_local_disposition(root, phase, citation, dispositions[citation['pmid']]))
                continue
            try:
                task, ref = build_task(root, phase, citation); tasks.append((task, ref))
            except (ValueError, KeyError, TypeError) as exc:
                problems.append({'pmid': citation['pmid'], 'status': 'source_or_request_hold', 'reason': str(exc)})
        authority = {'phase_id': phase, 'plan_ref': plan_ref, 'prepared_at': now(), 'endpoint': endpoint,
            'model': MODEL, 'reasoning_effort': EFFORT, 'stage': 'R2', 'selected_articles': len(citations),
            'legacy_heads': legacy, 'producer_files': producers, 'source_or_request_holds': problems,
            'max_attempts': MAX_ATTEMPTS, 'max_output_tokens': OUTPUT_INITIAL, 'output_ceiling': OUTPUT_CEILING,
            'direct_OpenAI_dispatch': False, 'eligibility_registry_writes': False,
            'cost_mode': 'gateway_proxy_estimates_and_reference_upper_bounds_not_invoices'}
        if continuation is not None:
            authority['continuation'] = continuation
        if local:
            authority['local_dispositions'] = local
        authority_ref = immutable_json(root, f'data/current/reextraction/{phase}/authority.json', authority)
        with journal.db:
            journal.db.execute('INSERT INTO reextraction_phases VALUES(?,?)', (phase, canonical(authority).decode()))
            journal.event('phase_opened', authority_ref=authority_ref, authority=authority)
            for task, ref in tasks:
                journal.db.execute('INSERT INTO reextraction_tasks VALUES(?,?,?,?,?,?,?)',
                    (task['task_id'], phase, task['metadata']['pmid'], canonical(ref).decode(), 'pending', None, None))
                journal.event('task_prepared', task_ref=ref, pmid=task['metadata']['pmid'])
        if _legacy_heads(root) != legacy:
            raise ValueError('Historical accounting changed during preparation')
        result = _status(journal); _publish_status(journal, result); return result
    finally:
        journal.close()


def _status(journal):
    authority = journal.phase_authority()
    if authority is None:
        raise ValueError('Prepare the finite pilot first')
    rows = journal.task_rows(); states = Counter(row['state'] for row in rows)
    article_costs = []; total_proxy = Decimal(0); total_reference = Decimal(0); unknown = 0; total_attempts = 0
    decisions = Counter()
    decision_cache = getattr(journal, '_decision_cache', None)
    if decision_cache is None:
        decision_cache = journal._decision_cache = {}
    for task in rows:
        attempts = journal.attempts(task['task_id']); proxy = Decimal(0); estimate = Decimal(0); missing = 0
        details = []
        for row in attempts:
            r = row['record']; total_attempts += 1
            cost = r.get('gateway_reported_proxy_estimate_usd'); ref = r.get('reference_OpenAI_standard_usage_upper_bound_usd')
            if cost is None:
                missing += 1
            else:
                proxy += Decimal(cost)
            if ref is not None:
                estimate += Decimal(ref)
            details.append({key: r.get(key) for key in ('attempt_id', 'ordinal', 'state', 'reserved_at', 'finished_at',
                'gateway_reported_proxy_estimate_usd', 'reference_OpenAI_standard_usage_upper_bound_usd', 'usage')})
        total_proxy += proxy; total_reference += estimate; unknown += missing
        if task['state'] in ('complete', 'complete_with_issues') and task['result_ref_json']:
            ref = json.loads(task['result_ref_json']); stat = owned(journal.root, ref['path']).stat()
            key = (task['result_ref_json'], stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
            if key not in decision_cache:
                stored = verified_json(journal.root, ref)
                decision = ((stored.get('validated') or {}).get('record') or {}).get('decision') or {}
                decision_cache[key] = decision.get('status', 'unknown')
            decisions[decision_cache[key]] += 1
        article_costs.append({'pmid': task['pmid'], 'task_id': task['task_id'], 'state': task['state'],
            'attempt_count': len(attempts), 'gateway_known_cost_subtotal_usd': str(proxy), 'gateway_cost_unknown_attempts': missing,
            'reference_OpenAI_standard_usage_upper_bound_subtotal_usd': str(estimate), 'attempts': details,
            'validated_result_ref': json.loads(task['result_ref_json']) if task['result_ref_json'] else None})
    local = authority.get('local_dispositions', [])
    for disposition in local:
        value = verified_json(journal.root, disposition['artifact_ref'])
        decisions[value['validated']['record']['decision']['status']] += 1
        article_costs.append({'pmid': disposition['pmid'], 'task_id': disposition['task_id'],
            'state': 'local_excluded', 'attempt_count': 0, 'gateway_known_cost_subtotal_usd': '0',
            'gateway_cost_unknown_attempts': 0, 'reference_OpenAI_standard_usage_upper_bound_subtotal_usd': '0',
            'attempts': [], 'validated_result_ref': disposition['artifact_ref'],
            'review_origin': 'local_primary_source_availability'})
    if local:
        states['local_excluded'] = len(local)
    return {'phase_id': journal.phase, 'as_of': now(), 'stage': 'R2', 'model': MODEL, 'reasoning_effort': EFFORT,
        'selected_articles': authority['selected_articles'], 'ready_tasks': len(rows), 'task_states': dict(states),
        'finished_articles': states['complete'] + states['complete_with_issues'] + len(local), 'attempts': total_attempts,
        'new_R2_decisions': dict(decisions),
        'gateway_known_cost_subtotal_usd': str(total_proxy), 'gateway_cost_unknown_attempts': unknown,
        'reference_OpenAI_standard_usage_upper_bound_subtotal_usd': str(total_reference), 'cost_is_invoice': False,
        'direct_OpenAI_completion_requests': 0, 'eligibility_registry_writes': 0,
        'source_or_request_holds': authority['source_or_request_holds'], 'articles': article_costs,
        'legacy_accounting_preserved': _legacy_heads(journal.root) == authority['legacy_heads']}


def _publish_status(journal, value, **runtime):
    directory = owned(journal.root, 'data/current/reextraction/' + journal.phase)
    atomic_json(directory / 'status.json', {**value, **runtime})
    rows = value['articles']; fields = ['pmid', 'state', 'attempt_count', 'gateway_known_cost_subtotal_usd',
        'gateway_cost_unknown_attempts', 'reference_OpenAI_standard_usage_upper_bound_subtotal_usd']
    output = io.StringIO(); writer = csv.DictWriter(output, fieldnames=fields); writer.writeheader()
    for row in rows:
        writer.writerow({key: row[key] for key in fields})
    atomic_bytes(directory / 'cost_by_article.csv', output.getvalue().encode())
    atomic_json(directory / 'cost_by_article.json', {'cost_is_invoice': False, 'articles': rows})


def status(root, plan_ref):
    root = Path(root).resolve(); plan, _ = _plan(root, plan_ref)
    # A read-only status call can run while the sole writer is dispatching.
    journal = PilotJournal.__new__(PilotJournal)
    journal.root = root; journal.phase = plan['phase_id']; journal.db = _readonly(root, DB_PATH)
    journal.db.execute('BEGIN')
    try:
        return _status(journal)
    finally:
        journal.db.close()


def completed_records(root, plan_ref):
    """Return accepted records and exact source context for the separate exporter."""
    root = Path(root).resolve(); plan, _ = _plan(root, plan_ref)
    journal = PilotJournal(root, plan['phase_id'])
    try:
        rows = []
        for task in journal.task_rows():
            if task['state'] not in ('complete', 'complete_with_issues'):
                continue
            value = verified_json(root, json.loads(task['result_ref_json']))
            rows.append({'task_id': task['task_id'], 'source': verified_json(root, value['source_ref']),
                'validation': value['validated'], 'artifact_ref': json.loads(task['result_ref_json'])})
        for disposition in journal.phase_authority().get('local_dispositions', []):
            value = verified_json(root, disposition['artifact_ref'])
            rows.append({'task_id': disposition['task_id'], 'source': verified_json(root, value['source_ref']),
                'validation': value['validated'], 'artifact_ref': disposition['artifact_ref'],
                'review_origin': value['review_origin'], 'source_availability_ref': value['source_availability_ref']})
        return rows
    finally:
        journal.close()


class ObservedLimits:
    """Respect observed request/token windows and reduce concurrency on overload."""
    def __init__(self, workers):
        self.limit = workers; self.requests = None; self.tokens = None; self.reset = 0; self.blocked = 0

    def can_send(self, task, active):
        if time.time() >= self.reset:
            self.requests = self.tokens = None
        bound = len(canonical(task['body'])) + 4096 + task['body']['max_output_tokens']
        return (active < self.limit and time.time() >= self.blocked
            and (self.requests is None or self.requests > 0) and (self.tokens is None or self.tokens >= bound))

    def sent(self, task):
        if self.requests is not None:
            self.requests -= 1
        if self.tokens is not None:
            self.tokens -= len(canonical(task['body'])) + 4096 + task['body']['max_output_tokens']

    def observe(self, result):
        headers = result.get('headers') or {}; reset = 0
        for name, prop in (('requests', 'requests'), ('tokens', 'tokens')):
            try:
                remaining = int(headers['x-ratelimit-remaining-' + name])
                if remaining >= 0:
                    old = getattr(self, prop); setattr(self, prop, min(old, remaining) if old is not None else remaining)
                    reset = max(reset, duration(headers.get('x-ratelimit-reset-' + name, '')) or 60)
            except (KeyError, ValueError, TypeError):
                pass
        if reset:
            self.reset = max(self.reset, time.time() + reset)
        if result.get('http_status') in (429, 503):
            self.limit = max(1, self.limit // 2)
            self.blocked = max(self.blocked, time.time() + retry_delay(headers, 1))


def run(root, plan_ref, *, workers=16, limit=None, pmids=None, transport=None, on_progress=None):
    """Run only the fixed pilot; an interrupted unknown send remains a visible hold."""
    if type(workers) is not int or not 1 <= workers <= 128:
        raise ValueError('Explicit concurrency from 1 to 128 required')
    if limit is not None and (type(limit) is not int or limit < 1):
        raise ValueError('Positive finite task limit required')
    root = Path(root).resolve(); plan, citations = _plan(root, plan_ref)
    if pmids is not None:
        pmids = list(map(str, pmids))
        if not pmids or len(pmids) != len(set(pmids)) or not set(pmids) <= {c['pmid'] for c in citations}:
            raise ValueError('Quality-check subset must belong to the fixed pilot')
    journal = PilotJournal(root, plan['phase_id'])
    futures = {}; sent = 0; stop = None; last_progress = 0
    try:
        authority = journal.phase_authority()
        if not authority or authority['plan_ref'] != plan_ref:
            raise ValueError('Exact prepared finite pilot authority required')
        if workers > authority.get('worker_ceiling', plan.get('max_workers', 32)):
            raise ValueError('Concurrency exceeds the explicitly authorized phase ceiling')
        for ref in authority['producer_files']:
            if reference(root, ref['path']) != ref:
                raise ValueError('Producing code changed after pilot preparation: ' + ref['path'])
        if _legacy_heads(root) != authority['legacy_heads']:
            raise ValueError('Historical accounting advanced after pilot preparation')
        if authority['endpoint'] != _endpoint(root):
            raise ValueError('Cornell route changed')
        transport = transport or CompactGatewayTransport(root=root, expected_endpoint=authority['endpoint'], timeout_seconds=3600)
        journal.recover(); journal.requeue_not_sent(); limiter = ObservedLimits(workers)
        queue = []
        for row in journal.task_rows():
            if row['state'] in ('pending', 'retry_wait') and (pmids is None or row['pmid'] in pmids):
                task = verified_json(root, json.loads(row['task_ref_json']))
                history = journal.attempts(task['task_id'])
                cap = history[-1]['record'].get('next_output_limit', OUTPUT_INITIAL) if history else OUTPUT_INITIAL
                queue.append((task, row['next_retry'] or 0, cap))
        if pmids is not None:
            queue.sort(key=lambda item: pmids.index(item[0]['metadata']['pmid']))
        def gate(task):
            if (root / 'data/current/HOLD').exists() or (root / 'data/current/HOLD').is_symlink():
                return False
            if reference(root, plan_ref['path']) != plan_ref or _endpoint(root) != authority['endpoint']:
                raise ValueError('Pilot authority or fixed route changed before send')
            return True
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix='cornell-quantitative') as executor:
            while queue or futures:
                if (root / 'data/current/HOLD').exists() or (root / 'data/current/HOLD').is_symlink():
                    stop = 'administrative_hold'
                index = 0
                while stop is None and index < len(queue) and len(futures) < workers and (limit is None or sent < limit):
                    task, due, cap = queue[index]
                    actual = deepcopy(task); actual['body']['max_output_tokens'] = cap
                    if time.time() < due or not limiter.can_send(actual, len(futures)):
                        index += 1; continue
                    queue.pop(index); record = journal.reserve(task, cap); sent += 1; limiter.sent(actual)
                    directory = f'data/current/reextraction/{journal.phase}/calls/{record["attempt_id"]}'
                    futures[executor.submit(transport.send, actual, record['attempt_id'], directory, gate=gate)] = (task, record)
                if not futures and (stop or limit is not None and sent >= limit):
                    break
                done, _ = wait(futures, timeout=1, return_when=FIRST_COMPLETED) if futures else (set(), set())
                if not futures:
                    time.sleep(0.2)
                for future in done:
                    task, record = futures.pop(future)
                    try:
                        result = future.result()
                    except Exception as exc:
                        result = {'status': 'worker_error', 'sent': True, 'http_status': None,
                            'error': {'type': 'worker_exception', 'exception_type': type(exc).__name__},
                            'usage': None, 'headers': {}, 'payload': None, 'artifacts': {}}
                    limiter.observe(result); validated = None
                    if result.get('status') == 'completed':
                        try:
                            validated = quantitative.validate(result['payload'], verified_json(root, task['metadata']['source_ref']))
                        except Exception as exc:
                            validated = {'valid': False, 'issues': [], 'global_errors': [type(exc).__name__]}
                    retry_at = None; next_cap = record['output_limit']
                    known = result.get('http_status') is not None
                    incomplete = (result.get('error') or {}).get('type') == 'incomplete_output'
                    malformed = (result.get('error') or {}).get('type') == 'invalid_structured_output'
                    validation_failed = result.get('status') == 'completed' and validated is not None and not validated.get('valid')
                    if known and record['ordinal'] < MAX_ATTEMPTS and (result.get('retryable') or malformed or validation_failed or incomplete and next_cap < OUTPUT_CEILING):
                        retry_at = time.time() + retry_delay(result.get('headers') or {}, record['ordinal'])
                        if incomplete:
                            next_cap = min(OUTPUT_CEILING, next_cap * 2)
                        record['next_output_limit'] = next_cap
                    state = journal.finish(task, record, result, validated, retry_at)
                    if state == 'retry_wait':
                        queue.append((task, retry_at, next_cap))
                    if state == 'held_integrity':
                        stop = 'response_integrity_hold'
                    provider_error = (result.get('response') or {}).get('error') or {}
                    code = str(provider_error.get('code') or provider_error.get('type') or '') if isinstance(provider_error, dict) else ''
                    if result.get('http_status') in (401, 403) or any(word in code.lower() for word in ('quota', 'billing', 'payment', 'invalid_api_key', 'account_deactivated')):
                        stop = 'gateway_account_or_authorization_hold'
                if done or time.time() - last_progress >= 20:
                    value = _status(journal)
                    _publish_status(journal, value, active=len(futures), queued=len(queue), configured_concurrency=workers,
                        effective_concurrency=limiter.limit, stop_reason=stop)
                    if on_progress:
                        on_progress(value)
                    last_progress = time.time()
        value = _status(journal)
        _publish_status(journal, value, active=0, queued=len(queue), configured_concurrency=workers,
            effective_concurrency=limiter.limit, stop_reason=stop or ('request_limit' if limit is not None and sent >= limit else None))
        return value
    finally:
        journal.close()
