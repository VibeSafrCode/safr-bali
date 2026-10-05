"""Opt-in, synthetic socket-only PostgreSQL gate; never uses application DATABASE_URL.

Baseline is current Base metadata excluding the four onboarding tables, stamped
f2c8a4d6e901. This verifies the additive migration, not the historical full chain.
"""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from threading import Barrier

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

import app.models
from app.core.config import settings
from app.db.base import Base
from app.models.user import User
from app.models.onboarding import OnboardingState, OnboardingVersion, OnboardingDelivery
from app.services import onboarding as svc

PRIOR = "f2c8a4d6e901"
REVISION = "a9c28b017d60"
TABLES = {"onboarding_state", "onboarding_versions", "onboarding_enrollments", "onboarding_deliveries"}


@pytest.fixture
def pg(monkeypatch):
    raw_url = os.environ.get("BALI_ONBOARDING_PG_TEST_URL")
    if not raw_url:
        pytest.skip("Explicit isolated PostgreSQL socket URL required")
    url = make_url(raw_url)
    assert url.drivername == "postgresql+psycopg" and not url.host
    assert str(url.query.get("host", "")).startswith("/private/tmp/bali-onboarding-pg.")
    control = create_engine(url, isolation_level="AUTOCOMMIT")
    name = "onboarding_test_" + uuid.uuid4().hex
    with control.connect() as connection:
        assert connection.execute(text("SHOW listen_addresses")).scalar() == ""
        assert connection.execute(text("SELECT inet_server_addr()")).scalar() is None
        connection.execute(text(f"CREATE DATABASE {name}"))
    control.dispose()
    test_url = url.set(database=name)
    engine = create_engine(test_url)
    Base.metadata.create_all(engine, tables=[table for name, table in Base.metadata.tables.items() if name not in TABLES])
    # Existing Alembic ConfigParser treats percent-encoded Unix path slashes as
    # interpolation; unescaped slashes are legal in this controlled query value.
    monkeypatch.setattr(settings, "DATABASE_URL", test_url.render_as_string(hide_password=False).replace("%2F", "/"))
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    command.stamp(config, PRIOR)
    sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with sessions() as db:
        actor = User(telegram_id=91001, ref_code="pg-onboarding-synthetic", role="admin",
            status="active", bot_status="active")
        db.add(actor)
        db.commit()
        actor_id = actor.id
    yield engine, sessions, config, actor_id
    engine.dispose()


def test_pristine_upgrade_downgrade_upgrade_preserves_prior_tables(pg):
    engine, sessions, config, actor_id = pg
    baseline = set(inspect(engine).get_table_names())
    command.upgrade(config, REVISION)
    assert set(inspect(engine).get_table_names()) == baseline | TABLES
    command.downgrade(config, PRIOR)
    assert set(inspect(engine).get_table_names()) == baseline
    command.upgrade(config, REVISION)
    with sessions() as db:
        assert db.get(User, actor_id).ref_code == "pg-onboarding-synthetic"
        row = db.get(OnboardingState, 1)
        assert row.enabled is False and row.revision == 0 and row.draft == svc.seed_draft()
        assert db.query(OnboardingDelivery).count() == 0
        assert db.execute(text("SELECT version_num FROM alembic_version")).scalar() == REVISION


def prepare_active(sessions, actor_id):
    clock = svc.utc()
    with sessions() as db:
        actor = db.get(User, actor_id)
        db.add(OnboardingVersion(version=1, content=svc.seed_draft(), created_at=clock, created_by=actor_id))
        state = svc.state(db)
        state.enabled = True
        state.activation_cutoff = clock - timedelta(hours=1)
        state.published_version = 1
        db.flush()
        enrollment = svc.enroll(db, actor, event=f"telegram-start:{actor.telegram_id}:1",
            occurred_at=clock - timedelta(minutes=20), verified_new=True, now=clock)
        db.commit()
        return clock, enrollment.id


@pytest.mark.parametrize("changed", ["draft", "history"])
def test_guarded_downgrade_refuses_edits_or_history_without_data_loss(pg, changed):
    engine, sessions, config, actor_id = pg
    command.upgrade(config, REVISION)
    if changed == "history":
        prepare_active(sessions, actor_id)
    else:
        with sessions() as db:
            svc.state(db).draft = {"welcome_text": "Synthetic edited draft", "followup_text": "?"}
            db.commit()
    with sessions() as db:
        before = {table: db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() for table in TABLES}
        draft_before = db.get(OnboardingState, 1).draft
    with pytest.raises(RuntimeError, match="state or history"):
        command.downgrade(config, PRIOR)
    with sessions() as db:
        assert {table: db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() for table in TABLES} == before
        assert db.get(OnboardingState, 1).draft == draft_before
        assert db.execute(text("SELECT version_num FROM alembic_version")).scalar() == REVISION


def concurrently(*calls):
    barrier = Barrier(len(calls))
    def run(call):
        barrier.wait(timeout=10)
        return call()
    with ThreadPoolExecutor(max_workers=len(calls)) as pool:
        return list(pool.map(run, calls))


def test_concurrent_claim_duplicate_settle_and_disable_race(pg, monkeypatch):
    from app.api import onboarding as api
    engine, sessions, config, actor_id = pg
    command.upgrade(config, REVISION)
    clock, enrollment_id = prepare_active(sessions, actor_id)
    monkeypatch.setattr(api, "SessionLocal", sessions)

    def claim():
        with sessions() as db:
            rows = svc.claim(db, now=clock)
            db.commit()
            return rows
    claims = concurrently(claim, claim)
    assert sorted(len(rows) for rows in claims) == [0, 1]
    first = next(rows[0] for rows in claims if rows)

    def settle(item):
        with sessions() as db:
            result = svc.settle(db, item["id"], item["lease_token"], "DELIVERED", str(item["id"]), now=clock)
            db.commit()
            return result.state
    assert concurrently(lambda: settle(first), lambda: settle(first)) == ["DELIVERED", "DELIVERED"]
    with sessions() as db:
        assert db.query(OnboardingDelivery).filter_by(enrollment_id=enrollment_id, step="welcome_2").count() == 1
    second = claim()[0]

    def disable():
        with sessions() as db:
            actor = db.get(User, actor_id)
            return api.toggle(api.Toggle(expected_revision=0, enabled=False), actor)["enabled"]
    concurrently(lambda: settle(second), disable)
    with sessions() as db:
        assert db.get(OnboardingState, 1).enabled is False
        assert db.get(OnboardingDelivery, second["id"]).state == "DELIVERED"
        assert db.query(OnboardingDelivery).filter_by(state="PENDING").count() == 0
        assert db.query(OnboardingDelivery).filter_by(step="followup").count() <= 1
