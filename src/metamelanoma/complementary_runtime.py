"""Durable, finite Cornell Opus complementary review. No model-price estimates.

Only the coordinator writes the existing gateway journal; HTTP workers write
immutable attempt artifacts. A started request without a complete receipt is a
hold, not permission to send another potentially billable request.
"""
from __future__ import annotations

from collections import Counter
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from email.utils import parsedate_to_datetime
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from .gateway import GatewayTransport, load_settings
from .io import canonical, digest, now, owned, reference, verified_json
from .transport import immutable, send_once

MODEL = 'claude-opus-5-5'
REASONING = 'xhigh'
RUN_ID = 'melanoma-opus-complementary-20261114'
JOURNAL = 'data/current/gateway_accounting.sqlite3'
COHORT_SIZE = 2538
MAX_ATTEMPTS = 3
DEFAULT_OUTPUT_TOKENS = 32768
MAX_OUTPUT_TOKENS = 65536
MAX_RESPONSE_BYTES = 64 * 1024 * 1024
PROVIDER = 'cornell_openai_gateway'
ACCOUNT = 'configured_Cornell_gateway'
SAFE_HEADERS = GatewayTransport.safe_headers | {'anthropic-request-id'}
TRANSIENT_STATUS = {408, 409, 429, 500, 502, 503, 504}


def chat_endpoint(settings):
    """Reuse the credential loader's strict Cornell origin validation."""
    return settings.responses_url.rsplit('/', 1)[0] + '/chat/completions'


def _valid_endpoint(endpoint):
    parsed = urllib.parse.urlsplit(endpoint)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.port not in (None, 443)
            or parsed.path != '/v1/chat/completions'
            or not (parsed.hostname == 'cornell.edu' or parsed.hostname.endswith('.cornell.edu'))):
        raise ValueError('The fixed Cornell HTTPS chat-completions route is required')
    return endpoint


def _safe_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', value):
        raise ValueError('Unsafe complementary run or attempt identifier')
    return value


def _strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('Duplicate JSON key')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))


def _strict_schema(schema):
    if not isinstance(schema, dict) or schema.get('type') != 'object':
        raise ValueError('Object JSON-schema response contract required')
    def visit(value):
        if isinstance(value, dict):
            if value.get('type') == 'object' or 'properties' in value:
                properties = value.get('properties', {})
                if (value.get('additionalProperties') is not False
                        or set(value.get('required', [])) != set(properties)):
                    raise ValueError('Every contract object must be closed and require all properties')
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(schema)


def request_body(packet, *, max_output_tokens=DEFAULT_OUTPUT_TOKENS, builder=None):
    if not 1024 <= max_output_tokens <= MAX_OUTPUT_TOKENS:
        raise ValueError('Reviewed complementary output-token range required')
    if builder is None:
        from .complementary_contract import build_request
        builder = build_request
    contract = builder(packet, max_output_tokens=max_output_tokens)
    _strict_schema(contract['schema'])
    body = {'model': MODEL, 'reasoning_effort': REASONING, 'drop_params': False,
            'max_tokens': max_output_tokens, 'stream': False,
            'messages': [{'role': 'system', 'content': contract['instructions']},
                         {'role': 'user', 'content': contract['input']}],
            'response_format': {'type': 'json_schema', 'json_schema': {
                'name': 'melanoma_complementary_review', 'strict': True, 'schema': contract['schema']}}}
    if any(not isinstance(row['content'], str) or not row['content'] for row in body['messages']):
        raise ValueError('Nonempty source-bound instructions and input required')
    return body


def _check_body(body):
    if (set(body) != {'model', 'reasoning_effort', 'drop_params', 'max_tokens', 'stream', 'messages', 'response_format'}
            or body['model'] != MODEL or body['reasoning_effort'] != REASONING
            or body['drop_params'] is not False or body['stream'] is not False
            or not 1024 <= body['max_tokens'] <= MAX_OUTPUT_TOKENS
            or body['response_format'].get('type') != 'json_schema'
            or body['response_format']['json_schema'].get('strict') is not True):
        raise ValueError('Exact Opus xhigh strict-schema contract required; no downgrade')
    _strict_schema(body['response_format']['json_schema']['schema'])
    return canonical(body)


def _retry_after(headers, *, timestamp=None):
    timestamp = time.time() if timestamp is None else timestamp
    value = headers.get('retry-after-ms')
    try:
        if value is not None:
            seconds = float(value) / 1000
            if 0 <= seconds < float('inf'):
                return seconds
    except (TypeError, ValueError):
        pass
    value = headers.get('retry-after')
    try:
        seconds = float(value)
        if 0 <= seconds < float('inf'):
            return seconds
    except (TypeError, ValueError):
        pass
    try:
        date = parsedate_to_datetime(value)
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        return max(0, date.timestamp() - timestamp)
    except (ValueError, TypeError, OverflowError):
        return None


def cost_metadata(result):
    """Only positive gateway-reported costs; zero/missing is explicitly unknown."""
    value = None
    raw = (result.get('headers') or {}).get('x-litellm-response-cost')
    try:
        amount = Decimal(raw) if isinstance(raw, str) else None
        if amount is not None and amount.is_finite() and amount > 0:
            value = str(amount)
    except InvalidOperation:
        pass
    return {'gateway_reported_cost_usd': value,
            'cost_status': 'gateway_reported' if value is not None else 'unknown',
            'usage': result.get('usage'), 'cost_is_invoice': False,
            'OpenAI_price_estimate_used': False}


