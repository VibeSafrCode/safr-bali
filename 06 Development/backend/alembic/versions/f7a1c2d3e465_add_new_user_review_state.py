"""add reversible admin review state for new users

Revision ID: f7a1c2d3e465
Revises: d5e8b0c3f721
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f7a1c2d3e465"
down_revision: Union[str, Sequence[str], None] = "d5e8b0c3f721"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("admin_new_user_reviewed_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("admin_new_user_reviewed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")))
    op.create_index("ix_users_admin_new_user_reviewed_at", "users", ["admin_new_user_reviewed_at"])
    op.add_column("visa_documents", sa.Column("upload_idempotency_key", sa.String(255)))
    op.add_column("visa_documents", sa.Column("checksum_sha256", sa.String(64)))
    op.add_column("visa_documents", sa.Column("mime_type", sa.String(120)))
    op.add_column("visa_documents", sa.Column("size_bytes", sa.Integer()))
    op.add_column("visa_documents", sa.Column("archived_at", sa.DateTime(timezone=True)))
    op.create_unique_constraint("uq_visa_documents_upload_idempotency", "visa_documents", ["upload_idempotency_key"])


def downgrade() -> None:
    op.drop_constraint("uq_visa_documents_upload_idempotency", "visa_documents", type_="unique")
    op.drop_column("visa_documents", "archived_at")
    op.drop_column("visa_documents", "size_bytes")
    op.drop_column("visa_documents", "mime_type")
    op.drop_column("visa_documents", "checksum_sha256")
    op.drop_column("visa_documents", "upload_idempotency_key")
    op.drop_index("ix_users_admin_new_user_reviewed_at", table_name="users")
    op.drop_column("users", "admin_new_user_reviewed_by")
    op.drop_column("users", "admin_new_user_reviewed_at")
