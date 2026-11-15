"""Monitoring aggregation against temporary read-only SQLite fixtures."""
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from metamelanoma import complementary_monitoring as monitor
from metamelanoma.io import canonical, reference


class ComplementaryMonitoringTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.path = self.root / monitor.JOURNAL
        self.path.parent.mkdir(parents=True)
        self.db = sqlite3.connect(self.path)
        self.addCleanup(self.db.close)
        self.db.executescript('''
            CREATE TABLE complementary_runs(run_id TEXT,policy TEXT,created_at TEXT,state TEXT,fatal TEXT);
            CREATE TABLE complementary_articles(run_id TEXT,pmid TEXT,ordinal INT,state TEXT,reason TEXT,next_retry REAL,result_ref TEXT,attempts INT);
            CREATE TABLE complementary_attempts(attempt_id TEXT,run_id TEXT,pmid TEXT,ordinal INT,state TEXT,record TEXT,cost_usd TEXT,cost_status TEXT);
            CREATE TABLE complementary_events(seq INTEGER PRIMARY KEY,payload TEXT);
        ''')
        self.db.execute('INSERT INTO complementary_runs VALUES(?,?,?,?,?)',
            (monitor.RUN_ID, json.dumps({'initial_parallelism':32,'maximum_parallelism':128}),
             '2026-11-14T17:00:00+00:00','running',None))
        self.event('complementary_runner_started', '2026-11-14T17:01:00+00:00', parallelism=32, maximum_parallelism=128)
        self.event('complementary_attempt_reserved', '2026-11-14T17:02:00+00:00')
        self.event('complementary_attempt_finished', '2026-11-14T17:03:00+00:00')
        self.event('complementary_parallelism_changed', '2026-11-14T17:04:00+00:00', current=64)
        self.event('complementary_runner_started', '2026-11-14T17:05:00+00:00', run_id='another-run', parallelism=128, maximum_parallelism=128)
        self.article('1','completed',cost='0.5')
        field_review = {'validation':{'held_findings':[{'finding':{'id':'f1','target':{'stage':'R3','field_path':'/arms/0/n'},'domain':'sample_sizes'},
                   'issue':{'code':'sample_size_role_uncertain'}}], 'accepted_findings':[{'id':'f2','action':'unresolved',
                   'reason':'Two cohorts cannot be allocated','target':{'stage':'R3','field_path':'/populations/0/n'}}]}}
        self.article('2','completed_with_holds',cost='0.25',review=field_review)
        self.article('3','running',sent=True)
        self.article('4','running')
        self.article('5','running',sent=True,returned=True)
        transport = self.ref('transport6.json', {'http_status':200,'response':{'choices':[{'finish_reason':'content_filter',
                       'message':{'provider_specific_fields':{'reasoning':'NEVER_INCLUDE_PRIVATE_REASONING'}}}]}})
        self.article('6','technical_hold',reason='provider_output_hold',review={'transport_result_ref':transport,'validation':None})
        self.article('7','source_hold',reason='user_confirmed_abstract_unavailable',attempt=False)
        self.article('8','held_uncertain_send',reason='uncertain_network_send')
        self.article('9','retry_wait',reason='output_limit',cost='0.1')
        self.db.commit()

    def ref(self,name,value):
        path=self.root/name
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_bytes(canonical(value))
        return reference(self.root,name)

    def event(self,kind,at,**fields):
        self.db.execute('INSERT INTO complementary_events(payload) VALUES(?)',
            (json.dumps({'kind':kind,'at':at,'run_id':monitor.RUN_ID,**fields}),))

    def article(self,pmid,state,*,cost=None,reason=None,review=None,sent=False,returned=False,attempt=True):
        ref = self.ref('review'+pmid+'.json',review) if review else None
        self.db.execute('INSERT INTO complementary_articles VALUES(?,?,?,?,?,?,?,?)',
            (monitor.RUN_ID,pmid,int(pmid),state,json.dumps(reason),2000,json.dumps(ref) if ref else None,1 if attempt else 0))
        if not attempt:return
        directory='calls/'+pmid
        if sent:self.ref(directory+'/sent.json',{'started_at':'2026-11-14T17:02:30+00:00'})
        if returned:self.ref(directory+'/receipt.json',{'received':True})
        self.db.execute('INSERT INTO complementary_attempts VALUES(?,?,?,?,?,?,?,?)',
            ('attempt-'+pmid,monitor.RUN_ID,pmid,1,state,json.dumps({'artifact_dir':directory,
             'reserved_at':'2026-11-14T17:02:00+00:00'}),cost,'gateway_reported' if cost else 'unknown'))

    def test_counts_distinguish_sent_reserved_and_returned(self):
        value=monitor.snapshot(self.root)
        self.assertEqual(value['totals']['completed'],2)
        self.assertEqual(value['totals']['completed_clean'],1)
        self.assertEqual(value['totals']['completed_with_field_holds'],1)
        self.assertEqual(value['totals']['journal_running'],3)
        self.assertEqual(value['dispatch']['counts'],{'sent_awaiting_response':1,'reserved_not_sent':1,'returned_awaiting_accounting':1})
        self.assertEqual(value['activity']['oldest_sent_at'],'2026-11-14T17:02:30+00:00')

    def test_costs_separate_active_unknown_from_settled(self):
        value=monitor.snapshot(self.root)
        self.assertEqual(value['costs']['gateway_reported_usd'],'0.85')
        self.assertEqual(value['costs']['known_cost_attempts'],3)
        self.assertEqual(value['costs']['unknown_active_or_pending_accounting'],3)
        self.assertEqual(value['costs']['unknown_settled_attempts'],2)
        self.assertEqual(value['costs']['unknown_sent_awaiting_response'],1)
        self.assertFalse(value['costs']['cost_is_invoice'])

    def test_problem_pmids_finish_reasons_and_field_paths_are_reported_without_reasoning(self):
        value=monitor.snapshot(self.root)
        technical=value['issues']['technical_holds'][0]
        self.assertEqual(technical['pmid'],'6')
        self.assertEqual(technical['finish_reasons'],['content_filter'])
        self.assertIn('finish_reason=content_filter',technical['reason'])
        self.assertEqual(value['issues']['field_holds'][0]['pmid'],'2')
        self.assertEqual(value['issues']['field_holds'][0]['field_path'],'/arms/0/n')
        self.assertEqual(value['issues']['unresolved_findings'][0]['pmid'],'2')
        self.assertEqual(value['issues']['source_holds'][0]['pmid'],'7')
        self.assertEqual(value['issues']['uncertain_sends'][0]['pmid'],'8')
        self.assertEqual(value['issues']['retry_waits'][0]['next_retry_epoch'],2000)
        self.assertNotIn('NEVER_INCLUDE_PRIVATE_REASONING',json.dumps(value))
        self.assertNotIn('provider_specific_fields',monitor.render_report(value))

    def test_event_chain_concurrency_is_run_specific(self):
        value=monitor.snapshot(self.root)
        self.assertEqual(value['parallelism']['current'],64)
        self.assertEqual(value['activity']['last_event_at'],'2026-11-14T17:04:00+00:00')
        self.assertEqual(value['activity']['first_completion_at'],'2026-11-14T17:03:00+00:00')
        self.event('complementary_parallelism_changed','2026-11-14T17:06:00+00:00',current=16)
        self.db.commit()
        self.assertEqual(monitor.snapshot(self.root)['parallelism']['current'],16)

    def test_report_writes_only_local_artifacts_never_database_or_network(self):
        before=list(self.db.iterdump())
        with patch('urllib.request.OpenerDirector.open',side_effect=AssertionError('Network forbidden')):
            value=monitor.save_report(self.root)
        self.assertEqual(before,list(self.db.iterdump()))
        self.assertEqual(value['database_writes'],0)
        self.assertEqual(value['model_requests_made'],0)
        self.assertTrue((self.root/value['latest_report_path']).is_file())
        self.assertTrue((self.root/value['snapshot_ref']['path']).is_file())
        text=(self.root/value['report_ref']['path']).read_text()
        self.assertIn('content_filter',text)
        self.assertIn('| 6 |',text)
        self.assertIn('Fields held for review',text)

    def test_final_report_does_not_hide_unresolved_problems(self):
        self.db.execute("UPDATE complementary_runs SET state='finished'")
        self.db.commit()
        value=monitor.snapshot(self.root)
        self.assertEqual(value['phase'],'final')
        self.assertTrue(value['requires_review'])
        self.assertEqual(value['issue_counts']['technical_holds'],1)

    def test_tampered_saved_review_surfaces_an_artifact_issue(self):
        (self.root/'review2.json').write_text('{}')
        value=monitor.snapshot(self.root)
        self.assertEqual(value['issues']['monitoring_artifact_issues'][0]['pmid'],'2')
        self.assertEqual(value['totals']['completed_with_field_holds'],1)


if __name__=='__main__':unittest.main()
