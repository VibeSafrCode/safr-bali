"""Reviewed audience snapshots and one contact identity per user and bot.

No Telegram calls occur here. The caller owns commit/rollback and transport
authentication. The old welcome ledger remains the authority for welcome dedup.
"""
import hashlib
import json
import secrets
from datetime import datetime, timedelta


from app.models.admin_action import AdminAction
from app.models.bot_messaging import BotCampaign, BotCampaignRecipient, BotContact
from app.models.onboarding import OnboardingDelivery, OnboardingEnrollment, OnboardingVersion
from app.models.user import User
from app.services.admin_user_selection import select_users
from app.services.bot_contact_inventory import main_legacy_snapshot
from app.services import onboarding
from app.services.visa_staff import is_root_admin

MAX_RECIPIENTS = 5000
FILTER_FIELDS = {"q", "joined_from", "joined_to", "has_visas", "visa_expires_within", "service_categories",
                 "never_dialogued", "no_services", "has_services", "service_category"}


class MessagingConflict(ValueError):
    pass


def main_legacy_inventory(db):
    """Registration evidence is NOT a fabricated private Telegram interaction."""
    users = db.query(User).filter(User.status == "active", User.bot_status == "active").order_by(User.id).limit(10001).all()
    if len(users) > 10000: raise MessagingConflict("legacy_inventory_too_large")
    contacts = {row.user_id: row for row in db.query(BotContact).filter_by(bot_key="safrway")}
    return users, main_legacy_snapshot(users, contacts)


def bootstrap_main_legacy(db, *, actor, expected_snapshot_sha256):
    onboarding.bot_transaction_lock(db, "safrway"); _root(db, actor)
    if onboarding.state(db, "safrway").enabled:
        raise MessagingConflict("bootstrap_requires_welcome_off")
    users, inventory = main_legacy_inventory(db)
    if inventory["snapshot_sha256"] != expected_snapshot_sha256:
        raise MessagingConflict("legacy_inventory_changed")
    created = 0
    for user in users:
        if db.query(BotContact.id).filter_by(user_id=user.id, bot_key="safrway").first(): continue
        db.add(BotContact(user_id=user.id, bot_key="safrway", locale=user.locale if user.locale in {"ru", "en"} else "ru",
            status="unknown", source="legacy_main_registration", first_contact_at=None, last_contact_at=None,
            last_event=f"legacy-main-registration:{user.id}"))
        created += 1
    db.add(AdminAction(admin_user_id=actor.id, action_type="BOT_LEGACY_CONTACTS_STAGED", entity_type="onboarding", entity_id=1,
        details={"bot_key": "safrway", "source": "legacy_main_registration", "created_unknown": created,
                 "proof_snapshot_sha256": expected_snapshot_sha256, "sends": 0}))
    db.flush()
    return {**inventory, "created_unknown": created, "sends": 0}


