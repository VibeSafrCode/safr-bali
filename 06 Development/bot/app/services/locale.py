from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Literal

from app.services.backend_client import get_user_locale


LocaleCode = Literal["ru", "en"]
DEFAULT_LOCALE: LocaleCode = "ru"
_current_locale: ContextVar[LocaleCode] = ContextVar(
    "safr_bot_locale",
    default=DEFAULT_LOCALE,
)


def normalize_locale(value: str | None) -> LocaleCode:
    normalized = (value or "").strip().lower().replace("_", "-")
    primary = normalized.split("-", 1)[0]
    return "en" if primary == "en" else "ru"


async def resolve_user_locale(
    telegram_id: int,
    telegram_language_code: str | None,
) -> LocaleCode:
    saved = await get_user_locale(telegram_id)
    return normalize_locale(saved or telegram_language_code)


def set_current_locale(locale: LocaleCode) -> Token[LocaleCode]:
    return _current_locale.set(locale)


def reset_current_locale(token: Token[LocaleCode]) -> None:
    _current_locale.reset(token)


def current_locale() -> LocaleCode:
    return _current_locale.get()
