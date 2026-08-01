from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.db.session import SessionLocal
from app.models.admin_action import AdminAction
from app.models.user import User
from app.core.security import rate_limit, require_admin_token, require_service_token
from app.services.exchange_quotes import (
    RouteSettingsVersionConflict,
    create_route_settings_version,
    list_active_route_settings,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(rate_limit), Depends(require_admin_token)])


class RouteSettingsVersionCreate(BaseModel):
    settings: Dict[str, Any] = Field(min_length=1)


@router.get("/actions")
def get_admin_actions(limit: int = 50):
    db = SessionLocal()

    try:
        actions = (
            db.query(AdminAction, User)
            .join(User, AdminAction.admin_user_id == User.id)
            .order_by(AdminAction.id.desc())
            .limit(limit)
            .all()
        )

        return [
            {
                "id": action.id,
                "admin_user_id": action.admin_user_id,
                "admin": {
                    "id": admin.id,
                    "username": admin.username,
                    "first_name": admin.first_name,
                    "last_name": admin.last_name,
                    "role": admin.role,
                },
                "action_type": action.action_type,
                "entity_type": action.entity_type,
                "entity_id": action.entity_id,
                "comment": action.comment,
                "created_at": action.created_at,
            }
            for action, admin in actions
        ]

    finally:
        db.close()


@router.get("/exchange/routes")
def get_exchange_route_settings():
    db = SessionLocal()
    try:
        return {"routes": list_active_route_settings(db)}
    finally:
        db.close()


@router.post("/exchange/routes/{route_code}/versions", status_code=201)
def create_exchange_route_settings_version(
    route_code: str,
    payload: RouteSettingsVersionCreate,
):
    db = SessionLocal()
    try:
        version = create_route_settings_version(
            db,
            route_code=route_code,
            settings_payload=payload.settings,
        )
        return {
            "id": version.id,
            "route_code": version.route_code,
            "version": version.version,
            "is_active": version.is_active,
            "settings": version.settings,
            "effective_from": version.effective_from,
            "created_at": version.created_at,
        }
    except RouteSettingsVersionConflict as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    finally:
        db.close()
