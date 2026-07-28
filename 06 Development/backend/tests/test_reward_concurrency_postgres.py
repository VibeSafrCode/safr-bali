from __future__ import annotations

import os
import threading
import unittest
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api import orders as orders_api
from app.db.base import Base
from app.models.order import Order
from app.models.partner_mode import PartnerMode
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.reward_rule import RewardRule
from app.models.service import Service
from app.models.user import User
from app.services.rewards import RewardIdempotencyConflict, accrue_points_once


POSTGRES_URL_ENV = "SAFR_TEST_POSTGRES_URL"


@unittest.skipUnless(
    os.environ.get(POSTGRES_URL_ENV),
    f"{POSTGRES_URL_ENV} is required for PostgreSQL concurrency tests",
)
class RewardConcurrencyPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            os.environ[POSTGRES_URL_ENV],
            pool_size=8,
            max_overflow=0,
        )
        cls.Session = sessionmaker(bind=cls.engine, expire_on_commit=False)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.engine.dispose()

    def setUp(self) -> None:
        Base.metadata.drop_all(self.engine)
        Base.metadata.create_all(self.engine)

    def _seed(self, order_count: int) -> tuple[int, list[int]]:
        db = self.Session()
        try:
            inviter = User(
                telegram_id=100,
                first_name="Inviter",
                language="ru",
                role="client",
                ref_code="INVITER",
                status="active",
            )
            client = User(
                telegram_id=200,
                first_name="Client",
                language="ru",
                role="client",
                ref_code="CLIENT",
                status="active",
            )
            service = Service(
                name="Visa",
                slug="visa",
                is_active=True,
                can_pay_with_points=False,
            )
            mode = PartnerMode(
                name="Direct",
                slug="direct",
                is_active=True,
            )
            db.add_all([inviter, client, service, mode])
            db.flush()
            client.invited_by_user_id = inviter.id
            db.add(
                Referral(
                    parent_user_id=inviter.id,
                    child_user_id=client.id,
                    level=1,
                    source="test",
                )
            )
            db.add(
                RewardRule(
                    service_id=service.id,
                    partner_mode_id=mode.id,
                    level_1_points=100,
                    level_2_points=0,
                    level_3_points=0,
                    valid_from=datetime.utcnow(),
                    is_active=True,
                )
            )
            orders = [
                Order(
                    user_id=client.id,
                    service_id=service.id,
                    status="completed",
                    payment_status="paid",
                )
                for _ in range(order_count)
            ]
            db.add_all(orders)
            db.commit()
            return inviter.id, [order.id for order in orders]
        finally:
            db.close()

    def _run_current_accruals(
        self,
        order_ids: list[int],
    ) -> list[BaseException]:
        barrier = threading.Barrier(len(order_ids))
        errors: list[BaseException] = []
        errors_lock = threading.Lock()

        def worker(order_id: int) -> None:
            db = self.Session()
            try:
                barrier.wait(timeout=10)
                order = db.query(Order).filter(Order.id == order_id).one()
                orders_api.try_accrue_referral_points_for_order(db, order)
                db.commit()
            except BaseException as exc:  # pragma: no cover - asserted below
                db.rollback()
                with errors_lock:
                    errors.append(exc)
            finally:
                db.close()

        threads = [
            threading.Thread(target=worker, args=(order_id,))
            for order_id in order_ids
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)
        self.assertTrue(all(not thread.is_alive() for thread in threads))

        return errors

    def test_same_order_is_rewarded_only_once_under_concurrency(self):
        inviter_id, order_ids = self._seed(order_count=1)

        errors = self._run_current_accruals([order_ids[0], order_ids[0]])

        self.assertEqual(errors, [])
        db = self.Session()
        try:
            operations = (
                db.query(PointsLedger)
                .filter(
                    PointsLedger.user_id == inviter_id,
                    PointsLedger.operation_type == "referral_accrual",
                )
                .all()
            )
            self.assertEqual(len(operations), 1)
            self.assertEqual(operations[0].balance_after, 100)
            self.assertEqual(
                operations[0].reward_rule_snapshot["awarded_points"],
                100,
            )
            self.assertEqual(
                operations[0].idempotency_key,
                f"referral_accrual:order:{order_ids[0]}:direct",
            )
        finally:
            db.close()

    def test_different_orders_do_not_lose_balance_updates(self):
        inviter_id, order_ids = self._seed(order_count=2)

        errors = self._run_current_accruals(order_ids)

        self.assertEqual(errors, [])
        db = self.Session()
        try:
            operations = (
                db.query(PointsLedger)
                .filter(
                    PointsLedger.user_id == inviter_id,
                    PointsLedger.operation_type == "referral_accrual",
                )
                .order_by(PointsLedger.id.asc())
                .all()
            )
            self.assertEqual(len(operations), 2)
            self.assertEqual(operations[-1].balance_after, 200)
        finally:
            db.close()

    def test_same_idempotency_key_replays_without_second_accrual(self):
        inviter_id, _ = self._seed(order_count=0)
        db = self.Session()
        try:
            first = accrue_points_once(
                db,
                user_id=inviter_id,
                amount=50,
                operation_type="manual_accrual",
                idempotency_key="admin-adjustment:example-1",
                comment="Approved adjustment",
            )
            db.commit()
            second = accrue_points_once(
                db,
                user_id=inviter_id,
                amount=50,
                operation_type="manual_accrual",
                idempotency_key="admin-adjustment:example-1",
                comment="Approved adjustment",
            )
            db.commit()

            self.assertTrue(first.created)
            self.assertFalse(second.created)
            self.assertEqual(first.operation.id, second.operation.id)
            self.assertEqual(
                db.query(PointsLedger)
                .filter(
                    PointsLedger.idempotency_key
                    == "admin-adjustment:example-1"
                )
                .count(),
                1,
            )
        finally:
            db.close()

    def test_reused_idempotency_key_with_changed_payload_is_rejected(self):
        inviter_id, _ = self._seed(order_count=0)
        db = self.Session()
        try:
            accrue_points_once(
                db,
                user_id=inviter_id,
                amount=50,
                operation_type="manual_accrual",
                idempotency_key="admin-adjustment:example-2",
                comment="Approved adjustment",
            )
            db.commit()

            with self.assertRaises(RewardIdempotencyConflict):
                accrue_points_once(
                    db,
                    user_id=inviter_id,
                    amount=75,
                    operation_type="manual_accrual",
                    idempotency_key="admin-adjustment:example-2",
                    comment="Changed adjustment",
                )
        finally:
            db.rollback()
            db.close()

    def test_blank_idempotency_key_is_rejected(self):
        inviter_id, _ = self._seed(order_count=0)
        db = self.Session()
        try:
            with self.assertRaises(RewardIdempotencyConflict):
                accrue_points_once(
                    db,
                    user_id=inviter_id,
                    amount=50,
                    operation_type="manual_accrual",
                    idempotency_key="   ",
                )
            self.assertEqual(db.query(PointsLedger).count(), 0)
        finally:
            db.rollback()
            db.close()


if __name__ == "__main__":
    unittest.main()
