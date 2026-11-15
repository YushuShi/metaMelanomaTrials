"""Verify and unpack the GitHub snapshot for tests that open JSON files directly."""
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import os


def unpack(root):
    manifest = json.loads((root / 'release/public_snapshot.json').read_text())
    count = 0
    for row in manifest['files']:
        if not row.get('gzip'):
            continue
        source = root / row['path']
        target = root / row['original_path']
        if (source.is_symlink() or target.is_symlink() or
                not source.resolve().is_relative_to(root.resolve()) or
                not target.resolve().is_relative_to(root.resolve())):
            raise ValueError('Snapshot paths must remain inside the public checkout')
        if hashlib.sha256(source.read_bytes()).hexdigest() != row['sha256']:
            raise ValueError('Compressed checksum mismatch: ' + row['path'])
        descriptor, temporary = tempfile.mkstemp(prefix='.unpack-', dir=target.parent)
        try:
            hasher = hashlib.sha256()
            with os.fdopen(descriptor, 'wb') as output, gzip.open(source, 'rb') as original:
                for chunk in iter(lambda: original.read(1024 * 1024), b''):
                    hasher.update(chunk)
                    output.write(chunk)
            if hasher.hexdigest() != row['original_sha256']:
                raise ValueError('Original result checksum mismatch: ' + row['original_path'])
            os.replace(temporary, target)
        finally:
            Path(temporary).unlink(missing_ok=True)
        count += 1
    print(f'Verified and unpacked {count} saved JSON files. No API requests were made.')


if __name__ == '__main__':
    unpack(Path(__file__).resolve().parents[1])
