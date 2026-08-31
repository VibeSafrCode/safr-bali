"""add versioned price catalog, authoritative fx and commercial snapshots

Revision ID: d7a2f9c4e816
Revises: c6a4e8b2d915
Create Date: 2026-08-31
"""

from typing import Optional, Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d7a2f9c4e816"
down_revision: Union[str, Sequence[str], None] = "c6a4e8b2d915"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _runtime_owner() -> Optional[str]:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return None
    owner = bind.execute(sa.text("""
        SELECT tableowner FROM pg_catalog.pg_tables
        WHERE schemaname = current_schema() AND tablename = 'users'
    """)).scalar_one_or_none()
    if owner is None:
        raise RuntimeError("Cannot determine canonical runtime owner")
    return bind.dialect.identifier_preparer.quote_identifier(str(owner))


def _assign_owner(table_names: Sequence[str]) -> None:
    owner = _runtime_owner()
    if owner is None:
        return
    for table_name in table_names:
        op.execute(sa.text(f'ALTER TABLE "{table_name}" OWNER TO {owner}'))


def _create_immutable_guards(table_names: Sequence[str]) -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(sa.text("""
        CREATE FUNCTION safr_reject_pricing_history_mutation()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'SAFR pricing history is append-only: %', TG_TABLE_NAME;
        END;
        $$
    """))
    for table_name in table_names:
        op.execute(sa.text(
            f'CREATE TRIGGER "trg_{table_name}_immutable" '
            f'BEFORE UPDATE OR DELETE ON "{table_name}" '
            "FOR EACH ROW EXECUTE FUNCTION safr_reject_pricing_history_mutation()"
        ))


