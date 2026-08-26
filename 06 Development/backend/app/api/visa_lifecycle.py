from __future__ import annotations

import secrets
import hashlib
import os
import re
import shlex
import subprocess
import tempfile
import unicodedata
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from app.api.mini_app import require_mini_app_user
from app.api.web_admin import (
    admin_csrf_token,
    expected_application_origin,
    require_admin_write,
    require_web_admin,
    require_web_console_user,
)
from app.api.web_portal import session_user
from app.core.config import settings
from app.core.security import rate_limit, require_service_token
from app.db.session import SessionLocal
from app.models.user import User
from app.models.visa_lifecycle import (
    ClientInternalNote, ClientTag, ClientTagAssignment, CredentialVaultItem,
    VisaCase, VisaDocument, VisaEvent, VisaNotificationDelivery, VisaProcess, VisaType,
)
from app.models.admin_action import AdminAction
from app.models.web_portal import WebConversation, WebMessage, WebOutboxEvent
from sqlalchemy import case, func, or_
from app.services.document_storage import assess_document_storage
from app.services.visa_lifecycle import (
    EXTERNAL_STATUSES, LIFECYCLE_STATUSES, SERVICE_STATUSES, PIIEnvelopeCipher,
    VisaLifecycleError, append_event, claim_deliveries, ensure_feature_enabled,
    enqueue_delivery, mask_identifier, settle_delivery, validate_dates,
)
from app.services.visa_deletion import (
    VisaDeleteBlocked,
    build_visa_delete_plan,
    permanently_delete_visa_case,
)

mini_router = APIRouter(prefix="/mini-app/visa-cases", tags=["visa-lifecycle"], dependencies=[Depends(rate_limit)])
web_router = APIRouter(prefix="/api/web/visa-cases", tags=["visa-lifecycle"], dependencies=[Depends(rate_limit)])
admin_router = APIRouter(prefix="/api/web/admin/visa-cases", tags=["web-admin", "visa-lifecycle"], dependencies=[Depends(rate_limit)])
crm_router = APIRouter(prefix="/api/web/admin/clients", tags=["web-admin", "client-crm"], dependencies=[Depends(rate_limit)])
service_router = APIRouter(prefix="/api/service/visa-lifecycle", tags=["service", "visa-lifecycle"], dependencies=[Depends(require_service_token)])


def _is_root_admin(user: User) -> bool:
    return (
        user.role == "admin"
        and user.status == "active"
        and user.telegram_id == settings.DEFAULT_ADMIN_TELEGRAM_ID
    )


def require_visa_staff(user: User = Depends(require_web_console_user)) -> User:
    if _is_root_admin(user):
        return user
    if settings.VISA_MANAGER_RBAC_ENABLED and user.role == "visa_manager" and user.status == "active":
        return user
    raise HTTPException(status_code=403, detail="Visa staff role required")


def require_visa_write(
    request: Request,
    user: User = Depends(require_visa_staff),
    session_token: Optional[str] = Cookie(default=None, alias=settings.WEB_SESSION_COOKIE_NAME),
    csrf_token: str = Header(default="", alias="X-CSRF-Token"),
) -> User:
    if request.headers.get("origin", "").rstrip("/") != expected_application_origin():
        raise HTTPException(status_code=403, detail="Origin denied")
    if not session_token or not secrets.compare_digest(csrf_token, admin_csrf_token(session_token)):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    return user


def _case_query(db, staff: User):
    query = db.query(VisaCase)
    return query if _is_root_admin(staff) else query.filter(VisaCase.assigned_admin_id == staff.id)


def _assigned_client(db, user_id: int, staff: User) -> bool:
    return _is_root_admin(staff) or db.query(VisaCase.id).filter(
        VisaCase.user_id == user_id,
        VisaCase.assigned_admin_id == staff.id,
    ).first() is not None


class NotificationUpdate(BaseModel):
    enabled: bool


class EntryUpdate(BaseModel):
    entered_on: date
    idempotency_key: str = Field(min_length=8, max_length=255)


class VisaCaseCreate(BaseModel):
    user_id: int
    visa_type_id: int
    order_id: Optional[int] = None
    passport_identifier: Optional[str] = Field(default=None, max_length=128)
    external_reference: Optional[str] = Field(default=None, max_length=256)
    country_code: str = Field(default="ID", min_length=2, max_length=2)
    custom_visa_name: Optional[str] = Field(default=None, max_length=160)
    service_type: str = Field(default="APPLICATION", min_length=2, max_length=32)
    reason: str = Field(min_length=3, max_length=2000)


class VisaCaseUpdate(BaseModel):
    service_status: Optional[str] = None
    lifecycle_status: Optional[str] = None
    issued_on: Optional[date] = None
    entry_deadline: Optional[date] = None
    entered_on: Optional[date] = None
    stay_end: Optional[date] = None
    extension_window_start: Optional[date] = None
    date_source: Optional[str] = Field(default=None, max_length=2000)
    requires_attention: Optional[bool] = None
    attention_reason: Optional[str] = Field(default=None, max_length=2000)
    reason: str = Field(min_length=3, max_length=2000)
    expected_version: int = Field(ge=1)
    notify_client: bool = False
    idempotency_key: Optional[str] = Field(default=None, min_length=8, max_length=255)
    next_action_text: Optional[str] = Field(default=None, max_length=2000)
    next_action_due_at: Optional[datetime] = None
    next_action_visible: Optional[bool] = None
    recommended_contact_at: Optional[datetime] = None
    expected_stay_end: Optional[date] = None
    extension_available: Optional[bool] = None
    extension_days: Optional[int] = Field(default=None, ge=1, le=3650)


class ProcessCreate(BaseModel):
    process_type: str = Field(min_length=2, max_length=40)
    external_status: str = "UNKNOWN"
    raw_external_status: Optional[str] = Field(default=None, max_length=1000)
    reference: Optional[str] = Field(default=None, max_length=256)
    reason: str = Field(min_length=3, max_length=2000)


class ProcessAggregateItem(BaseModel):
    id: Optional[int] = None
    action: Literal["UPSERT", "REMOVE"] = "UPSERT"
    process_type: Optional[str] = Field(default=None, min_length=2, max_length=40)
    external_status: Optional[str] = None
    reference: Optional[str] = Field(default=None, max_length=256)


class VisaAggregateUpdate(VisaCaseUpdate):
    processes: list[ProcessAggregateItem] = Field(default_factory=list)
    show_to_client: Optional[bool] = None


SERVICE_TRANSITIONS = {
    "PURCHASED": {"DOCUMENTS_REQUIRED", "CANCELLED"}, "DOCUMENTS_REQUIRED": {"DOCUMENTS_RECEIVED", "CANCELLED"},
    "DOCUMENTS_RECEIVED": {"SUBMITTED", "WAITING_PAYMENT", "CANCELLED"}, "SUBMITTED": {"WAITING_PAYMENT", "PAID", "PROCESSING", "ACTION_REQUIRED", "CANCELLED"},
    "WAITING_PAYMENT": {"PAID", "CANCELLED"}, "PAID": {"PROCESSING", "CANCELLED"},
    "PROCESSING": {"ACTION_REQUIRED", "COMPLETED", "CANCELLED"}, "ACTION_REQUIRED": {"PROCESSING", "COMPLETED", "CANCELLED"},
    "COMPLETED": set(), "CANCELLED": set(),
}
LIFECYCLE_TRANSITIONS = {
    "NOT_ISSUED": {"ISSUED_NOT_ACTIVATED", "CANCELLED", "REFUSED"}, "ISSUED_NOT_ACTIVATED": {"ACTIVE", "CANCELLED", "REFUSED"},
    "ACTIVE": {"EXPIRING", "EXTENSION_PROCESSING", "EXPIRED", "CANCELLED"}, "EXPIRING": {"EXTENSION_PROCESSING", "EXTENDED", "EXPIRED", "CANCELLED"},
    "EXTENSION_PROCESSING": {"EXTENDED", "ACTIVE", "EXPIRED", "CANCELLED", "REFUSED"}, "EXTENDED": {"ACTIVE", "EXPIRING", "EXPIRED", "CANCELLED"},
    "EXPIRED": set(), "CANCELLED": set(), "REFUSED": set(),
}


def _validate_transition(current: str, target: str, allowed: dict[str, set[str]], label: str) -> None:
    if current != target and target not in allowed.get(current, set()):
        raise HTTPException(status_code=422, detail=f"Forbidden {label} transition: {current} -> {target}")


