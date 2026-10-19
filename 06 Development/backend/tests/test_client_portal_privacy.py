"""Private HTTP headers without changing client portal authentication or bodies."""
import asyncio
import json
import unittest

from app.api.client_ui_preference_privacy import ClientUIPreferencePrivacyMiddleware


class ClientPortalPrivacyTests(unittest.TestCase):
    def request(self, path, *, method="GET", status=200, body=b"", headers=(),
                response_headers=(), response_body=b'{"ok":true}', failure=None):
        sent = []
        observed = []
        calls = []

        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        async def send(message):
            sent.append(message)

        async def inner(scope, receive, send):
            calls.append(scope)
            if failure == "before":
                raise RuntimeError("synthetic private driver error")
            observed.append(await receive())
            await send({"type": "http.response.start", "status": status,
                        "headers": list(response_headers)})
            if failure == "after":
                raise RuntimeError("synthetic error after headers")
            await send({"type": "http.response.body", "body": response_body})

        scope = {"type": "http", "method": method, "path": path, "headers": list(headers)}
        asyncio.run(ClientUIPreferencePrivacyMiddleware(inner)(scope, receive, send))
        return sent, observed, calls

    def private(self, sent, expected_status):
        self.assertEqual(sent[0]["status"], expected_status)
        headers = dict(sent[0]["headers"])
        self.assertEqual(headers[b"cache-control"], b"private, no-store")
        self.assertEqual(headers[b"x-robots-tag"], b"noindex, nofollow")
        vary = [x.strip().lower() for x in headers[b"vary"].split(b",")]
        self.assertEqual(vary.count(b"cookie"), 1)

    def test_private_groups_cover_success_redirect_and_errors(self):
        paths = ("/api/web", "/api/web/", "/api/web/account", "/api/web/chat",
                 "/api/web/chat/messages", "/api/web/chat/guest", "/api/web/auth/start",
                 "/api/web/auth/callback", "/api/web/auth/logout", "/api/web/exchange/options",
                 "/mini-app", "/mini-app/", "/mini-app/me", "/mini-app/chat",
                 "/mini-app/chat/messages", "/mini-app/yoga-account", "/mini-app/auth/session",
                 "/mini-app/auth/yoga-session", "/mini-app/auth/refresh", "/mini-app/auth/logout")
        for path in paths:
            for status in (200, 204, 302, 401, 403, 409, 422, 500):
                with self.subTest(path=path, status=status):
                    sent, _, calls = self.request(path, status=status)
                    self.private(sent, status)
                    self.assertEqual(len(calls), 1)

    def test_public_content_and_similar_prefixes_unchanged(self):
        for path in ("/", "/ru/", "/api/catalog/services", "/mini-app-public/me",
                     "/mini-application/me", "/api/web-public/account", "/api/website"):
            with self.subTest(path=path):
                sent, _, _ = self.request(path, response_headers=[(b"cache-control", b"public, max-age=60")])
                self.assertEqual(sent[0]["headers"], [(b"cache-control", b"public, max-age=60")])

    def test_cookie_vary_preserves_origin_and_no_case_duplicate(self):
        for value in (b"Origin", b"Origin, cOoKiE"):
            with self.subTest(vary=value):
                sent, _, _ = self.request("/mini-app/me", response_headers=[(b"vary", value)])
                self.private(sent, 200)
                self.assertIn(b"origin", dict(sent[0]["headers"])[b"vary"].lower())

    def test_chat_body_does_not_inherit_preference_budget_or_content_type(self):
        body = ("я" * 4000).encode("utf-8")
        for path in ("/api/web/chat/messages", "/mini-app/chat/messages"):
            with self.subTest(path=path):
                sent, observed, calls = self.request(path, method="POST", body=body,
                                                     headers=[(b"content-type", b"application/json")])
                self.private(sent, 200)
                self.assertEqual(observed[0]["body"], body)
                self.assertEqual(len(calls), 1)
                sent, observed, _ = self.request(path, method="POST", body=b"original",
                                                headers=[(b"content-type", b"text/plain")])
                self.assertEqual(observed[0]["body"], b"original")
                self.private(sent, 200)

    def test_only_preference_validation_is_replaced(self):
        original = b'{"detail":[{"type":"synthetic","input":"not-a-real-secret"}]}'
        for path in ("/api/web/preferences/ui-locale", "/mini-app/preferences/ui-locale",
                     "/api/web/auth/me", "/api/web/chat/messages", "/mini-app/chat/messages"):
            with self.subTest(path=path):
                sent, _, _ = self.request(path, status=422, response_body=original)
                self.private(sent, 422)
                expected = b'{"detail":"Invalid preference request"}' if path in ClientUIPreferencePrivacyMiddleware.PATHS else original
                self.assertEqual(b"".join(x.get("body", b"") for x in sent[1:]), expected)

    def test_preference_budget_and_json_requirement_remain(self):
        for path in ClientUIPreferencePrivacyMiddleware.WRITE_PATHS:
            with self.subTest(path=path):
                sent, _, calls = self.request(path, method="PATCH", body=b"x" * 1025,
                                             headers=[(b"content-type", b"application/json")])
                self.private(sent, 413)
                self.assertFalse(calls)
                sent, _, calls = self.request(path, method="PATCH", headers=[(b"content-type", b"text/plain")])
                self.private(sent, 415)
                self.assertFalse(calls)

    def test_unstarted_error_is_sanitized_and_private(self):
        for path in ("/api/web/chat", "/mini-app/me"):
            with self.subTest(path=path):
                sent, _, _ = self.request(path, failure="before")
                self.private(sent, 500)
                self.assertEqual(json.loads(sent[1]["body"]), {"detail": "Internal server error"})

    def test_started_error_is_not_replaced_or_double_started(self):
        with self.assertRaisesRegex(RuntimeError, "after headers"):
            self.request("/api/web/chat", failure="after")

    def test_websocket_passthrough(self):
        seen = []
        async def inner(scope, receive, send):
            seen.append(scope)
        scope = {"type": "websocket", "path": "/api/web/chat"}
        asyncio.run(ClientUIPreferencePrivacyMiddleware(inner)(scope, None, None))
        self.assertEqual(seen, [scope])

    def test_actual_guest_routes_and_cors_without_auth_overrides(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.config import settings
        self.assertFalse(app.dependency_overrides)
        client = TestClient(app)
        for method, path, status in (
            ("GET", "/api/web/auth/me", 200), ("GET", "/api/web/account", 401),
            ("GET", "/api/web/chat", 401), ("POST", "/api/web/chat/messages", 401),
            ("GET", "/mini-app/me", 401), ("GET", "/mini-app/chat", 401),
            ("POST", "/mini-app/chat/messages", 401),
        ):
            with self.subTest(method=method, path=path):
                response = client.request(method, path, json={} if method == "POST" else None)
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.headers["cache-control"], "private, no-store")
                self.assertEqual(response.headers["x-robots-tag"], "noindex, nofollow")
                self.assertIn("cookie", response.headers["vary"].lower())
        origin = settings.mini_app_origins[0]
        preflight = client.options("/mini-app/chat/messages", headers={"Origin": origin,
            "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type"})
        self.assertEqual(preflight.status_code, 200)
        self.assertEqual(preflight.headers["access-control-allow-origin"], origin)
        self.assertEqual(preflight.headers["access-control-allow-credentials"], "true")
        self.assertEqual(preflight.headers["cache-control"], "private, no-store")
        self.assertIn("origin", preflight.headers["vary"].lower())
        self.assertIn("cookie", preflight.headers["vary"].lower())
        self.assertNotIn("x-robots-tag", client.get("/health").headers)
        self.assertFalse(app.dependency_overrides)


if __name__ == "__main__":
    unittest.main()
