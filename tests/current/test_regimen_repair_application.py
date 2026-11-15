"""Real-source, temporary-Registry tests; production Registry is never opened."""
from copy import deepcopy
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from metamelanoma import regimen_repair_application as app, regimen_repairs as repair
from metamelanoma.io import atomic_json, canonical, digest, reference, verified_json
from metamelanoma.registry import Registry

ROOT=Path(__file__).resolve().parents[2]
BASELINE={'path':repair.BASE+'/REGISTRY_BASELINE_c480f6dad4803197ae67b8544367f131e5f7dc621449e3e58719a8525f26ca13.json',
          'sha256':'2af034067dc65c18e4236098da8b5b323abd135510cd2e3b01549da9e1506413','bytes':844976}


class ApplicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proposal=repair.prepare(ROOT)
        cls.baseline=verified_json(ROOT,BASELINE)

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve()
        refs=[repair.NATIVE,repair.PREFETCH,self.proposal['lineage']['original_source_ref'],
              self.proposal['lineage']['raw_source_ref'],
              *self.proposal['lineage']['native_artifacts'].values(),*self.proposal['producer_files'],
              *app.application_producers(ROOT),reference(ROOT,'data/current/tasks/'+repair.TASK+'/task.json')]
        for ref in refs:
            target=self.root/ref['path'];target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(ROOT/ref['path'],target)
        registry=Registry(self.root)
        with registry.db:
            for table,rows in self.baseline['rows'].items():
                for row in rows:
                    columns=','.join(row);marks=','.join('?' for _ in row)
                    registry.db.execute('INSERT INTO '+table+' ('+columns+') VALUES ('+marks+')',tuple(row.values()))
        registry.close()
        self.proposal_ref=repair.write_proposal(self.root)
        self.review={'record_kind':'independent_finite_regimen_link_repair_review','status':'PASS',
            'pmid':repair.PMID,'proposal_ref':self.proposal_ref,'approved_fact_ids':list(repair.RECIPES),
            'producer_files':self.proposal['producer_files'],
            'application_producer_files':app.application_producers(self.root),
            'reviewer':'TEST FIXTURE IN TEMPORARY ROOT ONLY'}
        self.review_ref=self.save_review(self.review)
        self.revision=app.registry_revision(self.root)
        self.assertEqual(self.revision,self.baseline['registry_revision'])

    def tearDown(self):self.temp.cleanup()

    def save_review(self,review):
        path=self.root/('tests/review-'+digest(canonical(review))+'.json')
        atomic_json(path,review);return reference(self.root,path.relative_to(self.root))

    def snapshot(self):
        with app._readonly(self.root) as db:return app._snapshot(db)

    def run_apply(self,**kw):
        return app.apply(self.root,self.proposal_ref,self.review_ref,self.revision,**kw)

    def test_default_dry_run_does_not_write_registry_or_review_artifact(self):
        before=self.snapshot();plan=self.run_apply()
        self.assertEqual(plan['status'],'dry_run');self.assertEqual(plan['accepted_facts'],19)
        self.assertEqual(plan['held_facts'],5);self.assertEqual(plan['new_model_requests'],0)
        self.assertFalse((self.root/plan['artifact']['path']).exists())
        self.assertEqual(before,self.snapshot())

    def test_append_preserves_historical_rows_native_sources_and_attempt_history(self):
        before=self.snapshot();native_before={r['path']:reference(self.root,r['path']) for r in
            [repair.NATIVE,*self.proposal['lineage']['native_artifacts'].values(),self.proposal['lineage']['raw_source_ref']]}
        result=self.run_apply(dry_run=False);after=self.snapshot()
        self.assertEqual(result['status'],'applied');self.assertEqual(result['new_model_requests'],0)
        self.assertEqual(after['decisions'][:-1],before['decisions'])
        for table in ['articles','attempts','sources']:self.assertEqual(after[table],before[table])
        history={r['revision_sha256']:r for r in after['fragment_history']}
        for row in before['fragment_history']:self.assertEqual(history[row['revision_sha256']],row)
        original=next(r for r in before['fragments'] if r['task_id']==repair.TASK)
        self.assertTrue(any(all(row[k]==original[k] for k in
            ['task_id','pmid','stage','status','reason','payload_json','source_ref_json']) for row in after['fragment_history']))
        record=verified_json(self.root,result['artifact']);payload=record['qualified_payload']
        self.assertEqual(len(payload['facts']),19);self.assertEqual(payload['source_checked_counts']['held_facts'],5)
        self.assertFalse(payload['is_native_response']);self.assertEqual(payload['reviewer_model'],'local_source_review')
        self.assertEqual(payload['original_reviewer_model'],'gpt-6-luna');self.assertFalse(payload['pooling_eligible'])
        self.assertEqual(len(json.loads(after['decisions'][-1]['payload_json'])['facts']),19)
        for path,ref in native_before.items():self.assertEqual(reference(self.root,path),ref)

    def test_repeat_same_approved_application_is_idempotent(self):
        result=self.run_apply(dry_run=False);before=self.snapshot()
        second=self.run_apply(dry_run=False)
        self.assertEqual(second['status'],'already_applied');self.assertEqual(second['artifact'],result['artifact'])
        self.assertEqual(self.snapshot(),before)

    def test_stale_revision_fails_before_any_live_write(self):
        before=self.snapshot()
        with self.assertRaisesRegex(ValueError,'Stale'):
            app.apply(self.root,self.proposal_ref,self.review_ref,'0'*64,dry_run=False)
        self.assertEqual(self.snapshot(),before)
        self.assertFalse((self.root/'data/reviews/source_qualified_R3').exists())

    def test_review_must_bind_exact_eight_proposal_and_application_producers(self):
        for field in ['status','approved_fact_ids','proposal_ref','application_producer_files']:
            review=deepcopy(self.review)
            if field=='status':review[field]='PROPOSED'
            elif field=='approved_fact_ids':review[field]=review[field][:-1]
            elif field=='proposal_ref':review[field]={**review[field],'sha256':'0'*64}
            else:review[field]=[]
            ref=self.save_review(review)
            with self.assertRaisesRegex(ValueError,'Independent PASS'):
                app.apply(self.root,self.proposal_ref,ref,self.revision,dry_run=False)
        self.assertEqual(app.registry_revision(self.root),self.revision)

    def test_failure_after_fragment_update_rolls_back_the_entire_registry_transaction(self):
        before=self.snapshot()
        with patch.object(app,'aggregate_fragments',side_effect=ValueError('Injected aggregate failure')):
            with self.assertRaisesRegex(ValueError,'Injected'):
                self.run_apply(dry_run=False)
        self.assertEqual(self.snapshot(),before)
        self.assertEqual(self.run_apply(dry_run=False)['status'],'applied')

    def test_changed_accepted_graph_cannot_be_overwritten_even_with_new_revision(self):
        path=self.root/'data/current/articles.sqlite3';db=sqlite3.connect(path)
        row=db.execute('SELECT payload_json FROM fragments WHERE task_id=?',(repair.TASK,)).fetchone()
        payload=json.loads(row[0]);payload['facts'][0]['numbers'][0]['value']=999
        with db:db.execute('UPDATE fragments SET payload_json=? WHERE task_id=?',(canonical(payload).decode(),repair.TASK))
        db.close();revision=app.registry_revision(self.root)
        with self.assertRaisesRegex(ValueError,'accepted Registry graph changed'):
            app.apply(self.root,self.proposal_ref,self.review_ref,revision,dry_run=False)

    def test_registry_alias_rejected_before_database_open(self):
        path=self.root/'data/current/articles.sqlite3';target=path.with_name('real.sqlite3')
        path.rename(target);path.symlink_to(target)
        with patch.object(app.sqlite3,'connect',side_effect=AssertionError('No alias read')):
            with self.assertRaises(ValueError):app.registry_revision(self.root)


if __name__=='__main__':unittest.main()
