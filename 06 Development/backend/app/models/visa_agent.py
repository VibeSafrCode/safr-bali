"""Finite machine identity and submission binding; visa state stays canonical."""
from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class VisaAgentCredential(Base):
    __tablename__ = 'visa_agent_credentials'
    __table_args__ = (CheckConstraint('operation_mask BETWEEN 1 AND 7', name='ck_visa_agent_operations'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    provisioning_key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    operation_mask: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revoked_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    revoke_reason: Mapped[Optional[str]] = mapped_column(String(300))


class VisaAgentScope(Base):
    __tablename__ = 'visa_agent_scopes'
    __table_args__ = (
        CheckConstraint('operation_mask BETWEEN 1 AND 7', name='ck_visa_agent_scope_operations'),
        Index('uq_visa_agent_client_scope', 'credential_id', 'client_user_id', unique=True,
              postgresql_where=text('visa_case_id IS NULL AND revoked_at IS NULL'),
              sqlite_where=text('visa_case_id IS NULL AND revoked_at IS NULL')),
        Index('uq_visa_agent_case_scope', 'credential_id', 'visa_case_id', unique=True,
              postgresql_where=text('visa_case_id IS NOT NULL AND revoked_at IS NULL'),
              sqlite_where=text('visa_case_id IS NOT NULL AND revoked_at IS NULL')),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    credential_id: Mapped[int] = mapped_column(ForeignKey('visa_agent_credentials.id', ondelete='RESTRICT'), nullable=False)
    client_user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    visa_case_id: Mapped[Optional[int]] = mapped_column(ForeignKey('visa_cases.id', ondelete='RESTRICT'))
    responsible_user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    operation_mask: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    granted_by_user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    grant_reason: Mapped[str] = mapped_column(String(300), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revoked_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    revoke_reason: Mapped[Optional[str]] = mapped_column(String(300))


class VisaAgentSubmission(Base):
    __tablename__ = 'visa_agent_submissions'
    __table_args__ = (UniqueConstraint('provider', 'country_code', 'application_fingerprint',
                                     name='uq_visa_agent_application'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    application_fingerprint: Mapped[str] = mapped_column(String(80), nullable=False)
    lookup_key_id: Mapped[str] = mapped_column(String(64), nullable=False)
    client_user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    visa_type_id: Mapped[int] = mapped_column(ForeignKey('visa_types.id', ondelete='RESTRICT'), nullable=False)
    visa_case_id: Mapped[int] = mapped_column(ForeignKey('visa_cases.id', ondelete='RESTRICT'), nullable=False, index=True)
    visa_process_id: Mapped[int] = mapped_column(ForeignKey('visa_processes.id', ondelete='RESTRICT'), nullable=False, unique=True)
    credential_id: Mapped[int] = mapped_column(ForeignKey('visa_agent_credentials.id', ondelete='RESTRICT'), nullable=False)
    scope_id: Mapped[int] = mapped_column(ForeignKey('visa_agent_scopes.id', ondelete='RESTRICT'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
