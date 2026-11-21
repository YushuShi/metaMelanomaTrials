from copy import deepcopy
import tempfile
from pathlib import Path
import unittest

from metamelanoma.complementary_publication import _merge_edits, apply
from metamelanoma.fulltext_export import project_fulltext
from metamelanoma.io import atomic_json, canonical, digest, reference
from metamelanoma.screening import catalog_for
from metamelanoma.quantitative_export import selected_n
from test_fulltext_export import export_fixture


class ComplementaryPublicationTests(unittest.TestCase):
    def setUp(self):
        self.original = export_fixture()[2]['validation']['record']
        self.proof = [{'span_id': self.original['study']['evidence'][0], 'quote': 'source'}]

    def finding(self, path, before, after):
        return {'evidence': self.proof, 'edits': [{'field_path': path, 'before': before, 'after': after}]}

    def test_distinct_appends_survive_and_baseline_is_immutable(self):
        baseline = deepcopy(self.original)
        item = lambda ident: dict(self.original['sample_sizes'][0], id=ident)
        first = self.finding('/sample_sizes/-', None, item('new-a'))
        second = self.finding('/sample_sizes/-', None, item('new-b'))
        amended = _merge_edits(self.original, [first, second, first])
        self.assertEqual([row['id'] for row in amended['sample_sizes'][-2:]], ['new-a', 'new-b'])
        self.assertEqual(self.original, baseline)

    def test_distinct_proposals_for_same_field_fail_closed(self):
        label = self.original['populations'][0]['label']
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            _merge_edits(self.original, [self.finding('/populations/0/label', label, 'One'),
                                        self.finding('/populations/0/label', label, 'Other')])
        with self.assertRaisesRegex(ValueError, 'pre-edit'):
            _merge_edits(self.original, [self.finding('/populations/0/label', 'different baseline', 'Other')])

    def test_rejected_denominator_is_not_restored_from_total_n(self):
        row = self.original['effects'][0]
        row['analysis_n'] = 157
        amended = _merge_edits(self.original, [self.finding('/effects/0/analysis_n', 157, 'NA')])
        self.assertEqual(amended['effects'][0]['display_n']['n'], 'NA')
        self.assertEqual(selected_n(amended['effects'][0], amended, collection='effects')[0], 'NA')
        self.assertTrue(amended['sample_sizes'])

    def test_published_notes_use_original_source_and_rebuild_from_baseline(self):
        baseline, ref, result, report = export_fixture()
        payload = project_fulltext(baseline, baseline_ref=ref, phase_id='test', reports=[report], records=[result])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            atomic_json(root/'config/drug_catalog.json', {})
            source = result['source']
            raw = result['validation']['record']
            catalog = catalog_for(source)
            atomic_json(root/'source.json', source)
            target = {'stage': 'R3', 'task_id': result['task_id'], 'record_id': 'R3:task',
                'record_sha256': digest(canonical(raw)), 'source_sha256': raw['source_sha256'],
                'source_ref': reference(root, root/'source.json'), 'record': raw,
                'source_span_ids': [span['span_id'] for span in catalog['spans']]}
            packet = {'pmid': '123', 'targets': [target], 'source_catalog': catalog}
            packet['packet_sha256'] = digest(canonical(packet))
            atomic_json(root/'packet.json', packet)
            span = catalog['spans'][0]
            note = {'pmid': '123', 'stage': 'R3', 'status': 'supplement', 'packet_path': 'packet.json',
                'record_id': target['record_id'], 'source_sha256': target['source_sha256'],
                'baseline_record_sha256': target['record_sha256'], 'finding_id': 'f6', 'edits': [],
                'note': 'Adjusted for age.', 'field': '/study_details',
                'evidence': [{'span_id': span['span_id'], 'quote': 'The model adjusted for age.'}]}
            with self.assertRaisesRegex(ValueError, 'quotation'):
                invalid = {**note, 'evidence': [{'span_id': span['span_id'], 'quote': 'Invented'}]}
                apply(root, deepcopy(payload), {'schema_version': 1, 'findings': [invalid]})
            amended = apply(root, deepcopy(payload), {'schema_version': 1, 'findings': [note]}, archive_baseline=True)
            wrapper = amended['articles'][0]['records'][-1]
            self.assertEqual(wrapper['complementary_notes'][0]['text'], note['note'])
            self.assertEqual(wrapper['record'], raw)
            revised = apply(root, amended, {'schema_version': 1, 'findings': []}, archive_baseline=True)
            self.assertEqual(revised['articles'], payload['articles'])
