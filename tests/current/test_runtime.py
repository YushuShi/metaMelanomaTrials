"""Real temporary journals and fake fixed-origin HTTP; never loads a real key."""
import copy
import hashlib
import json
import itertools
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from metamelanoma import accounting as a, execution as e, transport as t
IDS = itertools.count()


def task(name='report-1', stage='R2', **extra):
    model = a.MODELS[stage]
    return {'task_id': name, 'stage': stage, 'model': model, 'metadata': {'report_id': name},
            'body': {'model': model, 'instructions': 'Use the exact supplied source.', 'input': 'Source text.',
                     'reasoning': {'effort': 'high'}, 'max_output_tokens': 1024, 'store': False,
                     'service_tier': 'default', 'prompt_cache_options': {'ttl': '30m'},
                     'text': {'format': {'type': 'json_schema', 'name': 'test', 'strict': True,
                                        'schema': {'type': 'object', 'additionalProperties': False,
                                                   'properties': {}, 'required': []}}}}, **extra}


class Response:
    def __init__(self, body, status=200, headers=None):
        self.body = json.dumps(body).encode()
        self.status = status
        self.headers = headers or {'x-request-id': 'provider-fixture-'+str(next(IDS))}
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def geturl(self): return t.ENDPOINT
    def read(self): return self.body


