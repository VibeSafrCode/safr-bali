from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.admin_action import AdminAction
from app.models.order import Order
from app.models.user import User
from app.services.rewards import accrue_referral_reward, reverse_referral_reward


class AdminOrderConflict(ValueError):
    pass


@dataclass(frozen=True)
class AdminOrderResult:
    order: Order
    action: AdminAction
    idempotent_replay: bool
    reward_operation_id: int | None
    reversal_operation_id: int | None


def _lock_action_key(db: Session, key: str) -> None:
    if db.get_bind().dialect.name == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
            {"key": f"admin-order:{key}"},
        )


def transition_order(
    db: Session,
    *,
    order_id: int,
    target: str,
    actor: User,
    comment: str,
    idempotency_key: str,
) -> AdminOrderResult:
    normalized_comment = comment.strip()
    normalized_key = idempotency_key.strip()
    if actor.role != "admin" or actor.status != "active":
        raise PermissionError("Active admin role required")
    if target not in {"paid", "completed", "cancelled"}:
        raise AdminOrderConflict("Unsupported admin order transition")
    if not normalized_comment:
        raise AdminOrderConflict("Admin comment is required")
    if not normalized_key or len(normalized_key) > 255:
        raise AdminOrderConflict("Valid idempotency key is required")

    _lock_action_key(db, normalized_key)
    existing = (
        db.query(AdminAction)
        .filter(AdminAction.idempotency_key == normalized_key)
        .first()
    )
    if existing:
        expected = {"target": target, "order_id": order_id}
        if (
            existing.admin_user_id != actor.id
            or existing.entity_type != "order"
            or existing.entity_id != order_id
            or not existing.details
            or any(existing.details.get(key) != value for key, value in expected.items())
        ):
            raise AdminOrderConflict("Idempotency key belongs to another action")
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise AdminOrderConflict("Order no longer exists")
        return AdminOrderResult(order, existing, True, None, None)

    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update()
        .first()
    )
    if not order:
        raise LookupError("Order not found")
    old_status = order.status
    old_payment_status = order.payment_status
    now = datetime.utcnow()
    reward_operation_id = None
    reversal_operation_id = None

    if target == "paid":
        if order.status in {"completed", "cancelled"}:
            raise AdminOrderConflict("Terminal order cannot be marked paid")
        order.payment_status = "paid"
        order.paid_at = order.paid_at or now
    elif target == "completed":
        if order.status == "cancelled":
            raise AdminOrderConflict("Cancelled order cannot be completed")
        if order.payment_status != "paid":
            raise AdminOrderConflict("Payment must be confirmed before completion")
        order.status = "completed"
        order.completed_at = order.completed_at or now
        reward = accrue_referral_reward(
            db,
            order_id=order.id,
            created_by_admin_id=actor.id,
        )
        reward_operation_id = reward.operation.id if reward.operation else None
    else:
        if order.status == "cancelled":
            raise AdminOrderConflict("Order is already cancelled")
        reversal = reverse_referral_reward(
            db,
            order_id=order.id,
            created_by_admin_id=actor.id,
        )
        reversal_operation_id = reversal.operation.id if reversal.operation else None
        order.status = "cancelled"
        order.cancelled_at = order.cancelled_at or now
        if order.payment_status == "paid":
            order.payment_status = "refund_required"

    order.admin_comment = normalized_comment
    action = AdminAction(
        admin_user_id=actor.id,
        action_type=f"order_{target}",
        entity_type="order",
        entity_id=order.id,
        comment=normalized_comment,
        idempotency_key=normalized_key,
        details={
            "order_id": order.id,
            "target": target,
            "old_status": old_status,
            "new_status": order.status,
            "old_payment_status": old_payment_status,
            "new_payment_status": order.payment_status,
            "reward_operation_id": reward_operation_id,
            "reversal_operation_id": reversal_operation_id,
        },
    )
    db.add(action)
    db.flush()
    return AdminOrderResult(
        order,
        action,
        False,
        reward_operation_id,
        reversal_operation_id,
    )
