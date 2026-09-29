import os
os.environ.setdefault("BOT_TOKEN", "123456:synthetic-test-token")
os.environ.setdefault("ADMIN_CHAT_ID", "101")

from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from app.services import service_reminders as reminder


def item(locale="ru", kind="housing"):
    return {"id": 1, "lease_token": "x" * 32, "telegram_id": 102, "locale": locale,
            "payload": {"kind": kind, "title": "Synthetic service", "days_remaining": 15,
                        "end_date": "2030-01-16", "internal_note": "MUST NOT LEAK"}}


class ServiceReminders(unittest.IsolatedAsyncioTestCase):
    def test_localized_allowlisted_text_and_canonical_client_routes(self):
        with patch.object(reminder.settings, "MINI_APP_URL", "https://app.example.test"):
            for language in ("ru", "en"):
                for kind in ("visa", "housing", "bike", "insurance", "other"):
                    text, keyboard = reminder.render(item(language, kind))
                    self.assertIn("16.01.2030", text)
                    self.assertIn("15", text)
                    self.assertNotIn("MUST NOT LEAK", text)
                    self.assertIn("Days remaining" if language == "en" else "Осталось дней", text)
                    self.assertEqual(keyboard.inline_keyboard[0][0].web_app.url,
                                     "https://app.example.test/#/" + ("visas" if kind == "visa" else "life"))
                    self.assertTrue(keyboard.inline_keyboard[1][0].web_app.url.endswith("#/support"))
                    if kind == "other":
                        self.assertTrue(text.startswith("⏰ Service: Synthetic service" if language == "en" else "⏰ Услуга: Synthetic service"))

    async def test_acknowledgement_retry_never_resends_telegram(self):
        bot = SimpleNamespace(send_message=AsyncMock(return_value=SimpleNamespace(message_id=42)))
        with patch.object(reminder, "api", AsyncMock(side_effect=[None, {"state": "DELIVERED"}])) as api:
            await reminder.deliver(bot, item())
        self.assertEqual(bot.send_message.await_count, 1)
        self.assertEqual(api.await_count, 2)
        self.assertEqual(api.call_args.args[1]["state"], "DELIVERED")
        self.assertIsNone(bot.send_message.call_args.kwargs["parse_mode"])

    async def test_ambiguous_send_is_unknown_and_not_retried(self):
        bot = SimpleNamespace(send_message=AsyncMock(side_effect=TimeoutError()))
        with patch.object(reminder, "api", AsyncMock(return_value={"state": "UNKNOWN"})) as api:
            await reminder.deliver(bot, item())
        self.assertEqual(bot.send_message.await_count, 1)
        self.assertEqual(api.call_args.args[1]["state"], "UNKNOWN")

    async def test_invalid_payload_does_not_send(self):
        bot = SimpleNamespace(send_message=AsyncMock())
        malformed = item()
        malformed["payload"]["kind"] = "staff"
        with patch.object(reminder, "api", AsyncMock(return_value={"state": "FAILED"})) as api:
            await reminder.deliver(bot, malformed)
        self.assertEqual(bot.send_message.await_count, 0)
        self.assertEqual(api.call_args.args[1]["error_code"], "INVALID_PAYLOAD")
