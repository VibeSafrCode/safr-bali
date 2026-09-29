"""Opt-in synthetic Unix-socket PostgreSQL checks; never uses application DB.

The prior schema is current metadata minus this additive migration. These tests
validate this migration and real locking, not the complete historical chain.
"""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from threading import Barrier

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SERVICE_API_TOKEN", "test-service")
os.environ.setdefault("ADMIN_API_TOKEN", "test-admin")

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

import app.models
from app.core.config import settings
from app.db.base import Base
from app.models.admin_safety import BusinessSettingVersion
from app.models.life_services import LifeService
from app.models.service_reminders import ServiceExpiryDelivery as Delivery
from app.models.user import User
from app.schemas.service_reminders import ReminderPolicy, ReminderSettlement
from app.services import service_reminders as service
from tests.test_service_reminders import NOW, life


PRIOR = "a9c28b017d60"
REVISION = "b7d2e6a9c410"


@pytest.fixture
def pg(monkeypatch):
    raw_url = os.environ.get("BALI_REMINDER_PG_TEST_URL")
    if not raw_url:
        pytest.skip("Explicit isolated PostgreSQL socket URL required")
    url = make_url(raw_url)
    assert url.drivername == "postgresql+psycopg" and not url.host
    assert str(url.query.get("host", "")).startswith("/private/tmp/safr-reminder-pg.")
    control = create_engine(url, isolation_level="AUTOCOMMIT")
    database = "reminder_test_" + uuid.uuid4().hex
    with control.connect() as conn:
        assert conn.execute(text("SHOW listen_addresses")).scalar() == ""
        assert conn.execute(text("SELECT inet_server_addr()")).scalar() is None
        conn.execute(text(f"CREATE DATABASE {database}"))
    control.dispose()
    test_url = url.set(database=database)
    engine = create_engine(test_url, connect_args={"options": "-c statement_timeout=10000 -c lock_timeout=5000"})
    Base.metadata.create_all(engine, tables=[table for name, table in Base.metadata.tables.items()
                                           if name != "service_expiry_deliveries"])
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE life_services DROP COLUMN notifications_enabled"))
        conn.execute(text("DROP INDEX ix_life_services_expiry"))
        conn.execute(text("DROP INDEX ix_visa_cases_expiry"))
    monkeypatch.setattr(settings, "DATABASE_URL", test_url.render_as_string(hide_password=False).replace("%2F", "/"))
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    command.stamp(config, PRIOR)
    sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with sessions() as db:
        db.add_all([
            User(id=1, telegram_id=101, ref_code="synthetic-admin", role="admin", status="active", bot_status="active"),
            User(id=2, telegram_id=102, ref_code="synthetic-client", role="client", status="active", bot_status="active"),
        ])
        db.commit()
    yield engine, sessions, config
    engine.dispose()


def activate(sessions):
    with sessions() as db:
        source = life(db)
        service.change_policy(db, expected_version=0, policy=ReminderPolicy(enabled=True),
                              reason="Synthetic activation", actor=db.get(User, 1))
        db.commit()
        return source.id


def concurrently(*calls):
    barrier = Barrier(len(calls))

    def run(call):
        barrier.wait(timeout=10)
        return call()

    with ThreadPoolExecutor(max_workers=len(calls)) as pool:
        return list(pool.map(run, calls))


def test_pristine_upgrade_downgrade_upgrade_and_owner(pg):
    engine, sessions, config = pg
    baseline = set(inspect(engine).get_table_names())
    command.upgrade(config, REVISION)
    assert set(inspect(engine).get_table_names()) == baseline | {"service_expiry_deliveries"}
    with sessions() as db:
        assert service.current_policy(db) == (0, ReminderPolicy())
        assert service.claim(db, now=NOW) == []
        owners = db.execute(text("SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname=current_schema() "
                                 "AND tablename IN ('users','service_expiry_deliveries')")).all()
        assert len(owners) == 1
    command.downgrade(config, PRIOR)
    assert set(inspect(engine).get_table_names()) == baseline
    assert "notifications_enabled" not in {column["name"] for column in inspect(engine).get_columns("life_services")}
    command.upgrade(config, REVISION)
    with sessions() as db:
        assert db.get(User, 2).ref_code == "synthetic-client"
        assert db.execute(text("SELECT version_num FROM alembic_version")).scalar() == REVISION
        row = life(db)
        db.commit()
        assert row.notifications_enabled is True


@pytest.mark.parametrize("history", ["ledger", "consent", "policy"])
def test_used_downgrade_refused_without_data_loss(pg, history):
    engine, sessions, config = pg
    command.upgrade(config, REVISION)
    with sessions() as db:
        source = life(db, notifications_enabled=history != "consent")
        if history == "ledger":
            db.add(Delivery(life_service_id=source.id, recipient_user_id=2, end_date=source.end_date,
                           offset_days=15, policy_version=1, dedupe_key="synthetic-used-ledger",
                           state="UNKNOWN", due_at=NOW, attempts=1))
        elif history == "policy":
            service.change_policy(db, expected_version=0, policy=ReminderPolicy(),
                                  reason="Synthetic saved policy", actor=db.get(User, 1))
        db.commit()
    with pytest.raises(RuntimeError, match="state or history exists"):
        command.downgrade(config, PRIOR)
    with sessions() as db:
        assert db.query(LifeService).count() == 1
        assert db.query(Delivery).count() == (1 if history == "ledger" else 0)
        assert db.query(BusinessSettingVersion).count() == (1 if history == "policy" else 0)
        assert db.query(LifeService).one().notifications_enabled is (history != "consent")
        assert db.execute(text("SELECT version_num FROM alembic_version")).scalar() == REVISION


def test_concurrent_claim_settlement_replay_and_unknown_no_retry(pg):
    _, sessions, config = pg
    command.upgrade(config, REVISION)
    source_id = activate(sessions)

    def claim(now=NOW):
        with sessions() as db:
            result = service.claim(db, now=now)
            db.commit()
            return result

    results = concurrently(claim, claim)
    assert sorted(len(items) for items in results) == [0, 1]
    item = next(items[0] for items in results if items)
    settlement = ReminderSettlement(lease_token=item["lease_token"], state="DELIVERED", telegram_message_id="42")

    def settle():
        with sessions() as db:
            result = service.settle(db, item["id"], settlement, now=NOW)
            db.commit()
            return result.state

    assert concurrently(settle, settle) == ["DELIVERED", "DELIVERED"]
    assert claim() == []
    with sessions() as db:
        db.get(LifeService, source_id).end_date -= timedelta(days=8)
        db.commit()
    next_item = claim()[0]
    assert claim(NOW + timedelta(minutes=3)) == []
    with sessions() as db:
        assert db.query(Delivery).count() == 2
        assert db.get(Delivery, next_item["id"]).state == "UNKNOWN"
        assert db.get(Delivery, next_item["id"]).attempts == 1


def test_concurrent_policy_cas_has_one_winner(pg):
    _, sessions, config = pg
    command.upgrade(config, REVISION)

    def save():
        with sessions() as db:
            try:
                service.change_policy(db, expected_version=0, policy=ReminderPolicy(),
                                      reason="Concurrent synthetic save", actor=db.get(User, 1))
                db.commit()
                return "saved"
            except service.ReminderConflict:
                db.rollback()
                return "conflict"

    assert sorted(concurrently(save, save)) == ["conflict", "saved"]
    with sessions() as db:
        assert db.query(BusinessSettingVersion).count() == 1
        assert service.current_policy(db)[0] == 1
