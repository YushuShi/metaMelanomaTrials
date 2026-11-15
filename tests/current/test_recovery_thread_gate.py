from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from metamelanoma import schema, screening
from metamelanoma.io import atomic_json, reference
from metamelanoma.pipeline import Pipeline, PHASE


class WorkerGateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve()
        source=screening.build_source({'pmid':'1','report_id':'r1'},'R3',
            'Twenty-five melanoma patients received therapy.',fulltext_verified=True,
            upstream_R2={'decision':{'status':'retain'}})
        atomic_json(self.root/'source.json',source)
        (self.root/'primary.txt').write_text('Literal primary source')
        body=screening.request_body(source)
        self.task={'task_id':'task','stage':'R3','model':schema.MODELS['R3'],'body':body,
            'metadata':{'phase_id':PHASE,'provider':'cornell_openai_gateway','pmid':'1','report_id':'r1',
                'source_ref':reference(self.root,'source.json'),
                'raw_source_ref':reference(self.root,'primary.txt'),
                'finite_recovery':{'kind':'eligibility_repair'}}}
        self.p=Pipeline.__new__(Pipeline);self.p.root=self.root
        self.p.config={'provider':'cornell_openai_gateway','models':schema.MODELS,'service_tier':'default'}
        self.p.allowed={'1'};self.p.r3_routing_allowed=frozenset({'1'})
        self.p.guard_environment=lambda:None;self.p.recovery_authority=lambda _:{}
        self.p.registry=SimpleNamespace(latest=Mock(side_effect=AssertionError('Worker touched coordinator SQLite')))

    def tearDown(self):self.temp.cleanup()

    def run_worker_gate(self):
        with patch('metamelanoma.gateway_recovery.validate_recovery_task',return_value={'last_body':self.task['body']}), \
             patch('metamelanoma.eligibility_repair.validate_task_body',return_value=True), \
             ThreadPoolExecutor(max_workers=1) as workers:
            return workers.submit(self.p.gate,self.task).result()

    def test_worker_uses_immutable_routing_snapshot_without_sqlite(self):
        self.assertTrue(self.run_worker_gate())
        self.p.registry.latest.assert_not_called()

    def test_worker_still_rejects_current_r2_exclusion(self):
        self.p.r3_routing_allowed=frozenset()
        with self.assertRaisesRegex(PermissionError,'R2-excluded'):self.run_worker_gate()
        self.p.registry.latest.assert_not_called()


if __name__=='__main__':unittest.main()
