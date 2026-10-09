from dataclasses import dataclass, field
from pathlib import Path
import re
from urllib.parse import urlsplit

EXPECTED_USERNAME = "Yoga_ganster_bot"
MODES = frozenset({"service_links", "welcome_links"})
USERNAME = re.compile(r"[A-Za-z][A-Za-z0-9_]{4,31}")
START_PAYLOAD = re.compile(r"[A-Za-z0-9_-]{1,64}")


class RuntimeConfigError(ValueError):
    """Only fixed, non-secret error codes may be emitted."""


class RuntimeTransportError(RuntimeError):
    """Fixed non-secret code; temporary transport failure permits service restart."""


def bot_username(value):
    if not isinstance(value, str) or not USERNAME.fullmatch(value) or not value.lower().endswith("bot"):
        raise RuntimeConfigError("invalid_bot_username")
    return value


def site_origin(value):
    if not isinstance(value, str) or any(ord(c) < 33 for c in value) or "\\" in value:
        raise RuntimeConfigError("invalid_site_origin")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        raise RuntimeConfigError("invalid_site_origin") from None
    host = parsed.hostname or ""
    labels = host.split(".")
    hostname_ok = (len(host) <= 253 and len(labels) >= 2
                   and all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels)
                   and not labels[-1].isdigit())
    if (parsed.scheme != "https" or parsed.username or parsed.password or port not in (None, 443)
            or parsed.query or parsed.fragment or parsed.path not in ("", "/")
            or not hostname_ok
            or host == "localhost" or host.endswith((".localhost", ".local"))
            or re.fullmatch(r"[0-9.]+", host) or host.startswith(("api.", "app."))):
        raise RuntimeConfigError("invalid_site_origin")
    return "https://" + host


def start_payload(value):
    if value is None or value == "":
        return None
    if not isinstance(value, str) or not START_PAYLOAD.fullmatch(value):
        raise RuntimeConfigError("invalid_start_payload")
    # Syntax validity never assigns an inviter, a brand permission or an account.
    return value


@dataclass(frozen=True)
class Settings:
    token: str = field(repr=False)
    mode: str
    origin: str
    manager_username: str | None
    shared_root: Path
    lock_file: Path

    @classmethod
    def from_env(cls, env):
        token = env.get("YOGA_BOT_TOKEN", "")
        if not isinstance(token, str) or not re.fullmatch(r"[0-9]{5,15}:[A-Za-z0-9_-]{20,80}", token):
            raise RuntimeConfigError("missing_or_invalid_yoga_token")
        mode = env.get("YOGA_MVP_MODE", "")
        if mode not in MODES:
            raise RuntimeConfigError("explicit_mvp_choice_required")
        origin = site_origin(env.get("YOGA_SITE_ORIGIN", ""))
        manager = env.get("YOGA_MANAGER_BOT_USERNAME", "")
        if mode == "service_links":
            manager = bot_username(manager)
            if manager.lower() == EXPECTED_USERNAME.lower():
                raise RuntimeConfigError("manager_must_be_separate_bot")
        else:
            manager = None
        shared = Path(env.get("YOGA_SHARED_CONTENT_ROOT", ""))
        if not shared.is_absolute():
            raise RuntimeConfigError("explicit_shared_root_required")
        lock = Path(env.get("YOGA_RUNTIME_LOCK", "/run/yoga-gangster-bot/instance.lock"))
        if not lock.is_absolute() or lock.name != "instance.lock":
            raise RuntimeConfigError("invalid_runtime_lock")
        return cls(token, mode, origin, manager, shared, lock)
