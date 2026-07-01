import json
from pathlib import Path
from typing import Optional

from aiogram import Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import Message

from app.content.texts import get_text
from app.keyboards.main_menu import main_menu_keyboard
from app.handlers.menu import clear_user_context

router = Router()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
REFERRALS_PATH = DATA_DIR / "referrals.json"


def load_referrals() -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not REFERRALS_PATH.exists():
        return {}

    with REFERRALS_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_referrals(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with REFERRALS_PATH.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def process_referral_start(user_id: int, referrer_id: str) -> tuple[str, bool, Optional[str]]:
    referrals = load_referrals()

    user_key = str(user_id)
    referrer_key = str(referrer_id)

    if user_key == referrer_key:
        return (
            "⚠️ Вы перешли по собственной реферальной ссылке.\n"
            "Такая привязка не засчитывается.",
            False,
            None,
        )

    if user_key not in referrals:
        referrals[user_key] = {
            "referrer_id": referrer_key
        }
        save_referrals(referrals)

        return (
            "🔗 Вы пришли по реферальной ссылке.\n"
            "Мы закрепили вас в сети пригласившего пользователя.",
            True,
            referrer_key,
        )

    current_referrer_id = referrals[user_key].get("referrer_id")

    if current_referrer_id == referrer_key:
        return (
            "🔗 Вы уже подключены к этой реферальной сети.",
            False,
            None,
        )

    return (
        "⚠️ Вы уже подключены к сети по другой реферальной ссылке.\n\n"
        "Перерегистрация по новой ссылке невозможна.\n"
        "Если произошла ошибка, напишите в тех. поддержку в личном кабинете.",
        False,
        None,
    )


@router.message(CommandStart())
async def start_handler(message: Message, command: CommandObject):
    clear_user_context(message.from_user.id)

    text = get_text("start")

    if command.args and command.args.startswith("ref_"):
        referrer_id = command.args.replace("ref_", "", 1)

        referral_text, is_new_referral, referrer_to_notify = process_referral_start(
            user_id=message.from_user.id,
            referrer_id=referrer_id,
        )

        text = text + "\n\n" + referral_text

        if is_new_referral and referrer_to_notify:
            new_user = message.from_user
            username = f"@{new_user.username}" if new_user.username else "username не указан"

            referrer_message = (
                "🎉 К вашей сети подключился новый реферал!\n\n"
                f"Пользователь: {new_user.full_name}\n"
                f"Telegram ID: {new_user.id}\n"
                f"Username: {username}\n\n"
                "Бонусы SAFR Points будут начислены после подтверждения целевого действия: "
                "заявки, оплаты или другой активности по правилам проекта."
            )

            try:
                await message.bot.send_message(
                    chat_id=int(referrer_to_notify),
                    text=referrer_message,
                )
            except Exception as error:
                print(f"Could not notify referrer {referrer_to_notify}: {error}")

    await message.answer(
        text,
        reply_markup=main_menu_keyboard(),
    )
