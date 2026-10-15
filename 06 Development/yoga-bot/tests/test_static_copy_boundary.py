"""Static-template presentation only; API variables and canonical input bytes stay exact."""
from copy import deepcopy
import hashlib
import json
import re
import unittest

from yoga_bot.config import YOGA_PREVIEW_SITE_BASE
from yoga_bot.presentation import visa_display_copy
from yoga_bot.visas import CARDS, card_reply, renderer
from yoga_bot.menu import Menus
from yoga_bot.catalog import load_catalog
from tests.test_foundation import settings, SHARED


def projection(*, expires="2099-01-01T00:00:00Z"):
    operations = {
        "E33G": ("standard", "express"),
        "D12": ("one-year-standard", "one-year-express", "two-year-standard", "two-year-express"),
        "E28A": ("two-year-standard",),
        "D1/D2": tuple(f"{visa}-{years}-year-{tariff}" for visa in ("d1", "d2")
                       for years in ("one", "two") for tariff in ("standard", "express")),
        "C1": ("standard",), "VOA": ("standard",),
    }
    items = []
    for key, options in operations.items():
        for option in options:
            items.append({"sku": f"VISA:{key}:{option}", "entity_type": "VISA", "entity_key": key,
                          "option_code": option, "label": {"ru": "Тариф", "en": "Option"},
                          "amount_idr": str(1_000_000 + len(items) * 10_000), "show_price": True,
                          "price_qualifier": "EXACT", "fee_verification_status": "VERIFIED",
                          "display_usd_approx": str(60 + len(items) * 5), "display_usdt": "61.23",
                          "fee_note": {"ru": "Примечание", "en": "Fee note"}, "sort_order": len(items)})
    for option in ("c1-extension", "voa-extension", "d12-extension", "e28a-extension", "d1-extension", "d2-extension"):
        items.append({"sku": f"SERVICE:visa-extension:{option}", "entity_type": "SERVICE",
                      "entity_key": "visa-extension", "option_code": option,
                      "label": {"ru": "Продление", "en": "Extension"}, "amount_idr": "500000",
                      "show_price": True, "price_qualifier": "EXACT", "fee_verification_status": "VERIFIED",
                      "display_usd_approx": "30", "sort_order": len(items)})
    return {"projection_id": "synthetic-static-boundary", "catalog_version_id": 1, "fx_snapshot_id": 7,
            "formula_version": "accepted-fixture", "derived_expires_at": expires,
            "fx": {"status": "fresh", "ask_idr_per_usdt": "17635"}, "items": items}


def expected_static_card(key, locale, origin):
    """Independent None-projection oracle assembled from selected static units.

    Never rebrand an assembled card or derive a second price catalog. The price
    function remains the default canonical one, checked by pre-change hashes.
    """
    core = renderer()
    from safr_content_core import d1_d2_summaries as d1, d12_e28a_summaries as d12, e33g_next_links
    from safr_content_core.locale import set_current_locale, reset_current_locale
    raw = core._i18n.template
    def copy(value):
        return value.replace("SAFRWAY", "Yoga Ganster")
    def link(value):
        assert value.startswith("https://safrway.online/")
        return origin + value.removeprefix("https://safrway.online")
    disclaimers = [copy(raw("visa.disclaimer." + name, locale=locale))
                   for name in ("conditionsMayChange", "verifyBeforePayment", "writeNext")]
    if key in d12.INITIAL_OPTIONS:
        row = d12.approved_summaries()[key][locale]
        prices = [copy(label) + " — " + d12.LABELS[locale]["unavailable"] for label in d12.LABELS[locale][key]]
        prices.append(copy(d12.LABELS[locale][d12.EXTENSION_OPTIONS[key]]) + " — " + d12.LABELS[locale]["unavailable"])
        prefix = "https://safrway.online/" + ("en/" if locale == "en" else "")
        links = "\n\n".join(copy(item["label"]) + "\n" + link(prefix + item["path"].lstrip("/")) for item in row["links"])
        body = "\n\n".join((copy(row["body"]), "\n".join(prices), links))
        return "\n\n".join([body, *disclaimers])
    if key == "D1/D2":
        cards = []
        for selected in d1.KEYS:
            row, metadata = d1.approved_sources(locale)[selected]
            fragments, cursor = [], 0
            for binding in sorted(metadata["bindings"], key=lambda item: item["start"]):
                fragments.extend((copy(row["bodyMarkdown"][cursor:binding["start"]]),
                                  d1._price_text(binding["operationId"], None, locale, core._visas._format_idr)))
                cursor = binding["end"]
            fragments.append(copy(row["bodyMarkdown"][cursor:]))
            url = "https://safrway.online/" + ("en/" if locale == "en" else "") + d1.ROUTES[selected]
            cards.append("".join(fragments).rstrip("\n") + "\n\n" + link(url))
        return "\n\n".join([*cards, *disclaimers])
    summary = core._visas._approved_summary(key, locale)
    if summary:
        body = copy(summary["body"])
    elif locale == "ru":
        body = copy(json.loads(core._visas.VISAS_PATH.read_text(encoding="utf8"))[key]["text"].replace("\\n", "\n"))
    else:
        body = copy(raw("visa.other.body", locale=locale))
    token = set_current_locale(locale)
    try:
        price = core._visas._canonical_price_block(key, None)
    finally:
        reset_current_locale(token)
    if summary and summary.get("priceUnitNote"):
        price = copy(summary["priceUnitNote"]) + "\n" + price
    result = "\n\n".join([body, price, *disclaimers])
    if summary:
        result += "\n\n" + link(summary["publicUrl"])
    if key == "E33G":
        prefix = "https://safrway.online/" + ("en/" if locale == "en" else "")
        result += "\n\n" + "\n\n".join(copy(item["label"]) + "\n" + link(prefix + item["path"].lstrip("/"))
                                         for item in e33g_next_links.approved_links()[locale])
    return result


