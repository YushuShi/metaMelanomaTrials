from copy import deepcopy
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest

from metamelanoma import user_dispositions as dispositions
from metamelanoma.fulltext_export import project_fulltext, publish, _check_publication_predecessor
from test_treatment_normalization import RESOURCES
from metamelanoma.io import atomic_json, canonical, reference, verified_json
from test_fulltext_export import export_fixture


class UserDispositionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.pmids = ['27528584', '27743875']
        self.statement = 'I double checked both articles; their abstracts are unavailable. Exclude them in R2.'
        self.baseline, _, self.result, self.report = export_fixture()
        self.baseline['authorized_scope_pmids'] += self.pmids
        self.baseline['source_availability_holds'] = [
            {'pmid': pmid, 'reason': 'A scientific abstract is required for this R2 pilot',
             'status': 'source_or_request_hold'} for pmid in self.pmids]
        self.baseline['scope_kind'] = 'r2_cohort_with_source_holds'
        atomic_json(self.root / 'frozen_r2.json', self.baseline)
        self.baseline_ref = reference(self.root, 'frozen_r2.json')
        self.payload = self.rebuild()
        self.public = self.root / 'website/dist/data/quantitative_extraction.json'
        atomic_json(self.public, self.payload)
        self.database = self.root / 'data/current/articles.sqlite3'
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.database) as db:
            db.execute('CREATE TABLE articles (pmid TEXT PRIMARY KEY, citation_json TEXT NOT NULL)')
            for index, pmid in enumerate(self.pmids):
                citation = {'pmid': pmid, 'report_id': 'report-' + str(index + 1) * 24,
                    'title': 'A melanoma report without an abstract', 'abstract': '', 'year': 2016}
                db.execute('INSERT INTO articles VALUES (?, ?)', (pmid, json.dumps(citation)))

    def rebuild(self):
        return project_fulltext(self.baseline, baseline_ref=self.baseline_ref,
            phase_id='r3-test', reports=[self.report], records=[self.result])

    def register(self):
        return dispositions.register_absence(self.root, self.pmids, self.statement)

    def test_two_user_exclusions_preserve_every_prior_review_and_are_idempotent(self):
        prior = deepcopy(self.payload)
        frozen_bytes = (self.root / 'frozen_r2.json').read_bytes()
        manifest_ref = self.register()
        updated = dispositions.apply(self.root, self.payload)
        self.assertEqual(self.payload, prior)
        self.assertEqual((self.root / 'frozen_r2.json').read_bytes(), frozen_bytes)
        self.assertEqual(updated['articles'][:1], prior['articles'])
        self.assertEqual(updated['clinical_evidence']['articles'][:1], prior['clinical_evidence']['articles'])
        self.assertEqual(updated['fulltext_assessment'], prior['fulltext_assessment'])
        self.assertEqual(updated['about_progress']['stages']['R3'], prior['about_progress']['stages']['R3'])
        counts = updated['about_progress']['stages']['R2']
        self.assertEqual({k: counts[k] for k in ('entered', 'screening_finished', 'retained', 'excluded', 'unclear')},
            {'entered': 3, 'screening_finished': 3, 'retained': 1, 'excluded': 2, 'unclear': 0})
        self.assertEqual(updated['scope_pmids'], ['123', *self.pmids])
        self.assertEqual(updated['source_availability_holds'], [])
        self.assertEqual(updated['scope_kind'], 'complete_r2_cohort')
        self.assertEqual(dispositions.apply(self.root, updated), updated)
        self.assertEqual(self.register(), manifest_ref)

    def test_saved_provenance_is_user_confirmation_without_model_or_clinical_facts(self):
        manifest = verified_json(self.root, self.register())
        confirmation = verified_json(self.root, manifest['confirmation_ref'])
        self.assertEqual(confirmation['user_statement'], self.statement)
        self.assertEqual(confirmation['confirmed_by'], 'user')
        self.assertFalse(confirmation['automated_availability_check_claimed'])
        updated = dispositions.apply(self.root, self.payload)
        for entry_ref in manifest['entry_refs']:
            entry = verified_json(self.root, entry_ref)
            self.assertEqual(entry['review_origin'], dispositions.ORIGIN)
            self.assertIsNone(entry['model'])
            self.assertEqual(entry['model_requests'], 0)
            self.assertEqual(entry['record']['decision']['status'], 'exclude')
            self.assertEqual(entry['record']['decision']['reason_code'], 'scientific_abstract_unavailable')
            self.assertEqual(entry['record']['decision']['evidence'], [])
            for section in ('populations', 'arms', 'sample_sizes', 'effects', 'survival', 'binary'):
                self.assertEqual(entry['record'][section], [])
            article = next(a for a in updated['clinical_evidence']['articles'] if a['pmid'] == entry['pmid'])
            self.assertFalse(article['current_main_eligible'])
            for section in ('quantitative_results', 'sample_size_records', 'comparisons'):
                self.assertEqual(article[section], [])

    def test_nonheld_articles_and_present_abstracts_cannot_be_excluded_by_absence(self):
        for pmids in (['123'], ['999'], [self.pmids[0], self.pmids[0]]):
            with self.subTest(pmids=pmids), self.assertRaises(ValueError):
                dispositions.register_absence(self.root, pmids, self.statement)
        with sqlite3.connect(self.database) as db:
            citation = json.loads(db.execute('SELECT citation_json FROM articles WHERE pmid=?', (self.pmids[0],)).fetchone()[0])
            citation['abstract'] = 'An available scientific abstract.'
            db.execute('UPDATE articles SET citation_json=? WHERE pmid=?', (json.dumps(citation), self.pmids[0]))
        with self.assertRaisesRegex(ValueError, 'available abstract'):
            self.register()
        self.assertFalse((self.root / dispositions.MANIFEST).exists())

    def test_dispositions_survive_rebuilding_from_frozen_r2_and_cannot_be_dropped(self):
        self.register()
        updated = dispositions.apply(self.root, self.payload)
        rebuilt = self.rebuild()
        with self.assertRaisesRegex(ValueError, 'discard confirmed user exclusions'):
            _check_publication_predecessor(canonical(updated), rebuilt)
        restored = dispositions.apply(self.root, rebuilt)
        _check_publication_predecessor(canonical(updated), restored)
        self.assertEqual(restored['articles'], updated['articles'])
        self.assertEqual(restored['about_progress']['stages'], updated['about_progress']['stages'])
        self.assertEqual(restored['fulltext_assessment'], updated['fulltext_assessment'])
        partial = deepcopy(restored)
        partial['user_R2_dispositions']['entry_refs'].pop()
        with self.assertRaises(ValueError):
            dispositions.check_preserved(updated, partial)

    def test_unrelated_cohorts_are_unchanged_and_existing_reviews_cannot_be_overwritten(self):
        self.register()
        unrelated = deepcopy(self.payload)
        unrelated['authorized_scope_pmids'].append('999')
        self.assertEqual(dispositions.apply(self.root, unrelated), unrelated)
        conflict = deepcopy(self.payload)
        conflict['articles'].append({'pmid': self.pmids[0], 'records': []})
        with self.assertRaisesRegex(ValueError, 'replace an existing R2 decision'):
            dispositions.apply(self.root, conflict)
        missing_hold = deepcopy(self.payload)
        missing_hold['source_availability_holds'] = []
        with self.assertRaisesRegex(ValueError, 'current unresolved source hold'):
            dispositions.apply(self.root, missing_hold)

    def test_fulltext_publication_reapplies_overlay_and_passes_browser_contract(self):
        self.register()
        repo = Path(__file__).resolve().parents[2]
        for rel in RESOURCES:
            destination = self.root / rel
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(repo / rel, destination)
        receipt = publish(self.root, self.rebuild())
        self.assertEqual(receipt['new_model_requests'], 0)
        self.assertEqual(receipt['counts']['R2']['excluded'], 2)
        first = json.loads(self.public.read_text())
        self.assertEqual(first['fulltext_assessment'], self.payload['fulltext_assessment'])
        receipt2 = publish(self.root, self.rebuild())
        second = json.loads(self.public.read_text())
        self.assertEqual(first['articles'], second['articles'])
        self.assertEqual(first['clinical_evidence']['articles'], second['clinical_evidence']['articles'])
        self.assertEqual(receipt2['counts'], receipt['counts'])


if __name__ == '__main__':
    unittest.main()
