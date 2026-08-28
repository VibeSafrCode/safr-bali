from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api import visa_lifecycle as api
from app.core.config import settings
from app.db.base import Base
from app.models.admin_safety import StaffGrant
from app.models.user import User
from app.models.visa_lifecycle import (
    VisaCase,
    VisaCaseAssignment,
    VisaNotificationDelivery,
    VisaType,
)
from app.services.visa_contact_reminders import materialize_contact_reminders
from app.services.visa_lifecycle import claim_deliveries


def database():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def seed(db):
    root = User(telegram_id=100, ref_code="root", role="admin", status="active", locale="ru", first_name="Root")
    manager = User(telegram_id=200, ref_code="visa-manager", role="client", status="active", locale="en", first_name="Visa")
    general = User(telegram_id=300, ref_code="general-manager", role="client", status="active", locale="ru", first_name="General")
    client = User(telegram_id=400, ref_code="client", role="client", status="active", locale="en", first_name="Client")
    visa_type = VisaType(country_code="ID", code="B1", name="B1", version=1)
    db.add_all([root, manager, general, client, visa_type]); db.flush()
    case = VisaCase(
        user_id=client.id, visa_type_id=visa_type.id, assigned_admin_id=root.id,
        publication_status="PUBLISHED", lifecycle_status="ACTIVE",
    )
    db.add(case); db.flush()
    db.add(VisaCaseAssignment(
        visa_case_id=case.id, staff_user_id=root.id,
        assigned_by_admin_id=root.id, assignment_reason="fixture primary",
        assignment_idempotency_key="fixture-primary-assignment",
    ))
    db.commit()
    return root, manager, general, client, case


def configure(monkeypatch, db, root):
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    monkeypatch.setattr(api, "SessionLocal", factory)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)
    monkeypatch.setattr(settings, "VISA_LIFECYCLE_ENABLED", True)
    monkeypatch.setattr(settings, "CLIENT_CABINET_ENABLED", True)
    monkeypatch.setattr(settings, "ADMIN_CLIENT_CRM_ENABLED", True)
    monkeypatch.setattr(settings, "VISA_MANAGER_RBAC_ENABLED", True)
    return factory


def test_staff_and_assignment_reasons_reject_whitespace_before_mutation():
    fixtures = (
        (api.StaffGrantRequest, {
            "user_id": 1, "role_code": "visa_manager", "reason": "   ",
            "idempotency_key": "reason-staff-grant",
        }),
        (api.StaffGrantRevokeRequest, {
            "reason": "\n\t", "idempotency_key": "reason-staff-revoke",
        }),
        (api.VisaAdditionalAssignmentRequest, {
            "staff_user_id": 1, "expected_version": 1, "reason": "   ",
            "idempotency_key": "reason-assignment",
        }),
        (api.VisaAssignmentRevokeRequest, {
            "expected_version": 1, "reason": "   ",
            "idempotency_key": "reason-assign-revoke",
        }),
    )
    for model, values in fixtures:
        try:
            model(**values)
        except ValidationError:
            pass
        else:
            raise AssertionError(f"{model.__name__} accepted a whitespace-only reason")


