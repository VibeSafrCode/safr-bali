"""Exact additive migration on an owned socket-only synthetic PostgreSQL DB.

Prior schema fixture is current Base with this migration's additions removed;
this is not evidence for replaying the entire historical migration chain.
"""
import importlib.util
import json
import os
from pathlib import Path
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool
import pytest

import app.models  # noqa: F401
from app.db.base import Base
from app.models.user import User
from app.core.config import settings
from app.models.bot_messaging import BotContact, BotCampaignRecipient
from app.models.onboarding import OnboardingState
from app.services import bot_messaging as service
from sqlalchemy.orm import sessionmaker
from tests.test_visa_workflow_postgres import owned_postgres


pytestmark = pytest.mark.skipif(
    not os.environ.get("BALI_TEST_POSTGRES_BIN"),
    reason="Explicit owned PostgreSQL binaries required; mandatory in CI",
)


@pytest.fixture
def messaging_database(owned_postgres):
    """A separate UUID database inside the already verified owned cluster."""
    source = owned_postgres.url
    socket = Path(source.host).resolve()
    assert source.drivername == "postgresql+psycopg"
    assert source.username == "visa_workflow_test" and source.password is None
    assert socket.name.startswith("visa-workflow-postgres-")
    assert socket.is_dir() and not socket.is_symlink()
    assert socket.stat().st_uid == os.getuid() and socket.stat().st_mode & 0o077 == 0
    assert source.port == 55432 and source.database == "postgres"
    name = "bot_messaging_test_" + uuid4().hex
    passfile = socket / "empty.pgpass"
    assert passfile.is_file() and passfile.read_bytes() == b""
    with owned_postgres.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
        assert c.execute(text("SHOW listen_addresses")).scalar_one() == ""
        assert c.execute(text("SELECT inet_server_addr()")).scalar_one() is None
        assert Path(c.execute(text("SHOW data_directory")).scalar_one()).resolve() == socket / "data"
        c.execute(text(f'CREATE DATABASE "{name}"'))
    engine = None
    try:
        url = source.set(database=name)
        engine = create_engine(url, poolclass=NullPool, connect_args={
            "connect_timeout": 2, "passfile": str(passfile),
            "options": "-c statement_timeout=10000 -c lock_timeout=5000",
        })
        with engine.connect() as c:
            assert c.execute(text("SHOW listen_addresses")).scalar_one() == ""
            assert c.execute(text("SELECT inet_server_addr()")).scalar_one() is None
            assert c.execute(text("SELECT current_database()")).scalar_one() == name
            assert c.execute(text("SELECT current_user")).scalar_one() == source.username
            assert Path(c.execute(text("SHOW data_directory")).scalar_one()).resolve() == socket / "data"
            assert c.execute(text("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).scalar_one() == 0
        yield engine
    finally:
        if engine is not None:
            engine.dispose()
        # Only the exact UUID database created above in this owned cluster.
        assert name.startswith("bot_messaging_test_") and len(name) == 51
        with owned_postgres.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
            c.execute(text(f'DROP DATABASE "{name}"'))


@pytest.fixture
def messaging_database_binding(request, messaging_database):
    request.cls.owned_messaging_engine = messaging_database
    try:
        yield
    finally:
        del request.cls.owned_messaging_engine


@pytest.mark.usefixtures("messaging_database_binding")
class BotMessagingMigrationTests(unittest.TestCase):
    def test_exact_migration_preserves_legacy_ids_content_and_disabled_state(self):
        engine = self.owned_messaging_engine
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                self.assertEqual(connection.execute(text("SHOW listen_addresses")).scalar_one(), "")
                self.assertIsNone(connection.execute(text("SELECT inet_server_addr()")).scalar_one())
                connection.execute(text("SET LOCAL lock_timeout='2s'"))
                connection.execute(text("SET LOCAL statement_timeout='10s'"))
                Base.metadata.create_all(connection)
                for table in ("bot_campaign_recipients", "bot_campaigns", "bot_contacts"):
                    Base.metadata.tables[table].drop(connection)
                connection.execute(text("ALTER TABLE onboarding_enrollments DROP CONSTRAINT uq_onboarding_user_bot"))
                for column in ("bot_key", "locale", "origin", "followup_enabled"):
                    connection.execute(text(f"ALTER TABLE onboarding_enrollments DROP COLUMN {column}"))
                connection.execute(text("ALTER TABLE onboarding_enrollments ADD CONSTRAINT onboarding_enrollments_user_id_key UNIQUE(user_id)"))
                connection.execute(text("ALTER TABLE onboarding_versions DROP COLUMN bot_key"))
                connection.execute(text("ALTER TABLE onboarding_state DROP COLUMN transport_not_before"))
                connection.execute(text("ALTER TABLE onboarding_deliveries DROP COLUMN attempts"))
                actor_id = connection.execute(User.__table__.insert().values(telegram_id=890001,
                    ref_code="synthetic-migration-root", role="admin", status="active",
                    bot_status="unknown", locale="ru")).inserted_primary_key[0]
                content = {"welcome_text": "Synthetic legacy exact text", "followup_text": "Synthetic question?"}
                connection.execute(text("INSERT INTO onboarding_versions(version,content,created_at,created_by) VALUES (7,CAST(:body AS JSON),now(),:actor)"), {"body": json.dumps(content), "actor": actor_id})
                connection.execute(text("INSERT INTO onboarding_state(id,revision,enabled,published_version,draft) VALUES (1,0,false,NULL,CAST(:body AS JSON))"), {"body": json.dumps(content)})
                enrollment_id = connection.execute(text("INSERT INTO onboarding_enrollments(user_id,registration_event,registered_at,activation_cutoff,content_version) VALUES (:actor,'synthetic-legacy-event',now(),now(),7) RETURNING id"), {"actor": actor_id}).scalar_one()
                path = Path(__file__).resolve().parents[1] / "alembic/versions/d4082b5a16c9_add_brand_messaging_campaigns.py"
                spec = importlib.util.spec_from_file_location("owned_messaging_migration", path)
                migration = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(migration)
                with Operations.context(MigrationContext.configure(connection)):
                    migration.upgrade()
                enrollment = connection.execute(text("SELECT id,user_id,bot_key,locale,origin,followup_enabled,content_version FROM onboarding_enrollments")).mappings().one()
                self.assertEqual(dict(enrollment), {"id": enrollment_id, "user_id": actor_id, "bot_key": "safrway", "locale": "ru", "origin": "registration", "followup_enabled": True, "content_version": 7})
                version = connection.execute(text("SELECT content,bot_key FROM onboarding_versions WHERE version=7")).mappings().one()
                self.assertEqual(version["content"], content)
                self.assertEqual(version["bot_key"], "safrway")
                for statement in ("UPDATE onboarding_versions SET content='{}' WHERE version=7", "DELETE FROM onboarding_versions WHERE version=7"):
                    with self.assertRaises(DBAPIError):
                        with connection.begin_nested():
                            connection.execute(text(statement))
                self.assertEqual(connection.execute(text("SELECT content FROM onboarding_versions WHERE version=7")).scalar_one(), content)
                for row in connection.execute(text("SELECT id,enabled,published_version FROM onboarding_state ORDER BY id")).mappings():
                    self.assertFalse(row["enabled"])
                    self.assertIsNone(row["published_version"])
                self.assertEqual(connection.execute(text("SELECT count(*) FROM bot_contacts")).scalar_one(), 0)
                unique = inspect(connection).get_unique_constraints("onboarding_enrollments")
                self.assertIn(["user_id", "bot_key"], [constraint["column_names"] for constraint in unique])
                for name in ("bot_contacts", "bot_campaigns", "bot_campaign_recipients"):
                    self.assertEqual(set(Base.metadata.tables[name].columns.keys()), {column["name"] for column in inspect(connection).get_columns(name)})
            finally:
                transaction.rollback()
        engine.dispose()


@pytest.mark.usefixtures("messaging_database_binding")
class BotMessagingConcurrentTests(unittest.TestCase):
    def test_two_bot_confirmations_can_include_the_same_root_recipient(self):
        base = self.owned_messaging_engine
        schema = "messaging_concurrency_" + uuid4().hex
        # A fresh, test-owned schema isolates committed two-session fixtures.
        with base.begin() as connection:
            self.assertEqual(connection.execute(text("SHOW listen_addresses")).scalar_one(), "")
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        engine = base.execution_options(schema_translate_map={None: schema})
        sessions = sessionmaker(bind=engine, expire_on_commit=False)
        try:
            Base.metadata.create_all(engine)
            now = datetime.now(timezone.utc)
            with sessions() as db:
                root = User(telegram_id=895001, ref_code="synthetic-parallel-root", first_name="Synthetic root",
                            role="admin", status="active", locale="ru")
                db.add(root); db.flush()
                for bot, state_id in (("safrway", 1), ("yoga", 2)):
                    db.add(OnboardingState(id=state_id, revision=0, enabled=False, draft={}))
                    db.add(BotContact(user_id=root.id, bot_key=bot, locale="ru", status="active",
                        source="synthetic_private_contact", first_contact_at=now, last_contact_at=now, last_event="synthetic"))
                db.commit()
                with patch.object(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id):
                    previews = []
                    for bot in ("safrway", "yoga"):
                        row = service.create_campaign(db, actor=root, bot_key=bot, kind="announcement",
                            title="Synthetic parallel", audience={}, content={"ru": "Сообщение", "en": "Message"})
                        previews.append(service.preview_campaign(db, row.id, actor=root, expected_revision=0))
                        db.commit()
                    barrier = Barrier(2)
                    original = service._root
                    def simultaneous_root_lock(db, actor):
                        result = original(db, actor)
                        barrier.wait(timeout=5)
                        return result
                    def confirm(preview):
                        with sessions() as worker:
                            worker.execute(text("SET LOCAL statement_timeout='8s'"))
                            row, _ = service.confirm_campaign(worker, preview["campaign_id"], actor=root,
                                expected_revision=preview["revision"], snapshot_sha256=preview["snapshot_sha256"],
                                idempotency_key="synthetic-parallel-" + preview["bot_key"])
                            worker.commit()
                            return row.state
                    with patch.object(service, "_root", simultaneous_root_lock), ThreadPoolExecutor(max_workers=2) as pool:
                        futures = [pool.submit(confirm, preview) for preview in previews]
                        self.assertEqual([future.result(timeout=12) for future in futures], ["QUEUED", "QUEUED"])
                    self.assertEqual(db.query(BotCampaignRecipient).count(), 2)
        finally:
            # Only this exact synthetic schema, never production/public tables.
            with base.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            base.dispose()


if __name__ == "__main__":
    unittest.main()
