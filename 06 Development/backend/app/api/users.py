from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db.session import SessionLocal
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.user import User
from app.models.order import Order
from app.models.service import Service
from app.core.security import rate_limit, require_service_token
from app.services.referral_attribution import attribute_referral_once

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(rate_limit), Depends(require_service_token)])


class UserRegisterRequest(BaseModel):
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    language: Optional[str] = "ru"
    invited_by_ref_code: Optional[str] = None
    invited_by_telegram_id: Optional[int] = None
    referral_code: Optional[str] = None


def make_ref_code(telegram_id: int) -> str:
    return f"TG{telegram_id}"


@router.post("/register")
def register_user(payload: UserRegisterRequest):
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.telegram_id == payload.telegram_id).first()

        if user:
            user.username = payload.username
            user.first_name = payload.first_name
            user.last_name = payload.last_name
            user.language = payload.language
            if payload.referral_code:
                code_owner = (
                    db.query(User)
                    .filter(
                        User.ref_code == payload.referral_code,
                        User.id != user.id,
                    )
                    .first()
                )
                if not code_owner:
                    user.ref_code = payload.referral_code

            db.commit()
            db.refresh(user)
            return {
                "id": user.id,
                "telegram_id": user.telegram_id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "language": user.language,
                "role": user.role,
                "ref_code": user.ref_code,
                "invited_by_user_id": user.invited_by_user_id,
                "status": user.status,
                "is_new": False,
            }

        invited_by_user_id = None

        if payload.invited_by_telegram_id:
            inviter = (
                db.query(User)
                .filter(User.telegram_id == payload.invited_by_telegram_id)
                .first()
            )
            if inviter and inviter.telegram_id != payload.telegram_id:
                invited_by_user_id = inviter.id
        elif payload.invited_by_ref_code:
            inviter = (
                db.query(User)
                .filter(User.ref_code == payload.invited_by_ref_code)
                .first()
            )

            if inviter:
                invited_by_user_id = inviter.id

        user = User(
            telegram_id=payload.telegram_id,
            username=payload.username,
            first_name=payload.first_name,
            last_name=payload.last_name,
            language=payload.language,
            role="client",
            ref_code=payload.referral_code or make_ref_code(payload.telegram_id),
            invited_by_user_id=invited_by_user_id,
            status="active",
        )

        db.add(user)
        db.flush()

        if invited_by_user_id:
            attribute_referral_once(
                db,
                user_id=user.id,
                inviter_id=invited_by_user_id,
                source="telegram",
            )

        db.commit()
        db.refresh(user)

        return {
            "id": user.id,
            "telegram_id": user.telegram_id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "language": user.language,
            "role": user.role,
            "ref_code": user.ref_code,
            "invited_by_user_id": user.invited_by_user_id,
            "status": user.status,
            "is_new": True,
        }

    finally:
        db.close()


@router.get("/{user_id}")
def get_user(user_id: int):
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return {
            "id": user.id,
            "telegram_id": user.telegram_id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "language": user.language,
            "role": user.role,
            "ref_code": user.ref_code,
            "invited_by_user_id": user.invited_by_user_id,
            "status": user.status,
            "created_at": user.created_at,
        }

    finally:
        db.close()


@router.get("/{user_id}/balance")
def get_user_balance(user_id: int):
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        last_operation = (
            db.query(PointsLedger)
            .filter(PointsLedger.user_id == user_id)
            .order_by(PointsLedger.id.desc())
            .first()
        )

        balance = last_operation.balance_after if last_operation else 0

        return {
            "user_id": user.id,
            "balance": balance,
            "currency": "SAFR_POINTS",
        }

    finally:
        db.close()


@router.get("/by-telegram/{telegram_id}/dashboard")
def get_user_dashboard(telegram_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_id == telegram_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        last_operation = (
            db.query(PointsLedger)
            .filter(PointsLedger.user_id == user.id)
            .order_by(PointsLedger.id.desc())
            .first()
        )
        orders = (
            db.query(Order, Service)
            .join(Service, Service.id == Order.service_id)
            .filter(Order.user_id == user.id)
            .order_by(Order.id.desc())
            .limit(30)
            .all()
        )
        referral_count = (
            db.query(Referral)
            .filter(Referral.parent_user_id == user.id, Referral.level == 1)
            .count()
        )
        return {
            "telegram_id": telegram_id,
            "balance": last_operation.balance_after if last_operation else 0,
            "referral_count": referral_count,
            "orders": [
                {
                    "id": order.id,
                    "service": service.name,
                    "status": order.status,
                    "payment_status": order.payment_status,
                    "amount_usd": order.amount_usd,
                    "created_at": order.created_at,
                }
                for order, service in orders
            ],
        }
    finally:
        db.close()