def test_root_staff_grants_multi_assignments_and_immediate_revocation(monkeypatch):
    db = database(); root, manager, general, client, case = seed(db)
    factory = configure(monkeypatch, db, root)
    manager_grant = api.admin_grant_staff_role(api.StaffGrantRequest(
        user_id=manager.id, role_code="visa_manager", reason="Visa access fixture",
        idempotency_key="staff-grant-visa-0001",
    ), root)
    replay = api.admin_grant_staff_role(api.StaffGrantRequest(
        user_id=manager.id, role_code="visa_manager", reason="Visa  access fixture",
        idempotency_key="staff-grant-visa-0001",
    ), root)
    assert replay["grant_id"] == manager_grant["grant_id"] and replay["idempotent_replay"] is True
    general_grant = api.admin_grant_staff_role(api.StaffGrantRequest(
        user_id=general.id, role_code="general_manager", reason="Contact reminder fixture",
        idempotency_key="staff-grant-general-01",
    ), root)
    assigned_manager = api.admin_add_case_assignment(case.id, api.VisaAdditionalAssignmentRequest(
        staff_user_id=manager.id, expected_version=1, reason="Shared visa responsibility",
        idempotency_key="case-assignment-visa-01",
    ), root)
    assignment_replay = api.admin_add_case_assignment(case.id, api.VisaAdditionalAssignmentRequest(
        staff_user_id=manager.id, expected_version=1, reason="Shared visa responsibility",
        idempotency_key="case-assignment-visa-01", make_primary=False,
    ), root)
    assert assignment_replay["assignment_id"] == assigned_manager["assignment_id"]
    assert assignment_replay["idempotent_replay"] is True
    try:
        api.admin_add_case_assignment(case.id, api.VisaAdditionalAssignmentRequest(
            staff_user_id=manager.id, expected_version=1, reason="Shared visa responsibility",
            idempotency_key="case-assignment-visa-01", make_primary=True,
        ), root)
    except HTTPException as error:
        assert error.status_code == 409
        assert "another case assignment" in str(error.detail)
    else:
        raise AssertionError("assignment replay changed make_primary semantics")
    assigned_general = api.admin_add_case_assignment(case.id, api.VisaAdditionalAssignmentRequest(
        staff_user_id=general.id, expected_version=2, reason="Shared client contact",
        idempotency_key="case-assignment-general-01",
    ), root)
    assert assigned_manager["case_version"] == 2
    assert assigned_general["case_version"] == 3
    assert api.require_visa_staff(manager).id == manager.id
    assert [row.id for row in api._case_query(factory(), manager).all()] == [case.id]
    try:
        api.require_visa_staff(general)
    except HTTPException as error:
        assert error.status_code == 403
    else:
        raise AssertionError("general manager grant must not imply visa editor access")

    db.add(VisaNotificationDelivery(
        visa_case_id=case.id, recipient_user_id=manager.id,
        recipient_kind="staff", locale="en",
        notification_type="CONTACT_REMINDER",
        payload={"case_id": case.id, "plan_version": 1},
        dedupe_key="manager-pending-before-role-revoke",
        due_at=datetime.now(timezone.utc), state="PENDING",
    ))
    db.commit()
    revoked = api.admin_revoke_staff_role(
        manager_grant["grant_id"],
        api.StaffGrantRevokeRequest(
            reason="Immediate access revocation", idempotency_key="staff-revoke-visa-001",
        ),
        root,
    )
    assert revoked["active"] is False
    pending_after_revoke = factory().query(VisaNotificationDelivery).filter_by(
        dedupe_key="manager-pending-before-role-revoke",
    ).one()
    assert pending_after_revoke.state == "SUPPRESSED"
    try:
        api.require_visa_staff(manager)
    except HTTPException as error:
        assert error.status_code == 403
    else:
        raise AssertionError("revoked visa grant must deny the next request")

    regranted = api.admin_grant_staff_role(api.StaffGrantRequest(
        user_id=manager.id, role_code="visa_manager", reason="New access generation",
        idempotency_key="staff-grant-visa-0002",
    ), root)
    assert regranted["grant_id"] != manager_grant["grant_id"]
    assert api._case_query(factory(), manager).filter(VisaCase.id == case.id).first() is None
    assert factory().query(VisaCaseAssignment).filter_by(
        visa_case_id=case.id, staff_user_id=manager.id, revoked_at=None,
    ).one().staff_grant_id == manager_grant["grant_id"]

    revoked_assignment = api.admin_revoke_case_assignment(
        case.id, assigned_manager["assignment_id"],
        api.VisaAssignmentRevokeRequest(
            expected_version=3, reason="Remove responsibility",
            idempotency_key="case-assignment-revoke-01",
        ),
        root,
    )
    assert revoked_assignment["case_version"] == 4
    assert api._case_query(factory(), manager).filter(VisaCase.id == case.id).first() is None
    directory = api.admin_staff_directory(True, root)
    assert directory["total"] == 3
    assert {item["role_code"] for item in directory["items"]} == {"visa_manager", "general_manager"}
    assert general_grant["active"] is True


