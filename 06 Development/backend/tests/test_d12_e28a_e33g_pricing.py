"""Isolated SQLite-only combined publisher tests. No network/seed/FX refresh."""
from argparse import Namespace
from copy import deepcopy
from datetime import timedelta

import pytest
from sqlalchemy import delete, update

from app.models.admin_action import AdminAction
from app.models.catalog_pricing import CatalogPublication, CommercialPriceSnapshot, FxMarketSnapshot, PriceCatalogItem, PriceCatalogVersion
from app.models.order import Order
from app.models.service import Service
from app.models.user import User
from app.models.visa_lifecycle import VisaType
from app.scripts.publish_d12_e28a_e33g_prices import OPERATION_KEY, execute, main
from app.scripts.publish_d12_e28a_prices import OPERATION_KEY as OLD_D12_OPERATION_KEY
from app.scripts.publish_extension_prices import SafetyError, _catalog_items, sql_write_boundary
from app.services.catalog_compositions import with_catalog_compositions
from app.services.catalog_pricing import (
    PricingConflict, PricingError, create_commercial_snapshot, idr_to_usd_approx,
    latest_publication, projection_payload, publish_catalog, restore_catalog,
)
from app.services.d12_e28a_pricing import APPROVED_AMOUNTS, APPROVED_LABELS, approved_additions
from app.services.d12_e28a_e33g_pricing import (
    BRIDGING_NOTE_EN, BRIDGING_NOTE_RU, E33G_INITIAL_AMOUNTS, approved_e33g_items,
    merge_d12_e28a_e33g_items, merge_e33g_items, prepare_d12_e28a_e33g_catalog,
)
from tests.test_catalog_pricing import NOW, admin, database, fx_row
from tests.test_d12_e28a_pricing import authored_rows, column_values


def baseline_rows():
    return authored_rows(conversion=False) + [
        {"sku": "visa:E33G:express", "entity_type": "VISA", "entity_key": "E33G", "option_code": "express",
         "label_ru": "Сохранить ускоренный срок", "label_en": "Preserve expedited term", "amount_idr": 14_000_000,
         "price_qualifier": "EXACT", "show_price": True, "fee_verification_status": "VERIFIED", "sort_order": 20,
         "fee_note_ru": "Сохранить примечание", "fee_note_en": "Preserve note"},
        {"sku": "service:consultation:default", "entity_type": "SERVICE", "entity_key": "consultation", "option_code": "default",
         "label_ru": "Консультация", "label_en": "Consultation", "amount_idr": None, "price_qualifier": "CONTACT",
         "show_price": False, "fee_verification_status": "NEEDS_VERIFICATION", "sort_order": 10},
    ]


@pytest.fixture
def catalog():
    db = database()
    actor, fx = admin(db), fx_row(db)
    publish_catalog(db, items=baseline_rows(), expected_publication_version=0, effective_from=NOW,
                    reason="Synthetic combined baseline", idempotency_key="combined-baseline", actor_id=actor.id, now=NOW)
    db.commit()
    try:
        yield db, actor, fx
    finally:
        db.close(); db.bind.dispose()


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


def test_merge_adds_nine_and_preserves_catalog_order_e33g_initial_and_unrelated_fields(catalog):
    db, actor, fx = catalog
    original = _catalog_items(db, 1); before = deepcopy(original)
    draft = prepare_d12_e28a_e33g_catalog(db, expected_publication_version=1)
    assert original == before
    assert len(draft["items"]) == len(original) + 9
    for old, new in zip(original, draft["items"]):
        if old["entity_key"] == "D12" and old["option_code"] in APPROVED_AMOUNTS:
            code = old["option_code"]
            assert new == {**old, "amount_idr": APPROVED_AMOUNTS[code],
                           "label_ru": APPROVED_LABELS[code][0], "label_en": APPROVED_LABELS[code][1]}
        else:
            assert new == old
    assert draft["items"][len(original):] == approved_additions() + approved_e33g_items()
    assert merge_d12_e28a_e33g_items(draft["items"]) == draft["items"]
    assert db.query(PriceCatalogVersion).count() == db.query(FxMarketSnapshot).count() == 1


def test_dry_run_is_readonly_and_reports_one_atomic_delta_and_rollback_version(catalog):
    db, actor, fx = catalog
    result = run(db, options())
    assert result["mode"] == "DRY_RUN" and result["operation_key"] == OPERATION_KEY
    assert result["before_catalog_version"] == result["expected_publication_version"] == 1
    assert result["approved_exact_tuple_count"] == 14 and result["approved_contact_tuple_count"] == 1
    assert result["preserved_e33g_initial"] == E33G_INITIAL_AMOUNTS
    assert len(result["added_skus"]) == 9 and len(result["changed_label_skus"]) == 4
    assert set(result["changed_amount_skus"]) == {f"visa:D12:{code}" for code in APPROVED_AMOUNTS if code != "one-year-standard"}
    assert db.query(PriceCatalogVersion).count() == db.query(CatalogPublication).count() == db.query(AdminAction).count() == 1
    assert db.query(Service).count() == db.query(VisaType).count() == db.query(Order).count() == 0


