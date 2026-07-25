from __future__ import annotations

import asyncio
import sys
from pathlib import Path


BOT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BOT_ROOT))

from app.services.backend_client import (
    backend_sync_enabled,
    sync_runtime_event,
    sync_user_registration,
)
from app.services.conversation_store import load_conversations
from app.services.referrals import load_referrals, load_user_activity


def _name_parts(full_name: str | None) -> tuple[str | None, str | None]:
    parts = (full_name or "").strip().split(maxsplit=1)
    return (
        parts[0] if parts else None,
        parts[1] if len(parts) > 1 else None,
    )


async def migrate_users() -> int:
    activity = load_user_activity()
    referrals = load_referrals()
    migrated = 0
    # Two passes let inviters be created before missing relationships are retried.
    for _ in range(2):
        for user_key, profile in activity.items():
            if not isinstance(profile, dict):
                continue
            user_id = profile.get("telegram_id")
            if not isinstance(user_id, int):
                user_id = int(user_key) if str(user_key).isdigit() else None
            if not user_id:
                continue
            first_name, last_name = _name_parts(profile.get("full_name"))
            referral = referrals.get(str(user_id), {})
            synced = await sync_user_registration(
                telegram_id=user_id,
                username=profile.get("username"),
                first_name=first_name,
                last_name=last_name,
                language="ru",
                invited_by_telegram_id=referral.get("referrer_id"),
            )
            migrated += int(synced)
    return migrated


async def migrate_conversations() -> int:
    migrated = 0
    for client_key, record in load_conversations().items():
        if not str(client_key).isdigit():
            continue
        client_id = int(client_key)
        for index, item in enumerate(record.get("messages", [])):
            event_type = (
                "client_message"
                if item.get("from_role") == "client"
                else "staff_reply"
            )
            migrated += int(
                await sync_runtime_event(
                    client_telegram_id=client_id,
                    actor_telegram_id=item.get("from_id"),
                    event_type=event_type,
                    text=item.get("text"),
                    payload={"created_at_legacy": item.get("created_at")},
                    source_key=f"legacy:{client_id}:messages:{index}",
                )
            )
        for index, item in enumerate(record.get("comments", [])):
            migrated += int(
                await sync_runtime_event(
                    client_telegram_id=client_id,
                    actor_telegram_id=item.get("admin_id"),
                    event_type="staff_note",
                    text=item.get("text"),
                    payload={"created_at_legacy": item.get("created_at")},
                    source_key=f"legacy:{client_id}:comments:{index}",
                )
            )
        for index, item in enumerate(record.get("staff_thread", [])):
            migrated += int(
                await sync_runtime_event(
                    client_telegram_id=client_id,
                    actor_telegram_id=item.get("staff_id"),
                    event_type=(
                        "staff_note"
                        if item.get("kind") == "note"
                        else "staff_thread_message"
                    ),
                    text=item.get("text"),
                    payload={"created_at_legacy": item.get("created_at")},
                    source_key=f"legacy:{client_id}:staff_thread:{index}",
                )
            )
    return migrated


async def main() -> None:
    if not backend_sync_enabled():
        raise SystemExit("BACKEND_SERVICE_TOKEN is not configured; nothing changed.")
    users = await migrate_users()
    events = await migrate_conversations()
    print(f"Migration requests completed: users={users}, events={events}")


if __name__ == "__main__":
    asyncio.run(main())
