"""Import the checked current census and the disjoint additional worklist once."""
from __future__ import annotations

from collections import Counter
import json
from pathlib import Path

from .io import atomic_json, digest, now, owned, read_json, reference
from .registry import Registry

PHASE = "melanoma-expansion-3596"
INPUTS = {
    "citations": "data/cohort/citations.jsonl",
    "candidates": "data/cohort/broad_melanoma_keyword_v2/new_candidates.jsonl",
    "R2": "data/reviews/v2/r2_fulltext_triage_v5/current_R2_triage_registry_v5.json",
    "census": "website/ui_review/canonical_article_about/staged_website/article_progress_source.json",
    "R3_articles": "data/reviews/v3/article_progress_audit_v1/article_R3_census_PRIVATE_AUDIT_v1.json",
    "availability": "data/reviews/v3/public_main_availability_overlay_v1/APPROVED_availability_registry_v1.json",
}


def jsonlines(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def bootstrap(root: Path, registry: Registry | None = None) -> dict:
    root = root.resolve()
    registry = registry or Registry(root)
    refs = {key: reference(root, value) for key, value in INPUTS.items()}
    existing = registry.metadata("bootstrap")
    if existing:
        if existing["inputs"] != refs:
            raise ValueError("Baseline inputs changed; preserve the prior import instead of resetting it")
        return existing
    previous = jsonlines(owned(root, INPUTS["citations"]))
    candidates = jsonlines(owned(root, INPUTS["candidates"]))
    old_ids = {str(c["pmid"]) for c in previous}
    new_ids = {str(c["pmid"]) for c in candidates}
    if len(previous) != len(old_ids) or len(old_ids) != 821 or len(candidates) != len(new_ids) or len(new_ids) != 3596 or old_ids & new_ids:
        raise ValueError("Expected 821 existing and 3,596 disjoint additional PMIDs")
    registry.add_articles(previous)
    registry.add_articles(candidates, PHASE)
    triage = read_json(owned(root, INPUTS["R2"]))
    for row in triage["reports"]:
        pmid = str(row["pmid"])
        if pmid not in old_ids:
            raise ValueError("Existing R2 census has a foreign PMID")
        registry.save_decision(pmid, "R2", "baseline:R2:" + pmid, row["triage_status"], row["reason"],
                               {"historical_effective_decision":row,"facts":[],"models":[]}, refs["R2"])
    census = read_json(owned(root, INPUTS["census"]))
    historical = read_json(owned(root, INPUTS["R3_articles"]))
    overlay = read_json(owned(root, INPUTS["availability"]))
    rows = historical["current_article_rows"] + historical["new_user_routing_preview"]["new_unclear_cached_articles"]
    by_report = {row["report_id"]:row for row in rows}
    citations = {row["report_id"]:row for row in previous}
    r3_ids = set(by_report) | set(overlay["verified_new_report_ids"])
    if len(r3_ids) != 282 or census["stages"]["R3"]["screening_finished"] != len(r3_ids):
        raise ValueError("Finished R3 membership must reconcile with its audited article partition")
    exceptions = {}
    for group in census["stages"]["R3"].get("reasons", []):
        label = group["label"].casefold()
        status = "unclear" if label.startswith("unclear") else "exclude" if label.startswith("excluded") else None
        if status:
            for row in group["reports"]:
                exceptions[str(row["pmid"])] = (status, row["reason"])
    for report in sorted(r3_ids):
        row = citations[report]
        pmid = str(row["pmid"])
        old = by_report.get(report, {})
        decision = old.get("eligibility_decision")
        old_reason = decision.get("reason") if isinstance(decision, dict) else None
        status, reason = exceptions.get(pmid, ("retain", old_reason or "Retained in the previously audited, completed R3 article census."))
        registry.save_decision(pmid, "R3", "baseline:R3:" + pmid, status, reason,
            {"record_kind":"preserved_effective_article_census", "not_a_new_native_review":True,
             "historical_article_row":old,"facts":[],"models":[]},
            {"finished_partition":refs["census"],"membership":refs["R3_articles"],"additional_membership":refs["availability"]})
    for hold in census.get("publication_holds", []):
        registry.hold(str(hold["pmid"]), hold["reason"])
    current = registry.snapshot()
    expected = {"R2":(4417,821,492,262,67),"R3":(282,282,277,3,2)}
    for stage, values in expected.items():
        if tuple(current["stages"][stage][key] for key in ["entered","screening_finished","retained","excluded","unclear"]) != values:
            raise ValueError("Imported stage decisions do not conserve the checked baseline")
    manifest = {"record_kind":"unified_article_registry_import","created_at":now(),"inputs":refs,
                "article_count":4417,"additional_worklist_count":3596,"phase_id":PHASE,
                "classification_history_unchanged":True,"API_requests":0,
                "existing_R3_status_basis":"Completed audited article partition; preserved effective decisions, not new model responses.",
                "stages":current["stages"]}
    atomic_json(owned(root,"data/current/bootstrap_manifest.json"),manifest)
    registry.set_metadata("bootstrap",manifest)
    registry.publish_progress()
    return manifest
