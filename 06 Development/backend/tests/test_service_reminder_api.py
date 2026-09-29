from app.api import service_reminders
from app.core.config import settings
from app.models.admin_action import AdminAction
from app.models.service_reminders import ServiceExpiryDelivery as Delivery
from app.schemas.service_reminders import ReminderPolicy

from tests.test_life_services import api, create, published, web_session


def test_policy_root_auth_csrf_preview_cas_and_restore(api, monkeypatch):
    client, factory, _ = api
    monkeypatch.setattr(service_reminders, "SessionLocal", factory)
    path = "/api/web/admin/service-reminders"
    assert client.get(path).status_code == 401
    policy = ReminderPolicy().model_dump()
    body = {"expected_version": 0, "policy": policy, "reason": "Configure reminders"}
    for user_id in (2, 3, 4):
        headers = web_session(client, user_id)
        assert client.get(path).status_code == 403
        assert client.put(path, headers=headers, json=body).status_code == 403
    headers = web_session(client, 1)
    assert client.get(path).json()["version"] == 0
    assert client.put(path, json=body).status_code == 403
    assert client.put(path, headers={**headers, "Origin": "https://evil.test"}, json=body).status_code == 403
    assert client.post(path + "/preview", headers=headers, json={"policy": policy}).status_code == 200
    assert client.get(path).json()["versions"] == []
    first = client.put(path, headers=headers, json=body)
    assert first.status_code == 200 and first.json()["version"] == 1
    assert client.put(path, headers=headers, json=body).status_code == 409
    changed = {**policy, "enabled": True}
    assert client.put(path, headers=headers, json={**body, "expected_version": 1, "policy": changed}).status_code == 200
    restored = client.post(path + "/restore", headers=headers, json={"expected_version": 2, "restore_version": 1, "reason": "Restore disabled policy"})
    assert restored.status_code == 200 and restored.json()["version"] == 3
    assert restored.json()["policy"]["enabled"] is False
    assert len(restored.json()["versions"]) == 3
    assert client.post("/api/service/service-reminders/claim").status_code in {401, 403}
    assert client.post("/api/service/service-reminders/claim", headers={"X-Service-Token": settings.SERVICE_API_TOKEN}).json() == {"items": []}


def test_owner_notifications_isolation_csrf_and_legacy_editor_preserves_optout(api):
    client, factory, _ = api
    headers = web_session(client, 1)
    row = create(client, headers, published()).json()
    assert row["notifications_enabled"] is True and row["notifications_available"] is False
    assert row["notification_unavailable_reason"] == "disabled"
    path = f"/api/web/life-services/{row['id']}/notifications"
    headers = web_session(client, 3)
    assert client.patch(path, headers=headers, json={"enabled": False}).status_code == 404
    headers = web_session(client, 2)
    assert client.patch(path, json={"enabled": False}).status_code == 403
    disabled = client.patch(path, headers=headers, json={"enabled": False})
    assert disabled.status_code == 200 and disabled.json()["notifications_enabled"] is False
    assert disabled.json()["version"] == 2
    headers = web_session(client, 1)
    old_body = {key: value for key, value in published().items() if key != "idempotency_key"}
    old_body.update(expected_version=2, title="Edited by old editor")
    saved = client.put(f"/api/web/admin/clients/2/life-services/{row['id']}", headers=headers, json=old_body)
    assert saved.status_code == 200 and saved.json()["notifications_enabled"] is False
    client.cookies.clear()
    client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, "mini-3")
    mini_path = f"/mini-app/life-services/{row['id']}/notifications"
    assert client.patch(mini_path, json={"enabled": True}).status_code == 404
    client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, "mini-2")
    assert client.patch(mini_path, json={"enabled": True}).json()["notifications_enabled"] is True
    with factory() as db:
        assert db.query(Delivery).count() == 0
        assert db.query(AdminAction).filter_by(action_type="LIFE_SERVICE_NOTIFICATIONS_CHANGED").count() == 2
