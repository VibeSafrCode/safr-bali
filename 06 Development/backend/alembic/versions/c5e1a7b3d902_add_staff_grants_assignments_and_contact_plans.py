"""add staff grants assignments and contact plans

Revision ID: c5e1a7b3d902
Revises: b4d9f2a6c813
Create Date: 2026-08-28
"""

from typing import Optional, Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c5e1a7b3d902"
down_revision: Union[str, Sequence[str], None] = "b4d9f2a6c813"
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
        "staff_grants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("role_code", sa.String(32), nullable=False),
        sa.Column("granted_by_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("grant_reason", sa.Text(), nullable=False),
        sa.Column("grant_idempotency_key", sa.String(255), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("revoked_by_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("revoke_reason", sa.Text()),
        sa.Column("revoke_idempotency_key", sa.String(255)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("role_code IN ('visa_manager','general_manager')", name="ck_staff_grants_role_code"),
    )
    op.create_index("ix_staff_grants_user_id", "staff_grants", ["user_id"])
    op.create_index("ix_staff_grants_role_code", "staff_grants", ["role_code"])
    op.create_index("uq_staff_grants_grant_idempotency", "staff_grants", ["grant_idempotency_key"], unique=True)
    op.create_index("uq_staff_grants_revoke_idempotency", "staff_grants", ["revoke_idempotency_key"], unique=True, postgresql_where=sa.text("revoke_idempotency_key IS NOT NULL"), sqlite_where=sa.text("revoke_idempotency_key IS NOT NULL"))
    op.create_index("uq_staff_grants_active_role", "staff_grants", ["user_id", "role_code"], unique=True, postgresql_where=sa.text("revoked_at IS NULL"), sqlite_where=sa.text("revoked_at IS NULL"))

    op.create_table(
        "visa_case_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("visa_case_id", sa.Integer(), sa.ForeignKey("visa_cases.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("assigned_by_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("assignment_reason", sa.Text(), nullable=False),
        sa.Column("assignment_idempotency_key", sa.String(255), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("revoked_by_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("revoke_reason", sa.Text()),
        sa.Column("revoke_idempotency_key", sa.String(255)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_visa_case_assignments_visa_case_id", "visa_case_assignments", ["visa_case_id"])
    op.create_index("ix_visa_case_assignments_staff_user_id", "visa_case_assignments", ["staff_user_id"])
    op.create_index("uq_visa_case_assignments_idempotency", "visa_case_assignments", ["assignment_idempotency_key"], unique=True)
    op.create_index("uq_visa_case_assignment_revoke_idempotency", "visa_case_assignments", ["revoke_idempotency_key"], unique=True, postgresql_where=sa.text("revoke_idempotency_key IS NOT NULL"), sqlite_where=sa.text("revoke_idempotency_key IS NOT NULL"))
    op.create_index("uq_visa_case_assignments_active", "visa_case_assignments", ["visa_case_id", "staff_user_id"], unique=True, postgresql_where=sa.text("revoked_at IS NULL"), sqlite_where=sa.text("revoked_at IS NULL"))

    op.add_column("visa_cases", sa.Column("contact_reason_code", sa.String(32)))
    op.add_column("visa_cases", sa.Column("contact_internal_note", sa.Text()))
    op.add_column("visa_cases", sa.Column("contact_plan_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_check_constraint(
        "ck_visa_case_contact_reason_code", "visa_cases",
        "contact_reason_code IS NULL OR contact_reason_code IN ('VISA_EXPIRY','EXTENSION','NEW_VISA','OTHER')",
    )
    op.create_check_constraint("ck_visa_case_contact_plan_version", "visa_cases", "contact_plan_version >= 0")
    op.execute(sa.text("""
        UPDATE visa_cases
        SET contact_reason_code = 'OTHER', contact_plan_version = 1
        WHERE recommended_contact_at IS NOT NULL
    """))

    op.execute(sa.text("""
        INSERT INTO staff_grants (
          user_id, role_code, granted_by_admin_id, grant_reason,
          grant_idempotency_key, granted_at
        )
        SELECT user_row.id, 'visa_manager', user_row.id,
               'migration_backfill:user.role=visa_manager',
               'migration-c5-staff-' || CAST(user_row.id AS VARCHAR), CURRENT_TIMESTAMP
        FROM users user_row
        WHERE user_row.role = 'visa_manager' AND user_row.status = 'active'
    """))
    op.execute(sa.text("""
        INSERT INTO visa_case_assignments (
          visa_case_id, staff_user_id, assigned_by_admin_id, assignment_reason,
          assignment_idempotency_key, assigned_at
        )
        SELECT visa_case.id, visa_case.assigned_admin_id, visa_case.assigned_admin_id,
               'migration_backfill:assigned_admin_id',
               'migration-c5-case-' || CAST(visa_case.id AS VARCHAR) || '-staff-' || CAST(visa_case.assigned_admin_id AS VARCHAR),
               COALESCE(visa_case.updated_at, CURRENT_TIMESTAMP)
        FROM visa_cases visa_case
    """))
    _align_runtime_owner("staff_grants", "visa_case_assignments")


def downgrade() -> None:
    op.drop_constraint("ck_visa_case_contact_plan_version", "visa_cases", type_="check")
    op.drop_constraint("ck_visa_case_contact_reason_code", "visa_cases", type_="check")
    op.drop_column("visa_cases", "contact_plan_version")
    op.drop_column("visa_cases", "contact_internal_note")
    op.drop_column("visa_cases", "contact_reason_code")
    op.drop_table("visa_case_assignments")
    op.drop_table("staff_grants")
