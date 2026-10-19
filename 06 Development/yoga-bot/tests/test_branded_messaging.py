"""Real aiogram dispatcher and HTTP facade; all actors/transports are offline."""
from datetime import datetime, timedelta, timezone
import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from tests import test_reused_menu_account as account_tests
from tests.test_shared_intake import config, incoming
from tests.test_foundation import SHARED
from yoga_bot.api_client import BackendUnavailable, BackendRejected
from yoga_bot.catalog import load_catalog
from yoga_bot.config import RuntimeTransportError, RuntimeConfigError
from yoga_bot.messaging import BrandedMessaging
from yoga_bot.runtime import create_dispatcher
from yoga_bot.delivery_worker import run_deliveries
import asyncio


class BrandedMessagingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await account_tests.ReusedAccountDispatchTests.asyncSetUp(self)
        self.messaging = SimpleNamespace(contact=AsyncMock())
        self.dp = create_dispatcher(config(state_directory=self.root, account_enabled=True, messaging_enabled=True),
            load_catalog(SHARED), client=self.client, intake_state=self.state, messaging=self.messaging)

    async def asyncTearDown(self):
        await account_tests.ReusedAccountDispatchTests.asyncTearDown(self)

    callback = account_tests.ReusedAccountDispatchTests.callback

    async def test_explicit_start_referral_is_preserved_before_contact(self):
        await self.dp._process_update(self.bot, incoming(body="/start r_ABCDEFGH"))
        self.assertEqual(self.client.register.call_args.kwargs["start_payload"], "r_ABCDEFGH")
        self.assertEqual(self.client.register.call_args.kwargs["contact_locale"], "en")
        self.messaging.contact.assert_not_awaited()

    async def test_new_messaging_endpoint_outage_never_blocks_existing_accepted_intake(self):
        requests = []
        def unavailable(request):
            requests.append(request.url.path)
            return httpx.Response(503)
        adapter = BrandedMessaging(config(state_directory=self.root, account_enabled=True, messaging_enabled=True), self.bot,
            transport=httpx.MockTransport(unavailable))
        self.addAsyncCleanup(adapter.close)
        self.assertFalse(await adapter.iteration())
        self.dp = create_dispatcher(config(state_directory=self.root, account_enabled=True, messaging_enabled=True),
            load_catalog(SHARED), client=self.client, intake_state=self.state, messaging=adapter)
        await self.dp._process_update(self.bot, incoming(body="Synthetic support question"))
        self.assertEqual(self.client.inbound.await_count, 1)
        self.assertEqual(self.client.register.call_args.kwargs["contact_locale"], "en")
        self.assertNotIn("/api/bot-messaging/contact", requests)

    async def test_language_and_followup_buttons_use_existing_private_routes(self):
        await self.callback("lang:ru")
        self.assertEqual(self.client.register.call_args.kwargs["contact_locale"], "ru")
        await self.callback("onboard:yes:17")
        await self.callback("onboard:manager:17")
        self.assertEqual(self.client.inbound.await_count, 0)
        # Opening the manager route itself sends no fake inquiry or staff copy.

    async def test_actual_shared_sender_uses_only_yoga_principal_and_plain_copy(self):
        seen = []
        now = datetime.now(timezone.utc)
        item = {"delivery_kind": "campaign", "id": 17, "bot_key": "yoga", "locale": "en",
            "telegram_id": 101, "lease_token": "a" * 32, "lease_expires_at": (now + timedelta(minutes=2)).isoformat(),
            "text": "Synthetic Yoga instruction"}
        def server(request):
            seen.append(request)
            self.assertEqual(request.headers["X-Service-Token"], config().service_api_token)
            self.assertTrue(request.url.path.startswith("/api/bot-messaging/"))
            if request.url.path.endswith("/claim"): return httpx.Response(200, json=[item])
            return httpx.Response(200, json={"state": "DELIVERED"})
        adapter = BrandedMessaging(config(state_directory=self.root, account_enabled=True, messaging_enabled=True),
            self.bot, transport=httpx.MockTransport(server))
        self.addAsyncCleanup(adapter.close)
        await adapter.iteration()
        sends = [request for request in self.session.calls if type(request).__name__ == "SendMessage"]
        self.assertEqual(sends[-1].text, "Synthetic Yoga instruction")
        self.assertIsNone(sends[-1].parse_mode)
        body = json.loads(seen[-1].content)
        self.assertEqual((body["delivery_kind"], body["state"]), ("campaign", "DELIVERED"))
        self.assertEqual(adapter.sender.journal.read(), {})

    async def test_bad_messaging_journal_stops_only_new_channel_not_existing_intake(self):
        adapter = BrandedMessaging(config(state_directory=self.root, account_enabled=True, messaging_enabled=True),
            self.bot, transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"accepted": True})))
        self.addAsyncCleanup(adapter.close)
        path = adapter.sender.journal.path
        path.write_text("synthetic broken receipt journal"); path.chmod(0o600)
        self.assertFalse(await adapter.iteration())
        self.assertTrue(adapter.suspended)
        self.assertEqual(path.read_text(), "synthetic broken receipt journal")
        self.dp = create_dispatcher(config(state_directory=self.root, account_enabled=True, messaging_enabled=True),
            load_catalog(SHARED), client=self.client, intake_state=self.state, messaging=adapter)
        await self.dp._process_update(self.bot, incoming(body="Synthetic support question"))
        self.assertEqual(self.client.inbound.await_count, 1)
        self.client.claim.return_value = []
        async def stop(_): raise asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            await run_deliveries(self.bot, self.client, self.state, sleeper=stop, messaging=adapter)
        self.client.claim.assert_awaited_once()
        self.assertEqual(path.read_text(), "synthetic broken receipt journal")

    async def test_bad_lease_timestamp_suspends_sender_but_existing_support_still_polls(self):
        for expiry in (None, "bad timestamp", "missing"):
            item = {"delivery_kind": "campaign", "id": 17, "bot_key": "yoga", "locale": "en", "telegram_id": 101,
                "text": "Synthetic", "lease_token": "a" * 32, "lease_expires_at": expiry}
            if expiry == "missing": item.pop("lease_expires_at")
            adapter = BrandedMessaging(config(state_directory=self.root, account_enabled=True, messaging_enabled=True), self.bot,
                transport=httpx.MockTransport(lambda request: httpx.Response(200, json=[item])))
            self.addAsyncCleanup(adapter.close)
            adapter.sender.journal.path.write_text("{}"); adapter.sender.journal.path.chmod(0o600)
            adapter.sender.send = AsyncMock()
            await adapter.iteration()
            self.assertTrue(adapter.suspended)
            adapter.sender.send.assert_not_awaited()
            self.assertEqual(adapter.sender.journal.path.read_text(), "{}")
            self.client.claim.reset_mock(); self.client.claim.return_value = []
            async def stop(_): raise asyncio.CancelledError()
            with self.assertRaises(asyncio.CancelledError):
                await run_deliveries(self.bot, self.client, self.state, sleeper=stop, messaging=adapter)
            self.client.claim.assert_awaited_once()

    async def test_bad_messaging_credential_is_still_fatal_not_storage_suspension(self):
        for status in (401, 403):
            adapter = BrandedMessaging(config(state_directory=self.root, account_enabled=True, messaging_enabled=True), self.bot,
                transport=httpx.MockTransport(lambda request: httpx.Response(status)))
            self.addAsyncCleanup(adapter.close)
            with self.assertRaises(BackendRejected): await adapter.iteration()
            self.assertFalse(adapter.suspended)

    async def test_restart_during_429_blocks_existing_support_queue_until_shared_deadline(self):
        now = datetime.now(timezone.utc)
        settings = config(state_directory=self.root, account_enabled=True, messaging_enabled=True)
        transport = httpx.MockTransport(lambda request: httpx.Response(200,
            json={"state": "PENDING"} if request.url.path.endswith("/settle") else []))
        first = BrandedMessaging(settings, self.bot, transport=transport)
        self.addAsyncCleanup(first.close)
        first.sender.clock = lambda: now
        first.sender.cooldown.clock = lambda: now
        error = type("TelegramRetryAfter", (Exception,), {})("synthetic"); error.retry_after = 120
        first.sender.send = AsyncMock(side_effect=error)
        first.sender.sleeper = AsyncMock(side_effect=asyncio.CancelledError())
        item = {"delivery_kind": "campaign", "id": 17, "bot_key": "yoga", "locale": "en", "telegram_id": 101,
            "text": "Synthetic", "lease_token": "a" * 32, "lease_expires_at": (now + timedelta(minutes=3)).isoformat()}
        with self.assertRaises(asyncio.CancelledError): await first.sender.deliver(item)
        self.assertEqual(first.sender.journal.read(), {})
        restarted = BrandedMessaging(settings, self.bot, transport=transport)
        self.addAsyncCleanup(restarted.close)
        restarted.sender.clock = lambda: now
        restarted.sender.cooldown.clock = lambda: now
        self.client.claim.return_value = []
        async def stop(_): raise asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            await run_deliveries(self.bot, self.client, self.state, sleeper=stop, messaging=restarted)
        self.client.claim.assert_not_awaited()
        now += timedelta(seconds=121)
        with self.assertRaises(asyncio.CancelledError):
            await run_deliveries(self.bot, self.client, self.state, sleeper=stop, messaging=restarted)
        self.client.claim.assert_awaited_once()

    async def test_corrupt_cooldown_blocks_outbound_without_killing_existing_intake(self):
        adapter = BrandedMessaging(config(state_directory=self.root, account_enabled=True, messaging_enabled=True), self.bot,
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json=[])))
        self.addAsyncCleanup(adapter.close)
        path = adapter.sender.cooldown.journal.path
        path.write_text("synthetic corrupt cooldown"); path.chmod(0o600)
        self.client.claim.return_value = []
        async def stop(_): raise asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            await run_deliveries(self.bot, self.client, self.state, sleeper=stop, messaging=adapter)
        self.client.claim.assert_not_awaited()
        self.dp = create_dispatcher(config(state_directory=self.root, account_enabled=True, messaging_enabled=True),
            load_catalog(SHARED), client=self.client, intake_state=self.state, messaging=adapter)
        await self.dp._process_update(self.bot, incoming(body="Synthetic support question"))
        self.assertEqual(self.client.inbound.await_count, 1)

    async def test_actual_sender_gate_write_failure_restart_preserves_retry_and_blocks_support(self):
        now = datetime.now(timezone.utc)
        settings = config(state_directory=self.root, account_enabled=True, messaging_enabled=True)
        requests = []
        def server(request):
            requests.append(request.url.path)
            return httpx.Response(200, json={"state": "PENDING"} if request.url.path.endswith("/settle") else [])
        transport = httpx.MockTransport(server)
        adapter = BrandedMessaging(settings, self.bot, transport=transport)
        self.addAsyncCleanup(adapter.close)
        adapter.sender.clock = adapter.sender.cooldown.clock = lambda: now
        adapter.sender.cooldown.journal.write({"not_before": (now - timedelta(seconds=1)).isoformat()})
        item = {"delivery_kind": "campaign", "id": 17, "bot_key": "yoga", "locale": "en", "telegram_id": 101,
            "text": "Synthetic", "lease_token": "a" * 32, "lease_expires_at": (now + timedelta(minutes=3)).isoformat()}
        error = type("TelegramRetryAfter", (Exception,), {})("synthetic"); error.retry_after = 120
        adapter.sender.api = AsyncMock(return_value=[item]); adapter.sender.send = AsyncMock(side_effect=error)
        with patch.object(adapter.sender.cooldown.journal, "write", side_effect=OSError("synthetic gate failure")):
            self.assertFalse(await adapter.iteration())
        self.assertTrue(adapter.outbound_suspended)
        self.assertEqual(adapter.sender.journal.read()["campaign:17"]["state"], "RETRY")
        self.assertEqual(adapter.sender.api.await_count, 1)  # claim, never ACK
        restarted = BrandedMessaging(settings, self.bot, transport=transport)
        self.addAsyncCleanup(restarted.close)
        restarted.sender.clock = restarted.sender.cooldown.clock = lambda: now
        self.client.claim.return_value = []
        async def stop(_): raise asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            await run_deliveries(self.bot, self.client, self.state, sleeper=stop, messaging=restarted)
        self.client.claim.assert_not_awaited()
        self.assertEqual(requests, ["/api/bot-messaging/deliveries/17/settle"])
        self.assertEqual(restarted.sender.cooldown.remaining(), 120)
        self.assertEqual(restarted.sender.journal.read(), {})
        self.dp = create_dispatcher(settings, load_catalog(SHARED), client=self.client, intake_state=self.state, messaging=adapter)
        await self.dp._process_update(self.bot, incoming(body="Synthetic support question"))
        self.assertEqual(self.client.inbound.await_count, 1)

    async def test_failed_cooldown_write_never_resumes_either_queue_after_memory_deadline(self):
        adapter = BrandedMessaging(config(state_directory=self.root, account_enabled=True, messaging_enabled=True), self.bot,
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json=[])))
        self.addAsyncCleanup(adapter.close)
        now = datetime.now(timezone.utc)
        adapter.sender.cooldown.clock = lambda: now
        with patch.object(adapter.sender.cooldown.journal, "write", side_effect=OSError("synthetic full disk")):
            adapter.postpone(120)
        self.assertTrue(adapter.outbound_suspended)
        now += timedelta(seconds=121)
        adapter.sender.api = AsyncMock(return_value=[])
        self.assertFalse(await adapter.iteration())
        adapter.sender.api.assert_not_awaited()
        self.client.claim.return_value = []
        async def stop(_): raise asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            await run_deliveries(self.bot, self.client, self.state, sleeper=stop, messaging=adapter)
        self.client.claim.assert_not_awaited()
        self.dp = create_dispatcher(config(state_directory=self.root, account_enabled=True, messaging_enabled=True),
            load_catalog(SHARED), client=self.client, intake_state=self.state, messaging=adapter)
        await self.dp._process_update(self.bot, incoming(body="Synthetic support question"))
        self.assertEqual(self.client.inbound.await_count, 1)


if __name__ == "__main__": unittest.main()
