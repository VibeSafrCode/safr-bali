from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_DOWN, ROUND_HALF_UP, ROUND_UP
from typing import Literal, Mapping


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


# Route engine v2. The legacy helpers above remain available for compatibility
# with the v0.8.1 fixtures, but new quotes must use the route-local policies
# below so fees from one route can never leak into another route.

RUB_BANK = "RUB_BANK"
USDT = "USDT"
IDR_CASH = "IDR_CASH"
IDR_BANK = "IDR_BANK"

RUB_BANK_TO_IDR_CASH = "RUB_BANK_TO_IDR_CASH"
RUB_BANK_TO_IDR_BANK = "RUB_BANK_TO_IDR_BANK"
RUB_BANK_TO_USDT = "RUB_BANK_TO_USDT"
USDT_TO_RUB_BANK = "USDT_TO_RUB_BANK"
USDT_TO_IDR_CASH = "USDT_TO_IDR_CASH"
USDT_TO_IDR_BANK = "USDT_TO_IDR_BANK"
IDR_CASH_TO_USDT = "IDR_CASH_TO_USDT"
IDR_CASH_TO_RUB_BANK = "IDR_CASH_TO_RUB_BANK"

ROUTE_ASSETS: dict[str, tuple[str, str]] = {
    RUB_BANK_TO_IDR_CASH: (RUB_BANK, IDR_CASH),
    RUB_BANK_TO_IDR_BANK: (RUB_BANK, IDR_BANK),
    RUB_BANK_TO_USDT: (RUB_BANK, USDT),
    USDT_TO_RUB_BANK: (USDT, RUB_BANK),
    USDT_TO_IDR_CASH: (USDT, IDR_CASH),
    USDT_TO_IDR_BANK: (USDT, IDR_BANK),
    IDR_CASH_TO_USDT: (IDR_CASH, USDT),
    IDR_CASH_TO_RUB_BANK: (IDR_CASH, RUB_BANK),
}

ASSET_DISPLAY_STEPS: dict[str, Decimal] = {
    RUB_BANK: Decimal("1"),
    USDT: Decimal("1"),
    IDR_CASH: Decimal("10000"),
    IDR_BANK: Decimal("10000"),
}


@dataclass(frozen=True)
class RouteSettings:
    route_code: str
    safrway_fee_percent: Decimal = Decimal("0")
    safrway_min_fee: Decimal = Decimal("0")
    safrway_min_fee_currency: str | None = None
    partner_fee_percent: Decimal = Decimal("0")
    partner_min_fee: Decimal = Decimal("0")
    partner_min_fee_currency: str | None = None
    technical_fee_percent: Decimal = Decimal("0")
    whitebird_topup_fee_percent: Decimal = Decimal("0")
    whitebird_conversion_fee_percent: Decimal = Decimal("0")
    pph_fee_percent: Decimal = Decimal("0")
    indodax_all_in_fee_percent: Decimal = Decimal("0")
    network_fee_reserve: Decimal = Decimal("0")
    fixed_withdrawal_fee: Decimal = Decimal("0")
    coinbase_spread_percent: Decimal = Decimal("5")
    cbr_spread_percent: Decimal = Decimal("4.25")
    whitebird_sell_discount_percent: Decimal = Decimal("0.75")
    usdt_bank_fee_threshold: Decimal = Decimal("250")
    whitebird_better_rate_client_share: Decimal = Decimal("0.5")
    quote_ttl_seconds: int = 300
    rounding_step: Decimal | None = None
    route_enabled: bool = True
    manual_confirmation_required: bool = True


