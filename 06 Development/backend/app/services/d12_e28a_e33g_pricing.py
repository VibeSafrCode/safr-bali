"""Founder 2026-10-09 combined D12/E28A + six E33G next-stage options.

One complete-catalog draft for ONE audited publication, not a seed or runtime
price source. Reuses D12's approved amount/label merge; appends only missing
existing-registry identities. Preserves E33G standard/express and every unrelated
field. Existing approved-option drift fails closed, not an Admin overwrite.
No Service/VisaType, migration, FX, order, customer or historical catalog writes.
"""
from copy import deepcopy

from app.models.catalog_pricing import PriceCatalogItem
from app.services.catalog_pricing import PricingConflict, PricingError, latest_publication
from app.services.d12_e28a_pricing import merge_d12_e28a_items


E33G_INITIAL_AMOUNTS = {"standard": 12_000_000, "express": 14_000_000}
# Exact approved RU/EN sentences from 03_E33G_STATUS_CHANGE, 2026-10-09.
# Do not copy next_stage_tariffs' historical unconditional Bridging notes.
BRIDGING_NOTE_RU = (
    "Bridging включён в согласованную услугу для VOA и KITAS, когда этот механизм применим и доступен в конкретном случае. "
    "Менеджер должен сначала проверить, доступен ли именно допустимый Bridging-маршрут, срок действующего пребывания и условия целевой E33G."
)
BRIDGING_NOTE_EN = (
    "Bridging is included in the agreed service for VOA and KITAS where that mechanism is applicable and available in the individual case. "
    "The manager must first verify whether the lawful Bridging route is available, the remaining permitted stay and eligibility for E33G."
)


def approved_e33g_items():
    """Six canonical identities already bound by shared service-registry.v1.json."""
    rows = []
    for entity_type, key, code, ru, en, amount, order, bridging in (
        ("SERVICE", "visa-extension", "e33g-extension", "Продление E33G", "E33G extension", 12_000_000, 60, False),
        ("SERVICE", "consultation", "e33g-document-review", "Проверка документов для E33G", "E33G document review", 2_000_000, 20, False),
        ("VISA", "E33G", "conversion-from-voa", "Переход с VOA/eVOA на E33G", "VOA/eVOA to E33G conversion", 17_000_000, 30, True),
        ("VISA", "E33G", "conversion-from-kitas", "Переход с KITAS на E33G", "KITAS to E33G conversion", 17_500_000, 40, True),
        ("VISA", "E33G", "conversion-from-c1", "Переход с C1 на E33G", "C1 to E33G conversion", 15_000_000, 50, False),
        ("VISA", "E33G", "conversion-from-d12", "Переход с D12 на E33G", "D12 to E33G conversion", 17_000_000, 60, False),
    ):
        rows.append({
            "sku": f"{entity_type.lower()}:{key}:{code}", "entity_type": entity_type,
            "entity_key": key, "option_code": code, "label_ru": ru, "label_en": en,
            "amount_idr": amount, "price_qualifier": "EXACT", "show_price": True,
            "fee_verification_status": "VERIFIED", "sort_order": order,
            "fee_note_ru": BRIDGING_NOTE_RU if bridging else None,
            "fee_note_en": BRIDGING_NOTE_EN if bridging else None,
        })
    return rows


def merge_e33g_items(current_items):
    merged = deepcopy(list(current_items))
    identities, skus = {}, {}
    for item in merged:
        identity = tuple(item.get(key) for key in ("entity_type", "entity_key", "option_code"))
        sku = item.get("sku")
        if (any(not isinstance(part, str) or not part for part in identity)
                or not isinstance(sku, str) or not sku or identity in identities or sku in skus):
            raise PricingConflict("Duplicate or missing catalog identity")
        identities[identity], skus[sku] = item, item
    if not {("SERVICE", "visa-extension", "default"), ("SERVICE", "consultation", "default")} <= identities.keys():
        raise PricingError("Existing extension and consultation defaults required; do not create business services")
    for code, amount in E33G_INITIAL_AMOUNTS.items():
        row = identities.get(("VISA", "E33G", code))
        if (row is None or row.get("amount_idr") != amount or row.get("price_qualifier") != "EXACT"
                or row.get("fee_verification_status") != "VERIFIED" or row.get("show_price") is not True):
            raise PricingConflict("Existing verified E33G standard 12m and express 14m must match untouched")
    for approved in approved_e33g_items():
        identity = tuple(approved[key] for key in ("entity_type", "entity_key", "option_code"))
        existing = identities.get(identity)
        if existing is not None:
            if any(existing.get(key) != value for key, value in approved.items()):
                raise PricingConflict("E33G approved option conflicts with existing Admin fields")
        elif approved["sku"] in skus:
            raise PricingConflict("Approved E33G SKU belongs to another catalog identity")
        else:
            merged.append(approved)
            identities[identity], skus[approved["sku"]] = approved, approved
    return merged


def merge_d12_e28a_e33g_items(current_items):
    return merge_e33g_items(merge_d12_e28a_items(current_items))


def prepare_d12_e28a_e33g_catalog(db, *, expected_publication_version):
    """Read-only planner. The publisher independently guards the approved delta."""
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
                "items": merge_d12_e28a_e33g_items(items)}
