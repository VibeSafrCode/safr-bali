from __future__ import annotations

import logging

import httpx

from app.core.config import settings


logger = logging.getLogger(__name__)


def backend_sync_enabled() -> bool:
    return bool(
        settings.BACKEND_API_URL.strip()
        and settings.BACKEND_SERVICE_TOKEN.strip()
    )


async def sync_user_registration(
    *,
    telegram_id: int,
    username: str | None,
    first_name: str | None,
    last_name: str | None,
    language: str | None,
    invited_by_telegram_id: int | None,
) -> bool:
    """Mirror Telegram registration to PostgreSQL without blocking bot access."""
    if not backend_sync_enabled():
        return False
    payload = {
        "telegram_id": telegram_id,
        "username": username,
        "first_name": first_name,
        "last_name": last_name,
        "language": language or "ru",
        "invited_by_telegram_id": invited_by_telegram_id,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{settings.BACKEND_API_URL.rstrip('/')}/users/register",
                json=payload,
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            response.raise_for_status()
        return True
    except Exception:
        logger.exception("Could not mirror Telegram user %s to backend", telegram_id)
        return False


async def sync_runtime_event(
    *,
    client_telegram_id: int,
    actor_telegram_id: int | None,
    event_type: str,
    text: str | None,
    payload: dict | None = None,
    source_key: str | None = None,
) -> bool:
    if not backend_sync_enabled():
        return False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{settings.BACKEND_API_URL.rstrip('/')}/bot-events",
                json={
                    "source_key": source_key,
                    "client_telegram_id": client_telegram_id,
                    "actor_telegram_id": actor_telegram_id,
                    "event_type": event_type,
                    "text": text,
                    "payload": payload or {},
                },
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            response.raise_for_status()
        return True
    except Exception:
        logger.exception(
            "Could not mirror %s event for client %s",
            event_type,
            client_telegram_id,
        )
        return False


async def get_user_dashboard(telegram_id: int) -> dict | None:
    if not backend_sync_enabled():
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{settings.BACKEND_API_URL.rstrip('/')}/users/by-telegram/{telegram_id}/dashboard",
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            payload = response.json()
            return payload if isinstance(payload, dict) else None
    except Exception:
        logger.exception("Could not load dashboard for Telegram user %s", telegram_id)
        return None
