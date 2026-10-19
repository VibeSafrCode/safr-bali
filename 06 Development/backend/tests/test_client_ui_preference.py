"""Real PostgreSQL, synthetic actors, exact private Unix-socket target only.

Requires SAFR_TEST_POSTGRES_URL; never falls back to application DATABASE_URL.
Run from an owned empty working directory with a synthetic environment.
"""

import asyncio
import getpass
import hashlib
import importlib.util
import os
from pathlib import Path
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, delete, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool


def isolated_test_url(value):
    url = make_url(value)
    socket = Path(url.query.get("host", ""))
    if (url.drivername != "postgresql+psycopg" or url.host is not None
            or url.password is not None or url.username != getpass.getuser()
            or url.database != "postgres" or set(url.query) != {"host", "port"}
            or url.query["port"] != "55439" or socket.name != "socket"
            or socket.parent.parent != Path("/private/tmp")
            or not socket.parent.name.startswith("safr-client-ui10-pg-20261014.")
            or not socket.is_dir() or socket.is_symlink()
            or socket.parent.is_symlink() or socket.resolve(strict=True) != socket
            or socket.parent.stat().st_uid != os.getuid()
            or socket.parent.stat().st_mode & 0o077
            or socket.stat().st_uid != os.getuid()
            or socket.stat().st_mode & 0o077):
        raise RuntimeError("Only owned private local test socket is allowed")
    return url


# Explicit PG mode must be checked BEFORE application/settings imports. The
# exact launch environment remains evidence; no .env or inherited production URL.
if os.environ.get("SAFR_TEST_POSTGRES_URL"):
    isolated_test_url(os.environ["SAFR_TEST_POSTGRES_URL"])
    if (os.environ.get("DATABASE_URL") != os.environ["SAFR_TEST_POSTGRES_URL"]
            or Path(".env").exists()):
        raise RuntimeError("Synthetic matching database environment and no .env required")

from app.api import web_portal
from app.api.client_ui_preference_privacy import ClientUIPreferencePrivacyMiddleware
from app.core.config import settings
from app.main import app
from app.models.user import User
from app.models.web_portal import WebSession
from app.schemas.client_ui_preference import ClientUIPreferenceWrite, MAX_UI_REVISION
from app.services import client_ui_preference as service


LOCALES = ("ru", "en", "zh-Hans", "ko", "fr", "de", "ja", "hi", "es", "ar")
PATH = "/api/web/preferences/ui-locale"


class PreferenceSchemaTests(unittest.TestCase):
    def test_test_socket_gate_rejects_query_transport_overrides(self):
        base = os.environ.get("SAFR_TEST_POSTGRES_URL")
        if not base:
            self.skipTest("explicit isolated URL required")
        for key in ("service", "servicefile", "passfile", "options", "hostaddr", "sslkey", "sslpassword"):
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                isolated_test_url(base + "&" + key + "=prohibited")

    def test_exact_ten_and_strict_actor_free_body(self):
        for locale in LOCALES:
            self.assertEqual(ClientUIPreferenceWrite(ui_locale=locale, expected_revision=0).ui_locale, locale)
        for value in (True, False, "1", 1.0, -1, MAX_UI_REVISION + 1, None):
            with self.subTest(revision=value), self.assertRaises(ValidationError):
                ClientUIPreferenceWrite(ui_locale="fr", expected_revision=value)
        for locale in ("zh-cn", "zh-hans", "en-US", "fa", "FR", " fr", None):
            with self.subTest(locale=locale), self.assertRaises(ValidationError):
                ClientUIPreferenceWrite(ui_locale=locale, expected_revision=0)
        for key in ("actor", "user_id", "telegram_id", "contact_locale"):
            with self.subTest(key=key), self.assertRaises(ValidationError):
                ClientUIPreferenceWrite(**{"ui_locale": "fr", "expected_revision": 0, key: 999})

    def test_slow_body_has_actual_bounded_wait_and_private_error(self):
        async def run():
            sent = []

            async def receive():
                await asyncio.sleep(4)
                return {"type": "http.request", "body": b"", "more_body": False}

            async def send(message):
                sent.append(message)

            async def inner(*args):
                raise AssertionError("body timeout must not reach app")

            scope = {"type": "http", "method": "PATCH", "path": PATH,
                     "headers": [(b"content-type", b"application/json")]}
            began = time.monotonic()
            await ClientUIPreferencePrivacyMiddleware(inner)(scope, receive, send)
            self.assertLess(time.monotonic() - began, 3)
            self.assertEqual(sent[0]["status"], 408)
            self.assertIn((b"cache-control", b"private, no-store"), sent[0]["headers"])

        asyncio.run(run())

    def test_chunked_overflow_rejected_and_downstream_timeout_is_not_a_body_timeout(self):
        async def run(chunks, expected, downstream_timeout=False):
            sent = []
            pending = iter(chunks)

            async def receive():
                return next(pending)

            async def send(message):
                sent.append(message)

            async def inner(*args):
                if downstream_timeout:
                    raise TimeoutError("synthetic downstream timeout")
                raise AssertionError("overflow must not reach application")

            scope = {"type": "http", "method": "PATCH", "path": PATH,
                     "headers": [(b"content-type", b"application/json")]}
            await ClientUIPreferencePrivacyMiddleware(inner)(scope, receive, send)
            self.assertEqual(sent[0]["status"], expected)
            self.assertIn((b"cache-control", b"private, no-store"), sent[0]["headers"])

        asyncio.run(run([
            {"type": "http.request", "body": b"x" * 512, "more_body": True},
            {"type": "http.request", "body": b"x" * 513, "more_body": False},
        ], 413))
        asyncio.run(run([{"type": "http.request", "body": b"{}", "more_body": False}], 500, True))


