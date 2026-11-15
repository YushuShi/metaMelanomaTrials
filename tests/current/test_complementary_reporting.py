from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from metamelanoma import complementary_amendments as amendments
from metamelanoma.complementary_reporting import paired_values, review_rows, explicit_dispositions, load_dispositions, whitespace_confirmations
from metamelanoma.io import atomic_json, canonical, digest, reference
from metamelanoma import complementary_contract as contract
from test_complementary_contract import fixture, finding as contract_finding, rebind


class ReviewTableTests(unittest.TestCase):
    def packet(self):
        return {'source': {'pmid': '123', 'stage': 'R3'}, 'source_catalog': {'spans': []}, 'targets': [
            {'record_id': 'r2', 'stage': 'R2', 'record': {'study': {'name': 'Trial'},
                'effects': [{'id': 'old-other', 'estimate': 9}, {'id': 'old', 'estimate': .7}]}},
            {'record_id': 'r3', 'stage': 'R3', 'record': {'study': {'name': 'Trial'},
                'effects': [{'id': 'new', 'estimate': .6, 'population_id': 'p'}],
                'populations': [{'id': 'p', 'label': 'Overall'}],
                'r2_links': [{'section': 'effects', 'r2_id': 'old', 'r3_id': 'new', 'relation': 'conflict'}]}}]}

    def finding(self):
        return {'id': 'f1', 'action': 'unresolved', 'target': {'stage': 'R3', 'record_id': 'r3',
            'section': 'effects', 'row_id': 'new', 'field_path': '/effects/0/estimate'},
            'value': .65, 'evidence': [], 'reason': 'Source gives a different estimate.'}

    def test_source_links_match_rows_in_different_positions(self):
        packet = self.packet()
        self.assertEqual(paired_values(packet, self.finding()), {'R2': '0.7', 'R3': '0.6'})

    def test_unlinked_rows_are_not_matched_by_array_index(self):
        packet = self.packet()
        packet['targets'][1]['record']['r2_links'] = []
        self.assertEqual(paired_values(packet, self.finding())['R2'], 'NA (no established corresponding row)')

    def test_review_table_keeps_stage_values_and_status_without_mutating(self):
        packet = self.packet()
        before = deepcopy(packet)
        rows = review_rows(packet, {'accepted_findings': [self.finding()]}, attempt_id='a1')
        self.assertEqual(rows[0]['GPT R2 value'], '0.7')
        self.assertEqual(rows[0]['GPT R3 value'], '0.6')
        self.assertEqual(rows[0]['Claude finding'], '0.65')
        self.assertEqual(rows[0]['Review status'], 'Unresolved')
        self.assertEqual(packet, before)

    def test_confirmations_do_not_fill_discrepancy_table(self):
        finding = {**self.finding(), 'action': 'confirmed'}
        self.assertEqual(review_rows(self.packet(), {'accepted_findings': [finding]}, attempt_id='a1'), [])

    def test_confirmed_latest_unclear_eligibility_remains_visible(self):
        packet = self.packet()
        for target in packet['targets']:
            target['record']['decision'] = {'status': 'unclear'}
        finding = {**self.finding(), 'action': 'confirmed', 'value': 'unclear', 'target': {
            'stage': 'R3', 'record_id': 'r3', 'section': 'decision', 'row_id': 'decision',
            'field_path': '/decision/status'}}
        rows = review_rows(packet, {'accepted_findings': [finding]}, attempt_id='a1')
        self.assertEqual(rows[0]['GPT R3 value'], 'unclear')
        self.assertEqual(rows[0]['Claude finding'], 'unclear')
        self.assertEqual(rows[0]['Review status'], 'Eligibility remains unclear; existing decision confirmed')
        finding['target'].update(stage='R2', record_id='r2')
        self.assertEqual(review_rows(packet, {'accepted_findings': [finding]}, attempt_id='a1'), [])

    def disposition_context(self, disposition='confirmed'):
        packet = self.packet()
        packet['packet_sha256'] = 'packet'
        finding = self.finding()
        validation = {'held_findings': [{'finding': finding, 'issue': {'code': 'literal check'}}]}
        review_ref = {'path': 'review.json', 'sha256': 'review'}
        decision = {'finding_id': finding['id'], 'disposition': disposition, 'explicit_decision': True,
            'rationale': 'Checked the original source.', 'finding_sha256': digest(canonical(finding)),
            'target': deepcopy(finding['target']), 'target_record_sha256': digest(canonical(packet['targets'][1]['record']))}
        ledger = {'review_ref': review_ref, 'packet_sha256': 'packet', 'pmid': '123',
                  'decisions': [decision], 'reviewer': 'Codex source review', 'reviewed_at': '2026-11-14'}
        index = {('review.json', 'review'): [{'ledger': ledger, 'ref': {'path': 'ledger.json', 'sha256': 'ledger'}}]}
        return packet, finding, validation, review_ref, index

    def test_source_confirmations_leave_audit_without_repeating_the_review_task(self):
        packet, finding, validation, ref, index = self.disposition_context()
        before = deepcopy((packet, validation, index))
        dispositions, errors = explicit_dispositions(packet, validation, ref, index)
        audit = []
        self.assertFalse(errors)
        self.assertEqual(review_rows(packet, validation, attempt_id='a1', dispositions=dispositions, adjudicated_rows=audit), [])
        self.assertEqual(audit[0]['Review status'], 'Source-confirmed; no data change')
        self.assertFalse(audit[0]['applied_or_published_by_this_report'])
        self.assertEqual((packet, validation, index), before)

    def test_optional_reference_byte_count_does_not_change_the_content_identity(self):
        packet, _, validation, ref, index = self.disposition_context()
        dispositions, errors = explicit_dispositions(packet, validation, {**ref, 'bytes': 123}, index)
        self.assertFalse(errors)
        self.assertEqual(dispositions['f1']['disposition'], 'confirmed')

    def test_rejected_proposals_are_audited_and_not_repeated(self):
        packet, _, validation, ref, index = self.disposition_context('reject')
        dispositions, _ = explicit_dispositions(packet, validation, ref, index)
        audit = []
        self.assertEqual(review_rows(packet, validation, attempt_id='a1', dispositions=dispositions, adjudicated_rows=audit), [])
        self.assertEqual(audit[0]['Review status'], 'Proposal rejected; no data change')

    def test_apply_permission_does_not_claim_an_amendment_was_published(self):
        packet, _, validation, ref, index = self.disposition_context('apply')
        dispositions, _ = explicit_dispositions(packet, validation, ref, index)
        rows = review_rows(packet, validation, attempt_id='a1', dispositions=dispositions)
        self.assertEqual(rows[0]['Review status'], 'Approved proposal; amendment validation and publication pending')

    def test_latest_unclear_eligibility_survives_explicit_confirmation_even_with_raw_value(self):
        packet = self.packet()
        packet['targets'][1]['record']['decision'] = {'status': 'unclear'}
        finding = {'id': 'eligibility', 'action': 'confirmed', 'value_json': '"unclear"', 'target': {
            'stage': 'R3', 'record_id': 'r3', 'section': 'decision', 'row_id': 'decision',
            'field_path': '/decision/status'}}
        decision = {'disposition': 'confirmed', 'decisions': [{'rationale': 'Evidence remains insufficient.'}]}
        rows = review_rows(packet, {'held_findings': [{'finding': finding, 'issue': {'code': 'literal'}}]},
                           attempt_id='a1', dispositions={'eligibility': decision})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['Review status'], 'Eligibility remains unclear; source review recorded')

    def test_stale_finding_or_target_hash_never_closes_a_finding(self):
        for field in ['finding_sha256', 'target_record_sha256']:
            with self.subTest(field=field):
                packet, _, validation, ref, index = self.disposition_context()
                index[('review.json', 'review')][0]['ledger']['decisions'][0][field] = 'stale'
                dispositions, errors = explicit_dispositions(packet, validation, ref, index)
                self.assertTrue(errors)
                rows = review_rows(packet, validation, attempt_id='a1', dispositions=dispositions)
                self.assertIn('Conflicting or invalid', rows[0]['Review status'])

    def test_conflicting_explicit_decisions_are_visible_instead_of_last_write_winning(self):
        packet, _, validation, ref, index = self.disposition_context()
        later = deepcopy(index[('review.json', 'review')][0])
        later['ledger']['decisions'][0]['disposition'] = 'reject'
        later['ledger']['reviewed_at'] = '2026-11-15'
        index[('review.json', 'review')].append(later)
        dispositions, errors = explicit_dispositions(packet, validation, ref, index)
        self.assertFalse(errors)
        self.assertTrue(dispositions['f1']['conflict'])
        self.assertEqual(len(review_rows(packet, validation, attempt_id='a1', dispositions=dispositions)), 1)

    def test_implicit_unresolved_defaults_do_not_override_prior_explicit_review(self):
        for explicit in [None, False]:
            with self.subTest(explicit=explicit):
                packet, _, validation, ref, index = self.disposition_context()
                later = deepcopy(index[('review.json', 'review')][0])
                decision = later['ledger']['decisions'][0]
                decision.update(disposition='unresolved', rationale='No explicit apply or reject disposition has been recorded.')
                if explicit is None:
                    decision.pop('explicit_decision')
                else:
                    decision['explicit_decision'] = False
                index[('review.json', 'review')].append(later)
                dispositions, errors = explicit_dispositions(packet, validation, ref, index)
                self.assertFalse(errors)
                self.assertEqual(dispositions['f1']['disposition'], 'confirmed')
                self.assertFalse(dispositions['f1']['conflict'])

    def test_invalid_content_addressed_ledger_cannot_override_valid_prior_review(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            packet = {'packet_sha256': 'packet'}
            atomic_json(root / 'packet.json', packet)
            packet_ref = reference(root, 'packet.json')
            atomic_json(root / 'review.json', {'packet_ref': packet_ref})
            ref = reference(root, 'review.json')
            ledger = {'schema': amendments.SCHEMA, 'review_ref': ref, 'packet_ref': packet_ref,
                      'packet_sha256': 'packet', 'reviewer': 'Codex source review', 'review_note': 'Original source checked.',
                      'decisions': []}
            directory = root / amendments.DIRECTORY / 'dispositions'
            atomic_json(directory / (digest(canonical(ledger)) + '.json'), ledger)
            indexed, errors = load_dispositions(root)
            self.assertFalse(errors)
            self.assertEqual(len(indexed[(ref['path'], ref['sha256'])]), 1)
            ledger['review_note'] = 'Tampered later content'
            atomic_json(directory / 'invalid.json', ledger)
            indexed, errors = load_dispositions(root)
            self.assertEqual(len(errors), 1)
            self.assertTrue(any('issue' in item for item in indexed[(ref['path'], ref['sha256'])]))

    def test_changed_recommendation_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            atomic_json(root / 'packet.json', {'packet_sha256': 'packet'})
            packet_ref = reference(root, 'packet.json')
            atomic_json(root / 'review.json', {'packet_ref': packet_ref})
            atomic_json(root / 'recommendations.json', {'value': 'original'})
            ledger = {'schema': amendments.SCHEMA, 'review_ref': reference(root, 'review.json'),
                      'packet_ref': packet_ref, 'packet_sha256': 'packet', 'reviewer': 'Codex', 'review_note': 'Checked.',
                      'decisions': [{'source_review_ref': reference(root, 'recommendations.json')}]}
            path = root / amendments.DIRECTORY / 'dispositions' / (digest(canonical(ledger)) + '.json')
            atomic_json(path, ledger)
            atomic_json(root / 'recommendations.json', {'value': 'changed'})
            _, errors = load_dispositions(root)
            self.assertEqual(len(errors), 1)
            self.assertIn('no longer matches', errors[0]['reason'])

    def test_unicode_whitespace_quote_replay_resolves_only_an_unchanged_confirmation(self):
        packet, payload = fixture()
        item = contract_finding(packet)
        item['evidence'][0]['quote'] = 'Fifty\u00a0patients received nivolumab.'
        payload['findings'] = [item]
        validation = contract.validate(payload, packet)
        before = deepcopy((packet, validation))
        self.assertEqual(validation['held_findings'][0]['issue']['code'], 'foreign_or_nonliteral_source_quote')
        resolved = whitespace_confirmations(packet, validation)
        proof = resolved['f']['local_resolution']
        self.assertEqual(proof['repaired_evidence'][0]['quote'], 'Fifty patients received nivolumab.')
        self.assertEqual(proof['original_evidence'], item['evidence'])
        self.assertEqual(proof['accepted_value'], 50)
        audit = []
        self.assertEqual(review_rows(packet, validation, attempt_id='a1', dispositions=resolved, adjudicated_rows=audit), [])
        self.assertFalse(audit[0]['source_review']['local_resolution']['new_opus_result'])
        self.assertEqual((packet, validation), before)

    def test_quote_replay_never_normalizes_other_characters_or_nonconfirmation_actions(self):
        for mode in ['word', 'punctuation', 'numeric', 'correction', 'addition']:
            with self.subTest(mode=mode):
                packet, payload = fixture()
                item = contract_finding(packet)
                quote = 'Fifty\u00a0patients received nivolumab.'
                if mode == 'word': quote = quote.replace('patients', 'subjects')
                if mode == 'punctuation': quote = quote.replace('.', ';')
                if mode == 'numeric': quote = quote.replace('Fifty', '50')
                if mode in {'correction', 'addition'}: item['action'] = mode
                item['evidence'][0]['quote'] = quote
                payload['findings'] = [item]
                self.assertEqual(whitespace_confirmations(packet, contract.validate(payload, packet)), {})

    def test_quote_replay_still_requires_numeric_validation_and_exact_target_source(self):
        for mode in ['numeric_evidence_missing', 'foreign_target_source', 'value_changed']:
            with self.subTest(mode=mode):
                packet, payload = fixture()
                item = contract_finding(packet)
                item['evidence'][0]['quote'] = 'Fifty\u00a0patients received nivolumab.'
                if mode == 'numeric_evidence_missing':
                    item['evidence'][0]['quote'] = 'The median\u00a0overall survival could not be estimated.'
                elif mode == 'foreign_target_source':
                    packet['targets'][0]['source_span_ids'] = []
                    rebind(packet, payload)
                else:
                    item['value_json'] = '49'
                payload['findings'] = [item]
                self.assertEqual(whitespace_confirmations(packet, contract.validate(payload, packet)), {})


if __name__ == '__main__':
    unittest.main()
