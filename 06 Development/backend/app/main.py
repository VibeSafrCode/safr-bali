from fastapi import FastAPI

from app.api.services import router as services_router
from app.db.session import check_database_connection

app = FastAPI(
    title="SAFR Bali API",
    description="Backend API for SAFR Bali / Na Bali Team",
    version="0.1.0",
)

app.include_router(services_router)


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