class DeliverySettlement(BaseModel):
    lease_token: str = Field(min_length=32, max_length=64)
    state: Literal["DELIVERED", "FAILED", "UNKNOWN"]
    telegram_message_id: Optional[str] = Field(default=None, max_length=64)
    error_code: Optional[str] = Field(default=None, max_length=80)


class PublicationRequest(BaseModel):
    notify_client: bool = False
    reason: str = Field(min_length=3, max_length=2000)
    idempotency_key: str = Field(min_length=8, max_length=255)


class ClientTagRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class InternalNoteRequest(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    visa_case_id: Optional[int] = None
    pinned: bool = False


class DocumentRequest(BaseModel):
    document_type: str = Field(min_length=1, max_length=80)
    display_name: str = Field(min_length=1, max_length=255)
    storage_key: str = Field(min_length=1, max_length=512)
    visibility: Literal["INTERNAL", "CLIENT"] = "INTERNAL"
    expires_on: Optional[date] = None


class CredentialRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=160)
    service_url: Optional[str] = Field(default=None, max_length=2000)
    login: Optional[str] = Field(default=None, max_length=500)
    secret: str = Field(min_length=1, max_length=4000)
    note: Optional[str] = Field(default=None, max_length=4000)
    visa_case_id: Optional[int] = None


class CredentialAccessRequest(BaseModel):
    action: Literal["REVEAL", "COPY"]
    reason: str = Field(min_length=3, max_length=1000)


class VisaEventCreate(BaseModel):
    event_type: str = Field(min_length=2, max_length=80)
    visibility: Literal["INTERNAL", "CLIENT"] = "INTERNAL"
    public_title: Optional[str] = Field(default=None, max_length=200)
    public_description: Optional[str] = Field(default=None, max_length=2000)
    reason: str = Field(min_length=3, max_length=2000)
    idempotency_key: str = Field(min_length=8, max_length=255)


class ClientDialogueMessageRequest(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    idempotency_key: str = Field(min_length=8, max_length=255)


class VisaPermanentDeleteRequest(BaseModel):
    confirm_case_id: int
    expected_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=2000)
    idempotency_key: str = Field(min_length=8, max_length=255)


class VisaAssignmentRequest(BaseModel):
    assigned_admin_id: int = Field(gt=0)
    expected_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=2000)
    idempotency_key: str = Field(min_length=8, max_length=255)


def _enabled() -> None:
    try: ensure_feature_enabled()
    except VisaLifecycleError as exc: raise HTTPException(status_code=503, detail=str(exc)) from exc


def _events(db, case_id: int, *, public_only: bool = False) -> list[dict]:
    query = db.query(VisaEvent).filter(VisaEvent.visa_case_id == case_id)
    if public_only: query = query.filter(VisaEvent.visibility == "CLIENT")
    return [{"id": r.id, "type": r.event_type, "source": r.source, "title": r.public_title, "description": r.public_description, "created_at": r.created_at.isoformat()} for r in query.order_by(VisaEvent.id).all()]


def _conversation_case_id(conversation: WebConversation) -> Optional[int]:
    context = conversation.route_context if isinstance(conversation.route_context, dict) else {}
    raw_case_id = context.get("visa_case_id") or context.get("case_id")
    try:
        return int(raw_case_id) if raw_case_id is not None else None
    except (TypeError, ValueError):
        return None


def _assigned_case_ids(db, user_id: int, staff: User) -> set[int]:
    if _is_root_admin(staff):
        return {int(case_id) for (case_id,) in db.query(VisaCase.id).filter(VisaCase.user_id == user_id).all()}
    return {
        int(case_id)
        for (case_id,) in db.query(VisaCase.id).filter(
            VisaCase.user_id == user_id,
            VisaCase.assigned_admin_id == staff.id,
        ).all()
    }


def _conversation_allowed_for_staff(db, conversation: WebConversation, staff: User) -> bool:
    if _is_root_admin(staff):
        return True
    case_id = _conversation_case_id(conversation)
    return case_id is not None and case_id in _assigned_case_ids(db, int(conversation.user_id or 0), staff)


def _client_dialogue(db, user_id: int, staff: Optional[User] = None) -> dict:
    conversations = db.query(WebConversation).filter(WebConversation.user_id == user_id).order_by(WebConversation.updated_at.desc()).all()
    if staff is not None and not _is_root_admin(staff):
        conversations = [row for row in conversations if _conversation_allowed_for_staff(db, row, staff)]
    conversation = conversations[0] if conversations else None
    if not conversation: return {"id": None, "status": "empty", "messages": []}
    message_query = db.query(WebMessage).filter(WebMessage.conversation_id == conversation.id)
    if staff is not None and not _is_root_admin(staff):
        message_query = message_query.filter(WebMessage.visibility == "client")
    messages = message_query.order_by(WebMessage.id).limit(200).all()
    deliveries = {}
    for event in db.query(WebOutboxEvent).filter(WebOutboxEvent.aggregate_id == conversation.id, WebOutboxEvent.event_type == "web_staff_client_message").all():
        message_id = (event.payload or {}).get("message_id")
        if message_id: deliveries[int(message_id)] = event.status
    return {"id": conversation.id, "status": conversation.status, "messages": [{"id": item.id, "author_type": item.author_type, "body": item.body, "visibility": item.visibility, "created_at": item.created_at, "delivery_status": deliveries.get(item.id)} for item in messages]}


def _card(db, row: VisaCase, *, timeline: bool = False, client_view: bool = False, document_prefix: str = "/api/web/visa-cases") -> dict:
    visa_type = db.query(VisaType).filter(VisaType.id == row.visa_type_id).one()
    result = {
        "id": row.id, "visa_type": {"code": visa_type.code, "name": visa_type.name, "version": visa_type.version},
        "service_status": row.service_status, "lifecycle_status": row.lifecycle_status,
        "country_code": row.country_code, "custom_visa_name": row.custom_visa_name,
        "service_type": row.service_type, "publication_status": row.publication_status,
        "notifications_enabled": row.notifications_enabled, "requires_attention": row.requires_attention,
        "passport_mask": row.passport_mask, "external_reference_mask": row.external_reference_mask,
        "issued_on": row.issued_on, "entry_deadline": row.entry_deadline, "entered_on": row.entered_on,
        "stay_end": row.stay_end, "extension_window_start": row.extension_window_start,
        "expected_stay_end": row.expected_stay_end,
        "extension_available": row.extension_available,
        "extension_days": row.extension_days,
        "extensions_used": row.extensions_used,
        "next_action_text": row.next_action_text if (not client_view or row.next_action_visible) else None,
        "next_action_due_at": row.next_action_due_at if (not client_view or row.next_action_visible) else None,
        "recommended_contact_at": row.recommended_contact_at,
        "updated_at": row.updated_at, "version": row.version,
    }
    if timeline: result["timeline"] = _events(db, row.id, public_only=client_view)
    processes = db.query(VisaProcess).filter(VisaProcess.visa_case_id == row.id).order_by(VisaProcess.id.desc()).all()
    if processes:
        result["current_process"] = {"type": processes[0].process_type, "external_status": processes[0].external_status, "updated_at": processes[0].updated_at}
    if client_view:
        result["documents"] = [{"id": d.id, "type": d.document_type, "name": d.display_name, "expires_on": d.expires_on, "access_url": f"{document_prefix}/{row.id}/documents/{d.id}"} for d in db.query(VisaDocument).filter(VisaDocument.visa_case_id == row.id, VisaDocument.visibility == "CLIENT", VisaDocument.archived_at.is_(None)).all()]
    else:
        assigned = db.query(User).filter(User.id == row.assigned_admin_id).first()
        result["assigned_admin"] = {"id": assigned.id, "name": " ".join(part for part in (assigned.first_name, assigned.last_name) if part) or assigned.username or f"SAFRWAY ID {assigned.id}", "role": assigned.role} if assigned else None
        result["processes"] = [{"id": p.id, "type": p.process_type, "external_status": p.external_status, "raw_external_status": p.raw_external_status, "reference_mask": p.reference_mask, "updated_at": p.updated_at} for p in processes]
        result["documents"] = [{"id": d.id, "type": d.document_type, "name": d.display_name, "visibility": d.visibility, "expires_on": d.expires_on, "archived": d.archived_at is not None, "download_url": f"/api/web/admin/visa-cases/{row.id}/documents/{d.id}/download" if d.archived_at is None and d.upload_idempotency_key and d.checksum_sha256 else None} for d in db.query(VisaDocument).filter(VisaDocument.visa_case_id == row.id).all()]
    return result


