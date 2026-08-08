from __future__ import annotations

import unittest
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
    require_admin_write,
    require_web_admin,
)
from app.core.config import settings
from app.db.base import Base
from app.main import app
from app.models.user import User


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


if __name__ == "__main__":
    unittest.main()