def bootstrap_proven_yoga_contacts(db, *, actor, records, proof_sha256, source, now=None):
    """Private operator gate; input must come from validated on-server evidence.

    No external API accepts an arbitrary caller's private-contact attestation.
    Root's bounded operator validates the existing journal/HMAC or inbound rows.
    """
    onboarding.bot_transaction_lock(db, "yoga"); _root(db, actor)
    if onboarding.state(db, "yoga").enabled:
        raise MessagingConflict("bootstrap_requires_welcome_off")
    if source not in {"legacy_yoga_context", "legacy_yoga_inbound"} or not isinstance(proof_sha256, str) or len(proof_sha256) != 64 or any(c not in "0123456789abcdef" for c in proof_sha256):
        raise MessagingConflict("invalid_yoga_contact_proof")
    if not isinstance(records, list) or len(records) > MAX_RECIPIENTS:
        raise MessagingConflict("invalid_yoga_contact_records")
    seen = set(); created = 0
    for record in records:
        if (not isinstance(record, dict) or set(record) != {"user_id", "locale", "last_contact_at"}
                or type(record["user_id"]) is not int or record["user_id"] <= 0 or record["user_id"] in seen
                or record["locale"] not in {"ru", "en"} or not isinstance(record["last_contact_at"], datetime)
                or record["last_contact_at"].tzinfo is None
                or onboarding.utc(record["last_contact_at"]) > onboarding.utc(now) + timedelta(seconds=30)):
            raise MessagingConflict("invalid_yoga_contact_record")
        seen.add(record["user_id"])
        user = db.query(User).filter_by(id=record["user_id"], status="active").first()
        if user is None: raise MessagingConflict("yoga_proof_account_unavailable")
        if db.query(BotContact.id).filter_by(user_id=user.id, bot_key="yoga").first(): continue
        db.add(BotContact(user_id=user.id, bot_key="yoga", locale=record["locale"], status="active", source=source,
            first_contact_at=None, last_contact_at=record["last_contact_at"], last_event=f"{source}:{proof_sha256}:{user.id}"))
        created += 1
    db.add(AdminAction(admin_user_id=actor.id, action_type="BOT_PROVEN_CONTACTS_IMPORTED", entity_type="onboarding", entity_id=2,
        details={"bot_key": "yoga", "source": source, "created": created, "proof_sha256": proof_sha256,
                 "full_historical_coverage": "NOT_PROVEN", "sends": 0}))
    db.flush()
    return {"created": created, "sends": 0, "full_historical_coverage": "NOT_PROVEN"}


def _root(db, actor):
    # FOR SHARE also allows FK KEY SHARE for registrations under the root.
    user = db.query(User).filter_by(id=actor.id).populate_existing().with_for_update(read=True).first()
    if user is None or not is_root_admin(user):
        raise MessagingConflict("root_admin_required")
    return user


def record_private_contact(db, user, *, bot_key, locale, event, occurred_at, now=None, source="telegram_private_update"):
    """Only an authenticated bot adapter may attest a real private interaction."""
    onboarding.validate_bot_key(bot_key)
    if source not in {"telegram_private_update", "yoga_private_registration"}:
        raise MessagingConflict("invalid_contact_source")
    onboarding.bot_transaction_lock(db, bot_key)
    if locale not in {"ru", "en"} or not isinstance(event, str) or not 1 <= len(event) <= 160:
        raise MessagingConflict("invalid_contact_identity")
    current, occurred = onboarding.utc(now), onboarding.utc(occurred_at)
    if occurred > current + timedelta(seconds=30):
        raise MessagingConflict("future_contact")
    user = db.query(User).filter_by(id=user.id).populate_existing().with_for_update().one()
    if user.status != "active":
        raise MessagingConflict("user_inactive")
    contact = db.query(BotContact).filter_by(user_id=user.id, bot_key=bot_key).with_for_update().first()
    first = contact is None
    first_private_proof = first or (contact.source == "legacy_main_registration" and contact.first_contact_at is None
        and contact.status == "unknown")
    if first:
        contact = BotContact(user_id=user.id, bot_key=bot_key, locale=locale, status="active",
            source=source, first_contact_at=occurred, last_contact_at=occurred, last_event=event)
        db.add(contact)
    else:
        if contact.last_contact_at is None or occurred >= onboarding.utc(contact.last_contact_at):
            contact.locale, contact.status = locale, "active"
            contact.last_contact_at, contact.last_event = occurred, event
        if first_private_proof:
            contact.first_contact_at = occurred
    db.flush()
    # Earlier contacts are not silently recast as new when the policy is enabled.
    if first_private_proof:
        onboarding.enroll_contact(db, user, bot_key=bot_key, locale=locale, event=event,
            occurred_at=occurred, now=current)
    elif contact.locale == locale and contact.last_contact_at is not None and occurred == onboarding.utc(contact.last_contact_at):
        enrollment = db.query(OnboardingEnrollment).filter_by(user_id=user.id, bot_key=bot_key).first()
        if enrollment and enrollment.origin != "backfill" and not db.query(OnboardingDelivery.id).filter(
                OnboardingDelivery.enrollment_id == enrollment.id, OnboardingDelivery.attempts > 0).first():
            # A language selection before the first send changes the entire
            # pending chain, never a partly delivered or reviewed backfill.
            first_part = db.query(OnboardingDelivery).filter_by(enrollment_id=enrollment.id,
                step="welcome_1", state="PENDING").first()
            if first_part is not None and enrollment.locale != locale:
                version = db.get(OnboardingVersion, enrollment.content_version)
                if version is not None:
                    localized = onboarding.content_for_locale(version.content, locale)
                    first_part.payload = {"text": onboarding.split_welcome(localized["welcome_text"])[0]}
                enrollment.locale = locale
    return contact, first_private_proof


