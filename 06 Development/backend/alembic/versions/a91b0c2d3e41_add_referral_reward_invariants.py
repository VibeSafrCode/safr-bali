"""add referral and reward invariants

Revision ID: a91b0c2d3e41
Revises: 7f6a1c2d3e40
Create Date: 2026-07-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a91b0c2d3e41"
down_revision: Union[str, Sequence[str], None] = "7f6a1c2d3e40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


REFERRAL_PREFLIGHT_SQL = """
DO $$
BEGIN
    IF EXISTS (
        SELECT child_user_id
        FROM referrals
        GROUP BY child_user_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'B0 preflight failed: duplicate referral rows for one child';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM referrals
        WHERE parent_user_id = child_user_id
    ) THEN
        RAISE EXCEPTION
            'B0 preflight failed: self-referral rows exist';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM users AS users_row
        WHERE (
            users_row.invited_by_user_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1
                FROM referrals AS referral_row
                WHERE referral_row.child_user_id = users_row.id
                  AND referral_row.parent_user_id =
                      users_row.invited_by_user_id
            )
        )
        OR (
            users_row.invited_by_user_id IS NULL
            AND EXISTS (
                SELECT 1
                FROM referrals AS referral_row
                WHERE referral_row.child_user_id = users_row.id
            )
        )
    ) THEN
        RAISE EXCEPTION
            'B0 preflight failed: users and referrals disagree';
    END IF;

    IF EXISTS (
        SELECT order_id
        FROM points_ledger
        WHERE order_id IS NOT NULL
          AND operation_type = 'referral_accrual'
        GROUP BY order_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'B0 preflight failed: duplicate referral reward rows';
    END IF;
END
$$;
"""


def upgrade() -> None:
    op.execute(sa.text(REFERRAL_PREFLIGHT_SQL))

    op.create_unique_constraint(
        "uq_referrals_child_user_id",
        "referrals",
        ["child_user_id"],
    )
    op.create_check_constraint(
        "ck_referrals_parent_not_child",
        "referrals",
        "parent_user_id <> child_user_id",
    )

    op.add_column(
        "points_ledger",
        sa.Column("reward_rule_snapshot", sa.JSON(), nullable=True),
    )
    op.add_column(
        "points_ledger",
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "uq_points_ledger_idempotency_key",
        "points_ledger",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )
    op.create_index(
        "uq_points_ledger_referral_order_once",
        "points_ledger",
        ["order_id"],
        unique=True,
        postgresql_where=sa.text(
            "order_id IS NOT NULL "
            "AND operation_type = 'referral_accrual'"
        ),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_points_ledger_referral_order_once",
        table_name="points_ledger",
    )
    op.drop_index(
        "uq_points_ledger_idempotency_key",
        table_name="points_ledger",
    )
    op.drop_column("points_ledger", "idempotency_key")
    op.drop_column("points_ledger", "reward_rule_snapshot")

    op.drop_constraint(
        "ck_referrals_parent_not_child",
        "referrals",
        type_="check",
    )
    op.drop_constraint(
        "uq_referrals_child_user_id",
        "referrals",
        type_="unique",
    )
