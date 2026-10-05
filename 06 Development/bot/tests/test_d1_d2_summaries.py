from copy import deepcopy
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json

import pytest

from app.content.d1_d2_summaries import DATA_DIR, KEYS, INITIAL_OPTIONS, approved_sources, render_summary
from app.content.visas import _format_idr, get_visa_card, get_visa_menu_labels, visa_card_parts
from app.services.locale import reset_current_locale, set_current_locale
from tests.pricing_fixture import pricing_projection


LOCALES = ("ru", "en", "zh-Hans", "ko", "fr", "de", "ja", "hi", "es", "ar")


def projection():
    data = pricing_projection("18050")
    amounts = {"d1-one-year-standard": 5_000_000, "d1-one-year-express": 6_500_000,
               "d1-two-year-standard": 9_000_000, "d1-two-year-express": 11_000_000,
               "d2-one-year-standard": 5_500_000, "d2-one-year-express": 7_000_000,
               "d2-two-year-standard": 9_000_000, "d2-two-year-express": 11_000_000}
    for row in data["items"]:
        if row["entity_key"] == "D1/D2":
            if row["option_code"] in amounts:
                set_amount(row, amounts[row["option_code"]])
            else:
                row.update(amount_idr=None, display_usd_approx=None, show_price=False, price_qualifier="CONTACT")
    for code in ("d1-extension", "d2-extension"):
        row = {"sku": "service:visa-extension:" + code, "entity_type": "SERVICE", "entity_key": "visa-extension",
               "option_code": code, "show_price": True, "price_qualifier": "EXACT", "fee_verification_status": "VERIFIED"}
        set_amount(row, 2_500_000)
        data["items"].append(row)
    return data


def set_amount(row, amount):
    row["amount_idr"] = str(amount)
    row["display_usd_approx"] = str((Decimal(amount) / Decimal("18050") / 5).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 5)


def render(key, locale, data):
    return render_summary(key, locale, data, format_idr=_format_idr)


@pytest.mark.parametrize("locale", LOCALES)
def test_all_30_full_source_templates_have_pinned_revisions_and_unit_bindings(locale):
    entries = approved_sources(locale)
    manifest = json.loads((DATA_DIR / "bindings.v1.json").read_text())
    assert manifest["sourceEvidence"]["manifestSha256"] == "f577b8837a198578e534c2e25d3f51b599faddf98dfceb1e8d8f880042591de8"
    assert list(entries) == list(KEYS)
    assert manifest["runtimeLanguages"] == ["ru", "en"]
    for key, (source, metadata) in entries.items():
        assert len(metadata["units"]) == 10
        assert len(metadata["bindings"]) == (1 if key == "d1_d2_extension" else 6)
        assert "sha256:" + hashlib.sha256(source["bodyMarkdown"].encode()).hexdigest() == source["bodyRevision"]
        if locale not in {"ru", "en"}:
            with pytest.raises(ValueError, match="storage-only"):
                render(key, locale, projection())


@pytest.mark.parametrize("locale", ["ru", "en"])
@pytest.mark.parametrize("key", KEYS)
def test_every_nonprice_source_segment_is_preserved_in_order_and_links_are_live_routes(locale, key):
    source, metadata = approved_sources(locale)[key]
    rendered = render(key, locale, projection())
    cursor = start = 0
    for binding in sorted(metadata["bindings"], key=lambda row: row["start"]):
        untouched = source["bodyMarkdown"][start:binding["start"]]
        index = rendered.find(untouched, cursor)
        assert index >= cursor
        cursor = index + len(untouched)
        start = binding["end"]
    assert source["bodyMarkdown"][start:].rstrip("\n") in rendered[cursor:]
    path = {"d1": "d1/", "d2": "d2/", "d1_d2_extension": "d1-d2/extension/"}[key]
    assert rendered.endswith("https://safrway.online/" + ("en/" if locale == "en" else "") + "bali/visas/" + path)
    assert "{{USD_" not in rendered
    if key != "d1_d2_extension":
        assert "2 000 USD" in rendered  # A document condition, not a service price.


