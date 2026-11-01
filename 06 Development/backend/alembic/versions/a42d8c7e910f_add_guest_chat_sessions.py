"""Add an isolated guest proof; preserve conversations and their history."""
from alembic import op
import sqlalchemy as sa

revision = "a42d8c7e910f"
down_revision = "f13a7c5d920b"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("guest_chat_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("origin", sa.String(255), nullable=False),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("web_conversations.id", ondelete="RESTRICT"), unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_index("ix_guest_chat_sessions_expires_at", "guest_chat_sessions", ["expires_at"])


def downgrade():
    raise RuntimeError("Guest chat history must be retained; use forward-compatible code rollback")
