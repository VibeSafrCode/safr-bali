"""Versioned policy and bounded backend scheduling; the bot only delivers claims."""
from datetime import date, datetime, time, timedelta, timezone
import secrets
from zoneinfo import ZoneInfo

from sqlalchemy import and_, exists, func, or_, text, update
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.models.admin_action import AdminAction
from app.models.admin_safety import BusinessSettingVersion
from app.models.life_services import LifeService
from app.models.service_reminders import ServiceExpiryDelivery as Delivery
from app.models.user import User
from app.models.visa_lifecycle import VisaCase
from app.schemas.service_reminders import ReminderPolicy
from app.services.visa_lifecycle import TERMINAL_LIFECYCLE_STATUSES
from app.services.visa_notifications import visa_display_name


ENTITY = {"entity_type": "notification", "entity_key": "service_expiry"}
POLICY_LOCK = 7_409_291
MATERIALIZER_LOCK = 7_409_292


class ReminderConflict(ValueError):
    pass


def utc(value=None):
    value = value or datetime.now(timezone.utc)
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def current_policy(db):
    row = db.query(BusinessSettingVersion).filter_by(**ENTITY, is_active=True).first()
    return (row.version, ReminderPolicy.model_validate(row.payload)) if row else (0, ReminderPolicy())


def policy_projection(db):
    version, policy = current_policy(db)
    rows = db.query(BusinessSettingVersion).filter_by(**ENTITY).order_by(BusinessSettingVersion.version.desc()).all()
    return {"version": version, "policy": policy.model_dump(), "versions": [
        {"version": row.version, "created_at": row.created_at, "reason": row.reason,
         "policy": ReminderPolicy.model_validate(row.payload).model_dump()} for row in rows]}


def change_policy(db, *, expected_version, policy, reason, actor, restored_from=None):
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": POLICY_LOCK})
    actual, before = current_policy(db)
    if actual != expected_version:
        raise ReminderConflict("Reminder policy changed; reload before saving")
    if actual:
        changed = db.execute(update(BusinessSettingVersion).where(
            BusinessSettingVersion.entity_type == ENTITY["entity_type"],
            BusinessSettingVersion.entity_key == ENTITY["entity_key"],
            BusinessSettingVersion.version == actual,
            BusinessSettingVersion.is_active.is_(True),
        ).values(is_active=False).execution_options(synchronize_session=False))
        if changed.rowcount != 1:
            raise ReminderConflict("Reminder policy changed; reload before saving")
    row = BusinessSettingVersion(**ENTITY, version=actual + 1, is_active=True,
        payload=policy.model_dump(), effective_from=utc(), created_by_admin_id=actor.id, reason=reason)
    db.add(row)
    try:
        db.flush()
    except IntegrityError as exc:
        raise ReminderConflict("Reminder policy changed; reload before saving") from exc
    db.add(AdminAction(admin_user_id=actor.id, action_type="SERVICE_REMINDER_POLICY_RESTORED" if restored_from else "SERVICE_REMINDER_POLICY_CHANGED",
        entity_type="service_reminder_policy", entity_id=row.id, comment=reason,
        details={"version": row.version, "before": before.model_dump(), "after": policy.model_dump(),
                 "restored_from_version": restored_from}))
    if not policy.enabled:
        db.query(Delivery).filter_by(state="PENDING").update(
            {"state": "SUPPRESSED", "error_code": "policy_disabled", "updated_at": utc()}, synchronize_session=False)
    db.flush()
    return row


def schedule(policy, *, start_date, end_date, monthly=False):
    if end_date is None:
        return [], None, "monthly_end_missing" if monthly else "end_date_missing"
    term = (end_date - start_date).days if start_date is not None else None
    if term is not None and term < 0:
        return [], term, "date_order_invalid"
    if monthly:
        return policy.short_offsets, term, "monthly_explicit_end"
    if term is None:
        return policy.short_offsets, None, "start_date_missing_short_schedule"
    if term > policy.long_term_threshold_days:
        return policy.long_offsets, term, "long_term"
    return policy.short_offsets, term, "short_term"


def preview(policy):
    today = date(2030, 1, 1)
    examples = []
    for kind, label, term, remaining, monthly in (
        ("visa", "Visa above the long-term threshold", policy.long_term_threshold_days + 1, 40, False),
        ("housing", "Fixed rental at the threshold", policy.long_term_threshold_days, 15, False),
        ("bike", "10-day fixed rental", 10, 7, False),
        ("bike", "Monthly rental with an end date", 365, 15, True),
        ("insurance", "Insurance without a start date", None, 15, False),
        ("housing", "Monthly rental without an end date", None, None, True),
    ):
        end = today + timedelta(days=remaining) if remaining is not None else None
        start = end - timedelta(days=term) if end and term is not None else None
        offsets, full_term, reason = schedule(policy, start_date=start, end_date=end, monthly=monthly)
        offsets = [offset for offset in offsets if full_term is None or offset <= full_term]
        examples.append({"kind": kind, "label": label, "term_days": full_term,
                         "days_remaining": remaining, "monthly": monthly, "schedule": offsets, "reason": reason})
    return {"valid": True, "examples": examples}


