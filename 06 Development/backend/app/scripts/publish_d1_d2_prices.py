"""D1/D2-only publication. Default read-only dry-run; explicit hash/version apply.

No migration, FX refresh, seed import, customer/order update or next-stage switch.
Use existing Admin rollback to restore the preceding immutable catalog if needed.
"""
import json
import re
import sys
from datetime import datetime, timezone

from app.scripts.publish_extension_prices import (
    ALLOWED_PROJECTIONS, JsonArgumentParser, SafetyError, _catalog_items,
    catalog_hash, fetch_projection, sql_write_boundary,
)

OPERATION_KEY = "founder-2026-10-05-d1-d2-prices-v1"


def execute(db, args, *, root_telegram_id, projection_loader=fetch_projection, now=None):
    from app.models.catalog_pricing import CatalogPublication, FxMarketSnapshot, PriceCatalogVersion
    from app.models.user import User
    from app.services.catalog_compositions import with_catalog_compositions
    from app.services.catalog_pricing import aware_utc, latest_publication, preview_catalog, projection_payload, publish_catalog
    from app.services.d1_d2_pricing import APPROVED_AMOUNTS, FIVE_YEAR_CODES, approved_extensions, merge_d1_d2_items, prepare_d1_d2_catalog

    if args.projection_url not in ALLOWED_PROJECTIONS:
        raise SafetyError("projection_url_not_allowed")
    if args.apply and (args.actor_user_id is None or args.expected_publication_version is None
                       or not re.fullmatch(r"[a-f0-9]{64}", args.expected_catalog_hash or "")):
        raise SafetyError("apply_requires_actor_hash_and_publication_version")
    if db.new or db.dirty or db.deleted:
        raise SafetyError("requires_clean_session")
    instant = now or datetime.now(timezone.utc)
    approve_contact = getattr(args, "approve_five_year_contact", False) is True
    with sql_write_boundary(db, apply=args.apply):
        current = latest_publication(db)
        if current is None:
            raise SafetyError("published_catalog_required")
        items = _catalog_items(db, current.catalog_version_id)
        before_hash = catalog_hash(items)
        local = with_catalog_compositions(projection_payload(db, now=instant), now=instant)
        if projection_loader(args.projection_url) != local:
            raise SafetyError("served_projection_differs_from_database")
        if local["fx"]["status"] != "fresh":
            raise SafetyError("fresh_fx_required")
        query = db.query(User).filter(User.telegram_id == root_telegram_id)
        if args.actor_user_id is not None:
            query = query.filter(User.id == args.actor_user_id)
        actor = query.one_or_none()
        if not root_telegram_id or actor is None or actor.role != "admin" or actor.status != "active":
            raise SafetyError("configured_active_root_actor_required")
        reason = (f"Founder 2026-10-05 D1/D2; base publication {args.expected_publication_version}; "
                  f"catalog SHA256 {args.expected_catalog_hash}; five-year CONTACT approval {approve_contact}")
        previous = db.query(PriceCatalogVersion).filter_by(idempotency_key=OPERATION_KEY).one_or_none()
        if args.apply and previous is not None:
            base = db.query(CatalogPublication).filter_by(version=args.expected_publication_version).one_or_none()
            if (current.catalog_version_id != previous.id or previous.reason != reason
                    or previous.created_by_admin_id != actor.id or base is None
                    or catalog_hash(_catalog_items(db, base.catalog_version_id)) != args.expected_catalog_hash):
                raise SafetyError("retry_conflicts_with_subsequent_edit_or_original_request")
            if catalog_hash(merge_d1_d2_items(_catalog_items(db, base.catalog_version_id),
                                            approve_five_year_contact=approve_contact)) != before_hash:
                raise SafetyError("retry_catalog_content_drift")
            result = {"mode": "ALREADY_APPLIED", "catalog_hash": before_hash,
                      "publication_version": current.version, "catalog_version": previous.version,
                      "fx_version": local["fx"]["version"], "operation_key": OPERATION_KEY}
            db.rollback()
            return result
        if args.expected_catalog_hash is not None and args.expected_catalog_hash != before_hash:
            raise SafetyError("catalog_hash_changed")
        if args.expected_publication_version is not None and args.expected_publication_version != current.version:
            raise SafetyError("publication_version_changed")
        draft = prepare_d1_d2_catalog(db, expected_publication_version=current.version,
                                     approve_five_year_contact=approve_contact)
        existing = {item["sku"]: item for item in items}
        approved_new = {item["sku"]: item for item in approved_extensions()}
        added = {item["sku"] for item in draft["items"]} - set(existing)
        if added != set(approved_new) or len(draft["items"]) != len(items) + 2:
            raise SafetyError("delta_must_add_exactly_two_new_rows")
        changed, contact_changes = [], []
        for item in draft["items"]:
            if item["sku"] not in existing:
                if item != approved_new[item["sku"]]:
                    raise SafetyError("unapproved_new_catalog_row")
                continue
            old = existing[item["sku"]]
            allowed = (item["entity_type"] == "VISA" and item["entity_key"] == "D1/D2"
                       and item["option_code"] in APPROVED_AMOUNTS)
            expected = {**old, "amount_idr": APPROVED_AMOUNTS[item["option_code"]]} if allowed else old
            if (approve_contact and item["entity_type"] == "VISA" and item["entity_key"] == "D1/D2"
                    and item["option_code"] in FIVE_YEAR_CODES):
                expected = {**old, "amount_idr": None, "price_qualifier": "CONTACT", "show_price": False}
                if item != old:
                    contact_changes.append(item["sku"])
            if item != expected:
                raise SafetyError("unapproved_catalog_field_changed")
            if item != old and allowed:
                changed.append(item["sku"])
        fx = db.get(FxMarketSnapshot, current.fx_snapshot_id)
        preview_catalog(draft["items"], fx, now=instant)
        result = {"mode": "DRY_RUN", "catalog_hash": before_hash, "item_count": len(items),
                  "expected_publication_version": current.version, "fx_version": fx.version,
                  "fx_fresh_until": local["fx"]["fresh_until"], "next_catalog_hash": catalog_hash(draft["items"]),
                  "added_skus": sorted(added), "changed_amount_skus": sorted(changed),
                  "five_year_contact_skus": sorted(contact_changes), "operation_key": OPERATION_KEY}
        if args.apply:
            publication = publish_catalog(db, **draft, effective_from=instant, reason=reason,
                                          idempotency_key=OPERATION_KEY, actor_id=actor.id, now=now)
            # Production must not reuse the entry timestamp after network I/O or
            # advisory-lock waits. Recheck before commit while that lock is held.
            published_fx = db.get(FxMarketSnapshot, publication.fx_snapshot_id)
            commit_time = now or datetime.now(timezone.utc)
            if (published_fx is None or publication.fx_snapshot_id != fx.id
                    or aware_utc(commit_time) > aware_utc(published_fx.fresh_until)):
                db.rollback()
                raise SafetyError("fx_expired_or_changed_before_commit")
            result.update(mode="APPLIED", publication_version=publication.version,
                          catalog_version=db.get(PriceCatalogVersion, publication.catalog_version_id).version)
            db.commit()
        else:
            db.rollback()
        return result


def main(argv=None):
    db = None
    try:
        parser = JsonArgumentParser(description=__doc__)
        parser.add_argument("--projection-url", required=True, choices=sorted(ALLOWED_PROJECTIONS))
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--expected-catalog-hash")
        parser.add_argument("--expected-publication-version", type=int)
        parser.add_argument("--actor-user-id", type=int)
        parser.add_argument("--approve-five-year-contact", action="store_true",
                            help="Explicitly approve only the four known legacy five-year prices becoming CONTACT quotes")
        args = parser.parse_args(argv)
        from app.core.config import settings
        from app.db.session import SessionLocal, engine
        engine.echo = False
        db = SessionLocal()
        print(json.dumps(execute(db, args, root_telegram_id=settings.DEFAULT_ADMIN_TELEGRAM_ID), sort_keys=True))
        return 0
    except Exception as error:
        if db is not None:
            try:
                db.rollback()
            except Exception:
                pass
        print(json.dumps({"mode": "ABORTED", "error": str(error) if isinstance(error, SafetyError)
                          else "preflight_or_publication_failed", "error_type": type(error).__name__}, sort_keys=True))
        return 1
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
