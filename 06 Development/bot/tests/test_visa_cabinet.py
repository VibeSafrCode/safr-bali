import os
import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("BOT_TOKEN", "test-token")
os.environ.setdefault("ADMIN_CHAT_ID", "1")

from app.handlers.visas import cabinet_url, status_help, summary
from app.services.backend_client import get_user_visa_cases, send_web_client_message, send_web_staff_message
from app.services.i18n import button_key, button_text
from app.services.visa_notifications import (
    deliver_visa_notification,
    notification_keyboard,
    notification_text,
)
from app.services.web_chat_bridge import deliver_event
from app.handlers.web_chat import save_client_web_reply


class VisaCabinetBotTests(unittest.TestCase):
    def test_my_visas_button_is_stable_ru_en(self):
        self.assertEqual(button_key("🛂 Мои визы"), "button.visa.mine")
        self.assertEqual(button_key("🛂 My visas"), "button.visa.mine")
        self.assertEqual(button_text("button.visa.mine", locale="ru"), "🛂 Мои визы")

    def test_summary_contains_only_concise_published_contract(self):
        locale, body = summary({"locale": "en", "items": [{
            "id": 7, "visa_type": {"name": "B1"}, "lifecycle_status": "ACTIVE",
            "service_status": "ACTION_REQUIRED", "current_process": {"external_status": "BIOMETRICS_REQUIRED"},
            "next_action_text": "Visit the biometrics office", "stay_end": "2026-09-15", "extension_available": False, "passport_mask": "••••0000",
            "timeline": [{"title": "internal"}],
        }]}, today=date(2026, 9, 10))
        self.assertEqual(locale, "en")
        self.assertIn("B1", body); self.assertIn("Status: Visa active", body); self.assertIn("Process: your action is required — Visit the biometrics office", body)
        self.assertIn("Visa end date: 15.09.2026", body); self.assertIn("Days remaining: 5", body)
        self.assertIn("departure or another option", body)
        self.assertNotIn("ACTIVE", body)
        self.assertNotIn("0000", body); self.assertNotIn("internal", body)

    def test_summary_review_copy_is_deterministic_ru_en(self):
        common = {
            "visa_type": {"name": "eVOA / B1"},
            "lifecycle_status": "EXTENSION_PROCESSING",
            "service_status": "ACTION_REQUIRED",
            "current_process": {"external_status": "BIOMETRICS_REQUIRED"},
            "stay_end": "2026-09-20",
            "extension_available": False,
        }
        _, ru = summary({"locale": "ru", "items": [{**common, "next_action_text": "поездка на биометрию"}]}, today=date(2026, 9, 10))
        _, en = summary({"locale": "en", "items": [{**common, "next_action_text": "visit the biometrics office"}]}, today=date(2026, 9, 10))
        self.assertEqual(ru, "🛂 Мои визы\n\n🛂 eVOA / B1\nСтатус: Продление визы\nПроцесс: ожидает ваших действий — поездка на биометрию\nДата окончания визы: 20.09.2026\nОсталось дней: 10\nВажно: Продление не отмечено доступным. До окончания срока уточните у менеджера необходимость выезда или другой вариант.")
        self.assertEqual(en, "🛂 My visas\n\n🛂 eVOA / B1\nStatus: Visa extension\nProcess: your action is required — visit the biometrics office\nVisa end date: 20.09.2026\nDays remaining: 10\nNote: An extension is not recorded as available. Before expiry, ask a manager whether departure or another option is required.")

    def test_official_status_help_is_localized_and_unknown_safe(self):
        self.assertIn("ACTIVE", status_help("ACTIVE", "ru"))
        self.assertIn("активная", status_help("ACTIVE", "ru"))
        self.assertIn("active", status_help("ACTIVE", "en"))
        self.assertIn("official code", status_help("FUTURE_STATUS", "en"))
        self.assertNotIn("guarantee", status_help("ACTIVE", "en"))

    def test_cabinet_deep_link_uses_authenticated_mini_app(self):
        with patch("app.handlers.visas.settings.MINI_APP_URL", "https://app.example.invalid/"):
            self.assertEqual(cabinet_url(), "https://app.example.invalid/#/visas")
            self.assertEqual(cabinet_url("support"), "https://app.example.invalid/#/support")

    def test_publication_and_update_notifications_are_localized(self):
        self.assertIn("появилась виза", notification_text({"locale": "ru", "notification_type": "CASE_PUBLISHED"}))
        self.assertIn("updated", notification_text({"locale": "en", "notification_type": "CASE_UPDATED"}))

    def test_notification_renderers_cover_current_and_planned_types_ru_en(self):
        payload = {
            "case_id": 987,
            "visa_name": "E33G",
            "lifecycle_status": "ACTIVE",
            "status": "ACTIVE",
            "date_kind": "stay_end",
            "date_value": "2026-09-20",
            "reason_code": "VISA_EXPIRY",
            "client_display_name": "Fixture Client",
            "changes": [
                {
                    "field": "lifecycle_status",
                    "before": "NOT_ISSUED",
                    "after": "ACTIVE",
                },
                {
                    "field": "stay_end",
                    "before": "2026-09-10",
                    "after": "2026-09-20",
                },
            ],
            "internal_note": "DO NOT LEAK INTERNAL NOTE",
            "raw": {"secret": "DO NOT LEAK JSON"},
        }
        expected = {
            "CASE_PUBLISHED": {"ru": "появилась виза E33G", "en": "E33G has appeared"},
            "CASE_UPDATED": {"ru": "Что изменилось", "en": "What changed"},
            "STATUS_SUMMARY_MANUAL": {"ru": "Текущий статус", "en": "Current SAFRWAY status"},
            "CONTACT_REMINDER_CLIENT": {"ru": "Рекомендуем связаться", "en": "recommend contacting"},
            "CONTACT_REMINDER_STAFF": {"ru": "Нужно связаться", "en": "Client contact reminder"},
        }
        for kind, localized in expected.items():
            for locale, fragment in localized.items():
                with self.subTest(kind=kind, locale=locale):
                    body = notification_text({
                        "locale": locale,
                        "notification_type": kind,
                        "payload": payload,
                    })
                    self.assertIn(fragment, body)
                    self.assertNotIn("987", body)
                    self.assertNotIn("DO NOT LEAK", body)
                    self.assertNotIn("{'secret'", body)
                    self.assertNotIn("https://", body)

    def test_structured_update_localizes_codes_and_confirmed_date(self):
        body = notification_text({
            "locale": "ru",
            "notification_type": "CASE_UPDATED",
            "payload": {
                "visa_name": "E33G",
                "changes": [
                    {"field": "lifecycle_status", "before": "NOT_ISSUED", "after": "ACTIVE"},
                    {"field": "stay_end", "before": "2026-09-10", "after": "2026-09-20"},
                ],
            },
        })
        self.assertIn("Статус визы: оформление → виза активна", body)
        self.assertIn("Разрешено находиться до: 10.09.2026 → 20.09.2026", body)
        self.assertNotIn("NOT_ISSUED", body)
        self.assertNotIn("ACTIVE", body)

    def test_unknown_notification_is_safe_and_does_not_claim_update(self):
        for locale in ("ru", "en"):
            body = notification_text({
                "locale": locale,
                "notification_type": "FUTURE_INTERNAL_EVENT",
                "payload": {
                    "case_id": 321,
                    "internal_note": "hidden manager note",
                    "raw": {"secret": "value"},
                },
            })
            self.assertNotIn("321", body)
            self.assertNotIn("hidden manager note", body)
            self.assertNotIn("secret", body)
            self.assertNotIn("обновлена", body)
            self.assertNotIn("updated", body)
            self.assertIn("My visas" if locale == "en" else "Мои визы", body)

    def test_notification_keyboard_is_authenticated_mini_app_route(self):
        with patch("app.handlers.visas.settings.MINI_APP_URL", "https://app.example.invalid/"):
            ru_markup = notification_keyboard({"locale": "ru"})
            en_markup = notification_keyboard({"locale": "en"})
        self.assertIsNotNone(ru_markup)
        self.assertIsNotNone(en_markup)
        ru_button = ru_markup.inline_keyboard[0][0]
        en_button = en_markup.inline_keyboard[0][0]
        self.assertEqual(ru_button.text, "Открыть мои визы")
        self.assertEqual(en_button.text, "Open My visas")
        self.assertEqual(ru_button.web_app.url, "https://app.example.invalid/#/visas")
        self.assertEqual(en_button.web_app.url, "https://app.example.invalid/#/visas")

    def test_only_client_notifications_receive_my_visas_web_app_button(self):
        client_types = (
            "CASE_PUBLISHED",
            "CASE_UPDATED",
            "STATUS_SUMMARY_MANUAL",
        )
        with patch("app.handlers.visas.settings.MINI_APP_URL", "https://app.example.invalid/"):
            for kind in client_types:
                for recipient_kind in ("client", "CLIENT"):
                    with self.subTest(kind=kind, recipient_kind=recipient_kind):
                        markup = notification_keyboard({
                            "locale": "en",
                            "notification_type": kind,
                            "recipient_kind": recipient_kind,
                        })
                        self.assertIsNotNone(markup)
                        self.assertEqual(
                            markup.inline_keyboard[0][0].web_app.url,
                            "https://app.example.invalid/#/visas",
                        )

            self.assertIsNone(notification_keyboard({
                "locale": "ru",
                "notification_type": "CONTACT_REMINDER_STAFF",
            }))
            self.assertIsNone(notification_keyboard({
                "locale": "ru",
                "notification_type": "CONTACT_REMINDER_STAFF",
                "recipient_kind": "client",
            }))
            for recipient_kind in ("staff", "manager", "", None, 7):
                with self.subTest(recipient_kind=recipient_kind):
                    self.assertIsNone(notification_keyboard({
                        "locale": "ru",
                        "notification_type": "CASE_UPDATED",
                        "recipient_kind": recipient_kind,
                    }))

    def test_client_contact_reminder_actions_are_localized_and_reason_bound(self):
        expected = {
            "ru": ("Написать менеджеру", "Продлить визу"),
            "en": ("Contact manager", "Extend visa"),
        }
        with patch("app.handlers.visas.settings.MINI_APP_URL", "https://app.example.invalid/"):
            for locale, labels in expected.items():
                for reason_code in ("VISA_EXPIRY", "EXTENSION"):
                    with self.subTest(locale=locale, reason_code=reason_code):
                        markup = notification_keyboard({
                            "locale": locale,
                            "notification_type": "CONTACT_REMINDER_CLIENT",
                            "recipient_kind": "client",
                            "payload": {
                                "reason_code": reason_code,
                                "case_id": 987,
                                "internal_note": "DO NOT LEAK",
                            },
                        })
                        self.assertIsNotNone(markup)
                        buttons = markup.inline_keyboard[0]
                        self.assertEqual(tuple(button.text for button in buttons), labels)
                        self.assertEqual(buttons[0].web_app.url, "https://app.example.invalid/#/support")
                        self.assertEqual(buttons[1].web_app.url, "https://app.example.invalid/#/visas")
                        self.assertTrue(all(button.callback_data is None for button in buttons))
                        rendered = " ".join(button.text + " " + button.web_app.url for button in buttons)
                        self.assertNotIn("987", rendered)
                        self.assertNotIn("DO NOT LEAK", rendered)

    def test_client_contact_reminder_unknown_reason_is_contact_only(self):
        with patch("app.handlers.visas.settings.MINI_APP_URL", "https://app.example.invalid/"):
            for reason_code in (None, "", "OTHER", "NEW_VISA", "visa_expiry", "FUTURE_INTERNAL"):
                for locale, label in (("ru", "Написать менеджеру"), ("en", "Contact manager")):
                    with self.subTest(reason_code=reason_code, locale=locale):
                        payload = {} if reason_code is None else {"reason_code": reason_code}
                        markup = notification_keyboard({
                            "locale": locale,
                            "notification_type": "CONTACT_REMINDER_CLIENT",
                            "recipient_kind": "CLIENT",
                            "payload": payload,
                        })
                        self.assertIsNotNone(markup)
                        buttons = markup.inline_keyboard[0]
                        self.assertEqual(len(buttons), 1)
                        self.assertEqual(buttons[0].text, label)
                        self.assertEqual(buttons[0].web_app.url, "https://app.example.invalid/#/support")

    def test_contact_reminder_recipient_scope_and_legacy_payload_are_fail_closed(self):
        with patch("app.handlers.visas.settings.MINI_APP_URL", "https://app.example.invalid/"):
            legacy = notification_keyboard({
                "locale": "en",
                "notification_type": "CONTACT_REMINDER_CLIENT",
                "payload": {"case_id": 123, "reason_code": "VISA_EXPIRY"},
            })
            self.assertIsNotNone(legacy)
            self.assertEqual(
                [button.text for button in legacy.inline_keyboard[0]],
                ["Contact manager", "Extend visa"],
            )
            for notification_type in ("CONTACT_REMINDER_CLIENT", "CONTACT_REMINDER_STAFF"):
                for recipient_kind in ("staff", "manager", "root", "", None, 7):
                    with self.subTest(notification_type=notification_type, recipient_kind=recipient_kind):
                        self.assertIsNone(notification_keyboard({
                            "locale": "ru",
                            "notification_type": notification_type,
                            "recipient_kind": recipient_kind,
                            "payload": {"reason_code": "EXTENSION", "case_id": 123},
                        }))
            self.assertIsNone(notification_keyboard({
                "locale": "ru",
                "notification_type": "CONTACT_REMINDER_STAFF",
                "payload": {"reason_code": "EXTENSION", "case_id": 123},
            }))

            ambiguous_legacy = {
                "locale": "en",
                "notification_type": "CONTACT_REMINDER",
                "payload": {"reason_code": "VISA_EXPIRY", "can_open_case": True},
            }
            self.assertIsNone(notification_keyboard(ambiguous_legacy))
            self.assertNotIn("Open", notification_text(ambiguous_legacy))

            legacy_client = {
                **ambiguous_legacy,
                "recipient_kind": "CLIENT",
            }
            legacy_staff = {
                **ambiguous_legacy,
                "recipient_kind": "STAFF",
                "payload": {
                    "reason_code": "VISA_EXPIRY",
                    "staff_role_code": "general_manager",
                    "can_open_case": False,
                },
            }
            self.assertIn("recommend contacting", notification_text(legacy_client))
            self.assertIsNotNone(notification_keyboard(legacy_client))
            self.assertIn("Client contact reminder", notification_text(legacy_staff))
            self.assertIsNone(notification_keyboard(legacy_staff))

    def test_staff_reminder_copy_is_permission_and_role_bound_ru_en(self):
        denied_payloads = (
            {"staff_role_code": "general_manager", "can_open_case": False},
            {"staff_role_code": "general_manager", "can_open_case": True},
            {"staff_role_code": "visa_manager", "can_open_case": False},
            {"staff_role_code": "visa_manager"},
            {"staff_role_code": "legacy_staff", "can_open_case": True},
        )
        denied_terms = {
            "ru": ("Откройте", "админ", "кейс"),
            "en": ("Open", "Admin", "case"),
        }
        with patch("app.handlers.visas.settings.MINI_APP_URL", "https://app.example.invalid/"):
            for locale in ("ru", "en"):
                for payload in denied_payloads:
                    with self.subTest(locale=locale, payload=payload):
                        item = {
                            "locale": locale,
                            "notification_type": "CONTACT_REMINDER_STAFF",
                            "recipient_kind": "staff",
                            "payload": {**payload, "client_display_name": "Fixture Client"},
                        }
                        body = notification_text(item)
                        for term in denied_terms[locale]:
                            self.assertNotIn(term, body)
                        self.assertNotIn("https://", body)
                        self.assertIsNone(notification_keyboard(item))

            for role in ("visa_manager", "root_admin"):
                for locale, fragment in (("ru", "назначенного клиента и его визовый кейс"), ("en", "assigned client and visa case")):
                    with self.subTest(role=role, locale=locale):
                        item = {
                            "locale": locale,
                            "notification_type": "CONTACT_REMINDER_STAFF",
                            "recipient_kind": "staff",
                            "payload": {
                                "staff_role_code": role,
                                "can_open_case": True,
                                "client_display_name": "Fixture Client",
                            },
                        }
                        self.assertIn(fragment, notification_text(item))
                        self.assertIsNone(notification_keyboard(item))


class VisaNotificationTransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_transport_uses_web_app_button_and_never_raw_url(self):
        bot = AsyncMock()
        bot.send_message.return_value = SimpleNamespace(message_id=77)
        item = {
            "id": 12,
            "lease_token": "lease-fixture",
            "telegram_id": 200,
            "locale": "en",
            "notification_type": "CASE_UPDATED",
            "payload": {"case_id": 7},
        }
        with (
            patch("app.handlers.visas.settings.MINI_APP_URL", "https://app.example.invalid/"),
            patch(
                "app.services.visa_notifications.settle_visa_notification",
                AsyncMock(return_value=True),
            ) as settle,
        ):
            await deliver_visa_notification(bot, item)

        bot.send_message.assert_awaited_once()
        send_args = bot.send_message.await_args
        self.assertEqual(send_args.args[0], 200)
        self.assertNotIn("https://", send_args.args[1])
        self.assertIn("Personal Cabinet → My visas", send_args.args[1])
        button = send_args.kwargs["reply_markup"].inline_keyboard[0][0]
        self.assertEqual(button.web_app.url, "https://app.example.invalid/#/visas")
        settle.assert_awaited_once_with(12, {
            "lease_token": "lease-fixture",
            "state": "DELIVERED",
            "telegram_message_id": "77",
        })


class VisaCabinetBackendClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_english_client_reply_outcomes_are_fully_localized(self):
        state = AsyncMock()
        state.get_data.return_value = {"web_conversation_id": 7}
        message = AsyncMock()
        message.from_user.id = 200
        message.message_id = 9
        conversation = {"client": {"telegram_id": 200, "locale": "en"}}

        with patch("app.handlers.web_chat.get_web_conversation", AsyncMock(return_value=conversation)):
            message.text = None
            await save_client_web_reply(message, state)
            message.answer.assert_awaited_with("Please send a text message.")

        message.answer.reset_mock()
        message.text = "Fixture reply"
        with (
            patch("app.handlers.web_chat.get_web_conversation", AsyncMock(return_value=conversation)),
            patch("app.handlers.web_chat.send_web_client_message", AsyncMock(return_value=True)),
        ):
            await save_client_web_reply(message, state)
            message.answer.assert_awaited_with("✅ Reply sent to the manager.")

        message.answer.reset_mock()
        with (
            patch("app.handlers.web_chat.get_web_conversation", AsyncMock(return_value=conversation)),
            patch("app.handlers.web_chat.send_web_client_message", AsyncMock(return_value=False)),
        ):
            await save_client_web_reply(message, state)
            message.answer.assert_awaited_with("Could not send. Please try again.")

    async def test_staff_and_client_dialogue_posts_use_distinct_reachable_contracts(self):
        calls = []

        class Response:
            def raise_for_status(self):
                return None

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, url, *, json, headers):
                calls.append((url, json, headers))
                return Response()

        with (
            patch("app.services.backend_client.backend_sync_enabled", return_value=True),
            patch("app.services.backend_client.httpx.AsyncClient", return_value=Client()),
        ):
            self.assertTrue(await send_web_staff_message(7, actor_telegram_id=1, body="Manager", visibility="client"))
            self.assertTrue(await send_web_client_message(7, actor_telegram_id=2, body="Client", idempotency_key="telegram:2:9"))

        self.assertTrue(calls[0][0].endswith("/api/web/staff/conversations/7/messages"))
        self.assertEqual(calls[0][1]["visibility"], "client")
        self.assertTrue(calls[1][0].endswith("/api/web/staff/conversations/7/client-messages"))
        self.assertEqual(calls[1][1]["idempotency_key"], "telegram:2:9")

    async def test_get_user_visa_cases_calls_service_summary_endpoint(self):
        class Response:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self):
                return {"locale": "en", "items": []}

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, url, *, headers):
                self.url = url
                self.headers = headers
                return Response()

        with (
            patch("app.services.backend_client.backend_sync_enabled", return_value=True),
            patch("app.services.backend_client.httpx.AsyncClient", return_value=Client()),
        ):
            payload = await get_user_visa_cases(123)

        self.assertEqual(payload, {"locale": "en", "items": []})

    async def test_staff_client_message_delivers_once_with_reply_control(self):
        bot = AsyncMock()
        conversation = {"client": {"telegram_id": 200, "locale": "en"}, "messages": [{"id": 9, "author_type": "staff", "body": "Fixture update", "visibility": "client"}]}
        event = {"id": 11, "event_type": "web_staff_client_message", "aggregate_id": 7, "payload": {"message_id": 9}}
        with (
            patch("app.services.web_chat_bridge.get_web_conversation", AsyncMock(return_value=conversation)),
            patch("app.services.web_chat_bridge.mark_web_event_delivered", AsyncMock(return_value=True)) as delivered,
        ):
            await deliver_event(bot, event)
        bot.send_message.assert_awaited_once()
        self.assertEqual(bot.send_message.await_args.args[0], 200)
        self.assertIn("Message from", bot.send_message.await_args.args[1])
        delivered.assert_awaited_once_with(11, [200])
