import asyncio
import logging

from aiogram import Bot, Dispatcher

from app.core.config import settings
from app.handlers.admin_reply import router as admin_reply_router
from app.handlers.contact import router as contact_router
from app.handlers.fallback import router as fallback_router
from app.handlers.menu import router as menu_router
from app.handlers.start import router as start_router


async def main():
    logging.basicConfig(level=logging.INFO)

    bot = Bot(token=settings.BOT_TOKEN)
    dp = Dispatcher()

    dp.include_router(start_router)
    dp.include_router(admin_reply_router)
    dp.include_router(contact_router)
    dp.include_router(menu_router)
    dp.include_router(fallback_router)

    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
