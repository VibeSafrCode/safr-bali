"""Add manual housing, bike and insurance records without altering existing data.

Revision ID: e9b3d7a5c201
Revises: d7a2f9c4e816
Create Date: 2026-09-22
"""

import sqlalchemy as sa
from alembic import op


revision = "e9b3d7a5c201"
down_revision = "d7a2f9c4e816"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "life_services",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("link_url", sa.String(2000), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("price_amount", sa.Numeric(16, 2), nullable=True),
        sa.Column("price_currency", sa.String(4), nullable=False),
        sa.Column("price_unit", sa.String(8), nullable=False),
        sa.Column("public_contact", sa.String(1000), nullable=True),
        sa.Column("owner_details", sa.Text(), nullable=True),
        sa.Column("internal_note", sa.Text(), nullable=True),
        sa.Column("publication_status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by_admin_id", sa.Integer(), nullable=False),
        sa.Column("updated_by_admin_id", sa.Integer(), nullable=False),
        sa.Column("create_idempotency_key", sa.String(128), nullable=False),
        sa.Column("create_payload_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_admin_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["updated_by_admin_id"], ["users.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("create_idempotency_key", name="uq_life_services_create_key"),
        sa.CheckConstraint("kind IN ('housing','bike','insurance')", name="ck_life_services_kind"),
        sa.CheckConstraint("publication_status IN ('DRAFT','PUBLISHED','HIDDEN','ARCHIVED')", name="ck_life_services_publication"),
        sa.CheckConstraint("price_currency IN ('IDR','USD','USDT','RUB')", name="ck_life_services_currency"),
        sa.CheckConstraint("price_unit IN ('period','month','day','policy')", name="ck_life_services_price_unit"),
        sa.CheckConstraint("price_amount IS NULL OR price_amount >= 0", name="ck_life_services_price_nonnegative"),
        sa.CheckConstraint("start_date IS NULL OR end_date IS NULL OR start_date <= end_date", name="ck_life_services_date_order"),
        sa.CheckConstraint("version > 0", name="ck_life_services_version"),
        sa.CheckConstraint(
            "publication_status != 'PUBLISHED' OR "
            "(title IS NOT NULL AND length(trim(title)) > 0 AND end_date IS NOT NULL "
            "AND (kind = 'insurance' OR start_date IS NOT NULL))",
            name="ck_life_services_publish_complete",
        ),
    )
    op.create_index("ix_life_services_client_publication", "life_services", ["user_id", "publication_status", "end_date"])
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        owner = bind.execute(sa.text(
            "SELECT tableowner FROM pg_catalog.pg_tables "
            "WHERE schemaname = current_schema() AND tablename = 'users'"
        )).scalar_one()
        quoted_owner = bind.dialect.identifier_preparer.quote_identifier(owner)
        op.execute(sa.text(f'ALTER TABLE "life_services" OWNER TO {quoted_owner}'))


def downgrade() -> None:
    # Downgrade is destructive only to this feature's table. Back up new records
    # before a deliberate schema rollback; an application rollback can keep it.
    op.drop_index("ix_life_services_client_publication", table_name="life_services")
    op.drop_table("life_services")
