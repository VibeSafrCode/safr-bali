"""Scoped Founder 2026-10-04 publication. Defaults to dry-run; never seeds prices.

Run the dry-run first with --projection-url. Review its catalog_hash and version,
then explicitly supply both and --actor-user-id with --apply. A publication/FX
race aborts; repeat the preflight rather than weakening the version check.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import re
import sys
import time


OPERATION_KEY = "founder-2026-10-04-visa-extension-prices-v1"
ALLOWED_PROJECTIONS = {
    "https://safrway.online/api/catalog/pricing",
    "http://localhost:8000/api/catalog/pricing",
    "http://127.0.0.1:8000/api/catalog/pricing",
}
APPROVED_SKUS = {"service:visa-extension:c1-extension", "service:visa-extension:voa-extension"}
INSERT_TABLES = {"price_catalog_versions", "price_catalog_items", "catalog_publications",
                 "admin_actions", "catalog_publication_pointer"}


class SafetyError(Exception):
    """Only fixed, non-sensitive error codes may be placed in this exception."""


def catalog_hash(items):
    canonical = sorted(items, key=lambda item: item["sku"])
    return hashlib.sha256(json.dumps(canonical, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode()).hexdigest()


def fetch_projection(url):
    if url not in ALLOWED_PROJECTIONS:
        raise SafetyError("projection_url_not_allowed")
    import httpx
    # No proxy environment, redirects, cookies, credentials, or unchecked hosts.
    with httpx.Client(timeout=httpx.Timeout(8, connect=3), follow_redirects=False, trust_env=False) as client:
        deadline = time.monotonic() + 10
        with client.stream("GET", url, headers={"Accept": "application/json", "Cache-Control": "no-cache"}) as response:
            if response.status_code != 200:
                raise SafetyError("served_projection_http_failure")
            body = bytearray()
            for part in response.iter_bytes():
                body.extend(part)
                if time.monotonic() > deadline:
                    raise SafetyError("served_projection_deadline_exceeded")
                if len(body) > 2_000_000:
                    raise SafetyError("served_projection_too_large")
    return json.loads(body)


@contextmanager
def sql_write_boundary(db, *, apply):
    """Connection-local SQL allow-list; dry-run permits no writes at all."""
    from sqlalchemy import event
    db.bind.echo = False
    connection = db.connection()

    def guard(conn, cursor, statement, parameters, context, executemany):
        compiled = getattr(context, "compiled", None)
        clause = getattr(compiled, "statement", None)
        if clause is not None and getattr(clause, "is_select", False):
            return
        # Only the existing publisher's transaction lock is needed as textual SQL.
        if apply and clause is not None and getattr(clause, "text", "") == "SELECT pg_advisory_xact_lock(:key)":
            return
        table = getattr(getattr(clause, "table", None), "name", None)
        if apply and clause is not None:
            if getattr(clause, "is_insert", False) and table in INSERT_TABLES:
                return
            if getattr(clause, "is_update", False) and table == "catalog_publication_pointer":
                return
        raise SafetyError("sql_write_boundary_rejected")

    event.listen(connection, "before_cursor_execute", guard)
    try:
        yield
    finally:
        event.remove(connection, "before_cursor_execute", guard)


def _catalog_items(db, version_id):
    from app.models.catalog_pricing import PriceCatalogItem
    columns = [column.name for column in PriceCatalogItem.__table__.columns
               if column.name not in {"id", "catalog_version_id"}]
    return [{field: getattr(row, field) for field in columns}
            for row in db.query(PriceCatalogItem).filter_by(catalog_version_id=version_id)
            .order_by(PriceCatalogItem.id).all()]


def execute(db, args, *, root_telegram_id, projection_loader=fetch_projection, now=None):
    """Testable transaction entrypoint. Does not read env, print, or refresh FX."""
    from app.models.catalog_pricing import CatalogPublication, FxMarketSnapshot, PriceCatalogVersion
    from app.models.user import User
    from app.services.catalog_compositions import with_catalog_compositions
    from app.services.catalog_pricing import latest_publication, preview_catalog, projection_payload, publish_catalog
    from app.services.extension_pricing import merge_extension_items, prepare_extension_catalog

    if args.projection_url not in ALLOWED_PROJECTIONS:
        raise SafetyError("projection_url_not_allowed")
    if args.apply and (args.actor_user_id is None or args.expected_publication_version is None
                       or not re.fullmatch(r"[a-f0-9]{64}", args.expected_catalog_hash or "")):
        raise SafetyError("apply_requires_actor_hash_and_publication_version")
    if db.new or db.dirty or db.deleted:
        raise SafetyError("requires_clean_session")
    current_time = now or datetime.now(timezone.utc)
    with sql_write_boundary(db, apply=args.apply):
        current = latest_publication(db)
        if current is None:
            raise SafetyError("published_catalog_required")
        items = _catalog_items(db, current.catalog_version_id)
        before_hash = catalog_hash(items)
        local = with_catalog_compositions(projection_payload(db, now=current_time), now=current_time)
        served = projection_loader(args.projection_url)
        if served != local:
            raise SafetyError("served_projection_differs_from_database")
        if local["fx"]["status"] != "fresh":
            raise SafetyError("fresh_fx_required")
        actor_query = db.query(User).filter(User.telegram_id == root_telegram_id)
        if args.actor_user_id is not None:
            actor_query = actor_query.filter(User.id == args.actor_user_id)
        actor = actor_query.one_or_none()
        if not root_telegram_id or actor is None or actor.role != "admin" or actor.status != "active":
            raise SafetyError("configured_active_root_actor_required")
        reason = (f"Founder 2026-10-04 extension prices; base publication "
                  f"{args.expected_publication_version}; catalog SHA256 {args.expected_catalog_hash}")
        previous = db.query(PriceCatalogVersion).filter_by(idempotency_key=OPERATION_KEY).one_or_none()
        if args.apply and previous is not None:
            base = db.query(CatalogPublication).filter_by(version=args.expected_publication_version).one_or_none()
            if (current.catalog_version_id != previous.id or previous.reason != reason
                    or previous.created_by_admin_id != actor.id or base is None
                    or catalog_hash(_catalog_items(db, base.catalog_version_id)) != args.expected_catalog_hash):
                raise SafetyError("retry_conflicts_with_subsequent_edit_or_original_request")
            if catalog_hash(merge_extension_items(_catalog_items(db, base.catalog_version_id))) != before_hash:
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
        draft = prepare_extension_catalog(db, expected_publication_version=current.version)
        existing = {item["sku"]: item for item in items}
        added = {item["sku"] for item in draft["items"]} - set(existing)
        if added != APPROVED_SKUS or len(draft["items"]) != len(items) + 2:
            raise SafetyError("delta_must_add_exactly_two_new_rows")
        if any(item != existing[item["sku"]] for item in draft["items"] if item["sku"] in existing):
            raise SafetyError("existing_catalog_row_changed")
        fx = db.get(FxMarketSnapshot, current.fx_snapshot_id)
        preview_catalog(draft["items"], fx, now=current_time)
        result = {"mode": "DRY_RUN", "catalog_hash": before_hash, "item_count": len(items),
                  "expected_publication_version": current.version, "fx_version": fx.version,
                  "fx_fresh_until": local["fx"]["fresh_until"],
                  "next_catalog_hash": catalog_hash(draft["items"]), "added_skus": sorted(added),
                  "operation_key": OPERATION_KEY}
        if args.apply:
            publication = publish_catalog(db, **draft, effective_from=current_time, reason=reason,
                                          idempotency_key=OPERATION_KEY, actor_id=actor.id, now=now)
            result.update(mode="APPLIED", publication_version=publication.version,
                          catalog_version=db.get(PriceCatalogVersion, publication.catalog_version_id).version)
            db.commit()
        else:
            db.rollback()
        return result


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        raise SafetyError("invalid_arguments")


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
        # Import settings only within the sanitized error boundary.
        from app.core.config import settings
        from app.db.session import SessionLocal, engine
        engine.echo = False
        db = SessionLocal()
        result = execute(db, args, root_telegram_id=settings.DEFAULT_ADMIN_TELEGRAM_ID)
        print(json.dumps(result, sort_keys=True))
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
