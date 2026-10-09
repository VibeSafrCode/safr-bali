"""Main-bot transport only; canonical Yoga intake lives in the backend."""
import asyncio
import logging
from datetime import datetime, timezone

import httpx
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError, TelegramRetryAfter

from app.core.config import settings
from app.services.backend_client import backend_sync_enabled
from app.services.web_chat_bridge import web_thread_keyboard

logger = logging.getLogger(__name__)


async def channel_request(path, payload):
    if not backend_sync_enabled():
        return None
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5, connect=2), follow_redirects=False, trust_env=False) as client:
            response = await client.post(settings.BACKEND_API_URL.rstrip('/') + '/api/yoga-channel' + path,
                json=payload, headers={'X-Service-Token': settings.BACKEND_SERVICE_TOKEN})
            if response.status_code in {401, 403, 429, 503}:
                return None
            response.raise_for_status()
            if len(response.content) > 100_000:
                return None
            return response.json()
    except Exception:
        # No URL, token, recipient, message body, raw exception or traceback.
        logger.warning('yoga_main_backend_unavailable')
        return None


def staff_notice(item):
    role = item.get('recipient_role')
    staff = role == 'staff' and item.get('observer_read_only') is False
    observer = role == 'observer' and item.get('observer_read_only') is True
    allowed_ids = settings.all_staff_chat_ids if staff else settings.support_chat_ids
    if (item.get('brand') != 'Yoga Ganster' or not (staff or observer)
            or type(item.get('recipient_id')) is not int
            or item['recipient_id'] not in allowed_ids
            or (observer and item['recipient_id'] in settings.all_staff_chat_ids)
            or type(item.get('conversation_id')) is not int or item['conversation_id'] <= 0
            or type(item.get('message_id')) is not int or item['message_id'] <= 0
            or not isinstance(item.get('body'), str) or not 0 < len(item['body']) <= 4000
            or not isinstance(item.get('topic_label'), str)):
        raise ValueError('invalid_yoga_main_delivery')
    marker = 'Yoga Ganster · ' + item['topic_label']
    # Plain text avoids HTML expansion and preserves Telegram's 4096 limit.
    prefix = ('📋 ' if observer else '🧘 ') + marker[:70] + '\n\n'
    return prefix + item['body'], (web_thread_keyboard(item['conversation_id'],
        allow_client_reply=item.get('allow_client_reply') is True) if staff else None)


async def deliver_one(bot, item):
    outcome, code, telegram_id = 'FAILED', 'invalid_recipient', None
    cooldown = 0
    try:
        text, keyboard = staff_notice(item)
    except (ValueError, TypeError):
        pass
    else:
        try:
            expires = datetime.fromisoformat(item['lease_expires_at'].replace('Z', '+00:00'))
            if expires.tzinfo is None: expires = expires.replace(tzinfo=timezone.utc)
            if (expires - datetime.now(timezone.utc)).total_seconds() < 25:
                # No send has begun; an expired lease is resolved by the server.
                outcome, code = 'RETRY', 'transport_unavailable_before_send'
                text = None
        except (ValueError, TypeError, KeyError):
            text = None
        if text is not None:
            try:
                result = await asyncio.wait_for(bot.send_message(item['recipient_id'], text,
                    reply_markup=keyboard, parse_mode=None), timeout=15)
                if type(result.message_id) is not int or result.message_id <= 0:
                    raise ValueError('invalid_telegram_receipt')
                outcome, code, telegram_id = 'DELIVERED', None, result.message_id
            except TelegramRetryAfter as error:
                outcome, code = 'RETRY', 'rate_limited_before_send'
                cooldown = max(1, error.retry_after)
            except TelegramForbiddenError:
                outcome, code = 'FAILED', 'recipient_blocked'
            except TelegramBadRequest:
                outcome, code = 'FAILED', 'invalid_recipient'
            except Exception:
                # A send may have reached Telegram: never retry an ambiguous send.
                outcome, code = 'UNKNOWN', 'send_outcome_unknown'
    try:
        return await settle_one(item, outcome, code, telegram_id)
    finally:
        # A lost settlement must not bypass the provider's cooldown and send
        # another target immediately. Cancellation still stops this worker.
        if cooldown:
            await asyncio.sleep(cooldown)


async def settle_one(item, outcome, code, telegram_id):
    payload = {'lease_token': item['lease_token'], 'outcome': outcome,
               'error_code': code, 'telegram_message_id': telegram_id}
    allowed = {'DELIVERED': {'DELIVERED', 'UNKNOWN'}, 'RETRY': {'RETRY', 'FAILED', 'UNKNOWN'},
               'UNKNOWN': {'UNKNOWN'}, 'FAILED': {'FAILED', 'UNKNOWN'}}
    for attempt in range(3):
        result = await channel_request(f"/deliveries/{item['id']}/settle", payload)
        if (isinstance(result, dict) and result.get('id') == item['id']
                and result.get('status') in allowed.get(outcome, set())):
            return result['status']
        if attempt < 2:
            await asyncio.sleep(1)
    # Stop this tick, retain backend lease. Its expiry is UNKNOWN, not resend.
    logger.warning('yoga_main_settlement_unconfirmed')
    return None


async def run_bridge(bot):
    while True:
        try:
            rows = (await channel_request('/deliveries/claim', {'limit': 1})
                    if settings.YOGA_CHANNEL_ENABLED else None)
            if isinstance(rows, list) and len(rows) == 1:
                await deliver_one(bot, rows[0])
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning('yoga_main_bridge_failed')
        await asyncio.sleep(10)
