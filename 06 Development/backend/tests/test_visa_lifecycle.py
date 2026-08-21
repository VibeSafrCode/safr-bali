import base64
import os
from datetime import date, datetime, timezone

os.environ.setdefault("DATABASE_URL", "sqlite:////private/tmp/safr-visa-stage1-tests.db")
os.environ.setdefault("SERVICE_API_TOKEN", "test-service")
os.environ.setdefault("ADMIN_API_TOKEN", "test-admin")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
import app.models  # noqa: F401,E402
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaNotificationDelivery, VisaType
from app.models.visa_lifecycle import CredentialVaultItem, VisaEvent
from app.services.visa_lifecycle import (
    PIIConfigurationError,
    PIIEnvelopeCipher,
    claim_deliveries,
    mask_identifier,
    settle_delivery,
    validate_dates,
    VisaLifecycleError,
)
from app.core.config import settings
from app.api import visa_lifecycle as api
from fastapi import Response


def database():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def seed(db):
    admin = User(telegram_id=100, ref_code="root", role="admin", status="active", locale="ru")
    client = User(telegram_id=200, ref_code="client", role="client", status="active", locale="en")
    db.add_all([admin, client]); db.flush()
    visa_type = VisaType(country_code="ID", code="B1", name="B1", version=1, rules_verified=False)
    db.add(visa_type); db.flush()
    case = VisaCase(
        user_id=client.id, visa_type_id=visa_type.id, assigned_admin_id=admin.id,
        entry_deadline=date(2026, 9, 10), stay_end=date(2026, 8, 25),
        date_source="verified document", dates_confirmed_by=admin.id,
        dates_confirmed_at=datetime(2026, 8, 20, tzinfo=timezone.utc),
    )
    db.add(case); db.commit()
    return admin, client, case


def enable_stage1(monkeypatch):
    monkeypatch.setattr(settings, "VISA_LIFECYCLE_ENABLED", True)
    monkeypatch.setattr(settings, "CLIENT_CABINET_ENABLED", True)
    monkeypatch.setattr(settings, "ADMIN_CLIENT_CRM_ENABLED", True)
    monkeypatch.setattr(settings, "VISA_EXTERNAL_TRACKER_ENABLED", False)
    monkeypatch.setattr(settings, "VISA_AI_IMPORT_ENABLED", False)


def test_pii_envelope_is_versioned_masked_and_fail_closed():
    key = b"k" * 32
    cipher = PIIEnvelopeCipher({"v1": key}, "v1")
    envelope = cipher.encrypt("TEST-123456", context="case:1")
    assert b"TEST-123456" not in envelope
    assert b'"v":"v1"' in envelope
    assert cipher.decrypt(envelope, context="case:1") == "TEST-123456"
    assert mask_identifier("TEST-123456") == "••••3456"
    try:
        cipher.decrypt(envelope, context="case:2")
    except PIIConfigurationError:
        pass
    else:
        raise AssertionError("wrong envelope context must fail closed")


def test_legal_dates_require_source_and_confirmation():
    row = VisaCase(entry_deadline=date(2026, 9, 1))
    try:
        validate_dates(row)
    except VisaLifecycleError as exc:
        assert "source" in str(exc)
    else:
        raise AssertionError("unsourced legal date must be rejected")


def test_publication_delivery_claim_is_leased(monkeypatch):
    db = database(); _, _, case = seed(db)
    enable_stage1(monkeypatch)
    now = datetime(2026, 8, 20, 0, 0, tzinfo=timezone.utc)
    delivery = VisaNotificationDelivery(
        visa_case_id=case.id, recipient_user_id=case.user_id,
        recipient_kind="client", locale="en", notification_type="CASE_PUBLISHED",
        payload={"case_id": case.id}, dedupe_key=f"case:{case.id}:published:1",
        due_at=now, state="PENDING",
    )
    db.add(delivery); db.commit()
    rows = claim_deliveries(db, now=now)
    assert len(rows) == 1
    assert claim_deliveries(db, now=now) == []
    settled = settle_delivery(db, rows[0].id, rows[0].lease_token, state="DELIVERED", telegram_message_id="fixture-1")
    assert settled.state == "DELIVERED"
    assert db.query(VisaNotificationDelivery).filter_by(visa_case_id=case.id).count() == 1


def test_client_visibility_is_published_only_and_filters_internal_events(monkeypatch):
    db = database(); _, client, case = seed(db)
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    client_id, case_id = client.id, case.id
    db.add_all([
        VisaEvent(visa_case_id=case.id, event_type="INTERNAL_NOTE", source="admin", visibility="INTERNAL"),
        VisaEvent(visa_case_id=case.id, event_type="PUBLIC_UPDATE", source="admin", visibility="CLIENT", public_title="Ready"),
    ])
    db.commit()
    enable_stage1(monkeypatch)
    monkeypatch.setattr(api, "SessionLocal", factory)
    assert api._list_for_user(client)["items"] == []
    writer = factory(); writer.query(VisaCase).filter_by(id=case_id).update({"publication_status": "PUBLISHED"}); writer.commit(); writer.close()
    detached_client = User(id=client_id, telegram_id=client.telegram_id, ref_code="detached", locale="en")
    card = api._detail_for_user(case_id, detached_client)
    assert [event["type"] for event in card["timeline"]] == ["PUBLIC_UPDATE"]
    assert "passport_envelope" not in card


