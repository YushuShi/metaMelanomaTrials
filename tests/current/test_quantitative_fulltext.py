import copy
import json
import unittest

from metamelanoma import quantitative as q, schema
from metamelanoma.screening import build_source, catalog_for
from test_quantitative import fixture, count, effect


def fulltext_fixture():
    r2_source, r2_raw, r2_evidence = fixture()
    r2_raw['sample_sizes'] = [count('n1', 107, 'a', r2_evidence), count('n2', 50, 'b', r2_evidence)]
    r2_raw['effects'] = [effect(r2_evidence)]
    prior = q.validate(r2_raw, r2_source)['record']
    source = build_source({'report_id': prior['report_id'], 'pmid': prior['pmid']}, 'R3',
        r2_source['blocks'][-1]['text'] + ' The Cox model adjusted for age and LDH.',
        fulltext_verified=True, upstream_R2=prior)
    evidence = [catalog_for(source)['spans'][0]['span_id']]
    raw = copy.deepcopy(r2_raw)
    raw.update(stage='R3', source_sha256=schema.digest(source), r2_links=[],
        study_details={'population_description': 'Patients with melanoma',
            'design_description': 'Randomized trial', 'evidence': evidence,
            'adjustments': [{'effect_id': 'hr', 'model': 'Cox',
                'covariates': ['age', 'LDH'], 'evidence': evidence}]})
    for row in [raw['decision'], raw['study'], *raw['populations'], *raw['arms'],
                *raw['sample_sizes'], *raw['effects']]:
        row['evidence'] = evidence
    return source, raw, evidence


