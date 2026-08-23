from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VisaType(Base):
    __tablename__ = "visa_types"
    __table_args__ = (
        UniqueConstraint("country_code", "code", "version", name="uq_visa_type_version"),
        CheckConstraint("version > 0", name="ck_visa_type_version_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rules_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rule_source_id: Mapped[Optional[str]] = mapped_column(String(255))
    rule_source_url: Mapped[Optional[str]] = mapped_column(Text)
    rule_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    effective_from: Mapped[Optional[date]] = mapped_column(Date)
    rule_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    initial_stay_days: Mapped[Optional[int]] = mapped_column(Integer)
    extension_supported: Mapped[Optional[bool]] = mapped_column(Boolean)
    extension_days: Mapped[Optional[int]] = mapped_column(Integer)
    max_extensions: Mapped[Optional[int]] = mapped_column(Integer)
    activation_validity_days: Mapped[Optional[int]] = mapped_column(Integer)
    tracking_supported: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class VisaCase(Base):
    __tablename__ = "visa_cases"
    __table_args__ = (
        CheckConstraint(
            "service_status IN ('PURCHASED','DOCUMENTS_REQUIRED','DOCUMENTS_RECEIVED','SUBMITTED','WAITING_PAYMENT','PAID','PROCESSING','ACTION_REQUIRED','COMPLETED','CANCELLED')",
            name="ck_visa_case_service_status",
        ),
        CheckConstraint(
            "lifecycle_status IN ('NOT_ISSUED','ISSUED_NOT_ACTIVATED','ACTIVE','EXPIRING','EXTENSION_PROCESSING','EXTENDED','EXPIRED','CANCELLED','REFUSED')",
            name="ck_visa_case_lifecycle_status",
        ),
        CheckConstraint("version > 0", name="ck_visa_case_version_positive"),
        CheckConstraint(
            "publication_status IN ('DRAFT','PUBLISHED','HIDDEN','ARCHIVED')",
            name="ck_visa_case_publication_status",
        ),
        Index("ix_visa_cases_attention", "requires_attention", "updated_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    visa_type_id: Mapped[int] = mapped_column(ForeignKey("visa_types.id", ondelete="RESTRICT"), nullable=False, index=True)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False, default="ID")
    custom_visa_name: Mapped[Optional[str]] = mapped_column(String(160))
    service_type: Mapped[str] = mapped_column(String(32), nullable=False, default="APPLICATION")
    order_id: Mapped[Optional[int]] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    assigned_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    service_status: Mapped[str] = mapped_column(String(32), nullable=False, default="PURCHASED")
    lifecycle_status: Mapped[str] = mapped_column(String(32), nullable=False, default="NOT_ISSUED")
    publication_status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT", index=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    external_tracking_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    requires_attention: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    attention_reason: Mapped[Optional[str]] = mapped_column(Text)
    passport_envelope: Mapped[Optional[bytes]] = mapped_column(LargeBinary)
    passport_mask: Mapped[Optional[str]] = mapped_column(String(32))
    external_reference_envelope: Mapped[Optional[bytes]] = mapped_column(LargeBinary)
    external_reference_mask: Mapped[Optional[str]] = mapped_column(String(32))
    issued_on: Mapped[Optional[date]] = mapped_column(Date)
    entry_deadline: Mapped[Optional[date]] = mapped_column(Date)
    entered_on: Mapped[Optional[date]] = mapped_column(Date)
    stay_end: Mapped[Optional[date]] = mapped_column(Date)
    extension_window_start: Mapped[Optional[date]] = mapped_column(Date)
    expected_stay_end: Mapped[Optional[date]] = mapped_column(Date)
    extension_available: Mapped[Optional[bool]] = mapped_column(Boolean)
    extension_days: Mapped[Optional[int]] = mapped_column(Integer)
    extensions_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_action_text: Mapped[Optional[str]] = mapped_column(Text)
    next_action_due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    next_action_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    recommended_contact_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    date_source: Mapped[Optional[str]] = mapped_column(Text)
    dates_confirmed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    dates_confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class VisaProcess(Base):
    __tablename__ = "visa_processes"
    __table_args__ = (
        CheckConstraint(
            "external_status IN ('UNKNOWN','WAITING_PAYMENT','PAID','SUBMITTED','PROCESSING','ACTION_REQUIRED','BIOMETRICS_REQUIRED','APPROVED','REJECTED','CANCELLED')",
            name="ck_visa_process_external_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    visa_case_id: Mapped[int] = mapped_column(ForeignKey("visa_cases.id", ondelete="RESTRICT"), nullable=False, index=True)
    process_type: Mapped[str] = mapped_column(String(40), nullable=False)
    external_status: Mapped[str] = mapped_column(String(32), nullable=False, default="UNKNOWN")
    raw_external_status: Mapped[Optional[str]] = mapped_column(Text)
    reference_envelope: Mapped[Optional[bytes]] = mapped_column(LargeBinary)
    reference_mask: Mapped[Optional[str]] = mapped_column(String(32))
    last_error_code: Mapped[Optional[str]] = mapped_column(String(80))
    tracking_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    consecutive_errors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expected_completion_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class VisaEvent(Base):
    __tablename__ = "visa_events"
    __table_args__ = (
        Index(
            "uq_visa_events_idempotency_key",
            "idempotency_key",
            unique=True,
            postgresql_where=text("idempotency_key IS NOT NULL"),
            sqlite_where=text("idempotency_key IS NOT NULL"),
        ),
        Index("ix_visa_events_case_created", "visa_case_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    visa_case_id: Mapped[int] = mapped_column(ForeignKey("visa_cases.id", ondelete="RESTRICT"), nullable=False)
    visa_process_id: Mapped[Optional[int]] = mapped_column(ForeignKey("visa_processes.id", ondelete="SET NULL"))
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    visibility: Mapped[str] = mapped_column(String(16), nullable=False, default="INTERNAL")
    public_title: Mapped[Optional[str]] = mapped_column(String(200))
    public_description: Mapped[Optional[str]] = mapped_column(Text)
    before: Mapped[Optional[dict]] = mapped_column(JSON)
    after: Mapped[Optional[dict]] = mapped_column(JSON)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class VisaNotificationDelivery(Base):
    __tablename__ = "visa_notification_deliveries"
    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_visa_notification_delivery_dedupe"),
        CheckConstraint(
            "state IN ('PENDING','CLAIMED','DELIVERED','FAILED','UNKNOWN','SUPPRESSED')",
            name="ck_visa_notification_delivery_state",
        ),
        Index("ix_visa_delivery_claim", "state", "next_attempt_at", "due_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    visa_case_id: Mapped[int] = mapped_column(ForeignKey("visa_cases.id", ondelete="RESTRICT"), nullable=False, index=True)
    visa_event_id: Mapped[Optional[int]] = mapped_column(ForeignKey("visa_events.id", ondelete="SET NULL"))
    recipient_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    recipient_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    locale: Mapped[str] = mapped_column(String(2), nullable=False)
    notification_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    dedupe_key: Mapped[str] = mapped_column(String(255), nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    lease_token: Mapped[Optional[str]] = mapped_column(String(64))
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    telegram_message_id: Mapped[Optional[str]] = mapped_column(String(64))
    last_error_code: Mapped[Optional[str]] = mapped_column(String(80))
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class ClientTag(Base):
    __tablename__ = "client_tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    created_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class ClientTagAssignment(Base):
    __tablename__ = "client_tag_assignments"
    __table_args__ = (UniqueConstraint("user_id", "tag_id", name="uq_client_tag_assignment"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("client_tags.id", ondelete="RESTRICT"), nullable=False)
    assigned_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class ClientInternalNote(Base):
    __tablename__ = "client_internal_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    visa_case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("visa_cases.id", ondelete="RESTRICT"), index=True)
    author_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class VisaDocument(Base):
    __tablename__ = "visa_documents"
    __table_args__ = (UniqueConstraint("upload_idempotency_key", name="uq_visa_documents_upload_idempotency"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    visa_case_id: Mapped[int] = mapped_column(ForeignKey("visa_cases.id", ondelete="RESTRICT"), nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String(80), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    upload_idempotency_key: Mapped[Optional[str]] = mapped_column(String(255))
    checksum_sha256: Mapped[Optional[str]] = mapped_column(String(64))
    mime_type: Mapped[Optional[str]] = mapped_column(String(120))
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    visibility: Mapped[str] = mapped_column(String(16), nullable=False, default="INTERNAL")
    expires_on: Mapped[Optional[date]] = mapped_column(Date)
    uploaded_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class CredentialVaultItem(Base):
    __tablename__ = "credential_vault_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    visa_case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("visa_cases.id", ondelete="RESTRICT"), index=True)
    provider: Mapped[str] = mapped_column(String(160), nullable=False)
    service_url: Mapped[Optional[str]] = mapped_column(Text)
    login_envelope: Mapped[Optional[bytes]] = mapped_column(LargeBinary)
    login_mask: Mapped[Optional[str]] = mapped_column(String(64))
    secret_envelope: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    note_envelope: Mapped[Optional[bytes]] = mapped_column(LargeBinary)
    created_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    updated_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
