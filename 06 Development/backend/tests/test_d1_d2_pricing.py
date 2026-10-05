"""Synthetic SQLite only: full catalog, CLI boundaries and shared FX contracts."""
from argparse import Namespace
from copy import deepcopy
from datetime import timedelta

import pytest

from app.models.catalog_pricing import CommercialPriceSnapshot, FxMarketSnapshot, PriceCatalogItem, PriceCatalogVersion
from app.scripts.publish_d1_d2_prices import execute, main
from app.scripts.publish_extension_prices import SafetyError, _catalog_items
from app.services.catalog_compositions import with_catalog_compositions
from app.services.catalog_pricing import (
    PricingConflict, create_commercial_snapshot, idr_to_usd_approx, projection_payload,
    publish_catalog, restore_catalog,
)
from app.services.d1_d2_pricing import APPROVED_AMOUNTS, FIVE_YEAR_CODES, LEGACY_FIVE_YEAR_AMOUNTS, merge_d1_d2_items, prepare_d1_d2_catalog
from app.services.extension_pricing import merge_extension_items
from tests.test_catalog_pricing import NOW, admin, database, fx_row, items


def authored_rows():
    rows = items() + [{
        "sku": "service:visa-extension:default", "entity_type": "SERVICE", "entity_key": "visa-extension",
        "option_code": "default", "label_ru": "Продление", "label_en": "Extension",
        "price_qualifier": "CONTACT", "amount_idr": None, "show_price": False,
        "fee_verification_status": "NEEDS_VERIFICATION", "sort_order": 10,
    }]
    for index, code in enumerate([*APPROVED_AMOUNTS, *FIVE_YEAR_CODES]):
        five_year = code in FIVE_YEAR_CODES
        rows.append({
            "sku": f"visa:D1/D2:{code}", "entity_type": "VISA", "entity_key": "D1/D2", "option_code": code,
            "label_ru": f"Existing RU {code}", "label_en": f"Existing EN {code}",
            "price_qualifier": "CONTACT" if five_year else "EXACT",
            "amount_idr": None if five_year else 8_000_000, "show_price": not five_year,
            "fee_verification_status": "NEEDS_VERIFICATION" if five_year else "VERIFIED",
            "fee_note_ru": "Сохранить примечание", "fee_note_en": "Preserve note", "sort_order": index * 10,
        })
    return merge_extension_items(rows)


@pytest.fixture
def catalog():
    db = database()
    actor, fx = admin(db), fx_row(db)
    publish_catalog(db, items=authored_rows(), expected_publication_version=0, effective_from=NOW,
                    reason="Synthetic D1/D2 baseline", idempotency_key="d1d2-baseline", actor_id=actor.id, now=NOW)
    db.commit()
    try:
        yield db, actor, fx
    finally:
        db.close()
        db.bind.dispose()


def options(**changes):
    return Namespace(**({"projection_url": "http://127.0.0.1:8000/api/catalog/pricing", "apply": False,
                         "actor_user_id": None, "expected_catalog_hash": None,
                         "expected_publication_version": None} | changes))


def run(db, args, now=NOW, loader=None):
    return execute(db, args, root_telegram_id=100, now=now,
                   projection_loader=loader or (lambda url: with_catalog_compositions(projection_payload(db, now=now), now=now)))


def apply_args(db, actor):
    dry = run(db, options())
    return options(apply=True, actor_user_id=actor.id, expected_catalog_hash=dry["catalog_hash"],
                   expected_publication_version=dry["expected_publication_version"])


def test_complete_merge_preserves_identity_fields_order_and_contact_quotes(catalog):
    db, actor, fx = catalog
    original = _catalog_items(db, 1)
    before = deepcopy(original)
    draft = prepare_d1_d2_catalog(db, expected_publication_version=1)
    assert original == before
    assert len(draft["items"]) == len(original) + 2
    assert [row["sku"] for row in draft["items"][:len(original)]] == [row["sku"] for row in original]
    for old, new in zip(original, draft["items"]):
        if old["entity_key"] == "D1/D2" and old["option_code"] in APPROVED_AMOUNTS:
            assert new == {**old, "amount_idr": APPROVED_AMOUNTS[old["option_code"]]}
        else:
            assert new == old
    assert merge_d1_d2_items(draft["items"]) == draft["items"]
    assert {row["option_code"] for row in draft["items"][len(original):]} == {"d1-extension", "d2-extension"}
    assert db.query(PriceCatalogVersion).count() == db.query(FxMarketSnapshot).count() == 1