def _owned_case(db, case_id: int, user: User, *, published_only: bool = True) -> VisaCase:
    query = db.query(VisaCase).filter(VisaCase.id == case_id, VisaCase.user_id == user.id)
    if published_only: query = query.filter(VisaCase.publication_status == "PUBLISHED")
    row = query.first()
    if not row: raise HTTPException(status_code=404, detail="Visa case not found")
    return row


def require_client_write(request: Request, user: User = Depends(session_user), session_token: Optional[str] = Cookie(default=None, alias=settings.WEB_SESSION_COOKIE_NAME), csrf_token: str = Header(default="", alias="X-CSRF-Token")) -> User:
    if request.headers.get("origin", "").rstrip("/") != expected_application_origin(): raise HTTPException(status_code=403, detail="Origin denied")
    if not session_token or not secrets.compare_digest(csrf_token, admin_csrf_token(session_token)): raise HTTPException(status_code=403, detail="CSRF validation failed")
    return user


def _list_for_user(user: User) -> dict:
    _enabled(); db = SessionLocal()
    try: return {"items": [_card(db, r, client_view=True) for r in db.query(VisaCase).filter(VisaCase.user_id == user.id, VisaCase.publication_status == "PUBLISHED").order_by(VisaCase.updated_at.desc()).all()]}
    finally: db.close()


def _detail_for_user(case_id: int, user: User, *, document_prefix: str = "/api/web/visa-cases") -> dict:
    _enabled(); db = SessionLocal()
    try: return _card(db, _owned_case(db, case_id, user), timeline=True, client_view=True, document_prefix=document_prefix)
    finally: db.close()


def _notifications(case_id: int, enabled: bool, user: User, source: str) -> dict:
    _enabled(); db = SessionLocal()
    try:
        row = _owned_case(db, case_id, user); before = row.notifications_enabled
        row.notifications_enabled = enabled; row.updated_at = datetime.now(timezone.utc)
        append_event(db, row, event_type="NOTIFICATIONS_CHANGED", source=source, actor_user_id=user.id, before={"enabled": before}, after={"enabled": enabled})
        if not enabled:
            db.query(VisaNotificationDelivery).filter(VisaNotificationDelivery.visa_case_id == row.id, VisaNotificationDelivery.recipient_kind == "client", VisaNotificationDelivery.state == "PENDING").update({"state": "SUPPRESSED"}, synchronize_session=False)
        db.commit(); return _card(db, row)
    finally: db.close()


def _entry(case_id: int, payload: EntryUpdate, user: User, source: str) -> dict:
    _enabled(); db = SessionLocal()
    try:
        row = _owned_case(db, case_id, user)
        if db.query(VisaEvent).filter(VisaEvent.idempotency_key == payload.idempotency_key).first(): return _card(db, row, timeline=True)
        if row.entered_on and row.entered_on != payload.entered_on: raise HTTPException(status_code=409, detail="Entry date already recorded; manager correction required")
        row.entered_on = payload.entered_on; row.lifecycle_status = "ACTIVE"; row.updated_at = datetime.now(timezone.utc)
        append_event(db, row, event_type="CLIENT_ENTRY_RECORDED", source=source, actor_user_id=user.id, after={"entered_on": payload.entered_on.isoformat()}, idempotency_key=payload.idempotency_key)
        db.commit(); return _card(db, row, timeline=True)
    finally: db.close()


def _document_content_disposition(display_name: str) -> str:
    normalized = unicodedata.normalize("NFC", str(display_name or "document"))[:120]
    display = "".join(
        character
        for character in normalized
        if ord(character) >= 32 and ord(character) != 127 and character not in {'"', "'", ";", ":", "\\"}
    ).strip(" .") or "document"
    display = display[:120]
    ascii_name = unicodedata.normalize("NFKD", display).encode("ascii", "ignore").decode("ascii")
    ascii_name = re.sub(r"[^A-Za-z0-9._ -]+", "_", ascii_name).strip(" .")[:120] or "document"
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(display, safe="")}'


def _protected_document_response(document: VisaDocument) -> Response:
    readiness = assess_document_storage()
    if not readiness.ready:
        raise HTTPException(status_code=503, detail="Protected document storage is unavailable")
    if not document.upload_idempotency_key or not document.checksum_sha256 or not document.mime_type:
        raise HTTPException(status_code=409, detail="Document was not verified by protected upload")
    root = Path(settings.VISA_DOCUMENT_STORAGE_ROOT).resolve()
    candidate = (root / document.storage_key).resolve()
    if root not in candidate.parents or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        content = PIIEnvelopeCipher.from_settings().decrypt_bytes(candidate.read_bytes(), context=f"visa-document:{document.user_id}:{document.upload_idempotency_key}")
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Protected document is unavailable") from exc
    if hashlib.sha256(content).hexdigest() != document.checksum_sha256:
        raise HTTPException(status_code=503, detail="Protected document integrity check failed")
    return Response(content=content, media_type=document.mime_type, headers={"Cache-Control": "private, no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": _document_content_disposition(document.display_name)})


def _document_file(case_id: int, document_id: int, user: User):
    _enabled(); db = SessionLocal()
    try:
        _owned_case(db, case_id, user)
        document = db.query(VisaDocument).filter(VisaDocument.id == document_id, VisaDocument.visa_case_id == case_id, VisaDocument.user_id == user.id, VisaDocument.visibility == "CLIENT", VisaDocument.archived_at.is_(None)).first()
        if not document: raise HTTPException(status_code=404, detail="Document not found")
        return _protected_document_response(document)
    finally: db.close()


ALLOWED_DOCUMENT_TYPES = {"application/pdf": b"%PDF", "image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff"}


