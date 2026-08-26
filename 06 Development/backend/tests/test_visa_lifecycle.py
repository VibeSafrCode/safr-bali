import base64
import asyncio
import hashlib
from importlib.util import module_from_spec, spec_from_file_location
import os
from pathlib import Path
from datetime import date, datetime, timezone
from unittest.mock import Mock, patch
from urllib.parse import unquote

os.environ.setdefault("DATABASE_URL", "sqlite:////private/tmp/safr-visa-stage1-tests.db")
os.environ.setdefault("SERVICE_API_TOKEN", "test-service")
os.environ.setdefault("ADMIN_API_TOKEN", "test-admin")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
import app.models  # noqa: F401,E402
from app.models.admin_action import AdminAction
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaNotificationDelivery, VisaProcess, VisaType
from app.models.visa_lifecycle import CredentialVaultItem, VisaEvent
from app.models.web_portal import WebConversation, WebMessage, WebOutboxEvent
from app.services.visa_lifecycle import (
    PIIConfigurationError,
    PIIEnvelopeCipher,
    claim_deliveries,
    mask_identifier,
    settle_delivery,
    validate_dates,
    VisaLifecycleError,
)
from app.services.document_storage import assess_document_storage
from app.core.config import settings
from app.api import visa_lifecycle as api
from fastapi import Request, Response


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


def enable_protected_storage(monkeypatch, root: Path, *, key_byte: bytes = b"d"):
    root.chmod(0o700)
    key = base64.urlsafe_b64encode(key_byte * 32).decode().rstrip("=")
    monkeypatch.setattr(settings, "VISA_PII_KEYS", '{"v1":"' + key + '"}')
    monkeypatch.setattr(settings, "VISA_PII_KEY_VERSION", "v1")
    monkeypatch.setattr(settings, "VISA_DOCUMENT_STORAGE_ROOT", str(root))
    monkeypatch.setattr(settings, "VISA_DOCUMENT_SCANNER_COMMAND", "/usr/bin/true")
    monkeypatch.setattr(settings, "VISA_DOCUMENT_RETENTION_POLICY", "archive_only")
    monkeypatch.setattr(settings, "VISA_DOCUMENT_KEY_CUSTODY_CONFIRMED", True)
    monkeypatch.setattr(settings, "VISA_DOCUMENT_BACKUP_RESTORE_PROOF_SHA256", "a" * 64)


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


def test_document_storage_readiness_requires_custody_retention_restore_and_supports_rotation(monkeypatch, tmp_path):
    tmp_path.chmod(0o700)
    v1, v2 = b"a" * 32, b"b" * 32
    old = PIIEnvelopeCipher({"v1": v1, "v2": v2}, "v1").encrypt_bytes(b"restore-fixture", context="document:fixture")
    rotated = PIIEnvelopeCipher({"v1": v1, "v2": v2}, "v2")
    assert rotated.decrypt_bytes(old, context="document:fixture") == b"restore-fixture"
    encoded = {"v1": base64.urlsafe_b64encode(v1).decode().rstrip("="), "v2": base64.urlsafe_b64encode(v2).decode().rstrip("=")}
    monkeypatch.setattr(settings, "VISA_PII_KEYS", __import__("json").dumps(encoded))
    monkeypatch.setattr(settings, "VISA_PII_KEY_VERSION", "v2")
    monkeypatch.setattr(settings, "VISA_DOCUMENT_STORAGE_ROOT", str(tmp_path))
    monkeypatch.setattr(settings, "VISA_DOCUMENT_SCANNER_COMMAND", "/usr/bin/true")
    monkeypatch.setattr(settings, "VISA_DOCUMENT_RETENTION_POLICY", "")
    monkeypatch.setattr(settings, "VISA_DOCUMENT_KEY_CUSTODY_CONFIRMED", False)
    monkeypatch.setattr(settings, "VISA_DOCUMENT_BACKUP_RESTORE_PROOF_SHA256", "")
    blocked = assess_document_storage()
    assert blocked.storage_private and blocked.encryption_configured and blocked.scanner_configured
    assert blocked.ready is False and blocked.retention_configured is False and blocked.backup_restore_verified is False
    monkeypatch.setattr(settings, "VISA_DOCUMENT_RETENTION_POLICY", "archive_only")
    monkeypatch.setattr(settings, "VISA_DOCUMENT_KEY_CUSTODY_CONFIRMED", True)
    monkeypatch.setattr(settings, "VISA_DOCUMENT_BACKUP_RESTORE_PROOF_SHA256", hashlib.sha256(old).hexdigest())
    assert assess_document_storage().ready is True


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
    payload = api.VisaCaseUpdate(service_status="DOCUMENTS_REQUIRED", reason="Fixture update", expected_version=1, notify_client=True, idempotency_key="update-fixture-0001")
    first = api.admin_update(case.id, payload, admin)
    second = api.admin_update(case.id, payload, admin)
    check = factory()
    assert first["version"] == second["version"] == 2
    assert check.query(VisaEvent).filter_by(event_type="CASE_UPDATED", idempotency_key="update-fixture-0001").count() == 1
    assert check.query(VisaNotificationDelivery).filter_by(notification_type="CASE_UPDATED").count() == 1
    assert check.query(VisaNotificationDelivery).filter_by(notification_type="CASE_PUBLISHED").count() == 0


