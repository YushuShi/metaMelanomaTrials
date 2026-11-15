"""One-owner, resumable accounting for the active direct OpenAI workflow.

The old account is carried in as an immutable liability, including its holds.
All money is integer nanodollars; reservations are conservative, not invoices.
No historical runtime or ledger is imported or modified.
"""
from __future__ import annotations

from contextlib import contextmanager
from decimal import Decimal, ROUND_CEILING
import hashlib
import fcntl
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
from datetime import datetime, timezone

SCALE = 1_000_000_000
MODELS = {'R2': 'gpt-6.1-sol', 'R3': 'gpt-6-luna'}
PRICING = {
    'gpt-6.1-sol': {'input': '2', 'output': '10', 'cached': '.10', 'write_30m': '2.50'},
    'gpt-6-luna': {'input': '.10', 'output': '.50', 'cached': '.01', 'write_30m': '.125'},
}
FLEX_PRICING = {
    'gpt-6.1-sol': {'input': '1', 'output': '5', 'cached': '.05', 'write_30m': '1.25'},
    'gpt-6-luna': {'input': '.05', 'output': '.25', 'cached': '.005', 'write_30m': '.0625'},
}
FLEX_PRICING_REF = {'path': 'data/proposed_changes/canonical_runtime_consolidation/flex_pricing_facts.json',
    'sha256': '3882e5e7fd96257ad7650897213f3f653b14f5d169997f6829bb4b9bca8036b5', 'bytes': 831}
BASELINE_USD = '144.959774'
ALLOWANCE_USD = '100'
TOTAL_CAP_USD = '244.959774'
MAX_WIRE_BYTES = 120_000
JOURNAL_PATH = 'data/current/accounting.sqlite3'
PHASE_ID = 'melanoma-expansion-3596'


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def units(value):
    amount = Decimal(str(value))
    if not amount.is_finite() or amount < 0:
        raise ValueError('Finite nonnegative monetary amount required')
    return int((amount * SCALE).to_integral_value(rounding=ROUND_CEILING))


def usd(value):
    return format(Decimal(value) / SCALE, '.9f')


def owned(root, path, *, exists=False, directory=False):
    """Reject every alias before opening, including dangling leaf aliases."""
    root = Path(root).resolve()
    candidate = Path(path)
    candidate = candidate if candidate.is_absolute() else root / candidate
    if '..' in candidate.parts or not candidate.is_relative_to(root):
        raise ValueError('Path must remain inside the project')
    cursor = root
    for part in candidate.relative_to(root).parts:
        cursor /= part
        if cursor.is_symlink():
            raise ValueError('Aliased project paths are not allowed')
    if candidate.resolve() != candidate:
        raise ValueError('Noncanonical project path')
    if exists and not (candidate.is_dir() if directory else candidate.is_file()):
        raise ValueError('Owned regular project input required')
    return candidate


def checked_ref(root, ref):
    if (not isinstance(ref, dict) or not {'path', 'sha256'} <= ref.keys()
            or ref.keys() - {'path', 'sha256', 'bytes'}
            or not re.fullmatch('[0-9a-f]{64}', str(ref['sha256']))):
        raise ValueError('Invalid immutable input reference')
    path = owned(root, ref['path'], exists=True)
    if any(part.startswith('.') or Path(part).suffix.lower() in {'.env', '.key', '.pem'}
           for part in path.relative_to(Path(root).resolve()).parts):
        raise ValueError('Secret files are not evidence inputs')
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != ref['sha256']:
        raise ValueError('Immutable input hash changed')
    if 'bytes' in ref and (type(ref['bytes']) is not int or ref['bytes'] != len(raw)):
        raise ValueError('Immutable input length changed')
    return raw


def reviewed_output_ceiling(task):
    metadata=task.get('metadata')or{};recovery=metadata.get('finite_recovery')
    if recovery is None:return 32768
    if (task.get('stage')!='R3' or metadata.get('provider')!='cornell_openai_gateway'
            or metadata.get('phase_id')!=PHASE_ID or not isinstance(recovery,dict)
            or set(recovery)!={'kind','parent_body_sha256'}
            or recovery['kind']not in {'output_cap_only','eligibility_repair','user_approved_unknown_retry'}
            or not re.fullmatch('[0-9a-f]{64}',str(recovery['parent_body_sha256']))):
        raise ValueError('Exact typed Cornell R3 finite recovery metadata required')
    return 65536 if recovery['kind']in {'output_cap_only','user_approved_unknown_retry'} else 32768


def reviewed_wire_ceiling(task):
    metadata = task.get('metadata') or {}
    ceiling = metadata.get('wire_ceiling_bytes', MAX_WIRE_BYTES)
    repair = metadata.get('enum_repair')
    if metadata.get('finite_recovery')is not None:
        reviewed_output_ceiling(task)
        if type(ceiling)is not int or ceiling not in {120000,140000}:raise ValueError('Finite recovery wire bound changed')
        return ceiling
    if ceiling == MAX_WIRE_BYTES and repair is None:
        return MAX_WIRE_BYTES
    if (type(ceiling) is not int or ceiling not in {120000, 140000}
            or task.get('stage') != 'R3' or metadata.get('provider') != 'cornell_openai_gateway'
            or metadata.get('phase_id') != PHASE_ID or not isinstance(repair, dict)
            or set(repair) != {'kind', 'old_body_sha256'}
            or repair['kind'] != 'current_sent_catalog_span_enum_only'
            or not re.fullmatch('[0-9a-f]{64}', str(repair['old_body_sha256']))):
        raise ValueError('Only typed Cornell R3 catalog-enum repairs may use the repair wire bound')
    return ceiling


