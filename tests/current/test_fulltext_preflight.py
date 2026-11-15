import io
import json
from pathlib import Path
import tempfile
import unittest

from metamelanoma import quantitative as q
from metamelanoma.fulltext_preflight import count_input
from metamelanoma.gateway import GatewaySettings
from metamelanoma.io import atomic_json, verified_json
from test_quantitative_fulltext import fulltext_fixture


class Reply(io.BytesIO):
    status = 200
    def geturl(self):
        return 'https://api.ai.it.cornell.edu/v1/responses/input_tokens'


class FulltextPreflightTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        atomic_json(self.root / 'config/pipeline.json', {'direct_OpenAI_dispatch_enabled': False,
            'endpoint': 'https://api.ai.it.cornell.edu/v1/responses'})
        self.settings = lambda root, **kw: GatewaySettings('fixture-not-a-real-key', 60,
            'https://api.ai.it.cornell.edu/v1')
        self.source, _, _ = fulltext_fixture()
        self.body = q.request_body(self.source)

    def test_exact_count_request_is_not_a_completion_and_reuse_sends_nothing(self):
        calls = []
        def sender(request, **kwargs):
            calls.append(request.full_url)
            self.assertEqual(json.loads(request.data), self.body)
            return Reply(b'{"object":"response.input_tokens","input_tokens":12345}')
        ref = count_input(self.root, '123', self.body, sender=sender, settings_loader=self.settings)
        proof = verified_json(self.root, ref)
        self.assertEqual(proof['input_tokens'], 12345)
        self.assertEqual(proof['completion_requests'], 0)
        self.assertEqual(count_input(self.root, '123', self.body, sender=sender,
            settings_loader=self.settings), ref)
        self.assertEqual(calls, ['https://api.ai.it.cornell.edu/v1/responses/input_tokens'])

    def test_foreign_article_fails_before_network(self):
        def sender(*args, **kwargs): self.fail('Network must not run')
        with self.assertRaises(ValueError):
            count_input(self.root, '999', self.body, sender=sender, settings_loader=self.settings)

    def test_redirect_is_refused(self):
        class Redirect(Reply):
            def geturl(self): return 'https://elsewhere.invalid/input_tokens'
        with self.assertRaisesRegex(ValueError, 'redirect'):
            count_input(self.root, '123', self.body, sender=lambda *a, **k: Redirect(b'{}'),
                settings_loader=self.settings)

    def test_non_count_response_is_not_a_proof(self):
        with self.assertRaisesRegex(ValueError, 'successful input-token count'):
            count_input(self.root, '123', self.body, sender=lambda *a, **k: Reply(b'{"object":"response"}'),
                settings_loader=self.settings)
        self.assertEqual(list(self.root.glob('data/**/proof.json')), [])


if __name__ == '__main__':
    unittest.main()
