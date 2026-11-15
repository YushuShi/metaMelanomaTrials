import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from metamelanoma.evidence_freshness import PUBLIC, project, write


class EvidenceFreshnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.addCleanup(self.temp.cleanup)

    def receipt(self, name, date, *, legacy=False, **changes):
        folder = self.root / ('data/documents/example' if legacy else 'data/sources/requests') / name
        folder.mkdir(parents=True)
        body = folder / 'response.body'
        body.write_bytes(('Original evidence ' + name).encode())
        ref = {'path': str(body.relative_to(self.root)), 'bytes': body.stat().st_size,
               'sha256': hashlib.sha256(body.read_bytes()).hexdigest()}
        if legacy:
            data = {'status': 200, 'retrieved_at': date, **ref, 'document_kind': 'pmc_fulltext',
                    'request': {'report_id': 'report-' + name, 'url': 'https://pmc.ncbi.nlm.nih.gov/articles/example/'}}
        else:
            data = {'status': 200, 'error': None, 'received_at': date, 'body': ref,
                    'kind': 'PMC_fulltext', 'identity': name,
                    'url': 'https://pmc.ncbi.nlm.nih.gov/articles/example/'}
        data.update(changes)
        path = folder / ('saved.receipt.json' if legacy else 'last_success.json')
        path.write_text(json.dumps(data))
        return path, body

    def test_selects_latest_actual_success_across_receipt_shapes_and_timezones(self):
        self.receipt('modern', '2026-11-02T10:00:00+00:00')
        self.receipt('legacy', '2026-11-02T06:00:00-05:00', legacy=True)
        public, audit = project(self.root)
        self.assertEqual(public['last_information_fetch_at'], '2026-11-02T11:00:00+00:00')
        self.assertEqual(audit['source_identity'], 'report-legacy')
        self.assertEqual(audit['eligible_receipt_candidates'], 2)

    def test_failed_cached_identifier_and_export_times_do_not_advance_date(self):
        self.receipt('accepted', '2026-11-02T10:00:00+00:00')
        for name, changes in [('failed', {'status': 503}), ('partial', {'error': 'incomplete body'}),
                              ('cached', {'cache_reused': True}), ('lookup', {'kind': 'PMC_identifier'}),
                              ('landing', {'kind': 'publisher_landing'}),
                              ('export', {'received_at': None, 'as_of': '2027-01-01T00:00:00+00:00'}),
                              ('naive', {'received_at': '2027-01-01T00:00:00'})]:
            self.receipt(name, '2026-12-02T10:00:00+00:00', **changes)
        public, audit = project(self.root)
        self.assertEqual(public['last_information_fetch_at'], '2026-11-02T10:00:00+00:00')
        self.assertEqual(audit['eligible_receipt_candidates'], 1)

    def test_newer_corrupt_body_falls_back_to_verified_source(self):
        self.receipt('accepted', '2026-11-02T10:00:00+00:00')
        _, body = self.receipt('corrupt', '2026-12-02T10:00:00+00:00')
        original = body.read_bytes()
        body.write_bytes(b'X' * len(original))
        public, audit = project(self.root)
        self.assertEqual(public['last_information_fetch_at'], '2026-11-02T10:00:00+00:00')
        self.assertEqual(len(audit['newer_invalid_body_receipts']), 1)
        self.assertIn('hash differs', audit['newer_invalid_body_receipts'][0]['reason'])

    def test_public_output_has_no_local_provenance_and_republishing_keeps_fetch_time(self):
        receipt, body = self.receipt('accepted', '2026-11-02T10:00:00+00:00')
        before = (receipt.read_bytes(), body.read_bytes())
        first = write(self.root, audit_directory='data/audits/test')
        output = (self.root / PUBLIC).read_bytes()
        second = write(self.root, audit_directory='data/audits/test')
        self.assertEqual((self.root / PUBLIC).read_bytes(), output)
        self.assertEqual(first, second)
        public = json.loads(output)
        self.assertEqual(set(public), {'schema_version', 'last_information_fetch_at', 'timestamp_basis', 'scope'})
        self.assertNotIn('data/', output.decode())
        self.assertEqual((receipt.read_bytes(), body.read_bytes()), before)

    def test_missing_receipts_produce_explicit_unknown_not_current_clock(self):
        public, audit = project(self.root)
        self.assertIsNone(public['last_information_fetch_at'])
        self.assertIsNone(audit['source_receipt'])

    def test_unrelated_api_logs_and_body_paths_are_never_selected(self):
        receipt, _ = self.receipt('accepted', '2026-11-02T10:00:00+00:00')
        foreign = self.root / 'data/current/calls/receipt.json'
        foreign.parent.mkdir(parents=True)
        raw = json.loads(receipt.read_text())
        raw['received_at'] = '2027-01-01T00:00:00+00:00'
        foreign.write_text(json.dumps(raw))
        newer, _ = self.receipt('foreignbody', '2027-01-01T00:00:00+00:00')
        raw['body'] = {'path': str(foreign.relative_to(self.root)), 'bytes': foreign.stat().st_size,
                       'sha256': hashlib.sha256(foreign.read_bytes()).hexdigest()}
        newer.write_text(json.dumps(raw))
        public, audit = project(self.root)
        self.assertEqual(public['last_information_fetch_at'], '2026-11-02T10:00:00+00:00')
        self.assertEqual(audit['eligible_receipt_candidates'], 1)


if __name__ == '__main__':
    unittest.main()
