from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from urllib.parse import parse_qsl

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    Header,
    HTTPException,
    Response,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import rate_limit
from app.db.session import SessionLocal
from app.models.mini_app_session import MiniAppSession
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.service import Service
from app.models.user import User
from app.schemas.client_portal import ChatMessageRequest
from app.schemas.locale import LocaleUpdateRequest
from app.services.client_portal import load_client_chat, send_client_chat_message
from app.services.exchange_quotes import (
    CURRENCY_OPTIONS,
    ExchangeQuoteUnavailable,
    ExchangeRateUnavailable,
    ExchangeRequestConflict,
    UnsupportedExchangePair,
    active_route_options,
    create_exchange_request,
    create_exchange_quote,
    public_exchange_request,
    public_quote,
)


router = APIRouter(
    prefix="/mini-app",
    tags=["mini-app"],
    dependencies=[Depends(rate_limit)],
)


class MiniAppAuthRequest(BaseModel):
    init_data: str = Field(min_length=1, max_length=8192)


class ExchangeQuoteRequest(BaseModel):
    route_code: Optional[str] = Field(default=None, min_length=3, max_length=50)
    mode: Optional[str] = Field(default=None, pattern="^(GIVE|RECEIVE)$")
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=8)
    give_currency: Optional[str] = Field(default=None, min_length=2, max_length=30)
    receive_currency: Optional[str] = Field(default=None, min_length=2, max_length=30)
    amount_side: Optional[str] = Field(default=None, pattern="^(give|receive)$")


class ExchangeRequestCreate(BaseModel):
    quote_id: str = Field(min_length=36, max_length=36)


@dataclass(frozen=True)
class IssuedSession:
    access_token: str
    refresh_token: str
    access_expires_at: datetime
    refresh_expires_at: datetime


def utcnow() -> datetime:
    return datetime.utcnow()


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def validate_telegram_init_data(
    init_data: str,
    bot_token: str,
    *,
    max_age_seconds: int = 600,
    now: int | None = None,
) -> dict:
    if not init_data or not bot_token:
        raise ValueError("Telegram authentication is not configured")

    pairs = parse_qsl(init_data, keep_blank_values=True)
    if len({key for key, _ in pairs}) != len(pairs):
        raise ValueError("Telegram authentication contains duplicate fields")
    values = dict(pairs)
    received_hash = values.pop("hash", "")
    if not received_hash:
        raise ValueError("Telegram hash is missing")

    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(values.items())
    )
    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(calculated_hash, received_hash):
        raise ValueError("Telegram signature is invalid")

    auth_date = int(values.get("auth_date", "0"))
    current_time = int(time.time()) if now is None else now
    if auth_date <= 0 or current_time - auth_date > max_age_seconds:
        raise ValueError("Telegram authentication has expired")
    if auth_date > current_time + 60:
        raise ValueError("Telegram authentication date is invalid")

    try:
        user = json.loads(values["user"])
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Telegram user is missing") from exc
    if not isinstance(user, dict) or not isinstance(user.get("id"), int):
        raise ValueError("Telegram user is invalid")

    return user


def issue_mini_app_session(
    db: Session,
    user: User,
    *,
    init_data_hash: str | None = None,
    now: datetime | None = None,
) -> IssuedSession:
    current_time = now or utcnow()
    access_token = secrets.token_urlsafe(48)
    refresh_token = secrets.token_urlsafe(48)
    access_expires_at = current_time + timedelta(
        minutes=settings.MINI_APP_ACCESS_TTL_MINUTES,
    )
    refresh_expires_at = current_time + timedelta(
        days=settings.MINI_APP_REFRESH_TTL_DAYS,
    )
    db.add(
        MiniAppSession(
            user_id=user.id,
            access_token_hash=token_hash(access_token),
            refresh_token_hash=token_hash(refresh_token),
            init_data_hash=init_data_hash,
            access_expires_at=access_expires_at,
            refresh_expires_at=refresh_expires_at,
            last_seen_at=current_time,
            created_at=current_time,
        )
    )
    db.commit()
    return IssuedSession(
        access_token=access_token,
        refresh_token=refresh_token,
        access_expires_at=access_expires_at,
        refresh_expires_at=refresh_expires_at,
    )