def test_aggregate_update_serializes_dates_and_commits_process_once(monkeypatch):
    db = database(); admin, _, case = seed(db)
    case.publication_status = "PUBLISHED"; db.commit()
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    payload = api.VisaAggregateUpdate(
        service_status="DOCUMENTS_REQUIRED", lifecycle_status="ISSUED_NOT_ACTIVATED",
        entry_deadline=date(2026, 9, 12), date_source="Fixture document",
        reason="Aggregate fixture update", expected_version=1, notify_client=True,
        idempotency_key="aggregate-fixture-0001",
        processes=[api.ProcessAggregateItem(process_type="APPLICATION", external_status="PROCESSING")],
    )
    first = api.admin_update_aggregate(case.id, payload, admin)
    second = api.admin_update_aggregate(case.id, payload, admin)
    check = factory()
    assert first["version"] == second["version"] == 2
    assert check.query(VisaProcess).filter_by(visa_case_id=case.id).count() == 1
    event = check.query(VisaEvent).filter_by(idempotency_key="aggregate-fixture-0001").one()
    assert event.after["entry_deadline"] == "2026-09-12"
    assert check.query(VisaNotificationDelivery).filter_by(notification_type="CASE_UPDATED").count() == 1


def test_aggregate_validation_rolls_back_case_and_processes(monkeypatch):
    db = database(); admin, _, case = seed(db)
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    payload = api.VisaAggregateUpdate(
        service_status="PROCESSING", reason="Invalid aggregate fixture", expected_version=1,
        idempotency_key="aggregate-fixture-0002",
        processes=[api.ProcessAggregateItem(process_type="APPLICATION", external_status="INVALID")],
    )
    try: api.admin_update_aggregate(case.id, payload, admin)
    except api.HTTPException as exc: assert exc.status_code == 422
    else: raise AssertionError("invalid aggregate must fail")
    check = factory(); persisted = check.query(VisaCase).filter_by(id=case.id).one()
    assert persisted.service_status == "PURCHASED" and persisted.version == 1
    assert check.query(VisaProcess).count() == 0
    assert check.query(VisaEvent).filter_by(idempotency_key="aggregate-fixture-0002").count() == 0


def test_configured_root_can_select_any_valid_status_and_visibility_is_atomic(monkeypatch):
    db = database(); admin, _, case = seed(db)
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", admin.telegram_id)
    payload = api.VisaAggregateUpdate(
        service_status="COMPLETED", lifecycle_status="EXTENSION_PROCESSING",
        show_to_client=True, reason="Root override fixture", expected_version=1,
        notify_client=False, idempotency_key="root-override-0001",
    )
    result = api.admin_update_aggregate(case.id, payload, admin)
    assert result["service_status"] == "COMPLETED"
    assert result["lifecycle_status"] == "EXTENSION_PROCESSING"
    assert result["publication_status"] == "PUBLISHED"
    check = factory(); event = check.query(VisaEvent).filter_by(idempotency_key="root-override-0001").one()
    assert event.after["root_status_override"] is True
    assert event.after["publication_status"] == "PUBLISHED"


def test_repeated_publish_with_new_key_is_noop(monkeypatch):
    db = database(); admin, _, case = seed(db)
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    api.admin_publication(case.id, "publish", api.PublicationRequest(notify_client=True, reason="First publish", idempotency_key="publish-noop-0001"), admin)
    api.admin_publication(case.id, "publish", api.PublicationRequest(notify_client=True, reason="Repeated publish", idempotency_key="publish-noop-0002"), admin)
    check = factory()
    assert check.query(VisaEvent).filter(VisaEvent.event_type == "CASE_PUBLISHED").count() == 1
    assert check.query(VisaNotificationDelivery).filter_by(notification_type="CASE_PUBLISHED").count() == 1


