"""Export the canonical checked article census; never run scientific jobs."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import fcntl
import hashlib
import json
import os
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "data/current/article_progress.json"
PUBLIC = "website/dist/data/article_review_progress.json"
CONFIG = "website/config/article_progress.json"
HISTORY = "website/release_history/article_progress"
SCIENTIFIC = ("website/dist/data/studies.json", "website/dist/data/analysis.json")
PRODUCERS = ("app.py", "website/scripts/article_progress.py", "website/scripts/refresh_article_progress.py",
             "website/dist/app.js", "website/dist/index.html", "website/dist/about_article_progress.js",
             "website/dist/about_article_progress.css", "website/scripts/clinical_evidence.py",
             "website/dist/clinical_evidence.js", "website/dist/numeric_evidence_display.js",
             "website/dist/numeric_evidence_release.js")


def need(condition, message):
    if not condition:
        raise ValueError(message)


def owned(root, relative, *, output=False, create_parent=False):
    root = Path(root).resolve()
    relative = Path(relative)
    need(not relative.is_absolute() and relative.parts and ".." not in relative.parts,
         "Owned relative metadata path required")
    path = root / relative

    def check():
        cursor = root
        for part in relative.parts:
            need(not part.casefold().endswith((".env", ".key", ".pem", ".p12", ".pfx"))
                 and "recovery-key" not in part.casefold() and "recovery_key" not in part.casefold(),
                 "Credential path refused")
            cursor = cursor / part
            need(not cursor.is_symlink(), "Metadata path aliases are refused")
        need(path.resolve(strict=False) == path and path.is_relative_to(root), "Foreign metadata path refused")
        need(not path.exists() or path.is_file(), "Regular metadata file required")

    check()
    if create_parent:
        path.parent.mkdir(parents=True, exist_ok=True)
        check()
    need(output or path.is_file(), "Required metadata file is absent")
    return path


def file_ref(root, relative):
    path = owned(root, relative)
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"path": str(relative), "sha256": digest.hexdigest(), "bytes": path.stat().st_size}


def read(root, relative):
    return json.loads(owned(root, relative).read_bytes())


def integer(value):
    return type(value) is int and value >= 0


def stage_view(stage, key):
    need(isinstance(stage, dict) and stage.get("unit") == "articles", "Article-level stage required")
    finished = stage.get("screening_finished")
    if finished is None and key == "R2" and integer(stage.get("entered")) and integer(stage.get("pending")):
        finished = stage["entered"] - stage["pending"]
    out = {name: stage.get(name) for name in ("entered", "retained", "excluded", "unclear")}
    out["screening_finished"] = finished
    need(all(integer(value) for value in out.values()) and out["entered"] >= finished
         and finished == out["retained"] + out["excluded"] + out["unclear"],
         "Checked article decision counts must reconcile")
    reports = stage.get("unclear_reports")
    if reports is None:
        reports = []
        for group in stage.get("reasons", []):
            if not str(group.get("label", "")).lower().startswith("unclear"):
                continue
            rows = group.get("reports")
            need(isinstance(rows, list) and integer(group.get("count")) and group["count"] == len(rows),
                 "Unclear reason count mismatch")
            reports.extend(rows)
    need(isinstance(reports, list), "Unclear article list required")
    seen = set()
    out["unclear_reports"] = []
    for report in reports:
        pmid, reason = str(report.get("pmid", "")), report.get("reason")
        need(pmid.isascii() and pmid.isdigit() and pmid not in seen
             and isinstance(reason, str) and reason.strip(), "Unique PMID and exact recorded reason required")
        seen.add(pmid)
        out["unclear_reports"].append({"pmid": pmid, "reason": reason})
    need(len(seen) == out["unclear"], "Unclear articles must match their reasons")
    return {"unit": "articles", **out}


def project(snapshot):
    need(snapshot.get("schema_version") == 1 and snapshot.get("unit") == "articles", "Checked article snapshot required")
    stamp = datetime.fromisoformat(snapshot["as_of"])
    need(stamp.tzinfo is not None, "Checked snapshot timestamp required")
    return {"schema_version": 1, "unit": "articles", "as_of": snapshot["as_of"],
            "timezone": snapshot.get("timezone", "America/New_York"),
            "stages": {key: stage_view(snapshot["stages"][key], key) for key in ("R2", "R3")}}


def guard(root, config):
    need(config.get("source") == SOURCE and config.get("public") == PUBLIC
         and config.get("provider_requests_authorized") == 0, "Canonical metadata-only configuration required")
    need(sorted(r["path"] for r in config["protected_scientific_assets"]) == sorted(SCIENTIFIC)
         and sorted(r["path"] for r in config["producer_files"]) == sorted(PRODUCERS),
         "Exact canonical presentation and scientific guard paths required")
    for reference in config["protected_scientific_assets"] + config["producer_files"]:
        need(file_ref(root, reference["path"]) == reference, "Bound source/code or scientific asset changed: " + reference["path"])


def atomic(root, relative, value):
    target = owned(root, relative, output=True, create_parent=True)
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n"
    descriptor, temporary = tempfile.mkstemp(prefix="." + target.name + ".", dir=target.parent)
    try:
        with os.fdopen(descriptor, "w") as destination:
            destination.write(payload)
            destination.flush()
            os.fsync(destination.fileno())
        owned(root, relative, output=True)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@contextmanager
def writer_lock(root):
    path = owned(root, "website/.article_progress.lock", output=True, create_parent=True)
    with path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def refresh(root=ROOT):
    root = Path(root).resolve()
    with writer_lock(root):
        config_bytes = owned(root, CONFIG).read_bytes()
        config_ref = {"path": CONFIG, "sha256": hashlib.sha256(config_bytes).hexdigest(), "bytes": len(config_bytes)}
        config = json.loads(config_bytes)
        guard(root, config)
        source_bytes = owned(root, SOURCE).read_bytes()
        source_ref = {"path": SOURCE, "sha256": hashlib.sha256(source_bytes).hexdigest(), "bytes": len(source_bytes)}
        result = project(json.loads(source_bytes))
        before_path = owned(root, PUBLIC)
        before = before_path.read_bytes()
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        folder = str(Path(HISTORY) / stamp)
        archive = owned(root, folder + "/article_before.json", output=True, create_parent=True)
        with archive.open("xb") as destination:
            destination.write(before)
        guard(root, config)
        need(file_ref(root, CONFIG) == config_ref, "Presentation configuration changed while preparing; retry refresh")
        need(file_ref(root, SOURCE) == source_ref, "Checked census changed while preparing; retry refresh")
        atomic(root, PUBLIC, result)
        guard(root, config)
        receipt = {"status": "ARTICLE_PROGRESS_REFRESHED", "refreshed_at": datetime.now(timezone.utc).isoformat(),
                   "source_snapshot_as_of": result["as_of"], "source": source_ref, "public": file_ref(root, PUBLIC),
                   "configuration": config_ref, "scientific_assets_unchanged": True,
                   "model_or_retrieval_requests": 0, "financial_or_source_index_writes": 0}
        atomic(root, folder + "/receipt.json", receipt)
        return receipt


def main():
    print(json.dumps(refresh(), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
