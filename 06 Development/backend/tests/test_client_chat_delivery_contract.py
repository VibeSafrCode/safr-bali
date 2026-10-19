"""Actual router/cookie and SQLite contracts, never real Telegram/PG proof."""
from copy import deepcopy
from datetime import datetime, timedelta
import hashlib
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.api import mini_app, web_portal
from app.core.config import settings
from app.db.base import Base
from app.models.mini_app_session import MiniAppSession
from app.models.user import User
from app.models.web_portal import WebConversation, WebMessage, WebOutboxEvent, WebSession
from app.schemas.client_portal import ChatMessageRequest
from app.services import client_portal


ORIGIN = "http://fixture.local"


class ClientChatDeliveryContract(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                                    connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        # Match actual SessionLocal: no autoflush and default expiry at commit.
        self.factory = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        self.patches = [patch.object(web_portal, "SessionLocal", self.factory),
                        patch.object(mini_app, "SessionLocal", self.factory),
                        patch.object(settings, "APPLICATION_URL", ORIGIN),
                        patch.object(settings, "MINI_APP_ORIGINS", ORIGIN),
                        patch.object(settings, "SERVICE_API_TOKEN", "synthetic-f01-service"),
                        patch.object(settings, "RATE_LIMIT_PER_MINUTE", 100000)]
        for item in self.patches:
            item.start()
        self.app = FastAPI()
        self.app.include_router(web_portal.router)
        self.app.include_router(web_portal.service_router)
        self.app.include_router(mini_app.router)
        self.assertEqual(self.app.dependency_overrides, {})
        self.client = TestClient(self.app, base_url=ORIGIN)
        self.actor_ids = {}
        now = datetime.utcnow()
        with self.factory() as db:
            for actor in (910001, 910002):
                user = User(telegram_id=actor, ref_code="f01-synthetic-" + str(actor), status="active", locale="ru")
                db.add(user)
                db.flush()
                self.actor_ids[actor] = user.id
                db.add(WebSession(user_id=user.id, token_hash=web_portal.token_hash("web-" + str(actor)),
                                  expires_at=now + timedelta(hours=1)))
                db.add(MiniAppSession(user_id=user.id, access_token_hash=mini_app.token_hash("mini-" + str(actor)),
                                     refresh_token_hash=mini_app.token_hash("refresh-" + str(actor)),
                                     access_expires_at=now + timedelta(hours=1),
                                     refresh_expires_at=now + timedelta(days=1)))
            db.commit()
        self.headers = {"Origin": ORIGIN}
        self.staff = {"X-Service-Token": "synthetic-f01-service"}
        self.login()

    def tearDown(self):
        self.client.close()
        for item in reversed(self.patches):
            item.stop()
        self.engine.dispose()

    def login(self, actor=910001):
        self.client.cookies.clear()
        self.client.cookies.set(settings.WEB_SESSION_COOKIE_NAME, "web-" + str(actor))
        self.client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, "mini-" + str(actor))
        self.headers = {"Origin": ORIGIN, "X-CSRF-Token": hashlib.sha256(
            ("safr-admin-csrf:web-" + str(actor)).encode()).hexdigest()}

    def payload(self, *, actor=910001, body="Synthetic A", key=None, context=None):
        return {"body": body, "route_context": context or {"service": "C1", "locale": "ar"},
                "idempotency_key": key or str(uuid4()), "expected_actor_telegram_id": actor}

    def send(self, payload=None, prefix="/api/web", headers=None):
        return self.client.post(prefix + "/chat/messages", json=payload or self.payload(),
                                headers=self.headers if headers is None else headers)

    def count(self, model):
        with self.factory() as db:
            return db.query(model).count()

    def event(self, event_id=None):
        with self.factory() as db:
            event = db.get(WebOutboxEvent, event_id) if event_id else db.query(WebOutboxEvent).one()
            return {"id": event.id, "aggregate_id": event.aggregate_id, "payload": deepcopy(event.payload),
                    "status": event.status, "attempts": event.attempts}

    def claim(self, event, *, token=None, primary=None, observers=None, body="Synthetic A"):
        token = token or str(uuid4())
        request = {"attempt_id": token, "primary_ids": [1101] if primary is None else primary,
                   "observer_ids": [] if observers is None else observers,
                   "source_payload": event["payload"], "message_body": body}
        response = self.client.post(f'/api/web/staff/outbox/{event["id"]}/delivery-claim',
                                    headers=self.staff, json=request)
        return response, request

    def receipt(self, event_id, request, *, status="delivered", results=None):
        results = results or {str(value): "delivered" for value in request["primary_ids"] + request["observer_ids"]}
        return {"attempt_id": request["attempt_id"], "status": status,
                "recipient_ids": [value for value in request["primary_ids"] if results.get(str(value)) == "delivered"],
                "delivery_results": results, "error_code": None if status == "delivered" else "synthetic_partial"}

    def staff_post(self, event_id, action, payload):
        return self.client.post(f"/api/web/staff/outbox/{event_id}/{action}", headers=self.staff, json=payload)

    def test_web_real_cookie_origin_and_csrf_required(self):
        for headers in ({}, {"Origin": "https://other.example", "X-CSRF-Token": self.headers["X-CSRF-Token"]},
                        {"Origin": ORIGIN}, {"Origin": ORIGIN, "X-CSRF-Token": "wrong"}):
            self.assertEqual(self.send(headers=headers).status_code, 403)
        self.client.cookies.clear()
        self.assertEqual(self.send().status_code, 401)
        self.assertEqual(self.count(WebMessage), 0)
        self.assertEqual(self.count(WebOutboxEvent), 0)

    def test_mini_real_cookie_origin_required(self):
        for headers in ({}, {"Origin": "null"}, {"Origin": "https://other.example"}):
            self.assertEqual(self.send(prefix="/mini-app", headers=headers).status_code, 403)
        self.assertEqual(self.send(prefix="/mini-app").status_code, 201)
        self.client.cookies.clear()
        self.assertEqual(self.send(prefix="/mini-app").status_code, 401)

    def test_actor_guard_denies_both_routers_before_message_service(self):
        with patch.object(web_portal, "send_client_chat_message") as web_send, \
                patch.object(mini_app, "send_client_chat_message") as mini_send:
            for prefix in ("/api/web", "/mini-app"):
                self.assertEqual(self.send(self.payload(actor=910002), prefix).status_code, 401)
            web_send.assert_not_called()
            mini_send.assert_not_called()
        self.assertEqual(self.count(WebMessage), 0)

    def test_distinct_configured_yoga_origin_requires_enabled_scope_and_cookie(self):
        origin = "https://yoga-fixture.example"
        with patch.object(settings, "YOGA_MINI_APP_ORIGIN", origin), \
                patch.object(settings, "YOGA_MINI_APP_ENABLED", False):
            self.assertEqual(self.send(prefix="/mini-app", headers={"Origin": origin}).status_code, 403)
        with patch.object(settings, "YOGA_MINI_APP_ORIGIN", origin), \
                patch.object(settings, "YOGA_MINI_APP_ENABLED", True):
            self.assertEqual(self.send(prefix="/mini-app", headers={"Origin": "https://other.example"}).status_code, 403)
            self.assertEqual(self.send(prefix="/mini-app", headers={"Origin": origin}).status_code, 201)
            self.client.cookies.clear()
            self.assertEqual(self.send(prefix="/mini-app", headers={"Origin": origin}).status_code, 401)

    def test_strict_actor_and_uuid_validation(self):
        for value in (True, "910001", 1.5, -1, 0):
            self.assertEqual(self.send(self.payload(actor=value)).status_code, 422)
        for value in ("not-a-key", "00000000-0000-1000-8000-000000000001"):
            request = self.payload()
            request["idempotency_key"] = value
            self.assertEqual(self.send(request).status_code, 422)
        self.assertEqual(self.count(WebMessage), 0)

    def test_exact_retry_is_one_message_one_event(self):
        request = self.payload()
        first, second = self.send(request), self.send(request)
        self.assertEqual((first.status_code, second.status_code), (201, 201))
        self.assertFalse(first.json()["idempotent_replay"])
        self.assertTrue(second.json()["idempotent_replay"])
        self.assertEqual(first.json()["message_id"], second.json()["message_id"])
        self.assertEqual((self.count(WebMessage), self.count(WebOutboxEvent)), (1, 1))

    def test_retry_conflicts_on_changed_body_context_or_source(self):
        request = self.payload()
        self.assertEqual(self.send(request).status_code, 201)
        for delta in ({"body": "Changed"}, {"route_context": {"service": "D2"}}):
            self.assertEqual(self.send({**request, **delta}).status_code, 409)
        self.assertEqual(self.send(request, "/mini-app").status_code, 409)
        self.assertEqual((self.count(WebMessage), self.count(WebOutboxEvent)), (1, 1))

    def test_same_uuid_is_namespaced_by_canonical_server_user(self):
        request = self.payload()
        self.assertEqual(self.send(request).status_code, 201)
        self.login(910002)
        self.assertEqual(self.send({**request, "expected_actor_telegram_id": 910002}).status_code, 201)
        self.assertEqual((self.count(WebConversation), self.count(WebMessage), self.count(WebOutboxEvent)), (2, 2, 2))

    def test_changed_cookie_does_not_attribute_old_actor_to_new_user(self):
        old = self.payload()
        self.login(910002)
        self.assertEqual(self.send(old).status_code, 401)
        self.assertEqual(self.count(WebConversation), 0)

    def test_guest_retry_and_fingerprint_are_separate_from_user(self):
        request = {"name": "Synthetic guest", "contact": "guest@example.test", **self.payload()}
        request.pop("expected_actor_telegram_id")
        path = "/api/web/chat/guest"
        first = self.client.post(path, json=request)
        self.assertEqual(first.status_code, 201)
        self.assertTrue(self.client.post(path, json=request).json()["idempotent_replay"])
        self.assertEqual(self.client.post(path, json={**request, "contact": "other@example.test"}).status_code, 409)
        self.assertEqual(self.send(self.payload(key=request["idempotency_key"])).status_code, 201)
        self.assertEqual(self.count(WebMessage), 2)

    def test_snapshots_and_specific_message_survive_next_page(self):
        a = self.send(self.payload(context={"service": "C1", "locale": "ar"})).json()
        b = self.send(self.payload(body="Synthetic B", context={"service": "D2", "locale": "ja"})).json()
        with self.factory() as db:
            events = db.query(WebOutboxEvent).order_by(WebOutboxEvent.id).all()
            self.assertEqual([e.payload["route_context"]["service"] for e in events], ["C1", "D2"])
        response = self.client.get(f'/api/web/staff/conversations/{a["id"]}',
                                    params={"message_id": a["message_id"]}, headers=self.staff)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([m["id"] for m in response.json()["messages"]], [a["message_id"]])
        self.assertEqual(response.json()["messages"][0]["route_context"]["service"], "C1")
        self.assertNotEqual(a["message_id"], b["message_id"])

    def test_claim_first_ack_only_never_reauthorizes(self):
        self.assertEqual(self.send().status_code, 201)
        event = self.event()
        response, request = self.claim(event)
        self.assertTrue(response.json()["send_authorized"])
        for token in (request["attempt_id"], str(uuid4())):
            repeated = self.staff_post(event["id"], "delivery-claim", {**request, "attempt_id": token})
            self.assertEqual(repeated.status_code, 200)
            self.assertIs(repeated.json()["send_authorized"], False)
        self.assertEqual(self.event()["status"], "claimed")

    def test_claim_denies_changed_snapshot_body_and_recipient_coercion(self):
        self.assertEqual(self.send().status_code, 201)
        event = self.event()
        response, request = self.claim(event, body="Wrong")
        self.assertEqual(response.status_code, 409)
        request["message_body"] = "Synthetic A"
        wrong = {**request, "source_payload": {**event["payload"], "source": "telegram"}}
        self.assertEqual(self.staff_post(event["id"], "delivery-claim", wrong).status_code, 409)
        for ids in ([True], ["1101"], [0]):
            self.assertEqual(self.staff_post(event["id"], "delivery-claim", {**request, "primary_ids": ids}).status_code, 422)
        self.assertEqual(self.event()["status"], "pending")

    def test_durable_receipt_required_before_settlement(self):
        self.assertEqual(self.send().status_code, 201)
        event = self.event()
        response, request = self.claim(event)
        self.assertTrue(response.json()["send_authorized"])
        receipt = self.receipt(event["id"], request)
        self.assertEqual(self.staff_post(event["id"], "delivered", receipt).status_code, 409)
        self.assertEqual(self.staff_post(event["id"], "delivery-receipt", receipt).status_code, 200)
        self.assertEqual(self.event()["status"], "settling")
        self.assertTrue(self.staff_post(event["id"], "delivery-receipt", receipt).json()["idempotent_replay"])
        result = self.staff_post(event["id"], "delivered", receipt)
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json()["assignment_updated"])
        self.assertTrue(self.staff_post(event["id"], "delivered", receipt).json()["idempotent_replay"])
        self.assertEqual(self.event()["attempts"], 1)

    def test_receipt_cannot_invent_delivered_recipient_or_miss_observer(self):
        self.send()
        event = self.event()
        _, request = self.claim(event, observers=[2202])
        receipt = self.receipt(event["id"], request)
        for delta in ({"recipient_ids": [9999]}, {"delivery_results": {"1101": "delivered"}},
                      {"recipient_ids": [1101, 2202]}, {"recipient_ids": [True]}):
            self.assertIn(self.staff_post(event["id"], "delivery-receipt", {**receipt, **delta}).status_code, (409, 422))
        self.assertEqual(self.event()["status"], "claimed")

    def test_old_event_settlement_cannot_overwrite_new_message_assignment(self):
        self.send()
        first = self.event()
        self.send(self.payload(body="Synthetic B"))
        with self.factory() as db:
            second = self.event(db.query(WebOutboxEvent.id).order_by(WebOutboxEvent.id.desc()).first()[0])
        for event, staff, body in ((second, 2202, "Synthetic B"), (first, 1101, "Synthetic A")):
            _, request = self.claim(event, primary=[staff], body=body)
            receipt = self.receipt(event["id"], request)
            self.assertEqual(self.staff_post(event["id"], "delivery-receipt", receipt).status_code, 200)
            self.assertEqual(self.staff_post(event["id"], "delivered", receipt).status_code, 200)
        with self.factory() as db:
            self.assertEqual(db.get(WebConversation, first["aggregate_id"]).assigned_staff_ids, [2202])

    def test_partial_unknown_delivery_is_not_delivered_or_requeued(self):
        self.send()
        event = self.event()
        _, request = self.claim(event, observers=[2202])
        receipt = self.receipt(event["id"], request, status="failed", results={"1101": "delivered", "2202": "unknown"})
        self.assertEqual(self.staff_post(event["id"], "delivery-receipt", receipt).status_code, 200)
        self.assertEqual(self.staff_post(event["id"], "delivered", receipt).status_code, 200)
        self.assertEqual(self.event()["status"], "failed")
        self.assertFalse(self.staff_post(event["id"], "delivery-claim", {**request, "attempt_id": str(uuid4())}).json()["send_authorized"])

    def test_service_endpoints_require_real_service_dependency(self):
        self.send()
        event = self.event()
        self.assertEqual(self.client.get("/api/web/staff/outbox").status_code, 401)
        self.assertEqual(self.client.post(f'/api/web/staff/outbox/{event["id"]}/delivery-claim', json={}).status_code, 401)
        self.assertEqual(self.event()["status"], "pending")

    def test_lost_commit_ack_reconciles_exact_existing_message(self):
        request = ChatMessageRequest(**self.payload())
        with self.factory() as db:
            original = db.commit
            calls = []
            def uncertain_commit():
                original()
                calls.append(1)
                if len(calls) == 1:
                    raise OperationalError("synthetic lost commit ACK", {}, Exception("synthetic"))
            with patch.object(db, "commit", side_effect=uncertain_commit):
                result = client_portal.send_client_chat_message(db, user_id=self.actor_ids[910001],
                    body=request.body, route_context=request.route_context.model_dump(exclude_none=True),
                    source="website", idempotency_key=request.idempotency_key)
            self.assertTrue(result["idempotent_replay"])
        self.assertEqual((self.count(WebMessage), self.count(WebOutboxEvent)), (1, 1))

    def test_response_after_200_messages_contains_newest(self):
        first = self.send().json()
        with self.factory() as db:
            db.add_all([WebMessage(conversation_id=first["id"], author_type="staff", visibility="client", body=str(i)) for i in range(205)])
            db.commit()
        last = self.send(self.payload(body="Newest")).json()
        self.assertEqual(len(last["messages"]), 200)
        self.assertEqual(last["messages"][-1]["id"], last["message_id"])
        self.assertEqual(last["messages"][-1]["body"], "Newest")

    def test_recovery_serialization_failure_is_503_without_duplicate(self):
        error = OperationalError("synthetic serialization timeout", {}, Exception("synthetic"))
        with patch.object(client_portal, "serialize_client_chat", side_effect=error):
            self.assertEqual(self.send().status_code, 503)
        self.assertEqual((self.count(WebMessage), self.count(WebOutboxEvent)), (1, 1))

    def test_lost_claim_ack_never_grants_a_second_send(self):
        self.send()
        event = self.event()
        real_factory = self.factory
        def uncertain_session():
            db = real_factory()
            commit = db.commit
            def uncertain_commit():
                commit()
                raise OperationalError("synthetic lost claim ACK", {}, Exception("synthetic"))
            db.commit = uncertain_commit
            return db
        with patch.object(web_portal, "SessionLocal", uncertain_session):
            response, request = self.claim(event)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.event()["status"], "claimed")
        self.assertFalse(self.staff_post(event["id"], "delivery-claim", request).json()["send_authorized"])

    def test_optional_fields_keep_legacy_request_compatible(self):
        self.assertEqual(self.send({"body": "Legacy", "route_context": {}}).status_code, 201)
        self.assertEqual(self.count(WebMessage), 1)


if __name__ == "__main__":
    unittest.main()