def test_notify_respects_case_toggle_and_forbidden_transition_rolls_back(monkeypatch):
    db = database(); admin, _, case = seed(db); case.publication_status = "PUBLISHED"; case.notifications_enabled = False; db.commit()
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    payload = api.VisaAggregateUpdate(service_status="DOCUMENTS_REQUIRED", reason="Fixture", expected_version=1, notify_client=True, idempotency_key="notify-disabled-0001")
    try: api.admin_update_aggregate(case.id, payload, admin)
    except api.HTTPException as exc: assert exc.status_code == 422 and "disabled" in exc.detail
    else: raise AssertionError("disabled client notifications must reject notify mode")
    forbidden = api.VisaAggregateUpdate(service_status="COMPLETED", reason="Fixture", expected_version=1, notify_client=False, idempotency_key="transition-forbidden-0001")
    try: api.admin_update_aggregate(case.id, forbidden, admin)
    except api.HTTPException as exc: assert exc.status_code == 422 and "Forbidden" in exc.detail
    else: raise AssertionError("forbidden workflow transition must fail")
    check = factory(); persisted = check.query(VisaCase).filter_by(id=case.id).one()
    assert persisted.service_status == "PURCHASED" and persisted.version == 1
    assert check.query(VisaEvent).filter(VisaEvent.idempotency_key.in_(["notify-disabled-0001", "transition-forbidden-0001"])).count() == 0


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


def test_protected_document_upload_encrypts_is_idempotent_and_downloads(monkeypatch, tmp_path):
    db = database(); admin, client, case = seed(db)
    case.publication_status = "PUBLISHED"; db.commit()
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    enable_protected_storage(monkeypatch, tmp_path)
    body = b"%PDF-1.7\nfixture-only\n"

    def request_for(payload):
        sent = False
        async def receive():
            nonlocal sent
            if sent: return {"type": "http.request", "body": b"", "more_body": False}
            sent = True; return {"type": "http.request", "body": payload, "more_body": False}
        return Request({"type": "http", "method": "POST", "path": "/", "headers": [(b"content-type", b"application/pdf")]}, receive)

    first = asyncio.run(api.admin_document_upload(case.id, request_for(body), "Visa.pdf", "VISA", "CLIENT", "upload-fixture-0001", admin))
    replay = asyncio.run(api.admin_document_upload(case.id, request_for(body), "Visa.pdf", "VISA", "CLIENT", "upload-fixture-0001", admin))
    check = factory(); document = check.query(api.VisaDocument).one()
    stored = (tmp_path / document.storage_key).read_bytes()
    assert first["id"] == replay["id"] == document.id and replay["idempotent_replay"] is True
    assert body not in stored and document.checksum_sha256 == hashlib.sha256(body).hexdigest()
    response = api._document_file(case.id, document.id, client)
    assert response.body == body and response.headers["cache-control"] == "private, no-store"
    assert check.query(VisaEvent).filter_by(event_type="DOCUMENT_UPLOADED").count() == 1


def test_protected_download_content_disposition_is_unicode_and_header_safe():
    cases = (
        ("Виза.pdf", "Виза.pdf"),
        ('quote";\r\nInjected: yes.pdf', "quoteInjected yes.pdf"),
        ("Visa.pdf", "Visa.pdf"),
        ("д" * 180 + ".pdf", "д" * 120),
    )
    for supplied, expected_display in cases:
        header = api._document_content_disposition(supplied)
        Response(headers={"Content-Disposition": header})
        assert all(ord(character) < 128 for character in header)
        assert "\r" not in header and "\n" not in header
        encoded = header.split("filename*=UTF-8''", 1)[1]
        assert unquote(encoded) == expected_display
        assert len(unquote(encoded)) <= 120


def test_protected_document_upload_fails_closed_without_configuration(monkeypatch):
    db = database(); admin, _, case = seed(db)
    enable_stage1(monkeypatch)
    monkeypatch.setattr(settings, "VISA_DOCUMENT_STORAGE_ROOT", "")
    monkeypatch.setattr(settings, "VISA_DOCUMENT_SCANNER_COMMAND", "")
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": [(b"content-type", b"application/pdf")]})
    try: asyncio.run(api.admin_document_upload(case.id, request, "Visa.pdf", "VISA", "CLIENT", "upload-fixture-0002", admin))
    except api.HTTPException as exc: assert exc.status_code == 503
    else: raise AssertionError("missing protected storage configuration must fail closed")


