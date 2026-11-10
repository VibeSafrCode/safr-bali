"""Add villa feedback storage without modifying application or support rows."""

from alembic import op
import sqlalchemy as sa


revision = "c926e71a430b"
down_revision = "a42d8c7e910f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "villa_participants",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("selection", sa.String(32), nullable=False),
        sa.Column("actor", sa.String(32), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime()),
    )
    op.create_index("ix_villa_participants_selection", "villa_participants", ["selection"])
    op.create_table(
        "villa_discussions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("selection", sa.String(32), nullable=False),
        sa.Column("villa_id", sa.String(40), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("facebook", sa.String(240), nullable=False),
        sa.Column("last_seq", sa.Integer(), nullable=False),
        sa.UniqueConstraint("selection", "villa_id", name="uq_villa_discussion_ref"),
        sa.CheckConstraint("last_seq >= 0", name="ck_villa_discussion_seq"),
    )
    op.create_table(
        "villa_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("discussion_id", sa.Integer(), sa.ForeignKey("villa_discussions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("actor", sa.String(32), nullable=False),
        sa.Column("author", sa.String(50), nullable=False),
        sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("discussion_id", "seq", name="uq_villa_message_seq"),
        sa.UniqueConstraint("actor", "request_id", name="uq_villa_message_request"),
    )
    op.create_index("ix_villa_message_actor_recent", "villa_messages", ["actor", "created_at"])
    op.create_table(
        "villa_read_receipts",
        sa.Column("operator_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("villa_messages.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("read_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    raise RuntimeError("Keep villa feedback history and use a forward-compatible code rollback")
