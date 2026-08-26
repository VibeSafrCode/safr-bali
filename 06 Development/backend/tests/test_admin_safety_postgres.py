from __future__ import annotations

import os
import unittest
import uuid

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker

from app.models.referral import Referral
from app.models.user import User


POSTGRES_URL_ENV = "SAFR_TEST_POSTGRES_URL"


@unittest.skipUnless(
    os.environ.get(POSTGRES_URL_ENV),
    f"{POSTGRES_URL_ENV} is required for PostgreSQL migration/function tests",
)
class AdminSafetyPostgresTests(unittest.TestCase):
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
