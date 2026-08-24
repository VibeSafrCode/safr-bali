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
    admin_settings,
    audit,
    change_exchange_settings,
    change_conversation_status,
    ConversationStatusRequest,
    dashboard,
    dashboard_drilldown,
    ExchangeSettingsChangeRequest,
    ExchangeSettingsRestoreRequest,
    NewUserReviewRequest,
    review_new_user,
    require_admin_write,
    require_web_admin,
    restore_exchange_settings,
)
from app.core.config import settings
from app.db.base import Base
from app.main import app
from app.models.user import User
from app.models.admin_action import AdminAction
from app.models.exchange import ExchangeRouteSettingsVersion
from app.models.visa_lifecycle import VisaCase, VisaType
from app.models.service import Service
from app.models.web_portal import WebConversation
from app.services.currency_calculator import DEFAULT_ROUTE_SETTINGS, USDT_TO_IDR_CASH
from app.services.exchange_quotes import route_settings_payload


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
        self.assertEqual(listing["items"][0]["client_name"], "SAFRWAY 2")

    def test_business_settings_are_human_sections_without_secret_values(self):
        db = self.Session(); db.add_all([
            VisaType(country_code="ID", code="B1", name="B1 Visit Visa", version=1, rules_verified=True),
            Service(name="Visa consultation", slug="visa-consultation", category="visa", is_active=True),
        ]); db.commit(); db.close()
        with patch("app.api.web_admin.SessionLocal", self.Session), patch("app.api.web_admin.list_active_route_settings", return_value=[]):
            result = admin_settings(self.admin)
        self.assertEqual(result["visa_types"][0]["code"], "B1")
        self.assertEqual(result["services"][0]["name"], "Visa consultation")
        self.assertEqual({item["event"] for item in result["notifications"]}, {"CASE_PUBLISHED", "CASE_UPDATED"})
        self.assertTrue(all(item["enabled"] is None for item in result["notifications"]))
        self.assertTrue(all(item["configuration_scope"] == "per_case" for item in result["notifications"]))
        self.assertTrue(all(item["editable"] is False for item in result["notifications"]))
        self.assertNotIn("secret", str(result).lower())

    def test_conversation_close_reopen_is_audited_idempotent_and_stale_safe(self):
        db = self.Session()
        row = WebConversation(user_id=self.client.id, status="open", route_context={})
        db.add(row); db.commit(); db.refresh(row)
        conversation_id = row.id
        expected_updated_at = row.updated_at.replace(tzinfo=None)
        db.close()
        with patch("app.api.web_admin.SessionLocal", self.Session):
            closed = change_conversation_status(
                conversation_id,
                ConversationStatusRequest(status="closed", expected_updated_at=expected_updated_at, comment="Resolved with client"),
                "conversation-close-fixture",
                self.admin,
            )
            self.assertFalse(closed["idempotent_replay"])
            replay = change_conversation_status(
                conversation_id,
                ConversationStatusRequest(status="closed", expected_updated_at=expected_updated_at, comment="Duplicate tap"),
                "conversation-close-fixture",
                self.admin,
            )
            self.assertTrue(replay["idempotent_replay"])
            with self.assertRaises(HTTPException) as stale:
                change_conversation_status(
                    conversation_id,
                    ConversationStatusRequest(status="open", expected_updated_at=expected_updated_at, comment="Stale reopen"),
                    "conversation-stale-fixture",
                    self.admin,
                )
            self.assertEqual(stale.exception.status_code, 409)
            current_db = self.Session()
            current_updated_at = current_db.query(WebConversation).filter(WebConversation.id == conversation_id).one().updated_at
            current_db.close()
            reopened = change_conversation_status(
                conversation_id,
                ConversationStatusRequest(status="open", expected_updated_at=current_updated_at, comment="Client returned"),
                "conversation-reopen-fixture",
                self.admin,
            )
            self.assertFalse(reopened["idempotent_replay"])
        db = self.Session()
        try:
            actions = db.query(AdminAction).filter(AdminAction.entity_type == "web_conversation").order_by(AdminAction.id).all()
            self.assertEqual([item.action_type for item in actions], ["CONVERSATION_CLOSED", "CONVERSATION_REOPENED"])
            self.assertEqual(actions[0].details["before"]["status"], "open")
            self.assertEqual(actions[0].details["after"]["status"], "closed")
        finally:
            db.close()

    def test_exchange_settings_create_immutable_audited_version_and_restore(self):
        db = self.Session()
        db.add(ExchangeRouteSettingsVersion(
            route_code=USDT_TO_IDR_CASH,
            version=1,
            is_active=True,
            settings=route_settings_payload(DEFAULT_ROUTE_SETTINGS[USDT_TO_IDR_CASH]),
        ))
        db.commit(); db.close()
        with patch("app.api.web_admin.SessionLocal", self.Session):
            created = change_exchange_settings(
                USDT_TO_IDR_CASH,
                ExchangeSettingsChangeRequest(
                    expected_active_version=1,
                    settings={"quote_ttl_seconds": 600},
                    comment="Approved fixture change",
                ),
                self.admin,
            )
            self.assertEqual(created["version"], 2)
            self.assertEqual(created["settings"]["quote_ttl_seconds"], 600)
            with self.assertRaises(HTTPException) as stale:
                change_exchange_settings(
                    USDT_TO_IDR_CASH,
                    ExchangeSettingsChangeRequest(
                        expected_active_version=1,
                        settings={"quote_ttl_seconds": 900},
                        comment="Stale fixture change",
                    ),
                    self.admin,
                )
            self.assertEqual(stale.exception.status_code, 409)
            restored = restore_exchange_settings(
                USDT_TO_IDR_CASH,
                ExchangeSettingsRestoreRequest(
                    expected_active_version=2,
                    restore_version=1,
                    comment="Restore approved fixture",
                ),
                self.admin,
            )
        self.assertEqual(restored["version"], 3)
        self.assertEqual(restored["settings"]["quote_ttl_seconds"], DEFAULT_ROUTE_SETTINGS[USDT_TO_IDR_CASH].quote_ttl_seconds)
        db = self.Session()
        try:
            self.assertEqual(db.query(ExchangeRouteSettingsVersion).count(), 3)
            self.assertEqual(db.query(AdminAction).filter(AdminAction.entity_type == "exchange_route_settings").count(), 2)
        finally:
            db.close()

    def test_audit_filters_actor_object_action_and_date_without_mutation(self):
        db = self.Session()
        db.add_all([
            AdminAction(admin_user_id=self.admin.id, action_type="CASE_UPDATED", entity_type="visa_case", entity_id=1, comment="Dates confirmed", details={"before": {"status": "PROCESSING"}, "after": {"status": "ACTION_REQUIRED"}}, created_at=datetime(2026, 8, 20, 10, 0, 0)),
            AdminAction(admin_user_id=self.admin.id, action_type="EXCHANGE_SETTINGS_VERSION_CREATED", entity_type="exchange_route_settings", entity_id=2, created_at=datetime(2026, 8, 21, 10, 0, 0)),
        ])
        db.commit(); db.close()
        with patch("app.api.web_admin.SessionLocal", self.Session):
            result = audit(
                page=1,
                page_size=30,
                action_type="CASE_UPDATED",
                entity_type="visa_case",
                actor_id=self.admin.id,
                date_from=datetime(2026, 8, 20, 0, 0, 0),
                date_to=datetime(2026, 8, 20, 23, 59, 59),
                user=self.admin,
            )
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["action_type"], "CASE_UPDATED")
        self.assertEqual(result["items"][0]["entity_id"], 1)
        self.assertEqual(result["items"][0]["comment"], "Dates confirmed")
        self.assertEqual(result["items"][0]["details"]["before"]["status"], "PROCESSING")
        self.assertEqual(result["items"][0]["details"]["after"]["status"], "ACTION_REQUIRED")


if __name__ == "__main__":
    unittest.main()
