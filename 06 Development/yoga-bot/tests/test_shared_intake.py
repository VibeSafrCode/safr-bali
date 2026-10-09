import asyncio
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError, TelegramRetryAfter, TelegramUnauthorizedError
from aiogram.methods import SendMessage
from aiogram.types import Update

from tests.test_foundation import DUMMY_TOKEN, SHARED, OfflineSession, settings as foundation_settings
from yoga_bot.api_client import BackendContractError, BackendRejected, BackendUnavailable, ChannelClient, Delivery, Inbound, IntakeReceipt, Settlement
from yoga_bot.catalog import load_catalog
from yoga_bot.config import RuntimeConfigError, RuntimeTransportError, Settings, backend_origin
from yoga_bot.delivery_worker import deliver_one, delivery_text
from yoga_bot.intake_state import IntakeState, IntakeStateError
from yoga_bot.runtime import create_dispatcher, main

SERVICE_SECRET = "SYNTHETIC_" + "Z" * 40


def config(**changes):
    value = Settings.from_env({"YOGA_BOT_TOKEN": DUMMY_TOKEN, "YOGA_MVP_MODE": "shared_intake",
        "YOGA_SITE_ORIGIN": "https://yoga.example.org", "YOGA_SHARED_CONTENT_ROOT": str(SHARED),
        "YOGA_BACKEND_API_ORIGIN": "http://127.0.0.1:8080", "YOGA_SERVICE_API_TOKEN": SERVICE_SECRET})
    return replace(value, **changes)


def incoming(update_id=500, body="Synthetic question", actor=101, **extra):
    message = {"message_id": update_id, "date": 1, "chat": {"id": actor, "type": "private"},
        "from": {"id": actor, "is_bot": False, "first_name": "Synthetic user", "language_code": "en"}, "text": body}
    message.update(extra)
    return Update.model_validate({"update_id": update_id, "message": message})


def delivery(**changes):
    value = {"id": 7, "lease_token": "L" * 32, "lease_expires_at": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat(),
        "recipient_id": 999, "recipient_role": "observer", "conversation_id": 77, "message_id": 123,
        "body": "Synthetic <question> & details", "brand": "Yoga Ganster", "topic": "general",
        "topic_label": "Общий вопрос", "marker": "Yoga Ganster · Общий вопрос", "observer_read_only": True,
        "allow_client_reply": False}
    return Delivery.model_validate({**value, **changes})


class SharedConfigTests(unittest.TestCase):
    def test_corrupt_journal_or_rejected_delivery_requires_manual_review_without_restart_loop(self):
        for error in (IntakeStateError("private_details"), BackendRejected("private_details"), BackendContractError("private_details")):
            with patch("yoga_bot.runtime.setup_logging"), patch("yoga_bot.runtime.Settings.from_env", return_value=config()), \
                    patch("yoga_bot.runtime.run", new=AsyncMock(side_effect=error)), patch("yoga_bot.runtime.LOG") as logger:
                self.assertEqual(main(), 2)
                logger.error.assert_called_once_with("intake_requires_operator_review")

    def test_mode_uses_only_separate_service_secret(self):
        env = {"YOGA_BOT_TOKEN": DUMMY_TOKEN, "YOGA_MVP_MODE": "shared_intake", "YOGA_SITE_ORIGIN": "https://yoga.example.org",
               "YOGA_SHARED_CONTENT_ROOT": str(SHARED), "BACKEND_SERVICE_TOKEN": SERVICE_SECRET}
        with self.assertRaisesRegex(RuntimeConfigError, "missing_or_invalid_yoga_service_token"):
            Settings.from_env(env)
        self.assertNotIn(SERVICE_SECRET, repr(config()))
        self.assertNotIn(DUMMY_TOKEN, repr(config()))

    def test_backend_url_cannot_redirect_secret_to_public_http_or_userinfo(self):
        for value in ("http://example.org", "http://127.0.0.1.example.org", "http://localhost", "https://user:password@api.example.org",
                      "https://api.example.org/api", "https://api.example.org/?x=y", "https://api.example.org#x"):
            with self.assertRaises(RuntimeConfigError):
                backend_origin(value)
        self.assertEqual(backend_origin("https://api.example.org/"), "https://api.example.org")
        self.assertEqual(config().backend_origin, "http://127.0.0.1:8080")


class JournalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def test_selected_context_and_pending_request_survive_restart_without_pii_body(self):
        actor = 987654321
        state = IntakeState(self.root)
        state.select(actor, topic="c1", locale="ru")
        initial = state.prepare(500, actor)
        restored = IntakeState(self.root)
        self.assertEqual(restored.prepare(500, actor), initial)
        self.assertEqual(restored.context(actor)["topic"], "c1")
        raw = (self.root / "context.json").read_text()
        self.assertNotIn(str(actor), raw)
        self.assertNotIn("body", raw)
        self.assertEqual((self.root / "context.json").stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.root / "context.key").stat().st_mode & 0o777, 0o600)

    def test_accepted_batch_replay_keeps_original_conversation_id_and_topic(self):
        state = IntakeState(self.root)
        state.select(101, topic="c1")
        first = state.prepare(500, 101)
        self.assertIsNone(first["conversation_id"])
        state.accept(500, 101, 77)
        self.assertEqual(state.prepare(501, 101)["conversation_id"], 77)
        state.accept(501, 101, 77)
        state.select(101, topic="d12")
        restored = IntakeState(self.root)
        self.assertEqual(restored.prepare(500, 101)["topic"], "c1")
        self.assertIsNone(restored.prepare(500, 101)["conversation_id"])
        self.assertEqual(restored.prepare(501, 101)["conversation_id"], 77)

    def test_actor_change_for_update_id_is_rejected(self):
        state = IntakeState(self.root)
        state.prepare(500, 101)
        with self.assertRaisesRegex(IntakeStateError, "intake_update_actor_conflict"):
            state.prepare(500, 102)

    def test_corrupt_file_or_missing_salt_never_falls_back_to_general(self):
        state = IntakeState(self.root)
        state.select(101, topic="c1")
        (self.root / "context.json").write_text("broken JSON")
        with self.assertRaises(IntakeStateError):
            IntakeState(self.root)
        (self.root / "context.key").unlink()
        with self.assertRaisesRegex(IntakeStateError, "intake_state_key_missing"):
            IntakeState(self.root)

    def test_unsafe_directory_file_and_symlink_refused(self):
        self.root.chmod(0o755)
        with self.assertRaises(IntakeStateError):
            IntakeState(self.root)
        self.root.chmod(0o700)
        state = IntakeState(self.root)
        state.select(101)
        (self.root / "context.json").chmod(0o644)
        with self.assertRaises(IntakeStateError):
            IntakeState(self.root)
        (self.root / "context.json").unlink()
        (self.root / "context.json").symlink_to(self.root / "context.key")
        with self.assertRaises(IntakeStateError):
            IntakeState(self.root)

    def test_retention_never_evicts_unaccepted_request_and_capacity_fails_closed(self):
        now = [1000.0]
        state = IntakeState(self.root, clock=lambda: now[0], max_updates=1, retention=10)
        state.prepare(500, 101)
        now[0] += 20
        with self.assertRaisesRegex(IntakeStateError, "intake_state_capacity"):
            state.prepare(501, 101)
        self.assertEqual(state.prepare(500, 101)["topic"], "general")
        state.accept(500, 101, 77)
        # Expired accepted metadata may be pruned; no unaccepted record is.
        self.assertEqual(state.prepare(501, 101)["conversation_id"], 77)

    def test_failed_atomic_write_stops_before_prepared_request_can_be_used(self):
        state = IntakeState(self.root)
        with patch("yoga_bot.intake_state.os.replace", side_effect=OSError("synthetic private path")):
            with self.assertRaisesRegex(IntakeStateError, "intake_state_unavailable"):
                state.prepare(500, 101)


