"""Small, shared persistence helpers. Credentials are never evidence artifacts."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
from typing import Any


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def owned(root: Path, relative: str | Path) -> Path:
    root = root.resolve()
    path = root / relative
    if not path.is_relative_to(root) or ".." in path.parts:
        raise ValueError("Path must remain inside the project")
    cursor = path
    while cursor != root:
        if cursor.is_symlink():
            raise ValueError("Evidence and output paths cannot be symbolic links")
        cursor = cursor.parent
    return path


def atomic_bytes(path: Path, content: bytes) -> None:
    if path.is_symlink() or path.parent.resolve() != path.parent:
        raise ValueError("Output must have a real, owned parent")
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def atomic_json(path: Path, value: Any) -> None:
    atomic_bytes(path, json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False).encode() + b"\n")


def read_json(path: Path) -> Any:
    return json.loads(path.read_bytes())


def evidence_path(root: Path, path: str | Path) -> Path:
    target = owned(root,path)
    for part in target.relative_to(root.resolve()).parts:
        name=part.casefold().replace("_","-")
        if (name.endswith((".env",".key",".pem",".p12",".pfx"))
                or name in {"secrets",".secrets","credentials","recovery-keys"}
                or "recovery-key" in name):
            raise ValueError("Credentials cannot become evidence references")
    return target


def reference(root: Path, path: str | Path) -> dict:
    target = evidence_path(root,path)
    content = target.read_bytes()
    return {"path": str(target.relative_to(root.resolve())), "sha256": digest(content), "bytes": len(content)}


def verified_json(root: Path, ref: dict) -> Any:
    content = evidence_path(root, ref["path"]).read_bytes()
    if digest(content) != ref["sha256"] or ref.get("bytes", len(content)) != len(content):
        raise ValueError("Saved evidence no longer matches its reference")
    return json.loads(content)


def producer_reference(root: Path, path: str | Path) -> dict:
    """Preserve the exact producing code before recording a derived artifact."""
    ref=reference(root,path)
    if not str(ref["path"]).endswith(".py"):
        raise ValueError("Only producing Python code belongs in this snapshot")
    content=evidence_path(root,path).read_bytes()
    if digest(content)!=ref["sha256"]:raise ValueError("Producer changed while preparing its snapshot")
    destination=owned(root,"archive/producer_snapshots/"+ref["sha256"]+"/"+ref["path"])
    if destination.exists():
        if destination.read_bytes()!=content:raise ValueError("Existing producing-code snapshot differs")
    else:atomic_bytes(destination,content)
    return ref
