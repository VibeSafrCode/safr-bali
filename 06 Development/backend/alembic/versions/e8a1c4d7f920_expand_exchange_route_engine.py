"""expand exchange route engine

Revision ID: e8a1c4d7f920
Revises: d6f4a8b2c910
Create Date: 2026-08-01

Additive successor for the eight-route calculator. This revision is designed
to be applied only after the separately approved production backup/restore and
upgrade-downgrade-upgrade gates in BALI-DEC-20260801-007.
"""

from datetime import datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e8a1c4d7f920"
down_revision: Union[str, Sequence[str], None] = "d6f4a8b2c910"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _settings(**overrides: object) -> dict[str, object]:
    result: dict[str, object] = {
        "safrway_fee_percent": "0",
        "safrway_min_fee": "0",
        "safrway_min_fee_currency": None,
        "partner_fee_percent": "0",
        "partner_min_fee": "0",
        "partner_min_fee_currency": None,
        "technical_fee_percent": "0",
        "whitebird_topup_fee_percent": "0",
        "whitebird_conversion_fee_percent": "0",
        "pph_fee_percent": "0",
        "network_fee_reserve": "0",
        "fixed_withdrawal_fee": "0",
        "indodax_all_in_fee_percent": "0",
        "coinbase_spread_percent": "5",
        "cbr_spread_percent": "4.25",
        "whitebird_sell_discount_percent": "0.75",
        "whitebird_better_rate_client_share": "0.5",
        "usdt_bank_fee_threshold": "250",
        "rounding_step": "1",
        "quote_ttl_seconds": 300,
        "route_enabled": True,
        "manual_confirmation_required": True,
    }
    result.update(overrides)
    return result


ROUTE_DEFAULTS: tuple[tuple[str, dict[str, object]], ...] = (
    (
        "RUB_BANK_TO_IDR_CASH",
        _settings(
            safrway_fee_percent="5",
            safrway_min_fee="1500",
            safrway_min_fee_currency="RUB_BANK",
            partner_fee_percent="3",
            partner_min_fee="250000",
            partner_min_fee_currency="IDR_CASH",
            whitebird_topup_fee_percent="1.5",
            pph_fee_percent="0.21",
            network_fee_reserve="1",
            fixed_withdrawal_fee="10000",
            rounding_step="10000",
        ),
    ),
    (
        "RUB_BANK_TO_IDR_BANK",
        _settings(
            safrway_fee_percent="4",
            safrway_min_fee="1500",
            safrway_min_fee_currency="RUB_BANK",
            whitebird_topup_fee_percent="1.5",
            pph_fee_percent="0.21",
            network_fee_reserve="1",
            fixed_withdrawal_fee="10000",
            rounding_step="10000",
        ),
    ),
    (
        "RUB_BANK_TO_USDT",
        _settings(
            safrway_fee_percent="5",
            safrway_min_fee="1500",
            safrway_min_fee_currency="RUB_BANK",
            whitebird_topup_fee_percent="1.5",
            network_fee_reserve="1",
            rounding_step="1",
        ),
    ),
    (
        "USDT_TO_RUB_BANK",
        _settings(
            safrway_fee_percent="4",
            safrway_min_fee="1000",
            safrway_min_fee_currency="RUB_BANK",
            whitebird_conversion_fee_percent="1.5",
            rounding_step="1",
        ),
    ),
    (
        "USDT_TO_IDR_CASH",
        _settings(
            safrway_fee_percent="3",
            safrway_min_fee="150000",
            safrway_min_fee_currency="IDR_CASH",
            partner_fee_percent="3",
            partner_min_fee="250000",
            partner_min_fee_currency="IDR_CASH",
            pph_fee_percent="0.21",
            network_fee_reserve="1",
            fixed_withdrawal_fee="10000",
            rounding_step="10000",
        ),
    ),
    (
        "USDT_TO_IDR_BANK",
        _settings(
            safrway_fee_percent="4",
            safrway_min_fee="10",
            safrway_min_fee_currency="USDT",
            rounding_step="10000",
        ),
    ),
    (
        "IDR_CASH_TO_USDT",
        _settings(
            safrway_fee_percent="3",
            safrway_min_fee="100000",
            safrway_min_fee_currency="IDR_CASH",
            partner_fee_percent="2",
            partner_min_fee="150000",
            partner_min_fee_currency="IDR_CASH",
            rounding_step="1",
        ),
    ),
    (
        "IDR_CASH_TO_RUB_BANK",
        _settings(
            safrway_fee_percent="4",
            safrway_min_fee="1500",
            safrway_min_fee_currency="RUB_BANK",
            partner_fee_percent="1.5",
            partner_min_fee="150000",
            partner_min_fee_currency="IDR_CASH",
            technical_fee_percent="2.5",
            rounding_step="1",
        ),
    ),
)


