"""Publish the recorded source-fetch time without confusing it with export time.

Read public retrieval receipts only. This module never retrieves a document,
dispatches a model, or changes a scientific snapshot. Cache reads and publication
times cannot advance the timestamp. Receipt/body bindings stay in a local audit;
the browser receives only the timestamp and its meaning.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

from .io import atomic_json, canonical, digest, evidence_path, owned, reference


PUBLIC = 'website/dist/data/evidence_freshness.json'
BASIS = 'latest_successful_recorded_evidence_retrieval'
SCOPE = 'Recorded article, abstract and supplement retrievals; not a completed monthly literature-search date.'


def _date(value):
    if not isinstance(value, str):
        return None
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return result.astimezone(timezone.utc) if result.utcoffset() is not None else None
    except ValueError:
        return None


def _paths(root):
    # These directories contain public-source receipts, never model/API logs.
    for folder, pattern in [('data/sources/requests', '*/last_success.json'),
                            ('data/documents', '**/*.receipt.json'),
                            ('data/raw/non_llm_service', '*.receipt.json')]:
        yield from owned(root, folder).glob(pattern)


def _candidate(root, path):
    receipt = json.loads(evidence_path(root, path).read_bytes())
    if (not isinstance(receipt, dict) or receipt.get('status') != 200
            or receipt.get('error') or receipt.get('cache_reused')):
        return None
    request = receipt.get('request') or {}
    kind = str(receipt.get('kind') or receipt.get('document_kind') or request.get('document_kind') or '')
    # Identifier lookups, landing pages and bucket listings do not contain an
    # article/abstract/supplement, even when their HTTP status is successful.
    if not any(word in kind.casefold() for word in ('fulltext', 'abstract', 'supplement', 'publisher_pdf')):
        return None
    identity = receipt.get('identity') or request.get('report_id')
    url = receipt.get('url') or request.get('url')
    if not identity or not isinstance(url, str) or urlsplit(url).scheme not in {'http', 'https'}:
        return None
    timestamp = _date(receipt.get('received_at') or receipt.get('retrieved_at'))
    if timestamp is None:
        return None
    body = receipt.get('body') or {k: receipt.get(k) for k in ('path', 'sha256', 'bytes')}
    if (not isinstance(body, dict) or not isinstance(body.get('path'), str)
            or not re.fullmatch(r'[a-fA-F0-9]{64}', str(body.get('sha256', '')))
            or type(body.get('bytes')) is not int or body['bytes'] <= 0):
        return None
    body_path = evidence_path(root, body['path'])
    if not any(body_path.is_relative_to(owned(root, folder))
               for folder in ('data/sources/requests', 'data/documents', 'data/raw/non_llm_service')):
        return None
    return {'timestamp': timestamp, 'receipt_path': path, 'body_path': body_path,
            'body_ref': body, 'kind': kind, 'identity': str(identity)}


def project(root):
    """Return public metadata and its local proof using saved receipts only."""
    root = Path(root).resolve()
    candidates = []
    skipped = 0
    for path in _paths(root):
        try:
            item = _candidate(root, path)
            if item:
                candidates.append(item)
        except (OSError, ValueError, TypeError):
            skipped += 1
    selected = None
    invalid_bodies = []
    # Verify from newest to oldest; there is no need to rehash all old documents
    # just to establish the latest recorded retrieval time.
    for item in sorted(candidates, key=lambda x: (x['timestamp'], str(x['receipt_path'])), reverse=True):
        try:
            path = item['body_path']
            if path.stat().st_size != item['body_ref']['bytes']:
                raise ValueError('Body size differs from receipt')
            with path.open('rb') as handle:
                if hashlib.file_digest(handle, 'sha256').hexdigest() != item['body_ref']['sha256'].lower():
                    raise ValueError('Body hash differs from receipt')
            selected = item
            break
        except (OSError, ValueError) as exc:
            invalid_bodies.append({'receipt_path': str(item['receipt_path'].relative_to(root)),
                                   'reason': type(exc).__name__ + ': ' + str(exc)})
    public = {'schema_version': 1, 'last_information_fetch_at': selected['timestamp'].isoformat() if selected else None,
              'timestamp_basis': BASIS, 'scope': SCOPE}
    audit = {'public_metadata': public, 'eligible_receipt_candidates': len(candidates),
             'unreadable_or_malformed_receipts': skipped, 'newer_invalid_body_receipts': invalid_bodies,
             'source_receipt': reference(root, selected['receipt_path']) if selected else None,
             'source_body': selected['body_ref'] if selected else None,
             'source_kind': selected['kind'] if selected else None,
             'source_identity': selected['identity'] if selected else None,
             'network_requests': 0, 'model_requests': 0,
             'cache_reuse_or_export_time_changes_timestamp': False}
    return public, audit


def write(root, *, audit_directory='data/current/evidence_freshness'):
    root = Path(root).resolve()
    public, audit = project(root)
    audit_path = owned(root, Path(audit_directory) / (digest(canonical(audit)) + '.json'))
    atomic_json(audit_path, audit)
    atomic_json(owned(root, PUBLIC), public)
    return {'public_ref': reference(root, PUBLIC), 'audit_ref': reference(root, audit_path)}
