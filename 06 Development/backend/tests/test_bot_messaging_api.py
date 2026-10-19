"""HTTP/authentication checks with synthetic in-memory identities; no Telegram IO."""
from datetime import datetime, timedelta, timezone
import asyncio
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.api import bot_messaging as api
from app.api import onboarding as legacy_api
from app.api import users as users_api, yoga_channel as yoga_api
from app.api.web_admin import admin_csrf_token
from app.api.web_portal import session_user
from app.core.config import settings
from app.db.base import Base
from app.models.bot_messaging import BotContact
from app.models.onboarding import OnboardingState, OnboardingVersion
from app.models.user import User
from app.models.referral import Referral
from app.models.onboarding import OnboardingEnrollment, OnboardingDelivery
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "shared/python"))
from safr_messaging.transport import MessagingTransport, ReceiptJournal


class MessagingApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                                    connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        with self.sessions() as db:
            self.root = User(telegram_id=850001, ref_code="synthetic-root", first_name="Root",
                             role="admin", status="active", locale="ru")
            self.user = User(telegram_id=850002, ref_code="synthetic-client", first_name="Client",
                             role="client", status="active", locale="en")
            db.add_all([self.root, self.user]); db.flush()
            for bot, state_id in api.onboarding.BOT_STATE_IDS.items():
                db.add(OnboardingState(id=state_id, revision=0, enabled=False,
                                       draft=api.seed(bot)))
            db.commit()
        self.patches = [patch.object(api, "SessionLocal", self.sessions),
            patch.object(settings, "BOT_MESSAGING_ENABLED", True),
            patch.object(settings, "YOGA_CHANNEL_ENABLED", True),
            patch.object(settings, "YOGA_SERVICE_API_TOKEN", "synthetic-yoga"),
            patch.object(settings, "SERVICE_API_TOKEN", "synthetic-main"),
            patch.object(settings, "ADMIN_API_TOKEN", "synthetic-admin"),
            patch.object(settings, "DEFAULT_ADMIN_TELEGRAM_ID", self.root.telegram_id),
            patch.object(settings, "APPLICATION_URL", "https://synthetic.invalid")]
        for item in self.patches: item.start()
        self.app = FastAPI()
        self.app.include_router(api.admin_router); self.app.include_router(api.bot_router)
        self.app.include_router(legacy_api.service_router)
        self.app.dependency_overrides[session_user] = lambda: self.root
        self.client = TestClient(self.app)
        self.client.cookies.set(settings.WEB_SESSION_COOKIE_NAME, "synthetic-session")
        self.headers = {"Origin": "https://synthetic.invalid",
                        "X-CSRF-Token": admin_csrf_token("synthetic-session")}
        self.base = "/api/web/admin/messaging"

    def tearDown(self):
        self.client.close()
        for item in reversed(self.patches): item.stop()
        self.engine.dispose()

    def post(self, path, payload, **kwargs):
        return self.client.post(self.base + path, json=payload, headers=self.headers, **kwargs)

    def contact(self, token="synthetic-yoga", **change):
        payload = {"telegram_id": self.user.telegram_id, "private_chat_id": self.user.telegram_id,
            "message_id": 1, "occurred_at": datetime.now(timezone.utc).isoformat(), "locale": "en"}
        payload.update(change)
        return self.client.post("/api/bot-messaging/contact", json=payload,
                                headers={"X-Service-Token": token})

    def publish(self, bot="yoga"):
        result = self.post(f"/policy/{bot}/publish", {"expected_revision": 0})
        self.assertEqual(result.status_code, 200, result.text)
        result = self.post(f"/policy/{bot}/toggle", {"expected_revision": 1, "enabled": True})
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()

    def yoga_registration(self, actor=850003, **changes):
        return self.client.post("/api/yoga-channel/account/register", json={
            "sender_telegram_id": actor, "chat_id": actor, "language": "en", **changes},
            headers={"X-Service-Token": "synthetic-yoga"})

    def prepare_yoga_registration(self):
        self.app.include_router(yoga_api.router)
        for item in (patch.object(yoga_api, "SessionLocal", self.sessions),
                     patch.object(users_api, "SessionLocal", self.sessions),
                     patch.object(settings, "YOGA_ACCOUNT_ENABLED", True),
                     patch.object(settings, "YOGA_PARTNER_TELEGRAM_ID", self.user.telegram_id),
                     patch.object(settings, "PUBLIC_REFERRAL_ALIAS_ISSUANCE_ENABLED", False)):
            item.start(); self.addCleanup(item.stop)

    def test_private_yoga_registration_atomically_records_contact_locale_and_preserves_referral(self):
        self.prepare_yoga_registration(); self.publish()
        first = self.yoga_registration(contact_locale="ru")
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(set(first.json()), {"telegram_id", "user_id", "ref_code", "status", "is_new", "referral_status"})
        replay = self.yoga_registration(contact_locale="ru", start_payload=self.root.ref_code)
        self.assertEqual(replay.status_code, 200, replay.text)
        with self.sessions() as db:
            user = db.query(User).filter_by(telegram_id=850003).one()
            contact = db.query(BotContact).filter_by(user_id=user.id, bot_key="yoga").one()
            self.assertEqual((contact.locale, contact.status, contact.source), ("ru", "active", "yoga_private_registration"))
            self.assertEqual(user.invited_by_user_id, self.user.id)
            self.assertEqual(db.query(Referral).filter_by(child_user_id=user.id).count(), 1)
            self.assertEqual(db.query(OnboardingEnrollment).filter_by(user_id=user.id, bot_key="yoga").count(), 1)
        response = self.client.post("/api/yoga-channel/account/locale", json={
            "sender_telegram_id": 850003, "chat_id": 850003, "locale": "en"},
            headers={"X-Service-Token": "synthetic-yoga"})
        self.assertEqual(response.status_code, 200, response.text)
        with self.sessions() as db:
            self.assertEqual(db.query(BotContact).filter_by(bot_key="yoga").one().locale, "en")

    def test_contact_failure_rolls_back_new_user_referral_and_existing_profile_update(self):
        self.prepare_yoga_registration()
        from app.services import bot_messaging
        with patch.object(bot_messaging, "record_private_contact", side_effect=RuntimeError("synthetic ledger failure")):
            with self.assertRaisesRegex(RuntimeError, "synthetic ledger"):
                self.yoga_registration()
        with self.sessions() as db:
            self.assertIsNone(db.query(User).filter_by(telegram_id=850003).first())
            self.assertEqual(db.query(BotContact).count(), 0)
            self.assertEqual(db.query(Referral).count(), 0)
        self.assertEqual(self.yoga_registration(first_name="Before").status_code, 200)
        with patch.object(bot_messaging, "record_private_contact", side_effect=RuntimeError("synthetic ledger failure")):
            with self.assertRaisesRegex(RuntimeError, "synthetic ledger"):
                self.yoga_registration(first_name="After")
        with self.sessions() as db:
            self.assertEqual(db.query(User).filter_by(telegram_id=850003).one().first_name, "Before")

    def test_internal_miniapp_registration_does_not_attest_private_bot_contact(self):
        self.prepare_yoga_registration()
        users_api.register_user_for_channel(users_api.UserRegisterRequest(telegram_id=850003, language="en"),
            channel="yoga", default_inviter_telegram_id=self.user.telegram_id)
        with self.sessions() as db:
            self.assertEqual(db.query(BotContact).count(), 0)

    def test_default_off_and_bad_bot_token_fail_before_database(self):
        with patch.object(api, "SessionLocal", side_effect=AssertionError("No DB access expected")):
            self.assertEqual(self.contact("bad-token").status_code, 401)
            with patch.object(settings, "BOT_MESSAGING_ENABLED", False):
                self.assertEqual(self.contact().status_code, 404)
            with patch.object(settings, "YOGA_SERVICE_API_TOKEN", "synthetic-main"):
                self.assertEqual(self.contact().status_code, 503)

    def test_old_warm_worker_cannot_claim_new_branded_deliveries(self):
        with patch.object(legacy_api, "SessionLocal", side_effect=AssertionError("Legacy worker must be idle")):
            for flag in (True, False):
                with patch.object(settings, "BOT_MESSAGING_ENABLED", flag):
                    response = self.client.post("/onboarding/claim", headers={"X-Service-Token": "synthetic-main"})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json(), [])

    def test_feature_off_blocks_new_work_but_accepts_original_receipt_without_continuation(self):
        self.publish(); self.contact()
        with self.sessions() as db:
            row = db.query(OnboardingDelivery).one()
            row.due_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()
        item = self.client.post("/api/bot-messaging/claim", headers={"X-Service-Token": "synthetic-yoga"}).json()[0]
        with patch.object(settings, "BOT_MESSAGING_ENABLED", False):
            self.assertEqual(self.contact().status_code, 404)
            self.assertEqual(self.client.post("/api/bot-messaging/claim", headers={"X-Service-Token": "synthetic-yoga"}).status_code, 404)
            response = self.client.post(f"/api/bot-messaging/deliveries/{item['id']}/settle", json={
                "delivery_kind": "welcome", "lease_token": item["lease_token"], "state": "DELIVERED",
                "telegram_message_id": "991", "delivered_at": datetime.now(timezone.utc).isoformat()},
                headers={"X-Service-Token": "synthetic-yoga"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), {"state": "DELIVERED"})
        with self.sessions() as db:
            self.assertEqual(db.query(OnboardingDelivery).count(), 1)

    def test_root_origin_and_csrf_are_required(self):
        self.app.dependency_overrides[session_user] = lambda: self.user
        self.assertEqual(self.client.get(self.base + "/campaigns").status_code, 403)
        self.assertEqual(self.post("/policy/yoga/publish", {"expected_revision": 0}).status_code, 403)
        self.app.dependency_overrides[session_user] = lambda: self.root
        for headers in ({}, {**self.headers, "Origin": "https://other.invalid"},
                        {**self.headers, "X-CSRF-Token": "bad"}):
            response = self.client.post(self.base + "/policy/yoga/publish",
                json={"expected_revision": 0}, headers=headers)
            self.assertEqual(response.status_code, 403)

    def test_brand_policy_revision_and_two_locales(self):
        data = self.publish()
        response = self.client.get(self.base + "/policy/yoga")
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertTrue(data["enabled"])
        self.assertFalse(self.client.get(self.base + "/policy/safrway").json()["enabled"])
        self.assertEqual(self.post("/policy/yoga/toggle", {"expected_revision": 0, "enabled": False}).status_code, 409)
        with self.sessions() as db:
            version = db.get(OnboardingVersion, data["published_version"])
            self.assertEqual(version.bot_key, "yoga")
            self.assertEqual(set(version.content["locales"]), {"ru", "en"})
        payload = {"expected_revision": 2, "locales": {"ru": api.seed("yoga")["locales"]["ru"]}}
        self.assertEqual(self.client.put(self.base + "/policy/yoga/draft", json=payload,
                         headers=self.headers).status_code, 422)
        payload["locales"]["en"] = {"welcome_text": "Welcome to SAFRWAY", "followup_text": "Question"}
        self.assertEqual(self.client.put(self.base + "/policy/yoga/draft", json=payload,
                         headers=self.headers).status_code, 422)

    def test_private_contact_identity_and_brand_are_credential_bound(self):
        for change in ({"private_chat_id": self.user.telegram_id + 1},
                       {"occurred_at": "2030-01-01T00:00:00"},
                       {"telegram_id": str(self.user.telegram_id)}, {"locale": "ar"},
                       {"bot_key": "safrway"}):
            self.assertEqual(self.contact(**change).status_code, 422)
        self.assertEqual(self.contact().status_code, 200)
        self.assertEqual(self.contact().json()["first_contact"], False)
        with self.sessions() as db:
            contact = db.query(BotContact).one()
            self.assertEqual((contact.bot_key, contact.locale), ("yoga", "en"))
        self.assertEqual(self.contact("synthetic-main").status_code, 200)
        with self.sessions() as db: self.assertEqual(db.query(BotContact).count(), 2)

    def test_campaign_preview_requires_reviewed_snapshot_then_exact_confirmation(self):
        self.contact()
        result = self.post("/campaigns", {"bot_key": "yoga", "kind": "announcement", "title": "Synthetic",
            "user_ids": [self.user.id], "content": {"ru": "Сообщение", "en": "Message"}})
        self.assertEqual(result.status_code, 201, result.text)
        row = result.json(); path = f"/campaigns/{row['id']}"
        preview = self.post(path + "/preview", {"expected_revision": 0}).json()
        self.assertEqual(preview["recipient_count"], 1)
        confirmation = {"expected_revision": preview["revision"],
            "snapshot_sha256": preview["snapshot_sha256"], "idempotency_key": "synthetic-http-confirm"}
        self.assertEqual(self.post(path + "/confirm", {**confirmation, "snapshot_sha256": "0" * 64}).status_code, 409)
        first = self.post(path + "/confirm", confirmation)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertFalse(first.json()["idempotent_replay"])
        self.assertTrue(self.post(path + "/confirm", confirmation).json()["idempotent_replay"])
        cancelled = self.post(path + "/cancel", {"expected_revision": first.json()["revision"]})
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["state"], "CANCELLED")
        self.assertEqual(self.client.post("/api/bot-messaging/claim", headers={"X-Service-Token": "synthetic-yoga"}).json(), [])

    def test_shared_sender_forbidden_receipt_blocks_only_that_bot_contact(self):
        self.contact(); self.contact("synthetic-main")
        def prepare():
            row = self.post("/campaigns", {"bot_key": "yoga", "kind": "announcement", "title": "Synthetic blocked test",
                "content": {"ru": "Сообщение", "en": "Message"}}).json()
            p = self.post(f"/campaigns/{row['id']}/preview", {"expected_revision": 0}).json()
            return row, p
        row, p = prepare()
        self.post(f"/campaigns/{row['id']}/confirm", {"expected_revision": p["revision"],
            "snapshot_sha256": p["snapshot_sha256"], "idempotency_key": "synthetic-blocked-send"})
        async def api_call(method, path, payload):
            response = self.client.request(method, "/api/bot-messaging" + path, json=payload,
                headers={"X-Service-Token": "synthetic-yoga"})
            self.assertEqual(response.status_code, 200, response.text)
            return response.json()
        async def forbidden(*args, **kwargs):
            raise type("TelegramForbiddenError", (Exception,), {})("synthetic")
        with tempfile.TemporaryDirectory(prefix="messaging-api-synthetic-") as folder:
            engine = MessagingTransport(bot_key="yoga", api=api_call, send=forbidden,
                journal=ReceiptJournal(Path(folder) / "receipts.json"), keyboard=lambda item: None)
            asyncio.run(engine.iteration())
        with self.sessions() as db:
            contacts = {item.bot_key: item.status for item in db.query(BotContact)}
            self.assertEqual(contacts, {"yoga": "blocked", "safrway": "active"})
        self.assertEqual(prepare()[1]["recipient_count"], 0)
        self.contact()  # A new verified private interaction restores reachability.
        self.assertEqual(prepare()[1]["recipient_count"], 1)


if __name__ == "__main__": unittest.main()
