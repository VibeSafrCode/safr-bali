"""Read-only status codes shared by Admin, client surfaces, bot and backend."""

from __future__ import annotations

import json
from pathlib import Path
import re


_SOURCE = Path(__file__).resolve().parents[3] / "shared/content/visa-workflow-statuses.v1.json"


def _load_codes() -> tuple[tuple[str, ...], tuple[str, ...]]:
    payload = json.loads(_SOURCE.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != 1:
        raise ValueError("Unsupported visa workflow status schema")
    sections = []
    for section in ("service", "external"):
        rows = payload.get(section)
        if not isinstance(rows, list) or not rows:
            raise ValueError(f"Missing visa workflow status section: {section}")
        codes = tuple(row.get("code") if isinstance(row, dict) else None for row in rows)
        if any(not isinstance(code, str) or not re.fullmatch(r"[A-Z][A-Z_]{0,31}", code) for code in codes):
            raise ValueError(f"Invalid visa workflow status code: {section}")
        if len(set(codes)) != len(codes):
            raise ValueError(f"Duplicate visa workflow status code: {section}")
        sections.append(codes)
    return sections[0], sections[1]


SERVICE_STATUS_CODES, EXTERNAL_STATUS_CODES = _load_codes()
SERVICE_STATUSES = frozenset(SERVICE_STATUS_CODES)
EXTERNAL_STATUSES = frozenset(EXTERNAL_STATUS_CODES)
# Codes are validated above before they become SQL constraint literals.
SERVICE_STATUS_CHECK = "service_status IN (" + ",".join(f"'{code}'" for code in SERVICE_STATUS_CODES) + ")"
EXTERNAL_STATUS_CHECK = "external_status IN (" + ",".join(f"'{code}'" for code in EXTERNAL_STATUS_CODES) + ")"
