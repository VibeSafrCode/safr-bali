from __future__ import annotations

import secrets
from datetime import datetime, timezone
from pathlib import Path

from app.services.json_storage import load_json, save_json


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
REFERRALS_PATH = DATA_DIR / "referrals.json"
REFERRAL_CODES_PATH = DATA_DIR / "referral_codes.json"
USER_ACTIVITY_PATH = DATA_DIR / "user_activity.json"

CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
CODE_LENGTH = 8
RESERVED_START_PARAMETERS = {
    "bali",
    "thailand",
    "russia",
    "spb",
    "spb_tours",
    "chelyabinsk",
    "nepal",
}


def _telegram_safe(text: str, limit: int = 3900) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 30].rstrip() + "\n\n… список сокращён"


def load_referrals() -> dict:
    data = load_json(REFERRALS_PATH, {})
    return data if isinstance(data, dict) else {}


def save_referrals(data: dict) -> None:
    save_json(REFERRALS_PATH, data)


def load_referral_codes() -> dict:
    data = load_json(REFERRAL_CODES_PATH, {})
    return data if isinstance(data, dict) else {}


def save_referral_codes(data: dict) -> None:
    save_json(REFERRAL_CODES_PATH, data)


def load_user_activity() -> dict:
    data = load_json(USER_ACTIVITY_PATH, {})
    return data if isinstance(data, dict) else {}


def get_user_profile(user_id: int) -> dict:
    record = load_user_activity().get(str(user_id), {})
    if not isinstance(record, dict):
        return {"telegram_id": user_id}
    return {
        "telegram_id": user_id,
        "full_name": record.get("full_name"),
        "username": record.get("username"),
    }


def format_profile(profile: dict, fallback_id: int | None = None) -> str:
    telegram_id = profile.get("telegram_id") or fallback_id or "неизвестен"
    full_name = profile.get("full_name") or "Имя не указано"
    username = (
        f"@{profile.get('username')}"
        if profile.get("username")
        else "username не указан"
    )
    return f"{full_name} / {username} / ID {telegram_id}"


def get_direct_referrals(referrer_id: int) -> list[dict]:
    activity = load_user_activity()
    rows = []
    for child_key, record in load_referrals().items():
        if not isinstance(record, dict):
            continue
        if _positive_user_id(record.get("referrer_id")) != referrer_id:
            continue
        child_id = _positive_user_id(record.get("user_id")) or _positive_user_id(child_key)
        if not child_id:
            continue
        profile = activity.get(str(child_id), {})
        rows.append(
            {
                **record,
                "user_id": child_id,
                "full_name": profile.get("full_name") if isinstance(profile, dict) else None,
                "username": profile.get("username") if isinstance(profile, dict) else None,
            }
        )
    return sorted(
        rows,
        key=lambda item: item.get("created_at") or "",
        reverse=True,
    )


def format_network_summary(referrer_id: int, limit: int = 20) -> str:
    referrals = get_direct_referrals(referrer_id)
    lines = [
        "🌐 Моя сеть",
        "",
        f"Приглашено напрямую: {len(referrals)}",
    ]
    if not referrals:
        lines.extend(
            [
                "",
                "Пока никто не зарегистрировался по вашей ссылке.",
                "Отправьте персональную ссылку человеку — после первого запуска он появится здесь.",
            ]
        )
        return "\n".join(lines)

    lines.extend(["", "Последние приглашённые:"])
    for record in referrals[:limit]:
        lines.append(
            f"— {format_profile(record, record.get('user_id'))}\n"
            f"  Дата: {record.get('created_at') or 'не зафиксирована'}"
        )
    return "\n".join(lines)


