"""Actual Yoga HTTP client against backend ASGI; no listener or Telegram call."""
import asyncio
from pathlib import Path

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models
from app.api import web_portal, yoga_channel as api
from app.core.config import settings
from app.db.base import Base
from app.main import app
from app.models.web_portal import WebMessage, WebOutboxEvent
from app.models.yoga_channel import YogaDelivery


@pytest.mark.parametrize('source', ['main', 'yoga'])
def test_explicit_support_dialogue_acl_is_current_at_http_read_write_and_replay(tmp_path, monkeypatch, source):
    from app.models.user import User
    from app.models.web_portal import WebConversation
    from app.services import yoga_channel as channel

    engine = create_engine('sqlite:///' + str(tmp_path / 'support-dialogue.sqlite'),
        connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(api, 'SessionLocal', factory)
    monkeypatch.setattr(web_portal, 'SessionLocal', factory)
    token = 'synthetic-main-support-' + 's' * 32
    for key, value in dict(YOGA_CHANNEL_ENABLED=True, SERVICE_API_TOKEN=token,
        ADMIN_API_TOKEN='synthetic-admin-'+'a'*32, YOGA_SERVICE_API_TOKEN='synthetic-yoga-'+'y'*32,
        DEFAULT_ADMIN_TELEGRAM_ID=9002, YOGA_MAIN_STAFF_CHAT_IDS='9002,9003',
        YOGA_OBSERVER_TELEGRAM_ID=9001, SUPPORT_CHAT_IDS='9004,9005', SUPPORT_REPLY_CHAT_IDS='9004').items():
        monkeypatch.setattr(settings, key, value)
    with factory() as db:
        user = User(telegram_id=123, ref_code='support-contract-client', first_name='Synthetic')
        db.add(user); db.flush()
        if source == 'yoga':
            accepted = channel.intake(db, update_id=51, sender_telegram_id=123, chat_id=123,
                body='CLIENT QUESTION', topic='general',
                policy=channel.ChannelPolicy(9001, (9002, 9003), (9004, 9005), (9004,)))
            conversation_id = accepted['conversation_id']
        else:
            conversation = WebConversation(user_id=user.id, source='website', assigned_staff_ids=[9002])
            db.add(conversation); db.flush()
            conversation_id = conversation.id
            db.add(WebMessage(conversation_id=conversation_id, author_type='client',
                actor_telegram_id=123, body='CLIENT QUESTION', visibility='client'))
        db.add(WebMessage(conversation_id=conversation_id, author_type='staff',
            actor_telegram_id=9002, body='PRIVATE INTERNAL NOTE', visibility='internal'))
        db.commit()

    async def check():
        path = f'/api/web/staff/conversations/{conversation_id}'
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://synthetic.test') as client:
            assert (await client.get(path, params={'actor_telegram_id': 9004})).status_code == 401
            headers = {'X-Service-Token': token}
            read = await client.get(path, params={'actor_telegram_id': 9004}, headers=headers)
            assert read.status_code == 200, read.text
            assert [m['body'] for m in read.json()['messages']] == ['CLIENT QUESTION']
            assert read.json()['reply_transport'] == ('yoga' if source == 'yoga' else 'safrway')
            for outsider in (9005, 9999):
                denied = await client.get(path, params={'actor_telegram_id': outsider}, headers=headers)
                assert denied.status_code == 403
            bridge_read = await client.get(path, headers=headers)
            assert bridge_read.status_code == 200
            assert any(m['body'] == 'PRIVATE INTERNAL NOTE' for m in bridge_read.json()['messages'])
            payload = dict(actor_telegram_id=9004, body='SUPPORT REPLY',
                idempotency_key='support-http-reply-51', visibility='client')
            assert (await client.post(path + '/messages', json=payload)).status_code == 401
            first = await client.post(path + '/messages', json=payload, headers=headers)
            assert first.status_code == 201, first.text
            again = await client.post(path + '/messages', json=payload, headers=headers)
            assert again.status_code == 201 and again.json()['id'] == first.json()['id']
            note = await client.post(path + '/messages', json={**payload, 'visibility': 'internal',
                'idempotency_key': 'support-forbidden-note'}, headers=headers)
            assert note.status_code == 403
            for outsider in (9005, 9999):
                denied = await client.post(path + '/messages', json={**payload,
                    'actor_telegram_id': outsider, 'idempotency_key': f'forbidden-support-{outsider}'}, headers=headers)
                assert denied.status_code == 403
            if source == 'yoga':
                monkeypatch.setattr(settings, 'SUPPORT_CHAT_IDS', '9001,9004,9005')
                monkeypatch.setattr(settings, 'SUPPORT_REPLY_CHAT_IDS', '9001,9004')
                collision = await client.get(path, params={'actor_telegram_id': 9001}, headers=headers)
                assert collision.status_code == 403 and 'CLIENT QUESTION' not in collision.text
                denied = await client.post(path + '/messages', json={**payload,
                    'actor_telegram_id': 9001, 'body': 'COLLISION MUST NOT WRITE',
                    'idempotency_key': 'observer-grant-collision'}, headers=headers)
                assert denied.status_code == 403
            monkeypatch.setattr(settings, 'SUPPORT_REPLY_CHAT_IDS', '')
            assert (await client.get(path, params={'actor_telegram_id': 9004}, headers=headers)).status_code == 403
            assert (await client.post(path + '/messages', json=payload, headers=headers)).status_code == 403
        with factory() as db:
            reply = db.query(WebMessage).filter_by(idempotency_key=payload['idempotency_key']).one()
            assert reply.actor_telegram_id == 9004 and reply.visibility == 'client'
            assert db.query(WebMessage).filter_by(body='COLLISION MUST NOT WRITE').count() == 0
            assert 9004 not in (db.get(WebConversation, conversation_id).assigned_staff_ids or [])
            if source == 'yoga':
                deliveries = db.query(YogaDelivery).filter_by(message_id=reply.id, recipient_role='client').all()
                assert [(r.transport_bot_key, r.recipient_id) for r in deliveries] == [('yoga', 123)]
                assert db.query(WebOutboxEvent).count() == 0
            else:
                assert db.query(WebOutboxEvent).filter_by(event_type='web_staff_client_message').count() == 1
                assert db.query(YogaDelivery).count() == 0
    try:
        asyncio.run(check())
    finally:
        engine.dispose()


def test_scoped_http_contract_joins_both_transports_without_duplicate_main_outbox(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[2] / 'yoga-bot'))
    from yoga_bot.api_client import ChannelClient, Inbound
    from types import SimpleNamespace

    engine = create_engine('sqlite:///' + str(tmp_path / 'synthetic-channel.sqlite'),
        connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(api, 'SessionLocal', factory)
    monkeypatch.setattr(web_portal, 'SessionLocal', factory)
    main_token, yoga_token = 'synthetic-main-'+'s'*32, 'synthetic-yoga-'+'y'*32
    for key, value in dict(YOGA_CHANNEL_ENABLED=True, SERVICE_API_TOKEN=main_token,
        ADMIN_API_TOKEN='synthetic-admin-'+'a'*32, YOGA_SERVICE_API_TOKEN=yoga_token,
        YOGA_MAIN_STAFF_CHAT_IDS='9002,9003', YOGA_OBSERVER_TELEGRAM_ID=9001, SUPPORT_CHAT_IDS='').items():
        monkeypatch.setattr(settings, key, value)
    config = SimpleNamespace(backend_origin='http://synthetic.test', service_api_token=yoga_token)

    async def check():
        client = ChannelClient(config, transport=httpx.ASGITransport(app=app))
        try:
            request = Inbound(update_id=801, sender_telegram_id=123, chat_id=123,
                topic='c1', body='Exact synthetic <question>\nwith a second line')
            accepted = await client.inbound(request)
            replayed = await client.inbound(request)
            assert accepted.message_id == replayed.message_id and replayed.idempotent_replay
            assert not accepted.idempotent_replay
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                base_url='http://synthetic.test', headers={'X-Service-Token': main_token}) as main:
                staff = await main.post('/api/yoga-channel/deliveries/claim', json={'limit': 1})
                assert staff.status_code == 200
                row = staff.json()[0]
                assert row['recipient_role'] == 'staff' and row['recipient_id'] in {9002, 9003}
                assert row['body'] == request.body and row['author_type'] == 'client'
                assert row['marker'] == 'Yoga Ganster · ' + row['topic_label']
                assert row['allow_client_reply'] is True and row['observer_read_only'] is False
                path = f'/api/web/staff/conversations/{accepted.conversation_id}/messages'
                reply = dict(actor_telegram_id=9002, body='Exact canonical reply',
                    idempotency_key='synthetic-yoga-http-reply')
                first = await main.post(path, json=reply)
                assert first.status_code == 201, first.text
                second = await main.post(path, json=reply)
                assert second.status_code == 201 and second.json()['id'] == first.json()['id']
                denied = await main.post(path, json=dict(reply, actor_telegram_id=9001,
                    idempotency_key='synthetic-observer-denied'))
                assert denied.status_code == 403
                history = await main.get(f'/api/yoga-channel/conversations/{accepted.conversation_id}',
                    headers={'X-Yoga-Sender-Id': '123'})
                assert history.status_code == 403
            roles = []
            for _ in range(2):
                batch = await client.claim()
                assert len(batch) == 1
                delivery = batch[0]
                roles.append(delivery.recipient_role)
                assert delivery.author_type in {'client', 'staff'}
                outcome = await client.settle(delivery, 'DELIVERED', telegram_message_id=100+delivery.id)
                assert outcome.status == 'DELIVERED'
            assert roles.count('observer') == 1 and roles.count('client') == 1
            assert await client.claim() == []
        finally:
            await client.close()

    try:
        asyncio.run(check())
        with factory() as db:
            assert db.query(WebMessage).count() == 2
            assert db.query(WebOutboxEvent).count() == 0
            assert db.query(YogaDelivery).filter_by(recipient_role='client', transport_bot_key='yoga').count() == 1
            assert db.query(YogaDelivery).filter_by(recipient_role='client', transport_bot_key='safrway').count() == 0
    finally:
        engine.dispose()
