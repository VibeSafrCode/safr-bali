"""Preview-bound admin adapter; reuse the canonical correction/ledger machinery.

The transaction belongs to the caller. In PostgreSQL, lock the configured root
and child before checking the preview. The child FOR UPDATE also serializes an
orders.user_id FK insertion; a fresh preview must not silently change an existing
order's prospective reward recipient. No background backfill or messages.
"""
from __future__ import annotations

import hashlib

from sqlalchemy import func, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.models.admin_action import AdminAction
from app.models.admin_safety import ReferralAttributionCorrection
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.user import User
from app.services.action_reason import ActionReasonInvalid, normalize_action_reason
from app.services.referral_corrections import (
    ReferralCorrectionBlocked,
    apply_referral_correction,
    build_referral_correction_preview,
)
from app.services.visa_staff import is_root_admin

MAX_ANCESTORS = 512


def referral_database_failure(error: DBAPIError) -> tuple[int, str] | None:
    """Translate only known transaction failures, never arbitrary database text."""
    code = getattr(error.orig, "sqlstate", None) or getattr(error.orig, "pgcode", None)
    if code in {"40001", "40P01", "55P03", "57014"}:
        return 503, "retry_same_referral_operation"
    primary = getattr(getattr(error.orig, "diag", None), "message_primary", None)
    if code == "P0001" and primary in {
        "active root admin actor required",
        "child and active non-self inviter are required",
        "referral correction would create a cycle",
        "canonical referral pointer and row must agree before correction",
        "requested referral attribution is already current",
        "referral correction blocked because reward ledger activity exists",
        "idempotency key belongs to another correction",
    }:
        return 409, "referral_conflict_refresh_preview"
    return None


def _identity(user: User | None) -> dict | None:
    if user is None:
        return None
    return {"id": user.id, "name": " ".join(filter(None, (user.first_name, user.last_name)))
            or user.username or f"SAFRWAY {user.id}", "username": user.username, "status": user.status}


def _last_correction(db: Session, child_id: int) -> int:
    return int(db.query(func.max(ReferralAttributionCorrection.id)).filter(
        ReferralAttributionCorrection.child_user_id == child_id).scalar() or 0)


def _chain_conflict(db: Session, child_id: int, parent_id: int) -> str | None:
    current, visited = parent_id, set()
    for _ in range(MAX_ANCESTORS):
        if current == child_id or current in visited:
            return "referral_cycle"
        visited.add(current)
        row = db.query(User).filter(User.id == current).populate_existing().first()
        if row is None:
            return "ancestor_missing"
        if is_root_admin(row):
            return None if row.invited_by_user_id is None else "root_parent_mismatch"
        if row.invited_by_user_id is None:
            return "ancestor_unattributed"
        relation = db.query(Referral).filter_by(child_user_id=row.id).populate_existing().first()
        if relation is None or relation.parent_user_id != row.invited_by_user_id:
            return "ancestor_referral_mismatch"
        current = row.invited_by_user_id
    return "ancestor_depth_limit"


def guarded_referral_preview(db: Session, *, child_user_id: int, new_parent_user_id: int) -> dict:
    # Bound the ancestry walk before the legacy preview's full chain check.
    chain_conflict = _chain_conflict(db, child_user_id, new_parent_user_id)
    if chain_conflict:
        raise ReferralCorrectionBlocked(chain_conflict)
    preview = build_referral_correction_preview(db, child_user_id=child_user_id,
                                               new_parent_user_id=new_parent_user_id)
    child = db.get(User, child_user_id)
    old = db.get(User, preview.previous_parent_user_id) if preview.previous_parent_user_id else None
    parent = db.get(User, new_parent_user_id)
    order_count = db.query(Order).filter(Order.user_id == child_user_id).count()
    own_ledger_count = db.query(PointsLedger).filter(PointsLedger.user_id == child_user_id).count()
    conflicts = list(preview.conflicts)
    if child is not None and is_root_admin(child):
        conflicts.append("root_transfer_forbidden")
    if order_count:
        conflicts.append("existing_orders_require_separate_policy")
    if own_ledger_count:
        conflicts.append("existing_points_require_separate_policy")
    return {"child_user_id": child_user_id, "new_parent_user_id": new_parent_user_id,
            "previous_parent_user_id": preview.previous_parent_user_id,
            "referral_row_id": preview.referral_row_id,
            "last_correction_id": _last_correction(db, child_user_id),
            "reward_ledger_rows": preview.reward_ledger_rows, "existing_order_count": order_count,
            "existing_points_count": own_ledger_count,
            "child": _identity(child), "previous_parent": _identity(old), "new_parent": _identity(parent),
            "conflicts": sorted(set(conflicts)), "executable": not conflicts}


