"""Canonical read-only direct-referral count shared by client surfaces."""

from sqlalchemy.orm import Session

from app.models.referral import Referral


def direct_referral_count(db: Session, user_id: int) -> int:
    """Count all assigned first-line relationships, regardless of entry source.

    Source attribution describes how a relationship was created; it does not
    change its owner. Do not repair/reparent users or alter historical rewards
    while projecting this count.
    """
    return (
        db.query(Referral)
        .filter(Referral.parent_user_id == user_id, Referral.level == 1)
        .count()
    )
