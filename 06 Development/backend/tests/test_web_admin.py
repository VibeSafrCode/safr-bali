from __future__ import annotations

import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

import app.models  # noqa: F401
from app.api.web_admin import (
    admin_csrf_token,
    dashboard,
    dashboard_drilldown,
    NewUserReviewRequest,
    review_new_user,
    require_admin_write,
    require_web_admin,
)
from app.core.config import settings
from app.db.base import Base
from app.main import app
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaType


class WebAdminSecurityTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        db = self.Session()
        self.admin = User(telegram_id=1, role="admin", ref_code="ROOT", status="active")
        self.client = User(telegram_id=2, role="client", ref_code="CLIENT", status="active")
        db.add_all([self.admin, self.client])
        db.commit()
        db.refresh(self.admin)
        db.refresh(self.client)
        db.expunge_all()
        db.close()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.engine.dispose()

    def test_client_role_is_denied(self):
        with self.assertRaises(HTTPException) as error:
            require_web_admin(self.client)
        self.assertEqual(error.exception.status_code, 403)

    def test_noncanonical_admin_identity_is_denied(self):
        other = User(id=99, telegram_id=999, role="admin", ref_code="OTHER", status="active")
        with patch("app.api.web_admin.settings.DEFAULT_ADMIN_TELEGRAM_ID", 1):
            with self.assertRaises(HTTPException):
                require_web_admin(other)

    def test_csrf_requires_exact_origin_and_session_bound_token(self):
        origin = settings.APPLICATION_URL.rstrip("/")
        request = Request({"type": "http", "method": "PATCH", "path": "/", "headers": [(b"origin", origin.encode())]})
        token = admin_csrf_token("session-value")
        with patch("app.api.web_admin.settings.DEFAULT_ADMIN_TELEGRAM_ID", 1):
            self.assertEqual(require_admin_write(request, self.admin, "session-value", token), self.admin)
        with self.assertRaises(HTTPException):
            require_admin_write(request, self.admin, "session-value", "wrong")
        evil = Request({"type": "http", "method": "PATCH", "path": "/", "headers": [(b"origin", b"https://evil.example")]})
        with self.assertRaises(HTTPException):
            require_admin_write(evil, self.admin, "session-value", token)

    def test_web_admin_uses_session_actor_not_static_admin_token(self):
        app.dependency_overrides[require_web_admin] = lambda: self.admin
        with patch("app.api.web_admin.SessionLocal", self.Session):
            response = TestClient(app).get("/api/web/admin/users")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 2)

    def test_unauthenticated_web_admin_is_closed(self):
        response = TestClient(app).get("/api/web/admin/users")
        self.assertEqual(response.status_code, 401)

    def test_dashboard_new_user_count_matches_drilldown_and_review_is_reversible(self):
        db = self.Session(); row = db.query(User).filter(User.telegram_id == 2).one(); row.created_at = datetime.utcnow() - timedelta(days=1); db.commit(); db.close()
        with patch("app.api.web_admin.SessionLocal", self.Session):
            metrics = dashboard(self.admin)
            listing = dashboard_drilldown("new_users_7d", 1, 30, self.admin)
            self.assertEqual(metrics["new_users_7d"], listing["total"])
            review_new_user(self.client.id, NewUserReviewRequest(reviewed=True, comment="Fixture reviewed"), self.admin)
            self.assertEqual(dashboard(self.admin)["new_users_7d"], metrics["new_users_7d"] - 1)
            reviewed = dashboard_drilldown("reviewed_users", 1, 30, self.admin)
            self.assertEqual(reviewed["total"], 1)
            self.assertEqual(reviewed["items"][0]["id"], self.client.id)
            replay = review_new_user(self.client.id, NewUserReviewRequest(reviewed=True, comment="Fixture replay"), self.admin)
            self.assertTrue(replay["idempotent_replay"])
            review_new_user(self.client.id, NewUserReviewRequest(reviewed=False, comment="Fixture reopened"), self.admin)
            self.assertEqual(dashboard(self.admin)["new_users_7d"], metrics["new_users_7d"])
            self.assertEqual(dashboard_drilldown("reviewed_users", 1, 30, self.admin)["total"], 0)

    def test_zero_metric_returns_clear_empty_contract(self):
        with patch("app.api.web_admin.SessionLocal", self.Session):
            result = dashboard_drilldown("visa_cases_attention", 1, 30, self.admin)
        self.assertEqual(result["total"], 0)
        self.assertEqual(result["items"], [])

    def test_active_visa_counter_and_list_exclude_draft_hidden_and_terminal(self):
        db = self.Session(); visa_type = VisaType(country_code="ID", code="B1", name="B1", version=1, rules_verified=False); db.add(visa_type); db.flush()
        db.add_all([
            VisaCase(user_id=self.client.id, visa_type_id=visa_type.id, assigned_admin_id=self.admin.id, publication_status="PUBLISHED", lifecycle_status="ACTIVE"),
            VisaCase(user_id=self.client.id, visa_type_id=visa_type.id, assigned_admin_id=self.admin.id, publication_status="DRAFT", lifecycle_status="ACTIVE"),
            VisaCase(user_id=self.client.id, visa_type_id=visa_type.id, assigned_admin_id=self.admin.id, publication_status="HIDDEN", lifecycle_status="ACTIVE"),
            VisaCase(user_id=self.client.id, visa_type_id=visa_type.id, assigned_admin_id=self.admin.id, publication_status="PUBLISHED", lifecycle_status="EXPIRED"),
        ]); db.commit(); db.close()
        with patch("app.api.web_admin.SessionLocal", self.Session), patch("app.api.web_admin.settings.VISA_LIFECYCLE_ENABLED", True), patch("app.api.web_admin.settings.ADMIN_CLIENT_CRM_ENABLED", True):
            metrics = dashboard(self.admin); listing = dashboard_drilldown("active_visa_cases", 1, 30, self.admin)
        self.assertEqual(metrics["active_visa_cases"], listing["total"])
        self.assertEqual(listing["total"], 1)
        self.assertEqual(listing["items"][0]["lifecycle_status"], "ACTIVE")


if __name__ == "__main__":
    unittest.main()
