"""Actual Yoga HTTP client against backend ASGI; no listener or Telegram call."""
import asyncio
from pathlib import Path

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models
from app.api import web_portal, yoga_channel as api
from app.core.config import settings
from app.db.base import Base
from app.main import app
from app.models.web_portal import WebMessage, WebOutboxEvent
from app.models.yoga_channel import YogaDelivery


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
            for _ in range(3):
                batch = await client.claim()
                assert len(batch) == 1
                delivery = batch[0]
                roles.append(delivery.recipient_role)
                assert delivery.author_type in {'client', 'staff'}
                outcome = await client.settle(delivery, 'DELIVERED', telegram_message_id=100+delivery.id)
                assert outcome.status == 'DELIVERED'
            assert roles.count('observer') == 2 and roles.count('client') == 1
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
