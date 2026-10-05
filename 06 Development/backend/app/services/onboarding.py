"""Transactional scheduling. An uncertain Telegram result is never retried blindly."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import secrets

from app.models.onboarding import OnboardingState, OnboardingVersion, OnboardingEnrollment, OnboardingDelivery
from app.models.user import User
from app.core.config import settings


def utc(value=None):
    value = value or datetime.now(timezone.utc)
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def split_welcome(text):
    # Conservative UTF-16 count also covers astral emoji in Telegram entities.
    def size(value):
        return len(value.encode("utf-16-le")) // 2
    if not text.strip():
        raise ValueError("Welcome text is required")
    if size(text) <= 4096:
        return [text]
    boundaries = [i + 2 for i in range(len(text) - 1) if text[i:i + 2] == "\n\n"]
    valid = [boundary for boundary in boundaries
             if size(text[:boundary]) <= 4096 and size(text[boundary:]) <= 4096]
    headings = [boundary for boundary in valid
                if text[boundary:].startswith(("📱", "🏝", "🛠", "👤", "🌍", "💬"))]
    if valid:
        boundary = min(headings or valid, key=lambda point: abs(size(text[:point]) - size(text[point:])))
        return [text[:boundary], text[boundary:]]
    raise ValueError("Welcome must fit into at most two Telegram messages, split at a paragraph boundary")


def preview(content):
    try:
        parts = split_welcome(content["welcome_text"])
        question = content["followup_text"]
        if not question.strip() or len(question.encode("utf-16-le")) // 2 > 4096:
            raise ValueError("Question must fit into one Telegram message")
        return {"valid": True, "parts": parts, "followup_text": question, "error": None}
    except ValueError as exc:
        return {"valid": False, "parts": [], "followup_text": content.get("followup_text", ""), "error": str(exc)}


def state(db):
    return db.query(OnboardingState).filter_by(id=1).with_for_update().one()


def seed_draft():
    root = Path(__file__).resolve().parents[1] / "data"
    return {"welcome_text": (root / "onboarding_welcome.ru.txt").read_text(),
            "followup_text": (root / "onboarding_followup.ru.txt").read_text().rstrip("\n")}


def projection(db, row):
    versions = db.query(OnboardingVersion).order_by(OnboardingVersion.version.desc()).all()
    return {"enabled": row.enabled, "revision": row.revision, "activation_cutoff": row.activation_cutoff,
            "published_version": row.published_version, "draft": row.draft, "preview": preview(row.draft),
            "versions": [{"version": v.version, **v.content, "created_at": v.created_at,
                          "restored_from_version": v.restored_from_version} for v in versions],
            "support_reply_gate": "scoped_help_request_only"}


def enroll(db, user, *, event, occurred_at, verified_new, now=None):
    """Only invoked from the new Telegram-user insert, never imports or existing users."""
    row = state(db)
    current = utc(now)
    if not row.enabled or not row.published_version or not verified_new or not event or not occurred_at:
        return None
    if occurred_at.tzinfo is None or not event.startswith(f"telegram-start:{user.telegram_id}:"):
        return None
    occurred_at = utc(occurred_at)
    if occurred_at < utc(row.activation_cutoff) or occurred_at > current + timedelta(seconds=30):
        return None
    enrollment = OnboardingEnrollment(user_id=user.id, registration_event=event,
        registered_at=occurred_at, activation_cutoff=row.activation_cutoff)
    db.add(enrollment)
    db.flush()
    db.add(OnboardingDelivery(enrollment_id=enrollment.id, step="welcome_1", telegram_id=str(user.telegram_id),
        due_at=occurred_at + timedelta(minutes=15), state="PENDING", payload={}))
    return enrollment


def claim(db, now=None):
    current = utc(now)
    config = state(db)
    expired = db.query(OnboardingDelivery).filter(OnboardingDelivery.state == "CLAIMED",
        OnboardingDelivery.lease_expires_at <= current).with_for_update().all()
    for item in expired:
        item.state = "UNKNOWN"
        item.error_code = "AMBIGUOUS_DELIVERY"
    if not config.enabled:
        return []
    # One item per poll avoids a batch exceeding the delivery lease.
    item = db.query(OnboardingDelivery).filter(OnboardingDelivery.state == "PENDING",
        OnboardingDelivery.due_at <= current).order_by(OnboardingDelivery.due_at, OnboardingDelivery.id).with_for_update(skip_locked=True).first()
    if not item:
        return []
    enrollment = db.get(OnboardingEnrollment, item.enrollment_id)
    user = db.get(User, enrollment.user_id)
    if item.step == "help":
        recipient = db.query(User).filter_by(telegram_id=int(item.telegram_id), status="active").first()
        if recipient is None or int(item.telegram_id) not in {settings.DEFAULT_ADMIN_TELEGRAM_ID, *settings.support_chat_ids}:
            item.state = "SUPPRESSED"
            return []
    if user.status != "active" or (item.step.startswith("welcome") or item.step == "followup") and user.bot_status != "active":
        item.state = "SUPPRESSED"
        return []
    if item.step == "welcome_1" and enrollment.content_version is None:
        enrollment.content_version = config.published_version
        version = db.get(OnboardingVersion, enrollment.content_version)
        item.payload = {"text": split_welcome(version.content["welcome_text"])[0]}
    item.state = "CLAIMED"
    item.lease_token = secrets.token_hex(16)
    item.lease_expires_at = current + timedelta(minutes=2)
    return [{"id": item.id, "enrollment_id": enrollment.id, "step": item.step,
             "telegram_id": int(item.telegram_id), "lease_token": item.lease_token, **item.payload}]


def settle(db, delivery_id, token, outcome, message_id=None, error_code=None, now=None, confirmed_at=None):
    current = utc(now)
    config = state(db)
    item = db.query(OnboardingDelivery).filter_by(id=delivery_id).with_for_update().one_or_none()
    if item is None or item.lease_token != token:
        raise ValueError("Stale delivery lease")
    expired_positive_receipt = (
        item.state == "UNKNOWN" and item.error_code == "AMBIGUOUS_DELIVERY"
        and outcome == "DELIVERED" and bool(message_id) and confirmed_at is not None
    )
    if item.state != "CLAIMED" and not expired_positive_receipt:
        if item.state == outcome and item.telegram_message_id == message_id:
            return item
        raise ValueError("Delivery already settled")
    if outcome not in {"DELIVERED", "FAILED", "UNKNOWN"}:
        raise ValueError("Invalid settlement")
    if outcome == "DELIVERED" and not message_id:
        raise ValueError("Confirmed Telegram message ID is required")
    delivery_time = utc(confirmed_at) if confirmed_at is not None else current
    if outcome == "DELIVERED" and (delivery_time > current + timedelta(seconds=30)
            or delivery_time < utc(item.due_at) - timedelta(seconds=1)):
        raise ValueError("Invalid confirmed delivery timestamp")
    item.state, item.telegram_message_id, item.error_code = outcome, message_id, error_code
    item.delivered_at = delivery_time if outcome == "DELIVERED" else None
    if outcome != "DELIVERED" or not config.enabled or not item.step.startswith("welcome"):
        return item
    enrollment = db.get(OnboardingEnrollment, item.enrollment_id)
    # A disable/re-enable epoch never revives an old chain.
    if utc(enrollment.activation_cutoff) != utc(config.activation_cutoff):
        return item
    version = db.get(OnboardingVersion, enrollment.content_version)
    parts = split_welcome(version.content["welcome_text"])
    second = item.step == "welcome_1" and len(parts) == 2
    db.add(OnboardingDelivery(enrollment_id=enrollment.id,
        step="welcome_2" if second else "followup", telegram_id=item.telegram_id,
        due_at=current if second else delivery_time + timedelta(hours=1), state="PENDING",
        payload={"text": parts[1] if second else version.content["followup_text"]}))
    return item


def request_help(db, enrollment_id, telegram_id, recipients, now=None):
    enrollment = db.query(OnboardingEnrollment).filter_by(id=enrollment_id).with_for_update().one_or_none()
    if not enrollment or db.get(User, enrollment.user_id).telegram_id != telegram_id:
        raise ValueError("This request does not belong to this Telegram user")
    followup = db.query(OnboardingDelivery).filter_by(enrollment_id=enrollment_id, step="followup", state="DELIVERED").first()
    if not followup:
        raise ValueError("Follow-up has not been delivered")
    if enrollment.help_requested_at:
        return {"accepted": True, "replay": True}
    enrollment.help_requested_at = utc(now)
    for recipient in set(recipients):
        db.add(OnboardingDelivery(enrollment_id=enrollment.id, step="help", telegram_id=str(recipient),
            due_at=utc(now), state="PENDING", payload={"client_telegram_id": telegram_id,
                "text": f"Пользователь {telegram_id} нажал кнопку приветствия и просит связи.\nTelegram: tg://user?id={telegram_id}"}))
    return {"accepted": True, "replay": False}


def can_reply(db, enrollment_id, recipient):
    return db.query(OnboardingDelivery).filter_by(enrollment_id=enrollment_id, step="help",
        telegram_id=str(recipient)).first() is not None
