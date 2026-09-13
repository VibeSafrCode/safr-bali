import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.core.config import settings
from app.handlers import contact, web_chat
from app.services import web_chat_bridge


class ReplyLatencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_reply_acknowledged_before_telegram_prompt(self):
        order = []
        async def ack(): order.append("ack")
        async def prompt(*args): order.append("prompt")
        callback = SimpleNamespace(data="reply:100", from_user=SimpleNamespace(id=1),
                                   answer=AsyncMock(side_effect=ack), message=SimpleNamespace(answer=AsyncMock(side_effect=prompt)))
        state = AsyncMock()
        with patch.object(contact, "is_staff_user", return_value=True), patch.object(contact, "can_staff_access_client", return_value=True):
            await contact.reply_button_handler(callback, state)
        self.assertEqual(order, ["ack", "prompt"])

    async def test_web_reply_acknowledged_while_lookup_pending_no_early_access(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def slow(*args):
            entered.set()
            await release.wait()
            return None
        callback = SimpleNamespace(data="webreply:10", from_user=SimpleNamespace(id=1),
                                   answer=AsyncMock(), message=SimpleNamespace(answer=AsyncMock()))
        state = AsyncMock()
        with patch.object(web_chat, "load_allowed_conversation", side_effect=slow):
            task = asyncio.create_task(web_chat.prepare_web_reply(callback, state))
            await entered.wait()
            callback.answer.assert_awaited_once()
            state.set_state.assert_not_awaited()
            release.set()
            await task
        state.set_state.assert_not_awaited()

    async def test_reply_send_and_confirmation_precede_history_and_notice_cleanup(self):
        order = []
        def effect(label):
            async def call(*args, **kwargs): order.append(label)
            return call
        message = SimpleNamespace(from_user=SimpleNamespace(id=1, full_name="Manager"), voice=None, text="Hello",
                                  answer=AsyncMock(side_effect=effect("confirmed")))
        bot = SimpleNamespace(send_message=AsyncMock(side_effect=effect("sent")))
        state = AsyncMock()
        state.get_data.return_value = {"client_id": 100}
        with (
            patch.object(contact, "is_staff_user", return_value=True),
            patch.object(contact, "can_staff_access_client", return_value=True),
            patch.object(contact, "ensure_client_record", return_value={"restricted_to_owner": True, "last_notice_message_id": 5}),
            patch.object(contact, "add_history_item"), patch.object(contact, "set_dialog_active"),
            patch.object(contact, "sync_runtime_event", side_effect=effect("mirror")),
            patch.object(contact, "delete_last_notice", side_effect=effect("cleanup")),
        ):
            await contact.admin_reply_message(message, state, bot)
        self.assertEqual(order, ["sent", "confirmed", "mirror", "cleanup"])
        state.clear.assert_awaited_once()

    async def test_delayed_cleanup_does_not_delete_newer_client_notice(self):
        bot = AsyncMock()
        with patch.object(contact, "ensure_client_record", return_value={"last_notice_message_id": 9}), patch.object(contact, "set_last_notice_message_id") as save:
            await contact.delete_last_notice(bot, 100, expected_message_id=5)
        bot.delete_message.assert_not_awaited()
        save.assert_not_called()

    async def test_observer_receives_copy_without_reply_controls_or_assignment(self):
        bot = AsyncMock()
        event = {"id": 12, "event_type": "web_chat_message", "aggregate_id": 10}
        conversation = {"client": {"telegram_id": 100}, "messages": [{"author_type": "client", "body": "Visa question"}]}
        with (
            patch.object(settings, "SUPPORT_CHAT_IDS", "3"),
            patch.object(web_chat_bridge, "get_recipients_for_route", return_value=[1, 2]),
            patch.object(web_chat_bridge, "get_web_conversation", AsyncMock(return_value=conversation)),
            patch.object(web_chat_bridge, "mark_web_event_delivered", AsyncMock()) as settle,
        ):
            await web_chat_bridge.deliver_event(bot, event)
        self.assertEqual([call.args[0] for call in bot.send_message.await_args_list], [1, 2, 3])
        self.assertIsNone(bot.send_message.await_args_list[-1].kwargs["reply_markup"])
        self.assertEqual(settle.await_args.args, (12, [1, 2]))
        self.assertEqual(settle.await_args.kwargs["delivery_results"]["3"], "delivered")

    async def test_partial_delivery_records_unknown_without_replaying_client(self):
        async def send(recipient, *args, **kwargs):
            if recipient == 3:
                raise TimeoutError()
        bot = SimpleNamespace(send_message=AsyncMock(side_effect=send))
        event = {"id": 12, "event_type": "web_user_registered", "payload": {}}
        with patch.object(settings, "SUPPORT_CHAT_IDS", "3"), patch.object(settings, "ADMIN_CHAT_ID", 1), patch.object(web_chat_bridge, "mark_web_event_delivered", AsyncMock()) as settle:
            with self.assertLogs(web_chat_bridge.logger, level="ERROR"):
                await web_chat_bridge.deliver_event(bot, event)
        self.assertEqual(bot.send_message.await_count, 2)
        self.assertEqual(settle.await_args.kwargs["status"], "failed")
        self.assertEqual(settle.await_args.kwargs["delivery_results"], {"1": "delivered", "3": "unknown"})
