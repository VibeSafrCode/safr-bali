"""Synthetic alias/ownership tests; no production DB, customer or Telegram calls."""
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from alembic.migration import MigrationContext
from alembic.operations import Operations

from tests.test_yoga_account_reuse import account, post, register
from tests.test_yoga_mini_app_reuse import mini, signed, auth
from app.api import mini_app, yoga_channel, users
from app.core.config import settings
from app.models.public_referral_alias import PublicReferralAlias
from app.models.user import User
from app.models.referral import Referral
from app.models.points_ledger import PointsLedger
from app.services import public_referral_aliases as aliases


def test_same_own_alias_is_stable_and_never_changes_canonical_graph_or_code(account):
    actor = register(account)
    with account[1]() as db:
        before = [(u.id, u.ref_code, u.invited_by_user_id, u.role) for u in db.query(User).all()]
        referrals = db.query(Referral).count()
    first = post(account, "me").json()["referral_payload"]
    assert aliases.PATTERN.fullmatch(first) and len(first) == 10
    assert post(account, "me").json()["referral_payload"] == first
    with account[1]() as db:
        assert db.query(PublicReferralAlias).count() == 1
        assert db.query(PublicReferralAlias).one().user_id == actor["user_id"]
        assert before == [(u.id, u.ref_code, u.invited_by_user_id, u.role) for u in db.query(User).all()]
        assert db.query(Referral).count() == referrals and db.query(PointsLedger).count() == 0


def test_opaque_explicit_wins_while_new_without_link_defaults_to_mikhail(account):
    owner = register(account, actor=101)
    code = post(account, "me", actor=101).json()["referral_payload"]
    child = register(account, actor=102, start_payload=code.upper())
    direct = register(account, actor=103)
    register(account, actor=102, start_payload="PARTNER")
    with account[1]() as db:
        assert db.get(User, child["user_id"]).invited_by_user_id == owner["user_id"]
        assert db.get(User, direct["user_id"]).invited_by_user_id == 2
        assert db.query(User).filter_by(telegram_id=2).one().invited_by_user_id == 1


def test_unknown_alias_namespace_never_falls_back_to_mutable_user_code(account):
    with account[1]() as db:
        db.query(User).filter_by(telegram_id=3).one().ref_code = "r_ABCDEFGH"
        db.commit()
    result = register(account, start_payload="r_ABCDEFGH")
    with account[1]() as db:
        assert db.get(User, result["user_id"]).invited_by_user_id == 2


def test_existing_mixed_case_legacy_code_keeps_exact_canonical_resolution(account):
    with account[1]() as db:
        db.query(User).filter_by(telegram_id=3).one().ref_code = "aBcD2345"; db.commit()
    result = register(account, start_payload="aBcD2345")
    with account[1]() as db:
        assert db.get(User, result["user_id"]).invited_by_user_id == 3


def test_collision_regenerates_only_alias_and_reuses_existing_own_alias(account):
    actor = register(account)
    with account[1]() as db:
        db.add(PublicReferralAlias(code="r_AAAAAAAA", user_id=3)); db.commit()
    choices = iter("AAAAAAAA" + "BBBBBBBB")
    with patch.object(aliases.secrets, "choice", side_effect=lambda _: next(choices)) as choice:
        result = post(account, "me")
    assert result.status_code == 200 and result.json()["referral_payload"] == "r_BBBBBBBB"
    assert choice.call_count == 16
    assert post(account, "me").json()["referral_payload"] == "r_BBBBBBBB"
    with account[1]() as db:
        assert db.query(PublicReferralAlias).count() == 2
        assert db.get(User, actor["user_id"]).ref_code == "TG101"


def test_disabled_issuance_retains_old_resolution_but_never_reissues_id(account, monkeypatch):
    owner = register(account)
    code = post(account, "me").json()["referral_payload"]
    monkeypatch.setattr(settings, "PUBLIC_REFERRAL_ALIAS_ISSUANCE_ENABLED", False)
    assert post(account, "me").json()["referral_payload"] is None
    child = register(account, actor=102, start_payload=code)
    with account[1]() as db:
        assert db.get(User, child["user_id"]).invited_by_user_id == owner["user_id"]
        assert db.query(PublicReferralAlias).count() == 1


