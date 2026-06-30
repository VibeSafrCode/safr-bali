from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.session import SessionLocal
from app.models.admin_action import AdminAction
from app.models.order import Order
from app.models.partner_mode import PartnerMode
from app.models.points_ledger import PointsLedger
from app.models.reward_rule import RewardRule
from app.models.service import Service
from app.models.user import User

router = APIRouter(prefix="/orders", tags=["orders"])


class OrderCreateRequest(BaseModel):
    user_id: int
    service_id: int
    client_comment: Optional[str] = None


class OrderStatusUpdateRequest(BaseModel):
    status: str
    admin_comment: Optional[str] = None
    admin_user_id: Optional[int] = None


ALLOWED_ORDER_STATUSES = {
    "new",
    "in_progress",
    "paid",
    "completed",
    "cancelled",
}


def get_current_balance(db, user_id: int) -> int:
    last_operation = (
        db.query(PointsLedger)
        .filter(PointsLedger.user_id == user_id)
        .order_by(PointsLedger.id.desc())
        .first()
    )

    return last_operation.balance_after if last_operation else 0


def try_accrue_referral_points_for_order(db, order: Order):
    client = db.query(User).filter(User.id == order.user_id).first()

    if not client or not client.invited_by_user_id:
        return None

    existing_referral_accrual = (
        db.query(PointsLedger)
        .filter(
            PointsLedger.order_id == order.id,
            PointsLedger.operation_type == "referral_accrual",
        )
        .first()
    )

    if existing_referral_accrual:
        return existing_referral_accrual

    inviter = db.query(User).filter(User.id == client.invited_by_user_id).first()

    if not inviter:
        return None

    partner_mode = (
        db.query(PartnerMode)
        .filter(
            PartnerMode.slug == "direct",
            PartnerMode.is_active == True,  # noqa: E712
        )
        .first()
    )

    if not partner_mode:
        return None

    reward_rule = (
        db.query(RewardRule)
        .filter(
            RewardRule.service_id == order.service_id,
            RewardRule.partner_mode_id == partner_mode.id,
            RewardRule.is_active == True,  # noqa: E712
        )
        .first()
    )

    if not reward_rule or reward_rule.level_1_points <= 0:
        return None

    current_balance = get_current_balance(db, inviter.id)
    new_balance = current_balance + reward_rule.level_1_points

    operation = PointsLedger(
        user_id=inviter.id,
        operation_type="referral_accrual",
        amount=reward_rule.level_1_points,
        balance_after=new_balance,
        order_id=order.id,
        service_id=order.service_id,
        referral_level=1,
        reward_rule_id=reward_rule.id,
        comment=f"Referral reward for completed order #{order.id}",
    )

    db.add(operation)

    return operation


@router.post("")
def create_order(payload: OrderCreateRequest):
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.id == payload.user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        service = (
            db.query(Service)
            .filter(
                Service.id == payload.service_id,
                Service.is_active == True,  # noqa: E712
            )
            .first()
        )

        if not service:
            raise HTTPException(status_code=404, detail="Service not found")

        order = Order(
            user_id=payload.user_id,
            service_id=payload.service_id,
            client_comment=payload.client_comment,
            status="new",
            payment_status="pending",
        )

        db.add(order)
        db.commit()
        db.refresh(order)

        return {
            "id": order.id,
            "user_id": order.user_id,
            "service_id": order.service_id,
            "service_name": service.name,
            "status": order.status,
            "payment_status": order.payment_status,
            "client_comment": order.client_comment,
            "created_at": order.created_at,
        }

    finally:
        db.close()


@router.get("")
def get_orders():
    db = SessionLocal()

    try:
        orders = db.query(Order).order_by(Order.id.desc()).all()

        return [
            {
                "id": order.id,
                "user_id": order.user_id,
                "service_id": order.service_id,
                "status": order.status,
                "payment_status": order.payment_status,
                "client_comment": order.client_comment,
                "created_at": order.created_at,
            }
            for order in orders
        ]

    finally:
        db.close()


@router.patch("/{order_id}/status")
def update_order_status(order_id: int, payload: OrderStatusUpdateRequest):
    db = SessionLocal()

    try:
        order = db.query(Order).filter(Order.id == order_id).first()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if payload.status not in ALLOWED_ORDER_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid order status")

        if payload.admin_user_id:
            admin = db.query(User).filter(User.id == payload.admin_user_id).first()

            if not admin:
                raise HTTPException(status_code=404, detail="Admin user not found")

        old_status = order.status
        order.status = payload.status

        if payload.admin_comment is not None:
            order.admin_comment = payload.admin_comment

        if payload.status == "paid":
            order.payment_status = "paid"
            order.paid_at = datetime.utcnow()

        referral_points_operation = None

        if payload.status == "completed":
            order.completed_at = datetime.utcnow()
            referral_points_operation = try_accrue_referral_points_for_order(db, order)

        if payload.status == "cancelled":
            order.cancelled_at = datetime.utcnow()

        if payload.admin_user_id:
            admin_action = AdminAction(
                admin_user_id=payload.admin_user_id,
                action_type="order_status_updated",
                entity_type="order",
                entity_id=order.id,
                comment=(
                    f"Order status changed from {old_status} to {payload.status}. "
                    f"Comment: {payload.admin_comment or ''}"
                ),
            )

            db.add(admin_action)

        db.commit()
        db.refresh(order)

        return {
            "id": order.id,
            "user_id": order.user_id,
            "service_id": order.service_id,
            "status": order.status,
            "payment_status": order.payment_status,
            "client_comment": order.client_comment,
            "admin_comment": order.admin_comment,
            "paid_at": order.paid_at,
            "completed_at": order.completed_at,
            "cancelled_at": order.cancelled_at,
            "updated_at": order.updated_at,
            "referral_points_accrual": None if referral_points_operation is None else {
                "id": referral_points_operation.id,
                "user_id": referral_points_operation.user_id,
                "amount": referral_points_operation.amount,
                "balance_after": referral_points_operation.balance_after,
                "operation_type": referral_points_operation.operation_type,
            },
        }

    finally:
        db.close()
