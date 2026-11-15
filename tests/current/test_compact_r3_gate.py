import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from metamelanoma.io import atomic_json, reference
from metamelanoma.pipeline import Pipeline, compact_r2_controls_article


class CompactR3GateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        (self.root/'data/current').mkdir(parents=True)
        self.db = self.root/'data/current/gateway_accounting.sqlite3'
        with sqlite3.connect(self.db) as db:
            db.execute('CREATE TABLE reextraction_phases(authority_json TEXT)')
        atomic_json(self.root/'plan.json', {'articles':[{'citation':{'pmid':'123'}}]})
        self.plan_ref = reference(self.root, 'plan.json')
        with sqlite3.connect(self.db) as db:
            db.execute('INSERT INTO reextraction_phases VALUES(?)', (json.dumps({'stage':'R2','plan_ref':self.plan_ref}),))

    def test_prepared_scope_blocks_even_retained_or_unknown_legacy_tasks(self):
        self.assertTrue(compact_r2_controls_article(self.root, '123'))
        self.assertFalse(compact_r2_controls_article(self.root, '456'))
        runner = Pipeline.__new__(Pipeline); runner.root=self.root; runner.guard_environment=lambda:None
        for extra in ({}, {'finite_recovery':{'kind':'eligibility_repair'}}, {'compact_R3_dispatch_authorized':True}):
            task={'stage':'R3','metadata':{'pmid':'123',**extra}}
            with self.assertRaisesRegex(PermissionError, 'new source-bound R3 dispatch authority'):
                runner.gate(task)

    def test_changed_authority_fails_closed(self):
        atomic_json(self.root/'plan.json', {'articles':[]})
        with self.assertRaisesRegex(PermissionError, 'could not be verified'):
            compact_r2_controls_article(self.root, '123')

    def test_no_compact_table_preserves_legacy_scope(self):
        with sqlite3.connect(self.db) as db: db.execute('DROP TABLE reextraction_phases')
        self.assertFalse(compact_r2_controls_article(self.root, '123'))


if __name__ == '__main__': unittest.main()