class ClientTests(unittest.IsolatedAsyncioTestCase):
    async def make_client(self, handler):
        client = ChannelClient(config(), transport=httpx.MockTransport(handler), sleeper=AsyncMock())
        self.addAsyncCleanup(client.close)
        return client

    async def test_exact_same_payload_header_and_route_on_lost_receipt_retry(self):
        requests = []

        async def server(request):
            requests.append(request)
            if len(requests) == 1:
                raise httpx.ReadTimeout("synthetic secret exception", request=request)
            return httpx.Response(200, json={"conversation_id": 77, "message_id": 123, "idempotent_replay": True})

        client = await self.make_client(server)
        receipt = await client.inbound(Inbound(500, 101, 101, "Synthetic question", "c1"))
        self.assertTrue(receipt.idempotent_replay)
        self.assertEqual(requests[0].content, requests[1].content)
        self.assertEqual(requests[0].url.path, "/api/yoga-channel/inbound")
        self.assertEqual(requests[0].headers["X-Service-Token"], SERVICE_SECRET)
        self.assertNotIn("bot_key", json.loads(requests[0].content))

    async def test_conflict_or_redirect_not_retried_or_followed(self):
        for status in (301, 401, 403, 409, 422):
            calls = []

            def server(request):
                calls.append(request)
                return httpx.Response(status, headers={"Location": "https://untrusted.example.org"}, json={"detail": "synthetic secret"})

            client = await self.make_client(server)
            with self.assertRaisesRegex(BackendRejected, "^channel_request_rejected$"):
                await client.inbound(Inbound(500, 101, 101, "Synthetic question"))
            self.assertEqual(len(calls), 1)

    async def test_unavailable_retries_bounded_no_new_update_id(self):
        calls = []

        def server(request):
            calls.append(json.loads(request.content))
            return httpx.Response(503)

        client = await self.make_client(server)
        with self.assertRaises(BackendUnavailable):
            await client.inbound(Inbound(500, 101, 101, "Synthetic question"))
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(p == calls[0] for p in calls))

    async def test_claim_rejects_staff_destination_and_privileged_controls(self):
        for field, value in (("recipient_role", "staff"), ("allow_client_reply", True), ("observer_read_only", False),
                             ("marker", "Wrong brand · Общий вопрос"), ("recipient_id", -1)):
            raw = delivery().model_dump()
            raw[field] = value
            client = await self.make_client(lambda _: httpx.Response(200, json=[raw]))
            with self.assertRaises(BackendContractError):
                await client.claim()

    async def test_claim_optional_author_type_accepts_only_public_message_authors(self):
        for kind in (None, "client", "staff"):
            raw = delivery().model_dump()
            if kind is None:
                raw.pop("author_type")
            else:
                raw["author_type"] = kind
            client = await self.make_client(lambda _: httpx.Response(200, json=[raw]))
            self.assertEqual((await client.claim())[0].author_type, kind)
        raw["author_type"] = "internal"
        client = await self.make_client(lambda _: httpx.Response(200, json=[raw]))
        with self.assertRaises(BackendContractError):
            await client.claim()

    async def test_lost_settlement_ack_retries_exact_lease_outcome_and_message_id(self):
        requests = []

        def server(request):
            requests.append(request)
            if len(requests) == 1:
                raise httpx.ReadTimeout("synthetic", request=request)
            return httpx.Response(200, json={"id": 7, "status": "DELIVERED", "idempotent_replay": True})

        client = await self.make_client(server)
        self.assertTrue((await client.settle(delivery(), "DELIVERED", telegram_message_id=10)).idempotent_replay)
        self.assertEqual(requests[0].content, requests[1].content)
        self.assertEqual(json.loads(requests[0].content), {"lease_token": "L" * 32, "outcome": "DELIVERED",
            "error_code": None, "telegram_message_id": 10})

    async def test_settlement_cannot_report_failed_for_a_delivered_send(self):
        client = await self.make_client(lambda _: httpx.Response(200, json={"id": 7, "status": "FAILED", "idempotent_replay": False}))
        with self.assertRaises(BackendContractError):
            await client.settle(delivery(), "DELIVERED", telegram_message_id=10)
        self.assertEqual((await client.settle(delivery(), "RETRY", "rate_limited_before_send")).status, "FAILED")

    async def test_invalid_json_or_wrong_receipt_cannot_claim_acceptance(self):
        for raw in ({"conversation_id": True, "message_id": 123, "idempotent_replay": False},
                    {"conversation_id": 77, "message_id": 0, "idempotent_replay": False},
                    {"conversation_id": 77, "message_id": 123, "idempotent_replay": False, "role": "admin"}):
            client = await self.make_client(lambda _: httpx.Response(200, json=raw))
            with self.assertRaises(BackendContractError):
                await client.inbound(Inbound(500, 101, 101, "Synthetic question"))


class RuntimeIntakeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = IntakeState(self.root)
        self.session = OfflineSession()
        self.bot = Bot(DUMMY_TOKEN, session=self.session)
        self.addAsyncCleanup(self.session.close)
        self.client = AsyncMock()
        self.client.inbound.return_value = IntakeReceipt(conversation_id=77, message_id=123, idempotent_replay=False)
        self.dp = create_dispatcher(config(state_directory=self.root), load_catalog(SHARED), client=self.client, intake_state=self.state)

    async def test_start_binds_only_pinned_topic_without_creating_a_lead(self):
        await self.dp._process_update(self.bot, incoming(body="/start svc_c1"))
        self.assertEqual(self.state.context(101)["topic"], "c1")
        self.client.inbound.assert_not_awaited()
        await self.dp._process_update(self.bot, incoming(501, "Synthetic visa question"))
        request = self.client.inbound.await_args.args[0]
        self.assertEqual(request.topic, "c1")
        self.assertEqual(request.update_id, 501)
        self.assertEqual(request.sender_telegram_id, 101)

    async def test_unknown_start_context_gets_general_without_auth_grant(self):
        await self.dp._process_update(self.bot, incoming(body="/start svc_admin_spoof"))
        self.assertEqual(self.state.context(101)["topic"], "general")
        self.client.inbound.assert_not_awaited()

    async def test_account_unavailable_copy_preserves_working_text_contact_path(self):
        await self.dp._process_update(self.bot, incoming(body="/account"))
        sends = [r for r in self.session.calls if type(r).__name__ == "SendMessage"]
        self.assertIn("Accounts and rewards are not connected", sends[-1].text)
        self.assertIn("send your question here as text", sends[-1].text)
        self.assertNotIn("requests are not connected", sends[-1].text)
        self.client.inbound.assert_not_awaited()

    async def test_rapid_consecutive_questions_and_email_first_token_are_all_saved(self):
        for i, body in enumerate(("Synthetic one", "Synthetic two", "synthetic@example.org question")):
            await self.dp._process_update(self.bot, incoming(500 + i, body))
        self.assertEqual(self.client.inbound.await_count, 3)
        self.assertEqual(self.client.inbound.await_args.args[0].body, "synthetic@example.org question")

    async def test_backend_outage_stops_polling_before_any_offset_confirmation(self):
        self.client.inbound.side_effect = BackendUnavailable("channel_transport_unavailable")
        offsets = []

        async def request(bot, method, timeout=None):
            if type(method).__name__ == "GetMe":
                return self.session.me
            if type(method).__name__ == "GetUpdates":
                offsets.append(method.offset)
                return [incoming(500)]
            self.fail("Unexpected Telegram response before canonical acceptance")

        with patch.object(self.session, "make_request", side_effect=request):
            with self.assertLogs("yoga_runtime", "WARNING"):
                with self.assertRaisesRegex(RuntimeTransportError, "intake_not_accepted"):
                    await self.dp._polling(self.bot, polling_timeout=1, handle_as_tasks=False, allowed_updates=["message"])
        self.assertEqual(offsets, [None])
        self.assertFalse(self.state.prepare(500, 101)["accepted"])

    async def test_lost_receipt_then_restart_reconstructs_exact_topic_and_conversation(self):
        self.state.select(101, topic="c1", locale="ru")
        self.client.inbound.side_effect = BackendUnavailable("lost_receipt")
        with self.assertLogs("yoga_runtime", "WARNING"):
            with self.assertRaises(RuntimeTransportError):
                await self.dp._process_update(self.bot, incoming(500, "Synthetic exact body"))
        first = self.client.inbound.await_args.args[0].payload()
        restored = IntakeState(self.root)
        restored.select(101, topic="d12")  # Other context must not change replay.
        other = AsyncMock()
        other.inbound.return_value = IntakeReceipt(conversation_id=77, message_id=123, idempotent_replay=True)
        dp = create_dispatcher(config(state_directory=self.root), load_catalog(SHARED), client=other, intake_state=restored)
        await dp._process_update(self.bot, incoming(500, "Synthetic exact body"))
        self.assertEqual(other.inbound.await_args.args[0].payload(), first)
        self.assertTrue(restored.prepare(500, 101)["accepted"])

    async def test_ack_failure_after_commit_is_not_unaccepted_or_duplicate_request(self):
        with patch.object(self.session, "make_request", side_effect=RuntimeError("synthetic_secret_message")):
            with self.assertLogs("yoga_runtime", "WARNING") as captured:
                result = await self.dp._process_update(self.bot, incoming())
        self.assertTrue(result)
        self.assertTrue(self.state.prepare(500, 101)["accepted"])
        self.assertEqual(self.client.inbound.await_count, 1)
        self.assertIn("intake_ack_failed", "".join(captured.output))
        self.assertNotIn("synthetic_secret_message", "".join(captured.output))

    async def test_media_is_explicitly_unsupported_not_falsely_accepted(self):
        for field, media in (("voice", {"file_id": "synthetic", "file_unique_id": "synthetic", "duration": 1}),
                             ("document", {"file_id": "synthetic", "file_unique_id": "synthetic"})):
            await self.dp._process_update(self.bot, incoming(500 if field == "voice" else 501, None, **{field: media}))
        self.client.inbound.assert_not_awaited()
        sends = [r for r in self.session.calls if type(r).__name__ == "SendMessage"]
        self.assertEqual(len(sends), 2)
        self.assertTrue(all("not supported" in r.text for r in sends))

    async def test_fatal_backend_conflict_requires_operator_and_does_not_confirm(self):
        self.client.inbound.side_effect = BackendRejected("synthetic_detail_never_logged")
        with self.assertLogs("yoga_runtime", "WARNING") as captured:
            with self.assertRaisesRegex(RuntimeConfigError, "intake_requires_operator_review"):
                await self.dp._process_update(self.bot, incoming())
        self.assertNotIn("synthetic_detail", "".join(captured.output))

    async def test_expired_callback_or_unchanged_menu_does_not_poison_intake(self):
        update = Update.model_validate({"update_id": 500, "callback_query": {"id": "synthetic", "chat_instance": "synthetic",
            "from": {"id": 101, "is_bot": False, "first_name": "Synthetic"}, "data": "home",
            "message": {"message_id": 1, "date": 1, "chat": {"id": 101, "type": "private"},
                        "from": self.session.me.model_dump(), "text": "Synthetic"}}})
        with patch.object(self.session, "make_request", side_effect=TelegramBadRequest(
                method=SendMessage(chat_id=101, text="synthetic"), message="query expired / message is not modified")):
            with self.assertLogs("yoga_runtime", "WARNING"):
                self.assertTrue(await self.dp._process_update(self.bot, update))
        await self.dp._process_update(self.bot, incoming(501))
        self.assertEqual(self.client.inbound.await_count, 1)


