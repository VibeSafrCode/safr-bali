from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LifeService(Base):
    """Manual client services; independent of orders, payments and visa rules."""

    __tablename__ = "life_services"
    __table_args__ = (
        CheckConstraint("kind IN ('housing','bike','insurance')", name="ck_life_services_kind"),
        CheckConstraint("publication_status IN ('DRAFT','PUBLISHED','HIDDEN','ARCHIVED')", name="ck_life_services_publication"),
        CheckConstraint("price_currency IN ('IDR','USD','USDT','RUB')", name="ck_life_services_currency"),
        CheckConstraint("price_unit IN ('period','month','day','policy')", name="ck_life_services_price_unit"),
        CheckConstraint("price_amount IS NULL OR price_amount >= 0", name="ck_life_services_price_nonnegative"),
        CheckConstraint("start_date IS NULL OR end_date IS NULL OR start_date <= end_date", name="ck_life_services_date_order"),
        CheckConstraint("version > 0", name="ck_life_services_version"),
        CheckConstraint("housing_type IS NULL OR (kind = 'housing' AND housing_type IN ('guesthouse','hotel','apartment','villa'))", name="ck_life_services_housing_type"),
        CheckConstraint("quantity > 0 AND (kind = 'bike' OR quantity = 1)", name="ck_life_services_quantity"),
        CheckConstraint("rental_mode IN ('fixed','monthly') AND (kind != 'insurance' OR rental_mode = 'fixed')", name="ck_life_services_rental_mode"),
        CheckConstraint(
            "publication_status != 'PUBLISHED' OR "
            "(title IS NOT NULL AND length(trim(title)) > 0 "
            "AND (end_date IS NOT NULL OR (kind IN ('housing','bike') AND rental_mode = 'monthly')) "
            "AND (kind = 'insurance' OR start_date IS NOT NULL))",
            name="ck_life_services_publish_complete",
        ),
        UniqueConstraint("create_idempotency_key", name="uq_life_services_create_key"),
        Index("ix_life_services_client_publication", "user_id", "publication_status", "end_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    housing_type: Mapped[Optional[str]] = mapped_column(String(16))
    rental_mode: Mapped[str] = mapped_column(String(8), nullable=False, default="fixed", server_default="fixed")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    title: Mapped[Optional[str]] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text)
    link_url: Mapped[Optional[str]] = mapped_column(String(2000))
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    price_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(16, 2))
    price_currency: Mapped[str] = mapped_column(String(4), nullable=False, default="IDR")
    price_unit: Mapped[str] = mapped_column(String(8), nullable=False, default="period")
    public_contact: Mapped[Optional[str]] = mapped_column(String(1000))
    # Never include these columns in the client projection or audit details.
    owner_details: Mapped[Optional[str]] = mapped_column(Text)
    internal_note: Mapped[Optional[str]] = mapped_column(Text)
    publication_status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    updated_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    create_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    create_payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
