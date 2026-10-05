"""Prepare the approved next-stage tariff delta, without publishing or DB writes.

This is an additive draft builder, not a runtime price source or bootstrap seed.
Feed its complete items and expected publication version into the existing Admin
preview/publish workflow. That workflow retains authorization, freshness,
concurrency and immutable-history guarantees. Production publication is separate.
"""
from copy import deepcopy

from app.models.catalog_pricing import PriceCatalogItem
from app.services.catalog_pricing import PricingConflict, PricingError, latest_publication


def _approved_items():
    rows = []
    for entity_type, key, code, ru, en, amount, order, bridging in (
        ("SERVICE", "visa-extension", "d1-extension", "Продление D1", "D1 extension", 2_500_000, 40, False),
        ("SERVICE", "visa-extension", "d2-extension", "Продление D2", "D2 extension", 2_500_000, 50, False),
        ("SERVICE", "visa-extension", "e33g-extension", "Продление E33G", "E33G extension", 12_000_000, 60, False),
        ("SERVICE", "consultation", "e33g-document-review", "Проверка документов для E33G", "E33G document review", 2_000_000, 20, False),
        ("VISA", "E33G", "conversion-from-voa", "Переход с VOA/eVOA на E33G", "VOA/eVOA to E33G conversion", 17_000_000, 30, True),
        ("VISA", "E33G", "conversion-from-kitas", "Переход с KITAS на E33G", "KITAS to E33G conversion", 17_500_000, 40, True),
        ("VISA", "E33G", "conversion-from-c1", "Переход с C1 на E33G", "C1 to E33G conversion", 15_000_000, 50, False),
        ("VISA", "E33G", "conversion-from-d12", "Переход с D12 на E33G", "D12 to E33G conversion", 17_000_000, 60, False),
    ):
        rows.append({
            "sku": f"{entity_type.lower()}:{key}:{code}",
            "entity_type": entity_type, "entity_key": key, "option_code": code,
            "label_ru": ru, "label_en": en, "amount_idr": amount,
            "price_qualifier": "EXACT", "show_price": True,
            "fee_verification_status": "VERIFIED", "sort_order": order,
            "fee_note_ru": "Bridging включён в стоимость." if bridging else None,
            "fee_note_en": "Bridging is included in the price." if bridging else None,
        })
    return rows


def _identity(item):
    return item.get("entity_type"), item.get("entity_key"), item.get("option_code")


def merge_next_stage_tariffs(current_items):
    """Append exactly eight approved options, preserving every existing field.

    An exact replay is a no-op. Duplicate identities/SKUs or a subsequent Admin
    change to any approved field fail closed rather than silently being replaced.
    Existing base/default options are required: never create a business service.
    """
    merged = deepcopy(list(current_items))
    identities, skus = {}, {}
    for item in merged:
        identity, sku = _identity(item), item.get("sku")
        if (any(not isinstance(part, str) or not part for part in identity)
                or not isinstance(sku, str) or not sku
                or identity in identities or sku in skus):
            raise PricingConflict("Current catalog contains duplicate or missing identities")
        identities[identity], skus[sku] = item, item
    required = {
        ("SERVICE", "visa-extension", "default"),
        ("SERVICE", "consultation", "default"),
        ("VISA", "E33G", "standard"),
    }
    if not required.issubset(identities):
        raise PricingError("Existing visa-extension, consultation and E33G base options are required")
    for approved in _approved_items():
        identity, sku = _identity(approved), approved["sku"]
        existing = identities.get(identity)
        if existing is not None:
            if any(existing.get(key) != value for key, value in approved.items()):
                raise PricingConflict("Approved tariff identity already has different fields")
        elif sku in skus:
            raise PricingConflict("Approved tariff SKU is assigned to another identity")
        else:
            merged.append(approved)
            identities[identity], skus[sku] = approved, approved
    return merged


def prepare_next_stage_tariffs(db, *, expected_publication_version):
    """Read the complete current immutable catalog; never flush, publish or commit.

    The returned expected version MUST also be passed to the existing publisher,
    which rejects an intervening catalog or FX publication. No historical prices,
    orders, service records, or FX snapshots are modified by this helper.
    """
    if type(expected_publication_version) is not int or expected_publication_version < 1:
        raise PricingError("A positive expected publication version is required")
    with db.no_autoflush:
        current = latest_publication(db)
        if current is None:
            raise PricingError("An existing published catalog is required")
        if current.version != expected_publication_version:
            raise PricingConflict("Catalog publication version changed")
        fields = [column.name for column in PriceCatalogItem.__table__.columns
                  if column.name not in {"id", "catalog_version_id"}]
        rows = db.query(PriceCatalogItem).filter_by(
            catalog_version_id=current.catalog_version_id,
        ).order_by(PriceCatalogItem.id).all()
        items = [{field: getattr(row, field) for field in fields} for row in rows]
        return {"expected_publication_version": current.version,
                "items": merge_next_stage_tariffs(items)}
