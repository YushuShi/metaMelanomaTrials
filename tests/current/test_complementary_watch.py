"""Offline finite watcher tests: fake clock, process probe, and local exporters."""
from concurrent.futures import Future
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from metamelanoma import complementary_watch as watch
from metamelanoma.io import canonical, digest, reference


class ImmediateExecutor:
    def __init__(self, **_): pass
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def submit(self, function, *args, **kwargs):
        future=Future()
        try: future.set_result(function(*args, **kwargs))
        except Exception as exc: future.set_exception(exc)
        return future


class WatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name).resolve()
        self.tick=0.0;self.monitor_times=[];self.export_times=[];self.events=[]

    def sleep(self,seconds):self.tick+=seconds

    def value(self,state='running',active=1):
        return {'as_of':str(self.tick),'run_state':state,'totals':{'journal_running':active,'completed':10},
                'dispatch':{'counts':{'sent_awaiting_response':active},'articles':[{'pmid':'123'}] if active else []},
                'costs':{'gateway_reported_usd':'1.23'},'parallelism':{'current':32},'fatal':None,
                'issues':{'technical_holds':[{'pmid':'25538264','code':'provider_output_hold',
                   'reason':'provider_output_hold; finish_reason=content_filter'}]}}

    def monitor(self,*_):
        self.monitor_times.append(self.tick)
        return self.value('finished',0) if self.tick>=120 else self.value()

    def exporter(self,*_args,**_kwargs):
        self.export_times.append(self.tick)
        return {'as_of':str(self.tick),'model_requests_made':0,'database_writes':0}

    def run_watch(self,**kwargs):
        return watch.watch(self.root,runner_pid=12345,monitor_interval=kwargs.pop('monitor_interval',60),
            export_interval=kwargs.pop('export_interval',50),export_retry_delay=kwargs.pop('export_retry_delay',2),
            clock=lambda:self.tick,sleep=self.sleep,executor_factory=ImmediateExecutor,
            monitor_fn=kwargs.pop('monitor_fn',self.monitor),save_monitor_fn=lambda *_:{'snapshot_ref':{}},
            export_fn=kwargs.pop('export_fn',self.exporter),pid_probe=kwargs.pop('pid_probe',lambda _:True),
            emit=self.events.append,**kwargs)

    def test_intervals_final_export_and_problem_logs(self):
        result=self.run_watch()
        self.assertEqual(self.monitor_times,[0,60,120])
        self.assertEqual(result['watch_state'],'finished')
        self.assertEqual(result['run_state'],'finished')
        self.assertEqual(self.export_times[-1],120)
        self.assertGreaterEqual(len(self.export_times),3)
        self.assertEqual(len([e for e in self.events if e['kind']=='article_problem']),1)
        problem=next(e for e in self.events if e['kind']=='article_problem')
        self.assertEqual(problem['pmid'],'25538264')
        log=self.root/'data/current/complementary'/watch.monitoring.RUN_ID/'monitoring/watch_events.jsonl'
        self.assertEqual(len(log.read_text().splitlines()),len(self.events))
        self.assertEqual(result['model_requests_made'],0)
        self.assertEqual(result['database_writes'],0)

    def test_runner_loss_forces_final_exports_without_claiming_completion(self):
        result=self.run_watch(pid_probe=lambda _:self.tick<3,export_interval=300)
        self.assertEqual(result['watch_state'],'runner_lost_problem')
        self.assertEqual(result['run_state'],'running')
        self.assertLess(self.tick,10)
        self.assertEqual(self.export_times[-1],3)
        path=self.root/'data/current/complementary'/watch.monitoring.RUN_ID/'monitoring/runner_lost_problem.json'
        saved=json.loads(path.read_bytes())
        self.assertEqual(saved['last_snapshot']['dispatch']['articles'],[{'pmid':'123'}])
        self.assertIn('No restart or retry',saved['action'])

    def test_field_issue_kind_does_not_collide_with_log_event_kind(self):
        value=self.value('finished',0)
        value['issues']={'field_holds':[{'pmid':'123','finding_id':'f1',
            'kind':'field_validation_hold','code':'source_check_needed'}]}
        result=self.run_watch(monitor_fn=lambda *_:value)
        self.assertEqual(result['watch_state'],'finished')
        self.assertIsNone(result['last_monitor_error'])
        issue=next(event for event in self.events if event['kind']=='article_problem')
        self.assertEqual(issue['issue_kind'],'field_validation_hold')
        self.assertEqual(issue['pmid'],'123')

    def test_technical_hold_waits_for_active_requests_to_drain(self):
        def state(*_):
            self.monitor_times.append(self.tick)
            return self.value('technical_hold',1 if self.tick<60 else 0)
        result=self.run_watch(monitor_fn=state)
        self.assertEqual(self.monitor_times,[0,60])
        self.assertEqual(result['watch_state'],'technical_hold')
        self.assertEqual(self.export_times[-1],60)

    def test_final_export_retries_are_bounded_and_explicit(self):
        def fail(*_a,**_k):
            self.export_times.append(self.tick)
            raise RuntimeError('local CSV conversion failed')
        result=self.run_watch(monitor_fn=lambda *_:self.value('finished',0),export_fn=fail)
        self.assertEqual(len(self.export_times),3)
        self.assertEqual(result['watch_state'],'finished_final_export_problem')
        self.assertIn('local CSV',result['last_export_error'])
        self.assertEqual(len([e for e in self.events if e['kind']=='export_failed']),3)

    def test_failed_window_defers_to_later_schedule_and_preserves_history(self):
        def fail_then_work(*args,**kwargs):
            if len(self.export_times)<3:
                self.export_times.append(self.tick)
                raise RuntimeError('temporary local export error')
            return self.exporter(*args,**kwargs)
        def state(*_):return self.value('finished',0) if self.tick>=40 else self.value()
        result=self.run_watch(monitor_fn=state,export_fn=fail_then_work,monitor_interval=10,export_interval=10)
        self.assertEqual(result['watch_state'],'finished')
        self.assertIsNone(result['last_export_error'])
        self.assertEqual(len([e for e in self.events if e['kind']=='export_retry_window_exhausted']),1)
        self.assertTrue(any(e['kind']=='export_failed' for e in self.events))
        self.assertEqual(self.export_times[-1],40)

    def test_monitor_failure_and_lost_runner_still_get_explicit_final_status(self):
        def fail(*_):raise RuntimeError('database temporarily unavailable')
        result=self.run_watch(monitor_fn=fail,pid_probe=lambda _:False)
        self.assertEqual(result['watch_state'],'runner_lost_problem')
        self.assertIsNone(result['run_state'])
        self.assertIn('database temporarily unavailable',result['last_monitor_error'])
        self.assertEqual(len(self.export_times),1)

    def test_terminal_state_is_not_mislabelled_runner_loss(self):
        self.assertEqual(watch.terminal_reason(self.value('finished',0),False),'finished')
        self.assertEqual(watch.terminal_reason(self.value('operator_hold',0),False),'operator_hold')
        self.assertIsNone(watch.terminal_reason(self.value('technical_hold',1),True))
        self.assertEqual(watch.terminal_reason(self.value('running',32),False),'runner_lost_problem')

    def test_local_csv_export_uses_bundled_node_and_preserves_snapshot(self):
        tables={'run_id':watch.monitoring.RUN_ID,'as_of':'2026-11-14T22:00:00Z'}
        source=self.root/'review_tables.json';source.write_bytes(canonical(tables))
        source_ref=reference(self.root,source)
        commands=[]
        def local_command(command,**kwargs):
            commands.append(command)
            self.assertEqual(command[0],watch.DEFAULT_NODE)
            self.assertEqual(command[-2:],[ '--artifact-workspace',watch.DEFAULT_WORKSPACE])
            self.assertEqual(kwargs['stdin'],subprocess.DEVNULL)
            input_path,output_path=Path(command[2]),Path(command[3])
            self.assertNotEqual(input_path,source)
            self.assertEqual(input_path.read_bytes(),source.read_bytes())
            output_path.mkdir(parents=True)
            data=b'PMID,State\r\n123,completed\r\n'
            (output_path/'article_costs.csv').write_bytes(data)
            (output_path/'csv_manifest.json').write_text(json.dumps({'run_id':watch.monitoring.RUN_ID,
                'as_of':tables['as_of'],'source_sha256':source_ref['sha256'],
                'outputs':[{'file':'article_costs.csv','sha256':digest(data)}]}))
            return subprocess.CompletedProcess(command,0)
        with patch('metamelanoma.complementary_reporting.export_review',return_value={'tables_ref':source_ref,
                   'findings_for_review':1,'article_rows':1}),patch('subprocess.run',side_effect=local_command):
            result=watch.export_snapshot(self.root,watch.monitoring.RUN_ID,node=watch.DEFAULT_NODE,
                script=self.root/'scripts/export_complementary_csv.mjs',artifact_workspace=watch.DEFAULT_WORKSPACE)
        self.assertEqual(len(commands),1)
        self.assertEqual(result['model_requests_made'],0)
        self.assertTrue((self.root/result['csv_refs'][0]['path']).is_file())
        self.assertEqual((self.root/result['table_ref']['path']).read_bytes(),source.read_bytes())


if __name__=='__main__':unittest.main()