class ComplementaryTransport:
    """Exactly one HTTP attempt; no SDK retry, fallback, redirect or tier change."""
    def __init__(self, *, root, expected_endpoint, sender=None,
                 settings_loader=load_settings, timeout_seconds=1200):
        self.root = Path(root).resolve()
        self.endpoint = _valid_endpoint(expected_endpoint)
        self.sender = sender or send_once
        self.settings_loader = settings_loader
        self.timeout_seconds = timeout_seconds

    def send(self, task, attempt_id, artifact_dir):
        wire = _check_body(task['body'])
        _safe_id(attempt_id)
        if _operator_hold(self.root):
            raise DispatchHeld('Operator HOLD before dispatch')
        settings = self.settings_loader(self.root, timeout_seconds=self.timeout_seconds)
        if chat_endpoint(settings) != self.endpoint:
            raise ValueError('Cornell endpoint changed after preparation')
        if settings.api_key.encode() in wire:
            raise ValueError('Credential material in source; dispatch refused')
        directory = owned(self.root, artifact_dir)
        directory.mkdir(parents=True, exist_ok=False)
        refs = {'request': immutable(self.root, directory / 'request.json', canonical({
            'attempt_id': attempt_id, 'pmid': task['pmid'], 'run_id': task['run_id'],
            'provider': PROVIDER, 'account': ACCOUNT, 'endpoint': self.endpoint,
            'body': task['body'], 'packet_ref': task['packet_ref'], 'body_sha256': digest(wire),
            'automatic_retries': 0, 'redirects': False}))}
        started = now()
        if _operator_hold(self.root):
            raise DispatchHeld('Operator HOLD before dispatch')
        refs['sent'] = immutable(self.root, directory / 'sent.json', canonical({
            'attempt_id': attempt_id, 'pmid': task['pmid'], 'started_at': started,
            'endpoint': self.endpoint, 'request_body_sha256': digest(wire),
            'provider_receipt_confirmed': False}))
        request = urllib.request.Request(self.endpoint, data=wire, method='POST', headers={
            'Authorization': 'Bearer ' + settings.api_key, 'Content-Type': 'application/json',
            'Accept': 'application/json'})
        raw, headers, status, error = b'', {}, None, None
        try:
            try:
                response = self.sender(request, timeout=settings.timeout_seconds)
            except urllib.error.HTTPError as exc:
                response = exc
            with response:
                status = response.status if hasattr(response, 'status') else response.code
                if response.geturl() != self.endpoint:
                    raise ValueError('Response redirect refused')
                headers = {str(k).lower(): str(v) for k, v in response.headers.items()
                           if str(k).lower() in SAFE_HEADERS or str(k).lower().startswith('x-ratelimit-')}
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    error = 'response_size_limit'
        except http.client.IncompleteRead as exc:
            raw, error = exc.partial, 'uncertain_incomplete_response'
        except (OSError, TimeoutError, urllib.error.URLError):
            error = 'uncertain_network_send'
        except ValueError:
            error = 'route_integrity_error'
        redacted = settings.api_key.encode() in raw or any(settings.api_key in value for value in headers.values())
        raw = raw.replace(settings.api_key.encode(), b'[REDACTED]')
        headers = {key: value.replace(settings.api_key, '[REDACTED]') for key, value in headers.items()}
        data, payload, effort = {}, None, None
        try:
            data = _strict_json(raw)
            if not isinstance(data, dict):
                raise ValueError('Object response required')
        except (ValueError, UnicodeError):
            data = {}
            error = error or 'invalid_response_json'
        outcome, retryable, fatal = 'held', False, False
        if error is None and status == 200:
            effort = data.get('reasoning_effort', (data.get('reasoning') or {}).get('effort')
                              if isinstance(data.get('reasoning') or {}, dict) else 'invalid')
            if data.get('model') != MODEL:
                error, fatal = 'returned_model_mismatch', True
            elif effort not in (None, REASONING):
                error, fatal = 'returned_reasoning_mismatch', True
            elif data.get('service_tier') not in (None, 'default'):
                error, fatal = 'returned_service_tier_mismatch', True
            else:
                choices = data.get('choices')
                if not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict):
                    error, retryable = 'invalid_structured_output', True
                elif choices[0].get('finish_reason') == 'length':
                    error, retryable = 'output_limit', task['body']['max_tokens'] < MAX_OUTPUT_TOKENS
                elif choices[0].get('finish_reason') != 'stop':
                    error = 'provider_output_hold'
                else:
                    try:
                        payload = _strict_json(choices[0]['message']['content'])
                        if not isinstance(payload, dict):
                            raise ValueError('Object output required')
                        outcome = 'completed'
                    except (ValueError, TypeError, KeyError):
                        error, retryable = 'invalid_structured_output', True
        elif error is None:
            error = 'http_error'
            provider_error = data.get('error') or {}
            detail = json.dumps(provider_error).lower()
            denied = any(word in detail for word in ('quota', 'billing', 'payment', 'permission', 'api_key',
                'unsupported', 'not supported', 'reasoning_effort', 'drop_params', 'response_format',
                'invalid model', 'model not found'))
            fatal = denied or status in {301, 302, 303, 307, 308, 400, 401, 403, 404, 422}
            retryable = status in TRANSIENT_STATUS and not fatal
        elif error == 'invalid_response_json':
            retryable = status in ({200} | TRANSIENT_STATUS)
            fatal = status is not None and not retryable
        elif error in {'route_integrity_error', 'response_size_limit'}:
            fatal = True
        if redacted:
            error, payload, retryable, fatal = 'credential_echo_redacted', None, False, True
        if error is not None:
            outcome = 'held'
        refs['raw_response'] = immutable(self.root, directory / 'response.body', raw)
        result = {'attempt_id': attempt_id, 'run_id': task['run_id'], 'pmid': task['pmid'],
                  'provider': PROVIDER, 'account': ACCOUNT, 'endpoint': self.endpoint,
                  'model': MODEL, 'reasoning_effort': REASONING, 'packet_ref': task['packet_ref'],
                  'reasoning_attestation': 'not_echoed' if effort is None else 'echoed_' + str(effort),
                  'status': outcome, 'sent': True, 'http_status': status, 'started_at': started,
                  'finished_at': now(), 'payload': payload, 'response': data, 'headers': headers,
                  'usage': data.get('usage') if isinstance(data.get('usage'), dict) else None,
                  'error': error, 'retryable': retryable, 'fatal': fatal,
                  'provider_request_id': headers.get('x-request-id') or headers.get('anthropic-request-id') or data.get('id'),
                  'request_body_sha256': digest(wire), 'max_output_tokens': task['body']['max_tokens'],
                  'caller_http_attempts': 1, 'automatic_retries': 0, 'artifacts': dict(refs)}
        result['cost'] = cost_metadata(result)
        refs['result'] = immutable(self.root, directory / 'result.json', canonical(result))
        refs['receipt'] = immutable(self.root, directory / 'receipt.json', canonical({
            key: result[key] for key in ('attempt_id', 'run_id', 'pmid', 'provider', 'account', 'endpoint',
                'model', 'reasoning_effort', 'reasoning_attestation', 'packet_ref', 'started_at', 'finished_at', 'http_status',
                'provider_request_id', 'request_body_sha256', 'usage', 'headers', 'cost', 'sent', 'error',
                'caller_http_attempts', 'automatic_retries')} | {'artifacts': dict(refs)}))
        result['artifacts'] = refs
        return result


class DispatchHeld(RuntimeError):
    pass


def _operator_hold(root):
    path = Path(root) / 'data/current/HOLD'
    return path.exists() or path.is_symlink()


