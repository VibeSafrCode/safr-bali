import unittest
import hashlib
import hmac
import json
from datetime import datetime, timedelta
from urllib.parse import urlencode
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
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
    require_mini_app_user,
    rotate_mini_app_session,
    token_hash as mini_app_token_hash,
    validate_telegram_init_data,
)
from app.api.web_portal import (
    account_redirect_location,
    auth_redirect_location,
    auth_me,
    decode_telegram_id_token,
    optional_session_user,
    pkce_challenge,
    safe_return_path,
    token_hash,
    upsert_oidc_user,
    web_session_cookie_domain,
)
from app.db.base import Base
from app.models.referral import Referral
from app.models.user import User
from app.models.web_portal import WebMessage, WebOutboxEvent, WebSession
from app.models.mini_app_session import MiniAppSession
from app.services.client_portal import (
    load_client_chat,
    send_client_chat_message,
)


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

    def test_stale_mini_app_session_refresh_returns_attached_user_data(self):
        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        TestingSession = sessionmaker(bind=engine)
        db = TestingSession()
        try:
            user = User(telegram_id=780, first_name="Mini client", locale="ru", role="client", ref_code="TG780", status="active")
            db.add(user); db.commit(); db.refresh(user)
            issued = issue_mini_app_session(db, user)
            stored = db.query(MiniAppSession).one()
            stored.last_seen_at = datetime.utcnow() - timedelta(minutes=6)
            db.commit()
        finally:
            db.close()
        try:
            with patch("app.api.mini_app.SessionLocal", TestingSession):
                resolved = require_mini_app_user(issued.access_token)
            self.assertEqual(resolved.telegram_id, 780)
            self.assertEqual(resolved.first_name, "Mini client")
        finally:
            engine.dispose()

    def test_telegram_init_data_can_be_exchanged_only_once(self):
        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        TestingSession = sessionmaker(bind=engine)
        db = TestingSession()
        try:
            user = User(
                telegram_id=778,
                first_name="Клиент",
                language="ru",
                role="client",
                ref_code="TG778",
                status="active",
            )
            db.add(user)
            db.commit()

            issue_mini_app_session(
                db,
                user,
                init_data_hash="a" * 64,
            )
            with self.assertRaises(IntegrityError):
                issue_mini_app_session(
                    db,
                    user,
                    init_data_hash="a" * 64,
                )
            db.rollback()
            self.assertEqual(db.query(MiniAppSession).count(), 1)
        finally:
            db.close()

    def test_web_auth_uses_safe_paths_and_pkce(self):
        self.assertEqual(safe_return_path("/account"), "/account/")
        self.assertEqual(safe_return_path("/account/orders/"), "/account/orders/")
        self.assertEqual(safe_return_path("/account?tab=orders"), "/account/")
        self.assertEqual(safe_return_path("/account/?access_token=secret"), "/account/")
        self.assertEqual(safe_return_path("https://evil.example"), "/account/")
        self.assertEqual(safe_return_path("//evil.example"), "/account/")
        self.assertEqual(safe_return_path("/calculator/"), "/calculator/")
        self.assertEqual(safe_return_path("/"), "/")
        self.assertEqual(safe_return_path("/en/"), "/en/")
        self.assertEqual(
            safe_return_path("/bali/exchange/usdt-idr/"),
            "/bali/exchange/usdt-idr/",
        )
        self.assertEqual(
            safe_return_path("/en/bali/exchange/usdt-idr/"),
            "/en/bali/exchange/usdt-idr/",
        )
        self.assertEqual(safe_return_path("/api/web/auth/me/"), "/account/")

    def test_web_auth_returns_to_public_site_and_shares_cookie_only_in_production(self):
        with (
            patch("app.api.web_portal.settings.ENVIRONMENT", "production"),
            patch(
                "app.api.web_portal.settings.APPLICATION_URL",
                "https://app.safrway.online",
            ),
            patch(
                "app.api.web_portal.settings.WEBSITE_URL",
                "https://safrway.online",
            ),
        ):
            self.assertEqual(
                auth_redirect_location("/"),
                "https://safrway.online/",
            )
            self.assertEqual(
                auth_redirect_location("/en/"),
                "https://safrway.online/en/",
            )
            self.assertEqual(
                auth_redirect_location("/bali/exchange/usdt-idr/"),
                "https://safrway.online/bali/exchange/usdt-idr/",
            )
            self.assertEqual(
                auth_redirect_location("/account/visas/"),
                "https://app.safrway.online/account/visas/",
            )
            self.assertEqual(web_session_cookie_domain(), ".safrway.online")
        with patch("app.api.web_portal.settings.ENVIRONMENT", "local"):
            self.assertIsNone(web_session_cookie_domain())

    def test_account_source_redirect_preserves_only_safe_return_path(self):
        with patch("app.api.web_portal.settings.APPLICATION_URL", "https://app.safrway.online"):
            self.assertEqual(
                account_redirect_location("/account/orders/"),
                "https://app.safrway.online/account/?return_to=%2Faccount%2Forders%2F",
            )
            self.assertEqual(
                account_redirect_location("https://evil.example"),
                "https://app.safrway.online/account/",
            )
            self.assertEqual(
                account_redirect_location(None),
                "https://app.safrway.online/account/",
            )
        with (
            patch("app.api.web_portal.settings.ENVIRONMENT", "production"),
            patch(
                "app.api.web_portal.settings.APPLICATION_URL",
                "https://evil.example",
            ),
        ):
            with self.assertRaises(HTTPException):
                account_redirect_location("/account/")

    def test_web_auth_status_is_a_normal_guest_response(self):
        with patch(
            "app.api.web_portal.settings.TELEGRAM_OIDC_CLIENT_ID",
            "",
        ), patch(
            "app.api.web_portal.settings.TELEGRAM_OIDC_CLIENT_SECRET",
            "",
        ):
            self.assertEqual(
                auth_me(session_token=None),
                {
                    "authenticated": False,
                    "login_configured": False,
                },
            )
        self.assertEqual(
            pkce_challenge("test-verifier"),
            "JBbiqONGWPaAmwXk_8bT6UnlPfrn65D32eZlJS-zGG0",
        )
        self.assertEqual(len(token_hash("opaque-session")), 64)

    def test_stale_web_session_refresh_returns_attached_user_data(self):
        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        TestingSession = sessionmaker(bind=engine)
        db = TestingSession()
        raw_token = "stale-session-token"
        try:
            user = User(
                telegram_id=779,
                first_name="Session client",
                locale="en",
                role="client",
                ref_code="TG779",
                status="active",
            )
            db.add(user)
            db.flush()
            db.add(WebSession(
                user_id=user.id,
                token_hash=token_hash(raw_token),
                expires_at=datetime.utcnow() + timedelta(days=1),
                last_seen_at=datetime.utcnow() - timedelta(minutes=16),
            ))
            db.commit()
        finally:
            db.close()

        try:
            with patch("app.api.web_portal.SessionLocal", TestingSession):
                resolved = optional_session_user(raw_token)
            self.assertIsNotNone(resolved)
            self.assertEqual(resolved.telegram_id, 779)
            self.assertEqual(resolved.role, "client")
            self.assertEqual(resolved.locale, "en")
        finally:
            engine.dispose()

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

    def test_client_chat_is_shared_without_exposing_internal_messages(self):
        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        TestingSession = sessionmaker(bind=engine)
        db = TestingSession()
        try:
            user = User(
                telegram_id=618,
                first_name="Клиент",
                language="ru",
                role="client",
                ref_code="SAFE618",
                status="active",
            )
            db.add(user)
            db.commit()

            chat = send_client_chat_message(
                db,
                user_id=user.id,
                body="Нужна консультация по визе",
                route_context={
                    "country": "Бали",
                    "section": "Визы",
                    "service": "D12",
                },
                source="mini_app",
            )

            self.assertEqual(chat["messages"][0]["author_type"], "client")
            self.assertEqual(chat["route_context"]["service"], "D12")
            db.add(
                WebMessage(
                    conversation_id=chat["id"],
                    author_type="staff",
                    body="Внутренняя заметка",
                    visibility="internal",
                )
            )
            db.commit()
            loaded = load_client_chat(db, user.id)
            self.assertEqual(loaded["id"], chat["id"])
            self.assertEqual(len(loaded["messages"]), 1)
            self.assertEqual(
                db.query(WebOutboxEvent)
                .filter(WebOutboxEvent.event_type == "web_chat_message")
                .count(),
                1,
            )
        finally:
            db.close()

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
                    "ADMIN",
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
