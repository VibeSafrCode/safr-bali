import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.core.config import Settings
from app.handlers import contact, menu, web_chat
from app.services import conversation_store, support_notifications
from app.services.staff_routing import get_recipients_for_route
from app.services.visa_notifications import notification_keyboard, notification_text


def configured_staff():
    return Settings(_env_file=None, BOT_TOKEN="123:token", ADMIN_CHAT_ID=1,
                    SUPPORT_CHAT_IDS="99,99,1", MANAGER_CHAT_IDS="2",
                    VISA_ADMIN_CHAT_IDS="3", SPB_MANAGER_CHAT_IDS="4",
                    THAILAND_MANAGER_CHAT_IDS="5")


class SupportNotificationRoutingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.settings = configured_staff()
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        for target, name, value in (
            (contact, "settings", self.settings),
            (menu, "settings", self.settings),
            (web_chat, "settings", self.settings),
            (support_notifications, "settings", self.settings),
            (conversation_store, "CONVERSATIONS_PATH", Path(temporary.name) / "conversations.json"),
            (contact, "sync_runtime_event", AsyncMock(return_value=True)),
            (menu, "grant_visa_client_access", lambda *_args, **_kwargs: None),
        ):
            replacement = patch.object(target, name, value)
            replacement.start()
            self.addCleanup(replacement.stop)

    def client_message(self, bot):
        return SimpleNamespace(
            from_user=SimpleNamespace(id=500, username="fixture", full_name="Fixture Client"),
            text="Fixture visa question", voice=None, photo=None, document=None,
            chat=SimpleNamespace(id=500), message_id=10, date=None, bot=bot,
            answer=AsyncMock(),
        )

    def test_support_config_does_not_expand_staff_routes_or_access(self):
        self.assertEqual(self.settings.support_chat_ids, [99, 1])
        self.assertEqual(self.settings.operations_chat_ids, [1, 99])
        for route, expected in (
            ({}, [1, 2]),
            ({"country": "Бали", "section": "Визы"}, [1, 3]),
            ({"city": "Санкт-Петербург"}, [1, 4]),
            ({"country": "Таиланд"}, [1, 5]),
        ):
            with self.subTest(route=route):
                self.assertEqual(get_recipients_for_route(route, self.settings), expected)
        contact.set_client_routing(500, {"country": "Бали", "section": "Визы"})
        self.assertFalse(contact.is_staff_user(99))
        self.assertFalse(contact.can_staff_access_client(99, 500))
        self.assertFalse(contact.can_staff_access_client(2, 500))
        self.assertTrue(contact.can_staff_access_client(3, 500))
        self.assertFalse(web_chat.can_access({"assigned_staff_ids": [1, 3]}, 99))

    async def test_operations_root_and_support_receive_one_message_each(self):
        bot = SimpleNamespace(send_message=AsyncMock())
        await support_notifications.notify_operations(bot, "Fixture operational event")
        self.assertEqual([call.kwargs["chat_id"] for call in bot.send_message.await_args_list], [1, 99])
        self.assertTrue(all(call.kwargs.get("reply_markup") is None for call in bot.send_message.await_args_list))

    async def test_support_send_failure_does_not_fail_root_operations_delivery(self):
        async def send(**kwargs):
            if kwargs["chat_id"] == 99:
                raise RuntimeError("fixture support unavailable")

        bot = SimpleNamespace(send_message=AsyncMock(side_effect=send))
        with self.assertLogs("app.services.support_notifications", level="ERROR"):
            await support_notifications.notify_operations(bot, "Fixture operational event")
        self.assertEqual([call.kwargs["chat_id"] for call in bot.send_message.await_args_list], [1, 99])

    async def test_root_send_failure_still_attempts_support_operations_delivery(self):
        async def send(**kwargs):
            if kwargs["chat_id"] == 1:
                raise RuntimeError("fixture root unavailable")

        bot = SimpleNamespace(send_message=AsyncMock(side_effect=send))
        with self.assertRaises(RuntimeError):
            await support_notifications.notify_operations(bot, "Fixture operational event")
        self.assertEqual([call.kwargs["chat_id"] for call in bot.send_message.await_args_list], [1, 99])

    async def test_ordinary_visa_request_has_copy_without_staff_controls_or_assignment(self):
        bot = SimpleNamespace(send_message=AsyncMock())
        await contact.notify_staff_about_client_message(
            self.client_message(bot), bot, {"country": "Бали", "section": "Визы"},
        )
        messages = {call.kwargs["chat_id"]: call.kwargs for call in bot.send_message.await_args_list}
        self.assertEqual(set(messages), {1, 3, 99})
        # The observer cannot delay primary staff notifications.
        self.assertEqual([call.kwargs["chat_id"] for call in bot.send_message.await_args_list], [1, 3, 99])
        self.assertIsNone(messages[99].get("reply_markup"))
        self.assertIsNotNone(messages[3].get("reply_markup"))
        self.assertEqual(contact.ensure_client_record(500)["assigned_staff_ids"], [1, 3])
        self.assertFalse(contact.can_staff_access_client(99, 500))

    async def test_primary_request_delivery_failure_still_attempts_support_copy(self):
        async def send(**kwargs):
            if kwargs["chat_id"] == 1:
                raise RuntimeError("fixture primary recipient unavailable")

        bot = SimpleNamespace(send_message=AsyncMock(side_effect=send))
        with self.assertRaises(RuntimeError):
            await contact.notify_staff_about_client_message(
                self.client_message(bot), bot, {"country": "Бали", "section": "Визы"},
            )
        self.assertEqual([call.kwargs["chat_id"] for call in bot.send_message.await_args_list], [1, 99])

    async def test_restricted_contact_and_menu_questions_remain_owner_only(self):
        contact.set_restricted_to_owner(500, True)
        bot = SimpleNamespace(send_message=AsyncMock())
        message = self.client_message(bot)
        await contact.notify_staff_about_client_message(message, bot, {"country": "Бали", "section": "Визы"})
        self.assertEqual([call.kwargs["chat_id"] for call in bot.send_message.await_args_list], [1])
        bot.send_message.reset_mock()
        await menu.send_service_question_to_staff(message, "visa", "B1")
        self.assertEqual([call.kwargs["chat_id"] for call in bot.send_message.await_args_list], [1])
        self.assertEqual(contact.ensure_client_record(500)["assigned_staff_ids"], [1])
        self.assertFalse(contact.can_staff_access_client(99, 500))

    async def test_outgoing_reply_is_copied_without_adding_support_access(self):
        contact.set_client_routing(500, {"country": "Бали", "section": "Визы"})
        bot = SimpleNamespace(send_message=AsyncMock())
        message = self.client_message(bot)
        message.from_user = SimpleNamespace(id=3, full_name="Fixture Staff")
        message.text = "Fixture staff reply"
        state = AsyncMock()
        state.get_data.return_value = {"client_id": 500}
        with patch.object(contact, "delete_last_notice", AsyncMock()):
            await contact.admin_reply_message(message, state, bot)
        sends = bot.send_message.await_args_list
        self.assertEqual(sum(call.kwargs["chat_id"] == 500 for call in sends), 1)
        support_copy = next(call.kwargs for call in sends if call.kwargs["chat_id"] == 99)
        self.assertIn("Fixture staff reply", support_copy["text"])
        self.assertIsNone(support_copy.get("reply_markup"))
        self.assertFalse(contact.can_staff_access_client(99, 500))
        state.clear.assert_awaited_once()

    async def test_restricted_owner_reply_is_not_copied(self):
        contact.set_restricted_to_owner(500, True)
        bot = SimpleNamespace(send_message=AsyncMock())
        message = self.client_message(bot)
        message.from_user = SimpleNamespace(id=1, full_name="Fixture Root")
        state = AsyncMock()
        state.get_data.return_value = {"client_id": 500}
        with patch.object(contact, "delete_last_notice", AsyncMock()):
            await contact.admin_reply_message(message, state, bot)
        self.assertEqual([call.kwargs["chat_id"] for call in bot.send_message.await_args_list], [500])

    def test_visa_support_copy_is_labeled_without_client_keyboard(self):
        for language, label in (("ru", "Копия уведомления клиенту"), ("en", "Copy of client notification")):
            for kind in ("CASE_PUBLISHED", "CASE_UPDATED", "STATUS_SUMMARY_MANUAL"):
                with self.subTest(locale=language, kind=kind):
                    item = {"recipient_kind": "staff", "locale": language, "notification_type": kind,
                            "payload": {"support_copy": True, "client_display_name": "Fixture Client",
                                        "visa_display_name": "Fixture Visa"}}
                    rendered = notification_text(item)
                    self.assertIn(label, rendered)
                    self.assertIn("Fixture Client", rendered)
                    self.assertIsNone(notification_keyboard(item))

    def test_support_reminder_never_claims_admin_case_access_or_adds_link(self):
        item = {"recipient_kind": "staff", "locale": "en", "notification_type": "CONTACT_REMINDER_STAFF",
                "payload": {"staff_role_code": "support", "can_open_case": False,
                            "client_display_name": "Fixture Client", "reason_code": "EXTENSION"}}
        self.assertNotIn("SAFRWAY Admin", notification_text(item))
        self.assertNotIn("http", notification_text(item))
        self.assertIsNone(notification_keyboard(item))


if __name__ == "__main__":
    unittest.main()
