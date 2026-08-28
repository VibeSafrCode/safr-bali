from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.admin_action import AdminAction
from app.models.admin_safety import StaffGrant
from app.models.user import User
from app.models.visa_lifecycle import (
    VisaCase,
    VisaCaseAssignment,
    VisaNotificationDelivery,
)
from app.services.action_reason import ActionReasonInvalid, normalize_action_reason
from app.services.visa_lifecycle import (
    CONTACT_REMINDER_LEGACY,
    CONTACT_REMINDER_STAFF,
    append_event,
)


STAFF_ROLE_CODES = frozenset({"visa_manager", "general_manager"})


class VisaStaffBlocked(RuntimeError):
    pass


def normalized_reason(value: str) -> str:
    try:
        return normalize_action_reason(value)
    except ActionReasonInvalid as error:
        raise VisaStaffBlocked(str(error)) from error


def _lock_idempotency_key(db: Session, namespace: str, key: str) -> None:
    if db.get_bind().dialect.name != "postgresql":
        return
    lock_id = int.from_bytes(
        hashlib.sha256(f"visa-staff:{namespace}:{key}".encode()).digest()[:8],
        "big",
    ) & ((1 << 63) - 1)
    db.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": lock_id})


def is_root_admin(user: User) -> bool:
    return (
        user.role == "admin"
        and user.status == "active"
        and user.telegram_id == settings.DEFAULT_ADMIN_TELEGRAM_ID
    )


def active_staff_grant(
    db: Session,
    user_id: int,
    *,
    role_codes: frozenset[str] | set[str] | None = None,
) -> StaffGrant | None:
    query = db.query(StaffGrant).filter(
        StaffGrant.user_id == user_id,
        StaffGrant.revoked_at.is_(None),
    )
    if role_codes is not None:
        query = query.filter(StaffGrant.role_code.in_(tuple(role_codes)))
    return query.order_by(StaffGrant.id.desc()).first()


def has_active_visa_manager_grant(db: Session, user_id: int) -> bool:
    return active_staff_grant(db, user_id, role_codes={"visa_manager"}) is not None


def grant_staff_role(
    db: Session,
    *,
    user_id: int,
    role_code: str,
    actor: User,
    reason: str,
    idempotency_key: str,
) -> tuple[StaffGrant, bool]:
    normalized = normalized_reason(reason)
    if not is_root_admin(actor):
        raise VisaStaffBlocked("Root admin is required")
    if role_code not in STAFF_ROLE_CODES:
        raise VisaStaffBlocked("Unsupported staff role")
    _lock_idempotency_key(db, "grant", idempotency_key)
    def resolve_replay(existing: StaffGrant | None) -> tuple[StaffGrant, bool] | None:
        if existing is None:
            return None
        if (
            existing.user_id != user_id
            or existing.role_code != role_code
            or existing.granted_by_admin_id != actor.id
            or normalized_reason(existing.grant_reason) != normalized
        ):
            raise VisaStaffBlocked("Idempotency key belongs to another staff grant")
        return existing, True
    replay = resolve_replay(db.query(StaffGrant).filter(
        StaffGrant.grant_idempotency_key == idempotency_key
    ).first())
    if replay is not None:
        return replay
    target = db.query(User).filter(User.id == user_id).with_for_update().first()
    if target is None or target.status != "active":
        raise VisaStaffBlocked("Active user is required")
    # Serialize grants for one account, then re-read the key so concurrent
    # retries return the original actor-bound result instead of an active-role
    # conflict.
    replay = resolve_replay(db.query(StaffGrant).filter(
        StaffGrant.grant_idempotency_key == idempotency_key
    ).first())
    if replay is not None:
        return replay
    if is_root_admin(target):
        raise VisaStaffBlocked("Root admin already has global access")
    if active_staff_grant(db, target.id, role_codes={role_code}) is not None:
        raise VisaStaffBlocked("Staff role is already active")
    row = StaffGrant(
        user_id=target.id,
        role_code=role_code,
        granted_by_admin_id=actor.id,
        grant_reason=normalized,
        grant_idempotency_key=idempotency_key,
    )
    db.add(row); db.flush()
    db.add(AdminAction(
        admin_user_id=actor.id,
        action_type="STAFF_ROLE_GRANTED",
        entity_type="staff_grant",
        entity_id=row.id,
        comment=normalized,
        idempotency_key=idempotency_key,
        details={"user_id": target.id, "role_code": role_code},
    ))
    db.flush()
    return row, False


