"""Narrow credential-bound transport endpoints; no global staff/history access."""
from typing import Literal
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
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
        policy = channel.ChannelPolicy(getattr(settings, "YOGA_OBSERVER_TELEGRAM_ID", 0), ids, support_ids,
                                       tuple(settings.support_reply_chat_ids))
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


class AccountActor(StrictModel):
    # Derived by the trusted Yoga transport from the actual private update.
    sender_telegram_id: int = Field(gt=0, lt=2**63)
    chat_id: int = Field(gt=0, lt=2**63)


class AccountRegistration(AccountActor):
    username: str | None = Field(default=None, max_length=64)
    first_name: str | None = Field(default=None, max_length=64)
    last_name: str | None = Field(default=None, max_length=64)
    language: str | None = Field(default=None, max_length=20)
    start_payload: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]{1,64}$")
    contact_locale: Literal["ru", "en"] | None = None


def account_actor(payload: AccountActor, bot_key: str) -> int:
    if bot_key != "yoga":
        raise HTTPException(status_code=403, detail="Yoga account credential required")
    if getattr(settings, "YOGA_ACCOUNT_ENABLED", False) is not True:
        raise HTTPException(status_code=503, detail="Yoga account unavailable")
    if payload.chat_id != payload.sender_telegram_id:
        raise HTTPException(status_code=403, detail="Private account actor required")
    return payload.sender_telegram_id


def account_response(value):
    return JSONResponse(jsonable_encoder(value), headers={
        "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow"})


class AccountLocale(AccountActor):
    locale: Literal["ru", "en"]


@router.post("/account/locale")
def set_account_locale(payload: AccountLocale, bot_key=Depends(principal)):
    actor = account_actor(payload, bot_key)
    from app.models.user import User
    with SessionLocal() as db:
        if settings.BOT_MESSAGING_ENABLED:
            from app.services.onboarding import bot_transaction_lock
            bot_transaction_lock(db, "yoga")
        user = db.query(User).filter(User.telegram_id == actor).with_for_update().first()
        if user is None or user.status != "active":
            raise HTTPException(status_code=404, detail="Account unavailable")
        # The same canonical RU/EN preference, not another brand-language store.
        if user.locale != payload.locale:
            user.locale = payload.locale
        if settings.BOT_MESSAGING_ENABLED:
            from app.api.users import _record_private_yoga_contact
            _record_private_yoga_contact(db, user, {"locale": payload.locale,
                "event": f"yoga-private-locale:{actor}", "occurred_at": datetime.now(timezone.utc)})
        db.commit()
    return account_response({"telegram_id": actor, "locale": payload.locale})


@router.post("/account/register")
def register_account(payload: AccountRegistration, bot_key=Depends(principal)):
    actor = account_actor(payload, bot_key)
    from app.api.users import UserRegisterRequest, register_user_for_channel
    from app.services.locales import locale_from_language
    args = payload.start_payload or ""
    from app.services.public_referral_aliases import AliasUnavailable, referral_arguments
    try:
        with SessionLocal() as db:
            referral = referral_arguments(db, args, require_storage=settings.PUBLIC_REFERRAL_ALIAS_ISSUANCE_ENABLED)
    except AliasUnavailable:
        raise HTTPException(status_code=503, detail="Referral service temporarily unavailable") from None
    result = register_user_for_channel(UserRegisterRequest(
        telegram_id=actor, username=payload.username, first_name=payload.first_name,
        last_name=payload.last_name, language=payload.language,
        locale=locale_from_language(payload.language), **referral,
    ), channel="yoga", default_inviter_telegram_id=getattr(settings, "YOGA_PARTNER_TELEGRAM_ID", 0),
        private_contact={"locale": payload.contact_locale, "event": f"yoga-private-registration:{actor}",
                         "occurred_at": datetime.now(timezone.utc)} if settings.BOT_MESSAGING_ENABLED else None)
    return account_response({"telegram_id": result["telegram_id"], "user_id": result["id"],
        "ref_code": result["ref_code"], "status": result["status"], "is_new": result["is_new"],
        "referral_status": result["referral_status"]})


@router.post("/account/me")
def own_account(payload: AccountActor, bot_key=Depends(principal)):
    actor = account_actor(payload, bot_key)
    from app.models.user import User
    from app.api.referrals import get_user_referral_stats
    from app.api.users import get_user_dashboard
    with SessionLocal() as db:
        user = db.query(User).filter(User.telegram_id == actor).first()
        if user is None or user.status != "active":
            raise HTTPException(status_code=404, detail="Account unavailable")
        # The target is resolved only from the transport-verified sender. Reuse
        # canonical read helpers, never the generic API's arbitrary target ID.
        stats = get_user_referral_stats(user.id)
        dashboard = get_user_dashboard(actor)
    # Preserve the existing 30-most-recent-orders bound and expose only own
    # account fields. orders_count counts this bounded summary, not all history.
    orders = [{key: row[key] for key in (
        "id", "service", "status", "payment_status", "amount_usd", "created_at")}
        for row in dashboard["orders"][:30]]
    return account_response({"telegram_id": actor, **stats,
        "referral_payload": own_public_referral_alias(actor),
        "balance": dashboard["balance"], "orders_count": len(orders), "orders": orders})


def own_public_referral_alias(actor):
    from sqlalchemy.exc import SQLAlchemyError
    from app.services.public_referral_aliases import own_alias, AliasUnavailable, AliasActorUnavailable
    if not settings.PUBLIC_REFERRAL_ALIAS_ISSUANCE_ENABLED:
        return None
    from app.models.user import User
    try:
        with SessionLocal() as db:
            user = db.query(User).filter(User.telegram_id == actor, User.status == "active").first()
            if user is None:
                raise HTTPException(status_code=404, detail="Account unavailable")
            code = own_alias(db, user.id)
            db.commit()
            return code
    except AliasActorUnavailable:
        raise HTTPException(status_code=404, detail="Account unavailable") from None
    except (AliasUnavailable, SQLAlchemyError):
        raise HTTPException(status_code=503, detail="Referral service temporarily unavailable") from None


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
