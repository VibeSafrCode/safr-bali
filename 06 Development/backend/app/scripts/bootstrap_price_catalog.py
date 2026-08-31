from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.user import User
from app.services.catalog_pricing import (
    latest_publication,
    preview_catalog,
    publish_catalog,
    refresh_fx_snapshot,
)


SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "catalog_price_seed.v1.json"


def load_seed() -> list[dict]:
    payload = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1 or payload.get("currency") != "IDR":
        raise RuntimeError("Unsupported catalog parity seed")
    defaults = payload.get("defaults") or {}
    return [defaults | item for item in payload.get("items", [])]


async def run(args: argparse.Namespace) -> None:
    db = SessionLocal()
    try:
        if latest_publication(db) is not None:
            raise RuntimeError("A price catalog is already published; bootstrap is one-time only")
        actor = db.get(User, args.actor_user_id)
        if actor is None or actor.telegram_id != settings.DEFAULT_ADMIN_TELEGRAM_ID:
            raise RuntimeError("Configured root-admin actor is required")
        fx, fx_status = await refresh_fx_snapshot(db, force=True)
        items = load_seed()
        preview = preview_catalog(items, fx)
        if not args.apply:
            db.rollback()
            print(json.dumps({
                "mode": "DRY_RUN",
                "fx_status": fx_status,
                "item_count": len(preview["items"]),
                "fx_version": preview["fx_version"],
                "formula_code": preview["formula_code"],
            }, sort_keys=True))
            return
        publication = publish_catalog(
            db,
            items=items,
            expected_publication_version=0,
            effective_from=datetime.now(timezone.utc),
            reason=args.reason,
            idempotency_key=args.idempotency_key,
            actor_id=actor.id,
        )
        db.commit()
        print(json.dumps({
            "mode": "APPLIED",
            "publication_version": publication.version,
            "fx_version": fx.version,
            "item_count": len(preview["items"]),
        }, sort_keys=True))
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Preview or apply the one-time canonical price parity import.",
    )
    parser.add_argument("--actor-user-id", type=int, required=True)
    parser.add_argument("--reason", default="Initial canonical catalog parity import")
    parser.add_argument("--idempotency-key", default="catalog-bootstrap-v1")
    parser.add_argument("--apply", action="store_true")
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()
