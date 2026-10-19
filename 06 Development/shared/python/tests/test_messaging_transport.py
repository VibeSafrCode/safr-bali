"""Offline transport, crash and private receipt checks. No Telegram/network IO."""
import asyncio
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from safr_messaging.transport import MessagingTransport, ReceiptJournal, TransportStateError, CooldownPersistenceError


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="safr-messaging-transport-")
        self.path = Path(self.directory.name) / "receipts.json"
        self.journal = ReceiptJournal(self.path)
        self.now = datetime.now(timezone.utc)
        self.item = {"delivery_kind": "welcome", "bot_key": "yoga", "locale": "en", "step": "welcome_1",
            "id": 1, "telegram_id": 810001, "text": "Synthetic exact message", "lease_token": "a" * 32,
            "lease_expires_at": (self.now + timedelta(minutes=2)).isoformat()}
        self.api = AsyncMock(return_value={"state": "DELIVERED"})
        self.send = AsyncMock(return_value=SimpleNamespace(message_id=12, date=self.now))
        self.sleep = AsyncMock()
        self.engine = MessagingTransport(bot_key="yoga", api=self.api, send=self.send, journal=self.journal,
            keyboard=lambda item: None, sleeper=self.sleep, clock=lambda: self.now)

    async def asyncTearDown(self):
        self.directory.cleanup()

    async def test_positive_receipt_is_private_and_persisted_before_ack(self):
        async def acknowledge(*args):
            data = self.journal.read()
            self.assertEqual(data["welcome:1"]["telegram_message_id"], "12")
            raw = self.path.read_text()
            self.assertNotIn("810001", raw); self.assertNotIn("Synthetic exact", raw)
            self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
            return {"state": "DELIVERED"}
        self.api.side_effect = acknowledge
        await self.engine.deliver(self.item)
        self.send.assert_awaited_once_with(810001, "Synthetic exact message", parse_mode=None, reply_markup=None, request_timeout=20)
        self.assertEqual(self.journal.read(), {})

    async def test_lost_ack_replays_only_receipt_never_telegram(self):
        self.api.return_value = None
        await self.engine.deliver(self.item)
        self.assertEqual(self.journal.read()["welcome:1"]["state"], "DELIVERED")
        self.api.return_value = {"state": "DELIVERED"}
        await self.engine.deliver(self.item)
        self.assertEqual(self.send.await_count, 1)
        self.assertEqual(self.journal.read(), {})

    async def test_crash_marker_is_unknown_and_namespaced_ids_do_not_collide(self):
        self.journal.write({"welcome:1": {"delivery_kind": "welcome", "lease_token": "a" * 32,
            "state": "UNKNOWN", "error_code": "AMBIGUOUS_SEND"}})
        self.api.side_effect = [{"state": "UNKNOWN"}, [{**self.item, "delivery_kind": "campaign"}], {"state": "DELIVERED"}]
        await self.engine.iteration()
        self.assertEqual(self.send.await_count, 1)
        self.assertEqual(self.api.call_args_list[0].args[2]["state"], "UNKNOWN")

    async def test_unknown_network_outcome_is_not_retried(self):
        self.send.side_effect = TimeoutError("synthetic")
        self.api.return_value = None
        await self.engine.deliver(self.item)
        await self.engine.deliver(self.item)
        self.assertEqual(self.send.await_count, 1)
        self.assertEqual(self.journal.read()["welcome:1"]["state"], "UNKNOWN")

    async def test_429_waits_even_when_backend_ack_is_lost_and_accepts_cancelled_ack(self):
        error = type("TelegramRetryAfter", (Exception,), {})("synthetic"); error.retry_after = 120
        self.send.side_effect = error; self.api.return_value = None
        await self.engine.deliver(self.item)
        self.sleep.assert_awaited_once_with(120)
        self.assertEqual(self.journal.read()["welcome:1"]["state"], "RETRY")
        self.api.return_value = {"state": "CANCELLED"}
        await self.engine.deliver(self.item)
        self.assertEqual(self.send.await_count, 1)
        self.assertEqual(self.journal.read(), {})

    async def test_failed_gate_write_preserves_retry_before_ack_and_restores_over_expired_gate(self):
        for old_gate in (False, True):
            with self.subTest(expired_gate_exists=old_gate):
                self.journal.write({})
                gate_path = self.engine.cooldown.journal.path
                if gate_path.exists(): gate_path.unlink()
                if old_gate:
                    self.engine.cooldown.journal.write({"not_before": (self.now - timedelta(seconds=1)).isoformat()})
                error = type("TelegramRetryAfter", (Exception,), {})("synthetic"); error.retry_after = 120
                self.send.side_effect = error; self.api.reset_mock()
                with patch.object(self.engine.cooldown.journal, "write", side_effect=OSError("synthetic gate failure")):
                    with self.assertRaises(CooldownPersistenceError): await self.engine.deliver(self.item)
                self.assertEqual(self.journal.read()["welcome:1"]["state"], "RETRY")
                self.api.assert_not_awaited()
                restarted = MessagingTransport(bot_key="yoga", api=self.api, send=self.send,
                    journal=self.journal, keyboard=lambda item: None, clock=lambda: self.now)
                self.api.return_value = None  # Lost ACK must not lose RETRY or gate.
                self.assertFalse(await restarted.iteration())
                self.assertEqual(restarted.cooldown.remaining(), 120)
                self.assertEqual(self.journal.read()["welcome:1"]["state"], "RETRY")
                self.api.return_value = {"state": "PENDING"}; self.api.reset_mock()
                self.assertFalse(await restarted.iteration())
                self.assertEqual(self.journal.read(), {})
                self.assertEqual(restarted.cooldown.remaining(), 120)
                self.assertEqual(self.api.await_count, 1)
                self.assertTrue(self.api.call_args.args[1].endswith("/settle"))

    async def test_wrong_bot_stale_lease_and_invalid_shape_never_send(self):
        with self.assertRaises(TransportStateError):
            await self.engine.deliver({**self.item, "bot_key": "safrway"})
        with self.assertRaises(TransportStateError):
            await self.engine.deliver({**self.item, "telegram_id": "810001"})
        await self.engine.deliver({**self.item, "lease_expires_at": self.now.isoformat()})
        self.send.assert_not_awaited()

    async def test_429_gate_survives_successful_ack_and_interrupted_sleep_restart(self):
        error = type("TelegramRetryAfter", (Exception,), {})("synthetic"); error.retry_after = 120
        self.send.side_effect = error
        self.api.return_value = {"state": "PENDING"}
        self.sleep.side_effect = asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError): await self.engine.deliver(self.item)
        self.assertEqual(self.journal.read(), {})  # ACK removal must not remove the gate.
        restarted = MessagingTransport(bot_key="yoga", api=self.api, send=self.send,
            journal=self.journal, keyboard=lambda item: None, clock=lambda: self.now)
        self.api.reset_mock()
        self.assertFalse(await restarted.iteration())
        self.api.assert_not_awaited()
        self.assertEqual(restarted.cooldown.remaining(), 120)
        self.now += timedelta(seconds=121)
        self.api.return_value = []
        self.assertFalse(await restarted.iteration())
        self.api.assert_awaited_once_with("POST", "/claim", None)

    async def test_corrupt_cooldown_and_retry_receipt_fail_closed_without_claim(self):
        path = self.engine.cooldown.journal.path
        path.write_text('{"not_before":"bad timestamp"}'); path.chmod(0o600)
        with self.assertRaises(TransportStateError): await self.engine.iteration()
        self.api.assert_not_awaited(); self.send.assert_not_awaited()
        path.unlink()
        self.journal.write({"welcome:1": {"delivery_kind": "welcome", "state": "RETRY"}})
        with self.assertRaises(TransportStateError): await self.engine.iteration()
        self.api.assert_not_awaited(); self.send.assert_not_awaited()

    async def test_malformed_saved_settlements_never_replay_or_overwrite_corrupt_bytes(self):
        base = {"delivery_kind": "welcome", "lease_token": "a" * 32}
        for value in ({"delivery_kind": "welcome", "state": "RETRY", "retry_after_seconds": 120},
                      {**base, "state": "RETRY", "retry_after_seconds": 120, "error_code": "wrong_code"},
                      {**base, "state": "DELIVERED", "telegram_message_id": 12, "delivered_at": self.now.isoformat()},
                      {**base, "state": "DELIVERED", "telegram_message_id": "12", "delivered_at": "2030-01-01"},
                      {**base, "state": "UNKNOWN", "error_code": ["AMBIGUOUS_SEND"]},
                      {**base, "state": [], "error_code": "AMBIGUOUS_SEND"}):
            raw = json.dumps({"welcome:1": value})
            self.path.write_text(raw); self.path.chmod(0o600)
            with self.subTest(state=value.get("state")), self.assertRaises(TransportStateError):
                await self.engine.iteration()
            self.assertEqual(self.path.read_text(), raw)
        self.api.assert_not_awaited(); self.send.assert_not_awaited()

    async def test_broken_readonly_or_symlink_receipts_fail_before_send(self):
        self.path.write_text("not JSON"); self.path.chmod(0o600)
        with self.assertRaises(TransportStateError): await self.engine.deliver(self.item)
        self.path.unlink(); self.path.symlink_to(Path(self.directory.name) / "other")
        with self.assertRaises(TransportStateError): await self.engine.deliver(self.item)
        self.send.assert_not_awaited()

    async def test_storage_failure_before_intent_never_sends(self):
        self.journal.write = lambda data: (_ for _ in ()).throw(OSError("synthetic disk failure"))
        with self.assertRaises(OSError): await self.engine.deliver(self.item)
        self.send.assert_not_awaited()

    async def test_malformed_lease_timestamp_is_a_bounded_protocol_error_before_intent(self):
        missing = dict(self.item); missing.pop("lease_expires_at")
        for value in (missing, {**self.item, "lease_expires_at": None}, {**self.item, "lease_expires_at": "bad date"},
                      {**self.item, "lease_expires_at": "2030-01-01T00:00:00"}):
            with self.subTest(value=value.get("lease_expires_at")), self.assertRaisesRegex(TransportStateError, "messaging_delivery_invalid"):
                await self.engine.deliver(value)
        self.send.assert_not_awaited()
        self.assertFalse(self.path.exists())

    async def test_unauthorized_transport_halts_before_claiming_more_people(self):
        self.send.side_effect = type("TelegramUnauthorizedError", (Exception,), {})("synthetic")
        with self.assertRaisesRegex(TransportStateError, "identity_invalid"):
            await self.engine.deliver(self.item)
        self.api.reset_mock()
        with self.assertRaises(TransportStateError): await self.engine.iteration()
        self.api.assert_not_awaited()


if __name__ == "__main__": unittest.main()
