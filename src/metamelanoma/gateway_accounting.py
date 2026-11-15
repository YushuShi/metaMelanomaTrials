"""One-owner Cornell attempt journal; estimates are never native charges/invoices."""
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import threading
from urllib.parse import urlsplit
from types import MappingProxyType

from . import accounting as a

PATH = 'data/current/gateway_accounting.sqlite3'
PROVIDER = 'cornell_openai_gateway'
ACCOUNT = 'configured_Cornell_gateway'


def immutable(root, relative, value):
    path = a.owned(root, relative);path.parent.mkdir(parents=True, exist_ok=True)
    a.owned(root, path.parent, exists=True, directory=True);a.owned(root, path)
    raw = a.canonical(value)
    if path.exists():
        if path.read_bytes() != raw:raise ValueError('Immutable gateway artifact changed')
    else:
        with path.open('xb') as handle:handle.write(raw)
    return {'path': str(path.relative_to(Path(root).resolve())), 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}


def cohort_pmids(root, ref):
    raw = a.checked_ref(root, ref)
    try:values = json.loads(raw)
    except json.JSONDecodeError:values = [json.loads(line) for line in raw.splitlines() if line.strip()]
    if isinstance(values, dict):values = values.get('reports', values.get('articles', values.get('records')))
    if not isinstance(values, list) or not values:raise ValueError('Finite gateway cohort required')
    ids = [str(row['pmid']) for row in values]
    if len(set(ids)) != len(ids):raise ValueError('Gateway cohort PMID duplicates')
    return set(ids)


def source_key(task):
    meta = task.get('metadata') or {};source = meta.get('source_ref') or {}
    if not meta.get('pmid') or not isinstance(source.get('sha256'), str):
        raise ValueError('Bound scientific source/PMID required')
    return a.digest({'phase_id': a.PHASE_ID, 'stage': task['stage'], 'model': task['model'],
        'pmid': str(meta['pmid']), 'source_sha256': source['sha256']})


def readonly(root, relative):
    path = a.owned(root, relative, exists=True)
    for suffix in ('', '-wal', '-shm', '-journal'):
        p = a.owned(root, str(path) + suffix)
        if p.exists() and (not p.is_file() or p.stat().st_nlink != 1):raise ValueError('Owned single-link database required')
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True);db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON');db.execute('BEGIN');return db


def prepare_switch_seed(root, *, direct_journal_head, cohort_ref):
    """Capture immutable actual prior counts/IDs; no financial constructor/writes."""
    root = Path(root).resolve();allowed = cohort_pmids(root, cohort_ref);db = readonly(root, a.JOURNAL_PATH)
    try:
        head = dict(db.execute('SELECT seq,event_hash FROM events ORDER BY seq DESC LIMIT 1').fetchone())
        if head != direct_journal_head:raise ValueError('Frozen direct journal head changed')
        policy = json.loads(db.execute("SELECT value FROM metadata WHERE key='policy'").fetchone()[0])
        if (policy['phase_id'] != a.PHASE_ID or policy['allowance_units'] != a.units('100')
                or policy['total_cap_units'] != a.units('244.959774')):raise ValueError('Direct phase changed')
        if db.execute("SELECT 1 FROM attempts WHERE state IN ('reserved','started') LIMIT 1").fetchone():
            raise ValueError('Direct worker must drain before gateway switch')
        # Replay the frozen canonical financial projection without its constructor
        # or writer lease. A matching head alone cannot certify SQL projections.
        view = object.__new__(a.Journal);view.root=root;view.path=a.owned(root,a.JOURNAL_PATH,exists=True)
        view.owner=threading.get_ident();view.db=db;view.policy=policy;view.baseline=policy['baseline']
        info=view.path.stat();view.file_identity=info.st_dev,info.st_ino
        view.marker=a.owned(root,'data/current/accounting.carry_forward.json',exists=True)
        view.marker_sha256=hashlib.sha256(view.marker.read_bytes()).hexdigest();view.historical_provider_ids={}
        provider_ref=policy['baseline'].get('provider_identifiers_ref')
        if provider_ref:
            for value in json.loads(a.checked_ref(root,provider_ref))['identifiers']:
                view.historical_provider_ids[(value['kind'],value['value'])]='historical:'+value['original_call_ids'][0]
        verification=view.verify()
        if verification['audit_head'] != head['event_hash']:raise ValueError('Direct financial verification head differs')
        sources = {}
        for stored in db.execute('SELECT * FROM tasks ORDER BY task_id'):
            identity = json.loads(stored['identity']);pmid = str(identity['metadata']['pmid'])
            if pmid not in allowed:continue
            path = a.owned(root, 'data/current/tasks/' + stored['task_id'] + '/task.json', exists=True)
            task = json.loads(path.read_bytes());a.validate_task(task);a.checked_ref(root, task['metadata']['source_ref'])
            expected = {'task_id': task['task_id'], 'stage': task['stage'], 'model': task['model'],
                'body_sha256': a.digest(task['body']), 'metadata': task['metadata']}
            if expected != identity:raise ValueError('Saved direct task differs from committed identity')
            key = source_key(task);entry = sources.setdefault(key, {'prior_attempts': [], 'completed': False,
                'unresolved_unknown': False, 'next_cap': task['body']['max_output_tokens'], 'next_retry': 0})
            result = json.loads(stored['result']) if stored['result'] else {}
            entry['completed'] |= result.get('status') == 'completed'
            for row in db.execute('SELECT * FROM attempts WHERE task_id=? ORDER BY ordinal', (stored['task_id'],)):
                record = json.loads(row['record'])
                entry['prior_attempts'].append({'attempt_id': row['attempt_id'], 'task_id': row['task_id'],
                    'ordinal': row['ordinal'], 'state': row['state'], 'origin': 'frozen_direct_openai',
                    'record': {'reserved_at': record['reserved_at'], 'max_output_tokens': record['max_output_tokens'],
                        'original_record_sha256': a.digest(record), 'artifacts': (record.get('result') or {}).get('artifacts', {})}})
                entry['unresolved_unknown'] |= row['state'].startswith('held_') or row['state'] in {'reserved','started'}
            if stored['state'] == 'retry_wait':
                entry['next_cap'] = max(entry['next_cap'], result.get('retry_request_max_output_tokens', entry['next_cap']))
                entry['next_retry'] = max(entry['next_retry'], stored['next_retry'] or 0)
        for entry in sources.values():entry['prior_attempts'].sort(key=lambda r: (r['record']['reserved_at'], r['attempt_id']))
        identifiers = [{'kind': row['kind'], 'value': row['value'], 'origin': 'direct:' + row['attempt_id']}
            for row in db.execute('SELECT * FROM provider_identifiers ORDER BY kind,value')]
        if db.total_changes:raise ValueError('Read-only seed wrote financial data')
    finally:db.close()
    resolved = []
    registry = readonly(root, 'data/current/articles.sqlite3')
    try:
        for row in registry.execute('SELECT d.pmid,d.stage,d.status FROM decisions d JOIN (SELECT pmid,stage,MAX(id) id FROM decisions GROUP BY pmid,stage) x ON x.id=d.id'):
            if row['pmid'] in allowed and row['status'] in {'retain','exclude','unclear'}:resolved.append([row['pmid'],row['stage']])
    finally:registry.close()
    value = {'record_kind': 'frozen_direct_to_Cornell_switch_seed', 'phase_id': a.PHASE_ID,
        'direct_journal_head': head, 'direct_opening_policy_sha256': a.digest(policy), 'cohort_ref': cohort_ref,
        'sources': sources, 'provider_identifiers': identifiers, 'resolved_reports': sorted(resolved),
        'direct_projection_verified':True,'direct_projection_verification':verification,
        'direct_allowance_unchanged': '100', 'new_native_requests': 0, 'credentials_read': 0}
    return immutable(root, 'data/audits/cornell_gateway_switch/' + a.digest(value) + '.json', value)


