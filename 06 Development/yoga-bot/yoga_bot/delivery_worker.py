"""Only Yoga-principal deliveries; no main token, bridge or staff controls."""
import asyncio
from datetime import datetime, timezone
import html
import logging

from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError, TelegramRetryAfter, TelegramUnauthorizedError

from .api_client import BackendUnavailable
from .config import RuntimeConfigError

LOG = logging.getLogger("yoga_runtime")


def delivery_text(delivery, locale="ru"):
    # Preserve the full canonical body. Cap only the display marker so the
    # parsed text, including the observer warning, remains within 4096 chars.
    if delivery.recipient_role == "observer":
        warning = ("Read-only; your reply creates a new request" if locale == "en" else
                   "Только просмотр; ваш ответ создаёт новую заявку")
        kinds = {"client": "Question", "staff": "Reply"} if locale == "en" else {"client": "Вопрос", "staff": "Ответ"}
        kind = kinds.get(delivery.author_type, "")
        reference = (kind + " " if kind else "") + "#" + str(delivery.conversation_id)
        suffix = "\n" + reference + "\n" + warning
        marker_limit = min(92, 4096 - len(delivery.body) - len(suffix) - 2)
        heading = delivery.marker[:marker_limit] + suffix
    else:
        heading = "SAFRWAY · Ответ / Reply"
    return html.escape(heading) + "\n\n" + html.escape(delivery.body)


async def deliver_one(bot, client, delivery, *, now=None, sleeper=asyncio.sleep, locale="ru"):
    current = now or datetime.now(timezone.utc)
    if (delivery.expires() - current).total_seconds() < 25:
        # No Telegram call has begun: proven pre-send, or stale lease handled by
        # the canonical settle endpoint. Never send after the lease deadline.
        return await client.settle(delivery, "RETRY", "transport_unavailable_before_send")
    try:
        sent = await asyncio.wait_for(bot.send_message(delivery.recipient_id, delivery_text(delivery, locale),
                                    parse_mode="HTML", request_timeout=10), timeout=12)
    except TelegramRetryAfter as error:
        cancelled = False
        try:
            result = await client.settle(delivery, "RETRY", "rate_limited_before_send")
        except asyncio.CancelledError:
            cancelled = True
            raise
        finally:
            # A lost backend receipt must not bypass Telegram's cooldown and
            # immediately send a different claimed target. Shutdown sends no
            # new target, so cancellation must remain prompt.
            if not cancelled:
                await sleeper(max(1, error.retry_after))
        # The backend owns bounded retry attempts; this sole Yoga sender also
        # honors Telegram's longer cooldown before making another send.
        return result
    except TelegramForbiddenError:
        return await client.settle(delivery, "FAILED", "recipient_blocked")
    except TelegramUnauthorizedError:
        try:
            # Authorization rejected the whole send before delivery; preserve
            # the valid recipient for retry after the operator fixes the token.
            await client.settle(delivery, "RETRY", "transport_unavailable_before_send")
        finally:
            raise RuntimeConfigError("telegram_authorization_failed") from None
    except TelegramBadRequest:
        return await client.settle(delivery, "FAILED", "invalid_recipient")
    except Exception:
        # Even a network exception may occur after the send was accepted.
        # Do not classify generic connection errors as proven no-send.
        return await client.settle(delivery, "UNKNOWN", "send_outcome_unknown")
    if type(sent.message_id) is not int or sent.message_id <= 0:
        return await client.settle(delivery, "UNKNOWN", "send_outcome_unknown")
    # Recovery retries only this idempotent receipt, never Telegram send again.
    return await client.settle(delivery, "DELIVERED", telegram_message_id=sent.message_id)


async def run_deliveries(bot, client, intake_state=None, sleeper=asyncio.sleep):
    while True:
        try:
            for delivery in await client.claim():
                locale = intake_state.context(delivery.recipient_id, "ru")["locale"] if intake_state else "ru"
                result = await deliver_one(bot, client, delivery, sleeper=sleeper, locale=locale)
                LOG.info("yoga_delivery_" + result.status.lower())
        except BackendUnavailable:
            # A lost claim/settle response remains leased then UNKNOWN server-
            # side. A new loop never resends the already attempted target.
            LOG.warning("yoga_delivery_backend_unavailable")
        await sleeper(3)
