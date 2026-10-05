"""Consent-bound, bounded analytics with atomic dedupe/aggregate updates.

No generic payload, URL, IP, CRM user ID or free-text column is exposed here.
The caller owns the transaction. Never run retention implicitly during requests.
"""
import calendar
import hashlib
import json
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.models.admin_action import AdminAction
from app.models.analytics import AnalyticsAccessGrant, AnalyticsConsent, AnalyticsDailyAggregate, AnalyticsEvent, AnalyticsPolicy
from app.models.user import User
from app.schemas.analytics import AnalyticsBatch, AnalyticsGrantInput, AnalyticsPolicyInput
from app.services.visa_staff import is_root_admin


RAW_RETENTION_MONTHS = 13
AGGREGATE_RETENTION_MONTHS = 36
CONSENT_TTL_DAYS = 180
EVENTS_PER_MINUTE = 120
EVENTS_PER_DAY = 1500
PUBLIC_EVENTS = frozenset({"page_view", "country_select", "service_select", "language_select", "cta_click",
                          "form_start", "form_submit", "channel_click", "funnel_stage"})
DIMENSIONS = ("event_name", "content_id", "service_id", "country", "locale", "source", "campaign_code",
              "device", "browser", "channel", "funnel_stage", "currency")
SAFE_ID = re.compile(r"^[a-z0-9][a-zA-Z0-9._-]{0,127}$")


class AnalyticsBlocked(ValueError):
    def __init__(self, code: str, status: int = 409):
        super().__init__(code)
        self.status = status


def utc(value=None):
    value = value or datetime.now(timezone.utc)
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def subtract_months(value, months):
    """Calendar months (not an inaccurate 390/1095-day retention approximation)."""
    year, month = divmod(value.year * 12 + value.month - 1 - months, 12)
    month += 1
    return value.replace(year=year, month=month, day=min(value.day, calendar.monthrange(year, month)[1]))


def _hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _insert(db, model):
    name = db.get_bind().dialect.name
    if name == "postgresql":
        return pg_insert(model)
    if name == "sqlite":
        return sqlite_insert(model)
    raise AnalyticsBlocked("unsupported_analytics_database", 503)


def policy_projection(db):
    row = db.get(AnalyticsPolicy, 1)
    return {"enabled": bool(row and row.enabled and row.privacy_notice_version),
            "policy_revision": row.revision if row else 0,
            "privacy_notice_version": row.privacy_notice_version if row else None,
            "privacy_notice_path": "/privacy/", "consent_required": True,
            "raw_retention_months": RAW_RETENTION_MONTHS,
            "aggregate_retention_months": AGGREGATE_RETENTION_MONTHS,
            "cookie_ttl_days": CONSENT_TTL_DAYS}


def _active_policy(db):
    row = db.query(AnalyticsPolicy).filter_by(id=1).with_for_update().first()
    if not row or not row.enabled or not row.privacy_notice_version:
        raise AnalyticsBlocked("analytics_disabled_privacy_gate", 503)
    return row


def has_consent(db, token, now=None):
    policy = db.get(AnalyticsPolicy, 1)
    if not policy or not policy.enabled or not policy.privacy_notice_version or not token or len(token)>128:
        return False
    receipt=db.query(AnalyticsConsent).filter_by(token_hash=_hash(token)).first()
    return bool(receipt and receipt.revoked_at is None and receipt.policy_revision==policy.revision and utc(receipt.expires_at)>utc(now))


def change_policy(db, payload: AnalyticsPolicyInput, actor, now=None):
    if not is_root_admin(actor):
        raise AnalyticsBlocked("owner_required", 403)
    now = utc(now)
    row = db.query(AnalyticsPolicy).filter_by(id=1).with_for_update().first()
    if row is None:
        raise AnalyticsBlocked("analytics_schema_policy_missing", 503)
    if row.revision != payload.expected_revision:
        raise AnalyticsBlocked("analytics_policy_changed")
    if payload.enabled and not payload.consent_ui_verified:
        raise AnalyticsBlocked("consent_ui_and_privacy_notice_required", 422)
    for values in (payload.allowed_content_ids, payload.allowed_service_ids, payload.allowed_campaign_codes):
        if len(values) != len(set(values)) or any(not SAFE_ID.fullmatch(item) for item in values):
            raise AnalyticsBlocked("invalid_analytics_allowlist", 422)
    row.revision += 1
    row.enabled = payload.enabled
    row.privacy_notice_version = payload.privacy_notice_version
    row.allowed_content_ids = payload.allowed_content_ids
    row.allowed_service_ids = payload.allowed_service_ids
    row.allowed_campaign_codes = payload.allowed_campaign_codes
    row.updated_at = now
    db.add(AdminAction(admin_user_id=actor.id, action_type="analytics_policy_changed", entity_type="analytics_policy",
                       entity_id=1, details={"revision": row.revision, "enabled": row.enabled,
                                             "privacy_notice_version": row.privacy_notice_version}))
    db.flush()
    return policy_projection(db)


