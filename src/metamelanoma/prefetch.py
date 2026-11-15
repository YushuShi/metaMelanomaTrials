"""Finite public-source cache prefetch; no models, registry writes or UI exports."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import json
import sqlite3
import urllib.parse
from metamelanoma.bootstrap import PHASE
from metamelanoma.io import atomic_json, canonical, digest, now, owned, read_json, reference, verified_json
from metamelanoma.registry import Registry
from metamelanoma.sources import PublicSources, doi


def select(root, config):
    path = owned(root, "data/current/articles.sqlite3")
    for suffix in ("", "-wal", "-shm", "-journal"):
        p = owned(root, str(path) + suffix)
        if p.exists() and (not p.is_file() or p.stat().st_nlink != 1): raise ValueError("Owned registry input required")
    registry = Registry.__new__(Registry); registry.root = root; registry.path = path
    registry.db = sqlite3.connect("file:" + urllib.parse.quote(str(path), safe="/") + "?mode=ro", uri=True)
    registry.db.row_factory = sqlite3.Row; registry.db.execute("PRAGMA query_only=ON"); registry.db.execute("BEGIN")
    selected, skipped, seen = [], [], set()
    try:
        for citation in registry.candidates(PHASE, "R3"):
            priority = registry.latest(citation["pmid"], "R2")["payload"].get("treatment_policy", {}).get("priority")
            keys = {"pmid:" + str(citation["pmid"])}
            if citation.get("pmcid"): keys.add("pmcid:" + str(citation["pmcid"]).strip().upper())
            if doi(citation.get("doi")): keys.add("doi:" + doi(citation["doi"]))
            if (priority == "deferred" and not config.get("include_deferred_treatments", False)
                    or priority == "separate" and not config.get("include_separate_treatments", False)):
                skipped.append({"pmid": str(citation["pmid"]), "reason": "deferred/separate treatment group"}); continue
            if keys & seen:
                skipped.append({"pmid": str(citation["pmid"]), "reason": "duplicate PMID/PMCID/DOI"}); continue
            seen.update(keys); selected.append(citation)
    finally: registry.close()
    return selected, skipped


def clean(value):
    if isinstance(value, dict): return {k: clean(v) for k, v in value.items() if k != "body_bytes"}
    return [clean(v) for v in value] if isinstance(value, list) else value


def verified_cached_documents(root):
    """Reuse finite prefetch receipts after rechecking document and raw hashes."""
    root = Path(root).resolve()
    path = owned(root, "data/current/source_prefetch_status.json")
    if not path.exists():
        return {}
    documents = {}
    for ref in read_json(path).get("receipts", []):
        record = verified_json(root, ref)
        citation = record["citation"]; document = record["source_document"]
        if not document.get("main_full_text_verified"):
            continue
        if (str(document.get("pmid")) != str(citation["pmid"])
                or document.get("report_id") != citation["report_id"]):
            raise ValueError("Prefetched source identity differs from its citation")
        raw = document["raw_ref"]
        if reference(root, raw["path"]) != raw:
            raise ValueError("Prefetched raw source changed")
        # Re-run the primary parser: a cached annotation cannot establish its
        # own article identity or authorize substituted source blocks.
        if document.get("provider") == "publisher_pdf":
            # The ordinary fulltext route replays both landing and PDF checks.
            continue
        body = owned(root, raw["path"]).read_bytes()
        if document.get("provider") == "PMC_HTML":
            from .pmc_html import document_from_pmc_html
            replay = document_from_pmc_html(body, citation, raw)
        else:
            from .sources import document_from_jats
            replay = document_from_jats(body, citation, raw)
        if any(replay.get(k) != document.get(k) for k in
               ("pmid", "report_id", "source_sha256", "main_full_text_verified", "blocks")):
            raise ValueError("Prefetched source blocks differ from their primary raw source")
        documents[str(citation["pmid"])] = {"citation": citation, "document": document, "receipt_ref": ref}
    return documents


def run(root):
    root = Path(root).resolve(); config_path = owned(root, "config/pipeline.json"); config = read_json(config_path)
    if config["phase_id"] != PHASE: raise ValueError("Wrong finite candidate phase")
    source_ref = next(p for p in config["producer_files"] if p["path"] == "src/metamelanoma/sources.py")
    if reference(root, source_ref["path"]) != source_ref: raise ValueError("Reviewed source client changed")
    config_ref = reference(root, config_path); selected, skipped = select(root, config)
    status = {"phase": "source_prefetch_running", "as_of": now(), "planned": len(selected), "finished": 0,
              "verified_main": 0, "skipped": skipped, "receipts": [], "problems": [], "config": config_ref,
              "selection_sha256": digest(canonical(selected)), "model_requests": 0, "registry_writes": 0}
    status_path = owned(root, "data/current/source_prefetch_status.json"); atomic_json(status_path, status)
    client = PublicSources(root)
    def fetch(citation):
        hold = root / "data/current/HOLD"
        if hold.exists() or hold.is_symlink(): return {"main_full_text_verified": False, "held": True, "reason": "Pipeline HOLD is set"}
        try: return clean(client.fulltext(citation))
        except Exception as exc: return {"main_full_text_verified": False, "reason": type(exc).__name__ + ": " + str(exc)}
    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="public-source-prefetch") as workers:
        futures = {workers.submit(fetch, citation): citation for citation in selected}
        for future in as_completed(futures):
            citation = futures[future]; document = future.result()
            record = {"citation": citation, "source_document": document, "config": config_ref,
                      "selection_sha256": status["selection_sha256"], "finished_at": now()}
            target = owned(root, "data/sources/prefetch/" + str(citation["pmid"]) + "/" + digest(canonical(record)) + ".json")
            if target.exists() and read_json(target) != record: raise ValueError("Immutable source receipt changed")
            if not target.exists(): atomic_json(target, record)
            status["receipts"].append(reference(root, target)); status["finished"] += 1
            status["verified_main"] += document.get("main_full_text_verified") is True
            if document.get("main_full_text_verified") is not True:
                status["problems"].append({"pmid": str(citation["pmid"]), "reason": document.get("reason", "Source remains unverified"), "held": document.get("held", False)})
            status["as_of"] = now(); atomic_json(status_path, status)
    status["phase"] = "source_prefetch_held" if any(p["held"] for p in status["problems"]) else "source_prefetch_finished"
    status["as_of"] = now(); atomic_json(status_path, status)
    return status


if __name__ == "__main__":
    import sys
    print(json.dumps(run(Path(sys.argv[1])), sort_keys=True))
