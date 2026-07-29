"""add exchange quotes and settings

Revision ID: d6f4a8b2c910
Revises: b3f28c7a91d0
Create Date: 2026-07-29

Prepared locally for the Bali currency calculator. Apply only together with
the backend and Mini App release that consumes these tables.
"""

from datetime import datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d6f4a8b2c910"
down_revision: Union[str, Sequence[str], None] = "b3f28c7a91d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exchange_settings_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "technical_fee_percent",
            sa.Numeric(precision=8, scale=4),
            nullable=False,
        ),
        sa.Column(
            "partner_fee_percent",
            sa.Numeric(precision=8, scale=4),
            nullable=False,
        ),
        sa.Column(
            "partner_min_fee_idr",
            sa.Numeric(precision=24, scale=2),
            nullable=False,
        ),
        sa.Column(
            "safrway_fee_percent",
            sa.Numeric(precision=8, scale=4),
            nullable=False,
        ),
        sa.Column(
            "safrway_min_fee_rub",
            sa.Numeric(precision=18, scale=2),
            nullable=False,
        ),
        sa.Column(
            "usdt_idr_base_fee_percent",
            sa.Numeric(precision=8, scale=4),
            nullable=False,
        ),
        sa.Column(
            "usdt_idr_cash_extra_fee_percent",
            sa.Numeric(precision=8, scale=4),
            nullable=False,
        ),
        sa.Column(
            "usdt_idr_max_total_fee_percent",
            sa.Numeric(precision=8, scale=4),
            nullable=False,
        ),
        sa.Column(
            "whitebird_discount_percent",
            sa.Numeric(precision=8, scale=4),
            nullable=False,
        ),
        sa.Column(
            "whitebird_withdrawal_fee_percent",
            sa.Numeric(precision=8, scale=4),
            nullable=False,
        ),
        sa.Column(
            "ton_fee_buffer_usdt",
            sa.Numeric(precision=24, scale=8),
            nullable=False,
        ),
        sa.Column(
            "cash_deposit_fee_percent",
            sa.Numeric(precision=8, scale=4),
            nullable=False,
        ),
        sa.Column(
            "indonesia_interbank_fee_percent",
            sa.Numeric(precision=8, scale=4),
            nullable=False,
        ),
        sa.Column("idr_rounding_step", sa.Integer(), nullable=False),
        sa.Column("quote_ttl_seconds", sa.Integer(), nullable=False),
        sa.Column("rate_cache_ttl_seconds", sa.Integer(), nullable=False),
        sa.Column("max_stale_rate_seconds", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("effective_from", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "technical_fee_percent >= 0 AND technical_fee_percent < 100",
            name="ck_exchange_settings_technical_fee",
        ),
        sa.CheckConstraint(
            "partner_fee_percent >= 0 AND partner_fee_percent < 100",
            name="ck_exchange_settings_partner_fee",
        ),
        sa.CheckConstraint(
            "safrway_fee_percent >= 0 AND safrway_fee_percent < 100",
            name="ck_exchange_settings_safrway_fee",
        ),
        sa.CheckConstraint(
            "usdt_idr_base_fee_percent >= 0 "
            "AND usdt_idr_cash_extra_fee_percent >= 0 "
            "AND usdt_idr_max_total_fee_percent >= "
            "usdt_idr_base_fee_percent "
            "AND usdt_idr_max_total_fee_percent <= 7.5",
            name="ck_exchange_settings_usdt_idr_fee_cap",
        ),
        sa.CheckConstraint(
            "idr_rounding_step > 0 "
            "AND quote_ttl_seconds > 0 "
            "AND rate_cache_ttl_seconds > 0 "
            "AND max_stale_rate_seconds >= rate_cache_ttl_seconds",
            name="ck_exchange_settings_positive_intervals",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("version"),
    )
    op.create_index(
        "ix_exchange_settings_versions_is_active",
        "exchange_settings_versions",
        ["is_active"],
    )
    op.create_index(
        "uq_exchange_settings_single_active",
        "exchange_settings_versions",
        ["is_active"],
        unique=True,
        postgresql_where=sa.text("is_active IS TRUE"),
    )

    op.create_table(
        "exchange_rate_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "coinbase_usdt_rub",
            sa.Numeric(precision=24, scale=10),
            nullable=False,
        ),
        sa.Column(
            "indodax_sell_idr_per_usdt",
            sa.Numeric(precision=24, scale=10),
            nullable=False,
        ),
        sa.Column(
            "indodax_buy_idr_per_usdt",
            sa.Numeric(precision=24, scale=10),
            nullable=True,
        ),
        sa.Column(
            "indodax_last_idr_per_usdt",
            sa.Numeric(precision=24, scale=10),
            nullable=True,
        ),
        sa.Column(
            "estimated_whitebird_usdt_rub",
            sa.Numeric(precision=24, scale=10),
            nullable=False,
        ),
        sa.Column("coinbase_raw_json", sa.JSON(), nullable=False),
        sa.Column("indodax_raw_json", sa.JSON(), nullable=False),
        sa.Column("source_status", sa.String(length=20), nullable=False),
        sa.Column("fetched_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("error_code", sa.String(length=100), nullable=True),
        sa.CheckConstraint(
            "source_status IN ('LIVE', 'STALE', 'UNAVAILABLE', 'MANUAL')",
            name="ck_exchange_rate_snapshot_status",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exchange_rate_snapshots_source_status",
        "exchange_rate_snapshots",
        ["source_status"],
    )
    op.create_index(
        "ix_exchange_rate_snapshots_fetched_at",
        "exchange_rate_snapshots",
        ["fetched_at"],
    )

    op.create_table(
        "exchange_quotes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("give_currency", sa.String(length=30), nullable=False),
        sa.Column("receive_currency", sa.String(length=30), nullable=False),
        sa.Column("amount_side", sa.String(length=10), nullable=False),
        sa.Column(
            "requested_amount",
            sa.Numeric(precision=24, scale=8),
            nullable=False,
        ),
        sa.Column(
            "give_amount",
            sa.Numeric(precision=24, scale=8),
            nullable=False,
        ),
        sa.Column(
            "receive_amount",
            sa.Numeric(precision=24, scale=8),
            nullable=False,
        ),
        sa.Column("rate_snapshot_id", sa.Integer(), nullable=False),
        sa.Column("settings_version_id", sa.Integer(), nullable=False),
        sa.Column("rate_status", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("manual_confirmation_required", sa.Boolean(), nullable=False),
        sa.Column("settings_snapshot", sa.JSON(), nullable=False),
        sa.Column("calculation_snapshot", sa.JSON(), nullable=False),
        sa.Column("diagnostic_flags", sa.JSON(), nullable=False),
        sa.Column("calculated_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "amount_side IN ('give', 'receive')",
            name="ck_exchange_quote_amount_side",
        ),
        sa.CheckConstraint(
            "requested_amount > 0 AND give_amount > 0 AND receive_amount > 0",
            name="ck_exchange_quote_positive_amounts",
        ),
        sa.ForeignKeyConstraint(
            ["rate_snapshot_id"],
            ["exchange_rate_snapshots.id"],
        ),
        sa.ForeignKeyConstraint(
            ["settings_version_id"],
            ["exchange_settings_versions.id"],
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exchange_quotes_user_id",
        "exchange_quotes",
        ["user_id"],
    )
    op.create_index(
        "ix_exchange_quotes_rate_snapshot_id",
        "exchange_quotes",
        ["rate_snapshot_id"],
    )
    op.create_index(
        "ix_exchange_quotes_settings_version_id",
        "exchange_quotes",
        ["settings_version_id"],
    )
    op.create_index(
        "ix_exchange_quotes_status",
        "exchange_quotes",
        ["status"],
    )
    op.create_index(
        "ix_exchange_quotes_calculated_at",
        "exchange_quotes",
        ["calculated_at"],
    )
    op.create_index(
        "ix_exchange_quotes_expires_at",
        "exchange_quotes",
        ["expires_at"],
    )

    op.create_table(
        "exchange_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("quote_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["quote_id"], ["exchange_quotes.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
        sa.UniqueConstraint("quote_id"),
    )
    op.create_index(
        "ix_exchange_requests_quote_id",
        "exchange_requests",
        ["quote_id"],
        unique=True,
    )
    op.create_index(
        "ix_exchange_requests_user_id",
        "exchange_requests",
        ["user_id"],
    )
    op.create_index(
        "ix_exchange_requests_status",
        "exchange_requests",
        ["status"],
    )
    op.create_index(
        "ix_exchange_requests_created_at",
        "exchange_requests",
        ["created_at"],
    )

    now = datetime.utcnow()
    settings_table = sa.table(
        "exchange_settings_versions",
        sa.column("version", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
        sa.column("technical_fee_percent", sa.Numeric()),
        sa.column("partner_fee_percent", sa.Numeric()),
        sa.column("partner_min_fee_idr", sa.Numeric()),
        sa.column("safrway_fee_percent", sa.Numeric()),
        sa.column("safrway_min_fee_rub", sa.Numeric()),
        sa.column("usdt_idr_base_fee_percent", sa.Numeric()),
        sa.column("usdt_idr_cash_extra_fee_percent", sa.Numeric()),
        sa.column("usdt_idr_max_total_fee_percent", sa.Numeric()),
        sa.column("whitebird_discount_percent", sa.Numeric()),
        sa.column("whitebird_withdrawal_fee_percent", sa.Numeric()),
        sa.column("ton_fee_buffer_usdt", sa.Numeric()),
        sa.column("cash_deposit_fee_percent", sa.Numeric()),
        sa.column("indonesia_interbank_fee_percent", sa.Numeric()),
        sa.column("idr_rounding_step", sa.Integer()),
        sa.column("quote_ttl_seconds", sa.Integer()),
        sa.column("rate_cache_ttl_seconds", sa.Integer()),
        sa.column("max_stale_rate_seconds", sa.Integer()),
        sa.column("effective_from", sa.DateTime()),
        sa.column("created_at", sa.DateTime()),
    )
    op.bulk_insert(
        settings_table,
        [
            {
                "version": 1,
                "is_active": True,
                "technical_fee_percent": 2.5,
                "partner_fee_percent": 1.5,
                "partner_min_fee_idr": 150000,
                "safrway_fee_percent": 4,
                "safrway_min_fee_rub": 1500,
                "usdt_idr_base_fee_percent": 6,
                "usdt_idr_cash_extra_fee_percent": 1,
                "usdt_idr_max_total_fee_percent": 7.5,
                "whitebird_discount_percent": 0.75,
                "whitebird_withdrawal_fee_percent": 1.5,
                "ton_fee_buffer_usdt": 0.2,
                "cash_deposit_fee_percent": 0,
                "indonesia_interbank_fee_percent": 0,
                "idr_rounding_step": 10000,
                "quote_ttl_seconds": 300,
                "rate_cache_ttl_seconds": 60,
                "max_stale_rate_seconds": 900,
                "effective_from": now,
                "created_at": now,
            }
        ],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_exchange_requests_created_at",
        table_name="exchange_requests",
    )
    op.drop_index(
        "ix_exchange_requests_status",
        table_name="exchange_requests",
    )
    op.drop_index(
        "ix_exchange_requests_user_id",
        table_name="exchange_requests",
    )
    op.drop_index(
        "ix_exchange_requests_quote_id",
        table_name="exchange_requests",
    )
    op.drop_table("exchange_requests")

    op.drop_index("ix_exchange_quotes_expires_at", table_name="exchange_quotes")
    op.drop_index(
        "ix_exchange_quotes_calculated_at",
        table_name="exchange_quotes",
    )
    op.drop_index("ix_exchange_quotes_status", table_name="exchange_quotes")
    op.drop_index(
        "ix_exchange_quotes_settings_version_id",
        table_name="exchange_quotes",
    )
    op.drop_index(
        "ix_exchange_quotes_rate_snapshot_id",
        table_name="exchange_quotes",
    )
    op.drop_index("ix_exchange_quotes_user_id", table_name="exchange_quotes")
    op.drop_table("exchange_quotes")

    op.drop_index(
        "ix_exchange_rate_snapshots_fetched_at",
        table_name="exchange_rate_snapshots",
    )
    op.drop_index(
        "ix_exchange_rate_snapshots_source_status",
        table_name="exchange_rate_snapshots",
    )
    op.drop_table("exchange_rate_snapshots")

    op.drop_index(
        "uq_exchange_settings_single_active",
        table_name="exchange_settings_versions",
    )
    op.drop_index(
        "ix_exchange_settings_versions_is_active",
        table_name="exchange_settings_versions",
    )
    op.drop_table("exchange_settings_versions")
