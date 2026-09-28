from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import app.models
from app.db.base import Base
from app.models.user import User
from app.models.onboarding import OnboardingState, OnboardingVersion, OnboardingDelivery
from app.services import onboarding as svc

NOW = datetime(2026, 9, 28, 12, tzinfo=timezone.utc)


@pytest.fixture
def scenario():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, expire_on_commit=False)()
    user = User(telegram_id=123, ref_code="onboard-fixture", status="active", bot_status="active")
    db.add(user)
    db.flush()
    content = svc.seed_draft()
    db.add(OnboardingVersion(version=1, content=content, created_at=NOW, created_by=user.id))
    db.add(OnboardingState(id=1, revision=0, enabled=True, activation_cutoff=NOW,
        published_version=1, draft=content))
    db.commit()
    yield db, user
    db.close()


def enroll(db, user):
    result = svc.enroll(db, user, event="telegram-start:123:1", occurred_at=NOW, verified_new=True, now=NOW)
    db.commit()
    return result


def delivered(db, item, now):
    svc.settle(db, item["id"], item["lease_token"], "DELIVERED", str(item["id"]), now=now)
    db.commit()


def test_seed_is_losslessly_split_into_two_plain_messages():
    content = svc.seed_draft()
    parts = svc.split_welcome(content["welcome_text"])
    assert len(parts) == 2
    assert "".join(parts) == content["welcome_text"]
    assert parts[1].startswith(("📱", "🏝", "🛠", "👤", "🌍", "💬"))
    assert all(len(part.encode("utf-16-le")) // 2 <= 4096 for part in parts)
    assert content["followup_text"] == "Все ли вам понятно? Есть ли у вас вопросы?"
    assert not svc.preview({"welcome_text": "x" * 9000, "followup_text": "?"})["valid"]


def test_old_unknown_and_disabled_do_not_enroll(scenario):
    db, user = scenario
    assert svc.enroll(db, user, event="telegram-start:123:1", occurred_at=NOW - timedelta(seconds=1), verified_new=True, now=NOW) is None
    assert svc.enroll(db, user, event="unknown", occurred_at=NOW, verified_new=False, now=NOW) is None
    svc.state(db).enabled = False
    assert svc.enroll(db, user, event="off", occurred_at=NOW, verified_new=True, now=NOW) is None
    assert db.query(OnboardingDelivery).count() == 0


def test_timing_and_snapshot_follow_last_part(scenario):
    db, user = scenario
    enroll(db, user)
    assert svc.claim(db, NOW + timedelta(minutes=14, seconds=59)) == []
    first = svc.claim(db, NOW + timedelta(minutes=15))[0]
    db.commit()
    # Publication changes after first claim must not affect this chain.
    db.add(OnboardingVersion(version=2, content={"welcome_text": "changed", "followup_text": "changed"}, created_at=NOW, created_by=user.id))
    svc.state(db).published_version = 2
    db.commit()
    delivered(db, first, NOW + timedelta(minutes=16))
    second = svc.claim(db, NOW + timedelta(minutes=16))[0]
    assert second["step"] == "welcome_2"
    delivered(db, second, NOW + timedelta(minutes=20))
    assert svc.claim(db, NOW + timedelta(minutes=79, seconds=59)) == []
    followup = svc.claim(db, NOW + timedelta(minutes=80))[0]
    assert followup["step"] == "followup"
    assert followup["text"] == svc.seed_draft()["followup_text"]


@pytest.mark.parametrize("outcome", ["FAILED", "UNKNOWN"])
def test_partial_failure_never_schedules_followup(scenario, outcome):
    db, user = scenario
    enroll(db, user)
    first = svc.claim(db, NOW + timedelta(minutes=15))[0]
    delivered(db, first, NOW + timedelta(minutes=15))
    second = svc.claim(db, NOW + timedelta(minutes=15))[0]
    svc.settle(db, second["id"], second["lease_token"], outcome, now=NOW + timedelta(minutes=15))
    db.commit()
    assert svc.claim(db, NOW + timedelta(days=1)) == []
    assert not db.query(OnboardingDelivery).filter_by(step="followup").first()


def test_expired_claim_is_unknown_after_restart_and_not_resent(scenario):
    db, user = scenario
    enroll(db, user)
    first = svc.claim(db, NOW + timedelta(minutes=15))[0]
    db.commit()
    db.expire_all()
    assert svc.claim(db, NOW + timedelta(minutes=18)) == []
    assert db.get(OnboardingDelivery, first["id"]).state == "UNKNOWN"


def test_duplicate_ack_and_help_callbacks_create_no_duplicates(scenario):
    db, user = scenario
    enrollment = enroll(db, user)
    first = svc.claim(db, NOW + timedelta(minutes=15))[0]
    delivered(db, first, NOW + timedelta(minutes=15))
    delivered(db, first, NOW + timedelta(minutes=15))
    assert db.query(OnboardingDelivery).filter_by(step="welcome_2").count() == 1
    second = svc.claim(db, NOW + timedelta(minutes=15))[0]
    delivered(db, second, NOW + timedelta(minutes=15))
    followup = svc.claim(db, NOW + timedelta(minutes=75))[0]
    delivered(db, followup, NOW + timedelta(minutes=75))
    with pytest.raises(ValueError):
        svc.request_help(db, enrollment.id, 999, [10], NOW)
    assert not svc.request_help(db, enrollment.id, 123, [10, 11, 11], NOW)["replay"]
    db.commit()
    assert svc.request_help(db, enrollment.id, 123, [10, 11], NOW)["replay"]
    assert db.query(OnboardingDelivery).filter_by(step="help").count() == 2
    assert svc.can_reply(db, enrollment.id, 11)
    assert not svc.can_reply(db, enrollment.id, 12)


def test_disable_reenable_does_not_continue_inflight_old_epoch(scenario):
    db, user = scenario
    enroll(db, user)
    first = svc.claim(db, NOW + timedelta(minutes=15))[0]
    db.commit()
    svc.state(db).activation_cutoff = NOW + timedelta(minutes=16)
    delivered(db, first, NOW + timedelta(minutes=17))
    assert db.query(OnboardingDelivery).count() == 1


def test_admin_revision_and_root_permissions(scenario, monkeypatch):
    from fastapi import HTTPException
    from app.api import onboarding as api
    from app.api.web_admin import require_web_admin
    db, user = scenario
    monkeypatch.setattr(api, "SessionLocal", sessionmaker(bind=db.get_bind(), expire_on_commit=False))
    with pytest.raises(HTTPException) as denied:
        require_web_admin(user)
    assert denied.value.status_code == 403
    with pytest.raises(HTTPException) as conflict:
        api.draft(api.Draft(expected_revision=99, welcome_text="hello", followup_text="?"), user)
    assert conflict.value.status_code == 409
    saved = api.draft(api.Draft(expected_revision=0, welcome_text="<hello>", followup_text="?"), user)
    assert saved["revision"] == 1 and saved["draft"]["welcome_text"] == "<hello>"
    assert saved["published_version"] == 1
    published = api.publish(api.Revision(expected_revision=1), user)
    assert published["published_version"] == 2
    restored = api.restore(api.Restore(expected_revision=2, version=1), user)
    assert restored["published_version"] == 3
    assert restored["versions"][0]["restored_from_version"] == 1


def test_additive_migration_matches_models_and_starts_disabled():
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import inspect, text
    path = Path(__file__).resolve().parents[1] / "alembic/versions/a9c28b017d60_add_onboarding.py"
    spec = importlib.util.spec_from_file_location("onboarding_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        User.__table__.create(connection)
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        schema = inspect(connection)
        for name in ("onboarding_state", "onboarding_versions", "onboarding_enrollments", "onboarding_deliveries"):
            assert {c["name"] for c in schema.get_columns(name)} == set(Base.metadata.tables[name].columns.keys())
        assert connection.execute(text("SELECT enabled FROM onboarding_state")).scalar() == 0
        assert connection.execute(text("SELECT COUNT(*) FROM onboarding_deliveries")).scalar() == 0


def test_disable_suppresses_pending_and_reenable_does_not_recreate(scenario, monkeypatch):
    from app.api import onboarding as api
    db, user = scenario
    enroll(db, user)
    monkeypatch.setattr(api, "SessionLocal", sessionmaker(bind=db.get_bind(), expire_on_commit=False))
    off = api.toggle(api.Toggle(expected_revision=0, enabled=False), user)
    assert not off["enabled"]
    api.toggle(api.Toggle(expected_revision=1, enabled=True), user)
    db.expire_all()
    assert db.query(OnboardingDelivery).one().state == "SUPPRESSED"
    assert svc.claim(db, NOW + timedelta(days=1)) == []


def test_durable_positive_receipt_can_resolve_expired_claim_once(scenario):
    db, user = scenario
    enroll(db, user)
    first = svc.claim(db, NOW + timedelta(minutes=15))[0]
    db.commit()
    assert svc.claim(db, NOW + timedelta(minutes=18)) == []
    with pytest.raises(ValueError):
        svc.settle(db, first["id"], "wrong", "DELIVERED", "101", now=NOW + timedelta(minutes=20),
            confirmed_at=NOW + timedelta(minutes=15))
    svc.settle(db, first["id"], first["lease_token"], "DELIVERED", "101", now=NOW + timedelta(minutes=20),
        confirmed_at=NOW + timedelta(minutes=15))
    db.commit()
    second = svc.claim(db, NOW + timedelta(minutes=20))[0]
    db.commit()
    svc.claim(db, NOW + timedelta(minutes=23))
    svc.settle(db, second["id"], second["lease_token"], "DELIVERED", "102", now=NOW + timedelta(minutes=50),
        confirmed_at=NOW + timedelta(minutes=20))
    db.commit()
    svc.settle(db, second["id"], second["lease_token"], "DELIVERED", "102", now=NOW + timedelta(minutes=51),
        confirmed_at=NOW + timedelta(minutes=20))
    db.commit()
    followup = db.query(OnboardingDelivery).filter_by(step="followup").one()
    assert svc.utc(followup.due_at) == NOW + timedelta(minutes=80)
