from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
VISAS_PATH = BASE_DIR / "visas.json"


LEGACY_PRICE_BLOCKS = {
    "E33G": ("Стоимость:", "Для подачи:"),
    "D12": ("Стоимость на 1 год:", "Для подачи:"),
    "D1/D2": ("Виза на 1 год:", "Для подачи:"),
}


def _without_legacy_prices(key: str, text: str) -> str:
    markers = LEGACY_PRICE_BLOCKS.get(key)
    if not markers:
        return text

    start, end = markers
    pattern = rf"\n\n{re.escape(start)}.*?\n\n{re.escape(end)}"
    return re.sub(pattern, f"\n\n{end}", text, flags=re.DOTALL)


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


def _price_block(prices: list[dict], usdt_idr_rate) -> str:
    if not prices:
        return ""

    lines = ["💰 Стоимость:"]
    has_usd = False
    for price in prices:
        idr_value = int(price["idr"])
        usd_value = _rounded_usd(idr_value, usdt_idr_rate)
        usd_text = f" (≈ ${usd_value})" if usd_value is not None else ""
        has_usd = has_usd or usd_value is not None
        lines.append(f"▪️ {price['label']}: {_format_idr(idr_value)}{usd_text}")

    if has_usd:
        lines.extend(
            [
                "",
                "Курс: USDT/IDR Indodax. Долларовый эквивалент округлён до $5 "
                "и обновляется раз в 3 дня.",
            ]
        )
    return "\n".join(lines)


def get_visa_card(key: str, usdt_idr_rate=None) -> str:
    with VISAS_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)

    visa = data[key]
    visa_text = _without_legacy_prices(
        key,
        visa["text"].replace("\\n", "\n"),
    )
    price_text = _price_block(visa.get("prices", []), usdt_idr_rate)

    return (
        f"{visa_text}\n\n"
        f"{price_text}\n\n"
        "❗️Сроки, условия и требования могут меняться из-за работы иммиграционной системы, "
        "новых постановлений, праздников и технических сбоев.\n\n"
        "Перед оплатой мы дополнительно проверим актуальные условия по вашей ситуации.\n\n"
        "Чтобы оставить заявку или задать вопрос по этой визе — напишите следующим сообщением."
    )
