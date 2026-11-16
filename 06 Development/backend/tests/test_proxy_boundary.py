"""Canonical proxy contracts plus an opt-in disposable Nginx -> Uvicorn stack.

Set BALI_TEST_NGINX_BIN to an Nginx executable built with http_realip_module.
No project application, settings, credentials, database, or production listener
is loaded. Only temporary files and randomly allocated loopback ports are used.
"""
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import time
import unittest

import httpx
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware


CONFIG = Path(os.environ.get(
    "BALI_TEST_PROXY_CONFIG",
    str(Path(__file__).resolve().parents[2] / "deploy/nginx/safr-target-production.conf"),
))
ADMIN_DOCUMENT_UPLOAD = "~ ^/api/web/admin/visa-cases/[0-9]+/documents/upload$"
AGENT_DOCUMENT_UPLOAD = "~ ^/api/visa-agent/cases/[0-9]+/issued-document$"
API_DEFAULT_PROXY = "~ ^/(?:mini-app(?:/|$)|api/(?:web|catalog|analytics)(?:/|$)|health$|db/health$)"
AGENT_CASE_READ = "~ ^/api/visa-agent/cases/[0-9]+$"
AGENT_JSON_WRITE = "~ ^/api/visa-agent/(?:submissions|processes/[0-9]+/observations)$"
API_PROBE = "/api/catalog/boundary-probe"
NESTED_PROXY_PARENTS = {ADMIN_DOCUMENT_UPLOAD: "^~ /api/web/"}
DOCUMENT_UPLOAD_PATHS = {
    ADMIN_DOCUMENT_UPLOAD: "/api/web/admin/visa-cases/42/documents/upload",
    AGENT_DOCUMENT_UPLOAD: "/api/visa-agent/cases/42/issued-document",
}
PROXY_PROBES = {
    "= /api/web/chat/guest/messages": ("/api/web/chat/guest/messages", "POST"),
    ADMIN_DOCUMENT_UPLOAD: (DOCUMENT_UPLOAD_PATHS[ADMIN_DOCUMENT_UPLOAD], "POST"),
    AGENT_DOCUMENT_UPLOAD: (DOCUMENT_UPLOAD_PATHS[AGENT_DOCUMENT_UPLOAD], "POST"),
    API_DEFAULT_PROXY: (API_PROBE, "GET"),
    AGENT_CASE_READ: ("/api/visa-agent/cases/42", "GET"),
    AGENT_JSON_WRITE: ("/api/visa-agent/submissions", "POST"),
}
EXPECTED_ROUTES = {
    "safrway.online": {
        "= /account", "= /account/", "= /api/web/auth/me", "= /api/web/auth/start",
        "= /api/web/account-redirect", "= /api/web/chat/guest", "= /api/web/chat/guest/session",
        "= /api/web/chat/guest/messages", "^~ /api/catalog/",
    },
    "app.safrway.online": {"^~ /mini-app/", "^~ /api/web/", "^~ /api/catalog/", ADMIN_DOCUMENT_UPLOAD},
    "api.safrway.online": {API_DEFAULT_PROXY, AGENT_DOCUMENT_UPLOAD, AGENT_CASE_READ, AGENT_JSON_WRITE},
}
TRUST_DIRECTIVES = (
    "set_real_ip_from 127.0.0.1;", "real_ip_header CF-Connecting-IP;",
    "real_ip_recursive off;",
)
FORWARD_HEADERS = (
    "proxy_set_header Host $host;", "proxy_set_header X-Real-IP $remote_addr;",
    "proxy_set_header X-Forwarded-For $remote_addr;", "proxy_set_header X-Forwarded-Proto https;",
)


def blocks(text, kind):
    """Read complete named blocks from this canonical, line-oriented config."""
    pattern = re.compile(r"^\s*" + re.escape(kind) + r"\s*([^\n{]*)\{\s*$", re.MULTILINE)
    for match in pattern.finditer(text):
        depth = 1
        for line in re.finditer(r"^.*$", text[match.end():], re.MULTILINE):
            stripped = line.group().strip()
            if stripped.endswith("{") and not stripped.startswith("#"):
                depth += 1
            elif stripped == "}":
                depth -= 1
                if depth == 0:
                    yield match.group(1).strip(), text[match.end():match.end() + line.start()]
                    break
        else:
            raise AssertionError("Unclosed canonical configuration block")


