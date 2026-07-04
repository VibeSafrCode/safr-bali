from fastapi import APIRouter, Depends, HTTPException

from app.db.session import SessionLocal
from app.models.referral import Referral
from app.models.user import User
from app.core.security import rate_limit, require_admin_token, require_service_token

router = APIRouter(prefix="/referrals", tags=["referrals"], dependencies=[Depends(rate_limit), Depends(require_service_token)])


@router.get("/user/{user_id}")
def get_user_referrals(user_id: int):
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        referrals = (
            db.query(Referral, User)
            .join(User, Referral.child_user_id == User.id)
            .filter(Referral.parent_user_id == user_id)
            .order_by(Referral.id.desc())
            .all()
        )

        return [
            {
                "referral_id": referral.id,
                "level": referral.level,
                "source": referral.source,
                "created_at": referral.created_at,
                "child_user": {
                    "id": child.id,
                    "telegram_id": child.telegram_id,
                    "username": child.username,
                    "first_name": child.first_name,
                    "last_name": child.last_name,
                    "ref_code": child.ref_code,
                    "status": child.status,
                },
            }
            for referral, child in referrals
        ]

    finally:
        db.close()


@router.get("/user/{user_id}/stats")
def get_user_referral_stats(user_id: int):
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        level_1_count = (
            db.query(Referral)
            .filter(
                Referral.parent_user_id == user_id,
                Referral.level == 1,
            )
            .count()
        )

        total_count = (
            db.query(Referral)
            .filter(Referral.parent_user_id == user_id)
            .count()
        )

        return {
            "user_id": user.id,
            "ref_code": user.ref_code,
            "level_1_count": level_1_count,
            "total_count": total_count,
        }

    finally:
        db.close()
