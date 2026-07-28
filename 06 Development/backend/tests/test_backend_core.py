import unittest
import hashlib
import hmac
import json
from datetime import datetime, timedelta
from urllib.parse import urlencode
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

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
from app.api.mini_app import (
    issue_mini_app_session,
    rotate_mini_app_session,
    token_hash as mini_app_token_hash,
    validate_telegram_init_data,
)
from app.api.web_portal import (
    decode_telegram_id_token,
    pkce_challenge,
    safe_return_path,
    token_hash,
    upsert_oidc_user,
)
from app.db.base import Base
from app.models.referral import Referral
from app.models.user import User
from app.models.web_portal import WebOutboxEvent
from app.models.mini_app_session import MiniAppSession


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
                now=1_700_000_601,
            )

    def test_mini_app_session_rotates_refresh_tokens(self):
        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        TestingSession = sessionmaker(bind=engine)
        db = TestingSession()
        now = datetime(2026, 7, 28, 10, 0, 0)
        try:
            user = User(
                telegram_id=777,
                first_name="Клиент",
                language="ru",
                role="client",
                ref_code="TG777",
                status="active",
            )
            db.add(user)
            db.commit()

            issued = issue_mini_app_session(db, user, now=now)
            stored = db.query(MiniAppSession).one()
            self.assertEqual(
                stored.access_token_hash,
                mini_app_token_hash(issued.access_token),
            )
            self.assertEqual(
                stored.access_expires_at,
                now + timedelta(minutes=30),
            )

            rotated = rotate_mini_app_session(
                db,
                issued.refresh_token,
                now=now + timedelta(minutes=10),
            )
            self.assertIsNotNone(rotated)
            self.assertNotEqual(rotated.refresh_token, issued.refresh_token)
            self.assertIsNone(
                rotate_mini_app_session(
                    db,
                    issued.refresh_token,
                    now=now + timedelta(minutes=11),
                )
            )
        finally:
            db.close()

    def test_web_auth_uses_safe_paths_and_pkce(self):
        self.assertEqual(safe_return_path("/account?tab=orders"), "/account?tab=orders")
        self.assertEqual(safe_return_path("https://evil.example"), "/account")
        self.assertEqual(safe_return_path("//evil.example"), "/account")
        self.assertEqual(
            pkce_challenge("test-verifier"),
            "JBbiqONGWPaAmwXk_8bT6UnlPfrn65D32eZlJS-zGG0",
        )
        self.assertEqual(len(token_hash("opaque-session")), 64)

        with (
            patch(
                "app.api.web_portal.PyJWKClient.get_signing_key_from_jwt",
                return_value=type("Key", (), {"key": "public-key"})(),
            ),
            patch(
                "app.api.web_portal.jwt.decode",
                return_value={
                    "sub": "oidc-subject",
                    "id": 55,
                    "nonce": "nonce",
                },
            ),
        ):
            claims = decode_telegram_id_token("token", "nonce")
        self.assertEqual(claims["telegram_id"], 55)

    def test_website_registration_keeps_one_referral_owner(self):
        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        TestingSession = sessionmaker(bind=engine)
        db = TestingSession()
        try:
            admin = User(
                telegram_id=1,
                first_name="Главный админ",
                language="ru",
                role="admin",
                ref_code="ADMIN",
                status="active",
            )
            db.add(admin)
            db.commit()
            with patch("app.api.web_portal.settings.DEFAULT_ADMIN_TELEGRAM_ID", 1):
                user, is_new = upsert_oidc_user(
                    db,
                    {
                        "telegram_id": 55,
                        "given_name": "Клиент",
                        "preferred_username": "client",
                    },
                    None,
                )
                db.commit()
                first_inviter = user.invited_by_user_id
                user_again, second_is_new = upsert_oidc_user(
                    db,
                    {
                        "telegram_id": 55,
                        "given_name": "Новое имя",
                        "preferred_username": "client",
                    },
                    "OTHER",
                )
                db.commit()

            self.assertTrue(is_new)
            self.assertFalse(second_is_new)
            self.assertEqual(user_again.invited_by_user_id, first_inviter)
            self.assertEqual(
                db.query(Referral).filter(Referral.child_user_id == user.id).count(),
                1,
            )
            self.assertEqual(
                db.query(WebOutboxEvent)
                .filter(WebOutboxEvent.event_type == "web_user_registered")
                .count(),
                1,
            )
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
