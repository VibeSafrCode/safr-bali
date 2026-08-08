from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.handlers import admin_panel, fallback


class TelegramAdminMvpTests(unittest.IsolatedAsyncioTestCase):
    async def test_four_admin_controls_open_exact_secure_routes(self):
        cases = [
            (admin_panel.orders_admin_handler, "/admin/orders/"),
            (admin_panel.visa_admin_handler, "/admin/queues/visa/"),
            (admin_panel.housing_admin_handler, "/admin/queues/housing/"),
            (admin_panel.settings_admin_handler, "/admin/settings/"),
        ]
        fake_settings = SimpleNamespace(
            ADMIN_CHAT_ID=1,
            MINI_APP_URL="https://app.safrway.online/",
            visa_staff_chat_ids=[1],
            staff_chat_ids=[1],
        )
        for handler, expected_path in cases:
            message = SimpleNamespace(
                from_user=SimpleNamespace(id=1),
                answer=AsyncMock(),
            )
            with patch.object(admin_panel, "settings", fake_settings):
                await handler(message)
            markup = message.answer.await_args.kwargs["reply_markup"]
            self.assertEqual(
                markup.inline_keyboard[0][0].url,
                f"https://app.safrway.online{expected_path}",
            )

    async def test_admin_control_denies_non_admin(self):
        message = SimpleNamespace(
            from_user=SimpleNamespace(id=2),
            answer=AsyncMock(),
        )
        with patch.object(
            admin_panel,
            "settings",
            SimpleNamespace(ADMIN_CHAT_ID=1, MINI_APP_URL="https://app.safrway.online"),
        ):
            await admin_panel.orders_admin_handler(message)
        self.assertEqual(message.answer.await_args.args[0], "⛔️ Доступ запрещён.")

    async def test_unknown_callback_is_acknowledged_with_fallback(self):
        callback = SimpleNamespace(
            answer=AsyncMock(),
            message=SimpleNamespace(answer=AsyncMock()),
        )
        await fallback.stale_callback_handler(callback)
        callback.answer.assert_awaited_once()
        callback.message.answer.assert_awaited_once()

    def test_every_admin_keyboard_control_has_a_handler_contract(self):
        expected = {
            "📊 Заявки",
            "📣 Рупор",
            "🛂 Визовые вопросы",
            "🏡 Вопросы по жилью",
            "🌐 Реферальная сеть",
            "👀 Наблюдение за ботом",
            "👥 Новые пользователи",
            "📜 Последние действия",
            "⚙️ Настройки",
            "📋 Выйти в меню",
        }
        actual = {
            button.text
            for row in admin_panel.admin_keyboard().keyboard
            for button in row
        }
        self.assertEqual(actual, expected)
        handlers = Path(admin_panel.__file__).parent
        source = "".join(
            (handlers / filename).read_text(encoding="utf-8")
            for filename in ("admin_panel.py", "broadcast.py", "menu.py")
        )
        for label in expected:
            self.assertGreaterEqual(source.count(label), 2, label)


if __name__ == "__main__":
    unittest.main()
