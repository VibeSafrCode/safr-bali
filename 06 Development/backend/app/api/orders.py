import hashlib
import json
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models.order import Order
from app.models.service import Service
from app.models.user import User
from app.core.security import rate_limit, require_admin_token, require_service_token
from app.core.config import settings
from app.services.rewards import accrue_referral_reward
from app.services.admin_orders import AdminOrderConflict, transition_order
from app.services.catalog_pricing import (
    FxUnavailable,
    PricingError,
    create_commercial_snapshot,
)

router = APIRouter(prefix="/orders", tags=["orders"])


class OrderCreateRequest(BaseModel):
    user_id: int
    service_id: int
    client_comment: Optional[str] = None
    price_option_code: str = "default"


class OrderStatusUpdateRequest(BaseModel):
    status: str
    admin_comment: Optional[str] = None
    admin_user_id: Optional[int] = None


def try_accrue_referral_points_for_order(db, order: Order):
    return accrue_referral_reward(db, order_id=order.id).operation


def _order_create_payload_hash(payload: OrderCreateRequest) -> str:
    encoded = json.dumps(payload.model_dump(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


@router.post("", dependencies=[Depends(rate_limit), Depends(require_service_token)])
def create_order(
    payload: OrderCreateRequest,
    idempotency_key: Optional[str] = Header(
        default=None,
        alias="Idempotency-Key",
        min_length=8,
        max_length=255,
    ),
):
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

        scoped_idempotency_key: Optional[str] = None
        payload_hash: Optional[str] = None
        commercial_snapshot_id: Optional[int] = None
        pricing_mode = "LEGACY"
        if settings.CANONICAL_PRICING_ENFORCED:
            if not idempotency_key:
                raise HTTPException(status_code=400, detail="Idempotency-Key is required")
            scoped_idempotency_key = f"service-order:{idempotency_key}"
            payload_hash = _order_create_payload_hash(payload)
            replay = db.query(Order).filter_by(
                create_idempotency_key=scoped_idempotency_key
            ).first()
            if replay is not None:
                if replay.create_payload_hash != payload_hash:
                    raise HTTPException(status_code=409, detail="Idempotency key payload mismatch")
                return {
                    "id": replay.id,
                    "user_id": replay.user_id,
                    "service_id": replay.service_id,
                    "service_name": service.name,
                    "status": replay.status,
                    "payment_status": replay.payment_status,
                    "client_comment": replay.client_comment,
                    "created_at": replay.created_at,
                    "pricing_mode": replay.pricing_mode,
                    "commercial_price_snapshot_id": replay.commercial_price_snapshot_id,
                    "idempotent_replay": True,
                }
            try:
                commercial_snapshot = create_commercial_snapshot(
                    db,
                    entity_type="SERVICE",
                    entity_key=service.slug,
                    option_code=payload.price_option_code,
                )
            except FxUnavailable as error:
                db.rollback()
                raise HTTPException(status_code=503, detail=str(error)) from error
            except PricingError as error:
                db.rollback()
                raise HTTPException(status_code=422, detail=str(error)) from error
            commercial_snapshot_id = commercial_snapshot.id
            pricing_mode = "CANONICAL"

        order = Order(
            user_id=payload.user_id,
            service_id=payload.service_id,
            client_comment=payload.client_comment,
            status="new",
            payment_status="pending",
            pricing_mode=pricing_mode,
            commercial_price_snapshot_id=commercial_snapshot_id,
            create_idempotency_key=scoped_idempotency_key,
            create_payload_hash=payload_hash,
        )

        db.add(order)
        try:
            db.commit()
        except IntegrityError as error:
            db.rollback()
            if not scoped_idempotency_key or not payload_hash:
                raise
            replay = db.query(Order).filter_by(
                create_idempotency_key=scoped_idempotency_key
            ).first()
            if replay is None:
                raise
            if replay.create_payload_hash != payload_hash:
                raise HTTPException(status_code=409, detail="Idempotency key payload mismatch") from error
            return {
                "id": replay.id,
                "user_id": replay.user_id,
                "service_id": replay.service_id,
                "service_name": service.name,
                "status": replay.status,
                "payment_status": replay.payment_status,
                "client_comment": replay.client_comment,
                "created_at": replay.created_at,
                "pricing_mode": replay.pricing_mode,
                "commercial_price_snapshot_id": replay.commercial_price_snapshot_id,
                "idempotent_replay": True,
            }
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
            "pricing_mode": order.pricing_mode,
            "commercial_price_snapshot_id": order.commercial_price_snapshot_id,
            "idempotent_replay": False,
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
