"""Founder-approved D1/D2 delta over the FULL active catalog, never a seed.

Only eight initial amounts may change. An explicit flag additionally permits the
four known legacy five-year fixed prices to become CONTACT quotes. All other
authored fields, identities and historical records are preserved. Publication
stays with existing Admin preview/publish/restore and concurrency guards.
"""
from copy import deepcopy

from app.models.catalog_pricing import PriceCatalogItem
from app.services.catalog_pricing import PricingConflict, PricingError, latest_publication


APPROVED_AMOUNTS = {
    "d1-one-year-standard": 5_000_000,
    "d1-one-year-express": 6_500_000,
    "d1-two-year-standard": 9_000_000,
    "d1-two-year-express": 11_000_000,
    "d2-one-year-standard": 5_500_000,
    "d2-one-year-express": 7_000_000,
    "d2-two-year-standard": 9_000_000,
    "d2-two-year-express": 11_000_000,
}
FIVE_YEAR_CODES = tuple(f"{visa}-five-year-{tariff}"
                        for visa in ("d1", "d2") for tariff in ("standard", "express"))
LEGACY_FIVE_YEAR_AMOUNTS = dict(zip(FIVE_YEAR_CODES, (18_000_000, 20_000_000, 20_000_000, 22_000_000)))


def approved_extensions():
    return [{
        "sku": f"service:visa-extension:{visa}-extension",
        "entity_type": "SERVICE", "entity_key": "visa-extension", "option_code": f"{visa}-extension",
        "label_ru": f"Продление {visa.upper()}", "label_en": f"{visa.upper()} extension",
        "amount_idr": 2_500_000, "price_qualifier": "EXACT", "show_price": True,
        "fee_verification_status": "VERIFIED", "fee_note_ru": None, "fee_note_en": None,
        "sort_order": order,
    } for visa, order in (("d1", 40), ("d2", 50))]


def merge_d1_d2_items(current_items, *, approve_five_year_contact=False):
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
        raise PricingError("Existing extension service default required")
    for code in FIVE_YEAR_CODES:
        row = identities.get(("VISA", "D1/D2", code))
        if (row is not None and row.get("price_qualifier") == "CONTACT"
                and row.get("amount_idr") is None and row.get("show_price") is False):
            continue
        if (approve_five_year_contact is not True or row is None
                or row.get("price_qualifier") != "EXACT" or row.get("show_price") is not True
                or row.get("fee_verification_status") != "VERIFIED"
                or row.get("amount_idr") != LEGACY_FIVE_YEAR_AMOUNTS[code]):
            raise PricingConflict("Five-year options require CONTACT or explicit approval of exact legacy transition")
        row.update(amount_idr=None, price_qualifier="CONTACT", show_price=False)
    for code, amount in APPROVED_AMOUNTS.items():
        row = identities.get(("VISA", "D1/D2", code))
        if (row is None or row.get("price_qualifier") != "EXACT"
                or row.get("fee_verification_status") != "VERIFIED" or row.get("show_price") is not True):
            raise PricingConflict("Existing verified D1/D2 initial option required")
        row["amount_idr"] = amount
    for approved in approved_extensions():
        identity = (approved["entity_type"], approved["entity_key"], approved["option_code"])
        existing = identities.get(identity)
        if existing is not None:
            if any(existing.get(key) != value for key, value in approved.items()):
                raise PricingConflict("D1/D2 extension conflicts with existing Admin fields")
        elif approved["sku"] in skus:
            raise PricingConflict("Extension SKU belongs to another identity")
        else:
            merged.append(approved)
    return merged


def prepare_d1_d2_catalog(db, *, expected_publication_version, approve_five_year_contact=False):
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
                "items": merge_d1_d2_items(items, approve_five_year_contact=approve_five_year_contact)}
