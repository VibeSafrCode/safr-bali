import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.catalog_pricing import (
    CatalogPublicationPointer,
    CommercialPriceSnapshot,
    FxMarketSnapshot,
    PriceCatalogItem,
    PriceCatalogVersion,
)
from app.models.user import User
from app.models.order import Order
from app.models.service import Service
from app.api.orders import OrderCreateRequest, create_order
from app.services.catalog_pricing import (
    FORMULA_CODE,
    USD_APPROX_FORMULA_CODE,
    IndodaxObservation,
    FxUnavailable,
    PricingConflict,
    PricingError,
    create_commercial_snapshot,
    create_manual_fx_override,
    idr_to_usdt,
    idr_to_usd_approx,
    parse_indodax_observation,
    projection_payload,
    preview_catalog,
    publish_catalog,
    refresh_fx_snapshot,
    restore_catalog,
    usdt_to_canonical_idr,
)


NOW = datetime(2026, 8, 31, 12, 0, tzinfo=timezone.utc)


def database():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def admin(db):
    row = User(
        telegram_id=100,
        ref_code="pricing-root",
        role="admin",
        status="active",
        locale="ru",
    )
    db.add(row)
    db.flush()
    return row


def observation_payload(now=NOW, *, sell=None, buy=None):
    return (
        [{"id": "btcidr"}, {"id": "usdtidr", "symbol": "USDT/IDR"}],
        {
            "sell": sell or [["18100", "1000"], ["18000", "1000"], ["18200", "500"]],
            "buy": buy or [["17800", "100"], ["17900", "3000"]],
        },
        {"server_time": int(now.timestamp() * 1000)},
    )


def fx_row(db, *, version=1, ask=Decimal("18050"), now=NOW, manual=False):
    row = FxMarketSnapshot(
        version=version,
        source_code="TEST" if not manual else "ADMIN_TIME_BOUNDED_OVERRIDE",
        pair_id="usdtidr",
        ask_idr_per_usdt=ask,
        best_ask_idr_per_usdt=Decimal("18000"),
        bid_idr_per_usdt=Decimal("17900"),
        last_idr_per_usdt=None,
        provider_server_time=now,
        observed_at=now,
        fresh_until=now + timedelta(seconds=60),
        stale_until=now + timedelta(minutes=15),
        source_status="MANUAL" if manual else "LIVE",
        accepted_notional_usdt=Decimal("2000") if not manual else Decimal("0"),
        acceptance_method="TEST",
        change_bps_from_previous=None,
        is_manual_override=manual,
        override_expires_at=now + timedelta(hours=1) if manual else None,
        payload_hash=f"{version:064d}",
        operation_key=None,
        source_reference="test://fixture",
        raw_payload={},
    )
    db.add(row)
    db.flush()
    return row


def items():
    return [
        {
            "sku": "visa:E33G:standard",
            "entity_type": "VISA",
            "entity_key": "E33G",
            "option_code": "standard",
            "label_ru": "Стандарт",
            "label_en": "Standard",
            "price_qualifier": "EXACT",
            "amount_idr": 12_000_000,
            "show_price": True,
            "fee_verification_status": "VERIFIED",
            "sort_order": 10,
        },
        {
            "sku": "service:housing:default",
            "entity_type": "SERVICE",
            "entity_key": "housing",
            "option_code": "default",
            "label_ru": "Подбор жилья",
            "label_en": "Housing search",
            "price_qualifier": "CONTACT",
            "amount_idr": None,
            "show_price": False,
            "fee_verification_status": "NEEDS_VERIFICATION",
            "sort_order": 10,
        },
    ]


def test_depth_vwap_semantics_and_rounding_are_decimal_safe():
    pairs, depth, server = observation_payload()
    result = parse_indodax_observation(pairs, depth, server, observed_at=NOW)
    assert result.best_ask == Decimal("18000")
    assert result.ask == Decimal("18050")
    assert result.bid == Decimal("17900")
    assert idr_to_usdt(12_000_000, result.ask) == Decimal("664.82")
    assert usdt_to_canonical_idr("664.82", result.ask) == Decimal("12001000")
    assert usdt_to_canonical_idr("1.0001", result.ask) == Decimal("19000")


