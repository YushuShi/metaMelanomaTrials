"""Canonical checked-census export and source/scientific preservation."""
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import importlib.util
import json
import sys
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import article_progress as progress


def snapshot():
    return {"schema_version": 1, "unit": "articles", "as_of": "2026-11-01T23:12:02+00:00",
            "stages": {
                "R2": {"unit": "articles", "entered": 3, "pending": 0, "retained": 1, "excluded": 1, "unclear": 1,
                       "reasons": [{"label": "Unclear decisions", "count": 1,
                                    "reports": [{"pmid": "123", "title": "Not exported", "reason": "Exact R2 reason"}]}]},
                "R3": {"unit": "articles", "entered": 2, "screening_finished": 2, "retained": 0, "excluded": 1, "unclear": 1,
                       "reasons": [{"label": "Unclear full-text decisions", "count": 1, "reports": [{"pmid": "456", "reason": "Exact R3 reason"}]},
                                   {"label": "Excluded after full-text screening", "count": 1, "reports": [{"pmid": "789", "reason": "Never listed"}]}]}}}


class Tests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        for name in (progress.SOURCE, progress.PUBLIC, "website/dist/data/studies.json", "website/dist/data/analysis.json"):
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(snapshot()) if name == progress.SOURCE else '{"preserved":true}')
        for name in progress.PRODUCERS:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('exact canonical fixture producer')
        self.config = {"source": progress.SOURCE, "public": progress.PUBLIC, "provider_requests_authorized": 0,
                       "protected_scientific_assets": [progress.file_ref(self.root, name) for name in
                                                       ("website/dist/data/studies.json", "website/dist/data/analysis.json")],
                       "producer_files": [progress.file_ref(self.root, name) for name in progress.PRODUCERS]}
        p = self.root / progress.CONFIG
        p.parent.mkdir(parents=True)
        p.write_text(json.dumps(self.config))

    def tearDown(self):
        self.temp.cleanup()

    def test_five_metrics_and_only_unclear_pmid_reason_are_projected(self):
        source = snapshot(); before = deepcopy(source); out = progress.project(source)
        self.assertEqual(source, before)
        self.assertEqual(out["stages"]["R2"]["screening_finished"], 3)
        for stage in out["stages"].values():
            self.assertEqual(set(stage), {"unit", "entered", "screening_finished", "retained", "excluded", "unclear", "unclear_reports"})
            self.assertTrue(all(set(row) == {"pmid", "reason"} for row in stage["unclear_reports"]))
        self.assertNotIn("789", json.dumps(out))

    def test_inconsistent_counts_duplicate_pmids_and_missing_reason_fail(self):
        for change in (lambda s: s["stages"]["R3"].update(screening_finished=3),
                       lambda s: s["stages"]["R2"]["reasons"][0]["reports"][0].update(reason=""),
                       lambda s: s["stages"]["R2"].update(entered=True)):
            source = snapshot(); change(source)
            with self.assertRaises(ValueError): progress.project(source)

    def test_unified_future_census_uses_same_contract_without_expansion_groups(self):
        source = progress.project(snapshot())
        source["stages"]["R2"].update(entered=4417, screening_finished=4000, retained=3000, excluded=999, unclear=1)
        out = progress.project(source)
        self.assertEqual(out["stages"]["R2"]["entered"], 4417)
        self.assertNotIn("expansion", json.dumps(out))

    def test_repeat_refresh_accepts_new_checked_input_and_preserves_scientific_bytes(self):
        protected = {r["path"]: (self.root/r["path"]).read_bytes() for r in self.config["protected_scientific_assets"]}
        first = progress.refresh(self.root)
        source = snapshot(); source["stages"]["R3"].update(entered=3)
        (self.root/progress.SOURCE).write_text(json.dumps(source))
        second = progress.refresh(self.root)
        self.assertNotEqual(first["source"], second["source"])
        self.assertEqual(progress.read(self.root, progress.PUBLIC)["stages"]["R3"]["entered"], 3)
        self.assertEqual(protected, {p: (self.root/p).read_bytes() for p in protected})

    def test_read_and_output_aliases_fail_without_external_writes(self):
        with TemporaryDirectory() as outside:
            source = self.root/progress.SOURCE; source.unlink(); source.symlink_to(Path(outside)/"absent.json")
            with self.assertRaises(ValueError): progress.refresh(self.root)
            self.assertEqual(list(Path(outside).iterdir()), [])
            source.unlink(); source.write_text(json.dumps(snapshot()))
            history = self.root/progress.HISTORY; history.parent.mkdir(parents=True, exist_ok=True); history.symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError): progress.refresh(self.root)
            self.assertEqual(list(Path(outside).iterdir()), [])

    def test_single_writer_and_source_drift_are_fail_closed(self):
        with progress.writer_lock(self.root):
            with self.assertRaises(BlockingIOError): progress.refresh(self.root)
        before = (self.root/progress.PUBLIC).read_bytes(); original = progress.project
        def change(source):
            result = original(source)
            (self.root/progress.SOURCE).write_text(json.dumps({**source, "as_of": "2026-11-02T00:00:00+00:00"}))
            return result
        with patch.object(progress, "project", side_effect=change), self.assertRaisesRegex(ValueError, "changed while preparing"):
            progress.refresh(self.root)
        self.assertEqual((self.root/progress.PUBLIC).read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
