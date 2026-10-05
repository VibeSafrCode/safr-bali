"""Synthetic SQLite checks only; tariff preparation never publishes implicitly."""
from copy import deepcopy
from datetime import timedelta

import pytest
from sqlalchemy import event

from app.models.catalog_pricing import CommercialPriceSnapshot, FxMarketSnapshot, PriceCatalogItem, PriceCatalogVersion
from app.services.catalog_compositions import with_catalog_compositions
from app.services.catalog_pricing import (
    PricingConflict, PricingError, create_commercial_snapshot, idr_to_usd_approx,
    preview_catalog, projection_payload, publish_catalog, restore_catalog,
)
from app.services.extension_pricing import merge_extension_items
from app.services.next_stage_tariffs import merge_next_stage_tariffs, prepare_next_stage_tariffs
from tests.test_catalog_pricing import NOW, admin, database, fx_row, items


APPROVED = {
    ("SERVICE", "visa-extension", "d1-extension"): 2_500_000,
    ("SERVICE", "visa-extension", "d2-extension"): 2_500_000,
    ("SERVICE", "visa-extension", "e33g-extension"): 12_000_000,
    ("SERVICE", "consultation", "e33g-document-review"): 2_000_000,
    ("VISA", "E33G", "conversion-from-voa"): 17_000_000,
    ("VISA", "E33G", "conversion-from-kitas"): 17_500_000,
    ("VISA", "E33G", "conversion-from-c1"): 15_000_000,
    ("VISA", "E33G", "conversion-from-d12"): 17_000_000,
}


def identity(row):
    return row["entity_type"], row["entity_key"], row["option_code"]


