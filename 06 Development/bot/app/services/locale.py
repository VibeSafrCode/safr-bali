from __future__ import annotations

import asyncio
from collections import OrderedDict
from contextvars import ContextVar, Token
from dataclasses import dataclass
from time import monotonic
from typing import Literal

from app.services.backend_client import get_user_locale


LocaleCode = Literal["ru", "en"]
DEFAULT_LOCALE: LocaleCode = "ru"
LOCALE_LOOKUP_TIMEOUT_SECONDS = 0.75
LOCALE_CACHE_TTL_SECONDS = 60.0
LOCALE_FAILURE_RETRY_SECONDS = 2.0
LOCALE_CACHE_MAX_ENTRIES = 2048


@dataclass(frozen=True)
class _CachedLocale:
    locale: LocaleCode | None
    expires_at: float


# Bound both memory and how long changes made outside the bot remain unseen.
# A missing backend value has a short retry window, not the confirmed-value TTL.
_locale_cache: OrderedDict[int, _CachedLocale] = OrderedDict()
_current_locale: ContextVar[LocaleCode] = ContextVar(
    "safr_bot_locale",
    default=DEFAULT_LOCALE,
)


def normalize_locale(value: str | None) -> LocaleCode:
    normalized = (value or "").strip().lower().replace("_", "-")
    primary = normalized.split("-", 1)[0]
    return "en" if primary == "en" else "ru"


def _cache_locale(telegram_id: int, locale: LocaleCode | None) -> None:
    ttl = LOCALE_CACHE_TTL_SECONDS if locale else LOCALE_FAILURE_RETRY_SECONDS
    _locale_cache[telegram_id] = _CachedLocale(locale, monotonic() + ttl)
    _locale_cache.move_to_end(telegram_id)
    while len(_locale_cache) > LOCALE_CACHE_MAX_ENTRIES:
        _locale_cache.popitem(last=False)


def cache_user_locale(telegram_id: int, locale: LocaleCode) -> None:
    """Apply a successfully persisted language choice to the next bot update."""
    _cache_locale(telegram_id, normalize_locale(locale))


async def resolve_user_locale(
    telegram_id: int,
    telegram_language_code: str | None,
) -> LocaleCode:
    fallback = normalize_locale(telegram_language_code)
    cached = _locale_cache.get(telegram_id)
    if cached is not None and cached.expires_at > monotonic():
        _locale_cache.move_to_end(telegram_id)
        return cached.locale or fallback

    try:
        # Await cancellation of this lookup: no detached work may change a later
        # update's locale, and backend downtime must not stall every callback.
        saved = await asyncio.wait_for(
            get_user_locale(telegram_id),
            timeout=LOCALE_LOOKUP_TIMEOUT_SECONDS,
        )
    except Exception:
        saved = None

    # A language selection may have completed while the lookup was in flight.
    # Keep that confirmed value instead of replacing it with an older response.
    latest = _locale_cache.get(telegram_id)
    if (
        latest is not None
        and latest is not cached
        and latest.locale is not None
        and latest.expires_at > monotonic()
    ):
        _locale_cache.move_to_end(telegram_id)
        return latest.locale

    locale: LocaleCode | None = saved if saved in {"ru", "en"} else None
    _cache_locale(telegram_id, locale)
    return locale or fallback


def set_current_locale(locale: LocaleCode) -> Token[LocaleCode]:
    return _current_locale.set(locale)


def reset_current_locale(token: Token[LocaleCode]) -> None:
    _current_locale.reset(token)


def current_locale() -> LocaleCode:
    return _current_locale.get()
