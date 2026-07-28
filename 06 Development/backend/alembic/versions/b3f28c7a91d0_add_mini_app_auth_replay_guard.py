"""add mini app auth replay guard

Revision ID: b3f28c7a91d0
Revises: a91b0c2d3e41
Create Date: 2026-07-28

Local B3 migration candidate. Do not apply to production before the combined
backend + React cutover review.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3f28c7a91d0"
down_revision: Union[str, Sequence[str], None] = "a91b0c2d3e41"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mini_app_sessions",
        sa.Column("init_data_hash", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_mini_app_sessions_init_data_hash",
        "mini_app_sessions",
        ["init_data_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_mini_app_sessions_init_data_hash",
        table_name="mini_app_sessions",
    )
    op.drop_column("mini_app_sessions", "init_data_hash")