@pytest.mark.parametrize("mutation", ["duplicate", "missing-initial", "missing-default", "missing-five", "priced-five", "visible-five", "hidden-initial", "extension-conflict", "sku-conflict"])
def test_merge_rejects_ambiguous_partial_or_unapproved_catalog(mutation):
    rows = authored_rows()
    initial = next(row for row in rows if row["option_code"] in APPROVED_AMOUNTS)
    five = next(row for row in rows if row["option_code"] in FIVE_YEAR_CODES)
    if mutation == "duplicate":
        rows.append(deepcopy(initial))
    elif mutation == "missing-initial":
        rows.remove(initial)
    elif mutation == "missing-default":
        rows = [row for row in rows if row["sku"] != "service:visa-extension:default"]
    elif mutation == "missing-five":
        rows.remove(five)
    elif mutation == "priced-five":
        five.update(amount_idr=18_000_000, price_qualifier="EXACT")
    elif mutation == "visible-five":
        five["show_price"] = True
    elif mutation == "hidden-initial":
        initial["show_price"] = False
    elif mutation == "extension-conflict":
        rows = merge_d1_d2_items(rows)
        rows[-1]["label_en"] = "Later Admin edit"
    else:
        initial["sku"] = "service:visa-extension:d1-extension"
    from app.services.catalog_pricing import PricingError
    with pytest.raises(PricingError):
        merge_d1_d2_items(rows)


def test_cli_dry_apply_replay_restore_preserves_historical_snapshot_and_fx(catalog):
    db, actor, fx = catalog
    snapshot = create_commercial_snapshot(db, entity_type="VISA", entity_key="D1/D2",
                                         option_code="d1-one-year-standard", now=NOW)
    db.commit()
    db.refresh(snapshot)
    snapshot_before = {col.name: getattr(snapshot, col.name) for col in CommercialPriceSnapshot.__table__.columns}
    ids = [row.id for row in db.query(PriceCatalogItem).order_by(PriceCatalogItem.id)]
    original = _catalog_items(db, 1)
    args = apply_args(db, actor)
    assert db.query(PriceCatalogVersion).count() == 1
    assert run(db, args)["mode"] == "APPLIED"
    assert run(db, args)["mode"] == "ALREADY_APPLIED"
    assert db.query(PriceCatalogVersion).count() == 2
    assert db.query(FxMarketSnapshot).count() == 1
    assert [row.id for row in db.query(PriceCatalogItem).filter_by(catalog_version_id=1).order_by(PriceCatalogItem.id)] == ids
    db.expire(snapshot)
    assert {col.name: getattr(snapshot, col.name) for col in CommercialPriceSnapshot.__table__.columns} == snapshot_before
    restore_catalog(db, restore_catalog_version=1, expected_publication_version=2, reason="Synthetic rollback",
                    idempotency_key="d1d2-restore", actor_id=actor.id, now=NOW)
    db.commit()
    assert {row["sku"]: row for row in _catalog_items(db, 3)} == {row["sku"]: row for row in original}
    with pytest.raises(SafetyError, match="subsequent_edit"):
        run(db, args)


def test_concurrent_admin_edit_rejected_by_cli_and_existing_publisher(catalog):
    db, actor, fx = catalog
    args = apply_args(db, actor)
    draft = prepare_d1_d2_catalog(db, expected_publication_version=1)
    later = _catalog_items(db, 1)
    later[0]["label_en"] = "New Admin choice"
    publish_catalog(db, items=later, expected_publication_version=1, effective_from=NOW,
                    reason="Concurrent edit", idempotency_key="d1d2-concurrent", actor_id=actor.id, now=NOW)
    db.commit()
    with pytest.raises(SafetyError, match="catalog_hash_changed"):
        run(db, args)
    with pytest.raises(PricingConflict, match="version changed"):
        publish_catalog(db, **draft, effective_from=NOW, reason="Stale draft", idempotency_key="d1d2-stale",
                        actor_id=actor.id, now=NOW)
    assert db.query(PriceCatalogVersion).count() == 2


@pytest.mark.parametrize("changes,code", [
    ({"apply": True}, "apply_requires"), ({"actor_user_id": 999}, "configured_active_root"),
    ({"expected_catalog_hash": "0" * 64}, "catalog_hash_changed"),
    ({"expected_publication_version": 100}, "publication_version_changed"),
    ({"projection_url": "https://evil.test/api/catalog/pricing"}, "url_not_allowed"),
])
def test_cli_preflight_failures_do_not_write(catalog, changes, code):
    db, actor, fx = catalog
    with pytest.raises(SafetyError, match=code):
        run(db, options(**changes))
    assert db.query(PriceCatalogVersion).count() == 1


