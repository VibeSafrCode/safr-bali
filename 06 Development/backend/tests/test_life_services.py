import os
import hashlib
import json
from datetime import datetime, timedelta
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SERVICE_API_TOKEN", "test-service")
os.environ.setdefault("ADMIN_API_TOKEN", "test-admin")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import life_services, mini_app, web_admin, web_portal
from app.core.config import settings
from app.core import security
from app.db.base import Base
from app.main import app
from app.models.admin_action import AdminAction
from app.models.life_services import LifeService
from app.models.mini_app_session import MiniAppSession
from app.models.user import User
from app.models.web_portal import WebSession
from app.schemas.life_services import LifeServiceCreate
from app.services.life_services import LifeServiceConflict, create_life_service


@pytest.fixture
def api(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", 101)
    monkeypatch.setattr(settings, "RATE_LIMIT_PER_MINUTE", 100000)
    monkeypatch.setattr(security, "rate_limiter", security.InMemoryRateLimiter())
    monkeypatch.setattr(settings, "APPLICATION_URL", "https://app.example.test")
    for module in (life_services, mini_app, web_admin, web_portal):
        monkeypatch.setattr(module, "SessionLocal", factory)
    with factory() as db:
        users = [
            User(telegram_id=101, role="admin", ref_code="root", status="active"),
            User(telegram_id=102, role="client", ref_code="client", status="active"),
            User(telegram_id=103, role="client", ref_code="other", status="active"),
            User(telegram_id=104, role="admin", ref_code="fake-root", status="active"),
        ]
        db.add_all(users)
        db.flush()
        for user in users:
            token = f"web-session-{user.id}"
            db.add(WebSession(user_id=user.id, token_hash=web_portal.token_hash(token), expires_at=datetime.utcnow() + timedelta(days=1)))
            db.add(MiniAppSession(
                user_id=user.id, access_token_hash=mini_app.token_hash(f"mini-{user.id}"),
                refresh_token_hash=mini_app.token_hash(f"refresh-{user.id}"),
                access_expires_at=datetime.utcnow() + timedelta(hours=1),
                refresh_expires_at=datetime.utcnow() + timedelta(days=1),
            ))
        db.commit()
    with TestClient(app) as client:
        yield client, factory, users
    engine.dispose()


def web_session(client, user_id):
    client.cookies.clear()
    token = f"web-session-{user_id}"
    client.cookies.set(settings.WEB_SESSION_COOKIE_NAME, token)
    return {"Origin": "https://app.example.test", "X-CSRF-Token": web_admin.admin_csrf_token(token)}


def published(**changes):
    return {"kind": "bike", "title": "Yamaha NMAX", "start_date": "2026-10-01", "end_date": "2026-10-30",
            "price_amount": "2500000.00", "price_currency": "IDR", "price_unit": "period",
            "publication_status": "PUBLISHED", "idempotency_key": "fixture-create-1", **changes}


def create(client, headers, body, user_id=2):
    return client.post(f"/api/web/admin/clients/{user_id}/life-services", headers=headers, json=body)


def test_complete_lifecycle_across_web_and_mini_preserves_history_and_privacy(api):
    client, factory, _ = api
    headers = web_session(client, 1)
    first = create(client, headers, published(owner_details="Private owner number", internal_note="Private margin", public_contact="Approved contact"))
    assert first.status_code == 201
    row = first.json()
    assert row["price_amount"] == "2500000.00"
    assert row["version"] == 1 and row["owner_details"] == "Private owner number"
    assert create(client, headers, {"kind": "housing", "idempotency_key": "incomplete-draft"}).status_code == 201
    insurance = create(client, headers, published(kind="insurance", title="Example insurance", start_date=None,
                                                end_date="2020-01-01", price_amount=None, idempotency_key="insurance-record"))
    assert insurance.status_code == 201
    assert insurance.json()["start_date"] is None and insurance.json()["price_amount"] is None
    web_session(client, 2)
    response = client.get("/api/web/life-services")
    assert response.status_code == 200 and response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-robots-tag"] == "noindex, nofollow"
    assert len(response.json()["items"]) == 2  # Published history remains visible.
    assert all(key not in response.text for key in ("owner_details", "internal_note", "Private", "payload_hash", "created_by_admin_id"))
    client.cookies.clear()
    client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, "mini-2")
    assert client.get("/mini-app/life-services").json() == response.json()
    assert client.get(f"/mini-app/life-services/{row['id']}").json()["public_contact"] == "Approved contact"
    headers = web_session(client, 1)
    update = {k: v for k, v in published().items() if k != "idempotency_key"}
    update.update(expected_version=1, end_date="2026-11-15", publication_status="HIDDEN")
    changed = client.put(f"/api/web/admin/clients/2/life-services/{row['id']}", headers=headers, json=update)
    assert changed.status_code == 200 and changed.json()["version"] == 2
    web_session(client, 2)
    assert client.get(f"/api/web/life-services/{row['id']}").status_code == 404
    assert len(client.get("/api/web/life-services").json()["items"]) == 1
    headers = web_session(client, 1)
    update.update(expected_version=2, publication_status="ARCHIVED")
    assert client.put(f"/api/web/admin/clients/2/life-services/{row['id']}", headers=headers, json=update).status_code == 200
    assert len(client.get("/api/web/admin/clients/2/life-services").json()["items"]) == 3
    with factory() as db:
        actions = db.query(AdminAction).all()
        assert len(actions) == 5 and all(action.admin_user_id == 1 for action in actions)
        assert all("Private" not in str(action.details) for action in actions)


