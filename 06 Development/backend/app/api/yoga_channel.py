"""Narrow credential-bound transport endpoints; no global staff/history access."""
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.core.security import _safe_compare, rate_limit
from app.db.session import SessionLocal
from app.services import yoga_channel as channel

router = APIRouter(prefix="/api/yoga-channel", tags=["yoga-channel"], dependencies=[Depends(rate_limit)])


def principal(x_service_token: str = Header(default="", alias="X-Service-Token")):
    if getattr(settings, "YOGA_CHANNEL_ENABLED", False) is not True:
        raise HTTPException(status_code=503, detail="Yoga channel unavailable")
    yoga = getattr(settings, "YOGA_SERVICE_API_TOKEN", "")
    main = settings.SERVICE_API_TOKEN
    if not yoga.strip() or _safe_compare(yoga, main) or _safe_compare(yoga, settings.ADMIN_API_TOKEN):
        raise HTTPException(status_code=503, detail="Yoga channel unavailable")
    if _safe_compare(x_service_token, yoga):
        return "yoga"
    if _safe_compare(x_service_token, main):
        return "safrway"
    raise HTTPException(status_code=401, detail="Invalid channel credential")


def channel_policy():
    """Server-side config mirror of EXISTING bot staff recipients, not an ACL.

    Integration may override this FastAPI dependency with the existing resolver.
    Never accept recipient IDs from an intake request or add a User role here.
    """
    raw = getattr(settings, "YOGA_MAIN_STAFF_CHAT_IDS", "")
    try:
        ids = tuple(dict.fromkeys(int(value.strip()) for value in raw.split(",") if value.strip()))
        support = getattr(settings, "SUPPORT_CHAT_IDS", "")
        support_ids = tuple(dict.fromkeys(int(value.strip()) for value in support.split(",") if value.strip()))
        policy = channel.ChannelPolicy(getattr(settings, "YOGA_OBSERVER_TELEGRAM_ID", 0), ids, support_ids)
        policy.validate()
        return policy
    except (ValueError, TypeError, AttributeError, channel.ChannelError):
        raise HTTPException(status_code=503, detail="Yoga channel recipients unavailable") from None


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Inbound(StrictModel):
    update_id: int = Field(ge=0, lt=2**63)
    sender_telegram_id: int = Field(gt=0, lt=2**63)
    chat_id: int = Field(gt=0, lt=2**63)
    body: str = Field(min_length=1, max_length=4000)
    topic: str = Field(min_length=1, max_length=80, pattern=r"^[a-z][a-z0-9_-]*$")
    conversation_id: int | None = Field(default=None, gt=0)


class Claim(StrictModel):
    limit: int = Field(default=20, ge=1, le=50)


class Settlement(StrictModel):
    lease_token: str = Field(min_length=20, max_length=100)
    outcome: Literal["DELIVERED", "RETRY", "UNKNOWN", "FAILED"]
    error_code: str | None = Field(default=None, max_length=64)
    telegram_message_id: int | None = Field(default=None, gt=0)


def transact(fn):
    db = SessionLocal()
    try:
        value = fn(db)
        db.commit()
        return value
    except channel.ChannelError as error:
        db.rollback()
        raise HTTPException(status_code=error.status, detail=error.code) from None
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


@router.post("/inbound")
def inbound(payload: Inbound, bot_key=Depends(principal), policy=Depends(channel_policy)):
    if bot_key != "yoga":
        raise HTTPException(status_code=403, detail="Yoga inbound credential required")
    return transact(lambda db: channel.intake(db, **payload.model_dump(), policy=policy))


@router.get("/conversations/{conversation_id}")
def conversation(conversation_id: int, sender_telegram_id: int = Header(alias="X-Yoga-Sender-Id", gt=0),
                 bot_key=Depends(principal)):
    # Header avoids private client identity in URLs/access logs. The bot MUST
    # derive it from the actual Telegram sender, never /start/callback payload.
    if bot_key != "yoga":
        raise HTTPException(status_code=403, detail="Use existing main staff dialogue adapter")
    return transact(lambda db: channel.serialize(db, conversation_id, sender_telegram_id=sender_telegram_id))


@router.post("/deliveries/claim")
def claim(payload: Claim, bot_key=Depends(principal), policy=Depends(channel_policy)):
    return transact(lambda db: channel.claim(db, bot_key=bot_key, policy=policy, limit=payload.limit))


@router.post("/deliveries/{delivery_id}/settle")
def settle(delivery_id: int, payload: Settlement, bot_key=Depends(principal)):
    return transact(lambda db: channel.settle(db, bot_key=bot_key, delivery_id=delivery_id, **payload.model_dump()))
