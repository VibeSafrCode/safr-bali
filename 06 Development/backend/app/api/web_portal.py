from __future__ import annotations

import base64
import hashlib
import re
import secrets
from copy import deepcopy
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Literal, Optional
from urllib.parse import urlencode, urlsplit

import httpx
import jwt
from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from fastapi.responses import RedirectResponse
from jwt import PyJWKClient
from pydantic import BaseModel, Field, StrictInt, UUID4, model_validator
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, OperationalError

from app.core.config import settings
from app.core.security import rate_limit, require_service_token
from app.db.session import SessionLocal
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.services.referral_stats import direct_referral_count
from app.models.service import Service
from app.models.user import User
from app.models.web_portal import (
    WebAuthChallenge,
    WebConversation,
    WebMessage,
    WebOutboxEvent,
    WebSession,
)
from app.models.yoga_channel import YogaChannelBinding
from app.services import yoga_channel
from app.api.client_ui_preference_response import preference_write_response
from app.schemas.client_portal import ChatMessageRequest, RouteContext
from app.schemas.client_ui_preference import ClientUIPreferenceWrite
from app.services.client_ui_preference import (
    preference_projection, save_preference,
)
from app.services.client_portal import (
    ClientMessageConflict,
    ClientMessageUnavailable,
    bound_chat_transaction,
    create_client_message,
    load_client_chat,
    message_source_event,
    send_client_chat_message,
    send_guest_chat_message,
)
from app.services.referral_attribution import attribute_referral_once
from app.services.exchange_quotes import (
    CURRENCY_OPTIONS,
    ExchangeQuoteUnavailable,
    ExchangeRateUnavailable,
    ExchangeRequestConflict,
    UnsupportedExchangePair,
    active_route_options,
    create_exchange_quote,
    create_exchange_request,
    public_exchange_request,
    public_quote,
)


router = APIRouter(
    prefix="/api/web",
    tags=["web-portal"],
    dependencies=[Depends(rate_limit)],
)


class WebLocaleRequest(BaseModel):
    locale: Literal["ru", "en"]


class WebExchangeQuoteRequest(BaseModel):
    route_code: Optional[str] = Field(default=None, min_length=3, max_length=50)
    mode: Optional[str] = Field(default=None, pattern="^(GIVE|RECEIVE)$")
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=8)
    give_currency: Optional[str] = Field(default=None, min_length=2, max_length=30)
    receive_currency: Optional[str] = Field(default=None, min_length=2, max_length=30)
    amount_side: Optional[str] = Field(default=None, pattern="^(give|receive)$")


class WebExchangeRequestCreate(BaseModel):
    quote_id: str = Field(min_length=36, max_length=36)


service_router = APIRouter(
    prefix="/api/web/staff",
    tags=["web-portal-staff"],
    dependencies=[Depends(rate_limit), Depends(require_service_token)],
)


def utcnow() -> datetime:
    return datetime.utcnow()


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def is_public_return_path(value: Optional[str]) -> bool:
    if value == "/":
        return True
    return bool(
        value
        and re.fullmatch(r"/(?:en/)?(?:[a-z0-9][a-z0-9-]*/)+", value)
        and not value.startswith(("/account/", "/admin/", "/api/", "/mini-app/"))
    )


def safe_return_path(value: Optional[str]) -> str:
    if value == "/calculator/":
        return value
    if value == "/admin":
        return "/admin/"
    if value and re.fullmatch(
        r"/admin/(?:[A-Za-z0-9_-]+/)*",
        value,
    ):
        return value[:500]
    if value == "/account":
        return "/account/"
    if value and re.fullmatch(
        r"/account/(?:[A-Za-z0-9_-]+/)*",
        value,
    ):
        return value[:500]
    if is_public_return_path(value):
        return value[:500]
    return "/account/"


def validated_origin(value: str, *, production_host: str) -> str:
    origin = value.rstrip("/")
    parsed = urlsplit(origin)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path
        or parsed.query
        or parsed.fragment
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Application URL is not configured",
        )
    if settings.ENVIRONMENT == "production" and (
        parsed.scheme != "https" or parsed.hostname != production_host
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Application URL is not configured",
        )
    return origin


def auth_redirect_location(return_to: Optional[str]) -> str:
    safe_path = safe_return_path(return_to)
    if is_public_return_path(safe_path):
        origin = validated_origin(
            settings.WEBSITE_URL,
            production_host="safrway.online",
        )
    else:
        origin = validated_origin(
            settings.APPLICATION_URL,
            production_host="app.safrway.online",
        )
    return f"{origin}{safe_path}"


def web_session_cookie_domain() -> Optional[str]:
    if settings.ENVIRONMENT != "production":
        return None
    validated_origin(settings.APPLICATION_URL, production_host="app.safrway.online")
    validated_origin(settings.WEBSITE_URL, production_host="safrway.online")
    return ".safrway.online"


def account_redirect_location(return_to: Optional[str]) -> str:
    origin = validated_origin(
        settings.APPLICATION_URL,
        production_host="app.safrway.online",
    )

    location = f"{origin}/account/"
    if return_to is not None:
        safe_path = safe_return_path(return_to)
        if safe_path == return_to:
            location = f"{location}?{urlencode({'return_to': safe_path})}"
    return location


