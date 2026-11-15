"""Build an explicit, credential-free Git checkout; never upload or delete evidence."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
TREES = ('src', 'config', 'scripts', 'tests/current', 'website/scripts', 'website/tests', 'website/config')
DOCS = ('TREATMENT_MAP.md', 'TREATMENT_NORMALIZATION.md', 'TREATMENT_CATALOG.md',
        'advanced_filters.md', 'CONFERENCE_SOURCE_COVERAGE.md', 'PREPRINT_SOURCE_COVERAGE.md')
PATTERNS = {
    'key_literal': rb'\b(?:sk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})',
    'private_key': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'signed_access_url': rb'(?i)(?:X-Amz-Signature|X-Amz-Credential|X-Goog-Signature|access_token)=',
    'private_account_identifier': rb'cu\.wcm\.its\.[A-Za-z0-9]+',
}


def sha(path):
    hasher = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def inspect(path):
    # Only finding types/paths may be printed, never a matched credential.
    tail = b''
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            content = tail + chunk
            for kind, pattern in PATTERNS.items():
                if re.search(pattern, content):
                    raise ValueError(f'Public copy blocked: {kind} in {path.relative_to(ROOT)}')
            tail = content[-1024:]


def included(path, base):
    return (path.is_file() and not path.is_symlink()
            and not any(part.startswith('.') or part == '__pycache__' for part in path.relative_to(base).parts)
            and path.suffix.lower() not in {'.env', '.pyc', '.sqlite3', '.sqlite', '.db', '.pem', '.key', '.log'})


def build(destination):
    destination = destination.resolve()
    destination.relative_to(ROOT / '_publication')
    if destination.exists():
        raise ValueError('Use a new public checkout destination; never overwrite an existing Git history')
    files = [ROOT / name for name in ('app.py', 'pipeline.py', 'pyproject.toml')]
    files += [ROOT / 'docs' / name for name in DOCS]
    files += [ROOT / 'website' / 'DATA_CONTRACT.md', Path(__file__).resolve()]
    for folder in TREES:
        base = ROOT / folder
        files.extend(path for path in base.rglob('*') if included(path, base))
    base = ROOT / 'website/dist'
    files.extend(path for path in base.rglob('*') if included(path, base))
    files = sorted(set(files))
    for path in files:
        inspect(path)
    destination.mkdir(parents=True)
    manifest = {'schema_version': 1, 'repository': 'https://github.com/YushuShi/metaMelanomaTrials',
                'visibility': 'public', 'built_at': datetime.now(timezone.utc).isoformat(),
                'scientific_snapshot_changed': False, 'files': []}
    for source in files:
        relative = source.relative_to(ROOT)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        original_sha = sha(source)
        compressed = relative.parts[:3] == ('website', 'dist', 'data') and source.suffix == '.json'
        if compressed:
            target = target.with_name(target.name + '.gz')
            with source.open('rb') as original, target.open('wb') as raw:
                with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0, compresslevel=6) as output:
                    shutil.copyfileobj(original, output)
            verified = hashlib.sha256()
            with gzip.open(target, 'rb') as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                    verified.update(chunk)
            if verified.hexdigest() != original_sha:
                raise ValueError('Lossless snapshot verification failed: ' + str(relative))
        else:
            shutil.copyfile(source, target)
        if sha(source) != original_sha:
            raise ValueError('Source changed during release preparation: ' + str(relative))
        if target.stat().st_size >= 100 * 1024 * 1024:
            raise ValueError('GitHub file limit exceeded: ' + str(relative))
        manifest['files'].append({'path': str(target.relative_to(destination)),
                                  'sha256': sha(target), 'bytes': target.stat().st_size,
                                  'original_path': str(relative), 'original_sha256': original_sha,
                                  'original_bytes': source.stat().st_size, 'gzip': compressed})
    (destination / '.gitignore').write_text('''__pycache__/
*.py[cod]
.venv/
*.egg-info/
.pytest_cache/
.DS_Store
*.env
*.env.*
*.key
*.pem
/data/
/runs/
/logs/
/artifacts/
/outputs/
/archive/
/_publication/
/website/ui_review/
/website/release_history/
/website/dist/data/*.json
''')
    (destination / 'README.md').write_text('''# metaMelanomaTrials

Melanoma treatment evidence, an interactive treatment map, study tables,
meta-analysis and sample-size planning.

## Run locally

```sh
git clone https://github.com/YushuShi/metaMelanomaTrials.git
cd metaMelanomaTrials
python app.py
```

Open http://127.0.0.1:5021/. Python 3.11+ is required; reviewing the saved
website needs no API key, sign-in, Node installation or paid model requests.
Use `python app.py --port 5022` if port 5021 is occupied.

The application opens on **Treatment map**. **Studies** provides searchable
comparators/interventions, endpoints, advanced filters and CSV downloads.
Comparison views support forest plots, funnel plots, sensitivity analysis and
trial planning when eligible evidence is available. Independent cohorts determine
the model: one individual estimate, two fixed-effect, three or more REML
random-effects. Related publications are consolidated before pooling.

## Saved evidence

This repository includes the current published R2/R3 website snapshot. The fixed
review scope contains 2,538 articles, with 1,072 completed full-text assessments
in this published snapshot. Counts of articles and independent cohorts differ.
The ongoing complementary Opus verification has not been applied to this snapshot.
Missing estimates and screening/validation limitations remain visible in the data.

Large result JSON files are stored as deterministic `.json.gz` files. The Python
server transparently serves their original URLs with gzip encoding. Decompressed
bytes match the original scientific files; `release/public_snapshot.json` records
both compressed and original checksums. Do not edit compressed artifacts by hand.

The research pipeline is in `src/metamelanoma`, with schemas, prompts, scientific
configuration, source normalization and tests included. The public snapshot supports
local evidence review. Restarting screening requires the owner's separate original
source corpus, accounting databases, approved plans and private credentials.
`python app.py` never starts those jobs. Do not use `--refresh` without the private
research workspace.

Raw article downloads, complete request/response histories, accounting databases,
credentials and local evidence backups are not distributed. Source identifiers,
citations and selected evidence passages remain in the saved website results.
Third-party articles and excerpts retain their original publishers' rights.

## Development

```sh
python -m pip install -e .
python scripts/unpack_public_snapshot.py
PYTHONPATH=src python -m unittest discover -s tests/current
node --test website/tests/*.cjs
```

Some integration/audit tests require the private original-source workspace and
are therefore unavailable from a public clone. Offline unit checks use fixtures.
See `docs/TREATMENT_MAP.md`, `docs/TREATMENT_NORMALIZATION.md` and
`website/DATA_CONTRACT.md` for the analysis and display contracts.
''')
    (destination / 'AGENTS.md').write_text('''# metaMelanomaTrials public repository

Run the saved website with `python app.py`. Preserve numerical results, cohort
identity, treatment direction and provenance. Saved JSON gzip files are release
artifacts; include changed artifacts and their producing code together.

Never commit credentials, private request/response archives, downloaded articles,
accounting databases or local backups. The public application reviews a saved
snapshot; cloning it does not authorize paid model requests or new screening.
The canonical pipeline is `src/metamelanoma`; historical versions stay in the
owner's local archive. Keep tests focused on changed behavior.
''')
    release = destination / 'release'
    release.mkdir()
    (release / 'public_snapshot.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'destination': str(destination), 'files': len(files),
                      'compressed_payloads': sum(row['gzip'] for row in manifest['files']),
                      'total_bytes': sum(row['bytes'] for row in manifest['files']),
                      'scientific_snapshot_changed': False}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    build(parser.parse_args().destination)
