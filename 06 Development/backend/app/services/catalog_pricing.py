from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_HALF_UP
from typing import Any, Iterable, Optional

import httpx
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.admin_action import AdminAction
from app.models.catalog_pricing import (
    CatalogPublication,
    CatalogPublicationPointer,
    CommercialPriceSnapshot,
    FxMarketSnapshot,
    PriceCatalogItem,
    PriceCatalogVersion,
)


INDODAX_PAIRS_URL = "https://indodax.com/api/pairs"
INDODAX_USDT_IDR_DEPTH_URL = "https://indodax.com/api/depth/usdtidr"
INDODAX_SERVER_TIME_URL = "https://indodax.com/api/server_time"
INDODAX_SOURCE_REFERENCE = (
    "https://github.com/btcid/indodax-official-api-docs/blob/master/Public-RestAPI.md"
)
FX_FRESH_SECONDS = 60
FX_STALE_GRACE_SECONDS = 15 * 60
MAX_MANUAL_OVERRIDE_SECONDS = 24 * 60 * 60
IDR_ADMIN_INPUT_ROUNDING_STEP = Decimal("1000")
USDT_DISPLAY_QUANTUM = Decimal("0.01")
FORMULA_CODE = "IDR_DIV_ASK_USDTIDR_HALF_UP_2DP_V1"
FX_ACCEPTANCE_METHOD = "SELL_DEPTH_VWAP_2000_USDT_V1"
FX_LIQUIDITY_NOTIONAL_USDT = Decimal("2000")
FX_MAX_CHANGE_BPS = 500
FX_MAX_PAYLOAD_BYTES = 1_000_000
_ADVISORY_LOCK_KEY = 72407202


class PricingError(ValueError):
    pass


class PricingConflict(PricingError):
    pass


class FxUnavailable(PricingError):
    pass


@dataclass(frozen=True)
class IndodaxObservation:
    ask: Decimal
    best_ask: Decimal
    bid: Decimal
    provider_server_time: datetime
    observed_at: datetime
    raw_payload: dict[str, Any]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def aware_utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def positive_decimal(name: str, value: Any) -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise PricingError(f"{name} must be a decimal") from error
    if not result.is_finite() or result <= 0:
        raise PricingError(f"{name} must be positive")
    return result


def idr_to_usdt(amount_idr: Any, ask_idr_per_usdt: Any) -> Decimal:
    amount = positive_decimal("amount_idr", amount_idr)
    ask = positive_decimal("ask_idr_per_usdt", ask_idr_per_usdt)
    return (amount / ask).quantize(USDT_DISPLAY_QUANTUM, rounding=ROUND_HALF_UP)


def usdt_to_canonical_idr(amount_usdt: Any, ask_idr_per_usdt: Any) -> Decimal:
    amount = positive_decimal("amount_usdt", amount_usdt)
    ask = positive_decimal("ask_idr_per_usdt", ask_idr_per_usdt)
    raw = amount * ask
    steps = (raw / IDR_ADMIN_INPUT_ROUNDING_STEP).quantize(
        Decimal("1"), rounding=ROUND_CEILING
    )
    return steps * IDR_ADMIN_INPUT_ROUNDING_STEP


def _depth_level(row: Any, *, field: str) -> tuple[Decimal, Decimal]:
    if isinstance(row, (list, tuple)) and len(row) >= 2:
        return positive_decimal(f"{field}.price", row[0]), positive_decimal(
            f"{field}.volume", row[1]
        )
    if isinstance(row, dict):
        return positive_decimal(f"{field}.price", row.get("price")), positive_decimal(
            f"{field}.volume", row.get("volume") or row.get("amount")
        )
    raise PricingError(f"{field} has invalid shape")


