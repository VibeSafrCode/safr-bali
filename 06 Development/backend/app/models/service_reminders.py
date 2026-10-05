from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ServiceExpiryDelivery(Base):
    """Client-only expiry ledger; source, date and threshold identify one send."""

    __tablename__ = "service_expiry_deliveries"
    __table_args__ = (
        CheckConstraint("(visa_case_id IS NOT NULL AND life_service_id IS NULL) OR "
                        "(visa_case_id IS NULL AND life_service_id IS NOT NULL)", name="ck_service_expiry_source"),
        CheckConstraint("state IN ('PENDING','CLAIMED','DELIVERED','FAILED','UNKNOWN','SUPPRESSED')", name="ck_service_expiry_state"),
        CheckConstraint("offset_days BETWEEN 1 AND 3660", name="ck_service_expiry_offset"),
        UniqueConstraint("dedupe_key", name="uq_service_expiry_dedupe"),
        UniqueConstraint("visa_case_id", "end_date", "offset_days", "recipient_user_id", name="uq_service_expiry_visa"),
        UniqueConstraint("life_service_id", "end_date", "offset_days", "recipient_user_id", name="uq_service_expiry_life"),
        Index("ix_service_expiry_claim", "state", "due_at", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    visa_case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("visa_cases.id", ondelete="RESTRICT"))
    life_service_id: Mapped[Optional[int]] = mapped_column(ForeignKey("life_services.id", ondelete="RESTRICT"))
    recipient_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    offset_days: Mapped[int] = mapped_column(Integer, nullable=False)
    policy_version: Mapped[int] = mapped_column(Integer, nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(160), nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    lease_token: Mapped[Optional[str]] = mapped_column(String(64))
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    telegram_message_id: Mapped[Optional[str]] = mapped_column(String(64))
    error_code: Mapped[Optional[str]] = mapped_column(String(80))
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
