from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.api.web_admin import require_admin_write, require_web_admin
from app.core.security import rate_limit, require_service_token
from app.db.session import SessionLocal
from app.models.admin_safety import BusinessSettingVersion
from app.schemas.service_reminders import PolicyChange, PolicyPreview, PolicyRestore, ReminderPolicy, ReminderSettlement
from app.services import service_reminders as service


def private_response(response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"


admin_router = APIRouter(prefix="/api/web/admin/service-reminders", tags=["service-reminders"],
    dependencies=[Depends(rate_limit), Depends(private_response)])
service_router = APIRouter(prefix="/api/service/service-reminders", tags=["service-reminders"],
    dependencies=[Depends(require_service_token), Depends(private_response)])


@admin_router.get("")
def read(user=Depends(require_web_admin)):
    with SessionLocal() as db:
        return service.policy_projection(db)


@admin_router.put("")
def save(payload: PolicyChange, actor=Depends(require_admin_write)):
    with SessionLocal() as db:
        try:
            service.change_policy(db, expected_version=payload.expected_version, policy=payload.policy,
                                  reason=payload.reason, actor=actor)
            db.commit()
        except service.ReminderConflict as exc:
            db.rollback()
            raise HTTPException(409, str(exc)) from exc
        return service.policy_projection(db)


@admin_router.post("/preview")
def preview(payload: PolicyPreview, user=Depends(require_admin_write)):
    return service.preview(payload.policy)


@admin_router.post("/restore")
def restore(payload: PolicyRestore, actor=Depends(require_admin_write)):
    with SessionLocal() as db:
        source = db.query(BusinessSettingVersion).filter_by(**service.ENTITY, version=payload.restore_version).first()
        if source is None:
            raise HTTPException(404, "Reminder policy version not found")
        try:
            service.change_policy(db, expected_version=payload.expected_version,
                policy=ReminderPolicy.model_validate(source.payload), reason=payload.reason,
                actor=actor, restored_from=source.version)
            db.commit()
        except service.ReminderConflict as exc:
            db.rollback()
            raise HTTPException(409, str(exc)) from exc
        return service.policy_projection(db)


@service_router.post("/claim")
def claim(limit: int = Query(default=1, ge=1, le=5)):
    with SessionLocal() as db:
        items = service.claim(db, limit=limit)
        db.commit()
        return {"items": items}


@service_router.post("/deliveries/{delivery_id}/settle")
def settle(delivery_id: int, payload: ReminderSettlement):
    with SessionLocal() as db:
        try:
            row = service.settle(db, delivery_id, payload)
            db.commit()
        except service.ReminderConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        return {"id": row.id, "state": row.state}