def test_six_existing_canonical_options_replay_without_duplicates_and_only_conditional_bridging():
    rows = baseline_rows() + approved_e33g_items()
    assert merge_e33g_items(rows) == rows
    merged = merge_d12_e28a_e33g_items(rows)
    assert len(merged) == len(rows) + 3
    for row in approved_e33g_items():
        bridge = row["option_code"] in {"conversion-from-voa", "conversion-from-kitas"}
        assert row["fee_note_ru"] == (BRIDGING_NOTE_RU if bridge else None)
        assert row["fee_note_en"] == (BRIDGING_NOTE_EN if bridge else None)
    assert "применим и доступен" in BRIDGING_NOTE_RU and "допустимый Bridging-маршрут" in BRIDGING_NOTE_RU
    assert "applicable and available" in BRIDGING_NOTE_EN and "lawful Bridging route" in BRIDGING_NOTE_EN
    assert "7" not in BRIDGING_NOTE_EN and "30" not in BRIDGING_NOTE_EN  # No invented processing/legal SLA.


@pytest.mark.parametrize("mutation", ["duplicate", "sku-collision", "missing-standard", "missing-express",
    "standard-price", "express-price", "unverified-standard", "hidden-express", "missing-consultation",
    "missing-extension", "e33g-amount-drift", "unconditional-bridging", "e33g-label-drift"])
def test_missing_or_drifted_existing_approved_rows_fail_without_mutating_input(mutation):
    rows = baseline_rows()
    standard = next(row for row in rows if row["sku"] == "visa:E33G:standard")
    express = next(row for row in rows if row["sku"] == "visa:E33G:express")
    if mutation == "duplicate": rows.append(deepcopy(standard))
    elif mutation == "sku-collision": standard["sku"] = "service:visa-extension:e33g-extension"
    elif mutation == "missing-standard": rows.remove(standard)
    elif mutation == "missing-express": rows.remove(express)
    elif mutation == "standard-price": standard["amount_idr"] = 1
    elif mutation == "express-price": express["amount_idr"] = 1
    elif mutation == "unverified-standard": standard["fee_verification_status"] = "NEEDS_VERIFICATION"
    elif mutation == "hidden-express": express["show_price"] = False
    elif mutation.startswith("missing-"):
        key = "consultation" if mutation == "missing-consultation" else "visa-extension"
        rows = [row for row in rows if not (row["entity_type"] == "SERVICE" and row["entity_key"] == key and row["option_code"] == "default")]
    else:
        row = next(row for row in approved_e33g_items() if row["option_code"] == "conversion-from-voa")
        if mutation == "e33g-amount-drift": row["amount_idr"] = 1
        elif mutation == "unconditional-bridging": row["fee_note_en"] = "Bridging is included in the price."
        else: row["label_ru"] = "Different Admin label"
        rows.append(row)
    before = deepcopy(rows)
    with pytest.raises(PricingError): merge_d12_e28a_e33g_items(rows)
    assert rows == before


