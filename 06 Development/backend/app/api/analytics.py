"""First-party routes. Not mounted until primary integration/release review."""
from __future__ import annotations

from datetime import date
from typing import Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request, Response
from pydantic import ValidationError

from app.api.web_admin import require_admin_write, require_web_admin
from app.api.web_portal import session_user
from app.core.config import settings
from app.core.security import rate_limit, require_service_token
from app.db.session import SessionLocal
from app.schemas.analytics import AnalyticsBatch, AnalyticsConsentInput, AnalyticsGrantInput, AnalyticsPolicyInput
from app.services import analytics as service


COOKIE_NAME = "safr_analytics_consent"
MAX_BODY_BYTES = 16 * 1024


def private_response(response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"


public_router = APIRouter(prefix="/api/analytics", tags=["analytics"],
                         dependencies=[Depends(rate_limit), Depends(private_response)])
admin_router = APIRouter(prefix="/api/web/admin/analytics", tags=["analytics-admin"],
                        dependencies=[Depends(rate_limit), Depends(private_response)])
service_router = APIRouter(prefix="/api/service/analytics", tags=["analytics-service"],
                          dependencies=[Depends(require_service_token), Depends(private_response)])


def _origin(request: Request):
    origin = request.headers.get("origin", "").rstrip("/")
    allowed = set()
    for configured in (settings.WEBSITE_URL, settings.APPLICATION_URL):
        parts = urlsplit(configured)
        if parts.scheme in {"http", "https"} and parts.netloc:
            allowed.add(f"{parts.scheme}://{parts.netloc}")
    if origin not in allowed:
        raise HTTPException(403, "Analytics origin denied")
    if settings.ENVIRONMENT == "production" and not origin.startswith("https://"):
        raise HTTPException(503, "Analytics secure origin required")
    return origin


def _privacy_signal(request: Request):
    return request.headers.get("sec-gpc") == "1" or request.headers.get("dnt") == "1"


async def _payload(request: Request, model):
    # Streaming bound is enforced regardless of an absent/forged Content-Length.
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise HTTPException(415, "Analytics JSON required")
    chunks, length = [], 0
    async for chunk in request.stream():
        length += len(chunk)
        if length > MAX_BODY_BYTES:
            raise HTTPException(413, "Analytics body too large")
        chunks.append(chunk)
    try:
        return model.model_validate_json(b"".join(chunks))
    except ValidationError:
        # Do not reflect prohibited submitted content in validation errors/logs.
        raise HTTPException(422, "Invalid analytics payload", headers={"Cache-Control": "private, no-store"}) from None


def _blocked(exc):
    raise HTTPException(exc.status, str(exc), headers={"Cache-Control": "private, no-store"}) from None


@public_router.get("/policy")
def read_policy(request: Request, token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME)):
    with SessionLocal() as db:
        projection = service.policy_projection(db)
        projection['has_consent'] = service.has_consent(db, token)
    if _privacy_signal(request):
        projection.update(enabled=False, has_consent=False, blocked_by_privacy_signal=True)
    return projection


@public_router.post("/consent")
async def consent(request: Request, response: Response, token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME)):
    origin = _origin(request)
    payload = await _payload(request, AnalyticsConsentInput)
    with SessionLocal() as db:
        try:
            if not payload.granted or _privacy_signal(request):
                service.revoke_consent(db, token)
                db.commit()
                response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="strict")
                return {"granted": False}
            issued = service.grant_consent(db, payload.policy_revision, old_token=token)
            db.commit()
        except service.AnalyticsBlocked as exc:
            db.rollback()
            _blocked(exc)
    response.set_cookie(COOKIE_NAME, issued, httponly=True, secure=origin.startswith("https://") or settings.WEB_COOKIE_SECURE,
                        samesite="strict", path="/", max_age=service.CONSENT_TTL_DAYS * 86400)
    return {"granted": True, "policy_revision": payload.policy_revision}


@public_router.post("/events")
async def events(request: Request, token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME)):
    _origin(request)
    if _privacy_signal(request):
        raise HTTPException(403, "Analytics privacy signal honored")
    payload = await _payload(request, AnalyticsBatch)
    with SessionLocal() as db:
        try:
            result = service.ingest(db, payload, token)
            db.commit()
            return result
        except service.AnalyticsBlocked as exc:
            db.rollback()
            _blocked(exc)


@service_router.post("/events")
async def trusted_events(request: Request, token: str = Header(default="", alias="X-Analytics-Consent")):
    payload = await _payload(request, AnalyticsBatch)
    with SessionLocal() as db:
        try:
            result = service.ingest(db, payload, token, trusted=True)
            db.commit()
            return result
        except service.AnalyticsBlocked as exc:
            db.rollback()
            _blocked(exc)


@admin_router.get("/policy")
def admin_policy(actor=Depends(require_web_admin)):
    with SessionLocal() as db:
        projection = service.policy_projection(db)
        row = db.get(service.AnalyticsPolicy, 1)
        if row:
            projection.update(allowed_content_ids=row.allowed_content_ids, allowed_service_ids=row.allowed_service_ids,
                              allowed_campaign_codes=row.allowed_campaign_codes)
        return projection


@admin_router.put("/policy")
async def save_policy(request: Request, actor=Depends(require_admin_write)):
    payload = await _payload(request, AnalyticsPolicyInput)
    with SessionLocal() as db:
        try:
            result = service.change_policy(db, payload, actor)
            db.commit()
            return result
        except service.AnalyticsBlocked as exc:
            db.rollback()
            _blocked(exc)


@admin_router.put("/access")
async def grant_access(request: Request, actor=Depends(require_admin_write)):
    payload = await _payload(request, AnalyticsGrantInput)
    with SessionLocal() as db:
        try:
            result = service.set_access(db, payload, actor)
            db.commit()
            return result
        except service.AnalyticsBlocked as exc:
            db.rollback()
            _blocked(exc)


@admin_router.get("/aggregates")
def read_aggregates(start: date, end: date, actor=Depends(session_user)):
    with SessionLocal() as db:
        try:
            return service.aggregates(db, actor, start, end)
        except service.AnalyticsBlocked as exc:
            _blocked(exc)


@admin_router.get("/events")
def read_events(after_id: int = Query(default=0, ge=0), limit: int = Query(default=50, ge=1, le=100), actor=Depends(session_user)):
    with SessionLocal() as db:
        try:
            return service.raw_events(db, actor, after_id=after_id, limit=limit)
        except service.AnalyticsBlocked as exc:
            _blocked(exc)


@admin_router.get("/retention-preview")
def retention_preview(actor=Depends(require_web_admin)):
    with SessionLocal() as db:
        return service.retention_preview(db)


@admin_router.post("/retention")
def retention(actor=Depends(require_admin_write)):
    with SessionLocal() as db:
        try:
            result = service.apply_retention(db, actor)
            db.commit()
            return result
        except service.AnalyticsBlocked as exc:
            db.rollback()
            _blocked(exc)