def suppress_pending(db, *, visa_case_id=None, life_service_id=None, reason="notifications_disabled"):
    scope = Delivery.visa_case_id == visa_case_id if visa_case_id is not None else Delivery.life_service_id == life_service_id
    if visa_case_id is None and life_service_id is None:
        raise ValueError("A reminder source is required")
    db.query(Delivery).filter(scope, Delivery.state == "PENDING").update(
        {"state": "SUPPRESSED", "error_code": reason, "updated_at": utc()}, synchronize_session=False)


def _visa_enabled():
    return settings.VISA_LIFECYCLE_ENABLED and settings.CLIENT_CABINET_ENABLED and settings.ADMIN_CLIENT_CRM_ENABLED


def _dates(source):
    if isinstance(source, VisaCase):
        return source.entered_on, source.stay_end, False
    return source.start_date, source.end_date, source.rental_mode == "monthly"


def _payload(db, source, offset, reason):
    return {"kind": "visa" if isinstance(source, VisaCase) else source.kind,
            "title": visa_display_name(db, source) if isinstance(source, VisaCase) else source.title,
            "end_date": _dates(source)[1].isoformat(), "days_remaining": offset,
            "schedule_reason": reason}


def materialize(db, *, policy, policy_version, now, limit=200):
    """Exclude existing keys in SQL so the first page can never starve later rows."""
    if not policy.enabled:
        return 0
    today = now.astimezone(ZoneInfo(policy.timezone)).date()
    due = datetime.combine(today, time.min, ZoneInfo(policy.timezone)).astimezone(timezone.utc)
    created = 0
    # Each source receives an independent bounded share of every poll.
    for model, source_column in ((LifeService, Delivery.life_service_id), (VisaCase, Delivery.visa_case_id)):
        if model is VisaCase and not _visa_enabled():
            continue
        start = model.entered_on if model is VisaCase else model.start_date
        end = model.stay_end if model is VisaCase else model.end_date
        duration = func.julianday(end) - func.julianday(start) if db.get_bind().dialect.name == "sqlite" else end - start
        long_term = and_(start.is_not(None), duration > policy.long_term_threshold_days)
        if model is LifeService:
            long_term = and_(long_term, model.rental_mode != "monthly")
        short_term = or_(start.is_(None), duration <= policy.long_term_threshold_days)
        if model is LifeService:
            short_term = or_(short_term, model.rental_mode == "monthly")
        clauses = []
        for offset in sorted(set(policy.long_offsets + policy.short_offsets), reverse=True):
            matching_schedule = or_(long_term if offset in policy.long_offsets else False,
                                    short_term if offset in policy.short_offsets else False)
            previous = exists().where(source_column == model.id, Delivery.end_date == end,
                Delivery.offset_days == offset, Delivery.recipient_user_id == model.user_id)
            clauses.append(and_(end == today + timedelta(days=offset), matching_schedule, ~previous))
        query = db.query(model).join(User, User.id == model.user_id).filter(
            model.publication_status == "PUBLISHED", User.status == "active", or_(*clauses),
            or_(start.is_(None), start <= today))
        if model is VisaCase:
            query = query.filter(model.lifecycle_status.notin_(TERMINAL_LIFECYCLE_STATUSES),
                model.dates_confirmed_by.is_not(None), model.dates_confirmed_at.is_not(None),
                model.date_source.is_not(None), model.date_source != "")
        rows = query.order_by(model.id).with_for_update(skip_locked=True, of=model).limit(max(1, min(limit, 1000))).all()
        for source in rows:
            start_date, end_date, monthly = _dates(source)
            offsets, _, reason = schedule(policy, start_date=start_date, end_date=end_date, monthly=monthly)
            offset = (end_date - today).days
            if offset not in offsets:
                continue
            namespace = "visa" if model is VisaCase else "life"
            state = "PENDING" if source.notifications_enabled else "SUPPRESSED"
            row = Delivery(**{"visa_case_id" if model is VisaCase else "life_service_id": source.id},
                recipient_user_id=source.user_id, end_date=end_date, offset_days=offset,
                policy_version=policy_version, dedupe_key=f"{namespace}:{source.id}:{end_date}:{offset}:{source.user_id}",
                state=state, due_at=due, payload=_payload(db, source, offset, reason),
                error_code=None if state == "PENDING" else "notifications_disabled")
            try:
                with db.begin_nested():
                    db.add(row)
                    db.flush()
                created += 1
            except IntegrityError:
                # The unique ledger key is the final concurrency guard.
                if not db.query(Delivery.id).filter_by(dedupe_key=row.dedupe_key).first():
                    raise
    return created


