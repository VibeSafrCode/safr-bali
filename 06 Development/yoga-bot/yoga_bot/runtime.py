import asyncio
import fcntl
import logging
import os
import re
import stat
from pathlib import Path

from .catalog import load_catalog
from .config import EXPECTED_USERNAME, Settings, RuntimeConfigError, RuntimeTransportError
from .menu import Menus, locale_for, text
from .state import Preferences

LOG = logging.getLogger("yoga_runtime")


def setup_logging():
    # Vendor exception/HTTP/update logs may contain tokens, URLs or identifiers.
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(logging.NullHandler())
    root.setLevel(logging.CRITICAL + 1)
    for name in ("aiogram", "aiohttp", "asyncio", "httpx"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.addHandler(logging.NullHandler())
        logger.setLevel(logging.CRITICAL + 1)
        logger.propagate = False
    LOG.handlers.clear()
    LOG.addHandler(logging.StreamHandler())
    LOG.setLevel(logging.INFO)
    LOG.propagate = False


class RuntimeLock:
    def __init__(self, path):
        self.path, self.fd = Path(path), None

    def __enter__(self):
        try:
            self.fd = os.open(self.path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            s = os.fstat(self.fd)
            if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_mode & 0o077:
                raise RuntimeConfigError("unsafe_runtime_lock")
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (OSError, RuntimeConfigError):
            if self.fd is not None:
                os.close(self.fd)
                self.fd = None
            raise RuntimeConfigError("yoga_runtime_lock_unavailable") from None
        return self

    def __exit__(self, *_):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None


async def verify_identity(bot):
    me = await asyncio.wait_for(bot.get_me(), timeout=10)
    if not me.is_bot or not me.username or me.username.lower() != EXPECTED_USERNAME.lower():
        raise RuntimeConfigError("unexpected_bot_identity")
    info = await asyncio.wait_for(bot.get_webhook_info(), timeout=10)
    if info.url:
        raise RuntimeConfigError("webhook_owner_requires_review")


def create_dispatcher(settings, services, preferences=None):
    from aiogram import Router
    from .dispatcher import IsolatedDispatcher
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, ErrorEvent, Message
    dp = IsolatedDispatcher(disable_fsm=True)
    router = Router(name="yoga_isolated_links")
    prefs = preferences if preferences is not None else Preferences()
    menus = Menus(settings, services)

    def markup(reply):
        return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=b.label, url=b.url, callback_data=b.callback) for b in row] for row in reply.buttons])

    def private(message):
        return (message is not None and message.chat.type == "private" and message.from_user is not None
                and not message.from_user.is_bot and message.chat.id == message.from_user.id)

    @router.message()
    async def receive(message):
        if not private(message):
            return
        key = (EXPECTED_USERNAME.lower(), message.chat.id)
        fallback = locale_for(message.from_user.language_code)
        locale = prefs.locale(key, fallback)
        if not prefs.allow(key, fallback):
            return
        raw = message.text or ""
        command, _, args = raw[:512].partition(" ")
        name, _, target = command.partition("@")
        if target and target.lower() != EXPECTED_USERNAME.lower():
            return
        if len(raw) > 512:
            reply = menus.home(locale, "invalid_start" if name == "/start" else "menu")
        elif name == "/start":
            reply = menus.start(locale, args)
        elif name == "/services":
            reply = menus.page(locale, 0)
        elif name in ("/help", "/settings", "/language"):
            reply = menus.home(locale, "language" if name in ("/language", "/settings") else "help")
        elif name in ("/account", "/referrals", "/points"):
            reply = menus.home(locale, "referral" if name == "/referrals" else "not_connected")
        elif name == "/manager" and settings.mode == "service_links":
            reply = menus.home(locale, "handoff")
        else:
            reply = menus.home(locale, "menu")
        await asyncio.wait_for(message.answer(reply.text, reply_markup=markup(reply)), timeout=15)

    @router.callback_query()
    async def callback(query):
        # An inaccessible/deleted message cannot safely be edited. Callback
        # message author is the bot; the sender must own this private chat.
        if not (isinstance(query.message, Message) and query.message.chat.type == "private"
                and not query.from_user.is_bot and query.from_user.id == query.message.chat.id):
            return
        key = (EXPECTED_USERNAME.lower(), query.from_user.id)
        locale = prefs.locale(key, locale_for(query.from_user.language_code))
        if not prefs.allow_ack(key, locale):
            return
        data = query.data or ""
        valid = data in ("lang:ru", "lang:en", "home") or re.fullmatch(r"services:[0-9]{1,3}", data)
        if not valid:
            await asyncio.wait_for(query.answer(cache_time=1), timeout=10)
            return
        if not prefs.allow(key, locale):
            await asyncio.wait_for(query.answer(text("wait", locale), cache_time=1), timeout=10)
            return
        if data in ("lang:ru", "lang:en"):
            locale = data[5:]
            prefs.set_locale(key, locale)
            reply = menus.home(locale)
        elif data == "home":
            reply = menus.home(locale)
        elif re.fullmatch(r"services:[0-9]{1,3}", data):
            reply = menus.page(locale, int(data.split(":")[1]))
        await asyncio.wait_for(query.answer(cache_time=1), timeout=10)
        await asyncio.wait_for(query.message.edit_text(reply.text, reply_markup=markup(reply)), timeout=15)

    @router.errors()
    async def ignore_error(event: ErrorEvent):
        LOG.warning("handler_failed")
        return True

    dp.include_router(router)
    return dp


async def run(settings, bot_factory=None):
    from aiogram import Bot
    from aiogram.client.session.aiohttp import AiohttpSession
    services = load_catalog(settings.shared_root)
    with RuntimeLock(settings.lock_file):
        bot = bot_factory(settings.token) if bot_factory else Bot(token=settings.token, session=AiohttpSession(timeout=30))
        try:
            await verify_identity(bot)
            dp = create_dispatcher(settings, services)
            LOG.info("runtime_ready")
            await dp.start_polling(bot, allowed_updates=["message", "callback_query"], polling_timeout=20,
                                   handle_as_tasks=False, close_bot_session=False)
        finally:
            await bot.session.close()


def main():
    setup_logging()
    try:
        settings = Settings.from_env(os.environ)
        asyncio.run(run(settings))
    except KeyboardInterrupt:
        LOG.info("runtime_stopped")
    except RuntimeConfigError as error:
        LOG.error(str(error))
        return 2
    except RuntimeTransportError as error:
        LOG.error(str(error))
        return 1
    except Exception:
        # Never print exception values or traces containing credentials/message data.
        LOG.error("runtime_failed")
        return 1
    return 0
