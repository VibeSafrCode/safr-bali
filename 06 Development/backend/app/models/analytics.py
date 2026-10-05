"""First-party analytics only: no CRM identity, IP, URL or arbitrary payload column."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AnalyticsPolicy(Base):
    __tablename__ = "analytics_policy"
    __table_args__ = (CheckConstraint("id = 1", name="ck_analytics_policy_singleton"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    privacy_notice_version: Mapped[Optional[str]] = mapped_column(String(64))
    allowed_content_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    allowed_service_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    allowed_campaign_codes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AnalyticsConsent(Base):
    __tablename__ = "analytics_consents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    session_key: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    policy_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"
    __table_args__ = (
        CheckConstraint("amount IS NULL OR amount >= 0", name="ck_analytics_event_amount"),
        Index("ix_analytics_events_received", "received_at", "id"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_key: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    session_key: Mapped[str] = mapped_column(String(32), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    event_name: Mapped[str] = mapped_column(String(32), nullable=False)
    content_id: Mapped[Optional[str]] = mapped_column(String(128))
    service_id: Mapped[Optional[str]] = mapped_column(String(128))
    country: Mapped[Optional[str]] = mapped_column(String(2))
    locale: Mapped[Optional[str]] = mapped_column(String(10))
    source: Mapped[Optional[str]] = mapped_column(String(16))
    campaign_code: Mapped[Optional[str]] = mapped_column(String(64))
    device: Mapped[Optional[str]] = mapped_column(String(12))
    browser: Mapped[Optional[str]] = mapped_column(String(12))
    channel: Mapped[Optional[str]] = mapped_column(String(12))
    funnel_stage: Mapped[Optional[str]] = mapped_column(String(16))
    amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2))
    currency: Mapped[Optional[str]] = mapped_column(String(4))


class AnalyticsDailyAggregate(Base):
    """No user/session identifiers. Sparse groups are suppressed in staff responses."""
    __tablename__ = "analytics_daily_aggregates"
    __table_args__ = (
        UniqueConstraint("day", "dimension_key", name="uq_analytics_daily_dimension"),
        CheckConstraint("event_count >= 0", name="ck_analytics_daily_count"),
        Index("ix_analytics_daily_day", "day"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    dimension_key: Mapped[str] = mapped_column(String(64), nullable=False)
    event_name: Mapped[str] = mapped_column(String(32), nullable=False)
    content_id: Mapped[Optional[str]] = mapped_column(String(128))
    service_id: Mapped[Optional[str]] = mapped_column(String(128))
    country: Mapped[Optional[str]] = mapped_column(String(2))
    locale: Mapped[Optional[str]] = mapped_column(String(10))
    source: Mapped[Optional[str]] = mapped_column(String(16))
    campaign_code: Mapped[Optional[str]] = mapped_column(String(64))
    device: Mapped[Optional[str]] = mapped_column(String(12))
    browser: Mapped[Optional[str]] = mapped_column(String(12))
    channel: Mapped[Optional[str]] = mapped_column(String(12))
    funnel_stage: Mapped[Optional[str]] = mapped_column(String(16))
    currency: Mapped[Optional[str]] = mapped_column(String(4))
    event_count: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_total: Mapped[Decimal] = mapped_column(Numeric(22, 2), nullable=False)


class AnalyticsAccessGrant(Base):
    """Separate analytics capability; never promotes existing CRM/admin roles."""
    __tablename__ = "analytics_access_grants"
    __table_args__ = (
        UniqueConstraint("user_id", "capability", name="uq_analytics_access_capability"),
        CheckConstraint("capability IN ('aggregate','technical_raw')", name="ck_analytics_access_capability"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    capability: Mapped[str] = mapped_column(String(24), nullable=False)
    allowed_service_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    granted_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
