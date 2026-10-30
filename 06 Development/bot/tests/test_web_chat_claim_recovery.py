"""Actual worker source with deterministic API/transport fakes, not Telegram QA."""
import asyncio
from copy import deepcopy
import importlib.util
from pathlib import Path
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch


def load_worker():
    config = ModuleType("app.core.config")
    config.settings = SimpleNamespace(ADMIN_CHAT_ID=1101, support_chat_ids=[], support_reply_chat_ids=[])
    backend = ModuleType("app.services.backend_client")
    for name in ("get_web_conversation", "get_web_outbox", "mark_web_event_delivered",
                 "claim_web_event_delivery", "journal_web_event_delivery"):
        setattr(backend, name, AsyncMock())
    routing = ModuleType("app.services.staff_routing")
    routing.get_recipients_for_route = lambda context: [1101]
    aiogram = ModuleType("aiogram")
    aiogram.Bot = object
    types = ModuleType("aiogram.types")
    types.InlineKeyboardButton = lambda **kwargs: SimpleNamespace(**kwargs)
    types.InlineKeyboardMarkup = lambda **kwargs: SimpleNamespace(**kwargs)
    exceptions = ModuleType("aiogram.exceptions")
    exceptions.TelegramBadRequest = type("SyntheticBadRequest", (Exception,), {})
    exceptions.TelegramForbiddenError = type("SyntheticForbidden", (Exception,), {})
    modules = {item.__name__: item for item in (config, backend, routing, aiogram, types, exceptions)}
    file = Path(__file__).resolve().parents[1] / "app/services/web_chat_bridge.py"
    spec = importlib.util.spec_from_file_location("_safr_f01_worker_contract", file)
    worker = importlib.util.module_from_spec(spec)
    # Preserve the aggregate test process's real modules/config. Only this
    # freshly loaded worker holds the explicit synthetic imported references.
    with patch.dict("sys.modules", modules):
        spec.loader.exec_module(worker)
    return worker