def grant_consent(db, policy_revision: int, old_token=None, now=None):
    now = utc(now)
    policy = _active_policy(db)
    if policy.revision != policy_revision:
        raise AnalyticsBlocked("analytics_policy_changed")
    if old_token:
        old = db.query(AnalyticsConsent).filter_by(token_hash=_hash(old_token)).with_for_update().first()
        if old and old.revoked_at is None:
            old.revoked_at = now
    token = secrets.token_urlsafe(32)
    row = AnalyticsConsent(token_hash=_hash(token), session_key=secrets.token_hex(16),
                           policy_revision=policy.revision, granted_at=now,
                           expires_at=now + timedelta(days=CONSENT_TTL_DAYS))
    db.add(row)
    db.flush()
    return token


def revoke_consent(db, token, now=None):
    if token:
        row = db.query(AnalyticsConsent).filter_by(token_hash=_hash(token)).with_for_update().first()
        if row and row.revoked_at is None:
            row.revoked_at = utc(now)
    # Revocation stops future capture. It is not an implicit CRM/account delete.


def ingest(db, payload: AnalyticsBatch, token, *, trusted=False, now=None):
    now = utc(now)
    policy = _active_policy(db)
    if not token or len(token) > 128:
        raise AnalyticsBlocked("analytics_consent_required", 403)
    consent = db.query(AnalyticsConsent).filter_by(token_hash=_hash(token)).with_for_update().first()
    if (not consent or consent.revoked_at is not None or utc(consent.expires_at) <= now
            or consent.policy_revision != policy.revision):
        raise AnalyticsBlocked("analytics_consent_required", 403)
    if len({item.event_key for item in payload.events}) != len(payload.events):
        raise AnalyticsBlocked("duplicate_event_keys_in_batch", 422)
    # Validate the entire batch before mutation; string patterns alone cannot
    # prevent a client placing a sensitive value inside a syntactically valid ID.
    for item in payload.events:
        if not trusted and item.event_name not in PUBLIC_EVENTS:
            raise AnalyticsBlocked("trusted_event_source_required", 403)
        for value, values in ((item.content_id, policy.allowed_content_ids), (item.service_id, policy.allowed_service_ids),
                              (item.campaign_code, policy.allowed_campaign_codes)):
            if value is not None and value not in values:
                raise AnalyticsBlocked("analytics_identifier_not_allowlisted", 422)
        if item.event_name in {"service_select", "lead_created", "order_created", "payment_success"} and not item.service_id:
            raise AnalyticsBlocked("analytics_service_required", 422)
    recent = db.query(func.count(AnalyticsEvent.id)).filter(AnalyticsEvent.session_key == consent.session_key,
                                                          AnalyticsEvent.received_at >= now - timedelta(minutes=1)).scalar()
    daily = db.query(func.count(AnalyticsEvent.id)).filter(AnalyticsEvent.session_key == consent.session_key,
                                                         AnalyticsEvent.received_at >= now - timedelta(days=1)).scalar()
    known_keys = set(db.scalars(select(AnalyticsEvent.event_key).where(
        AnalyticsEvent.event_key.in_([str(item.event_key) for item in payload.events]))))
    new_count = sum(str(item.event_key) not in known_keys for item in payload.events)
    if recent + new_count > EVENTS_PER_MINUTE or daily + new_count > EVENTS_PER_DAY:
        raise AnalyticsBlocked("analytics_capture_rate_exceeded", 429)
    accepted = replayed = 0
    for item in payload.events:
        values = item.model_dump(mode="json")
        values["session_key"] = consent.session_key
        fingerprint = _hash(_canonical(values))
        values["amount"] = item.amount
        values.update(fingerprint=fingerprint, received_at=now)
        inserted = db.execute(_insert(db, AnalyticsEvent).values(**values).on_conflict_do_nothing(
            index_elements=["event_key"]).returning(AnalyticsEvent.id)).scalar_one_or_none()
        if inserted is None:
            previous = db.query(AnalyticsEvent).filter_by(event_key=str(item.event_key)).one()
            if previous.fingerprint != fingerprint:
                raise AnalyticsBlocked("analytics_event_key_conflict")
            replayed += 1
            continue
        dimensions = {name: getattr(item, name) for name in DIMENSIONS}
        key = _hash(_canonical(dimensions))
        aggregate = _insert(db, AnalyticsDailyAggregate).values(
            day=now.date(), dimension_key=key, **dimensions, event_count=1, amount_total=item.amount or Decimal(0))
        db.execute(aggregate.on_conflict_do_update(index_elements=["day", "dimension_key"], set_={
            "event_count": AnalyticsDailyAggregate.event_count + 1,
            "amount_total": AnalyticsDailyAggregate.amount_total + (item.amount or Decimal(0))}))
        accepted += 1
    db.flush()
    return {"accepted": accepted, "replayed": replayed, "policy_revision": policy.revision}


