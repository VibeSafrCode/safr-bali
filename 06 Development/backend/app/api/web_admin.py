from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_

from app.api.web_portal import session_user
from app.core.config import settings
from app.core.security import rate_limit
from app.db.session import SessionLocal
from app.models.admin_action import AdminAction
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.reward_rule import RewardRule
from app.models.service import Service
from app.models.user import User
from app.models.web_portal import WebConversation
from app.services.admin_orders import AdminOrderConflict, transition_order
from app.services.exchange_quotes import list_active_route_settings


router = APIRouter(
    prefix="/api/web/admin",
    tags=["web-admin"],
    dependencies=[Depends(rate_limit)],
)


class OrderTransitionRequest(BaseModel):
    target: Literal["paid", "completed", "cancelled"]
    comment: str = Field(min_length=1, max_length=2000)


def require_web_admin(user: User = Depends(session_user)) -> User:
    if (
        user.role != "admin"
        or user.status != "active"
        or user.telegram_id != settings.DEFAULT_ADMIN_TELEGRAM_ID
    ):
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


def admin_csrf_token(session_token: str) -> str:
    return hashlib.sha256(f"safr-admin-csrf:{session_token}".encode()).hexdigest()


def expected_application_origin() -> str:
    parsed = urlsplit(settings.APPLICATION_URL.rstrip("/"))
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=503, detail="Application origin unavailable")
    return f"{parsed.scheme}://{parsed.netloc}"


def require_admin_write(
    request: Request,
    user: User = Depends(require_web_admin),
    session_token: Optional[str] = Cookie(
        default=None,
        alias=settings.WEB_SESSION_COOKIE_NAME,
    ),
    csrf_token: str = Header(default="", alias="X-CSRF-Token"),
) -> User:
    if request.headers.get("origin", "").rstrip("/") != expected_application_origin():
        raise HTTPException(status_code=403, detail="Origin denied")
    if not session_token or not secrets.compare_digest(
        csrf_token,
        admin_csrf_token(session_token),
    ):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    return user


def paginate(query, page: int, page_size: int):
    total = query.order_by(None).count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return total, rows


def utc_iso(value: datetime) -> str:
    aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@router.get("/session")
def admin_session(
    user: User = Depends(require_web_admin),
    session_token: str = Cookie(alias=settings.WEB_SESSION_COOKIE_NAME),
):
    return {
        "authenticated": True,
        "actor": {
            "id": user.id,
            "telegram_id": user.telegram_id,
            "first_name": user.first_name,
            "username": user.username,
            "role": user.role,
        },
        "csrf_token": admin_csrf_token(session_token),
    }


@router.get("/dashboard")
def dashboard(user: User = Depends(require_web_admin)):
    db = SessionLocal()
    try:
        return {
            "new_users_7d": db.query(User).filter(
                User.created_at >= datetime.utcnow() - timedelta(days=7)
            ).count(),
            "orders_attention": db.query(Order).filter(
                Order.status.in_(["new", "in_progress", "paid"])
            ).count(),
            "open_conversations": db.query(WebConversation).filter(
                WebConversation.status == "open"
            ).count(),
            "referral_missing_rows": db.query(User).filter(
                User.invited_by_user_id.is_not(None),
                ~db.query(Referral.id)
                .filter(Referral.child_user_id == User.id)
                .exists(),
            ).count(),
        }
    finally:
        db.close()


@router.get("/users")
def users(
    q: Optional[str] = Query(default=None, max_length=120),
    status_filter: Optional[str] = Query(default=None, alias="status", max_length=50),
    joined_from: Optional[datetime] = None,
    joined_to: Optional[datetime] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    user: User = Depends(require_web_admin),
):
    db = SessionLocal()
    try:
        query = db.query(User)
        if q:
            terms = [User.username.ilike(f"%{q}%")]
            if q.isdigit():
                terms.extend([User.id == int(q), User.telegram_id == int(q)])
            query = query.filter(or_(*terms))
        if status_filter:
            query = query.filter(User.status == status_filter)
        if joined_from:
            query = query.filter(User.created_at >= joined_from)
        if joined_to:
            query = query.filter(User.created_at < joined_to)
        total, rows = paginate(query.order_by(User.created_at.desc(), User.id.desc()), page, page_size)
        child_ids = [row.id for row in rows]
        referral_by_child = {
            item.child_user_id: item
            for item in db.query(Referral).filter(Referral.child_user_id.in_(child_ids)).all()
        } if child_ids else {}
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": [
                {
                    "id": row.id,
                    "telegram_id": row.telegram_id,
                    "username": row.username,
                    "first_name": row.first_name,
                    "last_name": row.last_name,
                    "status": row.status,
                    "role": row.role,
                    "created_at": utc_iso(row.created_at),
                    "invited_by_user_id": row.invited_by_user_id,
                    "referral_source": (
                        referral_by_child[row.id].source
                        if row.id in referral_by_child
                        else None
                    ),
                }
                for row in rows
            ],
        }
    finally:
        db.close()


@router.get("/referrals")
def referrals(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    user: User = Depends(require_web_admin),
):
    db = SessionLocal()
    try:
        query = db.query(Referral).order_by(Referral.created_at.desc(), Referral.id.desc())
        total, rows = paginate(query, page, page_size)
        missing_rows = db.query(User).filter(
            User.invited_by_user_id.is_not(None),
            ~db.query(Referral.id).filter(Referral.child_user_id == User.id).exists(),
        ).count()
        explicit = db.query(Referral).filter(
            ~Referral.source.in_(["default_main_admin", "default_main_admin_backfill"])
        ).count()
        default = db.query(Referral).filter(
            Referral.source.in_(["default_main_admin", "default_main_admin_backfill"])
        ).count()
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "metrics": {"explicit": explicit, "default": default, "missing_rows": missing_rows},
            "items": [
                {
                    "id": row.id,
                    "parent_user_id": row.parent_user_id,
                    "child_user_id": row.child_user_id,
                    "source": row.source,
                    "created_at": row.created_at,
                }
                for row in rows
            ],
        }
    finally:
        db.close()


