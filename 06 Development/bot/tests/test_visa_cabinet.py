import os
import unittest
from unittest.mock import patch

os.environ.setdefault("BOT_TOKEN", "test-token")
os.environ.setdefault("ADMIN_CHAT_ID", "1")

from app.handlers.visas import cabinet_url, summary
from app.services.i18n import button_key, button_text
from app.services.visa_notifications import notification_text


class VisaCabinetBotTests(unittest.TestCase):
    def test_my_visas_button_is_stable_ru_en(self):
        self.assertEqual(button_key("🛂 Мои визы"), "button.visa.mine")
        self.assertEqual(button_key("🛂 My visas"), "button.visa.mine")
        self.assertEqual(button_text("button.visa.mine", locale="ru"), "🛂 Мои визы")

    def test_summary_contains_only_concise_published_contract(self):
        locale, body = summary({"locale": "en", "items": [{
            "id": 7, "visa_type": {"name": "B1"}, "lifecycle_status": "ACTIVE",
            "stay_end": "2026-09-15", "passport_mask": "••••0000",
            "timeline": [{"title": "internal"}],
        }]})
        self.assertEqual(locale, "en")
        self.assertIn("B1", body); self.assertIn("active", body); self.assertIn("15.09.2026", body)
        self.assertNotIn("0000", body); self.assertNotIn("internal", body)

    def test_cabinet_deep_link_uses_authenticated_mini_app(self):
        with patch("app.handlers.visas.settings.MINI_APP_URL", "https://app.example.invalid/"):
            self.assertEqual(cabinet_url(), "https://app.example.invalid/#/visas")

    def test_publication_and_update_notifications_are_localized(self):
        self.assertIn("появилась виза", notification_text({"locale": "ru", "notification_type": "CASE_PUBLISHED"}))
        self.assertIn("updated", notification_text({"locale": "en", "notification_type": "CASE_UPDATED"}))