# Captured before adding the hook, using the source-pinned default renderer and
# the exact synthetic projection above. Never repin these to hide a display delta.
CARD_ORDER = ("E33G", "D12", "D1/D2", "C1", "VOA", "Другая виза", "E28A")
MAIN_HASHES = {
    "none": {
        "ru": ("cb96cafaa8cff2d461a1f138d41c7695869b2820c4d3ddbcd4c670c38ddb0273", "9defc04a3840b6d14b3b4f7b1218a7c3ad3d7e355f823898ef76876dc1cd3f7d", "022c481a0518de4a4efea440fb805a87e8bde379e96ac13625a92c7f6df0048c", "4bc6a2fd0a5ba63ee3efc3e1e7edfe27caa4cf5ca009b015c2bca8f22af38b13", "1362a2029929d50c476ddfceafc95d299d1260331d864a7f8aaf44fbf56182b2", "2c72ae55b75293f0d02fd3d050ce9ab277fb9a77255c33e7d8590bc2ad075b14", "9d533bbc7c9767a92d7d83ba714a4c047a2ab5c0d4ad595db2a36633b2a58091"),
        "en": ("91dc7c9938ae1efac137aa0f64eb5fb4f2058abdc3d9f6e675cbf494d988c6a6", "5a71967ade9513f3675ca31e855a18f945da3cc7d475d5bcdfef44df81a7dd6b", "ff88e958f7e758f5b67aa8f18684f36b369cfb3c9497c60f00857ca8f517c74f", "4c8e52c00ef1f0e29d1114be6708e9704b868dfffe4afcc86d9f133adb6b739b", "4eaf7cd60ce94dc25da3ab5ce8bbde851bfd08d4120024867c0454e160aeee5e", "cd8489d69d3d2a1faf00b8c94e97c0dca8f7dd26c1fe1efe55965e228b82f9ff", "00b99cdd73de38573298facfebc8bb0097d2047371ed904299aa3d6fb53c907b"),
    },
    "fresh": {
        "ru": ("7c1b492eee311c626efb2ee12054e3a231c74378b504fb4dadeff65c6b85e751", "68b745b1414a1c9e7398935ec2f70e0951584841ddd43c3f1bafe8831f136f85", "7c5b25035d986f24f9b01defa70536f80764d52bc2f347821e6fb0a502c58f2a", "b074fdab391e7d9d3e7e10600f7753b24d61154ae71829a5c1b7b454f4c7b486", "a490eab905b614b6287f990e86e5a73c8b4a16794267c74059066f1a9dff8d46", "2c72ae55b75293f0d02fd3d050ce9ab277fb9a77255c33e7d8590bc2ad075b14", "61410e97f78c07e5cad8a3d5698051f3669581dc5ab8d31979724e055a1afe1c"),
        "en": ("3f5d425d781bcea720a31de182f1bf46174b0675d59db070fa765045e4316957", "d7d0341451c0f71dead93c2f6a27d445e4fec25cabdcc900312e542ae199f8f1", "289d39ce6fb410d1c9281631feeefed74c0c2e611439f91c6c0966cbd2222bb2", "6effc91d0fdd3802d6eaa15c7ef61b8103b9f20f4b3a89fcfe8ec6b86fa4a18d", "d04953b4dceb3383fec40fbf2da846a43dc5e0d4516ab74240770eea89c80157", "cd8489d69d3d2a1faf00b8c94e97c0dca8f7dd26c1fe1efe55965e228b82f9ff", "fd84333e5e8a28d73f952072686bebb6f12702461712ed11bc174305528927b5"),
    },
    "expired": {
        "ru": ("03dc14baf28abbc0acf5bd1119b11440cb0b5cc19891c3159db619481dd6eb5e", "140ec697e64a64380f5be90c16e9d821b791847f8ae24123ee6925b04b18ee7b", "6ea8925eef109a0a6d00df48e13c59c0124f88957118a08ad5241deef8574400", "a55acb3c90beec542b310f5a0b11a00eca895e5dd54c606d438ac97f3d00ff3f", "46e0c3ca83bc322edd110f2e2612342257762e2faf7e851e84f7e44c8c4401fa", "2c72ae55b75293f0d02fd3d050ce9ab277fb9a77255c33e7d8590bc2ad075b14", "a7731b74e05f9533f2410192d2c3462c1d443dba4a7fa29c24dad5523e239133"),
        "en": ("68e5213920886179d930d1cb14b319583713eb120862ec9905a5702816e54396", "4c65fce7eaf0fe0846d7c162ed171c1f4ad405e244cbfe4927d1a9c3a9b192b2", "5d3fe742d2319771b41a64916a38e428b64d7fc66336761fda509790ed69bd7b", "39befee4d916de45e8a2b8a273bba297a1da9741fca7fc6a909b1a89dac92f72", "0e3b86d8f412d01e6eef47ce23535525326f7f8e1dd8c464e146ccd523a531bb", "cd8489d69d3d2a1faf00b8c94e97c0dca8f7dd26c1fe1efe55965e228b82f9ff", "f8f04daac3ca077bcf2d518c912f5e90eb2545c448a02a805e620114bed4c78d"),
    },
}
MENU_HASHES = {
    "none": ("d295d7ce294dc49231d111053d34ffc99066402c0c0f3d1e87b596cdfe8fe1e2", "d295d7ce294dc49231d111053d34ffc99066402c0c0f3d1e87b596cdfe8fe1e2"),
    "fresh": ("4d6c9eb224cb646ce06da4857d38d5555f5fd13b74e37638fb130d0719f59506", "068bd48a8db48a6337fa3e4f789687a973a41c1e0958ea21e924675bf87a2101"),
    "expired": ("06efb2e75c962de2a0cd9a2d89823fdbc819b88e563d496ff1ea1dc836e14020", "0287c88393259cc8586b1dcf455861c1a0bd44af1ca57f70570d3cbb7a34e915"),
}


