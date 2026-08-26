"""Preview or apply canonical referral reconciliation.

Default mode is read-only JSON output. Applying requires both ``--apply`` and
the configured main-admin Telegram id as an explicit guard. The procedure does
not alter ``users.created_at`` and never overwrites an existing conflicting
relationship.
"""

from __future__ import annotations

import argparse
import json
import stat
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.admin_action import AdminAction
from app.models.referral import Referral
from app.models.user import User
from app.services.referral_attribution import attribute_referral_once
from app.services.referral_corrections import (
    apply_referral_correction,
    build_referral_correction_preview,
    referral_cycle_user_ids,
)


CANONICAL_SOURCES = {
    "explicit_referral",
    "default_main_admin",
    "default_main_admin_backfill",
}


@dataclass(frozen=True)
class ReferralOverride:
    child_telegram_id: int
    new_parent_telegram_id: int
    reason: str
    idempotency_key: str


def load_referral_override(path: Path | None) -> ReferralOverride | None:
    """Load one protected Founder-approved override without embedding PII in source."""
    if path is None:
        return None
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise RuntimeError("Referral override manifest must not be group/world accessible")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or set(payload) != {
        "child_telegram_id", "new_parent_telegram_id", "reason", "idempotency_key"
    }:
        raise RuntimeError("Referral override manifest has an invalid shape")
    child = _positive_int(payload["child_telegram_id"])
    parent = _positive_int(payload["new_parent_telegram_id"])
    reason = str(payload["reason"]).strip()
    idempotency_key = str(payload["idempotency_key"]).strip()
    if child is None or parent is None or child == parent or len(reason) < 3 or len(idempotency_key) < 8:
        raise RuntimeError("Referral override manifest is invalid")
    return ReferralOverride(child, parent, reason, idempotency_key)


def _positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, str) and value.isdigit() and int(value) > 0:
        return int(value)
    return None


def build_reconciliation_report(
    db: Session,
    *,
    referrals_json: dict,
    referral_codes_json: dict,
    environment_label: str = "unspecified",
) -> dict:
    """Keep the established read-only audit contract alongside repair mode."""
    users = db.query(User).order_by(User.id.asc()).all()
    rows = db.query(Referral).order_by(Referral.id.asc()).all()
    by_id = {user.id: user for user in users}
    by_tg = {user.telegram_id: user for user in users}
    rows_by_child: dict[int, list[Referral]] = defaultdict(list)
    for row in rows:
        rows_by_child[row.child_user_id].append(row)
    issues: list[dict] = []
    relations: dict[int, int] = {}

    for user in users:
        if user.invited_by_user_id is None:
            continue
        parent = by_id.get(user.invited_by_user_id)
        if not parent:
            issues.append({"kind": "postgres_inviter_missing", "child_telegram_id": user.telegram_id})
            continue
        relations[user.telegram_id] = parent.telegram_id
        if not any(row.parent_user_id == parent.id for row in rows_by_child.get(user.id, [])):
            issues.append({"kind": "postgres_user_pointer_without_referral_row", "child_telegram_id": user.telegram_id, "parent_telegram_id": parent.telegram_id})

    for child_id, child_rows in rows_by_child.items():
        child = by_id.get(child_id)
        if len(child_rows) > 1:
            issues.append({"kind": "postgres_duplicate_referral_rows", "child_user_id": child_id})
        for row in child_rows:
            parent = by_id.get(row.parent_user_id)
            if row.parent_user_id == row.child_user_id:
                issues.append({"kind": "postgres_self_referral", "referral_row_id": row.id})
            if not child or not parent:
                issues.append({"kind": "postgres_referral_row_has_missing_user", "referral_row_id": row.id})
            elif child.invited_by_user_id != parent.id:
                issues.append({"kind": "postgres_referral_row_pointer_mismatch", "referral_row_id": row.id, "child_telegram_id": child.telegram_id})

    for cycle in referral_cycle_user_ids(db):
        issues.append({"kind": "postgres_referral_cycle", "user_ids": list(cycle)})

    json_relations: dict[int, int] = {}
    for child_key, record in referrals_json.items():
        if not isinstance(record, dict):
            issues.append({"kind": "json_referral_record_invalid", "child_key": str(child_key)})
            continue
        child_tg = _positive_int(record.get("user_id")) or _positive_int(child_key)
        parent_tg = _positive_int(record.get("referrer_id"))
        if not child_tg or not parent_tg:
            issues.append({"kind": "json_referral_record_invalid", "child_key": str(child_key)})
            continue
        json_relations[child_tg] = parent_tg
        if child_tg == parent_tg:
            issues.append({"kind": "json_self_referral", "child_telegram_id": child_tg})
        if child_tg not in by_tg:
            issues.append({"kind": "json_child_missing_in_postgres", "child_telegram_id": child_tg})
        if parent_tg not in by_tg:
            issues.append({"kind": "json_parent_missing_in_postgres", "parent_telegram_id": parent_tg})
        postgres_parent = relations.get(child_tg)
        if postgres_parent is None:
            issues.append({"kind": "json_relation_missing_in_postgres", "child_telegram_id": child_tg})
        elif postgres_parent != parent_tg:
            issues.append({"kind": "json_postgres_parent_mismatch", "child_telegram_id": child_tg})
    for child_tg in relations:
        if child_tg not in json_relations:
            issues.append({"kind": "postgres_relation_missing_in_json", "child_telegram_id": child_tg})

    codes_by_owner: dict[int, list[str]] = defaultdict(list)
    for code, record in referral_codes_json.items():
        if not isinstance(record, dict) or not _positive_int(record.get("owner_user_id")):
            issues.append({"kind": "json_referral_code_record_invalid", "code": str(code)})
            continue
        owner = _positive_int(record.get("owner_user_id"))
        if owner not in by_tg:
            issues.append({"kind": "json_referral_code_owner_missing_in_postgres", "code": str(code), "owner_telegram_id": owner})
        if record.get("active") is not False:
            codes_by_owner[owner].append(str(code))
    for owner, codes in codes_by_owner.items():
        if len(codes) > 1:
            issues.append({"kind": "json_multiple_active_codes_for_owner", "owner_telegram_id": owner, "codes": sorted(codes)})

    issues.sort(key=lambda item: json.dumps(item, sort_keys=True))
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "read_only",
        "environment": environment_label,
        "summary": {
            "postgres_users": len(users),
            "postgres_referral_rows": len(rows),
            "postgres_user_relations": len(relations),
            "json_referral_records": len(referrals_json),
            "json_referral_code_records": len(referral_codes_json),
            "issues": len(issues),
        },
        "issues": issues,
    }


