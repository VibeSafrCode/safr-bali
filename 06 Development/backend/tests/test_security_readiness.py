"""Synthetic configuration, auth, readiness and bounded limiter regressions."""
import asyncio
import os
import threading
import unittest
from concurrent.futures import Future
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from app.core.config import Settings, settings
from app.core.security import InMemoryRateLimiter, rate_limit, require_admin_token, require_service_token
from app.db import session
from app.main import app


class ProductionConfigurationTests(unittest.TestCase):
    def configure(self, **overrides):
        values = dict(
            ENVIRONMENT="production", DEBUG=False, SQL_ECHO=False,
            DATABASE_URL="sqlite+pysqlite:///:memory:",
            SERVICE_API_TOKEN="synthetic-service-" + "s" * 32,
            ADMIN_API_TOKEN="synthetic-admin-" + "a" * 32,
            TELEGRAM_BOT_TOKEN="123456789:" + "b" * 35,
            MINI_APP_COOKIE_SECURE=True, WEB_COOKIE_SECURE=True,
            WEBSITE_URL="https://site.test", APPLICATION_URL="https://app.test",
            MINI_APP_ORIGINS="https://site.test,https://app.test",
        )
        values.update(overrides)
        with patch.dict(os.environ, {}, clear=True):
            return Settings(_env_file=None, **values)

    def test_safe_configuration_and_missing_secret(self):
        self.assertEqual(self.configure().ENVIRONMENT, "production")
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(ValidationError) as raised:
            Settings(_env_file=None, DATABASE_URL="sqlite://", ADMIN_API_TOKEN="DO-NOT-LOG-ME")
        self.assertNotIn("DO-NOT-LOG-ME", str(raised.exception))

    def test_invalid_secrets_fail_without_values_in_error(self):
        for token in ("", "   ", "example" * 8, "replace_me" * 6, "x" * 10):
            with self.subTest(token_length=len(token)), self.assertRaises(RuntimeError) as raised:
                self.configure(SERVICE_API_TOKEN=token)
            if token.strip():
                self.assertNotIn(token, str(raised.exception))
        with self.assertRaises(RuntimeError):
            self.configure(SERVICE_API_TOKEN="s" * 40, ADMIN_API_TOKEN="s" * 40)
        for token in ("", "your-telegram-bot-token"):
            with self.assertRaises(RuntimeError):
                self.configure(TELEGRAM_BOT_TOKEN=token)

    def test_unsafe_urls_cookies_debug_and_partial_oidc_fail(self):
        for override in (
            {"WEBSITE_URL": "http://site.test"},
            {"APPLICATION_URL": "https://user:password@app.test"},
            {"MINI_APP_ORIGINS": "*"},
            {"MINI_APP_ORIGINS": "https://app.test/path"},
            {"MINI_APP_COOKIE_SECURE": False}, {"WEB_COOKIE_SECURE": False},
            {"DEBUG": True}, {"SQL_ECHO": True},
            {"TELEGRAM_OIDC_CLIENT_ID": "synthetic"},
        ):
            with self.subTest(fields=list(override)), self.assertRaises(RuntimeError):
                self.configure(**override)


class SecurityReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_guards_fail_closed_for_empty_config_and_header(self):
        for name, guard in (("SERVICE_API_TOKEN", require_service_token), ("ADMIN_API_TOKEN", require_admin_token)):
            for expected in ("", "   "):
                with patch.object(settings, name, expected):
                    for supplied in ("", "   ", expected):
                        with self.assertRaises(HTTPException) as raised:
                            await guard(supplied)
                        self.assertEqual(raised.exception.status_code, 401)

    async def test_http_readiness_failure_then_recovery_and_independent_liveness(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            with patch("app.main.database_is_ready", AsyncMock(side_effect=[False, True])):
                failure = await client.get("/db/health")
                self.assertEqual(failure.status_code, 503)
                self.assertEqual(failure.json()["database"], "not_connected")
                self.assertEqual(failure.headers["cache-control"], "no-store")
                self.assertEqual((await client.get("/health")).status_code, 200)
                self.assertEqual((await client.get("/db/health")).status_code, 200)

    async def test_slow_probe_has_bounded_latency_and_one_worker_then_recovers(self):
        release = threading.Event()
        def blocked_probe():
            release.wait(timeout=2)
            return True
        with patch.object(session, "_probe_future", None), patch.object(session, "check_database_connection", side_effect=blocked_probe) as probe:
            try:
                results = await asyncio.gather(*[session.database_is_ready(.02) for _ in range(20)])
                self.assertEqual(results, [False] * 20)
                self.assertEqual(probe.call_count, 1)
                self.assertEqual(len(session._probe_future._done_callbacks), 0)
            finally:
                release.set()
                await asyncio.wrap_future(session._probe_future)
            self.assertTrue(await session.database_is_ready(.2))

    async def test_stalled_probe_timeout_and_cancellation_leave_no_callbacks(self):
        stalled = Future()
        with patch.object(session, "_probe_future", stalled), patch.object(session, "Thread") as worker:
            for _ in range(3):
                results = await asyncio.gather(*[session.database_is_ready(.005) for _ in range(50)])
                self.assertEqual(results, [False] * 50)
                self.assertEqual(len(stalled._done_callbacks), 0)
            requests = [asyncio.create_task(session.database_is_ready(1)) for _ in range(20)]
            await asyncio.sleep(0)
            for request in requests:
                request.cancel()
            results = await asyncio.gather(*requests, return_exceptions=True)
            self.assertTrue(all(isinstance(result, asyncio.CancelledError) for result in results))
            self.assertFalse(stalled.cancelled())
            self.assertEqual(len(stalled._done_callbacks), 0)
            worker.assert_not_called()
            stalled.set_result(True)

    async def test_untrusted_cloudflare_header_cannot_select_budget(self):
        request = Request({"type": "http", "client": ("192.0.2.10", 1234), "headers": [(b"cf-connecting-ip", b"198.51.100.7")]})
        with patch("app.core.security.rate_limiter.check", return_value=True) as check:
            await rate_limit(request)
        self.assertEqual(check.call_args.kwargs["key"], "192.0.2.10")

    def test_limiter_bounds_memory_without_resetting_active_budget(self):
        limiter = InMemoryRateLimiter(max_keys=2)
        with patch("app.core.security.time.monotonic", return_value=0):
            self.assertTrue(limiter.check("a", 1))
            self.assertTrue(limiter.check("b", 1))
            self.assertFalse(limiter.check("c", 1))
            self.assertFalse(limiter.check("a", 1))
            self.assertEqual(len(limiter.requests), 2)
        with patch("app.core.security.time.monotonic", return_value=61):
            self.assertTrue(limiter.check("c", 1))
            self.assertEqual(list(limiter.requests), ["c"])


class ReadinessLoopLifecycleTests(unittest.TestCase):
    def test_stalled_probe_does_not_retain_closed_event_loops(self):
        stalled = Future()
        with patch.object(session, "_probe_future", stalled), patch.object(session, "Thread") as worker:
            for _ in range(5):
                self.assertFalse(asyncio.run(session.database_is_ready(.001)))
                self.assertEqual(len(stalled._done_callbacks), 0)
            worker.assert_not_called()
            self.assertFalse(stalled.cancelled())
            stalled.set_result(False)
        with patch.object(session, "_probe_future", stalled), patch.object(
            session, "check_database_connection", return_value=True,
        ) as probe:
            self.assertTrue(asyncio.run(session.database_is_ready(.2)))
            self.assertEqual(probe.call_count, 1)
            self.assertIsNot(session._probe_future, stalled)
