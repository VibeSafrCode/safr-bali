import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.api.users import make_ref_code
from app.core.security import (
    InMemoryRateLimiter,
    require_admin_token,
    require_service_token,
)
from app.db.session import check_database_connection
from app.main import health_check


class BackendCoreTests(unittest.IsolatedAsyncioTestCase):
    def test_health_and_database_smoke_checks(self):
        self.assertEqual(health_check()["status"], "ok")
        self.assertTrue(check_database_connection())

    def test_referral_code_is_stable(self):
        self.assertEqual(make_ref_code(123456), "TG123456")

    async def test_service_and_admin_tokens_are_required(self):
        await require_service_token("service-test-token")
        await require_admin_token("admin-test-token")

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
            self.assertFalse(limiter.check("client", limit=1, window_seconds=60))
            self.assertTrue(limiter.check("client", limit=1, window_seconds=60))


if __name__ == "__main__":
    unittest.main()
