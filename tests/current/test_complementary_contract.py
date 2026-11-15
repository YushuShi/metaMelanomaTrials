import copy
import json
import unittest

from metamelanoma import complementary_contract as c, quantitative as q, schema
from metamelanoma.screening import build_source, catalog_for


def fixture():
    source = build_source({'report_id': 'pmid:123', 'pmid': '123', 'title': 'Melanoma trial',
        'abstract': 'Fifty patients received nivolumab. The overall survival hazard ratio was 0.70 '
            '(95% CI 0.50–0.98). Median progression-free survival was 1.38 months '
            '(95% CI 1.02–1.97). The median overall survival could not be estimated. '
            'Twenty-five patients responded. P<0.05 by logrank test.'})
    catalog = catalog_for(source)
    evidence = [catalog['spans'][-1]['span_id']]
    record = q.empty_record(source)
    record['populations'] = [{'id': 'p', 'scope': 'overall', 'label': 'Melanoma patients',
        'parent_id': 'NA', 'melanoma_only': 'yes', 'cutoff': 'NA', 'evidence': evidence}]
    record['sample_sizes'] = [{'id': 'n', 'population_id': 'p', 'arm_id': 'NA', 'result_id': 'NA',
        'count_purpose': 'treated', 'n': 50, 'cutoff': 'NA', 'method': 'reported',
        'component_ids': [], 'disjoint': 'NA', 'complete': 'yes', 'evidence': evidence}]
    record['effects'] = [{'id': 'hr', 'population_id': 'p', 'endpoint_definition': 'overall survival',
        'cutoff': 'NA', 'origin': 'own_report', 'evidence': evidence, 'intervention_arm_id': 'a',
        'reference_arm_id': 'b', 'endpoint': 'OS', 'measure': 'HR', 'estimate': .7,
        'ci_lower': .5, 'ci_upper': .98, 'ci_level': 95, 'analysis_n': 'NA',
        'adjusted': 'NA', 'model': 'NA', 'p_value': 'NA', 'p_test': 'NA', 'p_sidedness': 'NA'}]
    target = {'stage': 'R2', 'record_id': 'R2:123', 'source_sha256': record['source_sha256'],
        'record': record, 'source_span_ids': evidence, 'review_origin': 'accepted GPT quantitative extraction'}
    packet = {'source': source, 'source_sha256': schema.digest(source), 'source_catalog': catalog,
        'targets': [target], 'source_documents': [{'stage': 'R2', 'source_sha256': schema.digest(source),
            'span_ids': [s['span_id'] for s in catalog['spans']]}], 'context': {'source_corrections': []}}
    packet['packet_sha256'] = schema.digest(packet)
    payload = {'schema_id': c.SCHEMA_ID, 'pmid': '123', 'report_id': 'pmid:123',
        'source_sha256': packet['source_sha256'], 'packet_sha256': packet['packet_sha256'],
        'review_mode': 'complementary', 'coverage': [{'domain': d, 'status': 'reviewed', 'reason': ''}
            for d in c.DOMAINS], 'findings': []}
    return packet, payload


def finding(packet, *, ident='f', action='confirmed', section='sample_sizes', row='n',
            path='/sample_sizes/0/n', expected=50, value=50, relation='same'):
    target = packet['targets'][0]
    span = packet['source_catalog']['spans'][-1]
    return {'id': ident, 'action': action, 'domain': 'sample_sizes',
        'target': {'stage': target['stage'], 'record_id': target['record_id'],
            'source_sha256': target['source_sha256'], 'section': section, 'row_id': row, 'field_path': path},
        'scope_relation': relation, 'expected_value_json': json.dumps(expected),
        'value_json': json.dumps(value), 'reason': 'Current source supports this scoped patient count.',
        'evidence': [{'span_id': span['span_id'], 'quote': span['text']}]}


def rebind(packet, payload):
    packet['source_sha256'] = schema.digest(packet['source'])
    packet['packet_sha256'] = schema.digest({k: v for k, v in packet.items() if k != 'packet_sha256'})
    payload['source_sha256'] = packet['source_sha256']
    payload['packet_sha256'] = packet['packet_sha256']


