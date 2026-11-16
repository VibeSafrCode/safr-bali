"""Actual callback, SQLite rollback and closed diagnostic labels. No network/auth."""
import unittest
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

import httpx
import jwt
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import web_portal
from app.core.security import rate_limit
from app.db.base import Base
from app.models.user import User
from app.models.web_portal import WebAuthChallenge, WebSession


class TelegramOidcFailureDiagnosticsTests(unittest.TestCase):
    def test_callback_failure_is_private_fail_closed_and_never_commits_identity(self):
        secret = "SYNTHETIC_PRIVATE_EXCEPTION_MARKER"
        request = httpx.Request("POST", "https://oauth.telegram.org/token?code=" + secret,
                                headers={"Authorization": "Basic " + secret})
        response = httpx.Response(400, request=request, json={"id_token": secret})
        cases = [
            ("token_exchange", httpx.HTTPStatusError(secret, request=request, response=response), "upstream_http", 400),
            ("token_exchange", httpx.ReadTimeout(secret, request=request), "upstream_timeout", None),
            ("token_exchange", httpx.ConnectError(secret, request=request), "upstream_transport", None),
            ("token_exchange", httpx.HTTPError(secret), "unknown", None),
            ("token_exchange", ValueError(secret), "invalid_value", None),
            ("token_validation", jwt.PyJWKClientConnectionError(secret), "jwks_connection", None),
            ("token_validation", jwt.PyJWKClientError(secret), "jwks_error", None),
            ("token_validation", jwt.InvalidSignatureError(secret), "jwt_signature", None),
            ("token_validation", jwt.ExpiredSignatureError(secret), "jwt_expired", None),
            ("token_validation", jwt.InvalidAudienceError(secret), "jwt_audience", None),
            ("token_validation", jwt.InvalidIssuerError(secret), "jwt_issuer", None),
            ("token_validation", jwt.MissingRequiredClaimError(secret), "jwt_required_claim", None),
            ("token_validation", jwt.InvalidAlgorithmError(secret), "jwt_algorithm", None),
            ("token_validation", jwt.DecodeError(secret), "jwt_error", None),
            ("token_validation", ValueError(secret), "invalid_value", None),
        ]
        engine = create_engine("sqlite+pysqlite:///:memory:")
        testing_session = sessionmaker(bind=engine)
        Base.metadata.create_all(engine)
        try:
            for stage, error, kind, status in cases:
                with self.subTest(stage=stage, kind=kind):
                    state = "s" * 43
                    binding = "b" * 43
                    callback_request = Request({
                        "type": "http",
                        "headers": [(b"cookie", f"{web_portal.oidc_binding_cookie_name(state)}={binding}".encode())],
                    })
                    with testing_session() as seed:
                        seed.query(WebAuthChallenge).delete()
                        seed.add(WebAuthChallenge(
                            state_hash=web_portal.token_hash(f"{state}:{binding}"),
                            code_verifier="synthetic-verifier", nonce="synthetic-nonce",
                            return_to="/", expires_at=datetime.utcnow() + timedelta(minutes=5),
                        ))
                        seed.commit()
                    db = testing_session()
                    with (
                        patch.object(web_portal, "SessionLocal", return_value=db),
                        patch.object(db, "commit", wraps=db.commit) as commit,
                        patch.object(web_portal, "upsert_oidc_user", wraps=web_portal.upsert_oidc_user) as upsert,
                        patch.object(web_portal, "exchange_telegram_code",
                                     side_effect=error if stage == "token_exchange" else None,
                                     return_value={"id_token":"synthetic-id-token"}) as exchange,
                        patch.object(web_portal, "decode_telegram_id_token", side_effect=error) as decode,
                        self.assertLogs(web_portal.logger, level="WARNING") as logged,
                        self.assertRaises(HTTPException) as raised,
                    ):
                        web_portal.auth_callback(callback_request, code="synthetic-once-code", state=state)
                    self.assertEqual(raised.exception.status_code, 401)
                    self.assertEqual(raised.exception.detail, "Telegram login failed")
                    commit.assert_not_called()
                    upsert.assert_not_called()
                    exchange.assert_called_once()
                    self.assertEqual(decode.call_count, 0 if stage == "token_exchange" else 1)
                    self.assertEqual(logged.output, [
                        "WARNING:app.api.web_portal:Telegram OIDC login failed "
                        f"stage={stage} kind={kind} upstream_status={status}"
                    ])
                    for marker in [secret, state, binding, "synthetic-verifier", "synthetic-nonce",
                                   "synthetic-id-token", "synthetic-once-code", "https://"]:
                        self.assertNotIn(marker, "\n".join(logged.output))
                    with testing_session() as check:
                        self.assertEqual(check.query(User).count(), 0)
                        self.assertEqual(check.query(WebSession).count(), 0)
                        self.assertIsNone(check.query(WebAuthChallenge).one().used_at)
        finally:
            engine.dispose()


