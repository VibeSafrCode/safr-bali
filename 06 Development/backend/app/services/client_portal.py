from copy import deepcopy
from datetime import datetime
import hashlib
import json
from uuid import UUID

from sqlalchemy import exists, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.web_portal import WebConversation, WebMessage, WebOutboxEvent
from app.models.yoga_channel import YogaChannelBinding


class ClientMessageConflict(ValueError):
    """A retry key belongs to a different exact request."""


class ClientMessageUnavailable(RuntimeError):
    """A concurrent outcome is unresolved; retry the same key, not a new one."""


def bound_chat_transaction(db: Session) -> None:
    """Bound this PostgreSQL transaction, not auth/pool/connect wall time.

    SET LOCAL ends at commit/rollback. Call again before every recovery or
    post-commit read; a timeout must never authorize a transport retry.
    """
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SET LOCAL lock_timeout = '1s'"))
        db.execute(text("SET LOCAL statement_timeout = '3s'"))


def utcnow() -> datetime:
    return datetime.utcnow()


def serialize_client_chat(db: Session, conversation: WebConversation) -> dict:
    # Bound the response, but never drop the newly accepted message after #200.
    messages = (
        db.query(WebMessage)
        .filter(WebMessage.conversation_id == conversation.id, WebMessage.visibility == "client")
        .order_by(WebMessage.id.desc())
        .limit(200)
        .all()
    )
    messages.reverse()
    return {
        "id": conversation.id,
        "status": conversation.status,
        "route_context": conversation.route_context,
        "messages": [
            {"id": item.id, "author_type": item.author_type, "body": item.body, "created_at": item.created_at}
            for item in messages
        ],
    }


def load_client_chat(db: Session, user_id: int) -> dict:
    conversation = (
        db.query(WebConversation)
        .filter(WebConversation.user_id == user_id,
                ~exists().where(YogaChannelBinding.conversation_id == WebConversation.id))
        .order_by(WebConversation.updated_at.desc())
        .first()
    )
    if not conversation:
        return {"id": None, "status": "empty", "messages": []}
    return serialize_client_chat(db, conversation)


def request_key(principal: str, value) -> str | None:
    if value is None:
        return None
    try:
        parsed = UUID(str(value))
        if parsed.version != 4 or str(parsed) != str(value):
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        raise ClientMessageConflict("Invalid retry key") from None
    # Namespaces come from the server actor, never client attribution fields.
    digest = hashlib.sha256((principal + ":" + str(parsed)).encode("utf-8")).hexdigest()
    return "f01-request:" + digest


def request_fingerprint(*, body: str, context: dict, source: str, identity: dict) -> str:
    value = {"body": body.strip(), "route_context": context, "source": source, "identity": identity}
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(",", ":")).encode("utf-8")).hexdigest()


def message_source_event(db: Session, message: WebMessage) -> WebOutboxEvent | None:
    return (
        db.query(WebOutboxEvent)
        .filter(WebOutboxEvent.event_type == "web_chat_message",
                WebOutboxEvent.aggregate_id == message.conversation_id,
                WebOutboxEvent.payload["message_id"].as_integer() == message.id)
        .order_by(WebOutboxEvent.id.asc())
        .first()
    )


def create_client_message(
    db: Session,
    conversation: WebConversation,
    body: str,
    *,
    route_context: dict | None = None,
    source: str | None = None,
    idempotency_key: str | None = None,
    actor_telegram_id: int | None = None,
    fingerprint: str | None = None,
) -> WebMessage:
    message = WebMessage(conversation_id=conversation.id, author_type="client", body=body.strip(),
                         visibility="client", idempotency_key=idempotency_key,
                         actor_telegram_id=actor_telegram_id)
    db.add(message)
    db.flush()
    conversation.updated_at = utcnow()
    # Persist attribution once per event; later page B cannot rewrite page A.
    payload = {
        "conversation_id": conversation.id,
        "message_id": message.id,
        "route_context": deepcopy(conversation.route_context if route_context is None else route_context),
        "source": source if source is not None else conversation.source,
    }
    if fingerprint is not None:
        payload["request_fingerprint"] = fingerprint
    db.add(WebOutboxEvent(event_type="web_chat_message", aggregate_id=conversation.id,
                         payload=payload, dedupe_key=f"web-client-message:{message.id}"))
    return message


