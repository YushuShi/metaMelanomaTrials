import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from metamelanoma import fulltext_reextraction as r, quantitative, quantitative_sources, screening
from metamelanoma.gateway import GatewaySettings
from metamelanoma.io import atomic_json, canonical, reference

URL = 'https://fixture.cornell.edu/v1/responses'


class Response:
    def __init__(self, data, headers=None, status=200, read_error=None):
        self.data = data; self.headers = headers or {}; self.status = status; self.read_error = read_error
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def geturl(self): return URL
    def read(self):
        if self.read_error: raise self.read_error
        return canonical(self.data)


def response(ident, *, status='completed', model=r.MODEL, effort='xhigh'):
    return {'id': ident, 'model': model, 'status': status, 'service_tier': 'default',
        'reasoning': {'effort': effort}, 'usage': {'input_tokens': 100, 'output_tokens': 200,
            'input_tokens_details': {'cached_tokens': 0, 'cache_write_tokens': 0}},
        'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': '{"fixture":true}'}]}]}


class FulltextTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve(); self.phase = 'melanoma-quantitative-r3-test'
        for name in ('data/current', 'config', 'src/metamelanoma'): (self.root / name).mkdir(parents=True)
        for name in r.PRODUCERS: (self.root / 'src/metamelanoma' / name).write_text('# frozen fixture\n')
        for name in ('accounting.sqlite3', 'gateway_accounting.sqlite3'):
            with sqlite3.connect(self.root / 'data/current' / name) as db:
                db.executescript('CREATE TABLE events(seq INTEGER,event_hash TEXT);'
                    'CREATE TABLE tasks(task_id TEXT);CREATE TABLE attempts(attempt_id TEXT);'
                    'CREATE TABLE metadata(key TEXT,value TEXT);'
                    'CREATE TABLE provider_identifiers(kind TEXT,value TEXT,attempt_id TEXT);')
                db.execute('INSERT INTO events VALUES(1,?)', ('a' * 64,))
                db.execute('INSERT INTO metadata VALUES(?,?)', ('policy', '{"legacy":"preserve"}'))
        self.citation = {'pmid': '123', 'report_id': 'report-123', 'title': 'Melanoma nivolumab trial',
            'abstract': 'Twenty-five patients with melanoma received nivolumab.', 'year': 2026}
        old_source = screening.build_source(self.citation, 'R2'); old = quantitative.empty_record(old_source)
        old['decision'] = {'status': 'retain', 'reason_code': 'eligible', 'reason': 'Human melanoma drug trial.', 'evidence': []}
        old['validation'] = {'decision_valid': True}
        self.prior = {'pmid': '123', 'task_id': 'qr2-old', 'validated': {'valid': True, 'global_errors': [], 'record': old}}
        atomic_json(self.root / 'R2.json', self.prior)
        self.source = screening.build_source(self.citation, 'R3',
            rawtext='Methods: Twenty-five patients with melanoma received nivolumab. Results: Ten patients responded.',
            fulltext_verified=True, upstream_R2=old)
        self.proof = {'main_article_complete': True, 'source_report_coverage_complete': False,
            'coverage_gaps': ['Uninterpreted figures retained as a coverage limitation.']}
        atomic_json(self.root / 'source.json', self.source); atomic_json(self.root / 'proof.json', self.proof)
        self.entry = {'pmid': '123', 'citation': self.citation, 'R2_artifact_ref': reference(self.root, 'R2.json'),
            'source_ref': reference(self.root, 'source.json'), 'source_proof_ref': reference(self.root, 'proof.json')}
        self.publication = {'articles': [{'pmid': '123', 'records': [{'stage': 'R2', 'record': old}]}]}
        self.routing = {'allowed_R2_decisions': ['retain', 'unclear'], 'full_text_verification_required': True,
            'candidates': [{'pmid': '123', 'report_id': 'report-123', 'R2_decision': 'retain',
                'R2_source_sha256': old['source_sha256'], 'R2_artifact_ref': self.entry['R2_artifact_ref']}]}
        atomic_json(self.root / 'publication.json', self.publication); atomic_json(self.root / 'routing.json', self.routing)
        atomic_json(self.root / 'corpus.json', {'articles': [self.entry]})
        atomic_json(self.root / 'catalog.json', {'http_status': 200, 'models_present': [r.MODEL]})
        atomic_json(self.root / 'config/pipeline.json', {'endpoint': URL, 'direct_OpenAI_dispatch_enabled': False})
        self.plan = {'phase_id': self.phase, 'stage': 'R3', 'model': r.MODEL, 'reasoning_effort': 'xhigh',
            'provider': r.PROVIDER, 'R3_dispatch_enabled': True, 'direct_OpenAI_dispatch_enabled': False,
            'max_attempts': 3, 'max_workers': 128, 'max_wire_bytes': r.WIRE_CEILING, 'article_pmids': ['123'],
            'R2_publication_ref': reference(self.root, 'publication.json'), 'R2_routing_ref': reference(self.root, 'routing.json'),
            'source_corpus_ref': reference(self.root, 'corpus.json'), 'catalog_ref': reference(self.root, 'catalog.json')}
        self.save_plan(); self.requests = []; self.before = r.base._legacy_heads(self.root)
        self.verifier = patch.object(quantitative_sources, 'verify_entry', side_effect=self.verify_entry).start()
        self.addCleanup(patch.stopall)

    def verify_entry(self, root, entry):
        return {'citation': entry['citation'], 'source': json.loads((root / entry['source_ref']['path']).read_text()),
            'proof': json.loads((root / entry['source_proof_ref']['path']).read_text()), 'blocks': self.source['blocks'], 'limitations': []}

    def save_plan(self):
        atomic_json(self.root / 'plan.json', self.plan); self.ref = reference(self.root, 'plan.json')

    def transport(self, replies):
        replies = iter(replies)
        def sender(request, **kwargs):
            self.requests.append(json.loads(request.data)); value = next(replies)
            if isinstance(value, Exception): raise value
            return value
        return r.FulltextTransport(root=self.root, expected_endpoint=URL, sender=sender,
            settings_loader=lambda *args, **kwargs: GatewaySettings('fixture-private-key', 60, URL[:-13]))

    def valid(self, payload, source):
        record = quantitative.empty_record(source)
        record['decision'] = {'status': 'retain', 'reason_code': 'eligible', 'reason': 'Eligible full-text melanoma drug report.', 'evidence': []}
        return {'valid': True, 'global_errors': [], 'issues': [], 'record': record}

    def invoke(self, replies, **kwargs):
        with patch.object(quantitative, 'validate', side_effect=self.valid), patch.object(r, 'retry_delay', return_value=0), patch.object(r.base, 'retry_delay', return_value=0):
            return r.run(self.root, self.ref, transport=self.transport(replies), **kwargs)

    def test_preparation_is_whole_source_current_r2_bound_and_free(self):
        status = r.prepare(self.root, self.ref)
        self.assertEqual(status['ready_tasks'], 1); self.assertEqual(status['attempts'], 0)
        self.assertEqual(status['entered_articles'], 0)
        task = json.loads(next((self.root / f'data/current/reextraction/{self.phase}/tasks').glob('*/task.json')).read_text())
        self.assertEqual(task['stage'], 'R3'); self.assertEqual(task['model'], 'gpt-6-luna')
        self.assertEqual(task['body']['reasoning'], {'effort': 'xhigh'})
        self.assertTrue(task['metadata']['whole_source_packet'])
        self.assertIn('Ten patients responded', task['body']['input'])
        self.assertEqual(task['metadata']['R2_artifact_ref'], self.entry['R2_artifact_ref'])
        self.assertEqual(r.base._legacy_heads(self.root), self.before)
        self.assertEqual(r.prepare(self.root, self.ref)['ready_tasks'], 1)

    def test_native_luna_result_costs_and_stage_preserved_without_r2_mutation(self):
        r.prepare(self.root, self.ref)
        status = self.invoke([Response(response('resp-r3'), {'x-request-id': 'req-r3', 'x-litellm-response-cost': '.012'})])
        self.assertEqual(status['finished_articles'], 1); self.assertEqual(status['entered_articles'], 1)
        self.assertEqual(status['new_R3_decisions'], {'retain': 1}); self.assertEqual(status['gateway_known_cost_subtotal_usd'], '0.012')
        snap = r.snapshot(self.root, self.ref); record = snap['records'][0]
        self.assertEqual(record['validation']['record']['stage'], 'R3')
        stored = json.loads((self.root / record['artifact_ref']['path']).read_text())
        self.assertEqual(stored['model'], 'gpt-6-luna'); self.assertEqual(stored['stage'], 'R3')
        self.assertTrue(snap['reports'][0]['main_article_review_complete'])
        self.assertFalse(snap['reports'][0]['report_complete'])
        self.assertEqual(self.invoke([])['attempts'], 1); self.assertEqual(len(self.requests), 1)
        self.assertEqual(r.base._legacy_heads(self.root), self.before)
        for p in (self.root / f'data/current/reextraction/{self.phase}/calls').rglob('*'):
            if p.is_file(): self.assertNotIn(b'fixture-private-key', p.read_bytes())

    def test_r2_exclusions_foreign_bindings_and_unauthorized_routes_never_prepare(self):
        for update in ({'R3_dispatch_enabled': False}, {'model': 'gpt-6.1-sol'}, {'reasoning_effort': 'high'},
                       {'max_workers': 129}, {'max_attempts': 4}, {'direct_OpenAI_dispatch_enabled': True}):
            original = dict(self.plan); self.plan.update(update); self.save_plan()
            with self.assertRaises(ValueError): r.prepare(self.root, self.ref)
            self.plan = original
        self.save_plan()
        self.routing['candidates'][0]['R2_decision'] = 'exclude'
        atomic_json(self.root / 'routing.json', self.routing); self.plan['R2_routing_ref'] = reference(self.root, 'routing.json'); self.save_plan()
        with self.assertRaisesRegex(ValueError, 'R2-excluded'): r.prepare(self.root, self.ref)
        self.assertEqual(self.requests, [])

    def test_source_or_wire_problem_is_visible_hold_never_truncation(self):
        with patch.object(quantitative_sources, 'verify_entry', side_effect=ValueError('Main text identity mismatch')):
            out = r.prepare(self.root, self.ref)
        self.assertEqual(out['ready_tasks'], 0); self.assertEqual(out['selected_articles'], 1)
        self.assertIn('identity mismatch', out['source_or_request_holds'][0]['reason'])
        self.assertEqual(out['entered_articles'], 0); self.assertEqual(self.requests, [])

    def test_missing_verified_main_and_r2_upstream_mismatch_are_held(self):
        for change in (lambda s: s.update(main_full_text_verified=False),
                       lambda s: s['upstream_R2']['decision'].update(status='exclude')):
            bad = json.loads(json.dumps(self.source)); change(bad)
            with patch.object(quantitative_sources, 'verify_entry', return_value={'source': bad}):
                with self.assertRaises(ValueError): r.build_task(self.root, self.phase, self.entry)

    def test_read_only_snapshot_works_while_writer_lease_exists(self):
        r.prepare(self.root, self.ref); writer = r.FulltextJournal(self.root, self.phase)
        try:
            self.assertEqual(r.snapshot(self.root, self.ref)['status']['ready_tasks'], 1)
        finally: writer.close()

    def test_snapshot_requires_exact_prepared_plan_reference_not_a_clone(self):
        r.prepare(self.root, self.ref)
        atomic_json(self.root / 'cloned_plan.json', self.plan)
        with self.assertRaisesRegex(ValueError, 'exact prepared R3 plan reference'):
            r.snapshot(self.root, reference(self.root, 'cloned_plan.json'))

    def test_r3_recovery_uses_saved_response_without_another_request(self):
        r.prepare(self.root, self.ref); journal = r.FulltextJournal(self.root, self.phase)
        try:
            task = json.loads((self.root / json.loads(journal.task_rows()[0]['task_ref_json'])['path']).read_text())
            reservation = journal.reserve(task, r.OUTPUT_INITIAL)
            self.transport([Response(response('resp-saved'), {'x-request-id': 'req-saved', 'x-litellm-response-cost': '.01'})]).send(
                task, reservation['attempt_id'], f'data/current/reextraction/{self.phase}/calls/{reservation["attempt_id"]}')
        finally: journal.close()
        self.assertEqual(self.invoke([])['finished_articles'], 1); self.assertEqual(len(self.requests), 1)

    def test_unknown_and_partially_received_network_errors_never_automatically_retry(self):
        r.prepare(self.root, self.ref)
        out = self.invoke([TimeoutError()])
        self.assertEqual(out['task_states'], {'held_unknown_send': 1})
        self.assertEqual(self.invoke([])['attempts'], 1); self.assertEqual(len(self.requests), 1)

    def test_timeout_after_http_headers_is_held_without_duplicate_send(self):
        r.prepare(self.root, self.ref)
        out = self.invoke([Response({}, {'x-request-id': 'req-partial'}, read_error=TimeoutError())])
        self.assertEqual(out['task_states'], {'provider_hold': 1}); self.assertEqual(out['gateway_cost_unknown_attempts'], 1)
        self.assertEqual(self.invoke([])['attempts'], 1); self.assertEqual(len(self.requests), 1)

    def test_known_429_and_output_limit_have_bounded_metered_retries(self):
        r.prepare(self.root, self.ref)
        incomplete = response('resp-short', status='incomplete'); incomplete['incomplete_details'] = {'reason': 'max_output_tokens'}
        out = self.invoke([Response({'error': {'type': 'rate_limit'}}, {'x-request-id': 'req-rate', 'x-litellm-response-cost': '0'}, status=429),
            Response(incomplete, {'x-request-id': 'req-short', 'x-litellm-response-cost': '.01'}),
            Response(response('resp-done'), {'x-request-id': 'req-done', 'x-litellm-response-cost': '.02'})])
        self.assertEqual(out['attempts'], 3); self.assertEqual(out['finished_articles'], 1)
        self.assertEqual([q['max_output_tokens'] for q in self.requests], [32768, 32768, 65536])
        self.assertEqual(out['gateway_known_cost_subtotal_usd'], '0.03')

    def test_wrong_returned_model_or_effort_never_produces_accepted_r3(self):
        r.prepare(self.root, self.ref)
        out = self.invoke([Response(response('resp-wrong', model='gpt-6.1-sol'), {'x-request-id': 'req-wrong'})])
        self.assertEqual(out['task_states'], {'held_integrity': 1}); self.assertEqual(r.completed_records(self.root, self.ref), [])

    def test_prepared_phase_and_producer_files_are_immutable(self):
        r.prepare(self.root, self.ref)
        (self.root / 'src/metamelanoma/fulltext_reextraction.py').write_text('# changed\n')
        with self.assertRaisesRegex(ValueError, 'producing code changed'): self.invoke([])
        self.assertEqual(self.requests, [])

    def attempt_rows(self):
        with sqlite3.connect(self.root / r.base.DB_PATH) as db:
            return db.execute('SELECT * FROM reextraction_attempts ORDER BY attempt_id').fetchall()

    def test_producer_amendment_replays_native_r3_without_new_requests_or_cost_changes(self):
        # Simulate the original frozen producer set before a reviewed helper is added.
        prior_producers = tuple(name for name in r.PRODUCERS if name != 'quantitative_tables.py')
        with patch.object(r, 'PRODUCERS', prior_producers): r.prepare(self.root, self.ref)
        def old_validation(payload, source):
            result = self.valid(payload, source)
            result['issues'] = [{'code': 'source_number_not_supported', 'row_id': 'sample-1'}]
            return result
        with patch.object(quantitative, 'validate', side_effect=old_validation):
            r.run(self.root, self.ref, transport=self.transport([Response(response('resp-original'),
                {'x-request-id': 'req-original', 'x-litellm-response-cost': '.02'})]))
        before = r.snapshot(self.root, self.ref); attempts_before = self.attempt_rows()
        old_result = before['records'][0]['artifact_ref']
        authority_path = next((self.root / f'data/current/reextraction/{self.phase}').glob('authority*.json'))
        authority_bytes = authority_path.read_bytes(); plan_bytes = (self.root / 'plan.json').read_bytes()
        raw_files = {p: p.read_bytes() for p in (self.root / f'data/current/reextraction/{self.phase}/calls').rglob('*') if p.is_file()}
        (self.root / 'src/metamelanoma/quantitative.py').write_text('# repaired validator\n')
        (self.root / 'src/metamelanoma/fulltext_reextraction.py').write_text('# explicit amendment API\n')
        with patch.object(quantitative, 'validate', side_effect=self.valid):
            amended = r.amend_producers(self.root, self.ref, 'Repair exact table sample-size support.')
        self.assertEqual(amended['new_model_requests'], 0)
        self.assertEqual(amended['revalidated_articles'], 1)
        self.assertIn('src/metamelanoma/quantitative_tables.py', amended['changed_files'])
        self.assertTrue(amended['attempt_records_unchanged'])
        after = r.snapshot(self.root, self.ref)
        self.assertEqual(after['reports'][0]['technical_state'], 'complete')
        self.assertEqual(after['records'][0]['validation']['record']['stage'], 'R3')
        self.assertEqual(after['status']['gateway_known_cost_subtotal_usd'], before['status']['gateway_known_cost_subtotal_usd'])
        self.assertNotEqual(after['records'][0]['artifact_ref'], old_result)
        self.assertEqual(reference(self.root, old_result['path']), old_result)
        saved = json.loads((self.root / after['records'][0]['artifact_ref']['path']).read_text())
        self.assertEqual(saved['model'], 'gpt-6-luna'); self.assertEqual(saved['reasoning_effort'], 'xhigh')
        self.assertEqual(self.attempt_rows(), attempts_before)
        self.assertEqual(authority_path.read_bytes(), authority_bytes)
        self.assertEqual((self.root / 'plan.json').read_bytes(), plan_bytes)
        self.assertEqual({p: p.read_bytes() for p in raw_files}, raw_files)
        self.assertEqual(len(self.requests), 1)
        with patch.object(quantitative, 'validate', side_effect=self.valid):
            again = r.amend_producers(self.root, self.ref, 'Idempotent verified replay.')
        self.assertEqual(again['revalidated_articles'], 0)
        self.assertEqual(again['status'], 'producer_unchanged')
        self.assertEqual(self.invoke([])['attempts'], 1)
        self.assertEqual(r.base._legacy_heads(self.root), self.before)

    def test_producer_amendment_rejects_request_changes_without_mutating_history(self):
        r.prepare(self.root, self.ref)
        original = quantitative.request_body
        def changed(*args, **kwargs):
            body = original(*args, **kwargs); body['instructions'] += ' changed'; return body
        with patch.object(quantitative, 'request_body', side_effect=changed):
            with self.assertRaisesRegex(ValueError, 'change a recorded request body'):
                r.amend_producers(self.root, self.ref, 'Not a valid wire-identical repair.')
        self.assertEqual(self.attempt_rows(), [])
        self.assertEqual(r.snapshot(self.root, self.ref)['status']['task_states'], {'pending': 1})
        self.assertEqual(self.requests, [])

    def test_producer_amendment_requires_drained_and_known_request_states(self):
        r.prepare(self.root, self.ref); journal = r.FulltextJournal(self.root, self.phase)
        try:
            task = json.loads((self.root / json.loads(journal.task_rows()[0]['task_ref_json'])['path']).read_text())
            journal.reserve(task, r.OUTPUT_INITIAL)
        finally: journal.close()
        before = self.attempt_rows()
        with self.assertRaisesRegex(ValueError, 'Drain or reconcile'):
            r.amend_producers(self.root, self.ref, 'Cannot amend a live request.')
        self.assertEqual(self.attempt_rows(), before)
        self.assertEqual(self.requests, [])

    def test_producer_amendment_rejects_unknown_send_without_retry(self):
        r.prepare(self.root, self.ref); self.invoke([TimeoutError()])
        before = self.attempt_rows()
        with self.assertRaisesRegex(ValueError, 'Drain or reconcile'):
            r.amend_producers(self.root, self.ref, 'Unknown provider completion must stay held.')
        self.assertEqual(self.attempt_rows(), before)
        self.assertEqual(len(self.requests), 1)

    def test_producer_amendment_rejects_unreviewed_parser_transport_changes(self):
        r.prepare(self.root, self.ref)
        (self.root / 'src/metamelanoma/transport.py').write_text('# unreviewed change\n')
        with self.assertRaisesRegex(ValueError, 'Only the reviewed compact validator'):
            r.amend_producers(self.root, self.ref, 'Cannot alter provider transport.')
        self.assertEqual(self.attempt_rows(), [])
        self.assertEqual(self.requests, [])

    def token_proof(self, body, tokens=200000):
        atomic_json(self.root / 'count_request.json', body)
        atomic_json(self.root / 'count_response.json', {'object': 'response.input_tokens', 'input_tokens': tokens})
        proof = {'record_kind': 'Cornell_R3_input_token_count', 'pmid': '123', 'model': r.MODEL,
            'endpoint': URL + '/input_tokens', 'http_status': 200, 'object': 'response.input_tokens',
            'input_tokens': tokens, 'request_body_sha256': r.digest(canonical(body)),
            'count_request_ref': reference(self.root, 'count_request.json'),
            'count_response_ref': reference(self.root, 'count_response.json'), 'completion_requests': 0}
        atomic_json(self.root / 'count_proof.json', proof)
        return proof, reference(self.root, 'count_proof.json')

    def test_large_whole_input_requires_exact_provider_count_and_retry_keeps_input(self):
        body = {'model': r.MODEL, 'input': 'x' * 800000, 'instructions': 'Whole source',
            'max_output_tokens': r.OUTPUT_INITIAL, 'reasoning': {'effort': 'xhigh'}}
        with self.assertRaisesRegex(ValueError, 'token-count proof'): r.verify_input_bound(self.root, '123', body)
        _, ref = self.token_proof(body)
        result = r.verify_input_bound(self.root, '123', body, ref)
        self.assertEqual(result['input_tokens'], 200000)
        retry = {**body, 'max_output_tokens': r.OUTPUT_CEILING}
        self.assertEqual(r.verify_input_bound(self.root, '123', retry, ref)['input_tokens'], 200000)
        with self.assertRaises(ValueError): r.verify_input_bound(self.root, '123', {**retry, 'input': body['input'] + 'changed'}, ref)
        self.assertEqual(self.requests, [])

    def test_token_count_proofs_reject_client_only_wrong_request_model_route_and_limits(self):
        body = {'model': r.MODEL, 'input': 'x' * 800000, 'max_output_tokens': r.OUTPUT_INITIAL}
        proof, ref = self.token_proof(body)
        for change in (lambda p: p.update(input_tokens=1), lambda p: p.update(pmid='456'),
                       lambda p: p.update(model='gpt-6.1-sol'), lambda p: p.update(http_status=500),
                       lambda p: p.update(endpoint='https://outside.example/v1/responses/input_tokens'),
                       lambda p: p.update(request_body_sha256='0' * 64)):
            bad = json.loads(json.dumps(proof)); change(bad); atomic_json(self.root / 'bad_count.json', bad)
            with self.assertRaises(ValueError): r.verify_input_bound(self.root, '123', body, reference(self.root, 'bad_count.json'))
        _, ref = self.token_proof(body, tokens=850001)
        with self.assertRaises(ValueError): r.verify_input_bound(self.root, '123', body, ref)
        with self.assertRaises(ValueError): r.verify_input_bound(self.root, '123', {**body, 'input': 'x' * 6000000}, ref)
        self.assertEqual(self.requests, [])


