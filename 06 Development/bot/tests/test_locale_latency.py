import asyncio
import time
import unittest
from collections import OrderedDict
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.handlers.language import set_language
from app.services import locale


class LocaleCacheTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        cache_patch = patch.object(locale, "_locale_cache", OrderedDict())
        cache_patch.start()
        self.addCleanup(cache_patch.stop)

    async def test_cold_lookup_deadline_cancels_work_and_returns_telegram_fallback(self):
        self.assertLessEqual(locale.LOCALE_LOOKUP_TIMEOUT_SECONDS, 1.0)
        cancelled = asyncio.Event()

        async def unavailable(_telegram_id):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        lookup = AsyncMock(side_effect=unavailable)
        with (
            patch.object(locale, "get_user_locale", lookup),
            patch.object(locale, "LOCALE_LOOKUP_TIMEOUT_SECONDS", 0.02),
        ):
            started = time.monotonic()
            self.assertEqual(await locale.resolve_user_locale(1, "en-GB"), "en")
            self.assertLess(time.monotonic() - started, 0.5)
            self.assertTrue(cancelled.is_set())
            # A burst during the outage uses each update's fallback immediately.
            self.assertEqual(await locale.resolve_user_locale(1, "ru"), "ru")
        lookup.assert_awaited_once_with(1)

    async def test_warm_saved_locale_is_cached_per_user_until_ttl_expires(self):
        lookup = AsyncMock(side_effect=["en", "ru", "ru"])
        with (
            patch.object(locale, "get_user_locale", lookup),
            patch.object(locale, "monotonic", return_value=100.0) as now,
        ):
            self.assertEqual(await locale.resolve_user_locale(1, "ru"), "en")
            self.assertEqual(await locale.resolve_user_locale(2, "en"), "ru")
            now.return_value = 100.0 + locale.LOCALE_CACHE_TTL_SECONDS - 0.1
            self.assertEqual(await locale.resolve_user_locale(1, "ru"), "en")
            self.assertEqual(await locale.resolve_user_locale(2, "en"), "ru")
            self.assertEqual(lookup.await_count, 2)
            now.return_value = 100.0 + locale.LOCALE_CACHE_TTL_SECONDS
            self.assertEqual(await locale.resolve_user_locale(1, "en"), "ru")
        self.assertEqual(lookup.await_count, 3)

    async def test_missing_locale_retries_after_short_window_then_caches_recovery(self):
        self.assertLess(locale.LOCALE_FAILURE_RETRY_SECONDS, locale.LOCALE_CACHE_TTL_SECONDS)
        lookup = AsyncMock(side_effect=[None, "en"])
        with (
            patch.object(locale, "get_user_locale", lookup),
            patch.object(locale, "monotonic", return_value=100.0) as now,
        ):
            self.assertEqual(await locale.resolve_user_locale(1, "ru"), "ru")
            now.return_value += locale.LOCALE_FAILURE_RETRY_SECONDS - 0.1
            self.assertEqual(await locale.resolve_user_locale(1, "en-US"), "en")
            lookup.assert_awaited_once_with(1)
            now.return_value = 100.0 + locale.LOCALE_FAILURE_RETRY_SECONDS
            self.assertEqual(await locale.resolve_user_locale(1, "ru"), "en")
            now.return_value += locale.LOCALE_FAILURE_RETRY_SECONDS
            self.assertEqual(await locale.resolve_user_locale(1, "ru"), "en")
        self.assertEqual(lookup.await_count, 2)

    async def test_lookup_exception_uses_fallback_without_normal_ttl(self):
        lookup = AsyncMock(side_effect=[RuntimeError("fixture unavailable"), "ru"])
        with (
            patch.object(locale, "get_user_locale", lookup),
            patch.object(locale, "monotonic", return_value=100.0) as now,
        ):
            self.assertEqual(await locale.resolve_user_locale(1, "en"), "en")
            now.return_value += locale.LOCALE_FAILURE_RETRY_SECONDS
            self.assertEqual(await locale.resolve_user_locale(1, "en"), "ru")
        self.assertEqual(lookup.await_count, 2)

    async def test_cache_evicts_least_recently_used_user_at_size_limit(self):
        with patch.object(locale, "LOCALE_CACHE_MAX_ENTRIES", 3):
            locale.cache_user_locale(1, "en")
            locale.cache_user_locale(2, "ru")
            locale.cache_user_locale(3, "ru")
            with patch.object(locale, "get_user_locale", AsyncMock()) as lookup:
                self.assertEqual(await locale.resolve_user_locale(1, "ru"), "en")
                lookup.assert_not_awaited()
            locale.cache_user_locale(4, "en")
            self.assertEqual(len(locale._locale_cache), 3)
            self.assertNotIn(2, locale._locale_cache)
            self.assertIn(1, locale._locale_cache)

    async def test_successful_language_change_updates_only_that_users_cache(self):
        locale.cache_user_locale(1, "ru")
        locale.cache_user_locale(2, "ru")
        callback = SimpleNamespace(
            data="locale:set:en",
            from_user=SimpleNamespace(id=1),
            answer=AsyncMock(),
            message=SimpleNamespace(answer=AsyncMock()),
        )
        with (
            patch("app.handlers.language.update_user_locale", AsyncMock(return_value=True)) as update,
            patch.object(locale, "get_user_locale", AsyncMock()) as lookup,
        ):
            await set_language(callback, "ru")
            self.assertEqual(await locale.resolve_user_locale(1, "ru"), "en")
            self.assertEqual(await locale.resolve_user_locale(2, "en"), "ru")
        update.assert_awaited_once_with(1, "en")
        lookup.assert_not_awaited()

    async def test_failed_language_change_preserves_confirmed_cache(self):
        locale.cache_user_locale(1, "ru")
        callback = SimpleNamespace(
            data="locale:set:en",
            from_user=SimpleNamespace(id=1),
            answer=AsyncMock(),
            message=SimpleNamespace(answer=AsyncMock()),
        )
        with (
            patch("app.handlers.language.update_user_locale", AsyncMock(return_value=False)),
            patch.object(locale, "get_user_locale", AsyncMock()) as lookup,
        ):
            await set_language(callback, "ru")
            self.assertEqual(await locale.resolve_user_locale(1, "en"), "ru")
        lookup.assert_not_awaited()

    async def test_in_flight_lookup_cannot_overwrite_successfully_saved_language(self):
        started = asyncio.Event()
        release = asyncio.Event()

        async def older_saved_locale(_telegram_id):
            started.set()
            await release.wait()
            return "ru"

        with patch.object(locale, "get_user_locale", AsyncMock(side_effect=older_saved_locale)):
            task = asyncio.create_task(locale.resolve_user_locale(1, "ru"))
            try:
                await started.wait()
                locale.cache_user_locale(1, "en")
                release.set()
                self.assertEqual(await task, "en")
                self.assertEqual(await locale.resolve_user_locale(1, "ru"), "en")
            finally:
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

    async def test_cancelled_update_is_not_swallowed_or_cached(self):
        with patch.object(locale, "get_user_locale", AsyncMock(side_effect=asyncio.CancelledError)):
            with self.assertRaises(asyncio.CancelledError):
                await locale.resolve_user_locale(1, "en")
        self.assertNotIn(1, locale._locale_cache)


if __name__ == "__main__":
    unittest.main()