def format_admin_referral_summary(limit: int = 30) -> str:
    referrals = load_referrals()
    activity = load_user_activity()
    rows = []
    for child_key, record in referrals.items():
        if not isinstance(record, dict):
            continue
        child_id = _positive_user_id(record.get("user_id")) or _positive_user_id(child_key)
        referrer_id = _positive_user_id(record.get("referrer_id"))
        if not child_id or not referrer_id:
            continue
        rows.append((record.get("created_at") or "", child_id, referrer_id, record))
    rows.sort(reverse=True)

    lines = ["🌐 Реферальная сеть", "", f"Всего привязок: {len(rows)}", ""]
    for _, child_id, referrer_id, record in rows[:limit]:
        child_profile = activity.get(str(child_id), {})
        referrer_profile = activity.get(str(referrer_id), {})
        lines.append(
            f"👤 {format_profile(child_profile, child_id)}\n"
            f"↳ Пригласил: {format_profile(referrer_profile, referrer_id)}\n"
            f"Источник: {record.get('source') or 'не указан'}"
        )
    return _telegram_safe("\n\n".join(lines))


def format_recent_registrations(limit: int = 20) -> str:
    activity = load_user_activity()
    referrals = load_referrals()
    rows = []
    for user_key, profile in activity.items():
        if not isinstance(profile, dict):
            continue
        start_events = [
            event
            for event in profile.get("events", [])
            if isinstance(event, dict) and event.get("action") == "start"
        ]
        if not start_events:
            continue
        user_id = _positive_user_id(profile.get("telegram_id")) or _positive_user_id(user_key)
        if user_id:
            rows.append((start_events[0].get("created_at") or "", user_id, profile))
    rows.sort(reverse=True)

    lines = ["👥 Последние пользователи", ""]
    for created_at, user_id, profile in rows[:limit]:
        referral = referrals.get(str(user_id), {})
        referrer_id = _positive_user_id(referral.get("referrer_id")) if isinstance(referral, dict) else None
        referrer_profile = activity.get(str(referrer_id), {}) if referrer_id else {}
        lines.append(
            f"👤 {format_profile(profile, user_id)}\n"
            f"Дата первого запуска: {created_at or 'не зафиксирована'}\n"
            f"Пригласил: {format_profile(referrer_profile, referrer_id) if referrer_id else 'нет привязки'}"
        )
    return (
        _telegram_safe("\n\n".join(lines))
        if rows
        else "Пользователей пока нет."
    )


def _generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def _positive_user_id(value) -> int | None:
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, str) and value.isdigit() and int(value) > 0:
        return int(value)
    return None


def get_or_create_referral_code(owner_user_id: int) -> str:
    codes = load_referral_codes()

    for code, record in codes.items():
        if (
            isinstance(record, dict)
            and _positive_user_id(record.get("owner_user_id")) == owner_user_id
        ):
            return code

    while True:
        code = _generate_code()
        if code not in codes and code.lower() not in RESERVED_START_PARAMETERS:
            break

    codes[code] = {
        "owner_user_id": owner_user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "active": True,
    }
    save_referral_codes(codes)
    return code


def resolve_referrer_id(start_parameter: str | None) -> int | None:
    if not start_parameter:
        return None

    parameter = start_parameter.strip()

    # Старые опубликованные ссылки продолжают работать.
    if parameter.startswith("ref_"):
        legacy_user_id = parameter.removeprefix("ref_")
        return int(legacy_user_id) if legacy_user_id.isdigit() else None

    record = load_referral_codes().get(parameter.upper())
    if not isinstance(record, dict) or record.get("active") is False:
        return None

    return _positive_user_id(record.get("owner_user_id"))


def backfill_default_admin_referrals(admin_user_id: int) -> int:
    """Attach known unassigned users to the main admin without overwrites."""
    activity = load_json(USER_ACTIVITY_PATH, {})
    referrals_data = load_referrals()
    added = 0

    if not isinstance(activity, dict):
        return 0

    for key, record in activity.items():
        candidate = int(key) if isinstance(key, str) and key.isdigit() else None

        if isinstance(record, dict):
            stored_user_id = record.get("telegram_id") or record.get("user_id")
            if isinstance(stored_user_id, int):
                candidate = stored_user_id
            elif isinstance(stored_user_id, str) and stored_user_id.isdigit():
                candidate = int(stored_user_id)

        if not candidate or candidate == admin_user_id:
            continue

        user_key = str(candidate)
        if user_key in referrals_data:
            continue

        referrals_data[user_key] = {
            "user_id": candidate,
            "referrer_id": admin_user_id,
            "source": "default_main_admin_backfill",
            "silent": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        added += 1

    if added:
        save_referrals(referrals_data)
    return added
