"""Actual offline dispatcher + exact canonical Main content, no Telegram I/O."""
import json
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from aiogram.types import Update

from tests import test_shared_intake as intake_tests
from tests.test_foundation import SHARED
from tests.test_shared_intake import config, incoming
from yoga_bot.api_client import ChannelClient
from yoga_bot.catalog import load_catalog
from yoga_bot.menu import Menus
from yoga_bot.runtime import create_dispatcher
from yoga_bot.visas import CARDS, renderer, visa_menu


class InlineVisaTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await intake_tests.RuntimeIntakeTests.asyncSetUp(self)
        self.core = renderer()
        self.client.pricing = AsyncMock(return_value=None)
        self.dp = create_dispatcher(config(state_directory=self.root), load_catalog(SHARED),
            client=self.client, intake_state=self.state, visa_core=self.core)

    async def asyncTearDown(self):
        await intake_tests.RuntimeIntakeTests.asyncTearDown(self)

    async def callback(self, data, actor=101):
        # Reset only the synthetic UI throttle, not the intake state.
        from yoga_bot.state import Preferences
        self.dp = create_dispatcher(config(state_directory=self.root), load_catalog(SHARED),
            preferences=Preferences(), client=self.client, intake_state=self.state, visa_core=self.core)
        return await self.dp._process_update(self.bot, Update.model_validate({"update_id":600,"callback_query":{
            "id":"synthetic","chat_instance":"synthetic","data":data,
            "from":{"id":actor,"is_bot":False,"first_name":"Synthetic","language_code":"en"},
            "message":{"message_id":1,"date":1,"chat":{"id":101,"type":"private"},
                "from":self.session.me.model_dump(),"text":"Synthetic menu"}}}))

    async def test_services_opens_inline_callbacks_not_url_redirects(self):
        for locale in ("ru", "en"):
            menu = Menus(config(), load_catalog(SHARED)).categories(locale)
            for button, callback in zip(menu.buttons[1], ("visas:bali", "visas:thailand")):
                self.assertEqual(button.callback, callback)
                self.assertIsNone(button.url)
        await self.callback("visas:bali")
        edited = [x for x in self.session.calls if type(x).__name__ == "EditMessageText"][-1]
        self.assertEqual(edited.text, self.core.text("text.visaIntro", locale="en"))
        rows = edited.reply_markup.inline_keyboard
        self.assertEqual(rows[0][0].callback_data, "categories")
        self.assertEqual(rows[-1][0].callback_data, "home")
        self.assertTrue(all(len(row) <= 2 for row in rows))
        self.assertEqual([[b.callback_data for b in row] for row in rows[1:5]],
            [["visa:e33g","visa:d12"],["visa:d1d2","visa:c1"],["visa:voa","visa:other"],["visa:e28a"]])

    async def test_all_seven_ruen_cards_deliver_whole_exact_main_parts_and_topics(self):
        for locale in ("ru", "en"):
            for selected, (key, topic) in CARDS.items():
                self.state.select(101, locale=locale, fallback=locale)
                self.session.calls.clear()
                await self.callback("visa:" + selected)
                sends = [x for x in self.session.calls if type(x).__name__ == "SendMessage"]
                expected = self.core.parts(self.core.card(key, locale=locale, pricing_projection=None))
                self.assertEqual([x.text for x in sends], expected)
                self.assertTrue(all(len(x.text.encode("utf-16-le")) // 2 <= 3500 for x in sends))
                self.assertTrue(all(x.reply_markup is None for x in sends[:-1]))
                buttons = sends[-1].reply_markup.inline_keyboard
                self.assertEqual(buttons[0][0].callback_data, "visas:bali")
                self.assertEqual(buttons[-1][0].callback_data, "home")
                self.assertEqual(buttons[1][0].callback_data, "topic:" + topic)
                self.assertEqual(self.state.context(101)["topic"], topic)
        self.client.inbound.assert_not_awaited()  # Browsing never creates a lead.

    async def test_thai_text_is_main_source_and_website_only_additional(self):
        await self.callback("visas:thailand")
        edit = [x for x in self.session.calls if type(x).__name__ == "EditMessageText"][-1]
        self.assertEqual(edit.text, self.core.text("destination.service.thailandVisas", locale="en"))
        self.assertEqual(edit.reply_markup.inline_keyboard[1][0].callback_data,"contact")
        self.assertTrue(edit.reply_markup.inline_keyboard[1][1].url.endswith("/en/thailand/visas/"))

    async def test_cross_actor_and_unknown_visa_do_not_fetch_or_send_content(self):
        await self.callback("visa:c1", actor=102)
        await self.callback("visa:not_a_card")
        self.client.pricing.assert_not_awaited()
        self.assertFalse(any(type(x).__name__ in {"SendMessage","EditMessageText"} for x in self.session.calls))

    async def test_thai_question_never_retains_a_previously_viewed_bali_visa(self):
        await self.callback("visa:e33g")
        self.assertEqual(self.state.context(101)["topic"], "e33g")
        await self.callback("visas:bali")
        self.assertEqual(self.state.context(101)["topic"], "visas_bali")
        await self.callback("categories")
        await self.callback("visas:thailand")
        await self.callback("contact")
        self.assertEqual(self.state.context(101)["topic"], "general")
        await self.dp._process_update(self.bot, incoming(778, "Synthetic Thai visa question"))
        self.assertEqual(self.client.inbound.await_args.args[0].topic,"general")

    async def test_delivery_failure_stops_tail_without_poisoning_next_inquiry(self):
        with patch.object(self.core, "parts", return_value=["first", "second", "third"]):
            original = self.session.make_request
            async def fail_second(bot, method, timeout=None):
                if type(method).__name__ == "SendMessage" and method.text == "second":
                    raise RuntimeError("synthetic_failure_no_private_details")
                return await original(bot, method, timeout)
            with patch.object(self.session, "make_request", side_effect=fail_second):
                await self.callback("visa:d1d2")
        self.assertNotIn("third", [x.text for x in self.session.calls if type(x).__name__ == "SendMessage"])
        await self.dp._process_update(self.bot, incoming(777, "Synthetic question after failed UI"))
        self.client.inbound.assert_awaited_once()


class PricingTransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_public_projection_has_no_service_secret_or_redirects(self):
        seen = []
        def handle(request):
            seen.append(request)
            return httpx.Response(200, json={"items":[],"projection_id":"synthetic"})
        client = ChannelClient(config(), transport=httpx.MockTransport(handle))
        try:
            self.assertEqual(await client.pricing(), {"items":[],"projection_id":"synthetic"})
            self.assertEqual(str(seen[0].url),"http://127.0.0.1:8080/api/catalog/pricing")
            self.assertNotIn("X-Service-Token",seen[0].headers)
        finally:
            await client.close()

    async def test_unavailable_malformed_oversized_projection_has_no_local_fx(self):
        for response in (httpx.Response(503),httpx.Response(302,headers={"Location":"https://wrong.example"}),
                httpx.Response(200,content=b"bad json"),httpx.Response(200,json=[]),
                httpx.Response(200,content=b" "*2_000_001)):
            client = ChannelClient(config(),transport=httpx.MockTransport(lambda request:response))
            try:
                self.assertIsNone(await client.pricing())
            finally:
                await client.close()