def test_idempotency_is_content_client_and_actor_bound_and_replays_current_row(api):
    client, factory, _ = api
    headers = web_session(client, 1)
    first = create(client, headers, published()).json()
    again = create(client, headers, published(price_amount="2500000"))
    assert again.status_code == 200 and again.json()["idempotent_replay"]
    assert again.json()["id"] == first["id"]
    assert create(client, headers, published(title="Other model")).status_code == 409
    assert create(client, headers, published(), user_id=3).status_code == 409
    with factory() as db:
        with pytest.raises(LifeServiceConflict):
            create_life_service(db, user_id=2, actor_id=4, payload=LifeServiceCreate(**published()))
        assert db.query(LifeService).count() == 1
        assert db.query(AdminAction).count() == 1


def test_stale_edit_and_wrong_client_never_overwrite_or_audit(api):
    client, factory, _ = api
    headers = web_session(client, 1)
    first = create(client, headers, published()).json()
    body = {k: v for k, v in published().items() if k != "idempotency_key"}
    body.update(expected_version=1, title="First editor")
    path = f"/api/web/admin/clients/2/life-services/{first['id']}"
    assert client.put(path, headers=headers, json=body).status_code == 200
    body["title"] = "Stale editor"
    assert client.put(path, headers=headers, json=body).status_code == 409
    assert client.put(path.replace("clients/2", "clients/3"), headers=headers, json=body).status_code == 404
    assert client.get(path).json()["title"] == "First editor"
    assert client.get(path.replace("clients/2", "clients/3")).status_code == 404
    with factory() as db:
        row = db.get(LifeService, first["id"])
        assert row.title == "First editor" and row.version == 2
        assert db.query(AdminAction).count() == 2


@pytest.mark.parametrize("changes", [
    {"title": "  "}, {"end_date": None}, {"start_date": None},
    {"start_date": "2026-12-01"}, {"end_date": "2026-10-30T00:00:00Z"},
    {"link_url": "javascript:alert(1)"}, {"link_url": "https://user:password@example.com"},
    {"link_url": "//example.com"}, {"link_url": "https://example.com\\@evil.test"},
    {"price_amount": "-1"}, {"price_amount": "NaN"}, {"price_amount": 1.25},
    {"price_amount": "0.001"}, {"price_amount": "100000000000000.00"},
    {"price_currency": "EUR"}, {"title": "a" * 201}, {"admin_user_id": 4},
    {"quantity": 0}, {"quantity": -1}, {"quantity": 1.5}, {"quantity": True},
    {"quantity": "2"}, {"quantity": 2147483648}, {"rental_mode": "weekly"},
    {"housing_type": "villa"}, {"kind": "housing", "housing_type": "castle"},
    {"kind": "housing", "quantity": 2}, {"kind": "insurance", "rental_mode": "monthly"},
    {"rental_mode": "monthly", "end_date": None, "start_date": None},
])
def test_invalid_fields_cannot_publish_or_create_partial_rows(api, changes):
    client, factory, _ = api
    headers = web_session(client, 1)
    response = create(client, headers, published(**changes))
    assert response.status_code == 422, response.text
    with factory() as db:
        assert db.query(LifeService).count() == 0 and db.query(AdminAction).count() == 0


def test_auth_role_csrf_and_cross_client_guards_are_real_dependencies(api):
    client, factory, _ = api
    for path in ("/api/web/life-services", "/mini-app/life-services", "/api/web/admin/clients/2/life-services"):
        assert client.get(path).status_code == 401
    assert create(client, {}, published()).status_code == 401
    for user_id in (2, 3, 4):
        headers = web_session(client, user_id)
        assert client.get("/api/web/admin/clients/2/life-services").status_code == 403
        assert create(client, headers, published()).status_code == 403
    headers = web_session(client, 1)
    assert create(client, {**headers, "X-CSRF-Token": "wrong"}, published()).status_code == 403
    assert create(client, {**headers, "Origin": "https://evil.example.test"}, published()).status_code == 403
    assert create(client, {}, published()).status_code == 403
    first = create(client, headers, published()).json()
    assert create(client, headers, published(), user_id=999).status_code == 404
    web_session(client, 3)
    assert client.get("/api/web/life-services").json() == {"items": []}
    assert client.get(f"/api/web/life-services/{first['id']}").status_code == 404
    client.cookies.clear()
    client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, "mini-3")
    assert client.get(f"/mini-app/life-services/{first['id']}").status_code == 404
    with factory() as db:
        db.get(User, 2).status = "blocked"
        db.commit()
    web_session(client, 2)
    assert client.get("/api/web/life-services").status_code == 401
    client.cookies.clear()
    client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, "mini-2")
    assert client.get("/mini-app/life-services").status_code == 401


