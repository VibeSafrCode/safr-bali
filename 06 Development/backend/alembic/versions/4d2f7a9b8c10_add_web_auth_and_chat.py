"""add web auth and chat

Revision ID: 4d2f7a9b8c10
Revises: c3e91a7f2b44
Create Date: 2026-07-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "4d2f7a9b8c10"
down_revision: Union[str, Sequence[str], None] = "c3e91a7f2b44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "web_auth_challenges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("state_hash", sa.String(length=64), nullable=False),
        sa.Column("code_verifier", sa.String(length=128), nullable=False),
        sa.Column("nonce", sa.String(length=128), nullable=False),
        sa.Column("return_to", sa.String(length=500), nullable=False),
        sa.Column("ref_code", sa.String(length=100), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("state_hash"),
    )
    op.create_index(
        "ix_web_auth_challenges_state_hash",
        "web_auth_challenges",
        ["state_hash"],
        unique=True,
    )
    op.create_index(
        "ix_web_auth_challenges_expires_at",
        "web_auth_challenges",
        ["expires_at"],
    )

    op.create_table(
        "web_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_web_sessions_user_id", "web_sessions", ["user_id"])
    op.create_index(
        "ix_web_sessions_token_hash",
        "web_sessions",
        ["token_hash"],
        unique=True,
    )
    op.create_index("ix_web_sessions_expires_at", "web_sessions", ["expires_at"])

    op.create_table(
        "web_conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("guest_name", sa.String(length=120), nullable=True),
        sa.Column("guest_contact", sa.String(length=255), nullable=True),
        sa.Column("route_context", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            "assigned_staff_ids",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column("source", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_web_conversations_user_id",
        "web_conversations",
        ["user_id"],
    )
    op.create_index(
        "ix_web_conversations_status",
        "web_conversations",
        ["status"],
    )
    op.create_index(
        "ix_web_conversations_updated_at",
        "web_conversations",
        ["updated_at"],
    )

    op.create_table(
        "web_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("web_conversations.id"),
            nullable=False,
        ),
        sa.Column("author_type", sa.String(length=20), nullable=False),
        sa.Column("actor_telegram_id", sa.BigInteger(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("visibility", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_web_messages_conversation_id",
        "web_messages",
        ["conversation_id"],
    )
    op.create_index(
        "ix_web_messages_visibility",
        "web_messages",
        ["visibility"],
    )
    op.create_index(
        "ix_web_messages_created_at",
        "web_messages",
        ["created_at"],
    )

    op.create_table(
        "web_outbox_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("aggregate_id", sa.Integer(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_web_outbox_events_event_type",
        "web_outbox_events",
        ["event_type"],
    )
    op.create_index(
        "ix_web_outbox_events_aggregate_id",
        "web_outbox_events",
        ["aggregate_id"],
    )
    op.create_index(
        "ix_web_outbox_events_status",
        "web_outbox_events",
        ["status"],
    )
    op.create_index(
        "ix_web_outbox_events_created_at",
        "web_outbox_events",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_table("web_outbox_events")
    op.drop_table("web_messages")
    op.drop_table("web_conversations")
    op.drop_table("web_sessions")
    op.drop_table("web_auth_challenges")