def test_oidc_start_and_callback_require_own_binding_and_allow_parallel_tabs(monkeypatch):
    base = "https://app.example.test"
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(web_portal, "SessionLocal", factory)
    monkeypatch.setattr(web_portal, "web_login_configured", lambda: True)
    monkeypatch.setattr(web_portal.settings, "TELEGRAM_OIDC_REDIRECT_URI", f"{base}/api/web/auth/callback")
    monkeypatch.setattr(web_portal.settings, "WEB_COOKIE_SECURE", True)
    monkeypatch.setattr(web_portal, "decode_telegram_id_token", lambda *_: {"telegram_id": 90000001})
    app = FastAPI()
    app.include_router(web_portal.router)
    app.dependency_overrides[rate_limit] = lambda: None
    start_path = "/api/web/auth/start"
    callback_path = "/api/web/auth/callback"
    try:
        with (
            TestClient(app, base_url=base, follow_redirects=False) as own,
            TestClient(app, base_url=base, follow_redirects=False) as other,
            patch.object(web_portal, "exchange_telegram_code", return_value={"id_token": "synthetic"}) as exchange,
        ):
            redirect = own.get("https://site.example.test" + start_path, params={"return_to": "/en/", "via": "synthetic"})
            assert redirect.status_code == 302 and "set-cookie" not in redirect.headers
            assert redirect.headers["location"] == base + start_path + "?return_to=%2Fen%2F&via=synthetic"
            first = own.get(redirect.headers["location"])
            second = own.get(start_path)
            states = [parse_qs(urlsplit(response.headers["location"]).query)["state"][0] for response in (first, second)]
            assert states[0] != states[1]
            for response in (first, second):
                cookie = response.headers["set-cookie"]
                assert cookie.startswith("__Host-safr_oidc_")
                assert all(flag in cookie for flag in ("HttpOnly", "Secure", "Path=/", "SameSite=lax", "Max-Age=600"))
                assert "Domain=" not in cookie
            params = {"code": "synthetic", "state": states[0]}
            assert other.get(callback_path, params=params).status_code == 400
            exchange.assert_not_called()
            assert own.get(callback_path, params=params).status_code == 303
            assert own.get(callback_path, params=params).status_code == 400
            assert own.get(callback_path, params={**params, "state": states[1]}).status_code == 303
            expired = own.get(start_path)
            expired_state = parse_qs(urlsplit(expired.headers["location"]).query)["state"][0]
            with factory() as db:
                db.query(WebAuthChallenge).filter(WebAuthChallenge.used_at.is_(None)).update({
                    WebAuthChallenge.expires_at: web_portal.utcnow() - timedelta(seconds=1),
                })
                db.commit()
            assert own.get(callback_path, params={**params, "state": expired_state}).status_code == 400
            assert exchange.call_count == 2
    finally:
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
