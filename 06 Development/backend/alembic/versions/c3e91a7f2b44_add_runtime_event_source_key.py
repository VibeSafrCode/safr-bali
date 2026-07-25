"""add runtime event source key

Revision ID: c3e91a7f2b44
Revises: 8c72a94d31f0
Create Date: 2026-07-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3e91a7f2b44"
down_revision: Union[str, Sequence[str], None] = "8c72a94d31f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bot_runtime_events",
        sa.Column("source_key", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ix_bot_runtime_events_source_key",
        "bot_runtime_events",
        ["source_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_bot_runtime_events_source_key", table_name="bot_runtime_events")
    op.drop_column("bot_runtime_events", "source_key")
