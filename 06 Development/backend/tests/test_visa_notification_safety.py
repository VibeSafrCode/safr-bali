from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api import visa_lifecycle as api
from app.core.config import settings
from app.db.base import Base
from app.models.admin_action import AdminAction
from app.models.admin_safety import StaffGrant
from app.models.user import User
from app.models.visa_lifecycle import (
    VisaCase,
    VisaCaseAssignment,
    VisaDocument,
    VisaEvent,
    VisaNotificationDelivery,
    VisaType,
)
from app.services.visa_lifecycle import (
    VisaLifecycleError,
    claim_deliveries,
    settle_delivery,
)
from app.services.visa_notifications import frozen_event_client_payload


def database():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def seed(db):
    root = User(
        telegram_id=700, ref_code="notification-root", first_name="Root",
        role="admin", status="active", locale="ru",
    )
    manager = User(
        telegram_id=701, ref_code="notification-manager", first_name="Manager",
        role="client", status="active", locale="en",
    )
    client = User(
        telegram_id=702, ref_code="notification-client", first_name="Client",
        role="client", status="active", locale="en",
    )
    visa_type = VisaType(country_code="ID", code="E33G", name="Remote worker visa", version=1)
    db.add_all([root, manager, client, visa_type]); db.flush()
    case = VisaCase(
        user_id=client.id, visa_type_id=visa_type.id, assigned_admin_id=root.id,
        publication_status="PUBLISHED", notifications_enabled=True,
        service_status="PROCESSING", lifecycle_status="ISSUED_NOT_ACTIVATED",
    )
    db.add(case); db.flush()
    db.add(VisaCaseAssignment(
        visa_case_id=case.id, staff_user_id=root.id,
        assigned_by_admin_id=root.id, assignment_reason="fixture",
        assignment_idempotency_key="notification-root-assignment",
    ))
    db.commit()
    return root, manager, client, case


def configure(monkeypatch, db, root):
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    monkeypatch.setattr(api, "SessionLocal", factory)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)
    monkeypatch.setattr(settings, "VISA_LIFECYCLE_ENABLED", True)
    monkeypatch.setattr(settings, "CLIENT_CABINET_ENABLED", True)
    monkeypatch.setattr(settings, "ADMIN_CLIENT_CRM_ENABLED", True)
    monkeypatch.setattr(settings, "VISA_MANAGER_RBAC_ENABLED", True)
    return factory


def delivery(db, case, *, key: str, state: str = "PENDING", error: str | None = None):
    row = VisaNotificationDelivery(
        visa_case_id=case.id, recipient_user_id=case.user_id,
        recipient_kind="client", locale="en", notification_type="CASE_UPDATED",
        payload={"fixture": True}, dedupe_key=key,
        due_at=datetime.now(timezone.utc), state=state,
        last_error_code=error,
    )
    db.add(row); db.commit()
    return row


def test_expired_claim_becomes_unknown_and_is_never_reclaimed(monkeypatch):
    db = database(); root, _manager, _client, case = seed(db)
    configure(monkeypatch, db, root)
    start = datetime(2026, 8, 28, 6, 0, tzinfo=timezone.utc)
    row = delivery(db, case, key="ambiguous-claim")
    row.due_at = start; db.commit()
    claimed = claim_deliveries(db, now=start)
    assert len(claimed) == 1
    old_lease = claimed[0].lease_token
    assert claim_deliveries(db, now=start + timedelta(minutes=6)) == []
    db.expire_all()
    persisted = db.get(VisaNotificationDelivery, row.id)
    assert persisted.state == "UNKNOWN"
    assert persisted.attempts == 1
    assert persisted.lease_token is None and persisted.lease_expires_at is None
    assert persisted.last_error_code == "ambiguous_delivery_outcome"
    assert claim_deliveries(db, now=start + timedelta(days=1)) == []
    try:
        settle_delivery(db, row.id, old_lease, state="DELIVERED")
    except VisaLifecycleError as error:
        assert "stale" in str(error)
    else:
        raise AssertionError("ambiguous delivery must reject the stale settlement")


