from __future__ import annotations

import base64
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaEvent, VisaNotificationDelivery


SERVICE_STATUSES = {
    "PURCHASED", "DOCUMENTS_REQUIRED", "DOCUMENTS_RECEIVED", "SUBMITTED",
    "WAITING_PAYMENT", "PAID", "PROCESSING", "ACTION_REQUIRED", "COMPLETED", "CANCELLED",
}
LIFECYCLE_STATUSES = {
    "NOT_ISSUED", "ISSUED_NOT_ACTIVATED", "ACTIVE", "EXPIRING",
    "EXTENSION_PROCESSING", "EXTENDED", "EXPIRED", "CANCELLED", "REFUSED",
}
EXTERNAL_STATUSES = {
    "UNKNOWN", "WAITING_PAYMENT", "PAID", "SUBMITTED", "PROCESSING",
    "ACTION_REQUIRED", "BIOMETRICS_REQUIRED", "APPROVED", "REJECTED", "CANCELLED",
}


class VisaLifecycleError(ValueError):
    pass


class PIIConfigurationError(RuntimeError):
    pass


class PIIEnvelopeCipher:
    """Versioned AES-GCM envelope. Configuration absence is fail-closed."""

    def __init__(self, keys: dict[str, bytes], active_version: str):
        if active_version not in keys:
            raise PIIConfigurationError("Active visa PII key version is unavailable")
        if any(len(value) != 32 for value in keys.values()):
            raise PIIConfigurationError("Visa PII keys must decode to 32 bytes")
        self.keys = keys
        self.active_version = active_version

    @classmethod
    def from_settings(cls) -> "PIIEnvelopeCipher":
        try:
            raw = json.loads(settings.VISA_PII_KEYS or "{}")
            keys = {
                version: base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
                for version, encoded in raw.items()
            }
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            raise PIIConfigurationError("Visa PII key configuration is invalid") from exc
        return cls(keys, settings.VISA_PII_KEY_VERSION)

    def encrypt(self, value: str, *, context: str) -> bytes:
        return self.encrypt_bytes(value.encode("utf-8"), context=context)

    def encrypt_bytes(self, value: bytes, *, context: str) -> bytes:
        nonce = secrets.token_bytes(12)
        ciphertext = AESGCM(self.keys[self.active_version]).encrypt(
            nonce, value, context.encode("utf-8")
        )
        return json.dumps(
            {
                "v": self.active_version,
                "n": base64.urlsafe_b64encode(nonce).decode().rstrip("="),
                "c": base64.urlsafe_b64encode(ciphertext).decode().rstrip("="),
            },
            separators=(",", ":"),
        ).encode()

    def decrypt(self, envelope: bytes, *, context: str) -> str:
        return self.decrypt_bytes(envelope, context=context).decode("utf-8")

    def decrypt_bytes(self, envelope: bytes, *, context: str) -> bytes:
        try:
            data = json.loads(envelope)
            version = data["v"]
            key = self.keys[version]
            nonce = base64.urlsafe_b64decode(data["n"] + "=" * (-len(data["n"]) % 4))
            ciphertext = base64.urlsafe_b64decode(data["c"] + "=" * (-len(data["c"]) % 4))
            return AESGCM(key).decrypt(nonce, ciphertext, context.encode())
        except Exception as exc:
            raise PIIConfigurationError("Visa PII envelope cannot be decrypted") from exc


def mask_identifier(value: str) -> str:
    normalized = "".join(character for character in value.strip() if character.isalnum())
    return "••••" + normalized[-4:] if normalized else "••••"


def ensure_feature_enabled() -> None:
    if not (
        settings.VISA_LIFECYCLE_ENABLED
        and settings.CLIENT_CABINET_ENABLED
        and settings.ADMIN_CLIENT_CRM_ENABLED
    ):
        raise VisaLifecycleError("Visa lifecycle is disabled")
    if settings.VISA_EXTERNAL_TRACKER_ENABLED or settings.VISA_AI_IMPORT_ENABLED:
        raise VisaLifecycleError("Deferred visa automation must remain disabled in Stage 1")


def validate_dates(case: VisaCase) -> None:
    if case.issued_on and case.entry_deadline and case.entry_deadline < case.issued_on:
        raise VisaLifecycleError("Entry deadline precedes issue date")
    if case.entered_on and case.stay_end and case.stay_end < case.entered_on:
        raise VisaLifecycleError("Stay end precedes entry date")
    if case.extension_window_start and case.stay_end and case.extension_window_start > case.stay_end:
        raise VisaLifecycleError("Extension window starts after stay end")
    if case.expected_stay_end and case.stay_end and case.expected_stay_end <= case.stay_end:
        raise VisaLifecycleError("Expected stay end must be later than current stay end")
    if case.extension_available is True and not case.extension_days:
        raise VisaLifecycleError("Extension duration is required when extension is available")
    legal_dates = (case.entry_deadline, case.stay_end, case.extension_window_start)
    if any(legal_dates) and not (
        case.date_source and case.dates_confirmed_by and case.dates_confirmed_at
    ):
        raise VisaLifecycleError("Legal dates require source and administrator confirmation")


