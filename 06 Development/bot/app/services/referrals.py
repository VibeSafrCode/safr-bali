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
        }
        added += 1

    if added:
        save_referrals(referrals_data)
    return added