def _align_runtime_owner() -> None:
    """Keep new objects accessible to the role that owns the app schema.

    Production migrations can be executed by a privileged maintenance role.
    Existing application tables are owned by the runtime database role, so a
    newly-created table must explicitly follow that ownership pattern instead
    of retaining the maintenance role as owner.
    """

    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    runtime_owner = bind.execute(
        sa.text(
            """
            SELECT tableowner
            FROM pg_catalog.pg_tables
            WHERE schemaname = current_schema()
              AND tablename = 'users'
            """
        )
    ).scalar_one_or_none()
    if runtime_owner is None:
        raise RuntimeError("Cannot determine the exchange runtime database owner")

    quoted_owner = bind.dialect.identifier_preparer.quote_identifier(
        str(runtime_owner)
    )
    op.execute(
        sa.text(
            'ALTER TABLE "exchange_route_settings_versions" '
            f"OWNER TO {quoted_owner}"
        )
    )
    op.execute(
        sa.text(
            'ALTER SEQUENCE "exchange_route_settings_versions_id_seq" '
            f"OWNER TO {quoted_owner}"
        )
    )


def upgrade() -> None:
    op.create_table(
        "exchange_route_settings_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("route_code", sa.String(length=50), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("effective_from", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "version > 0",
            name="ck_exchange_route_settings_positive_version",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "route_code",
            "version",
            name="uq_exchange_route_settings_route_version",
        ),
    )
    op.create_index(
        "ix_exchange_route_settings_versions_route_code",
        "exchange_route_settings_versions",
        ["route_code"],
    )
    op.create_index(
        "ix_exchange_route_settings_versions_is_active",
        "exchange_route_settings_versions",
        ["is_active"],
    )
    op.create_index(
        "uq_exchange_route_settings_single_active",
        "exchange_route_settings_versions",
        ["route_code"],
        unique=True,
        postgresql_where=sa.text("is_active IS TRUE"),
    )

    now = datetime.utcnow()
    route_settings_table = sa.table(
        "exchange_route_settings_versions",
        sa.column("route_code", sa.String()),
        sa.column("version", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
        sa.column("settings", sa.JSON()),
        sa.column("effective_from", sa.DateTime()),
        sa.column("created_at", sa.DateTime()),
    )
    op.bulk_insert(
        route_settings_table,
        [
            {
                "route_code": route_code,
                "version": 1,
                "is_active": True,
                "settings": settings,
                "effective_from": now,
                "created_at": now,
            }
            for route_code, settings in ROUTE_DEFAULTS
        ],
    )

    op.add_column(
        "exchange_rate_snapshots",
        sa.Column("cbr_usd_rub", sa.Numeric(24, 10), nullable=True),
    )
    op.add_column(
        "exchange_rate_snapshots",
        sa.Column("cbr_rate_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "exchange_rate_snapshots",
        sa.Column("cbr_fetched_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "exchange_rate_snapshots",
        sa.Column(
            "cbr_raw_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    op.add_column(
        "exchange_rate_snapshots",
        sa.Column("indodax_server_time", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "exchange_rate_snapshots",
        sa.Column(
            "whitebird_actual_sell_usdt_rub",
            sa.Numeric(24, 10),
            nullable=True,
        ),
    )
    op.add_column(
        "exchange_rate_snapshots",
        sa.Column("whitebird_actual_fetched_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "exchange_rate_snapshots",
        sa.Column("whitebird_actual_expires_at", sa.DateTime(), nullable=True),
    )
    op.alter_column(
        "exchange_rate_snapshots",
        "cbr_raw_json",
        server_default=None,
    )

    op.add_column(
        "exchange_quotes",
        sa.Column("route_code", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "exchange_quotes",
        sa.Column("mode", sa.String(length=10), nullable=True),
    )
    for column_name in (
        "source_amount_internal",
        "source_amount_display",
        "target_amount_internal",
        "target_amount_display",
    ):
        op.add_column(
            "exchange_quotes",
            sa.Column(column_name, sa.Numeric(32, 10), nullable=True),
        )
    op.add_column(
        "exchange_quotes",
        sa.Column("route_settings_version_id", sa.Integer(), nullable=True),
    )

    op.execute(
        sa.text(
            """
            UPDATE exchange_quotes
            SET route_code = CASE
                WHEN give_currency = 'USDT' AND receive_currency = 'IDR_CASH'
                    THEN 'USDT_TO_IDR_CASH'
                WHEN give_currency = 'USDT' AND receive_currency = 'IDR_BANK'
                    THEN 'USDT_TO_IDR_BANK'
                WHEN give_currency = 'IDR_CASH' AND receive_currency = 'RUB_BANK'
                    THEN 'IDR_CASH_TO_RUB_BANK'
                WHEN give_currency = 'RUB_BANK' AND receive_currency = 'IDR_CASH'
                    THEN 'RUB_BANK_TO_IDR_CASH'
                WHEN give_currency = 'RUB_BANK' AND receive_currency = 'IDR_BANK'
                    THEN 'RUB_BANK_TO_IDR_BANK'
                WHEN give_currency = 'RUB_BANK' AND receive_currency = 'USDT'
                    THEN 'RUB_BANK_TO_USDT'
                WHEN give_currency = 'USDT' AND receive_currency = 'RUB_BANK'
                    THEN 'USDT_TO_RUB_BANK'
                WHEN give_currency = 'IDR_CASH' AND receive_currency = 'USDT'
                    THEN 'IDR_CASH_TO_USDT'
                ELSE 'LEGACY_MANUAL'
            END,
            mode = CASE amount_side
                WHEN 'receive' THEN 'RECEIVE'
                ELSE 'GIVE'
            END,
            source_amount_internal = give_amount,
            source_amount_display = give_amount,
            target_amount_internal = receive_amount,
            target_amount_display = receive_amount
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE exchange_quotes AS quote
            SET route_settings_version_id = route_settings.id
            FROM exchange_route_settings_versions AS route_settings
            WHERE route_settings.route_code = quote.route_code
              AND route_settings.is_active IS TRUE
            """
        )
    )

    for column_name in (
        "route_code",
        "mode",
        "source_amount_internal",
        "source_amount_display",
        "target_amount_internal",
        "target_amount_display",
    ):
        op.alter_column("exchange_quotes", column_name, nullable=False)
    op.create_check_constraint(
        "ck_exchange_quotes_mode",
        "exchange_quotes",
        "mode IN ('GIVE', 'RECEIVE')",
    )
    op.create_foreign_key(
        "fk_exchange_quotes_route_settings_version",
        "exchange_quotes",
        "exchange_route_settings_versions",
        ["route_settings_version_id"],
        ["id"],
    )
    op.create_index(
        "ix_exchange_quotes_route_code",
        "exchange_quotes",
        ["route_code"],
    )
    op.create_index(
        "ix_exchange_quotes_route_settings_version_id",
        "exchange_quotes",
        ["route_settings_version_id"],
    )
    _align_runtime_owner()


def downgrade() -> None:
    op.drop_index(
        "ix_exchange_quotes_route_settings_version_id",
        table_name="exchange_quotes",
    )
    op.drop_index("ix_exchange_quotes_route_code", table_name="exchange_quotes")
    op.drop_constraint(
        "fk_exchange_quotes_route_settings_version",
        "exchange_quotes",
        type_="foreignkey",
    )
    op.drop_constraint(
        "ck_exchange_quotes_mode",
        "exchange_quotes",
        type_="check",
    )
    for column_name in (
        "route_settings_version_id",
        "target_amount_display",
        "target_amount_internal",
        "source_amount_display",
        "source_amount_internal",
        "mode",
        "route_code",
    ):
        op.drop_column("exchange_quotes", column_name)

    for column_name in (
        "whitebird_actual_expires_at",
        "whitebird_actual_fetched_at",
        "whitebird_actual_sell_usdt_rub",
        "indodax_server_time",
        "cbr_raw_json",
        "cbr_fetched_at",
        "cbr_rate_date",
        "cbr_usd_rub",
    ):
        op.drop_column("exchange_rate_snapshots", column_name)

    op.drop_index(
        "uq_exchange_route_settings_single_active",
        table_name="exchange_route_settings_versions",
    )
    op.drop_index(
        "ix_exchange_route_settings_versions_is_active",
        table_name="exchange_route_settings_versions",
    )
    op.drop_index(
        "ix_exchange_route_settings_versions_route_code",
        table_name="exchange_route_settings_versions",
    )
    op.drop_table("exchange_route_settings_versions")
