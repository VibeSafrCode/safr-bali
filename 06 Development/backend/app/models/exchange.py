from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ExchangeSettingsVersion(Base):
    __tablename__ = "exchange_settings_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        index=True,
    )
    technical_fee_percent: Mapped[Decimal] = mapped_column(
        Numeric(8, 4),
        nullable=False,
    )
    partner_fee_percent: Mapped[Decimal] = mapped_column(
        Numeric(8, 4),
        nullable=False,
    )
    partner_min_fee_idr: Mapped[Decimal] = mapped_column(
        Numeric(24, 2),
        nullable=False,
    )
    safrway_fee_percent: Mapped[Decimal] = mapped_column(
        Numeric(8, 4),
        nullable=False,
    )
    safrway_min_fee_rub: Mapped[Decimal] = mapped_column(
        Numeric(18, 2),
        nullable=False,
    )
    usdt_idr_base_fee_percent: Mapped[Decimal] = mapped_column(
        Numeric(8, 4),
        nullable=False,
    )
    usdt_idr_cash_extra_fee_percent: Mapped[Decimal] = mapped_column(
        Numeric(8, 4),
        nullable=False,
    )
    usdt_idr_max_total_fee_percent: Mapped[Decimal] = mapped_column(
        Numeric(8, 4),
        nullable=False,
    )
    whitebird_discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(8, 4),
        nullable=False,
    )
    whitebird_withdrawal_fee_percent: Mapped[Decimal] = mapped_column(
        Numeric(8, 4),
        nullable=False,
    )
    ton_fee_buffer_usdt: Mapped[Decimal] = mapped_column(
        Numeric(24, 8),
        nullable=False,
    )
    cash_deposit_fee_percent: Mapped[Decimal] = mapped_column(
        Numeric(8, 4),
        nullable=False,
    )
    indonesia_interbank_fee_percent: Mapped[Decimal] = mapped_column(
        Numeric(8, 4),
        nullable=False,
    )
    idr_rounding_step: Mapped[int] = mapped_column(Integer, nullable=False)
    quote_ttl_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    rate_cache_ttl_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    max_stale_rate_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    effective_from: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )


class ExchangeRateSnapshot(Base):
    __tablename__ = "exchange_rate_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    coinbase_usdt_rub: Mapped[Decimal] = mapped_column(
        Numeric(24, 10),
        nullable=False,
    )
    indodax_sell_idr_per_usdt: Mapped[Decimal] = mapped_column(
        Numeric(24, 10),
        nullable=False,
    )
    indodax_buy_idr_per_usdt: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(24, 10),
        nullable=True,
    )
    indodax_last_idr_per_usdt: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(24, 10),
        nullable=True,
    )
    estimated_whitebird_usdt_rub: Mapped[Decimal] = mapped_column(
        Numeric(24, 10),
        nullable=False,
    )
    coinbase_raw_json: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    indodax_raw_json: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    source_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    error_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class ExchangeQuote(Base):
    __tablename__ = "exchange_quotes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    give_currency: Mapped[str] = mapped_column(String(30), nullable=False)
    receive_currency: Mapped[str] = mapped_column(String(30), nullable=False)
    amount_side: Mapped[str] = mapped_column(String(10), nullable=False)
    requested_amount: Mapped[Decimal] = mapped_column(
        Numeric(24, 8),
        nullable=False,
    )
    give_amount: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    receive_amount: Mapped[Decimal] = mapped_column(
        Numeric(24, 8),
        nullable=False,
    )
    rate_snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("exchange_rate_snapshots.id"),
        nullable=False,
        index=True,
    )
    settings_version_id: Mapped[int] = mapped_column(
        ForeignKey("exchange_settings_versions.id"),
        nullable=False,
        index=True,
    )
    rate_status: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(
        String(40),
        default="PRELIMINARY",
        nullable=False,
        index=True,
    )
    manual_confirmation_required: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    settings_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    calculation_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    diagnostic_flags: Mapped[list] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    calculated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        index=True,
    )


class ExchangeRequest(Base):
    __tablename__ = "exchange_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    quote_id: Mapped[str] = mapped_column(
        ForeignKey("exchange_quotes.id"),
        unique=True,
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    idempotency_key: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(40),
        default="AWAITING_OPERATOR",
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )
