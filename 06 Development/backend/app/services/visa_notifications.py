from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.admin_action import AdminAction
from app.models.user import User
from app.models.visa_lifecycle import (
    VisaCase,
    VisaDocument,
    VisaEvent,
    VisaNotificationDelivery,
    VisaType,
)
from app.services.action_reason import ActionReasonInvalid, normalize_action_reason


SAFE_STATUS_FIELDS = ("service_status", "lifecycle_status")
SAFE_DATE_FIELDS = (
    "issued_on",
    "entry_deadline",
    "entered_on",
    "stay_end",
    "extension_window_start",
    "expected_stay_end",
    "next_action_due_at",
)
CLIENT_RENDERED_DATE_FIELDS = (
    "stay_end",
    "entry_deadline",
    "extension_window_start",
)
RETRYABLE_PRE_SEND_ERROR_CODES = frozenset({
    "network_error_before_send",
    "rate_limited_before_send",
    "timeout_before_send",
    "transport_unavailable_before_send",
})


class NotificationSafetyBlocked(RuntimeError):
    pass


def lock_notification_idempotency_key(db: Session, namespace: str, key: str) -> None:
    if db.get_bind().dialect.name != "postgresql":
        return
    lock_id = int.from_bytes(
        hashlib.sha256(f"visa-notification:{namespace}:{key}".encode()).digest()[:8],
        "big",
    ) & ((1 << 63) - 1)
    db.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": lock_id})


def _normal(value: str) -> str:
    try:
        return normalize_action_reason(value)
    except ActionReasonInvalid as error:
        raise NotificationSafetyBlocked(str(error)) from error


def _iso(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return aware.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        return value[:40]
    raise NotificationSafetyBlocked("Unsupported notification date value")


def _safe_status(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value or len(value) > 64:
        raise NotificationSafetyBlocked("Unsupported notification status value")
    return value


def visa_display_name(db: Session, case: VisaCase) -> str:
    visa_type = db.get(VisaType, case.visa_type_id)
    name = (case.custom_visa_name or (visa_type.name if visa_type else None) or "Visa").strip()
    code = (visa_type.code if visa_type else "").strip()
    if code and code.casefold() not in name.casefold():
        return f"{name} · {code}"[:200]
    return name[:200]


def safe_current_case_payload(db: Session, case: VisaCase) -> dict:
    current: dict[str, object] = {
        "service_status": _safe_status(case.service_status),
        "lifecycle_status": _safe_status(case.lifecycle_status),
    }
    for field in SAFE_DATE_FIELDS:
        value = _iso(getattr(case, field))
        if value is not None:
            current[field] = value
    payload = {
        "schema_version": 1,
        "visa_display_name": visa_display_name(db, case),
        "lifecycle_status": _safe_status(case.lifecycle_status),
        "status": _safe_status(case.lifecycle_status),
        "service_status": _safe_status(case.service_status),
        "current": current,
    }
    date_fields = list(CLIENT_RENDERED_DATE_FIELDS)
    if case.lifecycle_status == "ISSUED_NOT_ACTIVATED":
        date_fields = ["entry_deadline", "stay_end", "extension_window_start"]
    for field in date_fields:
        value = _iso(getattr(case, field))
        if value is not None:
            payload["date_kind"] = field
            payload["date_value"] = value
            break
    return payload


def _event_changes(db: Session, event: VisaEvent) -> list[dict]:
    before = event.before if isinstance(event.before, dict) else {}
    after = event.after if isinstance(event.after, dict) else {}
    changes: list[dict] = []
    for field in SAFE_STATUS_FIELDS:
        if field not in before and field not in after:
            continue
        old = _safe_status(before.get(field))
        new = _safe_status(after.get(field))
        if old != new:
            changes.append({"field": field, "before": old, "after": new})
    for field in SAFE_DATE_FIELDS:
        if field not in before and field not in after:
            continue
        old = _iso(before.get(field))
        new = _iso(after.get(field))
        if old != new:
            changes.append({"field": field, "before": old, "after": new})

    process_before = before.get("processes") if isinstance(before.get("processes"), list) else []
    process_after = after.get("processes") if isinstance(after.get("processes"), list) else []
    before_by_id = {
        str(item.get("id")): item for item in process_before
        if isinstance(item, dict) and item.get("id") is not None
    }
    for item in process_after:
        if not isinstance(item, dict):
            continue
        process_type = _safe_status(item.get("process_type"))
        external_status = _safe_status(item.get("external_status"))
        action = _safe_status(item.get("action"))
        if process_type is None or action is None:
            continue
        old_item = before_by_id.get(str(item.get("id")), {})
        changes.append({
            "field": "process_status",
            "process_type": process_type,
            "action": action,
            "before": _safe_status(old_item.get("external_status")),
            "after": external_status,
        })

    if event.event_type.startswith("DOCUMENT_") and after.get("visibility") == "CLIENT":
        document_id = after.get("document_id")
        if isinstance(document_id, int):
            document = db.get(VisaDocument, document_id)
            if document is not None and document.visibility == "CLIENT":
                changes.append({
                    "field": "document",
                    "action": event.event_type,
                    "name": document.display_name[:255],
                    "document_type": document.document_type[:80],
                })
    return changes


def frozen_event_client_payload(
    db: Session,
    *,
    case: VisaCase,
    event: VisaEvent,
    notification_type: str,
) -> dict:
    if event.visa_case_id != case.id:
        raise NotificationSafetyBlocked("Notification event does not belong to visa case")
    payload = safe_current_case_payload(db, case)
    payload.update({
        "notification_type": notification_type,
        "event_type": event.event_type,
        "changes": _event_changes(db, event),
    })
    return payload


def frozen_manual_summary_payload(db: Session, case: VisaCase) -> dict:
    payload = safe_current_case_payload(db, case)
    payload.update({
        "notification_type": "STATUS_SUMMARY_MANUAL",
        "event_type": "MANUAL_STATUS_SUMMARY",
        "changes": [],
    })
    return payload


def safe_error_label(delivery: VisaNotificationDelivery, locale: str) -> str | None:
    language = locale if locale in {"ru", "en"} else "ru"
    if delivery.state == "UNKNOWN":
        return {
            "ru": "Результат отправки не подтверждён — требуется ручная проверка.",
            "en": "Delivery outcome is unconfirmed and requires manual review.",
        }[language]
    if delivery.state == "FAILED":
        if delivery.last_error_code in RETRYABLE_PRE_SEND_ERROR_CODES:
            return {
                "ru": "Сообщение не отправлялось: подтверждён технический сбой до отправки.",
                "en": "The message was not sent: a pre-send technical failure was confirmed.",
            }[language]
        return {
            "ru": "Сообщение не доставлено. Повтор без проверки заблокирован.",
            "en": "The message was not delivered. Blind retry is blocked.",
        }[language]
    return None


def delivery_history_projection(delivery: VisaNotificationDelivery, locale: str) -> dict:
    language = locale if locale in {"ru", "en"} else "ru"
    state_labels = {
        "ru": {
            "PENDING": "Ожидает отправки", "CLAIMED": "Передано на отправку",
            "DELIVERED": "Доставлено", "FAILED": "Не доставлено",
            "UNKNOWN": "Результат не подтверждён", "SUPPRESSED": "Подавлено",
        },
        "en": {
            "PENDING": "Pending", "CLAIMED": "Sending",
            "DELIVERED": "Delivered", "FAILED": "Failed",
            "UNKNOWN": "Outcome unconfirmed", "SUPPRESSED": "Suppressed",
        },
    }
    type_labels = {
        "ru": {
            "CASE_PUBLISHED": "Виза опубликована", "CASE_UPDATED": "Данные визы обновлены",
            "STATUS_SUMMARY_MANUAL": "Ручная сводка по визе",
            "CONTACT_REMINDER": "Напоминание о связи",
            "CONTACT_REMINDER_CLIENT": "Напоминание клиенту о связи",
            "CONTACT_REMINDER_STAFF": "Задача сотруднику связаться с клиентом",
        },
        "en": {
            "CASE_PUBLISHED": "Visa published", "CASE_UPDATED": "Visa details updated",
            "STATUS_SUMMARY_MANUAL": "Manual visa status summary",
            "CONTACT_REMINDER": "Contact reminder",
            "CONTACT_REMINDER_CLIENT": "Client contact reminder",
            "CONTACT_REMINDER_STAFF": "Staff client-contact task",
        },
    }
    audience_labels = {
        "ru": {"client": "Клиент", "staff": "Сотрудник"},
        "en": {"client": "Client", "staff": "Staff"},
    }
    return {
        "delivery_id": delivery.id,
        "audience": delivery.recipient_kind,
        "audience_label": audience_labels[language].get(delivery.recipient_kind, "Получатель" if language == "ru" else "Recipient"),
        "type": delivery.notification_type,
        "type_label": type_labels[language].get(delivery.notification_type, "Системное сообщение" if language == "ru" else "System message"),
        "state": delivery.state,
        "state_label": state_labels[language].get(delivery.state, delivery.state),
        "attempts": delivery.attempts,
        "due_at": _iso(delivery.due_at),
        "created_at": _iso(delivery.created_at),
        "updated_at": _iso(delivery.updated_at),
        "delivered_at": _iso(delivery.delivered_at),
        "error_label": safe_error_label(delivery, language),
        "retry_allowed": delivery.state == "FAILED" and delivery.last_error_code in RETRYABLE_PRE_SEND_ERROR_CODES,
        "manual_review_required": delivery.state == "UNKNOWN",
    }


def retry_failed_delivery(
    db: Session,
    *,
    case: VisaCase,
    delivery_id: int,
    actor: User,
    reason: str,
    idempotency_key: str,
) -> tuple[VisaNotificationDelivery, bool]:
    normalized = _normal(reason)
    lock_notification_idempotency_key(db, "manual-retry", idempotency_key)

    def replay() -> tuple[VisaNotificationDelivery, bool] | None:
        action = db.query(AdminAction).filter(AdminAction.idempotency_key == idempotency_key).first()
        if action is None:
            return None
        if (
            action.admin_user_id != actor.id
            or action.action_type != "VISA_DELIVERY_MANUAL_RETRY"
            or action.entity_type != "visa_notification_delivery"
            or action.entity_id != delivery_id
            or _normal(action.comment or "") != normalized
            or int((action.details or {}).get("visa_case_id") or 0) != case.id
        ):
            raise NotificationSafetyBlocked("Idempotency key belongs to another delivery action")
        delivery = db.get(VisaNotificationDelivery, delivery_id)
        if delivery is None:
            raise NotificationSafetyBlocked("Delivery not found")
        return delivery, True

    existing = replay()
    if existing is not None:
        return existing
    delivery = db.query(VisaNotificationDelivery).filter(
        VisaNotificationDelivery.id == delivery_id,
        VisaNotificationDelivery.visa_case_id == case.id,
    ).with_for_update().first()
    if delivery is None:
        raise NotificationSafetyBlocked("Delivery not found")
    existing = replay()
    if existing is not None:
        return existing
    if delivery.state == "UNKNOWN":
        raise NotificationSafetyBlocked("Unknown delivery outcome requires human review and cannot be retried")
    if delivery.state != "FAILED":
        raise NotificationSafetyBlocked("Only a confirmed pre-send failure can be retried")
    if delivery.last_error_code not in RETRYABLE_PRE_SEND_ERROR_CODES:
        raise NotificationSafetyBlocked("Failure is not confirmed as pre-send retryable")
    if delivery.recipient_kind == "client" and (
        case.publication_status != "PUBLISHED" or not case.notifications_enabled
    ):
        raise NotificationSafetyBlocked("Current client notification consent does not allow retry")
    previous_error = delivery.last_error_code
    current = datetime.now(timezone.utc)
    delivery.state = "PENDING"
    delivery.due_at = current
    delivery.next_attempt_at = None
    delivery.lease_token = None
    delivery.lease_expires_at = None
    delivery.last_error_code = None
    delivery.updated_at = current
    db.add(AdminAction(
        admin_user_id=actor.id,
        action_type="VISA_DELIVERY_MANUAL_RETRY",
        entity_type="visa_notification_delivery",
        entity_id=delivery.id,
        comment=normalized,
        idempotency_key=idempotency_key,
        details={
            "visa_case_id": case.id,
            "notification_type": delivery.notification_type,
            "previous_error_class": "confirmed_pre_send",
            "previous_error_code": previous_error,
        },
    ))
    db.flush()
    return delivery, False


def message_catalogue() -> list[dict]:
    asynchronous = {
        "queue": "backend_outbox",
        "delivery": "asynchronous_not_guaranteed",
        "unknown_policy": "human_review_only_no_automatic_retry",
    }
    return [
        {
            "code": "CASE_PUBLISHED", "trigger": "explicit_publish_with_notify",
            "audience": ["client"], "channel": "telegram",
            "consent": "requires_case_notifications_enabled",
            "preview": {"ru": "Ваша виза опубликована. Откройте «Мои визы», чтобы увидеть актуальные данные.", "en": "Your visa has been published. Open My visas to see the current details."},
            "current_truth": asynchronous,
        },
        {
            "code": "CASE_UPDATED", "trigger": "explicit_save_and_notify",
            "audience": ["client"], "channel": "telegram",
            "consent": "requires_case_notifications_enabled",
            "preview": {"ru": "Данные по вашей визе обновлены. В сообщении перечислены только изменённые статусы и даты.", "en": "Your visa details were updated. The message lists only changed statuses and dates."},
            "current_truth": asynchronous,
        },
        {
            "code": "STATUS_SUMMARY_MANUAL", "trigger": "root_admin_confirmed_manual_action",
            "audience": ["client"], "channel": "telegram",
            "consent": "requires_case_notifications_enabled",
            "preview": {"ru": "Актуальная сводка по вашей визе: статус и подтверждённые даты.", "en": "Current visa summary: status and confirmed dates."},
            "current_truth": asynchronous,
        },
        {
            "code": "CONTACT_REMINDER_CLIENT", "trigger": "due_versioned_contact_plan",
            "audience": ["client"], "channel": "telegram",
            "consent": "requires_case_notifications_enabled",
            "preview": {"ru": "Рекомендуем связаться с менеджером в связи с ближайшим действием по визе.", "en": "We recommend contacting your manager about an upcoming visa action."},
            "current_truth": asynchronous,
        },
        {
            "code": "CONTACT_REMINDER_STAFF", "trigger": "due_versioned_contact_plan",
            "audience": ["assigned_staff", "root_admin"], "channel": "telegram",
            "consent": "staff_delivery_is_independent_from_client_notification_consent",
            "preview": {"ru": "Нужно связаться с назначенным клиентом по ближайшему действию по визе.", "en": "Contact the assigned client about an upcoming visa action."},
            "current_truth": asynchronous,
        },
    ]
