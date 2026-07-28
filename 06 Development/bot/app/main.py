import asyncio
import logging

from aiogram import Bot, Dispatcher

from app.core.config import settings
from app.handlers.admin_reply import router as admin_reply_router
from app.handlers.admin_panel import router as admin_panel_router
from app.handlers.broadcast import router as broadcast_router
from app.handlers.contact import router as contact_router
from app.handlers.destinations import router as destinations_router
from app.handlers.fallback import router as fallback_router
from app.handlers.menu import router as menu_router
from app.handlers.start import router as start_router
from app.handlers.staff_collaboration import router as staff_collaboration_router
from app.handlers.web_chat import router as web_chat_router
from app.services.referrals import backfill_default_admin_referrals
from app.services.web_chat_bridge import run_web_chat_bridge


async def main():
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)

    backfilled_users = backfill_default_admin_referrals(settings.ADMIN_CHAT_ID)
    if backfilled_users:
        logger.info(
            "Attached %s existing users to the default main admin",
            backfilled_users,
        )

    bot = Bot(token=settings.BOT_TOKEN)
    dp = Dispatcher()

    dp.include_router(start_router)
    dp.include_router(admin_reply_router)
    dp.include_router(admin_panel_router)
    dp.include_router(broadcast_router)
    dp.include_router(staff_collaboration_router)
    dp.include_router(web_chat_router)
    dp.include_router(contact_router)
    dp.include_router(destinations_router)
    dp.include_router(menu_router)
    dp.include_router(fallback_router)

    bridge_task = asyncio.create_task(run_web_chat_bridge(bot))
    try:
        await dp.start_polling(bot)
    finally:
        bridge_task.cancel()
        await asyncio.gather(bridge_task, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