def cost_metadata(record, result, *, evidence_verified=False):
    headers = result.get('headers') or {};raw = headers.get('x-litellm-response-cost');reported = None
    if evidence_verified and isinstance(raw, str):
        try:
            number = Decimal(raw)
            if number.is_finite() and number >= 0:reported = str(number)
        except InvalidOperation:pass
    return {'gateway_reported_proxy_estimate_usd': reported,
        'gateway_reported_proxy_estimate_status': 'reported' if reported is not None else 'unknown',
        'reference_OpenAI_standard_usage_estimate_units': a.usage_cost(record['model'], result.get('usage')) if evidence_verified else None,
        'reference_OpenAI_standard_quote': record['reference_quote'],
        'usage': result.get('usage'), 'usage_evidence_verified':evidence_verified,
        'gateway_headers': {k:v for k,v in headers.items() if k.startswith('x-litellm-')},
        'caller_http_attempts': result.get('caller_http_attempts'),
        'upstream_attempts_not_inferred_from_gateway_counters': True,
        'native_direct_openai_charge': False, 'cost_is_invoice': False}


def cost_evidence(root, endpoint, record, result):
    """Bind failure cost/usage too; artifactless uncertain sends remain unknown."""
    refs=result.get('artifacts')or{}
    if set(refs)!={'request','raw_response','sent','result','receipt'}:return False
    values={key:a.checked_ref(root,ref)for key,ref in refs.items()}
    try:
        request=json.loads(values['request']);saved=json.loads(values['result']);receipt=json.loads(values['receipt']);sent=json.loads(values['sent'])
        try:raw=json.loads(values['raw_response'])
        except (ValueError,UnicodeError):raw={}
        if not isinstance(raw,dict):raw={}
        native_usage=raw.get('usage')if isinstance(raw.get('usage'),dict)else None
        if (request.get('provider')!=PROVIDER or request.get('account')!=ACCOUNT or request.get('endpoint')!=endpoint
                or request.get('attempt_id')!=record['attempt_id']or request.get('task_id')!=record['task_id']
                or a.digest(request['body'])!=record['reference_quote']['body_sha256']
                or raw!=result.get('response')or native_usage!=result.get('usage')):return False
        for key in ('attempt_id','task_id','provider','account','usage','response','headers','request_body_sha256','provider_request_id','requested_service_tier','max_output_tokens'):
            if saved.get(key)!=result.get(key):return False
        return (receipt.get('provider')==PROVIDER and receipt.get('account')==ACCOUNT
            and receipt.get('endpoint')==endpoint and receipt.get('model')==record['model']
            and receipt.get('attempt_id')==record['attempt_id']and receipt.get('task_id')==record['task_id']
            and receipt.get('usage')==result.get('usage')and receipt.get('provider_request_id')==result.get('provider_request_id')
            and sent.get('attempt_id')==record['attempt_id']and sent.get('task_id')==record['task_id']
            and sent.get('endpoint')==endpoint and sent.get('request_body_sha256')==result.get('request_body_sha256'))
    except (ValueError,TypeError,KeyError):return False


def completed_route_proof(root, endpoint, record, result):
    if result.get('provider') != PROVIDER or result.get('account') != ACCOUNT:
        raise ValueError('Completed response is not from the approved gateway account')
    refs = result.get('artifacts') or {}
    if set(refs) != {'request','raw_response','sent','result','receipt'}:
        raise ValueError('Completed gateway response lacks original immutable call proofs')
    request = json.loads(a.checked_ref(root, refs['request']))
    response = json.loads(a.checked_ref(root, refs['raw_response']))
    saved = json.loads(a.checked_ref(root,refs['result']));receipt=json.loads(a.checked_ref(root,refs['receipt']));sent=json.loads(a.checked_ref(root,refs['sent']))
    if (request.get('provider') != PROVIDER or request.get('account') != ACCOUNT
            or request.get('endpoint') != endpoint or request.get('attempt_id') != record['attempt_id']
            or request.get('task_id') != record['task_id']
            or a.digest(request['body']) != record['reference_quote']['body_sha256']
            or result.get('request_body_sha256') != a.digest(request['body'])
            or response != result.get('response') or response.get('model') != record['model']
            or response.get('service_tier') not in (None,'default') or response.get('status')!='completed'
            or not isinstance(response.get('reasoning')or{},dict)
            or (response.get('reasoning')or{}).get('effort')not in (None,'high')
            or response.get('usage')!=result.get('usage')):
        raise ValueError('Gateway raw/request/model/route proof differs')
    from .transport import extract_payload
    if extract_payload(response)!=result.get('payload'):raise ValueError('Gateway payload differs from exact native structured output')
    for key in ('attempt_id','task_id','provider','account','status','payload','usage','response','headers','request_body_sha256','provider_request_id'):
        if saved.get(key)!=result.get(key):raise ValueError('Saved gateway result differs from committed result')
    if (receipt.get('provider')!=PROVIDER or receipt.get('account')!=ACCOUNT or receipt.get('endpoint')!=endpoint
            or receipt.get('attempt_id')!=record['attempt_id']or receipt.get('task_id')!=record['task_id']
            or receipt.get('model')!=record['model']or receipt.get('usage')!=result.get('usage')
            or receipt.get('provider_request_id')!=result.get('provider_request_id')
            or sent.get('attempt_id')!=record['attempt_id']or sent.get('task_id')!=record['task_id']
            or sent.get('endpoint')!=endpoint or sent.get('request_body_sha256')!=result.get('request_body_sha256')):
        raise ValueError('Gateway receipt/send proof differs')


REPAIR_KIND = 'finite_Cornell_current_span_schema_repair_authority'
REPAIR_CONTRACT = 'owned_span_and_source_identity_enums_with_upstream_R2_prompt_clarification'


def task_identity(task):
    return {'task_id':task['task_id'],'stage':task['stage'],'model':task['model'],
        'body_sha256':a.digest(task['body']),'metadata':task.get('metadata',{})}