@pytest.mark.parametrize("locale", ["ru", "en"])
def test_each_initial_and_extension_occurrence_follows_admin_projection_not_authored_amount(locale):
    data = projection()
    for index, code in enumerate(sorted(INITIAL_OPTIONS)):
        row = next(row for row in data["items"] if row["option_code"] == code)
        set_amount(row, 3_010_000 + index * 100_000)
        body = render(code[:2], locale, data)
        assert f"{_format_idr(int(row['amount_idr']))} (≈ ${row['display_usd_approx']})" in body
    extension = next(row for row in data["items"] if row["option_code"] == "d1-extension")
    set_amount(extension, 2_030_000)
    d1 = render("d1", locale, data)
    assert d1.count("Rp 2.030.000 (≈ $110)") == 2
    assert "Rp 2.500.000" not in d1
    # Same number for issuance and future x2 extension must not bind by amount.
    assert "Rp 5.000.000" not in d1


@pytest.mark.parametrize("locale", ["ru", "en"])
def test_shared_extension_equal_then_divergent_prices_explicitly_identify_both_variants(locale):
    data = projection()
    equal = render("d1_d2_extension", locale, data)
    assert equal.count("Rp 2.500.000 (≈ $140)") == 1
    row = next(row for row in data["items"] if row["option_code"] == "d2-extension")
    set_amount(row, 2_750_000)
    split = render("d1_d2_extension", locale, data)
    assert "D1: Rp 2.500.000 (≈ $140) / D2: Rp 2.750.000 (≈ $150)" in split


