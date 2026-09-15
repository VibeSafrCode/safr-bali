"""Customer references come from one projection, never a second FX formula."""

import unittest
from datetime import datetime, timedelta, timezone

from app.content.visas import get_visa_card, get_visa_menu_labels
from app.services.exchange_rates import _validated_projection, canonical_price_label
from app.services.locale import reset_current_locale, set_current_locale
from tests.pricing_fixture import pricing_projection


class CanonicalDollarReferenceTests(unittest.TestCase):
    def render_all(self, projection, locale):
        token = set_current_locale(locale)
        try:
            return (
                get_visa_card("E33G", projection),
                get_visa_menu_labels(projection)["E33G"],
                canonical_price_label(
                    projection, entity_type="VISA", entity_key="E33G", locale=locale,
                ),
            )
        finally:
            reset_current_locale(token)

    def test_both_locales_use_canonical_reference_verbatim_without_local_rounding(self):
        projection = pricing_projection()
        # Deliberately unlike both the IDR ratio and legacy display_usdt. A
        # renderer must consume the accepted server field, not recalculate it.
        for item in projection["items"]:
            item["display_usd_approx"] = "12345"
            item["display_usdt"] = "888.88"
        for locale in ("ru", "en"):
            for rendered in self.render_all(projection, locale):
                with self.subTest(locale=locale, rendered=rendered):
                    self.assertIn("≈ $12345", rendered)
                    self.assertNotRegex(rendered, r"(?:≈ |/ )[\d.]+ USDT")
                    self.assertNotIn("888.88", rendered)

    def test_older_projection_without_reference_keeps_idr_without_currency_fallback(self):
        projection = pricing_projection()
        for item in projection["items"]:
            item.pop("display_usd_approx")
        for locale in ("ru", "en"):
            card, menu, label = self.render_all(projection, locale)
            self.assertIn("Rp 12.000.000", card)
            self.assertIn("12kk", menu)
            self.assertIn("12.000.000 IDR", label)
            for rendered in (card, menu, label):
                self.assertNotIn("≈ $", rendered)
                self.assertNotRegex(rendered, r"(?:≈ |/ )[\d.]+ USDT")

    def test_expired_reference_is_hidden_in_card_menu_and_compact_label(self):
        observed = datetime(2026, 9, 15, tzinfo=timezone.utc)
        original = pricing_projection(now=observed)
        safe = _validated_projection(original, now=observed + timedelta(minutes=15, microseconds=1))
        for locale in ("ru", "en"):
            for rendered in self.render_all(safe, locale):
                self.assertNotIn("≈ $", rendered)
                self.assertNotRegex(rendered, r"(?:≈ |/ )[\d.]+ USDT")
        self.assertEqual(original["items"][0]["display_usd_approx"], "750")

    def test_zero_reference_is_not_mistaken_for_missing_value(self):
        projection = pricing_projection()
        for item in projection["items"]:
            item["display_usd_approx"] = "0"
        for rendered in self.render_all(projection, "ru"):
            self.assertIn("≈ $0", rendered)
