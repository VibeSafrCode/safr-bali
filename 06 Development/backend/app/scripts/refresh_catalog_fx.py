from __future__ import annotations

import asyncio
import json

from app.db.session import SessionLocal
from app.services.catalog_pricing import latest_publication, refresh_fx_snapshot


async def run() -> None:
    db = SessionLocal()
    try:
        snapshot, status = await refresh_fx_snapshot(db)
        publication = latest_publication(db)
        db.commit()
        print(json.dumps({
            "status": status,
            "fx_version": snapshot.version,
            "publication_version": publication.version if publication else None,
            "observed_at": snapshot.observed_at.isoformat(),
            "fresh_until": snapshot.fresh_until.isoformat(),
            "stale_until": snapshot.stale_until.isoformat(),
            "manual_override": snapshot.is_manual_override,
        }, sort_keys=True))
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(run())
