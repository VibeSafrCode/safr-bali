from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal, Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_

from app.api.web_portal import session_user
from app.core.config import settings
from app.core.security import rate_limit
from app.db.session import SessionLocal
from app.models.admin_action import AdminAction
from app.models.exchange import ExchangeRouteSettingsVersion
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.reward_rule import RewardRule
from app.models.service import Service
from app.models.user import User
from app.models.web_portal import WebConversation
from app.models.visa_lifecycle import VisaCase, VisaType
from app.services.admin_orders import AdminOrderConflict, transition_order
from app.services.exchange_quotes import (
    RouteSettingsVersionConflict,
    create_route_settings_version,
    list_active_route_settings,
)


router = APIRouter(
    prefix="/api/web/admin",
    tags=["web-admin"],
    dependencies=[Depends(rate_limit)],
)


class OrderTransitionRequest(BaseModel):
    target: Literal["paid", "completed", "cancelled"]
    comment: str = Field(min_length=1, max_length=2000)


class NewUserReviewRequest(BaseModel):
    reviewed: bool
    comment: str = Field(min_length=3, max_length=1000)


class ConversationStatusRequest(BaseModel):
    status: Literal["open", "closed"]
    expected_updated_at: datetime
    comment: str = Field(min_length=3, max_length=1000)


class ExchangeSettingsChangeRequest(BaseModel):
    expected_active_version: int = Field(ge=1)
    settings: Dict[str, Any] = Field(min_length=1)
    comment: str = Field(min_length=3, max_length=1000)


class ExchangeSettingsRestoreRequest(BaseModel):
    expected_active_version: int = Field(ge=1)
    restore_version: int = Field(ge=1)
    comment: str = Field(min_length=3, max_length=1000)


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


def user_label(user: User | None) -> str:
    if user is None:
        return "Client"
    full_name = " ".join(part for part in (user.first_name, user.last_name) if part).strip()
    return full_name or (f"@{user.username}" if user.username else f"SAFRWAY {user.id}")


def user_labels(db, user_ids) -> dict[int, str]:
    unique_ids = {int(item) for item in user_ids if item is not None}
    if not unique_ids:
        return {}
    return {row.id: user_label(row) for row in db.query(User).filter(User.id.in_(unique_ids)).all()}


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
            "locale": user.locale if user.locale in {"ru", "en"} else "ru",
        },
        "csrf_token": admin_csrf_token(session_token),
    }


