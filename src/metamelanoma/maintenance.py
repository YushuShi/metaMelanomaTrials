"""Plan and explicitly apply a lossless archive of obsolete active code.

Default use is a read-only inventory. Evidence, runs, saved website results,
ui_review and release_history are outside the move scope. Credential-named
paths, aliases and hardlinks stop preflight before any content is read.
"""
from __future__ import annotations

import ast
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import stat

from .io import canonical, now, owned

ARCHIVE_ROOT = 'archive/legacy_code'
TREE_ROOTS = ('src/metacutaneous', 'src/metasamplesize', 'scripts', 'tests', 'website/scripts', 'website/tests')
WEBSITE_SCRIPT_KEEP = ('article_progress.py', 'refresh_article_progress.py', 'clinical_evidence.py', 'regimen_projection.cjs', 'treatment_normalization.cjs', 'build_drug_type_review.cjs', 'treatment_map.cjs', 'treatment_map_model.cjs')
WEBSITE_TEST_KEEP = (
    'fixtures',
    'test_article_progress.py', 'test_article_about.cjs', 'test_clinical_evidence.py',
    'test_clinical_evidence.cjs', 'test_evidence_display.cjs', 'test_pmid_merge.cjs',
    'test_scoped_studies.cjs', 'test_semantic_numeric_display.cjs', 'test_numeric_evidence.cjs',
    'test_comparer_groups.cjs', 'test_treatment_table_labels.cjs', 'treatment_picker.cjs',
    'test_treatment_count_scope.cjs', 'test_treatment_groups.cjs', 'test_treatment_alias_integration.cjs',
    'test_regimen_relationships.cjs', 'test_treatment_taxonomy_cleanup.cjs',
    'test_regimen_definitions.cjs', 'test_structured_regimen_integration.cjs',
    'test_study_table_csv.cjs', 'test_melanoma_scope.cjs', 'test_regimen_label_cleanup.cjs', 'test_melanoma_scope.py',
    'test_survival_filters.cjs', 'test_reported_randomized_n.cjs', 'test_sequence_source_reference.cjs',
    'test_trial_identifiers.cjs', 'test_wald_interval.cjs', 'test_study_table_identifiers.cjs',
    'test_regimen_source_cleanup.cjs', 'test_four_regimen_rows.cjs',
)
DIST_ARCHIVE = (
    'numeric_completion_v6_display.js', 'numeric_completion_v6_release.js',
    'about_live_refresh_v3.js', 'about_live_refresh_v4.js',
)
PROTECTED_FILES = (
    'website/dist/data/studies.json', 'website/dist/data/analysis.json',
    'website/dist/data/summary.json', 'website/dist/data/article_review_progress.json',
)
PROTECTED_TREES = ('data', 'runs', 'website/ui_review', 'website/release_history', 'release_history')
KIND = 'obsolete_active_code_archive_plan'


def _credential(path):
    """Name check only: never open a possible credential to inspect its type."""
    for part in Path(path).parts:
        low = part.casefold()
        if (low in {'.env', '.aws', '.ssh', '.netrc', '.npmrc'} or low.startswith('.env.')
                or Path(low).suffix in {'.env', '.key', '.pem', '.p12', '.pfx', '.keystore'}
                or re.search(r'(?:^|[_.-])(?:credentials?|secrets?|api[_-]?keys?|api[_-]?tokens?|recovery[_-]?(?:codes?|keys?))(?:[_.-]|$)', low)
                or low.startswith(('id_rsa', 'id_ed25519'))):
            return True
    return False


def _keepers(values):
    if (not isinstance(values, (list, tuple)) or len(values) != len(set(values))
            or any(not isinstance(name, str) or Path(name).name != name or _credential(name) for name in values)):
        raise ValueError('Website test keep-list must contain distinct ordinary filenames')
    return tuple(sorted(values))