def validate_task(task, *, wire_ceiling_bytes=MAX_WIRE_BYTES, output_ceiling=32768):
    if type(output_ceiling)is not int or output_ceiling not in {32768,65536} or output_ceiling==65536 and reviewed_output_ceiling(task)!=65536:
        raise ValueError('Only typed Cornell finite output recovery permits64k')
    if type(wire_ceiling_bytes) is not int or wire_ceiling_bytes not in {120000, 140000}:
        raise ValueError('Explicit reviewed wire bound required')
    if wire_ceiling_bytes != MAX_WIRE_BYTES and reviewed_wire_ceiling(task) != wire_ceiling_bytes:
        raise ValueError('Repair wire bound lacks its typed Cornell metadata')
    if not isinstance(task, dict) or not re.fullmatch('[A-Za-z0-9_.-]{1,128}', str(task.get('task_id', ''))):
        raise ValueError('Stable safe task_id required')
    body = task.get('body')
    if task.get('stage') not in MODELS or task.get('model') != MODELS[task['stage']]:
        raise ValueError('Only high Sol R2 and high Luna R3 are active routes')
    if not isinstance(body, dict) or body.get('model') != task['model']:
        raise ValueError('Task and native request model differ')
    allowed = {'model', 'instructions', 'input', 'text', 'reasoning', 'max_output_tokens',
               'service_tier', 'store', 'stream', 'background', 'tools', 'prompt_cache_options', 'prompt_cache_key'}
    if set(body) - allowed or body.get('reasoning') != {'effort': 'high'}:
        raise ValueError('Unreviewed native request options')
    if (body.get('store') is not False or body.get('service_tier') not in {'default', 'flex'}
            or body.get('stream', False) is not False or body.get('background', False) is not False
            or body.get('tools', []) != [] or body.get('prompt_cache_options') != {'ttl': '30m'}):
        raise ValueError('Synchronous explicit default/Flex, tool-free, 30m-cache requests required')
    if not all(isinstance(body.get(k), str) and body[k] for k in ('instructions', 'input')):
        raise ValueError('Instructions and immutable source input strings required')
    fmt = (body.get('text') or {}).get('format', {})
    if (fmt.get('type') != 'json_schema' or fmt.get('strict') is not True
            or not isinstance(fmt.get('schema'), dict) or fmt['schema'].get('additionalProperties') is not False):
        raise ValueError('Closed strict native JSON schema required')
    cap = body.get('max_output_tokens')
    if type(cap) is not int or not 1 <= cap <= output_ceiling:
        raise ValueError('Output limit must be an integer between 1 and 32768')
    ceiling = task.get('metadata', {}).get('max_output_tokens_ceiling')
    if ceiling is not None and (type(ceiling) is not int or not cap <= ceiling <= output_ceiling):
        raise ValueError('Explicit output retry ceiling must bound the initial request')
    wire = canonical(body)
    if len(wire) > wire_ceiling_bytes:
        raise ValueError('Request exceeds the reviewed wire limit; split source explicitly')
    canonical(task.get('metadata', {}))
    return wire


def quote(task):
    wire = validate_task(task, wire_ceiling_bytes=reviewed_wire_ceiling(task),output_ceiling=reviewed_output_ceiling(task))
    # UTF-8 bytes plus framing is a deliberately conservative tokenizer bound.
    input_upper = len(wire) + 4096
    rates = PRICING[task['model']]
    amount = (Decimal(input_upper) * max(Decimal(rates['input']), Decimal(rates['write_30m']))
              + Decimal(task['body']['max_output_tokens']) * Decimal(rates['output'])) / 1_000_000
    return {'liability_units': units(amount), 'liability_usd': usd(units(amount)),
            'input_token_upper_bound': input_upper, 'output_token_upper_bound': task['body']['max_output_tokens'],
            'wire_bytes': len(wire), 'body_sha256': hashlib.sha256(wire).hexdigest(),
            'pricing': rates, 'liability_kind': 'conservative_reservation_not_invoice'}


def usage_cost(model, usage, *, service_tier='default'):
    if service_tier not in {'default', 'flex'}:
        raise ValueError('No automatic or unreviewed settlement service tier')
    if not isinstance(usage, dict):
        return None
    i, o = usage.get('input_tokens'), usage.get('output_tokens')
    if type(i) is not int or type(o) is not int or i < 0 or o < 0:
        return None
    details = usage.get('input_tokens_details', {})
    if not isinstance(details, dict):
        return None
    cached = details.get('cached_tokens', 0)
    writes = details.get('cache_write_tokens')
    if type(cached) is not int or not 0 <= cached <= i:
        return None
    rates = {k: Decimal(v) for k, v in PRICING[model].items()}
    if writes is None:
        # Without a complete cache-write breakdown, charge every remaining
        # input token at the higher possible reviewed input price.
        input_cost = cached * rates['cached'] + (i - cached) * max(rates['input'], rates['write_30m'])
    else:
        if type(writes) is not int or not 0 <= writes <= i - cached:
            return None
        ttl = details.get('cache_write_tokens_details', {})
        if not isinstance(ttl, dict) or ttl.get('ttl_12h_tokens', 0) != 0:
            return None  # An unreviewed cache lifetime cannot lower a liability.
        input_cost = cached * rates['cached'] + writes * rates['write_30m'] + (i - cached - writes) * rates['input']
    multiplier = Decimal('.5') if service_tier == 'flex' else Decimal(1)
    return units((input_cost + o * rates['output']) * multiplier / 1_000_000)