def _texts(content, bot_key):
    if not isinstance(content, dict) or set(content) != {"ru", "en"}:
        raise MessagingConflict("both_message_languages_required")
    for locale, value in content.items():
        if not isinstance(value, str) or not value.strip() or len(value.encode("utf-16-le")) // 2 > 4096:
            raise MessagingConflict("announcement_must_fit_one_message")
        if bot_key == "yoga" and "safrway" in value.casefold():
            raise MessagingConflict("wrong_brand_text")
    return dict(content)


def _campaign(db, campaign_id, actor, expected_revision=None):
    bot_key = db.query(BotCampaign.bot_key).filter_by(id=campaign_id).scalar()
    if bot_key is None:
        raise MessagingConflict("campaign_missing")
    onboarding.bot_transaction_lock(db, bot_key)
    _root(db, actor)
    row = db.query(BotCampaign).filter_by(id=campaign_id).populate_existing().with_for_update().one_or_none()
    if row is None:
        raise MessagingConflict("campaign_missing")
    if expected_revision is not None and row.revision != expected_revision:
        raise MessagingConflict("campaign_revision_changed")
    return row


def create_campaign(db, *, actor, bot_key, kind, title, audience, content=None,
                    content_version=None, followup=False, now=None):
    onboarding.validate_bot_key(bot_key)
    onboarding.bot_transaction_lock(db, bot_key)
    _root(db, actor)
    if kind not in {"announcement", "welcome_backfill"} or not isinstance(title, str) or not title.strip() or len(title) > 200:
        raise MessagingConflict("invalid_campaign")
    if not isinstance(audience, dict) or set(audience) - {"filters", "user_ids", "legacy_main_once"}:
        raise MessagingConflict("invalid_audience")
    legacy_once = audience.get("legacy_main_once", False)
    if type(legacy_once) is not bool or legacy_once and (bot_key != "safrway" or kind != "welcome_backfill"):
        raise MessagingConflict("legacy_main_oneoff_welcome_only")
    filters, ids = audience.get("filters", {}), audience.get("user_ids", [])
    if not isinstance(filters, dict) or set(filters) - FILTER_FIELDS or not isinstance(ids, list) or len(ids) > MAX_RECIPIENTS:
        raise MessagingConflict("invalid_audience")
    if any(type(user_id) is not int or user_id <= 0 for user_id in ids):
        raise MessagingConflict("invalid_recipient_id")
    if ids and filters:
        raise MessagingConflict("choose_segments_or_individuals")
    if kind == "announcement":
        content, content_version, followup = _texts(content, bot_key), None, False
    else:
        version = db.get(OnboardingVersion, content_version)
        if version is None or version.bot_key != bot_key:
            raise MessagingConflict("welcome_version_missing_or_wrong_bot")
        for locale in ("ru", "en"):
            if not onboarding.preview(onboarding.content_for_locale(version.content, locale))["valid"]:
                raise MessagingConflict("welcome_content_invalid")
        content = json.loads(json.dumps(version.content))
    row = BotCampaign(bot_key=bot_key, kind=kind, title=title.strip(),
        audience={"filters": filters, "user_ids": sorted(set(ids)), "legacy_main_once": legacy_once}, content=content,
        content_version=content_version, followup_enabled=followup, state="DRAFT", revision=0,
        created_by=actor.id, created_at=onboarding.utc(now))
    db.add(row); db.flush()
    db.add(AdminAction(admin_user_id=actor.id, action_type="BOT_CAMPAIGN_CREATED", entity_type="bot_campaign",
        entity_id=row.id, details={"bot_key": bot_key, "kind": kind}))
    return row


