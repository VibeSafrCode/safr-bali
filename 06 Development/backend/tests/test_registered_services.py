"""Authoritative client-card service badges: no inference from account/dialogue."""
import os
from datetime import datetime

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SERVICE_API_TOKEN", "test-service")
os.environ.setdefault("ADMIN_API_TOKEN", "test-admin")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.api import visa_lifecycle as visa_api, web_admin
from app.core.config import settings
from app.core import security
from app.db.base import Base
from app.main import app
from app.models.admin_safety import StaffGrant
from app.models.life_services import LifeService
from app.models.order import Order
from app.models.referral import Referral
from app.models.service import Service
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaCaseAssignment, VisaType
from app.models.web_portal import WebConversation
from app.services.registered_services import registered_service_user_ids


@pytest.fixture
def store(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    db = factory()
    people = [User(telegram_id=i + 1, ref_code=f"TEST{i}", role="admin" if i == 0 else "client", status="active") for i in range(7)]
    db.add_all(people)
    kind = VisaType(country_code="ID", code="B1", name="Test visa", version=1)
    service = Service(name="Test housing", slug="test-housing", category="housing")
    db.add_all([kind, service]); db.commit()
    monkeypatch.setattr(web_admin, "SessionLocal", factory)
    monkeypatch.setattr(visa_api, "SessionLocal", factory)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", people[0].telegram_id)
    monkeypatch.setattr(settings, "VISA_LIFECYCLE_ENABLED", True)
    monkeypatch.setattr(settings, "ADMIN_CLIENT_CRM_ENABLED", True)
    monkeypatch.setattr(settings, "CLIENT_CABINET_ENABLED", True)
    monkeypatch.setattr(security, "rate_limiter", security.InMemoryRateLimiter())
    app.dependency_overrides[web_admin.require_web_admin] = lambda: people[0]
    app.dependency_overrides[visa_api.require_visa_staff] = lambda: people[0]
    yield db, people, kind, service
    app.dependency_overrides.clear()
    db.close(); engine.dispose()


def add_case(store, index=1, **values):
    db, people, kind, _ = store
    fields = dict(user_id=people[index].id, visa_type_id=kind.id, assigned_admin_id=people[0].id, publication_status="PUBLISHED")
    fields.update(values)
    case = VisaCase(**fields)
    db.add(case); db.commit()
    return case


def add_life_service(store, index=1, **values):
    db, people, _, _ = store
    fields = dict(user_id=people[index].id, kind="insurance", title="Synthetic insurer",
                  end_date=datetime(2026, 12, 31).date(), publication_status="PUBLISHED",
                  created_by_admin_id=people[0].id, updated_by_admin_id=people[0].id,
                  create_idempotency_key=f"test-life-{index}", create_payload_hash="0" * 64)
    fields.update(values)
    record = LifeService(**fields)
    db.add(record); db.commit()
    return record


@pytest.mark.parametrize("publication,expected", [
    ("PUBLISHED", True), ("HIDDEN", True), ("DRAFT", False), ("ARCHIVED", False),
])
def test_life_services_need_explicit_root_scope_and_registered_publication(store, publication, expected):
    db, people, _, _ = store
    add_life_service(store, publication_status=publication)
    assert registered_service_user_ids(db, [people[1].id]) == set()
    assert (people[1].id in registered_service_user_ids(db, [people[1].id], include_life_services=True)) is expected
    # A manager's existing restricted scope is fail-closed even with an enabled flag.
    assert registered_service_user_ids(db, [people[1].id], include_orders=False, include_life_services=True) == set()
    assert registered_service_user_ids(db, [people[2].id], include_life_services=True) == set()


@pytest.mark.parametrize("publication,service,lifecycle,expected", [
    ("PUBLISHED", "PURCHASED", "NOT_ISSUED", True),
    ("HIDDEN", "COMPLETED", "EXPIRED", True),
    ("PUBLISHED", "COMPLETED", "REFUSED", True),
    ("DRAFT", "PURCHASED", "NOT_ISSUED", False),
    ("ARCHIVED", "COMPLETED", "ACTIVE", False),
    ("PUBLISHED", "CANCELLED", "ACTIVE", False),
    ("PUBLISHED", "COMPLETED", "CANCELLED", False),
])
def test_visa_semantics(store, publication, service, lifecycle, expected):
    db, people, _, _ = store
    add_case(store, publication_status=publication, service_status=service, lifecycle_status=lifecycle)
    assert (people[1].id in registered_service_user_ids(db, [people[1].id])) is expected


@pytest.mark.parametrize("status,payment,cancelled,expected", [
    ("new", "pending", False, False),
    ("new", "paid", False, True),
    ("completed", "paid", False, True),
    ("cancelled", "paid", False, False),
    ("new", "paid", True, False),
    ("completed", "refund_required", False, False),
])
def test_order_semantics(store, status, payment, cancelled, expected):
    db, people, _, service = store
    db.add(Order(user_id=people[1].id, service_id=service.id, status=status, payment_status=payment, cancelled_at=datetime.utcnow() if cancelled else None)); db.commit()
    assert (people[1].id in registered_service_user_ids(db, [people[1].id])) is expected


def test_dialogue_only_and_all_endpoint_contracts(store):
    db, people, _, service = store
    db.add(WebConversation(user_id=people[1].id, source="website"))
    add_case(store, index=2)
    db.add(Order(user_id=people[3].id, service_id=service.id, payment_status="paid"))
    add_life_service(store, index=4, publication_status="HIDDEN")
    add_life_service(store, index=5, publication_status="DRAFT")
    add_life_service(store, index=6, publication_status="ARCHIVED")
    for person in people[1:7]:
        db.add(Referral(parent_user_id=people[0].id, child_user_id=person.id, level=1))
    db.commit()
    with TestClient(app) as client:
        for path in ("/api/web/admin/users", "/api/web/admin/clients", "/api/web/admin/referrals/graph"):
            response = client.get(path)
            assert response.status_code == 200, response.text
            payload = response.json()
            rows = payload.get("items", payload.get("nodes"))
            flags = {row["id"]: row["has_registered_services"] for row in rows}
            assert flags[people[1].id] is False  # Active account plus dialogue is not a service.
            assert flags[people[2].id] is True
            assert flags[people[3].id] is True
            assert flags[people[4].id] is True
            assert flags[people[5].id] is False
            assert flags[people[6].id] is False
            if "nodes" in payload:
                assert payload["root_user_id"] == people[0].id
        db.query(Referral).delete(); db.commit()
        assert client.get("/api/web/admin/referrals/graph").json()["root_user_id"] is None


def test_manager_badge_respects_assigned_cases_and_excludes_orders(store):
    db, people, _, service = store
    manager = people[6]
    visible = add_case(store, index=1, publication_status="ARCHIVED")
    add_case(store, index=1)  # Other staff's current case must not leak via a badge.
    db.add(Order(user_id=people[1].id, service_id=service.id, payment_status="paid"))
    add_life_service(store, index=1)
    grant = StaffGrant(user_id=manager.id, role_code="visa_manager", granted_by_admin_id=people[0].id, grant_reason="Test", grant_idempotency_key="grant-test")
    db.add(grant); db.flush()
    assignment = VisaCaseAssignment(visa_case_id=visible.id, staff_user_id=manager.id, staff_grant_id=grant.id, assigned_by_admin_id=people[0].id, assignment_reason="Test", assignment_idempotency_key="assignment-test")
    db.add(assignment); db.commit()
    app.dependency_overrides[visa_api.require_visa_staff] = lambda: manager
    with TestClient(app) as client:
        response = client.get("/api/web/admin/clients")
        assert response.status_code == 200
        assert response.json()["items"][0]["has_registered_services"] is False
        visible.publication_status = "PUBLISHED"; db.commit()
        assert client.get("/api/web/admin/clients").json()["items"][0]["has_registered_services"] is True
        grant.revoked_at = datetime.utcnow(); db.commit()
        assert client.get("/api/web/admin/clients").json()["items"][0]["has_registered_services"] is False


def test_batch_query_count_is_constant_and_empty_input_is_free(store):
    db, people, _, _ = store
    add_case(store)
    statements = []
    def record(*args):
        statements.append(args[2])
    event.listen(db.bind, "before_cursor_execute", record)
    try:
        assert registered_service_user_ids(db, []) == set()
        assert len(statements) == 0
        registered_service_user_ids(db, [person.id for person in people])
        assert len(statements) == 2
        statements.clear()
        registered_service_user_ids(db, [person.id for person in people], include_life_services=True)
        assert len(statements) == 3
        statements.clear()
        registered_service_user_ids(db, [person.id for person in people], include_orders=False, include_life_services=True)
        assert len(statements) == 1
    finally:
        event.remove(db.bind, "before_cursor_execute", record)
