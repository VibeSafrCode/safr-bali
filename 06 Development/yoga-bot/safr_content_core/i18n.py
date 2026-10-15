from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from .sources import bound_roots
from typing import Callable, Mapping

from safr_content_core.locale import LocaleCode, current_locale


SNAPSHOT_PATH = bound_roots().shared_content_root / "generated/i18n/bot.v1.json"
PLACEHOLDER = re.compile(r"\{([A-Za-z][A-Za-z0-9_]*)\}")


@lru_cache(maxsize=1)
def _entries() -> Mapping[str, Mapping[str, str]]:
    with SNAPSHOT_PATH.open("r", encoding="utf-8") as source:
        payload = json.load(source)
    if payload.get("schemaVersion") != 1 or payload.get("locales") != ["ru", "en"]:
        raise RuntimeError("Unsupported bot i18n runtime snapshot")
    return payload["entries"]


def identity_copy(value: str) -> str:
    return value


def template(key: str, *, locale: LocaleCode | None = None) -> str:
    """Select the immutable template before variables or presentation changes."""
    selected_locale = locale or current_locale()
    try:
        return _entries()[key][selected_locale]
    except KeyError as error:
        raise RuntimeError(f"Missing bot translation: {key}.{selected_locale}") from error


def text(
    key: str,
    *,
    locale: LocaleCode | None = None,
    variables: Mapping[str, str | int] | None = None,
    static_copy: Callable[[str], str] | None = None,
) -> str:
    copy = identity_copy if static_copy is None else static_copy
    value = copy(template(key, locale=locale))
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


def button_text(key: str, *, locale: LocaleCode | None = None, static_copy: Callable[[str], str] | None = None) -> str:
    if not key.startswith("button."):
        raise RuntimeError(f"Not a button translation key: {key}")
    return text(key, locale=locale, static_copy=static_copy)


def all_button_texts() -> set[str]:
    return set(_button_keys_by_text())


def canonical_button_text(value: str | None) -> str | None:
    key = button_key(value)
    return button_text(key, locale="ru") if key else None
