"""Read-only, pinned Registry labels; topic is attribution, never permission."""
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re

SHARED = Path(__file__).resolve().parents[3] / "shared" / "content"


@lru_cache(maxsize=1)
def registry_topic_labels():
    labels = {"general": "Общий вопрос"}
    try:
        registry = json.loads((SHARED / "service-registry.v1.json").read_text(encoding="utf-8"))
        legacy = json.loads((SHARED / "generated/i18n/public.v1.json").read_text(encoding="utf-8")).get("entries", {})
        if registry.get("schemaVersion") != 1 or not isinstance(registry.get("records"), list):
            return labels
        for record in registry["records"]:
            cid = record.get("contentId")
            if not isinstance(cid, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,79}", cid):
                continue
            candidate = record.get("candidate") or {}
            copy = candidate.get("ru") or {}
            title = None
            relative, expected = copy.get("metadataFile"), copy.get("metadataSha256")
            if (isinstance(relative, str) and re.fullmatch(r"registry-copy/[a-zA-Z0-9_.-]+", relative)
                    and isinstance(expected, str) and re.fullmatch(r"[a-f0-9]{64}", expected)
                    and copy.get("status") == "owner_approved_semantics"
                    and copy.get("approvalRevision") == candidate.get("revision")):
                target = (SHARED / relative).resolve(strict=True)
                if target.is_relative_to(SHARED.resolve()) and target.stat().st_size <= 2_000_000:
                    raw = target.read_bytes()
                    if hashlib.sha256(raw).hexdigest() == expected:
                        title = json.loads(raw).get("h1")
            if title is None and record.get("published"):
                route = record["published"].get("routes", {}).get("ru", "")
                segments = route.strip("/").split("/")
                key = ("catalog.destination." + segments[0] + ".name" if len(segments) == 1
                       else "catalog." + ".".join(segments) + ".name")
                title = legacy.get(key, {}).get("ru")
            if isinstance(title, str) and title.strip() and len(title) <= 200 and not any(ord(c) < 32 for c in title):
                labels[cid] = title.strip()
    except (OSError, ValueError, TypeError, AttributeError):
        # Safe fixed label on unavailable or invalid source; never echo a slug.
        return {"general": "Общий вопрос"}
    return labels


def topic_label(topic):
    return registry_topic_labels().get(topic, "Общий вопрос")
