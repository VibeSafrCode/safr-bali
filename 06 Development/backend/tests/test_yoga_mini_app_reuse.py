"""Synthetic Yoga HMAC → canonical registration → existing own-session flow."""
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode, parse_qsl
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from tests.test_yoga_account_reuse import account
from app.api import mini_app as api
from app.api import users
from app.core.config import settings
from app.core.security import rate_limit
from app.models.user import User
from app.models.mini_app_session import MiniAppSession

YOGA_TOKEN = "123456:" + "Y"*35
MAIN_TOKEN = "654321:" + "M"*35


def signed(actor=101, token=YOGA_TOKEN, age=0, start=None, nonce="one"):
    values = {"auth_date": str(int(time.time())-age), "query_id": nonce,
        "user": json.dumps({"id": actor, "first_name": "Synthetic", "language_code": "en"}, separators=(",", ":"))}
    if start is not None:
        values["start_param"] = start
    key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    values["hash"] = hmac.new(key, "\n".join(f"{k}={v}" for k,v in sorted(values.items())).encode(), hashlib.sha256).hexdigest()
    return urlencode(values)


@pytest.fixture
def mini(account, monkeypatch):
    monkeypatch.setattr(api, "SessionLocal", account[1])
    for key, value in {"YOGA_BOT_TOKEN": YOGA_TOKEN, "TELEGRAM_BOT_TOKEN": MAIN_TOKEN,
        "YOGA_MINI_APP_ENABLED": True, "YOGA_MINI_APP_ORIGIN": "https://testserver", "MINI_APP_COOKIE_SECURE": True}.items():
        monkeypatch.setattr(settings, key, value)
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[rate_limit] = lambda: None
    with TestClient(app, base_url="https://testserver") as client:
        yield client, account[1]


def auth(mini, value):
    return mini[0].post("/mini-app/auth/yoga-session", json={"init_data": value}, headers={"Origin":"https://testserver"})


@pytest.mark.parametrize("origin", [None, "null", "https://foreign.invalid", "https://web.telegram.org"])
def test_unsafe_browser_origin_is_exact_app_origin(mini, origin):
    response = mini[0].post("/mini-app/auth/yoga-session", json={"init_data": signed()},
        headers={"Origin":origin} if origin is not None else {})
    assert response.status_code == 403 and not response.headers.get_list("set-cookie")
    with mini[1]() as db:
        assert db.query(MiniAppSession).count() == 0 and db.query(User).filter(User.telegram_id > 3).count() == 0


