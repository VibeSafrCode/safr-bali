"""Actual callback, SQLite rollback and closed diagnostic labels. No network/auth."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import httpx
import jwt
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api import web_portal
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
                    state = "synthetic-challenge-state"
                    with testing_session() as seed:
                        seed.query(WebAuthChallenge).delete()
                        seed.add(WebAuthChallenge(
                            state_hash=web_portal.token_hash(state),
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
                        web_portal.auth_callback(code="synthetic-once-code", state=state)
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
                    for marker in [secret, state, "synthetic-verifier", "synthetic-nonce",
                                   "synthetic-id-token", "synthetic-once-code", "https://"]:
                        self.assertNotIn(marker, "\n".join(logged.output))
                    with testing_session() as check:
                        self.assertEqual(check.query(User).count(), 0)
                        self.assertEqual(check.query(WebSession).count(), 0)
                        self.assertIsNone(check.query(WebAuthChallenge).one().used_at)
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