def _audience_contacts(db, row):
    users = select_users(db, **row.audience["filters"]).filter(User.status == "active")
    if row.audience["user_ids"]:
        users = users.filter(User.id.in_(row.audience["user_ids"]))
    reachable = BotContact.status == "active"
    if row.audience.get("legacy_main_once") and row.bot_key == "safrway" and row.kind == "welcome_backfill":
        from sqlalchemy import and_, or_
        legacy = db.query(User.id).filter(User.bot_status == "active", User.status == "active")
        reachable = or_(reachable, and_(BotContact.status == "unknown", BotContact.source == "legacy_main_registration",
            BotContact.first_contact_at.is_(None), BotContact.user_id.in_(legacy)))
    contacts = db.query(BotContact).filter(BotContact.user_id.in_(users.with_entities(User.id)),
        BotContact.bot_key == row.bot_key, reachable)
    if row.kind == "announcement" or row.audience.get("legacy_main_once"):
        contacts = contacts.filter(BotContact.announcements_opted_out.is_(False))
    contacts = contacts.order_by(BotContact.user_id).limit(MAX_RECIPIENTS + 1).all()
    if len(contacts) > MAX_RECIPIENTS:
        raise MessagingConflict("audience_too_large_split_campaign")
    return contacts


def _welcome_policy_binding(policy):
    return {"revision": policy.revision, "enabled": policy.enabled,
        "published_version": policy.published_version,
        "activation_cutoff": onboarding.utc(policy.activation_cutoff).isoformat() if policy.activation_cutoff else None}


def preview_campaign(db, campaign_id, *, actor, expected_revision):
    row = _campaign(db, campaign_id, actor, expected_revision)
    if row.state not in {"DRAFT", "PREVIEW"}:
        raise MessagingConflict("campaign_already_confirmed")
    policy_binding = None
    if row.kind == "welcome_backfill":
        policy = onboarding.state(db, row.bot_key)
        if policy.published_version != row.content_version:
            raise MessagingConflict("welcome_policy_version_changed")
        policy_binding = _welcome_policy_binding(policy)
        row.audience = {**row.audience, "welcome_policy": policy_binding}
    contacts = _audience_contacts(db, row)
    db.query(BotCampaignRecipient).filter_by(campaign_id=row.id, state="PREVIEW").delete(synchronize_session=False)
    snapshot = []
    for contact in contacts:
        recipient = BotCampaignRecipient(campaign_id=row.id, user_id=contact.user_id,
            contact_id=contact.id, locale=contact.locale, state="PREVIEW")
        db.add(recipient)
        snapshot.append([contact.user_id, contact.id, contact.locale, contact.status, contact.source])
        recipient.payload = {"reviewed_contact_status": contact.status, "reviewed_contact_source": contact.source}
    binding = {"bot_key": row.bot_key, "kind": row.kind, "content": row.content,
               "content_version": row.content_version, "followup": row.followup_enabled,
               "welcome_policy": policy_binding, "legacy_main_once": row.audience.get("legacy_main_once", False), "recipients": snapshot}
    row.snapshot_sha256 = hashlib.sha256(json.dumps(binding, ensure_ascii=False, sort_keys=True,
                                                  separators=(",", ":")).encode()).hexdigest()
    row.revision += 1; row.state = "PREVIEW"
    db.flush()
    return {"campaign_id": row.id, "revision": row.revision, "snapshot_sha256": row.snapshot_sha256,
            "recipient_count": len(snapshot), "bot_key": row.bot_key, "kind": row.kind,
            "content": row.content, "content_version": row.content_version, "followup_enabled": row.followup_enabled,
            "unverified_main_registration_count": sum(contact.status == "unknown" for contact in contacts),
            "message_previews": {locale: onboarding.preview(onboarding.content_for_locale(row.content, locale))
                for locale in ("ru", "en")} if row.kind == "welcome_backfill" else None}


