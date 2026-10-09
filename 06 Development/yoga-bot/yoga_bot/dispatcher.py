"""Polling errors are observable without logging Telegram exception contents."""
import asyncio
import logging
from dataclasses import dataclass

from aiogram import Dispatcher
from aiogram.exceptions import TelegramConflictError, TelegramNetworkError, TelegramRetryAfter, TelegramServerError, TelegramUnauthorizedError
from aiogram.methods import GetUpdates
from aiogram.utils.backoff import Backoff, BackoffConfig

from .config import RuntimeConfigError, RuntimeTransportError

LOG = logging.getLogger("yoga_runtime")


@dataclass(frozen=True)
class UnacceptedUpdate:
    fatal: bool = False


class IsolatedDispatcher(Dispatcher):
    async def _process_update(self, bot, update, call_answer=True, **kwargs):
        # aiogram's normal implementation swallows handler exceptions and
        # continues to the next offset. Intake must stop before confirming an
        # update whose canonical commit has not been acknowledged.
        try:
            result = await self.feed_update(bot, update, **kwargs)
        except Exception:
            raise RuntimeTransportError("update_not_accepted") from None
        if isinstance(result, UnacceptedUpdate):
            if result.fatal:
                raise RuntimeConfigError("intake_requires_operator_review")
            raise RuntimeTransportError("intake_not_accepted")
        return True

    @classmethod
    async def _listen_updates(cls, bot, polling_timeout=20, backoff_config=None, allowed_updates=None):
        # aiogram 3.13.1 retries every exception, including a second poller's
        # ownership conflict. This narrow override makes conflicts fatal.
        backoff = Backoff(config=backoff_config or BackoffConfig(min_delay=1, max_delay=5, factor=1.3, jitter=0.1))
        request = GetUpdates(timeout=polling_timeout, allowed_updates=allowed_updates)
        failures = 0
        while True:
            try:
                updates = await bot(request, request_timeout=int((bot.session.timeout or 30) + polling_timeout))
            except TelegramConflictError:
                raise RuntimeConfigError("telegram_polling_owner_conflict") from None
            except TelegramUnauthorizedError:
                raise RuntimeConfigError("telegram_authorization_failed") from None
            except TelegramRetryAfter as error:
                if not 0 < error.retry_after <= 60:
                    raise RuntimeConfigError("telegram_retry_requires_review") from None
                LOG.warning("telegram_retry_after")
                await asyncio.sleep(error.retry_after)
                continue
            except (TelegramNetworkError, TelegramServerError, TimeoutError):
                failures += 1
                if failures >= 8:
                    raise RuntimeTransportError("telegram_transport_unavailable") from None
                LOG.warning("telegram_transport_retry")
                await backoff.asleep()
                continue
            except Exception:
                raise RuntimeConfigError("telegram_polling_failed") from None
            if failures:
                LOG.info("telegram_transport_restored")
                failures = 0
                backoff.reset()
            for update in updates:
                yield update
                request.offset = update.update_id + 1
