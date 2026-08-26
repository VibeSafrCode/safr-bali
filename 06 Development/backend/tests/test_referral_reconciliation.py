from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.referral import Referral
from app.models.user import User
from app.scripts.reconcile_referrals import build_reconciliation_report, load_referral_override, reconcile
from app.services.referral_corrections import referral_cycle_user_ids


class ReferralReconciliationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
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

    def test_apply_preserves_matching_immutable_legacy_referral(self):
        root = self._user(100, "ROOT")
        child = self._user(200, "CHILD", invited_by_user_id=root.id)
        referral = Referral(
            parent_user_id=root.id,
            child_user_id=child.id,
            level=1,
            source="referral_link",
        )
        self.db.add(referral)
        self.db.commit()
        self.db.close()

        with (
            patch("app.scripts.reconcile_referrals.SessionLocal", self.Session),
            patch("app.scripts.reconcile_referrals.settings.DEFAULT_ADMIN_TELEGRAM_ID", 100),
            patch(
                "app.scripts.reconcile_referrals.load_bot_referrals",
                return_value={"200": {"source": "referral_link"}},
            ),
        ):
            result = reconcile(
                apply=True,
                expected_main_admin=100,
                bot_path=None,
                promote_main_admin=True,
            )

        self.db = self.Session()
        preserved = self.db.get(Referral, referral.id)
        self.assertTrue(result["applied"])
        self.assertEqual(preserved.source, "referral_link")
        self.assertIsNone(preserved.attribution_reason)
        self.assertFalse(
            any(item["action"] == "normalize_source" for item in result["planned"])
        )

    def test_global_cycle_is_reported_and_blocks_reconciliation(self):
        first = self._user(100, "FIRST")
        second = self._user(200, "SECOND", invited_by_user_id=first.id)
        first.invited_by_user_id = second.id
        self.db.add_all([
            Referral(parent_user_id=second.id, child_user_id=first.id, level=1, source="fixture"),
            Referral(parent_user_id=first.id, child_user_id=second.id, level=1, source="fixture"),
        ]); self.db.commit()
        self.assertEqual(referral_cycle_user_ids(self.db), ((first.id, second.id),))
        report = build_reconciliation_report(self.db, referrals_json={}, referral_codes_json={}, environment_label="isolated_test")
        self.assertIn("postgres_referral_cycle", {item["kind"] for item in report["issues"]})
        self.db.close()
        with (
            patch("app.scripts.reconcile_referrals.SessionLocal", self.Session),
            patch("app.scripts.reconcile_referrals.settings.DEFAULT_ADMIN_TELEGRAM_ID", 100),
        ):
            result = reconcile(apply=False, expected_main_admin=100, bot_path=None)
        self.assertFalse(result["applied"])
        self.assertIn("referral_cycle", {item["reason"] for item in result["conflicts"]})

    def test_protected_override_manifest_drives_exact_preview_and_apply_without_guessing(self):
        root = self._user(100, "ROOT"); root.role = "admin"
        previous = self._user(200, "PREVIOUS", invited_by_user_id=root.id)
        replacement = self._user(300, "REPLACEMENT", invited_by_user_id=root.id)
        child = self._user(400, "CHILD", invited_by_user_id=previous.id)
        self.db.add_all([
            Referral(parent_user_id=root.id, child_user_id=previous.id, level=1, source="explicit_referral"),
            Referral(parent_user_id=root.id, child_user_id=replacement.id, level=1, source="explicit_referral"),
            Referral(parent_user_id=previous.id, child_user_id=child.id, level=1, source="explicit_referral"),
        ]); self.db.commit(); self.db.close()
        descriptor, name = tempfile.mkstemp(prefix="referral-override-", suffix=".json")
        try:
            os.fchmod(descriptor, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump({"child_telegram_id": 400, "new_parent_telegram_id": 300, "reason": "Founder-approved fixture", "idempotency_key": "founder-override-fixture"}, handle)
            override = load_referral_override(Path(name))
            with (
                patch("app.scripts.reconcile_referrals.SessionLocal", self.Session),
                patch("app.scripts.reconcile_referrals.settings.DEFAULT_ADMIN_TELEGRAM_ID", 100),
            ):
                preview = reconcile(apply=False, expected_main_admin=100, bot_path=None, override=override)
                applied = reconcile(apply=True, expected_main_admin=100, bot_path=None, override=override)
            self.assertTrue(preview["override_planned"] and not preview["conflicts"])
            self.assertTrue(applied["applied"])
            self.db = self.Session()
            self.assertEqual(self.db.get(User, child.id).invited_by_user_id, replacement.id)
            self.assertEqual(referral_cycle_user_ids(self.db), ())
        finally:
            Path(name).unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
from app.models.admin_action import AdminAction
