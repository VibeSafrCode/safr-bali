import unittest
import hashlib
import hmac
import json
from urllib.parse import urlencode
from unittest.mock import patch

from fastapi import HTTPException

from app.api.users import make_ref_code
from app.core.security import (
    InMemoryRateLimiter,
    require_admin_token,
    require_service_token,
)
from app.core.config import settings
from app.db.session import check_database_connection
from app.main import health_check
from app.api.bot_events import BotEventCreateRequest
from app.models.bot_runtime_event import BotRuntimeEvent
from app.api.mini_app import validate_telegram_init_data


class BackendCoreTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _signed_init_data(bot_token: str, auth_date: int = 1_700_000_000) -> str:
        values = {
            "auth_date": str(auth_date),
            "query_id": "AAE-test",
            "user": json.dumps(
                {"id": 123456, "first_name": "Никита"},
                ensure_ascii=False,
                separators=(",", ":"),
            ),
        }
        check_string = "\n".join(
            f"{key}={value}" for key, value in sorted(values.items())
        )
        secret = hmac.new(
            b"WebAppData",
            bot_token.encode(),
            hashlib.sha256,
        ).digest()
        values["hash"] = hmac.new(
            secret,
            check_string.encode(),
            hashlib.sha256,
        ).hexdigest()
        return urlencode(values)

    def test_health_and_database_smoke_checks(self):
        self.assertEqual(health_check()["status"], "ok")
        self.assertTrue(check_database_connection())

    def test_referral_code_is_stable(self):
        self.assertEqual(make_ref_code(123456), "TG123456")

    def test_runtime_event_schema_supports_internal_staff_threads(self):
        payload = BotEventCreateRequest(
            client_telegram_id=500,
            actor_telegram_id=6,
            event_type="staff_thread_message",
            text="Внутреннее сообщение",
            payload={"country": "Таиланд"},
        )
        self.assertEqual(payload.client_telegram_id, 500)
        self.assertEqual(BotRuntimeEvent.__tablename__, "bot_runtime_events")

    async def test_service_and_admin_tokens_are_required(self):
        await require_service_token(settings.SERVICE_API_TOKEN)
        await require_admin_token(settings.ADMIN_API_TOKEN)

        with self.assertRaises(HTTPException) as service_error:
            await require_service_token("wrong")
        self.assertEqual(service_error.exception.status_code, 401)

        with self.assertRaises(HTTPException) as admin_error:
            await require_admin_token("")
        self.assertEqual(admin_error.exception.status_code, 401)

    def test_rate_limiter_releases_expired_requests(self):
        limiter = InMemoryRateLimiter()

        with patch("app.core.security.time.time", side_effect=[0, 1, 61]):
            self.assertTrue(limiter.check("client", limit=1, window_seconds=60))

    def test_telegram_mini_app_signature_and_expiry_are_validated(self):
        token = "123456:test-token"
        init_data = self._signed_init_data(token)

        user = validate_telegram_init_data(
            init_data,
            token,
            now=1_700_000_100,
        )

        self.assertEqual(user["id"], 123456)
        with self.assertRaisesRegex(ValueError, "signature"):
            validate_telegram_init_data(
                f"{init_data}&tampered=1",
                token,
                now=1_700_000_100,
            )
        with self.assertRaisesRegex(ValueError, "expired"):
            validate_telegram_init_data(
                init_data,
                token,
                now=1_700_100_000,
            )
            self.assertFalse(limiter.check("client", limit=1, window_seconds=60))
            self.assertTrue(limiter.check("client", limit=1, window_seconds=60))


if __name__ == "__main__":
    unittest.main()