def upgrade() -> None:
    op.create_table(
        "fx_market_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("source_code", sa.String(length=64), nullable=False),
        sa.Column("pair_id", sa.String(length=32), nullable=False),
        sa.Column("ask_idr_per_usdt", sa.Numeric(24, 10), nullable=False),
        sa.Column("best_ask_idr_per_usdt", sa.Numeric(24, 10), nullable=False),
        sa.Column("bid_idr_per_usdt", sa.Numeric(24, 10), nullable=True),
        sa.Column("last_idr_per_usdt", sa.Numeric(24, 10), nullable=True),
        sa.Column("provider_server_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fresh_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stale_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_status", sa.String(length=16), nullable=False),
        sa.Column("accepted_notional_usdt", sa.Numeric(24, 8), nullable=False),
        sa.Column("acceptance_method", sa.String(length=64), nullable=False),
        sa.Column("change_bps_from_previous", sa.Integer(), nullable=True),
        sa.Column("is_manual_override", sa.Boolean(), nullable=False),
        sa.Column("override_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("operation_key", sa.String(length=255), nullable=True),
        sa.Column("source_reference", sa.Text(), nullable=False),
        sa.Column("raw_payload", sa.JSON(), nullable=False),
        sa.Column("created_by_admin_id", sa.Integer(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version > 0", name="ck_fx_market_snapshot_version_positive"),
        sa.CheckConstraint("ask_idr_per_usdt > 0", name="ck_fx_market_snapshot_ask_positive"),
        sa.CheckConstraint("source_status IN ('LIVE','MANUAL')", name="ck_fx_market_snapshot_source_status"),
        sa.CheckConstraint(
            "(is_manual_override IS FALSE AND override_expires_at IS NULL) OR "
            "(is_manual_override IS TRUE AND override_expires_at IS NOT NULL)",
            name="ck_fx_market_snapshot_override_shape",
        ),
        sa.CheckConstraint("fresh_until <= stale_until", name="ck_fx_market_snapshot_fresh_before_stale"),
        sa.CheckConstraint(
            "bid_idr_per_usdt IS NULL OR bid_idr_per_usdt < best_ask_idr_per_usdt",
            name="ck_fx_market_snapshot_book_not_crossed",
        ),
        sa.ForeignKeyConstraint(["created_by_admin_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payload_hash"),
        sa.UniqueConstraint("operation_key"),
        sa.UniqueConstraint("version"),
    )
    op.create_index("ix_fx_market_snapshots_fresh_until", "fx_market_snapshots", ["fresh_until"])
    op.create_index("ix_fx_market_snapshots_stale_until", "fx_market_snapshots", ["stale_until"])

    op.create_table(
        "price_catalog_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_admin_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("restored_from_version_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version > 0", name="ck_price_catalog_version_positive"),
        sa.CheckConstraint("currency = 'IDR'", name="ck_price_catalog_currency_idr"),
        sa.ForeignKeyConstraint(["created_by_admin_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["restored_from_version_id"], ["price_catalog_versions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
        sa.UniqueConstraint("version"),
    )

    op.create_table(
        "price_catalog_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("catalog_version_id", sa.Integer(), nullable=False),
        sa.Column("sku", sa.String(length=200), nullable=False),
        sa.Column("entity_type", sa.String(length=16), nullable=False),
        sa.Column("entity_key", sa.String(length=160), nullable=False),
        sa.Column("option_code", sa.String(length=160), nullable=False),
        sa.Column("label_ru", sa.String(length=255), nullable=False),
        sa.Column("label_en", sa.String(length=255), nullable=False),
        sa.Column("price_qualifier", sa.String(length=16), nullable=False),
        sa.Column("amount_idr", sa.BigInteger(), nullable=True),
        sa.Column("show_price", sa.Boolean(), nullable=False),
        sa.Column("fee_verification_status", sa.String(length=32), nullable=False),
        sa.Column("fee_note_ru", sa.Text(), nullable=True),
        sa.Column("fee_note_en", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.CheckConstraint("entity_type IN ('VISA','SERVICE')", name="ck_price_catalog_item_entity_type"),
        sa.CheckConstraint("price_qualifier IN ('EXACT','FROM','VARIABLE','CONTACT')", name="ck_price_catalog_item_qualifier"),
        sa.CheckConstraint("fee_verification_status IN ('VERIFIED','NEEDS_VERIFICATION')", name="ck_price_catalog_item_fee_status"),
        sa.CheckConstraint(
            "(price_qualifier IN ('EXACT','FROM') AND amount_idr IS NOT NULL AND amount_idr > 0) OR "
            "(price_qualifier IN ('VARIABLE','CONTACT') AND amount_idr IS NULL)",
            name="ck_price_catalog_item_amount_shape",
        ),
        sa.CheckConstraint(
            "show_price IS FALSE OR (price_qualifier IN ('EXACT','FROM') "
            "AND amount_idr IS NOT NULL AND fee_verification_status = 'VERIFIED')",
            name="ck_price_catalog_item_visible_verified",
        ),
        sa.ForeignKeyConstraint(["catalog_version_id"], ["price_catalog_versions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "catalog_version_id", "sku",
            name="uq_price_catalog_item_identity",
        ),
    )
    op.create_index("ix_price_catalog_items_catalog_version_id", "price_catalog_items", ["catalog_version_id"])
    op.create_index("ix_price_catalog_items_entity", "price_catalog_items", ["entity_type", "entity_key"])

    op.create_table(
        "catalog_publications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("catalog_version_id", sa.Integer(), nullable=False),
        sa.Column("fx_snapshot_id", sa.Integer(), nullable=False),
        sa.Column("published_by_admin_id", sa.Integer(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version > 0", name="ck_catalog_publication_version_positive"),
        sa.ForeignKeyConstraint(["catalog_version_id"], ["price_catalog_versions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["fx_snapshot_id"], ["fx_market_snapshots.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["published_by_admin_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
        sa.UniqueConstraint("version"),
    )
    op.create_index("ix_catalog_publications_published_at", "catalog_publications", ["published_at"])

    op.create_table(
        "catalog_publication_pointer",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("publication_id", sa.Integer(), nullable=False),
        sa.Column("lock_version", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_catalog_publication_pointer_singleton"),
        sa.CheckConstraint("lock_version > 0", name="ck_catalog_publication_pointer_lock_positive"),
        sa.ForeignKeyConstraint(["publication_id"], ["catalog_publications.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("publication_id"),
    )

    op.create_table(
        "commercial_price_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("publication_id", sa.Integer(), nullable=False),
        sa.Column("catalog_version_id", sa.Integer(), nullable=False),
        sa.Column("fx_snapshot_id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=16), nullable=False),
        sa.Column("entity_key", sa.String(length=160), nullable=False),
        sa.Column("option_code", sa.String(length=160), nullable=False),
        sa.Column("sku", sa.String(length=200), nullable=False),
        sa.Column("price_qualifier", sa.String(length=16), nullable=False),
        sa.Column("amount_idr", sa.BigInteger(), nullable=True),
        sa.Column("fx_ask_idr_per_usdt", sa.Numeric(24, 10), nullable=True),
        sa.Column("display_usdt", sa.Numeric(24, 2), nullable=True),
        sa.Column("formula_code", sa.String(length=64), nullable=False),
        sa.Column("fee_verification_status", sa.String(length=32), nullable=False),
        sa.Column("fee_note_ru", sa.Text(), nullable=True),
        sa.Column("fee_note_en", sa.Text(), nullable=True),
        sa.Column("display_idr", sa.String(length=64), nullable=False),
        sa.Column("display_usdt_text", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("entity_type IN ('VISA','SERVICE')", name="ck_commercial_price_entity_type"),
        sa.CheckConstraint("price_qualifier IN ('EXACT','FROM','VARIABLE','CONTACT')", name="ck_commercial_price_qualifier"),
        sa.CheckConstraint(
            "(price_qualifier IN ('EXACT','FROM') AND amount_idr IS NOT NULL AND amount_idr > 0 "
            "AND fx_ask_idr_per_usdt > 0 AND display_usdt IS NOT NULL) OR "
            "(price_qualifier IN ('VARIABLE','CONTACT') AND amount_idr IS NULL "
            "AND display_usdt IS NULL)",
            name="ck_commercial_price_amount_shape",
        ),
        sa.ForeignKeyConstraint(["catalog_version_id"], ["price_catalog_versions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["fx_snapshot_id"], ["fx_market_snapshots.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["publication_id"], ["catalog_publications.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column("exchange_rate_snapshots", sa.Column("market_fx_snapshot_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_exchange_rate_snapshots_market_fx_snapshot",
        "exchange_rate_snapshots", "fx_market_snapshots",
        ["market_fx_snapshot_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_index("ix_exchange_rate_snapshots_market_fx_snapshot_id", "exchange_rate_snapshots", ["market_fx_snapshot_id"])

    op.add_column("orders", sa.Column("commercial_price_snapshot_id", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("pricing_mode", sa.String(length=16), nullable=False, server_default="LEGACY"))
    op.add_column("orders", sa.Column("create_idempotency_key", sa.String(length=255), nullable=True))
    op.add_column("orders", sa.Column("create_payload_hash", sa.String(length=64), nullable=True))
    op.create_foreign_key(
        "fk_orders_commercial_price_snapshot",
        "orders", "commercial_price_snapshots",
        ["commercial_price_snapshot_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_index("ix_orders_commercial_price_snapshot_id", "orders", ["commercial_price_snapshot_id"])
    op.create_unique_constraint("uq_orders_create_idempotency_key", "orders", ["create_idempotency_key"])
    op.create_check_constraint(
        "ck_orders_pricing_snapshot_mode",
        "orders",
        "(pricing_mode = 'LEGACY' AND commercial_price_snapshot_id IS NULL) OR "
        "(pricing_mode = 'CANONICAL' AND commercial_price_snapshot_id IS NOT NULL)",
    )

    op.add_column("visa_cases", sa.Column("commercial_price_snapshot_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_visa_cases_commercial_price_snapshot",
        "visa_cases", "commercial_price_snapshots",
        ["commercial_price_snapshot_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_index("ix_visa_cases_commercial_price_snapshot_id", "visa_cases", ["commercial_price_snapshot_id"])

    _assign_owner(
        (
            "fx_market_snapshots",
            "price_catalog_versions",
            "price_catalog_items",
            "catalog_publications",
            "catalog_publication_pointer",
            "commercial_price_snapshots",
        )
    )
    _create_immutable_guards(
        (
            "fx_market_snapshots",
            "price_catalog_versions",
            "price_catalog_items",
            "catalog_publications",
            "commercial_price_snapshots",
        )
    )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for table_name in (
            "fx_market_snapshots",
            "price_catalog_versions",
            "price_catalog_items",
            "catalog_publications",
            "commercial_price_snapshots",
        ):
            op.execute(sa.text(
                f'DROP TRIGGER IF EXISTS "trg_{table_name}_immutable" ON "{table_name}"'
            ))
        op.execute(sa.text("DROP FUNCTION IF EXISTS safr_reject_pricing_history_mutation()"))
    op.drop_index("ix_visa_cases_commercial_price_snapshot_id", table_name="visa_cases")
    op.drop_constraint("fk_visa_cases_commercial_price_snapshot", "visa_cases", type_="foreignkey")
    op.drop_column("visa_cases", "commercial_price_snapshot_id")

    op.drop_index("ix_orders_commercial_price_snapshot_id", table_name="orders")
    op.drop_constraint("ck_orders_pricing_snapshot_mode", "orders", type_="check")
    op.drop_constraint("uq_orders_create_idempotency_key", "orders", type_="unique")
    op.drop_constraint("fk_orders_commercial_price_snapshot", "orders", type_="foreignkey")
    op.drop_column("orders", "commercial_price_snapshot_id")
    op.drop_column("orders", "create_payload_hash")
    op.drop_column("orders", "create_idempotency_key")
    op.drop_column("orders", "pricing_mode")

    op.drop_index("ix_exchange_rate_snapshots_market_fx_snapshot_id", table_name="exchange_rate_snapshots")
    op.drop_constraint("fk_exchange_rate_snapshots_market_fx_snapshot", "exchange_rate_snapshots", type_="foreignkey")
    op.drop_column("exchange_rate_snapshots", "market_fx_snapshot_id")

    op.drop_index("ix_catalog_publications_published_at", table_name="catalog_publications")
    op.drop_table("commercial_price_snapshots")
    op.drop_table("catalog_publication_pointer")
    op.drop_table("catalog_publications")
    op.drop_index("ix_price_catalog_items_entity", table_name="price_catalog_items")
    op.drop_index("ix_price_catalog_items_catalog_version_id", table_name="price_catalog_items")
    op.drop_table("price_catalog_items")
    op.drop_table("price_catalog_versions")
    op.drop_index("ix_fx_market_snapshots_stale_until", table_name="fx_market_snapshots")
    op.drop_index("ix_fx_market_snapshots_fresh_until", table_name="fx_market_snapshots")
    op.drop_table("fx_market_snapshots")
