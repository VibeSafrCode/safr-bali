"""ONE Founder-approved D12/E28A/E33G catalog publication; DRY_RUN by default.

Apply requires a configured active root actor, reviewed full-catalog SHA256 and
exact publication version. No seed, migration, FX refresh, business service,
VisaType, customer/order, historical catalog or separate D12 intermediary write.
Rollback is a separate audited restore_catalog of before_catalog_version with
the latest expected publication version; never restore the production database.
"""
import json
import re
import sys
from datetime import datetime, timezone

from app.scripts.publish_extension_prices import (
    ALLOWED_PROJECTIONS, JsonArgumentParser, SafetyError, _catalog_items,
    catalog_hash, fetch_projection, sql_write_boundary,
)


OPERATION_KEY = "founder-2026-10-09-d12-e28a-e33g-prices-v1"


def execute(db, args, *, root_telegram_id, projection_loader=fetch_projection, now=None):
    from app.models.catalog_pricing import CatalogPublication, FxMarketSnapshot, PriceCatalogVersion
    from app.models.user import User
    from app.services.catalog_compositions import with_catalog_compositions
    from app.services.catalog_pricing import aware_utc, latest_publication, preview_catalog, projection_payload, publish_catalog
    from app.services.d12_e28a_pricing import APPROVED_AMOUNTS, APPROVED_LABELS, approved_additions
    from app.services.d12_e28a_e33g_pricing import (
        E33G_INITIAL_AMOUNTS, approved_e33g_items, merge_d12_e28a_e33g_items, prepare_d12_e28a_e33g_catalog,
    )

    if args.projection_url not in ALLOWED_PROJECTIONS:
        raise SafetyError("projection_url_not_allowed")
    if args.apply and (type(args.actor_user_id) is not int or args.actor_user_id < 1
                       or type(args.expected_publication_version) is not int or args.expected_publication_version < 1
                       or not re.fullmatch(r"[a-f0-9]{64}", args.expected_catalog_hash or "")):
        raise SafetyError("apply_requires_actor_hash_and_publication_version")
    if db.new or db.dirty or db.deleted:
        raise SafetyError("requires_clean_session")
    instant = now or datetime.now(timezone.utc)
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
        reason = (f"Founder 2026-10-09 D12/E28A/E33G; base publication {args.expected_publication_version}; "
                  f"catalog SHA256 {args.expected_catalog_hash}")
        previous = db.query(PriceCatalogVersion).filter_by(idempotency_key=OPERATION_KEY).one_or_none()
        if args.apply and previous is not None:
            base = db.query(CatalogPublication).filter_by(version=args.expected_publication_version).one_or_none()
            if (current.catalog_version_id != previous.id or previous.reason != reason
                    or previous.created_by_admin_id != actor.id or base is None
                    or catalog_hash(_catalog_items(db, base.catalog_version_id)) != args.expected_catalog_hash):
                raise SafetyError("retry_conflicts_with_subsequent_edit_or_original_request")
            if catalog_hash(merge_d12_e28a_e33g_items(_catalog_items(db, base.catalog_version_id))) != before_hash:
                raise SafetyError("retry_catalog_content_drift")
            result = {"mode": "ALREADY_APPLIED", "catalog_hash": before_hash,
                      "before_catalog_version": db.get(PriceCatalogVersion, base.catalog_version_id).version,
                      "publication_version": current.version, "catalog_version": previous.version,
                      "fx_version": local["fx"]["version"], "operation_key": OPERATION_KEY,
                      "approved_exact_tuple_count": 14, "approved_contact_tuple_count": 1}
            db.rollback()
            return result
        if args.expected_catalog_hash is not None and args.expected_catalog_hash != before_hash:
            raise SafetyError("catalog_hash_changed")
        if args.expected_publication_version is not None and args.expected_publication_version != current.version:
            raise SafetyError("publication_version_changed")
        draft = prepare_d12_e28a_e33g_catalog(db, expected_publication_version=current.version)
        existing = {item["sku"]: item for item in items}
        approved_new = {item["sku"]: item for item in approved_additions() + approved_e33g_items()}
        expected_added = set(approved_new) - set(existing)
        draft_skus = [item["sku"] for item in draft["items"]]
        if (len(draft_skus) != len(set(draft_skus)) or set(draft_skus) != set(existing) | expected_added
                or len(draft_skus) != len(items) + len(expected_added)):
            raise SafetyError("delta_must_preserve_full_catalog_and_only_nine_approved_additions")
        changed, changed_labels = [], []
        for item in draft["items"]:
            if item["sku"] not in existing:
                if item != approved_new[item["sku"]]:
                    raise SafetyError("unapproved_new_catalog_row")
                continue
            old = existing[item["sku"]]
            allowed = (old["entity_type"] == "VISA" and old["entity_key"] == "D12"
                       and old["option_code"] in APPROVED_AMOUNTS)
            expected = ({**old, "amount_idr": APPROVED_AMOUNTS[old["option_code"]],
                         "label_ru": APPROVED_LABELS[old["option_code"]][0],
                         "label_en": APPROVED_LABELS[old["option_code"]][1]} if allowed else old)
            if item != expected:
                raise SafetyError("unapproved_catalog_field_changed")
            if item["amount_idr"] != old["amount_idr"]:
                changed.append(item["sku"])
            if (item["label_ru"], item["label_en"]) != (old["label_ru"], old["label_en"]):
                changed_labels.append(item["sku"])
        # Independent post-planner preservation/approval checks, including every
        # field of the two initial options and the conditional Bridging notes.
        exact_contract = {(item["entity_type"], item["entity_key"], item["option_code"]): item["amount_idr"]
                          for item in approved_new.values() if item["price_qualifier"] == "EXACT"}
        exact_contract.update({("VISA", "D12", code): amount for code, amount in APPROVED_AMOUNTS.items()})
        exact_contract.update({("VISA", "E33G", code): amount for code, amount in E33G_INITIAL_AMOUNTS.items()})
        if len(exact_contract) != 14:
            raise SafetyError("fourteen_approved_exact_tuples_required")
        for identity, amount in exact_contract.items():
            rows = [item for item in draft["items"] if (item["entity_type"], item["entity_key"], item["option_code"]) == identity]
            if (len(rows) != 1 or rows[0]["amount_idr"] != amount or rows[0]["price_qualifier"] != "EXACT"
                    or rows[0]["fee_verification_status"] != "VERIFIED" or rows[0]["show_price"] is not True):
                raise SafetyError("fourteen_approved_exact_verified_prices_required")
        for approved in approved_new.values():
            rows = [item for item in draft["items"] if (item["entity_type"], item["entity_key"], item["option_code"]) ==
                    (approved["entity_type"], approved["entity_key"], approved["option_code"])]
            if len(rows) != 1 or any(rows[0].get(key) != value for key, value in approved.items()):
                raise SafetyError("approved_option_fields_or_conditional_notes_changed")
        fx = db.get(FxMarketSnapshot, current.fx_snapshot_id)
        preview_catalog(draft["items"], fx, now=instant)
        result = {"mode": "DRY_RUN", "catalog_hash": before_hash, "item_count": len(items),
                  "before_catalog_version": db.get(PriceCatalogVersion, current.catalog_version_id).version,
                  "expected_publication_version": current.version, "fx_version": fx.version,
                  "fx_fresh_until": local["fx"]["fresh_until"], "next_catalog_hash": catalog_hash(draft["items"]),
                  "added_skus": sorted(expected_added), "changed_amount_skus": sorted(changed),
                  "changed_label_skus": sorted(changed_labels), "preserved_e33g_initial": E33G_INITIAL_AMOUNTS,
                  "approved_exact_tuple_count": 14, "approved_contact_tuple_count": 1,
                  "operation_key": OPERATION_KEY}
        if args.apply:
            publication = publish_catalog(db, **draft, effective_from=instant, reason=reason,
                                          idempotency_key=OPERATION_KEY, actor_id=actor.id, now=now)
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
        args = parser.parse_args(argv)
        from app.core.config import settings
        from app.db.session import SessionLocal, engine
        engine.echo = False
        db = SessionLocal()
        print(json.dumps(execute(db, args, root_telegram_id=settings.DEFAULT_ADMIN_TELEGRAM_ID), sort_keys=True))
        return 0
    except Exception as error:
        if db is not None:
            try: db.rollback()
            except Exception: pass
        print(json.dumps({"mode": "ABORTED", "error": str(error) if isinstance(error, SafetyError)
                          else "preflight_or_publication_failed", "error_type": type(error).__name__}, sort_keys=True))
        return 1
    finally:
        if db is not None:
            try: db.close()
            except Exception: pass


if __name__ == "__main__":
    sys.exit(main())