def test_claim_normalizes_legacy_contact_audience_and_fails_closed(monkeypatch):
    db = database(); root, manager, client, case = seed(db)
    factory = configure(monkeypatch, db, root)
    due = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.add_all([
        VisaNotificationDelivery(
            visa_case_id=case.id, recipient_user_id=client.id,
            recipient_kind="CLIENT", locale="en",
            notification_type="CONTACT_REMINDER",
            payload={
                "visa_display_name": "Remote worker visa · E33G",
                "reason_code": "VISA_EXPIRY", "date_value": "2026-09-20",
                "case_id": case.id, "internal_note": "MUST NOT CROSS CLAIM",
            },
            dedupe_key="legacy-client-contract", due_at=due,
        ),
        VisaNotificationDelivery(
            visa_case_id=case.id, recipient_user_id=manager.id,
            recipient_kind="staff", locale="en",
            notification_type="CONTACT_REMINDER",
            payload={
                "visa_display_name": "Remote worker visa · E33G",
                "client_display_name": "Client", "reason_code": "VISA_EXPIRY",
                "date_value": "2026-09-20", "client_user_id": client.id,
                "internal_note": "MUST NOT CROSS CLAIM",
            },
            dedupe_key="legacy-staff-contract", due_at=due,
        ),
        VisaNotificationDelivery(
            visa_case_id=case.id, recipient_user_id=manager.id,
            recipient_kind="manager", locale="en",
            notification_type="CONTACT_REMINDER",
            payload={"reason_code": "VISA_EXPIRY"},
            dedupe_key="ambiguous-recipient-contract", due_at=due,
        ),
        VisaNotificationDelivery(
            visa_case_id=case.id, recipient_user_id=manager.id,
            recipient_kind="staff", locale="en",
            notification_type="CONTACT_REMINDER_CLIENT",
            payload={"reason_code": "VISA_EXPIRY"},
            dedupe_key="mismatched-recipient-contract", due_at=due,
        ),
    ])
    db.commit()

    response = api.service_claim(50)
    assert {(item["recipient_kind"], item["notification_type"]) for item in response["items"]} == {
        ("client", "CONTACT_REMINDER_CLIENT"),
        ("staff", "CONTACT_REMINDER_STAFF"),
    }
    assert all("internal_note" not in str(item["payload"]) for item in response["items"])
    assert all("case_id" not in item["payload"] for item in response["items"])
    staff_item = next(item for item in response["items"] if item["recipient_kind"] == "staff")
    assert staff_item["payload"]["can_open_case"] is False
    assert staff_item["payload"]["staff_role_code"] == "legacy_staff"
    check = factory()
    assert check.query(VisaNotificationDelivery).filter(
        VisaNotificationDelivery.dedupe_key.in_((
            "ambiguous-recipient-contract", "mismatched-recipient-contract",
        )),
        VisaNotificationDelivery.state == "SUPPRESSED",
    ).count() == 2


def test_failed_pre_send_retry_is_root_audited_idempotent_and_consent_bound(monkeypatch):
    db = database(); root, _manager, _client, case = seed(db)
    factory = configure(monkeypatch, db, root)
    retryable = delivery(
        db, case, key="retryable-pre-send", state="FAILED",
        error="timeout_before_send",
    )
    payload = api.VisaDeliveryRetryRequest(
        confirm_delivery_id=retryable.id,
        reason="Operator verified no send occurred",
        idempotency_key="delivery-retry-safe-0001",
    )
    first = api.admin_retry_visa_delivery(case.id, retryable.id, payload, root)
    replay = api.admin_retry_visa_delivery(case.id, retryable.id, payload, root)
    assert first["state"] == replay["state"] == "PENDING"
    assert first["idempotent_replay"] is False and replay["idempotent_replay"] is True
    check = factory()
    assert check.query(AdminAction).filter_by(
        idempotency_key="delivery-retry-safe-0001",
    ).count() == 1
    assert check.get(VisaNotificationDelivery, retryable.id).attempts == 0

    unknown = delivery(db, case, key="unknown-no-retry", state="UNKNOWN")
    try:
        api.admin_retry_visa_delivery(case.id, unknown.id, api.VisaDeliveryRetryRequest(
            confirm_delivery_id=unknown.id, reason="Blind retry forbidden",
            idempotency_key="delivery-retry-unknown-1",
        ), root)
    except HTTPException as error:
        assert error.status_code == 409 and "human review" in error.detail
    else:
        raise AssertionError("UNKNOWN must remain human-review-only")

    non_retryable = delivery(
        db, case, key="failed-not-pre-send", state="FAILED", error="bot_blocked",
    )
    try:
        api.admin_retry_visa_delivery(case.id, non_retryable.id, api.VisaDeliveryRetryRequest(
            confirm_delivery_id=non_retryable.id, reason="Unsafe retry",
            idempotency_key="delivery-retry-blocked-1",
        ), root)
    except HTTPException as error:
        assert error.status_code == 409 and "not confirmed" in error.detail
    else:
        raise AssertionError("non-pre-send failure must reject retry")

    consent_blocked = delivery(
        db, case, key="retry-consent-disabled", state="FAILED",
        error="network_error_before_send",
    )
    case.notifications_enabled = False
    db.commit()
    try:
        api.admin_retry_visa_delivery(case.id, consent_blocked.id, api.VisaDeliveryRetryRequest(
            confirm_delivery_id=consent_blocked.id,
            reason="Consent must remain authoritative",
            idempotency_key="delivery-retry-consent-1",
        ), root)
    except HTTPException as error:
        assert error.status_code == 409 and "consent" in error.detail
    else:
        raise AssertionError("manual retry must respect current client consent")


