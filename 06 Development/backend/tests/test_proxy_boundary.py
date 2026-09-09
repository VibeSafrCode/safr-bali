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
EXPECTED_ROUTES = {
    "safrway.online": {
        "= /account", "= /account/", "= /api/web/auth/me", "= /api/web/auth/start",
        "= /api/web/account-redirect", "= /api/web/chat/guest", "^~ /api/catalog/",
    },
    "app.safrway.online": {"^~ /mini-app/", "^~ /api/web/", "^~ /api/catalog/"},
    "api.safrway.online": {"/"},
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
    body = json.dumps({
        "client": scope["client"][0], "scheme": scope["scheme"], "path": scope["path"],
        "headers": {key.decode(): value.decode() for key, value in scope["headers"]},
    }).encode()
    await send({"type": "http.response.start", "status": 200,
                "headers": [(b"content-type", b"application/json")]})
    await send({"type": "http.response.body", "body": body})


class ProxyConfigurationTests(unittest.TestCase):
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
        for name, (_, locations) in canonical_servers().items():
            for selector, body in locations.items():
                total += 1
                with self.subTest(server=name, location=selector):
                    for directive in FORWARD_HEADERS:
                        self.assertIn(directive, body)
                    self.assertNotIn("$proxy_add_x_forwarded_for", body)
                    for header in ("Host", "X-Real-IP", "X-Forwarded-For", "X-Forwarded-Proto"):
                        self.assertEqual(len(re.findall(r"proxy_set_header\s+" + header + r"\s", body)), 1)
        self.assertEqual(total, 11)


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
            trust = "\n".join(line.strip() for line in preamble.splitlines()
                              if line.strip().startswith(("set_real_ip_from ", "real_ip_header ", "real_ip_recursive ")))
            rendered = []
            for selector, body in locations.items():
                rendered.append("location " + selector + " {\n" + body.replace(
                    "http://127.0.0.1:8000", f"http://127.0.0.1:{cls.backend_port}") + "\n}")
            # A deterministic 1/min budget verifies real-IP key isolation quickly.
            # Its key is taken from canonical production limiter definitions.
            if name == "api.safrway.online":
                rendered.append("location = /_boundary/budget {\n"
                                "limit_req zone=boundary_budget burst=1 nodelay;\n" +
                                "\n".join(FORWARD_HEADERS) +
                                f"\nproxy_pass http://127.0.0.1:{cls.backend_port};\n}}")
            servers.append(f"server {{\nlisten 127.0.0.1:{cls.nginx_port};\nserver_name {name};\n" +
                           trust + "\n" + "\n".join(rendered) + "\n}")
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
        cls.wait_ready(cls.nginx_port, "api.safrway.online")

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
    def wait_ready(cls, port, host):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if any(process.poll() is not None for process in cls.processes):
                logs = "\n".join(path.read_text() for path in cls.root.glob("*.log"))
                raise AssertionError("Isolated proxy process exited: " + logs)
            try:
                if cls.request(port, host, "/_boundary/ready")[0] == 200:
                    return
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(.05)
        raise AssertionError("Isolated proxy did not become ready within 10 seconds")

    @staticmethod
    def request(port, host, path, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
        try:
            connection.request("GET", path, headers={"Host": host, **(headers or {})})
            response = connection.getresponse()
            body = response.read()
            return response.status, json.loads(body) if response.status == 200 else body.decode()
        finally:
            connection.close()

    def test_every_production_proxy_location_passes_resolved_identity(self):
        ordinal = 0
        for host, (_, locations) in canonical_servers().items():
            for selector in locations:
                ordinal += 1
                path = selector.removeprefix("= ").removeprefix("^~ ")
                if not selector.startswith("="):
                    path += "boundary-probe"
                address = f"192.0.2.{ordinal}"
                with self.subTest(host=host, location=selector):
                    status, body = self.request(self.nginx_port, host, path, {
                        "CF-Connecting-IP": address, "X-Forwarded-For": "203.0.113.200",
                        "X-Real-IP": "203.0.113.201",
                    })
                    self.assertEqual(status, 200)
                    self.assertEqual(body["client"], address)
                    self.assertEqual(body["headers"]["x-forwarded-for"], address)
                    self.assertEqual(body["headers"]["x-real-ip"], address)
                    self.assertEqual(body["scheme"], "https")

    def test_ipv6_and_hostile_forwarding_chains_cannot_change_restored_identity(self):
        address = "2001:db8::25"
        for forged in ("203.0.113.9", "203.0.113.9, 127.0.0.1", "not-an-address"):
            status, body = self.request(self.nginx_port, "api.safrway.online", "/_boundary/echo", {
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
            status, body = self.request(self.nginx_port, "api.safrway.online", "/_boundary/echo", headers)
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
