from fastapi import APIRouter, Depends, HTTPException

from app.core.security import rate_limit, require_admin_token, require_service_token
from app.db.session import SessionLocal
from app.models.payment import Payment


router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("", deprecated=True, dependencies=[Depends(rate_limit), Depends(require_service_token)])
def create_payment():
    raise HTTPException(status_code=410, detail="Legacy payment writes are retired")


@router.get("", dependencies=[Depends(rate_limit), Depends(require_admin_token)])
def get_payments():
    db = SessionLocal()

    try:
        payments = db.query(Payment).order_by(Payment.id.desc()).all()

        return [
            {
                "id": payment.id,
                "order_id": payment.order_id,
                "user_id": payment.user_id,
                "amount": float(payment.amount),
                "currency": payment.currency,
                "payment_method": payment.payment_method,
                "status": payment.status,
                "external_payment_id": payment.external_payment_id,
                "created_at": payment.created_at,
                "paid_at": payment.paid_at,
                "refunded_at": payment.refunded_at,
            }
            for payment in payments
        ]

    finally:
        db.close()


@router.patch("/{payment_id}/status", deprecated=True, dependencies=[Depends(rate_limit), Depends(require_admin_token)])
def update_payment_status(payment_id: int):
    raise HTTPException(status_code=410, detail="Legacy payment writes are retired")
