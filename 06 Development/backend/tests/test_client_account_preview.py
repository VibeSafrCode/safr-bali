import os
from datetime import datetime, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SERVICE_API_TOKEN", "test-service")
os.environ.setdefault("ADMIN_API_TOKEN", "test-admin")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.api import client_account_preview as preview, life_services, visa_lifecycle, web_portal
from app.core import security
from app.core.config import settings
from app.db.base import Base
from app.models.life_services import LifeService
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaDocument, VisaEvent, VisaType
from app.models.web_portal import WebConversation, WebMessage, WebSession


PREFIX = "/api/web/admin/clients/2/account-preview"
RESOURCES = ["account", "life-services", "visa-cases", "visa-cases/1", "chat"]


@pytest.fixture
def api(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    for module in (preview, life_services, visa_lifecycle, web_portal):
        monkeypatch.setattr(module, "SessionLocal", factory)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", 101)
    monkeypatch.setattr(settings, "RATE_LIMIT_PER_MINUTE", 100000)
    monkeypatch.setattr(security, "rate_limiter", security.InMemoryRateLimiter())
    for key in ("VISA_LIFECYCLE_ENABLED", "CLIENT_CABINET_ENABLED", "ADMIN_CLIENT_CRM_ENABLED"):
        monkeypatch.setattr(settings, key, True)
    with factory() as db:
        db.add_all([
            User(id=1, telegram_id=101, role="admin", ref_code="root", first_name="Admin"),
            User(id=2, telegram_id=102, role="client", ref_code="target", first_name="Target"),
            User(id=3, telegram_id=103, role="client", ref_code="other"),
            User(id=4, telegram_id=104, role="admin", ref_code="non-root"),
            User(id=5, telegram_id=105, role="client", ref_code="inactive", status="blocked"),
        ])
        db.flush()
        for user_id in range(1, 6):
            db.add(WebSession(user_id=user_id, token_hash=web_portal.token_hash(f"session-{user_id}"),
                              expires_at=datetime.utcnow() + timedelta(days=1)))
        db.add(VisaType(id=1, country_code="ID", code="B1", name="B1", version=1))
        for case_id, user_id, publication in [(1, 2, "PUBLISHED"), (2, 2, "DRAFT"),
                                             (3, 3, "PUBLISHED"), (4, 2, "HIDDEN"), (5, 2, "ARCHIVED")]:
            db.add(VisaCase(id=case_id, user_id=user_id, visa_type_id=1, assigned_admin_id=1,
                            publication_status=publication, contact_internal_note="private-note",
                            next_action_text="private-next-action", next_action_visible=False,
                            passport_envelope=b"private-credential"))
        for record_id, publication in enumerate(["PUBLISHED", "DRAFT", "HIDDEN", "ARCHIVED"], 1):
            db.add(LifeService(id=record_id, user_id=2, kind="other", title=f"Service {record_id}",
                               publication_status=publication, owner_details="private-owner",
                               internal_note="private-note", created_by_admin_id=1, updated_by_admin_id=1,
                               create_idempotency_key=f"service-{record_id}", create_payload_hash="a" * 64))
        db.add(LifeService(id=5, user_id=3, kind="other", title="Other client service",
                           publication_status="PUBLISHED", created_by_admin_id=1, updated_by_admin_id=1,
                           create_idempotency_key="foreign-service", create_payload_hash="b" * 64))
        db.add_all([
            VisaEvent(visa_case_id=1, event_type="PUBLIC", source="admin", visibility="CLIENT", public_title="Visible"),
            VisaEvent(visa_case_id=1, event_type="PRIVATE", source="admin", visibility="INTERNAL", public_title="private-event"),
        ])
        for doc_id, visibility, archived in [(1, "CLIENT", None), (2, "INTERNAL", None),
                                              (3, "CLIENT", datetime.utcnow())]:
            db.add(VisaDocument(id=doc_id, user_id=2, visa_case_id=1, document_type="visa",
                                display_name=f"Document {doc_id}", storage_key=f"private-storage-{doc_id}",
                                visibility=visibility, archived_at=archived, uploaded_by_admin_id=1))
        db.add(WebConversation(id=1, user_id=2, route_context={"visa_case_id": 1}, assigned_staff_ids=[1]))
        db.flush()
        db.add_all([
            WebMessage(conversation_id=1, author_type="client", body="Visible message", visibility="client"),
            WebMessage(conversation_id=1, author_type="staff", body="private-message", visibility="internal"),
        ])
        db.commit()
    app = FastAPI()
    app.add_middleware(preview.ClientPreviewNoStoreMiddleware)
    app.include_router(preview.router)
    app.include_router(web_portal.router)
    app.include_router(life_services.web_router)
    app.include_router(visa_lifecycle.web_router)
    with TestClient(app) as client:
        yield client, factory, engine
    engine.dispose()


def login(client, user_id=1):
    client.cookies.clear()
    if user_id is not None:
        client.cookies.set(settings.WEB_SESSION_COOKIE_NAME, f"session-{user_id}")


def private(response):
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-robots-tag"] == "noindex, nofollow"


@pytest.mark.parametrize("resource", RESOURCES)
@pytest.mark.parametrize("actor,status", [(None, 401), (2, 403), (4, 403), (5, 401)])
def test_every_read_requires_actual_active_root_admin(api, resource, actor, status):
    client, _, _ = api
    login(client, actor)
    response = client.get(f"{PREFIX}/{resource}")
    assert response.status_code == status
    private(response)


@pytest.mark.parametrize("resource", RESOURCES)
@pytest.mark.parametrize("target", [5, 999])
def test_every_read_checks_target_exists_and_is_active(api, resource, target):
    client, _, _ = api
    login(client)
    response = client.get(f"/api/web/admin/clients/{target}/account-preview/{resource}")
    assert response.status_code == 404
    private(response)


def test_client_projection_parity_and_no_internal_data(api, caplog):
    client, _, _ = api
    caplog.set_level("INFO", logger=preview.__name__)
    login(client, 2)
    actual = {resource: client.get(f"/api/web/{resource}").json() for resource in RESOURCES}
    # Preview retains document metadata, explicitly disabling owner-session URLs.
    for card in [*actual["visa-cases"]["items"], actual["visa-cases/1"]]:
        for document in card["documents"]:
            document["access_url"] = None
    login(client)
    for resource in RESOURCES:
        response = client.get(f"{PREFIX}/{resource}")
        assert response.status_code == 200
        private(response)
        assert response.json() == actual[resource]
        assert "private-" not in response.text
        assert "set-cookie" not in response.headers
    assert [item["id"] for item in actual["life-services"]["items"]] == [1]
    assert [item["id"] for item in actual["visa-cases"]["items"]] == [1]
    detail = actual["visa-cases/1"]
    assert [doc["id"] for doc in detail["documents"]] == [1]
    assert [entry["title"] for entry in detail["timeline"]] == ["Visible"]
    assert detail["next_action_text"] is None
    assert actual["chat"]["messages"][0]["body"] == "Visible message"
    assert len(actual["chat"]["messages"]) == 1
    assert "actor_user_id=1 target_user_id=2" in caplog.text
    assert client.get("/api/web/account").json()["first_name"] == "Admin"


@pytest.mark.parametrize("case_id", [2, 3, 4, 5, 999])
def test_unpublished_or_foreign_case_cannot_be_opened(api, case_id):
    client, _, _ = api
    login(client)
    response = client.get(f"{PREFIX}/visa-cases/{case_id}")
    assert response.status_code == 404
    private(response)


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
@pytest.mark.parametrize("resource", RESOURCES)
def test_writes_not_routed(api, method, resource):
    client, _, _ = api
    login(client)
    response = client.request(method, f"{PREFIX}/{resource}", json={"user_id": 3})
    assert response.status_code == 405
    private(response)


def test_preview_does_not_write_or_change_session_identity(api):
    client, factory, engine = api
    login(client)
    writes = []
    def record_write(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().split(" ", 1)[0].upper() in {"INSERT", "UPDATE", "DELETE"}:
            writes.append(statement)
    event.listen(engine, "before_cursor_execute", record_write)
    try:
        for resource in RESOURCES:
            assert client.get(f"{PREFIX}/{resource}").status_code == 200
        empty = client.get("/api/web/admin/clients/3/account-preview/chat")
        assert empty.json() == {"id": None, "status": "empty", "messages": []}
    finally:
        event.remove(engine, "before_cursor_execute", record_write)
    assert writes == []
    with factory() as db:
        assert db.query(WebSession).count() == 5
        assert db.query(WebSession).filter_by(token_hash=web_portal.token_hash("session-1")).one().user_id == 1
        assert db.query(WebConversation).count() == 1
        assert db.get(User, 1).role == "admin"
        assert db.get(User, 2).role == "client"
    assert client.cookies.get(settings.WEB_SESSION_COOKIE_NAME) == "session-1"


def test_rights_are_rechecked_on_next_read(api):
    client, factory, _ = api
    login(client)
    assert client.get(f"{PREFIX}/account").status_code == 200
    with factory() as db:
        db.get(User, 1).role = "client"
        db.commit()
    response = client.get(f"{PREFIX}/account")
    assert response.status_code == 403
    private(response)


def test_errors_are_uncacheable_including_unhandled_errors(api, monkeypatch):
    client, _, _ = api
    login(client)
    for path, status in [(f"{PREFIX}/visa-cases/not-an-int", 422),
                         (f"{PREFIX}/unknown", 404),
                         ("/api/web/admin/clients/not-an-int/account-preview/account", 422)]:
        response = client.get(path)
        assert response.status_code == status
        private(response)
    def broken_dashboard(*args):
        raise RuntimeError("private-error-details")
    monkeypatch.setattr(preview, "dashboard_for_user", broken_dashboard)
    response = client.get(f"{PREFIX}/account")
    assert response.status_code == 500
    private(response)
    assert response.json() == {"detail": "Internal server error"}


def test_disabled_visa_feature_remains_disabled(api, monkeypatch):
    client, _, _ = api
    login(client)
    monkeypatch.setattr(settings, "VISA_LIFECYCLE_ENABLED", False)
    response = client.get(f"{PREFIX}/visa-cases")
    assert response.status_code == 503
    private(response)