def _selected(relative, keep):
    p = Path(relative)
    if '..' in p.parts or p.is_absolute() or _credential(relative):
        return False
    if p.parts[:2] == ('tests', 'current'):
        return False
    if p.parts[:2] == ('website', 'scripts'):
        return len(p.parts) > 2 and p.parts[2] not in WEBSITE_SCRIPT_KEEP
    if p.parts[:2] == ('website', 'tests'):
        return len(p.parts) > 2 and p.parts[2] not in keep
    if p.parts[:2] == ('website', 'dist'):
        return len(p.parts) == 3 and p.name in DIST_ARCHIVE
    return any(p.is_relative_to(Path(base)) and p != Path(base) for base in TREE_ROOTS[:4])


def _cache(relative):
    p = Path(relative)
    return (any(part in {'.pytest_cache', '.mypy_cache', '.ruff_cache'} for part in p.parts)
            or p.suffix in {'.pyc', '.pyo'} or p.name == '.DS_Store')


def _scan(root, keep):
    """Collect lstat metadata first; hashing only starts if this is safe."""
    files, caches, blocked, directories = [], [], [], []

    def walk(path):
        relative = str(path.relative_to(root))
        if _credential(relative):
            blocked.append({'path': relative, 'reason': 'credential_named_path_not_opened'});return
        try:owned(root, relative)
        except ValueError:
            blocked.append({'path': relative, 'reason': 'alias_path_not_followed'});return
        if path.is_symlink():
            blocked.append({'path': relative, 'reason': 'alias_not_followed'});return
        info = path.lstat()
        if stat.S_ISDIR(info.st_mode):
            directories.append(relative)
            for child in sorted(path.iterdir(), key=lambda p: p.name):
                child_rel = str(child.relative_to(root))
                if child_rel == 'tests/current' or child_rel.startswith('tests/current/'):
                    continue
                if child.parent == root / 'website/scripts' and child.name in WEBSITE_SCRIPT_KEEP:
                    continue
                if child.parent == root / 'website/tests' and child.name in keep:
                    continue
                walk(child)
        elif stat.S_ISREG(info.st_mode):
            if info.st_nlink != 1:
                blocked.append({'path': relative, 'reason': 'hardlink_not_opened'});return
            row = {'path': relative, 'bytes': info.st_size, 'mode': stat.S_IMODE(info.st_mode)}
            (caches if _cache(relative) else files).append(row)
        else:
            blocked.append({'path': relative, 'reason': 'nonregular_path_not_opened'})

    for base in TREE_ROOTS:
        path = root / base
        if path.exists() or path.is_symlink():
            walk(path)
    for name in DIST_ARCHIVE:
        path = root / 'website/dist' / name
        # Deliberately lstat the leaf: a dangling alias must not disappear.
        if path.exists() or path.is_symlink():
            walk(path)
    return files, caches, blocked, directories


def _reference(root, relative):
    if _credential(relative):
        raise ValueError('Possible credential material cannot be hashed')
    path = owned(root, relative)
    if not path.is_file() or path.stat().st_nlink != 1:
        raise ValueError('Owned regular nonhardlinked input required')
    content = path.read_bytes()
    return {'path': relative, 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}


def _read_ref(root, ref):
    if (not isinstance(ref, dict) or set(ref) != {'path', 'sha256', 'bytes'}
            or type(ref['bytes']) is not int or ref['bytes'] < 0):
        raise ValueError('Exact immutable cleanup manifest reference required')
    actual = _reference(root, ref['path'])
    if actual != ref:
        raise ValueError('Cleanup manifest hash or size changed')
    return json.loads(owned(root, ref['path']).read_bytes())


def _immutable(root, relative, value):
    if _credential(relative):
        raise ValueError('Secret-named output refused')
    path = owned(root, relative)
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False).encode() + b'\n'
    if path.exists():
        if path.read_bytes() != raw:
            raise ValueError('Existing cleanup artifact is immutable')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        owned(root, relative)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw);stream.flush();os.fsync(stream.fileno())
    return _reference(root, relative)


