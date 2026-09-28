import asyncio
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from app.services import onboarding as service


@pytest.fixture(autouse=True)
def isolate_durable_store(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "__file__", str(tmp_path / "app" / "services" / "onboarding.py"))


def test_sender_exact_question_buttons_and_idempotent_ack_retry(monkeypatch):
    calls = []
    async def api(method, path, payload=None):
        calls.append(payload)
        return None if len(calls) == 1 else {"state": "DELIVERED"}
    monkeypatch.setattr(service, "api", api)
    bot = SimpleNamespace(send_message=AsyncMock(return_value=SimpleNamespace(message_id=44)))
    item = {"id": 1, "enrollment_id": 2, "step": "followup", "telegram_id": 3,
        "text": "Все ли вам понятно? Есть ли у вас вопросы?", "lease_token": "lease"}
    asyncio.run(service.deliver(bot, item))
    assert bot.send_message.await_count == 1
    assert len(calls) == 2 and calls[0] == calls[1]
    sent = bot.send_message.call_args
    assert sent.args == (3, item["text"])
    assert sent.kwargs["parse_mode"] is None
    buttons = sent.kwargs["reply_markup"].inline_keyboard[0]
    assert [button.text for button in buttons] == ["да", "написать менеджеру"]


def test_ambiguous_send_is_unknown_and_not_repeated(monkeypatch):
    api = AsyncMock(return_value={"state": "UNKNOWN"})
    monkeypatch.setattr(service, "api", api)
    bot = SimpleNamespace(send_message=AsyncMock(side_effect=TimeoutError()))
    asyncio.run(service.deliver(bot, {"id": 1, "step": "welcome_1", "telegram_id": 3,
        "text": "<plain>", "lease_token": "lease"}))
    assert bot.send_message.await_count == 1
    assert api.call_args.args[2]["state"] == "UNKNOWN"


def test_provenance_fails_closed_and_excludes_local_history(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "__file__", str(tmp_path / "app" / "services" / "onboarding.py"))
    root = tmp_path / "app" / "data"
    root.mkdir(parents=True)
    message = SimpleNamespace(from_user=SimpleNamespace(id=10), chat=SimpleNamespace(id=10),
        message_id=20, date=datetime(2026, 9, 28, tzinfo=timezone.utc))
    monkeypatch.setattr(service.settings, "ONBOARDING_REGISTRATION_HISTORY_VERIFIED", False)
    assert service.registration_provenance(message) == {}
    monkeypatch.setattr(service.settings, "ONBOARDING_REGISTRATION_HISTORY_VERIFIED", True)
    assert service.registration_provenance(message) == {}
    for name in ("user_activity.json", "referrals.json", "referral_codes.json", "conversations.json"):
        (root / name).write_text("{}")
    assert service.registration_provenance(message)["registration_event"] == "telegram-start:10:20"
    (root / "user_activity.json").write_text(json.dumps({"10": {}}))
    # Pending trusted event survives activity written before an unavailable backend.
    assert service.registration_provenance(message)["registration_event"] == "telegram-start:10:20"
    service.confirm_registration(10, "telegram-start:10:20")
    assert service.registration_provenance(message) == {}
    (root / "user_activity.json").write_text("broken")
    assert service.registration_provenance(message) == {}


def test_both_help_callbacks_use_human_actor_and_manager_enters_dialog(monkeypatch):
    from app.handlers import onboarding as handler
    api = AsyncMock(return_value={"accepted": True, "replay": False})
    monkeypatch.setattr(handler, "api", api)
    monkeypatch.setattr(handler, "ensure_client_record", lambda user_id: {"restricted_to_owner": False})
    for action in ("yes", "manager"):
        callback = SimpleNamespace(data=f"onboard:{action}:22", from_user=SimpleNamespace(id=77),
            answer=AsyncMock(), message=SimpleNamespace(from_user=SimpleNamespace(id=999), answer=AsyncMock()))
        state = SimpleNamespace(set_state=AsyncMock(), update_data=AsyncMock())
        asyncio.run(handler.help_callback(callback, state))
        assert api.call_args.args[2]["telegram_id"] == 77
        assert state.set_state.await_count == (1 if action == "manager" else 0)


