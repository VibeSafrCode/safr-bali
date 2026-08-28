from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.admin_safety import StaffGrant
from app.models.user import User
from app.models.visa_lifecycle import (
    VisaCase,
    VisaCaseAssignment,
    VisaNotificationDelivery,
)
from app.services.visa_lifecycle import (
    CONTACT_REMINDER_CLIENT,
    CONTACT_REMINDER_LEGACY,
    CONTACT_REMINDER_STAFF,
    CONTACT_REMINDER_TYPES,
    enqueue_delivery,
)
from app.services.visa_notifications import visa_display_name


CONTACT_REASON_CODES = frozenset({"VISA_EXPIRY", "EXTENSION", "NEW_VISA", "OTHER"})
CONTACT_MATERIALIZER_LOCK_ID = 7_406_701


@dataclass(frozen=True)
class ContactMaterializationResult:
    lock_acquired: bool
    cases_scanned: int = 0
    created: int = 0
    suppressed: int = 0
    reactivated: int = 0

    def public_payload(self) -> dict:
        return asdict(self)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _active_staff_recipients(db: Session, case_id: int) -> dict[int, dict[str, object]]:
    rows = db.query(User, StaffGrant).join(
        VisaCaseAssignment,
        VisaCaseAssignment.staff_user_id == User.id,
    ).join(
        StaffGrant,
        StaffGrant.id == VisaCaseAssignment.staff_grant_id,
    ).filter(
        VisaCaseAssignment.visa_case_id == case_id,
        VisaCaseAssignment.revoked_at.is_(None),
        StaffGrant.revoked_at.is_(None),
        StaffGrant.role_code.in_(("visa_manager", "general_manager")),
        User.status == "active",
    ).all()
    recipients: dict[int, dict[str, object]] = {}
    for user, grant in rows:
        current = recipients.get(user.id)
        if current is not None and current["role_code"] == "visa_manager":
            continue
        recipients[user.id] = {
            "locale": user.locale if user.locale in {"ru", "en"} else "ru",
            "role_code": grant.role_code,
            "can_open_case": grant.role_code == "visa_manager",
        }
    return recipients


def _root_recipient(db: Session) -> User | None:
    return db.query(User).filter(
        User.telegram_id == settings.DEFAULT_ADMIN_TELEGRAM_ID,
        User.role == "admin",
        User.status == "active",
    ).first()


def _client_display_name(client: User) -> str:
    name = " ".join(
        part.strip() for part in (client.first_name, client.last_name)
        if isinstance(part, str) and part.strip()
    )
    if name:
        return name[:100]
    if isinstance(client.username, str) and client.username.strip():
        return ("@" + client.username.strip().lstrip("@"))[:100]
    return "Client"


def _ensure_delivery(
    db: Session,
    *,
    case: VisaCase,
    recipient_user_id: int,
    recipient_kind: str,
    locale: str,
    payload: dict,
    desired_state: str,
) -> tuple[VisaNotificationDelivery, str]:
    notification_type = {
        "client": CONTACT_REMINDER_CLIENT,
        "staff": CONTACT_REMINDER_STAFF,
    }.get(recipient_kind)
    if notification_type is None:
        raise RuntimeError("Unsupported contact reminder recipient kind")
    dedupe_key = (
        f"visa:{case.id}:contact:{case.contact_plan_version}:"
        f"{recipient_kind}:{recipient_user_id}"
    )
    existing = db.query(VisaNotificationDelivery).filter(
        VisaNotificationDelivery.dedupe_key == dedupe_key
    ).first()
    if existing is None:
        row = enqueue_delivery(
            db,
            visa_case_id=case.id,
            visa_event_id=None,
            recipient_user_id=recipient_user_id,
            recipient_kind=recipient_kind,
            locale=locale,
            notification_type=notification_type,
            payload=payload,
            dedupe_key=dedupe_key,
            due_at=_aware(case.recommended_contact_at),
            state=desired_state,
        )
        return row, "created"
    if (
        existing.recipient_user_id != recipient_user_id
        or (
            existing.recipient_kind.strip().lower()
            if isinstance(existing.recipient_kind, str)
            else ""
        ) != recipient_kind
    ):
        existing.state = "SUPPRESSED"
        existing.last_error_code = "recipient_contract_mismatch"
        existing.updated_at = datetime.now(timezone.utc)
        return existing, "suppressed"
    existing.recipient_kind = recipient_kind
    if existing.notification_type == CONTACT_REMINDER_LEGACY:
        existing.notification_type = notification_type
    elif existing.notification_type != notification_type:
        existing.state = "SUPPRESSED"
        existing.last_error_code = "recipient_contract_mismatch"
        existing.updated_at = datetime.now(timezone.utc)
        return existing, "suppressed"
    if existing.state == "SUPPRESSED" and desired_state == "PENDING":
        existing.state = "PENDING"
        existing.payload = payload
        existing.due_at = _aware(case.recommended_contact_at)
        existing.last_error_code = None
        existing.updated_at = datetime.now(timezone.utc)
        return existing, "reactivated"
    if existing.state == "PENDING" and desired_state == "SUPPRESSED":
        existing.state = "SUPPRESSED"
        existing.payload = payload
        existing.updated_at = datetime.now(timezone.utc)
        return existing, "suppressed"
    return existing, "unchanged"