def test_vault_envelope_never_appears_in_client_card(monkeypatch):
    db = database(); admin, client, case = seed(db)
    cipher = PIIEnvelopeCipher({"v1": b"z" * 32}, "v1")
    db.add(CredentialVaultItem(
        user_id=client.id, visa_case_id=case.id, provider="Fixture portal",
        secret_envelope=cipher.encrypt("fixture-secret", context=f"credential:{client.id}:secret"),
        created_by_admin_id=admin.id, updated_by_admin_id=admin.id,
    ))
    case.publication_status = "PUBLISHED"; db.commit()
    enable_stage1(monkeypatch)
    monkeypatch.setattr(api, "SessionLocal", lambda: db)
    assert "fixture-secret" not in str(api._detail_for_user(case.id, client))


def test_publish_is_idempotent_and_enqueues_once(monkeypatch):
    db = database(); admin, _, case = seed(db)
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    payload = api.PublicationRequest(notify_client=True, reason="Fixture publish", idempotency_key="publish-fixture-0001")
    first = api.admin_publication(case.id, "publish", payload, admin)
    second = api.admin_publication(case.id, "publish", payload, admin)
    check = factory()
    assert first["publication_status"] == second["publication_status"] == "PUBLISHED"
    assert check.query(VisaEvent).filter_by(idempotency_key="publish-fixture-0001").count() == 1
    assert check.query(VisaNotificationDelivery).filter_by(notification_type="CASE_PUBLISHED").count() == 1


def test_published_update_notify_is_idempotent_and_not_publication(monkeypatch):
    db = database(); admin, _, case = seed(db)
    case.publication_status = "PUBLISHED"; db.commit()
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    payload = api.VisaCaseUpdate(service_status="PROCESSING", reason="Fixture update", expected_version=1, notify_client=True, idempotency_key="update-fixture-0001")
    first = api.admin_update(case.id, payload, admin)
    second = api.admin_update(case.id, payload, admin)
    check = factory()
    assert first["version"] == second["version"] == 2
    assert check.query(VisaEvent).filter_by(event_type="CASE_UPDATED", idempotency_key="update-fixture-0001").count() == 1
    assert check.query(VisaNotificationDelivery).filter_by(notification_type="CASE_UPDATED").count() == 1
    assert check.query(VisaNotificationDelivery).filter_by(notification_type="CASE_PUBLISHED").count() == 0


def test_client_document_access_is_visibility_scoped_and_fail_closed(monkeypatch):
    db = database(); admin, client, case = seed(db)
    case.publication_status = "PUBLISHED"
    visible = api.VisaDocument(user_id=client.id, visa_case_id=case.id, document_type="VISA", display_name="Visa.pdf", storage_key="visa.pdf", visibility="CLIENT", uploaded_by_admin_id=admin.id)
    internal = api.VisaDocument(user_id=client.id, visa_case_id=case.id, document_type="NOTE", display_name="Internal.pdf", storage_key="internal.pdf", visibility="INTERNAL", uploaded_by_admin_id=admin.id)
    db.add_all([visible, internal]); db.commit()
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory); monkeypatch.setattr(settings, "VISA_DOCUMENT_STORAGE_ROOT", "")
    try: api._document_file(case.id, visible.id, client)
    except api.HTTPException as exc: assert exc.status_code == 503
    else: raise AssertionError("missing storage key must fail closed")
    try: api._document_file(case.id, internal.id, client)
    except api.HTTPException as exc: assert exc.status_code == 404
    else: raise AssertionError("internal document must remain inaccessible")


def test_credential_reveal_is_audited_and_no_store(monkeypatch):
    db = database(); admin, client, case = seed(db)
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    key = base64.urlsafe_b64encode(b"q" * 32).decode().rstrip("=")
    monkeypatch.setattr(settings, "VISA_PII_KEY_VERSION", "v1")
    monkeypatch.setattr(settings, "VISA_PII_KEYS", '{"v1":"' + key + '"}')
    created = api.admin_credential(client.id, api.CredentialRequest(provider="Fixture", secret="not-real", visa_case_id=case.id), admin)
    response = Response()
    revealed = api.admin_credential_access(created["id"], api.CredentialAccessRequest(action="REVEAL", reason="Fixture access"), response, admin)
    assert revealed["secret"] == "not-real"
    assert response.headers["cache-control"] == "no-store"
    check = factory()
    from app.models.admin_action import AdminAction
    assert check.query(AdminAction).filter_by(action_type="CREDENTIAL_REVEAL", entity_id=created["id"]).count() == 1


def test_stage1_routes_are_registered_without_tracker_endpoints():
    from app.main import app
    paths = set(app.openapi()["paths"])
    required = {
        "/api/web/admin/clients",
        "/api/web/admin/clients/{user_id}",
        "/api/web/admin/visa-cases",
        "/api/web/admin/visa-cases/{case_id}/publication/{action}",
        "/mini-app/visa-cases",
        "/mini-app/visa-cases/{case_id}/documents/{document_id}",
        "/api/web/visa-cases",
        "/api/web/visa-cases/{case_id}/documents/{document_id}",
        "/api/service/visa-lifecycle/users/by-telegram/{telegram_id}/cases",
    }
    assert required <= paths
    assert not any("tracker" in path or "check-now" in path for path in paths)