def test_scoped_reply_preserves_owner_only_restriction(monkeypatch):
    from app.handlers import onboarding as handler
    monkeypatch.setattr(handler, "api", AsyncMock(return_value={"client_telegram_id": 77}))
    monkeypatch.setattr(handler, "ensure_client_record", lambda user_id: {"restricted_to_owner": True})
    assert asyncio.run(handler.authorized(22, handler.settings.ADMIN_CHAT_ID + 1)) is None
    assert asyncio.run(handler.authorized(22, handler.settings.ADMIN_CHAT_ID)) == 77


def test_successful_send_receipt_survives_restart_until_ack(monkeypatch):
    monkeypatch.setattr(service, "api", AsyncMock(return_value=None))
    bot = SimpleNamespace(send_message=AsyncMock(return_value=SimpleNamespace(message_id=91)))
    item = {"id": 31, "step": "welcome_1", "telegram_id": 3, "text": "hello", "lease_token": "original"}
    asyncio.run(service.deliver(bot, item))
    saved = service.read_store("receipts")
    assert saved["31"]["telegram_message_id"] == "91"
    # Reload the persisted receipt as a fresh worker would; no Telegram resend.
    ack = AsyncMock(return_value={"state": "DELIVERED"})
    monkeypatch.setattr(service, "api", ack)
    asyncio.run(service.replay_receipts())
    assert ack.call_args.args[2] == saved["31"]
    assert service.read_store("receipts") == {}
    assert bot.send_message.await_count == 1


def test_registration_http_failure_retains_original_event_until_confirmed(monkeypatch, tmp_path):
    from app.services import backend_client
    root = tmp_path / "app" / "data"
    root.mkdir(parents=True)
    for name in ("user_activity.json", "referrals.json", "referral_codes.json", "conversations.json"):
        (root / name).write_text("{}")
    monkeypatch.setattr(service.settings, "ONBOARDING_REGISTRATION_HISTORY_VERIFIED", True)
    message = SimpleNamespace(from_user=SimpleNamespace(id=10), chat=SimpleNamespace(id=10),
        message_id=20, date=datetime(2026, 9, 28, tzinfo=timezone.utc))
    original = service.registration_provenance(message)
    (root / "user_activity.json").write_text(json.dumps({"10": {}}))
    attempts = []

    class Client:
        def __init__(self, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def post(self, url, *, json, headers):
            attempts.append(json)
            if len(attempts) == 1:
                raise TimeoutError()
            return SimpleNamespace(raise_for_status=lambda: None)

    monkeypatch.setattr(backend_client.httpx, "AsyncClient", Client)
    args = dict(telegram_id=10, username=None, first_name=None, last_name=None, language="ru",
        invited_by_telegram_id=None, registration_provenance=original)
    assert not asyncio.run(backend_client.sync_user_registration(**args))
    message.message_id = 21
    assert service.registration_provenance(message) == original
    assert asyncio.run(backend_client.sync_user_registration(**args))
    assert service.read_store("registrations") == {}
    assert attempts[0]["registration_event"] == attempts[1]["registration_event"] == "telegram-start:10:20"


def test_background_registration_retry_uses_original_payload_without_new_start(monkeypatch):
    from app.services import backend_client
    monkeypatch.setattr(service.settings, "ONBOARDING_REGISTRATION_HISTORY_VERIFIED", True)
    original = {"verified_new_bot_registration": True, "registration_event": "telegram-start:10:20",
        "registration_occurred_at": "2026-09-28T00:00:00+00:00"}
    service.save_json(service.store_path("registrations"), {"10": original})
    payload = {"telegram_id": 10, "username": "original", "invited_by_ref_code": "ORIGINAL", **original}
    service.stage_registration(10, original["registration_event"], payload)
    # A repeated start cannot replace attribution/profile of the pending event.
    assert service.stage_registration(10, original["registration_event"], {**payload, "username": "changed"}) == payload
    seen = []
    async def confirmed(**kwargs):
        seen.append(kwargs)
        service.confirm_registration(kwargs["telegram_id"], kwargs["registration_provenance"]["registration_event"])
        return True
    monkeypatch.setattr(backend_client, "sync_user_registration", confirmed)
    asyncio.run(service.retry_registrations())
    assert seen[0]["username"] == "original"
    assert seen[0]["invited_by_ref_code"] == "ORIGINAL"
    assert seen[0]["registration_provenance"] == original
    assert service.read_store("registrations") == {}


def test_one_polling_process_owns_shared_runtime_store():
    first = service.acquire_runtime_lock()
    try:
        with pytest.raises(RuntimeError):
            service.acquire_runtime_lock()
    finally:
        first.close()
    service.acquire_runtime_lock().close()
