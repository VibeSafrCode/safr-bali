"""Execute the actual scheduling loop with isolated IO facades and no Telegram."""
import ast
import asyncio
from pathlib import Path
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock


class OnboardingLoopTests(unittest.IsolatedAsyncioTestCase):
    def loop(self, *, receipts=None, claims=None, deliver=None):
        source = Path(__file__).resolve().parents[1] / "app/services/onboarding.py"
        module = ast.parse(source.read_text())
        node = next(node for node in module.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "run_bridge")
        sleeps = []
        async def sleep(delay):
            sleeps.append(delay)
            if len(sleeps) >= 2:
                raise asyncio.CancelledError()
        namespace = {"asyncio": SimpleNamespace(CancelledError=asyncio.CancelledError, sleep=sleep),
                     "replay_receipts": receipts or AsyncMock(), "retry_registrations": AsyncMock(),
                     "api": claims or AsyncMock(return_value=[]), "deliver": deliver or AsyncMock(),
                     "settings": SimpleNamespace(BOT_MESSAGING_ENABLED=False),
                     "logger": Mock()}
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"), namespace)
        return namespace, sleeps

    async def test_receipt_store_failure_is_retried_without_sending_until_readable(self):
        receipts = AsyncMock(side_effect=[OSError("synthetic unavailable disk"), None])
        claims = AsyncMock(return_value=[{"id": 1}])
        namespace, sleeps = self.loop(receipts=receipts, claims=claims)
        bot = object()
        with self.assertRaises(asyncio.CancelledError):
            await namespace["run_bridge"](bot)
        self.assertEqual(receipts.await_count, 2)
        self.assertEqual(claims.await_count, 1)
        namespace["deliver"].assert_awaited_once_with(bot, {"id": 1})
        self.assertEqual(sleeps, [15, 1])

    async def test_bad_claim_shape_does_not_kill_future_iterations(self):
        namespace, sleeps = self.loop(claims=AsyncMock(side_effect=[{"unexpected": "object"}, []]))
        with self.assertRaises(asyncio.CancelledError):
            await namespace["run_bridge"](object())
        namespace["deliver"].assert_not_awaited()
        self.assertEqual(namespace["api"].await_count, 2)
        self.assertEqual(sleeps, [15, 15])

    async def test_shutdown_cancellation_is_not_swallowed(self):
        namespace, sleeps = self.loop(receipts=AsyncMock(side_effect=asyncio.CancelledError()))
        with self.assertRaises(asyncio.CancelledError):
            await namespace["run_bridge"](object())
        namespace["api"].assert_not_awaited()
        namespace["deliver"].assert_not_awaited()
        self.assertEqual(sleeps, [])


if __name__ == "__main__":
    unittest.main()
