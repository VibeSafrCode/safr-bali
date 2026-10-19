"""Bot-scoped contacts and the admin announcement recipient ledger."""
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint

from app.db.base import Base


class BotContact(Base):
    __tablename__ = "bot_contacts"
    __table_args__ = (
        UniqueConstraint("user_id", "bot_key", name="uq_bot_contact_user_bot"),
        CheckConstraint("bot_key IN ('safrway','yoga')", name="ck_bot_contact_brand"),
        CheckConstraint("status IN ('active','blocked','unknown')", name="ck_bot_contact_status"),
    )
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    bot_key = Column(String(16), nullable=False, index=True)
    locale = Column(String(2), nullable=False)
    status = Column(String(16), nullable=False, default="active")
    source = Column(String(32), nullable=False)
    first_contact_at = Column(DateTime(timezone=True))
    last_contact_at = Column(DateTime(timezone=True))
    last_event = Column(String(160), nullable=False)
    announcements_opted_out = Column(Boolean, nullable=False, default=False)


class BotCampaign(Base):
    __tablename__ = "bot_campaigns"
    __table_args__ = (
        CheckConstraint("bot_key IN ('safrway','yoga')", name="ck_bot_campaign_brand"),
        CheckConstraint("kind IN ('announcement','welcome_backfill')", name="ck_bot_campaign_kind"),
        CheckConstraint("state IN ('DRAFT','PREVIEW','QUEUED','CANCELLED','COMPLETE')", name="ck_bot_campaign_state"),
    )
    id = Column(Integer, primary_key=True)
    bot_key = Column(String(16), nullable=False, index=True)
    kind = Column(String(24), nullable=False)
    title = Column(String(200), nullable=False)
    state = Column(String(16), nullable=False, default="DRAFT")
    revision = Column(Integer, nullable=False, default=0)
    audience = Column(JSON, nullable=False)
    content = Column(JSON, nullable=False)
    content_version = Column(Integer, ForeignKey("onboarding_versions.version", ondelete="RESTRICT"))
    followup_enabled = Column(Boolean, nullable=False, default=False)
    snapshot_sha256 = Column(String(64))
    confirmation_key = Column(String(100), unique=True)
    confirmation_revision = Column(Integer)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    confirmed_at = Column(DateTime(timezone=True))


class BotCampaignRecipient(Base):
    __tablename__ = "bot_campaign_recipients"
    __table_args__ = (UniqueConstraint("campaign_id", "user_id", name="uq_bot_campaign_recipient"),)
    id = Column(Integer, primary_key=True)
    campaign_id = Column(Integer, ForeignKey("bot_campaigns.id", ondelete="RESTRICT"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    contact_id = Column(Integer, ForeignKey("bot_contacts.id", ondelete="RESTRICT"), nullable=False)
    locale = Column(String(2), nullable=False)
    state = Column(String(16), nullable=False, default="PREVIEW", index=True)
    payload = Column(JSON, nullable=False, default=dict)
    enrollment_id = Column(Integer, ForeignKey("onboarding_enrollments.id", ondelete="RESTRICT"))
    due_at = Column(DateTime(timezone=True))
    attempts = Column(Integer, nullable=False, default=0)
    lease_token = Column(String(64))
    lease_expires_at = Column(DateTime(timezone=True))
    telegram_message_id = Column(String(64))
    delivered_at = Column(DateTime(timezone=True))
    error_code = Column(String(80))
