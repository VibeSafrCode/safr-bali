from __future__ import annotations

import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.referral import Referral
from app.models.user import User
from app.scripts.reconcile_referrals import build_reconciliation_report, reconcile


class ReferralReconciliationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        User.__table__.create(self.engine)
        Referral.__table__.create(self.engine)
        AdminAction.__table__.create(self.engine)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.Session()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _user(
        self,
        telegram_id: int,
        ref_code: str,
        *,
        invited_by_user_id: int | None = None,
    ) -> User:
        user = User(
            telegram_id=telegram_id,
            first_name=f"User {telegram_id}",
            language="ru",
            role="client",
            ref_code=ref_code,
            status="active",
            invited_by_user_id=invited_by_user_id,
        )
        self.db.add(user)
        self.db.flush()
        return user

    def test_matching_postgres_and_json_has_no_issues(self):
        inviter = self._user(100, "INVITER")
        child = self._user(
            200,
            "CHILD",
            invited_by_user_id=inviter.id,
        )
        self.db.add(
            Referral(
                parent_user_id=inviter.id,
                child_user_id=child.id,
                level=1,
                source="test",
            )
        )
        self.db.commit()

        report = build_reconciliation_report(
            self.db,
            referrals_json={
                "200": {
                    "user_id": 200,
                    "referrer_id": 100,
                    "source": "test",
                }
            },
            referral_codes_json={
                "SAFE100": {
                    "owner_user_id": 100,
                    "active": True,
                }
            },
            environment_label="isolated_test",
        )

        self.assertEqual(report["mode"], "read_only")
        self.assertEqual(report["summary"]["issues"], 0)
        self.assertEqual(report["issues"], [])

    def test_conflicts_and_invalid_json_are_reported_without_mutation(self):
        inviter = self._user(100, "INVITER")
        other_inviter = self._user(300, "OTHER")
        child = self._user(
            200,
            "CHILD",
            invited_by_user_id=inviter.id,
        )
        self.db.add(
            Referral(
                parent_user_id=other_inviter.id,
                child_user_id=child.id,
                level=1,
                source="conflicting_fixture",
            )
        )
        self.db.commit()

        report = build_reconciliation_report(
            self.db,
            referrals_json={
                "200": {"referrer_id": 300},
                "invalid": "not-an-object",
                "999": {"referrer_id": 100},
            },
            referral_codes_json={
                "ONE": {"owner_user_id": 100, "active": True},
                "TWO": {"owner_user_id": 100, "active": True},
                "GHOST": {"owner_user_id": 777, "active": True},
            },
            environment_label="isolated_test",
        )

        kinds = {issue["kind"] for issue in report["issues"]}
        self.assertIn("postgres_user_pointer_without_referral_row", kinds)
        self.assertIn("postgres_referral_row_pointer_mismatch", kinds)
        self.assertIn("json_postgres_parent_mismatch", kinds)
        self.assertIn("json_referral_record_invalid", kinds)
        self.assertIn("json_child_missing_in_postgres", kinds)
        self.assertIn("json_referral_code_owner_missing_in_postgres", kinds)
        self.assertIn("json_multiple_active_codes_for_owner", kinds)

        self.db.refresh(child)
        self.assertEqual(child.invited_by_user_id, inviter.id)
        self.assertEqual(self.db.query(Referral).count(), 1)

    def test_apply_promotes_only_configured_root_and_audits_once(self):
        root = self._user(100, "ROOT")
        self._user(200, "CHILD")
        self.db.commit()
        self.db.close()

        with (
            patch("app.scripts.reconcile_referrals.SessionLocal", self.Session),
            patch("app.scripts.reconcile_referrals.settings.DEFAULT_ADMIN_TELEGRAM_ID", 100),
        ):
            result = reconcile(
                apply=True,
                expected_main_admin=100,
                bot_path=None,
                promote_main_admin=True,
            )

        self.db = self.Session()
        self.assertTrue(result["applied"])
        self.assertEqual(self.db.get(User, root.id).role, "admin")
        action = self.db.query(AdminAction).one()
        self.assertEqual(action.action_type, "main_admin_role_promoted")
        self.assertEqual(action.admin_user_id, root.id)


if __name__ == "__main__":
    unittest.main()
from app.models.admin_action import AdminAction