class StaticCopyBoundaryTests(unittest.TestCase):
    def test_default_main_bytes_none_fresh_expired_cards_and_menus(self):
        core = renderer()
        for mode, value in (("none", None), ("fresh", projection()), ("expired", projection(expires="2020-01-01T00:00:00Z"))):
            before = deepcopy(value)
            for locale_index, locale in enumerate(("ru", "en")):
                for kwargs in ({}, {"static_copy": None}, {"static_copy": lambda raw: raw}):
                    for key, expected in zip(CARD_ORDER, MAIN_HASHES[mode][locale]):
                        with self.subTest(mode=mode, locale=locale, key=key, hook=bool(kwargs)):
                            body = core.card(key, locale=locale, pricing_projection=value, **kwargs)
                            self.assertEqual(hashlib.sha256(body.encode()).hexdigest(), expected)
                    labels = core.labels(locale=locale, pricing_projection=value, **kwargs)
                    digest = hashlib.sha256(json.dumps(labels, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
                    self.assertEqual(digest, MENU_HASHES[mode][locale_index])
            self.assertEqual(value, before)

    def test_api_labels_fee_notes_and_extension_labels_never_cross_static_boundary(self):
        core, value = renderer(), projection()
        literals = {locale: {
            "label": f"API {locale} SAFRWAY https://safrway.online/admin/?note=SAFRWAY",
            "note": f"Fee {locale} SAFR Points https://safrway.online/account/?ref=API",
            "extension": f"Extension {locale} SAFRWAY https://safrway.online/auth/?state=API",
        } for locale in ("ru", "en")}
        for item in value["items"]:
            item["label"] = {locale: literal["extension" if item["entity_type"] == "SERVICE" else "label"] for locale, literal in literals.items()}
            item["fee_note"] = {locale: literal["note"] for locale, literal in literals.items()}
        before = deepcopy(value)
        menus = Menus(settings(origin=YOGA_PREVIEW_SITE_BASE), load_catalog(SHARED))
        for locale in ("ru", "en"):
            for key in CARD_ORDER:
                seen = []
                def copy(raw):
                    seen.append(raw)
                    return visa_display_copy(raw, YOGA_PREVIEW_SITE_BASE)
                original = core.card(key, locale=locale, pricing_projection=value)
                branded = core.card(key, locale=locale, pricing_projection=value, static_copy=copy)
                for literal in literals[locale].values():
                    self.assertEqual(branded.count(literal), original.count(literal))
                    self.assertFalse(any(literal in template for template in seen))
                if key in {"E33G", "C1", "VOA"}:
                    self.assertIn(literals[locale]["label"], branded)
                    self.assertIn(literals[locale]["note"], branded)
                if key in {"C1", "VOA"}:
                    self.assertIn(literals[locale]["extension"], branded)
                selected = next(selected for selected, pair in CARDS.items() if pair[0] == key)
                parts, _ = card_reply(core, menus, locale, selected, value)
                self.assertEqual(parts, core.parts(branded), "Yoga adapter must not post-process composed API values")
            self.assertEqual(value, before)

    def test_i18n_hook_precedes_interpolation_and_never_reprocesses_variables(self):
        core = renderer()
        for locale in ("ru", "en"):
            variables = {"label": "SAFRWAY {idr} https://safrway.online/admin/?ref=SAFRWAY",
                         "idr": "Rp 1.234.567 SAFRWAY", "usdSuffix": " SAFR Points https://safrway.online/account/"}
            seen = []
            def copy(raw):
                seen.append(raw)
                return visa_display_copy("SAFRWAY " + raw, YOGA_PREVIEW_SITE_BASE)
            result = core.text("visa.price.line", locale=locale, variables=variables, static_copy=copy)
            self.assertEqual(seen, [core._i18n.template("visa.price.line", locale=locale)])
            self.assertEqual(result, "Yoga Ganster " + core.text("visa.price.line", locale=locale, variables=variables))
            for variable in variables.values():
                self.assertIn(variable, result)

    def test_all_34_reviewed_static_links_change_and_sources_stay_exact(self):
        core, urls = renderer(), set()
        for locale in ("ru", "en"):
            for key in CARD_ORDER:
                original = core.card(key, locale=locale)
                branded = core.card(key, locale=locale, static_copy=lambda raw: visa_display_copy(raw, YOGA_PREVIEW_SITE_BASE))
                static_urls = set(re.findall(r"https://safrway\.online/\S+", original))
                urls.update(static_urls)
                for url in static_urls:
                    self.assertIn(YOGA_PREVIEW_SITE_BASE + url.removeprefix("https://safrway.online"), branded)
                    self.assertNotIn(url, branded)
                self.assertEqual(branded, expected_static_card(key, locale, YOGA_PREVIEW_SITE_BASE))
                self.assertEqual(core.card(key, locale=locale), original)
        self.assertEqual(len(urls), 34)

    def test_d1_original_ordinal_gaps_are_transformed_without_touching_bound_prices(self):
        core = renderer()
        from safr_content_core import d1_d2_summaries as d1
        for locale in ("ru", "en"):
            for key in d1.KEYS:
                row, metadata = d1.approved_sources(locale)[key]
                original, cursor, expected_fragments, gaps = row["bodyMarkdown"], 0, [], []
                def edit(raw):
                    return visa_display_copy(raw, YOGA_PREVIEW_SITE_BASE).replace("Yoga Ganster", "Yoga Ganster long static presentation")
                value = projection()
                for binding in sorted(metadata["bindings"], key=lambda item: item["start"]):
                    gap = original[cursor:binding["start"]]
                    gaps.append(gap)
                    expected_fragments.extend((edit(gap), d1._price_text(binding["operationId"], value, locale, core._visas._format_idr)))
                    cursor = binding["end"]
                gaps.append(original[cursor:])
                expected_fragments.append(edit(original[cursor:]))
                url = "https://safrway.online/" + ("en/" if locale == "en" else "") + d1.ROUTES[key]
                seen = []
                def copy(raw):
                    seen.append(raw)
                    return edit(raw)
                actual = d1.render_summary(key, locale, value, format_idr=core._visas._format_idr, static_copy=copy)
                self.assertEqual(seen, [*gaps, url])
                self.assertEqual(actual, "".join(expected_fragments).rstrip("\n") + "\n\n" + edit(url))
                self.assertNotIn("{{USD_", actual)

    def test_menu_hook_sees_static_labels_and_templates_not_composed_price_strings(self):
        core, value, seen = renderer(), projection(), []
        def copy(raw):
            seen.append(raw)
            return visa_display_copy(raw, YOGA_PREVIEW_SITE_BASE)
        for locale in ("ru", "en"):
            self.assertEqual(core.labels(locale=locale, pricing_projection=value, static_copy=copy),
                             core.labels(locale=locale, pricing_projection=value))
        self.assertTrue(seen)
        self.assertFalse(any("≈ $" in raw or "Rp " in raw or "1kk" in raw for raw in seen))