def columns(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


def authored_rows(db):
    return [{key: value for key, value in columns(row).items() if key not in {"id", "catalog_version_id"}}
            for row in db.query(PriceCatalogItem).filter_by(catalog_version_id=1).order_by(PriceCatalogItem.id)]


@pytest.fixture
def published():
    db = database()
    actor, fx = admin(db), fx_row(db)
    initial = items()
    initial.extend({
        "sku": f"service:{key}:default", "entity_type": "SERVICE", "entity_key": key,
        "option_code": "default", "label_ru": "Существующий вариант", "label_en": "Existing option",
        "price_qualifier": "CONTACT", "amount_idr": None, "show_price": False,
        "fee_verification_status": "NEEDS_VERIFICATION", "sort_order": 10,
        "fee_note_ru": "Не менять", "fee_note_en": "Preserve this note",
    } for key in ("visa-extension", "consultation"))
    standard = initial[0]
    initial.extend([
        {**standard, "sku": "visa:E33G:express", "option_code": "express", "amount_idr": 14_000_000, "sort_order": 20},
        {**standard, "sku": "visa:C1:standard", "entity_key": "C1", "amount_idr": 2_000_000},
    ])
    publish_catalog(db, items=merge_extension_items(initial), expected_publication_version=0,
                    effective_from=NOW, reason="Synthetic complete current catalog",
                    idempotency_key="tariffs-original", actor_id=actor.id, now=NOW)
    db.commit()
    try:
        yield db, actor, fx
    finally:
        db.close()
        db.bind.dispose()


def publish(db, actor, draft, key="tariffs-next"):
    return publish_catalog(db, **draft, effective_from=NOW, reason="Approved next-stage tariff delta",
                           idempotency_key=key, actor_id=actor.id, now=NOW)


def test_merge_is_full_additive_pure_and_replayable(published):
    db, actor, fx = published
    original = authored_rows(db)
    saved = deepcopy(original)
    draft = prepare_next_stage_tariffs(db, expected_publication_version=1)
    assert draft["items"][:len(original)] == original == saved
    assert len(draft["items"]) == len(original) + 8
    added = draft["items"][len(original):]
    assert {identity(row): row["amount_idr"] for row in added} == APPROVED
    assert all(row["show_price"] and row["price_qualifier"] == "EXACT" for row in added)
    assert all(row["fee_verification_status"] == "VERIFIED" for row in added)
    for row in added:
        bridging = row["option_code"] in {"conversion-from-voa", "conversion-from-kitas"}
        assert (row["fee_note_ru"] is not None) is bridging
        assert (row["fee_note_en"] is not None) is bridging
    assert not any("express" in row["option_code"] for row in added)
    before = deepcopy(draft["items"])
    assert merge_next_stage_tariffs(draft["items"]) == before == draft["items"]
    assert len(preview_catalog(draft["items"], fx, now=NOW)["items"]) == len(original) + 8
    assert authored_rows(db) == original
    assert db.query(PriceCatalogVersion).count() == db.query(FxMarketSnapshot).count() == 1


@pytest.mark.parametrize("key", [("SERVICE", "consultation"), ("SERVICE", "visa-extension"), ("VISA", "E33G")])
def test_missing_existing_entity_fails_closed(published, key):
    db, _, _ = published
    original = authored_rows(db)
    with pytest.raises(PricingError, match="base options"):
        merge_next_stage_tariffs([row for row in original if identity(row)[:2] != key])


@pytest.mark.parametrize("field,value", [
    ("amount_idr", 1), ("label_ru", "Admin edit"), ("label_en", "Admin edit"),
    ("fee_note_ru", "Admin note"), ("fee_note_en", "Admin note"), ("show_price", False),
    ("fee_verification_status", "NEEDS_VERIFICATION"), ("price_qualifier", "FROM"),
    ("sort_order", 999), ("sku", "admin-custom-sku"),
])
def test_conflicting_admin_fields_are_not_overwritten(published, field, value):
    db, _, _ = published
    merged = prepare_next_stage_tariffs(db, expected_publication_version=1)["items"]
    merged[-1][field] = value
    before = deepcopy(merged)
    with pytest.raises(PricingConflict, match="different fields"):
        merge_next_stage_tariffs(merged)
    assert merged == before


@pytest.mark.parametrize("kind", ["duplicate-identity", "duplicate-sku", "approved-sku-conflict", "missing-identity"])
def test_duplicate_or_invalid_identities_fail_closed(published, kind):
    db, _, _ = published
    original = authored_rows(db)
    extra = deepcopy(original[0])
    if kind == "duplicate-identity":
        extra["sku"] = "another-sku"
    elif kind == "duplicate-sku":
        extra["option_code"] = "another-option"
    elif kind == "approved-sku-conflict":
        extra.update(sku="visa:E33G:conversion-from-voa", option_code="another-option")
    else:
        extra.update(sku="another-sku", option_code=None)
    with pytest.raises(PricingConflict):
        merge_next_stage_tariffs(original + [extra])


def test_existing_publish_replay_and_concurrent_edit_guard(published):
    db, actor, _ = published
    draft = prepare_next_stage_tariffs(db, expected_publication_version=1)
    first = publish(db, actor, draft)
    db.commit()
    assert publish(db, actor, draft).id == first.id
    assert prepare_next_stage_tariffs(db, expected_publication_version=2)["items"] == draft["items"]
    with pytest.raises(PricingConflict, match="version changed"):
        prepare_next_stage_tariffs(db, expected_publication_version=1)
    with pytest.raises(PricingConflict, match="version changed"):
        publish(db, actor, draft, key="competing-publication")
    assert db.query(PriceCatalogVersion).count() == 2


def test_full_projection_fx_history_snapshot_and_restore(published):
    db, actor, fx = published
    snapshot = create_commercial_snapshot(db, entity_type="VISA", entity_key="E33G", option_code="standard", now=NOW)
    db.commit()
    db.refresh(snapshot)
    before_snapshot, before_fx = columns(snapshot), columns(fx)
    before_items = [columns(row) for row in db.query(PriceCatalogItem).order_by(PriceCatalogItem.id)]
    before_projection = with_catalog_compositions(projection_payload(db, now=NOW), now=NOW)
    draft = prepare_next_stage_tariffs(db, expected_publication_version=1)
    publish(db, actor, draft)
    db.commit()
    after = with_catalog_compositions(projection_payload(db, now=NOW), now=NOW)
    before_by_sku = {row["sku"]: row for row in before_projection["items"]}
    after_by_sku = {row["sku"]: row for row in after["items"]}
    assert all(after_by_sku[sku] == row for sku, row in before_by_sku.items())
    assert after["fx"] == before_projection["fx"]
    assert len(after_by_sku) == len(before_by_sku) + 8
    for row in after["items"]:
        if identity(row) in APPROVED:
            assert row["amount_idr"] == str(APPROVED[identity(row)])
            assert row["display_usd_approx"] == str(idr_to_usd_approx(row["amount_idr"], fx.ask_idr_per_usdt))
    for row in after["compositions"]:
        assert row["publication_version"] == row["catalog_version"] == 2
        assert row["fx_version"] == 1
    before_recipes = {row["recipe_code"]: row for row in before_projection["compositions"]}
    after_recipes = {row["recipe_code"]: row for row in after["compositions"]}
    d1_d2_recipes = {"d1-extension-x2", "d2-extension-x2"}
    assert set(before_recipes) == set(after_recipes) and len(after_recipes) == 7
    for code in set(before_recipes) - d1_d2_recipes:
        assert after_recipes[code]["amount_idr"] == before_recipes[code]["amount_idr"]
    for code in d1_d2_recipes:
        assert before_recipes[code]["amount_idr"] is None
        assert before_recipes[code]["price_qualifier"] == "CONTACT"
        assert after_recipes[code]["amount_idr"] == "5000000"
        assert after_recipes[code]["price_qualifier"] == "EXACT"
        assert after_recipes[code]["display_usd_approx"] == str(idr_to_usd_approx("5000000", fx.ask_idr_per_usdt))
    expired = projection_payload(db, now=NOW + timedelta(minutes=16))
    assert all(row["display_usd_approx"] is None for row in expired["items"])
    restore_catalog(db, restore_catalog_version=1, expected_publication_version=2,
                    reason="Synthetic rollback", idempotency_key="tariffs-restore", actor_id=actor.id, now=NOW)
    db.commit()
    assert projection_payload(db, now=NOW)["items"] == before_projection["items"]
    restored_recipes = with_catalog_compositions(projection_payload(db, now=NOW), now=NOW)["compositions"]
    assert {row["recipe_code"]: (row["amount_idr"], row["price_qualifier"], row["display_usd_approx"])
            for row in restored_recipes} == {
                code: (row["amount_idr"], row["price_qualifier"], row["display_usd_approx"])
                for code, row in before_recipes.items()}
    assert [columns(row) for row in db.query(PriceCatalogItem).filter_by(catalog_version_id=1).order_by(PriceCatalogItem.id)] == before_items
    db.refresh(snapshot)
    assert columns(snapshot) == before_snapshot
    assert columns(fx) == before_fx
    assert db.query(CommercialPriceSnapshot).count() == db.query(FxMarketSnapshot).count() == 1


def test_preparation_does_not_flush_unrelated_pending_changes(published):
    db, actor, _ = published
    actor.locale = "en"
    statements = []
    def record(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)
    event.listen(db.bind, "before_cursor_execute", record)
    try:
        prepare_next_stage_tariffs(db, expected_publication_version=1)
    finally:
        event.remove(db.bind, "before_cursor_execute", record)
    assert statements and all(statement.lstrip().upper().startswith("SELECT") for statement in statements)
    assert actor in db.dirty
    db.rollback()


@pytest.mark.parametrize("version", [None, True, 0, -1, "1", 1.0])
def test_expected_version_is_explicit_positive_integer(published, version):
    db, _, _ = published
    with pytest.raises(PricingError, match="positive expected"):
        prepare_next_stage_tariffs(db, expected_publication_version=version)


def test_no_publication_never_bootstraps():
    db = database()
    try:
        with pytest.raises(PricingError, match="existing published"):
            prepare_next_stage_tariffs(db, expected_publication_version=1)
        assert db.query(PriceCatalogVersion).count() == 0
    finally:
        db.close()
        db.bind.dispose()