def zero_reported_usage(usage):
    """An absent usage or a recognized, explicitly all-zero token object."""
    if usage is None:return True
    if not isinstance(usage, dict) or not usage:return False
    scalar = {'input_tokens', 'output_tokens', 'total_tokens'}
    details = {
        'input_tokens_details': {'cached_tokens', 'cache_write_tokens', 'cache_write_tokens_details'},
        'output_tokens_details': {'reasoning_tokens'},
    }
    if set(usage) - scalar - set(details) or not (set(usage) & scalar):return False
    for key, value in usage.items():
        if key in scalar:
            if type(value) is not int or value != 0:return False
        else:
            if not isinstance(value, dict) or set(value) - details[key]:return False
            for name, count in value.items():
                if name == 'cache_write_tokens_details':
                    if (not isinstance(count, dict) or set(count) - {'ttl_30m_tokens', 'ttl_12h_tokens'}
                            or any(type(v) is not int or v != 0 for v in count.values())):return False
                elif type(count) is not int or count != 0:return False
    return True


def settlement_pricing(record, result, *, capacity_alias=True):
    """Discount only verified Flex; reserve remains the Standard upper bound."""
    requested = record.get('requested_service_tier', 'default')
    response = result.get('response') or {}
    returned = response.get('service_tier')
    usage = result.get('usage')
    verified = requested == 'flex' and returned == 'flex' and response.get('model') == record['model']
    bounds = (isinstance(usage, dict) and type(usage.get('input_tokens')) is int
        and type(usage.get('output_tokens')) is int
        and 0 <= usage['input_tokens'] <= record['quote']['input_token_upper_bound']
        and 0 <= usage['output_tokens'] <= record['quote']['output_token_upper_bound'])
    native_error = response.get('error') or {}
    resource_zero = (requested == 'flex' and result.get('sent') is True and result.get('http_status') == 429
        and returned in (None, 'flex') and response.get('model') in (None, record['model'])
        and isinstance(native_error, dict) and (native_error.get('code') == 'resource_unavailable'
            or capacity_alias and native_error.get('code') == 'flex_unavailable'
                and native_error.get('type') == 'resource_unavailable')
        and (result.get('error') or {}).get('type') == 'http_error'
        and zero_reported_usage(response.get('usage')) and zero_reported_usage(usage))
    tier = 'flex' if verified and bounds else 'default'
    cost = usage_cost(record['model'], usage, service_tier=tier) if requested == 'default' or verified and bounds else None
    return {'requested_service_tier': requested, 'returned_service_tier': returned,
            'reservation_service_tier': 'default_conservative_bound',
            'verified_flex_usage': verified and bounds, 'resource_unavailable_uncharged': resource_zero,
            'usage_rate_multiplier': '0.5' if tier == 'flex' else '1',
            'usage_liability_units': cost,
            'usage_rates_per_million': FLEX_PRICING[record['model']] if tier == 'flex' else PRICING[record['model']],
            'pricing_proof': record.get('flex_pricing_proof'), 'automatic_standard_fallback': False}


class BudgetBlocked(RuntimeError):
    def __init__(self, message, *, code='held'):
        super().__init__(message)
        self.code = code


