"""Fixed display-only C1 quotes from one authoritative catalog/FX projection.

Not order offers, new SKUs, or eligibility promises. Never add rounded display
amounts: total integer IDR first, then use the existing Decimal conversion once.
"""
from datetime import datetime, timezone

from app.services.catalog_pricing import idr_to_usd_approx, idr_to_usdt


ISSUANCE = ("VISA", "C1", "standard")
EXTENSION = ("SERVICE", "visa-extension", "c1-extension")
RECIPES = (
    ("c1-issuance-plus-1-extension", ((ISSUANCE, 1), (EXTENSION, 1))),
    ("c1-issuance-plus-2-extensions", ((ISSUANCE, 1), (EXTENSION, 2))),
    ("c1-extension-x1", ((EXTENSION, 1),)),
    ("c1-extension-x2", ((EXTENSION, 2),)),
    ("c1-extension-x3", ((EXTENSION, 3),)),
)


def _exact_amount(matches):
    if len(matches) != 1:
        return None
    item = matches[0]
    amount = item.get("amount_idr")
    if (item.get("show_price") is not True or item.get("price_qualifier") != "EXACT"
            or item.get("fee_verification_status") != "VERIFIED"
            or not isinstance(amount, str) or not amount.isascii() or not amount.isdigit()
            or int(amount) <= 0):
        return None
    return int(amount)


def catalog_compositions(projection, *, now=None):
    """No DB reread: every input/version comes from the same public projection."""
    instant = now or datetime.now(timezone.utc)
    expires = datetime.fromisoformat(projection["derived_expires_at"])
    derived_allowed = (projection["fx"]["status"] in {"fresh", "stale"}
                       and instant <= expires)
    by_identity = {}
    for item in projection["items"]:
        identity = item["entity_type"], item["entity_key"], item["option_code"]
        by_identity.setdefault(identity, []).append(item)
    rows = []
    for code, recipe in RECIPES:
        components = []
        total, available = 0, True
        for identity, quantity in recipe:
            matches = by_identity.get(identity, [])
            amount = _exact_amount(matches)
            components.append({"entity_type": identity[0], "entity_key": identity[1],
                               "option_code": identity[2], "quantity": quantity,
                               "sku": matches[0]["sku"] if len(matches) == 1 else None})
            if amount is None:
                available = False
            else:
                total += amount * quantity
        convert = available and derived_allowed
        rows.append({
            "recipe_code": code, "components": components, "currency": "IDR",
            "show_price": available, "price_qualifier": "EXACT" if available else "CONTACT",
            "unavailable_reason": None if available else "COMPONENT_UNAVAILABLE",
            "amount_idr": str(total) if available else None,
            "display_usd_approx": str(idr_to_usd_approx(total, projection["fx"]["ask_idr_per_usdt"])) if convert else None,
            "display_usdt": str(idr_to_usdt(total, projection["fx"]["ask_idr_per_usdt"])) if convert else None,
            "projection_id": projection["projection_id"],
            "publication_version": projection["publication_version"],
            "catalog_version": projection["catalog_version"],
            "fx_version": projection["fx"]["version"],
            "fx_status": projection["fx"]["status"],
            "derived_expires_at": projection["derived_expires_at"],
            "formula_version": projection["formula_version"],
            "display_usd_approx_formula_version": projection["display_usd_approx_formula_version"],
        })
    return rows


def with_catalog_compositions(projection, *, now=None):
    """Shared enrichment for the HTTP projection and strict publication preflight."""
    return {**projection, "compositions": catalog_compositions(projection, now=now)}
