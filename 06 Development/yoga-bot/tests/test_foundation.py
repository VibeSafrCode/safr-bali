"""Critical offline contracts: synthetic identities and transport, no Telegram I/O."""
import asyncio
from dataclasses import replace
import hashlib
import json
import logging
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from aiogram import Bot
from aiogram.client.session.base import BaseSession
from aiogram.types import Message, Update, User, WebhookInfo
from aiogram.exceptions import TelegramConflictError, TelegramNetworkError, TelegramRetryAfter, TelegramUnauthorizedError
from aiogram.methods import GetUpdates

from yoga_bot.catalog import GATE_KEYS, load_catalog
from yoga_bot.config import EXPECTED_USERNAME, RuntimeConfigError, Settings, site_origin, start_payload
from yoga_bot.menu import Menus
from yoga_bot.runtime import RuntimeLock, create_dispatcher, run, verify_identity
from yoga_bot.state import Preferences
from yoga_bot.dispatcher import IsolatedDispatcher, RuntimeTransportError

DUMMY_TOKEN = "123456:" + "A" * 35
SHARED = Path(__file__).resolve().parents[2] / "shared/content"


def settings(**changes):
    value = Settings.from_env({
        "YOGA_BOT_TOKEN": DUMMY_TOKEN,
        "YOGA_MVP_MODE": "service_links",
        "YOGA_SITE_ORIGIN": "https://yoga.example.org",
        "YOGA_MANAGER_BOT_USERNAME": "Example_safr_bot",
        "YOGA_SHARED_CONTENT_ROOT": str(SHARED),
    })
    return replace(value, **changes)


class CatalogFixture:
    def __init__(self, root):
        self.root = root
        self.registry = {"schemaVersion": 1, "records": [
            {"contentId": "visa", "kind": "visa", "published": {"routes": {
                "ru": "/bali/visas/visa/", "en": "/en/bali/visas/visa/"}}},
        ]}
        self.i18n = {"schemaVersion": 1, "entries": {
            "catalog.bali.visas.visa.name": {"ru": "Виза", "en": "Visa"}}}
        copies = {}
        for locale, title in (("ru", "Продление"), ("en", "Extension")):
            body = "Synthetic approved test body " + locale
            meta = json.dumps({"h1": title}, ensure_ascii=False)
            copy = {}
            for field, value, suffix in (("body", body, "md"), ("metadata", meta, "meta.json")):
                name = "registry-copy/extension_" + locale + "." + suffix
                self.write(name, value.encode())
                copy[field + "File"] = name
                copy[field + "Sha256"] = hashlib.sha256(value.encode()).hexdigest()
            copies[locale] = copy
        revision = "sha256:" + copies["ru"]["bodySha256"]
        copies["ru"].update(status="owner_approved_semantics", approvalRevision=revision)
        copies["en"].update(status="translated", sourceRevision=revision, complete=True, qa="passed")
        candidate = {"route": "/bali/visas/visa/extension/", "revision": revision,
                     "ru": copies["ru"], "translations": {"en": copies["en"]}}
        self.registry["records"].append({"contentId": "extension", "kind": "extension", "candidate": candidate})
        self.build = {"schemaVersion": 1, "publicationGates": {key: True for key in GATE_KEYS}, "records": [
            {"contentId": "extension", "sourceRevision": revision,
             # The raw Founder source pin can differ from the rendered body pin.
             "approvedSourceRevision": "sha256:" + "0" * 64,
             "publication": {"indexable": True, "gateStatus": "PASS_ACTUAL_RENDER_QA"},
             "locales": {locale: {**copies[locale], "route": ("/en" if locale == "en" else "") + candidate["route"]}
                         for locale in ("ru", "en")}}
        ]}
        self.save()

    @property
    def candidate(self):
        return self.registry["records"][1]["candidate"]

    @property
    def row(self):
        return self.build["records"][0]

    def write(self, name, raw):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)

    def save(self):
        for name, data in (("service-registry.v1.json", self.registry),
                           ("generated/i18n/public.v1.json", self.i18n),
                           ("registry-test-build.v1.json", self.build)):
            self.write(name, json.dumps(data, ensure_ascii=False).encode())


