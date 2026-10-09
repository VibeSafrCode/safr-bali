"""Synthetic SQLite contract tests. No Telegram, network, settings or real IDs."""
from datetime import datetime, timedelta
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.api import yoga_channel as api
from app.db.base import Base
from app.models.web_portal import WebConversation, WebMessage, WebOutboxEvent
from app.models.yoga_channel import YogaChannelBinding, YogaDelivery, YogaInboundReceipt
from app.services import yoga_channel as service

NOW = datetime(2026, 10, 9, 12)
POLICY = service.ChannelPolicy(9001, (9002, 9003))


@pytest.fixture
def database():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        yield db, factory
    engine.dispose()


def intake(db, **changes):
    payload = dict(update_id=1, sender_telegram_id=123, chat_id=123, topic="general", body="Synthetic question",
                   policy=POLICY, now=NOW)
    return service.intake(db, **(payload | changes))


def test_intake_replay_single_canonical_message_and_per_recipient_fanout(database):
    db, _ = database
    before = {name: db.execute(select(func.count()).select_from(table)).scalar_one()
        for name, table in Base.metadata.tables.items() if name in {"users", "orders", "referrals", "commercial_price_snapshots"}}
    first = intake(db)
    db.commit()
    again = intake(db)
    assert again == {**first, "idempotent_replay": True}
    assert db.query(WebConversation).count() == db.query(WebMessage).count() == db.query(YogaInboundReceipt).count() == 1
    assert db.query(YogaDelivery).count() == 3
    assert db.query(WebOutboxEvent).count() == 0
    assert db.get(WebConversation, first["conversation_id"]).route_context == {}
    assert before == {name: db.execute(select(func.count()).select_from(Base.metadata.tables[name])).scalar_one() for name in before}
    for change in ({"body": "Changed"}, {"sender_telegram_id": 124, "chat_id": 124}, {"topic": "other"}, {"conversation_id": first["conversation_id"]}):
        with pytest.raises(service.ChannelError, match="inbound_replay_conflict"):
            intake(db, **change)
    assert db.query(WebMessage).count() == 1


def test_append_sender_binding_private_chat_and_immutable_source(database):
    db, _ = database
    first = intake(db)
    appended = intake(db, update_id=2)
    assert first["conversation_id"] == appended["conversation_id"]
    with pytest.raises(service.ChannelError, match="source_sender_conflict"):
        intake(db, update_id=3, sender_telegram_id=124, chat_id=124, conversation_id=first["conversation_id"])
    with pytest.raises(service.ChannelError, match="private_chat_only"):
        intake(db, update_id=4, chat_id=-123)
    row = db.get(YogaChannelBinding, first["conversation_id"])
    row.topic = "changed"
    with pytest.raises(ValueError, match="immutable"):
        db.flush()
    db.rollback()


def test_website_uses_existing_message_and_has_no_invented_telegram_reply(database):
    db, _ = database
    c = WebConversation(source="website", route_context={"section": "support"})
    db.add(c); db.flush()
    m = WebMessage(conversation_id=c.id, author_type="client", body="Website synthetic", visibility="client")
    db.add(m); db.flush()
    service.bind_and_fanout(db, c, m, topic="general", policy=POLICY, now=NOW)
    service.bind_and_fanout(db, c, m, topic="general", policy=POLICY, now=NOW)
    assert db.query(WebConversation).count() == db.query(WebMessage).count() == 1
    assert db.query(YogaDelivery).count() == 3
    reply = WebMessage(conversation_id=c.id, author_type="staff", body="Answer", visibility="client")
    db.add(reply); db.flush()
    assert service.queue_staff_reply(db, reply, now=NOW) == {"handled": True, "telegram_queued": False}
    assert db.query(YogaDelivery).count() == 3