@pytest.mark.parametrize("amount, ask, expected", [
    (12_000_000, "18050", "665"),
    (1_324_999, "2000", "660"),  # 662.4995, before any cent rounding.
    (1_325_000, "2000", "665"),  # Exact halfway rounds up, not half-even.
    (1_325_001, "2000", "665"),
    (800_000, "20000", "40"),  # eVOA must not regain fixed legacy $50.
    (1, "1", "0"),
])
def test_approximate_dollars_round_raw_ratio_half_up_to_nearest_five(amount, ask, expected):
    assert idr_to_usd_approx(amount, ask) == Decimal(expected)
    assert str(idr_to_usd_approx(amount, ask)) == expected


def test_approximate_dollars_do_not_double_round_cent_display():
    assert idr_to_usdt(1_324_999, "2000") == Decimal("662.50")
    assert idr_to_usd_approx(1_324_999, "2000") == Decimal("660")


@pytest.mark.parametrize("amount, ask", [
    (0, "18000"), (-1, "18000"), (1000, "0"), (1000, "NaN"),
    (1000, "Infinity"), (1000, None),
])
def test_approximate_dollars_reject_invalid_source_values(amount, ask):
    with pytest.raises(PricingError):
        idr_to_usd_approx(amount, ask)


@pytest.mark.parametrize("amount, ask, exact, approximate", [
    (12_000_000, "18050", "664.82", "665"),
    (13_249_990, "20000", "662.50", "660"),  # Projection must not double round.
])
def test_approximate_projection_and_preview_preserve_exact_commercial_snapshot(amount, ask, exact, approximate):
    db = database()
    root = admin(db)
    fx = fx_row(db, ask=Decimal(ask))
    catalog_items = items()
    catalog_items[0]["amount_idr"] = amount
    publish_catalog(
        db, items=catalog_items, expected_publication_version=0, effective_from=NOW,
        reason="Approximate reference contract", idempotency_key="approximate-reference-contract",
        actor_id=root.id, now=NOW,
    )
    snapshot = create_commercial_snapshot(
        db, entity_type="VISA", entity_key="E33G", option_code="standard", now=NOW,
    )
    db.commit()
    payload = projection_payload(db, now=NOW)
    preview = preview_catalog(catalog_items, fx, now=NOW)
    for result in (payload, preview):
        assert result["display_usd_approx_formula_version"] == USD_APPROX_FORMULA_CODE
        visa = next(item for item in result["items"] if item["entity_type"] == "VISA")
        assert visa["amount_idr"] == str(amount)
        assert visa["display_usdt"] == exact
        assert visa["display_usd_approx"] == approximate
        contact = next(item for item in result["items"] if item["entity_type"] == "SERVICE")
        assert contact["display_usd_approx"] is None
    assert payload["formula_version"] == preview["formula_code"] == FORMULA_CODE
    db.refresh(snapshot)
    assert snapshot.amount_idr == amount
    assert snapshot.display_usdt == Decimal(exact)
    assert snapshot.display_usdt_text == f"{exact} USDT"
    assert snapshot.formula_code == FORMULA_CODE
    assert snapshot.fx_snapshot_id == fx.id
    assert db.query(CommercialPriceSnapshot).count() == 1
    assert db.query(PriceCatalogVersion).count() == 1


@pytest.mark.parametrize("seconds, allowed", [(0, True), (61, True), (900, True), (900.000001, False)])
def test_preview_expiry_hides_both_references_and_preserves_idr(seconds, allowed):
    db = database()
    fx = fx_row(db)
    preview = preview_catalog(items(), fx, now=NOW + timedelta(seconds=seconds))
    assert preview["derived_expires_at"] == (NOW + timedelta(minutes=15)).isoformat()
    visa = next(item for item in preview["items"] if item["entity_type"] == "VISA")
    assert visa["amount_idr"] == "12000000"
    assert visa["display_usdt"] == ("664.82" if allowed else None)
    assert visa["display_usd_approx"] == ("665" if allowed else None)


