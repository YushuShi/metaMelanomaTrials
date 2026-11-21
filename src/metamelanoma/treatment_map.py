"""Precompute the treatment map and default local analyses without API calls."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile

from .io import atomic_bytes, canonical, digest, owned

PUBLIC = 'website/dist/data/treatment_map.json'
RUNNER = 'website/scripts/treatment_map.cjs'
CODE_PATHS = [RUNNER, 'website/scripts/treatment_map_model.cjs', 'config/sample_size_link_reviews.json',
    'config/comparison_result_reviews.json',
    'website/scripts/treatment_map_evidence.cjs',
    'website/scripts/treatment_map_cohorts.cjs',
    'website/scripts/treatment_map_membership.cjs',
    'website/scripts/treatment_normalization.cjs',
    *['website/dist/' + name + '.js' for name in (
        'treatment_resolver', 'treatment_groups', 'regimen_definitions',
        'regimen_source_rules', 'trial_registry', 'trial_identifiers', 'quantitative_extraction')],
    'src/metamelanoma/treatment_map.py']


def build(root, payload, *, normalizations, registry, source_bytes, source_path):
    """Use candidate prepared treatments, before the publisher switches files."""
    root = Path(root).resolve()
    if payload.get('clinical_evidence', {}).get('record_kind') != 'canonical_clinical_evidence':
        raise ValueError('Treatment map needs the compact quantitative publication')
    source_hash = digest(source_bytes)
    if normalizations.get('source_file_sha256') != source_hash:
        raise ValueError('Treatment map source and prepared treatments disagree')
    code = {relative: owned(root, relative).read_bytes() for relative in CODE_PATHS}
    request = {'registry': registry, 'quantitative': payload, 'normalizations': normalizations,
        'source_path': source_path, 'source_file_sha256': source_hash}
    # Stream the large retained source to a private temporary input instead of
    # building a second in-memory serialized copy. It is never a served artifact.
    with tempfile.TemporaryDirectory(prefix='melanoma-treatment-map-') as directory:
        candidate = Path(directory) / 'input.json'
        with candidate.open('w', encoding='utf-8') as stream:
            json.dump(request, stream, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        process = subprocess.run(['node', str(owned(root, RUNNER)), str(candidate)],
            cwd=root, capture_output=True, check=False, timeout=300)
    if process.returncode:
        raise ValueError('Treatment map build failed: ' + process.stderr.decode(errors='replace')[-5000:])
    graph = json.loads(process.stdout)
    if graph.get('schema_version') != 1:
        raise ValueError('Unsupported treatment map schema')
    if any(owned(root, name).read_bytes() != content for name, content in code.items()):
        raise ValueError('Treatment map implementation changed during build; retry')
    graph.setdefault('metadata', {}).update({
        'source_path': source_path, 'source_file_sha256': source_hash,
        'clinical_content_sha256': normalizations['clinical_content_sha256'],
        'registry_version': normalizations['registry_version'],
        'registry_sha256': normalizations['registry_sha256'],
        'normalization_content_sha256': normalizations['content_sha256'],
        'producer_sha256': {name: digest(content) for name, content in code.items()},
        'scope': 'Prepared retained evidence; node counts cover the catalogue; comparison analyses apply the current study filters.',
        'new_model_requests': 0, 'new_source_requests': 0,
    })
    graph.pop('content_sha256', None)
    graph['content_sha256'] = digest(canonical(graph))
    return {'graph': graph, 'producer_code': code, 'registry': registry}


def save(root, result, *, dry_run=False, audit_dir=None):
    from .treatment_normalization import _archive
    root = Path(root).resolve()
    graph = result['graph']; content = canonical(graph)
    public = owned(root, PUBLIC)
    changed = not public.exists() or public.read_bytes() != content
    base = 'data/current/treatment_map/' + graph['content_sha256']
    if dry_run:
        target = (audit_dir.rstrip('/') if audit_dir else base + '/dry_run') + '/proposed_map-' + graph['content_sha256'] + '.json'
        _archive(root, target, content)
    else:
        if public.exists() and changed:
            previous = public.read_bytes()
            _archive(root, 'data/current/treatment_map/prior/' + digest(previous) + '.json', previous)
        _archive(root, base + '/treatment_map.json', content)
        _archive(root, base + '/registry.json', canonical(result['registry']))
        for name, code in result['producer_code'].items():
            _archive(root, base + '/producing_code/' + name, code)
        if changed:
            atomic_bytes(public, content)
    return {'status': 'treatment_map_dry_run' if dry_run else 'treatment_map_published',
        'map_changed': changed, 'public': PUBLIC, 'content_sha256': graph['content_sha256'],
        'nodes': len(graph['nodes']), 'relationships': len(graph['relationships']),
        'comparisons': len(graph['comparisons']), 'contributions': len(graph['contributions']),
        'review_summary': graph.get('review', {}).get('summary'),
        'source_file_sha256': graph['metadata']['source_file_sha256'],
        'source_data_changed': False, 'new_model_requests': 0, 'new_source_requests': 0}


def reconcile(root, *, dry_run=False, audit_dir=None):
    from .treatment_normalization import SOURCE, PUBLIC as NORMALIZATIONS, REGISTRY, _lock
    root = Path(root).resolve()
    with _lock(root):
        source = owned(root, SOURCE).read_bytes()
        treatments = owned(root, NORMALIZATIONS).read_bytes()
        registry = owned(root, REGISTRY).read_bytes()
        result = build(root, json.loads(source), normalizations=json.loads(treatments),
            registry=json.loads(registry), source_bytes=source, source_path=SOURCE)
        for relative, before in ((SOURCE, source), (NORMALIZATIONS, treatments), (REGISTRY, registry)):
            if owned(root, relative).read_bytes() != before:
                raise ValueError('Treatment map input changed during build; retry')
        receipt = save(root, result, dry_run=dry_run, audit_dir=audit_dir)
        if not dry_run:
            receipt['default_views'] = refresh_defaults(root)
        return receipt


def refresh_defaults(root):
    """Run after the source/map/classification publication is fully switched."""
    from .treatment_normalization import _archive
    root = Path(root).resolve()
    process = subprocess.run(['node', str(owned(root, 'website/scripts/treatment_map_defaults.cjs')), str(root)],
        cwd=root, capture_output=True, check=False, timeout=300)
    if process.returncode:
        raise ValueError('Default treatment map build failed: ' + process.stderr.decode(errors='replace')[-2000:])
    receipt = json.loads(process.stdout)
    version_bytes = owned(root, 'website/dist/data/treatment_map_version.json').read_bytes()
    base = 'data/current/treatment_map/default_views/' + digest(version_bytes)
    for name in ('treatment_map_default.json', 'treatment_map_version.json'):
        _archive(root, base + '/' + name, owned(root, 'website/dist/data/' + name).read_bytes())
    for name, expected in receipt['producer_sha256'].items():
        content = owned(root, name).read_bytes()
        if digest(content) != expected:
            raise ValueError('Default map producer changed during publication; rebuild')
        _archive(root, base + '/producing_code/' + name, content)
    return receipt
