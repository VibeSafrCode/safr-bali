"""Yoga identity/config adapter; the lease sender is shared with Main."""
import importlib
import logging
from pathlib import Path
import sys

import httpx
from .api_client import BackendRejected
from .config import RuntimeConfigError
LOG = logging.getLogger("yoga_runtime")


class BrandedMessaging:
    def __init__(self, settings, bot, *, transport=None):
        self.channel_settings = settings
        root = settings.messaging_module_root or Path(__file__).resolve().parents[2] / "shared/python"
        if not root.is_absolute() or not (root / "safr_messaging/transport.py").is_file():
            raise RuntimeConfigError("messaging_shared_module_missing")
        sys.path.insert(0, str(root))
        shared = importlib.import_module("safr_messaging.transport")
        self.state_error = shared.TransportStateError
        self.cooldown_error = shared.CooldownPersistenceError
        self.suspended = False
        self.outbound_suspended = False
        self.http = httpx.AsyncClient(base_url=settings.backend_origin + "/api/bot-messaging/",
            headers={"X-Service-Token": settings.service_api_token}, timeout=10,
            trust_env=False, follow_redirects=False, transport=transport)
        self.sender = shared.MessagingTransport(bot_key="yoga", api=self.api, send=bot.send_message,
            journal=shared.ReceiptJournal(settings.state_directory / "messaging-receipts.json"), keyboard=self.keyboard)

    async def close(self):
        await self.http.aclose()

    async def api(self, method, path, payload=None):
        try:
            response = await self.http.request(method, path.lstrip("/"), json=payload)
            if response.status_code in {401, 403}:
                raise BackendRejected("messaging_credential_rejected")
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            return None

    async def iteration(self):
        if self.suspended or self.outbound_suspended: return False
        try:
            return await self.sender.iteration()
        except self.state_error as error:
            if str(error) == "messaging_transport_identity_invalid":
                raise RuntimeConfigError("telegram_authorization_failed") from None
            if isinstance(error, self.cooldown_error):
                self.outbound_suspended = True
            self.suspended = True
            LOG.error("yoga_messaging_channel_suspended")
            return False
        except OSError:
            self.suspended = True
            LOG.error("yoga_messaging_storage_suspended")
            return False

    def can_send(self):
        if self.outbound_suspended: return False
        try:
            return self.sender.cooldown.remaining() <= 0
        except (self.state_error, OSError):
            LOG.error("yoga_outbound_cooldown_requires_review")
            return False

    def postpone(self, seconds):
        try:
            self.sender.cooldown.postpone(seconds)
        except (self.state_error, OSError):
            # Keep inbound polling alive, but do not send further targets when
            # the shared rate-limit deadline cannot be durably recorded.
            self.outbound_suspended = True
            LOG.error("yoga_outbound_cooldown_requires_review")

    @staticmethod
    def keyboard(item):
        if item.get("step") != "followup": return None
        from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
        ru = item["locale"] == "ru"
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="Да, всё понятно" if ru else "Yes, everything is clear", callback_data=f"onboard:yes:{item['enrollment_id']}"),
            InlineKeyboardButton(text="Задать вопрос менеджеру" if ru else "Ask a manager a question", callback_data=f"onboard:manager:{item['enrollment_id']}")]])
