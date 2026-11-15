import json
from pathlib import Path
import tempfile
import unittest

from metamelanoma import quantitative as q
from metamelanoma import quantitative_sources as sources
from metamelanoma.io import reference, digest, canonical
from metamelanoma.screening import build_source


class QuantitativeSourceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.citation = {'pmid': '123', 'report_id': 'report-123', 'pmcid': 'PMC123',
                         'doi': '10.1234/trial', 'title': 'Melanoma trial',
                         'abstract': 'Twelve patients with melanoma received nivolumab.'}
        self.main_path = self.root / 'main.xml'
        self.main_path.write_text('<article article-type="research-article"><front><article-meta>'
            '<article-id pub-id-type="pmid">123</article-id><article-id pub-id-type="pmcid">PMC123</article-id>'
            '<article-id pub-id-type="doi">10.1234/trial</article-id><title-group><article-title>Melanoma trial</article-title>'
            '</title-group></article-meta></front><body><sec><title>Results</title>'
            '<p>Twelve patients received nivolumab.</p><table-wrap><table><tr><td>N</td><td>12</td></tr></table>'
            '</table-wrap></sec></body></article>')
        self.raw_ref = reference(self.root, self.main_path)
        self.main = sources.main_document(self.root, self.citation, self.raw_ref)
        r2_source = build_source(self.citation)
        record = q.empty_record(r2_source)
        record['decision'].update(status='retain', reason_code='eligible', reason='Melanoma treatment')
        r2_ref = sources.immutable(self.root, 'r2-sources', r2_source)
        artifact_ref = sources.immutable(self.root, 'r2-records', {'task_id': 'r2-123',
            'source_ref': r2_ref, 'validated': {'valid': True, 'global_errors': [], 'record': record}})
        self.candidate = {'pmid': '123', 'report_id': 'report-123', 'R2_decision': 'retain',
            'R2_task_id': 'r2-123', 'R2_source_sha256': record['source_sha256'], 'R2_artifact_ref': artifact_ref}
        self.route_ref = sources.immutable(self.root, 'routing', {'candidates': [self.candidate]})
        source = build_source(self.citation, 'R3', self.main['blocks'], fulltext_verified=True, upstream_R2=record)
        self.source_ref = sources.immutable(self.root, 'sources', source)
        self.proof = {'pmid': '123', 'report_id': 'report-123', 'R2_artifact_ref': artifact_ref,
            'citation_sha256': digest(canonical(self.citation)),
            'R2_candidate': self.candidate, 'routing_ref': self.route_ref, 'source_ref': self.source_ref,
            'main_raw_ref': self.raw_ref, 'main_identity': self.main['identity'], 'supplement_documents': []}
        self.entry = {'pmid': '123', 'report_id': 'report-123', 'citation': self.citation,
            'R2_artifact_ref': artifact_ref, 'source_ref': self.source_ref,
            'source_proof_ref': sources.immutable(self.root, 'proofs', self.proof)}

    def test_complete_main_and_tables_replay_without_prior_model_facts(self):
        checked = sources.verify_entry(self.root, self.entry)
        self.assertEqual(checked['blocks'], self.main['blocks'])
        self.assertTrue(any(b['document_role'] == 'main_article_table' for b in checked['blocks']))
        self.assertEqual(checked['source']['upstream_R2']['decision']['status'], 'retain')
        self.assertFalse(any(b.get('document_role') == 'model_result' for b in checked['blocks']))

    def test_changed_original_bytes_and_foreign_identity_are_rejected(self):
        self.main_path.write_text(self.main_path.read_text().replace('Twelve', 'Thirteen'))
        with self.assertRaisesRegex(ValueError, 'hash/length'):
            sources.verify_entry(self.root, self.entry)
        with self.assertRaisesRegex(ValueError, 'PMID differs'):
            sources.main_document(self.root, {**self.citation, 'pmid': '999'}, reference(self.root, self.main_path))

    def test_dropped_main_block_is_not_a_complete_source(self):
        source = json.loads((self.root / self.source_ref['path']).read_text())
        source['blocks'] = source['blocks'][:-1]
        entry = {**self.entry, 'source_ref': sources.immutable(self.root, 'sources', source)}
        proof = {**self.proof, 'source_ref': entry['source_ref']}
        entry['source_proof_ref'] = sources.immutable(self.root, 'proofs', proof)
        with self.assertRaisesRegex(ValueError, 'complete checked'):
            sources.verify_entry(self.root, entry)

    def test_old_or_excluded_route_does_not_authorize_R3(self):
        for status in ('exclude', 'unclear'):
            candidate = {**self.candidate, 'R2_decision': status}
            with self.assertRaisesRegex(ValueError, 'does not authorize'):
                sources.compact_r2(self.root, candidate)
        wrong_route = sources.immutable(self.root, 'routing', {'candidates': []})
        proof = {**self.proof, 'routing_ref': wrong_route}
        entry = {**self.entry, 'source_proof_ref': sources.immutable(self.root, 'proofs', proof)}
        with self.assertRaisesRegex(ValueError, 'R2 routing'):
            sources.verify_entry(self.root, entry)

    def test_supplement_requires_attachment_proof_and_intact_original(self):
        extra = self.root / 'appendix.txt'; extra.write_text('Response: 4 of 12 patients.')
        raw = reference(self.root, extra)
        document = {'document_role': 'supplementary_results', 'source_id': 'report-123:supp',
                    'source_path': raw['path'], 'sha256': raw['sha256']}
        block = {'source_id': document['source_id'], 'block_id': 'p1', 'text': extra.read_text(),
                 'document_role': 'supplementary_results', 'planned_only': False}
        main = {'document_role': 'main_article', 'identity_verified': True,
                'source_path': self.raw_ref['path'], 'sha256': self.raw_ref['sha256']}
        row = {'report_id': 'report-123', 'documents': [main, document], 'blocks': [block]}
        index_ref = {'path': 'not-read-during-preparation', 'sha256': 'unused'}
        blocks, documents, gaps = sources.supplements(self.root, self.citation, row, index_ref)
        self.assertEqual(blocks, []); self.assertEqual(documents, []); self.assertEqual(len(gaps), 1)
        document['identity_verified_by_explicit_attachment_relation'] = True
        blocks, documents, gaps = sources.supplements(self.root, self.citation, row, index_ref)
        self.assertEqual(len(blocks), 1); self.assertEqual(len(documents), 1); self.assertFalse(gaps)
        extra.write_text('Response: 8 of 12 patients.')
        blocks, documents, gaps = sources.supplements(self.root, self.citation, row, index_ref)
        self.assertFalse(blocks); self.assertFalse(documents); self.assertIn('integrity', gaps[0]['reason'])


if __name__ == '__main__':
    unittest.main()