def _valid_source(db, row, policy, today):
    if not policy.enabled:
        return None, None, "policy_disabled"
    model, source_id = (VisaCase, row.visa_case_id) if row.visa_case_id is not None else (LifeService, row.life_service_id)
    source = db.query(model).filter(model.id == source_id).with_for_update().first()
    if source is None or source.user_id != row.recipient_user_id:
        return None, None, "source_owner_changed"
    user = db.query(User).filter(User.id == row.recipient_user_id).with_for_update().first()
    if user is None or user.status != "active" or user.bot_status == "blocked":
        return None, None, "client_inactive"
    if source.publication_status != "PUBLISHED":
        return None, None, "source_not_published"
    if not source.notifications_enabled:
        return None, None, "notifications_disabled"
    if model is VisaCase and (not _visa_enabled() or source.lifecycle_status in TERMINAL_LIFECYCLE_STATUSES
            or not source.date_source or not source.dates_confirmed_by or not source.dates_confirmed_at):
        return None, None, "visa_not_active_or_confirmed"
    start, end, monthly = _dates(source)
    if end != row.end_date or (end - today).days != row.offset_days:
        return None, None, "expiry_date_or_day_changed"
    if start is not None and start > today:
        return None, None, "service_not_started"
    offsets, _, reason = schedule(policy, start_date=start, end_date=end, monthly=monthly)
    if row.offset_days not in offsets:
        return None, None, "schedule_changed"
    return source, user, reason


def claim(db, *, now=None, limit=1, materialize_limit=200):
    current = utc(now)
    if db.get_bind().dialect.name == "postgresql":
        acquired = db.execute(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": MATERIALIZER_LOCK}).scalar_one()
        if not acquired:
            return []
        # Serialize policy changes with materialization and claim validation.
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": POLICY_LOCK})
    version, policy = current_policy(db)
    expired = db.query(Delivery).filter(Delivery.state == "CLAIMED",
        or_(Delivery.lease_expires_at.is_(None), Delivery.lease_expires_at <= current)).order_by(Delivery.id).with_for_update(skip_locked=True).limit(200).all()
    for row in expired:
        row.state, row.error_code = "UNKNOWN", "ambiguous_delivery_outcome"
        row.lease_token = row.lease_expires_at = None
        row.updated_at = current
    materialize(db, policy=policy, policy_version=version, now=current, limit=materialize_limit)
    today = current.astimezone(ZoneInfo(policy.timezone)).date()
    result = []
    pending = db.query(Delivery).filter(Delivery.state == "PENDING", Delivery.due_at <= current).order_by(
        Delivery.due_at, Delivery.id).limit(200).all()
    for row in pending:
        source, user, reason = _valid_source(db, row, policy, today)
        # Client consent mutations lock their source before suppressing queue
        # rows. Keep that lock order here too, then recheck the delivery state.
        row = db.query(Delivery).filter_by(id=row.id, state="PENDING").with_for_update().populate_existing().first()
        if row is None:
            continue
        row.updated_at = current
        if source is None:
            row.state, row.error_code = "SUPPRESSED", reason
            continue
        row.state, row.lease_token = "CLAIMED", secrets.token_hex(16)
        row.lease_expires_at = current + timedelta(minutes=2)
        row.attempts += 1
        row.payload = _payload(db, source, row.offset_days, reason)
        result.append({"id": row.id, "lease_token": row.lease_token, "telegram_id": user.telegram_id,
                       "locale": user.locale if user.locale in {"ru", "en"} else "ru", "payload": row.payload})
        if len(result) >= max(1, min(limit, 5)):
            break
    db.flush()
    return result


def settle(db, delivery_id, payload, *, now=None):
    row = db.query(Delivery).filter_by(id=delivery_id).with_for_update().first()
    if row is None or row.lease_token != payload.lease_token:
        raise ReminderConflict("Delivery lease is stale")
    if row.state == payload.state and row.telegram_message_id == payload.telegram_message_id and row.error_code == payload.error_code:
        return row  # Only acknowledgement replay is idempotent; never another send.
    if row.state != "CLAIMED":
        raise ReminderConflict("Delivery has already been settled")
    current = utc(now)
    row.state, row.telegram_message_id, row.error_code = payload.state, payload.telegram_message_id, payload.error_code
    row.delivered_at = current if payload.state == "DELIVERED" else None
    row.lease_expires_at = None
    row.updated_at = current
    db.flush()
    return row
