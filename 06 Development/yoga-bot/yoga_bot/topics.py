"""Known Registry IDs for question context only, never published menu links."""
import json
from pathlib import Path
import re

from .config import RuntimeConfigError

MAX_REGISTRY_BYTES = 20_000_000
MAX_RECORDS = 1000
CONTENT_ID = re.compile(r"[a-z][a-z0-9_]{0,59}")


def load_known_topics(root):
    try:
        with (Path(root) / "service-registry.v1.json").open("rb") as stream:
            raw = stream.read(MAX_REGISTRY_BYTES + 1)
        if len(raw) > MAX_REGISTRY_BYTES:
            raise RuntimeConfigError("topic_registry_too_large")
        data = json.loads(raw)
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise RuntimeConfigError("topic_registry_unavailable") from None
    if (not isinstance(data, dict) or type(data.get("schemaVersion")) is not int or data["schemaVersion"] != 1
            or not isinstance(data.get("records"), list) or len(data["records"]) > MAX_RECORDS):
        raise RuntimeConfigError("invalid_topic_registry")
    topics = set()
    for row in data["records"]:
        cid = row.get("contentId") if isinstance(row, dict) else None
        if not isinstance(cid, str) or not CONTENT_ID.fullmatch(cid) or cid in topics:
            raise RuntimeConfigError("invalid_topic_registry_identity")
        topics.add(cid)
    # A known ID is context regardless of kind or publication status. Routing,
    # prices, publication gates and permissions remain separate authorities.
    return frozenset(topics)
