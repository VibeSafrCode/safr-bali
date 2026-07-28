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

REFERRAL_POINTER_FUNCTION_SQL = """
CREATE FUNCTION safr_prevent_referral_pointer_reassignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.invited_by_user_id IS NOT NULL
       AND NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id
    THEN
        RAISE EXCEPTION
            'invited_by_user_id is immutable after attribution';
    END IF;
    RETURN NEW;
END
$$;
"""

REFERRAL_ROW_FUNCTION_SQL = """
CREATE FUNCTION safr_prevent_referral_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'referral relationships are append-only and immutable';
END
$$;
"""

POINTS_LEDGER_FUNCTION_SQL = """
CREATE FUNCTION safr_prevent_points_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'points_ledger is append-only; use a correction operation';
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
    op.execute(sa.text(REFERRAL_POINTER_FUNCTION_SQL))
    op.execute(sa.text(REFERRAL_ROW_FUNCTION_SQL))
    op.execute(sa.text(POINTS_LEDGER_FUNCTION_SQL))
    op.execute(
        sa.text(
            """
            CREATE TRIGGER trg_users_referral_pointer_immutable
            BEFORE UPDATE OF invited_by_user_id ON users
            FOR EACH ROW
            EXECUTE FUNCTION safr_prevent_referral_pointer_reassignment()
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE TRIGGER trg_referrals_immutable
            BEFORE UPDATE OR DELETE ON referrals
            FOR EACH ROW
            EXECUTE FUNCTION safr_prevent_referral_row_mutation()
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE TRIGGER trg_points_ledger_immutable
            BEFORE UPDATE OR DELETE ON points_ledger
            FOR EACH ROW
            EXECUTE FUNCTION safr_prevent_points_ledger_mutation()
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DROP TRIGGER trg_points_ledger_immutable ON points_ledger"
        )
    )
    op.execute(
        sa.text("DROP TRIGGER trg_referrals_immutable ON referrals")
    )
    op.execute(
        sa.text(
            "DROP TRIGGER trg_users_referral_pointer_immutable ON users"
        )
    )
    op.execute(sa.text("DROP FUNCTION safr_prevent_points_ledger_mutation()"))
    op.execute(sa.text("DROP FUNCTION safr_prevent_referral_row_mutation()"))
    op.execute(
        sa.text("DROP FUNCTION safr_prevent_referral_pointer_reassignment()")
    )

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
