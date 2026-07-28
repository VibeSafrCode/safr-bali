from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.models.referral import Referral
from app.models.user import User


def _positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, str) and value.isdigit() and int(value) > 0:
        return int(value)
    return None


def _load_json_object(path: Path | None) -> dict:
    if path is None or not path.exists():
        return {}

    with path.open(encoding="utf-8") as source:
        value = json.load(source)
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} must contain a JSON object")
    return value


def _issue(kind: str, **identifiers: Any) -> dict:
    return {"kind": kind, **identifiers}


def build_reconciliation_report(
    db: Session,
    *,
    referrals_json: dict,
    referral_codes_json: dict,
    environment_label: str = "unspecified",
) -> dict:
    users = db.query(User).order_by(User.id.asc()).all()
    referral_rows = db.query(Referral).order_by(Referral.id.asc()).all()

    users_by_id = {user.id: user for user in users}
    users_by_telegram_id = {user.telegram_id: user for user in users}
    referral_rows_by_child: dict[int, list[Referral]] = defaultdict(list)
    for row in referral_rows:
        referral_rows_by_child[row.child_user_id].append(row)

    issues: list[dict] = []
    postgres_relations: dict[int, int] = {}

    for user in users:
        if user.invited_by_user_id is None:
            continue

        inviter = users_by_id.get(user.invited_by_user_id)
        if inviter is None:
            issues.append(
                _issue(
                    "postgres_inviter_missing",
                    child_telegram_id=user.telegram_id,
                    inviter_user_id=user.invited_by_user_id,
                )
            )
            continue

        postgres_relations[user.telegram_id] = inviter.telegram_id
        matching_rows = [
            row
            for row in referral_rows_by_child.get(user.id, [])
            if row.parent_user_id == inviter.id
        ]
        if not matching_rows:
            issues.append(
                _issue(
                    "postgres_user_pointer_without_referral_row",
                    child_telegram_id=user.telegram_id,
                    parent_telegram_id=inviter.telegram_id,
                )
            )

    for child_id, rows in referral_rows_by_child.items():
        child = users_by_id.get(child_id)
        parent_ids = sorted({row.parent_user_id for row in rows})
        if len(rows) > 1:
            issues.append(
                _issue(
                    "postgres_duplicate_referral_rows",
                    child_user_id=child_id,
                    child_telegram_id=child.telegram_id if child else None,
                    referral_row_ids=[row.id for row in rows],
                    parent_user_ids=parent_ids,
                )
            )

        for row in rows:
            parent = users_by_id.get(row.parent_user_id)
            if row.parent_user_id == row.child_user_id:
                issues.append(
                    _issue(
                        "postgres_self_referral",
                        referral_row_id=row.id,
                        user_id=row.child_user_id,
                        telegram_id=child.telegram_id if child else None,
                    )
                )
            if child is None or parent is None:
                issues.append(
                    _issue(
                        "postgres_referral_row_has_missing_user",
                        referral_row_id=row.id,
                        child_user_id=row.child_user_id,
                        parent_user_id=row.parent_user_id,
                    )
                )
                continue
            if child.invited_by_user_id != parent.id:
                issues.append(
                    _issue(
                        "postgres_referral_row_pointer_mismatch",
                        referral_row_id=row.id,
                        child_telegram_id=child.telegram_id,
                        row_parent_telegram_id=parent.telegram_id,
                        pointer_parent_user_id=child.invited_by_user_id,
                    )
                )

    valid_json_relations: dict[int, int] = {}
    for child_key, record in referrals_json.items():
        if not isinstance(record, dict):
            issues.append(
                _issue("json_referral_record_invalid", child_key=str(child_key))
            )
            continue

        child_telegram_id = (
            _positive_int(record.get("user_id")) or _positive_int(child_key)
        )
        parent_telegram_id = _positive_int(record.get("referrer_id"))
        if child_telegram_id is None or parent_telegram_id is None:
            issues.append(
                _issue("json_referral_record_invalid", child_key=str(child_key))
            )
            continue

        valid_json_relations[child_telegram_id] = parent_telegram_id
        if child_telegram_id == parent_telegram_id:
            issues.append(
                _issue(
                    "json_self_referral",
                    child_telegram_id=child_telegram_id,
                )
            )

        if child_telegram_id not in users_by_telegram_id:
            issues.append(
                _issue(
                    "json_child_missing_in_postgres",
                    child_telegram_id=child_telegram_id,
                    parent_telegram_id=parent_telegram_id,
                )
            )
        if parent_telegram_id not in users_by_telegram_id:
            issues.append(
                _issue(
                    "json_parent_missing_in_postgres",
                    child_telegram_id=child_telegram_id,
                    parent_telegram_id=parent_telegram_id,
                )
            )

        postgres_parent = postgres_relations.get(child_telegram_id)
        if postgres_parent is None:
            issues.append(
                _issue(
                    "json_relation_missing_in_postgres",
                    child_telegram_id=child_telegram_id,
                    json_parent_telegram_id=parent_telegram_id,
                )
            )
        elif postgres_parent != parent_telegram_id:
            issues.append(
                _issue(
                    "json_postgres_parent_mismatch",
                    child_telegram_id=child_telegram_id,
                    json_parent_telegram_id=parent_telegram_id,
                    postgres_parent_telegram_id=postgres_parent,
                )
            )

    for child_telegram_id, parent_telegram_id in postgres_relations.items():
        if child_telegram_id not in valid_json_relations:
            issues.append(
                _issue(
                    "postgres_relation_missing_in_json",
                    child_telegram_id=child_telegram_id,
                    postgres_parent_telegram_id=parent_telegram_id,
                )
            )

    active_codes_by_owner: dict[int, list[str]] = defaultdict(list)
    for code, record in referral_codes_json.items():
        if not isinstance(record, dict):
            issues.append(
                _issue("json_referral_code_record_invalid", code=str(code))
            )
            continue
        owner_telegram_id = _positive_int(record.get("owner_user_id"))
        if owner_telegram_id is None:
            issues.append(
                _issue("json_referral_code_record_invalid", code=str(code))
            )
            continue
        if owner_telegram_id not in users_by_telegram_id:
            issues.append(
                _issue(
                    "json_referral_code_owner_missing_in_postgres",
                    code=str(code),
                    owner_telegram_id=owner_telegram_id,
                )
            )
        if record.get("active") is not False:
            active_codes_by_owner[owner_telegram_id].append(str(code))

    for owner_telegram_id, codes in active_codes_by_owner.items():
        if len(codes) > 1:
            issues.append(
                _issue(
                    "json_multiple_active_codes_for_owner",
                    owner_telegram_id=owner_telegram_id,
                    codes=sorted(codes),
                )
            )

    issues.sort(key=lambda item: json.dumps(item, sort_keys=True))
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "read_only",
        "environment": environment_label,
        "summary": {
            "postgres_users": len(users),
            "postgres_referral_rows": len(referral_rows),
            "postgres_user_relations": len(postgres_relations),
            "json_referral_records": len(referrals_json),
            "json_referral_code_records": len(referral_codes_json),
            "issues": len(issues),
        },
        "issues": issues,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Read-only reconciliation of PostgreSQL and legacy referral JSON."
    )
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--referrals-json", type=Path)
    parser.add_argument("--referral-codes-json", type=Path)
    parser.add_argument("--environment-label", default="unspecified")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    engine = create_engine(args.database_url)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        report = build_reconciliation_report(
            db,
            referrals_json=_load_json_object(args.referrals_json),
            referral_codes_json=_load_json_object(args.referral_codes_json),
            environment_label=args.environment_label,
        )
    finally:
        db.close()
        engine.dispose()

    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    else:
        print(encoded, end="")


if __name__ == "__main__":
    main()
