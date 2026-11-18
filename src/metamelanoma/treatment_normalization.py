"""Publish reproducible treatment projections through the shared JS resolver.

This stage has no article retrieval, model transport, screening or statistical
calculation. Its inputs are retained source records and the curated registry.
"""
from __future__ import annotations

from contextlib import contextmanager
import csv
import fcntl
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys

from .io import atomic_bytes, canonical, digest, owned

SOURCE = 'website/dist/data/quantitative_extraction.json'
REGISTRY = 'config/treatment_registry.json'
GENERATED_REGISTRY = 'website/dist/treatment_registry.js'
PUBLIC = 'website/dist/data/treatment_normalizations.json'
QUEUE = 'website/dist/data/treatment_review_queue.json'
QUEUE_CSV = 'website/dist/data/treatment_review_queue.csv'
AUDIT_PUBLIC = 'website/dist/data/treatment_normalization_audit.json'
RUNNER = 'website/scripts/treatment_normalization.cjs'
EXTRACTION_INSTRUCTIONS = '''
TREATMENT NAME EVIDENCE: Preserve exact complete reported product names, development-code digits, brands, formulation/salt words and source-defined aliases in the raw arm labels and component nodes. Keep both intervention and comparator components, source-backed AND/OR/sequential relationships, separate dose/route/schedule and their supporting spans. A generic IL-2, GM-CSF, interferon alfa, checkpoint class or TIL label does not establish a particular product. Never correct a near-matching development code or infer an agent from a substring. Distinguish active patient treatment from matched placebo, negation, prior treatment/resistance, conditioning, vaccine adjuvants and ex-vivo preparation; preserve that role and timing in the exact arm label and supporting evidence rather than inventing an extra schema field. Keep a modified cellular/vaccine product whole; its manufacturing reagents are not automatically administered drugs. Proposed identities and classes are provisional: the verified registry and evidence-backed manual adjudications are applied deterministically after extraction, without changing raw source wording.
'''


