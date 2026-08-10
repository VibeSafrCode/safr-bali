import logging
from datetime import datetime, timezone

from aiogram import Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import Message

from app.core.config import settings
from app.handlers.destinations import destinations_keyboard, show_start_destination
from app.handlers.menu import clear_user_context
from app.services.activity import track_activity
from app.services.backend_client import sync_user_registration
from app.services.referrals import (
    load_referrals,
    format_profile,
    get_user_profile,
    get_or_create_referral_code,
    resolve_referrer_id,
    save_referrals,
)
from app.services.i18n import text as i18n_text
from app.services.locale import resolve_user_locale


router = Router()
logger = logging.getLogger(__name__)

def parse_referrer_id(command: CommandObject):
    return resolve_referrer_id(command.args)


async def notify_referrer(message: Message, referrer_id: int) -> None:
    if not message.from_user:
        return

    username = f"@{message.from_user.username}" if message.from_user.username else "username не указан"
    referrer_locale = await resolve_user_locale(referrer_id, None)

    await message.bot.send_message(
        chat_id=referrer_id,
        text=i18n_text(
            "referral.notification.newReferral",
            locale=referrer_locale,
            variables={
                "full_name": message.from_user.full_name,
                "telegram_id": message.from_user.id,
                "username": username,
            },
        ),
    )


async def notify_admin_about_registration(
    message: Message,
    referrer_id: int,
    source: str,
) -> None:
    if not message.from_user:
        return
    user_profile = {
        "telegram_id": message.from_user.id,
        "full_name": message.from_user.full_name,
        "username": message.from_user.username,
    }
    referrer_profile = get_user_profile(referrer_id)
    source_text = (
        "без реферальной ссылки — закреплён за главным админом"
        if source == "default_main_admin"
        else "персональная ссылка"
    )
    await message.bot.send_message(
        chat_id=settings.ADMIN_CHAT_ID,
        text=(
            "👤 Новый пользователь в боте\n\n"
            f"Пользователь: {format_profile(user_profile)}\n"
            f"Источник: {source_text}\n"
            f"Пригласил: {format_profile(referrer_profile, referrer_id)}"
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
            i18n_text("referral.registration.self"),
        )
        referrer_id = settings.ADMIN_CHAT_ID
        silent_default_admin_referral = True
        if referrer_id == user_id:
            return

    referrals = load_referrals()
    user_key = str(user_id)

    if user_key in referrals:
        current_referrer_id = int(referrals[user_key]["referrer_id"])

        if current_referrer_id == referrer_id:
            if not silent_default_admin_referral:
                await message.answer(
                    i18n_text("referral.registration.alreadySame"),
                )
            return

        if not silent_default_admin_referral:
            await message.answer(
                i18n_text("referral.registration.alreadyOther"),
            )
        return

    referrals[user_key] = {
        "user_id": user_id,
        "referrer_id": referrer_id,
        "source": "referral_link" if explicit_referrer_id else "default_main_admin",
        "silent": silent_default_admin_referral,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    save_referrals(referrals)

    source = referrals[user_key]["source"]
    try:
        await notify_admin_about_registration(message, referrer_id, source)
    except Exception:
        logger.exception("Could not notify main admin about new user %s", user_id)

    if not silent_default_admin_referral and referrer_id != settings.ADMIN_CHAT_ID:
        try:
            await notify_referrer(message, referrer_id)
        except Exception:
            logger.exception("Could not notify referrer %s about user %s", referrer_id, user_id)

    if not silent_default_admin_referral:
        await message.answer(
            i18n_text("referral.registration.connected"),
        )


@router.message(CommandStart())
async def start_handler(message: Message, command: CommandObject):
    clear_user_context(message.from_user.id)

    await track_activity(message, "start", "Пользователь запустил бота")

    explicit_referrer_id = parse_referrer_id(command)
    raw_referral_code = (
        command.args
        if command.args and explicit_referrer_id is None
        else None
    )
    synced = await sync_user_registration(
        telegram_id=message.from_user.id,
        username=getattr(message.from_user, "username", None),
        first_name=getattr(message.from_user, "first_name", None),
        last_name=getattr(message.from_user, "last_name", None),
        language=getattr(message.from_user, "language_code", None),
        invited_by_telegram_id=explicit_referrer_id,
        invited_by_ref_code=raw_referral_code,
        referral_code=get_or_create_referral_code(message.from_user.id),
    )
    if synced:
        await attach_referral_if_needed(message, explicit_referrer_id)
    else:
        logger.error(
            "Referral mirror not persisted locally because canonical backend sync failed for %s",
            message.from_user.id,
        )

    if await show_start_destination(message, command.args):
        return

    await message.answer(
        i18n_text("text.globalStart"),
        reply_markup=destinations_keyboard(),
    )
