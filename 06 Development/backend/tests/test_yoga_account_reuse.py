"""Synthetic own-account HTTP tests against the canonical additive User model.

No app.main, Telegram, listener, PostgreSQL, migration or real credentials.
"""
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError
import sqlite3

import app.models
from app.api import referrals, users, yoga_channel as api
from app.core.config import settings
from app.core.security import rate_limit
from app.db.base import Base
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.service import Service
from app.models.user import User
from app.models.public_referral_alias import PublicReferralAlias

MAIN = "synthetic-main-" + "m" * 40
YOGA = "synthetic-yoga-" + "y" * 40
ADMIN = "synthetic-admin-" + "a" * 40


@pytest.fixture
def account(monkeypatch):
    engine = create_engine("sqlite+pysqlite:///:memory:", poolclass=StaticPool,
        connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    for module in (users, referrals, api):
        monkeypatch.setattr(module, "SessionLocal", factory)
    for key, value in dict(YOGA_CHANNEL_ENABLED=True, YOGA_ACCOUNT_ENABLED=True, PUBLIC_REFERRAL_ALIAS_ISSUANCE_ENABLED=True,
        YOGA_PARTNER_TELEGRAM_ID=2, YOGA_SERVICE_API_TOKEN=YOGA,
        SERVICE_API_TOKEN=MAIN, ADMIN_API_TOKEN=ADMIN, DEFAULT_ADMIN_TELEGRAM_ID=1).items():
        monkeypatch.setattr(settings, key, value)
    with factory() as db:
        for actor, code, role in ((1, "ROOT", "admin"), (2, "PARTNER", "client"), (3, "OTHER", "client")):
            db.add(User(telegram_id=actor, ref_code=code, role=role, status="active", locale="en"))
        db.flush()
        partner = db.query(User).filter_by(telegram_id=2).one()
        partner.invited_by_user_id = 1
        db.add(Referral(parent_user_id=1, child_user_id=partner.id, level=1, source="existing"))
        db.commit()
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[rate_limit] = lambda: None
    with TestClient(app) as client:
        yield client, factory
    engine.dispose()


def post(account, path, actor=101, token=YOGA, **extra):
    return account[0].post("/api/yoga-channel/account/" + path,
        json={"sender_telegram_id": actor, "chat_id": actor, **extra},
        headers={"X-Service-Token": token} if token is not None else {})


def register(account, actor=101, **extra):
    response = post(account, "register", actor, **extra)
    assert response.status_code == 200
    return response.json()


def test_new_registration_reuses_default_partner_and_does_not_enroll_main(account):
    with patch("app.services.onboarding.enroll", side_effect=AssertionError("Main enrollment")):
        first = register(account)
        replay = register(account)
    assert first["is_new"] and not replay["is_new"] and first["user_id"] == replay["user_id"]
    with account[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        assert user.invited_by_user_id == 2 and user.bot_status == "unknown" and user.role == "client"
        rows = db.query(Referral).filter_by(child_user_id=user.id).all()
        assert len(rows) == 1 and rows[0].parent_user_id == 2 and rows[0].attribution_reason == "brand_partner_entry"


def test_first_entry_unique_conflict_retries_only_existing_actor_and_preserves_winner(account):
    original = users._register_user_for_channel_once
    calls = []
    def concurrent(payload, **kw):
        calls.append(payload.model_dump())
        if len(calls) == 1:
            original(users.UserRegisterRequest(telegram_id=payload.telegram_id,
                invited_by_telegram_id=3), **kw)
            raise IntegrityError("synthetic unique conflict", {}, sqlite3.IntegrityError("UNIQUE constraint failed: users.telegram_id"))
        return original(payload, **kw)
    with patch.object(users, "_register_user_for_channel_once", side_effect=concurrent):
        register(account, start_payload="ref_2")
    assert len(calls) == 2 and calls[0] == calls[1]
    with account[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        assert user.invited_by_user_id == 3
        assert db.query(Referral).filter_by(child_user_id=user.id).one().parent_user_id == 3


def test_unrelated_integrity_failure_never_retries_existing_actor(account):
    register(account)
    with patch.object(users, "_register_user_for_channel_once", side_effect=IntegrityError(
        "synthetic", {}, sqlite3.IntegrityError("UNIQUE constraint failed: users.ref_code"))) as call:
        with pytest.raises(IntegrityError):
            users.register_user_for_channel(users.UserRegisterRequest(telegram_id=101), channel="yoga", default_inviter_telegram_id=2)
    assert call.call_count == 1


def test_bot_language_choice_uses_canonical_own_preference_without_reparent(account):
    register(account, start_payload="ref_3")
    assert post(account, "locale", locale="en").json() == {"telegram_id":101,"locale":"en"}
    assert post(account, "locale", chat_id=102, locale="ru").status_code == 403
    with account[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        assert user.locale == "en" and user.invited_by_user_id == 3
        user.status = "blocked";db.commit()
    assert post(account, "locale", locale="ru").status_code == 404
    with account[1]() as db:
        assert db.query(User).filter_by(telegram_id=101).one().locale == "en"


def test_explicit_referral_precedes_partner_and_existing_attribution_survives(account):
    register(account, start_payload="OTHER")
    register(account, start_payload="PARTNER")
    with account[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        assert user.invited_by_user_id == 3
        assert db.query(Referral).filter_by(child_user_id=user.id).one().parent_user_id == 3


@pytest.mark.parametrize("payload", ["svc_e33g", "ref_101", "unknown-code"])
def test_topic_self_or_invalid_code_does_not_override_trusted_partner(account, payload):
    register(account, start_payload=payload)
    with account[1]() as db:
        assert db.query(User).filter_by(telegram_id=101).one().invited_by_user_id == 2


def test_old_profile_preference_code_role_and_main_bot_status_survive(account):
    register(account, start_payload="OTHER")
    with account[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        user.locale = "en"; user.ref_code = "EXISTING"; user.bot_status = "blocked"
        db.commit()
    result = register(account, start_payload="PARTNER", language="ru")
    assert result["ref_code"] == "EXISTING"
    with account[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        assert (user.locale, user.ref_code, user.bot_status, user.role, user.invited_by_user_id) == (
            "en", "EXISTING", "blocked", "client", 3)


def test_partner_existing_founder_history_is_not_reparented(account):
    register(account, actor=2, start_payload="OTHER")
    with account[1]() as db:
        partner = db.query(User).filter_by(telegram_id=2).one()
        assert partner.invited_by_user_id == 1
        assert db.query(Referral).filter_by(child_user_id=partner.id).one().parent_user_id == 1


@pytest.mark.parametrize("partner", [0, 999, "inactive"])
def test_invalid_default_partner_fails_closed(account, monkeypatch, partner):
    if partner == "inactive":
        with account[1]() as db:
            db.query(User).filter_by(telegram_id=2).one().status = "blocked"; db.commit()
    else:
        monkeypatch.setattr(settings, "YOGA_PARTNER_TELEGRAM_ID", partner)
    assert post(account, "register").status_code == 503
    with account[1]() as db:
        assert db.query(User).filter_by(telegram_id=101).first() is None


@pytest.mark.parametrize("path", ["register", "me"])
def test_flags_and_principal_reject_before_any_database(account, monkeypatch, path):
    with patch.object(api, "SessionLocal", side_effect=AssertionError("DB before authority")), \
         patch.object(users, "SessionLocal", side_effect=AssertionError("DB before authority")):
        for token, expected in ((None, 401), ("wrong", 401), (MAIN, 403), (ADMIN, 401)):
            assert post(account, path, token=token).status_code == expected
        monkeypatch.setattr(settings, "YOGA_ACCOUNT_ENABLED", False)
        assert post(account, path).status_code == 503
        monkeypatch.setattr(settings, "YOGA_CHANNEL_ENABLED", False)
        assert post(account, path).status_code == 503


@pytest.mark.parametrize("extra", [{"chat_id": 102}, {"sender_telegram_id": True},
    {"user_id": 2}, {"role": "admin"}, {"verified_new_bot_registration": True},
    {"referral_code": "FORGED"}, {"default_inviter_telegram_id": 3}])
def test_actor_and_target_role_onboarding_spoofs_rejected(account, extra):
    expected = 403 if extra == {"chat_id": 102} else 422
    assert post(account, "register", **extra).status_code == expected
    assert post(account, "me", **extra).status_code == expected


def test_blocked_user_not_reactivated_or_given_account(account):
    register(account)
    with account[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        user.status = "blocked"; user.bot_status = "blocked"; db.commit()
    assert post(account, "register").status_code == 404
    assert post(account, "me").status_code == 404
    with account[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        assert user.status == user.bot_status == "blocked"


def test_own_points_and_orders_are_bounded_json_safe_and_read_only(account):
    own = register(account); foreign = register(account, actor=102)
    with account[1]() as db:
        service = Service(name="Synthetic <service>", slug="synthetic", admin_comment="PRIVATE SERVICE NOTE")
        db.add(service); db.flush()
        for actor, balance in ((own, 47), (foreign, 999)):
            db.add(PointsLedger(user_id=actor["user_id"], operation_type="synthetic", amount=balance, balance_after=balance))
        for number in range(32):
            db.add(Order(user_id=own["user_id"], service_id=service.id,
                amount_usd=Decimal("123.45"), created_at=datetime(2026, 10, 14, 1, 2, 3),
                client_comment="PRIVATE CLIENT NOTE", admin_comment="PRIVATE ADMIN NOTE"))
        db.add(Order(user_id=foreign["user_id"], service_id=service.id, amount_usd=Decimal("999.99")))
        db.commit()
        counts = tuple(db.query(model).count() for model in (User, Referral, PointsLedger, Order))
    response = post(account, "me")
    assert response.status_code == 200
    value = response.json()
    assert (value["telegram_id"], value["user_id"], value["balance"], value["orders_count"]) == (101, own["user_id"], 47, 30)
    assert len(value["orders"]) == 30
    assert value["orders"][0]["id"] > value["orders"][-1]["id"]
    assert all(set(row) == {"id", "service", "status", "payment_status", "amount_usd", "created_at"} for row in value["orders"])
    assert all(row["amount_usd"] == 123.45 and row["created_at"].startswith("2026-10-14T01:02:03") for row in value["orders"])
    assert "PRIVATE" not in response.text and "999.99" not in response.text
    assert response.headers["cache-control"] == "private, no-store" and "noindex" in response.headers["x-robots-tag"]
    with account[1]() as db:
        assert counts == tuple(db.query(model).count() for model in (User, Referral, PointsLedger, Order))
    assert post(account, "me", actor=102).json()["balance"] == 999


def test_empty_account_is_not_an_error_or_new_points_operation(account):
    register(account)
    value = post(account, "me").json()
    assert value["balance"] == 0 and value["orders_count"] == 0 and value["orders"] == []
    with account[1]() as db:
        assert db.query(PointsLedger).count() == 0


def test_own_counts_do_not_expose_children_or_global_staff_data(account):
    register(account, actor=101, start_payload="PARTNER")
    register(account, actor=102, start_payload="OTHER")
    value = post(account, "me", actor=2).json()
    assert value["level_1_count"] == value["total_count"] == 1
    assert set(value) == {"telegram_id", "user_id", "ref_code", "referral_payload", "level_1_count",
        "total_count", "balance", "orders_count", "orders"}
    assert "children" not in value and "role" not in value and "access_token" not in value


def test_opaque_referral_payload_stays_valid_after_main_code_rotation(account):
    own = register(account)
    before = post(account, "me").json()
    assert before["referral_payload"].startswith("r_") and len(before["referral_payload"]) == 10
    # Existing Main registration behavior remains unchanged; do not depend on
    # its local JSON code or require a Main process restart for Yoga links.
    main = users.register_user(users.UserRegisterRequest(telegram_id=101, referral_code="MAINROTATED"))
    assert main["ref_code"] == "MAINROTATED" != own["ref_code"]
    after = post(account, "me").json()
    assert after["referral_payload"] == before["referral_payload"]
    register(account, actor=102, start_payload=before["referral_payload"])
    with account[1]() as db:
        child = db.query(User).filter_by(telegram_id=102).one()
        assert child.invited_by_user_id == own["user_id"]
        assert db.query(Referral).filter_by(child_user_id=child.id).one().parent_user_id == own["user_id"]


def test_main_wrapper_keeps_existing_status_behavior_and_additive_ui_preference(account):
    register(account)
    with account[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        assert (user.client_ui_locale, user.client_ui_locale_revision) == (None, 0)
        user.bot_status = "blocked"
        user.client_ui_locale = "fr"
        user.client_ui_locale_revision = 7
        db.commit()
    users.register_user(users.UserRegisterRequest(telegram_id=101))
    with account[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        assert user.bot_status == "active"
        assert (user.client_ui_locale, user.client_ui_locale_revision) == ("fr", 7)
    # c52 intentionally added only independent interface fields; it did not
    # replace RU/EN contact locale or permit Main registration to reset UI CAS.
    assert {column.name for column in User.__table__.columns if column.name.startswith("client_ui_")} == {
        "client_ui_locale", "client_ui_locale_revision"}