def apply_previewed_referral_correction(
    db: Session, *, child_user_id: int, new_parent_user_id: int,
    expected_parent_user_id: int, expected_last_correction_id: int,
    expected_referral_row_id: int, actor: User, reason: str, idempotency_key: str,
) -> tuple[ReferralAttributionCorrection, bool]:
    for value, minimum in ((child_user_id, 1), (new_parent_user_id, 1),
                           (expected_parent_user_id, 1), (expected_last_correction_id, 0),
                           (expected_referral_row_id, 1)):
        if type(value) is not int or value < minimum:
            raise ReferralCorrectionBlocked("invalid_preview_identity")
    if not is_root_admin(actor):
        raise ReferralCorrectionBlocked("root_admin_required")
    if db.get_bind().dialect.name == "postgresql":
        if db.connection().get_isolation_level() != "READ COMMITTED":
            raise ReferralCorrectionBlocked("unsupported_transaction_isolation")
        db.execute(text("SELECT set_config('lock_timeout', '2s', true), "
                        "set_config('statement_timeout', '5s', true)"))
    # Re-read authority and serialize all corrections performed by this root.
    current_actor = db.query(User).filter(User.id == actor.id).populate_existing().with_for_update().first()
    if current_actor is None or not is_root_admin(current_actor):
        raise ReferralCorrectionBlocked("root_admin_required")
    try:
        normalized = normalize_action_reason(reason)
    except ActionReasonInvalid as exc:
        raise ReferralCorrectionBlocked("invalid_reason") from exc
    if not isinstance(idempotency_key, str) or not 8 <= len(idempotency_key) <= 255:
        raise ReferralCorrectionBlocked("invalid_idempotency_key")
    request = {"child_user_id": child_user_id, "new_parent_user_id": new_parent_user_id,
               "expected_parent_user_id": expected_parent_user_id,
               "expected_last_correction_id": expected_last_correction_id,
               "expected_referral_row_id": expected_referral_row_id,
               "actor_admin_id": current_actor.id, "reason": normalized}
    context_key = "referral-preview:" + hashlib.sha256(idempotency_key.encode()).hexdigest()
    existing = db.query(ReferralAttributionCorrection).filter_by(idempotency_key=idempotency_key).first()
    if existing:
        context = db.query(AdminAction).filter_by(idempotency_key=context_key).first()
        if (context is None or context.action_type != "REFERRAL_PREVIEW_APPLIED"
                or context.admin_user_id != current_actor.id or not isinstance(context.details, dict)
                or context.details.get("request") != request
                or context.details.get("correction_id") != existing.id
                or existing.child_user_id != child_user_id
                or existing.new_parent_user_id != new_parent_user_id
                or existing.previous_parent_user_id != expected_parent_user_id
                or existing.referral_row_id != expected_referral_row_id
                or existing.actor_admin_id != current_actor.id or existing.reason != normalized):
            raise ReferralCorrectionBlocked("idempotency_payload_conflict")
        return existing, True
    child = db.query(User).filter(User.id == child_user_id).populate_existing().with_for_update().first()
    relation = db.query(Referral).filter_by(child_user_id=child_user_id).populate_existing().with_for_update().first()
    if child is None or relation is None:
        raise ReferralCorrectionBlocked("canonical_referral_row_missing")
    if (relation.id != expected_referral_row_id or relation.parent_user_id != expected_parent_user_id
            or child.invited_by_user_id != expected_parent_user_id
            or _last_correction(db, child_user_id) != expected_last_correction_id):
        raise ReferralCorrectionBlocked("stale_referral_preview")
    preview = guarded_referral_preview(db, child_user_id=child_user_id, new_parent_user_id=new_parent_user_id)
    if not preview["executable"]:
        raise ReferralCorrectionBlocked(",".join(preview["conflicts"]))
    before = {"parent_user_id": relation.parent_user_id, "source": relation.source,
              "attribution_reason": relation.attribution_reason, "level": relation.level}
    correction, replay = apply_referral_correction(
        db, child_user_id=child_user_id, new_parent_user_id=new_parent_user_id,
        actor=current_actor, reason=normalized, idempotency_key=idempotency_key)
    if replay:
        raise ReferralCorrectionBlocked("unexpected_legacy_replay")
    db.refresh(relation)
    db.add(AdminAction(admin_user_id=current_actor.id, action_type="REFERRAL_PREVIEW_APPLIED",
                       entity_type="referral", entity_id=relation.id, comment=normalized,
                       idempotency_key=context_key,
                       details={"request": request, "correction_id": correction.id, "before": before,
                                "after": {"parent_user_id": relation.parent_user_id,
                                          "source": relation.source, "attribution_reason": relation.attribution_reason,
                                          "level": relation.level}, "rewards_changed": False}))
    db.flush()
    return correction, False
