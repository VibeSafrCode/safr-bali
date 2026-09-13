"""Notification copies only: never modify staff lists, assignments or ACLs."""
import asyncio
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_support_copies(bot, text: str, *, exclude=(), source_message=None) -> None:
    async def send(recipient: int) -> None:
        try:
            await bot.send_message(chat_id=recipient, text=text, request_timeout=10)
            if source_message is not None and source_message.voice:
                await bot.copy_message(chat_id=recipient, from_chat_id=source_message.chat.id,
                                       message_id=source_message.message_id, request_timeout=10)
        except Exception as exc:
            # Do not log message bodies or Telegram request URLs/tokens.
            logger.error("Support notification copy failed recipient=%s error=%s", recipient, type(exc).__name__)

    await asyncio.gather(*(send(recipient) for recipient in settings.support_chat_ids if recipient not in exclude))


async def notify_operations(bot, text: str) -> None:
    try:
        await bot.send_message(chat_id=settings.ADMIN_CHAT_ID, text=text)
    finally:
        await send_support_copies(bot, text, exclude=[settings.ADMIN_CHAT_ID])
