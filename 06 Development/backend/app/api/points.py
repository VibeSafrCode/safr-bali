from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.db.session import SessionLocal
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.reward_rule import RewardRule
from app.models.service import Service
from app.models.user import User
from app.models.partner_mode import PartnerMode
from app.core.security import rate_limit, require_admin_token, require_service_token
from app.services.rewards import (
    RewardIdempotencyConflict,
    accrue_points_once,
    accrue_referral_reward,
    reward_rule_snapshot,
)

router = APIRouter(prefix="/points", tags=["points"], dependencies=[Depends(rate_limit), Depends(require_service_token)])


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


class ReferralPointsAccrueRequest(BaseModel):
    order_id: int
    partner_mode_slug: str = "direct"
    created_by_admin_id: Optional[int] = None


@router.post("/accrue")
def accrue_points(
    payload: PointsAccrueRequest,
    idempotency_key: str = Header(
        ...,
        alias="Idempotency-Key",
        min_length=1,
        max_length=255,
    ),
):
    db = SessionLocal()

    try:
        reward_rule = None
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

        snapshot = None
        if payload.reward_rule_id:
            partner_mode = (
                db.query(PartnerMode)
                .filter(PartnerMode.id == reward_rule.partner_mode_id)
                .first()
            )
            if partner_mode:
                snapshot = reward_rule_snapshot(
                    reward_rule,
                    partner_mode,
                    referral_level=payload.referral_level or 1,
                    amount=payload.amount,
                )
        try:
            result = accrue_points_once(
                db,
                user_id=payload.user_id,
                amount=payload.amount,
                operation_type=payload.operation_type,
                idempotency_key=idempotency_key,
                order_id=payload.order_id,
                service_id=payload.service_id,
                referral_level=payload.referral_level,
                reward_rule=reward_rule,
                reward_snapshot=snapshot,
                comment=payload.comment,
                created_by_admin_id=payload.created_by_admin_id,
            )
        except RewardIdempotencyConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        operation = result.operation
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
            "idempotent_replay": not result.created,
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
                "reward_rule_snapshot": operation.reward_rule_snapshot,
                "comment": operation.comment,
                "created_at": operation.created_at,
                "created_by_admin_id": operation.created_by_admin_id,
            }
            for operation in operations
        ]

    finally:
        db.close()


@router.post("/accrue-referral")
def accrue_referral_points(
    payload: ReferralPointsAccrueRequest,
    idempotency_key: Optional[str] = Header(
        default=None,
        alias="Idempotency-Key",
        max_length=255,
    ),
):
    db = SessionLocal()

    try:
        try:
            result = accrue_referral_reward(
                db,
                order_id=payload.order_id,
                partner_mode_slug=payload.partner_mode_slug,
                idempotency_key=idempotency_key,
                created_by_admin_id=payload.created_by_admin_id,
            )
        except RewardIdempotencyConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        if not result.operation:
            status_by_reason = {
                "inviter_missing": 400,
                "reward_amount_zero": 400,
            }
            raise HTTPException(
                status_code=status_by_reason.get(result.reason, 404),
                detail=result.reason.replace("_", " ").capitalize(),
            )
        operation = result.operation
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
            "partner_mode": payload.partner_mode_slug,
            "comment": operation.comment,
            "created_at": operation.created_at,
            "idempotent_replay": not result.created,
        }

    finally:
        db.close()
