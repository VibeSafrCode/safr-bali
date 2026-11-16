"""Mini App session invariants on the existing disposable PostgreSQL fixture."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
import os
from uuid import uuid4

from fastapi import Response
import pytest
from sqlalchemy import event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

import app.models
from app.api import mini_app
from app.db.base import Base
from app.models.mini_app_session import MiniAppSession
from app.models.user import User
from tests.test_visa_workflow_postgres import owned_postgres


pytestmark = pytest.mark.skipif(
    not os.environ.get("BALI_TEST_POSTGRES_BIN"), reason="Requires an owned PostgreSQL runtime",
)


@pytest.fixture
def session_store(owned_postgres, monkeypatch):
    schema = f"mini_app_auth_{uuid4().hex}"
    with owned_postgres.begin() as db:
        db.execute(text(f'CREATE SCHEMA "{schema}"'))
    bind = owned_postgres.execution_options(schema_translate_map={None: schema})
    Base.metadata.create_all(bind)
    factory = sessionmaker(bind=bind, expire_on_commit=False)
    with factory.begin() as db:
        db.add(User(id=1, telegram_id=123, ref_code="AUTH-PG", status="active", role="client"))
    monkeypatch.setattr(mini_app, "SessionLocal", factory)
    return factory, bind


def test_one_verified_proof_has_only_one_committed_session_on_postgres(session_store):
    factory, _ = session_store
    gate = Barrier(2)
    proof_key = mini_app.token_hash("main:synthetic-verified-signature")

    def exchange():
        with factory() as db:
            user = db.get(User, 1)
            gate.wait(timeout=5)
            try:
                mini_app.issue_mini_app_session(db, user, init_data_hash=proof_key)
            except IntegrityError:
                return "duplicate"
            return "issued"

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(lambda _: exchange(), range(2))) == ["duplicate", "issued"]
    with factory() as db:
        assert db.query(MiniAppSession).count() == 1


def test_logout_revokes_refresh_rotation_that_commits_first_on_postgres(session_store):
    factory, bind = session_store
    with factory() as db:
        issued = mini_app.issue_mini_app_session(db, db.get(User, 1))
    rotated_row, logout_query, release = Event(), Event(), Event()

    def on_query(_, __, query, *args):
        if "previous_refresh_token_hash =" in query:
            logout_query.set()

    def refresh():
        with factory() as db:
            actual_commit = db.commit

            def commit_after_logout_starts():
                db.flush()
                rotated_row.set()
                assert release.wait(5)
                actual_commit()

            db.commit = commit_after_logout_starts
            return mini_app.rotate_mini_app_session(db, issued.refresh_token)

    event.listen(bind, "before_cursor_execute", on_query)
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            refresh_job = executor.submit(refresh)
            try:
                assert rotated_row.wait(5)
                logout_job = executor.submit(
                    mini_app.logout_mini_app_session, Response(), "", issued.refresh_token,
                )
                assert logout_query.wait(5)
            finally:
                release.set()
            assert logout_job.result(timeout=5) == {"authenticated": False}
            fresh = refresh_job.result(timeout=5)
    finally:
        event.remove(bind, "before_cursor_execute", on_query)
    with factory() as db:
        assert db.query(MiniAppSession).one().revoked_at is not None
        assert mini_app.rotate_mini_app_session(db, fresh.refresh_token) is None
