"""create bot runtime events

Revision ID: 8c72a94d31f0
Revises: 19acc675c3f5
Create Date: 2026-07-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8c72a94d31f0"
down_revision: Union[str, Sequence[str], None] = "19acc675c3f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bot_runtime_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("actor_telegram_id", sa.BigInteger(), nullable=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bot_runtime_events_id", "bot_runtime_events", ["id"])
    op.create_index("ix_bot_runtime_events_client_telegram_id", "bot_runtime_events", ["client_telegram_id"])
    op.create_index("ix_bot_runtime_events_actor_telegram_id", "bot_runtime_events", ["actor_telegram_id"])
    op.create_index("ix_bot_runtime_events_event_type", "bot_runtime_events", ["event_type"])
    op.create_index("ix_bot_runtime_events_created_at", "bot_runtime_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_bot_runtime_events_created_at", table_name="bot_runtime_events")
    op.drop_index("ix_bot_runtime_events_event_type", table_name="bot_runtime_events")
    op.drop_index("ix_bot_runtime_events_actor_telegram_id", table_name="bot_runtime_events")
    op.drop_index("ix_bot_runtime_events_client_telegram_id", table_name="bot_runtime_events")
    op.drop_index("ix_bot_runtime_events_id", table_name="bot_runtime_events")
    op.drop_table("bot_runtime_events")
