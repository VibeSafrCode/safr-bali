from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Mapping

from app.services.locale import LocaleCode, current_locale


SNAPSHOT_PATH = (
    Path(__file__).resolve().parents[3]
    / "shared"
    / "content"
    / "generated"
    / "i18n"
    / "bot.v1.json"
)
PLACEHOLDER = re.compile(r"\{([A-Za-z][A-Za-z0-9_]*)\}")


@lru_cache(maxsize=1)
def _entries() -> Mapping[str, Mapping[str, str]]:
    with SNAPSHOT_PATH.open("r", encoding="utf-8") as source:
        payload = json.load(source)
    if payload.get("schemaVersion") != 1 or payload.get("locales") != ["ru", "en"]:
        raise RuntimeError("Unsupported bot i18n runtime snapshot")
    return payload["entries"]


def text(
    key: str,
    *,
    locale: LocaleCode | None = None,
    variables: Mapping[str, str | int] | None = None,
) -> str:
    selected_locale = locale or current_locale()
    try:
        value = _entries()[key][selected_locale]
    except KeyError as error:
        raise RuntimeError(f"Missing bot translation: {key}.{selected_locale}") from error
    values = variables or {}
    return PLACEHOLDER.sub(
        lambda match: str(values.get(match.group(1), match.group(0))),
        value,
    )


def matches(value: str | None, key: str) -> bool:
    if value is None:
        return False
    entry = _entries().get(key)
    return bool(entry and value in {entry["ru"], entry["en"]})


@lru_cache(maxsize=1)
def _button_keys_by_text() -> Mapping[str, str]:
    return {
        value: key
        for key, entry in _entries().items()
        if key.startswith("button.")
        for value in (entry["ru"], entry["en"])
    }


def button_key(value: str | None) -> str | None:
    return _button_keys_by_text().get((value or "").strip())


def button_text(key: str, *, locale: LocaleCode | None = None) -> str:
    if not key.startswith("button."):
        raise RuntimeError(f"Not a button translation key: {key}")
    return text(key, locale=locale)


def all_button_texts() -> set[str]:
    return set(_button_keys_by_text())


def canonical_button_text(value: str | None) -> str | None:
    key = button_key(value)
    return button_text(key, locale="ru") if key else None
