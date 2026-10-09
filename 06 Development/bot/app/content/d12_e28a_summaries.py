"""Approved RU/EN excerpts with existing catalog bindings; no authored prices."""

import hashlib
import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from app.content.d1_d2_summaries import _quote
from app.services.exchange_rates import _validated_projection


SUMMARY_PATH = Path(__file__).resolve().parents[3] / "shared/content/d12-e28a-bot-summaries.v1.json"
SUMMARY_SHA256 = "1e1fc2d5026d67642f4eb837895db2fe0d3829a61dcf6680b917c5d859f2a1e6"
INITIAL_OPTIONS = {
    "D12": ("one-year-standard", "one-year-express", "two-year-standard", "two-year-express"),
    "E28A": ("two-year-standard",),
}
EXTENSION_OPTIONS = {"D12": "d12-extension", "E28A": "e28a-extension"}
LABELS = {
    "ru": {
        "D12": ("D12 на 1 год · Обычное оформление", "D12 на 1 год · Ускоренное оформление",
                "D12 на 2 года · Обычное оформление", "D12 на 2 года · Ускоренное оформление"),
        "E28A": ("Investor KITAS E28A на 2 года",),
        "d12-extension": "Продление D12", "e28a-extension": "Продление E28A",
        "unavailable": "Цена по запросу",
    },
    "en": {
        "D12": ("One-year D12 · Standard application", "One-year D12 · Expedited application",
                "Two-year D12 · Standard application", "Two-year D12 · Expedited application"),
        "E28A": ("Two-year Investor KITAS E28A",),
        "d12-extension": "D12 extension", "e28a-extension": "E28A extension",
        "unavailable": "Price on request",
    },
}


@lru_cache(maxsize=1)
def approved_summaries():
    raw = SUMMARY_PATH.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SUMMARY_SHA256:
        raise RuntimeError("Approved D12/E28A summary artifact drift")
    payload = json.loads(raw)
    if payload.get("schemaVersion") != 1 or payload.get("locales") != ["ru", "en"]:
        raise RuntimeError("Unsupported D12/E28A bot summary schema")
    for key in INITIAL_OPTIONS:
        for locale in ("ru", "en"):
            row = payload["entries"][key][locale]
            if hashlib.sha256(row["body"].encode()).hexdigest() != row["bodySha256"]:
                raise RuntimeError("Approved D12/E28A summary body drift")
            if "\n\n".join(unit["text"] for unit in row["sourceUnits"]) != row["body"]:
                raise RuntimeError("Approved D12/E28A source selection drift")
            for unit in row["sourceUnits"]:
                if hashlib.sha256(unit["text"].encode()).hexdigest() != unit["paragraphSha256"]:
                    raise RuntimeError("Approved D12/E28A source paragraph drift")
    return payload["entries"]


def render_card(key, locale, projection, *, format_idr, now=None):
    if key not in INITIAL_OPTIONS or locale not in {"ru", "en"}:
        raise ValueError("Unsupported D12/E28A bot card")
    row = approved_summaries()[key][locale]
    safe = _validated_projection(projection, now=now or datetime.now(timezone.utc))

    def display(entity_type, entity_key, option):
        quote = _quote(safe, entity_type, entity_key, option)
        if quote is None:
            return LABELS[locale]["unavailable"]
        amount, dollars = quote
        return format_idr(amount) + (f" (≈ ${dollars})" if dollars is not None else "")

    prices = [
        f"{label} — {display('VISA', key, option)}"
        for label, option in zip(LABELS[locale][key], INITIAL_OPTIONS[key])
    ]
    extension = EXTENSION_OPTIONS[key]
    prices.append(f"{LABELS[locale][extension]} — {display('SERVICE', 'visa-extension', extension)}")
    prefix = "https://safrway.online/" + ("en/" if locale == "en" else "")
    links = "\n\n".join(f"{link['label']}\n{prefix}{link['path'].lstrip('/')}" for link in row["links"])
    return "\n\n".join((row["body"], "\n".join(prices), links))