def test_protected_upload_replay_is_case_actor_and_metadata_scoped(monkeypatch, tmp_path):
    db = database(); root, client, case = seed(db)
    manager = User(telegram_id=300, ref_code="manager", role="visa_manager", status="active", locale="ru")
    other_client = User(telegram_id=400, ref_code="other", role="client", status="active", locale="ru")
    db.add_all([manager, other_client]); db.flush()
    other_case = VisaCase(user_id=other_client.id, visa_type_id=case.visa_type_id, assigned_admin_id=manager.id)
    db.add(other_case); db.commit()
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); enable_protected_storage(monkeypatch, tmp_path)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)
    monkeypatch.setattr(settings, "VISA_MANAGER_RBAC_ENABLED", True)
    monkeypatch.setattr(api, "SessionLocal", factory)
    body = b"%PDF-1.7\nfixture-only\n"

    def request_for(payload):
        sent = False
        async def receive():
            nonlocal sent
            if sent: return {"type": "http.request", "body": b"", "more_body": False}
            sent = True; return {"type": "http.request", "body": payload, "more_body": False}
        return Request({"type": "http", "method": "POST", "path": "/", "headers": [(b"content-type", b"application/pdf")]}, receive)

    first = asyncio.run(api.admin_document_upload(case.id, request_for(body), "Visa.pdf", "VISA", "CLIENT", "shared-upload-key", root))
    replay = asyncio.run(api.admin_document_upload(case.id, request_for(body), "Visa.pdf", "VISA", "CLIENT", "shared-upload-key", root))
    assert replay["id"] == first["id"] and replay["idempotent_replay"] is True
    for target_case, actor, name in ((other_case, manager, "Visa.pdf"), (case, root, "Changed.pdf")):
        try: asyncio.run(api.admin_document_upload(target_case.id, request_for(body), name, "VISA", "CLIENT", "shared-upload-key", actor))
        except api.HTTPException as exc: assert exc.status_code == 409 and "another protected upload" in exc.detail
        else: raise AssertionError("cross-case or changed-metadata replay must be rejected")


def test_staff_document_download_is_assignment_scoped_and_audited(monkeypatch, tmp_path):
    db = database(); root, client, case = seed(db)
    manager = User(telegram_id=300, ref_code="manager", role="visa_manager", status="active", locale="ru")
    other_manager = User(telegram_id=400, ref_code="other-manager", role="visa_manager", status="active", locale="ru")
    db.add_all([manager, other_manager]); db.flush(); case.assigned_admin_id = manager.id; case.publication_status = "PUBLISHED"; db.commit()
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); enable_protected_storage(monkeypatch, tmp_path)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)
    monkeypatch.setattr(settings, "VISA_MANAGER_RBAC_ENABLED", True)
    monkeypatch.setattr(api, "SessionLocal", factory)
    body = b"%PDF-1.7\nfixture-only\n"
    sent = False
    async def receive():
        nonlocal sent
        if sent: return {"type": "http.request", "body": b"", "more_body": False}
        sent = True; return {"type": "http.request", "body": body, "more_body": False}
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": [(b"content-type", b"application/pdf")]}, receive)
    created = asyncio.run(api.admin_document_upload(case.id, request, "Visa.pdf", "VISA", "CLIENT", "staff-download-key", manager))
    response = api.admin_document_download(case.id, created["id"], manager)
    assert response.body == body and response.headers["cache-control"] == "private, no-store"
    check = factory(); assert check.query(AdminAction).filter_by(action_type="VISA_DOCUMENT_DOWNLOADED", entity_id=created["id"]).count() == 1
    try: api.admin_document_download(case.id, created["id"], other_manager)
    except api.HTTPException as exc: assert exc.status_code == 404
    else: raise AssertionError("unassigned manager must not download another case document")


def test_archived_client_document_is_neither_projected_nor_downloadable(monkeypatch):
    db = database(); admin, client, case = seed(db); case.publication_status = "PUBLISHED"
    document = api.VisaDocument(user_id=client.id, visa_case_id=case.id, document_type="VISA", display_name="Archived.pdf", storage_key="archived.enc", visibility="CLIENT", archived_at=datetime.now(timezone.utc), uploaded_by_admin_id=admin.id)
    db.add(document); db.commit()
    payload = api._card(db, case, client_view=True)
    assert payload["documents"] == []
    factory = sessionmaker(bind=db.bind, expire_on_commit=False); enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    try: api._document_file(case.id, document.id, client)
    except api.HTTPException as exc: assert exc.status_code == 404
    else: raise AssertionError("archived document must not be downloadable")