def append_event(
    db: Session,
    case: VisaCase,
    *,
    event_type: str,
    source: str,
    actor_user_id: int | None,
    before: dict | None = None,
    after: dict | None = None,
    reason: str | None = None,
    idempotency_key: str | None = None,
    visibility: str = "INTERNAL",
    public_title: str | None = None,
    public_description: str | None = None,
) -> VisaEvent:
    if idempotency_key:
        existing = db.query(VisaEvent).filter(VisaEvent.idempotency_key == idempotency_key).first()
        if existing:
            return existing
    event = VisaEvent(
        visa_case_id=case.id,
        actor_user_id=actor_user_id,
        event_type=event_type,
        source=source,
        before=before,
        after=after,
        reason=reason,
        idempotency_key=idempotency_key,
        visibility=visibility,
        public_title=public_title,
        public_description=public_description,
    )
    if not idempotency_key:
        db.add(event); db.flush(); return event
    try:
        with db.begin_nested():
            db.add(event)
            db.flush()
        return event
    except IntegrityError:
        existing = db.query(VisaEvent).filter(VisaEvent.idempotency_key == idempotency_key).first()
        if not existing:
            raise
        return existing


def enqueue_delivery(db: Session, **values) -> VisaNotificationDelivery:
    dedupe_key = values["dedupe_key"]
    existing = db.query(VisaNotificationDelivery).filter_by(dedupe_key=dedupe_key).first()
    if existing:
        return existing
    row = VisaNotificationDelivery(**values)
    try:
        with db.begin_nested():
            db.add(row); db.flush()
        return row
    except IntegrityError:
        existing = db.query(VisaNotificationDelivery).filter_by(dedupe_key=dedupe_key).first()
        if not existing:
            raise
        return existing


@dataclass(frozen=True)
class ClaimedDelivery:
    id: int
    lease_token: str
    recipient_user_id: int
    locale: str
    notification_type: str
    payload: dict


def claim_deliveries(db: Session, *, limit: int = 50, now: datetime | None = None) -> list[ClaimedDelivery]:
    current = now or datetime.now(timezone.utc)
    rows = (
        db.query(VisaNotificationDelivery)
        .filter(
            VisaNotificationDelivery.due_at <= current,
            or_(
                VisaNotificationDelivery.state == "PENDING",
                (VisaNotificationDelivery.state == "CLAIMED")
                & (VisaNotificationDelivery.lease_expires_at < current),
            ),
            or_(
                VisaNotificationDelivery.next_attempt_at.is_(None),
                VisaNotificationDelivery.next_attempt_at <= current,
            ),
        )
        .order_by(VisaNotificationDelivery.due_at, VisaNotificationDelivery.id)
        .with_for_update(skip_locked=True)
        .limit(max(1, min(limit, 100)))
        .all()
    )
    result = []
    for row in rows:
        lease = secrets.token_hex(16)
        row.state = "CLAIMED"
        row.lease_token = lease
        row.lease_expires_at = current + timedelta(minutes=5)
        row.attempts += 1
        row.updated_at = current
        result.append(ClaimedDelivery(row.id, lease, row.recipient_user_id, row.locale, row.notification_type, row.payload))
    db.commit()
    return result


def settle_delivery(
    db: Session,
    delivery_id: int,
    lease_token: str,
    *,
    state: str,
    telegram_message_id: str | None = None,
    error_code: str | None = None,
) -> VisaNotificationDelivery:
    if state not in {"DELIVERED", "FAILED", "UNKNOWN"}:
        raise VisaLifecycleError("Invalid terminal delivery state")
    row = db.query(VisaNotificationDelivery).filter(
        VisaNotificationDelivery.id == delivery_id,
        VisaNotificationDelivery.state == "CLAIMED",
        VisaNotificationDelivery.lease_token == lease_token,
    ).with_for_update().first()
    if not row:
        raise VisaLifecycleError("Delivery lease is stale")
    current = datetime.now(timezone.utc)
    row.state = state
    row.telegram_message_id = telegram_message_id
    row.last_error_code = error_code
    row.delivered_at = current if state == "DELIVERED" else None
    row.lease_token = None
    row.lease_expires_at = None
    row.updated_at = current
    db.commit()
    return row