class WebChatClaimRecovery(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.worker = load_worker()
        self.bot = SimpleNamespace(send_message=AsyncMock())
        self.worker.claim_web_event_delivery.return_value = True
        self.worker.journal_web_event_delivery.return_value = True
        self.worker.mark_web_event_delivered.return_value = True
        self.context = {"service": "C1", "locale": "ar"}
        self.event = {"id": 7, "aggregate_id": 11, "event_type": "web_chat_message", "status": "pending",
                      "payload": {"conversation_id": 11, "message_id": 21,
                                  "route_context": self.context, "source": "website"}}
        self.conversation = {"id": 11, "route_context": {"service": "CHANGED_B"},
                             "client": {"telegram_id": 910001, "first_name": "Synthetic"},
                             "messages": [{"id": 21, "author_type": "client", "visibility": "client",
                                           "body": "Message A", "route_context": self.context, "source": "website"},
                                          {"id": 22, "author_type": "client", "visibility": "client",
                                           "body": "Message B", "route_context": {"service": "D2"}, "source": "website"}]}
        self.worker.get_web_conversation.return_value = self.conversation

    async def test_no_committed_claim_ack_means_no_transport(self):
        self.worker.claim_web_event_delivery.return_value = False
        await self.worker.deliver_event(self.bot, self.event)
        self.bot.send_message.assert_not_awaited()
        self.worker.journal_web_event_delivery.assert_not_awaited()

    async def test_exact_message_and_event_context_not_latest_page(self):
        contexts = []
        self.worker.get_recipients_for_route = lambda context: contexts.append(deepcopy(context)) or [1101]
        await self.worker.deliver_event(self.bot, self.event)
        self.worker.get_web_conversation.assert_awaited_once_with(11, message_id=21)
        self.assertEqual(contexts, [self.context])
        call = self.bot.send_message.await_args
        self.assertIn("Message A", call.args[1])
        self.assertNotIn("Message B", call.args[1])
        self.assertNotIn("CHANGED_B", call.args[1])
        self.assertEqual(self.worker.claim_web_event_delivery.await_args.kwargs["message_body"], "Message A")

    async def test_explicit_support_gets_dialogue_controls_without_assignment(self):
        self.worker.settings.support_chat_ids = [1101, 2202]
        self.worker.settings.support_reply_chat_ids = [2202]
        await self.worker.deliver_event(self.bot, self.event)
        calls = self.bot.send_message.await_args_list
        self.assertEqual([c.args[0] for c in calls], [1101, 2202])
        support = calls[1].kwargs['reply_markup']
        self.assertEqual([b.callback_data for row in support.inline_keyboard for b in row],
                         ['webreply:11', 'webhistory:11'])
        receipt = self.worker.mark_web_event_delivered.await_args
        self.assertEqual(receipt.args[1], [1101])

    async def test_lost_claim_ack_and_restarted_claim_do_not_send(self):
        self.worker.claim_web_event_delivery.return_value = False
        await self.worker.deliver_event(self.bot, self.event)
        stale = deepcopy(self.event)
        stale["status"] = "claimed"
        stale["payload"]["delivery_attempt"] = {"attempt_id": "synthetic-claim"}
        await self.worker.deliver_event(self.bot, stale)
        self.bot.send_message.assert_not_awaited()
        self.assertEqual(self.worker.claim_web_event_delivery.await_count, 1)

    async def test_lost_receipt_ack_retries_receipt_only(self):
        self.worker.journal_web_event_delivery.return_value = False
        await self.worker.deliver_event(self.bot, self.event)
        self.assertEqual(self.bot.send_message.await_count, 1)
        self.worker.mark_web_event_delivered.assert_not_awaited()
        first = deepcopy(self.worker.journal_web_event_delivery.await_args.kwargs)
        self.assertIn(7, self.worker._pending_receipt_journals)
        self.worker.journal_web_event_delivery.return_value = True
        await self.worker.retry_receipt_journals()
        self.assertEqual(self.bot.send_message.await_count, 1)
        self.assertEqual(self.worker.journal_web_event_delivery.await_args.kwargs, first)
        self.worker.mark_web_event_delivered.assert_awaited_once()
        self.assertNotIn(7, self.worker._pending_receipt_journals)

    async def test_settling_after_restart_is_ack_only(self):
        event = deepcopy(self.event)
        event["status"] = "settling"
        event["payload"].update(delivery_attempt={"attempt_id": "synthetic-claim"},
                                pending_settlement_receipt={"status": "delivered", "recipient_ids": [1101],
                                                            "delivery_results": {"1101": "delivered"}})
        await self.worker.deliver_event(self.bot, event)
        self.bot.send_message.assert_not_awaited()
        self.worker.claim_web_event_delivery.assert_not_awaited()
        self.worker.mark_web_event_delivered.assert_awaited_once()

    async def test_lost_settlement_ack_does_not_repeat_transport(self):
        self.worker.mark_web_event_delivered.return_value = False
        await self.worker.deliver_event(self.bot, self.event)
        event = deepcopy(self.event)
        event["status"] = "settling"
        claim = self.worker.claim_web_event_delivery.await_args.kwargs
        receipt = self.worker.journal_web_event_delivery.await_args.kwargs["receipt"]
        event["payload"].update(delivery_attempt={"attempt_id": claim["attempt_id"]},
                                pending_settlement_receipt=receipt)
        await self.worker.deliver_event(self.bot, event)
        self.assertEqual(self.bot.send_message.await_count, 1)
        self.assertEqual(self.worker.mark_web_event_delivered.await_count, 2)

    async def test_observer_has_no_controls_and_is_not_assigned(self):
        self.worker.settings.support_chat_ids = [2202, 1101, 2202]
        await self.worker.deliver_event(self.bot, self.event)
        calls = self.bot.send_message.await_args_list
        self.assertEqual([c.args[0] for c in calls], [1101, 2202])
        self.assertIsNotNone(calls[0].kwargs["reply_markup"])
        self.assertIsNone(calls[1].kwargs["reply_markup"])
        receipt = self.worker.journal_web_event_delivery.await_args.kwargs["receipt"]
        self.assertEqual(receipt["recipient_ids"], [1101])
        self.assertEqual(set(receipt["delivery_results"]), {"1101", "2202"})

    async def test_unknown_transport_is_failed_not_replayed(self):
        self.bot.send_message.side_effect = asyncio.TimeoutError("synthetic unknown outcome")
        await self.worker.deliver_event(self.bot, self.event)
        receipt = self.worker.journal_web_event_delivery.await_args.kwargs["receipt"]
        self.assertEqual(receipt["status"], "failed")
        self.assertEqual(receipt["delivery_results"], {"1101": "unknown"})
        self.assertEqual(receipt["recipient_ids"], [])
        event = deepcopy(self.event)
        event["status"] = "claimed"
        await self.worker.deliver_event(self.bot, event)
        self.assertEqual(self.bot.send_message.await_count, 1)

    async def test_missing_snapshot_finishes_without_transport(self):
        event = deepcopy(self.event)
        del event["payload"]["route_context"]
        await self.worker.deliver_event(self.bot, event)
        self.bot.send_message.assert_not_awaited()
        self.worker.get_web_conversation.assert_not_awaited()
        request = self.worker.claim_web_event_delivery.await_args.kwargs
        self.assertEqual((request["primary_ids"], request["observer_ids"]), ([], []))
        receipt = self.worker.journal_web_event_delivery.await_args.kwargs["receipt"]
        self.assertEqual(receipt["status"], "failed")
        self.assertEqual(receipt["error_code"], "client_source_snapshot_unavailable")

    async def test_conflicting_message_snapshot_does_not_send(self):
        self.conversation["messages"][0]["route_context"] = {"service": "WRONG"}
        await self.worker.deliver_event(self.bot, self.event)
        self.bot.send_message.assert_not_awaited()
        receipt = self.worker.journal_web_event_delivery.await_args.kwargs["receipt"]
        self.assertEqual(receipt["error_code"], "client_message_source_conflict")

    async def test_bounded_pending_journal_capacity_stops_new_send(self):
        self.worker._pending_receipt_journals.update({i: {} for i in range(100)})
        await self.worker.deliver_event(self.bot, self.event)
        self.bot.send_message.assert_not_awaited()
        self.worker.claim_web_event_delivery.assert_not_awaited()

    def fill_pending_receipts(self, count):
        for event_id in range(1, count + 1):
            self.worker._pending_receipt_journals[event_id] = {
                "attempt_id": f"synthetic-{event_id}",
                "receipt": {"status": "delivered", "recipient_ids": [1101],
                            "error_code": None, "delivery_results": {"1101": "delivered"}},
            }

    async def test_three_failed_journals_do_not_starve_later_receipts_at_capacity(self):
        self.fill_pending_receipts(100)
        original = deepcopy(self.worker._pending_receipt_journals)
        async def journal(event_id, **kwargs):
            self.assertEqual(kwargs, original[event_id])
            return event_id > 3
        self.worker.journal_web_event_delivery.side_effect = journal
        for _ in range(34):
            before = self.worker.journal_web_event_delivery.await_count
            await self.worker.retry_receipt_journals()
            self.assertLessEqual(self.worker.journal_web_event_delivery.await_count - before, 3)
        self.assertEqual(set(self.worker._pending_receipt_journals), {1, 2, 3})
        self.assertEqual(self.worker.mark_web_event_delivered.await_count, 97)
        self.bot.send_message.assert_not_awaited()
        self.worker.claim_web_event_delivery.assert_not_awaited()

    async def test_unexpected_journal_exception_does_not_pin_the_next_retry_batch(self):
        self.fill_pending_receipts(7)
        async def journal(event_id, **kwargs):
            if event_id == 1:
                raise RuntimeError("synthetic journal failure")
            return True
        self.worker.journal_web_event_delivery.side_effect = journal
        with self.assertRaisesRegex(RuntimeError, "synthetic journal failure"):
            await self.worker.retry_receipt_journals()
        await self.worker.retry_receipt_journals()
        self.assertEqual([call.args[0] for call in self.worker.journal_web_event_delivery.await_args_list], [1, 2, 3, 4])
        self.assertEqual(set(self.worker._pending_receipt_journals), {1, 5, 6, 7})
        self.bot.send_message.assert_not_awaited()
        self.worker.claim_web_event_delivery.assert_not_awaited()

    async def test_cancelled_journal_keeps_receipt_and_advances_later_batch(self):
        self.fill_pending_receipts(7)
        entered = asyncio.Event()
        async def journal(event_id, **kwargs):
            if event_id == 1:
                entered.set()
                await asyncio.Future()
            return True
        self.worker.journal_web_event_delivery.side_effect = journal
        task = asyncio.create_task(self.worker.retry_receipt_journals())
        await asyncio.wait_for(entered.wait(), timeout=1)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(set(self.worker._pending_receipt_journals), set(range(1, 8)))
        await self.worker.retry_receipt_journals()
        self.assertEqual([call.args[0] for call in self.worker.journal_web_event_delivery.await_args_list], [1, 2, 3, 4])
        self.assertEqual(set(self.worker._pending_receipt_journals), {1, 5, 6, 7})
        self.bot.send_message.assert_not_awaited()
        self.worker.claim_web_event_delivery.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
