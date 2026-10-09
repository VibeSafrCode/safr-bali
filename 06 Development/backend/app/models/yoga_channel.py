"""Channel-specific routing over the existing canonical web dialogue tables."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, event
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class YogaChannelBinding(Base):
    __tablename__ = "yoga_channel_bindings"
    __table_args__ = (
        UniqueConstraint("source_kind", "thread_key", name="uq_yoga_binding_source_thread"),
        CheckConstraint("bot_key = 'yoga'", name="ck_yoga_binding_bot"),
        CheckConstraint("source_kind IN ('website','telegram')", name="ck_yoga_binding_source"),
    )
    conversation_id: Mapped[int] = mapped_column(ForeignKey("web_conversations.id", ondelete="RESTRICT"), primary_key=True)
    bot_key: Mapped[str] = mapped_column(String(16), nullable=False, default="yoga")
    source_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    thread_key: Mapped[str] = mapped_column(String(80), nullable=False)
    topic: Mapped[str] = mapped_column(String(80), nullable=False)
    # Private transport identity; never put these in route_context or analytics.
    sender_telegram_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    reply_chat_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


@event.listens_for(YogaChannelBinding, "before_update")
def immutable_binding(_mapper, _connection, _target):
    raise ValueError("Yoga source binding is immutable")


class YogaInboundReceipt(Base):
    __tablename__ = "yoga_inbound_receipts"
    __table_args__ = (UniqueConstraint("bot_key", "update_key", name="uq_yoga_inbound_update"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    bot_key: Mapped[str] = mapped_column(String(16), nullable=False)
    update_key: Mapped[str] = mapped_column(String(120), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    message_id: Mapped[int] = mapped_column(ForeignKey("web_messages.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class YogaDelivery(Base):
    __tablename__ = "yoga_deliveries"
    __table_args__ = (
        UniqueConstraint("message_id", "transport_bot_key", "recipient_id", "recipient_role", name="uq_yoga_delivery_recipient"),
        CheckConstraint("transport_bot_key IN ('yoga','safrway')", name="ck_yoga_delivery_transport"),
        CheckConstraint("recipient_role IN ('staff','observer','client')", name="ck_yoga_delivery_role"),
        CheckConstraint("(transport_bot_key = 'safrway' AND recipient_role IN ('staff','observer')) OR (transport_bot_key = 'yoga' AND recipient_role IN ('observer','client'))", name="ck_yoga_delivery_role_transport"),
        CheckConstraint("status IN ('PENDING','CLAIMED','DELIVERED','RETRY','UNKNOWN','FAILED')", name="ck_yoga_delivery_status"),
        CheckConstraint("attempts >= 0 AND attempts <= 5", name="ck_yoga_delivery_attempts"),
        Index("ix_yoga_delivery_claim", "transport_bot_key", "status", "next_attempt_at", "id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("web_messages.id", ondelete="RESTRICT"), nullable=False)
    transport_bot_key: Mapped[str] = mapped_column(String(16), nullable=False)
    recipient_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    recipient_role: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    attempts: Mapped[int] = mapped_column(nullable=False, default=0)
    lease_token_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    telegram_message_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
