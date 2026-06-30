from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PointsLedger(Base):
    __tablename__ = "points_ledger"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    operation_type: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)

    order_id: Mapped[Optional[int]] = mapped_column(ForeignKey("orders.id"), nullable=True, index=True)
    service_id: Mapped[Optional[int]] = mapped_column(ForeignKey("services.id"), nullable=True, index=True)
    referral_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reward_rule_id: Mapped[Optional[int]] = mapped_column(ForeignKey("reward_rules.id"), nullable=True)

    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    created_by_admin_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
