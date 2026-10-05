from copy import deepcopy
from argparse import Namespace
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi import Response

from app.api.catalog_pricing import public_pricing
from app.models.catalog_pricing import CommercialPriceSnapshot, FxMarketSnapshot, PriceCatalogItem
from app.services.catalog_compositions import catalog_compositions, with_catalog_compositions
from app.services.catalog_pricing import (
    create_commercial_snapshot, idr_to_usd_approx, projection_payload, publish_catalog,
)
from app.services.extension_pricing import merge_extension_items
from tests.test_catalog_pricing import NOW, admin, database, fx_row


@pytest.fixture
def catalog():
    db = database()
    actor, fx = admin(db), fx_row(db)
    initial = [{
        "sku": "visa:C1:standard", "entity_type": "VISA", "entity_key": "C1", "option_code": "standard",
        "label_ru": "C1", "label_en": "C1", "price_qualifier": "EXACT", "amount_idr": 2_000_000,
        "show_price": True, "fee_verification_status": "VERIFIED", "sort_order": 10,
    }, {
        "sku": "service:visa-extension:default", "entity_type": "SERVICE", "entity_key": "visa-extension",
        "option_code": "default", "label_ru": "Продление", "label_en": "Extension",
        "price_qualifier": "CONTACT", "amount_idr": None, "show_price": False,
        "fee_verification_status": "NEEDS_VERIFICATION", "sort_order": 10,
    }]
    authored = merge_extension_items(initial)
    publish_catalog(db, items=authored, expected_publication_version=0, effective_from=NOW,
                    reason="Synthetic composite inputs", idempotency_key="composites-initial",
                    actor_id=actor.id, now=NOW)
    db.commit()
    try:
        yield db, actor, fx, authored
    finally:
        db.close()
        db.bind.dispose()


def test_five_explicit_recipes_share_source_versions_and_leave_input_untouched(catalog):
    db, actor, fx, authored = catalog
    projection = projection_payload(db, now=NOW)
    before = deepcopy(projection)
    all_rows = catalog_compositions(projection, now=NOW)
    rows = all_rows[:5]
    assert [row["recipe_code"] for row in all_rows[5:]] == ["d1-extension-x2", "d2-extension-x2"]
    assert all(row["show_price"] is False and row["amount_idr"] is None for row in all_rows[5:])
    assert [row["recipe_code"] for row in rows] == [
        "c1-issuance-plus-1-extension", "c1-issuance-plus-2-extensions",
        "c1-extension-x1", "c1-extension-x2", "c1-extension-x3",
    ]
    assert [row["amount_idr"] for row in rows] == ["4000000", "6000000", "2000000", "4000000", "6000000"]
    for row in rows:
        assert row["show_price"] is True
        assert row["publication_version"] == projection["publication_version"]
        assert row["catalog_version"] == projection["catalog_version"]
        assert row["fx_version"] == projection["fx"]["version"]
        assert row["projection_id"] == projection["projection_id"]
        assert row["derived_expires_at"] == projection["derived_expires_at"]
        assert row["display_usd_approx"] == str(idr_to_usd_approx(row["amount_idr"], fx.ask_idr_per_usdt))
    assert projection == before
    assert db.query(FxMarketSnapshot).count() == 1


@pytest.mark.parametrize("seconds,allowed,status", [(0, True, "fresh"), (61, True, "stale"),
                                                     (900, True, "stale"), (901, False, "unavailable")])
def test_compositions_follow_existing_ttl_stale_boundary(catalog, seconds, allowed, status):
    db, actor, fx, authored = catalog
    now = NOW + timedelta(seconds=seconds)
    rows = catalog_compositions(projection_payload(db, now=now), now=now)
    for row in rows[:5]:
        assert row["amount_idr"] is not None
        assert (row["display_usd_approx"] is not None) is allowed
        assert (row["display_usdt"] is not None) is allowed
        assert row["fx_status"] == status


