from __future__ import annotations

import os
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.referral import Referral
from app.models.admin_safety import StaffGrant, VisaCaseDeletionTombstone
from app.models.user import User
from app.models.visa_lifecycle import (
    VisaCase,
    VisaCaseAssignment,
    VisaDocument,
    VisaEvent,
    VisaNotificationDelivery,
    VisaProcess,
    VisaType,
)
from app.services.visa_deletion import (
    VisaDeleteBlocked,
    build_visa_delete_plan,
    permanently_delete_visa_case,
)
from app.services.visa_contact_reminders import (
    CONTACT_MATERIALIZER_LOCK_ID,
    materialize_contact_reminders,
)
from app.services.visa_lifecycle import claim_deliveries
from app.services.visa_staff import grant_staff_role


POSTGRES_URL_ENV = "SAFR_TEST_POSTGRES_URL"


@unittest.skipUnless(
    os.environ.get(POSTGRES_URL_ENV),
    f"{POSTGRES_URL_ENV} is required for PostgreSQL migration/function tests",
)
class AdminSafetyPostgresTests(unittest.TestCase):
    def test_delivery_claim_concurrency_and_expiry_are_never_blindly_retried(self) -> None:
        engine = create_engine(os.environ[POSTGRES_URL_ENV])
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        seed_db = Session()
        try:
            suffix = uuid.uuid4().hex[:8].upper()
            telegram_base = 9_600_000_000 + (uuid.uuid4().int % 100_000_000)
            root = User(telegram_id=telegram_base + 1, first_name="Root", role="admin", ref_code=f"PGNR{suffix}", status="active")
            client = User(telegram_id=telegram_base + 2, first_name="Client", role="client", ref_code=f"PGNC{suffix}", status="active")
            visa_type = VisaType(country_code="ID", code=f"N{suffix[:6]}", name="Notification fixture", version=1)
            seed_db.add_all([root, client, visa_type]); seed_db.flush()
            case = VisaCase(
                user_id=client.id, visa_type_id=visa_type.id,
                assigned_admin_id=root.id, publication_status="PUBLISHED",
            )
            seed_db.add(case); seed_db.flush()
            start = datetime(2026, 8, 28, 7, 0, tzinfo=timezone.utc)
            row = VisaNotificationDelivery(
                visa_case_id=case.id, recipient_user_id=client.id,
                recipient_kind="client", locale="en",
                notification_type="CASE_UPDATED", payload={"fixture": True},
                dedupe_key=f"pg-notification-claim-{suffix}", due_at=start,
                state="PENDING",
            )
            seed_db.add(row); seed_db.commit()
            delivery_id = row.id
            barrier = threading.Barrier(2)

            def claim_once() -> list:
                db = Session()
                try:
                    barrier.wait(timeout=5)
                    return claim_deliveries(db, now=start)
                finally:
                    db.close()

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = [future.result(timeout=10) for future in (
                    pool.submit(claim_once), pool.submit(claim_once),
                )]
            self.assertEqual(
                sum(
                    1
                    for items in results
                    for claimed in items
                    if claimed.id == delivery_id
                ),
                1,
            )
            check = Session()
            try:
                self.assertEqual(check.get(VisaNotificationDelivery, delivery_id).attempts, 1)
                self.assertNotIn(
                    delivery_id,
                    {
                        claimed.id
                        for claimed in claim_deliveries(
                            check, now=start + timedelta(minutes=6)
                        )
                    },
                )
                check.expire_all()
                unknown = check.get(VisaNotificationDelivery, delivery_id)
                self.assertEqual(unknown.state, "UNKNOWN")
                self.assertEqual(unknown.attempts, 1)
                self.assertIsNone(unknown.lease_token)
                self.assertNotIn(
                    delivery_id,
                    {
                        claimed.id
                        for claimed in claim_deliveries(
                            check, now=start + timedelta(days=1)
                        )
                    },
                )
            finally:
                check.close()
        finally:
            seed_db.close()
            engine.dispose()

    def test_staff_grant_concurrent_idempotency_is_actor_bound(self) -> None:
        engine = create_engine(os.environ[POSTGRES_URL_ENV])
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        seed_db = Session()
        try:
            suffix = uuid.uuid4().hex[:8].upper()
            telegram_base = 9_500_000_000 + (uuid.uuid4().int % 100_000_000)
            root = User(
                telegram_id=telegram_base + 1, first_name="Root", role="admin",
                ref_code=f"PGGR{suffix}", status="active",
            )
            manager = User(
                telegram_id=telegram_base + 2, first_name="Manager", role="client",
                ref_code=f"PGGM{suffix}", status="active",
            )
            seed_db.add_all([root, manager]); seed_db.commit()
            root_id, manager_id = root.id, manager.id
            key = f"pg-concurrent-grant-{suffix.lower()}"
            barrier = threading.Barrier(2)

            def apply_once() -> tuple[int, bool]:
                db = Session()
                try:
                    actor = db.get(User, root_id)
                    barrier.wait(timeout=5)
                    grant, replay = grant_staff_role(
                        db, user_id=manager_id, role_code="visa_manager",
                        actor=actor, reason="Concurrent PostgreSQL fixture",
                        idempotency_key=key,
                    )
                    db.commit()
                    return grant.id, replay
                finally:
                    db.close()

            from unittest.mock import patch
            with patch.object(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id):
                with ThreadPoolExecutor(max_workers=2) as pool:
                    results = [future.result(timeout=10) for future in (
                        pool.submit(apply_once), pool.submit(apply_once),
                    )]
            self.assertEqual(len({row_id for row_id, _replay in results}), 1)
            self.assertEqual(sorted(replay for _row_id, replay in results), [False, True])
            self.assertEqual(
                seed_db.query(StaffGrant).filter_by(
                    user_id=manager_id, role_code="visa_manager",
                ).count(),
                1,
            )
        finally:
            seed_db.close()
            engine.dispose()

    def test_permanent_delete_preserves_append_only_and_requires_archived_unprotected_case(self) -> None:
        engine = create_engine(os.environ[POSTGRES_URL_ENV])
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        db = Session()
        try:
            suffix = uuid.uuid4().hex[:8].upper()
            telegram_base = 9_300_000_000 + (uuid.uuid4().int % 100_000_000)
            actor = User(telegram_id=telegram_base + 1, first_name="Root", role="admin", ref_code=f"PGDA{suffix}", status="active")
            client = User(telegram_id=telegram_base + 2, first_name="Client", role="client", ref_code=f"PGDC{suffix}", status="active")
            visa_type = VisaType(country_code="ID", code=f"T{suffix[:6]}", name="Delete fixture", version=1)
            db.add_all([actor, client, visa_type]); db.flush()
            archived = VisaCase(
                user_id=client.id, visa_type_id=visa_type.id,
                assigned_admin_id=actor.id, publication_status="ARCHIVED",
                lifecycle_status="CANCELLED",
            )
            db.add(archived); db.flush()
            db.add(VisaCaseAssignment(
                visa_case_id=archived.id, staff_user_id=actor.id,
                assigned_by_admin_id=actor.id, assignment_reason="fixture",
                assignment_idempotency_key=f"pg-delete-assignment-{suffix}",
            ))
            process = VisaProcess(
                visa_case_id=archived.id, process_type="APPLICATION",
                external_status="CANCELLED",
            )
            db.add(process); db.flush()
            event = VisaEvent(
                visa_case_id=archived.id, visa_process_id=process.id,
                actor_user_id=actor.id, event_type="CASE_ARCHIVED", source="admin",
            )
            db.add(event); db.flush()
            delivery = VisaNotificationDelivery(
                visa_case_id=archived.id, visa_event_id=event.id,
                recipient_user_id=client.id, recipient_kind="client", locale="ru",
                notification_type="CASE_UPDATED", payload={},
                dedupe_key=f"pg-delete-{suffix}", due_at=datetime.now(timezone.utc),
            )
            db.add(delivery); db.commit()

            with self.assertRaisesRegex(DBAPIError, "visa_events is append-only"):
                db.execute(text("UPDATE visa_events SET reason='forbidden' WHERE id=:id"), {"id": event.id})
            db.rollback()
            with self.assertRaisesRegex(DBAPIError, "visa_events is append-only"):
                db.execute(text("DELETE FROM visa_events WHERE id=:id"), {"id": event.id})
            db.rollback()

            plan = build_visa_delete_plan(db, archived.id)
            self.assertTrue(plan.executable)
            self.assertEqual(
                set(plan.dependency_counts),
                {
                    "credential_vault_items", "client_internal_notes", "visa_documents",
                    "visa_case_assignments", "visa_notification_deliveries",
                    "visa_events", "visa_processes",
                },
            )
            from unittest.mock import patch
            with patch.object(settings, "DEFAULT_ADMIN_TELEGRAM_ID", actor.telegram_id):
                tombstone, replay = permanently_delete_visa_case(
                    db, case_id=archived.id, expected_version=archived.version,
                    actor=actor, reason="PostgreSQL archived fixture deletion",
                    idempotency_key=f"pg-delete-action-{suffix.lower()}",
                )
            db.commit()
            self.assertFalse(replay)
            self.assertEqual(tombstone.visa_case_id, archived.id)
            self.assertIsNone(db.get(VisaCase, archived.id))
            self.assertEqual(db.query(VisaEvent).filter_by(visa_case_id=archived.id).count(), 0)
            self.assertEqual(db.query(VisaProcess).filter_by(visa_case_id=archived.id).count(), 0)
            self.assertEqual(db.query(VisaNotificationDelivery).filter_by(visa_case_id=archived.id).count(), 0)
            self.assertEqual(db.query(VisaCaseDeletionTombstone).filter_by(visa_case_id=archived.id).count(), 1)

            current = VisaCase(
                user_id=client.id, visa_type_id=visa_type.id,
                assigned_admin_id=actor.id, publication_status="PUBLISHED",
                lifecycle_status="ACTIVE",
            )
            protected = VisaCase(
                user_id=client.id, visa_type_id=visa_type.id,
                assigned_admin_id=actor.id, publication_status="ARCHIVED",
                lifecycle_status="CANCELLED",
            )
            db.add_all([current, protected]); db.flush()
            db.add(VisaDocument(
                user_id=client.id, visa_case_id=protected.id,
                document_type="passport", display_name="protected.pdf",
                storage_key=f"protected/{suffix}", uploaded_by_admin_id=actor.id,
            ))
            db.commit()
            with self.assertRaisesRegex(VisaDeleteBlocked, "must be archived"):
                build_visa_delete_plan(db, current.id)
            protected_plan = build_visa_delete_plan(db, protected.id)
            self.assertTrue(protected_plan.protected_files_present)
            with self.assertRaisesRegex(VisaDeleteBlocked, "cleanup transaction"):
                with patch.object(settings, "DEFAULT_ADMIN_TELEGRAM_ID", actor.telegram_id):
                    permanently_delete_visa_case(
                        db, case_id=protected.id, expected_version=protected.version,
                        actor=actor, reason="Must remain blocked",
                        idempotency_key=f"pg-protected-{suffix.lower()}",
                    )
            db.rollback()
            self.assertIsNotNone(db.get(VisaCase, protected.id))
            self.assertEqual(db.query(VisaCaseDeletionTombstone).filter_by(visa_case_id=protected.id).count(), 0)
        finally:
            db.close()
            engine.dispose()

    def test_contact_materializer_lock_dedupe_payloads_and_revoked_staff_suppression(self) -> None:
        engine = create_engine(os.environ[POSTGRES_URL_ENV])
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        db = Session()
        lock_holder = Session()
        try:
            suffix = uuid.uuid4().hex[:8].upper()
            telegram_base = 9_400_000_000 + (uuid.uuid4().int % 100_000_000)
            root = User(telegram_id=telegram_base + 1, first_name="Root", role="admin", ref_code=f"PGMR{suffix}", status="active", locale="ru")
            manager = User(telegram_id=telegram_base + 2, first_name="Visa", role="client", ref_code=f"PGMV{suffix}", status="active", locale="en")
            general = User(telegram_id=telegram_base + 3, first_name="General", role="client", ref_code=f"PGMG{suffix}", status="active", locale="ru")
            client = User(telegram_id=telegram_base + 4, first_name="Client", role="client", ref_code=f"PGMC{suffix}", status="active", locale="en")
            visa_type = VisaType(country_code="ID", code=f"R{suffix[:6]}", name="Reminder fixture", version=1)
            db.add_all([root, manager, general, client, visa_type]); db.flush()
            manager_grant = StaffGrant(user_id=manager.id, role_code="visa_manager", granted_by_admin_id=root.id, grant_reason="fixture", grant_idempotency_key=f"pg-manager-grant-{suffix}")
            general_grant = StaffGrant(user_id=general.id, role_code="general_manager", granted_by_admin_id=root.id, grant_reason="fixture", grant_idempotency_key=f"pg-general-grant-{suffix}")
            db.add_all([manager_grant, general_grant]); db.flush()
            case = VisaCase(
                user_id=client.id, visa_type_id=visa_type.id, assigned_admin_id=root.id,
                publication_status="PUBLISHED", lifecycle_status="ACTIVE",
                recommended_contact_at=datetime.now(timezone.utc),
                contact_reason_code="VISA_EXPIRY",
                contact_internal_note="Internal PostgreSQL fixture",
                contact_plan_version=1,
            )
            db.add(case); db.flush()
            db.add_all([
                VisaCaseAssignment(visa_case_id=case.id, staff_user_id=root.id, assigned_by_admin_id=root.id, assignment_reason="fixture", assignment_idempotency_key=f"pg-root-assignment-{suffix}"),
                VisaCaseAssignment(visa_case_id=case.id, staff_user_id=manager.id, staff_grant_id=manager_grant.id, assigned_by_admin_id=root.id, assignment_reason="fixture", assignment_idempotency_key=f"pg-manager-assignment-{suffix}"),
                VisaCaseAssignment(visa_case_id=case.id, staff_user_id=general.id, staff_grant_id=general_grant.id, assigned_by_admin_id=root.id, assignment_reason="fixture", assignment_idempotency_key=f"pg-general-assignment-{suffix}"),
            ])
            db.commit()

            from unittest.mock import patch
            with patch.object(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id):
                lock_holder.execute(
                    text("SELECT pg_advisory_xact_lock(:lock_id)"),
                    {"lock_id": CONTACT_MATERIALIZER_LOCK_ID},
                )
                blocked = materialize_contact_reminders(Session(), now=datetime.now(timezone.utc))
                self.assertFalse(blocked.lock_acquired)
                lock_holder.rollback()

                first = materialize_contact_reminders(Session(), now=datetime.now(timezone.utc))
                second = materialize_contact_reminders(Session(), now=datetime.now(timezone.utc))
                # The materializer intentionally scans all due plans.  Other
                # PostgreSQL fixtures may exist in the same disposable
                # database, so assert the exact rows for this case below
                # instead of coupling the global counter to an empty DB.
                self.assertGreaterEqual(first.created, 4)
                self.assertEqual(second.created, 0)
                rows = db.query(VisaNotificationDelivery).filter(
                    VisaNotificationDelivery.visa_case_id == case.id,
                    VisaNotificationDelivery.notification_type.in_((
                        "CONTACT_REMINDER_CLIENT", "CONTACT_REMINDER_STAFF",
                    )),
                ).all()
                self.assertEqual(len(rows), 4)
                client_row = next(row for row in rows if row.recipient_kind == "client")
                staff_rows = [row for row in rows if row.recipient_kind == "staff"]
                self.assertEqual(client_row.notification_type, "CONTACT_REMINDER_CLIENT")
                self.assertTrue(all(row.notification_type == "CONTACT_REMINDER_STAFF" for row in staff_rows))
                self.assertNotIn("internal_note", client_row.payload)
                self.assertNotIn("client_user_id", client_row.payload)
                self.assertTrue(all("internal_note" not in row.payload for row in staff_rows))

                manager_grant.revoked_at = datetime.now(timezone.utc)
                manager_grant.revoked_by_admin_id = root.id
                manager_grant.revoke_reason = "fixture revocation"
                manager_grant.revoke_idempotency_key = f"pg-manager-revoke-{suffix}"
                db.commit()
                reconciled = materialize_contact_reminders(Session(), now=datetime.now(timezone.utc))
                self.assertEqual(reconciled.suppressed, 1)
                db.expire_all()
                manager_delivery = db.query(VisaNotificationDelivery).filter_by(
                    visa_case_id=case.id,
                    recipient_user_id=manager.id,
                    notification_type="CONTACT_REMINDER_STAFF",
                ).one()
                self.assertEqual(manager_delivery.state, "SUPPRESSED")
        finally:
            lock_holder.rollback()
            lock_holder.close()
            db.close()
            engine.dispose()

    def test_supported_correction_function_binds_replay_reason(self) -> None:
        engine = create_engine(os.environ[POSTGRES_URL_ENV])
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        db = Session()
        try:
            suffix = uuid.uuid4().hex[:8].upper()
            telegram_base = 9_200_000_000 + (uuid.uuid4().int % 100_000_000)
            actor = User(telegram_id=telegram_base + 1, first_name="Root", role="admin", ref_code=f"PGRR{suffix}", status="active")
            previous_parent = User(telegram_id=telegram_base + 2, first_name="Parent", role="client", ref_code=f"PGRP{suffix}", status="active")
            replacement = User(telegram_id=telegram_base + 3, first_name="Replacement", role="client", ref_code=f"PGRN{suffix}", status="active")
            db.add_all([actor, previous_parent, replacement]); db.flush()
            child = User(telegram_id=telegram_base + 4, first_name="Child", role="client", ref_code=f"PGRC{suffix}", status="active", invited_by_user_id=previous_parent.id)
            db.add(child); db.flush()
            db.add(Referral(parent_user_id=previous_parent.id, child_user_id=child.id, level=1, source="fixture")); db.commit()
            params = {"child_id": child.id, "parent_id": replacement.id, "actor_id": actor.id, "reason": "verified   fixture reason", "key": f"pg-reason-{suffix.lower()}"}
            first = db.execute(text("SELECT * FROM safr_apply_referral_correction(:child_id, :parent_id, :actor_id, :reason, :key)"), params).one()
            db.commit()
            self.assertFalse(first.idempotent_replay)
            replay = db.execute(text("SELECT * FROM safr_apply_referral_correction(:child_id, :parent_id, :actor_id, :reason, :key)"), {**params, "reason": " verified fixture reason "}).one()
            self.assertTrue(replay.idempotent_replay)
            with self.assertRaisesRegex(DBAPIError, "another correction"):
                db.execute(text("SELECT * FROM safr_apply_referral_correction(:child_id, :parent_id, :actor_id, :reason, :key)"), {**params, "reason": "different reason"}).all()
            db.rollback()
            self.assertEqual(db.execute(text("SELECT count(*) FROM referral_attribution_corrections WHERE child_user_id=:child_id"), {"child_id": child.id}).scalar_one(), 1)
        finally:
            db.close()
            engine.dispose()

    def test_supported_correction_function_rejects_child_under_descendant(self) -> None:
        engine = create_engine(os.environ[POSTGRES_URL_ENV])
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        db = Session()
        try:
            suffix = uuid.uuid4().hex[:8].upper()
            telegram_base = 9_100_000_000 + (uuid.uuid4().int % 100_000_000)
            actor = User(telegram_id=telegram_base + 1, first_name="Root", role="admin", ref_code=f"PGRT{suffix}", status="active")
            previous_parent = User(telegram_id=telegram_base + 2, first_name="Parent", role="client", ref_code=f"PGPT{suffix}", status="active")
            db.add_all([actor, previous_parent])
            db.flush()
            child = User(
                telegram_id=telegram_base + 3,
                first_name="Child",
                role="client",
                ref_code=f"PGCT{suffix}",
                status="active",
                invited_by_user_id=previous_parent.id,
            )
            db.add(child)
            db.flush()
            descendant = User(
                telegram_id=telegram_base + 4,
                first_name="Descendant",
                role="client",
                ref_code=f"PGDT{suffix}",
                status="active",
                invited_by_user_id=child.id,
            )
            db.add(descendant)
            db.flush()
            relation = Referral(
                parent_user_id=previous_parent.id,
                child_user_id=child.id,
                level=1,
                source="fixture",
            )
            db.add_all([
                relation,
                Referral(parent_user_id=child.id, child_user_id=descendant.id, level=1, source="fixture"),
            ])
            db.commit()

            with self.assertRaisesRegex(DBAPIError, "would create a cycle"):
                db.execute(
                    text(
                        "SELECT * FROM safr_apply_referral_correction("
                        ":child_id, :parent_id, :actor_id, :reason, :key)"
                    ),
                    {
                        "child_id": child.id,
                        "parent_id": descendant.id,
                        "actor_id": actor.id,
                        "reason": "postgres descendant regression",
                        "key": f"pg-cycle-{suffix.lower()}",
                    },
                ).all()
            db.rollback()

            pointer = db.execute(
                text("SELECT invited_by_user_id FROM users WHERE id=:child_id"),
                {"child_id": child.id},
            ).scalar_one()
            parent = db.execute(
                text("SELECT parent_user_id FROM referrals WHERE child_user_id=:child_id"),
                {"child_id": child.id},
            ).scalar_one()
            corrections = db.execute(
                text("SELECT count(*) FROM referral_attribution_corrections WHERE child_user_id=:child_id"),
                {"child_id": child.id},
            ).scalar_one()
            self.assertEqual(pointer, previous_parent.id)
            self.assertEqual(parent, previous_parent.id)
            self.assertEqual(corrections, 0)
        finally:
            db.close()
            engine.dispose()
