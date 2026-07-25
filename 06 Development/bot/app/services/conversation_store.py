from __future__ import annotations

from datetime import datetime
from pathlib import Path

from app.services.json_storage import load_json, save_json


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CONVERSATIONS_PATH = DATA_DIR / "conversations.json"


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _normalize_record(record: dict | None) -> dict:
    normalized = dict(record) if isinstance(record, dict) else {}
    normalized.setdefault("messages", [])
    normalized.setdefault("comments", [])
    normalized.setdefault("staff_thread", [])
    normalized.setdefault("restricted_to_owner", False)
    normalized.setdefault("active", False)
    normalized.setdefault("last_notice_message_id", None)
    normalized.setdefault("route_context", {})
    normalized.setdefault("assigned_staff_ids", [])
    return normalized


def load_conversations() -> dict:
    data = load_json(CONVERSATIONS_PATH, {})
    if not isinstance(data, dict):
        return {}
    return {
        str(client_id): _normalize_record(record)
        for client_id, record in data.items()
    }


def save_conversations(data: dict) -> None:
    save_json(CONVERSATIONS_PATH, data)


def ensure_client_record(client_id: int) -> dict:
    data = load_conversations()
    client_key = str(client_id)
    record = _normalize_record(data.get(client_key))
    data[client_key] = record
    save_conversations(data)
    return record


def update_client_record(client_id: int, record: dict) -> None:
    data = load_conversations()
    data[str(client_id)] = _normalize_record(record)
    save_conversations(data)


def append_record_item(client_id: int, field: str, item: dict) -> None:
    record = ensure_client_record(client_id)
    record.setdefault(field, []).append(item)
    update_client_record(client_id, record)


def add_history_item(client_id: int, item: dict) -> None:
    append_record_item(client_id, "messages", item)


def add_comment(client_id: int, comment: dict) -> None:
    append_record_item(client_id, "comments", comment)


def add_staff_thread_message(client_id: int, message: dict) -> None:
    append_record_item(client_id, "staff_thread", message)


def format_staff_thread(client_id: int, limit: int = 30) -> str:
    record = ensure_client_record(client_id)
    items = record.get("staff_thread", [])[-limit:]
    route = record.get("route_context") or {}
    route_parts = [
        route.get("country"),
        route.get("city") or route.get("region"),
        route.get("section"),
        route.get("service"),
    ]
    route_text = " → ".join(part for part in route_parts if part) or "не указано"

    lines = [
        "💬 Внутренний чат команды",
        "",
        f"Клиент: {client_id}",
        f"Маршрут: {route_text}",
        "",
    ]
    if not items:
        lines.append("Сообщений пока нет.")
    else:
        for item in items:
            kind = "Заметка" if item.get("kind") == "note" else "Сообщение"
            lines.append(
                f"[{item.get('created_at')}] {item.get('staff_name')} — {kind}:\n"
                f"{item.get('text')}"
            )

    text = "\n\n".join(lines)
    return text[-3800:] if len(text) > 3800 else text