@pytest.mark.parametrize("kind", ["missing", "duplicate", "hidden", "unverified", "from", "wrong-option"])
def test_exact_component_identity_or_eligibility_failure_never_falls_back(catalog, kind):
    db, actor, fx, authored = catalog
    projection = projection_payload(db, now=NOW)
    extension = next(row for row in projection["items"] if row["option_code"] == "c1-extension")
    if kind == "missing":
        projection["items"].remove(extension)
    elif kind == "duplicate":
        projection["items"].append({**extension, "sku": "another-sku-same-identity"})
    elif kind == "hidden":
        extension["show_price"] = False
    elif kind == "unverified":
        extension["fee_verification_status"] = "NEEDS_VERIFICATION"
    elif kind == "from":
        extension["price_qualifier"] = "FROM"
    else:
        extension["option_code"] = "some-other-extension"
    for row in catalog_compositions(projection, now=NOW):
        assert row["show_price"] is False
        assert row["amount_idr"] is row["display_usd_approx"] is row["display_usdt"] is None
        assert row["unavailable_reason"] == "COMPONENT_UNAVAILABLE"


def test_admin_price_publication_recalculates_total_before_rounding_and_preserves_snapshot(catalog):
    db, actor, fx, authored = catalog
    snapshot = create_commercial_snapshot(db, entity_type="VISA", entity_key="C1", option_code="standard", now=NOW)
    db.commit()
    db.refresh(snapshot)
    before = {column.name: getattr(snapshot, column.name) for column in CommercialPriceSnapshot.__table__.columns}
    original_ids = [row.id for row in db.query(PriceCatalogItem).filter_by(catalog_version_id=1)]
    changed = deepcopy(authored)
    for item in changed:
        if item["sku"] in {"visa:C1:standard", "service:visa-extension:c1-extension"}:
            item["amount_idr"] = 2_030_000
    publish_catalog(db, items=changed, expected_publication_version=1, effective_from=NOW,
                    reason="Synthetic Admin update", idempotency_key="composites-admin-change", actor_id=actor.id, now=NOW)
    db.commit()
    projection = projection_payload(db, now=NOW)
    first = catalog_compositions(projection, now=NOW)[0]
    assert first["amount_idr"] == "4060000"
    assert first["display_usd_approx"] == "225"
    assert Decimal(first["display_usd_approx"]) != 2 * idr_to_usd_approx(2_030_000, fx.ask_idr_per_usdt)
    assert first["catalog_version"] == 2
    assert [row.id for row in db.query(PriceCatalogItem).filter_by(catalog_version_id=1)] == original_ids
    db.expire(snapshot)
    assert {column.name: getattr(snapshot, column.name) for column in CommercialPriceSnapshot.__table__.columns} == before


def test_public_api_adds_compositions_without_changing_existing_projection_contract(catalog):
    db, actor, fx, authored = catalog
    payload = projection_payload(db, now=NOW)
    response = Response()
    with patch("app.api.catalog_pricing.SessionLocal", return_value=db), patch(
        "app.api.catalog_pricing.projection_payload", return_value=deepcopy(payload),
    ):
        result = public_pricing(response)
    assert len(result["compositions"]) == 7
    assert {key: value for key, value in result.items() if key != "compositions"} == payload
    assert response.headers["X-Pricing-Projection"] == payload["projection_id"]
    assert response.headers["Cache-Control"] == "no-store, max-age=0"


def test_scoped_cli_strict_parity_uses_same_enriched_projection(catalog):
    from app.scripts.publish_extension_prices import SafetyError, execute
    db, actor, fx, authored = catalog
    # Use an existing-only publication so the scoped extension CLI can add two.
    original = [item for item in authored if item["option_code"] not in {"c1-extension", "voa-extension"}]
    publish_catalog(db, items=original, expected_publication_version=1, effective_from=NOW,
                    reason="Synthetic unextended baseline", idempotency_key="composite-cli-base", actor_id=actor.id, now=NOW)
    db.commit()
    args = Namespace(projection_url="http://127.0.0.1:8000/api/catalog/pricing", apply=False,
                     actor_user_id=None, expected_catalog_hash=None, expected_publication_version=None)
    loader = lambda url: with_catalog_compositions(projection_payload(db, now=NOW), now=NOW)
    result = execute(db, args, root_telegram_id=100, projection_loader=loader, now=NOW)
    assert result["mode"] == "DRY_RUN"
    with pytest.raises(SafetyError, match="differs_from_database"):
        execute(db, args, root_telegram_id=100,
                projection_loader=lambda url: projection_payload(db, now=NOW), now=NOW)
