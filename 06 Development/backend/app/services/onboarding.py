"""Transactional scheduling. An uncertain Telegram result is never retried blindly."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import secrets
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.onboarding import OnboardingState, OnboardingVersion, OnboardingEnrollment, OnboardingDelivery
from app.models.user import User
from app.models.bot_messaging import BotCampaign, BotCampaignRecipient, BotContact
from app.core.config import settings

BOT_STATE_IDS = {"safrway": 1, "yoga": 2}
BOT_LOCK_IDS = {"safrway": 7_409_401, "yoga": 7_409_402}


def validate_bot_key(bot_key):
    if bot_key not in BOT_STATE_IDS:
        raise ValueError("Unsupported messaging bot")
    return bot_key


def bot_transaction_lock(db, bot_key):
    """Messaging writers acquire this before User/contact/policy/campaign locks."""
    validate_bot_key(bot_key)
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT set_config('lock_timeout','2s',true)"))
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": BOT_LOCK_IDS[bot_key]})


def content_for_locale(content, locale):
    if locale not in {"ru", "en"}:
        raise ValueError("Unsupported welcome language")
    if "locales" in content:
        localized = content["locales"].get(locale)
        if not isinstance(localized, dict):
            raise ValueError("Welcome translation is unavailable")
        return localized
    if locale != "ru":
        raise ValueError("Welcome translation is unavailable")
    return content


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
        content = content_for_locale(content, "ru")
        parts = split_welcome(content["welcome_text"])
        question = content["followup_text"]
        if not question.strip() or len(question.encode("utf-16-le")) // 2 > 4096:
            raise ValueError("Question must fit into one Telegram message")
        return {"valid": True, "parts": parts, "followup_text": question, "error": None}
    except (ValueError, KeyError, TypeError) as exc:
        return {"valid": False, "parts": [], "followup_text": content.get("followup_text", ""), "error": str(exc)}


def state(db, bot_key="safrway"):
    return db.query(OnboardingState).filter_by(id=BOT_STATE_IDS[validate_bot_key(bot_key)]).with_for_update().one()


def seed_draft():
    root = Path(__file__).resolve().parents[1] / "data"
    return {"welcome_text": (root / "onboarding_welcome.ru.txt").read_text(),
            "followup_text": (root / "onboarding_followup.ru.txt").read_text().rstrip("\n")}


def projection(db, row):
    bot_key = next(key for key, value in BOT_STATE_IDS.items() if value == row.id)
    versions = db.query(OnboardingVersion).filter_by(bot_key=bot_key).order_by(OnboardingVersion.version.desc()).all()
    return {"enabled": row.enabled, "revision": row.revision, "activation_cutoff": row.activation_cutoff,
            "published_version": row.published_version, "draft": row.draft, "preview": preview(row.draft),
            "versions": [{"version": v.version, **v.content, "created_at": v.created_at,
                          "restored_from_version": v.restored_from_version} for v in versions],
            "support_reply_gate": "scoped_help_request_only"}


def enroll(db, user, *, event, occurred_at, verified_new, now=None):
    """Only invoked from the new Telegram-user insert, never imports or existing users."""
    # Branded messaging enrolls from verified per-bot contact, after the locale
    # is selected. Do not reserve a default-RU slot during canonical registration.
    if settings.BOT_MESSAGING_ENABLED:
        return None
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


def claim(db, now=None, *, bot_key="safrway"):
    current = utc(now)
    bot_transaction_lock(db, bot_key)
    config = state(db, bot_key)
    expired = db.query(OnboardingDelivery).join(OnboardingEnrollment).filter(OnboardingEnrollment.bot_key == bot_key, OnboardingDelivery.state == "CLAIMED",
        OnboardingDelivery.lease_expires_at <= current).with_for_update().all()
    for item in expired:
        item.state = "UNKNOWN"
        item.error_code = "AMBIGUOUS_DELIVERY"
    if config.transport_not_before and utc(config.transport_not_before) > current:
        return []
    # One item per poll avoids a batch exceeding the delivery lease.
    pending = db.query(OnboardingDelivery).join(OnboardingEnrollment).filter(OnboardingEnrollment.bot_key == bot_key, OnboardingDelivery.state == "PENDING",
        OnboardingDelivery.due_at <= current)
    if not config.enabled:
        pending = pending.filter(OnboardingDelivery.step == "help")
    item = pending.order_by(OnboardingDelivery.due_at, OnboardingDelivery.id).with_for_update(skip_locked=True).first()
    if not item:
        return []
    enrollment = db.get(OnboardingEnrollment, item.enrollment_id)
    if item.step != "help" and not chain_is_active(db, enrollment, config):
        item.state, item.error_code = "SUPPRESSED", "WELCOME_CHAIN_CANCELLED"
        return []
    user = db.get(User, enrollment.user_id)
    if item.step == "help":
        recipient = db.query(User).filter_by(telegram_id=int(item.telegram_id), status="active").first()
        if recipient is None or int(item.telegram_id) not in {settings.DEFAULT_ADMIN_TELEGRAM_ID, *settings.support_chat_ids}:
            item.state = "SUPPRESSED"
            return []
    contact = db.query(BotContact).filter_by(user_id=user.id, bot_key=bot_key).first()
    reachable = contact.status == "active" if contact is not None else bot_key == "safrway" and user.bot_status == "active"
    if not reachable and contact is not None and bot_key == "safrway" and user.bot_status == "active":
        approved = db.query(BotCampaignRecipient).join(BotCampaign).filter(
            BotCampaignRecipient.enrollment_id == enrollment.id, BotCampaignRecipient.state == "ENROLLED",
            BotCampaign.bot_key == "safrway", BotCampaign.kind == "welcome_backfill", BotCampaign.state == "QUEUED").first()
        campaign = db.get(BotCampaign, approved.campaign_id) if approved else None
        reachable = (enrollment.origin == "backfill" and campaign is not None
            and campaign.audience.get("legacy_main_once") is True and campaign.audience.get("confirmed_legacy_main_once") is True and contact.status == "unknown"
            and contact.source == "legacy_main_registration" and contact.first_contact_at is None
            and not contact.announcements_opted_out)
    if user.status != "active" or (item.step.startswith("welcome") or item.step == "followup") and not reachable:
        item.state = "SUPPRESSED"
        return []
    if item.step == "welcome_1" and enrollment.content_version is None:
        enrollment.content_version = config.published_version
        version = db.get(OnboardingVersion, enrollment.content_version)
        try:
            if version is None or version.bot_key != bot_key:
                raise ValueError("Welcome belongs to another bot")
            localized = content_for_locale(version.content, enrollment.locale)
            item.payload = {"text": split_welcome(localized["welcome_text"])[0]}
        except (ValueError, KeyError):
            item.state, item.error_code = "SUPPRESSED", "TRANSLATION_UNAVAILABLE"
            return []
    item.state = "CLAIMED"
    item.attempts += 1
    item.lease_token = secrets.token_hex(16)
    item.lease_expires_at = current + timedelta(minutes=2)
    return [{"id": item.id, "enrollment_id": enrollment.id, "step": item.step,
             "telegram_id": int(item.telegram_id), "lease_token": item.lease_token,
             "lease_expires_at": item.lease_expires_at.isoformat(),
             "bot_key": bot_key, "locale": enrollment.locale, **item.payload}]


def chain_is_active(db, enrollment, config):
    if not config.enabled or config.activation_cutoff is None or utc(enrollment.activation_cutoff) != utc(config.activation_cutoff):
        return False
    return not (enrollment.origin == "backfill" and db.query(BotCampaignRecipient.id).join(
        BotCampaign, BotCampaign.id == BotCampaignRecipient.campaign_id).filter(
        BotCampaignRecipient.enrollment_id == enrollment.id, BotCampaign.state == "CANCELLED").first())


def settle(db, delivery_id, token, outcome, message_id=None, error_code=None, now=None, confirmed_at=None, *, bot_key="safrway", retry_after_seconds=None, allow_enqueue=True):
    current = utc(now)
    bot_transaction_lock(db, bot_key)
    config = state(db, bot_key)
    item = db.query(OnboardingDelivery).join(OnboardingEnrollment).filter(
        OnboardingDelivery.id == delivery_id, OnboardingEnrollment.bot_key == bot_key).with_for_update().one_or_none()
    if item is None or item.lease_token != token:
        raise ValueError("Stale delivery lease")
    if outcome == "RETRY" and item.state in {"PENDING", "FAILED", "SUPPRESSED"} and item.error_code == "TELEGRAM_RETRY_AFTER":
        return item
    rate_limited = (outcome == "RETRY" and error_code == "TELEGRAM_RETRY_AFTER"
        and type(retry_after_seconds) is int and 1 <= retry_after_seconds <= 86400)
    expired_positive_receipt = (
        item.state == "UNKNOWN" and item.error_code == "AMBIGUOUS_DELIVERY"
        and outcome == "DELIVERED" and bool(message_id) and confirmed_at is not None
    )
    expired_negative_receipt = item.state == "UNKNOWN" and item.error_code == "AMBIGUOUS_DELIVERY" and rate_limited
    if item.state != "CLAIMED" and not expired_positive_receipt and not expired_negative_receipt:
        if item.state == outcome and item.telegram_message_id == message_id:
            return item
        raise ValueError("Delivery already settled")
    if rate_limited:
        resume_at = current + timedelta(seconds=retry_after_seconds)
        if config.transport_not_before is None or utc(config.transport_not_before) < resume_at:
            config.transport_not_before = resume_at
        enrollment = db.get(OnboardingEnrollment, item.enrollment_id)
        active = allow_enqueue and (item.step == "help" or chain_is_active(db, enrollment, config))
        item.state = ("PENDING" if item.attempts < 3 else "FAILED") if active else "SUPPRESSED"
        item.error_code, item.due_at, item.lease_expires_at = error_code, resume_at, None
        return item
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
    if outcome == "FAILED" and error_code == "recipient_blocked" and item.step != "help":
        enrollment = db.get(OnboardingEnrollment, item.enrollment_id)
        contact = db.query(BotContact).filter_by(user_id=enrollment.user_id, bot_key=bot_key).first()
        if contact is not None:
            contact.status = "blocked"
    if outcome != "DELIVERED" or not allow_enqueue or not config.enabled or not item.step.startswith("welcome"):
        return item
    enrollment = db.get(OnboardingEnrollment, item.enrollment_id)
    # A cancelled backfill or disable/re-enable epoch never revives an old chain.
    if not chain_is_active(db, enrollment, config):
        return item
    version = db.get(OnboardingVersion, enrollment.content_version)
    if version is None or version.bot_key != bot_key:
        raise ValueError("Welcome belongs to another bot")
    localized = content_for_locale(version.content, enrollment.locale)
    parts = split_welcome(localized["welcome_text"])
    second = item.step == "welcome_1" and len(parts) == 2
    if not second and not enrollment.followup_enabled:
        return item
    db.add(OnboardingDelivery(enrollment_id=enrollment.id,
        step="welcome_2" if second else "followup", telegram_id=item.telegram_id,
        due_at=current if second else delivery_time + timedelta(hours=1), state="PENDING",
        payload={"text": parts[1] if second else localized["followup_text"]}))
    return item


def request_help(db, enrollment_id, telegram_id, recipients, now=None, *, bot_key="safrway"):
    enrollment = db.query(OnboardingEnrollment).filter_by(id=enrollment_id, bot_key=bot_key).with_for_update().one_or_none()
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


def can_reply(db, enrollment_id, recipient, *, bot_key="safrway"):
    return db.query(OnboardingDelivery).join(OnboardingEnrollment).filter(
        OnboardingEnrollment.bot_key == bot_key, OnboardingDelivery.enrollment_id == enrollment_id,
        OnboardingDelivery.step == "help", OnboardingDelivery.telegram_id == str(recipient)).first() is not None


def enroll_contact(db, user, *, bot_key, locale, event, occurred_at, origin="first_contact",
                   followup=True, now=None, expected_version=None):
    """One welcome per user+bot, shared by first contact and explicit catch-up.

    The caller verifies the private Telegram contact and holds its contact row.
    Catch-up names its real origin; it never fabricates a new registration.
    """
    validate_bot_key(bot_key)
    bot_transaction_lock(db, bot_key)
    if origin not in {"first_contact", "backfill"} or locale not in {"ru", "en"}:
        raise ValueError("Invalid welcome enrollment context")
    config = state(db, bot_key)
    if not config.enabled or not config.published_version or config.activation_cutoff is None:
        return None
    if expected_version is not None and config.published_version != expected_version:
        raise ValueError("Welcome version changed")
    version = db.get(OnboardingVersion, config.published_version)
    if version is None or version.bot_key != bot_key:
        raise ValueError("Welcome version belongs to another bot")
    localized = content_for_locale(version.content, locale)
    check = preview(localized)
    if not check["valid"]:
        raise ValueError("Welcome content is invalid")
    current, occurred = utc(now), utc(occurred_at)
    if occurred > current + timedelta(seconds=30):
        raise ValueError("Contact timestamp is in the future")
    if origin == "first_contact" and current < utc(config.activation_cutoff):
        return None
    if db.query(OnboardingEnrollment.id).filter_by(user_id=user.id, bot_key=bot_key).first():
        return None
    enrollment = OnboardingEnrollment(user_id=user.id, bot_key=bot_key, locale=locale,
        origin=origin, followup_enabled=followup, registration_event=f"{bot_key}:{event}",
        registered_at=occurred, activation_cutoff=config.activation_cutoff,
        content_version=version.version)
    try:
        with db.begin_nested():
            db.add(enrollment)
            db.flush()
            db.add(OnboardingDelivery(enrollment_id=enrollment.id, step="welcome_1",
                telegram_id=str(user.telegram_id), due_at=current if origin == "backfill" else current + timedelta(minutes=15),
                state="PENDING", payload={"text": check["parts"][0]}))
            db.flush()
    except IntegrityError:
        if not db.query(OnboardingEnrollment.id).filter_by(user_id=user.id, bot_key=bot_key).first():
            raise
        return None
    return enrollment