def _repair_entry(root, task, approval_ref, *, allow_output_cap_variant=False):
    authority=json.loads(a.checked_ref(root,approval_ref))
    if (authority.get('record_kind')!=REPAIR_KIND or authority.get('status')!='approved'
            or authority.get('phase_id')!=a.PHASE_ID or authority.get('provider')!=PROVIDER
            or authority.get('repair_contract')!=REPAIR_CONTRACT or authority.get('global_max_attempts')!=3):
        raise ValueError('Exact finite approved Cornell schema-repair authority required')
    parent=json.loads(a.checked_ref(root,authority['parent_config_ref']))
    if authority['not_after']!=parent['not_after_utc']:
        raise ValueError('Schema repair cannot extend the original deadline')
    start=datetime.fromisoformat(authority['repair_retry_window_started_at']);end=datetime.fromisoformat(authority['not_after'])
    if start.tzinfo is None or end.tzinfo is None or start>=end:
        raise ValueError('Bounded timezone-aware repair retry epoch required')
    entries=authority.get('entries')
    if not isinstance(entries,list) or not entries or len({r['task_id']for r in entries})!=len(entries):
        raise ValueError('Closed nonduplicated repair membership required')
    matches=[row for row in entries if row['task_id']==task['task_id']]
    if len(matches)!=1:raise ValueError('Task is outside the finite repair approval')
    row=matches[0];raw=a.checked_ref(root,row['revised_task_ref']);bound=json.loads(raw)
    expected='data/current/tasks/'+task['task_id']+'/revisions/'+a.digest(bound)+'/task.json'
    if row['revised_task_ref']['path']!=expected or raw!=a.canonical(bound):
        raise ValueError('Repair task must be its exact immutable revision under the original ID')
    if task!=bound:
        normalized={**task,'body':{**task['body'],'max_output_tokens':bound['body']['max_output_tokens']}}
        cap=task['body']['max_output_tokens'];ceiling=bound['metadata']['max_output_tokens_ceiling']
        if (allow_output_cap_variant is not True or normalized!=bound or type(cap)is not int
                or not bound['body']['max_output_tokens']<cap<=ceiling):
            raise ValueError('Only a bounded output-cap variant of the exact approved revision is allowed')
    original_path='data/current/tasks/'+task['task_id']+'/task.json'
    if row['original_task_ref']['path']!=original_path:
        raise ValueError('Original task path cannot change')
    original=json.loads(a.checked_ref(root,row['original_task_ref']))
    a.validate_task(original)
    if original['task_id']!=task['task_id'] or original['stage']!='R3' or original['model']!=task['model']:
        raise ValueError('Repair cannot change original logical task/stage/model')
    source=json.loads(a.checked_ref(root,original['metadata']['source_ref']))
    if (source.get('stage')!='R3' or str(source.get('pmid'))!=str(original['metadata']['pmid'])
            or source.get('report_id')!=original['metadata']['report_id']):
        raise ValueError('Repair source identity differs from original task')
    ceiling=row['wire_ceiling_bytes']
    if type(ceiling)is not int or ceiling not in {120000,140000}:raise ValueError('Repair wire limit changed')
    a.validate_task(task,wire_ceiling_bytes=ceiling)
    if a.reviewed_wire_ceiling(task)!=ceiling:raise ValueError('Typed wire bound differs from authority')
    allowed={'body_core_sha256','enum_repair','wire_ceiling_bytes'}
    if {k:v for k,v in task['metadata'].items()if k not in allowed}!={k:v for k,v in original['metadata'].items()if k not in allowed}:
        raise ValueError('Only repair metadata and schema-derived body hash may change')
    if source_key(original)!=source_key(task):raise ValueError('Logical scientific source changed')
    if original.get('body') is None or a.digest(task_identity(original))!=row['old_identity_sha256']:
        raise ValueError('Original identity does not match finite old identity')
    return authority,row,original,source,bound


def validate_amended_task(root, task, approval_ref, *, allow_output_cap_variant=False):
    """Pure bound reconstruction; no financial constructor or database write."""
    authority,row,original,source,bound=_repair_entry(root,task,approval_ref,allow_output_cap_variant=allow_output_cap_variant)
    # A pre-send gate may check an already scheduled cap variant. The immutable
    # amendment itself always remains the exact LAST-SENT-cap base revision;
    # reserve independently requires retry_wait and that precise scheduled cap.
    task=bound
    if row['classification']=='unsent':
        last=original['body']
        if row.get('last_attempt_id')is not None or row.get('last_request_body_sha256')!=a.digest(last):
            raise ValueError('Unsent repair must use its original request')
    else:
        request=json.loads(a.checked_ref(root,row['last_request_ref']));last=request['body']
        if (request.get('task_id')!=task['task_id'] or request.get('attempt_id')!=row['last_attempt_id']
                or request.get('provider')!=PROVIDER or a.digest(last)!=row['last_request_body_sha256']):
            raise ValueError('Exact last sent request proof required')
    from .screening import catalog_enum_repair_body
    if task['body']!=catalog_enum_repair_body(last,source,wire_ceiling=row['wire_ceiling_bytes']):
        raise ValueError('Repair changes a field beyond the exact reviewed schema/prompt contract')
    meta=task['metadata']
    if meta.get('enum_repair')!={'kind':'current_sent_catalog_span_enum_only','old_body_sha256':a.digest(last)}:
        raise ValueError('Repair parent body metadata differs')
    if meta.get('body_core_sha256')!=a.digest({k:v for k,v in task['body'].items()if k!='max_output_tokens'}):
        raise ValueError('Repair body core hash differs')
    if (row['old_instructions_sha256']!=__import__('hashlib').sha256(last['instructions'].encode()).hexdigest()
            or row['new_instructions_sha256']!=__import__('hashlib').sha256(task['body']['instructions'].encode()).hexdigest()):
        raise ValueError('Finite old/new prompt binding changed')
    # Existing larger caps must already be allowed by the ORIGINAL task.
    base=dict(original['body']);previous=dict(last);basecap=base.pop('max_output_tokens');lastcap=previous.pop('max_output_tokens')
    if base!=previous or not basecap<=lastcap<=original['metadata']['max_output_tokens_ceiling']:
        raise ValueError('Last actual body is not an authorized original cap variant')
    a.validate_task({**original,'body':last})
    return {'authority':authority,'entry':row,'original':original,'source':source,'last_body':last}


