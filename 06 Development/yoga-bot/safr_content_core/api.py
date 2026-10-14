"""Thin explicit-locale adapter around the exact extracted Main functions."""
from __future__ import annotations

from typing import Mapping

from .locale import reset_current_locale, set_current_locale
from .sources import ContentRoots, _bind_roots, verify_inputs


VISA_KEYS = ("E33G", "D12", "E28A", "D1/D2", "C1", "VOA", "Другая виза")


def _locale(locale: str) -> str:
    if locale not in ("ru", "en"):
        raise ValueError("Only explicit approved RU/EN bot locales are supported")
    return locale


class VisaRenderer:
    """No networking, identities, environment, catalog copy, or local FX.

    Pass the existing backend projection unchanged. A missing/expired projection
    follows Main's exact unavailable-price/derived-USD TTL policy.
    """

    def __init__(self, roots: ContentRoots):
        self.roots = _bind_roots(roots)
        # Normal static imports only after explicit source initialization.
        from . import i18n, visas
        self._i18n = i18n
        self._visas = visas

    def card(self, key: str, *, locale: str, pricing_projection=None) -> str:
        if key not in VISA_KEYS:
            raise ValueError("Unsupported canonical Main visa key")
        selected = _locale(locale)
        verify_inputs(self.roots)
        token = set_current_locale(selected)
        try:
            return self._visas.get_visa_card(key, pricing_projection)
        finally:
            reset_current_locale(token)

    def labels(self, *, locale: str, pricing_projection=None) -> dict[str, str]:
        selected = _locale(locale)
        verify_inputs(self.roots)
        token = set_current_locale(selected)
        try:
            return self._visas.get_visa_menu_labels(pricing_projection)
        finally:
            reset_current_locale(token)

    def text(self, key: str, *, locale: str, variables: Mapping[str, str | int] | None = None) -> str:
        """Existing Main labels/inline prompts, never newly authored copy."""
        selected = _locale(locale)
        verify_inputs(self.roots)
        return self._i18n.text(key, locale=selected, variables=variables)

    def parts(self, body: str, limit: int = 3500) -> list[str]:
        # Telegram limits use UTF-16; two units are required for one astral char.
        if not isinstance(limit, int) or isinstance(limit, bool) or limit < 2:
            raise ValueError("Chunk limit must be an integer of at least two UTF-16 units")
        return self._visas.visa_card_parts(body, limit)