DEFAULT_ROUTE_SETTINGS: dict[str, RouteSettings] = {
    RUB_BANK_TO_IDR_CASH: RouteSettings(
        route_code=RUB_BANK_TO_IDR_CASH,
        safrway_fee_percent=Decimal("5"),
        safrway_min_fee=Decimal("1500"),
        safrway_min_fee_currency=RUB_BANK,
        partner_fee_percent=Decimal("3"),
        partner_min_fee=Decimal("250000"),
        partner_min_fee_currency=IDR_CASH,
        whitebird_topup_fee_percent=Decimal("1.5"),
        pph_fee_percent=Decimal("0.21"),
        network_fee_reserve=Decimal("1"),
        fixed_withdrawal_fee=Decimal("10000"),
        rounding_step=Decimal("10000"),
    ),
    RUB_BANK_TO_IDR_BANK: RouteSettings(
        route_code=RUB_BANK_TO_IDR_BANK,
        safrway_fee_percent=Decimal("4"),
        safrway_min_fee=Decimal("1500"),
        safrway_min_fee_currency=RUB_BANK,
        whitebird_topup_fee_percent=Decimal("1.5"),
        pph_fee_percent=Decimal("0.21"),
        network_fee_reserve=Decimal("1"),
        fixed_withdrawal_fee=Decimal("10000"),
        rounding_step=Decimal("10000"),
    ),
    RUB_BANK_TO_USDT: RouteSettings(
        route_code=RUB_BANK_TO_USDT,
        safrway_fee_percent=Decimal("5"),
        safrway_min_fee=Decimal("1500"),
        safrway_min_fee_currency=RUB_BANK,
        whitebird_topup_fee_percent=Decimal("1.5"),
        network_fee_reserve=Decimal("1"),
        rounding_step=Decimal("1"),
    ),
    USDT_TO_RUB_BANK: RouteSettings(
        route_code=USDT_TO_RUB_BANK,
        safrway_fee_percent=Decimal("4"),
        safrway_min_fee=Decimal("1000"),
        safrway_min_fee_currency=RUB_BANK,
        whitebird_conversion_fee_percent=Decimal("1.5"),
        rounding_step=Decimal("1"),
    ),
    USDT_TO_IDR_CASH: RouteSettings(
        route_code=USDT_TO_IDR_CASH,
        safrway_fee_percent=Decimal("3"),
        safrway_min_fee=Decimal("150000"),
        safrway_min_fee_currency=IDR_CASH,
        partner_fee_percent=Decimal("3"),
        partner_min_fee=Decimal("250000"),
        partner_min_fee_currency=IDR_CASH,
        pph_fee_percent=Decimal("0.21"),
        network_fee_reserve=Decimal("1"),
        fixed_withdrawal_fee=Decimal("10000"),
        rounding_step=Decimal("10000"),
    ),
    USDT_TO_IDR_BANK: RouteSettings(
        route_code=USDT_TO_IDR_BANK,
        safrway_fee_percent=Decimal("4"),
        safrway_min_fee=Decimal("10"),
        safrway_min_fee_currency=USDT,
        rounding_step=Decimal("10000"),
    ),
    IDR_CASH_TO_USDT: RouteSettings(
        route_code=IDR_CASH_TO_USDT,
        safrway_fee_percent=Decimal("3"),
        safrway_min_fee=Decimal("100000"),
        safrway_min_fee_currency=IDR_CASH,
        partner_fee_percent=Decimal("2"),
        partner_min_fee=Decimal("150000"),
        partner_min_fee_currency=IDR_CASH,
        rounding_step=Decimal("1"),
    ),
    IDR_CASH_TO_RUB_BANK: RouteSettings(
        route_code=IDR_CASH_TO_RUB_BANK,
        safrway_fee_percent=Decimal("4"),
        safrway_min_fee=Decimal("1500"),
        safrway_min_fee_currency=RUB_BANK,
        partner_fee_percent=Decimal("1.5"),
        partner_min_fee=Decimal("150000"),
        partner_min_fee_currency=IDR_CASH,
        technical_fee_percent=Decimal("2.5"),
        rounding_step=Decimal("1"),
    ),
}


@dataclass(frozen=True)
class RouteRates:
    coinbase_usdt_rub: Decimal
    indodax_buy_idr_per_usdt: Decimal
    indodax_sell_idr_per_usdt: Decimal
    cbr_usd_rub: Decimal | None = None
    whitebird_actual_sell_usdt_rub: Decimal | None = None
    coinbase_fetched_at: datetime | None = None
    whitebird_actual_fetched_at: datetime | None = None
    whitebird_actual_expires_at: datetime | None = None
    calculated_at: datetime | None = None