def parse_indodax_observation(
    pairs_payload: Any,
    depth_payload: dict[str, Any],
    server_payload: dict[str, Any],
    *,
    observed_at: Optional[datetime] = None,
) -> IndodaxObservation:
    pairs = pairs_payload.get("pairs") if isinstance(pairs_payload, dict) else pairs_payload
    if not isinstance(pairs, list):
        raise PricingError("Indodax pairs payload is invalid")
    pair = next(
        (item for item in pairs if isinstance(item, dict) and str(item.get("id", "")).lower() == "usdtidr"),
        None,
    )
    if pair is None:
        raise PricingError("Indodax usdtidr pair is unavailable")
    sells = depth_payload.get("sell")
    buys = depth_payload.get("buy")
    if not isinstance(sells, list) or not sells or not isinstance(buys, list) or not buys:
        raise PricingError("Indodax usdtidr order book is empty")
    encoded_size = len(
        json.dumps(
            {"pairs": pairs_payload, "depth": depth_payload, "server_time": server_payload},
            separators=(",", ":"), ensure_ascii=False,
        ).encode("utf-8")
    )
    if encoded_size > FX_MAX_PAYLOAD_BYTES:
        raise PricingError("Indodax payload exceeds the accepted size limit")
    sell_levels = sorted(
        (_depth_level(row, field="depth.sell") for row in sells), key=lambda level: level[0]
    )
    buy_levels = sorted(
        (_depth_level(row, field="depth.buy") for row in buys), key=lambda level: level[0], reverse=True
    )
    best_ask = sell_levels[0][0]
    bid = buy_levels[0][0]
    if bid >= best_ask:
        raise PricingError("Indodax usdtidr book is crossed or inverted")
    remaining = FX_LIQUIDITY_NOTIONAL_USDT
    idr_cost = Decimal("0")
    for price, available_usdt in sell_levels:
        fill = min(remaining, available_usdt)
        idr_cost += fill * price
        remaining -= fill
        if remaining <= 0:
            break
    if remaining > 0:
        raise PricingError("Indodax usdtidr sell depth is insufficient for policy notional")
    ask = idr_cost / FX_LIQUIDITY_NOTIONAL_USDT
    raw_server_time = server_payload.get("server_time")
    try:
        timestamp_ms = int(str(raw_server_time))
        if timestamp_ms < 1_000_000_000_000:
            raise ValueError
        provider_time = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
    except (OverflowError, TypeError, ValueError) as error:
        raise PricingError("Indodax server_time is invalid") from error
    now = aware_utc(observed_at or utc_now())
    if abs((now - provider_time).total_seconds()) > 5 * 60:
        raise PricingError("Indodax server_time is outside the accepted clock window")
    return IndodaxObservation(
        ask=ask,
        best_ask=best_ask,
        bid=bid,
        provider_server_time=provider_time,
        observed_at=now,
        raw_payload={
            "pair": pair,
            "depth": depth_payload,
            "server_time": server_payload,
            "acceptance": {
                "method": FX_ACCEPTANCE_METHOD,
                "notional_usdt": str(FX_LIQUIDITY_NOTIONAL_USDT),
                "best_ask": str(best_ask),
                "vwap_ask": str(ask),
            },
        },
    )


async def fetch_indodax_observation(
    client: Optional[httpx.AsyncClient] = None,
    *,
    now: Optional[datetime] = None,
) -> IndodaxObservation:
    async def fetch(active_client: httpx.AsyncClient) -> IndodaxObservation:
        last_error: Optional[Exception] = None
        for attempt, delay in enumerate((0.0, 0.25, 0.75), start=1):
            if delay:
                await asyncio.sleep(delay)
            try:
                pairs_response, depth_response, time_response = await asyncio.gather(
                    active_client.get(INDODAX_PAIRS_URL),
                    active_client.get(INDODAX_USDT_IDR_DEPTH_URL),
                    active_client.get(INDODAX_SERVER_TIME_URL),
                )
                for response in (pairs_response, depth_response, time_response):
                    response.raise_for_status()
                return parse_indodax_observation(
                    pairs_response.json(),
                    depth_response.json(),
                    time_response.json(),
                    observed_at=now,
                )
            except (httpx.HTTPError, PricingError, ValueError) as error:
                last_error = error
                if attempt == 3:
                    break
        raise FxUnavailable("Indodax USDT/IDR market data is unavailable") from last_error

    if client is not None:
        return await fetch(client)
    timeout = httpx.Timeout(5.0, connect=3.0)
    async with httpx.AsyncClient(timeout=timeout) as active_client:
        return await fetch(active_client)


def _advisory_xact_lock(db: Session) -> None:
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _ADVISORY_LOCK_KEY})


