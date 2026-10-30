import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.core.config import Settings
from app.handlers import contact, menu, web_chat
from app.services import conversation_store, support_notifications, routing
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
            (menu, "sync_runtime_event", AsyncMock(return_value=True)),
            (routing, "USER_ROUTE_CONTEXTS", {}),
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

    def test_reply_grant_is_explicit_subset_without_admin_or_assignment(self):
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99,99"
        self.assertEqual(self.settings.support_reply_chat_ids, [99])
        contact.set_client_routing(500, {"country": "Бали", "section": "Визы"})
        self.assertFalse(contact.is_staff_user(99))
        self.assertFalse(contact.can_staff_access_client(99, 500))
        self.assertTrue(contact.can_access_client_dialogue(99, 500, chat_id=99))
        self.assertFalse(contact.can_access_client_dialogue(99, 500, chat_id=-100))
        for invalid in ("777", "99,777", "-1", "not-an-id"):
            self.settings.SUPPORT_REPLY_CHAT_IDS = invalid
            self.assertEqual(self.settings.support_reply_chat_ids, [])

    async def test_only_explicit_responder_gets_controls_and_overlap_is_not_duplicated(self):
        self.settings.SUPPORT_CHAT_IDS = "99,98,3"
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99"
        bot = SimpleNamespace(send_message=AsyncMock())
        await contact.notify_staff_about_client_message(
            self.client_message(bot), bot, {"country": "Бали", "section": "Визы"},
        )
        sends = bot.send_message.await_args_list
        self.assertEqual(sum(c.kwargs["chat_id"] == 3 for c in sends), 1)
        recipients = {c.kwargs["chat_id"]: c.kwargs for c in sends}
        controls = recipients[99]["reply_markup"]
        self.assertEqual([b.callback_data for row in controls.inline_keyboard for b in row],
                         ["reply:500", "history:500"])
        self.assertIsNone(recipients[98]["reply_markup"])
        self.assertEqual(contact.ensure_client_record(500)["assigned_staff_ids"], [1, 3])

    def support_callback(self, action="reply", *, actor=99, chat_id=99, client_id=500):
        return SimpleNamespace(
            from_user=SimpleNamespace(id=actor, full_name="Fixture Support"),
            data=f"{action}:{client_id}", answer=AsyncMock(),
            message=SimpleNamespace(chat=SimpleNamespace(id=chat_id), answer=AsyncMock()),
        )

    async def test_support_prepare_send_and_history_keep_actual_actor(self):
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99"
        contact.set_client_routing(500, {"country": "Бали", "section": "Визы"})
        state = AsyncMock()
        state.get_data.return_value = {"client_id": 500}
        callback = self.support_callback()
        await contact.reply_button_handler(callback, state)
        state.update_data.assert_awaited_once_with(client_id=500)
        bot = SimpleNamespace(send_message=AsyncMock())
        message = self.client_message(bot)
        message.from_user = callback.from_user
        message.chat.id = 99
        message.text = "Fixture support reply"
        await contact.admin_reply_message(message, state, bot)
        self.assertEqual(sum(c.kwargs["chat_id"] == 500 for c in bot.send_message.await_args_list), 1)
        history = contact.ensure_client_record(500)["messages"]
        self.assertEqual((history[-1]["from_id"], history[-1]["text"]), (99, message.text))
        contact.sync_runtime_event.assert_awaited_with(client_telegram_id=500, actor_telegram_id=99,
            event_type="staff_reply", text=message.text)
        view = self.support_callback("history")
        await contact.history_button_handler(view)
        controls = view.message.answer.await_args.kwargs["reply_markup"]
        self.assertEqual([b.callback_data for row in controls.inline_keyboard for b in row],
                         ["reply:500", "history:500"])

    async def test_support_revocation_and_forwarded_controls_are_denied(self):
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99"
        contact.set_client_routing(500, {"country": "Бали", "section": "Визы"})
        for callback in (self.support_callback(actor=98), self.support_callback(chat_id=-100)):
            state = AsyncMock()
            await contact.reply_button_handler(callback, state)
            state.set_state.assert_not_awaited()
        state = AsyncMock()
        state.get_data.return_value = {"client_id": 500}
        await contact.reply_button_handler(self.support_callback(), state)
        self.settings.SUPPORT_REPLY_CHAT_IDS = ""
        bot = SimpleNamespace(send_message=AsyncMock())
        message = self.client_message(bot)
        message.from_user = SimpleNamespace(id=99, full_name="Fixture Support")
        message.chat.id = 99
        await contact.admin_reply_message(message, state, bot)
        bot.send_message.assert_not_awaited()

    async def test_unknown_dialogue_is_not_created_even_for_support_staff_overlap(self):
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99"
        before = conversation_store.load_conversations()
        for managers in ("2", "2,99"):
            self.settings.MANAGER_CHAT_IDS = managers
            state = AsyncMock()
            await contact.reply_button_handler(self.support_callback(client_id=999999), state)
            state.set_state.assert_not_awaited()
            history = self.support_callback("history", client_id=999999)
            await contact.history_button_handler(history)
            history.message.answer.assert_not_awaited()
            bot = SimpleNamespace(send_message=AsyncMock(), copy_message=AsyncMock())
            state.get_data.return_value = {"client_id": 999999}
            message = self.client_message(bot)
            message.from_user = SimpleNamespace(id=99, full_name="Fixture Support")
            message.chat.id = 99
            await contact.admin_reply_message(message, state, bot)
            bot.send_message.assert_not_awaited()
            bot.copy_message.assert_not_awaited()
        self.assertEqual(conversation_store.load_conversations(), before)

    async def test_support_public_history_excludes_internal_comments_even_when_globally_staff(self):
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99"
        contact.set_client_routing(500, {"country": "Бали", "section": "Визы"})
        contact.add_history_item(500, {"from_role": "client", "text": "CLIENT_TEXT"})
        contact.add_history_item(500, {"from_role": "staff", "text": "STAFF_REPLY"})
        contact.add_comment(500, {"admin_id": 3, "text": "INTERNAL_SECRET"})
        contact.add_comment(500, {"admin_id": 3, "text": "Жалоба ГлавБоссу: INTERNAL_PREFIX_SECRET"})
        contact.add_comment(500, {"admin_id": 500, "text": "Жалоба ГлавБоссу: CLIENT_COMPLAINT"})
        before = conversation_store.CONVERSATIONS_PATH.read_bytes()
        for managers in ("2", "2,99"):
            self.settings.MANAGER_CHAT_IDS = managers
            callback = self.support_callback("history")
            await contact.history_button_handler(callback)
            rendered = callback.message.answer.await_args.args[0]
            self.assertIn("CLIENT_TEXT", rendered)
            self.assertIn("STAFF_REPLY", rendered)
            self.assertIn("CLIENT_COMPLAINT", rendered)
            self.assertNotIn("INTERNAL_SECRET", rendered)
            self.assertNotIn("INTERNAL_PREFIX_SECRET", rendered)
            controls = callback.message.answer.await_args.kwargs["reply_markup"]
            self.assertEqual([b.callback_data for row in controls.inline_keyboard for b in row],
                             ["reply:500", "history:500"])
        for actor in (1, 3):
            callback = self.support_callback("history", actor=actor, chat_id=actor)
            await contact.history_button_handler(callback)
            self.assertIn("INTERNAL_SECRET", callback.message.answer.await_args.args[0])
        self.assertEqual(conversation_store.CONVERSATIONS_PATH.read_bytes(), before)

    async def test_closed_inquiry_reaches_only_owner_and_explicit_support_and_keeps_flag(self):
        self.settings.SUPPORT_CHAT_IDS = "99,98,3,1"
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99"
        contact.set_restricted_to_owner(500, True)
        bot = SimpleNamespace(send_message=AsyncMock())
        await contact.notify_staff_about_client_message(self.client_message(bot), bot,
            {"country": "Бали", "section": "Визы"})
        self.assertEqual([c.kwargs["chat_id"] for c in bot.send_message.await_args_list], [1, 99])
        self.assertTrue(contact.ensure_client_record(500)["restricted_to_owner"])
        self.assertIn("Bali Support", contact.format_history(500, include_internal=False))
        self.assertFalse(contact.can_access_client_dialogue(3, 500, chat_id=3))
        self.assertFalse(contact.can_access_client_dialogue(98, 500, chat_id=98))
        state = AsyncMock()
        await contact.reply_button_handler(self.support_callback(), state)
        state.set_state.assert_awaited_once()
        state.get_data.return_value = {"client_id": 500}
        bot.send_message.reset_mock()
        message = self.client_message(bot)
        message.from_user = SimpleNamespace(id=99, full_name="Fixture Support")
        message.chat.id = 99
        message.text = "Closed inquiry reply"
        await contact.admin_reply_message(message, state, bot)
        self.assertEqual([c.kwargs["chat_id"] for c in bot.send_message.await_args_list], [500, 1])
        self.settings.SUPPORT_REPLY_CHAT_IDS = ""
        denied = AsyncMock()
        await contact.reply_button_handler(self.support_callback(), denied)
        denied.set_state.assert_not_awaited()

    async def test_boss_complaint_is_available_to_explicit_support_without_opening_other_roles(self):
        self.settings.SUPPORT_CHAT_IDS = "99,98,3"
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99"
        bot = SimpleNamespace(send_message=AsyncMock())
        message = self.client_message(bot)
        await contact.boss_complaint_message(message, AsyncMock(), bot)
        self.assertEqual([c.kwargs["chat_id"] for c in bot.send_message.await_args_list], [1, 99])
        self.assertTrue(contact.ensure_client_record(500)["restricted_to_owner"])
        self.assertTrue(contact.can_access_client_dialogue(99, 500, chat_id=99))
        self.assertFalse(contact.can_staff_access_client(3, 500))
        self.assertIn(message.text, contact.format_history(500, include_internal=False))

    async def test_technical_support_uses_main_history_and_reply_without_broad_manager_assignment(self):
        self.settings.SUPPORT_CHAT_IDS = "99,98,1"
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99"
        bot = SimpleNamespace(send_message=AsyncMock())
        message = self.client_message(bot)
        with patch.object(menu, "delete_last_tech_prompt", AsyncMock()):
            await menu.tech_support_message_handler(message)
        recipients = {c.kwargs["chat_id"]: c.kwargs for c in bot.send_message.await_args_list}
        self.assertEqual(set(recipients), {1, 99, 98})
        self.assertEqual(len(bot.send_message.await_args_list), 3)
        self.assertIn("ТЕХНИЧЕСКИЙ ВОПРОС", recipients[1]["text"])
        self.assertIsNotNone(recipients[99]["reply_markup"])
        self.assertIsNone(recipients[98]["reply_markup"])
        record = contact.ensure_client_record(500)
        self.assertEqual(record["assigned_staff_ids"], [1])
        self.assertEqual(len(record["messages"]), 1)
        self.assertEqual(record["messages"][0]["text"], message.text)
        bot.send_message.reset_mock()
        await support_notifications.notify_operations(bot, "Ordinary operational event")
        self.assertTrue(all(c.kwargs.get("reply_markup") is None for c in bot.send_message.await_args_list))

    async def test_web_support_uses_real_actor_on_each_read_and_send(self):
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99"
        conversation = {"id": 7, "assigned_staff_ids": [1, 3], "reply_transport": "yoga"}
        read = AsyncMock(return_value=conversation)
        send = AsyncMock(return_value=True)
        state = AsyncMock()
        state.get_data.return_value = {"web_conversation_id": 7, "web_visibility": "client"}
        callback = self.support_callback()
        callback.data = "webreply:7"
        with patch.object(web_chat, "get_web_conversation", read), patch.object(web_chat, "send_web_staff_message", send):
            await web_chat.prepare_web_reply(callback, state)
            message = SimpleNamespace(from_user=callback.from_user, chat=SimpleNamespace(id=99),
                message_id=78, text="Fixture partner reply", answer=AsyncMock())
            await web_chat.save_web_reply(message, state)
            self.assertTrue(all(c.kwargs == {"actor_telegram_id": 99} for c in read.await_args_list))
            send.assert_awaited_once_with(7, actor_telegram_id=99, body=message.text,
                visibility="client", idempotency_key="staff-telegram:99:78")
            send.reset_mock()
            self.settings.SUPPORT_REPLY_CHAT_IDS = ""
            await web_chat.save_web_reply(message, state)
            send.assert_not_awaited()

    async def test_web_support_cannot_prepare_internal_note_or_read_in_group(self):
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99"
        read = AsyncMock(return_value={"id": 7, "assigned_staff_ids": [1, 3]})
        with patch.object(web_chat, "get_web_conversation", read):
            state = AsyncMock()
            callback = self.support_callback()
            callback.data = "webnote:7"
            await web_chat.prepare_web_reply(callback, state)
            state.set_state.assert_not_awaited()
            read.reset_mock()
            callback.message.chat.id = -100
            callback.data = "webreply:7"
            await web_chat.prepare_web_reply(callback, state)
            read.assert_not_awaited()

    async def test_web_support_staff_overlap_uses_this_dialogue_assignment_for_group_access(self):
        self.settings.SUPPORT_REPLY_CHAT_IDS = "99"
        self.settings.MANAGER_CHAT_IDS = "2,99"
        conversation = {"id": 7, "assigned_staff_ids": [1, 3],
            "messages": [{"author_type": "client", "visibility": "client", "body": "PRIVATE_BODY"}]}
        read = AsyncMock(return_value=conversation)
        send = AsyncMock(return_value=True)
        with patch.object(web_chat, "get_web_conversation", read), patch.object(web_chat, "send_web_staff_message", send):
            callback = self.support_callback(chat_id=-100)
            callback.data = "webreply:7"
            state = AsyncMock()
            state.get_data.return_value = {"web_conversation_id": 7, "web_visibility": "client"}
            await web_chat.prepare_web_reply(callback, state)
            state.set_state.assert_not_awaited()
            callback.data = "webhistory:7"
            callback.message.answer.reset_mock()
            await web_chat.show_web_history(callback)
            callback.message.answer.assert_not_awaited()
            message = SimpleNamespace(from_user=callback.from_user, chat=SimpleNamespace(id=-100),
                message_id=80, text="MUST NOT SEND", answer=AsyncMock())
            await web_chat.save_web_reply(message, state)
            send.assert_not_awaited()
            callback.message.chat.id = 99
            callback.data = "webreply:7"
            await web_chat.prepare_web_reply(callback, state)
            state.set_state.assert_awaited_once()
            message.chat.id = 99
            await web_chat.save_web_reply(message, state)
            send.assert_awaited_once()
            for actor in (1, 3):
                callback.from_user.id = actor
                callback.message.chat.id = -100
                state = AsyncMock()
                await web_chat.prepare_web_reply(callback, state)
                state.set_state.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