def load_bot_referrals(path: Path | None) -> dict:
    if path is None:
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def _load_json_object(path: Path | None) -> dict:
    if path is None or not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path.name} must contain a JSON object")
    return payload


def bot_classification(bot_rows: dict, user: User) -> tuple[str, str] | None:
    record = bot_rows.get(str(user.telegram_id))
    if not isinstance(record, dict):
        return None
    source = record.get("source")
    if source in {"default_main_admin", "default_main_admin_backfill"}:
        return "default_main_admin", str(source)
    if source == "referral_link":
        return "explicit_referral", "legacy_referral_link"
    return None


def reconcile(
    *,
    apply: bool,
    expected_main_admin: int,
    bot_path: Path | None,
    promote_main_admin: bool = False,
    override: ReferralOverride | None = None,
) -> dict:
    if expected_main_admin != settings.DEFAULT_ADMIN_TELEGRAM_ID:
        raise RuntimeError("Expected main-admin identity does not match configuration")
    db = SessionLocal()
    try:
        roots = db.query(User).filter(User.telegram_id == expected_main_admin).all()
        if len(roots) != 1 or roots[0].status != "active":
            raise RuntimeError("Canonical main-admin DB identity is not unique and active")
        root = roots[0]
        bot_rows = load_bot_referrals(bot_path)
        plan: list[dict] = []
        conflicts: list[dict] = []
        for cycle in referral_cycle_user_ids(db):
            conflicts.append({"user_ids": list(cycle), "reason": "referral_cycle"})
        if promote_main_admin:
            if root.role not in {"client", "admin"}:
                conflicts.append({"user_id": root.id, "reason": "unexpected_root_role"})
            elif root.role != "admin":
                plan.append({"action": "promote_main_admin", "user_id": root.id, "from_role": root.role, "to_role": "admin"})

        for user in db.query(User).order_by(User.id.asc()).all():
            if user.id == root.id:
                if user.invited_by_user_id is not None:
                    conflicts.append({"user_id": user.id, "reason": "root_has_parent"})
                continue
            referral = db.query(Referral).filter(Referral.child_user_id == user.id).first()
            classified = bot_classification(bot_rows, user)
            if referral:
                if user.invited_by_user_id != referral.parent_user_id:
                    conflicts.append({"user_id": user.id, "reason": "pointer_row_mismatch"})
                    continue
                if referral.source in CANONICAL_SOURCES:
                    continue
                if classified is None:
                    conflicts.append({"user_id": user.id, "reason": "legacy_source_unclassified"})
                    continue
                # Existing referral rows are protected by the database's
                # append-only trigger. A matching legacy row is already the
                # canonical relationship; classification only proves that it
                # is understood and must never rewrite it in place.
                continue

            if user.invited_by_user_id is not None:
                parent = db.query(User).filter(User.id == user.invited_by_user_id).first()
                if not parent:
                    conflicts.append({"user_id": user.id, "reason": "parent_missing"})
                    continue
                source, reason = classified or (
                    ("default_main_admin_backfill", "missing_row_default_root")
                    if parent.id == root.id
                    else ("explicit_referral", "missing_row_existing_pointer")
                )
                plan.append({"action": "create_missing_row", "user_id": user.id, "parent_user_id": parent.id, "source": source, "reason": reason})
                if apply:
                    attribute_referral_once(db, user_id=user.id, inviter_id=parent.id, source=source, attribution_reason=reason)
                continue

            plan.append({"action": "default_root_backfill", "user_id": user.id, "parent_user_id": root.id, "source": "default_main_admin_backfill", "reason": "historical_unassigned"})
            if apply:
                attribute_referral_once(db, user_id=user.id, inviter_id=root.id, source="default_main_admin_backfill", attribution_reason="historical_unassigned")

        override_resolution: tuple[User, User] | None = None
        if override is not None:
            children = db.query(User).filter(User.telegram_id == override.child_telegram_id).all()
            parents = db.query(User).filter(User.telegram_id == override.new_parent_telegram_id).all()
            if len(children) != 1 or len(parents) != 1:
                conflicts.append({"reason": "override_identity_not_unique"})
            else:
                child, parent = children[0], parents[0]
                preview = build_referral_correction_preview(
                    db, child_user_id=child.id, new_parent_user_id=parent.id
                )
                if not preview.executable:
                    conflicts.append({"user_id": child.id, "reason": "override_blocked", "details": list(preview.conflicts)})
                else:
                    plan.append({
                        "action": "correct_referral_attribution",
                        "user_id": child.id,
                        "parent_user_id": parent.id,
                        "reward_ledger_rows": preview.reward_ledger_rows,
                    })
                    override_resolution = (child, parent)

        if apply and not conflicts and override_resolution is not None:
            child, parent = override_resolution
            apply_referral_correction(
                db,
                child_user_id=child.id,
                new_parent_user_id=parent.id,
                actor=root,
                reason=override.reason,
                idempotency_key=override.idempotency_key,
            )

        if apply and promote_main_admin and not conflicts and root.role != "admin":
            old_role = root.role
            root.role = "admin"
            existing_action = db.query(AdminAction).filter(
                AdminAction.idempotency_key == "main-admin-role-promotion:v1"
            ).first()
            if not existing_action:
                db.add(AdminAction(
                    admin_user_id=root.id,
                    action_type="main_admin_role_promoted",
                    entity_type="user",
                    entity_id=root.id,
                    comment="Canonical configured main-admin identity promoted at approved release gate",
                    idempotency_key="main-admin-role-promotion:v1",
                    details={"old_role": old_role, "new_role": "admin"},
                ))

        if conflicts:
            db.rollback()
        elif apply:
            db.commit()
        else:
            db.rollback()
        return {"mode": "apply" if apply else "preview", "main_admin_user_id": root.id, "planned": plan, "conflicts": conflicts, "override_planned": override is not None, "applied": apply and not conflicts}
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit or reconcile referral storage.")
    parser.add_argument("--database-url")
    parser.add_argument("--referrals-json", type=Path)
    parser.add_argument("--referral-codes-json", type=Path)
    parser.add_argument("--environment-label", default="unspecified")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--expected-main-admin-telegram-id", type=int)
    parser.add_argument("--bot-referrals", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--promote-main-admin", action="store_true")
    parser.add_argument("--override-manifest", type=Path, help="0600 JSON manifest for the exact Founder-approved attribution override; identifiers are never guessed or embedded in source")
    args = parser.parse_args()
    if args.apply or args.expected_main_admin_telegram_id is not None:
        if args.expected_main_admin_telegram_id is None:
            parser.error("--expected-main-admin-telegram-id is required for repair mode")
        result = reconcile(
            apply=args.apply,
            expected_main_admin=args.expected_main_admin_telegram_id,
            bot_path=args.bot_referrals or args.referrals_json,
            promote_main_admin=args.promote_main_admin,
            override=load_referral_override(args.override_manifest),
        )
    else:
        if not args.database_url:
            parser.error("--database-url is required for read-only audit mode")
        engine = create_engine(args.database_url)
        LocalSession = sessionmaker(bind=engine)
        db = LocalSession()
        try:
            result = build_reconciliation_report(
                db,
                referrals_json=_load_json_object(args.referrals_json),
                referral_codes_json=_load_json_object(args.referral_codes_json),
                environment_label=args.environment_label,
            )
        finally:
            db.close()
            engine.dispose()
    encoded = json.dumps(result, ensure_ascii=False, default=str, indent=2) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    else:
        print(encoded, end="")


if __name__ == "__main__":
    main()
