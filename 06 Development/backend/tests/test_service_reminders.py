"""Synthetic fixtures only: no production database, network or Telegram sends."""
import os
from datetime import date, datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SERVICE_API_TOKEN", "test-service")
os.environ.setdefault("ADMIN_API_TOKEN", "test-admin")

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

import app.models
from app.core.config import settings
from app.db.base import Base
from app.models.admin_action import AdminAction
from app.models.admin_safety import BusinessSettingVersion
from app.models.life_services import LifeService
from app.models.service_reminders import ServiceExpiryDelivery as Delivery
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaType
from app.schemas.service_reminders import PolicyChange, ReminderPolicy, ReminderSettlement
from app.services import service_reminders as service


NOW = datetime(2030, 1, 1, 4, tzinfo=timezone.utc)
TODAY = date(2030, 1, 1)


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(settings, "VISA_LIFECYCLE_ENABLED", True)
    monkeypatch.setattr(settings, "CLIENT_CABINET_ENABLED", True)
    monkeypatch.setattr(settings, "ADMIN_CLIENT_CRM_ENABLED", True)
    with factory() as session:
        session.add_all([
            User(id=1, telegram_id=101, ref_code="root", role="admin", status="active", bot_status="active"),
            User(id=2, telegram_id=102, ref_code="client", role="client", status="active", bot_status="active"),
            User(id=3, telegram_id=103, ref_code="other", role="client", status="active", bot_status="active"),
        ])
        session.commit()
        yield session
    engine.dispose()


def life(db, *, remaining=15, term=90, **changes):
    end = TODAY + timedelta(days=remaining) if remaining is not None else None
    index = db.query(LifeService).count() + 1
    fields = dict(user_id=2, kind="housing", title="Synthetic rental", publication_status="PUBLISHED",
        start_date=end - timedelta(days=term) if end and term is not None else TODAY - timedelta(days=20), end_date=end,
        rental_mode="fixed", notifications_enabled=True, created_by_admin_id=1, updated_by_admin_id=1,
        create_idempotency_key=f"synthetic-life-{index}", create_payload_hash="a" * 64,
        owner_details="MUST NOT LEAK", internal_note="SECRET INTERNAL NOTE")
    fields.update(changes)
    row = LifeService(**fields)
    db.add(row)
    db.flush()
    return row


def visa(db, *, remaining=40, term=365, **changes):
    kind = VisaType(country_code="ID", code="FIXTURE", name="Synthetic visa", version=1)
    db.add(kind)
    db.flush()
    end = TODAY + timedelta(days=remaining)
    fields = dict(user_id=2, visa_type_id=kind.id, assigned_admin_id=1, publication_status="PUBLISHED",
        lifecycle_status="ACTIVE", notifications_enabled=True, stay_end=end,
        entered_on=end - timedelta(days=term) if term is not None else None,
        date_source="Synthetic confirmed date", dates_confirmed_by=1, dates_confirmed_at=NOW)
    fields.update(changes)
    row = VisaCase(**fields)
    db.add(row)
    db.flush()
    return row


def enable(db, **changes):
    policy = ReminderPolicy(enabled=True, **changes)
    version, _ = service.current_policy(db)
    service.change_policy(db, expected_version=version, policy=policy, reason="Synthetic policy update", actor=db.get(User, 1))
    db.commit()
    return policy


def materialize(db, *, now=NOW, limit=200):
    version, policy = service.current_policy(db)
    result = service.materialize(db, policy=policy, policy_version=version, now=now, limit=limit)
    db.commit()
    return result


@pytest.mark.parametrize("changes", [
    {"long_offsets": [15, 15]}, {"short_offsets": []}, {"short_offsets": [True]},
    {"long_offsets": [0]}, {"short_offsets": [3661]}, {"short_offsets": list(range(1, 14))},
    {"long_term_threshold_days": 0}, {"enabled": "true"}, {"timezone": "UTC"},
    {"monthly_basis": "automatic_monthly"}, {"surprise": True},
])
def test_invalid_policy_fails_closed(changes):
    with pytest.raises(ValidationError):
        ReminderPolicy(**changes)


