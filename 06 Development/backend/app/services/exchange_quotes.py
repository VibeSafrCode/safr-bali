from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Mapping, Optional
from uuid import uuid4

import httpx
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.exchange import (
    ExchangeQuote,
    ExchangeRateSnapshot,
    ExchangeRequest,
    ExchangeRouteSettingsVersion,
    ExchangeSettingsVersion,
)
from app.models.user import User
from app.services.currency_calculator import (
    DEFAULT_ROUTE_SETTINGS,
    IDR_BANK,
    IDR_CASH,
    ROUTE_ASSETS,
    RUB_BANK,
    RUB_BANK_TO_IDR_BANK,
    RUB_BANK_TO_IDR_CASH,
    RUB_BANK_TO_USDT,
    USDT,
    USDT_TO_RUB_BANK,
    RouteQuoteResult,
    RouteRates,
    RouteSettings,
    calculate_route_by_give,
    calculate_route_by_receive,
    with_route_overrides,
)
from app.services.market_rates import MarketRateError, fetch_market_rates


WARNING = "Финальную сумму и способ проведения сделки подтверждает оператор."

ROUTE_CODE_BY_PAIR = {
    assets: route_code for route_code, assets in ROUTE_ASSETS.items()
}
SUPPORTED_PAIRS = {
    assets: ("give", "receive") for assets in ROUTE_CODE_BY_PAIR
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
        {"code": USDT, "label": "USDT"},
        {"code": RUB_BANK, "label": "Рубли безналичные"},
    ],
}

CBR_REQUIRED_ROUTES = {
    RUB_BANK_TO_IDR_CASH,
    RUB_BANK_TO_IDR_BANK,
    RUB_BANK_TO_USDT,
}


class UnsupportedExchangePair(ValueError):
    pass


class ExchangeRateUnavailable(RuntimeError):
    pass


def utcnow() -> datetime:
    return datetime.utcnow()


def decimal_text(value: Decimal) -> str:
    return format(value, "f")


def display_text(value: Decimal) -> str:
    return format(value.to_integral_value(), "f")