@router.get("/account-redirect", include_in_schema=False)
def account_redirect(
    return_to: Optional[str] = Query(default=None, max_length=500),
):
    return RedirectResponse(
        account_redirect_location(return_to),
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def web_login_configured() -> bool:
    return bool(
        settings.TELEGRAM_OIDC_CLIENT_ID.strip()
        and settings.TELEGRAM_OIDC_CLIENT_SECRET.strip()
    )


def decode_telegram_id_token(id_token: str, expected_nonce: str) -> dict:
    signing_key = PyJWKClient(settings.TELEGRAM_OIDC_JWKS_URL).get_signing_key_from_jwt(
        id_token
    )
    claims = jwt.decode(
        id_token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.TELEGRAM_OIDC_CLIENT_ID,
        issuer=settings.TELEGRAM_OIDC_ISSUER,
        options={"require": ["exp", "iat", "iss", "aud", "sub"]},
    )
    if not secrets.compare_digest(str(claims.get("nonce", "")), expected_nonce):
        raise ValueError("Telegram nonce is invalid")
    try:
        telegram_id = int(claims["id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Telegram user id is invalid") from exc
    if telegram_id <= 0:
        raise ValueError("Telegram user id is invalid")
    return {**claims, "telegram_id": telegram_id}


def exchange_telegram_code(code: str, verifier: str) -> dict:
    with httpx.Client(timeout=10.0) as client:
        response = client.post(
            settings.TELEGRAM_OIDC_TOKEN_URL,
            auth=httpx.BasicAuth(
                settings.TELEGRAM_OIDC_CLIENT_ID,
                settings.TELEGRAM_OIDC_CLIENT_SECRET,
            ),
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.TELEGRAM_OIDC_REDIRECT_URI,
                "client_id": settings.TELEGRAM_OIDC_CLIENT_ID,
                "code_verifier": verifier,
            },
        )
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload, dict) or not payload.get("id_token"):
        raise ValueError("Telegram did not return an ID token")
    return payload


def make_unique_ref_code(db: Session, telegram_id: int) -> str:
    base = f"S{telegram_id:x}".upper()
    candidate = base
    suffix = 1
    while db.query(User.id).filter(User.ref_code == candidate).first():
        suffix += 1
        candidate = f"{base}{suffix}"
    return candidate


def find_inviter(
    db: Session,
    ref_code: Optional[str],
) -> Optional[User]:
    if not ref_code:
        return None
    return db.query(User).filter(User.ref_code == ref_code).first()


def upsert_oidc_user(
    db: Session,
    claims: dict,
    ref_code: Optional[str],
) -> tuple[User, bool]:
    telegram_id = claims["telegram_id"]
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if user:
        user.username = claims.get("preferred_username") or claims.get("username")
        user.first_name = claims.get("given_name") or claims.get("name")
        user.last_name = claims.get("family_name")
        if user.invited_by_user_id is None:
            explicit = find_inviter(db, ref_code)
            reason = "valid_explicit"
            source = "explicit_referral"
            if not explicit or explicit.telegram_id == telegram_id:
                reason = "self_referral_rejected" if explicit else (
                    "invalid_referral" if ref_code else "no_referrer"
                )
                source = "default_main_admin"
                explicit = db.query(User).filter(
                    User.telegram_id == settings.DEFAULT_ADMIN_TELEGRAM_ID
                ).first()
            if explicit and explicit.id != user.id:
                attribute_referral_once(
                    db,
                    user_id=user.id,
                    inviter_id=explicit.id,
                    source=source,
                    attribution_reason=reason,
                )
        return user, False

    inviter = find_inviter(db, ref_code)
    source = "explicit_referral"
    reason = "valid_explicit"
    if not inviter or inviter.telegram_id == telegram_id:
        source = "default_main_admin"
        reason = "self_referral_rejected" if inviter else (
            "invalid_referral" if ref_code else "no_referrer"
        )
        inviter = db.query(User).filter(
            User.telegram_id == settings.DEFAULT_ADMIN_TELEGRAM_ID
        ).first()
    user = User(
        telegram_id=telegram_id,
        username=claims.get("preferred_username") or claims.get("username"),
        first_name=claims.get("given_name") or claims.get("name"),
        last_name=claims.get("family_name"),
        language="ru",
        role="client",
        ref_code=make_unique_ref_code(db, telegram_id),
        invited_by_user_id=None,
        status="active",
    )
    db.add(user)
    db.flush()
    if inviter:
        attribute_referral_once(
            db,
            user_id=user.id,
            inviter_id=inviter.id,
            source=source,
            attribution_reason=reason,
        )
    db.add(
        WebOutboxEvent(
            event_type="web_user_registered",
            aggregate_id=user.id,
            payload={
                "telegram_id": telegram_id,
                "first_name": user.first_name,
                "username": user.username,
                "ref_code": user.ref_code,
                "invited_by_telegram_id": inviter.telegram_id if inviter else None,
            },
        )
    )
    return user, True


def optional_session_user(session_token: Optional[str]) -> Optional[User]:
    if not session_token:
        return None
    db = SessionLocal()
    try:
        session = (
            db.query(WebSession)
            .filter(
                WebSession.token_hash == token_hash(session_token),
                WebSession.revoked_at.is_(None),
                WebSession.expires_at > utcnow(),
            )
            .first()
        )
        if not session:
            return None
        user = db.query(User).filter(User.id == session.user_id).first()
        if not user or user.status != "active":
            return None
        if session.last_seen_at < utcnow() - timedelta(minutes=15):
            session.last_seen_at = utcnow()
            db.commit()
            # Session.commit() expires loaded ORM attributes by default. Refresh
            # before detaching so the first request after the activity window
            # returns a fully usable User instead of a detached expired object.
            db.refresh(user)
        db.expunge(user)
        return user
    finally:
        db.close()


