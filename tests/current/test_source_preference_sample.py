from copy import deepcopy
import unittest

from metamelanoma.io import canonical, digest
from metamelanoma.fulltext_export import project_fulltext
from metamelanoma.source_preference import _reset
from metamelanoma.source_preference_sample import ensure_preferred_sample, refresh_preferred_sample_sizes
from test_fulltext_export import export_fixture


class PreferredSampleTest(unittest.TestCase):
    def fixture(self, *, melanoma='yes', purpose='randomized'):
        _, _, result, _ = export_fixture()
        record = result['validation']['record']
        sample = record['sample_sizes'][0]
        sample.update(n='NA', count_purpose=purpose)
        pop = next(p for p in record['populations'] if p['id'] == sample['population_id'])
        pop['melanoma_only'] = melanoma
        wrapper = {'stage': 'R3', 'task_id': result['task_id'], 'record': record,
                   'source_proof_ref': result['source_proof_ref']}
        prefix = 'CE-' + digest(canonical({'task_id': wrapper['task_id'], 'record': record}))[:24] + '-'
        article = {'report_id': record['report_id'], 'pmid': record['pmid'], 'current_main_eligible': True,
                   'sample_size_records': []}
        source_id = record['report_id'] + ':main:input'
        evidence = {prefix + span: {'source_id': source_id, 'supporting_quote': 'Trial enrollment'}
                    for item in record['populations'] + record['arms'] for span in item['evidence']}
        evidence[prefix + 'table'] = {'source_id': source_id, 'supporting_quote': 'Randomized: 48 patients.'}
        decision = {'status': 'main_text', 'values': {'n': 48}, 'evidence_ids': [prefix + 'table']}
        return article, wrapper, sample, decision, evidence

    def test_restored_count_keeps_original_identity_and_body_anchor(self):
        args = self.fixture()
        article, wrapper, _, decision, _ = args
        frozen = deepcopy(wrapper)
        created = ensure_preferred_sample(*args)
        self.assertEqual(created['n']['value'], 48)
        self.assertEqual(created['n']['evidence_ids'], decision['evidence_ids'])
        self.assertEqual(created['sample_record_id'], 'CE-' + created['review_binding_sha256'][:24] + '-N-' + args[2]['id'])
        self.assertIs(ensure_preferred_sample(*args), created)
        self.assertEqual(len(article['sample_size_records']), 1)
        self.assertEqual(wrapper, frozen)

    def test_population_purpose_hold_and_foreign_anchors_do_not_create_rows(self):
        for args in (self.fixture(melanoma='no'), self.fixture(melanoma='NA'), self.fixture(purpose='NA')):
            self.assertIsNone(ensure_preferred_sample(*args))
            self.assertFalse(args[0]['sample_size_records'])
        args = self.fixture()
        args[0]['publication_hold'] = True
        self.assertIsNone(ensure_preferred_sample(*args))
        args[0]['publication_hold'] = False
        key = args[3]['evidence_ids'][0]
        args[4][key]['source_id'] = 'other-report:main:input'
        self.assertIsNone(ensure_preferred_sample(*args))
        self.assertFalse(args[0]['sample_size_records'])

    def test_only_outcomes_depending_on_the_changed_count_receive_a_new_n(self):
        baseline, ref, result, report = export_fixture()
        raw = result['validation']['record']
        raw['effects'].append({**deepcopy(raw['effects'][0]), 'id': 'own-n', 'analysis_n': 9})
        payload = project_fulltext(baseline, baseline_ref=ref, phase_id='r3', records=[result], reports=[report])
        wrappers = {w['stage']: w for w in payload['articles'][0]['records']}
        wrapper = wrappers['R3']
        original = deepcopy(wrapper['record'])
        article = payload['clinical_evidence']['articles'][0]
        rows = {r['quantitative_record']['id']: r for r in article['quantitative_results'] if r['review_stage'] == 'R3'}
        before = deepcopy(rows)
        anchor = rows['hr']['evidence_ids'][0]
        wrapper['source_preferences'] = {'sample_sizes': {'n1': {'status': 'main_text', 'evidence_ids': [anchor],
            'values': {'n': 110, 'evidence': [anchor.split('-', 2)[2]]}}}}
        refresh_preferred_sample_sizes(article, wrappers, payload['clinical_evidence']['evidence_registry'])
        self.assertEqual(rows['hr']['analysis_n']['value'], 160)
        self.assertEqual(rows['hr']['scoped_sample_size']['n'], 160)
        self.assertEqual(rows['hr']['quantitative_record']['display_n']['count_ids'], ['n1', 'n2'])
        self.assertEqual(wrapper['source_preferences']['effects']['hr']['values']['display_n']['n'], 160)
        self.assertEqual(rows['own-n'], before['own-n'])
        self.assertEqual(rows['own-n']['analysis_n']['value'], 9)
        self.assertEqual(wrapper['record'], original)
        _reset(rows['hr'])
        self.assertEqual(rows['hr'], before['hr'])
