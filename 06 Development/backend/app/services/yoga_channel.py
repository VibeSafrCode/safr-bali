"""Yoga channel isolation, canonical intake and a per-recipient delivery ledger.

Functions flush but never commit. Callers own the atomic transaction. Staff
recipients are server-resolved existing staff, NOT request-supplied ACL grants.
Telegram is not exactly-once: expired/ambiguous sends become UNKNOWN and require
human review. Only proven pre-send failures can be retried automatically.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
import secrets

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.web_portal import WebConversation, WebMessage
from app.models.yoga_channel import YogaChannelBinding, YogaDelivery, YogaInboundReceipt

BRAND = "Yoga Ganster"
TOPIC_LABELS = {"general": "Общий вопрос"}
PRE_SEND_ERRORS = {"rate_limited_before_send", "transport_unavailable_before_send", "connection_failed_before_send"}
FINAL_ERRORS = {"recipient_blocked", "recipient_unavailable", "invalid_recipient", "send_outcome_unknown", "lease_expired"}
UNKNOWN_ERRORS = {"send_outcome_unknown", "lease_expired"}
FAILED_ERRORS = {"recipient_blocked", "recipient_unavailable", "invalid_recipient"}


def utcnow():
    # Existing canonical Web tables store naive UTC; preserve that contract.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ChannelError(Exception):
    def __init__(self, code, status=409):
        self.code, self.status = code, status
        super().__init__(code)


def need(ok, code, status=409):
    if not ok:
        raise ChannelError(code, status)


@dataclass(frozen=True)
class ChannelPolicy:
    observer_id: int
    staff_recipient_ids: tuple[int, ...]
    support_recipient_ids: tuple[int, ...] = ()

    def validate(self):
        need(type(self.observer_id) is int and self.observer_id > 0, "yoga_observer_not_configured", 503)
        need(0 < len(self.staff_recipient_ids) <= 100 and
             all(type(i) is int and i > 0 for i in self.staff_recipient_ids), "main_staff_not_configured", 503)
        need(len(self.support_recipient_ids) <= 100 and
             all(type(i) is int and i > 0 for i in self.support_recipient_ids), "main_support_not_configured", 503)


def _hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _lock(db, key):
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SET LOCAL lock_timeout = '5s'"))
        value = int.from_bytes(hashlib.sha256(("yoga-channel:" + key).encode()).digest()[:8], "big") & ((1 << 63) - 1)
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": value})


def _body(body):
    need(isinstance(body, str) and 0 < len(body) <= 4000 and body.strip(), "invalid_body", 422)
    return body


def _topic(topic):
    need(isinstance(topic, str) and re.fullmatch(r"[a-z][a-z0-9_-]{0,79}", topic) is not None, "invalid_topic", 422)
    return topic


def topic_label(topic):
    # Extend only from a reviewed server-side Registry map. /start payload and
    # arbitrary client strings never become a brand, HTML label or access grant.
    from app.services.yoga_topics import topic_label as registry_label
    return TOPIC_LABELS.get(topic) or registry_label(topic)


def _binding(db, conversation_id):
    row = db.get(YogaChannelBinding, conversation_id)
    need(row is not None and row.bot_key == "yoga", "yoga_conversation_not_found", 404)
    return row


def _delivery(db, message, transport, recipient, role, now):
    existing = db.query(YogaDelivery).filter_by(message_id=message.id, transport_bot_key=transport,
        recipient_id=recipient, recipient_role=role).one_or_none()
    if existing is None:
        db.add(YogaDelivery(message_id=message.id, transport_bot_key=transport, recipient_id=recipient,
            recipient_role=role, status="PENDING", attempts=0, next_attempt_at=now, created_at=now))


def fanout(db, message, policy, *, now=None):
    """No legacy global outbox event: each target has its own durable status."""
    policy.validate()
    now = now or utcnow()
    binding = _binding(db, message.conversation_id)
    need(message.author_type == "client" and message.visibility == "client", "public_client_message_required")
    _lock(db, "fanout:" + str(message.id))
    for recipient in sorted(set(policy.staff_recipient_ids)):
        _delivery(db, message, "safrway", recipient, "staff", now)
    for recipient in sorted(set(policy.support_recipient_ids) - set(policy.staff_recipient_ids)):
        _delivery(db, message, "safrway", recipient, "observer", now)
    _delivery(db, message, "yoga", policy.observer_id, "observer", now)
    db.flush()
    return binding


def bind_and_fanout(db, conversation, message, *, topic, policy, source_kind="website", sender_telegram_id=None,
                    reply_chat_id=None, thread_key=None, now=None):
    """Trusted web adapter only: bind an EXISTING canonical conversation/message.

    Caller must establish Yoga website origin from server configuration. Never
    choose brand from route_context, an arbitrary request field or analytics.
    """
    now = now or utcnow()
    policy.validate()
    _topic(topic)
    need(source_kind in {"website", "telegram"}, "invalid_source", 422)
    need(conversation.id and message.id and message.conversation_id == conversation.id, "canonical_message_required")
    need((sender_telegram_id is None and reply_chat_id is None) or
         (type(sender_telegram_id) is int and sender_telegram_id > 0 and reply_chat_id == sender_telegram_id), "private_chat_only", 422)
    thread_key = thread_key or "web:" + str(conversation.id)
    need(isinstance(thread_key, str) and re.fullmatch(r"[a-zA-Z0-9:_-]{1,80}", thread_key), "invalid_thread_key", 422)
    _lock(db, "binding:" + str(conversation.id))
    row = db.get(YogaChannelBinding, conversation.id)
    expected = (source_kind, thread_key, topic, sender_telegram_id, reply_chat_id)
    if row is not None:
        need((row.source_kind, row.thread_key, row.topic, row.sender_telegram_id, row.reply_chat_id) == expected, "immutable_source_conflict")
    else:
        row = YogaChannelBinding(conversation_id=conversation.id, bot_key="yoga", source_kind=source_kind,
            thread_key=thread_key, topic=topic, sender_telegram_id=sender_telegram_id, reply_chat_id=reply_chat_id, created_at=now)
        db.add(row)
        db.flush()
    fanout(db, message, policy, now=now)
    return row


def intake(db, *, update_id, sender_telegram_id, chat_id, body, topic, policy, conversation_id=None, now=None):
    """Trusted Yoga bot update, private Telegram chats only; no new User/lead/order."""
    now = now or utcnow()
    policy.validate()
    _body(body)
    _topic(topic)
    need(type(update_id) is int and 0 <= update_id < 2**63, "invalid_update_id", 422)
    need(type(sender_telegram_id) is int and 0 < sender_telegram_id < 2**63 and chat_id == sender_telegram_id,
         "private_chat_only", 422)
    need(conversation_id is None or type(conversation_id) is int and conversation_id > 0, "invalid_conversation", 422)
    update_key = "telegram:" + str(update_id)
    fingerprint = _hash(dict(sender=sender_telegram_id, chat=chat_id, body=body, topic=topic, conversation_id=conversation_id))
    _lock(db, "inbound:" + update_key)
    receipt = db.query(YogaInboundReceipt).filter_by(bot_key="yoga", update_key=update_key).one_or_none()
    if receipt:
        need(receipt.fingerprint == fingerprint, "inbound_replay_conflict")
        message = db.get(WebMessage, receipt.message_id)
        return {"conversation_id": message.conversation_id, "message_id": message.id, "idempotent_replay": True}
    thread_key = "telegram:" + _hash([sender_telegram_id, topic])[:48]
    _lock(db, "thread:" + thread_key)
    if conversation_id is not None:
        binding = _binding(db, conversation_id)
        need(binding.source_kind == "telegram" and binding.sender_telegram_id == sender_telegram_id and
             binding.reply_chat_id == chat_id and binding.topic == topic, "source_sender_conflict", 403)
    else:
        binding = db.query(YogaChannelBinding).filter_by(source_kind="telegram", thread_key=thread_key).one_or_none()
    if binding:
        conversation = db.get(WebConversation, binding.conversation_id)
        need(conversation.status == "open", "conversation_not_open")
    else:
        # Link a known user only; registration/referrals remain the existing flow.
        user = db.query(User).filter_by(telegram_id=sender_telegram_id).one_or_none()
        conversation = WebConversation(user_id=user.id if user else None, route_context={}, assigned_staff_ids=[],
            source="yoga_bot", status="open", created_at=now, updated_at=now)
        db.add(conversation)
        db.flush()
    message = WebMessage(conversation_id=conversation.id, author_type="client", actor_telegram_id=sender_telegram_id,
        body=body, visibility="client", idempotency_key="yoga:" + update_key, created_at=now)
    db.add(message)
    db.flush()
    bind_and_fanout(db, conversation, message, topic=topic, policy=policy, source_kind="telegram",
        sender_telegram_id=sender_telegram_id, reply_chat_id=chat_id, thread_key=thread_key, now=now)
    conversation.updated_at = now
    db.add(YogaInboundReceipt(bot_key="yoga", update_key=update_key, fingerprint=fingerprint, message_id=message.id, created_at=now))
    db.flush()
    return {"conversation_id": conversation.id, "message_id": message.id, "idempotent_replay": False}


def append(db, **kwargs):
    need(kwargs.get("conversation_id") is not None, "existing_conversation_required", 422)
    return intake(db, **kwargs)


def queue_staff_reply(db, message, *, policy=None, now=None):
    """Call ONLY after existing main-staff ACL and canonical message creation.

    Website-only anonymous clients retain their existing web reply path. Their
    observer notification does not invent a Telegram recipient or identity link.
    """
    now = now or utcnow()
    binding = _binding(db, message.conversation_id)
    need(message.id and message.author_type == "staff" and message.visibility == "client", "public_staff_reply_required")
    _lock(db, "reply:" + str(message.id))
    if binding.reply_chat_id is not None:
        _delivery(db, message, "yoga", binding.reply_chat_id, "client", now)
    if policy is not None:
        policy.validate()
        _delivery(db, message, "yoga", policy.observer_id, "observer", now)
        for recipient in sorted(set(policy.support_recipient_ids) - set(policy.staff_recipient_ids)):
            _delivery(db, message, "safrway", recipient, "observer", now)
    db.flush()
    return {"handled": True, "telegram_queued": binding.reply_chat_id is not None}


def serialize(db, conversation_id, *, sender_telegram_id=None):
    binding = _binding(db, conversation_id)
    if sender_telegram_id is not None:
        need(type(sender_telegram_id) is int and sender_telegram_id > 0 and
             binding.sender_telegram_id == sender_telegram_id, "yoga_conversation_not_found", 404)
    conversation = db.get(WebConversation, conversation_id)
    messages = db.query(WebMessage).filter_by(conversation_id=conversation_id, visibility="client").order_by(WebMessage.id).limit(200).all()
    return {"id": conversation_id, "brand": BRAND, "topic": binding.topic, "topic_label": topic_label(binding.topic),
        "marker": BRAND + " · " + topic_label(binding.topic),
        "status": conversation.status, "source_kind": binding.source_kind, "observer_read_only": True,
        "messages": [{"id": m.id, "body": m.body, "author_type": m.author_type, "created_at": m.created_at} for m in messages]}


def claim(db, *, bot_key, policy, limit=20, now=None):
    now = now or utcnow()
    policy.validate()
    need(bot_key in {"yoga", "safrway"} and type(limit) is int and 1 <= limit <= 50, "invalid_claim", 422)
    # Expired sends are ambiguous, not automatically resent. Restrict update to
    # the authenticated transport; never disclose the other bot's ledger.
    expired = db.query(YogaDelivery).filter(YogaDelivery.transport_bot_key == bot_key, YogaDelivery.status == "CLAIMED",
        YogaDelivery.lease_expires_at <= now).order_by(YogaDelivery.id).with_for_update(skip_locked=True).limit(100).all()
    for row in expired:
        row.status, row.error_code = "UNKNOWN", "lease_expired"
    db.flush()
    rows = db.query(YogaDelivery).filter(YogaDelivery.transport_bot_key == bot_key,
        YogaDelivery.status.in_(["PENDING", "RETRY"]), YogaDelivery.next_attempt_at <= now,
        YogaDelivery.attempts < 5).order_by(YogaDelivery.id).with_for_update(skip_locked=True).limit(limit).all()
    result = []
    for row in rows:
        # A removed staff member or changed observer never receives old backlog.
        allowed = (row.recipient_role == "staff" and bot_key == "safrway" and row.recipient_id in policy.staff_recipient_ids or
            row.recipient_role == "observer" and ((bot_key == "yoga" and row.recipient_id == policy.observer_id) or
                (bot_key == "safrway" and row.recipient_id in policy.support_recipient_ids and row.recipient_id not in policy.staff_recipient_ids)) or
            row.recipient_role == "client" and bot_key == "yoga")
        if not allowed:
            row.status, row.error_code = "FAILED", "recipient_unavailable"
            continue
        message = db.get(WebMessage, row.message_id)
        binding = _binding(db, message.conversation_id)
        need(message.visibility == "client", "internal_message_delivery_refused")
        if row.recipient_role == "client":
            need(binding.reply_chat_id == row.recipient_id and message.author_type == "staff", "reply_recipient_binding_conflict")
        token = secrets.token_urlsafe(32)
        row.status, row.attempts = "CLAIMED", row.attempts + 1
        row.lease_token_hash = hashlib.sha256(token.encode()).hexdigest()
        row.lease_expires_at = now + timedelta(seconds=60)
        result.append({"id": row.id, "lease_token": token, "lease_expires_at": row.lease_expires_at,
            "recipient_id": row.recipient_id, "recipient_role": row.recipient_role, "conversation_id": message.conversation_id,
            "message_id": message.id, "body": message.body, "brand": BRAND, "topic": binding.topic,
            "author_type": message.author_type,
            "topic_label": topic_label(binding.topic), "marker": BRAND + " · " + topic_label(binding.topic),
            "observer_read_only": row.recipient_role == "observer",
            "allow_client_reply": row.recipient_role == "staff" and binding.reply_chat_id is not None})
    db.flush()
    return result


def settle(db, *, bot_key, delivery_id, lease_token, outcome, error_code=None, telegram_message_id=None, now=None):
    now = now or utcnow()
    need(outcome in {"DELIVERED", "RETRY", "UNKNOWN", "FAILED"}, "invalid_outcome", 422)
    need(isinstance(lease_token, str) and 20 <= len(lease_token) <= 100, "invalid_lease", 422)
    row = db.query(YogaDelivery).filter_by(id=delivery_id, transport_bot_key=bot_key).with_for_update().one_or_none()
    need(row is not None, "delivery_not_found", 404)
    need(row.lease_token_hash and secrets.compare_digest(row.lease_token_hash, hashlib.sha256(lease_token.encode()).hexdigest()), "lease_conflict")
    effective_outcome = "FAILED" if outcome == "RETRY" and row.attempts >= 5 else outcome
    if row.status != "CLAIMED":
        need(row.status == effective_outcome and row.error_code == error_code and row.telegram_message_id == telegram_message_id, "settlement_replay_conflict")
        return {"id": row.id, "status": row.status, "idempotent_replay": True}
    if row.lease_expires_at <= now:
        row.status, row.error_code = "UNKNOWN", "lease_expired"
        db.flush()
        return {"id": row.id, "status": "UNKNOWN", "idempotent_replay": False}
    if outcome == "DELIVERED":
        need(type(telegram_message_id) is int and telegram_message_id > 0 and error_code is None, "delivery_receipt_required", 422)
    else:
        need(telegram_message_id is None, "ambiguous_delivery_receipt", 422)
        allowed_errors = (PRE_SEND_ERRORS if outcome == "RETRY" else
                          UNKNOWN_ERRORS if outcome == "UNKNOWN" else FAILED_ERRORS)
        need(error_code in allowed_errors, "invalid_transport_error", 422)
    if outcome == "RETRY" and row.attempts >= 5:
        outcome = "FAILED"
    row.status, row.error_code, row.telegram_message_id = outcome, error_code, telegram_message_id
    if outcome == "RETRY":
        row.next_attempt_at = now + timedelta(seconds=min(300, 5 * 2 ** (row.attempts - 1)))
    db.flush()
    return {"id": row.id, "status": row.status, "idempotent_replay": False}
