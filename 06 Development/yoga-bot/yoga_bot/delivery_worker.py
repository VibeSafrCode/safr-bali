"""Only Yoga-principal deliveries; no main token, bridge or staff controls."""
import asyncio
from datetime import datetime, timezone
import html
import logging

from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError, TelegramRetryAfter, TelegramUnauthorizedError

from .api_client import BackendUnavailable, BackendContractError
from .config import RuntimeConfigError

LOG = logging.getLogger("yoga_runtime")


def delivery_text(delivery, locale="ru"):
    # Preserve the full canonical body. Cap only the display marker so the
    # parsed text, including the observer warning, remains within 4096 chars.
    if delivery.recipient_role == "observer":
        if getattr(delivery, 'initial_intake', False) is not True or delivery.author_type != 'client':
            raise BackendContractError('partner_initial_intake_required')
        warning = ("Initial inquiry only; the team manages the conversation" if locale == "en" else
                   "Только первичная заявка; переписку ведёт команда")
        reference = ("Inquiry #" if locale == "en" else "Заявка №") + str(delivery.conversation_id)
        suffix = "\n" + reference + "\n" + warning
        marker_limit = min(92, 4096 - len(delivery.body) - len(suffix) - 2)
        heading = delivery.topic_label[:max(0, marker_limit)] + suffix
    else:
        heading = "Reply from the team" if locale == "en" else "Ответ команды"
    return html.escape(heading) + "\n\n" + html.escape(delivery.body)


async def deliver_one(bot, client, delivery, *, now=None, sleeper=asyncio.sleep, locale="ru", cooldown=None):
    try:
        rendered = delivery_text(delivery, locale)
    except BackendContractError:
        return await client.settle(delivery, "FAILED", "invalid_recipient")
    current = now or datetime.now(timezone.utc)
    if (delivery.expires() - current).total_seconds() < 25:
        # No Telegram call has begun: proven pre-send, or stale lease handled by
        # the canonical settle endpoint. Never send after the lease deadline.
        return await client.settle(delivery, "RETRY", "transport_unavailable_before_send")
    try:
        sent = await asyncio.wait_for(bot.send_message(delivery.recipient_id, rendered,
                                    parse_mode="HTML", request_timeout=10), timeout=12)
    except TelegramRetryAfter as error:
        if cooldown is not None:
            cooldown.postpone(max(1, error.retry_after))
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


async def run_deliveries(bot, client, intake_state=None, sleeper=asyncio.sleep, messaging=None):
    while True:
        try:
            if messaging is not None:
                await messaging.iteration()
                if not messaging.can_send():
                    await sleeper(3)
                    continue
            for delivery in await client.claim():
                if messaging is not None and not messaging.can_send():
                    break
                locale = intake_state.context(delivery.recipient_id, "ru")["locale"] if intake_state else "ru"
                result = await deliver_one(bot, client, delivery, sleeper=sleeper, locale=locale, cooldown=messaging)
                LOG.info("yoga_delivery_" + result.status.lower())
        except BackendUnavailable:
            # A lost claim/settle response remains leased then UNKNOWN server-
            # side. A new loop never resends the already attempted target.
            LOG.warning("yoga_delivery_backend_unavailable")
        await sleeper(3)
