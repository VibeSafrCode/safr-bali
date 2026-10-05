from __future__ import annotations

import json
import hashlib
import re
from functools import lru_cache
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from app.services.i18n import text as i18n_text
from app.services.exchange_rates import _validated_projection
from app.services.locale import current_locale
from app.content.d1_d2_summaries import INITIAL_OPTIONS, _quote as _d1_d2_quote, render_combined_card


BASE_DIR = Path(__file__).resolve().parent
VISAS_PATH = BASE_DIR / "visas.json"
SUMMARIES_PATH = BASE_DIR.parents[2] / "shared/content/generated/bot-visa-summaries.v1.json"


@lru_cache(maxsize=1)
def _approved_summary(key: str, locale: str):
    # Full site copy stays in Registry/legacy adapters, not this shorter bot view.
    if not SUMMARIES_PATH.exists():
        return None
    data = json.loads(SUMMARIES_PATH.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != 1:
        raise RuntimeError("Unsupported approved bot summary schema")
    summary = data["entries"].get(key, {}).get(locale)
    if summary and hashlib.sha256(summary["body"].encode()).hexdigest() != summary["bodySha256"]:
        raise RuntimeError("Approved bot summary hash drift")
    return summary


LEGACY_PRICE_BLOCKS = {
    "E33G": (
        "Стоимость под ключ — государственные сборы и сервис SAFR включены:",
        "Для подачи:",
    ),
    "D12": (
        "Стоимость под ключ на 1 год — государственные сборы и сервис SAFR включены:",
        "Для подачи:",
    ),
    "D1/D2": ("Все указанные цены", "Для подачи:"),
    "VOA": ("Стоимость оформления SAFR:", "Для оформления:"),
}


def _without_legacy_prices(key: str, text: str) -> str:
    markers = LEGACY_PRICE_BLOCKS.get(key)
    if not markers:
        return text

    start, end = markers
    pattern = rf"\n\n{re.escape(start)}.*?\n\n{re.escape(end)}"
    return re.sub(pattern, f"\n\n{end}", text, flags=re.DOTALL)


def _without_english_prices(key: str, value: str) -> str:
    markers = {
        "E33G": ("All-inclusive price —", "Documents required:"),
        "D12": ("All-inclusive price for 1 year —", "Documents required:"),
        "D1/D2": ("All listed prices", "Documents required:"),
        "C1": ("SAFR processing price:", "Documents required:"),
        "VOA": ("SAFR processing price:", "Documents required:"),
    }.get(key)
    if not markers:
        return value
    start, end = markers
    return re.sub(
        rf"\n\n{re.escape(start)}.*?\n\n{re.escape(end)}",
        f"\n\n{end}",
        value,
        flags=re.DOTALL,
    )


def _format_idr(value: int) -> str:
    return f"Rp {value:,}".replace(",", ".")


def _compact_idr(value: int) -> str:
    if value >= 10_000_000:
        millions = Decimal(value) / Decimal("1000000")
        compact = format(millions.normalize(), "f").replace(".", ",")
        return f"{compact}kk"
    if value >= 1_000:
        return f"{value // 1_000}k"
    return str(value)


def _canonical_price_items(key: str, pricing_projection) -> list[dict]:
    if not isinstance(pricing_projection, dict):
        return []
    items = pricing_projection.get("items")
    if not isinstance(items, list):
        return []
    return sorted(
        [
            item for item in items
            if isinstance(item, dict)
            and item.get("entity_type") == "VISA"
            and item.get("entity_key") == key
            and (key != "E33G" or item.get("option_code") in {"standard", "express"})
            and (
                key != "D1/D2"
                or (
                    isinstance(item.get("option_code"), str)
                    and item["option_code"] in INITIAL_OPTIONS
                    and _d1_d2_quote(pricing_projection, "VISA", "D1/D2", item["option_code"]) is not None
                )
            )
            and item.get("show_price") is True
            and item.get("amount_idr") is not None
        ],
        key=lambda item: (int(item.get("sort_order", 0)), str(item.get("sku", ""))),
    )


def _canonical_price_block(key: str, pricing_projection) -> str:
    items = _canonical_price_items(key, pricing_projection)
    if not items:
        if key not in {"E33G", "D12", "D1/D2", "C1", "VOA"}:
            return ""
        return (
            "Current price is temporarily unavailable. Ask the manager before payment."
            if current_locale() == "en"
            else "Актуальная цена временно недоступна. Уточните её у менеджера до оплаты."
        )
    locale = current_locale()
    lines = [
        i18n_text("visa.price.heading"),
        i18n_text("visa.price.feesIncluded"),
        i18n_text("visa.price.noExtra"),
    ]
    for item in items:
        label_value = item.get("label")
        label = label_value.get(locale) if isinstance(label_value, dict) else item.get("option_code")
        amount_idr = int(item["amount_idr"])
        derived = item.get("display_usd_approx")
        usd_suffix = f" (≈ ${derived})" if derived is not None else ""
        lines.append(
            i18n_text(
                "visa.price.line",
                variables={
                    "label": label,
                    "idr": _format_idr(amount_idr),
                    "usdSuffix": usd_suffix,
                },
            )
        )
    fee_note = items[0].get("fee_note")
    localized_note = fee_note.get(locale) if isinstance(fee_note, dict) else None
    if localized_note:
        lines.extend(["", localized_note])
    return "\n".join(lines)


def get_visa_menu_labels(pricing_projection=None) -> dict[str, str]:
    pricing_projection = _validated_projection(pricing_projection, now=datetime.now(timezone.utc))
    base_labels = {
        "E33G": "ITAS E33G",
        "D12": "D12",
        "D1/D2": "D1/D2",
        "C1": "C1",
        "VOA": "eVOA",
    }
    labels: dict[str, str] = {}
    for key, base_label in base_labels.items():
        items = _canonical_price_items(key, pricing_projection)
        visible_prices = []
        if items:
            lowest = min(items, key=lambda item: int(item["amount_idr"]))
            idr_price = _compact_idr(int(lowest["amount_idr"]))
            derived = lowest.get("display_usd_approx")
            visible_prices.append(
                f"{idr_price} / ≈ ${derived}" if derived is not None else idr_price
            )
        prefix_key = f"visa.{key.lower().replace('/', '')}.menuPricePrefix"
        menu_prefix = i18n_text(prefix_key) if key in {"E33G", "D12", "D1/D2"} else ""
        labels[key] = (
            f"{base_label} — {menu_prefix}{' · '.join(visible_prices)}"
            if visible_prices
            else base_label
        )
    return labels


def get_visa_card(key: str, pricing_projection=None) -> str:
    # Recheck at rendering time: a previously accepted projection can expire
    # between fetch and send. Reuse the canonical TTL policy, never local FX.
    pricing_projection = _validated_projection(pricing_projection, now=datetime.now(timezone.utc))
    if key == "D1/D2":
        body = render_combined_card(current_locale(), pricing_projection, format_idr=_format_idr)
        return "\n\n".join([body, i18n_text('visa.disclaimer.conditionsMayChange'),
                             i18n_text('visa.disclaimer.verifyBeforePayment'), i18n_text('visa.disclaimer.writeNext')])
    with VISAS_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)

    visa = data[key]
    body_keys = {
        "E33G": "visa.e33g.body",
        "D12": "visa.d12.body",
        "D1/D2": "visa.d1d2.body",
        "C1": "visa.c1.body",
        "VOA": "visa.voa.body",
        "Другая виза": "visa.other.body",
    }
    if current_locale() == "ru":
        visa_text = _without_legacy_prices(
            key,
            visa["text"].replace("\\n", "\n"),
        )
    else:
        visa_text = _without_english_prices(key, i18n_text(body_keys[key]))
    price_text = _canonical_price_block(key, pricing_projection)
    summary = _approved_summary(key, current_locale())
    if summary:
        visa_text = summary["body"]
        if summary.get("priceUnitNote"):
            price_text = summary["priceUnitNote"] + "\n" + price_text
    extension = {"C1": "c1-extension", "VOA": "voa-extension"}.get(key)
    extension_lines = []
    if extension and isinstance(pricing_projection, dict):
        items = pricing_projection.get("items")
        matches = [item for item in items if isinstance(item, dict)
                   and item.get("entity_type") == "SERVICE"
                   and item.get("entity_key") == "visa-extension"
                   and item.get("option_code") == extension] if isinstance(items, list) else []
        if len(matches) == 1:
            item = matches[0]
            amount = str(item.get("amount_idr", ""))
            if (item.get("show_price") is True and item.get("price_qualifier") == "EXACT"
                    and re.fullmatch(r"[1-9]\d{0,17}", amount)):
                labels = item.get("label")
                label = labels.get(current_locale(), extension) if isinstance(labels, dict) else extension
                display = item.get("display_usd_approx")
                suffix = f" (≈ ${display})" if display is not None else ""
                extension_lines.append(i18n_text("visa.price.line", variables={
                    "label": label, "idr": _format_idr(int(amount)), "usdSuffix": suffix,
                }))
    if extension_lines:
        price_text += "\n\n" + "\n".join(extension_lines)

    return (
        f"{visa_text}\n\n"
        f"{price_text}\n\n"
        f"{i18n_text('visa.disclaimer.conditionsMayChange')}\n\n"
        f"{i18n_text('visa.disclaimer.verifyBeforePayment')}\n\n"
        f"{i18n_text('visa.disclaimer.writeNext')}"
        + (f"\n\n{summary['publicUrl']}" if summary else "")
    )


def visa_card_parts(text: str, limit: int = 3500) -> list[str]:
    """Paragraph-safe Telegram chunks; count UTF-16 units, never truncate copy."""
    parts, current = [], ""
    def size(value):
        return len(value.encode("utf-16-le")) // 2
    for paragraph in text.split("\n\n"):
        if size(paragraph) > limit:
            # Authored paragraphs normally fit; preserve any exceptional one.
            units = ""
            for char in paragraph:
                if size(units + char) > limit:
                    if current:
                        parts.append(current)
                        current = ""
                    parts.append(units)
                    units = ""
                units += char
            paragraph = units
        combined = current + ("\n\n" if current else "") + paragraph
        if size(combined) > limit:
            parts.append(current)
            current = paragraph
        else:
            current = combined
    if current:
        parts.append(current)
    return parts
