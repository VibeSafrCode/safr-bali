from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WebAuthChallenge(Base):
    __tablename__ = "web_auth_challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    state_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    code_verifier: Mapped[str] = mapped_column(String(128))
    nonce: Mapped[str] = mapped_column(String(128))
    return_to: Mapped[str] = mapped_column(String(500), default="/account")
    ref_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )


class WebSession(Base):
    __tablename__ = "web_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )


class WebConversation(Base):
    __tablename__ = "web_conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    guest_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    guest_contact: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    route_context: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    assigned_staff_ids: Mapped[list] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    source: Mapped[str] = mapped_column(String(30), default="website", nullable=False)
    status: Mapped[str] = mapped_column(
        String(30),
        default="open",
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        index=True,
    )


class WebMessage(Base):
    __tablename__ = "web_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("web_conversations.id"),
        nullable=False,
        index=True,
    )
    author_type: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_telegram_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    visibility: Mapped[str] = mapped_column(
        String(20),
        default="client",
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )


class WebOutboxEvent(Base):
    __tablename__ = "web_outbox_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    aggregate_id: Mapped[Optional[int]] = mapped_column(nullable=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
        index=True,
    )
    attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )
