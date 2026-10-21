"""Full-template public 404 routing; real Nginx is required only for its lane.

No application/settings/database is imported. BALI_TEST_NGINX_BIN is the same
binary used by test_proxy_boundary.py. An absent variable explicitly skips the
real lane locally; a present but invalid value fails, including in CI.
"""
from __future__ import annotations

import http.client
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import time

import pytest


DEPLOY = Path(__file__).resolve().parents[2] / "deploy" / "nginx"
TEMPLATES = ("safr-target-production.conf", "safr-astro-site.preview.conf")
LOCALES = {"ru": "ru", "en": "en", "zh-cn": "zh-Hans", "ko": "ko",
           "fr": "fr", "de": "de", "ja": "ja", "hi": "hi", "es": "es", "ar": "ar"}
ROOTS = {"/var/www/safr/astro-site": "public", "/var/www/safr/react-app": "react"}
PROXY_ROUTES = {"= /account", "= /account/", "= /api/web/auth/me",
                "= /api/web/auth/start", "= /api/web/account-redirect",
                "= /api/web/chat/guest", "^~ /api/catalog/"}
MAP_ROW = ("~^/(?<safr_public_error_locale>en|zh-cn|ko|fr|de|ja|hi|es|ar)(?:/|$) "
           "/$safr_public_error_locale/404/index.html;")


def _blocks(text, kind):
    """The existing proxy fixture's bounded, line-oriented template grammar."""
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
            raise AssertionError("Unclosed canonical template block")


def _servers(source):
    result = {}
    for _, body in _blocks(source, "server"):
        names = re.findall(r"^\s*server_name\s+([^;]+);", body, re.MULTILINE)
        assert len(names) == 1 and names[0] not in result, "Ambiguous template server"
        result[names[0]] = body
    assert result, "No template servers"
    return result


def _configured_binary(environment):
    if "BALI_TEST_NGINX_BIN" not in environment:
        return None
    value = environment["BALI_TEST_NGINX_BIN"]
    assert value and Path(value).is_absolute(), "Explicit Nginx binary must be an absolute executable"
    try:
        binary = Path(value).resolve(strict=True)
    except OSError as error:
        raise AssertionError("Explicit Nginx binary is unavailable") from error
    assert binary.is_file() and os.access(binary, os.X_OK), "Explicit Nginx binary is not executable"
    return str(binary)


def _render_template(source, name, root, port):
    """Preserve the complete template except finite owned roots/listeners."""
    assert name in TEMPLATES and type(port) is int and 1024 <= port <= 65535
    assert re.fullmatch(r"/[A-Za-z0-9_./-]+", str(root)), "Unsafe fixture prefix"
    servers = _servers(source)
    expected_hosts = {"www.safrway.online", "safrway.online", "api.safrway.online"}
    if name == TEMPLATES[0]:
        expected_hosts.add("app.safrway.online")
    assert set(servers) == expected_hosts
    for body in servers.values():
        assert re.findall(r"^\s*listen\s+([^;]+);", body, re.MULTILINE) == ["127.0.0.1:8081"]
    assert len(re.findall(r"^\s*listen\s+", source, re.MULTILINE)) == len(servers)
    source_roots = re.findall(r"^\s*root\s+([^;]+);", source, re.MULTILINE)
    expected_roots = list(ROOTS) if name == TEMPLATES[0] else [next(iter(ROOTS))]
    assert sorted(source_roots) == sorted(expected_roots), "Unexpected filesystem root"
    # Full templates must not acquire another filesystem/config side effect.
    assert not re.search(r"^\s*(?:include|alias|load_module|env|pid|error_log|access_log|"
                         r"client_body_temp_path|proxy_temp_path|auth_basic_user_file)\s", source, re.MULTILINE)
    assert set(re.findall(r"\bproxy_pass\s+([^;]+);", source)) <= {
        "http://127.0.0.1:8000", "http://127.0.0.1:8000/api/web/account-redirect"}
    rendered = source.replace("listen 127.0.0.1:8081;", f"listen 127.0.0.1:{port};")
    for original in expected_roots:
        assert source.count("root " + original + ";") == 1
        rendered = rendered.replace("root " + original + ";", f"root {root / ROOTS[original]};")
    assert "127.0.0.1:8081" not in rendered and "/var/www/" not in rendered
    return rendered


def _assert_public_contract(source):
    maps = list(_blocks(source, "map"))
    assert len(maps) == 1 and maps[0][0] == "$uri $safr_public_error_uri"
    rows = [re.sub(r"\s+", " ", line.strip()) for line in maps[0][1].splitlines()
            if line.strip() and not line.lstrip().startswith("#")]
    assert rows == ["default /404.html;", MAP_ROW]
    servers = _servers(source)
    for host, body in servers.items():
        preamble = re.split(r"^\s*location\s", body, maxsplit=1, flags=re.MULTILINE)[0]
        assert not re.search(r"\bproxy_pass\s", preamble), "proxy_pass requires location scope"
        if host != "safrway.online":
            assert "$safr_public_error_uri" not in body
    main = servers["safrway.online"]
    locations = dict(_blocks(main, "location"))
    public = [line.strip() for line in locations["/"].splitlines()
              if line.strip() and not line.lstrip().startswith("#")]
    assert sorted(public) == ["error_page 404 $safr_public_error_uri;", "try_files $uri $uri/ =404;"]
    assert source.count("error_page 404 $safr_public_error_uri;") == 1
    assert main.count("error_page 404 /404.html;") == 1
    assert locations["= /404.html"].strip() == "internal;"
    assert {selector for selector, body in locations.items() if "proxy_pass " in body} == PROXY_ROUTES
    for selector, body in locations.items():
        if selector != "/":
            assert "$safr_public_error_uri" not in body, "Public error handler leaked into another route"


@pytest.mark.parametrize("name", TEMPLATES)
def test_public_error_map_is_only_in_main_public_location(name):
    _assert_public_contract((DEPLOY / name).read_text(encoding="utf8"))


class TestFixtureHelpers:
    def test_preview_api_proxy_keeps_uri_and_requires_location_scope(self):
        source = (DEPLOY / TEMPLATES[1]).read_text(encoding="utf8")
        api = _servers(source)["api.safrway.online"]
        locations = dict(_blocks(api, "location"))
        assert set(locations) == {"/"}
        assert locations["/"].strip() == "proxy_pass http://127.0.0.1:8000;"
        valid = "    location / {\n        proxy_pass http://127.0.0.1:8000;\n    }"
        assert source.count(valid) == 1
        with pytest.raises(AssertionError, match="proxy_pass requires location scope"):
            _assert_public_contract(source.replace(valid, "    proxy_pass http://127.0.0.1:8000;"))

    def test_absent_binary_is_distinct_from_invalid_explicit_binary(self):
        assert _configured_binary({}) is None
        for value in ("", "relative/nginx", "/_safr_no_such_nginx_fixture_"):
            with pytest.raises(AssertionError):
                _configured_binary({"BALI_TEST_NGINX_BIN": value})

    @pytest.mark.parametrize("name", TEMPLATES)
    def test_only_finite_roots_and_all_parsed_listeners_are_replaced(self, name):
        source = (DEPLOY / name).read_text(encoding="utf8")
        rendered = _render_template(source, name, Path("/tmp/safr-public-error-fixture"), 49151)
        assert rendered.count("listen 127.0.0.1:49151;") == len(_servers(source))
        assert re.findall(r"\bproxy_pass\s+([^;]+);", rendered) == re.findall(r"\bproxy_pass\s+([^;]+);", source)
        restored = rendered.replace("listen 127.0.0.1:49151;", "listen 127.0.0.1:8081;")
        for original, child in ROOTS.items():
            restored = restored.replace(f"root /tmp/safr-public-error-fixture/{child};", f"root {original};")
        assert restored == source

    def test_unknown_listener_root_or_include_is_rejected(self):
        source = (DEPLOY / TEMPLATES[0]).read_text(encoding="utf8")
        for changed in (source.replace("127.0.0.1:8081", "0.0.0.0:8081", 1),
                        source.replace("/var/www/safr/astro-site", "/opt/private", 1),
                        "include /etc/nginx/nginx.conf;\n" + source):
            with pytest.raises(AssertionError):
                _render_template(changed, TEMPLATES[0], Path("/tmp/safr-public-error-fixture"), 49151)


def _request(port, path):
    assert type(port) is int and 1024 <= port <= 65535
    assert path.startswith("/") and "\r" not in path and "\n" not in path
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        connection.request("GET", path, headers={"Host": "safrway.online", "Accept-Encoding": "identity"})
        response = connection.getresponse()
        body = response.read(65537)
        assert len(body) <= 65536, "Fixture response exceeded its cap"
        return response.status, dict(response.getheaders()), body.decode("utf8")
    finally:
        connection.close()


def _stop_owned(process, port):
    if process.poll() is None:
        process.send_signal(signal.SIGQUIT)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
    assert process.poll() is not None, "Owned Nginx was not reaped"
    with socket.socket() as probe:
        probe.settimeout(.2)
        assert probe.connect_ex(("127.0.0.1", port)) != 0, "Owned listener did not close"


