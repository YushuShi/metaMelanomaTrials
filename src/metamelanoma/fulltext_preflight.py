"""Credential-safe Cornell token counting; this never creates a completion."""
from pathlib import Path
import json
import urllib.error
import urllib.request

from .gateway import load_settings
from .io import canonical, digest, now, owned, verified_json
from .reextraction import immutable_json, _endpoint
from .transport import send_once


def count_input(root, pmid, body, *, sender=send_once, settings_loader=load_settings):
    root = Path(root).resolve()
    if (not str(pmid).isdigit() or body.get('model') != 'gpt-6-luna'
            or body.get('reasoning') != {'effort': 'xhigh'}
            or body.get('max_output_tokens') != 32768
            or body.get('service_tier') != 'default' or body.get('store') is not False):
        raise ValueError('Exact initial Luna xhigh R3 request required for input counting')
    data = json.loads(body['input'])
    if data.get('stage') != 'R3' or str(data.get('pmid')) != str(pmid):
        raise ValueError('Token count must belong to the supplied R3 article')
    wire = canonical(body)
    if len(wire) > 6000000:
        raise ValueError('Whole request exceeds the reviewed absolute wire bound')
    identity = digest(wire)
    directory = f'data/audits/fulltext_token_counts/{pmid}/{identity}'
    existing = owned(root, directory + '/proof.json')
    if existing.exists():
        from .io import reference
        proof = json.loads(existing.read_text())
        if (proof.get('request_body_sha256') != identity or proof.get('pmid') != str(pmid)
                or verified_json(root, proof['count_request_ref']) != body):
            raise ValueError('Existing token-count proof differs')
        response = verified_json(root, proof['count_response_ref'])
        if response.get('input_tokens') != proof.get('input_tokens'):
            raise ValueError('Existing token-count response differs')
        return reference(root, existing)
    settings = settings_loader(root, timeout_seconds=60)
    endpoint = settings.responses_url + '/input_tokens'
    if settings.responses_url != _endpoint(root):
        raise ValueError('Configured Cornell route changed')
    if settings.api_key.encode() in wire:
        raise ValueError('Credential appeared in count payload; request refused')
    request_ref = immutable_json(root, directory + '/request.json', body)
    request = urllib.request.Request(endpoint, data=wire, method='POST', headers={
        'Authorization': 'Bearer ' + settings.api_key, 'Content-Type': 'application/json',
        'Accept': 'application/json'})
    started = now()
    try:
        response = sender(request, timeout=60)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        if response.geturl() != endpoint:
            raise ValueError('Token-count redirect refused')
        status = response.status
        raw = response.read()
    if settings.api_key.encode() in raw:
        raise ValueError('Credential echo discarded')
    result = json.loads(raw)
    response_ref = immutable_json(root, directory + '/response.json', result)
    if (status != 200 or result.get('object') != 'response.input_tokens'
            or type(result.get('input_tokens')) is not int or result['input_tokens'] < 1):
        immutable_json(root, directory + '/failure.json', {'started_at': started,
            'finished_at': now(), 'http_status': status, 'count_response_ref': response_ref,
            'completion_requests': 0})
        raise ValueError('Cornell did not return a successful input-token count')
    proof = {'record_kind': 'Cornell_R3_input_token_count', 'pmid': str(pmid),
        'model': 'gpt-6-luna', 'endpoint': endpoint, 'http_status': status,
        'object': result['object'], 'input_tokens': result['input_tokens'],
        'request_body_sha256': identity, 'count_request_ref': request_ref,
        'count_response_ref': response_ref, 'completion_requests': 0,
        'started_at': started, 'as_of': now()}
    return immutable_json(root, directory + '/proof.json', proof)
