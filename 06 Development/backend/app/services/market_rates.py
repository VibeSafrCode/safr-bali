from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

import httpx


COINBASE_USDT_RATES_URL = (
    "https://api.coinbase.com/v2/exchange-rates?currency=USDT"
)
INDODAX_USDT_IDR_URL = "https://indodax.com/api/ticker/usdtidr"


class MarketRateError(ValueError):
    """Raised when a provider returns a missing or unsafe market rate."""


@dataclass(frozen=True)
class MarketRates:
    coinbase_usdt_rub: Decimal
    indodax_buy_idr_per_usdt: Decimal
    indodax_sell_idr_per_usdt: Decimal
    indodax_last_idr_per_usdt: Optional[Decimal]
    fetched_at: datetime
    coinbase_payload: dict[str, Any]
    indodax_payload: dict[str, Any]


def _positive_decimal(provider: str, field: str, value: Any) -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise MarketRateError(f"{provider}.{field} is not a number") from error
    if not result.is_finite() or result <= 0:
        raise MarketRateError(f"{provider}.{field} must be positive")
    return result


def parse_coinbase_usdt_rub(payload: dict[str, Any]) -> Decimal:
    try:
        value = payload["data"]["rates"]["RUB"]
    except (KeyError, TypeError) as error:
        raise MarketRateError("Coinbase data.rates.RUB is missing") from error
    return _positive_decimal("Coinbase", "data.rates.RUB", value)


def parse_indodax_usdt_idr(
    payload: dict[str, Any],
) -> tuple[Decimal, Decimal, Optional[Decimal]]:
    ticker = payload.get("ticker")
    if not isinstance(ticker, dict):
        raise MarketRateError("Indodax ticker is missing")

    buy = _positive_decimal("Indodax", "ticker.buy", ticker.get("buy"))
    sell = _positive_decimal("Indodax", "ticker.sell", ticker.get("sell"))
    last_raw = ticker.get("last")
    last = (
        _positive_decimal("Indodax", "ticker.last", last_raw)
        if last_raw is not None
        else None
    )
    return buy, sell, last


async def fetch_market_rates(
    client: Optional[httpx.AsyncClient] = None,
    *,
    now: Optional[datetime] = None,
) -> MarketRates:
    """Fetch both provider payloads and preserve both Indodax book sides."""

    async def fetch(active_client: httpx.AsyncClient) -> MarketRates:
        coinbase_response, indodax_response = await asyncio.gather(
            active_client.get(COINBASE_USDT_RATES_URL),
            active_client.get(INDODAX_USDT_IDR_URL),
        )
        coinbase_response.raise_for_status()
        indodax_response.raise_for_status()
        coinbase_payload = coinbase_response.json()
        indodax_payload = indodax_response.json()
        coinbase_rate = parse_coinbase_usdt_rub(coinbase_payload)
        indodax_buy, indodax_sell, indodax_last = parse_indodax_usdt_idr(
            indodax_payload
        )
        return MarketRates(
            coinbase_usdt_rub=coinbase_rate,
            indodax_buy_idr_per_usdt=indodax_buy,
            indodax_sell_idr_per_usdt=indodax_sell,
            indodax_last_idr_per_usdt=indodax_last,
            fetched_at=now or datetime.now(timezone.utc),
            coinbase_payload=coinbase_payload,
            indodax_payload=indodax_payload,
        )

    if client is not None:
        return await fetch(client)

    async with httpx.AsyncClient(timeout=8.0) as active_client:
        return await fetch(active_client)