@dataclass(frozen=True)
class WhitebirdSellAllocation:
    protective_rate: Decimal
    actual_rate: Decimal | None
    client_rate: Decimal
    client_surplus_per_usdt: Decimal
    operator_surplus_per_usdt: Decimal
    policy_status: str


@dataclass(frozen=True)
class RouteQuoteResult:
    route_code: str
    mode: Literal["GIVE", "RECEIVE"]
    source_asset: str
    target_asset: str
    requested_amount: Decimal
    source_amount_internal: Decimal
    source_amount_display: Decimal
    target_amount_before_rounding: Decimal
    target_amount_internal: Decimal
    target_amount_display: Decimal
    available_target_amount: Decimal
    fees: Mapping[str, Decimal]
    rate_audit: Mapping[str, Decimal | str | None]
    intermediates: Mapping[str, Decimal]
    policy_flags: tuple[str, ...] = ()


def route_settings(route_code: str) -> RouteSettings:
    try:
        return DEFAULT_ROUTE_SETTINGS[route_code]
    except KeyError as error:
        raise CurrencyCalculationError(f"Unsupported route: {route_code}") from error


def with_route_overrides(
    settings: RouteSettings,
    overrides: Mapping[str, object] | None,
) -> RouteSettings:
    """Return validated route-local overrides without mutating global defaults."""

    if not overrides:
        return settings
    allowed = set(RouteSettings.__dataclass_fields__) - {"route_code"}
    unknown = set(overrides) - allowed
    if unknown:
        raise CurrencyCalculationError(
            f"Unknown route setting(s): {', '.join(sorted(unknown))}"
        )
    decimal_fields = {
        name
        for name in allowed
        if name
        not in {
            "quote_ttl_seconds",
            "route_enabled",
            "manual_confirmation_required",
            "safrway_min_fee_currency",
            "partner_min_fee_currency",
        }
    }
    normalized: dict[str, object] = {}
    for name, value in overrides.items():
        if name in decimal_fields and value is not None:
            normalized[name] = Decimal(str(value))
        else:
            normalized[name] = value
    result = replace(settings, **normalized)
    _validate_route_settings(result)
    return result


def _validate_route_settings(settings: RouteSettings) -> None:
    if settings.route_code not in ROUTE_ASSETS:
        raise CurrencyCalculationError(f"Unsupported route: {settings.route_code}")
    for name in (
        "safrway_fee_percent",
        "partner_fee_percent",
        "technical_fee_percent",
        "whitebird_topup_fee_percent",
        "whitebird_conversion_fee_percent",
        "pph_fee_percent",
        "indodax_all_in_fee_percent",
        "coinbase_spread_percent",
        "cbr_spread_percent",
        "whitebird_sell_discount_percent",
    ):
        _require_percent(name, getattr(settings, name))
    for name in (
        "safrway_min_fee",
        "partner_min_fee",
        "network_fee_reserve",
        "fixed_withdrawal_fee",
        "usdt_bank_fee_threshold",
    ):
        value = getattr(settings, name)
        if not value.is_finite() or value < 0:
            raise CurrencyCalculationError(f"{name} must be finite and non-negative")
    share = settings.whitebird_better_rate_client_share
    if not share.is_finite() or share < 0 or share > 1:
        raise CurrencyCalculationError(
            "whitebird_better_rate_client_share must be between 0 and 1"
        )
    if settings.quote_ttl_seconds <= 0:
        raise CurrencyCalculationError("quote_ttl_seconds must be positive")
    if settings.rounding_step is not None:
        _require_positive("rounding_step", settings.rounding_step)
    expected_currencies = {
        RUB_BANK_TO_IDR_CASH: (RUB_BANK, IDR_CASH),
        RUB_BANK_TO_IDR_BANK: (RUB_BANK, None),
        RUB_BANK_TO_USDT: (RUB_BANK, None),
        USDT_TO_RUB_BANK: (RUB_BANK, None),
        USDT_TO_IDR_CASH: (IDR_CASH, IDR_CASH),
        USDT_TO_IDR_BANK: (USDT, None),
        IDR_CASH_TO_USDT: (IDR_CASH, IDR_CASH),
        IDR_CASH_TO_RUB_BANK: (RUB_BANK, IDR_CASH),
    }
    expected_safrway, expected_partner = expected_currencies[settings.route_code]
    if settings.safrway_min_fee_currency != expected_safrway:
        raise CurrencyCalculationError(
            "safrway_min_fee_currency does not match route policy"
        )
    if settings.partner_fee_percent > 0:
        if settings.partner_min_fee_currency != expected_partner:
            raise CurrencyCalculationError(
                "partner_min_fee_currency does not match route policy"
            )