@router.get("/dashboard")
def dashboard(user: User = Depends(require_web_admin)):
    db = SessionLocal()
    try:
        visa_metrics = {
            "active_visa_cases": 0,
            "visa_cases_attention": 0,
        }
        if settings.VISA_LIFECYCLE_ENABLED and settings.ADMIN_CLIENT_CRM_ENABLED:
            visa_metrics = {
                "active_visa_cases": db.query(VisaCase).filter(
                    VisaCase.publication_status == "PUBLISHED",
                    VisaCase.lifecycle_status.notin_(["EXPIRED", "CANCELLED", "REFUSED"]),
                ).count(),
                "visa_cases_attention": db.query(VisaCase).filter(
                    VisaCase.requires_attention.is_(True),
                ).count(),
            }
        return {
            "new_users_7d": db.query(User).filter(
                User.created_at >= datetime.utcnow() - timedelta(days=7),
                User.admin_new_user_reviewed_at.is_(None),
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
            **visa_metrics,
        }
    finally:
        db.close()


DashboardMetric = Literal[
    "new_users_7d", "active_visa_cases", "open_conversations",
    "orders_attention", "referral_missing_rows", "visa_cases_attention", "reviewed_users",
]


@router.get("/dashboard/{metric}")
def dashboard_drilldown(metric: DashboardMetric, page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100), user: User = Depends(require_web_admin)):
    db = SessionLocal()
    try:
        if metric == "new_users_7d":
            query = db.query(User).filter(User.created_at >= datetime.utcnow() - timedelta(days=7), User.admin_new_user_reviewed_at.is_(None)).order_by(User.created_at.desc())
            total, rows = paginate(query, page, page_size)
            items = [{"id": row.id, "client_name": user_label(row), "created_at": utc_iso(row.created_at), "status": row.status, "last_activity_at": utc_iso(row.last_activity_at) if row.last_activity_at else None} for row in rows]
        elif metric == "reviewed_users":
            query = db.query(User).filter(User.admin_new_user_reviewed_at.is_not(None)).order_by(User.admin_new_user_reviewed_at.desc())
            total, rows = paginate(query, page, page_size)
            items = [{"id": row.id, "client_name": user_label(row), "created_at": utc_iso(row.created_at), "reviewed_at": utc_iso(row.admin_new_user_reviewed_at), "status": row.status} for row in rows]
        elif metric == "active_visa_cases":
            query = db.query(VisaCase).filter(VisaCase.publication_status == "PUBLISHED", VisaCase.lifecycle_status.notin_(["EXPIRED", "CANCELLED", "REFUSED"])).order_by(VisaCase.updated_at.desc())
            total, rows = paginate(query, page, page_size)
            labels = user_labels(db, (row.user_id for row in rows))
            items = [{"id": row.id, "user_id": row.user_id, "client_name": labels.get(row.user_id), "service_status": row.service_status, "lifecycle_status": row.lifecycle_status, "requires_attention": row.requires_attention, "updated_at": utc_iso(row.updated_at)} for row in rows]
        elif metric == "open_conversations":
            query = db.query(WebConversation).filter(WebConversation.status == "open").order_by(WebConversation.updated_at.desc())
            total, rows = paginate(query, page, page_size)
            labels = user_labels(db, (row.user_id for row in rows))
            items = [{"id": row.id, "user_id": row.user_id, "client_name": labels.get(row.user_id), "status": row.status, "updated_at": utc_iso(row.updated_at)} for row in rows]
        elif metric == "orders_attention":
            query = db.query(Order).filter(Order.status.in_(["new", "in_progress", "paid"])).order_by(Order.updated_at.desc())
            total, rows = paginate(query, page, page_size)
            labels = user_labels(db, (row.user_id for row in rows))
            items = [{"id": row.id, "user_id": row.user_id, "client_name": labels.get(row.user_id), "status": row.status, "payment_status": row.payment_status, "updated_at": utc_iso(row.updated_at)} for row in rows]
        elif metric == "referral_missing_rows":
            query = db.query(User).filter(User.invited_by_user_id.is_not(None), ~db.query(Referral.id).filter(Referral.child_user_id == User.id).exists()).order_by(User.created_at.desc())
            total, rows = paginate(query, page, page_size)
            items = [{"id": row.id, "client_name": user_label(row), "created_at": utc_iso(row.created_at), "status": "missing_referral_row"} for row in rows]
        else:
            query = db.query(VisaCase).filter(VisaCase.requires_attention.is_(True)).order_by(VisaCase.updated_at.desc())
            total, rows = paginate(query, page, page_size)
            labels = user_labels(db, (row.user_id for row in rows))
            items = [{"id": row.id, "user_id": row.user_id, "client_name": labels.get(row.user_id), "service_status": row.service_status, "lifecycle_status": row.lifecycle_status, "requires_attention": True, "updated_at": utc_iso(row.updated_at)} for row in rows]
        return {"metric": metric, "items": items, "total": total, "page": page, "page_size": page_size}
    finally:
        db.close()


@router.post("/users/{user_id}/new-review")
def review_new_user(user_id: int, payload: NewUserReviewRequest, admin: User = Depends(require_admin_write)):
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.id == user_id).with_for_update().first()
        if not row: raise HTTPException(status_code=404, detail="User not found")
        current = row.admin_new_user_reviewed_at is not None
        if current == payload.reviewed: return {"reviewed": current, "idempotent_replay": True}
        row.admin_new_user_reviewed_at = datetime.now(timezone.utc) if payload.reviewed else None
        row.admin_new_user_reviewed_by = admin.id if payload.reviewed else None
        db.add(AdminAction(admin_user_id=admin.id, action_type="NEW_USER_REVIEWED" if payload.reviewed else "NEW_USER_REOPENED", entity_type="user", entity_id=row.id, details={"comment": payload.comment}))
        db.commit(); return {"reviewed": payload.reviewed, "idempotent_replay": False}
    finally:
        db.close()