def test_channel_history_never_discloses_main_conversation_or_internal_note(database):
    db, _ = database
    created = intake(db)
    db.add(WebMessage(conversation_id=created["conversation_id"], author_type="staff", body="PRIVATE INTERNAL", visibility="internal"))
    main = WebConversation(source="website", guest_contact="private synthetic")
    db.add(main); db.flush()
    result = service.serialize(db, created["conversation_id"])
    assert len(result["messages"]) == 1 and result["observer_read_only"] is True
    assert "PRIVATE INTERNAL" not in str(result) and "sender_telegram_id" not in result and "client" not in result
    assert result["marker"] == "Yoga Ganster · Общий вопрос"
    with pytest.raises(service.ChannelError) as error:
        service.serialize(db, main.id)
    assert error.value.status == 404


def test_independent_transports_and_reply_original_yoga_bot(database):
    db, _ = database
    first = intake(db)
    staff = service.claim(db, bot_key="safrway", policy=POLICY, now=NOW)
    observer = service.claim(db, bot_key="yoga", policy=POLICY, now=NOW)
    assert {r["recipient_id"] for r in staff} == {9002, 9003}
    assert [r["recipient_id"] for r in observer] == [9001]
    assert observer[0]["observer_read_only"] is True
    assert not service.claim(db, bot_key="yoga", policy=POLICY, now=NOW)
    with pytest.raises(service.ChannelError) as error:
        service.settle(db, bot_key="safrway", delivery_id=observer[0]["id"], lease_token=observer[0]["lease_token"], outcome="DELIVERED", telegram_message_id=44, now=NOW)
    assert error.value.status == 404
    reply = WebMessage(conversation_id=first["conversation_id"], author_type="staff", actor_telegram_id=9002, body="Reply", visibility="client")
    db.add(reply); db.flush()
    service.queue_staff_reply(db, reply, now=NOW)
    service.queue_staff_reply(db, reply, now=NOW)
    outgoing = service.claim(db, bot_key="yoga", policy=POLICY, now=NOW)
    assert len(outgoing) == 1 and outgoing[0]["recipient_id"] == 123 and outgoing[0]["recipient_role"] == "client"
    assert outgoing[0]["body"] == "Reply"
    assert not service.claim(db, bot_key="safrway", policy=POLICY, now=NOW)


def test_lease_expiry_unknown_no_automatic_retry_and_other_recipient_independent(database):
    db, _ = database
    intake(db)
    rows = service.claim(db, bot_key="safrway", policy=POLICY, now=NOW)
    done = service.settle(db, bot_key="safrway", delivery_id=rows[0]["id"], lease_token=rows[0]["lease_token"], outcome="DELIVERED", telegram_message_id=9, now=NOW)
    assert done["status"] == "DELIVERED"
    replay = service.settle(db, bot_key="safrway", delivery_id=rows[0]["id"], lease_token=rows[0]["lease_token"], outcome="DELIVERED", telegram_message_id=9, now=NOW)
    assert replay["idempotent_replay"]
    assert not service.claim(db, bot_key="safrway", policy=POLICY, now=NOW + timedelta(seconds=61))
    db.expire_all()
    assert db.get(YogaDelivery, rows[0]["id"]).status == "DELIVERED"
    assert db.get(YogaDelivery, rows[1]["id"]).status == "UNKNOWN"
    assert service.claim(db, bot_key="yoga", policy=POLICY, now=NOW)[0]["recipient_id"] == 9001


def test_retry_only_proven_presend_with_bounded_attempts_and_token_replacement(database):
    db, _ = database
    intake(db)
    row = service.claim(db, bot_key="yoga", policy=POLICY, now=NOW)[0]
    with pytest.raises(service.ChannelError, match="invalid_transport_error"):
        service.settle(db, bot_key="yoga", delivery_id=row["id"], lease_token=row["lease_token"], outcome="RETRY", error_code="send_outcome_unknown", now=NOW)
    service.settle(db, bot_key="yoga", delivery_id=row["id"], lease_token=row["lease_token"], outcome="RETRY", error_code="connection_failed_before_send", now=NOW)
    assert not service.claim(db, bot_key="yoga", policy=POLICY, now=NOW)
    later = NOW + timedelta(seconds=6)
    new = service.claim(db, bot_key="yoga", policy=POLICY, now=later)[0]
    assert new["lease_token"] != row["lease_token"]
    with pytest.raises(service.ChannelError, match="lease_conflict"):
        service.settle(db, bot_key="yoga", delivery_id=row["id"], lease_token=row["lease_token"], outcome="UNKNOWN", error_code="send_outcome_unknown", now=later)
    for attempt in range(2, 6):
        result = service.settle(db, bot_key="yoga", delivery_id=new["id"], lease_token=new["lease_token"], outcome="RETRY", error_code="rate_limited_before_send", now=later)
        later += timedelta(seconds=50)
        rows = service.claim(db, bot_key="yoga", policy=POLICY, now=later)
        if attempt < 5: new = rows[0]
    assert result["status"] == "FAILED" and not rows


