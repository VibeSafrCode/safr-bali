from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from app.services.backend_client import update_user_locale
from app.services.i18n import text
from app.services.locale import LocaleCode


router = Router()


def language_name(locale: LocaleCode) -> str:
    return text(f"language.option.{locale}", locale=locale)


def language_keyboard(locale: LocaleCode) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=text("language.option.ru", locale=locale),
                    callback_data="locale:set:ru",
                ),
                InlineKeyboardButton(
                    text=text("language.option.en", locale=locale),
                    callback_data="locale:set:en",
                ),
            ]
        ]
    )


async def show_language(message: Message, locale: LocaleCode) -> None:
    await message.answer(
        text(
            "language.prompt",
            locale=locale,
            variables={"language": language_name(locale)},
        ),
        reply_markup=language_keyboard(locale),
    )


@router.message(Command("language"))
async def language_command(message: Message, locale: LocaleCode) -> None:
    await show_language(message, locale)


@router.callback_query(F.data.startswith("locale:set:"))
async def set_language(callback: CallbackQuery, locale: LocaleCode) -> None:
    requested = (callback.data or "").removeprefix("locale:set:")
    if requested not in {"ru", "en"} or not callback.from_user:
        await callback.answer()
        return
    next_locale: LocaleCode = requested  # type: ignore[assignment]
    if next_locale == locale:
        await callback.answer(
            text(
                "language.saved",
                locale=locale,
                variables={"language": language_name(locale)},
            ),
        )
        return

    await callback.answer(text("language.saving", locale=locale))
    saved = await update_user_locale(callback.from_user.id, next_locale)
    if not saved:
        if callback.message:
            await callback.message.answer(
                text("language.failed", locale=locale),
                reply_markup=language_keyboard(locale),
            )
        return

    if callback.message:
        await callback.message.answer(
            "\n".join(
                [
                    text(
                        "language.saved",
                        locale=next_locale,
                        variables={"language": language_name(next_locale)},
                    ),
                    text("language.pendingSync", locale=next_locale),
                ]
            ),
            reply_markup=language_keyboard(next_locale),
        )
