"""Approved excerpts, canonical pricing, and synthetic menu routing only."""

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.content import d12_e28a_summaries as summaries
from app.content.e33g_next_links import e33g_next_footer
from app.content.visas import _format_idr, get_visa_card, get_visa_menu_labels, visa_card_parts
from app.core.buttons import is_known_button_text
from app.handlers import menu
from app.services.locale import reset_current_locale, set_current_locale
from tests.pricing_fixture import pricing_projection


LOCALES = ("ru", "en")
ROUTES = {
    "/bali/visas/d12/", "/bali/visas/d12/extension/", "/bali/knowledge/d12/documents/",
    "/bali/knowledge/d12/180-days/", "/bali/visas/investor-kitas/",
    "/bali/knowledge/investor-kitas/e28a-requirements/", "/bali/knowledge/investor-kitas/extension/",
}
# Captured before this implementation using the same pricing fixture.
LEGACY_SHA256 = {
    "ru": {
        "E33G": "e0385abd749883a6521ae97519a1180b574f878a278c53d45857f281dbda40b0",
        "D1/D2": "141f704a1cb984166782fcc247925272720db20ddee89210ed8fafa4cdf8d8d9",
        "C1": "22f5c8bc6dbfa2934b58ae049e6e229f612b8c36a99b938a3147423effd16a22",
        "VOA": "2cd3d047a1c2e2c1441d42990901d3bfcd3dd5e951bc3ef2f3a4c2a296915aa6",
    },
    "en": {
        "E33G": "a7364664a7311f0e0234e35c3086c34f6947653183f7b0aef69fb518d749bb5f",
        "D1/D2": "ea7044280443ee0a62720d35dbc5e84a65f69f2088b9434d7a4042a9a79fe94b",
        "C1": "9cc6c4559e38f25e1334ee8760adac43bf108d9555b8ad84e5711b2a250bdd26",
        "VOA": "5b0adaa8d5b4fbcb6d168668e3a2a1491f2971aa75d718f316c7653a040f32d6",
    },
}


def projection():
    data = pricing_projection("18050")
    for code, amount, dollars in (
        ("one-year-standard", "7500000", "415"), ("one-year-express", "9500000", "525"),
        ("two-year-standard", "10500000", "580"), ("two-year-express", "13000000", "720"),
    ):
        row = next(row for row in data["items"] if row["entity_key"] == "D12" and row["option_code"] == code)
        row.update(amount_idr=amount, display_usd_approx=dollars)
    for entity_type, key, option, amount, dollars, qualifier in (
        ("SERVICE", "visa-extension", "d12-extension", "7000000", "390", "EXACT"),
        ("VISA", "E28A", "two-year-standard", "16000000", "885", "EXACT"),
        ("SERVICE", "visa-extension", "e28a-extension", None, None, "CONTACT"),
    ):
        data["items"].append({
            "sku": f"{entity_type.lower()}:{key}:{option}", "entity_type": entity_type,
            "entity_key": key, "option_code": option, "amount_idr": amount,
            "display_usd_approx": dollars, "show_price": qualifier == "EXACT",
            "price_qualifier": qualifier, "fee_verification_status": "VERIFIED" if qualifier == "EXACT" else "NEEDS_VERIFICATION",
            "sort_order": 10,
        })
    return data


def render(key, locale, data):
    token = set_current_locale(locale)
    try:
        return get_visa_card(key, data)
    finally:
        reset_current_locale(token)


