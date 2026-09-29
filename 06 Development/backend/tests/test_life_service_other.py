"""Synthetic other-service API, persistence and reminder contracts."""

import os
from datetime import date

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SERVICE_API_TOKEN", "test-service")
os.environ.setdefault("ADMIN_API_TOKEN", "test-admin")

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.models.admin_action import AdminAction
from app.models.life_services import LifeService
from app.models.service_reminders import ServiceExpiryDelivery
from app.services import service_reminders
from tests.test_life_services import api, create, web_session
from tests.test_service_reminders import NOW, db, enable, life


def other_payload(**changes):
    return {
        "kind": "other", "title": "Airport concierge", "quantity": 3,
        "description": "Meet and assist", "link_url": "https://example.test/service",
        "public_contact": "Approved client contact", "owner_details": "Private owner",
        "internal_note": "Private margin", "price_amount": "125000.00",
        "price_currency": "IDR", "price_unit": "period",
        "publication_status": "PUBLISHED", "idempotency_key": "other-service-fixture",
        **changes,
    }


@pytest.mark.parametrize("mode", ["fixed", "monthly"])
def test_other_create_edit_replay_and_client_projection_preserve_total_and_optional_dates(api, mode):
    client, factory, _ = api
    headers = web_session(client, 1)
    payload = other_payload(rental_mode=mode, price_unit="month" if mode == "monthly" else "period")
    first = create(client, headers, payload)
    assert first.status_code == 201, first.text
    row = first.json()
    assert row["kind"] == "other" and row["quantity"] == 3
    assert row["start_date"] is None and row["end_date"] is None
    assert row["price_amount"] == "125000.00"
    replay = create(client, headers, payload)
    assert replay.status_code == 200 and replay.json()["id"] == row["id"]
    assert create(client, headers, {**payload, "quantity": 4}).status_code == 409

    path = f"/api/web/admin/clients/2/life-services/{row['id']}"
    update = {key: value for key, value in payload.items() if key != "idempotency_key"}
    update.update(expected_version=1, title="Arrival assistance", quantity=4)
    changed = client.put(path, headers=headers, json=update)
    assert changed.status_code == 200, changed.text
    assert changed.json()["quantity"] == 4 and changed.json()["price_amount"] == "125000.00"
    assert client.put(path, headers=headers, json=update).status_code == 409

    # A full-snapshot editor that omits additive metadata must preserve it.
    update.update(expected_version=2, title="Arrival and departure assistance")
    for field in ("quantity", "rental_mode"):
        update.pop(field)
    changed = client.put(path, headers=headers, json=update)
    assert changed.status_code == 200, changed.text
    assert changed.json()["quantity"] == 4 and changed.json()["rental_mode"] == mode

    web_session(client, 2)
    public = client.get(f"/api/web/life-services/{row['id']}").json()
    assert public["kind"] == "other" and public["title"] == update["title"]
    assert public["description"] == payload["description"]
    assert public["link_url"] == payload["link_url"]
    assert public["public_contact"] == payload["public_contact"]
    assert public["quantity"] == 4 and public["price_amount"] == "125000.00"
    assert public["start_date"] is None and public["end_date"] is None
    assert public["notifications_available"] is False
    assert "owner_details" not in public and "internal_note" not in public
    assert "Private" not in str(public)
    client.cookies.clear()
    client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, "mini-2")
    assert client.get(f"/mini-app/life-services/{row['id']}").json() == public
    with factory() as session:
        assert session.query(LifeService).count() == 1
        assert session.query(AdminAction).count() == 3


@pytest.mark.parametrize("start,end", [
    (None, "2030-12-01"), ("2030-11-01", None), ("2030-11-01", "2030-12-01"),
])
def test_other_explicit_dates_remain_exact_without_filling_missing_boundary(api, start, end):
    client, _, _ = api
    response = create(client, web_session(client, 1), other_payload(start_date=start, end_date=end))
    assert response.status_code == 201, response.text
    assert response.json()["start_date"] == start
    assert response.json()["end_date"] == end


@pytest.mark.parametrize("changes", [
    {"title": None}, {"title": "  "}, {"kind": "future_unregistered_kind"},
    {"quantity": 0}, {"quantity": True}, {"quantity": 1.5},
    {"housing_type": "villa"}, {"rental_mode": "weekly"},
    {"start_date": "2030-12-01", "end_date": "2030-11-01"},
])
def test_other_invalid_fields_reject_without_partial_record(api, changes):
    client, factory, _ = api
    response = create(client, web_session(client, 1), other_payload(**changes))
    assert response.status_code == 422
    with factory() as session:
        assert session.query(LifeService).count() == 0
        assert session.query(AdminAction).count() == 0


@pytest.mark.parametrize("changes", [
    {"title": None}, {"title": "  "}, {"quantity": 0}, {"kind": "unknown"},
    {"housing_type": "villa"},
    {"start_date": date(2030, 2, 1), "end_date": date(2030, 1, 1)},
])
def test_other_database_constraints_reject_invalid_direct_writes(db, changes):
    with pytest.raises(IntegrityError):
        life(db, **({"kind": "other"} | changes))
    db.rollback()
    assert db.query(LifeService).count() == 0


def test_other_reminders_require_explicit_end_and_respect_client_optout(db):
    enable(db)
    due = life(db, kind="other", title="Dated service", start_date=None, quantity=3)
    opted_out = life(db, kind="other", title="Opted out service", notifications_enabled=False)
    undated = life(db, kind="other", title="Undated service", remaining=None, start_date=None)
    monthly = life(db, kind="other", title="Monthly service", remaining=None, rental_mode="monthly")
    db.commit()
    claimed = service_reminders.claim(db, now=NOW)
    assert len(claimed) == 1
    assert claimed[0]["payload"]["kind"] == "other"
    assert claimed[0]["payload"]["title"] == due.title
    assert claimed[0]["payload"]["end_date"] == due.end_date.isoformat()
    assert "Private" not in str(claimed) and "MUST NOT LEAK" not in str(claimed)
    assert db.query(ServiceExpiryDelivery).filter_by(life_service_id=opted_out.id).one().state == "SUPPRESSED"
    assert db.query(ServiceExpiryDelivery).filter(ServiceExpiryDelivery.life_service_id.in_((undated.id, monthly.id))).count() == 0
    assert service_reminders.claim(db, now=NOW) == []