def session_user(
    session_token: Optional[str] = Cookie(
        default=None,
        alias=settings.WEB_SESSION_COOKIE_NAME,
    ),
) -> User:
    user = optional_session_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


@router.get("/auth/start")
def start_auth(
    return_to: str = Query(default="/account/"),
    via: Optional[str] = Query(default=None, max_length=100),
):
    if not web_login_configured():
        raise HTTPException(status_code=503, detail="Telegram login is not configured")

    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    nonce = secrets.token_urlsafe(32)
    db = SessionLocal()
    try:
        db.query(WebAuthChallenge).filter(
            WebAuthChallenge.expires_at <= utcnow()
        ).delete(synchronize_session=False)
        db.add(
            WebAuthChallenge(
                state_hash=token_hash(state),
                code_verifier=verifier,
                nonce=nonce,
                return_to=safe_return_path(return_to),
                ref_code=via or None,
                expires_at=utcnow() + timedelta(minutes=10),
            )
        )
        db.commit()
    finally:
        db.close()

    query = urlencode(
        {
            "response_type": "code",
            "client_id": settings.TELEGRAM_OIDC_CLIENT_ID,
            "redirect_uri": settings.TELEGRAM_OIDC_REDIRECT_URI,
            "scope": "openid profile",
            "state": state,
            "nonce": nonce,
            "code_challenge": pkce_challenge(verifier),
            "code_challenge_method": "S256",
        }
    )
    return RedirectResponse(f"{settings.TELEGRAM_OIDC_AUTH_URL}?{query}", status_code=302)


@router.get("/auth/callback")
def auth_callback(code: str, state: str):
    db = SessionLocal()
    try:
        challenge = (
            db.query(WebAuthChallenge)
            .filter(
                WebAuthChallenge.state_hash == token_hash(state),
                WebAuthChallenge.used_at.is_(None),
                WebAuthChallenge.expires_at > utcnow(),
            )
            .with_for_update()
            .first()
        )
        if not challenge:
            raise HTTPException(status_code=400, detail="Login request expired")
        challenge.used_at = utcnow()
        try:
            token_payload = exchange_telegram_code(code, challenge.code_verifier)
            claims = decode_telegram_id_token(
                token_payload["id_token"],
                challenge.nonce,
            )
        except (httpx.HTTPError, jwt.PyJWTError, ValueError) as exc:
            raise HTTPException(status_code=401, detail="Telegram login failed") from exc

        user, _ = upsert_oidc_user(db, claims, challenge.ref_code)
        db.query(WebSession).filter(
            (WebSession.expires_at <= utcnow()) | (WebSession.revoked_at.is_not(None))
        ).delete(synchronize_session=False)
        raw_session = secrets.token_urlsafe(48)
        db.add(
            WebSession(
                user_id=user.id,
                token_hash=token_hash(raw_session),
                expires_at=utcnow() + timedelta(days=settings.WEB_SESSION_TTL_DAYS),
            )
        )
        redirect_to = auth_redirect_location(challenge.return_to)
        db.commit()
    finally:
        db.close()

    response = RedirectResponse(redirect_to, status_code=303)
    cookie_domain = web_session_cookie_domain()
    response.delete_cookie(settings.WEB_SESSION_COOKIE_NAME, path="/")
    response.set_cookie(
        settings.WEB_SESSION_COOKIE_NAME,
        raw_session,
        max_age=settings.WEB_SESSION_TTL_DAYS * 86400,
        secure=settings.WEB_COOKIE_SECURE,
        httponly=True,
        samesite="lax",
        path="/",
        domain=cookie_domain,
    )
    return response


@router.get("/auth/me")
def auth_me(
    session_token: Optional[str] = Cookie(
        default=None,
        alias=settings.WEB_SESSION_COOKIE_NAME,
    ),
):
    user = optional_session_user(session_token)
    if not user:
        return {
            "authenticated": False,
            "login_configured": web_login_configured(),
        }
    return {
        "authenticated": True,
        "login_configured": web_login_configured(),
        "telegram_id": user.telegram_id,
        "first_name": user.first_name,
        "username": user.username,
        "locale": user.locale,
        "client_ui_preference": preference_projection(user),
        "csrf_token": hashlib.sha256(
            f"safr-admin-csrf:{session_token}".encode()
        ).hexdigest(),
    }


@router.post("/auth/logout", status_code=204)
def logout(
    response: Response,
    session_token: Optional[str] = Cookie(
        default=None,
        alias=settings.WEB_SESSION_COOKIE_NAME,
    ),
):
    if session_token:
        db = SessionLocal()
        try:
            session = (
                db.query(WebSession)
                .filter(WebSession.token_hash == token_hash(session_token))
                .first()
            )
            if session:
                session.revoked_at = utcnow()
                db.commit()
        finally:
            db.close()
    response.delete_cookie(settings.WEB_SESSION_COOKIE_NAME, path="/")
    cookie_domain = web_session_cookie_domain()
    if cookie_domain:
        response.delete_cookie(
            settings.WEB_SESSION_COOKIE_NAME,
            path="/",
            domain=cookie_domain,
        )