def test_contact_plan_aggregate_materializes_safe_recipient_rows_and_suppresses_stale(monkeypatch):
    db = database(); root, manager, general, client, case = seed(db)
    factory = configure(monkeypatch, db, root)
    manager_grant = StaffGrant(user_id=manager.id, role_code="visa_manager", granted_by_admin_id=root.id, grant_reason="fixture", grant_idempotency_key="reminder-manager-grant")
    general_grant = StaffGrant(user_id=general.id, role_code="general_manager", granted_by_admin_id=root.id, grant_reason="fixture", grant_idempotency_key="reminder-general-grant")
    db.add_all([manager_grant, general_grant]); db.flush()
    db.add_all([
        VisaCaseAssignment(visa_case_id=case.id, staff_user_id=manager.id, staff_grant_id=manager_grant.id, assigned_by_admin_id=root.id, assignment_reason="fixture", assignment_idempotency_key="reminder-manager-assignment"),
        VisaCaseAssignment(visa_case_id=case.id, staff_user_id=general.id, staff_grant_id=general_grant.id, assigned_by_admin_id=root.id, assignment_reason="fixture", assignment_idempotency_key="reminder-general-assignment"),
    ])
    case.notifications_enabled = False
    db.commit()
    due = datetime.now(timezone.utc) - timedelta(minutes=1)
    updated = api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(
        recommended_contact_at=due,
        contact_reason_code="VISA_EXPIRY",
        contact_internal_note="Internal staff context only",
        expected_version=1,
        reason="Schedule contact reminder",
        idempotency_key="contact-plan-update-0001",
    ), root)
    assert updated["contact_plan_version"] == 1
    assert updated["contact_internal_note"] == "Internal staff context only"
    client_card = api._card(factory(), factory().get(VisaCase, case.id), client_view=True)
    assert "contact_internal_note" not in client_card

    result = materialize_contact_reminders(factory(), now=datetime.now(timezone.utc))
    assert result.created == 4 and result.suppressed == 0
    check = factory()
    rows = check.query(VisaNotificationDelivery).filter(
        VisaNotificationDelivery.notification_type.in_((
            "CONTACT_REMINDER_CLIENT", "CONTACT_REMINDER_STAFF",
        ))
    ).all()
    assert len(rows) == 4
    client_row = next(row for row in rows if row.recipient_kind == "client")
    assert client_row.state == "SUPPRESSED"
    assert "internal_note" not in client_row.payload
    assert "client_user_id" not in client_row.payload
    staff_rows = [row for row in rows if row.recipient_kind == "staff"]
    assert {row.recipient_user_id for row in staff_rows} == {root.id, manager.id, general.id}
    assert all("internal_note" not in row.payload for row in staff_rows)
    assert {row.payload["staff_role_code"] for row in staff_rows} == {
        "root_admin", "visa_manager", "general_manager",
    }
    assert all(row.notification_type == "CONTACT_REMINDER_STAFF" for row in staff_rows)
    assert client_row.notification_type == "CONTACT_REMINDER_CLIENT"
    claimed = claim_deliveries(check, now=datetime.now(timezone.utc))
    assert {(row.recipient_kind, row.notification_type) for row in claimed} == {
        ("staff", "CONTACT_REMINDER_STAFF"),
    }
    claimed_by_recipient = {row.recipient_user_id: row for row in claimed}
    assert set(claimed_by_recipient) == {root.id, manager.id, general.id}
    assert claimed_by_recipient[manager.id].payload["staff_role_code"] == "visa_manager"
    assert claimed_by_recipient[manager.id].payload["can_open_case"] is True
    assert claimed_by_recipient[general.id].payload["staff_role_code"] == "general_manager"
    assert claimed_by_recipient[general.id].payload["can_open_case"] is False
    assert claimed_by_recipient[root.id].payload["staff_role_code"] == "root_admin"
    assert all(item.payload["client_display_name"] == "Client" for item in claimed)
    assert all(item.payload["visa_display_name"] == "B1" for item in claimed)
    assert all(item.payload["date_value"] == due.date().isoformat() for item in claimed)
    assert all("internal_note" not in item.payload for item in claimed)
    for item in claimed:
        persisted = check.get(VisaNotificationDelivery, item.id)
        persisted.state = "DELIVERED"
        persisted.lease_token = None
        persisted.lease_expires_at = None
    check.commit()
    assert materialize_contact_reminders(factory(), now=datetime.now(timezone.utc)).created == 0

    mutable = check.get(VisaCase, case.id)
    mutable.notifications_enabled = True
    check.commit()
    reactivated = materialize_contact_reminders(factory(), now=datetime.now(timezone.utc))
    assert reactivated.reactivated == 1
    assert factory().get(VisaNotificationDelivery, client_row.id).state == "PENDING"

    current = factory().get(VisaCase, case.id)
    changed = api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(
        recommended_contact_at=due + timedelta(seconds=1),
        contact_reason_code="EXTENSION",
        contact_internal_note="New internal context",
        expected_version=current.version,
        reason="Correct contact plan",
        idempotency_key="contact-plan-update-0002",
    ), root)
    assert changed["contact_plan_version"] == 2
    stale_after_save = factory().query(VisaNotificationDelivery).filter(
        VisaNotificationDelivery.visa_case_id == case.id,
    ).all()
    assert not any(
        row.state == "PENDING" and (row.payload or {}).get("plan_version") == 1
        for row in stale_after_save
    )
    correction = materialize_contact_reminders(factory(), now=datetime.now(timezone.utc))
    assert correction.suppressed == 0 and correction.created == 4
    final = factory()
    old_pending = [
        row for row in final.query(VisaNotificationDelivery).filter(
            VisaNotificationDelivery.notification_type.in_((
                "CONTACT_REMINDER_CLIENT", "CONTACT_REMINDER_STAFF",
            ))
        ).all()
        if (row.payload or {}).get("plan_version") == 1
    ]
    assert not any(row.state == "PENDING" for row in old_pending)
    assert final.query(VisaNotificationDelivery).filter(
        VisaNotificationDelivery.notification_type.in_((
            "CONTACT_REMINDER_CLIENT", "CONTACT_REMINDER_STAFF",
        ))
    ).count() == 8
