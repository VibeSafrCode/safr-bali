from __future__ import annotations


SUPPORTED_LOCALES = frozenset({"ru", "en"})
DEFAULT_LOCALE = "ru"


def locale_from_language(value: str | None) -> str:
    """Normalize Telegram/browser language tags without expanding locale scope."""
    normalized = (value or "").strip().lower().replace("_", "-")
    primary = normalized.split("-", 1)[0]
    return primary if primary in SUPPORTED_LOCALES else DEFAULT_LOCALE
