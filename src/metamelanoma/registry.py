"""One article registry, with append-only stage decisions and field-level results."""
from __future__ import annotations

from collections import Counter
import fcntl
import json
from pathlib import Path
import sqlite3
from typing import Iterable

from .io import atomic_json, canonical, digest, now, owned

DECISIONS = {"retain", "exclude", "unclear"}


class Registry:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.path = owned(self.root, "data/current/articles.sqlite3")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        for suffix in ("","-wal","-shm","-journal"):
            candidate=Path(str(self.path)+suffix)
            if candidate.is_symlink() or candidate.exists()and (not candidate.is_file()or candidate.stat().st_nlink!=1):
                raise ValueError("Registry database and sidecars must be owned regular files")
        self.db = sqlite3.connect(self.path)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS articles (
          pmid TEXT PRIMARY KEY, report_id TEXT NOT NULL UNIQUE,
          citation_json TEXT NOT NULL, admitted_at TEXT NOT NULL,
          publication_hold TEXT
        );
        CREATE TABLE IF NOT EXISTS worklist (
          phase TEXT NOT NULL, pmid TEXT NOT NULL REFERENCES articles(pmid),
          PRIMARY KEY(phase,pmid)
        );
        CREATE TABLE IF NOT EXISTS decisions (
          id INTEGER PRIMARY KEY, pmid TEXT NOT NULL REFERENCES articles(pmid),
          stage TEXT NOT NULL CHECK(stage IN ('R2','R3')),
          result_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
          reason TEXT NOT NULL, payload_json TEXT NOT NULL,
          source_ref_json TEXT NOT NULL, reviewed_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS stage_article ON decisions(stage,pmid,id);
        CREATE TABLE IF NOT EXISTS attempts (
          task_id TEXT PRIMARY KEY, pmid TEXT NOT NULL REFERENCES articles(pmid),
          stage TEXT NOT NULL, state TEXT NOT NULL, detail_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sources (
          id INTEGER PRIMARY KEY, pmid TEXT NOT NULL REFERENCES articles(pmid),
          kind TEXT NOT NULL, source_sha256 TEXT NOT NULL, source_json TEXT NOT NULL,
          verified INTEGER NOT NULL, UNIQUE(pmid,kind,source_sha256)
        );
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS fragments (
          task_id TEXT PRIMARY KEY, pmid TEXT NOT NULL REFERENCES articles(pmid), stage TEXT NOT NULL,
          status TEXT NOT NULL, reason TEXT NOT NULL, payload_json TEXT NOT NULL,
          source_ref_json TEXT NOT NULL, saved_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS fragment_history (
          revision_sha256 TEXT PRIMARY KEY, task_id TEXT NOT NULL, pmid TEXT NOT NULL,
          stage TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL,
          payload_json TEXT NOT NULL, source_ref_json TEXT NOT NULL,
          revision_reason TEXT NOT NULL, saved_at TEXT NOT NULL
        );
        """)

    def close(self):
        self.db.close()

    def set_metadata(self, key: str, value) -> None:
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO metadata VALUES (?,?)", (key, canonical(value).decode()))

    def metadata(self, key: str, default=None):
        row = self.db.execute("SELECT value FROM metadata WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def add_articles(self, citations: Iterable[dict], phase: str | None = None) -> int:
        count = 0
        with self.db:
            for citation in citations:
                pmid, report = str(citation["pmid"]), citation["report_id"]
                if not pmid.isdigit():
                    raise ValueError("A PubMed article identity is required")
                prior = self.db.execute("SELECT * FROM articles WHERE pmid=?", (pmid,)).fetchone()
                if prior and prior["report_id"] != report:
                    raise ValueError("Conflicting article identity; do not create another PMID row")
                if not prior:
                    self.db.execute("INSERT INTO articles VALUES (?,?,?,?,?)", (pmid, report, canonical(citation).decode(), now(), None))
                    count += 1
                if phase:
                    self.db.execute("INSERT OR IGNORE INTO worklist VALUES (?,?)", (phase, pmid))
        return count

    def article(self, pmid: str) -> dict:
        row = self.db.execute("SELECT * FROM articles WHERE pmid=?", (str(pmid),)).fetchone()
        if not row:
            raise KeyError(pmid)
        value = json.loads(row["citation_json"])
        value["publication_hold"] = row["publication_hold"]
        return value

    def set_abstract(self, pmid: str, abstract: str, provenance: dict) -> None:
        citation = self.article(pmid)
        citation["abstract"] = abstract
        citation["abstract_source"] = provenance
        with self.db:
            self.db.execute("UPDATE articles SET citation_json=? WHERE pmid=?", (canonical(citation).decode(), str(pmid)))

    def hold(self, pmid: str, reason: str) -> None:
        with self.db:
            self.db.execute("UPDATE articles SET publication_hold=? WHERE pmid=?", (reason, str(pmid)))

    def save_decision(self, pmid: str, stage: str, result_key: str, status: str, reason: str,
                      payload: dict, source_ref: dict, reviewed_at: str | None = None) -> None:
        status = {"uncertain": "unclear", "retain_for_full_text": "retain"}.get(status, status)
        if status not in DECISIONS or stage not in {"R2", "R3"}:
            raise ValueError("A validated stage decision is required")
        if not reason.strip():
            raise ValueError("A decision must retain its reason")
        if stage == "R3" and not result_key.startswith("baseline:"):
            upstream = self.latest(pmid, "R2")
            if not upstream or upstream["status"] not in {"retain", "unclear"}:
                raise ValueError("R2 exclusions and unfinished screenings cannot enter R3")
        with self.db:
            old = self.db.execute("SELECT * FROM decisions WHERE result_key=?", (result_key,)).fetchone()
            values = (str(pmid), stage, result_key, status, reason, canonical(payload).decode(), canonical(source_ref).decode())
            if old:
                if tuple(old[k] for k in ["pmid","stage","result_key","status","reason","payload_json","source_ref_json"]) != values:
                    raise ValueError("A saved result key cannot be overwritten")
                return
            self.db.execute("INSERT INTO decisions(pmid,stage,result_key,status,reason,payload_json,source_ref_json,reviewed_at) VALUES (?,?,?,?,?,?,?,?)",
                            (*values, reviewed_at or now()))

    def latest(self, pmid: str, stage: str) -> dict | None:
        row = self.db.execute("SELECT * FROM decisions WHERE pmid=? AND stage=? ORDER BY id DESC LIMIT 1", (str(pmid), stage)).fetchone()
        if not row:
            return None
        out = dict(row)
        out["payload"] = json.loads(out.pop("payload_json"))
        out["source_ref"] = json.loads(out.pop("source_ref_json"))
        return out

    def mark_attempt(self, task_id: str, pmid: str, stage: str, state: str, detail: dict) -> None:
        if stage == "R3":
            up = self.latest(pmid, "R2")
            if not up or up["status"] == "exclude":
                raise ValueError("An excluded R2 article cannot enter new R3 work")
        with self.db:
            self.db.execute("INSERT INTO attempts VALUES (?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET state=excluded.state,detail_json=excluded.detail_json,updated_at=excluded.updated_at",
                            (task_id, str(pmid), stage, state, canonical(detail).decode(), now()))

    def save_source(self, pmid: str, kind: str, source: dict, verified: bool = True) -> None:
        sha = source.get("source_sha256") or digest(canonical(source))
        with self.db:
            self.db.execute("INSERT OR IGNORE INTO sources(pmid,kind,source_sha256,source_json,verified) VALUES (?,?,?,?,?)",
                            (str(pmid), kind, sha, canonical(source).decode(), int(verified)))

    def source(self, pmid: str, kind: str) -> dict | None:
        row = self.db.execute("SELECT source_json FROM sources WHERE pmid=? AND kind=? AND verified=1 ORDER BY id DESC LIMIT 1", (str(pmid), kind)).fetchone()
        return json.loads(row[0]) if row else None

    def candidates(self, phase: str, stage: str) -> list[dict]:
        rows = self.db.execute("SELECT a.* FROM articles a JOIN worklist w USING(pmid) WHERE w.phase=? ORDER BY CAST(a.pmid AS INTEGER)", (phase,)).fetchall()
        out = []
        for row in rows:
            pmid = row["pmid"]
            if row["publication_hold"] or self.latest(pmid, stage):
                continue
            up = self.latest(pmid, "R2")
            if stage == "R3" and (not up or up["status"] not in {"retain", "unclear"}):
                continue
            out.append(self.article(pmid))
        return out

    def clinical_articles(self) -> list[dict]:
        """Validated canonical graphs for the common UI; originals stay in evidence storage."""
        ids = self.db.execute("SELECT DISTINCT pmid FROM decisions WHERE result_key NOT LIKE 'baseline:%' ORDER BY CAST(pmid AS INTEGER)").fetchall()
        records = []
        for row in ids:
            pmid = row[0]
            citation = self.article(pmid)
            r2,r3=self.latest(pmid,"R2"),self.latest(pmid,"R3")
            if not any(review and review["payload"].get("schema_id")=="melanoma-clinical-review"for review in [r2,r3]):
                continue
            records.append({"citation":citation,"R2":r2,"R3":r3})
        return records

    def save_fragment(self, task_id: str, pmid: str, stage: str, status: str, reason: str,
                      payload: dict, source_ref: dict, *, revision_reason: str | None = None) -> None:
        values = (task_id,str(pmid),stage,status,reason,canonical(payload).decode(),canonical(source_ref).decode())
        with self.db:
            row = self.db.execute("SELECT * FROM fragments WHERE task_id=?",(task_id,)).fetchone()
            if row:
                prior=tuple(row[k] for k in ["task_id","pmid","stage","status","reason","payload_json","source_ref_json"])
                if prior==values:return
                if not revision_reason or prior[:3]!=values[:3]:
                    raise ValueError("A source fragment cannot be silently replaced")
                self.db.execute("INSERT OR IGNORE INTO fragment_history VALUES (?,?,?,?,?,?,?,?,?,?)",
                                (digest(canonical(prior)),*prior,"Preserved preceding source-validation view",row["saved_at"]))
                self.db.execute("UPDATE fragments SET status=?,reason=?,payload_json=?,source_ref_json=?,saved_at=? WHERE task_id=?",
                                (*values[3:],now(),task_id))
            else:self.db.execute("INSERT INTO fragments VALUES (?,?,?,?,?,?,?,?)",(*values,now()))
            self.db.execute("INSERT OR IGNORE INTO fragment_history VALUES (?,?,?,?,?,?,?,?,?,?)",
                            (digest(canonical(values)),*values,revision_reason or "Initial source-validation view",now()))

    def fragments(self, task_ids: list[str]) -> list[dict]:
        found = []
        for task_id in task_ids:
            row = self.db.execute("SELECT * FROM fragments WHERE task_id=?",(task_id,)).fetchone()
            if row:
                value = dict(row)
                value["payload"] = json.loads(value.pop("payload_json"))
                value["source_ref"] = json.loads(value.pop("source_ref_json"))
                found.append(value)
        return found

    def snapshot(self) -> dict:
        stages = {}
        for stage in ("R2", "R3"):
            rows = self.db.execute("SELECT d.pmid,d.status,d.reason FROM decisions d JOIN (SELECT pmid,MAX(id) id FROM decisions WHERE stage=? GROUP BY pmid) latest ON d.id=latest.id", (stage,)).fetchall()
            tally = Counter(row["status"] for row in rows)
            if stage == "R2":
                entered = self.db.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
            else:
                entered = self.db.execute("SELECT COUNT(*) FROM (SELECT pmid FROM attempts WHERE stage='R3' AND state NOT IN ('not_sent','planned') UNION SELECT pmid FROM decisions WHERE stage='R3')").fetchone()[0]
            unclear = [{"pmid": row["pmid"], "reason": row["reason"]} for row in rows if row["status"] == "unclear"]
            stages[stage] = {"unit":"articles", "entered":entered, "screening_finished":len(rows),
                             "retained":tally["retain"], "excluded":tally["exclude"], "unclear":tally["unclear"],
                             "unclear_reports":sorted(unclear, key=lambda r:int(r["pmid"]))}
        return {"schema_version":1,"unit":"articles","as_of":now(),"timezone":"America/New_York","stages":stages}

    def publish_progress(self) -> dict:
        value = self.snapshot()
        lock_path = owned(self.root, "website/.article_progress.lock")
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with lock_path.open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                atomic_json(owned(self.root, "data/current/article_progress.json"), value)
                atomic_json(owned(self.root, "website/dist/data/article_review_progress.json"), value)
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)
        return value