class ConfigTests(unittest.TestCase):
    def env(self):
        return {"YOGA_BOT_TOKEN": DUMMY_TOKEN, "YOGA_MVP_MODE": "service_links",
                "YOGA_SITE_ORIGIN": "https://yoga.example.org", "YOGA_MANAGER_BOT_USERNAME": "Example_safr_bot",
                "YOGA_SHARED_CONTENT_ROOT": str(SHARED)}

    def test_token_is_separate_from_main_and_never_repr(self):
        env = self.env()
        env.pop("YOGA_BOT_TOKEN")
        env["BOT_TOKEN"] = DUMMY_TOKEN
        with self.assertRaisesRegex(RuntimeConfigError, "missing_or_invalid_yoga_token"):
            Settings.from_env(env)
        self.assertNotIn(DUMMY_TOKEN, repr(settings()))

    def test_mvp_requires_explicit_supported_choice(self):
        for value in ("", "accounts", "full", "SERVICE_LINKS"):
            with self.subTest(value=value):
                env = self.env()
                env["YOGA_MVP_MODE"] = value
                with self.assertRaisesRegex(RuntimeConfigError, "explicit_mvp_choice_required"):
                    Settings.from_env(env)

    def test_manager_username_cannot_inject_url_or_loop(self):
        for value in ("@Example_safr_bot", "x/bot", "x?start=bot", "Example_bot#x", EXPECTED_USERNAME):
            with self.subTest(value=value):
                env = self.env()
                env["YOGA_MANAGER_BOT_USERNAME"] = value
                with self.assertRaises(RuntimeConfigError):
                    Settings.from_env(env)

    def test_welcome_mode_does_not_use_manager(self):
        env = self.env()
        env.update(YOGA_MVP_MODE="welcome_links", YOGA_MANAGER_BOT_USERNAME="ignored!invalid")
        self.assertIsNone(Settings.from_env(env).manager_username)

    def test_site_origin_rejects_credentials_unsafe_paths_hosts(self):
        invalid = ("http://yoga.example.org", "https://user:secret@yoga.example.org", "https://yoga.example.org/x/",
                   "https://yoga.example.org/?start=secret", "https://yoga.example.org/#x", "https://127.0.0.1",
                   "https://example.local", "https://x.-example.org", "https://x.example-.org", "https://x..org",
                   "https://x.example.org:444", "https://api.example.org", "https://app.example.org",
                   "https://x.example.org\\path", "https://x.example.org\n")
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaisesRegex(RuntimeConfigError, "^invalid_site_origin$"):
                    site_origin(value)
        self.assertEqual(site_origin("https://YOGA.example.org:443/"), "https://yoga.example.org")

    def test_start_syntax_has_no_attribution_side_effect(self):
        self.assertEqual(start_payload("ref_example_123"), "ref_example_123")
        self.assertEqual(start_payload("A" * 64), "A" * 64)
        self.assertIsNone(start_payload(""))
        for value in ("A" * 65, "../admin", "ref?brand=admin", "ref\nsecret", "ру"):
            with self.assertRaisesRegex(RuntimeConfigError, "^invalid_start_payload$"):
                start_payload(value)

    def test_absolute_paths_required(self):
        for key, value in (("YOGA_SHARED_CONTENT_ROOT", "relative"), ("YOGA_RUNTIME_LOCK", "instance.lock"),
                           ("YOGA_RUNTIME_LOCK", "/run/safrway/main.lock")):
            env = self.env()
            env[key] = value
            with self.assertRaises(RuntimeConfigError):
                Settings.from_env(env)


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.fixture = CatalogFixture(Path(self.tmp.name))

    def links(self):
        self.fixture.save()
        return load_catalog(self.fixture.root)

    def test_canonical_live_baseline_contains_new_service_routes(self):
        rows = {row.content_id: row for row in load_catalog(SHARED)}
        for cid in ("c1", "voa", "d1", "d2", "d12", "d12_extension", "investor", "e33g_next_term",
                    "e33g_conversion", "employment_review"):
            self.assertIn(cid, rows)
        self.assertEqual(rows["d12_extension"].en_route, "/en/bali/visas/d12/extension/")

    def test_both_languages_read_pinned_title_and_rendered_revision(self):
        rows = {row.content_id: row for row in self.links()}
        self.assertEqual(rows["extension"].en_label, "Extension")
        self.assertEqual(rows["extension"].ru_label, "Продление")
        self.assertNotIn("body", rows["extension"].__dict__)

    def test_missing_or_failed_actual_gate_cannot_publish_candidate(self):
        for value in (None, "", "PENDING_ACTUAL_RENDER_QA"):
            self.fixture.row["publication"]["gateStatus"] = value
            self.assertEqual([s.content_id for s in self.links()], ["visa"])

    def test_false_build_gate_cannot_publish_candidate(self):
        self.fixture.build["publicationGates"]["render"] = False
        self.assertEqual([s.content_id for s in self.links()], ["visa"])

    def test_draft_candidate_not_in_menu(self):
        self.fixture.row["publication"]["indexable"] = False
        self.assertEqual([s.content_id for s in self.links()], ["visa"])

    def test_superseded_projection_does_not_shadow_current_record(self):
        self.fixture.row["sourceRevision"] = "sha256:" + "a" * 64
        self.assertEqual([s.content_id for s in self.links()], ["visa"])

    def test_incomplete_translation_fails_closed(self):
        self.fixture.candidate["translations"]["en"]["complete"] = False
        with self.assertRaisesRegex(RuntimeConfigError, "translation_approval_drift"):
            self.links()

    def test_russian_approval_drift_fails_closed(self):
        self.fixture.candidate["ru"]["approvalRevision"] = "sha256:" + "b" * 64
        with self.assertRaisesRegex(RuntimeConfigError, "source_approval_drift"):
            self.links()

    def test_changed_content_bytes_fail_closed(self):
        self.fixture.write(self.fixture.candidate["ru"]["bodyFile"], b"unexpected change")
        with self.assertRaisesRegex(RuntimeConfigError, "content_pin_drift"):
            self.links()

    def test_projection_hash_or_route_drift_fails_closed(self):
        self.fixture.row["locales"]["en"]["bodySha256"] = "c" * 64
        with self.assertRaisesRegex(RuntimeConfigError, "projection_pin_drift"):
            self.links()
        self.fixture.row["locales"]["en"]["bodySha256"] = self.fixture.candidate["translations"]["en"]["bodySha256"]
        self.fixture.row["locales"]["en"]["route"] = "/en/bali/visas/unrelated/"
        with self.assertRaisesRegex(RuntimeConfigError, "projection_route_drift"):
            self.links()

    def test_path_escape_and_symlink_escape_fail_closed(self):
        self.fixture.candidate["ru"]["bodyFile"] = "registry-copy/../../secret"
        with self.assertRaisesRegex(RuntimeConfigError, "invalid_content_pin"):
            self.links()
        self.fixture.candidate["ru"]["bodyFile"] = "registry-copy/outside.md"
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / "synthetic.txt"
            target.write_text("synthetic")
            (self.fixture.root / "registry-copy/outside.md").symlink_to(target)
            with self.assertRaisesRegex(RuntimeConfigError, "invalid_content_pin"):
                self.links()

    def test_duplicates_and_external_routes_rejected(self):
        self.fixture.registry["records"].append(self.fixture.registry["records"][0])
        with self.assertRaisesRegex(RuntimeConfigError, "invalid_registry_identity"):
            self.links()
        self.fixture.registry["records"].pop()
        self.fixture.registry["records"][0]["published"]["routes"]["ru"] = "https://other.example.org/"
        with self.assertRaisesRegex(RuntimeConfigError, "invalid_canonical_route"):
            self.links()


