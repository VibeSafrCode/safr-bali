import hashlib
import hmac
import json
import os
import secrets
import time
from urllib.parse import urlencode, urlparse

import httpx

from app.core.config import settings


def signed_init_data() -> str:
    values = {
        "auth_date": str(int(time.time())),
        "query_id": f"AAE-preview-{secrets.token_hex(8)}",
        "user": json.dumps(
            {
                "id": settings.DEFAULT_ADMIN_TELEGRAM_ID,
                "first_name": "Preview Admin",
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
    }
    check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(values.items())
    )
    secret = hmac.new(
        b"WebAppData",
        settings.TELEGRAM_BOT_TOKEN.encode(),
        hashlib.sha256,
    ).digest()
    values["hash"] = hmac.new(
        secret,
        check_string.encode(),
        hashlib.sha256,
    ).hexdigest()
    return urlencode(values)


def main() -> None:
    if settings.ENVIRONMENT != "preview":
        raise RuntimeError("Preview auth smoke is restricted to preview")
    if not settings.TELEGRAM_BOT_TOKEN:
        raise RuntimeError("Preview Telegram bot token is missing")
    if settings.DEFAULT_ADMIN_TELEGRAM_ID <= 0:
        raise RuntimeError("Preview admin Telegram ID is missing")

    base_url = os.environ["PREVIEW_BASE_URL"].rstrip("/")
    parsed_url = urlparse(base_url)
    if parsed_url.scheme != "https" or not parsed_url.hostname:
        raise RuntimeError("Preview base URL must be HTTPS")

    preview_gate_key = os.environ["PREVIEW_GATE_KEY"]
    if len(preview_gate_key) < 32:
        raise RuntimeError("Preview gate key must contain at least 32 characters")
    init_data = signed_init_data()

    with httpx.Client(base_url=base_url, timeout=20) as closed_client:
        closed = closed_client.get("/")

    with httpx.Client(
        base_url=base_url,
        timeout=20,
    ) as client:
        gate = client.get("/", params={"preview_key": preview_gate_key})
        first = client.post(
            "/mini-app/auth/session",
            json={"init_data": init_data},
        )
        replay = client.post(
            "/mini-app/auth/session",
            json={"init_data": init_data},
        )
        dashboard = client.get("/mini-app/me")
        dashboard_payload = dashboard.json() if dashboard.status_code == 200 else {}
        chat_before = client.get("/mini-app/chat")
        chat_send = client.post(
            "/mini-app/chat/messages",
            json={
                "body": "Preview Mini App message",
                "route_context": {
                    "country": "Бали",
                    "service": "visa",
                },
            },
        )
        chat_send_payload = chat_send.json() if chat_send.status_code == 201 else {}
        conversation_id = chat_send_payload.get("id")
        internal_note = client.post(
            f"/api/web/staff/conversations/{conversation_id}/messages",
            headers={"X-Service-Token": settings.SERVICE_API_TOKEN},
            json={
                "actor_telegram_id": settings.DEFAULT_ADMIN_TELEGRAM_ID,
                "body": "Preview internal note",
                "visibility": "internal",
            },
        )
        chat_after = client.get("/mini-app/chat")
        chat_payload = chat_after.json() if chat_after.status_code == 200 else {}
        logout = client.post("/mini-app/auth/logout")
        after_logout = client.get("/mini-app/me")

    statuses = {
        "closed_without_gate": closed.status_code,
        "gate": gate.status_code,
        "session": first.status_code,
        "replay": replay.status_code,
        "dashboard": dashboard.status_code,
        "identity_match": (
            dashboard_payload.get("telegram_id")
            == settings.DEFAULT_ADMIN_TELEGRAM_ID
        ),
        "balance": dashboard_payload.get("balance"),
        "referral_count": dashboard_payload.get("referral_count"),
        "orders": len(dashboard_payload.get("orders", [])),
        "chat_before": chat_before.status_code,
        "chat_send": chat_send.status_code,
        "internal_note": internal_note.status_code,
        "chat_after": chat_after.status_code,
        "chat_message_visible": any(
            item.get("body") == "Preview Mini App message"
            for item in chat_payload.get("messages", [])
        ),
        "internal_note_hidden": all(
            item.get("body") != "Preview internal note"
            for item in chat_payload.get("messages", [])
        ),
        "logout": logout.status_code,
        "after_logout": after_logout.status_code,
    }
    print(json.dumps(statuses, ensure_ascii=False, sort_keys=True))

    expected = {
        "closed_without_gate": 404,
        "gate": 200,
        "session": 200,
        "replay": 409,
        "dashboard": 200,
        "identity_match": True,
        "balance": 0,
        "referral_count": 0,
        "orders": 0,
        "chat_before": 200,
        "chat_send": 201,
        "internal_note": 201,
        "chat_after": 200,
        "chat_message_visible": True,
        "internal_note_hidden": True,
        "logout": 200,
        "after_logout": 401,
    }
    if statuses != expected:
        raise RuntimeError("Preview authentication smoke failed")


if __name__ == "__main__":
    main()
