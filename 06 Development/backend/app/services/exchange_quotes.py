from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import uuid4

import httpx
from sqlalchemy.orm import Session

from app.models.exchange import (
    ExchangeQuote,
    ExchangeRateSnapshot,
    ExchangeSettingsVersion,
)
from app.models.user import User
from app.services.currency_calculator import (
    IdrToRubSettings,
    UsdtToIdrSettings,
    calculate_bank_rub_from_cash_idr,
    calculate_cash_idr_to_bank_rub,
    calculate_usdt_to_idr_by_give,
    calculate_usdt_to_idr_by_receive,
)
from app.services.market_rates import MarketRateError, fetch_market_rates


USDT = "USDT"
IDR_CASH = "IDR_CASH"
IDR_BANK = "IDR_BANK"
RUB_BANK = "RUB_BANK"

SUPPORTED_PAIRS = {
    (USDT, IDR_CASH): ("give", "receive"),
    (USDT, IDR_BANK): ("give", "receive"),
    (IDR_CASH, RUB_BANK): ("give", "receive"),
}

CURRENCY_OPTIONS = {
    "give": [
        {"code": RUB_BANK, "label": "Рубли безналичные"},
        {"code": USDT, "label": "USDT"},
        {"code": IDR_CASH, "label": "Рупии наличные"},
        {"code": IDR_BANK, "label": "Рупии безналичные"},
    ],
    "receive": [
        {"code": IDR_CASH, "label": "Рупии наличные"},
        {"code": IDR_BANK, "label": "Рупии безналичные"},
        {"code": RUB_BANK, "label": "Рубли безналичные"},
    ],
}


class UnsupportedExchangePair(ValueError):
    pass


class ExchangeRateUnavailable(RuntimeError):
    pass


def utcnow() -> datetime:
    return datetime.utcnow()


def decimal_text(value: Decimal) -> str:
    return format(value, "f")


def get_active_exchange_settings(db: Session) -> ExchangeSettingsVersion:
    result = (
        db.query(ExchangeSettingsVersion)
        .filter(ExchangeSettingsVersion.is_active.is_(True))
        .order_by(ExchangeSettingsVersion.version.desc())
        .first()
    )
    if result is None:
        raise RuntimeError("Active exchange settings are not configured")
    return result


def settings_snapshot(settings: ExchangeSettingsVersion) -> dict:
    return {
        "version": settings.version,
        "technical_fee_percent": decimal_text(
            settings.technical_fee_percent
        ),
        "partner_fee_percent": decimal_text(settings.partner_fee_percent),
        "partner_min_fee_idr": decimal_text(settings.partner_min_fee_idr),
        "safrway_fee_percent": decimal_text(settings.safrway_fee_percent),
        "safrway_min_fee_rub": decimal_text(settings.safrway_min_fee_rub),
        "usdt_idr_base_fee_percent": decimal_text(
            settings.usdt_idr_base_fee_percent
        ),
        "usdt_idr_cash_extra_fee_percent": decimal_text(
            settings.usdt_idr_cash_extra_fee_percent
        ),
        "usdt_idr_max_total_fee_percent": decimal_text(
            settings.usdt_idr_max_total_fee_percent
        ),
        "cash_deposit_fee_percent": decimal_text(
            settings.cash_deposit_fee_percent
        ),
        "indonesia_interbank_fee_percent": decimal_text(
            settings.indonesia_interbank_fee_percent
        ),
        "idr_rounding_step": settings.idr_rounding_step,
    }


async def get_rate_snapshot(
    db: Session,
    settings: ExchangeSettingsVersion,
    *,
    client: Optional[httpx.AsyncClient] = None,
    now: Optional[datetime] = None,
) -> tuple[ExchangeRateSnapshot, str]:
    current_time = now or utcnow()
    latest = (
        db.query(ExchangeRateSnapshot)
        .filter(ExchangeRateSnapshot.source_status.in_(["LIVE", "MANUAL"]))
        .order_by(ExchangeRateSnapshot.fetched_at.desc())
        .first()
    )
    if latest is not None:
        age = (current_time - latest.fetched_at).total_seconds()
        if age <= settings.rate_cache_ttl_seconds:
            return latest, latest.source_status

    try:
        market = await fetch_market_rates(client, now=current_time)
    except (httpx.HTTPError, MarketRateError, ValueError) as error:
        if latest is not None:
            age = (current_time - latest.fetched_at).total_seconds()
            if age <= settings.max_stale_rate_seconds:
                return latest, "STALE"
        raise ExchangeRateUnavailable(
            "Market rates are temporarily unavailable"
        ) from error

    whitebird_factor = (
        Decimal("1") - settings.whitebird_discount_percent / Decimal("100")
    )
    snapshot = ExchangeRateSnapshot(
        coinbase_usdt_rub=market.coinbase_usdt_rub,
        indodax_buy_idr_per_usdt=market.indodax_buy_idr_per_usdt,
        indodax_sell_idr_per_usdt=market.indodax_sell_idr_per_usdt,
        indodax_last_idr_per_usdt=market.indodax_last_idr_per_usdt,
        estimated_whitebird_usdt_rub=(
            market.coinbase_usdt_rub * whitebird_factor
        ),
        coinbase_raw_json=market.coinbase_payload,
        indodax_raw_json=market.indodax_payload,
        source_status="LIVE",
        fetched_at=current_time,
        expires_at=current_time
        + timedelta(seconds=settings.rate_cache_ttl_seconds),
    )
    db.add(snapshot)
    db.flush()
    return snapshot, "LIVE"


