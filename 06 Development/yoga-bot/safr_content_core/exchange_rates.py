from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

def _aware_utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _validated_projection(payload: object, *, now: datetime) -> dict | None:
    if not isinstance(payload, dict):
        return None
    required = {
        "projection_id", "catalog_version_id", "fx_snapshot_id",
        "formula_version", "derived_expires_at", "items",
    }
    if not required.issubset(payload) or not isinstance(payload.get("items"), list):
        return None
    try:
        expires_at = datetime.fromisoformat(str(payload["derived_expires_at"]).replace("Z", "+00:00"))
    except ValueError:
        return None
    safe = deepcopy(payload)
    if _aware_utc(now) > _aware_utc(expires_at):
        if isinstance(safe.get("fx"), dict):
            safe["fx"]["status"] = "unavailable"
            safe["fx"]["ask_idr_per_usdt"] = None
        for item in safe["items"]:
            if isinstance(item, dict):
                item["display_usdt"] = None
                item["display_usd_approx"] = None
    return safe


