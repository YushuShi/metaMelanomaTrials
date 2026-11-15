"""Structured source semantics and exact historical replay; no external IO/calls."""
from copy import deepcopy
from pathlib import Path
import types
import unittest

from metamelanoma import schema, screening, validation
from test_scientific_contract import fixture as historical_fixture, number


def node(ident, name=None, kind='drug', children=(), **kwargs):
    return {'node_id': ident, 'kind': kind, 'name': name, 'drug_class': None,
            'children': list(children), 'dose': None, 'route': None, 'schedule': None,
            'evidence_ids': ['e'], **kwargs}


def fixture(text=None):
    source, _, payload = historical_fixture()
    source = screening.build_source({'report_id': 'r', 'pmid': '1', 'title': 'Melanoma treatment',
        'abstract': text or ('Twenty-five patients with melanoma were treated. '
        'Arm A received nivolumab and ipilimumab. Arm B received nivolumab or pembrolizumab. '
        'The overall-survival hazard ratio for Arm A versus Arm B was 0.7 (95% CI 0.5-0.9). '
        'Arm A had 10 patients with a response. Arm B had 8 patients with a response.')})
    catalog = screening.catalog_for(source)
    payload['source_sha256'] = schema.digest(source)
    payload['evidence'][0]['span_id'] = next(s['span_id'] for s in catalog['spans'] if 'Twenty-five' in s['text'])
    for ident, label, kind in [('A', 'Arm A', 'arm'), ('B', 'Arm B', 'arm'), ('OS', 'Overall survival', 'endpoint')]:
        payload['entities'].append({'entity_id': ident, 'kind': kind, 'label': label,
            'population_scope': 'not_applicable', 'parent_id': None, 'evidence_ids': ['e']})
    payload['arm_regimens'] = [
        {'arm_id': 'A', 'label': 'Arm A', 'root_node_id': 'A-root', 'nodes': [
            node('A-root', kind='AND', children=['A-nivo', 'A-ipi']),
            node('A-nivo', 'nivolumab'), node('A-ipi', 'ipilimumab')], 'evidence_ids': ['e']},
        {'arm_id': 'B', 'label': 'Arm B', 'root_node_id': 'B-root', 'nodes': [
            node('B-root', kind='OR', children=['B-nivo', 'B-pembro']),
            node('B-nivo', 'nivolumab'), node('B-pembro', 'pembrolizumab')], 'evidence_ids': ['e']}]
    payload['contrast_definitions'] = [{'contrast_id': 'C', 'contrast_type': 'treatment_comparison',
        'experimental_arm_id': 'A', 'reference_arm_id': 'B', 'single_arm_id': None,
        'population_id': 'pop', 'endpoint_id': None, 'cutoff_id': None, 'evidence_ids': ['e']}]
    payload['facts'][0]['contrast_id'] = None
    effect = deepcopy(payload['facts'][0]); effect.update(fact_id='HR', domain='efficacy_outcomes',
        field='overall_survival_HR', text='Overall-survival hazard ratio', measure='HR',
        clinical_endpoint_family='overall_survival', endpoint_id='OS', contrast_type='treatment_comparison',
        experimental_arm_id='A', comparator_arm_id='B', contrast_id='C', count_context='not_applicable',
        link_gaps=['model'], numbers=[number(.7, '0.7', 'estimate', 'ratio'),
            number(.5, '0.5', 'ci_lower', 'ratio'), number(.9, '0.9', 'ci_upper', 'ratio'),
            number(95, '95%', 'confidence_level', 'percent')])
    descriptive = deepcopy(effect); descriptive.update(fact_id='RA', field='response_count', measure='participant_count',
        clinical_endpoint_family='response', contrast_type='single_arm', arm_id='A',
        numbers=[number(10, '10', 'numerator', 'patients')])
    payload['facts'].extend([effect, descriptive])
    return source, catalog, payload


def review(source, catalog, payload):
    return validation.validate(payload, source,
        request_schema=schema.report_schema(catalog, source=source, structured=True))


