from __future__ import annotations

import logging
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import httpx

from app.core.config import settings


logger = logging.getLogger(__name__)

VISA_CACHE_TTL_SECONDS = 3 * 24 * 60 * 60
CALCULATOR_CACHE_TTL_SECONDS = 24 * 60 * 60


def _aware_utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _validated_projection(payload: object, *, now: datetime) -> dict | None:
    if not isinstance(payload, dict):
        return None
    required = {
        "projection_id", "catalog_version_id", "fx_snapshot_id",
        "formula_version", "derived_expires_at", "items",
    }
    if not required.issubset(payload) or not isinstance(payload.get("items"), list):
        return None
    try:
        expires_at = datetime.fromisoformat(str(payload["derived_expires_at"]).replace("Z", "+00:00"))
    except ValueError:
        return None
    safe = deepcopy(payload)
    if _aware_utc(now) > _aware_utc(expires_at):
        if isinstance(safe.get("fx"), dict):
            safe["fx"]["status"] = "unavailable"
            safe["fx"]["ask_idr_per_usdt"] = None
        for item in safe["items"]:
            if isinstance(item, dict):
                item["display_usdt"] = None
    return safe


async def get_pricing_projection(now: datetime | None = None) -> dict | None:
    """Fetch one whole backend projection without provider or persisted fallback."""
    if not settings.BACKEND_API_URL.strip():
        return None
    current_time = now or datetime.now(timezone.utc)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{settings.BACKEND_API_URL.rstrip('/')}/api/catalog/pricing",
                headers={"Cache-Control": "no-cache"},
            )
            response.raise_for_status()
        return _validated_projection(response.json(), now=current_time)
    except Exception:
        logger.exception("Could not load the canonical pricing projection")
        return None


def _positive_decimal(value) -> Decimal | None:
    try:
        parsed = Decimal(str(value))
        if not parsed.is_finite() or parsed <= 0:
            return None
    except (InvalidOperation, TypeError, ValueError):
        return None
    return parsed


def canonical_price_label(
    projection: dict | None,
    *,
    entity_type: str,
    entity_key: str,
    locale: str,
) -> str:
    """Render a compact label from the canonical projection only."""
    items = projection.get("items") if isinstance(projection, dict) else None
    matches = [
        item for item in (items or [])
        if isinstance(item, dict)
        and item.get("entity_type") == entity_type
        and item.get("entity_key") == entity_key
    ]
    visible = [
        item for item in matches
        if item.get("show_price") is True and item.get("amount_idr") is not None
    ]
    if not visible:
        if any(item.get("price_qualifier") == "CONTACT" for item in matches):
            return "Price on request." if locale == "en" else "Цена по запросу."
        return (
            "The current price is temporarily unavailable. Ask the manager before payment."
            if locale == "en"
            else "Актуальная цена временно недоступна. Уточните её у менеджера до оплаты."
        )

    lowest = min(visible, key=lambda item: int(item["amount_idr"]))
    amount = f"{int(lowest['amount_idr']):,}".replace(",", ".")
    prefix = (
        "from " if locale == "en" else "от "
    ) if len(visible) > 1 or lowest.get("price_qualifier") == "FROM" else ""
    derived = lowest.get("display_usdt")
    suffix = f" · ≈ {derived} USDT" if derived is not None else ""
    return f"{prefix}{amount} IDR{suffix}"


async def get_usdt_idr_rate(
    now: datetime | None = None,
    max_age_seconds: int = VISA_CACHE_TTL_SECONDS,
) -> Decimal | None:
    """Compatibility adapter backed only by the canonical projection."""
    projection = await get_pricing_projection(now=now)
    if not projection or not isinstance(projection.get("fx"), dict):
        return None
    return _positive_decimal(projection["fx"].get("ask_idr_per_usdt"))
