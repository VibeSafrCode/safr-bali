"""add admin safety foundations

Revision ID: a3c8e1f4b726
Revises: f7a1c2d3e465
Create Date: 2026-08-25
"""

from typing import Optional, Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a3c8e1f4b726"
down_revision: Union[str, Sequence[str], None] = "f7a1c2d3e465"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _runtime_owner() -> Optional[str]:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return None
    owner = bind.execute(sa.text("""
        SELECT tableowner FROM pg_catalog.pg_tables
        WHERE schemaname = current_schema() AND tablename = 'users'
    """)).scalar_one_or_none()
    if owner is None:
        raise RuntimeError("Cannot determine canonical runtime owner")
    return bind.dialect.identifier_preparer.quote_identifier(str(owner))


def _align_runtime_owner(*tables: str) -> None:
    owner = _runtime_owner()
    if owner is None:
        return
    for table in tables:
        op.execute(sa.text(f'ALTER TABLE "{table}" OWNER TO {owner}'))
        op.execute(sa.text(f'ALTER SEQUENCE "{table}_id_seq" OWNER TO {owner}'))


def upgrade() -> None:
    op.create_table(
        "visa_case_deletion_tombstones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("visa_case_id", sa.Integer(), nullable=False),
        sa.Column("visa_type_code", sa.String(32), nullable=False),
        sa.Column("actor_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("expected_version", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("dependency_counts", sa.JSON(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_visa_case_deletion_tombstones_visa_case_id", "visa_case_deletion_tombstones", ["visa_case_id"])
    op.create_index("ix_visa_case_deletion_tombstones_actor_admin_id", "visa_case_deletion_tombstones", ["actor_admin_id"])
    op.create_index("uq_visa_case_deletion_tombstone_idempotency", "visa_case_deletion_tombstones", ["idempotency_key"], unique=True)

    op.create_table(
        "referral_attribution_corrections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("child_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("previous_parent_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("new_parent_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("referral_row_id", sa.Integer()),
        sa.Column("actor_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("source", sa.String(100), nullable=False, server_default="manual_admin_correction"),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("child_user_id <> new_parent_user_id", name="ck_referral_correction_not_self"),
    )
    op.create_index("ix_referral_attribution_corrections_child_user_id", "referral_attribution_corrections", ["child_user_id"])
    op.create_index("ix_referral_attribution_corrections_new_parent_user_id", "referral_attribution_corrections", ["new_parent_user_id"])
    op.create_index("ix_referral_attribution_corrections_actor_admin_id", "referral_attribution_corrections", ["actor_admin_id"])
    op.create_index("uq_referral_corrections_idempotency", "referral_attribution_corrections", ["idempotency_key"], unique=True)
    op.create_table(
        "business_setting_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entity_type", sa.String(32), nullable=False),
        sa.Column("entity_key", sa.String(255), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("entity_type", "entity_key", "version", name="uq_business_setting_version"),
    )
    op.create_index("ix_business_setting_versions_entity_type", "business_setting_versions", ["entity_type"])
    op.create_index("ix_business_setting_versions_entity_key", "business_setting_versions", ["entity_key"])
    op.create_index("ix_business_setting_versions_created_by_admin_id", "business_setting_versions", ["created_by_admin_id"])
    op.create_index("uq_business_setting_active_version", "business_setting_versions", ["entity_type", "entity_key"], unique=True, postgresql_where=sa.text("is_active IS TRUE"), sqlite_where=sa.text("is_active = 1"))
    _align_runtime_owner("visa_case_deletion_tombstones", "referral_attribution_corrections", "business_setting_versions")

    if op.get_bind().dialect.name != "postgresql":
        return

    op.execute(sa.text("""
        CREATE OR REPLACE FUNCTION safr_prevent_referral_pointer_reassignment()
        RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE correction_id integer;
        BEGIN
          IF OLD.invited_by_user_id IS NOT NULL
             AND NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id THEN
            correction_id := NULLIF(current_setting('safr.referral_correction_id', true), '')::integer;
            IF correction_id IS NULL OR NOT EXISTS (
              SELECT 1 FROM referral_attribution_corrections c
              WHERE c.id = correction_id AND c.child_user_id = OLD.id
                AND c.previous_parent_user_id IS NOT DISTINCT FROM OLD.invited_by_user_id
                AND c.new_parent_user_id = NEW.invited_by_user_id
            ) THEN
              RAISE EXCEPTION 'invited_by_user_id is immutable outside the supported correction path';
            END IF;
          END IF;
          RETURN NEW;
        END $$
    """))
    op.execute(sa.text("""
        CREATE OR REPLACE FUNCTION safr_prevent_referral_row_mutation()
        RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE correction_id integer;
        BEGIN
          IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'referral relationships are append-only and immutable';
          END IF;
          correction_id := NULLIF(current_setting('safr.referral_correction_id', true), '')::integer;
          IF correction_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM referral_attribution_corrections c
            WHERE c.id = correction_id AND c.referral_row_id = OLD.id
              AND c.child_user_id = OLD.child_user_id
              AND c.previous_parent_user_id IS NOT DISTINCT FROM OLD.parent_user_id
              AND c.new_parent_user_id = NEW.parent_user_id
          ) THEN
            RAISE EXCEPTION 'referral relationships are immutable outside the supported correction path';
          END IF;
          RETURN NEW;
        END $$
    """))
    op.execute(sa.text("""
        CREATE FUNCTION safr_prevent_referral_correction_mutation()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'referral correction evidence is append-only';
        END $$
    """))
    op.execute(sa.text("""
        CREATE TRIGGER trg_referral_corrections_immutable
        BEFORE UPDATE OR DELETE ON referral_attribution_corrections
        FOR EACH ROW EXECUTE FUNCTION safr_prevent_referral_correction_mutation()
    """))
    op.execute(sa.text("""
        CREATE FUNCTION safr_apply_referral_correction(
          p_child_user_id integer,
          p_new_parent_user_id integer,
          p_actor_admin_id integer,
          p_reason text,
          p_idempotency_key text
        ) RETURNS TABLE(correction_id integer, idempotent_replay boolean)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
        DECLARE existing referral_attribution_corrections%ROWTYPE;
        DECLARE child users%ROWTYPE;
        DECLARE parent users%ROWTYPE;
        DECLARE actor users%ROWTYPE;
        DECLARE relation referrals%ROWTYPE;
        DECLARE normalized_reason text;
        BEGIN
          normalized_reason := regexp_replace(trim(p_reason), '[[:space:]]+', ' ', 'g');
          IF length(normalized_reason) < 3 OR length(p_idempotency_key) < 8 THEN
            RAISE EXCEPTION 'correction reason and idempotency key are required';
          END IF;
          SELECT * INTO existing FROM referral_attribution_corrections WHERE idempotency_key = p_idempotency_key;
          IF FOUND THEN
            IF existing.child_user_id <> p_child_user_id
               OR existing.new_parent_user_id <> p_new_parent_user_id
               OR existing.actor_admin_id <> p_actor_admin_id
               OR regexp_replace(trim(existing.reason), '[[:space:]]+', ' ', 'g') <> normalized_reason THEN
              RAISE EXCEPTION 'idempotency key belongs to another correction';
            END IF;
            RETURN QUERY SELECT existing.id, true;
            RETURN;
          END IF;
          SELECT * INTO actor FROM users WHERE id = p_actor_admin_id FOR UPDATE;
          IF NOT FOUND OR actor.role <> 'admin' OR actor.status <> 'active' THEN
            RAISE EXCEPTION 'active root admin actor required';
          END IF;
          SELECT * INTO child FROM users WHERE id = p_child_user_id FOR UPDATE;
          SELECT * INTO parent FROM users WHERE id = p_new_parent_user_id FOR UPDATE;
          IF child.id IS NULL OR parent.id IS NULL OR parent.status <> 'active' OR child.id = parent.id THEN
            RAISE EXCEPTION 'child and active non-self inviter are required';
          END IF;
          IF EXISTS (
            WITH RECURSIVE ancestry(id, parent_id) AS (
              SELECT id, invited_by_user_id FROM users WHERE id = parent.id
              UNION
              SELECT u.id, u.invited_by_user_id
              FROM users u JOIN ancestry a ON u.id = a.parent_id
              WHERE a.parent_id IS NOT NULL
            )
            SELECT 1 FROM ancestry WHERE id = child.id
          ) THEN
            RAISE EXCEPTION 'referral correction would create a cycle';
          END IF;
          SELECT * INTO relation FROM referrals WHERE child_user_id = child.id FOR UPDATE;
          IF relation.id IS NULL OR child.invited_by_user_id IS DISTINCT FROM relation.parent_user_id THEN
            RAISE EXCEPTION 'canonical referral pointer and row must agree before correction';
          END IF;
          IF relation.parent_user_id = parent.id THEN
            RAISE EXCEPTION 'requested referral attribution is already current';
          END IF;
          IF EXISTS (
            SELECT 1 FROM points_ledger ledger JOIN orders customer_order ON customer_order.id = ledger.order_id
            WHERE customer_order.user_id = child.id AND ledger.operation_type IN ('referral_accrual','referral_reversal')
          ) THEN
            RAISE EXCEPTION 'referral correction blocked because reward ledger activity exists';
          END IF;
          INSERT INTO referral_attribution_corrections (
            child_user_id, previous_parent_user_id, new_parent_user_id, referral_row_id,
            actor_admin_id, reason, source, idempotency_key, applied_at
          ) VALUES (
            child.id, relation.parent_user_id, parent.id, relation.id,
            actor.id, normalized_reason, 'manual_admin_correction', p_idempotency_key, now()
          ) RETURNING id INTO correction_id;
          PERFORM set_config('safr.referral_correction_id', correction_id::text, true);
          UPDATE users SET invited_by_user_id = parent.id, updated_at = now() WHERE id = child.id;
          UPDATE referrals SET parent_user_id = parent.id, source = 'explicit_referral', attribution_reason = 'manual_admin_correction' WHERE id = relation.id;
          INSERT INTO admin_actions (
            admin_user_id, action_type, entity_type, entity_id, comment,
            idempotency_key, details, created_at
          ) VALUES (
            actor.id, 'REFERRAL_ATTRIBUTION_CORRECTED', 'referral', relation.id,
            normalized_reason, 'referral-correction:' || p_idempotency_key,
            json_build_object('child_user_id', child.id, 'previous_parent_user_id', relation.parent_user_id, 'new_parent_user_id', parent.id, 'reward_ledger_changed', false), now()
          );
          RETURN QUERY SELECT correction_id, false;
        END $$
    """))
    owner = _runtime_owner()
    op.execute(sa.text("REVOKE ALL ON FUNCTION safr_apply_referral_correction(integer,integer,integer,text,text) FROM PUBLIC"))
    if owner:
        op.execute(sa.text(f"GRANT EXECUTE ON FUNCTION safr_apply_referral_correction(integer,integer,integer,text,text) TO {owner}"))


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(sa.text("DROP FUNCTION safr_apply_referral_correction(integer,integer,integer,text,text)"))
        op.execute(sa.text("DROP TRIGGER trg_referral_corrections_immutable ON referral_attribution_corrections"))
        op.execute(sa.text("DROP FUNCTION safr_prevent_referral_correction_mutation()"))
        op.execute(sa.text("""
            CREATE OR REPLACE FUNCTION safr_prevent_referral_pointer_reassignment()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              IF OLD.invited_by_user_id IS NOT NULL AND NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id THEN
                RAISE EXCEPTION 'invited_by_user_id is immutable after attribution';
              END IF;
              RETURN NEW;
            END $$
        """))
        op.execute(sa.text("""
            CREATE OR REPLACE FUNCTION safr_prevent_referral_row_mutation()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              RAISE EXCEPTION 'referral relationships are append-only and immutable';
            END $$
        """))
    op.drop_index("uq_business_setting_active_version", table_name="business_setting_versions")
    op.drop_index("ix_business_setting_versions_created_by_admin_id", table_name="business_setting_versions")
    op.drop_index("ix_business_setting_versions_entity_key", table_name="business_setting_versions")
    op.drop_index("ix_business_setting_versions_entity_type", table_name="business_setting_versions")
    op.drop_table("business_setting_versions")
    op.drop_index("uq_referral_corrections_idempotency", table_name="referral_attribution_corrections")
    op.drop_index("ix_referral_attribution_corrections_actor_admin_id", table_name="referral_attribution_corrections")
    op.drop_index("ix_referral_attribution_corrections_new_parent_user_id", table_name="referral_attribution_corrections")
    op.drop_index("ix_referral_attribution_corrections_child_user_id", table_name="referral_attribution_corrections")
    op.drop_table("referral_attribution_corrections")
    op.drop_index("uq_visa_case_deletion_tombstone_idempotency", table_name="visa_case_deletion_tombstones")
    op.drop_index("ix_visa_case_deletion_tombstones_actor_admin_id", table_name="visa_case_deletion_tombstones")
    op.drop_index("ix_visa_case_deletion_tombstones_visa_case_id", table_name="visa_case_deletion_tombstones")
    op.drop_table("visa_case_deletion_tombstones")
