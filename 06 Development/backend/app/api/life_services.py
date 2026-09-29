from fastapi import APIRouter, Depends, HTTPException, Response
from datetime import datetime, timezone

from app.api.mini_app import require_mini_app_user
from app.api.web_admin import require_admin_write, require_web_admin
from app.api.web_portal import session_user
from app.api.visa_lifecycle import require_client_write
from app.core.security import rate_limit
from app.db.session import SessionLocal
from app.models.life_services import LifeService
from app.models.user import User
from app.models.admin_action import AdminAction
from app.schemas.life_services import LifeServiceCreate, LifeServiceUpdate, LifeServiceNotifications
from app.services.service_reminders import suppress_pending
from app.services.life_services import (
    LifeServiceConflict, LifeServiceNotFound, create_life_service,
    life_service_projection, update_life_service,
)


def private_response(response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"


_dependencies = [Depends(rate_limit), Depends(private_response)]
admin_router = APIRouter(prefix="/api/web/admin/clients", tags=["web-admin", "life-services"], dependencies=_dependencies)
web_router = APIRouter(prefix="/api/web/life-services", tags=["life-services"], dependencies=_dependencies)
mini_router = APIRouter(prefix="/mini-app/life-services", tags=["life-services"], dependencies=_dependencies)


def _client(db, user_id: int):
    if db.query(User.id).filter(User.id == user_id, User.status == "active").first() is None:
        raise HTTPException(status_code=404, detail="Client not found")


def _client_services(user: User, record_id: int | None = None):
    with SessionLocal() as db:
        query = db.query(LifeService).filter(
            LifeService.user_id == user.id, LifeService.publication_status == "PUBLISHED",
        )
        if record_id is not None:
            row = query.filter(LifeService.id == record_id).first()
            if row is None:
                raise HTTPException(status_code=404, detail="Service not found")
            return life_service_projection(row, db=db)
        return {"items": [life_service_projection(row, db=db) for row in query.order_by(LifeService.end_date, LifeService.id).all()]}


@web_router.get("")
def web_life_services(user: User = Depends(session_user)):
    return _client_services(user)


@mini_router.get("")
def mini_life_services(user: User = Depends(require_mini_app_user)):
    return _client_services(user)


@web_router.get("/{record_id}")
def web_life_service(record_id: int, user: User = Depends(session_user)):
    return _client_services(user, record_id)


@mini_router.get("/{record_id}")
def mini_life_service(record_id: int, user: User = Depends(require_mini_app_user)):
    return _client_services(user, record_id)


def _notifications(record_id: int, payload: LifeServiceNotifications, user: User):
    with SessionLocal() as db:
        row = db.query(LifeService).filter_by(id=record_id, user_id=user.id, publication_status="PUBLISHED").with_for_update().first()
        if row is None:
            raise HTTPException(404, "Service not found")
        before = row.notifications_enabled
        row.notifications_enabled = payload.enabled
        row.version += 1
        row.updated_at = datetime.now(timezone.utc)
        if not payload.enabled:
            suppress_pending(db, life_service_id=row.id)
        db.add(AdminAction(admin_user_id=user.id, action_type="LIFE_SERVICE_NOTIFICATIONS_CHANGED",
            entity_type="life_service", entity_id=row.id, details={"before": before, "enabled": payload.enabled, "source": "client"}))
        db.commit()
        return life_service_projection(row, db=db)


@web_router.patch("/{record_id}/notifications")
def web_notifications(record_id: int, payload: LifeServiceNotifications, user: User = Depends(require_client_write)):
    return _notifications(record_id, payload, user)


@mini_router.patch("/{record_id}/notifications")
def mini_notifications(record_id: int, payload: LifeServiceNotifications, user: User = Depends(require_mini_app_user)):
    return _notifications(record_id, payload, user)


@admin_router.get("/{user_id}/life-services")
def admin_life_services(user_id: int, admin: User = Depends(require_web_admin)):
    with SessionLocal() as db:
        _client(db, user_id)
        rows = db.query(LifeService).filter_by(user_id=user_id).order_by(LifeService.updated_at.desc(), LifeService.id.desc()).all()
        return {"items": [life_service_projection(row, staff=True, db=db) for row in rows]}


@admin_router.post("/{user_id}/life-services", status_code=201)
def admin_create_life_service(user_id: int, payload: LifeServiceCreate, response: Response, admin: User = Depends(require_admin_write)):
    with SessionLocal() as db:
        _client(db, user_id)
        try:
            row, replay = create_life_service(db, user_id=user_id, actor_id=admin.id, payload=payload)
            result = {**life_service_projection(row, staff=True, db=db), "idempotent_replay": replay}
            db.commit()
        except LifeServiceConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        if replay:
            response.status_code = 200
        return result


@admin_router.get("/{user_id}/life-services/{record_id}")
def admin_life_service(user_id: int, record_id: int, admin: User = Depends(require_web_admin)):
    with SessionLocal() as db:
        _client(db, user_id)
        row = db.query(LifeService).filter_by(id=record_id, user_id=user_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Service not found")
        return life_service_projection(row, staff=True, db=db)


@admin_router.put("/{user_id}/life-services/{record_id}")
def admin_update_life_service(user_id: int, record_id: int, payload: LifeServiceUpdate, admin: User = Depends(require_admin_write)):
    with SessionLocal() as db:
        _client(db, user_id)
        try:
            row = update_life_service(db, user_id=user_id, record_id=record_id, actor_id=admin.id, payload=payload)
            result = {**life_service_projection(row, staff=True, db=db), "idempotent_replay": False}
            db.commit()
            return result
        except LifeServiceNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except LifeServiceConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
