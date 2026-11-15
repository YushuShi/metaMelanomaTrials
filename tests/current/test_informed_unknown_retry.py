"""Inactive risk case: TEMP approval fixtures, journals/fake HTTP only."""
from pathlib import Path
from copy import deepcopy
from datetime import datetime,timezone
import importlib,importlib.util,json,sys,types,unittest
from types import SimpleNamespace
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).parent
import metamelanoma as pkg
mods={n:importlib.import_module(pkg.__name__+'.'+n)for n in ('accounting','gateway_accounting','gateway_recovery','execution','screening','gateway','transport','pipeline')}
a=mods['accounting'];g=mods['gateway_accounting'];rec=mods['gateway_recovery'];e=mods['execution'];pmod=mods['pipeline']
spec=importlib.util.spec_from_file_location('prior_finite_fixture',ROOT/'data/proposed_changes/cornell_finite_source_recovery/test_finite_gateway_recovery.py');old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
old.pkg=pkg;old.a=a;old.g=g;old.rec=rec;old.e=e;old.sc=mods['screening'];old.gw=mods['gateway'];old.t=mods['transport']
class RiskTransport(mods['gateway'].GatewayTransport):
 def wire_for_task(self,task):return a.validate_task(task,wire_ceiling_bytes=a.reviewed_wire_ceiling(task),output_ceiling=a.reviewed_output_ceiling(task))
old.f.a=a;old.f.g=g;old.f.e=e;old.f.GatewayTransport=RiskTransport;old.f.GatewaySettings=mods['gateway'].GatewaySettings;old.f.NativeTransport=mods['transport'].NativeTransport;old.f.Settings=mods['transport'].Settings