def test_yoga_reuses_canonical_partner_and_live_session_reload(mini):
    data = signed()
    response = auth(mini, data)
    assert response.status_code == 200
    assert all("HttpOnly" in c and "Secure" in c and "Path=/mini-app" in c for c in response.headers.get_list("set-cookie"))
    assert mini[0].get("/mini-app/me").json()["telegram_id"] == 101
    assert auth(mini, data).status_code == 200  # StrictMode/reload with own cookie
    with mini[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        assert user.invited_by_user_id == 2 and user.bot_status == "unknown"
        assert db.query(MiniAppSession).count() == 1
    mini[0].cookies.clear()
    assert auth(mini, data).status_code == 409  # no bearer reissue on naked replay


def test_equivalent_query_order_cannot_bypass_one_time_signature(mini):
    data = signed()
    assert auth(mini, data).status_code == 200
    mini[0].cookies.clear()
    assert auth(mini, urlencode(list(reversed(parse_qsl(data))))).status_code == 409
    with mini[1]() as db:
        assert db.query(MiniAppSession).count() == 1


def test_replay_denial_never_replays_old_profile_or_creates_referrals(mini):
    data = signed()
    assert auth(mini, data).status_code == 200
    with mini[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        user.first_name = "Updated after launch"
        user.language = "ru"
        saved = (user.invited_by_user_id, user.ref_code, user.role, user.bot_status)
        db.commit()
    mini[0].cookies.clear()
    assert auth(mini, data).status_code == 409
    with mini[1]() as db:
        user = db.query(User).filter_by(telegram_id=101).one()
        assert (user.first_name,user.language) == ("Updated after launch", "ru")
        assert (user.invited_by_user_id,user.ref_code,user.role,user.bot_status) == saved


def test_expired_access_own_refresh_rotates_once_and_revoked_proof_stays_dead(mini):
    data = signed()
    assert auth(mini, data).status_code == 200
    old_refresh = mini[0].cookies.get(settings.MINI_APP_REFRESH_COOKIE_NAME)
    with mini[1]() as db:
        row = db.query(MiniAppSession).one()
        row.access_expires_at = api.utcnow()-timedelta(seconds=1)
        db.commit()
    assert auth(mini, data).status_code == 200
    assert mini[0].cookies.get(settings.MINI_APP_REFRESH_COOKIE_NAME) != old_refresh
    assert mini[0].post("/mini-app/auth/logout").status_code == 200
    assert auth(mini, data).status_code == 409


def test_signed_actor_wins_over_different_cached_browser_actor(mini):
    assert auth(mini, signed(101)).status_code == 200
    cookie_a = dict(mini[0].cookies)
    data_b = signed(102, nonce="two")
    assert auth(mini, data_b).status_code == 200
    assert mini[0].get("/mini-app/me").json()["telegram_id"] == 102
    mini[0].cookies.clear()
    mini[0].cookies.update(cookie_a)
    assert auth(mini, data_b).status_code == 409
    # A failed replay cannot turn actor A into actor B without B's own bearer.
    assert mini[0].get("/mini-app/me").json()["telegram_id"] == 101


def test_yoga_explicit_inviter_and_old_inviter_preserved(mini):
    assert auth(mini, signed(start="ref_3")).status_code == 200
    mini[0].cookies.clear()
    assert auth(mini, signed(start="ref_2", nonce="second")).status_code == 200
    with mini[1]() as db:
        assert db.query(User).filter_by(telegram_id=101).one().invited_by_user_id == 3


@pytest.mark.parametrize("value", [signed(token=MAIN_TOKEN), signed(age=601), signed()+"&auth_date=1", signed(actor=True)])
def test_wrong_bot_expired_duplicate_invalid_actor_rejected_before_registration(mini, value):
    assert auth(mini, value).status_code == 401
    with mini[1]() as db:
        assert db.query(User).filter(User.telegram_id > 3).count() == 0


def test_main_endpoint_does_not_accept_yoga_signature(mini):
    assert mini[0].post("/mini-app/auth/session", json={"init_data": signed()}).status_code == 401


def test_main_positive_auth_remains_lax_and_uses_main_signature(mini):
    users.register_user(users.UserRegisterRequest(telegram_id=101))
    response = mini[0].post("/mini-app/auth/session", json={"init_data": signed(token=MAIN_TOKEN)})
    assert response.status_code == 200
    assert all("SameSite=lax" in c for c in response.headers.get_list("set-cookie"))
    assert mini[0].get("/mini-app/me").json()["telegram_id"] == 101


def test_same_proof_concurrent_attempt_never_reaches_registration_twice(mini):
    entered, release = Event(), Event()
    original = users.register_user_for_channel
    calls = []
    def wait_at_registration(*args, **kwargs):
        calls.append(args[0].telegram_id)
        entered.set()
        assert release.wait(3)
        return original(*args, **kwargs)
    with patch.object(users, "register_user_for_channel", side_effect=wait_at_registration):
        with ThreadPoolExecutor(max_workers=1) as pool:
            first = pool.submit(auth, mini, signed())
            assert entered.wait(3)
            try:
                denied = auth(mini, signed())
                assert denied.status_code == 429 and denied.headers["retry-after"] == "1" and not denied.headers.get_list("set-cookie")
                assert calls == [101]
            finally:
                release.set()
            assert first.result(timeout=3).status_code == 200
    with mini[1]() as db:
        assert db.query(MiniAppSession).count() == 1


def test_disabled_and_blocked_actor_fail_closed(mini, monkeypatch):
    monkeypatch.setattr(settings, "YOGA_MINI_APP_ENABLED", False)
    assert auth(mini, signed()).status_code == 503
    monkeypatch.setattr(settings, "YOGA_MINI_APP_ENABLED", True)
    with mini[1]() as db:
        db.add(User(telegram_id=101, ref_code="BLOCKED", status="blocked", role="client",first_name="Do not change",language="ru"))
        db.commit()
    assert auth(mini, signed()).status_code == 404
    with mini[1]() as db:
        assert db.query(MiniAppSession).count() == 0
        user = db.query(User).filter_by(telegram_id=101).one()
        assert user.first_name == "Do not change" and user.language == "ru" and user.invited_by_user_id is None