def registry_javascript(registry):
    """The browser consumes the exact curated object used by the Node build."""
    body = json.dumps(registry, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    return ('/* Generated from config/treatment_registry.json; edit the authoritative JSON, then reconcile. */\n'
            '(function(root,factory){if(typeof module==="object"&&module.exports)module.exports=factory();else root.TreatmentRegistry=factory();})'
            '(typeof globalThis!=="undefined"?globalThis:this,function(){return ' + body + ';});\n').encode()


def projection_paths(source_path):
    """An inactive legacy refresh must not replace the current compact sidecar."""
    if source_path.endswith('/clinical_evidence.json'):
        return tuple(path.replace('/treatment_', '/clinical_treatment_') for path in (PUBLIC, QUEUE, QUEUE_CSV, AUDIT_PUBLIC))
    return PUBLIC, QUEUE, QUEUE_CSV, AUDIT_PUBLIC


def _input(payload, source_bytes, source_path, registry, previous, baseline_labels):
    clinical = payload if payload.get('record_kind') == 'canonical_clinical_evidence' else payload.get('clinical_evidence', {})
    if clinical.get('record_kind') != 'canonical_clinical_evidence':
        raise ValueError('Treatment normalization needs the validated clinical export')
    records = []
    if clinical is not payload:
        for article in payload.get('articles', []):
            for review in article.get('records', []):
                raw = review['record']
                binding = digest(canonical({'task_id': review['task_id'], 'record': raw}))
                records.append({'pmid': str(article['pmid']), 'report_id': raw['report_id'],
                    'stage': review.get('stage', raw.get('stage')), 'source_sha256': raw['source_sha256'],
                    'task_id': review['task_id'], 'review_binding_sha256': binding,
                    'arms': raw.get('arms', [])})
    # Numerical arrays never enter this classification stage. Source-bound raw
    # arm graphs and clinical comparison definitions are sufficient.
    reduced = {**{key: clinical.get(key) for key in ('record_kind', 'content_sha256', 'evidence_registry')},
        'articles': [{key: article.get(key) for key in ('pmid', 'report_id', 'current_main_eligible', 'comparisons')}
                     for article in clinical.get('articles', [])]}
    return {'registry': registry, 'records': records, 'clinical': reduced,
        'source_file_sha256': digest(source_bytes), 'source_path': source_path,
        'previous': previous, 'baseline_labels': baseline_labels}


def build(root, payload, *, source_bytes, source_path=SOURCE, registry_path=REGISTRY,
          previous=None, baseline_labels=None):
    root = Path(root).resolve()
    registry_bytes = owned(root, registry_path).read_bytes()
    registry = json.loads(registry_bytes)
    code_paths = [RUNNER, 'website/scripts/build_drug_type_review.cjs', *[
        'website/dist/' + name + '.js' for name in ('treatment_resolver', 'treatment_groups', 'regimen_definitions', 'regimen_source_rules')]]
    code_before = {relative: owned(root, relative).read_bytes() for relative in code_paths}
    version = registry.get('version', '')
    if not isinstance(version, str) or not re.fullmatch(r'[A-Za-z0-9._-]+', version):
        raise ValueError('Registry version must be a safe explicit release identifier')
    request = _input(payload, source_bytes, source_path, registry, previous, baseline_labels)
    process = subprocess.run(['node', str(owned(root, RUNNER))], input=canonical(request),
        cwd=root, capture_output=True, check=False, timeout=300)
    if process.returncode:
        raise ValueError('Shared treatment normalization failed: ' + process.stderr.decode(errors='replace')[-5000:])
    result = json.loads(process.stdout)
    if owned(root, registry_path).read_bytes() != registry_bytes:
        raise ValueError('Curated treatment registry changed during normalization; retry the local build')
    if any(owned(root, relative).read_bytes() != content for relative, content in code_before.items()):
        raise ValueError('Shared treatment implementation changed during normalization; retry the local build')
    for key in ('normalizations', 'normalization_audit', 'review_queue', 'audit'):
        if result[key]['source_file_sha256'] != digest(source_bytes) or result[key]['registry_version'] != version:
            raise ValueError('Treatment build changed its source/registry binding')
        for name in ('treatment_resolver', 'treatment_groups', 'regimen_definitions'):
            field = 'resolver_sha256' if name == 'treatment_resolver' else name + '_sha256'
            if result[key][field] != digest(code_before['website/dist/' + name + '.js']):
                raise ValueError('Treatment build changed its shared implementation binding')
    result['registry'] = registry
    result['registry_file_sha256'] = digest(registry_bytes)
    result['producer_code'] = code_before
    if payload.get('clinical_evidence', {}).get('record_kind') == 'canonical_clinical_evidence':
        from .treatment_map import build as build_map
        result['treatment_map'] = build_map(root, payload, normalizations=result['normalizations'],
            registry=registry, source_bytes=source_bytes, source_path=source_path)
    return result


def _archive(root, relative, content):
    destination = owned(root, relative)
    if destination.exists() and destination.read_bytes() != content:
        raise ValueError('Content-addressed treatment history differs: ' + relative)
    if not destination.exists():
        atomic_bytes(destination, content)
    return relative


def _queue_csv(queue):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream)
    writer.writerow(['Raw labels', 'Normalized label', 'Status', 'Review reason', 'Issue type',
                     'Distinct reports', 'Distinct source arms', 'PMIDs', 'Source references'])
    def safe(value):
        text = str(value)
        return "'" + text if re.match(r'^[\s\x00-\x1f]*[=+@-]', text) else text
    for item in queue['items']:
        writer.writerow(map(safe, ['; '.join(item['raw_labels']), item['normalized_label'], item['status'],
            item['reason'], item['issue_type'], item['report_count'], item['arm_count'],
            '; '.join(item['pmids']), '; '.join(item['source_urls'])]))
    return ('\ufeff' + stream.getvalue()).encode()


