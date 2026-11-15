"""Current finite schema-amendment tests with temporary journals and fake HTTP only."""
from copy import deepcopy
from datetime import datetime, timezone, timedelta
import hashlib
import json
import unittest
from unittest.mock import patch

from metamelanoma import accounting as a, gateway_accounting as g
from metamelanoma import execution as e, screening as sc, schema as s
from metamelanoma import transport as t, gateway as gw
import test_gateway_accounting as f

class AmendmentTests(f.GatewayTests):
    def r3(self,name='r3',cap=16384):
        source=sc.build_source({'report_id':'r1','pmid':'1'},stage='R3',rawtext='Seventeen patients with melanoma were treated.',fulltext_verified=True,
            upstream_R2={'report_id':'r1','decision':{'status':'unclear'},'source_sha256':'a'*64})
        ref=self.ref('r3source.json',source)
        body=sc.request_body(source,max_output_tokens=cap)
        body['instructions']=sc.LEGACY_PROMPT
        body['text']['format']['schema']=deepcopy(s.SCHEMA)
        return {'task_id':name,'stage':'R3','model':a.MODELS['R3'],'body':body,
            'metadata':{'phase_id':a.PHASE_ID,'provider':g.PROVIDER,'pmid':'1','report_id':'r1','source_ref':ref,
                'body_core_sha256':a.digest({k:v for k,v in body.items()if k!='max_output_tokens'}),'max_output_tokens_ceiling':32768}}
    def save_original(self,task):
        return self.ref('data/current/tasks/'+task['task_id']+'/task.json',task)
    def result(self,j,task,*,wrong_identity=False,last_cap=None):
        actual=deepcopy(task)
        if last_cap is not None:actual['body']['max_output_tokens']=last_cap
        r=j.reserve(task,max_attempts=3,request_body=actual['body']);j.started(r['attempt_id'])
        payload={'report_id':'wrong'if wrong_identity else'r1','evidence':[{'evidence_id':'e1','span_id':'foreign-R2'}]}
        def send(request,**_):
            response=f.native(json.loads(request.data));response['output'][0]['content'][0]['text']=json.dumps(payload)
            return f.Response(response)
        result=self.transport(send).send(actual,r['attempt_id'],'data/current/calls/'+r['attempt_id']);j.finish(r['attempt_id'],result)
        view={'task_id':task['task_id'],'source':task['metadata']['source_ref'],'native_artifacts':result['artifacts'],
            'request_body_sha256':result['request_body_sha256'],'validation':{'original_payload':payload,'decision_valid':False,
            'global_errors':['Foreign report/PMID/stage/source']if wrong_identity else[],
            'decision_errors':[]if wrong_identity else['Missing/foreign/duplicate evidence reference']}}
        viewref=self.ref('failed-'+r['attempt_id']+'.json',view)
        j.callback(task['task_id'],{'status':'decision_validation_pending','artifact':viewref})
        return r,result,viewref
    def approval(self,j,old,*,wrong_identity=False,unsent=False,last_cap=None):
        original=self.save_original(old);source=json.loads(a.checked_ref(self.root,old['metadata']['source_ref']))
        if unsent:
            j.register(old);record=None;last=old['body'];view=None;request=None
        else:
            record,result,view=self.result(j,old,wrong_identity=wrong_identity,last_cap=last_cap);request=result['artifacts']['request'];last=json.loads(a.checked_ref(self.root,request))['body']
        task=deepcopy(old);task['body']=sc.catalog_enum_repair_body(last,source)
        task['metadata'].update(enum_repair={'kind':'current_sent_catalog_span_enum_only','old_body_sha256':a.digest(last)},wire_ceiling_bytes=140000,
            body_core_sha256=a.digest({k:v for k,v in task['body'].items()if k!='max_output_tokens'}))
        revision=self.ref('data/current/tasks/'+old['task_id']+'/revisions/'+a.digest(task)+'/task.json',task)
        n=len(j.attempts_for(old['task_id']));start=datetime.now(timezone.utc)-timedelta(seconds=1);end=start+timedelta(hours=2)
        parent=self.ref('original-config.json',{'not_after_utc':end.isoformat()})
        row={'task_id':old['task_id'],'original_task_ref':original,'revised_task_ref':revision,
            'old_identity_sha256':a.digest(j.task(old['task_id'])['identity']),'last_attempt_id':record['attempt_id']if record else None,
            'last_request_ref':request,'last_request_body_sha256':a.digest(last),'failed_validation_ref':view,
            'old_instructions_sha256':hashlib.sha256(last['instructions'].encode()).hexdigest(),
            'new_instructions_sha256':hashlib.sha256(task['body']['instructions'].encode()).hexdigest(),
            'expected_global_attempt_count':n,'remaining_attempts':3-n,'classification':'unsent'if unsent else'completed_source_identity_failure'if wrong_identity else'completed_foreign_span_failure','wire_ceiling_bytes':140000}
        authority={'record_kind':g.REPAIR_KIND,'status':'approved','phase_id':a.PHASE_ID,'provider':g.PROVIDER,
            'repair_contract':g.REPAIR_CONTRACT,'global_max_attempts':3,'route_ref':self.route_ref,
            'parent_config_ref':parent,'not_after':end.isoformat(),'repair_retry_window_started_at':start.isoformat(),'entries':[row]}
        return task,self.ref('approval.json',authority),authority
    def test_append_only_amendment_same_task_preserves_old_outputs_costs_and_resume(self):
        j=self.journal();old=self.r3();task,ref,_=self.approval(j,old)
        before=j.attempts_for(old['task_id']);oldbytes=(self.root/'data/current/tasks/r3/task.json').read_bytes();beforecost=j.status()['reference_OpenAI_standard_usage_estimate_usd']
        j.amend_task(task,ref);self.assertEqual(j.current_task_ref('r3')['sha256'],a.digest(task));j.amend_task(task,ref)
        self.assertTrue(j.verify()['verified']);self.assertEqual(j.attempts_for('r3'),before);self.assertEqual(j.status()['reference_OpenAI_standard_usage_estimate_usd'],beforecost)
        self.assertEqual((self.root/'data/current/tasks/r3/task.json').read_bytes(),oldbytes)
        self.run_tasks(j,[task]);self.assertEqual([v['ordinal']for v in j.attempts_for('r3')],[1,2]);self.assertTrue(j.verify()['verified'])
        count=self.sends;self.run_tasks(j,[task]);self.assertEqual(self.sends,count)
    def test_two_local_attempts_last32k_gets_only_global_third_without_cap_reset(self):
        j=self.journal();old=self.r3();self.save_original(old)
        first=j.reserve(old,max_attempts=3);j.started(first['attempt_id'])
        def send(request,**_):return f.Response(f.native(json.loads(request.data),incomplete=True))
        result=self.transport(send).send(old,first['attempt_id'],'data/current/calls/'+first['attempt_id'])
        result['retry_request_max_output_tokens']=32768;j.finish(first['attempt_id'],result,retry_at=0)
        task,ref,_=self.approval(j,old,last_cap=32768)
        self.assertEqual(task['body']['max_output_tokens'],32768)
        before=deepcopy(j.attempts_for('r3'));j.amend_task(task,ref);self.run_tasks(j,[task]);self.run_tasks(j,[task])
        self.assertEqual([r['ordinal']for r in j.attempts_for('r3')],[1,2,3]);self.assertEqual(j.attempts_for('r3')[:2],before)
        self.assertTrue(j.verify()['verified'])
    def test_approved_retry_epoch_avoids_old_send_clock_but_cannot_be_reapproved(self):
        j=self.journal();task,ref,authority=self.approval(j,self.r3());j.amend_task(task,ref)
        epoch=j.retry_window_started_at('r3');self.assertIsNone(epoch);self.assertIsNone(j.approved_retry_window('r3')['started_at'])
        authority['repair_retry_window_started_at']=(datetime.now(timezone.utc)+timedelta(seconds=50)).isoformat()
        changed=self.ref('other-epoch.json',authority)
        with self.assertRaises(ValueError):j.amend_task(task,changed)
        self.assertEqual(j.retry_window_started_at('r3'),epoch)
    def test_repair_epoch_allows_bounded_cap_retry_after_hour_old_failed_source(self):
        j=self.journal();old=self.r3()
        oldstamp=(datetime.now(timezone.utc)-timedelta(hours=1)).isoformat()
        with patch.object(a,'now',return_value=oldstamp):task,ref,_=self.approval(j,old)
        j.amend_task(task,ref);new_sends=[]
        def send(request,**_):
            body=json.loads(request.data);new_sends.append(body['max_output_tokens'])
            return f.Response(f.native(body,incomplete=len(new_sends)==1))
        with patch.object(e,'retry_delay',return_value=0):
            self.run_tasks(j,[task],transport=self.transport(send),gate=lambda current:g.validate_amended_task(self.root,current,ref,allow_output_cap_variant=True))
        self.assertEqual(new_sends,[16384,32768]);self.assertEqual(len(j.attempts_for('r3')),3)
        self.assertTrue(j.verify()['verified'])

    def test_cap_variant_gate_cannot_change_immutable_amendment_or_other_fields(self):
        j=self.journal();task,ref,_=self.approval(j,self.r3());j.amend_task(task,ref)
        actual=deepcopy(task);actual['body']['max_output_tokens']=32768
        with self.assertRaises(ValueError):g.validate_amended_task(self.root,actual,ref)
        g.validate_amended_task(self.root,actual,ref,allow_output_cap_variant=True)
        with self.assertRaises(ValueError):j.amend_task(actual,ref)
        for key,value in [('instructions','changed'),('input','changed'),('max_output_tokens',32769)]:
            bad=deepcopy(actual);bad['body'][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):g.validate_amended_task(self.root,bad,ref,allow_output_cap_variant=True)
        # Pure gate permission does not schedule a cap: financial reserve still
        # requires the exact cap already recorded in current retry_wait state.
        with self.assertRaises(ValueError):j.reserve(task,max_attempts=3,request_body=actual['body'])

    def test_probe_pause_does_not_start_window_until_first_new_reservation_and_resume_cannot_reset(self):
        j=self.journal();task,ref,authority=self.approval(j,self.r3());j.amend_task(task,ref)
        self.assertIsNone(j.retry_window_started_at('r3'))
        later=datetime.now(timezone.utc)+timedelta(minutes=25)
        with patch.object(a,'now',return_value=later.isoformat()):
            record=j.reserve(task,max_attempts=3)
        self.assertEqual(record['repair_retry_window_started_at'],record['reserved_at'])
        self.assertEqual(j.retry_window_started_at('r3'),later.timestamp())
        j.amend_task(task,ref)
        self.assertEqual(j.retry_window_started_at('r3'),later.timestamp())
        self.assertTrue(j.verify()['verified'])
        j.close();j.db=None
        reopened=self.journal();self.assertEqual(reopened.retry_window_started_at('r3'),later.timestamp())
        # A durable unknown/interrupted send is not turned into another retry.
        reopened.recover_interrupted();self.assertNotEqual(reopened.task('r3')['state'],'retry_wait')

    def test_140k_typed_wire_is_gateway_only_and_never_a_new_native_allowance(self):
        task=self.r3();task['body']['input']='x'*110000
        # Padding creates a 120k..140k body; it is only a wire-validation fixture.
        task['metadata'].update(enum_repair={'kind':'current_sent_catalog_span_enum_only','old_body_sha256':'a'*64},wire_ceiling_bytes=140000)
        while len(a.canonical(task['body']))<=120000:task['body']['input']+='x'*1000
        self.assertLessEqual(len(a.canonical(task['body'])),140000)
        with self.assertRaises(ValueError):a.validate_task(task)
        self.assertTrue(a.validate_task(task,wire_ceiling_bytes=a.reviewed_wire_ceiling(task)))
        self.assertGreater(a.quote(task)['wire_bytes'],120000)
        bad=deepcopy(task);bad['metadata']['provider']='openai'
        with self.assertRaises(ValueError):a.quote(bad)
        bad=deepcopy(task);bad['stage']='R2';bad['model']=a.MODELS['R2'];bad['body']['model']=bad['model']
        with self.assertRaises(ValueError):a.quote(bad)

    def test_source_identity_failure_is_separate_typed_exact_scope(self):
        j=self.journal();task,ref,_=self.approval(j,self.r3(),wrong_identity=True);j.amend_task(task,ref);self.assertTrue(j.verify()['verified'])
    def test_unsent_same_id_amends_without_inventing_a_prior_send(self):
        j=self.journal();task,ref,_=self.approval(j,self.r3(),unsent=True);j.amend_task(task,ref)
        self.assertEqual(len(j.attempts_for('r3')),0);self.run_tasks(j,[task]);self.assertEqual(len(j.attempts_for('r3')),1);self.assertTrue(j.verify()['verified'])
    def test_unknown_or_exhausted_or_valid_completed_cannot_amend(self):
        for bad in ('unknown','exhausted','valid'):
            with self.subTest(bad=bad):
                j=self.journal();task,ref,value=self.approval(j,self.r3())
                if bad=='unknown':j.db.execute("UPDATE attempts SET state='held_unknown_gateway_send'")
                if bad=='exhausted':
                    value['entries'][0]['expected_global_attempt_count']=3;value['entries'][0]['remaining_attempts']=0;ref=self.ref('approval-exhausted.json',value)
                if bad=='valid':
                    c=j.task('r3')['callback'];v=json.loads(a.checked_ref(self.root,c['artifact']));v['validation']['decision_valid']=True
                    view=self.ref('validview.json',v);j.db.execute('UPDATE tasks SET callback=?',(a.canonical({'status':'source_checked','artifact':view}).decode(),))
                j.db.commit()
                with self.assertRaises(ValueError):j.amend_task(task,ref)
                j.close();j.db=None
                # Fresh fixture for next case.
                if bad!='valid':self.tearDown();self.setUp()
    def test_wrong_count_source_prompt_cap_schema_or_revision_rejected(self):
        j=self.journal();task,ref,authority=self.approval(j,self.r3())
        for kind in ('count','source','prompt','cap','schema','wire','deadline','route'):
            changed=deepcopy(task);value=deepcopy(authority)
            if kind=='count':value['entries'][0]['expected_global_attempt_count']=0
            elif kind=='source':changed['metadata']['source_ref']=self.ref('other-source.json',{'untrusted':True})
            elif kind=='prompt':changed['body']['instructions']+=' changed'
            elif kind=='cap':changed['body']['max_output_tokens']=32768
            elif kind=='schema':changed['body']['text']['format']['schema']['additionalProperties']=True
            elif kind=='wire':changed['metadata']['wire_ceiling_bytes']=150000
            elif kind=='deadline':value['not_after']=(datetime.now(timezone.utc)+timedelta(days=9)).isoformat()
            elif kind=='route':value['route_ref']={**self.route_ref,'sha256':'f'*64}
            value['entries'][0]['revised_task_ref']=self.ref('data/current/tasks/r3/revisions/'+a.digest(changed)+'/task.json',changed)
            approval=self.ref('bad-'+kind+'.json',value)
            with self.subTest(kind=kind),self.assertRaises(ValueError):j.amend_task(changed,approval)
    def test_schema_revision_cannot_register_fresh_or_enter_native_journal(self):
        j=self.journal();task,ref,_=self.approval(j,self.r3());j.close();j.db=None
        direct=self.direct()
        with self.assertRaises(ValueError):direct.register(task)
        direct.close();j=self.journal();task['task_id']='newid'
        with self.assertRaises((ValueError,a.BudgetBlocked)):j.register(task)
    def test_replay_checks_identity_at_each_event_and_original_history_is_exact(self):
        j=self.journal();task,ref,_=self.approval(j,self.r3());j.amend_task(task,ref);self.run_tasks(j,[task]);j.verify()
        j.db.execute("UPDATE tasks SET identity=? WHERE task_id='r3'",(a.canonical(g.task_identity(self.r3())).decode(),));j.db.commit()
        with self.assertRaises(ValueError):j.verify()

if __name__=='__main__':unittest.main()
