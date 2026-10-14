from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.user import User
from app.models.order import Order
from app.models.service import Service
from app.core.config import settings
from app.core.security import rate_limit, require_service_token
from app.services.referral_attribution import attribute_referral_once
from app.schemas.locale import LocaleCode, LocaleUpdateRequest
from app.services.locales import locale_from_language

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(rate_limit), Depends(require_service_token)])


class UserRegisterRequest(BaseModel):
    registration_event: Optional[str] = Field(default=None, max_length=120)
    registration_occurred_at: Optional[datetime] = None
    verified_new_bot_registration: bool = False
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    language: Optional[str] = "ru"
    locale: Optional[LocaleCode] = None
    invited_by_ref_code: Optional[str] = None
    invited_by_telegram_id: Optional[int] = None
    referral_code: Optional[str] = None


def make_ref_code(telegram_id: int) -> str:
    return f"TG{telegram_id}"


@dataclass(frozen=True)
class ReferralResolution:
    inviter: Optional[User]
    source: str
    reason: str


def referral_inviter(
    db,
    payload: UserRegisterRequest,
    *,
    default_inviter_telegram_id: int | None = None,
) -> ReferralResolution:
    explicit_requested = bool(
        payload.invited_by_telegram_id or payload.invited_by_ref_code
    )
    by_telegram = None
    by_code = None
    if payload.invited_by_telegram_id:
        by_telegram = (
            db.query(User)
            .filter(User.telegram_id == payload.invited_by_telegram_id)
            .first()
        )
    if payload.invited_by_ref_code:
        by_code = (
            db.query(User)
            .filter(User.ref_code == payload.invited_by_ref_code)
            .first()
        )
    explicit = by_telegram or by_code
    if by_telegram and by_code and by_telegram.id != by_code.id:
        explicit = None
        explicit_reason = "conflicting_explicit_referrers"
    elif explicit and explicit.telegram_id == payload.telegram_id:
        explicit = None
        explicit_reason = "self_referral_rejected"
    elif explicit and default_inviter_telegram_id is not None and explicit.status != "active":
        explicit = None
        explicit_reason = "inactive_referrer"
    elif explicit:
        return ReferralResolution(explicit, "explicit_referral", "valid_explicit")
    else:
        explicit_reason = "invalid_referral" if explicit_requested else "no_referrer"

    default_id = settings.DEFAULT_ADMIN_TELEGRAM_ID if default_inviter_telegram_id is None else default_inviter_telegram_id
    if default_id > 0:
        default_admin = (
            db.query(User)
            .filter(User.telegram_id == default_id)
            .first()
        )
        if default_admin and default_admin.telegram_id != payload.telegram_id:
            return ReferralResolution(
                default_admin,
                "default_main_admin" if default_inviter_telegram_id is None else "explicit_referral",
                explicit_reason if default_inviter_telegram_id is None else "brand_partner_entry",
            )
    return ReferralResolution(None, "default_main_admin", "main_admin_unavailable")


@router.post("/register")
def register_user(payload: UserRegisterRequest):
    return register_user_for_channel(payload, channel="safrway")


def register_user_for_channel(payload: UserRegisterRequest, *, channel: str,
                              default_inviter_telegram_id: int | None = None):
    for attempt in range(2):
        try:
            return _register_user_for_channel_once(payload, channel=channel,
                default_inviter_telegram_id=default_inviter_telegram_id)
        except IntegrityError as error:
            # A bot and its Mini App can concurrently register the same new
            # identity. Retry only after the winning canonical User is visible;
            # never replay unrelated failures or change Main registration.
            origin = error.orig
            code = getattr(origin, "sqlstate", None) or getattr(origin, "pgcode", None)
            constraint = getattr(getattr(origin, "diag", None), "constraint_name", None)
            import sqlite3
            own_collision = ((code == "23505" and constraint in {"ix_users_telegram_id", "users_telegram_id_key"})
                or isinstance(origin, sqlite3.IntegrityError) and str(origin) == "UNIQUE constraint failed: users.telegram_id")
            if channel != "yoga" or attempt or not own_collision:
                raise
            with SessionLocal() as check:
                if check.query(User.id).filter(User.telegram_id == payload.telegram_id).first() is None:
                    raise


