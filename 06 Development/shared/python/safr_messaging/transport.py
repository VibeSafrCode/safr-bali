"""One-message lease transport shared by branded bot adapters.

No polling, credentials, customer database or message bodies are persisted here.
Only the existing bot process may call iteration(). All sends are plain text.
"""
import asyncio
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import stat
import tempfile


class TransportStateError(RuntimeError):
    pass


class CooldownPersistenceError(TransportStateError):
    pass


class ReceiptJournal:
    def __init__(self, path):
        self.path = Path(path)

    def _read_object(self):
        parent = self.path.parent.lstat()
        if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid() or parent.st_mode & 0o022:
            raise TransportStateError("messaging_state_directory_invalid")
        try:
            info = self.path.lstat()
        except FileNotFoundError:
            return {}
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > 2_000_000:
            raise TransportStateError("messaging_receipt_store_invalid")
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or len(data) > 1000:
                raise ValueError()
            return data
        except (ValueError, UnicodeError, TypeError):
            raise TransportStateError("messaging_receipt_store_invalid") from None

    def read(self):
        data = self._read_object()
        for key, value in data.items():
            if (not re.fullmatch(r"(?:welcome|campaign):[1-9][0-9]{0,18}", key) or not isinstance(value, dict)
                    or value.get("delivery_kind") != key.split(":")[0]):
                raise TransportStateError("messaging_receipt_store_invalid")
            state = value.get("state")
            shapes = {"DELIVERED": {"telegram_message_id", "delivered_at"},
                      "FAILED": {"error_code"}, "UNKNOWN": {"error_code"},
                      "RETRY": {"error_code", "retry_after_seconds"}}
            if (not isinstance(state, str) or state not in shapes
                    or set(value) != {"delivery_kind", "lease_token", "state"} | shapes[state]
                    or not isinstance(value.get("lease_token"), str)
                    or not re.fullmatch(r"[a-f0-9]{32}", value["lease_token"])):
                raise TransportStateError("messaging_receipt_store_invalid")
            if state == "DELIVERED":
                message, stamp = value["telegram_message_id"], value["delivered_at"]
                try:
                    if (not isinstance(message, str) or not re.fullmatch(r"[1-9][0-9]{0,19}", message)
                            or not isinstance(stamp, str) or not 1 <= len(stamp) <= 48
                            or datetime.fromisoformat(stamp).tzinfo is None):
                        raise ValueError()
                except ValueError:
                    raise TransportStateError("messaging_receipt_store_invalid") from None
            elif (not isinstance(value.get("error_code"), str)
                    or not re.fullmatch(r"[A-Za-z_]{1,80}", value["error_code"])
                    or (state == "RETRY" and (value["error_code"] != "TELEGRAM_RETRY_AFTER"
                        or type(value.get("retry_after_seconds")) is not int
                        or not 1 <= value["retry_after_seconds"] <= 86400))):
                raise TransportStateError("messaging_receipt_store_invalid")
        return data

    def write(self, data):
        # Revalidate before replace; never repair corruption by overwriting it.
        self.read()
        if len(data) > 1000:
            raise TransportStateError("messaging_receipt_store_full")
        raw = json.dumps(data, ensure_ascii=True, separators=(",", ":")).encode()
        temporary = None
        try:
            fd, temporary = tempfile.mkstemp(prefix="messaging-receipt-", dir=self.path.parent)
            with os.fdopen(fd, "wb") as stream:
                os.fchmod(stream.fileno(), 0o600); stream.write(raw); stream.flush(); os.fsync(stream.fileno())
            os.replace(temporary, self.path); temporary = None
            directory = os.open(self.path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(directory)
            finally: os.close(directory)
        finally:
            if temporary is not None: os.unlink(temporary)


class CooldownJournal(ReceiptJournal):
    """Independent durable gate survives receipt ACK/removal and process restart."""
    def read(self):
        data = self._read_object()
        if not data: return data
        try:
            if set(data) != {"not_before"} or not isinstance(data["not_before"], str) or len(data["not_before"]) > 48:
                raise ValueError()
            value = datetime.fromisoformat(data["not_before"])
            if value.tzinfo is None: raise ValueError()
        except ValueError:
            raise TransportStateError("messaging_cooldown_invalid") from None
        return data


class CooldownGate:
    def __init__(self, path, clock):
        self.journal, self.clock, self.memory_deadline = CooldownJournal(path), clock, None

    def remaining(self):
        saved = self.journal.read().get("not_before")
        deadlines = [value for value in (datetime.fromisoformat(saved) if saved else None, self.memory_deadline) if value is not None]
        return max(0, (max(deadlines) - self.clock()).total_seconds()) if deadlines else 0

    def postpone(self, seconds):
        if type(seconds) is not int or not 1 <= seconds <= 86400:
            raise TransportStateError("messaging_cooldown_invalid")
        deadline = self.clock() + timedelta(seconds=seconds)
        self.memory_deadline = deadline
        try:
            saved = self.journal.read().get("not_before")
            if saved: deadline = max(deadline, datetime.fromisoformat(saved))
            self.memory_deadline = deadline
            self.journal.write({"not_before": deadline.isoformat()})
        except (OSError, TransportStateError):
            raise CooldownPersistenceError("messaging_cooldown_persistence_failed") from None


class MessagingTransport:
    def __init__(self, *, bot_key, api, send, journal, keyboard, sleeper=asyncio.sleep, clock=None):
        if bot_key not in {"safrway", "yoga"}: raise ValueError("unsupported_messaging_bot")
        self.bot_key, self.api, self.send, self.journal = bot_key, api, send, journal
        self.keyboard, self.sleeper = keyboard, sleeper
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.cooldown = CooldownGate(journal.path.parent / "messaging-cooldown.json", self.clock)
        self.halted = False

    async def acknowledge(self, key, result):
        response = await self.api("POST", f"/deliveries/{key.split(':')[1]}/settle", result)
        if isinstance(response, dict) and response.get("state") in {"DELIVERED", "FAILED", "UNKNOWN", "PENDING", "SUPPRESSED", "CANCELLED"}:
            receipts = self.journal.read(); receipts.pop(key, None); self.journal.write(receipts)
            return True
        return False

    async def iteration(self):
        if self.halted: raise TransportStateError("messaging_transport_identity_invalid")
        for key, result in list(self.journal.read().items()):
            if result.get("state") == "RETRY":
                # Replay may follow failed persistence or an old/expired gate.
                # Restore a conservative full interval BEFORE ACK can remove
                # the only durable evidence of the known Telegram 429.
                self.cooldown.postpone(result["retry_after_seconds"])
            if not await self.acknowledge(key, result): return False
        if self.cooldown.remaining() > 0: return False
        items = await self.api("POST", "/claim", None)
        if items is None: return False
        if not isinstance(items, list) or len(items) > 1: raise TransportStateError("messaging_claim_invalid")
        for item in items:
            await self.deliver(item)
        return bool(items)

    async def deliver(self, item):
        if (not isinstance(item, dict) or item.get("bot_key") != self.bot_key
                or item.get("delivery_kind") not in {"welcome", "campaign"}
                or type(item.get("id")) is not int or not 0 < item["id"] < 2**63
                or type(item.get("telegram_id")) is not int or not 0 < item["telegram_id"] < 2**63
                or item.get("locale") not in {"ru", "en"} or not isinstance(item.get("text"), str)
                or not item["text"].strip() or len(item["text"].encode("utf-16-le")) // 2 > 4096
                or not isinstance(item.get("lease_token"), str) or not re.fullmatch(r"[a-f0-9]{32}", item["lease_token"])):
            raise TransportStateError("messaging_delivery_invalid")
        raw_expiry = item.get("lease_expires_at")
        if not isinstance(raw_expiry, str) or not 1 <= len(raw_expiry) <= 48:
            raise TransportStateError("messaging_delivery_invalid")
        try:
            expiry = datetime.fromisoformat(raw_expiry)
        except ValueError:
            raise TransportStateError("messaging_delivery_invalid") from None
        if expiry.tzinfo is None:
            raise TransportStateError("messaging_delivery_invalid")
        if (expiry - self.clock()).total_seconds() < 25:
            # No Telegram attempt. Leaving the lease to UNKNOWN is conservative.
            return
        key = f"{item['delivery_kind']}:{item['id']}"
        receipts = self.journal.read()
        if key in receipts:
            await self.acknowledge(key, receipts[key]); return
        base = {"delivery_kind": item["delivery_kind"], "lease_token": item["lease_token"]}
        result = {**base, "state": "UNKNOWN", "error_code": "AMBIGUOUS_SEND"}
        # Record intent before any external send. Crash/restart can acknowledge
        # UNKNOWN, never issue the same Telegram send again.
        receipts[key] = result; self.journal.write(receipts)
        cooldown = 0
        try:
            sent = await self.send(item["telegram_id"], item["text"], parse_mode=None,
                                   reply_markup=self.keyboard(item), request_timeout=20)
            if type(sent.message_id) is int and sent.message_id > 0:
                result = {**base, "state": "DELIVERED", "telegram_message_id": str(sent.message_id),
                          "delivered_at": getattr(sent, "date", self.clock()).isoformat()}
        except asyncio.CancelledError:
            raise
        except Exception as error:
            name = type(error).__name__
            if name == "TelegramRetryAfter" and type(getattr(error, "retry_after", None)) is int and 1 <= error.retry_after <= 86400:
                cooldown = error.retry_after
                result = {**base, "state": "RETRY", "error_code": "TELEGRAM_RETRY_AFTER", "retry_after_seconds": cooldown}
                self.cooldown.memory_deadline = self.clock() + timedelta(seconds=cooldown)
                try:
                    # Persist the known outcome before the independent gate.
                    # An unavailable gate must not leave only UNKNOWN intent.
                    receipts = self.journal.read(); receipts[key] = result; self.journal.write(receipts)
                    self.cooldown.postpone(cooldown)
                except (OSError, TransportStateError):
                    raise CooldownPersistenceError("messaging_cooldown_persistence_failed") from None
            elif name in {"TelegramBadRequest", "TelegramForbiddenError"}:
                result = {**base, "state": "FAILED", "error_code": "recipient_blocked" if name == "TelegramForbiddenError" else "invalid_recipient"}
            elif name == "TelegramUnauthorizedError":
                self.halted = True
        receipts = self.journal.read(); receipts[key] = result; self.journal.write(receipts)
        try:
            await self.acknowledge(key, result)
        finally:
            # Even a lost backend ACK cannot bypass this bot's 429 cooldown.
            if cooldown: await self.sleeper(cooldown)
        if self.halted: raise TransportStateError("messaging_transport_identity_invalid")
