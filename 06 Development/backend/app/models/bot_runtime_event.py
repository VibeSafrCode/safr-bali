from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BotRuntimeEvent(Base):
    __tablename__ = "bot_runtime_events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    source_key: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True, index=True)
    client_telegram_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    actor_telegram_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