def materialize_contact_reminders(
    db: Session,
    *,
    now: datetime | None = None,
    limit: int = 200,
) -> ContactMaterializationResult:
    current = _aware(now or datetime.now(timezone.utc))
    if db.get_bind().dialect.name == "postgresql":
        acquired = db.execute(
            text("SELECT pg_try_advisory_xact_lock(:lock_id)"),
            {"lock_id": CONTACT_MATERIALIZER_LOCK_ID},
        ).scalar_one()
        if not acquired:
            db.rollback()
            return ContactMaterializationResult(lock_acquired=False)

    pending = db.query(VisaNotificationDelivery).filter(
        VisaNotificationDelivery.notification_type.in_(tuple(CONTACT_REMINDER_TYPES)),
        VisaNotificationDelivery.state == "PENDING",
    ).all()
    pending_case_ids = {row.visa_case_id for row in pending}
    query = db.query(VisaCase).filter(or_(
        VisaCase.id.in_(pending_case_ids) if pending_case_ids else False,
        VisaCase.recommended_contact_at <= current,
    )).order_by(VisaCase.recommended_contact_at, VisaCase.id)
    if db.get_bind().dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)
    cases = query.limit(max(1, min(limit, 1000))).all()

    root = _root_recipient(db)
    created = suppressed = reactivated = 0
    for case in cases:
        staff_recipients = _active_staff_recipients(db, case.id)
        if root is not None:
            staff_recipients[root.id] = {
                "locale": root.locale if root.locale in {"ru", "en"} else "ru",
                "role_code": "root_admin",
                "can_open_case": True,
            }
        eligible = (
            case.publication_status != "ARCHIVED"
            and case.recommended_contact_at is not None
            and _aware(case.recommended_contact_at) <= current
            and case.contact_reason_code in CONTACT_REASON_CODES
            and case.contact_plan_version > 0
        )
        if eligible and root is None:
            db.rollback()
            raise RuntimeError("Configured active root admin is required for contact reminders")
        current_recipient_ids = {case.user_id, *staff_recipients}
        for delivery in db.query(VisaNotificationDelivery).filter(
            VisaNotificationDelivery.visa_case_id == case.id,
            VisaNotificationDelivery.notification_type.in_(tuple(CONTACT_REMINDER_TYPES)),
            VisaNotificationDelivery.state == "PENDING",
        ).all():
            delivery_version = int((delivery.payload or {}).get("plan_version") or -1)
            if (
                not eligible
                or delivery_version != case.contact_plan_version
                or delivery.recipient_user_id not in current_recipient_ids
            ):
                delivery.state = "SUPPRESSED"
                delivery.updated_at = current
                suppressed += 1
        if not eligible:
            continue

        client = db.get(User, case.user_id)
        if client is not None:
            client_enabled = (
                client.status == "active"
                and case.publication_status == "PUBLISHED"
                and case.notifications_enabled
            )
            reminder_date = _aware(case.recommended_contact_at).date().isoformat()
            client_payload = {
                "audience": "client",
                "plan_version": case.contact_plan_version,
                "reason_code": case.contact_reason_code,
                "recommended_contact_at": _aware(case.recommended_contact_at).isoformat(),
                "date_kind": "recommended_contact_at",
                "date_value": reminder_date,
                "visa_display_name": visa_display_name(db, case),
            }
            if not client_enabled:
                if client.status != "active":
                    client_payload["suppressed_reason"] = "client_inactive"
                elif not case.notifications_enabled:
                    client_payload["suppressed_reason"] = "notifications_disabled"
                else:
                    client_payload["suppressed_reason"] = "case_not_published"
            _row, outcome = _ensure_delivery(
                db, case=case, recipient_user_id=client.id,
                recipient_kind="client",
                locale=client.locale if client.locale in {"ru", "en"} else "ru",
                payload=client_payload,
                desired_state="PENDING" if client_enabled else "SUPPRESSED",
            )
            created += outcome == "created"
            suppressed += outcome == "suppressed"
            reactivated += outcome == "reactivated"

        for staff_user_id, recipient in staff_recipients.items():
            client = db.get(User, case.user_id)
            staff_payload = {
                "audience": "staff",
                "plan_version": case.contact_plan_version,
                "reason_code": case.contact_reason_code,
                "recommended_contact_at": _aware(case.recommended_contact_at).isoformat(),
                "date_kind": "recommended_contact_at",
                "date_value": _aware(case.recommended_contact_at).date().isoformat(),
                "visa_display_name": visa_display_name(db, case),
                "client_display_name": _client_display_name(client) if client is not None else "Client",
                "staff_role_code": recipient["role_code"],
                "can_open_case": recipient["can_open_case"],
            }
            _row, outcome = _ensure_delivery(
                db, case=case, recipient_user_id=staff_user_id,
                recipient_kind="staff", locale=str(recipient["locale"]),
                payload=staff_payload, desired_state="PENDING",
            )
            created += outcome == "created"
            suppressed += outcome == "suppressed"
            reactivated += outcome == "reactivated"

    db.commit()
    return ContactMaterializationResult(
        lock_acquired=True,
        cases_scanned=len(cases),
        created=created,
        suppressed=suppressed,
        reactivated=reactivated,
    )
