from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    BigInteger,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FxMarketSnapshot(Base):
    """Immutable accepted USDT/IDR market observation.

    The ask is the canonical conversion input for published IDR prices.  Bid and
    last are retained for audit and for the exchange calculator, but never
    silently substituted for the ask.
    """

    __tablename__ = "fx_market_snapshots"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_fx_market_snapshot_version_positive"),
        CheckConstraint("ask_idr_per_usdt > 0", name="ck_fx_market_snapshot_ask_positive"),
        CheckConstraint(
            "source_status IN ('LIVE','MANUAL')",
            name="ck_fx_market_snapshot_source_status",
        ),
        CheckConstraint(
            "(is_manual_override IS FALSE AND override_expires_at IS NULL) OR "
            "(is_manual_override IS TRUE AND override_expires_at IS NOT NULL)",
            name="ck_fx_market_snapshot_override_shape",
        ),
        CheckConstraint(
            "fresh_until <= stale_until",
            name="ck_fx_market_snapshot_fresh_before_stale",
        ),
        CheckConstraint(
            "bid_idr_per_usdt IS NULL OR bid_idr_per_usdt < best_ask_idr_per_usdt",
            name="ck_fx_market_snapshot_book_not_crossed",
        ),
        Index("ix_fx_market_snapshots_fresh_until", "fresh_until"),
        Index("ix_fx_market_snapshots_stale_until", "stale_until"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    source_code: Mapped[str] = mapped_column(String(64), nullable=False)
    pair_id: Mapped[str] = mapped_column(String(32), nullable=False)
    ask_idr_per_usdt: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    best_ask_idr_per_usdt: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    bid_idr_per_usdt: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10))
    last_idr_per_usdt: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10))
    provider_server_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fresh_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stale_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_status: Mapped[str] = mapped_column(String(16), nullable=False)
    accepted_notional_usdt: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    acceptance_method: Mapped[str] = mapped_column(String(64), nullable=False)
    change_bps_from_previous: Mapped[Optional[int]] = mapped_column(Integer)
    is_manual_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    override_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    payload_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    operation_key: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    source_reference: Mapped[str] = mapped_column(Text, nullable=False)
    raw_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_by_admin_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    reason: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class PriceCatalogVersion(Base):
    """Immutable authored price catalog.  IDR is always the published truth."""

    __tablename__ = "price_catalog_versions"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_price_catalog_version_positive"),
        CheckConstraint("currency = 'IDR'", name="ck_price_catalog_currency_idr"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="IDR")
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by_admin_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    restored_from_version_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("price_catalog_versions.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class PriceCatalogItem(Base):
    __tablename__ = "price_catalog_items"
    __table_args__ = (
        UniqueConstraint(
            "catalog_version_id",
            "sku",
            name="uq_price_catalog_item_identity",
        ),
        CheckConstraint(
            "entity_type IN ('VISA','SERVICE')",
            name="ck_price_catalog_item_entity_type",
        ),
        CheckConstraint(
            "price_qualifier IN ('EXACT','FROM','VARIABLE','CONTACT')",
            name="ck_price_catalog_item_qualifier",
        ),
        CheckConstraint(
            "fee_verification_status IN ('VERIFIED','NEEDS_VERIFICATION')",
            name="ck_price_catalog_item_fee_status",
        ),
        CheckConstraint(
            "(price_qualifier IN ('EXACT','FROM') AND amount_idr IS NOT NULL AND amount_idr > 0) OR "
            "(price_qualifier IN ('VARIABLE','CONTACT') AND amount_idr IS NULL)",
            name="ck_price_catalog_item_amount_shape",
        ),
        CheckConstraint(
            "show_price IS FALSE OR (price_qualifier IN ('EXACT','FROM') "
            "AND amount_idr IS NOT NULL AND fee_verification_status = 'VERIFIED')",
            name="ck_price_catalog_item_visible_verified",
        ),
        Index("ix_price_catalog_items_entity", "entity_type", "entity_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    catalog_version_id: Mapped[int] = mapped_column(
        ForeignKey("price_catalog_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sku: Mapped[str] = mapped_column(String(200), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_key: Mapped[str] = mapped_column(String(160), nullable=False)
    option_code: Mapped[str] = mapped_column(String(160), nullable=False)
    label_ru: Mapped[str] = mapped_column(String(255), nullable=False)
    label_en: Mapped[str] = mapped_column(String(255), nullable=False)
    price_qualifier: Mapped[str] = mapped_column(String(16), nullable=False)
    amount_idr: Mapped[Optional[int]] = mapped_column(BigInteger)
    show_price: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    fee_verification_status: Mapped[str] = mapped_column(String(32), nullable=False)
    fee_note_ru: Mapped[Optional[str]] = mapped_column(Text)
    fee_note_en: Mapped[Optional[str]] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class CatalogPublication(Base):
    """Append-only atomic pointer to one catalog and one FX version."""

    __tablename__ = "catalog_publications"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_catalog_publication_version_positive"),
        Index("ix_catalog_publications_published_at", "published_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    catalog_version_id: Mapped[int] = mapped_column(
        ForeignKey("price_catalog_versions.id", ondelete="RESTRICT"), nullable=False
    )
    fx_snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("fx_market_snapshots.id", ondelete="RESTRICT"), nullable=False
    )
    published_by_admin_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class CatalogPublicationPointer(Base):
    """Singleton mutable pointer; referenced projections remain append-only."""

    __tablename__ = "catalog_publication_pointer"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_catalog_publication_pointer_singleton"),
        CheckConstraint("lock_version > 0", name="ck_catalog_publication_pointer_lock_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    publication_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_publications.id", ondelete="RESTRICT"), nullable=False, unique=True
    )
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class CommercialPriceSnapshot(Base):
    """Immutable amount frozen for an order or case at creation/assignment."""

    __tablename__ = "commercial_price_snapshots"
    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('VISA','SERVICE')",
            name="ck_commercial_price_entity_type",
        ),
        CheckConstraint(
            "price_qualifier IN ('EXACT','FROM','VARIABLE','CONTACT')",
            name="ck_commercial_price_qualifier",
        ),
        CheckConstraint(
            "(price_qualifier IN ('EXACT','FROM') AND amount_idr IS NOT NULL AND amount_idr > 0 "
            "AND fx_ask_idr_per_usdt > 0 AND display_usdt IS NOT NULL) OR "
            "(price_qualifier IN ('VARIABLE','CONTACT') AND amount_idr IS NULL "
            "AND display_usdt IS NULL)",
            name="ck_commercial_price_amount_shape",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    publication_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_publications.id", ondelete="RESTRICT"), nullable=False
    )
    catalog_version_id: Mapped[int] = mapped_column(
        ForeignKey("price_catalog_versions.id", ondelete="RESTRICT"), nullable=False
    )
    fx_snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("fx_market_snapshots.id", ondelete="RESTRICT"), nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_key: Mapped[str] = mapped_column(String(160), nullable=False)
    option_code: Mapped[str] = mapped_column(String(160), nullable=False)
    sku: Mapped[str] = mapped_column(String(200), nullable=False)
    price_qualifier: Mapped[str] = mapped_column(String(16), nullable=False)
    amount_idr: Mapped[Optional[int]] = mapped_column(BigInteger)
    fx_ask_idr_per_usdt: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10))
    display_usdt: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 2))
    formula_code: Mapped[str] = mapped_column(String(64), nullable=False)
    fee_verification_status: Mapped[str] = mapped_column(String(32), nullable=False)
    fee_note_ru: Mapped[Optional[str]] = mapped_column(Text)
    fee_note_en: Mapped[Optional[str]] = mapped_column(Text)
    display_idr: Mapped[str] = mapped_column(String(64), nullable=False)
    display_usdt_text: Mapped[Optional[str]] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
