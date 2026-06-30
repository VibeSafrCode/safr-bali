from fastapi import FastAPI

from app.api.admin import router as admin_router
from app.api.orders import router as orders_router
from app.api.payments import router as payments_router
from app.api.points import router as points_router
from app.api.referrals import router as referrals_router
from app.api.services import router as services_router
from app.api.users import router as users_router
from app.db.session import check_database_connection

app = FastAPI(
    title="SAFR Bali API",
    description="Backend API for SAFR Bali / Na Bali Team",
    version="0.1.0",
)

app.include_router(services_router)
app.include_router(orders_router)
app.include_router(users_router)
app.include_router(referrals_router)
app.include_router(points_router)
app.include_router(payments_router)
app.include_router(admin_router)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "project": "SAFR Bali",
        "version": "0.1.0"
    }


@app.get("/db/health")
def database_health_check():
    is_connected = check_database_connection()

    return {
        "status": "ok" if is_connected else "error",
        "database": "connected" if is_connected else "not_connected",
        "project": "SAFR Bali"
    }