class QuantitativeFulltextTests(unittest.TestCase):
    def test_fulltext_preserves_mixed_subtype_but_rejects_subtype_only_hold(self):
        source, raw, _ = fulltext_fixture()
        raw['study']['melanoma_subtype'] = 'mixed'
        accepted = q.validate(raw, source)
        self.assertTrue(accepted['decision_valid'])
        self.assertEqual(accepted['record']['study']['melanoma_subtype'], 'mixed')
        raw['decision'].update(status='unclear', reason_code='unresolved_population',
            reason='The melanoma subtype population is mixed and conflicting.')
        self.assertFalse(q.validate(raw, source)['decision_valid'])
        self.assertIn('An intentionally mixed population of melanoma subtypes is eligible',
            q.request_body(source)['instructions'])
        old_body = q.request_body(source, recorded_instructions=q.PRE_MIXED_SUBTYPE_R3_PROMPT)
        self.assertEqual(old_body['instructions'], q.PRE_MIXED_SUBTYPE_R3_PROMPT)
        self.assertNotIn(q.MIXED_SUBTYPE_INSTRUCTIONS, old_body['instructions'])
        with self.assertRaises(ValueError):
            q.request_body(source, recorded_instructions=q.PRE_MIXED_SUBTYPE_PROMPT)

    def test_trial_cohort_order_requires_explicit_same_trial_relationship(self):
        span = {'span_id': 's', 'text': 'Results: cohort A of the phase 2 SWOG S1512 trial',
            'is_target': True, 'planned_only': False, 'document_role': 'main_article_title'}
        self.assertIsNotNone(q._trial_cohort_name('SWOG S1512 cohort A', [span]))
        self.assertIsNone(q._trial_cohort_name('SWOG S1512 cohort B', [span]))
        self.assertIsNone(q._trial_cohort_name('SWOG S1513 cohort A', [span]))
        self.assertIsNone(q._trial_cohort_name('SWOG S1512 cohort A', [{**span,
            'text': 'SWOG S1512 trial. Cohort A of the phase 2 SWOG S1513 trial.'}]))
        self.assertIsNone(q._trial_cohort_name('SWOG S1512 cohort A', [{**span, 'planned_only': True}]))

    def test_r2_contract_stays_r2_only(self):
        source, _, _ = fixture()
        body = q.request_body(source)
        self.assertEqual(body['instructions'], q.PROMPT)
        self.assertEqual(q.review_schema('R2'), q.SCHEMA)
        self.assertNotIn('upstream_r2_context', json.loads(body['input']))
        self.assertNotIn('r2_links', body['text']['format']['schema']['properties'])

    def test_r3_is_luna_xhigh_complete_source_with_non_evidence_prior(self):
        source, _, _ = fulltext_fixture()
        body = q.request_body(source)
        self.assertEqual(body['model'], 'gpt-6-luna')
        self.assertEqual(body['reasoning'], {'effort': 'xhigh'})
        data = json.loads(body['input'])
        self.assertEqual(data['upstream_r2_context']['record'], source['upstream_R2'])
        saved_spans = catalog_for(source)['spans']
        self.assertEqual([(s['span_id'], s['text']) for s in data['source_span_catalog']['spans']],
            [(s['span_id'], s['text']) for s in saved_spans])
        self.assertEqual(data['source_span_catalog']['source_sha256'], schema.digest(source))
        contract = body['text']['format']['schema']
        self.assertEqual(contract['$defs']['source_span_id']['pattern'], '^span-[a-f0-9]{24}$')
        self.assertEqual(contract['properties']['decision']['properties']['evidence']['items'],
            {'$ref': '#/$defs/source_span_id'})

    def test_excluded_foreign_and_unvalidated_r2_cannot_create_r3_request(self):
        for change in ('excluded', 'foreign', 'unvalidated', 'missing'):
            source, _, _ = fulltext_fixture()
            if change == 'excluded': source['upstream_R2']['decision']['status'] = 'exclude'
            if change == 'foreign': source['upstream_R2']['pmid'] = '999'
            if change == 'unvalidated': source['upstream_R2']['validation']['decision_valid'] = False
            if change == 'missing': source['upstream_R2'] = None
            with self.subTest(change=change), self.assertRaises(ValueError):
                q.request_body(source)

    def test_links_and_source_backed_adjustments_survive(self):
        source, raw, evidence = fulltext_fixture()
        raw['r2_links'] = [{'section': 'effects', 'r2_id': 'hr', 'r3_id': 'hr',
            'relation': 'supplement', 'evidence': evidence}]
        before = copy.deepcopy(source['upstream_R2'])
        view = q.validate(raw, source)
        self.assertTrue(view['valid'], view)
        self.assertEqual(view['record']['r2_links'], raw['r2_links'])
        self.assertEqual(view['record']['study_details']['adjustments'][0]['covariates'], ['age', 'LDH'])
        self.assertEqual(source['upstream_R2'], before)

    def test_foreign_or_prior_evidence_links_are_held_without_losing_decision(self):
        for change in ('foreign_row', 'prior_span', 'duplicate'):
            source, raw, evidence = fulltext_fixture()
            link = {'section': 'effects', 'r2_id': 'hr', 'r3_id': 'hr',
                'relation': 'same', 'evidence': evidence}
            if change == 'foreign_row': link['r2_id'] = 'unrelated'
            if change == 'prior_span': link['evidence'] = source['upstream_R2']['effects'][0]['evidence']
            raw['r2_links'] = [link, copy.deepcopy(link)] if change == 'duplicate' else [link]
            view = q.validate(raw, source)
            self.assertTrue(view['valid'])
            self.assertEqual(len(view['record']['r2_links']), 1 if change == 'duplicate' else 0)
            self.assertTrue(any(i['section'] == 'r2_links' for i in view['issues']))

    def test_invented_covariate_and_foreign_effect_are_isolated(self):
        for change in ('covariate', 'effect'):
            source, raw, _ = fulltext_fixture()
            row = raw['study_details']['adjustments'][0]
            if change == 'covariate': row['covariates'].append('invented biomarker')
            if change == 'effect': row['effect_id'] = 'other-study-effect'
            view = q.validate(raw, source)
            self.assertTrue(view['valid'])
            self.assertEqual(view['record']['study_details']['adjustments'], [])
            self.assertEqual(view['record']['effects'][0]['estimate'], .7)

    def test_age_is_not_supported_by_stage_substring(self):
        source, raw, _ = fulltext_fixture()
        source['blocks'][0]['text'] = source['blocks'][0]['text'].replace('for age and LDH', 'for stage and LDH')
        evidence = [catalog_for(source)['spans'][0]['span_id']]
        raw['source_sha256'] = schema.digest(source)
        for row in [raw['decision'], raw['study'], *raw['populations'], *raw['arms'],
                *raw['sample_sizes'], *raw['effects'], raw['study_details'],
                *raw['study_details']['adjustments']]:
            row['evidence'] = evidence
        view = q.validate(raw, source)
        self.assertTrue(view['valid'])
        self.assertEqual(view['record']['study_details']['adjustments'], [])

    def test_r3_may_resolve_r2_unclear_without_mutating_it(self):
        source, raw, _ = fulltext_fixture()
        source['upstream_R2']['decision'].update(status='unclear', reason_code='unresolved_treatment')
        raw['source_sha256'] = schema.digest(source)
        view = q.validate(raw, source)
        self.assertTrue(view['valid'])
        self.assertEqual(view['record']['decision']['status'], 'retain')
        self.assertEqual(source['upstream_R2']['decision']['status'], 'unclear')


if __name__ == '__main__':
    unittest.main()
