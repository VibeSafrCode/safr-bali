"""Approved short copy with ordinal price bindings, never a second price source.

All ten source files are retained byte-for-byte. Only existing RU/EN bot locales
are active. Source revisions and non-price conditions must survive rendering;
bank proof-of-funds requirements are not commercial price occurrences.
"""
import hashlib
import json
import re
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from app.services.exchange_rates import _validated_projection


DATA_DIR = Path(__file__).with_name("d1_d2")
BINDINGS_SHA256 = "f3cbd3338cdb78b39bc2af3da4536218408fb73845808b769e1865a28c30396e"
KEYS = ("d1", "d2", "d1_d2_extension")
ROUTES = {"d1": "bali/visas/d1/", "d2": "bali/visas/d2/",
          "d1_d2_extension": "bali/visas/d1-d2/extension/"}
INITIAL_OPTIONS = frozenset(f"{visa}-{years}-year-{tariff}" for visa in ("d1", "d2")
                            for years in ("one", "two") for tariff in ("standard", "express"))


@lru_cache(maxsize=10)
def approved_sources(locale):
    """Validate archive integrity too; loading foreign data does not activate it."""
    manifest_bytes = (DATA_DIR / "bindings.v1.json").read_bytes()
    if hashlib.sha256(manifest_bytes).hexdigest() != BINDINGS_SHA256:
        raise RuntimeError("D1/D2 binding manifest drift")
    manifest = json.loads(manifest_bytes)
    if locale not in manifest["locales"]:
        raise ValueError("Unsupported D1/D2 source locale")
    metadata = manifest["locales"][locale]
    source_bytes = (DATA_DIR / f"{locale}.json").read_bytes()
    if hashlib.sha256(source_bytes).hexdigest() != metadata["fileSha256"]:
        raise RuntimeError("D1/D2 source file drift")
    rows = json.loads(source_bytes)
    if [row["key"] for row in rows] != list(KEYS):
        raise RuntimeError("D1/D2 source selection drift")
    result = {}
    for row in rows:
        body, selected = row["bodyMarkdown"], metadata["summaries"][row["key"]]
        revision = "sha256:" + hashlib.sha256(body.encode()).hexdigest()
        if (revision != row["bodyRevision"] or revision != selected["bodyRevision"]
                or row["sourceBodyRevision"] != selected["sourceBodyRevision"]
                or row["locale"] != locale or row["detailLink"]["pageKey"] != row["key"]):
            raise RuntimeError("D1/D2 source revision drift")
        if row["sourceUnitIds"] != [unit["unitId"] for unit in selected["units"]]:
            raise RuntimeError("D1/D2 source unit order drift")
        for unit in selected["units"]:
            if hashlib.sha256(body[unit["start"]:unit["end"]].encode()).hexdigest() != unit["sha256"]:
                raise RuntimeError("D1/D2 source unit drift")
        previous_end = -1
        for binding in sorted(selected["bindings"], key=lambda value: value["start"]):
            if (binding["start"] < previous_end
                    or body[binding["start"]:binding["end"]] != binding["literal"]):
                raise RuntimeError("D1/D2 price occurrence drift")
            previous_end = binding["end"]
        result[row["key"]] = (row, selected)
    return result


def _quote(projection, entity_type, entity_key, option_code):
    items = projection.get("items", []) if isinstance(projection, dict) else []
    matches = [item for item in items if isinstance(item, dict)
               and (item.get("entity_type"), item.get("entity_key"), item.get("option_code"))
               == (entity_type, entity_key, option_code)]
    if len(matches) != 1:
        return None
    row = matches[0]
    amount = row.get("amount_idr")
    if (row.get("show_price") is not True or row.get("price_qualifier") != "EXACT"
            or row.get("fee_verification_status") != "VERIFIED"
            or not isinstance(amount, str) or not re.fullmatch(r"[1-9][0-9]{0,17}", amount)):
        return None
    derived = row.get("display_usd_approx")
    # Do not derive from ask, USDT or an authored dollar token. Backend already
    # rounded once; shared validator removes derived amounts beyond its TTL.
    fx = projection.get("fx")
    if (not isinstance(fx, dict) or fx.get("status") not in {"fresh", "stale"}
            or not isinstance(derived, str) or not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", derived)):
        derived = None
    return int(amount), str(derived) if derived is not None else None


def _price_text(operation, projection, locale, format_idr):
    unavailable = "Price on request" if locale == "en" else "Цена по запросу"
    def display(quote):
        if quote is None:
            return unavailable
        amount, dollars = quote
        return format_idr(amount) + (f" (≈ ${dollars})" if dollars is not None else "")
    if operation in INITIAL_OPTIONS:
        return display(_quote(projection, "VISA", "D1/D2", operation))
    if operation in {"d1_extension", "d2_extension"}:
        return display(_quote(projection, "SERVICE", "visa-extension", operation.replace("_", "-")))
    if operation == "d1-d2-extension-equal":
        d1 = _quote(projection, "SERVICE", "visa-extension", "d1-extension")
        d2 = _quote(projection, "SERVICE", "visa-extension", "d2-extension")
        if d1 is not None and d2 is not None and d1 == d2:
            return display(d1)
        return f"D1: {display(d1)} / D2: {display(d2)}"
    raise RuntimeError("Unapproved D1/D2 operation")


def render_summary(key, locale, projection, *, format_idr, now=None):
    if locale not in {"ru", "en"}:
        raise ValueError("D1/D2 bot locale is storage-only")
    row, metadata = approved_sources(locale)[key]
    safe = _validated_projection(projection, now=now or datetime.now(timezone.utc))
    body = row["bodyMarkdown"]
    for binding in sorted(metadata["bindings"], key=lambda value: value["start"], reverse=True):
        rendered = _price_text(binding["operationId"], safe, locale, format_idr)
        body = body[:binding["start"]] + rendered + body[binding["end"]:]
    if "{{USD_" in body:
        raise RuntimeError("Unbound D1/D2 price token")
    url = "https://safrway.online/" + ("en/" if locale == "en" else "") + ROUTES[key]
    return body.rstrip("\n") + "\n\n" + url


def render_combined_card(locale, projection, *, format_idr):
    # Existing D1/D2 menu and sender remain unchanged, including safe Telegram
    # chunking. Do not shorten selected source units to fit a single message.
    return "\n\n".join(render_summary(key, locale, projection, format_idr=format_idr) for key in KEYS)