def confirm_campaign(db, campaign_id, *, actor, expected_revision, snapshot_sha256, idempotency_key, allow_unverified_main_once=False, now=None):
    row = _campaign(db, campaign_id, actor)
    if not isinstance(idempotency_key, str) or not 8 <= len(idempotency_key) <= 100:
        raise MessagingConflict("invalid_confirmation_key")
    if row.confirmation_key == idempotency_key:
        if (row.confirmation_revision != expected_revision or row.snapshot_sha256 != snapshot_sha256
                or row.audience.get("confirmed_legacy_main_once", False) != allow_unverified_main_once):
            raise MessagingConflict("confirmation_payload_conflict")
        return row, True
    if row.state != "PREVIEW" or row.revision != expected_revision or row.snapshot_sha256 != snapshot_sha256:
        raise MessagingConflict("campaign_preview_changed")
    if db.query(BotCampaign.id).filter_by(confirmation_key=idempotency_key).first():
        raise MessagingConflict("confirmation_key_already_used")
    current = onboarding.utc(now)
    if row.kind == "welcome_backfill":
        policy = onboarding.state(db, row.bot_key)
        if policy.published_version != row.content_version:
            raise MessagingConflict("welcome_policy_disabled_or_changed")
        if row.audience.get("welcome_policy") != _welcome_policy_binding(policy):
            raise MessagingConflict("welcome_policy_changed_repreview")
        if db.get(OnboardingVersion, row.content_version).content != row.content:
            raise MessagingConflict("welcome_source_version_changed")
    recipients = db.query(BotCampaignRecipient).filter_by(campaign_id=row.id).order_by(BotCampaignRecipient.user_id).all()
    if not recipients:
        raise MessagingConflict("no_eligible_recipients")
    unverified = sum(recipient.payload.get("reviewed_contact_status") == "unknown" for recipient in recipients)
    if unverified and (not row.audience.get("legacy_main_once") or allow_unverified_main_once is not True):
        raise MessagingConflict("explicit_legacy_main_once_confirmation_required")
    if allow_unverified_main_once and (row.bot_key != "safrway" or row.kind != "welcome_backfill" or not row.audience.get("legacy_main_once")):
        raise MessagingConflict("legacy_main_oneoff_welcome_only")
    if row.kind == "welcome_backfill":
        fresh = [[contact.user_id, contact.id, contact.locale, contact.status, contact.source] for contact in _audience_contacts(db, row)]
        reviewed = [[recipient.user_id, recipient.contact_id, recipient.locale,
            recipient.payload.get("reviewed_contact_status"), recipient.payload.get("reviewed_contact_source")] for recipient in recipients]
        if fresh != reviewed:
            raise MessagingConflict("welcome_audience_changed_repreview")
        if not policy.enabled:
            # Publish/off + dry snapshot remains no-send. Confirmation turns on
            # future contacts and queues the exact reviewed catch-up atomically,
            # under the same mutex used by incoming private contact receipts.
            policy.enabled, policy.activation_cutoff = True, current
            policy.revision += 1
            db.add(AdminAction(admin_user_id=actor.id, action_type="BOT_WELCOME_ATOMIC_CUTOVER",
                entity_type="onboarding", entity_id=policy.id,
                details={"bot_key": row.bot_key, "campaign_id": row.id, "revision": policy.revision}))
    for recipient in recipients:
        # Match registration lock ordering: User, then its bot Contact.
        # The actor is already held FOR SHARE by _root(). Do not upgrade that
        # shared root row in two independent bot transactions (cross-bot deadlock).
        user_query = db.query(User).filter_by(id=recipient.user_id).populate_existing()
        user = user_query.with_for_update(read=recipient.user_id == actor.id).one()
        contact = db.query(BotContact).filter_by(id=recipient.contact_id).populate_existing().with_for_update().one()
        legacy_allowed = (row.audience.get("legacy_main_once") and row.bot_key == "safrway" and row.kind == "welcome_backfill"
            and contact.status == "unknown" and contact.source == "legacy_main_registration" and contact.first_contact_at is None
            and user.bot_status == "active" and not contact.announcements_opted_out)
        if (user.status != "active" or contact.status != "active" and not legacy_allowed or contact.bot_key != row.bot_key or contact.user_id != user.id
                or row.kind == "announcement" and contact.announcements_opted_out):
            recipient.state = "SUPPRESSED"
            continue
        if row.kind == "welcome_backfill":
            enrollment = onboarding.enroll_contact(db, user, bot_key=row.bot_key, locale=recipient.locale,
                event=f"campaign:{row.id}:{user.id}", occurred_at=current, origin="backfill",
                followup=row.followup_enabled, now=current, expected_version=row.content_version)
            if enrollment is None:
                recipient.state = "SKIPPED"
            else:
                recipient.enrollment_id, recipient.state = enrollment.id, "ENROLLED"
        else:
            recipient.state, recipient.due_at = "PENDING", current
            recipient.payload = {"text": row.content[recipient.locale]}
    row.confirmation_key, row.confirmation_revision = idempotency_key, expected_revision
    row.audience = {**row.audience, "confirmed_legacy_main_once": allow_unverified_main_once}
    row.confirmed_at, row.state, row.revision = current, "QUEUED", row.revision + 1
    db.add(AdminAction(admin_user_id=actor.id, action_type="BOT_CAMPAIGN_CONFIRMED", entity_type="bot_campaign",
        entity_id=row.id, idempotency_key=f"bot-campaign:{idempotency_key}",
        details={"bot_key": row.bot_key, "snapshot_sha256": snapshot_sha256, "recipients": len(recipients), "kind": row.kind}))
    db.flush()
    return row, False