def test_preview_never_extends_a_shorter_manual_override_expiry():
    db = database()
    fx = fx_row(db, manual=True)
    fx.override_expires_at = NOW + timedelta(seconds=30)
    # Defensive fixture: a later stale_until must not extend the override.
    preview = preview_catalog(items(), fx, now=NOW + timedelta(seconds=31))
    assert preview["derived_expires_at"] == fx.override_expires_at.isoformat()
    visa = next(item for item in preview["items"] if item["entity_type"] == "VISA")
    assert visa["amount_idr"] == "12000000"
    assert visa["display_usdt"] is None
    assert visa["display_usd_approx"] is None


def test_depth_rejects_empty_thin_crossed_and_clock_skew():
    pairs, _, server = observation_payload()
    with pytest.raises(PricingError, match="empty"):
        parse_indodax_observation(pairs, {"sell": [], "buy": []}, server, observed_at=NOW)
    with pytest.raises(PricingError, match="insufficient"):
        parse_indodax_observation(
            pairs, {"sell": [["18000", "10"]], "buy": [["17900", "10"]]}, server, observed_at=NOW
        )
    with pytest.raises(PricingError, match="crossed"):
        parse_indodax_observation(
            pairs, {"sell": [["18000", "2000"]], "buy": [["18000", "2000"]]}, server, observed_at=NOW
        )
    with pytest.raises(PricingError, match="clock"):
        parse_indodax_observation(
            pairs,
            {"sell": [["18000", "2000"]], "buy": [["17900", "2000"]]},
            {"server_time": int((NOW - timedelta(minutes=6)).timestamp() * 1000)},
            observed_at=NOW,
        )
    with pytest.raises(PricingError, match="server_time"):
        parse_indodax_observation(
            pairs,
            {"sell": [["18000", "2000"]], "buy": [["17900", "2000"]]},
            {"server_time": int(NOW.timestamp())},
            observed_at=NOW,
        )


def test_atomic_publication_projection_expiry_and_rollback_as_new_version():
    db = database()
    root = admin(db)
    fx = fx_row(db)
    first = publish_catalog(
        db,
        items=items(),
        expected_publication_version=0,
        effective_from=NOW,
        reason="Initial verified parity import",
        idempotency_key="catalog-initial-0001",
        actor_id=root.id,
        now=NOW,
    )
    db.commit()
    pointer = db.get(CatalogPublicationPointer, 1)
    assert pointer.publication_id == first.id
    payload = projection_payload(db, now=NOW + timedelta(seconds=61))
    assert payload["projection_id"] == "pricing-projection-v1"
    assert payload["fx"]["status"] == "stale"
    assert payload["items"][1]["amount_idr"] == "12000000"
    assert payload["items"][1]["display_usd_approx"] == "665"
    boundary = projection_payload(db, now=NOW + timedelta(minutes=15))
    assert boundary["items"][1]["display_usd_approx"] == "665"
    expired = projection_payload(db, now=NOW + timedelta(minutes=15, seconds=1))
    assert expired["fx"]["status"] == "unavailable"
    assert expired["items"][1]["display_usdt"] is None
    assert expired["items"][1]["display_usd_approx"] is None
    assert expired["items"][1]["amount_idr"] == "12000000"
    second = restore_catalog(
        db,
        restore_catalog_version=1,
        expected_publication_version=1,
        reason="Rollback creates a new immutable version",
        idempotency_key="catalog-restore-0002",
        actor_id=root.id,
        now=NOW + timedelta(seconds=30),
    )
    db.commit()
    replay = restore_catalog(
        db,
        restore_catalog_version=1,
        expected_publication_version=1,
        reason="Rollback creates a new immutable version",
        idempotency_key="catalog-restore-0002",
        actor_id=root.id,
        now=NOW + timedelta(minutes=5),
    )
    assert second.version == 2
    assert replay.id == second.id
    assert db.query(PriceCatalogVersion).count() == 2
    assert db.get(CatalogPublicationPointer, 1).publication_id == second.id


