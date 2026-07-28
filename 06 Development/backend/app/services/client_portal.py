from datetime import datetime

from sqlalchemy.orm import Session

from app.models.web_portal import WebConversation, WebMessage, WebOutboxEvent


def utcnow() -> datetime:
    return datetime.utcnow()


def serialize_client_chat(
    db: Session,
    conversation: WebConversation,
) -> dict:
    messages = (
        db.query(WebMessage)
        .filter(
            WebMessage.conversation_id == conversation.id,
            WebMessage.visibility == "client",
        )
        .order_by(WebMessage.id.asc())
        .limit(200)
        .all()
    )
    return {
        "id": conversation.id,
        "status": conversation.status,
        "route_context": conversation.route_context,
        "messages": [
            {
                "id": item.id,
                "author_type": item.author_type,
                "body": item.body,
                "created_at": item.created_at,
            }
            for item in messages
        ],
    }


def load_client_chat(db: Session, user_id: int) -> dict:
    conversation = (
        db.query(WebConversation)
        .filter(WebConversation.user_id == user_id)
        .order_by(WebConversation.updated_at.desc())
        .first()
    )
    if not conversation:
        return {"id": None, "status": "empty", "messages": []}
    return serialize_client_chat(db, conversation)


def create_client_message(
    db: Session,
    conversation: WebConversation,
    body: str,
) -> WebMessage:
    message = WebMessage(
        conversation_id=conversation.id,
        author_type="client",
        body=body.strip(),
        visibility="client",
    )
    db.add(message)
    db.flush()
    conversation.updated_at = utcnow()
    db.add(
        WebOutboxEvent(
            event_type="web_chat_message",
            aggregate_id=conversation.id,
            payload={
                "conversation_id": conversation.id,
                "message_id": message.id,
            },
        )
    )
    return message


def send_client_chat_message(
    db: Session,
    *,
    user_id: int,
    body: str,
    route_context: dict,
    source: str,
) -> dict:
    conversation = (
        db.query(WebConversation)
        .filter(
            WebConversation.user_id == user_id,
            WebConversation.status == "open",
        )
        .order_by(WebConversation.updated_at.desc())
        .first()
    )
    if not conversation:
        conversation = WebConversation(
            user_id=user_id,
            source=source,
            route_context=route_context,
        )
        db.add(conversation)
        db.flush()
    elif route_context:
        conversation.route_context = route_context

    create_client_message(db, conversation, body)
    db.commit()
    db.refresh(conversation)
    return serialize_client_chat(db, conversation)