def test_raw_storage_key_registration_is_retired(monkeypatch):
    db = database(); admin, _, case = seed(db); enable_stage1(monkeypatch)
    try: api.admin_document(case.id, api.DocumentRequest(document_type="VISA", display_name="Legacy", storage_key="unsafe", visibility="INTERNAL"), admin)
    except api.HTTPException as exc: assert exc.status_code == 410
    else: raise AssertionError("raw storage-key registration must stay retired")


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
        "/api/web/admin/clients/{user_id}/messages",
        "/api/web/admin/visa-cases",
        "/api/web/admin/visa-cases/{case_id}/publication/{action}",
        "/mini-app/visa-cases",
        "/mini-app/visa-cases/{case_id}/documents/{document_id}",
        "/api/web/visa-cases",
        "/api/web/visa-cases/{case_id}/documents/{document_id}",
        "/api/service/visa-lifecycle/users/by-telegram/{telegram_id}/cases",
        "/api/web/staff/conversations/{conversation_id}/client-messages",
    }
    assert required <= paths
    assert not any("tracker" in path or "check-now" in path for path in paths)


def test_migration_aligns_all_new_objects_to_runtime_owner():
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "c4f7a9d2e610_add_visa_lifecycle_stage1.py"
    spec = spec_from_file_location("visa_stage1_migration", path); assert spec and spec.loader
    module = module_from_spec(spec); spec.loader.exec_module(module)
    bind = Mock(); bind.dialect.name = "postgresql"; bind.dialect.identifier_preparer.quote_identifier.return_value = '"safr_bali"'; bind.execute.return_value.scalar_one_or_none.return_value = "safr_bali"
    with patch.object(module.op, "get_bind", return_value=bind), patch.object(module.op, "execute") as execute:
        module._align_runtime_owner()
    statements = [str(call.args[0]) for call in execute.call_args_list]
    assert len(statements) == 20
    assert all('OWNER TO "safr_bali"' in statement for statement in statements)
    assert any('ALTER TABLE "visa_cases"' in statement for statement in statements)
    assert any('ALTER SEQUENCE "credential_vault_items_id_seq"' in statement for statement in statements)


def test_admin_client_message_is_idempotent_and_queued_for_bot(monkeypatch):
    db = database(); admin, client, _case = seed(db)
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    payload = api.ClientDialogueMessageRequest(body="Fixture manager update", idempotency_key="manager-message-0001")
    first = api.admin_client_message(client.id, payload, admin)
    second = api.admin_client_message(client.id, payload, admin)
    check = factory()
    assert first["id"] == second["id"]
    assert first["idempotent_replay"] is False and second["idempotent_replay"] is True
    assert check.query(WebMessage).filter_by(idempotency_key="manager-message-0001").count() == 1
    assert check.query(WebOutboxEvent).filter_by(event_type="web_staff_client_message").count() == 1


def test_admin_client_message_replay_is_client_actor_and_body_bound(monkeypatch):
    db = database(); root, client, case = seed(db)
    other_admin = User(telegram_id=300, ref_code="manager", role="visa_manager", status="active", locale="ru")
    other_client = User(telegram_id=400, ref_code="other-client", role="client", status="active", locale="ru")
    db.add_all([other_admin, other_client]); db.flush()
    other_case = VisaCase(user_id=other_client.id, visa_type_id=case.visa_type_id, assigned_admin_id=other_admin.id)
    shared_client_case = VisaCase(user_id=client.id, visa_type_id=case.visa_type_id, assigned_admin_id=other_admin.id)
    db.add_all([other_case, shared_client_case]); db.commit()
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)
    monkeypatch.setattr(settings, "VISA_MANAGER_RBAC_ENABLED", True)
    key = "manager-message-bound-01"
    original = api.ClientDialogueMessageRequest(body="Line one\r\n\r\nLine two", idempotency_key=key)
    first = api.admin_client_message(client.id, original, root)
    replay = api.admin_client_message(client.id, api.ClientDialogueMessageRequest(body="Line one\n\nLine two", idempotency_key=key), root)
    assert first["id"] == replay["id"] and replay["idempotent_replay"] is True
    for target_id, actor, body in (
        (client.id, root, "Changed body"),
        (other_client.id, other_admin, "Line one\n\nLine two"),
        (client.id, other_admin, "Line one\n\nLine two"),
    ):
        try:
            api.admin_client_message(target_id, api.ClientDialogueMessageRequest(body=body, idempotency_key=key), actor)
        except api.HTTPException as error:
            assert error.status_code in (404, 409)
        else:
            raise AssertionError("message replay must be bound to client, actor, and normalized body")