def rotate_mini_app_session(
    db: Session,
    refresh_token: str,
    *,
    now: datetime | None = None,
) -> IssuedSession | None:
    current_time = now or utcnow()
    session = (
        db.query(MiniAppSession)
        .filter(MiniAppSession.refresh_token_hash == token_hash(refresh_token))
        .with_for_update()
        .first()
    )
    if (
        not session
        or session.revoked_at is not None
        or session.refresh_expires_at <= current_time
    ):
        return None

    access_token = secrets.token_urlsafe(48)
    new_refresh_token = secrets.token_urlsafe(48)
    session.access_token_hash = token_hash(access_token)
    session.refresh_token_hash = token_hash(new_refresh_token)
    session.access_expires_at = current_time + timedelta(
        minutes=settings.MINI_APP_ACCESS_TTL_MINUTES,
    )
    session.refresh_expires_at = current_time + timedelta(
        days=settings.MINI_APP_REFRESH_TTL_DAYS,
    )
    session.last_seen_at = current_time
    session.rotated_at = current_time
    db.commit()
    return IssuedSession(
        access_token=access_token,
        refresh_token=new_refresh_token,
        access_expires_at=session.access_expires_at,
        refresh_expires_at=session.refresh_expires_at,
    )


def set_session_cookies(response: Response, issued: IssuedSession) -> None:
    cookie_options = {
        "httponly": True,
        "secure": settings.MINI_APP_COOKIE_SECURE,
        "samesite": "lax",
        "path": "/mini-app",
    }
    response.set_cookie(
        settings.MINI_APP_ACCESS_COOKIE_NAME,
        issued.access_token,
        max_age=settings.MINI_APP_ACCESS_TTL_MINUTES * 60,
        **cookie_options,
    )
    response.set_cookie(
        settings.MINI_APP_REFRESH_COOKIE_NAME,
        issued.refresh_token,
        max_age=settings.MINI_APP_REFRESH_TTL_DAYS * 86400,
        **cookie_options,
    )


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(
        settings.MINI_APP_ACCESS_COOKIE_NAME,
        path="/mini-app",
    )
    response.delete_cookie(
        settings.MINI_APP_REFRESH_COOKIE_NAME,
        path="/mini-app",
    )


def require_mini_app_user(
    access_token: str = Cookie(
        default="",
        alias=settings.MINI_APP_ACCESS_COOKIE_NAME,
    ),
) -> User:
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mini App session required",
        )

    current_time = utcnow()
    db = SessionLocal()
    try:
        session = (
            db.query(MiniAppSession)
            .filter(MiniAppSession.access_token_hash == token_hash(access_token))
            .first()
        )
        if (
            not session
            or session.revoked_at is not None
            or session.access_expires_at <= current_time
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Mini App session expired",
            )
        user = db.query(User).filter(User.id == session.user_id).first()
        if not user or user.status != "active":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Mini App user unavailable",
            )
        if session.last_seen_at < current_time - timedelta(minutes=5):
            session.last_seen_at = current_time
            db.commit()
            db.refresh(user)
        db.expunge(user)
        return user
    finally:
        db.close()


@router.post("/auth/session")
def create_mini_app_session(payload: MiniAppAuthRequest, response: Response):
    try:
        telegram_user = validate_telegram_init_data(
            payload.init_data,
            settings.TELEGRAM_BOT_TOKEN,
            max_age_seconds=600,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    db = SessionLocal()
    try:
        user = (
            db.query(User)
            .filter(User.telegram_id == telegram_user["id"])
            .first()
        )
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Open the SAFR bot before using the Mini App",
            )
        try:
            issued = issue_mini_app_session(
                db,
                user,
                init_data_hash=token_hash(payload.init_data),
            )
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Telegram authentication was already exchanged",
            ) from exc
        set_session_cookies(response, issued)
        return {
            "authenticated": True,
            "access_expires_in": settings.MINI_APP_ACCESS_TTL_MINUTES * 60,
        }
    finally:
        db.close()


@router.post("/auth/refresh")
def refresh_mini_app_session(
    response: Response,
    refresh_token: str = Cookie(
        default="",
        alias=settings.MINI_APP_REFRESH_COOKIE_NAME,
    ),
):
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mini App refresh session required",
        )
    db = SessionLocal()
    try:
        issued = rotate_mini_app_session(db, refresh_token)
        if not issued:
            clear_session_cookies(response)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Mini App refresh session expired",
            )
        set_session_cookies(response, issued)
        return {"authenticated": True}
    finally:
        db.close()


@router.post("/auth/logout")
def logout_mini_app_session(
    response: Response,
    access_token: str = Cookie(
        default="",
        alias=settings.MINI_APP_ACCESS_COOKIE_NAME,
    ),
):
    if access_token:
        db = SessionLocal()
        try:
            session = (
                db.query(MiniAppSession)
                .filter(
                    MiniAppSession.access_token_hash == token_hash(access_token)
                )
                .first()
            )
            if session and session.revoked_at is None:
                session.revoked_at = utcnow()
                db.commit()
        finally:
            db.close()
    clear_session_cookies(response)
    return {"authenticated": False}