@unittest.skipUnless(os.environ.get("SAFR_TEST_POSTGRES_URL"), "explicit isolated PostgreSQL URL required")
class PreferencePostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        url = isolated_test_url(os.environ["SAFR_TEST_POSTGRES_URL"])
        cls.verified_database_url = url.render_as_string(hide_password=False)
        cls.schema = "ui10_test_" + uuid4().hex
        cls.root_engine = create_engine(url, poolclass=NullPool, connect_args={"connect_timeout": 2})
        with cls.root_engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{cls.schema}"'))
        cls.engine = create_engine(url, poolclass=NullPool, connect_args={
            "connect_timeout": 2,
            "options": f"-c search_path={cls.schema} -c statement_timeout=3000 -c lock_timeout=1000",
        })
        User.__table__.create(cls.engine)
        WebSession.__table__.create(cls.engine)
        cls.Factory = sessionmaker(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        with cls.engine.begin() as conn:
            conn.execute(text("DROP TABLE web_sessions"))
            conn.execute(text("DROP TABLE users"))
        cls.engine.dispose()
        with cls.root_engine.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{cls.schema}"'))
        cls.root_engine.dispose()

    def setUp(self):
        self.token = "synthetic-ui-actor-a"
        self.other_token = "synthetic-ui-actor-b"
        with self.Factory() as db:
            db.execute(delete(WebSession))
            db.execute(delete(User))
            db.add_all([
                User(id=1, telegram_id=1000001, ref_code="UI-TEST-A", locale="en", first_name="Synthetic A"),
                User(id=2, telegram_id=1000002, ref_code="UI-TEST-B", locale="ru", first_name="Synthetic B"),
            ])
            db.flush()
            now = datetime.utcnow()
            for actor, token in ((1, self.token), (2, self.other_token)):
                db.add(WebSession(user_id=actor, token_hash=web_portal.token_hash(token),
                                  expires_at=now + timedelta(days=1), last_seen_at=now))
            db.commit()
        self.original_engine_factory = service.preference_engine
        self.patches = [
            patch.object(web_portal, "SessionLocal", self.Factory),
            patch.object(service, "preference_engine", return_value=self.engine),
            patch.object(settings, "DATABASE_URL", self.verified_database_url),
            patch.object(settings, "APPLICATION_URL", "https://app.safrway.online"),
            patch.object(settings, "ENVIRONMENT", "production"),
            patch.object(settings, "RATE_LIMIT_PER_MINUTE", 10000),
        ]
        for item in self.patches:
            item.start()
        self.client = TestClient(app, raise_server_exceptions=False)
        self.client.cookies.set(settings.WEB_SESSION_COOKIE_NAME, self.token)
        self.headers = {"Origin": "https://app.safrway.online", "X-CSRF-Token": hashlib.sha256(
            f"safr-admin-csrf:{self.token}".encode()).hexdigest()}

    def tearDown(self):
        self.client.close()
        for item in reversed(self.patches):
            item.stop()
        app.dependency_overrides.clear()

    def private(self, response, code):
        self.assertEqual(response.status_code, code, response.text)
        self.assertEqual(response.headers.get("Cache-Control"), "private, no-store")
        self.assertEqual(response.headers.get("X-Robots-Tag"), "noindex, nofollow")
        self.assertIn("cookie", response.headers.get("Vary", "").lower())
        return response.json()

    def current(self, actor=1):
        with self.Factory() as db:
            return service.preference_projection(db.get(User, actor))

    def save(self, locale="fr", revision=0, actor=1):
        with self.Factory() as db:
            return service.compare_and_set(db, actor, ClientUIPreferenceWrite(
                ui_locale=locale, expected_revision=revision))

    def test_all_ten_persist_without_changing_any_legacy_field(self):
        with self.Factory() as db:
            before = dict(db.execute(select(User.__table__).where(User.id == 1)).mappings().one())
        for revision, locale in enumerate(LOCALES):
            self.assertEqual(self.save(locale, revision), {"ui_locale": locale, "revision": revision + 1})
        with self.Factory() as db:
            after = dict(db.execute(select(User.__table__).where(User.id == 1)).mappings().one())
        for key in before.keys() - {"client_ui_locale", "client_ui_locale_revision"}:
            self.assertEqual(before[key], after[key], key)
        self.assertEqual(self.current(2), {"ui_locale": None, "revision": 0})

    def test_equal_value_is_a_revision_fence_and_replay_cannot_commit_twice(self):
        self.save("fr", 0)
        self.assertEqual(self.save("fr", 1), {"ui_locale": "fr", "revision": 2})
        for stale in (0, 1):
            with self.assertRaises(service.UIPreferenceConflict) as error:
                self.save("de", stale)
            self.assertEqual(error.exception.current, {"ui_locale": "fr", "revision": 2})

    def test_two_real_connections_same_base_have_exactly_one_winner(self):
        barrier = threading.Barrier(2)

        def writer(locale):
            with self.Factory() as db:
                pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
                barrier.wait(timeout=3)
                try:
                    return pid, "accepted", service.compare_and_set(db, 1, ClientUIPreferenceWrite(
                        ui_locale=locale, expected_revision=0))
                except service.UIPreferenceConflict as error:
                    return pid, "conflict", error.current

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(writer, locale) for locale in ("fr", "de")]
            results = [f.result(timeout=6) for f in futures]
        self.assertEqual(len({r[0] for r in results}), 2)
        self.assertCountEqual([r[1] for r in results], ["accepted", "conflict"])
        self.assertEqual(results[0][2], results[1][2])
        self.assertEqual(self.current()["revision"], 1)

    def test_precommit_failure_rolls_back(self):
        with self.Factory() as db, patch.object(db, "commit", side_effect=RuntimeError("synthetic commit refusal")):
            with self.assertRaises(RuntimeError):
                service.compare_and_set(db, 1, ClientUIPreferenceWrite(ui_locale="ar", expected_revision=0))
        self.assertEqual(self.current(), {"ui_locale": None, "revision": 0})

    def test_lost_ack_after_commit_requires_reconciliation_not_rollback_or_rebase(self):
        actual = web_portal.save_preference

        def lost_ack(actor, intent):
            actual(actor, intent)
            raise OperationalError("synthetic", {}, Exception("no driver detail exposure"))

        with patch.object(web_portal, "save_preference", side_effect=lost_ack):
            self.private(self.client.patch(PATH, json={"ui_locale": "ar", "expected_revision": 0}, headers=self.headers), 503)
        me = self.private(self.client.get("/api/web/auth/me"), 200)
        self.assertEqual(me["client_ui_preference"], {"ui_locale": "ar", "revision": 1})
        response = self.private(self.client.patch(PATH, json={"ui_locale": "de", "expected_revision": 0}, headers=self.headers), 409)
        self.assertEqual(response["current"], {"ui_locale": "ar", "revision": 1})

    def test_inactive_or_missing_actor_cannot_write(self):
        with self.Factory() as db:
            db.execute(update(User).where(User.id == 1).values(status="inactive"))
            db.commit()
        for actor in (1, 999):
            with self.assertRaises(service.UIActorUnavailable):
                self.save(actor=actor)
        self.private(self.client.patch(PATH, json={"ui_locale": "fr", "expected_revision": 0}, headers=self.headers), 401)

    def test_overflow_does_not_wrap_and_database_checks_are_real(self):
        with self.Factory() as db:
            db.execute(update(User).where(User.id == 1).values(client_ui_locale="fr", client_ui_locale_revision=MAX_UI_REVISION))
            db.commit()
        with self.assertRaises(service.UIPreferenceConflict):
            self.save("de", MAX_UI_REVISION)
        self.assertEqual(self.current(), {"ui_locale": "fr", "revision": MAX_UI_REVISION})
        for values in ({"client_ui_locale": "zh-cn"}, {"client_ui_locale_revision": -1}, {"locale": "fr"}):
            with self.Factory() as db, self.assertRaises(IntegrityError):
                db.execute(update(User).where(User.id == 1).values(**values))

    def test_row_lock_wait_is_actually_bounded(self):
        with self.Factory() as blocker:
            blocker.execute(select(User.id).where(User.id == 1).with_for_update()).one()
            started = time.monotonic()
            with self.assertRaises(OperationalError):
                self.save()
            elapsed = time.monotonic() - started
            self.assertGreater(elapsed, 0.8)
            self.assertLess(elapsed, 3)
            blocker.rollback()
        self.assertEqual(self.current(), {"ui_locale": None, "revision": 0})

    def test_private_connection_factory_really_uses_its_documented_budgets(self):
        # Exercise the actual cached factory, not the per-schema test override.
        original = self.original_engine_factory
        original.cache_clear()
        try:
            engine = original()
            self.assertIsInstance(engine.pool, NullPool)
            with engine.connect() as conn:
                self.assertEqual(conn.execute(text("SHOW lock_timeout")).scalar_one(), "1s")
                self.assertEqual(conn.execute(text("SHOW statement_timeout")).scalar_one(), "3s")
        finally:
            engine.dispose()
            original.cache_clear()

    def test_real_auth_me_projection_guest_actor_and_independent_actor(self):
        self.assertEqual(self.private(self.client.get("/api/web/auth/me"), 200)["client_ui_preference"], {"ui_locale": None, "revision": 0})
        self.private(self.client.patch(PATH, json={"ui_locale": "ja", "expected_revision": 0}, headers=self.headers), 200)
        self.assertEqual(self.private(self.client.get("/api/web/auth/me"), 200)["client_ui_preference"], {"ui_locale": "ja", "revision": 1})
        self.client.cookies.set(settings.WEB_SESSION_COOKIE_NAME, self.other_token)
        self.assertEqual(self.private(self.client.get("/api/web/auth/me"), 200)["client_ui_preference"], {"ui_locale": None, "revision": 0})
        self.client.cookies.clear()
        self.assertNotIn("client_ui_preference", self.private(self.client.get("/api/web/auth/me"), 200))

    def test_actual_route_auth_origin_csrf_rejection_never_calls_service(self):
        body = {"ui_locale": "fr", "expected_revision": 0}
        with patch.object(web_portal, "save_preference") as save:
            for headers in ({}, {**self.headers, "Origin": "https://evil.invalid"}, {**self.headers, "X-CSRF-Token": "wrong"}):
                self.private(self.client.patch(PATH, json=body, headers=headers), 403)
            self.client.cookies.clear()
            self.private(self.client.patch(PATH, json=body, headers=self.headers), 401)
            save.assert_not_called()

    def test_expired_and_revoked_real_sessions_are_denied(self):
        for values in ({"expires_at": datetime.utcnow() - timedelta(seconds=1)}, {"revoked_at": datetime.utcnow()}):
            with self.Factory() as db:
                db.execute(update(WebSession).where(WebSession.user_id == 1).values(**values))
                db.commit()
            with patch.object(web_portal, "save_preference") as save:
                self.private(self.client.patch(PATH, json={"ui_locale": "fr", "expected_revision": 0}, headers=self.headers), 401)
                save.assert_not_called()
            with self.Factory() as db:
                db.execute(update(WebSession).where(WebSession.user_id == 1).values(expires_at=datetime.utcnow()+timedelta(days=1), revoked_at=None))
                db.commit()

    def test_validation_is_non_reflective_and_does_not_allow_an_actor_selector(self):
        for body in ({"ui_locale": "fr", "expected_revision": 0, "user_id": "SENSITIVE-UNTRUSTED"},
                     {"ui_locale": "SENSITIVE-UNTRUSTED", "expected_revision": 0},
                     {"ui_locale": "fr", "expected_revision": True}):
            with patch.object(web_portal, "save_preference") as save:
                response = self.client.patch(PATH, json=body, headers=self.headers)
                self.assertEqual(self.private(response, 422), {"detail": "Invalid preference request"})
                self.assertNotIn("SENSITIVE-UNTRUSTED", response.text)
                save.assert_not_called()

    def test_actual_asgi_413_415_422_429_405_500_are_private(self):
        with patch.object(web_portal, "save_preference") as save:
            self.private(self.client.patch(PATH, content=b"x" * 1025, headers={**self.headers, "Content-Type": "application/json"}), 413)
            self.private(self.client.patch(PATH, content=b"x", headers={**self.headers, "Content-Type": "text/plain"}), 415)
            self.private(self.client.patch(PATH, content=b"{bad", headers={**self.headers, "Content-Type": "application/json"}), 422)
            self.private(self.client.get(PATH), 405)
            save.assert_not_called()
        with patch("app.core.security.rate_limiter.check", return_value=False):
            self.private(self.client.patch(PATH, json={"ui_locale": "fr", "expected_revision": 0}, headers=self.headers), 429)
        with patch.object(web_portal, "save_preference", side_effect=RuntimeError("SENSITIVE-UNTRUSTED")):
            response = self.client.patch(PATH, json={"ui_locale": "fr", "expected_revision": 0}, headers=self.headers)
            self.private(response, 500)
            self.assertNotIn("SENSITIVE-UNTRUSTED", response.text)

    def test_additive_migration_preserves_old_columns_owner_rows_and_refuses_saved_downgrade(self):
        schema = "ui10_migration_" + uuid4().hex
        with self.root_engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            old_names = [c.name for c in User.__table__.columns if not c.name.startswith("client_ui_locale")]
            columns = ",".join('"'+c+'"' for c in old_names)
            conn.execute(text(f'CREATE TABLE "{schema}".users AS SELECT {columns} FROM "{self.schema}".users'))
            conn.execute(text(f'ALTER TABLE "{schema}".users ADD CONSTRAINT ck_users_locale_supported CHECK (locale IN (\'ru\',\'en\'))'))
        migration_file = Path(__file__).resolve().parents[1] / "alembic/versions/c52e8b6d9041_add_client_ui_preference.py"
        spec = importlib.util.spec_from_file_location("ui10_migration_under_test", migration_file)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        self.assertEqual(migration.down_revision, "a1f9c3d7e620")
        try:
            with self.root_engine.begin() as conn:
                conn.execute(text(f'SET LOCAL search_path = "{schema}"'))
                old = conn.execute(text(f"SELECT {columns} FROM users ORDER BY id")).all()
                owner = conn.execute(text("SELECT tableowner FROM pg_tables WHERE schemaname=current_schema() AND tablename='users'")).scalar_one()
                with Operations.context(MigrationContext.configure(conn)):
                    migration.upgrade()
                self.assertEqual(conn.execute(text(f"SELECT {columns} FROM users ORDER BY id")).all(), old)
                self.assertEqual(conn.execute(text("SELECT tableowner FROM pg_tables WHERE schemaname=current_schema() AND tablename='users'")).scalar_one(), owner)
                self.assertEqual(conn.execute(text("SELECT client_ui_locale,client_ui_locale_revision FROM users ORDER BY id")).all(), [(None, 0), (None, 0)])
                with Operations.context(MigrationContext.configure(conn)):
                    migration.downgrade()
                    migration.upgrade()
                conn.execute(text("UPDATE users SET client_ui_locale='fr',client_ui_locale_revision=1 WHERE id=1"))
                with Operations.context(MigrationContext.configure(conn)), self.assertRaisesRegex(RuntimeError, "Retain saved UI"):
                    migration.downgrade()
                self.assertEqual(conn.execute(text("SELECT client_ui_locale_revision FROM users WHERE id=1")).scalar_one(), 1)
        finally:
            with self.root_engine.begin() as conn:
                conn.execute(text(f'DROP TABLE "{schema}".users'))
                conn.execute(text(f'DROP SCHEMA "{schema}"'))


if __name__ == "__main__":
    unittest.main()
