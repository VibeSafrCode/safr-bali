"""Local rendering and approved source provenance; no transport or API calls."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re

import pytest

from app.content import e33g_next_links as links
from app.content.visas import _approved_summary, get_visa_card, get_visa_menu_labels, visa_card_parts
from app.services.locale import reset_current_locale, set_current_locale
from tests.pricing_fixture import pricing_projection


LOCALES = ("ru", "en")
BEFORE_FOOTER_SHA256 = {
    "ru": "e0385abd749883a6521ae97519a1180b574f878a278c53d45857f281dbda40b0",
    "en": "a7364664a7311f0e0234e35c3086c34f6947653183f7b0aef69fb518d749bb5f",
}
# Captured before the E33G-only footer using the same canonical fixture.
OTHER_CARD_SHA256 = {
    "ru": {
        "D1/D2": "141f704a1cb984166782fcc247925272720db20ddee89210ed8fafa4cdf8d8d9",
        "C1": "22f5c8bc6dbfa2934b58ae049e6e229f612b8c36a99b938a3147423effd16a22",
        "VOA": "2cd3d047a1c2e2c1441d42990901d3bfcd3dd5e951bc3ef2f3a4c2a296915aa6",
        "D12": "e6bb510a155b17204bb0fffefe1c5933f089d4ad8da34d229078bec256a56980",
        "E28A": "9d533bbc7c9767a92d7d83ba714a4c047a2ab5c0d4ad595db2a36633b2a58091",
    },
    "en": {
        "D1/D2": "ea7044280443ee0a62720d35dbc5e84a65f69f2088b9434d7a4042a9a79fe94b",
        "C1": "9cc6c4559e38f25e1334ee8760adac43bf108d9555b8ad84e5711b2a250bdd26",
        "VOA": "5b0adaa8d5b4fbcb6d168668e3a2a1491f2971aa75d718f316c7653a040f32d6",
        "D12": "6a6d5c585982317dfda3e3c9e61fdc746ce42f8af128c92719552e0c6f447ca2",
        "E28A": "00b99cdd73de38573298facfebc8bb0097d2047371ed904299aa3d6fb53c907b",
    },
}


def render(key, locale, data):
    token = set_current_locale(locale)
    try:
        return get_visa_card(key, data)
    finally:
        reset_current_locale(token)


def old_prefix(body, locale):
    suffix = "\n\n" + links.e33g_next_footer(locale)
    assert body.endswith(suffix)
    return body[:-len(suffix)]


@pytest.mark.parametrize("locale", LOCALES)
def test_four_exact_localized_web_links_have_no_prices_accounts_or_new_bot_protocol(locale):
    footer = links.e33g_next_footer(locale)
    rows = links.approved_links()[locale]
    prefix = "https://safrway.online/" + ("en/" if locale == "en" else "")
    assert footer.split("\n\n") == [f"{row['label']}\n{prefix}{row['path'].lstrip('/')}" for row in rows]
    assert [(row["contentId"], row["path"]) for row in rows] == list(links.TARGETS)
    assert footer.count("https://") == 4
    assert len(set(re.findall(r"https://[^\s]+", footer))) == 4
    assert "Rp " not in footer and "IDR" not in footer and "$" not in footer
    assert not any(value in footer for value in ("/account", "/api/", "?start=", "callback", "/_registry/", "localhost"))


def test_manifest_is_content_addressed_ru_en_link_metadata_only_not_a_second_article_or_price_source():
    raw = links.LINKS_PATH.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == links.LINKS_SHA256
    payload = json.loads(raw)
    assert payload["locales"] == ["ru", "en"]
    assert set(payload["entries"]) == {"ru", "en"}
    assert payload["sourceEvidence"]["sourceFileSha256"] == "40b683353723fde13879edd3f3780852a90d1198b8fc89c1d9c3f8d6c5fa6f23"
    for rows in payload["entries"].values():
        assert len(rows) == 4
        for row in rows:
            assert set(row) == {"sourceContentId", "contentId", "path", "label", "labelSha256", "sourceBodySha256", "sourceRevisionSha256"}
            assert "\n" not in row["label"]
            assert hashlib.sha256(row["label"].encode()).hexdigest() == row["labelSha256"]


@pytest.mark.skipif(not os.environ.get("BALI_APPROVED_E33G_NEXT_SOURCE"), reason="Opt-in original approved source package")
def test_link_labels_and_body_revisions_are_exact_supplied_ru_en_h1s():
    root = Path(os.environ["BALI_APPROVED_E33G_NEXT_SOURCE"])
    payload = json.loads(links.LINKS_PATH.read_text(encoding="utf-8"))
    raw = (root / payload["sourceEvidence"]["sourceFile"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == payload["sourceEvidence"]["sourceFileSha256"]
    source = json.loads(raw)
    for locale, rows in payload["entries"].items():
        for row in rows:
            matches = [item for item in source if item["locale"] == locale and item["contentId"] == row["sourceContentId"]]
            assert len(matches) == 1
            original = matches[0]
            assert row["label"] == original["title"] == re.search(r"^# (.+)$", original["bodyMarkdown"], re.MULTILINE).group(1)
            assert row["sourceBodySha256"] == original["bodySHA256"] == hashlib.sha256(original["bodyMarkdown"].encode()).hexdigest()
            assert row["sourceRevisionSha256"] == original["sourceRevisionSHA256"]


@pytest.mark.parametrize("locale", LOCALES)
def test_whole_legacy_card_is_an_unchanged_exact_prefix_with_initial_prices(locale):
    body = render("E33G", locale, pricing_projection())
    prefix = old_prefix(body, locale)
    assert hashlib.sha256(prefix.encode()).hexdigest() == BEFORE_FOOTER_SHA256[locale]
    assert prefix.startswith(_approved_summary("E33G", locale)["body"] + "\n\n")
    assert "Rp 12.000.000" in prefix and "Rp 14.000.000" in prefix


@pytest.mark.parametrize("locale", LOCALES)
def test_next_stage_projection_prices_are_not_copied_into_the_initial_card_or_menu(locale):
    data = pricing_projection()
    standard = next(row for row in data["items"] if row["entity_key"] == "E33G")
    identities = [
        ("SERVICE", "visa-extension", "e33g-extension"),
        ("SERVICE", "consultation", "e33g-document-review"),
        *(('VISA', 'E33G', "conversion-from-" + status) for status in ("voa", "c1", "d12", "kitas")),
    ]
    for entity_type, key, code in identities:
        data["items"].append({**deepcopy(standard), "entity_type": entity_type, "entity_key": key,
                              "option_code": code, "sku": f"{entity_type.lower()}:{key}:{code}",
                              "label": {"ru": "NEXT-STAGE-ONLY", "en": "NEXT-STAGE-ONLY"},
                              "amount_idr": "17654123", "display_usd_approx": "12345", "sort_order": 0})
    before = deepcopy(data)
    body = render("E33G", locale, data)
    assert hashlib.sha256(old_prefix(body, locale).encode()).hexdigest() == BEFORE_FOOTER_SHA256[locale]
    assert "NEXT-STAGE-ONLY" not in body and "Rp 17.654.123" not in body and "$12345" not in body
    token = set_current_locale(locale)
    try:
        assert get_visa_menu_labels(data)["E33G"] == get_visa_menu_labels(pricing_projection())["E33G"]
    finally:
        reset_current_locale(token)
    assert data == before


@pytest.mark.parametrize("locale", LOCALES)
def test_initial_price_changes_still_follow_projection_and_footer_is_price_independent(locale):
    data = pricing_projection()
    row = next(row for row in data["items"] if row["entity_key"] == "E33G" and row["option_code"] == "standard")
    row.update(amount_idr="12345000", display_usd_approx="555")
    body = render("E33G", locale, data)
    prefix = old_prefix(body, locale)
    assert "Rp 12.345.000 (≈ $555)" in prefix and "Rp 12.000.000" not in prefix
    assert "Rp 14.000.000" in prefix
    data["derived_expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    expired = render("E33G", locale, data)
    assert "Rp 12.345.000" in expired and "≈ $" not in expired
    missing = render("E33G", locale, None)
    assert "Rp " not in missing
    assert expired.endswith(links.e33g_next_footer(locale)) and missing.endswith(links.e33g_next_footer(locale))


@pytest.mark.parametrize("locale", LOCALES)
def test_all_main_body_and_four_link_paragraphs_survive_telegram_pagination(locale):
    body = render("E33G", locale, pricing_projection())
    parts = visa_card_parts(body)
    assert "\n\n".join(parts) == body
    assert all(len(part.encode("utf-16-le")) // 2 <= 3500 for part in parts)
    for paragraph in links.e33g_next_footer(locale).split("\n\n"):
        assert any(paragraph in part for part in parts)


@pytest.mark.parametrize("locale", LOCALES)
def test_other_cards_remain_byte_for_byte_unchanged(locale):
    for key, digest in OTHER_CARD_SHA256[locale].items():
        assert hashlib.sha256(render(key, locale, pricing_projection()).encode()).hexdigest() == digest


def test_changed_manifest_fails_closed_without_sending_unapproved_links(tmp_path, monkeypatch):
    path = tmp_path / "changed-links.json"
    path.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(links, "LINKS_PATH", path)
    links.approved_links.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="artifact drift"):
            render("E33G", "ru", pricing_projection())
    finally:
        links.approved_links.cache_clear()


@pytest.mark.parametrize("locale", ["de", "ar"])
def test_bot_does_not_author_new_translations_or_fallback_for_other_locales(locale):
    with pytest.raises(ValueError, match="Unsupported"):
        links.e33g_next_footer(locale)