def _round_step(value: Decimal, step: Decimal, rounding: str) -> Decimal:
    _require_positive("rounding_step", step)
    return (value / step).quantize(Decimal("1"), rounding=rounding) * step


def display_amount(
    value: Decimal,
    asset: str,
    role: Literal["source", "target"],
) -> Decimal:
    """Apply BALI-DEC-20260801-004 and conservative display quantums.

    Source amounts round up, target/payout amounts round down, and exact
    multiples remain unchanged. RUB therefore uses ceil when given and floor
    when received; USDT and IDR use the same direction with their UI steps.
    """

    amount = _require_positive("display_amount", value)
    try:
        step = ASSET_DISPLAY_STEPS[asset]
    except KeyError as error:
        raise CurrencyCalculationError(f"Unsupported asset: {asset}") from error
    rounding = ROUND_UP if role == "source" else ROUND_DOWN
    return _round_step(amount, step, rounding)


def _target_display_amount(
    value: Decimal,
    target_asset: str,
    settings: RouteSettings,
) -> Decimal:
    step = settings.rounding_step or ASSET_DISPLAY_STEPS[target_asset]
    return _round_step(_require_positive("target_amount", value), step, ROUND_DOWN)


def percentage_fee(
    base: Decimal,
    percent: Decimal,
    minimum: Decimal = Decimal("0"),
) -> Decimal:
    amount = _require_positive("fee_base", base)
    rate = _require_percent("fee_percent", percent)
    if not minimum.is_finite() or minimum < 0:
        raise CurrencyCalculationError("minimum fee must be non-negative")
    return max(amount * rate / ONE_HUNDRED, minimum)


def usdt_to_idr_bank_fee(
    incoming_usdt: Decimal,
    settings: RouteSettings | None = None,
) -> tuple[Decimal, str]:
    """BALI-DEC-20260801-005: exact 250 boundary is the minimum branch."""

    active = settings or route_settings(USDT_TO_IDR_BANK)
    amount = _require_positive("incoming_usdt", incoming_usdt)
    if amount <= active.usdt_bank_fee_threshold:
        return active.safrway_min_fee, "MIN_FEE"
    percent_fee = amount * active.safrway_fee_percent / ONE_HUNDRED
    return max(active.safrway_min_fee, percent_fee), "PERCENT_FEE"


