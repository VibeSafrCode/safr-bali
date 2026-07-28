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

    username = os.environ["PREVIEW_BASIC_AUTH_USERNAME"]
    password = os.environ["PREVIEW_BASIC_AUTH_PASSWORD"]
    init_data = signed_init_data()

    with httpx.Client(
        base_url=base_url,
        auth=(username, password),
        timeout=20,
    ) as client:
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
        logout = client.post("/mini-app/auth/logout")
        after_logout = client.get("/mini-app/me")

    statuses = {
        "session": first.status_code,
        "replay": replay.status_code,
        "dashboard": dashboard.status_code,
        "identity_match": (
            dashboard_payload.get("telegram_id")
            == settings.DEFAULT_ADMIN_TELEGRAM_ID
        ),
        "balance": dashboard_payload.get("balance"),
        "logout": logout.status_code,
        "after_logout": after_logout.status_code,
    }
    print(json.dumps(statuses, ensure_ascii=False, sort_keys=True))

    expected = {
        "session": 200,
        "replay": 409,
        "dashboard": 200,
        "identity_match": True,
        "balance": 0,
        "logout": 200,
        "after_logout": 401,
    }
    if statuses != expected:
        raise RuntimeError("Preview authentication smoke failed")


if __name__ == "__main__":
    main()