def canonical_servers():
    result = {}
    for _, server in blocks(CONFIG.read_text(), "server"):
        name = re.search(r"^\s*server_name\s+([^;]+);", server, re.MULTILINE).group(1)
        locations = {
            selector: body for selector, body in blocks(server, "location")
            if "proxy_pass http://127.0.0.1:8000" in body
        }
        if locations:
            # Trust directives must be at server scope, before any location.
            preamble = re.split(r"^\s*location\s", server, maxsplit=1, flags=re.MULTILINE)[0]
            result[name] = (preamble, locations)
    return result


async def echo_app(scope, receive, send):
    received_bytes = 0
    while True:
        event = await receive()
        if event["type"] == "http.disconnect":
            return
        received_bytes += len(event.get("body", b""))
        if not event.get("more_body", False):
            break
    body = json.dumps({
        "client": scope["client"][0], "scheme": scope["scheme"], "path": scope["path"],
        "headers": {key.decode(): value.decode() for key, value in scope["headers"]},
        "bodyBytes": received_bytes,
    }).encode()
    await send({"type": "http.response.start", "status": 200,
                "headers": [(b"content-type", b"application/json")]})
    await send({"type": "http.response.body", "body": body})


class ProxyConfigurationTests(unittest.TestCase):
    def test_guest_paths_are_exact_private_and_method_bounded(self):
        _, routes = canonical_servers()["safrway.online"]
        for endpoint, methods in (("session", "GET POST DELETE"), ("messages", "POST")):
            body = routes["= /api/web/chat/guest/" + endpoint]
            self.assertIn("limit_except " + methods + " {", body)
            self.assertIn("deny all;", body)
            self.assertIn('add_header Cache-Control "private, no-store" always;', body)
            self.assertIn('add_header X-Content-Type-Options "nosniff" always;', body)
            self.assertIn("add_header Content-Security-Policy", body)

    def test_all_canonical_proxy_servers_keep_exact_loopback_trust(self):
        servers = canonical_servers()
        self.assertEqual(set(servers), set(EXPECTED_ROUTES))
        for name, (preamble, locations) in servers.items():
            with self.subTest(server=name):
                self.assertEqual(set(locations), EXPECTED_ROUTES[name])
                self.assertEqual(re.findall(r"\blisten\s+([^;]+);", preamble), ["127.0.0.1:8081"])
                self.assertEqual(re.findall(r"\bset_real_ip_from\s+([^;]+);", preamble), ["127.0.0.1"])
                for directive in TRUST_DIRECTIVES:
                    self.assertIn(directive, preamble)

    def test_every_canonical_proxy_location_overwrites_forwarded_headers(self):
        total = 0
        for name, (preamble, locations) in canonical_servers().items():
            for selector, body in locations.items():
                total += 1
                with self.subTest(server=name, location=selector):
                    if "proxy_set_header " not in body:
                        body = locations.get(NESTED_PROXY_PARENTS.get(selector), preamble)
                    for directive in FORWARD_HEADERS:
                        self.assertIn(directive, body)
                    self.assertNotIn("$proxy_add_x_forwarded_for", body)
                    for header in ("Host", "X-Real-IP", "X-Forwarded-For", "X-Forwarded-Proto"):
                        self.assertEqual(len(re.findall(r"proxy_set_header\s+" + header + r"\s", body)), 1)
        self.assertEqual(total, 17)

    def test_agent_json_routes_keep_host_budget_and_deny_unlisted_paths(self):
        server, = (body for _, body in blocks(CONFIG.read_text(), "server")
                   if "server_name api.safrway.online;" in body)
        self.assertRegex(server, r"(?ms)^    location / \{\s*return 404;\s*^    \}")
        preamble, locations = canonical_servers()["api.safrway.online"]
        self.assertIn("limit_req zone=safr_application_api burst=20 nodelay;", preamble)
        self.assertIn("client_max_body_size 1m;", preamble)
        self.assertIn("proxy_read_timeout 30s;", preamble)
        for selector, method in ((AGENT_CASE_READ, "GET"), (AGENT_JSON_WRITE, "POST")):
            route = locations[selector]
            self.assertIn(f"limit_except {method} {{ deny all; }}", route)
            self.assertIn("proxy_hide_header Cache-Control;", route)
            self.assertIn('add_header Cache-Control "private, no-store" always;', route)
            for directive in ("client_max_body_size", "proxy_read_timeout", "limit_req "):
                self.assertNotIn(directive, route)

    def test_upload_limits_are_scoped_to_the_protected_document_path(self):
        _, locations = canonical_servers()["app.safrway.online"]
        parent = locations["^~ /api/web/"].split("location ~", maxsplit=1)[0]
        upload = locations[ADMIN_DOCUMENT_UPLOAD]
        self.assertIn("client_max_body_size 1m;", parent)
        self.assertIn("proxy_read_timeout 30s;", parent)
        self.assertIn("client_max_body_size 10m;", upload)
        self.assertIn("proxy_read_timeout 95s;", upload)
        _, api_locations = canonical_servers()["api.safrway.online"]
        agent = api_locations[AGENT_DOCUMENT_UPLOAD]
        self.assertIn("client_max_body_size 10m;", agent)
        self.assertIn("proxy_read_timeout 95s;", agent)
        self.assertIn('add_header Cache-Control "private, no-store" always;', agent)


