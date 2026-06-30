from fastapi import APIRouter

from app.db.session import SessionLocal
from app.models.admin_action import AdminAction
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])


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
