from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

import httpx

from app.services.json_storage import load_json, save_json


logger = logging.getLogger(__name__)

INDODAX_TICKER_URL = "https://indodax.com/api/ticker/usdtidr"
VISA_CACHE_TTL_SECONDS = 3 * 24 * 60 * 60
CALCULATOR_CACHE_TTL_SECONDS = 24 * 60 * 60
CACHE_PATH = Path(__file__).resolve().parents[1] / "data" / "exchange_rates.json"
_refresh_lock = asyncio.Lock()


def _positive_decimal(value) -> Decimal | None:
    try:
        parsed = Decimal(str(value))
        if not parsed.is_finite() or parsed <= 0:
            return None
    except (InvalidOperation, TypeError, ValueError):
        return None
    return parsed


def _cached_rate(
    data: dict,
    now: datetime,
    max_age_seconds: int,
) -> tuple[Decimal | None, bool]:
    rate = _positive_decimal(data.get("usdt_idr")) if isinstance(data, dict) else None
    updated_at = data.get("updated_at") if isinstance(data, dict) else None

    if not rate or not isinstance(updated_at, str):
        return rate, False

    try:
        updated = datetime.fromisoformat(updated_at)
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
    except ValueError:
        return rate, False

    age_seconds = (now - updated.astimezone(timezone.utc)).total_seconds()
    return rate, age_seconds < max_age_seconds


async def _fetch_indodax_rate() -> Decimal:
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.get(INDODAX_TICKER_URL)
        response.raise_for_status()
        payload = response.json()

    rate = _positive_decimal(payload.get("ticker", {}).get("last"))
    if not rate:
        raise ValueError("Indodax returned an invalid USDT/IDR rate")
    return rate


async def get_usdt_idr_rate(
    now: datetime | None = None,
    max_age_seconds: int = VISA_CACHE_TTL_SECONDS,
) -> Decimal | None:
    """Return USDT/IDR using a caller-selected persisted cache lifetime."""
    current_time = now or datetime.now(timezone.utc)
    cached_data = load_json(CACHE_PATH, {})
    cached_rate, is_fresh = _cached_rate(
        cached_data,
        current_time,
        max_age_seconds,
    )
    if is_fresh:
        return cached_rate

    async with _refresh_lock:
        cached_data = load_json(CACHE_PATH, {})
        cached_rate, is_fresh = _cached_rate(
            cached_data,
            current_time,
            max_age_seconds,
        )
        if is_fresh:
            return cached_rate

        try:
            rate = await _fetch_indodax_rate()
        except Exception:
            logger.exception("Could not refresh USDT/IDR rate from Indodax")
            return cached_rate

        save_json(
            CACHE_PATH,
            {
                "pair": "USDT/IDR",
                "usdt_idr": str(rate),
                "updated_at": current_time.isoformat(),
                "source": "indodax_last",
            },
        )
        return rate
