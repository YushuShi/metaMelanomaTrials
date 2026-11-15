"""Pure, finite proof/projectors for an inactive accounting amendment proposal."""
from datetime import datetime, timezone
import json

from . import accounting as a

RECONCILE_KIND = 'current_phase_known_flex_usage_amendment'
RETRY_KIND = 'finite_known_first_retry_approval'



def approval(root, ref, kind):
    value = json.loads(a.checked_ref(root, ref))
    if (value.get('record_kind') != kind or value.get('status') != 'approved'
            or value.get('phase_id') != a.PHASE_ID
            or value.get('baseline_usd') != a.BASELINE_USD
            or value.get('allowance_usd') != a.ALLOWANCE_USD
            or value.get('total_cap_usd') != a.TOTAL_CAP_USD
            or value.get('native_and_scientific_outputs_unchanged') is not True):
        raise ValueError('Exact approved current-phase amendment without a budget reset required')
    rows = value.get('attempts')
    if (not isinstance(rows, list) or not rows
            or any(not isinstance(row, dict) or not isinstance(row.get('attempt_id'), str) for row in rows)
            or len({row['attempt_id'] for row in rows}) != len(rows)):
        raise ValueError('Finite unique attempt approval required')
    if kind == RETRY_KIND:
        if (len({row.get('task_id') for row in rows}) != len(rows)
                or any(not isinstance(row.get('task_id'), str) or not isinstance(row.get('pmid'), str)
                    or not row['pmid'] for row in rows)
                or value.get('max_attempts') != 3):
            raise ValueError('Finite unique exact-source first-attempt retry approval required')
        deadline = datetime.fromisoformat(value['not_after_utc'].replace('Z', '+00:00'))
        if deadline.tzinfo is None:
            raise ValueError('Inherited retry deadline must include timezone')
        original = json.loads(a.checked_ref(root, value['original_authorization']))
        if (original.get('phase_id') != a.PHASE_ID
                or original.get('not_after_utc') != value['not_after_utc']
                or original.get('max_attempts') != 3
                or original.get('additional_budget_usd') != a.ALLOWANCE_USD
                or original.get('total_cap_usd') != a.TOTAL_CAP_USD):
            raise ValueError('Retry authority must inherit the exact original deadline, attempts and cap')
    return value, {row['attempt_id']: row for row in rows}