def test_missing_storage_never_defaults_or_registers_a_customer(account):
    with account[1]() as db:
        engine = db.get_bind()
    PublicReferralAlias.__table__.drop(engine)
    for payload in (None, "r_ABCDEFGH", "svc_e33g"):
        response = post(account, "register", start_payload=payload)
        assert response.status_code == 503
    with account[1]() as db:
        assert db.query(User).filter_by(telegram_id=101).first() is None
        assert db.query(Referral).count() == 1


def test_alias_account_post_uses_own_authenticated_session_and_exact_origin(mini):
    assert auth(mini, signed()).status_code == 200
    # Generic GET stays read-only with respect to alias allocation.
    assert mini[0].get("/mini-app/me").status_code == 200
    with mini[1]() as db:
        assert db.query(PublicReferralAlias).count() == 0
    for origin in (None, "null", "https://foreign.invalid", "https://web.telegram.org"):
        r = mini[0].post("/mini-app/yoga-account", json={}, headers={"Origin": origin} if origin else {})
        assert r.status_code == 403
    headers = {"Origin": "https://testserver"}
    assert mini[0].post("/mini-app/yoga-account", json={"user_id": 3}, headers=headers).status_code == 422
    result = mini[0].post("/mini-app/yoga-account", json={}, headers=headers)
    assert result.status_code == 200
    body = result.json()
    assert body["telegram_id"] == 101 and aliases.PATTERN.fullmatch(body["referral_payload"])
    assert body["referral_link"] == "https://t.me/Yoga_ganster_bot?start=" + body["referral_payload"]
    assert result.headers["cache-control"] == "private, no-store"
    with mini[1]() as db:
        assert db.query(PublicReferralAlias).count() == 1
        assert db.query(PublicReferralAlias).one().user_id == db.query(User).filter_by(telegram_id=101).one().id
    mini[0].cookies.clear()
    assert mini[0].post("/mini-app/yoga-account", json={}, headers=headers).status_code == 401


def test_signed_miniapp_alias_and_no_link_reuse_same_default_and_explicit_rules(mini, account):
    owner = register(account)
    code = post(account, "me").json()["referral_payload"]
    assert auth(mini, signed(actor=201, start=code, nonce="child")).status_code == 200
    mini[0].cookies.clear()
    assert auth(mini, signed(actor=202, nonce="direct")).status_code == 200
    with mini[1]() as db:
        assert db.query(User).filter_by(telegram_id=201).one().invited_by_user_id == owner["user_id"]
        assert db.query(User).filter_by(telegram_id=202).one().invited_by_user_id == 2


def test_migration_only_adds_alias_table_and_refuses_to_drop_issued_links():
    filename = Path(__file__).parents[1] / "alembic/versions/b6a1d3f0e214_add_public_referral_aliases.py"
    spec = spec_from_file_location("isolated_alias_migration", filename)
    migration = module_from_spec(spec); spec.loader.exec_module(migration)
    assert migration.down_revision == "a1f9c3d7e620"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)"))
        connection.execute(text("INSERT INTO users VALUES (1, 'unchanged')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert set(inspect(connection).get_table_names()) == {"users", "referral_public_aliases"}
            assert connection.execute(text("SELECT marker FROM users")).scalar_one() == "unchanged"
            with pytest.raises(RuntimeError, match="retained"):
                migration.downgrade()
            assert set(inspect(connection).get_table_names()) == {"users", "referral_public_aliases"}
            connection.execute(text("INSERT INTO referral_public_aliases(code,user_id) VALUES ('r_ABCDEFGH',1)"))
            with pytest.raises(RuntimeError, match="retained"):
                migration.downgrade()
            assert connection.execute(text("SELECT code FROM referral_public_aliases")).scalar_one() == "r_ABCDEFGH"
    engine.dispose()
