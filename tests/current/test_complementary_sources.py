import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from metamelanoma import complementary_sources as c
from metamelanoma import quantitative as q
from metamelanoma.io import atomic_json, canonical, digest, reference
from metamelanoma.screening import build_source, catalog_for


class ComplementarySourceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.pmids = ['101', '102', '103', '104', '27528584']
        self.sources = {}; self.entries = {}; self.articles = []
        citations = []
        for pmid in self.pmids:
            citation = {'pmid': pmid, 'report_id': 'report-' + pmid,
                        'title': 'Melanoma trial ' + pmid,
                        'abstract': 'Twelve participants.\nFive responses.'}
            citations.append(citation)
            source = build_source(citation)
            record = q.empty_record(source)
            status = 'exclude' if pmid in {'102', '27528584'} else 'unclear' if pmid in {'101', '104'} else 'retain'
            record['decision'].update(status=status, reason_code='eligible', reason='Source decision')
            wrapper = self.wrapper(pmid, 'R2', source, record)
            article = {'pmid': pmid, 'records': [wrapper]}
            # The excluded article has cached full text but must not receive it.
            if pmid in {'101', '102', '103'}:
                full_source = {'pmid': pmid, 'report_id': citation['report_id'], 'stage': 'R3',
                    'main_full_text_verified': True, 'limitations': ['Unreviewed image'],
                    'upstream_R2': record,
                    'blocks': [{'source_id': citation['report_id'] + ':main', 'block_id': 'b1',
                                'text': 'Twelve participants in the main report.', 'document_role': 'main_article'}]}
                self.sources[pmid] = full_source
                self.entries[pmid] = {'pmid': pmid, 'source_ref': self.save('full/' + pmid + '.json', full_source)}
                if pmid != '102':
                    r3 = q.empty_record(full_source)
                    r3['decision'].update(status='retain', reason_code='eligible', reason='Full text resolves eligibility')
                    article['records'].append(self.wrapper(pmid, 'R3', full_source, r3))
            self.articles.append(article)
        cohort = self.save('cohort.json', {'article_pmids': self.pmids})
        pilot = self.save('pilot.json', {'phase_id': 'pilot', 'articles': []})
        self.r2_ref = self.save('r2_plan.json', {'phase_id': 'r2', 'articles': [{'citation': x} for x in citations],
            'continuation': {'pilot_plan_ref': pilot, 'cohort_ref': cohort}})
        corpus = self.save('corpus.json', {'articles': list(self.entries.values())})
        self.r3_ref = self.save('r3_plan.json', {'phase_id': 'r3', 'source_corpus_ref': corpus})
        self.publication_ref = self.save('publication.json', {'authorized_scope_pmids': self.pmids, 'articles': self.articles})
        self.verify_patch = patch.object(c, 'verify_entry', side_effect=self.verify)
        self.verifier = self.verify_patch.start(); self.addCleanup(self.verify_patch.stop)
        self.scope_patch = patch.object(c, 'SCOPE_SIZE', len(self.pmids))
        self.scope_patch.start(); self.addCleanup(self.scope_patch.stop)

    def save(self, path, value):
        atomic_json(self.root / path, value)
        return reference(self.root, path)

    def wrapper(self, pmid, stage, source, record):
        source_ref = self.save('sources/' + pmid + '-' + stage + '.json', source)
        task_id = stage.lower() + '-' + pmid
        artifact = {'pmid': pmid, 'stage': stage, 'task_id': task_id, 'source_ref': source_ref,
                    'validated': {'valid': True, 'record': record}}
        artifact_ref = self.save('artifacts/' + pmid + '-' + stage + '.json', artifact)
        return {'stage': stage, 'task_id': task_id, 'record': record,
                'artifact_ref': artifact_ref, 'review_origin': 'model_extraction', 'issues': []}

    def verify(self, root, entry):
        return {'source': self.sources[entry['pmid']]}

    def inventory(self, **kwargs):
        return c.build_inventory(self.root, self.publication_ref, self.r2_ref, self.r3_ref, **kwargs)

    def test_frozen_scope_and_deterministic_read_only_preparation(self):
        before = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        first = self.inventory(); second = self.inventory()
        self.assertEqual(first, second)
        self.assertEqual(first['counts'], {'ready': 4, 'hold': 1, 'total': 5,
                                          'full_text': 2, 'abstract_only': 2, 'latest_stage_unclear': 1})
        self.assertEqual(before, {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()})
        with patch.object(c, 'SCOPE_SIZE', 2538), self.assertRaisesRegex(ValueError, 'exactly 2538'):
            self.inventory()

    def test_latest_decision_priority_ignores_resolved_unclear_and_trivial_flags(self):
        inventory = self.inventory()
        self.assertEqual(inventory['articles'][0]['pmid'], '104')
        row = next(r for r in inventory['articles'] if r['pmid'] == '101')
        self.assertNotIn('latest_stage_unclear', row['priority']['reasons'])
        wrappers = json.loads(json.dumps(self.articles[0]['records']))
        wrappers[0]['issues'] = [{'code': 'source_number_not_supported:No same-value, same-unit, same-role source literal'}]
        self.assertNotIn('substantive_difference_to_verify', c.priority_for(wrappers)['reasons'])
        wrappers[0]['issues'].append({'code': 'CONFLICTING_same_scope_counts', 'section': 'sample_sizes'})
        self.assertIn('substantive_difference_to_verify', c.priority_for(wrappers)['reasons'])

    def test_original_abstract_and_fulltext_spans_preserved_without_gpt_as_source(self):
        inventory = self.inventory(); packet = c.build_packet(self.root, inventory, '101')
        self.assertEqual(len(packet['source']['blocks']), 3)
        self.assertEqual(len(packet['source_catalog']['spans']), 4)
        self.assertEqual(len(packet['targets']), 2)
        self.assertNotIn('upstream_R2', packet['source'])
        self.assertEqual(packet['source']['limitations'], ['Unreviewed image'])
        r2 = packet['targets'][0]
        source = json.loads((self.root / r2['source_ref']['path']).read_bytes())
        self.assertEqual(r2['source_span_ids'], [s['span_id'] for s in catalog_for(source)['spans']])
        available = {s['span_id'] for s in packet['source_catalog']['spans']}
        self.assertTrue(all(set(t['source_span_ids']) <= available for t in packet['targets']))
        self.assertEqual(packet['packet_sha256'], digest(canonical({k:v for k,v in packet.items() if k != 'packet_sha256'})))
        self.assertEqual(packet, c.build_packet(self.root, inventory, '101'))

    def test_r2_exclusion_only_gets_abstract_despite_cached_fulltext(self):
        inventory = self.inventory(); packet = c.build_packet(self.root, inventory, '102')
        self.assertEqual(packet['review_mode'], 'abstract_only')
        self.assertTrue(packet['full_text_after_overturn_only'])
        self.assertFalse(packet['source']['main_full_text_verified'])
        self.assertTrue(all(t['stage'] == 'R2' for t in packet['targets']))
        self.assertFalse(any(call.args[1]['pmid'] == '102' for call in self.verifier.call_args_list))

    def test_manual_absence_has_no_packet_or_model_request(self):
        inventory = self.inventory()
        row = next(r for r in inventory['articles'] if r['pmid'] == '27528584')
        self.assertEqual(row['reason'], 'user_confirmed_abstract_unavailable')
        self.assertEqual(row['target_refs'], [])
        with self.assertRaisesRegex(ValueError, 'held'):
            c.build_packet(self.root, inventory, '27528584')

    def test_local_confirmed_absence_is_a_source_disposition_not_technical_failure(self):
        article = next(a for a in self.articles if a['pmid'] == '102')
        wrapper = article['records'][0]
        wrapper['review_origin'] = 'local_primary_source_availability'
        wrapper['record']['decision']['reason_code'] = 'scientific_abstract_unavailable'
        wrapper['source_availability_ref'] = self.save('absence.json', {
            'pmid': '102', 'status': 'confirmed_unavailable', 'checks': []})
        self.publication_ref = self.save('publication.json', {
            'authorized_scope_pmids': self.pmids, 'articles': self.articles})
        inventory = self.inventory()
        row = next(r for r in inventory['articles'] if r['pmid'] == '102')
        self.assertEqual(row['reason'], 'locally_confirmed_abstract_unavailable')
        self.assertEqual(row['review_mode'], 'source_disposition')
        self.assertTrue(row['no_model_request'])
        self.assertEqual(row['target_refs'], [])

    def test_source_change_is_held_and_cannot_silently_fallback(self):
        inventory = self.inventory()
        source = self.root / inventory['articles'][0]['target_refs'][0]['source_ref']['path']
        source.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'reference'):
            c.build_packet(self.root, inventory, inventory['articles'][0]['pmid'])
        inventory = self.inventory()
        self.assertEqual(next(r for r in inventory['articles'] if r['pmid'] == '104')['packet_status'], 'hold')
        self.verifier.side_effect = ValueError('Full-text integrity failed')
        inventory = self.inventory()
        self.assertEqual(next(r for r in inventory['articles'] if r['pmid'] == '101')['reason'], 'Full-text integrity failed')

    def test_bound_context_is_separate_and_not_a_confirmed_error(self):
        correction = self.save('corrections.json', {'reviews': [{'pmid': '101', 'id': 'prior-link-fix'}]})
        queue = self.save('discrepancies.json', {
            'published_value_or_denominator_review': [{'pmid': '102', 'values': '12 versus 13'}],
            'not_a_confirmed_conflict': [{'pmid': '103'}]})
        inventory = self.inventory(correction_refs=[correction], discrepancy_refs=[queue])
        packet = c.build_packet(self.root, inventory, '101')
        self.assertEqual(packet['context']['source_corrections'][0]['review']['id'], 'prior-link-fix')
        self.assertEqual(packet['context']['authority'], 'review_context_not_original_evidence')
        rows = {r['pmid']:r for r in inventory['articles']}
        self.assertEqual(rows['102']['priority']['rank'], 1)
        self.assertNotIn('substantive_difference_to_verify', rows['103']['priority']['reasons'])

    def test_manifest_scope_and_hash_cannot_be_mutated(self):
        inventory = self.inventory()
        inventory['articles'][0]['packet_status'] = 'hold'
        with self.assertRaisesRegex(ValueError, 'inventory differs'):
            c.build_packet(self.root, inventory, '104')
        with self.assertRaisesRegex(ValueError, 'outside'):
            c.build_packet(self.root, self.inventory(), '999')


if __name__ == '__main__':
    unittest.main()
