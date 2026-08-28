import stat
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiogram.dispatcher.event.bases import SkipHandler

from app.core.buttons import is_known_button_text
from app.core.config import Settings, settings
from app.content.visas import get_visa_card
from app.content.housing import get_housing_pages
from app.handlers import broadcast, contact, destinations, menu, start
from app.services.json_storage import load_json, save_json
from app.services import account, conversation_store, referrals
from app.services import exchange_rates
from app.services.locale import reset_current_locale, set_current_locale
from app.keyboards import main_menu as main_menu_keyboard_module
from app.handlers.web_chat import can_access
from app.services.web_chat_bridge import format_web_request


class JsonStorageTests(unittest.TestCase):
    def test_atomic_round_trip_and_private_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime.json"
            payload = {"message": "тест", "items": [1, 2, 3]}

            save_json(path, payload)

            self.assertEqual(load_json(path, {}), payload)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

    def test_missing_or_invalid_json_returns_fresh_default(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime.json"
            default = {"events": []}

            first = load_json(path, default)
            first["events"].append("changed")
            self.assertEqual(load_json(path, default), {"events": []})

            path.write_text("{invalid", encoding="utf-8")
            with self.assertLogs("app.services.json_storage", level="ERROR"):
                self.assertEqual(load_json(path, default), {"events": []})


class ConfigurationTests(unittest.TestCase):
    def test_staff_ids_are_parsed_and_deduplicated(self):
        settings = Settings(
            BOT_TOKEN="123:token",
            ADMIN_CHAT_ID=1,
            MANAGER_CHAT_IDS="1, 2, 2, 3",
            VISA_ADMIN_CHAT_IDS="4, 4, 1",
            SPB_MANAGER_CHAT_IDS="5, 5, 1",
            THAILAND_MANAGER_CHAT_IDS="6, 6, 1",
        )

        self.assertEqual(settings.staff_chat_ids, [1, 2, 3])
        self.assertEqual(settings.visa_staff_chat_ids, [1, 4])
        self.assertEqual(settings.spb_staff_chat_ids, [1, 5])
        self.assertEqual(settings.thailand_staff_chat_ids, [1, 6])
        self.assertEqual(settings.all_staff_chat_ids, [1, 2, 3, 4, 5, 6])

    def test_main_menu_includes_mini_app_when_configured(self):
        with patch.object(
            main_menu_keyboard_module.settings,
            "MINI_APP_URL",
            "https://app.safrway.online",
        ):
            keyboard = main_menu_keyboard_module.main_menu_keyboard()

        self.assertEqual(keyboard.keyboard[-1][0].text, "🌍 Сменить направление")
        self.assertEqual(keyboard.keyboard[-1][1].text, "🚀 Меню App")
        self.assertIsNone(keyboard.keyboard[-1][1].web_app)

    def test_main_menu_exposes_all_indonesia_guides_in_bali(self):
        keyboard = main_menu_keyboard_module.main_menu_keyboard()
        labels = [button.text for row in keyboard.keyboard for button in row]

        self.assertIn("📚 Гайды", labels)

    def test_website_chat_card_keeps_route_and_client_message(self):
        text = format_web_request(
            {
                "client": {"first_name": "Иван", "username": "ivan"},
                "route_context": {
                    "country": "Бали",
                    "section": "Визы",
                    "service": "E33G",
                },
                "messages": [
                    {
                        "author_type": "client",
                        "body": "Нужна консультация",
                    }
                ],
            }
        )
        self.assertIn("Бали → Визы → E33G", text)
        self.assertIn("Нужна консультация", text)
        self.assertTrue(
            can_access({"assigned_staff_ids": [5]}, settings.ADMIN_CHAT_ID)
        )
        self.assertTrue(can_access({"assigned_staff_ids": [5]}, 5))
        self.assertFalse(can_access({"assigned_staff_ids": [5]}, 6))


class ExchangeRateTests(unittest.IsolatedAsyncioTestCase):
    async def test_indodax_rate_is_cached_for_three_days(self):
        now = datetime(2026, 7, 22, tzinfo=timezone.utc)

        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "exchange_rates.json"
            fetch_rate = AsyncMock(
                side_effect=[Decimal("16000"), Decimal("16500")]
            )
            with (
                patch.object(exchange_rates, "CACHE_PATH", cache_path),
                patch.object(exchange_rates, "_fetch_indodax_rate", fetch_rate),
            ):
                first = await exchange_rates.get_usdt_idr_rate(now)
                cached = await exchange_rates.get_usdt_idr_rate(
                    now + timedelta(days=2)
                )
                refreshed = await exchange_rates.get_usdt_idr_rate(
                    now + timedelta(days=4)
                )

        self.assertEqual(first, Decimal("16000"))
        self.assertEqual(cached, Decimal("16000"))
        self.assertEqual(refreshed, Decimal("16500"))
        self.assertEqual(fetch_rate.await_count, 2)

    async def test_calculator_refreshes_a_two_day_old_rate(self):
        now = datetime(2026, 7, 22, tzinfo=timezone.utc)

        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "exchange_rates.json"
            save_json(
                cache_path,
                {
                    "usdt_idr": "16000",
                    "updated_at": (now - timedelta(days=2)).isoformat(),
                },
            )
            fetch_rate = AsyncMock(return_value=Decimal("16500"))
            with (
                patch.object(exchange_rates, "CACHE_PATH", cache_path),
                patch.object(exchange_rates, "_fetch_indodax_rate", fetch_rate),
            ):
                rate = await exchange_rates.get_usdt_idr_rate(
                    now,
                    max_age_seconds=exchange_rates.CALCULATOR_CACHE_TTL_SECONDS,
                )

        self.assertEqual(rate, Decimal("16500"))
        fetch_rate.assert_awaited_once()

    async def test_stale_rate_is_used_when_indodax_is_unavailable(self):
        now = datetime(2026, 7, 22, tzinfo=timezone.utc)

        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "exchange_rates.json"
            save_json(
                cache_path,
                {
                    "usdt_idr": "16000",
                    "updated_at": (now - timedelta(days=4)).isoformat(),
                },
            )
            with (
                patch.object(exchange_rates, "CACHE_PATH", cache_path),
                patch.object(
                    exchange_rates,
                    "_fetch_indodax_rate",
                    AsyncMock(side_effect=RuntimeError("offline")),
                ),
                self.assertLogs("app.services.exchange_rates", level="ERROR"),
            ):
                rate = await exchange_rates.get_usdt_idr_rate(now)

        self.assertEqual(rate, Decimal("16000"))


class VisaPricingTests(unittest.TestCase):
    def test_prices_are_rendered_in_idr_and_rounded_to_five_dollars(self):
        e33g = get_visa_card("E33G", Decimal("16000"))
        d12 = get_visa_card("D12", Decimal("16000"))
        d1_d2 = get_visa_card("D1/D2", Decimal("16000"))
        evoa = get_visa_card("VOA", Decimal("20000"))

        self.assertIn("Стоимость под ключ", e33g)
        self.assertIn("Государственные иммиграционные сборы", e33g)
        self.assertIn("Rp 12.000.000 (≈ $750)", e33g)
        self.assertIn("Rp 14.000.000 (≈ $875)", e33g)
        self.assertNotIn("12.000.000 IDR", e33g)
        self.assertIn("Rp 7.500.000 (≈ $470)", d12)
        self.assertIn("Rp 10.000.000 (≈ $625)", d12)
        self.assertIn("Rp 12.500.000 (≈ $780)", d12)
        self.assertIn("Rp 14.500.000 (≈ $905)", d12)
        self.assertIn("Rp 5.500.000 (≈ $345)", d1_d2)
        self.assertIn("Rp 6.700.000 (≈ $420)", d1_d2)
        self.assertIn("Rp 6.500.000 (≈ $405)", d1_d2)
        self.assertIn("Rp 7.700.000 (≈ $480)", d1_d2)
        self.assertIn("Rp 9.000.000 (≈ $565)", d1_d2)
        self.assertIn("Rp 10.500.000 (≈ $655)", d1_d2)
        self.assertIn("Rp 9.500.000 (≈ $595)", d1_d2)
        self.assertIn("Rp 11.500.000 (≈ $720)", d1_d2)
        self.assertIn("Rp 18.000.000 (≈ $1125)", d1_d2)
        self.assertIn("Rp 20.000.000 (≈ $1250)", d1_d2)
        self.assertIn("Rp 22.000.000 (≈ $1375)", d1_d2)
        self.assertNotIn("18.000.000 IDR", d1_d2)
        self.assertNotIn("Indodax", e33g)
        self.assertNotIn("обновляется раз в 3 дня", e33g)
        self.assertIn("Rp 800.000 (≈ $50)", evoa)
        self.assertIn("официальный PNBP 500.000 IDR", evoa)

    def test_visa_menu_shows_dollar_prices_and_routes_dynamic_labels(self):
        keyboard = menu.visa_keyboard(Decimal("16000"))
        button_texts = [
            button.text for row in keyboard.keyboard for button in row
        ]

        self.assertIn("ITAS E33G — от 12kk / $750", button_texts)
        self.assertIn("D12 — от 7500k / $470", button_texts)
        self.assertIn("D1/D2 — от 5500k / $345", button_texts)
        self.assertIn("C1 — 2500k / $155", button_texts)
        self.assertIn("eVOA — 800k / $50", button_texts)
        self.assertEqual(
            menu.visa_key_from_button(
                "D1/D2 — от 5500k / $345"
            ),
            "D1/D2",
        )

    def test_d1_d2_and_c1_cards_match_verified_visit_visa_rules(self):
        d1_d2 = get_visa_card("D1/D2", Decimal("16000"))
        c1 = get_visa_card("C1", Decimal("16000"))

        self.assertIn("до общего срока не более 180 дней", d1_d2)
        self.assertIn("Резюме и план поездки", d1_d2)
        self.assertIn(
            "Срок действия D1/D2 считается с даты выпуска", d1_d2
        )
        self.assertNotIn(
            "После выпуска визы есть 90 дней на въезд", d1_d2
        )

        self.assertIn("однократная гостевая виза", c1)
        self.assertIn("до 60 дней с даты въезда", c1)
        self.assertIn("до общего срока не более 180 дней", c1)
        self.assertIn("Rp 2.500.000 (≈ $155)", c1)
        self.assertIn("официальный государственный сбор 1.000.000 IDR", c1)


class HousingContentTests(unittest.TestCase):
    def test_villa_search_is_four_telegram_safe_pages(self):
        pages = get_housing_pages("search_housing")

        self.assertEqual(len(pages), 4)
        self.assertTrue(all(len(page) < 4096 for page in pages))
        self.assertIn("📄 Страница 1 из 4", pages[0])
        self.assertIn("Индивидуальный поиск виллы — от $150", pages[2])
        self.assertIn("Личный выезд и полный видеообзор — от $50", pages[2])
        self.assertIn("ДОПОЛНИТЕЛЬНЫЙ КОНСЬЕРЖ-СЕРВИС", pages[3])

    def test_housing_page_keyboard_has_navigation_and_section_return(self):
        first_page = menu.housing_pages_keyboard(0, 4)
        last_page = menu.housing_pages_keyboard(3, 4)

        first_callbacks = [
            button.callback_data
            for row in first_page.inline_keyboard
            for button in row
        ]
        last_callbacks = [
            button.callback_data
            for row in last_page.inline_keyboard
            for button in row
        ]
        self.assertIn("housing_page:1", first_callbacks)
        self.assertIn("housing_page:2", last_callbacks)
        self.assertIn("housing_page:menu", first_callbacks)
        self.assertIn("housing_page:menu", last_callbacks)


class CurrencyCalculatorTests(unittest.IsolatedAsyncioTestCase):
    def test_currency_keyboard_opens_the_full_calculator(self):
        keyboard = menu.currency_exchange_keyboard()
        self.assertEqual(
            keyboard.keyboard[0][0].text,
            "🧮 Открыть калькулятор",
        )

    async def test_calculator_button_opens_direct_mini_app_page(self):
        user_id = 700
        start_message = SimpleNamespace(
            text="🧮 Открыть калькулятор",
            from_user=SimpleNamespace(id=user_id),
            answer=AsyncMock(),
        )

        with (
            patch.object(menu, "track_activity", AsyncMock()),
            patch.object(menu, "set_dialog_active"),
            patch.object(
                menu.settings,
                "MINI_APP_URL",
                "https://app.safrway.online",
            ),
        ):
            await menu.currency_calculator_start_handler(start_message)

        text = start_message.answer.await_args.args[0]
        markup = start_message.answer.await_args.kwargs["reply_markup"]
        self.assertIn("полностью работает в Mini App", text)
        self.assertEqual(
            markup.inline_keyboard[0][0].web_app.url,
            "https://app.safrway.online/"
            "?screen=services%2Fbali%2Fexchange%2Fusdt-idr",
        )

    async def test_legacy_consultation_button_opens_currency_exchange(self):
        message = SimpleNamespace(
            text="💬 Заказать консультацию",
            from_user=SimpleNamespace(id=701),
            answer=AsyncMock(),
        )

        with (
            patch.object(menu, "track_activity", AsyncMock()),
            patch.object(menu, "set_dialog_active"),
        ):
            await menu.consultation_handler(message)

        self.assertIn("Обмен валюты на Бали", message.answer.await_args.args[0])


class AllIndonesiaGuideTests(unittest.IsolatedAsyncioTestCase):
    async def test_guide_opens_localized_page_and_pdf_without_collecting_data(self):
        message = SimpleNamespace(
            text="📚 Guides",
            from_user=SimpleNamespace(id=702),
            answer=AsyncMock(),
        )
        token = set_current_locale("en")
        try:
            with (
                patch.object(menu, "track_activity", AsyncMock()),
                patch.object(menu, "set_dialog_active"),
                patch.object(menu, "set_route_context"),
            ):
                await menu.all_indonesia_guide_handler(message)
        finally:
            reset_current_locale(token)

        body = message.answer.await_args.args[0]
        markup = message.answer.await_args.kwargs["reply_markup"]
        urls = [button.url for row in markup.inline_keyboard for button in row]

        self.assertIn("save it to your phone", body)
        self.assertIn("government form is free", body)
        self.assertNotIn("send your passport", body.lower())
        self.assertEqual(
            urls,
            [
                "https://safrway.online/bali/guides/all-indonesia/",
                "https://safrway.online/downloads/all-indonesia-client-guide-safrway-2026.pdf",
            ],
        )


class ButtonRoutingTests(unittest.IsolatedAsyncioTestCase):
    def test_known_buttons_cover_navigation_and_partial_aliases(self):
        self.assertTrue(is_known_button_text("🏡 Найти жильё"))
        self.assertTrue(is_known_button_text("📋 Выйти в меню"))
        self.assertTrue(is_known_button_text("Найти жильё срочно"))
        self.assertFalse(is_known_button_text("Нужна вилла на месяц"))

    async def test_contact_waiting_state_passes_menu_button_to_next_handler(self):
        message = SimpleNamespace(
            text="🏡 Найти жильё",
            from_user=SimpleNamespace(id=100),
        )
        state = SimpleNamespace(clear=AsyncMock())

        with self.assertRaises(SkipHandler):
            await contact.contact_human_message(message, state, SimpleNamespace())

        state.clear.assert_awaited_once()

    async def test_service_waiting_state_passes_menu_button_to_next_handler(self):
        user_id = 101
        message = SimpleNamespace(
            text="🛂 Сделать визу",
            from_user=SimpleNamespace(id=user_id),
        )
        menu.SERVICE_WAITING_USERS[user_id] = {
            "service_type": "housing",
            "category": "test",
        }

        with self.assertRaises(SkipHandler):
            await menu.service_question_message_handler(message)

        self.assertNotIn(user_id, menu.SERVICE_WAITING_USERS)


class VisaRoleRoutingTests(unittest.IsolatedAsyncioTestCase):
    def test_destination_recipients_are_strictly_separated(self):
        fake_settings = SimpleNamespace(
            ADMIN_CHAT_ID=1,
            staff_chat_ids=[1, 2],
            visa_staff_chat_ids=[1, 3],
            spb_staff_chat_ids=[1, 900000021],
            thailand_staff_chat_ids=[1, 900000022],
        )

        with patch.object(contact, "settings", fake_settings):
            self.assertEqual(
                contact.get_recipients_for_route(
                    {"country": "Бали", "section": "Визы"}
                ),
                [1, 3],
            )
            self.assertEqual(
                contact.get_recipients_for_route(
                    {"country": "Таиланд", "section": "Визы"}
                ),
                [1, 900000022],
            )
            self.assertEqual(
                contact.get_recipients_for_route(
                    {"country": "Россия", "city": "Санкт-Петербург"}
                ),
                [1, 900000021],
            )

    async def test_spb_contact_card_goes_only_to_owner_and_spb_manager(self):
        fake_settings = SimpleNamespace(
            ADMIN_CHAT_ID=1,
            staff_chat_ids=[1, 2],
            visa_staff_chat_ids=[1, 3],
            spb_staff_chat_ids=[1, 900000021],
            all_staff_chat_ids=[1, 2, 3, 900000021],
        )
        bot = SimpleNamespace(send_message=AsyncMock(), forward_message=AsyncMock())
        message = SimpleNamespace(
            from_user=SimpleNamespace(
                id=500,
                username="client",
                full_name="Test Client",
            ),
            text="Хочу прогулку на катере",
            voice=None,
            photo=None,
            document=None,
            chat=SimpleNamespace(id=500),
            message_id=10,
        )
        route_context = {
            "country": "Россия",
            "city": "Санкт-Петербург",
            "section": "Туры",
            "service": "Прогулка на катере",
        }

        with tempfile.TemporaryDirectory() as directory:
            with (
                patch.object(contact, "settings", fake_settings),
                patch.object(
                    conversation_store,
                    "CONVERSATIONS_PATH",
                    Path(directory) / "conversations.json",
                ),
            ):
                await contact.notify_staff_about_client_message(
                    message,
                    bot,
                    route_context,
                )

                recipients = [
                    call.kwargs["chat_id"] for call in bot.send_message.await_args_list
                ]
                card_text = bot.send_message.await_args_list[0].kwargs["text"]

                self.assertEqual(recipients, [1, 900000021])
                self.assertNotIn(2, recipients)
                self.assertNotIn(3, recipients)
                self.assertIn("🌍 Страна: Россия", card_text)
                self.assertIn("🏙 Город: Санкт-Петербург", card_text)
                self.assertIn("🧩 Услуга: Прогулка на катере", card_text)

    async def test_service_questions_are_routed_by_role(self):
        fake_settings = SimpleNamespace(
            ADMIN_CHAT_ID=1,
            staff_chat_ids=[1, 2],
            visa_staff_chat_ids=[1, 3],
            spb_staff_chat_ids=[1, 4],
            all_staff_chat_ids=[1, 2, 3, 4],
        )
        user = SimpleNamespace(id=500, username="client", full_name="Test Client")
        bot = SimpleNamespace(send_message=AsyncMock())
        message = SimpleNamespace(
            from_user=user,
            text="Нужна помощь",
            date=datetime(2026, 7, 19),
            bot=bot,
        )

        with tempfile.TemporaryDirectory() as directory:
            visa_path = Path(directory) / "visa_clients.json"
            conversations_path = Path(directory) / "conversations.json"
            with (
                patch.object(menu, "settings", fake_settings),
                patch.object(contact, "settings", fake_settings),
                patch.object(contact, "VISA_CLIENTS_FILE", visa_path),
                patch.object(conversation_store, "CONVERSATIONS_PATH", conversations_path),
            ):
                await menu.send_service_question_to_staff(
                    message,
                    service_type="housing",
                    category="housing",
                )
                housing_recipients = [
                    call.kwargs["chat_id"] for call in bot.send_message.await_args_list
                ]

                bot.send_message.reset_mock()
                await menu.send_service_question_to_staff(
                    message,
                    service_type="visa",
                    category="E33G",
                )
                visa_recipients = [
                    call.kwargs["chat_id"] for call in bot.send_message.await_args_list
                ]

            self.assertEqual(housing_recipients, [1, 2])
            self.assertEqual(visa_recipients, [1, 3])
            self.assertIn("500", load_json(visa_path, {}))

    def test_visa_agent_access_is_limited_to_granted_clients(self):
        fake_settings = SimpleNamespace(
            ADMIN_CHAT_ID=1,
            staff_chat_ids=[1, 2],
            visa_admin_chat_ids=[3],
            visa_staff_chat_ids=[1, 3],
            spb_manager_chat_ids=[4],
            spb_staff_chat_ids=[1, 4],
            thailand_manager_chat_ids=[6],
            thailand_staff_chat_ids=[1, 6],
            all_staff_chat_ids=[1, 2, 3, 4, 6],
        )

        with tempfile.TemporaryDirectory() as directory:
            conversations_path = Path(directory) / "conversations.json"
            with (
                patch.object(contact, "settings", fake_settings),
                patch.object(conversation_store, "CONVERSATIONS_PATH", conversations_path),
            ):
                contact.set_client_routing(
                    500,
                    {"country": "Бали", "section": "Визы"},
                )

                self.assertTrue(contact.can_staff_access_client(1, 999))
                self.assertTrue(contact.can_staff_access_client(3, 500))
                self.assertFalse(contact.can_staff_access_client(2, 500))
                self.assertFalse(contact.can_staff_access_client(3, 999))
                self.assertFalse(contact.can_staff_access_client(4, 500))

                contact.set_client_routing(
                    500,
                    {"country": "Россия", "city": "Санкт-Петербург"},
                )
                self.assertTrue(contact.can_staff_access_client(4, 500))
                self.assertFalse(contact.can_staff_access_client(3, 500))

                contact.set_client_routing(500, {"country": "Таиланд"})
                self.assertTrue(contact.can_staff_access_client(6, 500))
                self.assertFalse(contact.can_staff_access_client(2, 500))
                self.assertFalse(contact.can_staff_access_client(3, 500))
                self.assertFalse(contact.can_staff_access_client(4, 500))


class StaffInternalThreadTests(unittest.IsolatedAsyncioTestCase):
    async def test_internal_thread_is_visible_only_to_assigned_staff(self):
        fake_settings = SimpleNamespace(
            ADMIN_CHAT_ID=1,
            staff_chat_ids=[1, 2],
            all_staff_chat_ids=[1, 6],
        )
        bot = SimpleNamespace(send_message=AsyncMock())

        with tempfile.TemporaryDirectory() as directory:
            conversations_path = Path(directory) / "conversations.json"
            with (
                patch.object(conversation_store, "CONVERSATIONS_PATH", conversations_path),
                patch.object(contact, "settings", fake_settings),
            ):
                record = conversation_store.ensure_client_record(500)
                record["assigned_staff_ids"] = [1, 6]
                record["route_context"] = {
                    "country": "Таиланд",
                    "section": "Визы",
                }
                conversation_store.update_client_record(500, record)
                conversation_store.add_staff_thread_message(
                    500,
                    {
                        "created_at": "2026-07-25 10:00:00",
                        "staff_id": 6,
                        "staff_name": "Сергей",
                        "kind": "message",
                        "text": "Нужно проверить документы.",
                    },
                )
                delivered = await contact.notify_staff_thread_participants(
                    bot=bot,
                    client_id=500,
                    sender_id=6,
                    sender_name="Сергей",
                    text="Нужно проверить документы.",
                    kind="message",
                )
                thread = conversation_store.format_staff_thread(500)

        self.assertEqual(delivered, 1)
        self.assertEqual(
            [call.kwargs["chat_id"] for call in bot.send_message.await_args_list],
            [1],
        )
        self.assertNotIn(500, [
            call.kwargs["chat_id"] for call in bot.send_message.await_args_list
        ])
        self.assertIn("Сергей", thread)
        self.assertIn("Нужно проверить документы", thread)
        self.assertIn("Таиланд", thread)

    def test_client_actions_include_separate_team_chat(self):
        callbacks = [
            button.callback_data
            for row in contact.client_actions_keyboard(500).inline_keyboard
            for button in row
        ]
        self.assertIn("staff_thread:500", callbacks)
        self.assertIn("comment:500", callbacks)

    def test_owner_restriction_blocks_manager_from_internal_thread(self):
        fake_settings = SimpleNamespace(
            ADMIN_CHAT_ID=1,
            staff_chat_ids=[1, 6],
            all_staff_chat_ids=[1, 6],
        )
        with tempfile.TemporaryDirectory() as directory:
            conversations_path = Path(directory) / "conversations.json"
            with (
                patch.object(conversation_store, "CONVERSATIONS_PATH", conversations_path),
                patch.object(contact, "settings", fake_settings),
            ):
                record = conversation_store.ensure_client_record(500)
                record["assigned_staff_ids"] = [1, 6]
                record["restricted_to_owner"] = True
                conversation_store.update_client_record(500, record)
                self.assertTrue(contact.can_staff_access_client(1, 500))
                self.assertFalse(contact.can_staff_access_client(6, 500))


class AccountDashboardTests(unittest.IsolatedAsyncioTestCase):
    async def test_points_and_orders_use_backend_dashboard_when_available(self):
        dashboard = {
            "balance": 125,
            "referral_count": 3,
            "orders": [
                {
                    "id": 7,
                    "service": "Виза E33G",
                    "status": "in_progress",
                    "payment_status": "paid",
                    "amount_usd": 700,
                }
            ],
        }
        with patch.object(
            account,
            "get_user_dashboard",
            AsyncMock(return_value=dashboard),
        ):
            points_text = await account.get_points_summary(500, "fallback")
            orders_text = await account.get_orders_summary(500, "fallback")

        self.assertIn("125 SAFR Points", points_text)
        self.assertIn("Приглашено напрямую: 3", points_text)
        self.assertIn("Виза E33G", orders_text)
        self.assertIn("$700", orders_text)

    async def test_account_uses_fallback_when_backend_is_unavailable(self):
        with patch.object(
            account,
            "get_user_dashboard",
            AsyncMock(return_value=None),
        ):
            self.assertEqual(
                await account.get_points_summary(500, "fallback"),
                "fallback",
            )


class BroadcastStorageTests(unittest.TestCase):
    def test_recipients_are_deduplicated_and_admin_is_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            activity_path = Path(directory) / "user_activity.json"
            save_json(
                activity_path,
                {
                    "1": {"telegram_id": 1},
                    "2": {"telegram_id": 2},
                    "alias": {"user_id": "2"},
                    "3": {"id": 3},
                },
            )

            with (
                patch.object(broadcast, "USER_ACTIVITY_PATH", activity_path),
                patch.object(
                    broadcast,
                    "settings",
                    SimpleNamespace(ADMIN_CHAT_ID=1),
                ),
            ):
                self.assertEqual(broadcast.load_broadcast_recipients(), [2, 3])


class ReferralSystemTests(unittest.IsolatedAsyncioTestCase):
    def test_personal_code_is_stable_opaque_and_resolvable(self):
        with tempfile.TemporaryDirectory() as directory:
            codes_path = Path(directory) / "referral_codes.json"
            with (
                patch.object(referrals, "REFERRAL_CODES_PATH", codes_path),
                patch.object(referrals, "_generate_code", return_value="K7Q2M9AB"),
            ):
                first_code = referrals.get_or_create_referral_code(500)
                second_code = referrals.get_or_create_referral_code(500)

                self.assertEqual(first_code, "K7Q2M9AB")
                self.assertEqual(second_code, first_code)
                self.assertNotIn("ref", first_code.lower())
                self.assertEqual(referrals.resolve_referrer_id(first_code), 500)

    def test_legacy_referral_links_remain_supported(self):
        self.assertEqual(referrals.resolve_referrer_id("ref_123456"), 123456)
        self.assertIsNone(referrals.resolve_referrer_id("ref_invalid"))

    async def test_user_without_referral_is_attached_to_main_admin(self):
        with tempfile.TemporaryDirectory() as directory:
            referrals_path = Path(directory) / "referrals.json"
            activity_path = Path(directory) / "activity.json"
            message = SimpleNamespace(
                from_user=SimpleNamespace(
                    id=200,
                    username="organic",
                    full_name="Organic User",
                ),
                answer=AsyncMock(),
                bot=SimpleNamespace(send_message=AsyncMock()),
            )

            with (
                patch.object(referrals, "REFERRALS_PATH", referrals_path),
                patch.object(referrals, "USER_ACTIVITY_PATH", activity_path),
                patch.object(
                    start,
                    "settings",
                    SimpleNamespace(ADMIN_CHAT_ID=1),
                ),
            ):
                await start.attach_referral_if_needed(message, None)

            record = load_json(referrals_path, {})["200"]
            self.assertEqual(record["referrer_id"], 1)
            self.assertEqual(record["source"], "default_main_admin")
            self.assertTrue(record["silent"])
            message.bot.send_message.assert_awaited_once()
            notification = message.bot.send_message.await_args.kwargs
            self.assertEqual(notification["chat_id"], 1)
            self.assertIn("Новый пользователь", notification["text"])
            self.assertIn("ID 200", notification["text"])
            self.assertIn("без реферальной ссылки", notification["text"])

    async def test_admin_and_external_referrer_receive_new_user_notification(self):
        with tempfile.TemporaryDirectory() as directory:
            referrals_path = Path(directory) / "referrals.json"
            activity_path = Path(directory) / "activity.json"
            save_json(
                activity_path,
                {
                    "999": {
                        "telegram_id": 999,
                        "full_name": "Inviter",
                        "username": "inviter",
                    }
                },
            )
            message = SimpleNamespace(
                from_user=SimpleNamespace(
                    id=200,
                    username="client",
                    full_name="New Client",
                ),
                answer=AsyncMock(),
                bot=SimpleNamespace(send_message=AsyncMock()),
            )
            with (
                patch.object(referrals, "REFERRALS_PATH", referrals_path),
                patch.object(referrals, "USER_ACTIVITY_PATH", activity_path),
                patch.object(start, "settings", SimpleNamespace(ADMIN_CHAT_ID=1)),
            ):
                await start.attach_referral_if_needed(message, 999)

            recipients = [
                call.kwargs["chat_id"]
                for call in message.bot.send_message.await_args_list
            ]
            self.assertEqual(recipients, [1, 999])
            self.assertIn(
                "Inviter / @inviter / ID 999",
                message.bot.send_message.await_args_list[0].kwargs["text"],
            )
            self.assertIn("created_at", load_json(referrals_path, {})["200"])

    async def test_repeated_start_does_not_repeat_registration_notifications(self):
        with tempfile.TemporaryDirectory() as directory:
            referrals_path = Path(directory) / "referrals.json"
            activity_path = Path(directory) / "activity.json"
            message = SimpleNamespace(
                from_user=SimpleNamespace(
                    id=200,
                    username="client",
                    full_name="New Client",
                ),
                answer=AsyncMock(),
                bot=SimpleNamespace(send_message=AsyncMock()),
            )
            with (
                patch.object(referrals, "REFERRALS_PATH", referrals_path),
                patch.object(referrals, "USER_ACTIVITY_PATH", activity_path),
                patch.object(start, "settings", SimpleNamespace(ADMIN_CHAT_ID=1)),
            ):
                await start.attach_referral_if_needed(message, 999)
                await start.attach_referral_if_needed(message, 999)

            self.assertEqual(message.bot.send_message.await_count, 2)
            self.assertEqual(len(load_json(referrals_path, {})), 1)

    def test_network_summary_lists_only_direct_referrals(self):
        with tempfile.TemporaryDirectory() as directory:
            referrals_path = Path(directory) / "referrals.json"
            activity_path = Path(directory) / "activity.json"
            save_json(
                referrals_path,
                {
                    "200": {"user_id": 200, "referrer_id": 100, "source": "referral_link", "created_at": "2026-01-01"},
                    "300": {"user_id": 300, "referrer_id": 999, "source": "referral_link", "created_at": "2026-01-02"},
                },
            )
            save_json(
                activity_path,
                {
                    "200": {
                        "telegram_id": 200,
                        "full_name": "Direct Client",
                        "username": "direct",
                    }
                },
            )
            with (
                patch.object(referrals, "REFERRALS_PATH", referrals_path),
                patch.object(referrals, "USER_ACTIVITY_PATH", activity_path),
            ):
                summary = referrals.format_network_summary(100)
            self.assertIn("Приглашено напрямую: 1", summary)
            self.assertIn("@direct", summary)
            self.assertNotIn("ID 300", summary)

    async def test_existing_admin_binding_cannot_be_replaced_later(self):
        with tempfile.TemporaryDirectory() as directory:
            referrals_path = Path(directory) / "referrals.json"
            save_json(
                referrals_path,
                {
                    "200": {
                        "user_id": 200,
                        "referrer_id": 1,
                        "source": "default_main_admin",
                        "silent": True,
                    }
                },
            )
            message = SimpleNamespace(
                from_user=SimpleNamespace(
                    id=200,
                    username="organic",
                    full_name="Organic User",
                ),
                answer=AsyncMock(),
                bot=SimpleNamespace(send_message=AsyncMock()),
            )

            with (
                patch.object(referrals, "REFERRALS_PATH", referrals_path),
                patch.object(
                    start,
                    "settings",
                    SimpleNamespace(ADMIN_CHAT_ID=1),
                ),
            ):
                await start.attach_referral_if_needed(message, 999)

            self.assertEqual(
                load_json(referrals_path, {})["200"]["referrer_id"],
                1,
            )

    def test_backfill_adds_only_unassigned_historical_users(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            activity_path = data_dir / "user_activity.json"
            referrals_path = data_dir / "referrals.json"
            save_json(
                activity_path,
                {
                    "1": {"telegram_id": 1},
                    "200": {"telegram_id": 200},
                    "300": {"telegram_id": 300},
                },
            )
            save_json(
                referrals_path,
                {
                    "300": {
                        "user_id": 300,
                        "referrer_id": 999,
                        "source": "referral_link",
                        "silent": False,
                    }
                },
            )

            with (
                patch.object(referrals, "USER_ACTIVITY_PATH", activity_path),
                patch.object(referrals, "REFERRALS_PATH", referrals_path),
            ):
                added = referrals.backfill_default_admin_referrals(1)

            stored = load_json(referrals_path, {})
            self.assertEqual(added, 1)
            self.assertEqual(stored["200"]["referrer_id"], 1)
            self.assertEqual(stored["300"]["referrer_id"], 999)
            self.assertNotIn("1", stored)


class DestinationsTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _button_texts(markup):
        return [
            button.text
            for row in markup.keyboard
            for button in row
        ]

    def test_only_requested_destinations_are_visible(self):
        self.assertEqual(
            self._button_texts(destinations.destinations_keyboard()),
            [
                "🌴 Бали",
                "🇹🇭 Таиланд",
                "🇷🇺 Россия",
                "🇳🇵 Непал",
            ],
        )

    def test_destination_and_country_menus_expose_mini_app(self):
        with patch.object(
            main_menu_keyboard_module.settings,
            "MINI_APP_URL",
            "https://app.safrway.online",
        ):
            destinations_keyboard = destinations.destinations_keyboard()
            country_keyboard = destinations.thailand_keyboard()

        self.assertEqual(
            destinations_keyboard.keyboard[-1][0].text,
            "🚀 Меню App",
        )
        self.assertIsNone(destinations_keyboard.keyboard[-1][0].web_app)
        self.assertEqual(
            [button.text for button in country_keyboard.keyboard[-1]],
            ["🌍 Сменить направление", "🚀 Меню App"],
        )
        self.assertIsNone(country_keyboard.keyboard[-1][1].web_app)

    async def test_mini_app_menu_uses_authorized_inline_launch(self):
        message = SimpleNamespace(answer=AsyncMock())
        with patch.object(
            main_menu_keyboard_module.settings,
            "MINI_APP_URL",
            "https://app.safrway.online",
        ):
            await destinations.mini_app_menu_handler(message)

        markup = message.answer.await_args.kwargs["reply_markup"]
        launch_button = markup.inline_keyboard[0][0]
        self.assertEqual(launch_button.text, "🚀 Открыть SAFR App")
        self.assertEqual(
            launch_button.web_app.url,
            "https://app.safrway.online",
        )

    def test_all_planned_services_are_present(self):
        self.assertEqual(
            set(self._button_texts(destinations.thailand_keyboard()))
            & set(destinations.COMING_SOON_SERVICES),
            {
                "💱 Обмен — Таиланд",
                "🛂 Визы — Таиланд",
                "🏠 Недвижимость — Таиланд",
                "⛵ Яхты — Таиланд",
            },
        )
        self.assertIn(
            "🧘 Организовать ретрит — Урал",
            self._button_texts(destinations.ural_keyboard()),
        )
        self.assertIn(
            "🏔 Трекинг на Кайлас",
            self._button_texts(destinations.nepal_keyboard()),
        )

    def test_country_menus_are_two_column_and_offer_manager_contact(self):
        for keyboard in (
            destinations.thailand_keyboard(),
            destinations.russia_keyboard(),
            destinations.spb_keyboard(),
            destinations.ural_keyboard(),
            destinations.caucasus_keyboard(),
            destinations.nepal_keyboard(),
        ):
            self.assertTrue(all(len(row) <= 2 for row in keyboard.keyboard))
            self.assertIn("✍️ Написать менеджеру", self._button_texts(keyboard))

        for keyboard in (menu.visa_keyboard(), menu.housing_keyboard()):
            self.assertTrue(all(len(row) <= 2 for row in keyboard.keyboard))
            self.assertIn("✍️ Написать менеджеру", self._button_texts(keyboard))

    def test_personal_account_is_exactly_two_columns(self):
        keyboard = menu.personal_account_keyboard()
        self.assertTrue(all(len(row) == 2 for row in keyboard.keyboard))
        self.assertIn("🛂 Мои визы", self._button_texts(keyboard))

    def test_my_visas_is_not_a_separate_main_menu_entry(self):
        self.assertNotIn("🛂 Мои визы", self._button_texts(menu.main_menu_keyboard()))

    def test_personal_account_can_open_configured_mini_app(self):
        with patch.object(
            menu.settings,
            "MINI_APP_URL",
            "https://example.com/mini-app",
        ):
            keyboard = menu.personal_account_keyboard()

        self.assertTrue(all(len(row) == 2 for row in keyboard.keyboard))
        self.assertEqual(keyboard.keyboard[0][0].text, "🌍 Сменить направление")
        self.assertEqual(keyboard.keyboard[0][1].text, "🚀 Меню App")
        self.assertEqual(
            keyboard.keyboard[0][1].web_app,
            None,
        )

    def test_russia_uses_ural_and_caucasus_instead_of_chelyabinsk(self):
        buttons = self._button_texts(destinations.russia_keyboard())
        self.assertIn("⛰ Урал", buttons)
        self.assertIn("🏔 Кавказ", buttons)
        self.assertNotIn("🏔 Челябинск", buttons)

    def test_bali_main_menu_uses_currency_exchange_instead_of_consultation(self):
        buttons = self._button_texts(menu.main_menu_keyboard())
        self.assertIn("💱 Обмен валюты", buttons)
        self.assertNotIn("💬 Заказать консультацию", buttons)

    async def test_bali_deep_link_opens_bali_menu(self):
        message = SimpleNamespace(
            from_user=SimpleNamespace(id=100),
            answer=AsyncMock(),
        )

        with patch.object(destinations, "track_activity", AsyncMock()):
            opened = await destinations.show_start_destination(message, "bali")
            unknown = await destinations.show_start_destination(message, "unknown")

        self.assertTrue(opened)
        self.assertFalse(unknown)
        self.assertIn("Бали", message.answer.await_args.args[0])

    async def test_find_villa_button_opens_paginated_description(self):
        message = SimpleNamespace(
            text="Найти виллу",
            from_user=SimpleNamespace(id=702),
            answer=AsyncMock(return_value=SimpleNamespace(message_id=10)),
        )

        with (
            patch.object(menu, "track_activity", AsyncMock()),
            patch.object(menu, "set_dialog_active"),
        ):
            await menu.housing_service_info_handler(message)

        self.assertIn("Страница 1 из 4", message.answer.await_args.args[0])
        markup = message.answer.await_args.kwargs["reply_markup"]
        self.assertIsInstance(markup, menu.InlineKeyboardMarkup)
        menu.SERVICE_WAITING_USERS.pop(702, None)
        menu.SERVICE_PROMPT_MESSAGES.pop(702, None)

    async def test_coming_soon_service_returns_placeholder(self):
        message = SimpleNamespace(
            text="💱 Обмен — Таиланд",
            from_user=SimpleNamespace(id=100),
            answer=AsyncMock(),
        )

        with patch.object(destinations, "track_activity", AsyncMock()):
            await destinations.coming_soon_handler(message)

        self.assertIn("Информацию скоро добавим", message.answer.await_args.args[0])
        self.assertIn("Написать менеджеру", message.answer.await_args.args[0])


if __name__ == "__main__":
    unittest.main()