def known_incomplete(root, record):
    """Re-hash original native proofs; a truncated payload is never promoted."""
    result = record.get('result') or {}
    if (record.get('requested_service_tier') != 'flex'
            or record.get('flex_pricing_proof') != a.FLEX_PRICING_REF
            or (result.get('error') or {}).get('type') != 'incomplete_output'
            or ((result.get('error') or {}).get('details') or {}).get('reason') != 'max_output_tokens'
            or result.get('status') != 'provider_problem' or result.get('payload') is not None
            or result.get('sent') is not True or result.get('http_status') != 200
            or result.get('response_redaction_changed') is not False):
        raise ValueError('Only source-preserved native Flex max-output incompletes are eligible')
    refs = result.get('artifacts') or {}
    required = {'request', 'raw_response', 'receipt', 'result', 'sent'}
    if set(refs) != required:
        raise ValueError('Complete original request/response/receipt/result/send proofs required')
    files = {key: json.loads(a.checked_ref(root, ref)) for key, ref in refs.items()}
    request, raw, receipt, saved, sent = (files[key] for key in ('request', 'raw_response', 'receipt', 'result', 'sent'))
    if raw != result.get('response') or raw.get('usage') != result.get('usage'):
        raise ValueError('Projected usage/response differs from the exact raw native response')
    if (raw.get('model') != record['model'] or raw.get('service_tier') != 'flex'
            or raw.get('status') != 'incomplete'
            or (raw.get('incomplete_details') or {}).get('reason') != 'max_output_tokens'
            or not isinstance(raw.get('id'), str) or not raw['id']
            or not isinstance(result.get('provider_request_id'), str) or not result['provider_request_id']):
        raise ValueError('Exact native identity, route, tier and incomplete reason required')
    body = request.get('body')
    if (not isinstance(body, dict) or request.get('provider') != 'openai'
            or request.get('account') != 'user_openaiApi_env_2026_10_30'
            or request.get('endpoint') != 'https://api.openai.com/v1/responses'
            or body.get('service_tier') != 'flex' or body.get('model') != record['model']
            or body.get('reasoning') != {'effort': 'high'}
            or body.get('max_output_tokens') != record['max_output_tokens']
            or a.digest(body) != record['quote']['body_sha256']
            or request.get('body_sha256') != a.digest(body)
            or result.get('request_body_sha256') != a.digest(body)):
        raise ValueError('Original fixed-route request and quote do not match native usage')
    for key in ('attempt_id', 'task_id'):
        if any(value.get(key) != record[key] for value in (request, receipt, saved, sent)):
            raise ValueError('Original call proof belongs to a different attempt/task')
    for key in ('response', 'usage', 'request_body_sha256', 'provider_request_id', 'error', 'payload', 'status'):
        if saved.get(key) != result.get(key):
            raise ValueError('Stored pre-accounting result differs from the committed native result')
    if (receipt.get('usage') != raw['usage'] or receipt.get('provider_request_id') != result['provider_request_id']
            or receipt.get('http_status') != 200 or receipt.get('error') != result['error']
            or sent.get('request_body_sha256') != a.digest(body)):
        raise ValueError('Native receipt/send proof differs')
    usage = raw['usage']
    if (not isinstance(usage, dict)
            or any(type(usage.get(key)) is not int or usage[key] < 0 for key in ('input_tokens', 'output_tokens', 'total_tokens'))
            or usage['total_tokens'] != usage['input_tokens'] + usage['output_tokens']):
        raise ValueError('Consistent explicit native token totals required')
    output_details = usage.get('output_tokens_details') or {}
    if (not isinstance(output_details, dict)
            or type(output_details.get('reasoning_tokens', 0)) is not int
            or not 0 <= output_details.get('reasoning_tokens', 0) <= usage['output_tokens']):
        raise ValueError('Native reasoning usage exceeds output usage')
    details = usage.get('input_tokens_details') or {}
    writes = details.get('cache_write_tokens') if isinstance(details, dict) else None
    if writes is not None:
        ttl = details.get('cache_write_tokens_details')
        if (not isinstance(ttl, dict) or type(ttl.get('ttl_30m_tokens')) is not int
                or ttl['ttl_30m_tokens'] != writes or ttl.get('ttl_12h_tokens', 0) != 0):
            raise ValueError('Exact reviewed cache-write lifetime breakdown required')
    a.checked_ref(root, a.FLEX_PRICING_REF)
    pricing = a.settlement_pricing(record, result)
    cost = pricing['usage_liability_units']
    if (pricing != record.get('settlement_pricing') or pricing['verified_flex_usage'] is not True
            or type(cost) is not int or not 0 <= cost <= record['quote']['liability_units']):
        raise ValueError('Known bounded Flex usage and original pricing proof required')
    return {'attempt_id': record['attempt_id'], 'task_id': record['task_id'],
            'reconciliation_type': 'incomplete_known_usage',
            'record_sha256': a.digest({key: value for key, value in record.items() if key != 'finished_at'}),
            'record_digest_excludes_only_finished_at_audit_metadata': True,
            'before_liability_units': record['quote']['liability_units'],
            'after_liability_units': cost, 'native_artifacts': refs, 'pricing': pricing}


def known_resource_unavailable(root, record):
    result = record.get('result') or {};refs = result.get('artifacts') or {}
    if (record.get('requested_service_tier') != 'flex' or record.get('flex_pricing_proof') != a.FLEX_PRICING_REF
            or result.get('status') != 'provider_problem' or result.get('payload') is not None
            or result.get('http_status') != 429 or result.get('sent') is not True
            or (result.get('error') or {}).get('type') != 'http_error'
            or result.get('response_redaction_changed') is not False
            or set(refs) != {'request', 'raw_response', 'receipt', 'result', 'sent'}):
        raise ValueError('Only original native Flex HTTP429 resource-unavailable proofs may settle zero')
    files = {key: json.loads(a.checked_ref(root, ref)) for key, ref in refs.items()}
    request, raw, receipt, saved, sent = (files[key] for key in ('request', 'raw_response', 'receipt', 'result', 'sent'))
    error = raw.get('error') or {}
    if (not isinstance(error, dict) or not (error.get('code') == 'resource_unavailable'
            or error.get('code') == 'flex_unavailable' and error.get('type') == 'resource_unavailable')
            or raw != result.get('response') or raw.get('usage') != result.get('usage')
            or not a.zero_reported_usage(raw.get('usage')) or not a.zero_reported_usage(result.get('usage'))):
        raise ValueError('Exact capacity error plus absent or strict all-zero native usage required')
    body = request.get('body')
    if (not isinstance(body, dict) or request.get('provider') != 'openai'
            or request.get('account') != 'user_openaiApi_env_2026_10_30'
            or request.get('endpoint') != 'https://api.openai.com/v1/responses'
            or body.get('service_tier') != 'flex' or body.get('model') != record['model']
            or body.get('reasoning') != {'effort': 'high'}
            or body.get('max_output_tokens') != record['max_output_tokens']
            or a.digest(body) != record['quote']['body_sha256']
            or request.get('body_sha256') != a.digest(body)
            or result.get('request_body_sha256') != a.digest(body)
            or raw.get('model') not in (None, record['model']) or raw.get('service_tier') not in (None, 'flex')
            or not isinstance(result.get('provider_request_id'), str) or not result['provider_request_id']):
        raise ValueError('Fixed reviewed request, native error route and request identity required')
    for key in ('attempt_id', 'task_id'):
        if any(value.get(key) != record[key] for value in (request, receipt, saved, sent)):
            raise ValueError('Capacity proof belongs to a different attempt/task')
    for key in ('response', 'usage', 'request_body_sha256', 'provider_request_id', 'error', 'payload', 'status'):
        if saved.get(key) != result.get(key):
            raise ValueError('Original capacity result differs from its committed history')
    if (receipt.get('http_status') != 429 or receipt.get('usage') != result.get('usage')
            or receipt.get('provider_request_id') != result['provider_request_id']
            or sent.get('request_body_sha256') != a.digest(body)):
        raise ValueError('Capacity receipt/send proof differs')
    a.checked_ref(root, a.FLEX_PRICING_REF)
    pricing = a.settlement_pricing(record, result)
    if pricing['resource_unavailable_uncharged'] is not True:
        raise ValueError('Capacity zero-charge proof failed')
    return {'attempt_id': record['attempt_id'], 'task_id': record['task_id'],
        'reconciliation_type': 'resource_unavailable_uncharged',
        'record_sha256': a.digest({key: value for key, value in record.items() if key != 'finished_at'}),
        'record_digest_excludes_only_finished_at_audit_metadata': True,
        'before_liability_units': record['quote']['liability_units'], 'after_liability_units': 0,
        'native_artifacts': refs, 'pricing': pricing}


