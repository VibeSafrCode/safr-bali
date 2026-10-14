"""Send-only Yoga transport. Never start the main bot or consume updates."""
from __future__ import annotations

import asyncio
from contextlib import contextmanager
from dataclasses import dataclass, field
import fcntl
import logging
import os
from pathlib import Path
import re
import signal
import stat
import sys
from urllib.parse import urlsplit


logger = logging.getLogger(__name__)
CHAT_FIELDS = (
    "SUPPORT_CHAT_IDS", "MANAGER_CHAT_IDS", "VISA_ADMIN_CHAT_IDS",
    "SPB_MANAGER_CHAT_IDS", "THAILAND_MANAGER_CHAT_IDS",
)
REQUIRED_FIELDS = (
    "BOT_TOKEN", "BACKEND_API_URL", "BACKEND_SERVICE_TOKEN", "ADMIN_CHAT_ID",
    "YOGA_CHANNEL_ENABLED", "YOGA_TRANSPORT_OWNER_MODE", "YOGA_TRANSPORT_STATE_DIR",
    *CHAT_FIELDS,
)


class ConfigurationError(ValueError):
    """Constant reason codes only: configuration may contain secrets."""


class OwnershipError(RuntimeError):
    pass


@dataclass(frozen=True)
class TransportConfig:
    settings_env: dict[str, str] = field(repr=False)
    state_dir: Path


def _chat_ids(value: str) -> list[int]:
    if not value:
        return []
    parts = value.split(",")
    if len(parts) > 100 or any(not re.fullmatch(r"[1-9][0-9]{0,18}", p.strip()) for p in parts):
        raise ConfigurationError("invalid_recipient_snapshot")
    ids = list(dict.fromkeys(int(p.strip()) for p in parts))
    if any(i > 2**63 - 1 for i in ids):
        raise ConfigurationError("invalid_recipient_snapshot")
    return ids


def validate_config(env) -> TransportConfig:
    """Validate a separate explicit snapshot; never read a dotenv file."""
    if any(key not in env or not isinstance(env[key], str) for key in REQUIRED_FIELDS):
        raise ConfigurationError("incomplete_transport_snapshot")
    if env["YOGA_CHANNEL_ENABLED"] != "true" or env["YOGA_TRANSPORT_OWNER_MODE"] != "standalone-main-disabled":
        raise ConfigurationError("transport_owner_mode_not_confirmed")
    if not re.fullmatch(r"[1-9][0-9]{4,15}:[A-Za-z0-9_-]{20,256}", env["BOT_TOKEN"]):
        raise ConfigurationError("invalid_bot_credential")
    token = env["BACKEND_SERVICE_TOKEN"]
    if not 24 <= len(token) <= 4096 or any(c.isspace() or ord(c) < 32 for c in token):
        raise ConfigurationError("invalid_backend_credential")
    try:
        origin = urlsplit(env["BACKEND_API_URL"])
        if (origin.scheme != "http" or origin.hostname not in {"127.0.0.1", "::1"}
                or origin.port is None or not 1 <= origin.port <= 65535
                or origin.username is not None or origin.password is not None
                or origin.path not in {"", "/"} or origin.query or origin.fragment
                or any(c.isspace() for c in env["BACKEND_API_URL"])):
            raise ValueError
    except ValueError:
        raise ConfigurationError("backend_origin_not_loopback") from None
    admin = _chat_ids(env["ADMIN_CHAT_ID"])
    if len(admin) != 1 or "," in env["ADMIN_CHAT_ID"]:
        raise ConfigurationError("invalid_admin_snapshot")
    groups = {key: _chat_ids(env[key]) for key in CHAT_FIELDS}
    if env.get("ONBOARDING_REGISTRATION_HISTORY_VERIFIED", "false") != "false" or env.get("MINI_APP_URL", ""):
        raise ConfigurationError("unrelated_settings_in_snapshot")
    state_dir = Path(env["YOGA_TRANSPORT_STATE_DIR"])
    if not state_dir.is_absolute() or state_dir.is_symlink():
        raise ConfigurationError("invalid_state_directory")
    try:
        info = state_dir.stat()
    except OSError:
        raise ConfigurationError("state_directory_unavailable") from None
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != 0o700):
        raise ConfigurationError("state_directory_not_private")
    if os.path.lexists(state_dir / ".env"):
        raise ConfigurationError("dotenv_not_allowed")
    normalized = {key: env[key] for key in ("BOT_TOKEN", "BACKEND_API_URL", "BACKEND_SERVICE_TOKEN")}
    normalized.update(ADMIN_CHAT_ID=str(admin[0]), YOGA_CHANNEL_ENABLED="true",
                      ONBOARDING_REGISTRATION_HISTORY_VERIFIED="false", MINI_APP_URL="")
    normalized.update({key: ",".join(map(str, ids)) for key, ids in groups.items()})
    return TransportConfig(normalized, state_dir.resolve())