@admin_router.post("/{case_id}/documents/upload", status_code=201)
async def admin_document_upload(
    case_id: int, request: Request,
    display_name: str = Query(min_length=1, max_length=255),
    document_type: str = Query(min_length=1, max_length=80),
    visibility: Literal["INTERNAL", "CLIENT"] = Query("INTERNAL"),
    upload_key: str = Header(min_length=8, max_length=255, alias="Idempotency-Key"),
    admin: User = Depends(require_visa_write),
):
    _enabled()
    mime = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if mime not in ALLOWED_DOCUMENT_TYPES: raise HTTPException(status_code=415, detail="Document type is not allowed")
    if not assess_document_storage().ready: raise HTTPException(status_code=503, detail="Protected document upload is not configured")
    cipher = PIIEnvelopeCipher.from_settings()
    root = Path(settings.VISA_DOCUMENT_STORAGE_ROOT).resolve()
    db = SessionLocal(); final_path: Path | None = None
    try:
        case = _case_query(db, admin).filter(VisaCase.id == case_id).with_for_update().first()
        if not case: raise HTTPException(status_code=404, detail="Visa case not found")
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > settings.VISA_DOCUMENT_MAX_BYTES: raise HTTPException(status_code=413, detail="Document is too large")
        if not body.startswith(ALLOWED_DOCUMENT_TYPES[mime]): raise HTTPException(status_code=415, detail="Document content does not match its type")
        checksum = hashlib.sha256(body).hexdigest()
        existing = db.query(VisaDocument).filter(VisaDocument.upload_idempotency_key == upload_key).first()
        if existing:
            replay_matches = (
                existing.visa_case_id == case.id
                and existing.user_id == case.user_id
                and existing.uploaded_by_admin_id == admin.id
                and existing.checksum_sha256 == checksum
                and existing.mime_type == mime
                and existing.display_name == display_name
                and existing.document_type == document_type
                and existing.visibility == visibility
                and existing.archived_at is None
            )
            if not replay_matches:
                raise HTTPException(status_code=409, detail="Idempotency key conflicts with another protected upload")
            return {"id": existing.id, "visibility": existing.visibility, "checksum_sha256": existing.checksum_sha256, "idempotent_replay": True}
        with tempfile.NamedTemporaryFile(dir=root, prefix=".quarantine-", delete=False) as temporary:
            temporary.write(body); quarantine = Path(temporary.name)
        os.chmod(quarantine, 0o600)
        try:
            result = subprocess.run([*shlex.split(settings.VISA_DOCUMENT_SCANNER_COMMAND), str(quarantine)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
            if result.returncode != 0: raise HTTPException(status_code=422, detail="Document did not pass security scanning")
            storage_key = f"{uuid.uuid4().hex}.enc"; final_path = (root / storage_key).resolve()
            if root not in final_path.parents: raise HTTPException(status_code=400, detail="Invalid storage target")
            encrypted = cipher.encrypt_bytes(bytes(body), context=f"visa-document:{case.user_id}:{upload_key}")
            descriptor = os.open(final_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as target: target.write(encrypted)
        finally:
            quarantine.unlink(missing_ok=True)
        document = VisaDocument(user_id=case.user_id, visa_case_id=case.id, document_type=document_type, display_name=display_name, storage_key=storage_key, upload_idempotency_key=upload_key, checksum_sha256=checksum, mime_type=mime, size_bytes=len(body), visibility=visibility, uploaded_by_admin_id=admin.id)
        db.add(document); db.flush(); append_event(db, case, event_type="DOCUMENT_UPLOADED", source="admin", actor_user_id=admin.id, after={"document_id": document.id, "visibility": visibility, "checksum_sha256": checksum})
        db.commit(); return {"id": document.id, "visibility": visibility, "checksum_sha256": checksum, "idempotent_replay": False}
    except Exception:
        db.rollback()
        if final_path: final_path.unlink(missing_ok=True)
        raise
    finally: db.close()


@admin_router.get("/document-storage/readiness")
def admin_document_storage_readiness(user: User = Depends(require_visa_staff)):
    _enabled()
    return assess_document_storage().public_payload()


@admin_router.get("/{case_id}/documents/{document_id}/download")
def admin_document_download(case_id: int, document_id: int, admin: User = Depends(require_visa_staff)):
    _enabled(); db = SessionLocal()
    try:
        case = _case_query(db, admin).filter(VisaCase.id == case_id).first()
        if not case: raise HTTPException(status_code=404, detail="Visa case not found")
        document = db.query(VisaDocument).filter(VisaDocument.id == document_id, VisaDocument.visa_case_id == case.id, VisaDocument.archived_at.is_(None)).first()
        if not document: raise HTTPException(status_code=404, detail="Document not found")
        response = _protected_document_response(document)
        db.add(AdminAction(admin_user_id=admin.id, action_type="VISA_DOCUMENT_DOWNLOADED", entity_type="visa_document", entity_id=document.id, details={"visa_case_id": case.id, "visibility": document.visibility}))
        db.commit()
        return response
    finally:
        db.close()


@mini_router.get("")
def mini_list(user: User = Depends(require_mini_app_user)): return _list_for_user(user)
@mini_router.get("/{case_id}")
def mini_detail(case_id: int, user: User = Depends(require_mini_app_user)): return _detail_for_user(case_id, user, document_prefix="/mini-app/visa-cases")
@mini_router.patch("/{case_id}/notifications")
def mini_notifications(case_id: int, payload: NotificationUpdate, user: User = Depends(require_mini_app_user)): return _notifications(case_id, payload.enabled, user, "mini_app")
@mini_router.post("/{case_id}/entry")
def mini_entry(case_id: int, payload: EntryUpdate, user: User = Depends(require_mini_app_user)): return _entry(case_id, payload, user, "mini_app")
@mini_router.get("/{case_id}/documents/{document_id}")
def mini_document(case_id: int, document_id: int, user: User = Depends(require_mini_app_user)): return _document_file(case_id, document_id, user)
@web_router.get("")
def web_list(user: User = Depends(session_user)): return _list_for_user(user)
@web_router.get("/{case_id}")
def web_detail(case_id: int, user: User = Depends(session_user)): return _detail_for_user(case_id, user)
@web_router.patch("/{case_id}/notifications")
def web_notifications(case_id: int, payload: NotificationUpdate, user: User = Depends(require_client_write)): return _notifications(case_id, payload.enabled, user, "account")
@web_router.post("/{case_id}/entry")
def web_entry(case_id: int, payload: EntryUpdate, user: User = Depends(require_client_write)): return _entry(case_id, payload, user, "account")
@web_router.get("/{case_id}/documents/{document_id}")
def web_document(case_id: int, document_id: int, user: User = Depends(session_user)): return _document_file(case_id, document_id, user)


@admin_router.get("")
def admin_list(attention: Optional[bool] = None, publication_status: Optional[Literal["DRAFT", "PUBLISHED", "HIDDEN", "ARCHIVED"]] = None, page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100), user: User = Depends(require_visa_staff)):
    _enabled(); db = SessionLocal()
    try:
        query = _case_query(db, user)
        if attention is not None: query = query.filter(VisaCase.requires_attention == attention)
        if publication_status is not None: query = query.filter(VisaCase.publication_status == publication_status)
        total = query.count(); rows = query.order_by(VisaCase.updated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {"items": [_card(db, r) | {"user_id": r.user_id} for r in rows], "total": total, "page": page}
    finally: db.close()


@admin_router.get("/types")
def admin_types(user: User = Depends(require_visa_staff)):
    _enabled(); db = SessionLocal()
    try: return {"items": [{"id": r.id, "code": r.code, "name": r.name, "version": r.version, "rules_verified": r.rules_verified} for r in db.query(VisaType).filter(VisaType.active.is_(True)).all()]}
    finally: db.close()


@admin_router.get("/staff/visa-managers")
def admin_visa_managers(user: User = Depends(require_web_admin)):
    _enabled(); db = SessionLocal()
    try:
        rows = db.query(User).filter(
            User.status == "active", User.role.in_(("admin", "visa_manager"))
        ).order_by(User.role, User.first_name, User.id).all()
        return {"enabled": settings.VISA_MANAGER_RBAC_ENABLED, "items": [{"id": row.id, "name": " ".join(part for part in (row.first_name, row.last_name) if part) or row.username or f"SAFRWAY ID {row.id}", "role": row.role} for row in rows]}
    finally:
        db.close()


@admin_router.post("/{case_id}/assignment")
def admin_assign_visa_case(case_id: int, payload: VisaAssignmentRequest, admin: User = Depends(require_admin_write)):
    _enabled()
    if not settings.VISA_MANAGER_RBAC_ENABLED:
        raise HTTPException(status_code=404, detail="Visa manager assignment is disabled")
    db = SessionLocal()
    try:
        existing = db.query(VisaEvent).filter(VisaEvent.idempotency_key == payload.idempotency_key).first()
        if existing:
            if existing.visa_case_id != case_id or existing.actor_user_id != admin.id or int((existing.after or {}).get("assigned_admin_id") or 0) != payload.assigned_admin_id:
                raise HTTPException(status_code=409, detail="Idempotency key belongs to another assignment")
            row = db.query(VisaCase).filter(VisaCase.id == case_id).first()
            if not row: raise HTTPException(status_code=404, detail="Visa case not found")
            return _card(db, row, timeline=True) | {"idempotent_replay": True}
        row = db.query(VisaCase).filter(VisaCase.id == case_id).with_for_update().first()
        if not row: raise HTTPException(status_code=404, detail="Visa case not found")
        if row.version != payload.expected_version: raise HTTPException(status_code=409, detail="Visa case changed")
        manager = db.query(User).filter(User.id == payload.assigned_admin_id, User.status == "active", User.role.in_(("admin", "visa_manager"))).first()
        if not manager: raise HTTPException(status_code=422, detail="Active visa manager is required")
        if manager.role == "admin" and not _is_root_admin(manager):
            raise HTTPException(status_code=422, detail="Only the configured root admin may receive global assignment")
        before = row.assigned_admin_id
        if before == manager.id:
            return _card(db, row, timeline=True) | {"idempotent_replay": True}
        row.assigned_admin_id = manager.id
        row.version += 1
        row.updated_at = datetime.now(timezone.utc)
        append_event(db, row, event_type="CASE_ASSIGNED", source="admin", actor_user_id=admin.id, before={"assigned_admin_id": before}, after={"assigned_admin_id": manager.id}, reason=payload.reason, idempotency_key=payload.idempotency_key)
        db.commit()
        return _card(db, row, timeline=True) | {"idempotent_replay": False}
    finally:
        db.close()


@admin_router.post("", status_code=201)
def admin_create(payload: VisaCaseCreate, admin: User = Depends(require_visa_write)):
    _enabled(); db = SessionLocal()
    try:
        if not db.query(User.id).filter(User.id == payload.user_id, User.status == "active").first(): raise HTTPException(status_code=404, detail="Client not found")
        if not _is_root_admin(admin) and not _assigned_client(db, payload.user_id, admin): raise HTTPException(status_code=403, detail="Client is not assigned to this visa manager")
        if not db.query(VisaType.id).filter(VisaType.id == payload.visa_type_id, VisaType.active.is_(True)).first(): raise HTTPException(status_code=404, detail="Visa type not found")
        visa_type = db.query(VisaType).filter(VisaType.id == payload.visa_type_id).one()
        if payload.country_code != "ID": raise HTTPException(status_code=422, detail="Only Indonesia is supported in P0")
        if visa_type.code == "OTHER" and not payload.custom_visa_name: raise HTTPException(status_code=422, detail="Custom visa name required")
        row = VisaCase(user_id=payload.user_id, visa_type_id=payload.visa_type_id, order_id=payload.order_id, assigned_admin_id=admin.id, country_code=payload.country_code, custom_visa_name=payload.custom_visa_name, service_type=payload.service_type)
        if payload.passport_identifier:
            row.passport_envelope = PIIEnvelopeCipher.from_settings().encrypt(payload.passport_identifier, context=f"visa-case:{payload.user_id}:passport"); row.passport_mask = mask_identifier(payload.passport_identifier)
        if payload.external_reference:
            row.external_reference_envelope = PIIEnvelopeCipher.from_settings().encrypt(payload.external_reference, context=f"visa-case:{payload.user_id}:reference"); row.external_reference_mask = mask_identifier(payload.external_reference)
        db.add(row); db.flush(); append_event(db, row, event_type="CASE_CREATED", source="admin", actor_user_id=admin.id, after={"service_status": row.service_status}, reason=payload.reason)
        db.commit(); return _card(db, row, timeline=True)
    finally: db.close()


@admin_router.get("/{case_id}")
def admin_detail(case_id: int, user: User = Depends(require_visa_staff)):
    _enabled(); db = SessionLocal()
    try:
        row = _case_query(db, user).filter(VisaCase.id == case_id).first()
        if not row: raise HTTPException(status_code=404, detail="Visa case not found")
        deliveries = db.query(VisaNotificationDelivery).filter(VisaNotificationDelivery.visa_case_id == case_id).order_by(VisaNotificationDelivery.id.desc()).limit(100).all()
        return _card(db, row, timeline=True) | {"user_id": row.user_id, "deliveries": [{"id": d.id, "type": d.notification_type, "state": d.state, "attempts": d.attempts, "error_code": d.last_error_code} for d in deliveries]}
    finally: db.close()


@admin_router.get("/{case_id}/delete-preview")
def admin_delete_preview(case_id: int, user: User = Depends(require_web_admin)):
    _enabled()
    if not settings.VISA_PERMANENT_DELETE_ENABLED:
        raise HTTPException(status_code=404, detail="Permanent delete is disabled")
    db = SessionLocal()
    try:
        try:
            plan = build_visa_delete_plan(db, case_id)
        except VisaDeleteBlocked as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        return {
            "case_id": plan.case_id,
            "visa_type_code": plan.visa_type_code,
            "dependency_counts": plan.dependency_counts,
            "unexpected_dependencies": list(plan.unexpected_dependencies),
            "protected_files_present": plan.protected_files_present,
            "executable": plan.executable,
        }
    finally:
        db.close()


@admin_router.post("/{case_id}/permanent-delete")
def admin_permanent_delete(case_id: int, payload: VisaPermanentDeleteRequest, admin: User = Depends(require_admin_write)):
    _enabled()
    if not settings.VISA_PERMANENT_DELETE_ENABLED:
        raise HTTPException(status_code=404, detail="Permanent delete is disabled")
    if payload.confirm_case_id != case_id:
        raise HTTPException(status_code=422, detail="Visa confirmation does not match")
    db = SessionLocal()
    try:
        try:
            tombstone, replay = permanently_delete_visa_case(
                db,
                case_id=case_id,
                expected_version=payload.expected_version,
                actor=admin,
                reason=payload.reason,
                idempotency_key=payload.idempotency_key,
            )
            db.commit()
            return {
                "deleted": True,
                "visa_case_id": tombstone.visa_case_id,
                "tombstone_id": tombstone.id,
                "idempotent_replay": replay,
            }
        except VisaDeleteBlocked as error:
            db.rollback()
            status = 404 if str(error) == "Visa case not found" else 409
            raise HTTPException(status_code=status, detail=str(error)) from error
    finally:
        db.close()


@admin_router.patch("/{case_id}")
def admin_update(case_id: int, payload: VisaCaseUpdate, admin: User = Depends(require_visa_write)):
    return _admin_update_aggregate(case_id, VisaAggregateUpdate(**payload.model_dump(exclude_unset=True), processes=[]), admin)


@admin_router.patch("/{case_id}/aggregate")
def admin_update_aggregate(case_id: int, payload: VisaAggregateUpdate, admin: User = Depends(require_visa_write)):
    return _admin_update_aggregate(case_id, payload, admin)


def _admin_update_aggregate(case_id: int, payload: VisaAggregateUpdate, admin: User):
    _enabled(); db = SessionLocal()
    try:
        row = _case_query(db, admin).filter(VisaCase.id == case_id).with_for_update().first()
        if not row: raise HTTPException(status_code=404, detail="Visa case not found")
        if payload.idempotency_key and db.query(VisaEvent.id).filter(VisaEvent.idempotency_key == payload.idempotency_key).first(): return _card(db, row, timeline=True)
        if row.version != payload.expected_version: raise HTTPException(status_code=409, detail="Visa case changed")
        before = {"service_status": row.service_status, "lifecycle_status": row.lifecycle_status, "publication_status": row.publication_status, "version": row.version}
        values = payload.model_dump(exclude={"reason", "expected_version", "notify_client", "idempotency_key", "processes", "show_to_client"}, exclude_unset=True)
        root_status_override = admin.role == "admin" and admin.telegram_id == settings.DEFAULT_ADMIN_TELEGRAM_ID
        if "service_status" in values:
            if values["service_status"] not in SERVICE_STATUSES: raise HTTPException(status_code=422, detail="Invalid service status")
            if not root_status_override:
                _validate_transition(row.service_status, values["service_status"], SERVICE_TRANSITIONS, "service status")
        if "lifecycle_status" in values:
            if values["lifecycle_status"] not in LIFECYCLE_STATUSES: raise HTTPException(status_code=422, detail="Invalid lifecycle status")
            if not root_status_override:
                _validate_transition(row.lifecycle_status, values["lifecycle_status"], LIFECYCLE_TRANSITIONS, "visa status")
        for key, value in values.items(): setattr(row, key, value)
        if payload.show_to_client is not None:
            row.publication_status = "PUBLISHED" if payload.show_to_client else "HIDDEN"
            if payload.show_to_client and row.published_at is None:
                row.published_at = datetime.now(timezone.utc)
        if any(k in values for k in {"entry_deadline", "stay_end", "extension_window_start"}): row.dates_confirmed_by = admin.id; row.dates_confirmed_at = datetime.now(timezone.utc)
        try: validate_dates(row)
        except VisaLifecycleError as exc: raise HTTPException(status_code=422, detail=str(exc)) from exc

        process_changes = []
        for change in payload.processes:
            process = None
            if change.id is not None:
                process = db.query(VisaProcess).filter(VisaProcess.id == change.id, VisaProcess.visa_case_id == row.id).first()
                if not process: raise HTTPException(status_code=404, detail="Visa process not found")
            if change.action == "REMOVE":
                if process is None: raise HTTPException(status_code=422, detail="Process id is required for removal")
                process_changes.append({"id": process.id, "action": "REMOVED", "process_type": process.process_type, "external_status": process.external_status})
                db.delete(process)
                continue
            if not change.process_type or change.external_status not in EXTERNAL_STATUSES:
                raise HTTPException(status_code=422, detail="Valid process type and external status are required")
            if process is None:
                process = VisaProcess(visa_case_id=row.id, tracking_enabled=False)
                db.add(process)
            process.process_type = change.process_type
            process.external_status = change.external_status
            if change.reference is not None:
                if change.reference:
                    process.reference_envelope = PIIEnvelopeCipher.from_settings().encrypt(change.reference, context=f"visa-case:{row.user_id}:process")
                    process.reference_mask = mask_identifier(change.reference)
                else:
                    process.reference_envelope = None; process.reference_mask = None
            db.flush()
            process_changes.append({"id": process.id, "action": "CREATED" if change.id is None else "UPDATED", "process_type": process.process_type, "external_status": process.external_status})

        row.version += 1; row.updated_at = datetime.now(timezone.utc)
        after = jsonable_encoder(values | {"version": row.version, "processes": process_changes, "publication_status": row.publication_status, "root_status_override": root_status_override})
        event = append_event(db, row, event_type="CASE_UPDATED", source="admin", actor_user_id=admin.id, before=before, after=after, reason=payload.reason, idempotency_key=payload.idempotency_key)
        if payload.notify_client:
            if row.publication_status != "PUBLISHED": raise HTTPException(status_code=422, detail="Only published cases can notify clients")
            if not row.notifications_enabled: raise HTTPException(status_code=422, detail="Client notifications are disabled for this case")
            user_locale = db.query(User.locale).filter(User.id == row.user_id).scalar() or "ru"
            enqueue_delivery(db, visa_case_id=row.id, visa_event_id=event.id, recipient_user_id=row.user_id, recipient_kind="client", locale=user_locale, notification_type="CASE_UPDATED", payload={"case_id": row.id}, dedupe_key=f"visa:{row.id}:updated:{event.id}", due_at=datetime.now(timezone.utc), state="PENDING")
        db.commit(); return _card(db, row, timeline=True)
    finally: db.close()


@admin_router.post("/{case_id}/processes", status_code=201)
def admin_process(case_id: int, payload: ProcessCreate, admin: User = Depends(require_visa_write)):
    _enabled(); db = SessionLocal()
    try:
        row = _case_query(db, admin).filter(VisaCase.id == case_id).first()
        if not row: raise HTTPException(status_code=404, detail="Visa case not found")
        if payload.external_status not in EXTERNAL_STATUSES: raise HTTPException(status_code=422, detail="Invalid external status")
        process = VisaProcess(visa_case_id=row.id, process_type=payload.process_type, external_status=payload.external_status, raw_external_status=payload.raw_external_status, tracking_enabled=False)
        if payload.reference:
            process.reference_envelope = PIIEnvelopeCipher.from_settings().encrypt(payload.reference, context=f"visa-case:{row.user_id}:process"); process.reference_mask = mask_identifier(payload.reference)
        db.add(process); db.flush(); append_event(db, row, event_type="PROCESS_CREATED", source="admin", actor_user_id=admin.id, after={"process_id": process.id, "process_type": process.process_type, "external_status": process.external_status}, reason=payload.reason)
        db.commit(); return {"id": process.id, "process_type": process.process_type, "external_status": process.external_status, "reference_mask": process.reference_mask}
    finally: db.close()


@admin_router.post("/{case_id}/publication/{action}")
def admin_publication(case_id: int, action: Literal["publish", "hide", "archive"], payload: PublicationRequest, admin: User = Depends(require_visa_write)):
    _enabled(); db = SessionLocal()
    try:
        existing = db.query(VisaEvent).filter(VisaEvent.idempotency_key == payload.idempotency_key).first()
        row = _case_query(db, admin).filter(VisaCase.id == case_id).with_for_update().first()
        if not row: raise HTTPException(status_code=404, detail="Visa case not found")
        if existing: return _card(db, row, timeline=True)
        target = {"publish": "PUBLISHED", "hide": "HIDDEN", "archive": "ARCHIVED"}[action]
        if row.publication_status == target: return _card(db, row, timeline=True)
        if target == "PUBLISHED" and not (row.service_status and row.lifecycle_status): raise HTTPException(status_code=422, detail="Client-facing status required")
        before = row.publication_status; row.publication_status = target
        row.published_at = datetime.now(timezone.utc) if target == "PUBLISHED" else row.published_at
        row.version += 1; row.updated_at = datetime.now(timezone.utc)
        event = append_event(db, row, event_type=f"CASE_{target}", source="admin", actor_user_id=admin.id, before={"publication_status": before}, after={"publication_status": target}, reason=payload.reason, idempotency_key=payload.idempotency_key)
        if target == "PUBLISHED" and payload.notify_client and row.notifications_enabled:
            user_locale = db.query(User.locale).filter(User.id == row.user_id).scalar() or "ru"
            enqueue_delivery(db, visa_case_id=row.id, visa_event_id=event.id, recipient_user_id=row.user_id, recipient_kind="client", locale=user_locale, notification_type="CASE_PUBLISHED", payload={"case_id": row.id}, dedupe_key=f"visa:{row.id}:published:{event.id}", due_at=datetime.now(timezone.utc), state="PENDING")
        db.commit(); return _card(db, row, timeline=True)
    finally: db.close()


@crm_router.get("")
def admin_clients(search: Optional[str] = Query(default=None, max_length=120), attention_only: bool = False, visa_filter: Optional[Literal["active", "none", "processing", "action", "notifications_off", "archived"]] = None, bot_status: Optional[str] = Query(default=None, max_length=20), sort: Literal["joined_desc", "joined_asc", "name_asc", "name_desc", "activity_desc", "status_asc"] = "joined_desc", page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100), admin: User = Depends(require_visa_staff)):
    _enabled(); db = SessionLocal()
    try:
        query = db.query(User)
        manager_scope = () if _is_root_admin(admin) else (VisaCase.assigned_admin_id == admin.id,)
        if not _is_root_admin(admin):
            query = query.filter(db.query(VisaCase.id).filter(VisaCase.user_id == User.id, VisaCase.assigned_admin_id == admin.id).exists())
        if search:
            value = search.strip().lstrip("@")
            predicates = [User.username.ilike(f"%{value}%"), User.first_name.ilike(f"%{value}%"), User.last_name.ilike(f"%{value}%"), User.phone.ilike(f"%{value}%"), User.email.ilike(f"%{value}%")]
            if value.isdigit(): predicates.extend([User.id == int(value), User.telegram_id == int(value)])
            query = query.filter(or_(*predicates))
        if attention_only: query = query.filter(db.query(VisaCase.id).filter(VisaCase.user_id == User.id, VisaCase.requires_attention.is_(True), *manager_scope).exists())
        if bot_status: query = query.filter(User.bot_status == bot_status)
        if visa_filter == "none": query = query.filter(~db.query(VisaCase.id).filter(VisaCase.user_id == User.id, *manager_scope).exists())
        elif visa_filter == "active": query = query.filter(db.query(VisaCase.id).filter(VisaCase.user_id == User.id, VisaCase.publication_status != "ARCHIVED", VisaCase.lifecycle_status.notin_(("EXPIRED", "CANCELLED", "REFUSED")), *manager_scope).exists())
        elif visa_filter == "processing": query = query.filter(db.query(VisaCase.id).filter(VisaCase.user_id == User.id, VisaCase.service_status.in_(("DOCUMENTS_REQUIRED", "DOCUMENTS_RECEIVED", "SUBMITTED", "WAITING_PAYMENT", "PAID", "PROCESSING")), *manager_scope).exists())
        elif visa_filter == "action": query = query.filter(db.query(VisaCase.id).filter(VisaCase.user_id == User.id, VisaCase.service_status == "ACTION_REQUIRED", *manager_scope).exists())
        elif visa_filter == "notifications_off": query = query.filter(db.query(VisaCase.id).filter(VisaCase.user_id == User.id, VisaCase.notifications_enabled.is_(False), *manager_scope).exists())
        elif visa_filter == "archived": query = query.filter(db.query(VisaCase.id).filter(VisaCase.user_id == User.id, VisaCase.publication_status == "ARCHIVED", *manager_scope).exists())
        order_by = {
            "joined_desc": (User.created_at.desc(), User.id.desc()),
            "joined_asc": (User.created_at.asc(), User.id.asc()),
            "name_asc": (func.lower(func.coalesce(User.first_name, User.username, "")).asc(), User.id.asc()),
            "name_desc": (func.lower(func.coalesce(User.first_name, User.username, "")).desc(), User.id.desc()),
            "activity_desc": (case((User.last_activity_at.is_(None), 1), else_=0).asc(), User.last_activity_at.desc(), User.id.desc()),
            "status_asc": (User.status.asc(), User.bot_status.asc(), User.id.asc()),
        }[sort]
        total = query.count(); users = query.order_by(*order_by).offset((page - 1) * page_size).limit(page_size).all()
        items = []
        for user in users:
            tags = db.query(ClientTag.name).join(ClientTagAssignment, ClientTagAssignment.tag_id == ClientTag.id).filter(ClientTagAssignment.user_id == user.id).all()
            case_query = db.query(VisaCase).filter(VisaCase.user_id == user.id)
            if not _is_root_admin(admin): case_query = case_query.filter(VisaCase.assigned_admin_id == admin.id)
            cases = case_query.all()
            items.append({"id": user.id, "telegram_id_mask": f"••••{str(user.telegram_id)[-4:]}", "username": user.username, "first_name": user.first_name, "last_name": user.last_name, "phone_mask": mask_identifier(user.phone) if user.phone else None, "email": user.email, "bot_status": user.bot_status, "last_activity_at": user.last_activity_at, "created_at": user.created_at, "tags": [name for (name,) in tags], "active_visa_count": sum(c.publication_status != "ARCHIVED" for c in cases), "requires_attention": any(c.requires_attention for c in cases)})
        return {"items": items, "total": total, "page": page}
    finally: db.close()


@crm_router.get("/{user_id}")
def admin_client_detail(user_id: int, admin: User = Depends(require_visa_staff)):
    _enabled(); db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not _assigned_client(db, user_id, admin): raise HTTPException(status_code=404, detail="Client not found")
        case_query = db.query(VisaCase).filter(VisaCase.user_id == user.id)
        if not _is_root_admin(admin):
            case_query = case_query.filter(VisaCase.assigned_admin_id == admin.id)
        cases = case_query.order_by(VisaCase.updated_at.desc()).all()
        assigned_case_ids = [row.id for row in cases]
        note_query = db.query(ClientInternalNote).filter(ClientInternalNote.user_id == user.id)
        if not _is_root_admin(admin):
            note_query = note_query.filter(ClientInternalNote.visa_case_id.in_(assigned_case_ids))
        notes = note_query.order_by(ClientInternalNote.pinned.desc(), ClientInternalNote.id.desc()).all()
        credentials = db.query(CredentialVaultItem).filter(CredentialVaultItem.user_id == user.id).all() if _is_root_admin(admin) else []
        return {"client": {"id": user.id, "telegram_id_mask": f"••••{str(user.telegram_id)[-4:]}", "username": user.username, "first_name": user.first_name, "last_name": user.last_name, "phone_mask": mask_identifier(user.phone) if user.phone else None, "email": user.email, "timezone": user.timezone, "bot_status": user.bot_status, "last_activity_at": user.last_activity_at, "created_at": user.created_at}, "visa_cases": [_card(db, row) for row in cases], "notes": [{"id": n.id, "body": n.body, "pinned": n.pinned, "created_at": n.created_at} for n in notes], "credentials": [{"id": c.id, "provider": c.provider, "login_mask": c.login_mask, "service_url": c.service_url} for c in credentials], "dialogue": _client_dialogue(db, user.id, admin)}
    finally: db.close()


def _normalized_message_body(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n").strip()


def _conversation_for_staff_message(db, user: User, staff: User) -> WebConversation:
    conversations = db.query(WebConversation).filter(
        WebConversation.user_id == user.id,
        WebConversation.status == "open",
    ).order_by(WebConversation.updated_at.desc()).all()
    if _is_root_admin(staff):
        if conversations:
            return conversations[0]
        conversation = WebConversation(
            user_id=user.id,
            source="admin",
            route_context={"country": "Бали", "section": "visa", "source": "admin_client_card"},
        )
        db.add(conversation); db.flush()
        return conversation
    for conversation in conversations:
        if _conversation_allowed_for_staff(db, conversation, staff):
            return conversation
    assigned_case = db.query(VisaCase).filter(
        VisaCase.user_id == user.id,
        VisaCase.assigned_admin_id == staff.id,
    ).order_by(VisaCase.updated_at.desc()).first()
    if assigned_case is None:
        raise HTTPException(status_code=404, detail="Assigned visa conversation not found")
    conversation = WebConversation(
        user_id=user.id,
        source="admin",
        route_context={
            "country": "Бали",
            "section": "visa",
            "source": "admin_client_card",
            "visa_case_id": assigned_case.id,
        },
    )
    db.add(conversation); db.flush()
    return conversation


@crm_router.post("/{user_id}/messages", status_code=201)
def admin_client_message(user_id: int, payload: ClientDialogueMessageRequest, admin: User = Depends(require_visa_write)):
    _enabled(); db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.status == "active").first()
        if not user or not _assigned_client(db, user_id, admin): raise HTTPException(status_code=404, detail="Client not found")
        if not user.telegram_id: raise HTTPException(status_code=422, detail="Client Telegram account is unavailable")
        normalized_body = _normalized_message_body(payload.body)
        if not normalized_body:
            raise HTTPException(status_code=422, detail="Client message is empty")
        existing = db.query(WebMessage).filter(WebMessage.idempotency_key == payload.idempotency_key).first()
        if existing:
            conversation = db.get(WebConversation, existing.conversation_id)
            valid_replay = (
                conversation is not None
                and conversation.user_id == user.id
                and existing.author_type == "staff"
                and existing.actor_telegram_id == admin.telegram_id
                and existing.visibility == "client"
                and _normalized_message_body(existing.body) == normalized_body
                and _conversation_allowed_for_staff(db, conversation, admin)
            )
            if not valid_replay:
                raise HTTPException(status_code=409, detail="Idempotency key belongs to another client message")
            return {"id": existing.id, "idempotent_replay": True}
        conversation = _conversation_for_staff_message(db, user, admin)
        message = WebMessage(conversation_id=conversation.id, author_type="staff", actor_telegram_id=admin.telegram_id, body=normalized_body, visibility="client", idempotency_key=payload.idempotency_key)
        db.add(message); db.flush(); conversation.updated_at = datetime.now(timezone.utc)
        db.add(WebOutboxEvent(event_type="web_staff_client_message", aggregate_id=conversation.id, payload={"conversation_id": conversation.id, "message_id": message.id, "recipient_user_id": user.id}, dedupe_key=f"staff-client:{payload.idempotency_key}"))
        db.add(AdminAction(admin_user_id=admin.id, action_type="CLIENT_MESSAGE_QUEUED", entity_type="web_conversation", entity_id=conversation.id, details={"message_id": message.id, "user_id": user.id}))
        db.commit(); return {"id": message.id, "conversation_id": conversation.id, "idempotent_replay": False}
    finally: db.close()


@crm_router.post("/{user_id}/messages/{message_id}/retry")
def retry_admin_client_message(user_id: int, message_id: int, admin: User = Depends(require_visa_write)):
    """Requeue the existing failed outbox event without creating a duplicate delivery."""
    _enabled(); db = SessionLocal()
    try:
        if not _assigned_client(db, user_id, admin): raise HTTPException(status_code=404, detail="Client not found")
        message = (
            db.query(WebMessage)
            .join(WebConversation, WebConversation.id == WebMessage.conversation_id)
            .filter(
                WebMessage.id == message_id,
                WebMessage.author_type == "staff",
                WebMessage.visibility == "client",
                WebConversation.user_id == user_id,
            )
            .first()
        )
        if not message: raise HTTPException(status_code=404, detail="Outbound message not found")
        conversation = db.get(WebConversation, message.conversation_id)
        if conversation is None or not _conversation_allowed_for_staff(db, conversation, admin):
            raise HTTPException(status_code=404, detail="Outbound message not found")
        if not _is_root_admin(admin) and message.actor_telegram_id != admin.telegram_id:
            raise HTTPException(status_code=404, detail="Outbound message not found")
        event = (
            db.query(WebOutboxEvent)
            .filter(
                WebOutboxEvent.aggregate_id == message.conversation_id,
                WebOutboxEvent.event_type == "web_staff_client_message",
            )
            .with_for_update()
            .all()
        )
        event = next((item for item in event if int((item.payload or {}).get("message_id") or 0) == message.id), None)
        if not event: raise HTTPException(status_code=404, detail="Delivery event not found")
        if event.status == "delivered": raise HTTPException(status_code=409, detail="Message already delivered")
        if event.status == "pending": return {"message_id": message.id, "status": "pending", "idempotent_replay": True}
        if event.status != "failed": raise HTTPException(status_code=409, detail="Delivery cannot be retried")
        event.status = "pending"; event.delivered_at = None
        db.add(AdminAction(admin_user_id=admin.id, action_type="CLIENT_MESSAGE_RETRY_QUEUED", entity_type="web_message", entity_id=message.id, details={"event_id": event.id, "user_id": user_id}))
        db.commit()
        return {"message_id": message.id, "status": "pending", "idempotent_replay": False}
    finally: db.close()


@crm_router.post("/{user_id}/tags", status_code=201)
def admin_client_tag(user_id: int, payload: ClientTagRequest, admin: User = Depends(require_admin_write)):
    _enabled(); db = SessionLocal()
    try:
        if not db.query(User.id).filter(User.id == user_id).first(): raise HTTPException(status_code=404, detail="Client not found")
        tag = db.query(ClientTag).filter(ClientTag.name == payload.name.strip()).first()
        if not tag: tag = ClientTag(name=payload.name.strip(), created_by_admin_id=admin.id); db.add(tag); db.flush()
        assignment = db.query(ClientTagAssignment).filter_by(user_id=user_id, tag_id=tag.id).first()
        if not assignment: db.add(ClientTagAssignment(user_id=user_id, tag_id=tag.id, assigned_by_admin_id=admin.id))
        db.add(AdminAction(admin_user_id=admin.id, action_type="CLIENT_TAG_ASSIGNED", entity_type="user", entity_id=user_id, details={"tag_id": tag.id}))
        db.commit(); return {"id": tag.id, "name": tag.name}
    finally: db.close()


@crm_router.post("/{user_id}/notes", status_code=201)
def admin_client_note(user_id: int, payload: InternalNoteRequest, admin: User = Depends(require_visa_write)):
    _enabled(); db = SessionLocal()
    try:
        if not _assigned_client(db, user_id, admin): raise HTTPException(status_code=404, detail="Client not found")
        if not _is_root_admin(admin):
            if payload.visa_case_id is None or not _case_query(db, admin).filter(VisaCase.id == payload.visa_case_id, VisaCase.user_id == user_id).first():
                raise HTTPException(status_code=403, detail="Visa manager notes must belong to an assigned visa case")
        note = ClientInternalNote(user_id=user_id, visa_case_id=payload.visa_case_id, author_admin_id=admin.id, body=payload.body, pinned=payload.pinned)
        db.add(note); db.flush(); db.add(AdminAction(admin_user_id=admin.id, action_type="CLIENT_INTERNAL_NOTE_CREATED", entity_type="user", entity_id=user_id, details={"note_id": note.id, "pinned": note.pinned})); db.commit()
        return {"id": note.id, "pinned": note.pinned, "created_at": note.created_at}
    finally: db.close()


@admin_router.post("/{case_id}/documents", status_code=201)
def admin_document(case_id: int, payload: DocumentRequest, admin: User = Depends(require_admin_write)):
    _enabled()
    raise HTTPException(status_code=410, detail="Raw storage-key registration is retired; use protected upload")


@admin_router.post("/{case_id}/events", status_code=201)
def admin_event(case_id: int, payload: VisaEventCreate, admin: User = Depends(require_visa_write)):
    _enabled(); db = SessionLocal()
    try:
        case = _case_query(db, admin).filter(VisaCase.id == case_id).first()
        if not case: raise HTTPException(status_code=404, detail="Visa case not found")
        if payload.visibility == "CLIENT" and not payload.public_title: raise HTTPException(status_code=422, detail="Public event title required")
        event = append_event(db, case, event_type=payload.event_type, source="admin", actor_user_id=admin.id, reason=payload.reason, idempotency_key=payload.idempotency_key, visibility=payload.visibility, public_title=payload.public_title, public_description=payload.public_description)
        db.commit(); return {"id": event.id, "visibility": event.visibility, "title": event.public_title}
    finally: db.close()


@crm_router.post("/{user_id}/credentials", status_code=201)
def admin_credential(user_id: int, payload: CredentialRequest, admin: User = Depends(require_admin_write)):
    _enabled(); cipher = PIIEnvelopeCipher.from_settings(); db = SessionLocal()
    try:
        item = CredentialVaultItem(user_id=user_id, visa_case_id=payload.visa_case_id, provider=payload.provider, service_url=payload.service_url, login_envelope=cipher.encrypt(payload.login, context=f"credential:{user_id}:login") if payload.login else None, login_mask=mask_identifier(payload.login) if payload.login else None, secret_envelope=cipher.encrypt(payload.secret, context=f"credential:{user_id}:secret"), note_envelope=cipher.encrypt(payload.note, context=f"credential:{user_id}:note") if payload.note else None, created_by_admin_id=admin.id, updated_by_admin_id=admin.id)
        db.add(item); db.flush(); db.add(AdminAction(admin_user_id=admin.id, action_type="CREDENTIAL_CREATED", entity_type="credential", entity_id=item.id, details={"user_id": user_id, "provider": payload.provider})); db.commit()
        return {"id": item.id, "provider": item.provider, "login_mask": item.login_mask}
    finally: db.close()


@admin_router.post("/credentials/{credential_id}/access")
def admin_credential_access(credential_id: int, payload: CredentialAccessRequest, response: Response, admin: User = Depends(require_admin_write)):
    _enabled(); cipher = PIIEnvelopeCipher.from_settings(); db = SessionLocal()
    try:
        item = db.query(CredentialVaultItem).filter(CredentialVaultItem.id == credential_id).first()
        if not item: raise HTTPException(status_code=404, detail="Credential not found")
        secret = cipher.decrypt(item.secret_envelope, context=f"credential:{item.user_id}:secret")
        login = cipher.decrypt(item.login_envelope, context=f"credential:{item.user_id}:login") if item.login_envelope else None
        db.add(AdminAction(admin_user_id=admin.id, action_type=f"CREDENTIAL_{payload.action}", entity_type="credential", entity_id=item.id, comment=payload.reason, details={"user_id": item.user_id})); db.commit()
        response.headers["Cache-Control"] = "no-store"; response.headers["Pragma"] = "no-cache"
        return {"login": login, "secret": secret}
    finally: db.close()


@service_router.get("/users/by-telegram/{telegram_id}/cases")
def service_user_cases(telegram_id: int):
    _enabled(); db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_id == telegram_id, User.status == "active").first()
        if not user: raise HTTPException(status_code=404, detail="Client not found")
        return {"locale": user.locale, "items": [_card(db, r, timeline=True, client_view=True) for r in db.query(VisaCase).filter(VisaCase.user_id == user.id, VisaCase.publication_status == "PUBLISHED", VisaCase.lifecycle_status.notin_(("EXPIRED", "CANCELLED", "REFUSED"))).all()]}
    finally: db.close()


def _service_user(telegram_id: int) -> User:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_id == telegram_id, User.status == "active").first()
        if not user: raise HTTPException(status_code=404, detail="Client not found")
        db.expunge(user); return user
    finally: db.close()