def test_defaults_version_cas_restore_and_audit(db):
    assert service.policy_projection(db) == {"version": 0, "policy": ReminderPolicy().model_dump(), "versions": []}
    life(db)
    assert service.claim(db, now=NOW) == [] and db.query(Delivery).count() == 0
    with pytest.raises(ValidationError):
        PolicyChange(expected_version=0, policy=ReminderPolicy(), reason="   ")
    first = enable(db)
    assert service.current_policy(db)[0] == 1
    with pytest.raises(service.ReminderConflict):
        service.change_policy(db, expected_version=0, policy=ReminderPolicy(), reason="Stale change", actor=db.get(User, 1))
    db.rollback()
    enable(db, short_offsets=[1, 7, 3])
    service.change_policy(db, expected_version=2, policy=first, reason="Restore first", actor=db.get(User, 1), restored_from=1)
    db.commit()
    result = service.policy_projection(db)
    assert result["version"] == 3 and result["policy"] == first.model_dump()
    assert [v["version"] for v in result["versions"]] == [3, 2, 1]
    assert result["versions"][1]["policy"]["short_offsets"] == [7, 3, 1]
    assert db.query(AdminAction).count() == 3
    assert db.query(BusinessSettingVersion).filter_by(is_active=True).count() == 1


def test_full_duration_boundary_monthly_missing_start_and_no_invented_end(db):
    long = life(db, remaining=40, term=101)
    short = life(db, remaining=40, term=100)
    monthly = life(db, remaining=40, term=365, rental_mode="monthly")
    monthly_short = life(db, remaining=15, term=365, rental_mode="monthly")
    unknown = life(db, kind="insurance", remaining=15, start_date=None)
    life(db, remaining=None, rental_mode="monthly")
    life(db, remaining=15, term=10)  # Service has not started; 15 is inapplicable.
    enable(db)
    assert materialize(db) == 3
    assert {r.life_service_id for r in db.query(Delivery)} == {long.id, monthly_short.id, unknown.id}
    assert short.id not in {r.life_service_id for r in db.query(Delivery)}
    assert monthly.id not in {r.life_service_id for r in db.query(Delivery)}
    row = db.query(Delivery).filter_by(life_service_id=unknown.id).one()
    assert row.payload["schedule_reason"] == "start_date_missing_short_schedule"
    assert "MUST NOT LEAK" not in str(row.payload) and "SECRET" not in str(row.payload)
    assert service.schedule(ReminderPolicy(), start_date=TODAY - timedelta(days=360), end_date=TODAY + timedelta(days=5))[0][0] == 40


def test_confirmed_visa_stay_only_and_existing_consent(db):
    case = visa(db, notifications_enabled=False)
    enable(db)
    assert materialize(db) == 1
    assert db.query(Delivery).one().state == "SUPPRESSED"
    case.notifications_enabled = True
    db.commit()
    assert service.claim(db, now=NOW) == []  # No replay of a suppressed threshold.
    case.stay_end += timedelta(days=1)
    case.dates_confirmed_at = None
    db.commit()
    assert materialize(db, now=NOW + timedelta(days=1)) == 0
    case.dates_confirmed_at = NOW
    case.lifecycle_status = "EXPIRED"
    db.commit()
    assert materialize(db, now=NOW + timedelta(days=1)) == 0


def test_bali_date_exact_threshold_no_historical_burst_and_progress(db):
    for _ in range(7):
        life(db, remaining=15)
    enable(db)
    # 23:59 Bali on the previous day: remaining=16, so no due rows.
    assert materialize(db, now=datetime(2029, 12, 31, 15, 59, tzinfo=timezone.utc)) == 0
    midnight = datetime(2029, 12, 31, 16, tzinfo=timezone.utc)
    assert materialize(db, now=midnight, limit=2) == 2
    assert materialize(db, now=midnight, limit=2) == 2
    assert materialize(db, now=midnight, limit=2) == 2
    assert materialize(db, now=midnight, limit=2) == 1
    assert materialize(db, now=midnight, limit=2) == 0
    enable(db, long_term_threshold_days=80)
    assert materialize(db, now=midnight) == 0  # Policy version is not a dedupe dimension.
    assert service.claim(db, now=NOW + timedelta(days=1)) == []
    db.commit()
    assert {r.state for r in db.query(Delivery)} == {"SUPPRESSED"}


