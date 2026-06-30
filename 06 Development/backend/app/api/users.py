from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.session import SessionLocal
from app.models.points_ledger import PointsLedger
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


class UserRegisterRequest(BaseModel):
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    language: Optional[str] = "ru"
    invited_by_ref_code: Optional[str] = None


def make_ref_code(telegram_id: int) -> str:
    return f"TG{telegram_id}"


@router.post("/register")
def register_user(payload: UserRegisterRequest):
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.telegram_id == payload.telegram_id).first()

        if user:
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

        if payload.invited_by_ref_code:
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
            ref_code=make_ref_code(payload.telegram_id),
            invited_by_user_id=invited_by_user_id,
            status="active",
        )

        db.add(user)
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