@service_router.post("/users/by-telegram/{telegram_id}/cases/{case_id}/notifications")
def service_notifications(telegram_id: int, case_id: int, payload: NotificationUpdate): return _notifications(case_id, payload.enabled, _service_user(telegram_id), "telegram")
@service_router.post("/users/by-telegram/{telegram_id}/cases/{case_id}/entry")
def service_entry(telegram_id: int, case_id: int, payload: EntryUpdate): return _entry(case_id, payload, _service_user(telegram_id), "telegram")


@service_router.post("/deliveries/claim")
def service_claim(limit: int = Query(50, ge=1, le=100)):
    _enabled(); db = SessionLocal()
    try:
        rows = claim_deliveries(db, limit=limit); ids = [r.recipient_user_id for r in rows]
        users = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}
        return {"items": [{"id": r.id, "lease_token": r.lease_token, "telegram_id": users[r.recipient_user_id].telegram_id, "locale": r.locale, "notification_type": r.notification_type, "payload": r.payload} for r in rows]}
    finally: db.close()


@service_router.post("/deliveries/{delivery_id}/settle")
def service_settle(delivery_id: int, payload: DeliverySettlement):
    _enabled(); db = SessionLocal()
    try:
        try: row = settle_delivery(db, delivery_id, payload.lease_token, state=payload.state, telegram_message_id=payload.telegram_message_id, error_code=payload.error_code)
        except VisaLifecycleError as exc: raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"id": row.id, "state": row.state}
    finally: db.close()
