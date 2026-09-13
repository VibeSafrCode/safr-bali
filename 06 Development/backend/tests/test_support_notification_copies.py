from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api import visa_lifecycle as api
from app.core.config import settings
from app.db.base import Base
from app.models.admin_safety import StaffGrant
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaCaseAssignment, VisaNotificationDelivery, VisaType
from app.models.web_portal import WebConversation, WebMessage, WebOutboxEvent
from app.services.support_recipients import active_support_users
from app.services.visa_contact_reminders import materialize_contact_reminders
from app.services.visa_lifecycle import claim_deliveries, enqueue_delivery, settle_delivery


@pytest.fixture
def support_case(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, expire_on_commit=False)()
    root = User(telegram_id=710, ref_code="support-root", first_name="Root", role="admin", status="active", locale="ru")
    support = User(telegram_id=711, ref_code="support-observer", first_name="Support", role="client", status="active", locale="ru")
    client = User(telegram_id=712, ref_code="support-client", first_name="Fixture Client", role="client", status="active", locale="en")
    visa_type = VisaType(country_code="ID", code="B1", name="Fixture visa", version=1)
    db.add_all([root, support, client, visa_type])
    db.flush()
    case = VisaCase(user_id=client.id, visa_type_id=visa_type.id, assigned_admin_id=root.id,
                    publication_status="PUBLISHED", notifications_enabled=True, lifecycle_status="ACTIVE")
    db.add(case)
    db.commit()
    monkeypatch.setattr(settings, "SUPPORT_CHAT_IDS", f"{support.telegram_id},{support.telegram_id}")
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)
    try:
        yield SimpleNamespace(db=db, root=root, support=support, client=client, case=case,
                              due=datetime(2026, 9, 13, 6, 0, tzinfo=timezone.utc))
    finally:
        db.close()
        engine.dispose()


def enqueue(fixture, *, key="support-copy-fixture", kind="CASE_UPDATED", state="PENDING"):
    return enqueue_delivery(
        fixture.db, visa_case_id=fixture.case.id, visa_event_id=None,
        recipient_user_id=fixture.client.id, recipient_kind="client", locale="en",
        notification_type=kind, payload={"visa_display_name": "Fixture visa", "changes": []},
        dedupe_key=key, due_at=fixture.due, state=state,
    )


@pytest.mark.parametrize("kind", ["CASE_PUBLISHED", "CASE_UPDATED", "STATUS_SUMMARY_MANUAL"])
def test_client_and_support_enqueue_once_without_granting_access(support_case, kind):
    f = support_case
    source = enqueue(f, kind=kind)
    replay = enqueue(f, kind=kind)
    f.db.commit()
    rows = f.db.query(VisaNotificationDelivery).all()
    assert replay.id == source.id
    assert len(rows) == 2
    copied = next(row for row in rows if row.recipient_user_id == f.support.id)
    assert copied.id != source.id and copied.dedupe_key != source.dedupe_key
    assert copied.recipient_kind == "staff" and copied.notification_type == kind
    assert copied.payload["support_copy"] is True
    assert copied.payload["client_display_name"] == "Fixture Client"
    assert "support_copy" not in source.payload
    assert f.support.role == "client"
    assert f.db.query(StaffGrant).count() == 0
    assert f.db.query(VisaCaseAssignment).count() == 0


def test_support_unknown_outcome_cannot_replay_delivered_client(support_case):
    f = support_case
    source = enqueue(f)
    claimed = {row.recipient_user_id: row for row in claim_deliveries(f.db, now=f.due)}
    assert set(claimed) == {f.client.id, f.support.id}
    client_claim = claimed[f.client.id]
    copy_claim = claimed[f.support.id]
    settle_delivery(f.db, client_claim.id, client_claim.lease_token,
                    state="DELIVERED", telegram_message_id="fixture-client-message")
    settle_delivery(f.db, copy_claim.id, copy_claim.lease_token,
                    state="UNKNOWN", error_code="AMBIGUOUS_SEND")
    assert f.db.get(VisaNotificationDelivery, source.id).state == "DELIVERED"
    assert f.db.get(VisaNotificationDelivery, copy_claim.id).state == "UNKNOWN"
    assert claim_deliveries(f.db, now=f.due + timedelta(days=1)) == []
    assert enqueue(f).id == source.id
    assert f.db.query(VisaNotificationDelivery).count() == 2
    assert all(row.attempts == 1 for row in f.db.query(VisaNotificationDelivery).all())