def whitebird_sell_allocation(
    rates: RouteRates,
    settings: RouteSettings | None = None,
) -> WhitebirdSellAllocation:
    """Allocate a confirmed better WHITEBIRD rate 50/50, never silently.

    An actual rate participates only when both observations are timestamped
    inside the quote TTL. Otherwise the protective rate is used and the quote
    remains subject to manual confirmation.
    """

    active = settings or route_settings(USDT_TO_RUB_BANK)
    coinbase = _require_positive("coinbase_usdt_rub", rates.coinbase_usdt_rub)
    protective = coinbase * (
        ONE_HUNDRED - active.whitebird_sell_discount_percent
    ) / ONE_HUNDRED
    actual = rates.whitebird_actual_sell_usdt_rub
    if actual is None:
        return WhitebirdSellAllocation(
            protective, None, protective, Decimal("0"), Decimal("0"),
            "PROTECTIVE_ONLY",
        )
    actual = _require_positive("whitebird_actual_sell_usdt_rub", actual)
    timestamps = (
        rates.coinbase_fetched_at,
        rates.whitebird_actual_fetched_at,
        rates.calculated_at,
    )
    if any(value is None for value in timestamps):
        return WhitebirdSellAllocation(
            protective, actual, protective, Decimal("0"), Decimal("0"),
            "ACTUAL_TIMESTAMP_UNCONFIRMED",
        )
    coinbase_at, actual_at, calculated_at = timestamps
    assert coinbase_at is not None and actual_at is not None and calculated_at is not None
    ttl = active.quote_ttl_seconds
    ages = (
        (calculated_at - coinbase_at).total_seconds(),
        (calculated_at - actual_at).total_seconds(),
        abs((actual_at - coinbase_at).total_seconds()),
    )
    if any(age < 0 or age > ttl for age in ages):
        return WhitebirdSellAllocation(
            protective, actual, protective, Decimal("0"), Decimal("0"),
            "ACTUAL_OUTSIDE_QUOTE_TTL",
        )
    if (
        rates.whitebird_actual_expires_at is None
        or rates.whitebird_actual_expires_at < calculated_at
    ):
        return WhitebirdSellAllocation(
            protective, actual, protective, Decimal("0"), Decimal("0"),
            "ACTUAL_OUTSIDE_QUOTE_TTL",
        )
    if actual <= protective:
        return WhitebirdSellAllocation(
            protective, actual, protective, Decimal("0"), Decimal("0"),
            "ACTUAL_NOT_BETTER",
        )
    surplus = actual - protective
    client_surplus = surplus * active.whitebird_better_rate_client_share
    operator_surplus = surplus - client_surplus
    return WhitebirdSellAllocation(
        protective,
        actual,
        protective + client_surplus,
        client_surplus,
        operator_surplus,
        "CONFIRMED_BETTER_50_50",
    )


def _whitebird_buy_rate(
    rates: RouteRates,
    settings: RouteSettings,
) -> tuple[Decimal, dict[str, Decimal | str | None]]:
    coinbase = _require_positive("coinbase_usdt_rub", rates.coinbase_usdt_rub)
    if rates.cbr_usd_rub is None:
        raise CurrencyCalculationError("cbr_usd_rub is required for this route")
    cbr = _require_positive("cbr_usd_rub", rates.cbr_usd_rub)
    coinbase_guard = coinbase * (
        ONE_HUNDRED + settings.coinbase_spread_percent
    ) / ONE_HUNDRED
    cbr_guard = cbr * (
        ONE_HUNDRED + settings.cbr_spread_percent
    ) / ONE_HUNDRED
    selected = max(coinbase_guard, cbr_guard)
    return selected, {
        "coinbase_usdt_rub": coinbase,
        "cbr_usd_rub": cbr,
        "whitebird_coinbase_guard": coinbase_guard,
        "whitebird_cbr_guard": cbr_guard,
        "whitebird_buy_rate": selected,
        "whitebird_buy_rate_source": (
            "COINBASE" if coinbase_guard >= cbr_guard else "CBR"
        ),
    }


def _ensure_positive_result(name: str, value: Decimal) -> Decimal:
    if not value.is_finite() or value <= 0:
        raise CurrencyCalculationError(
            f"Amount is below route fees ({name} is not positive)"
        )
    return value