def _producer_snapshots(root, run_id):
    """Pin executed source code without copying any credential configuration."""
    result = []
    for name in ('complementary_runtime.py', 'complementary_sources.py', 'complementary_contract.py',
                 'gateway.py', 'transport.py', 'io.py', 'quantitative.py', 'quantitative_schema.py',
                 'quantitative_sources.py'):
        path = Path(__file__).resolve().parent / name
        if not path.is_file():
            continue
        raw = path.read_bytes()
        relative = f'data/current/complementary/{run_id}/producers/{digest(raw)}/{name}'
        if owned(root, relative).exists():
            ref = reference(root, relative)
            if ref['sha256'] != digest(raw):
                raise ValueError('Producer snapshot changed')
        else:
            ref = immutable(root, relative, raw)
        result.append({'module': name, 'sha256': digest(raw), 'snapshot_ref': ref})
    return result


class Journal:
    """Separate complementary tables in the existing journal, one writer lease."""
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.owner = threading.get_ident()
        path = owned(self.root, JOURNAL)
        if not path.is_file():
            raise ValueError('Existing gateway accounting journal required; no financial reset')
        for suffix in ('', '-wal', '-shm', '-journal'):
            candidate = owned(self.root, str(path) + suffix)
            if candidate.exists() and (not candidate.is_file() or candidate.stat().st_nlink != 1):
                raise ValueError('Owned single-link journal required')
        lease = owned(self.root, 'data/current/accounting.sqlite3.lock')
        self.lease = os.open(lease, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(self.lease)
            raise RuntimeError('Another model coordinator owns the project lease') from None
        try:
            initial = path.stat()
            self.database_identity = (initial.st_dev, initial.st_ino)
            self.db = sqlite3.connect(path, timeout=30)
            self.db.row_factory = sqlite3.Row
            self.db.execute('PRAGMA synchronous=FULL')
            self.db.execute('PRAGMA foreign_keys=ON')
            self.db.executescript('''
                CREATE TABLE IF NOT EXISTS complementary_runs(
                    run_id TEXT PRIMARY KEY, policy TEXT NOT NULL, created_at TEXT NOT NULL,
                    state TEXT NOT NULL, first_pmid TEXT, parallel_approved_at TEXT, fatal TEXT);
                CREATE TABLE IF NOT EXISTS complementary_articles(
                    run_id TEXT NOT NULL, pmid TEXT NOT NULL, ordinal INTEGER NOT NULL,
                    state TEXT NOT NULL, reason TEXT, next_retry REAL NOT NULL DEFAULT 0,
                    packet_ref TEXT, result_ref TEXT, attempts INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(run_id,pmid));
                CREATE TABLE IF NOT EXISTS complementary_attempts(
                    attempt_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, pmid TEXT NOT NULL,
                    ordinal INTEGER NOT NULL, state TEXT NOT NULL, record TEXT NOT NULL,
                    cost_usd TEXT, cost_status TEXT NOT NULL, usage TEXT,
                    UNIQUE(run_id,pmid,ordinal));
                CREATE TABLE IF NOT EXISTS complementary_events(
                    seq INTEGER PRIMARY KEY, previous_hash TEXT NOT NULL,
                    event_hash TEXT NOT NULL, payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS complementary_provider_ids(
                    provider_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL);
            ''')
            self.verify_events()
            self._ensure_current_database()
        except BaseException:
            if hasattr(self, 'db'):
                self.db.close()
            fcntl.flock(self.lease, fcntl.LOCK_UN)
            os.close(self.lease)
            raise

    def check_owner(self):
        if threading.get_ident() != self.owner:
            raise RuntimeError('Only the coordinator may write complementary accounting')


    def _ensure_current_database(self):
        """Reopen an identical atomic replacement while retaining the writer lease.

        OneDrive may replace an idle database inode. SQLite refuses writes to the
        old inode; adopting a changed ledger instead would lose accounting. Both
        histories and all complementary state must agree before reopening.
        """
        self.check_owner()
        path = owned(self.root, JOURNAL)
        for suffix in ('', '-wal', '-shm', '-journal'):
            candidate = owned(self.root, str(path) + suffix)
            if candidate.exists() and (not candidate.is_file() or candidate.stat().st_nlink != 1):
                raise ValueError('Owned single-link journal required')
        current = path.stat(); identity = (current.st_dev, current.st_ino)
        if identity == self.database_identity:
            return
        if self.db.in_transaction:
            raise RuntimeError('Journal inode changed during an open transaction; recovery required')
        def head(db):
            row = db.execute('SELECT seq,event_hash FROM complementary_events ORDER BY seq DESC LIMIT 1').fetchone()
            return tuple(row) if row else (0, '0' * 64)
        def states(db):
            hasher = hashlib.sha256()
            for table, order in (('complementary_runs','run_id'), ('complementary_articles','run_id,pmid'),
                                 ('complementary_attempts','attempt_id'), ('complementary_provider_ids','provider_id')):
                hasher.update(table.encode())
                cursor = db.execute('SELECT * FROM ' + table + ' ORDER BY ' + order)
                hasher.update(canonical([column[0] for column in cursor.description]))
                for row in cursor:
                    hasher.update(canonical(list(row))); hasher.update(b'\n')
            return hasher.digest()
        replacement = sqlite3.connect(path, timeout=30)
        replacement.row_factory = sqlite3.Row
        try:
            replacement.execute('PRAGMA synchronous=FULL')
            replacement.execute('PRAGMA foreign_keys=ON')
            old_head = head(self.db)
            if old_head != head(replacement):
                raise ValueError('Replacement journal event head differs; refusing to resume')
            if [row[0] for row in replacement.execute('PRAGMA quick_check')] != ['ok']:
                raise ValueError('Replacement journal integrity check failed')
            self.verify_events(connection=replacement)
            if states(self.db) != states(replacement):
                raise ValueError('Replacement journal state differs; refusing to resume')
            latest = path.stat()
            if identity != (latest.st_dev, latest.st_ino) or old_head != head(replacement):
                raise ValueError('Journal changed again during replacement verification')
        except BaseException:
            replacement.close()
            raise
        previous = self.db
        self.db = replacement; self.database_identity = identity
        previous.close()

    @contextmanager
    def transaction(self):
        self.check_owner()
        self._ensure_current_database()
        with self.db:
            yield

    def event(self, kind, **fields):
        self.check_owner()
        row = self.db.execute('SELECT event_hash FROM complementary_events ORDER BY seq DESC LIMIT 1').fetchone()
        previous = row[0] if row else '0' * 64
        payload = canonical({'kind': kind, 'at': now(), **fields}).decode()
        hashed = digest((previous + '\n' + payload).encode())
        self.db.execute('INSERT INTO complementary_events(previous_hash,event_hash,payload) VALUES(?,?,?)',
                        (previous, hashed, payload))

    def verify_events(self, connection=None):
        previous = '0' * 64
        connection = self.db if connection is None else connection
        for row in connection.execute('SELECT * FROM complementary_events ORDER BY seq'):
            if row['previous_hash'] != previous or digest((previous + '\n' + row['payload']).encode()) != row['event_hash']:
                raise ValueError('Complementary event-chain integrity check failed')
            previous = row['event_hash']
        return previous

    def close(self):
        self.db.close()
        fcntl.flock(self.lease, fcntl.LOCK_UN)
        os.close(self.lease)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def _run_row(journal, run_id):
    row = journal.db.execute('SELECT * FROM complementary_runs WHERE run_id=?', (run_id,)).fetchone()
    if row is None:
        raise ValueError('Unknown complementary run')
    policy = json.loads(row['policy'])
    verified_json(journal.root, policy['manifest_ref'])
    for producer in policy.get('producer_refs', []):
        saved = producer['snapshot_ref']
        if reference(journal.root, saved['path']) != saved:
            raise ValueError('Frozen producing source snapshot changed')
        current = Path(__file__).resolve().parent / producer['module']
        if digest(current.read_bytes()) != producer['sha256']:
            raise ValueError('Producing code changed since preparation; review before dispatch')
    return dict(row), policy


def prepare(root, manifest_ref, *, run_id=RUN_ID, expected_endpoint=None,
            settings_loader=load_settings, max_output_tokens=DEFAULT_OUTPUT_TOKENS,
            catalog_ref=None):
    """Freeze membership and route, without making any network request."""
    root = Path(root).resolve()
    _safe_id(run_id)
    if isinstance(manifest_ref, (str, Path)):
        manifest_ref = reference(root, manifest_ref)
    manifest = verified_json(root, manifest_ref)
    articles = manifest.get('articles')
    if (not isinstance(articles, list) or len(articles) != COHORT_SIZE
            or len({str(row['pmid']) for row in articles}) != COHORT_SIZE
            or any(not re.fullmatch(r'[0-9]+', str(row['pmid'])) for row in articles)):
        raise ValueError('Exactly 2,538 unique frozen article PMIDs are required')
    if not 1024 <= max_output_tokens <= MAX_OUTPUT_TOKENS:
        raise ValueError('Invalid initial output-token allowance')
    endpoint = _valid_endpoint(expected_endpoint or chat_endpoint(settings_loader(root, timeout_seconds=1200)))
    if catalog_ref is not None:
        catalog = verified_json(root, catalog_ref)
        if MODEL not in catalog.get('models_present', []) or catalog.get('http_status') != 200:
            raise ValueError('Verified current Opus catalog proof required')
    policy = {'run_id': run_id, 'manifest_ref': manifest_ref, 'model': MODEL, 'reasoning_effort': REASONING,
              'endpoint': endpoint, 'max_attempts': MAX_ATTEMPTS, 'initial_output_tokens': max_output_tokens,
              'max_output_tokens': MAX_OUTPUT_TOKENS, 'cohort_size': COHORT_SIZE,
              'additional_spending_cap_usd': None, 'historical_caps_unchanged': True,
              'cost_mode': 'positive_gateway_reported_only_unknown_separate',
              'initial_parallelism': 32, 'maximum_parallelism': 128,
              'producer_refs': _producer_snapshots(root, run_id)}
    if catalog_ref is not None:
        policy['catalog_ref'] = catalog_ref
    with Journal(root) as journal:
        old = journal.db.execute('SELECT policy FROM complementary_runs WHERE run_id=?', (run_id,)).fetchone()
        if old:
            if json.loads(old[0]) != policy:
                raise ValueError('Existing complementary run policy cannot be changed')
        else:
            with journal.transaction():
                journal.db.execute('INSERT INTO complementary_runs(run_id,policy,created_at,state) VALUES(?,?,?,?)',
                                   (run_id, canonical(policy).decode(), now(), 'first_review_required'))
                for ordinal, article in enumerate(articles):
                    ready = article.get('packet_status') == 'ready'
                    reason = article.get('reason') or article.get('hold_reason')
                    journal.db.execute('INSERT INTO complementary_articles(run_id,pmid,ordinal,state,reason) VALUES(?,?,?,?,?)',
                        (run_id, str(article['pmid']), ordinal, 'ready' if ready else 'source_hold',
                         None if ready else json.dumps(reason or 'Verified source unavailable')))
                journal.event('complementary_prepared', run_id=run_id, policy=policy)
    return status(root, run_id)


def approve_parallel(root, run_id=RUN_ID):
    """Explicit operator gate after reviewing the first real article's receipt."""
    with Journal(root) as journal:
        row, _ = _run_row(journal, run_id)
        first = journal.db.execute('SELECT state,result_ref FROM complementary_articles WHERE run_id=? AND pmid=?',
                                   (run_id, row['first_pmid'])).fetchone()
        if row['fatal'] or first is None or first['state'] not in {'completed', 'completed_with_holds'}:
            raise ValueError('A valid first real article must finish before parallel dispatch')
        result = verified_json(journal.root, json.loads(first['result_ref']))
        if not result['validation']['valid']:
            raise ValueError('First source-bound output has not passed validation')
        if not row['parallel_approved_at']:
            with journal.transaction():
                journal.db.execute('UPDATE complementary_runs SET parallel_approved_at=?,state=? WHERE run_id=?',
                                   (now(), 'ready', run_id))
                journal.event('first_real_article_reviewed_parallel_approved', run_id=run_id,
                              pmid=row['first_pmid'], result_ref=json.loads(first['result_ref']))
    return status(root, run_id)



def _replacement_approval(journal, approval_ref, run_id):
    """Validate one finite, source-bound user authorization; never infer consent."""
    approval = verified_json(journal.root, approval_ref)
    if (approval.get('schema_version') != 1
            or approval.get('record_kind') != 'user_approved_uncertain_send_replacements'
            or approval.get('run_id') != run_id or approval.get('authorized_by') != 'user'
            or approval.get('authorization') != 'Approve one replacement per article'
            or approval.get('additional_calls_per_article') != 1
            or approval.get('preserve_unknown_costs') is not True
            or not isinstance(approval.get('articles'), list) or not approval['articles']):
        raise ValueError('Explicit single-replacement approval required')
    grants = {}
    for item in approval['articles']:
        pmid = str(item.get('pmid', ''))
        previous = journal.db.execute(
            'SELECT * FROM complementary_attempts WHERE attempt_id=? AND run_id=? AND pmid=?',
            (item.get('previous_attempt_id'), run_id, pmid)).fetchone()
        article = journal.db.execute('SELECT pmid FROM complementary_articles WHERE run_id=? AND pmid=?',
                                     (run_id, pmid)).fetchone()
        if (not article or not previous or pmid in grants or previous['state'] != 'held_uncertain_send'
                or previous['ordinal'] != item.get('previous_ordinal')
                or item.get('next_ordinal') != previous['ordinal'] + 1
                or digest(previous['record'].encode()) != item.get('previous_record_sha256')):
            raise ValueError('Replacement approval must match one exact uncertain prior attempt')
        record = json.loads(previous['record'])
        if (record.get('packet_ref') != item.get('packet_ref')
                or record.get('result_ref') != item.get('previous_result_ref')):
            raise ValueError('Replacement source or prior result binding differs')
        verified_json(journal.root, item['packet_ref'])
        if item['previous_result_ref']:
            verified_json(journal.root, item['previous_result_ref'])
        grants[pmid] = {**item, 'approval_ref': approval_ref}
    return grants


def _replacement_grants(journal, run_id):
    """Only approvals already bound into the checked journal event chain count."""
    grants = {}
    rows = journal.db.execute(
        "SELECT payload FROM complementary_events WHERE payload LIKE '%user_approved_uncertain_send_replacements%'")
    seen = set()
    for row in rows:
        event = json.loads(row['payload'])
        if event.get('kind') != 'user_approved_uncertain_send_replacements' or event.get('run_id') != run_id:
            continue
        ref = event.get('approval_ref'); key = canonical(ref)
        if key in seen:
            continue
        seen.add(key)
        checked = _replacement_approval(journal, ref, run_id)
        if set(grants) & set(checked):
            raise ValueError('An article already has a single replacement authorization')
        grants.update(checked)
    return grants


def approve_replacements(root, approval_ref, run_id=RUN_ID):
    """Activate a previously recorded explicit approval without changing old costs."""
    with Journal(root) as journal:
        _run_row(journal, run_id)
        grants = _replacement_approval(journal, approval_ref, run_id)
        existing = _replacement_grants(journal, run_id)
        overlap = set(grants) & set(existing)
        if overlap:
            if set(grants) <= set(existing) and all(existing[p]['approval_ref'] == approval_ref for p in grants):
                return {'already_activated': True, 'articles': len(grants), 'approval_ref': approval_ref}
            raise ValueError('Replacement authorization overlaps an earlier grant')
        for pmid, grant in grants.items():
            row = journal.db.execute('SELECT * FROM complementary_articles WHERE run_id=? AND pmid=?',
                                     (run_id, pmid)).fetchone()
            if (row['state'] != 'held_uncertain_send' or row['attempts'] != grant['previous_ordinal']
                    or json.loads(row['packet_ref']) != grant['packet_ref']):
                raise ValueError('Article changed since replacement approval')
        with journal.transaction():
            journal.event('user_approved_uncertain_send_replacements', run_id=run_id,
                          approval_ref=approval_ref, articles=len(grants), old_attempts_and_costs_unchanged=True)
            for pmid in grants:
                journal.db.execute('UPDATE complementary_articles SET state=?,next_retry=0 WHERE run_id=? AND pmid=?',
                                   ('ready', run_id, pmid))
    return {'already_activated': False, 'articles': len(grants), 'approval_ref': approval_ref}


def _replacement_for(journal, grants, candidate, ordinal):
    grant = grants.get(candidate['pmid'])
    if grant:
        existing = journal.db.execute('SELECT attempt_id FROM complementary_attempts WHERE run_id=? AND pmid=? AND ordinal=?',
                                      (candidate['run_id'], candidate['pmid'], ordinal)).fetchone()
        if (ordinal != grant['next_ordinal'] or candidate['attempts'] != grant['previous_ordinal']
                or json.loads(candidate['packet_ref']) != grant['packet_ref'] or existing):
            raise ValueError('The single authorized replacement is consumed or mismatched')
    elif ordinal > MAX_ATTEMPTS:
        raise ValueError('Attempt ceiling violated')
    return grant


def _artifact_base(run_id, pmid, ordinal):
    return f'data/current/complementary/{run_id}/attempts/{pmid}/a{ordinal}'


def _read_result(root, base):
    """Recover only a complete immutable request/response/receipt chain."""
    refs = {key: reference(root, f'{base}/{name}') for key, name in {
        'request': 'request.json', 'sent': 'sent.json', 'raw_response': 'response.body',
        'result': 'result.json', 'receipt': 'receipt.json'}.items()}
    result = verified_json(root, refs['result'])
    result['artifacts'] = refs
    return result


def _verify_result(root, record, result):
    refs = result.get('artifacts') or {}
    if set(refs) != {'request', 'sent', 'raw_response', 'result', 'receipt'}:
        raise ValueError('A complete immutable attempt chain is required')
    values = {key: (verified_json(root, ref) if key != 'raw_response' else None) for key, ref in refs.items()}
    rawref = refs['raw_response']
    raw = owned(root, rawref['path']).read_bytes()
    if digest(raw) != rawref['sha256'] or len(raw) != rawref['bytes']:
        raise ValueError('Immutable raw response changed')
    try:
        raw_value = _strict_json(raw)
        if not isinstance(raw_value, dict):
            raw_value = {}
    except (ValueError, UnicodeError):
        raw_value = {}
    if raw_value != result.get('response'):
        raise ValueError('Parsed response differs from immutable raw response')
    request, saved, receipt, sent = (values[key] for key in ('request', 'result', 'receipt', 'sent'))
    if (request['body_sha256'] != digest(_check_body(request['body']))
            or request['body_sha256'] != record['body_sha256']
            or request['packet_ref'] != record['packet_ref']):
        raise ValueError('Attempt body or source binding changed')
    for key in ('attempt_id', 'pmid', 'run_id', 'endpoint'):
        if request.get(key) != record.get(key) or result.get(key) != record.get(key):
            raise ValueError('Attempt identity changed')
    for key in ('attempt_id', 'pmid', 'endpoint', 'request_body_sha256'):
        if sent.get(key) != result.get(key):
            raise ValueError('Sent proof differs')
    for key, value in saved.items():
        if key != 'artifacts' and result.get(key) != value:
            raise ValueError('Returned result differs from immutable result')
    for key in ('attempt_id', 'run_id', 'pmid', 'endpoint', 'model', 'reasoning_effort',
                'packet_ref', 'request_body_sha256', 'usage', 'headers', 'cost', 'provider_request_id'):
        if receipt.get(key) != result.get(key):
            raise ValueError('Immutable receipt differs')
    if receipt['artifacts'] != {key: refs[key] for key in ('request', 'sent', 'raw_response', 'result')}:
        raise ValueError('Receipt artifact chain differs')
    verified_json(root, record['packet_ref'])
    return result


def _complete(journal, record, result, *, validator, clock):
    _verify_result(journal.root, record, result)
    packet = verified_json(journal.root, record['packet_ref'])
    validation = None
    if result['status'] == 'completed':
        validation = validator(result['payload'], packet)
        if not isinstance(validation, dict) or not isinstance(validation.get('valid'), bool):
            raise ValueError('Response validator returned no validity decision')
    if validation and not validation['valid']:
        result = dict(result, error='invalid_source_bound_output', retryable=True, status='held')
    cost = cost_metadata(result)
    provider_id = result.get('provider_request_id')
    duplicate = journal.db.execute('SELECT attempt_id FROM complementary_provider_ids WHERE provider_id=?',
                                    (provider_id,)).fetchone() if provider_id else None
    if duplicate and duplicate[0] != record['attempt_id']:
        result = dict(result, error='duplicate_provider_request_id', retryable=False, fatal=True, status='held')
        cost = {**cost, 'gateway_reported_cost_usd': None, 'cost_status': 'unknown',
                'duplicate_provider_request_id': provider_id, 'duplicate_of_attempt_id': duplicate[0],
                'reported_cost_excluded_as_duplicate': cost['gateway_reported_cost_usd']}
    if result['status'] == 'completed':
        state = 'completed_with_holds' if validation.get('held_findings') else 'completed'
    elif result.get('retryable') and not record.get('replacement_approval_ref') and record['ordinal'] < MAX_ATTEMPTS:
        state = 'retry_wait'
    elif str(result.get('error', '')).startswith('uncertain_'):
        state = 'held_uncertain_send'
    else:
        state = 'technical_hold'
    delay = _retry_after(result.get('headers', {}), timestamp=clock())
    next_retry = clock() + (delay if delay is not None else min(60, 5 * 2 ** (record['ordinal'] - 1))) if state == 'retry_wait' else 0
    summary = {'run_id': record['run_id'], 'pmid': record['pmid'], 'attempt_id': record['attempt_id'],
               'state': state, 'transport_result_ref': result['artifacts']['result'],
               'receipt_ref': result['artifacts']['receipt'], 'packet_ref': record['packet_ref'],
               'validation': validation, 'error': result.get('error'), 'cost': cost,
               'retryable': result.get('retryable'), 'fatal': result.get('fatal'),
               'next_retry': next_retry, 'max_output_tokens': record['max_output_tokens']}
    summary_path = record['artifact_dir'] + '/review.json'
    if owned(journal.root, summary_path).exists():
        existing = verified_json(journal.root, reference(journal.root, summary_path))
        if {k: v for k, v in existing.items() if k != 'next_retry'} != {k: v for k, v in summary.items() if k != 'next_retry'}:
            raise ValueError('Recovered source validation differs from saved review')
        summary, next_retry = existing, existing['next_retry']
        summary_ref = reference(journal.root, summary_path)
    else:
        summary_ref = immutable(journal.root, summary_path, canonical(summary))
    stored = {**record, 'result_ref': summary_ref, 'transport_refs': result['artifacts'],
              'sent': result['sent'], 'error': result.get('error'), 'cost': cost}
    with journal.transaction():
        journal.db.execute('UPDATE complementary_attempts SET state=?,record=?,cost_usd=?,cost_status=?,usage=? WHERE attempt_id=?',
            (state, canonical(stored).decode(), cost['gateway_reported_cost_usd'], cost['cost_status'],
             canonical(result.get('usage')).decode(), record['attempt_id']))
        journal.db.execute('UPDATE complementary_articles SET state=?,reason=?,next_retry=?,result_ref=? WHERE run_id=? AND pmid=?',
            (state, json.dumps(result.get('error')), next_retry, canonical(summary_ref).decode(), record['run_id'], record['pmid']))
        if provider_id and not duplicate:
            journal.db.execute('INSERT INTO complementary_provider_ids VALUES(?,?)', (provider_id, record['attempt_id']))
        if result.get('fatal'):
            journal.db.execute('UPDATE complementary_runs SET fatal=?,state=? WHERE run_id=?',
                               (result.get('error'), 'technical_hold', record['run_id']))
        journal.event('complementary_attempt_finished', run_id=record['run_id'], pmid=record['pmid'],
                      attempt_id=record['attempt_id'], state=state, record=stored)
    return result


def _hold_attempt(journal, record, reason, *, sent_unknown=True):
    state = 'held_uncertain_send' if sent_unknown else 'technical_hold'
    updated = {**record, 'error': reason, 'sent': None if sent_unknown else False}
    with journal.transaction():
        journal.db.execute('UPDATE complementary_attempts SET state=?,record=?,cost_status=? WHERE attempt_id=?',
                          (state, canonical(updated).decode(), 'unknown' if sent_unknown else 'not_sent', record['attempt_id']))
        journal.db.execute('UPDATE complementary_articles SET state=?,reason=? WHERE run_id=? AND pmid=?',
                          (state, json.dumps(reason), record['run_id'], record['pmid']))
        journal.event('complementary_attempt_held', run_id=record['run_id'], pmid=record['pmid'],
                      attempt_id=record['attempt_id'], reason=reason, possible_send=sent_unknown)


def _recover(journal, run_id, validator, clock):
    rows = journal.db.execute("SELECT record FROM complementary_attempts WHERE run_id=? AND state='running'", (run_id,)).fetchall()
    for row in rows:
        record = json.loads(row['record'])
        try:
            result = _read_result(journal.root, record['artifact_dir'])
            _complete(journal, record, result, validator=validator, clock=clock)
        except (OSError, ValueError, TypeError, KeyError):
            _hold_attempt(journal, record, 'Interrupted attempt lacks a fully verified receipt; do not automatically resend')


class AdaptiveConcurrency:
    def __init__(self, initial=32, maximum=128):
        if not 1 <= initial <= maximum <= 128:
            raise ValueError('Concurrency must be bounded between 1 and 128')
        self.current, self.maximum, self.successes = initial, maximum, 0

    def observe(self, result):
        if result.get('http_status') == 429:
            self.current = max(1, self.current // 2)
            self.successes = 0
            return
        if result.get('status') != 'completed':
            return
        self.successes += 1
        if self.successes < self.current or self.current >= self.maximum:
            return
        headers = result.get('headers', {})
        try:
            requests = float(headers['x-ratelimit-remaining-requests'])
            tokens = float(headers['x-ratelimit-remaining-tokens'])
            usage = result.get('usage') or {}
            used = float(usage.get('total_tokens') or ((usage.get('prompt_tokens') or usage.get('input_tokens') or 0)
                                                     + (usage.get('completion_tokens') or usage.get('output_tokens') or 0)))
            target = min(self.maximum, self.current * 2)
            if requests >= 2 * target and used > 0 and tokens >= 2 * target * used:
                self.current, self.successes = target, 0
        except (KeyError, TypeError, ValueError):
            pass


def run(root, run_id=RUN_ID, *, limit=None, workers=32, max_workers=128, pmids=None,
        sender=None, settings_loader=load_settings, packet_builder=None, contract_builder=None,
        validator=None, timeout_seconds=1200, clock=time.time, sleep=time.sleep, progress=None):
    """Run ready reviews. First invocation is one real article; bulk needs approval.

    `limit` counts distinct articles, not their bounded retries. Injectable HTTP
    and source/contract functions support offline tests without real credentials.
    """
    root = Path(root).resolve()
    if limit is not None and (not isinstance(limit, int) or limit < 1):
        raise ValueError('Positive article limit required')
    if packet_builder is None:
        from .complementary_sources import build_packet
        packet_builder = build_packet
    if validator is None:
        from .complementary_contract import validate
        validator = validate
    limiter = AdaptiveConcurrency(workers, max_workers)
    with Journal(root) as journal:
        row, policy = _run_row(journal, run_id)
        manifest = verified_json(root, policy['manifest_ref'])
        scope = {str(article['pmid']) for article in manifest['articles']}
        selected = None if pmids is None else {str(pmid) for pmid in pmids}
        if selected is not None and (not selected or not selected <= scope):
            raise ValueError('Selected PMIDs must belong to the finite frozen cohort')
        _recover(journal, run_id, validator, clock)
        row, policy = _run_row(journal, run_id)
        if row['fatal']:
            return status(root, run_id)
        if _operator_hold(root):
            with journal.transaction():
                journal.db.execute('UPDATE complementary_runs SET state=? WHERE run_id=?', ('operator_hold', run_id))
                journal.event('complementary_operator_hold', run_id=run_id)
            return status(root, run_id)
        with journal.transaction():
            journal.db.execute("UPDATE complementary_articles SET state='ready' WHERE run_id=? AND state='operator_hold'", (run_id,))
        serial = not row['parallel_approved_at']
        if serial:
            limit, limiter.current, limiter.maximum = 1, 1, 1
            if row['first_pmid']:
                first = journal.db.execute('SELECT state FROM complementary_articles WHERE run_id=? AND pmid=?',
                                           (run_id, row['first_pmid'])).fetchone()
                if first['state'] not in {'ready', 'retry_wait'}:
                    return status(root, run_id)
        transport = ComplementaryTransport(root=root, expected_endpoint=policy['endpoint'], sender=sender,
                                          settings_loader=settings_loader, timeout_seconds=timeout_seconds)
        replacement_grants = _replacement_grants(journal, run_id)
        admitted, futures, pause_until = set(), {}, 0.0
        with journal.transaction():
            journal.db.execute('UPDATE complementary_runs SET state=? WHERE run_id=?', ('running', run_id))
            journal.event('complementary_runner_started', run_id=run_id, limit=limit,
                          parallelism=limiter.current, maximum_parallelism=limiter.maximum)
        with ThreadPoolExecutor(max_workers=limiter.maximum, thread_name_prefix='opus-complementary') as executor:
            while True:
                fatal = journal.db.execute('SELECT fatal FROM complementary_runs WHERE run_id=?', (run_id,)).fetchone()[0]
                operator_hold = _operator_hold(root)
                candidates = journal.db.execute("SELECT * FROM complementary_articles WHERE run_id=? AND state IN ('ready','retry_wait') ORDER BY ordinal",
                                               (run_id,)).fetchall()
                pending = [candidate for candidate in candidates if
                           (candidate['pmid'] in admitted or limit is None or len(admitted) < limit)
                           and (selected is None or candidate['pmid'] in selected)
                           and (not serial or not row['first_pmid'] or candidate['pmid'] == row['first_pmid'])]
                for candidate in pending:
                    if fatal or operator_hold or len(futures) >= limiter.current or clock() < pause_until:
                        break
                    pmid = candidate['pmid']
                    if candidate['next_retry'] > clock():
                        continue
                    if pmid not in admitted and limit is not None and len(admitted) >= limit:
                        continue
                    admitted.add(pmid)
                    try:
                        if candidate['packet_ref']:
                            packet_ref = json.loads(candidate['packet_ref'])
                            packet = verified_json(root, packet_ref)
                        else:
                            packet = packet_builder(root, manifest, pmid)
                            if str(packet.get('source', {}).get('pmid')) != pmid:
                                raise ValueError('Source packet PMID differs from frozen membership')
                            packet_ref = immutable(root, f'data/current/complementary/{run_id}/packets/{pmid}.json', canonical(packet))
                        output_tokens = policy['initial_output_tokens']
                        if candidate['result_ref']:
                            prior = verified_json(root, json.loads(candidate['result_ref']))
                            output_tokens = prior['max_output_tokens']
                            if prior.get('error') == 'output_limit':
                                output_tokens = min(policy['max_output_tokens'], output_tokens * 2)
                        body = request_body(packet, max_output_tokens=output_tokens, builder=contract_builder)
                    except (OSError, ValueError, TypeError, KeyError) as exc:
                        with journal.transaction():
                            journal.db.execute('UPDATE complementary_articles SET state=?,reason=? WHERE run_id=? AND pmid=?',
                                ('source_hold', json.dumps({'type': type(exc).__name__, 'reason': str(exc)}), run_id, pmid))
                            journal.event('complementary_source_hold', run_id=run_id, pmid=pmid, reason=str(exc))
                        continue
                    ordinal = candidate['attempts'] + 1
                    replacement = _replacement_for(journal, replacement_grants, candidate, ordinal)
                    attempt_id = f'{run_id}-{pmid}-a{ordinal}'
                    artifact_dir = _artifact_base(run_id, pmid, ordinal)
                    record = {'run_id': run_id, 'pmid': pmid, 'attempt_id': attempt_id, 'ordinal': ordinal,
                              'packet_ref': packet_ref, 'body_sha256': digest(canonical(body)),
                              'endpoint': policy['endpoint'], 'max_output_tokens': output_tokens,
                              'artifact_dir': artifact_dir, 'reserved_at': now()}
                    if replacement:
                        record.update(replacement_approval_ref=replacement['approval_ref'],
                                      replaces_attempt_id=replacement['previous_attempt_id'],
                                      automatic_replacement_retries=0)
                    with journal.transaction():
                        journal.db.execute('INSERT INTO complementary_attempts(attempt_id,run_id,pmid,ordinal,state,record,cost_status) VALUES(?,?,?,?,?,?,?)',
                            (attempt_id, run_id, pmid, ordinal, 'running', canonical(record).decode(), 'unknown'))
                        journal.db.execute('UPDATE complementary_articles SET state=?,packet_ref=?,attempts=? WHERE run_id=? AND pmid=?',
                            ('running', canonical(packet_ref).decode(), ordinal, run_id, pmid))
                        if serial and not row['first_pmid']:
                            row['first_pmid'] = pmid
                            journal.db.execute('UPDATE complementary_runs SET first_pmid=? WHERE run_id=?', (pmid, run_id))
                        journal.event('complementary_attempt_reserved', **record)
                    task = {'run_id': run_id, 'pmid': pmid, 'packet_ref': packet_ref, 'body': body}
                    futures[executor.submit(transport.send, task, attempt_id, artifact_dir)] = record
                if futures:
                    done, _ = wait(futures, timeout=1, return_when=FIRST_COMPLETED)
                    for future in done:
                        record = futures.pop(future)
                        try:
                            result = future.result()
                            result = _complete(journal, record, result, validator=validator, clock=clock)
                        except DispatchHeld:
                            _hold_attempt(journal, record, 'Operator HOLD before HTTP dispatch', sent_unknown=False)
                            with journal.transaction():
                                journal.db.execute('UPDATE complementary_articles SET state=? WHERE run_id=? AND pmid=?',
                                                   ('operator_hold', run_id, record['pmid']))
                            continue
                        except Exception as exc:
                            sent_path = owned(root, record['artifact_dir'] + '/sent.json')
                            _hold_attempt(journal, record, 'Attempt requires technical review: ' + type(exc).__name__,
                                          sent_unknown=sent_path.exists())
                            with journal.transaction():
                                journal.db.execute('UPDATE complementary_runs SET fatal=? WHERE run_id=?',
                                    ('local_runtime_failure', run_id))
                                journal.event('complementary_runtime_stopped', run_id=run_id, exception_type=type(exc).__name__)
                            continue
                        old_parallelism = limiter.current
                        limiter.observe(result)
                        if result.get('http_status') == 429:
                            delay = _retry_after(result.get('headers', {}), timestamp=clock())
                            pause_until = max(pause_until, clock() + (5 if delay is None else delay))
                        if old_parallelism != limiter.current:
                            with journal.transaction():
                                journal.event('complementary_parallelism_changed', run_id=run_id,
                                    previous=old_parallelism, current=limiter.current, reason='observed_gateway_rate_limits')
                        if progress:
                            progress(status(root, run_id, include_articles=False))
                    continue
                if fatal or operator_hold or not pending:
                    break
                waiting = [candidate['next_retry'] for candidate in pending]
                sleep(max(0.01, min(1, max(min(waiting) if waiting else clock(), pause_until) - clock())))
        with journal.transaction():
            remaining = journal.db.execute("SELECT COUNT(*) FROM complementary_articles WHERE run_id=? AND state IN ('ready','retry_wait','running')", (run_id,)).fetchone()[0]
            fatal = journal.db.execute('SELECT fatal FROM complementary_runs WHERE run_id=?', (run_id,)).fetchone()[0]
            final_state = ('technical_hold' if fatal else 'operator_hold' if _operator_hold(root)
                           else 'awaiting_first_review' if serial else 'ready' if remaining else 'finished')
            journal.db.execute('UPDATE complementary_runs SET state=? WHERE run_id=?', (final_state, run_id))
            journal.event('complementary_runner_stopped', run_id=run_id, state=final_state,
                          articles_attempted_this_invocation=len(admitted))
    return status(root, run_id)


def status(root, run_id=RUN_ID, *, include_articles=True):
    """Read-only status and export references; no credential load or network."""
    root = Path(root).resolve()
    path = owned(root, JOURNAL)
    connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute('PRAGMA query_only=ON')
        connection.execute('BEGIN')
        row = connection.execute('SELECT * FROM complementary_runs WHERE run_id=?', (run_id,)).fetchone()
        if row is None:
            raise ValueError('Unknown complementary run')
        articles = connection.execute('SELECT * FROM complementary_articles WHERE run_id=? ORDER BY ordinal', (run_id,)).fetchall()
        attempts = connection.execute('SELECT * FROM complementary_attempts WHERE run_id=? ORDER BY pmid,ordinal', (run_id,)).fetchall()
        known = sum((Decimal(item['cost_usd']) for item in attempts if item['cost_usd'] is not None), Decimal(0))
        result = {'run_id': run_id, 'state': row['state'], 'policy': json.loads(row['policy']),
                  'first_pmid': row['first_pmid'], 'parallel_approved_at': row['parallel_approved_at'],
                  'fatal': row['fatal'], 'article_counts': dict(Counter(item['state'] for item in articles)),
                  'attempt_counts': dict(Counter(item['state'] for item in attempts)),
                  'gateway_reported_cost_usd': str(known),
                  'unknown_cost_attempts': sum(item['cost_status'] == 'unknown' for item in attempts),
                  'cost_is_invoice': False, 'historical_caps_unchanged': True}
        if include_articles:
            result['articles'] = [{key: (json.loads(item[key]) if item[key] and key in {'packet_ref', 'result_ref', 'reason'} else item[key])
                                   for key in item.keys()} for item in articles]
            by_pmid = {}
            for attempt in attempts:
                by_pmid.setdefault(attempt['pmid'], []).append({
                    'attempt_id': attempt['attempt_id'], 'ordinal': attempt['ordinal'],
                    'state': attempt['state'], 'cost_usd': attempt['cost_usd'],
                    'cost_status': attempt['cost_status'],
                    'usage': json.loads(attempt['usage']) if attempt['usage'] else None,
                    'record': json.loads(attempt['record'])})
            for article in result['articles']:
                article['attempt_records'] = by_pmid.get(article['pmid'], [])
        return result
    finally:
        connection.close()


def iter_results(root, run_id=RUN_ID):
    """Read-only export of article/packet/validation refs and attempt accounting."""
    yield from status(root, run_id)['articles']
