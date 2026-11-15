"""TEMP-only integration negatives; no production constructor, API or mutation.
The scientific adapter is a spy: these tests check that it is not invoked before
exact native/charged-result proof. They do not claim scientific validity.
"""
from copy import deepcopy
import importlib.util,json
from pathlib import Path
from types import SimpleNamespace
import unittest
from metamelanoma import accounting as a,pipeline,gateway
from metamelanoma.io import atomic_json,reference
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('integration_gateway_fixture',ROOT/'tests/current/test_gateway_accounting.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)

class CallbackProofTests(f.GatewayTests):
 def callback_fixture(self):
  source={'pmid':'1','report_id':'r1','stage':'R3','blocks':[]}
  task=self.task('proof-task');task.update(stage='R3',model=a.MODELS['R3']);task['metadata']['source_ref']=self.ref('proof-source.json',source)
  task['body'].update(model=a.MODELS['R3'],input=json.dumps({'source_sha256':a.digest(source)}))
  j=self.journal();attempt=j.reserve(task,max_attempts=3);j.started(attempt['attempt_id'])
  result=self.transport().send(task,attempt['attempt_id'],'data/current/calls/'+attempt['attempt_id']);j.finish(attempt['attempt_id'],result)
  task['metadata']['finite_recovery']={'kind':'eligibility_repair'}
  p=object.__new__(pipeline.Pipeline);p.root=self.root;p.journal=j;p.config={'endpoint':'https://fixture.cornell.edu/v1/responses'}
  called=[];p.on_eligibility_repair=lambda *args:called.append(True)or{'status':'adapter_probe'}
  return p,j,task,result,called
 def test_exact_committed_native_proof_reaches_adapter(self):
  p,j,task,result,called=self.callback_fixture();self.assertEqual(p.on_result(task,result),{'status':'adapter_probe'});self.assertEqual(called,[True])
 def test_wrong_approved_request_body_rejected_before_adapter(self):
  p,j,task,result,called=self.callback_fixture();task['body']['instructions']+=' UNAPPROVED'
  with self.assertRaises(ValueError):p.on_result(task,result)
  self.assertFalse(called)
 def test_missing_raw_receipt_sent_refs_rejected_before_adapter(self):
  p,j,task,result,called=self.callback_fixture();result=deepcopy(result);result['artifacts']={k:v for k,v in result['artifacts'].items()if k in {'request','result'}}
  with self.assertRaises(ValueError):p.on_result(task,result)
  self.assertFalse(called)
 def test_tampered_native_raw_rejected_before_adapter(self):
  p,j,task,result,called=self.callback_fixture();(self.root/result['artifacts']['raw_response']['path']).write_bytes(b'{}')
  with self.assertRaises(ValueError):p.on_result(task,result)
  self.assertFalse(called)
 def test_unsettled_attempt_rejected_before_adapter(self):
  p,j,task,result,called=self.callback_fixture();j.db.execute("UPDATE attempts SET state='held_unknown_gateway_send' WHERE attempt_id=?",(result['attempt_id'],));j.db.commit()
  with self.assertRaises(ValueError):p.on_result(task,result)
  self.assertFalse(called)
 def test_timeout3600_accepted_but_larger_rejected(self):
  settings=gateway.GatewaySettings('fixture-private-key',3600,'https://fixture.cornell.edu');self.assertEqual(settings.timeout_seconds,3600)
  for value in (3601,0,float('inf')):
   with self.subTest(value=value),self.assertRaises(ValueError):gateway.GatewaySettings('fixture-private-key',value,'https://fixture.cornell.edu')
 def test_recover_interrupted_precedes_scoped_execute(self):
  task=self.task('recover-order');task['metadata'].update(pmid='1',finite_recovery={'kind':'output_cap_only'})
  taskref=self.ref('revision.json',task);selector=self.ref('scope.json',['1']);authority=self.ref('authority.json',{'entries':[{'task_id':task['task_id'],'revised_task_ref':taskref}],'scope_selector_ref':selector})
  p=object.__new__(pipeline.Pipeline);p.root=self.root;p.config={'provider':'cornell_openai_gateway','source_recovery_refs':[authority],'max_workers':1}
  events=[];p.registry=SimpleNamespace(fragments=lambda *_:[],latest=lambda *_:None)
  p.journal=SimpleNamespace(recover_interrupted=lambda:events.append('recover_interrupted'),status=lambda:{})
  p.open_execution_route=lambda:events.append('open');p.execute_tasks=lambda *_args,**_kw:events.append('execute');p.publish=lambda **_:None
  p.recover_r3();self.assertEqual(events,['open','recover_interrupted','execute'])

if __name__=='__main__':unittest.main()
