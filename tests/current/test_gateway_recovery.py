"""Isolated temp Gateway journals/fake HTTP; no credentials or production writers."""
from pathlib import Path
from copy import deepcopy
from datetime import datetime,timezone,timedelta
import importlib,importlib.util,json,sys,types,unittest
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).parent
import metamelanoma as pkg
a=importlib.import_module(pkg.__name__+'.accounting');g=importlib.import_module(pkg.__name__+'.gateway_accounting');rec=importlib.import_module(pkg.__name__+'.gateway_recovery');e=importlib.import_module(pkg.__name__+'.execution');sc=importlib.import_module(pkg.__name__+'.screening');gw=importlib.import_module(pkg.__name__+'.gateway');t=importlib.import_module(pkg.__name__+'.transport')
spec=importlib.util.spec_from_file_location('finite_gw_baseline',ROOT/'tests/current/test_gateway_accounting.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class RecoveryTransport(gw.GatewayTransport):
 def wire_for_task(self,task):return a.validate_task(task,wire_ceiling_bytes=a.reviewed_wire_ceiling(task),output_ceiling=a.reviewed_output_ceiling(task))
f.a=a;f.g=g;f.e=e;f.GatewayTransport=RecoveryTransport;f.GatewaySettings=gw.GatewaySettings;f.NativeTransport=t.NativeTransport;f.Settings=t.Settings
class FiniteTests(f.GatewayTests):
 def r3(self):
  source=sc.build_source({'pmid':'1','report_id':'r1'},'R3','Seventeen patients with melanoma were treated.',fulltext_verified=True,upstream_R2={'decision':{'status':'retain'}})
  body=sc.request_body(source,max_output_tokens=32768)
  task={'task_id':'r3','stage':'R3','model':a.MODELS['R3'],'body':body,'metadata':{'pmid':'1','report_id':'r1','phase_id':a.PHASE_ID,'provider':g.PROVIDER,'source_ref':self.ref('r3source.json',source),'max_output_tokens_ceiling':32768,'body_core_sha256':a.digest({k:v for k,v in body.items()if k!='max_output_tokens'})}}
  self.ref('data/current/tasks/r3/task.json',task);return task
 def failed(self,j,task,unknown=False):
  attempt=j.reserve(task,max_attempts=3);j.started(attempt['attempt_id'])
  def send(request,**_):
   if unknown:raise TimeoutError('fixture timeout')
   return f.Response(f.native(json.loads(request.data),incomplete=True))
  result=self.transport(send).send(task,attempt['attempt_id'],'data/current/calls/'+attempt['attempt_id']);j.finish(attempt['attempt_id'],result)
  j.callback(task['task_id'],{'status':'provider_problem'});return attempt,result
 def fixture(self,j,*,unknown=False,twice=False):
  task=self.r3()
  if twice:
   first=deepcopy(task);first['body']['max_output_tokens']=16384;first['metadata']['body_core_sha256']=task['metadata']['body_core_sha256'];self.ref('data/current/tasks/r3/task.json',first)
   r=j.reserve(first,max_attempts=3);j.started(r['attempt_id'])
   def send(request,**_):return f.Response(f.native(json.loads(request.data),incomplete=True))
   result=self.transport(send).send(first,r['attempt_id'],'data/current/calls/'+r['attempt_id']);result['retry_request_max_output_tokens']=32768;j.finish(r['attempt_id'],result,retry_at=0)
   r=j.reserve(first,max_attempts=3,request_body=task['body']);j.started(r['attempt_id']);result=self.transport(send).send(task,r['attempt_id'],'data/current/calls/'+r['attempt_id']);j.finish(r['attempt_id'],result);j.callback('r3',{'status':'provider_problem'});task=first
  else:r,result=self.failed(j,task,unknown=unknown)
  new=deepcopy(task);new['body']['max_output_tokens']=65536;new['metadata'].update(finite_recovery={'kind':'output_cap_only','parent_body_sha256':result['request_body_sha256']},max_output_tokens_ceiling=65536,wire_ceiling_bytes=120000)
  revision=self.ref('data/current/tasks/r3/revisions/'+a.digest(new)+'/task.json',new)
  parent=self.ref('data/current/tasks/r3/task.json',task)
  end=(datetime.now(timezone.utc)+timedelta(hours=2)).isoformat()
  capability=self.ref('capability.json',{'record_kind':'Cornell_model_output_limit_read_only_check','completion_requests':0,'checks':[{'path':'models','http_status':200,'models':[{'id':a.MODELS['R3'],'max_output_tokens':128000}]},{'path':'model/info','http_status':200,'models':[{'model_name':a.MODELS['R3'],'model_info':{'max_output_tokens':128000,'supports_reasoning':True,'supports_response_schema':True}}]}]})
  count=len(j.attempts_for('r3'));row={'task_id':'r3','case':'output_cap_only','parent_task_ref':parent,'revised_task_ref':revision,'old_identity_sha256':a.digest(j.task('r3')['identity']),'latest_attempt_id':r['attempt_id'],'latest_request_ref':result['artifacts']['request'],'latest_request_body_sha256':result['request_body_sha256'],'failure_ref':result['artifacts']['result'],'expected_global_attempt_count':count,'remaining_attempts':3-count,'wire_ceiling_bytes':120000}
  auth={'record_kind':rec.KIND,'status':'approved','phase_id':a.PHASE_ID,'provider':g.PROVIDER,'global_max_attempts':3,'route_ref':self.route_ref,'parent_config_ref':self.ref('config.json',{'not_after_utc':end}),'not_after':end,'scope_selector_ref':self.ref('scope.json',['1']),'model_capability_ref':capability,'entries':[row]}
  return task,new,self.ref('recovery.json',auth),auth
 def test_compact_eligibility_case_is_same_source_no_numeric_schema_and_replays(self):
  ep=importlib.import_module(pkg.__name__+'.eligibility_repair');j=self.journal();old=self.r3();r=j.reserve(old,max_attempts=3);j.started(r['attempt_id'])
  result=self.transport().send(old,r['attempt_id'],'data/current/calls/'+r['attempt_id']);j.finish(r['attempt_id'],result)
  view=self.ref('failedview.json',{'source':old['metadata']['source_ref'],'native_artifacts':result['artifacts'],'validation':{'original_payload':result['payload'],'decision_valid':False}})
  j.callback('r3',{'status':'decision_validation_pending','artifact':view})
  source=json.loads(a.checked_ref(self.root,old['metadata']['source_ref']));new=ep.make_revised_task(old,old['body'],source)
  producer=self.ref('archive/producer_snapshots/fixture/eligibility_repair.py',{'fixture_only':True})
  contract=self.ref('compact-contract.json',{'record_kind':ep.CONTRACT_KIND,'status':'approved',
   'instructions_sha256':__import__('hashlib').sha256(new['body']['instructions'].encode()).hexdigest(),
   'allowed_output_properties':list(new['body']['text']['format']['schema']['properties']),'producer_files':[producer]})
  revision=self.ref('data/current/tasks/r3/revisions/'+a.digest(new)+'/task.json',new)
  end=(datetime.now(timezone.utc)+timedelta(hours=2)).isoformat()
  auth={'record_kind':rec.KIND,'status':'approved','phase_id':a.PHASE_ID,'provider':g.PROVIDER,'global_max_attempts':3,
   'route_ref':self.route_ref,'parent_config_ref':self.ref('compact-config.json',{'not_after_utc':end}),'not_after':end,'scope_selector_ref':self.ref('compact-scope.json',['1']),
   'entries':[{'task_id':'r3','case':'eligibility_repair','parent_task_ref':self.ref('data/current/tasks/r3/task.json',old),'revised_task_ref':revision,
    'old_identity_sha256':a.digest(j.task('r3')['identity']),'latest_attempt_id':r['attempt_id'],'latest_request_ref':result['artifacts']['request'],
    'latest_request_body_sha256':result['request_body_sha256'],'failure_ref':view,'expected_global_attempt_count':1,'remaining_attempts':2,
    'wire_ceiling_bytes':120000,'request_schema_sha256':a.digest(new['body']['text']['format']['schema']),'protocol_contract_ref':contract}]}
  approval=self.ref('compact-authority.json',auth);before=deepcopy(j.attempts_for('r3'));j.amend_task(new,approval);j.verify();self.run_tasks(j,[new]);j.verify()
  self.assertEqual(j.attempts_for('r3')[:1],before);self.assertEqual(len(j.attempts_for('r3')),2)

 def test_known32k_to64k_preserves_attempts_costs_source_original_and_resume(self):
  j=self.journal();old,new,ref,auth=self.fixture(j);before=deepcopy(j.attempts_for('r3'));oldbytes=(self.root/'data/current/tasks/r3/task.json').read_bytes()
  j.amend_task(new,ref);self.assertEqual(j.current_task_ref('r3'),auth['entries'][0]['revised_task_ref']);self.assertIsNone(j.approved_retry_window('r3')['started_at']);j.verify()
  self.run_tasks(j,[new]);self.run_tasks(j,[new]);self.assertEqual(len(j.attempts_for('r3')),2);self.assertEqual(j.attempts_for('r3')[:1],before)
  self.assertEqual((self.root/'data/current/tasks/r3/task.json').read_bytes(),oldbytes);self.assertTrue(j.verify()['verified']);self.assertIsNotNone(j.retry_window_started_at('r3'))
 def test_two_old_attempts_allow_only_global_third64k(self):
  j=self.journal();old,new,ref,_=self.fixture(j,twice=True);j.amend_task(new,ref);self.run_tasks(j,[new]);self.run_tasks(j,[new]);self.assertEqual([x['ordinal']for x in j.attempts_for('r3')],[1,2,3]);j.verify()
 def test_unknown_send_cannot_be_amended_or_retried(self):
  j=self.journal();old,new,ref,_=self.fixture(j,unknown=True)
  with self.assertRaises(ValueError):j.amend_task(new,ref)
  self.assertEqual(len(j.attempts_for('r3')),1)
 def test_default_native32k_guard_still_rejects64k(self):
  j=self.journal();old,new,ref,_=self.fixture(j)
  with self.assertRaises(ValueError):a.validate_task(new)
  self.assertTrue(a.quote(new)['output_token_upper_bound']==65536)
  bad=deepcopy(new);bad['metadata']['provider']='openai'
  with self.assertRaises(ValueError):a.quote(bad)
 def test_wrong_source_input_prompt_schema_count_scope_capability_or_deadline_rejected(self):
  j=self.journal();old,new,ref,auth=self.fixture(j)
  for change in ('input','prompt','schema','scope','count','deadline','capability','unknownclass'):
   task=deepcopy(new);value=deepcopy(auth)
   if change=='input':task['body']['input']+=' changed'
   elif change=='prompt':task['body']['instructions']+=' changed'
   elif change=='schema':task['body']['text']['format']['schema']['required']=[]
   elif change=='scope':value['scope_selector_ref']=self.ref('otherscope.json',['2'])
   elif change=='count':value['entries'][0]['expected_global_attempt_count']=0
   elif change=='deadline':value['not_after']=(datetime.now(timezone.utc)+timedelta(days=10)).isoformat()
   elif change=='capability':value['model_capability_ref']=self.ref('smallcap.json',{'record_kind':'Cornell_model_output_limit_read_only_check','completion_requests':0,'checks':[]})
   elif change=='unknownclass':value['entries'][0]['case']='blind_retry'
   value['entries'][0]['revised_task_ref']=self.ref('data/current/tasks/r3/revisions/'+a.digest(task)+'/task.json',task)
   approval=self.ref('bad-'+change+'.json',value)
   with self.subTest(change=change),self.assertRaises((ValueError,KeyError,StopIteration)):j.amend_task(task,approval)
 def test_valid_completed_task_or_exhausted_history_not_retryable(self):
  j=self.journal();old,new,ref,value=self.fixture(j)
  state=j.task('r3');j.db.execute("UPDATE tasks SET state='completed',callback=?",(a.canonical({'status':'reviewed'}).decode(),));j.db.commit()
  with self.assertRaises(ValueError):j.amend_task(new,ref)
  j.db.execute("UPDATE tasks SET state='provider_hold',callback=?",(a.canonical(state['callback']).decode(),));j.db.commit();value['entries'][0].update(expected_global_attempt_count=3,remaining_attempts=0)
  with self.assertRaises(ValueError):j.amend_task(new,self.ref('exhausted.json',value))
if __name__=='__main__':unittest.main()
