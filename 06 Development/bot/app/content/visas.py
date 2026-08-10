from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

from app.services.i18n import text as i18n_text
from app.services.locale import current_locale


BASE_DIR = Path(__file__).resolve().parent
VISAS_PATH = BASE_DIR / "visas.json"


LEGACY_PRICE_BLOCKS = {
    "E33G": (
        "Стоимость под ключ — государственные сборы и сервис SAFR включены:",
        "Для подачи:",
    ),
    "D12": (
        "Стоимость под ключ на 1 год — государственные сборы и сервис SAFR включены:",
        "Для подачи:",
    ),
    "D1/D2": ("Виза на 1 год:", "Для подачи:"),
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


def _rounded_usd(idr_value: int, usdt_idr_rate) -> int | None:
    try:
        rate = Decimal(str(usdt_idr_rate))
    except (InvalidOperation, TypeError, ValueError):
        return None
    if not rate.is_finite() or rate <= 0:
        return None

    usd_value = Decimal(idr_value) / rate
    return int(
        (usd_value / Decimal("5")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        * Decimal("5")
    )


def _usd_price(price: dict, usdt_idr_rate) -> int | None:
    fixed_usd = price.get("usd")
    if fixed_usd is not None:
        return int(fixed_usd)
    return _rounded_usd(int(price["idr"]), usdt_idr_rate)


def _compact_idr(value: int) -> str:
    if value >= 10_000_000:
        millions = Decimal(value) / Decimal("1000000")
        compact = format(millions.normalize(), "f").replace(".", ",")
        return f"{compact}kk"
    if value >= 1_000:
        return f"{value // 1_000}k"
    return str(value)


PRICE_KEYS = {
    "E33G": ["visa.e33g.price.standard", "visa.e33g.price.express"],
    "D12": [
        "visa.d12.price.oneYearStandard",
        "visa.d12.price.oneYearExpress",
        "visa.d12.price.twoYearStandard",
        "visa.d12.price.twoYearExpress",
    ],
    "D1/D2": [
        "visa.d1d2.price.d1OneStandard",
        "visa.d1d2.price.d1OneExpress",
        "visa.d1d2.price.d2OneStandard",
        "visa.d1d2.price.d2OneExpress",
        "visa.d1d2.price.d1TwoStandard",
        "visa.d1d2.price.d1TwoExpress",
        "visa.d1d2.price.d2TwoStandard",
        "visa.d1d2.price.d2TwoExpress",
        "visa.d1d2.price.d1FiveStandard",
        "visa.d1d2.price.d1FiveExpress",
        "visa.d1d2.price.d2FiveStandard",
        "visa.d1d2.price.d2FiveExpress",
    ],
    "C1": ["visa.c1.price"],
    "VOA": ["visa.voa.price"],
}


def _price_block(
    key: str,
    prices: list[dict],
    usdt_idr_rate,
    price_note: str | None = None,
) -> str:
    if not prices:
        return ""

    lines = [
        i18n_text("visa.price.heading"),
        i18n_text("visa.price.feesIncluded"),
        i18n_text("visa.price.noExtra"),
    ]
    for index, price in enumerate(prices):
        idr_value = int(price["idr"])
        usd_value = _usd_price(price, usdt_idr_rate)
        usd_text = f" (≈ ${usd_value})" if usd_value is not None else ""
        label_key = PRICE_KEYS.get(key, [])[index]
        lines.append(
            i18n_text(
                "visa.price.line",
                variables={
                    "label": i18n_text(label_key),
                    "idr": _format_idr(idr_value),
                    "usdSuffix": usd_text,
                },
            )
        )

    if price_note:
        lines.extend(["", price_note])

    return "\n".join(lines)


def get_visa_menu_labels(usdt_idr_rate=None) -> dict[str, str]:
    with VISAS_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)

    base_labels = {
        "E33G": "ITAS E33G",
        "D12": "D12",
        "D1/D2": "D1/D2",
        "C1": "C1",
        "VOA": "eVOA",
    }
    labels: dict[str, str] = {}
    for key, base_label in base_labels.items():
        visible_prices = []
        for price in data[key].get(
            "menu_prices",
            data[key].get("prices", []),
        ):
            usd_price = _usd_price(price, usdt_idr_rate)
            idr_price = _compact_idr(int(price["idr"]))
            price_text = (
                f"{idr_price} / ${usd_price}"
                if usd_price is not None
                else idr_price
            )
            visible_prices.append(price_text)
        prefix_key = f"visa.{key.lower().replace('/', '')}.menuPricePrefix"
        menu_prefix = i18n_text(prefix_key) if key in {"E33G", "D12", "D1/D2"} else ""
        labels[key] = (
            f"{base_label} — {menu_prefix}{' · '.join(visible_prices)}"
            if visible_prices
            else base_label
        )
    return labels


def get_visa_card(key: str, usdt_idr_rate=None) -> str:
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
    price_text = "" if key == "D1/D2" and current_locale() == "en" else _price_block(
        key,
        visa.get("prices", []),
        usdt_idr_rate,
        i18n_text("visa.voa.priceNote") if key == "VOA" else visa.get("price_note"),
    )

    return (
        f"{visa_text}\n\n"
        f"{price_text}\n\n"
        f"{i18n_text('visa.disclaimer.conditionsMayChange')}\n\n"
        f"{i18n_text('visa.disclaimer.verifyBeforePayment')}\n\n"
        f"{i18n_text('visa.disclaimer.writeNext')}"
    )
