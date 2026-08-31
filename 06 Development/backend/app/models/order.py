from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            "(pricing_mode = 'LEGACY' AND commercial_price_snapshot_id IS NULL) OR "
            "(pricing_mode = 'CANONICAL' AND commercial_price_snapshot_id IS NOT NULL)",
            name="ck_orders_pricing_snapshot_mode",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), nullable=False, index=True)

    status: Mapped[str] = mapped_column(String(50), default="new", nullable=False)
    client_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    admin_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    amount_usd: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    commercial_price_snapshot_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("commercial_price_snapshots.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    pricing_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="LEGACY")
    create_idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    create_payload_hash: Mapped[Optional[str]] = mapped_column(String(64))
    payment_status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)

    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
