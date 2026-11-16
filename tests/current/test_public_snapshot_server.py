"""Public clones must serve identical result bytes without exposing local files."""
from functools import partial
import gzip
from http.server import ThreadingHTTPServer
import importlib.util
import os
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
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

    def test_plain_snapshot_revalidation_returns_304_without_body(self):
        (self.web / 'data/result.json').write_bytes(b'{"current":true}')
        with urlopen(self.url + '/data/result.json') as response:
            etag = response.headers['ETag']
            self.assertTrue(etag)
            self.assertEqual(response.headers['Cache-Control'], 'no-cache')
            self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
        request = Request(self.url + '/data/result.json', headers={'If-None-Match': etag})
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code, 304)
        self.assertEqual(error.exception.headers['ETag'], etag)
        self.assertEqual(error.exception.read(), b'')

    def test_same_size_changed_snapshot_invalidates_prior_validator(self):
        path = self.web / 'data/result.json'
        path.write_bytes(b'{"N":21}')
        with urlopen(self.url + '/data/result.json') as response:
            previous = response.headers['ETag']
        stat = path.stat()
        path.write_bytes(b'{"N":22}')
        os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
        request = Request(self.url + '/data/result.json', headers={'If-None-Match': previous})
        with urlopen(request) as response:
            self.assertEqual(response.status, 200)
            self.assertNotEqual(response.headers['ETag'], previous)
            self.assertEqual(response.read(), b'{"N":22}')

    def test_compressed_snapshot_revalidates_and_updates(self):
        path = self.web / 'data/result.json.gz'
        path.write_bytes(gzip.compress(b'{"N":21}', mtime=0))
        with urlopen(self.url + '/data/result.json') as response:
            previous = response.headers['ETag']
            self.assertTrue(response.headers['Last-Modified'])
        request = Request(self.url + '/data/result.json', headers={'If-None-Match': '"unrelated", ' + previous})
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code, 304)
        self.assertEqual(error.exception.read(), b'')
        replacement = path.with_suffix('.next')
        replacement.write_bytes(gzip.compress(b'{"N":22}', mtime=0))
        replacement.replace(path)
        with urlopen(request) as response:
            self.assertEqual(response.status, 200)
            self.assertNotEqual(response.headers['ETag'], previous)
            self.assertEqual(gzip.decompress(response.read()), b'{"N":22}')

    def test_etag_takes_precedence_over_modified_since(self):
        (self.web / 'data/result.json').write_bytes(b'{"N":21}')
        with urlopen(self.url + '/data/result.json') as response:
            modified = response.headers['Last-Modified']
        request = Request(self.url + '/data/result.json', headers={'If-Modified-Since': modified})
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code, 304)
        request = Request(self.url + '/data/result.json', headers={'If-None-Match': '"stale"', 'If-Modified-Since': modified})
        with urlopen(request) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), b'{"N":21}')


if __name__ == '__main__':
    unittest.main()
