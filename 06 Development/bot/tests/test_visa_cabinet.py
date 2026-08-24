import os
import unittest
from datetime import date
from unittest.mock import AsyncMock, patch

os.environ.setdefault("BOT_TOKEN", "test-token")
os.environ.setdefault("ADMIN_CHAT_ID", "1")

from app.handlers.visas import cabinet_url, status_help, summary
from app.services.backend_client import get_user_visa_cases, send_web_client_message, send_web_staff_message
from app.services.i18n import button_key, button_text
from app.services.visa_notifications import notification_text
from app.services.web_chat_bridge import deliver_event
from app.handlers.web_chat import save_client_web_reply


class VisaCabinetBotTests(unittest.TestCase):
    def test_my_visas_button_is_stable_ru_en(self):
        self.assertEqual(button_key("🛂 Мои визы"), "button.visa.mine")
        self.assertEqual(button_key("🛂 My visas"), "button.visa.mine")
        self.assertEqual(button_text("button.visa.mine", locale="ru"), "🛂 Мои визы")

    def test_summary_contains_only_concise_published_contract(self):
        locale, body = summary({"locale": "en", "items": [{
            "id": 7, "visa_type": {"name": "B1"}, "lifecycle_status": "ACTIVE",
            "service_status": "ACTION_REQUIRED", "current_process": {"external_status": "BIOMETRICS_REQUIRED"},
            "next_action_text": "Visit the biometrics office", "stay_end": "2026-09-15", "extension_available": False, "passport_mask": "••••0000",
            "timeline": [{"title": "internal"}],
        }]}, today=date(2026, 9, 10))
        self.assertEqual(locale, "en")
        self.assertIn("B1", body); self.assertIn("Status: Visa active", body); self.assertIn("Process: your action is required — Visit the biometrics office", body)
        self.assertIn("Visa end date: 15.09.2026", body); self.assertIn("Days remaining: 5", body)
        self.assertIn("departure or another option", body)
        self.assertNotIn("ACTIVE", body)
        self.assertNotIn("0000", body); self.assertNotIn("internal", body)

    def test_summary_review_copy_is_deterministic_ru_en(self):
        common = {
            "visa_type": {"name": "eVOA / B1"},
            "lifecycle_status": "EXTENSION_PROCESSING",
            "service_status": "ACTION_REQUIRED",
            "current_process": {"external_status": "BIOMETRICS_REQUIRED"},
            "stay_end": "2026-09-20",
            "extension_available": False,
        }
        _, ru = summary({"locale": "ru", "items": [{**common, "next_action_text": "поездка на биометрию"}]}, today=date(2026, 9, 10))
        _, en = summary({"locale": "en", "items": [{**common, "next_action_text": "visit the biometrics office"}]}, today=date(2026, 9, 10))
        self.assertEqual(ru, "🛂 Мои визы\n\n🛂 eVOA / B1\nСтатус: Продление визы\nПроцесс: ожидает ваших действий — поездка на биометрию\nДата окончания визы: 20.09.2026\nОсталось дней: 10\nВажно: Продление не отмечено доступным. До окончания срока уточните у менеджера необходимость выезда или другой вариант.")
        self.assertEqual(en, "🛂 My visas\n\n🛂 eVOA / B1\nStatus: Visa extension\nProcess: your action is required — visit the biometrics office\nVisa end date: 20.09.2026\nDays remaining: 10\nNote: An extension is not recorded as available. Before expiry, ask a manager whether departure or another option is required.")

    def test_official_status_help_is_localized_and_unknown_safe(self):
        self.assertIn("ACTIVE", status_help("ACTIVE", "ru"))
        self.assertIn("активная", status_help("ACTIVE", "ru"))
        self.assertIn("active", status_help("ACTIVE", "en"))
        self.assertIn("official code", status_help("FUTURE_STATUS", "en"))
        self.assertNotIn("guarantee", status_help("ACTIVE", "en"))

    def test_cabinet_deep_link_uses_authenticated_mini_app(self):
        with patch("app.handlers.visas.settings.MINI_APP_URL", "https://app.example.invalid/"):
            self.assertEqual(cabinet_url(), "https://app.example.invalid/#/visas")
            self.assertEqual(cabinet_url("support"), "https://app.example.invalid/#/support")

    def test_publication_and_update_notifications_are_localized(self):
        self.assertIn("появилась виза", notification_text({"locale": "ru", "notification_type": "CASE_PUBLISHED"}))
        self.assertIn("updated", notification_text({"locale": "en", "notification_type": "CASE_UPDATED"}))


class VisaCabinetBackendClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_english_client_reply_outcomes_are_fully_localized(self):
        state = AsyncMock()
        state.get_data.return_value = {"web_conversation_id": 7}
        message = AsyncMock()
        message.from_user.id = 200
        message.message_id = 9
        conversation = {"client": {"telegram_id": 200, "locale": "en"}}

        with patch("app.handlers.web_chat.get_web_conversation", AsyncMock(return_value=conversation)):
            message.text = None
            await save_client_web_reply(message, state)
            message.answer.assert_awaited_with("Please send a text message.")

        message.answer.reset_mock()
        message.text = "Fixture reply"
        with (
            patch("app.handlers.web_chat.get_web_conversation", AsyncMock(return_value=conversation)),
            patch("app.handlers.web_chat.send_web_client_message", AsyncMock(return_value=True)),
        ):
            await save_client_web_reply(message, state)
            message.answer.assert_awaited_with("✅ Reply sent to the manager.")

        message.answer.reset_mock()
        with (
            patch("app.handlers.web_chat.get_web_conversation", AsyncMock(return_value=conversation)),
            patch("app.handlers.web_chat.send_web_client_message", AsyncMock(return_value=False)),
        ):
            await save_client_web_reply(message, state)
            message.answer.assert_awaited_with("Could not send. Please try again.")

    async def test_staff_and_client_dialogue_posts_use_distinct_reachable_contracts(self):
        calls = []

        class Response:
            def raise_for_status(self):
                return None

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, url, *, json, headers):
                calls.append((url, json, headers))
                return Response()

        with (
            patch("app.services.backend_client.backend_sync_enabled", return_value=True),
            patch("app.services.backend_client.httpx.AsyncClient", return_value=Client()),
        ):
            self.assertTrue(await send_web_staff_message(7, actor_telegram_id=1, body="Manager", visibility="client"))
            self.assertTrue(await send_web_client_message(7, actor_telegram_id=2, body="Client", idempotency_key="telegram:2:9"))

        self.assertTrue(calls[0][0].endswith("/api/web/staff/conversations/7/messages"))
        self.assertEqual(calls[0][1]["visibility"], "client")
        self.assertTrue(calls[1][0].endswith("/api/web/staff/conversations/7/client-messages"))
        self.assertEqual(calls[1][1]["idempotency_key"], "telegram:2:9")

    async def test_get_user_visa_cases_calls_service_summary_endpoint(self):
        class Response:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self):
                return {"locale": "en", "items": []}

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, url, *, headers):
                self.url = url
                self.headers = headers
                return Response()

        with (
            patch("app.services.backend_client.backend_sync_enabled", return_value=True),
            patch("app.services.backend_client.httpx.AsyncClient", return_value=Client()),
        ):
            payload = await get_user_visa_cases(123)

        self.assertEqual(payload, {"locale": "en", "items": []})

    async def test_staff_client_message_delivers_once_with_reply_control(self):
        bot = AsyncMock()
        conversation = {"client": {"telegram_id": 200, "locale": "en"}, "messages": [{"id": 9, "author_type": "staff", "body": "Fixture update", "visibility": "client"}]}
        event = {"id": 11, "event_type": "web_staff_client_message", "aggregate_id": 7, "payload": {"message_id": 9}}
        with (
            patch("app.services.web_chat_bridge.get_web_conversation", AsyncMock(return_value=conversation)),
            patch("app.services.web_chat_bridge.mark_web_event_delivered", AsyncMock(return_value=True)) as delivered,
        ):
            await deliver_event(bot, event)
        bot.send_message.assert_awaited_once()
        self.assertEqual(bot.send_message.await_args.args[0], 200)
        self.assertIn("Message from", bot.send_message.await_args.args[1])
        delivered.assert_awaited_once_with(11, [200])
