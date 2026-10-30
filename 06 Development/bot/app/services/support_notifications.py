"""Support deliveries never modify staff lists or client assignments."""
import asyncio
import logging

from aiogram.types import InlineKeyboardMarkup

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_support_copies(bot, text: str, *, exclude=(), source_message=None,
                              client_reply_markup: InlineKeyboardMarkup | None = None,
                              responders_only: bool = False) -> None:
    async def send(recipient: int) -> None:
        try:
            keyboard = client_reply_markup if recipient in settings.support_reply_chat_ids else None
            await bot.send_message(chat_id=recipient, text=text, reply_markup=keyboard, request_timeout=10)
            if source_message is not None and source_message.voice:
                await bot.copy_message(chat_id=recipient, from_chat_id=source_message.chat.id,
                                       message_id=source_message.message_id, request_timeout=10)
        except Exception as exc:
            # Do not log message bodies or Telegram request URLs/tokens.
            logger.error("Support notification copy failed recipient=%s error=%s", recipient, type(exc).__name__)

    recipients = settings.support_chat_ids
    if client_reply_markup is not None:
        recipients = list(dict.fromkeys([settings.ADMIN_CHAT_ID, *recipients]))
    if responders_only:
        recipients = [recipient for recipient in recipients
                      if recipient == settings.ADMIN_CHAT_ID or recipient in settings.support_reply_chat_ids]
    await asyncio.gather(*(send(recipient) for recipient in recipients if recipient not in exclude))


async def notify_operations(bot, text: str, *, reply_markup: InlineKeyboardMarkup | None = None,
                            client_reply_markup: InlineKeyboardMarkup | None = None,
                            responders_only: bool = False) -> None:
    try:
        await bot.send_message(chat_id=settings.ADMIN_CHAT_ID, text=text, reply_markup=reply_markup)
    finally:
        # Observer copies must not acquire reply controls or client assignment.
        await send_support_copies(bot, text, exclude=[settings.ADMIN_CHAT_ID],
                                  client_reply_markup=client_reply_markup, responders_only=responders_only)
