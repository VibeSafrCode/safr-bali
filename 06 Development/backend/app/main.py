from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin import router as admin_router
from app.api.orders import router as orders_router
from app.api.payments import router as payments_router
from app.api.points import router as points_router
from app.api.referrals import router as referrals_router
from app.api.services import router as services_router
from app.api.users import router as users_router
from app.api.bot_events import router as bot_events_router
from app.api.mini_app import router as mini_app_router
from app.api.web_portal import router as web_portal_router
from app.api.web_portal import service_router as web_portal_service_router
from app.api.web_admin import router as web_admin_router
from app.api.visa_lifecycle import (
    admin_router as visa_admin_router,
    crm_router as visa_crm_router,
    mini_router as visa_mini_router,
    service_router as visa_service_router,
    web_router as visa_web_router,
)
from app.api.catalog_pricing import (
    admin_router as catalog_pricing_admin_router,
    public_router as catalog_pricing_public_router,
)
from app.core.config import settings
from app.db.session import database_is_ready

app = FastAPI(
    title="SAFR Bali API",
    description="Backend API for SAFR Bali / Na Bali Team",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.mini_app_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Idempotency-Key", "X-CSRF-Token"],
)

app.include_router(services_router)
app.include_router(orders_router)
app.include_router(users_router)
app.include_router(referrals_router)
app.include_router(points_router)
app.include_router(payments_router)
app.include_router(admin_router)
app.include_router(bot_events_router)
app.include_router(mini_app_router)
app.include_router(web_portal_router)
app.include_router(web_portal_service_router)
app.include_router(web_admin_router)
app.include_router(visa_mini_router)
app.include_router(visa_web_router)
app.include_router(visa_crm_router)
app.include_router(visa_admin_router)
app.include_router(visa_service_router)
app.include_router(catalog_pricing_public_router)
app.include_router(catalog_pricing_admin_router)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "project": "SAFR Bali",
        "version": "0.1.0"
    }


@app.get("/db/health")
async def database_health_check():
    is_connected = await database_is_ready()

    return JSONResponse(status_code=200 if is_connected else 503, content={
        "status": "ok" if is_connected else "error",
        "database": "connected" if is_connected else "not_connected",
        "project": "SAFR Bali"
    }, headers={"Cache-Control": "no-store"})
