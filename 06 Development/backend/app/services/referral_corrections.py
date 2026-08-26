from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.admin_action import AdminAction
from app.models.admin_safety import ReferralAttributionCorrection
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.user import User


class ReferralCorrectionBlocked(RuntimeError):
    pass


def _normalized_reason(value: str) -> str:
    return " ".join(value.split())


@dataclass(frozen=True)
class ReferralCorrectionPreview:
    child_user_id: int
    previous_parent_user_id: int | None
    new_parent_user_id: int
    referral_row_id: int | None
    reward_ledger_rows: int
    conflicts: tuple[str, ...]

    @property
    def executable(self) -> bool:
        return not self.conflicts


def referral_cycle_user_ids(db: Session) -> tuple[tuple[int, ...], ...]:
    """Return canonical, deterministic cycles from the User parent pointers."""
    parents = {
        int(user_id): int(parent_id) if parent_id is not None else None
        for user_id, parent_id in db.query(User.id, User.invited_by_user_id).all()
    }
    cycles: set[tuple[int, ...]] = set()
    for start in sorted(parents):
        path: list[int] = []
        positions: dict[int, int] = {}
        current: int | None = start
        while current is not None and current in parents:
            if current in positions:
                cycle = path[positions[current]:]
                if cycle:
                    rotations = [tuple(cycle[index:] + cycle[:index]) for index in range(len(cycle))]
                    cycles.add(min(rotations))
                break
            positions[current] = len(path)
            path.append(current)
            current = parents[current]
    return tuple(sorted(cycles))


def would_create_referral_cycle(
    db: Session, *, child_user_id: int, new_parent_user_id: int
) -> bool:
    """True when the proposed parent is the child or one of its descendants."""
    current: int | None = new_parent_user_id
    seen: set[int] = set()
    while current is not None and current not in seen:
        if current == child_user_id:
            return True
        seen.add(current)
        current = db.query(User.invited_by_user_id).filter(User.id == current).scalar()
    return current is not None


def build_referral_correction_preview(
    db: Session, *, child_user_id: int, new_parent_user_id: int
) -> ReferralCorrectionPreview:
    conflicts: list[str] = []
    child = db.query(User).filter(User.id == child_user_id).first()
    parent = db.query(User).filter(User.id == new_parent_user_id).first()
    relation = db.query(Referral).filter(Referral.child_user_id == child_user_id).first()
    if child is None:
        conflicts.append("child_missing")
    if parent is None:
        conflicts.append("inviter_missing")
    elif parent.status != "active":
        conflicts.append("inviter_inactive")
    if child_user_id == new_parent_user_id:
        conflicts.append("self_referral")
    elif child is not None and parent is not None and would_create_referral_cycle(
        db, child_user_id=child_user_id, new_parent_user_id=new_parent_user_id
    ):
        conflicts.append("referral_cycle")
    if child is not None and relation is None:
        conflicts.append("canonical_referral_row_missing")
    if child is not None and relation is not None and child.invited_by_user_id != relation.parent_user_id:
        conflicts.append("pointer_row_mismatch")
    if relation is not None and relation.parent_user_id == new_parent_user_id:
        conflicts.append("already_current")
    reward_rows = 0
    if child is not None:
        reward_rows = (
            db.query(PointsLedger)
            .join(Order, Order.id == PointsLedger.order_id)
            .filter(
                Order.user_id == child.id,
                PointsLedger.operation_type.in_(("referral_accrual", "referral_reversal")),
            )
            .count()
        )
        if reward_rows:
            conflicts.append("reward_ledger_activity_exists")
    return ReferralCorrectionPreview(
        child_user_id=child_user_id,
        previous_parent_user_id=relation.parent_user_id if relation else None,
        new_parent_user_id=new_parent_user_id,
        referral_row_id=relation.id if relation else None,
        reward_ledger_rows=reward_rows,
        conflicts=tuple(sorted(set(conflicts))),
    )


def apply_referral_correction(
    db: Session,
    *,
    child_user_id: int,
    new_parent_user_id: int,
    actor: User,
    reason: str,
    idempotency_key: str,
) -> tuple[ReferralAttributionCorrection, bool]:
    normalized_reason = _normalized_reason(reason)
    existing = db.query(ReferralAttributionCorrection).filter(
        ReferralAttributionCorrection.idempotency_key == idempotency_key
    ).first()
    if existing:
        if (
            existing.child_user_id != child_user_id
            or existing.new_parent_user_id != new_parent_user_id
            or existing.actor_admin_id != actor.id
            or _normalized_reason(existing.reason) != normalized_reason
        ):
            raise ReferralCorrectionBlocked("Idempotency key belongs to another correction")
        return existing, True
    preview = build_referral_correction_preview(
        db, child_user_id=child_user_id, new_parent_user_id=new_parent_user_id
    )
    if not preview.executable:
        raise ReferralCorrectionBlocked(",".join(preview.conflicts))
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        result = db.execute(
            text("""
                SELECT correction_id, idempotent_replay
                FROM safr_apply_referral_correction(
                    :child_user_id, :new_parent_user_id, :actor_admin_id,
                    :reason, :idempotency_key
                )
            """),
            {
                "child_user_id": child_user_id,
                "new_parent_user_id": new_parent_user_id,
                "actor_admin_id": actor.id,
                "reason": normalized_reason,
                "idempotency_key": idempotency_key,
            },
        ).one()
        correction = db.get(ReferralAttributionCorrection, int(result.correction_id))
        if correction is None:
            raise ReferralCorrectionBlocked("Correction evidence was not created")
        return correction, bool(result.idempotent_replay)
    relation = db.query(Referral).filter(Referral.id == preview.referral_row_id).with_for_update().one()
    child = db.query(User).filter(User.id == child_user_id).with_for_update().one()
    correction = ReferralAttributionCorrection(
        child_user_id=child.id,
        previous_parent_user_id=relation.parent_user_id,
        new_parent_user_id=new_parent_user_id,
        referral_row_id=relation.id,
        actor_admin_id=actor.id,
        reason=normalized_reason,
        source="manual_admin_correction",
        idempotency_key=idempotency_key,
    )
    db.add(correction)
    db.flush()
    child.invited_by_user_id = new_parent_user_id
    relation.parent_user_id = new_parent_user_id
    relation.source = "explicit_referral"
    relation.attribution_reason = "manual_admin_correction"
    db.add(AdminAction(
        admin_user_id=actor.id,
        action_type="REFERRAL_ATTRIBUTION_CORRECTED",
        entity_type="referral",
        entity_id=relation.id,
        comment=normalized_reason,
        idempotency_key=f"referral-correction:{idempotency_key}",
        details={
            "child_user_id": child.id,
            "previous_parent_user_id": correction.previous_parent_user_id,
            "new_parent_user_id": new_parent_user_id,
            "reward_ledger_changed": False,
        },
    ))
    db.flush()
    return correction, False
