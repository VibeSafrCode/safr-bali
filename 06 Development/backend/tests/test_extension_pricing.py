"""SQLite-only delta/publication regressions; no network or live settings needed."""
from copy import deepcopy

import pytest

from app.models.catalog_pricing import CommercialPriceSnapshot, FxMarketSnapshot, PriceCatalogItem, PriceCatalogVersion
from app.services.catalog_pricing import (
    PricingConflict, PricingError, create_commercial_snapshot, preview_catalog,
    publish_catalog, restore_catalog,
)
from app.services.extension_pricing import merge_extension_items, prepare_extension_catalog
from tests.test_catalog_pricing import NOW, admin, database, fx_row, items


@pytest.fixture
def published():
    db = database()
    actor, fx = admin(db), fx_row(db)
    original = items() + [{
        "sku": "service:visa-extension:default", "entity_type": "SERVICE",
        "entity_key": "visa-extension", "option_code": "default",
        "label_ru": "Продление визы", "label_en": "Visa extension",
        "price_qualifier": "CONTACT", "amount_idr": None, "show_price": False,
        "fee_verification_status": "NEEDS_VERIFICATION", "sort_order": 10,
        "fee_note_ru": "Существующее примечание", "fee_note_en": "Existing note",
    }]
    publish_catalog(db, items=original, expected_publication_version=0, effective_from=NOW,
                    reason="Synthetic original catalog", idempotency_key="extension-original",
                    actor_id=actor.id, now=NOW)
    db.commit()
    try:
        yield db, actor, fx
    finally:
        db.close()
        db.bind.dispose()


def publish(db, actor, draft, key="extension-approved", reason="Approved extension delta"):
    return publish_catalog(db, **draft, effective_from=NOW, reason=reason,
                           idempotency_key=key, actor_id=actor.id, now=NOW)


def test_delta_preserves_every_existing_field_and_is_pure_replayable(published):
    db, actor, fx = published
    def stored_rows():
        return [{column.name: getattr(row, column.name) for column in PriceCatalogItem.__table__.columns}
                for row in db.query(PriceCatalogItem).order_by(PriceCatalogItem.id)]
    before = stored_rows()
    draft = prepare_extension_catalog(db, expected_publication_version=1)
    original = [{key: value for key, value in row.items()
                 if key not in {"id", "catalog_version_id"}} for row in before]
    assert draft["items"][:len(original)] == original
    assert [(row["option_code"], row["amount_idr"]) for row in draft["items"][-2:]] == [
        ("c1-extension", 2_000_000), ("voa-extension", 850_000),
    ]
    saved = deepcopy(draft["items"])
    assert merge_extension_items(saved) == saved
    assert saved == draft["items"]
    preview = preview_catalog(draft["items"], fx, now=NOW)
    assert [row["display_usd_approx"] for row in preview["items"][-2:]] == ["110", "45"]
    assert db.query(PriceCatalogVersion).count() == 1
    assert stored_rows() == before


def test_existing_publish_idempotency_and_conflicting_retry(published):
    db, actor, fx = published
    draft = prepare_extension_catalog(db, expected_publication_version=1)
    first = publish(db, actor, draft)
    db.commit()
    assert publish(db, actor, draft).id == first.id
    assert prepare_extension_catalog(db, expected_publication_version=2)["items"] == draft["items"]
    assert db.query(PriceCatalogVersion).count() == 2
    assert db.query(FxMarketSnapshot).count() == 1
    changed = deepcopy(draft)
    changed["items"][-1]["amount_idr"] += 1
    with pytest.raises(PricingConflict, match="reused"):
        publish(db, actor, changed)


def test_stale_draft_and_read_guard_fail_closed(published):
    db, actor, fx = published
    draft = prepare_extension_catalog(db, expected_publication_version=1)
    publish(db, actor, draft, key="other-writer-extension")
    db.commit()
    with pytest.raises(PricingConflict, match="version changed"):
        prepare_extension_catalog(db, expected_publication_version=1)
    with pytest.raises(PricingConflict, match="version changed"):
        publish(db, actor, draft)
    assert db.query(PriceCatalogVersion).count() == 2


def test_restore_preserves_historical_ids_fx_and_commercial_snapshot(published):
    db, actor, fx = published
    snapshot = create_commercial_snapshot(db, entity_type="VISA", entity_key="E33G",
                                          option_code="standard", now=NOW)
    db.commit()
    db.refresh(snapshot)
    frozen = {column.name: getattr(snapshot, column.name) for column in CommercialPriceSnapshot.__table__.columns}
    old_ids = [row.id for row in db.query(PriceCatalogItem).order_by(PriceCatalogItem.id)]
    draft = prepare_extension_catalog(db, expected_publication_version=1)
    publish(db, actor, draft)
    db.commit()
    restored = restore_catalog(db, restore_catalog_version=1, expected_publication_version=2,
                               reason="Synthetic rollback", idempotency_key="extension-restore",
                               actor_id=actor.id, now=NOW)
    db.commit()
    assert restored.version == 3
    assert db.query(PriceCatalogVersion).count() == 3
    assert db.query(FxMarketSnapshot).count() == 1
    assert [row.id for row in db.query(PriceCatalogItem).filter_by(catalog_version_id=1)
            .order_by(PriceCatalogItem.id)] == old_ids
    assert not db.query(PriceCatalogItem).filter_by(catalog_version_id=restored.catalog_version_id,
                                                   option_code="c1-extension").count()
    db.expire(snapshot)
    assert {column.name: getattr(snapshot, column.name) for column in CommercialPriceSnapshot.__table__.columns} == frozen


def test_conflicts_and_missing_base_fail_without_overwrite(published):
    db, actor, fx = published
    draft = prepare_extension_catalog(db, expected_publication_version=1)
    for field, value in (("amount_idr", 1), ("label_ru", "Edited"), ("show_price", False)):
        changed = deepcopy(draft["items"])
        changed[-1][field] = value
        with pytest.raises(PricingConflict):
            merge_extension_items(changed)
    with pytest.raises(PricingConflict):
        merge_extension_items(draft["items"] + [draft["items"][0]])
    with pytest.raises(PricingError, match="default"):
        merge_extension_items(items())


def test_missing_publication_never_bootstraps():
    db = database()
    try:
        with pytest.raises(PricingError, match="existing published"):
            prepare_extension_catalog(db, expected_publication_version=0)
        assert db.query(PriceCatalogVersion).count() == 0
    finally:
        db.close()
        db.bind.dispose()