def test_cli_stale_full_projection_mismatch_and_sanitized_arguments(catalog, capsys):
    db, actor, fx = catalog
    with pytest.raises(SafetyError, match="fresh_fx_required"):
        run(db, options(), now=NOW + timedelta(seconds=61))
    with pytest.raises(SafetyError, match="differs_from_database"):
        run(db, options(), loader=lambda url: {})
    assert main(["--projection-url", "https://PRIVATE:SECRET@evil.test/"]) == 1
    output = capsys.readouterr()
    assert "invalid_arguments" in output.out
    assert "SECRET" not in output.out + output.err


def test_two_extensions_use_own_identity_same_versions_ttl_and_round_total_once(catalog):
    db, actor, fx = catalog
    run(db, apply_args(db, actor))
    authored = _catalog_items(db, 2)
    for row in authored:
        if row["option_code"] == "d1-extension":
            row["amount_idr"] = 2_030_000
    publish_catalog(db, items=authored, expected_publication_version=2, effective_from=NOW,
                    reason="Admin extension edit", idempotency_key="d1d2-admin-change", actor_id=actor.id, now=NOW)
    db.commit()
    for seconds, allowed in ((0, True), (61, True), (900, True), (901, False)):
        now = NOW + timedelta(seconds=seconds)
        payload = with_catalog_compositions(projection_payload(db, now=now), now=now)
        rows = {row["recipe_code"]: row for row in payload["compositions"]}
        for code, amount in (("d1-extension-x2", "4060000"), ("d2-extension-x2", "5000000")):
            row = rows[code]
            assert row["amount_idr"] == amount
            assert row["publication_version"] == payload["publication_version"]
            assert row["catalog_version"] == payload["catalog_version"]
            assert row["fx_version"] == payload["fx"]["version"]
            assert row["projection_id"] == payload["projection_id"]
            assert row["derived_expires_at"] == payload["derived_expires_at"]
            assert row["components"][0]["entity_type"] == "SERVICE"
            assert row["components"][0]["quantity"] == 2
            assert row["display_usd_approx"] == (str(idr_to_usd_approx(amount, fx.ask_idr_per_usdt)) if allowed else None)
        if allowed:
            assert rows["d1-extension-x2"]["display_usd_approx"] == "225"
            assert 2 * idr_to_usd_approx(2_030_000, fx.ask_idr_per_usdt) != 225


@pytest.mark.parametrize("kind", ["missing", "duplicate", "hidden", "unverified", "from"])
def test_d1_composition_fails_closed_without_affecting_d2(catalog, kind):
    db, actor, fx = catalog
    run(db, apply_args(db, actor))
    payload = projection_payload(db, now=NOW)
    row = next(row for row in payload["items"] if row["option_code"] == "d1-extension")
    if kind == "missing":
        payload["items"].remove(row)
    elif kind == "duplicate":
        payload["items"].append(deepcopy(row))
    elif kind == "hidden":
        row["show_price"] = False
    elif kind == "unverified":
        row["fee_verification_status"] = "NEEDS_VERIFICATION"
    else:
        row["price_qualifier"] = "FROM"
    recipes = {row["recipe_code"]: row for row in with_catalog_compositions(payload, now=NOW)["compositions"]}
    assert recipes["d1-extension-x2"]["show_price"] is False
    assert recipes["d1-extension-x2"]["amount_idr"] is recipes["d1-extension-x2"]["display_usd_approx"] is None
    assert recipes["d2-extension-x2"]["amount_idr"] == "5000000"


def legacy_rows():
    rows = authored_rows()
    for row in rows:
        if row["entity_key"] == "D1/D2" and row["option_code"] in LEGACY_FIVE_YEAR_AMOUNTS:
            row.update(amount_idr=LEGACY_FIVE_YEAR_AMOUNTS[row["option_code"]],
                       price_qualifier="EXACT", show_price=True, fee_verification_status="VERIFIED")
    return rows