@router.get("/me")
def get_mini_app_dashboard(user: User = Depends(require_mini_app_user)):
    db = SessionLocal()
    try:
        last_operation = (
            db.query(PointsLedger)
            .filter(PointsLedger.user_id == user.id)
            .order_by(PointsLedger.id.desc())
            .first()
        )
        orders = (
            db.query(Order, Service)
            .join(Service, Service.id == Order.service_id)
            .filter(Order.user_id == user.id)
            .order_by(Order.id.desc())
            .limit(30)
            .all()
        )
        referral_count = (
            db.query(Referral)
            .filter(
                Referral.parent_user_id == user.id,
                Referral.level == 1,
            )
            .count()
        )
        referral_code = (
            user.ref_code
            if user.ref_code and not user.ref_code.startswith("TG")
            else None
        )
        referral_link = (
            f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={referral_code}"
            if referral_code
            else None
        )

        return {
            "telegram_id": user.telegram_id,
            "locale": user.locale,
            "first_name": user.first_name,
            "username": user.username,
            "balance": last_operation.balance_after if last_operation else 0,
            "referral_count": referral_count,
            "referral_link": referral_link,
            "orders": [
                {
                    "id": order.id,
                    "service": service.name,
                    "status": order.status,
                    "payment_status": order.payment_status,
                    "amount_usd": order.amount_usd,
                    "created_at": order.created_at,
                }
                for order, service in orders
            ],
        }
    finally:
        db.close()


@router.patch("/locale")
def update_mini_app_locale(
    payload: LocaleUpdateRequest,
    user: User = Depends(require_mini_app_user),
):
    db = SessionLocal()
    try:
        stored = (
            db.query(User)
            .filter(User.id == user.id)
            .with_for_update()
            .first()
        )
        if not stored or stored.status != "active":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Mini App user unavailable",
            )
        changed = stored.locale != payload.locale
        if changed:
            stored.locale = payload.locale
            db.commit()
        else:
            db.rollback()
        return {"locale": payload.locale, "changed": changed}
    finally:
        db.close()


@router.get("/chat")
def get_mini_app_chat(user: User = Depends(require_mini_app_user)):
    db = SessionLocal()
    try:
        return load_client_chat(db, user.id)
    finally:
        db.close()


@router.post("/chat/messages", status_code=201)
def send_mini_app_chat_message(
    payload: ChatMessageRequest,
    user: User = Depends(require_mini_app_user),
):
    db = SessionLocal()
    try:
        return send_client_chat_message(
            db,
            user_id=user.id,
            body=payload.body,
            route_context=payload.route_context.model_dump(exclude_none=True),
            source="mini_app",
        )
    finally:
        db.close()


@router.get("/exchange/options")
def get_exchange_options(user: User = Depends(require_mini_app_user)):
    db = SessionLocal()
    try:
        routes = active_route_options(db)
        return {
            "give": CURRENCY_OPTIONS["give"],
            "receive": CURRENCY_OPTIONS["receive"],
            "routes": routes,
            "supported_pairs": routes,
            "manual_pairs_supported": True,
        }
    finally:
        db.close()


@router.post("/exchange/quotes", status_code=201)
async def create_mini_app_exchange_quote(
    payload: ExchangeQuoteRequest,
    user: User = Depends(require_mini_app_user),
):
    db = SessionLocal()
    try:
        quote = await create_exchange_quote(
            db,
            user=user,
            route_code=payload.route_code,
            mode=payload.mode,
            give_currency=payload.give_currency,
            receive_currency=payload.receive_currency,
            amount=payload.amount,
            amount_side=payload.amount_side,
        )
        return public_quote(quote)
    except UnsupportedExchangePair as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except ExchangeRateUnavailable as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    finally:
        db.close()


@router.post("/exchange/requests", status_code=201)
def create_mini_app_exchange_request(
    payload: ExchangeRequestCreate,
    idempotency_key: str = Header(
        alias="Idempotency-Key",
        min_length=1,
        max_length=100,
    ),
    user: User = Depends(require_mini_app_user),
):
    db = SessionLocal()
    try:
        result = create_exchange_request(
            db,
            user=user,
            quote_id=payload.quote_id,
            idempotency_key=idempotency_key,
        )
        return public_exchange_request(result)
    except (ExchangeRequestConflict, ExchangeQuoteUnavailable) as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    finally:
        db.close()