@router.patch("/locale")
def update_web_locale(
    payload: WebLocaleRequest,
    request: Request,
    user: User = Depends(session_user),
    session_token: str = Cookie(alias=settings.WEB_SESSION_COOKIE_NAME),
    csrf_token: str = Header(default="", alias="X-CSRF-Token"),
):
    expected_origin = settings.APPLICATION_URL.rstrip("/")
    if request.headers.get("origin", "").rstrip("/") != expected_origin:
        raise HTTPException(status_code=403, detail="Origin denied")
    expected_csrf = hashlib.sha256(
        f"safr-admin-csrf:{session_token}".encode()
    ).hexdigest()
    if not secrets.compare_digest(csrf_token, expected_csrf):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.id == user.id).with_for_update().first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        row.locale = payload.locale
        db.commit()
        return {"locale": row.locale}
    finally:
        db.close()


def require_web_session_write(
    request: Request,
    user: User = Depends(session_user),
    session_token: str = Cookie(alias=settings.WEB_SESSION_COOKIE_NAME),
    csrf_token: str = Header(default="", alias="X-CSRF-Token"),
) -> User:
    expected_origin = validated_origin(
        settings.APPLICATION_URL,
        production_host="app.safrway.online",
    )
    if request.headers.get("origin", "").rstrip("/") != expected_origin:
        raise HTTPException(status_code=403, detail="Origin denied")
    expected_csrf = hashlib.sha256(
        f"safr-admin-csrf:{session_token}".encode()
    ).hexdigest()
    if not secrets.compare_digest(csrf_token, expected_csrf):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    return user


@router.patch("/preferences/ui-locale")
def update_client_ui_preference(
    payload: ClientUIPreferenceWrite,
    user: User = Depends(require_web_session_write),
):
    return preference_write_response(user.id, payload, save_preference)