def _check_repair_state(root, task, approval_ref, current, history, route_ref):
    proof=validate_amended_task(root,task,approval_ref);authority=proof['authority'];row=proof['entry']
    if authority['route_ref']!=route_ref:raise ValueError('Repair route authority differs')
    if a.digest(current['identity'])!=row['old_identity_sha256'] or current['source_key']!=source_key(task):
        raise ValueError('Repair current old identity/source changed')
    n=len(history)
    if (type(row['expected_global_attempt_count'])is not int or row['expected_global_attempt_count']!=n
            or type(row['remaining_attempts'])is not int or row['remaining_attempts']!=3-n or n>=3):
        raise ValueError('Repair cannot reset or exceed global three-attempt history')
    if any(r['state'].startswith('held_')or r['state']in {'reserved','started'}for r in history):
        raise ValueError('Unknown/integrity-held sends are not schema-repair retries')
    classification=row['classification']
    if classification=='unsent':
        if n or current['state']!='pending' or current.get('result')is not None:
            raise ValueError('Unsent repair task already has send/result history')
    else:
        if not history or history[-1]['attempt_id']!=row['last_attempt_id']:
            raise ValueError('Repair must bind the latest actual attempt')
        record=history[-1]['record'];result=record.get('result')or{}
        if (result.get('request_body_sha256')!=row['last_request_body_sha256']
                or (result.get('artifacts')or{}).get('request')!=row['last_request_ref']):
            raise ValueError('Last immutable native request does not match committed history')
        if classification=='retry_wait':
            if current['state']!='retry_wait' or result.get('status')=='completed':
                raise ValueError('Only an existing bounded transport retry may amend its schema')
        elif classification in {'completed_foreign_span_failure','completed_source_identity_failure'}:
            if (current['state']not in {'completed','scientific_hold'} or result.get('status')!='completed'
                    or (current.get('callback')or{}).get('status')!='decision_validation_pending'
                    or (current.get('callback')or{}).get('artifact')!=row['failed_validation_ref']):
                raise ValueError('Source-valid completed work cannot be resubmitted as repair')
            view=json.loads(a.checked_ref(root,row['failed_validation_ref']));v=view['validation']
            if (view.get('task_id')!=task['task_id'] or view.get('source')!=task['metadata']['source_ref']
                    or view.get('native_artifacts')!=result['artifacts'] or v.get('original_payload')!=result.get('payload')
                    or view.get('request_body_sha256')!=row['last_request_body_sha256'] or v.get('decision_valid')is not False):
                raise ValueError('Failed validation is not the exact original native/source view')
            if classification=='completed_source_identity_failure':
                if v.get('global_errors')!=['Foreign report/PMID/stage/source']:
                    raise ValueError('Only exact source-identity failure qualifies for this repair class')
            else:
                ids={s['span_id']for s in json.loads(proof['last_body']['input'])['source_span_catalog']['spans']}
                if (v.get('global_errors')or v.get('decision_errors')!=['Missing/foreign/duplicate evidence reference']
                        or not any(e.get('span_id')not in ids for e in result['payload'].get('evidence',[]))):
                    raise ValueError('Only failed foreign current-span validation qualifies for this repair')
        else:raise ValueError('Unapproved repair classification')
    return proof


