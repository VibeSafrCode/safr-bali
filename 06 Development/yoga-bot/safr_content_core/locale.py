from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Literal

LocaleCode = Literal["ru", "en"]
DEFAULT_LOCALE: LocaleCode = "ru"

_current_locale: ContextVar[LocaleCode] = ContextVar(
    "safr_bot_locale",
    default=DEFAULT_LOCALE,
)


def set_current_locale(locale: LocaleCode) -> Token[LocaleCode]:
    return _current_locale.set(locale)


def reset_current_locale(token: Token[LocaleCode]) -> None:
    _current_locale.reset(token)


def current_locale() -> LocaleCode:
    return _current_locale.get()
