"""Static canonical copy -> Yoga display. Never messages, actors or payloads."""
import re

REVISION = "yoga-white-label-2026-10-15"
_OPAQUE = re.compile(r"(https?://[^\s<>]+|mailto:[^\s<>]+|\{[A-Za-z][A-Za-z0-9_]*\}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})", re.I)
_POINTS = re.compile(r"\bSAFR(?:WAY)?\s+Points\b", re.I)
_BRAND = re.compile(r"\bSAFR\s+Bali\b|\bSAFRWAY\b|\bSAFR\b", re.I)
_VISA_PATHS = frozenset({
    "/bali/visas/e33g/", "/bali/visas/e33g/extension/", "/bali/knowledge/e33g/next-term/",
    "/bali/visas/e33g/status-change/", "/bali/visas/e33g/document-check/",
    "/bali/visas/d12/", "/bali/visas/d12/extension/", "/bali/knowledge/d12/documents/",
    "/bali/knowledge/d12/180-days/", "/bali/visas/d1/", "/bali/visas/d2/",
    "/bali/visas/d1-d2/extension/", "/bali/visas/c1/", "/bali/visas/voa/",
    "/bali/visas/investor-kitas/", "/bali/knowledge/investor-kitas/e28a-requirements/",
    "/bali/knowledge/investor-kitas/extension/",
})


def display_copy(value, *, neutral=False):
    if neutral:
        return value
    # Split capture groups are opaque addresses/placeholders, at odd positions.
    return "".join(part if index % 2 else _BRAND.sub("Yoga Ganster", _POINTS.sub("Points", part))
                   for index, part in enumerate(_OPAQUE.split(value)))


def visa_display_copy(value, origin, *, neutral=False):
    """Only the reviewed public visa/knowledge links, never auth/referral URLs.

    Release must prove every resulting route in the actual Yoga site artifact.
    Unknown core URLs fail closed rather than send a client to the wrong brand.
    """
    def link(match):
        url = match.group(0)
        if not url.startswith("https://safrway.online/"):
            return url
        route = url.removeprefix("https://safrway.online")
        source = route[3:] if route.startswith("/en/") else route
        if source not in _VISA_PATHS:
            raise ValueError("unreviewed_public_visa_link")
        return origin + route
    return display_copy(re.sub(r"https?://[^\s<>]+", link, value), neutral=neutral)
