from fastapi import FastAPI

app = FastAPI(
    title="SAFR Bali API",
    description="Backend API for SAFR Bali / Na Bali Team",
    version="0.1.0",
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "project": "SAFR Bali",
        "version": "0.1.0"
    }
