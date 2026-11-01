"""Guest first-write/retry/revoke ordering on the existing owned PG fixture.

Synthetic rows only; no application database URL, Telegram transport or new runner.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from importlib.util import module_from_spec, spec_from_file_location
import json
import os
from pathlib import Path
from threading import Event, local
import time
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
import pytest
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

import app.models  # noqa: F401
from app.api import guest_chat as guest
from app.core.config import settings
from app.db.base import Base
from app.models.web_portal import GuestChatSession, WebConversation, WebMessage, WebOutboxEvent
from tests.test_visa_workflow_postgres import owned_postgres


pytestmark = pytest.mark.skipif(not os.environ.get("BALI_TEST_POSTGRES_BIN"),
                              reason="Requires existing owned PostgreSQL runtime")
ORIGIN = "https://guest.fixture"
RAW = "synthetic-guest-postgres-session-only"


def request(method="POST"):
    return Request({"type": "http", "method": method, "scheme": "https", "path": "/",
                    "query_string": b"", "headers": [(b"origin", ORIGIN.encode())],
                    "server": ("guest.fixture", 443), "client": ("127.0.0.1", 12345)})


def decoded(response):
    assert response.status_code == 201
    return json.loads(response.body)


@pytest.fixture
def guest_pg(owned_postgres, monkeypatch):
    schema = "guest_chat_" + uuid4().hex
    with owned_postgres.begin() as connection:
        connection.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
    bind = owned_postgres.execution_options(schema_translate_map={None: schema})
    Base.metadata.create_all(bind)
    factory = sessionmaker(bind=bind, autocommit=False, autoflush=False)
    worker = local()

    def api_session():
        db = factory()
        label = getattr(worker, "label", "caller")
        db.execute(sa.text("SELECT set_config('application_name', :name, true)"),
                   {"name": schema + ":" + label})
        return db

    monkeypatch.setattr(guest, "SessionLocal", api_session)
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    monkeypatch.setattr(settings, "WEBSITE_URL", ORIGIN)
    with factory() as db:
        db.add(GuestChatSession(token_hash=guest.token_hash(RAW), origin=ORIGIN,
                               expires_at=datetime.utcnow() + timedelta(days=1)))
        db.commit()

    def call(label, payload):
        worker.label = label
        return guest.send_message(payload, request(), raw=RAW, csrf_token=guest.csrf(RAW))

    def revoke():
        worker.label = "revoke"
        return guest.revoke_session(request("DELETE"), raw=RAW, csrf_token=guest.csrf(RAW))

    def wait_for_lock(label):
        # Observe a real PostgreSQL row-lock wait, rather than infer concurrency
        # from thread scheduling or a sleep. Complete inside the product's 1s cap.
        deadline = time.monotonic() + 0.7
        while time.monotonic() < deadline:
            with owned_postgres.connect() as connection:
                waiting = connection.execute(sa.text("""
                    SELECT count(*) FROM pg_stat_activity
                    WHERE application_name = :name AND wait_event_type = 'Lock'
                """), {"name": schema + ":" + label}).scalar_one()
            if waiting:
                return
            time.sleep(0.01)
        pytest.fail("Competing guest transaction did not reach its PostgreSQL row-lock wait")

    return factory, call, revoke, wait_for_lock


def held_first_write(monkeypatch):
    entered, release = Event(), Event()
    original = guest.create_client_message

    def create(*args, **kwargs):
        message = original(*args, **kwargs)
        # Only the first write is paused; the competing operation uses normal code.
        if not entered.is_set():
            entered.set()
            assert release.wait(5), "Synthetic first transaction was not released"
        return message

    monkeypatch.setattr(guest, "create_client_message", create)
    return entered, release


def counts(factory):
    with factory() as db:
        return tuple(db.query(model).count() for model in (WebConversation, WebMessage, WebOutboxEvent))


def test_concurrent_first_messages_share_one_conversation(guest_pg, monkeypatch):
    factory, call, _, wait_for_lock = guest_pg
    entered, release = held_first_write(monkeypatch)
    first_payload = guest.MessageRequest(body="Synthetic first question", idempotency_key=uuid4())
    second_payload = guest.MessageRequest(body="Synthetic second question", idempotency_key=uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(call, "first", first_payload)
        try:
            assert entered.wait(3)
            second = pool.submit(call, "second", second_payload)
            wait_for_lock("second")
            assert not second.done()
        finally:
            release.set()
        first_result, second_result = decoded(first.result(5)), decoded(second.result(5))
    assert first_result["chat"]["id"] == second_result["chat"]["id"]
    assert first_result["message_id"] != second_result["message_id"]
    assert counts(factory) == (1, 2, 2)
    with factory() as db:
        session = db.query(GuestChatSession).one()
        assert session.conversation_id == first_result["chat"]["id"]
        assert [row.body for row in db.query(WebMessage).order_by(WebMessage.id)] == [
            "Synthetic first question", "Synthetic second question"]


def test_same_key_retry_is_single_write_and_revoke_orders_before_replay(guest_pg, monkeypatch):
    factory, call, revoke, wait_for_lock = guest_pg
    entered, release = held_first_write(monkeypatch)
    payload = guest.MessageRequest(body="Synthetic retry question", idempotency_key=uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(call, "first", payload)
        try:
            assert entered.wait(3)
            retry = pool.submit(call, "retry", payload)
            wait_for_lock("retry")
            assert not retry.done()
        finally:
            release.set()
        first_result, retry_result = decoded(first.result(5)), decoded(retry.result(5))
        assert first_result["message_id"] == retry_result["message_id"]
        assert not first_result["idempotent_replay"]
        assert retry_result["idempotent_replay"]
        assert counts(factory) == (1, 1, 1)

        # A real revoke cannot commit while another authorized operation owns
        # the session row; after its ordered commit the old retry has no access.
        with factory() as held:
            guest.proof(held, RAW, lock=True)
            future_revoke = pool.submit(revoke)
            try:
                wait_for_lock("revoke")
                assert not future_revoke.done()
            finally:
                held.commit()
            assert future_revoke.result(5).status_code == 204
        with pytest.raises(HTTPException) as denied:
            call("revoked-replay", payload)
        assert denied.value.status_code == 401
    assert counts(factory) == (1, 1, 1)
    with factory() as db:
        assert db.query(GuestChatSession).one().revoked_at is not None


def test_actual_guest_migration_preserves_old_chat_rows(owned_postgres):
    schema = "guest_migration_" + uuid4().hex
    path = Path(__file__).resolve().parents[1] / "alembic/versions/a42d8c7e910f_add_guest_chat_sessions.py"
    spec = spec_from_file_location(path.stem, path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    with owned_postgres.begin() as connection:
        connection.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
        connection.execute(sa.text("CREATE TABLE web_conversations (id INTEGER PRIMARY KEY, guest_name TEXT, status TEXT)"))
        connection.execute(sa.text("CREATE TABLE web_messages (id INTEGER PRIMARY KEY, conversation_id INTEGER REFERENCES web_conversations(id), body TEXT, visibility TEXT)"))
        connection.execute(sa.text("CREATE TABLE web_outbox_events (id INTEGER PRIMARY KEY, aggregate_id INTEGER REFERENCES web_conversations(id), payload JSONB, status TEXT)"))
        connection.execute(sa.text("INSERT INTO web_conversations VALUES (1, 'Synthetic legacy guest', 'open')"))
        connection.execute(sa.text("INSERT INTO web_messages VALUES (2, 1, 'Старая синтетическая история', 'client'), (3, 1, 'Synthetic internal note', 'internal')"))
        connection.execute(sa.text("INSERT INTO web_outbox_events VALUES (4, 1, CAST(:payload AS JSONB), 'delivered')"),
                           {"payload": json.dumps({"message_id": 2})})
        tables = ("web_conversations", "web_messages", "web_outbox_events")
        before = {name: connection.execute(sa.text(f"SELECT * FROM {name} ORDER BY id")).all() for name in tables}
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        after = {name: connection.execute(sa.text(f"SELECT * FROM {name} ORDER BY id")).all() for name in tables}
        assert after == before
        assert connection.execute(sa.text("SELECT count(*) FROM guest_chat_sessions")).scalar_one() == 0
        foreign_keys = sa.inspect(connection).get_foreign_keys("guest_chat_sessions", schema=schema)
        assert len(foreign_keys) == 1
        assert foreign_keys[0]["referred_table"] == "web_conversations"
        assert foreign_keys[0]["options"].get("ondelete") == "RESTRICT"
