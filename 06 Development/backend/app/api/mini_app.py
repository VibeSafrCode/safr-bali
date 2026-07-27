from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.config import settings
from app.core.security import rate_limit
from app.db.session import SessionLocal
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.service import Service
from app.models.user import User


router = APIRouter(
    prefix="/mini-app",
    tags=["mini-app"],
    dependencies=[Depends(rate_limit)],
)


def validate_telegram_init_data(
    init_data: str,
    bot_token: str,
    *,
    max_age_seconds: int = 86400,
    now: int | None = None,
) -> dict:
    if not init_data or not bot_token:
        raise ValueError("Telegram authentication is not configured")

    values = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = values.pop("hash", "")
    if not received_hash:
        raise ValueError("Telegram hash is missing")

    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(values.items())
    )
    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(calculated_hash, received_hash):
        raise ValueError("Telegram signature is invalid")

    auth_date = int(values.get("auth_date", "0"))
    current_time = int(time.time()) if now is None else now
    if auth_date <= 0 or current_time - auth_date > max_age_seconds:
        raise ValueError("Telegram authentication has expired")
    if auth_date > current_time + 60:
        raise ValueError("Telegram authentication date is invalid")

    try:
        user = json.loads(values["user"])
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Telegram user is missing") from exc
    if not isinstance(user, dict) or not isinstance(user.get("id"), int):
        raise ValueError("Telegram user is invalid")

    return user


def require_telegram_user(
    authorization: str = Header(default="", alias="Authorization"),
) -> dict:
    scheme, _, init_data = authorization.partition(" ")
    if scheme.lower() != "tma" or not init_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telegram authentication required",
        )
    try:
        return validate_telegram_init_data(
            init_data,
            settings.TELEGRAM_BOT_TOKEN,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc


@router.get("/me")
def get_mini_app_dashboard(telegram_user: dict = Depends(require_telegram_user)):
    telegram_id = telegram_user["id"]
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_id == telegram_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Open the SAFR bot before using the Mini App",
            )

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
        referral_code = (
            user.ref_code
            if user.ref_code and not user.ref_code.startswith("TG")
            else None
        )
        referral_link = (
            f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={referral_code}"
            if referral_code
            else None
        )

        return {
            "telegram_id": telegram_id,
            "first_name": user.first_name,
            "username": user.username,
            "balance": last_operation.balance_after if last_operation else 0,
            "referral_count": referral_count,
            "referral_link": referral_link,
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
