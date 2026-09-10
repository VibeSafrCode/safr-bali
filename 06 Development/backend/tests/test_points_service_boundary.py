"""HTTP contracts for privileged service Points calls, using only an in-memory DB."""
from datetime import datetime, timedelta
import unittest
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.api import points
from app.core.config import settings
from app.db.base import Base
from app.models.order import Order
from app.models.partner_mode import PartnerMode
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.reward_rule import RewardRule
from app.models.service import Service
from app.models.user import User


class PointsServiceBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.Session() as db:
            db.add_all([
                User(id=1, telegram_id=101, ref_code="POINTS-1", role="client", status="active"),
                User(id=2, telegram_id=102, ref_code="POINTS-2", role="admin", status="active"),
                User(id=3, telegram_id=103, ref_code="POINTS-3", role="client", status="active"),
            ])
            db.commit()
        self.addCleanup(self.engine.dispose)
        self.session_patch = patch.object(points, "SessionLocal", wraps=self.Session)
        self.session_factory = self.session_patch.start()
        self.addCleanup(self.session_patch.stop)
        token_patch = patch.object(settings, "SERVICE_API_TOKEN", "synthetic-points-service")
        token_patch.start()
        self.addCleanup(token_patch.stop)
        limiter_patch = patch("app.core.security.rate_limiter.check", return_value=True)
        limiter_patch.start()
        self.addCleanup(limiter_patch.stop)
        app = FastAPI()
        app.include_router(points.router)
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test",
            headers={"X-Service-Token": "synthetic-points-service"},
        )
        self.addAsyncCleanup(self.client.aclose)

    async def accrue(self, *, key="service-award", **fields):
        return await self.client.post(
            "/points/accrue", json={"user_id": 1, "amount": 10, **fields},
            headers={"Idempotency-Key": key},
        )

    def seed_history(self, count=105):
        with self.Session() as db:
            db.add_all([
                PointsLedger(user_id=1, amount=1, balance_after=index + 1,
                             operation_type="manual_accrual", created_by_admin_id=2)
                for index in range(count)
            ])
            db.flush()
            ids = [row.id for row in db.query(PointsLedger).order_by(PointsLedger.id.desc())]
            db.add(PointsLedger(user_id=3, amount=99, balance_after=99,
                               operation_type="manual_accrual"))
            db.commit()
            return ids

    def seed_referral(self):
        with self.Session() as db:
            db.get(User, 3).invited_by_user_id = 1
            service = Service(name="Test", slug="points-boundary", is_active=True)
            mode = PartnerMode(name="Direct", slug="direct", is_active=True)
            db.add_all([service, mode])
            db.flush()
            db.add(Referral(parent_user_id=1, child_user_id=3, level=1,
                            source="explicit_referral"))
            db.add(RewardRule(service_id=service.id, partner_mode_id=mode.id,
                              level_1_points=75, level_2_points=0, level_3_points=0,
                              valid_from=datetime.utcnow() - timedelta(days=1), is_active=True))
            order = Order(user_id=3, service_id=service.id, status="completed", payment_status="paid")
            db.add(order)
            db.commit()
            return order.id

    async def test_all_routes_require_service_credential_before_database_access(self):
        for token in (None, "", "   ", "wrong"):
            for method, path, payload in (
                ("GET", "/points/user/1/ledger", None),
                ("POST", "/points/accrue", {"user_id": 1, "amount": 10}),
                ("POST", "/points/accrue-referral", {"order_id": 1}),
            ):
                with self.subTest(token=token, path=path):
                    request = self.client.build_request(method, path, json=payload,
                                                        headers={"Idempotency-Key": "guard-test"})
                    del request.headers["X-Service-Token"]
                    if token is not None:
                        request.headers["X-Service-Token"] = token
                    response = await self.client.send(request)
                    self.assertEqual(response.status_code, 401)
        self.session_factory.assert_not_called()

    async def test_empty_expected_credential_fails_closed(self):
        for token in ("", "   "):
            with patch.object(settings, "SERVICE_API_TOKEN", token):
                response = await self.client.get("/points/user/1/ledger",
                                                 headers={"X-Service-Token": token})
                self.assertEqual(response.status_code, 401)
        self.session_factory.assert_not_called()

    async def test_both_service_writes_reject_any_non_null_human_actor(self):
        for actor in (0, -1, 1, 2, 9999):
            for path, payload in (
                ("/points/accrue", {"user_id": 1, "amount": 10}),
                ("/points/accrue-referral", {"order_id": 1}),
            ):
                with self.subTest(actor=actor, path=path):
                    response = await self.client.post(
                        path, json={**payload, "created_by_admin_id": actor},
                        headers={"Idempotency-Key": "actor-rejection"},
                    )
                    self.assertEqual(response.status_code, 422)
                    self.assertIn("cannot supply", response.json()["detail"])
        self.session_factory.assert_not_called()

    async def test_null_and_omitted_service_actor_preserve_idempotency(self):
        first = await self.accrue()
        replay = await self.accrue(created_by_admin_id=None)
        conflict = await self.accrue(amount=11)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(replay.status_code, 200)
        self.assertFalse(first.json()["idempotent_replay"])
        self.assertTrue(replay.json()["idempotent_replay"])
        self.assertEqual(first.json()["id"], replay.json()["id"])
        self.assertEqual(conflict.status_code, 409)
        with self.Session() as db:
            row = db.query(PointsLedger).one()
            self.assertIsNone(row.created_by_admin_id)
            self.assertEqual((row.amount, row.balance_after), (10, 10))

    async def test_manual_award_still_requires_valid_key_and_positive_amount(self):
        missing = await self.client.post("/points/accrue", json={"user_id": 1, "amount": 10})
        self.assertEqual(missing.status_code, 422)
        self.assertEqual((await self.accrue(key="   ")).status_code, 409)
        self.assertEqual((await self.accrue(amount=0)).status_code, 400)
        with self.Session() as db:
            self.assertEqual(db.query(PointsLedger).count(), 0)

    async def test_historical_human_actor_replay_is_rejected_without_rewriting_history(self):
        with self.Session() as db:
            db.add(PointsLedger(user_id=1, amount=10, balance_after=10,
                               operation_type="manual_accrual", created_by_admin_id=2,
                               idempotency_key="service-award"))
            db.commit()
        self.assertEqual((await self.accrue(created_by_admin_id=2)).status_code, 422)
        # Omitting the old actor is still a changed payload, never a migrated replay.
        self.assertEqual((await self.accrue()).status_code, 409)
        with self.Session() as db:
            row = db.query(PointsLedger).one()
            self.assertEqual((row.created_by_admin_id, row.balance_after), (2, 10))

    async def test_referral_service_award_and_replay_preserve_economics(self):
        order_id = self.seed_referral()
        first = await self.client.post("/points/accrue-referral", json={"order_id": order_id})
        replay = await self.client.post("/points/accrue-referral",
                                        json={"order_id": order_id, "created_by_admin_id": None})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(first.json()["amount"], 75)
        self.assertEqual(first.json()["referral_level"], 1)
        self.assertTrue(replay.json()["idempotent_replay"])
        with self.Session() as db:
            row = db.query(PointsLedger).one()
            self.assertIsNone(row.created_by_admin_id)
            row.created_by_admin_id = 2  # Simulate a pre-existing historical admin accrual.
            db.commit()
        historical = await self.client.post("/points/accrue-referral", json={"order_id": order_id})
        self.assertEqual(historical.status_code, 200)
        self.assertTrue(historical.json()["idempotent_replay"])
        with self.Session() as db:
            self.assertEqual(db.query(PointsLedger).one().created_by_admin_id, 2)

    async def test_default_page_is_bounded_ordered_and_retains_item_fields(self):
        ids = self.seed_history()
        response = await self.client.get("/points/user/1/ledger")
        self.assertEqual(response.status_code, 200)
        page = response.json()
        self.assertEqual(page["limit"], 30)
        self.assertEqual([row["id"] for row in page["items"]], ids[:30])
        self.assertTrue(page["has_more"])
        self.assertEqual(page["next_cursor"], ids[29])
        self.assertEqual(set(page["items"][0]), {
            "id", "operation_type", "amount", "balance_after", "order_id", "service_id",
            "referral_level", "reward_rule_id", "reward_rule_snapshot", "comment",
            "created_at", "created_by_admin_id",
        })

    async def test_cursor_traverses_only_requested_user_without_gaps_or_duplicates(self):
        ids = self.seed_history()
        received, before_id = [], None
        while True:
            params = {"limit": 17}
            if before_id is not None:
                params["before_id"] = before_id
            response = await self.client.get("/points/user/1/ledger", params=params)
            self.assertEqual(response.status_code, 200)
            page = response.json()
            received.extend(row["id"] for row in page["items"])
            if not page["has_more"]:
                self.assertIsNone(page["next_cursor"])
                break
            self.assertEqual(page["next_cursor"], page["items"][-1]["id"])
            before_id = page["next_cursor"]
            self.assertLessEqual(len(received), len(ids))
        self.assertEqual(received, ids)

    async def test_maximum_page_and_empty_or_missing_user(self):
        ids = self.seed_history()
        page = (await self.client.get("/points/user/1/ledger?limit=100")).json()
        self.assertEqual(len(page["items"]), 100)
        self.assertTrue(page["has_more"])
        last = (await self.client.get(f"/points/user/1/ledger?limit=5&before_id={ids[99]}")).json()
        self.assertEqual(len(last["items"]), 5)
        self.assertFalse(last["has_more"])
        self.assertIsNone(last["next_cursor"])
        empty = (await self.client.get("/points/user/2/ledger")).json()
        self.assertEqual(empty, {"items": [], "limit": 30, "next_cursor": None, "has_more": False})
        self.assertEqual((await self.client.get("/points/user/9999/ledger")).status_code, 404)

    async def test_invalid_pagination_fails_before_database_access(self):
        for query in ("limit=0", "limit=-1", "limit=101", "limit=word", "before_id=0",
                      "before_id=-1", "before_id=word"):
            with self.subTest(query=query):
                response = await self.client.get(f"/points/user/1/ledger?{query}")
                self.assertEqual(response.status_code, 422)
        self.session_factory.assert_not_called()
