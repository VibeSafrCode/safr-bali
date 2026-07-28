from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.order import Order
from app.models.partner_mode import PartnerMode
from app.models.points_ledger import PointsLedger
from app.models.reward_rule import RewardRule
from app.models.user import User


class RewardIdempotencyConflict(ValueError):
    pass


@dataclass(frozen=True)
class PointsAccrualResult:
    operation: PointsLedger
    created: bool


@dataclass(frozen=True)
class ReferralRewardResult:
    operation: PointsLedger | None
    created: bool
    reason: str


def current_balance(db: Session, user_id: int) -> int:
    last_operation = (
        db.query(PointsLedger)
        .filter(PointsLedger.user_id == user_id)
        .order_by(PointsLedger.id.desc())
        .first()
    )
    return last_operation.balance_after if last_operation else 0


def reward_rule_snapshot(
    reward_rule: RewardRule,
    partner_mode: PartnerMode,
    *,
    referral_level: int,
    amount: int,
) -> dict:
    return {
        "schema_version": 1,
        "reward_rule_id": reward_rule.id,
        "service_id": reward_rule.service_id,
        "partner_mode_id": partner_mode.id,
        "partner_mode_slug": partner_mode.slug,
        "referral_level": referral_level,
        "awarded_points": amount,
        "level_1_points": reward_rule.level_1_points,
        "level_2_points": reward_rule.level_2_points,
        "level_3_points": reward_rule.level_3_points,
        "valid_from": reward_rule.valid_from.isoformat(),
        "valid_to": (
            reward_rule.valid_to.isoformat()
            if reward_rule.valid_to is not None
            else None
        ),
        "captured_at": datetime.utcnow().isoformat(),
    }


def _same_operation(
    operation: PointsLedger,
    *,
    user_id: int,
    amount: int,
    operation_type: str,
    order_id: int | None,
    service_id: int | None,
    referral_level: int | None,
    reward_rule_id: int | None,
    comment: str | None,
    created_by_admin_id: int | None,
) -> bool:
    return (
        operation.user_id == user_id
        and operation.amount == amount
        and operation.operation_type == operation_type
        and operation.order_id == order_id
        and operation.service_id == service_id
        and operation.referral_level == referral_level
        and operation.reward_rule_id == reward_rule_id
        and operation.comment == comment
        and operation.created_by_admin_id == created_by_admin_id
    )


def _lock_idempotency_key(db: Session, idempotency_key: str) -> None:
    if db.get_bind().dialect.name != "postgresql":
        return

    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": idempotency_key},
    )


def accrue_points_once(
    db: Session,
    *,
    user_id: int,
    amount: int,
    operation_type: str,
    idempotency_key: str | None,
    order_id: int | None = None,
    service_id: int | None = None,
    referral_level: int | None = None,
    reward_rule: RewardRule | None = None,
    reward_snapshot: dict | None = None,
    comment: str | None = None,
    created_by_admin_id: int | None = None,
) -> PointsAccrualResult:
    normalized_key = idempotency_key.strip() if idempotency_key else None
    if idempotency_key is not None and not normalized_key:
        raise RewardIdempotencyConflict("Idempotency key must not be blank")
    if normalized_key and len(normalized_key) > 255:
        raise RewardIdempotencyConflict("Idempotency key is too long")

    if normalized_key:
        _lock_idempotency_key(db, normalized_key)
        existing = (
            db.query(PointsLedger)
            .filter(PointsLedger.idempotency_key == normalized_key)
            .first()
        )
        if existing:
            if not _same_operation(
                existing,
                user_id=user_id,
                amount=amount,
                operation_type=operation_type,
                order_id=order_id,
                service_id=service_id,
                referral_level=referral_level,
                reward_rule_id=reward_rule.id if reward_rule else None,
                comment=comment,
                created_by_admin_id=created_by_admin_id,
            ):
                raise RewardIdempotencyConflict(
                    "Idempotency key belongs to another operation"
                )
            return PointsAccrualResult(existing, False)

    locked_user = (
        db.query(User)
        .filter(User.id == user_id)
        .with_for_update()
        .first()
    )
    if not locked_user:
        raise ValueError("Points user does not exist")

    if normalized_key:
        existing = (
            db.query(PointsLedger)
            .filter(PointsLedger.idempotency_key == normalized_key)
            .first()
        )
        if existing:
            if not _same_operation(
                existing,
                user_id=user_id,
                amount=amount,
                operation_type=operation_type,
                order_id=order_id,
                service_id=service_id,
                referral_level=referral_level,
                reward_rule_id=reward_rule.id if reward_rule else None,
                comment=comment,
                created_by_admin_id=created_by_admin_id,
            ):
                raise RewardIdempotencyConflict(
                    "Idempotency key belongs to another operation"
                )
            return PointsAccrualResult(existing, False)

    operation = PointsLedger(
        user_id=user_id,
        operation_type=operation_type,
        amount=amount,
        balance_after=current_balance(db, user_id) + amount,
        order_id=order_id,
        service_id=service_id,
        referral_level=referral_level,
        reward_rule_id=reward_rule.id if reward_rule else None,
        reward_rule_snapshot=reward_snapshot,
        idempotency_key=normalized_key,
        comment=comment,
        created_by_admin_id=created_by_admin_id,
    )
    db.add(operation)
    db.flush()
    return PointsAccrualResult(operation, True)