@pytest.mark.parametrize("removal", ["configuration", "inactive"])
def test_support_removal_before_claim_suppresses_only_copy(support_case, monkeypatch, removal):
    f = support_case
    enqueue(f)
    f.db.commit()
    if removal == "configuration":
        monkeypatch.setattr(settings, "SUPPORT_CHAT_IDS", "")
    else:
        f.support.status = "blocked"
        f.db.commit()
    claims = claim_deliveries(f.db, now=f.due)
    assert [row.recipient_user_id for row in claims] == [f.client.id]
    copied = f.db.query(VisaNotificationDelivery).filter_by(recipient_user_id=f.support.id).one()
    assert copied.state == "SUPPRESSED" and copied.attempts == 0
    assert copied.last_error_code == "support_recipient_removed"


def test_missing_or_inactive_support_is_not_enqueued(support_case, monkeypatch):
    f = support_case
    f.support.status = "blocked"
    f.db.commit()
    monkeypatch.setattr(settings, "SUPPORT_CHAT_IDS", f"{f.support.telegram_id},799")
    assert active_support_users(f.db) == []
    enqueue(f)
    assert f.db.query(VisaNotificationDelivery).count() == 1


def test_client_who_is_support_receives_no_copy_of_own_notification(support_case, monkeypatch):
    f = support_case
    monkeypatch.setattr(settings, "SUPPORT_CHAT_IDS", f"{f.client.telegram_id},{f.support.telegram_id},{f.client.telegram_id}")
    enqueue(f)
    rows = f.db.query(VisaNotificationDelivery).all()
    assert len(rows) == 2
    assert sum(row.recipient_user_id == f.client.id for row in rows) == 1
    assert sum(row.recipient_user_id == f.support.id for row in rows) == 1


@pytest.mark.parametrize("historical_state", ["PENDING", "DELIVERED", "UNKNOWN"])
def test_replaying_existing_event_never_backfills_new_support(support_case, monkeypatch, historical_state):
    f = support_case
    monkeypatch.setattr(settings, "SUPPORT_CHAT_IDS", "")
    original = enqueue(f, state=historical_state)
    f.db.commit()
    monkeypatch.setattr(settings, "SUPPORT_CHAT_IDS", str(f.support.telegram_id))
    assert enqueue(f, state=historical_state).id == original.id
    assert f.db.query(VisaNotificationDelivery).count() == 1
    enqueue(f, key="future-event")
    assert f.db.query(VisaNotificationDelivery).count() == 3


def test_suppressed_client_notification_does_not_generate_support_copy(support_case):
    f = support_case
    enqueue(f, state="SUPPRESSED")
    assert f.db.query(VisaNotificationDelivery).count() == 1


def test_due_reminders_deduplicate_root_and_support_without_case_access(support_case, monkeypatch):
    f = support_case
    monkeypatch.setattr(settings, "SUPPORT_CHAT_IDS", f"{f.root.telegram_id},{f.support.telegram_id},{f.support.telegram_id}")
    f.case.recommended_contact_at = f.due
    f.case.contact_reason_code = "EXTENSION"
    f.case.contact_plan_version = 1
    f.case.contact_internal_note = "Private internal fixture; must not be copied"
    f.case.notifications_enabled = False
    f.db.commit()
    materialize_contact_reminders(f.db, now=f.due)
    repeated = materialize_contact_reminders(f.db, now=f.due)
    assert repeated.created == 0
    rows = f.db.query(VisaNotificationDelivery).all()
    assert len(rows) == 3
    staff = {row.recipient_user_id: row for row in rows if row.recipient_kind == "staff"}
    assert set(staff) == {f.root.id, f.support.id}
    assert staff[f.support.id].payload["staff_role_code"] == "support"
    assert staff[f.support.id].payload["can_open_case"] is False
    assert staff[f.root.id].payload["staff_role_code"] == "root_admin"
    assert all("internal_note" not in str(row.payload) for row in staff.values())
    claims = {row.recipient_user_id: row for row in claim_deliveries(f.db, now=f.due)}
    assert set(claims) == {f.root.id, f.support.id}
    assert claims[f.support.id].payload["can_open_case"] is False
    assert f.db.query(StaffGrant).count() == 0
    assert f.db.query(VisaCaseAssignment).count() == 0


def test_support_gets_no_second_reminder_for_own_client_case(support_case, monkeypatch):
    f = support_case
    monkeypatch.setattr(settings, "SUPPORT_CHAT_IDS", str(f.client.telegram_id))
    f.case.recommended_contact_at = f.due
    f.case.contact_reason_code = "EXTENSION"
    f.case.contact_plan_version = 1
    f.db.commit()
    materialize_contact_reminders(f.db, now=f.due)
    rows = f.db.query(VisaNotificationDelivery).filter_by(recipient_user_id=f.client.id).all()
    assert len(rows) == 1
    assert rows[0].recipient_kind == "client"


