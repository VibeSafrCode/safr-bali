"""One device-bound guest dialogue. No account or contact based association."""
from datetime import datetime, timedelta
import secrets

from fastapi import APIRouter, Cookie, Header, HTTPException, Request, Response, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, UUID4
from sqlalchemy.exc import IntegrityError, OperationalError

from app.api.web_portal import validated_origin, token_hash
from app.core.config import settings
from app.core import security
from app.db.session import SessionLocal
from app.models.web_portal import GuestChatSession, WebConversation, WebMessage, WebOutboxEvent
from app.schemas.client_portal import RouteContext
from app.services.client_portal import (
    bound_chat_transaction, create_client_message, message_source_event,
    request_key, request_fingerprint, serialize_client_chat,
)

COOKIE = "__Host-safr_guest"
TTL = timedelta(days=30)
router = APIRouter(prefix="/api/web/chat/guest", tags=["guest-chat"],
                   dependencies=[Depends(security.rate_limit)])


class SessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    restart: bool = False


class MessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: str = Field(min_length=1, max_length=4000)
    idempotency_key: UUID4
    route_context: RouteContext = Field(default_factory=RouteContext)
    name: str | None = Field(default=None, min_length=2, max_length=120)
    contact: str | None = Field(default=None, min_length=3, max_length=255)
    website: str = Field(default="", max_length=255)


def origin():
    return validated_origin(settings.WEBSITE_URL, production_host="safrway.online")


def check_origin(request):
    # Compare the serialized Origin exactly, not a suffix or a normalized URL.
    if request.headers.get("origin", "") != origin():
        raise HTTPException(403, "Origin denied")


def csrf(raw):
    return token_hash("safr-guest-csrf:" + raw)


def check_csrf(raw, supplied):
    if (not raw or len(supplied) != 64 or any(ch not in "0123456789abcdef" for ch in supplied)
            or not secrets.compare_digest(supplied, csrf(raw))):
        raise HTTPException(403, "CSRF validation failed")


def proof(db, raw, *, lock=False):
    if not raw or len(raw) > 128:
        raise HTTPException(401, "Guest session unavailable")
    bound_chat_transaction(db)
    query = db.query(GuestChatSession).filter(GuestChatSession.token_hash == token_hash(raw))
    row = (query.with_for_update() if lock else query).first()
    if not row or row.revoked_at is not None or row.expires_at <= datetime.utcnow() or row.origin != origin():
        raise HTTPException(401, "Guest session unavailable")
    return row


def result(db, row, raw, **extra):
    chat = {"id": None, "status": "empty", "messages": []}
    if row.conversation_id is not None:
        conversation = db.get(WebConversation, row.conversation_id)
        if not conversation or conversation.user_id is not None or conversation.source != "website":
            raise HTTPException(401, "Guest session unavailable")
        # Project public text only; names, contacts, actor IDs and notes stay private.
        projected = serialize_client_chat(db, conversation)
        chat = {key: projected[key] for key in ("id", "status", "messages")}
    return JSONResponse(jsonable_encoder(dict(session_id=row.id, expires_at=row.expires_at,
        csrf_token=csrf(raw), chat=chat, **extra)), headers={"Cache-Control": "private, no-store", "Vary": "Cookie"})


def budget(request, kind, limit, window=60):
    host = request.client.host if request.client else "unknown"
    if not security.rate_limiter.check("guest-" + kind + ":" + host, limit, window):
        raise HTTPException(429, "Please wait before trying again")


@router.get("/session")
def read_session(request: Request, raw: str | None = Cookie(default=None, alias=COOKIE)):
    if "origin" in request.headers:
        check_origin(request)
    with SessionLocal() as db:
        return result(db, proof(db, raw), raw)