def test_notification_action_reasons_reject_whitespace_before_mutation():
    for model, values in (
        (api.VisaDeliveryRetryRequest, {
            "confirm_delivery_id": 1, "reason": " \t \n ",
            "idempotency_key": "reason-retry-01",
        }),
        (api.VisaManualStatusSummaryRequest, {
            "confirm_case_id": 1, "expected_version": 1, "reason": "   ",
            "idempotency_key": "reason-summary-01",
        }),
    ):
        try:
            model(**values)
        except ValidationError as error:
            assert "meaningful" in str(error)
        else:
            raise AssertionError(f"{model.__name__} accepted a whitespace-only reason")


def test_consent_and_visibility_mutations_suppress_pending_before_claim(monkeypatch):
    db = database(); root, _manager, client, case = seed(db)
    factory = configure(monkeypatch, db, root)
    due = datetime.now(timezone.utc) - timedelta(seconds=1)
    pending = delivery(db, case, key="pending-before-consent-off")
    pending.due_at = due; db.commit()
    api._notifications(case.id, False, client, "account")
    assert factory().get(VisaNotificationDelivery, pending.id).state == "SUPPRESSED"
    assert claim_deliveries(factory(), now=datetime.now(timezone.utc)) == []

    mutation_db = factory()
    mutable = mutation_db.get(VisaCase, case.id)
    mutable.notifications_enabled = True
    hidden_pending = VisaNotificationDelivery(
        visa_case_id=case.id, recipient_user_id=client.id,
        recipient_kind="client", locale="en", notification_type="CASE_UPDATED",
        payload={"visa_display_name": "Remote worker visa · E33G"},
        dedupe_key="pending-before-hide", due_at=due,
    )
    ambiguous = VisaNotificationDelivery(
        visa_case_id=case.id, recipient_user_id=client.id,
        recipient_kind="client", locale="en", notification_type="CASE_UPDATED",
        payload={"visa_display_name": "Remote worker visa · E33G"},
        dedupe_key="claimed-before-hide", due_at=due, state="CLAIMED",
        lease_token="ambiguous-lease", lease_expires_at=due,
    )
    mutation_db.add_all([hidden_pending, ambiguous])
    mutation_db.commit()
    api.admin_publication(case.id, "hide", api.PublicationRequest(
        notify_client=False, reason="Hide from client",
        idempotency_key="hide-suppresses-pending-1",
    ), root)
    check = factory()
    assert check.query(VisaNotificationDelivery).filter_by(
        dedupe_key="pending-before-hide",
    ).one().state == "SUPPRESSED"
    assert check.query(VisaNotificationDelivery).filter_by(
        dedupe_key="claimed-before-hide",
    ).one().state == "CLAIMED"
    assert claim_deliveries(check, now=datetime.now(timezone.utc)) == []
    assert check.query(VisaNotificationDelivery).filter_by(
        dedupe_key="claimed-before-hide",
    ).one().state == "UNKNOWN"