class RegimenContractTests(unittest.TestCase):
    def test_current_requests_require_structured_fields_and_exact_owned_spans(self):
        source, catalog, payload = fixture()
        body = screening.request_body(source)
        contract = body['text']['format']['schema']
        self.assertIn('arm_regimens', contract['required'])
        self.assertIn('contrast_id', contract['$defs']['fact']['required'])
        self.assertEqual(contract['$defs']['evidence']['properties']['span_id']['enum'], [s['span_id'] for s in catalog['spans']])
        schema.check(payload, contract)
        self.assertIn('OR is alternative treatments', body['instructions'])

    def test_old_schema_hashes_and_recorded_bodies_reconstruct_exactly(self):
        self.assertEqual(schema.digest(schema.report_schema()), '3e748b153ca238f9b328746ed08caf0f38ec66b1c477cf643944ffe2b648cfc2')
        self.assertEqual(schema.digest(schema.INITIAL_NATIVE_SCHEMA), '7d6d134fed707e902b4ced855ca5e7b651685dbffbd0a0833974b93085989fa4')
        source, catalog, _ = historical_fixture()
        for initial in (False, True):
            for bound in (False, True):
                contract = schema.report_schema(catalog if bound else None, source=source if bound else None, initial=initial)
                self.assertEqual(schema.native_schema(contract, catalog=catalog, source=source), contract)
                body = screening.request_body(source, recorded_schema=contract, recorded_instructions=screening.PRE_REGIMEN_PROMPT)
                self.assertEqual(body['text']['format']['schema'], contract)
                self.assertEqual(body['instructions'], screening.PRE_REGIMEN_PROMPT)

    def test_legacy_validator_output_exact_and_old_holds_not_released(self):
        old = types.ModuleType('metamelanoma._pre_regimen_validation'); old.__package__ = 'metamelanoma'
        root = Path(__file__).resolve().parents[2]
        path = root/'archive/producer_snapshots/a03d323ad35ed97a948649fcb673e70438dce0ccc847cc8f4f8d35b8578f52c3/src/metamelanoma/validation.py'
        exec(compile(path.read_text(), str(path), 'exec'), old.__dict__)
        source, catalog, payload = historical_fixture()
        for bad in (False, True):
            p = deepcopy(payload)
            if bad: p['facts'][0]['numbers'][0]['value'] = 999
            before = deepcopy(p)
            expected = old.validate(p, source, catalog, request_schema=schema.PRE_REGIMEN_SCHEMA)
            actual = validation.validate(p, source, catalog, request_schema=schema.PRE_REGIMEN_SCHEMA)
            self.assertEqual(actual, expected)
            self.assertNotIn('validated_arm_regimens', actual)
            self.assertEqual(p, before)
            if bad: self.assertEqual(actual['counts']['held_facts'], 1)

    def test_AND_and_OR_source_definitions_and_descriptive_common_contrast(self):
        source, catalog, payload = fixture(); before = deepcopy(payload)
        result = review(source, catalog, payload)
        self.assertEqual(result['global_errors'], [])
        self.assertEqual(len(result['validated_arm_regimens']), 2)
        self.assertEqual(len(result['validated_contrast_definitions']), 1)
        self.assertEqual(result['counts'], {'source_checked_facts': 3, 'held_facts': 0})
        self.assertEqual(payload, before)

    def test_swapped_fact_direction_and_self_pair_hold_only_dependencies(self):
        for case in ('swap_fact', 'swap_definition', 'self_pair'):
            source, catalog, payload = fixture()
            if case == 'swap_fact': payload['facts'][1].update(experimental_arm_id='B', comparator_arm_id='A')
            elif case == 'swap_definition': payload['contrast_definitions'][0].update(experimental_arm_id='B', reference_arm_id='A')
            else: payload['contrast_definitions'][0]['reference_arm_id'] = 'A'
            result = review(source, catalog, payload)
            self.assertIn('f', [f['fact_id'] for f in result['validated_facts']])
            self.assertNotIn('HR', [f['fact_id'] for f in result['validated_facts']])

    def test_other_label_cannot_bypass_an_asserted_reference_relationship(self):
        source, catalog, payload = fixture()
        payload['facts'][1].update(contrast_type='other', contrast_id=None)
        result = review(source, catalog, payload)
        self.assertNotIn('HR', [f['fact_id'] for f in result['validated_facts']])
        self.assertIn('f', [f['fact_id'] for f in result['validated_facts']])

    def test_component_label_operator_and_class_need_their_own_source_meaning(self):
        for case in ('wrong_name', 'OR_to_AND', 'guessed_class'):
            source, catalog, payload = fixture()
            if case == 'wrong_name': payload['arm_regimens'][0]['nodes'][1]['name'] = 'invented drug'
            elif case == 'OR_to_AND': payload['arm_regimens'][1]['nodes'][0]['kind'] = 'AND'
            else: payload['arm_regimens'][0]['nodes'][1]['drug_class'] = 'PD-1 inhibitor'
            result = review(source, catalog, payload)
            self.assertTrue(any(r['status'] == 'held' for r in result['arm_regimen_results']))
            self.assertIn('f', [f['fact_id'] for f in result['validated_facts']])

    def test_concurrency_cannot_borrow_sequence_history_negation_or_unlabelled_clauses(self):
        replacement = [
            'Arm A received nivolumab followed by ipilimumab.',
            'Arm A received nivolumab. Ipilimumab was used only as prior therapy in an unrelated historical cohort.',
            'Arm A did not receive nivolumab and ipilimumab; Arm A received nivolumab alone.',
            'Arm A received nivolumab. Ipilimumab was administered with chemotherapy.',
            'Arm A received nivolumab and prior ipilimumab.',
        ]
        for actual in replacement:
            with self.subTest(actual=actual):
                source, _, _ = fixture()
                source, catalog, payload = fixture(source['blocks'][1]['text'].replace('Arm A received nivolumab and ipilimumab.', actual))
                result = review(source, catalog, payload)
                self.assertEqual(result['arm_regimen_results'][0]['status'], 'held')
                self.assertNotIn('HR', [f['fact_id'] for f in result['validated_facts']])
                self.assertNotIn('RA', [f['fact_id'] for f in result['validated_facts']])
                self.assertIn('f', [f['fact_id'] for f in result['validated_facts']])
        source, _, _ = fixture()
        source, catalog, payload = fixture(source['blocks'][1]['text'].replace('Arm A received nivolumab and ipilimumab.', replacement[0]))
        payload['arm_regimens'][0]['nodes'][0]['kind'] = 'SEQUENTIAL'
        self.assertEqual(review(source, catalog, payload)['arm_regimen_results'][0]['status'], 'source_checked')
        payload['arm_regimens'][0]['nodes'][0]['children'].reverse()
        self.assertEqual(review(source, catalog, payload)['arm_regimen_results'][0]['status'], 'held')

    def test_subgroup_cannot_borrow_overall_contrast_population(self):
        source, catalog, payload = fixture()
        payload['entities'].append({'entity_id': 'subgroup', 'kind': 'population', 'label': 'melanoma',
            'population_scope': 'melanoma', 'parent_id': None, 'evidence_ids': ['e']})
        payload['facts'][1]['result_population_id'] = 'subgroup'
        result = review(source, catalog, payload)
        self.assertNotIn('HR', [f['fact_id'] for f in result['validated_facts']])
        self.assertIn('RA', [f['fact_id'] for f in result['validated_facts']])

    def test_global_node_collisions_cycles_and_orphans_are_local_holds(self):
        for case in ('duplicate', 'cycle', 'orphan'):
            source, catalog, payload = fixture()
            if case == 'duplicate': payload['arm_regimens'][1]['nodes'][1]['node_id'] = 'A-nivo'
            elif case == 'cycle': payload['arm_regimens'][0]['nodes'][0]['children'][0] = 'A-root'
            else: payload['arm_regimens'][0]['nodes'].append(node('unused', 'nivolumab'))
            result = review(source, catalog, payload)
            self.assertTrue(any(r['status'] == 'held' for r in result['arm_regimen_results']))
            self.assertIn('f', [f['fact_id'] for f in result['validated_facts']])

    def test_reference_arm_descriptive_outcome_does_not_reverse_common_pair(self):
        source, catalog, payload = fixture()
        payload['facts'][2].update(arm_id='B', numbers=[number(8, '8', 'numerator', 'patients')])
        result = review(source, catalog, payload)
        self.assertIn('RA', [f['fact_id'] for f in result['validated_facts']])
        payload['facts'][2]['numbers'] = [number(10, '10', 'numerator', 'patients')]
        result = review(source, catalog, payload)
        self.assertNotIn('RA', [f['fact_id'] for f in result['validated_facts']])
        self.assertIn('HR', [f['fact_id'] for f in result['validated_facts']])

    def test_dose_must_belong_to_its_component_not_another_drug_in_the_same_span(self):
        text = ('Twenty-five patients with melanoma were treated. Arm A received nivolumab 3 mg/kg and ipilimumab 1 mg/kg. '
            'Arm B received nivolumab or pembrolizumab. The hazard ratio for Arm A versus Arm B was 0.7 (95% CI 0.5-0.9). Arm A had 10 patients with a response.')
        source, catalog, payload = fixture(text)
        payload['arm_regimens'][0]['nodes'][1]['dose'] = '3 mg/kg'
        self.assertEqual(review(source, catalog, payload)['arm_regimen_results'][0]['status'], 'source_checked')
        payload['arm_regimens'][0]['nodes'][1]['dose'] = '1 mg/kg'
        self.assertEqual(review(source, catalog, payload)['arm_regimen_results'][0]['status'], 'held')

    def test_unknown_leaf_does_not_invent_a_class_and_never_drops_other_facts(self):
        source, catalog, payload = fixture()
        payload['arm_regimens'][0]['nodes'] = [node('A-unknown', kind='UNKNOWN', evidence_ids=[])]
        payload['arm_regimens'][0]['root_node_id'] = 'A-unknown'
        result = review(source, catalog, payload)
        self.assertEqual(result['arm_regimen_results'][0]['status'], 'source_checked')
        self.assertEqual(result['validated_arm_regimens'][0]['nodes'][0]['drug_class'], None)

    def test_descriptive_count_keeps_actual_arm_even_with_common_comparison_type(self):
        source, catalog, payload = fixture()
        payload['facts'][2].update(contrast_type='treatment_comparison', arm_id='B')
        wrong = review(source, catalog, payload)
        self.assertNotIn('RA', [f['fact_id'] for f in wrong['validated_facts']])
        payload['facts'][2]['numbers'] = [number(8, '8', 'numerator', 'patients')]
        correct = review(source, catalog, payload)
        self.assertIn('RA', [f['fact_id'] for f in correct['validated_facts']])

    def test_arm_tie_reuses_number_harmonization_and_keeps_explicit_missing_values(self):
        source, catalog, payload = fixture()
        text = source['blocks'][1]['text'].replace('10 patients', 'Ten patients')
        source, catalog, payload = fixture(text)
        result = review(source, catalog, payload)
        self.assertIn('RA', [f['fact_id'] for f in result['validated_facts']])
        payload['facts'][2]['numbers'] = [number(None, None, 'numerator', 'patients', status='not_reported',
            qualifier='not_reported', missing_reason='not reported', evidence_ids=[])]
        missing = review(source, catalog, payload)
        self.assertIn('RA', [f['fact_id'] for f in missing['validated_facts']])
        self.assertIsNone(next(f for f in missing['validated_facts'] if f['fact_id'] == 'RA')['numbers'][0]['value'])

    def test_allocation_order_and_reversed_ratio_cannot_establish_requested_direction(self):
        source, catalog, payload = fixture()
        text = source['blocks'][1]['text'].replace('The overall-survival hazard ratio for Arm A versus Arm B was',
            'Patients were allocated to Arm A versus Arm B. The overall-survival hazard ratio was')
        source, catalog, payload = fixture(text)
        result = review(source, catalog, payload)
        self.assertEqual(result['contrast_results'][0]['status'], 'held')
        self.assertIn('f', [f['fact_id'] for f in result['validated_facts']])
        text = text.replace('The overall-survival hazard ratio was', 'The overall-survival hazard ratio for Arm B relative to Arm A was')
        source, catalog, payload = fixture(text)
        self.assertEqual(review(source, catalog, payload)['contrast_results'][0]['status'], 'held')
        payload['contrast_definitions'][0].update(experimental_arm_id='B', reference_arm_id='A')
        payload['facts'][1].update(experimental_arm_id='B', comparator_arm_id='A')
        self.assertIn('HR', [f['fact_id'] for f in review(source, catalog, payload)['validated_facts']])

    def test_explicit_reference_role_overrides_narrative_allocation_order(self):
        source, catalog, payload = fixture()
        text = source['blocks'][1]['text'].replace('The overall-survival hazard ratio for Arm A versus Arm B was',
            'Arm A was used as the reference group. The overall-survival hazard ratio for Arm B was')
        source, catalog, payload = fixture(text)
        self.assertEqual(review(source, catalog, payload)['contrast_results'][0]['status'], 'held')
        payload['contrast_definitions'][0].update(experimental_arm_id='B', reference_arm_id='A')
        payload['facts'][1].update(experimental_arm_id='B', comparator_arm_id='A')
        self.assertIn('HR', [f['fact_id'] for f in review(source, catalog, payload)['validated_facts']])

    def test_nested_AND_of_OR_needs_explicit_grouping_and_preserves_alternatives(self):
        source, catalog, payload = fixture()
        text = source['blocks'][1]['text'].replace('Arm A received nivolumab and ipilimumab.',
            'Arm A received ipilimumab with (nivolumab or pembrolizumab).')
        source, catalog, payload = fixture(text)
        payload['arm_regimens'][0]['nodes'] = [
            node('A-root', kind='AND', children=['A-ipi', 'A-choice']), node('A-ipi', 'ipilimumab'),
            node('A-choice', kind='OR', children=['A-nivo', 'A-pembro']),
            node('A-nivo', 'nivolumab'), node('A-pembro', 'pembrolizumab')]
        self.assertEqual(review(source, catalog, payload)['arm_regimen_results'][0]['status'], 'source_checked')
        source2, catalog2, p2 = fixture(text.replace('(nivolumab or pembrolizumab)', 'nivolumab or pembrolizumab'))
        p2['arm_regimens'][0] = deepcopy(payload['arm_regimens'][0])
        self.assertEqual(review(source2, catalog2, p2)['arm_regimen_results'][0]['status'], 'held')


if __name__ == '__main__':
    unittest.main()