def test_support_already_assigned_as_staff_has_one_reminder_and_keeps_existing_role(support_case):
    f = support_case
    grant = StaffGrant(user_id=f.support.id, role_code="general_manager",
                       granted_by_admin_id=f.root.id, grant_reason="Fixture existing staff",
                       grant_idempotency_key="existing-support-staff-grant")
    f.db.add(grant)
    f.db.flush()
    f.db.add(VisaCaseAssignment(visa_case_id=f.case.id, staff_user_id=f.support.id,
                               staff_grant_id=grant.id, assigned_by_admin_id=f.root.id,
                               assignment_reason="Fixture existing assignment",
                               assignment_idempotency_key="existing-support-assignment"))
    f.case.recommended_contact_at = f.due
    f.case.contact_reason_code = "EXTENSION"
    f.case.contact_plan_version = 1
    f.db.commit()
    materialize_contact_reminders(f.db, now=f.due)
    rows = f.db.query(VisaNotificationDelivery).filter_by(recipient_user_id=f.support.id).all()
    assert len(rows) == 1
    assert rows[0].payload["staff_role_code"] == "general_manager"
    assert rows[0].payload["can_open_case"] is False
    assert f.db.query(StaffGrant).count() == 1
    assert f.db.query(VisaCaseAssignment).count() == 1


@pytest.mark.parametrize("attempted_state", ["CLAIMED", "DELIVERED", "UNKNOWN", "FAILED"])
def test_new_support_does_not_backfill_attempted_contact_plan(support_case, monkeypatch, attempted_state):
    f = support_case
    monkeypatch.setattr(settings, "SUPPORT_CHAT_IDS", "")
    f.case.recommended_contact_at = f.due
    f.case.contact_reason_code = "EXTENSION"
    f.case.contact_plan_version = 1
    f.db.commit()
    materialize_contact_reminders(f.db, now=f.due)
    claims = claim_deliveries(f.db, now=f.due)
    if attempted_state != "CLAIMED":
        for claim in claims:
            settle_delivery(f.db, claim.id, claim.lease_token, state=attempted_state)
    monkeypatch.setattr(settings, "SUPPORT_CHAT_IDS", str(f.support.telegram_id))
    repeated = materialize_contact_reminders(f.db, now=f.due)
    assert repeated.created == 0
    assert f.db.query(VisaNotificationDelivery).filter_by(recipient_user_id=f.support.id).count() == 0

    # A later explicit plan version is a new reminder, so support receives it.
    f.case.contact_plan_version = 2
    f.case.recommended_contact_at = f.due + timedelta(days=1)
    f.db.commit()
    materialize_contact_reminders(f.db, now=f.due + timedelta(days=1))
    support_row = f.db.query(VisaNotificationDelivery).filter_by(recipient_user_id=f.support.id).one()
    assert support_row.payload["plan_version"] == 2
    assert support_row.state == "PENDING"


@pytest.mark.parametrize("client_outcome,support_outcome,retry_allowed", [
    ("delivered", "failed", False),
    ("unknown", "failed", False),
    ("failed", "delivered", False),
    ("failed", "failed", True),
])
def test_web_message_retry_cannot_repeat_delivered_or_unknown_destinations(
    support_case, monkeypatch, client_outcome, support_outcome, retry_allowed,
):
    f = support_case
    monkeypatch.setattr(settings, "VISA_LIFECYCLE_ENABLED", True)
    monkeypatch.setattr(settings, "CLIENT_CABINET_ENABLED", True)
    monkeypatch.setattr(settings, "ADMIN_CLIENT_CRM_ENABLED", True)
    monkeypatch.setattr(api, "SessionLocal", sessionmaker(bind=f.db.bind, expire_on_commit=False))
    conversation = WebConversation(user_id=f.client.id, assigned_staff_ids=[f.root.telegram_id])
    f.db.add(conversation)
    f.db.flush()
    message = WebMessage(conversation_id=conversation.id, author_type="staff", visibility="client",
                         actor_telegram_id=f.root.telegram_id, body="Fixture outbound reply")
    f.db.add(message)
    f.db.flush()
    event = WebOutboxEvent(event_type="web_staff_client_message", aggregate_id=conversation.id,
                           status="failed", attempts=1, payload={
                               "message_id": message.id,
                               "delivery_report": {"recipients": {
                                   str(f.client.telegram_id): client_outcome,
                                   str(f.support.telegram_id): support_outcome,
                               }},
                           })
    f.db.add(event)
    f.db.commit()
    if retry_allowed:
        result = api.retry_admin_client_message(f.client.id, message.id, f.root)
        assert result["status"] == "pending"
    else:
        with pytest.raises(HTTPException) as error:
            api.retry_admin_client_message(f.client.id, message.id, f.root)
        assert error.value.status_code == 409
    f.db.expire_all()
    assert f.db.get(WebOutboxEvent, event.id).status == ("pending" if retry_allowed else "failed")
    assert f.db.query(WebOutboxEvent).count() == 1
    assert f.db.query(WebMessage).count() == 1
