from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from metamelanoma import complementary_amendments as a, complementary_contract as c, quantitative as q
from metamelanoma.io import atomic_json, canonical, digest, reference
from metamelanoma.screening import catalog_for
from test_quantitative import fixture, count, effect
from test_complementary_contract import finding


class ComplementaryAmendmentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(); self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.source, raw, self.evidence = fixture('The randomized CheckMate 001 trial (NCT12345678) '
            'treated melanoma patients. Fifty patients received nivolumab and forty patients received ipilimumab. '
            'The overall survival HR was 0.70 (95% CI 0.50-0.98). The adjusted HR was 0.80 (95% CI 0.60-0.99).')
        raw['sample_sizes'] = [count('n', 'NA', 'a', self.evidence, count_purpose='treated')]
        raw['effects'] = [effect(self.evidence, p_value='NA', p_test='NA', p_sidedness='NA')]
        validated = q.validate(raw, self.source)
        self.assertTrue(validated['valid'], validated)
        self.record = validated['record']
        self.source_ref = self.save('source.json', self.source)
        self.artifact_ref = self.save('raw-gpt.json', {'pmid': '123', 'stage': 'R2', 'task_id': 'gpt-r2',
            'source_ref': self.source_ref, 'validated': validated})
        catalog = catalog_for(self.source)
        target = {'stage': 'R2', 'record_id': 'R2:gpt-r2', 'task_id': 'gpt-r2',
                  'source_sha256': self.record['source_sha256'], 'record_sha256': self.sha(self.record),
                  'source_ref': self.source_ref, 'artifact_ref': self.artifact_ref, 'record': self.record,
                  'source_span_ids': [s['span_id'] for s in catalog['spans']]}
        self.packet = {'source': self.source, 'source_sha256': self.sha(self.source), 'source_catalog': catalog,
                       'targets': [target], 'source_documents': [{'stage': 'R2', 'source_sha256': self.sha(self.source),
                           'span_ids': target['source_span_ids']}], 'context': {}}
        self.packet['packet_sha256'] = self.sha(self.packet)
        self.proposal = finding(self.packet, action='addition', expected='NA', value=50)

    @staticmethod
    def sha(value):
        return digest(canonical(value))

    def save(self, path, value):
        atomic_json(self.root / path, value)
        return reference(self.root, path)

    def review(self, findings=None):
        packet_ref = self.save('packet.json', self.packet)
        payload = {'schema_id': c.SCHEMA_ID, 'pmid': '123', 'report_id': self.source['report_id'],
                   'source_sha256': self.packet['source_sha256'], 'packet_sha256': self.packet['packet_sha256'],
                   'review_mode': 'complementary', 'coverage': [{'domain': d, 'status': 'reviewed', 'reason': ''} for d in c.DOMAINS],
                   'findings': findings if findings is not None else [self.proposal]}
        validation = c.validate(payload, self.packet)
        self.assertTrue(validation['valid'], validation)
        return self.save('review.json', {'pmid': '123', 'state': 'completed_with_holds' if validation['held_findings'] else 'completed',
                                        'packet_ref': packet_ref, 'validation': validation})

    def decision(self, proposal=None, disposition='apply'):
        proposal = proposal or self.proposal
        span = self.packet['source_catalog']['spans'][-1]
        return {'finding_id': proposal['id'], 'disposition': disposition,
                'rationale': 'The original Results explicitly reports this count for the nivolumab arm.',
                'semantic_review': {'source_checked': True, 'scope_checked': True,
                    'scope_note': 'Same treated melanoma population, arm, count purpose and report; no new scope.',
                    'evidence': [{'span_id': span['span_id'], 'quote': span['text']}],
                    'reviewed_fields': a.required_review_fields(proposal, self.record)}}

    def decisions(self, decisions=None, findings=None):
        review_ref = self.review(findings)
        return a.record_decisions(self.root, review_ref, [self.decision()] if decisions is None else decisions,
                                  reviewer='Codex source review', review_note='Explicit adjudication of the original passage.')

    def test_verified_addition_materializes_without_changing_originals_or_served_files(self):
        ref = self.decisions()
        before = {str(p): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        result = a.materialize(self.root, ref)
        self.assertEqual(result['blocked'], [])
        self.assertEqual(len(result['effective_records']), 1)
        effective = result['effective_records'][0]
        self.assertEqual(effective['record']['sample_sizes'][0]['n'], 50)
        self.assertEqual(effective['original_record'], self.record)
        self.assertEqual(self.record['sample_sizes'][0]['n'], 'NA')
        self.assertEqual(effective['record']['source_sha256'], self.record['source_sha256'])
        self.assertNotEqual(effective['effective_review_binding_sha256'], effective['base_review_binding_sha256'])
        self.assertEqual(effective['amended_fields'][0]['source_evidence'], self.proposal['evidence'])
        self.assertFalse(result['served_data_changed']); self.assertFalse(result['published'])
        self.assertEqual(before, {str(p):p.read_bytes() for p in self.root.rglob('*') if p.is_file()})
        self.assertEqual(result, a.materialize(self.root, ref))

    def test_no_automatic_apply_and_rejections_stay_in_ledger(self):
        ref = self.decisions([])
        result = a.materialize(self.root, ref)
        self.assertEqual(result['effective_records'], [])
        self.assertEqual(result['ledger'][0]['disposition'], 'unresolved')
        self.assertFalse(result['ledger'][0]['explicit_decision'])
        ref = self.decisions([self.decision(disposition='reject')])
        self.assertEqual(a.materialize(self.root, ref)['ledger'][0]['materialization_status'], 'reject')
        self.assertTrue(a.materialize(self.root, ref)['ledger'][0]['explicit_decision'])

    def test_apply_requires_explicit_semantic_original_source_review(self):
        for key in ['source_checked', 'scope_checked', 'scope_note', 'evidence']:
            decision = self.decision(); decision['semantic_review'].pop(key)
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.decisions([decision])
        decision = self.decision(); decision['semantic_review']['evidence'][0]['quote'] = 'Not present in the source'
        with self.assertRaisesRegex(ValueError, 'evidence'):
            self.decisions([decision])

    def test_dependent_numeric_and_interval_fields_require_joint_review(self):
        decision = self.decision(); decision['semantic_review']['reviewed_fields'] = ['/sample_sizes/0/n']
        with self.assertRaisesRegex(ValueError, 'Dependent fields'):
            self.decisions([decision])
        proposal = finding(self.packet, action='correction', section='effects', row='hr',
                           path='/effects/0/ci_lower', expected=.5, value=.6)
        required = a.required_review_fields(proposal, self.record)
        self.assertTrue({'/effects/0/estimate', '/effects/0/ci_lower', '/effects/0/ci_upper', '/effects/0/ci_level'} <= set(required))

    def test_overlapping_amendments_are_blocked_as_one_target(self):
        second = {**deepcopy(self.proposal), 'id': 'f2'}
        ref = self.decisions([self.decision(), self.decision(second)], [self.proposal, second])
        result = a.materialize(self.root, ref)
        self.assertEqual(result['effective_records'], [])
        self.assertIn('Overlapping', result['blocked'][0]['reason'])

    def test_exact_source_or_target_mutation_blocks_materialization(self):
        ref = self.decisions(); (self.root / self.source_ref['path']).write_text('{}')
        result = a.materialize(self.root, ref)
        self.assertEqual(result['effective_records'], [])
        self.assertIn('reference', result['blocked'][0]['reason'])

    def test_unrelated_prior_flags_are_preserved_not_erased_by_schema_stripping(self):
        original_flag = {'section': 'effects', 'id': 'hr', 'field': 'analysis_n', 'code': 'prior_unresolved_scope'}
        self.record['field_flags'].append(original_flag)
        self.packet['targets'][0]['record_sha256'] = self.sha(self.record)
        self.artifact_ref = self.save('raw-gpt.json', {'pmid': '123', 'stage': 'R2', 'task_id': 'gpt-r2',
            'source_ref': self.source_ref, 'validated': {'valid': True, 'record': self.record}})
        self.packet['targets'][0]['artifact_ref'] = self.artifact_ref
        self.packet['packet_sha256'] = self.sha({k:v for k,v in self.packet.items() if k != 'packet_sha256'})
        result = a.materialize(self.root, self.decisions())
        effective = result['effective_records'][0]
        self.assertIn(original_flag, effective['record']['field_flags'])
        self.assertIn(original_flag, effective['inherited_unresolved_flags'])
        self.assertIn(original_flag, effective['record']['effects'][0]['field_flags'])
        self.assertIn(original_flag, effective['effective_validation']['issues'])
        self.assertEqual(effective['effective_validation']['record'], effective['record'])

    def test_unrelated_baseline_numeric_mask_is_diagnostic_and_original_value_survives(self):
        # A previously accepted value now fails a stricter literal replay. It is
        # unrelated to the explicitly reviewed sample-size addition.
        self.record['binary'] = [{'id': 'old-response', 'population_id': 'pop',
            'endpoint_definition': 'objective response', 'cutoff': 'NA', 'origin': 'own_report',
            'evidence': self.evidence, 'arm_id': 'a', 'endpoint': 'ORR',
            'numerator': 13, 'denominator': 'NA', 'percentage': 'NA',
            'ci_lower': 'NA', 'ci_upper': 'NA', 'ci_level': 'NA',
            'assessment_time': 'NA', 'time_unit': 'NA', 'response_criteria': 'NA', 'safety_attribution': 'NA'}]
        self.packet['targets'][0]['record_sha256'] = self.sha(self.record)
        self.artifact_ref = self.save('raw-gpt.json', {'pmid': '123', 'stage': 'R2', 'task_id': 'gpt-r2',
            'source_ref': self.source_ref, 'validated': {'valid': True, 'record': self.record}})
        self.packet['targets'][0]['artifact_ref'] = self.artifact_ref
        self.packet['packet_sha256'] = self.sha({k:v for k,v in self.packet.items() if k != 'packet_sha256'})
        result = a.materialize(self.root, self.decisions())
        self.assertEqual(result['blocked'], [])
        effective = result['effective_records'][0]
        self.assertEqual(effective['record']['sample_sizes'][0]['n'], 50)
        self.assertEqual(effective['record']['binary'][0]['numerator'], 13)
        self.assertEqual(effective['original_record'], self.record)
        self.assertIn('/binary/0/numerator', effective['replay_diagnostics']['baseline_clinical_differences'])
        self.assertIn('/binary/0/numerator', effective['replay_diagnostics']['unrelated_replay_differences'])
        self.assertEqual(effective['quantitative_validation']['record']['binary'][0]['numerator'], 'NA')
        self.assertEqual(effective['effective_validation']['record']['binary'][0]['numerator'], 13)

    def test_cross_source_finding_cannot_be_marked_apply(self):
        self.packet['targets'][0]['source_span_ids'] = []
        self.packet['packet_sha256'] = self.sha({k:v for k,v in self.packet.items() if k != 'packet_sha256'})
        with self.assertRaisesRegex(ValueError, 'Cross-source'):
            self.decisions()

    def test_source_numeric_match_is_insufficient_if_quantitative_link_validation_fails(self):
        bad_row = deepcopy(self.record['sample_sizes'][0]); bad_row.update(id='n2', n=50, arm_id='foreign')
        proposal = finding(self.packet, ident='new', action='addition', section='sample_sizes', row='n2',
                           path='/sample_sizes/-', expected=None, value=a.schema_record({**self.record,'sample_sizes':[bad_row]})['sample_sizes'][0], relation='new_scope')
        ref = self.decisions([self.decision(proposal)], [proposal])
        result = a.materialize(self.root, ref)
        self.assertEqual(result['effective_records'], [])
        self.assertTrue(result['blocked'])
        self.assertIn('validation', result['blocked'][0]['reason'].lower())


if __name__ == '__main__':
    unittest.main()
