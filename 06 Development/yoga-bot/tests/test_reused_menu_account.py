"""Founder navigation and own-account contracts, offline aiogram transport."""
import unittest
from dataclasses import replace
from unittest.mock import AsyncMock

from aiogram.types import Update
from tests.test_foundation import settings, SHARED, OfflineSession
from tests.test_shared_intake import config, incoming
from tests import test_shared_intake as intake_tests
from yoga_bot.api_client import AccountReceipt, AccountUnavailable, RegistrationReceipt, OwnOrder
from yoga_bot.account import own_account
from yoga_bot.catalog import load_catalog
from yoga_bot.config import YOGA_PREVIEW_SITE_BASE, Settings, RuntimeConfigError
from yoga_bot.menu import Menus
from yoga_bot.runtime import create_dispatcher


class MenuLayoutTests(unittest.TestCase):
    def test_shared_intake_is_neutral_and_whatsapp_is_optional_team_link_only(self):
        from urllib.parse import urlsplit, parse_qs
        menus = Menus(config(mini_app_url='https://yoga.example.org/mini-app/'), load_catalog(SHARED))
        for locale in ('ru', 'en'):
            home = menus.home(locale)
            self.assertNotIn('Yoga', home.text)
            self.assertFalse(any(b.web_app_url for row in home.buttons for b in row))
            self.assertFalse(any(b.url for row in home.buttons for b in row))
        with_phone = Menus(replace(menus.settings, team_whatsapp_number='79990000000'), menus.services)
        link = next(b.url for row in with_phone.home('ru').buttons for b in row if b.url)
        self.assertEqual(urlsplit(link).netloc, 'wa.me')
        self.assertEqual(urlsplit(link).path, '/79990000000')
        self.assertIn('бот Михаила', parse_qs(urlsplit(link).query)['text'][0])

    def test_team_whatsapp_config_cannot_be_url_query_or_arbitrary_contact_payload(self):
        env = {'YOGA_BOT_TOKEN': intake_tests.DUMMY_TOKEN, 'YOGA_MVP_MODE': 'shared_intake',
            'YOGA_SITE_ORIGIN': 'https://yoga.example.org', 'YOGA_SHARED_CONTENT_ROOT': str(SHARED),
            'YOGA_BACKEND_API_ORIGIN': 'http://127.0.0.1:8080', 'YOGA_SERVICE_API_TOKEN': intake_tests.SERVICE_SECRET}
        self.assertIsNone(Settings.from_env(env).team_whatsapp_url)
        self.assertIn('wa.me/79990000000?', Settings.from_env({**env, 'YOGA_TEAM_WHATSAPP_NUMBER': '+79990000000'}).team_whatsapp_url)
        for value in ('https://wa.me/79990000000', '79990000000?text=bad', '0', 'PRIVATE-PHONE', '7999 0000000'):
            with self.assertRaisesRegex(RuntimeConfigError, '^invalid_team_whatsapp_number$'):
                Settings.from_env({**env, 'YOGA_TEAM_WHATSAPP_NUMBER': value})

    def test_language_first_main_two_columns_and_real_webapp(self):
        s = settings(account_enabled=True, mini_app_url="https://yoga.example.org/mini-app/")
        menus = Menus(s, load_catalog(SHARED))
        for locale in ("ru", "en"):
            start = menus.start(locale, "ref_101")
            self.assertEqual([[b.callback for b in row] for row in start.buttons], [["lang:ru", "lang:en"]])
            home = menus.home(locale)
            self.assertEqual([len(row) for row in home.buttons], [2,2,2])
            self.assertEqual(home.buttons[0][1].callback, "categories")
            self.assertEqual(home.buttons[1][0].callback, "account")
            self.assertEqual(home.buttons[1][1].url, "https://t.me/Example_safr_bot")
            self.assertEqual(home.buttons[2][0].web_app_url, s.mini_app_url)
            settings_page = menus.language(locale)
            self.assertEqual(settings_page.buttons[0][0].callback, "home")
            self.assertEqual(settings_page.buttons[-1][0].callback, "home")
            invalid = menus.start(locale, "../invalid")
            self.assertEqual([[b.callback for b in row] for row in invalid.buttons], [["lang:ru", "lang:en"]])

    def test_services_exact_order_navigation_and_preserved_exchange_topic(self):
        s = settings(origin=YOGA_PREVIEW_SITE_BASE)
        menus = Menus(s, load_catalog(SHARED))
        ru = menus.categories("ru")
        self.assertEqual([[b.label for b in row] for row in ru.buttons[1:-1]], [
            ["Визы на Бали", "Визы в Таиланд"], ["Travel assistant", "Недвижимость"],
            ["Байки", "Страховка"], ["Гайды", "Обмен"]])
        self.assertEqual(ru.buttons[0][0].callback, "home")
        self.assertEqual(ru.buttons[-1][0].label, "Меню")
        self.assertEqual(ru.buttons[3][0].callback, "topic:bikes")
        self.assertEqual(ru.buttons[4][1].callback, "topic:exchange")
        self.assertIsNone(ru.buttons[4][1].url)
        self.assertEqual(menus.categories("en").buttons[4][1].callback, "topic:exchange")


class ReusedAccountDispatchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await intake_tests.RuntimeIntakeTests.asyncSetUp(self)
        async def register(**kw):
            return RegistrationReceipt(telegram_id=kw["actor"], user_id=7, ref_code="TG101", status="active", is_new=False, referral_status="already_attributed")
        self.client.register.side_effect = register
        self.client.account.return_value = AccountReceipt(telegram_id=101,user_id=7,ref_code="TG101",
            referral_payload="r_ABCDEFGH",level_1_count=2,total_count=3,balance=-4,orders_count=0,orders=[])
        self.dp = create_dispatcher(config(state_directory=self.root,account_enabled=True,
            mini_app_url="https://yoga.example.org/mini-app/"),load_catalog(SHARED),client=self.client,intake_state=self.state)

    async def asyncTearDown(self):
        await intake_tests.RuntimeIntakeTests.asyncTearDown(self)

    async def callback(self, data, actor=101):
        return await self.dp._process_update(self.bot, Update.model_validate({"update_id":600,"callback_query":{
            "id":"synthetic","chat_instance":"synthetic","data":data,
            "from":{"id":actor,"is_bot":False,"first_name":"Synthetic","language_code":"en"},
            "message":{"message_id":1,"date":1,"chat":{"id":101,"type":"private"},
                "from":self.session.me.model_dump(),"text":"Synthetic menu"}}}))

    async def test_start_registration_preserves_referral_and_only_language_keyboard(self):
        await self.dp._process_update(self.bot,incoming(body="/start ref_3"))
        self.assertEqual(self.client.register.await_args.kwargs["start_payload"],"ref_3")
        sent = [x for x in self.session.calls if type(x).__name__=="SendMessage"][-1]
        self.assertEqual([[b.callback_data for b in row] for row in sent.reply_markup.inline_keyboard],[["lang:ru","lang:en"]])

    async def test_callback_uses_human_query_sender_not_bot_message_author(self):
        await self.callback("account")
        self.client.register.assert_awaited_once()
        self.assertEqual(self.client.register.await_args.kwargs["actor"],101)
        self.client.account.assert_awaited_once_with(actor=101,chat=101)
        reply = [x for x in self.session.calls if type(x).__name__=="EditMessageText"][-1]
        self.assertIn("?start=r_ABCDEFGH", reply.text)
        self.assertIn("-4",reply.text)  # No fake zero/clamping of canonical balance.
        self.assertEqual(reply.reply_markup.inline_keyboard[-1][0].callback_data,"home")
        self.assertFalse(any(button.web_app for row in reply.reply_markup.inline_keyboard for button in row))

    async def test_cross_actor_callback_never_fetches_account(self):
        await self.callback("account",actor=102)
        self.client.account.assert_not_awaited()
        self.client.register.assert_not_awaited()

    async def test_shared_orders_truncation_does_not_promote_hidden_mini_app(self):
        orders = [OwnOrder(id=i, service='x' * 250, status='new', payment_status='unpaid',
            amount_usd=None, created_at=None) for i in range(1, 31)]
        self.client.account.return_value = self.client.account.return_value.model_copy(update={'orders': orders, 'orders_count': 30})
        message = incoming().message
        menus = Menus(config(account_enabled=True, mini_app_url='https://yoga.example.org/mini-app/'), load_catalog(SHARED))
        for locale, marker in (('ru', 'Список сокращён'), ('en', 'The list is shortened')):
            reply = await own_account(self.client, message.from_user, message.chat, locale, menus, view='orders')
            self.assertIn(marker, reply.text)
            self.assertLessEqual(len(reply.text), 3500)
            self.assertNotIn('Mini App', reply.text)
            self.assertFalse(any(b.web_app_url for row in reply.buttons for b in row))

    async def test_language_choice_updates_own_canonical_preference_before_home(self):
        self.client.set_locale.return_value = {"telegram_id":101,"locale":"en"}
        await self.callback("lang:en")
        self.client.set_locale.assert_awaited_once_with(actor=101,chat=101,locale="en")
        self.assertEqual(self.state.context(101)["locale"],"en")

    async def test_points_orders_referrals_use_same_own_account_contract(self):
        for command in ("/points", "/orders", "/referrals"):
            await self.dp._process_update(self.bot,incoming(body=command))
        self.assertEqual(self.client.account.await_count,3)
        sends = [x for x in self.session.calls if type(x).__name__=="SendMessage"]
        self.assertIn("balance: -4",sends[-3].text)
        self.assertIn("No purchases yet",sends[-2].text)
        self.assertIn("?start=r_ABCDEFGH",sends[-1].text)

    async def test_actor_denial_does_not_poison_next_actor(self):
        self.client.register.side_effect = AccountUnavailable("account_unavailable")
        self.assertTrue(await self.dp._process_update(self.bot,incoming(body="/account")))
        self.client.account.assert_not_awaited()
        self.client.register.side_effect = lambda **kw: RegistrationReceipt(telegram_id=kw["actor"],user_id=8,ref_code="TG102",status="active",is_new=True,referral_status="attributed")
        await self.dp._process_update(self.bot,incoming(501,"Synthetic natural question",actor=102))
        self.client.inbound.assert_awaited_once()
