"""Private operational metadata. No bodies, raw Telegram IDs or client database."""
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import secrets
import stat
import tempfile
import time


class IntakeStateError(RuntimeError):
    pass


def _private(path, directory=False):
    try:
        info = path.lstat()
        valid = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
        if not valid or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise IntakeStateError("unsafe_intake_state")
    except OSError:
        raise IntakeStateError("intake_state_unavailable") from None


def _topic(value):
    return isinstance(value, str) and re.fullmatch(r"[a-z][a-z0-9_-]{0,79}", value) is not None


def _cid(value):
    return value is None or type(value) is int and value > 0


class IntakeState:
    def __init__(self, directory, *, clock=time.time, max_actors=2000, max_updates=10000, retention=172800):
        self.root, self.clock = Path(directory), clock
        self.max_actors, self.max_updates, self.retention = max_actors, max_updates, retention
        _private(self.root, directory=True)
        self.path = self.root / "context.json"
        self.key_path = self.root / "context.key"
        if not self.key_path.exists():
            # Missing salt for an existing journal cannot silently re-key actors.
            if self.path.exists():
                raise IntakeStateError("intake_state_key_missing")
            try:
                fd = os.open(self.key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                with os.fdopen(fd, "wb") as stream:
                    stream.write(secrets.token_bytes(32))
                    stream.flush()
                    os.fsync(stream.fileno())
                self._sync_directory()
            except OSError:
                raise IntakeStateError("intake_state_unavailable") from None
        _private(self.key_path)
        try:
            self.key = self.key_path.read_bytes()
            if len(self.key) != 32:
                raise IntakeStateError("intake_state_key_invalid")
            if self.path.exists():
                _private(self.path)
                if self.path.stat().st_size > 5_000_000:
                    raise IntakeStateError("intake_state_too_large")
                self.data = json.loads(self.path.read_text(encoding="utf-8"))
            else:
                self.data = {"version": 1, "actors": {}, "updates": {}}
            self._validate()
        except (OSError, UnicodeError, ValueError, TypeError):
            raise IntakeStateError("intake_state_invalid") from None

    def _validate(self):
        data = self.data
        if (not isinstance(data, dict) or set(data) != {"version", "actors", "updates"} or data["version"] != 1
                or not isinstance(data["actors"], dict) or not isinstance(data["updates"], dict)
                or len(data["actors"]) > self.max_actors or len(data["updates"]) > self.max_updates):
            raise IntakeStateError("intake_state_invalid")
        for section in ("actors", "updates"):
            for key, row in data[section].items():
                fields = {"topic", "locale", "conversation_id", "touched"}
                if section == "updates":
                    fields |= {"actor", "accepted"}
                if (not isinstance(row, dict) or set(row) != fields or not _topic(row["topic"])
                        or row["locale"] not in {"ru", "en"} or not _cid(row["conversation_id"])
                        or type(row["touched"]) not in {int, float} or not math.isfinite(row["touched"])
                        or row["touched"] < 0 or row["touched"] > self.clock() + 300):
                    raise IntakeStateError("intake_state_invalid")
                if section == "actors":
                    valid = re.fullmatch(r"[a-f0-9]{64}", key)
                else:
                    valid = re.fullmatch(r"[0-9]{1,19}", key) and int(key) < 2**63 and type(row["accepted"]) is bool and isinstance(row["actor"], str) and re.fullmatch(r"[a-f0-9]{64}", row["actor"])
                if not valid:
                    raise IntakeStateError("intake_state_invalid")

    def _sync_directory(self):
        fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    def _save(self):
        self._validate()
        raw = json.dumps(self.data, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode()
        if len(raw) > 5_000_000:
            raise IntakeStateError("intake_state_too_large")
        temp = None
        try:
            _private(self.root, directory=True)
            if self.path.exists():
                _private(self.path)
            fd, temp = tempfile.mkstemp(prefix="context-", dir=self.root)
            with os.fdopen(fd, "wb") as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp, self.path)
            temp = None
            self._sync_directory()
        except OSError:
            raise IntakeStateError("intake_state_unavailable") from None
        finally:
            if temp is not None:
                try:
                    os.unlink(temp)
                except OSError:
                    pass

    def actor_key(self, actor):
        if type(actor) is not int or not 0 < actor < 2**63:
            raise IntakeStateError("invalid_intake_actor")
        return hmac.new(self.key, str(actor).encode(), hashlib.sha256).hexdigest()

    def _prune(self):
        now = self.clock()
        # Never expire unaccepted updates, even after a long backend outage.
        for key, row in list(self.data["updates"].items()):
            if row["accepted"] and now - row["touched"] > self.retention:
                del self.data["updates"][key]
        pending = {row["actor"] for row in self.data["updates"].values() if not row["accepted"]}
        for key, row in list(self.data["actors"].items()):
            if key not in pending and now - row["touched"] > self.retention:
                del self.data["actors"][key]

    def context(self, actor, fallback="en"):
        key = self.actor_key(actor)
        return self.data["actors"].get(key, {"topic": "general", "locale": fallback, "conversation_id": None, "touched": self.clock()}).copy()

    def select(self, actor, *, topic=None, locale=None, fallback="en"):
        self._prune()
        key = self.actor_key(actor)
        if key not in self.data["actors"] and len(self.data["actors"]) >= self.max_actors:
            raise IntakeStateError("intake_state_capacity")
        row = self.context(actor, fallback)
        if topic is not None:
            if not _topic(topic):
                raise IntakeStateError("invalid_intake_topic")
            if topic != row["topic"]:
                row["conversation_id"] = None
            row["topic"] = topic
        if locale is not None:
            if locale not in {"ru", "en"}:
                raise IntakeStateError("invalid_intake_locale")
            row["locale"] = locale
        row["touched"] = self.clock()
        self.data["actors"][key] = row
        self._save()

    def prepare(self, update_id, actor, fallback="en"):
        if type(update_id) is not int or not 0 <= update_id < 2**63:
            raise IntakeStateError("invalid_intake_update")
        self._prune()
        key, name = self.actor_key(actor), str(update_id)
        existing = self.data["updates"].get(name)
        if existing is not None:
            if existing["actor"] != key:
                raise IntakeStateError("intake_update_actor_conflict")
            return existing.copy()
        if len(self.data["updates"]) >= self.max_updates:
            raise IntakeStateError("intake_state_capacity")
        self.select(actor, fallback=fallback)
        row = {**self.context(actor, fallback), "actor": key, "accepted": False}
        self.data["updates"][name] = row
        # Must hit durable storage before the first HTTP POST.
        self._save()
        return row.copy()

    def accept(self, update_id, actor, conversation_id):
        if not _cid(conversation_id) or conversation_id is None:
            raise IntakeStateError("invalid_intake_receipt")
        name, key = str(update_id), self.actor_key(actor)
        row = self.data["updates"].get(name)
        if row is None or row["actor"] != key:
            raise IntakeStateError("intake_receipt_context_missing")
        row["accepted"] = True
        # Keep the original request's conversation_id unchanged for replay of
        # any accepted update in a batch Telegram has not yet confirmed.
        current = self.context(actor, row["locale"])
        if current["topic"] == row["topic"]:
            current["conversation_id"] = conversation_id
            current["touched"] = self.clock()
            self.data["actors"][key] = current
        self._save()