def set_access(db, payload: AnalyticsGrantInput, actor, now=None):
    if not is_root_admin(actor):
        raise AnalyticsBlocked("owner_required", 403)
    target = db.get(User, payload.user_id)
    if target is None or target.status != "active":
        raise AnalyticsBlocked("active_staff_required", 422)
    policy = db.get(AnalyticsPolicy, 1)
    if any(value not in (policy.allowed_service_ids if policy else []) for value in payload.allowed_service_ids):
        raise AnalyticsBlocked("analytics_service_scope_not_allowlisted", 422)
    if payload.capability == "aggregate" and payload.active and not payload.allowed_service_ids:
        raise AnalyticsBlocked("explicit_service_scope_required", 422)
    row = db.query(AnalyticsAccessGrant).filter_by(user_id=target.id, capability=payload.capability).with_for_update().first()
    now = utc(now)
    if row is None:
        row = AnalyticsAccessGrant(user_id=target.id, capability=payload.capability,
                                   granted_by_admin_id=actor.id, granted_at=now)
        db.add(row)
    row.allowed_service_ids = list(dict.fromkeys(payload.allowed_service_ids))
    row.granted_by_admin_id = actor.id
    row.granted_at = now
    row.revoked_at = None if payload.active else now
    db.add(AdminAction(admin_user_id=actor.id, action_type="analytics_access_changed", entity_type="analytics_access",
                       entity_id=target.id, details={"capability": payload.capability, "active": payload.active,
                                                   "allowed_service_ids": row.allowed_service_ids}))
    db.flush()
    return {"capability": row.capability, "active": row.revoked_at is None, "allowed_service_ids": row.allowed_service_ids}


def _access(db, actor, capability):
    if actor.status != "active":
        raise AnalyticsBlocked("analytics_access_denied", 403)
    if is_root_admin(actor):
        return None
    row = db.query(AnalyticsAccessGrant).filter_by(user_id=actor.id, capability=capability, revoked_at=None).first()
    if row is None:
        raise AnalyticsBlocked("analytics_access_denied", 403)
    return row