def cancel_campaign(db, campaign_id, *, actor, expected_revision):
    row = _campaign(db, campaign_id, actor, expected_revision)
    row.state, row.revision = "CANCELLED", row.revision + 1
    recipients = db.query(BotCampaignRecipient).filter_by(campaign_id=row.id).with_for_update().all()
    for recipient in recipients:
        if recipient.state in {"PENDING", "PREVIEW", "ENROLLED"}:
            recipient.state = "CANCELLED"
            if recipient.enrollment_id:
                db.query(OnboardingDelivery).filter_by(enrollment_id=recipient.enrollment_id, state="PENDING").update(
                    {"state": "SUPPRESSED", "error_code": "CAMPAIGN_CANCELLED"}, synchronize_session=False)
    db.add(AdminAction(admin_user_id=actor.id, action_type="BOT_CAMPAIGN_CANCELLED", entity_type="bot_campaign", entity_id=row.id))
    db.flush()
    return row


def claim_announcement(db, *, bot_key, now=None):
    onboarding.bot_transaction_lock(db, bot_key)
    current = onboarding.utc(now)
    policy = onboarding.state(db, bot_key)
    expired = db.query(BotCampaignRecipient).join(BotCampaign).filter(
        BotCampaign.bot_key == bot_key, BotCampaignRecipient.state == "CLAIMED",
        BotCampaignRecipient.lease_expires_at <= current).all()
    for row in expired:
        row.state, row.error_code = "UNKNOWN", "AMBIGUOUS_DELIVERY"
    if policy.transport_not_before and onboarding.utc(policy.transport_not_before) > current:
        return []
    for _ in range(20):
        row = db.query(BotCampaignRecipient).join(BotCampaign).filter(
            BotCampaign.bot_key == bot_key, BotCampaign.kind == "announcement", BotCampaign.state == "QUEUED",
            BotCampaignRecipient.state == "PENDING", BotCampaignRecipient.due_at <= current).order_by(
            BotCampaignRecipient.id).with_for_update(skip_locked=True).first()
        if row is None:
            return []
        contact = db.query(BotContact).filter_by(id=row.contact_id).populate_existing().one()
        user = db.query(User).filter_by(id=row.user_id).populate_existing().one()
        if (contact.bot_key != bot_key or contact.user_id != user.id or contact.status != "active"
                or user.status != "active" or contact.announcements_opted_out):
            row.state, row.error_code = "SUPPRESSED", "RECIPIENT_UNAVAILABLE"
            db.flush()
            continue
        row.state, row.lease_token = "CLAIMED", secrets.token_hex(16)
        row.lease_expires_at, row.attempts = current + timedelta(minutes=2), row.attempts + 1
        return [{"delivery_kind": "campaign", "id": row.id, "bot_key": bot_key,
            "telegram_id": user.telegram_id, "locale": row.locale, "lease_token": row.lease_token,
            "lease_expires_at": row.lease_expires_at.isoformat(), **row.payload}]
    return []