class ComplementaryContractTests(unittest.TestCase):
    def test_request_is_complementary_sparse_and_uses_original_sources_and_existing_row_contract(self):
        packet, _ = fixture()
        before = copy.deepcopy(packet)
        request = c.build_request(packet)
        self.assertIn('NOT a blinded independent extraction', request['instructions'])
        self.assertIn('Finding no material change is a successful review', request['instructions'])
        context = json.loads(request['input'])
        self.assertEqual(context['quantitative_row_contract']['$defs'], q.DEFS)
        self.assertEqual(context['accepted_targets'][0]['record'], packet['targets'][0]['record'])
        self.assertNotIn('source_span_ids', context['accepted_targets'][0])
        evidence_schema = request['schema']['properties']['findings']['items']['properties']['evidence']['items']['properties']
        self.assertEqual(evidence_schema['span_id'], {'type': 'string'})
        self.assertEqual(context['original_source_spans'][-1]['text'], packet['source']['blocks'][-1]['text'])
        self.assertEqual(request['schema']['properties']['packet_sha256']['enum'], [packet['packet_sha256']])
        self.assertEqual(packet, before)
        with self.assertRaises(ValueError):
            c.build_request(packet, max_output_tokens=0)

    def test_no_material_change_is_valid_without_manufactured_findings(self):
        packet, payload = fixture()
        result = c.validate(payload, packet)
        self.assertTrue(result['valid'])
        self.assertEqual(result['accepted_findings'], [])
        self.assertFalse(result['accepted_records_mutated'])

    def test_written_counts_are_normalized_and_confirmed_without_mutation(self):
        packet, payload = fixture()
        payload['findings'] = [finding(packet, value='Fifty')]
        before = copy.deepcopy((packet, payload))
        result = c.validate(payload, packet)
        self.assertEqual(result['held_findings'], [])
        confirmed = result['accepted_findings'][0]
        self.assertEqual(confirmed['value'], 50)
        self.assertEqual(confirmed['action'], 'confirmed')
        self.assertEqual(confirmed['target_granularity'], 'field')
        self.assertEqual(confirmed['validation_level'], 'source_bound_proposal')
        self.assertEqual((packet, payload), before)

    def test_numeric_na_variants_harmonize_without_conflict(self):
        packet, payload = fixture()
        payload['findings'] = [finding(packet, section='effects', row='hr', path='/effects/0/analysis_n',
            expected='NA', value='cannot be estimated', action='confirmed')]
        result = c.validate(payload, packet)
        self.assertEqual(result['accepted_findings'][0]['value'], 'NA')
        self.assertEqual(result['issues'], [])

    def test_source_bound_addition_is_only_a_proposal_for_existing_validator(self):
        packet, payload = fixture()
        payload['findings'] = [finding(packet, action='addition', section='effects', row='hr',
            path='/effects/0/analysis_n', expected='NA', value='Fifty')]
        result = c.validate(payload, packet)
        proposal = result['accepted_findings'][0]
        self.assertTrue(proposal['same_source_amendment_eligible'])
        self.assertTrue(proposal['requires_quantitative_validation'])
        self.assertTrue(proposal['requires_semantic_source_review'])
        self.assertEqual(packet['targets'][0]['record']['effects'][0]['analysis_n'], 'NA')

    def test_composite_fulltext_proof_cannot_automatically_amend_abstract_target(self):
        packet, payload = fixture()
        packet['targets'][0]['source_span_ids'] = []
        rebind(packet, payload)
        payload['findings'] = [finding(packet, action='addition', section='effects', row='hr',
            path='/effects/0/analysis_n', expected='NA', value=50)]
        result = c.validate(payload, packet)
        self.assertEqual(len(result['accepted_findings']), 1)
        self.assertFalse(result['accepted_findings'][0]['same_source_amendment_eligible'])

    def test_exact_target_identity_path_and_expected_value_are_mandatory(self):
        for change in [dict(row_id='foreign'), dict(field_path='/effects/0/estimate'),
                       dict(source_sha256='stale'), dict(stage='R3')]:
            packet, payload = fixture()
            item = finding(packet)
            item['target'].update(change)
            payload['findings'] = [item]
            self.assertEqual(len(c.validate(payload, packet)['held_findings']), 1, change)
        packet, payload = fixture()
        payload['findings'] = [finding(packet, expected=49)]
        self.assertIn('stale_expected_value', c.validate(payload, packet)['issues'][0]['code'])

    def test_each_bad_field_is_held_without_discarding_a_supported_confirmation(self):
        packet, payload = fixture()
        payload['findings'] = [finding(packet), finding(packet, ident='bad', action='correction', value=99999)]
        result = c.validate(payload, packet)
        self.assertTrue(result['valid'])
        self.assertEqual([r['id'] for r in result['accepted_findings']], ['f'])
        self.assertEqual([r['finding']['id'] for r in result['held_findings']], ['bad'])

    def test_quotes_must_be_literal_current_original_source(self):
        for mode in ['foreign', 'paraphrase', 'empty', 'bibliography', 'planned']:
            packet, payload = fixture()
            item = finding(packet)
            if mode == 'foreign':
                item['evidence'][0]['span_id'] = 'old-gpt-span'
            elif mode == 'paraphrase':
                item['evidence'][0]['quote'] = 'A paraphrase of the study.'
            elif mode == 'empty':
                item['evidence'] = []
            else:
                packet['source']['blocks'][-1]['document_role'] = 'bibliography' if mode == 'bibliography' else 'main_article'
                packet['source']['blocks'][-1]['planned_only'] = mode == 'planned'
                rebind(packet, payload)
            payload['findings'] = [item]
            result = c.validate(payload, packet)
            self.assertTrue(result['global_errors'] or result['held_findings'], mode)

    def test_packet_and_catalogue_hashes_are_checked(self):
        packet, payload = fixture()
        packet['targets'][0]['record']['sample_sizes'][0]['n'] = 99
        self.assertFalse(c.validate(payload, packet)['valid'])
        packet, payload = fixture()
        packet['source_catalog']['spans'][-1]['text'] = 'Forged literal source'
        rebind(packet, payload)
        self.assertIn('catalogue_source_binding_failed', c.validate(payload, packet)['global_errors'])

    def test_scope_differences_are_never_same_field_corrections(self):
        packet, payload = fixture()
        payload['findings'] = [finding(packet, action='correction', value=25, relation='new_scope')]
        result = c.validate(payload, packet)
        self.assertEqual(result['issues'][0]['code'], 'correction_requires_same_scope')

    def test_new_complete_count_row_uses_existing_quantitative_schema(self):
        packet, payload = fixture()
        value = copy.deepcopy(packet['targets'][0]['record']['sample_sizes'][0])
        value.update(id='additional', n='Twenty-five', count_purpose='response_evaluable')
        payload['findings'] = [finding(packet, action='addition', path='/sample_sizes/-', row='additional',
            expected=None, value=value, relation='new_scope')]
        result = c.validate(payload, packet)
        self.assertEqual(result['issues'], [])
        self.assertEqual(result['accepted_findings'][0]['value']['n'], 25)
        self.assertEqual(result['accepted_findings'][0]['target_granularity'], 'record')
        self.assertEqual(len(packet['targets'][0]['record']['sample_sizes']), 1)
        payload['findings'][0]['value_json'] = json.dumps({**value, 'invented_field': 'x'})
        self.assertEqual(len(c.validate(payload, packet)['held_findings']), 1)

    def test_no_inequality_or_count_arithmetic_is_silently_converted(self):
        packet, payload = fixture()
        payload['findings'] = [finding(packet, action='addition', section='effects', row='hr',
            path='/effects/0/p_value', expected='NA', value='<0.05')]
        self.assertEqual(c.validate(payload, packet)['issues'][0]['code'], 'inequality_is_not_an_exact_numeric_value')
        payload['findings'][0]['value_json'] = '0.05'
        self.assertEqual(len(c.validate(payload, packet)['held_findings']), 1, 'an inequality source does not support an exact p')
        payload['findings'] = [finding(packet, action='correction', value='25 + 25')]
        self.assertEqual(len(c.validate(payload, packet)['held_findings']), 1)

    def test_integer_ci_bound_can_gain_source_precision_but_patient_counts_cannot(self):
        packet, payload = fixture()
        record = packet['targets'][0]['record']
        record['survival'] = [{'id': 'median', 'population_id': 'p', 'endpoint_definition': 'progression-free survival',
            'cutoff': 'NA', 'origin': 'own_report', 'evidence': record['effects'][0]['evidence'], 'arm_id': 'NA',
            'endpoint': 'PFS', 'kind': 'median', 'estimate': 1.4, 'ci_lower': 1, 'ci_upper': 2, 'ci_level': 95,
            'unit': 'months', 'median_status': 'reached', 'time': 'NA', 'time_unit': 'NA', 'analysis_n': 'NA'}]
        rebind(packet, payload)
        item = finding(packet, action='correction', section='survival', row='median',
            path='/survival/0/ci_lower', expected=1, value=1.02)
        item['evidence'][0]['quote'] = 'Median progression-free survival was 1.38 months (95% CI 1.02–1.97).'
        payload['findings'] = [item]
        result = c.validate(payload, packet)
        self.assertEqual(result['issues'], [])
        proposal = result['accepted_findings'][0]
        self.assertEqual(proposal['value'], 1.02)
        self.assertEqual(proposal['action'], 'correction', 'precision refinement remains a supported proposal, not an overwrite')
        self.assertTrue(proposal['normalizations'][0]['not_a_substantive_discrepancy'])
        self.assertEqual(record['survival'][0]['ci_lower'], 1)
        payload['findings'] = [finding(packet, action='correction', value=50.02)]
        self.assertEqual(c.validate(payload, packet)['issues'][0]['code'], 'patient_count_requires_nonnegative_integer')

    def test_global_envelope_coverage_and_json_integrity(self):
        packet, payload = fixture()
        payload['coverage'].pop()
        self.assertFalse(c.validate(payload, packet)['valid'])
        packet, payload = fixture()
        payload['review_mode'] = 'blinded'
        self.assertFalse(c.validate(payload, packet)['valid'])
        self.assertFalse(c.validate('{"pmid":"123","pmid":"999"}', packet)['valid'])


if __name__ == '__main__':
    unittest.main()