def revoke_staff_grant(
    db: Session,
    *,
    grant_id: int,
    actor: User,
    reason: str,
    idempotency_key: str,
) -> tuple[StaffGrant, bool]:
    normalized = normalized_reason(reason)
    if not is_root_admin(actor):
        raise VisaStaffBlocked("Root admin is required")
    _lock_idempotency_key(db, "revoke-grant", idempotency_key)
    replay = db.query(StaffGrant).filter(
        StaffGrant.revoke_idempotency_key == idempotency_key
    ).first()
    if replay:
        if (
            replay.id != grant_id
            or replay.revoked_by_admin_id != actor.id
            or normalized_reason(replay.revoke_reason or "") != normalized
        ):
            raise VisaStaffBlocked("Idempotency key belongs to another staff revocation")
        return replay, True
    row = db.query(StaffGrant).filter(StaffGrant.id == grant_id).with_for_update().first()
    if row is None:
        raise VisaStaffBlocked("Staff grant not found")
    if row.revoked_at is not None:
        if (
            row.revoke_idempotency_key == idempotency_key
            and row.revoked_by_admin_id == actor.id
            and normalized_reason(row.revoke_reason or "") == normalized
        ):
            return row, True
        raise VisaStaffBlocked("Staff grant is already revoked")
    now = datetime.now(timezone.utc)
    row.revoked_at = now
    row.revoked_by_admin_id = actor.id
    row.revoke_reason = normalized
    row.revoke_idempotency_key = idempotency_key
    other_active_role = db.query(StaffGrant.id).filter(
        StaffGrant.user_id == row.user_id,
        StaffGrant.id != row.id,
        StaffGrant.role_code.in_(tuple(STAFF_ROLE_CODES)),
        StaffGrant.revoked_at.is_(None),
    ).first()
    bound_case_ids = db.query(VisaCaseAssignment.visa_case_id).filter(
        VisaCaseAssignment.staff_grant_id == row.id,
        VisaCaseAssignment.revoked_at.is_(None),
    )
    reminder_scope = db.query(VisaNotificationDelivery).filter(
        VisaNotificationDelivery.recipient_user_id == row.user_id,
        VisaNotificationDelivery.recipient_kind == "staff",
        VisaNotificationDelivery.notification_type.in_((
            CONTACT_REMINDER_LEGACY,
            CONTACT_REMINDER_STAFF,
        )),
        VisaNotificationDelivery.state == "PENDING",
    )
    if other_active_role is not None:
        reminder_scope = reminder_scope.filter(
            VisaNotificationDelivery.visa_case_id.in_(bound_case_ids)
        )
    reminder_scope.update(
        {
            VisaNotificationDelivery.state: "SUPPRESSED",
            VisaNotificationDelivery.updated_at: now,
        },
        synchronize_session=False,
    )
    db.add(AdminAction(
        admin_user_id=actor.id,
        action_type="STAFF_ROLE_REVOKED",
        entity_type="staff_grant",
        entity_id=row.id,
        comment=normalized,
        idempotency_key=idempotency_key,
        details={"user_id": row.user_id, "role_code": row.role_code},
    ))
    db.flush()
    return row, False


def add_case_assignment(
    db: Session,
    *,
    case_id: int,
    staff_user_id: int,
    expected_version: int,
    actor: User,
    reason: str,
    idempotency_key: str,
    make_primary: bool = False,
) -> tuple[VisaCaseAssignment, bool]:
    normalized = normalized_reason(reason)
    if not is_root_admin(actor):
        raise VisaStaffBlocked("Root admin is required")
    _lock_idempotency_key(db, "assign", idempotency_key)
    def resolve_replay(existing: VisaCaseAssignment | None) -> tuple[VisaCaseAssignment, bool] | None:
        if existing is None:
            return None
        if (
            existing.visa_case_id != case_id
            or existing.staff_user_id != staff_user_id
            or existing.assigned_by_admin_id != actor.id
            or normalized_reason(existing.assignment_reason) != normalized
            or bool(existing.make_primary_requested) != make_primary
        ):
            raise VisaStaffBlocked("Idempotency key belongs to another case assignment")
        return existing, True
    replay = resolve_replay(db.query(VisaCaseAssignment).filter(
        VisaCaseAssignment.assignment_idempotency_key == idempotency_key
    ).first())
    if replay is not None:
        return replay
    case = db.query(VisaCase).filter(VisaCase.id == case_id).with_for_update().first()
    if case is None:
        raise VisaStaffBlocked("Visa case not found")
    replay = resolve_replay(db.query(VisaCaseAssignment).filter(
        VisaCaseAssignment.assignment_idempotency_key == idempotency_key
    ).first())
    if replay is not None:
        return replay
    if case.version != expected_version:
        raise VisaStaffBlocked("Visa case changed")
    staff = db.query(User).filter(User.id == staff_user_id, User.status == "active").first()
    staff_grant = None
    if staff is not None:
        staff_grant = active_staff_grant(db, staff.id, role_codes={"visa_manager"})
        if staff_grant is None:
            staff_grant = active_staff_grant(db, staff.id, role_codes={"general_manager"})
    if staff is None or staff_grant is None:
        raise VisaStaffBlocked("Active staff grant is required")
    active = db.query(VisaCaseAssignment).filter(
        VisaCaseAssignment.visa_case_id == case.id,
        VisaCaseAssignment.staff_user_id == staff.id,
        VisaCaseAssignment.revoked_at.is_(None),
    ).first()
    if active is not None:
        raise VisaStaffBlocked("Staff member is already assigned")
    row = VisaCaseAssignment(
        visa_case_id=case.id,
        staff_user_id=staff.id,
        staff_grant_id=staff_grant.id,
        make_primary_requested=make_primary,
        assigned_by_admin_id=actor.id,
        assignment_reason=normalized,
        assignment_idempotency_key=idempotency_key,
    )
    db.add(row); db.flush()
    before_primary = case.assigned_admin_id
    if make_primary:
        case.assigned_admin_id = staff.id
    case.version += 1
    case.updated_at = datetime.now(timezone.utc)
    append_event(
        db, case,
        event_type="CASE_STAFF_ASSIGNED",
        source="admin",
        actor_user_id=actor.id,
        before={"primary_assigned_admin_id": before_primary},
        after={
            "assignment_id": row.id,
            "staff_user_id": staff.id,
            "primary_assigned_admin_id": case.assigned_admin_id,
        },
        reason=normalized,
        idempotency_key=idempotency_key,
    )
    db.flush()
    return row, False


