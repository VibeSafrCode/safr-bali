"""Critical existing-portal and staff-transport regressions; synthetic SQLite."""
from datetime import timedelta
from types import SimpleNamespace

from fastapi import HTTPException
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models
from app.api import web_portal, visa_lifecycle as crm
from app.db.base import Base
from app.models.user import User
from app.models.web_portal import WebConversation, WebMessage, WebOutboxEvent
from app.models.yoga_channel import YogaDelivery
from app.services.client_portal import load_client_chat, send_client_chat_message
from app.services import yoga_channel as channel
from tests.test_yoga_channel import NOW, POLICY, intake


@pytest.fixture
def database(monkeypatch):
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(web_portal, 'SessionLocal', factory)
    monkeypatch.setattr(web_portal, 'settings', SimpleNamespace(YOGA_CHANNEL_ENABLED=True,
        yoga_main_staff_chat_ids=list(POLICY.staff_recipient_ids), YOGA_OBSERVER_TELEGRAM_ID=9001,
        support_chat_ids=[]))
    with factory() as db:
        yield db
    engine.dispose()


def known_user(db):
    user = User(telegram_id=123, ref_code='synthetic-yoga-user', first_name='Synthetic', locale='ru')
    db.add(user); db.flush()
    main = WebConversation(user_id=user.id, source='website', updated_at=NOW-timedelta(days=1))
    db.add(main); db.flush()
    db.add(WebMessage(conversation_id=main.id, author_type='client', body='MAIN HISTORY', visibility='client'))
    db.commit()
    return user, main


def test_known_user_yoga_never_hijacks_existing_portal_history_or_write(database):
    db = database
    user, main = known_user(db)
    created = intake(db); db.commit()
    assert created['conversation_id'] != main.id
    assert load_client_chat(db, user.id)['id'] == main.id
    result = send_client_chat_message(db, user_id=user.id, body='MAIN FOLLOWUP', route_context={}, source='website')
    assert result['id'] == main.id
    assert db.query(WebMessage).filter_by(conversation_id=created['conversation_id']).count() == 1
    assert db.query(YogaDelivery).count() == 3
    assert db.query(WebOutboxEvent).one().aggregate_id == main.id
    assert db.get(User, user.id).role == 'client'


def test_actual_binding_not_source_string_is_portal_boundary(database):
    db = database
    user, main = known_user(db)
    linked = WebConversation(user_id=user.id, source='website', updated_at=NOW)
    db.add(linked); db.flush()
    message = WebMessage(conversation_id=linked.id, author_type='client', body='YOGA WEB', visibility='client')
    db.add(message); db.flush()
    channel.bind_and_fanout(db, linked, message, topic='general', policy=POLICY)
    db.commit()
    assert load_client_chat(db, user.id)['id'] == main.id
    serialized = web_portal.serialize_staff_conversation(db, linked)
    assert serialized['reply_transport'] == 'yoga'
    assert serialized['assigned_staff_ids'] == list(POLICY.staff_recipient_ids)


def test_staff_public_reply_uses_original_yoga_transport_and_is_idempotent(database):
    db = database
    created = intake(db); db.commit()
    payload = web_portal.StaffMessageRequest(actor_telegram_id=9002, body='PRIVATE CLIENT REPLY',
        idempotency_key='staff-telegram:9002:77')
    saved = web_portal.add_staff_message(created['conversation_id'], payload)
    again = web_portal.add_staff_message(created['conversation_id'], payload)
    assert again['id'] == saved['id'] and again['idempotent_replay']
    db.expire_all()
    assert db.query(WebMessage).count() == 2 and db.query(WebOutboxEvent).count() == 0
    queued = db.query(YogaDelivery).filter_by(message_id=saved['id'], recipient_role='client').one()
    assert (queued.transport_bot_key, queued.recipient_role, queued.recipient_id) == ('yoga','client',123)
    assert db.query(YogaDelivery).filter_by(recipient_role='observer').count() == 2
    with pytest.raises(HTTPException) as error:
        web_portal.add_staff_message(created['conversation_id'], payload.model_copy(update={'body':'CHANGED'}))
    assert error.value.status_code == 409


def test_observer_cannot_staff_reply_and_main_client_cannot_claim_yoga_transport(database):
    db = database
    user, _ = known_user(db)
    created = intake(db); db.commit()
    with pytest.raises(HTTPException) as error:
        web_portal.add_staff_message(created['conversation_id'], web_portal.StaffMessageRequest(
            actor_telegram_id=POLICY.observer_id, body='NOT AUTHORIZED', idempotency_key='staff-denied:1'))
    assert error.value.status_code == 403
    with pytest.raises(HTTPException) as error:
        web_portal.add_telegram_client_message(created['conversation_id'], web_portal.TelegramClientMessageRequest(
            actor_telegram_id=user.telegram_id, body='WRONG BOT', idempotency_key='main-client-denied:1'))
    assert error.value.status_code == 403
    assert db.query(WebMessage).count() == 2