class InformedRiskTests(old.FiniteTests):
 def risk_fixture(self,j):
  parent,task,_,auth=self.fixture(j,unknown=True);task['metadata']['finite_recovery']['kind']=rec.UNKNOWN_RISK
  row=auth['entries'][0];row['case']=rec.UNKNOWN_RISK;row['revised_task_ref']=self.ref('data/current/tasks/r3/revisions/'+a.digest(task)+'/task.json',task)
  question=self.ref('question.json',{'duplicate_charge_risk':'explicitly shown to fixture user','fixture_only':True})
  acknowledgment={'record_kind':'explicit_user_unknown_send_duplicate_charge_approval','status':'approved','approving_role':'user',
   'user_message':'FIXTURE ONLY: approve one additional attempt accepting possible duplicate Cornell charges.','approved_task_ids':['r3'],'question_ref':question,
   'possible_original_execution_acknowledged':True,'possible_duplicate_Cornell_charges_accepted':True,'original_unknown_holds_preserved':True,
   'maximum_additional_attempts_per_task':1,'direct_OpenAI_allowance_unchanged':'100','approved_at':datetime.now(timezone.utc).isoformat()}
  auth.update(question_ref=question,explicit_user_risk_approval_ref=self.ref('user-approval.json',acknowledgment),maximum_additional_attempts_per_task=1,execution_max_attempts=2)
  return parent,task,self.ref('risk-authority.json',auth),auth,acknowledgment
 def test_explicit_risk_one_new_send_preserves_original_unknown_and_cost(self):
  j=self.journal();parent,task,authority,_,_=self.risk_fixture(j);before=deepcopy(j.attempts_for('r3'))
  j.amend_task(task,authority);j.verify();self.run_tasks(j,[task],max_attempts=2);self.run_tasks(j,[task],max_attempts=2)
  self.assertEqual(len(j.attempts_for('r3')),2);self.assertEqual(j.attempts_for('r3')[:1],before)
  self.assertEqual(j.attempts_for('r3')[0]['state'],'held_unknown_gateway_send');self.assertIsNone(j.attempts_for('r3')[0]['record']['cost_metadata']['gateway_reported_proxy_estimate_usd']);self.assertEqual(j.status()['gateway_cost_unknown_attempts'],1);j.verify()
 def test_missing_unapproved_assistant_or_unacknowledged_risk_rejects(self):
  j=self.journal();parent,task,ref,auth,ack=self.risk_fixture(j)
  for change in ('missing','unapproved','assistant','no_duplicate','no_original','new_allowance','two_attempts','wrong_tasks','wrong_question','no_user_message'):
   value=deepcopy(auth);approval=deepcopy(ack)
   if change=='missing':value['explicit_user_risk_approval_ref']=None
   elif change=='unapproved':approval['status']='proposal'
   elif change=='assistant':approval['approving_role']='assistant'
   elif change=='no_duplicate':approval['possible_duplicate_Cornell_charges_accepted']=False
   elif change=='no_original':approval['possible_original_execution_acknowledged']=False
   elif change=='new_allowance':approval['direct_OpenAI_allowance_unchanged']='120'
   elif change=='two_attempts':approval['maximum_additional_attempts_per_task']=2
   elif change=='wrong_tasks':approval['approved_task_ids']=['other']
   elif change=='wrong_question':approval['question_ref']=self.ref('otherquestion.json',{'wrong':True})
   elif change=='no_user_message':approval['user_message']=''
   if change!='missing':value['explicit_user_risk_approval_ref']=self.ref('ack-'+change+'.json',approval)
   with self.subTest(change=change),self.assertRaises((ValueError,TypeError)):j.amend_task(task,self.ref('auth-'+change+'.json',value))
  self.assertEqual(len(j.attempts_for('r3')),1)
 def test_global3_runtime_argument_cannot_bypass_one_new_attempt_fuse(self):
  j=self.journal();parent,task,ref,_,_=self.risk_fixture(j);j.amend_task(task,ref)
  with self.assertRaises(ValueError):j.reserve(task,max_attempts=3)
  self.assertEqual(len(j.attempts_for('r3')),1)
 def test_second_transient_failure_stops_without_a_third_send(self):
  j=self.journal();parent,task,ref,_,_=self.risk_fixture(j);j.amend_task(task,ref);sends=[]
  def send(request,**_):
   sends.append(1);response=old.f.Response(old.f.native(json.loads(request.data)));response.status=503;return response
  self.run_tasks(j,[task],max_attempts=2,transport=self.transport(send));self.run_tasks(j,[task],max_attempts=2,transport=self.transport(send))
  self.assertEqual(len(sends),1);self.assertEqual(len(j.attempts_for('r3')),2);j.verify()
 def test_rehashed_third_risk_reservation_rejected_during_replay(self):
  j=self.journal();parent,task,ref,_,_=self.risk_fixture(j);j.amend_task(task,ref)
  def send(request,**_):
   response=old.f.Response(old.f.native(json.loads(request.data)));response.status=503;return response
  self.run_tasks(j,[task],max_attempts=2,transport=self.transport(send));self.assertTrue(j.verify()['verified'])
  # Construct a fully rehashed, projection-consistent third reservation in TEMP.
  # This deliberately bypasses both live fuses; replay must independently reject it.
  event=json.loads(j.db.execute("SELECT payload FROM events WHERE json_extract(payload,'$.kind')='reserve' ORDER BY seq DESC LIMIT 1").fetchone()[0])
  record=deepcopy(event['attempt']);self.assertEqual(record['ordinal'],2)
  record.update(ordinal=3,attempt_id=record['attempt_id'].rsplit('-a',1)[0]+'-a3',reserved_at=a.now())
  with j.transaction():
   j.db.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)',(record['attempt_id'],'r3',3,'reserved',a.canonical(record).decode(),None,None))
   j.db.execute("UPDATE tasks SET state='running',next_retry=NULL WHERE task_id='r3'")
   j._event({'kind':'reserve','attempt':record})
  with self.assertRaisesRegex(ValueError,'Informed-unknown retry two-attempt ceiling'):
   j.verify()
 def test_new_approval_or_duplicate_task_id_cannot_reset_history(self):
  j=self.journal();parent,task,ref,auth,ack=self.risk_fixture(j);j.amend_task(task,ref);self.run_tasks(j,[task],max_attempts=2)
  value=deepcopy(auth);value['note']='changed approval'
  with self.assertRaises(ValueError):j.amend_task(task,self.ref('changed-authority.json',value))
  other=deepcopy(task);other['task_id']='different'
  with self.assertRaises((ValueError,a.BudgetBlocked)):j.register(other)
  self.assertEqual(len(j.attempts_for('r3')),2)
 def test_pipeline_forces_two_and_rejects_mixed_batches_before_amendment(self):
  task=self.task('risk');task['metadata']['finite_recovery']={'kind':'user_approved_unknown_retry'}
  p=object.__new__(pmod.Pipeline);p.root=self.root;p.config={'max_attempts':3,'max_workers':1,'not_after_utc':'2026-11-04T01:38:41.318094+00:00'};p.tasks={};events=[]
  p.journal=SimpleNamespace(amend_task=lambda *args:events.append('amend'));p.transport=None;p.on_result=lambda *_:None;p.progress=lambda *_:None;p.gate=lambda *_:True;p.rate_limits=None;p.publish=lambda **_:None;p.recovery_authority=lambda *_:{'fixture':True}
  def execute(tasks,**kw):events.append(kw['max_attempts']);return {'phase':'finished'}
  with patch.object(pmod,'execute',side_effect=execute):p.execute_tasks([task])
  self.assertEqual(events,['amend',2]);events.clear();other=self.task('normal')
  with self.assertRaises(PermissionError):p.execute_tasks([task,other])
  self.assertEqual(events,[])
if __name__=='__main__':unittest.main()