@pytest.fixture(params=TEMPLATES)
def public_nginx(request, tmp_path):
    binary = _configured_binary(os.environ)
    if binary is None:
        pytest.skip("REAL_NGINX_NOT_RUN: BALI_TEST_NGINX_BIN is absent locally")
    root = tmp_path / "public-error-nginx"
    root.mkdir(mode=0o700)
    public = root / "public"
    public.mkdir(mode=0o700)
    (root / "react").mkdir(mode=0o700)
    for locale, language in LOCALES.items():
        error = (f"<!doctype html><html lang=\"{language}\"><head>"
                 f"<meta name=\"robots\" content=\"noindex, nofollow\"></head>"
                 f"<body>ERROR-{locale}</body></html>")
        directory = public / locale / "404"
        directory.mkdir(parents=True, mode=0o700)
        (directory / "index.html").write_text(error, encoding="utf8")
        known = public / locale / "known"
        known.mkdir(mode=0o700)
        (known / "index.html").write_text(f"<html lang=\"{language}\"><body>KNOWN-{locale}</body></html>", encoding="utf8")
        if locale == "ru":
            (public / "404.html").write_text(error, encoding="utf8")
    (public / "_astro").mkdir(mode=0o700)
    (public / "_astro" / "fixture.css").write_text("body{color:blue}", encoding="ascii")
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    source = (DEPLOY / request.param).read_text(encoding="utf8")
    _assert_public_contract(source)
    rendered = _render_template(source, request.param, root, port)
    configuration = (f"pid {root}/nginx.pid;\nerror_log {root}/error.log warn;\n"
                     "daemon off;\nmaster_process off;\nevents { worker_connections 64; }\nhttp {\n"
                     f"access_log off;\nclient_body_temp_path {root}/body;\nproxy_temp_path {root}/proxy;\n"
                     "types { text/html html; text/css css; application/javascript js mjs; }\n"
                     + rendered + "\n}\n")
    conf = root / "nginx.conf"
    conf.write_text(configuration, encoding="utf8")
    environment = {"PATH": os.defpath, "LANG": "C", "TZ": "UTC"}
    command = [binary, "-p", str(root) + "/", "-c", str(conf), "-e", str(root / "error.log")]
    syntax = subprocess.run(command + ["-t"], cwd=root, env=environment,
                            capture_output=True, text=True, timeout=10, check=False)
    assert syntax.returncode == 0, "Isolated full-template Nginx syntax failed: " + syntax.stderr[-8192:]
    process = None
    try:
        with (root / "process.log").open("wb") as log:
            process = subprocess.Popen(command, cwd=root, env=environment, stdout=log,
                                       stderr=subprocess.STDOUT, close_fds=True)
        deadline = time.monotonic() + 8
        while True:
            assert process.poll() is None, "Owned Nginx exited: " + (root / "process.log").read_text()[-8192:]
            try:
                if _request(port, "/ru/known/")[0] == 200:
                    break
            except (OSError, http.client.HTTPException):
                pass
            assert time.monotonic() < deadline, "Owned Nginx readiness timeout"
            time.sleep(.05)
        yield port
    finally:
        if process is not None:
            _stop_owned(process, port)


def _assert_error(response, locale):
    status, headers, body = response
    assert status == 404
    assert headers["Content-Type"].startswith("text/html")
    assert f"<html lang=\"{LOCALES[locale]}\">" in body
    assert f"ERROR-{locale}" in body
    assert "<meta name=\"robots\" content=\"noindex, nofollow\">" in body
    assert "KNOWN-" not in body


def test_real_nginx_localized_public_errors_and_unchanged_static_routes(public_nginx):
    for locale, language in LOCALES.items():
        _assert_error(_request(public_nginx, f"/{locale}/missing-owned-fixture/"), locale)
        status, _, body = _request(public_nginx, f"/{locale}/known/")
        assert status == 200 and f"KNOWN-{locale}" in body and f"lang=\"{language}\"" in body
        assert "noindex" not in body and "ERROR-" not in body
    for path in ("/xx/missing-owned-fixture/", "/prefix/ar/missing-owned-fixture/",
                 "/AR/missing-owned-fixture/", "/zh-Hans/missing-owned-fixture/",
                 "/missing-owned-fixture/?locale=ar&next=/ja/", "/enough/missing-owned-fixture/"):
        _assert_error(_request(public_nginx, path), "ru")
    _assert_error(_request(public_nginx, "/ar/missing-owned-fixture/?locale=ja"), "ar")
    # A localized public handler must not escape into asset locations. No API,
    # auth, App or upstream request is made by this fixture.
    for path in ("/ar/missing-owned-fixture.css", "/ja/missing-owned-fixture.js"):
        _assert_error(_request(public_nginx, path), "ru")
    status, headers, body = _request(public_nginx, "/_astro/fixture.css")
    assert status == 200 and headers["Content-Type"].startswith("text/css") and body == "body{color:blue}"