def _calculate_quote_values(
    *,
    give_currency: str,
    receive_currency: str,
    amount: Decimal,
    amount_side: str,
    settings: ExchangeSettingsVersion,
    rates: ExchangeRateSnapshot,
) -> tuple[Decimal, Decimal, dict]:
    allowed_sides = SUPPORTED_PAIRS.get((give_currency, receive_currency))
    if allowed_sides is None:
        raise UnsupportedExchangePair(
            "This direction currently requires a manual calculation"
        )
    if amount_side not in allowed_sides:
        raise ValueError("This direction does not support this amount side")

    if give_currency == USDT:
        calculator_settings = UsdtToIdrSettings(
            base_fee_percent=settings.usdt_idr_base_fee_percent,
            cash_extra_fee_percent=(
                settings.usdt_idr_cash_extra_fee_percent
            ),
            max_total_fee_percent=settings.usdt_idr_max_total_fee_percent,
        )
        calculator_arguments = {
            "indodax_buy_idr_per_usdt": rates.indodax_buy_idr_per_usdt,
            "receive_cash": receive_currency == IDR_CASH,
            "settings": calculator_settings,
        }
        if amount_side == "give":
            result = calculate_usdt_to_idr_by_give(
                give_usdt=amount,
                **calculator_arguments,
            )
        else:
            result = calculate_usdt_to_idr_by_receive(
                receive_idr=amount,
                **calculator_arguments,
            )
        return (
            result.give_usdt,
            result.receive_idr,
            {
                "indodax_side": "buy",
                "indodax_buy_idr_per_usdt": decimal_text(
                    result.indodax_buy_idr_per_usdt
                ),
                "client_rate_idr_per_usdt": decimal_text(
                    result.client_rate_idr_per_usdt
                ),
                "total_fee_percent": decimal_text(result.total_fee_percent),
            },
        )

    calculator_settings = IdrToRubSettings(
        safrway_fee_percent=settings.safrway_fee_percent,
        safrway_min_fee_rub=settings.safrway_min_fee_rub,
        technical_fee_percent=settings.technical_fee_percent,
        partner_fee_percent=settings.partner_fee_percent,
        partner_min_fee_idr=settings.partner_min_fee_idr,
        idr_rounding_step=Decimal(settings.idr_rounding_step),
    )
    calculator_arguments = {
        "coinbase_usdt_rub": rates.coinbase_usdt_rub,
        "indodax_sell_idr_per_usdt": rates.indodax_sell_idr_per_usdt,
        "settings": calculator_settings,
    }
    if amount_side == "receive":
        result = calculate_cash_idr_to_bank_rub(
            receive_rub=amount,
            **calculator_arguments,
        )
    else:
        result = calculate_bank_rub_from_cash_idr(
            give_idr=amount,
            **calculator_arguments,
        )
    return (
        result.give_idr,
        result.receive_rub,
        {
            "indodax_side": "sell",
            "coinbase_usdt_rub": decimal_text(result.coinbase_usdt_rub),
            "indodax_sell_idr_per_usdt": decimal_text(
                result.indodax_sell_idr_per_usdt
            ),
            "safrway_fee_rub": decimal_text(result.safrway_fee_rub),
            "gross_rub": decimal_text(result.gross_rub),
            "reference_idr_per_rub": decimal_text(
                result.reference_idr_per_rub
            ),
            "base_idr": decimal_text(result.base_idr),
            "technical_idr": decimal_text(result.technical_idr),
            "partner_fee_idr": decimal_text(result.partner_fee_idr),
            "calculation_margin_idr": decimal_text(
                result.calculation_margin_idr
            ),
        },
    )


async def create_exchange_quote(
    db: Session,
    *,
    user: User,
    give_currency: str,
    receive_currency: str,
    amount: Decimal,
    amount_side: str,
    client: Optional[httpx.AsyncClient] = None,
    now: Optional[datetime] = None,
) -> ExchangeQuote:
    if (give_currency, receive_currency) not in SUPPORTED_PAIRS:
        raise UnsupportedExchangePair(
            "This direction currently requires a manual calculation"
        )

    current_time = now or utcnow()
    active_settings = get_active_exchange_settings(db)
    rates, rate_status = await get_rate_snapshot(
        db,
        active_settings,
        client=client,
        now=current_time,
    )
    give_amount, receive_amount, calculation = _calculate_quote_values(
        give_currency=give_currency,
        receive_currency=receive_currency,
        amount=amount,
        amount_side=amount_side,
        settings=active_settings,
        rates=rates,
    )
    flags = ["RATE_STALE"] if rate_status == "STALE" else []
    quote = ExchangeQuote(
        id=str(uuid4()),
        user_id=user.id,
        give_currency=give_currency,
        receive_currency=receive_currency,
        amount_side=amount_side,
        requested_amount=amount,
        give_amount=give_amount,
        receive_amount=receive_amount,
        rate_snapshot_id=rates.id,
        settings_version_id=active_settings.id,
        rate_status=rate_status,
        status="PRELIMINARY",
        manual_confirmation_required=True,
        settings_snapshot=settings_snapshot(active_settings),
        calculation_snapshot=calculation,
        diagnostic_flags=flags,
        calculated_at=current_time,
        expires_at=current_time
        + timedelta(seconds=active_settings.quote_ttl_seconds),
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)
    return quote


def public_quote(quote: ExchangeQuote) -> dict:
    return {
        "id": quote.id,
        "give_currency": quote.give_currency,
        "receive_currency": quote.receive_currency,
        "give_amount": decimal_text(quote.give_amount),
        "receive_amount": decimal_text(quote.receive_amount),
        "status": quote.status,
        "manual_confirmation_required": quote.manual_confirmation_required,
        "expires_at": quote.expires_at.isoformat(),
    }