def known_usage(root, record):
    if (record.get('result', {}).get('error') or {}).get('type') == 'incomplete_output':
        return known_incomplete(root, record)
    return known_resource_unavailable(root, record)


def reconciliation_projection(root, ref, expected_attempt, attempt_id):
    _, approved = approval(root, ref, RECONCILE_KIND)
    proof = known_usage(root, expected_attempt['record'])
    expected_state = ('held_incomplete_usage' if proof['reconciliation_type'] == 'incomplete_known_usage'
        else 'held_unknown_usage')
    if (expected_attempt['state'] != expected_state
            or expected_attempt['liability'] != expected_attempt['reservation']
            or proof != approved.get(attempt_id)):
        raise ValueError('Reconciliation differs from the exact held attempt and approved amount')
    return proof


def retry_details(root, task, attempt, attempt_count):
    """Only proven first-response truncation/capacity failures enter a finite list."""
    record = attempt['record'];task_id = record['task_id'];identity = task['identity']
    pmid = identity.get('metadata', {}).get('pmid')
    if (not isinstance(pmid, str) or not pmid
            or record.get('stage') != 'R2' or record.get('model') != a.MODELS['R2']
            or task['state'] != 'provider_hold' or attempt_count != 1 or record['ordinal'] != 1
            or record['max_output_tokens'] != 8192
            or identity.get('metadata', {}).get('max_output_tokens_ceiling') != 16384
            or (task.get('result') or {}) != record['result']):
        raise ValueError('Only exact-source current first-attempt R2 8k holds may be proposed')
    proof = known_usage(root, record)
    if proof['reconciliation_type'] == 'incomplete_known_usage':
        if attempt['state'] not in {'held_incomplete_usage', 'settled_known_flex_usage_upper_bound'}:
            raise ValueError('Truncation projection is not eligible')
        next_cap, retry_type = 16384, 'increased_output_cap'
    else:
        if attempt['state'] not in {'held_unknown_usage', 'settled_known_flex_usage_upper_bound', 'settled_flex_resource_unavailable_no_charge'}:
            raise ValueError('Capacity projection is not eligible')
        next_cap, retry_type = 8192, 'resource_unavailable'
    saved = json.loads(a.checked_ref(root, record['result']['artifacts']['result']))
    if saved.get('headers') != record['result'].get('headers'):
        raise ValueError('Retry-After differs from its saved original response headers')
    from .execution import retry_delay
    finished = datetime.fromisoformat(record['result']['finished_at']).timestamp()
    not_before = finished + retry_delay(saved.get('headers') or {}, 1,
        clock=lambda: finished, jitter=lambda *_: 0)
    expected = {'attempt_id': record['attempt_id'], 'task_id': task_id,
                'pmid': pmid,
                'record_sha256': proof['record_sha256'], 'task_identity_sha256': a.digest(identity),
                'next_max_output_tokens': next_cap, 'retry_type': retry_type, 'not_before_timestamp': not_before}
    return expected, {**record['result'], 'retry_request_max_output_tokens': next_cap,
            'retry_kind': 'finite_resume_' + retry_type}


def retry_projection(root, ref, task, attempt, attempt_count):
    _, approved = approval(root, ref, RETRY_KIND)
    expected, result = retry_details(root, task, attempt, attempt_count)
    if expected != approved.get(attempt['record']['attempt_id']):
        raise ValueError('Finite retry approval differs from preserved task/attempt identity')
    return result
