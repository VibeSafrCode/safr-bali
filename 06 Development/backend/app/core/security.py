import secrets
import time
from collections import defaultdict, deque
from typing import Deque

from fastapi import Header, HTTPException, Request, status

from app.core.config import settings


def _safe_compare(value: str, expected: str) -> bool:
    return secrets.compare_digest(value or "", expected or "")


async def require_service_token(
    x_service_token: str = Header(default="", alias="X-Service-Token"),
) -> None:
    if not _safe_compare(x_service_token, settings.SERVICE_API_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service token",
        )


async def require_admin_token(
    x_admin_token: str = Header(default="", alias="X-Admin-Token"),
) -> None:
    if not _safe_compare(x_admin_token, settings.ADMIN_API_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token",
        )


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self.requests: dict[str, Deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window_seconds: int = 60) -> bool:
        now = time.time()
        bucket = self.requests[key]

        while bucket and bucket[0] <= now - window_seconds:
            bucket.popleft()

        if len(bucket) >= limit:
            return False

        bucket.append(now)
        return True


rate_limiter = InMemoryRateLimiter()


async def rate_limit(request: Request) -> None:
    client_host = (
        request.headers.get("cf-connecting-ip", "").strip()
        or (request.client.host if request.client else "unknown")
    )

    if not rate_limiter.check(
        key=client_host,
        limit=settings.RATE_LIMIT_PER_MINUTE,
        window_seconds=60,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
        )
