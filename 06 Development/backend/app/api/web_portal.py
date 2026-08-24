from __future__ import annotations

import base64
import hashlib
import re
import secrets
from datetime import datetime, timedelta
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
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import rate_limit, require_service_token
from app.db.session import SessionLocal
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.service import Service
from app.models.user import User
from app.models.web_portal import (
    WebAuthChallenge,
    WebConversation,
    WebMessage,
    WebOutboxEvent,
    WebSession,
)
from app.schemas.client_portal import ChatMessageRequest, RouteContext
from app.services.client_portal import (
    create_client_message,
    load_client_chat,
    send_client_chat_message,
)
from app.services.referral_attribution import attribute_referral_once


router = APIRouter(
    prefix="/api/web",
    tags=["web-portal"],
    dependencies=[Depends(rate_limit)],
)


class WebLocaleRequest(BaseModel):
    locale: Literal["ru", "en"]
service_router = APIRouter(
    prefix="/api/web/staff",
    tags=["web-portal-staff"],
    dependencies=[Depends(rate_limit), Depends(require_service_token)],
)


def utcnow() -> datetime:
    return datetime.utcnow()


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def safe_return_path(value: Optional[str]) -> str:
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
    return "/account/"


def account_redirect_location(return_to: Optional[str]) -> str:
    origin = settings.APPLICATION_URL.rstrip("/")
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
        parsed.scheme != "https" or parsed.hostname != "app.safrway.online"
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Application URL is not configured",
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
        redirect_to = challenge.return_to
        db.commit()
    finally:
        db.close()

    response = RedirectResponse(redirect_to, status_code=303)
    response.set_cookie(
        settings.WEB_SESSION_COOKIE_NAME,
        raw_session,
        max_age=settings.WEB_SESSION_TTL_DAYS * 86400,
        secure=settings.WEB_COOKIE_SECURE,
        httponly=True,
        samesite="lax",
        path="/",
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
    referral_count = (
        db.query(Referral)
        .filter(
            Referral.parent_user_id == user.id,
            Referral.level == 1,
            Referral.source == "explicit_referral",
        )
        .count()
    )
    return {
        "telegram_id": user.telegram_id,
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
    user: User = Depends(session_user),
):
    db = SessionLocal()
    try:
        return send_client_chat_message(
            db,
            user_id=user.id,
            body=payload.body,
            route_context=payload.route_context.model_dump(exclude_none=True),
            source="website",
        )
    finally:
        db.close()


@router.post("/chat/guest", status_code=201)
def send_guest_message(payload: GuestMessageRequest):
    if payload.website:
        return {"accepted": True}
    db = SessionLocal()
    try:
        conversation = WebConversation(
            guest_name=payload.name.strip(),
            guest_contact=payload.contact.strip(),
            route_context=payload.route_context.model_dump(exclude_none=True),
        )
        db.add(conversation)
        db.flush()
        create_client_message(db, conversation, payload.body)
        db.commit()
        return {"accepted": True, "conversation_id": conversation.id}
    finally:
        db.close()


class DeliveryRequest(BaseModel):
    recipient_ids: list[int] = Field(default_factory=list)
    status: Literal["delivered", "failed"] = "delivered"
    error_code: Optional[str] = Field(default=None, max_length=80)


class StaffMessageRequest(BaseModel):
    actor_telegram_id: int
    body: str = Field(min_length=1, max_length=4000)
    visibility: Literal["client", "internal"] = "client"


class TelegramClientMessageRequest(BaseModel):
    actor_telegram_id: int
    body: str = Field(min_length=1, max_length=4000)
    idempotency_key: str = Field(min_length=8, max_length=255)


def serialize_staff_conversation(db: Session, conversation: WebConversation) -> dict:
    user = (
        db.query(User).filter(User.id == conversation.user_id).first()
        if conversation.user_id
        else None
    )
    messages = (
        db.query(WebMessage)
        .filter(WebMessage.conversation_id == conversation.id)
        .order_by(WebMessage.id.asc())
        .limit(200)
        .all()
    )
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
        "assigned_staff_ids": conversation.assigned_staff_ids,
        "messages": [
            {
                "id": item.id,
                "author_type": item.author_type,
                "actor_telegram_id": item.actor_telegram_id,
                "body": item.body,
                "visibility": item.visibility,
                "created_at": item.created_at,
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
            .filter(WebOutboxEvent.status == "pending")
            .order_by(WebOutboxEvent.id.asc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": event.id,
                "event_type": event.event_type,
                "aggregate_id": event.aggregate_id,
                "payload": event.payload,
                "created_at": event.created_at,
            }
            for event in events
        ]
    finally:
        db.close()


@service_router.post("/outbox/{event_id}/delivered")
def mark_delivered(event_id: int, payload: DeliveryRequest):
    db = SessionLocal()
    try:
        event = (
            db.query(WebOutboxEvent)
            .filter(WebOutboxEvent.id == event_id)
            .with_for_update()
            .first()
        )
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        event.status = payload.status
        event.delivered_at = utcnow() if payload.status == "delivered" else None
        event.attempts += 1
        if event.event_type == "web_chat_message" and event.aggregate_id:
            conversation = (
                db.query(WebConversation)
                .filter(WebConversation.id == event.aggregate_id)
                .first()
            )
            if conversation:
                conversation.assigned_staff_ids = list(
                    dict.fromkeys(payload.recipient_ids)
                )
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@service_router.get("/conversations/{conversation_id}")
def get_staff_conversation(conversation_id: int):
    db = SessionLocal()
    try:
        conversation = (
            db.query(WebConversation)
            .filter(WebConversation.id == conversation_id)
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return serialize_staff_conversation(db, conversation)
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
        message = WebMessage(
            conversation_id=conversation.id,
            author_type="staff",
            actor_telegram_id=payload.actor_telegram_id,
            body=payload.body.strip(),
            visibility=payload.visibility,
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
        conversation = db.query(WebConversation).filter(WebConversation.id == conversation_id, WebConversation.status == "open").first()
        if not conversation or not conversation.user_id: raise HTTPException(status_code=404, detail="Conversation not found")
        user = db.query(User).filter(User.id == conversation.user_id, User.telegram_id == payload.actor_telegram_id, User.status == "active").first()
        if not user: raise HTTPException(status_code=403, detail="Client access denied")
        existing = db.query(WebMessage).filter(WebMessage.idempotency_key == payload.idempotency_key).first()
        if existing: return {"id": existing.id, "conversation_id": conversation.id, "idempotent_replay": True}
        message = WebMessage(conversation_id=conversation.id, author_type="client", actor_telegram_id=user.telegram_id, body=payload.body.strip(), visibility="client", idempotency_key=payload.idempotency_key)
        db.add(message); db.flush(); conversation.updated_at = utcnow()
        db.add(WebOutboxEvent(event_type="web_chat_message", aggregate_id=conversation.id, payload={"conversation_id": conversation.id, "message_id": message.id}, dedupe_key=f"telegram-client:{payload.idempotency_key}"))
        db.commit(); return {"id": message.id, "conversation_id": conversation.id, "idempotent_replay": False}
    finally: db.close()