class GatewayJournal(a.Journal):
    """Reuse owner/transaction/callback guards, with separate route/accounting policy."""
    def __init__(self, root, *, route_ref):
        self.root = Path(root).resolve();self.path = a.owned(self.root, PATH);self.owner = threading.get_ident()
        self.route = json.loads(a.checked_ref(self.root, route_ref));route = self.route
        endpoint = urlsplit(route.get('endpoint',''))
        if (route.get('phase_id') != a.PHASE_ID or route.get('provider') != PROVIDER or route.get('account') != ACCOUNT
                or route.get('models') != a.MODELS or route.get('reasoning_effort') != 'high'
                or route.get('service_tier') != 'default' or route.get('direct_allowance_unchanged') != '100'
                or endpoint.scheme != 'https' or not endpoint.hostname or endpoint.username or endpoint.password
                or endpoint.query or endpoint.fragment or endpoint.path != '/v1/responses' or endpoint.port not in (None,443)
                or not (endpoint.hostname == 'cornell.edu' or endpoint.hostname.endswith('.cornell.edu'))):
            raise ValueError('Exact approved Cornell Responses route required')
        catalog = json.loads(a.checked_ref(self.root, route['catalog_ref']))
        if catalog.get('http_status') != 200 or not set(a.MODELS.values()) <= set(catalog.get('models_present', [])):
            raise ValueError('Current model availability proof required')
        self.allowed = cohort_pmids(self.root, route['cohort_ref'])
        self.seed = json.loads(a.checked_ref(self.root, route['switch_seed_ref']))
        if (self.seed.get('record_kind') != 'frozen_direct_to_Cornell_switch_seed'
                or self.seed.get('phase_id') != a.PHASE_ID or self.seed['direct_journal_head'] != route['direct_journal_head']
                or self.seed['cohort_ref'] != route['cohort_ref']or self.seed.get('direct_projection_verified')is not True):raise ValueError('Exact verified switch seed required')
        self._seed_bytes = a.canonical(self.seed)
        self._sources = MappingProxyType({key:a.canonical(value) for key,value in self.seed['sources'].items()})
        self._resolved = frozenset(tuple(value) for value in self.seed['resolved_reports'])
        self._provider_seed = tuple((r['kind'],r['value'],r['origin']) for r in self.seed['provider_identifiers'])
        self.policy = {'phase_id': a.PHASE_ID, 'provider': PROVIDER, 'account': ACCOUNT, 'route_ref': route_ref,
            'switch_seed_ref': route['switch_seed_ref'], 'gateway_local_cost_cap_usd': None,
            'cost_mode': 'gateway_reported_and_reference_estimates_not_native_invoice', 'global_source_max_attempts': 3}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.marker = a.owned(self.root, 'data/current/gateway_accounting.marker.json');self.marker_sha256 = None
        existing = self.path.exists()
        if existing != self.marker.exists():raise ValueError('Gateway journal/marker mismatch; no implicit reset')
        for suffix in ('','-wal','-shm','-journal'):
            p = a.owned(self.root, str(self.path) + suffix)
            if p.exists() and (not p.is_file() or p.stat().st_nlink != 1):raise ValueError('Owned gateway database required')
        lease = a.owned(self.root, 'data/current/accounting.sqlite3.lock')
        self.lease = os.open(lease, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:fcntl.flock(self.lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(self.lease);raise RuntimeError('Another model coordinator owns the project lease') from None
        try:
            direct = readonly(self.root, a.JOURNAL_PATH)
            try:
                observed = dict(direct.execute('SELECT seq,event_hash FROM events ORDER BY seq DESC LIMIT 1').fetchone())
                if observed != route['direct_journal_head']:raise ValueError('Frozen direct journal advanced after switch')
            finally:direct.close()
            self.db = sqlite3.connect(str(self.path),timeout=30);self.db.row_factory = sqlite3.Row
            self.file_identity = self.path.stat().st_dev,self.path.stat().st_ino
            self.db.execute('PRAGMA journal_mode=WAL');self.db.execute('PRAGMA synchronous=FULL')
            self.db.executescript('''CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS tasks(task_id TEXT PRIMARY KEY,identity TEXT NOT NULL,state TEXT NOT NULL,result TEXT,callback TEXT,next_retry REAL,source_key TEXT NOT NULL UNIQUE);
                CREATE TABLE IF NOT EXISTS attempts(attempt_id TEXT PRIMARY KEY,task_id TEXT NOT NULL,ordinal INTEGER NOT NULL,state TEXT NOT NULL,record TEXT NOT NULL,proxy_estimate TEXT,reference_usage_units INTEGER,UNIQUE(task_id,ordinal));
                CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,previous_hash TEXT NOT NULL,event_hash TEXT NOT NULL,payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS provider_identifiers(kind TEXT NOT NULL,value TEXT NOT NULL,attempt_id TEXT NOT NULL,PRIMARY KEY(kind,value));''')
            found = self.db.execute("SELECT value FROM metadata WHERE key='policy'").fetchone()
            if found is None:
                if existing:raise ValueError('Existing gateway policy missing; no reset')
                with self.transaction():
                    self.db.execute('INSERT INTO metadata VALUES(?,?)',('policy',a.canonical(self.policy).decode()))
                    self.db.executemany('INSERT INTO provider_identifiers VALUES(?,?,?)',self._provider_seed)
                    self._event({'kind':'gateway_opening','policy':self.policy})
                immutable(self.root,self.marker,{'journal':PATH,'policy_sha256':a.digest(self.policy),'opening_event_hash':self.db.execute('SELECT event_hash FROM events WHERE seq=1').fetchone()[0]})
            elif json.loads(found[0]) != self.policy:raise ValueError('Gateway route/phase changed; no implicit reset')
            self.marker_sha256 = hashlib.sha256(self.marker.read_bytes()).hexdigest();self.verify()
        except BaseException:
            if hasattr(self,'db'):self.db.close()
            fcntl.flock(self.lease,fcntl.LOCK_UN);os.close(self.lease);raise

    def _seed(self,key):
        raw = self._sources.get(key)
        return json.loads(raw) if raw is not None else {'prior_attempts':[],'completed':False,'unresolved_unknown':False,'next_cap':None,'next_retry':0}

    def register(self,task):
        a.validate_task(task,wire_ceiling_bytes=a.reviewed_wire_ceiling(task),output_ceiling=a.reviewed_output_ceiling(task));meta = task.get('metadata')or{}
        if (task['body']['service_tier'] != 'default' or str(meta.get('pmid')) not in self.allowed
                or meta.get('phase_id')!=a.PHASE_ID or meta.get('provider')!=PROVIDER):
            raise ValueError('Gateway default-tier finite-cohort task required')
        a.checked_ref(self.root,meta['source_ref']);key = source_key(task)
        identity = {'task_id':task['task_id'],'stage':task['stage'],'model':task['model'],'body_sha256':a.digest(task['body']),'metadata':meta}
        old = self.db.execute('SELECT * FROM tasks WHERE task_id=?',(task['task_id'],)).fetchone()
        if old:
            if json.loads(old['identity']) != identity:raise ValueError('Gateway task identity changed')
            return self.task(task['task_id'])
        if self.db.execute('SELECT 1 FROM tasks WHERE source_key=?',(key,)).fetchone():raise a.BudgetBlocked('Resume the existing logical-source gateway task; do not create another ID')
        if any(meta.get(k)is not None for k in ('enum_repair','finite_recovery')):raise ValueError('A repair must amend its existing logical task, never register a fresh task')
        prior = self._seed(key);resolved = (str(meta['pmid']),task['stage']) in self._resolved
        state = ('blocked_prior_completed_source' if prior['completed'] or resolved
            else 'held_prior_unknown_send' if prior['unresolved_unknown']
            else 'blocked_prior_attempts_exhausted' if len(prior['prior_attempts']) >= 3 else 'pending')
        result = None;due = None
        if state == 'pending' and prior['next_cap'] and prior['next_cap'] > task['body']['max_output_tokens']:
            state='retry_wait';result={'status':'carried_direct_scheduling_only','retry_request_max_output_tokens':prior['next_cap'],'native_gateway_response':False};due=prior['next_retry']
        value={'identity':identity,'state':state,'result':result,'callback':None,'next_retry':due,'source_key':key}
        with self.transaction():
            self.db.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?,?)',(task['task_id'],a.canonical(identity).decode(),state,a.canonical(result).decode()if result is not None else None,None,due,key))
            self._event({'kind':'task','task_id':task['task_id'],**value})
        return self.task(task['task_id'])

    def current_task_ref(self,task_id):
        self._owner()
        for stored in self.db.execute("SELECT payload FROM events ORDER BY seq DESC"):
            item=json.loads(stored[0])
            if item.get('kind')in {'task_amend','task_recovery_amend'}and item['task_id']==task_id:
                ref=item['revised_task_ref'];a.checked_ref(self.root,ref);return ref
        path='data/current/tasks/'+task_id+'/task.json';raw=a.owned(self.root,path,exists=True).read_bytes()
        return {'path':path,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}

    def approved_retry_window(self,task_id):
        """New-contract window starts once on its first new reservation."""
        self._owner()
        if not any((self.task(task_id)['identity'].get('metadata')or{}).get(k)is not None for k in ('enum_repair','finite_recovery')):return None
        row=self.db.execute("SELECT seq,payload FROM events WHERE json_extract(payload,'$.kind') IN ('task_amend','task_recovery_amend') AND json_extract(payload,'$.task_id')=? ORDER BY seq DESC LIMIT 1",(task_id,)).fetchone()
        if row is None:raise ValueError('Repair identity lacks its committed amendment')
        amendment=json.loads(row['payload']);authority=json.loads(a.checked_ref(self.root,amendment['approval_ref']))
        first=self.db.execute("SELECT payload FROM events WHERE seq>? AND json_extract(payload,'$.kind')='reserve' AND json_extract(payload,'$.attempt.task_id')=? ORDER BY seq LIMIT 1",(row['seq'],task_id)).fetchone()
        start=None
        if first is not None:
            record=json.loads(first['payload'])['attempt'];value=record.get('repair_retry_window_started_at')
            if value!=record['reserved_at']:raise ValueError('First repair reservation window differs')
            start=datetime.fromisoformat(value).timestamp()
        return {'started_at':start,'started_at_iso':value if first is not None else None,'approval_ref':amendment['approval_ref'],'not_after':authority['not_after']}

    def retry_window_started_at(self,task_id):
        window=self.approved_retry_window(task_id)
        return window['started_at']if window else None

    def amend_task(self,task,approval_ref):
        from . import gateway_recovery as recovery
        authority=json.loads(a.checked_ref(self.root,approval_ref))
        if authority.get('record_kind')==recovery.KIND:return self._amend_source_recovery(task,approval_ref)
        self._owner();current=self.task(task['task_id'])
        if current['identity']==task_identity(task):
            # Idempotence is restricted to the SAME committed revision and approval.
            for stored in self.db.execute('SELECT payload FROM events ORDER BY seq DESC'):
                item=json.loads(stored[0])
                if item.get('kind')=='task_amend'and item['task_id']==task['task_id']:
                    if item['approval_ref']!=approval_ref:raise ValueError('Repair approval changed on resume')
                    validate_amended_task(self.root,task,approval_ref)
                    return {'task_id':task['task_id'],'old_identity_sha256':item['old_identity_sha256'],
                        'new_identity_sha256':a.digest(current['identity']),'revision_ref':item['revised_task_ref'],'state':current['state']}
            raise ValueError('Current repair identity has no committed amendment')
        if self.db.execute("SELECT 1 FROM attempts WHERE state IN ('reserved','started') LIMIT 1").fetchone():
            raise ValueError('Drain all model requests before applying finite schema amendments')
        proof=_check_repair_state(self.root,task,approval_ref,current,self.attempts_for(task['task_id']),self.policy['route_ref'])
        authority,row=proof['authority'],proof['entry'];stamp=datetime.fromisoformat(a.now())
        if not datetime.fromisoformat(authority['repair_retry_window_started_at'])<=stamp<datetime.fromisoformat(authority['not_after']):
            raise ValueError('Repair approval epoch/deadline is not current')
        result={'status':'approved_schema_repair_scheduling_only','retry_request_max_output_tokens':task['body']['max_output_tokens'],
            'native_gateway_response':False,'prior_result_sha256':a.digest(current['result'])}
        # Old native result/callback remain immutable in finish/callback events.
        value={'identity':task_identity(task),'state':'retry_wait','result':result,'callback':None,
            'next_retry':max(current.get('next_retry')or 0,stamp.timestamp()),'source_key':current['source_key']}
        with self.transaction():
            self.db.execute('UPDATE tasks SET identity=?,state=?,result=?,callback=NULL,next_retry=? WHERE task_id=?',
                (a.canonical(value['identity']).decode(),value['state'],a.canonical(result).decode(),value['next_retry'],task['task_id']))
            self._event({'kind':'task_amend','task_id':task['task_id'],'approval_ref':approval_ref,
                'old_identity_sha256':a.digest(current['identity']),'revised_task_ref':row['revised_task_ref'],
                'global_attempt_count':len(self.attempts_for(task['task_id'])),'applied_at':stamp.isoformat(),'value':value})
        return {'task_id':task['task_id'],'old_identity_sha256':a.digest(current['identity']),
            'new_identity_sha256':a.digest(value['identity']),'revision_ref':row['revised_task_ref'],'state':value['state']}

    def attempts_for(self,task_id):
        current=self.task(task_id);prior=self._seed(current['source_key'])['prior_attempts']
        local=[{**dict(r),'record':json.loads(r['record'])}for r in self.db.execute('SELECT * FROM attempts WHERE task_id=? ORDER BY ordinal',(task_id,))]
        return json.loads(a.canonical(prior))+local

    def _amend_source_recovery(self,task,approval_ref):
        from . import gateway_recovery as recovery
        self._owner();current=self.task(task['task_id'])
        if current['identity']==task_identity(task):
            for stored in self.db.execute('SELECT payload FROM events ORDER BY seq DESC'):
                item=json.loads(stored[0])
                if item.get('kind')==recovery.EVENT and item['task_id']==task['task_id']:
                    if item['approval_ref']!=approval_ref:raise ValueError('Finite recovery approval changed on resume')
                    recovery.validate_recovery_task(self.root,task,approval_ref)
                    return {'task_id':task['task_id'],'revision_ref':item['revised_task_ref'],'state':current['state']}
            raise ValueError('No committed finite recovery for this identity')
        if self.db.execute("SELECT1 FROM attempts WHERE state IN ('reserved','started') LIMIT1".replace('SELECT1','SELECT 1').replace('LIMIT1','LIMIT 1')).fetchone():raise ValueError('Drain all model requests before finite amendments')
        proof=recovery.validate_state(self.root,task,approval_ref,current,self.attempts_for(task['task_id']),self.policy['route_ref'])
        stamp=datetime.fromisoformat(a.now())
        if stamp>=datetime.fromisoformat(proof['authority']['not_after']):raise ValueError('Original recovery deadline expired')
        result={'status':'approved_finite_source_recovery_scheduling_only','retry_request_max_output_tokens':task['body']['max_output_tokens'],
            'native_gateway_response':False,'prior_result_sha256':a.digest(current['result'])}
        value={'identity':task_identity(task),'state':'retry_wait','result':result,'callback':None,
            'next_retry':max(current.get('next_retry')or 0,stamp.timestamp()),'source_key':current['source_key']}
        with self.transaction():
            self.db.execute('UPDATE tasks SET identity=?,state=?,result=?,callback=NULL,next_retry=? WHERE task_id=?',
                (a.canonical(value['identity']).decode(),value['state'],a.canonical(result).decode(),value['next_retry'],task['task_id']))
            self._event({'kind':recovery.EVENT,'task_id':task['task_id'],'approval_ref':approval_ref,
                'old_identity_sha256':a.digest(current['identity']),'revised_task_ref':proof['entry']['revised_task_ref'],
                'global_attempt_count':len(self.attempts_for(task['task_id'])),'applied_at':stamp.isoformat(),'value':value})
        return {'task_id':task['task_id'],'revision_ref':proof['entry']['revised_task_ref'],'state':'retry_wait'}

    def reserve(self,task,*,max_attempts,request_body=None):
        if (task.get('metadata',{}).get('finite_recovery')or{}).get('kind')=='user_approved_unknown_retry' and max_attempts!=2:
            raise ValueError('The informed-unknown retry must run with the exact two-attempt ceiling')
        if type(max_attempts)is not int or not 1<=max_attempts<=3:raise ValueError('Global three-attempt ceiling required')
        self.register(task);actual={**task,'body':request_body if request_body is not None else task['body']};quote=a.quote(actual)
        with self.transaction():
            current=self.task(task['task_id']);history=self.attempts_for(task['task_id'])
            if self.status()['frozen_reason']:raise a.BudgetBlocked(self.status()['frozen_reason'])
            if current['state']not in {'pending','retry_wait'}or len(history)>=max_attempts:raise a.BudgetBlocked('Prior source completed/held or global attempts exhausted')
            if any(r['state']in {'reserved','started'}for r in history):raise a.BudgetBlocked('Unknown prior send must be reconciled')
            if actual['body']!=task['body']:
                base=dict(task['body']);variant=dict(actual['body']);basecap=base.pop('max_output_tokens');cap=variant.pop('max_output_tokens');ceiling=task['metadata'].get('max_output_tokens_ceiling')
                if base!=variant or type(ceiling)is not int or not basecap<cap<=ceiling or current['state']!='retry_wait'or(current['result']or{}).get('retry_request_max_output_tokens')!=cap:raise ValueError('Unscheduled gateway body/cap variant')
            ordinal=len(history)+1;identifier='cornell-'+a.digest({'phase':a.PHASE_ID,'source':current['source_key'],'body':quote['body_sha256']})[:24]+'-a'+str(ordinal)
            record={'attempt_id':identifier,'task_id':task['task_id'],'ordinal':ordinal,'model':task['model'],'stage':task['stage'],'provider':PROVIDER,'account':ACCOUNT,'source_key':current['source_key'],'reference_quote':quote,'reserved_at':a.now(),'max_output_tokens':actual['body']['max_output_tokens'],'base_body_sha256':a.digest(task['body'])}
            window=self.approved_retry_window(task['task_id'])
            if window is not None:
                if datetime.fromisoformat(record['reserved_at'])>=datetime.fromisoformat(window['not_after']):raise ValueError('Original repair deadline expired')
                record['repair_retry_window_started_at']=record['reserved_at']if window['started_at']is None else window['started_at_iso']
            self.db.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)',(identifier,task['task_id'],ordinal,'reserved',a.canonical(record).decode(),None,None))
            self.db.execute('UPDATE tasks SET state=?,next_retry=NULL WHERE task_id=?',('running',task['task_id']))
            self._event({'kind':'reserve','attempt':record})
        return record

    def finish(self,attempt_id,result,*,retry_at=None):
        with self.transaction():
            row=self.db.execute('SELECT * FROM attempts WHERE attempt_id=?',(attempt_id,)).fetchone()
            if row is None or row['state']not in {'reserved','started'}:raise ValueError('Missing/already committed gateway attempt')
            record=json.loads(row['record']);ids=[];duplicates=[]
            for kind,value in [('request',result.get('provider_request_id')),('response',(result.get('response')or{}).get('id'))]:
                if isinstance(value,str)and value:
                    ids.append((kind,value));old=self.db.execute('SELECT attempt_id FROM provider_identifiers WHERE kind=? AND value=?',(kind,value)).fetchone()
                    if old and old[0]!=attempt_id:duplicates.append({'kind':kind,'value':value,'origin':old[0]})
                    else:self.db.execute('INSERT OR IGNORE INTO provider_identifiers VALUES(?,?,?)',(kind,value,attempt_id))
            integrity=(result.get('error')or{}).get('type')in {'returned_route_mismatch','returned_reasoning_mismatch','route_integrity_error','credential_echo_redacted'}
            cost_verified=cost_evidence(self.root,self.route['endpoint'],record,result)
            if result.get('artifacts') and not cost_verified:integrity=True
            if result.get('status') == 'completed':
                try:completed_route_proof(self.root,self.route['endpoint'],record,result)
                except (ValueError,KeyError,TypeError):integrity=True
            unknown_send=result.get('sent')is not False and result.get('http_status')is None
            integrity_problem = bool(duplicates or integrity or result.get('status')=='completed'and not ids)
            if integrity_problem:
                result.update(transport_status=result.get('status'),status='provider_problem',payload=None,error={'type':'duplicate_provider_identity'if duplicates else'missing_provider_identity'if not ids else'route_integrity_error','duplicates':duplicates});retry_at=None
                self.db.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)',('frozen_reason','Gateway response identity/route integrity requires review'))
            if unknown_send:retry_at=None
            state='cancelled_before_send'if result.get('sent')is False else'held_unknown_gateway_send'if unknown_send else'held_integrity'if integrity_problem else'committed_gateway_response'
            costs=cost_metadata(record,result,evidence_verified=cost_verified);record.update(finished_at=a.now(),result=result,cost_metadata=costs)
            taskstate='retry_wait'if retry_at is not None else'received'if result.get('status')=='completed'else'provider_hold'
            self.db.execute('UPDATE attempts SET state=?,record=?,proxy_estimate=?,reference_usage_units=? WHERE attempt_id=?',
                (state,a.canonical(record).decode(),costs['gateway_reported_proxy_estimate_usd'],costs['reference_OpenAI_standard_usage_estimate_units'],attempt_id))
            self.db.execute('UPDATE tasks SET state=?,result=?,next_retry=? WHERE task_id=?',(taskstate,a.canonical(result).decode(),retry_at,row['task_id']))
            self._event({'kind':'finish','attempt_id':attempt_id,'state':state,'task_state':taskstate,'result':result,'next_retry':retry_at,'cost_metadata':costs})
        return state

    def status(self):
        self._owner();reported=Decimal(0);known=unknown=0;reference=0
        for row in self.db.execute("SELECT proxy_estimate,reference_usage_units FROM attempts WHERE state NOT IN ('reserved','started','cancelled_before_send')"):
            cost=row['proxy_estimate']
            if cost is None:unknown+=1
            else:known+=1;reported+=Decimal(cost)
            estimate=row['reference_usage_units']
            if estimate is not None:reference+=estimate
        freeze=self.db.execute("SELECT value FROM metadata WHERE key='frozen_reason'").fetchone();head=self.db.execute('SELECT event_hash FROM events ORDER BY seq DESC LIMIT 1').fetchone()
        return {'as_of':a.now(),'phase_id':a.PHASE_ID,'provider':PROVIDER,'account':ACCOUNT,'frozen_reason':freeze[0]if freeze else None,'audit_head':head[0]if head else None,
            'gateway_local_cost_cap_usd':None,'phase_allowance_usd':None,'total_cap_usd':None,'phase_remaining_units':None,'total_remaining_units':None,
            'gateway_reported_proxy_estimate_usd':str(reported)if known else None,'gateway_cost_known_attempts':known,'gateway_cost_unknown_attempts':unknown,
            'reference_OpenAI_standard_usage_estimate_usd':a.usd(reference),'reference_estimate_is_not_gateway_invoice':True,'native_direct_openai_charges_created':0,
            'task_states':dict(self.db.execute('SELECT state,COUNT(*) FROM tasks GROUP BY state')),'attempt_states':dict(self.db.execute('SELECT state,COUNT(*) FROM attempts GROUP BY state')),
            'direct_journal_reference_only':self.route['direct_journal_head'],'no_new_native_allowance':True}

    def verify(self):
        self._owner();a.checked_ref(self.root,self.policy['route_ref'])
        if a.checked_ref(self.root,self.policy['switch_seed_ref']) != self._seed_bytes:raise ValueError('Gateway switch seed changed')
        previous='0'*64;tasks={};attempts={};repair_windows={};providers={(kind,value):origin for kind,value,origin in self._provider_seed};frozen=None
        for seq,row in enumerate(self.db.execute('SELECT * FROM events ORDER BY seq'),1):
            item=json.loads(row['payload'])
            if row['seq']!=seq or item['seq']!=seq or item['previous_hash']!=previous or row['previous_hash']!=previous or hashlib.sha256(row['payload'].encode()).hexdigest()!=row['event_hash']:raise ValueError('Gateway event chain changed')
            kind=item['kind']
            if kind=='gateway_opening':
                if seq!=1 or item['policy']!=self.policy:raise ValueError('Gateway opening policy changed')
            elif kind=='task':tasks[item['task_id']]={k:item[k]for k in ('identity','state','result','callback','next_retry','source_key')}
            elif kind=='task_amend':
                task=json.loads(a.checked_ref(self.root,item['revised_task_ref']))
                current=tasks[item['task_id']]
                prior=self._seed(current['source_key'])['prior_attempts']
                local=[{'attempt_id':key,**r}for key,r in attempts.items()if r['task_id']==item['task_id']]
                proof=_check_repair_state(self.root,task,item['approval_ref'],current,prior+local,self.policy['route_ref'])
                if (item['old_identity_sha256']!=a.digest(current['identity']) or item['global_attempt_count']!=len(prior)+len(local)
                        or item['revised_task_ref']!=proof['entry']['revised_task_ref']):raise ValueError('Amendment event identity/history differs')
                value=item['value'];expected_result={'status':'approved_schema_repair_scheduling_only',
                    'retry_request_max_output_tokens':task['body']['max_output_tokens'],'native_gateway_response':False,
                    'prior_result_sha256':a.digest(current['result'])}
                epoch=datetime.fromisoformat(proof['authority']['repair_retry_window_started_at']).timestamp()
                stamp=datetime.fromisoformat(item['applied_at']).timestamp()
                if (value!={'identity':task_identity(task),'state':'retry_wait','result':expected_result,'callback':None,
                        'next_retry':max(current.get('next_retry')or 0,stamp),'source_key':current['source_key']}
                        or not epoch<=stamp<=datetime.fromisoformat(item['timestamp']).timestamp()
                        or not stamp<datetime.fromisoformat(proof['authority']['not_after']).timestamp()):
                    raise ValueError('Amendment scheduling/deadline projection differs')
                tasks[item['task_id']]=value;repair_windows[item['task_id']]=None
            elif kind=='task_recovery_amend':
                from . import gateway_recovery as recovery
                task=json.loads(a.checked_ref(self.root,item['revised_task_ref']));current=tasks[item['task_id']]
                prior=self._seed(current['source_key'])['prior_attempts'];local=[{'attempt_id':key,**r}for key,r in attempts.items()if r['task_id']==item['task_id']]
                proof=recovery.validate_state(self.root,task,item['approval_ref'],current,prior+local,self.policy['route_ref'])
                stamp=datetime.fromisoformat(item['applied_at']).timestamp()
                result={'status':'approved_finite_source_recovery_scheduling_only','retry_request_max_output_tokens':task['body']['max_output_tokens'],
                    'native_gateway_response':False,'prior_result_sha256':a.digest(current['result'])}
                expected={'identity':task_identity(task),'state':'retry_wait','result':result,'callback':None,
                    'next_retry':max(current.get('next_retry')or 0,stamp),'source_key':current['source_key']}
                if (item['old_identity_sha256']!=a.digest(current['identity'])or item['global_attempt_count']!=len(prior)+len(local)
                        or item['revised_task_ref']!=proof['entry']['revised_task_ref']or item['value']!=expected
                        or stamp>datetime.fromisoformat(item['timestamp']).timestamp()
                        or stamp>=datetime.fromisoformat(proof['authority']['not_after']).timestamp()):raise ValueError('Finite recovery event/state/deadline differs')
                tasks[item['task_id']]=expected;repair_windows[item['task_id']]=None
            elif kind=='reserve':
                r=item['attempt']
                if r['base_body_sha256']!=tasks[r['task_id']]['identity']['body_sha256']:raise ValueError('Attempt body base does not match identity at event time')
                if r['task_id']in repair_windows:
                    start=repair_windows[r['task_id']]or r['reserved_at']
                    if r.get('repair_retry_window_started_at')!=start:raise ValueError('Repair retry window was reset')
                    repair_windows[r['task_id']]=start
                elif 'repair_retry_window_started_at'in r:raise ValueError('Unapproved retry window reset')
                prior=len(self._seed(r['source_key'])['prior_attempts']);local=sum(value['record']['source_key']==r['source_key'] for value in attempts.values())
                if r['ordinal'] != prior+local+1 or r['ordinal']>3:raise ValueError('Gateway logical-source global attempt ceiling changed')
                recovery_kind=(tasks[r['task_id']]['identity']['metadata'].get('finite_recovery')or{}).get('kind')
                if recovery_kind=='user_approved_unknown_retry' and r['ordinal']>2:
                    raise ValueError('Informed-unknown retry two-attempt ceiling changed during replay')
                attempts[r['attempt_id']]={'task_id':r['task_id'],'ordinal':r['ordinal'],'state':'reserved','record':r,'proxy_estimate':None,'reference_usage_units':None};tasks[r['task_id']].update(state='running',next_retry=None)
            elif kind=='started':attempts[item['attempt_id']]['state']='started'
            elif kind=='finish':
                r=attempts[item['attempt_id']];result=item['result'];record=r['record'];r['state']=item['state']
                duplicate=False
                for key,value in [('request',result.get('provider_request_id')),('response',(result.get('response')or{}).get('id'))]:
                    if isinstance(value,str)and value:
                        duplicate |= (key,value)in providers and providers[(key,value)]!=item['attempt_id'];providers.setdefault((key,value),item['attempt_id'])
                error=(result.get('error')or{}).get('type')
                if result.get('status')=='completed':completed_route_proof(self.root,self.route['endpoint'],record,result)
                if duplicate!=(error=='duplicate_provider_identity'):raise ValueError('Gateway duplicate identity projection changed')
                if error in {'duplicate_provider_identity','missing_provider_identity','route_integrity_error'}:frozen='Gateway response identity/route integrity requires review'
                for ref in result.get('artifacts',{}).values():a.checked_ref(self.root,ref)
                if item['cost_metadata']!=cost_metadata(record,result,evidence_verified=cost_evidence(self.root,self.route['endpoint'],record,result)):raise ValueError('Gateway reported/reference cost metadata changed')
                r.update(proxy_estimate=item['cost_metadata']['gateway_reported_proxy_estimate_usd'],reference_usage_units=item['cost_metadata']['reference_OpenAI_standard_usage_estimate_units'])
                record.update(result=result,cost_metadata=item['cost_metadata']);tasks[r['task_id']].update(state=item['task_state'],result=result,next_retry=item['next_retry'])
            elif kind=='callback':tasks[item['task_id']].update(state=item['state'],callback=item['value'])
            else:raise ValueError('Unknown gateway journal event')
            previous=row['event_hash']
        actual={r['attempt_id']:dict(r)for r in self.db.execute('SELECT * FROM attempts')}
        if set(actual)!=set(attempts):raise ValueError('Gateway attempt membership changed')
        for key,expected in attempts.items():
            row=actual[key];row.pop('attempt_id');record=json.loads(row.pop('record'));record.pop('finished_at',None)
            if row!={k:v for k,v in expected.items()if k!='record'}or record!=expected['record']:raise ValueError('Gateway attempt projection changed')
        observed={r['task_id']:self.task(r['task_id'])for r in self.db.execute('SELECT task_id FROM tasks')}
        if set(observed)!=set(tasks):raise ValueError('Gateway task membership changed')
        for key,value in observed.items():
            value.pop('task_id')
            if value!=tasks[key]:raise ValueError('Gateway task projection changed')
        metadata=dict(self.db.execute('SELECT key,value FROM metadata'))
        if json.loads(metadata.pop('policy','null'))!=self.policy or metadata.pop('frozen_reason',None)!=frozen or metadata:raise ValueError('Gateway metadata changed')
        if {(r['kind'],r['value']):r['attempt_id']for r in self.db.execute('SELECT * FROM provider_identifiers')}!=providers:raise ValueError('Gateway provider identity index changed')
        marker=json.loads(self.marker.read_bytes());opening=self.db.execute('SELECT event_hash FROM events WHERE seq=1').fetchone()
        if opening is None or marker!={'journal':PATH,'policy_sha256':a.digest(self.policy),'opening_event_hash':opening[0]}:raise ValueError('Gateway opening marker changed')
        return {'verified':True,'audit_head':previous,'gateway_attempts':len(attempts),'tasks':len(tasks),'status':self.status()}


Journal = GatewayJournal