def test_case_updated_payload_is_frozen_allowlisted_event_diff(monkeypatch):
    db = database(); root, _manager, _client, case = seed(db)
    factory = configure(monkeypatch, db, root)
    result = api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(
        service_status="COMPLETED",
        lifecycle_status="ACTIVE",
        entry_deadline=date(2026, 9, 30),
        date_source="Verified fixture",
        recommended_contact_at=datetime(2026, 9, 20, tzinfo=timezone.utc),
        contact_reason_code="VISA_EXPIRY",
        contact_internal_note="INTERNAL NOTE MUST NEVER LEAK",
        expected_version=1,
        reason="Frozen notification fixture",
        notify_client=True,
        idempotency_key="frozen-update-payload-1",
        processes=[api.ProcessAggregateItem(
            process_type="APPLICATION", external_status="PROCESSING",
        )],
    ), root)
    assert result["version"] == 2
    check = factory()
    event = check.query(VisaEvent).filter_by(idempotency_key="frozen-update-payload-1").one()
    row = check.query(VisaNotificationDelivery).filter_by(notification_type="CASE_UPDATED").one()
    assert row.visa_event_id == event.id
    assert row.payload["visa_display_name"] == "Remote worker visa · E33G"
    assert row.payload["lifecycle_status"] == "ACTIVE"
    assert row.payload["status"] == "ACTIVE"
    assert row.payload["date_kind"] == "entry_deadline"
    assert row.payload["date_value"] == "2026-09-30"
    assert row.payload["current"]["entry_deadline"] == "2026-09-30"
    fields = {item["field"] for item in row.payload["changes"]}
    assert {"service_status", "lifecycle_status", "entry_deadline", "process_status"} <= fields
    serialized = str(row.payload)
    assert "INTERNAL NOTE" not in serialized
    assert "contact_internal_note" not in serialized
    assert "case_id" not in serialized and "document_id" not in serialized
    assert all("id" not in item for item in row.payload["changes"])
    api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(
        service_status="COMPLETED", lifecycle_status="ACTIVE",
        entry_deadline=date(2026, 9, 30), date_source="Verified fixture",
        recommended_contact_at=datetime(2026, 9, 20, tzinfo=timezone.utc),
        contact_reason_code="VISA_EXPIRY",
        contact_internal_note="INTERNAL NOTE MUST NEVER LEAK",
        expected_version=1, reason="Frozen notification fixture",
        notify_client=True, idempotency_key="frozen-update-payload-1",
        processes=[api.ProcessAggregateItem(
            process_type="APPLICATION", external_status="PROCESSING",
        )],
    ), root)
    assert check.query(VisaNotificationDelivery).filter_by(notification_type="CASE_UPDATED").count() == 1


def test_published_and_document_payloads_are_frozen_without_internal_ids(monkeypatch):
    db = database(); root, _manager, client, case = seed(db)
    factory = configure(monkeypatch, db, root)
    case.publication_status = "HIDDEN"
    db.commit()
    api.admin_publication(case.id, "publish", api.PublicationRequest(
        notify_client=True, reason="Publish frozen payload",
        idempotency_key="frozen-published-payload-1",
    ), root)
    check = factory()
    published = check.query(VisaNotificationDelivery).filter_by(
        notification_type="CASE_PUBLISHED",
    ).one()
    assert published.payload["notification_type"] == "CASE_PUBLISHED"
    assert published.payload["current"]["service_status"] == "PROCESSING"
    assert "case_id" not in str(published.payload)

    document = VisaDocument(
        user_id=client.id, visa_case_id=case.id, document_type="VISA",
        display_name="Client visa.pdf", storage_key="protected/internal-key",
        checksum_sha256="f" * 64, visibility="CLIENT",
        uploaded_by_admin_id=root.id,
    )
    check.add(document); check.flush()
    event = VisaEvent(
        visa_case_id=case.id, actor_user_id=root.id,
        event_type="DOCUMENT_UPLOADED", source="admin",
        after={
            "document_id": document.id, "visibility": "CLIENT",
            "checksum_sha256": document.checksum_sha256,
        },
    )
    check.add(event); check.flush()
    payload = frozen_event_client_payload(
        check, case=case, event=event, notification_type="CASE_UPDATED",
    )
    document_change = next(item for item in payload["changes"] if item["field"] == "document")
    assert document_change == {
        "field": "document", "action": "DOCUMENT_UPLOADED",
        "name": "Client visa.pdf", "document_type": "VISA",
    }
    serialized = str(payload)
    assert "document_id" not in serialized
    assert "protected/internal-key" not in serialized
    assert document.checksum_sha256 not in serialized