def test_catalog_idempotency_binds_payload_and_contact_snapshot_is_complete():
    db = database()
    root = admin(db)
    fx_row(db)
    first = publish_catalog(
        db,
        items=items(),
        expected_publication_version=0,
        effective_from=NOW,
        reason="Initial verified parity import",
        idempotency_key="catalog-initial-0001",
        actor_id=root.id,
        now=NOW,
    )
    replay = publish_catalog(
        db,
        items=items(),
        expected_publication_version=0,
        effective_from=NOW,
        reason="Initial verified parity import",
        idempotency_key="catalog-initial-0001",
        actor_id=root.id,
        now=NOW,
    )
    assert replay.id == first.id
    changed = items()
    changed[0]["amount_idr"] = 13_000_000
    with pytest.raises(PricingConflict, match="reused"):
        publish_catalog(
            db,
            items=changed,
            expected_publication_version=1,
            effective_from=NOW,
            reason="Initial verified parity import",
            idempotency_key="catalog-initial-0001",
            actor_id=root.id,
            now=NOW,
        )
    snapshot = create_commercial_snapshot(
        db, entity_type="SERVICE", entity_key="housing", option_code="default", now=NOW
    )
    assert snapshot.price_qualifier == "CONTACT"
    assert snapshot.amount_idr is None
    assert snapshot.display_usdt is None
    assert snapshot.formula_code == FORMULA_CODE


def test_exact_snapshot_fails_closed_after_derived_expiry():
    db = database()
    root = admin(db)
    fx_row(db)
    publish_catalog(
        db,
        items=items(),
        expected_publication_version=0,
        effective_from=NOW,
        reason="Initial verified parity import",
        idempotency_key="catalog-initial-0001",
        actor_id=root.id,
        now=NOW,
    )
    with pytest.raises(FxUnavailable, match="expired"):
        create_commercial_snapshot(
            db,
            entity_type="VISA",
            entity_key="E33G",
            option_code="standard",
            now=NOW + timedelta(minutes=16),
        )


def test_manual_override_is_bounded_idempotent_and_optimistic():
    db = database()
    root = admin(db)
    fx_row(db)
    publish_catalog(
        db,
        items=items(),
        expected_publication_version=0,
        effective_from=NOW,
        reason="Initial verified parity import",
        idempotency_key="catalog-initial-0001",
        actor_id=root.id,
        now=NOW,
    )
    override = create_manual_fx_override(
        db,
        ask_idr_per_usdt="18100",
        bid_idr_per_usdt="18000",
        expires_at=NOW + timedelta(hours=1),
        reason="Temporary provider investigation",
        actor_id=root.id,
        expected_publication_version=1,
        idempotency_key="fx-override-0001",
        now=NOW,
    )
    replay = create_manual_fx_override(
        db,
        ask_idr_per_usdt="18100",
        bid_idr_per_usdt="18000",
        expires_at=NOW + timedelta(hours=1),
        reason="Temporary provider investigation",
        actor_id=root.id,
        expected_publication_version=1,
        idempotency_key="fx-override-0001",
        now=NOW,
    )
    assert replay.id == override.id
    assert projection_payload(db, now=NOW)["fx"]["is_manual_override"] is True
    with pytest.raises(PricingError, match="24 hours"):
        create_manual_fx_override(
            db,
            ask_idr_per_usdt="18100",
            bid_idr_per_usdt="18000",
            expires_at=NOW + timedelta(hours=25),
            reason="Too long override",
            actor_id=root.id,
            expected_publication_version=2,
            idempotency_key="fx-override-too-long",
            now=NOW,
        )


def test_database_constraints_reject_unpriced_exact_item():
    db = database()
    root = admin(db)
    catalog = PriceCatalogVersion(
        version=1,
        currency="IDR",
        effective_from=NOW,
        created_by_admin_id=root.id,
        reason="constraint fixture",
        idempotency_key="constraint-catalog",
        payload_hash="0" * 64,
    )
    db.add(catalog)
    db.flush()
    db.add(PriceCatalogItem(
        catalog_version_id=catalog.id,
        sku="bad",
        entity_type="VISA",
        entity_key="BAD",
        option_code="bad",
        label_ru="Bad",
        label_en="Bad",
        price_qualifier="EXACT",
        amount_idr=None,
        show_price=True,
        fee_verification_status="VERIFIED",
        sort_order=0,
    ))
    with pytest.raises(IntegrityError):
        db.flush()


