"""add manual visa lifecycle stage 1

Revision ID: c4f7a9d2e610
Revises: b8d2e4f6a710
Create Date: 2026-08-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c4f7a9d2e610"
down_revision: Union[str, Sequence[str], None] = "b8d2e4f6a710"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _align_runtime_owner() -> None:
    """Match new objects to the canonical runtime owner of ``users``."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    runtime_owner = bind.execute(sa.text("""
        SELECT tableowner FROM pg_catalog.pg_tables
        WHERE schemaname = current_schema() AND tablename = 'users'
    """)).scalar_one_or_none()
    if runtime_owner is None:
        raise RuntimeError("Cannot determine the visa lifecycle runtime owner")
    owner = bind.dialect.identifier_preparer.quote_identifier(str(runtime_owner))
    tables = (
        "visa_types", "visa_cases", "visa_processes", "visa_events",
        "visa_notification_deliveries", "client_tags", "client_tag_assignments",
        "client_internal_notes", "visa_documents", "credential_vault_items",
    )
    for table in tables:
        op.execute(sa.text(f'ALTER TABLE "{table}" OWNER TO {owner}'))
        op.execute(sa.text(f'ALTER SEQUENCE "{table}_id_seq" OWNER TO {owner}'))


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(320)))
    op.add_column("users", sa.Column("timezone", sa.String(64)))
    op.add_column("users", sa.Column("bot_status", sa.String(20), nullable=False, server_default="unknown"))
    op.add_column("users", sa.Column("last_activity_at", sa.DateTime(timezone=True)))
    op.create_index("ix_users_email", "users", ["email"])
    op.create_table(
        "visa_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("country_code", sa.String(2), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("rules_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("rule_source_id", sa.String(255)),
        sa.Column("rule_source_url", sa.Text()),
        sa.Column("rule_verified_at", sa.DateTime(timezone=True)),
        sa.Column("effective_from", sa.Date()),
        sa.Column("rule_payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("initial_stay_days", sa.Integer()),
        sa.Column("extension_supported", sa.Boolean()),
        sa.Column("extension_days", sa.Integer()),
        sa.Column("max_extensions", sa.Integer()),
        sa.Column("activation_validity_days", sa.Integer()),
        sa.Column("tracking_supported", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("version > 0", name="ck_visa_type_version_positive"),
        sa.UniqueConstraint("country_code", "code", "version", name="uq_visa_type_version"),
    )
    op.create_index("ix_visa_types_country_code", "visa_types", ["country_code"])
    op.create_index("ix_visa_types_code", "visa_types", ["code"])

    op.create_table(
        "visa_cases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("visa_type_id", sa.Integer(), sa.ForeignKey("visa_types.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("country_code", sa.String(2), nullable=False, server_default="ID"),
        sa.Column("custom_visa_name", sa.String(160)),
        sa.Column("service_type", sa.String(32), nullable=False, server_default="APPLICATION"),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL")),
        sa.Column("assigned_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("service_status", sa.String(32), nullable=False, server_default="PURCHASED"),
        sa.Column("lifecycle_status", sa.String(32), nullable=False, server_default="NOT_ISSUED"),
        sa.Column("publication_status", sa.String(16), nullable=False, server_default="DRAFT"),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("notifications_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("external_tracking_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("requires_attention", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("attention_reason", sa.Text()),
        sa.Column("passport_envelope", sa.LargeBinary()),
        sa.Column("passport_mask", sa.String(32)),
        sa.Column("external_reference_envelope", sa.LargeBinary()),
        sa.Column("external_reference_mask", sa.String(32)),
        sa.Column("issued_on", sa.Date()),
        sa.Column("entry_deadline", sa.Date()),
        sa.Column("entered_on", sa.Date()),
        sa.Column("stay_end", sa.Date()),
        sa.Column("extension_window_start", sa.Date()),
        sa.Column("expected_stay_end", sa.Date()),
        sa.Column("extension_available", sa.Boolean()),
        sa.Column("extension_days", sa.Integer()),
        sa.Column("extensions_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_action_text", sa.Text()),
        sa.Column("next_action_due_at", sa.DateTime(timezone=True)),
        sa.Column("next_action_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("recommended_contact_at", sa.DateTime(timezone=True)),
        sa.Column("date_source", sa.Text()),
        sa.Column("dates_confirmed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("dates_confirmed_at", sa.DateTime(timezone=True)),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("service_status IN ('PURCHASED','DOCUMENTS_REQUIRED','DOCUMENTS_RECEIVED','SUBMITTED','WAITING_PAYMENT','PAID','PROCESSING','ACTION_REQUIRED','COMPLETED','CANCELLED')", name="ck_visa_case_service_status"),
        sa.CheckConstraint("lifecycle_status IN ('NOT_ISSUED','ISSUED_NOT_ACTIVATED','ACTIVE','EXPIRING','EXTENSION_PROCESSING','EXTENDED','EXPIRED','CANCELLED','REFUSED')", name="ck_visa_case_lifecycle_status"),
        sa.CheckConstraint("version > 0", name="ck_visa_case_version_positive"),
        sa.CheckConstraint("publication_status IN ('DRAFT','PUBLISHED','HIDDEN','ARCHIVED')", name="ck_visa_case_publication_status"),
    )
    for name, columns in (
        ("ix_visa_cases_user_id", ["user_id"]),
        ("ix_visa_cases_visa_type_id", ["visa_type_id"]),
        ("ix_visa_cases_order_id", ["order_id"]),
        ("ix_visa_cases_assigned_admin_id", ["assigned_admin_id"]),
        ("ix_visa_cases_attention", ["requires_attention", "updated_at"]),
        ("ix_visa_cases_publication_status", ["publication_status"]),
    ):
        op.create_index(name, "visa_cases", columns)

    op.create_table(
        "visa_processes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("visa_case_id", sa.Integer(), sa.ForeignKey("visa_cases.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("process_type", sa.String(40), nullable=False),
        sa.Column("external_status", sa.String(32), nullable=False, server_default="UNKNOWN"),
        sa.Column("raw_external_status", sa.Text()),
        sa.Column("reference_envelope", sa.LargeBinary()),
        sa.Column("reference_mask", sa.String(32)),
        sa.Column("last_error_code", sa.String(80)),
        sa.Column("tracking_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_checked_at", sa.DateTime(timezone=True)),
        sa.Column("last_changed_at", sa.DateTime(timezone=True)),
        sa.Column("consecutive_errors", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expected_completion_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("external_status IN ('UNKNOWN','WAITING_PAYMENT','PAID','SUBMITTED','PROCESSING','ACTION_REQUIRED','BIOMETRICS_REQUIRED','APPROVED','REJECTED','CANCELLED')", name="ck_visa_process_external_status"),
    )
    op.create_index("ix_visa_processes_visa_case_id", "visa_processes", ["visa_case_id"])

    op.create_table(
        "visa_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("visa_case_id", sa.Integer(), sa.ForeignKey("visa_cases.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("visa_process_id", sa.Integer(), sa.ForeignKey("visa_processes.id", ondelete="SET NULL")),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("source", sa.String(40), nullable=False),
        sa.Column("visibility", sa.String(16), nullable=False, server_default="INTERNAL"),
        sa.Column("public_title", sa.String(200)),
        sa.Column("public_description", sa.Text()),
        sa.Column("before", sa.JSON()),
        sa.Column("after", sa.JSON()),
        sa.Column("reason", sa.Text()),
        sa.Column("idempotency_key", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_visa_events_case_created", "visa_events", ["visa_case_id", "created_at"])
    op.create_index("uq_visa_events_idempotency_key", "visa_events", ["idempotency_key"], unique=True, postgresql_where=sa.text("idempotency_key IS NOT NULL"))
    op.execute(sa.text("""
        CREATE FUNCTION reject_visa_event_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'visa_events is append-only';
        END;
        $$ LANGUAGE plpgsql
    """))
    op.execute(sa.text("""
        CREATE TRIGGER trg_visa_events_append_only
        BEFORE UPDATE OR DELETE ON visa_events
        FOR EACH ROW EXECUTE FUNCTION reject_visa_event_mutation()
    """))

    op.create_table(
        "visa_notification_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("visa_case_id", sa.Integer(), sa.ForeignKey("visa_cases.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("visa_event_id", sa.Integer(), sa.ForeignKey("visa_events.id", ondelete="SET NULL")),
        sa.Column("recipient_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("recipient_kind", sa.String(16), nullable=False),
        sa.Column("locale", sa.String(2), nullable=False),
        sa.Column("notification_type", sa.String(64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("dedupe_key", sa.String(255), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String(16), nullable=False, server_default="PENDING"),
        sa.Column("lease_token", sa.String(64)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("telegram_message_id", sa.String(64)),
        sa.Column("last_error_code", sa.String(80)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("state IN ('PENDING','CLAIMED','DELIVERED','FAILED','UNKNOWN','SUPPRESSED')", name="ck_visa_notification_delivery_state"),
        sa.UniqueConstraint("dedupe_key", name="uq_visa_notification_delivery_dedupe"),
    )
    op.create_index("ix_visa_notification_deliveries_visa_case_id", "visa_notification_deliveries", ["visa_case_id"])
    op.create_index("ix_visa_delivery_claim", "visa_notification_deliveries", ["state", "next_attempt_at", "due_at"])

    op.create_table(
        "client_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False, unique=True),
        sa.Column("created_by_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "client_tag_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("tag_id", sa.Integer(), sa.ForeignKey("client_tags.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("assigned_by_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "tag_id", name="uq_client_tag_assignment"),
    )
    op.create_index("ix_client_tag_assignments_user_id", "client_tag_assignments", ["user_id"])
    op.create_table(
        "client_internal_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("visa_case_id", sa.Integer(), sa.ForeignKey("visa_cases.id", ondelete="RESTRICT")),
        sa.Column("author_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_client_internal_notes_user_id", "client_internal_notes", ["user_id"])
    op.create_index("ix_client_internal_notes_visa_case_id", "client_internal_notes", ["visa_case_id"])
    op.create_table(
        "visa_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("visa_case_id", sa.Integer(), sa.ForeignKey("visa_cases.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("document_type", sa.String(80), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("visibility", sa.String(16), nullable=False, server_default="INTERNAL"),
        sa.Column("expires_on", sa.Date()),
        sa.Column("uploaded_by_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_visa_documents_user_id", "visa_documents", ["user_id"])
    op.create_index("ix_visa_documents_visa_case_id", "visa_documents", ["visa_case_id"])
    op.create_table(
        "credential_vault_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("visa_case_id", sa.Integer(), sa.ForeignKey("visa_cases.id", ondelete="RESTRICT")),
        sa.Column("provider", sa.String(160), nullable=False),
        sa.Column("service_url", sa.Text()),
        sa.Column("login_envelope", sa.LargeBinary()),
        sa.Column("login_mask", sa.String(64)),
        sa.Column("secret_envelope", sa.LargeBinary(), nullable=False),
        sa.Column("note_envelope", sa.LargeBinary()),
        sa.Column("created_by_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("updated_by_admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_credential_vault_items_user_id", "credential_vault_items", ["user_id"])
    op.create_index("ix_credential_vault_items_visa_case_id", "credential_vault_items", ["visa_case_id"])

    # B1-first, intentionally unverified: no legal duration/date facts are seeded.
    op.execute(sa.text("""
        INSERT INTO visa_types
            (country_code, code, name, version, active, rules_verified, rule_payload, tracking_supported)
        VALUES ('ID', 'B1', 'B1', 1, true, false, '{}', false)
    """))
    op.execute(sa.text("""
        INSERT INTO visa_types
            (country_code, code, name, version, active, rules_verified, rule_payload, tracking_supported)
        VALUES ('ID', 'OTHER', 'Other Visa', 1, true, false, '{}', false)
    """))
    _align_runtime_owner()


def downgrade() -> None:
    op.drop_table("credential_vault_items")
    op.drop_table("visa_documents")
    op.drop_table("client_internal_notes")
    op.drop_table("client_tag_assignments")
    op.drop_table("client_tags")
    op.drop_table("visa_notification_deliveries")
    op.execute(sa.text("DROP TRIGGER trg_visa_events_append_only ON visa_events"))
    op.drop_table("visa_events")
    op.execute(sa.text("DROP FUNCTION reject_visa_event_mutation()"))
    op.drop_table("visa_processes")
    op.drop_table("visa_cases")
    op.drop_table("visa_types")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "last_activity_at")
    op.drop_column("users", "bot_status")
    op.drop_column("users", "timezone")
    op.drop_column("users", "email")