def _replay(db: Session, key: str | None, fingerprint: str, *, body: str, user_id: int | None,
            guest_name: str | None = None, guest_contact: str | None = None):
    if key is None:
        return None
    message = db.query(WebMessage).filter(WebMessage.idempotency_key == key).first()
    if message is None:
        return None
    conversation = db.get(WebConversation, message.conversation_id)
    event = message_source_event(db, message)
    if (conversation is None or message.author_type != "client" or message.visibility != "client"
            or message.body != body.strip() or conversation.user_id != user_id or conversation.guest_name != guest_name
            or conversation.guest_contact != guest_contact or event is None
            or event.payload.get("request_fingerprint") != fingerprint):
        raise ClientMessageConflict("Message replay conflict")
    return conversation, message


def _client_result(db: Session, conversation: WebConversation, message: WebMessage, replay: bool) -> dict:
    return {**serialize_client_chat(db, conversation), "message_id": message.id, "idempotent_replay": replay}


def send_client_chat_message(
    db: Session, *, user_id: int, body: str, route_context: dict, source: str,
    idempotency_key=None,
) -> dict:
    key = request_key("user:" + str(user_id), idempotency_key)
    fingerprint = request_fingerprint(body=body, context=route_context, source=source,
                                      identity={"user_id": user_id})
    try:
        bound_chat_transaction(db)
        # Same user selection is serializable on PostgreSQL. SQLite's unique
        # key still prevents duplicates; unresolved busy races return retryable 503.
        if key is not None:
            db.query(User).filter(User.id == user_id).with_for_update().first()
        existing = _replay(db, key, fingerprint, body=body, user_id=user_id)
        if existing:
            return _client_result(db, *existing, True)
        conversation = (
            db.query(WebConversation)
            .filter(WebConversation.user_id == user_id, WebConversation.status == "open",
                    ~exists().where(YogaChannelBinding.conversation_id == WebConversation.id))
            .order_by(WebConversation.updated_at.desc())
            .first()
        )
        if not conversation:
            conversation = WebConversation(user_id=user_id, source=source, route_context=deepcopy(route_context))
            db.add(conversation)
            db.flush()
        elif route_context:
            conversation.route_context = deepcopy(route_context)
        message = create_client_message(db, conversation, body, route_context=conversation.route_context,
                                        source=source, idempotency_key=key, fingerprint=fingerprint)
        db.commit()
        bound_chat_transaction(db)
        db.refresh(conversation)
        return _client_result(db, conversation, message, False)
    except (IntegrityError, OperationalError):
        db.rollback()
        if key is not None:
            try:
                bound_chat_transaction(db)
                existing = _replay(db, key, fingerprint, body=body, user_id=user_id)
                if existing:
                    return _client_result(db, *existing, True)
            except OperationalError:
                db.rollback()
                raise ClientMessageUnavailable("Message outcome unresolved; retry the same key") from None
            raise ClientMessageUnavailable("Message outcome unresolved; retry the same key") from None
        raise


def send_guest_chat_message(db: Session, *, name: str, contact: str, body: str,
                            route_context: dict, idempotency_key=None) -> dict:
    # The opaque UUID is a retry identity, not a guest/account association.
    key = request_key("guest", idempotency_key)
    name, contact = name.strip(), contact.strip()
    fingerprint = request_fingerprint(body=body, context=route_context, source="website",
                                      identity={"guest_name": name, "guest_contact": contact})
    def result(conversation, message, replay):
        return {"accepted": True, "conversation_id": conversation.id,
                "message_id": message.id, "idempotent_replay": replay}
    try:
        bound_chat_transaction(db)
        existing = _replay(db, key, fingerprint, body=body, user_id=None, guest_name=name, guest_contact=contact)
        if existing:
            return result(*existing, True)
        conversation = WebConversation(guest_name=name, guest_contact=contact, route_context=deepcopy(route_context))
        db.add(conversation)
        db.flush()
        message = create_client_message(db, conversation, body, route_context=route_context,
                                        source="website", idempotency_key=key, fingerprint=fingerprint)
        accepted = result(conversation, message, False)
        db.commit()
        return accepted
    except (IntegrityError, OperationalError):
        db.rollback()
        if key is not None:
            try:
                bound_chat_transaction(db)
                existing = _replay(db, key, fingerprint, body=body, user_id=None, guest_name=name, guest_contact=contact)
            except OperationalError:
                db.rollback()
                raise ClientMessageUnavailable("Message outcome unresolved; retry the same key") from None
            if existing:
                return result(*existing, True)
            raise ClientMessageUnavailable("Message outcome unresolved; retry the same key") from None
        raise
