from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.mini_app import update_mini_app_locale
from app.api.web_portal import WebLocaleRequest, update_web_locale
from app.api.web_admin import admin_csrf_token
from app.api.users import (
    UserRegisterRequest,
    get_user_locale,
    register_user,
    update_user_locale,
)
from app.db.base import Base
from app.models.user import User
from app.schemas.locale import LocaleUpdateRequest
from app.services.locales import locale_from_language
from starlette.requests import Request


class LocaleContractTests(TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)

    def tearDown(self):
        self.engine.dispose()

    def _user(self, telegram_id: int, locale: str = "ru") -> User:
        db = self.Session()
        user = User(
            telegram_id=telegram_id,
            first_name="Client",
            language="ru",
            locale=locale,
            role="client",
            ref_code=f"TG{telegram_id}",
            status="active",
        )
        db.add(user)
        db.commit()
        db.close()
        return user

    def test_language_fallback_is_strictly_ru_or_en(self):
        self.assertEqual(locale_from_language("en-US"), "en")
        self.assertEqual(locale_from_language("ru_RU"), "ru")
        self.assertEqual(locale_from_language("de"), "ru")
        self.assertEqual(locale_from_language(None), "ru")

    def test_registration_backfills_new_user_but_never_overwrites_saved_locale(self):
        existing = self._user(100, "en")
        with patch("app.api.users.SessionLocal", self.Session):
            response = register_user(
                UserRegisterRequest(telegram_id=100, language="ru")
            )
            created = register_user(
                UserRegisterRequest(telegram_id=200, language="en-GB")
            )
        self.assertEqual(response["locale"], "en")
        self.assertEqual(created["locale"], "en")
        db = self.Session()
        self.assertEqual(db.get(User, existing.id).locale, "en")
        db.close()

    def test_service_and_mini_app_updates_are_idempotent(self):
        user = self._user(300, "ru")
        payload = LocaleUpdateRequest(locale="en")
        with patch("app.api.users.SessionLocal", self.Session):
            first = update_user_locale(300, payload)
            replay = update_user_locale(300, payload)
            stored = get_user_locale(300)
        with patch("app.api.mini_app.SessionLocal", self.Session):
            mini_replay = update_mini_app_locale(
                payload,
                user=SimpleNamespace(id=user.id),
            )
        self.assertTrue(first["changed"])
        self.assertFalse(replay["changed"])
        self.assertEqual(stored["locale"], "en")
        self.assertFalse(mini_replay["changed"])

    def test_browser_locale_update_requires_exact_origin_and_session_csrf(self):
        user = self._user(400, "ru")
        origin = "https://app.example.invalid"
        request = Request({"type": "http", "method": "PATCH", "path": "/api/web/locale", "headers": [(b"origin", origin.encode())]})
        with (
            patch("app.api.web_portal.SessionLocal", self.Session),
            patch("app.api.web_portal.settings.APPLICATION_URL", origin),
        ):
            result = update_web_locale(WebLocaleRequest(locale="en"), request, user, "session-fixture", admin_csrf_token("session-fixture"))
            self.assertEqual(result["locale"], "en")
            with self.assertRaises(Exception):
                update_web_locale(WebLocaleRequest(locale="ru"), request, user, "session-fixture", "wrong")