@router.post("/session")
def start_session(payload: SessionRequest, request: Request,
                  raw: str | None = Cookie(default=None, alias=COOKIE),
                  csrf_token: str = Header(default="", alias="X-CSRF-Token")):
    check_origin(request)
    with SessionLocal() as db:
        bound_chat_transaction(db)
        current = None
        if raw:
            try:
                current = proof(db, raw, lock=True)
            except HTTPException as exc:
                if exc.status_code != 401 or not payload.restart:
                    raise
        if current is not None and not payload.restart:
            return result(db, current, raw)
        if current is not None:
            check_csrf(raw, csrf_token)
            current.revoked_at = datetime.utcnow()
        budget(request, "create-minute", 6)
        budget(request, "create-hour", 30, 3600)
        fresh = secrets.token_urlsafe(48)
        now = datetime.utcnow()
        row = GuestChatSession(token_hash=token_hash(fresh), origin=origin(),
                               expires_at=now + TTL, created_at=now)
        db.add(row)
        db.flush()
        response = result(db, row, fresh)
        db.commit()
        response.set_cookie(COOKIE, fresh, max_age=int(TTL.total_seconds()), path="/",
                            secure=True, httponly=True, samesite="strict")
        return response


@router.delete("/session", status_code=204)
def revoke_session(request: Request, raw: str | None = Cookie(default=None, alias=COOKIE),
                   csrf_token: str = Header(default="", alias="X-CSRF-Token")):
    check_origin(request)
    check_csrf(raw, csrf_token)
    with SessionLocal() as db:
        row = proof(db, raw, lock=True)
        row.revoked_at = datetime.utcnow()
        db.commit()
    response = Response(status_code=204, headers={"Cache-Control": "private, no-store"})
    response.delete_cookie(COOKIE, path="/", secure=True, httponly=True, samesite="strict")
    return response


@router.post("/messages", status_code=201)
def send_message(payload: MessageRequest, request: Request,
                 raw: str | None = Cookie(default=None, alias=COOKIE),
                 csrf_token: str = Header(default="", alias="X-CSRF-Token")):
    check_origin(request)
    check_csrf(raw, csrf_token)
    if not payload.body.strip():
        raise HTTPException(422, "Message required")
    context = payload.route_context.model_dump(exclude_none=True)
    with SessionLocal() as db:
        try:
            # The one session row serializes creation, sends, retries and revocation.
            row = proof(db, raw, lock=True)
            if payload.website:
                raise HTTPException(422, "Message unavailable")
            key = request_key("guest-session:" + str(row.id), payload.idempotency_key)
            fingerprint = request_fingerprint(body=payload.body, context=context, source="website",
                identity={"session_id": row.id, "name": payload.name, "contact": payload.contact})
            existing = db.query(WebMessage).filter(WebMessage.idempotency_key == key).first()
            if existing is not None:
                event = message_source_event(db, existing)
                if (existing.conversation_id != row.conversation_id or existing.author_type != "client"
                        or existing.visibility != "client" or existing.body != payload.body.strip()
                        or not event or event.payload.get("request_fingerprint") != fingerprint):
                    raise HTTPException(409, "Message replay conflict")
                response = result(db, row, raw, accepted=True, message_id=existing.id, idempotent_replay=True)
                response.status_code = 201
                return response
            # Durable per-session budget is shared by workers, under the same lock.
            since = datetime.utcnow() - timedelta(hours=1)
            count = db.query(WebMessage).filter(WebMessage.conversation_id == row.conversation_id,
                WebMessage.author_type == "client", WebMessage.created_at > since).count() if row.conversation_id else 0
            if count >= 60:
                raise HTTPException(429, "Please wait before sending another message")
            conversation = db.get(WebConversation, row.conversation_id) if row.conversation_id else None
            if row.conversation_id and (not conversation or conversation.user_id is not None or conversation.source != "website"):
                raise HTTPException(401, "Guest session unavailable")
            if conversation is None:
                conversation = WebConversation(source="website", guest_name=(payload.name or "Гость сайта").strip(),
                    guest_contact=payload.contact.strip() if payload.contact else None, route_context=context)
                db.add(conversation)
                db.flush()
                row.conversation_id = conversation.id
            if conversation.status != "open":
                raise HTTPException(409, "Conversation is closed")
            message = create_client_message(db, conversation, payload.body, route_context=context,
                source="website", idempotency_key=key, fingerprint=fingerprint)
            db.flush()
            response = result(db, row, raw, accepted=True, message_id=message.id, idempotent_replay=False)
            response.status_code = 201
            db.commit()
            return response
        except (IntegrityError, OperationalError):
            db.rollback()
            # A retry uses this same endpoint/key and authenticates again. Never
            # return a cached body after a competing revocation or an unknown commit.
            raise HTTPException(503, "Message outcome unresolved; retry the same key") from None
