"""Synthetic HTTP guest/staff chain; no Telegram transport or production data."""
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.api import guest_chat as api, web_portal
from app.api.client_ui_preference_privacy import ClientUIPreferencePrivacyMiddleware
from app.core.config import settings
from app.db.base import Base
from app.models.web_portal import GuestChatSession, WebConversation, WebMessage, WebOutboxEvent

ORIGIN = "https://guest.fixture"


@pytest.fixture
def fixture(monkeypatch):
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(api, "SessionLocal", factory)
    monkeypatch.setattr(web_portal, "SessionLocal", factory)
    monkeypatch.setattr(settings, "WEBSITE_URL", ORIGIN)
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", 100)
    monkeypatch.setattr(settings, "SUPPORT_REPLY_CHAT_IDS", "300")
    monkeypatch.setattr(settings, "SUPPORT_CHAT_IDS", "300")
    monkeypatch.setattr(settings, "SERVICE_API_TOKEN", "synthetic-guest-service")
    monkeypatch.setattr(settings, "RATE_LIMIT_PER_MINUTE", 10000)
    app = FastAPI()
    app.add_middleware(ClientUIPreferencePrivacyMiddleware)
    app.include_router(api.router)
    app.include_router(web_portal.service_router)
    with TestClient(app, base_url=ORIGIN) as client:
        yield client, factory
    engine.dispose()


def start(client, **kwargs):
    return client.post("/api/web/chat/guest/session", json=kwargs, headers={"Origin": ORIGIN})


def send(client, session, *, key=None, body="Synthetic question <b>text</b>", **extra):
    return client.post("/api/web/chat/guest/messages", json=dict(body=body,
        idempotency_key=key or str(uuid4()), route_context={"service": "C1"}, **extra),
        headers={"Origin": ORIGIN, "X-CSRF-Token": session["csrf_token"]})


def test_bootstrap_no_identity_and_no_conversation(fixture):
    client, factory = fixture
    denied = client.get("/api/web/chat/guest/session")
    assert denied.status_code == 401 and denied.headers["cache-control"] == "private, no-store"
    assert client.post("/api/web/chat/guest/session", json={}).status_code == 403
    assert client.post("/api/web/chat/guest/session", json={}, headers={"Origin": ORIGIN + ".evil"}).status_code == 403
    response = start(client)
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "Secure" in cookie and "HttpOnly" in cookie and "SameSite=strict" in cookie and "Domain=" not in cookie
    session = response.json()
    assert session["chat"]["messages"] == []
    assert start(client).json()["session_id"] == session["session_id"]
    with factory() as db:
        assert db.query(WebConversation).count() == 0
        assert db.query(GuestChatSession).count() == 1
        assert db.query(GuestChatSession).one().token_hash != client.cookies.get(api.COOKIE)


def test_guest_staff_reply_and_reload_without_telegram_event(fixture):
    client, factory = fixture
    session = start(client).json()
    sent = send(client, session)
    assert sent.status_code == 201
    conversation = sent.json()["chat"]["id"]
    headers = {"X-Service-Token": "synthetic-guest-service"}
    snapshot = client.get(f"/api/web/staff/conversations/{conversation}?actor_telegram_id=300", headers=headers)
    assert snapshot.status_code == 200
    assert snapshot.json()["reply_transport"] == "web" and snapshot.json()["allow_client_reply"] is True
    payload = {"actor_telegram_id": 300, "body": "Synthetic staff answer", "idempotency_key": "synthetic-guest-answer"}
    assert client.post(f"/api/web/staff/conversations/{conversation}/messages", json=payload, headers=headers).status_code == 201
    assert client.post(f"/api/web/staff/conversations/{conversation}/messages", json=payload, headers=headers).status_code == 201
    # Support cannot create internal notes; an assigned Owner can, but guests cannot read them.
    payload.update(actor_telegram_id=300, visibility="internal", body="Hidden", idempotency_key="synthetic-internal-deny")
    assert client.post(f"/api/web/staff/conversations/{conversation}/messages", json=payload, headers=headers).status_code == 403
    payload.update(actor_telegram_id=100, idempotency_key="synthetic-internal-owner")
    assert client.post(f"/api/web/staff/conversations/{conversation}/messages", json=payload, headers=headers).status_code == 201
    restored = client.get("/api/web/chat/guest/session").json()
    assert [m["body"] for m in restored["chat"]["messages"]] == ["Synthetic question <b>text</b>", "Synthetic staff answer"]
    assert set(restored["chat"]["messages"][1]) == {"id", "body", "author_type", "created_at"}
    with factory() as db:
        assert db.query(WebOutboxEvent).filter(WebOutboxEvent.event_type == "web_staff_client_message").count() == 0
        assert db.query(WebMessage).filter(WebMessage.author_type == "staff", WebMessage.visibility == "client").count() == 1


