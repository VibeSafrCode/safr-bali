from __future__ import annotations

from dataclasses import dataclass, replace
from decimal import Decimal, ROUND_HALF_DOWN, ROUND_HALF_UP, ROUND_UP


ONE_HUNDRED = Decimal("100")


class CurrencyCalculationError(ValueError):
    """Raised when a currency calculation cannot be performed safely."""


@dataclass(frozen=True)
class UsdtToIdrSettings:
    base_fee_percent: Decimal
    cash_extra_fee_percent: Decimal
    max_total_fee_percent: Decimal


@dataclass(frozen=True)
class IdrToRubSettings:
    safrway_fee_percent: Decimal
    safrway_min_fee_rub: Decimal
    technical_fee_percent: Decimal
    partner_fee_percent: Decimal
    partner_min_fee_idr: Decimal
    idr_rounding_step: Decimal


@dataclass(frozen=True)
class UsdtToIdrResult:
    give_usdt: Decimal
    receive_idr: Decimal
    indodax_buy_idr_per_usdt: Decimal
    client_rate_idr_per_usdt: Decimal
    total_fee_percent: Decimal


@dataclass(frozen=True)
class IdrToRubResult:
    give_idr: Decimal
    receive_rub: Decimal
    coinbase_usdt_rub: Decimal
    indodax_sell_idr_per_usdt: Decimal
    safrway_fee_rub: Decimal
    gross_rub: Decimal
    reference_idr_per_rub: Decimal
    base_idr: Decimal
    technical_idr: Decimal
    partner_fee_idr: Decimal
    calculation_margin_idr: Decimal


def _require_positive(name: str, value: Decimal) -> Decimal:
    if not value.is_finite() or value <= 0:
        raise CurrencyCalculationError(f"{name} must be a finite positive number")
    return value


def _require_percent(name: str, value: Decimal) -> Decimal:
    if not value.is_finite() or value < 0 or value >= ONE_HUNDRED:
        raise CurrencyCalculationError(f"{name} must be between 0 and 100")
    return value


def round_idr(value: Decimal, step: Decimal) -> Decimal:
    _require_positive("idr_rounding_step", step)
    units = (value / step).quantize(Decimal("1"), rounding=ROUND_HALF_DOWN)
    return units * step


def _usdt_to_idr_fee_and_rate(
    *,
    indodax_buy_idr_per_usdt: Decimal,
    receive_cash: bool,
    settings: UsdtToIdrSettings,
) -> tuple[Decimal, Decimal]:
    market_rate = _require_positive(
        "indodax_buy_idr_per_usdt",
        indodax_buy_idr_per_usdt,
    )
    base_fee = _require_percent("base_fee_percent", settings.base_fee_percent)
    cash_extra_fee = _require_percent(
        "cash_extra_fee_percent",
        settings.cash_extra_fee_percent,
    )
    max_total_fee = _require_percent(
        "max_total_fee_percent",
        settings.max_total_fee_percent,
    )
    total_fee = min(
        base_fee + (cash_extra_fee if receive_cash else Decimal("0")),
        max_total_fee,
    )
    client_rate = (
        market_rate * (ONE_HUNDRED - total_fee) / ONE_HUNDRED
    ).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return total_fee, client_rate


def calculate_usdt_to_idr_by_give(
    *,
    give_usdt: Decimal,
    indodax_buy_idr_per_usdt: Decimal,
    receive_cash: bool,
    settings: UsdtToIdrSettings,
) -> UsdtToIdrResult:
    """Calculate USDT → cash or bank IDR using the Indodax bid."""

    amount = _require_positive("give_usdt", give_usdt)
    total_fee, client_rate = _usdt_to_idr_fee_and_rate(
        indodax_buy_idr_per_usdt=indodax_buy_idr_per_usdt,
        receive_cash=receive_cash,
        settings=settings,
    )
    receive_idr = (amount * client_rate).quantize(
        Decimal("1"),
        rounding=ROUND_HALF_UP,
    )

    return UsdtToIdrResult(
        give_usdt=amount,
        receive_idr=receive_idr,
        indodax_buy_idr_per_usdt=indodax_buy_idr_per_usdt,
        client_rate_idr_per_usdt=client_rate,
        total_fee_percent=total_fee,
    )


def calculate_usdt_to_idr_by_receive(
    *,
    receive_idr: Decimal,
    indodax_buy_idr_per_usdt: Decimal,
    receive_cash: bool,
    settings: UsdtToIdrSettings,
) -> UsdtToIdrResult:
    """Calculate required USDT when the client specifies desired IDR."""

    target_idr = _require_positive("receive_idr", receive_idr)
    total_fee, client_rate = _usdt_to_idr_fee_and_rate(
        indodax_buy_idr_per_usdt=indodax_buy_idr_per_usdt,
        receive_cash=receive_cash,
        settings=settings,
    )
    give_usdt = (target_idr / client_rate).quantize(
        Decimal("0.00000001"),
        rounding=ROUND_UP,
    )
    return UsdtToIdrResult(
        give_usdt=give_usdt,
        receive_idr=target_idr,
        indodax_buy_idr_per_usdt=indodax_buy_idr_per_usdt,
        client_rate_idr_per_usdt=client_rate,
        total_fee_percent=total_fee,
    )


