"""Main adapter with synthetic settings/stores and offline transports only."""
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from app.core.config import settings
from app.services import messaging


class MainMessagingAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.store = {}
        def save(path, data): self.store[path.stem] = deepcopy(data)
        self.patches = [patch.object(settings, "BOT_MESSAGING_ENABLED", True),
            patch.object(messaging, "read_store", lambda name: deepcopy(self.store.get("onboarding_" + name, {}))),
            patch.object(messaging, "save_json", save),
            patch("app.services.locale.resolve_user_locale", new=AsyncMock(return_value="en"))]
        for p in self.patches: p.start()
        self.message = SimpleNamespace(from_user=SimpleNamespace(id=810001, is_bot=False, language_code="en"),
            chat=SimpleNamespace(id=810001, type="private"), message_id=17, date=datetime.now(timezone.utc))

    async def asyncTearDown(self):
        for p in reversed(self.patches): p.stop()

    async def test_private_interaction_is_staged_before_http_and_acknowledged_without_body(self):
        async def api(method, path, payload):
            self.assertEqual(path, "/contact")
            staged = next(iter(self.store["onboarding_contacts"].values()))
            self.assertEqual(staged, payload)
            self.assertEqual(payload["locale"], "en")
            self.assertNotIn("text", payload)
            return {"accepted": True}
        with patch.object(messaging, "api", new=api): await messaging.contact(self.message)
        self.assertEqual(self.store["onboarding_contacts"], {})

    async def test_lost_contact_ack_keeps_exact_event_for_retry(self):
        with patch.object(messaging, "api", new=AsyncMock(return_value=None)):
            await messaging.contact(self.message)
        before = deepcopy(self.store["onboarding_contacts"])
        api = AsyncMock(return_value={"accepted": True})
        with patch.object(messaging, "api", new=api): await messaging.retry_contacts()
        self.assertEqual(api.call_args.args[2], next(iter(before.values())))
        self.assertEqual(self.store["onboarding_contacts"], {})

    async def test_group_foreign_actor_and_default_off_have_no_contact_side_effects(self):
        api = AsyncMock()
        with patch.object(messaging, "api", new=api):
            self.message.chat.type = "group"; await messaging.contact(self.message)
            self.message.chat.type = "private"; self.message.chat.id += 1; await messaging.contact(self.message)
            self.message.chat.id = self.message.from_user.id
            with patch.object(settings, "BOT_MESSAGING_ENABLED", False): await messaging.contact(self.message)
        api.assert_not_awaited(); self.assertEqual(self.store, {})

    async def test_branded_followup_keyboard_is_two_columns_and_yes_is_not_manager(self):
        for locale in ("ru", "en"):
            keyboard = messaging.keyboard({"step": "followup", "locale": locale, "enrollment_id": 17})
            self.assertEqual(len(keyboard.inline_keyboard[0]), 2)
            self.assertEqual([b.callback_data for b in keyboard.inline_keyboard[0]], ["onboard:yes:17", "onboard:manager:17"])


if __name__ == "__main__": unittest.main()
