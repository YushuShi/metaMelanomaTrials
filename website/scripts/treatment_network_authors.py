"""Publish the first author of each network report from its stored PubMed citation."""
import json
import os
import sqlite3
import sys
from pathlib import Path


def first_author(citation):
    authors = citation.get("authors") or []
    first = authors[0] if isinstance(authors, list) and authors else authors
    if isinstance(first, str):
        return first.strip()
    if isinstance(first, dict):
        family = first.get("family") or first.get("last_name") or first.get("surname")
        given = first.get("given") or first.get("fore_name") or first.get("first_name")
        return " ".join(part for part in (family, given) if part) or first.get("collective_name") or ""
    return ""


def publish(root):
    dist = root / "website/dist"
    graph = json.loads((dist / "data/treatment_map.json").read_text())
    pmids = {str(row["pmid"]) for section in ("comparisons", "network_direct_evidence")
             for row in graph.get(section, []) if row.get("pmid")}
    db = root / "data/current/articles.sqlite3"
    authors = {}
    with sqlite3.connect(db.as_uri() + "?mode=ro", uri=True) as conn:
        for pmid in sorted(pmids):
            citation = conn.execute("SELECT citation_json FROM articles WHERE pmid = ?", (pmid,)).fetchone()
            if citation and (name := first_author(json.loads(citation[0]))):
                authors[pmid] = name
    destination = dist / "treatment_network_authors.js"
    records = json.dumps(authors, ensure_ascii=False, indent=2)
    contents = ("/* Generated from the public first-author bylines of network reports. */\n"
                "(function (root) {\n  const authors = Object.freeze(" + records + ");\n"
                "  if (typeof module === 'object' && module.exports) module.exports = authors;\n"
                "  else root.TreatmentNetworkAuthors = authors;\n})(globalThis);\n")
    if not destination.exists() or destination.read_text() != contents:
        temporary = destination.with_suffix(f".tmp-{os.getpid()}")
        temporary.write_text(contents)
        temporary.replace(destination)


if __name__ == "__main__":
    publish(Path(sys.argv[1]).resolve())
