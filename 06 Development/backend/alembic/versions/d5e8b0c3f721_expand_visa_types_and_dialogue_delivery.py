"""expand canonical visa types and dialogue delivery idempotency

Revision ID: d5e8b0c3f721
Revises: c4f7a9d2e610
Create Date: 2026-08-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d5e8b0c3f721"
down_revision: Union[str, Sequence[str], None] = "c4f7a9d2e610"
branch_labels = None
depends_on = None


CANONICAL_TYPES = (
    ("E33G", "ITAS E33G для удалённых работников"),
    ("D12", "Виза D12"),
    ("D1/D2", "Мультивизы D1/D2"),
    ("C1", "Виза C1"),
    ("VOA", "eVOA / B1 для короткой поездки"),
)


def upgrade() -> None:
    op.add_column("web_messages", sa.Column("idempotency_key", sa.String(255)))
    op.create_index("ix_web_messages_idempotency_key", "web_messages", ["idempotency_key"], unique=True)
    op.add_column("web_outbox_events", sa.Column("dedupe_key", sa.String(255)))
    op.create_index("ix_web_outbox_events_dedupe_key", "web_outbox_events", ["dedupe_key"], unique=True)
    bind = op.get_bind()
    for code, name in CANONICAL_TYPES:
        bind.execute(sa.text("""
            INSERT INTO visa_types
                (country_code, code, name, version, active, rules_verified, rule_payload, tracking_supported)
            SELECT 'ID', CAST(:code AS VARCHAR(32)), CAST(:name AS VARCHAR(160)),
                   1, true, false, '{}', false
            WHERE NOT EXISTS (
                SELECT 1 FROM visa_types
                WHERE country_code = 'ID'
                  AND code = CAST(:code AS VARCHAR(32))
                  AND version = 1
            )
        """), {"code": code, "name": name})


def downgrade() -> None:
    bind = op.get_bind()
    for code, _name in CANONICAL_TYPES:
        bind.execute(sa.text("""
            DELETE FROM visa_types
            WHERE country_code = 'ID'
              AND code = CAST(:code AS VARCHAR(32))
              AND version = 1
              AND NOT EXISTS (SELECT 1 FROM visa_cases WHERE visa_type_id = visa_types.id)
        """), {"code": code})
    op.drop_index("ix_web_outbox_events_dedupe_key", table_name="web_outbox_events")
    op.drop_column("web_outbox_events", "dedupe_key")
    op.drop_index("ix_web_messages_idempotency_key", table_name="web_messages")
    op.drop_column("web_messages", "idempotency_key")
