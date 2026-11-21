"""Offline candidate tests. No real key, remote request or production journal."""
from pathlib import Path
import copy
import json
import sqlite3
import sys
import unittest

import test_complementary_runtime as fixture
from metamelanoma import complementary_runtime as r
from metamelanoma.io import canonical, digest, reference


class ReplacementTests(fixture.ComplementaryRuntimeTests):
    def replaced_database(self, journal, mutate=None):
        target = self.root / r.JOURNAL
        candidate = target.with_name('replacement-fixture.sqlite3')
        connection = sqlite3.connect(candidate)
        journal.db.backup(connection)
        if mutate:
            mutate(connection)
        connection.commit(); connection.close()
        candidate.replace(target)

    def test_identical_atomic_database_replacement_resumes_under_same_lease(self):
        self.prepare()
        with r.Journal(self.root) as journal:
            old = journal.db; before = journal.verify_events()
            self.replaced_database(journal)
            with journal.transaction():
                journal.event('fixture_reconnected_without_new_provider_request')
            self.assertIsNot(journal.db, old)
            self.assertNotEqual(journal.verify_events(), before)
            with self.assertRaises(RuntimeError):
                r.Journal(self.root)
        self.assertFalse(self.calls)

    def test_database_replacement_while_http_in_flight_records_response_without_resend(self):
        self.prepare()
        def send(request, **_):
            self.calls.append(request)
            target = self.root / r.JOURNAL
            source = sqlite3.connect(target.as_uri()+'?mode=ro', uri=True)
            destination = target.with_name('replacement-in-flight.sqlite3')
            clone = sqlite3.connect(destination)
            source.backup(clone); clone.close(); source.close()
            destination.replace(target)
            return fixture.Response(fixture.response(), headers={'x-litellm-response-cost':'0.25'})
        out = self.run_reviews(sender=send)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(out['article_counts']['completed'], 1)
        self.assertEqual(out['gateway_reported_cost_usd'], '0.25')
        self.assertEqual(out['unknown_cost_attempts'], 0)
        self.run_reviews(sender=send)
        self.assertEqual(len(self.calls), 1)

    def test_divergent_replacement_event_head_is_never_adopted(self):
        self.prepare()
        with r.Journal(self.root) as journal:
            old = journal.db
            def diverge(db):
                previous = db.execute('SELECT event_hash FROM complementary_events ORDER BY seq DESC LIMIT 1').fetchone()[0]
                payload = canonical({'kind':'fixture_other_writer','at':'2026-11-16'}).decode()
                hashed = digest((previous+'\n'+payload).encode())
                db.execute('INSERT INTO complementary_events(previous_hash,event_hash,payload) VALUES(?,?,?)', (previous,hashed,payload))
            self.replaced_database(journal, diverge)
            with self.assertRaisesRegex(ValueError, 'event head differs'):
                with journal.transaction():
                    self.fail('Divergent replacement reached write body')
            self.assertIs(journal.db, old)

    def test_same_head_but_divergent_accounting_state_is_never_adopted(self):
        self.prepare()
        with r.Journal(self.root) as journal:
            old = journal.db
            self.replaced_database(journal, lambda db: db.execute("UPDATE complementary_articles SET attempts=99 WHERE pmid='1'"))
            with self.assertRaisesRegex(ValueError, 'state differs'):
                with journal.transaction():
                    self.fail('Divergent replacement reached write body')
            self.assertIs(journal.db, old)

    def test_open_transaction_cannot_switch_database_inodes(self):
        self.prepare()
        with r.Journal(self.root) as journal:
            self.replaced_database(journal)
            journal.db.execute('BEGIN')
            try:
                with self.assertRaisesRegex(RuntimeError, 'open transaction'):
                    journal._ensure_current_database()
            finally:
                journal.db.rollback()

    def uncertain(self, previous_ordinal=3):
        self.prepare(('1', '2'))
        self.run_reviews(pmids=['1'])
        r.approve_parallel(self.root)
        replies = []
        if previous_ordinal == 3:
            replies.append(fixture.Response({'error': {'message': 'rate limited'}}, 429,
                                            {'retry-after': '0', 'x-litellm-response-cost': '0.1'}))
        if previous_ordinal >= 2:
            replies.append(fixture.Response(fixture.response(finish='length'),
                                            headers={'x-litellm-response-cost': '0.2'}))
        def send(request, **_):
            self.calls.append(request)
            if replies:
                return replies.pop(0)
            raise TimeoutError('synthetic uncertain send')
        out = self.run_reviews(pmids=['2'], sender=send)
        article = next(a for a in out['articles'] if a['pmid'] == '2')
        self.assertEqual(article['state'], 'held_uncertain_send')
        self.assertEqual(article['attempts'], previous_ordinal)
        self.calls.clear()
        return article

    def approval(self, article, *, change=None, name='approval.json'):
        with sqlite3.connect(self.root / r.JOURNAL) as db:
            record_raw = db.execute('SELECT record FROM complementary_attempts WHERE run_id=? AND pmid=? AND ordinal=?',
                                   (r.RUN_ID, article['pmid'], article['attempts'])).fetchone()[0]
        record = json.loads(record_raw)
        value = {'schema_version': 1, 'record_kind': 'user_approved_uncertain_send_replacements',
            'run_id': r.RUN_ID, 'authorized_by': 'user', 'authorization': 'Approve one replacement per article',
            'additional_calls_per_article': 1, 'preserve_unknown_costs': True,
            'articles': [{'pmid': article['pmid'], 'previous_attempt_id': record['attempt_id'],
                'previous_ordinal': article['attempts'], 'next_ordinal': article['attempts'] + 1,
                'previous_record_sha256': digest(record_raw.encode()),
                'previous_result_ref': record.get('result_ref'), 'packet_ref': record['packet_ref']}]}
        if change:
            change(value)
        (self.root / name).write_bytes(canonical(value))
        return reference(self.root, name)

    def old_attempts(self):
        with sqlite3.connect(self.root / r.JOURNAL) as db:
            return db.execute('SELECT attempt_id,state,record,cost_usd,cost_status,usage FROM complementary_attempts ORDER BY attempt_id').fetchall()

    def test_approved_fourth_attempt_preserves_every_prior_record_and_cost(self):
        article = self.uncertain(3); before = self.old_attempts()
        initial = r.status(self.root)
        ref = self.approval(article)
        result = r.approve_replacements(self.root, ref)
        self.assertFalse(result['already_activated'])
        self.assertEqual(before, self.old_attempts())
        done = self.run_reviews(pmids=['2'])
        self.assertEqual(len(self.calls), 1)
        latest = next(a for a in done['articles'] if a['pmid'] == '2')
        self.assertEqual(latest['attempts'], 4)
        self.assertEqual(latest['state'], 'completed')
        self.assertEqual(latest['attempt_records'][-1]['record']['replacement_approval_ref'], ref)
        self.assertEqual(latest['attempt_records'][-1]['record']['automatic_replacement_retries'], 0)
        after = self.old_attempts()
        self.assertTrue(all(row in after for row in before))
        self.assertEqual(done['unknown_cost_attempts'], initial['unknown_cost_attempts'])
        self.assertEqual(r.MAX_ATTEMPTS, 3)
        r.approve_replacements(self.root, ref)
        self.run_reviews(pmids=['2'])
        self.assertEqual(len(self.calls), 1, 'activating the same approval cannot duplicate a completed replacement')

    def test_replacement_transient_error_has_no_automatic_retry_even_below_normal_ceiling(self):
        article = self.uncertain(1)
        r.approve_replacements(self.root, self.approval(article))
        def send(request, **_):
            self.calls.append(request)
            return fixture.Response({'error': {'message': 'rate limited'}}, 429, {'retry-after': '0'})
        done = self.run_reviews(pmids=['2'], sender=send)
        latest = next(a for a in done['articles'] if a['pmid'] == '2')
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(latest['state'], 'technical_hold')
        self.assertEqual(latest['attempts'], 2)
        self.run_reviews(pmids=['2'], sender=send)
        self.assertEqual(len(self.calls), 1)

    def test_replacement_timeout_preserves_two_unknown_liabilities_without_blind_repeat(self):
        article = self.uncertain(2); initial = r.status(self.root)['unknown_cost_attempts']
        r.approve_replacements(self.root, self.approval(article))
        def send(request, **_):
            self.calls.append(request)
            raise TimeoutError('synthetic uncertain replacement')
        out = self.run_reviews(pmids=['2'], sender=send)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(out['unknown_cost_attempts'], initial + 1)
        self.run_reviews(pmids=['2'], sender=send)
        self.assertEqual(len(self.calls), 1)

    def test_unbound_approval_does_not_raise_global_attempt_ceiling(self):
        article = self.uncertain(3); self.approval(article)
        with r.Journal(self.root) as journal:
            with journal.transaction():
                journal.db.execute('UPDATE complementary_articles SET state=? WHERE run_id=? AND pmid=?', ('ready', r.RUN_ID, '2'))
        with self.assertRaisesRegex(ValueError, 'ceiling'):
            self.run_reviews(pmids=['2'])
        self.assertFalse(self.calls)

    def test_invalid_approval_cannot_requeue_or_change_costs(self):
        article = self.uncertain(3); before = self.old_attempts()
        changes = [lambda v: v.update(authorization='inferred consent'),
                   lambda v: v.update(preserve_unknown_costs=False),
                   lambda v: v['articles'][0].update(next_ordinal=5),
                   lambda v: v['articles'][0].update(previous_record_sha256='0' * 64),
                   lambda v: v['articles'].append(copy.deepcopy(v['articles'][0])),
                   lambda v: v['articles'][0].update(pmid='3')]
        for i, change in enumerate(changes):
            ref = self.approval(article, change=change, name=f'bad-{i}.json')
            with self.assertRaises(ValueError):
                r.approve_replacements(self.root, ref)
        self.assertEqual(before, self.old_attempts())
        self.assertFalse(self.calls)

    def test_changed_article_or_approval_bytes_fail_before_sending(self):
        article = self.uncertain(2); ref = self.approval(article)
        with r.Journal(self.root) as journal:
            with journal.transaction():
                journal.db.execute('UPDATE complementary_articles SET state=? WHERE run_id=? AND pmid=?', ('completed', r.RUN_ID, '2'))
        with self.assertRaisesRegex(ValueError, 'Article changed'):
            r.approve_replacements(self.root, ref)
        with r.Journal(self.root) as journal:
            with journal.transaction():
                journal.db.execute('UPDATE complementary_articles SET state=? WHERE run_id=? AND pmid=?', ('held_uncertain_send', r.RUN_ID, '2'))
        r.approve_replacements(self.root, ref)
        (self.root / ref['path']).write_bytes(b'{}')
        with self.assertRaises(ValueError):
            self.run_reviews(pmids=['2'])
        self.assertFalse(self.calls)

    def test_explicit_requeue_after_consumption_cannot_send_again(self):
        article = self.uncertain(2); r.approve_replacements(self.root, self.approval(article))
        self.run_reviews(pmids=['2']); self.calls.clear()
        with r.Journal(self.root) as journal:
            with journal.transaction():
                journal.db.execute('UPDATE complementary_articles SET state=? WHERE run_id=? AND pmid=?', ('ready', r.RUN_ID, '2'))
        with self.assertRaisesRegex(ValueError, 'consumed or mismatched'):
            self.run_reviews(pmids=['2'])
        self.assertFalse(self.calls)


if __name__ == '__main__':
    unittest.main(verbosity=2)
