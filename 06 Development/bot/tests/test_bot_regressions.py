import stat
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiogram.dispatcher.event.bases import SkipHandler

from app.core.buttons import is_known_button_text
from app.core.config import Settings
from app.handlers import broadcast, contact, destinations, menu, start
from app.services.json_storage import load_json, save_json
from app.services import referrals


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
        )

        self.assertEqual(settings.staff_chat_ids, [1, 2, 3])
        self.assertEqual(settings.visa_staff_chat_ids, [1, 4])
        self.assertEqual(settings.spb_staff_chat_ids, [1, 5])
        self.assertEqual(settings.all_staff_chat_ids, [1, 2, 3, 4, 5])


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
            spb_staff_chat_ids=[1, 271039578],
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
                [1, 2],
            )
            self.assertEqual(
                contact.get_recipients_for_route(
                    {"country": "Россия", "city": "Санкт-Петербург"}
                ),
                [1, 271039578],
            )

    async def test_spb_contact_card_goes_only_to_owner_and_spb_manager(self):
        fake_settings = SimpleNamespace(
            ADMIN_CHAT_ID=1,
            staff_chat_ids=[1, 2],
            visa_staff_chat_ids=[1, 3],
            spb_staff_chat_ids=[1, 271039578],
            all_staff_chat_ids=[1, 2, 3, 271039578],
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
                    contact,
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

                self.assertEqual(recipients, [1, 271039578])
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
                patch.object(contact, "CONVERSATIONS_PATH", conversations_path),
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
            all_staff_chat_ids=[1, 2, 3, 4],
        )

        with tempfile.TemporaryDirectory() as directory:
            conversations_path = Path(directory) / "conversations.json"
            with (
                patch.object(contact, "settings", fake_settings),
                patch.object(contact, "CONVERSATIONS_PATH", conversations_path),
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
                await start.attach_referral_if_needed(message, None)

            record = load_json(referrals_path, {})["200"]
            self.assertEqual(record["referrer_id"], 1)
            self.assertEqual(record["source"], "default_main_admin")
            self.assertTrue(record["silent"])
            message.bot.send_message.assert_not_awaited()

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
            ["🌴 Бали", "🇹🇭 Таиланд", "🇷🇺 Россия", "🇳🇵 Непал"],
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
            "🧘 Организовать ретрит — Челябинск",
            self._button_texts(destinations.chelyabinsk_keyboard()),
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
            destinations.chelyabinsk_keyboard(),
            destinations.nepal_keyboard(),
        ):
            self.assertTrue(all(len(row) <= 2 for row in keyboard.keyboard))
            self.assertIn("✍️ Написать менеджеру", self._button_texts(keyboard))

        for keyboard in (menu.visa_keyboard(), menu.housing_keyboard()):
            self.assertTrue(all(len(row) <= 2 for row in keyboard.keyboard))
            self.assertIn("✍️ Написать менеджеру", self._button_texts(keyboard))

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
