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
    invited_by_ref_code: str | None = None,
    referral_code: str | None = None,
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
        "invited_by_ref_code": invited_by_ref_code,
        "referral_code": referral_code,
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


async def get_user_locale(telegram_id: int) -> str | None:
    if not backend_sync_enabled():
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{settings.BACKEND_API_URL.rstrip('/')}/users/by-telegram/{telegram_id}/locale",
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            locale = response.json().get("locale")
            return locale if locale in {"ru", "en"} else None
    except Exception:
        logger.exception("Could not load locale for Telegram user %s", telegram_id)
        return None


async def update_user_locale(telegram_id: int, locale: str) -> bool:
    if not backend_sync_enabled() or locale not in {"ru", "en"}:
        return False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.put(
                f"{settings.BACKEND_API_URL.rstrip('/')}/users/by-telegram/{telegram_id}/locale",
                json={"locale": locale},
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            response.raise_for_status()
        return True
    except Exception:
        logger.exception("Could not update locale for Telegram user %s", telegram_id)
        return False


async def get_user_visa_cases(telegram_id: int) -> dict | None:
    if not backend_sync_enabled():
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{settings.BACKEND_API_URL.rstrip('/')}/api/service/visa-lifecycle/users/by-telegram/{telegram_id}/cases",
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            if response.status_code in {404, 503}:
                return None
            response.raise_for_status()
            payload = response.json()
            return payload if isinstance(payload, dict) else None
    except Exception:
        logger.exception("Could not load published visa cases for Telegram user %s", telegram_id)
        return None


async def claim_visa_notifications(limit: int = 20) -> list[dict]:
    if not backend_sync_enabled():
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.BACKEND_API_URL.rstrip('/')}/api/service/visa-lifecycle/deliveries/claim",
                params={"limit": limit},
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            if response.status_code == 503:
                return []
            response.raise_for_status()
            payload = response.json()
            return payload.get("items", []) if isinstance(payload, dict) else []
    except Exception:
        logger.exception("Could not claim visa notifications")
        return []


async def settle_visa_notification(delivery_id: int, payload: dict) -> bool:
    if not backend_sync_enabled():
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.BACKEND_API_URL.rstrip('/')}/api/service/visa-lifecycle/deliveries/{delivery_id}/settle",
                json=payload,
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            response.raise_for_status()
        return True
    except Exception:
        logger.exception("Could not settle visa notification %s", delivery_id)
        return False


async def get_web_outbox() -> list[dict]:
    if not backend_sync_enabled():
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.BACKEND_API_URL.rstrip('/')}/api/web/staff/outbox",
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            response.raise_for_status()
            payload = response.json()
            return payload if isinstance(payload, list) else []
    except Exception:
        logger.exception("Could not load website outbox")
        return []


async def mark_web_event_delivered(
    event_id: int,
    recipient_ids: list[int],
    *,
    status: str = "delivered",
    error_code: str | None = None,
) -> bool:
    if not backend_sync_enabled():
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                (
                    f"{settings.BACKEND_API_URL.rstrip('/')}"
                    f"/api/web/staff/outbox/{event_id}/delivered"
                ),
                json={"recipient_ids": recipient_ids, "status": status, "error_code": error_code},
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            response.raise_for_status()
        return True
    except Exception:
        logger.exception("Could not acknowledge website event %s", event_id)
        return False


async def get_web_conversation(conversation_id: int) -> dict | None:
    if not backend_sync_enabled():
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                (
                    f"{settings.BACKEND_API_URL.rstrip('/')}"
                    f"/api/web/staff/conversations/{conversation_id}"
                ),
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            payload = response.json()
            return payload if isinstance(payload, dict) else None
    except Exception:
        logger.exception("Could not load website conversation %s", conversation_id)
        return None


async def send_web_staff_message(
    conversation_id: int,
    *,
    actor_telegram_id: int,
    body: str,
    visibility: str,
) -> bool:
    if not backend_sync_enabled():
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                (
                    f"{settings.BACKEND_API_URL.rstrip('/')}"
                    f"/api/web/staff/conversations/{conversation_id}/messages"
                ),
                json={
                    "actor_telegram_id": actor_telegram_id,
                    "body": body,
                    "visibility": visibility,
                },
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            response.raise_for_status()
        return True
    except Exception:
        logger.exception(
            "Could not add %s message to website conversation %s",
            visibility,
            conversation_id,
        )
        return False


async def send_web_client_message(
    conversation_id: int,
    *,
    actor_telegram_id: int,
    body: str,
    idempotency_key: str,
) -> bool:
    if not backend_sync_enabled():
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.BACKEND_API_URL.rstrip('/')}/api/web/staff/conversations/{conversation_id}/client-messages",
                json={"actor_telegram_id": actor_telegram_id, "body": body, "idempotency_key": idempotency_key},
                headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN},
            )
            response.raise_for_status()
        return True
    except Exception:
        logger.exception("Could not add client reply to website conversation %s", conversation_id)
        return False
