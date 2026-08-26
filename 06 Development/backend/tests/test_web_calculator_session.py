from __future__ import annotations

import hashlib
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.api.web_portal import require_web_session_write, session_user
from app.main import app
from app.models.user import User


class WebCalculatorSessionTests(unittest.TestCase):
    def tearDown(self):
        app.dependency_overrides.clear()

    def test_exchange_options_are_closed_without_web_session(self):
        response = TestClient(app).get("/api/web/exchange/options")
        self.assertEqual(response.status_code, 401)

    def test_authenticated_web_session_can_read_exchange_options(self):
        user = User(id=7, telegram_id=700, status="active", ref_code="WEB-CALC")
        app.dependency_overrides[session_user] = lambda: user
        routes = [{
            "route_code": "USDT_TO_IDR_BANK",
            "give_currency": "USDT",
            "receive_currency": "IDR_BANK",
            "amount_sides": ["give", "receive"],
            "enabled": True,
        }]
        with patch("app.api.web_portal.active_route_options", return_value=routes):
            response = TestClient(app).get("/api/web/exchange/options")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["supported_pairs"], routes)

    def test_web_exchange_writes_require_exact_origin_and_session_csrf(self):
        user = User(id=7, telegram_id=700, status="active", ref_code="WEB-CALC")
        session = "opaque-session"
        csrf = hashlib.sha256(f"safr-admin-csrf:{session}".encode()).hexdigest()
        request = Request({
            "type": "http",
            "method": "POST",
            "path": "/api/web/exchange/quotes",
            "headers": [(b"origin", b"https://app.safrway.online")],
        })
        with (
            patch("app.api.web_portal.settings.ENVIRONMENT", "production"),
            patch(
                "app.api.web_portal.settings.APPLICATION_URL",
                "https://app.safrway.online",
            ),
        ):
            self.assertEqual(
                require_web_session_write(request, user, session, csrf),
                user,
            )
            with self.assertRaises(HTTPException):
                require_web_session_write(request, user, session, "wrong")

            evil_request = Request({
                "type": "http",
                "method": "POST",
                "path": "/api/web/exchange/quotes",
                "headers": [(b"origin", b"https://evil.example")],
            })
            with self.assertRaises(HTTPException):
                require_web_session_write(evil_request, user, session, csrf)


if __name__ == "__main__":
    unittest.main()
