from unittest.mock import patch

import pytest
from pydantic import ValidationError

from app.api.web_portal import GuestMessageRequest, send_guest_message
from app.models.web_portal import WebConversation, WebMessage, WebOutboxEvent
from app.schemas.client_portal import RouteContext
from test_catalog_pricing import database


ATTRIBUTION = {"content_id": "c1_extension", "source_revision": "sha256:" + "a" * 64,
               "locale": "en", "path": "/en/bali/visas/c1-extension/"}


@pytest.mark.parametrize("locale", ["ru", "en", "zh-Hans", "ko", "fr", "de", "ja", "hi", "es", "ar"])
def test_existing_registry_locales_and_optional_backwards_compatibility(locale):
    assert RouteContext(**{**ATTRIBUTION, "locale": locale}).locale == locale
    assert RouteContext(service="C1").model_dump(exclude_none=True) == {"service": "C1"}
    assert RouteContext().model_dump(exclude_none=True) == {}
    assert RouteContext(path="/").path == "/"


@pytest.mark.parametrize("field,value", [
    ("content_id", "../c1"), ("content_id", "<script>"), ("content_id", "x" * 129),
    ("content_id", "c1\n"), ("content_id", 123),
    ("source_revision", "a" * 64), ("source_revision", "sha256:" + "A" * 64),
    ("source_revision", "sha256:" + "g" * 64), ("locale", "EN"), ("locale", "xx"),
    ("path", "https://evil.test/"), ("path", "//evil.test/"), ("path", "/bali?token=secret"),
    ("path", "/bali/#fragment"), ("path", "/bali/../account/"), ("path", "/%2e%2e/"),
    ("path", "/bali\\admin/"), ("path", "/bali//c1/"), ("path", "/bali/\n"),
    ("path", "/bali"), ("path", "/" + "a" * 500 + "/"),
])
def test_invalid_attribution_is_rejected_without_normalizing_to_another_page(field, value):
    with pytest.raises(ValidationError):
        RouteContext(**{**ATTRIBUTION, field: value})


def test_existing_guest_flow_persists_untrusted_attribution_without_granting_identity():
    db = database()
    engine = db.bind
    try:
        payload = GuestMessageRequest(name="Synthetic guest", contact="synthetic@example.test", body="Synthetic request",
                                      route_context={**ATTRIBUTION, "service": "C1", "user_id": 99, "role": "admin"})
        # Existing function commits only into this isolated in-memory DB. There is
        # no delivery worker, transport, Telegram client or real recipient.
        with patch("app.api.web_portal.SessionLocal", return_value=db):
            result = send_guest_message(payload)
        assert result["accepted"] is True
        conversation = db.query(WebConversation).one()
        assert conversation.route_context == {**ATTRIBUTION, "service": "C1"}
        assert conversation.user_id is None
        assert conversation.assigned_staff_ids == []
        assert db.query(WebMessage).one().author_type == "client"
        assert db.query(WebOutboxEvent).one().event_type == "web_chat_message"
    finally:
        db.close()
        engine.dispose()


def test_honeypot_does_not_open_database_or_persist_metadata():
    payload = GuestMessageRequest(name="Synthetic guest", contact="synthetic@example.test", body="Synthetic request",
                                  website="bot-filled", route_context=ATTRIBUTION)
    with patch("app.api.web_portal.SessionLocal") as session:
        assert send_guest_message(payload) == {"accepted": True}
        session.assert_not_called()