def _route_by_give_raw(
    route_code: str,
    source_amount: Decimal,
    rates: RouteRates,
    settings: RouteSettings,
) -> tuple[
    Decimal,
    dict[str, Decimal],
    dict[str, Decimal | str | None],
    dict[str, Decimal],
    tuple[str, ...],
]:
    source = _require_positive("source_amount", source_amount)
    fees: dict[str, Decimal] = {}
    rate_audit: dict[str, Decimal | str | None] = {}
    intermediates: dict[str, Decimal] = {}
    flags: list[str] = []

    if route_code in {
        RUB_BANK_TO_IDR_CASH,
        RUB_BANK_TO_IDR_BANK,
        RUB_BANK_TO_USDT,
    }:
        buy_rate, buy_audit = _whitebird_buy_rate(rates, settings)
        rate_audit.update(buy_audit)
        fees["safrway_fee_rub"] = percentage_fee(
            source,
            settings.safrway_fee_percent,
            settings.safrway_min_fee,
        )
        after_safrway = _ensure_positive_result(
            "rub_after_safrway",
            source - fees["safrway_fee_rub"],
        )
        fees["whitebird_topup_fee_rub"] = percentage_fee(
            after_safrway,
            settings.whitebird_topup_fee_percent,
        )
        credited_rub = _ensure_positive_result(
            "whitebird_credited_rub",
            after_safrway - fees["whitebird_topup_fee_rub"],
        )
        usdt_before_network = credited_rub / buy_rate
        fees["network_fee_usdt"] = settings.network_fee_reserve
        usdt_after_network = _ensure_positive_result(
            "usdt_after_network",
            usdt_before_network - fees["network_fee_usdt"],
        )
        intermediates.update(
            {
                "rub_after_safrway": after_safrway,
                "whitebird_credited_rub": credited_rub,
                "usdt_before_network": usdt_before_network,
                "usdt_after_network": usdt_after_network,
            }
        )
        if route_code == RUB_BANK_TO_USDT:
            flags.append("NETWORK_FEE_PRELIMINARY")
            return usdt_after_network, fees, rate_audit, intermediates, tuple(flags)

        indodax_buy = _require_positive(
            "indodax_buy_idr_per_usdt",
            rates.indodax_buy_idr_per_usdt,
        )
        rate_audit["indodax_buy_idr_per_usdt"] = indodax_buy
        gross_idr = usdt_after_network * indodax_buy
        fees["pph_fee_idr"] = percentage_fee(
            gross_idr,
            settings.pph_fee_percent,
        )
        fees["indodax_all_in_fee_idr"] = percentage_fee(
            gross_idr,
            settings.indodax_all_in_fee_percent,
        )
        fees["fixed_withdrawal_fee_idr"] = settings.fixed_withdrawal_fee
        if route_code == RUB_BANK_TO_IDR_CASH:
            fees["partner_fee_idr"] = percentage_fee(
                gross_idr,
                settings.partner_fee_percent,
                settings.partner_min_fee,
            )
        target = gross_idr - sum(
            fee
            for name, fee in fees.items()
            if name.endswith("_idr")
        )
        intermediates["gross_idr"] = gross_idr
        return (
            _ensure_positive_result("target_idr", target),
            fees,
            rate_audit,
            intermediates,
            tuple(flags),
        )

    if route_code == USDT_TO_RUB_BANK:
        allocation = whitebird_sell_allocation(rates, settings)
        rate_audit.update(
            {
                "whitebird_protective_sell_rate": allocation.protective_rate,
                "whitebird_actual_sell_rate": allocation.actual_rate,
                "whitebird_client_sell_rate": allocation.client_rate,
                "whitebird_client_surplus_per_usdt": (
                    allocation.client_surplus_per_usdt
                ),
                "whitebird_operator_surplus_per_usdt": (
                    allocation.operator_surplus_per_usdt
                ),
                "whitebird_allocation_policy": allocation.policy_status,
            }
        )
        if allocation.policy_status != "CONFIRMED_BETTER_50_50":
            flags.append(allocation.policy_status)
        gross_rub = source * allocation.client_rate
        fees["whitebird_conversion_fee_rub"] = percentage_fee(
            gross_rub,
            settings.whitebird_conversion_fee_percent,
        )
        after_whitebird = _ensure_positive_result(
            "rub_after_whitebird",
            gross_rub - fees["whitebird_conversion_fee_rub"],
        )
        fees["safrway_fee_rub"] = percentage_fee(
            after_whitebird,
            settings.safrway_fee_percent,
            settings.safrway_min_fee,
        )
        target = after_whitebird - fees["safrway_fee_rub"]
        intermediates.update(
            {"gross_rub": gross_rub, "rub_after_whitebird": after_whitebird}
        )
        return (
            _ensure_positive_result("target_rub", target),
            fees,
            rate_audit,
            intermediates,
            tuple(flags),
        )

    if route_code in {USDT_TO_IDR_CASH, USDT_TO_IDR_BANK}:
        indodax_buy = _require_positive(
            "indodax_buy_idr_per_usdt",
            rates.indodax_buy_idr_per_usdt,
        )
        rate_audit["indodax_buy_idr_per_usdt"] = indodax_buy
        if route_code == USDT_TO_IDR_BANK:
            fee_usdt, classification = usdt_to_idr_bank_fee(source, settings)
            fees["safrway_fee_usdt"] = fee_usdt
            flags.append(f"USDT_BANK_{classification}")
            tradable_usdt = _ensure_positive_result(
                "tradable_usdt",
                source - fee_usdt,
            )
            target = tradable_usdt * indodax_buy
            intermediates["tradable_usdt"] = tradable_usdt
            return target, fees, rate_audit, intermediates, tuple(flags)

        fees["network_fee_usdt"] = settings.network_fee_reserve
        tradable_usdt = _ensure_positive_result(
            "tradable_usdt",
            source - fees["network_fee_usdt"],
        )
        gross_idr = tradable_usdt * indodax_buy
        fees["pph_fee_idr"] = percentage_fee(
            gross_idr,
            settings.pph_fee_percent,
        )
        fees["indodax_all_in_fee_idr"] = percentage_fee(
            gross_idr,
            settings.indodax_all_in_fee_percent,
        )
        fees["fixed_withdrawal_fee_idr"] = settings.fixed_withdrawal_fee
        fees["safrway_fee_idr"] = percentage_fee(
            gross_idr,
            settings.safrway_fee_percent,
            settings.safrway_min_fee,
        )
        fees["partner_fee_idr"] = percentage_fee(
            gross_idr,
            settings.partner_fee_percent,
            settings.partner_min_fee,
        )
        target = gross_idr - sum(
            fee for name, fee in fees.items() if name.endswith("_idr")
        )
        intermediates.update(
            {"tradable_usdt": tradable_usdt, "gross_idr": gross_idr}
        )
        return (
            _ensure_positive_result("target_idr", target),
            fees,
            rate_audit,
            intermediates,
            tuple(flags),
        )

    if route_code == IDR_CASH_TO_USDT:
        indodax_sell = _require_positive(
            "indodax_sell_idr_per_usdt",
            rates.indodax_sell_idr_per_usdt,
        )
        rate_audit["indodax_sell_idr_per_usdt"] = indodax_sell
        # BALI master prompt explicitly requires both fees to use the full
        # incoming IDR amount; they are not sequential fee bases.
        fees["partner_fee_idr"] = percentage_fee(
            source,
            settings.partner_fee_percent,
            settings.partner_min_fee,
        )
        fees["safrway_fee_idr"] = percentage_fee(
            source,
            settings.safrway_fee_percent,
            settings.safrway_min_fee,
        )
        tradable_idr = _ensure_positive_result(
            "tradable_idr",
            source - fees["partner_fee_idr"] - fees["safrway_fee_idr"],
        )
        target = tradable_idr / indodax_sell
        intermediates["tradable_idr"] = tradable_idr
        return target, fees, rate_audit, intermediates, tuple(flags)

    if route_code == IDR_CASH_TO_RUB_BANK:
        coinbase = _require_positive("coinbase_usdt_rub", rates.coinbase_usdt_rub)
        indodax_sell = _require_positive(
            "indodax_sell_idr_per_usdt",
            rates.indodax_sell_idr_per_usdt,
        )
        rate_audit.update(
            {
                "coinbase_usdt_rub": coinbase,
                "indodax_sell_idr_per_usdt": indodax_sell,
            }
        )
        # The 2.5% is aggregate: TON, WHITEBIRD, protective reserve and known
        # losses are already inside it and must never be added again.
        fees["technical_aggregate_fee_idr"] = percentage_fee(
            source,
            settings.technical_fee_percent,
        )
        fees["partner_fee_idr"] = percentage_fee(
            source,
            settings.partner_fee_percent,
            settings.partner_min_fee,
        )
        convertible_idr = _ensure_positive_result(
            "convertible_idr",
            source
            - fees["technical_aggregate_fee_idr"]
            - fees["partner_fee_idr"],
        )
        gross_rub = convertible_idr * coinbase / indodax_sell
        percent = settings.safrway_fee_percent / ONE_HUNDRED
        percent_candidate = gross_rub / (Decimal("1") + percent)
        percent_fee = percent_candidate * percent
        if percent_fee >= settings.safrway_min_fee:
            target = percent_candidate
            fees["safrway_fee_rub"] = percent_fee
            flags.append("SAFRWAY_PERCENT_FEE")
        else:
            fees["safrway_fee_rub"] = settings.safrway_min_fee
            target = gross_rub - settings.safrway_min_fee
            flags.append("SAFRWAY_MIN_FEE")
        intermediates.update(
            {"convertible_idr": convertible_idr, "gross_rub": gross_rub}
        )
        return (
            _ensure_positive_result("target_rub", target),
            fees,
            rate_audit,
            intermediates,
            tuple(flags),
        )

    raise CurrencyCalculationError(f"Unsupported route: {route_code}")