def _try_advisory_xact_lock(db: Session) -> bool:
    """Acquire the FX writer lock without ever blocking an async caller.

    ``refresh_fx_snapshot`` is used by an async admin endpoint and by the FX
    timer.  A blocking PostgreSQL advisory lock here can freeze the single
    Uvicorn event loop when another transaction owns the lock.  Publication
    writers keep the blocking lock because they run in synchronous endpoints;
    the automatic refresh must instead fail fast and retry on the next timer
    tick.
    """
    if db.get_bind().dialect.name != "postgresql":
        return True
    return bool(
        db.execute(
            text("SELECT pg_try_advisory_xact_lock(:key)"),
            {"key": _ADVISORY_LOCK_KEY},
        ).scalar()
    )


def _payload_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def latest_fx_snapshot(db: Session) -> Optional[FxMarketSnapshot]:
    return db.query(FxMarketSnapshot).order_by(FxMarketSnapshot.version.desc()).first()


def latest_publication(db: Session) -> Optional[CatalogPublication]:
    pointer = db.get(CatalogPublicationPointer, 1)
    return db.get(CatalogPublication, pointer.publication_id) if pointer else None


def effective_fx_snapshot(db: Session) -> Optional[FxMarketSnapshot]:
    publication = latest_publication(db)
    return db.get(FxMarketSnapshot, publication.fx_snapshot_id) if publication else latest_fx_snapshot(db)


def _activate_publication(db: Session, publication: CatalogPublication) -> None:
    pointer = (
        db.query(CatalogPublicationPointer)
        .filter(CatalogPublicationPointer.id == 1)
        .with_for_update()
        .first()
    )
    if pointer is None:
        db.add(CatalogPublicationPointer(
            id=1,
            publication_id=publication.id,
            lock_version=1,
            updated_at=publication.published_at,
        ))
    else:
        pointer.publication_id = publication.id
        pointer.lock_version += 1
        pointer.updated_at = publication.published_at
    db.flush()


def _publish_fx_revision_if_catalog_exists(
    db: Session,
    fx: FxMarketSnapshot,
    *,
    reason: str,
    actor_id: Optional[int] = None,
) -> Optional[CatalogPublication]:
    current = latest_publication(db)
    if current is None or current.fx_snapshot_id == fx.id:
        return current
    key = f"fx:{fx.version}:catalog:{current.catalog_version_id}"
    existing = db.query(CatalogPublication).filter_by(idempotency_key=key).first()
    if existing is not None:
        return existing
    next_version = (db.query(func.max(CatalogPublication.version)).scalar() or 0) + 1
    publication = CatalogPublication(
        version=next_version,
        catalog_version_id=current.catalog_version_id,
        fx_snapshot_id=fx.id,
        published_by_admin_id=actor_id,
        reason=reason,
        idempotency_key=key,
        published_at=fx.observed_at,
    )
    db.add(publication)
    db.flush()
    _activate_publication(db, publication)
    return publication


