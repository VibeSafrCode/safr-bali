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
from app.services.rewards import accrue_referral_reward, reverse_referral_reward


class ReferralRewardPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.now = datetime(2026, 8, 8, 12, 0, 0)

        self.inviter = User(
            telegram_id=101,
            first_name="Inviter",
            language="ru",
            role="client",
            ref_code="INVITER",
            status="active",
        )
        self.client = User(
            telegram_id=102,
            first_name="Client",
            language="ru",
            role="client",
            ref_code="CLIENT",
            status="active",
        )
        self.service = Service(
            name="Visa",
            slug="visa-policy-test",
            is_active=True,
            can_pay_with_points=False,
        )
        self.mode = PartnerMode(name="Direct", slug="direct", is_active=True)
        self.db.add_all([self.inviter, self.client, self.service, self.mode])
        self.db.flush()
        self.client.invited_by_user_id = self.inviter.id
        self.db.add(
            Referral(
                parent_user_id=self.inviter.id,
                child_user_id=self.client.id,
                level=1,
                source="explicit_referral",
            )
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _rule(self, *, valid_from: datetime, valid_to: datetime | None = None):
        rule = RewardRule(
            service_id=self.service.id,
            partner_mode_id=self.mode.id,
            level_1_points=100,
            level_2_points=0,
            level_3_points=0,
            valid_from=valid_from,
            valid_to=valid_to,
            is_active=True,
        )
        self.db.add(rule)
        self.db.commit()
        return rule

    def _order(self, status: str):
        order = Order(
            user_id=self.client.id,
            service_id=self.service.id,
            status=status,
            payment_status="paid" if status == "completed" else "pending",
        )
        self.db.add(order)
        self.db.commit()
        return order

    def test_pending_order_never_accrues_referral_reward(self):
        self._rule(valid_from=self.now - timedelta(days=1))
        result = accrue_referral_reward(
            self.db,
            order_id=self._order("new").id,
            now=self.now,
        )
        self.assertFalse(result.created)
        self.assertIsNone(result.operation)
        self.assertEqual(result.reason, "order_not_completed")

    def test_future_reward_rule_is_not_selected(self):
        self._rule(valid_from=self.now + timedelta(seconds=1))
        result = accrue_referral_reward(
            self.db,
            order_id=self._order("completed").id,
            now=self.now,
        )
        self.assertFalse(result.created)
        self.assertIsNone(result.operation)
        self.assertEqual(result.reason, "reward_rule_missing")

    def test_expired_reward_rule_is_not_selected(self):
        self._rule(
            valid_from=self.now - timedelta(days=2),
            valid_to=self.now,
        )
        result = accrue_referral_reward(
            self.db,
            order_id=self._order("completed").id,
            now=self.now,
        )
        self.assertFalse(result.created)
        self.assertIsNone(result.operation)
        self.assertEqual(result.reason, "reward_rule_missing")

    def test_completed_order_uses_current_reward_rule(self):
        self._rule(
            valid_from=self.now - timedelta(days=1),
            valid_to=self.now + timedelta(days=1),
        )
        result = accrue_referral_reward(
            self.db,
            order_id=self._order("completed").id,
            now=self.now,
        )
        self.assertTrue(result.created)
        self.assertEqual(result.operation.amount, 100)

    def test_default_main_admin_assignment_never_accrues(self):
        self._rule(valid_from=self.now - timedelta(days=1))
        referral = self.db.query(Referral).filter(Referral.child_user_id == self.client.id).one()
        referral.source = "default_main_admin"
        self.db.commit()
        result = accrue_referral_reward(
            self.db,
            order_id=self._order("completed").id,
            now=self.now,
        )
        self.assertFalse(result.created)
        self.assertEqual(result.reason, "referral_not_rewardable")

    def test_cancel_reversal_is_append_only_and_idempotent(self):
        self._rule(valid_from=self.now - timedelta(days=1))
        order = self._order("completed")
        accrual = accrue_referral_reward(self.db, order_id=order.id, now=self.now)

        first = reverse_referral_reward(
            self.db,
            order_id=order.id,
            created_by_admin_id=self.inviter.id,
        )
        second = reverse_referral_reward(
            self.db,
            order_id=order.id,
            created_by_admin_id=self.inviter.id,
        )

        self.assertTrue(first.created)
        self.assertFalse(second.created)
        self.assertEqual(first.operation.amount, -accrual.operation.amount)
        self.assertEqual(first.operation.operation_type, "referral_reversal")
        self.assertEqual(first.operation.id, second.operation.id)


if __name__ == "__main__":
    unittest.main()