def revoke_case_assignment(
    db: Session,
    *,
    case_id: int,
    assignment_id: int,
    expected_version: int,
    actor: User,
    reason: str,
    idempotency_key: str,
) -> tuple[VisaCaseAssignment, bool]:
    normalized = normalized_reason(reason)
    if not is_root_admin(actor):
        raise VisaStaffBlocked("Root admin is required")
    _lock_idempotency_key(db, "revoke-assignment", idempotency_key)
    replay = db.query(VisaCaseAssignment).filter(
        VisaCaseAssignment.revoke_idempotency_key == idempotency_key
    ).first()
    if replay:
        if (
            replay.id != assignment_id
            or replay.visa_case_id != case_id
            or replay.revoked_by_admin_id != actor.id
            or normalized_reason(replay.revoke_reason or "") != normalized
        ):
            raise VisaStaffBlocked("Idempotency key belongs to another assignment revocation")
        return replay, True
    case = db.query(VisaCase).filter(VisaCase.id == case_id).with_for_update().first()
    if case is None:
        raise VisaStaffBlocked("Visa case not found")
    if case.version != expected_version:
        raise VisaStaffBlocked("Visa case changed")
    row = db.query(VisaCaseAssignment).filter(
        VisaCaseAssignment.id == assignment_id,
        VisaCaseAssignment.visa_case_id == case.id,
    ).with_for_update().first()
    if row is None:
        raise VisaStaffBlocked("Case assignment not found")
    if row.revoked_at is not None:
        if (
            row.revoke_idempotency_key == idempotency_key
            and row.revoked_by_admin_id == actor.id
            and normalized_reason(row.revoke_reason or "") == normalized
        ):
            return row, True
        raise VisaStaffBlocked("Case assignment is already revoked")
    now = datetime.now(timezone.utc)
    row.revoked_at = now
    row.revoked_by_admin_id = actor.id
    row.revoke_reason = normalized
    row.revoke_idempotency_key = idempotency_key
    db.query(VisaNotificationDelivery).filter(
        VisaNotificationDelivery.visa_case_id == case.id,
        VisaNotificationDelivery.recipient_user_id == row.staff_user_id,
        VisaNotificationDelivery.recipient_kind == "staff",
        VisaNotificationDelivery.notification_type.in_((
            CONTACT_REMINDER_LEGACY,
            CONTACT_REMINDER_STAFF,
        )),
        VisaNotificationDelivery.state == "PENDING",
    ).update(
        {
            VisaNotificationDelivery.state: "SUPPRESSED",
            VisaNotificationDelivery.updated_at: now,
        },
        synchronize_session=False,
    )
    before_primary = case.assigned_admin_id
    if case.assigned_admin_id == row.staff_user_id:
        replacement = db.query(VisaCaseAssignment).filter(
            VisaCaseAssignment.visa_case_id == case.id,
            VisaCaseAssignment.id != row.id,
            VisaCaseAssignment.revoked_at.is_(None),
        ).order_by(VisaCaseAssignment.id).first()
        case.assigned_admin_id = replacement.staff_user_id if replacement else actor.id
    case.version += 1
    case.updated_at = now
    append_event(
        db, case,
        event_type="CASE_STAFF_REVOKED",
        source="admin",
        actor_user_id=actor.id,
        before={
            "assignment_id": row.id,
            "staff_user_id": row.staff_user_id,
            "primary_assigned_admin_id": before_primary,
        },
        after={"primary_assigned_admin_id": case.assigned_admin_id},
        reason=normalized,
        idempotency_key=idempotency_key,
    )
    db.flush()
    return row, False
