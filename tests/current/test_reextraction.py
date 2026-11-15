import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from metamelanoma import reextraction as r
from metamelanoma.gateway import GatewaySettings
from metamelanoma.io import atomic_json, canonical, reference


URL = 'https://fixture.cornell.edu/v1/responses'


class Response:
    def __init__(self, value, headers=None, status=200):
        self.value = value; self.headers = headers or {}; self.status = status
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def geturl(self): return URL
    def read(self): return canonical(self.value)


def response(identifier, *, status='completed', effort='xhigh'):
    return {'id': identifier, 'model': r.MODEL, 'status': status, 'service_tier': 'default',
        'reasoning': {'effort': effort}, 'usage': {'input_tokens': 100, 'output_tokens': 200,
            'input_tokens_details': {'cached_tokens': 0, 'cache_write_tokens': 0}},
        'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': '{"fixture":true}'}]}]}


class PilotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve(); self.phase = 'melanoma-quantitative-r2-pilot-test'
        for path in ('data/current', 'config', 'src/metamelanoma'):
            (self.root / path).mkdir(parents=True)
        for filename in r.PRODUCERS:
            (self.root / 'src/metamelanoma' / filename).write_text('# frozen fixture\n')
        for name in ('accounting.sqlite3', 'gateway_accounting.sqlite3'):
            with sqlite3.connect(self.root / 'data/current' / name) as db:
                db.executescript('CREATE TABLE events(seq INTEGER,event_hash TEXT);'
                    'CREATE TABLE tasks(task_id TEXT); CREATE TABLE attempts(attempt_id TEXT);'
                    'CREATE TABLE metadata(key TEXT,value TEXT);'
                    'CREATE TABLE provider_identifiers(kind TEXT,value TEXT,attempt_id TEXT);')
                db.execute('INSERT INTO events VALUES(1,?)', ('a' * 64,))
                db.execute('INSERT INTO metadata VALUES(?,?)', ('policy', '{"old":"preserve"}'))
        self.citation = {'pmid': '123', 'report_id': 'report-123', 'title': 'A melanoma trial',
            'abstract': 'Twenty-five patients received nivolumab.', 'doi': '10.1/fixture'}
        with sqlite3.connect(self.root / 'data/current/articles.sqlite3') as db:
            db.execute('CREATE TABLE articles(pmid TEXT,citation_json TEXT)')
            db.execute('INSERT INTO articles VALUES(?,?)', ('123', json.dumps(self.citation)))
        atomic_json(self.root / 'config/pipeline.json', {'endpoint': URL, 'direct_OpenAI_dispatch_enabled': False})
        atomic_json(self.root / 'catalog.json', {'http_status': 200, 'models_present': [r.MODEL]})
        self.plan = {'phase_id': self.phase, 'stage': 'R2', 'model': r.MODEL, 'reasoning_effort': 'xhigh',
            'catalog_ref': reference(self.root, 'catalog.json'), 'max_workers': 32,
            'articles': [{'citation': self.citation, 'sampling_stratum': 'legacy_exclusion',
                'prior_R2_status': 'exclude', 'prior_R2_reason': 'OBSOLETE REASON MUST NOT ENTER INPUT'}]}
        self.save_plan()
        self.before = r._legacy_heads(self.root); self.requests = []

    def save_plan(self):
        atomic_json(self.root / 'plan.json', self.plan); self.ref = reference(self.root, 'plan.json')

    def transport(self, replies):
        replies = iter(replies)
        def sender(request, **kwargs):
            self.requests.append(json.loads(request.data)); item = next(replies)
            if isinstance(item, Exception): raise item
            return item
        return r.CompactGatewayTransport(root=self.root, expected_endpoint=URL, sender=sender,
            settings_loader=lambda *a, **kw: GatewaySettings('fixture-private-key', 60, URL[:-13]))

    def valid(self, payload, source):
        return {'record': {'pmid': source['pmid'], 'decision': {'status': 'retain'}},
            'valid': True, 'issues': [], 'global_errors': [], 'original_payload': payload}

    def invoke(self, replies, **kwargs):
        with patch.object(r.quantitative, 'validate', side_effect=self.valid), patch.object(r, 'retry_delay', return_value=0):
            return r.run(self.root, self.ref, workers=1, transport=self.transport(replies), **kwargs)

    def test_preparation_binds_only_title_abstract_and_preserves_old_history(self):
        value = r.prepare(self.root, self.ref)
        self.assertEqual(value['ready_tasks'], 1); self.assertEqual(value['attempts'], 0)
        task = json.loads(next((self.root / f'data/current/reextraction/{self.phase}/tasks').glob('*/task.json')).read_text())
        self.assertEqual(task['body']['reasoning'], {'effort': 'xhigh'})
        self.assertEqual(task['model'], 'gpt-6.1-sol')
        self.assertNotIn('OBSOLETE REASON', task['body']['input'])
        self.assertNotIn('legacy_exclusion', task['body']['input'])
        self.assertEqual(r._legacy_heads(self.root), self.before)
        self.assertEqual(r.prepare(self.root, self.ref)['ready_tasks'], 1)

    def test_completed_native_response_cost_and_accepted_record(self):
        r.prepare(self.root, self.ref)
        out = self.invoke([Response(response('resp-one'), {'x-request-id': 'req-one', 'x-litellm-response-cost': '0.021'})])
        self.assertEqual(out['finished_articles'], 1); self.assertEqual(out['attempts'], 1)
        self.assertEqual(out['gateway_known_cost_subtotal_usd'], '0.021')
        self.assertEqual(out['gateway_cost_unknown_attempts'], 0)
        self.assertEqual(len(r.completed_records(self.root, self.ref)), 1)
        self.assertEqual(self.requests[0]['reasoning'], {'effort': 'xhigh'})
        self.assertEqual(r._legacy_heads(self.root), self.before)
        for p in (self.root / f'data/current/reextraction/{self.phase}/calls').rglob('*'):
            if p.is_file(): self.assertNotIn(b'fixture-private-key', p.read_bytes())
        self.assertEqual(self.invoke([])['attempts'], 1)

    def test_wrong_returned_effort_is_held_without_public_record(self):
        r.prepare(self.root, self.ref)
        out = self.invoke([Response(response('resp-one', effort='high'), {'x-request-id': 'req-one'})])
        self.assertEqual(out['task_states'], {'held_integrity': 1})
        self.assertEqual(r.completed_records(self.root, self.ref), [])

    def test_unknown_timeout_never_blindly_retries_on_restart(self):
        r.prepare(self.root, self.ref)
        out = self.invoke([TimeoutError()])
        self.assertEqual(out['task_states'], {'held_unknown_send': 1})
        self.assertEqual(out['gateway_cost_unknown_attempts'], 1)
        self.assertEqual(self.invoke([])['attempts'], 1)
        self.assertEqual(len(self.requests), 1)

    def test_429_retries_are_individually_metered(self):
        r.prepare(self.root, self.ref)
        out = self.invoke([Response({'error': {'type': 'rate_limit'}},
            {'x-request-id': 'req-rate', 'x-litellm-response-cost': '0'}, status=429),
            Response(response('resp-ok'), {'x-request-id': 'req-ok', 'x-litellm-response-cost': '0.02'})])
        self.assertEqual(out['attempts'], 2); self.assertEqual(out['finished_articles'], 1)
        self.assertEqual(out['gateway_known_cost_subtotal_usd'], '0.02')
        self.assertEqual(out['articles'][0]['attempt_count'], 2)

    def test_output_limit_retry_expands_to_64k_and_keeps_first_cost(self):
        r.prepare(self.root, self.ref)
        first = response('resp-short', status='incomplete'); first['incomplete_details'] = {'reason': 'max_output_tokens'}
        out = self.invoke([Response(first, {'x-request-id': 'req-short', 'x-litellm-response-cost': '.03'}),
            Response(response('resp-ok'), {'x-request-id': 'req-ok', 'x-litellm-response-cost': '.04'})])
        self.assertEqual([x['max_output_tokens'] for x in self.requests], [32768, 65536])
        self.assertEqual(out['gateway_known_cost_subtotal_usd'], '0.07')

    def test_expanded_scope_r3_and_direct_openai_are_rejected(self):
        for changes in ({'articles': ['123'] * 255}, {'stage': 'R3'}, {'reasoning_effort': 'high'},
                        {'direct_OpenAI_dispatch_enabled': True}, {'models': {'R2': r.MODEL, 'R3': 'gpt-6-luna'}}):
            with self.subTest(changes=changes):
                old = dict(self.plan); self.plan.update(changes); self.save_plan()
                with self.assertRaises(ValueError): r.prepare(self.root, self.ref)
                self.plan = old
        self.save_plan()

    def test_immutable_phase_and_quality_subset(self):
        r.prepare(self.root, self.ref)
        with self.assertRaises(ValueError): self.invoke([], pmids=['999'])
        with self.assertRaises(ValueError): r.run(self.root, self.ref, workers=64)
        self.plan['authorization'] = 'different'; self.save_plan()
        with self.assertRaises(ValueError): r.prepare(self.root, self.ref)

    def test_producer_change_is_detected_before_credentials(self):
        r.prepare(self.root, self.ref)
        (self.root / 'src/metamelanoma/quantitative.py').write_text('changed\n')
        with self.assertRaisesRegex(ValueError, 'Producing code changed'):
            self.invoke([])
        self.assertEqual(self.requests, [])

    def test_blank_abstract_is_an_explicit_source_hold(self):
        self.plan['articles'][0]['citation']['abstract'] = ''; self.save_plan()
        value = r.prepare(self.root, self.ref)
        self.assertEqual(value['ready_tasks'], 0)
        self.assertEqual(value['source_or_request_holds'][0]['pmid'], '123')

    def test_completed_saved_response_recovers_without_another_request(self):
        r.prepare(self.root, self.ref)
        journal = r.PilotJournal(self.root, self.phase)
        try:
            task = json.loads((self.root / json.loads(journal.task_rows()[0]['task_ref_json'])['path']).read_text())
            reservation = journal.reserve(task, 32768)
            transport = self.transport([Response(response('resp-before-crash'),
                {'x-request-id': 'req-before-crash', 'x-litellm-response-cost': '.03'})])
            transport.send(task, reservation['attempt_id'],
                f'data/current/reextraction/{self.phase}/calls/{reservation["attempt_id"]}')
            # Model result is saved, but the coordinator has not committed it.
        finally:
            journal.close()
        out = self.invoke([])
        self.assertEqual(out['finished_articles'], 1); self.assertEqual(out['attempts'], 1)
        self.assertEqual(len(self.requests), 1)

    def test_projection_tamper_cannot_mark_a_task_complete(self):
        r.prepare(self.root, self.ref)
        with sqlite3.connect(self.root / r.DB_PATH) as db:
            db.execute("UPDATE reextraction_tasks SET state='complete'")
        with self.assertRaisesRegex(ValueError, 'projection'):
            self.invoke([])
        self.assertEqual(self.requests, [])

    def test_producer_amendment_preserves_authority_costs_and_prior_validation(self):
        r.prepare(self.root, self.ref)
        self.invoke([Response(response('resp-original'), {'x-request-id': 'req-original', 'x-litellm-response-cost': '.02'})])
        base = self.root / f'data/current/reextraction/{self.phase}'
        original_authority = (base / 'authority.json').read_bytes()
        original = r.completed_records(self.root, self.ref)[0]['artifact_ref']
        original_bytes = (self.root / original['path']).read_bytes()
        with sqlite3.connect(self.root / r.DB_PATH) as db:
            before_attempts = list(db.execute('SELECT * FROM reextraction_attempts'))
            self.assertEqual(db.execute('PRAGMA journal_mode').fetchone()[0], 'delete')
        (self.root / 'src/metamelanoma/quantitative.py').write_text('# validator-only correction\n')
        def repaired(payload, source):
            value = self.valid(payload, source); value['record']['repaired'] = True; return value
        with patch.object(r.quantitative, 'validate', side_effect=repaired):
            out = r.amend_producers(self.root, self.ref, 'Source-bound validator correction; request body unchanged')
        self.assertEqual(out['new_model_requests'], 0); self.assertEqual(out['revalidated_articles'], 1)
        self.assertEqual((base / 'authority.json').read_bytes(), original_authority)
        self.assertEqual((self.root / original['path']).read_bytes(), original_bytes)
        self.assertNotEqual(r.completed_records(self.root, self.ref)[0]['artifact_ref'], original)
        self.assertTrue(r.completed_records(self.root, self.ref)[0]['validation']['record']['repaired'])
        with sqlite3.connect(self.root / r.DB_PATH) as db:
            self.assertEqual(list(db.execute('SELECT * FROM reextraction_attempts')), before_attempts)
        self.assertEqual(r._legacy_heads(self.root), self.before)
        self.assertEqual(self.invoke([])['attempts'], 1)
        self.assertEqual(len(self.requests), 1)

    def test_amendment_refuses_changed_request_body(self):
        r.prepare(self.root, self.ref)
        original = r.quantitative.request_body
        def changed(*args, **kwargs):
            value = original(*args, **kwargs); value['instructions'] += '\nChanged model instructions.'; return value
        with patch.object(r.quantitative, 'request_body', side_effect=changed):
            with self.assertRaisesRegex(ValueError, 'recorded request body'):
                r.amend_producers(self.root, self.ref, 'Invalid prompt amendment')
        self.assertEqual(r.status(self.root, self.ref)['attempts'], 0)

    def test_amendment_does_not_release_an_unknown_active_reservation(self):
        r.prepare(self.root, self.ref)
        journal = r.PilotJournal(self.root, self.phase)
        try:
            task = json.loads((self.root / json.loads(journal.task_rows()[0]['task_ref_json'])['path']).read_text())
            journal.reserve(task, 32768)
        finally:
            journal.close()
        with self.assertRaisesRegex(ValueError, 'Unresolved active/unknown send'):
            r.amend_producers(self.root, self.ref, 'No response exists')
        self.assertEqual(r.status(self.root, self.ref)['task_states'], {'running': 1})

    def test_amendment_cannot_change_transport_or_credential_loader(self):
        r.prepare(self.root, self.ref)
        (self.root / 'src/metamelanoma/gateway.py').write_text('# different route\n')
        with self.assertRaisesRegex(ValueError, 'Only the reviewed compact validator'):
            r.amend_producers(self.root, self.ref, 'Unsupported route change')

    def continuation_plan(self):
        parent_ref = self.ref
        citation = {**self.citation, 'pmid': '456', 'report_id': 'report-456'}
        atomic_json(self.root / 'cohort.json', {'article_pmids': ['123', '456']})
        plan = {**self.plan, 'phase_id': 'melanoma-quantitative-r2-continuation-test',
            'articles': [{'citation': citation}], 'continuation': {
                'pilot_plan_ref': parent_ref, 'cohort_ref': reference(self.root, 'cohort.json')}}
        atomic_json(self.root / 'continuation_plan.json', plan)
        return plan, reference(self.root, 'continuation_plan.json')

    def test_explicit_continuation_reuses_finished_pilot_without_resending_it(self):
        r.prepare(self.root, self.ref)
        self.invoke([Response(response('resp-pilot'), {'x-request-id': 'req-pilot', 'x-litellm-response-cost': '.02'})])
        parent_ref = self.ref; parent_record = r.completed_records(self.root, parent_ref)[0]
        plan, self.ref = self.continuation_plan()
        with patch.object(r, 'PILOT_SIZE', 1), patch.object(r, 'REVIEWED_COHORT_SIZE', 2):
            value = r.prepare(self.root, self.ref)
            self.assertEqual(value['selected_articles'], 1); self.assertEqual(value['attempts'], 0)
            value = self.invoke([Response(response('resp-rest'), {'x-request-id': 'req-rest', 'x-litellm-response-cost': '.03'})])
            self.assertEqual(value['finished_articles'], 1); self.assertEqual(value['attempts'], 1)
            self.assertEqual(r.completed_records(self.root, parent_ref), [parent_record])
            authority = json.loads((self.root / 'data/current/reextraction' / plan['phase_id'] / 'authority.json').read_text())
            reused = authority['continuation']['reused_articles']
            self.assertEqual(reused[0]['artifact_ref'], parent_record['artifact_ref'])
            self.assertEqual(authority['continuation']['R3_eligible_decisions'], ['retain', 'unclear'])
            self.assertFalse(authority['continuation']['R3_dispatch_enabled'])
            self.assertEqual(self.invoke([])['attempts'], 1)
        self.assertEqual(len(self.requests), 2)
        self.assertEqual(r._legacy_heads(self.root), self.before)

    def test_continuation_refuses_unfinished_pilot_overlap_and_scope_expansion(self):
        r.prepare(self.root, self.ref)
        plan, ref = self.continuation_plan()
        with patch.object(r, 'PILOT_SIZE', 1), patch.object(r, 'REVIEWED_COHORT_SIZE', 2):
            with self.assertRaisesRegex(ValueError, 'fully completed'):
                r.prepare(self.root, ref)
            for change in (
                    lambda p: p['articles'][0]['citation'].update(pmid='123'),
                    lambda p: p['articles'][0]['citation'].update(pmid='789'),
                    lambda p: p.update(max_workers=64),
                    lambda p: p.update(R3_dispatch_enabled=True)):
                changed = json.loads(json.dumps(plan)); change(changed)
                atomic_json(self.root / 'changed.json', changed)
                with self.assertRaises(ValueError): r.prepare(self.root, reference(self.root, 'changed.json'))
        self.assertEqual(self.requests, [])

    def test_continuation_cannot_duplicate_an_existing_dispatch_phase(self):
        r.prepare(self.root, self.ref)
        self.invoke([Response(response('resp-pilot'), {'x-request-id': 'req-pilot'})])
        plan, ref = self.continuation_plan()
        with patch.object(r, 'PILOT_SIZE', 1), patch.object(r, 'REVIEWED_COHORT_SIZE', 2):
            r.prepare(self.root, ref)
            plan['phase_id'] += '-duplicate'
            atomic_json(self.root / 'duplicate.json', plan)
            with self.assertRaisesRegex(ValueError, 'already belongs'):
                r.prepare(self.root, reference(self.root, 'duplicate.json'))
        self.assertEqual(len(self.requests), 1)

    def test_confirmed_primary_no_abstract_disposition_finishes_without_model_request(self):
        r.prepare(self.root, self.ref)
        self.invoke([Response(response('resp-pilot'), {'x-request-id': 'req-pilot'})])
        plan, ref = self.continuation_plan()
        plan['articles'][0]['citation']['abstract'] = ''
        atomic_json(self.root / 'publisher.json', {'pmid': '456', 'abstract': None, 'complete': True})
        proof = {'pmid': '456', 'status': 'confirmed_unavailable', 'checks': [{
            'provider': 'primary_publisher', 'http_status': 200, 'abstract_present': False,
            'identity_verified': True, 'complete_record': True,
            'artifact_ref': reference(self.root, 'publisher.json')}]}
        atomic_json(self.root / 'availability.json', proof)
        plan['local_dispositions'] = [{'pmid': '456', 'reason': 'Complete primary publication has no scientific abstract.',
            'availability_ref': reference(self.root, 'availability.json')}]
        atomic_json(self.root / 'continuation_plan.json', plan); self.ref = reference(self.root, 'continuation_plan.json')
        with patch.object(r, 'PILOT_SIZE', 1), patch.object(r, 'REVIEWED_COHORT_SIZE', 2):
            value = r.prepare(self.root, self.ref)
            self.assertEqual(value['finished_articles'], 1); self.assertEqual(value['attempts'], 0)
            self.assertEqual(value['new_R2_decisions'], {'exclude': 1})
            self.assertEqual(value['task_states'], {'local_excluded': 1})
            self.assertEqual(value['gateway_known_cost_subtotal_usd'], '0')
            self.assertEqual(self.invoke([])['attempts'], 0)
            result = r.completed_records(self.root, self.ref)[0]
            self.assertEqual(result['review_origin'], 'local_primary_source_availability')
            self.assertEqual(result['validation']['record']['decision']['reason_code'], 'scientific_abstract_unavailable')
            for field in ('populations', 'arms', 'sample_sizes', 'effects', 'survival', 'binary'):
                self.assertEqual(result['validation']['record'][field], [])
        self.assertEqual(len(self.requests), 1)

    def test_no_abstract_disposition_rejects_pubmed_only_failed_partial_or_wrong_identity(self):
        plan, ref = self.continuation_plan()
        plan['articles'][0]['citation']['abstract'] = ''
        atomic_json(self.root / 'publisher.json', {'pmid': '456', 'abstract': None})
        base = {'pmid': '456', 'status': 'confirmed_unavailable', 'checks': [{
            'provider': 'primary_publisher', 'http_status': 200, 'abstract_present': False,
            'identity_verified': True, 'complete_record': True,
            'artifact_ref': reference(self.root, 'publisher.json')}]}
        mutations = [lambda p: p.update(pmid='789'), lambda p: p['checks'][0].update(provider='pubmed'),
            lambda p: p['checks'][0].update(http_status=403), lambda p: p['checks'][0].update(complete_record=False),
            lambda p: p['checks'][0].update(abstract_present=True), lambda p: p['checks'][0].update(identity_verified=False)]
        for mutate in mutations:
            proof = json.loads(json.dumps(base)); mutate(proof)
            atomic_json(self.root / 'availability.json', proof)
            plan['local_dispositions'] = [{'pmid': '456', 'reason': 'No abstract',
                'availability_ref': reference(self.root, 'availability.json')}]
            atomic_json(self.root / 'continuation_plan.json', plan)
            with patch.object(r, 'PILOT_SIZE', 1), patch.object(r, 'REVIEWED_COHORT_SIZE', 2):
                with self.assertRaises(ValueError): r._plan(self.root, reference(self.root, 'continuation_plan.json'))
        self.assertEqual(self.requests, [])

    def source_hold_fixture(self):
        r.prepare(self.root, self.ref)
        self.invoke([Response(response('resp-pilot'), {'x-request-id': 'req-pilot'})])
        plan, ref = self.continuation_plan()
        plan['articles'][0]['citation']['abstract'] = ''
        plan['articles'][0]['citation']['year'] = 2026
        atomic_json(self.root / 'continuation_plan.json', plan)
        self.ref = reference(self.root, 'continuation_plan.json')
        atomic_json(self.root / 'publisher.json', {'pmid': '456', 'abstract': None, 'complete': True})
        proof = {'pmid': '456', 'status': 'confirmed_unavailable', 'checks': [{
            'provider': 'primary_publisher', 'http_status': 200, 'abstract_present': False,
            'identity_verified': True, 'complete_record': True,
            'artifact_ref': reference(self.root, 'publisher.json')}]}
        atomic_json(self.root / 'availability.json', proof)
        disposition = {'pmid': '456', 'reason': 'Complete original publication has no scientific abstract.',
            'availability_ref': reference(self.root, 'availability.json')}
        return plan, proof, disposition

    def test_source_hold_resolution_appends_history_without_changing_plan_authority_or_costs(self):
        plan, proof, disposition = self.source_hold_fixture()
        with patch.object(r, 'PILOT_SIZE', 1), patch.object(r, 'REVIEWED_COHORT_SIZE', 2):
            before = r.prepare(self.root, self.ref)
            self.assertEqual(len(before['source_or_request_holds']), 1)
            directory = self.root / 'data/current/reextraction' / plan['phase_id']
            original_authority = (directory / 'authority.json').read_bytes()
            original_plan = (self.root / self.ref['path']).read_bytes()
            with sqlite3.connect(self.root / r.DB_PATH) as db:
                attempts = list(db.execute('SELECT * FROM reextraction_attempts'))
                original_events = list(db.execute('SELECT * FROM reextraction_events'))
            out = r.resolve_source_hold(self.root, self.ref, disposition)
            self.assertEqual(out['new_model_requests'], 0)
            self.assertEqual(out['phase_status']['finished_articles'], 1)
            self.assertEqual(out['phase_status']['attempts'], 0)
            self.assertEqual(out['phase_status']['new_R2_decisions'], {'exclude': 1})
            self.assertEqual(out['phase_status']['source_or_request_holds'], [])
            self.assertEqual(r.resolve_source_hold(self.root, self.ref, disposition)['status'], 'already_resolved')
            self.assertEqual((directory / 'authority.json').read_bytes(), original_authority)
            self.assertEqual((self.root / self.ref['path']).read_bytes(), original_plan)
            self.assertEqual(len(r.completed_records(self.root, self.ref)), 1)
            with sqlite3.connect(self.root / r.DB_PATH) as db:
                self.assertEqual(list(db.execute('SELECT * FROM reextraction_attempts')), attempts)
                events = list(db.execute('SELECT * FROM reextraction_events'))
                self.assertEqual(events[:-1], original_events)
                self.assertEqual(len(events), len(original_events) + 1)
            self.assertEqual(self.invoke([])['attempts'], 0)
        self.assertEqual(len(self.requests), 1)

    def test_source_resolution_rejects_wrong_or_changed_proof_and_conflicting_repeat(self):
        plan, proof, disposition = self.source_hold_fixture()
        with patch.object(r, 'PILOT_SIZE', 1), patch.object(r, 'REVIEWED_COHORT_SIZE', 2):
            r.prepare(self.root, self.ref)
            bad = {**disposition, 'pmid': '123'}
            with self.assertRaises(ValueError): r.resolve_source_hold(self.root, self.ref, bad)
            changed = json.loads(json.dumps(proof)); changed['checks'][0]['http_status'] = 403
            atomic_json(self.root / 'blocked.json', changed)
            bad = {**disposition, 'availability_ref': reference(self.root, 'blocked.json')}
            with self.assertRaises(ValueError): r.resolve_source_hold(self.root, self.ref, bad)
            r.resolve_source_hold(self.root, self.ref, disposition)
            with self.assertRaisesRegex(ValueError, 'different source resolution'):
                r.resolve_source_hold(self.root, self.ref, {**disposition, 'reason': 'A changed decision reason'})
            (self.root / 'publisher.json').write_text('changed underlying proof')
            with self.assertRaises(ValueError): r.completed_records(self.root, self.ref)

    def test_mirrored_published_copy_requires_identity_completeness_and_truthful_host(self):
        plan, proof, disposition = self.source_hold_fixture()
        (self.root / 'article.pdf').write_bytes(b'%PDF-fixture')
        atomic_json(self.root / 'text.json', {'text': 'Full original article without an abstract'})
        proof['body_used_for_R2'] = False
        proof['checks'][0].update(provider='published_article_copy', artifact_ref=reference(self.root, 'article.pdf'),
            publisher_original_copy=True, host_role='third_party_mirror', direct_primary_publisher_retrieval=False,
            url='https://mirror.example/article.pdf', host='mirror.example', doi=self.citation['doi'], title=self.citation['title'],
            authors=['A. Author'], year=2026, identity_fields_matched=['doi','title','authors','year','page_range'],
            first_page_verified=True, last_page_verified=True, journal_pages='1–2', pdf_page_count=2,
            abstract_absence_inspection='First page begins body; last page ends references.',
            fulltext_ref=reference(self.root, 'text.json'), independent_publisher_metadata_ref=reference(self.root, 'publisher.json'),
            visual_refs=[reference(self.root, 'text.json'), reference(self.root, 'text.json')])
        atomic_json(self.root / 'availability.json', proof)
        disposition['availability_ref'] = reference(self.root, 'availability.json')
        with patch.object(r, 'PILOT_SIZE', 1), patch.object(r, 'REVIEWED_COHORT_SIZE', 2):
            r.prepare(self.root, self.ref)
            for mutation in [lambda p: p['checks'][0].update(doi='10.wrong/identity'),
                    lambda p: p['checks'][0].update(pdf_page_count=1),
                    lambda p: p['checks'][0].update(first_page_verified=False),
                    lambda p: p['checks'][0].update(host_role='primary_publisher'),
                    lambda p: p['checks'][0].update(direct_primary_publisher_retrieval=True),
                    lambda p: p.update(body_used_for_R2=True)]:
                bad = json.loads(json.dumps(proof)); mutation(bad)
                atomic_json(self.root / 'bad-proof.json', bad)
                with self.assertRaises(ValueError):
                    r.resolve_source_hold(self.root, self.ref, {**disposition, 'availability_ref': reference(self.root, 'bad-proof.json')})
            self.assertEqual(r.resolve_source_hold(self.root, self.ref, disposition)['phase_status']['finished_articles'], 1)

    def worker_authorization_fixture(self, workers=128):
        atomic_json(self.root / 'rate_limits.json', {'headers': {'x-ratelimit-limit-requests': '15000', 'x-ratelimit-limit-tokens': '15000000'}})
        plan = json.loads((self.root / self.ref['path']).read_text())
        authorization = {'phase_id': plan['phase_id'], 'plan_ref': self.ref, 'workers': workers,
            'user_authorization_basis': 'User requested more simultaneous requests.',
            'reason': 'Observed gateway capacity permits a bounded increase.',
            'observed_rate_limit_refs': [reference(self.root, 'rate_limits.json')]}
        atomic_json(self.root / 'worker_authorization.json', authorization)
        return authorization, reference(self.root, 'worker_authorization.json')

    def test_explicit_worker_amendment_resumes_only_pending_tasks_at_128(self):
        r.prepare(self.root, self.ref)
        self.invoke([Response(response('resp-pilot'), {'x-request-id': 'req-pilot'})])
        plan, self.ref = self.continuation_plan()
        plan['articles'].append({'citation': {**self.citation, 'pmid': '789', 'report_id': 'report-789'}})
        atomic_json(self.root / 'cohort.json', {'article_pmids': ['123', '456', '789']})
        plan['continuation']['cohort_ref'] = reference(self.root, 'cohort.json')
        atomic_json(self.root / 'continuation_plan.json', plan); self.ref = reference(self.root, 'continuation_plan.json')
        with patch.object(r, 'PILOT_SIZE', 1), patch.object(r, 'REVIEWED_COHORT_SIZE', 3):
            r.prepare(self.root, self.ref)
            self.invoke([Response(response('resp-first'), {'x-request-id': 'req-first'})], limit=1)
            before_plan = (self.root / self.ref['path']).read_bytes()
            directory = self.root / 'data/current/reextraction' / plan['phase_id']
            before_authority = (directory / 'authority.json').read_bytes()
            with sqlite3.connect(self.root / r.DB_PATH) as db:
                before_tasks = list(db.execute('SELECT * FROM reextraction_tasks'))
                before_attempts = list(db.execute('SELECT * FROM reextraction_attempts'))
            with self.assertRaisesRegex(ValueError, 'explicitly authorized'):
                r.run(self.root, self.ref, workers=128, transport=self.transport([]))
            _, auth_ref = self.worker_authorization_fixture()
            result = r.authorize_workers(self.root, self.ref, auth_ref)
            self.assertEqual(result['worker_ceiling'], 128); self.assertEqual(result['new_model_requests'], 0)
            self.assertEqual(r.authorize_workers(self.root, self.ref, auth_ref)['status'], 'already_authorized')
            with sqlite3.connect(self.root / r.DB_PATH) as db:
                self.assertEqual(list(db.execute('SELECT * FROM reextraction_tasks')), before_tasks)
                self.assertEqual(list(db.execute('SELECT * FROM reextraction_attempts')), before_attempts)
            self.assertEqual((self.root / self.ref['path']).read_bytes(), before_plan)
            self.assertEqual((directory / 'authority.json').read_bytes(), before_authority)
            with patch.object(r.quantitative, 'validate', side_effect=self.valid):
                value = r.run(self.root, self.ref, workers=128, transport=self.transport([
                    Response(response('resp-rest'), {'x-request-id': 'req-rest'})]))
                self.assertEqual(value['finished_articles'], 2); self.assertEqual(value['attempts'], 2)
                self.assertEqual(r.run(self.root, self.ref, workers=128, transport=self.transport([]))['attempts'], 2)
        self.assertEqual(len(self.requests), 3)
        self.assertEqual(r._legacy_heads(self.root), self.before)

    def test_worker_amendment_rejects_above_128_wrong_identity_and_active_sends(self):
        r.prepare(self.root, self.ref)
        self.invoke([Response(response('resp-pilot'), {'x-request-id': 'req-pilot'})])
        plan, self.ref = self.continuation_plan()
        with patch.object(r, 'PILOT_SIZE', 1), patch.object(r, 'REVIEWED_COHORT_SIZE', 2):
            r.prepare(self.root, self.ref)
            auth, auth_ref = self.worker_authorization_fixture()
            for change in [lambda a: a.update(workers=129), lambda a: a.update(workers=32),
                    lambda a: a.update(phase_id='different'), lambda a: a.update(user_authorization_basis=''),
                    lambda a: a.update(observed_rate_limit_refs=[])]:
                bad = json.loads(json.dumps(auth)); change(bad); atomic_json(self.root / 'bad-auth.json', bad)
                with self.assertRaises(ValueError): r.authorize_workers(self.root, self.ref, reference(self.root, 'bad-auth.json'))
            journal = r.PilotJournal(self.root, plan['phase_id'])
            try:
                task = json.loads((self.root / json.loads(journal.task_rows()[0]['task_ref_json'])['path']).read_text())
                journal.reserve(task, r.OUTPUT_INITIAL)
            finally:
                journal.close()
            with self.assertRaisesRegex(ValueError, 'Drain or reconcile'):
                r.authorize_workers(self.root, self.ref, auth_ref)
        self.assertEqual(len(self.requests), 1)

    def test_source_hold_resolution_can_preserve_a_drained_pending_queue(self):
        plan, proof, disposition = self.source_hold_fixture()
        plan['articles'].append({'citation': {**self.citation, 'pmid': '789', 'report_id': 'report-789'}})
        atomic_json(self.root / 'cohort.json', {'article_pmids': ['123', '456', '789']})
        plan['continuation']['cohort_ref'] = reference(self.root, 'cohort.json')
        atomic_json(self.root / 'continuation_plan.json', plan); self.ref = reference(self.root, 'continuation_plan.json')
        with patch.object(r, 'PILOT_SIZE', 1), patch.object(r, 'REVIEWED_COHORT_SIZE', 3):
            r.prepare(self.root, self.ref)
            out = r.resolve_source_hold(self.root, self.ref, disposition)
            self.assertEqual(out['phase_status']['task_states'], {'pending': 1, 'local_excluded': 1})
            _, auth_ref = self.worker_authorization_fixture()
            self.assertEqual(r.authorize_workers(self.root, self.ref, auth_ref)['worker_ceiling'], 128)
            with patch.object(r.quantitative, 'validate', side_effect=self.valid):
                out = r.run(self.root, self.ref, workers=128, transport=self.transport([
                    Response(response('resp-pending'), {'x-request-id': 'req-pending'})]))
            self.assertEqual(out['finished_articles'], 2); self.assertEqual(out['attempts'], 1)
            self.assertEqual(out['new_R2_decisions'], {'retain': 1, 'exclude': 1})
        self.assertEqual(len(self.requests), 2)

    def test_hold_gate_race_resumes_known_unsent_once_without_resetting_attempts(self):
        r.prepare(self.root, self.ref)
        transport = self.transport([])
        class GateStop:
            def send(inner, task, attempt_id, directory, **kwargs):
                return transport.send(task, attempt_id, directory, gate=lambda task: False)
        out = r.run(self.root, self.ref, workers=1, transport=GateStop())
        self.assertEqual(out['task_states'], {'not_sent': 1}); self.assertEqual(out['attempts'], 1)
        self.assertEqual(out['gateway_known_cost_subtotal_usd'], '0'); self.assertEqual(len(self.requests), 0)
        out = self.invoke([Response(response('resp-after-hold'), {'x-request-id': 'req-after-hold', 'x-litellm-response-cost': '.02'})])
        self.assertEqual(out['finished_articles'], 1); self.assertEqual(out['attempts'], 2)
        self.assertEqual(out['gateway_known_cost_subtotal_usd'], '0.02')
        self.assertEqual(self.invoke([])['attempts'], 2); self.assertEqual(len(self.requests), 1)

    def test_unsent_requeue_refuses_other_errors_wire_artifacts_and_attempt_ceiling(self):
        r.prepare(self.root, self.ref)
        class OtherNotSent:
            def send(inner, *args, **kwargs):
                return {'status': 'not_sent', 'sent': False, 'error': {'type': 'unverified_reason'}, 'usage': None, 'retryable': False}
        r.run(self.root, self.ref, workers=1, transport=OtherNotSent())
        self.assertEqual(self.invoke([])['task_states'], {'not_sent': 1})
        record = {'attempt_id': 'fixture-a1', 'state': 'not_sent', 'ordinal': 1,
            'result': {'status': 'not_sent', 'sent': False, 'error': {'type': 'dispatch_gate'}, 'usage': None, 'retryable': False},
            'gateway_reported_proxy_estimate_usd': '0', 'reference_OpenAI_standard_usage_upper_bound_usd': '0.000000', 'usage': None}
        r._verify_unsent_gate(self.root, self.phase, record)
        with self.assertRaises(ValueError): r._verify_unsent_gate(self.root, self.phase, {**record, 'ordinal': 3})
        directory = self.root / f'data/current/reextraction/{self.phase}/calls/fixture-a1'
        directory.mkdir(parents=True)
        with self.assertRaises(ValueError): r._verify_unsent_gate(self.root, self.phase, record)
        self.assertEqual(len(self.requests), 0)

    def test_status_cache_reuses_verified_decision_and_detects_changed_file(self):
        r.prepare(self.root, self.ref)
        self.invoke([Response(response('resp-pilot'), {'x-request-id': 'req-pilot'})])
        journal = r.PilotJournal(self.root, self.phase)
        try:
            original = r.verified_json
            with patch.object(r, 'verified_json', wraps=original) as reader:
                r._status(journal); reads = reader.call_count
                r._status(journal); self.assertEqual(reader.call_count, reads)
                ref = json.loads(journal.task_rows()[0]['result_ref_json'])
                file = self.root / ref['path']; file.write_text(file.read_text() + ' ')
                with self.assertRaisesRegex(ValueError, 'no longer matches'): r._status(journal)
        finally:
            journal.close()


if __name__ == '__main__': unittest.main()