def completed(model='gpt-6.1-sol', payload=None):
    return {'id': 'response-fixture-'+str(next(IDS)), 'model': model, 'service_tier': 'default', 'status': 'completed',
            'reasoning': {'effort': 'high'},
            'usage': {'input_tokens': 100, 'output_tokens': 20,
                      'input_tokens_details': {'cached_tokens': 10, 'cache_write_tokens': 40,
                                              'cache_write_tokens_details': {'ttl_30m_tokens': 40, 'ttl_12h_tokens': 0}}},
            'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(payload or {'ok': True})}]}]}


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.loads = self.sends = 0
        self.baseline = {'amount_usd': a.BASELINE_USD, 'proof_refs': [self.ref('prior.json', {'liability': a.BASELINE_USD})],
                         'held_rows_ref': self.ref('holds.json', {'old': {'state': 'held_incomplete_usage', 'liability': '1'}})}
        fixture = Path(__file__).resolve().parents[2] / a.FLEX_PRICING_REF['path']
        target = self.root / a.FLEX_PRICING_REF['path'];target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(fixture.read_bytes())

    def ref(self, name, value):
        raw = a.canonical(value)
        (self.root / name).write_bytes(raw)
        return {'path': name, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}

    def journal(self):
        journal = a.Journal(a.JOURNAL_PATH, root=self.root, phase_id=a.PHASE_ID, baseline=self.baseline)
        self.addCleanup(lambda: journal.close() if getattr(journal, 'db', None) else None)
        return journal

    def loader(self, *args, **kwargs):
        self.loads += 1
        return t.Settings('fixture-private-key', .5)

    def transport(self, sender=None):
        def send(request, **kwargs):
            self.sends += 1
            self.assertEqual(request.full_url, t.ENDPOINT)
            self.assertEqual(request.get_method(), 'POST')
            return Response(completed())
        return t.NativeTransport(root=self.root, sender=sender or send, settings_loader=self.loader)

    def run_tasks(self, journal, tasks=None, **kwargs):
        return e.execute(tasks or [task()], journal=journal, transport=kwargs.pop('transport', self.transport()),
                         on_result=kwargs.pop('on_result', lambda task, result: {'status': 'source_checked' if result['status'] == 'completed' else 'provider_problem'}), **kwargs)

    def test_carry_forward_and_reopen_never_reset(self):
        j = self.journal()
        self.run_tasks(j)
        total = j.status()['cumulative_liability_usd']
        self.assertGreater(float(total), 144.959774)
        self.assertEqual(j.status()['phase_allowance_usd'], '100.000000000')
        j.close();j.db = None
        k = self.journal()
        self.run_tasks(k)
        self.assertEqual(k.status()['cumulative_liability_usd'], total)
        self.assertEqual(self.sends, 1)
        self.assertTrue(k.verify()['verified'])

    def test_fixed_phase_path_and_no_extra_allowance(self):
        for changes in ({'path': 'data/other.sqlite3'}, {'phase_id': 'new-run'}, {'allowance_usd': '101'}):
            args = {'path': a.JOURNAL_PATH, 'root': self.root, 'phase_id': a.PHASE_ID, 'baseline': self.baseline, **changes}
            with self.assertRaises(ValueError): a.Journal(**args)

    def test_second_owner_rejected(self):
        j = self.journal()
        with self.assertRaises(RuntimeError):
            a.Journal(a.JOURNAL_PATH, root=self.root, phase_id=a.PHASE_ID, baseline=self.baseline)
        self.assertEqual(j.status()['phase_liability_usd'], '0.000000000')

    def test_baseline_input_tamper_rejected_before_journal(self):
        (self.root / 'holds.json').write_text('{}')
        with self.assertRaises(ValueError): self.journal()
        self.assertFalse((self.root / a.JOURNAL_PATH).exists())

    def test_alias_journal_rejected_before_read(self):
        outside = self.root / 'private.env';outside.write_text('do not read')
        destination = self.root / a.JOURNAL_PATH;destination.parent.mkdir(parents=True)
        destination.symlink_to(outside)
        with self.assertRaises(ValueError): self.journal()
        self.assertEqual(outside.read_text(), 'do not read')

    def test_same_task_changed_source_body_refused(self):
        j = self.journal();self.run_tasks(j)
        changed = task();changed['body']['input'] = 'Different source'
        with self.assertRaises(ValueError): self.run_tasks(j, [changed])
        self.assertEqual(self.sends, 1)

    def test_real_immutable_artifacts_and_credential_not_saved(self):
        j = self.journal();self.run_tasks(j)
        result = j.task('report-1')['result']
        for reference in result['artifacts'].values():
            raw = a.checked_ref(self.root, reference)
            self.assertNotIn(b'fixture-private-key', raw)
        request = json.loads(a.checked_ref(self.root, result['artifacts']['request']))
        self.assertEqual(request['endpoint'], t.ENDPOINT)
        self.assertEqual(result['caller_http_attempts'], 1)
        self.assertEqual(result['automatic_retries'], 0)

    def test_gate_before_credentials_reservation_and_send(self):
        j = self.journal()
        result = self.run_tasks(j, gate=lambda task: False)
        self.assertEqual(self.loads, 0);self.assertEqual(self.sends, 0)
        self.assertEqual(result['phase'], 'held')
        self.assertEqual(j.verify()['attempts'], 0)

    def test_worker_gate_change_releases_only_proven_unsent(self):
        j = self.journal();calls = []
        def gate(task):
            calls.append(task['task_id']);return len(calls) == 1
        self.run_tasks(j, gate=gate)
        self.assertEqual(self.loads, 0);self.assertEqual(self.sends, 0)
        self.assertEqual(j.status()['phase_liability_usd'], '0.000000000')
        self.assertEqual(j.status()['attempt_states'], {'cancelled_before_send': 1})

    def test_cap_full_reservation_before_credentials(self):
        j = self.journal()
        status = j.status();status.update(phase_remaining_units=0, total_remaining_units=0)
        with patch.object(j, 'status', return_value=status):
            with self.assertRaises(a.BudgetBlocked): j.reserve(task(), max_attempts=3)
        self.assertEqual(self.loads, 0);self.assertEqual(self.sends, 0)
        self.assertEqual(j.verify()['attempts'], 0)

    def test_temporary_inflight_capacity_waits_for_settlement(self):
        j=self.journal();original=j.status;ceiling=a.quote(task())['liability_units']*3//2
        def constrained_status():
            result=original();expense=a.units(result['phase_liability_usd'])
            result.update(phase_remaining_units=ceiling-expense,total_remaining_units=ceiling-expense)
            return result
        # A simulated small remaining window can reserve only one worst-case
        # attempt at a time, but actual usage leaves room for both requests.
        with patch.object(j,'status',side_effect=constrained_status):
            result=self.run_tasks(j,[task('one'),task('two')],max_workers=2)
        self.assertEqual(self.sends,2);self.assertEqual(result['phase'],'finished')
        self.assertTrue(j.verify()['verified'])

    def test_transient_retries_each_metered_and_resume_not_rebilled(self):
        j = self.journal()
        def sender(*args, **kwargs):
            self.sends += 1
            return Response({'error': {'code': 'server_error'}}, 503, {'retry-after': '0'})
        with patch.object(e, 'retry_delay', return_value=0):
            self.run_tasks(j, transport=self.transport(sender))
        self.assertEqual(self.sends, 3)
        self.assertEqual(j.status()['attempt_states'], {'held_unknown_usage': 3})
        self.assertEqual(a.units(j.status()['phase_liability_usd']), 3 * a.quote(task())['liability_units'])
        self.run_tasks(j, transport=self.transport(sender))
        self.assertEqual(self.sends, 3)
        self.assertEqual(j.task('report-1')['state'], 'provider_hold')

    def test_quota_error_not_retried(self):
        j = self.journal()
        def sender(*args, **kwargs):
            self.sends += 1;return Response({'error': {'code': 'insufficient_quota'}}, 429)
        self.run_tasks(j, transport=self.transport(sender))
        self.assertEqual(self.sends, 1)

    def test_timeout_bounded_attempts_preserve_each_hold(self):
        j = self.journal()
        def sender(*args, **kwargs): self.sends += 1;raise TimeoutError()
        with patch.object(e, 'retry_delay', return_value=0):
            self.run_tasks(j, transport=self.transport(sender), max_attempts=2)
        self.assertEqual(self.sends, 2)
        self.assertEqual(j.status()['attempt_states'], {'held_unknown_usage': 2})
        self.assertTrue(j.verify()['verified'])

    def test_incomplete_output_full_hold_and_no_identical_retry(self):
        j = self.journal()
        def sender(*args, **kwargs):
            self.sends += 1;x = completed();x.update(status='incomplete', incomplete_details={'reason': 'max_output_tokens'})
            return Response(x)
        self.run_tasks(j, transport=self.transport(sender))
        self.assertEqual(self.sends, 1)
        self.assertEqual(j.status()['attempt_states'], {'held_incomplete_usage': 1})
        self.assertEqual(a.units(j.status()['phase_liability_usd']), a.quote(task())['liability_units'])

    def test_explicit_output_ceiling_retry_conserves_original_charge(self):
        j = self.journal();x = task();x['metadata']['max_output_tokens_ceiling'] = 2048
        bodies = []
        def sender(request, **kwargs):
            body = json.loads(request.data);bodies.append(body)
            value = completed()
            if len(bodies) == 1:
                value.update(status='incomplete', incomplete_details={'reason': 'max_output_tokens'})
            return Response(value)
        with patch.object(e, 'retry_delay', return_value=0):
            self.run_tasks(j, [x], transport=self.transport(sender))
        self.assertEqual([b['max_output_tokens'] for b in bodies], [1024, 2048])
        self.assertEqual({k:v for k,v in bodies[0].items() if k!='max_output_tokens'},
                         {k:v for k,v in bodies[1].items() if k!='max_output_tokens'})
        history = j.attempts_for(x['task_id'])
        self.assertEqual([r['ordinal'] for r in history], [1,2])
        self.assertEqual(history[0]['state'], 'held_incomplete_usage')
        self.assertEqual(history[0]['liability'], history[0]['reservation'])
        self.assertNotEqual(history[0]['record']['quote']['body_sha256'], history[1]['record']['quote']['body_sha256'])
        self.assertEqual(j.task(x['task_id'])['result']['max_output_tokens'], 2048)
        self.assertTrue(j.verify()['verified'])

    def test_output_cap_and_transient_share_global_three_attempts(self):
        j = self.journal();x = task();x['metadata']['max_output_tokens_ceiling'] = 4096
        caps = []
        def sender(request, **kwargs):
            cap = json.loads(request.data)['max_output_tokens'];caps.append(cap)
            if len(caps) == 2: return Response({'error': {'code':'server_error'}}, 503)
            value = completed();value.update(status='incomplete', incomplete_details={'reason':'max_output_tokens'})
            return Response(value)
        with patch.object(e, 'retry_delay', return_value=0):
            self.run_tasks(j, [x], transport=self.transport(sender))
        self.assertEqual(caps, [1024,2048,2048])
        self.assertEqual(len(j.attempts_for(x['task_id'])), 3)
        self.assertEqual(j.task(x['task_id'])['state'], 'provider_hold')

    def test_unscheduled_output_or_source_variant_rejected(self):
        j = self.journal();x=task();x['metadata']['max_output_tokens_ceiling']=2048
        attempt=j.reserve(x,max_attempts=3);j.started(attempt['attempt_id'])
        j.finish(attempt['attempt_id'], {'status':'provider_problem','sent':True,'usage':None,'error':{'type':'incomplete_output'}},retry_at=0)
        changed={**x['body'],'max_output_tokens':2048}
        with self.assertRaises(ValueError):j.reserve(x,max_attempts=3,request_body=changed)
        changed['input']='Changed source'
        with self.assertRaises(ValueError):j.reserve(x,max_attempts=3,request_body=changed)

    def test_duplicate_structured_output_held(self):
        j=self.journal()
        def sender(*args,**kwargs):
            value=completed();value['output'][0]['content'][0]['text']='{"ok":true,"ok":false}'
            return Response(value)
        self.run_tasks(j,transport=self.transport(sender))
        self.assertEqual(j.task('report-1')['result']['error']['type'],'invalid_structured_output')
        self.assertEqual(len(j.attempts_for('report-1')),1)

    def test_scientific_failure_charged_once_unrelated_continues(self):
        j = self.journal();owner = threading.get_ident();callbacks = []
        def callback(task, result):
            self.assertEqual(threading.get_ident(), owner)
            callbacks.append(task['task_id']);return {'status': 'needs_review' if task['task_id'] == 'bad' else 'source_checked'}
        self.run_tasks(j, [task('bad'), task('good')], on_result=callback)
        self.assertEqual(self.sends, 2)
        self.assertEqual(j.task('bad')['state'], 'scientific_hold')
        self.assertEqual(j.task('good')['state'], 'completed')
        self.assertEqual(len(callbacks), 2)

    def test_callback_error_can_resume_without_api(self):
        j = self.journal()
        def fail(*args): raise ValueError('fixture scientific callback')
        self.run_tasks(j, on_result=fail)
        self.assertEqual(j.task('report-1')['state'], 'callback_error')
        self.run_tasks(j)
        self.assertEqual(self.sends, 1)
        self.assertEqual(j.task('report-1')['state'], 'completed')

    def test_interrupted_unsettled_attempt_never_resent(self):
        j = self.journal();attempt = j.reserve(task(), max_attempts=3);j.started(attempt['attempt_id'])
        self.run_tasks(j)
        self.assertEqual(self.sends, 0)
        self.assertEqual(j.status()['attempt_states'], {'held_unknown_usage': 1})
        self.assertEqual(j.task('report-1')['state'], 'provider_hold')

    def test_projection_tamper_rejected_on_verify(self):
        j = self.journal();self.run_tasks(j)
        j.db.execute('UPDATE attempts SET liability=0');j.db.commit()
        with self.assertRaises(ValueError): j.verify()

    def test_empty_replay_cannot_reset_existing_allowance(self):
        j=self.journal();self.run_tasks(j)
        for table in ('tasks','attempts','events'):j.db.execute('DELETE FROM '+table)
        j.db.commit()
        with self.assertRaises(ValueError):j.verify()

    def test_missing_journal_with_existing_marker_refuses_new_allowance(self):
        j=self.journal();self.run_tasks(j);j.close();j.db=None
        (self.root/a.JOURNAL_PATH).unlink()
        with self.assertRaises(ValueError):self.journal()

    def test_freeze_projection_cannot_be_cleared(self):
        j=self.journal();attempt=j.reserve(task(),max_attempts=3);j.started(attempt['attempt_id'])
        j.finish(attempt['attempt_id'],{'status':'provider_problem','sent':True,'usage':None,'error':{'type':'returned_route_mismatch'}})
        self.assertTrue(j.verify()['verified'])
        j.db.execute("DELETE FROM metadata WHERE key='frozen_reason'");j.db.commit()
        with self.assertRaises(ValueError):j.verify()

    def test_sqlite_sidecar_alias_rejected_before_connection(self):
        p=self.root/a.JOURNAL_PATH;p.parent.mkdir(parents=True)
        target=self.root/'private.env';target.write_text('unchanged')
        Path(str(p)+'-wal').symlink_to(target)
        with patch.object(a.sqlite3,'connect') as connect:
            with self.assertRaises(ValueError):self.journal()
            connect.assert_not_called()

    def test_cached_artifact_tamper_rejected(self):
        j=self.journal();self.run_tasks(j)
        reference=j.task('report-1')['result']['artifacts']['raw_response']
        (self.root/reference['path']).write_text('{}')
        with self.assertRaises(ValueError):j.verify()

    def test_duplicate_provider_id_preserves_full_charge_and_blocks_promotion(self):
        j=self.journal();observed=[]
        def sender(*args,**kwargs):
            value=completed();value['id']='same-response'
            return Response(value,headers={'x-request-id':'same-request'})
        def callback(task,result):
            observed.append((task['task_id'],result['status'],result['payload']))
            return {'status':'source_checked'}
        self.run_tasks(j,[task('first'),task('duplicate')],transport=self.transport(sender),on_result=callback,max_workers=1)
        duplicate=j.task('duplicate')
        self.assertEqual(duplicate['state'],'provider_hold')
        self.assertIsNone(duplicate['result']['payload'])
        self.assertTrue(j.status()['frozen_reason'])
        row=j.attempts_for('duplicate')[0]
        self.assertEqual(row['liability'],row['reservation'])
        self.assertEqual(row['state'],'held_duplicate_provider_identity')
        self.assertTrue(j.verify()['verified'])

    def test_secret_parent_rejected_before_read(self):
        folder=self.root/'private.env';folder.mkdir();path=folder/'payload.json';path.write_text('{}')
        reference={'path':'private.env/payload.json','sha256':hashlib.sha256(b'{}').hexdigest(),'bytes':2}
        with patch.object(Path,'read_bytes',side_effect=AssertionError('private read')):
            with self.assertRaises(ValueError):a.checked_ref(self.root,reference)

    def test_prior_account_provider_identity_cannot_be_billed_as_new(self):
        self.baseline['provider_identifiers_ref']=self.ref('provider_ids.json',{
            'record_kind':'frozen_historical_native_provider_identifiers','identifiers':[
                {'kind':'response','value':'old-response','original_call_ids':['native-old-preserved']}]})
        j=self.journal()
        def sender(*args,**kwargs):
            value=completed();value['id']='old-response';return Response(value)
        self.run_tasks(j,transport=self.transport(sender))
        row=j.attempts_for('report-1')[0]
        self.assertEqual(row['state'],'held_duplicate_provider_identity')
        self.assertEqual(j.task('report-1')['state'],'provider_hold')
        self.assertTrue(j.verify()['verified'])

    def test_usage_cache_components_and_no_scale_rounding(self):
        usage = completed()['usage']
        expected = a.units(('0.0000025'))  # direct independent arithmetic below
        from decimal import Decimal
        expected = a.units((Decimal(10)*Decimal('.10') + Decimal(40)*Decimal('2.50') + Decimal(50)*Decimal('2') + Decimal(20)*Decimal('10')) / 1_000_000)
        self.assertEqual(a.usage_cost('gpt-6.1-sol', usage), expected)
        self.assertIsNone(a.usage_cost('gpt-6.1-sol', {'input_tokens': True, 'output_tokens': 1}))
        self.assertGreaterEqual(a.quote(task())['liability_units'], expected)

    def test_usage_over_reservation_freezes_after_recording_actual(self):
        j = self.journal();attempt = j.reserve(task(), max_attempts=3);j.started(attempt['attempt_id'])
        j.finish(attempt['attempt_id'], {'status': 'completed', 'sent': True, 'provider_request_id':'unique-overrun',
            'response':{'id':'unique-response-overrun'},'usage': {'input_tokens': 10_000_000, 'output_tokens': 100}, 'error': None})
        self.assertTrue(j.status()['frozen_reason'])
        with self.assertRaises(a.BudgetBlocked): j.reserve(task('next'), max_attempts=3)

    def test_parallel_http_serial_callbacks(self):
        j = self.journal();lock = threading.Lock();active = peak = 0
        def sender(*args, **kwargs):
            nonlocal active, peak
            with lock: active += 1;peak = max(peak, active)
            time.sleep(.02)
            with lock: active -= 1
            return Response(completed())
        self.run_tasks(j, [task('r'+str(i)) for i in range(10)], transport=self.transport(sender), max_workers=4)
        self.assertGreater(peak, 1);self.assertLessEqual(peak, 4)
        self.assertEqual(j.verify()['attempts'], 10)

    def test_rate_headers_and_retry_after_respected(self):
        self.assertEqual(e.retry_delay({'retry-after': '12'}, 1, jitter=lambda *_: 0), 12)
        self.assertEqual(e.retry_delay({'retry-after-ms': '1500'}, 1, jitter=lambda *_: 0), 1.5)
        self.assertEqual(e.duration('1m250ms'), 60.25)
        limiter = e.RateLimits(32, clock=lambda: 10)
        limiter.observe(task()['model'], {'http_status': 429, 'headers': {'retry-after': '8'}})
        self.assertFalse(limiter.can_send(task(), 0))
        self.assertEqual(limiter.models[task()['model']]['limit'], 16)
        with self.assertRaises(ValueError): e.RateLimits(129)

    def test_explicit_128_worker_boundary_preserves_default_and_headers(self):
        self.assertEqual(e.RateLimits().ceiling, 32)
        limiter = e.RateLimits(128, clock=lambda: 10)
        self.assertTrue(limiter.can_send(task(), 127))
        self.assertFalse(limiter.can_send(task(), 128))
        limiter.observe(task()['model'], {'headers': {
            'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '60s'}})
        self.assertFalse(limiter.can_send(task(), 0))
        j = self.journal()
        progress = []
        e.execute([], journal=j, on_result=lambda *_: {}, transport=self.transport(),
                  max_workers=128, progress=progress.append)
        self.assertEqual(progress[-1]['configured_concurrency'], 128)
        self.assertEqual(j.verify()['attempts'], 0)
        self.assertEqual(self.loads, 0)
        for invalid in (0, 129, True, 1.5):
            with self.assertRaises(ValueError): e.RateLimits(invalid)
            with self.assertRaises(ValueError):
                e.execute([], journal=j, on_result=lambda *_: {}, max_workers=invalid)

    def test_shared_governor_carries_pilot_headers_into_next_execute(self):
        j=self.journal();governor=e.RateLimits(32)
        def sender(*args,**kwargs):
            return Response(completed(),headers={'x-ratelimit-remaining-requests':'5','x-ratelimit-reset-requests':'60s'})
        self.run_tasks(j,[task('pilot')],transport=self.transport(sender),rate_limits=governor)
        self.assertEqual(governor.models[task()['model']]['requests'],5)
        self.run_tasks(j,[task('bulk')],rate_limits=governor)
        self.assertEqual(governor.models[task()['model']]['requests'],4)

    def test_sent_events_are_actual_boundary_and_coordinator_only(self):
        j=self.journal();events=[];owner=threading.get_ident()
        def progress(value):
            self.assertEqual(threading.get_ident(),owner);events.extend(value['events'])
        result=self.run_tasks(j,[task('actual')],progress=progress)
        self.assertEqual([event['task_id'] for event in events],['actual'])
        self.assertEqual(events[0]['event'],'http_attempt_started')
        self.assertFalse(events[0]['provider_receipt_confirmed'])
        a.checked_ref(self.root,events[0]['sent_ref'])
        self.assertEqual(result['sent_task_ids'],['actual'])

    def test_unreviewed_route_options_refused_before_loader(self):
        for mutate in (lambda b: b.update(model='other-model'), lambda b: b.update(service_tier='auto'),
                       lambda b: b.update(reasoning={'effort': 'low'}), lambda b: b.update(tools=[{'type': 'web_search'}]),
                       lambda b: b.update(prompt_cache_options={'ttl': '12h'})):
            x = task();mutate(x['body'])
            with self.assertRaises(ValueError): self.transport().send(x, 'attempt', 'calls/attempt')
        self.assertEqual(self.loads, 0)

    def test_credential_in_source_refused_before_artifact_or_send(self):
        x = task();x['body']['input'] = 'fixture-private-key'
        with self.assertRaises(ValueError): self.transport().send(x, 'attempt', 'calls/attempt')
        self.assertEqual(self.sends, 0);self.assertFalse((self.root/'calls/attempt').exists())

    def test_deadline_prevents_new_send(self):
        j = self.journal()
        result = self.run_tasks(j, deadline=time.time()-1)
        self.assertEqual(result['stop_reason'], 'authorization_deadline')
        self.assertEqual(self.loads, 0)

    def test_flex_verified_half_price_with_standard_reservation(self):
        j=self.journal();x=task();x['body']['service_tier']='flex'
        def sender(request,**kwargs):
            self.sends+=1;self.assertEqual(json.loads(request.data)['service_tier'],'flex')
            value=completed();value['service_tier']='flex';return Response(value)
        self.run_tasks(j,[x],transport=self.transport(sender))
        row=j.attempts_for(x['task_id'])[0]
        self.assertEqual(row['reservation'],a.quote(x)['liability_units'])
        self.assertEqual(row['record']['quote']['pricing'],a.PRICING[x['model']])
        self.assertEqual(row['liability'],a.usage_cost(x['model'],completed()['usage'],service_tier='flex'))
        self.assertEqual(row['liability']*2,a.usage_cost(x['model'],completed()['usage']))
        proof=row['record']['settlement_pricing']
        self.assertTrue(proof['verified_flex_usage']);self.assertEqual(proof['usage_rates_per_million'],a.FLEX_PRICING[x['model']])
        self.assertFalse(proof['automatic_standard_fallback']);self.assertTrue(j.verify()['verified'])

    def test_flex_mismatch_never_falls_back_or_discounts(self):
        j=self.journal();x=task();x['body']['service_tier']='flex';tiers=[]
        def sender(request,**kwargs):
            tiers.append(json.loads(request.data)['service_tier']);return Response(completed())
        self.run_tasks(j,[x],transport=self.transport(sender))
        row=j.attempts_for(x['task_id'])[0]
        self.assertEqual(tiers,['flex']);self.assertEqual(row['liability'],row['reservation'])
        self.assertEqual(row['state'],'held_route_integrity');self.assertTrue(j.status()['frozen_reason'])
        self.assertIsNone(j.task(x['task_id'])['result']['payload'])

    def test_flex_resource_unavailable_zero_charge_retries_same_tier(self):
        j=self.journal();x=task();x['body']['service_tier']='flex';tiers=[]
        def sender(request,**kwargs):
            tiers.append(json.loads(request.data)['service_tier'])
            if len(tiers)==1:return Response({'error':{'code':'resource_unavailable'}},429,{'retry-after':'0'})
            value=completed();value['service_tier']='flex';return Response(value)
        with patch.object(e,'retry_delay',return_value=0):self.run_tasks(j,[x],transport=self.transport(sender))
        rows=j.attempts_for(x['task_id'])
        self.assertEqual(tiers,['flex','flex']);self.assertEqual(rows[0]['liability'],0)
        self.assertEqual(rows[0]['state'],'settled_flex_resource_unavailable_no_charge')
        self.assertEqual(j.task(x['task_id'])['state'],'completed');self.assertTrue(j.verify()['verified'])

    def test_resource_zero_charge_is_flex_exact_http_code_only(self):
        for tier,status,code in [('default',429,'resource_unavailable'),('flex',429,'rate_limit_exceeded'),('flex',503,'resource_unavailable')]:
            with self.subTest(tier=tier,status=status,code=code):
                x=task();x['body']['service_tier']=tier
                record={'requested_service_tier':tier,'model':x['model'],'quote':a.quote(x)}
                value={'sent':True,'http_status':status,'response':{'error':{'code':code}},'usage':None,'error':{'type':'http_error'}}
                self.assertFalse(a.settlement_pricing(record,value)['resource_unavailable_uncharged'])

    def test_model_payload_cannot_claim_uncharged_resource_failure(self):
        j=self.journal();x=task();x['body']['service_tier']='flex'
        def sender(*args,**kwargs):
            value=completed(payload={'error':{'code':'resource_unavailable'}});value['service_tier']='flex';return Response(value)
        self.run_tasks(j,[x],transport=self.transport(sender))
        row=j.attempts_for(x['task_id'])[0]
        self.assertGreater(row['liability'],0);self.assertFalse(row['record']['settlement_pricing']['resource_unavailable_uncharged'])

    def test_resource_waiver_rejects_positive_or_malformed_raw_usage(self):
        bad = [{'total_tokens':7},{'input_tokens':0,'output_tokens':0,'total_tokens':7},'invalid',[],{},
            {'input_tokens':0,'output_tokens':0,'input_tokens_details':{'cached_tokens':2}},
            {'input_tokens':0,'output_tokens':0,'total_tokens':False},
            {'input_tokens':0,'output_tokens':0,'unknown_counter':0}]
        for i,usage in enumerate(bad):
            with self.subTest(usage=usage):
                j=self.journal();x=task('malformed-'+str(i));x['body']['service_tier']='flex'
                def sender(*args,**kwargs):return Response({'error':{'code':'resource_unavailable'},'usage':usage},429)
                self.run_tasks(j,[x],transport=self.transport(sender),max_attempts=1)
                row=j.attempts_for(x['task_id'])[0]
                self.assertEqual(row['liability'],row['reservation'])
                self.assertEqual(row['state'],'held_unknown_usage')
                self.assertFalse(row['record']['settlement_pricing']['resource_unavailable_uncharged'])
                self.assertTrue(j.verify()['verified'])
                j.close();j.db=None

    def test_resource_waiver_accepts_only_recognized_all_zero_usage(self):
        usage={'input_tokens':0,'output_tokens':0,'total_tokens':0,
            'input_tokens_details':{'cached_tokens':0,'cache_write_tokens':0,
                'cache_write_tokens_details':{'ttl_30m_tokens':0,'ttl_12h_tokens':0}},
            'output_tokens_details':{'reasoning_tokens':0}}
        self.assertTrue(a.zero_reported_usage(usage))
        self.assertFalse(a.zero_reported_usage({'total_tokens':'0'}))
        self.assertFalse(a.zero_reported_usage({'total_tokens':-1}))

    def test_flex_pricing_fact_tamper_blocks_before_reservation_or_key(self):
        j=self.journal();x=task();x['body']['service_tier']='flex'
        (self.root/a.FLEX_PRICING_REF['path']).write_text('{}')
        with self.assertRaises(ValueError):j.reserve(x,max_attempts=3)
        self.assertEqual(j.verify()['attempts'],0);self.assertEqual(self.loads,0)

    def test_flex_fractional_nanodollar_rounds_up_not_down(self):
        usage={'input_tokens':1,'output_tokens':0,'input_tokens_details':{'cached_tokens':0,'cache_write_tokens':1}}
        self.assertEqual(a.usage_cost('gpt-6-luna',usage,service_tier='default'),125)
        self.assertEqual(a.usage_cost('gpt-6-luna',usage,service_tier='flex'),63)

    def test_flex_cap_still_requires_full_standard_reservation(self):
        j=self.journal();x=task();x['body']['service_tier']='flex'
        status=j.status();bound=a.quote(x)['liability_units']
        status.update(phase_remaining_units=bound*3//4,total_remaining_units=bound*3//4)
        with patch.object(j,'status',return_value=status):
            with self.assertRaises(a.BudgetBlocked):j.reserve(x,max_attempts=3)
        self.assertEqual(j.verify()['attempts'],0);self.assertEqual(self.loads,0)

    def test_flex_resource_exhaustion_never_uses_standard_fallback(self):
        j=self.journal();x=task();x['body']['service_tier']='flex';tiers=[]
        def sender(request,**kwargs):
            tiers.append(json.loads(request.data)['service_tier'])
            return Response({'error':{'code':'resource_unavailable'}},429,{'retry-after':'0'})
        with patch.object(e,'retry_delay',return_value=0):self.run_tasks(j,[x],transport=self.transport(sender))
        self.assertEqual(tiers,['flex']*3)
        self.assertEqual(j.status()['phase_liability_usd'],'0.000000000')
        self.assertEqual(j.status()['attempt_states'],{'settled_flex_resource_unavailable_no_charge':3})
        self.assertEqual(j.task(x['task_id'])['state'],'provider_hold')
        self.assertTrue(j.verify()['verified'])

    def test_flex_timeout_preserves_each_standard_upper_hold(self):
        j=self.journal();x=task();x['body']['service_tier']='flex';tiers=[]
        def sender(request,**kwargs):
            tiers.append(json.loads(request.data)['service_tier']);raise TimeoutError()
        with patch.object(e,'retry_delay',return_value=0):self.run_tasks(j,[x],transport=self.transport(sender),max_attempts=2)
        self.assertEqual(tiers,['flex']*2)
        self.assertEqual(a.units(j.status()['phase_liability_usd']),2*a.quote(x)['liability_units'])
        self.assertEqual(j.status()['attempt_states'],{'held_unknown_usage':2})
        self.assertTrue(j.verify()['verified'])


if __name__ == '__main__': unittest.main()
