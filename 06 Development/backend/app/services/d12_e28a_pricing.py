"""Founder-approved D12/E28A delta over the complete current catalog.

This prepares data only. Existing identities, notes and historical rows are
retained; only D12 amounts and RU/EN processing labels change. Publication uses
the existing audited, version-guarded publisher.
No seed import, VisaType creation, FX calculation or next-stage bulk activation.
"""
from copy import deepcopy

from app.models.catalog_pricing import PriceCatalogItem
from app.services.catalog_pricing import PricingConflict, PricingError, latest_publication


APPROVED_AMOUNTS = {
    "one-year-standard": 7_500_000,
    "one-year-express": 9_500_000,
    "two-year-standard": 10_500_000,
    "two-year-express": 13_000_000,
}
# Timing comes from the approved 2026-10-09 RU/EN D12 main bodies, not
# the legacy catalog's express-three-day label. These remain estimates.
APPROVED_LABELS = {
    "one-year-standard": ("1 год, обычное — около 10 рабочих дней", "One-year D12, standard application — around 10 working days"),
    "one-year-express": ("1 год, ускоренное — около 5–6 рабочих дней", "One-year D12, expedited application — around 5–6 working days"),
    "two-year-standard": ("2 года, обычное — около 10 рабочих дней", "Two-year D12, standard application — around 10 working days"),
    "two-year-express": ("2 года, ускоренное — около 5–6 рабочих дней", "Two-year D12, expedited application — around 5–6 working days"),
}
CONVERSION_IDENTITY = ("VISA", "E33G", "conversion-from-d12")


def approved_additions():
    return [
        {
            "sku": "service:visa-extension:d12-extension",
            "entity_type": "SERVICE", "entity_key": "visa-extension", "option_code": "d12-extension",
            "label_ru": "Продление D12 — один этап", "label_en": "D12 extension — one stage",
            "amount_idr": 7_000_000, "price_qualifier": "EXACT", "show_price": True,
            "fee_verification_status": "VERIFIED", "fee_note_ru": None, "fee_note_en": None,
            "sort_order": 70,
        },
        {
            "sku": "visa:E28A:two-year-standard",
            "entity_type": "VISA", "entity_key": "E28A", "option_code": "two-year-standard",
            "label_ru": "Investor KITAS E28A — 2 года", "label_en": "Investor KITAS E28A — 2 years",
            "amount_idr": 16_000_000, "price_qualifier": "EXACT", "show_price": True,
            "fee_verification_status": "VERIFIED", "fee_note_ru": None, "fee_note_en": None,
            "sort_order": 10,
        },
        {
            "sku": "service:visa-extension:e28a-extension",
            "entity_type": "SERVICE", "entity_key": "visa-extension", "option_code": "e28a-extension",
            "label_ru": "Продление E28A — индивидуальная оценка", "label_en": "E28A extension — individual assessment",
            "amount_idr": None, "price_qualifier": "CONTACT", "show_price": False,
            "fee_verification_status": "NEEDS_VERIFICATION", "fee_note_ru": None, "fee_note_en": None,
            "sort_order": 80,
        },
    ]


def merge_d12_e28a_items(current_items):
    """Merge four amounts/labels and three missing approved options; fail on drift."""
    merged = deepcopy(list(current_items))
    identities, skus = {}, {}
    for item in merged:
        identity = tuple(item.get(key) for key in ("entity_type", "entity_key", "option_code"))
        sku = item.get("sku")
        if (any(not isinstance(part, str) or not part for part in identity)
                or not isinstance(sku, str) or not sku or identity in identities or sku in skus):
            raise PricingConflict("Duplicate or missing catalog identity")
        identities[identity], skus[sku] = item, item
    if ("SERVICE", "visa-extension", "default") not in identities:
        raise PricingError("Existing extension service default required; do not seed a partial catalog")
    conversion = identities.get(CONVERSION_IDENTITY)
    if conversion is not None and (
        conversion.get("amount_idr") != 17_000_000 or conversion.get("price_qualifier") != "EXACT"
        or conversion.get("show_price") is not True or conversion.get("fee_verification_status") != "VERIFIED"
    ):
        raise PricingConflict("Existing D12 to E33G conversion conflicts with approved 17m option")
    for code, amount in APPROVED_AMOUNTS.items():
        row = identities.get(("VISA", "D12", code))
        if (row is None or row.get("price_qualifier") != "EXACT"
                or row.get("fee_verification_status") != "VERIFIED" or row.get("show_price") is not True):
            raise PricingConflict("Existing verified D12 initial option required")
        row.update(amount_idr=amount, label_ru=APPROVED_LABELS[code][0], label_en=APPROVED_LABELS[code][1])
    for approved in approved_additions():
        identity = tuple(approved[key] for key in ("entity_type", "entity_key", "option_code"))
        existing = identities.get(identity)
        if existing is not None:
            if any(existing.get(key) != value for key, value in approved.items()):
                raise PricingConflict("D12/E28A option conflicts with existing Admin fields")
        elif approved["sku"] in skus:
            raise PricingConflict("Approved SKU belongs to another catalog identity")
        else:
            merged.append(approved)
    return merged


def prepare_d12_e28a_catalog(db, *, expected_publication_version):
    if type(expected_publication_version) is not int or expected_publication_version < 1:
        raise PricingError("Positive expected publication version required")
    with db.no_autoflush:
        current = latest_publication(db)
        if current is None or current.version != expected_publication_version:
            raise PricingConflict("Catalog publication version changed")
        fields = [column.name for column in PriceCatalogItem.__table__.columns
                  if column.name not in {"id", "catalog_version_id"}]
        rows = db.query(PriceCatalogItem).filter_by(catalog_version_id=current.catalog_version_id).order_by(PriceCatalogItem.id)
        items = [{field: getattr(row, field) for field in fields} for row in rows]
        return {"expected_publication_version": current.version,
                "items": merge_d12_e28a_items(items)}