def test_failed_admin_message_retry_reuses_one_outbox_event_idempotently(monkeypatch):
    db = database(); admin, client, _case = seed(db)
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    created = api.admin_client_message(client.id, api.ClientDialogueMessageRequest(body="Fixture", idempotency_key="manager-message-retry-01"), admin)
    event = db.query(WebOutboxEvent).one(); event.status = "failed"; event.attempts = 1; db.commit()
    first = api.retry_admin_client_message(client.id, created["id"], admin)
    second = api.retry_admin_client_message(client.id, created["id"], admin)
    check = factory(); events = check.query(WebOutboxEvent).all()
    assert first == {"message_id": created["id"], "status": "pending", "idempotent_replay": False}
    assert second["idempotent_replay"] is True
    assert len(events) == 1 and events[0].id == event.id and events[0].status == "pending"


def test_client_detail_exposes_protected_dialogue_history(monkeypatch):
    db = database(); admin, client, _case = seed(db)
    conversation = WebConversation(user_id=client.id, source="admin", route_context={"section": "visa"})
    db.add(conversation); db.flush()
    db.add_all([
        WebMessage(conversation_id=conversation.id, author_type="staff", body="Visible update", visibility="client"),
        WebMessage(conversation_id=conversation.id, author_type="staff", body="Internal note", visibility="internal"),
    ]); db.commit()
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", lambda: db)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", admin.telegram_id)
    detail = api.admin_client_detail(client.id, admin)
    assert [item["visibility"] for item in detail["dialogue"]["messages"]] == ["client", "internal"]


def test_visa_manager_dialogue_is_case_scoped_and_excludes_unrelated_conversations(monkeypatch):
    db = database(); root, client, case = seed(db)
    manager = User(telegram_id=300, ref_code="manager", role="visa_manager", status="active", locale="ru")
    db.add(manager); db.flush(); case.assigned_admin_id = manager.id
    support = WebConversation(user_id=client.id, source="website", route_context={"section": "support"}, updated_at=datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc))
    visa = WebConversation(user_id=client.id, source="admin", route_context={"section": "visa", "visa_case_id": case.id}, updated_at=datetime(2026, 8, 25, 11, 0, tzinfo=timezone.utc))
    db.add_all([support, visa]); db.flush()
    db.add_all([
        WebMessage(conversation_id=support.id, author_type="client", body="Private housing question", visibility="client"),
        WebMessage(conversation_id=visa.id, author_type="client", body="Visa reply", visibility="client"),
        WebMessage(conversation_id=visa.id, author_type="staff", body="Root internal note", visibility="internal"),
    ]); db.commit()
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch); monkeypatch.setattr(api, "SessionLocal", factory)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)
    monkeypatch.setattr(settings, "VISA_MANAGER_RBAC_ENABLED", True)
    manager_detail = api.admin_client_detail(client.id, manager)
    assert manager_detail["dialogue"]["id"] == visa.id
    assert [item["body"] for item in manager_detail["dialogue"]["messages"]] == ["Visa reply"]
    root_detail = api.admin_client_detail(client.id, root)
    assert root_detail["dialogue"]["id"] == support.id


def test_successor_migration_contains_only_canonical_bot_visa_codes():
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "d5e8b0c3f721_expand_visa_types_and_dialogue_delivery.py"
    spec = spec_from_file_location("visa_stage2_migration", path); assert spec and spec.loader
    module = module_from_spec(spec); spec.loader.exec_module(module)
    assert {code for code, _name in module.CANONICAL_TYPES} == {"E33G", "D12", "D1/D2", "C1", "VOA"}


def test_successor_migration_explicitly_types_reused_postgres_parameters():
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "d5e8b0c3f721_expand_visa_types_and_dialogue_delivery.py"
    source = path.read_text(encoding="utf-8")
    # psycopg otherwise infers the repeated :code placeholder as both text and
    # varchar in INSERT ... SELECT ... WHERE NOT EXISTS and rejects the query.
    assert source.count("CAST(:code AS VARCHAR(32))") >= 3
    assert "CAST(:name AS VARCHAR(160))" in source
