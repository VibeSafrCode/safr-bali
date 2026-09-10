"""Self-only, bounded Points history across both authenticated surfaces."""
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.api import mini_app, web_portal
from app.db.base import Base
from app.models.points_ledger import PointsLedger
from app.models.user import User
from app.services.account_history import account_points_history


class AccountHistoryTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:",
                                    connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.addCleanup(self.engine.dispose)
        with self.Session() as db:
            db.add_all([User(id=i, telegram_id=100 + i, ref_code=f"SAFE{i}", status="active") for i in (1, 2)])
            db.commit()
        self.app = FastAPI()
        self.app.include_router(web_portal.router)
        self.app.include_router(mini_app.router)
        self.client = TestClient(self.app)
        for module in (web_portal, mini_app):
            p = patch.object(module, "SessionLocal", self.Session)
            p.start()
            self.addCleanup(p.stop)

    def seed(self, count=35):
        with self.Session() as db:
            for i in range(count):
                db.add(PointsLedger(user_id=1, operation_type="manual_accrual", amount=10,
                                   balance_after=(i + 1) * 10, comment="staff-private", created_by_admin_id=2,
                                   idempotency_key=f"private-{i}", reward_rule_snapshot={"private": True}))
            db.add(PointsLedger(user_id=2, operation_type="manual_accrual", amount=999, balance_after=999))
            db.commit()

    def authenticate(self):
        user = User(id=1, telegram_id=101, ref_code="SAFE1", status="active", locale="ru")
        self.app.dependency_overrides[web_portal.session_user] = lambda: user
        self.app.dependency_overrides[mini_app.require_mini_app_user] = lambda: user

    def test_unauthenticated_routes_reject_without_reading_history(self):
        with patch.object(web_portal, "account_points_history") as web_history, patch.object(mini_app, "account_points_history") as mini_history:
            for path in ("/api/web/account", "/mini-app/me"):
                self.assertEqual(self.client.get(path).status_code, 401)
            web_history.assert_not_called()
            mini_history.assert_not_called()

    def test_surfaces_share_exact_self_projection_ignore_requested_other_user(self):
        self.seed()
        self.authenticate()
        responses = [self.client.get(path + "?user_id=2") for path in ("/api/web/account", "/mini-app/me")]
        for response in responses:
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.headers["cache-control"], "private, no-store")
        histories = [response.json()["points_history"] for response in responses]
        self.assertEqual(histories[0], histories[1])
        history = histories[0]
        self.assertEqual(history["limit"], 30)
        self.assertEqual(len(history["items"]), 30)
        self.assertTrue(history["has_more"])
        self.assertEqual([item["id"] for item in history["items"]], list(range(35, 5, -1)))
        self.assertEqual(set(history["items"][0]), {"id", "operation_type", "amount", "balance_after", "created_at"})
        self.assertTrue(history["items"][0]["created_at"].endswith("+00:00"))
        self.assertNotIn("private", str(history))
        self.assertEqual(responses[0].json()["balance"], 350)
        with self.Session() as db:
            self.assertEqual(db.query(PointsLedger).count(), 36)

    def test_empty_and_exact_limit_are_not_truncated(self):
        with self.Session() as db:
            self.assertEqual(account_points_history(db, 1), {"items": [], "has_more": False, "limit": 30})
        self.seed(30)
        with self.Session() as db:
            self.assertFalse(account_points_history(db, 1)["has_more"])

    def test_legacy_placeholder_referral_code_is_not_offered_as_invitation(self):
        with self.Session() as db:
            db.get(User, 1).ref_code = "TG101"
            db.commit()
        user = User(id=1, telegram_id=101, ref_code="TG101", status="active", locale="ru")
        self.app.dependency_overrides[web_portal.session_user] = lambda: user
        self.app.dependency_overrides[mini_app.require_mini_app_user] = lambda: user
        for path in ("/api/web/account", "/mini-app/me"):
            self.assertIsNone(self.client.get(path).json()["referral_link"])


if __name__ == "__main__":
    unittest.main()
