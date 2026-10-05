"""Critical synthetic analytics tests: no app start, production config or network."""
import importlib.util
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import analytics as api
from app.db.base import Base
from app.models.admin_action import AdminAction
from app.models.analytics import AnalyticsAccessGrant, AnalyticsConsent, AnalyticsDailyAggregate, AnalyticsEvent, AnalyticsPolicy
from app.models.user import User
from app.schemas.analytics import AnalyticsBatch, AnalyticsEventInput, AnalyticsGrantInput, AnalyticsPolicyInput
from app.services import analytics as service
from app.scripts import analytics_retention as maintenance


NOW = datetime(2026, 10, 5, 12, tzinfo=timezone.utc)
TABLES = [User.__table__, AdminAction.__table__, AnalyticsPolicy.__table__, AnalyticsConsent.__table__,
          AnalyticsEvent.__table__, AnalyticsDailyAggregate.__table__, AnalyticsAccessGrant.__table__]


def item(**kwargs):
    return AnalyticsEventInput(event_key=uuid4(), event_name="page_view", **kwargs)


class AnalyticsCriticalTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine, tables=TABLES)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.Session()
        self.root = User(telegram_id=701, role="admin", status="active", ref_code="synthetic-root")
        self.staff = User(telegram_id=702, role="client", status="active", ref_code="synthetic-staff")
        self.tech = User(telegram_id=703, role="client", status="active", ref_code="synthetic-tech")
        self.db.add_all([self.root, self.staff, self.tech, AnalyticsPolicy(id=1, revision=0, enabled=False,
            allowed_content_ids=[], allowed_service_ids=[], allowed_campaign_codes=[], updated_at=NOW)])
        self.db.commit()
        self.root_patch = patch("app.services.visa_staff.settings.DEFAULT_ADMIN_TELEGRAM_ID", 701)
        self.root_patch.start()

    def tearDown(self):
        self.root_patch.stop()
        self.db.close()
        self.engine.dispose()

    def enable(self):
        service.change_policy(self.db, AnalyticsPolicyInput(expected_revision=0, enabled=True,
            privacy_notice_version="privacy-2026-10-05", consent_ui_verified=True,
            allowed_content_ids=["c1-ru", "c1.ru", "c1.zh-Hans"],
            allowed_service_ids=["visa-c1", "housing"], allowed_campaign_codes=["autumn"]), self.root, NOW)
        self.db.commit()
        token = service.grant_consent(self.db, 1, now=NOW)
        self.db.commit()
        return token

    def ingest(self, token, events, **kwargs):
        result = service.ingest(self.db, AnalyticsBatch(events=events), token, now=NOW, **kwargs)
        self.db.commit()
        return result

    def test_consent_disabled_expired_revoked_and_policy_change_fail_closed(self):
        with self.assertRaisesRegex(service.AnalyticsBlocked, "privacy_gate"):
            self.ingest("anything", [item()])
        self.assertFalse(service.policy_projection(self.db)["enabled"])
        with self.assertRaisesRegex(service.AnalyticsBlocked, "consent_ui"):
            service.change_policy(self.db, AnalyticsPolicyInput(expected_revision=0, enabled=True,
                privacy_notice_version="privacy-2026-10-05", consent_ui_verified=False), self.root, NOW)
        self.assertEqual(self.db.get(AnalyticsPolicy, 1).revision, 0)
        token = self.enable()
        with self.assertRaisesRegex(service.AnalyticsBlocked, "consent_required"):
            self.ingest(None, [item()])
        self.ingest(token, [item(content_id="c1-ru")])
        self.assertEqual(self.db.query(AnalyticsEvent).count(), 1)
        self.assertNotIn(token, self.db.query(AnalyticsConsent).one().token_hash)
        service.revoke_consent(self.db, token, NOW)
        self.db.commit()
        with self.assertRaisesRegex(service.AnalyticsBlocked, "consent_required"):
            self.ingest(token, [item()])
        new = service.grant_consent(self.db, 1, now=NOW - timedelta(days=181))
        self.db.commit()
        with self.assertRaisesRegex(service.AnalyticsBlocked, "consent_required"):
            self.ingest(new, [item()])
        new = service.grant_consent(self.db, 1, now=NOW)
        self.db.get(AnalyticsPolicy, 1).revision = 2
        self.db.commit()
        with self.assertRaisesRegex(service.AnalyticsBlocked, "consent_required"):
            self.ingest(new, [item()])
        self.assertEqual(self.db.query(AnalyticsEvent).count(), 1)

    def test_prohibited_keys_urls_strings_unlisted_identifiers_and_untrusted_amounts(self):
        token = self.enable()
        for key in ["name", "phone", "email", "passport", "document", "file", "medical", "message", "form_text", "ip", "city", "url", "referrer", "utm_content", "user_id"]:
            with self.assertRaises(ValidationError):
                AnalyticsEventInput.model_validate({"event_key": str(uuid4()), "event_name": "page_view", key: "prohibited"})
        for values in [{"content_id": "https://example.invalid/?email=x"}, {"source": "john@example.invalid"},
                       {"browser": "Raw User Agent"}, {"country": "Indonesia"}, {"campaign_code": "phone +6281"}]:
            with self.assertRaises(ValidationError):
                item(**values)
        with self.assertRaisesRegex(service.AnalyticsBlocked, "not_allowlisted"):
            self.ingest(token, [item(content_id="syntactically-valid-but-unapproved")])
        financial = AnalyticsEventInput(event_key=uuid4(), event_name="payment_success", service_id="visa-c1", amount="2000000.00", currency="IDR")
        with self.assertRaisesRegex(service.AnalyticsBlocked, "trusted_event"):
            self.ingest(token, [financial])
        self.assertEqual(self.db.query(AnalyticsEvent).count(), 0)
        self.ingest(token, [financial], trusted=True)
        self.assertEqual(self.db.query(AnalyticsEvent).one().amount, Decimal("2000000.00"))
        for amount in ["0.001", "NaN", "-1", "1000000000000"]:
            with self.assertRaises(ValidationError):
                AnalyticsEventInput(event_key=uuid4(), event_name="payment_success", service_id="visa-c1", amount=amount, currency="IDR")
        self.assertFalse(set(["ip", "user_id", "payload", "name", "url", "email"]) & set(AnalyticsEvent.__table__.columns.keys()))

    def test_atomic_idempotency_no_double_aggregates_and_rate_bounds(self):
        token = self.enable()
        first = item(content_id="c1-ru", service_id="visa-c1", campaign_code="autumn")
        self.assertEqual(self.ingest(token, [first])["accepted"], 1)
        self.assertEqual(self.ingest(token, [first])["replayed"], 1)
        self.assertEqual(self.db.query(AnalyticsDailyAggregate).one().event_count, 1)
        modified = first.model_copy(update={"country": "ID"})
        with self.assertRaisesRegex(service.AnalyticsBlocked, "key_conflict"):
            service.ingest(self.db, AnalyticsBatch(events=[item(), modified]), token, now=NOW)
        self.db.rollback()
        self.assertEqual(self.db.query(AnalyticsEvent).count(), 1)
        self.assertEqual(self.db.query(AnalyticsDailyAggregate).one().event_count, 1)
        with self.assertRaises(ValidationError):
            AnalyticsBatch(events=[item() for _ in range(21)])
        with patch.object(service, "EVENTS_PER_MINUTE", 2):
            with self.assertRaisesRegex(service.AnalyticsBlocked, "rate_exceeded"):
                self.ingest(token, [item(), item()])
        self.assertEqual(self.db.query(AnalyticsEvent).count(), 1)

    def test_verified_owner_role_staff_scopes_and_technical_raw_excludes_finance(self):
        token = self.enable()
        for _ in range(5):
            self.ingest(token, [item(service_id="visa-c1"), item(service_id="housing")])
        self.ingest(token, [AnalyticsEventInput(event_key=uuid4(), event_name="payment_success", service_id="housing", amount="500", currency="USD")], trusted=True)
        with self.assertRaisesRegex(service.AnalyticsBlocked, "denied"):
            service.raw_events(self.db, self.staff, now=NOW)
        with self.assertRaisesRegex(service.AnalyticsBlocked, "owner_required"):
            service.set_access(self.db, AnalyticsGrantInput(user_id=self.staff.id, capability="technical_raw", active=True), self.staff, NOW)
        service.set_access(self.db, AnalyticsGrantInput(user_id=self.staff.id, capability="aggregate", active=True,
            allowed_service_ids=["visa-c1"]), self.root, NOW)
        service.set_access(self.db, AnalyticsGrantInput(user_id=self.tech.id, capability="technical_raw", active=True), self.root, NOW)
        self.db.commit()
        view = service.aggregates(self.db, self.staff, NOW.date(), NOW.date(), NOW)
        self.assertEqual([row["service_id"] for row in view["items"]], ["visa-c1"])
        self.assertNotIn("session_key", str(view))
        self.assertNotIn("campaign_code", str(view))
        technical = service.raw_events(self.db, self.tech, now=NOW)
        self.assertEqual(technical["scope"], "technical_only")
        self.assertNotIn("payment_success", str(technical))
        self.assertEqual(len(service.raw_events(self.db, self.root, now=NOW)["items"]), 11)
        wrong_root = User(id=999, telegram_id=999, role="admin", status="active", ref_code="wrong")
        with self.assertRaisesRegex(service.AnalyticsBlocked, "denied"):
            service.raw_events(self.db, wrong_root, now=NOW)
        service.set_access(self.db, AnalyticsGrantInput(user_id=self.tech.id, capability="technical_raw", active=False), self.root, NOW)
        self.db.commit()
        with self.assertRaisesRegex(service.AnalyticsBlocked, "denied"):
            service.raw_events(self.db, self.tech, now=NOW)

    def test_calendar_retention_synthetic_only_keeps_aggregates_and_crm(self):
        token = self.enable()
        self.ingest(token, [item()])
        event = self.db.query(AnalyticsEvent).one()
        event.received_at = service.subtract_months(NOW, 13) - timedelta(seconds=1)
        aggregate = self.db.query(AnalyticsDailyAggregate).one()
        self.db.add(AnalyticsDailyAggregate(day=date(2022, 1, 1), dimension_key="f" * 64,
                                           event_name="page_view", event_count=1, amount_total=0))
        self.db.commit()
        user_before = [(row.id, row.ref_code) for row in self.db.query(User)]
        with self.assertRaisesRegex(service.AnalyticsBlocked, "owner_required"):
            service.apply_retention(self.db, self.staff, NOW)
        self.assertEqual(service.retention_preview(self.db, NOW)["events"], 1)
        service.apply_retention(self.db, self.root, NOW)
        self.db.commit()
        self.assertEqual(self.db.query(AnalyticsEvent).count(), 0)
        self.assertEqual(self.db.query(AnalyticsDailyAggregate).count(), 1)
        self.assertEqual(self.db.query(AnalyticsDailyAggregate).one().id, aggregate.id)
        self.assertEqual([(row.id, row.ref_code) for row in self.db.query(User)], user_before)
        self.assertEqual(service.subtract_months(datetime(2024, 3, 31), 1), datetime(2024, 2, 29))

    def test_http_origin_consent_signals_cookie_and_bounded_nonreflective_validation(self):
        token = self.enable()
        app = FastAPI()
        app.include_router(api.public_router)
        app.include_router(api.service_router)
        origin = "https://safrway.example"
        client = TestClient(app, base_url=origin)
        with patch.object(api, "SessionLocal", self.Session), patch.object(api.settings, "WEBSITE_URL", origin), patch.object(api.settings, "APPLICATION_URL", origin):
            denied = client.post("/api/analytics/consent", json={"granted": True, "policy_revision": 1}, headers={"Origin": "https://evil.example"})
            self.assertEqual(denied.status_code, 403)
            issued = client.post("/api/analytics/consent", json={"granted": True, "policy_revision": 1}, headers={"Origin": origin})
            self.assertEqual(issued.status_code, 200)
            self.assertIn("HttpOnly", issued.headers["set-cookie"])
            self.assertIn("Secure", issued.headers["set-cookie"])
            self.assertIn("SameSite=strict", issued.headers["set-cookie"])
            accepted = client.post("/api/analytics/events", json={"events": [{"event_key": str(uuid4()), "event_name": "page_view",
                "content_id": "c1.ru", "service_id": "visa-c1"}]}, headers={"Origin": origin})
            self.assertEqual(accepted.status_code, 200)
            self.assertEqual(accepted.json()["accepted"], 1)
            payload = {"events": [{"event_key": str(uuid4()), "event_name": "page_view", "email": "do-not-reflect@example.invalid"}]}
            bad = client.post("/api/analytics/events", json=payload, headers={"Origin": origin})
            self.assertEqual(bad.status_code, 422)
            self.assertNotIn("do-not-reflect", bad.text)
            huge = client.post("/api/analytics/events", content=b"x" * 17000, headers={"Origin": origin, "Content-Type": "application/json"})
            self.assertEqual(huge.status_code, 413)
            denied = client.post("/api/analytics/events", json={"events": [{"event_key": str(uuid4()), "event_name": "page_view"}]}, headers={"Origin": origin, "Sec-GPC": "1"})
            self.assertEqual(denied.status_code, 403)
            projection = client.get("/api/analytics/policy", headers={"DNT": "1"})
            self.assertFalse(projection.json()["enabled"])
            self.assertEqual(projection.headers["cache-control"], "private, no-store")
            trusted = client.post("/api/service/analytics/events", json={"events": [{"event_key": str(uuid4()), "event_name": "page_view"}]})
            self.assertEqual(trusted.status_code, 401)

    def test_http_policy_consent_status_matches_server_receipt_not_client_storage(self):
        self.enable()
        app = FastAPI()
        app.include_router(api.public_router)
        origin = "https://safrway.example"
        client = TestClient(app, base_url=origin)
        with patch.object(api, "SessionLocal", self.Session), patch.object(api.settings, "WEBSITE_URL", origin), patch.object(api.settings, "APPLICATION_URL", origin):
            initial = client.get("/api/analytics/policy").json()
            self.assertTrue(initial["enabled"])
            self.assertFalse(initial["has_consent"])
            self.assertEqual(client.post("/api/analytics/consent", json={"granted": True, "policy_revision": 1},
                headers={"Origin": origin}).status_code, 200)
            self.assertTrue(client.get("/api/analytics/policy").json()["has_consent"])
            token = client.cookies.get(api.COOKIE_NAME)
            service.revoke_consent(self.db, token, NOW)
            self.db.commit()
            self.assertFalse(client.get("/api/analytics/policy").json()["has_consent"])
            self.assertEqual(client.post("/api/analytics/consent", json={"granted": True, "policy_revision": 1},
                headers={"Origin": origin}).status_code, 200)
            self.assertTrue(client.get("/api/analytics/policy").json()["has_consent"])
            self.db.get(AnalyticsPolicy, 1).revision = 2
            self.db.commit()
            self.assertFalse(client.get("/api/analytics/policy").json()["has_consent"])
            policy = self.db.get(AnalyticsPolicy, 1)
            policy.revision = 1
            policy.privacy_notice_version = None
            self.db.commit()
            malformed = client.get("/api/analytics/policy").json()
            self.assertFalse(malformed["enabled"])
            self.assertFalse(malformed["has_consent"])

    def test_local_maintenance_preview_hash_actor_and_sql_write_boundary(self):
        token = self.enable()
        self.ingest(token, [item()])
        event = self.db.query(AnalyticsEvent).one()
        event.received_at = service.subtract_months(NOW, 13) - timedelta(seconds=1)
        self.db.commit()
        args = SimpleNamespace(apply=False, actor_user_id=None, as_of=NOW.isoformat(), expected_preview_hash=None)
        preview = maintenance.execute(self.db, args, now=NOW)
        self.assertEqual(preview["mode"], "PREVIEW")
        self.assertEqual(preview["events"], 1)
        self.assertEqual(self.db.query(AnalyticsEvent).count(), 1)
        self.db.rollback()
        args.apply = True
        with self.assertRaisesRegex(maintenance.SafetyError, "requires_actor"):
            maintenance.execute(self.db, args, now=NOW)
        args.actor_user_id = self.staff.id
        args.expected_preview_hash = preview["preview_hash"]
        with self.assertRaisesRegex(maintenance.SafetyError, "active_root"):
            maintenance.execute(self.db, args, now=NOW)
        self.db.rollback()
        args.actor_user_id = self.root.id
        args.expected_preview_hash = "f" * 64
        with self.assertRaisesRegex(maintenance.SafetyError, "preview_changed"):
            maintenance.execute(self.db, args, now=NOW)
        self.db.rollback()
        args.expected_preview_hash = preview["preview_hash"]
        before_users = [(user.id, user.ref_code) for user in self.db.query(User)]
        self.db.rollback()
        applied = maintenance.execute(self.db, args, now=NOW)
        self.assertEqual(applied["mode"], "APPLIED_LOCAL")
        self.assertEqual(self.db.query(AnalyticsEvent).count(), 0)
        self.assertEqual(self.db.query(AnalyticsDailyAggregate).count(), 1)
        self.assertEqual([(user.id, user.ref_code) for user in self.db.query(User)], before_users)
        self.db.rollback()
        with maintenance.sql_boundary(self.db, apply=False), self.assertRaisesRegex(maintenance.SafetyError, "write_boundary"):
            self.db.query(User).filter(User.id == self.staff.id).delete(synchronize_session=False)
        self.db.rollback()
        with self.assertRaisesRegex(maintenance.SafetyError, "future"):
            maintenance.parse_time((NOW + timedelta(days=1)).isoformat(), clock=NOW)

    def test_local_maintenance_cli_ignores_environment_dsn_and_cwd_dotenv(self):
        script = Path(maintenance.__file__).resolve()
        with tempfile.TemporaryDirectory(prefix="safr-analytics-cli-") as folder:
            target = Path(folder) / "synthetic with spaces.sqlite"
            engine = create_engine("sqlite+pysqlite:///" + str(target))
            Base.metadata.create_all(engine, tables=TABLES)
            with sessionmaker(bind=engine)() as db:
                db.add(User(id=1, telegram_id=701, role="admin", status="active", ref_code="offline-root"))
                db.add(AnalyticsPolicy(id=1, revision=0, enabled=False, allowed_content_ids=[],
                    allowed_service_ids=[], allowed_campaign_codes=[], updated_at=NOW))
                db.commit()
            engine.dispose()
            # Deliberately hostile synthetic config; subprocess must neither read
            # this .env nor connect the network-capable inherited DATABASE_URL.
            (Path(folder) / ".env").write_text("DATABASE_URL=postgresql://must-not-connect.invalid/private\n", encoding="utf-8")
            env = {"PATH": "/usr/bin:/bin", "DATABASE_URL": "postgresql://must-not-connect.invalid/private",
                   "SQL_ECHO": "true", "DEFAULT_ADMIN_TELEGRAM_ID": "701"}
            call = [sys.executable, str(script), "--sqlite-file", str(target)]
            completed = subprocess.run(call, cwd=folder, env=env, capture_output=True, text=True, timeout=10)
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            payload = __import__("json").loads(completed.stdout)
            self.assertEqual(payload["mode"], "PREVIEW")
            self.assertNotIn("must-not-connect", completed.stdout + completed.stderr)
            self.assertNotIn("offline-root", completed.stdout + completed.stderr)
            apply = subprocess.run(call + ["--apply", "--actor-user-id", "1", "--as-of", payload["as_of"],
                "--expected-preview-hash", payload["preview_hash"]], cwd=folder, env=env,
                capture_output=True, text=True, timeout=10)
            self.assertEqual(apply.returncode, 0, apply.stdout + apply.stderr)
            self.assertEqual(__import__("json").loads(apply.stdout)["mode"], "APPLIED_LOCAL")
            denied = subprocess.run(call, cwd=folder, env={**env, "ENVIRONMENT": "production"},
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(denied.returncode, 2)
            self.assertNotIn("private", denied.stdout)


class AnalyticsMigrationTests(unittest.TestCase):
    def test_isolated_additive_upgrade_downgrade_upgrade_and_backup_restore(self):
        source = Path(__file__).resolve().parents[1] / "alembic/versions/a7e4c9d2f105_add_first_party_analytics.py"
        spec = importlib.util.spec_from_file_location("analytics_migration", source)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        with tempfile.TemporaryDirectory(prefix="safr-analytics-synthetic-") as temp:
            database_path = str(Path(temp) / "synthetic.sqlite")
            engine = create_engine("sqlite+pysqlite:///" + database_path)
            with engine.begin() as connection:
                connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)"))
                connection.execute(text("INSERT INTO users VALUES (1, 'synthetic-preserve')"))
                operations = Operations(MigrationContext.configure(connection))
                with patch.object(migration, "op", operations):
                    migration.upgrade()
                    self.assertFalse(connection.execute(text("SELECT enabled FROM analytics_policy")).scalar_one())
                    migration.downgrade()
                    self.assertNotIn("analytics_events", inspect(connection).get_table_names())
                    migration.upgrade()
                    self.assertEqual(connection.execute(text("SELECT marker FROM users")).scalar_one(), "synthetic-preserve")
            engine.dispose()
            # SQLite backup API proves isolated restore content; not a production
            # PostgreSQL restore proof, and no live database is opened here.
            with sqlite3.connect(database_path) as original, sqlite3.connect(str(Path(temp) / "restore.sqlite")) as restored:
                original.backup(restored)
                self.assertEqual(restored.execute("SELECT marker FROM users").fetchone()[0], "synthetic-preserve")
                self.assertEqual(restored.execute("SELECT revision, enabled FROM analytics_policy").fetchone(), (0, 0))
            engine = create_engine("sqlite+pysqlite:///" + database_path)
            with engine.begin() as connection:
                connection.execute(text("UPDATE analytics_policy SET revision=1"))
                operations = Operations(MigrationContext.configure(connection))
                with patch.object(migration, "op", operations), self.assertRaisesRegex(RuntimeError, "history exists"):
                    migration.downgrade()
                self.assertIn("analytics_events", inspect(connection).get_table_names())
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