def _active_checks(root, keep):
    refs, blockers = [], []
    files = sorted((root / 'src/metamelanoma').glob('*.py'))
    files += [root / 'website/scripts' / name for name in WEBSITE_SCRIPT_KEEP]
    files += [root / name for name in ('app.py', 'pyproject.toml')]
    files += [root / 'website/dist' / name for name in ('index.html', 'app.js')]
    files += [root / 'website/tests' / name for name in keep]
    for path in files:
        if not path.exists() and not path.is_symlink():
            continue
        relative = str(path.relative_to(root))
        reference = _reference(root, relative)
        refs.append(reference)
        text = path.read_text()
        if path.suffix == '.py':
            tree = ast.parse(text)
            imports = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imports.extend(alias.name for alias in node.names)
                elif isinstance(node, ast.ImportFrom) and node.module:
                    imports.append(node.module)
            if any(name.split('.')[0] in {'metacutaneous', 'metasamplesize'} for name in imports):
                blockers.append({'path': relative, 'reason': 'active_import_of_obsolete_package'})
        if path.name == 'pyproject.toml' and re.search(r'(?:metacutaneous|metasamplesize)\.', text):
            blockers.append({'path': relative, 'reason': 'active_entrypoint_of_obsolete_package'})
        if path.parent == root / 'website/dist' or path.parent == root / 'website/tests':
            for name in DIST_ARCHIVE:
                if name in text:
                    blockers.append({'path': relative, 'reason': 'active_reference_to_archived_asset', 'asset': name})
        if path.name == 'app.py':
            for name in re.findall(r'[A-Za-z0-9_]+\.py', text):
                if (root / 'website/scripts' / name).is_file() and name not in WEBSITE_SCRIPT_KEEP:
                    blockers.append({'path': relative, 'reason': 'active_reference_to_archived_exporter', 'exporter': name})
    return refs, blockers


def _identity(plan):
    return hashlib.sha256(canonical({key: value for key, value in plan.items()
                                     if key not in {'created_at', 'plan_id'}})).hexdigest()


def inventory(root, *, website_test_keep=WEBSITE_TEST_KEEP):
    """Read-only dry-run. A credential-named path yields a blocked plan."""
    root = Path(root).resolve()
    keep = _keepers(website_test_keep)
    files, caches, blocked, directories = _scan(root, keep)
    base = {'record_kind': KIND, 'schema_version': 1, 'created_at': now(), 'archive_root': ARCHIVE_ROOT,
            'tree_roots': list(TREE_ROOTS), 'website_script_keep': list(WEBSITE_SCRIPT_KEEP),
            'website_test_keep': list(keep), 'dist_archive': list(DIST_ARCHIVE),
            'protected_trees_not_traversed': list(PROTECTED_TREES), 'entries': [], 'disposable_caches': caches,
            'directories': directories, 'blocked_paths': blocked, 'active_code': [], 'protected_files': [],
            'archive_changes_applied': False, 'API_requests': 0, 'credential_contents_read': False}
    if not blocked:
        for row in files:
            if not _selected(row['path'], keep):
                raise ValueError('Cleanup selection escaped the finite code scope')
            reference = _reference(root, row['path'])
            base['entries'].append({**reference, 'mode': row['mode'], 'archive_path': ARCHIVE_ROOT + '/' + row['path']})
        base['active_code'], active_blockers = _active_checks(root, keep)
        base['blocked_paths'].extend(active_blockers)
        base['protected_files'] = [_reference(root, path) for path in PROTECTED_FILES if (root / path).is_file()]
    base['counts'] = {'code_files': len(base['entries']), 'code_bytes': sum(row['bytes'] for row in base['entries']),
                      'disposable_cache_files': len(caches), 'blocked': len(base['blocked_paths'])}
    base['status'] = 'blocked' if base['blocked_paths'] else 'ready_for_explicit_apply'
    base['plan_id'] = _identity(base)
    return base