@router.get("/orders")
def orders(
    status_filter: Optional[str] = Query(default=None, alias="status", max_length=50),
    payment_status: Optional[str] = Query(default=None, max_length=50),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    user: User = Depends(require_web_admin),
):
    db = SessionLocal()
    try:
        query = db.query(Order, Service).join(Service, Service.id == Order.service_id)
        if status_filter:
            query = query.filter(Order.status == status_filter)
        if payment_status:
            query = query.filter(Order.payment_status == payment_status)
        total = query.order_by(None).count()
        rows = query.order_by(Order.created_at.desc(), Order.id.desc()).offset(
            (page - 1) * page_size
        ).limit(page_size).all()
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": [
                {
                    "id": order.id,
                    "user_id": order.user_id,
                    "service": service.name,
                    "status": order.status,
                    "payment_status": order.payment_status,
                    "amount_usd": order.amount_usd,
                    "admin_comment": order.admin_comment,
                    "created_at": order.created_at,
                }
                for order, service in rows
            ],
        }
    finally:
        db.close()


@router.patch("/orders/{order_id}")
def mutate_order(
    order_id: int,
    payload: OrderTransitionRequest,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=1, max_length=255),
    actor: User = Depends(require_admin_write),
):
    db = SessionLocal()
    try:
        attached_actor = db.query(User).filter(User.id == actor.id).first()
        try:
            result = transition_order(
                db,
                order_id=order_id,
                target=payload.target,
                actor=attached_actor,
                comment=payload.comment,
                idempotency_key=idempotency_key,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except AdminOrderConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        db.commit()
        return {
            "id": result.order.id,
            "status": result.order.status,
            "payment_status": result.order.payment_status,
            "admin_action_id": result.action.id,
            "idempotent_replay": result.idempotent_replay,
            "reward_operation_id": result.reward_operation_id,
            "reversal_operation_id": result.reversal_operation_id,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def conversation_queue(context: dict) -> str:
    normalized = " ".join(str(value).lower() for value in context.values())
    if any(token in normalized for token in ("visa", "виз", "evoa", "itas")):
        return "visa"
    if any(token in normalized for token in ("housing", "жиль", "villa", "вилл")):
        return "housing"
    return "support"


@router.get("/queues/{queue}")
def queues(
    queue: Literal["visa", "housing", "support"],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    user: User = Depends(require_web_admin),
):
    db = SessionLocal()
    try:
        candidates = db.query(WebConversation).order_by(
            WebConversation.updated_at.desc(), WebConversation.id.desc()
        ).limit(1000).all()
        rows = [item for item in candidates if conversation_queue(item.route_context or {}) == queue]
        sliced = rows[(page - 1) * page_size:page * page_size]
        return {
            "page": page,
            "page_size": page_size,
            "total": len(rows),
            "items": [
                {
                    "id": row.id,
                    "user_id": row.user_id,
                    "guest_name": row.guest_name,
                    "route_context": row.route_context,
                    "status": row.status,
                    "updated_at": row.updated_at,
                }
                for row in sliced
            ],
        }
    finally:
        db.close()


@router.get("/points")
def points(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    user: User = Depends(require_web_admin),
):
    db = SessionLocal()
    try:
        query = db.query(PointsLedger).order_by(PointsLedger.created_at.desc(), PointsLedger.id.desc())
        total, rows = paginate(query, page, page_size)
        rules = db.query(RewardRule).order_by(RewardRule.valid_from.desc()).all()
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": [
                {
                    "id": row.id,
                    "user_id": row.user_id,
                    "operation_type": row.operation_type,
                    "amount": row.amount,
                    "balance_after": row.balance_after,
                    "order_id": row.order_id,
                    "created_at": row.created_at,
                }
                for row in rows
            ],
            "rules": [
                {
                    "id": rule.id,
                    "service_id": rule.service_id,
                    "partner_mode_id": rule.partner_mode_id,
                    "level_1_points": rule.level_1_points,
                    "level_2_points": rule.level_2_points,
                    "level_3_points": rule.level_3_points,
                    "valid_from": rule.valid_from,
                    "valid_to": rule.valid_to,
                    "is_active": rule.is_active,
                }
                for rule in rules
            ],
        }
    finally:
        db.close()


@router.get("/settings")
def admin_settings(user: User = Depends(require_web_admin)):
    db = SessionLocal()
    try:
        return {"exchange_routes": list_active_route_settings(db)}
    finally:
        db.close()


@router.get("/audit")
def audit(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    user: User = Depends(require_web_admin),
):
    db = SessionLocal()
    try:
        query = db.query(AdminAction).order_by(AdminAction.created_at.desc(), AdminAction.id.desc())
        total, rows = paginate(query, page, page_size)
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": [
                {
                    "id": row.id,
                    "admin_user_id": row.admin_user_id,
                    "action_type": row.action_type,
                    "entity_type": row.entity_type,
                    "entity_id": row.entity_id,
                    "comment": row.comment,
                    "details": row.details,
                    "created_at": row.created_at,
                }
                for row in rows
            ],
        }
    finally:
        db.close()
