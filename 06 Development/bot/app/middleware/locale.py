from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

from app.services.locale import (
    reset_current_locale,
    resolve_user_locale,
    set_current_locale,
)
from app.services.i18n import canonical_button_text


class LocaleMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = data.get("event_from_user")
        if user is None:
            return await handler(event, data)
        locale = await resolve_user_locale(
            user.id,
            getattr(user, "language_code", None),
        )
        token = set_current_locale(locale)
        data["locale"] = locale
        original_text = getattr(event, "text", None)
        canonical_text = canonical_button_text(original_text)
        if canonical_text and canonical_text != original_text:
            object.__setattr__(event, "text", canonical_text)
        try:
            result = await handler(event, data)
            # This is metadata for an actual private interaction, not a scan
            # of canonical users or a second polling process.
            from app.services.messaging import contact
            await contact(event)
            return result
        finally:
            if canonical_text and canonical_text != original_text:
                object.__setattr__(event, "text", original_text)
            reset_current_locale(token)