def save_plan(root, plan):
    root = Path(root).resolve()
    _validate_plan(plan)
    relative = 'data/current/cleanup/' + plan['plan_id'] + '/pre_manifest.json'
    path = owned(root, relative)
    if path.exists():
        existing = json.loads(path.read_bytes())
        if existing.get('plan_id') != plan['plan_id'] or _identity(existing) != plan['plan_id']:
            raise ValueError('Existing cleanup plan changed')
        return _reference(root, relative)
    return _immutable(root, relative, plan)


def _validate_plan(plan):
    if (plan.get('record_kind') != KIND or type(plan.get('schema_version')) is not int or plan.get('schema_version') != 1
            or plan.get('archive_root') != ARCHIVE_ROOT or plan.get('tree_roots') != list(TREE_ROOTS)
            or plan.get('website_script_keep') != list(WEBSITE_SCRIPT_KEEP)
            or plan.get('dist_archive') != list(DIST_ARCHIVE) or plan.get('plan_id') != _identity(plan)):
        raise ValueError('Unknown or changed cleanup plan')
    keep = _keepers(plan['website_test_keep'])
    seen = set()
    for item in plan['entries'] + plan['disposable_caches']:
        path = item['path']
        if path in seen or not _selected(path, keep):
            raise ValueError('Cleanup entries must be distinct obsolete code paths')
        seen.add(path)
        if type(item['bytes']) is not int or item['bytes'] < 0 or type(item['mode']) is not int:
            raise ValueError('Exact file size/mode metadata required')
        if item in plan['disposable_caches']:
            if not _cache(path):
                raise ValueError('Only explicit disposable caches can be removed')
        elif item['archive_path'] != ARCHIVE_ROOT + '/' + path:
            raise ValueError('Archive must preserve exact original relative paths')
        elif not re.fullmatch('[0-9a-f]{64}', str(item.get('sha256'))):
            raise ValueError('Exact archived-code digest required')
    for path in plan['directories']:
        if path not in TREE_ROOTS and not _selected(path, keep):
            raise ValueError('Only obsolete code directories may be removed if empty')
    return keep


