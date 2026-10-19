"""Behavioral checks for the root-admin preview/confirm transaction.

SQLite proves atomic adapter behavior; PostgreSQL locking is tested separately.
Only synthetic identities and an in-memory database are used here.
"""
import unittest
from unittest.mock import patch
from types import SimpleNamespace

from sqlalchemy import create_engine, event
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.config import settings
from app.db.base import Base
from app.models.admin_action import AdminAction
from app.models.admin_safety import ReferralAttributionCorrection
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.service import Service
from app.models.user import User
from app.services.referral_correction_guard import (
    ReferralCorrectionBlocked, apply_previewed_referral_correction, guarded_referral_preview,
    referral_database_failure,
)


class ReferralCorrectionGuardTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()
        self.root = self.user(1, "root", role="admin")
        self.old = self.user(2, "previous", parent=self.root.id)
        self.new = self.user(3, "replacement", parent=self.root.id)
        self.child = self.user(4, "client", parent=self.old.id)
        self.edge = Referral(parent_user_id=self.old.id, child_user_id=self.child.id,
                             level=1, source="default_admin", attribution_reason="no_link")
        self.db.add(self.edge)
        self.db.add_all([Referral(parent_user_id=self.root.id, child_user_id=user.id,
                                 level=1, source="explicit_referral") for user in (self.old, self.new)])
        self.db.commit()
        self.config = patch.object(settings, "DEFAULT_ADMIN_TELEGRAM_ID", self.root.telegram_id)
        self.config.start()
        self.preview = self.get_preview()

    def tearDown(self):
        self.config.stop()
        self.db.close()
        self.engine.dispose()

    def user(self, number, name, *, role="client", parent=None):
        user = User(telegram_id=900000 + number, ref_code=f"fixture-{number}",
                    first_name=name, role=role, status="active", locale="ru",
                    invited_by_user_id=parent)
        self.db.add(user)
        self.db.flush()
        return user

    def get_preview(self, parent=None):
        return guarded_referral_preview(self.db, child_user_id=self.child.id,
                                        new_parent_user_id=parent or self.new.id)

    def apply(self, preview=None, key="fixture-transfer-0001", **changes):
        p = preview or self.preview
        request = dict(child_user_id=p["child_user_id"], new_parent_user_id=p["new_parent_user_id"],
                       expected_parent_user_id=p["previous_parent_user_id"],
                       expected_last_correction_id=p["last_correction_id"],
                       expected_referral_row_id=p["referral_row_id"], actor=self.root,
                       reason="Correct immediate registration", idempotency_key=key)
        request.update(changes)
        return apply_previewed_referral_correction(self.db, **request)

    def assert_unchanged(self):
        self.db.expire_all()
        self.assertEqual(self.db.get(User, self.child.id).invited_by_user_id, self.old.id)
        self.assertEqual(self.db.get(Referral, self.edge.id).parent_user_id, self.old.id)
        self.assertEqual(self.db.query(ReferralAttributionCorrection).count(), 0)

    def test_success_records_full_before_and_after_and_keeps_descendants(self):
        descendant = self.user(5, "descendant", parent=self.child.id)
        descendant_edge = Referral(parent_user_id=self.child.id, child_user_id=descendant.id,
                                   level=1, source="explicit_referral")
        self.db.add(descendant_edge)
        self.db.commit()
        created_at = self.child.created_at
        correction, replay = self.apply()
        self.db.commit()
        self.assertFalse(replay)
        self.assertEqual(self.child.invited_by_user_id, self.new.id)
        self.assertEqual(self.edge.parent_user_id, self.new.id)
        self.assertEqual(self.edge.source, "explicit_referral")
        self.assertEqual(self.child.created_at, created_at)
        self.assertEqual(descendant.invited_by_user_id, self.child.id)
        self.assertEqual(descendant_edge.parent_user_id, self.child.id)
        self.assertEqual(self.db.query(Referral).filter_by(child_user_id=self.child.id).count(), 1)
        audit = self.db.query(AdminAction).filter_by(action_type="REFERRAL_PREVIEW_APPLIED").one()
        self.assertEqual(audit.details["correction_id"], correction.id)
        self.assertEqual(audit.details["before"], dict(parent_user_id=self.old.id,
                         source="default_admin", attribution_reason="no_link", level=1))
        self.assertEqual(audit.details["after"]["parent_user_id"], self.new.id)
        self.assertFalse(audit.details["rewards_changed"])

    def test_preview_exposes_canonical_names_and_tokens(self):
        self.assertTrue(self.preview["executable"])
        self.assertEqual(self.preview["child"]["name"], "client")
        self.assertEqual(self.preview["previous_parent"]["name"], "previous")
        self.assertEqual(self.preview["new_parent"]["name"], "replacement")
        self.assertEqual(self.preview["last_correction_id"], 0)
        self.assertNotIn("telegram_id", self.preview["child"])

    def test_lost_ack_retry_returns_same_result_without_new_writes(self):
        correction, _ = self.apply()
        self.db.commit()
        repeated, replay = self.apply(reason="  Correct immediate\n registration  ")
        self.db.commit()
        self.assertTrue(replay)
        self.assertEqual(repeated.id, correction.id)
        self.assertEqual(self.db.query(ReferralAttributionCorrection).count(), 1)
        self.assertEqual(self.db.query(AdminAction).count(), 2)

    def test_same_key_binds_all_request_fields(self):
        self.apply()
        self.db.commit()
        for change in ({"reason": "Another valid reason"}, {"expected_last_correction_id": 8},
                       {"expected_referral_row_id": self.edge.id + 1},
                       {"new_parent_user_id": self.old.id}):
            with self.subTest(change=change), self.assertRaisesRegex(ReferralCorrectionBlocked, "idempotency_payload_conflict"):
                self.apply(**change)
        self.assertEqual(self.db.query(ReferralAttributionCorrection).count(), 1)

    def test_replay_requires_matching_audit_evidence(self):
        self.apply()
        self.db.commit()
        audit = self.db.query(AdminAction).filter_by(action_type="REFERRAL_PREVIEW_APPLIED").one()
        for value in (None, [], {"request": audit.details["request"], "correction_id": -1}):
            with self.subTest(value=value):
                audit.details = value
                self.db.flush()
                with self.assertRaisesRegex(ReferralCorrectionBlocked, "idempotency_payload_conflict"):
                    self.apply()
                self.db.rollback()

    def test_stale_parent_and_canonical_row_are_rejected(self):
        for change in ({"expected_parent_user_id": self.new.id},
                       {"expected_referral_row_id": self.edge.id + 1},
                       {"expected_last_correction_id": 1}):
            with self.subTest(change=change), self.assertRaisesRegex(ReferralCorrectionBlocked, "stale_referral_preview"):
                self.apply(**change)
        self.assert_unchanged()

    def test_aba_parent_change_invalidates_old_preview(self):
        self.apply()
        self.db.commit()
        self.apply(self.get_preview(self.old.id), key="fixture-transfer-back")
        self.db.commit()
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "stale_referral_preview"):
            self.apply(key="fixture-stale-after-aba")
        self.assertEqual(self.db.query(ReferralAttributionCorrection).count(), 2)

    def test_existing_order_of_any_status_blocks_transfer(self):
        service = Service(name="Synthetic", slug="fixture-only")
        self.db.add(service)
        self.db.flush()
        for status in ("new", "cancelled", "completed"):
            with self.subTest(status=status):
                self.db.add(Order(user_id=self.child.id, service_id=service.id, status=status))
                self.db.flush()
                self.assertIn("existing_orders_require_separate_policy", self.get_preview()["conflicts"])
                with self.assertRaisesRegex(ReferralCorrectionBlocked, "existing_orders_require_separate_policy"):
                    self.apply()
                self.db.rollback()
                self.assert_unchanged()
                self.db.add(service)
                self.db.flush()

    def test_existing_points_block_without_modifying_ledger(self):
        points = PointsLedger(user_id=self.child.id, operation_type="manual", amount=10,
                              balance_after=10, comment="Synthetic")
        self.db.add(points)
        self.db.commit()
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "existing_points_require_separate_policy"):
            self.apply()
        self.assertEqual(self.db.get(PointsLedger, points.id).amount, 10)
        self.assert_unchanged()

    def test_only_configured_active_root_can_apply(self):
        nonroot = self.user(6, "other-admin", role="admin")
        self.db.commit()
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "root_admin_required"):
            self.apply(actor=nonroot)
        self.root.status = "blocked"
        self.db.commit()
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "root_admin_required"):
            self.apply()
        self.assert_unchanged()

    def test_actor_authority_is_reloaded_from_database(self):
        other = sessionmaker(bind=self.engine)()
        try:
            other.query(User).filter_by(id=self.root.id).update({"role": "client"})
            other.commit()
        finally:
            other.close()
        self.assertEqual(self.root.role, "admin")
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "root_admin_required"):
            self.apply()
        self.assert_unchanged()

    def test_self_descendant_inactive_and_mismatched_edges_fail_closed(self):
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "referral_cycle"):
            self.get_preview(self.child.id)
        descendant = self.user(5, "descendant", parent=self.child.id)
        self.db.add(Referral(parent_user_id=self.child.id, child_user_id=descendant.id,
                             level=1, source="explicit_referral"))
        self.db.flush()
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "referral_cycle"):
            self.get_preview(descendant.id)
        self.new.status = "inactive"
        self.db.flush()
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "inviter_inactive"):
            self.apply()
        self.new.status = "active"
        self.edge.parent_user_id = self.root.id
        self.db.flush()
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "stale_referral_preview"):
            self.apply()
        self.db.rollback()
        self.assert_unchanged()

    def test_unbounded_or_broken_ancestry_is_not_accepted(self):
        with patch("app.services.referral_correction_guard.MAX_ANCESTORS", 1):
            self.new.invited_by_user_id = self.old.id
            self.db.query(Referral).filter_by(child_user_id=self.new.id).update({"parent_user_id": self.old.id})
            self.db.flush()
            with self.assertRaisesRegex(ReferralCorrectionBlocked, "ancestor_depth_limit"):
                self.get_preview()
        self.new.invited_by_user_id = 99999
        self.db.query(Referral).filter_by(child_user_id=self.new.id).update({"parent_user_id": 99999})
        self.db.flush()
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "ancestor_missing"):
            self.get_preview()

    def test_unattributed_parent_cannot_become_a_cycle_later(self):
        newcomer = self.user(8, "not-yet-attributed")
        self.db.commit()
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "ancestor_unattributed"):
            self.get_preview(newcomer.id)
        self.assert_unchanged()

    def test_ancestor_user_and_referral_must_agree(self):
        self.db.query(Referral).filter_by(child_user_id=self.new.id).delete()
        self.db.flush()
        with self.assertRaisesRegex(ReferralCorrectionBlocked, "ancestor_referral_mismatch"):
            self.get_preview()
        self.assert_unchanged()

    def test_only_known_database_errors_are_translated(self):
        class Failure(Exception):
            def __init__(self, code, message="not a known function failure"):
                self.sqlstate = code
                self.diag = SimpleNamespace(message_primary=message)
        for code in ("40001", "40P01", "55P03", "57014"):
            error = DBAPIError(None, None, Failure(code))
            self.assertEqual(referral_database_failure(error), (503, "retry_same_referral_operation"))
        known = DBAPIError(None, None, Failure("P0001", "child and active non-self inviter are required"))
        self.assertEqual(referral_database_failure(known), (409, "referral_conflict_refresh_preview"))
        for code in ("08006", "23505", "P0001"):
            self.assertIsNone(referral_database_failure(DBAPIError(None, None, Failure(code))))

    def test_invalid_types_reason_and_key_are_rejected(self):
        for change in ({"child_user_id": True}, {"expected_last_correction_id": -1},
                       {"expected_parent_user_id": "2"}, {"reason": " \n "},
                       {"idempotency_key": "short"}):
            with self.subTest(change=change), self.assertRaises(ReferralCorrectionBlocked):
                self.apply(**change)
        self.assert_unchanged()

    def test_context_audit_failure_rolls_back_both_pointers_and_journal(self):
        def reject_context(session, *_):
            if any(isinstance(row, AdminAction) and row.action_type == "REFERRAL_PREVIEW_APPLIED"
                   for row in session.new):
                raise RuntimeError("synthetic audit write failure")
        event.listen(self.db, "before_flush", reject_context)
        try:
            with self.assertRaisesRegex(RuntimeError, "synthetic audit"):
                self.apply()
            self.db.rollback()
        finally:
            event.remove(self.db, "before_flush", reject_context)
        self.assert_unchanged()
        self.assertEqual(self.db.query(AdminAction).count(), 0)


if __name__ == "__main__":
    unittest.main()