@pytest.mark.parametrize("locale", ["ru", "en"])
def test_expired_and_unavailable_fx_keep_idr_hide_derived_without_mutation(locale):
    for expired in (True, False):
        data = projection()
        if expired:
            data["derived_expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        else:
            data["fx"]["status"] = "unavailable"
        before = deepcopy(data)
        for key in KEYS:
            body = render(key, locale, data)
            assert "Rp 2.500.000" in body
            assert "≈ $" not in body
            assert "{{USD_" not in body
        assert data == before


@pytest.mark.parametrize("mutation", ["missing", "duplicate", "unverified", "hidden", "from", "negative", "wrong-key"])
def test_ambiguous_extension_never_uses_source_snapshot_or_another_visa(mutation):
    data = projection()
    row = next(row for row in data["items"] if row["option_code"] == "d1-extension")
    if mutation == "missing":
        data["items"].remove(row)
    elif mutation == "duplicate":
        data["items"].append(deepcopy(row))
    elif mutation == "unverified":
        row["fee_verification_status"] = "NEEDS_VERIFICATION"
    elif mutation == "hidden":
        row["show_price"] = False
    elif mutation == "from":
        row["price_qualifier"] = "FROM"
    elif mutation == "negative":
        row["amount_idr"] = "-1"
    else:
        row["entity_key"] = "other"
    body = render("d1", "en", data)
    assert "Rp 2.500.000" not in body
    assert body.count("Price on request") == 2
    shared = render("d1_d2_extension", "en", data)
    assert "D1: Price on request / D2: Rp 2.500.000" in shared


@pytest.mark.parametrize("locale", ["ru", "en"])
def test_existing_combined_menu_sends_all_three_summaries_without_legacy_five_year_prices(locale):
    token = set_current_locale(locale)
    try:
        data = pricing_projection()  # Deliberately has old priced five-year rows.
        body = get_visa_card("D1/D2", data)
        for key in KEYS:
            assert render(key, locale, data) in body
        for amount in ("18.000.000", "20.000.000", "22.000.000"):
            assert amount not in body
        parts = visa_card_parts(body)
        assert len(parts) > 1
        assert all(len(part.encode("utf-16-le")) // 2 <= 3500 for part in parts)
        assert "\n\n".join(parts) == body
        assert "D1/D2" in get_visa_menu_labels(data)
        empty = get_visa_card("D1/D2", None)
        assert "Rp " not in empty and "≈ $" not in empty and "{{USD_" not in empty
    finally:
        reset_current_locale(token)


def test_source_drift_fails_closed_instead_of_legacy_fallback(tmp_path, monkeypatch):
    import app.content.d1_d2_summaries as summaries
    monkeypatch.setattr(summaries, "DATA_DIR", tmp_path)
    (tmp_path / "bindings.v1.json").write_text("{}")
    approved_sources.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="manifest drift"):
            render("d1", "en", None)
    finally:
        approved_sources.cache_clear()


@pytest.mark.parametrize("canonical", ["12345", "0"])
def test_canonical_dollar_field_is_verbatim_even_when_different_from_local_ratio(canonical):
    data = projection()
    for row in data["items"]:
        row["display_usd_approx"] = canonical
        row["display_usdt"] = "888.88"
    for locale in ("ru", "en"):
        for key in KEYS:
            rendered = render(key, locale, data)
            assert f"≈ ${canonical}" in rendered
            assert "888.88" not in rendered


def test_menu_cannot_emit_expired_reference_or_any_five_year_price():
    data = projection()
    data["derived_expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    assert "≈ $" not in get_visa_menu_labels(data)["D1/D2"]


@pytest.mark.parametrize("locale", ["ru", "en"])
@pytest.mark.parametrize("mutation", ["from", "unverified", "duplicate"])
def test_menu_and_body_reject_the_same_untrusted_initial_price(locale, mutation):
    data = projection()
    row = next(row for row in data["items"] if row["option_code"] == "d1-one-year-standard")
    set_amount(row, 3_210_000)
    token = set_current_locale(locale)
    try:
        before = get_visa_menu_labels(data)
        assert "3210k" in before["D1/D2"]
        assert "Rp 3.210.000" in render("d1", locale, data)
        if mutation == "from":
            row["price_qualifier"] = "FROM"
        elif mutation == "unverified":
            row["fee_verification_status"] = "NEEDS_VERIFICATION"
        else:
            duplicate = deepcopy(row)
            duplicate["sku"] += ":duplicate"
            data["items"].append(duplicate)
        menu = get_visa_menu_labels(data)
        body = render("d1", locale, data)
        assert "3210k" not in menu["D1/D2"]
        assert "5500k" in menu["D1/D2"]
        assert "Rp 3.210.000" not in body
        assert body.count("Price on request" if locale == "en" else "Цена по запросу") == 1
        assert {key: label for key, label in menu.items() if key != "D1/D2"} == {
            key: label for key, label in before.items() if key != "D1/D2"
        }
    finally:
        reset_current_locale(token)


@pytest.mark.parametrize("amount", ["0", "-1", "3210000.0", "٣٢١٠٠٠٠"])
def test_menu_and_body_require_positive_ascii_initial_amount(amount):
    data = projection()
    row = next(row for row in data["items"] if row["option_code"] == "d1-one-year-standard")
    row["amount_idr"] = amount
    token = set_current_locale("en")
    try:
        assert "5500k" in get_visa_menu_labels(data)["D1/D2"]
        assert render("d1", "en", data).count("Price on request") == 1
    finally:
        reset_current_locale(token)


def test_menu_never_uses_low_priced_five_year_or_extension_rows():
    data = pricing_projection("18050")
    for row in data["items"]:
        if row["entity_key"] == "D1/D2":
            if row["option_code"] in INITIAL_OPTIONS:
                row["price_qualifier"] = "FROM"
            else:
                set_amount(row, 1_000)
    data["items"].extend(row for row in projection()["items"] if row["entity_type"] == "SERVICE")
    assert get_visa_menu_labels(data)["D1/D2"] == "D1/D2"