class Journal:
    """One connection and one writing thread; workers never receive this object."""
    def __init__(self, path, *, root, phase_id, baseline, allowance_usd=ALLOWANCE_USD, total_cap_usd=TOTAL_CAP_USD):
        self.root = Path(root).resolve()
        self.path = owned(self.root, path)
        if self.path != self.root / JOURNAL_PATH or phase_id != PHASE_ID:
            raise ValueError('Only the canonical account path and authorized expansion phase are allowed')
        self.owner = threading.get_ident()
        self.marker = owned(self.root, self.path.parent / 'accounting.carry_forward.json')
        self.marker_sha256 = None
        existing = self.path.exists()
        if existing != self.marker.exists():
            raise ValueError('Journal/carry-forward marker mismatch; refuse an implicit account reset')
        self.baseline = json.loads(canonical(baseline))
        if (units(baseline.get('amount_usd', -1)) != units(BASELINE_USD)
                or not baseline.get('proof_refs') or not baseline.get('held_rows_ref')):
            raise ValueError('Exact historical baseline and preserved hold proofs required')
        for ref in [*baseline['proof_refs'], baseline['held_rows_ref']]:
            checked_ref(self.root, ref)
        self.historical_provider_ids = {}
        if baseline.get('provider_identifiers_ref'):
            prior = json.loads(checked_ref(self.root, baseline['provider_identifiers_ref']))
            if prior.get('record_kind') != 'frozen_historical_native_provider_identifiers' or not isinstance(prior.get('identifiers'), list):
                raise ValueError('Invalid frozen historical provider identity proof')
            for item in prior['identifiers']:
                if (item.get('kind') not in {'request', 'response'} or not isinstance(item.get('value'), str)
                        or not item['value'].strip() or not isinstance(item.get('original_call_ids'), list)
                        or not item['original_call_ids'] or any(not isinstance(i, str) or not i for i in item['original_call_ids'])):
                    raise ValueError('Invalid historical provider identity')
                key = (item['kind'], item['value'])
                if key in self.historical_provider_ids:
                    raise ValueError('Repeated historical provider identity row')
                self.historical_provider_ids[key] = 'historical:' + item['original_call_ids'][0]
        if units(allowance_usd) != units(ALLOWANCE_USD) or units(total_cap_usd) != units(TOTAL_CAP_USD):
            raise ValueError('This phase is authorized for exactly $100 additional')
        self.policy = {'phase_id': phase_id, 'baseline': self.baseline,
                       'allowance_units': units(allowance_usd), 'total_cap_units': units(total_cap_usd),
                       'pricing': PRICING, 'accounting_version': 'canonical-direct-openai'}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        owned(self.root, self.path)
        for suffix in ('-wal', '-shm', '-journal'):
            owned(self.root, str(self.path) + suffix)
        lease_path = owned(self.root, str(self.path) + '.lock')
        self.lease = os.open(lease_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(self.lease)
            raise RuntimeError('Another accounting coordinator owns this journal') from None
        self.db = sqlite3.connect(str(self.path), timeout=30)
        self.file_identity = (self.path.stat().st_dev, self.path.stat().st_ino)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS tasks(task_id TEXT PRIMARY KEY, identity TEXT NOT NULL, state TEXT NOT NULL,
                result TEXT, callback TEXT, next_retry REAL);
            CREATE TABLE IF NOT EXISTS attempts(attempt_id TEXT PRIMARY KEY, task_id TEXT NOT NULL,
                ordinal INTEGER NOT NULL, state TEXT NOT NULL, liability INTEGER NOT NULL,
                reservation INTEGER NOT NULL, record TEXT NOT NULL, UNIQUE(task_id,ordinal));
            CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY, previous_hash TEXT NOT NULL,
                event_hash TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS provider_identifiers(kind TEXT NOT NULL,value TEXT NOT NULL,
                attempt_id TEXT NOT NULL,PRIMARY KEY(kind,value));
        ''')
        found = self.db.execute("SELECT value FROM metadata WHERE key='policy'").fetchone()
        if found is None:
            if existing:
                self.db.close();fcntl.flock(self.lease, fcntl.LOCK_UN);os.close(self.lease)
                raise ValueError('Existing journal lost its policy; refuse reinitialization')
            with self.transaction():
                self.db.execute('INSERT INTO metadata VALUES(?,?)', ('policy', canonical(self.policy).decode()))
                self.db.executemany('INSERT INTO provider_identifiers VALUES(?,?,?)',
                    [(kind, value, origin) for (kind, value), origin in self.historical_provider_ids.items()])
                self._event({'kind': 'carry_forward', 'policy': self.policy})
            marker = canonical({'journal': JOURNAL_PATH, 'phase_id': PHASE_ID, 'policy_sha256': digest(self.policy),
                                'opening_event_hash': self.db.execute('SELECT event_hash FROM events WHERE seq=1').fetchone()[0]})
            owned(self.root, self.marker)
            fd = os.open(self.marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as handle:
                handle.write(marker);handle.flush();os.fsync(handle.fileno())
        elif json.loads(found[0]) != self.policy:
            self.db.close()
            fcntl.flock(self.lease, fcntl.LOCK_UN)
            os.close(self.lease)
            raise ValueError('Existing phase policy/baseline/pricing differs; no budget reset')
        self.marker_sha256 = hashlib.sha256(self.marker.read_bytes()).hexdigest()
        try:
            self.verify()
        except BaseException:
            self.db.close()
            fcntl.flock(self.lease, fcntl.LOCK_UN)
            os.close(self.lease)
            raise

    def _owner(self):
        if threading.get_ident() != self.owner:
            raise RuntimeError('Only the coordinator may write or read the accounting connection')
        owned(self.root, self.path, exists=True)
        if hasattr(self, 'file_identity') and (self.path.stat().st_dev, self.path.stat().st_ino) != self.file_identity:
            raise ValueError('Open journal identity changed')
        if self.marker_sha256 is not None:
            owned(self.root, self.marker, exists=True)
            if hashlib.sha256(self.marker.read_bytes()).hexdigest() != self.marker_sha256:
                raise ValueError('Carry-forward marker changed during execution')

    @contextmanager
    def transaction(self):
        self._owner()
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise

    def _event(self, payload):
        row = self.db.execute('SELECT seq,event_hash FROM events ORDER BY seq DESC LIMIT 1').fetchone()
        previous = row['event_hash'] if row else '0' * 64
        seq = row['seq'] + 1 if row else 1
        item = {'seq': seq, 'previous_hash': previous, 'timestamp': now(), **payload}
        raw = canonical(item).decode()
        value = hashlib.sha256(raw.encode()).hexdigest()
        self.db.execute('INSERT INTO events VALUES(?,?,?,?)', (seq, previous, value, raw))
        return value

    def register(self, task):
        if any((task.get('metadata')or{}).get(k)is not None for k in ('enum_repair','finite_recovery')):
            raise ValueError('Cornell schema repairs cannot enter the direct OpenAI journal')
        validate_task(task)
        identity = canonical({'task_id': task['task_id'], 'stage': task['stage'], 'model': task['model'],
                              'body_sha256': digest(task['body']), 'metadata': task.get('metadata', {})}).decode()
        existing = self.db.execute('SELECT * FROM tasks WHERE task_id=?', (task['task_id'],)).fetchone()
        if existing:
            if existing['identity'] != identity:
                raise ValueError('Task identity/body changed; explicit new source plan is required')
            return dict(existing)
        with self.transaction():
            self.db.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?)', (task['task_id'], identity, 'pending', None, None, None))
            self._event({'kind': 'task', 'task_id': task['task_id'], 'identity': json.loads(identity), 'state': 'pending'})
        return self.task(task['task_id'])

    def task(self, task_id):
        self._owner()
        row = self.db.execute('SELECT * FROM tasks WHERE task_id=?', (task_id,)).fetchone()
        if row is None:
            raise KeyError(task_id)
        result = dict(row)
        for key in ('identity', 'result', 'callback'):
            result[key] = json.loads(result[key]) if result[key] is not None else None
        return result

    def attempts_for(self, task_id):
        self._owner()
        return [{**dict(row), 'record': json.loads(row['record'])} for row in self.db.execute(
            'SELECT * FROM attempts WHERE task_id=? ORDER BY ordinal', (task_id,))]

    def reserve(self, task, *, max_attempts, request_body=None):
        if type(max_attempts) is not int or not 1 <= max_attempts <= 3:
            raise ValueError('The global logical-task attempt ceiling is three')
        self.register(task)
        actual_task = {**task, 'body': request_body if request_body is not None else task['body']}
        quotation = quote(actual_task)
        pricing_ref = None
        if actual_task['body']['service_tier'] == 'flex':
            facts = json.loads(checked_ref(self.root, FLEX_PRICING_REF))
            if facts.get('rates_per_million') != FLEX_PRICING or facts.get('automatic_standard_fallback_authorized') is not False:
                raise ValueError('Approved exact Flex pricing proof required')
            pricing_ref = FLEX_PRICING_REF
        with self.transaction():
            status = self.status()
            if status['frozen_reason']:
                raise BudgetBlocked(status['frozen_reason'])
            old = self.db.execute('SELECT * FROM attempts WHERE task_id=? ORDER BY ordinal', (task['task_id'],)).fetchall()
            current = self.task(task['task_id'])
            if actual_task['body'] != task['body']:
                base, actual = dict(task['body']), dict(actual_task['body'])
                base_cap, actual_cap = base.pop('max_output_tokens'), actual.pop('max_output_tokens')
                ceiling = task.get('metadata', {}).get('max_output_tokens_ceiling')
                if (base != actual or type(ceiling) is not int or not base_cap < actual_cap <= ceiling
                        or current['state'] != 'retry_wait' or not old
                        or (current['result'] or {}).get('retry_request_max_output_tokens') != actual_cap):
                    raise ValueError('Only an explicitly scheduled bounded output-cap variant is allowed')
            if any(row['state'] in {'reserved', 'started'} for row in old):
                raise BudgetBlocked('Unresolved prior send; preserve reservation and reconcile before resuming')
            if len(old) >= max_attempts or self.task(task['task_id'])['state'] in {'completed', 'scientific_hold', 'provider_hold', 'callback_error'}:
                raise BudgetBlocked('Task is already completed/held or has exhausted its retry limit')
            if quotation['liability_units'] > min(status['phase_remaining_units'], status['total_remaining_units']):
                raise BudgetBlocked('Next full attempt reservation exceeds remaining authorized liability', code='reservation_capacity')
            ordinal = len(old) + 1
            attempt_id = 'openai-' + digest({'phase': self.policy['phase_id'], 'task': task['task_id'], 'body': quotation['body_sha256']})[:24] + '-a' + str(ordinal)
            record = {'attempt_id': attempt_id, 'task_id': task['task_id'], 'ordinal': ordinal,
                      'stage': task['stage'], 'model': task['model'], 'quote': quotation, 'reserved_at': now(),
                      'base_body_sha256': digest(task['body']), 'max_output_tokens': actual_task['body']['max_output_tokens'],
                      'requested_service_tier': actual_task['body']['service_tier']}
            if pricing_ref is not None:record['flex_pricing_proof'] = pricing_ref
            self.db.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)',
                (attempt_id, task['task_id'], ordinal, 'reserved', quotation['liability_units'], quotation['liability_units'], canonical(record).decode()))
            self.db.execute('UPDATE tasks SET state=?,next_retry=NULL WHERE task_id=?', ('running', task['task_id']))
            self._event({'kind': 'reserve', 'attempt': record, 'state': 'reserved', 'liability': quotation['liability_units']})
        return record

    def reconcile_known_flex_usage(self, amendment_ref):
        """Append exact known-usage revisions; original records/events stay intact."""
        from .usage_reconciliation import approval, RECONCILE_KIND, known_usage, reconciliation_projection
        self.verify()
        _, approved = approval(self.root, amendment_ref, RECONCILE_KIND)
        changed = []
        with self.transaction():
            if self.db.execute("SELECT 1 FROM attempts WHERE state IN ('reserved','started') LIMIT 1").fetchone():
                raise BudgetBlocked('Reconciliation requires an idle accounting owner')
            for attempt_id in approved:
                row = self.db.execute('SELECT * FROM attempts WHERE attempt_id=?', (attempt_id,)).fetchone()
                if row is None:
                    raise ValueError('Approved original attempt is absent')
                observed = dict(row);observed['record'] = json.loads(observed['record'])
                if observed['state'] == 'settled_known_flex_usage_upper_bound':
                    proof = known_usage(self.root, observed['record'])
                    if proof != approved[attempt_id] or observed['liability'] != proof['after_liability_units']:
                        raise ValueError('Prior reconciliation differs from this exact approval')
                    continue
                proof = reconciliation_projection(self.root, amendment_ref, observed, attempt_id)
                self.db.execute('UPDATE attempts SET state=?,liability=? WHERE attempt_id=?',
                    ('settled_known_flex_usage_upper_bound', proof['after_liability_units'], attempt_id))
                self._event({'kind': 'known_flex_usage_reconciliation', 'attempt_id': attempt_id,
                    'amendment': amendment_ref, 'proof': proof,
                    'state': 'settled_known_flex_usage_upper_bound', 'liability': proof['after_liability_units']})
                changed.append(attempt_id)
        return {'changed_attempt_ids': changed, 'status': self.status(), 'verified': self.verify()}

    def resume_known_first_retries(self, approval_ref):
        """Finite known first-response scheduling only; cannot send requests."""
        from .usage_reconciliation import approval, RETRY_KIND, retry_projection
        self.verify()
        authority, approved = approval(self.root, approval_ref, RETRY_KIND)
        deadline = datetime.fromisoformat(authority['not_after_utc'].replace('Z', '+00:00'))
        if datetime.now(timezone.utc) >= deadline:
            raise BudgetBlocked('Inherited retry authority expired')
        changed = []
        with self.transaction():
            if self.db.execute("SELECT 1 FROM attempts WHERE state IN ('reserved','started') LIMIT 1").fetchone():
                raise BudgetBlocked('Scheduling requires an idle accounting owner')
            for attempt_id in approved:
                row = self.db.execute('SELECT * FROM attempts WHERE attempt_id=?', (attempt_id,)).fetchone()
                if row is None:
                    raise ValueError('Approved original retry attempt is absent')
                attempt = dict(row);attempt['record'] = json.loads(attempt['record'])
                task = self.task(attempt['task_id'])
                if (task['state'] == 'retry_wait'
                        and (task['result'] or {}).get('retry_kind') in {'finite_resume_increased_output_cap', 'finite_resume_resource_unavailable'}):
                    original = {**task, 'state': 'provider_hold', 'result': attempt['record']['result']}
                    expected = retry_projection(self.root, approval_ref, original, attempt,
                        self.db.execute('SELECT COUNT(*) FROM attempts WHERE task_id=?', (attempt['task_id'],)).fetchone()[0])
                    if task['result'] != expected:
                        raise ValueError('Existing retry schedule differs from its original approval')
                    continue
                result = retry_projection(self.root, approval_ref, task, attempt,
                    self.db.execute('SELECT COUNT(*) FROM attempts WHERE task_id=?', (attempt['task_id'],)).fetchone()[0])
                retry_at = max(datetime.now(timezone.utc).timestamp(), approved[attempt_id]['not_before_timestamp'])
                if retry_at >= deadline.timestamp():
                    raise BudgetBlocked('Saved Retry-After exceeds the original authorization deadline')
                self.db.execute('UPDATE tasks SET state=?,result=?,next_retry=? WHERE task_id=?',
                    ('retry_wait', canonical(result).decode(), retry_at, attempt['task_id']))
                self._event({'kind': 'explicit_known_first_retry', 'approval': approval_ref,
                    'attempt_id': attempt_id, 'task_id': attempt['task_id'], 'result': result, 'next_retry': retry_at})
                changed.append(attempt['task_id'])
        return {'scheduled_task_ids': changed, 'status': self.status(), 'verified': self.verify()}

    def recover_interrupted(self):
        """Called only by a new idle coordinator holding the exclusive lease."""
        self._owner()
        pending = list(self.db.execute("SELECT attempt_id FROM attempts WHERE state IN ('reserved','started')"))
        for row in pending:
            self.finish(row['attempt_id'], {'status': 'provider_problem', 'sent': True, 'usage': None,
                'error': {'type': 'interrupted_before_settlement',
                          'message': 'Prior coordinator ended without a committed result; full reservation preserved'},
                'retryable': False, 'artifacts': {}})
        return len(pending)

    def started(self, attempt_id):
        with self.transaction():
            row = self.db.execute('SELECT * FROM attempts WHERE attempt_id=?', (attempt_id,)).fetchone()
            if row is None or row['state'] != 'reserved':
                raise ValueError('Only a newly reserved attempt can start')
            self.db.execute('UPDATE attempts SET state=? WHERE attempt_id=?', ('started', attempt_id))
            self._event({'kind': 'started', 'attempt_id': attempt_id})

    def finish(self, attempt_id, result, *, retry_at=None):
        """A provider failure remains a charged/held attempt even when retried."""
        with self.transaction():
            row = self.db.execute('SELECT * FROM attempts WHERE attempt_id=?', (attempt_id,)).fetchone()
            if row is None or row['state'] not in {'reserved', 'started'}:
                raise ValueError('Cannot settle a missing or already settled attempt')
            record = json.loads(row['record'])
            identifiers = []
            response_id = (result.get('response') or {}).get('id')
            for kind, value in [('request', result.get('provider_request_id')), ('response', response_id)]:
                if isinstance(value, str) and value.strip():
                    identifiers.append((kind, value))
            duplicate = []
            for kind, value in identifiers:
                old = self.db.execute('SELECT attempt_id FROM provider_identifiers WHERE kind=? AND value=?', (kind, value)).fetchone()
                if old is not None and old[0] != attempt_id:
                    duplicate.append({'kind': kind, 'value': value, 'original_attempt_id': old[0]})
                else:
                    self.db.execute('INSERT OR IGNORE INTO provider_identifiers VALUES(?,?,?)', (kind, value, attempt_id))
            if duplicate or (result.get('status') == 'completed' and not identifiers):
                # Only derived transport metadata changes; raw_response and the
                # immutable pre-accounting result retain the exact native data.
                result.update({'transport_status': result['status'], 'status': 'provider_problem', 'payload': None,
                    'error': {'type': 'duplicate_provider_identity' if duplicate else 'missing_provider_identity',
                              'duplicates': duplicate}, 'retryable': False})
                retry_at = None
            pricing = settlement_pricing(record, result)
            cost = pricing['usage_liability_units']
            integrity = (result.get('error') or {}).get('type') in {'returned_route_mismatch', 'returned_reasoning_mismatch', 'route_integrity_error', 'credential_echo_redacted'}
            if result.get('sent') is False:
                amount, state = 0, 'cancelled_before_send'
            elif duplicate:
                amount, state = row['reservation'], 'held_duplicate_provider_identity'
                self.db.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)', ('frozen_reason', 'Duplicate provider request/response identity; original reservations preserved'))
            elif (result.get('error') or {}).get('type') == 'missing_provider_identity':
                amount, state = row['reservation'], 'held_missing_provider_identity'
            elif integrity:
                amount, state = row['reservation'], 'held_route_integrity'
                self.db.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)', ('frozen_reason', 'Native route/response integrity could not be verified'))
            elif pricing['resource_unavailable_uncharged']:
                amount, state = 0, 'settled_flex_resource_unavailable_no_charge'
            elif (result.get('error') or {}).get('type') == 'incomplete_output':
                amount, state = row['reservation'], 'held_incomplete_usage'
            elif cost is None:
                amount, state = row['reservation'], 'held_unknown_usage'
            else:
                amount, state = cost, 'settled_usage_upper_bound'
            if amount > row['reservation']:
                self.db.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)', ('frozen_reason', 'Provider usage exceeds the conservative reservation'))
            record.update({'finished_at': now(), 'result': result, 'settlement_pricing': pricing})
            self.db.execute('UPDATE attempts SET state=?,liability=?,record=? WHERE attempt_id=?',
                (state, amount, canonical(record).decode(), attempt_id))
            task_state = 'retry_wait' if retry_at is not None else ('received' if result.get('status') == 'completed' else 'provider_hold')
            self.db.execute('UPDATE tasks SET state=?,result=?,next_retry=? WHERE task_id=?',
                (task_state, canonical(result).decode(), retry_at, row['task_id']))
            self._event({'kind': 'finish', 'attempt_id': attempt_id, 'state': state, 'liability': amount,
                         'task_state': task_state, 'result': result, 'next_retry': retry_at, 'settlement_pricing': pricing})
        return state

    def callback(self, task_id, value, *, error=False):
        canonical(value)
        current = self.task(task_id)
        if current['state'] not in {'received', 'provider_hold', 'callback_error'}:
            raise ValueError('Only a committed provider result can enter the scientific callback')
        state = ('callback_error' if error else 'provider_hold' if (current['result'] or {}).get('status') != 'completed'
                 else 'scientific_hold' if isinstance(value, dict) and value.get('status') in {'needs_review', 'quarantined', 'scientific_hold'}
                 else 'completed')
        with self.transaction():
            self.db.execute('UPDATE tasks SET state=?,callback=? WHERE task_id=?', (state, canonical(value).decode(), task_id))
            self._event({'kind': 'callback', 'task_id': task_id, 'state': state, 'value': value})
        return state

    def status(self):
        self._owner()
        expense = self.db.execute('SELECT COALESCE(SUM(liability),0) FROM attempts').fetchone()[0]
        baseline = units(self.baseline['amount_usd'])
        frozen = self.db.execute("SELECT value FROM metadata WHERE key='frozen_reason'").fetchone()
        states = {row[0]: row[1] for row in self.db.execute('SELECT state,COUNT(*) FROM tasks GROUP BY state')}
        attempt_states = {row[0]: row[1] for row in self.db.execute('SELECT state,COUNT(*) FROM attempts GROUP BY state')}
        head = self.db.execute('SELECT event_hash FROM events ORDER BY seq DESC LIMIT 1').fetchone()
        return {'as_of': now(), 'phase_id': self.policy['phase_id'], 'baseline_liability_usd': usd(baseline),
                'phase_allowance_usd': usd(self.policy['allowance_units']), 'phase_liability_usd': usd(expense),
                'cumulative_liability_usd': usd(baseline + expense), 'total_cap_usd': usd(self.policy['total_cap_units']),
                'phase_remaining_units': self.policy['allowance_units'] - expense,
                'total_remaining_units': self.policy['total_cap_units'] - baseline - expense,
                'phase_remaining_usd': usd(self.policy['allowance_units'] - expense),
                'total_remaining_usd': usd(self.policy['total_cap_units'] - baseline - expense),
                'task_states': states, 'attempt_states': attempt_states, 'frozen_reason': frozen[0] if frozen else None,
                'audit_head': head[0] if head else None, 'historical_holds_preserved': True,
                'liability_is_not_invoice': True}

    def verify(self):
        """Full chain AND projection replay at startup and final checkpoint."""
        self._owner()
        previous = '0' * 64
        attempts, tasks = {}, {}
        provider_ids = dict(self.historical_provider_ids)
        frozen = None
        opening = None
        for index, row in enumerate(self.db.execute('SELECT * FROM events ORDER BY seq'), 1):
            item = json.loads(row['payload'])
            if index == 1:
                if item.get('kind') != 'carry_forward':
                    raise ValueError('The opening carry-forward event is missing')
                opening = row['event_hash']
            if (row['seq'] != index or row['previous_hash'] != previous or item['seq'] != index
                    or item['previous_hash'] != previous or hashlib.sha256(row['payload'].encode()).hexdigest() != row['event_hash']):
                raise ValueError('Accounting event chain is corrupt')
            if item['kind'] == 'carry_forward':
                if index != 1 or item['policy'] != self.policy:
                    raise ValueError('Historical baseline/policy changed')
            elif item['kind'] == 'task':
                tasks[item['task_id']] = {'identity': item['identity'], 'state': 'pending', 'result': None, 'callback': None, 'next_retry': None}
            elif item['kind'] == 'reserve':
                a = item['attempt']
                if a.get('requested_service_tier') == 'flex':
                    if a.get('flex_pricing_proof') != FLEX_PRICING_REF:
                        raise ValueError('Flex reservation lacks its exact pricing proof')
                    checked_ref(self.root, a['flex_pricing_proof'])
                attempts[a['attempt_id']] = {'task_id': a['task_id'], 'ordinal': a['ordinal'], 'state': 'reserved',
                    'liability': item['liability'], 'reservation': item['liability'], 'record': a}
                tasks[a['task_id']].update(state='running', next_retry=None)
            elif item['kind'] == 'started':
                attempts[item['attempt_id']]['state'] = 'started'
            elif item['kind'] == 'finish':
                a = attempts[item['attempt_id']]
                a.update(state=item['state'], liability=item['liability'])
                error_kind = (item['result'].get('error') or {}).get('type')
                observed_ids = []
                for kind, value in [('request', item['result'].get('provider_request_id')),
                                    ('response', (item['result'].get('response') or {}).get('id'))]:
                    if isinstance(value, str) and value.strip():
                        observed_ids.append((kind, value))
                duplicate = any(key in provider_ids and provider_ids[key] != item['attempt_id'] for key in observed_ids)
                if duplicate != (error_kind == 'duplicate_provider_identity'):
                    raise ValueError('Provider identity uniqueness differs from its committed history')
                for key in observed_ids:
                    provider_ids.setdefault(key, item['attempt_id'])
                if duplicate:
                    frozen = 'Duplicate provider request/response identity; original reservations preserved'
                if error_kind in {'returned_route_mismatch', 'returned_reasoning_mismatch', 'route_integrity_error', 'credential_echo_redacted'}:
                    frozen = 'Native route/response integrity could not be verified'
                if item['liability'] > a['reservation']:
                    frozen = 'Provider usage exceeds the conservative reservation'
                for reference in item['result'].get('artifacts', {}).values():
                    checked_ref(self.root, reference)
                # The record's finished_at is audit metadata; all scientific and
                # financial fields are compared below, including the result.
                a['record']['result'] = item['result']
                if 'settlement_pricing' in item:
                    expected_pricing = settlement_pricing(a['record'], item['result'])
                    if (item['settlement_pricing'] != expected_pricing
                            and not (item['state'] == 'held_unknown_usage'
                                and item['liability'] == a['reservation']
                                and expected_pricing['resource_unavailable_uncharged']
                                and item['settlement_pricing'] == settlement_pricing(a['record'], item['result'], capacity_alias=False))):
                        raise ValueError('Service-tier settlement proof differs from native usage/tier')
                    if item['state'] == 'settled_flex_resource_unavailable_no_charge' and (
                            not expected_pricing['resource_unavailable_uncharged'] or item['liability'] != 0):
                        raise ValueError('Uncharged Flex resource failure was not source-proven')
                    if item['state'] == 'settled_usage_upper_bound' and item['liability'] != expected_pricing['usage_liability_units']:
                        raise ValueError('Settled tier/usage amount differs from the approved rate proof')
                    a['record']['settlement_pricing'] = item['settlement_pricing']
                tasks[a['task_id']].update(state=item['task_state'], result=item['result'], next_retry=item['next_retry'])
            elif item['kind'] == 'known_flex_usage_reconciliation':
                from .usage_reconciliation import reconciliation_projection
                attempt = attempts[item['attempt_id']]
                proof = reconciliation_projection(self.root, item['amendment'], attempt, item['attempt_id'])
                if (item['proof'] != proof or item['state'] != 'settled_known_flex_usage_upper_bound'
                        or item['liability'] != proof['after_liability_units']):
                    raise ValueError('Known-usage amendment projection differs from its source proof')
                attempt.update(state=item['state'], liability=item['liability'])
            elif item['kind'] == 'explicit_known_first_retry':
                from .usage_reconciliation import retry_projection, approval, RETRY_KIND
                attempt = attempts[item['attempt_id']]
                if item['task_id'] != attempt['task_id']:
                    raise ValueError('Retry event belongs to a different task')
                result = retry_projection(self.root, item['approval'], tasks[item['task_id']], attempt,
                    sum(row['task_id'] == item['task_id'] for row in attempts.values()))
                authority, approved = approval(self.root, item['approval'], RETRY_KIND)
                deadline = datetime.fromisoformat(authority['not_after_utc'].replace('Z', '+00:00')).timestamp()
                if (item['result'] != result or type(item['next_retry']) not in (int, float)
                        or not approved[item['attempt_id']]['not_before_timestamp'] <= item['next_retry'] < deadline):
                    raise ValueError('Explicit retry event changed native result or scheduling metadata')
                tasks[item['task_id']].update(state='retry_wait', result=result, next_retry=item['next_retry'])
            elif item['kind'] == 'callback':
                tasks[item['task_id']].update(state=item['state'], callback=item['value'])
            else:
                raise ValueError('Unknown accounting event')
            previous = row['event_hash']
        actual = {r['attempt_id']: dict(r) for r in self.db.execute('SELECT * FROM attempts')}
        if set(actual) != set(attempts):
            raise ValueError('Attempt projection membership changed')
        for key, expected in attempts.items():
            observed = actual[key]
            rec = json.loads(observed.pop('record'))
            rec.pop('finished_at', None)
            observed.pop('attempt_id')
            if observed != {k: v for k, v in expected.items() if k != 'record'} or rec != expected['record']:
                raise ValueError('Attempt projection differs from committed events')
        actual_tasks = {r['task_id']: self.task(r['task_id']) for r in self.db.execute('SELECT task_id FROM tasks')}
        if set(actual_tasks) != set(tasks):
            raise ValueError('Task projection membership changed')
        for key, expected in tasks.items():
            observed = actual_tasks[key]
            observed.pop('task_id')
            if observed != expected:
                raise ValueError('Task projection differs from committed events')
        metadata = {key: value for key, value in self.db.execute('SELECT key,value FROM metadata')}
        if (json.loads(metadata.pop('policy', 'null')) != self.policy
                or metadata.pop('frozen_reason', None) != frozen or metadata):
            raise ValueError('Account policy/freeze projection differs from its committed history')
        actual_ids = {(kind, value): attempt for kind, value, attempt in self.db.execute('SELECT * FROM provider_identifiers')}
        if actual_ids != provider_ids:
            raise ValueError('Provider identifier index differs from its committed history')
        marker = json.loads(self.marker.read_bytes())
        if opening is None or marker != {'journal': JOURNAL_PATH, 'phase_id': PHASE_ID,
                'policy_sha256': digest(self.policy), 'opening_event_hash': opening}:
            raise ValueError('Opening account history differs from the immutable carry-forward marker')
        return {'verified': True, 'audit_head': previous, 'events': self.db.execute('SELECT COUNT(*) FROM events').fetchone()[0],
                'attempts': len(attempts), 'tasks': len(tasks), 'status': self.status()}

    def close(self):
        self._owner()
        self.db.close()
        fcntl.flock(self.lease, fcntl.LOCK_UN)
        os.close(self.lease)