def test_recipient_removed_before_claim_gets_no_backlog(database):
    db, _ = database
    intake(db)
    policy = service.ChannelPolicy(9010, (9003,))
    assert [r["recipient_id"] for r in service.claim(db, bot_key="safrway", policy=policy, now=NOW)] == [9003]
    assert not service.claim(db, bot_key="yoga", policy=policy, now=NOW)
    assert db.query(YogaDelivery).filter_by(status="FAILED").count() == 2


def test_api_failclosed_principal_bound_and_no_client_spoof_acl(database, monkeypatch):
    db, factory = database
    monkeypatch.setattr(api, "SessionLocal", factory)
    settings = SimpleNamespace(YOGA_CHANNEL_ENABLED=True, YOGA_SERVICE_API_TOKEN="yoga-test-secret", SERVICE_API_TOKEN="main-test-secret",
        ADMIN_API_TOKEN="admin-test-secret", YOGA_OBSERVER_TELEGRAM_ID=9001, YOGA_MAIN_STAFF_CHAT_IDS="9002,9003")
    monkeypatch.setattr(api, "settings", settings)
    app = FastAPI(); app.include_router(api.router)
    with TestClient(app) as client:
        payload = dict(update_id=11, sender_telegram_id=123, chat_id=123, body="Question", topic="general")
        headers = {"X-Service-Token": "yoga-test-secret"}
        assert client.post('/api/yoga-channel/inbound', json=payload).status_code == 401
        assert client.post('/api/yoga-channel/inbound', json=payload, headers={"X-Service-Token": "main-test-secret"}).status_code == 403
        assert client.post('/api/yoga-channel/inbound', json=payload | {"bot_key": "safrway", "recipient_ids": [1]}, headers=headers).status_code == 422
        assert client.post('/api/yoga-channel/inbound', json=payload, headers=headers).status_code == 200
        cid = client.post('/api/yoga-channel/inbound', json=payload, headers=headers).json()['conversation_id']
        route = '/api/yoga-channel/conversations/' + str(cid)
        assert client.get(route, headers=headers).status_code == 422
        assert client.get(route, headers=headers | {'X-Yoga-Sender-Id': '124'}).status_code == 404
        assert client.get(route, headers=headers | {'X-Yoga-Sender-Id': '123'}).status_code == 200
        assert client.get(route, headers={'X-Service-Token': 'main-test-secret', 'X-Yoga-Sender-Id': '123'}).status_code == 403
        assert client.post('/api/yoga-channel/inbound', json=payload | {"body": "Changed"}, headers=headers).status_code == 409
        claim = client.post('/api/yoga-channel/deliveries/claim', json={}, headers=headers).json()
        assert len(claim) == 1 and claim[0]["recipient_role"] == "observer"
        assert client.post('/api/yoga-channel/deliveries/claim', json={"bot_key": "safrway"}, headers=headers).status_code == 422
        settings.YOGA_SERVICE_API_TOKEN = ""
        assert client.post('/api/yoga-channel/inbound', json=payload, headers=headers).status_code == 503
        settings.YOGA_SERVICE_API_TOKEN = settings.SERVICE_API_TOKEN
        assert client.post('/api/yoga-channel/inbound', json=payload, headers=headers).status_code == 503


def test_missing_numeric_observer_fails_before_any_intake_write(database):
    db, _ = database
    with pytest.raises(service.ChannelError) as error:
        intake(db, policy=service.ChannelPolicy(0, (9002,)))
    assert error.value.status == 503 and db.query(WebMessage).count() == 0