def test_audit_failure_rolls_back_record_and_allows_safe_retry(api):
    client, factory, _ = api
    headers = web_session(client, 1)

    def fail_audit(mapper, connection, target):
        raise RuntimeError("Simulated audit persistence failure")

    event.listen(AdminAction, "before_insert", fail_audit)
    try:
        with pytest.raises(RuntimeError, match="audit persistence"):
            create(client, headers, published())
    finally:
        event.remove(AdminAction, "before_insert", fail_audit)
    with factory() as db:
        assert db.query(LifeService).count() == 0
        assert db.query(AdminAction).count() == 0
    assert create(client, headers, published()).status_code == 201


def test_record_survives_failed_update_and_replay_does_not_republish(api):
    client, factory, _ = api
    headers = web_session(client, 1)
    row = create(client, headers, published()).json()
    body = {k: v for k, v in published().items() if k != "idempotency_key"}
    body.update(expected_version=1, publication_status="HIDDEN")
    path = f"/api/web/admin/clients/2/life-services/{row['id']}"
    with patch("app.services.life_services.AdminAction", side_effect=RuntimeError("audit failure")):
        with pytest.raises(RuntimeError, match="audit failure"):
            client.put(path, headers=headers, json=body)
    with factory() as db:
        assert db.get(LifeService, row["id"]).version == 1
        assert db.get(LifeService, row["id"]).publication_status == "PUBLISHED"
    assert client.put(path, headers=headers, json=body).status_code == 200
    replay = create(client, headers, published())
    assert replay.status_code == 200 and replay.json()["publication_status"] == "HIDDEN"
    assert replay.json()["version"] == 2


@pytest.mark.parametrize("housing_type", ["guesthouse", "hotel", "apartment", "villa"])
def test_monthly_housing_has_no_invented_expiry_and_private_owner(api, housing_type):
    client, factory, _ = api
    headers = web_session(client, 1)
    response = create(client, headers, published(
        kind="housing", housing_type=housing_type, rental_mode="monthly", end_date=None,
        price_unit="month", owner_details="Private landlord", internal_note="Private margin",
    ))
    assert response.status_code == 201, response.text
    row = response.json()
    assert row["end_date"] is None and row["rental_mode"] == "monthly"
    assert row["housing_type"] == housing_type and row["quantity"] == 1
    assert row["price_amount"] == "2500000.00" and row["owner_details"] == "Private landlord"
    web_session(client, 2)
    public = client.get("/api/web/life-services").json()["items"][0]
    assert public["end_date"] is None and public["housing_type"] == housing_type
    assert "owner_details" not in public and "internal_note" not in public
    client.cookies.clear()
    client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, "mini-2")
    assert client.get("/mini-app/life-services").json()["items"] == [public]
    with factory() as db:
        stored = db.get(LifeService, row["id"])
        assert stored.end_date is None and stored.start_date.isoformat() == "2026-10-01"


def test_quantity_monthly_edits_and_legacy_snapshot_preserve_rental_details(api):
    client, factory, _ = api
    headers = web_session(client, 1)
    payload = published(quantity=3, rental_mode="monthly", end_date=None, price_unit="month")
    row = create(client, headers, payload).json()
    assert row["quantity"] == 3 and row["end_date"] is None
    assert create(client, headers, {**payload, "quantity": 2}).status_code == 409
    path = f"/api/web/admin/clients/2/life-services/{row['id']}"
    body = {k: v for k, v in payload.items() if k != "idempotency_key"}
    body.update(expected_version=1, quantity=4, end_date="2027-01-01")
    saved = client.put(path, headers=headers, json=body)
    assert saved.status_code == 200 and saved.json()["quantity"] == 4
    assert client.put(path, headers=headers, json=body).status_code == 409
    body.update(expected_version=2, title="Legacy editor title")
    for key in ("housing_type", "rental_mode", "quantity"):
        body.pop(key, None)
    saved = client.put(path, headers=headers, json=body)
    assert saved.status_code == 200
    assert saved.json()["quantity"] == 4 and saved.json()["rental_mode"] == "monthly"
    with factory() as db:
        assert db.get(LifeService, row["id"]).price_amount == 2500000
        assert db.query(AdminAction).count() == 3


def test_pre_migration_fingerprint_replays_only_with_legacy_defaults(api):
    client, factory, _ = api
    headers = web_session(client, 1)
    row = create(client, headers, published()).json()
    content = LifeServiceCreate(**published()).model_dump(mode="json", exclude={
        "idempotency_key", "housing_type", "rental_mode", "quantity",
    })
    legacy_hash = hashlib.sha256(json.dumps(content, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    with factory() as db:
        assert db.get(LifeService, row["id"]).create_payload_hash == legacy_hash
    replay = create(client, headers, published(housing_type=None, rental_mode="fixed", quantity=1))
    assert replay.status_code == 200 and replay.json()["idempotent_replay"]
    assert create(client, headers, published(quantity=2)).status_code == 409
    assert create(client, headers, published(rental_mode="monthly")).status_code == 409
    assert row["housing_type"] is None and row["rental_mode"] == "fixed" and row["quantity"] == 1