def test_fx_refresh_returns_immediately_when_writer_lock_is_busy():
    db = database()
    current = fx_row(db, ask=Decimal("18000"))
    db.commit()
    observation = IndodaxObservation(
        ask=Decimal("18100"),
        best_ask=Decimal("18050"),
        bid=Decimal("18000"),
        provider_server_time=NOW + timedelta(seconds=61),
        observed_at=NOW + timedelta(seconds=61),
        raw_payload={"candidate": "concurrent"},
    )

    with (
        patch(
            "app.services.catalog_pricing.fetch_indodax_observation",
            AsyncMock(return_value=observation),
        ),
        patch(
            "app.services.catalog_pricing._try_advisory_xact_lock",
            return_value=False,
        ),
    ):
        snapshot, status = asyncio.run(
            refresh_fx_snapshot(db, now=NOW + timedelta(seconds=61), force=True)
        )

    assert snapshot.id == current.id
    assert status == "REFRESH_BUSY"
    assert db.query(FxMarketSnapshot).count() == 1


def test_fx_anomaly_breaker_and_catalog_optimistic_lock_fail_closed():
    db = database()
    root = admin(db)
    fx_row(db, ask=Decimal("18000"))
    publish_catalog(
        db,
        items=items(),
        expected_publication_version=0,
        effective_from=NOW,
        reason="Initial verified parity import",
        idempotency_key="catalog-initial-0001",
        actor_id=root.id,
        now=NOW,
    )
    db.commit()
    with pytest.raises(PricingConflict, match="version changed"):
        publish_catalog(
            db,
            items=items(),
            expected_publication_version=0,
            effective_from=NOW,
            reason="Stale editor write",
            idempotency_key="catalog-stale-0002",
            actor_id=root.id,
            now=NOW,
        )
    observation = IndodaxObservation(
        ask=Decimal("20000"),
        best_ask=Decimal("19900"),
        bid=Decimal("19800"),
        provider_server_time=NOW + timedelta(seconds=61),
        observed_at=NOW + timedelta(seconds=61),
        raw_payload={"candidate": "anomalous"},
    )
    with (
        patch(
            "app.services.catalog_pricing.fetch_indodax_observation",
            AsyncMock(return_value=observation),
        ),
        pytest.raises(FxUnavailable, match="anomaly"),
    ):
        asyncio.run(refresh_fx_snapshot(db, now=NOW + timedelta(seconds=61), force=True))
    assert db.query(FxMarketSnapshot).count() == 1


def test_order_creation_freezes_price_and_binds_idempotency_payload():
    db = database()
    root = admin(db)
    client = User(telegram_id=101, ref_code="pricing-client", role="client", status="active")
    service = Service(name="Housing", slug="housing", category="housing", is_active=True)
    db.add_all([client, service])
    db.flush()
    client_id, service_id = client.id, service.id
    fx_row(db)
    publish_catalog(
        db,
        items=items(),
        expected_publication_version=0,
        effective_from=NOW,
        reason="Initial verified parity import",
        idempotency_key="catalog-initial-0001",
        actor_id=root.id,
        now=NOW,
    )
    db.commit()
    Session = sessionmaker(bind=db.get_bind(), expire_on_commit=False)
    payload = OrderCreateRequest(user_id=client_id, service_id=service_id)
    with (
        patch("app.api.orders.SessionLocal", Session),
        patch("app.api.orders.settings.CANONICAL_PRICING_ENFORCED", True),
    ):
        first = create_order(payload, "order-create-0001")
        replay = create_order(payload, "order-create-0001")
        with pytest.raises(HTTPException) as mismatch:
            create_order(
                OrderCreateRequest(
                    user_id=client_id,
                    service_id=service_id,
                    client_comment="different",
                ),
                "order-create-0001",
            )
        with pytest.raises(HTTPException) as missing:
            create_order(payload, None)
    assert first["pricing_mode"] == "CANONICAL"
    assert first["commercial_price_snapshot_id"] is not None
    assert replay["id"] == first["id"]
    assert replay["idempotent_replay"] is True
    assert mismatch.value.status_code == 409
    assert missing.value.status_code == 400
    assert db.query(Order).count() == 1
    assert db.query(CommercialPriceSnapshot).count() == 1
