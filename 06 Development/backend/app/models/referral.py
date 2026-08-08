from datetime import datetime
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Referral(Base):
    __tablename__ = "referrals"
    __table_args__ = (
        UniqueConstraint(
            "child_user_id",
            name="uq_referrals_child_user_id",
        ),
        CheckConstraint(
            "parent_user_id <> child_user_id",
            name="ck_referrals_parent_not_child",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    parent_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    child_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    level: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    attribution_reason: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