@contextmanager
def runtime_lock(state_dir: Path):
    """Private per-worker inode, without touching main/onboarding locks."""
    path = state_dir / "yoga-main-transport.lock"
    handle = None
    try:
        handle = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
        info = os.fstat(handle)
        linked = path.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600
                or (info.st_dev, info.st_ino) != (linked.st_dev, linked.st_ino)):
            raise OwnershipError("unsafe_transport_lock")
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (OSError, OwnershipError):
        if handle is not None:
            os.close(handle)
        raise OwnershipError("transport_lock_unavailable") from None
    try:
        yield
    finally:
        # Keep the inode: unlinking a lock allows parallel owners after reopen.
        os.close(handle)


@contextmanager
def stop_signals(loop, stop_event):
    previous = {}
    try:
        for signum in (signal.SIGTERM, signal.SIGINT):
            previous[signum] = signal.getsignal(signum)
            loop.add_signal_handler(signum, stop_event.set)
        yield
    finally:
        for signum, handler in previous.items():
            loop.remove_signal_handler(signum)
            signal.signal(signum, handler)


async def run_worker(bot_factory, bridge, stop_event, *, shutdown_timeout=20):
    """One bridge, one session; injectable fake boundaries for offline tests."""
    if stop_event.is_set():
        return
    bot = bot_factory()
    bridge_task = None
    stop_task = None
    shutdown_failed = False
    try:
        bridge_task = asyncio.create_task(bridge(bot))
        stop_task = asyncio.create_task(stop_event.wait())
        done, _ = await asyncio.wait((bridge_task, stop_task), return_when=asyncio.FIRST_COMPLETED)
        if bridge_task in done:
            await bridge_task
            if not stop_event.is_set():
                raise RuntimeError("yoga_transport_stopped_unexpectedly")
    finally:
        tasks = [task for task in (bridge_task, stop_task) if task is not None]
        for task in tasks:
            task.cancel()
        if tasks:
            _, pending = await asyncio.wait(tasks, timeout=shutdown_timeout)
            if pending:
                logger.error("yoga_transport_shutdown_timeout")
                shutdown_failed = True
            # Retrieve completed exceptions without resending or settling here.
            for task in tasks:
                if task.done() and not task.cancelled():
                    task.exception()
        await asyncio.wait_for(bot.session.close(), timeout=shutdown_timeout)
        if shutdown_failed:
            raise RuntimeError("yoga_transport_shutdown_timeout")


def load_runtime(config: TransportConfig):
    """Only after validation/lock. Existing bridge stays the contract owner."""
    if "app.core.config" in sys.modules:
        raise ConfigurationError("settings_already_loaded")
    os.chdir(config.state_dir)
    if os.path.lexists(config.state_dir / ".env"):
        raise ConfigurationError("dotenv_not_allowed")
    os.environ.update(config.settings_env)
    from app.core.config import settings
    if (settings.YOGA_CHANNEL_ENABLED is not True
            or settings.ONBOARDING_REGISTRATION_HISTORY_VERIFIED is not False
            or any(str(getattr(settings, key)) != value for key, value in config.settings_env.items()
                   if key not in {"YOGA_CHANNEL_ENABLED", "ONBOARDING_REGISTRATION_HISTORY_VERIFIED"})):
        raise ConfigurationError("settings_snapshot_mismatch")
    from aiogram import Bot
    from app.services.yoga_chat_bridge import run_bridge
    return lambda: Bot(token=settings.BOT_TOKEN), run_bridge


async def _serve(bot_factory, bridge):
    stop_event = asyncio.Event()
    with stop_signals(asyncio.get_running_loop(), stop_event):
        await run_worker(bot_factory, bridge, stop_event)


def main(argv=None, *, env=None, runtime_loader=load_runtime):
    argv = sys.argv[1:] if argv is None else argv
    if argv not in ([], ["--check-config"]):
        return 64
    try:
        config = validate_config(os.environ if env is None else env)
        if argv == ["--check-config"]:
            return 0
        with runtime_lock(config.state_dir):
            bot_factory, bridge = runtime_loader(config)
            asyncio.run(_serve(bot_factory, bridge))
        return 0
    except ConfigurationError:
        logger.error("yoga_transport_configuration_rejected")
        return 2
    except OwnershipError:
        logger.error("yoga_transport_owner_unavailable")
        return 3
    except Exception:
        # No raw exception/traceback, token, URL, recipient or message content.
        logger.error("yoga_transport_failed")
        return 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    raise SystemExit(main())
