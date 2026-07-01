from aiogram import Bot, Router
from aiogram.filters import Command
from aiogram.types import Message

from app.core.config import settings

router = Router()


def is_staff_user(telegram_id: int) -> bool:
    return telegram_id in settings.staff_chat_ids


@router.message(Command("reply"))
async def reply_to_client_handler(message: Message, bot: Bot):
    if not message.from_user or not is_staff_user(message.from_user.id):
        await message.answer("⛔️ Эта команда доступна только админам и менеджерам.")
        return

    if not message.text:
        await message.answer("Нужно написать: /reply TELEGRAM_ID текст ответа")
        return

    parts = message.text.split(maxsplit=2)

    if len(parts) < 3:
        await message.answer(
            "Неверный формат.\n\n"
            "Используйте так:\n"
            "/reply TELEGRAM_ID текст ответа\n\n"
            "Например:\n"
            "/reply 123456789 Добрый день! Чем могу помочь?"
        )
        return

    _, client_id_raw, reply_text = parts

    try:
        client_chat_id = int(client_id_raw)
    except ValueError:
        await message.answer("Telegram ID клиента должен быть числом.")
        return

    try:
        await bot.send_message(
            chat_id=client_chat_id,
            text=(
                "💬 Ответ от команды SAFR Bali:\n\n"
                f"{reply_text}"
            ),
        )

        await message.answer(
            "✅ Ответ отправлен клиенту.\n\n"
            f"Клиент ID: {client_chat_id}"
        )

    except Exception as error:
        await message.answer(
            "❌ Не получилось отправить сообщение клиенту.\n\n"
            "Возможные причины:\n"
            "— клиент ещё не нажимал /start в боте\n"
            "— клиент заблокировал бота\n"
            "— неверный Telegram ID\n\n"
            f"Техническая ошибка: {error}"
        )