def calculate_route_by_give(
    *,
    route_code: str,
    amount: Decimal,
    rates: RouteRates,
    settings: RouteSettings | None = None,
) -> RouteQuoteResult:
    active = settings or route_settings(route_code)
    _validate_route_settings(active)
    if active.route_code != route_code:
        raise CurrencyCalculationError("Route settings do not match route_code")
    if not active.route_enabled:
        raise CurrencyCalculationError("Route is disabled")
    try:
        source_asset, target_asset = ROUTE_ASSETS[route_code]
    except KeyError as error:
        raise CurrencyCalculationError(f"Unsupported route: {route_code}") from error
    source = _require_positive("amount", amount)
    raw_target, fees, rate_audit, intermediates, flags = _route_by_give_raw(
        route_code,
        source,
        rates,
        active,
    )
    target_display = _target_display_amount(raw_target, target_asset, active)
    return RouteQuoteResult(
        route_code=route_code,
        mode="GIVE",
        source_asset=source_asset,
        target_asset=target_asset,
        requested_amount=source,
        source_amount_internal=source,
        source_amount_display=display_amount(source, source_asset, "source"),
        target_amount_before_rounding=raw_target,
        target_amount_internal=raw_target,
        target_amount_display=target_display,
        available_target_amount=target_display,
        fees=fees,
        rate_audit=rate_audit,
        intermediates=intermediates,
        policy_flags=flags,
    )


