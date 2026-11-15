import json
from pathlib import Path
import tempfile
import unittest

from metamelanoma.gateway import GatewaySettings, GatewayTransport, load_settings
from test_runtime import completed, task, Response


URL = 'https://fixture.cornell.edu/v1/responses'


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve() / 'project'; self.root.mkdir()
        self.calls = []

    def transport(self, value=None, endpoint=URL):
        def sender(request, **kwargs):
            self.calls.append(request)
            response = Response(value or completed(), headers={'x-litellm-response-cost': '0.001', 'x-request-id': 'gateway-request'})
            response.geturl = lambda: URL
            return response
        return GatewayTransport(root=self.root, expected_endpoint=endpoint, sender=sender,
                                settings_loader=lambda *a, **k: GatewaySettings('fixture-private-key', 60, 'https://fixture.cornell.edu'))

    def test_owner_only_existing_config_is_read_without_environment_override(self):
        folder = self.root.parent / 'MetaVir'; folder.mkdir(); path = folder / 'mykey.env'
        path.write_text('CORNELL_API_KEY=fixture-private-key\nAPI_BASE_URI=https://fixture.cornell.edu\n'); path.chmod(0o700)
        settings = load_settings(self.root)
        self.assertEqual(settings.responses_url, URL)
        self.assertNotIn(settings.api_key, repr(settings)); self.assertNotIn(settings.base_url, repr(settings))
        path.chmod(0o644)
        with self.assertRaises(PermissionError): load_settings(self.root)

    def test_external_origin_and_route_overrides_are_rejected(self):
        for base in ['http://fixture.cornell.edu', 'https://cornell.edu.evil.example',
                     'https://fixture.cornell.edu/other', 'https://key@fixture.cornell.edu',
                     'https://fixture.cornell.edu?secret=x']:
            with self.subTest(base=base), self.assertRaises(ValueError):
                GatewaySettings('fixture-private-key', 60, base).responses_url

    def test_credential_parent_alias_is_rejected_before_reading(self):
        outside = self.root.parent/'other'; outside.mkdir()
        path = outside/'mykey.env'; path.write_text('CORNELL_API_KEY=fixture-private-key\nAPI_BASE_URI=https://fixture.cornell.edu\n'); path.chmod(0o600)
        (self.root.parent/'MetaVir').symlink_to(outside, target_is_directory=True)
        with self.assertRaises(PermissionError): load_settings(self.root)

    def test_default_gateway_response_preserves_cost_and_provider_provenance(self):
        value = completed(); value.pop('service_tier')
        out = self.transport(value).send(task(), 'cornell-fixture-a1', 'calls/one')
        self.assertEqual(out['status'], 'completed'); self.assertEqual(out['provider'], 'cornell_openai_gateway')
        self.assertEqual(out['headers']['x-litellm-response-cost'], '0.001')
        self.assertEqual(self.calls[0].full_url, URL)
        request = json.loads((self.root/out['artifacts']['request']['path']).read_bytes())
        self.assertEqual(request['provider'], 'cornell_openai_gateway'); self.assertEqual(request['body']['reasoning'], {'effort':'high'})
        for path in (self.root/'calls/one').iterdir(): self.assertNotIn(b'fixture-private-key', path.read_bytes())

    def test_wrong_model_tier_and_reasoning_stay_held(self):
        for i, changes in enumerate([{'model':'wrong-model'}, {'service_tier':'flex'}, {'reasoning':{'effort':'low'}}]):
            value = completed(); value.update(changes)
            out = self.transport(value).send(task(), f'cornell-fixture-{i}', f'calls/{i}')
            self.assertEqual(out['status'], 'provider_problem'); self.assertIsNone(out['payload'])

    def test_changed_gateway_endpoint_fails_before_transmission(self):
        with self.assertRaises(ValueError):
            self.transport(endpoint='https://other.cornell.edu/v1/responses').send(task(), 'cornell-fixture-a1', 'calls/one')
        self.assertEqual(self.calls, [])

    def test_flex_is_rejected_before_loading_credentials_or_transmission(self):
        def forbidden(*args, **kwargs): self.fail('Credential loader or sender was called')
        transport = GatewayTransport(root=self.root, expected_endpoint=URL, sender=forbidden, settings_loader=forbidden)
        value = task(); value['body']['service_tier'] = 'flex'
        with self.assertRaises(ValueError): transport.send(value, 'cornell-fixture-a1', 'calls/one')


if __name__ == '__main__': unittest.main()
