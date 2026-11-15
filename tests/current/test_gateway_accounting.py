"""Temporary provider journals and fake HTTP only; no actual credential loaders."""
import copy
import hashlib
import itertools
import json
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest

from metamelanoma import accounting as a,execution as e,gateway_accounting as g,usage_reconciliation as u
from metamelanoma.gateway import GatewayTransport,GatewaySettings
from metamelanoma.transport import NativeTransport,Settings

IDS=itertools.count()


class Response:
    status=200
    def __init__(self,body,headers=None):
        self.body=a.canonical(body);self.headers={'x-request-id':'req-fixture-'+str(next(IDS)),**(headers or {})}
    def __enter__(self):return self
    def __exit__(self,*_):return False
    def geturl(self):return 'https://fixture.cornell.edu/v1/responses'
    def read(self):return self.body


def native(body,*,incomplete=False,response_id=None):
    return {'id':response_id or'resp-fixture-'+str(next(IDS)),'model':body['model'],'service_tier':body['service_tier'],
        'reasoning':{'effort':'high'},'status':'incomplete'if incomplete else'completed',
        'incomplete_details':{'reason':'max_output_tokens'}if incomplete else None,
        'usage':{'input_tokens':100,'output_tokens':body['max_output_tokens']if incomplete else 20,
            'total_tokens':100+(body['max_output_tokens']if incomplete else 20),
            'input_tokens_details':{'cached_tokens':0,'cache_write_tokens':0,'cache_write_tokens_details':{'ttl_30m_tokens':0,'ttl_12h_tokens':0}},
            'output_tokens_details':{'reasoning_tokens':10}},
        'output':[{'type':'message','content':[{'type':'output_text','text':'{"ok":true}'}]}]}


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name).resolve();self.sends=0
        self.baseline={'amount_usd':a.BASELINE_USD,'proof_refs':[self.ref('prior.json',{'amount':a.BASELINE_USD})],
            'held_rows_ref':self.ref('holds.json',{'historical':'unchanged'})}
        p=self.root/a.FLEX_PRICING_REF['path'];p.parent.mkdir(parents=True);p.write_bytes((Path(__file__).resolve().parents[2]/a.FLEX_PRICING_REF['path']).read_bytes())
        self.source=self.ref('source.json',{'pmid':'1','text':'Exact scientific source'})
        self.cohort=self.ref('cohort.json',[{'pmid':'1'},{'pmid':'2'}])
        self.catalog=self.ref('catalog.json',{'http_status':200,'models_present':list(a.MODELS.values())})
        registry=self.root/'data/current/articles.sqlite3';registry.parent.mkdir(parents=True,exist_ok=True)
        db=sqlite3.connect(registry);db.execute('CREATE TABLE decisions(id INTEGER PRIMARY KEY,pmid TEXT,stage TEXT,status TEXT)');db.commit();db.close()
        direct=self.direct();value=self.task('direct',provider='openai',tier='flex')
        p=self.root/'data/current/tasks/direct/task.json';p.parent.mkdir(parents=True);p.write_bytes(a.canonical(value));direct.register(value);direct.close()
        self.route_ref=self.route()

    def ref(self,path,value):
        p=self.root/path;p.parent.mkdir(parents=True,exist_ok=True);raw=a.canonical(value);p.write_bytes(raw)
        return {'path':path,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}

    def task(self,name='gateway',provider=g.PROVIDER,tier='default'):
        return {'task_id':name,'stage':'R2','model':a.MODELS['R2'],
            'metadata':{'phase_id':a.PHASE_ID,'provider':provider,'pmid':'1','report_id':'r1','source_ref':self.source,'max_output_tokens_ceiling':16384},
            'body':{'model':a.MODELS['R2'],'instructions':'Exact supplied source','input':'Source',
                'reasoning':{'effort':'high'},'max_output_tokens':8192,'service_tier':tier,'store':False,
                'prompt_cache_options':{'ttl':'30m'},'text':{'format':{'type':'json_schema','strict':True,'name':'test',
                    'schema':{'type':'object','additionalProperties':False,'properties':{},'required':[]}}}}}

    def direct(self):return a.Journal(a.JOURNAL_PATH,root=self.root,phase_id=a.PHASE_ID,baseline=self.baseline)

    def route(self):
        db=g.readonly(self.root,a.JOURNAL_PATH)
        try:head=dict(db.execute('SELECT seq,event_hash FROM events ORDER BY seq DESC LIMIT 1').fetchone())
        finally:db.close()
        seed=g.prepare_switch_seed(self.root,direct_journal_head=head,cohort_ref=self.cohort)
        return self.ref('route.json',{'phase_id':a.PHASE_ID,'provider':g.PROVIDER,'account':g.ACCOUNT,
            'endpoint':'https://fixture.cornell.edu/v1/responses','models':a.MODELS,'reasoning_effort':'high','service_tier':'default',
            'authorization':'Fixture user explicitly selected Cornell','catalog_ref':self.catalog,'cohort_ref':self.cohort,
            'switch_seed_ref':seed,'direct_journal_head':head,'direct_allowance_unchanged':'100'})

    def journal(self):
        journal=g.GatewayJournal(self.root,route_ref=self.route_ref)
        self.addCleanup(lambda:journal.close()if getattr(journal,'db',None)else None);return journal

    def prior_known_failures(self,count):
        direct=self.direct();value=self.task('direct',provider='openai',tier='flex')
        for index in range(count):
            r=direct.reserve(value,max_attempts=3)
            direct.finish(r['attempt_id'],{'status':'provider_problem','sent':True,'response':{'id':'direct-resp-'+str(index),'model':value['model'],'service_tier':'flex'},
                'provider_request_id':'direct-req-'+str(index),'usage':{'input_tokens':1,'output_tokens':1},
                'error':{'type':'http_error'},'http_status':503,'artifacts':{}},retry_at=time.time()+1)
        direct.close();self.route_ref=self.route()

    def transport(self,sender=None):
        def send(request,**_):
            self.sends+=1;return Response(native(json.loads(request.data)),{'x-litellm-response-cost':'0.0123'})
        return GatewayTransport(root=self.root,expected_endpoint='https://fixture.cornell.edu/v1/responses',
            settings_loader=lambda *_args,**_kwargs:GatewaySettings('fixture-private-key',.2,'https://fixture.cornell.edu'),sender=sender or send)

    def run_tasks(self,journal,values=None,**kwargs):
        return e.execute(values or[self.task()],journal=journal,on_result=lambda *_:{'status':'source_checked'},
            transport=kwargs.pop('transport',self.transport()),max_workers=kwargs.pop('max_workers',1),**kwargs)

    def test_success_resume_costs_are_not_native_allowance_or_invoice(self):
        j=self.journal();self.run_tasks(j);self.run_tasks(j);self.assertEqual(self.sends,1)
        status=j.status();self.assertIsNone(status['phase_allowance_usd']);self.assertEqual(status['native_direct_openai_charges_created'],0)
        self.assertEqual(status['gateway_reported_proxy_estimate_usd'],'0.0123');self.assertTrue(status['reference_estimate_is_not_gateway_invoice'])
        self.assertTrue(j.verify()['verified'])

    def test_shared_project_owner_lease_blocks_native_concurrent_writer(self):
        self.journal()
        with self.assertRaises(RuntimeError):self.direct()

    def test_unknown_send_not_blindly_retried_or_rebilled_after_resume(self):
        j=self.journal()
        def fail(*_,**__):self.sends+=1;raise TimeoutError('fixture timeout')
        self.run_tasks(j,transport=self.transport(fail));self.run_tasks(j,transport=self.transport(fail))
        self.assertEqual(self.sends,1);self.assertEqual(j.task('gateway')['state'],'provider_hold')
        self.assertEqual(j.status()['attempt_states'],{'held_unknown_gateway_send':1})

    def test_completed_direct_source_is_skipped_without_gateway_send(self):
        direct=self.direct();value=self.task('direct',provider='openai',tier='flex');r=direct.reserve(value,max_attempts=3)
        direct.finish(r['attempt_id'],{'status':'completed','sent':True,'response':{'id':'prior-response','model':value['model'],'service_tier':'flex'},'provider_request_id':'prior-request','usage':{'input_tokens':1,'output_tokens':1},'error':None,'artifacts':{}});direct.close()
        self.route_ref=self.route();j=self.journal();self.run_tasks(j)
        self.assertEqual(self.sends,0);self.assertEqual(j.task('gateway')['state'],'blocked_prior_completed_source')

    def test_pending_source_cannot_reset_global_attempt_limit_with_new_id(self):
        j=self.journal();value=self.task();j.register(value)
        other=self.task('different-id')
        with self.assertRaises(a.BudgetBlocked):j.register(other)

    def test_phase_provider_port_boundaries_before_reservation(self):
        j=self.journal()
        for key,value in [('phase_id','other'),('provider','openai')]:
            task=self.task();task['metadata'][key]=value
            with self.assertRaises(ValueError):j.register(task)

    def test_completed_payload_tamper_is_frozen_not_promoted(self):
        j=self.journal();value=self.task();r=j.reserve(value,max_attempts=3);j.started(r['attempt_id'])
        result=self.transport().send(value,r['attempt_id'],'data/current/calls/'+r['attempt_id']);result['payload']={'forged':True}
        j.finish(r['attempt_id'],result)
        self.assertIsNotNone(j.status()['frozen_reason']);self.assertIsNone(result['payload'])
        self.assertEqual(j.task(value['task_id'])['state'],'provider_hold');self.assertTrue(j.verify()['verified'])

    def test_duplicate_provider_response_preserves_original_and_freezes(self):
        j=self.journal();first=self.task();second=self.task('second');second['metadata']['pmid']='2';second['metadata']['source_ref']=self.ref('source2.json',{'pmid':'2','text':'different'})
        def send(request,**_):self.sends+=1;return Response(native(json.loads(request.data),response_id='same-response'))
        self.run_tasks(j,[first,second],transport=self.transport(send))
        self.assertIsNotNone(j.status()['frozen_reason']);self.assertTrue(j.verify()['verified'])

    def test_projection_or_chain_tamper_rejected(self):
        j=self.journal();self.run_tasks(j);j.db.execute("UPDATE tasks SET state='pending'");j.db.commit()
        with self.assertRaises(ValueError):j.verify()

    def test_failure_usage_or_cost_header_drift_cannot_be_reported_cost(self):
        j=self.journal();value=self.task();r=j.reserve(value,max_attempts=3);j.started(r['attempt_id'])
        def send(request,**_):
            body=native(json.loads(request.data));body['status']='failed';body['error']={'code':'service_unavailable'}
            response=Response(body,{'x-litellm-response-cost':'0.123'});response.status=503;return response
        result=self.transport(send).send(value,r['attempt_id'],'data/current/calls/'+r['attempt_id'])
        result['usage']={'input_tokens':0,'output_tokens':0};result['headers']['x-litellm-response-cost']='0'
        j.finish(r['attempt_id'],result)
        self.assertIsNone(j.status()['gateway_reported_proxy_estimate_usd'])
        self.assertIsNotNone(j.status()['frozen_reason']);self.assertTrue(j.verify()['verified'])

    def test_two_prior_attempts_allow_only_gateway_global_third(self):
        self.prior_known_failures(2);j=self.journal();self.run_tasks(j);self.run_tasks(j)
        self.assertEqual(self.sends,1)
        self.assertEqual([r['ordinal']for r in j.attempts_for('gateway')],[1,2,3])
        self.assertEqual(j.verify()['gateway_attempts'],1)

    def test_exhausted_prior_source_does_not_hold_unrelated_work(self):
        self.prior_known_failures(3);j=self.journal();fresh=self.task('fresh')
        fresh['metadata']['pmid']='2';fresh['metadata']['source_ref']=self.ref('fresh-source.json',{'pmid':'2','text':'fresh'})
        result=self.run_tasks(j,[self.task(),fresh])
        self.assertEqual(result['phase'],'finished');self.assertEqual(self.sends,1)
        self.assertEqual(j.task('gateway')['state'],'blocked_prior_attempts_exhausted')
        self.assertEqual(j.verify()['gateway_attempts'],1)


if __name__=='__main__':unittest.main()
