from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP


CATALOG = {
    "E33G": [("standard", "Стандарт", 12_000_000), ("express", "Экспресс", 14_000_000)],
    "D12": [
        ("one-year-standard", "1 год, стандарт", 7_500_000),
        ("one-year-express", "1 год, экспресс", 10_000_000),
        ("two-year-standard", "2 года, стандарт", 12_500_000),
        ("two-year-express", "2 года, экспресс", 14_500_000),
    ],
    "D1/D2": [
        ("d1-one-year-standard", "D1, 1 год, стандарт", 5_500_000),
        ("d1-one-year-express", "D1, 1 год, экспресс", 6_700_000),
        ("d2-one-year-standard", "D2, 1 год, стандарт", 6_500_000),
        ("d2-one-year-express", "D2, 1 год, экспресс", 7_700_000),
        ("d1-two-year-standard", "D1, 2 года, стандарт", 9_000_000),
        ("d1-two-year-express", "D1, 2 года, экспресс", 10_500_000),
        ("d2-two-year-standard", "D2, 2 года, стандарт", 9_500_000),
        ("d2-two-year-express", "D2, 2 года, экспресс", 11_500_000),
        ("d1-five-year-standard", "D1, 5 лет, стандарт", 18_000_000),
        ("d1-five-year-express", "D1, 5 лет, экспресс", 20_000_000),
        ("d2-five-year-standard", "D2, 5 лет, стандарт", 20_000_000),
        ("d2-five-year-express", "D2, 5 лет, экспресс", 22_000_000),
    ],
    "C1": [("standard", "C1", 2_500_000)],
    "VOA": [("standard", "eVOA", 800_000)],
}


def pricing_projection(rate: str = "16000", *, now: datetime | None = None) -> dict:
    observed = now or datetime.now(timezone.utc)
    ask = Decimal(rate)
    items = []
    order = 0
    for entity_key, rows in CATALOG.items():
        for option_code, label, amount in rows:
            order += 10
            derived = (Decimal(amount) / ask).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            items.append({
                "sku": f"visa:{entity_key}:{option_code}",
                "entity_type": "VISA",
                "entity_key": entity_key,
                "option_code": option_code,
                "label": {"ru": label, "en": label},
                "price_qualifier": "EXACT",
                "amount_idr": str(amount),
                "show_price": True,
                "fee_verification_status": "VERIFIED",
                "fee_note": {
                    "ru": "В цене eVOA уже учтён официальный PNBP 500.000 IDR." if entity_key == "VOA" else None,
                    "en": "The eVOA price includes the official PNBP fee of 500,000 IDR." if entity_key == "VOA" else None,
                },
                "display_usdt": str(derived),
                "sort_order": order,
            })
    items.append({
        "sku": "service:housing:default",
        "entity_type": "SERVICE",
        "entity_key": "housing",
        "option_code": "default",
        "label": {"ru": "Подбор жилья", "en": "Housing search"},
        "price_qualifier": "CONTACT",
        "amount_idr": None,
        "show_price": False,
        "fee_verification_status": "NEEDS_VERIFICATION",
        "fee_note": {"ru": None, "en": None},
        "display_usdt": None,
        "sort_order": 10,
    })
    return {
        "projection_id": "pricing-projection-v7",
        "publication_version": 7,
        "catalog_version_id": 3,
        "catalog_version": 3,
        "fx_snapshot_id": 11,
        "formula_version": "IDR_DIV_ASK_USDTIDR_HALF_UP_2DP_V1",
        "accepted_at": observed.isoformat(),
        "derived_expires_at": (observed + timedelta(minutes=15)).isoformat(),
        "max_refresh_lag_seconds": 60,
        "currency": "IDR",
        "fx": {"version": 11, "status": "fresh", "ask_idr_per_usdt": rate, "is_manual_override": False},
        "items": items,
    }
