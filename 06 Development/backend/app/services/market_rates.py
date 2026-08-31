from __future__ import annotations

import asyncio
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

import httpx


COINBASE_USDT_RATES_URL = (
    "https://api.coinbase.com/v2/exchange-rates?currency=USDT"
)
INDODAX_USDT_IDR_URL = "https://indodax.com/api/ticker/usdtidr"
CBR_DAILY_RATES_URL = "https://www.cbr.ru/scripts/XML_daily.asp"


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
    cbr_usd_rub: Optional[Decimal] = None
    cbr_rate_date: Optional[date] = None
    cbr_fetched_at: Optional[datetime] = None
    cbr_payload: Optional[dict[str, Any]] = None
    cbr_error_code: Optional[str] = None
    indodax_server_time: Optional[datetime] = None
    whitebird_actual_sell_usdt_rub: Optional[Decimal] = None
    whitebird_actual_fetched_at: Optional[datetime] = None
    whitebird_actual_expires_at: Optional[datetime] = None


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


def parse_indodax_server_time(payload: dict[str, Any]) -> Optional[datetime]:
    ticker = payload.get("ticker")
    if not isinstance(ticker, dict) or ticker.get("server_time") is None:
        return None
    raw = ticker["server_time"]
    try:
        timestamp = int(str(raw))
        if timestamp <= 0:
            raise ValueError
        return datetime.fromtimestamp(timestamp, tz=timezone.utc)
    except (OverflowError, TypeError, ValueError) as error:
        raise MarketRateError("Indodax ticker.server_time is invalid") from error


def parse_cbr_usd_rub_xml(
    xml_text: str,
) -> tuple[Decimal, date, dict[str, Any]]:
    """Parse the official CBR daily USD/RUB rate without using float."""

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as error:
        raise MarketRateError("CBR XML is invalid") from error
    raw_date = root.attrib.get("Date")
    if not raw_date:
        raise MarketRateError("CBR rate date is missing")
    try:
        rate_date = datetime.strptime(raw_date, "%d.%m.%Y").date()
    except ValueError as error:
        raise MarketRateError("CBR rate date is invalid") from error

    usd_node = next(
        (
            node
            for node in root.findall("Valute")
            if node.findtext("CharCode") == "USD"
        ),
        None,
    )
    if usd_node is None:
        raise MarketRateError("CBR USD rate is missing")
    nominal = _positive_decimal("CBR", "USD.Nominal", usd_node.findtext("Nominal"))
    raw_value = usd_node.findtext("Value")
    value = _positive_decimal(
        "CBR",
        "USD.Value",
        raw_value.replace(",", ".") if raw_value else raw_value,
    )
    rate = value / nominal
    return rate, rate_date, {
        "date": raw_date,
        "char_code": "USD",
        "nominal": str(nominal),
        "value": str(value),
        "rate": str(rate),
    }


async def fetch_market_rates(
    client: Optional[httpx.AsyncClient] = None,
    *,
    now: Optional[datetime] = None,
    authoritative_indodax: Optional[
        tuple[Decimal, Decimal, Optional[Decimal], dict[str, Any], Optional[datetime]]
    ] = None,
) -> MarketRates:
    """Fetch both provider payloads and preserve both Indodax book sides."""

    async def fetch(active_client: httpx.AsyncClient) -> MarketRates:
        observed_at = now or datetime.now(timezone.utc)

        async def fetch_cbr() -> tuple[
            Optional[Decimal],
            Optional[date],
            Optional[dict[str, Any]],
            Optional[str],
        ]:
            try:
                response = await active_client.get(CBR_DAILY_RATES_URL)
                response.raise_for_status()
                rate, rate_date, payload = parse_cbr_usd_rub_xml(response.text)
                return rate, rate_date, payload, None
            except (httpx.HTTPError, MarketRateError) as error:
                # CBR is required only by RUB -> crypto routes. Preserve the
                # other provider rates so unrelated routes can still quote.
                return None, None, None, type(error).__name__

        if authoritative_indodax is None:
            coinbase_response, indodax_response, cbr_result = await asyncio.gather(
                active_client.get(COINBASE_USDT_RATES_URL),
                active_client.get(INDODAX_USDT_IDR_URL),
                fetch_cbr(),
            )
        else:
            coinbase_response, cbr_result = await asyncio.gather(
                active_client.get(COINBASE_USDT_RATES_URL),
                fetch_cbr(),
            )
            indodax_response = None
        coinbase_response.raise_for_status()
        coinbase_payload = coinbase_response.json()
        coinbase_rate = parse_coinbase_usdt_rub(coinbase_payload)
        if authoritative_indodax is None:
            assert indodax_response is not None
            indodax_response.raise_for_status()
            indodax_payload = indodax_response.json()
            indodax_buy, indodax_sell, indodax_last = parse_indodax_usdt_idr(indodax_payload)
            indodax_server_time = parse_indodax_server_time(indodax_payload)
        else:
            (
                indodax_buy,
                indodax_sell,
                indodax_last,
                indodax_payload,
                indodax_server_time,
            ) = authoritative_indodax
        cbr_rate, cbr_rate_date, cbr_payload, cbr_error_code = cbr_result
        return MarketRates(
            coinbase_usdt_rub=coinbase_rate,
            indodax_buy_idr_per_usdt=indodax_buy,
            indodax_sell_idr_per_usdt=indodax_sell,
            indodax_last_idr_per_usdt=indodax_last,
            fetched_at=observed_at,
            coinbase_payload=coinbase_payload,
            indodax_payload=indodax_payload,
            cbr_usd_rub=cbr_rate,
            cbr_rate_date=cbr_rate_date,
            cbr_fetched_at=observed_at if cbr_rate is not None else None,
            cbr_payload=cbr_payload,
            cbr_error_code=cbr_error_code,
            indodax_server_time=indodax_server_time,
        )

    if client is not None:
        return await fetch(client)

    async with httpx.AsyncClient(timeout=8.0) as active_client:
        return await fetch(active_client)
