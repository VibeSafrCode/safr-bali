"""Prepare the approved extension-price delta; never publish or commit implicitly.

Use prepare_extension_catalog against the current publication, then pass its full
items to the existing preview/publish workflow. Never rebuild a live catalog from
the bootstrap seed. Root authorization, CSRF, idempotency and fresh-FX gates remain
the responsibility of the existing publication API/service.
"""
from copy import deepcopy

from app.models.catalog_pricing import PriceCatalogItem
from app.services.catalog_pricing import PricingConflict, PricingError, latest_publication


def _approved_items():
    return [
        {
            "sku": f"service:visa-extension:{code}",
            "entity_type": "SERVICE", "entity_key": "visa-extension", "option_code": code,
            "label_ru": ru, "label_en": en, "price_qualifier": "EXACT",
            "amount_idr": amount, "show_price": True, "fee_verification_status": "VERIFIED",
            "fee_note_ru": None, "fee_note_en": None, "sort_order": order,
        }
        for code, ru, en, amount, order in (
            ("c1-extension", "Продление C1", "C1 extension", 2_000_000, 20),
            ("voa-extension", "Продление VOA/eVOA", "VOA/eVOA extension", 850_000, 30),
        )
    ]


def _identity(item):
    return item.get("entity_type"), item.get("entity_key"), item.get("option_code")


def merge_extension_items(current_items):
    """Append missing approved rows to a complete snapshot, or fail on drift.

    Existing rows (including labels, notes, hidden/default rows) remain byte-value
    equivalent and in the original order. Existing approved rows must match all
    approved fields: do not silently overwrite a subsequent administrator edit.
    """
    merged = deepcopy(list(current_items))
    by_identity, by_sku = {}, {}
    for item in merged:
        identity, sku = _identity(item), item.get("sku")
        if identity in by_identity or not sku or sku in by_sku:
            raise PricingConflict("Current catalog contains duplicate or missing identities")
        by_identity[identity], by_sku[sku] = item, item
    if ("SERVICE", "visa-extension", "default") not in by_identity:
        raise PricingError("Existing visa-extension default is required; do not seed a partial catalog")
    for approved in _approved_items():
        existing = by_identity.get(_identity(approved))
        if existing is not None:
            if any(existing.get(key) != value for key, value in approved.items()):
                raise PricingConflict("Approved extension identity already has different fields")
        elif approved["sku"] in by_sku:
            raise PricingConflict("Approved extension SKU is assigned to another identity")
        else:
            merged.append(approved)
    return merged


def prepare_extension_catalog(db, *, expected_publication_version):
    """Read all authored fields from the active immutable catalog; no DB writes.

    The caller must use the returned expected_publication_version at publish time;
    the existing publisher catches any intervening catalog/FX publication.
    """
    current = latest_publication(db)
    if current is None:
        raise PricingError("An existing published catalog is required")
    if current.version != expected_publication_version:
        raise PricingConflict("Catalog publication version changed")
    columns = [column.name for column in PriceCatalogItem.__table__.columns
               if column.name not in {"id", "catalog_version_id"}]
    rows = db.query(PriceCatalogItem).filter_by(
        catalog_version_id=current.catalog_version_id,
    ).order_by(PriceCatalogItem.id).all()
    items = [{field: getattr(row, field) for field in columns} for row in rows]
    return {
        "expected_publication_version": current.version,
        "items": merge_extension_items(items),
    }