def test_internal_note_never_queues_observer_or_client_delivery(database):
    db = database
    created = intake(db); db.commit()
    note = web_portal.add_staff_message(created['conversation_id'], web_portal.StaffMessageRequest(
        actor_telegram_id=9002, body='INTERNAL ONLY', visibility='internal', idempotency_key='staff-note:9002:78'))
    assert db.query(YogaDelivery).filter_by(message_id=note['id']).count() == 0
    assert db.query(WebOutboxEvent).one().event_type == 'web_staff_internal'
    assert 'INTERNAL ONLY' not in str(channel.serialize(db, created['conversation_id'], sender_telegram_id=123))


def prepare_crm(monkeypatch):
    monkeypatch.setattr(crm, 'SessionLocal', web_portal.SessionLocal)
    monkeypatch.setattr(crm, 'settings', web_portal.settings)
    monkeypatch.setattr(crm, '_enabled', lambda: None)
    monkeypatch.setattr(crm, '_assigned_client', lambda *args: True)
    # Existing CRM RBAC has separate regressions; this fixture tests transport,
    # rechecks the current Yoga staff ACL and must not grant observer rights.
    monkeypatch.setattr(crm, '_is_root_admin', lambda actor: actor.role == 'admin')


def test_crm_reply_and_history_keep_original_transport_and_ambiguous_state(database, monkeypatch):
    db = database
    user, _ = known_user(db)
    actor = User(telegram_id=9002, ref_code='synthetic-crm-staff', role='admin', status='active')
    db.add(actor)
    created = intake(db); db.commit()
    prepare_crm(monkeypatch)
    payload = crm.ClientDialogueMessageRequest(body='CRM REPLY', conversation_id=created['conversation_id'], idempotency_key='yoga-crm-reply-0001')
    saved = crm.admin_client_message(user.id, payload, actor)
    repeated = crm.admin_client_message(user.id, payload, actor)
    assert saved['id'] == repeated['id'] and repeated['idempotent_replay']
    db.expire_all()
    delivery = db.query(YogaDelivery).filter_by(message_id=saved['id'], recipient_role='client').one()
    assert delivery.transport_bot_key == 'yoga' and delivery.recipient_id == 123
    assert db.query(WebOutboxEvent).count() == 0
    dialogue = crm._client_dialogue(db, user.id, actor)
    assert dialogue['id'] == created['conversation_id']
    assert dialogue['messages'][-1]['delivery_status'] == 'pending'
    delivery.status = 'UNKNOWN'; delivery.error_code = 'send_outcome_unknown'; db.commit()
    assert crm._client_dialogue(db, user.id, actor)['messages'][-1]['delivery_status'] == 'unknown'
    with pytest.raises(HTTPException) as error:
        crm.retry_admin_client_message(user.id, saved['id'], actor)
    assert error.value.status_code == 409
    db.expire_all()
    assert db.query(WebOutboxEvent).count() == 0 and db.get(YogaDelivery, delivery.id).status == 'UNKNOWN'


def test_crm_never_uses_root_role_to_grant_yoga_observer_reply(database, monkeypatch):
    db = database
    user, _ = known_user(db)
    observer = User(telegram_id=9001, ref_code='synthetic-crm-observer', role='admin', status='active')
    db.add(observer); created = intake(db); db.commit()
    prepare_crm(monkeypatch)
    with pytest.raises(HTTPException) as error:
        crm.admin_client_message(user.id, crm.ClientDialogueMessageRequest(
            body='NOT AUTHORIZED', conversation_id=created['conversation_id'], idempotency_key='yoga-observer-crm-denied'), observer)
    assert error.value.status_code == 403
    assert db.query(WebMessage).filter_by(body='NOT AUTHORIZED').count() == 0


def test_crm_root_role_does_not_expose_yoga_history_to_observer(database, monkeypatch):
    db = database
    user, main = known_user(db)
    observer = User(telegram_id=9001, ref_code='synthetic-observer-read', role='admin', status='active')
    db.add(observer)
    created = intake(db)
    db.add(WebMessage(conversation_id=created['conversation_id'], author_type='staff',
        body='INTERNAL YOGA SECRET', visibility='internal'))
    db.commit()
    prepare_crm(monkeypatch)
    visible = crm._client_dialogue(db, user.id, observer)
    assert visible['id'] == main.id
    assert 'INTERNAL YOGA SECRET' not in str(visible)
    assert 'MAIN HISTORY' in str(visible)


