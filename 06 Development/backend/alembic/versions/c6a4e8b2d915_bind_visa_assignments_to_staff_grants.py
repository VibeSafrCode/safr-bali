"""bind visa assignments to the grant generation that authorized them

Revision ID: c6a4e8b2d915
Revises: c5e1a7b3d902
Create Date: 2026-08-28
"""

from typing import Optional, Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c6a4e8b2d915"
down_revision: Union[str, Sequence[str], None] = "c5e1a7b3d902"
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


def upgrade() -> None:
    op.add_column(
        "visa_case_assignments",
        sa.Column(
            "make_primary_requested",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "visa_case_assignments",
        sa.Column(
            "staff_grant_id",
            sa.Integer(),
            sa.ForeignKey("staff_grants.id", ondelete="RESTRICT"),
        ),
    )
    op.create_index(
        "ix_visa_case_assignments_staff_grant_id",
        "visa_case_assignments",
        ["staff_grant_id"],
    )
    op.execute(sa.text("""
        UPDATE visa_case_assignments assignment
        SET staff_grant_id = (
          SELECT grant_row.id
          FROM staff_grants grant_row
          WHERE grant_row.user_id = assignment.staff_user_id
            AND grant_row.revoked_at IS NULL
          ORDER BY CASE WHEN grant_row.role_code = 'visa_manager' THEN 0 ELSE 1 END,
                   grant_row.id DESC
          LIMIT 1
        )
        WHERE assignment.revoked_at IS NULL
    """))
    op.execute(sa.text("""
        UPDATE visa_case_assignments assignment
        SET make_primary_requested = TRUE
        FROM visa_cases visa_case
        WHERE visa_case.id = assignment.visa_case_id
          AND visa_case.assigned_admin_id = assignment.staff_user_id
    """))
    op.alter_column(
        "visa_case_assignments",
        "make_primary_requested",
        server_default=None,
    )
    owner = _runtime_owner()
    if owner is not None:
        op.execute(sa.text(f'ALTER TABLE "visa_case_assignments" OWNER TO {owner}'))


def downgrade() -> None:
    op.drop_index(
        "ix_visa_case_assignments_staff_grant_id",
        table_name="visa_case_assignments",
    )
    op.drop_column("visa_case_assignments", "staff_grant_id")
    op.drop_column("visa_case_assignments", "make_primary_requested")
