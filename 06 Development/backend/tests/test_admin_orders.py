from __future__ import annotations

import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.order import Order
from app.models.partner_mode import PartnerMode
from app.models.referral import Referral
from app.models.reward_rule import RewardRule
from app.models.service import Service
from app.models.user import User
from app.services.admin_orders import AdminOrderConflict, transition_order


class AdminOrderTransitionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.main = User(telegram_id=1, role="admin", ref_code="ROOT", status="active")
        self.inviter = User(telegram_id=4, role="client", ref_code="INV", status="active")
        self.client = User(telegram_id=5, role="client", ref_code="CLIENT", status="active")
        self.service = Service(name="Test", slug="admin-order-test", is_active=True, can_pay_with_points=False)
        self.mode = PartnerMode(name="Direct", slug="direct", is_active=True)
        self.db.add_all([self.main, self.inviter, self.client, self.service, self.mode])
        self.db.flush()
        self.client.invited_by_user_id = self.inviter.id
        self.db.add(Referral(parent_user_id=self.inviter.id, child_user_id=self.client.id, level=1, source="explicit_referral"))
        self.db.add(RewardRule(service_id=self.service.id, partner_mode_id=self.mode.id, level_1_points=100, level_2_points=0, level_3_points=0, valid_from=datetime.utcnow() - timedelta(days=1), is_active=True))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def order(self):
        row = Order(user_id=self.client.id, service_id=self.service.id, status="new", payment_status="pending")
        self.db.add(row)
        self.db.commit()
        return row

    def test_payment_confirmation_does_not_complete_order(self):
        order = self.order()
        result = transition_order(self.db, order_id=order.id, target="paid", actor=self.main, comment="Bank evidence checked", idempotency_key="pay-1")
        self.assertEqual(result.order.status, "new")
        self.assertEqual(result.order.payment_status, "paid")
        self.assertIsNotNone(result.order.paid_at)

    def test_completion_requires_persisted_payment(self):
        order = self.order()
        with self.assertRaisesRegex(AdminOrderConflict, "Payment must be confirmed"):
            transition_order(self.db, order_id=order.id, target="completed", actor=self.main, comment="Delivered", idempotency_key="complete-unpaid")

    def test_complete_then_cancel_is_atomic_and_idempotent(self):
        order = self.order()
        transition_order(self.db, order_id=order.id, target="paid", actor=self.main, comment="Paid", idempotency_key="pay-2")
        completed = transition_order(self.db, order_id=order.id, target="completed", actor=self.main, comment="Delivered", idempotency_key="complete-2")
        self.assertIsNotNone(completed.reward_operation_id)
        cancelled = transition_order(self.db, order_id=order.id, target="cancelled", actor=self.main, comment="Founder-approved exception", idempotency_key="cancel-2")
        replay = transition_order(self.db, order_id=order.id, target="cancelled", actor=self.main, comment="Founder-approved exception", idempotency_key="cancel-2")
        self.assertEqual(cancelled.order.status, "cancelled")
        self.assertEqual(cancelled.order.payment_status, "refund_required")
        self.assertIsNotNone(cancelled.reversal_operation_id)
        self.assertTrue(replay.idempotent_replay)

    def test_client_cannot_mutate_order(self):
        order = self.order()
        with self.assertRaisesRegex(PermissionError, "Active admin"):
            transition_order(self.db, order_id=order.id, target="cancelled", actor=self.client, comment="Wrong role", idempotency_key="cancel-3")


if __name__ == "__main__":
    unittest.main()
