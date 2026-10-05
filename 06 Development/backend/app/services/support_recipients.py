"""Explicit notification observers; this configuration grants no Admin role."""
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User


def active_support_users(db: Session) -> list[User]:
    ids = settings.support_chat_ids
    if not ids:
        return []
    return db.query(User).filter(User.telegram_id.in_(ids), User.status == "active").all()
