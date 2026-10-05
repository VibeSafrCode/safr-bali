import unittest
from copy import deepcopy
from datetime import datetime, timedelta, timezone

from app.content.visas import get_visa_card, get_visa_menu_labels, visa_card_parts
from app.services.exchange_rates import _validated_projection
from app.services.locale import set_current_locale, reset_current_locale
from tests.pricing_fixture import pricing_projection


class Sync1004SummaryTests(unittest.TestCase):
    def projection(self):
        data = pricing_projection()
        for option, amount, dollars in (("c1-extension", "2000000", "110"), ("voa-extension", "850000", "45")):
            data["items"].append({"sku": "service:visa-extension:" + option, "entity_type": "SERVICE",
                "entity_key": "visa-extension", "option_code": option, "show_price": True,
                "price_qualifier": "EXACT", "amount_idr": amount, "display_usd_approx": dollars,
                "display_usdt": None, "sort_order": 20, "fee_verification_status": "VERIFIED",
                "label": {"ru": "Продление " + option, "en": "Extension " + option}, "fee_note": {}})
        return data

    def render(self, key, locale, data):
        token = set_current_locale(locale)
        try:
            return get_visa_card(key, data)
        finally:
            reset_current_locale(token)

    def test_bank_copy_source_links_and_all_text_survive_telegram_chunks(self):
        for locale in ("ru", "en"):
            body = self.render("E33G", locale, self.projection())
            self.assertIn("12", body)
            self.assertNotIn("Golden Visa", body)
            self.assertNotIn("localhost", body)
            self.assertNotIn("/_registry/", body)
            self.assertIn("https://safrway.online/" + ("en/" if locale == "en" else "") + "bali/visas/e33g/", body)
            self.assertIn("Официально требуется банковская выписка за последние 3 месяца. Дополнительно мы запрашиваем выписку за 12 месяцев, основываясь на практике выдачи виз." if locale == "ru" else "Officially, a bank statement for the last 3 months is required.", body)
            parts = visa_card_parts(body)
            self.assertTrue(all(len(p.encode("utf-16-le")) // 2 <= 3500 for p in parts))
            self.assertEqual("\n\n".join(parts), body)

    def test_extensions_are_separate_options_and_never_replace_issuance_menu(self):
        data = self.projection()
        for key, amount, dollars in (("C1", "Rp 2.000.000", "≈ $110"), ("VOA", "Rp 850.000", "≈ $45")):
            for locale in ("ru", "en"):
                body = self.render(key, locale, data)
                self.assertIn(amount, body)
                self.assertIn(dollars, body)
        self.assertNotIn("850k", get_visa_menu_labels(data)["VOA"])
        changed = deepcopy(data)
        next(i for i in changed["items"] if i["option_code"] == "voa-extension")["amount_idr"] = "900000"
        self.assertIn("Rp 900.000", self.render("VOA", "ru", changed))
        self.assertNotIn("Rp 850.000", self.render("VOA", "ru", changed))

    def test_expired_projection_keeps_idr_but_hides_every_usd_reference(self):
        data = self.projection()
        data["derived_expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        safe = _validated_projection(data, now=datetime.now(timezone.utc))
        body = self.render("VOA", "ru", safe)
        self.assertIn("Rp 850.000", body)
        self.assertNotIn("≈ $", body)

    def test_no_projection_never_invents_an_extension_price(self):
        for locale in ("ru", "en"):
            body = self.render("VOA", locale, None)
            self.assertNotIn("850.000", body)
            self.assertNotIn("≈ $", body)

    def test_render_rechecks_expiry_without_mutating_previously_fetched_projection(self):
        data = self.projection()
        data["derived_expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        before = deepcopy(data)
        for locale in ("ru", "en"):
            for key, amount in (("C1", "Rp 2.000.000"), ("VOA", "Rp 850.000")):
                body = self.render(key, locale, data)
                self.assertIn(amount, body)
                self.assertNotIn("≈ $", body)
        self.assertEqual(data, before)

    def test_e33g_issuance_card_and_menu_exclude_all_conversion_variants(self):
        data = self.projection()
        standard = next(row for row in data["items"] if row["entity_key"] == "E33G")
        for code in ("conversion-from-voa", "conversion-from-kitas", "conversion-from-c1", "conversion-from-d12"):
            data["items"].append({**deepcopy(standard), "sku": "visa:E33G:" + code,
                "option_code": code, "label": {"ru": "CONVERSION_ONLY", "en": "CONVERSION_ONLY"},
                "amount_idr": "999999", "display_usd_approx": "99999", "sort_order": 0})
        for locale in ("ru", "en"):
            token = set_current_locale(locale)
            try:
                body = get_visa_card("E33G", data)
                self.assertIn("Rp 12.000.000", body)
                self.assertIn("Rp 14.000.000", body)
                self.assertNotIn("CONVERSION_ONLY", body)
                self.assertNotIn("99999", body)
                self.assertNotIn("999", get_visa_menu_labels(data)["E33G"])
            finally:
                reset_current_locale(token)

    def test_ambiguous_or_invalid_extension_is_not_displayed(self):
        for mutation in ("duplicate", "negative", "from", "hidden"):
            data = self.projection()
            item = next(i for i in data["items"] if i["option_code"] == "voa-extension")
            if mutation == "duplicate":
                data["items"].append(deepcopy(item))
            elif mutation == "negative":
                item["amount_idr"] = "-1"
            elif mutation == "from":
                item["price_qualifier"] = "FROM"
            else:
                item["show_price"] = False
            self.assertNotIn("Rp 850.000", self.render("VOA", "ru", data))
