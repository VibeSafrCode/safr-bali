from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RewardRule(Base):
    __tablename__ = "reward_rules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), nullable=False, index=True)
    partner_mode_id: Mapped[int] = mapped_column(ForeignKey("partner_modes.id"), nullable=False, index=True)

    level_1_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    level_2_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    level_3_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    valid_from: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    valid_to: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_by_admin_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
