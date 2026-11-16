"""Keep the previous Mini App refresh hash for concurrent logout.

Revision ID: b4d7c19ef602
Revises: c7e4b29d1f60
"""
from alembic import op
import sqlalchemy as sa


revision = "b4d7c19ef602"
down_revision = "c7e4b29d1f60"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("mini_app_sessions", sa.Column("previous_refresh_token_hash", sa.String(64), nullable=True))
    op.create_index("ix_mini_app_sessions_previous_refresh_token_hash", "mini_app_sessions", ["previous_refresh_token_hash"])


def downgrade():
    op.drop_index("ix_mini_app_sessions_previous_refresh_token_hash", table_name="mini_app_sessions")
    op.drop_column("mini_app_sessions", "previous_refresh_token_hash")
