import copy
import json
import unittest

from metamelanoma import quantitative as q
from metamelanoma.screening import build_source, catalog_for


def fixture(text=None):
    source = build_source({'report_id': 'pmid:123', 'pmid': '123', 'title': 'A melanoma trial',
        'abstract': text or 'The randomized CheckMate 001 trial (NCT12345678) treated melanoma patients. '
            'One hundred and seven patients received nivolumab plus ipilimumab and fifty patients received nivolumab. '
            'The intention-to-treat HR for OS was 0.70 (95% CI 0.50-0.98), P=0.02, two-sided Wald test. '
            'Median OS was 2 years (95% CI 1-3 years). ORR was 20% among 50 patients.'})
    evidence = [catalog_for(source)['spans'][-1]['span_id']]
    record = q.empty_record(source)
    record['decision'] = {'status': 'retain', 'reason_code': 'eligible', 'reason': 'Original treated melanoma trial', 'evidence': evidence}
    record['study'].update(name='CheckMate 001', identifiers=[{'registry': 'ClinicalTrials.gov', 'id': 'NCT12345678'}],
        study_type='interventional_trial', randomized='yes', comparison_structure='comparative', evidence=evidence)
    record['populations'] = [{'id': 'pop', 'scope': 'overall', 'label': 'melanoma', 'parent_id': 'NA',
        'melanoma_only': 'yes', 'cutoff': 'NA', 'evidence': evidence}]
    for aid, drug in [('a', 'nivolumab'), ('b', 'ipilimumab')]:
        record['arms'].append({'id': aid, 'population_id': 'pop', 'label': drug, 'root_id': aid + 'node',
            'nodes': [{'id': aid + 'node', 'kind': 'drug', 'name': drug, 'children': [],
                       'dose': 'NA', 'route': 'NA', 'schedule': 'NA'}], 'evidence': evidence})
    return source, record, evidence


def count(ident, n, arm, evidence, **updates):
    value = {'id': ident, 'population_id': 'pop', 'arm_id': arm, 'result_id': 'NA',
        'count_purpose': 'randomized', 'n': n, 'cutoff': 'NA', 'method': 'reported',
        'component_ids': [], 'disjoint': 'yes', 'complete': 'yes', 'evidence': evidence}
    value.update(updates)
    return value


def effect(evidence, **updates):
    value = {'id': 'hr', 'population_id': 'pop', 'endpoint_definition': 'overall survival',
        'cutoff': 'NA', 'origin': 'own_report', 'evidence': evidence,
        'intervention_arm_id': 'a', 'reference_arm_id': 'b', 'endpoint': 'OS',
        'measure': 'HR', 'estimate': .7, 'ci_lower': .5, 'ci_upper': .98, 'ci_level': 95,
        'analysis_n': 'NA', 'adjusted': 'NA', 'model': 'Cox', 'p_value': .02,
        'p_test': 'Wald', 'p_sidedness': 'two'}
    value.update(updates)
    return value