class DeliveryTests(unittest.IsolatedAsyncioTestCase):
    def client(self):
        client = AsyncMock()
        client.settle.return_value = Settlement(id=7, status="DELIVERED", idempotent_replay=False)
        return client

    async def test_observer_copy_is_escaped_without_staff_controls(self):
        bot, client = AsyncMock(), self.client()
        bot.send_message.return_value.message_id = 10
        await deliver_one(bot, client, delivery())
        args = bot.send_message.await_args
        self.assertEqual(args.args[0], 999)
        self.assertIn("Yoga Ganster", args.args[1])
        self.assertIn("Только просмотр", args.args[1])
        self.assertIn("ваш ответ создаёт новую заявку", args.args[1])
        self.assertIn("#77", args.args[1])
        self.assertIn("&lt;question&gt; &amp;", args.args[1])
        self.assertNotIn("reply_markup", args.kwargs)
        self.assertEqual(client.settle.await_args.kwargs["telegram_message_id"], 10)

    def test_observer_notices_distinguish_client_question_from_public_staff_reply(self):
        for locale, question, reply, warning in (("ru", "Вопрос #77", "Ответ #77", "ваш ответ создаёт новую заявку"),
                ("en", "Question #77", "Reply #77", "your reply creates a new request")):
            self.assertIn(question, delivery_text(delivery(author_type="client"), locale))
            self.assertIn(reply, delivery_text(delivery(author_type="staff"), locale))
            self.assertIn(warning, delivery_text(delivery(author_type="client"), locale))
        self.assertNotIn("Read-only", delivery_text(delivery(recipient_role="client", observer_read_only=False, author_type="staff")))

    async def test_client_reply_uses_own_source_recipient_and_no_main_bot(self):
        bot, client = AsyncMock(), self.client()
        bot.send_message.return_value.message_id = 10
        row = delivery(recipient_role="client", observer_read_only=False, recipient_id=101)
        await deliver_one(bot, client, row)
        self.assertEqual(bot.send_message.await_args.args[0], 101)
        self.assertEqual(bot.send_message.await_count, 1)

    async def test_ambiguous_send_timeout_is_unknown_never_retried(self):
        bot, client = AsyncMock(), self.client()
        bot.send_message.side_effect = TimeoutError("synthetic secret")
        await deliver_one(bot, client, delivery())
        self.assertEqual(bot.send_message.await_count, 1)
        self.assertEqual(client.settle.await_args.args[1:], ("UNKNOWN", "send_outcome_unknown"))

    async def test_known_blocked_recipient_is_failed(self):
        bot, client = AsyncMock(), self.client()
        bot.send_message.side_effect = TelegramForbiddenError(method=SendMessage(chat_id=999, text="synthetic"), message="blocked")
        await deliver_one(bot, client, delivery())
        self.assertEqual(client.settle.await_args.args[1:], ("FAILED", "recipient_blocked"))

    async def test_invalid_token_keeps_recipient_retryable_and_is_fatal_even_if_settle_fails(self):
        for backend_fails in (False, True):
            bot, client = AsyncMock(), self.client()
            bot.send_message.side_effect = TelegramUnauthorizedError(method=SendMessage(chat_id=999, text="synthetic"), message="invalid token")
            if backend_fails:
                client.settle.side_effect = BackendUnavailable("lost receipt")
            with self.assertRaisesRegex(RuntimeConfigError, "telegram_authorization_failed"):
                await deliver_one(bot, client, delivery())
            self.assertEqual(client.settle.await_args.args[1:], ("RETRY", "transport_unavailable_before_send"))

    async def test_telegram_retry_after_is_honored_without_resending_current_target(self):
        bot, client, sleeper = AsyncMock(), self.client(), AsyncMock()
        bot.send_message.side_effect = TelegramRetryAfter(method=SendMessage(chat_id=999, text="synthetic"), message="retry", retry_after=17)
        await deliver_one(bot, client, delivery(), sleeper=sleeper)
        self.assertEqual(bot.send_message.await_count, 1)
        self.assertEqual(client.settle.await_args.args[1:], ("RETRY", "rate_limited_before_send"))
        sleeper.assert_awaited_once_with(17)

    async def test_telegram_cooldown_survives_failed_presend_settlement(self):
        bot, client, sleeper = AsyncMock(), self.client(), AsyncMock()
        bot.send_message.side_effect = TelegramRetryAfter(method=SendMessage(chat_id=999, text="synthetic"), message="retry", retry_after=17)
        client.settle.side_effect = BackendUnavailable("lost_receipt")
        with self.assertRaises(BackendUnavailable):
            await deliver_one(bot, client, delivery(), sleeper=sleeper)
        sleeper.assert_awaited_once_with(17)
        self.assertEqual(bot.send_message.await_count, 1)

    async def test_insufficient_lease_never_begins_a_send(self):
        bot, client = AsyncMock(), self.client()
        row = delivery(lease_expires_at=(datetime.now(timezone.utc) + timedelta(seconds=10)).isoformat())
        await deliver_one(bot, client, row)
        bot.send_message.assert_not_awaited()
        self.assertEqual(client.settle.await_args.args[1:], ("RETRY", "transport_unavailable_before_send"))

    async def test_lost_settlement_receipt_does_not_repeat_telegram_send(self):
        bot, client = AsyncMock(), self.client()
        bot.send_message.return_value.message_id = 10
        client.settle.side_effect = BackendUnavailable("lost_settlement")
        with self.assertRaises(BackendUnavailable):
            await deliver_one(bot, client, delivery())
        self.assertEqual(bot.send_message.await_count, 1)

    def test_full_body_is_preserved_under_heading_limit(self):
        for locale in ("ru", "en"):
            for kind in (None, "client", "staff"):
                row = delivery(body="x" * 4000, conversation_id=2**63 - 1, topic_label="y" * 900,
                    marker="Yoga Ganster · " + "y" * 900, author_type=kind)
                output = delivery_text(row, locale)
                self.assertTrue(output.endswith("x" * 4000))
                self.assertIn("Yoga Ganster", output)
                self.assertIn("#" + str(2**63 - 1), output)
                self.assertIn("Read-only" if locale == "en" else "Только просмотр", output)
                self.assertLessEqual(len(output), 4096)


if __name__ == "__main__":
    unittest.main()
