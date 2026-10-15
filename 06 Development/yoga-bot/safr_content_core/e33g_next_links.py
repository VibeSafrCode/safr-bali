"""Price-free next-stage links using the exact approved RU/EN source H1s."""

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from .sources import bound_roots
from safr_content_core.i18n import identity_copy


LINKS_PATH = bound_roots().shared_content_root / "e33g-next-bot-links.v1.json"
LINKS_SHA256 = "f773350a353f6fc1d93a4890c08b3442be43cf2dd6d4399350390bd7b481ceb8"
TARGETS = (
    ("e33g_next_term", "/bali/visas/e33g/extension/"),
    ("knowledge_e33g_extension", "/bali/knowledge/e33g/next-term/"),
    ("e33g_conversion", "/bali/visas/e33g/status-change/"),
    ("employment_review", "/bali/visas/e33g/document-check/"),
)


@lru_cache(maxsize=1)
def approved_links():
    raw = LINKS_PATH.read_bytes()
    if hashlib.sha256(raw).hexdigest() != LINKS_SHA256:
        raise RuntimeError("Approved E33G next-stage link artifact drift")
    payload = json.loads(raw)
    if (payload.get("schemaVersion") != 1 or payload.get("locales") != ["ru", "en"]
            or set(payload["entries"]) != {"ru", "en"}):
        raise RuntimeError("Unsupported E33G next-stage link schema")
    for locale in ("ru", "en"):
        links = payload["entries"][locale]
        if tuple((link["contentId"], link["path"]) for link in links) != TARGETS:
            raise RuntimeError("Approved E33G next-stage link target drift")
        for link in links:
            if hashlib.sha256(link["label"].encode()).hexdigest() != link["labelSha256"]:
                raise RuntimeError("Approved E33G next-stage H1 drift")
    return payload["entries"]


def e33g_next_footer(locale, *, static_copy=None):
    if locale not in {"ru", "en"}:
        raise ValueError("Unsupported E33G bot link locale")
    prefix = "https://safrway.online/" + ("en/" if locale == "en" else "")
    copy = identity_copy if static_copy is None else static_copy
    return "\n\n".join(
        f"{copy(link['label'])}\n{copy(prefix + link['path'].lstrip('/'))}"
        for link in approved_links()[locale]
    )