@pytest.mark.parametrize("locale", LOCALES)
def test_approved_excerpt_hashes_conditions_and_all_seven_page_links(locale):
    data = projection()
    entries = summaries.approved_summaries()
    paths = set()
    for key in ("D12", "E28A"):
        row = entries[key][locale]
        assert hashlib.sha256(row["body"].encode()).hexdigest() == row["bodySha256"]
        assert row["body"] == "\n\n".join(unit["text"] for unit in row["sourceUnits"])
        body = render(key, locale, data)
        assert body.startswith(row["body"] + "\n\n")
        for link in row["links"]:
            paths.add(link["path"])
            url = "https://safrway.online/" + ("en/" if locale == "en" else "") + link["path"].lstrip("/")
            assert url in body
        assert "{{USD_" not in body and "localhost" not in body and "/_registry/" not in body
        parts = visa_card_parts(body)
        assert "\n\n".join(parts) == body
        assert all(len(part.encode("utf-16-le")) // 2 <= 3500 for part in parts)
    assert paths == ROUTES
    d12 = render("D12", locale, data)
    assert d12.count("180") >= 3 and "12" in d12
    assert "Виза на два года не равна" in d12 if locale == "ru" else "A two-year visa is not permission" in d12
    assert "Точный порог средств и схему со спонсором" in d12 if locale == "ru" else "The exact funds threshold and sponsorship arrangements" in d12
    assert "5 000 USD" not in d12 and "5,000 USD" not in d12
    assert "3 рабочих дня" not in d12 and "3 working days" not in d12
    e28a = render("E28A", locale, data)
    assert "PT PMA" in e28a and "90" in e28a
    assert "10 000 000 000 IDR" in e28a if locale == "ru" else "10,000,000,000 IDR" in e28a
    assert "не стоимость оформления KITAS" in e28a if locale == "ru" else "not the price of a KITAS application" in e28a


@pytest.mark.skipif(not os.environ.get("BALI_APPROVED_D12_E28A_SOURCE"), reason="Opt-in original approved source package")
def test_every_selected_paragraph_and_link_has_exact_ru_en_source_provenance():
    root = Path(os.environ["BALI_APPROVED_D12_E28A_SOURCE"])
    payload = json.loads(summaries.SUMMARY_PATH.read_text(encoding="utf-8"))
    assert hashlib.sha256(summaries.SUMMARY_PATH.read_bytes()).hexdigest() == summaries.SUMMARY_SHA256
    assert payload["locales"] == ["ru", "en"]
    assert hashlib.sha256((root / "ALL_LOCALES_CONTENT_SEO_MANIFEST.json").read_bytes()).hexdigest() == payload["sourceEvidence"]["manifestSha256"]
    for locales in payload["entries"].values():
        assert set(locales) == {"ru", "en"}
        for locale, row in locales.items():
            for unit in row["sourceUnits"]:
                assert unit["sourceFile"].startswith(locale.upper() + "/")
                raw = (root / unit["sourceFile"]).read_bytes()
                assert hashlib.sha256(raw).hexdigest() == unit["sourceFileSha256"]
                assert unit["text"] in [p.rstrip("\n") for p in raw.decode().split("\n\n")]
                assert hashlib.sha256(unit["text"].encode()).hexdigest() == unit["paragraphSha256"]
            for link in row["links"]:
                raw = (root / link["sourceFile"]).read_bytes()
                assert hashlib.sha256(raw).hexdigest() == link["sourceFileSha256"]


@pytest.mark.parametrize("locale", LOCALES)
def test_every_issuance_and_extension_price_follows_admin_projection(locale):
    data = projection()
    for key in ("D12", "E28A"):
        original = render(key, locale, data)
        for option in summaries.INITIAL_OPTIONS[key]:
            row = next(row for row in data["items"] if row["entity_key"] == key and row["option_code"] == option)
            assert f"{_format_idr(int(row['amount_idr']))} (≈ ${row['display_usd_approx']})" in original
            old = _format_idr(int(row["amount_idr"]))
            row.update(amount_idr=str(int(row["amount_idr"]) + 123000), display_usd_approx="12345", display_usdt="888.88")
            changed = render(key, locale, data)
            assert f"{_format_idr(int(row['amount_idr']))} (≈ $12345)" in changed
            assert old not in changed and "888.88" not in changed
    extension = next(row for row in data["items"] if row["option_code"] == "d12-extension")
    extension.update(amount_idr="7033000", display_usd_approx="54321")
    assert "Rp 7.033.000 (≈ $54321)" in render("D12", locale, data)
    assert "Rp 7.000.000" not in render("D12", locale, data)
    extension_line = next(line for line in render("E28A", locale, data).splitlines() if line.startswith("Продление E28A —" if locale == "ru" else "E28A extension —"))
    assert extension_line.endswith("Цена по запросу" if locale == "ru" else "Price on request")
    assert "Rp " not in extension_line


@pytest.mark.parametrize("locale", LOCALES)
@pytest.mark.parametrize("fx_state", ["expired", "unavailable"])
def test_expired_or_unavailable_fx_hides_usd_without_local_conversion_or_mutation(locale, fx_state):
    data = projection()
    if fx_state == "expired":
        data["derived_expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    else:
        data["fx"]["status"] = "unavailable"
    before = deepcopy(data)
    for key in ("D12", "E28A"):
        body = render(key, locale, data)
        assert "Rp " in body and "≈ $" not in body
    token = set_current_locale(locale)
    try:
        labels = get_visa_menu_labels(data)
        assert "≈ $" not in labels["D12"] and "≈ $" not in labels["E28A"]
    finally:
        reset_current_locale(token)
    assert data == before


@pytest.mark.parametrize("locale", LOCALES)
def test_missing_projection_never_uses_authored_amount_or_another_visa_price(locale):
    for key in ("D12", "E28A"):
        body = render(key, locale, None)
        assert "Rp " not in body and "≈ $" not in body
        assert "Цена по запросу" in body if locale == "ru" else "Price on request" in body


def corrupt(data, row, mutation):
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
    elif mutation == "wrong-key":
        row["entity_key"] = "E33G"
    else:
        row["amount_idr"] = {"zero": "0", "negative": "-1", "decimal": "7500000.0", "non-ascii": "٧٥٠٠٠٠٠"}[mutation]


@pytest.mark.parametrize("key", ["D12", "E28A"])
@pytest.mark.parametrize("mutation", ["missing", "duplicate", "unverified", "hidden", "from", "wrong-key", "zero", "negative", "decimal", "non-ascii"])
def test_menu_and_body_reject_the_same_untrusted_or_ambiguous_initial_price(key, mutation):
    data = projection()
    option = summaries.INITIAL_OPTIONS[key][0]
    row = next(row for row in data["items"] if row["entity_key"] == key and row["option_code"] == option)
    old_amount = _format_idr(int(row["amount_idr"]))
    corrupt(data, row, mutation)
    body = render(key, "en", data)
    assert old_amount not in body and "Price on request" in body
    label = get_visa_menu_labels(data)[key]
    assert ("7500k" if key == "D12" else "16kk") not in label


@pytest.mark.parametrize("mutation", ["missing", "duplicate", "unverified", "hidden", "from", "wrong-key", "zero", "negative", "decimal", "non-ascii"])
def test_extension_never_uses_authored_snapshot_or_initial_price(mutation):
    data = projection()
    row = next(row for row in data["items"] if row["option_code"] == "d12-extension")
    corrupt(data, row, mutation)
    body = render("D12", "en", data)
    assert "Rp 7.000.000" not in body
    assert "D12 extension — Price on request" in body
    assert "Rp 7.500.000" in body


@pytest.mark.parametrize("locale", LOCALES)
def test_menu_excludes_unrelated_price_options_and_adds_e28a_routable_button(locale):
    data = projection()
    for key in ("D12", "E28A"):
        row = next(row for row in data["items"] if row["entity_key"] == key)
        data["items"].append({**row, "sku": key + ":other", "option_code": "unapproved-variant", "amount_idr": "1", "sort_order": -100})
    token = set_current_locale(locale)
    try:
        labels = get_visa_menu_labels(data)
        assert "7500k" in labels["D12"] and "16kk" in labels["E28A"]
        assert "7000k" not in labels["D12"]
        texts = [button.text for row in menu.visa_keyboard(data).keyboard for button in row]
        for key in ("D12", "E28A"):
            assert labels[key] in texts
            assert menu.visa_key_from_button(labels[key]) == key
            assert is_known_button_text(labels[key])
        for alias in ("E28A", "Investor KITAS E28A"):
            assert menu.visa_key_from_button(alias) == "E28A"
            assert is_known_button_text(alias)
    finally:
        reset_current_locale(token)


@pytest.mark.parametrize("locale", LOCALES)
def test_e33g_d1_d2_c1_and_voa_cards_remain_byte_for_byte_unchanged(locale):
    for key, digest in LEGACY_SHA256[locale].items():
        body = render(key, locale, pricing_projection())
        if key == "E33G":
            suffix = "\n\n" + e33g_next_footer(locale)
            assert body.endswith(suffix)
            body = body[:-len(suffix)]
        assert hashlib.sha256(body.encode()).hexdigest() == digest


def test_summary_drift_fails_closed_without_loading_legacy_d12(tmp_path, monkeypatch):
    path = tmp_path / "drift.json"
    path.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(summaries, "SUMMARY_PATH", path)
    summaries.approved_summaries.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="artifact drift"):
            render("D12", "ru", None)
    finally:
        summaries.approved_summaries.cache_clear()


@pytest.mark.parametrize("locale", LOCALES)
def test_existing_handler_sends_e28a_card_via_mocked_transport_without_registration_or_network(locale, monkeypatch):
    data = projection()
    token = set_current_locale(locale)
    user_id = 987654321
    answer = AsyncMock(return_value=SimpleNamespace(message_id=123))
    message = SimpleNamespace(text=get_visa_menu_labels(data)["E28A"], from_user=SimpleNamespace(id=user_id), answer=answer)
    fetch = AsyncMock(return_value=data)
    monkeypatch.setattr(menu, "get_pricing_projection", fetch)
    monkeypatch.setattr(menu, "track_activity", AsyncMock())
    route = Mock()
    monkeypatch.setattr(menu, "set_route_context", route)
    try:
        asyncio.run(menu.visa_category_handler(message))
        fetch.assert_awaited_once()
        route.assert_called_once_with(user_id, country="Бали", section="Визы", service="E28A")
        assert "\n\n".join(call.args[0] for call in answer.await_args_list) == get_visa_card("E28A", data)
        assert answer.await_args_list[-1].kwargs["reply_markup"] is not None
        assert menu.SERVICE_WAITING_USERS[user_id]["category"] == "E28A"
    finally:
        reset_current_locale(token)
        menu.SERVICE_WAITING_USERS.pop(user_id, None)
        menu.VISA_CONTEXT_USERS.pop(user_id, None)
        menu.SERVICE_PROMPT_MESSAGES.pop(user_id, None)