def calculate_route_by_receive(
    *,
    route_code: str,
    amount: Decimal,
    rates: RouteRates,
    settings: RouteSettings | None = None,
) -> RouteQuoteResult:
    """Invert a monotonic route using exact display quanta and Decimal only."""

    active = settings or route_settings(route_code)
    _validate_route_settings(active)
    try:
        source_asset, target_asset = ROUTE_ASSETS[route_code]
    except KeyError as error:
        raise CurrencyCalculationError(f"Unsupported route: {route_code}") from error
    desired = _target_display_amount(
        _require_positive("amount", amount),
        target_asset,
        active,
    )
    source_step = ASSET_DISPLAY_STEPS[source_asset]

    def result_for_units(units: int) -> RouteQuoteResult | None:
        try:
            return calculate_route_by_give(
                route_code=route_code,
                amount=Decimal(units) * source_step,
                rates=rates,
                settings=active,
            )
        except CurrencyCalculationError:
            return None

    low = 1
    high = 1
    high_result = result_for_units(high)
    for _ in range(256):
        if high_result is not None and high_result.target_amount_display >= desired:
            break
        high *= 2
        high_result = result_for_units(high)
    else:
        raise CurrencyCalculationError("Could not invert route safely")

    best = high_result
    while low <= high:
        middle = (low + high) // 2
        candidate = result_for_units(middle)
        if candidate is not None and candidate.target_amount_display >= desired:
            best = candidate
            high = middle - 1
        else:
            low = middle + 1
    if best is None:
        raise CurrencyCalculationError("Amount is below route minimum")
    return replace(
        best,
        mode="RECEIVE",
        requested_amount=amount,
        target_amount_display=desired,
        available_target_amount=best.target_amount_display,
        policy_flags=best.policy_flags + ("RECEIVE_MONOTONIC_INVERSION",),
    )
