"""Add client service consent and expiry delivery ledger; disabled without policy."""
from alembic import op
import sqlalchemy as sa


revision = "b7d2e6a9c410"
down_revision = "a9c28b017d60"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("life_services", sa.Column("notifications_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table("service_expiry_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("visa_case_id", sa.Integer(), sa.ForeignKey("visa_cases.id", ondelete="RESTRICT")),
        sa.Column("life_service_id", sa.Integer(), sa.ForeignKey("life_services.id", ondelete="RESTRICT")),
        sa.Column("recipient_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("offset_days", sa.Integer(), nullable=False),
        sa.Column("policy_version", sa.Integer(), nullable=False),
        sa.Column("dedupe_key", sa.String(160), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_token", sa.String(64)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("telegram_message_id", sa.String(64)),
        sa.Column("error_code", sa.String(80)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("(visa_case_id IS NOT NULL AND life_service_id IS NULL) OR "
                           "(visa_case_id IS NULL AND life_service_id IS NOT NULL)", name="ck_service_expiry_source"),
        sa.CheckConstraint("state IN ('PENDING','CLAIMED','DELIVERED','FAILED','UNKNOWN','SUPPRESSED')", name="ck_service_expiry_state"),
        sa.CheckConstraint("offset_days BETWEEN 1 AND 3660", name="ck_service_expiry_offset"),
        sa.UniqueConstraint("dedupe_key", name="uq_service_expiry_dedupe"),
        sa.UniqueConstraint("visa_case_id", "end_date", "offset_days", "recipient_user_id", name="uq_service_expiry_visa"),
        sa.UniqueConstraint("life_service_id", "end_date", "offset_days", "recipient_user_id", name="uq_service_expiry_life"))
    op.create_index("ix_service_expiry_claim", "service_expiry_deliveries", ["state", "due_at", "id"])
    op.create_index("ix_life_services_expiry", "life_services", ["publication_status", "end_date", "id"])
    op.create_index("ix_visa_cases_expiry", "visa_cases", ["publication_status", "stay_end", "id"])
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        owner = bind.execute(sa.text("SELECT tableowner FROM pg_catalog.pg_tables "
            "WHERE schemaname=current_schema() AND tablename='users'")).scalar_one()
        quoted_owner = bind.dialect.identifier_preparer.quote_identifier(owner)
        op.execute(sa.text(f'ALTER TABLE "service_expiry_deliveries" OWNER TO {quoted_owner}'))


def downgrade():
    # An application rollback retains additive tables. Schema reversal is only
    # allowed before feature use, serialized against policy/consent/delivery writes.
    bind = op.get_bind()
    if bind.dialect.name != "postgresql" or not bind.in_transaction():
        raise RuntimeError("Pristine reminder downgrade requires a PostgreSQL transaction with exclusive locks")
    bind.execute(sa.text("LOCK TABLE service_expiry_deliveries, life_services, business_setting_versions IN ACCESS EXCLUSIVE MODE"))
    used = bind.execute(sa.text("SELECT EXISTS (SELECT 1 FROM service_expiry_deliveries) "
        "OR EXISTS (SELECT 1 FROM life_services WHERE notifications_enabled IS FALSE) "
        "OR EXISTS (SELECT 1 FROM business_setting_versions WHERE entity_type='notification' AND entity_key='service_expiry')")).scalar_one()
    if used:
        raise RuntimeError("Reminder state or history exists; keep the additive schema for application rollback")
    op.drop_index("ix_visa_cases_expiry", table_name="visa_cases")
    op.drop_index("ix_life_services_expiry", table_name="life_services")
    op.drop_table("service_expiry_deliveries")
    op.drop_column("life_services", "notifications_enabled")
