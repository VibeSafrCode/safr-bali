import secrets
import time
from collections import deque
from typing import Deque

from fastapi import Header, HTTPException, Request, status

from app.core.config import settings


def _safe_compare(value: str, expected: str) -> bool:
    if not value or not expected or not value.strip() or not expected.strip():
        return False
    return secrets.compare_digest(value.encode(), expected.encode())


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
    def __init__(self, max_keys: int = 10_000) -> None:
        self.requests: dict[str, Deque[float]] = {}
        self.expires: dict[str, float] = {}
        self.max_keys = max_keys
        self.next_cleanup = 0.0

    def check(self, key: str, limit: int, window_seconds: int = 60) -> bool:
        now = time.monotonic()
        if now >= self.next_cleanup:
            for expired in [item for item, expiry in self.expires.items() if expiry <= now]:
                self.requests.pop(expired, None)
                self.expires.pop(expired, None)
            self.next_cleanup = now + 1
        if key not in self.requests:
            # Never evict an active client's budget to admit attacker-controlled keys.
            if len(self.requests) >= self.max_keys or limit <= 0:
                return False
            self.requests[key] = deque()
        bucket = self.requests[key]

        while bucket and bucket[0] <= now - window_seconds:
            bucket.popleft()

        if len(bucket) >= limit:
            return False

        bucket.append(now)
        self.expires[key] = now + window_seconds
        return True


rate_limiter = InMemoryRateLimiter()


async def rate_limit(request: Request) -> None:
    # ASGI server resolves forwarding only from its configured trusted proxies.
    # An arbitrary CF-Connecting-IP header must not override that trust boundary.
    client_host = request.client.host if request.client else "unknown"

    if not rate_limiter.check(
        key=client_host,
        limit=settings.RATE_LIMIT_PER_MINUTE,
        window_seconds=60,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
        )
