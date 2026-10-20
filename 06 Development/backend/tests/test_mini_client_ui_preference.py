"""Actual Mini cookies/HTTP/CAS on owned synthetic PG, not Telegram login."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import hashlib
import os
import threading
import time
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

from tests.test_client_ui_preference import LOCALES, isolated_test_url

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, select, text, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import mini_app, web_portal
from app.api.client_ui_preference_privacy import ClientUIPreferencePrivacyMiddleware
from app.core.config import settings
from app.main import app
from app.models.mini_app_session import MiniAppSession
from app.models.user import User
from app.models.web_portal import WebSession
from app.services import client_ui_preference as service


PATH = "/mini-app/preferences/ui-locale"
ORIGIN = "https://mini-fixture.invalid"
WEB_ORIGIN = "https://app.safrway.online"


class MiniPreferenceBodyBoundary(unittest.TestCase):
    def test_mini_slow_body_is_bounded_without_reaching_auth_or_app(self):
        async def run():
            sent = []

            async def receive():
                await asyncio.sleep(4)
                return {"type": "http.request", "body": b"{}", "more_body": False}

            async def send(message):
                sent.append(message)

            async def inner(*args):
                raise AssertionError("Timed-out body must not reach app")

            scope = {"type": "http", "method": "PATCH", "path": PATH,
                     "headers": [(b"content-type", b"application/json")]}
            started = time.monotonic()
            await ClientUIPreferencePrivacyMiddleware(inner)(scope, receive, send)
            self.assertLess(time.monotonic() - started, 3)
            self.assertEqual(sent[0]["status"], 408)
            self.assertIn((b"cache-control", b"private, no-store"), sent[0]["headers"])
            self.assertIn((b"x-robots-tag", b"noindex, nofollow"), sent[0]["headers"])

        asyncio.run(run())


@unittest.skipUnless(os.environ.get("SAFR_TEST_POSTGRES_URL"), "explicit isolated PostgreSQL URL required")
class MiniPreferencePostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        url = isolated_test_url(os.environ["SAFR_TEST_POSTGRES_URL"])
        cls.schema = "ui10_mini_test_" + uuid4().hex
        cls.root_engine = create_engine(url, poolclass=NullPool, connect_args={"connect_timeout": 2})
        with cls.root_engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{cls.schema}"'))
        cls.engine = create_engine(url, poolclass=NullPool, connect_args={
            "connect_timeout": 2,
            "options": f"-c search_path={cls.schema} -c statement_timeout=3000 -c lock_timeout=1000",
        })
        # This is a route/CAS fixture, explicitly NOT migration-chain evidence.
        for model in (User, WebSession, MiniAppSession):
            model.__table__.create(cls.engine)
        cls.Factory = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)

    @classmethod
    def tearDownClass(cls):
        with cls.engine.begin() as conn:
            for name in ("mini_app_sessions", "web_sessions", "users"):
                conn.execute(text("DROP TABLE " + name))
        cls.engine.dispose()
        with cls.root_engine.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{cls.schema}"'))
        cls.root_engine.dispose()

    def setUp(self):
        self.token = "synthetic-mini-preference-a"
        self.other_token = "synthetic-mini-preference-b"
        self.web_token = "synthetic-web-preference-a"
        now = datetime.utcnow()
        with self.Factory() as db:
            for model in (MiniAppSession, WebSession, User):
                db.execute(delete(model))
            for actor, token in ((1, self.token), (2, self.other_token)):
                db.add(User(id=actor, telegram_id=9300000 + actor, ref_code="MINI-UI-TEST-" + str(actor),
                            locale="en" if actor == 1 else "ru", status="active", first_name="Synthetic"))
                db.flush()
                db.add(MiniAppSession(user_id=actor, access_token_hash=mini_app.token_hash(token),
                    refresh_token_hash=mini_app.token_hash("refresh-" + token),
                    access_expires_at=now + timedelta(hours=1), refresh_expires_at=now + timedelta(days=1),
                    last_seen_at=now))
            db.add(WebSession(user_id=1, token_hash=web_portal.token_hash(self.web_token),
                              expires_at=now + timedelta(days=1), last_seen_at=now))
            db.commit()
        self.patches = [patch.object(mini_app, "SessionLocal", self.Factory),
                        patch.object(web_portal, "SessionLocal", self.Factory),
                        patch.object(service, "preference_engine", return_value=self.engine),
                        patch.object(settings, "MINI_APP_ORIGINS", ORIGIN),
                        patch.object(settings, "APPLICATION_URL", WEB_ORIGIN),
                        patch.object(settings, "RATE_LIMIT_PER_MINUTE", 100000)]
        for item in self.patches:
            item.start()
        self.assertEqual(app.dependency_overrides, {})
        self.client = TestClient(app, base_url=ORIGIN, raise_server_exceptions=False)
        self.login()

    def tearDown(self):
        self.client.close()
        for item in reversed(self.patches):
            item.stop()

    def login(self, token=None):
        token = token or self.token
        self.client.cookies.clear()
        self.client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, token,
                                domain=urlsplit(ORIGIN).hostname, path="/mini-app")
        self.client.cookies.set(settings.MINI_APP_REFRESH_COOKIE_NAME, "refresh-" + token,
                                domain=urlsplit(ORIGIN).hostname, path="/mini-app")
        value = self.private(self.client.get(PATH), 200)
        self.headers = {"Origin": ORIGIN, "X-CSRF-Token": value["csrf_token"]}
        return value

    def private(self, response, code):
        self.assertEqual(response.status_code, code, response.text)
        self.assertEqual(response.headers.get("Cache-Control"), "private, no-store")
        self.assertEqual(response.headers.get("X-Robots-Tag"), "noindex, nofollow")
        self.assertIn("cookie", response.headers.get("Vary", "").lower())
        return response.json()

    def save(self, locale="fr", revision=0, headers=None):
        return self.client.patch(PATH, json={"ui_locale": locale, "expected_revision": revision},
                                 headers=self.headers if headers is None else headers)

    def current(self, actor=1):
        with self.Factory() as db:
            return service.preference_projection(db.get(User, actor))

    def test_get_returns_only_server_actor_preference_and_cookie_bound_csrf(self):
        value = self.private(self.client.get(PATH), 200)
        self.assertEqual(set(value), {"telegram_id", "client_ui_preference", "csrf_token"})
        self.assertEqual(value["telegram_id"], 9300001)
        self.assertEqual(value["client_ui_preference"], {"ui_locale": None, "revision": 0})
        self.assertEqual(len(value["csrf_token"]), 64)
        self.assertNotIn(self.token, str(value))
        old_csrf = value["csrf_token"]
        other = self.login(self.other_token)
        self.assertEqual(other["telegram_id"], 9300002)
        self.assertNotEqual(other["csrf_token"], old_csrf)
        self.private(self.save(headers={"Origin": ORIGIN, "X-CSRF-Token": old_csrf}), 403)
        self.assertEqual(self.current(1), self.current(2))

    def test_all_ten_http_writes_persist_only_two_interface_fields(self):
        with self.Factory() as db:
            before = dict(db.execute(select(User.__table__).where(User.id == 1)).mappings().one())
        for revision, locale in enumerate(LOCALES):
            self.assertEqual(self.private(self.save(locale, revision), 200),
                             {"ui_locale": locale, "revision": revision + 1})
            self.assertEqual(self.private(self.client.get(PATH), 200)["client_ui_preference"],
                             {"ui_locale": locale, "revision": revision + 1})
        with self.Factory() as db:
            after = dict(db.execute(select(User.__table__).where(User.id == 1)).mappings().one())
        for key in before.keys() - {"client_ui_locale", "client_ui_locale_revision"}:
            self.assertEqual(after[key], before[key], key)
        self.assertEqual(self.current(2), {"ui_locale": None, "revision": 0})

    def test_mini_and_web_share_one_cas_projection_but_not_csrf_credentials(self):
        self.private(self.save("ar"), 200)
        self.client.cookies.set(settings.WEB_SESSION_COOKIE_NAME, self.web_token,
                                domain=urlsplit(ORIGIN).hostname, path="/")
        value = self.private(self.client.get("/api/web/auth/me"), 200)
        self.assertEqual(value["client_ui_preference"], {"ui_locale": "ar", "revision": 1})
        self.assertNotEqual(value["csrf_token"], self.headers["X-CSRF-Token"])
        self.private(self.save("de", 1, {"Origin": ORIGIN, "X-CSRF-Token": value["csrf_token"]}), 403)
        self.private(self.client.patch("/api/web/preferences/ui-locale", headers={"Origin": WEB_ORIGIN,
            "X-CSRF-Token": value["csrf_token"]}, json={"ui_locale": "de", "expected_revision": 1}), 200)
        self.assertEqual(self.private(self.client.get(PATH), 200)["client_ui_preference"],
                         {"ui_locale": "de", "revision": 2})

    def test_equal_value_is_a_fence_and_stale_retry_is_409_current(self):
        self.private(self.save("fr"), 200)
        self.assertEqual(self.private(self.save("fr", 1), 200), {"ui_locale": "fr", "revision": 2})
        for revision in (0, 1):
            self.assertEqual(self.private(self.save("de", revision), 409)["current"],
                             {"ui_locale": "fr", "revision": 2})

    def test_actual_parallel_http_writes_have_one_winner(self):
        barrier = threading.Barrier(2)

        def writer(locale):
            with TestClient(app, base_url=ORIGIN, raise_server_exceptions=False) as client:
                client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, self.token)
                barrier.wait(timeout=3)
                return client.patch(PATH, headers=self.headers,
                    json={"ui_locale": locale, "expected_revision": 0})

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = [f.result(timeout=6) for f in [executor.submit(writer, v) for v in ("fr", "de")]]
        self.assertCountEqual([r.status_code for r in responses], [200, 409])
        accepted = next(r.json() for r in responses if r.status_code == 200)
        self.assertEqual(next(r.json()["current"] for r in responses if r.status_code == 409), accepted)
        self.assertEqual(self.current(), accepted)

    def test_origin_csrf_missing_null_foreign_and_web_token_denied_before_save(self):
        web_csrf = hashlib.sha256(("safr-admin-csrf:" + self.token).encode()).hexdigest()
        with patch.object(mini_app, "save_preference") as persist:
            for headers in ({}, {"Origin": ORIGIN}, {"Origin": ORIGIN, "X-CSRF-Token": "wrong"},
                    {**self.headers, "Origin": "null"}, {**self.headers, "Origin": ORIGIN + "/"},
                    {**self.headers, "Origin": "https://foreign.invalid"},
                    {"Origin": ORIGIN, "X-CSRF-Token": web_csrf}):
                self.private(self.save(headers=headers), 403)
            persist.assert_not_called()

    def test_enabled_yoga_chat_origin_is_not_implicitly_a_main_preference_origin(self):
        with patch.object(settings, "YOGA_MINI_APP_ENABLED", True), \
                patch.object(settings, "YOGA_MINI_APP_ORIGIN", "https://yoga-fixture.invalid"), \
                patch.object(mini_app, "save_preference") as persist:
            self.private(self.save(headers={**self.headers, "Origin": "https://yoga-fixture.invalid"}), 403)
            persist.assert_not_called()

    def test_no_mini_cookie_web_cookie_only_and_unknown_cookie_are_401(self):
        headers = dict(self.headers)
        with patch.object(mini_app, "save_preference") as persist:
            for cookies in ({}, {settings.WEB_SESSION_COOKIE_NAME: self.web_token},
                            {settings.MINI_APP_REFRESH_COOKIE_NAME: "refresh-" + self.token},
                            {settings.MINI_APP_ACCESS_COOKIE_NAME: "unknown"}):
                self.client.cookies.clear()
                self.client.cookies.update(cookies)
                self.private(self.client.get(PATH), 401)
                self.private(self.save(headers=headers), 401)
            persist.assert_not_called()

    def test_expired_revoked_and_inactive_actor_denied_by_actual_mini_dependency(self):
        for model, values in ((MiniAppSession, {"access_expires_at": datetime.utcnow() - timedelta(seconds=1)}),
                              (MiniAppSession, {"revoked_at": datetime.utcnow()}),
                              (User, {"status": "inactive"})):
            with self.Factory() as db:
                where = model.user_id == 1 if model is MiniAppSession else User.id == 1
                db.execute(update(model).where(where).values(**values))
                db.commit()
            with patch.object(mini_app, "save_preference") as persist:
                self.private(self.client.get(PATH), 401)
                self.private(self.save(), 401)
                persist.assert_not_called()
            with self.Factory() as db:
                db.execute(update(MiniAppSession).where(MiniAppSession.user_id == 1).values(
                    access_expires_at=datetime.utcnow() + timedelta(hours=1), revoked_at=None))
                db.execute(update(User).where(User.id == 1).values(status="active"))
                db.commit()

    def test_refresh_rotates_csrf_and_old_access_no_longer_authenticates(self):
        old_headers = dict(self.headers)
        self.assertEqual(self.client.post("/mini-app/auth/refresh").status_code, 200)
        value = self.private(self.client.get(PATH), 200)
        self.assertNotEqual(value["csrf_token"], old_headers["X-CSRF-Token"])
        self.private(self.save(headers=old_headers), 403)
        self.private(self.save(headers={"Origin": ORIGIN, "X-CSRF-Token": value["csrf_token"]}), 200)
        self.client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, self.token,
                                domain=urlsplit(ORIGIN).hostname, path="/mini-app")
        self.private(self.client.get(PATH), 401)

    def test_ambiguous_ack_reports_503_then_read_reconciles_and_old_retry_conflicts(self):
        actual = mini_app.save_preference

        def lost_ack(actor, intent):
            actual(actor, intent)
            raise OperationalError("synthetic", {}, Exception("PRIVATE-DRIVER"))

        with patch.object(mini_app, "save_preference", side_effect=lost_ack):
            self.private(self.save("ja"), 503)
        self.assertEqual(self.private(self.client.get(PATH), 200)["client_ui_preference"],
                         {"ui_locale": "ja", "revision": 1})
        self.private(self.save("de"), 409)

    def test_closed_body_validation_is_non_reflective(self):
        for body in ({"ui_locale": "fr", "expected_revision": 0, "telegram_id": "PRIVATE-INPUT"},
                     {"ui_locale": "PRIVATE-INPUT", "expected_revision": 0},
                     {"ui_locale": "fr", "expected_revision": True}):
            with patch.object(mini_app, "save_preference") as persist:
                response = self.client.patch(PATH, headers=self.headers, json=body)
                self.assertEqual(self.private(response, 422), {"detail": "Invalid preference request"})
                self.assertNotIn("PRIVATE-INPUT", response.text)
                persist.assert_not_called()

    def test_error_statuses_are_private_and_sanitized(self):
        self.private(self.client.post(PATH), 405)
        self.private(self.client.patch(PATH, headers={**self.headers, "Content-Type": "text/plain"}, content=b"{}"), 415)
        self.private(self.client.patch(PATH, headers={**self.headers, "Content-Type": "application/json"}, content=b"x" * 1025), 413)
        self.private(self.client.patch(PATH, headers={**self.headers, "Content-Type": "application/json"}, content=b"{bad"), 422)
        with patch("app.core.security.rate_limiter.check", return_value=False):
            self.private(self.client.get(PATH), 429)
            self.private(self.save(), 429)
        with patch.object(mini_app, "save_preference", side_effect=RuntimeError("PRIVATE-INPUT")):
            response = self.save()
            self.private(response, 500)
            self.assertNotIn("PRIVATE-INPUT", response.text)


if __name__ == "__main__":
    unittest.main()
