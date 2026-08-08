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
    attribution_reason: str | None = None,
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
    if existing is not None:
        if existing.parent_user_id != inviter.id:
            return ReferralAttributionResult(False, existing, "already_attributed")
        if user.invited_by_user_id is None:
            user.invited_by_user_id = inviter.id
            db.flush()
            return ReferralAttributionResult(False, existing, "pointer_repaired")
        if user.invited_by_user_id != inviter.id:
            return ReferralAttributionResult(False, existing, "attribution_conflict")
        return ReferralAttributionResult(False, existing, "already_attributed")

    if user.invited_by_user_id is not None:
        if user.invited_by_user_id != inviter.id:
            return ReferralAttributionResult(False, None, "already_attributed")
        referral = Referral(
            parent_user_id=inviter.id,
            child_user_id=user.id,
            level=1,
            source=source,
            attribution_reason=attribution_reason,
        )
        db.add(referral)
        db.flush()
        return ReferralAttributionResult(True, referral, "row_repaired")

    referral = Referral(
        parent_user_id=inviter.id,
        child_user_id=user.id,
        level=1,
        source=source,
        attribution_reason=attribution_reason,
    )
    user.invited_by_user_id = inviter.id
    db.add(referral)
    db.flush()
    return ReferralAttributionResult(True, referral, "created")
