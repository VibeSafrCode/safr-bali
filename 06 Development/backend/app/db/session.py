import asyncio
from concurrent.futures import Future
from threading import Thread

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings


engine = create_engine(settings.DATABASE_URL, echo=settings.SQL_ECHO)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# Separate probe connection: application pool exhaustion must not hide DB recovery.
_database_url = make_url(settings.DATABASE_URL)
_probe_args = {}
if _database_url.get_backend_name() == "postgresql":
    _probe_args = {"connect_timeout": 2, "options": "-c statement_timeout=2000"}
_readiness_engine = create_engine(
    _database_url, poolclass=NullPool, connect_args=_probe_args,
)
_probe_future = None


def check_database_connection() -> bool:
    try:
        with _readiness_engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


async def database_is_ready(timeout_seconds: float = 2.5) -> bool:
    global _probe_future
    # Reuse a pending probe; timeout must not leave an unbounded queue of threads.
    if _probe_future is None or _probe_future.done():
        _probe_future = Future()
        # DNS/kernel socket stalls can outlive libpq's own timeouts. A single daemon
        # worker keeps readiness fail-closed without preventing graceful shutdown.
        def run_probe(future):
            try:
                future.set_result(check_database_connection())
            except Exception:
                future.set_result(False)
        Thread(target=run_probe, args=(_probe_future,), name="db-readiness", daemon=True).start()
    probe = _probe_future
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_seconds
    try:
        # Do not wrap the concurrent Future per request: every cancelled/timed-out
        # wrapper retains a callback until a stalled worker completes. Callback-free
        # polling also avoids retaining closed TestClient/event loops in the probe.
        # A successful probe may add at most 25 ms before the response observes it.
        while not probe.done():
            remaining = deadline - loop.time()
            if remaining <= 0:
                return False
            await asyncio.sleep(min(.025, remaining))
        return bool(probe.result())
    except Exception:
        return False
