"""Customer UI labels from the shared, normalized workflow dictionary."""
import json
from functools import lru_cache
from pathlib import Path


SNAPSHOT = Path(__file__).resolve().parents[3] / "shared/content/visa-workflow-statuses.v1.json"


@lru_cache(maxsize=8)
def _workflow_values(kind: str, locale: str, *, descriptions: bool = False) -> dict[str, str]:
    if kind not in {"service", "external"} or locale not in {"ru", "en"}:
        raise ValueError("Unsupported workflow label domain or locale")
    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != 1:
        raise ValueError("Unsupported workflow dictionary version")
    entries = data[kind]
    field = ("helpRu" if locale == "ru" else "helpEn") if descriptions else locale
    values = {item["code"]: item[field] for item in entries}
    if len(values) != len(entries) or not all(isinstance(value, str) and value for value in values.values()):
        raise ValueError("Invalid workflow dictionary")
    return values


def workflow_labels(kind: str, locale: str) -> dict[str, str]:
    return _workflow_values(kind, locale)


def workflow_descriptions(kind: str, locale: str) -> dict[str, str]:
    return _workflow_values(kind, locale, descriptions=True)
