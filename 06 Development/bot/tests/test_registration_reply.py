"""Synthetic registration notification → existing individual reply ACL/FSM."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.core.config import Settings
from app.handlers import contact, start
from app.services import conversation_store, referrals, support_notifications


class RegistrationReplyTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.settings = Settings(
            _env_file=None, BOT_TOKEN="123:synthetic", ADMIN_CHAT_ID=1,
            SUPPORT_CHAT_IDS="99,1", MANAGER_CHAT_IDS="2",
        )
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        directory = Path(temporary.name)
        for target, name, value in (
            (start, "settings", self.settings),
            (contact, "settings", self.settings),
            (support_notifications, "settings", self.settings),
            (conversation_store, "CONVERSATIONS_PATH", directory / "conversations.json"),
            (referrals, "REFERRALS_PATH", directory / "referrals.json"),
            (referrals, "USER_ACTIVITY_PATH", directory / "activity.json"),
            (contact, "sync_runtime_event", AsyncMock(return_value=True)),
        ):
            replacement = patch.object(target, name, value)
            replacement.start()
            self.addCleanup(replacement.stop)
        self.bot = SimpleNamespace(send_message=AsyncMock())
        self.registration = SimpleNamespace(
            from_user=SimpleNamespace(id=500, full_name="Synthetic Client", username="fixture"),
            answer=AsyncMock(), bot=self.bot,
        )

    def callback(self, actor_id):
        # The notification itself was authored by the bot, not the operator.
        return SimpleNamespace(
            data="reply:500", from_user=SimpleNamespace(id=actor_id),
            answer=AsyncMock(), message=SimpleNamespace(
                from_user=SimpleNamespace(id=900, is_bot=True), answer=AsyncMock(),
            ),
        )

    async def test_new_registration_root_button_support_remains_observer(self):
        await start.attach_referral_if_needed(self.registration, None)
        calls = self.bot.send_message.await_args_list
        self.assertEqual([call.kwargs["chat_id"] for call in calls], [1, 99])
        keyboard = calls[0].kwargs["reply_markup"].inline_keyboard
        self.assertEqual(len(keyboard), 1)
        self.assertEqual(len(keyboard[0]), 1)
        self.assertEqual(keyboard[0][0].text, "Написать человеку")
        self.assertEqual(keyboard[0][0].callback_data, "reply:500")
        self.assertIsNone(calls[1].kwargs.get("reply_markup"))
        self.assertIn("Источник:", calls[0].kwargs["text"])
        self.assertIn("Пригласил:", calls[0].kwargs["text"])
        self.assertFalse(conversation_store.CONVERSATIONS_PATH.exists())
        # Another /start does not repeat the notification or introduce a send.
        await start.attach_referral_if_needed(self.registration, None)
        self.assertEqual(self.bot.send_message.await_count, 2)

    async def test_root_uses_existing_reply_state_without_sending_before_next_message(self):
        callback, state = self.callback(1), AsyncMock()
        await contact.reply_button_handler(callback, state)
        state.set_state.assert_awaited_once_with(contact.ContactHumanState.waiting_for_admin_reply)
        state.update_data.assert_awaited_once_with(client_id=500)
        callback.answer.assert_awaited_once_with()
        callback.message.answer.assert_awaited_once()
        self.bot.send_message.assert_not_awaited()

        state.get_data.return_value = {"client_id": 500}
        message = SimpleNamespace(
            from_user=SimpleNamespace(id=1, full_name="Synthetic Root"),
            text="Synthetic individual reply", voice=None, answer=AsyncMock(),
        )
        await contact.admin_reply_message(message, state, self.bot)
        sends = self.bot.send_message.await_args_list
        self.assertEqual(sum(call.kwargs["chat_id"] == 500 for call in sends), 1)
        self.assertIn("Synthetic individual reply", sends[0].kwargs["text"])
        record = conversation_store.ensure_client_record(500)
        self.assertTrue(record["active"])
        self.assertEqual(record["messages"][-1]["from_id"], 1)
        self.assertEqual(record["assigned_staff_ids"], [])
        state.clear.assert_awaited_once()

    async def test_support_or_client_cannot_use_forwarded_or_forged_button(self):
        for actor in (99, 500):
            with self.subTest(actor=actor):
                callback, state = self.callback(actor), AsyncMock()
                await contact.reply_button_handler(callback, state)
                callback.answer.assert_awaited_once_with("Недостаточно прав", show_alert=True)
                state.set_state.assert_not_awaited()
                callback.message.answer.assert_not_awaited()
        self.assertFalse(conversation_store.CONVERSATIONS_PATH.exists())

    async def test_manager_must_be_assigned_and_owner_only_remains_enforced(self):
        callback, state = self.callback(2), AsyncMock()
        await contact.reply_button_handler(callback, state)
        state.set_state.assert_not_awaited()
        contact.set_client_routing(500, {}, [1, 2])
        callback, state = self.callback(2), AsyncMock()
        await contact.reply_button_handler(callback, state)
        state.set_state.assert_awaited_once_with(contact.ContactHumanState.waiting_for_admin_reply)

        contact.set_restricted_to_owner(500, True)
        callback, state = self.callback(2), AsyncMock()
        await contact.reply_button_handler(callback, state)
        state.set_state.assert_not_awaited()
        callback.answer.assert_awaited_once_with("У вас нет доступа к этому клиенту.", show_alert=True)
        root_callback, root_state = self.callback(1), AsyncMock()
        await contact.reply_button_handler(root_callback, root_state)
        root_state.set_state.assert_awaited_once()

    async def test_access_is_rechecked_when_operator_submits_reply(self):
        contact.set_client_routing(500, {}, [1, 2])
        callback, state = self.callback(2), AsyncMock()
        await contact.reply_button_handler(callback, state)
        state.get_data.return_value = {"client_id": 500}
        contact.set_restricted_to_owner(500, True)
        message = SimpleNamespace(
            from_user=SimpleNamespace(id=2, full_name="Synthetic Manager"),
            text="Must not be delivered", voice=None, answer=AsyncMock(),
        )
        await contact.admin_reply_message(message, state, self.bot)
        self.bot.send_message.assert_not_awaited()
        state.clear.assert_awaited_once()
        self.assertEqual(conversation_store.ensure_client_record(500)["messages"], [])


if __name__ == "__main__":
    unittest.main()