def _json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return decimal_text(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


def route_settings_payload(settings: RouteSettings) -> dict[str, Any]:
    return {
        key: _json_value(value)
        for key, value in asdict(settings).items()
        if key != "route_code"
    }


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


def get_active_route_settings(
    db: Session,
    route_code: str,
) -> tuple[ExchangeRouteSettingsVersion, RouteSettings]:
    if route_code not in ROUTE_ASSETS:
        raise UnsupportedExchangePair("Unsupported exchange route")
    version = (
        db.query(ExchangeRouteSettingsVersion)
        .filter(
            ExchangeRouteSettingsVersion.route_code == route_code,
            ExchangeRouteSettingsVersion.is_active.is_(True),
        )
        .order_by(ExchangeRouteSettingsVersion.version.desc())
        .first()
    )
    if version is None:
        raise UnsupportedExchangePair("Exchange route is not configured")
    try:
        settings = with_route_overrides(
            DEFAULT_ROUTE_SETTINGS[route_code],
            version.settings,
        )
    except ValueError as error:
        raise RuntimeError("Active route settings are invalid") from error
    if not settings.route_enabled:
        raise UnsupportedExchangePair("Exchange route is disabled")
    return version, settings


def active_route_options(db: Session) -> list[dict[str, Any]]:
    active_versions = {
        item.route_code: item
        for item in db.query(ExchangeRouteSettingsVersion)
        .filter(ExchangeRouteSettingsVersion.is_active.is_(True))
        .all()
    }
    result = []
    for route_code, (source_asset, target_asset) in ROUTE_ASSETS.items():
        version = active_versions.get(route_code)
        enabled = False
        manual = True
        if version is not None:
            try:
                settings = with_route_overrides(
                    DEFAULT_ROUTE_SETTINGS[route_code],
                    version.settings,
                )
                enabled = settings.route_enabled
                manual = settings.manual_confirmation_required
            except ValueError:
                enabled = False
        result.append(
            {
                "route_code": route_code,
                "source_asset": source_asset,
                "target_asset": target_asset,
                "give_currency": source_asset,
                "receive_currency": target_asset,
                "modes": ["GIVE", "RECEIVE"],
                "amount_sides": ["give", "receive"],
                "enabled": enabled,
                "manual_calculation_required": not enabled,
                "manual_confirmation_required": manual,
                "settings_version": version.version if version else None,
            }
        )
    return result


def legacy_settings_snapshot(settings: ExchangeSettingsVersion) -> dict[str, Any]:
    return {
        "version": settings.version,
        "technical_fee_percent": decimal_text(settings.technical_fee_percent),
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
        "whitebird_discount_percent": decimal_text(
            settings.whitebird_discount_percent
        ),
        "whitebird_withdrawal_fee_percent": decimal_text(
            settings.whitebird_withdrawal_fee_percent
        ),
        "ton_fee_buffer_usdt": decimal_text(settings.ton_fee_buffer_usdt),
        "cash_deposit_fee_percent": decimal_text(
            settings.cash_deposit_fee_percent
        ),
        "indonesia_interbank_fee_percent": decimal_text(
            settings.indonesia_interbank_fee_percent
        ),
        "idr_rounding_step": settings.idr_rounding_step,
        "quote_ttl_seconds": settings.quote_ttl_seconds,
        "rate_cache_ttl_seconds": settings.rate_cache_ttl_seconds,
        "max_stale_rate_seconds": settings.max_stale_rate_seconds,
    }


# Backward-compatible export used by existing internal callers.
settings_snapshot = legacy_settings_snapshot


def _utc_naive(value: Optional[datetime]) -> Optional[datetime]:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _snapshot_supports_route(
    snapshot: ExchangeRateSnapshot,
    route_code: str,
) -> bool:
    return route_code not in CBR_REQUIRED_ROUTES or snapshot.cbr_usd_rub is not None


async def get_rate_snapshot(
    db: Session,
    settings: ExchangeSettingsVersion,
    *,
    route_code: str,
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
    if latest is not None and _snapshot_supports_route(latest, route_code):
        age = (current_time - latest.fetched_at).total_seconds()
        if age <= settings.rate_cache_ttl_seconds:
            return latest, latest.source_status

    try:
        market = await fetch_market_rates(client, now=current_time)
    except (httpx.HTTPError, MarketRateError, ValueError) as error:
        if latest is not None and _snapshot_supports_route(latest, route_code):
            age = (current_time - latest.fetched_at).total_seconds()
            if age <= settings.max_stale_rate_seconds:
                return latest, "STALE"
        raise ExchangeRateUnavailable(
            "Market rates are temporarily unavailable"
        ) from error

    if route_code in CBR_REQUIRED_ROUTES and market.cbr_usd_rub is None:
        if latest is not None and _snapshot_supports_route(latest, route_code):
            age = (current_time - latest.fetched_at).total_seconds()
            if age <= settings.max_stale_rate_seconds:
                return latest, "STALE"
        raise ExchangeRateUnavailable("CBR USD/RUB rate is temporarily unavailable")

    sell_settings = DEFAULT_ROUTE_SETTINGS[USDT_TO_RUB_BANK]
    whitebird_factor = (
        Decimal("1")
        - sell_settings.whitebird_sell_discount_percent / Decimal("100")
    )
    snapshot = ExchangeRateSnapshot(
        coinbase_usdt_rub=market.coinbase_usdt_rub,
        indodax_buy_idr_per_usdt=market.indodax_buy_idr_per_usdt,
        indodax_sell_idr_per_usdt=market.indodax_sell_idr_per_usdt,
        indodax_last_idr_per_usdt=market.indodax_last_idr_per_usdt,
        estimated_whitebird_usdt_rub=(
            market.coinbase_usdt_rub * whitebird_factor
        ),
        cbr_usd_rub=market.cbr_usd_rub,
        cbr_rate_date=market.cbr_rate_date,
        cbr_fetched_at=_utc_naive(market.cbr_fetched_at),
        cbr_raw_json=market.cbr_payload
        or {"status": "UNAVAILABLE", "error_code": market.cbr_error_code},
        indodax_server_time=_utc_naive(market.indodax_server_time),
        whitebird_actual_sell_usdt_rub=(
            market.whitebird_actual_sell_usdt_rub
        ),
        whitebird_actual_fetched_at=_utc_naive(
            market.whitebird_actual_fetched_at
        ),
        whitebird_actual_expires_at=_utc_naive(
            market.whitebird_actual_expires_at
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


def _resolve_route_request(
    *,
    route_code: Optional[str],
    mode: Optional[str],
    give_currency: Optional[str],
    receive_currency: Optional[str],
    amount_side: Optional[str],
) -> tuple[str, str, str, str]:
    if route_code is None:
        if not give_currency or not receive_currency:
            raise UnsupportedExchangePair("route_code or currency pair is required")
        route_code = ROUTE_CODE_BY_PAIR.get((give_currency, receive_currency))
        if route_code is None:
            raise UnsupportedExchangePair(
                "This direction currently requires a manual calculation"
            )
    if route_code not in ROUTE_ASSETS:
        raise UnsupportedExchangePair("Unsupported exchange route")
    source_asset, target_asset = ROUTE_ASSETS[route_code]
    if give_currency is not None and give_currency != source_asset:
        raise UnsupportedExchangePair("give_currency does not match route_code")
    if receive_currency is not None and receive_currency != target_asset:
        raise UnsupportedExchangePair("receive_currency does not match route_code")

    normalized_mode = (mode or amount_side or "").upper()
    if normalized_mode not in {"GIVE", "RECEIVE"}:
        raise ValueError("mode must be GIVE or RECEIVE")
    return route_code, normalized_mode, source_asset, target_asset


def _route_rates(
    snapshot: ExchangeRateSnapshot,
    current_time: datetime,
) -> RouteRates:
    return RouteRates(
        coinbase_usdt_rub=snapshot.coinbase_usdt_rub,
        cbr_usd_rub=snapshot.cbr_usd_rub,
        indodax_buy_idr_per_usdt=snapshot.indodax_buy_idr_per_usdt,
        indodax_sell_idr_per_usdt=snapshot.indodax_sell_idr_per_usdt,
        whitebird_actual_sell_usdt_rub=(
            snapshot.whitebird_actual_sell_usdt_rub
        ),
        coinbase_fetched_at=snapshot.fetched_at,
        whitebird_actual_fetched_at=snapshot.whitebird_actual_fetched_at,
        whitebird_actual_expires_at=snapshot.whitebird_actual_expires_at,
        calculated_at=current_time,
    )


def _rate_snapshot_payload(
    snapshot: ExchangeRateSnapshot,
    rate_status: str,
) -> dict[str, Any]:
    return _json_value(
        {
            "id": snapshot.id,
            "status": rate_status,
            "source_status": snapshot.source_status,
            "fetched_at": snapshot.fetched_at,
            "expires_at": snapshot.expires_at,
            "normalized_rates": {
                "coinbase_usdt_rub": snapshot.coinbase_usdt_rub,
                "cbr_usd_rub": snapshot.cbr_usd_rub,
                "cbr_rate_date": snapshot.cbr_rate_date,
                "cbr_fetched_at": snapshot.cbr_fetched_at,
                "indodax_buy_idr_per_usdt": (
                    snapshot.indodax_buy_idr_per_usdt
                ),
                "indodax_sell_idr_per_usdt": (
                    snapshot.indodax_sell_idr_per_usdt
                ),
                "indodax_last_idr_per_usdt": (
                    snapshot.indodax_last_idr_per_usdt
                ),
                "indodax_server_time": snapshot.indodax_server_time,
                "legacy_estimated_whitebird_usdt_rub": (
                    snapshot.estimated_whitebird_usdt_rub
                ),
                "whitebird_actual_sell_usdt_rub": (
                    snapshot.whitebird_actual_sell_usdt_rub
                ),
                "whitebird_actual_fetched_at": (
                    snapshot.whitebird_actual_fetched_at
                ),
                "whitebird_actual_expires_at": (
                    snapshot.whitebird_actual_expires_at
                ),
            },
            "raw_rates": {
                "coinbase": snapshot.coinbase_raw_json,
                "cbr": snapshot.cbr_raw_json,
                "indodax": snapshot.indodax_raw_json,
            },
        }
    )


def _calculation_snapshot(
    result: RouteQuoteResult,
    rate_snapshot: ExchangeRateSnapshot,
    rate_status: str,
    route_settings: RouteSettings,
) -> dict[str, Any]:
    return _json_value(
        {
            "route_code": result.route_code,
            "mode": result.mode,
            "requested_amount": result.requested_amount,
            "source_asset": result.source_asset,
            "source_amount_internal": result.source_amount_internal,
            "source_amount_display": result.source_amount_display,
            "target_asset": result.target_asset,
            "target_amount_internal": result.target_amount_internal,
            "target_amount_display": result.target_amount_display,
            "available_target_amount": result.available_target_amount,
            "fees": result.fees,
            "rate_audit": result.rate_audit,
            "rate_snapshot": _rate_snapshot_payload(rate_snapshot, rate_status),
            "intermediates": result.intermediates,
            "rounding": {
                "source_direction": "CEILING",
                "target_direction": "FLOOR",
                "target_step": route_settings.rounding_step,
                "result_before_rounding": result.target_amount_before_rounding,
                "result_after_rounding": result.target_amount_display,
            },
            "policy_flags": result.policy_flags,
        }
    )


async def create_exchange_quote(
    db: Session,
    *,
    user: User,
    amount: Decimal,
    route_code: Optional[str] = None,
    mode: Optional[str] = None,
    give_currency: Optional[str] = None,
    receive_currency: Optional[str] = None,
    amount_side: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
    now: Optional[datetime] = None,
) -> ExchangeQuote:
    route_code, normalized_mode, source_asset, target_asset = (
        _resolve_route_request(
            route_code=route_code,
            mode=mode,
            give_currency=give_currency,
            receive_currency=receive_currency,
            amount_side=amount_side,
        )
    )
    current_time = now or utcnow()
    global_settings = get_active_exchange_settings(db)
    route_version, route_settings = get_active_route_settings(db, route_code)
    rate_snapshot, rate_status = await get_rate_snapshot(
        db,
        global_settings,
        route_code=route_code,
        client=client,
        now=current_time,
    )
    calculator = (
        calculate_route_by_give
        if normalized_mode == "GIVE"
        else calculate_route_by_receive
    )
    result = calculator(
        route_code=route_code,
        amount=amount,
        rates=_route_rates(rate_snapshot, current_time),
        settings=route_settings,
    )
    flags = (["RATE_STALE"] if rate_status == "STALE" else []) + list(
        result.policy_flags
    )
    route_settings_snapshot = {
        "id": route_version.id,
        "route_code": route_version.route_code,
        "version": route_version.version,
        "effective_from": _json_value(route_version.effective_from),
        "values": route_settings_payload(route_settings),
    }
    quote = ExchangeQuote(
        id=str(uuid4()),
        user_id=user.id,
        route_code=route_code,
        mode=normalized_mode,
        give_currency=source_asset,
        receive_currency=target_asset,
        amount_side=normalized_mode.lower(),
        requested_amount=amount,
        give_amount=result.source_amount_display,
        receive_amount=result.target_amount_display,
        source_amount_internal=result.source_amount_internal,
        source_amount_display=result.source_amount_display,
        target_amount_internal=result.target_amount_internal,
        target_amount_display=result.target_amount_display,
        rate_snapshot_id=rate_snapshot.id,
        settings_version_id=global_settings.id,
        route_settings_version_id=route_version.id,
        rate_status=rate_status,
        status="PRELIMINARY",
        manual_confirmation_required=(
            route_settings.manual_confirmation_required
        ),
        settings_snapshot={
            "global": legacy_settings_snapshot(global_settings),
            "route": route_settings_snapshot,
        },
        calculation_snapshot=_calculation_snapshot(
            result,
            rate_snapshot,
            rate_status,
            route_settings,
        ),
        diagnostic_flags=flags,
        calculated_at=current_time,
        expires_at=current_time
        + timedelta(seconds=route_settings.quote_ttl_seconds),
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)
    return quote


def public_quote(quote: ExchangeQuote) -> dict[str, Any]:
    result = {
        "quote_id": quote.id,
        "route_code": quote.route_code,
        "mode": quote.mode,
        "source_asset": quote.give_currency,
        "source_amount_internal": decimal_text(quote.source_amount_internal),
        "source_amount_display": display_text(quote.source_amount_display),
        "target_asset": quote.receive_currency,
        "target_amount_internal": decimal_text(quote.target_amount_internal),
        "target_amount_display": display_text(quote.target_amount_display),
        "status": quote.status,
        "manual_confirmation_required": quote.manual_confirmation_required,
        "calculated_at": quote.calculated_at.isoformat(),
        "expires_at": quote.expires_at.isoformat(),
        "warning": WARNING,
    }
    # Temporary v0.8.1 aliases keep the current React client operational while
    # it moves to the explicit route/mode contract.
    result.update(
        {
            "id": quote.id,
            "give_currency": quote.give_currency,
            "receive_currency": quote.receive_currency,
            "give_amount": display_text(quote.source_amount_display),
            "receive_amount": display_text(quote.target_amount_display),
        }
    )
    return result


class ExchangeRequestConflict(ValueError):
    pass


class ExchangeQuoteUnavailable(ValueError):
    pass


class RouteSettingsVersionConflict(ValueError):
    pass


@dataclass(frozen=True)
class ExchangeRequestCreateResult:
    request: ExchangeRequest
    created: bool


def create_exchange_request(
    db: Session,
    *,
    user: User,
    quote_id: str,
    idempotency_key: str,
    now: Optional[datetime] = None,
) -> ExchangeRequestCreateResult:
    normalized_key = idempotency_key.strip()
    if not normalized_key:
        raise ExchangeRequestConflict("Idempotency-Key must not be blank")
    if len(normalized_key) > 100:
        raise ExchangeRequestConflict("Idempotency-Key is too long")

    existing_key = (
        db.query(ExchangeRequest)
        .filter(ExchangeRequest.idempotency_key == normalized_key)
        .first()
    )
    if existing_key is not None:
        if existing_key.user_id == user.id and existing_key.quote_id == quote_id:
            return ExchangeRequestCreateResult(existing_key, False)
        raise ExchangeRequestConflict("Idempotency-Key was used for another request")

    quote = db.query(ExchangeQuote).filter(ExchangeQuote.id == quote_id).first()
    current_time = now or utcnow()
    if quote is None or quote.user_id != user.id:
        raise ExchangeQuoteUnavailable("Quote is not available")
    if quote.status != "PRELIMINARY":
        raise ExchangeQuoteUnavailable("Quote cannot be submitted")
    if quote.expires_at <= current_time:
        raise ExchangeQuoteUnavailable("Quote has expired")

    existing_quote = (
        db.query(ExchangeRequest)
        .filter(ExchangeRequest.quote_id == quote_id)
        .first()
    )
    if existing_quote is not None:
        if existing_quote.idempotency_key == normalized_key:
            return ExchangeRequestCreateResult(existing_quote, False)
        raise ExchangeRequestConflict("Quote already has an exchange request")

    request = ExchangeRequest(
        quote_id=quote.id,
        user_id=user.id,
        idempotency_key=normalized_key,
        status="AWAITING_OPERATOR",
        created_at=current_time,
    )
    db.add(request)
    try:
        db.commit()
        db.refresh(request)
        return ExchangeRequestCreateResult(request, True)
    except IntegrityError as error:
        db.rollback()
        replay = (
            db.query(ExchangeRequest)
            .filter(ExchangeRequest.idempotency_key == normalized_key)
            .first()
        )
        if replay is not None and replay.user_id == user.id and replay.quote_id == quote_id:
            return ExchangeRequestCreateResult(replay, False)
        raise ExchangeRequestConflict("Exchange request conflicts with an existing request") from error


def public_exchange_request(result: ExchangeRequestCreateResult) -> dict[str, Any]:
    request = result.request
    return {
        "request_id": request.id,
        "quote_id": request.quote_id,
        "status": request.status,
        "created_at": request.created_at.isoformat(),
        "idempotent_replay": not result.created,
    }


def list_active_route_settings(db: Session) -> list[dict[str, Any]]:
    versions = (
        db.query(ExchangeRouteSettingsVersion)
        .filter(ExchangeRouteSettingsVersion.is_active.is_(True))
        .order_by(ExchangeRouteSettingsVersion.route_code.asc())
        .all()
    )
    return [
        {
            "id": item.id,
            "route_code": item.route_code,
            "version": item.version,
            "is_active": item.is_active,
            "settings": item.settings,
            "effective_from": item.effective_from,
            "created_at": item.created_at,
        }
        for item in versions
    ]


def create_route_settings_version(
    db: Session,
    *,
    route_code: str,
    settings_payload: Mapping[str, Any],
    created_by: Optional[int] = None,
    now: Optional[datetime] = None,
    expected_active_version: Optional[int] = None,
    commit: bool = True,
) -> ExchangeRouteSettingsVersion:
    if route_code not in DEFAULT_ROUTE_SETTINGS:
        raise RouteSettingsVersionConflict("Unsupported exchange route")
    active = (
        db.query(ExchangeRouteSettingsVersion)
        .filter(
            ExchangeRouteSettingsVersion.route_code == route_code,
            ExchangeRouteSettingsVersion.is_active.is_(True),
        )
        .with_for_update()
        .first()
    )
    if active is None:
        raise RouteSettingsVersionConflict("Active route settings are missing")
    if expected_active_version is not None and active.version != expected_active_version:
        raise RouteSettingsVersionConflict("Active route settings version changed")
    expected_keys = set(route_settings_payload(DEFAULT_ROUTE_SETTINGS[route_code]))
    supplied_keys = set(settings_payload)
    unknown = sorted(supplied_keys - expected_keys)
    if unknown:
        raise RouteSettingsVersionConflict(
            "Unknown route setting(s): " + ", ".join(unknown)
        )
    if not supplied_keys:
        raise RouteSettingsVersionConflict("At least one route setting is required")
    try:
        current_settings = with_route_overrides(
            DEFAULT_ROUTE_SETTINGS[route_code],
            active.settings,
        )
        merged_payload = route_settings_payload(current_settings)
        merged_payload.update(settings_payload)
        validated = with_route_overrides(
            DEFAULT_ROUTE_SETTINGS[route_code],
            merged_payload,
        )
    except ValueError as error:
        raise RouteSettingsVersionConflict(str(error)) from error
    next_version = (
        db.query(func.max(ExchangeRouteSettingsVersion.version))
        .filter(ExchangeRouteSettingsVersion.route_code == route_code)
        .scalar()
        or 0
    ) + 1
    active.is_active = False
    current_time = now or utcnow()
    try:
        db.flush()
        version = ExchangeRouteSettingsVersion(
            route_code=route_code,
            version=next_version,
            is_active=True,
            settings=route_settings_payload(validated),
            created_by=created_by,
            effective_from=current_time,
            created_at=current_time,
        )
        db.add(version)
        if commit:
            db.commit()
        else:
            db.flush()
        db.refresh(version)
        return version
    except IntegrityError as error:
        db.rollback()
        raise RouteSettingsVersionConflict(
            "Concurrent route settings update detected"
        ) from error