def _register_user_for_channel_once(payload: UserRegisterRequest, *, channel: str,
                                   default_inviter_telegram_id: int | None = None):
    # Trusted internal adapter arguments, never public FastAPI query fields.
    if channel not in {"safrway", "yoga"}:
        raise ValueError("Unsupported registration channel")
    db = SessionLocal()

    try:
        if channel == "yoga":
            if type(default_inviter_telegram_id) is not int or default_inviter_telegram_id <= 0:
                raise HTTPException(status_code=503, detail="Yoga partner unavailable")
            partner = db.query(User).filter(User.telegram_id == default_inviter_telegram_id).first()
            if partner is None or partner.status != "active":
                raise HTTPException(status_code=503, detail="Yoga partner unavailable")
        user = (
            db.query(User)
            .filter(User.telegram_id == payload.telegram_id)
            .with_for_update()
            .first()
        )
        if channel == "yoga" and user is not None and user.status != "active":
            raise HTTPException(status_code=404, detail="Account unavailable")
        resolution = referral_inviter(db, payload, default_inviter_telegram_id=default_inviter_telegram_id)

        if user:
            user.username = payload.username
            user.first_name = payload.first_name
            user.last_name = payload.last_name
            user.language = payload.language
            if channel == "safrway":
                user.bot_status = "active"
            user.last_activity_at = datetime.now(timezone.utc)
            # Registration is a fallback signal, never a preference update.
            # Existing users change locale only through an authenticated
            # locale endpoint, so Telegram language cannot overwrite a save.
            if not user.locale:
                user.locale = payload.locale or locale_from_language(payload.language)
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

            attribution = None
            if resolution.inviter and resolution.inviter.id != user.id:
                attribution = attribute_referral_once(
                    db,
                    user_id=user.id,
                    inviter_id=resolution.inviter.id,
                    source=resolution.source,
                    attribution_reason=resolution.reason,
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
                "locale": user.locale,
                "role": user.role,
                "ref_code": user.ref_code,
                "invited_by_user_id": user.invited_by_user_id,
                "status": user.status,
                "is_new": False,
                "referral_status": (
                    attribution.reason if attribution else "inviter_unavailable"
                ),
            }

        user = User(
            telegram_id=payload.telegram_id,
            username=payload.username,
            first_name=payload.first_name,
            last_name=payload.last_name,
            language=payload.language,
            locale=payload.locale or locale_from_language(payload.language),
            role="client",
            ref_code=payload.referral_code or make_ref_code(payload.telegram_id),
            invited_by_user_id=None,
            status="active",
            bot_status="active" if channel == "safrway" else "unknown",
            last_activity_at=datetime.now(timezone.utc),
        )

        db.add(user)
        db.flush()

        if payload.verified_new_bot_registration:
            from app.services.onboarding import enroll
            enroll(db, user, event=payload.registration_event,
                occurred_at=payload.registration_occurred_at, verified_new=True)

        attribution = None
        if resolution.inviter and resolution.inviter.telegram_id != payload.telegram_id:
            attribution = attribute_referral_once(
                db,
                user_id=user.id,
                inviter_id=resolution.inviter.id,
                source=resolution.source,
                attribution_reason=resolution.reason,
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
            "locale": user.locale,
            "role": user.role,
            "ref_code": user.ref_code,
            "invited_by_user_id": user.invited_by_user_id,
            "status": user.status,
            "is_new": True,
            "referral_status": (
                attribution.reason if attribution else "inviter_unavailable"
            ),
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
            "locale": user.locale,
            "role": user.role,
            "ref_code": user.ref_code,
            "invited_by_user_id": user.invited_by_user_id,
            "status": user.status,
            "created_at": user.created_at,
        }

    finally:
        db.close()


@router.get("/by-telegram/{telegram_id}/locale")
def get_user_locale(telegram_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_id == telegram_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {"telegram_id": user.telegram_id, "locale": user.locale}
    finally:
        db.close()


@router.put("/by-telegram/{telegram_id}/locale")
def update_user_locale(telegram_id: int, payload: LocaleUpdateRequest):
    db = SessionLocal()
    try:
        user = (
            db.query(User)
            .filter(User.telegram_id == telegram_id)
            .with_for_update()
            .first()
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        changed = user.locale != payload.locale
        if changed:
            user.locale = payload.locale
            db.commit()
        else:
            db.rollback()
        return {
            "telegram_id": user.telegram_id,
            "locale": payload.locale,
            "changed": changed,
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
