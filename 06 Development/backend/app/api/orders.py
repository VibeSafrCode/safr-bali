from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.db.session import SessionLocal
from app.models.order import Order
from app.models.service import Service
from app.models.user import User
from app.core.security import rate_limit, require_admin_token, require_service_token
from app.services.rewards import accrue_referral_reward
from app.services.admin_orders import AdminOrderConflict, transition_order

router = APIRouter(prefix="/orders", tags=["orders"])


class OrderCreateRequest(BaseModel):
    user_id: int
    service_id: int
    client_comment: Optional[str] = None


class OrderStatusUpdateRequest(BaseModel):
    status: str
    admin_comment: Optional[str] = None
    admin_user_id: Optional[int] = None


def try_accrue_referral_points_for_order(db, order: Order):
    return accrue_referral_reward(db, order_id=order.id).operation


@router.post("", dependencies=[Depends(rate_limit), Depends(require_service_token)])
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


@router.get("", dependencies=[Depends(rate_limit), Depends(require_admin_token)])
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


@router.patch("/{order_id}/status", dependencies=[Depends(rate_limit), Depends(require_admin_token)])
def update_order_status(
    order_id: int,
    payload: OrderStatusUpdateRequest,
    idempotency_key: str = Header(
        ...,
        alias="Idempotency-Key",
        min_length=1,
        max_length=255,
    ),
):
    db = SessionLocal()

    try:
        if payload.status not in {"paid", "completed", "cancelled"}:
            raise HTTPException(status_code=400, detail="Invalid manual order status")
        if not payload.admin_user_id:
            raise HTTPException(status_code=400, detail="Admin actor is required")
        admin = db.query(User).filter(User.id == payload.admin_user_id).first()
        if not admin:
            raise HTTPException(status_code=404, detail="Admin user not found")
        try:
            result = transition_order(
                db,
                order_id=order_id,
                target=payload.status,
                actor=admin,
                comment=payload.admin_comment or "",
                idempotency_key=idempotency_key,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except AdminOrderConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        order = result.order

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
            "admin_action_id": result.action.id,
            "idempotent_replay": result.idempotent_replay,
            "reward_operation_id": result.reward_operation_id,
            "reversal_operation_id": result.reversal_operation_id,
        }

    finally:
        db.close()
