"""Add disabled onboarding state and durable per-message delivery ledger."""
from pathlib import Path
import sqlalchemy as sa
from alembic import op

revision = "a9c28b017d60"
down_revision = "f2c8a4d6e901"
branch_labels = None
depends_on = None


def _initial_draft():
    source = Path(__file__).resolve().parents[2] / "app" / "data"
    return {"welcome_text": (source / "onboarding_welcome.ru.txt").read_text(),
        "followup_text": (source / "onboarding_followup.ru.txt").read_text().rstrip("\n")}


def upgrade():
    op.create_table("onboarding_state", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False), sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("activation_cutoff", sa.DateTime(timezone=True)), sa.Column("published_version", sa.Integer()),
        sa.Column("draft", sa.JSON(), nullable=False))
    op.create_table("onboarding_versions", sa.Column("version", sa.Integer(), primary_key=True),
        sa.Column("content", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("restored_from_version", sa.Integer()))
    op.create_table("onboarding_enrollments", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, unique=True),
        sa.Column("registration_event", sa.String(120), nullable=False, unique=True),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("activation_cutoff", sa.DateTime(timezone=True), nullable=False),
        sa.Column("content_version", sa.Integer(), sa.ForeignKey("onboarding_versions.version", ondelete="RESTRICT")),
        sa.Column("help_requested_at", sa.DateTime(timezone=True)))
    op.create_table("onboarding_deliveries", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("enrollment_id", sa.Integer(), sa.ForeignKey("onboarding_enrollments.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("step", sa.String(32), nullable=False), sa.Column("telegram_id", sa.String(32), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False), sa.Column("state", sa.String(16), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False), sa.Column("lease_token", sa.String(64)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)), sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("telegram_message_id", sa.String(64)), sa.Column("error_code", sa.String(80)),
        sa.UniqueConstraint("enrollment_id", "step", "telegram_id", name="uq_onboarding_delivery"))
    op.create_index("ix_onboarding_deliveries_due_at", "onboarding_deliveries", ["due_at"])
    op.create_index("ix_onboarding_deliveries_state", "onboarding_deliveries", ["state"])
    table = sa.table("onboarding_state", sa.column("id", sa.Integer()), sa.column("revision", sa.Integer()),
        sa.column("enabled", sa.Boolean()), sa.column("draft", sa.JSON()))
    op.bulk_insert(table, [{"id": 1, "revision": 0, "enabled": False, "draft": _initial_draft()}])


def downgrade():
    # Production rollback keeps this additive schema. Only a pristine test/install
    # may be reversed, under one transaction preventing concurrent registrations.
    bind = op.get_bind()
    if bind.dialect.name != "postgresql" or not bind.in_transaction():
        raise RuntimeError("Pristine onboarding downgrade requires a PostgreSQL transaction with exclusive locks")
    bind.execute(sa.text("LOCK TABLE onboarding_state, onboarding_versions, onboarding_enrollments, "
        "onboarding_deliveries IN ACCESS EXCLUSIVE MODE"))
    rows = bind.execute(sa.text("SELECT * FROM onboarding_state")).mappings().all()
    pristine = (len(rows) == 1 and rows[0]["id"] == 1 and rows[0]["revision"] == 0
        and rows[0]["enabled"] is False and rows[0]["activation_cutoff"] is None
        and rows[0]["published_version"] is None and rows[0]["draft"] == _initial_draft())
    for table in ("onboarding_versions", "onboarding_enrollments", "onboarding_deliveries"):
        pristine = pristine and bind.execute(sa.text(f"SELECT NOT EXISTS (SELECT 1 FROM {table})")).scalar()
    if not pristine:
        raise RuntimeError("Onboarding has state or history; downgrade refused. Keep the additive schema for application rollback.")
    for table in ("onboarding_deliveries", "onboarding_enrollments", "onboarding_versions", "onboarding_state"):
        op.drop_table(table)