def aggregates(db, actor, start: date, end: date, now=None):
    if start > end or (end - start).days > 366:
        raise AnalyticsBlocked("analytics_range_too_large", 422)
    access = _access(db, actor, "aggregate")
    retained = subtract_months(utc(now), AGGREGATE_RETENTION_MONTHS).date()
    query = db.query(AnalyticsDailyAggregate).filter(AnalyticsDailyAggregate.day >= max(start, retained),
                                                   AnalyticsDailyAggregate.day <= end)
    if access is None:
        rows = query.order_by(AnalyticsDailyAggregate.day, AnalyticsDailyAggregate.id).limit(1001).all()
        if len(rows) > 1000:
            raise AnalyticsBlocked("analytics_refine_range", 422)
        return {"items": [{"day": row.day.isoformat(), **{name: getattr(row, name) for name in DIMENSIONS},
                           "event_count": row.event_count, "amount_total": str(row.amount_total)} for row in rows],
                "scope": "owner", "contains_user_identifiers": False}
    # Normal staff only sees its explicit service scope, with attribution/device/
    # geography/content detail removed. Never returns raw event/session streams.
    grouped = query.with_entities(AnalyticsDailyAggregate.day, AnalyticsDailyAggregate.service_id,
        AnalyticsDailyAggregate.event_name, AnalyticsDailyAggregate.currency,
        func.sum(AnalyticsDailyAggregate.event_count), func.sum(AnalyticsDailyAggregate.amount_total)).filter(
            AnalyticsDailyAggregate.service_id.in_(access.allowed_service_ids)).group_by(
                AnalyticsDailyAggregate.day, AnalyticsDailyAggregate.service_id,
                AnalyticsDailyAggregate.event_name, AnalyticsDailyAggregate.currency).having(
                    func.sum(AnalyticsDailyAggregate.event_count) >= 5).limit(1001).all()
    if len(grouped) > 1000:
        raise AnalyticsBlocked("analytics_refine_range", 422)
    return {"items": [{"day": row[0].isoformat(), "service_id": row[1], "event_name": row[2],
                       "currency": row[3], "event_count": row[4], "amount_total": str(row[5])} for row in grouped],
            "scope": "assigned_services", "minimum_bucket_events": 5, "contains_user_identifiers": False}


def raw_events(db, actor, *, after_id=0, limit=50, now=None):
    access = _access(db, actor, "technical_raw")
    if not 1 <= limit <= 100 or after_id < 0:
        raise AnalyticsBlocked("analytics_invalid_pagination", 422)
    query = db.query(AnalyticsEvent).filter(AnalyticsEvent.id > after_id,
        AnalyticsEvent.received_at >= subtract_months(utc(now), RAW_RETENTION_MONTHS))
    if access is not None:
        query = query.filter(AnalyticsEvent.event_name.in_(PUBLIC_EVENTS))
    rows = query.order_by(AnalyticsEvent.id).limit(limit).all()
    return {"items": [{"id": row.id, "event_key": row.event_key, "session_key": row.session_key,
                       "received_at": utc(row.received_at).isoformat(),
                       **{name: getattr(row, name) for name in DIMENSIONS},
                       "amount": str(row.amount) if row.amount is not None else None} for row in rows],
            "next_after_id": rows[-1].id if rows else after_id,
            "scope": "owner" if access is None else "technical_only"}


def retention_preview(db, now=None):
    now = utc(now)
    raw_cutoff = subtract_months(now, RAW_RETENTION_MONTHS)
    aggregate_cutoff = subtract_months(now, AGGREGATE_RETENTION_MONTHS).date()
    consent_cutoff = subtract_months(now, RAW_RETENTION_MONTHS)
    return {"raw_cutoff": raw_cutoff.isoformat(), "aggregate_cutoff": aggregate_cutoff.isoformat(),
            "events": db.query(AnalyticsEvent).filter(AnalyticsEvent.received_at < raw_cutoff).count(),
            "aggregates": db.query(AnalyticsDailyAggregate).filter(AnalyticsDailyAggregate.day < aggregate_cutoff).count(),
            "consents": db.query(AnalyticsConsent).filter(AnalyticsConsent.expires_at < consent_cutoff).count()}


def apply_retention(db, actor, now=None):
    """Explicit owner operation; not a public/background automatic destructive call."""
    if not is_root_admin(actor):
        raise AnalyticsBlocked("owner_required", 403)
    now = utc(now)
    preview = retention_preview(db, now)
    db.query(AnalyticsEvent).filter(AnalyticsEvent.received_at < subtract_months(now, RAW_RETENTION_MONTHS)).delete(synchronize_session=False)
    db.query(AnalyticsDailyAggregate).filter(AnalyticsDailyAggregate.day < subtract_months(now, AGGREGATE_RETENTION_MONTHS).date()).delete(synchronize_session=False)
    db.query(AnalyticsConsent).filter(AnalyticsConsent.expires_at < subtract_months(now, RAW_RETENTION_MONTHS)).delete(synchronize_session=False)
    db.add(AdminAction(admin_user_id=actor.id, action_type="analytics_retention_applied", entity_type="analytics_policy",
                       entity_id=1, details=preview))
    db.flush()
    return preview
