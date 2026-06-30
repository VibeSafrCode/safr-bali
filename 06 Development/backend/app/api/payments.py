from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.session import SessionLocal
from app.models.order import Order
from app.models.payment import Payment
from app.models.user import User

router = APIRouter(prefix="/payments", tags=["payments"])


class PaymentCreateRequest(BaseModel):
    order_id: int
    user_id: int
    amount: float
    currency: str = "USD"
    payment_method: Optional[str] = None
    external_payment_id: Optional[str] = None


class PaymentStatusUpdateRequest(BaseModel):
    status: str


ALLOWED_PAYMENT_STATUSES = {
    "pending",
    "paid",
    "cancelled",
    "refunded",
}


@router.post("")
def create_payment(payload: PaymentCreateRequest):
    db = SessionLocal()

    try:
        order = db.query(Order).filter(Order.id == payload.order_id).first()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        user = db.query(User).filter(User.id == payload.user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if order.user_id != payload.user_id:
            raise HTTPException(
                status_code=400,
                detail="Payment user does not match order user",
            )

        if payload.amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be positive")

        payment = Payment(
            order_id=payload.order_id,
            user_id=payload.user_id,
            amount=payload.amount,
            currency=payload.currency,
            payment_method=payload.payment_method,
            external_payment_id=payload.external_payment_id,
            status="pending",
        )

        db.add(payment)

        order.payment_status = "pending"

        db.commit()
        db.refresh(payment)

        return {
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

    finally:
        db.close()


@router.get("")
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


@router.patch("/{payment_id}/status")
def update_payment_status(payment_id: int, payload: PaymentStatusUpdateRequest):
    db = SessionLocal()

    try:
        payment = db.query(Payment).filter(Payment.id == payment_id).first()

        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")

        if payload.status not in ALLOWED_PAYMENT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid payment status")

        order = db.query(Order).filter(Order.id == payment.order_id).first()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        payment.status = payload.status
        order.payment_status = payload.status

        if payload.status == "paid":
            payment.paid_at = datetime.utcnow()
            order.paid_at = datetime.utcnow()

        if payload.status == "refunded":
            payment.refunded_at = datetime.utcnow()

        db.commit()
        db.refresh(payment)
        db.refresh(order)

        return {
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
            "order": {
                "id": order.id,
                "status": order.status,
                "payment_status": order.payment_status,
                "paid_at": order.paid_at,
            },
        }

    finally:
        db.close()