def settle_announcement(db, delivery_id, *, bot_key, lease_token, outcome,
                        message_id=None, delivered_at=None, error_code=None,
                        retry_after_seconds=None, now=None, allow_enqueue=True):
    onboarding.bot_transaction_lock(db, bot_key)
    current = onboarding.utc(now)
    row = db.query(BotCampaignRecipient).join(BotCampaign).filter(
        BotCampaign.bot_key == bot_key, BotCampaignRecipient.id == delivery_id).with_for_update().one_or_none()
    if row is None or row.lease_token != lease_token:
        raise MessagingConflict("stale_announcement_lease")
    if row.state == outcome and row.telegram_message_id == message_id:
        return row
    if outcome == "RETRY" and row.state in {"PENDING", "FAILED", "CANCELLED"} and row.error_code == "TELEGRAM_RETRY_AFTER":
        return row
    limited = (outcome == "RETRY" and error_code == "TELEGRAM_RETRY_AFTER"
        and type(retry_after_seconds) is int and 1 <= retry_after_seconds <= 86400)
    positive_receipt = row.state == "UNKNOWN" and row.error_code == "AMBIGUOUS_DELIVERY" and outcome == "DELIVERED" and delivered_at is not None
    negative_receipt = row.state == "UNKNOWN" and row.error_code == "AMBIGUOUS_DELIVERY" and limited
    if row.state != "CLAIMED" and not positive_receipt and not negative_receipt:
        raise MessagingConflict("announcement_already_settled")
    if limited:
        policy = onboarding.state(db, bot_key)
        resume = current + timedelta(seconds=retry_after_seconds)
        if policy.transport_not_before is None or onboarding.utc(policy.transport_not_before) < resume:
            policy.transport_not_before = resume
        campaign = db.get(BotCampaign, row.campaign_id)
        row.state = "CANCELLED" if not allow_enqueue or campaign.state == "CANCELLED" else "PENDING" if row.attempts < 3 else "FAILED"
        row.due_at, row.error_code, row.lease_expires_at = resume, error_code, None
        return row
    if outcome not in {"DELIVERED", "FAILED", "UNKNOWN"}:
        raise MessagingConflict("invalid_announcement_outcome")
    if outcome == "DELIVERED":
        if not isinstance(message_id, str) or not message_id.isascii() or not message_id.isdigit() or int(message_id) <= 0:
            raise MessagingConflict("positive_telegram_receipt_required")
        confirmed = onboarding.utc(delivered_at) if delivered_at is not None else current
        if confirmed > current + timedelta(seconds=30) or confirmed < onboarding.utc(row.due_at) - timedelta(seconds=1):
            raise MessagingConflict("invalid_telegram_timestamp")
        row.telegram_message_id, row.delivered_at = message_id, confirmed
    row.state, row.error_code = outcome, error_code
    if outcome == "FAILED" and error_code == "recipient_blocked":
        db.get(BotContact, row.contact_id).status = "blocked"
    return row