class MenuStateLockTests(unittest.TestCase):
    def test_manager_handoff_never_carries_start_payload(self):
        menu = Menus(settings(), load_catalog(SHARED))
        reply = menu.start("ru", "ref_private_value")
        urls = [b.url for row in reply.buttons for b in row if b.url]
        self.assertIn("https://t.me/Example_safr_bot", urls)
        self.assertFalse(any("start=" in u or "ref_private_value" in u for u in urls))
        self.assertIn("пока не подключены", reply.text)

    def test_page_bounds_and_english_links(self):
        menu = Menus(settings(), load_catalog(SHARED))
        links = [b for row in menu.page("en", 0).buttons for b in row if b.url]
        self.assertEqual(len(links), 8)
        self.assertTrue(all(b.url.startswith("https://yoga.example.org/en/") for b in links))
        self.assertEqual(menu.page("en", 999), menu.home("en"))
        second = menu.page("en", 1)
        self.assertIn("Page 2/", second.text)
        self.assertIn("services:0", [b.callback for row in second.buttons for b in row])

    def test_welcome_mode_has_only_site_and_language_choices(self):
        menu = Menus(settings(mode="welcome_links", manager_username=None), load_catalog(SHARED))
        self.assertEqual(menu.page("ru", 0), menu.home("ru"))
        self.assertEqual(len(menu.home("en").buttons), 2)
        self.assertIn("website", menu.home("en", "help").text)
        self.assertIn("on the website", menu.home("en", "not_connected").text)

    def test_state_is_bounded_expires_and_throttles(self):
        now = [100.0]
        prefs = Preferences(max_entries=2, ttl=10, clock=lambda: now[0])
        self.assertTrue(prefs.allow("a", "ru"))
        self.assertFalse(prefs.allow("a", "ru"))
        now[0] += 0.5
        self.assertTrue(prefs.allow("a", "ru"))
        prefs.set_locale("a", "en")
        self.assertEqual(prefs.locale("a", "ru"), "en")
        prefs.set_locale("b", "en")
        prefs.set_locale("c", "en")
        self.assertEqual(len(prefs.rows), 2)
        self.assertEqual(prefs.locale("a", "ru"), "ru")
        now[0] += 11
        self.assertEqual(prefs.locale("b", "ru"), "ru")

    def test_lock_rejects_duplicate_process_and_releases(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "instance.lock"
            with RuntimeLock(path):
                with self.assertRaisesRegex(RuntimeConfigError, "yoga_runtime_lock_unavailable"):
                    with RuntimeLock(path):
                        self.fail("second lock unexpectedly acquired")
            with RuntimeLock(path):
                pass

    def test_lock_rejects_world_readable_file_or_symlink(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "instance.lock"
            path.write_text("")
            path.chmod(0o644)
            with self.assertRaises(RuntimeConfigError):
                with RuntimeLock(path):
                    pass
            path.unlink()
            target = Path(root) / "other.lock"
            target.touch(mode=0o600)
            path.symlink_to(target)
            with self.assertRaises(RuntimeConfigError):
                with RuntimeLock(path):
                    pass


class OfflineSession(BaseSession):
    """No HTTP implementation: every unexpected Telegram method raises."""
    def __init__(self, username=EXPECTED_USERNAME, webhook=""):
        super().__init__()
        self.username, self.webhook = username, webhook
        self.calls, self.closed = [], False
        self.me = User(id=123456, is_bot=True, first_name="Synthetic Yoga", username=username)

    async def close(self):
        self.closed = True

    async def make_request(self, bot, method, timeout=None):
        name = type(method).__name__
        self.calls.append(method)
        if name == "GetMe":
            return self.me
        if name == "GetWebhookInfo":
            return WebhookInfo(url=self.webhook, has_custom_certificate=False, pending_update_count=0)
        if name == "AnswerCallbackQuery":
            return True
        if name in {"SendMessage", "EditMessageText"}:
            return Message(message_id=100, date=1, chat={"id": method.chat_id, "type": "private"},
                           from_user=self.me, text=method.text)
        raise AssertionError("unexpected_transport_method: " + name)

    async def stream_content(self, url, headers=None, timeout=30, chunk_size=65536, raise_for_status=True):
        raise AssertionError("network_is_not_available_in_this_test")
        yield b""  # Implements the abstract asynchronous generator contract.


class DispatcherTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.session = OfflineSession()
        self.bot = Bot(DUMMY_TOKEN, session=self.session)
        self.now = [100.0]
        self.prefs = Preferences(clock=lambda: self.now[0])
        self.dp = create_dispatcher(settings(), load_catalog(SHARED), preferences=self.prefs)
        self.counter = 0

    async def asyncTearDown(self):
        await self.bot.session.close()

    async def message(self, text, language="ru", chat_type="private", sender=101, chat=101):
        self.counter += 1
        data = {"update_id": self.counter, "message": {"message_id": self.counter, "date": 1,
                "chat": {"id": chat, "type": chat_type}, "from": {"id": sender, "is_bot": False,
                "first_name": "Synthetic user", "language_code": language}, "text": text}}
        await self.dp.feed_update(self.bot, Update.model_validate(data))

    async def callback(self, data, sender=101, inaccessible=False):
        self.counter += 1
        message = {"message_id": 100, "date": 0 if inaccessible else 1, "chat": {"id": 101, "type": "private"}}
        if not inaccessible:
            message.update({"from": self.session.me.model_dump(), "text": "Synthetic menu"})
        update = {"update_id": self.counter, "callback_query": {"id": str(self.counter), "chat_instance": "synthetic",
                  "from": {"id": sender, "is_bot": False, "first_name": "Synthetic user"}, "message": message, "data": data}}
        await self.dp.feed_update(self.bot, Update.model_validate(update))

    def sends(self):
        return [m for m in self.session.calls if type(m).__name__ == "SendMessage"]

    async def test_ru_en_start_dispatches_private_localized_menu(self):
        await self.message("/start", "ru")
        await self.message("/start", "de", sender=102, chat=102)
        self.assertIn("Выберите", self.sends()[0].text)
        self.assertIn("Choose", self.sends()[1].text)
        self.assertIn("/en/", self.sends()[1].reply_markup.inline_keyboard[0][0].url)

    async def test_group_mismatched_chat_foreign_command_get_no_response(self):
        await self.message("/start", chat_type="group", chat=-1)
        await self.message("/start", sender=102)
        await self.message("/start@Different_bot")
        self.assertFalse(self.session.calls)

    async def test_start_payload_is_not_echoed_or_forwarded(self):
        await self.message("/start ref_synthetic_private")
        reply = self.sends()[0]
        self.assertIn("пока не подключены", reply.text)
        self.assertNotIn("ref_synthetic_private", str(reply))
        self.assertTrue(all(type(m).__name__ == "SendMessage" for m in self.session.calls))

    async def test_invalid_and_oversized_start_params_are_safe(self):
        await self.message("/start ../admin")
        self.assertIn("не принят", self.sends()[0].text)
        self.now[0] += 1
        await self.message("/start " + "x" * 600)
        self.assertIn("не принят", self.sends()[1].text)

    async def test_services_dispatch_uses_approved_english_urls(self):
        await self.message("/services", "en")
        reply = self.sends()[0]
        urls = [b.url for row in reply.reply_markup.inline_keyboard for b in row if b.url]
        self.assertEqual(len(urls), 8)
        self.assertTrue(all(u.startswith("https://yoga.example.org/en/") for u in urls))

    async def test_language_callback_changes_subsequent_menu(self):
        await self.callback("lang:en")
        self.now[0] += 1
        await self.message("/services", "ru")
        self.assertIn("SAFRWAY service pages", self.sends()[0].text)
        self.assertEqual([type(m).__name__ for m in self.session.calls],
                         ["AnswerCallbackQuery", "EditMessageText", "SendMessage"])

    async def test_foreign_and_inaccessible_callbacks_get_no_transport_call(self):
        await self.callback("lang:en", sender=102)
        await self.callback("home", inaccessible=True)
        self.assertFalse(self.session.calls)

    async def test_callback_burst_including_invalid_data_is_throttled(self):
        for _ in range(15):
            await self.callback("unknown:synthetic")
        self.assertEqual([type(m).__name__ for m in self.session.calls], ["AnswerCallbackQuery"])
        self.now[0] += 0.5
        await self.callback("home")
        self.assertEqual(len(self.session.calls), 3)

    async def test_quick_human_tap_is_acknowledged_without_extra_edit(self):
        await self.message("/start")
        self.now[0] += 0.25
        await self.callback("lang:en")
        self.assertEqual([type(m).__name__ for m in self.session.calls], ["SendMessage", "AnswerCallbackQuery"])
        self.assertIn("Подождите", self.session.calls[-1].text)
        self.now[0] += 0.5
        await self.callback("lang:en")
        self.assertEqual(type(self.session.calls[-1]).__name__, "EditMessageText")
        self.assertIn("Choose", self.session.calls[-1].text)

    async def test_plain_message_is_not_forwarded_to_manager(self):
        await self.message("Synthetic customer inquiry")
        self.assertIn("не передано", self.sends()[0].text)
        self.assertNotIn("Synthetic customer inquiry", self.sends()[0].text)
        self.assertEqual(self.sends()[0].chat_id, 101)

    async def test_accounts_points_and_referrals_do_not_claim_connection(self):
        for command in ("/account", "/points", "/referrals"):
            await self.message(command)
            self.now[0] += 1
        self.assertIn("ещё не подключены", self.sends()[0].text)
        self.assertIn("ещё не подключены", self.sends()[1].text)
        self.assertIn("пока не подключены", self.sends()[2].text)

    async def test_handler_error_logs_only_fixed_code(self):
        sentinel = "synthetic_secret_and_message"
        with patch.object(self.session, "make_request", side_effect=RuntimeError(sentinel)):
            with self.assertLogs("yoga_runtime", logging.WARNING) as captured:
                await self.message("/start")
        self.assertIn("handler_failed", captured.output[0])
        self.assertNotIn(sentinel, "".join(captured.output))


class StartupTests(unittest.IsolatedAsyncioTestCase):
    async def test_polling_owner_conflict_and_revoked_token_stop_without_retry(self):
        for exception, code in ((TelegramConflictError, "telegram_polling_owner_conflict"),
                                (TelegramUnauthorizedError, "telegram_authorization_failed")):
            session = OfflineSession()
            bot = Bot(DUMMY_TOKEN, session=session)
            with patch.object(session, "make_request", new=AsyncMock(side_effect=exception(
                    method=GetUpdates(), message="synthetic_secret_exception"))) as transport:
                stream = IsolatedDispatcher._listen_updates(bot, allowed_updates=["message", "callback_query"])
                with self.assertRaisesRegex(RuntimeConfigError, "^" + code + "$"):
                    await anext(stream)
                self.assertEqual(transport.await_count, 1)
            await session.close()

    async def test_network_retry_is_bounded_and_no_exception_contents_logged(self):
        session = OfflineSession()
        bot = Bot(DUMMY_TOKEN, session=session)
        error = TelegramNetworkError(method=GetUpdates(), message="synthetic_secret_exception")
        with patch.object(session, "make_request", new=AsyncMock(side_effect=error)) as transport:
            with patch("yoga_bot.dispatcher.Backoff.asleep", new=AsyncMock()):
                with self.assertLogs("yoga_runtime", logging.WARNING) as captured:
                    with self.assertRaisesRegex(RuntimeTransportError, "^telegram_transport_unavailable$"):
                        await anext(IsolatedDispatcher._listen_updates(bot))
        self.assertEqual(transport.await_count, 8)
        self.assertNotIn("synthetic_secret_exception", "".join(captured.output))
        await session.close()

    async def test_polling_keeps_ack_offset_and_allowed_update_scope(self):
        session = OfflineSession()
        bot = Bot(DUMMY_TOKEN, session=session)
        offsets = []

        async def transport(bot, method, timeout=None):
            offsets.append(method.offset)
            self.assertEqual(method.allowed_updates, ["message", "callback_query"])
            return [Update(update_id=200 + len(offsets))]

        with patch.object(session, "make_request", side_effect=transport):
            stream = IsolatedDispatcher._listen_updates(bot, allowed_updates=["message", "callback_query"])
            self.assertEqual((await anext(stream)).update_id, 201)
            self.assertEqual((await anext(stream)).update_id, 202)
            self.assertEqual(offsets, [None, 202])
            await stream.aclose()
        await session.close()

    async def test_large_retry_requires_review_without_rapid_resend(self):
        session = OfflineSession()
        bot = Bot(DUMMY_TOKEN, session=session)
        error = TelegramRetryAfter(method=GetUpdates(), message="synthetic", retry_after=120)
        with patch.object(session, "make_request", new=AsyncMock(side_effect=error)) as transport:
            with self.assertRaisesRegex(RuntimeConfigError, "^telegram_retry_requires_review$"):
                await anext(IsolatedDispatcher._listen_updates(bot))
            self.assertEqual(transport.await_count, 1)
        await session.close()

    async def test_identity_mismatch_or_webhook_owner_prevents_start(self):
        for username, webhook, code in (("Different_bot", "", "unexpected_bot_identity"),
                                        (EXPECTED_USERNAME, "https://synthetic.example.org/hook", "webhook_owner_requires_review")):
            session = OfflineSession(username, webhook)
            bot = Bot(DUMMY_TOKEN, session=session)
            try:
                with self.assertRaisesRegex(RuntimeConfigError, code):
                    await verify_identity(bot)
                self.assertNotIn("DeleteWebhook", [type(m).__name__ for m in session.calls])
            finally:
                await session.close()

    async def test_startup_failure_closes_own_session_and_releases_lock(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "instance.lock"
            session = OfflineSession("Different_bot")
            with self.assertRaisesRegex(RuntimeConfigError, "unexpected_bot_identity"):
                await run(settings(lock_file=path), bot_factory=lambda _: Bot(DUMMY_TOKEN, session=session))
            self.assertTrue(session.closed)
            with RuntimeLock(path):
                pass


if __name__ == "__main__":
    unittest.main()
