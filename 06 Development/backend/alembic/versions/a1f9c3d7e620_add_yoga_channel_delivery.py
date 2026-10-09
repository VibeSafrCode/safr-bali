"""Add isolated Yoga binding and per-recipient ledger; no legacy row rewrite.

Downgrade refuses any retained channel history. Restore proof and isolated U-D-U
are required before production upgrade; this file does not authorize an apply.
"""
from alembic import op
import sqlalchemy as sa

revision = "a1f9c3d7e620"
down_revision = "f3a9d2c6b810"
branch_labels = None
depends_on = None


def _align_runtime_owner():
    """Only new objects inherit the existing canonical message-table owner."""
    connection = op.get_bind()
    if connection.dialect.name != "postgresql":
        return
    runtime_owner = connection.execute(sa.text("""
        SELECT tableowner FROM pg_catalog.pg_tables
        WHERE schemaname = current_schema() AND tablename = 'web_conversations'
    """)).scalar_one_or_none()
    if runtime_owner is None:
        raise RuntimeError("Cannot determine the Yoga channel runtime owner")
    owner = connection.dialect.identifier_preparer.quote_identifier(str(runtime_owner))
    for table in ("yoga_channel_bindings", "yoga_inbound_receipts", "yoga_deliveries"):
        op.execute(sa.text(f'ALTER TABLE "{table}" OWNER TO {owner}'))
    for table in ("yoga_inbound_receipts", "yoga_deliveries"):
        op.execute(sa.text(f'ALTER SEQUENCE "{table}_id_seq" OWNER TO {owner}'))
    op.execute(sa.text(f'ALTER FUNCTION yoga_binding_immutable() OWNER TO {owner}'))


def upgrade():
    if op.get_bind().dialect.name not in {"postgresql", "sqlite"}:
        raise RuntimeError("Yoga channel migration requires PostgreSQL or isolated SQLite")
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
        op.execute("SET LOCAL statement_timeout = '30s'")
    op.create_table("yoga_channel_bindings",
        sa.Column("conversation_id", sa.Integer, sa.ForeignKey("web_conversations.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("bot_key", sa.String(16), nullable=False), sa.Column("source_kind", sa.String(16), nullable=False),
        sa.Column("thread_key", sa.String(80), nullable=False), sa.Column("topic", sa.String(80), nullable=False),
        sa.Column("sender_telegram_id", sa.BigInteger), sa.Column("reply_chat_id", sa.BigInteger),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("source_kind", "thread_key", name="uq_yoga_binding_source_thread"),
        sa.CheckConstraint("bot_key = 'yoga'", name="ck_yoga_binding_bot"),
        sa.CheckConstraint("source_kind IN ('website','telegram')", name="ck_yoga_binding_source"))
    op.create_table("yoga_inbound_receipts",
        sa.Column("id", sa.Integer, primary_key=True), sa.Column("bot_key", sa.String(16), nullable=False),
        sa.Column("update_key", sa.String(120), nullable=False), sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("message_id", sa.Integer, sa.ForeignKey("web_messages.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("bot_key", "update_key", name="uq_yoga_inbound_update"))
    op.create_table("yoga_deliveries",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("message_id", sa.Integer, sa.ForeignKey("web_messages.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("transport_bot_key", sa.String(16), nullable=False), sa.Column("recipient_id", sa.BigInteger, nullable=False),
        sa.Column("recipient_role", sa.String(16), nullable=False), sa.Column("status", sa.String(16), nullable=False),
        sa.Column("attempts", sa.Integer, nullable=False), sa.Column("lease_token_hash", sa.String(64)),
        sa.Column("lease_expires_at", sa.DateTime), sa.Column("next_attempt_at", sa.DateTime, nullable=False),
        sa.Column("error_code", sa.String(64)), sa.Column("telegram_message_id", sa.BigInteger),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("message_id", "transport_bot_key", "recipient_id", "recipient_role", name="uq_yoga_delivery_recipient"),
        sa.CheckConstraint("transport_bot_key IN ('yoga','safrway')", name="ck_yoga_delivery_transport"),
        sa.CheckConstraint("recipient_role IN ('staff','observer','client')", name="ck_yoga_delivery_role"),
        sa.CheckConstraint("(transport_bot_key = 'safrway' AND recipient_role IN ('staff','observer')) OR (transport_bot_key = 'yoga' AND recipient_role IN ('observer','client'))", name="ck_yoga_delivery_role_transport"),
        sa.CheckConstraint("status IN ('PENDING','CLAIMED','DELIVERED','RETRY','UNKNOWN','FAILED')", name="ck_yoga_delivery_status"),
        sa.CheckConstraint("attempts >= 0 AND attempts <= 5", name="ck_yoga_delivery_attempts"))
    op.create_index("ix_yoga_delivery_claim", "yoga_deliveries", ["transport_bot_key", "status", "next_attempt_at", "id"])
    # Source identity must remain immutable even if another ORM/SQL adapter is
    # introduced later. History deletion is not a runtime/API operation either.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION yoga_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Yoga source binding is immutable'; END; $$""")
        op.execute("CREATE TRIGGER yoga_binding_immutable BEFORE UPDATE OR DELETE ON yoga_channel_bindings FOR EACH ROW EXECUTE FUNCTION yoga_binding_immutable()")
    elif op.get_bind().dialect.name == "sqlite":
        for operation in ("UPDATE", "DELETE"):
            op.execute(f"CREATE TRIGGER yoga_binding_immutable_{operation.lower()} BEFORE {operation} ON yoga_channel_bindings BEGIN SELECT RAISE(ABORT,'Yoga source binding is immutable'); END")
    _align_runtime_owner()


def downgrade():
    connection = op.get_bind()
    if connection.dialect.name not in {"postgresql", "sqlite"}:
        raise RuntimeError("Yoga channel migration requires PostgreSQL or isolated SQLite")
    if connection.dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
        op.execute("LOCK TABLE yoga_channel_bindings, yoga_inbound_receipts, yoga_deliveries IN ACCESS EXCLUSIVE MODE")
    for table in ("yoga_channel_bindings", "yoga_inbound_receipts", "yoga_deliveries"):
        if connection.execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM {table})")).scalar():
            raise RuntimeError("Yoga channel history exists; retain additive schema for rollback")
    op.drop_table("yoga_deliveries")
    op.drop_table("yoga_inbound_receipts")
    op.drop_table("yoga_channel_bindings")
    if connection.dialect.name == "postgresql":
        op.execute("DROP FUNCTION yoga_binding_immutable()")