class CompactQuantitativeTests(unittest.TestCase):
    def test_request_is_xhigh_owned_schema_and_allows_reasoning_output_budget(self):
        source, _, _ = fixture()
        body = q.request_body(source, max_output_tokens=65536)
        self.assertEqual(body['reasoning'], {'effort': 'xhigh'})
        self.assertEqual(body['model'], 'gpt-6.1-sol')
        self.assertEqual(body['text']['format']['schema']['properties']['pmid']['enum'], ['123'])
        with self.assertRaises(ValueError):
            q.request_body(source, reasoning_effort='high')

    def test_saved_prompt_replay_is_exact_and_new_requests_use_mixture_policy(self):
        source, _, _ = fixture()
        original = q.request_body(source, recorded_instructions=q.PRE_MIXED_SUBTYPE_PROMPT)
        current = q.request_body(source)
        self.assertEqual(original['instructions'], q.PRE_MIXED_SUBTYPE_PROMPT)
        self.assertEqual(current['instructions'], original['instructions'] + q.MIXED_SUBTYPE_INSTRUCTIONS)
        self.assertEqual({k:v for k,v in original.items() if k != 'instructions'},
                         {k:v for k,v in current.items() if k != 'instructions'})
        with self.assertRaises(ValueError):
            q.request_body(source, recorded_instructions='Arbitrary instructions')

    def test_source_identity_failure_is_global(self):
        source, record, _ = fixture()
        record['pmid'] = '999'
        view = q.validate(record, source)
        self.assertFalse(view['valid'])
        self.assertIn('foreign_pmid', view['global_errors'])

    def test_written_counts_sum_to_157_without_assigning_total_to_arms(self):
        source, record, ev = fixture()
        record['sample_sizes'] = [count('n1', 'One hundred and seven', 'a', ev), count('n2', 50, 'b', ev),
            count('total', 'NA', 'NA', ev, method='sum', component_ids=['n1', 'n2'])]
        view = q.validate(record, source)
        self.assertTrue(view['valid'])
        self.assertTrue(view['decision_valid'])
        self.assertEqual([r['n'] for r in view['record']['sample_sizes']], [107, 50, 157])
        self.assertEqual(record['sample_sizes'][0]['n'], 'One hundred and seven')

    def test_overlapping_or_incomplete_components_do_not_sum(self):
        source, record, ev = fixture()
        record['sample_sizes'] = [count('n1', 107, 'a', ev), count('n2', 50, 'b', ev),
            count('total', 'NA', 'NA', ev, method='sum', component_ids=['n1', 'n2'], disjoint='no')]
        view = q.validate(record, source)
        self.assertEqual(view['record']['sample_sizes'][2]['n'], 'NA')
        self.assertTrue(any(i['code'] == 'unsafe_count_arithmetic' for i in view['issues']))

    def test_same_scope_conflicting_counts_flagged(self):
        source, record, ev = fixture()
        record['sample_sizes'] = [count('n1', 107, 'a', ev), count('n2', 50, 'a', ev)]
        view = q.validate(record, source)
        self.assertEqual([r['n'] for r in view['record']['sample_sizes']], ['NA', 'NA'])
        self.assertTrue(any(i['code'] == 'CONFLICTING_same_scope_counts' for i in view['issues']))

    def test_bad_number_does_not_hold_supported_effect_or_decision(self):
        source, record, ev = fixture()
        record['effects'] = [effect(ev, analysis_n=99999)]
        view = q.validate(record, source)
        self.assertTrue(view['decision_valid'])
        self.assertEqual(view['record']['effects'][0]['estimate'], .7)
        self.assertEqual(view['record']['effects'][0]['analysis_n'], 'NA')

    def test_reported_ci_preserved_and_unspecified_level_defaulted(self):
        original_source, _, _ = fixture()
        source, record, ev = fixture(original_source['blocks'][-1]['text'].replace('95% CI', 'CI'))
        record['effects'] = [effect(ev, ci_level='NA')]
        view = q.validate(record, source)
        row = view['record']['effects'][0]
        self.assertEqual((row['ci_lower'], row['ci_upper'], row['ci_level']), (.5, .98, 95))
        self.assertTrue(any(d['method'] == 'user_default_unspecified_CI' for d in view['record']['derivations']))

    def test_wald_assumption_and_logrank_guard(self):
        self.assertIsNotNone(q.wald_interval(.7, .02, 157))
        self.assertIsNone(q.wald_interval(.7, .02, 157, test='logrank'))
        self.assertIsNone(q.wald_interval(.7, .02, 157, sidedness='one'))
        self.assertIsNone(q.wald_interval(1, .02, 157))
        self.assertIsNone(q.wald_interval(.7, 0, 157))

    def test_rounded_count_requires_unique_integer(self):
        self.assertEqual(q.unique_rounded_count(20, 50, decimals=0), 10)
        self.assertEqual(q.unique_rounded_count(20, 10000, decimals=0), 'NA')
        self.assertEqual(q.unique_rounded_count(33.3, 3, decimals=1), 1)

    def test_time_conversion(self):
        self.assertEqual(q.months(3, 'years'), 36)
        self.assertAlmostEqual(q.months(365.25, 'days'), 12)
        self.assertEqual(q.months('NA', 'years'), 'NA')

    def test_endpoint_definitions_are_separate_and_no_HR_from_medians(self):
        source, record, ev = fixture()
        record['survival'] = [{'id': 'med', 'population_id': 'pop', 'endpoint_definition': 'OS',
            'cutoff': 'NA', 'origin': 'own_report', 'evidence': ev, 'arm_id': 'a', 'endpoint': 'OS',
            'kind': 'median', 'estimate': 2, 'ci_lower': 1, 'ci_upper': 3, 'ci_level': 95,
            'unit': 'years', 'median_status': 'reached', 'time': 'NA', 'time_unit': 'NA', 'analysis_n': 'NA'}]
        view = q.validate(record, source)
        self.assertEqual(view['record']['effects'], [])
        self.assertEqual(view['record']['survival'][0]['estimate'], 24)
        self.assertEqual(view['record']['survival'][0]['unit'], 'months')

    def test_outcome_n_preferred_and_no_total_to_arm(self):
        row = {'id': 'x', 'population_id': 'pop', 'cutoff': 'NA', 'arm_id': 'a', 'analysis_n': 42}
        counts = [count('total', 157, 'NA', [])]
        self.assertEqual(q.select_sample_size(row, counts, section='survival')['n'], 42)
        row['analysis_n'] = 'NA'
        self.assertEqual(q.select_sample_size(row, counts, section='survival')['n'], 'NA')

    def test_event_count_cannot_be_patient_N(self):
        source, record, ev = fixture('Melanoma patients received nivolumab or ipilimumab. There were 107 events and 50 lesions.')
        record['study']['name'] = 'NA'
        record['study']['identifiers'] = []
        record['sample_sizes'] = [count('n1', 107, 'a', ev)]
        view = q.validate(record, source)
        self.assertEqual(view['record']['sample_sizes'][0]['n'], 'NA')

    def test_subgroup_never_replaces_overall_N(self):
        row = {'id': 'x', 'population_id': 'pop', 'cutoff': 'NA', 'arm_id': 'a', 'analysis_n': 'NA'}
        counts = [count('sub', 50, 'a', [], population_id='subgroup')]
        self.assertEqual(q.select_sample_size(row, counts, section='survival')['n'], 'NA')

    def test_missing_is_not_zero(self):
        self.assertEqual(q._number('cannot be estimated'), 'NA')
        self.assertEqual(q._number(0), 0)
        self.assertEqual(q._number('Twenty-five'), 25)

    def test_three_arm_study_total_is_not_two_arm_comparison_N(self):
        row = effect([], analysis_n='NA')
        counts = [count('total', 200, 'NA', [])]
        arms = [{'id': aid, 'population_id': 'pop'} for aid in ('a', 'b', 'c')]
        self.assertEqual(q.select_sample_size(row, counts, arms=arms)['n'], 'NA')
        counts += [count('a_n', 70, 'a', []), count('b_n', 60, 'b', [])]
        self.assertEqual(q.select_sample_size(row, counts, arms=arms)['n'], 130)

    def test_two_arm_total_and_summed_arm_disagreement_is_conflicting(self):
        row = effect([], analysis_n='NA')
        counts = [count('total', 200, 'NA', []), count('a_n', 107, 'a', []), count('b_n', 50, 'b', [])]
        arms = [{'id': aid, 'population_id': 'pop'} for aid in ('a', 'b')]
        selected = q.select_sample_size(row, counts, arms=arms)
        self.assertEqual(selected['n'], 'NA')
        self.assertEqual(selected['status'], 'CONFLICTING')

    def test_binary_denominator_purpose_is_endpoint_specific(self):
        row = {'id': 'x', 'population_id': 'pop', 'cutoff': 'NA', 'arm_id': 'a', 'denominator': 'NA', 'endpoint': 'ORR'}
        counts = [count('rand', 107, 'a', []), count('response', 50, 'a', [], count_purpose='response_evaluable'),
                  count('safe', 80, 'a', [], count_purpose='safety')]
        self.assertEqual(q.select_sample_size(row, counts, section='binary')['n'], 50)
        row['endpoint'] = 'AE_any'
        self.assertEqual(q.select_sample_size(row, counts, section='binary')['n'], 80)

    def test_unbound_outcome_analysis_N_not_reused_and_cutoffs_not_mixed(self):
        row = {'id': 'x', 'population_id': 'pop', 'cutoff': 'NA', 'arm_id': 'a', 'analysis_n': 'NA'}
        counts = [count('n1', 107, 'a', [], count_purpose='outcome_analysis'),
                  count('n2', 50, 'a', [], cutoff='2020-12-01')]
        self.assertEqual(q.select_sample_size(row, counts, section='survival')['n'], 'NA')

    def test_invalid_screening_not_counted_complete(self):
        source, record, ev = fixture()
        record['decision']['evidence'] = ['foreign']
        record['effects'] = [effect(ev)]
        view = q.validate(record, source)
        self.assertFalse(view['valid'])
        self.assertFalse(view['decision_valid'])
        self.assertEqual(view['record']['effects'][0]['estimate'], .7)

    def test_mixed_melanoma_subtypes_cannot_be_sole_screening_rejection(self):
        for status, code in [('exclude', 'ineligible_design'), ('unclear', 'unresolved_population')]:
            for reason in ['Mixed melanoma-subtype population is conflicting information.',
                           'Mixed histologies of melanoma are ineligible.',
                           'The population contains an inseparable mixture of cutaneous and mucosal melanoma.']:
                source, record, _ = fixture()
                record['decision'].update(status=status, reason_code=code, reason=reason)
                with self.subTest(status=status, reason=reason):
                    view = q.validate(record, source)
                    self.assertFalse(view['decision_valid'])
                    self.assertTrue(any(x['code'] == 'subtype_only_uncertainty_forbidden' for x in view['issues']))

    def test_mixed_cancer_linkage_and_true_source_conflicts_stay_reviewable(self):
        for reason in ['Mixed melanoma subtypes and other cancers; melanoma-specific enrollment is unresolved.',
                       'Mixed melanoma subtypes; contradictory sources disagree about the enrolled population.',
                       'Mixed breast cancer subtypes have no treated melanoma population.']:
            source, record, _ = fixture()
            record['decision'].update(status='unclear', reason_code='unresolved_population', reason=reason)
            with self.subTest(reason=reason):
                self.assertTrue(q.validate(record, source)['decision_valid'])

    def test_trial_name_separator_harmonization(self):
        source, record, _ = fixture()
        record['study']['name'] = 'CheckMate-001'
        view = q.validate(record, source)
        self.assertEqual(view['record']['study']['name'], 'CheckMate-001')


    def test_conflicting_counts_cannot_fall_back_to_enrolled_N(self):
        original_source, _, _ = fixture()
        source, record, ev = fixture(original_source['blocks'][-1]['text'] + ' The initial study enrolled 120 patients.')
        record['sample_sizes'] = [count('rand1', 107, 'NA', ev), count('rand2', 50, 'NA', ev),
                                  count('enrolled', 120, 'NA', ev, count_purpose='enrolled')]
        record['effects'] = [effect(ev)]
        view = q.validate(record, source)
        self.assertEqual([c.get('count_status') for c in view['record']['sample_sizes'][:2]], ['CONFLICTING', 'CONFLICTING'])
        display = view['record']['effects'][0]['display_n']
        self.assertEqual((display['n'], display['status']), ('NA', 'CONFLICTING'))
        self.assertEqual(view['record']['sample_sizes'][2]['n'], 120)

    def test_conflict_other_population_cutoff_and_purpose_do_not_block(self):
        row = {'id': 'x', 'population_id': 'pop', 'cutoff': 'NA', 'arm_id': 'a', 'analysis_n': 'NA'}
        conflicts = [count('otherpop', 'NA', 'a', [], population_id='sub', count_status='CONFLICTING'),
                     count('otherdate', 'NA', 'a', [], cutoff='2020', count_status='CONFLICTING'),
                     count('safety', 'NA', 'a', [], count_purpose='safety', count_status='CONFLICTING')]
        selected = q.select_sample_size(row, conflicts + [count('valid', 50, 'a', [])], section='survival')
        self.assertEqual(selected['n'], 50)

    def test_comparative_arm_conflict_blocks_total_or_lower_purpose(self):
        row = effect([], analysis_n='NA')
        arms = [{'id': aid, 'population_id': 'pop'} for aid in ('a', 'b')]
        counts = [count('a_conflict', 'NA', 'a', [], count_status='CONFLICTING'),
                  count('b', 50, 'b', []), count('total', 157, 'NA', []),
                  count('enrolled', 200, 'NA', [], count_purpose='enrolled')]
        selected = q.select_sample_size(row, counts, arms=arms)
        self.assertEqual((selected['n'], selected['status']), ('NA', 'CONFLICTING'))

    def test_three_arm_total_conflict_does_not_block_known_two_arm_sum(self):
        row = effect([], analysis_n='NA')
        arms = [{'id': aid, 'population_id': 'pop'} for aid in ('a', 'b', 'c')]
        counts = [count('total', 'NA', 'NA', [], count_status='CONFLICTING'),
                  count('a_n', 107, 'a', []), count('b_n', 50, 'b', [])]
        self.assertEqual(q.select_sample_size(row, counts, arms=arms)['n'], 157)

    def test_explicit_unique_99_CI_level_precedes_default(self):
        source, record, ev = fixture('Melanoma patients received nivolumab or ipilimumab. HR for overall survival was 0.70 (99% CI 0.50-0.98).')
        record['effects'] = [effect(ev, ci_level='NA', p_value='NA')]
        view = q.validate(record, source)
        self.assertEqual(view['record']['effects'][0]['ci_level'], 99)
        self.assertTrue(any(d['method'] == 'unique_explicit_source_CI_level' and d['value'] == 99
                            for d in view['record']['derivations']))

    def test_ambiguous_source_levels_remain_NA_with_flag(self):
        source, record, ev = fixture('Melanoma patients received nivolumab or ipilimumab. HR for OS was 0.70 (90% CI 0.50-0.98). For PFS the 99% confidence interval was 0.40-0.90.')
        record['effects'] = [effect(ev, ci_level='NA', p_value='NA')]
        view = q.validate(record, source)
        self.assertEqual(view['record']['effects'][0]['ci_level'], 'NA')
        self.assertTrue(any(i['code'] == 'CONFLICTING_source_CI_levels' for i in view['issues']))

    def test_explicit_source_level_disagrees_with_model_level(self):
        source, record, ev = fixture('Melanoma patients received nivolumab or ipilimumab. HR for OS was 0.70 (99% CI 0.50-0.98).')
        record['effects'] = [effect(ev, ci_level=95, p_value='NA')]
        view = q.validate(record, source)
        self.assertEqual(view['record']['effects'][0]['ci_level'], 'NA')
        self.assertTrue(any(i['code'] == 'CONFLICTING_reported_CI_level' for i in view['issues']))

    def test_noninteger_explicit_CI_level_preserved(self):
        source, record, ev = fixture('Melanoma patients received nivolumab or ipilimumab. HR for OS was 0.70 (confidence interval, 95.6%: 0.50-0.98).')
        record['effects'] = [effect(ev, ci_level='NA', p_value='NA')]
        view = q.validate(record, source)
        self.assertEqual(view['record']['effects'][0]['ci_level'], 95.6)

    def test_undated_baseline_arm_counts_for_later_interim_HR(self):
        row = effect([], analysis_n='NA', cutoff='Second interim analysis', intervention_arm_id='a', reference_arm_id='c')
        arms = [{'id': aid, 'population_id': 'pop'} for aid in ('a', 'b', 'c')]
        counts = [count('a_n', 180, 'a', []), count('b_n', 181, 'b', []), count('c_n', 179, 'c', []),
                  count('total', 540, 'NA', [])]
        first = q.select_sample_size(row, counts, arms=arms)
        self.assertEqual(first['n'], 359)
        self.assertEqual(first['cutoff_basis'], 'undated_baseline')
        self.assertEqual(first['outcome_cutoff'], 'Second interim analysis')
        row['intervention_arm_id'] = 'b'
        self.assertEqual(q.select_sample_size(row, counts, arms=arms)['n'], 360)

    def test_baseline_exception_does_not_borrow_known_different_cutoff(self):
        row = {'id': 'x', 'population_id': 'pop', 'cutoff': 'Second interim analysis', 'arm_id': 'a', 'analysis_n': 'NA'}
        counts = [count('n1', 107, 'a', [], cutoff='First interim analysis'),
                  count('n2', 50, 'a', [], count_purpose='safety')]
        self.assertEqual(q.select_sample_size(row, counts, section='survival')['n'], 'NA')

    def test_operator_schedule_kept_without_losing_OR_composition(self):
        source, record, ev = fixture()
        arm = record['arms'][1]
        arm['root_id'] = 'alternatives'
        arm['nodes'] = [
            {'id': 'alternatives', 'kind': 'OR', 'name': 'NA', 'children': ['bnode', 'anode2'],
             'dose': 'NA', 'route': 'NA', 'schedule': 'until progression'},
            arm['nodes'][0],
            {'id': 'anode2', 'kind': 'drug', 'name': 'nivolumab', 'children': [],
             'dose': 'NA', 'route': 'NA', 'schedule': 'NA'}]
        view = q.validate(record, source)
        normalized = view['record']['arms'][1]
        self.assertEqual(normalized['nodes'][0]['kind'], 'OR')
        self.assertEqual(normalized['nodes'][0]['children'], ['bnode', 'anode2'])
        self.assertEqual(normalized['nodes'][0]['schedule'], 'NA')
        self.assertEqual(normalized['operator_administration'][0]['schedule'], 'until progression')
        self.assertEqual(record['arms'][1]['nodes'][0]['schedule'], 'until progression')

    def test_subgroup_total_sums_its_own_counts_using_parent_arm_membership(self):
        source, record, ev = fixture()
        record['populations'].append({'id': 'sub', 'scope': 'subgroup', 'label': 'response-evaluable',
            'parent_id': 'pop', 'melanoma_only': 'yes', 'cutoff': 'NA', 'evidence': ev})
        record['sample_sizes'] = [count('na', 107, 'a', ev, population_id='sub'),
            count('nb', 50, 'b', ev, population_id='sub'),
            count('sub_total', 'NA', 'NA', ev, population_id='sub', method='sum', component_ids=['na', 'nb'])]
        view = q.validate(record, source)
        self.assertEqual(view['record']['sample_sizes'][2]['n'], 157)
        self.assertEqual(view['record']['sample_sizes'][2]['population_id'], 'sub')

    def test_repeated_CI_and_different_endpoint_CI_do_not_erase_reported_level(self):
        source, record, ev = fixture('Melanoma patients received nivolumab or ipilimumab. OS HR was 0.70 (95.6% repeated CI 0.50-0.98); PFS HR 0.85 (99.4% CI 0.66-1.09).')
        record['effects'] = [effect(ev, ci_level=95.6, p_value='NA')]
        view = q.validate(record, source)
        self.assertEqual(view['record']['effects'][0]['ci_level'], 95.6)

    def test_endpoint_context_preserves_explicit_zero_deaths(self):
        source, record, ev = fixture('Melanoma patients received nivolumab or ipilimumab. No treatment-related deaths occurred.')
        record['binary'] = [{'id': 'deaths', 'population_id': 'pop', 'endpoint_definition': 'NA',
            'cutoff': 'NA', 'origin': 'own_report', 'evidence': ev, 'arm_id': 'a',
            'endpoint': 'treatment_related_death', 'numerator': 0, 'denominator': 'NA',
            'percentage': 'NA', 'ci_lower': 'NA', 'ci_upper': 'NA', 'ci_level': 'NA',
            'assessment_time': 'NA', 'time_unit': 'NA', 'response_criteria': 'NA', 'safety_attribution': 'treatment_related'}]
        view = q.validate(record, source)
        self.assertEqual(view['record']['binary'][0]['numerator'], 0)


    @staticmethod
    def literal_binary(ev, **updates):
        row = {'id': 'response_result', 'population_id': 'pop', 'endpoint_definition': 'NA',
            'cutoff': 'NA', 'origin': 'own_report', 'evidence': ev, 'arm_id': 'a', 'endpoint': 'ORR',
            'numerator': 1, 'denominator': 'NA', 'percentage': 'NA', 'ci_lower': 'NA',
            'ci_upper': 'NA', 'ci_level': 'NA', 'assessment_time': 'NA', 'time_unit': 'NA',
            'response_criteria': 'NA', 'safety_attribution': 'NA'}
        row.update(updates)
        return row

    def test_single_objective_complete_response_is_one_patient(self):
        source, record, ev = fixture('In the 16 patients with melanoma who received nivolumab, there was a single objective response (complete response).')
        record['binary'] = [self.literal_binary(ev, id='orr', denominator=16), self.literal_binary(ev, id='cr', endpoint='CR', denominator=16)]
        view = q.validate(record, source)
        self.assertEqual([b['numerator'] for b in view['record']['binary']], [1, 1])
        self.assertEqual([b['denominator'] for b in view['record']['binary']], [16, 16])
        self.assertTrue(any(d['method'] == 'explicit_single_patient_response' for d in view['record']['derivations']))

    def test_no_objective_responses_with_ORR_abbreviation_is_zero(self):
        source, record, ev = fixture('There were no objective responses in patients with other tumors, including 12 melanoma patients treated with nivolumab.')
        record['binary'] = [self.literal_binary(ev, numerator=0, denominator=12)]
        view = q.validate(record, source)
        self.assertEqual(view['record']['binary'][0]['numerator'], 0)

    def test_no_complete_responses_does_not_become_zero_ORR(self):
        source, record, ev = fixture('Melanoma patients received nivolumab. No complete responses occurred.')
        record['binary'] = [self.literal_binary(ev, numerator=0)]
        self.assertEqual(q.validate(record, source)['record']['binary'][0]['numerator'], 'NA')

    def test_single_complete_response_does_not_become_total_ORR(self):
        source, record, ev = fixture('Melanoma patients receiving nivolumab had a single complete response.')
        record['binary'] = [self.literal_binary(ev)]
        self.assertEqual(q.validate(record, source)['record']['binary'][0]['numerator'], 'NA')

    def test_single_arm_is_not_N_or_one_response(self):
        source, record, ev = fixture('A single-arm trial gave nivolumab to melanoma patients.')
        record['sample_sizes'] = [count('n', 1, 'a', ev)]
        record['binary'] = [self.literal_binary(ev)]
        view = q.validate(record, source)
        self.assertEqual(view['record']['sample_sizes'][0]['n'], 'NA')
        self.assertEqual(view['record']['binary'][0]['numerator'], 'NA')

    def test_negated_single_response_or_assessment_is_not_one(self):
        for text in ('The melanoma patients did not have a single objective response.',
                     'Melanoma patients underwent a single objective response assessment.'):
            source, record, ev = fixture(text)
            record['binary'] = [self.literal_binary(ev)]
            self.assertEqual(q.validate(record, source)['record']['binary'][0]['numerator'], 'NA')

    def test_episode_response_is_not_patient_count(self):
        source, record, ev = fixture('Melanoma patients had repeated response episodes and a single objective response.')
        record['binary'] = [self.literal_binary(ev)]
        self.assertEqual(q.validate(record, source)['record']['binary'][0]['numerator'], 'NA')

    def none_fixture(self):
        source, record, ev = fixture('Melanoma patients received ipilimumab. The most common grade 3-4 adverse events were gastrointestinal immune-related events (11 in the 10 mg/kg group, two in the 3 mg/kg group, none in the 0.3 mg/kg group) and diarrhoea (ten in the 10 mg/kg group, one in the 3 mg/kg group, none in the 0.3 mg/kg group).')
        record['arms'][0]['nodes'][0]['dose'] = '0.3 mg/kg'
        record['arms'][1]['nodes'][0]['dose'] = '3 mg/kg'
        record['binary'] = [self.literal_binary(ev, endpoint='AE_grade_3_4', endpoint_definition='Grade 3–4 gastrointestinal immune-related adverse events', numerator=0)]
        return source, record, ev

    def test_none_in_unique_dose_and_endpoint_group_is_zero(self):
        source, record, ev = self.none_fixture()
        record['binary'].append(self.literal_binary(ev, id='diarrhoea', endpoint='AE_grade_3_4', endpoint_definition='Grade 3–4 diarrhoea', numerator=0))
        view = q.validate(record, source)
        self.assertEqual([r['numerator'] for r in view['record']['binary']], [0, 0])

    def test_none_in_another_dose_or_toxicity_does_not_transfer(self):
        source, record, ev = self.none_fixture()
        record['arms'][0]['nodes'][0]['dose'] = '10 mg/kg'
        self.assertEqual(q.validate(record, source)['record']['binary'][0]['numerator'], 'NA')
        record['arms'][0]['nodes'][0]['dose'] = '0.3 mg/kg'
        record['binary'][0]['endpoint_definition'] = 'Grade 3–4 anaemia'
        self.assertEqual(q.validate(record, source)['record']['binary'][0]['numerator'], 'NA')

    def test_none_dose_must_identify_one_arm_and_preserve_grade(self):
        source, record, ev = self.none_fixture()
        record['arms'][1]['nodes'][0]['dose'] = '0.3 mg/kg'
        self.assertEqual(q.validate(record, source)['record']['binary'][0]['numerator'], 'NA')
        record['arms'][1]['nodes'][0]['dose'] = '3 mg/kg'
        record['binary'][0]['endpoint'] = 'AE_grade_ge3'
        self.assertEqual(q.validate(record, source)['record']['binary'][0]['numerator'], 'NA')


if __name__ == '__main__':
    unittest.main()