def test_apply_replay_audit_and_explicit_catalog_restore_leave_history_orders_fx_types_unchanged(catalog):
    db, actor, fx = catalog
    service = Service(name="Visa", slug="visa", category="visa", is_active=True)
    db.add(service); db.flush()
    snapshot = create_commercial_snapshot(db, entity_type="VISA", entity_key="D12", option_code="one-year-express", now=NOW)
    order = Order(user_id=actor.id, service_id=service.id, pricing_mode="CANONICAL",
                  commercial_price_snapshot_id=snapshot.id, amount_usd=snapshot.display_usdt)
    db.add(order); db.commit()
    for row in (service, snapshot, order, fx): db.refresh(row)
    persisted = [column_values(row) for row in (service, snapshot, order, fx)]
    original = _catalog_items(db, 1)
    original_ids = [row.id for row in db.query(PriceCatalogItem).order_by(PriceCatalogItem.id)]
    compositions_before = with_catalog_compositions(projection_payload(db, now=NOW), now=NOW)["compositions"]
    args = apply_args(db, actor)
    applied = run(db, args); replay = run(db, args)
    assert applied["mode"] == "APPLIED" and replay["mode"] == "ALREADY_APPLIED"
    assert applied["catalog_version"] == replay["catalog_version"] == 2
    assert applied["before_catalog_version"] == replay["before_catalog_version"] == 1
    assert applied["publication_version"] == replay["publication_version"] == 2
    assert db.query(PriceCatalogVersion).count() == db.query(CatalogPublication).count() == 2
    assert db.query(PriceCatalogVersion).filter_by(idempotency_key=OLD_D12_OPERATION_KEY).count() == 0
    assert db.query(FxMarketSnapshot).count() == 1 and db.query(VisaType).count() == 0
    assert _catalog_items(db, 1) == original
    assert [row.id for row in db.query(PriceCatalogItem).filter_by(catalog_version_id=1).order_by(PriceCatalogItem.id)] == original_ids
    for row, old in zip((service, snapshot, order, fx), persisted):
        db.refresh(row); assert column_values(row) == old
    action = db.query(AdminAction).filter_by(action_type="PRICE_CATALOG_PUBLISHED").order_by(AdminAction.id.desc()).first()
    assert action.admin_user_id == actor.id and "D12/E28A/E33G" in action.comment
    after = with_catalog_compositions(projection_payload(db, now=NOW), now=NOW)["compositions"]
    assert len(after) == 7
    for old, new in zip(compositions_before, after):
        for key in ("recipe_code", "amount_idr", "show_price", "price_qualifier", "components", "display_usd_approx", "display_usdt"):
            assert new[key] == old[key]
    restore_catalog(db, restore_catalog_version=applied["before_catalog_version"], expected_publication_version=2,
                    reason="Synthetic combined rollback", idempotency_key="combined-restore", actor_id=actor.id, now=NOW)
    db.commit()
    assert {row["sku"]: row for row in _catalog_items(db, 3)} == {row["sku"]: row for row in original}
    with pytest.raises(SafetyError, match="subsequent_edit"): run(db, args)


def test_fourteen_distinct_exact_prices_contact_and_existing_fx_math(catalog):
    db, actor, fx = catalog
    run(db, apply_args(db, actor))
    expected = {("VISA", "D12", code): amount for code, amount in APPROVED_AMOUNTS.items()}
    expected.update({("VISA", "E33G", code): amount for code, amount in E33G_INITIAL_AMOUNTS.items()})
    expected.update({(row["entity_type"], row["entity_key"], row["option_code"]): row["amount_idr"]
                     for row in approved_additions() + approved_e33g_items() if row["price_qualifier"] == "EXACT"})
    assert len(expected) == 14
    for seconds in (0, 61, 900, 901):
        payload = projection_payload(db, now=NOW + timedelta(seconds=seconds))
        for identity, amount in expected.items():
            rows = [row for row in payload["items"] if tuple(row[key] for key in ("entity_type", "entity_key", "option_code")) == identity]
            assert len(rows) == 1
            row = rows[0]
            assert row["amount_idr"] == str(amount) and row["price_qualifier"] == "EXACT"
            assert row["fee_verification_status"] == "VERIFIED" and row["show_price"] is True
            assert row["display_usd_approx"] == (str(idr_to_usd_approx(amount, fx.ask_idr_per_usdt)) if seconds <= 900 else None)
        contact = next(row for row in payload["items"] if row["option_code"] == "e28a-extension")
        assert contact["price_qualifier"] == "CONTACT" and contact["show_price"] is False
        assert contact["amount_idr"] is contact["display_usdt"] is contact["display_usd_approx"] is None


@pytest.mark.parametrize("changes,code", [
    ({"apply": True}, "apply_requires"), ({"apply": True, "actor_user_id": True}, "apply_requires"),
    ({"actor_user_id": 999}, "configured_active_root"), ({"expected_catalog_hash": "0" * 64}, "catalog_hash_changed"),
    ({"expected_publication_version": 100}, "publication_version_changed"),
    ({"projection_url": "https://evil.test/api/catalog/pricing"}, "url_not_allowed"),
])
def test_cli_preflight_denials_do_not_write(catalog, changes, code):
    db, actor, fx = catalog
    with pytest.raises(SafetyError, match=code): run(db, options(**changes))
    assert db.query(PriceCatalogVersion).count() == db.query(FxMarketSnapshot).count() == 1


def test_dirty_stale_projection_mismatch_and_blocked_root_fail_closed(catalog):
    db, actor, fx = catalog
    with pytest.raises(SafetyError, match="fresh_fx_required"): run(db, options(), now=NOW + timedelta(seconds=61))
    with pytest.raises(SafetyError, match="differs_from_database"): run(db, options(), loader=lambda url: {})
    actor.status = "blocked"
    with pytest.raises(SafetyError, match="requires_clean_session"): run(db, options())
    db.flush()
    with pytest.raises(SafetyError, match="configured_active_root"): run(db, options())
    db.rollback()


def test_no_bootstrap_or_stale_expected_version():
    db = database()
    try:
        admin(db); fx_row(db); db.commit()
        with pytest.raises(SafetyError, match="published_catalog_required"): run(db, options())
        assert db.query(PriceCatalogVersion).count() == 0
    finally:
        db.close(); db.bind.dispose()


