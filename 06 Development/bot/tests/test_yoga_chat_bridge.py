"""Only fake Telegram/backend; no customer messages or network."""
import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from aiogram.methods import SendMessage
from app.core.config import Settings
from app.services import yoga_chat_bridge as bridge


def delivery(**changes):
    return dict(id=1, lease_token='synthetic-lease-token-only', recipient_id=2, recipient_role='staff',
        lease_expires_at=(datetime.now(timezone.utc)+timedelta(seconds=60)).isoformat(),
        conversation_id=7, message_id=77, body='<body> Exact client message', brand='Yoga Ganster',
        topic='c1', topic_label='C1', observer_read_only=False, allow_client_reply=True) | changes


class YogaBridgeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        config = Settings(_env_file=None, BOT_TOKEN='123:synthetic', ADMIN_CHAT_ID=1,
            MANAGER_CHAT_IDS='2', VISA_ADMIN_CHAT_IDS='3', SUPPORT_CHAT_IDS='4')
        p = patch.object(bridge, 'settings', config); p.start(); self.addCleanup(p.stop)

    def test_same_staff_controls_with_yoga_question_marker_and_literal_body(self):
        text, keyboard = bridge.staff_notice(delivery())
        self.assertEqual(text, '🧘 Yoga Ganster · C1\n\n<body> Exact client message')
        self.assertEqual([button.callback_data for row in keyboard.inline_keyboard for button in row],
            ['webreply:7','webnote:7','webhistory:7'])
        long, _ = bridge.staff_notice(delivery(body='x'*4000,topic_label='t'*200))
        self.assertLessEqual(len(long),4096)

    def test_support_is_readonly_and_yoga_client_target_never_uses_main_bot(self):
        text, keyboard = bridge.staff_notice(delivery(recipient_id=4, recipient_role='observer',observer_read_only=True))
        self.assertIn('Yoga Ganster · C1',text); self.assertIsNone(keyboard)
        for changes in [dict(recipient_id=5),dict(recipient_role='client'),dict(brand='Other'),
                        dict(recipient_id=2,recipient_role='observer',observer_read_only=True)]:
            with self.assertRaises(ValueError): bridge.staff_notice(delivery(**changes))

    async def test_positive_receipt_sets_delivered_and_settlement_retry_never_resends(self):
        bot = SimpleNamespace(send_message=AsyncMock(return_value=SimpleNamespace(message_id=99)))
        request = AsyncMock(side_effect=[None,{'id':1,'status':'DELIVERED'}])
        with patch.object(bridge,'channel_request',request), patch.object(bridge.asyncio,'sleep',AsyncMock()):
            self.assertEqual(await bridge.deliver_one(bot,delivery()),'DELIVERED')
        bot.send_message.assert_awaited_once()
        self.assertEqual(request.await_args_list[0].args, request.await_args_list[1].args)
        payload = request.await_args.args[1]
        self.assertEqual((payload['outcome'],payload['telegram_message_id']),('DELIVERED',99))
        self.assertIsNone(bot.send_message.await_args.kwargs['parse_mode'])

    async def test_ambiguous_send_is_unknown_and_not_automatically_replayed(self):
        bot = SimpleNamespace(send_message=AsyncMock(side_effect=asyncio.TimeoutError))
        request = AsyncMock(return_value={'id':1,'status':'UNKNOWN'})
        with patch.object(bridge,'channel_request',request):
            self.assertEqual(await bridge.deliver_one(bot,delivery()),'UNKNOWN')
        self.assertEqual(request.await_args.args[1]['error_code'],'send_outcome_unknown')
        bot.send_message.assert_awaited_once()

    async def test_definitive_block_and_presend_ratelimit_are_different_outcomes(self):
        method = SendMessage(chat_id=2,text='Synthetic')
        for error,outcome in [(TelegramForbiddenError(method=method,message='blocked'),'FAILED'),
                              (TelegramRetryAfter(method=method,message='rate',retry_after=1),'RETRY')]:
            with self.subTest(outcome=outcome):
                bot = SimpleNamespace(send_message=AsyncMock(side_effect=error))
                request = AsyncMock(return_value={'id':1,'status':outcome})
                with patch.object(bridge,'channel_request',request), patch.object(bridge.asyncio,'sleep',AsyncMock()):
                    self.assertEqual(await bridge.deliver_one(bot,delivery()),outcome)
                bot.send_message.assert_awaited_once()
                self.assertIsNone(request.await_args.args[1]['telegram_message_id'])

    async def test_bad_transport_target_is_settled_without_any_telegram_send(self):
        bot = SimpleNamespace(send_message=AsyncMock())
        request = AsyncMock(return_value={'id':1,'status':'FAILED'})
        with patch.object(bridge,'channel_request',request):
            self.assertEqual(await bridge.deliver_one(bot,delivery(recipient_role='client')),'FAILED')
        bot.send_message.assert_not_awaited()

    async def test_short_lease_never_sends_and_only_requests_presend_retry(self):
        bot = SimpleNamespace(send_message=AsyncMock())
        request = AsyncMock(return_value={'id':1,'status':'RETRY'})
        item = delivery(lease_expires_at=(datetime.now(timezone.utc)+timedelta(seconds=10)).isoformat())
        with patch.object(bridge,'channel_request',request):
            self.assertEqual(await bridge.deliver_one(bot,item),'RETRY')
        bot.send_message.assert_not_awaited()
        self.assertEqual(request.await_args.args[1]['error_code'],'transport_unavailable_before_send')

    async def test_lost_settlement_does_not_skip_provider_cooldown_or_resend(self):
        bot = SimpleNamespace(send_message=AsyncMock(side_effect=TelegramRetryAfter(
            method=SendMessage(chat_id=2,text='Synthetic'),message='rate',retry_after=40)))
        request, sleeper = AsyncMock(return_value=None), AsyncMock()
        with patch.object(bridge,'channel_request',request), patch.object(bridge.asyncio,'sleep',sleeper):
            self.assertIsNone(await bridge.deliver_one(bot,delivery()))
        bot.send_message.assert_awaited_once()
        sleeper.assert_awaited_with(40)


if __name__ == '__main__':
    unittest.main()