@router.patch("/conversations/{conversation_id}/status")
def change_conversation_status(
    conversation_id: int,
    payload: ConversationStatusRequest,
    idempotency_key: str = Header(min_length=8, max_length=255, alias="Idempotency-Key"),
    admin: User = Depends(require_admin_write),
):
    db = SessionLocal()
    try:
        replay = db.query(AdminAction).filter(
            AdminAction.admin_user_id == admin.id,
            AdminAction.idempotency_key == idempotency_key,
            AdminAction.entity_type == "web_conversation",
            AdminAction.entity_id == conversation_id,
        ).first()
        if replay:
            after = (replay.details or {}).get("after") or {}
            return {
                "id": conversation_id,
                "status": after.get("status", payload.status),
                "idempotent_replay": True,
            }

        row = db.query(WebConversation).filter(
            WebConversation.id == conversation_id,
        ).with_for_update().first()
        if not row:
            raise HTTPException(status_code=404, detail="Conversation not found")

        current = row.updated_at if row.updated_at.tzinfo else row.updated_at.replace(tzinfo=timezone.utc)
        expected = payload.expected_updated_at
        expected = expected if expected.tzinfo else expected.replace(tzinfo=timezone.utc)
        if current.astimezone(timezone.utc) != expected.astimezone(timezone.utc):
            raise HTTPException(status_code=409, detail="Conversation changed; reload before retry")
        if row.status == payload.status:
            return {"id": row.id, "status": row.status, "idempotent_replay": True}

        before = row.status
        row.status = payload.status
        row.updated_at = datetime.now(timezone.utc)
        db.add(AdminAction(
            admin_user_id=admin.id,
            action_type="CONVERSATION_CLOSED" if payload.status == "closed" else "CONVERSATION_REOPENED",
            entity_type="web_conversation",
            entity_id=row.id,
            comment=payload.comment,
            idempotency_key=idempotency_key,
            details={
                "user_id": row.user_id,
                "before": {"status": before},
                "after": {"status": payload.status},
            },
        ))
        db.commit()
        return {"id": row.id, "status": row.status, "idempotent_replay": False}
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
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
        labels = user_labels(db, [item.parent_user_id for item in rows] + [item.child_user_id for item in rows])
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
                    "inviter_name": labels.get(row.parent_user_id),
                    "client_name": labels.get(row.child_user_id),
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
        labels = user_labels(db, (order.user_id for order, _ in rows))
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": [
                {
                    "id": order.id,
                    "user_id": order.user_id,
                    "client_name": labels.get(order.user_id),
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
        labels = user_labels(db, (item.user_id for item in sliced))
        return {
            "page": page,
            "page_size": page_size,
            "total": len(rows),
            "items": [
                {
                    "id": row.id,
                    "user_id": row.user_id,
                    "client_name": labels.get(row.user_id) or row.guest_name or "Guest",
                    "request_kind": {"visa": "Visa", "housing": "Housing", "support": "Support"}[queue],
                    "request_title": next((str((row.route_context or {}).get(key)) for key in ("service_title", "title", "service", "section") if (row.route_context or {}).get(key)), "Manager request"),
                    "request_path": (row.route_context or {}).get("path"),
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
        labels = user_labels(db, (row.user_id for row in rows))
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": [
                {
                    "id": row.id,
                    "user_id": row.user_id,
                    "client_name": labels.get(row.user_id),
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
        visa_types = db.query(VisaType).filter(VisaType.active.is_(True)).order_by(VisaType.country_code, VisaType.code, VisaType.version.desc()).all()
        services = db.query(Service).order_by(Service.category, Service.name).all()
        return {
            "exchange_routes": list_active_route_settings(db),
            "visa_types": [{"code": item.code, "name": item.name, "version": item.version, "active": item.active, "rules_verified": item.rules_verified, "effective_from": item.effective_from} for item in visa_types],
            "services": [{"name": item.name, "slug": item.slug, "category": item.category, "is_active": item.is_active, "can_pay_with_points": item.can_pay_with_points} for item in services],
            "notifications": [
                {"event": "CASE_PUBLISHED", "audience": "client", "delivery": "Telegram", "enabled": None, "configuration_scope": "per_case", "editable": False},
                {"event": "CASE_UPDATED", "audience": "client", "delivery": "Telegram", "enabled": None, "configuration_scope": "per_case", "editable": False},
            ],
        }
    finally:
        db.close()


def _exchange_version_payload(item: ExchangeRouteSettingsVersion) -> dict[str, Any]:
    return {
        "id": item.id,
        "route_code": item.route_code,
        "version": item.version,
        "is_active": item.is_active,
        "settings": item.settings,
        "effective_from": item.effective_from,
        "created_at": item.created_at,
    }


@router.get("/settings/exchange/{route_code}/versions")
def exchange_settings_history(
    route_code: str,
    user: User = Depends(require_web_admin),
):
    db = SessionLocal()
    try:
        rows = (
            db.query(ExchangeRouteSettingsVersion)
            .filter(ExchangeRouteSettingsVersion.route_code == route_code)
            .order_by(ExchangeRouteSettingsVersion.version.desc())
            .all()
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Exchange route not found")
        return {"route_code": route_code, "versions": [_exchange_version_payload(row) for row in rows]}
    finally:
        db.close()


def _write_exchange_version(
    *,
    route_code: str,
    settings_payload: Dict[str, Any],
    expected_active_version: int,
    comment: str,
    action_type: str,
    actor: User,
) -> dict[str, Any]:
    db = SessionLocal()
    try:
        version = create_route_settings_version(
            db,
            route_code=route_code,
            settings_payload=settings_payload,
            created_by=actor.id,
            expected_active_version=expected_active_version,
            commit=False,
        )
        db.add(AdminAction(
            admin_user_id=actor.id,
            action_type=action_type,
            entity_type="exchange_route_settings",
            entity_id=version.id,
            comment=comment,
            details={
                "route_code": route_code,
                "previous_version": expected_active_version,
                "new_version": version.version,
                "changed_fields": sorted(settings_payload),
            },
        ))
        db.commit()
        db.refresh(version)
        return _exchange_version_payload(version)
    except RouteSettingsVersionConflict as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    finally:
        db.close()


@router.post("/settings/exchange/{route_code}/versions", status_code=201)
def change_exchange_settings(
    route_code: str,
    payload: ExchangeSettingsChangeRequest,
    actor: User = Depends(require_admin_write),
):
    return _write_exchange_version(
        route_code=route_code,
        settings_payload=payload.settings,
        expected_active_version=payload.expected_active_version,
        comment=payload.comment,
        action_type="EXCHANGE_SETTINGS_VERSION_CREATED",
        actor=actor,
    )


@router.post("/settings/exchange/{route_code}/restore", status_code=201)
def restore_exchange_settings(
    route_code: str,
    payload: ExchangeSettingsRestoreRequest,
    actor: User = Depends(require_admin_write),
):
    db = SessionLocal()
    try:
        source = (
            db.query(ExchangeRouteSettingsVersion)
            .filter(
                ExchangeRouteSettingsVersion.route_code == route_code,
                ExchangeRouteSettingsVersion.version == payload.restore_version,
            )
            .one_or_none()
        )
        if source is None:
            raise HTTPException(status_code=404, detail="Exchange settings version not found")
        source_settings = dict(source.settings)
    finally:
        db.close()
    return _write_exchange_version(
        route_code=route_code,
        settings_payload=source_settings,
        expected_active_version=payload.expected_active_version,
        comment=payload.comment,
        action_type="EXCHANGE_SETTINGS_VERSION_RESTORED",
        actor=actor,
    )


@router.get("/audit")
def audit(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    action_type: Optional[str] = Query(default=None, min_length=1, max_length=100),
    entity_type: Optional[str] = Query(default=None, min_length=1, max_length=100),
    actor_id: Optional[int] = Query(default=None, ge=1),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    user: User = Depends(require_web_admin),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must not be after date_to")
    db = SessionLocal()
    try:
        query = db.query(AdminAction)
        if action_type:
            query = query.filter(AdminAction.action_type == action_type)
        if entity_type:
            query = query.filter(AdminAction.entity_type == entity_type)
        if actor_id:
            query = query.filter(AdminAction.admin_user_id == actor_id)
        if date_from:
            query = query.filter(AdminAction.created_at >= date_from.replace(tzinfo=None))
        if date_to:
            query = query.filter(AdminAction.created_at <= date_to.replace(tzinfo=None))
        query = query.order_by(AdminAction.created_at.desc(), AdminAction.id.desc())
        total, rows = paginate(query, page, page_size)
        labels = user_labels(db, (row.admin_user_id for row in rows))
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": [
                {
                    "id": row.id,
                    "admin_user_id": row.admin_user_id,
                    "actor_name": labels.get(row.admin_user_id),
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
