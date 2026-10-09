"""Synthetic SQLite only; no production, network, seeds or FX refresh."""
from argparse import Namespace
from copy import deepcopy
from datetime import timedelta

import pytest
from sqlalchemy import delete, update

from app.models.admin_action import AdminAction
from app.models.catalog_pricing import CommercialPriceSnapshot, FxMarketSnapshot, PriceCatalogItem, PriceCatalogVersion
from app.models.order import Order
from app.models.service import Service
from app.models.user import User
from app.models.visa_lifecycle import VisaType
from app.scripts.publish_d12_e28a_prices import execute, main
from app.scripts.publish_extension_prices import SafetyError, _catalog_items, sql_write_boundary
from app.services.catalog_compositions import with_catalog_compositions
from app.services.catalog_pricing import (
    PricingConflict, PricingError, create_commercial_snapshot, idr_to_usd_approx,
    latest_publication, projection_payload, publish_catalog, restore_catalog,
)
from app.services.d12_e28a_pricing import (
    APPROVED_AMOUNTS, APPROVED_LABELS, approved_additions, merge_d12_e28a_items, prepare_d12_e28a_catalog,
)
from tests.test_catalog_pricing import NOW, admin, database, fx_row, items


def authored_rows(*, conversion=True):
    rows = items() + [{
        "sku": "service:visa-extension:default", "entity_type": "SERVICE", "entity_key": "visa-extension",
        "option_code": "default", "label_ru": "Продление", "label_en": "Extension",
        "price_qualifier": "CONTACT", "amount_idr": None, "show_price": False,
        "fee_verification_status": "NEEDS_VERIFICATION", "sort_order": 10,
    }]
    legacy = (7_500_000, 10_000_000, 12_500_000, 14_500_000)
    for index, (code, amount) in enumerate(zip(APPROVED_AMOUNTS, legacy)):
        rows.append({
            "sku": f"visa:D12:{code}", "entity_type": "VISA", "entity_key": "D12", "option_code": code,
            "label_ru": f"Старый срок {code}", "label_en": f"Legacy time {code}",
            "price_qualifier": "EXACT", "amount_idr": amount, "show_price": True,
            "fee_verification_status": "VERIFIED", "fee_note_ru": "Сохранить", "fee_note_en": "Preserve",
            "sort_order": (index + 1) * 10,
        })
    if conversion:
        rows.append({
            "sku": "visa:E33G:conversion-from-d12", "entity_type": "VISA", "entity_key": "E33G",
            "option_code": "conversion-from-d12", "label_ru": "Проверка маршрута D12 → E33G",
            "label_en": "D12 to E33G route assessment", "price_qualifier": "EXACT",
            "amount_idr": 17_000_000, "show_price": True, "fee_verification_status": "VERIFIED",
            "fee_note_ru": "Не автоматическая конвертация", "fee_note_en": "Not automatic conversion", "sort_order": 60,
        })
    return rows


@pytest.fixture
def catalog():
    db = database()
    actor, fx = admin(db), fx_row(db)
    publish_catalog(db, items=authored_rows(), expected_publication_version=0, effective_from=NOW,
                    reason="Synthetic D12/E28A baseline", idempotency_key="d12-e28a-baseline", actor_id=actor.id, now=NOW)
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