def _save(root, result, *, dry_run=False, audit_dir=None):
    current = result['normalizations']; queue = result['review_queue']; audit = result['audit']
    public_path, queue_path, csv_path, full_audit_path = projection_paths(current['source_path'])
    old = owned(root, public_path)
    current_bytes = canonical(current)
    changed = not old.exists() or old.read_bytes() != current_bytes
    base = 'data/current/treatment_normalization/' + current['registry_version'] + '/' + current['content_sha256']
    audit_content = canonical(audit)
    audit_target = (audit_dir.rstrip('/') + '/audit-' + digest(audit_content) + '.json') if audit_dir else base + '/audits/' + digest(audit_content) + '.json'
    _archive(root, audit_target, audit_content)
    if dry_run:
        _archive(root, (audit_dir.rstrip('/') if audit_dir else base + '/dry_run') + '/proposed_normalizations-' + current['content_sha256'] + '.json', current_bytes)
        _archive(root, (audit_dir.rstrip('/') if audit_dir else base + '/dry_run') + '/proposed_review_queue-' + queue['content_sha256'] + '.json', canonical(queue))
        _archive(root, (audit_dir.rstrip('/') if audit_dir else base + '/dry_run') + '/proposed_full_audit-' + result['normalization_audit']['content_sha256'] + '.json', canonical(result['normalization_audit']))
    else:
        # Preserve the exact prior derived release before switching pointers.
        review_prefix = 'website/dist/' + ('clinical_' if current['source_path'].endswith('/clinical_evidence.json') else '') + 'drug_type_review.'
        for relative in (public_path, queue_path, csv_path, full_audit_path, GENERATED_REGISTRY,
                         *(review_prefix + ext for ext in ('json', 'txt', 'html'))):
            path = owned(root, relative)
            if path.exists():
                content = path.read_bytes()
                _archive(root, 'data/current/treatment_normalization/prior/' + digest(content) + '/' + Path(relative).name, content)
        for filename, content in [('normalizations.json', current_bytes), ('review_queue.json', canonical(queue)), ('full_audit.json', canonical(result['normalization_audit'])),
                                  ('registry.json', canonical(result['registry']))]:
            _archive(root, base + '/' + filename, content)
        producer_hash = digest(canonical({relative: digest(content) for relative, content in result['producer_code'].items()}))
        for relative, content in result['producer_code'].items():
            _archive(root, base + '/producing_code/' + producer_hash + '/' + relative, content)
        artifacts = {GENERATED_REGISTRY: registry_javascript(result['registry']), public_path: current_bytes,
                     queue_path: canonical(queue), csv_path: _queue_csv(queue), full_audit_path: canonical(result['normalization_audit'])}
        documents = result['review_documents']
        artifacts.update({review_prefix + 'json': canonical(documents['json']), review_prefix + 'txt': documents['text'].encode(),
                          review_prefix + 'html': documents['html'].encode()})
        for relative, content in artifacts.items():
            target = owned(root, relative)
            if not target.exists() or target.read_bytes() != content:
                atomic_bytes(target, content)
    map_receipt = None
    if 'treatment_map' in result:
        from .treatment_map import save as save_map
        map_receipt = save_map(root, result['treatment_map'], dry_run=dry_run, audit_dir=audit_dir)
    return {'status': 'treatment_normalization_dry_run' if dry_run else 'treatment_normalization_published',
        'treatment_map': map_receipt,
        'registry_version': current['registry_version'], 'registry_sha256': current['registry_sha256'],
        'normalization_content_sha256': current['content_sha256'], 'normalization_changed': changed,
        'public': public_path, 'review_queue': queue_path, 'normalization_audit': full_audit_path, 'audit': audit_target,
        'summary': current['summary'], 'changed_occurrences': audit['changed_occurrences'],
        'unresolved_labels': audit['unresolved_labels'], 'review_labels': audit['review_labels'],
        'source_dependent_role_labels': audit['source_dependent_role_labels'], 'regressions': len(audit['regressions']),
        'source_file_sha256': current['source_file_sha256'], 'source_data_changed': False,
        'new_model_requests': 0, 'new_source_requests': 0}


@contextmanager
def _lock(root):
    lock = owned(root, 'data/current/treatment_normalization.lock')
    lock.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


@contextmanager
def publication(root, payload, *, source_bytes, source_path=SOURCE):
    """Keep normalizer publication locked through the caller's source switch."""
    root = Path(root).resolve()
    with _lock(root):
        old = owned(root, projection_paths(source_path)[3])
        previous = json.loads(old.read_bytes()) if old.exists() else None
        result = build(root, payload, source_bytes=source_bytes, source_path=source_path, previous=previous)
        receipt = _save(root, result)
        yield receipt
        if 'treatment_map' in result:
            from .treatment_map import refresh_defaults
            receipt['treatment_map']['default_views'] = refresh_defaults(root)
            if source_path == SOURCE:
                receipt['study_tables'] = refresh_study_tables(root)


def refresh_study_tables(root):
    """Rebuild both study tabs from the just-published retained evidence."""
    scripts = Path(__file__).resolve().parents[2] / 'website/scripts'
    commands = [
        [sys.executable, scripts / 'new_findings_dates.py', '--root', root],
        ['node', scripts / 'build_new_findings.cjs', root],
        ['node', scripts / 'underpowered_studies.cjs', root],
    ]
    for command in commands:
        result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=600)
        if result.returncode:
            raise ValueError(f'{command[1].name} failed: {result.stderr[-1800:]}')
    return {name: digest(owned(root, f'website/dist/data/{name}.json').read_bytes())
            for name in ('underpowered_studies', 'new_findings')}


def reconcile(root, *, dry_run=False, source_path=SOURCE, registry_path=REGISTRY,
              audit_dir=None, baseline_labels_path=None):
    """Reclassify historical retained inputs; never repeat model extraction."""
    root = Path(root).resolve()
    with _lock(root):
        source = owned(root, source_path); source_bytes = source.read_bytes()
        previous_path = owned(root, projection_paths(source_path)[3])
        previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else None
        baseline = json.loads(owned(root, baseline_labels_path).read_bytes()) if baseline_labels_path else None
        result = build(root, json.loads(source_bytes), source_bytes=source_bytes, source_path=source_path,
                       registry_path=registry_path, previous=previous, baseline_labels=baseline)
        receipt = _save(root, result, dry_run=dry_run, audit_dir=audit_dir)
        if source.read_bytes() != source_bytes:
            raise ValueError('Source publication changed during reconciliation; repeat the local build')
        if not dry_run and 'treatment_map' in result:
            from .treatment_map import refresh_defaults
            receipt['treatment_map']['default_views'] = refresh_defaults(root)
            if source_path == SOURCE:
                receipt['study_tables'] = refresh_study_tables(root)
        return receipt