async def refresh_fx_snapshot(
    db: Session,
    *,
    client: Optional[httpx.AsyncClient] = None,
    now: Optional[datetime] = None,
    force: bool = False,
) -> tuple[FxMarketSnapshot, str]:
    current_time = aware_utc(now or utc_now())
    active_publication = latest_publication(db)
    active_fx = db.get(FxMarketSnapshot, active_publication.fx_snapshot_id) if active_publication else latest_fx_snapshot(db)
    manual_active = bool(
        active_fx is not None
        and active_fx.is_manual_override
        and active_fx.override_expires_at is not None
        and current_time <= aware_utc(active_fx.override_expires_at)
    )
    if active_fx is not None and not manual_active and not force:
        if not active_fx.is_manual_override and current_time <= aware_utc(active_fx.fresh_until):
            return active_fx, "FRESH"

    observation = await fetch_indodax_observation(client, now=current_time)
    if not _try_advisory_xact_lock(db):
        active_fx = effective_fx_snapshot(db)
        if active_fx is not None and current_time <= aware_utc(active_fx.stale_until):
            return active_fx, "REFRESH_BUSY"
        raise FxUnavailable("Another FX refresh is already in progress")
    latest = latest_fx_snapshot(db)
    active_publication = latest_publication(db)
    active_fx = db.get(FxMarketSnapshot, active_publication.fx_snapshot_id) if active_publication else None
    manual_active = bool(
        active_fx is not None and active_fx.is_manual_override
        and active_fx.override_expires_at is not None
        and current_time <= aware_utc(active_fx.override_expires_at)
    )
    if active_fx is not None and not manual_active and not force:
        if not active_fx.is_manual_override and current_time <= aware_utc(active_fx.fresh_until):
            return active_fx, "FRESH"

    previous_live = (
        db.query(FxMarketSnapshot)
        .filter(FxMarketSnapshot.source_status == "LIVE")
        .order_by(FxMarketSnapshot.version.desc())
        .first()
    )
    change_bps: Optional[int] = None
    if previous_live is not None:
        change = abs(observation.ask - previous_live.ask_idr_per_usdt) / previous_live.ask_idr_per_usdt
        change_bps = int((change * Decimal("10000")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        if change_bps > FX_MAX_CHANGE_BPS:
            raise FxUnavailable("Indodax USDT/IDR observation exceeded the anomaly threshold")

    raw_payload = observation.raw_payload
    payload_hash = _payload_hash(raw_payload)
    existing = db.query(FxMarketSnapshot).filter_by(payload_hash=payload_hash).first()
    if existing is not None:
        if not manual_active:
            _publish_fx_revision_if_catalog_exists(
                db,
                existing,
                reason=f"Idempotent FX refresh to version {existing.version}",
            )
        return existing, "IDEMPOTENT"
    next_version = (latest.version if latest is not None else 0) + 1
    snapshot = FxMarketSnapshot(
        version=next_version,
        source_code="INDODAX_PUBLIC_ORDER_BOOK",
        pair_id="usdtidr",
        ask_idr_per_usdt=observation.ask,
        best_ask_idr_per_usdt=observation.best_ask,
        bid_idr_per_usdt=observation.bid,
        last_idr_per_usdt=None,
        provider_server_time=observation.provider_server_time,
        observed_at=observation.observed_at,
        fresh_until=observation.observed_at + timedelta(seconds=FX_FRESH_SECONDS),
        stale_until=observation.observed_at + timedelta(seconds=FX_STALE_GRACE_SECONDS),
        source_status="LIVE",
        accepted_notional_usdt=FX_LIQUIDITY_NOTIONAL_USDT,
        acceptance_method=FX_ACCEPTANCE_METHOD,
        change_bps_from_previous=change_bps,
        is_manual_override=False,
        override_expires_at=None,
        payload_hash=payload_hash,
        operation_key=None,
        source_reference=INDODAX_SOURCE_REFERENCE,
        raw_payload=raw_payload,
        reason="Automatic accepted Indodax usdtidr order-book observation",
    )
    db.add(snapshot)
    db.flush()
    if manual_active:
        return snapshot, "OBSERVED_DURING_MANUAL"
    _publish_fx_revision_if_catalog_exists(db, snapshot, reason=f"Automatic FX refresh to version {snapshot.version}")
    return snapshot, "LIVE"


def create_manual_fx_override(
    db: Session,
    *,
    ask_idr_per_usdt: Any,
    bid_idr_per_usdt: Any,
    expires_at: datetime,
    reason: str,
    actor_id: int,
    expected_publication_version: int,
    idempotency_key: str,
    now: Optional[datetime] = None,
) -> FxMarketSnapshot:
    current_time = aware_utc(now or utc_now())
    expiry = aware_utc(expires_at)
    if len(reason.strip()) < 3 or len(idempotency_key.strip()) < 8:
        raise PricingError("Manual override reason and idempotency key are required")
    if expiry <= current_time or expiry > current_time + timedelta(seconds=MAX_MANUAL_OVERRIDE_SECONDS):
        raise PricingError("Manual override must expire within 24 hours")
    ask = positive_decimal("ask_idr_per_usdt", ask_idr_per_usdt)
    bid = positive_decimal("bid_idr_per_usdt", bid_idr_per_usdt)
    if bid >= ask:
        raise PricingError("Manual bid must be lower than ask")
    _advisory_xact_lock(db)
    replay = db.query(FxMarketSnapshot).filter_by(operation_key=idempotency_key.strip()).first()
    if replay is not None:
        if replay.payload_hash != _payload_hash(raw_payload := {
            "ask": str(ask), "bid": str(bid), "expires_at": expiry.isoformat(),
            "reason": reason.strip(), "actor_id": actor_id,
        }):
            raise PricingConflict("Manual FX idempotency key was reused with another payload")
        return replay
    current_publication = latest_publication(db)
    actual_publication = current_publication.version if current_publication else 0
    if actual_publication != expected_publication_version:
        raise PricingConflict("Catalog publication version changed")
    latest = latest_fx_snapshot(db)
    raw_payload = {
        "ask": str(ask), "bid": str(bid), "expires_at": expiry.isoformat(),
        "reason": reason.strip(), "actor_id": actor_id,
    }
    snapshot = FxMarketSnapshot(
        version=(latest.version if latest else 0) + 1,
        source_code="ADMIN_TIME_BOUNDED_OVERRIDE",
        pair_id="usdtidr",
        ask_idr_per_usdt=ask,
        best_ask_idr_per_usdt=ask,
        bid_idr_per_usdt=bid,
        last_idr_per_usdt=None,
        provider_server_time=None,
        observed_at=current_time,
        fresh_until=expiry,
        stale_until=expiry,
        source_status="MANUAL",
        accepted_notional_usdt=Decimal("0"),
        acceptance_method="ADMIN_TIME_BOUNDED_OVERRIDE_V1",
        change_bps_from_previous=None,
        is_manual_override=True,
        override_expires_at=expiry,
        payload_hash=_payload_hash(raw_payload),
        operation_key=idempotency_key.strip(),
        source_reference="admin://time-bounded-fx-override",
        raw_payload=raw_payload,
        created_by_admin_id=actor_id,
        reason=reason.strip(),
    )
    db.add(snapshot)
    db.flush()
    before_fx = db.get(FxMarketSnapshot, current_publication.fx_snapshot_id) if current_publication else None
    publication = _publish_fx_revision_if_catalog_exists(
        db, snapshot, reason=f"Manual FX override: {reason.strip()}", actor_id=actor_id
    )
    db.add(AdminAction(
        admin_user_id=actor_id,
        action_type="PRICE_FX_OVERRIDE_CREATED",
        entity_type="fx_market_snapshot",
        entity_id=snapshot.id,
        comment=reason.strip(),
        idempotency_key=f"admin:{idempotency_key.strip()}",
        details={
            "before_fx_version": before_fx.version if before_fx else None,
            "fx_version": snapshot.version,
            "publication_version": publication.version if publication else None,
            "expires_at": expiry.isoformat(),
        },
    ))
    return snapshot


def _validated_items(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    skus: set[str] = set()
    for index, item in enumerate(items):
        entity_type = str(item.get("entity_type", "")).upper().strip()
        entity_key = str(item.get("entity_key", "")).strip()
        option_code = str(item.get("option_code", "")).strip()
        identity = (entity_type, entity_key, option_code)
        if entity_type not in {"VISA", "SERVICE"} or not entity_key or not option_code:
            raise PricingError(f"Catalog item {index} has invalid identity")
        sku = str(item.get("sku") or f"{entity_type.lower()}:{entity_key}:{option_code}").strip()
        if sku in skus:
            raise PricingError(f"Duplicate catalog SKU {sku}")
        skus.add(sku)
        label_ru = str(item.get("label_ru", "")).strip()
        label_en = str(item.get("label_en", "")).strip()
        if not label_ru or not label_en:
            raise PricingError(f"Catalog item {identity} requires RU and EN labels")
        qualifier = str(item.get("price_qualifier", "")).upper().strip()
        if qualifier not in {"EXACT", "FROM", "VARIABLE", "CONTACT"}:
            raise PricingError(f"Catalog item {identity} has invalid price qualifier")
        fee_status = str(item.get("fee_verification_status", "")).upper().strip()
        if fee_status not in {"VERIFIED", "NEEDS_VERIFICATION"}:
            raise PricingError(f"Catalog item {identity} has invalid fee verification status")
        raw_amount = item.get("amount_idr")
        if qualifier in {"EXACT", "FROM"}:
            amount_decimal = positive_decimal("amount_idr", raw_amount)
            if amount_decimal != amount_decimal.quantize(Decimal("1")):
                raise PricingError(f"Catalog item {identity} IDR amount must be an integer")
            amount_idr: Optional[int] = int(amount_decimal)
        else:
            if raw_amount not in (None, ""):
                raise PricingError(f"Catalog item {identity} must not invent an amount")
            amount_idr = None
        show_price = bool(item.get("show_price", qualifier in {"EXACT", "FROM"}))
        if show_price and (amount_idr is None or fee_status != "VERIFIED"):
            raise PricingError(f"Catalog item {identity} is not verified for publication")
        normalized.append({
            "sku": sku,
            "entity_type": entity_type,
            "entity_key": entity_key,
            "option_code": option_code,
            "label_ru": label_ru,
            "label_en": label_en,
            "price_qualifier": qualifier,
            "amount_idr": amount_idr,
            "show_price": show_price,
            "fee_verification_status": fee_status,
            "fee_note_ru": str(item["fee_note_ru"]).strip() if item.get("fee_note_ru") else None,
            "fee_note_en": str(item["fee_note_en"]).strip() if item.get("fee_note_en") else None,
            "sort_order": int(item.get("sort_order", index * 10)),
        })
    if not normalized:
        raise PricingError("Catalog must contain at least one priced item")
    return normalized


def preview_catalog(items: Iterable[dict[str, Any]], fx: FxMarketSnapshot) -> dict[str, Any]:
    normalized = _validated_items(items)
    return {
        "currency": "IDR",
        "fx_version": fx.version,
        "fx_ask_idr_per_usdt": str(fx.ask_idr_per_usdt),
        "formula_code": FORMULA_CODE,
        "items": [
            item | {
                "amount_idr": str(item["amount_idr"]) if item["amount_idr"] is not None else None,
                "display_usdt": str(idr_to_usdt(item["amount_idr"], fx.ask_idr_per_usdt)) if item["amount_idr"] is not None else None,
            }
            for item in normalized
        ],
    }


def publish_catalog(
    db: Session,
    *,
    items: Iterable[dict[str, Any]],
    expected_publication_version: int,
    effective_from: datetime,
    reason: str,
    idempotency_key: str,
    actor_id: int,
    restored_from_version_id: Optional[int] = None,
    now: Optional[datetime] = None,
) -> CatalogPublication:
    if len(reason.strip()) < 3 or len(idempotency_key.strip()) < 8:
        raise PricingError("Reason and idempotency key are required")
    current_time = aware_utc(now or utc_now())
    effective = aware_utc(effective_from)
    if effective > current_time + timedelta(minutes=1):
        raise PricingError("Future catalog activation requires a scheduler")
    normalized = _validated_items(items)
    catalog_payload_hash = _payload_hash({
        "items": normalized,
        "effective_from": effective.isoformat(),
        "reason": reason.strip(),
        "actor_id": actor_id,
        "restored_from_version_id": restored_from_version_id,
    })
    _advisory_xact_lock(db)
    replay_catalog = db.query(PriceCatalogVersion).filter_by(idempotency_key=idempotency_key).first()
    if replay_catalog is not None:
        if replay_catalog.payload_hash != catalog_payload_hash:
            raise PricingConflict("Catalog idempotency key was reused with another payload")
        replay = db.query(CatalogPublication).filter_by(catalog_version_id=replay_catalog.id).order_by(CatalogPublication.version.asc()).first()
        if replay is None:
            raise PricingConflict("Catalog idempotency record has no publication")
        return replay
    current = latest_publication(db)
    actual = current.version if current else 0
    if actual != expected_publication_version:
        raise PricingConflict("Catalog publication version changed")
    current_fx_publication = latest_publication(db)
    fx = db.get(FxMarketSnapshot, current_fx_publication.fx_snapshot_id) if current_fx_publication else latest_fx_snapshot(db)
    if fx is None or current_time > aware_utc(fx.fresh_until):
        raise FxUnavailable("A fresh authoritative FX snapshot is required to publish")
    latest_catalog_version = db.query(func.max(PriceCatalogVersion.version)).scalar() or 0
    catalog = PriceCatalogVersion(
        version=latest_catalog_version + 1,
        currency="IDR",
        effective_from=effective,
        created_by_admin_id=actor_id,
        reason=reason.strip(),
        idempotency_key=idempotency_key.strip(),
        payload_hash=catalog_payload_hash,
        restored_from_version_id=restored_from_version_id,
        created_at=current_time,
    )
    db.add(catalog)
    db.flush()
    for item in normalized:
        db.add(PriceCatalogItem(catalog_version_id=catalog.id, **item))
    publication = CatalogPublication(
        version=actual + 1,
        catalog_version_id=catalog.id,
        fx_snapshot_id=fx.id,
        published_by_admin_id=actor_id,
        reason=reason.strip(),
        idempotency_key=f"publication:{idempotency_key.strip()}",
        published_at=current_time,
    )
    db.add(publication)
    db.flush()
    _activate_publication(db, publication)
    db.add(AdminAction(
        admin_user_id=actor_id,
        action_type="PRICE_CATALOG_PUBLISHED",
        entity_type="price_catalog_version",
        entity_id=catalog.id,
        comment=reason.strip(),
        idempotency_key=f"admin:{idempotency_key.strip()}",
        details={"catalog_version": catalog.version, "fx_version": fx.version, "publication_version": publication.version, "item_count": len(normalized)},
    ))
    return publication


def restore_catalog(
    db: Session,
    *,
    restore_catalog_version: int,
    expected_publication_version: int,
    reason: str,
    idempotency_key: str,
    actor_id: int,
    now: Optional[datetime] = None,
) -> CatalogPublication:
    replay_catalog = db.query(PriceCatalogVersion).filter_by(
        idempotency_key=idempotency_key.strip()
    ).first()
    if replay_catalog is not None:
        source_version = (
            db.get(PriceCatalogVersion, replay_catalog.restored_from_version_id)
            if replay_catalog.restored_from_version_id is not None
            else None
        )
        if (
            source_version is None
            or source_version.version != restore_catalog_version
            or replay_catalog.reason != reason.strip()
            or replay_catalog.created_by_admin_id != actor_id
        ):
            raise PricingConflict("Catalog restore idempotency key was reused with another payload")
        replay = db.query(CatalogPublication).filter_by(
            catalog_version_id=replay_catalog.id
        ).order_by(CatalogPublication.version.asc()).first()
        if replay is None:
            raise PricingConflict("Catalog restore idempotency record has no publication")
        return replay
    source = db.query(PriceCatalogVersion).filter_by(version=restore_catalog_version).first()
    if source is None:
        raise PricingError("Catalog version not found")
    rows = db.query(PriceCatalogItem).filter_by(catalog_version_id=source.id).order_by(PriceCatalogItem.sort_order, PriceCatalogItem.id).all()
    return publish_catalog(
        db,
        items=[{
            "sku": row.sku, "entity_type": row.entity_type, "entity_key": row.entity_key,
            "option_code": row.option_code, "label_ru": row.label_ru,
            "label_en": row.label_en, "amount_idr": row.amount_idr,
            "price_qualifier": row.price_qualifier,
            "show_price": row.show_price, "fee_note_ru": row.fee_note_ru,
            "fee_note_en": row.fee_note_en,
            "fee_verification_status": row.fee_verification_status,
            "sort_order": row.sort_order,
        } for row in rows],
        expected_publication_version=expected_publication_version,
        effective_from=aware_utc(now or utc_now()),
        reason=reason,
        idempotency_key=idempotency_key,
        actor_id=actor_id,
        restored_from_version_id=source.id,
        now=now,
    )


def projection_payload(db: Session, *, now: Optional[datetime] = None) -> dict[str, Any]:
    current_time = aware_utc(now or utc_now())
    publication = latest_publication(db)
    if publication is None:
        raise FxUnavailable("No price catalog has been published")
    catalog = db.get(PriceCatalogVersion, publication.catalog_version_id)
    fx = db.get(FxMarketSnapshot, publication.fx_snapshot_id)
    if catalog is None or fx is None:
        raise PricingError("Published catalog projection is incomplete")
    if current_time <= aware_utc(fx.fresh_until):
        fx_status = "fresh"
    elif current_time <= aware_utc(fx.stale_until):
        fx_status = "stale"
    else:
        fx_status = "unavailable"
    derived_allowed = fx_status != "unavailable"
    rows = db.query(PriceCatalogItem).filter_by(catalog_version_id=catalog.id).order_by(
        PriceCatalogItem.entity_type, PriceCatalogItem.entity_key,
        PriceCatalogItem.sort_order, PriceCatalogItem.id,
    ).all()
    return {
        "schema_version": 1,
        "projection_id": f"pricing-projection-v{publication.version}",
        "publication_version": publication.version,
        "catalog_version_id": catalog.id,
        "catalog_version": catalog.version,
        "fx_snapshot_id": fx.id,
        "formula_version": FORMULA_CODE,
        "accepted_at": aware_utc(fx.observed_at).isoformat(),
        "derived_expires_at": aware_utc(fx.stale_until).isoformat(),
        "max_refresh_lag_seconds": FX_FRESH_SECONDS,
        "published_at": aware_utc(publication.published_at).isoformat(),
        "currency": "IDR",
        "fx": {
            "version": fx.version,
            "pair": fx.pair_id,
            "source": fx.source_code,
            "status": fx_status,
            "ask_idr_per_usdt": str(fx.ask_idr_per_usdt) if derived_allowed else None,
            "observed_at": aware_utc(fx.observed_at).isoformat(),
            "fresh_until": aware_utc(fx.fresh_until).isoformat(),
            "stale_until": aware_utc(fx.stale_until).isoformat(),
            "is_manual_override": fx.is_manual_override,
            "formula_code": FORMULA_CODE,
        },
        "items": [{
            "sku": row.sku,
            "entity_type": row.entity_type,
            "entity_key": row.entity_key,
            "option_code": row.option_code,
            "label": {"ru": row.label_ru, "en": row.label_en},
            "price_qualifier": row.price_qualifier,
            "amount_idr": str(row.amount_idr) if row.show_price and row.amount_idr is not None else None,
            "show_price": row.show_price,
            "fee_verification_status": row.fee_verification_status,
            "fee_note": {"ru": row.fee_note_ru, "en": row.fee_note_en},
            "display_usdt": str(idr_to_usdt(row.amount_idr, fx.ask_idr_per_usdt)) if derived_allowed and row.show_price and row.amount_idr is not None else None,
            "sort_order": row.sort_order,
        } for row in rows],
    }


def create_commercial_snapshot(
    db: Session,
    *,
    entity_type: str,
    entity_key: str,
    option_code: str,
    now: Optional[datetime] = None,
) -> CommercialPriceSnapshot:
    publication = latest_publication(db)
    if publication is None:
        raise PricingError("No catalog publication is available")
    fx = db.get(FxMarketSnapshot, publication.fx_snapshot_id)
    if fx is None:
        raise PricingError("Published FX snapshot is missing")
    item = db.query(PriceCatalogItem).filter_by(
        catalog_version_id=publication.catalog_version_id,
        entity_type=entity_type.upper(),
        entity_key=entity_key,
        option_code=option_code,
    ).first()
    if item is None:
        raise PricingError("Published price item is not available")
    current_time = aware_utc(now or utc_now())
    priced = item.price_qualifier in {"EXACT", "FROM"}
    if priced and current_time > aware_utc(fx.stale_until):
        raise FxUnavailable("Published FX projection has expired")
    derived = idr_to_usdt(item.amount_idr, fx.ask_idr_per_usdt) if priced else None
    display_idr = (
        f"Rp {int(item.amount_idr):,}".replace(",", ".")
        if item.amount_idr is not None else "Price on request"
    )
    snapshot = CommercialPriceSnapshot(
        publication_id=publication.id,
        catalog_version_id=publication.catalog_version_id,
        fx_snapshot_id=fx.id,
        entity_type=item.entity_type,
        entity_key=item.entity_key,
        option_code=item.option_code,
        sku=item.sku,
        price_qualifier=item.price_qualifier,
        amount_idr=item.amount_idr,
        fx_ask_idr_per_usdt=fx.ask_idr_per_usdt if priced else None,
        display_usdt=derived,
        formula_code=FORMULA_CODE,
        fee_verification_status=item.fee_verification_status,
        fee_note_ru=item.fee_note_ru,
        fee_note_en=item.fee_note_en,
        display_idr=display_idr,
        display_usdt_text=f"{derived} USDT" if derived is not None else None,
    )
    db.add(snapshot)
    db.flush()
    return snapshot
