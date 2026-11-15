"""Public clones must serve identical result bytes without exposing local files."""
from functools import partial
import gzip
from http.server import ThreadingHTTPServer
import importlib.util
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('public_snapshot_app', Path(__file__).resolve().parents[2] / 'app.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class PublicSnapshotServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.web = self.root / 'web'
        (self.web / 'data').mkdir(parents=True)
        self.addCleanup(patch.stopall)
        patch.object(app, 'WEB_ROOT', self.web).start()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(app.ReviewHandler, directory=str(self.web)))
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.url = 'http://127.0.0.1:' + str(self.server.server_port)

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_gzip_returns_exact_original_result_bytes(self):
        original = b'{"HR":0.7,"CI":[0.5,0.9],"N":157}\n'
        (self.web / 'data/result.json.gz').write_bytes(gzip.compress(original, mtime=0))
        with urlopen(self.url + '/data/result.json') as response:
            self.assertEqual(response.headers['Content-Encoding'], 'gzip')
            self.assertIn('application/json', response.headers['Content-Type'])
            self.assertEqual(gzip.decompress(response.read()), original)

    def test_plain_local_snapshot_takes_precedence(self):
        (self.web / 'data/result.json').write_bytes(b'{"current":true}')
        (self.web / 'data/result.json.gz').write_bytes(gzip.compress(b'{"current":false}'))
        with urlopen(self.url + '/data/result.json') as response:
            self.assertIsNone(response.headers['Content-Encoding'])
            self.assertEqual(response.read(), b'{"current":true}')

    def test_compressed_symlink_cannot_expose_files_outside_website(self):
        outside = self.root / 'private.json.gz'
        outside.write_bytes(gzip.compress(b'{"private":true}'))
        (self.web / 'data/result.json.gz').symlink_to(outside)
        with self.assertRaises(HTTPError) as error:
            urlopen(self.url + '/data/result.json')
        self.assertEqual(error.exception.code, 404)


if __name__ == '__main__':
    unittest.main()
