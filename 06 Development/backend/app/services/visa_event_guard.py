"""Exact event identity for transactional visa mutations, not existence replay."""
from __future__ import annotations

import hashlib
import json

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.visa_lifecycle import VisaEvent


class VisaEventGuardBlocked(RuntimeError):
    pass


def lock_visa_event_key(db: Session, key: str) -> None:
    if type(key) is not str or not 8 <= len(key) <= 255 or not key.strip():
        raise VisaEventGuardBlocked("VISA_EVENT_KEY_INVALID")
    if db.get_bind().dialect.name == "postgresql":
        # Same namespace as entry/extension reports sharing the global index.
        number = int.from_bytes(hashlib.sha256(("visa-stay-event:" + key).encode()).digest()[:8], "big") & ((1 << 63) - 1)
        if not db.execute(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": number}).scalar_one():
            raise VisaEventGuardBlocked("VISA_EVENT_BUSY_RETRY_SAME_REQUEST")


def visa_request_fingerprint(request: dict) -> str:
    if type(request) is not dict:
        raise VisaEventGuardBlocked("VISA_EVENT_REQUEST_INVALID")
    encoded = json.dumps(request, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode()).hexdigest()


def exact_visa_event_replay(db: Session, *, key: str, case_id: int,
                           actor_user_id: int, source: str, event_type: str,
                           fingerprint: str) -> bool:
    event = db.query(VisaEvent).filter(VisaEvent.idempotency_key == key).first()
    if event is None:
        return False
    if (event.visa_case_id != case_id or event.actor_user_id != actor_user_id
            or event.source != source or event.event_type != event_type
            or not isinstance(event.after, dict)
            or event.after.get("request_fingerprint") != fingerprint):
        # Historical events lacking a bound request are never silently accepted.
        raise VisaEventGuardBlocked("VISA_EVENT_KEY_CONFLICT")
    return True
