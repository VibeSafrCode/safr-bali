from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.services.visa_contact_reminders import materialize_contact_reminders


def _parse_now(value: str | None) -> datetime | None:
    if value is None:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Materialize due visa contact reminders without sending them.",
    )
    parser.add_argument("--now", help="Optional ISO-8601 evaluation time")
    parser.add_argument("--limit", type=int, default=200)
    args = parser.parse_args()
    db = SessionLocal()
    try:
        result = materialize_contact_reminders(
            db, now=_parse_now(args.now), limit=args.limit,
        )
        print(json.dumps(result.public_payload(), sort_keys=True))
    finally:
        db.close()


if __name__ == "__main__":
    main()