def test_retry_keys_are_session_bound_and_conflicts_do_not_write(fixture):
    client, factory = fixture
    session = start(client).json()
    key = str(uuid4())
    first = send(client, session, key=key)
    assert first.status_code == 201
    retry = send(client, session, key=key)
    assert retry.status_code == 201 and retry.json()["idempotent_replay"] is True
    assert send(client, session, key=key, body="Different").status_code == 409
    assert send(client, session, body="Second question").json()["chat"]["id"] == first.json()["chat"]["id"]
    client.cookies.clear()
    other = start(client).json()
    assert other["chat"]["messages"] == []
    assert send(client, other, key=key).json()["chat"]["id"] != first.json()["chat"]["id"]
    with factory() as db:
        assert db.query(WebConversation).count() == 2
        assert db.query(WebMessage).count() == db.query(WebOutboxEvent).count() == 3


def test_origin_csrf_expiry_revoke_before_read_write_and_replay(fixture):
    client, factory = fixture
    session = start(client).json()
    key = str(uuid4())
    assert send(client, session, key=key).status_code == 201
    body = {"body": "Denied", "idempotency_key": str(uuid4())}
    for headers in ({"Origin": ORIGIN}, {"Origin": ORIGIN + ".evil", "X-CSRF-Token": session["csrf_token"]}):
        assert client.post("/api/web/chat/guest/messages", json=body, headers=headers).status_code == 403
    assert client.get("/api/web/chat/guest/session", headers={"Origin": "https://evil.fixture"}).status_code == 403
    bad_csrf = client.post("/api/web/chat/guest/messages", json=body,
        headers=[(b"Origin", ORIGIN.encode()), (b"X-CSRF-Token", b"\xff")])
    assert bad_csrf.status_code == 403 and bad_csrf.headers["cache-control"] == "private, no-store"
    raw = client.cookies.get(api.COOKIE)
    with factory() as db:
        db.query(GuestChatSession).one().expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/web/chat/guest/session").status_code == 401
    assert send(client, session, key=key).status_code == 401
    assert start(client).status_code == 401
    fresh = start(client, restart=True).json()
    assert fresh["session_id"] != session["session_id"] and fresh["chat"]["messages"] == []
    revoked_raw = client.cookies.get(api.COOKIE)
    response = client.delete("/api/web/chat/guest/session", headers={"Origin": ORIGIN, "X-CSRF-Token": fresh["csrf_token"]})
    assert response.status_code == 204
    client.cookies.set(api.COOKIE, revoked_raw)
    assert client.get("/api/web/chat/guest/session").status_code == 401
    assert send(client, fresh).status_code == 401
    client.cookies.clear()
    client.cookies.set(api.COOKIE, raw)
    assert client.get("/api/web/chat/guest/session").status_code == 401
    with factory() as db:
        assert db.query(WebMessage).count() == 1
        assert db.query(WebConversation).count() == 1


def test_no_external_ids_no_contact_link_no_body_echo_and_bounded_history(fixture):
    client, factory = fixture
    session = start(client).json()
    response = client.post("/api/web/chat/guest/messages", json={"conversation_id": 777, "body": "PRIVATE-SENTINEL", "idempotency_key": str(uuid4())},
        headers={"Origin": ORIGIN, "X-CSRF-Token": session["csrf_token"]})
    assert response.status_code == 422 and "PRIVATE-SENTINEL" not in response.text
    assert response.headers["cache-control"] == "private, no-store"
    sent = send(client, session, name="Synthetic Guest", contact="same@example.invalid")
    assert sent.status_code == 201
    first_conversation = sent.json()["chat"]["id"]
    with factory() as db:
        row = db.query(GuestChatSession).one()
        for index in range(205):
            db.add(WebMessage(conversation_id=row.conversation_id, author_type="staff", body=f"Reply {index}", visibility="client"))
        db.commit()
    messages = client.get("/api/web/chat/guest/session").json()["chat"]["messages"]
    assert len(messages) == 200 and messages[-1]["body"] == "Reply 204"
    client.cookies.clear()
    other = start(client).json()
    assert send(client, other, name="Synthetic Guest", contact="same@example.invalid").json()["chat"]["id"] != first_conversation


def test_bootstrap_and_message_budgets(fixture):
    client, factory = fixture
    session = start(client).json()
    sent = send(client, session).json()
    with factory() as db:
        for _ in range(59):
            db.add(WebMessage(conversation_id=sent["chat"]["id"], author_type="client", body="Budget", visibility="client"))
        db.commit()
    assert send(client, session).status_code == 429
    for _ in range(5):
        client.cookies.clear()
        assert start(client).status_code == 200
    client.cookies.clear()
    assert start(client).status_code == 429
