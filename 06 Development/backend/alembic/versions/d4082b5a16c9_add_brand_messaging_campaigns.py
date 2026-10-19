"""Separate bot contact identities and reviewed announcement audiences.

Additive production rollback keeps tables/history. It does not send or enable.
"""
import sqlalchemy as sa
from alembic import op

revision = "d4082b5a16c9"
down_revision = "b6a1d3f0e214"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    constraints = sa.inspect(bind).get_unique_constraints("onboarding_enrollments")
    previous = [row for row in constraints if row["column_names"] == ["user_id"]]
    if len(previous) != 1 or not previous[0]["name"]:
        raise RuntimeError("Expected canonical onboarding user uniqueness is missing")
    if bind.execute(sa.text("SELECT count(*) FROM onboarding_state WHERE id=2")).scalar_one():
        raise RuntimeError("Yoga onboarding state is already occupied")
    op.add_column("onboarding_state", sa.Column("transport_not_before", sa.DateTime(timezone=True)))
    op.add_column("onboarding_deliveries", sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("onboarding_versions", sa.Column("bot_key", sa.String(16), nullable=False, server_default="safrway"))
    op.create_index("ix_onboarding_versions_bot_key", "onboarding_versions", ["bot_key"])
    for column in (sa.Column("bot_key", sa.String(16), nullable=False, server_default="safrway"),
                   sa.Column("locale", sa.String(2), nullable=False, server_default="ru"),
                   sa.Column("origin", sa.String(24), nullable=False, server_default="registration"),
                   sa.Column("followup_enabled", sa.Boolean(), nullable=False, server_default=sa.true())):
        op.add_column("onboarding_enrollments", column)
    op.drop_constraint(previous[0]["name"], "onboarding_enrollments", type_="unique")
    op.create_unique_constraint("uq_onboarding_user_bot", "onboarding_enrollments", ["user_id", "bot_key"])
    op.create_index("ix_onboarding_enrollments_bot_key", "onboarding_enrollments", ["bot_key"])
    op.execute(sa.text("INSERT INTO onboarding_state(id,revision,enabled,draft) VALUES (2,0,false,'{\"locales\":{\"ru\":{\"welcome_text\":\"\",\"followup_text\":\"\"},\"en\":{\"welcome_text\":\"\",\"followup_text\":\"\"}}}')"))
    op.create_table("bot_contacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("bot_key", sa.String(16), nullable=False), sa.Column("locale", sa.String(2), nullable=False),
        sa.Column("status", sa.String(16), nullable=False), sa.Column("source", sa.String(32), nullable=False),
        sa.Column("first_contact_at", sa.DateTime(timezone=True)), sa.Column("last_contact_at", sa.DateTime(timezone=True)),
        sa.Column("last_event", sa.String(160), nullable=False), sa.Column("announcements_opted_out", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("user_id", "bot_key", name="uq_bot_contact_user_bot"),
        sa.CheckConstraint("bot_key IN ('safrway','yoga')", name="ck_bot_contact_brand"),
        sa.CheckConstraint("status IN ('active','blocked','unknown')", name="ck_bot_contact_status"))
    op.create_index("ix_bot_contacts_user_id", "bot_contacts", ["user_id"])
    op.create_index("ix_bot_contacts_bot_key", "bot_contacts", ["bot_key"])
    op.create_table("bot_campaigns",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("bot_key", sa.String(16), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False), sa.Column("title", sa.String(200), nullable=False),
        sa.Column("state", sa.String(16), nullable=False), sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("audience", sa.JSON(), nullable=False), sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("content_version", sa.Integer(), sa.ForeignKey("onboarding_versions.version", ondelete="RESTRICT")),
        sa.Column("followup_enabled", sa.Boolean(), nullable=False), sa.Column("snapshot_sha256", sa.String(64)),
        sa.Column("confirmation_key", sa.String(100), unique=True), sa.Column("confirmation_revision", sa.Integer()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("confirmed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("bot_key IN ('safrway','yoga')", name="ck_bot_campaign_brand"),
        sa.CheckConstraint("kind IN ('announcement','welcome_backfill')", name="ck_bot_campaign_kind"),
        sa.CheckConstraint("state IN ('DRAFT','PREVIEW','QUEUED','CANCELLED','COMPLETE')", name="ck_bot_campaign_state"))
    op.create_index("ix_bot_campaigns_bot_key", "bot_campaigns", ["bot_key"])
    op.create_table("bot_campaign_recipients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("bot_campaigns.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("contact_id", sa.Integer(), sa.ForeignKey("bot_contacts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("locale", sa.String(2), nullable=False), sa.Column("state", sa.String(16), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("enrollment_id", sa.Integer(), sa.ForeignKey("onboarding_enrollments.id", ondelete="RESTRICT")),
        sa.Column("due_at", sa.DateTime(timezone=True)), sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("lease_token", sa.String(64)), sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("telegram_message_id", sa.String(64)), sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("error_code", sa.String(80)), sa.UniqueConstraint("campaign_id", "user_id", name="uq_bot_campaign_recipient"))
    op.create_index("ix_bot_campaign_recipients_campaign_id", "bot_campaign_recipients", ["campaign_id"])
    op.create_index("ix_bot_campaign_recipients_state", "bot_campaign_recipients", ["state"])
    op.execute(sa.text("""
        CREATE FUNCTION safr_guard_onboarding_version() RETURNS trigger LANGUAGE plpgsql
        SET search_path = public, pg_temp AS $$
        BEGIN RAISE EXCEPTION 'published onboarding versions are immutable'; END $$
    """))
    op.execute(sa.text("CREATE TRIGGER onboarding_versions_immutable BEFORE UPDATE OR DELETE ON onboarding_versions "
                       "FOR EACH ROW EXECUTE FUNCTION safr_guard_onboarding_version()"))


def downgrade():
    raise RuntimeError("Keep additive messaging schema and history when rolling back application code")