def test_history_manual_summary_and_catalogue_are_safe_and_scoped(monkeypatch):
    db = database(); root, manager, client, case = seed(db)
    factory = configure(monkeypatch, db, root)
    manager_grant = StaffGrant(
            user_id=manager.id, role_code="visa_manager",
            granted_by_admin_id=root.id, grant_reason="fixture",
            grant_idempotency_key="history-manager-grant",
        )
    db.add(manager_grant); db.flush()
    db.add(
        VisaCaseAssignment(
            visa_case_id=case.id, staff_user_id=manager.id,
            staff_grant_id=manager_grant.id,
            assigned_by_admin_id=root.id, assignment_reason="fixture",
            assignment_idempotency_key="history-manager-assignment",
        )
    )
    failed = VisaNotificationDelivery(
        visa_case_id=case.id, recipient_user_id=client.id,
        recipient_kind="client", locale="en", notification_type="CASE_UPDATED",
        payload={"secret_raw": "must-not-return"}, dedupe_key="history-safe-row",
        due_at=datetime.now(timezone.utc), state="FAILED",
        last_error_code="secret-transport-detail",
    )
    db.add(failed); db.commit()

    history = api.admin_notification_history(case.id, 1, 50, manager)
    assert history["total"] == 1
    rendered = str(history)
    assert "secret_raw" not in rendered
    assert "secret-transport-detail" not in rendered
    assert str(client.telegram_id) not in rendered
    assert history["items"][0]["audience_label"] == "Client"

    persist_session = factory()
    persisted = persist_session.get(VisaCase, case.id)
    persisted.stay_end = date(2026, 9, 20)
    persist_session.commit()
    before_version = case.version
    summary_payload = api.VisaManualStatusSummaryRequest(
        confirm_case_id=case.id, expected_version=before_version,
        reason="Client requested current summary",
        idempotency_key="manual-status-summary-01",
    )
    first = api.admin_manual_status_summary(case.id, summary_payload, root)
    replay = api.admin_manual_status_summary(case.id, summary_payload, root)
    assert first["idempotent_replay"] is False and replay["idempotent_replay"] is True
    check = factory()
    summary = check.query(VisaNotificationDelivery).filter_by(
        notification_type="STATUS_SUMMARY_MANUAL",
    ).one()
    assert summary.payload["visa_display_name"] == "Remote worker visa · E33G"
    assert summary.payload["lifecycle_status"] == "ISSUED_NOT_ACTIVATED"
    assert summary.payload["status"] == "ISSUED_NOT_ACTIVATED"
    assert summary.payload["date_kind"] == "stay_end"
    assert summary.payload["date_value"] == "2026-09-20"
    assert "case_id" not in str(summary.payload)
    claimed_summary = api.service_claim(50)["items"]
    assert len(claimed_summary) == 1
    assert claimed_summary[0]["notification_type"] == "STATUS_SUMMARY_MANUAL"
    assert claimed_summary[0]["recipient_kind"] == "client"
    assert claimed_summary[0]["payload"]["visa_display_name"] == "Remote worker visa · E33G"
    assert claimed_summary[0]["payload"]["date_value"] == "2026-09-20"
    assert check.get(VisaCase, case.id).version == before_version
    assert check.query(VisaEvent).filter_by(event_type="MANUAL_STATUS_SUMMARY").count() == 0
    try:
        api.admin_manual_status_summary(case.id, api.VisaManualStatusSummaryRequest(
            confirm_case_id=case.id, expected_version=before_version,
            reason="Duplicate in flight summary",
            idempotency_key="manual-status-summary-02",
        ), root)
    except HTTPException as error:
        assert error.status_code == 409 and "already pending" in error.detail
    else:
        raise AssertionError("manual summary must be single-flight")

    summary.state = "DELIVERED"
    summary.delivered_at = datetime.now(timezone.utc)
    persisted_case = check.get(VisaCase, case.id)
    persisted_case.notifications_enabled = False
    check.commit()
    try:
        api.admin_manual_status_summary(case.id, api.VisaManualStatusSummaryRequest(
            confirm_case_id=case.id, expected_version=before_version,
            reason="Consent disabled fixture",
            idempotency_key="manual-status-summary-03",
        ), root)
    except HTTPException as error:
        assert error.status_code == 409 and "disabled" in error.detail
    else:
        raise AssertionError("manual summary must respect current client consent")
    persisted_case.notifications_enabled = True
    persisted_case.publication_status = "HIDDEN"
    check.commit()
    try:
        api.admin_manual_status_summary(case.id, api.VisaManualStatusSummaryRequest(
            confirm_case_id=case.id, expected_version=before_version,
            reason="Hidden case fixture",
            idempotency_key="manual-status-summary-04",
        ), root)
    except HTTPException as error:
        assert error.status_code == 409 and "published" in error.detail
    else:
        raise AssertionError("manual summary must require a currently published case")

    catalogue = api.admin_notification_catalogue(root)
    assert {item["code"] for item in catalogue["items"]} == {
        "CASE_PUBLISHED", "CASE_UPDATED", "STATUS_SUMMARY_MANUAL",
        "CONTACT_REMINDER_CLIENT", "CONTACT_REMINDER_STAFF",
    }
    assert all(item["channel"] == "telegram" for item in catalogue["items"])
    assert all(set(item["preview"]) == {"ru", "en"} for item in catalogue["items"])
