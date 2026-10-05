"""Add disabled consent-bound analytics; no existing table/data changes."""
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "a7e4c9d2f105"
down_revision = "c8e3f7a1d502"
branch_labels = None
depends_on = None
TABLES = ("analytics_access_grants", "analytics_daily_aggregates", "analytics_events", "analytics_consents", "analytics_policy")


def _dimensions():
    return [sa.Column("event_name", sa.String(32), nullable=False),
            sa.Column("content_id", sa.String(128)), sa.Column("service_id", sa.String(128)),
            sa.Column("country", sa.String(2)), sa.Column("locale", sa.String(10)),
            sa.Column("source", sa.String(16)), sa.Column("campaign_code", sa.String(64)),
            sa.Column("device", sa.String(12)), sa.Column("browser", sa.String(12)),
            sa.Column("channel", sa.String(12)), sa.Column("funnel_stage", sa.String(16)), sa.Column("currency", sa.String(4))]


def upgrade():
    op.create_table("analytics_policy",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False), sa.Column("privacy_notice_version", sa.String(64)),
        sa.Column("allowed_content_ids", sa.JSON(), nullable=False), sa.Column("allowed_service_ids", sa.JSON(), nullable=False),
        sa.Column("allowed_campaign_codes", sa.JSON(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_analytics_policy_singleton"))
    op.create_table("analytics_consents",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("session_key", sa.String(32), nullable=False, unique=True), sa.Column("policy_revision", sa.Integer(), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)))
    op.create_table("analytics_events",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("event_key", sa.String(36), nullable=False, unique=True),
        sa.Column("fingerprint", sa.String(64), nullable=False), sa.Column("session_key", sa.String(32), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False), *_dimensions(),
        sa.Column("amount", sa.Numeric(18, 2)), sa.CheckConstraint("amount IS NULL OR amount >= 0", name="ck_analytics_event_amount"))
    op.create_index("ix_analytics_events_received", "analytics_events", ["received_at", "id"])
    op.create_table("analytics_daily_aggregates",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("day", sa.Date(), nullable=False),
        sa.Column("dimension_key", sa.String(64), nullable=False), *_dimensions(),
        sa.Column("event_count", sa.Integer(), nullable=False), sa.Column("amount_total", sa.Numeric(22, 2), nullable=False),
        sa.UniqueConstraint("day", "dimension_key", name="uq_analytics_daily_dimension"),
        sa.CheckConstraint("event_count >= 0", name="ck_analytics_daily_count"))
    op.create_index("ix_analytics_daily_day", "analytics_daily_aggregates", ["day"])
    op.create_table("analytics_access_grants",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("capability", sa.String(24), nullable=False), sa.Column("allowed_service_ids", sa.JSON(), nullable=False),
        sa.Column("granted_by_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False), sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("user_id", "capability", name="uq_analytics_access_capability"),
        sa.CheckConstraint("capability IN ('aggregate','technical_raw')", name="ck_analytics_access_capability"))
    table = sa.table("analytics_policy", sa.column("id", sa.Integer()), sa.column("revision", sa.Integer()),
        sa.column("enabled", sa.Boolean()), sa.column("privacy_notice_version", sa.String(64)),
        sa.column("allowed_content_ids", sa.JSON()), sa.column("allowed_service_ids", sa.JSON()),
        sa.column("allowed_campaign_codes", sa.JSON()), sa.column("updated_at", sa.DateTime(timezone=True)))
    op.bulk_insert(table, [{"id": 1, "revision": 0, "enabled": False, "privacy_notice_version": None,
                           "allowed_content_ids": [], "allowed_service_ids": [], "allowed_campaign_codes": [],
                           "updated_at": datetime.now(timezone.utc)}])
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        owner = bind.execute(sa.text("SELECT tableowner FROM pg_catalog.pg_tables "
            "WHERE schemaname=current_schema() AND tablename='users'")).scalar_one()
        quoted_owner = bind.dialect.identifier_preparer.quote_identifier(owner)
        for name in TABLES:
            op.execute(sa.text(f'ALTER TABLE "{name}" OWNER TO {quoted_owner}'))


def downgrade():
    # Application rollback leaves additive history intact. Schema reversal is
    # deliberately refused after even a consent, policy edit, grant or event.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        if not bind.in_transaction():
            raise RuntimeError("Analytics downgrade requires an exclusive transaction")
        bind.execute(sa.text("LOCK TABLE " + ", ".join(TABLES) + " IN ACCESS EXCLUSIVE MODE"))
    elif bind.dialect.name == "sqlite":
        driver = bind.connection.driver_connection
        if not driver.in_transaction:
            bind.exec_driver_sql("BEGIN EXCLUSIVE")
    else:
        raise RuntimeError("Analytics pristine downgrade database unsupported")
    for name in TABLES[:-1]:
        if bind.execute(sa.text(f"SELECT COUNT(*) FROM {name}")).scalar_one():
            raise RuntimeError("Analytics history exists; retain additive schema for rollback")
    policy = bind.execute(sa.text("SELECT revision, enabled, privacy_notice_version FROM analytics_policy WHERE id=1")).one()
    if policy.revision != 0 or policy.enabled or policy.privacy_notice_version is not None:
        raise RuntimeError("Analytics policy history exists; retain additive schema for rollback")
    for name in TABLES:
        op.drop_table(name)
