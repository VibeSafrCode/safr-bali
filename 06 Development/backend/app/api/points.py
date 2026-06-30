from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.session import SessionLocal
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.reward_rule import RewardRule
from app.models.service import Service
from app.models.user import User

router = APIRouter(prefix="/points", tags=["points"])


class PointsAccrueRequest(BaseModel):
    user_id: int
    amount: int
    operation_type: str = "manual_accrual"
    order_id: Optional[int] = None
    service_id: Optional[int] = None
    referral_level: Optional[int] = None
    reward_rule_id: Optional[int] = None
    comment: Optional[str] = None
    created_by_admin_id: Optional[int] = None


def get_current_balance(db, user_id: int) -> int:
    last_operation = (
        db.query(PointsLedger)
        .filter(PointsLedger.user_id == user_id)
        .order_by(PointsLedger.id.desc())
        .first()
    )

    return last_operation.balance_after if last_operation else 0


@router.post("/accrue")
def accrue_points(payload: PointsAccrueRequest):
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.id == payload.user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if payload.amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be positive")

        if payload.order_id:
            order = db.query(Order).filter(Order.id == payload.order_id).first()

            if not order:
                raise HTTPException(status_code=404, detail="Order not found")

        if payload.service_id:
            service = db.query(Service).filter(Service.id == payload.service_id).first()

            if not service:
                raise HTTPException(status_code=404, detail="Service not found")

        if payload.reward_rule_id:
            reward_rule = (
                db.query(RewardRule)
                .filter(RewardRule.id == payload.reward_rule_id)
                .first()
            )

            if not reward_rule:
                raise HTTPException(status_code=404, detail="Reward rule not found")

        if payload.created_by_admin_id:
            admin = db.query(User).filter(User.id == payload.created_by_admin_id).first()

            if not admin:
                raise HTTPException(status_code=404, detail="Admin user not found")

        current_balance = get_current_balance(db, payload.user_id)
        new_balance = current_balance + payload.amount

        operation = PointsLedger(
            user_id=payload.user_id,
            operation_type=payload.operation_type,
            amount=payload.amount,
            balance_after=new_balance,
            order_id=payload.order_id,
            service_id=payload.service_id,
            referral_level=payload.referral_level,
            reward_rule_id=payload.reward_rule_id,
            comment=payload.comment,
            created_by_admin_id=payload.created_by_admin_id,
        )

        db.add(operation)
        db.commit()
        db.refresh(operation)

        return {
            "id": operation.id,
            "user_id": operation.user_id,
            "operation_type": operation.operation_type,
            "amount": operation.amount,
            "balance_after": operation.balance_after,
            "order_id": operation.order_id,
            "service_id": operation.service_id,
            "referral_level": operation.referral_level,
            "reward_rule_id": operation.reward_rule_id,
            "comment": operation.comment,
            "created_at": operation.created_at,
        }

    finally:
        db.close()


@router.get("/user/{user_id}/ledger")
def get_user_points_ledger(user_id: int):
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        operations = (
            db.query(PointsLedger)
            .filter(PointsLedger.user_id == user_id)
            .order_by(PointsLedger.id.desc())
            .all()
        )

        return [
            {
                "id": operation.id,
                "operation_type": operation.operation_type,
                "amount": operation.amount,
                "balance_after": operation.balance_after,
                "order_id": operation.order_id,
                "service_id": operation.service_id,
                "referral_level": operation.referral_level,
                "reward_rule_id": operation.reward_rule_id,
                "comment": operation.comment,
                "created_at": operation.created_at,
                "created_by_admin_id": operation.created_by_admin_id,
            }
            for operation in operations
        ]

    finally:
        db.close()
