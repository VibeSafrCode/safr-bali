"""Transaction-bound client reports, never official extension confirmations.

Callers own a fresh transaction and must roll it back on any exception. Row/key
locks and CAS serialize writers on PostgreSQL; SQLite is only a logic fixture.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaEvent
from app.services.visa_stay import StayRuleError, validate_entry_report
from app.services.visa_stay_estimates import ENTRY_ESTIMATE_EVENT, prepare_entry_calculation


class StayActionBlocked(RuntimeError):
    def __init__(self, code: str, status_code: int = 409):
        super().__init__(code)
        self.code, self.status_code = code, status_code


def bali_today() -> date:
    return datetime.now(ZoneInfo("Asia/Makassar")).date()


def _lock_request(db: Session, key: str) -> None:
    if db.get_bind().dialect.name == "postgresql":
        # One namespace for every new action sharing the global event-key index.
        number = int.from_bytes(hashlib.sha256(("visa-stay-event:" + key).encode()).digest()[:8], "big") & ((1 << 63) - 1)
        if not db.execute(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": number}).scalar_one():
            raise StayActionBlocked("STAY_ACTION_BUSY_RETRY_SAME_REQUEST")


def _begin(db: Session, *, case_id: int, actor_user_id: int, source: str,
           key: str, event_type: str, request: dict) -> tuple[VisaCase, bool]:
    if type(source) is not str or source not in {"account", "mini_app", "telegram"}:
        raise StayActionBlocked("STAY_REPORT_SOURCE_INVALID", 422)
    if any(type(value) is not int or value < 1 for value in (case_id, actor_user_id, request.get("expected_version"))):
        raise StayActionBlocked("STAY_ID_AND_VERSION_REQUIRED", 422)
    if type(key) is not str or not 8 <= len(key) <= 255 or not key.strip():
        raise StayActionBlocked("STAY_REQUEST_KEY_INVALID", 422)
    _lock_request(db, key)
    actor = db.query(User).filter(User.id == actor_user_id).populate_existing().with_for_update(nowait=True).first()
    if actor is None or actor.status != "active":
        raise StayActionBlocked("VISA_CASE_NOT_FOUND", 404)
    row = db.query(VisaCase).filter(
        VisaCase.id == case_id, VisaCase.user_id == actor_user_id,
        VisaCase.publication_status == "PUBLISHED",
    ).populate_existing().with_for_update(nowait=True).first()
    if row is None:
        raise StayActionBlocked("VISA_CASE_NOT_FOUND", 404)
    existing = db.query(VisaEvent).filter(VisaEvent.idempotency_key == key).first()
    if existing:
        if (existing.visa_case_id != row.id or existing.actor_user_id != actor_user_id
                or existing.source != source or existing.event_type != event_type
                or not isinstance(existing.after, dict) or existing.after.get("request") != request):
            raise StayActionBlocked("STAY_REQUEST_KEY_CONFLICT")
        return row, True
    if row.version != request["expected_version"]:
        raise StayActionBlocked("STAY_CASE_VERSION_CHANGED")
    return row, False


def _persist(db: Session, row: VisaCase, *, actor_user_id: int, source: str,
             key: str, event_type: str, request: dict, changes: dict, report: dict) -> tuple[VisaCase, VisaEvent]:
    before = {"version": row.version, "entered_on": row.entered_on.isoformat() if row.entered_on else None,
              "lifecycle_status": row.lifecycle_status}
    changed = db.query(VisaCase).filter(
        VisaCase.id == row.id, VisaCase.user_id == actor_user_id,
        VisaCase.publication_status == "PUBLISHED", VisaCase.version == request["expected_version"],
    ).update({**changes, "version": row.version + 1, "updated_at": datetime.now(timezone.utc)}, synchronize_session=False)
    if changed != 1:
        raise StayActionBlocked("STAY_CASE_VERSION_CHANGED")
    # Do not use append_event's existence-only replay: a unique race must roll
    # back the entire case mutation, not return an unrelated historical event.
    event = VisaEvent(visa_case_id=row.id, actor_user_id=actor_user_id, source=source,
                     event_type=event_type, idempotency_key=key, visibility="INTERNAL",
                     before=before, after={"request": request, **report})
    db.add(event)
    db.flush()
    db.refresh(row)
    return row, event


def record_client_entry(db: Session, *, case_id: int, actor_user_id: int, source: str,
                        key: str, expected_version: int, entered_on: date) -> tuple[VisaCase, bool]:
    if type(entered_on) is not date:
        raise StayActionBlocked("STAY_DATE_ONLY_REQUIRED", 422)
    request = {"expected_version": expected_version, "entered_on": entered_on.isoformat()}
    row, replay = _begin(db, case_id=case_id, actor_user_id=actor_user_id, source=source,
                         key=key, event_type="CLIENT_ENTRY_RECORDED", request=request)
    if replay:
        return row, True
    try:
        validate_entry_report(entered_on=entered_on, today=bali_today(), lifecycle_status=row.lifecycle_status,
                              issued_on=row.issued_on, entry_deadline=row.entry_deadline,
                              current_stay_end=row.stay_end, existing_entered_on=row.entered_on)
    except StayRuleError as error:
        raise StayActionBlocked("STAY_ENTRY_REQUIRES_MANAGER_REVIEW", 422) from error
    if row.entered_on is not None:
        raise StayActionBlocked("STAY_ENTRY_ALREADY_RECORDED")
    calculation = prepare_entry_calculation(db, row, entered_on)
    row, event = _persist(db, row, actor_user_id=actor_user_id, source=source, key=key,
                   event_type="CLIENT_ENTRY_RECORDED", request=request, changes={"entered_on": entered_on},
                   report={"entered_on": entered_on.isoformat(), "provenance": "client_report"})
    if calculation is not None:
        db.add(VisaEvent(visa_case_id=row.id, actor_user_id=actor_user_id, source=source,
                        event_type=ENTRY_ESTIMATE_EVENT, visibility="INTERNAL",
                        after={**calculation, "entry_event_id": event.id}))
        db.flush()
    return row, False


def record_client_extension_report(db: Session, *, case_id: int, actor_user_id: int, source: str,
                                   key: str, expected_version: int, kind: str,
                                   reported_on: date, reported_stay_end: date | None) -> tuple[VisaCase, bool]:
    if type(reported_on) is not date or (reported_stay_end is not None and type(reported_stay_end) is not date):
        raise StayActionBlocked("STAY_DATE_ONLY_REQUIRED", 422)
    if type(kind) is not str or kind not in {"APPLIED", "RECEIVED"}:
        raise StayActionBlocked("STAY_EXTENSION_REPORT_KIND_INVALID", 422)
    report = {"kind": kind, "reported_on": reported_on.isoformat(),
              "reported_stay_end": reported_stay_end.isoformat() if reported_stay_end else None}
    request = {"expected_version": expected_version, **report}
    row, replay = _begin(db, case_id=case_id, actor_user_id=actor_user_id, source=source,
                         key=key, event_type="CLIENT_EXTENSION_REPORTED", request=request)
    if replay:
        return row, True
    if row.lifecycle_status not in {"ISSUED_NOT_ACTIVATED", "ACTIVE", "EXPIRING", "EXTENSION_PROCESSING", "EXTENDED", "EXPIRED"}:
        raise StayActionBlocked("STAY_EXTENSION_REQUIRES_MANAGER_REVIEW", 422)
    if reported_on > bali_today() or (row.issued_on and reported_on < row.issued_on):
        raise StayActionBlocked("STAY_EXTENSION_REPORT_DATE_INVALID", 422)
    if reported_stay_end and (reported_stay_end <= reported_on or (row.stay_end and reported_stay_end <= row.stay_end)):
        raise StayActionBlocked("STAY_REPORTED_EXPIRY_INVALID", 422)
    identity = hashlib.sha256(json.dumps(report, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if db.query(VisaEvent.id).filter(
        VisaEvent.visa_case_id == row.id, VisaEvent.event_type == "CLIENT_EXTENSION_REPORTED",
        VisaEvent.after["report_identity"].as_string() == identity,
    ).first():
        raise StayActionBlocked("STAY_EXTENSION_REPORT_ALREADY_RECORDED")
    row, _ = _persist(db, row, actor_user_id=actor_user_id, source=source, key=key,
                   event_type="CLIENT_EXTENSION_REPORTED", request=request, changes={},
                   report={"report": report, "report_identity": identity, "provenance": "client_report"})
    return row, False


def validated_staff_stay_marker(event: VisaEvent) -> dict:
    """Validate a present append-only staff marker; malformed is not absent.

    Shared by write-time duplicate protection and the safe client projection.
    It never accepts a truthy string/bool ID or repairs a historical marker.
    """
    value = event.after.get("stay_action") if isinstance(event.after, dict) else None
    if (not isinstance(value, dict) or event.source != "admin" or event.visibility != "INTERNAL"
            or type(event.actor_user_id) is not int or event.actor_user_id < 1
            or value.get("provenance") != "staff_confirmed"
            or type(value.get("source_reference")) is not str
            or not 3 <= len(value["source_reference"].strip()) <= 2000):
        raise ValueError("Invalid staff stay marker")
    def valid_date(raw):
        if type(raw) is not str or len(raw) != 10: return False
        try: return date.fromisoformat(raw).isoformat() == raw
        except ValueError: return False
    if value.get("kind") == "CONFIRM_ENTRY":
        if (set(value) != {"kind", "entered_on", "source_reference", "provenance"}
                or not valid_date(value["entered_on"]) or event.after.get("entered_on") != value["entered_on"]):
            raise ValueError("Invalid staff entry marker")
    elif value.get("kind") == "CONFIRM_EXTENSION":
        if (set(value) != {"kind", "process_id", "document_stay_end", "source_reference", "clear_expected_stay_end",
                           "previous_stay_end", "previous_extensions_used", "extensions_used", "provenance"}
                or type(value.get("process_id")) is not int or value["process_id"] < 1
                or type(value.get("clear_expected_stay_end")) is not bool
                or not valid_date(value.get("previous_stay_end")) or not valid_date(value.get("document_stay_end"))
                or value["document_stay_end"] <= value["previous_stay_end"]
                or type(value.get("previous_extensions_used")) is not int or value["previous_extensions_used"] < 0
                or type(value.get("extensions_used")) is not int or value["extensions_used"] != value["previous_extensions_used"] + 1
                or not isinstance(event.before, dict) or event.before.get("stay_end") != value["previous_stay_end"]
                or type(event.before.get("extensions_used")) is not int or event.before["extensions_used"] != value["previous_extensions_used"]
                or event.after.get("stay_end") != value["document_stay_end"]
                or type(event.after.get("extensions_used")) is not int or event.after["extensions_used"] != value["extensions_used"]):
            raise ValueError("Invalid staff extension marker")
    else:
        raise ValueError("Invalid staff stay action kind")
    return value


def client_stay_report_projection(db: Session, row: VisaCase) -> dict:
    """Exact safe fields only: no source text, request keys, actor or notes."""
    entry = db.query(VisaEvent).filter(VisaEvent.visa_case_id == row.id,
                                      VisaEvent.event_type == "CLIENT_ENTRY_RECORDED").order_by(VisaEvent.id.desc()).first()
    after = entry.after if entry and isinstance(entry.after, dict) else {}
    provenance = "client_report" if row.entered_on and after.get("provenance") == "client_report" and after.get("entered_on") == row.entered_on.isoformat() else "legacy_unknown" if row.entered_on else None
    staff = db.query(VisaEvent).filter(VisaEvent.visa_case_id == row.id,
                                      VisaEvent.event_type == "CASE_UPDATED").order_by(VisaEvent.id.desc()).all()
    # An explicit, newer staff entry confirmation supersedes (but never erases)
    # the original client report. Internal evidence/actor/reason stay private.
    for candidate in staff:
        if not isinstance(candidate.after, dict) or "stay_action" not in candidate.after:
            continue
        try: marker = validated_staff_stay_marker(candidate)
        except ValueError:
            provenance = "legacy_unknown" if row.entered_on else None
            break
        if marker["kind"] != "CONFIRM_ENTRY": continue
        if (row.entered_on and candidate.source == "admin" and candidate.visibility == "INTERNAL"
                and candidate.actor_user_id is not None and marker.get("provenance") == "staff_confirmed"
                and marker.get("entered_on") == row.entered_on.isoformat()
                and (entry is None or candidate.id > entry.id)):
            provenance = "staff_confirmed"
        break
    event = db.query(VisaEvent).filter(VisaEvent.visa_case_id == row.id,
                                      VisaEvent.event_type == "CLIENT_EXTENSION_REPORTED").order_by(VisaEvent.id.desc()).first()
    data = event.after if event and isinstance(event.after, dict) else {}
    report = data.get("report")
    extension = None
    def safe_date(value, *, optional=False):
        if optional and value is None:
            return True
        if type(value) is not str or len(value) != 10:
            return False
        try:
            return date.fromisoformat(value).isoformat() == value
        except ValueError:
            return False
    if (isinstance(report, dict) and type(report.get("kind")) is str
            and report["kind"] in {"APPLIED", "RECEIVED"} and data.get("provenance") == "client_report"
            and safe_date(report.get("reported_on")) and safe_date(report.get("reported_stay_end"), optional=True)):
        extension = {"kind": report["kind"], "reported_on": report.get("reported_on"),
                     "reported_stay_end": report.get("reported_stay_end"), "provenance": "client_report",
                     "verified": False}
    return {"entry_provenance": provenance, "extension": extension}