def archive(root, plan_ref, *, approved=False):
    """Apply only after the root's explicit go; no paid workflow is invoked."""
    if approved is not True:
        raise PermissionError('Archive is dry-run only until explicit approval to apply')
    root = Path(root).resolve()
    plan = _read_ref(root, plan_ref)
    keep = _validate_plan(plan)
    if plan['status'] != 'ready_for_explicit_apply' or plan['blocked_paths']:
        raise ValueError('A blocked cleanup plan cannot be applied')
    # Preflight every source/destination/protected file BEFORE the first move.
    files, caches, blocked, _ = _scan(root, keep)
    if blocked:
        raise ValueError('New credential/alias/nonregular path blocks all cleanup moves')
    expected = {row['path']: row for row in plan['entries']}
    if set(row['path'] for row in files) - set(expected):
        raise ValueError('Unplanned active legacy code appeared; make a fresh inventory')
    expected_cache = {row['path']: row for row in plan['disposable_caches']}
    if set(row['path'] for row in caches) - set(expected_cache):
        raise ValueError('Unplanned cache appeared; make a fresh inventory')
    for ref in plan['active_code'] + plan['protected_files']:
        if _reference(root, ref['path']) != ref:
            raise ValueError('Active code or protected saved result changed since inventory')
    active, blockers = _active_checks(root, keep)
    if blockers:
        raise ValueError('Active imports/references still depend on obsolete code')
    if active != plan['active_code']:
        raise ValueError('The active keep-list changed since inventory')
    protected = [_reference(root, path) for path in PROTECTED_FILES if (root / path).is_file()]
    if protected != plan['protected_files']:
        raise ValueError('The protected saved-result set changed since inventory')
    for item in plan['entries']:
        source = owned(root, item['path'])
        target = owned(root, item['archive_path'])
        for parent in target.parents:
            if parent == root:break
            if parent.exists() and not parent.is_dir():
                raise ValueError('An archive parent is not a directory; no code was moved')
        if source.exists() and _reference(root, item['path']) != {k: item[k] for k in ('path', 'sha256', 'bytes')}:
            raise ValueError('An obsolete source changed; no code was moved')
        if target.exists():
            archived = _reference(root, item['archive_path'])
            if (archived['sha256'], archived['bytes']) != (item['sha256'], item['bytes']):
                raise ValueError('Archive destination has different bytes; no code was moved')
        elif not source.exists():
            raise ValueError('Both original code and archive copy are missing')
    for item in caches:
        if item != expected_cache[item['path']]:
            raise ValueError('Disposable cache changed since inventory')
    complete_path = owned(root, 'data/current/cleanup_complete.json')
    if complete_path.exists():
        complete = json.loads(complete_path.read_bytes())
        if complete.get('plan') != plan_ref:
            raise ValueError('A different completed cleanup already exists; preserve its receipt')
        if files or caches:
            raise ValueError('Completed cleanup is contradicted by restored obsolete code/cache')
        _read_ref(root, complete['post_manifest'])
        return complete
    moved, removed = [], []
    base = 'data/current/cleanup/' + plan['plan_id']
    try:
        for item in plan['entries']:
            source = owned(root, item['path'])
            target = owned(root, item['archive_path'])
            if source.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                owned(root, item['archive_path'])
                os.rename(source, target)
            archived = _reference(root, item['archive_path'])
            if (archived['sha256'], archived['bytes']) != (item['sha256'], item['bytes']):
                raise ValueError('Post-move archive hash mismatch')
            moved.append({**item, 'archive_verified': True, 'original_absent': not source.exists()})
        for item in caches:
            path = owned(root, item['path'])
            if path.exists():
                if not _cache(item['path']) or path.stat().st_nlink != 1:
                    raise ValueError('Disposable cache identity changed')
                path.unlink()
                removed.append(item['path'])
        # Remove only empty old directories. Never recursively remove content.
        for relative in sorted(plan['directories'], key=lambda p: len(Path(p).parts), reverse=True):
            path = owned(root, relative)
            if path.is_dir():
                try:path.rmdir()
                except OSError:pass
        remaining, remaining_caches, blocked, _ = _scan(root, keep)
        if remaining or remaining_caches or blocked:
            raise ValueError('Legacy code remains outside the archived inventory')
        for ref in plan['active_code'] + plan['protected_files']:
            if _reference(root, ref['path']) != ref:
                raise ValueError('Protected source or results changed during cleanup')
        post = {'record_kind': 'obsolete_active_code_archive_receipt', 'status': 'complete', 'finished_at': now(),
                'plan': plan_ref, 'entries': moved, 'removed_disposable_caches': removed,
                'all_archive_hashes_verified': True, 'protected_files_unchanged': True,
                'protected_trees_not_traversed': list(PROTECTED_TREES), 'API_requests': 0,
                'credential_contents_read': False, 'historical_evidence_or_financial_mutations': 0}
        post_ref = _immutable(root, base + '/post_manifest.json', post)
        complete = {'status': 'complete', 'as_of': now(), 'plan': plan_ref, 'post_manifest': post_ref,
                    'active_package': 'metamelanoma', 'archived_code_files': len(moved),
                    'archive_root': ARCHIVE_ROOT, 'protected_files_unchanged': True, 'API_requests': 0}
        _immutable(root, 'data/current/cleanup_complete.json', complete)
        return complete
    except BaseException as exc:
        failure = {'record_kind': 'obsolete_active_code_archive_interrupted', 'status': 'partial_archive_needs_resume',
                   'as_of': now(), 'plan': plan_ref, 'moved': moved, 'removed_disposable_caches': removed,
                   'problem': type(exc).__name__, 'cleanup_complete': False, 'API_requests': 0}
        name = hashlib.sha256(canonical(failure)).hexdigest()[:20]
        _immutable(root, base + '/interrupted_' + name + '.json', failure)
        raise