class UvicornTrustTests(unittest.IsolatedAsyncioTestCase):
    async def test_untrusted_socket_peer_cannot_override_client_or_scheme(self):
        app = ProxyHeadersMiddleware(echo_app, trusted_hosts="127.0.0.1")
        transport = httpx.ASGITransport(app=app, client=("192.0.2.60", 1234))
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/", headers={
                "X-Forwarded-For": "203.0.113.77", "X-Forwarded-Proto": "https",
                "CF-Connecting-IP": "203.0.113.88",
            })
        self.assertEqual(response.json()["client"], "192.0.2.60")
        self.assertEqual(response.json()["scheme"], "http")


@unittest.skipUnless(os.environ.get("BALI_TEST_NGINX_BIN"), "Set BALI_TEST_NGINX_BIN for real proxy integration")
class RealProxyBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="safr-proxy-boundary-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.root = Path(cls.temp.name)
        cls.processes = []
        cls.addClassCleanup(cls.stop_processes)
        cls.backend_port = cls.free_port()
        cls.nginx_port = cls.free_port()
        while cls.nginx_port == cls.backend_port:
            cls.nginx_port = cls.free_port()
        # The child imports only this generated tiny ASGI app, never app.main.
        import inspect
        (cls.root / "boundary_echo.py").write_text("import json\n" + inspect.getsource(echo_app))
        cls.environment = {"PATH": os.defpath, "PYTHONDONTWRITEBYTECODE": "1"}
        cls.start_process([
            sys.executable, "-m", "uvicorn", "boundary_echo:echo_app",
            "--app-dir", str(cls.root), "--host", "127.0.0.1", "--port", str(cls.backend_port),
            "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1", "--lifespan", "off",
            "--no-access-log", "--log-level", "warning",
        ], "uvicorn")
        cls.wait_ready(cls.backend_port, "localhost")

        source = CONFIG.read_text()
        zone_lines = re.findall(r"^limit_req_zone\s+[^;]+;", source, re.MULTILINE)
        if len(zone_lines) != 2 or any("$binary_remote_addr" not in zone for zone in zone_lines):
            raise AssertionError("Canonical limit zones must use restored binary remote address")
        servers = []
        for name, (preamble, locations) in canonical_servers().items():
            for directive in TRUST_DIRECTIVES:
                if directive not in preamble:
                    raise AssertionError("Missing canonical trust directive: " + directive)
            prefixes = ("set_real_ip_from ", "real_ip_header ", "real_ip_recursive ")
            if name == "api.safrway.online":
                prefixes += ("client_max_body_size ", "limit_req ", "proxy_connect_timeout ",
                             "proxy_read_timeout ", "proxy_http_version ", "proxy_set_header ")
            server_directives = "\n".join(line.strip() for line in preamble.splitlines()
                                          if line.strip().startswith(prefixes))
            rendered = []
            for selector, body in locations.items():
                if selector in NESTED_PROXY_PARENTS:
                    continue  # Already included in its canonical parent block.
                rendered.append("location " + selector + " {\n" + body.replace(
                    "http://127.0.0.1:8000", f"http://127.0.0.1:{cls.backend_port}") + "\n}")
            # A deterministic 1/min budget verifies real-IP key isolation quickly.
            # Its key is taken from canonical production limiter definitions.
            if name == "api.safrway.online":
                rendered.append("location / { return 404; }")
                rendered.append("location = /_boundary/budget {\n"
                                "limit_req zone=boundary_budget burst=1 nodelay;\n" +
                                "\n".join(FORWARD_HEADERS) +
                                f"\nproxy_pass http://127.0.0.1:{cls.backend_port};\n}}")
            servers.append(f"server {{\nlisten 127.0.0.1:{cls.nginx_port};\nserver_name {name};\n" +
                           server_directives + "\n" + "\n".join(rendered) + "\n}")
        limiter_key = zone_lines[0].split()[1]
        conf = (
            f"pid {cls.root}/nginx.pid;\nerror_log {cls.root}/nginx-error.log warn;\n"
            "daemon off;\nmaster_process off;\nevents { worker_connections 128; }\nhttp {\n"
            f"access_log off;\nclient_body_temp_path {cls.root}/body;\nproxy_temp_path {cls.root}/proxy;\n"
            + "\n".join(zone_lines) + f"\nlimit_req_zone {limiter_key} zone=boundary_budget:1m rate=1r/m;\n"
            + "\n".join(servers) + "\n}\n"
        )
        cls.conf_path = cls.root / "nginx.conf"
        cls.conf_path.write_text(conf)
        binary = str(Path(os.environ["BALI_TEST_NGINX_BIN"]).resolve())
        command = [binary, "-p", str(cls.root) + "/", "-c", str(cls.conf_path),
                   "-e", str(cls.root / "nginx-error.log")]
        syntax = subprocess.run(command + ["-t"], cwd=cls.root, env=cls.environment,
                                capture_output=True, text=True, timeout=10)
        if syntax.returncode:
            raise AssertionError("Isolated nginx -t failed: " + syntax.stderr)
        cls.start_process(command, "nginx")
        cls.wait_ready(cls.nginx_port, "api.safrway.online", API_PROBE)

    @staticmethod
    def free_port():
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]

    @classmethod
    def start_process(cls, command, name):
        log = (cls.root / (name + ".log")).open("wb")
        try:
            cls.processes.append(subprocess.Popen(command, cwd=cls.root, env=cls.environment,
                                                  stdout=log, stderr=subprocess.STDOUT))
        finally:
            log.close()

    @classmethod
    def stop_processes(cls):
        for process in reversed(cls.processes):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)

    @classmethod
    def wait_ready(cls, port, host, path="/_boundary/ready"):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if any(process.poll() is not None for process in cls.processes):
                logs = "\n".join(path.read_text() for path in cls.root.glob("*.log"))
                raise AssertionError("Isolated proxy process exited: " + logs)
            try:
                if cls.request(port, host, path)[0] == 200:
                    return
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(.05)
        raise AssertionError("Isolated proxy did not become ready within 10 seconds")

    @staticmethod
    def request(port, host, path, headers=None, *, method="GET", payload=None, include_headers=False):
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
        try:
            connection.request(method, path, body=payload, headers={"Host": host, **(headers or {})})
            response = connection.getresponse()
            body = response.read()
            result = (response.status, json.loads(body) if response.status == 200 else body.decode())
            return (*result, {key.lower(): value for key, value in response.getheaders()}) if include_headers else result
        finally:
            connection.close()

    def test_every_production_proxy_location_passes_resolved_identity(self):
        ordinal = 0
        for host, (_, locations) in canonical_servers().items():
            for selector in locations:
                ordinal += 1
                if selector in PROXY_PROBES:
                    path, method = PROXY_PROBES[selector]
                else:
                    path, method = selector.removeprefix("= ").removeprefix("^~ "), "GET"
                    if not selector.startswith("="):
                        path += "boundary-probe"
                address = f"192.0.2.{ordinal}"
                with self.subTest(host=host, location=selector):
                    status, body = self.request(self.nginx_port, host, path, {
                        "CF-Connecting-IP": address, "X-Forwarded-For": "203.0.113.200",
                        "X-Real-IP": "203.0.113.201",
                    }, method=method)
                    self.assertEqual(status, 200)
                    self.assertEqual(body["client"], address)
                    self.assertEqual(body["headers"]["x-forwarded-for"], address)
                    self.assertEqual(body["headers"]["x-real-ip"], address)
                    self.assertEqual(body["scheme"], "https")

    def test_protected_upload_accepts_application_limit_and_other_routes_keep_smaller_limit(self):
        maximum = 10 * 1024 * 1024
        headers = {"CF-Connecting-IP": "192.0.2.210"}
        for host, selector, other_path in (
            ("app.safrway.online", ADMIN_DOCUMENT_UPLOAD, "/api/web/boundary-probe"),
            ("api.safrway.online", AGENT_DOCUMENT_UPLOAD, API_PROBE),
        ):
            path = DOCUMENT_UPLOAD_PATHS[selector]
            for size in (1024 * 1024 + 1, maximum):
                with self.subTest(host=host, size=size):
                    status, body = self.request(self.nginx_port, host, path, headers, method="POST", payload=b"x" * size)
                    if status != 200:
                        logs = (self.root / "nginx-error.log").read_text().splitlines()
                        self.fail(f"Proxy returned {status} for {host}{path}: {' | '.join(logs[-3:])}")
                    self.assertEqual(body["bodyBytes"], size)
            status, _ = self.request(self.nginx_port, host, path,
                                     {**headers, "Content-Length": str(maximum + 1)}, method="POST")
            self.assertEqual(status, 413)
            status, _ = self.request(self.nginx_port, host, other_path,
                                     {**headers, "Content-Length": str(1024 * 1024 + 1)}, method="POST")
            self.assertEqual(status, 413)

    def test_agent_json_origin_forwards_only_documented_paths_and_methods(self):
        host = "api.safrway.online"
        headers = {"CF-Connecting-IP": "192.0.2.230", "Authorization": "Bearer synthetic-boundary-test"}
        for method, path in (("GET", "/api/visa-agent/cases/42"), ("POST", "/api/visa-agent/submissions"),
                             ("POST", "/api/visa-agent/processes/42/observations")):
            with self.subTest(method=method, path=path):
                status, body, returned = self.request(self.nginx_port, host, path, headers,
                                                       method=method, include_headers=True)
                self.assertEqual(status, 200)
                self.assertEqual(body["headers"]["authorization"], headers["Authorization"])
                self.assertEqual(returned["cache-control"], "private, no-store")
                wrong_method = "POST" if method == "GET" else "GET"
                denied, _, returned = self.request(self.nginx_port, host, path, headers,
                                                       method=wrong_method, include_headers=True)
                self.assertEqual(denied, 403)
                self.assertEqual(returned["cache-control"], "private, no-store")
        for path in ("/api/visa-agent", "/api/visa-agent/cases/42/intake", "/api/visa-agent/processes/42/observations/extra"):
            self.assertEqual(self.request(self.nginx_port, host, path, headers, method="POST")[0], 404)
        rental_status, rental = self.request(self.nginx_port, host, "/api/web/life-services/agent/services", headers)
        self.assertEqual(rental_status, 200)
        self.assertEqual(rental["headers"]["authorization"], headers["Authorization"])
        self.assertEqual(self.request(self.nginx_port, host, "/api/visa-agent/submissions",
                                     {**headers, "Content-Length": str(1024 * 1024 + 1)}, method="POST")[0], 413)

    def test_guest_messages_deny_get_with_private_cache_policy(self):
        status, _, headers = self.request(self.nginx_port, "safrway.online", "/api/web/chat/guest/messages",
            {"CF-Connecting-IP": "192.0.2.200"}, include_headers=True)
        self.assertEqual(status, 403)
        self.assertEqual(headers["cache-control"], "private, no-store")

    def test_ipv6_and_hostile_forwarding_chains_cannot_change_restored_identity(self):
        address = "2001:db8::25"
        for forged in ("203.0.113.9", "203.0.113.9, 127.0.0.1", "not-an-address"):
            status, body = self.request(self.nginx_port, "api.safrway.online", API_PROBE, {
                "CF-Connecting-IP": address, "X-Forwarded-For": forged, "X-Real-IP": forged,
            })
            self.assertEqual(status, 200)
            self.assertEqual(ipaddress.ip_address(body["client"]), ipaddress.ip_address(address))
            self.assertEqual(body["headers"]["x-forwarded-for"], address)

    def test_missing_and_malformed_cf_address_never_use_attacker_xff(self):
        for cf_address in (None, "not-an-address"):
            headers = {"X-Forwarded-For": "203.0.113.123", "X-Real-IP": "203.0.113.124"}
            if cf_address is not None:
                headers["CF-Connecting-IP"] = cf_address
            status, body = self.request(self.nginx_port, "api.safrway.online", API_PROBE, headers)
            self.assertEqual(status, 200)
            self.assertEqual(body["client"], "127.0.0.1")
            self.assertEqual(body["headers"]["x-forwarded-for"], "127.0.0.1")

    def test_nginx_budget_is_separate_per_visitor_despite_forged_xff(self):
        statuses = []
        for suffix in (1, 2, 3):
            statuses.append(self.request(self.nginx_port, "api.safrway.online", "/_boundary/budget", {
                "CF-Connecting-IP": "198.51.100.50", "X-Forwarded-For": f"203.0.113.{suffix}",
            })[0])
        self.assertEqual(statuses, [200, 200, 503])
        status, body = self.request(self.nginx_port, "api.safrway.online", "/_boundary/budget", {
            "CF-Connecting-IP": "198.51.100.51", "X-Forwarded-For": "203.0.113.3",
        })
        self.assertEqual(status, 200)
        self.assertEqual(body["client"], "198.51.100.51")
