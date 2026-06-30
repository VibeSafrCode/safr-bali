from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.session import SessionLocal
from app.models.order import Order
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


ALLOWED_ORDER_STATUSES = {
    "new",
    "in_progress",
    "paid",
    "completed",
    "cancelled",
}


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

        order.status = payload.status

        if payload.admin_comment is not None:
            order.admin_comment = payload.admin_comment

        if payload.status == "paid":
            order.payment_status = "paid"
            order.paid_at = datetime.utcnow()

        if payload.status == "completed":
            order.completed_at = datetime.utcnow()

        if payload.status == "cancelled":
            order.cancelled_at = datetime.utcnow()

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
        }

    finally:
        db.close()
