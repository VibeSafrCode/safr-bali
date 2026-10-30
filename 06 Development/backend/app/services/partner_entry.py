"""First partner-channel entry facts, separate from referral ownership."""
from app.models.bot_runtime_event import BotRuntimeEvent


def _entry(db, telegram_id: int):
    return db.query(BotRuntimeEvent).filter_by(source_key=f"partner-entry:yoga:{telegram_id}").one_or_none()


def yoga_entry_is_existing(db, telegram_id: int) -> bool | None:
    row = _entry(db, telegram_id)
    if row is None:
        return None
    payload = row.payload
    if (row.client_telegram_id != telegram_id or row.actor_telegram_id != telegram_id
            or row.event_type != "partner_entry" or not isinstance(payload, dict)
            or set(payload) != {"bot_key", "is_existing_safrway_client"}
            or payload.get("bot_key") != "yoga" or type(payload.get("is_existing_safrway_client")) is not bool):
        raise ValueError("partner_entry_conflict")
    return payload["is_existing_safrway_client"]


def record_yoga_entry(db, user, *, is_existing_safrway_client: bool) -> bool:
    previous = yoga_entry_is_existing(db, user.telegram_id)
    if previous is not None:
        return previous
    db.add(BotRuntimeEvent(source_key=f"partner-entry:yoga:{user.telegram_id}",
        client_telegram_id=user.telegram_id, actor_telegram_id=user.telegram_id,
        event_type="partner_entry", payload={"bot_key": "yoga",
            "is_existing_safrway_client": is_existing_safrway_client}))
    db.flush()
    return is_existing_safrway_client