def column_values(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


def test_merge_preserves_full_catalog_order_notes_identities_and_conversion(catalog):
    db, actor, fx = catalog
    original = _catalog_items(db, 1)
    before = deepcopy(original)
    draft = prepare_d12_e28a_catalog(db, expected_publication_version=1)
    assert original == before
    assert len(draft["items"]) == len(original) + 3
    assert [row["sku"] for row in draft["items"][:len(original)]] == [row["sku"] for row in original]
    for old, new in zip(original, draft["items"]):
        if old["entity_key"] == "D12" and old["option_code"] in APPROVED_AMOUNTS:
            code = old["option_code"]
            assert new == {**old, "amount_idr": APPROVED_AMOUNTS[code],
                           "label_ru": APPROVED_LABELS[code][0], "label_en": APPROVED_LABELS[code][1]}
        else:
            assert new == old
    assert draft["items"][len(original):] == approved_additions()
    assert merge_d12_e28a_items(draft["items"]) == draft["items"]
    contact = next(row for row in draft["items"] if row["option_code"] == "e28a-extension")
    assert contact["price_qualifier"] == "CONTACT"
    assert contact["amount_idr"] is None and contact["show_price"] is False
    assert db.query(PriceCatalogVersion).count() == db.query(FxMarketSnapshot).count() == 1


@pytest.mark.parametrize("mutation", [
    "duplicate", "duplicate-identity-new-sku", "missing-sku", "missing-initial", "missing-default",
    "hidden-initial", "unverified-initial", "from-initial", "extension-conflict", "sku-conflict", "conversion-conflict",
])
def test_merge_rejects_partial_ambiguous_or_unapproved_existing_catalog(mutation):
    rows = authored_rows()
    initial = next(row for row in rows if row["entity_key"] == "D12")
    if mutation == "duplicate":
        rows.append(deepcopy(initial))
    elif mutation == "duplicate-identity-new-sku":
        rows.append({**initial, "sku": "different:sku"})
    elif mutation == "missing-sku":
        initial["sku"] = ""
    elif mutation == "missing-initial":
        rows.remove(initial)
    elif mutation == "missing-default":
        rows = [row for row in rows if row["sku"] != "service:visa-extension:default"]
    elif mutation == "hidden-initial":
        initial["show_price"] = False
    elif mutation == "unverified-initial":
        initial["fee_verification_status"] = "NEEDS_VERIFICATION"
    elif mutation == "from-initial":
        initial["price_qualifier"] = "FROM"
    elif mutation == "extension-conflict":
        rows = merge_d12_e28a_items(rows)
        rows[-1]["amount_idr"] = 1
    elif mutation == "sku-conflict":
        rows[0]["sku"] = "visa:E28A:two-year-standard"
    else:
        next(row for row in rows if row["option_code"] == "conversion-from-d12")["amount_idr"] = 16_000_000
    before = deepcopy(rows)
    with pytest.raises(PricingError):
        merge_d12_e28a_items(rows)
    assert rows == before


def test_existing_approved_new_options_are_preserved_not_duplicated():
    rows = authored_rows() + approved_additions()[:2]
    merged = merge_d12_e28a_items(rows)
    assert len(merged) == len(rows) + 1
    assert merged[-3:-1] == rows[-2:]
    assert len({row["sku"] for row in merged}) == len(merged)


def test_apply_replay_audit_restore_preserve_historical_orders_snapshots_fx_and_types(catalog):
    db, actor, fx = catalog
    service = Service(name="Visa", slug="visa", category="visa", is_active=True)
    db.add(service)
    db.flush()
    snapshot = create_commercial_snapshot(db, entity_type="VISA", entity_key="D12", option_code="one-year-express", now=NOW)
    order = Order(user_id=actor.id, service_id=service.id, pricing_mode="CANONICAL",
                  commercial_price_snapshot_id=snapshot.id, amount_usd=snapshot.display_usdt)
    db.add(order)
    db.commit()
    # Compare persisted representations on both sides (SQLite drops timezone
    # offsets); never compare an unrefreshed default with a round-tripped row.
    for row in (order, snapshot, fx, service):
        db.refresh(row)
    originals = _catalog_items(db, 1)
    ids = [row.id for row in db.query(PriceCatalogItem).order_by(PriceCatalogItem.id)]
    order_before, snapshot_before, fx_before, service_before = map(column_values, (order, snapshot, fx, service))
    args = apply_args(db, actor)
    assert run(db, args)["mode"] == "APPLIED"
    assert run(db, args)["mode"] == "ALREADY_APPLIED"
    assert db.query(PriceCatalogVersion).count() == 2
    assert db.query(FxMarketSnapshot).count() == 1
    assert db.query(VisaType).count() == 0  # Generic prices do not invent CRM/business availability.
    assert _catalog_items(db, 1) == originals
    assert [row.id for row in db.query(PriceCatalogItem).filter_by(catalog_version_id=1).order_by(PriceCatalogItem.id)] == ids
    for row, before in zip((order, snapshot, fx, service), (order_before, snapshot_before, fx_before, service_before)):
        db.refresh(row)
        assert column_values(row) == before
    action = db.query(AdminAction).filter_by(action_type="PRICE_CATALOG_PUBLISHED").order_by(AdminAction.id.desc()).first()
    assert action.admin_user_id == actor.id and "Founder 2026-10-09 D12/E28A" in action.comment
    restore_catalog(db, restore_catalog_version=1, expected_publication_version=2, reason="Synthetic rollback",
                    idempotency_key="d12-e28a-restore", actor_id=actor.id, now=NOW)
    db.commit()
    assert {row["sku"]: row for row in _catalog_items(db, 3)} == {row["sku"]: row for row in originals}
    with pytest.raises(SafetyError, match="subsequent_edit"):
        run(db, args)


def test_new_prices_use_existing_approximation_formula_and_expiry(catalog):
    db, actor, fx = catalog
    run(db, apply_args(db, actor))
    for seconds in (0, 61, 900, 901):
        payload = projection_payload(db, now=NOW + timedelta(seconds=seconds))
        for row in payload["items"]:
            if row["entity_key"] == "D12" or row["option_code"] in {"d12-extension", "two-year-standard"}:
                if row["amount_idr"] is not None:
                    assert row["display_usd_approx"] == (str(idr_to_usd_approx(row["amount_idr"], fx.ask_idr_per_usdt)) if seconds <= 900 else None)
            if row["option_code"] == "e28a-extension":
                assert row["amount_idr"] is row["display_usdt"] is row["display_usd_approx"] is None
                assert row["show_price"] is False


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
    assert db.query(PriceCatalogVersion).count() == db.query(FxMarketSnapshot).count() == 1


def test_stale_mismatch_dirty_session_and_root_state_fail_closed(catalog):
    db, actor, fx = catalog
    with pytest.raises(SafetyError, match="fresh_fx_required"):
        run(db, options(), now=NOW + timedelta(seconds=61))
    with pytest.raises(SafetyError, match="differs_from_database"):
        run(db, options(), loader=lambda url: {})
    actor.status = "blocked"
    with pytest.raises(SafetyError, match="requires_clean_session"):
        run(db, options())
    db.flush()
    with pytest.raises(SafetyError, match="configured_active_root"):
        run(db, options())
    db.rollback()


def test_concurrent_publication_rejected(catalog):
    db, actor, fx = catalog
    args = apply_args(db, actor)
    draft = prepare_d12_e28a_catalog(db, expected_publication_version=1)
    later = _catalog_items(db, 1)
    later[0]["label_en"] = "Concurrent owner choice"
    publish_catalog(db, items=later, expected_publication_version=1, effective_from=NOW,
                    reason="Concurrent edit", idempotency_key="d12-e28a-concurrent", actor_id=actor.id, now=NOW)
    db.commit()
    with pytest.raises(SafetyError, match="catalog_hash_changed"):
        run(db, args)
    with pytest.raises(PricingConflict, match="version changed"):
        publish_catalog(db, **draft, effective_from=NOW, reason="Stale draft", idempotency_key="d12-e28a-stale",
                        actor_id=actor.id, now=NOW)


def test_conversion_absence_is_reported_not_bulk_published():
    db = database()
    try:
        actor = admin(db)
        fx_row(db)
        publish_catalog(db, items=authored_rows(conversion=False), expected_publication_version=0, effective_from=NOW,
                        reason="No conversion baseline", idempotency_key="d12-no-conversion", actor_id=actor.id, now=NOW)
        db.commit()
        result = run(db, options())
        assert result["d12_conversion"] == "ABSENT_NOT_ADDED"
        assert len(result["added_skus"]) == 3
        assert db.query(PriceCatalogVersion).count() == 1
    finally:
        db.close()
        db.bind.dispose()


@pytest.mark.parametrize("tamper", ["unrelated-field", "drop-row", "duplicate-row", "new-field"])
def test_cli_independent_delta_guard_denies_helper_drift(catalog, monkeypatch, tamper):
    from app.services import d12_e28a_pricing
    db, actor, fx = catalog
    original = d12_e28a_pricing.prepare_d12_e28a_catalog
    def changed(*args, **kwargs):
        result = original(*args, **kwargs)
        if tamper == "unrelated-field":
            result["items"][0]["label_en"] = "Unapproved drift"
        elif tamper == "drop-row":
            result["items"].pop(0)
        elif tamper == "duplicate-row":
            result["items"].append(deepcopy(result["items"][0]))
        else:
            result["items"][-1]["amount_idr"] = 1
        return result
    monkeypatch.setattr(d12_e28a_pricing, "prepare_d12_e28a_catalog", changed)
    with pytest.raises(SafetyError, match="unapproved|delta_must"):
        run(db, options())
    assert db.query(PriceCatalogVersion).count() == 1


@pytest.mark.parametrize("apply", [True, False])
@pytest.mark.parametrize("statement", [
    update(User).values(status="blocked"), update(Order).values(amount_usd=1),
    update(FxMarketSnapshot).values(ask_idr_per_usdt=1), update(PriceCatalogVersion).values(reason="rewrite"),
    delete(PriceCatalogVersion),
])
def test_inherited_sql_boundary_excludes_customers_orders_fx_and_history(catalog, apply, statement):
    db, actor, fx = catalog
    with pytest.raises(SafetyError, match="sql_write_boundary"):
        with sql_write_boundary(db, apply=apply):
            db.execute(statement)
    db.rollback()


def test_final_production_clock_recheck_rolls_back_expired_publication(catalog, monkeypatch):
    import app.scripts.publish_d12_e28a_prices as cli
    import app.services.catalog_pricing as pricing
    db, actor, fx = catalog
    args = apply_args(db, actor)
    times = iter((NOW, NOW + timedelta(seconds=61)))
    class Clock:
        @staticmethod
        def now(tz):
            return next(times)
    original = pricing.publish_catalog
    def delayed(*args, **kwargs):
        assert kwargs["now"] is None
        return original(*args, **{**kwargs, "now": NOW})
    monkeypatch.setattr(cli, "datetime", Clock)
    monkeypatch.setattr(pricing, "publish_catalog", delayed)
    with pytest.raises(SafetyError, match="fx_expired_or_changed_before_commit"):
        cli.execute(db, args, root_telegram_id=100,
                    projection_loader=lambda url: with_catalog_compositions(projection_payload(db, now=NOW), now=NOW))
    assert db.query(PriceCatalogVersion).count() == 1
    assert latest_publication(db).catalog_version_id == 1


def test_arguments_and_unexpected_failures_never_leak_payload(monkeypatch, capsys):
    import app.scripts.publish_d12_e28a_prices as cli
    assert main(["--projection-url", "https://PRIVATE:SECRET@evil.test/"]) == 1
    output = capsys.readouterr()
    assert "invalid_arguments" in output.out and "SECRET" not in output.out + output.err
    def fail(*args, **kwargs):
        raise ValueError("synthetic-secret-DSN-do-not-log")
    monkeypatch.setattr(cli, "execute", fail)
    assert main(["--projection-url", "http://127.0.0.1:8000/api/catalog/pricing"]) == 1
    output = capsys.readouterr()
    assert "preflight_or_publication_failed" in output.out
    assert "do-not-log" not in output.out + output.err and "Traceback" not in output.out + output.err