def calculate_cash_idr_to_bank_rub(
    *,
    receive_rub: Decimal,
    coinbase_usdt_rub: Decimal,
    indodax_sell_idr_per_usdt: Decimal,
    settings: IdrToRubSettings,
) -> IdrToRubResult:
    """Calculate cash IDR → USDT → bank RUB using the Indodax ask."""

    target_rub = _require_positive("receive_rub", receive_rub)
    coinbase_rate = _require_positive("coinbase_usdt_rub", coinbase_usdt_rub)
    indodax_rate = _require_positive(
        "indodax_sell_idr_per_usdt",
        indodax_sell_idr_per_usdt,
    )
    safrway_percent = _require_percent(
        "safrway_fee_percent",
        settings.safrway_fee_percent,
    )
    technical_percent = _require_percent(
        "technical_fee_percent",
        settings.technical_fee_percent,
    )
    partner_percent = _require_percent(
        "partner_fee_percent",
        settings.partner_fee_percent,
    )
    safrway_minimum = _require_positive(
        "safrway_min_fee_rub",
        settings.safrway_min_fee_rub,
    )
    partner_minimum = _require_positive(
        "partner_min_fee_idr",
        settings.partner_min_fee_idr,
    )

    safrway_fee_raw = target_rub * safrway_percent / ONE_HUNDRED
    safrway_fee = max(safrway_fee_raw, safrway_minimum).quantize(
        Decimal("1"),
        rounding=ROUND_HALF_UP,
    )
    gross_rub = target_rub + safrway_fee
    reference_idr_per_rub = indodax_rate / coinbase_rate
    base_idr = gross_rub * reference_idr_per_rub
    technical_idr_raw = (
        base_idr * (ONE_HUNDRED + technical_percent) / ONE_HUNDRED
    )
    technical_idr = round_idr(
        technical_idr_raw,
        settings.idr_rounding_step,
    )
    partner_fee_raw = technical_idr * partner_percent / ONE_HUNDRED
    partner_fee = round_idr(
        max(partner_fee_raw, partner_minimum),
        settings.idr_rounding_step,
    )
    client_pays_idr = round_idr(
        technical_idr + partner_fee,
        settings.idr_rounding_step,
    )

    return IdrToRubResult(
        give_idr=client_pays_idr,
        receive_rub=target_rub,
        coinbase_usdt_rub=coinbase_rate,
        indodax_sell_idr_per_usdt=indodax_rate,
        safrway_fee_rub=safrway_fee,
        gross_rub=gross_rub,
        reference_idr_per_rub=reference_idr_per_rub,
        base_idr=base_idr,
        technical_idr=technical_idr,
        partner_fee_idr=partner_fee,
        calculation_margin_idr=Decimal("0"),
    )


def calculate_bank_rub_from_cash_idr(
    *,
    give_idr: Decimal,
    coinbase_usdt_rub: Decimal,
    indodax_sell_idr_per_usdt: Decimal,
    settings: IdrToRubSettings,
) -> IdrToRubResult:
    """Find the largest integer RUB result available for the client's IDR."""

    available_idr = _require_positive("give_idr", give_idr)
    coinbase_rate = _require_positive("coinbase_usdt_rub", coinbase_usdt_rub)
    indodax_rate = _require_positive(
        "indodax_sell_idr_per_usdt",
        indodax_sell_idr_per_usdt,
    )
    approximate_market_rub = (
        available_idr * coinbase_rate / indodax_rate
    ).to_integral_value(rounding=ROUND_HALF_DOWN)
    low = 1
    high = max(1, int(approximate_market_rub))
    best: IdrToRubResult | None = None

    while low <= high:
        middle = (low + high) // 2
        candidate = calculate_cash_idr_to_bank_rub(
            receive_rub=Decimal(middle),
            coinbase_usdt_rub=coinbase_rate,
            indodax_sell_idr_per_usdt=indodax_rate,
            settings=settings,
        )
        if candidate.give_idr <= available_idr:
            best = candidate
            low = middle + 1
        else:
            high = middle - 1

    if best is None:
        raise CurrencyCalculationError(
            "give_idr is below the minimum amount for this route"
        )
    return replace(
        best,
        give_idr=available_idr,
        calculation_margin_idr=available_idr - best.give_idr,
    )