class FulltextLimitTests(unittest.TestCase):
    def setUp(self):
        self.task = {'body': {'model': 'gpt-6-luna', 'input': 'complete source', 'max_output_tokens': 32768}}

    def result(self, remaining=0, reset='0', status=200):
        return {'http_status': status, 'headers': {
            'x-ratelimit-remaining-requests': str(remaining), 'x-ratelimit-remaining-tokens': str(remaining),
            'x-ratelimit-reset-requests': reset, 'x-ratelimit-reset-tokens': reset}}

    def test_explicit_zero_reset_expires_immediately_even_at_zero_remaining(self):
        limits = r.FulltextObservedLimits(128)
        with patch.object(r.time, 'time', return_value=100):
            limits.observe(self.result())
            self.assertEqual(limits.reset, 100)
            self.assertTrue(limits.can_send(self.task, 0))
            self.assertIsNone(limits.tokens); self.assertIsNone(limits.requests)
            self.assertFalse(limits.can_send(self.task, 128))

    def test_positive_reset_and_local_remaining_are_honored(self):
        limits = r.FulltextObservedLimits(128)
        with patch.object(r.time, 'time', return_value=100):
            limits.observe(self.result(reset='10s'))
            self.assertFalse(limits.can_send(self.task, 0))
        with patch.object(r.time, 'time', return_value=109.99):
            self.assertFalse(limits.can_send(self.task, 0))
        with patch.object(r.time, 'time', return_value=110):
            self.assertTrue(limits.can_send(self.task, 0))

    def test_latest_header_cannot_refill_an_unexpired_local_window(self):
        limits = r.FulltextObservedLimits(128)
        bound = len(canonical(self.task['body'])) + 4096 + 32768
        result = self.result(remaining=2 * bound, reset='10')
        result['headers']['x-ratelimit-remaining-requests'] = '2'
        with patch.object(r.time, 'time', return_value=100):
            limits.observe(result); limits.sent(self.task); limits.sent(self.task)
            self.assertFalse(limits.can_send(self.task, 0))
            limits.observe(result)
            self.assertEqual(limits.requests, 0); self.assertEqual(limits.tokens, 0)
            self.assertFalse(limits.can_send(self.task, 0))

    def test_missing_reset_retains_conservative_fallback(self):
        limits = r.FulltextObservedLimits(128)
        with patch.object(r.time, 'time', return_value=100):
            limits.observe(self.result(reset='unknown'))
            self.assertEqual(limits.reset, 160)
            self.assertFalse(limits.can_send(self.task, 0))

    def test_mixed_windows_keep_genuine_positive_reset(self):
        limits = r.FulltextObservedLimits(128); result = self.result()
        result['headers']['x-ratelimit-reset-tokens'] = '2s'
        with patch.object(r.time, 'time', return_value=100):
            limits.observe(result)
            self.assertEqual(limits.reset, 102)
            self.assertFalse(limits.can_send(self.task, 0))

    def test_429_and_503_still_reduce_concurrency_and_honor_backoff(self):
        limits = r.FulltextObservedLimits(128)
        with patch.object(r.time, 'time', return_value=100), patch.object(r, 'retry_delay', return_value=20) as delay:
            limits.observe(self.result(status=429)); self.assertEqual(limits.limit, 64)
            self.assertEqual(limits.blocked, 120); self.assertFalse(limits.can_send(self.task, 0))
            limits.observe(self.result(status=503)); self.assertEqual(limits.limit, 32)
            self.assertEqual(delay.call_count, 2)
        with patch.object(r.time, 'time', return_value=120):
            self.assertTrue(limits.can_send(self.task, 31)); self.assertFalse(limits.can_send(self.task, 32))

    def test_repeated_cornell_zero_headers_never_create_sliding_minute_pause(self):
        limits = r.FulltextObservedLimits(128); original = canonical(self.task)
        result = self.result(remaining=15000000)
        result['headers']['x-ratelimit-remaining-requests'] = '14999'
        for n in range(500):
            with patch.object(r.time, 'time', return_value=100 + n / 100):
                limits.observe(result)
                self.assertTrue(limits.can_send(self.task, 127))
                limits.sent(self.task)
        self.assertEqual(canonical(self.task), original)


if __name__ == '__main__': unittest.main()