@pytest.mark.parametrize("change,reason", [
    ({"user_id": 3}, "source_owner_changed"), ({"publication_status": "HIDDEN"}, "source_not_published"),
    ({"notifications_enabled": False}, "notifications_disabled"),
    ({"end_date": TODAY + timedelta(days=16)}, "expiry_date_or_day_changed"),
])
def test_claim_revalidates_source_after_queueing(db, change, reason):
    source = life(db)
    enable(db)
    materialize(db)
    original = db.query(Delivery).one().id
    for key, value in change.items():
        setattr(source, key, value)
    db.commit()
    service.claim(db, now=NOW)
    db.commit()
    assert db.get(Delivery, original).state == "SUPPRESSED"
    assert db.get(Delivery, original).error_code == reason


def test_claim_revalidates_policy_and_user_and_never_reclaims_unknown(db):
    source = life(db)
    enable(db)
    materialize(db)
    enable(db, short_offsets=[7, 3, 2, 1])
    assert service.claim(db, now=NOW) == []
    db.commit()
    assert db.query(Delivery).one().error_code == "schedule_changed"
    source.end_date = TODAY + timedelta(days=7)
    db.commit()
    item = service.claim(db, now=NOW)[0]
    db.commit()
    assert item["payload"]["days_remaining"] == 7
    assert set(item["payload"]) == {"kind", "title", "end_date", "days_remaining", "schedule_reason"}
    assert service.claim(db, now=NOW + timedelta(minutes=3)) == []
    db.commit()
    row = db.get(Delivery, item["id"])
    assert row.state == "UNKNOWN" and row.lease_token is None and row.attempts == 1
    with pytest.raises(service.ReminderConflict):
        service.settle(db, row.id, ReminderSettlement(lease_token=item["lease_token"], state="DELIVERED"))


def test_settlement_replay_dedupe_constraints_and_source_scope(db):
    source = life(db)
    enable(db)
    item = service.claim(db, now=NOW)[0]
    db.commit()
    result = ReminderSettlement(lease_token=item["lease_token"], state="DELIVERED", telegram_message_id="42")
    assert service.settle(db, item["id"], result, now=NOW).state == "DELIVERED"
    db.commit()
    assert service.settle(db, item["id"], result, now=NOW).state == "DELIVERED"
    assert service.claim(db, now=NOW) == []
    with pytest.raises(service.ReminderConflict):
        service.settle(db, item["id"], ReminderSettlement(lease_token="x" * 32, state="FAILED"))
    for fields in ({}, {"life_service_id": source.id, "visa_case_id": 999}, {"life_service_id": source.id}):
        with pytest.raises(IntegrityError):
            with db.begin_nested():
                db.add(Delivery(**fields, recipient_user_id=2, end_date=source.end_date, offset_days=15,
                    policy_version=1, dedupe_key="different-key", state="PENDING", due_at=NOW))
                db.flush()


def test_preview_is_synthetic_and_short_term_offsets_are_applicable(db):
    before = db.query(BusinessSettingVersion).count()
    result = service.preview(ReminderPolicy())
    assert result["valid"] and len(result["examples"]) >= 5
    assert result["examples"][-1]["schedule"] == []
    assert result["examples"][-1]["reason"] == "monthly_end_missing"
    long, boundary, ten_days, monthly = result["examples"][:4]
    assert long["kind"] == "visa" and long["monthly"] is False and long["term_days"] == 101
    assert long["schedule"] == [40, 30, 15, 7, 3, 2, 1]
    assert boundary["term_days"] == 100 and boundary["schedule"] == [15, 7, 3, 2, 1]
    assert ten_days["term_days"] == 10 and ten_days["schedule"] == [7, 3, 2, 1]
    assert monthly["kind"] == "bike" and monthly["monthly"] is True and monthly["term_days"] == 365
    assert monthly["schedule"] == [15, 7, 3, 2, 1]
    assert db.query(BusinessSettingVersion).count() == before


def test_disabled_policy_suppresses_queued_and_preserves_delivery_history(db):
    life(db)
    enable(db)
    materialize(db)
    service.change_policy(db, expected_version=1, policy=ReminderPolicy(), reason="Pause reminders", actor=db.get(User, 1))
    db.commit()
    assert db.query(Delivery).one().state == "SUPPRESSED"
    assert service.claim(db, now=NOW) == []