def test_explicit_legacy_contact_transition_dry_apply_replay_keeps_history(catalog):
    db, actor, fx = catalog
    publish_catalog(db, items=legacy_rows(), expected_publication_version=1, effective_from=NOW,
                    reason="Synthetic actual legacy shape", idempotency_key="d1d2-legacy", actor_id=actor.id, now=NOW)
    db.commit()
    original = _catalog_items(db, 2)
    snapshot = create_commercial_snapshot(db, entity_type="VISA", entity_key="D1/D2",
                                         option_code="d1-five-year-standard", now=NOW)
    db.commit()
    db.refresh(snapshot)
    before = {col.name: getattr(snapshot, col.name) for col in CommercialPriceSnapshot.__table__.columns}
    with pytest.raises(PricingConflict, match="explicit approval"):
        run(db, options())
    dry = run(db, options(approve_five_year_contact=True))
    assert len(dry["five_year_contact_skus"]) == 4
    assert len(dry["changed_amount_skus"]) == 8
    assert len(dry["added_skus"]) == 2
    args = options(apply=True, actor_user_id=actor.id, expected_catalog_hash=dry["catalog_hash"],
                   expected_publication_version=dry["expected_publication_version"], approve_five_year_contact=True)
    assert run(db, args)["mode"] == "APPLIED"
    assert run(db, args)["mode"] == "ALREADY_APPLIED"
    assert _catalog_items(db, 2) == original
    current = {row["sku"]: row for row in _catalog_items(db, 3)}
    for old in original:
        if old["entity_key"] == "D1/D2" and old["option_code"] in FIVE_YEAR_CODES:
            assert current[old["sku"]] == {**old, "amount_idr": None, "price_qualifier": "CONTACT", "show_price": False}
    projected = projection_payload(db, now=NOW)
    quotes = [row for row in projected["items"] if row["entity_key"] == "D1/D2" and row["option_code"] in FIVE_YEAR_CODES]
    assert len(quotes) == 4
    for quote in quotes:
        assert quote["price_qualifier"] == "CONTACT"
        assert quote["show_price"] is False
        assert quote["amount_idr"] is quote["display_usd_approx"] is None
    db.expire(snapshot)
    assert {col.name: getattr(snapshot, col.name) for col in CommercialPriceSnapshot.__table__.columns} == before
    args.approve_five_year_contact = False
    with pytest.raises(SafetyError, match="original_request"):
        run(db, args)
    assert db.query(FxMarketSnapshot).count() == 1


@pytest.mark.parametrize("change", [
    {"amount_idr": 0}, {"amount_idr": 18_000_001}, {"amount_idr": None},
    {"price_qualifier": "FROM"}, {"fee_verification_status": "NEEDS_VERIFICATION"}, {"show_price": False},
])
def test_explicit_contact_flag_rejects_any_unknown_legacy_shape(change):
    rows = legacy_rows()
    next(row for row in rows if row["option_code"] == "d1-five-year-standard").update(change)
    before = deepcopy(rows)
    with pytest.raises(PricingConflict, match="explicit approval"):
        merge_d1_d2_items(rows, approve_five_year_contact=True)
    assert rows == before


def test_cli_independent_delta_guard_denies_unrelated_change(catalog, monkeypatch):
    from app.services import d1_d2_pricing
    db, actor, fx = catalog
    original = d1_d2_pricing.prepare_d1_d2_catalog
    def tampered(*args, **kwargs):
        result = original(*args, **kwargs)
        result["items"][0]["label_en"] = "Unapproved drift"
        return result
    monkeypatch.setattr(d1_d2_pricing, "prepare_d1_d2_catalog", tampered)
    with pytest.raises(SafetyError, match="unapproved_catalog_field_changed"):
        run(db, options())
    assert db.query(PriceCatalogVersion).count() == 1


def test_production_clock_rechecked_before_commit_after_publication_delay(catalog, monkeypatch):
    import app.scripts.publish_d1_d2_prices as cli
    import app.services.catalog_pricing as pricing
    db, actor, fx = catalog
    args = apply_args(db, actor)
    times = iter((NOW, NOW + timedelta(seconds=61)))
    class Clock:
        @staticmethod
        def now(tz):
            return next(times)
    original = pricing.publish_catalog
    def delayed_publish(*args, **kwargs):
        assert kwargs["now"] is None  # Production publisher must read its own clock.
        return original(*args, **{**kwargs, "now": NOW})
    monkeypatch.setattr(cli, "datetime", Clock)
    monkeypatch.setattr(pricing, "publish_catalog", delayed_publish)
    with pytest.raises(SafetyError, match="fx_expired_or_changed_before_commit"):
        cli.execute(db, args, root_telegram_id=100,
                    projection_loader=lambda url: with_catalog_compositions(projection_payload(db, now=NOW), now=NOW))
    assert db.query(PriceCatalogVersion).count() == 1
    assert db.query(FxMarketSnapshot).count() == 1
