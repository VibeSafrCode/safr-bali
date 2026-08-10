"""add canonical user locale

Revision ID: b8d2e4f6a710
Revises: f2b6d9a4c731
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b8d2e4f6a710"
down_revision: Union[str, Sequence[str], None] = "f2b6d9a4c731"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("locale", sa.String(length=2), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE users
            SET locale = CASE
                WHEN lower(coalesce(language, '')) LIKE 'en%' THEN 'en'
                ELSE 'ru'
            END
            """
        )
    )
    op.alter_column(
        "users",
        "locale",
        existing_type=sa.String(length=2),
        nullable=False,
        server_default="ru",
    )
    op.create_check_constraint(
        "ck_users_locale_supported",
        "users",
        "locale IN ('ru', 'en')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_users_locale_supported",
        "users",
        type_="check",
    )
    op.drop_column("users", "locale")