def accrue_referral_reward(
    db: Session,
    *,
    order_id: int,
    partner_mode_slug: str = "direct",
    idempotency_key: Optional[str] = None,
    created_by_admin_id: int | None = None,
) -> ReferralRewardResult:
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update()
        .first()
    )
    if not order:
        return ReferralRewardResult(None, False, "order_missing")

    existing = (
        db.query(PointsLedger)
        .filter(
            PointsLedger.order_id == order.id,
            PointsLedger.operation_type == "referral_accrual",
        )
        .first()
    )
    if existing:
        return ReferralRewardResult(existing, False, "already_accrued")

    client = db.query(User).filter(User.id == order.user_id).first()
    if not client:
        return ReferralRewardResult(None, False, "client_missing")
    if not client.invited_by_user_id:
        return ReferralRewardResult(None, False, "inviter_missing")

    inviter = (
        db.query(User)
        .filter(User.id == client.invited_by_user_id)
        .with_for_update()
        .first()
    )
    if not inviter:
        return ReferralRewardResult(None, False, "inviter_missing")

    existing = (
        db.query(PointsLedger)
        .filter(
            PointsLedger.order_id == order.id,
            PointsLedger.operation_type == "referral_accrual",
        )
        .first()
    )
    if existing:
        return ReferralRewardResult(existing, False, "already_accrued")

    partner_mode = (
        db.query(PartnerMode)
        .filter(
            PartnerMode.slug == partner_mode_slug,
            PartnerMode.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not partner_mode:
        return ReferralRewardResult(None, False, "partner_mode_missing")

    reward_rule = (
        db.query(RewardRule)
        .filter(
            RewardRule.service_id == order.service_id,
            RewardRule.partner_mode_id == partner_mode.id,
            RewardRule.is_active == True,  # noqa: E712
        )
        .order_by(RewardRule.valid_from.desc(), RewardRule.id.desc())
        .first()
    )
    if not reward_rule:
        return ReferralRewardResult(None, False, "reward_rule_missing")

    amount = reward_rule.level_1_points
    if amount <= 0:
        return ReferralRewardResult(None, False, "reward_amount_zero")

    result = accrue_points_once(
        db,
        user_id=inviter.id,
        amount=amount,
        operation_type="referral_accrual",
        idempotency_key=(
            idempotency_key
            or f"referral_accrual:order:{order.id}:{partner_mode.slug}"
        ),
        order_id=order.id,
        service_id=order.service_id,
        referral_level=1,
        reward_rule=reward_rule,
        reward_snapshot=reward_rule_snapshot(
            reward_rule,
            partner_mode,
            referral_level=1,
            amount=amount,
        ),
        comment=f"Referral reward for completed order #{order.id}",
        created_by_admin_id=created_by_admin_id,
    )
    return ReferralRewardResult(
        result.operation,
        result.created,
        "created" if result.created else "idempotent_replay",
    )
