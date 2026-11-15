"""Cornell Responses route using the shared single-attempt transport."""
from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import re
import shlex
import stat
import urllib.error
import urllib.parse
import urllib.request

from .io import atomic_json, canonical, digest, now, owned, reference
from .transport import NativeTransport, Settings, send_once

KEY_NAMES = ('CORNELL_API_KEY', 'Cornell_API_Key')
BASE_NAMES = ('CORNELL_API_BASE_URL', 'API_BASE_URI', 'API_Base_URI', 'Cornell_API_Base_URL')


@dataclass(frozen=True)
class GatewaySettings(Settings):
    base_url: str = field(default='', repr=False)

    @property
    def responses_url(self):
        value = urllib.parse.urlsplit(self.base_url)
        if (value.scheme != 'https' or not value.hostname or value.username or value.password
                or value.query or value.fragment or value.port not in (None, 443)
                or not (value.hostname == 'cornell.edu' or value.hostname.endswith('.cornell.edu'))):
            raise ValueError('Configured Cornell HTTPS gateway required')
        path = value.path.rstrip('/')
        if path not in ('', '/v1'):
            raise ValueError('Configured gateway requires an origin or /v1 path')
        return urllib.parse.urlunsplit((value.scheme, value.netloc, '/v1/responses', '', ''))


def load_settings(root, *, timeout_seconds=1200):
    """Read the previously configured Cornell file without copying credentials."""
    path = Path(root).resolve().parent / 'MetaVir' / 'mykey.env'
    if path.parent.is_symlink() or path.parent.resolve() != path.parent:
        raise PermissionError('Cornell credential parent cannot be an alias')
    before = path.lstat()
    if (not stat.S_ISREG(before.st_mode) or stat.S_IMODE(before.st_mode) & 0o077
            or before.st_uid != os.getuid()):
        raise PermissionError('Cornell credential requires an owner-only regular file')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        after = os.fstat(fd)
        if ((after.st_dev, after.st_ino) != (before.st_dev, before.st_ino)
                or after.st_mode != before.st_mode or after.st_uid != before.st_uid):
            raise PermissionError('Cornell credential identity changed')
        with os.fdopen(fd, 'r', encoding='utf-8') as handle:
            fd = None
            content = handle.read(65537)
        if len(content) > 65536:
            raise ValueError('Cornell credential configuration is too large')
    finally:
        if fd is not None:
            os.close(fd)
    values = {}
    for line in content.splitlines():
        match = re.match(r'\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)', line)
        if not match or match[1] not in KEY_NAMES + BASE_NAMES:
            continue
        parts = shlex.split(match[2], comments=True)
        if match[1] in values or len(parts) != 1:
            raise ValueError('Exactly one configured value per Cornell variable required')
        values[match[1]] = parts[0]
    def choose(names):
        found = {values[name] for name in names if values.get(name)}
        if len(found) != 1:
            raise ValueError('One unambiguous Cornell configuration value required')
        return found.pop()
    result = GatewaySettings(choose(KEY_NAMES), timeout_seconds, choose(BASE_NAMES))
    result.responses_url
    return result


class GatewayTransport(NativeTransport):
    provider = 'cornell_openai_gateway'
    account = 'configured_Cornell_gateway'
    safe_headers = NativeTransport.safe_headers | {
        'x-litellm-call-id', 'x-litellm-model-id', 'x-litellm-model-group', 'x-litellm-version',
        'x-litellm-response-cost', 'x-litellm-response-cost-input', 'x-litellm-response-cost-output',
        'x-litellm-attempted-retries', 'x-litellm-attempted-fallbacks', 'x-litellm-max-retries'}

    def __init__(self, *, root, expected_endpoint, sender=None, settings_loader=load_settings, timeout_seconds=1200):
        self.expected_endpoint = expected_endpoint
        super().__init__(root=root, sender=sender, settings_loader=settings_loader, timeout_seconds=timeout_seconds)

    def endpoint(self, settings):
        endpoint = settings.responses_url
        if endpoint != self.expected_endpoint:
            raise ValueError('Configured Cornell endpoint changed after route approval')
        return endpoint

    def route_matches(self, task, data, *, completed):
        return (task['body']['service_tier'] == 'default'
                and data.get('model') in ((task['model'],) if completed else (None, task['model']))
                and data.get('service_tier') in (None, 'default'))

    def wire_for_task(self, task):
        from .accounting import validate_task, reviewed_wire_ceiling, reviewed_output_ceiling
        return validate_task(task, wire_ceiling_bytes=reviewed_wire_ceiling(task),
            output_ceiling=reviewed_output_ceiling(task))

    def send(self, task, attempt_id, artifact_dir, *, gate=None, on_sent=None):
        if task.get('body', {}).get('service_tier') != 'default':
            raise ValueError('Cornell requests require the explicitly configured default tier')
        return super().send(task, attempt_id, artifact_dir, gate=gate, on_sent=on_sent)


def verify_catalog(root, models, *, sender=send_once):
    """Read current model availability; never send a completion in preflight."""
    settings = load_settings(root, timeout_seconds=60)
    url = settings.responses_url.rsplit('/', 1)[0] + '/models'
    request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + settings.api_key, 'Accept': 'application/json'})
    with sender(request, timeout=settings.timeout_seconds) as response:
        if response.status != 200 or response.geturl() != url:
            raise ValueError('Cornell model catalog was not retrieved at its configured route')
        raw = response.read()
    if settings.api_key.encode() in raw:
        raise ValueError('Credential echo in model catalog; response discarded')
    value = json.loads(raw)
    available = {row.get('id') for row in value.get('data', []) if isinstance(row, dict)}
    if not set(models) <= available:
        raise ValueError('Required Sol/Luna models absent from current Cornell catalog')
    # Save only the required model presence, without credential or catalog extras.
    proof = {'record_kind': 'current_Cornell_model_catalog_check', 'as_of': now(),
             'provider': GatewayTransport.provider, 'models_present': sorted(set(models)),
             'completion_requests': 0, 'endpoint_path': '/v1/models', 'http_status': 200}
    root = Path(root).resolve()
    path = 'data/audits/gateway_preflight/' + digest(canonical(proof)) + '.json'
    atomic_json(owned(root, path), proof)
    return reference(root, path)