def test_concurrent_catalog_edit_and_replay_request_drift_fail(catalog):
    db, actor, fx = catalog
    args = apply_args(db, actor)
    later = _catalog_items(db, 1); later[0]["label_en"] = "Concurrent owner edit"
    publish_catalog(db, items=later, expected_publication_version=1, effective_from=NOW,
                    reason="Concurrent edit", idempotency_key="combined-concurrent", actor_id=actor.id, now=NOW)
    db.commit()
    with pytest.raises(SafetyError, match="catalog_hash_changed"): run(db, args)
    with pytest.raises(PricingConflict, match="version changed"): prepare_d12_e28a_e33g_catalog(db, expected_publication_version=1)


@pytest.mark.parametrize("tamper", ["unrelated", "drop", "duplicate", "new-price", "unconditional-bridging", "preserved-price"])
def test_independent_cli_delta_guard_rejects_planner_drift(catalog, monkeypatch, tamper):
    from app.services import d12_e28a_e33g_pricing as planner
    db, actor, fx = catalog
    original = planner.prepare_d12_e28a_e33g_catalog
    def changed(*args, **kwargs):
        result = original(*args, **kwargs)
        if tamper == "unrelated": result["items"][0]["label_en"] = "Unapproved"
        elif tamper == "drop": result["items"].pop(0)
        elif tamper == "duplicate": result["items"].append(deepcopy(result["items"][0]))
        elif tamper == "new-price": result["items"][-1]["amount_idr"] = 1
        elif tamper == "preserved-price": result["items"][0]["amount_idr"] = 1
        else: next(row for row in result["items"] if row["option_code"] == "conversion-from-voa")["fee_note_en"] = "Bridging is included."
        return result
    monkeypatch.setattr(planner, "prepare_d12_e28a_e33g_catalog", changed)
    with pytest.raises(SafetyError, match="unapproved|delta_must|fourteen"): run(db, options())
    assert db.query(PriceCatalogVersion).count() == 1


@pytest.mark.parametrize("apply", [False, True])
@pytest.mark.parametrize("statement", [update(User).values(status="blocked"), update(Order).values(amount_usd=1),
    update(FxMarketSnapshot).values(ask_idr_per_usdt=1), update(PriceCatalogVersion).values(reason="rewrite"),
    update(Service).values(is_active=False), delete(PriceCatalogVersion)])
def test_sql_boundary_denies_customers_orders_fx_business_and_historical_edits(catalog, apply, statement):
    db, actor, fx = catalog
    with pytest.raises(SafetyError, match="sql_write_boundary"):
        with sql_write_boundary(db, apply=apply): db.execute(statement)
    db.rollback()


def test_final_commit_clock_expiry_rolls_back_entire_combined_publication(catalog, monkeypatch):
    import app.scripts.publish_d12_e28a_e33g_prices as cli
    import app.services.catalog_pricing as pricing
    db, actor, fx = catalog
    args = apply_args(db, actor); times = iter((NOW, NOW + timedelta(seconds=61)))
    class Clock:
        @staticmethod
        def now(tz): return next(times)
    original = pricing.publish_catalog
    def delayed(*args, **kwargs):
        assert kwargs["now"] is None
        return original(*args, **{**kwargs, "now": NOW})
    monkeypatch.setattr(cli, "datetime", Clock); monkeypatch.setattr(pricing, "publish_catalog", delayed)
    with pytest.raises(SafetyError, match="fx_expired_or_changed_before_commit"):
        cli.execute(db, args, root_telegram_id=100,
                    projection_loader=lambda url: with_catalog_compositions(projection_payload(db, now=NOW), now=NOW))
    assert db.query(PriceCatalogVersion).count() == db.query(CatalogPublication).count() == db.query(AdminAction).count() == 1
    assert latest_publication(db).catalog_version_id == 1


def test_cli_errors_do_not_leak_secret_arguments_or_exception_payload(monkeypatch, capsys):
    import app.scripts.publish_d12_e28a_e33g_prices as cli
    assert main(["--projection-url", "https://PRIVATE:SECRET@evil.test/"]) == 1
    output = capsys.readouterr()
    assert "invalid_arguments" in output.out and "SECRET" not in output.out + output.err
    def fail(*a, **kw): raise ValueError("synthetic-secret-DSN-do-not-log")
    monkeypatch.setattr(cli, "execute", fail)
    assert main(["--projection-url", "http://127.0.0.1:8000/api/catalog/pricing"]) == 1
    output = capsys.readouterr()
    assert "preflight_or_publication_failed" in output.out and "do-not-log" not in output.out + output.err
    assert "Traceback" not in output.out + output.err
