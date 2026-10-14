from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PublicReferralAlias(Base):
    """Stable public address for an existing canonical User, not another graph."""
    __tablename__ = "referral_public_aliases"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_referral_public_aliases_user_id"),
        CheckConstraint("length(code) = 10 AND substr(code, 1, 2) = 'r_' AND substr(code, 3, 8) = upper(substr(code, 3, 8))", name="ck_referral_public_aliases_format"),
    )
    code: Mapped[str] = mapped_column(String(10), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
