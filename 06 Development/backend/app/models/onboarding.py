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
    draft = Column(JSON, nullable=False)


class OnboardingVersion(Base):
    __tablename__ = "onboarding_versions"
    version = Column(Integer, primary_key=True)
    content = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    restored_from_version = Column(Integer)


class OnboardingEnrollment(Base):
    __tablename__ = "onboarding_enrollments"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), unique=True, nullable=False)
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
    payload = Column(JSON, nullable=False, default=dict)
    lease_token = Column(String(64))
    lease_expires_at = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    telegram_message_id = Column(String(64))
    error_code = Column(String(80))
