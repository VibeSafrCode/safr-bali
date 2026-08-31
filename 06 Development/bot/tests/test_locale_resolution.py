import unittest
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from app.services import backend_client
from app.services.locale import (
    current_locale,
    normalize_locale,
    reset_current_locale,
    resolve_user_locale,
    set_current_locale,
)
from app.services.i18n import canonical_button_text, matches, text
from app.handlers.contact import client_closed_dialog_keyboard
from app.handlers.menu import personal_account_keyboard
from app.services.account import get_points_summary
from app.content.housing import get_housing_pages
from app.content.visas import get_visa_card
from app.handlers.menu import visa_keyboard
from tests.pricing_fixture import pricing_projection


class BotLocaleResolutionTests(unittest.IsolatedAsyncioTestCase):
    def test_normalize_locale_supports_only_ru_and_en(self):
        self.assertEqual(normalize_locale("en-US"), "en")
        self.assertEqual(normalize_locale("ru_RU"), "ru")
        self.assertEqual(normalize_locale("de"), "ru")

    async def test_saved_locale_precedes_telegram_fallback(self):
        with patch(
            "app.services.locale.get_user_locale",
            AsyncMock(return_value="en"),
        ):
            self.assertEqual(await resolve_user_locale(1, "ru"), "en")
        with patch(
            "app.services.locale.get_user_locale",
            AsyncMock(return_value=None),
        ):
            self.assertEqual(await resolve_user_locale(1, "en-GB"), "en")
            self.assertEqual(await resolve_user_locale(1, "de"), "ru")

    def test_context_locale_is_request_scoped(self):
        token = set_current_locale("en")
        self.assertEqual(current_locale(), "en")
        reset_current_locale(token)
        self.assertEqual(current_locale(), "ru")

    def test_runtime_corpus_translates_and_preserves_legacy_ru_actions(self):
        self.assertEqual(text("button.destination.change", locale="ru"), "🌍 Сменить направление")
        self.assertEqual(text("button.destination.change", locale="en"), "🌍 Change destination")
        self.assertTrue(matches("🌍 Сменить направление", "button.destination.change"))
        self.assertTrue(matches("🌍 Change destination", "button.destination.change"))
        self.assertEqual(canonical_button_text("🌍 Change destination"), "🌍 Сменить направление")

    async def test_dashboard_request_remains_reachable_when_backend_is_enabled(self):
        class Response:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self):
                return {"balance": 125, "orders": []}

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, url, **_kwargs):
                self.url = url
                return Response()

        client = Client()
        with (
            patch.object(backend_client.settings, "BACKEND_API_URL", "http://backend"),
            patch.object(backend_client.settings, "BACKEND_SERVICE_TOKEN", "token"),
            patch.object(backend_client.httpx, "AsyncClient", return_value=client),
        ):
            result = await backend_client.get_user_dashboard(618)

        self.assertEqual(result, {"balance": 125, "orders": []})
        self.assertEqual(client.url, "http://backend/users/by-telegram/618/dashboard")

    async def test_english_client_keyboards_and_account_summary_use_runtime_locale(self):
        token = set_current_locale("en")
        try:
            account_buttons = [
                button.text
                for row in personal_account_keyboard().keyboard
                for button in row
            ]
            dialog_buttons = [
                button.text
                for row in client_closed_dialog_keyboard().keyboard
                for button in row
            ]
            self.assertIn("🌍 Change destination", account_buttons)
            self.assertIn("🌐 My network", account_buttons)
            self.assertIn("↩️ Return to conversation", dialog_buttons)
            with patch(
                "app.services.account.get_user_dashboard",
                AsyncMock(return_value={"balance": 25, "referral_count": 2}),
            ):
                summary = await get_points_summary(1, "fallback")
            self.assertIn("My SAFR Points balance", summary)
            self.assertIn("Invited directly: 2", summary)
        finally:
            reset_current_locale(token)

    def test_english_sensitive_visa_and_housing_runtime_keep_ids_and_prices(self):
        token = set_current_locale("en")
        try:
            projection = pricing_projection("16000")
            visa = get_visa_card("E33G", projection)
            d12 = get_visa_card("D12", projection)
            d1d2 = get_visa_card("D1/D2", projection)
            evoa = get_visa_card("VOA", pricing_projection("20000"))
            labels = [
                button.text
                for row in visa_keyboard(projection).keyboard
                for button in row
            ]
            pages = get_housing_pages("search_housing", projection)
            self.assertIn("ITAS E33G for remote workers", visa)
            self.assertIn("Rp 12.000.000 (≈ 750.00 USDT)", visa)
            self.assertNotIn("12.000.000 IDR", visa)
            self.assertIn("ITAS E33G — from 12kk / 750.00 USDT", labels)
            self.assertIn("D12 visa for 1 or 2 years", d12)
            self.assertIn("Rp 7.500.000 (≈ 468.75 USDT)", d12)
            self.assertIn("D1/D2 multiple-entry visas", d1d2)
            self.assertNotIn("D1 — standard 5.500.000 IDR", d1d2)
            self.assertIn("Rp 5.500.000 (≈ 343.75 USDT)", d1d2)
            self.assertIn("eVOA / B1 for a short trip", evoa)
            self.assertIn("Rp 800.000 (≈ 40.00 USDT)", evoa)
            self.assertIn("PERSONAL VILLA SEARCH IN BALI", pages[0])
            self.assertIn("Price on request", pages[2])
            self.assertNotIn("$150", pages[2])
            self.assertEqual(len(pages), 4)
        finally:
            reset_current_locale(token)


if __name__ == "__main__":
    unittest.main()
