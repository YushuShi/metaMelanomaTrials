"""One fixed-origin Responses HTTP attempt. No SDK, redirect, or hidden retry."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shlex
import stat
import urllib.error
import urllib.request

from .accounting import canonical, checked_ref, now, owned, validate_task

ENDPOINT = 'https://api.openai.com/v1/responses'
ACCOUNT = 'user_openaiApi_env_2026_10_30'
SAFE_HEADERS = {'x-request-id', 'retry-after', 'retry-after-ms', 'date', 'openai-processing-ms'}


@dataclass(frozen=True)
class Settings:
    api_key: str = field(repr=False)
    timeout_seconds: float = 1200

    def __post_init__(self):
        if (not self.api_key or self.api_key != self.api_key.strip()
                or any(ord(char) < 33 for char in self.api_key)):
            raise ValueError('Invalid private credential')
        if not 0 < float(self.timeout_seconds) <= 3600:
            raise ValueError('Positive HTTP timeout of at most one hour required')


def load_settings(root, *, timeout_seconds=1200):
    """Only the authorized owner-only project file, never process environment."""
    root = Path(root).resolve()
    path = owned(root, root / 'openaiApi.env', exists=True)
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or stat.S_IMODE(before.st_mode) != 0o600 or before.st_uid != os.getuid():
        raise PermissionError('Private credential requires owner-only regular file permissions')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        after = os.fstat(fd)
        if ((after.st_dev, after.st_ino) != (before.st_dev, before.st_ino)
                or not stat.S_ISREG(after.st_mode) or stat.S_IMODE(after.st_mode) != 0o600
                or after.st_uid != os.getuid()):
            raise PermissionError('Private credential identity changed')
        with os.fdopen(fd, 'r', encoding='utf-8') as handle:
            fd = None
            content = handle.read(65537)
        if len(content) > 65536:
            raise ValueError('Private credential configuration is too large')
    finally:
        if fd is not None:
            os.close(fd)
    values = []
    for line in content.splitlines():
        match = re.match(r'\s*(?:export\s+)?OPENAI_API\s*=\s*(.*)$', line)
        if match:
            try:
                parts = shlex.split(match[1], comments=True)
            except ValueError:
                raise ValueError('Invalid private credential configuration') from None
            if len(parts) != 1:
                raise ValueError('Exactly one private credential value required')
            values.extend(parts)
    if len(values) != 1:
        raise ValueError('Exactly one private credential entry required')
    return Settings(values[0], timeout_seconds)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def send_once(request, *, timeout):
    # Explicit empty proxies prevent a process-environment endpoint/proxy override.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    return opener.open(request, timeout=timeout)


def immutable(root, path, raw):
    path = owned(root, path)
    path.parent.mkdir(parents=True, exist_ok=True)
    owned(root, path)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as handle:
            fd = None
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        if fd is not None:
            os.close(fd)
    return {'path': str(path.relative_to(Path(root).resolve())), 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}


def extract_payload(response):
    texts = []
    for item in response.get('output', []):
        if isinstance(item, dict) and item.get('type') == 'message':
            for part in item.get('content', []):
                if isinstance(part, dict) and part.get('type') == 'output_text' and isinstance(part.get('text'), str):
                    texts.append(part['text'])
    if len(texts) != 1:
        raise ValueError('Expected exactly one structured output text')
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('Duplicate structured JSON key')
            result[key] = value
        return result
    value = json.loads(texts[0], object_pairs_hook=pairs,
                       parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))
    if not isinstance(value, dict):
        raise ValueError('Structured output must be one object')
    return value


def retryable(status, response, error):
    provider = response.get('error') or {}
    provider = provider if isinstance(provider, dict) else {}
    code = str(provider.get('code') or provider.get('type') or '').lower()
    if any(word in code for word in ('quota', 'billing', 'payment', 'permission', 'invalid_api_key', 'account_deactivated')):
        return False
    if error and error.get('type') in {'network_error', 'incomplete_http_body'}:
        return True
    return status in {408, 409, 429, 500, 502, 503, 504}


class NativeTransport:
    """Workers stage immutable artifacts; only the coordinator changes accounting."""
    automatic_retries = 0
    provider = 'openai'
    account = ACCOUNT
    safe_headers = SAFE_HEADERS

    def endpoint(self, settings):
        return ENDPOINT

    def route_matches(self, task, data, *, completed):
        return (data.get('model') == task['model'] and data.get('service_tier') == task['body']['service_tier']) if completed else (
            data.get('model') in (None, task['model']) and data.get('service_tier') in (None, task['body']['service_tier']))

    def wire_for_task(self, task):
        return validate_task(task)

    def __init__(self, *, root, sender=None, settings_loader=load_settings, timeout_seconds=1200):
        self.root = Path(root).resolve()
        self.sender = sender or send_once
        self.settings_loader = settings_loader
        self.timeout_seconds = timeout_seconds

    def send(self, task, attempt_id, artifact_dir, *, gate=None, on_sent=None):
        wire = self.wire_for_task(task)
        if not re.fullmatch('[A-Za-z0-9_.-]{1,128}', attempt_id):
            raise ValueError('Unsafe attempt identity')
        directory = owned(self.root, artifact_dir)
        if directory.exists():
            raise ValueError('Attempt directory already exists; reconcile instead of resending')
        if gate is not None and gate(task) is False:
            return {'status': 'not_sent', 'sent': False, 'error': {'type': 'dispatch_gate'}, 'usage': None, 'retryable': False}
        settings = self.settings_loader(self.root, timeout_seconds=self.timeout_seconds)
        endpoint = self.endpoint(settings)
        # Reject before saving or transmitting source that contains the credential.
        if settings.api_key.encode() in wire:
            raise ValueError('Credential material appears in source; request refused')
        directory.mkdir(parents=True, exist_ok=False)
        owned(self.root, directory, exists=True, directory=True)
        refs = {'request': immutable(self.root, directory / 'request.json', canonical({
            'attempt_id': attempt_id, 'task_id': task['task_id'], 'stage': task['stage'],
            'provider': self.provider, 'account': self.account, 'endpoint': endpoint, 'body': task['body'],
            'body_sha256': hashlib.sha256(wire).hexdigest(), 'automatic_retries': 0, 'redirects': False}))}
        request = urllib.request.Request(endpoint, data=wire, method='POST', headers={
            'Authorization': 'Bearer ' + settings.api_key, 'Content-Type': 'application/json', 'Accept': 'application/json'})
        started = now()
        status, raw, headers, error = None, b'', {}, None
        try:
            sent_event = {'event': 'http_attempt_started', 'attempt_id': attempt_id,
                          'task_id': task['task_id'], 'started_at': started, 'endpoint': endpoint,
                          'request_body_sha256': hashlib.sha256(wire).hexdigest(),
                          'provider_receipt_confirmed': False}
            refs['sent'] = immutable(self.root, directory / 'sent.json', canonical(sent_event))
            if on_sent is not None:
                on_sent({**sent_event, 'sent_ref': refs['sent']})
            try:
                response = self.sender(request, timeout=settings.timeout_seconds)
            except urllib.error.HTTPError as exc:
                response = exc
            with response:
                status = response.status if hasattr(response, 'status') else response.code
                if hasattr(response, 'geturl') and response.geturl() != endpoint:
                    raise ValueError('Response redirect refused')
                headers = {str(k).lower(): str(v) for k, v in response.headers.items()
                           if str(k).lower() in self.safe_headers or str(k).lower().startswith('x-ratelimit-')}
                raw = response.read()
        except http.client.IncompleteRead as exc:
            raw = exc.partial
            error = {'type': 'incomplete_http_body', 'message': 'Provider response ended before the declared body length'}
        except (OSError, TimeoutError, urllib.error.URLError) as exc:
            error = {'type': 'network_error', 'exception_type': type(exc).__name__, 'message': 'HTTP attempt failed; billing may be unresolved'}
        except ValueError:
            error = {'type': 'route_integrity_error', 'message': 'Fixed-origin response verification failed'}
        finished = now()
        # A server should never echo Authorization. If it does, save a labelled
        # redacted response rather than archiving a credential.
        redacted = settings.api_key.encode() in raw
        raw = raw.replace(settings.api_key.encode(), b'[REDACTED]')
        headers = {k: v.replace(settings.api_key, '[REDACTED]') for k, v in headers.items()}
        data = {}
        if raw:
            try:
                data = json.loads(raw)
                if not isinstance(data, dict):
                    raise ValueError()
            except (ValueError, UnicodeError):
                error = error or {'type': 'invalid_response_json'}
                data = {}
        payload = None
        if status == 200 and error is None:
            if not self.route_matches(task, data, completed=True):
                error = {'type': 'returned_route_mismatch', 'requested_service_tier': task['body']['service_tier'],
                         'returned_service_tier': data.get('service_tier')}
            elif not isinstance(data.get('reasoning') or {}, dict) or (data.get('reasoning') or {}).get('effort') not in (None, task['body']['reasoning']['effort']):
                error = {'type': 'returned_reasoning_mismatch'}
            elif data.get('status') != 'completed':
                error = {'type': 'incomplete_output', 'details': data.get('incomplete_details')}
            else:
                try:
                    payload = extract_payload(data)
                except (ValueError, TypeError, KeyError):
                    error = {'type': 'invalid_structured_output'}
        elif error is None:
            if not self.route_matches(task, data, completed=False):
                error = {'type': 'returned_route_mismatch', 'requested_service_tier': task['body']['service_tier'],
                         'returned_service_tier': data.get('service_tier')}
            else:
                error = {'type': 'http_error', 'http_status': status, 'provider_error': data.get('error')}
        if redacted:
            payload = None
            error = {'type': 'credential_echo_redacted'}
        refs['raw_response'] = immutable(self.root, directory / 'response.body', raw)
        result = {'attempt_id': attempt_id, 'task_id': task['task_id'], 'provider': self.provider, 'account': self.account, 'status': 'completed' if error is None else 'provider_problem',
                  'sent': True, 'http_status': status, 'started_at': started, 'finished_at': finished,
                  'payload': payload, 'response': data, 'usage': data.get('usage') if isinstance(data.get('usage'), dict) else None,
                  'headers': headers, 'error': error, 'retryable': retryable(status, data, error),
                  'provider_request_id': headers.get('x-request-id') or data.get('id'), 'artifacts': refs,
                  'request_body_sha256': hashlib.sha256(wire).hexdigest(), 'max_output_tokens': task['body']['max_output_tokens'],
                  'requested_service_tier': task['body']['service_tier'], 'returned_service_tier': data.get('service_tier'),
                  'response_redaction_changed': redacted, 'caller_http_attempts': 1, 'automatic_retries': 0}
        refs['result'] = immutable(self.root, directory / 'result.json', canonical(result))
        refs['receipt'] = immutable(self.root, directory / 'receipt.json', canonical({
            'attempt_id': attempt_id, 'task_id': task['task_id'], 'provider': self.provider, 'account': self.account,
            'model': task['model'], 'endpoint': endpoint, 'started_at': started, 'finished_at': finished,
            'requested_service_tier': task['body']['service_tier'], 'returned_service_tier': data.get('service_tier'),
            'http_status': status, 'status': result['status'], 'provider_request_id': result['provider_request_id'],
            'usage': result['usage'], 'artifacts': dict(refs), 'error': error, 'caller_http_attempts': 1,
            'automatic_retries': 0, 'redirects': False}))
        result['artifacts'] = dict(refs)
        return result