def test_crm_reply_is_bound_to_displayed_thread_not_latest_activity(database, monkeypatch):
    db = database
    user, main = known_user(db)
    actor = User(telegram_id=9002, ref_code='synthetic-crm-race', role='admin', status='active')
    db.add(actor)
    created = intake(db); db.commit()
    prepare_crm(monkeypatch)
    displayed_id = crm._client_dialogue(db, user.id, actor)['id']
    assert displayed_id == created['conversation_id']
    # A main-site message arrives after the operator viewed the Yoga thread.
    main.updated_at = NOW + timedelta(days=10); db.commit()
    saved = crm.admin_client_message(user.id, crm.ClientDialogueMessageRequest(
        body='BOUND REPLY', conversation_id=displayed_id, idempotency_key='yoga-bound-thread-001'), actor)
    db.expire_all()
    assert db.get(WebMessage, saved['id']).conversation_id == displayed_id
    assert db.query(YogaDelivery).filter_by(message_id=saved['id'], recipient_role='client').one().transport_bot_key == 'yoga'
    assert db.query(WebOutboxEvent).count() == 0
    with pytest.raises(HTTPException) as error:
        crm.admin_client_message(user.id, crm.ClientDialogueMessageRequest(
            body='NO TARGET', idempotency_key='yoga-no-target-001'), actor)
    assert error.value.status_code == 409
    with pytest.raises(HTTPException) as error:
        crm.admin_client_message(user.id, crm.ClientDialogueMessageRequest(
            body='BOUND REPLY', conversation_id=main.id, idempotency_key='yoga-bound-thread-001'), actor)
    assert error.value.status_code == 409
    db.get(WebConversation, displayed_id).status = 'closed'; db.commit()
    with pytest.raises(HTTPException) as error:
        crm.admin_client_message(user.id, crm.ClientDialogueMessageRequest(
            body='CLOSED', conversation_id=displayed_id, idempotency_key='yoga-closed-thread-001'), actor)
    assert error.value.status_code == 409
    assert db.query(WebOutboxEvent).count() == 0


def test_crm_late_yoga_binding_cannot_bypass_required_target(database, monkeypatch):
    db = database
    user, _ = known_user(db)
    actor = User(telegram_id=9002, ref_code='synthetic-crm-late', role='admin', status='active')
    db.add(actor); created = intake(db); db.commit()
    prepare_crm(monkeypatch)
    # Simulate Yoga committing between the two READ COMMITTED helper queries.
    monkeypatch.setattr(crm, '_conversation_for_staff_message',
        lambda session, *_: session.get(WebConversation, created['conversation_id']))
    with pytest.raises(HTTPException) as error:
        crm.admin_client_message(user.id, crm.ClientDialogueMessageRequest(
            body='LATE WRONG TARGET', idempotency_key='yoga-late-binding-001'), actor)
    assert error.value.status_code == 409
    assert db.query(WebMessage).filter_by(body='LATE WRONG TARGET').count() == 0
    assert db.query(WebOutboxEvent).count() == 0


def test_main_website_reply_keeps_existing_transport(database):
    db = database
    _, main = known_user(db)
    result = web_portal.add_staff_message(main.id, web_portal.StaffMessageRequest(actor_telegram_id=9002, body='MAIN REPLY'))
    assert db.query(YogaDelivery).count() == 0
    assert db.query(WebOutboxEvent).one().event_type == 'web_staff_client_message'
    assert web_portal.serialize_staff_conversation(db, main)['reply_transport'] == 'safrway'
    assert result['visibility'] == 'client'


def test_delivery_ambiguity_cannot_be_misclassified_as_definitive_failure(database):
    db = database
    intake(db)
    row = channel.claim(db, bot_key='yoga', policy=POLICY, now=NOW)[0]
    for outcome, code in [('FAILED','send_outcome_unknown'), ('FAILED','lease_expired'),
                          ('UNKNOWN','recipient_blocked'), ('UNKNOWN','invalid_recipient')]:
        with pytest.raises(channel.ChannelError, match='invalid_transport_error'):
            channel.settle(db, bot_key='yoga', delivery_id=row['id'], lease_token=row['lease_token'],
                outcome=outcome, error_code=code, now=NOW)
    result = channel.settle(db, bot_key='yoga', delivery_id=row['id'], lease_token=row['lease_token'],
        outcome='UNKNOWN', error_code='send_outcome_unknown', now=NOW)
    assert result['status'] == 'UNKNOWN'


def test_existing_support_copy_never_grants_staff_and_mikhail_sees_public_replies(database):
    db = database
    policy = channel.ChannelPolicy(9001, (9002,9003), (9002,9004))
    created = intake(db, policy=policy); db.commit()
    rows = channel.claim(db, bot_key='safrway', policy=policy, now=NOW)
    assert {(r['recipient_id'],r['recipient_role']) for r in rows} == {(9002,'staff'),(9003,'staff'),(9004,'observer')}
    assert next(r for r in rows if r['recipient_id']==9004)['observer_read_only'] is True
    reply = WebMessage(conversation_id=created['conversation_id'], author_type='staff', body='PUBLIC ANSWER', visibility='client')
    db.add(reply); db.flush(); channel.queue_staff_reply(db, reply, policy=policy, now=NOW)
    yoga_rows = channel.claim(db, bot_key='yoga', policy=policy, now=NOW)
    assert {(r['recipient_id'],r['recipient_role'],r['author_type']) for r in yoga_rows} == {
        (9001,'observer','client'),(9001,'observer','staff'),(123,'client','staff')}
    assert 9004 not in web_portal.serialize_staff_conversation(db, db.get(WebConversation,created['conversation_id']))['assigned_staff_ids']
