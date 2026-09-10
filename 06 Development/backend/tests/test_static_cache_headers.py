"""Exercise the actual target Nginx config using disposable static roots only."""
import http.client
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest

NGINX = os.environ.get("BALI_TEST_NGINX_BIN")
CONFIG = Path(__file__).resolve().parents[2] / "deploy/nginx/safr-target-production.conf"

@unittest.skipUnless(NGINX, "Set BALI_TEST_NGINX_BIN for isolated real Nginx")
class StaticCacheHeadersTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="safr-cache-test-")
        root = Path(cls.tmp.name)
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            cls.port = s.getsockname()[1]
        astro, app = root / "astro", root / "app"
        fixtures = {
            astro: ["index.html", "404.html", "sitemap.xml", "_astro/entry.abcd.js", "og/test.png"],
            app: ["index.html", "account/index.html", "sw.js", "build-version.json", "offline.html",
                  "manifest.webmanifest", "assets/pwa/icon.svg", "assets/main-abc123.js", "assets/heroes/photo.jpg"],
        }
        for directory, paths in fixtures.items():
            for name in paths:
                path = directory / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("public-test-fixture")
        candidate = CONFIG.read_text().replace("127.0.0.1:8081", "127.0.0.1:" + str(cls.port))
        candidate = candidate.replace("/var/www/safr/astro-site", str(astro)).replace("/var/www/safr/react-app", str(app))
        # No real backend connections are needed or allowed by these static tests.
        candidate = candidate.replace("127.0.0.1:8000", "127.0.0.1:9")
        cls.config = root / "nginx.conf"
        cls.config.write_text("pid " + str(root / "nginx.pid") + ";\nerror_log stderr error;\n"
                              "events {}\nhttp { access_log off; " + candidate + "\n}\n")
        subprocess.run([NGINX, "-t", "-c", str(cls.config), "-p", str(root)], check=True, capture_output=True)
        cls.process = subprocess.Popen([NGINX, "-c", str(cls.config), "-p", str(root), "-g", "daemon off;"],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", cls.port), timeout=.1):
                    break
            except OSError:
                time.sleep(.02)
        else:
            cls.process.terminate()
            raise AssertionError("Isolated nginx did not start")

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.tmp.cleanup()

    def response(self, host, path):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.request("GET", path, headers={"Host": host})
            response = connection.getresponse()
            response.read()
            return response.status, dict(response.getheaders())
        finally:
            connection.close()

    def test_static_assets_keep_security_headers_and_only_fingerprints_are_immutable(self):
        for host, path, policy in [
            ("safrway.online", "/_astro/entry.abcd.js", "immutable"),
            ("safrway.online", "/og/test.png", "max-age=3600"),
            ("safrway.online", "/sitemap.xml", "no-cache"),
            ("app.safrway.online", "/assets/main-abc123.js", "immutable"),
            ("app.safrway.online", "/assets/heroes/photo.jpg", "max-age=3600"),
            ("app.safrway.online", "/assets/pwa/icon.svg", "must-revalidate"),
            ("app.safrway.online", "/offline.html", "public, max-age=0"),
            ("app.safrway.online", "/manifest.webmanifest", "public, max-age=0"),
        ]:
            with self.subTest(host=host, path=path):
                status, headers = self.response(host, path)
                self.assertEqual(status, 200)
                self.assertIn(policy, headers["Cache-Control"])
                self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
                self.assertIn("default-src 'self'", headers["Content-Security-Policy"])
                self.assertIn("Permissions-Policy", headers)

    def test_private_html_control_files_and_error_assets_cannot_be_cached(self):
        for path in ["/account/", "/", "/sw.js", "/build-version.json", "/assets/missing-hash.js", "/api/web/auth/me"]:
            with self.subTest(path=path):
                _, headers = self.response("app.safrway.online", path)
                self.assertIn("no-store", headers["Cache-Control"])
                self.assertIn("noindex", headers["X-Robots-Tag"])
                self.assertIn("Content-Security-Policy", headers)
