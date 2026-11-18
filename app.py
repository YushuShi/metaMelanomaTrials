"""Run the metaMelanomaTrials review website locally: python app.py."""
from __future__ import annotations

import argparse
from datetime import timezone
from email.utils import parsedate_to_datetime
import errno
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import subprocess
import sys
from urllib.parse import urlsplit


PROJECT = Path(__file__).resolve().parent
WEB_ROOT = PROJECT / "website" / "dist"
EXPORTER = PROJECT / "website" / "scripts" / "refresh_article_progress.py"


class ReviewHandler(SimpleHTTPRequestHandler):
    """Serve website assets, without exposing the workflow's project files."""

    protocol_version = "HTTP/1.1"  # Reuse local connections across the page's scripts and tables.

    def send_head(self):
        target = Path(self.translate_path(self.path)).resolve()
        paths = [target]
        if target.is_dir():
            paths.extend(target / name for name in ("index.html", "index.htm"))
        try:
            relatives = [path.resolve().relative_to(WEB_ROOT.resolve()) for path in paths]
        except ValueError:
            self.send_error(404, "File not found")
            return None
        if any(part.startswith(".") for relative in relatives for part in relative.parts):
            self.send_error(404, "File not found")
            return None
        # Leave directory redirects/listing rejection to the standard handler.
        if target.is_dir():
            if not urlsplit(self.path).path.endswith("/"):
                return super().send_head()
            target = next((path for path in paths[1:] if path.is_file()), target)
        # Public Git snapshots store large result files with lossless gzip.
        # Browsers decode this response before response.json(), preserving the
        # same URLs and exact scientific payload used by the local workspace.
        compressed = target.with_name(target.name + ".gz")
        encoding = None
        if not target.exists() and target.suffix == ".json" and compressed.is_file():
            try:
                compressed.resolve().relative_to(WEB_ROOT.resolve())
            except ValueError:
                self.send_error(404, "File not found")
                return None
            target = compressed
            encoding = "gzip"
        if not target.is_file():
            return super().send_head()
        try:
            handle = target.open("rb")
        except OSError:
            self.send_error(404, "File not found")
            return None
        stat = os.fstat(handle.fileno())
        # A weak, file-version validator avoids rereading hundreds of megabytes
        # merely to check for updates. Atomic replacement and same-size edits
        # both invalidate it; plain and gzip files have distinct validators.
        etag = 'W/"{:x}-{:x}-{:x}-{:x}"'.format(
            stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns
        )
        validators = [value.strip().removeprefix("W/") for value in self.headers.get("If-None-Match", "").split(",")]
        unchanged = "*" in validators or etag.removeprefix("W/") in validators
        if "If-None-Match" not in self.headers and self.headers.get("If-Modified-Since"):
            try:
                modified_since = parsedate_to_datetime(self.headers["If-Modified-Since"])
                if modified_since.tzinfo is None:
                    modified_since = modified_since.replace(tzinfo=timezone.utc)
                unchanged = int(stat.st_mtime) <= modified_since.timestamp()
            except (TypeError, ValueError, OverflowError):
                pass
        self.send_response(304 if unchanged else 200)
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        if unchanged:
            handle.close()
            self.end_headers()
            return None
        self.send_header("Content-Type", "application/json; charset=utf-8" if encoding else self.guess_type(str(target)))
        if encoding:
            self.send_header("Content-Encoding", encoding)
        self.send_header("Content-Length", str(stat.st_size))
        self.end_headers()
        return handle

    def list_directory(self, path):
        self.send_error(404, "File not found")
        return None

    def end_headers(self):
        # Keep the response on the device, but revalidate before reuse so a
        # monthly evidence publication cannot leave stale scientific results.
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def refresh_snapshot():
    print("Refreshing saved progress while preserving merged source evidence…", flush=True)
    result = subprocess.run(
        [sys.executable, "-B", str(EXPORTER)],
        cwd=PROJECT,
        capture_output=True,
        text=True,
    )
    if result.returncode:
        print("Snapshot refresh failed; the previous saved snapshot will be used.", file=sys.stderr)
        if result.stderr:
            print(result.stderr.rstrip(), file=sys.stderr)
        return False
    print("Saved review snapshot verified. No model or retrieval jobs were started.", flush=True)
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5021, help="Local port (default: 5021)")
    parser.add_argument("--refresh", action="store_true", help="Refresh saved progress while preserving the merged scientific snapshot")
    parser.add_argument("--no-refresh", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if not (WEB_ROOT / "index.html").is_file():
        print("Website files are missing: " + str(WEB_ROOT), file=sys.stderr)
        return 1
    try:
        server = ThreadingHTTPServer(
            ("127.0.0.1", args.port), partial(ReviewHandler, directory=str(WEB_ROOT))
        )
    except OSError as exc:
        if exc.errno == errno.EADDRINUSE:
            print(
                "Port {} is already in use. Choose another port, e.g. python app.py --port 5022".format(args.port),
                file=sys.stderr,
            )
        else:
            print("Could not start the local review server: " + str(exc), file=sys.stderr)
        return 1
    with server:
        if args.refresh and not args.no_refresh:
            refresh_snapshot()
        required = [WEB_ROOT / "data" / name for name in ("summary.json", "studies.json", "analysis.json")]
        if not all(path.is_file() or path.with_name(path.name + ".gz").is_file() for path in required):
            print("The saved website data is incomplete. Run the scoped study exporter before starting the app.", file=sys.stderr)
            return 1
        print("\nmetaMelanomaTrials: http://127.0.0.1:{}".format(args.port), flush=True)
        print("No sign-in required. Press Ctrl+C to stop.\n", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nLocal review server stopped.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
