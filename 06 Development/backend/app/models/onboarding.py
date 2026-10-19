"""Durable onboarding state; independent of visa and general support permissions."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from app.db.base import Base


class OnboardingState(Base):
    __tablename__ = "onboarding_state"
    id = Column(Integer, primary_key=True)
    revision = Column(Integer, nullable=False, default=0)
    enabled = Column(Boolean, nullable=False, default=False)
    activation_cutoff = Column(DateTime(timezone=True))
    published_version = Column(Integer)
    transport_not_before = Column(DateTime(timezone=True))
    draft = Column(JSON, nullable=False)


class OnboardingVersion(Base):
    __tablename__ = "onboarding_versions"
    version = Column(Integer, primary_key=True)
    bot_key = Column(String(16), nullable=False, default="safrway", server_default="safrway", index=True)
    content = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    restored_from_version = Column(Integer)


class OnboardingEnrollment(Base):
    __tablename__ = "onboarding_enrollments"
    __table_args__ = (UniqueConstraint("user_id", "bot_key", name="uq_onboarding_user_bot"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    bot_key = Column(String(16), nullable=False, default="safrway", server_default="safrway", index=True)
    locale = Column(String(2), nullable=False, default="ru", server_default="ru")
    origin = Column(String(24), nullable=False, default="registration", server_default="registration")
    followup_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    registration_event = Column(String(120), unique=True, nullable=False)
    registered_at = Column(DateTime(timezone=True), nullable=False)
    activation_cutoff = Column(DateTime(timezone=True), nullable=False)
    content_version = Column(Integer, ForeignKey("onboarding_versions.version", ondelete="RESTRICT"))
    help_requested_at = Column(DateTime(timezone=True))


class OnboardingDelivery(Base):
    __tablename__ = "onboarding_deliveries"
    __table_args__ = (UniqueConstraint("enrollment_id", "step", "telegram_id", name="uq_onboarding_delivery"),)
    id = Column(Integer, primary_key=True)
    enrollment_id = Column(Integer, ForeignKey("onboarding_enrollments.id", ondelete="RESTRICT"), nullable=False)
    step = Column(String(32), nullable=False)
    telegram_id = Column(String(32), nullable=False)
    due_at = Column(DateTime(timezone=True), nullable=False, index=True)
    state = Column(String(16), nullable=False, default="PENDING", index=True)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    payload = Column(JSON, nullable=False, default=dict)
    lease_token = Column(String(64))
    lease_expires_at = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    telegram_message_id = Column(String(64))
    error_code = Column(String(80))
