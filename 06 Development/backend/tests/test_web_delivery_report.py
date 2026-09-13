from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api import web_portal
from app.db.base import Base
from app.models.web_portal import WebOutboxEvent


def test_partial_delivery_report_is_persisted_without_full_success(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    db = factory()
    event = WebOutboxEvent(event_type="web_user_registered", payload={"fixture": True})
    db.add(event); db.commit()
    monkeypatch.setattr(web_portal, "SessionLocal", factory)
    web_portal.mark_delivered(event.id, web_portal.DeliveryRequest(
        recipient_ids=[1], status="failed", error_code="telegram_delivery_incomplete",
        delivery_results={"1": "delivered", "3": "unknown"},
    ))
    db.expire_all()
    saved = db.get(WebOutboxEvent, event.id)
    assert saved.status == "failed"
    assert saved.delivered_at is None
    assert saved.payload["fixture"] is True
    assert saved.payload["delivery_report"]["recipients"] == {"1": "delivered", "3": "unknown"}
    db.close()