@router.get("/exchange/options")
def web_exchange_options(user: User = Depends(session_user)):
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
async def web_exchange_quote(
    payload: WebExchangeQuoteRequest,
    user: User = Depends(require_web_session_write),
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
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ExchangeRateUnavailable as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        db.close()


@router.post("/exchange/requests", status_code=201)
def web_exchange_request(
    payload: WebExchangeRequestCreate,
    idempotency_key: str = Header(
        alias="Idempotency-Key",
        min_length=1,
        max_length=100,
    ),
    user: User = Depends(require_web_session_write),
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
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    finally:
        db.close()


def dashboard_for_user(db: Session, user: User) -> dict:
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
    referral_count = direct_referral_count(db, user.id)
    return {
        "telegram_id": user.telegram_id,
        "locale": user.locale,
        "first_name": user.first_name,
        "username": user.username,
        "balance": last_operation.balance_after if last_operation else 0,
        "referral_count": referral_count,
        "referral_link": (
            f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={user.ref_code}"
        ),
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


@router.get("/account")
def account(user: User = Depends(session_user)):
    db = SessionLocal()
    try:
        attached_user = db.query(User).filter(User.id == user.id).first()
        return dashboard_for_user(db, attached_user)
    finally:
        db.close()


class GuestMessageRequest(ChatMessageRequest):
    name: str = Field(min_length=2, max_length=120)
    contact: str = Field(min_length=3, max_length=255)
    website: str = Field(default="", max_length=255)


@router.get("/chat")
def get_chat(user: User = Depends(session_user)):
    db = SessionLocal()
    try:
        return load_client_chat(db, user.id)
    finally:
        db.close()


@router.post("/chat/messages", status_code=201)
def send_chat_message(
    payload: ChatMessageRequest,
    user: User = Depends(require_web_session_write),
):
    if payload.expected_actor_telegram_id is not None and payload.expected_actor_telegram_id != user.telegram_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    db = SessionLocal()
    try:
        return send_client_chat_message(
            db,
            user_id=user.id,
            body=payload.body,
            route_context=payload.route_context.model_dump(exclude_none=True),
            source="website",
            idempotency_key=payload.idempotency_key,
        )
    except ClientMessageConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except ClientMessageUnavailable:
        raise HTTPException(status_code=503, detail="Message outcome unresolved; retry the same key") from None
    finally:
        db.close()


@router.post("/chat/guest", status_code=201)
def send_guest_message(payload: GuestMessageRequest):
    if payload.website:
        return {"accepted": True}
    db = SessionLocal()
    try:
        return send_guest_chat_message(db, name=payload.name, contact=payload.contact, body=payload.body,
            route_context=payload.route_context.model_dump(exclude_none=True), idempotency_key=payload.idempotency_key)
    except ClientMessageConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except ClientMessageUnavailable:
        raise HTTPException(status_code=503, detail="Message outcome unresolved; retry the same key") from None
    finally:
        db.close()


class DeliveryRequest(BaseModel):
    recipient_ids: list[int] = Field(default_factory=list)
    status: Literal["delivered", "failed"] = "delivered"
    error_code: Optional[str] = Field(default=None, max_length=80)
    delivery_results: dict[str, Literal["delivered", "failed", "unknown"]] = Field(default_factory=dict, max_length=100)
    attempt_id: Optional[UUID4] = None

    @model_validator(mode="before")
    @classmethod
    def strict_claimed_recipients(cls, value):
        # Preserve the historical unclaimed request parser. A present delivery
        # claim must not coerce bool/string/float recipients into a frozen ID.
        if isinstance(value, dict) and value.get("attempt_id") is not None:
            recipients = value.get("recipient_ids", [])
            if not isinstance(recipients, list) or len(recipients) > 100 or any(type(item) is not int or item == 0 for item in recipients):
                raise ValueError("Claimed delivery requires bounded integer recipient IDs")
        return value


class DeliveryClaimRequest(BaseModel):
    attempt_id: UUID4
    primary_ids: list[StrictInt] = Field(default_factory=list, max_length=100)
    observer_ids: list[StrictInt] = Field(default_factory=list, max_length=100)
    source_payload: dict
    message_body: Optional[str] = Field(default=None, max_length=4000)


class DeliveryReceiptRequest(DeliveryRequest):
    attempt_id: UUID4
    recipient_ids: list[StrictInt] = Field(default_factory=list, max_length=100)


def normalized_delivery_receipt(payload: DeliveryRequest) -> dict:
    return {"status": payload.status, "recipient_ids": list(dict.fromkeys(payload.recipient_ids)),
            "error_code": payload.error_code, "delivery_results": dict(payload.delivery_results)}


def validate_claimed_receipt(attempt: dict, receipt: dict) -> None:
    primary = attempt.get("primary_ids")
    observers = attempt.get("observer_ids")
    if (not isinstance(primary, list) or not isinstance(observers, list)
            or any(type(value) is not int or value == 0 for value in [*primary, *observers])
            or len(set([*primary, *observers])) != len(primary) + len(observers)
            or len(primary) + len(observers) > 100):
        raise HTTPException(status_code=409, detail="Event delivery plan unavailable")
    results = receipt.get("delivery_results")
    if (not isinstance(results, dict) or set(results) != {str(value) for value in [*primary, *observers]}
            or any(value not in {"delivered", "failed", "unknown"} for value in results.values())
            or receipt.get("recipient_ids") != [value for value in primary if results.get(str(value)) == "delivered"]
            or (receipt.get("status") == "delivered" and any(value != "delivered" for value in results.values()))):
        raise HTTPException(status_code=409, detail="Receipt does not match the frozen delivery plan")


class StaffMessageRequest(BaseModel):
    actor_telegram_id: int
    body: str = Field(min_length=1, max_length=4000)
    visibility: Literal["client", "internal"] = "client"
    idempotency_key: Optional[str] = Field(default=None, min_length=8, max_length=255)


class TelegramClientMessageRequest(BaseModel):
    actor_telegram_id: int
    body: str = Field(min_length=1, max_length=4000)
    idempotency_key: str = Field(min_length=8, max_length=255)


def yoga_binding(db: Session, conversation: WebConversation):
    binding = db.get(YogaChannelBinding, conversation.id)
    if not binding and conversation.source not in {"yoga_bot", "yoga_website"}:
        return None
    if not settings.YOGA_CHANNEL_ENABLED:
        raise HTTPException(status_code=503, detail="Yoga channel unavailable")
    if not binding:
        raise HTTPException(status_code=409, detail="Yoga source binding unavailable")
    return binding


def yoga_staff_ids():
    try:
        recipients = settings.yoga_main_staff_chat_ids
        if not recipients or len(recipients) > 100 or any(i <= 0 for i in recipients):
            raise ValueError
        return recipients
    except ValueError:
        raise HTTPException(status_code=503, detail="Yoga channel recipients unavailable") from None


def serialize_staff_conversation(db: Session, conversation: WebConversation, message_id: int | None = None) -> dict:
    binding = yoga_binding(db, conversation)
    user = (
        db.query(User).filter(User.id == conversation.user_id).first()
        if conversation.user_id
        else None
    )
    query = db.query(WebMessage).filter(WebMessage.conversation_id == conversation.id)
    if message_id is not None:
        messages = query.filter(WebMessage.id == message_id).all()
    else:
        messages = query.order_by(WebMessage.id.desc()).limit(200).all()
        messages.reverse()
    snapshots = {item.id: message_source_event(db, item) for item in messages if item.author_type == "client"}
    return {
        "id": conversation.id,
        "status": conversation.status,
        "client": {
            "telegram_id": user.telegram_id if user else None,
            "locale": user.locale if user else "ru",
            "first_name": user.first_name if user else conversation.guest_name,
            "username": user.username if user else None,
            "contact": conversation.guest_contact,
        },
        "route_context": conversation.route_context,
        "assigned_staff_ids": yoga_staff_ids() if binding else conversation.assigned_staff_ids,
        "reply_transport": "yoga" if binding else "safrway",
        "allow_client_reply": bool(binding.reply_chat_id) if binding else bool(user),
        "source_channel": ({"brand": yoga_channel.BRAND, "topic": binding.topic,
                            "marker": yoga_channel.BRAND + " · " + yoga_channel.topic_label(binding.topic)}
                           if binding else None),
        "messages": [
            {
                "id": item.id,
                "author_type": item.author_type,
                "actor_telegram_id": item.actor_telegram_id,
                "body": item.body,
                "visibility": item.visibility,
                "created_at": item.created_at,
                "route_context": snapshots[item.id].payload.get("route_context") if snapshots.get(item.id) else None,
                "source": snapshots[item.id].payload.get("source") if snapshots.get(item.id) else None,
            }
            for item in messages
        ],
    }


@service_router.get("/outbox")
def get_outbox(limit: int = Query(default=30, ge=1, le=100)):
    db = SessionLocal()
    try:
        events = (
            db.query(WebOutboxEvent)
            .filter(WebOutboxEvent.status.in_(["pending", "settling"]))
            .order_by(WebOutboxEvent.id.asc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": event.id,
                "event_type": event.event_type,
                "aggregate_id": event.aggregate_id,
                "status": event.status,
                "payload": event.payload,
                "created_at": event.created_at,
            }
            for event in events
        ]
    finally:
        db.close()


@service_router.post("/outbox/{event_id}/delivery-claim")
def claim_delivery(event_id: int, payload: DeliveryClaimRequest):
    db = SessionLocal()
    try:
        bound_chat_transaction(db)
        event = (db.query(WebOutboxEvent).filter(WebOutboxEvent.id == event_id).with_for_update().first())
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        current = event.payload
        if not isinstance(current, dict):
            raise HTTPException(status_code=409, detail="Event source data unavailable")
        token = str(payload.attempt_id)
        primary = list(dict.fromkeys(payload.primary_ids))
        observers = list(dict.fromkeys(payload.observer_ids))
        if (any(value == 0 for value in [*primary, *observers]) or set(primary) & set(observers)
                or len(primary) + len(observers) > 100):
            raise HTTPException(status_code=422, detail="Invalid delivery recipient plan")
        plan = {"attempt_id": token, "primary_ids": primary, "observer_ids": observers,
                "source_payload": deepcopy(payload.source_payload), "message_body": payload.message_body}
        existing = current.get("delivery_attempt")
        if "delivery_attempt" in current:
            if not isinstance(existing, dict):
                raise HTTPException(status_code=409, detail="Event delivery claim unavailable")
            if existing.get("attempt_id") == token and any(existing.get(key) != value for key, value in plan.items()):
                raise HTTPException(status_code=409, detail="Delivery claim replay conflict")
            return {"event_id": event.id, "attempt_id": token, "status": event.status, "send_authorized": False}
        if event.status != "pending":
            return {"event_id": event.id, "attempt_id": token, "status": event.status, "send_authorized": False}
        if (event.event_type not in {"web_user_registered", "web_chat_message", "web_staff_internal", "web_staff_client_message"}
                or any(key in current for key in {"settlement_receipt", "pending_settlement_receipt"})
                or current != payload.source_payload):
            raise HTTPException(status_code=409, detail="Event source or claim state conflict")
        if payload.message_body is not None:
            message_id = current.get("message_id")
            expected = {"web_chat_message": ("client", "client"), "web_staff_internal": ("staff", "internal"),
                        "web_staff_client_message": ("staff", "client")}.get(event.event_type)
            message = (db.query(WebMessage).filter(WebMessage.id == message_id,
                WebMessage.conversation_id == event.aggregate_id).first()) if type(message_id) is int else None
            if (not expected or not message or current.get("conversation_id") != event.aggregate_id
                    or (message.author_type, message.visibility) != expected or message.body != payload.message_body):
                raise HTTPException(status_code=409, detail="Event message body conflict")
        elif primary or observers:
            if event.event_type != "web_user_registered":
                raise HTTPException(status_code=409, detail="Event message body unavailable")
        plan["claimed_at"] = utcnow().isoformat()
        claimed = (db.query(WebOutboxEvent).filter(WebOutboxEvent.id == event_id, WebOutboxEvent.status == "pending")
            .update({WebOutboxEvent.status: "claimed", WebOutboxEvent.payload: {**current, "delivery_attempt": plan}},
                    synchronize_session=False))
        if claimed != 1:
            db.rollback()
            return {"event_id": event_id, "attempt_id": token, "status": "unresolved", "send_authorized": False}
        db.commit()
        # Only this first, committed response grants a transport attempt. A
        # replay/lost response never grants it again; claims never expire.
        return {"event_id": event_id, "attempt_id": token, "status": "claimed", "send_authorized": True}
    except OperationalError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Delivery claim unavailable; do not send") from None
    finally:
        db.close()


@service_router.post("/outbox/{event_id}/delivery-receipt")
def journal_delivery_receipt(event_id: int, payload: DeliveryReceiptRequest):
    db = SessionLocal()
    try:
        bound_chat_transaction(db)
        event = (db.query(WebOutboxEvent).filter(WebOutboxEvent.id == event_id).with_for_update().first())
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        current = event.payload
        attempt = current.get("delivery_attempt") if isinstance(current, dict) else None
        if not isinstance(attempt, dict) or attempt.get("attempt_id") != str(payload.attempt_id):
            raise HTTPException(status_code=409, detail="Event delivery claim conflict")
        receipt = normalized_delivery_receipt(payload)
        validate_claimed_receipt(attempt, receipt)
        previous = current.get("pending_settlement_receipt")
        if "pending_settlement_receipt" in current:
            if previous != receipt or event.status not in {"settling", "delivered", "failed"}:
                raise HTTPException(status_code=409, detail="Delivery receipt replay conflict")
            return {"ok": True, "idempotent_replay": True}
        if event.status != "claimed":
            raise HTTPException(status_code=409, detail="Event not awaiting a delivery receipt")
        journaled = (db.query(WebOutboxEvent).filter(WebOutboxEvent.id == event_id, WebOutboxEvent.status == "claimed")
            .update({WebOutboxEvent.status: "settling", WebOutboxEvent.payload: {**current, "pending_settlement_receipt": receipt}},
                    synchronize_session=False))
        if journaled != 1:
            db.rollback()
            bound_chat_transaction(db)
            winner = db.query(WebOutboxEvent).filter(WebOutboxEvent.id == event_id).first()
            if (winner and isinstance(winner.payload, dict) and winner.payload.get("delivery_attempt", {}).get("attempt_id") == str(payload.attempt_id)
                    and winner.payload.get("pending_settlement_receipt") == receipt and winner.status in {"settling", "delivered", "failed"}):
                return {"ok": True, "idempotent_replay": True}
            raise HTTPException(status_code=409, detail="Delivery receipt replay conflict")
        db.commit()
        return {"ok": True, "idempotent_replay": False}
    except OperationalError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Delivery receipt unavailable; retry the same receipt without sending") from None
    finally:
        db.close()


@service_router.post("/outbox/{event_id}/delivered")
def mark_delivered(event_id: int, payload: DeliveryRequest):
    db = SessionLocal()
    try:
        bound_chat_transaction(db)
        event = (
            db.query(WebOutboxEvent)
            .filter(WebOutboxEvent.id == event_id)
            .with_for_update()
            .first()
        )
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        receipt = normalized_delivery_receipt(payload)
        current_payload = event.payload or {}
        if not isinstance(current_payload, dict):
            raise HTTPException(status_code=409, detail="Event receipt data unavailable")
        attempt = current_payload.get("delivery_attempt")
        initial_status = "pending"
        if "delivery_attempt" in current_payload:
            if (not isinstance(attempt, dict) or payload.attempt_id is None
                    or attempt.get("attempt_id") != str(payload.attempt_id)
                    or current_payload.get("pending_settlement_receipt") != receipt):
                raise HTTPException(status_code=409, detail="Durable delivery receipt required")
            validate_claimed_receipt(attempt, receipt)
            initial_status = "settling"
        elif payload.attempt_id is not None or "pending_settlement_receipt" in current_payload:
            raise HTTPException(status_code=409, detail="Event has no delivery claim")
        previous = current_payload.get("settlement_receipt")
        if "settlement_receipt" in current_payload:
            if not isinstance(previous, dict) or previous != receipt or event.status != previous.get("status"):
                raise HTTPException(status_code=409, detail="Event already settled with a different receipt")
            return {"ok": True, "idempotent_replay": True}
        if event.status != initial_status:
            if attempt is not None:
                raise HTTPException(status_code=409, detail="Event is not awaiting settlement")
            # Historical settled events have no exact receipt to replay. Never
            # manufacture one or downgrade their delivery/assignment evidence.
            return {"ok": True, "idempotent_replay": True, "legacy_settlement_preserved": True}
        if (payload.status == "delivered" and any(value != "delivered" for value in payload.delivery_results.values())):
            raise HTTPException(status_code=409, detail="Incomplete delivery cannot be marked delivered")
        if payload.delivery_results and any(payload.delivery_results.get(str(value)) != "delivered" for value in receipt["recipient_ids"]):
            raise HTTPException(status_code=409, detail="Recipient delivery confirmation missing")
        assignment_updated = False
        conversation = None
        message = None
        if event.event_type == "web_chat_message" and event.aggregate_id:
            conversation = (db.query(WebConversation).filter(WebConversation.id == event.aggregate_id)
                            .with_for_update().first())
            message_id = current_payload.get("message_id")
            message = (db.query(WebMessage).filter(WebMessage.id == message_id,
                WebMessage.conversation_id == event.aggregate_id, WebMessage.author_type == "client",
                WebMessage.visibility == "client").first()) if type(message_id) is int else None
            if not conversation or not message or current_payload.get("conversation_id") != conversation.id:
                raise HTTPException(status_code=409, detail="Event message identity unavailable")
        settled_payload = {**current_payload, "settlement_receipt": receipt}
        if payload.delivery_results or payload.error_code:
            settled_payload = {**settled_payload, "delivery_report": {
                "recipients": payload.delivery_results, "error_code": payload.error_code,
            }}
        # The conditional write is also atomic when SQLite ignores row locks.
        # Never dirty the conversation before claiming the first settlement.
        claimed = (db.query(WebOutboxEvent).filter(WebOutboxEvent.id == event_id, WebOutboxEvent.status == initial_status)
            .update({WebOutboxEvent.status: payload.status, WebOutboxEvent.payload: settled_payload,
                     WebOutboxEvent.delivered_at: utcnow() if payload.status == "delivered" else None,
                     WebOutboxEvent.attempts: WebOutboxEvent.attempts + 1}, synchronize_session=False))
        if claimed != 1:
            db.rollback()
            bound_chat_transaction(db)
            winner = db.query(WebOutboxEvent).filter(WebOutboxEvent.id == event_id).first()
            if winner and isinstance(winner.payload, dict) and winner.payload.get("settlement_receipt") == receipt and winner.status == receipt["status"]:
                return {"ok": True, "idempotent_replay": True}
            raise HTTPException(status_code=409, detail="Event already settled with a different receipt")
        if conversation is not None and message is not None:
            newest_client_id = (db.query(WebMessage.id).filter(WebMessage.conversation_id == conversation.id,
                WebMessage.author_type == "client", WebMessage.visibility == "client")
                .order_by(WebMessage.id.desc()).limit(1).scalar())
            if message.id == newest_client_id:
                conversation.assigned_staff_ids = receipt["recipient_ids"]
                assignment_updated = True
        db.commit()
        return {"ok": True, "idempotent_replay": False, "assignment_updated": assignment_updated}
    except OperationalError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Event settlement unavailable; retry the same receipt") from None
    finally:
        db.close()


@service_router.get("/conversations/{conversation_id}")
def get_staff_conversation(conversation_id: int, message_id: Optional[int] = Query(default=None, gt=0)):
    db = SessionLocal()
    try:
        conversation = (
            db.query(WebConversation)
            .filter(WebConversation.id == conversation_id)
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return serialize_staff_conversation(db, conversation, message_id=message_id)
    finally:
        db.close()


@service_router.post("/conversations/{conversation_id}/messages", status_code=201)
def add_staff_message(conversation_id: int, payload: StaffMessageRequest):
    db = SessionLocal()
    try:
        conversation = (
            db.query(WebConversation)
            .filter(WebConversation.id == conversation_id)
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        binding = yoga_binding(db, conversation)
        if binding:
            recipients = yoga_staff_ids()
            if payload.actor_telegram_id not in recipients:
                raise HTTPException(status_code=403, detail="Staff access denied")
            if not payload.idempotency_key:
                raise HTTPException(status_code=422, detail="Yoga staff reply idempotency key required")
            yoga_channel._lock(db, "staff-reply:" + payload.idempotency_key)
            conversation.assigned_staff_ids = recipients
        if payload.idempotency_key:
            existing = db.query(WebMessage).filter(WebMessage.idempotency_key == payload.idempotency_key).first()
            if existing:
                if (existing.conversation_id != conversation.id or existing.author_type != "staff"
                        or existing.actor_telegram_id != payload.actor_telegram_id
                        or existing.body != payload.body.strip() or existing.visibility != payload.visibility):
                    raise HTTPException(status_code=409, detail="Message replay conflict")
                return {"id": existing.id, "conversation_id": conversation.id,
                        "visibility": existing.visibility, "idempotent_replay": True}
        message = WebMessage(
            conversation_id=conversation.id,
            author_type="staff",
            actor_telegram_id=payload.actor_telegram_id,
            body=payload.body.strip(),
            visibility=payload.visibility,
            idempotency_key=payload.idempotency_key,
        )
        db.add(message)
        conversation.updated_at = utcnow()
        if payload.visibility == "internal":
            db.flush()
            db.add(
                WebOutboxEvent(
                    event_type="web_staff_internal",
                    aggregate_id=conversation.id,
                    payload={
                        "conversation_id": conversation.id,
                        "message_id": message.id,
                        "actor_telegram_id": payload.actor_telegram_id,
                    },
                )
            )
        else:
            db.flush()
            if binding:
                policy = yoga_channel.ChannelPolicy(settings.YOGA_OBSERVER_TELEGRAM_ID,
                    tuple(yoga_staff_ids()), tuple(settings.support_chat_ids))
                yoga_channel.queue_staff_reply(db, message, policy=policy)
            else:
                db.add(WebOutboxEvent(event_type="web_staff_client_message", aggregate_id=conversation.id, payload={"conversation_id": conversation.id, "message_id": message.id, "recipient_user_id": conversation.user_id}, dedupe_key=f"web-staff:{message.id}"))
        db.commit()
        db.refresh(message)
        return {
            "id": message.id,
            "conversation_id": conversation.id,
            "visibility": message.visibility,
        }
    finally:
        db.close()


@service_router.post("/conversations/{conversation_id}/client-messages", status_code=201)
def add_telegram_client_message(conversation_id: int, payload: TelegramClientMessageRequest):
    db = SessionLocal()
    try:
        bound_chat_transaction(db)
        conversation = db.query(WebConversation).filter(WebConversation.id == conversation_id, WebConversation.status == "open").first()
        if not conversation or not conversation.user_id: raise HTTPException(status_code=404, detail="Conversation not found")
        if yoga_binding(db, conversation):
            raise HTTPException(status_code=403, detail="Original Yoga bot required")
        user = db.query(User).filter(User.id == conversation.user_id, User.telegram_id == payload.actor_telegram_id, User.status == "active").first()
        if not user: raise HTTPException(status_code=403, detail="Client access denied")
        existing = db.query(WebMessage).filter(WebMessage.idempotency_key == payload.idempotency_key).first()
        if existing:
            if (existing.conversation_id != conversation.id or existing.author_type != "client"
                    or existing.actor_telegram_id != user.telegram_id or existing.body != payload.body.strip()
                    or existing.visibility != "client"):
                raise HTTPException(status_code=409, detail="Message replay conflict")
            return {"id": existing.id, "conversation_id": conversation.id, "idempotent_replay": True}
        message = create_client_message(db, conversation, payload.body, source="telegram",
            idempotency_key=payload.idempotency_key, actor_telegram_id=user.telegram_id)
        accepted = {"id": message.id, "conversation_id": conversation.id, "idempotent_replay": False}
        db.commit()
        return accepted
    except (IntegrityError, OperationalError):
        db.rollback()
        raise HTTPException(status_code=503, detail="Message outcome unresolved; retry the same key") from None
    finally: db.close()
