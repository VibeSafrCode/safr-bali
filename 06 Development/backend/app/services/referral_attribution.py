from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.referral import Referral
from app.models.user import User


@dataclass(frozen=True)
class ReferralAttributionResult:
    created: bool
    referral: Referral | None
    reason: str


def attribute_referral_once(
    db: Session,
    *,
    user_id: int,
    inviter_id: int,
    source: str,
) -> ReferralAttributionResult:
    """Create a user's first referral relationship without ever replacing one."""
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .with_for_update()
        .first()
    )
    inviter = db.query(User).filter(User.id == inviter_id).first()
    if not user or not inviter:
        return ReferralAttributionResult(False, None, "user_or_inviter_missing")
    if user.id == inviter.id:
        return ReferralAttributionResult(False, None, "self_referral")

    existing = (
        db.query(Referral)
        .filter(Referral.child_user_id == user.id)
        .order_by(Referral.id.asc())
        .first()
    )
    if user.invited_by_user_id is not None or existing is not None:
        return ReferralAttributionResult(False, existing, "already_attributed")

    referral = Referral(
        parent_user_id=inviter.id,
        child_user_id=user.id,
        level=1,
        source=source,
    )
    user.invited_by_user_id = inviter.id
    db.add(referral)
    db.flush()
    return ReferralAttributionResult(True, referral, "created")
