import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from aiogram.types import Message

from app.core.config import settings


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
ACTIVITY_PATH = DATA_DIR / "user_activity.json"
ACTIVITY_SETTINGS_PATH = DATA_DIR / "activity_settings.json"


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default):
    ensure_data_dir()

    if not path.exists():
        return default

    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_json(path: Path, data) -> None:
    ensure_data_dir()

    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def is_activity_watch_enabled() -> bool:
    data = load_json(ACTIVITY_SETTINGS_PATH, {"enabled": False})
    return bool(data.get("enabled", False))


def set_activity_watch_enabled(enabled: bool) -> None:
    save_json(ACTIVITY_SETTINGS_PATH, {"enabled": enabled})


def get_user_label(message: Message) -> str:
    user = message.from_user
    username = f"@{user.username}" if user and user.username else "username не указан"
    full_name = user.full_name if user else "имя не указано"
    telegram_id = user.id if user else "id не указан"

    return (
        f"{full_name}\n"
        f"Telegram ID: {telegram_id}\n"
        f"Username: {username}"
    )


def save_user_activity(
    message: Message,
    action: str,
    details: Optional[str] = None,
) -> None:
    if not message.from_user:
        return

    data = load_json(ACTIVITY_PATH, {})

    user_id = str(message.from_user.id)
    user_data = data.setdefault(
        user_id,
        {
            "telegram_id": message.from_user.id,
            "full_name": message.from_user.full_name,
            "username": message.from_user.username,
            "events": [],
        },
    )

    user_data["full_name"] = message.from_user.full_name
    user_data["username"] = message.from_user.username

    user_data["events"].append(
        {
            "created_at": datetime.utcnow().isoformat(),
            "action": action,
            "details": details,
            "message_text": message.text,
        }
    )

    user_data["events"] = user_data["events"][-100:]

    save_json(ACTIVITY_PATH, data)


def get_user_activity_summary(user_id: int, limit: int = 15) -> str:
    data = load_json(ACTIVITY_PATH, {})
    user_data = data.get(str(user_id))

    if not user_data:
        return "Истории действий по этому пользователю пока нет."

    events = user_data.get("events", [])[-limit:]

    lines = [
        "🧾 История интересов пользователя",
        "",
        f"Пользователь: {user_data.get('full_name')}",
        f"Telegram ID: {user_data.get('telegram_id')}",
        f"Username: @{user_data.get('username')}" if user_data.get("username") else "Username: не указан",
        "",
        "Последние действия:",
    ]

    for event in events:
        details = event.get("details") or ""
        lines.append(
            f"— {event.get('created_at')} | {event.get('action')} | {details}"
        )

    return "\n".join(lines)


def get_recent_activity_summary(limit: int = 20) -> str:
    data = load_json(ACTIVITY_PATH, {})
    all_events = []

    for user_id, user_data in data.items():
        for event in user_data.get("events", []):
            all_events.append(
                {
                    "user_id": user_id,
                    "full_name": user_data.get("full_name"),
                    "username": user_data.get("username"),
                    **event,
                }
            )

    if not all_events:
        return "Пока нет сохранённых действий пользователей."

    all_events = sorted(all_events, key=lambda item: item.get("created_at", ""))[-limit:]

    lines = ["📜 Последние действия пользователей", ""]

    for event in all_events:
        username = f"@{event.get('username')}" if event.get("username") else "username не указан"
        details = event.get("details") or ""
        lines.append(
            f"— {event.get('created_at')}\n"
            f"  {event.get('full_name')} / {username} / ID {event.get('user_id')}\n"
            f"  {event.get('action')} — {details}"
        )

    return "\n\n".join(lines)


async def track_activity(
    message: Message,
    action: str,
    details: Optional[str] = None,
    notify_admin: bool = True,
) -> None:
    save_user_activity(message, action, details)

    if not notify_admin:
        return

    if not is_activity_watch_enabled():
        return

    if not message.from_user:
        return

    if message.from_user.id == settings.ADMIN_CHAT_ID:
        return

    admin_text = (
        "👀 Действие пользователя в боте\n\n"
        f"{get_user_label(message)}\n\n"
        f"Действие: {action}\n"
        f"Детали: {details or '—'}"
    )

    try:
        await message.bot.send_message(
            chat_id=settings.ADMIN_CHAT_ID,
            text=admin_text,
        )
    except Exception as error:
        print(f"Could not notify admin about activity: {error}")
