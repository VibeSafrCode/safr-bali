from aiogram import Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import Message

from app.content.texts import get_text
from app.core.config import settings
from app.handlers.destinations import destinations_keyboard, show_start_destination
from app.handlers.menu import clear_user_context
from app.services.activity import track_activity
from app.services.referrals import (
    load_referrals,
    resolve_referrer_id,
    save_referrals,
)


router = Router()

def parse_referrer_id(command: CommandObject):
    return resolve_referrer_id(command.args)


async def notify_referrer(message: Message, referrer_id: int) -> None:
    if not message.from_user:
        return

    username = f"@{message.from_user.username}" if message.from_user.username else "username не указан"

    await message.bot.send_message(
        chat_id=referrer_id,
        text=(
            "🎉 К вашей сети подключился новый реферал!\n\n"
            f"Имя: {message.from_user.full_name}\n"
            f"Telegram ID: {message.from_user.id}\n"
            f"Username: {username}\n\n"
            "Бонусы будут начислены после целевого действия пользователя."
        ),
    )


async def attach_referral_if_needed(
    message: Message,
    explicit_referrer_id,
) -> None:
    if not message.from_user:
        return

    user_id = message.from_user.id

    # Если человек пришёл без реферальной ссылки,
    # автоматически закрепляем его под главным админом.
    # Для пользователя это выглядит как обычная чистая регистрация.
    silent_default_admin_referral = explicit_referrer_id is None
    referrer_id = explicit_referrer_id or settings.ADMIN_CHAT_ID

    # Главного админа не прикрепляем самого к себе.
    if user_id == settings.ADMIN_CHAT_ID and referrer_id == settings.ADMIN_CHAT_ID:
        return

    if referrer_id == user_id:
        await message.answer(
            "⚠️ Нельзя зарегистрироваться по собственной реферальной ссылке.",
        )
        return

    referrals = load_referrals()
    user_key = str(user_id)

    if user_key in referrals:
        current_referrer_id = int(referrals[user_key]["referrer_id"])

        if current_referrer_id == referrer_id:
            if not silent_default_admin_referral:
                await message.answer(
                    "✅ Вы уже подключены к этой реферальной сети.",
                )
            return

        if not silent_default_admin_referral:
            await message.answer(
                "⚠️ Вы уже закреплены в другой реферальной сети.\n\n"
                "Если это ошибка — напишите в техподдержку.",
            )
        return

    referrals[user_key] = {
        "user_id": user_id,
        "referrer_id": referrer_id,
        "source": "referral_link" if explicit_referrer_id else "default_main_admin",
        "silent": silent_default_admin_referral,
    }

    save_referrals(referrals)

    if not silent_default_admin_referral:
        await notify_referrer(message, referrer_id)
        await message.answer(
            "✅ Вы подключены к реферальной сети.",
        )


@router.message(CommandStart())
async def start_handler(message: Message, command: CommandObject):
    clear_user_context(message.from_user.id)

    await track_activity(message, "start", "Пользователь запустил бота")

    explicit_referrer_id = parse_referrer_id(command)
    await attach_referral_if_needed(message, explicit_referrer_id)

    if await show_start_destination(message, command.args):
        return

    text = get_text("global_start")

    await message.answer(
        text,
        reply_markup=destinations_keyboard(),
    )
