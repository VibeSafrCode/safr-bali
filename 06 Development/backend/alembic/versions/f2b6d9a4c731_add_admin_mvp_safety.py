"""add admin mvp safety fields

Revision ID: f2b6d9a4c731
Revises: e8a1c4d7f920
Create Date: 2026-08-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f2b6d9a4c731"
down_revision: Union[str, Sequence[str], None] = "e8a1c4d7f920"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "referrals",
        sa.Column("attribution_reason", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "admin_actions",
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "admin_actions",
        sa.Column("details", sa.JSON(), nullable=True),
    )
    op.create_index(
        "uq_admin_actions_idempotency_key",
        "admin_actions",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )
    op.create_index("ix_users_created_at", "users", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_created_at", table_name="users")
    op.drop_index("uq_admin_actions_idempotency_key", table_name="admin_actions")
    op.drop_column("admin_actions", "details")
    op.drop_column("admin_actions", "idempotency_key")
    op.drop_column("referrals", "attribution_reason")
