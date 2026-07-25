from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.security import rate_limit, require_service_token
from app.db.session import SessionLocal
from app.models.bot_runtime_event import BotRuntimeEvent


router = APIRouter(
    prefix="/bot-events",
    tags=["bot-events"],
    dependencies=[Depends(rate_limit), Depends(require_service_token)],
)


class BotEventCreateRequest(BaseModel):
    source_key: Optional[str] = Field(default=None, max_length=255)
    client_telegram_id: int
    actor_telegram_id: Optional[int] = None
    event_type: str = Field(min_length=1, max_length=50)
    text: Optional[str] = Field(default=None, max_length=10000)
    payload: dict[str, Any] = Field(default_factory=dict)


@router.post("")
def create_bot_event(payload: BotEventCreateRequest):
    db = SessionLocal()
    try:
        if payload.source_key:
            existing = (
                db.query(BotRuntimeEvent)
                .filter(BotRuntimeEvent.source_key == payload.source_key)
                .first()
            )
            if existing:
                return {"id": existing.id, "created_at": existing.created_at, "duplicate": True}
        event = BotRuntimeEvent(
            source_key=payload.source_key,
            client_telegram_id=payload.client_telegram_id,
            actor_telegram_id=payload.actor_telegram_id,
            event_type=payload.event_type,
            text=payload.text,
            payload=payload.payload,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return {"id": event.id, "created_at": event.created_at, "duplicate": False}
    finally:
        db.close()


@router.get("/{client_telegram_id}")
def list_bot_events(
    client_telegram_id: int,
    limit: int = Query(default=100, ge=1, le=500),
):
    db = SessionLocal()
    try:
        events = (
            db.query(BotRuntimeEvent)
            .filter(BotRuntimeEvent.client_telegram_id == client_telegram_id)
            .order_by(BotRuntimeEvent.id.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": event.id,
                "source_key": event.source_key,
                "client_telegram_id": event.client_telegram_id,
                "actor_telegram_id": event.actor_telegram_id,
                "event_type": event.event_type,
                "text": event.text,
                "payload": event.payload,
                "created_at": event.created_at,
            }
            for event in reversed(events)
        ]
    finally:
        db.close()
