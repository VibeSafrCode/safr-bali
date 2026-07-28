"""add mini app sessions

Revision ID: 7f6a1c2d3e40
Revises: 4d2f7a9b8c10
Create Date: 2026-07-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "7f6a1c2d3e40"
down_revision: Union[str, Sequence[str], None] = "4d2f7a9b8c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mini_app_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("access_token_hash", sa.String(length=64), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
        sa.Column("access_expires_at", sa.DateTime(), nullable=False),
        sa.Column("refresh_expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("rotated_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("access_token_hash"),
        sa.UniqueConstraint("refresh_token_hash"),
    )
    op.create_index(
        "ix_mini_app_sessions_user_id",
        "mini_app_sessions",
        ["user_id"],
    )
    op.create_index(
        "ix_mini_app_sessions_access_token_hash",
        "mini_app_sessions",
        ["access_token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_mini_app_sessions_refresh_token_hash",
        "mini_app_sessions",
        ["refresh_token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_mini_app_sessions_access_expires_at",
        "mini_app_sessions",
        ["access_expires_at"],
    )
    op.create_index(
        "ix_mini_app_sessions_refresh_expires_at",
        "mini_app_sessions",
        ["refresh_expires_at"],
    )
    op.create_index(
        "ix_mini_app_sessions_revoked_at",
        "mini_app_sessions",
        ["revoked_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_mini_app_sessions_revoked_at",
        table_name="mini_app_sessions",
    )
    op.drop_index(
        "ix_mini_app_sessions_refresh_expires_at",
        table_name="mini_app_sessions",
    )
    op.drop_index(
        "ix_mini_app_sessions_access_expires_at",
        table_name="mini_app_sessions",
    )
    op.drop_index(
        "ix_mini_app_sessions_refresh_token_hash",
        table_name="mini_app_sessions",
    )
    op.drop_index(
        "ix_mini_app_sessions_access_token_hash",
        table_name="mini_app_sessions",
    )
    op.drop_index(
        "ix_mini_app_sessions_user_id",
        table_name="mini_app_sessions",
    )
    op.drop_table("mini_app_sessions")
